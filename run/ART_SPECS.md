# Art specs — what to send for the runner game

When you generate new art, follow these specs and the in-game integration is a one-line change for me. Drop everything in `run/concept/` (sprite sheets) or `run/img/bg/` (already-final environment art) — name doesn't matter, I'll rename + extract.

---

## Backgrounds — the biggest open need

The current background is procedural (drawn with code: asphalt, dashed lane lines, scrolling crosswalks, sidewalk grates). It works but it's plain. The Chile-flavored panorama at the top is the main visual anchor.

To replace the procedural road with proper art, the cleanest deliverable is:

### Option A — vertical-tiling road strip (best ROI)
- **Dimensions:** 1024 × 2048 px (or any aspect that's at least 2× as tall as it is wide)
- **Format:** PNG with NO transparency
- **Top-bottom seamless tile:** the very top edge MUST match the very bottom edge so it can repeat infinitely as it scrolls. This is the critical requirement. Test: stack two copies vertically — there should be no visible seam.
- **Content:** a top-down view of a Chilean street. Should include:
  - 5 lanes of asphalt (centered, taking ~85% of the width)
  - Yellow dashed lane dividers (4 dividers between the 5 lanes)
  - Sidewalks on both sides (~7% of width each)
  - Periodic features baked into the tile: crosswalks, manhole covers, painted symbols, cracks, oil stains, leaves
- **Perspective:** straight top-down (no vanishing point) — keeps the obstacles' shadows consistent regardless of scroll position
- **Style:** match the existing pixel-art / illustrated mix already in the repo. Daylight version + night version are both useful.

If you generate one, name it `bg-road-tile.png` and drop in `run/img/bg/` — I'll wire it up.

### Option B — environment landmarks that fly past (drop-in art)
Smaller scenery elements that scroll down the sidewalk areas: vendor stalls, palm trees, food carts, bus stops, payphone booths, graffiti walls, parked cars.
- **Each element:** transparent-background PNG, ~300×400 px
- **Perspective:** top-down or 3/4 view, must be readable at small size
- **Drop in `run/concept/` named `prop-vendor.png`, `prop-palmtree.png`, etc.**

I'll spawn these randomly along the sidewalks the same way obstacles spawn in the lanes.

### Option C — sky/skyline replacements
The current `bg-chile-pano.png` is a 4128×1024 panorama at the top of the screen. If you want to add variety:
- **Dimensions:** 4128×1024 (same aspect to drop-in replace)
- **Format:** PNG, no transparency
- **Content:** wide-shot Chilean cityscape, hills, ocean, etc.
- **Drop several** — I'll cycle them or pick at random per run

---

## Character sprite sheets

Same flow as the existing 5 source sheets in `run/concept/`. Critical rules for AI image-gen prompts:

1. **Solid background** — pure black `#000000` OR pure white `#FFFFFF`. Anything else and my background-detection breaks.
2. **Same scale across frames** — for animation cycles, the character must be identical size + proportions in every frame. Only the pose changes.
3. **Feet at consistent Y** — when generating a run cycle, the feet should land on the same horizontal line in every frame.
4. **Multiple poses on one sheet are fine** — my extractor auto-detects each pose by connected pixel groups.

### Specific characters / sheets I'd love next

- **More mob NPC sniper variants** — anything different from the existing 24 chibi pixel-art NPCs. Especially: people on phones recording, people pointing/yelling, kids on bikes, dudes with backpacks
- **Phone-thief animation set** — already partially covered by `npc-pedestrian` reaching frames, but a dedicated 4-frame "sprint diagonally at the player" cycle would be cleaner for the side-attack mechanic
- **Mike doing a swat / push animation** — for defending against phone thieves (a 3-4 frame cycle of him swinging an arm forward)
- **Mike doing an "OH SHIT" reaction** — for big near-misses or hit reactions
- **Game-over scene art** — Mike on the ground surrounded by mob hands grabbing his phone, single illustrated frame ~1200×800

---

## Audio

Drop in `run/audio/`. Filenames I'll auto-pick up if they match these conventions:

- `bg-music-*.mp3` — looping background music tracks (current: 3 tracks, picks one randomly per run)
- `damage.mp3` — Mike takes a hit
- `death.mp3` — Mike's last life lost
- `death-gameover.mp3` — game-over screen sting
- `mob-angry.mp3` — looping background mob noise during play
- `mob-argue.mp3` — game-over situational
- `punch-phone-snatch.mp3` — phone-thief swat (deferred mechanic)
- `ice-neck.mp3` — Ice Poseidon's neck-stretch dialogue cue (deferred mechanic)

Other audio is welcome — just tell me the trigger ("play this when the multiplier increases", "play this on lane shift", etc.) and I'll wire it.

---

## What you DON'T need to do

- Mask sprites against transparent backgrounds — my extractor does that
- Resize to specific pixel dimensions per sprite — extractor standardizes per sheet
- Worry about consistent character size *across* sheets — only within a single sheet matters
