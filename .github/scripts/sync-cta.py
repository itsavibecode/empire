#!/usr/bin/env python3
"""
Sync the two hero CTA buttons (top: in the hero section, bottom: in the
CTA footer) from cta.json into index.html.

Each button has a `text` and a `url`. Both buttons are anchors with
`class="hero-cta"` plus a stable hook class that lets us target each
one for replacement without ambiguity:
  - hero-cta-top      (the in-hero button under the meta grid)
  - hero-cta-bottom   (the bottom "Ready to Join Empire X?" footer button)

Triggered by .github/workflows/sync-streamers.yml on push that touches
cta.json. Idempotent.
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
CTA = os.path.join(REPO, 'cta.json')


def render_button(hook_class, btn):
    """Render <a class="hero-cta hero-cta-{top|bottom}" ...>{text}</a>.
    External links open in a new tab; same-origin paths don't."""
    text = btn.get('text', '').strip()
    url = btn.get('url', '').strip()
    if not text:
        sys.exit(f'Empty text for {hook_class}')
    if not url:
        sys.exit(f'Empty url for {hook_class}')
    target = '' if url.startswith('/') else ' target="_blank" rel="noopener"'
    return (
        f'<a class="hero-cta {hook_class}" href="{escape(url, quote=True)}"'
        f'{target}>{escape(text)}</a>'
    )


def replace_button(html, hook_class, new_anchor):
    """Replace the existing <a class="hero-cta hook_class" ...>...</a> in-place.
    Matches the whole anchor (open tag + content + close tag) by hook class."""
    # Allow either order of class tokens (hero-cta first or hook first) and
    # tolerate other classes/attributes mixed in.
    pat = re.compile(
        r'<a\b[^>]*\bclass="[^"]*\b' + re.escape(hook_class) + r'\b[^"]*"[^>]*>'
        r'.*?</a>',
        re.DOTALL,
    )
    new_html, n = pat.subn(lambda _: new_anchor, html, count=1)
    if n != 1:
        sys.exit(
            f'Failed to find <a class="... {hook_class} ..."> in index.html '
            f'(matched {n}). The first run after wiring this script up must '
            f'happen against an index.html where both anchors already carry '
            f'their hero-cta-top / hero-cta-bottom hook classes.'
        )
    return new_html


def main():
    with open(CTA, 'r', encoding='utf-8') as f:
        data = json.load(f)

    top = data.get('top_button') or {}
    bot = data.get('bottom_button') or {}

    with open(INDEX, 'rb') as f:
        raw = f.read()
    le = b'\r\n' if b'\r\n' in raw[:1000] else b'\n'
    html = raw.decode('utf-8').replace('\r\n', '\n')

    html = replace_button(html, 'hero-cta-top', render_button('hero-cta-top', top))
    html = replace_button(html, 'hero-cta-bottom', render_button('hero-cta-bottom', bot))

    with open(INDEX, 'wb') as f:
        f.write(html.replace('\n', le.decode()).encode('utf-8'))

    print(
        f'Synced CTAs: top={top.get("text")!r} -> {top.get("url")!r}; '
        f'bottom={bot.get("text")!r} -> {bot.get("url")!r}'
    )


if __name__ == '__main__':
    main()
