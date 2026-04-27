"""
Slice the overhead-view cop car sprite sheet into 16 individual PNGs.

Source: /run/concept/cop_car_transparent.png  (4x4 grid, alpha=0 bg)
  Row 1 (frames 1-4): static, light bar variants alternating R/B
  Rows 2-3 (5-12): with motion-blur trails (for the cross-traffic
                    obstacle going at speed)
  Row 4 (13-16): static, more light variants

Output: /run/img/sprites/cop-overhead-01.png .. cop-overhead-16.png

The overhead view is what we use for the new side-spawning cross-
traffic obstacle (cars driving across the screen perpendicular to
Mike's run direction). Top-down perspective avoids the bottom-shadow
problem the iso view has.
"""

from collections import deque
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "run" / "concept" / "cop_car_transparent.png"
DST_DIR = ROOT / "run" / "img" / "sprites"

COLS = 4
ROWS = 4


def keep_largest_blob(im: Image.Image, alpha_threshold: int = 30) -> Image.Image:
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


def trim_transparent(im: Image.Image) -> Image.Image:
    bbox = im.getbbox()
    return im.crop(bbox) if bbox else im


def main():
    if not SRC.exists():
        print(f"SRC missing: {SRC}")
        return
    sheet = Image.open(SRC).convert("RGBA")
    w, h = sheet.size
    cw = w // COLS
    ch = h // ROWS
    DST_DIR.mkdir(parents=True, exist_ok=True)
    idx = 1
    for row in range(ROWS):
        for col in range(COLS):
            box = (col * cw, row * ch, (col + 1) * cw, (row + 1) * ch)
            cell = sheet.crop(box).copy()
            cell = keep_largest_blob(cell)
            cell = trim_transparent(cell)
            name = f"cop-overhead-{idx:02d}.png"
            cell.save(DST_DIR / name, "PNG", optimize=True)
            print(f"wrote {name}  ({cell.size[0]}x{cell.size[1]})")
            idx += 1
    print("done.")


if __name__ == "__main__":
    main()
