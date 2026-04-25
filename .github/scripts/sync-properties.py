#!/usr/bin/env python3
"""
Sync property-derived blocks from properties.json into index.html.

Triggered by .github/workflows/sync-streamers.yml on push that touches
properties.json. Idempotent: running with no JSON changes produces no diff.
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
PROPS = os.path.join(REPO, 'properties.json')


def card_html(p):
    """Generate one property card. 6-space indent matches the surrounding HTML."""
    host = f'Hosted by Empire Group, {p["host_group"]}'
    if p.get('date_range'):
        # Restore HTML entity for the en-dash so it matches the rest of the file
        date = p['date_range'].replace('-', '&ndash;')
        host = f'{host} &bull; {date}'
    return (
        f'      <div class="house-card">\n'
        f'        <img src="{p["image"]}" alt="{p["title"]}" loading="lazy">\n'
        f'        <div class="house-card-info">\n'
        f'          <div class="house-card-title">{p["title"]}</div>\n'
        f'          <div class="house-card-host">{host}</div>\n'
        f'        </div>\n'
        f'        <div class="house-card-badge">{p["badge"]}</div>\n'
        f'      </div>\n'
    )


def main():
    with open(PROPS, 'r', encoding='utf-8') as f:
        data = json.load(f)
    properties = data['properties'] if isinstance(data, dict) else data

    if not properties:
        sys.exit('properties.json is empty')

    with open(INDEX, 'rb') as f:
        raw = f.read()
    le = b'\r\n' if b'\r\n' in raw[:1000] else b'\n'
    html = raw.decode('utf-8').replace('\r\n', '\n')

    cards = ''.join(card_html(p) for p in properties)

    # Replace the entire houses-grid block including its open/close.
    # Anchor pattern is unique (only the houses section ends this way).
    # Always emit the same canonical form so the script is idempotent.
    pat = re.compile(
        r'<div class="houses-grid reveal">\n'
        r'.*?'
        r'    </div>\n  </div>\n</section>',
        re.DOTALL,
    )
    new_block = (
        '<div class="houses-grid reveal">\n'
        + cards
        + '    </div>\n  </div>\n</section>'
    )
    new_html, n = pat.subn(lambda _: new_block, html, count=1)
    if n != 1:
        sys.exit(f'Failed to find houses-grid block (matched {n} times)')

    with open(INDEX, 'wb') as f:
        f.write(new_html.replace('\n', le.decode()).encode('utf-8'))

    print(f'Synced {len(properties)} properties into index.html')


if __name__ == '__main__':
    main()
