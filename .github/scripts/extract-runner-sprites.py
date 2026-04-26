#!/usr/bin/env python3
"""
Extract individual sprite frames from concept-art reference sheets for
the EmpireX Runner game (`/run/`).

Each reference sheet contains multiple character poses laid out on a
near-black background. This script:

  1. Detects each pose by finding connected non-background pixel groups
     (8-connected flood fill on a luminance threshold).
  2. Crops each region to its bounding box.
  3. Replaces the near-black background with transparency in the alpha
     channel (so dark hair and dark shorts survive — they have non-zero
     RGB, only true black gets keyed out).
  4. Pads each sprite onto a per-source consistent canvas size, BOTTOM-
     ALIGNED and HORIZONTALLY CENTERED. Bottom-alignment is what stops
     the playback from jittering vertically — feet stay on the same Y
     across frames, which is what your eye tracks during a run cycle.
  5. Saves individual PNG files in reading order (top-to-bottom rows,
     left-to-right within each row).

Inputs (under run/concept/) — drop these files there, exact filenames:
  mike-runs.png      -> Mike Smalls Jr running animation frames
  mike-actions.png   -> Mike Smalls Jr action poses (idle/punch/kick)
  mike-combat.png    -> Mike Smalls Jr combat & acrobatic poses
  ice-poseidon.png   -> Ice Poseidon all poses (idle/run/neck-stretch)
  cx-coin.png        -> Cx coin spin (8) + collect (6) frames

Outputs (under run/img/sprites/):
  mike-run-01.png ... mike-run-NN.png
  mike-action-01.png ... etc.
  ice-01.png ...
  cx-coin-01.png ...

If a source file is missing it's silently skipped, so you can drop them
in one at a time and re-run. To re-extract just one set, delete the
matching outputs and re-run.

Run: python .github/scripts/extract-runner-sprites.py
"""
import os
import sys
from PIL import Image

REPO = os.environ.get(
    'REPO_PATH',
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
)
CONCEPT_DIR = os.path.join(REPO, 'run', 'concept')
OUT_DIR     = os.path.join(REPO, 'run', 'img', 'sprites')

# Background tolerance. The background color is auto-detected from the
# four corner pixels of each source sheet (works for any uniform BG —
# we have a mix of black-bg sheets like the Mike sheets and white-bg
# sheets like Ice Poseidon and the Cx coin). A pixel counts as BG if it
# is within BG_TOLERANCE of the detected color in EACH RGB channel.
# Higher = more aggressive removal (might eat dark hair on black bg, or
# light skin highlights on white bg). Lower = leaves a halo. 24 is a
# decent middle ground for AI-generated art.
BG_TOLERANCE = 24

# Minimum area (in pixels) for a connected region to count as a sprite.
# Filters out specks of noise, JPEG artifacts, single bright pixels.
MIN_SPRITE_AREA = 4000

# Padding around each cropped sprite (in transparent pixels) so post-
# processing has breathing room — e.g. a hit-flash glow won't get cut.
SPRITE_PAD = 8

# Two sprites count as the same "row" if their tops are within this many
# pixels of each other. AI-generated layouts rarely align to an exact
# grid, so we group fuzzily.
ROW_TOLERANCE = 80

# Per-source bounding-box merge distance. After connected-component
# detection, we merge any two components whose bounding boxes are
# within this many pixels of each other in BOTH dimensions. Heals
# pixel-level disconnects (an arm whose sprite has a thin gap from
# the wrist).
#
# CRITICAL: must be smaller than the actual gap between adjacent
# POSES on the sheet, else two poses get merged into one. The Mike
# sheets have adjacent run-cycle poses packed tightly (~10-30px gap),
# so we keep merge OFF for those and let the raw extraction stand.
# We only enable merge for sheets where the cost of a slight false-
# merge is less than the cost of split limbs.
MERGE_GAP_DEFAULT = 0

# Per-source-file extraction config. `merge_gap` is optional and
# defaults to MERGE_GAP_DEFAULT.
SOURCES = [
    {'file': 'mike-runs.png',     'prefix': 'mike-run'},
    {'file': 'mike-actions.png',  'prefix': 'mike-action'},
    {'file': 'mike-combat.png',   'prefix': 'mike-combat'},
    {'file': 'ice-poseidon.png',  'prefix': 'ice'},
    {'file': 'cx-coin.png',       'prefix': 'cx-coin'},
]


def detect_bg_color(img):
    """Sample the 4 corner pixels and pick the most common one as the
    background color. Returns (r, g, b). For AI-generated reference art
    with a uniform BG (black OR white OR any solid color), this works
    cleanly because corners almost never overlap a sprite."""
    w, h = img.size
    px = img.load()
    corners = [
        px[0, 0][:3],
        px[w - 1, 0][:3],
        px[0, h - 1][:3],
        px[w - 1, h - 1][:3],
    ]
    # Pick the most common corner — defensive in case one corner has a
    # stray pixel from a sprite that touches the edge.
    from collections import Counter
    return Counter(corners).most_common(1)[0][0]


def make_is_bg(bg_rgb):
    """Return a closure that tests if a pixel is within BG_TOLERANCE of
    the detected background color in every channel."""
    bg_r, bg_g, bg_b = bg_rgb
    tol = BG_TOLERANCE
    def is_bg(r, g, b):
        return (abs(r - bg_r) <= tol and
                abs(g - bg_g) <= tol and
                abs(b - bg_b) <= tol)
    return is_bg


def find_components(img, is_bg):
    """Find connected regions of non-background pixels.

    Returns list of (left, top, right, bottom, area). Uses iterative
    BFS with 8-connectivity (so diagonal pixel neighbors count — useful
    because pixel art often has single-pixel-thin diagonal edges).

    Performance: O(W*H). On a 1500x2000 sheet this takes a few seconds
    of pure-Python; acceptable for a one-time extraction step.
    """
    w, h = img.size
    px = img.load()
    visited = bytearray(w * h)
    components = []

    for y0 in range(h):
        row_offset = y0 * w
        for x0 in range(w):
            if visited[row_offset + x0]:
                continue
            r, g, b = px[x0, y0][:3]
            if is_bg(r, g, b):
                visited[row_offset + x0] = 1
                continue
            # Found a new component — flood-fill it
            stack = [(x0, y0)]
            min_x = max_x = x0
            min_y = max_y = y0
            area = 0
            while stack:
                cx, cy = stack.pop()
                idx = cy * w + cx
                if visited[idx]:
                    continue
                cr, cg, cb = px[cx, cy][:3]
                if is_bg(cr, cg, cb):
                    visited[idx] = 1
                    continue
                visited[idx] = 1
                area += 1
                if cx < min_x: min_x = cx
                if cx > max_x: max_x = cx
                if cy < min_y: min_y = cy
                if cy > max_y: max_y = cy
                # 8-connectivity
                for dy in (-1, 0, 1):
                    ny = cy + dy
                    if ny < 0 or ny >= h:
                        continue
                    for dx in (-1, 0, 1):
                        if dx == 0 and dy == 0:
                            continue
                        nx = cx + dx
                        if nx < 0 or nx >= w:
                            continue
                        if not visited[ny * w + nx]:
                            stack.append((nx, ny))
            if area >= MIN_SPRITE_AREA:
                components.append((min_x, min_y, max_x + 1, max_y + 1, area))
    return components


def merge_nearby_components(components, max_gap):
    """Merge components whose bounding boxes are within max_gap pixels
    of each other (in both dimensions). Uses Union-Find for transitive
    closure: if A is close to B and B is close to C, all three merge
    into one sprite — even if A is far from C.

    Necessary because AI-generated art often has detached limbs or
    accessories (Ice's selfie stick, Mike's cartwheel arms) that
    8-connected flood fill treats as separate sprites."""
    n = len(components)
    if n < 2:
        return components

    parent = list(range(n))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(x, y):
        rx, ry = find(x), find(y)
        if rx != ry:
            parent[rx] = ry

    def boxes_close(c1, c2):
        l1, t1, r1, b1, _ = c1
        l2, t2, r2, b2, _ = c2
        # Gap = 0 if boxes overlap, else distance between nearest edges
        hgap = max(0, max(l1, l2) - min(r1, r2))
        vgap = max(0, max(t1, t2) - min(b1, b2))
        return hgap <= max_gap and vgap <= max_gap

    for i in range(n):
        for j in range(i + 1, n):
            if boxes_close(components[i], components[j]):
                union(i, j)

    # Group by root, then merge each group into a single bounding box
    groups = {}
    for i in range(n):
        groups.setdefault(find(i), []).append(components[i])

    merged = []
    for group in groups.values():
        l = min(c[0] for c in group)
        t = min(c[1] for c in group)
        r = max(c[2] for c in group)
        b = max(c[3] for c in group)
        a = sum(c[4] for c in group)
        merged.append((l, t, r, b, a))
    return merged


def sort_reading_order(components):
    """Sort components into reading order (rows top-to-bottom, then
    left-to-right within each row). Sprites whose tops are within
    ROW_TOLERANCE pixels are grouped into the same row."""
    if not components:
        return []
    by_top = sorted(components, key=lambda c: c[1])
    rows = []
    current_row = [by_top[0]]
    current_top = by_top[0][1]
    for c in by_top[1:]:
        if c[1] - current_top < ROW_TOLERANCE:
            current_row.append(c)
        else:
            rows.append(sorted(current_row, key=lambda c: c[0]))
            current_row = [c]
            current_top = c[1]
    rows.append(sorted(current_row, key=lambda c: c[0]))
    return [c for row in rows for c in row]


def make_sprite(img, bbox, is_bg):
    """Crop img to bbox; replace BG pixels with transparency. Returns RGBA."""
    left, top, right, bottom, _area = bbox
    region = img.crop((left, top, right, bottom)).convert('RGBA')
    px = region.load()
    w, h = region.size
    for y in range(h):
        for x in range(w):
            r, g, b, _a = px[x, y]
            if is_bg(r, g, b):
                px[x, y] = (0, 0, 0, 0)
    return region


def process_file(spec):
    src = os.path.join(CONCEPT_DIR, spec['file'])
    if not os.path.exists(src):
        print(f'  SKIP (not found): {spec["file"]}')
        return 0
    print(f'  processing {spec["file"]}...')
    img = Image.open(src).convert('RGBA')
    bg_rgb = detect_bg_color(img)
    is_bg = make_is_bg(bg_rgb)
    print(f'    detected BG color: rgb{bg_rgb}')
    raw = find_components(img, is_bg)
    merge_gap = spec.get('merge_gap', MERGE_GAP_DEFAULT)
    if merge_gap > 0:
        components = merge_nearby_components(raw, merge_gap)
        if len(components) != len(raw):
            print(f'    merged {len(raw)} raw components -> {len(components)} sprites '
                  f'(gap={merge_gap})')
        else:
            print(f'    detected {len(components)} sprites (merge gap={merge_gap})')
    else:
        components = raw
        print(f'    detected {len(components)} sprites (no merge)')
    components = sort_reading_order(components)

    if not components:
        return 0

    # Per-file canvas size: max width × max height across this file's
    # sprites + padding. Standardizing within a file keeps an animation
    # cycle from jittering. We don't standardize across files — Mike,
    # Ice, and the coin can each have different intrinsic sizes.
    max_w = max(c[2] - c[0] for c in components) + 2 * SPRITE_PAD
    max_h = max(c[3] - c[1] for c in components) + 2 * SPRITE_PAD

    written = 0
    for i, bbox in enumerate(components, start=1):
        sprite = make_sprite(img, bbox, is_bg)
        sw, sh = sprite.size
        canvas = Image.new('RGBA', (max_w, max_h), (0, 0, 0, 0))
        x_off = (max_w - sw) // 2
        # Bottom-anchor: feet (or coin bottom) sit on the same Y across
        # all frames in the set, which is what your eye tracks during
        # animation playback. This is the trick that makes AI-generated
        # poses playable as a cycle.
        y_off = max_h - sh - SPRITE_PAD
        canvas.paste(sprite, (x_off, y_off), sprite)
        out_name = f'{spec["prefix"]}-{i:02d}.png'
        canvas.save(os.path.join(OUT_DIR, out_name), optimize=True)
        written += 1
    print(f'    wrote {written} sprite(s) at {max_w}x{max_h}')
    return written


def main():
    if not os.path.isdir(CONCEPT_DIR):
        sys.exit(f'Concept dir not found: {CONCEPT_DIR}\n'
                 f'Drop reference sheets in there first (see file header).')
    os.makedirs(OUT_DIR, exist_ok=True)
    total = 0
    for spec in SOURCES:
        total += process_file(spec)
    print(f'Done — {total} sprite(s) total.')


if __name__ == '__main__':
    main()
