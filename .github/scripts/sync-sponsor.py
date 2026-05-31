#!/usr/bin/env python3
"""
Sync the sponsor block from sponsor.json into index.html.

Writes between <!-- SPONSOR_BEGIN --> ... <!-- SPONSOR_END --> markers
inside the footer. The element is the same regardless of placement —
positioning is controlled entirely by the `sp-placement-<placement>`
class on the anchor (CSS handles top-left position:fixed vs in-flow
footer inline).

  placement: "top-left"  →  fixed in viewport top-left corner
  placement: "footer"    →  centered inside the existing footer

When `enabled: false`, the markers wrap an empty block (no sponsor
renders).

Triggered by .github/workflows/sync-streamers.yml on push that
touches sponsor.json.
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
DATA = os.path.join(REPO, 'sponsor.json')

# Whitelist of acceptable placement values — anything else falls back
# to top-left so a typo in the CMS doesn't blank the sponsor.
VALID_PLACEMENTS = {'top-left', 'footer'}


def build_block(data):
    if not data.get('enabled'):
        # Markers stay in place but the block between them is empty —
        # the sponsor anchor simply doesn't render.
        return ''

    placement = (data.get('placement') or 'top-left').strip()
    if placement not in VALID_PLACEMENTS:
        placement = 'top-left'

    url = (data.get('link_url') or '').strip()
    logo = (data.get('logo_image') or '').strip()
    eyebrow = (data.get('eyebrow_text') or '').strip()
    name = (data.get('name') or '').strip()
    alt = (data.get('alt_text') or name).strip()

    if not (url and logo and name):
        # Required-field check — without one of these we can't render
        # a useful sponsor. Render nothing (markers remain in place
        # so the next sync can repopulate).
        return ''

    aria = f"Sponsored by {name}" if name else "Sponsor link"
    img_w = 64 if placement == 'top-left' else 54
    img_h = img_w

    return (
        f'  <a class="sp-anchor sp-placement-{placement}" '
        f'href="{escape(url, quote=True)}" target="_blank" '
        f'rel="noopener sponsored" '
        f'aria-label="{escape(aria, quote=True)}">\n'
        f'    <img class="sp-logo" src="{escape(logo, quote=True)}" '
        f'alt="{escape(alt, quote=True)}" '
        f'width="{img_w}" height="{img_h}">\n'
        f'    <span class="sp-label">\n'
        f'      <span class="sp-eyebrow">{escape(eyebrow)}</span>\n'
        f'      <span class="sp-name">{escape(name)}</span>\n'
        f'    </span>\n'
        f'  </a>'
    )


def main():
    with open(DATA, 'r', encoding='utf-8') as f:
        data = json.load(f)

    block = build_block(data)

    # Preserve the original file's line endings (CRLF on Windows
    # admin-edited files, LF on Linux CI commits) so a Windows commit
    # roundtripped through CI doesn't show a 2,000-line CRLF diff.
    with open(INDEX, 'rb') as f:
        raw = f.read()
    le = b'\r\n' if b'\r\n' in raw[:1000] else b'\n'
    html = raw.decode('utf-8').replace('\r\n', '\n')

    # Replace EVERYTHING between markers (inclusive of the inner
    # whitespace). Match non-greedy so other markers later in the
    # file don't get swallowed.
    pat = re.compile(
        r'(<!-- SPONSOR_BEGIN -->)(.*?)(<!-- SPONSOR_END -->)',
        re.DOTALL,
    )

    if block:
        replacement = f'<!-- SPONSOR_BEGIN -->\n{block}\n  <!-- SPONSOR_END -->'
    else:
        replacement = '<!-- SPONSOR_BEGIN --><!-- SPONSOR_END -->'

    new_html, n = pat.subn(replacement, html, count=1)
    if n != 1:
        sys.exit(
            'Failed to find SPONSOR_BEGIN/SPONSOR_END markers in '
            f'index.html (matched {n}). Markers must be present '
            'inside the footer-bar div.'
        )

    with open(INDEX, 'wb') as f:
        f.write(new_html.replace('\n', le.decode()).encode('utf-8'))

    if block:
        print(f'Synced sponsor block ({data["name"]}, '
              f'placement={data["placement"]}) into index.html')
    else:
        print('Sponsor disabled or incomplete — no block rendered')


if __name__ == '__main__':
    main()
