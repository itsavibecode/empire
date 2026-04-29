#!/usr/bin/env python3
"""
Sync the Hall of Fame block content from hall-of-fame.json into index.html.

Regenerates the entire <!-- HALL_OF_FAME_BEGIN --> ... <!-- HALL_OF_FAME_END -->
block (which lives inside <section class="cta-footer"> above the
"Ready to Join Empire X?" footer).

Triggered by .github/workflows/sync-streamers.yml on push that touches
hall-of-fame.json. Idempotent.

Auto-numbers ranks (01, 02, 03 ...) from the JSON array order — drag-to-
reorder in the CMS just works.
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
DATA = os.path.join(REPO, 'hall-of-fame.json')

# 2-letter ISO country code -> English name for the alt/title attribute.
# Flags are rendered as <img src="flags/{code}.svg"> from local SVGs
# (lipis/flag-icons, MIT) — Windows Chromium ships without
# regional-indicator emoji glyphs, so the prior emoji approach showed
# bare letters ("US", "MX") on Windows. SVGs render identically everywhere.
COUNTRY_NAMES = {
    'us': 'United States', 'ca': 'Canada', 'mx': 'Mexico',
    'co': 'Colombia', 'br': 'Brazil', 'ar': 'Argentina',
    'cl': 'Chile', 'pe': 'Peru', 've': 'Venezuela',
    'es': 'Spain', 'gb': 'United Kingdom', 'ie': 'Ireland',
    'fr': 'France', 'de': 'Germany', 'it': 'Italy',
    'nl': 'Netherlands', 'se': 'Sweden', 'pl': 'Poland',
    'jp': 'Japan', 'kr': 'South Korea', 'cn': 'China',
    'in': 'India', 'ph': 'Philippines', 'au': 'Australia',
}


def country_code(code):
    code = (code or 'us').strip().lower()
    if len(code) != 2 or not code.isalpha():
        code = 'us'
    return code


def country_title(code):
    return COUNTRY_NAMES.get(country_code(code), code or '')


def row_html(idx, group):
    rank = f'{idx + 1:02d}.'
    name = group.get('name', '').strip()
    abbrev = group.get('abbreviation', '').strip()
    url = group.get('url', '').strip()
    emoji = group.get('emoji', '').strip()
    country = group.get('country', 'us').strip().lower()

    # Compose the inner name HTML: name [+ abbreviation] [+ emoji]
    inner = escape(name)
    if abbrev:
        inner += f' <span class="hall-of-fame-abbrev">({escape(abbrev)})</span>'
    if emoji:
        inner += f'<span class="hall-of-fame-emoji">{escape(emoji)}</span>'

    # Wrap in <a> only if a URL was provided.
    if url:
        name_html = (
            f'<a href="{escape(url, quote=True)}" target="_blank" rel="noopener">'
            f'{inner}</a>'
        )
    else:
        name_html = inner

    cc = country_code(country)
    title = escape(country_title(country), quote=True)

    return (
        '        <li class="hall-of-fame-row">\n'
        f'          <span class="hall-of-fame-rank">{rank}</span>\n'
        f'          <span class="hall-of-fame-name">{name_html}</span>\n'
        f'          <img class="hall-of-fame-flag" src="flags/{cc}.svg" '
        f'alt="{title}" title="{title}" width="28" height="21" loading="lazy">\n'
        '        </li>'
    )


def main():
    with open(DATA, 'r', encoding='utf-8') as f:
        data = json.load(f)

    section_label = data.get('section_label', '').strip()
    title = data.get('title', 'Hall of Fame')
    subtitle = data.get('subtitle', '').strip()
    groups = data.get('groups', [])

    rows = '\n'.join(row_html(i, g) for i, g in enumerate(groups))

    # Optional pre-title pill — omitted entirely when blank so it doesn't
    # render as an empty 0-height element.
    section_label_html = (
        f'        <div class="section-label">{escape(section_label)}</div>\n'
        if section_label
        else ''
    )
    # Subtitle line is also optional — same treatment.
    subtitle_html = (
        f'        <p class="hall-of-fame-subtitle">{escape(subtitle)}</p>\n'
        if subtitle
        else ''
    )

    block = (
        '  <!-- HALL_OF_FAME_BEGIN -->\n'
        '  <div class="container">\n'
        '    <div class="hall-of-fame reveal">\n'
        '      <div class="hall-of-fame-header">\n'
        + section_label_html
        + f'        <h2 class="hall-of-fame-title">{escape(title)}</h2>\n'
        + subtitle_html
        + '      </div>\n'
        '      <ol class="hall-of-fame-list">\n'
        + rows + '\n'
        '      </ol>\n'
        '    </div>\n'
        '  </div>\n'
        '  <!-- HALL_OF_FAME_END -->'
    )

    with open(INDEX, 'rb') as f:
        raw = f.read()
    le = b'\r\n' if b'\r\n' in raw[:1000] else b'\n'
    html = raw.decode('utf-8').replace('\r\n', '\n')

    pat = re.compile(
        r'  <!-- HALL_OF_FAME_BEGIN -->.*?<!-- HALL_OF_FAME_END -->',
        re.DOTALL,
    )
    new_html, n = pat.subn(lambda _: block, html, count=1)
    if n != 1:
        sys.exit(
            'Failed to find HALL_OF_FAME_BEGIN/END markers in index.html '
            f'(matched {n}). Markers must be present inside <section class="cta-footer">.'
        )

    with open(INDEX, 'wb') as f:
        f.write(new_html.replace('\n', le.decode()).encode('utf-8'))

    print(f'Synced Hall of Fame ({len(groups)} groups) into index.html')


if __name__ == '__main__':
    main()
