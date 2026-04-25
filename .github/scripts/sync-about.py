#!/usr/bin/env python3
"""
Sync the About The Event section from about.json into index.html.

The whole <section class="about">...</section> block is regenerated from
the JSON each time, so the script is fully idempotent.

Triggered by .github/workflows/sync-streamers.yml on push that touches
about.json.
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
ABOUT = os.path.join(REPO, 'about.json')


def detail_html(d):
    return (
        '        <div class="about-detail">\n'
        f'          <h4>{d["heading"]}</h4>\n'
        f'          <p>{d["body"]}</p>\n'
        '        </div>\n'
    )


def main():
    with open(ABOUT, 'r', encoding='utf-8') as f:
        data = json.load(f)

    label = data['label']
    # Multi-line title becomes <br>-separated single line in HTML
    title = data['title'].replace('\n', '<br>')
    # Description: keep as-is (single paragraph)
    description = data['description']
    image = data['flyer_image']
    details = data.get('details', [])

    section_html = (
        '<section class="about">\n'
        '  <div class="container">\n'
        '    <div class="reveal">\n'
        f'      <div class="section-label">{label}</div>\n'
        f'      <h2 class="section-title">{title}</h2>\n'
        f'      <p class="section-desc">{description}</p>\n'
        '    </div>\n'
        '    <div class="about-grid reveal">\n'
        f'      <img src="{image}" alt="EmpireX flyer" class="about-flyer" loading="lazy">\n'
        '      <div class="about-details">\n'
        + ''.join(detail_html(d) for d in details)
        + '      </div>\n'
        '    </div>\n'
        '  </div>\n'
        '</section>'
    )

    with open(INDEX, 'rb') as f:
        raw = f.read()
    le = b'\r\n' if b'\r\n' in raw[:1000] else b'\n'
    html = raw.decode('utf-8').replace('\r\n', '\n')

    pat = re.compile(r'<section class="about">.*?</section>', re.DOTALL)
    new_html, n = pat.subn(lambda _: section_html, html, count=1)
    if n != 1:
        sys.exit(f'Failed to find <section class="about"> block (matched {n})')

    with open(INDEX, 'wb') as f:
        f.write(new_html.replace('\n', le.decode()).encode('utf-8'))

    print(f'Synced About section ({len(details)} detail rows) into index.html')


if __name__ == '__main__':
    main()
