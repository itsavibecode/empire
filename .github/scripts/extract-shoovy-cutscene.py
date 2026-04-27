"""
Chroma-key the neon green background out of the four Shoovy cutscene
panels. Same pipeline as extract-ice-cutscene.py / extract-adin-cutscene.py.

Source files (in /run/concept/):
  Gemini_Generated_Image_66r6da66r6da66r6.png  closed mouth, eyes open  -> cutscene-shoovy-closed.png
  Gemini_Generated_Image_5dqfs5dqfs5dqfs5.png  mid (mouth subtly open)  -> cutscene-shoovy-mid.png
  Gemini_Generated_Image_4paeo04paeo04pae.png  open mouth (talking)     -> cutscene-shoovy-open.png
  Gemini_Generated_Image_l8r26ll8r26ll8r2.png  EYES CLOSED (blink)      -> cutscene-shoovy-blink.png

The standard 3-mouth-state cycle (closed/mid/open) uses the first
three; the 4th (blink) is a bonus frame for future eye-blink animation
support — saved alongside in case we wire it in later. The mid panel
is intentionally subtle since Shoovy's expressions are restrained.

Shoovy wears a grey hoodie, so the chroma-key target rgb(7,223,33) is
far from his palette — no risk of eating sprite interior. Same
tolerance 90 + 30-px feather as the other speaker extractions.
"""

from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
IMG_DIR = ROOT / "run" / "img"
SRC_DIR = ROOT / "run" / "concept"

SOURCES = [
    ("Gemini_Generated_Image_66r6da66r6da66r6.png", "cutscene-shoovy-closed.png"),
    ("Gemini_Generated_Image_5dqfs5dqfs5dqfs5.png", "cutscene-shoovy-mid.png"),
    ("Gemini_Generated_Image_4paeo04paeo04pae.png", "cutscene-shoovy-open.png"),
    ("Gemini_Generated_Image_l8r26ll8r26ll8r2.png", "cutscene-shoovy-blink.png"),
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
