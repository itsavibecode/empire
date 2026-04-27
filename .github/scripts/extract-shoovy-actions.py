"""
Slice the Shoovy action sprite sheet into 24 individual PNG frames.

Source: /run/concept/shoovy-actions.png
        — 6 cols x 4 rows = 24 Shoovy poses on neon green background.

Layout (rough):
  Row 1: standing / idle variants (front-facing)
  Row 2: walking cycle (profile, side view)
  Row 3: gesturing / talking / hand-raised poses
  Row 4: specific actions (kneeling, holding camera, looking up,
         holding tablet, hand wave, shrug)

Output: /run/img/sprites/shoovy-action-XX.png  (01..24)

Pipeline: chroma-key the neon green bg first (same target as the
Shoovy + Adin + Ice cutscene extractions: rgb(7,223,33), tolerance
90, 30-px feather), then per-cell slice + blob-filter to drop any
inter-cell bleed.
"""

from collections import deque
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "run" / "concept" / "shoovy-actions.png"
DST_DIR = ROOT / "run" / "img" / "sprites"

COLS = 6
ROWS = 4
PREFIX = "shoovy-action-"

# The previous extractions used rgb(7, 223, 33) (ChatGPT's neon green).
# The Shoovy action sheet was Gemini-generated and uses rgb(152, 251, 0)
# instead — a different shade of green. Auto-detect from a corner pixel
# so this script doesn't need a hardcoded target per generator.
TARGET = None  # auto-detect from sheet corner
TOLERANCE = 90
FEATHER = 30


def detect_bg_color(im):
    """Sample the 4 corner pixels and pick the most common one as the
    background color. Works for any solid-color chroma-key bg without
    hardcoding the value per generator."""
    from collections import Counter
    px = im.load()
    w, h = im.size
    corners = [px[0, 0][:3], px[w-1, 0][:3], px[0, h-1][:3], px[w-1, h-1][:3]]
    return Counter(corners).most_common(1)[0][0]


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


def keep_largest_blob(im, alpha_threshold=30):
    w, h = im.size
    px = im.load()
    visited = [[False] * h for _ in range(w)]
    filled = [[False] * h for _ in range(w)]
    for x in range(w):
        for y in range(h):
            if px[x, y][3] >= alpha_threshold:
                filled[x][y] = True
    components = []
    for sx in range(w):
        for sy in range(h):
            if not filled[sx][sy] or visited[sx][sy]:
                continue
            comp = []
            q = deque([(sx, sy)])
            visited[sx][sy] = True
            while q:
                x, y = q.popleft()
                comp.append((x, y))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and filled[nx][ny] and not visited[nx][ny]:
                        visited[nx][ny] = True
                        q.append((nx, ny))
            components.append(comp)
    if not components:
        return im
    largest = max(components, key=len)
    keep = set(largest)
    for x in range(w):
        for y in range(h):
            if filled[x][y] and (x, y) not in keep:
                r, g, b, _ = px[x, y]
                px[x, y] = (r, g, b, 0)
    return im


def trim_transparent(im):
    bbox = im.getbbox()
    return im.crop(bbox) if bbox else im


def main():
    if not SRC.exists():
        print(f"SRC missing: {SRC}")
        return
    sheet = Image.open(SRC).convert("RGBA")
    bg = detect_bg_color(sheet)
    print(f"detected bg color: {bg}")
    # 1) Chroma-key the bg from the WHOLE sheet first so the inter-cell
    # gutters are transparent before per-cell crop.
    sheet = chroma_key(sheet, bg, TOLERANCE, FEATHER)
    w, h = sheet.size
    cw = w // COLS
    ch = h // ROWS
    DST_DIR.mkdir(parents=True, exist_ok=True)
    idx = 1
    for row in range(ROWS):
        for col in range(COLS):
            box = (col * cw, row * ch, (col + 1) * cw, (row + 1) * ch)
            cell = sheet.crop(box).copy()
            # Per-cell blob filter handles any neighbor bleed (e.g.,
            # if Shoovy's outstretched hand from one cell drifted into
            # another — should be rare since the cells have wide gutters).
            cell = keep_largest_blob(cell)
            cell = trim_transparent(cell)
            name = f"{PREFIX}{idx:02d}.png"
            cell.save(DST_DIR / name, "PNG", optimize=True)
            print(f"wrote {name}  ({cell.size[0]}x{cell.size[1]})")
            idx += 1
    print("done.")


if __name__ == "__main__":
    main()
