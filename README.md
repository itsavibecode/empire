# EmpireX (ourempirex.com)

The world's first live-streamed reality experience. June 11–15, 2026 in Kissimmee, Florida. Streaming groups compete for social influence and a cash prize across 5 days, broadcast live on Kick.

A static promotional site (GitHub Pages) hosted at [ourempirex.com](https://ourempirex.com).

## Versioning

This project uses [Semantic Versioning](https://semver.org/) (MAJOR.MINOR.PATCH). The current version appears in:

- `<meta name="version">` tag in `index.html`
- The footer of the site (small grey text below the legal links)
- This changelog

Every release bumps the version in all three places.

## Changelog

### v0.7.0 — 2026-04-25

Minor — About The Event section moved to CMS.

- **`about.json` at the repo root** — the entire About section (label, title, description, flyer image, 4 detail rows) is now CMS-editable.
- **About flyer migrated** — the inline base64 about-flyer image extracted to `about-flyer.jpg` at the repo root. ~440 KB shed from `index.html`.
- **`.github/scripts/sync-about.py`** — regenerates the `<section class="about">` block in `index.html` from `about.json`. Idempotent.
- **Workflow** updated to also trigger on `about.json` and run `sync-about.py`.
- **`/admin/` CMS** has a fourth collection: **"About The Event"**. Title field accepts line breaks (rendered as `<br>` on the site); detail rows are drag-reorderable; flyer is an image upload.

### v0.6.0 — 2026-04-25

Minor — social bar moved to CMS (curated dropdown of platforms), Linktree replaced with OBS shortcut.

- **`socials.json` at the repo root** — the 6 entries in the top-right social bar are now CMS-editable. Each row picks from a fixed platform dropdown (Kick / Instagram / Discord / YouTube / X / OBS) and provides a URL. The icon SVG is selected by platform; the admin can't supply custom icons that would clash with the design.
- **Linktree → OBS swap.** The Linktree icon is gone from the bar and replaced with an OBS-overlay icon that links to `/obs/`. Linktree is still available as a platform in the script's icon library if it ever needs to come back; just not in the CMS dropdown right now.
- **`.github/scripts/sync-socials.py`** — regenerates the `<nav class="social-bar">` block in `index.html` from `socials.json`. Idempotent.
- **Workflow** updated to also trigger on `socials.json` and run `sync-socials.py` alongside the streamers/properties syncs.
- **`/admin/` CMS** has a third collection: **"Social Bar (top-right)"**. Drag-to-reorder works (left-to-right matches top-to-bottom in the editor).

### v0.5.0 — 2026-04-25

Minor — added "The Properties" as a CMS-editable section, same architecture as streamers.

- **`properties.json` at the repo root** — single source of truth for the 9 Airbnb property cards (id, title, host group, optional date range, badge, image path).
- **Inline base64 house images migrated** to `houses/*.png` files. The 9 inline images extracted from `index.html` shrunk it by another ~6 MB (down from ~11.8 MB to ~5.8 MB).
- **`.github/scripts/sync-properties.py`** — regenerates the houses-grid block in `index.html` from `properties.json`. Idempotent.
- **Workflow** (`.github/workflows/sync-streamers.yml`) renamed to "Sync content (streamers + properties)" and now triggers on either `streamers.json` or `properties.json`. Runs both sync scripts on every trigger; both are no-ops if their data didn't change.
- **`/admin/` CMS** has a new collection: **"The Properties"**. Same edit/reorder/save UX as the streamer roster. Photo uploads land in `/houses/`.
- After this push, the admin can add, remove, edit, or reorder properties from the CMS — exactly the same flow as streamers.

### v0.4.1 — 2026-04-25

Patch — wired up Decap Bridge auth, finalized admin login.

- **`admin/config.yml` — backend changed from `github` to `git-gateway`** and pointed at the registered Decap Bridge site (PKCE flow, Google login). The Bridge dashboard holds a fine-grained GitHub PAT scoped to this repo only.
- **Commit message templates customized to omit `{{author-name}}`** — Decap Bridge's defaults would interpolate the logged-in admin's Google profile name into every commit, which would leak a real name into the public git history. Templates now use generic `admin:` prefixes that keep the CMS audit trail without exposing personal info.
- **PKCE auth claims** (email, first/last name, avatar) configured so the logged-in admin sees their own info in the CMS chrome — only visible to themselves, not in the public site or commit history.
- After this push, `https://ourempirex.com/admin/` is fully functional: login → edit → save → GitHub Action regenerates everything → live in ~30s.

### v0.4.0 — 2026-04-25

Minor — admin CMS scaffold + minor `streamers.json` shape change.

- **`streamers.json` is now wrapped in a top-level object** (`{"streamers": [...]}`) instead of a bare array. Decap CMS requires a top-level object to bind to. Both `/obs/index.html` and `.github/scripts/sync-streamers.py` were updated to read either shape (backward-compatible reader, forward-compatible writer).
- **`/admin/index.html` + `/admin/config.yml`** — Decap CMS scaffold at `https://ourempirex.com/admin/`. Schema lets the admin add, remove, or drag-to-reorder streamers; each row has slug, display name, Kick URL (regex-validated), initials, and avatar upload.
- **Login is GitHub OAuth via Decap Bridge** (free, hosted) — only accounts with write access to the repo can save. Other visitors see the editor but can't commit.
- Saving in the CMS commits `streamers.json` → triggers `sync-streamers.yml` → regenerates the cards/SEO/JS/llms blocks → site updates within ~30s.
- **Setup still needed:** the `auth_endpoint` in `admin/config.yml` works against Decap Bridge's standard endpoint; the repo owner needs to register the site at decapbridge.com (one-time, ~5 min) before login will succeed.

### v0.3.0 — 2026-04-25

Minor — single source of truth for the Confirmed Streamers list, plus the GitHub Action that keeps everything in sync.

- **`streamers.json` at the repo root** is now the canonical Confirmed Streamers list. 26 entries, each with `slug`, `name`, `url`, `initials`, and `avatar` (file path).
- **Inline base64 avatars migrated to files.** All 20 originally-inline streamer avatars were extracted from `index.html` and saved under `avatars/`. The 6 already-file-based avatars (Ice Poseidon, Dtan, Shangel, Ozemi, lifeismizzy, RiddaW) stayed put. `index.html` is now ~1.4 MB lighter and avatars load lazily as separate requests.
- **GitHub Action — `.github/workflows/sync-streamers.yml`.** Triggered on every push that touches `streamers.json`. Runs `.github/scripts/sync-streamers.py` to regenerate the streamer-derived blocks in `index.html` (cards grid, JSON-LD `performer` array, `keywords` meta, JS live-status array) and in `llms.txt` (Confirmed Streamers list), then commits the regenerated output back. Path filter prevents the workflow from re-triggering itself.
- **`/obs/index.html` ROSTER** is no longer hardcoded — it now `fetch('/streamers.json')` on load. Same data, one file to edit. The README in `/obs/` was updated to reflect this.
- **`/promo/`** doesn't currently have a roster but the JSON is reachable from there too if a future overlay needs it.
- **What this enables:** any tool (or human) that edits `streamers.json` on `main` causes the entire site to update consistently — the cards visible to visitors, the SEO blocks crawled by Google, the LLM ingestion file, and the OBS overlay all stay in lockstep.

### v0.2.2 — 2026-04-25

Patch — roster + tagline tweak.

- **Removed IDuncle** from Confirmed Streamers (HTML card, JSON-LD performer list, keywords meta, JS live-status poll list, llms.txt). Roster down to 26.
- **Tagline** — "ProjectX Meets IRL Streaming" → "Project X Meets IRL Streaming Competition" everywhere it appears (title, OG, Twitter, hero tagline, structured data).

### v0.2.1 — 2026-04-25

Patch — wristband copy tweak.

- **Wristband section** — reframed access scope from "every house, every party, and every event" to "all our.empire hosted parties & content events" so the language doesn't overpromise access to streamer-private spaces.

### v0.2.0 — 2026-04-25

Minor — SEO and machine-readability infrastructure.

- **Promo Video heading removed** — section now just shows the embedded video, no h2 above it.
- **Keywords meta** — appended the v0.1.0 streamer roster (Kimmee, Ice Poseidon, Dtan, Shangel, Ozemi, lifeismizzy, RiddaW) so the searchable terms match what's actually on the page.
- **Canonical URL** — added `<link rel="canonical">` so duplicate-URL crawls collapse to the root.
- **JSON-LD Event schema** — structured data for Google rich results: event name, dates, location, organizer, all 27 performers as `Person` nodes with their Kick URLs. Eligible for the Event SERP card.
- **robots.txt** — allow-all + sitemap reference.
- **sitemap.xml** — lists `/`, `/promo/`, `/disclaimer.html`, `/privacy.html` with priorities. `/obs/` is intentionally omitted (overlay tool, not a marketing page).
- **llms.txt** — LLM-friendly summary at root per [llmstxt.org](https://llmstxt.org/) so ChatGPT / Claude / etc. can ingest the event details and streamer list cleanly when asked about EmpireX.

### v0.1.3 — 2026-04-24

Patch — gave the Promo Video a real preview frame.

- **Promo Video poster** — extracted the EmpireX logo frame (~2 s into `empirexvideo.mp4`) as `promo-poster.jpg` and wired it as the `poster=` attribute. Section now shows the branded title card at rest instead of a black box, without the page-load cost of `preload="auto"`.

### v0.1.2 — 2026-04-24

Patch — collapsed the Confirmed Streamers featured row into the main grid.

- **Confirmed Streamers** — removed the standalone featured row. All 26 streamers now flow in the same uniform grid, fixing the awkward break on mobile where 5 large cards sat above the regular cards. Order preserved (the 5 originally-featured streamers remain at the start). The `streamer-featured` CSS hook is retired; if a featured row needs to come back later, it'd be reintroduced as a deliberate component rather than reusing dead code.

### v0.1.1 — 2026-04-24

Patch — small fixes to the audio controls and the Promo Video embed.

- **Hero audio** — added a volume slider above the mute/unmute pill. Moving the slider while muted auto-unmutes (so visitors aren't left wondering why dragging it does nothing).
- **Promo Video** — removed the `og-flyer.jpg` poster so the section embeds the video itself rather than the static flyer. Visitors hit play to watch.

### v0.1.0 — 2026-04-24

First tracked release. Establishes the versioning baseline and ships a batch of roster and content updates.

- **Confirmed Streamers** — added Ice Poseidon to the featured row (now 5 across) and Dtan, Shangel, Ozemi, lifeismizzy, and RiddaW to the regular grid. Live-status JS now polls all six.
- **Avatar sizing** — equalized featured-row avatars (100 px → 72 px) so the top row no longer towers over the rest. Removed featured-only text/padding overrides for visual consistency.
- **Dtan card** — added a solid black background under the transparent PNG so his card stops revealing the gold gradient when not hovered.
- **Promo Video section** — added below Confirmed Streamers, embeds `empirexvideo.mp4` with player controls (preload=metadata so the 8.8 MB file isn't fetched on page load).
- **Hero unmute button** — small pill in the bottom-right of the hero lets visitors toggle audio on the background video. Defaults to muted (autoplay-policy requirement).
- **Social bar** — fixed top-right cluster linking out to Kick, Instagram, Linktree, Discord, YouTube, and X. Hover treatment matches the streamer cards.
- **Copy** — CTA footer heading changed to "Ready to Join Empire X?".
- **Houses** — corrected the Jun 12–16 host from "Yann" to "The Baddest (TB)".
