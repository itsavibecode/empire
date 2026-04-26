#!/usr/bin/env python3
"""
Build the 3 reel-strip images the EmpireX Slot machine uses, from the
6 source symbol images in game/img/.

Inputs (under game/img/):
  1symbol-a.png, 1symbol-b.png, 1symbol-c.png  -> "Fun"      set -> game/img/strip-1.png
  2symbol-a.png, 2symbol-b.png, 2symbol-c.png  -> "More Fun" set -> game/img/strip-2.png

The strip is a single 2802x338 PNG (matches the original game's reel
viewBox) with the EmpireX purple background baked in and the 3 symbols
laid out in equal-width cells. Set 2 ("More Fun") symbols are first
auto-cropped to their non-transparent bounding box so transparent
padding around the artwork doesn't shrink them on screen.

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

# Strip dimensions (matches original Mario reel viewBox 2802x338, ~8.3:1)
STRIP_W, STRIP_H = 2802, 338
CELL_W = STRIP_W // 3  # 934 per cell
# Solid reel background (#8E5CCB EmpireX purple)
BG = (0x8E, 0x5C, 0xCB)
# How much of each cell the symbol takes up (0.85 = 15% padding)
SYMBOL_FILL = 0.88


def load_symbol(filename, autocrop):
    path = os.path.join(IMG_DIR, filename)
    if not os.path.exists(path):
        sys.exit(f'Missing source image: {path}')
    img = Image.open(path).convert('RGBA')
    if autocrop:
        bbox = img.getbbox()  # tightest box of non-fully-transparent pixels
        if bbox:
            img = img.crop(bbox)
    return img


def fit(symbol, max_w, max_h):
    """Return symbol scaled to fit max_w x max_h while preserving aspect."""
    sw, sh = symbol.size
    ratio = min(max_w / sw, max_h / sh)
    new_size = (max(1, int(sw * ratio)), max(1, int(sh * ratio)))
    return symbol.resize(new_size, Image.LANCZOS)


def build_strip(symbols, out_path):
    strip = Image.new('RGB', (STRIP_W, STRIP_H), BG)
    for i, sym in enumerate(symbols):
        scaled = fit(sym, int(CELL_W * SYMBOL_FILL), int(STRIP_H * SYMBOL_FILL))
        x = i * CELL_W + (CELL_W - scaled.width) // 2
        y = (STRIP_H - scaled.height) // 2
        # Use the alpha channel as the paste mask so transparent regions
        # show the purple background through.
        strip.paste(scaled, (x, y), scaled)
    strip.save(out_path, optimize=True)
    print(f'  wrote {out_path}  ({os.path.getsize(out_path):,} bytes)')


def main():
    print('Building "Fun" strip from 1symbol-{a,b,c}.png ...')
    set1 = [load_symbol(f'1symbol-{c}.png', autocrop=False) for c in 'abc']
    build_strip(set1, os.path.join(IMG_DIR, 'strip-1.png'))

    print('Building "More Fun" strip from 2symbol-{a,b,c}.png ...')
    print('  (auto-cropping transparent padding around each)')
    set2 = [load_symbol(f'2symbol-{c}.png', autocrop=True) for c in 'abc']
    build_strip(set2, os.path.join(IMG_DIR, 'strip-2.png'))

    print('Done.')


if __name__ == '__main__':
    main()
