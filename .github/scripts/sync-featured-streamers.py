#!/usr/bin/env python3
"""
Sync the "Featured Our.Empire Streamers Attending" section from
featured-streamers.json into index.html.

Regenerates the entire <!-- FEATURED_STREAMERS_BEGIN --> ...
<!-- FEATURED_STREAMERS_END --> block. The section sits directly below
the "Featured Kick Streamers" section (formerly "Confirmed Streamers")
and uses the same .streamer-card / .streamer-avatar / .streamer-img CSS
hooks for visual parity, MINUS the live-status dot (Kick-only). A small
description paragraph is added under the name instead.

Badge config (v0.13.12+) is SECTION-LEVEL — one badge applied to all
cards. Editors set badge_icon (kick / yubo / twitch / tiktok / empire /
custom), optional badge_text override, optional custom-icon upload, and
a badge_hidden checkbox to drop the badge entirely.

Triggered by .github/workflows/sync-streamers.yml on push that touches
featured-streamers.json. Idempotent.
"""
import re
import json
import os
import sys
from datetime import date, datetime, timedelta
from html import escape


REPO = os.environ.get(
    'REPO_PATH',
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
)
INDEX = os.path.join(REPO, 'index.html')
DATA = os.path.join(REPO, 'featured-streamers.json')

# JUST ADDED corner ribbon — same 5-day window as Featured Kick
# Streamers (sync-streamers.py). Mirrors that script's logic so editors
# get the same behavior across both sections: add a row, save, the
# next sync stamps `added_at` to today, badge appears for 5 days.
JUST_ADDED_TTL_DAYS = 5


# --- Section-level badge presets ---------------------------------------
# Each preset defines the icon HTML (inline SVG for crisp vector marks /
# <img> for raster brand assets that live as files in the repo) plus
# default badge text. badge_text in featured-streamers.json can override
# the default. The wrapper <div class="streamer-platform"> is appended
# with a brand-class so the right color rule applies.
KICK_SVG = (
    '<svg class="streamer-platform-svg" width="14" height="14" '
    'viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">'
    '<rect x="4" y="2" width="4" height="20" rx="1"/>'
    '<rect x="10" y="6" width="4" height="12" rx="1"/>'
    '<rect x="16" y="2" width="4" height="20" rx="1"/></svg>'
)
TWITCH_SVG = (
    '<svg class="streamer-platform-svg" width="14" height="14" '
    'viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">'
    '<path d="M4 2 2 6v14h5v3h3l3-3h4l5-5V2H4zm16 11-3 3h-4l-3 3v-3H7V4h13v9zm-4-6h2v5h-2V7zm-5 0h2v5h-2V7z"/>'
    '</svg>'
)
TIKTOK_SVG = (
    '<svg class="streamer-platform-svg" width="14" height="14" '
    'viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">'
    '<path d="M19.6 6.3c-1.4-.3-2.6-1.2-3.3-2.4-.4-.7-.6-1.5-.6-2.4h-3.4v13.6c0 1.7-1.4 3.1-3.1 3.1s-3.1-1.4-3.1-3.1 1.4-3.1 3.1-3.1c.3 0 .7.1 1 .2v-3.5c-.3-.1-.7-.1-1-.1-3.7 0-6.6 3-6.6 6.6S5.5 22 9.2 22s6.6-3 6.6-6.6V9.1c1.4.9 3 1.4 4.7 1.4V7.1c-.4 0-.7 0-.9-.1z"/>'
    '</svg>'
)
YUBO_IMG = (
    '<img class="streamer-platform-icon" src="/yubo-logo.jpg" '
    'alt="" width="16" height="16" loading="lazy">'
)
# Empire mark uses the existing site logo. Picture/WebP wrapper isn't
# needed here — the badge is tiny (16px) so PNG is fine, and WebP-only
# would break the fallback. img alone keeps it simple.
EMPIRE_IMG = (
    '<img class="streamer-platform-icon streamer-platform-icon-empire" '
    'src="/logo.png" alt="" width="16" height="16" loading="lazy">'
)

PRESETS = {
    'kick': {
        'icon': KICK_SVG,
        'text': 'KICK',
        'cls': 'streamer-platform-kick',
    },
    'yubo': {
        'icon': YUBO_IMG,
        'text': 'YUBO',
        'cls': 'streamer-platform-yubo',
    },
    'twitch': {
        'icon': TWITCH_SVG,
        'text': 'TWITCH',
        'cls': 'streamer-platform-twitch',
    },
    'tiktok': {
        'icon': TIKTOK_SVG,
        'text': 'TIKTOK',
        'cls': 'streamer-platform-tiktok',
    },
    'empire': {
        'icon': EMPIRE_IMG,
        'text': 'OUR.EMPIRE',
        'cls': 'streamer-platform-empire',
    },
    # 'custom' is resolved at render time using badge_custom_icon — it
    # has no preset icon HTML. text defaults to '' (editor should supply).
    'custom': {
        'icon': None,
        'text': '',
        'cls': 'streamer-platform-custom',
    },
}


def build_section_badge(data):
    """Build the per-card badge HTML once from section-level config.
    Returns an empty string when the section opts out via badge_hidden.

    The same string is injected into every card by card_html() — no
    per-card platform field anymore (v0.13.12 dropped that in favor of
    one section-wide knob)."""
    if data.get('badge_hidden'):
        return ''

    icon_key = (data.get('badge_icon') or 'empire').strip().lower()
    preset = PRESETS.get(icon_key, PRESETS['empire'])
    text_override = (data.get('badge_text') or '').strip()
    text = text_override if text_override else preset['text']

    # Resolve the icon. Custom needs the uploaded image path.
    if icon_key == 'custom':
        custom_src = (data.get('badge_custom_icon') or '').strip()
        if custom_src:
            icon_html = (
                f'<img class="streamer-platform-icon streamer-platform-icon-custom" '
                f'src="{escape(custom_src, quote=True)}" alt="" '
                f'width="16" height="16" loading="lazy">'
            )
        else:
            icon_html = ''
    else:
        icon_html = preset['icon']

    # If both icon and text are empty there's nothing to render; bail.
    if not icon_html and not text:
        return ''

    # Compose. Wrap text in a span so CSS can style icon/text separately.
    text_html = f'<span class="streamer-platform-text">{escape(text)}</span>' if text else ''
    icon_part = icon_html or ''
    spacer = ' ' if (icon_html and text) else ''
    return (
        f'<div class="streamer-platform {preset["cls"]}">'
        f'{icon_part}{spacer}{text_html}</div>'
    )


def is_just_added(s, today=None):
    raw = s.get('added_at')
    if not raw:
        return False
    try:
        if 'T' in raw:
            d = datetime.fromisoformat(raw.replace('Z', '+00:00')).date()
        else:
            d = date.fromisoformat(raw)
    except ValueError:
        return False
    if today is None:
        today = date.today()
    return (today - d) <= timedelta(days=JUST_ADDED_TTL_DAYS) and d <= today


def ensure_added_at_dates(streamers, today=None):
    """Auto-fill `added_at` with today's ISO date for any streamer
    missing one. Returns True if any rows were modified (so caller
    knows to write featured-streamers.json back). Editors don't need
    to think about this — adding a row in Decap and saving auto-stamps
    the date on the next sync run, and the JUST ADDED badge appears
    for the next 5 days."""
    if today is None:
        today = date.today()
    today_iso = today.isoformat()
    changed = False
    for s in streamers:
        if not s.get('added_at'):
            s['added_at'] = today_iso
            changed = True
    return changed


def slugify(s):
    """Lowercase, strip non-alphanumeric, collapse spaces to hyphens.
    Used for stable per-card DOM IDs (e.g. 'Mike Smalls' -> 'mike-smalls')."""
    s = (s or '').strip().lower()
    s = re.sub(r"[^a-z0-9]+", '-', s)
    return s.strip('-') or 'streamer'


def card_html(streamer, badge_html, today=None):
    """One card — <a> when URL provided, plain <div> when not. Same
    .streamer-card class as Featured Kick Streamers so the existing avatar
    / name styling applies. The .featured-streamers selector hides the
    live-status dot (no live status on these cards) but allows
    .streamer-platform so the section-wide badge can render below the
    name. JUST ADDED corner ribbon appears when added_at is within the
    last 5 days. `badge_html` is the same string for every card — built
    once from section-level config in build_section_badge()."""
    name = streamer.get('name', '').strip()
    description = streamer.get('description', '').strip()
    group = streamer.get('group', '').strip()
    url = streamer.get('url', '').strip()
    initials = streamer.get('initials', '').strip()
    avatar = streamer.get('avatar', '').strip()
    sid = slugify(name)

    img_html = ''
    if avatar:
        img_html = (
            f'          <img class="streamer-img" src="{escape(avatar, quote=True)}" '
            f'alt="{escape(name, quote=True)}" loading="lazy">\n'
        )

    # JUST ADDED corner ribbon — only on cards added within the last 5
    # days. data-added timestamps the badge so a future JS-side decay
    # check could hide it before the next sync runs (mirrors the Kick
    # section's pattern).
    just_added_html = ''
    if is_just_added(streamer, today):
        just_added_html = (
            f'        <div class="streamer-just-added" '
            f'data-added="{streamer["added_at"]}">JUST ADDED</div>\n'
        )

    # description (always shown) + optional group line below it for the
    # cleaner two-line layout.
    desc_html = f'        <div class="streamer-description">{escape(description)}</div>\n'
    group_html = (
        f'        <div class="streamer-group">{escape(group)}</div>\n'
        if group else ''
    )
    badge_line_html = f'        {badge_html}\n' if badge_html else ''

    inner = (
        just_added_html
        + f'        <div class="streamer-avatar" id="fs-avatar-{sid}">\n'
        f'          <span class="streamer-initials">{escape(initials)}</span>\n'
        + img_html
        + '        </div>\n'
        f'        <div class="streamer-name">{escape(name)}</div>\n'
        + desc_html
        + group_html
        + badge_line_html
    )
    # Trim trailing newline of inner so the closing tag is tidy
    inner = inner.rstrip('\n')

    if url:
        return (
            f'      <a class="streamer-card" href="{escape(url, quote=True)}" target="_blank" rel="noopener">\n'
            + inner + '\n'
            '      </a>'
        )
    return (
        '      <div class="streamer-card streamer-card-static">\n'
        + inner + '\n'
        '      </div>'
    )


def main():
    with open(DATA, 'r', encoding='utf-8') as f:
        data = json.load(f)

    section_label = data.get('section_label', '').strip()
    title = data.get('title', 'Featured Our.Empire Streamers').strip()
    subtitle = data.get('subtitle', '').strip()
    streamers = data.get('streamers', [])

    # AUTO-FILL added_at for any streamer missing one. Same flow as
    # sync-streamers.py — editor adds a row in Decap, saves, the next
    # sync stamps today's date and the JUST ADDED badge appears for
    # the next 5 days. The workflow's commit step adds
    # featured-streamers.json so the auto-filled date persists.
    if ensure_added_at_dates(streamers):
        with open(DATA, 'w', encoding='utf-8', newline='') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write('\n')
        print('Auto-filled added_at for new featured streamers; wrote featured-streamers.json back')

    # Build the section-wide badge once; every card gets the same string.
    badge_html = build_section_badge(data)

    cards = '\n'.join(card_html(s, badge_html) for s in streamers)

    section_label_html = (
        f'      <div class="section-label">{escape(section_label)}</div>\n'
        if section_label else ''
    )
    subtitle_html = (
        f'      <p class="section-desc">{escape(subtitle)}</p>\n'
        if subtitle else ''
    )

    block = (
        '<!-- FEATURED_STREAMERS_BEGIN -->\n'
        '<section class="streamers featured-streamers" data-grayscale="false">\n'
        '  <div class="container">\n'
        '    <div class="reveal">\n'
        + section_label_html
        + f'      <h2 class="section-title">{escape(title)}</h2>\n'
        + subtitle_html
        + '    </div>\n'
        '    <div class="streamers-grid reveal">\n'
        '    <div class="streamers-regular-grid">\n'
        + cards + '\n'
        '    </div>\n'
        '    </div>\n'
        '  </div>\n'
        '</section>\n'
        '<!-- FEATURED_STREAMERS_END -->'
    )

    with open(INDEX, 'rb') as f:
        raw = f.read()
    le = b'\r\n' if b'\r\n' in raw[:1000] else b'\n'
    html = raw.decode('utf-8').replace('\r\n', '\n')

    pat = re.compile(
        r'<!-- FEATURED_STREAMERS_BEGIN -->.*?<!-- FEATURED_STREAMERS_END -->',
        re.DOTALL,
    )
    new_html, n = pat.subn(lambda _: block, html, count=1)
    if n != 1:
        sys.exit(
            'Failed to find FEATURED_STREAMERS_BEGIN/END markers in '
            f'index.html (matched {n}). Markers must be present after '
            '<section class="streamers"> (Featured Kick Streamers).'
        )

    with open(INDEX, 'wb') as f:
        f.write(new_html.replace('\n', le.decode()).encode('utf-8'))

    print(f'Synced Featured Our.Empire Streamers ({len(streamers)} cards) into index.html')


if __name__ == '__main__':
    main()
