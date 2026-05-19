#!/usr/bin/env python3
"""
Build the Activity changelog at /analytics/activity/index.html.

Walks `git log` over streamers.json + featured-streamers.json, diffs
each commit against its parent, and records who was added or removed
from each list. The resulting timeline gets baked directly into the
HTML (no client-side fetch) so the page is fully self-contained.

The page is hidden:
  - <meta name="robots" content="noindex, nofollow">
  - <meta name="referrer" content="no-referrer">
  - Not listed in sitemap.xml
  - Blocked by robots.txt

Triggered by sync-streamers.yml on every push that touches the data
files (same trigger as the rest of the sync scripts).
"""
import os
import re
import subprocess
import json
import html
from datetime import datetime


REPO = os.environ.get(
    'REPO_PATH',
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
)
OUT_DIR = os.path.join(REPO, 'analytics', 'activity')
OUT_PATH = os.path.join(OUT_DIR, 'index.html')

# Cap events shown on the page to keep payload small + the list useful.
# Older entries fall off — the activity log is "what happened lately,"
# not the full project history.
MAX_EVENTS = 200

# JSON files to track. Each entry: (path, label, name_key).
# `name_key` is the field that uniquely identifies a row across commits
# (used to compute set diffs). For Kick streamers it's the slug;
# for featured creators we don't have a stable slug, so use `name`.
SOURCES = [
    ('streamers.json',           'Kick',     'slug'),
    ('featured-streamers.json',  'Featured', 'name'),
]


def run(args):
    """Run a git command from REPO; return stdout text (decoded utf-8,
    errors replaced)."""
    return subprocess.run(
        ['git'] + args,
        cwd=REPO,
        capture_output=True,
        text=True,
        encoding='utf-8',
        errors='replace',
    ).stdout


def file_at(commit, path):
    """Read `path` as it existed at `commit`. Returns None if the file
    didn't exist there (rather than raising) so the very first commit
    that introduces a file is handled cleanly."""
    p = subprocess.run(
        ['git', 'show', f'{commit}:{path}'],
        cwd=REPO,
        capture_output=True,
        text=True,
        encoding='utf-8',
        errors='replace',
    )
    if p.returncode != 0:
        return None
    try:
        return json.loads(p.stdout)
    except json.JSONDecodeError:
        return None


def rows_of(data):
    """Pull the list of streamer dicts out of one of the JSON files.
    Both schemas store the list under "streamers"."""
    if not isinstance(data, dict):
        return []
    return data.get('streamers', []) or []


def commit_meta(sha):
    """ISO date + subject line, for displaying when each event landed."""
    out = run(['log', '-n', '1', '--format=%cI%n%s', sha]).strip().split('\n', 1)
    iso = out[0] if out else ''
    subject = out[1] if len(out) > 1 else ''
    return iso, subject


def collect_events():
    """Walk every commit that touched any tracked file and diff its
    streamer list against the parent. Returns a flat list of events
    newest-first."""
    events = []
    # Format: SHA<TAB>iso-date<TAB>subject<NUL>
    log = run(['log', '--reverse', '--format=%H', '--', *[s[0] for s in SOURCES]])
    shas = [line.strip() for line in log.splitlines() if line.strip()]

    for sha in shas:
        # Parent — for the very first commit, diff against "empty" so
        # everything in the initial file shows up as an "added" event.
        parents = run(['rev-list', '--parents', '-n', '1', sha]).split()[1:]
        parent = parents[0] if parents else None
        iso, subject = commit_meta(sha)

        for fpath, label, key in SOURCES:
            # Skip files this commit didn't touch.
            touched = run(['log', '-n', '1', '--name-only', '--format=', sha, '--', fpath]).strip()
            if not touched:
                continue
            after = file_at(sha, fpath)
            before = file_at(parent, fpath) if parent else None

            before_rows = rows_of(before)
            after_rows = rows_of(after)
            before_keys = {(r.get(key) or '').strip() for r in before_rows if r.get(key)}
            after_keys  = {(r.get(key) or '').strip() for r in after_rows  if r.get(key)}

            added = after_keys - before_keys
            removed = before_keys - after_keys

            # Look up display names + groups + descriptions for the
            # *after* state (for additions) and *before* state (for
            # removals), so the timeline shows full context even after a
            # row is deleted.
            after_by_key = {(r.get(key) or '').strip(): r for r in after_rows}
            before_by_key = {(r.get(key) or '').strip(): r for r in before_rows}

            for k in sorted(added):
                row = after_by_key.get(k, {})
                events.append({
                    'sha': sha,
                    'iso': iso,
                    'subject': subject,
                    'section': label,
                    'type': 'added',
                    'key': k,
                    'name': (row.get('name') or k).strip(),
                    'group': (row.get('group') or '').strip(),
                    'description': (row.get('description') or '').strip(),
                    'url': (row.get('url') or '').strip(),
                })
            for k in sorted(removed):
                row = before_by_key.get(k, {})
                events.append({
                    'sha': sha,
                    'iso': iso,
                    'subject': subject,
                    'section': label,
                    'type': 'removed',
                    'key': k,
                    'name': (row.get('name') or k).strip(),
                    'group': (row.get('group') or '').strip(),
                    'description': (row.get('description') or '').strip(),
                    'url': (row.get('url') or '').strip(),
                })

    # Newest first; cap at MAX_EVENTS so the page stays snappy.
    events.reverse()
    return events[:MAX_EVENTS]


def fmt_date(iso):
    """Render the commit date for display. ISO timestamps from git look
    like '2026-05-18T19:50:53-04:00'; trim to date for cleaner UI."""
    if not iso:
        return ''
    try:
        dt = datetime.fromisoformat(iso)
        return dt.strftime('%b %-d, %Y') if os.name != 'nt' else dt.strftime('%b %#d, %Y')
    except ValueError:
        return iso[:10]


def event_html(e):
    """Render one event card."""
    esc = lambda s: html.escape(s or '', quote=True)
    type_label = 'ADDED' if e['type'] == 'added' else 'REMOVED'
    type_class = 'added' if e['type'] == 'added' else 'removed'
    section_label = e['section'].upper()

    name = esc(e['name'])
    if e['url']:
        name_html = f'<a href="{esc(e["url"])}" target="_blank" rel="noopener noreferrer">{name}</a>'
    else:
        name_html = name

    sub_parts = []
    if e['description']:
        sub_parts.append(esc(e['description']))
    if e['group']:
        sub_parts.append(esc(e['group']))
    sub_line = ' &middot; '.join(sub_parts)
    sub_html = f'<div class="evt-sub">{sub_line}</div>' if sub_line else ''

    return (
        '      <li class="evt">\n'
        f'        <div class="evt-date">{esc(fmt_date(e["iso"]))}</div>\n'
        f'        <div class="evt-pill evt-pill-{type_class}">{type_label}</div>\n'
        f'        <div class="evt-section">{esc(section_label)}</div>\n'
        '        <div class="evt-body">\n'
        f'          <div class="evt-name">{name_html}</div>\n'
        f'          {sub_html}\n'
        '        </div>\n'
        '      </li>\n'
    )


def render_page(events):
    """Bake the full HTML page with events inline. No client-side fetch
    — the entire activity log ships as static HTML."""
    if not events:
        list_html = (
            '      <li class="evt-empty">No activity yet. '
            'Add or remove a creator in the CMS and it will appear here.</li>\n'
        )
        count_html = '0 events'
    else:
        list_html = ''.join(event_html(e) for e in events)
        added_count = sum(1 for e in events if e['type'] == 'added')
        removed_count = sum(1 for e in events if e['type'] == 'removed')
        count_html = (
            f'{len(events)} event{"" if len(events) == 1 else "s"} '
            f'&middot; {added_count} added &middot; {removed_count} removed'
        )

    generated_at = datetime.utcnow().strftime('%b %d, %Y at %H:%M UTC')

    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<!-- Internal client log. Don't index, don't leak referrer. -->
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<meta name="version" content="0.1.0">
<title>Empire X &mdash; Activity</title>
<link rel="icon" type="image/png" href="/logo.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Oswald:wght@300;400;500;600;700&family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap" onload="this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Oswald:wght@300;400;500;600;700&family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap"></noscript>
<style>
  :root {{
    --gold:        #B58831;
    --gold-light:  #D4A843;
    --gold-dark:   #8B6620;
    --paper:       #FFFFFF;
    --ink:         #1A1A1A;
    --ink-soft:    #444444;
    --ink-muted:   #757575;
    --hairline:    rgba(26,26,26,0.10);
    --added-bg:    #E8F4EA;
    --added-fg:    #1F6B33;
    --removed-bg:  #F8E2DF;
    --removed-fg:  #92291D;
  }}
  *, *::before, *::after {{ box-sizing: border-box; }}
  html, body {{
    margin: 0; padding: 0;
    background: var(--paper);
    color: var(--ink);
    font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    min-height: 100vh;
  }}
  body {{ display: flex; flex-direction: column; }}

  header {{
    padding: 1.6rem 1.5rem 1.2rem;
    background:
      radial-gradient(ellipse 80% 60% at 50% 0%, rgba(212,168,67,0.08) 0%, transparent 70%),
      var(--paper);
    border-bottom: 1px solid var(--hairline);
    text-align: center;
  }}
  .header-inner {{
    max-width: 1100px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1.2rem;
    flex-wrap: wrap;
  }}
  .header-logo {{ width: 56px; height: 56px; object-fit: contain; flex: 0 0 auto; }}
  .header-text {{ text-align: left; line-height: 1.1; }}
  .header-eyebrow {{
    font-family: 'Bebas Neue', sans-serif;
    font-size: 0.7rem;
    letter-spacing: 0.45em;
    color: var(--gold);
    margin-bottom: 0.25rem;
  }}
  .header-title {{
    font-family: 'Playfair Display', serif;
    font-weight: 900;
    font-size: clamp(1.6rem, 3vw, 2.4rem);
    letter-spacing: -0.01em;
    background: linear-gradient(135deg, var(--gold-light) 0%, var(--gold) 50%, var(--gold-dark) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    margin: 0;
  }}
  .header-subtitle {{
    font-family: 'Oswald', sans-serif;
    font-weight: 400;
    font-size: 0.85rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--ink-muted);
    margin-top: 0.3rem;
  }}

  main {{
    flex: 1 0 auto;
    padding: 1.5rem 1.5rem 0;
    max-width: 1100px;
    margin: 0 auto;
    width: 100%;
  }}
  .meta {{
    font-family: 'Oswald', sans-serif;
    font-size: 0.72rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--ink-muted);
    margin-bottom: 1rem;
  }}

  /* Event list — left-aligned, dense, no fancy timeline rail so it
     stays scannable. Each row: date (small, gray) on the left, ADDED/
     REMOVED pill, section pill, then name + sub-line on the right. */
  .evt-list {{
    list-style: none;
    padding: 0;
    margin: 0;
    border-top: 1px solid var(--hairline);
  }}
  .evt {{
    display: grid;
    grid-template-columns: 110px 90px 90px 1fr;
    gap: 1rem;
    align-items: start;
    padding: 1rem 0.5rem;
    border-bottom: 1px solid var(--hairline);
  }}
  .evt-date {{
    font-family: 'Oswald', sans-serif;
    font-size: 0.78rem;
    letter-spacing: 0.05em;
    color: var(--ink-muted);
    padding-top: 0.15rem;
  }}
  .evt-pill {{
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: 'Oswald', sans-serif;
    font-weight: 600;
    font-size: 0.65rem;
    letter-spacing: 0.18em;
    padding: 0.25rem 0.5rem;
    border-radius: 3px;
    height: 1.6rem;
    text-transform: uppercase;
  }}
  .evt-pill-added   {{ background: var(--added-bg);   color: var(--added-fg); }}
  .evt-pill-removed {{ background: var(--removed-bg); color: var(--removed-fg); }}
  .evt-section {{
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: 'Oswald', sans-serif;
    font-weight: 500;
    font-size: 0.65rem;
    letter-spacing: 0.18em;
    color: var(--ink-soft);
    border: 1px solid var(--hairline);
    padding: 0.25rem 0.5rem;
    border-radius: 3px;
    height: 1.6rem;
    text-transform: uppercase;
  }}
  .evt-body {{ min-width: 0; }}
  .evt-name {{
    font-family: 'DM Sans', sans-serif;
    font-weight: 600;
    font-size: 1rem;
    color: var(--ink);
    line-height: 1.3;
  }}
  .evt-name a {{
    color: inherit;
    text-decoration: none;
    border-bottom: 1px dotted var(--ink-muted);
    transition: color 0.2s ease, border-color 0.2s ease;
  }}
  .evt-name a:hover {{ color: var(--gold); border-bottom-color: var(--gold); }}
  .evt-sub {{
    font-family: 'DM Sans', sans-serif;
    font-size: 0.85rem;
    color: var(--ink-muted);
    margin-top: 0.2rem;
    line-height: 1.4;
  }}
  .evt-empty {{
    padding: 3rem 1rem;
    text-align: center;
    color: var(--ink-muted);
    font-family: 'DM Sans', sans-serif;
    font-style: italic;
  }}

  /* Narrow viewports: drop the rigid grid and let things stack. */
  @media (max-width: 640px) {{
    .evt {{
      grid-template-columns: 1fr;
      gap: 0.35rem;
      padding: 1rem 0.25rem;
    }}
    .evt-date {{ padding-top: 0; }}
    .evt-pill, .evt-section {{ align-self: flex-start; }}
  }}

  footer {{
    padding: 1.6rem 1.5rem 2rem;
    margin-top: 2rem;
    text-align: center;
    border-top: 1px solid var(--hairline);
  }}
  .footer-line {{
    font-family: 'Oswald', sans-serif;
    font-size: 0.72rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--ink-muted);
  }}
  .footer-line a {{ color: var(--ink-soft); text-decoration: none; transition: color 0.2s ease; }}
  .footer-line a:hover {{ color: var(--gold); }}
  .footer-version {{
    margin-top: 0.6rem;
    font-size: 0.6rem;
    letter-spacing: 0.25em;
    color: rgba(26,26,26,0.30);
  }}

  @media (max-width: 600px) {{
    header {{ padding: 1.2rem 1rem 0.9rem; }}
    .header-inner {{ gap: 0.8rem; }}
    .header-logo {{ width: 44px; height: 44px; }}
    .header-text {{ text-align: center; }}
    main {{ padding: 1rem 1rem 0; }}
    footer {{ padding: 1.2rem 1rem 1.6rem; }}
  }}
</style>
</head>
<body>

<header>
  <div class="header-inner">
    <img class="header-logo" src="/logo.png" alt="Empire X" loading="eager">
    <div class="header-text">
      <div class="header-eyebrow">Empire X</div>
      <h1 class="header-title">Activity</h1>
      <div class="header-subtitle">Creators added &amp; removed</div>
    </div>
  </div>
</header>

<main>
  <div class="meta">{count_html} &middot; updated {html.escape(generated_at)}</div>

  <ul class="evt-list">
{list_html}  </ul>
</main>

<footer>
  <div class="footer-line">
    &copy; 2026 Our Empire &bull; Empire X &bull;
    <a href="https://ourempirex.com">ourempirex.com</a>
  </div>
  <div class="footer-version">Activity v0.1.0</div>
</footer>

</body>
</html>
'''


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    events = collect_events()
    page = render_page(events)
    with open(OUT_PATH, 'w', encoding='utf-8', newline='\n') as f:
        f.write(page)
    print(f'Built activity log: {len(events)} events at {OUT_PATH}')


if __name__ == '__main__':
    main()
