#!/usr/bin/env python3
"""
Sync streamer-derived blocks from streamers.json into:
- index.html (cards grid, JSON-LD performer array, keywords meta, JS live-status array)
- llms.txt (Confirmed Streamers list)

Triggered by .github/workflows/sync-streamers.yml on push that touches streamers.json.
Idempotent: running with no JSON changes produces no diff.
"""
import re
import json
import os
import sys
from datetime import date, datetime, timedelta

REPO = os.environ.get('REPO_PATH', os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
INDEX = os.path.join(REPO, 'index.html')
LLMS = os.path.join(REPO, 'llms.txt')
SJSON = os.path.join(REPO, 'streamers.json')

KICK_SVG = ('<svg width="14" height="14" viewBox="0 0 24 24" fill="var(--green-kick)">'
            '<rect x="4" y="2" width="4" height="20" rx="1"/>'
            '<rect x="10" y="6" width="4" height="12" rx="1"/>'
            '<rect x="16" y="2" width="4" height="20" rx="1"/></svg>')

# Keywords that aren't streamer names (event terms + hosting groups)
STATIC_KW_PREFIX = ("EmpireX, Empire X, Our Empire, ECX, live streaming event, IRL streaming, "
                    "Kick.com, Kick streaming, reality streaming, ProjectX meets streaming, "
                    "Kissimmee Florida, Kissimmee FL, Davenport FL, Four Corners FL, Orlando area, "
                    "Florida streaming event, June 2026, streamer competition, cash prize, "
                    "social influence, Airbnb party, content creator event")
STATIC_KW_SUFFIX = ("The Baddest TB, The Vibe Gate Way, DTB Part 2, The Twinz, Blacks United BU, "
                    "All Pursuit AP, Dynamic Dynasty, Kozy, Pretty Reckless PR, Sky9")


def is_just_added(s, today=None):
    """True if this streamer's `added_at` is within the last 3 days
    (inclusive). `added_at` is an ISO date string ("YYYY-MM-DD") set
    by the Decap CMS when the entry was created. Streamers without an
    `added_at` field never show the badge — back-compat with rows
    added before this feature."""
    raw = s.get('added_at')
    if not raw:
        return False
    try:
        # Tolerate both pure dates ("2026-04-27") and ISO datetimes
        # ("2026-04-27T14:00:00.000Z") that Decap can emit.
        if 'T' in raw:
            d = datetime.fromisoformat(raw.replace('Z', '+00:00')).date()
        else:
            d = date.fromisoformat(raw)
    except ValueError:
        return False
    if today is None:
        today = date.today()
    return (today - d) <= timedelta(days=3) and d <= today


def card_html(s, today=None):
    """Generate one streamer card. Caller is responsible for </a> separators.

    Renders a JUST ADDED corner ribbon when the streamer's `added_at`
    is within the last 3 days. Badge is positioned absolute over the
    top-right corner of the card via CSS (.streamer-just-added)."""
    badge = ''
    if is_just_added(s, today):
        # Stamp the badge with the date so a JS check at page load can
        # hide it when (today - added_at) crosses 3 days, even if
        # sync-streamers.py hasn't re-run since. Avoids needing a
        # daily cron — sync removes stale badges only when something
        # else changes, JS decays them in the meantime.
        badge = (f'        <div class="streamer-just-added" '
                 f'data-added="{s["added_at"]}">JUST ADDED</div>\n')
    return (
        f'<a class="streamer-card" href="{s["url"]}" target="_blank">\n'
        + badge
        + f'        <div class="streamer-avatar" id="av-{s["slug"]}">\n'
        f'          <span class="streamer-initials">{s["initials"]}</span>\n'
        f'          <img class="streamer-img" src="{s["avatar"]}" alt="{s["name"]}" loading="lazy">\n'
        f'        </div>\n'
        f'        <div class="streamer-name">{s["name"]}</div>\n'
        f'        <div class="streamer-platform">{KICK_SVG} KICK</div>\n'
        f'        <div class="streamer-status" id="status-{s["slug"]}">'
        f'<div class="streamer-status-dot"></div>'
        f'<span class="streamer-status-text"></span>'
        f'<span class="streamer-viewers"></span></div>\n'
        f'      '
    )


def main():
    with open(SJSON, 'r', encoding='utf-8') as f:
        data = json.load(f)
    # streamers.json is wrapped in {"streamers": [...]} so the Decap CMS schema
    # has a top-level object to bind to. Tolerate the unwrapped legacy form too.
    streamers = data['streamers'] if isinstance(data, dict) else data

    if not streamers:
        sys.exit('streamers.json is empty')

    # --- index.html ---
    with open(INDEX, 'rb') as f:
        raw = f.read()
    le = b'\r\n' if b'\r\n' in raw[:1000] else b'\n'
    html = raw.decode('utf-8')
    # Normalize to LF for processing; restore at write time.
    html = html.replace('\r\n', '\n')

    # 1. One-time migration: replace any inline base64 streamer-img with file path.
    def fix_inline(m):
        alt = re.search(r'alt="([^"]+)"', m.group(0))
        if not alt:
            return m.group(0)
        s = next((s for s in streamers if s['name'] == alt.group(1)), None)
        if not s:
            return m.group(0)
        return f'<img class="streamer-img" src="{s["avatar"]}" alt="{s["name"]}" loading="lazy">'

    html = re.sub(
        r'<img class="streamer-img" src="data:image/[^"]*" alt="[^"]+"(?:\s+loading="lazy")?\s*/?>',
        fix_inline, html
    )

    # 2. Cards block — replace everything inside <div class="streamers-regular-grid">...</div>
    cards_inner = card_html(streamers[0])
    for s in streamers[1:]:
        cards_inner += '</a>' + card_html(s)
    cards_inner += '</a>'

    cards_pat = re.compile(
        r'(<div class="streamers-regular-grid">)'
        r'.*?'
        r'(\n    </div>\n    </div>\n  </div>\n</section>)',
        re.DOTALL,
    )
    html, n = cards_pat.subn(lambda m: m.group(1) + cards_inner + m.group(2), html, count=1)
    if n != 1:
        sys.exit(f'Failed to find cards block (matched {n} times)')

    # 3. JSON-LD performer array
    performers = ',\n'.join(
        f'    {{"@type": "Person", "name": "{s["name"]}", "url": "{s["url"]}"}}' for s in streamers
    )
    jsonld_pat = re.compile(r'("performer": \[\n)' r'.*?' r'(\n  \]\n\}\n</script>)', re.DOTALL)
    html, n = jsonld_pat.subn(lambda m: m.group(1) + performers + m.group(2), html, count=1)
    if n != 1:
        sys.exit(f'Failed to find JSON-LD performer block (matched {n} times)')

    # 4. Keywords meta — full replacement
    kw_csv = ', '.join(s['name'] for s in streamers)
    new_kw = f'<meta name="keywords" content="{STATIC_KW_PREFIX}, {kw_csv}, {STATIC_KW_SUFFIX}">'
    html, n = re.subn(r'<meta name="keywords" content="[^"]*">', lambda _: new_kw, html, count=1)
    if n != 1:
        sys.exit(f'Failed to find keywords meta (matched {n} times)')

    # 5. JS live-status array — full line replacement
    slugs = ', '.join(f'"{s["slug"]}"' for s in streamers)
    new_js = f'  const streamers = [{slugs}];'
    html, n = re.subn(r'  const streamers = \[[^\]]*\];', lambda _: new_js, html, count=1)
    if n != 1:
        sys.exit(f'Failed to find JS streamers array (matched {n} times)')

    # Write index.html (preserve original line ending)
    with open(INDEX, 'wb') as f:
        f.write(html.replace('\n', le.decode()).encode('utf-8'))

    # --- llms.txt ---
    with open(LLMS, 'rb') as f:
        raw_llms = f.read()
    le_llms = b'\r\n' if b'\r\n' in raw_llms[:1000] else b'\n'
    llms = raw_llms.decode('utf-8').replace('\r\n', '\n')

    streamer_md = '\n'.join(f'- [{s["name"]}]({s["url"]})' for s in streamers)
    llms_pat = re.compile(r'(## Confirmed Streamers \(Kick\)\n\n)' r'.*?' r'(\n\n## )', re.DOTALL)
    llms, n = llms_pat.subn(lambda m: m.group(1) + streamer_md + m.group(2), llms, count=1)
    if n != 1:
        sys.exit(f'Failed to find llms.txt streamer section (matched {n} times)')

    with open(LLMS, 'wb') as f:
        f.write(llms.replace('\n', le_llms.decode()).encode('utf-8'))

    print(f'Synced {len(streamers)} streamers into index.html and llms.txt')


if __name__ == '__main__':
    main()
