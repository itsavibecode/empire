#!/usr/bin/env python3
"""
Sync social-bar links from socials.json into the <nav class="social-bar"> block
in index.html.

The icon for each link is hardcoded in this script (one SVG per supported
platform) so the admin can pick a platform from a fixed list in the CMS but
can't introduce custom icons that would clash with the design.

Triggered by .github/workflows/sync-streamers.yml on push that touches
socials.json. Idempotent.
"""
import re
import json
import os
import sys

REPO = os.environ.get(
    'REPO_PATH',
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
)
INDEX = os.path.join(REPO, 'index.html')
SOCIALS = os.path.join(REPO, 'socials.json')

# Each platform's display label (for aria-label) and SVG path data.
# To add a new platform: pick a clean SVG, add it here, also add to the
# dropdown in admin/config.yml. Keep platforms small and curated.
ICONS = {
    'kick': (
        'Kick',
        '<svg viewBox="0 0 24 24" fill="currentColor">'
        '<rect x="4" y="2" width="4" height="20" rx="1"/>'
        '<rect x="10" y="6" width="4" height="12" rx="1"/>'
        '<rect x="16" y="2" width="4" height="20" rx="1"/></svg>'
    ),
    'instagram': (
        'Instagram',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
        'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
        '<rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>'
        '<path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>'
        '<line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>'
    ),
    'obs': (
        'OBS Overlay',
        '<svg viewBox="0 0 24 24" fill="currentColor">'
        '<path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 '
        '2-.9 2-2V5c0-1.1-.9-2-2-2zM21 17H3V5h18v12zM10 16l5-4-5-4z"/></svg>'
    ),
    'discord': (
        'Discord',
        '<svg viewBox="0 0 24 24" fill="currentColor">'
        '<path d="M19.27 5.33A19.79 19.79 0 0 0 14.92 4l-.22.22a14.27 14.27 '
        '0 0 1 4 2.05 13.4 13.4 0 0 0-11.4 0 14.27 14.27 0 0 1 4-2.05L11.08 '
        '4A19.79 19.79 0 0 0 6.73 5.33C2.61 11.36 2.27 17.21 4.45 20.52A18.18 '
        '18.18 0 0 0 9.79 23l.6-.85a12.94 12.94 0 0 1-3.34-1.59l.4-.32a13.86 '
        '13.86 0 0 0 11.1 0l.4.32a12.94 12.94 0 0 1-3.34 1.59l.6.85a18.18 '
        '18.18 0 0 0 5.34-2.48c2.6-3.85 1.84-9.62-1.48-15.19zM9.5 16.5a2.18 '
        '2.18 0 0 1-2-2.31 2.18 2.18 0 0 1 2-2.31 2.18 2.18 0 0 1 2 2.31 '
        '2.18 2.18 0 0 1-2 2.31zm5 0a2.18 2.18 0 0 1-2-2.31 2.18 2.18 0 0 1 '
        '2-2.31 2.18 2.18 0 0 1 2 2.31 2.18 2.18 0 0 1-2 2.31z"/></svg>'
    ),
    'youtube': (
        'YouTube',
        '<svg viewBox="0 0 24 24" fill="currentColor">'
        '<path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 '
        '3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 '
        '0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 '
        '9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136'
        'C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 '
        '12l-6.273 3.568z"/></svg>'
    ),
    'x': (
        'X (Twitter)',
        '<svg viewBox="0 0 24 24" fill="currentColor">'
        '<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817'
        'L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52'
        'h1.833L7.084 4.126H5.117z"/></svg>'
    ),
    'linktree': (
        'Linktree',
        '<svg viewBox="0 0 24 24" fill="currentColor">'
        '<path d="M13.736 5.853l3.323-3.5 2.347 2.235-3.503 3.42h4.97v3.182H15.86'
        'l3.503 3.42-2.347 2.236-4.99-5.073-4.992 5.073-2.346-2.235 3.503-3.42H2.857'
        'V8.008h4.97l-3.503-3.42 2.346-2.236 3.323 3.5V1.337h3.743v4.516zM10 14.7'
        'h3.743V24H10v-9.3z"/></svg>'
    ),
}


def link_html(s):
    platform = s.get('platform')
    url = s.get('url', '').strip()
    if platform not in ICONS:
        sys.exit(f'Unknown platform: {platform!r}. Add it to ICONS in this script first.')
    if not url:
        sys.exit(f'Empty url for platform {platform!r}')
    label, svg = ICONS[platform]
    # Internal links (start with /) shouldn't open in a new tab; external should.
    target = '' if url.startswith('/') else ' target="_blank" rel="noopener"'
    return f'  <a href="{url}"{target} aria-label="{label}">\n    {svg}\n  </a>\n'


def main():
    with open(SOCIALS, 'r', encoding='utf-8') as f:
        data = json.load(f)
    socials = data['socials'] if isinstance(data, dict) else data

    if not socials:
        sys.exit('socials.json is empty')

    with open(INDEX, 'rb') as f:
        raw = f.read()
    le = b'\r\n' if b'\r\n' in raw[:1000] else b'\n'
    html = raw.decode('utf-8').replace('\r\n', '\n')

    links = ''.join(link_html(s) for s in socials)
    new_block = '<nav class="social-bar" aria-label="Social links">\n' + links + '</nav>'

    pat = re.compile(
        r'<nav class="social-bar"[^>]*>.*?</nav>',
        re.DOTALL,
    )
    new_html, n = pat.subn(lambda _: new_block, html, count=1)
    if n != 1:
        sys.exit(f'Failed to find <nav class="social-bar"> block (matched {n})')

    with open(INDEX, 'wb') as f:
        f.write(new_html.replace('\n', le.decode()).encode('utf-8'))

    print(f'Synced {len(socials)} social links into index.html')


if __name__ == '__main__':
    main()
