"""
Slice + chroma-key the Xena The Witch sprite sheets.

Sources (in /run/concept/):
  xena the witch - sprite (1).png   6 cols x 3 rows = 18 standing/posing frames
                                    -> xena-pose-01..18.png
  xena the witch - sprite (2).png   6 cols x 3 rows = 18 walk-cycle frames
                                    -> xena-walk-01..18.png

Both sheets use Gemini's neon-green chroma-key bg. Auto-detect the bg
color from the most-common corner pixels (different sheets may use
slightly different green shades — mirrors the Shoovy extractor).
"""

from collections import Counter, deque
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
DST_DIR = ROOT / "run" / "img" / "sprites"

# (filename, prefix, cols, rows, starting frame index)
SHEETS = [
    ("xena the witch - sprite (1).png", "xena-pose-", 6, 3, 1),
    ("xena the witch - sprite (2).png", "xena-walk-", 6, 3, 1),
]

TOLERANCE = 60
FEATHER = 18


def detect_bg_color(im):
    px = im.load()
    w, h = im.size
    corners = [px[0, 0][:3], px[w - 1, 0][:3], px[0, h - 1][:3], px[w - 1, h - 1][:3]]
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
    DST_DIR.mkdir(parents=True, exist_ok=True)
    for sheet_name, prefix, cols, rows, start_idx in SHEETS:
        src = ROOT / "run" / "concept" / sheet_name
        if not src.exists():
            print(f"SKIP missing: {sheet_name}")
            continue
        sheet = Image.open(src).convert("RGBA")
        bg = detect_bg_color(sheet)
        print(f"\n=== {sheet_name}  (bg: {bg}, {cols}x{rows} grid)")
        sheet = chroma_key(sheet, bg, TOLERANCE, FEATHER)
        w, h = sheet.size
        cw = w // cols
        ch = h // rows
        idx = start_idx
        for row in range(rows):
            for col in range(cols):
                box = (col * cw, row * ch, (col + 1) * cw, (row + 1) * ch)
                cell = sheet.crop(box).copy()
                cell = keep_largest_blob(cell)
                cell = trim_transparent(cell)
                name = f"{prefix}{idx:02d}.png"
                cell.save(DST_DIR / name, "PNG", optimize=True)
                print(f"wrote {name}  ({cell.size[0]}x{cell.size[1]})")
                idx += 1
    print("\ndone.")


if __name__ == "__main__":
    main()
