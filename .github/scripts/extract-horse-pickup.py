"""
Chroma-key the neon-green background out of horse_neon.png to get a
standalone horse sprite for the pickup icon. Source is /run/concept/
horse_neon.png; output is /run/img/sprites/horse-pickup.png.

Same chroma-key approach as extract-ice-cutscene.py — neon green target
~(7, 223, 33) with a generous tolerance. Horse coloring (browns + tan)
is far enough from green in RGB space to never collide.
"""

from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "run" / "concept" / "horse_neon.png"
DST = ROOT / "run" / "img" / "sprites" / "horse-pickup.png"

TARGET = (7, 223, 33)
TOLERANCE = 100   # generous — horse browns are ~(120, 70, 40), distance from green ~280
FEATHER = 35


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


def trim_transparent(im):
    bbox = im.getbbox()
    return im.crop(bbox) if bbox else im


def main():
    if not SRC.exists():
        print(f"SRC missing: {SRC}")
        return
    im = Image.open(SRC).convert("RGBA")
    print(f"input: {im.size}")
    keyed = chroma_key(im, TARGET, TOLERANCE, FEATHER)
    trimmed = trim_transparent(keyed)
    DST.parent.mkdir(parents=True, exist_ok=True)
    trimmed.save(DST, "PNG", optimize=True)
    print(f"wrote {DST.name}  ({trimmed.size[0]}x{trimmed.size[1]})")


if __name__ == "__main__":
    main()
