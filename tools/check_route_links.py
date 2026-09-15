#!/usr/bin/env python3
"""
data/links.json に登録された全リンクの生存確認スクリプト。

データは変更せず、報告のみ行う。

処理:
  1. links.json の全要素(URL ごとに 1 件)を対象にし、routes.json の links 配列から
     どの route_id が参照しているか、そのリンクを外すとルートの links が 0 件になるかも記録する。
  2. 各 URL にブラウザ相当の User-Agent で HEAD → 拒否/失敗時は GET で再試行し、
     最終ステータスとリダイレクト後の到達先 URL を記録する。
  3. 次の 4 分類に判定する。
       正常   : 2xx で到達し、到達先が同じサービス内(同一の登録ドメイン)かつ
                トップページへ飛ばされていない
       要確認 : 2xx だが別ドメイン/トップページへリダイレクト、
                401/403/405/429 など機械的アクセス拒否の疑い、5xx、タイムアウト
       切れ   : 404/410、DNS 解決不可、接続拒否、SSL エラー
       遮断   : 実行環境のプロキシ/ネットワークポリシーで外部に出られない
                (リンク自体の状態ではないので別枠で報告)
  4. 「要確認」「切れ」「遮断」を表形式で出力し、正常件数と合計件数を示す。

使い方:
  python3 tools/check_route_links.py               # 要確認・切れのみ表示
  python3 tools/check_route_links.py --all         # 正常も含めて全件表示
  python3 tools/check_route_links.py --get         # 最初から GET(疑似 404 検出も行う)
  python3 tools/check_route_links.py --json out.json  # 生データを JSON にも保存
  python3 tools/check_route_links.py --workers 4 --timeout 20

必要環境: Python 3.8+, requests。HTTPS_PROXY 等の環境変数はそのまま尊重する。
"""

import argparse
import concurrent.futures
import json
import os
import re
import sys
import time
from urllib.parse import urlsplit

try:
    import requests
except ImportError:  # pragma: no cover
    sys.stderr.write("requests が必要です: pip install requests\n")
    sys.exit(1)

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROUTES_PATH = os.path.join(REPO_ROOT, "data", "routes.json")
LINKS_PATH = os.path.join(REPO_ROOT, "data", "links.json")

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)
HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
}

# HEAD がこの応答なら GET で再試行する
RETRY_WITH_GET = {400, 401, 403, 404, 405, 406, 429, 500, 501, 502, 503}
BOT_BLOCK_SUSPECT = {401, 403, 405, 406, 429}
SOFT_404_PATTERNS = re.compile(
    r"(ページが見つかりません|お探しのページは|見つかりませんでした|Not Found|404 )",
    re.IGNORECASE,
)

STATUS_OK = "正常"
STATUS_CHECK = "要確認"
STATUS_BROKEN = "切れ"
STATUS_BLOCKED = "遮断"


# ---------------------------------------------------------------- data ----
def collect_urls(routes, links):
    """URL -> {'refs': [{route_id, source, label, would_empty}, ...]} を返す(links.json の順)。"""
    by_id = {l["link_id"]: l for l in links if isinstance(l, dict) and l.get("link_id")}
    table = {}
    for l in links:
        if not isinstance(l, dict) or not l.get("url"):
            continue
        table.setdefault(l["url"], {"refs": []})
    for r in routes:
        ids = r.get("links") if isinstance(r.get("links"), list) else []
        for lid in ids:
            l = by_id.get(lid)
            if not l or not l.get("url"):
                continue
            table[l["url"]]["refs"].append({
                "route_id": r.get("route_id", ""),
                "source": l.get("source", ""),
                "label": l.get("label", ""),
                "would_empty": len(ids) <= 1,
            })
    for l in links:
        if isinstance(l, dict) and l.get("url") and not table[l["url"]]["refs"]:
            table[l["url"]]["refs"].append({"route_id": "(未参照)", "source": l.get("source", ""),
                                             "label": l.get("label", ""), "would_empty": False})
    return table


# ------------------------------------------------------------- helpers ----
def registered_domain(netloc):
    """雑な eTLD+1 判定。例: www.mext.go.jp -> mext.go.jp, note.com -> note.com"""
    host = netloc.lower().split("@")[-1].split(":")[0]
    parts = host.split(".")
    if len(parts) <= 2:
        return host
    # .co.jp / .go.jp / .ac.jp / .or.jp / .ne.jp などの二段 TLD
    if parts[-1] in ("jp", "uk", "au", "nz") and parts[-2] in (
        "co", "go", "ac", "or", "ne", "gr", "ed", "lg", "com", "org", "net", "gov"
    ):
        return ".".join(parts[-3:])
    return ".".join(parts[-2:])


def is_top_page(url):
    p = urlsplit(url)
    path = p.path.rstrip("/")
    return path == "" and not p.query


def classify(orig_url, result):
    """result(dict) から判定文字列を返す。"""
    err = result.get("error_kind")
    if err == "proxy_denied":
        return STATUS_BLOCKED
    if err in ("dns", "connection", "ssl"):
        return STATUS_BROKEN
    if err == "timeout":
        return STATUS_CHECK
    if err:  # その他の例外
        return STATUS_CHECK

    code = result.get("status")
    final = result.get("final_url") or orig_url
    if code is None:
        return STATUS_CHECK
    if code in (404, 410):
        return STATUS_BROKEN
    if code in BOT_BLOCK_SUSPECT or 500 <= code < 600:
        return STATUS_CHECK
    if 200 <= code < 300:
        if result.get("soft_404"):
            return STATUS_CHECK
        if registered_domain(urlsplit(orig_url).netloc) != registered_domain(urlsplit(final).netloc):
            return STATUS_CHECK
        if not is_top_page(orig_url) and is_top_page(final):
            return STATUS_CHECK
        return STATUS_OK
    # 3xx が残る(追跡上限など)や 4xx のその他
    return STATUS_CHECK


def error_kind(exc):
    msg = str(exc)
    if isinstance(exc, requests.exceptions.ProxyError) or "CONNECT tunnel failed" in msg \
            or "Tunnel connection failed" in msg or "407" in msg:
        return "proxy_denied"
    if isinstance(exc, requests.exceptions.SSLError):
        return "ssl"
    if isinstance(exc, (requests.exceptions.ConnectTimeout, requests.exceptions.ReadTimeout,
                        requests.exceptions.Timeout)):
        return "timeout"
    if isinstance(exc, requests.exceptions.ConnectionError):
        low = msg.lower()
        if "name or service not known" in low or "nodename nor servname" in low \
                or "getaddrinfo" in low or "no address associated" in low:
            return "dns"
        return "connection"
    return "other"


# --------------------------------------------------------------- fetch ----
def fetch_one(url, timeout, force_get):
    sess = requests.Session()
    sess.headers.update(HEADERS)
    result = {"url": url, "method": None, "status": None, "final_url": None,
              "error": None, "error_kind": None, "soft_404": False, "elapsed": 0.0}
    t0 = time.time()

    def do(method):
        r = sess.request(method, url, allow_redirects=True, timeout=timeout,
                         stream=(method == "GET"))
        result["method"] = method
        result["status"] = r.status_code
        result["final_url"] = r.url
        if method == "GET":
            try:
                ctype = r.headers.get("Content-Type", "")
                if "html" in ctype:
                    body = r.raw.read(65536, decode_content=True)
                    text = body.decode(r.encoding or "utf-8", errors="ignore")
                    m = re.search(r"<title[^>]*>(.*?)</title>", text, re.I | re.S)
                    title = (m.group(1) if m else "")[:200]
                    result["title"] = re.sub(r"\s+", " ", title).strip()
                    if 200 <= r.status_code < 300 and SOFT_404_PATTERNS.search(title):
                        result["soft_404"] = True
            finally:
                r.close()
        return r.status_code

    try:
        if force_get:
            do("GET")
        else:
            code = do("HEAD")
            if code in RETRY_WITH_GET:
                do("GET")
    except requests.exceptions.RequestException as e:
        # HEAD で例外 → GET でも一度試す(HEAD 非対応サーバ対策)
        if result["method"] != "GET" and error_kind(e) not in ("proxy_denied", "dns"):
            try:
                do("GET")
            except requests.exceptions.RequestException as e2:
                result["error"] = str(e2)[:300]
                result["error_kind"] = error_kind(e2)
        else:
            result["error"] = str(e)[:300]
            result["error_kind"] = error_kind(e)
    result["elapsed"] = round(time.time() - t0, 2)
    return result


# -------------------------------------------------------------- report ----
def print_table(rows, title):
    print("### %s(%d件)" % (title, len(rows)))
    print()
    if not rows:
        print("なし")
        print()
        return
    print("| route_id | source | label | 元URL | 到達先URL | ステータス | 削除で0件 |")
    print("|---|---|---|---|---|---|---|")
    for row in rows:
        print("| %s | %s | %s | %s | %s | %s | %s |" % (
            row["route_id"], row["source"], row["label"],
            row["url"], row["final_url"] or "-", row["status_text"],
            "**要注意**" if row["would_empty"] else "",
        ))
    print()


def status_text(res):
    if res.get("error_kind"):
        base = {"proxy_denied": "プロキシ拒否(環境)", "dns": "DNS解決不可",
                "connection": "接続不能", "ssl": "SSLエラー", "timeout": "タイムアウト"}
        return base.get(res["error_kind"], "エラー") + " " + (res.get("error") or "")[:80]
    s = "%s %s" % (res.get("status"), res.get("method"))
    if res.get("soft_404"):
        s += " (疑似404: %s)" % res.get("title", "")
    return s


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--routes", default=ROUTES_PATH)
    ap.add_argument("--links", default=LINKS_PATH)
    ap.add_argument("--timeout", type=float, default=20.0)
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--get", action="store_true", help="最初から GET を使う")
    ap.add_argument("--all", action="store_true", help="正常も含めて全件表示")
    ap.add_argument("--json", help="生データを保存する JSON パス")
    args = ap.parse_args()

    with open(args.routes, encoding="utf-8") as f:
        routes = json.load(f)
    with open(args.links, encoding="utf-8") as f:
        links = json.load(f)
    table = collect_urls(routes, links)
    urls = list(table.keys())
    print("routes: %d, links.json: %d, link refs: %d, unique urls: %d" % (
        len(routes), len(links), sum(len(r.get("links") or []) for r in routes), len(urls)))
    print("timeout=%ss workers=%d method=%s" % (args.timeout, args.workers,
                                                 "GET" if args.get else "HEAD→GET"))
    print()

    results = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = {ex.submit(fetch_one, u, args.timeout, args.get): u for u in urls}
        done = 0
        for fut in concurrent.futures.as_completed(futs):
            u = futs[fut]
            results[u] = fut.result()
            done += 1
            sys.stderr.write("\r%d/%d" % (done, len(urls)))
    sys.stderr.write("\n\n")

    buckets = {STATUS_OK: [], STATUS_CHECK: [], STATUS_BROKEN: [], STATUS_BLOCKED: []}
    for u in urls:
        res = results[u]
        verdict = classify(u, res)
        res["verdict"] = verdict
        for ref in table[u]["refs"]:
            buckets[verdict].append({
                **ref, "url": u, "final_url": res.get("final_url"),
                "status_text": status_text(res),
            })

    if args.all:
        print_table(buckets[STATUS_OK], STATUS_OK)
    print_table(buckets[STATUS_CHECK], STATUS_CHECK)
    print_table(buckets[STATUS_BROKEN], STATUS_BROKEN)
    if buckets[STATUS_BLOCKED]:
        print_table(buckets[STATUS_BLOCKED], STATUS_BLOCKED + "(実行環境から到達不可・リンク状態は未判定)")

    counts = {k: len({r["url"] for r in v}) for k, v in buckets.items()}
    print("### 集計(ユニークURL単位)")
    print()
    print("| 判定 | 件数 |")
    print("|---|---|")
    for k in (STATUS_OK, STATUS_CHECK, STATUS_BROKEN, STATUS_BLOCKED):
        print("| %s | %d |" % (k, counts[k]))
    print("| 合計 | %d |" % len(urls))

    if args.json:
        with open(args.json, "w", encoding="utf-8") as f:
            json.dump({"checked_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
                       "results": [{**results[u], "refs": table[u]["refs"]} for u in urls]},
                      f, ensure_ascii=False, indent=2)
        print("\nJSON: %s" % args.json)

    return 0


if __name__ == "__main__":
    sys.exit(main())
