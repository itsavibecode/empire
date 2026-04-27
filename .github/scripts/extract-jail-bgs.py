"""
Process the jail-related backgrounds:

  1. mikes_busted_jail-open.png  -> /run/img/jail-bg-open.png
  2. mikes_busted_jail-closed.png -> /run/img/jail-bg-closed.png
     (full scenes, no chroma-key — Mike + Xena in cell, eyes
      open vs closed for the BUSTED-screen blink loop)

  3. Three Xena dialogue panels — chroma-key the neon-green out so
     the existing chile-runner bg can show through, matching the
     pattern used by /run/img/cutscene-mike-*.png:
       xenathewitch - dialogue mouth closed eyes open.png
         -> /run/img/cutscene-xena-closed.png
       xenathewitch - dialogue mouth open eyes open.png
         -> /run/img/cutscene-xena-mid.png
       xenathewitch - dialogue mouth open eyes closed (1).png
         -> /run/img/cutscene-xena-open.png

The dialogue images include a dark blue/brown dialogue box at the
bottom — must be preserved (NOT chroma-keyed) since the existing
cutscene UI overlays its own text on top.
"""

from collections import Counter, deque
from pathlib import Path
from PIL import Image
import shutil

ROOT = Path(__file__).resolve().parents[2]
SRC_DIR = ROOT / "run" / "concept"
DST_DIR = ROOT / "run" / "img"

# (src filename, dst filename) — copied as-is, no chroma-key. These
# are full scenes (BUSTED-screen jail bg, both eye states).
COPY_AS_IS = [
    ("mikes_busted_jail-open.png",   "jail-bg-open.png"),
    ("mikes_busted_jail-closed.png", "jail-bg-closed.png"),
]

# (src filename, dst filename) — chroma-key the bg out before save
KEY_GREEN = [
    ("xenathewitch - dialogue mouth closed eyes open.png",      "cutscene-xena-closed.png"),
    ("xenathewitch - dialogue mouth open eyes open.png",        "cutscene-xena-mid.png"),
    ("xenathewitch - dialogue mouth open eyes closed (1).png",  "cutscene-xena-open.png"),
]

TOLERANCE = 60
FEATHER = 18


def detect_bg_color(im):
    px = im.load()
    w, h = im.size
    corners = [px[0, 0][:3], px[w - 1, 0][:3], px[0, h - 1][:3], px[w - 1, h - 1][:3]]
    return Counter(corners).most_common(1)[0][0]


def chroma_key(im, target, tol, feather):
    """Full-image chroma-key. The dialogue box at the bottom of the
    Xena panels is dark blue/brown — no overlap with the neon-green
    bg color, so a full-frame key safely removes the green strip
    sitting between Xena and the box without touching the box itself."""
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    tr, tg, tb = target
    hard_sq = tol * tol
    soft_sq = (tol + feather) * (tol + feather)
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            dr = r - tr
            dg = g - tg
            db = b - tb
            d_sq = dr * dr + dg * dg + db * db
            if d_sq <= hard_sq:
                px[x, y] = (r, g, b, 0)
            elif d_sq <= soft_sq:
                t = (d_sq - hard_sq) / (soft_sq - hard_sq)
                new_a = int(a * t)
                px[x, y] = (r, g, b, new_a)
    return im


def main():
    DST_DIR.mkdir(parents=True, exist_ok=True)

    for src_name, dst_name in COPY_AS_IS:
        src = SRC_DIR / src_name
        if not src.exists():
            print(f"SKIP missing: {src_name}")
            continue
        dst = DST_DIR / dst_name
        shutil.copy2(src, dst)
        print(f"copied {src_name} -> {dst_name}")

    for src_name, dst_name in KEY_GREEN:
        src = SRC_DIR / src_name
        if not src.exists():
            print(f"SKIP missing: {src_name}")
            continue
        im = Image.open(src).convert("RGBA")
        bg = detect_bg_color(im)
        print(f"\n=== {src_name}  (bg: {bg})")
        im = chroma_key(im, bg, TOLERANCE, FEATHER)
        im.save(DST_DIR / dst_name, "PNG", optimize=True)
        print(f"wrote {dst_name}  ({im.size[0]}x{im.size[1]})")

    print("\ndone.")


if __name__ == "__main__":
    main()
