"""
Build the Open Graph share image for /discord.

Renders a 1200x630 banner that previews on Discord / X / iMessage /
LinkedIn / Slack / etc. when someone pastes https://ourempirex.com/discord.

Composition:
  - Dark background with a subtle radial gold glow + diagonal Discord-
    blurple accent strip in the lower third so the brand association
    reads at a glance.
  - Empire X crown+handshake logo, top-center.
  - "EMPIRE X" eyebrow (small gold caps, Oswald-like sans).
  - "JOIN THE DISCORD" big serif title, gold gradient.
  - Single-line tagline.
  - Discord-blurple pill ("Empire X Community" + Discord glyph).
  - "ourempirex.com/discord" URL caption at the bottom.

Output: /discord/og-discord.jpg

Re-run any time the messaging changes. Social platforms cache the
image for weeks once they crawl it, so the URL stays stable while
the file contents can be regenerated.
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
LOGO_SRC = ROOT / "logo.png"
OUT = ROOT / "discord" / "og-discord.jpg"

W, H = 1200, 630

# Brand palette — pulled from index.html :root vars so the OG image
# matches the rest of the site.
GOLD       = (212, 168, 67)
GOLD_LIGHT = (240, 214, 138)
GOLD_DARK  = (161, 122, 40)
CREAM      = (245, 241, 235)
INK        = (10, 10, 10)
INK_CARD   = (17, 17, 17)
DISCORD_BLURPLE = (88, 101, 242)
DISCORD_DARK    = (71, 82, 196)

# Cross-platform font lookup. Windows / macOS / Linux defaults — falls
# back to PIL's tiny bitmap font if none are found (uglier but still
# produces a valid image rather than crashing).
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
    """Draw text centered horizontally at the given y. Returns (x, w, h)."""
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
    """Build a radial-gradient overlay — used for the soft gold halo
    behind the Empire logo."""
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


def main():
    if not OUT.parent.exists():
        OUT.parent.mkdir(parents=True, exist_ok=True)

    # ── 1) Background — dark ink with a vertical gradient toward a
    # slightly warmer black at the bottom so the page doesn't read as
    # totally flat. ──
    canvas = Image.new("RGB", (W, H), INK)
    grad = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grad)
    for y in range(H):
        t = y / H
        # Top stays #0A0A0A, bottom drifts toward #1A1208 (warm gold tint)
        r = int(10 + (26 - 10) * t)
        g = int(10 + (18 - 10) * t)
        b = int(10 + (8 - 10) * t)
        gd.line([(0, y), (W, y)], fill=(r, g, b, 255))
    canvas = Image.alpha_composite(canvas.convert("RGBA"), grad)

    # ── 2) Soft gold halo behind where the logo will sit ──
    halo = radial_glow((W, H), (W // 2, 200), 280, GOLD, max_alpha=46)
    canvas = Image.alpha_composite(canvas, halo)

    # ── 3) Discord-blurple diagonal accent strip in the lower third ──
    accent = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ad = ImageDraw.Draw(accent)
    # Thin gold rule above the URL
    ad.rectangle([(0, H - 110), (W, H - 108)], fill=(*GOLD_DARK, 180))
    # Discord-blurple pill area — actually drawn as the chip below
    canvas = Image.alpha_composite(canvas, accent)

    d = ImageDraw.Draw(canvas)

    # ── 4) Empire X logo (top-center) ──
    if LOGO_SRC.exists():
        logo = Image.open(LOGO_SRC).convert("RGBA")
        # Target ~150px tall; preserve aspect.
        target_h = 150
        scale = target_h / logo.height
        logo = logo.resize((int(logo.width * scale), target_h), Image.LANCZOS)
        lx = (W - logo.width) // 2
        ly = 50
        canvas.paste(logo, (lx, ly), logo)

    # ── 5) "EMPIRE X" eyebrow (small gold caps) ──
    eyebrow_font = load_font(FONT_CANDIDATES_SANS_BOLD, 22)
    # Manually space the letters since PIL doesn't honor CSS letter-spacing.
    eyebrow = "E M P I R E   X"
    draw_text_centered(d, eyebrow, eyebrow_font, 220, GOLD)

    # ── 6) Big serif title ──
    title_font = load_font(FONT_CANDIDATES_SERIF_BOLD, 96)
    title = "Join the Discord"
    # Drop shadow for depth, then the main title in gold-light.
    draw_text_centered(d, title, title_font, 264,
                       fill=GOLD_LIGHT,
                       shadow=(3, 3, (0, 0, 0, 200)))

    # ── 7) Tagline ──
    tagline_font = load_font(FONT_CANDIDATES_SANS_REGULAR, 26)
    tagline = "Chat with the streamers and the Empire X community."
    draw_text_centered(d, tagline, tagline_font, 396, CREAM)

    # ── 8) Discord-blurple chip ──
    # Manually drawn rounded-rectangle pill with "JOIN US ON DISCORD"
    # text. Lives in the empty space above the bottom rule.
    chip_text = "JOIN US ON DISCORD"
    chip_font = load_font(FONT_CANDIDATES_SANS_BOLD, 24)
    bbox = d.textbbox((0, 0), chip_text, font=chip_font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    pad_x = 36
    pad_y = 16
    chip_w = tw + pad_x * 2
    chip_h = th + pad_y * 2
    chip_x = (W - chip_w) // 2
    chip_y = 460
    chip_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    cd = ImageDraw.Draw(chip_layer)
    # Soft shadow under the chip
    cd.rounded_rectangle(
        [(chip_x + 4, chip_y + 5), (chip_x + chip_w + 4, chip_y + chip_h + 5)],
        radius=max(8, chip_h // 2 - 2), fill=(0, 0, 0, 110),
    )
    # The chip itself — Discord blurple
    cd.rounded_rectangle(
        [(chip_x, chip_y), (chip_x + chip_w, chip_y + chip_h)],
        radius=max(8, chip_h // 2 - 2), fill=(*DISCORD_BLURPLE, 255),
    )
    canvas = Image.alpha_composite(canvas, chip_layer)
    d = ImageDraw.Draw(canvas)
    # Chip text — white, centered vertically inside the chip
    chip_text_x = chip_x + (chip_w - tw) // 2
    chip_text_y = chip_y + (chip_h - th) // 2 - 2  # tiny optical lift
    d.text((chip_text_x, chip_text_y), chip_text, font=chip_font, fill=(255, 255, 255, 255))

    # ── 9) URL caption at the bottom ──
    url_font = load_font(FONT_CANDIDATES_SANS_BOLD, 26)
    url = "ourempirex.com/discord"
    draw_text_centered(d, url, url_font, H - 70, GOLD,
                       shadow=(2, 2, (0, 0, 0, 180)))

    # ── 10) Save as JPEG (smaller than PNG for OG; quality 90 is plenty) ──
    canvas.convert("RGB").save(OUT, "JPEG", quality=90, optimize=True)
    print(f"wrote {OUT.relative_to(ROOT)}  ({W}x{H}, {OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
