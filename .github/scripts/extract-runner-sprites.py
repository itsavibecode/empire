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
# Per-source override available via `min_area` in SOURCES below.
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

# Per-source-file extraction config.
#   `merge_gap` overrides MERGE_GAP_DEFAULT.
#   `min_area`  overrides MIN_SPRITE_AREA (use for sheets with smaller
#               sprites than the default — e.g. the 6x4 chibi NPC grid).
#   `bg_extra`  list of additional (r,g,b) tuples to also key out as
#               background. Use for sheets with checker-pattern bgs
#               where auto-detect only catches one of the two colors.
#   `use_alpha` if True, ignore RGB-tolerance bg detection entirely and
#               use the source's existing alpha channel. For sheets that
#               were ALREADY alpha-keyed before being dropped in
#               (user-cleaned `_alpha` / `_transparent` files). Avoids
#               re-introducing the eyebrow/facial-hair eating problem
#               that pure RGB-tolerance approach has on dark figures.
SOURCES = [
    # Mike + Ice — switched to user-pre-cleaned alpha sheets in v0.16.
    # Original black-bg sheets (mike-runs.png etc.) had the eyebrow-
    # eating bug because dark interior pixels were within tolerance of
    # the near-black background. The _alpha versions have proper
    # transparency baked in, so we just use the alpha channel.
    {'file': 'mike_runs_alpha.png',        'prefix': 'mike-run',     'use_alpha': True},
    {'file': 'mike_actions_true_alpha.png','prefix': 'mike-action',  'use_alpha': True},
    {'file': 'mike_combat_alpha.png',      'prefix': 'mike-combat',  'use_alpha': True},
    {'file': 'ice_poseidon_alpha.png',     'prefix': 'ice',          'use_alpha': True},
    # Single-frame items + spin sheets
    {'file': 'cx-coin.png',                'prefix': 'cx-coin'},
    # ham-spin + 400-spin both have white-on-white interior bug w/ the
    # default per-pixel BG matching. Flood-fill mode preserves interior
    # white pixels (only the connected-from-corners bg gets keyed).
    {'file': 'ham-spin.png',               'prefix': 'ham-spin',     'bg_mode': 'flood'},
    {'file': '400-spin.png',               'prefix': 'h400-spin',    'bg_mode': 'flood'},
    {'file': 'weed_spin_transparent.png',  'prefix': 'weed-spin',    'use_alpha': True},
    # NPC sheets — street obstacles, phone-thieves, mob members.
    {'file': 'npcs-grid.png',              'prefix': 'npc-grid',     'min_area': 1200},
    {'file': 'npcs-pedestrians.png',       'prefix': 'npc-pedestrian', 'bg_extra': [(255, 255, 255)]},
    {'file': 'npcs-protesters.png',        'prefix': 'npc-protester'},
    # Background fauna — flood mode for the white-bg birds (their white
    # bodies were getting keyed out under per-pixel matching).
    {'file': 'animals-seagulls.png',       'prefix': 'seagull',      'min_area': 1500, 'bg_mode': 'flood'},
    {'file': 'animals-pigeons.png',        'prefix': 'pigeon',       'min_area': 1500, 'bg_mode': 'flood'},
    {'file': 'animals-cats.png',           'prefix': 'cat',          'min_area': 1500},
    {'file': 'animals-dogs.png',           'prefix': 'dog',          'min_area': 1500, 'bg_mode': 'flood'},
    {'file': 'animals-goats.png',          'prefix': 'goat',         'min_area': 1500},
    # Vehicles. `alpha_threshold: 200` keys out the translucent
    # ground-shadow and motion-blur pixels baked into the cop car
    # source — preserves only the solid car body. (Without this, the
    # sprite has a grey halo + diagonal speed-line streak.)
    {'file': 'cop_car_iso_transparent.png','prefix': 'cop-car',      'use_alpha': True, 'min_area': 3000, 'alpha_threshold': 200},
    # Horse-riding sheets — green-screen background (rgb ~ 76,233,41).
    # Flood-fill mode handles the gradient edges cleanly.
    {'file': 'mike-rides-horse.png',                  'prefix': 'mike-horse',     'bg_mode': 'flood', 'bg_tolerance': 40, 'min_area': 5000},
    {'file': 'Mike-Ice-Ride-Horse-overhead-front-view.png', 'prefix': 'mike-ice-horse', 'bg_mode': 'flood', 'bg_tolerance': 40, 'min_area': 5000},
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


def make_is_bg_alpha(threshold=50):
    """For sheets that ALREADY have proper alpha transparency baked in
    (user-pre-cleaned files like *_alpha.png). Avoids the RGB-tolerance
    approach which would eat dark interior pixels (eyebrows, facial hair,
    black outlines on Mike) — just trusts the existing alpha channel.

    `threshold` controls how aggressive the alpha key is:
      - 50  (default): keys out only fully/almost-fully transparent pixels.
      - 200 (strict): keys out anything that's not nearly opaque, which
        also cuts translucent things like ground shadows + motion blur
        baked into a sprite. Use for sources where soft shadows ruin the
        sprite outline (e.g. cop cars)."""
    def is_bg(r, g, b, a):
        return a < threshold
    return is_bg


def make_bg_mask_via_corner_flood(img, tolerance=20):
    """Build a 2D boolean mask of which pixels are background, by
    flood-filling from each of the 4 image corners outward. Only pixels
    that are (a) within `tolerance` of the corner color AND (b)
    reachable via 4-connectivity through other in-tolerance pixels
    get marked as bg.

    Why this matters: simple per-pixel RGB tolerance keys EVERY pixel
    that matches the bg color — including white pixels INSIDE a sprite
    (e.g. a seagull's white body on a white background, or the white
    centers of a "400" character). This corner-flood approach preserves
    those interior pixels because they're not connected to the corner
    background through a continuous run of in-tolerance pixels — they're
    enclosed by the sprite's darker outline.

    Returns a flat list of W*H booleans (mask[y*w + x] = is_bg)."""
    w, h = img.size
    px = img.load()
    mask = [False] * (w * h)

    corners = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]

    for cx, cy in corners:
        cp = px[cx, cy][:3]
        cr, cg, cb = cp[0], cp[1], cp[2]
        # Iterative flood-fill with stack (4-connectivity)
        stack = [(cx, cy)]
        while stack:
            x, y = stack.pop()
            idx = y * w + x
            if mask[idx]:
                continue
            p = px[x, y]
            if (abs(p[0] - cr) > tolerance or
                abs(p[1] - cg) > tolerance or
                abs(p[2] - cb) > tolerance):
                continue
            mask[idx] = True
            if x > 0:     stack.append((x - 1, y))
            if x < w - 1: stack.append((x + 1, y))
            if y > 0:     stack.append((x, y - 1))
            if y < h - 1: stack.append((x, y + 1))

    return mask


def make_is_bg_from_mask(mask, w):
    """Wrap a precomputed bg mask in the standard is_bg(r,g,b,a)
    signature. The closure captures the mask so we can pass it to
    find_components / make_sprite. We need x,y context though — the
    standard signature only has the pixel value. Workaround: index by
    position via a mutable counter — but that's fragile. Better: the
    callers will be updated to pass (x, y) when in flood mode.

    Actually simpler approach: just precompute and apply transparency
    in a one-shot pass before component-finding, then use a trivial
    is_bg(alpha < 50) for the rest of the pipeline. See the caller."""
    def is_bg(r, g, b, a):
        return a < 50
    return is_bg


def make_is_bg(bg_rgbs):
    """Return a closure that tests if a pixel is within BG_TOLERANCE of
    ANY of the provided background colors in every channel.

    bg_rgbs is a list of (r, g, b) tuples. This handles sheets whose
    "background" is actually two alternating colors — most commonly a
    grey-and-white checker pattern from image-editor 'transparent'
    placeholders. For single-color backgrounds, pass a list of one.

    Signature is (r, g, b, a) for compatibility with the alpha-mode
    is_bg variant, but `a` is ignored here."""
    tol = BG_TOLERANCE
    def is_bg(r, g, b, a):
        for bg in bg_rgbs:
            if (abs(r - bg[0]) <= tol and
                abs(g - bg[1]) <= tol and
                abs(b - bg[2]) <= tol):
                return True
        return False
    return is_bg


def find_components(img, is_bg, min_area=MIN_SPRITE_AREA):
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
            p = px[x0, y0]
            if is_bg(p[0], p[1], p[2], p[3] if len(p) > 3 else 255):
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
                cp = px[cx, cy]
                if is_bg(cp[0], cp[1], cp[2], cp[3] if len(cp) > 3 else 255):
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
            if area >= min_area:
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
            r, g, b, a = px[x, y]
            if is_bg(r, g, b, a):
                px[x, y] = (0, 0, 0, 0)
    return region


def process_file(spec):
    src = os.path.join(CONCEPT_DIR, spec['file'])
    if not os.path.exists(src):
        print(f'  SKIP (not found): {spec["file"]}')
        return 0
    print(f'  processing {spec["file"]}...')
    img = Image.open(src).convert('RGBA')
    if spec.get('use_alpha'):
        # Source already has proper alpha-keyed transparency. Trust it.
        # Per-source `alpha_threshold` lets sheets with baked-in soft
        # shadows / motion blur (cop cars) tighten the threshold so
        # those translucent pixels also get keyed out.
        is_bg = make_is_bg_alpha(spec.get('alpha_threshold', 50))
        print(f'    using ALPHA mode (threshold {spec.get("alpha_threshold", 50)})')
    elif spec.get('bg_mode') == 'flood':
        # Flood-fill from corners — preserves interior bg-color pixels
        # (white seagull bodies on white bg, etc.). We pre-bake the mask
        # into the image's alpha channel, then the rest of the pipeline
        # uses simple alpha-mode bg detection.
        tol = spec.get('bg_tolerance', 24)
        mask = make_bg_mask_via_corner_flood(img, tolerance=tol)
        w, h = img.size
        px = img.load()
        cleared = 0
        for y in range(h):
            for x in range(w):
                if mask[y * w + x]:
                    px[x, y] = (0, 0, 0, 0)
                    cleared += 1
        is_bg = make_is_bg_alpha()
        print(f'    using FLOOD mode (tol={tol}, cleared {cleared:,} bg pixels)')
    else:
        bg_rgb = detect_bg_color(img)
        bg_colors = [bg_rgb]
        extra = spec.get('bg_extra')
        if extra:
            bg_colors.extend(tuple(c) for c in extra)
        is_bg = make_is_bg(bg_colors)
        if len(bg_colors) > 1:
            print(f'    detected BG color: rgb{bg_rgb} + extras: {bg_colors[1:]}')
        else:
            print(f'    detected BG color: rgb{bg_rgb}')
    min_area = spec.get('min_area', MIN_SPRITE_AREA)
    raw = find_components(img, is_bg, min_area=min_area)
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
