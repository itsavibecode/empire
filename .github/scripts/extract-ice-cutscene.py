"""
Chroma-key the neon green background out of the three new Ice cutscene
panels and save them as transparent PNGs.

Source files (in /run/concept/, archived from the original ChatGPT
generation):
  ChatGPT Image Apr 26, 2026, 08_02_37 PM.png  -> cutscene-closed.png
  ChatGPT Image Apr 26, 2026, 08_04_28 PM.png  -> cutscene-mid.png
  ChatGPT Image Apr 26, 2026, 08_05_40 PM.png  -> cutscene-open.png

The bottom dialogue-box is a different (darker blue) color than Ice's
shirt so we don't have the bg-vs-shirt collision problem we hit with the
old all-blue source. Pure chroma-key on the green channel works cleanly.

Tolerance: 80 around target green. Edge softening via 1px feather to
avoid hard fringing.

This is a one-shot. Re-run only if the source art changes.
"""

from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
IMG_DIR = ROOT / "run" / "img"
SRC_DIR = ROOT / "run" / "concept"

SOURCES = [
    ("ChatGPT Image Apr 26, 2026, 08_02_37 PM.png", "cutscene-closed.png"),
    ("ChatGPT Image Apr 26, 2026, 08_04_28 PM.png", "cutscene-mid.png"),
    ("ChatGPT Image Apr 26, 2026, 08_05_40 PM.png", "cutscene-open.png"),
]

# Neon green target color. Sampled directly from source corners:
# (7, 223, 33). Pure saturated chroma-key green ChatGPT used.
TARGET = (7, 223, 33)
TOLERANCE = 90    # generous — Ice's blue shirt is far away in RGB space
FEATHER = 30      # pixels within FEATHER of the threshold get partial alpha


def chroma_key(im: Image.Image, target, tol, feather) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    tr, tg, tb = target
    # Plain euclidean distance — the target green is so saturated that
    # weighting any channel doesn't help. Ice's blue shirt sits at
    # ~(0, 60, 167), distance ~280 from target green — well outside the
    # 90-px chroma key radius.
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
                # Linear feather
                t = (d_sq - hard_sq) / (soft_sq - hard_sq)
                new_a = int(a * t)
                px[x, y] = (r, g, b, new_a)
    return im


def main():
    for src_name, dst_name in SOURCES:
        src = SRC_DIR / src_name
        dst = IMG_DIR / dst_name
        if not src.exists():
            print(f"SKIP missing: {src}")
            continue
        print(f"chroma-key  {src.name}  ->  {dst.name}")
        im = Image.open(src)
        keyed = chroma_key(im, TARGET, TOLERANCE, FEATHER)
        keyed.save(dst, "PNG", optimize=True)
    print("done.")


if __name__ == "__main__":
    main()
