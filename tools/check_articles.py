#!/usr/bin/env python3
"""
読み物(content/articles/*.md + data/articles.json)の整合確認スクリプト。
外部通信は行わない。

検査項目:
  1. articles.json の各要素に必須キーが揃っている(article_id, title, theme, role,
     target_routes, verified_at, file)。値の形式も確認する。
  2. file が実在する。
  3. 本文中の内部リンク article:/guide:/route: の参照先が、それぞれ
     articles.json / guides.json / routes.json に存在する。
  4. role が "route" の読み物は、routes.json のいずれかの urls 要素から
     article:<id> で参照されている(target_routes に挙げたルートからの参照も確認)。
  5. すべての読み物が、いずれかのルートから article: リンクを辿って到達できる。
  6. 一本の読み物から出る内部リンクが 5 本を超える場合は注意(エラーにはしない)。

「編集メモ」で始まる見出しのセクションは画面に表示されないため、
リンク抽出の対象からも除外する(表示上の到達可能性と一致させるため)。

終了コード: エラーがあれば 1、注意のみ/問題なしは 0。
使い方: python3 tools/check_articles.py
"""

import json
import os
import re
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARTICLES_JSON = os.path.join(REPO_ROOT, "data", "articles.json")
GUIDES_JSON = os.path.join(REPO_ROOT, "data", "guides.json")
ROUTES_JSON = os.path.join(REPO_ROOT, "data", "routes.json")

REQUIRED_KEYS = ("article_id", "title", "theme", "role", "target_routes", "verified_at", "file")
ID_RE = re.compile(r"^[a-z0-9_]+$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
LINK_RE = re.compile(r"\[[^\]]*\]\((article|guide|route):([^)\s]+)\)")
# 画像記法 ![alt](path) 。path は content/articles/ を基点にした images/{article_id}/... の相対パスのみ許可
IMAGE_RE = re.compile(r"!\[[^\]]*\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")
IMAGE_PATH_RE = re.compile(r"^images/[A-Za-z0-9_\-]+/[A-Za-z0-9_\-]+\.(svg|png|jpg|jpeg|gif|webp)$", re.I)
# guide-image:{guide_id} はガイド画像 images/guides/{guide_id}.png を指す(無ければ placeholder.png)
GUIDE_IMAGE_RE = re.compile(r"^guide-image:([A-Za-z0-9_\-]+)$")
GUIDE_IMAGES_DIR = os.path.join(REPO_ROOT, "images", "guides")
HEADING_RE = re.compile(r"^(#{1,6})\s*(.*?)\s*#*\s*$")
MEMO_PREFIX = "編集メモ"
MAX_LINKS_NOTE = 5


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def strip_memo_sections(md):
    """「編集メモ」で始まる見出しから、次の同レベル以上の見出しまたは末尾までを除く。"""
    out, skip_level = [], None
    for line in md.splitlines():
        m = HEADING_RE.match(line)
        if m:
            level = len(m.group(1))
            if skip_level is not None and level <= skip_level:
                skip_level = None
            if skip_level is None and m.group(2).startswith(MEMO_PREFIX):
                skip_level = level
                continue
        if skip_level is None:
            out.append(line)
    return "\n".join(out)


def extract_links(md):
    return [(kind, target) for kind, target in LINK_RE.findall(strip_memo_sections(md))]


def main():
    errors, warnings, infos = [], [], []

    articles = load(ARTICLES_JSON)
    guides = load(GUIDES_JSON)
    routes = load(ROUTES_JSON)
    guide_ids = {g.get("guide_id") for g in guides}
    route_ids = {r.get("route_id") for r in routes}

    # 1. 必須キー・形式
    article_ids = set()
    for i, a in enumerate(articles):
        aid = a.get("article_id", "(index %d)" % i)
        missing = [k for k in REQUIRED_KEYS if k not in a]
        if missing:
            errors.append("%s: 必須キー欠落 %s" % (aid, ", ".join(missing)))
            continue
        if not ID_RE.match(a["article_id"]):
            errors.append("%s: article_id は半角英小文字・数字・アンダースコアのみ" % aid)
        if aid in article_ids:
            errors.append("%s: article_id が重複" % aid)
        article_ids.add(aid)
        if a["role"] not in ("route", "detour"):
            errors.append("%s: role は route か detour (現在: %r)" % (aid, a["role"]))
        if not isinstance(a["target_routes"], list):
            errors.append("%s: target_routes は配列" % aid)
        elif a["role"] == "route" and not a["target_routes"]:
            errors.append("%s: role=route なのに target_routes が空" % aid)
        elif a["role"] == "detour" and a["target_routes"]:
            errors.append("%s: role=detour なのに target_routes が空でない" % aid)
        else:
            for rid in a["target_routes"]:
                if rid not in route_ids:
                    errors.append("%s: target_routes の %s が routes.json に存在しない" % (aid, rid))
        if not DATE_RE.match(str(a["verified_at"])):
            errors.append("%s: verified_at は YYYY-MM-DD (現在: %r)" % (aid, a["verified_at"]))
        expected_file = "content/articles/%s.md" % a["article_id"]
        if a["file"] != expected_file:
            errors.append("%s: file は %s であるべき (現在: %s)" % (aid, expected_file, a["file"]))

    # 2. ファイル存在 + 本文読み込み
    bodies = {}
    for a in articles:
        aid = a.get("article_id")
        if not aid:
            continue
        path = os.path.join(REPO_ROOT, a.get("file", ""))
        if not os.path.isfile(path):
            errors.append("%s: 本文ファイルが存在しない: %s" % (aid, a.get("file")))
            continue
        with open(path, encoding="utf-8") as f:
            bodies[aid] = f.read()

    # 3. 内部リンクの参照先、画像ファイルの存在
    links_by_article = {}
    images_by_article = {}
    for aid, md in bodies.items():
        links = extract_links(md)
        links_by_article[aid] = links
        images = IMAGE_RE.findall(strip_memo_sections(md))
        images_by_article[aid] = images
        for src in images:
            gm = GUIDE_IMAGE_RE.match(src)
            if gm:
                gid = gm.group(1)
                if gid not in guide_ids:
                    errors.append("%s: guide-image:%s の guide_id が guides.json に存在しない" % (aid, gid))
                elif not os.path.isfile(os.path.join(GUIDE_IMAGES_DIR, gid + ".png")):
                    warnings.append("%s: images/guides/%s.png が無いため placeholder.png で表示される" % (aid, gid))
                continue
            if not IMAGE_PATH_RE.match(src):
                errors.append("%s: 画像パスが images/{article_id}/ 配下の相対パスか guide-image:{guide_id} でない: %s" % (aid, src))
            elif not os.path.isfile(os.path.join(REPO_ROOT, "content", "articles", src)):
                errors.append("%s: 画像ファイルが存在しない: content/articles/%s" % (aid, src))
        for kind, target in links:
            ok = {"article": target in article_ids,
                  "guide": target in guide_ids,
                  "route": target in route_ids}[kind]
            if not ok:
                errors.append("%s: リンク先 %s:%s が存在しない" % (aid, kind, target))
        internal = [t for k, t in links if k in ("article", "guide", "route")]
        if len(internal) > MAX_LINKS_NOTE:
            warnings.append("%s: 内部リンクが %d 本(目安 %d 本以内)" % (aid, len(internal), MAX_LINKS_NOTE))

    # 3b. どの本文からも参照されていない画像ファイル(注意)
    referenced_images = {s for lst in images_by_article.values() for s in lst if not GUIDE_IMAGE_RE.match(s)}
    images_root = os.path.join(REPO_ROOT, "content", "articles", "images")
    if os.path.isdir(images_root):
        for d in sorted(os.listdir(images_root)):
            ddir = os.path.join(images_root, d)
            if not os.path.isdir(ddir):
                continue
            for fn in sorted(os.listdir(ddir)):
                rel = "images/%s/%s" % (d, fn)
                if rel not in referenced_images:
                    warnings.append("content/articles/%s はどの本文からも参照されていない" % rel)

    # 4. routes.json からの参照
    referenced_from_routes = {}  # article_id -> [route_id]
    for r in routes:
        for u in r.get("urls") or []:
            if isinstance(u, dict) and u.get("type") == "internal":
                url = u.get("url", "")
                if url.startswith("article:"):
                    target = url[len("article:"):]
                    referenced_from_routes.setdefault(target, []).append(r["route_id"])
                    if target not in article_ids:
                        errors.append("routes.json %s: 参照先 %s が articles.json に存在しない" % (r["route_id"], url))
                    elif u.get("source") != "マナタネ":
                        warnings.append("routes.json %s: internal 要素の source が「マナタネ」でない (%r)" % (r["route_id"], u.get("source")))
                    idx = r["urls"].index(u)
                    if any(isinstance(x, dict) and x.get("type") != "internal" for x in r["urls"][:idx]):
                        warnings.append("routes.json %s: internal 要素が external 要素より後ろにある" % r["route_id"])
    for a in articles:
        aid = a.get("article_id")
        if a.get("role") == "route":
            refs = referenced_from_routes.get(aid, [])
            if not refs:
                errors.append("%s: role=route だが routes.json のどの urls からも参照されていない" % aid)
            else:
                for rid in a.get("target_routes", []):
                    if rid not in refs:
                        warnings.append("%s: target_routes の %s の urls から参照されていない" % (aid, rid))
                for rid in refs:
                    if rid not in a.get("target_routes", []):
                        warnings.append("%s: %s から参照されているが target_routes に含まれていない" % (aid, rid))

    # 5. 到達可能性(ルート → article: リンクを辿る)
    reachable, stack = set(), list(referenced_from_routes.keys() & article_ids)
    while stack:
        cur = stack.pop()
        if cur in reachable:
            continue
        reachable.add(cur)
        for kind, target in links_by_article.get(cur, []):
            if kind == "article" and target in article_ids and target not in reachable:
                stack.append(target)
    unreachable = sorted(article_ids - reachable)
    for aid in unreachable:
        errors.append("%s: どのルートからも article: リンクで到達できない" % aid)

    # 出力
    print("articles: %d, guides: %d, routes: %d" % (len(articles), len(guides), len(routes)))
    for a in articles:
        aid = a.get("article_id")
        links = links_by_article.get(aid, [])
        imgs = images_by_article.get(aid, [])
        print("  - %s [%s] links: %s | images: %s%s" % (
            aid, a.get("role"),
            ", ".join("%s:%s" % l for l in links) or "(なし)",
            ", ".join(s if GUIDE_IMAGE_RE.match(s) else os.path.basename(s) for s in imgs) or "(なし)",
            "  <- routes: %s" % ", ".join(referenced_from_routes.get(aid, [])) if referenced_from_routes.get(aid) else "",
        ))
    print()
    if errors:
        print("ERROR (%d)" % len(errors))
        for e in errors:
            print("  ✗ " + e)
    if warnings:
        print("NOTE (%d)" % len(warnings))
        for w in warnings:
            print("  ! " + w)
    if not errors and not warnings:
        print("OK: 問題なし")
    elif not errors:
        print("OK: エラーなし(注意 %d 件)" % len(warnings))
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
