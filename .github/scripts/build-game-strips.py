#!/usr/bin/env python3
"""
Build the reel-strip images for the EmpireX Slot machine.

Visual goal (mimicking the original SMB3 slot mini-game):
  Each row of the slot machine shows a horizontal slice of the SAME set
  of 3 symbols. Top reel = top third of each symbol, center reel = middle
  third, bottom reel = bottom third. When all 3 reels stop on the same
  cell index, the three slices stack vertically into the complete symbol
  (e.g., a complete face).

Inputs (under game/img/):
  1symbol-a.png, 1symbol-b.png, 1symbol-c.png  -> "Fun"      set
  2symbol-a.png, 2symbol-b.png, 2symbol-c.png  -> "More Fun" set ("2"
    images are auto-cropped to their non-transparent bounding box first
    so the artwork isn't shrunk by transparent padding.)

Outputs (also under game/img/), 6 total:
  strip-1-top.png, strip-1-center.png, strip-1-bottom.png  ("Fun")
  strip-2-top.png, strip-2-center.png, strip-2-bottom.png  ("More Fun")

Each strip is 2802x338 px (matches the original game's reel viewBox)
with the EmpireX purple background baked in. The strip is divided into
3 equal cells (934 px each); the cell at index N holds the symbol-N
slice corresponding to that row's position (top/center/bottom).

Run: python .github/scripts/build-game-strips.py
"""
import os
import sys
from PIL import Image

REPO = os.environ.get(
    'REPO_PATH',
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
)
IMG_DIR = os.path.join(REPO, 'game', 'img')

# Strip dimensions per row (matches original Mario reel viewBox 2802x338)
STRIP_W, STRIP_H = 2802, 338
CELL_W = STRIP_W // 3            # 934 — one symbol per cell
ROW_NAMES = ('top', 'center', 'bottom')
# Each symbol is fitted to one cell wide × THREE row-heights tall, then
# sliced into ROW_NAMES so each row holds the matching third.
SYMBOL_W = CELL_W                # 934
SYMBOL_H = STRIP_H * len(ROW_NAMES)  # 338 * 3 = 1014
# Solid reel background (#8E5CCB EmpireX purple)
BG = (0x8E, 0x5C, 0xCB)


# Per-source-image crop overrides applied AFTER autocrop. Each value is
# the fraction of the image to remove from each side. e.g.
# {'crop_bottom': 0.30} removes 30% off the bottom (useful when the
# subject's face is high in the frame and the bottom is shoulders/torso
# we don't want eating up the reel slices).
SYMBOL_OVERRIDES = {
    # 1symbol-b: face needs to ride higher in the strip so the nose
    # joins the eyes in the middle reel and only the mouth/chin land
    # in the bottom reel. crop_top trims a bit off the top of the head
    # (head was sitting too low overall) and crop_bottom takes more of
    # the shoulders/torso off so the face fills more of the strip.
    '1symbol-b.png': {'crop_top': 0.05, 'crop_bottom': 0.55},
}


def load_symbol(filename, autocrop):
    path = os.path.join(IMG_DIR, filename)
    if not os.path.exists(path):
        sys.exit(f'Missing source image: {path}')
    img = Image.open(path).convert('RGBA')
    if autocrop:
        bbox = img.getbbox()  # tightest box of non-fully-transparent pixels
        if bbox:
            img = img.crop(bbox)
    override = SYMBOL_OVERRIDES.get(filename)
    if override:
        w, h = img.size
        left   = int(w * override.get('crop_left',   0))
        top    = int(h * override.get('crop_top',    0))
        right  = w - int(w * override.get('crop_right',  0))
        bottom = h - int(h * override.get('crop_bottom', 0))
        img = img.crop((left, top, right, bottom))
        print(f'    applied override {override} -> new size {img.size}')
    return img


def cover_crop(img, target_w, target_h):
    """Scale `img` to fully COVER target_w x target_h (CSS background-size:
    cover behavior), then center-crop to exact size. Faces stay centered."""
    sw, sh = img.size
    tgt_ratio = target_w / target_h
    src_ratio = sw / sh
    if src_ratio > tgt_ratio:
        # source is wider — scale by height, crop sides
        new_h = target_h
        new_w = max(target_w, int(round(sw * (target_h / sh))))
    else:
        # source is taller — scale by width, crop top/bottom
        new_w = target_w
        new_h = max(target_h, int(round(sh * (target_w / sw))))
    scaled = img.resize((new_w, new_h), Image.LANCZOS)
    left = (new_w - target_w) // 2
    top = (new_h - target_h) // 2
    return scaled.crop((left, top, left + target_w, top + target_h))


def build_set(set_num, filenames, autocrop):
    print(f'Building "set {set_num}" strips '
          f'(autocrop={"yes" if autocrop else "no"})...')
    # Prep each symbol: load, crop transparent padding if requested,
    # then fit to one cell wide × full-stack tall.
    symbols = []
    for f in filenames:
        img = load_symbol(f, autocrop=autocrop)
        symbols.append(cover_crop(img, SYMBOL_W, SYMBOL_H))

    for row_idx, row_name in enumerate(ROW_NAMES):
        strip = Image.new('RGB', (STRIP_W, STRIP_H), BG)
        y0 = row_idx * STRIP_H
        y1 = (row_idx + 1) * STRIP_H
        for cell_idx, sym in enumerate(symbols):
            sym_slice = sym.crop((0, y0, SYMBOL_W, y1))
            x = cell_idx * CELL_W
            # Use slice's alpha as paste mask so transparent regions show
            # the purple background through.
            strip.paste(sym_slice, (x, 0), sym_slice)
        out = os.path.join(IMG_DIR, f'strip-{set_num}-{row_name}.png')
        strip.save(out, optimize=True)
        print(f'  wrote {out}  ({os.path.getsize(out):,} bytes)')


def main():
    # Clean up the old single-strip-per-set files from before this rewrite
    for legacy in ('strip-1.png', 'strip-2.png'):
        p = os.path.join(IMG_DIR, legacy)
        if os.path.exists(p):
            os.remove(p)
            print(f'  removed legacy {legacy}')

    build_set(1, [f'1symbol-{c}.png' for c in 'abc'], autocrop=False)
    build_set(2, [f'2symbol-{c}.png' for c in 'abc'], autocrop=True)
    print('Done.')


if __name__ == '__main__':
    main()
