"""
Extract the mirrored pedestrian sheet so the phone-snatcher reaches
from the OPPOSITE side too.

Source: /run/concept/npcs-pedestrians-flipped.png
        4 cols x 3 rows = 12 frames, mottled light-grey + white bg
        speckle (Gemini-generated checkerboard). NOT a clean solid bg.
        Row 1 (1-4):  hoodie dude walking
        Row 2 (5-8):  woman in red shirt + light-blue polka-dot skirt
                      (the WHITE dots in the skirt must be preserved)
        Row 3 (9-12): hoodie reaching to the LEFT (phone-thief mirror)

Output: /run/img/sprites/npc-pedestrian-flipped-01..12.png

v0.18.51 rewrite: edge-seeded flood-fill instead of corner-seeded
flood-fill or chroma-key.

Why the previous approaches failed:
  - Original (corner flood-fill, tol=18): white residue stayed on
    frames 9, 10, 12 because the sprite touches all 4 corners and
    no flood-fill ever started from a bg pixel.
  - Multi-target chroma-key (kill grey AND white globally): destroys
    the woman's white polka-dot skirt because chroma-key has no
    notion of connectivity — interior whites die alongside bg whites.

This pipeline:
  1. Per-cell auto-detect the dominant border-pixel color (which is
     the bg the cell happens to have — the sheet has multiple shades).
  2. Flood-fill from EVERY edge pixel that's close to either the
     detected bg OR pure white. Tolerance is generous (~50 RGB
     distance per axis). Connectivity preserves the woman's polka
     dots: they're surrounded by darker skirt pixels, so the
     flood-fill never reaches them from the cell edge.
  3. keep_largest_blob to drop any speckle that survived.
  4. trim_transparent to crop to the sprite bbox.
  5. Image.FLIP_LEFT_RIGHT (Gemini regenerated same-direction poses
     instead of mirroring; we flip programmatically).
"""

from collections import Counter, deque
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "run" / "concept" / "npcs-pedestrians-flipped.png"
DST_DIR = ROOT / "run" / "img" / "sprites"

COLS = 4
ROWS = 3
PREFIX = "npc-pedestrian-flipped-"

# Per-axis tolerance for "is this pixel bg-colored?" — ±N per channel.
# Sized to cover both the light-grey checkerboard (~207) and pure
# white (255) when measured from the grey side, while keeping the
# hoodie (~120 grey) and red shirt + dark blue skirt comfortably
# outside the bg cluster.
TOLERANCE = 55


def detect_border_bg(im):
    """Sample every border pixel and pick the most common color as
    the bg seed. More robust than corner-only detection when the
    sprite happens to extend into a corner."""
    px = im.load()
    w, h = im.size
    samples = []
    for x in range(w):
        samples.append(px[x, 0][:3])
        samples.append(px[x, h - 1][:3])
    for y in range(h):
        samples.append(px[0, y][:3])
        samples.append(px[w - 1, y][:3])
    return Counter(samples).most_common(1)[0][0]


def flood_remove_bg(im, targets, tol):
    """Flood-fill from every border pixel that matches ANY target.
    Connectivity-aware: only erases bg pixels reachable from the cell
    edge. Sprite-interior whites (e.g. the woman's polka dots) are
    preserved because they're walled off by darker sprite pixels."""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    visited = [[False] * h for _ in range(w)]

    def matches(x, y):
        r, g, b, a = px[x, y]
        if a == 0:
            return False
        for tr, tg, tb in targets:
            if (abs(r - tr) <= tol
                    and abs(g - tg) <= tol
                    and abs(b - tb) <= tol):
                return True
        return False

    queue = deque()
    # Seed from every edge pixel that's bg-colored
    for x in range(w):
        for y in (0, h - 1):
            if not visited[x][y] and matches(x, y):
                visited[x][y] = True
                queue.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if not visited[x][y] and matches(x, y):
                visited[x][y] = True
                queue.append((x, y))

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
    w, h = sheet.size
    cw = w // COLS
    ch = h // ROWS
    DST_DIR.mkdir(parents=True, exist_ok=True)
    idx = 1
    for row in range(ROWS):
        for col in range(COLS):
            box = (col * cw, row * ch, (col + 1) * cw, (row + 1) * ch)
            cell = sheet.crop(box).copy()
            bg = detect_border_bg(cell)
            # Always include pure white as a secondary bg target —
            # the sheet has white speckle pockets that the detected
            # grey bg won't catch on its own.
            cell = flood_remove_bg(cell, [bg, (255, 255, 255)], TOLERANCE)
            cell = keep_largest_blob(cell)
            cell = trim_transparent(cell)
            cell = cell.transpose(Image.FLIP_LEFT_RIGHT)
            name = f"{PREFIX}{idx:02d}.png"
            cell.save(DST_DIR / name, "PNG", optimize=True)
            print(f"wrote {name}  bg={bg}  ({cell.size[0]}x{cell.size[1]})")
            idx += 1
    print("done.")


if __name__ == "__main__":
    main()
