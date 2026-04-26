#!/usr/bin/env python3
"""
Build a labeled contact sheet of every extracted runner sprite.

Outputs run/img/sprites-contact-sheet.png — a single image with every
sprite from run/img/sprites/ laid out in a labeled grid, grouped by
prefix (mike-run / mike-action / mike-combat / ice / cx-coin). Lets us
review the full extracted set at a glance and pick which frames to use
for which game animation.

Run: python .github/scripts/build-runner-contact-sheet.py
"""
import os
import sys
from collections import defaultdict
from PIL import Image, ImageDraw, ImageFont

REPO = os.environ.get(
    'REPO_PATH',
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
)
SPRITES_DIR = os.path.join(REPO, 'run', 'img', 'sprites')
OUT_PATH    = os.path.join(REPO, 'run', 'img', 'sprites-contact-sheet.png')

# Each sprite is downscaled to fit this thumbnail box (preserves aspect)
THUMB_W, THUMB_H = 160, 200
COL_GAP = 18
ROW_GAP = 32
HEADER_H = 56
GROUP_GAP = 60
LABEL_H = 28

# Output image background — a flat dark slate so both white-bg coin
# thumbnails and dark mike sprites read cleanly against it.
BG = (24, 24, 32)
HEADER_FILL = (220, 200, 255)
LABEL_FILL  = (180, 180, 200)


def find_font(size):
    candidates = [
        r'C:\Windows\Fonts\arialbd.ttf',
        r'C:\Windows\Fonts\arial.ttf',
        '/System/Library/Fonts/Helvetica.ttc',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    ]
    for p in candidates:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()


def thumb(img):
    """Downscale RGBA image to fit THUMB_W x THUMB_H, preserve aspect."""
    img = img.copy()
    img.thumbnail((THUMB_W, THUMB_H), Image.LANCZOS)
    return img


def main():
    if not os.path.isdir(SPRITES_DIR):
        sys.exit(f'No sprites dir: {SPRITES_DIR}')

    files = sorted(f for f in os.listdir(SPRITES_DIR)
                   if f.lower().endswith('.png') and not f.startswith('.'))
    if not files:
        sys.exit('No sprites to lay out.')

    # Group by prefix (everything before "-NN.png")
    groups = defaultdict(list)
    for f in files:
        # split off "-NN.png" suffix
        stem = f.rsplit('.', 1)[0]
        # last "-NN" segment is the index; everything before is the prefix
        parts = stem.rsplit('-', 1)
        prefix = parts[0] if len(parts) == 2 and parts[1].isdigit() else stem
        groups[prefix].append(f)

    # Force a friendly group order
    GROUP_ORDER = ['mike-run', 'mike-action', 'mike-combat', 'ice', 'cx-coin']
    ordered = [(g, groups[g]) for g in GROUP_ORDER if g in groups]
    # Tack on any unexpected groups at the end
    for g in groups:
        if g not in GROUP_ORDER:
            ordered.append((g, groups[g]))

    # Choose grid columns based on the biggest group
    cols = max(8, max(len(items) for _, items in ordered))
    if cols > 12:
        cols = 12  # wrap groups longer than 12 onto multiple rows

    # Compute layout
    cell_w = THUMB_W + COL_GAP
    cell_h = THUMB_H + LABEL_H + ROW_GAP
    out_w = COL_GAP + cols * cell_w

    # Pre-compute total height
    total_h = HEADER_H
    for _g, items in ordered:
        rows_in_group = (len(items) + cols - 1) // cols
        total_h += HEADER_H + rows_in_group * cell_h + GROUP_GAP

    canvas = Image.new('RGBA', (out_w, total_h), BG + (255,))
    draw = ImageDraw.Draw(canvas)

    title_font = find_font(36)
    group_font = find_font(28)
    label_font = find_font(16)

    # Master title
    draw.text((COL_GAP, 14), 'EmpireX Runner — extracted sprites',
              font=title_font, fill=HEADER_FILL)
    y = HEADER_H

    for group_name, items in ordered:
        # Group header
        draw.text((COL_GAP, y + 12), f'{group_name}  ({len(items)} frames)',
                  font=group_font, fill=HEADER_FILL)
        y += HEADER_H

        # Grid of thumbnails
        for i, fname in enumerate(items):
            row = i // cols
            col = i % cols
            x = COL_GAP + col * cell_w
            cy = y + row * cell_h

            # Thumbnail tile (with subtle border so transparent sprites stand out)
            tile_x0 = x
            tile_y0 = cy
            draw.rectangle(
                (tile_x0, tile_y0, tile_x0 + THUMB_W, tile_y0 + THUMB_H),
                outline=(60, 60, 70), width=1)

            sprite = Image.open(os.path.join(SPRITES_DIR, fname)).convert('RGBA')
            t = thumb(sprite)
            tx = tile_x0 + (THUMB_W - t.width) // 2
            ty = tile_y0 + (THUMB_H - t.height) // 2
            canvas.paste(t, (tx, ty), t)

            # Frame number label
            label = fname.rsplit('-', 1)[-1].rsplit('.', 1)[0]
            try:
                bbox = draw.textbbox((0, 0), label, font=label_font)
                lw = bbox[2] - bbox[0]
            except AttributeError:
                lw = label_font.getsize(label)[0]
            draw.text((tile_x0 + (THUMB_W - lw) // 2, tile_y0 + THUMB_H + 4),
                      label, font=label_font, fill=LABEL_FILL)

        rows_in_group = (len(items) + cols - 1) // cols
        y += rows_in_group * cell_h + GROUP_GAP

    canvas.convert('RGB').save(OUT_PATH, 'PNG', optimize=True)
    print(f'wrote {OUT_PATH}  ({os.path.getsize(OUT_PATH):,} bytes)')


if __name__ == '__main__':
    main()
