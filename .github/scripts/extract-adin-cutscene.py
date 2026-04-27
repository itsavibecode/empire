"""
Chroma-key the neon green background out of the three Adin Ross
cutscene panels. Same pipeline as extract-ice-cutscene.py.

Source files (in /run/concept/):
  adin ross (1).png  closed mouth (smiling)        -> cutscene-adin-closed.png
  adin ross (3).png  mid (mouth slightly open)     -> cutscene-adin-mid.png
  adin ross (2).png  open (mouth wide, talking)    -> cutscene-adin-open.png

Note the file-to-frame mapping is intentional: source (2) is the most
open mouth pose despite being the middle filename — verified visually.

Adin's t-shirt is BLACK (~0,0,0) and his headphones are dark grey,
both far from the neon green target rgb(7,223,33), so the chroma-key
won't eat sprite interior. Tolerance 90 + 30-px feather matches the
Ice extraction.
"""

from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
IMG_DIR = ROOT / "run" / "img"
SRC_DIR = ROOT / "run" / "concept"

SOURCES = [
    ("adin ross (1).png", "cutscene-adin-closed.png"),
    ("adin ross (3).png", "cutscene-adin-mid.png"),
    ("adin ross (2).png", "cutscene-adin-open.png"),
]

TARGET = (7, 223, 33)
TOLERANCE = 90
FEATHER = 30


def chroma_key(im, target, tol, feather):
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
