#!/usr/bin/env python3
"""
Sync the Featured Group section content from featured-group.json into
index.html.

Regenerates the entire <section class="dtb-section">...</section> block
(class name kept as "dtb-section" because that's how the CSS hooks in,
even though the section is now a generic "featured group" template
rather than DTB-specific).

Triggered by .github/workflows/sync-streamers.yml on push that touches
featured-group.json. Idempotent.
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
FEATURED = os.path.join(REPO, 'featured-group.json')


def detail_html(d):
    icon = d.get('icon', '')
    heading = d.get('heading', '')
    body = d.get('body', '')
    return (
        '        <div class="dtb-detail">\n'
        f'          <div class="dtb-detail-icon">{escape(icon)}</div>\n'
        '          <div class="dtb-detail-text">\n'
        f'            <h4>{escape(heading)}</h4>\n'
        f'            <p>{escape(body)}</p>\n'
        '          </div>\n'
        '        </div>\n'
    )


def main():
    with open(FEATURED, 'r', encoding='utf-8') as f:
        data = json.load(f)

    label = data.get('label', '')
    name = data.get('name', '')
    tagline = data.get('tagline', '')
    description = data.get('description', '')
    details = data.get('details', [])
    house_image = data.get('house_image', '')
    house_image_alt = data.get('house_image_alt', '')

    if not house_image:
        sys.exit('featured-group.json: house_image is required')

    # The tagline (e.g. "🏆 Hall of Fame Group") is optional. If empty,
    # the line is omitted entirely so it doesn't render an empty pill.
    tagline_html = (
        f'        <div class="dtb-hall-of-fame">{escape(tagline)}</div>\n'
        if tagline.strip()
        else ''
    )

    # Details list is rendered with one or more rows separated by an
    # empty-line spacer (matches the existing markup verbatim).
    details_block = '\n'.join(detail_html(d).rstrip('\n') for d in details)
    if details_block:
        details_block += '\n'

    section_html = (
        '<section class="dtb-section">\n'
        '  <div class="container">\n'
        '    <div class="reveal">\n'
        f'      <div class="section-label">{escape(label)}</div>\n'
        f'      <h2 class="section-title">{escape(name)}</h2>\n'
        '    </div>\n'
        '    <div class="dtb-grid reveal">\n'
        '      <div class="dtb-details">\n'
        + tagline_html
        + f'        <p class="section-desc" style="max-width:100%;">{escape(description)}</p>\n'
        + details_block
        + '      </div>\n'
        f'      <img class="dtb-house-img" src="{escape(house_image, quote=True)}" '
        f'alt="{escape(house_image_alt, quote=True)}" loading="lazy">\n'
        '    </div>\n'
        '  </div>\n'
        '</section>'
    )

    with open(INDEX, 'rb') as f:
        raw = f.read()
    le = b'\r\n' if b'\r\n' in raw[:1000] else b'\n'
    html = raw.decode('utf-8').replace('\r\n', '\n')

    pat = re.compile(r'<section class="dtb-section">.*?</section>', re.DOTALL)
    new_html, n = pat.subn(lambda _: section_html, html, count=1)
    if n != 1:
        sys.exit(f'Failed to find <section class="dtb-section"> block (matched {n})')

    with open(INDEX, 'wb') as f:
        f.write(new_html.replace('\n', le.decode()).encode('utf-8'))

    print(
        f'Synced Featured Group section into index.html '
        f'(group={name}, {len(details)} details, image={house_image})'
    )


if __name__ == '__main__':
    main()
