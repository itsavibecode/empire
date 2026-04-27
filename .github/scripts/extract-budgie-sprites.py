"""
Slice the budgie/parakeet sprite sheet into 16 individual PNG frames.

The source sheet is a 4x4 grid (1536x1024px) with the bird against a
transparent (alpha=0) olive background. ChatGPT generated it with the
chroma-key already applied so no further masking is needed.

Frame layout (left-to-right, top-to-bottom):
  Row 1 (frames 01-04): FLYING — wings up -> spread -> down (flap cycle)
  Row 2 (frames 05-08): perched, body forward, looking around
  Row 3 (frames 09-12): perched, body slightly turned
  Row 4 (frames 13-16): perched, looking sideways/back

For the cutscene shoulder bird we'll use a few perched frames as
the idle-bob loop and the row-1 flap frames for take-off/return
flight.

Output: /run/img/sprites/budgie-01.png ... budgie-16.png
"""

from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "run" / "concept" / "ChatGPT Image Apr 26, 2026, 10_13_13 PM.png"
DST_DIR = ROOT / "run" / "img" / "sprites"

COLS = 4
ROWS = 4


def keep_largest_blob(im: Image.Image, alpha_threshold: int = 30) -> Image.Image:
    """Keep ONLY the largest connected component of opaque pixels.
    Erases (alpha=0) everything else. Fixes bleed from adjacent grid
    cells that the simple bbox trim picks up — e.g. budgie-13 had the
    feet of the row-2 birds floating above the main bird body."""
    w, h = im.size
    px = im.load()
    # Build a 2D grid of which pixels are "filled" (alpha above threshold)
    visited = [[False] * h for _ in range(w)]
    filled = [[False] * h for _ in range(w)]
    for x in range(w):
        for y in range(h):
            if px[x, y][3] >= alpha_threshold:
                filled[x][y] = True
    # BFS flood-fill to enumerate components
    from collections import deque
    components = []  # list of [list-of-(x,y)]
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
    # Largest by pixel count
    largest = max(components, key=len)
    keep = set(largest)
    # Erase everything else
    for x in range(w):
        for y in range(h):
            if filled[x][y] and (x, y) not in keep:
                r, g, b, _ = px[x, y]
                px[x, y] = (r, g, b, 0)
    return im


def trim_transparent(im: Image.Image) -> Image.Image:
    """Crop to the tight bounding box of opaque pixels."""
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
            cell = sheet.crop(box).copy()  # copy so we can mutate alpha
            cell = keep_largest_blob(cell)
            cell = trim_transparent(cell)
            name = f"budgie-{idx:02d}.png"
            cell.save(DST_DIR / name, "PNG", optimize=True)
            print(f"wrote {name}  ({cell.size[0]}x{cell.size[1]})")
            idx += 1
    print("done.")


if __name__ == "__main__":
    main()
