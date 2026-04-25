#!/usr/bin/env python3
"""
Sync SEO meta tags + <title> from seo.json into index.html.

Updates:
  - <title>
  - <meta name="description">
  - <meta property="og:title">
  - <meta property="og:description">
  - <meta property="og:image">         (full URL synthesized from share_image)
  - <meta name="twitter:title">
  - <meta name="twitter:description">
  - <meta name="twitter:image">        (full URL synthesized from share_image)

Other meta tags (canonical, og:type, og:locale, og:image dimensions, twitter:card,
charset, viewport) stay code-managed because they're technical metadata that
shouldn't change via the CMS.

Triggered by .github/workflows/sync-streamers.yml on push that touches seo.json.
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
SEO = os.path.join(REPO, 'seo.json')

SITE_ORIGIN = 'https://ourempirex.com'


def attr(s):
    """Escape a string for use inside an HTML attribute (quotes/&/<)."""
    return escape(s, quote=True)


def absolutize(path):
    """Convert a relative image reference to a full URL on the site."""
    if not path:
        return ''
    if path.startswith('http://') or path.startswith('https://'):
        return path
    if path.startswith('/'):
        return SITE_ORIGIN + path
    return SITE_ORIGIN + '/' + path


def main():
    with open(SEO, 'r', encoding='utf-8') as f:
        seo = json.load(f)

    title = seo['page_title']
    meta_desc = seo['meta_description']
    og_desc = seo['og_description']
    twitter_desc = seo['twitter_description']
    share_url = absolutize(seo.get('share_image', ''))

    with open(INDEX, 'rb') as f:
        raw = f.read()
    le = b'\r\n' if b'\r\n' in raw[:1000] else b'\n'
    html = raw.decode('utf-8').replace('\r\n', '\n')

    replacements = [
        (re.compile(r'<title>[^<]*</title>'),
         f'<title>{escape(title)}</title>'),
        (re.compile(r'<meta name="description" content="[^"]*">'),
         f'<meta name="description" content="{attr(meta_desc)}">'),
        (re.compile(r'<meta property="og:title" content="[^"]*">'),
         f'<meta property="og:title" content="{attr(title)}">'),
        (re.compile(r'<meta property="og:description" content="[^"]*">'),
         f'<meta property="og:description" content="{attr(og_desc)}">'),
        (re.compile(r'<meta property="og:image" content="[^"]*">'),
         f'<meta property="og:image" content="{attr(share_url)}">'),
        (re.compile(r'<meta name="twitter:title" content="[^"]*">'),
         f'<meta name="twitter:title" content="{attr(title)}">'),
        (re.compile(r'<meta name="twitter:description" content="[^"]*">'),
         f'<meta name="twitter:description" content="{attr(twitter_desc)}">'),
        (re.compile(r'<meta name="twitter:image" content="[^"]*">'),
         f'<meta name="twitter:image" content="{attr(share_url)}">'),
    ]

    for pat, replacement in replacements:
        html, n = pat.subn(lambda _: replacement, html, count=1)
        if n != 1:
            sys.exit(f'Failed to replace {pat.pattern!r} (matched {n})')

    with open(INDEX, 'wb') as f:
        f.write(html.replace('\n', le.decode()).encode('utf-8'))

    print('Synced SEO tags into index.html')


if __name__ == '__main__':
    main()
