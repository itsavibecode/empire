"""
Build the Open Graph share image for /run/.

The /run/index.html has had OG meta tags pointing at /run/og-runner.jpg
since launch, but the file was never generated — every social share
preview was broken (Facebook/Discord/iMessage/Slack would render the
fallback URL preview only).

This script composes the official 1200x630 (Open Graph standard) share
image from:
  - titlescreen.jpg (Mike + Ice in Chile) as cover-fit background
  - Vignette gradient for legibility
  - "ON BABY!" cursive title (top center)
  - "An EmpireX endless runner — Chile, mob, hurricane, Cx coins"
    tagline (under title)
  - "ourempirex.com/run" URL caption (bottom)

Output: /run/og-runner.jpg

Re-run this any time the title art or tagline changes. The output is
checked into git (small JPEG, social platforms cache it for weeks
once they crawl it, so we want a stable URL).
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
TITLE_SRC = ROOT / "run" / "img" / "titlescreen.jpg"
OUT = ROOT / "run" / "og-runner.jpg"

W, H = 1200, 630

# Try a few common font paths so the script works on Windows / Linux /
# macOS without external font installs. Falls back to PIL default if
# none are found (will look uglier but still works).
FONT_CANDIDATES_BOLD = [
    "C:\\Windows\\Fonts\\segoeuib.ttf",          # Windows
    "C:\\Windows\\Fonts\\arialbd.ttf",
    "/System/Library/Fonts/Helvetica.ttc",        # macOS
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",  # Linux
]
FONT_CANDIDATES_REGULAR = [
    "C:\\Windows\\Fonts\\segoeui.ttf",
    "C:\\Windows\\Fonts\\arial.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]


def load_font(paths, size):
    for p in paths:
        try:
            return ImageFont.truetype(p, size)
        except (OSError, IOError):
            continue
    return ImageFont.load_default()


def main():
    if not TITLE_SRC.exists():
        print(f"SRC missing: {TITLE_SRC}")
        return
    bg = Image.open(TITLE_SRC).convert("RGB")

    # 1) Cover-fit the title art into 1200x630, anchor near the top so
    # Mike + Ice's faces stay visible (the bottom is mostly road which
    # we can crop).
    src_w, src_h = bg.size
    s = max(W / src_w, H / src_h)
    nw, nh = int(src_w * s), int(src_h * s)
    bg = bg.resize((nw, nh), Image.LANCZOS)
    # Crop to 1200x630, centered horizontally, anchored 25% from top
    crop_x = (nw - W) // 2
    crop_y = max(0, int((nh - H) * 0.15))
    bg = bg.crop((crop_x, crop_y, crop_x + W, crop_y + H))
    canvas = bg.convert("RGBA")

    # 2) Vignette — darken the top + bottom strips so the text reads
    # without competing with the busy art.
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    for y in range(H):
        if y < 180:
            # Top fade: 0.7 alpha at top to 0 at y=180
            a = int((1 - y / 180) * 180)
            od.line([(0, y), (W, y)], fill=(8, 6, 14, a))
        elif y > H - 140:
            a = int(((y - (H - 140)) / 140) * 230)
            od.line([(0, y), (W, y)], fill=(8, 6, 14, a))
    canvas = Image.alpha_composite(canvas, overlay)

    d = ImageDraw.Draw(canvas)

    # 3) Big title "On Baby!"
    title_font = load_font(FONT_CANDIDATES_BOLD, 110)
    title = "ON BABY!"
    bbox = d.textbbox((0, 0), title, font=title_font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = (W - tw) // 2
    ty = 30
    # Drop shadow
    d.text((tx + 5, ty + 5), title, font=title_font, fill=(80, 30, 130, 200))
    d.text((tx, ty), title, font=title_font, fill=(232, 200, 255, 255))

    # 4) Tagline
    tag_font = load_font(FONT_CANDIDATES_REGULAR, 32)
    tag = "An EmpireX endless runner  —  Chile streets, mob chase, hurricane survival"
    bbox = d.textbbox((0, 0), tag, font=tag_font)
    tagw = bbox[2] - bbox[0]
    d.text(((W - tagw) // 2 + 2, ty + th + 22), tag, font=tag_font, fill=(0, 0, 0, 200))
    d.text(((W - tagw) // 2, ty + th + 20), tag, font=tag_font, fill=(255, 230, 180, 255))

    # 5) URL caption (bottom center)
    url_font = load_font(FONT_CANDIDATES_BOLD, 36)
    url = "OUREMPIREX.COM/RUN"
    bbox = d.textbbox((0, 0), url, font=url_font)
    uw = bbox[2] - bbox[0]
    uy = H - 60
    d.text(((W - uw) // 2 + 2, uy + 2), url, font=url_font, fill=(0, 0, 0, 220))
    d.text(((W - uw) // 2, uy), url, font=url_font, fill=(232, 200, 255, 255))

    # 6) Save as JPEG (smaller than PNG for OG; quality 88 is plenty)
    canvas.convert("RGB").save(OUT, "JPEG", quality=88, optimize=True)
    print(f"wrote {OUT.relative_to(ROOT)}  ({W}x{H})")


if __name__ == "__main__":
    main()
