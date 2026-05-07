#!/usr/bin/env python3
"""
Sync the "Featured Our.Empire Streamers Attending" section from
featured-streamers.json into index.html.

Regenerates the entire <!-- FEATURED_STREAMERS_BEGIN --> ...
<!-- FEATURED_STREAMERS_END --> block. The section sits directly below
the "Featured Kick Streamers" section (formerly "Confirmed Streamers")
and uses the same .streamer-card / .streamer-avatar / .streamer-img CSS
hooks for visual parity, MINUS the platform badge and live-status dot
(those are Kick-only). A small description paragraph is added under the
name instead.

Triggered by .github/workflows/sync-streamers.yml on push that touches
featured-streamers.json. Idempotent.
"""
import re
import json
import os
import sys
from html import escape


REPO = os.environ.get(
    'REPO_PATH',
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
)
INDEX = os.path.join(REPO, 'index.html')
DATA = os.path.join(REPO, 'featured-streamers.json')


def slugify(s):
    """Lowercase, strip non-alphanumeric, collapse spaces to hyphens.
    Used for stable per-card DOM IDs (e.g. 'Mike Smalls' -> 'mike-smalls')."""
    s = (s or '').strip().lower()
    s = re.sub(r"[^a-z0-9]+", '-', s)
    return s.strip('-') or 'streamer'


def platform_badge_html(platform):
    """Optional platform label rendered under the name. Mirrors the
    .streamer-platform structure used by the Kick badge, with brand-
    specific image + text. Extensible if more platforms ship later."""
    p = (platform or '').strip().lower()
    if p == 'yubo':
        # Yubo's official mark — yellow square with black smile + white
        # tooth. Rounded-corner img to match the square logo nicely
        # against the dark card background.
        return (
            '<div class="streamer-platform streamer-platform-yubo">'
            '<img class="streamer-platform-icon" src="/yubo-logo.jpg" '
            'alt="Yubo" width="16" height="16" loading="lazy"> YUBO'
            '</div>'
        )
    return ''


def card_html(streamer):
    """One card — <a> when URL provided, plain <div> when not. Same
    .streamer-card class as Featured Kick Streamers so the existing avatar
    / name styling applies. The .featured-streamers selector hides the
    live-status dot (no Yubo live status) but allows .streamer-platform
    so the optional Yubo badge can render."""
    name = streamer.get('name', '').strip()
    description = streamer.get('description', '').strip()
    group = streamer.get('group', '').strip()
    url = streamer.get('url', '').strip()
    initials = streamer.get('initials', '').strip()
    avatar = streamer.get('avatar', '').strip()
    platform = streamer.get('platform', '').strip()
    sid = slugify(name)

    img_html = ''
    if avatar:
        img_html = (
            f'          <img class="streamer-img" src="{escape(avatar, quote=True)}" '
            f'alt="{escape(name, quote=True)}" loading="lazy">\n'
        )

    # description (always shown) + optional group line below it for the
    # cleaner two-line layout.
    desc_html = f'        <div class="streamer-description">{escape(description)}</div>\n'
    group_html = (
        f'        <div class="streamer-group">{escape(group)}</div>\n'
        if group else ''
    )
    badge = platform_badge_html(platform)
    badge_html = f'        {badge}\n' if badge else ''

    inner = (
        f'        <div class="streamer-avatar" id="fs-avatar-{sid}">\n'
        f'          <span class="streamer-initials">{escape(initials)}</span>\n'
        + img_html
        + '        </div>\n'
        f'        <div class="streamer-name">{escape(name)}</div>\n'
        + desc_html
        + group_html
        + badge_html
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

    cards = '\n'.join(card_html(s) for s in streamers)

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
