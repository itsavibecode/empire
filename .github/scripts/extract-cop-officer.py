"""
Slice the cop-officer sprite sheet into individual PNG frames.

Source: /run/concept/ChatGPT Image Apr 26, 2026, 01_50_20 PM.png
        — 5 cols x 3 rows = 15 officer frames on white background.

Used by the "stoned-chase" mechanic: when Mike grabs a weed pickup,
2-4 officers spawn behind him and follow up the screen for the
duration of the debuff.

Output: /run/img/sprites/cop-officer-01.png .. cop-officer-15.png

Background is solid white (alpha=255). flood_remove_corner_color
keys it out from the sheet corners; per-cell flood handles any
isolated white blobs the sheet flood didn't reach.
"""

from collections import deque
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "run" / "concept" / "ChatGPT Image Apr 26, 2026, 01_50_20 PM.png"
DST_DIR = ROOT / "run" / "img" / "sprites"

COLS = 5
ROWS = 3
PREFIX = "cop-officer-"


def flood_remove_corner_color(im, target=(255, 255, 255), tolerance=15):
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    tr, tg, tb = target
    visited = [[False] * h for _ in range(w)]

    def matches(x, y):
        r, g, b, a = px[x, y]
        if a == 0:
            return False
        return (abs(r - tr) <= tolerance
                and abs(g - tg) <= tolerance
                and abs(b - tb) <= tolerance)

    starts = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    queue = deque()
    for sx, sy in starts:
        if not visited[sx][sy] and matches(sx, sy):
            queue.append((sx, sy))
            visited[sx][sy] = True
    while queue:
        x, y = queue.popleft()
        r, g, b, _ = px[x, y]
        px[x, y] = (r, g, b, 0)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not visited[nx][ny] and matches(nx, ny):
                visited[nx][ny] = True
                queue.append((nx, ny))
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
    sheet = flood_remove_corner_color(sheet, target=(255, 255, 255), tolerance=18)
    w, h = sheet.size
    cw = w // COLS
    ch = h // ROWS
    DST_DIR.mkdir(parents=True, exist_ok=True)
    idx = 1
    for row in range(ROWS):
        for col in range(COLS):
            box = (col * cw, row * ch, (col + 1) * cw, (row + 1) * ch)
            cell = sheet.crop(box).copy()
            cell = flood_remove_corner_color(cell, target=(255, 255, 255), tolerance=18)
            cell = keep_largest_blob(cell)
            cell = trim_transparent(cell)
            name = f"{PREFIX}{idx:02d}.png"
            cell.save(DST_DIR / name, "PNG", optimize=True)
            print(f"wrote {name}  ({cell.size[0]}x{cell.size[1]})")
            idx += 1
    print("done.")


if __name__ == "__main__":
    main()
