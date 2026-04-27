"""
Hurricane / water segment assets.

Sources (in /run/concept/):
  1roadwater.png       — TRANSITION INTO water (road ends at cliff)
  2aroadwater.png      — pure water tile A (animation frame 1)
  2broadwater.png      — pure water tile B (animation frame 2 — alternate)
  3roadwater.png       — TRANSITION OUT of water (boat ramp returning)
  Gemini_Generated_Image_jnt9bijnt9bijnt9.png  — Mike-on-mattress, 4x3
                                                  grid, transparent bg

Outputs (to /run/img/bg/ and /run/img/sprites/):
  bg-water-enter.png       — copied from 1roadwater
  bg-water-tile-a.png      — copied from 2aroadwater
  bg-water-tile-b.png      — copied from 2broadwater
  bg-water-exit.png        — copied from 3roadwater
  mike-mattress-01..12.png — sliced from Gemini sheet (4x3 grid)

The water tiles are already in the same long-strip format as the
existing road tiles (~2:1 aspect). The sliced mattress sprites are
used as Mike's run-cycle replacement during the water phase.
"""

from collections import deque
from pathlib import Path
from PIL import Image
import shutil

ROOT = Path(__file__).resolve().parents[2]
CONCEPT = ROOT / "run" / "concept"
BG_DIR = ROOT / "run" / "img" / "bg"
SPR_DIR = ROOT / "run" / "img" / "sprites"

WATER_TILES = [
    ("1roadwater.png",  "bg-water-enter.png"),
    ("2aroadwater.png", "bg-water-tile-a.png"),
    ("2broadwater.png", "bg-water-tile-b.png"),
    ("3roadwater.png",  "bg-water-exit.png"),
]

MATTRESS_SHEET = "Gemini_Generated_Image_jnt9bijnt9bijnt9.png"
MATTRESS_COLS = 3
MATTRESS_ROWS = 4
MATTRESS_PREFIX = "mike-mattress-"


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
    BG_DIR.mkdir(parents=True, exist_ok=True)
    SPR_DIR.mkdir(parents=True, exist_ok=True)

    # 1) Water road tiles — straight copy (already at correct aspect)
    for src_name, dst_name in WATER_TILES:
        src = CONCEPT / src_name
        dst = BG_DIR / dst_name
        if not src.exists():
            print(f"SKIP missing water tile: {src}")
            continue
        shutil.copyfile(src, dst)
        print(f"copied  {src.name}  ->  bg/{dst_name}")

    # 2) Mike-on-mattress sprite sheet — slice 4x3 grid, blob-filter,
    #    trim. Source is already alpha-keyed (transparent bg).
    msrc = CONCEPT / MATTRESS_SHEET
    if not msrc.exists():
        print(f"SKIP missing mattress sheet: {msrc}")
        return
    sheet = Image.open(msrc).convert("RGBA")
    w, h = sheet.size
    cw = w // MATTRESS_COLS
    ch = h // MATTRESS_ROWS
    idx = 1
    for row in range(MATTRESS_ROWS):
        for col in range(MATTRESS_COLS):
            box = (col * cw, row * ch, (col + 1) * cw, (row + 1) * ch)
            cell = sheet.crop(box).copy()
            cell = keep_largest_blob(cell)
            cell = trim_transparent(cell)
            name = f"{MATTRESS_PREFIX}{idx:02d}.png"
            cell.save(SPR_DIR / name, "PNG", optimize=True)
            print(f"wrote   sprites/{name}  ({cell.size[0]}x{cell.size[1]})")
            idx += 1
    print("done.")


if __name__ == "__main__":
    main()
