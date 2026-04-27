# EmpireX (ourempirex.com)

The world's first live-streamed reality experience. June 11–15, 2026 in Kissimmee, Florida. Streaming groups compete for social influence and a cash prize across 5 days, broadcast live on Kick.

A static promotional site (GitHub Pages) hosted at [ourempirex.com](https://ourempirex.com).

## Versioning

Each subproject under this repo has its **own independent SemVer**. Going forward each ticks separately, so a change to `/run/` doesn't bump `/game/` or the main site, and vice versa. Each footer shows its own scoped label so it's clear which version you're looking at:

- **Site v0.X.Y** — main marketing/event site (`index.html`, `obs/`, etc.)
- **Slots v0.X.Y** — the slot mini-game at `/game/`
- **Run v0.X.Y** — the runner game ("On Baby!") at `/run/`
- **Trending v0.X.Y** — the cross-chat word cloud at `/obs/trending/`

The changelog below is chronological and tags each entry with its scope.

## Changelog

### Run v0.18.52 — 2026-04-27 — JAIL FEATURE complete (phases A + B + C)

PHASE C: BAIL-XENA flow + Xena anti-sidekick + two unrelated bug fixes that surfaced during phase C work.

**BAIL XENA INSTEAD button now active.** When clicked from the jail dialogue, `jailBailXena()` runs:
- Spends 100% of Mike's current Cx (could be 0 — design intent: this option exists exactly so a broke player has SOMETHING to do besides quit)
- Drops `state.lives` to **min(state.lives, 1)** so a 5-life Mike loses 4 lives but a 1-life Mike loses none
- Same resume mechanics as self-bail: cop touch counter reset, distance rolled back 150m, all in-flight obstacles/pickups/cars/fauna wiped, all active effects cleared, 1.5s respawn invuln
- Triggers a **canvas-side screen distortion** for ~1500ms (3-pass chromatic-wave + glitch bars + `xena-bailed-out.mp3` sting) so "her bail-out is happening" reads as a magical/ritual moment
- After the distortion, the **`xena-bail` cutscene** fires with the line: *"Thanks Mike for bailing me out. Nick White snitched, AGAIN. You a real homie Mike! I'll repay you... later... are you allergic to silicone?"* — uses the 3 chroma-keyed `cutscene-xena-closed/mid/open.png` panels (mouth animates with the typewriter)
- Cutscene `onComplete` activates `state.xenaFollowing = true` and calls `finishJailExit()` to resume gameplay

**Xena follower (anti-sidekick).** Once active, she runs alongside Mike on the opposite side from Ice (or the side with more room if Ice isn't around). 4-frame walk cycle (`xena-walk-01..04`) at 110ms, height-matched to Ice for visual parity, mirrors horizontally if she's on Mike's left so she always faces forward.

**Steal mechanic** (`tryXenaSnipe`):
- Detection radius **250 px** around Xena's position
- 30% probability per item per first-frame-in-radius (then "tagged" — subsequent frames don't re-roll)
- Tagged items get consumed when their Y line passes Xena's Y line, awarding nothing to Mike + playing `xena-coin-pickup.mp3` + briefly gold-glowing Xena's body
- **Steals Cx coins AND weed pickups** per spec
- **Does NOT steal**: ham, +1 life (h400), horse, phone-thief obstacles — those land for Mike normally
- Hidden during the water phase + during horse rides + during cutscenes (same rules as Ice)

**Bug fix #1 — cutscenes no longer let distance/time tick through.** `loop()` now treats `cutscene.active` as a freeze state alongside pause + jail. Pre-fix: a slow reader during e.g. `first-meet @ 600m` could blow past `mike-tells-off @ 2000m` mid-dialogue and trigger them back-to-back as soon as the first finished. Now distance + elapsedMs + spawning + sprite walk-cycles all freeze during cutscenes.

**Bug fix #2 — leaderboard music swap.** `pickRandomMusic()` was filtering by `channel === 'music'`, which after phase A landed `jailed.mp3` in the random pool — causing fresh runs to roll jail music as their gameplay bg, and clicking the leaderboard surfaced it as the audible track. Fixed by tightening the filter to keys starting with `bg-music-` (the intended ambient pool).

### Run v0.18.52 — 2026-04-27 — JAIL FEATURE phase B (self-bail)

NEW MECHANIC: Mike gets jailed on his **2nd cumulative cop touch** in a single run. Cop cars (lane spawns) AND cross-traffic cop cars both count. The 1st touch behaves as before (lose a heart). The 2nd touch fires the jail sequence INSTEAD of life loss.

**Sequence:**

1. **BUSTED flash** (~2.4s, canvas overlay). Big "BUSTED" text alternating red/blue police-light tint over a full-screen veil that flips colors every 200ms. `sirencops.mp3` plays. World is fully frozen — `update()` skipped, all looping audio paused.

2. **Jail screen** (HTML overlay). Shows `jail-bg-open.png` / `jail-bg-closed.png` swapped every 600ms for an eye-blink effect on Mike. `jailed.mp3` plays as music; `policejail.mp3` loops as ambient station-chatter SFX. Dialogue at the bottom offers three buttons:

   - **PAY 75 Cx** — self-bail. Price doubles each subsequent self-bail in the same run (75 → 150 → 300 → 600...). Greyed out + disabled if Mike can't afford it.
   - **BAIL XENA INSTEAD** — stub button, disabled in this commit. Phase C wires it.
   - **QUIT TO TITLE** — bail out of the run entirely.

3. **Self-bail outcome** (`jailBailSelf()`):
   - Deduct the bail price from `state.coins`
   - Increment `state.bailCount` (drives next price doubling)
   - Reset `state.copTouches` to 0
   - **Soft penalty**: roll `state.distance` back 150m so the bail isn't a free skip past whatever cop was about to hit
   - Restore Mike to the saved `checkpointLane` from jail-entry
   - Wipe all in-flight obstacles, pickups, fauna, chase-officers, cross-cars (per spec — pickups don't survive jail)
   - Clear all active effects (ham bonus, weed debuff, horse boost, controls reversed)
   - 1.5s of post-bail invulnerability so respawn doesn't immediately re-hit
   - Play `bailed-out.mp3`, restart pre-jail music + mob ambient

4. **Quit outcome** (`jailQuitToTitle()`): closes jail loops, calls `endRun()`, kicks the player back to the title screen instead of the game-over summary.

**State additions:** `state.copTouches`, `state.bailCount`, `state.jail = { phase, startedAt, checkpointDistance, checkpointLane }` with phases `'none' | 'busted' | 'cell' | 'bailing'`. All reset on every fresh `startRun`.

**Input is fully gated during jail** — keyboard lane-shift + jump are blocked while `state.jail.phase !== 'none'` so a stuck key from before the bust can't activate during the BUSTED flash or dialogue. The render-loop also freezes its `now` value during jail so sprite walk-cycles stop animating.

**God mode (`?god=1`)** never gets jailed — `handleCopHit` early-returns false in dev mode so playtest cop hits behave as before.

**Phase C still pending**: bail-Xena flow + Xena anti-sidekick follower. The 3 dialogue panels (`cutscene-xena-*.png`), 36 Xena sprite frames, and `xena-bailed-out.mp3` / `xena-coin-pickup.mp3` audio are already shipped in v0.18.52 phase A (commit `5b9d1b1`); phase C wires them into a runtime flow.

### Run v0.18.51 — 2026-04-27

Visual + UX polish pass — eleven fixes from a single playthrough review session.

**1. Cop cars no longer guillotined.** `bottomCropFrac=0.12` was added back when cop-car sprites had a baked-in iso ground-shadow; the chroma-keyed sprites are clean now and the 12% crop was eating the front bumper curve, the rear wheel arch, and the wheels themselves — visually reading as "no front, no rear." Removed entirely. Same fix on the pedestrian obstacles where `bottomCropFrac=0.06` was slicing shoes; sprites are clean, no crop needed.

**2. "Scrammed" → "scammed" typo** in the post-water Adin Ross panel.

**3. Headless cops removed from the rotation.** Source sheet's frames 06 + 11-15 captured 1.5 sprites each (grid-misalignment), producing torsos with no heads or sliced bodies. Trimmed `COP_OFFICER_VARIANTS` to use the intact frames only. The faintly-ghosted 07-10 stay in pool — heads + bodies are intact, just minor outline shadow below.

**4. Flipped phone-thief sprites re-extracted clean.** Frames 9-12 (the `walk-reaching-flipped` obstacle) had visible white square backgrounds because the original corner-seeded flood-fill never started — sprite touched all four corners. Switched to edge-seeded flood-fill with multi-target bg matching (light-grey checkerboard + pure white speckle pockets). Connectivity-aware so the woman's white polka-dot skirt on row 2 stays intact.

**5. Pause now freezes ALL animations.** Previously gameplay paused but sprite walk-cycles kept ticking in place, which read as "everything's frozen except the goofy walking pedestrians." Two-part fix: render() now receives a frozen `now` value while paused (so `(now - spawnedAt)` math doesn't advance frame indices), and `shiftEffectTimers` was extended to shift every collection's `spawnedAt` (obstacles, pickups, fauna, chase officers, Shoovy boat, cutscene typewriter) forward on resume so animations continue mid-cycle instead of jumping.

**6. Rain visible OVER the Shoovy cutscene.** The cutscene panel is a DOM overlay covering the canvas; the canvas-rendered rain was hidden behind it. Added a CSS-animated rain layer (`.overlay-cutscene.is-stormy::after`) — two stacked diagonal repeating-linear-gradients scrolling diagonally to simulate streaks, with a slight blue-grey storm tint matching the canvas-side `rgba(28,50,70,0.18)`. Pointer-events:none so dialogue buttons still work. Toggled on for `shoovy-meeting`, off elsewhere.

**7. NPC runners actually run past Mike.** They were already scrolling with the world but at world-speed exactly, which read as "stationary cardboard cutout sliding with the ground." Added a +25% per-tick speed bump for any obstacle whose type id is `npc-runner` so they look like they're sprinting past.

**8. Animals occasionally cross the road.** ~12% of fauna spawns now pick "crossing" — they enter from off-screen left or right with a horizontal vx (260–380 px/sec) and slide across the canvas while still scrolling up at world speed. Sidewalk loiterers (the other 88%) are unchanged. Still no collision — fauna remain pure ambient.

**9. Pause-panel "Pickups & Friends" Ice Poseidon icon is now head-only pixel art.** New `ice-head.png` extracted via component-isolation from `ice-15.png` (find the topmost 30% of the character bbox, run connected-components in that band, keep the largest blob — discards the selfie-stick top which sits separately at head height). The full-body sprite was reading as a tiny indistinct figure at icon size; head-only reads instantly.

**10. NEW-record celebration tied to the leaderboard.** New big "NEW RECORD!" overlay fires once per run when `state.distance` crosses the leaderboard's current #1 score. Cached at run start via `RunnerLeaderboard.fetchTop(1)`. Gold-glow headline, subline showing the new distance + previous best, confetti sparkles flickering around it, scale-in/hold-with-pulse/fade-out envelope (3.2s total), 10-chirp coin SFX fanfare. **Skipped if the leaderboard hasn't loaded (network error, null cache) OR if it's empty (top===0)** — per design, an empty board means there's no record to break yet. Also skipped in `?god=1` dev runs so dev playtests don't fanfare on every dev jump.

**11. Pause-resume animation continuity.** All `spawnedAt` shifts in `shiftEffectTimers` now also cover `state.coinRewardFlash` and the new `state.newRecordFlash` so pausing mid-celebration doesn't expire the overlay on resume.

### Run v0.18.50 — 2026-04-27

Three connected changes — turning the storm into a one-time event and making the city after it noticeably nastier.

**1. Water is now single-shot.** Previously the storm re-fired every 3500m forever. The user wants it to feel like a story beat, not a recurring weather pattern. Added `state.water.completed` flag — set to `true` when the exit transition finishes and the phase returns to `'none'`. `maybeTriggerWater` early-returns if `completed` is true. Reset to `false` in `startRun` (so a fresh game can fire it again) and in `startWaterPhase` (defensive — should never be true at start of a new water phase). Flag still leaves room for the dev to opt back into recurrence later if we want a v2 second-storm bit.

**2. Post-water difficulty ramp.** Once Mike's back on land after the hurricane, the city gets MEAN. New `dangerMul` factor in the obstacle/pickup spawn block:

- `dangerMul` = 1.0 pre-water (no change to existing balance)
- After water exit, scales linearly from 1.0 → **2.5×** over 5000m of post-storm distance
- Pickup spawn chance scales with `dangerMul` (capped at 0.15 per spawn tick) — more weed, more ham, more phone-thief variants in the rotation
- Bonus phone-thief spawn: at peak danger (~2.5×), there's a ~24% chance per regular spawn tick to also drop a SECOND phone-snatcher in a different lane on the same tick. Two threats to track, harder to dodge clean

The ramp is gated on `state.water.completed` so pre-water gameplay stays at the existing baseline. User feedback was that the run gets boring once you've survived the storm — this gives the back half real teeth.

**3. Flipped phone-snatcher (snatches from BOTH sides).** Added `npc-pedestrian-flipped-01..12.png` from `/run/concept/npcs-pedestrians-flipped.png`. New `extract-pedestrians-flipped.py` handles two quirks the original extractor didn't:

- The source sheet has a checkerboard grey/white background (each cell is its own bg color), so per-cell auto-detection beats a global flood-fill. Added `detect_corner_bg` helper that votes on the most common corner color per cell.
- Gemini didn't actually mirror the poses — they came out facing the same direction as the original sheet. So the script now `Image.FLIP_LEFT_RIGHT`s every cell after extraction to guarantee a true mirror. The phone-snatcher in row 3 then reaches from the OPPOSITE side, which is the entire reason this second sheet exists.

Wired into `OBSTACLE_TYPES` as `walk-reaching-flipped` (frames 9-12), same `phoneThief: true` collision behavior as the original. Both variants now in the spawn pool — random distribution means snatches come from either side. The new `spawnExtraPhoneThief(avoidLane)` helper used by the difficulty ramp picks one of the two thief variants at random and drops it in a non-`avoidLane` lane.

### Run v0.18.49 — 2026-04-27

Two fixes + new feature:

**1. Shoovy cutscene now actually fires.** The math in v0.18.44 was off:
- `SHOOVY_BOAT_SPAWN_MS = 4500ms` into water body (boat spawns 4.5s in)
- Boat at 100 px/sec needed ~5.94s to travel from viewport bottom to trigger Y
- Total time needed: 4500 + 5940 = **10,440ms** into water body
- But `WATER_BODY_MS = 10,000ms` — body timed out before boat reached trigger
- Phase flipped to `'exiting'` before cutscene could fire; v0.18.47's "clear boat on exit transition" fix sealed it

Fixed by:
- `WATER_BODY_MS`: 10s → **14s** (extends the storm — user OK'd this)
- `SHOOVY_BOAT_SPAWN_MS`: 4500 → **2500** (boat spawns earlier)
- `SHOOVY_BOAT_VY`: 100 → **150 px/sec** (boat moves faster)

New timing: boat spawns 2.5s into body, takes ~4s to reach trigger Y, cutscene fires at ~6.5s into body. Body ends at 14s — plenty of buffer.

**2. NEW post-water Adin reward.** After Mike returns to street from the storm (only if the Shoovy cutscene actually fired), Adin pops in for one more panel:

> **ADIN ROSS:** *"Hahah get scrammed! Okay fine here is 10 Cx coins."*

`onComplete` adds 10 to `state.coins`, recomputes the multiplier (might bump ×1→×2 if it crossed the 6-coin threshold), and triggers a new **coin-reward-flash overlay** drawn in `drawEffects`:

- Centered "+10 Cx" gold text with the spinning `cx-coin` sprite to its left
- 2.4s total duration: scales 0.6→1.2 over first 30%, holds at 1.0, fades over last 30%
- Slight Y-rise during the flash for a "popping up" feel
- 5 rapid `coin-pickup` SFX chirps over 400ms for audio feedback

Trigger gating: `state.cutscenesTriggered['adin-post-water']` ensures it fires once per game (subsequent water segments don't repeat the bit). Pause-aware: the flash's `startedAt` is shifted by `shiftEffectTimers` so pausing mid-flash doesn't expire it instantly on resume.

### Run v0.18.48 — 2026-04-27

Fix — water EXIT transition tile was never visible. Real bug, not a perception issue.

`drawWaterRoad` was computing `tProgress = elapsed / transitionDur` where `elapsed` is the TOTAL water-segment elapsed (from `state.water.startedAt`), not the phase-relative elapsed. During EXIT:

- Total elapsed at exit phase start: **12,500ms** (WATER_ENTER_MS 2500 + WATER_BODY_MS 10000)
- transitionDur: **2,500ms**
- Computed tProgress: `12500 / 2500 = 5` → clamped to **1**

So from the FIRST frame of the exit phase, the boat-ramp tile rendered as if it had already scrolled fully off the top of the screen. Player saw the BG underlay (street tile from v0.18.41 layered fix) for the entire 2.5s, then phase flipped to `'none'` — looked like an instant snap from sea to street with no transition.

Worse: the Shoovy `onComplete` explicitly sets `startedAt = now - (WATER_ENTER_MS + WATER_BODY_MS)` to jump the phase forward, which made `elapsed === 12500` *immediately* at the moment the cutscene closed. Same broken math.

Fix: introduce `phaseStartElapsed` per phase (entering = 0, exiting = WATER_ENTER_MS + WATER_BODY_MS). Compute `phaseElapsed = elapsed - phaseStartElapsed` and use that for the tile-scroll progress. Now during EXIT:

- phaseElapsed: 0 → 2500 over the full 2.5s phase
- tProgress: 0 → 1
- Boat-ramp tile actually scrolls UP across the screen as designed

This bug has been live since v0.18.34. The v0.18.41 layering fix and v0.18.47 boat-only-in-water fix were both real but couldn't be observed correctly because the transition tile itself was invisible the whole time. Should now see the boat-ramp tile fully scroll past during the 2.5s exit phase, revealing street as it rises.

### Run v0.18.47 — 2026-04-27

Three fixes from playtest:

- **Shoovy's boat is now water-only.** Per playtest rule "Shoovy's boat should never touch land": `drawShoovyBoat` now early-returns unless `state.water.phase === 'water'`. Also explicitly clears `state.water.shoovyBoat = null` when the phase transitions to `'exiting'`, so the boat disappears the moment the boat-ramp tile starts crossing.
- **Sail tip "cut off" repair.** The 6-frame sail sprite extraction was using TOLERANCE 90 / FEATHER 30 for chroma-key, which was eating anti-aliased pixels at the sail's pointed tip (the AA edges drift toward greenish values that fall inside the tolerance window). Tightened to TOLERANCE 60 / FEATHER 18 — preserves the sail's full curved finial. Re-extracted all 32 `shoovy-sail-*.png` frames.
- **Ice never appears during water.** New rule per playtest. `drawIce` returns early if `state.water.phase !== 'none'` so even if some code path left `iceSidekickJoined=true` going into water (e.g., the dev URL `?water=1` skip that bypasses the `before-water` cutscene), Ice stays hidden. Also force-clears `iceSidekickJoined` + `iceTrailing` inside `startWaterPhase` as belt-and-suspenders.

### Run v0.18.46 — 2026-04-27

UX fix — dev URL params (`?cut=`, `?water=1`, `?dist=NNN`) now **auto-start the run** instead of dropping the user on the title screen. v0.18.44 wired the dev-params application inside `startRun()`, which only fires when the player clicks START — so the URL didn't actually skip to the requested state. Now `init()` checks if dev mode is unlocked AND the URL implies a state change (cut, water, or dist), and if so, fires `startRun()` automatically after the first frame paints.

`?god=1` alone still respects the title screen since "god mode" is a play-mode toggle, not a scene jump — the player still picks when their god-mode run begins.

### Run v0.18.45 — 2026-04-27

Polish — dramatic lightning + thunder during the Shoovy mid-water cutscene.

The canvas-side weather effects from `tickWater` (rain particles, lightning flashes, screen tint) get occluded the moment the cutscene overlay appears — `.overlay-cutscene` sits at z-index 40 over the game canvas. So the player saw a sudden cut to "calm dialogue" mid-storm, breaking the tension.

Fix: schedule a **3-burst lightning sequence** specifically for the `shoovy-meeting` cutscene, rendered ON the overlay element itself instead of the canvas behind it:

- New `.overlay-cutscene.lightning-flash::before` CSS pseudo-element does a 110ms white-flash animation with a stuttering opacity envelope (peaks at 100%, dips to 40%, peaks again at 95%, fades to 0%) — same forked-lightning feel as the canvas-side effect.
- New `scheduleCutsceneLightning([delays])` JS helper fires the CSS class + plays a random thunder variant (from the 3-clip pool) at each delay.
- Triggered from `startCutscene('shoovy-meeting')` with delays `[700, 2300, 3900]` ms — three bursts spaced across the dialogue so the storm reads as an ongoing presence, not a backdrop.
- `cutscene.active` is checked at fire time so if the player blasts through the cutscene with Enter, queued bursts skip themselves.

### Run v0.18.44 — 2026-04-27

Big — **Shoovy mid-water encounter** + **dev URL params** for testing.

**Shoovy interrupts the water phase.** ~4.5s into the water body, Shoovy's sailboat spawns at the bottom of the screen and slowly scrolls up toward Mike at 100 px/sec (slower than world scroll, so it visibly *approaches*). When the boat top reaches viewport-Y 45%, the new `shoovy-meeting` cutscene fires:

> **SHOOVY:** *"i dough knot uh know, why you would be out here with your life so importantly meaning, but i uh am too and need land fastly."*

`onComplete` cuts the rest of the water-body short — jumps straight to the exit transition so the player isn't stuck in storm for another 5s after Shoovy disappears. Boat sprite cycles 4 sailboat frames at 280ms (`shoovy-sail-01/05/09/13` — Shoovy actively rowing/adjusting sails) with a subtle Y-bob for wave rocking. New `cutscene-shoovy-{closed,mid,open,blink}` panels are preloaded.

**DEV URL PARAMS** for testing — **gated behind a `localStorage` unlock flag** so even someone reading the JS source can't activate them via URL alone. Anyone else visiting the same URL with params still gets normal play (params silently ignored).

To enable dev mode IN YOUR BROWSER ONLY, open DevTools console (F12) on `/run/` and run:

```js
localStorage.setItem('empirex_runner_dev_2026', 'unlock');
```

To disable again: `localStorage.removeItem('empirex_runner_dev_2026')`.

Once unlocked, these URL params work:

| Param | Effect |
|---|---|
| `?god=1` | God mode — Mike doesn't lose lives, attempt counter doesn't increment, score submit blocked. HUD shows a gold `👁 GOD MODE` badge so it's obvious. |
| `?dist=NNN` | Start at distance NNN meters. Useful for testing late-game features without playing through 4500m. |
| `?cut=NAME` | Fire a specific cutscene immediately on game start. Names: `first-meet`, `mike-tells-off`, `ice-returns`, `before-water`, `adin-ross`, `shoovy-meeting`. |
| `?water=1` | Jump straight into the water phase on start (skips the cutscene chain). |

Examples for testing (only work after the localStorage unlock):
- `https://ourempirex.com/run/?god=1&water=1` — god mode + drop into the storm immediately
- `https://ourempirex.com/run/?god=1&cut=shoovy-meeting` — preview Shoovy's panel in isolation
- `https://ourempirex.com/run/?dist=3500` — start at 3500m so the next ice-returns + adin-ross + water sequence triggers in ~10 seconds of running

Unknown `?cut=` names log a warning to console listing the valid ones.

### Run v0.18.43 — 2026-04-27

Polish — the OG share preview was broken at launch and never noticed. Fixed.

- **Generated `/run/og-runner.jpg`.** The meta tags had referenced this file forever but it was never created — every Facebook / Discord / iMessage / Slack / Twitter share preview was rendering only the URL fallback. New `build-runner-og.py` script composes the official 1200×630 share image from `titlescreen.jpg` (Mike + Ice in Chile) cover-fit into the standard OG canvas, with vignette gradient for legibility, "ON BABY!" cursive title at top, "An EmpireX endless runner — Chile streets, mob chase, hurricane survival" tagline, and OUREMPIREX.COM/RUN URL caption at bottom. Uses cross-platform font fallback (Windows / macOS / Linux) so the script runs anywhere. JPEG quality 88 — small file, plenty crisp at the social-card render size.
- **Tightened the meta tags:**
  - Updated `description`, `og:description`, and `twitter:description` to match the current game (mentions hurricane, cop cars, stream snipers — the v0.18.x feature set, not the launch state).
  - Added `og:image:secure_url` (some crawlers prefer the explicit HTTPS field) and `og:image:type` (so the crawler doesn't have to sniff MIME).
  - Added `twitter:image:alt` for accessibility on Twitter cards.
  - Added `theme-color: #8E5CCB` so mobile browser chrome picks up the game's purple palette when added to home screen / shared.
  - Tightened `og:image:alt` to mention both Mike + Ice + the URL caption (more accurate to what the image actually shows).

Re-run `build-runner-og.py` after any title-art or tagline change.

### Run v0.18.42 — 2026-04-27

Three fixes from playtest:

- **Cutscene chain bug** — the v0.18.40 chain (`before-water` → `adin-ross` → water) was broken because `advanceCutscene` clobbered `cutscene.active = false` AND `cutscene.defId = null` *after* calling `onComplete`. So when `before-water.onComplete` chained to `startCutscene('adin-ross')`, the very next two lines killed Adin's setup and hid the overlay. Player saw the road, hit Enter expecting to advance, hit nothing, may have ended up triggering some other key path. Fix: capture `preDefId` before `onComplete`, then only wipe state if `cutscene.defId === preDefId` (i.e., onComplete did NOT chain to a new cutscene). If a chain happened, leave the new state alone so the chained cutscene runs.
- **Mob-ambient bleed into water phase** — also in `advanceCutscene`'s end-block, the code unconditionally restarted `mob-angry` if `state.phase === 'playing'`. But when Adin's onComplete fires `startWaterPhase` (which intentionally stopped mob and started water/rain), the very next line restarted mob on top of the water audio. Fix: only restart mob if `state.water.phase === 'none'`.
- **Adin idle animation** — speakers now keep cycling their mouth/hand frames during `showingChoices` (after text finishes typing) instead of freezing on the closed-mouth pose. Cycle pattern: 3 frames (closed → mid → open) repeating 3 times, then a ~700ms pause beat on the closed frame, then loop. Reads as natural fidgeting (mouth movement + hand-rubbing visible across Adin's 3 panels) rather than a hyperactive twitch. Applies to all speakers.

### Run v0.18.41 — 2026-04-27

Fix — water transition flicker on both edges.

Verified the source-tile mapping is correct (`1roadwater.png` = enter, top=street/bottom=water; `3roadwater.png` = exit, top=water/bottom=street). The bug was the **BG underlay**: I was picking ONE bg color for the whole viewport during a transition, which created a brief visual flicker at the edges where the tile didn't fully cover.

Fixed by rendering the BG in **two layers** based on the transition tile's current Y position:

| Phase | Above the tile | Below the tile |
|---|---|---|
| `entering` (street→water) | **STREET** (where Mike came from) | **SEA** (where he's heading) |
| `water` | (no transition tile) | (just animated sea everywhere) |
| `exiting` (water→street) | **SEA** (where he came from) | **STREET** (where he's heading) |

Each region gets its own clipped render (sea-tile or street-tile underlay) so the BG matches what the tile content shows at that edge — smooth visual continuity from street through the cliff/ramp into sea and back, no mid-frame flash.

### Run v0.18.40 — 2026-04-27

Two things:

**1. NEW Adin Ross cutscene** — fires right before the hurricane to bait Mike outside with a $70k offer.

- Source art: 3 panels (`adin ross (1).png` mouth-closed, `(3).png` mid, `(2).png` mouth-open) on neon-green chroma-key bg in `/run/concept/`. New `extract-adin-cutscene.py` (same chroma-key pipeline as `extract-ice-cutscene.py` — target rgb 7/223/33, tolerance 90, 30-px feather) outputs `cutscene-adin-{closed,mid,open}.png` in `/run/img/`.
- New `adin-ross` cutscene def (`manualOnly: true`) with one panel:
  > **ADIN ROSS:** *"Bro, come on. Bro, don't listen to Ice, I got $70,000 if you go outside and survive the hurricane. It'll be fun."*
- Trigger chain reworked. First-water cutscene flow is now:
  - Ice still with Mike → `before-water` (North Pole) → `adin-ross` ($70k bait) → water phase
  - Ice already gone → `adin-ross` → water phase
  - Subsequent water segments: no cutscene, dive straight in
- Wired via `before-water.onComplete` → `startCutscene('adin-ross')` (chained), and `maybeTriggerWater` directly fires `adin-ross` when Ice isn't around. Both paths' `adin-ross.onComplete` calls `startWaterPhase()`.

**2. Stoned-chase cops now visually varied** — was 4 identical clone officers walking in lockstep; now each one picks a different character variant.

- New `COP_OFFICER_VARIANTS` pool: 6 distinct 2-frame walk cycles built across the source sheet's 3 rows (profile-walking row 2, front-facing row 1, smaller chibi row 3) — 6 different body shapes / facing directions.
- `spawnStonedChase` shuffles the pool and assigns a unique variant to each spawned officer (without replacement, so a posse of 4 shows 4 distinct chars). Each officer carries its own `sprites` array + per-officer `frameOffset` so two officers using the same variant still don't step in lockstep.
- Each officer's `w`/`h` is computed from ITS variant's first frame instead of a single shared reference, since different chars have different sprite dimensions.
- `drawChaseOfficers` reads the per-officer `sprites` array instead of the old global `COP_OFFICER_WALK_FRAMES` constant. No more uniform marching army.

### Run v0.18.39 — 2026-04-27

Polish — replaced static-pose NPCs with **proper 6-frame run cycles**, no shadows. Per playtest the cardboard-cutout protesters/chibis felt fake even with the bobPx fakery. New sprites have actual animated leg movement.

**Asset pipeline:**

- New `extract-npc-runners.py` slices 7 source sheets (`peds - (1).png` through `peds - (10).png` in `/run/concept/`, each 4 rows × 6 columns) into 168 individual sprites named `npc-runner-NN-F.png` (NN = character index 01..28, F = frame 1..6). Same `flood_remove_corner_color` + `keep_largest_blob` pipeline as the mattress + officer extractions — flood-fills white from sheet corners + per-cell to remove the surrounding box while preserving any white interior detail.
- Result: 28 distinct Chilean character types each with a clean 6-frame forward-facing run animation. No ground shadows (the alpha is clean to the feet).

**OBSTACLE_TYPES rework:**

- Dropped `static-protester` (6 entries) and `static-chibi` (6 entries) which were single-frame poses faking motion via `bobPx: 12`.
- Added 8 `npc-runner` types — character indexes 01, 02, 03, 04, 14, 15, 16, 25, picked for visual variety across the source sheets:
  - 01: drunkard with bottle + straw hat
  - 02: granny with chicken leg
  - 03: CAT-shirt sports fan
  - 04: Cristal-beer cap guy
  - 14: angry punk
  - 15: black cowboy hat
  - 16: Pepsi-shirt guy
  - 25: Chilean flag waver
- Each cycles 6 frames at 110ms (~9 fps run cadence). `bobPx: 0` since the actual leg animation does the work.
- New `_seqDash(prefix, n)` helper builds the unpadded `npc-runner-XX-1..6` array (existing `_seq` zero-pads). Existing OBSTACLE_TYPES auto-preload walks every type's frames so the new sprites register without an extra preload block.

The original `walk-hoodie`, `walk-woman`, and `walk-reaching` (phone thief) entries are unchanged — they already animate properly.

### Run v0.18.38 — 2026-04-27

Minor — **STONED CHASE**. When Mike grabs a weed pickup past 1500m, 2-4 cop officers now spawn at the bottom of the screen and walk upward toward him for the duration of the debuff. Reads as "the city is onto you for being high in public."

**Asset pipeline:**

- New `extract-cop-officer.py` slices the source officer sheet (`/run/concept/ChatGPT Image Apr 26, 2026, 01_50_20 PM.png`, 5×3 grid, white background) into 15 individual `cop-officer-XX.png` sprites. Same `flood_remove_corner_color` pattern as the mattress extraction — flood-fill white from sheet corners + each cell corner so the officer's blue uniform interior is preserved while the surrounding box is gone. All 15 frames preloaded.

**Mechanic:**

- Spawn fires from inside `applyPickup` when `kind === 'weed'` AND `state.distance >= STONED_CHASE_START_DISTANCE_M (1500m)`. Random 2-4 officers (`STONED_CHASE_MIN_OFFICERS`/`MAX`), random lane assignment, small Y-stagger so they don't clump.
- Officers scroll UP at 92% of `effSpeed` — visibly trailing Mike but never quite catching him. Each cycles through frames `cop-officer-06..09` (the cleanest profile-walking poses from row 2 of the source sheet) at 140ms/frame, with a per-officer `frameOffset` so they don't all step in lockstep + a sin-wave Y-bob (~6px) for stride bounce.
- Cull on ANY of: weed debuff ends (`now >= weedDebuffUntil`), officer scrolls off screen top, OR water phase starts (`startWaterPhase` clears the array along with cars/people).
- Pure visual — no collision. The weed debuff's slowdown + screen tint + reversed-multiplier impact is already the gameplay punishment; the chase is flavor.

**Render order:** `drawChaseOfficers` runs after lane obstacles + fauna but before Mike + cross cars, so officers layer naturally with pedestrians and Mike correctly occludes any officer who scrolls under his Y line.

### Run v0.18.37 — 2026-04-27

Fix — water → street EXIT transition now actually shows street being revealed instead of flickering back to sea before the snap.

The exit phase scrolls the boat-ramp transition tile UP through the screen. The problem in v0.18.36 was that the BG behind the tile was always **sea** — so as the tile cleared the top of the screen, the player saw a beat of "still all sea" right before the phase flipped to `'none'` and the regular street tile snapped in. Visual hiccup right at the destination.

Now the BG layer adapts to the phase direction:

| Phase | BG underlay | What that does |
|---|---|---|
| `entering` | SEA (animated alternating waves) | Cliff transition reveals sea below |
| `water` | SEA | Pure animated sea, no transition tile |
| `exiting` | **STREET** (regular `currentRoadKey` tile) | Boat-ramp transition reveals street below as it scrolls up |

New `drawStreetTileForBackground(yTop, yBot)` helper does the regular vertical-tile-scroll pattern but specifically as the underlay for the EXIT phase. So during the boat-ramp scroll, you see street appearing through the lower portion as the tile rises, smoothly bridging to the post-water world without that mid-frame "still sea" flash.

### Run v0.18.36 — 2026-04-27

Three fixes for the hurricane segment from playtest:

- **Water trigger pushed 1200m → 4500m** so the established Ice arc plays out FIRST. Order is now: 600m first-meet (Ice joins) → 2000m mike-tells-off (Ice leaves) → 3800m ice-returns (Ice rejoins trailing) → 4500m before-water (Ice asks the North Pole question, Mike snaps, Mike floats off alone). The water cutscene now serves as the narrative resolution where Mike finally escapes Ice into the storm. Subsequent water segments still every 3500m, no cutscene.
- **Mike-on-mattress sprite white-square fix.** Source Gemini sheet had solid white background (alpha=255 everywhere), so the sprite drew a white box around Mike. Updated `extract-water-hurricane.py` with a new `flood_remove_corner_color()` helper that flood-fills white from the sheet corners + each cell corner, removing only the EDGE-CONNECTED white. The mattress's interior white cushion is preserved (not connected to the edge), the surrounding box is gone. All 12 mattress sprites re-extracted.
- **Pause-during-water bug fixed.** Pausing mid-water made Mike teleport back to the street on resume. Cause: `state.water.startedAt` is a wall-clock `performance.now()` timestamp; while paused, wall-clock kept advancing while `startedAt` stayed put → on resume `tickWater` saw `elapsed > WATER_TOTAL_MS` and immediately exited the phase. Fix: extended `shiftEffectTimers(delta)` to also advance `state.water.startedAt`, `nextLightningAt`, `lightningUntil`, plus per-cross-car `spawnedAt` + `swerveStartedAt`. Same pattern as the existing pause-aware shift for ham/weed/horse timers.

### Run v0.18.35 — 2026-04-27

Patch — wire up the water/rain/thunder audio that just dropped into `/run/audio/`.

- **AUDIO_DEFS updated** to point at the actual filenames on disk (`ocean_sound.mp3`, `rain_sound.mp3`, `thunder-clap.mp3`, `dry_thunder.mp3`, `loud_thunder.mp3`) instead of the placeholder names from v0.18.34.
- **3-thunder variant pool** — `THUNDER_VARIANTS = ['thunder-clap', 'thunder-dry', 'thunder-loud']`. Each lightning flash picks one at random so back-to-back claps don't repeat the same sample. Same trigger frame as the visual flash, so audio + bright pulse hit simultaneously (perceived simultaneity is correct for a hurricane right on top of Mike — distance-delay would only matter if the storm were far away).
- **Clean audio shutoff** on every exit path: water phase end, `quitToTitle`, AND `endRun` (in case Mike dies mid-water). All three call `stopLoop('water-loop')` + `stopLoop('rain-loop')` + a loop over `THUNDER_VARIANTS` to kill any in-flight one-shots. Prevents storm audio bleeding onto the title or game-over screens.
- Cars + people automatically resume on transition back to street — already handled by the `!inWater` spawn gate cleared the moment the phase flips back to `'none'`.

### Run v0.18.34 — 2026-04-27

Major — **HURRICANE / WATER SEGMENT**. Periodically the road ends at a cliff and Mike gets washed onto the open sea on a mattress raft for ~15 seconds. Storm overlay (lightning + rain), audio swap (mob ambient → water + rain loops), no street obstacles or pickups during the segment.

**Asset pipeline:**

- New `extract-water-hurricane.py` script:
  - Copies the 4 source water road tiles (`1roadwater.png`, `2aroadwater.png`, `2broadwater.png`, `3roadwater.png` from `/run/concept/`) into `/run/img/bg/` as `bg-water-enter.png`, `bg-water-tile-a.png`, `bg-water-tile-b.png`, `bg-water-exit.png`.
  - Slices the Gemini-generated mattress sprite sheet (3×4 grid, alpha-clean) into 12 individual `mike-mattress-XX.png` files via the same connected-component blob filter the budgie + cop-overhead extractors use.

**Trigger flow:**

- First water segment fires at ~1200m. If Ice is currently with Mike, a NEW `before-water` cutscene plays first:
  - **ICE:** *"Mike, you ever been to the North Pole?"*
  - **MIKE:** *"The fuck? You think because I'm short I be out there like some ham ass elf wrapping Christmas presents?"*
  - On complete: Ice splits + water phase begins.
- If Ice already gone (e.g., player did the `mike-tells-off` arc instead), water phase fires directly without cutscene.
- Subsequent water segments trigger every ~3500m thereafter, no cutscene.
- The `before-water` cutscene is `manualOnly: true` so the standard distance-loop in `maybeTriggerCutscene` skips it — only the water trigger logic can fire it.

**Phase machine** (~15s total):

| Phase | Duration | What happens |
|---|---|---|
| `entering` | 2.5s | `bg-water-enter` (cliff edge) scrolls UP past Mike. Already on mattress sprite. Storm overlay active. |
| `water` | 10s | Pure sea — `bg-water-tile-a` and `bg-water-tile-b` ALTERNATE in the vertical scroll loop, faking animated waves. Lightning + rain at full intensity. |
| `exiting` | 2.5s | `bg-water-exit` (boat ramp) scrolls UP, returning to street. Storm clears at end. |

**Storm effects:**

- **Rain:** 220 drops constantly recycling. Random Y velocity (14-28 px/frame) for parallax depth fake; horizontal drift = -0.18× vy for hurricane-wind slant. Drawn as slanted line streaks at low opacity.
- **Lightning:** white-screen flashes on a randomized cadence (avg 1.7s ± 1.1s jitter). Each flash is a 110ms stuttering bright/dim alternation for that real-lightning feel. Triggers `playSfx('thunder')` (no-op if asset not yet loaded).
- **Storm tint:** subtle blue-grey full-screen fill so the segment reads as overcast even between flashes.

**Spawn suppression:** while `state.water.phase !== 'none'`, the obstacle / pickup / cross-car / fauna spawn blocks all gate to `!inWater`. Existing arrays are also CLEARED at phase start so leftover NPCs don't keep scrolling across the sea. Naturally re-populates after the exit transition.

**Mike's sprite:** `drawPlayer` swaps to `mike-mattress-XX` (12 frames cycling at 280ms each) for the entire phase, with a sine-wave Y-bob (~6px) for the rocking-on-waves feel. Renders at 1.4× normal Mike height since the sprite includes the mattress underneath.

**Audio:** new `AUDIO_DEFS` entries `water-loop` (looped wave bed), `rain-loop` (looped rain), and `thunder` (one-shot per flash). Files don't exist yet — the audio system silently no-ops on missing files, so this segment plays in (visual-only) silence until you drop MP3s into `/run/audio/`. Mob ambient stops on phase entry, resumes on phase exit.

### Run v0.18.33 — 2026-04-27

Polish — background fauna walking the sidewalks. Pigeons, cats, dogs, and goats now appear ambient on the 7%-margin sidewalk strips outside the 5 driving lanes. Pure visual layer — no collision, no gameplay impact.

- New `FAUNA_TYPES` config drives spawn weights + sizing + frame counts:
  - **Pigeons** — 6% viewH, weight 4 (most common), 12 sprite variants
  - **Cats** — 9% viewH, weight 3, 16 variants
  - **Dogs** — 10% viewH, weight 3, 16 variants
  - **Goats** — 11% viewH, weight 1 (rare flavor), 16 variants
- Spawn cadence: random in 2.2-5.5 sec range so the street feels populated without becoming a parade. Random side (L or R sidewalk), random sprite from the species' frame pool, random sin-wave bob phase per spawn so multiple creatures don't bob in lockstep.
- Scroll up with the world at the same `effSpeed` as obstacles; cull off-screen at top.
- Each renders with a small Y-bob (3-5px amplitude) for "alive" feel — most species' sprite frames are visual variants not true walk cycles, so the bob is what sells motion.
- Drawn AFTER the road but BEFORE obstacles in the depth pass — set-dressing layer that vehicles can occlude when overlapping.
- Sprites preloaded driven by `FAUNA_TYPES` config (no path-list duplication).

### Run v0.18.32 — 2026-04-26

Patch — cross-traffic cop car gets a feint-swerve telegraph + jump avoidance + much rarer spawns. Per playtest: was too frequent and too unforgiving, with no way to read the threat before it hit.

- **Spawn rate halved.** `CROSS_CAR_SPAWN_MS_FAR`: 9s → **18s** (one every 18s at 1500m). `CROSS_CAR_SPAWN_MS_NEAR`: 3.5s → **8s** (one every 8s at peak intensity). `CROSS_CAR_RAMP_M`: 3000m → **4000m** (gentler ramp). Speed dialed back from 1100 → **950 px/sec** so the swerve has time to read.
- **Mike can JUMP over them.** Same affordance as the parked cop car (`jumpOnly`). Collision check now calls `isAirborne(now)` and marks the car as resolved without damage if Mike's mid-jump. Encourages active dodging instead of just lane-shifting.
- **Feint-swerve telegraph.** When the car's X gets within `CROSS_CAR_SWERVE_TRIGGER_PX` (520px) of Mike's lane center, it triggers a one-shot 700ms swerve: Y deviates AWAY from Mike's foot line for the first half (max amplitude `0.07 × viewH`), then swerves BACK to baseY for the second half. Uses `sin(phase × π)` envelope for a smooth out-then-back curve. Direction of swerve picked dynamically based on which side of `baseY` Mike is on. Player gets a clear "is it coming or not?" beat — sees the car appear to dodge, then has to react when it commits to the collision path.
- Stored `baseY` per-car so the swerve oscillates around the original spawn line, not the mutated current Y.
- **Last-life mercy:** when `state.lives <= 1`, all cross cars move at **0.70× speed** so the player gets ~30% more reaction time on the most-stressful run state. Reads as the city giving Mike a break on his last leg.

### Run v0.18.31 — 2026-04-26

Two fixes + the long-queued PNG share feature.

- **Cross-traffic cop car aspect ratio fixed.** The v0.18.30 first cut was rendering the rotated car at literal `(cc.h, cc.w)` dimensions, which gave a 0.97× scale on one axis and 0.28× on the other — squashing the source 185×342 sprite into something close to a square. New math computes a single `s = cc.h / img.height` scale and applies it to both `rw = img.width * s` and `rh = img.height * s`, preserving native aspect ratio. Same fix propagated to spawn-startX, off-screen cull, and collision hitbox math (all of which were using `cc.w` where they should use `cc.h` post-rotation).
- **NEW SHARE PNG button on game-over screen.** Generates a 1080×1080 image at click: title-card art as cover-fit background with vignette gradient, "On Baby!" cursive title at top, semi-opaque score panel mid-frame showing total score in big gold + 3-column distance/coins/multiplier breakdown, streamer credit at the bottom (handle + colored platform icon, only shown if the player submitted this session — `RunnerLeaderboard.lastSubmittedIdentity` stashed on submit success), URL caption for branding. Triggers download via temporary `<a download>` link with filename `onbaby-run-{distance}m.png`. Pure offscreen canvas; no taint since all assets are same-origin. Sits below the action buttons in a new `.gameover-share` block with a green-on-dark style + status hint line below ("Saved as ..." or error message).

### Run v0.18.30 — 2026-04-26

Heavy patch — 7 things from playtest stream:

- **NPC + cop-car shadow cleanup.** Added a per-obstacle-type `bottomCropFrac` field that trims the bottom N% of each sprite at render time (same trick Ice already uses). Static protesters get 12% (their grey-brown shadow ellipse was the most visible), pedestrian walkers + chibis get 5-6%, cop cars get 12% to also kill the residual motion blur. New `drawAtCropped()` helper does the source-rect math.
- **NEW cross-traffic cop car obstacle.** Spawns from off-screen left or right at distances ≥ 1500m, drives across the road perpendicular to Mike's lane direction at ~1100 px/sec. Uses the new overhead-view sprite (extracted via `extract-cop-overhead.py` from `cop_car_transparent.png`, sliced into 16 frames with the same connected-component blob filter as the budgie). Sprite rotated 90° based on travel direction; light bar cycles R/B/R/B at fast cadence (110ms). Spawn rate ramps from one car every ~9s at 1500m → one every ~3.5s at 4500m+ for the difficulty curve. Box-vs-box collision; on hit costs a life (same as a regular cop car). Reads as cross-traffic Mike has to time his lane around.
- **Ice trail offset flipped.** Previous v0.18.28 put trailing Ice BELOW Mike on screen (after his "lemme grab that dick" cutscene); per playtest the perspective reads better with him ABOVE, so the offset sign flipped from +12vh to -12vh. Render order in `drawWorld` also adjusted: when trailing, Ice draws BEFORE Mike so Mike correctly occludes him as the foreground figure.
- **Ice run-cycle flicker fixed.** Ice was visibly jumping in height every animation tick because `h = img.height * pxPerSrc` used the CURRENT frame's height (ice-14 + ice-16 differ slightly in source dimensions). Now the height is locked to the reference frame's dimensions during the run cycle; only neck-stretch frames (ice-23..29) keep the per-frame height so the stretch animation still actually stretches.
- **Audio hint shortened** "No sound? Tap ⚙ to unmute" → "Tap ⚙ to unmute" — the prefix was wider than the actual call-to-action.
- **Today's runs counter** added under "Total Runs" on the title screen. New `/stats/attemptsByDay/{YYYY-MM-DD}` Firebase node, incremented in parallel with the global counter via `runTransaction` (UTC date so the rollover happens at the same instant for all players). `fetchTitleStats` returns `attemptsToday` alongside total, rendered as "+X today" subtitle on the Total Runs block.
- **16 new `cop-overhead-XX.png` sprites** ready for any future use of the top-down cop car (cross-traffic obstacle is the first; could also use for parked cars in the background later).

### Run v0.18.29 — 2026-04-26

Fix — title-screen stats were showing "—" for everything. Two root causes:

- **Module-script timing race.** `leaderboard.js` loads as `<script type="module">` (deferred). `index.js` (regular script) often finishes its `loadAll()` promise before the module finishes parsing, so `window.RunnerLeaderboard` was undefined when `refreshTitleStats()` first ran. Added a polling retry (up to 20 attempts at 150ms each, ~3s total) so the stats appear as soon as the module is ready instead of silently giving up. Also distinguishes `0` from `—` in the rendered output so a successful fetch returning empty is visible.
- **Firebase rules likely block writes to the new `/stats/attempts` path.** The project was set up with `/scores` whitelisted but `/stats` falls under the default-deny. Added a fallback in `fetchTitleStats`: if the `/stats/attempts` read fails OR returns 0 while there ARE submitted scores, count `/scores` entries as the attempts floor. Also split the previous `Promise.all` into two independent reads so a permissions error on one doesn't kill the other.
- Added detailed `console.log` output so you can see exactly where the chain breaks if stats still don't show.

To enable the proper attempts counter (instead of falling back to score count), add this to the Firebase Realtime Database rules:

```json
"stats": { ".read": true, ".write": true }
```

### Run v0.18.28 — 2026-04-26

Patch — Ice trails Mike after the "lemme grab that dick" cutscene + leaderboard 2-column top-10.

- **Returning Ice now CHASES Mike from behind** instead of running side-by-side. After the `ice-returns` cutscene fires (~3800m), `state.iceTrailing` flips true and `drawIce` switches to a different positioning mode: same lane as Mike (so it reads as an active pursuer locked onto him), positioned ~12vh further down the road (higher screen Y = closer to camera = visually IN FRONT of Mike, which sells the "trailing him" perspective in a top-down runner). Slight 0.85× scale-down for the "further away" perspective. Forces lastSide to +1 so trailing Ice always faces forward without mirror-flipping. Side-kick mode still applies during the original join → tells-off arc; trailing only kicks in after the second cutscene. Reset on `startRun`.
- **Leaderboard expanded to 2 columns showing top 10** (5 per column). Was top-100 in a single tall column that needed scrolling. New CSS grid: `grid-template-columns: 1fr 1fr` with a 1080px max-width container. Mobile (≤720px) collapses back to single column.

### Run v0.18.27 — 2026-04-26

Patch — three things from playtest stream:

- **Cutscene bird now flies off-screen + returns from the opposite side**, mirroring the title-screen behavior. Previous behavior was "fly to upper-right of frame, hover, return same direction." New 5-phase loop: `perch (5.5s) → takeoff (350ms in place) → flyout (1.5s, +1100% transform off the right edge) → offscreen (800ms, visibility hidden + teleport to -1100% on the left) → flyin (1.7s, transform back to base)`. Teleport phase disables CSS transition + force-flushes layout so the bird doesn't visibly slide across the screen during the off-screen pause.
- **Leaderboard rows show platform icons instead of "kick.com/" / "twitch.tv/" prefixes.** Saves horizontal space + visually clearer at a glance. Inline SVG (Kick = green square with K, Twitch = purple speech bubble) so there's no extra asset to ship and they stay crisp at any size. URL still resolves correctly when clicked + appears in the tooltip.
- **Title screen now shows global stats** — total runs (atomic Firebase counter incremented on every `startRun` via `runTransaction`) + current high score WITH the streamer who holds it (queried from the same `/scores` collection the leaderboard uses, top 1). Refreshes on boot AND on quit-to-title so the numbers update after a successful submit. Two side-by-side blocks below the START / LEADERBOARD buttons in their own backing card.

### Run v0.18.26 — 2026-04-26

Heavy patch — 6 things from playtest stream:

- **Horse pickup is just a horse now (no rider).** Was using `mike-horse-05.png` which already showed Mike riding it — broke the "before pickup" fiction. New `extract-horse-pickup.py` chroma-keys the standalone `horse_neon.png` source (neon-green bg, target rgb 7/223/33 with 100 tolerance) into `horse-pickup.png`. The `horse-icon` sprite mapping now points at the standalone version.
- **Mike + Ice on horse rendered 70% bigger.** v0.18.24 bumped the horse PICKUP from 9% to 22% of viewport height, but the in-game ride sprite kept the old `PLAYER_TARGET_HEIGHT_FRAC * 1.4` multiplier — meaning the "after pickup" horse was suddenly tinier than the pickup. Bumped to `* 2.4` so the horse part of the ride sprite reads at roughly the same visual height as the pickup horse before mounting.
- **Pickup guide uses real game sprites instead of emojis.** Both the settings panel and pause overlay versions now show `<img>` thumbnails of the actual `cx-coin-01`, `ham-spin-01`, `h400-spin-01`, `weed-spin-01`, `horse-pickup`, `npc-pedestrian-09` (phone thief), `cop-car-01`, `npc-pedestrian-01`, `ice-15` sprites. Player can match what they see in the HUD to what's in the guide. Icon column widened from 28px → 44px to fit horizontal sprites (cop car) cleanly.
- **Death sprite renders on the road too.** The random Mike-death pose picked at `endRun` is now drawn at Mike's last position via `drawPlayer` (sized at 1.4× normal Mike-height for dramatic clarity), not just on the gameover overlay panel. So the cause-of-death visually matches between the road view AND the panel above. New `state.gameOverDeathKey` carries the picked sprite key across both renderers.
- **Ham bonus spawns way more coins.** Was ~1.6 coins per obstacle spawn (1 guaranteed + 60% extra). Now during the bonus window, every spawn spawns the obstacle-lane coin PLUS 3-5 extra coins spread across random lanes — so the "shower" actually feels like a shower instead of a slightly-better-than-normal coin run. Bumps total coins-per-spawn from ~1.6 to ~4.5 during ham bonus.
- **Stoned debuff now actually noticeable.** World scroll multiplier bumped from `0.55` (45% slowdown) to `0.38` (62% slowdown). Mike's run-cycle frame rate also slows: default 80ms/frame → 200ms/frame (2.5× slower) while weed timer is active. So his legs visibly drag in sync with the world crawl, instead of him cartoon-running at full pace through molasses.

### Run v0.18.25 — 2026-04-26

Patch — three fixes from playtest.

- **Cop cars actually flash R/B/R/B now.** v0.18.23's frame-cycle attempt picked `[01, 02, 05, 09]` which was the wrong sample — direct pixel sampling of the extracted sprites' light bars showed odd-numbered frames (01,03,05...) are RED-dominant and even-numbered (02,04,06...) are BLUE-dominant. Old cycle was therefore RED-BLUE-RED-RED — visibly mostly red with one blue flash. Fixed cycle `[01, 02, 03, 04]` at 180ms/frame gives clean R-B-R-B alternation.
- **Death-pose sprite on the game-over screen.** New 12-pose sprite sheet sliced via `extract-death-sprites.py` (sniped, electrocuted, on-fire, frozen, knocked-out, stars, unconscious, anvil, drowned, R.I.P. tombstone, two bullet variants). One is picked at random and swapped into the game-over overlay's `<img>` element on `endRun`. Sized at 22vh with a drop-shadow + scale-in animation so the death pose lands with some weight before the score reads.
- **Title-screen text panel** so the title + intro paragraph stay legible against the lighter overlay (introduced in v0.18.23 to let the title art show through). The `h1` and intro `<p>` both get a semi-opaque purple-tinted backing card with a subtle border + drop-shadow. The title art still shows through around the cards.

### Run v0.18.24 — 2026-04-26

Patch — horse pickup sized properly + pause now actually pauses item effects.

- **Horse pickup is no longer a tiny floating icon.** It was rendering at the standard `PICKUP_TARGET_HEIGHT_FRAC: 0.09` (9% of viewport height) which fit the ham/weed/400 collectibles but read as a thumbnail next to a real animal. Added a per-type `heightFracOverride` field on `PICKUP_TYPES`; horse uses `0.22` (22% of viewport height) so it renders at roughly Mike's full standing height when sitting on the sidewalk. The other pickups keep the smaller default.
- **Pause now actually pauses active item effects.** Reported in playtest: pausing during a horse boost lost the horse on resume. Cause: every effect timer (`hamFreezeUntil`, `hamBonusUntil`, `weedDebuffUntil`, `horseBoostUntil`, `controlsReversedUntil`, `invulnUntil`, `textShownUntil`, etc.) is stored as an absolute `performance.now()` wall-clock timestamp. While paused, the wall-clock kept advancing → the timestamps silently expired in the gap. Fix: `setPaused()` records `pauseStartedAt` on the way in and on resume calls a new `shiftEffectTimers(delta)` that advances every wall-clock expiry forward by the pause duration. Also shifts player jump timing, Ice neck-stretch, and coin-particle spawn times so animation state stays consistent across the pause too.

### Run v0.18.23 — 2026-04-26

Heavy patch — one ship covering eight playtest items:

- **In-game user guide** — new "Pickups & Friends" section in BOTH the settings (gear) panel and the pause overlay. Lists Cx coins, Ham, +1 Life (400), Weed, Horse, Phone Thief, Cop Car, Pedestrians, AND a paragraph explaining what Ice Poseidon does as a side-kick (auto-grabs nearby coins, 0.5× bonus per grab, with the multi-stage join/leave/return arc). Same template duplicated in both places — JetBrains-styled gold icons + descriptions.
- **Cutscene keyboard navigation** — `ArrowUp` / `W` / `ArrowDown` / `S` move the highlight between choice buttons, `Enter` or `Space` activates the highlighted choice. First button gets auto-selected when buttons appear. Selected button shows a `▶` prefix + purple glow.
- **Game-over music stops on RUN AGAIN** — the death-sting + game-over music kept playing on top of the new bg music for ~3 seconds when the player tapped RUN AGAIN before the sting finished. Added explicit `stopLoop('death')` + `stopLoop('death-gameover')` to `startRun()` so the slate is clean.
- **Static pedestrians + protesters now bob** — the chibi NPCs and protesters all had `bobPx: 0` so they read as cardboard cutouts on the road. Bumped to 10/12 — the existing sin-wave bob now gives them a subtle step-in-place animation that suggests motion even with single-frame sprites.
- **Cop car flashing-lights animation** — was picking ONE static frame at spawn (cop-car-01 OR -02 OR -05 OR -09) and holding it forever. Most spawned cars looked like the lights were OFF. Now ALL cop cars cycle through all 4 frames at 140ms/frame for the alternating red/blue flashing-lights effect. Real cop-car overhaul (clean re-extract, overhead variant, side-spawn obstacle) still queued for v0.18.24.
- **Middle mouse button = jump** — parity with `Space` / `ArrowUp` / `W`. Suppresses the browser's middle-click auto-scroll cursor while playing.
- **Title-screen bird now flies completely off-screen** — instead of the previous "fly to upper-right + come back same direction" loop, the bird now exits frame to the right, pauses off-screen for 900ms, then re-enters from the LEFT side and flies back across to Mike's shoulder. Off-screen targets expressed in image-WIDTH fractions (`+1.0` right edge, `-0.4` left edge) so they actually clear the rendered image regardless of viewport. Render skips entirely during the offscreen-pause phase.
- **Cutscene bird now perches on the dialogue box edge** instead of pinning to Mike's shoulder — the shoulder position was finicky across panel angles (kept landing on his stomach or in midair). Box edge is the same position for both speaker views and reads like a parrot perched on a railing, fixed at `(8%, 63%)` of the cutscene canvas.
- **Title-screen overlay made lighter** (alpha .82 → .42) so the title art (Mike + Ice + chile skyline + the budgie) shows through more clearly. Other overlays (pause / gameover / cutscene) keep the heavier .82 alpha for legibility against busy gameplay.

### Run v0.18.22 — 2026-04-26

Patch — budgie position tuning per playtest.

- **Cutscene bird is now panel-aware.** The two cutscene angles place Mike's shoulder at very different heights and the v0.18.20 single-position fix landed the bird on his stomach during the "Listen, you pissing me off" panel. New `applyCutsceneBirdAnchor(panel)` function runs on every panel transition and switches the bird's `left`/`top`/`width` based on `bgPrefix`:
  - **Ice panels** (`cutscene-`) — Mike facing AWAY, only upper back/durag visible: `left: 18%, top: 38%, width: 9%` (unchanged from v0.18.20).
  - **Mike panels** (`cutscene-mike-`) — Mike facing US, full upper body visible: `left: 24%, top: 22%, width: 11%` (much higher, slightly bigger).
  Also clears any in-flight `transform` on panel change so a half-flown bird from one panel doesn't carry a stale offset into the next.
- **Title-screen bird bumped much larger + raised.** Was `(x:14%, y:68%)` at 6% size which read as a tiny dot floating below Mike's torso. Now `(x:16%, y:50%)` at 11% size — sits near the chain/collar level at a scale that actually reads as a bird perched on a person's shoulder.

### Run v0.18.21 — 2026-04-26

Patch — title-screen shoulder budgie. The same yellow-green parakeet now perches on Mike's shoulder on the title screen too, with the same 5-phase loop (perch → takeoff → fly → hover → return). Different render path though: the title is drawn to the canvas (not DOM) so the bird is rendered via `ctx.drawImage` inside `drawTitleScreen`, with position calculated in the same coordinate space as the title image (cover-fit aware — anchor + flight target are in *image* fractions, not canvas fractions, so they track Mike's shoulder regardless of viewport aspect).

Anchor on the source `titlescreen.jpg`: `(x: 14%, y: 68%)` of the image, with bird height = 6% of image height. Flight target offsets are also fractional (`+30%` X, `-32%` Y of image height) with small per-loop random jitter. Smooth-step (`easeInOut`) interpolation between transition keyframes — JS computes the X/Y per frame and draws on top.

Same sprite atlas as v0.18.20 (`budgie-01..16.png`) — the preload was extended to include all 16 frames so both the cutscene DOM overlay AND the canvas-rendered title bird can pick frames without flicker. State is its own `titleBird` object, separate from the cutscene `bird` state, so they don't fight.

### Run v0.18.20 — 2026-04-26

Minor — animated shoulder budgie during cutscenes. A yellow-green parakeet now perches on Mike's left shoulder during every cutscene, takes off every ~5.5 seconds for a small flight loop, and lands back on the shoulder. Pure DOM/CSS animation layered on top of the cutscene art — no canvas, no perf hit.

**Source art:** ChatGPT-generated 4×4 sprite sheet (`/run/concept/ChatGPT Image Apr 26, 2026, 10_13_13 PM.png`) — row 1 is the wing-flap cycle (4 frames), rows 2-4 are perched poses with different head positions. New `extract-budgie-sprites.py` slices it into 16 individual PNGs (`budgie-01.png` through `budgie-16.png` in `/run/img/sprites/`). Background was already alpha=0 in the source; the script also runs a connected-component filter that keeps only the largest blob per cell so legs/feet bleeding from adjacent rows get erased.

**Layout:** the cutscene `<img>` was wrapped in a new `.cutscene-canvas` div with `aspect-ratio: 3/2; max-width: 100%; max-height: 100%` — same letterbox behavior as the old `object-fit: contain` but provides a stable coordinate frame for the bird. The bird is positioned at `left: 18%; top: 38%; width: 9%` of the canvas, calibrated to Mike's shoulder in the cutscene art. Tracks correctly across all viewport sizes since the canvas matches the image's native aspect.

**Animation state machine** (5 phases):

| Phase | Duration | Frames | What it does |
|---|---|---|---|
| `perch` | 5.5s | budgie-13/14/16 | Slow head-bob cycle on shoulder |
| `takeoff` | 350ms | budgie-01..04 (90ms/frame) | Wing flap before launch |
| `flying` | 1.6s | budgie-01..04 | CSS transform translates to upper-right of frame |
| `hover` | 600ms | budgie-01..04 | Brief pause at far point |
| `return` | 1.4s | budgie-01..04 | Transform back to shoulder |

Then loops. Random jitter on the flight target (X +0..+80%, Y -120..-200%) so each takeoff varies slightly. CSS `transition: transform` does the smooth pathing — JS just toggles target transforms + a `.flying` modifier class for slower easing on the launch leg.

State is reset on every `startCutscene` so a freshly-triggered scene doesn't inherit a half-flown bird from the previous one.

### Run v0.18.19 — 2026-04-26

Minor — phone-thief mechanic. The "reaching dude" pedestrian (`npc-pedestrian-09..12`, the 4-frame reach pose) is now a *phone thief* — when he collides with Mike he doesn't take a life, he snatches the selfie stick. Cost = 10 Cx coins + 3 seconds of inverted left/right input. Stuns the player without ending the run.

**On contact:**

- **Drains 10 coins** from the stash (clamped at 0). Multiplier is recomputed on the spot — a player at ×3 who gets snatched down below 16 drops back to ×2 or ×1 immediately.
- **3-second left/right inversion** via a new `state.effects.controlsReversedUntil` timer checked inside `shiftLane()`. Stacking — getting snatched again while reversed extends the timer instead of resetting it (consistent with ham/weed/horse).
- **Coin particle burst** — one `cx-coin-XX` sprite per coin lost, sprayed radially upward from Mike's chest with random outward velocity + gravity. Each spins through the 8 coin frames with a randomized phase offset and fades out over ~1.1-1.5s. Cleared on game restart.
- **Red `SNATCHED -10 Cx` overlay text** (reuses the pickup-text overlay system, shorter duration).
- **`punch-phone-snatch.mp3` SFX** plays on the snatch.
- Standard 1.2s i-frames so overlapping NPCs can't snatch you 3× in a frame.

**Visual feedback for the input flip:**

- New HUD effect badge `🔄 Xs` with a pink pulse animation showing the remaining inversion time.
- Pink-magenta screen tint + countdown bar at the top of the canvas — same pattern the WEED debuff uses but in a different color so it's distinct.

**Why "input chaos" was the right cost choice over alternatives:**

Tested mentally against the alternatives — losing a life felt too brutal for an obstacle that already exists in heavy rotation; losing only the multiplier was too cheap (player was barely affected); pure input lockout was boring (just felt like a pause). Input inversion forces the player to actively counter-think during a panic state, which both punishes the snatch and creates emergent moments where the inversion makes them dodge INTO another obstacle — chained chaos that ends a run organically. The 3s window is short enough that recovery is reasonable.

### Trending v0.1.7 — 2026-04-26

Patch — bot filter. Kick chat is full of bots (BotRix, StreamElements, Nightbot, Fossabot, Sery_Bot, Wizebot, Moobot, Streamlabs, etc.) that post command responses, raid alerts, follow notifications, and rule reminders — all of which would otherwise inflate word counts and crowd the cloud with bot vocabulary instead of real chatter. Now their messages get dropped *entirely* before tokenization so they don't count toward `totalMessages` or `unique users` either.

Two-layer match:

1. **Explicit allowlist** of ~25 known Kick bot usernames (case-insensitive exact match). Easy to maintain — add a new bot to the `BOT_USERNAMES` Set as you find them.
2. **Regex catch-all** for usernames ending in `bot` (with separator) — matches `FooBot`, `bar_bot`, `RaidBot_v2` without enumerating each. Tightened to *suffix* match so legit users like `Bottlejack` don't get caught.

A dropped-bot counter (`stats.botMessagesFiltered`) is incremented but not yet shown in the UI; can surface it in the footer or tooltip if you want visibility into how much bot traffic is being filtered.

### Trending v0.1.6 — 2026-04-26

Fix — leaderboard tooltips were invisible. The v0.1.4/v0.1.5 tooltips used `position: absolute` inside each `.lb-row`, but the parent `.lb-list` has `overflow: hidden` (kept that way so long word lists don't break the layout). The tooltips were rendered to the LEFT of the row with `right: calc(100% + 12px)` — which put them outside the leaderboard's box, where overflow:hidden silently clipped them away. The CSS was right, the math was right, the tooltip was just off-screen.

Refactored to a single shared `#lbTooltip` element appended to `<body>` with `position: fixed`. JavaScript event delegation on `#lbList` populates the tooltip's HTML on hover (looking up the row's data via a `lbCurrent` array indexed by `data-idx`) and positions it to the left of the hovered cell using `getBoundingClientRect`. If positioning to the left would clip off-viewport, it flips to the right side. Hides on scroll inside the leaderboard so it doesn't visually detach.

Same two tooltips as v0.1.5 — hover the WORD for the source breakdown, hover the `Nu · Mx` meta for the user list — but now actually visible.

### Trending v0.1.5 — 2026-04-26

Patch — second per-row tooltip on the `Nu · Mx` meta cell. Now there are TWO tooltips per leaderboard row:

- **Hover the WORD** → "Last said in <Streamer> · breakdown by chat" (unchanged from v0.1.4)
- **Hover the `Nu · Mx` meta** → list of the actual usernames who said the word, sorted by per-user mention count, capped at 10 visible with "+N more…" if there are extras.

Required threading sender display name through the chat handler → `processMessage` → `WordWindow.add` so each entry stores `{ts, uid, src, name}`. `topN()` now also returns `userList: [{name, count}]` per word. Username is taken from `payload.sender.username` first (most readable), then `slug`, then numeric `id` as last resort. The tooltip renders `username 5x` rows, same visual style as the source-breakdown tooltip but anchored to the meta cell instead.

### Trending v0.1.4 — 2026-04-26

Patch — per-word source attribution + visible live-poll cadence.

- **Hover any word in TOP 12 → tooltip pops to its left** showing two things: (1) which streamer's chat the word was MOST RECENTLY said in, and (2) a per-source breakdown of mention counts across all currently-live chats (top 6 sources, sorted desc by count). `WordWindow` now stores `{ts, uid, src}` triples per occurrence instead of just `{ts, uid}`, and `topN()` computes `lastSrc` + `srcCounts` for each top word. Channel name (e.g. `chatrooms.123456.v2`) is reverse-mapped back to a slug via a new `channelToSlug` map maintained alongside `slugToChatroom` in the subscribe/unsubscribe path.
- **Live-status poll cadence surfaced in the UI.** Two places now show how often the page re-checks Kick to discover who's live: (1) the bottom-left footer status now reads `N live · M chats connected · next check Xs`, and (2) under the LIVE SOURCES heading on the right sidebar a small line says `checked Ns ago · next in Ms`. The cadence itself (`ROSTER_POLL_MS = 90s`) is unchanged, just made visible. Helps the operator know when a streamer who just came online will appear in the source list (worst case ~90s after they go live, plus however long Kick's `livestream` API takes to flip).

### Trending v0.1.3 — 2026-04-26

Patch — hover tooltip on the bottom-right pipeline metrics. The footer line `N events · M chat · K msgs · L unique users` is the most diagnostic info on the page (it tells you exactly which stage of the chat-ingestion pipeline is healthy or stuck), but the labels are terse. Hovering the line now pops a styled tooltip with a definition for each metric + a footnote explaining how to read them as a "if the stat to the right stops climbing, that's where the break is" cascade. A small `?` icon appears next to the line so the affordance is discoverable. Cursor flips to `cursor: help` on hover.

### Trending v0.1.2 — 2026-04-26

Patch — visible source list + clearer "users" label.

- **"Live Sources" sidebar panel** above TOP 12 lists every streamer chat we're currently subscribed to, with the kick-green dot indicating live status. Pulls display names from `streamers.json` (e.g. "MikeSmallsJr") rather than the raw lowercase slug. Auto-updates every render tick as streamers go live or drop offline. Lets the operator see at a glance whose words are feeding the cloud right now, without having to inspect the WS or guess from the leaderboard.
- **Footer label "speakers" → "unique users"** — same metric (count of distinct `userId`s seen across all live chats since page load) but with a less ambiguous label. The previous "speakers" reading was getting questioned in playtest because it wasn't clear whether it meant streamers or chatters. "Users" is unambiguous.

### Trending v0.1.1 — 2026-04-26

Patch — Pusher key cycling + visible semver. Initial v0.1.0 release used a single Kick Pusher key (`eb1d5f283081a78b932c`) which Pusher rejected with code 4001 ("App key not in this cluster"). Kick rotates keys; the current one as of 2025 is `32cbd69e4b950bf97679`. The in-page debug overlay added in the previous patch surfaced the exact rejection message, which made the diagnosis trivial.

- **PUSHER_KEYS array** instead of single key. Try the new key first, fall back to the historical one on rejection. Same approach kekwclips uses (cross-referenced from `itsavibecode/kekw/index.html`).
- **`_rotateKey()`** in PusherClient advances the key index + force-closes the WS so the reconnect path picks up the new key. Triggered automatically by Pusher error code 4001 (key/cluster mismatch) or 4006 (unknown app).
- **Visible version pill** in the footer next to the URL caption — mirrors the convention used by Run + Slots so it's instantly obvious which build is loaded. Also bumped the document title and added a `<meta name="version">` tag for parity.

This is also a new subproject scope — going forward `Trending v0.X.Y` is its own independent SemVer track alongside Site / Slots / Run.

### Run v0.18.18 — 2026-04-26

Patch — pickup stacking + cut scene cadence + Ice cutscene chroma-key.

- **Ham + weed (+ horse) durations now stack.** Previously, picking up a second ham (or weed, or horse) while the first was still active would *reset* the timer to a fresh duration — which felt wrong both narratively (eating two hams should reward you more than eating one) and mechanically (greedy weed-grabs felt like they were getting a discount). Now: if the effect is already running, the new pickup *extends* the existing window by the full duration. Visual feedback shows `HAM +` / `STONED +` instead of `HAM!` / `STONED` on stack so the player can tell. Ham specifically also skips the freeze + chipmunk-music re-trigger when stacking, so back-to-back hams flow smoothly instead of locking the screen twice.
- **Cut scene distances pushed out further.** The first one (`first-meet`) was firing at 250 m, which felt jarring — barely past the title screen. Bumped to:
  - **First Meet:** 250 → **600 m** (lets the player learn the controls + survive a few obstacles before being interrupted)
  - **Mike Tells Off:** 1000 → **2000 m** (~1400 m of Ice-as-sidekick gameplay between meeting and falling-out)
  - **Ice Returns:** 2000 → **3800 m** (~1800 m of solo running before the parasite reappears)
- **Ice cutscene panels now chroma-key over the chile background** — same treatment Mike's panels got in v0.18.13. The original Ice art used a solid blue background that was too close in color to Ice's blue shirt to algorithmically separate (we tried and gave up in v0.18.12). New art was generated with a neon-green chroma-key background instead, which extracts cleanly. New `extract-ice-cutscene.py` script in `.github/scripts/` does a single-pass euclidean chroma-key (target rgb 7,223,33, tolerance 90, 30-px feather). The three keyed PNGs replace the old `cutscene-{closed,mid,open}.jpg` files. The `bg-chile-runner-01.png` chile street scene now shows through behind Ice's panels too — consistent treatment across all cutscenes.

### OBS /trending/ — 2026-04-26

New page at `/obs/trending/` — a live cross-chat word cloud built as a separate browser source so it can be tested in isolation before deciding whether to roll into the main `/obs/` overlay rotation. Same KekwClips trick we proved out before, now wired up to multiple Kick chats simultaneously.

**How it works:**

1. Loads the streamer roster from `/streamers.json`, polls each one every 60s for live status (parallel proxy race, same trick as the main `/obs/` overlay).
2. For each streamer that's live, resolves their numeric `chatroom_id` and opens a single shared Pusher WebSocket connection to `wss://ws-us2.pusher.com` (Kick's chat backend), subscribing to one `chatrooms.{id}.v2` channel per live streamer.
3. Each incoming chat message is tokenized: lowercased, Kick `[emote:1234:NAME]` blocks stripped, then split on non-letter/digit boundaries. Words are checked against a stop-word list (~200 common English words + chat noise: "lol", "lmao", "kekw", etc.) and a hate-word filter that l33t-speak normalizes first (`fuck` and `f4ck` and `phuck` all collapse to the same token before the filter check).
4. Two sliding windows (60s and 5min) count each word's occurrences AND the set of unique users who used it. Score = `uniqueUsers × log(count + 1)` — so 50 different people saying "what" beats 1 person spamming "what" 100 times.
5. Top 60 words go into a wordcloud2.js canvas; top 12 go into a side leaderboard with `Nu · Mx` (unique users / total mentions).

**Privacy:** No chat messages are displayed on screen. No backend, no logging, no persistence beyond a `localStorage` cache of `chatroom_id` → `slug` (which is publicly available info anyway). Word counts live in browser memory only and reset when the tab closes.

**Layout:** 1920×1080 OBS-friendly with the same gold corner brackets + dark Cinzel/JetBrains Mono aesthetic as the main `/obs/` overlay. Live indicator shows `N live · M chats connected` in the top-right; window toggle (60s / 5min) sits below the title.

Browser source URL once it's deployed: `https://ourempirex.com/obs/trending/`

### Run v0.18.17 — 2026-04-26

Patch — three real fixes from playtest.

- **Chile cut scene background actually shows now.** The `url('img/bg/...')` in `.overlay-cutscene` was relative to the CSS file's location (`/run/css/`) — resolving to `/run/css/img/bg/...` which doesn't exist. Fixed to `url('../img/bg/bg-chile-runner-01.png')`. The chile street scene now appears behind Mike's chroma-keyed cut scene panels as intended.
- **Cop car rear restored + ground shadow gone.** Two prior approaches failed: (1) v0.18.11's 18% right-crop ate the rear bumper along with the motion blur, and (2) the alpha-threshold approach in this round was useless because the shadow + blur pixels are alpha=255 (fully opaque, not translucent — they're rendered as part of the sprite). Settled on a balanced mechanical crop: **86% width × 91% height**. Most of the rear bumper visible, motion-blur reduced to a tiny tip, ground shadow trimmed off the bottom.
- **LEADERBOARD button text now fits.** The 2-column game-over grid (added v0.18.16) made each button cell ~240px wide, but the base `.overlay button` styles (2.2rem font / .2em letter-spacing / 2.4rem padding — all sized for the standalone START button) made LEADERBOARD overflow. Scoped override on `.gameover-buttons button`: 1.4rem font, .12em letter-spacing, .9rem padding, `white-space: nowrap`. All 4 labels now fit cleanly in the grid.

### Run v0.18.16 — 2026-04-26

Patch — game-over button layout + BookHockeys link click guard.

- **Game-over buttons in 2-column grid.** 4 buttons (SUBMIT SCORE / LEADERBOARD / RUN AGAIN / QUIT TO TITLE) were stacking vertically — tall + slow to scan. Now arranged 2×2 in a CSS grid with max-width 480px, so they fall into "primary action" rows. Mobile (max-width 480px) still falls back to single-column.
- **BookHockeys link disabled during gameplay.** Was clickable at all times — a stray click during the game could navigate the user away to bookhockeys.com mid-run. Now CSS guards `body.phase-playing .game-bookhockeys { pointer-events: none; opacity: .15 }` so the logo fades + becomes click-through during play. Title + game-over screens still let the link work normally. The body's `phase-playing` class is toggled by `syncChromeForPhase()` already called from boot, startRun, endRun, and quitToTitle.

### OBS overlay (corner alignment) — 2026-04-26

- **Corner brackets pulled outward + shrunk** from 180×180 at 32px offset → **130×130 at 18px offset**. The old brackets framed an inner box much smaller than where the tile grid actually sits, so content visibly under-filled the gold frame. New brackets sit closer to the viewport edges and embrace the actual content area.
- **Stage horizontal padding reduced** from 88px → 60px so the tile grid extends further toward the now-outboard corners. Vertical padding nudged 64 → 56.
- Net effect: the gold corner frame now visually contains the tiles + headers + footer cleanly, no more right-side empty gap.

### Run v0.18.15 — 2026-04-26

Patch — cut scene image no longer cropped on widescreen.

- The `.cutscene-bg` was using `object-fit: cover` which scaled the 3:2 source art to fill widescreen viewports and cropped the left/right edges. The gold corner brackets baked into the bottom dialogue-box art were getting cut off on the right side (visible in the screenshot — left brackets show, right brackets gone).
- Switched to `object-fit: contain` so the whole composition stays visible. The `bg-chile-runner-01.png` backdrop already loaded behind the cutscene art now fills the letterbox margins where the cutscene image doesn't reach the viewport edges.

### OBS overlay — 2026-04-26

Performance — first paint went from **3-5 minutes worst case → ~1 second** when the cache is warm, ~5-10 sec from cold start.

The `/obs/` BRB overlay polls Kick's API for each streamer in the roster (currently 26) through public CORS proxies. Old behavior was layered slowness:

| Layer | Old | New |
|---|---|---|
| Per-channel proxy attempts | **Sequential** with 12s timeout each (worst case 36s per channel) | **Parallel** via `Promise.any` — first proxy that responds wins (typical <1s, 6s timeout) |
| Roster concurrency | **3 workers** at a time | **8 workers** |
| UI render timing | **Wait for all 26 results, then render once** | **Incremental** — re-render the grid as each live streamer is discovered |
| Cold start | Empty grid for the entire poll duration | **localStorage cache** of last-known live set (< 5 min old) renders instantly on page load while fresh poll runs in background |

Net effect: when 3 streamers are live, you should now see them within 1-2 seconds of page load (cache hit) or 5-10 seconds (cold start), versus minutes previously. The poll interval (90 sec) and rotation cadence (45 sec) are unchanged — these were already fine.

### Run v0.18.14 — 2026-04-26

Patch — cut scene polish + audio fixes + weed icon swap.

- **Chile bg behind Mike's cut scenes.** `bg-chile-runner-01.png` re-added as the `.overlay-cutscene` CSS background. Ice's panels (full-blue JPG art) cover it completely; Mike's panels (chroma-keyed PNGs) let it show through — that's the requested "use the chile bg behind Mike's cut scene" treatment.
- **Mob crowd noise pauses during cut scenes.** The `mob-angry` ambient loop (which was always playing during the playing phase) was competing with the typewriter beep + dialogue cues, making cut scenes feel chaotic. Now stopped on `startCutscene` and resumed on `advanceCutscene` final dismissal.
- **Cut scene distances spaced out:**
  - First Meet: 250 m (unchanged)
  - Mike Tells Off: was 600 → **1000 m** (gives Ice time to actually be following for a meaningful stretch before the "fed up" moment)
  - Ice Returns: was 1100 → **2000 m** (1000 m gap so the player has a long stretch without Ice before he reappears)
- **Death + game-over music stops on Quit-to-Title.** The death sting + game-over music are one-shot SFX (~3 sec each). If the player tapped QUIT TO TITLE before they finished playing, the audio would keep playing on the title screen, weirdly competing with the title bg music. Now explicitly stopped.
- **Weed debuff badge** changed from 🌿 (herb) to 🍁 (maple leaf) — closer to the recognizable weed-leaf silhouette. There's no dedicated cannabis emoji in Unicode so 🍁 is the closest convention.

### Run v0.18.13 — 2026-04-26

Minor — multi-stage Ice arc throughout each run.

The cut scene system has been restructured into a generic multi-panel + multi-cutscene engine. Each run now plays out a 3-act arc with Ice depending on distance milestones:

| Trigger | Cut scene | Effect |
|---|---|---|
| **250 m** | **First Meet** — Ice's existing intro line + 3 player choices | Ice joins as side-kick |
| **600 m** | **Mike Tells Off** — Mike (new chroma-keyed art) tells Ice: *"Listen, you pissing me off dude! Stop following and leeching me! 400 shit."* + CONTINUE | Ice DEPARTS (no longer follows) |
| **1100 m** | **Ice Returns** — 2 panels: Ice says *"Yo Mike, lemme grab that dick!"*, then Mike replies *"AHHH WHAT THE FUCK!"* + CONTINUE | Ice REJOINS |

**Implementation details:**

- **Mike's reply art** chroma-keyed from the new green-screen source images (`cutscene-mike-mouth-{closed,mid,open}.png` from `concept/`). The chile bg behind these PNGs shows through cleanly because Mike has no green on him — the per-pixel chroma key (tolerance 80) safely strips all green without affecting the sprite.
- **Cut scenes are data-defined** in a `CUTSCENE_DEFS` map: each entry has `triggerDistanceM`, optional `requires` predicate (e.g. mike-tells-off only fires if Ice is currently following), `panels[]` (each with speaker name, bg image prefix/extension, dialogue line, and optional `choices[]`), and `onComplete` callback.
- **Choice/continue buttons populate dynamically** per panel — 3 choice buttons for the first panel, single CONTINUE for the others. Click handler is one event-delegated listener.
- **Per-run trigger flags** in `state.cutscenesTriggered` reset on every `startRun` so the full arc replays each new run.
- **End-of-line SFX cue** chosen per speaker — `ice-neck.mp3` for Ice panels, `damage.mp3` for Mike's frustrated panels.
- Old single-cutscene state cleaned up; `dismissCutscene` replaced by generic `advanceCutscene` that handles both panel-to-panel transitions and final dismissal.

### Run v0.18.12 — 2026-04-26

Patch — reverted the cut scene background swap (kept the cop-car fix).

- Per playtest, the v0.18.11 partial cut scene background swap (chile bg showing only through the top sky region while the middle blue band stayed opaque) wasn't worth shipping — it looked half-done because Ice's shirt is the exact same blue as the source middle band, so a clean full-bg replacement isn't algorithmically possible without manually masking Ice in an editor.
- Reverted: cut scene HTML/JS now reference the original `cutscene-{closed,mid,open}.jpg` (full blue background) and the chile-bg CSS background is removed from `.overlay-cutscene`. Keyed PNG files deleted.
- Cop car motion-blur crop from v0.18.11 stays in — that fix was unrelated and worked clean.

### Run v0.18.11 — 2026-04-26

Patch — cop car motion blur trimmed + cut scene layered over chile bg (with caveat).

- **Cop car motion blur cropped.** Each cop-car-XX sprite had a baked-in diagonal grey/white motion-blur streak extending off the right side. Crop the right 18% of each extracted sprite — POLICE text stays intact, blur disappears.
- **Cut scene now layers over `bg-chile-runner-01.png`** as the backdrop. The Mike+Ice composition art has its sky-blue background flood-keyed transparent (`tolerance=30`) so the chile street scene shows through behind them. Stored as `cutscene-{closed,mid,open}-keyed.png`.

  ⚠️ **Honest caveat:** Ice's shirt is rgb(1,60,167) — virtually identical to the middle blue band rgb(4,66,170) in the source art. A more aggressive flood would key out his shirt along with the bg. With tolerance=30, only the corner-connected sky region clears (the middle band is "trapped" between Mike and Ice's silhouettes so flood can't reach it from the corners). Result: chile street shows through the top sky region; the middle blue band behind Mike+Ice stays solid. This is the cleanest algorithmic separation possible — going further would require manually masking Ice in an image editor.

### Run v0.18.10 — 2026-04-26

Patch — pause-button visibility + Quit-to-Title on game-over.

- **Pause button hidden on title + game-over screens.** It did nothing in those phases anyway (pause only toggles during the playing phase). Now properly hidden via a `syncChromeForPhase()` helper called from boot, startRun, endRun, and quitToTitle. Settings gear stays visible everywhere since audio adjustments are useful regardless of phase.
- **QUIT TO TITLE button on the game-over screen.** Sits below RUN AGAIN. Mirrors the equivalent button already in the pause overlay — same behavior (hard reset back to the title screen with bg music restarting). Useful when you want to bail to the title without burning a fresh run first.

### Run v0.18.9 — 2026-04-26

Patch — title hint, controls reference, Ice cleanup.

- **Title hint** now lists `SPACE / ⬆ / W = jump` instead of just `SPACE = jump`. All three keys have always worked; the hint just wasn't reflecting it.
- **CONTROLS section** added to the audio settings panel (gear icon dropdown). Shows the key bindings as styled `<kbd>` chips:
  - `⬅` `➡` dodge lane (or tap left/right)
  - `SPACE` `⬆` `W` jump
  - `P` `ESC` right-click pause
- **Ice run cycle cleaned up:**
  - **Dropped the standing-pose frame (ice-15)** from the cycle. The 3-frame loop `[14, 15, 16]` was alternating stride → standing → stride, which read as Ice keeping his left leg planted. Now using a 2-frame stride loop `[14, 16]`.
  - **Y-bob added** — small sine-wave vertical oscillation (~1.2 % of viewport) so even with only 2 stride frames, the visible up/down bounce reads as proper running motion. Disabled during the neck-stretch animation (his head's already moving up dramatically so an extra bob would look weird).
  - **Ground shadow cropped** — every source Ice frame had a small grey ellipse shadow under his feet baked in. Drawing now pulls a partial source rect (`srcCropFrac = 0.91`, dropping the bottom 9 % of each frame) so the shadow disappears off the visible edge.

### Run v0.18.8 — 2026-04-26

Patch — version label inside the audio settings panel.

- Added `Run v0.X.Y` line at the bottom of the audio settings panel (the gear-icon dropdown). Auto-syncs from the existing `.game-version` element on init so I don't have to remember to bump it in two places — single source of truth, mirrored. Useful when reporting bugs from inside the game without scrolling.

### Run v0.18.7 — 2026-04-26

Patch — version label now readable.

- The `Run v0.X.Y` text at the bottom-center of the title and game screens was 0.85 rem at 30 % opacity — essentially invisible against the busy title-screen art and most gameplay backgrounds. Now rendered as a centered pill: 1 rem text, 90 % opacity, dark-purple translucent background with a subtle purple border + text shadow. Sits at `bottom: 0.5rem` like before but centered via `transform: translateX(-50%)` instead of full-width. Easy to read at a glance, doesn't dominate the screen.

### Run v0.18.6 — 2026-04-26

Patch — Ice properly tall + neck-stretch actually visible on coin grab.

- **Ice scaled way up** — `ICE_HEIGHT_FRAC = 0.27` (Ice's run-cycle height is 27 % of viewport, vs Mike's 17 %). Ice is canonically tall and lanky in real life, Mike's stockier and shorter. This gets the proportions right at a glance instead of Ice looking like a tiny side-kick.
- **Reach radius bumped** `80 → 130 px` so Ice grabs nearby-lane coins more reliably.
- **Lateral offset bumped** `10% → 13%` of viewport so the now-bigger Ice doesn't visually overlap Mike.
- **Neck-stretch render rewrite** — the old code used `scaledSize('ice-15', ...)` which forced EVERY Ice frame into ice-15's bounding box, so when the neck-stretch frames (ice-23..29) rendered, their tall extending necks got squished into the same height. Now each frame is sized relative to ice-15's source ratio, so neck-stretch frames render at their natural taller proportion — when Ice grabs a coin, his neck visibly EXTENDS UPWARD before snapping back to running. Stretch animation duration also bumped `600 → 700 ms` to give the eye more time to register the extension.
- Bottom-anchor preserved: Ice's feet stay at Mike's foot line whether his neck is stretched or not — so the head reaches up but the body stays grounded.

### Run v0.18.5 — 2026-04-26

Patch — cut scene plays every run instead of once-per-session.

- Per playtest feedback ("not very long, so it's tolerable"), the cut scene now triggers on every fresh run when the player crosses the 250 m threshold — not just the first run per page-load. Removed the `cutscene.everPlayedThisSession` skip flag and the conditional in `maybeTriggerCutscene` that bypassed the dialogue. Each run gets a story-beat moment when Ice joins.

### Run v0.18.4 — 2026-04-26

Patch — Ice scaling + orientation + per-run reset.

- **Ice now front-faces the camera** like Mike instead of running side-view. Switched his run cycle from `ice-19/20/21/22` (the side-view profile row) to `ice-14/15/16` (the camera-POV row, where Ice is running TOWARD the camera with the selfie stick). Now visually consistent with Mike's orientation.
- **Ice scaled up** from `0.85x` Mike's height → `1.05x`. Ice's source sprite is narrower than Mike's so even at 1.05x he renders comparably wide on screen. Was rendering as a tiny child next to Mike before — now reads as a proper side-kick at proportional height.
- **Cut scene + Ice now reset on every Run Again.** Previously the localStorage flag persisted, so the cut scene only ever played once per browser, and Ice was permanently with you across all future runs. Now:
  - Each new run starts with Ice gone (`state.iceSidekickJoined = false`).
  - Cut scene fires the first time you cross **250 m** (lowered from 400 m so it triggers more reliably) — but only the FIRST time per page-load session. Subsequent Run Agains skip the dialogue and Ice silently joins at the same threshold.
  - Reload the page → cut scene replays once again on the next 250 m crossing.
- **Cut scene trigger lowered** from 400 m → 250 m so it fires within the first ~7 seconds of survival instead of needing 12+ seconds. Players who die early should now reliably see the cut scene at least once.

### Run v0.18.3 — 2026-04-26

Patch — three playtest bugs from the v0.18.0-0.18.2 story round.

- **Ice now actually appears alongside Mike** post-cutscene. Two bugs were stacked:
  1. **Ice sprites were never preloaded** — `SPRITE_PATHS` had no entries for `ice-*`, so the sprite catalog never fetched them and `drawAt()` couldn't render him. All 29 frames now in the preload list.
  2. **Wrong frame numbers** for the run cycle and neck-stretch sequence. Looking at the actual extracted sheet, `ice-19..22` are the side-view running poses (not `13..16`) and `ice-23..29` are the neck-growing-upward stretch (not `22..27`). Corrected both.
- **Bad seagull frame trimmed** from the title-screen flap cycle. `seagull-09` had a ground-shadow blob baked under the bird's feet that looked weird on a clearly-airborne sprite. Now cycling frames `10`/`11`/`12` only (3-frame loop instead of 4).
- **HORSE pickup spawns on the sidewalk** now, not in the middle lanes. Per spawn type, `kind === 'horse'` always picks lane 0 or lane LANES-1 (the edge lanes that visually overlap the painted sidewalks). Player has to swerve to the side of the road to grab it, which feels more like "you spotted a horse tied up on the side of the road" than "a horse appeared in your lane."

### Run v0.18.2 — 2026-04-26

Patch — HORSE pickup with art-aware Mike-or-Mike+Ice swap.

- **New HORSE pickup type** (weight 1, same as 400 — rare). On collision: 8-second speed boost (`HORSE_SPEED_MULT = 1.7`× world scroll), centered text-burst `GIDDY UP!` in saddle-brown, celebratory jingle (placeholder until horse-neigh.mp3 lands).
- **Mike's render swaps to horse-riding sprite** during the boost. Pre-cutscene: solo `mike-horse-01..08` (8-frame walk/run cycle). **Post-cutscene** (after Ice has joined): switches to `mike-ice-horse-01..14` (14-frame duo cycle with Ice riding behind Mike). Ice's separate alongside-runner sprite is hidden during the ride since the duo art already includes him.
- **Horse art extracted** from your green-screen sources via the new flood-mode extractor with bumped `bg_tolerance: 40` to handle the slightly gradient chroma-key edges. 8 solo + 14 duo frames.
- **HUD badge** added: `🐎 7.4s` countdown in saddle-brown when the boost is active. Joins the existing ham/weed badges.
- **Sprite scale bump** during ride — horse-Mike renders at 1.4× the standard player height so the horse fits properly without looking miniature.

### Run v0.18.1 — 2026-04-26

Patch — Ice Poseidon side-kick is alive in the world.

- **Ice renders alongside Mike** once `state.iceSidekickJoined === true` (set after the v0.18.0 cut scene). He's positioned at 10% of viewport width away from Mike's center, on whichever side has more road room (so he doesn't fly off-screen when Mike picks an edge lane). Auto-mirrors horizontally when he's on Mike's left so he always faces forward.
- **Run cycle** uses Ice frames `ice-13` through `ice-16` (the running-side-view row of the source sheet) at the same cadence as Mike (80 ms per frame).
- **Auto-coin grab** — when a Cx coin enters within `ICE_REACH_PX = 80` of Ice's center, he snaps it up. Each grab adds **0.5× to the coin total** (counts as helper, not replacer — Mike's direct grabs still count full). The HUD `Cx` counter now `Math.floor()`s the displayed value so 0.5 fractions don't look weird.
- **Neck-stretch animation** triggers on each grab — cycles through the `ice-22` through `ice-27` frames (the 6-frame neck-growing-upward sequence) over 600 ms before returning to the run cycle. Pairs with `ice-neck.mp3` SFX so you both see and hear the stretch.
- The cut scene from v0.18.0 unlocked this — first time you hit 400m in a run, Ice joins, then he's persistently with you across all future runs in that browser.

### Run v0.18.0 — 2026-04-26

Minor — Mike-meets-Ice cut scene lands. First story moment in the runner.

- **Triggered automatically** the first time the player crosses **400 m** during a run, **once per browser** (localStorage flag `runner-cutscene-met-ice-v1`). After it fires, all subsequent runs skip the cut scene and Ice is considered "joined" (side-kick mechanic itself ships in v0.18.1).
- **Cut scene UX:**
  - Game world freezes (same machinery as the ham-1UP freeze)
  - Full-screen background image (Mike from behind on the left, Ice with selfie stick + Sonic shirt on the right) — uses your three `cutscene-ice-mouth-{closed,mid,open}.png` source files compressed to ~200 KB JPEGs each (was 1.5 MB each as PNG).
  - Mouth animation cycles **closed → mid → open** every 110 ms while the dialogue text is typing in
  - Dialogue typewriter at ~35 ms per character, with `Blip3.mp3` beeping on each new character (Pokemon-style)
  - Speaker name banner ("ICE POSEIDON") floats above the dialogue box
  - Blinking caret at the end of the typing line
  - When text finishes: mouth settles on `closed`, `ice-neck.mp3` plays, three player-choice buttons fade in
- **The dialogue + choices** (your authored copy):
  > **ICE POSEIDON:** "Mike Smalls? Aren't you the guy who always just wants to fuck?"
  -
  > "What did you just say horse boy?"
  > "DON'T GRAB MY DICK BITCH ASS N\*GGA!"
  > "ALLAT! Let's team up!"
  
  All three converge — choosing any of them sets `iceSidekickJoined = true` + persists the localStorage flag and dismisses the overlay.
- **GA events:** `cutscene_played` fires on overlay open, `cutscene_choice` fires on dismiss with `selected_option` (0/1/2).
- **Input handling** during cut scene: keyboard + tap input is blocked so the player can't accidentally pause/jump/shift-lane while the dialogue is typing. The choice buttons remain interactive (their own click handler).
- **Coming in v0.18.1:** Ice actually appears in the world running alongside Mike + auto-collects Cx coins + neck-stretches each time he scores.

### Run v0.17.5 — 2026-04-26

Patch — pickup-text overlays for 400 + weed, and live duration countdowns in the HUD.

- **Generalized the Mario-1UP-style pickup text overlay** so it fires on every pickup, not just ham. Each pickup now flashes a big centered text-burst that scales 1.0× → 1.5× over its duration while fading out:
  - 🍖 **HAM** → `HAM!` (yellow, 600 ms — same as before, during the freeze)
  - ❤ **400** → `+1 LIFE!` (red, 900 ms)
  - 🌿 **WEED** → `STONED` (green, 900 ms)
- **HUD effect-badge row** added under the lives. While a ham bonus or weed debuff is active, a pill-shaped badge appears with an emoji + countdown ticking down to one decimal (`🍖 6.5s`, `🌿 8.2s`). Ham badge has a subtle pulse animation; weed badge stays steady. Both auto-disappear when the effect ends.
- 400-pickup audio promoted from a placeholder coin-pickup sound to the celebratory `1up3.mp3` jingle so it actually feels rewarding.

### Run v0.17.4 — 2026-04-26

Patch — three more bugs caught from playtest.

- **Seagulls no longer have white body parts missing.** Same root cause as the Mike-eyebrow bug from earlier: per-pixel RGB tolerance keys EVERY pixel that matches the bg color, including white body pixels enclosed inside a sprite. Fix: added a new **flood-fill-from-corners** extraction mode. Starts from each of the 4 image corners, only marks pixels as bg if they're (a) within tolerance of the corner color AND (b) reachable through a continuous run of in-tolerance pixels back to a corner. Interior whites enclosed by darker outline pixels are preserved. Switched seagulls/pigeons/dogs/ham-spin/400-spin sources to flood mode and re-extracted.
- **400 spin is actually animated now** (was blinking between 2 frames). Old extraction only got 2 of the 20 frames because the corner-color detection picked the wrong color (a stray red pixel at a corner). Flood-mode extraction now correctly identifies the white bg, so we get all 20 spin frames. Same fix gave us 7 ham-spin frames (was 1) and the full seagull set with intact white bodies. JS preload + PICKUP_TYPES updated to use the full frame counts at sensible cadences (60-90 ms per frame).
- **Right-click no longer triggers a lane shift to the right.** The mouse `tapHandler` was firing for ANY mouse button — left-click for lane shift, but right-click was also passing through and the right-click happens to land on the right half of the screen, so it triggered a right-lane-shift before the contextmenu pause kicked in. Added `if (e.type === 'mousedown' && e.button !== 0) return;` so only LEFT clicks register as lane-shift taps.

### Run v0.17.3 — 2026-04-26

Patch round — bug fixes + UX feedback from playtest.

- **Pickup sprites no longer render as purple boxes.** `ham-spin-01`, `h400-spin-01/02`, and `weed-spin-01..16` were referenced in `PICKUP_TYPES` but I never added them to `SPRITE_PATHS` so they never preloaded — `drawAt` was hitting its missing-sprite fallback (the magenta box). Same for `cop-car-01/02/05/09`. All now in the preload list.
- **Seagulls flipped + shrunk + drop-shadowed.** They were flying right→left but the sprite's beak points right, so they looked like they were flying backwards. Now flying L→R (matching beak direction). Default scale dropped from 0.8-1.5 → 0.4-0.7 so they don't dominate the title screen. Added a CSS-style drop shadow (rgba(0,0,0,.55), blur 8 px, offset 2/4) on each draw so the white-bodied seagulls don't disappear against the bright sky in the title-screen image.
- **Title screen text** — removed the "an EmpireX runner" subtitle. Description tag now line-breaks after "through Chile." for cleaner reading. Hint line expanded to mention SPACE / pause keys.
- **LEADERBOARD button** added to the title screen (next to START). Quit-to-title button added to the pause overlay so mid-game you can bail back to the title without finishing the run.
- **Right-click also pauses** — `contextmenu` event listener on the document toggles pause during play (and suppresses the browser context menu either way so it doesn't pop up over the game). Inputs/textareas still get their normal context menu so leaderboard handle entry isn't broken.
- **HAM bonus speeds up world scroll too** (× 1.7) so the visual pace matches the chipmunk-music tempo. Was previously only audio that sped up.
- **Coin pickup SFX** — switched from the user's `coin-pickup.wav` (was reported inaudible — possibly too quiet, possibly format issue) to `Coins/MP3/Coin1.mp3` from the bundled sound pack which is shorter (~80 ms) and louder. SFX channel default volume bumped from 0.7 → 0.85 across the board.
- **Leaderboard simplified to streamer-handle-only.** Display-name + arcade-tag modes removed. The submit dialog now has just a Kick/Twitch dropdown + handle input — auto-focused on open so you can just type and hit SUBMIT. Profanity filter code stripped (no longer needed since handles are character-regex-validated). Leaderboard rows now show the full `kick.com/handle` or `twitch.tv/handle` URL form.

### Run v0.17.2 — 2026-04-26

Patch — Firebase-backed leaderboard live.

- **`run/js/leaderboard.js`** — new ES module loaded as `<script type="module">` so it can use Firebase v12's modular SDK (ESM imports from gstatic CDN). Self-contained: handles Firebase init, profanity filtering, score submission, top-100 fetch + render, and the submit/leaderboard UI overlays. Exposes a small surface (`window.RunnerLeaderboard.openSubmitDialog/openLeaderboard/submit/fetchTop`) that the main classic-JS game can call.
- **3 identity input modes** as discussed: **Display Name** (max 20 chars, profanity-filtered) / **Arcade Tag** (4 chars, A-Z 0-9, no filter needed since length-limited) / **Streamer Handle** (Kick/Twitch dropdown, becomes a clickable link on the board).
- **Profanity filter** is 3-layer:
  1. **L33t-speak normalize** — `0`→`o`, `1`→`i`, `3`→`e`, `4`→`a`, `@`→`a`, `5`→`s`, `7`→`t` etc., then collapse repeated letters and strip non-letters. So `n1gger`, `fuuuck`, `f.u.c.k`, `f3ck` all collapse to their root form for matching.
  2. **Hate-term list** — common slurs, blocks with `reason: 'hate'`.
  3. **Common-profanity list** — fuck/shit/cunt/etc., blocks with `reason: 'profanity'`.
- **Anti-spam:**
  - Per-(distance, coins) localStorage flag prevents double-submitting the same run. Different runs can be submitted freely.
  - Server-side sanity caps in JS (DB rules also enforce, layered defense): max 100k m distance, max 10k coins, min 5 sec duration.
- **Sorted by combined score** = `distance + coins × multiplier × 10`. Top 3 rows highlighted with subtle purple background.
- **Game-over screen** now has 3 buttons: SUBMIT SCORE / LEADERBOARD / RUN AGAIN. Submit dialog is a full-screen overlay with the input mode tabs + score recap. Leaderboard is a separate full-screen overlay with rows showing rank, identity (clickable for streamer handles), score, and detail (distance + coins×multiplier).
- GA event `leaderboard_submitted` fires with `identity_type` param when a submission succeeds.

### Run v0.17.1 + Slots v0.14.0 — 2026-04-26

Minor — Google Analytics + custom-event tracking on both games.

**Both games:**

- Added gtag snippet pointing at `G-PCSJJENWY2` (the unified property already used on the main site). All traffic + events now flow into one GA dashboard regardless of subpath.

**Run v0.17.1 custom events:**

- `game_started` — fires when player taps START
- `jump` — fires on each jump trigger, params: `at_distance`
- `obstacle_hit` — fires on every collision (non-fatal + fatal), params: `at_distance`, `lives_left`, `obstacle_kind` (e.g. `walk-hoodie`, `cop-car`)
- `ham_collected`, `h400_collected`, `weed_collected` — fires when each pickup is grabbed, params: `at_distance`
- `game_over` — fires when lives hit 0, params: `final_distance`, `final_coins`, `final_multiplier`, `final_score`, `duration_sec`

**Slots v0.14.0 custom events:**

- `slot_spin` — fires on the FIRST tap of each new spin (when reel 0 stops first), params: `set` (`fun` or `more-fun`)
- `slot_result` — fires when the LAST reel stops and prize resolves, params: `prize` (`cx` / `nick-white` / `400` / `loser`), `set`
- `slot_set_changed` — fires when player taps Fun ↔ More Fun tab, params: `set`
- `slot_screenshot_saved` — fires when Save-as-PNG completes, params: `prize` (which result was saved)
- `slot_volume_changed` — fires when bg-volume slider changes, debounced to once per 1 sec so slider drags don't spam GA. Params: `volume` (0-100)

All events have a graceful no-op fallback if `gtag` isn't loaded (so blocked tracking or load failure doesn't break gameplay).

### Run v0.17.0 — 2026-04-26

Minor — JUMP mechanic + cop car obstacle + 3 special pickups (HAM / 400 / WEED) with full Mario-style effects.

**Jump mechanic:**

- **Space / ArrowUp / W = JUMP.** Mike does a procedural Y-axis arc lasting 0.7 sec (peak ~18% of viewport height), with the run-cycle frozen on a mid-stride frame so it reads as a jumping pose. Re-jumping mid-air is blocked — clean landings only.
- `Jump1.mp3` SFX on every jump.
- Tap-up gesture deferred for now (mobile uses the screen-half tap zones for left/right; jump button on the HUD comes later).

**Cop car (jump-only obstacle):**

- New obstacle type with `jumpOnly: true` flag — lane-shifting won't help; you have to jump over it. Uses the cop-car-{01, 02, 05, 09} sprites for paint variety.
- Collision-detection layer now skips jump-only obstacles when `isAirborne(now)` returns true.

**Pickup system (HAM / 400 / WEED):**

- Three new pickup types spawn occasionally (~6% per spawn cycle) in random lanes. Each uses weighted random selection — ham (weight 3) most common, weed (2) middle, 400 (1) rare.
- **HAM bonus** — full Mario-1UP sequence:
  1. Game world FREEZES for 600 ms (movement + spawning halts).
  2. Screen flashes white-then-purple at ~16 Hz during the freeze.
  3. Big yellow "HAM!" text scales up in the center with shadow blur.
  4. `1up3.mp3` jingle plays.
  5. World resumes — for the next 6.5 seconds: coin spawn probability bumps to 1.0 + 60% chance of a second coin per cycle (literal coin shower), background music `playbackRate = 4` for chipmunk-speed comedic effect, pulsing purple border around the screen + countdown bar at the top edge.
  6. On expiry: music returns to 1× speed, `Blip2.mp3` "bonus end" SFX plays.
- **400** — instant +1 life, capped at 5. HUD heart row dynamically expands to show extra hearts.
- **WEED** — 10-second debuff: world speed × 0.55, music `playbackRate = 0.6` (slowed), red screen tint pulsing slowly, red countdown bar at top. `damage.mp3` plays on collision (this is a bad pickup, not a good one). On expiry: music + speed restore.
- HORSE speed-boost pickup deferred to v0.18+ since it needs Mike-on-horse sprite swap which cleanly couples with the post-cutscene "Ice has joined" state.

**Misc:**

- HUD hearts row dynamically grows to display whatever current `state.lives` is (handles +1 from 400 pickups going above the initial 3).
- Reset music `playbackRate` to 1 on every `startRun()` in case the previous run ended mid-bonus or mid-debuff.

### Run v0.16.0 — 2026-04-26

Minor — biggest visual + polish round. Mobile fix, Mike's eyebrows back, real title screen, animated seagulls, timer in HUD, lots of SFX wired.

**Bug fixes:**

- **Mobile rendering** finally working. Root causes: (1) `Promise.all` of sprite loads could hang forever if a single image timed out on a flaky mobile network, leaving the game stuck in `loading` phase forever. Added a 12 sec per-sprite timeout that resolves the promise even on hang. (2) `window.innerWidth` / `innerHeight` aren't always reliable on mobile (visualViewport changes when the address bar shows/hides on iOS Safari). Switched to `window.visualViewport.width/height` with `documentElement.clientWidth/Height` as fallback. Also added `orientationchange` and `visualViewport.resize` listeners so the canvas re-measures correctly when the device rotates.
- **Mike's facial details restored.** The black-bg-removal extractor was eating dark interior pixels (eyebrows, facial hair, body outlines) because they were within `BG_TOLERANCE = 24` of the near-black detected background color. Solution: extractor gained a `use_alpha` per-source mode that ignores RGB tolerance entirely and trusts the source file's existing alpha channel. Switched all 4 Mike + Ice sources to the user-pre-cleaned `_alpha.png` versions. No more eyebrow eating.

**New features:**

- **Title screen** rebuilt — the new `titlescreen.jpg` (Mike + Ice on the Chilean street, optimized from a 7 MB PNG to an 800 KB JPEG) now serves as the canvas backdrop. **Animated seagulls** spawn periodically off-screen-right and drift across the sky in the upper 35% of the viewport, cycling through 4 wing-flap frames (extracted seagull-09 through seagull-12) at varying scale + speed for organic flock motion. The HTML overlay (ON BABY! cursive title + START button) sits on top.
- **Pause overlay** redesigned — the SVG map of Chile (`Mapa Todas las regiones.svg`) sits behind the PAUSED text at 25% opacity for ambient flavor. PAUSED title now has a beefier glow + purple drop-shadow for contrast against the map.
- **Timer in HUD** — `M:SS` format, sits between score and Cx counter on the left side of the HUD. Counts wall-clock playing time only (excludes paused time).
- **Audio expansions wired:**
    - `coin-pickup.wav` plays on every Cx coin collected
    - `swoosh.flac` (picked from your 43-file pack) plays on every lane shift
    - `1up3.mp3`, `Blip2.mp3`, `Blip3.mp3`, `Jump1.mp3` all preloaded for v0.17 features (ham-pickup / bonus-end / dialogue-beep / jump)

**Extractor improvements:**

- Added `use_alpha` per-source override (alpha-channel-only BG detection)
- Pulled in 8 new source sheets: `ham-spin`, `400-spin`, `weed-spin`, animal sheets (cats/dogs/goats/seagulls/pigeons), cop-car
- 217 individual sprites total (up from 129 in v0.15.1)
- Some animal sheets (dogs, pigeons) had imperfect BG detection due to colored gradient backgrounds — those need bg_extra overrides in v0.17 when we wire fauna spawns

### Run v0.15.4 — 2026-04-26

Patch — sound-unmute hint + smaller control buttons.

- **Pause + settings buttons shrunk** from 56 px → 44 px (and their inner SVG icons from 28-30 px → 22-24 px). Frees up screen real estate, especially noticeable on smaller laptops. Hover/active behaviors unchanged.
- **"No sound? Tap ⚙ to unmute" hint** shown directly below the buttons on first load. Helps players realize that browser autoplay-blocking is the cause of any silence (not a broken site). The hint auto-hides via CSS fade the moment the user clicks/taps/types anything, since that interaction unlocks audio anyway.
- Pause-button right-offset adjusted from `calc(1rem + 56px + .6rem)` → `calc(1rem + 44px + .5rem)` so it still sits cleanly to the left of the (now smaller) gear.

### Run v0.15.3 — 2026-04-26

Patch — BookHockeys footer link.

- Added the BookHockeys cross-link to the bottom of `/run/`, mirroring the `/game/` pattern. **Different visual treatment from the slot game** though: at rest the logo renders **grayscale at 35% opacity**, on hover it shifts to **full color at 65% opacity**. The transition is a 0.3 sec CSS ease on both `opacity` and `filter: grayscale()`. Logo height is 40 px (vs 70 px on the slot page — runner footer is more compact). Sits centered above the URL caption + version display. Re-uses the existing `/bookhockeys-logo.png` so no new asset.

### Run v0.15.2 — 2026-04-26

Patch — HUD overlap + space-bar bug.

- **Hearts moved from top-right to top-left.** They were getting visually overlapped by the pause button + settings gear. Now the lives row sits on the left below score + Cx counter, and the entire top-right corner is reserved for control buttons.
- **Space-bar mid-game restart bug fixed.** Two layers of defense:
    1. Clicking the `START` or `RUN AGAIN` buttons now `.blur()`s the button after firing — it no longer keeps keyboard focus, so a later space-press doesn't re-trigger the focused button via the browser's default activation behavior.
    2. The keydown handler now explicitly `preventDefault`s the spacebar during the `playing` phase (before this, the keydown handler had no clause for space at all, so the browser default fired through). When the jump mechanic lands in v0.17 this no-op becomes `triggerJump()`.

### Run v0.15.1 — 2026-04-26

Patch — fixed white halos around walking pedestrians.

- The `npcs-pedestrians.png` source sheet had a grey-and-white **checker-pattern background** (the typical "transparent" placeholder from image editors). The extraction script's auto-detection picked the grey checker squares as background, but the white squares were 48 RGB units away — outside the default ±24 tolerance — so they survived as **solid white halos** around each walking pedestrian sprite when rendered in-game.
- **Extractor gained `bg_extra` per-source override** — a list of additional `(r, g, b)` colors to also key out as background. For `npcs-pedestrians.png`, `bg_extra: [(255, 255, 255)]` makes the script treat both the detected grey and pure white as background.
- Re-extracted all 12 walking-pedestrian frames. Confirmed clean transparency on test pixels (top-left, mid-left, mid-right of the sprite all alpha=0).
- Bonus side effect: pedestrian sprite count went 14 → 12. The 2 "extras" were empty grid cells the extractor was incorrectly counting as sprites because of the white-square boundaries — now correctly filtered out.

### Run v0.15.0 — 2026-04-26

Polish round — pause + animated street people.

- **Pause button** at top-right (left of the settings gear). Toggleable via the button, **P** key, or **ESC**. Tap on the PAUSED overlay to resume. Music + ambient mob loop pause along with the game (one-shot SFX are unaffected since they finish on their own). Pause is ignored on the menu / game-over screens.
- **NPCs are alive now.** Obstacles are no longer single static frames — they're typed into groups:
    - `walk-hoodie` (4-frame walk cycle of the hoodie pedestrian)
    - `walk-woman` (4-frame walk cycle of the woman in red)
    - `walk-reaching` (4-frame "reaching forward" cycle — phone-thief vibe, faster cadence)
    - `static-protester` (each protester with their parody picket sign — FUCK ICE / WHERE'S ICE / Cx / etc.)
    - `static-chibi` (chibi pixel-art Chilean street pedestrians)
  - Walking obstacles cycle through their frames at 130-160 ms per frame, plus a subtle ±14-22 px sine-wave horizontal wobble so they look like they're swaying as they walk. The bob phase is randomized per spawn so two walkers in adjacent lanes don't sway in perfect sync.
  - Static obstacles still just stand there but they're more visually varied because each spawn picks one of 12 distinct silhouettes.
- **Sprite preload expanded** to cover all the obstacle frames the typed system references (was 6 protesters + 6 chibi = 12 sprites; now 12 pedestrian + 6 protester + 6 chibi = 24 sprites). Adds ~3-4 MB to first-load but variety jump is dramatic.
- **Z-ordering fix.** With Mike at the top of the screen, "closer to camera" obstacles are the ones with LOWER Y values (just above where they pass Mike). Sort flipped so the closer obstacles draw on top of the farther ones for a tiny depth-cue.

### Run v0.14.0 — 2026-04-26

Iteration 2 on the runner. Big visual + UX changes.

- **Per-project SemVer.** Footer labels now read `Run v0.14.0` / `Slots v0.13.0` / `Site v0.13.0` so it's clear which game you're looking at and what version it is. Each ticks independently from now on.
- **Title is cursive now** — `On Baby!` rendered in Pacifico with the leading `O` and `B` ~45% bigger than the rest of the word, retaining the purple drop-shadow and a slight `-3deg` tilt for that hand-drawn-sign feel.
- **Mike pinned near the top of the screen** instead of the bottom. He's running DOWN-hill, so visually higher on screen = higher elevation. Obstacles now spawn off the bottom edge and travel UP toward him. All the procedural road details (lane dashes, crosswalks, sidewalk grates) flipped direction to scroll UP too.
- **Vertical-tiling road art is in.** The 4 new `bg-road-tile-N.png` images (1440×2912 top-down Chilean street tiles with sidewalks, manholes, painted markings, shop fronts) replace the procedural road. The renderer picks one at random per game start, scales it to viewport width, and tiles it vertically as Mike runs. Procedural road remains as a fallback if the tile fails to load.
- **Settings icon** changed from speaker to gear/cog at top-right, ~25% larger, with a purple ring + drop-shadow + a 45° hover rotation so it actually reads as "settings" at a glance against any background.
- **Background music starts at the title screen.** Browsers block audio until user interaction, so we optimistically call `.play()` when the page loads, and bind a one-time click/tap/keydown listener that retries the play call on first interaction. Result: music plays as soon as the player does anything (move mouse over the START button counts).
- **Skip-track button** in the audio panel — `⏭` next to the Music slider. Cycles through the 3 background tracks in order. Useful both because the random pick on START might not be your favorite, and because long-running sessions can rotate to keep things fresh.

### Slots v0.13.0 — 2026-04-26

(Inherited the v0.13.0 number from the previous shared-version scheme. No functional changes since the OG/Twitter share metadata + cropped PNG export work in v0.10.16/0.10.17.)

### Site v0.13.2 — 2026-04-27

Two more homepage sections are now CMS-editable: the **Wristband** section (small uppercase pill / headline / paragraph / red warning line / wristband photo) and the **Featured Group** section (label / group name / optional tagline / description / repeatable detail rows / group-house photo).

**Bootstrap step.** Both sections previously embedded their photos as inline base64 data URIs (~80 KB and ~150 KB of base64 in `index.html` itself). One-time decode → saved to `/wristband.jpg` and `/featured-group-house.png` at the repo root, then `index.html` was rewritten to reference the files. The CMS image widget can now upload replacements without manual base64 fiddling. Removes ~310 KB of base64 bloat from the served HTML — pages-served size shrinks accordingly, and the browser can now lazy-load + cache the images independently.

**New JSON sources.**
- `wristband.json` — `label`, `title`, `description`, `warning` (optional), `image`, `image_alt`.
- `featured-group.json` — `label`, `name`, `tagline` (optional), `description`, `details` list (each row has `icon` / `heading` / `body`), `house_image`, `house_image_alt`.

**New sync scripts.** `sync-wristband.py` regenerates the whole `<section class="wristband-section">` block; `sync-featured-group.py` regenerates the whole `<section class="dtb-section">` block (CSS class kept for styling continuity even though the section is now group-agnostic). Both wired into the existing content-sync workflow next to `sync-cta.py`. Both idempotent — running them against the live HTML produces zero diff if the JSON matches.

**CMS UX.** The Featured Group's detail rows are a draggable list (same pattern as the About section's detail rows) so admins can add/remove rows freely — e.g. add a third detail for "Streaming Schedule" without a code change. The optional `tagline` and `warning` fields render conditionally: leave them blank in the CMS and the corresponding HTML element is omitted entirely (no empty pill).

### Site v0.13.1 — 2026-04-27

Hero CTA buttons updated + made editable in the CMS.

**Live changes on the homepage:**
- **Top button** (in the hero): was *"RSVP on Insta (Link in Bio)"* → instagram.com/our.empire. Now reads **"CLICK HERE TO RSVP"** and links to the Evernote RSVP note (`lite.evernote.com/note/50fb8d35-...`).
- **Bottom button** (in the "Ready to Join Empire X?" footer): was *"Click Here to RSVP →"* → Evernote share link. Now reads **"Official Instagram"** and links to instagram.com/our.empire. The two buttons effectively swapped roles.

**CMS — new "CTA Buttons" collection.** Both buttons are now editable in `/admin/`. New `cta.json` holds `top_button` and `bottom_button`, each with a `text` field and a `url` field. New `sync-cta.py` is wired into the existing content-sync workflow — saving in Decap regenerates the two anchors in `index.html` ~30s later. Each anchor got a stable hook class (`hero-cta-top` / `hero-cta-bottom`) so the regex replacement always targets the right one regardless of class order.

External URLs auto-open in a new tab (`target="_blank" rel="noopener"`). Same-origin paths starting with `/` open in the same tab. Pattern validation requires either a full http(s) URL or a `/...` path so the admin can't accidentally save a bare-string URL.

### Site v0.13.0 — 2026-04-26

(Inherited from the shared-version scheme. No content changes — last meaningful update was the SEO/Decap CMS work in earlier v0.x.)

---

### v0.13.0 — 2026-04-26

### v0.13.0 — 2026-04-26

Minor — first iteration on the runner. **Title is now "ON BABY!"** Audio is in. Lanes bumped to 5. Background actually feels like it's moving now.

- **Renamed game** to "On Baby! — an EmpireX runner". Title screen, page title, OG/Twitter share metadata all updated. URL stays `/run/` so existing links don't break.
- **5 lanes** (was 3). Mike + obstacles scaled down ~15% so things still fit comfortably per lane. Mike now starts in lane 2 (true center of 5).
- **Procedural background overhaul.** Previously the world only scrolled left-right via a slow horizontal panorama drift, which made the road feel static. Now the road has:
    - **Sidewalk strips** on both edges with periodic darker tiles (manhole-grate look) scrolling DOWN
    - **Crosswalks** every 1100 px of distance traveled — 7-stripe white painted bars across the asphalt, scrolling DOWN
    - **Dashed lane dividers** that scroll DOWN at speed (instead of being static) by binding `lineDashOffset` to `state.distancePx`
    - Skyline panorama at top kept but slowed to a subtle ambient drift (1/3 the previous rate) so it's not the dominant motion cue anymore
- **Audio system** with 3 logical channels (Music / SFX / Dialogue), each with its own volume slider, a per-channel mute, and a master mute. State persists via `localStorage` key `runner-audio-mixer-v1`. Adjusting a slider auto-unmutes that channel (familiar UX from media players).
- **Audio events wired:**
    - Random background-music track (one of `bg-music-atacama` / `bg-music-charango-1` / `bg-music-charango-2`) starts on **START** and loops
    - `mob-angry` plays as a quiet looping ambient under the music while running
    - `damage.mp3` plays on each non-fatal hit
    - On the fatal hit: background music + mob ambient stop, `death.mp3` plays, then `death-gameover.mp3` queued 600 ms later for the game-over screen
    - `ice-neck.mp3` and `punch-phone-snatch.mp3` are loaded but not yet wired (waiting on Ice-Poseidon and phone-thief mechanics in v0.14)
- **`run/ART_SPECS.md`** — written-down specs for what to send next: vertical-tiling road tile (1024×2048, top-bottom seamless), drop-in scenery props, replacement skylines, character sprite-sheet rules. Future art generation can use this as a reference so what comes back is drop-in usable.

### v0.12.0 — 2026-04-26

Minor — **EmpireX Runner** is now playable at [ourempirex.com/run/](https://ourempirex.com/run/). First v0.1.

The game: SkiFree-style endless runner. Mike Smalls Jr (front-facing, animated 8-frame run cycle) stays at the bottom-center of the screen. Stream snipers and pedestrians (NPCs from the v0.11 extraction) spawn at the top in one of 3 lanes and slide down toward Mike. Cx coins spawn in the gaps for a score multiplier (1× → 2× at 6 coins → 3× at 16 coins). Player taps left/right or uses arrow keys to dodge between lanes. Three hits and the mob "catches up" — game over.

Files added:

- **`run/index.html`** — single-page scaffold with full OG/Twitter share metadata (`/run/og-runner.jpg` will be generated next round), HUD overlay, start + game-over panels, URL caption + version display matching the `/game/` pattern.
- **`run/css/style.css`** — full-viewport canvas with crisp pixel-art scaling (`image-rendering: pixelated`), VT323-styled HUD, slide-in overlays. `touch-action: none` to suppress iOS double-tap-zoom so taps register as game input.
- **`run/js/index.js`** — vanilla-JS game (no framework), self-contained IIFE. Sections: config knobs, async sprite preloader, canvas + DPR-aware resize, keyboard + touch input, lane-shift lerp, AABB collision, spawn timer with difficulty ramp (speed grows 4 px/sec², capped at 900 px/sec), HUD updater, run/restart state machine. ~28 sprites preloaded.

Mechanics live in v0.1 but rough — speed-ramp is conservative, no audio yet, no Ice Poseidon side-kick (he'll join in v0.13), no phone-thief side attacks, no save-as-PNG share button. Game-over is "3 hits and out" rather than the eventual mob-catches-up-when-you-fall-behind dynamic. Plenty of room to iterate, but the core loop is in.

### v0.11.1 — 2026-04-26

Patch — runner asset library expanded with NPCs and mob crowd backdrops.

- **Three new NPC sprite sheets extracted** into individual frames (53 new sprites, 131 total now):
    - `npc-grid` — 24 chibi pixel-art Chilean street pedestrians (flag-waver, vendor, grandma with yerba mate, baseball-cap dudes, etc.) — for individual obstacle/sniper spawns
    - `npc-pedestrian` — 14 illustrated pedestrian frames (hoodie dude × 4 walking, woman in red × 4, hoodie dude × 4 **reaching forward** — the reaching pose is exactly the phone-thief animation)
    - `npc-protester` — 15 protester poses with picket signs (FUCK ICE / WHERE'S ICE / Cx / ICE SCAMMED ME / ICE), plus "Reaching For Something" and "A Group Reaching" — these are the close-up named NPCs that spawn as the mob closes in
- **Pre-composed mob-crowd backdrops** added at `run/img/mob/`. These are full-frame compositions used as-is (no extraction) — they're the chasing-mob-behind-the-player layer:
    - `mob-fuckice-01..03` — three sheets of running mobs holding parody picket signs (FUCK ICE / WHERE'S ICE / Cx)
    - `mob-dignidad-01` — mob with DIGNIDAD / CHILE UNIDO signs (more politically-themed mob)
    - `mob-vivachile-01..03` — VIVA CHILE / PURO CHILE patriotic crowd
    - `mob-dense-01..02` — pure crowd density without signs (good for a deeper background layer)
- **Extractor enhancements:**
    - Per-source `min_area` override added to SOURCES so sheets with much smaller sprites (the 24-NPC chibi grid is ~140 px wide vs Mike's ~400 px) work without lowering the global threshold and re-introducing noise on the bigger sheets
    - Background detection still auto-handles black, white, and now grey-grid (rgb 207,209,208) sources without per-source config

### v0.11.0 — 2026-04-26

Minor — kicked off the **EmpireX Runner** mini-game (`/run/`). Asset-pipeline scaffold + first round of extracted character sprites. No playable game yet — that's the next round.

The premise: a SkiFree-style endless-runner parody of IRL streaming culture. Mike Smalls Jr runs downhill through a Chilean street, dodging stream snipers and phone thieves. Ice Poseidon shows up partway through as a side-kick (his neck literally stretches to flag down the player), and from then on auto-collects Cx coins which act as a score multiplier.

What landed in this commit:

- **`run/` scaffold** — `concept/`, `img/sprites/`, `img/bg/`, `audio/`, `css/`, `js/` directories.
- **`.github/scripts/extract-runner-sprites.py`** — turns the 5 raw concept-art reference sheets (Mike runs, Mike actions, Mike combat, Ice Poseidon all-poses, Cx coin) into 78 clean per-frame PNGs. Auto-detects black-vs-white background per sheet so we don't have to special-case anything. Bottom-aligns every sprite within a per-source standardized canvas — that's the trick that stops AI-generated frames from jittering vertically when played as an animation cycle.
- **`.github/scripts/build-runner-contact-sheet.py`** — generates `run/img/sprites-contact-sheet.png`, a labeled grid of all 78 extracted sprites grouped by role (mike-run, mike-action, mike-combat, ice, cx-coin). Quick visual QA tool — rerun any time the extractor changes.
- **`run/img/sprites/`** — 78 game-ready PNGs:
    - 12 Mike run-cycle frames
    - 9 Mike action poses (idle/surprised/kick/roll/uppercut)
    - 18 Mike combat frames (run cycles + cartwheel/flip/combat moves)
    - 29 Ice Poseidon poses (idle/run/neck-stretch/action moves)
    - 10 Cx coin frames (8-frame spin + 2 collect-effect frames; the rest of the collect particles will be done procedurally in code)
- **`run/img/bg/`** — 5 background scenes (4 ChatGPT-generated street/runner compositions + 1 4128×1024 panorama for parallax scrolling).
- **`.gitignore` update** — excludes `run/img/bg/concept-pano/` so the 13 panorama-bg variations (~59 MB total) don't ship with the public repo. They live locally for future swap-ins.

### v0.10.17 — 2026-04-26

Patch — PNG export crop, take 2.

- Switched the export from "capture full body, post-crop" to "tell `html2canvas` exactly what region to capture." The previous approach computed a crop rectangle in CSS pixels and applied it after capture; if `devicePixelRatio` or the body-vs-viewport width didn't line up the way I expected, the math drifted and side strips leaked back into the output. Passing `x` / `y` / `width` / `height` directly to `html2canvas` removes that whole class of mismatch — the returned canvas already contains only the slot region.
- The side-bar width is now read from `getComputedStyle(viewport, '::before').width` rather than guessed from a media query, so a future tweak to the side-bar `%` won't desync the export.
- The purple top bar is now exactly the width of the captured region (which is exactly the width of the visible slot), so there can't be a wider band than the slot underneath.

### v0.10.16 — 2026-04-26

Patch — PNG export now crops the side black bars too.

- **Save-as-PNG output is now cropped horizontally to the visible slot window.** Previously the export captured the full body width, including the wide black bars on the left and right of the slot (the `.viewport:before` / `:after` strips that frame the playfield). The exported image now starts at the left edge of the leftmost reel and ends at the right edge of the rightmost reel, matching what the slot actually looks like in the playable view.
- The crop reads the same breakpoint the CSS uses (20% side bars on desktop, 5% on mobile via `(max-width: 768px)`) so the export math stays in sync with the visual.
- The branded purple top bar above the slot now matches the cropped width too — no more purple band stretching past the slot edges.

### v0.10.15 — 2026-04-26

Patch — Open Graph / Twitter share metadata for the `/game/` page.

- **`/game/` now has full social-share metadata.** Previously, sharing `ourempirex.com/game` to Discord, iMessage, Slack, Facebook, X, etc. produced a bare-URL preview with no image and no description. Now the unfurler picks up a proper title (`EmpireX Slots — Tap to Spin`), a one-line description, and a 1200×630 preview image showing the slot in a winning state with the top-prize face inside the white frame and `OUREMPIREX.COM/GAME` underneath.
- **`game/og-game.jpg`** — generated 1200×630 share image, mirrors the in-page look (black background, white-bordered slot, purple interior, brand caption). Built by a new script.
- **`.github/scripts/build-game-og.py`** — Pillow-based generator that loads `1symbol-a.png`, cover-fits it inside the slot frame, draws the EMPIREX SLOTS eyebrow + URL caption. Falls back to bundled system fonts (Arial/Helvetica/DejaVu) so it runs anywhere without a custom TTF dependency. Re-run any time the top-prize face changes.
- **`canonical`, `description`, `author`, `version`, OG, and Twitter Card tags added to `game/index.html`** alongside the existing `noindex` (the page itself stays out of Google search results, but social-card unfurlers read the OG tags directly so previews still work).

### v0.10.14 — 2026-04-25

Patch — removed the dev-mode panel.

- The `?dev=1` panel (force-win buttons + reset) was a temporary debugging aid for the slot iteration; pulled it out now that the game is dialed in. Removed the HTML element, CSS rules, JS handler, and the `closest('.dev-panel')` guard from the body click handler. Also removed the `window.__app` expose hook that the dev panel relied on, and simplified the export onclone hide list.

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
