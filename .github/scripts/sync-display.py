#!/usr/bin/env python3
"""
Sync site-wide display toggles from display.json into index.html.

Currently handles:
  - streamer_avatars_grayscale (boolean) -> data-grayscale="true|false"
    on the <section class="streamers"> opening tag. CSS keys off this
    attribute to switch between the original B&W-with-color-on-hover
    treatment and a flat full-color treatment.

Triggered by .github/workflows/sync-streamers.yml on push that touches
display.json. Idempotent.
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
DATA = os.path.join(REPO, 'display.json')


def main():
    with open(DATA, 'r', encoding='utf-8') as f:
        data = json.load(f)

    grayscale = bool(data.get('streamer_avatars_grayscale', False))
    attr_value = 'true' if grayscale else 'false'

    with open(INDEX, 'rb') as f:
        raw = f.read()
    le = b'\r\n' if b'\r\n' in raw[:1000] else b'\n'
    html = raw.decode('utf-8').replace('\r\n', '\n')

    # Match the streamers section opening tag with or without an existing
    # data-grayscale attribute. Replace with the canonical form.
    pat = re.compile(
        r'<section class="streamers"(?:\s+data-grayscale="(?:true|false)")?>'
    )
    replacement = f'<section class="streamers" data-grayscale="{attr_value}">'
    new_html, n = pat.subn(replacement, html, count=1)
    if n != 1:
        sys.exit(
            f'Failed to find <section class="streamers"> opening tag (matched {n})'
        )

    with open(INDEX, 'wb') as f:
        f.write(new_html.replace('\n', le.decode()).encode('utf-8'))

    print(
        f'Synced display settings into index.html '
        f'(streamer_avatars_grayscale={grayscale})'
    )


if __name__ == '__main__':
    main()
