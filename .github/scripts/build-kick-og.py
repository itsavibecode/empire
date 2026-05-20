"""
Build the Open Graph share image for /kick.

Renders a 1200x630 banner that previews on iMessage / Discord / X /
LinkedIn / Slack / etc. when someone pastes
https://ourempirex.com/kick.

Mirrors build-discord-og.py and build-instagram-og.py — Empire X
crown logo top-center, gold serif title, single-line tagline,
branded pill, URL caption — but with Kick's neon green (#53FC18) on
the pill and the Kick three-bar mark next to the label.

Output: /kick/og-kick.jpg

Re-run any time the messaging changes. Social platforms cache the
image for weeks once they crawl it, so the URL stays stable while
the file contents can be regenerated.
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
LOGO_SRC = ROOT / "logo.png"
OUT = ROOT / "kick" / "og-kick.jpg"

W, H = 1200, 630

# Brand palette
GOLD       = (212, 168, 67)
GOLD_LIGHT = (240, 214, 138)
GOLD_DARK  = (161, 122, 40)
CREAM      = (245, 241, 235)
INK        = (10, 10, 10)
KICK_GREEN = (83, 252, 24)        # #53FC18 — Kick's signature neon
KICK_GREEN_DARK = (47, 165, 14)

# Font lookup
FONT_CANDIDATES_SERIF_BOLD = [
    "C:\\Windows\\Fonts\\georgiab.ttf",
    "C:\\Windows\\Fonts\\timesbd.ttf",
    "/System/Library/Fonts/Georgia.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf",
]
FONT_CANDIDATES_SANS_BOLD = [
    "C:\\Windows\\Fonts\\segoeuib.ttf",
    "C:\\Windows\\Fonts\\arialbd.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]
FONT_CANDIDATES_SANS_REGULAR = [
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


def draw_text_centered(d, text, font, y, fill, shadow=None):
    bbox = d.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    x = (W - tw) // 2
    if shadow:
        sx, sy, sc = shadow
        d.text((x + sx, y + sy), text, font=font, fill=sc)
    d.text((x, y), text, font=font, fill=fill)
    return x, tw, th


def radial_glow(size, center, radius, color, max_alpha):
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    cx, cy = center
    px = layer.load()
    for y in range(size[1]):
        for x in range(size[0]):
            dx = x - cx
            dy = y - cy
            d2 = dx * dx + dy * dy
            r2 = radius * radius
            if d2 < r2:
                t = 1 - (d2 / r2) ** 0.5
                a = int(max_alpha * t)
                px[x, y] = (*color, a)
    return layer


def kick_bars_glyph(height, color):
    """Build a small inline SVG-equivalent of Kick's three-bar mark
    (left tall / middle short / right tall) as an RGBA bitmap that can
    sit inside the pill next to the text. height = bar height in px."""
    bar_w = max(6, int(height * 0.18))
    gap = max(3, int(height * 0.08))
    full_w = bar_w * 3 + gap * 2
    img = Image.new("RGBA", (full_w, height), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # Left bar (full height)
    d.rectangle([(0, 0), (bar_w - 1, height - 1)], fill=(*color, 255))
    # Middle bar (centered, shorter)
    mh = int(height * 0.55)
    mx = bar_w + gap
    my = (height - mh) // 2
    d.rectangle([(mx, my), (mx + bar_w - 1, my + mh - 1)], fill=(*color, 255))
    # Right bar (full height)
    rx = bar_w * 2 + gap * 2
    d.rectangle([(rx, 0), (rx + bar_w - 1, height - 1)], fill=(*color, 255))
    return img


def main():
    if not OUT.parent.exists():
        OUT.parent.mkdir(parents=True, exist_ok=True)

    # ── 1) Background gradient — matches Discord + Instagram banners ──
    canvas = Image.new("RGB", (W, H), INK)
    grad = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grad)
    for y in range(H):
        t = y / H
        r = int(10 + (26 - 10) * t)
        g = int(10 + (18 - 10) * t)
        b = int(10 + (8 - 10) * t)
        gd.line([(0, y), (W, y)], fill=(r, g, b, 255))
    canvas = Image.alpha_composite(canvas.convert("RGBA"), grad)

    # ── 2) Subtle Kick-green halo (slightly to the right of center)
    # adds a hint of Kick brand presence without overpowering the gold. ──
    halo_green = radial_glow((W, H), (W // 2, 200), 320, KICK_GREEN, max_alpha=30)
    canvas = Image.alpha_composite(canvas, halo_green)
    halo_gold = radial_glow((W, H), (W // 2, 200), 240, GOLD, max_alpha=40)
    canvas = Image.alpha_composite(canvas, halo_gold)

    # ── 3) Thin gold rule above the URL caption ──
    accent = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ad = ImageDraw.Draw(accent)
    ad.rectangle([(0, H - 110), (W, H - 108)], fill=(*GOLD_DARK, 180))
    canvas = Image.alpha_composite(canvas, accent)

    d = ImageDraw.Draw(canvas)

    # ── 4) Empire X logo (top-center) ──
    if LOGO_SRC.exists():
        logo = Image.open(LOGO_SRC).convert("RGBA")
        target_h = 150
        scale = target_h / logo.height
        logo = logo.resize((int(logo.width * scale), target_h), Image.LANCZOS)
        lx = (W - logo.width) // 2
        ly = 50
        canvas.paste(logo, (lx, ly), logo)

    # ── 5) "EMPIRE X" eyebrow (small gold caps) ──
    eyebrow_font = load_font(FONT_CANDIDATES_SANS_BOLD, 22)
    eyebrow = "E M P I R E   X"
    draw_text_centered(d, eyebrow, eyebrow_font, 220, GOLD)

    # ── 6) Big serif title ──
    title_font = load_font(FONT_CANDIDATES_SERIF_BOLD, 96)
    title = "Watch on Kick"
    draw_text_centered(d, title, title_font, 264,
                       fill=GOLD_LIGHT,
                       shadow=(3, 3, (0, 0, 0, 200)))

    # ── 7) Tagline ──
    tagline_font = load_font(FONT_CANDIDATES_SANS_REGULAR, 26)
    tagline = "Watch Empire X live at kick.com/empirex."
    draw_text_centered(d, tagline, tagline_font, 396, CREAM)

    # ── 8) Kick-green pill with bars-glyph + label ──
    label_text = "WATCH LIVE"
    chip_font = load_font(FONT_CANDIDATES_SANS_BOLD, 26)
    bbox = d.textbbox((0, 0), label_text, font=chip_font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    pad_x = 36
    pad_y = 16
    # Build the bars glyph that sits to the left of the text
    bars_h = int(th * 1.05)
    bars = kick_bars_glyph(bars_h, (10, 10, 10))   # black bars on green pill
    gap_glyph_text = 14
    chip_w = pad_x + bars.width + gap_glyph_text + tw + pad_x
    chip_h = th + pad_y * 2
    chip_x = (W - chip_w) // 2
    chip_y = 460

    # Soft blurred shadow under the pill
    shadow_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow_layer)
    sd.rounded_rectangle(
        [(chip_x + 4, chip_y + 6), (chip_x + chip_w + 4, chip_y + chip_h + 6)],
        radius=max(8, chip_h // 2 - 2), fill=(0, 0, 0, 130),
    )
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(radius=3))
    canvas = Image.alpha_composite(canvas, shadow_layer)

    # The pill itself — Kick neon green
    pill_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    pd = ImageDraw.Draw(pill_layer)
    pd.rounded_rectangle(
        [(chip_x, chip_y), (chip_x + chip_w, chip_y + chip_h)],
        radius=max(8, chip_h // 2 - 2),
        fill=(*KICK_GREEN, 255),
    )
    canvas = Image.alpha_composite(canvas, pill_layer)

    # Paste the bars glyph + write the text, both in dark ink for
    # legibility on the neon-green pill.
    bars_x = chip_x + pad_x
    bars_y = chip_y + (chip_h - bars.height) // 2
    canvas.paste(bars, (bars_x, bars_y), bars)

    d = ImageDraw.Draw(canvas)
    text_x = bars_x + bars.width + gap_glyph_text
    text_y = chip_y + (chip_h - th) // 2 - 2
    d.text((text_x, text_y), label_text, font=chip_font, fill=(10, 10, 10, 255))

    # ── 9) URL caption at the bottom ──
    url_font = load_font(FONT_CANDIDATES_SANS_BOLD, 26)
    url = "ourempirex.com/kick"
    draw_text_centered(d, url, url_font, H - 70, GOLD,
                       shadow=(2, 2, (0, 0, 0, 180)))

    # ── 10) Save as JPEG ──
    canvas.convert("RGB").save(OUT, "JPEG", quality=90, optimize=True)
    print(f"wrote {OUT.relative_to(ROOT)}  ({W}x{H}, {OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
