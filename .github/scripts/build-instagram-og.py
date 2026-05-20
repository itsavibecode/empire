"""
Build the Open Graph share image for /instagram.

Renders a 1200x630 banner that previews on iMessage / Discord / X /
LinkedIn / Slack / etc. when someone pastes
https://ourempirex.com/instagram.

Mirrors build-discord-og.py's layout — Empire X crown logo at the
top, gold serif title, single-line tagline, branded pill, URL caption
— but with Instagram's gradient (yellow → pink → purple) in place of
Discord blurple.

Output: /instagram/og-instagram.jpg

Re-run any time the messaging changes. Social platforms cache the
image for weeks once they crawl it, so the URL stays stable while
the file contents can be regenerated.
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
LOGO_SRC = ROOT / "logo.png"
OUT = ROOT / "instagram" / "og-instagram.jpg"

W, H = 1200, 630

# Brand palette
GOLD       = (212, 168, 67)
GOLD_LIGHT = (240, 214, 138)
GOLD_DARK  = (161, 122, 40)
CREAM      = (245, 241, 235)
INK        = (10, 10, 10)

# Instagram brand gradient stops (warm yellow → orange → pink → magenta
# → purple). Matches the logomark's official ramp closely enough that
# anyone who's seen Instagram before recognizes it instantly.
IG_STOPS = [
    (0.00, (252, 175, 69)),    # warm yellow
    (0.20, (247, 119, 55)),    # orange
    (0.50, (225, 48, 108)),    # hot pink
    (0.75, (193, 53, 132)),    # magenta
    (1.00, (131, 58, 180)),    # purple
]

# Font lookup (same cross-platform fallbacks used by build-discord-og.py).
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


def gradient_pill(size, stops, angle_deg=45):
    """Render a left-to-right (rotated) linear gradient into an RGBA
    image of the given size. Used as the pill background — we then
    mask it to the pill shape later."""
    w, h = size
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = img.load()
    # Diagonal gradient. Project each pixel onto the unit vector at
    # angle_deg and sample the stop list.
    import math
    rad = math.radians(angle_deg)
    ux, uy = math.cos(rad), math.sin(rad)
    # Pre-compute projections of the four corners to find the range.
    corners = [(0, 0), (w, 0), (0, h), (w, h)]
    projs = [x * ux + y * uy for (x, y) in corners]
    p_min, p_max = min(projs), max(projs)
    span = p_max - p_min or 1
    # Sort stops once
    s = sorted(stops, key=lambda x: x[0])
    for y in range(h):
        for x in range(w):
            t = (x * ux + y * uy - p_min) / span
            # Find the two stops bracketing t
            c = s[-1][1]
            for i in range(len(s) - 1):
                a, b = s[i], s[i + 1]
                if a[0] <= t <= b[0]:
                    if b[0] == a[0]:
                        c = a[1]
                    else:
                        lerp = (t - a[0]) / (b[0] - a[0])
                        c = (
                            int(a[1][0] + (b[1][0] - a[1][0]) * lerp),
                            int(a[1][1] + (b[1][1] - a[1][1]) * lerp),
                            int(a[1][2] + (b[1][2] - a[1][2]) * lerp),
                        )
                    break
            px[x, y] = (*c, 255)
    return img


def draw_gradient_pill(canvas, rect, stops, radius):
    """Draw a rounded-rectangle pill filled with the given gradient,
    composited onto `canvas`. rect = (x0, y0, x1, y1)."""
    x0, y0, x1, y1 = rect
    w = x1 - x0
    h = y1 - y0
    # 1) Build the gradient swatch.
    grad = gradient_pill((w, h), stops, angle_deg=20)
    # 2) Build a mask = rounded rectangle.
    mask = Image.new("L", (w, h), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([(0, 0), (w - 1, h - 1)], radius=radius, fill=255)
    # 3) Apply the mask to the gradient.
    grad.putalpha(mask)
    # 4) Composite onto the canvas.
    canvas.alpha_composite(grad, (x0, y0))


def main():
    if not OUT.parent.exists():
        OUT.parent.mkdir(parents=True, exist_ok=True)

    # ── 1) Background — same vertical near-black-to-warm gradient as
    # the Discord card so the two banners feel like a set. ──
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

    # ── 2) Soft gold halo behind the logo ──
    halo = radial_glow((W, H), (W // 2, 200), 280, GOLD, max_alpha=46)
    canvas = Image.alpha_composite(canvas, halo)

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
    title_font = load_font(FONT_CANDIDATES_SERIF_BOLD, 86)
    title = "Follow on Instagram"
    draw_text_centered(d, title, title_font, 264,
                       fill=GOLD_LIGHT,
                       shadow=(3, 3, (0, 0, 0, 200)))

    # ── 7) Tagline ──
    tagline_font = load_font(FONT_CANDIDATES_SANS_REGULAR, 26)
    tagline = "The official Empire X account for live event coverage."
    draw_text_centered(d, tagline, tagline_font, 396, CREAM)

    # ── 8) Instagram-gradient pill ──
    chip_text = "@OUR.EMPIRE"
    chip_font = load_font(FONT_CANDIDATES_SANS_BOLD, 26)
    bbox = d.textbbox((0, 0), chip_text, font=chip_font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    pad_x = 40
    pad_y = 16
    chip_w = tw + pad_x * 2
    chip_h = th + pad_y * 2
    chip_x = (W - chip_w) // 2
    chip_y = 460

    # Soft shadow under the pill — drawn directly on a transparent
    # layer so the gradient on top isn't darkened.
    shadow_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow_layer)
    sd.rounded_rectangle(
        [(chip_x + 4, chip_y + 6), (chip_x + chip_w + 4, chip_y + chip_h + 6)],
        radius=max(8, chip_h // 2 - 2), fill=(0, 0, 0, 130),
    )
    # Blur the shadow a touch
    from PIL import ImageFilter
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(radius=3))
    canvas = Image.alpha_composite(canvas, shadow_layer)

    # Gradient-filled pill
    draw_gradient_pill(canvas,
                       (chip_x, chip_y, chip_x + chip_w, chip_y + chip_h),
                       IG_STOPS,
                       radius=max(8, chip_h // 2 - 2))

    # Pill label — white text centered in the pill
    d = ImageDraw.Draw(canvas)
    cx = chip_x + (chip_w - tw) // 2
    cy = chip_y + (chip_h - th) // 2 - 2
    d.text((cx, cy), chip_text, font=chip_font, fill=(255, 255, 255, 255))

    # ── 9) URL caption at the bottom ──
    url_font = load_font(FONT_CANDIDATES_SANS_BOLD, 26)
    url = "ourempirex.com/instagram"
    draw_text_centered(d, url, url_font, H - 70, GOLD,
                       shadow=(2, 2, (0, 0, 0, 180)))

    # ── 10) Save as JPEG ──
    canvas.convert("RGB").save(OUT, "JPEG", quality=90, optimize=True)
    print(f"wrote {OUT.relative_to(ROOT)}  ({W}x{H}, {OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
