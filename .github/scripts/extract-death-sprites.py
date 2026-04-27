"""
Slice the Mike-death sprite sheet into individual PNGs for the
game-over screen. Source is a 3x4 grid (3 columns × 4 rows = 12 cells)
with the alpha already keyed out — so this is just splice + trim +
keep-largest-blob-per-cell to drop any neighboring-cell bleed.

Source: /run/concept/ChatGPT Image Apr 26, 2026, 10_26_02 PM.png
        (1024 x 1536, alpha=0 background)

Outputs:
  /run/img/sprites/mike-death-01.png  bullet-chest (sniped)
  /run/img/sprites/mike-death-02.png  bullet-stomach
  /run/img/sprites/mike-death-03.png  knocked out (yelling)
  /run/img/sprites/mike-death-04.png  electrocuted
  /run/img/sprites/mike-death-05.png  on fire
  /run/img/sprites/mike-death-06.png  frozen ice statue
  /run/img/sprites/mike-death-07.png  stars (knocked out)
  /run/img/sprites/mike-death-08.png  unconscious / sleeping
  /run/img/sprites/mike-death-09.png  bullet-chest with blood pool
  /run/img/sprites/mike-death-10.png  squashed by anvil
  /run/img/sprites/mike-death-11.png  drowned in puddle
  /run/img/sprites/mike-death-12.png  R.I.P. tombstone
"""

from collections import deque
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "run" / "concept" / "ChatGPT Image Apr 26, 2026, 10_26_02 PM.png"
DST_DIR = ROOT / "run" / "img" / "sprites"

COLS = 3
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
    if not bbox:
        return im
    return im.crop(bbox)


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
            name = f"mike-death-{idx:02d}.png"
            cell.save(DST_DIR / name, "PNG", optimize=True)
            print(f"wrote {name}  ({cell.size[0]}x{cell.size[1]})")
            idx += 1
    print("done.")


if __name__ == "__main__":
    main()
