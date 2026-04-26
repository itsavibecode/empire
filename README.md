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

### v0.10.13 — 2026-04-25

Patch — game polish round 13.

- **1symbol-b crop calibrated to the actual face dimensions.** Looked at the source image and realised the face spans almost the entire 2049 px (hat at ~y30, chin at ~y1500). Earlier overrides with `crop_bottom > 0.37` were literally slicing the mouth out of the source image — that's why the mouth wasn't showing in the bottom reel. New override: `crop_top: 0.02, crop_bottom: 0.15`. Hat in top reel, eyes/nose in middle reel, mouth/chin in bottom reel.
- **Save-as-PNG now shown for the LOSER outcome too.** The screenshot is still worth sharing.
- **PNG export is now edge-to-edge.** After `html2canvas` captures the body, the result canvas is cropped to just the slot machine region (plus a small breathing-room pad) and a custom-drawn purple top bar with `OUREMPIREX.COM/GAME` is composited above it. No more black margin around the slot in the saved image.
- **Background music defaults to UNMUTED.** Pre-v0.10.13 the default was muted, so audio stayed silent until the user explicitly unmuted (often after their first slot tap). Now audio plays as soon as the user's first click anywhere unlocks the autoplay policy.

### v0.10.12 — 2026-04-25

Patch — game polish round 12:

- **1symbol-b crop pushed further toward the top.** `crop_top: 0.10, crop_bottom: 0.45`. Face center at ~44% of strip (up from ~53%).
- **BookHockeys logo** dropped from `bottom: 5.5rem` → `2rem` so it sits near the very bottom of the page, well clear of the slot's white frame. Fixes the previous wrong-direction tweak.
- **Background-music volume slider** added next to the mute toggle. Persists via `localStorage`. Dragging the slider while muted auto-unmutes (familiar UX).
- **Woosh sound** on each reel-stop tap, wired to the new `audio/woosh-sound-effect.mp3` the user dropped in.
- The save-as-PNG export now also hides the new `.audio-controls` cluster (instead of the old `.mute-toggle` selector).

### v0.10.11 — 2026-04-25

Patch — five game improvements:

- **1symbol-b crop reversed direction** (face was moving down, user wanted up). New override: `crop_top: 0.07, crop_bottom: 0.50` — face center at ~53% of strip with eyes/nose in the middle reel and mouth in the bottom reel.
- **BookHockeys logo spacing.** Bumped `bottom: 3.6rem` → `5.5rem` so it sits further from the slot's white frame, and the slot itself moved up (body:after `bottom: 44%` → `50%`) for more breathing room below.
- **PNG export top bar.** `html2canvas` now uses an `onclone` callback to inject a branded purple top bar reading `OUREMPIREX.COM/GAME` and to hide the tabs/mute/dev/helper/version chrome — only in the captured image, not the live page.
- **Dev mode at `?dev=1`.** A small panel in the top-left of `/game/?dev=1` exposes "Force win: Cx / 400 / Nick White wins / LOSER" and a "Reset" button. Lets the admin trigger every prize outcome without actually spinning, to test the new sounds and the PNG export.
- **Audio infrastructure.** Five `<audio>` elements are wired up (background music + 4 prize sounds); a mute toggle in the top-right persists state via `localStorage` (defaults to muted to respect autoplay policies). Files are NOT in the repo — drop your own MP3/OGG into `game/audio/` (filenames documented in `game/index.html`) and they auto-load. Background music starts on first user interaction; per-prize sounds play when the result panel transitions in.

### v0.10.10 — 2026-04-25

Patch — fixes the "won but got LOSER" bug + bumps 1symbol-b crop again.

- **RTL background-position formula was wrong** (introduced in v0.10.8). The center reel scrolls right-to-left and its keyframe end positions are `[-66.6, -133.3, -200] vw` for values `[0, 1, 2]` — i.e., `-2 × (V + 1) × 33.3333`. My v0.10.8 formula used `-(V + 2) × 33.3333` which gave `[-66.6, -100, -133.3]`. Result: when the center row stopped, it showed the wrong cell visually compared to top/bottom — but the recorded `endValue` was still the row's actual value, so determinePrize correctly reported "no match". Visually the face could still look matched (faces are roughly symmetric so a misaligned slice can still seem to fit), giving the impression you'd won when you hadn't. Fixed.
- **1symbol-b crop** moved to `crop_top: 0.05, crop_bottom: 0.55`. Trims a sliver off the top of the head and a lot more of the shoulders — face fills more of the strip, eyes + nose ride higher in the middle reel, mouth/chin in the bottom reel.

### v0.10.9 — 2026-04-25

Patch — fix prize-message-to-symbol mapping + bump 1symbol-b crop.

- **Prize messages reordered.** The visible cell at the center of the viewport when a row stops is NOT the same as the row's `value` — because of how the keyframes offset background-position, value 0 ends with cell 0 centered, value 1 ends with cell 2 centered, value 2 ends with cell 1 centered. Symbol B (the mid-prize person) was matching at value 2, but the message printed was `PRIZE_MESSAGES[2] = "Nick White wins"` (the low prize). Reordered the array so the message shown matches the visible matched person: `['Cx', 'Nick White wins', '400', 'LOSER']` for values `[0, 1, 2, 3]`. Symbol A → top, Symbol B → mid, Symbol C → low.
- **1symbol-b crop bumped 0.30 → 0.40.** More of the shoulders cropped off so the face sits higher in the strip — eyes stay in the middle reel, nose visible alongside, mouth in the bottom reel as intended.

### v0.10.8 — 2026-04-25

Patch — three game polish fixes.

- **PNG export now matches the screen.** When a row stops, the saved image was sometimes capturing a mid-animation frame rather than the resting cell, so the screenshot didn't show the win lined up. Fix: when a row's `isRunning` flips to false, the React component now kills the keyframe animation and pins `background-position` to the end-of-cycle value via inline style. `html2canvas` reads that as a static value and captures it accurately.
- **1symbol-b crop adjustment.** Added a per-symbol override system in `build-game-strips.py`. For `1symbol-b.png`, 30% is now cropped off the bottom before the cover-fit, so the face fills more of the strip and the mouth lands in the bottom reel instead of being eaten by shoulders/torso.
- **Mobile sizing.** On viewports ≤ 768px the slot now fills much more of the screen: side black bars shrunk from 20% → 5%, white frame tightened to match, and reel height bumped from 12.07% → 18%. The strip image stretches slightly but the larger visual is the priority on portrait phones.

### v0.10.7 — 2026-04-25

Patch — fixed the slot's symbol layout to match the SMB3-style "stack the slices" effect, removed the diagnostic counter.

- **Reel slicing rebuilt.** Previously each cell held a whole face, so a "win" just showed three of the same face in three rows — visually meh and not what the original mini-game does. Now each symbol is fitted to one cell wide × three rows tall, then sliced into top/middle/bottom thirds. Each row gets its own strip containing only that row's slice. When all three reels stop on the same cell index, the slices stack vertically to recompose the complete face.
- **6 strip files instead of 2.** `.github/scripts/build-game-strips.py` now writes `strip-1-top.png`, `strip-1-center.png`, `strip-1-bottom.png` for "Fun" and equivalents for "More Fun". The script removes the legacy `strip-1.png` / `strip-2.png` if it finds them.
- **CSS** now references the per-row strips instead of one strip per set.
- **Removed the diagnostic click counter** (the on-screen `clicks: N | last: ...` indicator from v0.10.4) — game's working again.

### v0.10.6 — 2026-04-25

Patch — root cause of the "game doesn't work" bug found.

The strip image paths in `game/css/style.css` were `url("img/strip-1.png")`, which CSS resolves **relative to the CSS file's location** (`game/css/`), not the HTML page. So the actual lookup was for `game/css/img/strip-1.png` — a file that doesn't exist. The reels rendered as flat purple bars with no symbols, making it impossible to tell anything was happening when you clicked. Fixed to `url("../img/strip-1.png")` for both strip-1 and strip-2.

This also explains the "LOSER appears after one click" symptom: with no visible reel symbols, you'd naturally tap multiple times trying to make something happen, eventually advancing the game to a result. The triple-hide CSS from v0.10.5 stays as defense.

Verified visually in preview after the fix — the symbols load, the reels look right, and one click correctly stops just the top reel without revealing the result panel.

### v0.10.5 — 2026-04-25

Patch — defensive triple-hide for the result panel.

User reported that one click brought up the LOSER result on the live site, but the v0.10.4 click-counter confirmed `handleClick` is only firing once per click — so React state advances correctly (activeRowIndex 0 → 1, panel should stay hidden). The remaining hypothesis is that some browsers don't honor the `transform: translateY(100%)` reliably for a position-absolute element, so the panel sits on screen anyway.

Fix: hide the panel three different ways at once. Even if one fails, the other two keep it invisible.

- `transform: translateY(100%)` — original slide-down (still drives the slide animation when `.shown` is added/removed)
- `opacity: 0` — fade-out fallback
- `visibility: hidden` — hard hide (delayed-transitions back to `hidden` after the slide animation has 1s to finish, so the animation still plays going out)
- `pointer-events: none` while hidden so the panel can't intercept clicks even if positioned wrongly

The debug counter from v0.10.4 stays in place for one more cycle in case the issue isn't the transform — that way we can confirm the real fix vs guess again.

### v0.10.4 — 2026-04-25

Diagnostic — temporary on-screen click counter to track down why one user click is triggering all 3 reels at once on real-site usage (preview server can't reproduce the issue).

- Added a small yellow `clicks: N | last: <event> on <element>` indicator at the top-left of `/game/`. Updates on every `handleClick` invocation.
- If one user click bumps the counter by 1: handler is firing once, bug is elsewhere.
- If one user click bumps the counter by 2 or 3: there are duplicate listeners attached or the browser is re-firing the event. Diagnosis would point at React mounting twice or a browser/extension quirk.
- The counter will be removed once the bug is resolved.

### v0.10.3 — 2026-04-25

Patch — defensive fixes for the game's input handling.

- **`keydown` instead of deprecated `keypress`.** Some modern browsers no longer fire `keypress` for unmodified keys, which would have left desktop users unable to spin even after the v0.10.2 fix.
- **`cursor: pointer` on body.** iOS Safari has a long-standing quirk where `click` events don't fire on non-button elements unless they have a pointer cursor. Adding it makes taps work reliably without needing a separate `touchstart` handler.
- Game version bumped to v0.10.3.

### v0.10.2 — 2026-04-25

Patch — game wasn't responding to clicks or keys after v0.10.1.

Three causes, all fixed:

- **`.tabs` was full-width**, so the early-return guard that checks `e.target.closest('.tabs')` matched every click in the entire top strip — not just clicks on the actual tab buttons. Constrained the container to `width: max-content` (centered via translate) so only the buttons themselves capture clicks.
- **`.game-bookhockeys` was full-width**, so the BookHockeys link captured every click in the bottom strip and opened bookhockeys.com instead of spinning. Same fix — constrained to logo width via translate.
- **Keypress after a tab click did nothing** because the tab button kept focus, and my pointer guard fired against `e.target` (the focused tab) for keypresses too. Skipped the guard entirely for keypress events — keys always spin regardless of focused element.
- Also swapped the original `touchstart` listener for a single `click` listener that handles both desktop mouse and mobile tap (modern viewport meta eliminates the old 300ms tap delay).

### v0.10.1 — 2026-04-25

Patch — moved BookHockeys cross-link from the main site footer to the /game/ page (was a misread of the previous spec).

- **Main site footer** — removed the BookHockeys logo. Footer is back to the way it was at v0.9.0 (legal links + version display only).
- **`/game/`** — added the BookHockeys cross-link at the bottom: 70px logo at 35% opacity (rises to 65% on hover), links to bookhockeys.com. Sits above the `ourempirex.com/game` caption + version line. The Save-as-PNG capture still includes the full bottom block, so screenshots now show the BookHockeys cross-link too.
- Game version display bumped to `v0.10.1` to match.

### v0.10.0 — 2026-04-25

Minor — game customization (Fun / More Fun tabs, EmpireX artwork, PNG export) + main-footer cross-link to BookHockeys.

**Game (`/game/`)**
- **Two symbol sets** — added "Fun" and "More Fun" tabs at the top of the page. "Fun" uses the `1symbol-{a,b,c}.png` artwork; "More Fun" uses the `2symbol-{a,b,c}.png` artwork. Tab clicks swap a `body` class which switches the reel strip image via CSS — no game restart needed.
- **`.github/scripts/build-game-strips.py`** — composites the 6 source symbols into 2 reel-strip PNGs (`game/img/strip-1.png` and `strip-2.png`). The "More Fun" symbols are auto-cropped to their non-transparent bounding box first so transparent padding doesn't shrink them on screen. Re-run the script after dropping new artwork into `/img/`.
- **Reel background** changed from peachy `#FDCBC4` to EmpireX purple `#8E5CCB` (baked into the strip images and set as the CSS fallback).
- **Prize messages** updated to `Cx` / `400` / `Nick White wins` / `LOSER`.
- **Save-as-PNG export** — on a winning spin, a "Save as PNG" button appears under the prize text. Clicks capture the full visible display via `html2canvas` and trigger a download named `empirex-slots-<timestamp>.png`. The capture includes a small `ourempirex.com/game` caption + version number at the bottom of the page so the URL travels with anyone who shares the screenshot.
- **Title** changed to "EmpireX - Slots".
- **README cleanup** — removed the original CodePen author's tribute-to-an-old-game wording. Kept `license.txt` intact (MIT-style grant from Dario Corsi requires preserving the copyright notice — that's the legal floor, not optional).

**Main site footer**
- **BookHockeys cross-link** — 70px logo at 35% opacity (rises to 65% on hover) linking to bookhockeys.com. Sits just above the version display in the footer.

### v0.9.0 — 2026-04-25

Minor — added `/game/` (slot machine mini-game, currently with placeholder artwork).

- **`empire/game/`** — copied from `yada-yoda/gain-train` (the user's other GitHub account, so no third-party rights issue). Original code by Dario Corsi (CodePen `AXyxpp`); MIT-style license preserved at `game/license.txt`.
- **Rebrand pass on `game/index.html`** — title changed to "EmpireX Spin", added `<meta name="robots" content="noindex">`, added the EmpireX favicon. Updated the dead-redirect `fb.me` React 15.1.0 CDN to a stable cdnjs URL.
- **`robots.txt`** — `Disallow: /game/` so search engines skip the unlinked page (sitemap doesn't reference it either).
- **Not linked from the homepage**, per user request — only reachable via `https://ourempirex.com/game/` direct.
- **Placeholder artwork** — currently using the original CodePen S3-hosted SVG strips. To be swapped for EmpireX-themed symbols once the new artwork is provided.

### v0.8.0 — 2026-04-25

Minor — SEO and share metadata exposed to CMS.

- **`seo.json` at the repo root** — the user-facing SEO copy is now CMS-editable: page title (drives `<title>`, `og:title`, `twitter:title`), three platform-tuned descriptions (search / Facebook+LinkedIn / X), and a share image (drives `og:image` and `twitter:image`).
- **`.github/scripts/sync-seo.py`** — regenerates the eight relevant meta tags + `<title>` from `seo.json`. Idempotent. The `share_image` filename is auto-prefixed with `https://ourempirex.com/` for the absolute URL the OG/Twitter specs require.
- **What stays code-managed** (intentionally not exposed): canonical URL, `og:type`, `og:locale`, `og:image:width/height`, `twitter:card` type, charset/viewport, `keywords` meta, JSON-LD structured data. Either too technical or too risky to let drift.
- **Workflow** updated to also trigger on `seo.json` and run `sync-seo.py`.
- **`/admin/` CMS** has a fifth collection: **"SEO & Sharing"** with hint text on character limits per platform.

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
