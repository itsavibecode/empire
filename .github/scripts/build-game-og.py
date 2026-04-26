#!/usr/bin/env python3
"""
Build the social-share OG image for the EmpireX Slot machine page.

Output:
  game/og-game.jpg  (1200x630, JPEG)

Visual goal:
  Match the look of the live /game/ page so the social card previews what
  visitors will actually see when they click through:
    - Black background (matches body bg)
    - White-bordered slot rectangle in the center (matches body:after frame)
    - Top-prize face (1symbol-a.png = "Cx") fitted inside the frame so the
      preview shows a "winning" state
    - "OUREMPIREX.COM/GAME" caption near the bottom (matches .game-url)
    - "EMPIREX SLOTS" eyebrow at the top

Run: python .github/scripts/build-game-og.py
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFont

REPO = os.environ.get(
    'REPO_PATH',
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
)
GAME_DIR = os.path.join(REPO, 'game')
IMG_DIR = os.path.join(GAME_DIR, 'img')
OUT_PATH = os.path.join(GAME_DIR, 'og-game.jpg')

# Standard Open Graph image size — Facebook, X, LinkedIn, iMessage, etc.
# all preview at 1200x630. JPEG keeps the file small.
OG_W, OG_H = 1200, 630

# Brand colors pulled from game/css/style.css
BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
PURPLE = (0x8E, 0x5C, 0xCB)        # #8E5CCB EmpireX purple
CAPTION = (255, 255, 255)

# Slot frame layout. The on-page slot uses ~64% of width × ~50% of height
# centered. We'll mirror that proportion in the OG card.
FRAME_W = 720
FRAME_H = 360
FRAME_X = (OG_W - FRAME_W) // 2
FRAME_Y = (OG_H - FRAME_H) // 2 - 20    # nudge up to leave room for caption
BORDER_THICK = 6


def load_face(filename):
    path = os.path.join(IMG_DIR, filename)
    if not os.path.exists(path):
        sys.exit(f'Missing source image: {path}')
    img = Image.open(path).convert('RGBA')
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
    return img


def cover_crop(img, target_w, target_h):
    """CSS background-size:cover behavior — scale to fully cover, center-crop."""
    sw, sh = img.size
    tgt_ratio = target_w / target_h
    src_ratio = sw / sh
    if src_ratio > tgt_ratio:
        new_h = target_h
        new_w = max(target_w, int(round(sw * (target_h / sh))))
    else:
        new_w = target_w
        new_h = max(target_h, int(round(sh * (target_w / sw))))
    scaled = img.resize((new_w, new_h), Image.LANCZOS)
    left = (new_w - target_w) // 2
    top = (new_h - target_h) // 2
    return scaled.crop((left, top, left + target_w, top + target_h))


def find_font(size):
    """Try common system fonts. The site uses VT323 (a pixel font), but we
    can't ship an arbitrary TTF inside the script — so we fall back to a
    bold sans-serif which still reads cleanly at OG sizes."""
    candidates = [
        # Windows
        r'C:\Windows\Fonts\arialbd.ttf',
        r'C:\Windows\Fonts\arial.ttf',
        # macOS
        '/System/Library/Fonts/Helvetica.ttc',
        '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
        # Linux
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    ]
    for p in candidates:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()


def draw_centered(draw, text, y, font, fill, letter_spacing=0):
    """Draw `text` horizontally centered at vertical position y. Optional
    letter_spacing in pixels approximates CSS letter-spacing."""
    if letter_spacing == 0:
        bbox = draw.textbbox((0, 0), text, font=font)
        w = bbox[2] - bbox[0]
        x = (OG_W - w) // 2
        draw.text((x, y), text, font=font, fill=fill)
        return
    # Manual letter spacing — measure each glyph, lay them out one at a time
    char_widths = []
    for ch in text:
        bbox = draw.textbbox((0, 0), ch, font=font)
        char_widths.append(bbox[2] - bbox[0])
    total = sum(char_widths) + letter_spacing * (len(text) - 1)
    x = (OG_W - total) // 2
    for ch, cw in zip(text, char_widths):
        draw.text((x, y), ch, font=font, fill=fill)
        x += cw + letter_spacing


def main():
    # Canvas
    img = Image.new('RGB', (OG_W, OG_H), BLACK)
    draw = ImageDraw.Draw(img)

    # 1) Slot interior — purple panel (face will be pasted on top)
    inner_x0 = FRAME_X + BORDER_THICK
    inner_y0 = FRAME_Y + BORDER_THICK
    inner_x1 = FRAME_X + FRAME_W - BORDER_THICK
    inner_y1 = FRAME_Y + FRAME_H - BORDER_THICK
    draw.rectangle((inner_x0, inner_y0, inner_x1, inner_y1), fill=PURPLE)

    # 2) Top-prize face fills the slot interior — cover-fit so it looks
    #    like a winning spin where all three reels stacked into one face.
    inner_w = inner_x1 - inner_x0
    inner_h = inner_y1 - inner_y0
    face = load_face('1symbol-a.png')
    face_fitted = cover_crop(face, inner_w, inner_h)
    img.paste(face_fitted.convert('RGB'), (inner_x0, inner_y0))

    # 3) White border frame (drawn AFTER face so it sits on top cleanly)
    for i in range(BORDER_THICK):
        draw.rectangle(
            (FRAME_X + i, FRAME_Y + i,
             FRAME_X + FRAME_W - 1 - i, FRAME_Y + FRAME_H - 1 - i),
            outline=WHITE,
        )

    # 4) Eyebrow above the slot — small, dim, letter-spaced
    eyebrow = find_font(28)
    draw_centered(draw, 'EMPIREX SLOTS', FRAME_Y - 56, eyebrow,
                  fill=(255, 255, 255), letter_spacing=8)

    # 5) URL caption below the slot — matches the on-page .game-url
    caption_font = find_font(36)
    draw_centered(draw, 'OUREMPIREX.COM/GAME',
                  FRAME_Y + FRAME_H + 28, caption_font,
                  fill=CAPTION, letter_spacing=6)

    # Save as JPEG. quality=88 is the sweet spot for OG images: small file,
    # no visible compression on the face.
    img.save(OUT_PATH, 'JPEG', quality=88, optimize=True)
    print(f'wrote {OUT_PATH}  ({os.path.getsize(OUT_PATH):,} bytes)')


if __name__ == '__main__':
    main()
