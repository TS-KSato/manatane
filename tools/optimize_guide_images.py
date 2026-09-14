#!/usr/bin/env python3
"""
ガイド画像の軽量化スクリプト。

images/guides/ 配下の PNG を表示用に軽量化する:
  1. 縦横 960×960 px に縮小(Lanczos)。
  2. 256 色のパレット PNG に変換。
     - pngquant が使える場合: pngquant --quality=80-95 (Floyd-Steinberg ディザリング有効)
     - 使えない場合: Pillow の quantize(256 色、Floyd-Steinberg ディザリング)
  3. 変換後の画像で元ファイルを上書き(ファイル名・拡張子・場所は不変)。

使い方:
  python3 tools/optimize_guide_images.py                # images/guides/ の全 PNG を処理
  python3 tools/optimize_guide_images.py --dry-run      # 変換せず対象と現在サイズを表示
  python3 tools/optimize_guide_images.py a.png b.png    # 指定ファイルのみ処理
  python3 tools/optimize_guide_images.py --size 960     # 出力サイズ変更
  python3 tools/optimize_guide_images.py --threshold 300 # 警告するサイズ(KB)

画像を追加・差し替えした際は、対象ファイルを引数に渡して個別に実行すれば
既存画像を再圧縮せずに済む。既に 960×960 以下の画像は縮小せずそのまま量子化する。

必要環境: Python 3.8+, Pillow。pngquant は任意(あれば優先して使う)。
"""

import argparse
import os
import shutil
import subprocess
import sys
import tempfile

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    sys.stderr.write("Pillow が必要です: pip install Pillow\n")
    sys.exit(1)

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DIR = os.path.join(REPO_ROOT, "images", "guides")
DEFAULT_SIZE = 960
DEFAULT_THRESHOLD_KB = 300
PNGQUANT_QUALITY = "80-95"


def find_pngquant():
    return shutil.which("pngquant")


def load_as_truecolor(path):
    """パレット/グレースケール画像を RGB もしくは RGBA に展開する。"""
    im = Image.open(path)
    has_alpha = (
        im.mode in ("RGBA", "LA")
        or (im.mode == "P" and "transparency" in im.info)
    )
    return im.convert("RGBA" if has_alpha else "RGB")


def resize_square(im, size):
    """長辺が size を超える場合のみ Lanczos で縮小。既に小さければ変更しない。"""
    if max(im.size) <= size:
        return im
    return im.resize((size, size), Image.Resampling.LANCZOS)


def quantize_with_pngquant(pngquant, src, dst):
    """pngquant で 256 色に量子化。品質下限に届かない場合(exit 99)は下限なしで再試行。"""
    base = [pngquant, "--force", "--speed", "1", "--strip", "--output", dst]
    r = subprocess.run(base + ["--quality", PNGQUANT_QUALITY, src],
                       capture_output=True, text=True)
    if r.returncode == 99:
        r = subprocess.run(base + [src], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError("pngquant failed (%d): %s" % (r.returncode, r.stderr.strip()))


def quantize_with_pillow(im, dst):
    """Pillow で 256 色パレット化。libimagequant があればそれを、なければ MEDIANCUT。"""
    method = getattr(Image.Quantize, "LIBIMAGEQUANT", None)
    q = None
    if method is not None:
        try:
            q = im.quantize(colors=256, method=method, dither=Image.Dither.FLOYDSTEINBERG)
        except ValueError:
            q = None
    if q is None:
        q = im.quantize(colors=256, method=Image.Quantize.MEDIANCUT,
                        dither=Image.Dither.FLOYDSTEINBERG)
    q.save(dst, format="PNG", optimize=True)


def optimize_one(path, size, pngquant, dry_run=False):
    before = os.path.getsize(path)
    if dry_run:
        return before, before

    im = load_as_truecolor(path)
    im = resize_square(im, size)

    tmpdir = tempfile.mkdtemp(prefix="guideimg_")
    try:
        if pngquant:
            resized = os.path.join(tmpdir, "resized.png")
            im.save(resized, format="PNG")
            out = os.path.join(tmpdir, "out.png")
            quantize_with_pngquant(pngquant, resized, out)
        else:
            out = os.path.join(tmpdir, "out.png")
            quantize_with_pillow(im, out)
        shutil.move(out, path)
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)

    after = os.path.getsize(path)
    return before, after


def fmt_kb(n):
    return "%.1f" % (n / 1024.0)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="*",
                    help="処理する PNG(省略時は images/guides/ の全 PNG)")
    ap.add_argument("--dir", default=DEFAULT_DIR, help="対象ディレクトリ")
    ap.add_argument("--size", type=int, default=DEFAULT_SIZE, help="出力の一辺 px")
    ap.add_argument("--threshold", type=int, default=DEFAULT_THRESHOLD_KB,
                    help="この KB を超えた出力を警告する")
    ap.add_argument("--dry-run", action="store_true", help="変換せず一覧のみ表示")
    ap.add_argument("--no-pngquant", action="store_true", help="pngquant を使わず Pillow で量子化")
    args = ap.parse_args()

    if args.files:
        targets = [os.path.abspath(f) for f in args.files]
    else:
        targets = sorted(
            os.path.join(args.dir, f) for f in os.listdir(args.dir)
            if f.lower().endswith(".png")
        )
    if not targets:
        print("対象 PNG がありません:", args.dir)
        return 1

    pngquant = None if args.no_pngquant else find_pngquant()
    method = "pngquant %s" % pngquant if pngquant else "Pillow quantize"
    print("method: %s%s" % (method, " (dry-run)" if args.dry_run else ""))
    print("size: %dx%d, threshold: %d KB, files: %d" % (args.size, args.size,
                                                       args.threshold, len(targets)))
    print()

    rows = []
    total_before = total_after = 0
    for p in targets:
        try:
            before, after = optimize_one(p, args.size, pngquant, dry_run=args.dry_run)
        except Exception as e:  # noqa: BLE001
            print("ERROR %s: %s" % (os.path.basename(p), e))
            return 1
        rows.append((os.path.basename(p), before, after))
        total_before += before
        total_after += after

    name_w = max(len(r[0]) for r in rows)
    print("%-*s  %10s  %10s  %7s" % (name_w, "file", "before(KB)", "after(KB)", "ratio"))
    print("-" * (name_w + 34))
    over = []
    for name, b, a in rows:
        ratio = (a / b * 100.0) if b else 0.0
        flag = ""
        if a > args.threshold * 1024:
            flag = "  !"
            over.append((name, a))
        print("%-*s  %10s  %10s  %6.1f%%%s" % (name_w, name, fmt_kb(b), fmt_kb(a), ratio, flag))
    print("-" * (name_w + 34))
    print("%-*s  %10s  %10s  %6.1f%%" % (
        name_w, "TOTAL", fmt_kb(total_before), fmt_kb(total_after),
        (total_after / total_before * 100.0) if total_before else 0.0))
    print()
    if over:
        print("%d 件が %d KB を超えています:" % (len(over), args.threshold))
        for name, a in over:
            print("  - %s (%s KB)" % (name, fmt_kb(a)))
    else:
        print("全件 %d KB 以下です。" % args.threshold)
    return 0


if __name__ == "__main__":
    sys.exit(main())
