#!/usr/bin/env python3
"""
Sync the sponsor block from sponsor.json into index.html.

Writes between two independent marker pairs so the client can show
the sponsor in one location, both, or neither:

  <!-- SPONSOR_TOPLEFT_BEGIN --> ... <!-- SPONSOR_TOPLEFT_END -->
      Lives near the top of <body>. position:fixed anchors it to
      the top-left corner of the viewport.

  <!-- SPONSOR_FOOTER_BEGIN --> ... <!-- SPONSOR_FOOTER_END -->
      Lives inside .footer-bar. In-flow, centered above the © line.

sponsor.json schema (v0.13.20):
  enabled       (bool)             master toggle
  placements    (list of strings)  any subset of ["top-left", "footer"]
  logo_image    (string)           image URL or repo-relative path
  link_url      (string)           where the anchor links to
  eyebrow_text  (string)           small caps line above the name
  name          (string)           bold name beside the logo
  alt_text      (string, opt)      image alt; falls back to `name`

Backward-compat: if `placements` is missing but the old `placement`
(single string) is present, treat the latter as a one-item list.

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

VALID_PLACEMENTS = ('top-left', 'footer')

# Where each placement's HTML lands.
MARKERS = {
    'top-left': ('SPONSOR_TOPLEFT_BEGIN', 'SPONSOR_TOPLEFT_END'),
    'footer':   ('SPONSOR_FOOTER_BEGIN',  'SPONSOR_FOOTER_END'),
}


def normalize_placements(data):
    """Return a list of valid placement keys, deduped, ordered as in
    VALID_PLACEMENTS (so output is deterministic regardless of how
    the editor arranged the checkboxes)."""
    raw = data.get('placements')
    if not raw:
        # Backward-compat with the v0.13.19 schema (single string).
        single = data.get('placement')
        raw = [single] if single else []
    if isinstance(raw, str):
        raw = [raw]
    chosen = set()
    for p in raw or []:
        if isinstance(p, str) and p.strip() in VALID_PLACEMENTS:
            chosen.add(p.strip())
    # Order matches VALID_PLACEMENTS for deterministic output.
    return [p for p in VALID_PLACEMENTS if p in chosen]


def build_anchor(data, placement):
    """Render the sponsor anchor for a specific placement. Returns
    empty string if any required field is missing."""
    url = (data.get('link_url') or '').strip()
    logo = (data.get('logo_image') or '').strip()
    eyebrow = (data.get('eyebrow_text') or '').strip()
    name = (data.get('name') or '').strip()
    alt = (data.get('alt_text') or name).strip()

    if not (url and logo and name):
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


def swap_marker_block(html, begin_tag, end_tag, inner):
    """Replace the contents (and the markers' surrounding newlines)
    of one marker-pair block. Returns (new_html, n_replacements)."""
    pat = re.compile(
        rf'(<!-- {begin_tag} -->)(.*?)(<!-- {end_tag} -->)',
        re.DOTALL,
    )
    if inner:
        replacement = f'<!-- {begin_tag} -->\n{inner}\n  <!-- {end_tag} -->'
    else:
        replacement = f'<!-- {begin_tag} --><!-- {end_tag} -->'
    return pat.subn(replacement, html, count=1)


def main():
    with open(DATA, 'r', encoding='utf-8') as f:
        data = json.load(f)

    enabled = bool(data.get('enabled'))
    placements = normalize_placements(data) if enabled else []

    # Preserve original file line endings (CRLF on Windows admin
    # edits vs LF on Linux CI commits) to keep diffs small.
    with open(INDEX, 'rb') as f:
        raw = f.read()
    le = b'\r\n' if b'\r\n' in raw[:1000] else b'\n'
    html = raw.decode('utf-8').replace('\r\n', '\n')

    rendered = []
    skipped = []
    for placement, (begin, end) in MARKERS.items():
        if placement in placements:
            inner = build_anchor(data, placement)
            if not inner:
                skipped.append(placement + ' (missing required field)')
                inner = ''
        else:
            inner = ''
        html, n = swap_marker_block(html, begin, end, inner)
        if n != 1:
            sys.exit(
                f'Failed to find {begin}/{end} markers in index.html '
                f'(matched {n}). Both marker pairs must be present.'
            )
        if inner:
            rendered.append(placement)

    with open(INDEX, 'wb') as f:
        f.write(html.replace('\n', le.decode()).encode('utf-8'))

    name = (data.get('name') or '').strip() or '(unnamed)'
    if rendered:
        print(f'Synced sponsor "{name}" into: {", ".join(rendered)}')
    else:
        print(f'Sponsor "{name}" disabled or no valid placement -> both blocks empty')
    if skipped:
        print('Skipped placements:', '; '.join(skipped))


if __name__ == '__main__':
    main()
