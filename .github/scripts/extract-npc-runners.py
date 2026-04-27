"""
Extract NPC running sprites from the 'peds - (N).png' sheets.

Each sheet is a 4-row x 6-col grid where every ROW is one NPC
character's 6-frame forward-facing run cycle. White background.

Sheets in /run/concept/:
  peds -  (1).png   sheet 1  -> runners 1-4
  peds -  (5).png   sheet 2  -> runners 5-8
  peds -  (6).png   sheet 3  -> runners 9-12
  peds -  (7).png   sheet 4  -> runners 13-16
  peds -  (8).png   sheet 5  -> runners 17-20
  peds -  (9).png   sheet 6  -> runners 21-24
  peds -  (10).png  sheet 7  -> runners 25-28

Output naming: /run/img/sprites/npc-runner-{NN}-{F}.png
where NN is the character index (01..28) and F is the frame (1..6).
"""

from collections import deque
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
CONCEPT = ROOT / "run" / "concept"
DST_DIR = ROOT / "run" / "img" / "sprites"

# (filename, starting character index)
SHEETS = [
    ("peds -  (1).png",   1),
    ("peds -  (5).png",   5),
    ("peds -  (6).png",   9),
    ("peds -  (7).png",  13),
    ("peds -  (8).png",  17),
    ("peds -  (9).png",  21),
    ("peds -  (10).png", 25),
]

ROWS = 4
COLS = 6


def flood_remove_corner_color(im, target=(255, 255, 255), tolerance=18):
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
    DST_DIR.mkdir(parents=True, exist_ok=True)
    total_written = 0
    for sheet_name, start_char in SHEETS:
        src = CONCEPT / sheet_name
        if not src.exists():
            print(f"SKIP missing: {src.name}")
            continue
        sheet = Image.open(src).convert("RGBA")
        # Flood-key white from the full sheet first so the inter-cell
        # gutters become transparent before per-cell crop.
        sheet = flood_remove_corner_color(sheet, target=(255, 255, 255), tolerance=22)
        w, h = sheet.size
        cw = w // COLS
        ch = h // ROWS
        for row in range(ROWS):
            char_idx = start_char + row
            for col in range(COLS):
                box = (col * cw, row * ch, (col + 1) * cw, (row + 1) * ch)
                cell = sheet.crop(box).copy()
                # Per-cell flood handles isolated white gaps (e.g.,
                # arm shadows or holes between body parts that the
                # sheet flood couldn't reach).
                cell = flood_remove_corner_color(cell, target=(255, 255, 255), tolerance=22)
                cell = keep_largest_blob(cell)
                cell = trim_transparent(cell)
                frame = col + 1
                name = f"npc-runner-{char_idx:02d}-{frame}.png"
                cell.save(DST_DIR / name, "PNG", optimize=True)
                total_written += 1
        print(f"sheet {sheet_name}: chars {start_char}..{start_char + ROWS - 1}")
    print(f"done. total sprites written: {total_written}")


if __name__ == "__main__":
    main()
