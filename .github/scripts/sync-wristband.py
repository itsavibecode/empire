#!/usr/bin/env python3
"""
Sync the Wristband section content from wristband.json into index.html.

Regenerates the entire <section class="wristband-section">...</section>
block from the JSON, so the script is fully idempotent.

Triggered by .github/workflows/sync-streamers.yml on push that touches
wristband.json.
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
WRISTBAND = os.path.join(REPO, 'wristband.json')


def main():
    with open(WRISTBAND, 'r', encoding='utf-8') as f:
        data = json.load(f)

    label = data.get('label', '')
    title = data.get('title', '')
    description = data.get('description', '')
    warning = data.get('warning', '')
    image = data.get('image', '')
    image_alt = data.get('image_alt', '')

    if not image:
        sys.exit('wristband.json: image is required')

    # Decap saves uploaded images with a leading slash (public_folder).
    # We render them as-is — index.html lives at the same root so a
    # leading-slash path resolves correctly on the live site.
    section_html = (
        '<section class="wristband-section">\n'
        '  <div class="container">\n'
        '    <div class="wristband-inner reveal">\n'
        '      <div class="wristband-text">\n'
        f'        <div class="section-label">{escape(label)}</div>\n'
        f'        <h3>{escape(title)}</h3>\n'
        f'        <p>{escape(description)}</p>\n'
        f'        <div class="wristband-warning">{escape(warning)}</div>\n'
        '      </div>\n'
        f'      <img class="wristband-img" src="{escape(image, quote=True)}" '
        f'alt="{escape(image_alt, quote=True)}" loading="lazy">\n'
        '    </div>\n'
        '  </div>\n'
        '</section>'
    )

    with open(INDEX, 'rb') as f:
        raw = f.read()
    le = b'\r\n' if b'\r\n' in raw[:1000] else b'\n'
    html = raw.decode('utf-8').replace('\r\n', '\n')

    pat = re.compile(r'<section class="wristband-section">.*?</section>', re.DOTALL)
    new_html, n = pat.subn(lambda _: section_html, html, count=1)
    if n != 1:
        sys.exit(f'Failed to find <section class="wristband-section"> block (matched {n})')

    with open(INDEX, 'wb') as f:
        f.write(new_html.replace('\n', le.decode()).encode('utf-8'))

    print(f'Synced Wristband section into index.html (image={image})')


if __name__ == '__main__':
    main()
