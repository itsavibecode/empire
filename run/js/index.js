/*
 * EmpireX Runner — v0.12.0 first playable build.
 *
 * SkiFree-style endless runner. Mike Smalls Jr (front-facing run cycle)
 * stays at the bottom-center of the screen. Obstacles (stream snipers,
 * pedestrians, protesters) spawn at the top in one of 3 lanes and slide
 * down toward Mike. Cx coins spawn between obstacles for score
 * multiplier. Player taps left/right (or arrow keys) to shift Mike
 * between lanes. 3 hits → mob catches up → game over.
 *
 * Future passes (deferred from v0.1):
 *   - Ice Poseidon side-kick (joins partway, auto-collects coins,
 *     neck-stretches when met)
 *   - Phone-thief side-attack mechanic with swat-to-defend
 *   - Mob backdrop layer scrolling at the top of the playfield
 *   - Audio (drop-in pattern from slot game)
 *   - Difficulty curves, level checkpoints
 *   - Save-as-PNG share button for high scores
 */

(function () {
  'use strict';

  // ============================================================
  // Config — all the gameplay knobs in one place for easy tuning.
  // ============================================================
  var LANES = 5;                   // 5-lane runner (more lateral choice)
  var STARTING_LANE = 2;           // dead center of 5
  var SPEED_INITIAL = 360;         // px/sec downward scroll at start
  var SPEED_GROWTH = 4;            // px/sec added per second of survival
  var SPEED_MAX = 900;             // cap so it doesn't become impossible
  var SPAWN_INTERVAL_INITIAL = 0.9; // seconds between spawn checks at start
  var SPAWN_INTERVAL_MIN = 0.35;   // minimum spawn interval (hardest)
  var COIN_SPAWN_PROBABILITY = 0.6; // chance of coin spawn alongside obstacle
  var PICKUP_SPAWN_PROBABILITY = 0.06; // chance of a special pickup per spawn cycle
  var LIVES_INITIAL = 3;
  var LIVES_MAX = 5;
  // Bonus durations (ms)
  var HAM_FREEZE_MS = 600;          // Mario-1UP freeze on ham pickup
  var HAM_BONUS_MS = 6500;          // coin shower window
  var WEED_DEBUFF_MS = 10000;       // slow + red tint duration
  var HORSE_BOOST_MS = 8000;        // 8 sec horse-ride speed boost
  var HORSE_SPEED_MULT = 1.7;       // world scroll multiplier during horse ride
  var INVULN_TIME = 1.2;           // seconds of i-frames after a hit (flashes Mike)
  // STONED CHASE — when Mike grabs a weed pickup AND distance is past
  // the threshold, 2-4 cop officers spawn behind him and trail upward
  // for the duration of the weed debuff. Pure visual flavor (no
  // collision — the weed already debuffs Mike enough). Reads as the
  // city catching up on Mike for being high in public.
  var STONED_CHASE_START_DISTANCE_M = 1500;  // first stoned chase eligible at this distance
  var STONED_CHASE_MIN_OFFICERS = 2;
  var STONED_CHASE_MAX_OFFICERS = 4;
  var STONED_CHASE_OFFICER_HEIGHT_FRAC = 0.16;  // sprite height as frac of viewport
  var STONED_CHASE_FRAME_MS = 140;             // walk-cycle frame swap cadence
  // Pool of distinct officer "characters" each defined by 2 frames
  // alternated for a walk cycle. Picked across the source sheet rows
  // so different officers have different poses, body shapes, and
  // facing directions — avoids the "army of clones" look when 4
  // officers all spawn at once. Each spawned chase officer randomly
  // picks one entry from this pool and stays on it for its lifetime.
  // Curated list — frames 06 + 11-15 of the source sheet have head-cropped
  // or sliced cop bodies (extraction artifact: cells captured 1.5 sprites
  // each from a misaligned grid). Excluded entirely until that sheet gets
  // re-extracted. 07-10 still have a faint ghost-outline shadow below
  // the cop but the head + body are intact, so they stay in the pool.
  var COP_OFFICER_VARIANTS = [
    ['cop-officer-07', 'cop-officer-08'],   // row 2 char A — profile walk
    ['cop-officer-09', 'cop-officer-10'],   // row 2 char B — profile walk
    ['cop-officer-02', 'cop-officer-04'],   // row 1 — different chars/poses
    ['cop-officer-01', 'cop-officer-05'],   // row 1 — narrower frames (front?)
    ['cop-officer-03', 'cop-officer-04'],   // row 1 — extra alt
  ];

  // HURRICANE / WATER SEGMENT — periodically the road ENDS at a cliff
  // and Mike is washed onto the open sea on a mattress raft. Lasts a
  // total of ~15 seconds split into:
  //   ENTERING (~2.5s): the cliff-edge tile scrolls up past Mike
  //   WATER    (~10s):  alternating sea tiles + lightning + rain +
  //                     Mike on his mattress; NO obstacles or pickups
  //   EXITING  (~2.5s): boat-ramp tile scrolls up; back to street
  //
  // FIRST DISTANCE BUMPED 1200 -> 4500 per playtest so the established
  // Ice arc plays out FIRST, then the water cutscene serves as the
  // narrative resolution where Mike finally escapes Ice into the storm:
  //   600m:  first-meet      (Ice joins)
  //   2000m: mike-tells-off  (Ice leaves)
  //   3800m: ice-returns     (Ice rejoins trailing)
  //   4500m: before-water    (Ice asks weird question -> Mike floats off alone)
  //   8000m: water (no cutscene, Ice already gone)
  //   ... every 3500m after
  var WATER_FIRST_DISTANCE_M = 4500;
  var WATER_INTERVAL_M = 3500;
  var WATER_ENTER_MS = 2500;
  var WATER_BODY_MS = 14000;  // bumped from 10000 to give the Shoovy boat enough time to approach Mike before the body times out
  var WATER_EXIT_MS = 2500;
  var WATER_TOTAL_MS = WATER_ENTER_MS + WATER_BODY_MS + WATER_EXIT_MS;
  var WATER_LIGHTNING_INTERVAL_MS = 1700;  // average gap between flashes
  var WATER_LIGHTNING_INTERVAL_JITTER_MS = 1100;
  var WATER_LIGHTNING_FLASH_MS = 110;      // duration of each white flash
  var WATER_RAIN_DROPS = 220;              // active raindrops on screen
  // Shoovy mid-water sequence: boat approaches Mike from screen bottom
  // halfway through the water body, triggers a cutscene when close.
  var SHOOVY_BOAT_SPAWN_MS = 2500;          // 2.5s into the body — gives time for the boat to approach
  var SHOOVY_BOAT_HEIGHT_FRAC = 0.32;       // sprite height as frac of viewport (boat is BIG)
  var SHOOVY_BOAT_VY = 150;                 // px/sec UP toward Mike — fast enough to reach the trigger Y before body ends
  var SHOOVY_BOAT_TRIGGER_Y_FRAC = 0.45;    // when boat top reaches this Y frac, fire cutscene
  // v0.18.59 — replaced the old shoovy-sail-* set with the cleaner
  // Puffin sheets (extract-shoovy-puffin.py, 88 frames). Frames 13
  // and 14 are the front-facing standing variant (Shoovy gripping
  // the mast as he sails AT the camera) — reads better than the
  // side-view sail-* set when he's supposed to be APPROACHING Mike.
  // 2-frame breathe at 280ms gives a calm "drifting toward you" feel.
  var SHOOVY_BOAT_FRAMES = ['shoovy-puffin-13', 'shoovy-puffin-14'];
  var SHOOVY_BOAT_FRAME_MS = 280;

  // BACKGROUND FAUNA — pigeons/cats/dogs/goats walking the sidewalks.
  // Pure ambient visuals, no collision. Spawn on the LEFT or RIGHT
  // sidewalk strip (the 7% margin outside the 5 driving lanes), scroll
  // up with the world at the same speed as obstacles. Each spawn picks
  // a random sprite from the type's frame pool for visual variety.
  var FAUNA_SPAWN_MIN_MS = 2200;
  var FAUNA_SPAWN_MAX_MS = 5500;
  var FAUNA_TYPES = [
    // weight = relative spawn frequency
    { kind: 'pigeon', framePrefix: 'pigeon-', frameCount: 12, heightFrac: 0.06, weight: 4, bobAmp: 4 },
    { kind: 'cat',    framePrefix: 'cat-',    frameCount: 16, heightFrac: 0.09, weight: 3, bobAmp: 3 },
    { kind: 'dog',    framePrefix: 'dog-',    frameCount: 16, heightFrac: 0.10, weight: 3, bobAmp: 5 },
    { kind: 'goat',   framePrefix: 'goat-',   frameCount: 16, heightFrac: 0.11, weight: 1, bobAmp: 4 },
  ];
  // CROSS TRAFFIC — overhead-view cop cars that drive across the screen
  // perpendicular to Mike's lane. Per playtest: should be RARE
  // (telegraphed event, not constant pressure) and READABLE — the car
  // does a feint-swerve (out-then-back) so the player has time to
  // judge whether it's actually coming for them. Mike can also JUMP
  // over them (jumpAvoid).
  //
  // Spawn cadence: lerps from FAR (early) -> NEAR (peak intensity)
  // over CROSS_CAR_RAMP_M meters. With these values you get one every
  // 18s at 1500m -> one every 8s once you're past 5500m+.
  var CROSS_CAR_START_DISTANCE_M = 1500;
  var CROSS_CAR_SPAWN_MS_FAR = 18000;       // one every ~18s at threshold
  var CROSS_CAR_SPAWN_MS_NEAR = 8000;       // one every ~8s at peak
  var CROSS_CAR_RAMP_M = 4000;
  var CROSS_CAR_SPEED = 950;                // px/sec horizontal velocity (slowed slightly so feint reads)
  var CROSS_CAR_HEIGHT_FRAC = 0.18;         // sprite height as frac of viewport
  var CROSS_CAR_FRAME_MS = 110;             // R/B light flash cadence
  // Feint mechanic: when the car's X position gets within
  // SWERVE_TRIGGER_PX of Mike's lane, it deviates AWAY from Mike's Y
  // for the first half of SWERVE_DUR_MS, then SWERVES BACK toward
  // collision path for the second half. Total Y deviation peaks at
  // SWERVE_AMPLITUDE_FRAC * viewH() at the midpoint.
  var CROSS_CAR_SWERVE_TRIGGER_PX = 520;
  var CROSS_CAR_SWERVE_DUR_MS = 700;
  var CROSS_CAR_SWERVE_AMPLITUDE_FRAC = 0.07;
  // PHONE THIEF — when a "walk-reaching" pedestrian collides with Mike,
  // they snatch the selfie stick. Steals coins, reverses controls
  // briefly, and sprays a particle burst of coins flying outward.
  var PHONE_THIEF_COINS_LOST = 10;       // coins drained from the stash
  var PHONE_THIEF_REVERSED_MS = 3000;    // 3s of inverted left/right input
  var PHONE_THIEF_PARTICLE_COUNT = 10;   // one coin sprite per stolen coin
  var JUMP_DURATION = 0.7;         // total seconds for a full jump arc
  var JUMP_HEIGHT_FRAC = 0.18;     // peak jump height as fraction of viewH
  // Ice side-kick — once joined (post-cutscene), Ice runs alongside
  // Mike at this lateral pixel offset and auto-grabs nearby coins.
  var ICE_OFFSET_X_FRAC = 0.13;    // distance from Mike's center, as fraction of viewport width
  var ICE_REACH_PX = 130;          // coin pickup radius around Ice
  var ICE_NECK_STRETCH_MS = 700;   // duration of neck-stretch animation per coin grab
  var ICE_COIN_BONUS = 0.5;        // bonus per Ice-collected coin (counts as 0.5x toward total)
  var ICE_HEIGHT_FRAC = 0.27;      // Ice's run-cycle height as fraction of viewH (taller than Mike's 0.17)

  // XENA THE WITCH — anti-sidekick. Activates when Mike picks "BAIL
  // XENA INSTEAD" in the jail dialogue (v0.18.52 phase C). She trails
  // Mike like Ice, but instead of GRABBING coins for him, she STEALS
  // them so Mike can't have them. Same idea applies to Weed pickups
  // (per spec — her hostility cluster). Detection radius and steal
  // probability tuned conservatively so she's annoying without being
  // run-ending. User feedback may push these later.
  var XENA_OFFSET_X_FRAC   = 0.13;   // mirrors Ice — typically the OPPOSITE side
  var XENA_REACH_PX        = 250;    // detection + grab radius (per user spec)
  var XENA_STEAL_PROB      = 0.30;   // 30% chance per pass through her radius
  // Per user feedback (v0.18.54): Xena was way too tall at Ice's
  // height (0.27). Pulled to 0.20 — only slightly taller than Mike
  // (0.17) so she reads as a regular-sized person trailing him
  // instead of a giantess looming over him.
  var XENA_HEIGHT_FRAC     = 0.20;
  var XENA_FRAME_MS        = 110;    // walk-cycle frame duration
  // Per user feedback (v0.18.58) — bumped from 350 to 700ms so the
  // celebration reads more clearly. drawXena pulses the shadowBlur
  // over this window for a "twinkle" instead of a static halo.
  var XENA_GRAB_FLASH_MS   = 700;

  // Sprite drawing — these are scale factors for the source PNGs.
  // Source sprites are ~700px tall (Mike) so scale aggressively for
  // a normal-sized player on screen. With 5 lanes each lane is narrower
  // so we shrink Mike a bit so he visually fits inside one lane.
  var PLAYER_TARGET_HEIGHT_FRAC = 0.17;  // Mike = 17% of canvas height
  var OBSTACLE_TARGET_HEIGHT_FRAC = 0.14;
  var COIN_TARGET_HEIGHT_FRAC = 0.06;

  // Procedural background — periodic features that scroll past so the
  // road feels alive instead of just being scrolling stripes.
  var CROSSWALK_INTERVAL_PX = 1100;  // pixels of distance between crosswalks
  var SIDEWALK_DETAIL_INTERVAL_PX = 350; // pixels between manhole/grate tiles

  // PICKUP TYPES — special bonus/debuff items that spawn occasionally.
  // Each cycles through `frames` at `frameMs`. `kind` drives the effect
  // applied on collision.
  // Build frame lists from sprite naming convention
  function _seq(prefix, n) {
    var out = [];
    for (var i = 1; i <= n; i++) out.push(prefix + (i < 10 ? '0' + i : i));
    return out;
  }
  // Variant for sprite series whose frame number is NOT zero-padded
  // (e.g. npc-runner-01-1.png ... npc-runner-01-6.png).
  function _seqDash(prefix, n) {
    var out = [];
    for (var i = 1; i <= n; i++) out.push(prefix + i);
    return out;
  }
  var PICKUP_TYPES = [
    // HAM — short freeze + coin shower + chipmunk music. 7-frame spin.
    { kind: 'ham',  frames: _seq('ham-spin-', 7),    frameMs: 90,  weight: 3 },
    // 400 — instant +1 life. 20-frame spin (very smooth).
    { kind: 'h400', frames: _seq('h400-spin-', 20),  frameMs: 60,  weight: 1 },
    // WEED — debuff (slow + red tint). 16-frame spin.
    { kind: 'weed', frames: _seq('weed-spin-', 16),  frameMs: 70,  weight: 2 },
    // HORSE — 8-sec speed boost. Static icon (will replace with proper
    // spinning sheet later). Mike's run-cycle gets temporarily swapped
    // for the horse-riding sprite during the boost window. Renders at
    // its OWN scale (heightFrac 0.22) instead of the standard pickup
    // size — it's a horse, not a bag of weed, so it should read at
    // approximately Mike's full standing height when sitting on the
    // sidewalk, not as a tiny floating icon.
    { kind: 'horse', frames: ['horse-icon'],         frameMs: 0,   weight: 1, heightFracOverride: 0.22 },
  ];
  var PICKUP_TARGET_HEIGHT_FRAC = 0.09;

  // Animation cadence — milliseconds per run-cycle frame.
  var RUN_FRAME_MS = 80;
  var COIN_FRAME_MS = 75;

  // ============================================================
  // Sprite catalog — paths relative to /run/.
  // ============================================================
  var SPRITE_PATHS = {};
  // Mike's run cycle uses frames 1-8 (the clean front-facing cycle).
  for (var i = 1; i <= 8; i++) {
    var k = 'mike-run-' + (i < 10 ? '0' + i : i);
    SPRITE_PATHS[k] = 'img/sprites/' + k + '.png';
  }
  // Coin spin uses all 8 spin frames.
  for (var c = 1; c <= 8; c++) {
    var ck = 'cx-coin-' + (c < 10 ? '0' + c : c);
    SPRITE_PATHS[ck] = 'img/sprites/' + ck + '.png';
  }
  // Obstacle TYPES — each entry is one kind of street-person/vehicle
  // spawn, either an animated cycle or a single static frame.
  //   `jumpOnly: true` marks an obstacle that cannot be dodged by lane
  //   shift — the player must JUMP over it. Used for vehicles (cop car)
  //   that block an entire lane and would be visually weird to side-step.
  // bottomCropFrac trims the bottom N% of each sprite at render time
  // to hide the ground-shadow ellipse baked into most NPC + vehicle
  // art. Same trick the Ice side-kick uses (srcCropFrac there).
  // Default is 0 (no crop); per-type overrides applied below.
  var OBSTACLE_TYPES = [
    // Walking pedestrians — sprites are clean (no ground shadow), so
    // bottomCropFrac was lowered from 0.06 to 0 in v0.18.51 (the crop
    // was slicing the shoes off).
    { id: 'walk-hoodie',  frames: ['npc-pedestrian-01','npc-pedestrian-02','npc-pedestrian-03','npc-pedestrian-04'], frameMs: 160, bobPx: 22 },
    { id: 'walk-woman',   frames: ['npc-pedestrian-05','npc-pedestrian-06','npc-pedestrian-07','npc-pedestrian-08'], frameMs: 160, bobPx: 22 },
    // PHONE THIEF — reaching dude lunges for Mike's selfie stick.
    { id: 'walk-reaching', frames: ['npc-pedestrian-09','npc-pedestrian-10','npc-pedestrian-11','npc-pedestrian-12'], frameMs: 130, bobPx: 14, phoneThief: true },
    // PHONE THIEF (flipped) — same mechanic, mirrored sprite reaching
    // from the OPPOSITE side. Spawn pool now has phone-snatchers
    // attacking from BOTH directions.
    { id: 'walk-reaching-flipped', frames: ['npc-pedestrian-flipped-09','npc-pedestrian-flipped-10','npc-pedestrian-flipped-11','npc-pedestrian-flipped-12'], frameMs: 130, bobPx: 14, phoneThief: true },
    // RUNNING NPCs — proper 6-frame forward-facing run cycles. These
    // replaced the earlier static-protester + static-chibi entries
    // which were single-frame poses that needed bobPx fakery to look
    // alive. New sprites have actual animated leg movement, no ground
    // shadows, and a variety of Chilean character types (drunkard,
    // granny, sports fans, flag wavers, cowboys, punks).
    // Picked 8 visually distinctive characters across the 7 source
    // sheets — extracted via extract-npc-runners.py.
    { id: 'npc-runner', frames: _seqDash('npc-runner-01-', 6),  frameMs: 110, bobPx: 0 },
    { id: 'npc-runner', frames: _seqDash('npc-runner-02-', 6),  frameMs: 110, bobPx: 0 },
    { id: 'npc-runner', frames: _seqDash('npc-runner-03-', 6),  frameMs: 110, bobPx: 0 },
    { id: 'npc-runner', frames: _seqDash('npc-runner-04-', 6),  frameMs: 110, bobPx: 0 },
    { id: 'npc-runner', frames: _seqDash('npc-runner-14-', 6),  frameMs: 110, bobPx: 0 },
    { id: 'npc-runner', frames: _seqDash('npc-runner-15-', 6),  frameMs: 110, bobPx: 0 },
    { id: 'npc-runner', frames: _seqDash('npc-runner-16-', 6),  frameMs: 110, bobPx: 0 },
    { id: 'npc-runner', frames: _seqDash('npc-runner-25-', 6),  frameMs: 110, bobPx: 0 },
    // COP CAR — jump-only. Animates through 4 light-bar variants at
    // 180ms for R-B-R-B flashing. Previously had bottomCropFrac 0.12
    // to hide an iso ground-shadow, but the chroma-keyed sprites are
    // clean — that 12% crop was eating the front/rear bumper curves
    // and the wheels, leaving the car looking horizontally guillotined.
    { id: 'cop-car', frames: ['cop-car-01','cop-car-02','cop-car-03','cop-car-04'], frameMs: 180, bobPx: 0, jumpOnly: true },
  ];
  // Preload every sprite referenced by any obstacle type
  OBSTACLE_TYPES.forEach(function (t) {
    t.frames.forEach(function (k) {
      SPRITE_PATHS[k] = 'img/sprites/' + k + '.png';
    });
  });
  // Background skyline — wide panorama, drawn at top stripe of canvas.
  SPRITE_PATHS['bg-pano'] = 'img/bg/bg-chile-pano.png';
  // Vertical-tiling road (top-down view, ~1:2 aspect). Replaces the
  // procedural road-fallback when present. Multiple variants — picked
  // randomly per run for variety.
  for (var bgi = 1; bgi <= 4; bgi++) {
    SPRITE_PATHS['bg-road-' + bgi] = 'img/bg/bg-road-tile-' + bgi + '.png';
  }
  // Water/hurricane segment background tiles. The two pure-water tiles
  // (a + b) alternate within the scroll loop to fake animated waves.
  // Enter + exit are one-shot transition tiles bookending the segment.
  SPRITE_PATHS['bg-water-enter']  = 'img/bg/bg-water-enter.png';
  SPRITE_PATHS['bg-water-tile-a'] = 'img/bg/bg-water-tile-a.png';
  SPRITE_PATHS['bg-water-tile-b'] = 'img/bg/bg-water-tile-b.png';
  SPRITE_PATHS['bg-water-exit']   = 'img/bg/bg-water-exit.png';
  // Mike-on-mattress sprites — replace his run cycle during the water
  // segment. 12 frames; cycle through them slowly for the floating bob.
  for (var mm = 1; mm <= 12; mm++) {
    var mmk = 'mike-mattress-' + (mm < 10 ? '0' + mm : mm);
    SPRITE_PATHS[mmk] = 'img/sprites/' + mmk + '.png';
  }
  // Shoovy on his sailboat — used by the mid-water cutscene approach
  // animation. Preload the 4 specific frames the boat cycles through
  // (already extracted as shoovy-sail-XX.png). The full 32-frame set
  // is on disk; only the active subset gets cached on first paint.
  SHOOVY_BOAT_FRAMES.forEach(function (k) {
    SPRITE_PATHS[k] = 'img/sprites/' + k + '.png';
  });
  // v0.18.59 — sunset celebration sprite (Shoovy sailing into the
  // sunset post-water). Drawn from drawEffects when shoovySunsetUntil
  // is in the future.
  SPRITE_PATHS['shoovy-puffin-88'] = 'img/sprites/shoovy-puffin-88.png';
  // Shoovy's cutscene panels (4 frames including bonus blink)
  ['closed', 'mid', 'open', 'blink'].forEach(function (m) {
    SPRITE_PATHS['cutscene-shoovy-' + m] = 'img/cutscene-shoovy-' + m + '.png';
  });
  // Title-screen background art (Mike + Ice on Chilean street). Stored
  // as a JPEG (800 KB) instead of the 7 MB source PNG since it's a
  // photographic-style image that compresses fine without quality loss.
  SPRITE_PATHS['titlescreen'] = 'img/titlescreen.jpg';
  // Pickup item sprites (referenced by PICKUP_TYPES below)
  for (var hs = 1; hs <= 7; hs++) {
    var hk = 'ham-spin-' + (hs < 10 ? '0' + hs : hs);
    SPRITE_PATHS[hk] = 'img/sprites/' + hk + '.png';
  }
  for (var hh = 1; hh <= 20; hh++) {
    var hhk = 'h400-spin-' + (hh < 10 ? '0' + hh : hh);
    SPRITE_PATHS[hhk] = 'img/sprites/' + hhk + '.png';
  }
  for (var ws = 1; ws <= 16; ws++) {
    var wk = 'weed-spin-' + (ws < 10 ? '0' + ws : ws);
    SPRITE_PATHS[wk] = 'img/sprites/' + wk + '.png';
  }
  // Horse-riding sprite swaps (active during the HORSE pickup window).
  // Solo-Mike version pre-cutscene; Mike+Ice version post-cutscene.
  for (var mh = 1; mh <= 8; mh++) {
    var mhk = 'mike-horse-' + (mh < 10 ? '0' + mh : mh);
    SPRITE_PATHS[mhk] = 'img/sprites/' + mhk + '.png';
  }
  for (var mih = 1; mih <= 14; mih++) {
    var mihk = 'mike-ice-horse-' + (mih < 10 ? '0' + mih : mih);
    SPRITE_PATHS[mihk] = 'img/sprites/' + mihk + '.png';
  }
  // Horse pickup item icon — standalone horse (no rider) since the
  // player hasn't redeemed it yet. Was using mike-horse-05.png which
  // already showed Mike riding, breaking the "before pickup" fiction.
  SPRITE_PATHS['horse-icon'] = 'img/sprites/horse-pickup.png';
  // Ice Poseidon side-kick frames — preload all 29 from the source sheet
  // so the run cycle + neck-stretch animations have everything they need.
  for (var ic = 1; ic <= 29; ic++) {
    var ick = 'ice-' + (ic < 10 ? '0' + ic : ic);
    SPRITE_PATHS[ick] = 'img/sprites/' + ick + '.png';
  }
  // Xena The Witch sprites (v0.18.52 phase C) — anti-sidekick after
  // jail bail-out. 18 walk frames + 18 pose frames extracted from the
  // 2 Gemini sheets. We use a small subset for the run cycle.
  for (var xw = 1; xw <= 18; xw++) {
    var xwk = 'xena-walk-' + (xw < 10 ? '0' + xw : xw);
    SPRITE_PATHS[xwk] = 'img/sprites/' + xwk + '.png';
  }
  // Cutscene panels for the bail-Xena dialogue (3 mouth states matching
  // the existing closed/mid/open pattern used by Adin / Shoovy).
  ['closed', 'mid', 'open'].forEach(function (m) {
    SPRITE_PATHS['cutscene-xena-' + m] = 'img/cutscene-xena-' + m + '.png';
  });
  // Jail bg images (preloaded so the eye-blink swap doesn't flash white)
  SPRITE_PATHS['jail-bg-open']   = 'img/jail-bg-open.png';
  SPRITE_PATHS['jail-bg-closed'] = 'img/jail-bg-closed.png';
  // Cop car sprites (referenced by OBSTACLE_TYPES below). Preload
  // frames 01-04 — the cycle uses them in order for R/B/R/B
  // alternating-light animation.
  ['01', '02', '03', '04'].forEach(function (n) {
    SPRITE_PATHS['cop-car-' + n] = 'img/sprites/cop-car-' + n + '.png';
  });
  // Overhead-view cop car sprites — used by the new cross-traffic
  // obstacle that drives across the screen perpendicular to Mike's
  // run direction. Preload frames 01-04 for the same R/B alternating
  // light cycle.
  ['01', '02', '03', '04'].forEach(function (n) {
    SPRITE_PATHS['cop-overhead-' + n] = 'img/sprites/cop-overhead-' + n + '.png';
  });
  // Mike death sprites — 12 different game-over poses. Preloaded so a
  // random one can render instantly when the gameover overlay shows
  // (without an empty-image flash).
  for (var dk = 1; dk <= 12; dk++) {
    var dkk = 'mike-death-' + (dk < 10 ? '0' + dk : dk);
    SPRITE_PATHS[dkk] = 'img/sprites/' + dkk + '.png';
  }
  // Background fauna — preload all frames for each species so the
  // random-frame picker can pull instantly without a missing-sprite
  // flash. FAUNA_TYPES drives this list to keep the two in sync.
  FAUNA_TYPES.forEach(function (ft) {
    for (var fi = 1; fi <= ft.frameCount; fi++) {
      var fk = ft.framePrefix + (fi < 10 ? '0' + fi : fi);
      SPRITE_PATHS[fk] = 'img/sprites/' + fk + '.png';
    }
  });
  // Cop officer sprites — used by the stoned-chase mechanic. Preload
  // all 15 frames (extracted from the 5x3 source sheet) so the chase
  // walk-cycle picker has them ready the moment Mike grabs weed.
  for (var co = 1; co <= 15; co++) {
    var cok = 'cop-officer-' + (co < 10 ? '0' + co : co);
    SPRITE_PATHS[cok] = 'img/sprites/' + cok + '.png';
  }
  // Budgie sprites — perched on Mike's shoulder during cutscenes (DOM
  // overlay) AND on the title screen (canvas-rendered). Preload all 16
  // so both render paths can pick frames without flicker.
  for (var bg = 1; bg <= 16; bg++) {
    var bgk = 'budgie-' + (bg < 10 ? '0' + bg : bg);
    SPRITE_PATHS[bgk] = 'img/sprites/' + bgk + '.png';
  }
  // Seagull frames for animated title-screen flying birds (rows 3-4 of
  // the source sheet are the wings-spread flight poses).
  for (var sg = 9; sg <= 12; sg++) {
    var sk = 'seagull-' + (sg < 10 ? '0' + sg : sg);
    SPRITE_PATHS[sk] = 'img/sprites/' + sk + '.png';
  }

  // ============================================================
  // Audio catalog. Three logical channels — music, sfx, dialogue —
  // each with its own slider in the audio control panel. Volume
  // settings persist via localStorage.
  // ============================================================
  var AUDIO_DEFS = {
    'bg-music-atacama':    { src: 'audio/bg-music-atacama.mp3',    channel: 'music', loop: true },
    'bg-music-charango-1': { src: 'audio/bg-music-charango-1.mp3', channel: 'music', loop: true },
    'bg-music-charango-2': { src: 'audio/bg-music-charango-2.mp3', channel: 'music', loop: true },
    'damage':              { src: 'audio/damage.mp3',              channel: 'sfx' },
    'death':               { src: 'audio/death.mp3',               channel: 'sfx' },
    'death-gameover':      { src: 'audio/death-gameover.mp3',      channel: 'sfx' },
    'mob-angry':           { src: 'audio/mob-angry.mp3',           channel: 'sfx', loop: true },
    'mob-argue':           { src: 'audio/mob-argue.mp3',           channel: 'sfx' },
    'punch-phone-snatch':  { src: 'audio/punch-phone-snatch.mp3',  channel: 'sfx' },
    'ice-neck':            { src: 'audio/ice-neck.mp3',            channel: 'dialogue' },
    // v0.16 audio additions. Coin pack file used here instead of
    // coin-pickup.wav — reported inaudible and the pack version is
    // shorter (~80 ms) + louder, better for "rapid Cx grab" feedback.
    'coin-pickup':         { src: 'audio/Coins/MP3/Coin1.mp3',     channel: 'sfx' },
    'swoosh':              { src: 'audio/swoosh.flac',             channel: 'sfx' },
    // Pre-loaded for v0.17 features (referenced when those land)
    'ham-pickup':          { src: 'audio/1up/MP3/1up3.mp3',        channel: 'sfx' },
    'bonus-end':           { src: 'audio/Blip/MP3/Blip2.mp3',      channel: 'sfx' },
    'dialogue-beep':       { src: 'audio/Blip/MP3/Blip3.mp3',      channel: 'dialogue' },
    'jump':                { src: 'audio/Jump/MP3/Jump1.mp3',      channel: 'sfx' },
    // Hurricane segment audio. Ocean + rain are loops that play side
    // by side during the entire phase; 3 thunder variants are one-shots
    // picked at random per lightning flash for variety.
    'water-loop':          { src: 'audio/ocean_sound.mp3',         channel: 'sfx', loop: true },
    'rain-loop':           { src: 'audio/rain_sound.mp3',          channel: 'sfx', loop: true },
    'thunder-clap':        { src: 'audio/thunder-clap.mp3',        channel: 'sfx' },
    'thunder-dry':         { src: 'audio/dry_thunder.mp3',         channel: 'sfx' },
    'thunder-loud':        { src: 'audio/loud_thunder.mp3',        channel: 'sfx' },
    // v0.18.52 — JAIL feature audio.
    //   sirencops: one-shot during BUSTED-flash freeze before the jail bg
    //   jailed:    looping music for the jail-cell scene
    //   policejail: ambient station chatter looping under jailed.mp3 at
    //               lower volume (handled via per-channel mixing — both
    //               share the 'sfx' channel since the music slider should
    //               only affect jailed.mp3)
    //   bailed-out: one-shot when self-bailing OR bailing Xena out of jail
    //   xena-bailed-out: distortion-effect sting played right before the
    //               Xena bail-out dialogue cutscene
    //   xena-coin-pickup: one-shot when Xena's anti-sidekick steals a
    //               Cx coin or weed pickup that would have been Mike's
    'sirencops':           { src: 'audio/sirencops.mp3',           channel: 'sfx' },
    'jailed':              { src: 'audio/jailed.mp3',              channel: 'music', loop: true },
    'policejail':          { src: 'audio/policejail.mp3',          channel: 'sfx', loop: true },
    'bailed-out':          { src: 'audio/bailed-out.mp3',          channel: 'sfx' },
    'xena-bailed-out':     { src: 'audio/xena-bailed-out.mp3',     channel: 'sfx' },
    'xena-coin-pickup':    { src: 'audio/xena-coin-pickup.mp3',    channel: 'sfx' },
  };
  // Pool of thunder variants — picked randomly per flash so the same
  // crack doesn't repeat back-to-back during the segment.
  var THUNDER_VARIANTS = ['thunder-clap', 'thunder-dry', 'thunder-loud'];

  var audioInstances = {};
  var audioMixer = {
    music:    { volume: 0.5, muted: false },
    sfx:      { volume: 0.85, muted: false }, // boosted in v0.17.3 — coin SFX was reported inaudible
    dialogue: { volume: 1.0, muted: false },
    masterMuted: false,
  };
  var currentMusicKey = null;

  function loadAudio() {
    Object.keys(AUDIO_DEFS).forEach(function (key) {
      var def = AUDIO_DEFS[key];
      var a = new Audio();
      a.src = def.src;
      a.preload = 'auto';
      a.loop = def.loop || false;
      a.onerror = function () { /* file missing — ignore silently */ };
      audioInstances[key] = a;
    });
    loadMixerFromStorage();
    applyMixer();
  }

  function loadMixerFromStorage() {
    try {
      var s = localStorage.getItem('runner-audio-mixer-v1');
      if (s) {
        var saved = JSON.parse(s);
        // Shallow merge per-channel settings; don't blow away unknown keys
        ['music', 'sfx', 'dialogue'].forEach(function (ch) {
          if (saved[ch]) {
            audioMixer[ch].volume = clamp01(saved[ch].volume);
            audioMixer[ch].muted = !!saved[ch].muted;
          }
        });
        if (typeof saved.masterMuted === 'boolean') {
          audioMixer.masterMuted = saved.masterMuted;
        }
      }
    } catch (e) {}
  }

  function saveMixerToStorage() {
    try {
      localStorage.setItem('runner-audio-mixer-v1', JSON.stringify(audioMixer));
    } catch (e) {}
  }

  function clamp01(v) {
    v = Number(v);
    if (isNaN(v)) return 0;
    return Math.max(0, Math.min(1, v));
  }

  function effectiveVolume(channel) {
    if (audioMixer.masterMuted) return 0;
    var ch = audioMixer[channel];
    if (!ch || ch.muted) return 0;
    return ch.volume;
  }

  function applyMixer() {
    Object.keys(audioInstances).forEach(function (key) {
      var def = AUDIO_DEFS[key];
      audioInstances[key].volume = effectiveVolume(def.channel);
    });
  }

  function playSfx(key) {
    var a = audioInstances[key];
    var def = AUDIO_DEFS[key];
    if (!a || !def) return;
    a.currentTime = 0;
    a.volume = effectiveVolume(def.channel);
    a.play().catch(function () {});
  }

  function startLoop(key) {
    var a = audioInstances[key];
    var def = AUDIO_DEFS[key];
    if (!a || !def) return;
    a.volume = effectiveVolume(def.channel);
    a.play().catch(function () {});
  }

  function stopLoop(key) {
    var a = audioInstances[key];
    if (!a) return;
    a.pause();
    a.currentTime = 0;
  }

  function pickRandomMusic() {
    // Filter to the gameplay bg-music POOL only (the 3 ambient tracks).
    // Pre-fix: this just filtered by channel === 'music', which after
    // v0.18.52 ALSO included jailed.mp3 — randomly selecting it as
    // background music when starting a fresh run, causing the user-
    // reported "leaderboard plays jail music" bug. The leaderboard
    // overlay itself doesn't touch audio; the bug was that the run's
    // bg music was already wrong before the player even opened the
    // leaderboard. Filter by key prefix 'bg-music-' to only ever pick
    // from the intended ambient pool.
    var keys = Object.keys(AUDIO_DEFS).filter(function (k) {
      return AUDIO_DEFS[k].channel === 'music' && k.indexOf('bg-music-') === 0;
    });
    return keys[Math.floor(Math.random() * keys.length)];
  }

  function startBackgroundMusic() {
    if (currentMusicKey) stopLoop(currentMusicKey);
    currentMusicKey = pickRandomMusic();
    if (currentMusicKey) startLoop(currentMusicKey);
  }

  function stopBackgroundMusic() {
    if (currentMusicKey) {
      stopLoop(currentMusicKey);
      currentMusicKey = null;
    }
  }

  function nextMusicTrack() {
    var keys = Object.keys(AUDIO_DEFS).filter(function (k) {
      return AUDIO_DEFS[k].channel === 'music';
    });
    if (!keys.length) return;
    var idx = currentMusicKey ? keys.indexOf(currentMusicKey) : -1;
    if (currentMusicKey) stopLoop(currentMusicKey);
    currentMusicKey = keys[(idx + 1) % keys.length];
    startLoop(currentMusicKey);
  }

  // Browsers (Safari, Chrome since 2018) block audio.play() until the
  // user interacts with the page. We optimistically call play() right
  // away; if it rejects, we wait for the first click/tap/keydown and
  // retry. This lets the title-screen music kick in as soon as the
  // user does literally anything.
  var autoplayUnlocked = false;
  function bindAutoplayUnlock() {
    if (autoplayUnlocked) return;
    var unlock = function () {
      if (autoplayUnlocked) return;
      autoplayUnlocked = true;
      document.removeEventListener('click', unlock, true);
      document.removeEventListener('touchstart', unlock, true);
      document.removeEventListener('keydown', unlock, true);
      // Hide the "No sound? Tap gear to unmute" hint — once we've had
      // user interaction, audio is unlocked and the hint is no longer
      // useful. Fades out via CSS opacity transition.
      var hint = document.getElementById('audio-hint');
      if (hint) hint.classList.add('hidden');
      // Retry whichever music track is "current" — startBackgroundMusic
      // already set currentMusicKey, but the play() call inside it may
      // have been blocked.
      if (currentMusicKey) {
        var inst = audioInstances[currentMusicKey];
        if (inst) inst.play().catch(function () {});
      }
    };
    document.addEventListener('click', unlock, true);
    document.addEventListener('touchstart', unlock, true);
    document.addEventListener('keydown', unlock, true);
  }

  // ============================================================
  // CUT SCENE SYSTEM — Multi-stage Ice arc that plays out across each
  // run at distance milestones:
  //   First Meet (250m)  — Ice intro + 3 player choices → Ice joins
  //   Mike Tells Off (~600m) — Mike rejects Ice → Ice departs
  //   Ice Returns (~1100m) — 2-panel weird Ice line + Mike reaction
  //                          → Ice rejoins
  // Each cut scene has 1+ panels. Each panel = one speaker + one line.
  // After a panel's text finishes typing, either choice buttons (if
  // panel.choices exists) or a single CONTINUE button appears.
  // ============================================================
  var CUTSCENE_TYPE_MS = 35;     // ms per character of dialogue
  var CUTSCENE_MOUTH_MS = 110;   // ms per mouth-frame swap

  var CUTSCENE_DEFS = {
    'first-meet': {
      // Bumped 250 → 600. Gives the player meaningful runtime to learn
      // controls + survive a few obstacles before the dialogue interrupts.
      triggerDistanceM: 600,
      requires: function () { return !state.iceSidekickJoined; },
      panels: [
        {
          speaker: 'ICE POSEIDON',
          bgPrefix: 'cutscene-', bgExt: '.png',
          line: "Mike Smalls? Aren't you the guy who always just wants to fuck?",
          choices: [
            '"What did you just say horse boy?"',
            '"DON\'T GRAB MY DICK BITCH ASS N*GGA!"',
            '"ALLAT! Let\'s team up!"',
          ],
        },
      ],
      onComplete: function () { state.iceSidekickJoined = true; },
    },
    'mike-tells-off': {
      // Bumped 1000 → 2000. ~1400m of Ice-as-sidekick gameplay between
      // the meeting and the falling-out, so the relationship arc breathes.
      triggerDistanceM: 2000,
      requires: function () { return state.iceSidekickJoined; },
      panels: [
        {
          speaker: 'MIKE SMALLS JR',
          bgPrefix: 'cutscene-mike-', bgExt: '.png',
          line: "Listen, you pissing me off dude! Stop following and leeching me! 400 shit.",
        },
      ],
      onComplete: function () { state.iceSidekickJoined = false; },
    },
    // BEFORE-WATER — fires once before the FIRST water segment, but
    // only if Ice is still with Mike at that point. Sets up the
    // "Ice abandons Mike at the water edge" beat. Triggered manually
    // by maybeTriggerWater (not by distance loop in
    // maybeTriggerCutscene), so manualOnly: true.
    'before-water': {
      manualOnly: true,
      requires: function () { return state.iceSidekickJoined; },
      panels: [
        {
          speaker: 'ICE POSEIDON',
          bgPrefix: 'cutscene-', bgExt: '.png',
          line: "Mike, you ever been to the North Pole?",
        },
        {
          speaker: 'MIKE SMALLS JR',
          bgPrefix: 'cutscene-mike-', bgExt: '.png',
          line: "The fuck? You think because I'm short I be out there like some ham ass elf wrapping Christmas presents?",
        },
      ],
      onComplete: function () {
        // Ice splits before the water — Mike's solo on the mattress.
        // After Ice's North Pole bit, ADIN ROSS pops in to offer Mike
        // the $70k incentive to brave the hurricane. That cutscene's
        // onComplete is what actually starts the water phase.
        state.iceSidekickJoined = false;
        state.iceTrailing = false;
        startCutscene('adin-ross');
      },
    },
    // SHOOVY MID-WATER — fires HALFWAY through the water phase, after
    // Shoovy's sailboat has approached Mike from the bottom of the
    // screen. Triggered manually by tickWater when the boat reaches
    // Mike's Y line. onComplete cuts the rest of the water-body short
    // (jumps straight to exit) so the segment length stays sane.
    'shoovy-meeting': {
      manualOnly: true,
      panels: [
        {
          speaker: 'SHOOVY',
          bgPrefix: 'cutscene-shoovy-', bgExt: '.png',
          line: "i dough knot uh know, why you would be out here with your life so importantly meaning, but i uh am too and need land fastly.",
        },
      ],
      onComplete: function () {
        // Skip the rest of the water body — go straight to the exit
        // transition so the player isn't stuck in storm for another 5s
        // after Shoovy disappears.
        if (state.water.phase === 'water') {
          state.water.phase = 'exiting';
          // Anchor exiting elapsed at 0 by setting startedAt to "now -
          // (WATER_ENTER_MS + WATER_BODY_MS)" so the wall-clock math in
          // tickWater's exit check counts correctly.
          state.water.startedAt = performance.now() - (WATER_ENTER_MS + WATER_BODY_MS);
        }
        // Boat exits with the segment.
        state.water.shoovyBoat = null;
      },
    },
    // ADIN ROSS — appears between ice-leaves and the hurricane to bait
    // Mike outside with $70k. Always plays right before the water
    // phase: chained from before-water's onComplete if Ice was around,
    // otherwise fired directly from maybeTriggerWater.
    'adin-ross': {
      manualOnly: true,
      panels: [
        {
          speaker: 'ADIN ROSS',
          bgPrefix: 'cutscene-adin-', bgExt: '.png',
          line: "Bro, come on. Bro, don't listen to Ice, I got $70,000 if you go outside and survive the hurricane. It'll be fun.",
        },
      ],
      onComplete: function () {
        startWaterPhase();
      },
    },
    // ADIN POST-WATER — fires once Mike returns to street after the
    // hurricane. Adin reneges on the $70k bait then tosses Mike a
    // pity 10 Cx coins instead. The reward fires from onComplete +
    // shows a centered "+10 Cx" flash with a spinning coin.
    'adin-post-water': {
      manualOnly: true,
      panels: [
        {
          speaker: 'ADIN ROSS',
          bgPrefix: 'cutscene-adin-', bgExt: '.png',
          line: "Hahah get scammed! Okay fine here is 10 Cx coins.",
        },
      ],
      onComplete: function () {
        // Award + recompute multiplier (same thresholds as the regular
        // coin-pickup path) so the new total bumps the player's
        // multiplier if they crossed a threshold.
        state.coins += 10;
        if (state.coins >= 16) state.multiplier = 3;
        else if (state.coins >= 6) state.multiplier = 2;
        // Big centered "+10 Cx" flash with spinning coin animation.
        triggerCoinRewardFlash(10);
        ga('adin_post_water_reward', { coins: 10 });
      },
    },
    // ICE BAILS ON MIKE (v0.18.56). Fires AFTER the BUSTED flash but
    // BEFORE the jail dialogue, only when Ice was actively following
    // Mike at the moment of arrest. Ice quickly distances himself
    // ("uhhh, so yeah, I'll call you.") and onComplete drops the
    // sidekick relationship — provides story justification for why
    // Ice is gone when Mike walks out post-bail.
    'ice-bails-on-mike': {
      manualOnly: true,
      panels: [
        {
          speaker: 'ICE POSEIDON',
          bgPrefix: 'cutscene-', bgExt: '.png',
          line: "uhhh, so yeah, I'll call you.",
        },
      ],
      onComplete: function () {
        // Drop Ice. Same shape as jailBailXena's drop so the post-
        // jail world doesn't have stale Ice flags hanging around.
        state.iceSidekickJoined = false;
        state.iceTrailing = false;
        if (state.cutscenesTriggered) {
          delete state.cutscenesTriggered['ice-returns'];
        }
        // Now transition to the standard jail-cell phase (was on
        // hold while this cutscene played).
        state.jail.phase = 'cell';
        state.jail.startedAt = performance.now();
        showJailOverlay();
        startLoop('jailed');
        startLoop('policejail');
        ga('ice_bailed_on_mike_in_jail', { at_distance: Math.floor(state.distance) });
      },
    },
    // BAIL-XENA cutscene (v0.18.52 phase C). Fires after the player
    // chose "BAIL XENA INSTEAD" in the jail dialogue and the screen
    // distortion + xena-bailed-out.mp3 sting played. Single panel,
    // long line — Xena's single beat of dialogue per user spec.
    // onComplete activates state.xenaFollowing and resumes gameplay
    // via the standard finishJailExit() tail.
    'xena-bail': {
      manualOnly: true,
      panels: [
        {
          speaker: 'XENA THE WITCH',
          bgPrefix: 'cutscene-xena-', bgExt: '.png',
          line: "Thanks Mike for bailing me out. Nick White snitched, AGAIN. You a real homie Mike! I'll repay you... later... are you allergic to silicone?",
        },
      ],
      onComplete: function () {
        state.xenaFollowing = true;
        // Resume gameplay — same tail used by self-bail. Note we
        // intentionally call this AFTER setting xenaFollowing so the
        // first frame back has Xena present already.
        finishJailExit();
        ga('xena_bailed', { at_distance: Math.floor(state.distance) });
      },
    },
    'ice-returns': {
      // Bumped 2000 → 3800. ~1800m of solo running before Ice reappears,
      // matching the "long stretch alone, then the parasite returns" beat.
      triggerDistanceM: 3800,
      requires: function () { return !state.iceSidekickJoined; },
      panels: [
        {
          speaker: 'ICE POSEIDON',
          bgPrefix: 'cutscene-', bgExt: '.png',
          line: "Yo Mike, lemme grab that dick!",
        },
        {
          speaker: 'MIKE SMALLS JR',
          bgPrefix: 'cutscene-mike-', bgExt: '.png',
          line: "AHHH WHAT THE FUCK!",
        },
      ],
      // Returning Ice TRAILS Mike (chases from behind) instead of
      // running side-by-side, matching the "lemme grab that dick"
      // narrative beat — he's now the unwanted pursuer, not the
      // friendly side-kick.
      onComplete: function () {
        state.iceSidekickJoined = true;
        state.iceTrailing = true;
      },
    },
  };

  var cutscene = {
    active: false,
    defId: null,
    panelIdx: 0,
    startedAt: 0,
    typedChars: 0,
    showingChoices: false,
    selectionIdx: 0,  // arrow-up/down highlight when picking a choice
  };

  function currentDef() { return cutscene.defId ? CUTSCENE_DEFS[cutscene.defId] : null; }
  function currentPanel() {
    var def = currentDef();
    return def ? def.panels[cutscene.panelIdx] : null;
  }

  function maybeTriggerCutscene() {
    if (cutscene.active) return;
    for (var defId in CUTSCENE_DEFS) {
      var def = CUTSCENE_DEFS[defId];
      // manualOnly defs (like 'before-water') only fire when something
      // explicitly calls startCutscene(defId) — skip the distance loop.
      if (def.manualOnly) continue;
      if (state.distance < def.triggerDistanceM) continue;
      if (state.cutscenesTriggered[defId]) continue;
      if (def.requires && !def.requires()) continue;
      state.cutscenesTriggered[defId] = true;
      startCutscene(defId);
      return;
    }
  }

  // ============================================================
  // Cut scene shoulder bird — yellow-green budgie that perches on
  // Mike's left shoulder during dialogue, periodically takes off,
  // flies a small loop, and returns. Pure DOM/CSS animation; no
  // canvas. State machine has 4 phases:
  //   PERCH    — sitting on shoulder, slow head-bob via frame swap
  //   TAKEOFF  — flapping in place ~250ms before launch
  //   FLYING   — translated to upper-right of frame, flap cycle
  //   RETURN   — translated back toward shoulder
  // After RETURN the bird settles back into PERCH and the cycle
  // repeats every PERCH_SETTLE_MS + flight time.
  // ============================================================
  var BIRD_PERCH_FRAMES = ['budgie-13', 'budgie-14', 'budgie-13', 'budgie-16'];
  var BIRD_FLAP_FRAMES  = ['budgie-01', 'budgie-02', 'budgie-03', 'budgie-04'];
  var BIRD_PERCH_FRAME_MS = 600;     // slow head-turn cycle while perched
  var BIRD_FLAP_FRAME_MS  = 90;      // fast wing flap during flight
  var BIRD_PERCH_SETTLE_MS = 5500;   // how long bird sits before taking off
  var BIRD_TAKEOFF_MS = 350;         // wings up before transform starts
  // New off-screen flight cycle (mirrors the title-screen bird):
  // takeoff -> flyout RIGHT off-screen -> offscreen pause (hidden) ->
  // flyin from LEFT off-screen back to perch.
  var BIRD_FLYOUT_MS = 1500;         // matches CSS .flying transition
  var BIRD_OFFSCREEN_MS = 800;       // hidden between exit and re-entry
  var BIRD_FLYIN_MS = 1700;          // matches CSS .flying transition
  var bird = {
    // 'perch' | 'takeoff' | 'flyout' | 'offscreen' | 'flyin'
    phase: 'perch',
    nextPhaseAt: 0,
  };

  function resetCutsceneBird() {
    bird.phase = 'perch';
    bird.nextPhaseAt = performance.now() + BIRD_PERCH_SETTLE_MS;
    var el = document.getElementById('cutscene-bird');
    if (el) {
      el.classList.remove('flying');
      el.style.transition = '';
      el.style.transform = '';
      el.style.visibility = '';
    }
    setBirdFrame(BIRD_PERCH_FRAMES[0]);
  }

  function setBirdFrame(key) {
    var img = document.getElementById('cutscene-bird-img');
    if (img && img.dataset.frame !== key) {
      img.dataset.frame = key;
      img.src = 'img/sprites/' + key + '.png';
    }
  }

  function tickBird(now) {
    var el = document.getElementById('cutscene-bird');
    if (!el) return;
    // Frame cycling — different cadence per phase
    if (bird.phase === 'perch') {
      var pi = Math.floor(now / BIRD_PERCH_FRAME_MS) % BIRD_PERCH_FRAMES.length;
      setBirdFrame(BIRD_PERCH_FRAMES[pi]);
    } else if (bird.phase !== 'offscreen') {
      // takeoff / flyout / flyin all use the wing-flap cycle. offscreen
      // skips frame swaps entirely since the bird is hidden.
      var fi = Math.floor(now / BIRD_FLAP_FRAME_MS) % BIRD_FLAP_FRAMES.length;
      setBirdFrame(BIRD_FLAP_FRAMES[fi]);
    }

    // Phase transitions
    if (now < bird.nextPhaseAt) return;
    if (bird.phase === 'perch') {
      // Time to take off — switch to flap frames in place briefly
      bird.phase = 'takeoff';
      bird.nextPhaseAt = now + BIRD_TAKEOFF_MS;
    } else if (bird.phase === 'takeoff') {
      // FLYOUT — translate well off-screen to the RIGHT. The .flying
      // class swaps to a slower easing so the path feels graceful.
      // 1100% relative to bird width (9% of canvas) clears the right
      // edge with margin to spare.
      bird.phase = 'flyout';
      bird.nextPhaseAt = now + BIRD_FLYOUT_MS;
      el.classList.add('flying');
      el.style.transition = '';
      el.style.transform = 'translate(1100%, -100%)';
    } else if (bird.phase === 'flyout') {
      // OFFSCREEN — hide the bird and TELEPORT it to the off-screen
      // LEFT side ready to fly back in. Disable the CSS transition for
      // the teleport so it doesn't visibly slide across the screen,
      // then the next phase re-enables transitions for the fly-in.
      bird.phase = 'offscreen';
      bird.nextPhaseAt = now + BIRD_OFFSCREEN_MS;
      el.style.visibility = 'hidden';
      el.style.transition = 'none';
      el.style.transform = 'translate(-1100%, -100%)';
      // Force layout flush so the no-transition teleport commits before
      // the next paint kicks the transition back in.
      void el.offsetWidth;
    } else if (bird.phase === 'offscreen') {
      // FLYIN — re-enable transition + clear transform so the bird
      // smoothly flies back from the LEFT off-screen position to the
      // perch on the dialogue box edge.
      bird.phase = 'flyin';
      bird.nextPhaseAt = now + BIRD_FLYIN_MS;
      el.style.transition = '';
      el.style.visibility = '';
      el.style.transform = '';  // back to anchored perch position
    } else if (bird.phase === 'flyin') {
      // Landed — back to perch idle until next takeoff
      bird.phase = 'perch';
      bird.nextPhaseAt = now + BIRD_PERCH_SETTLE_MS;
      el.classList.remove('flying');
    }
  }

  function startCutscene(defId) {
    cutscene.active = true;
    cutscene.defId = defId;
    cutscene.panelIdx = 0;
    var ov = document.getElementById('overlay-cutscene');
    if (ov) ov.classList.remove('hidden');
    // Mute the mob-yelling ambient loop while dialogue is on screen —
    // it competes with the typewriter beep + dialogue voice cues and
    // makes the cut scene feel chaotic instead of intimate.
    stopLoop('mob-angry');
    ga('cutscene_played', { def: defId });
    // Reset the shoulder bird to its idle perch so a fresh cut scene
    // doesn't inherit a half-flown state from a previous one.
    resetCutsceneBird();
    // Mid-water Shoovy cutscene gets DRAMATIC lightning + thunder
    // bursts since the storm is still raging around them. Schedule a
    // sequence of 3 flashes spaced across the cutscene so the player
    // feels the storm continue even with the dialogue overlay up.
    if (defId === 'shoovy-meeting') {
      scheduleCutsceneLightning([700, 2300, 3900]);
      // Storm rain overlay — adds an animated CSS rain layer ABOVE
      // the cutscene panel so the storm visually continues during
      // dialogue (the canvas-side rain is hidden behind the panel).
      if (ov) ov.classList.add('is-stormy');
    } else {
      // Defensive: if a previous cutscene left is-stormy on (it
      // shouldn't but the class-add is idempotent), strip it on any
      // non-Shoovy cutscene.
      if (ov) ov.classList.remove('is-stormy');
    }
    // v0.18.53 — Xena bail-out cutscene plays in front of the
    // Carabineros de Chile police station bg so the scene reads as
    // "just outside the station after Mike got her out".
    if (defId === 'xena-bail') {
      if (ov) ov.classList.add('is-jail-bg');
    } else {
      if (ov) ov.classList.remove('is-jail-bg');
    }
    transitionToPanel(0);
  }

  // Cutscene lightning helper. Fires CSS .lightning-flash on the
  // overlay-cutscene element + plays a random thunder variant at each
  // of the supplied delays (ms after now). Used during Shoovy's
  // mid-water meeting to keep the storm visible/audible.
  function scheduleCutsceneLightning(delays) {
    var ov = document.getElementById('overlay-cutscene');
    if (!ov) return;
    delays.forEach(function (d) {
      setTimeout(function () {
        if (!cutscene.active) return; // user advanced past Shoovy already
        // Re-trigger the CSS animation by toggling the class off->on
        ov.classList.remove('lightning-flash');
        // Force reflow so the next add re-fires the keyframes
        void ov.offsetWidth;
        ov.classList.add('lightning-flash');
        var thunderKey = THUNDER_VARIANTS[Math.floor(Math.random() * THUNDER_VARIANTS.length)];
        playSfx(thunderKey);
        // Clean up the class after the animation finishes so subsequent
        // ones can re-trigger cleanly.
        setTimeout(function () {
          if (ov) ov.classList.remove('lightning-flash');
        }, 180);
      }, d);
    });
  }

  function transitionToPanel(idx) {
    cutscene.panelIdx = idx;
    cutscene.startedAt = performance.now();
    cutscene.typedChars = 0;
    cutscene.showingChoices = false;
    var panel = currentPanel();
    if (!panel) return;
    var nameEl = document.getElementById('cutscene-name');
    var txtEl = document.getElementById('cutscene-text');
    var chEl = document.getElementById('cutscene-choices');
    var bgEl = document.getElementById('cutscene-bg');
    if (nameEl) nameEl.textContent = panel.speaker;
    if (txtEl) txtEl.textContent = '';
    if (chEl) { chEl.classList.add('hidden'); chEl.innerHTML = ''; }
    if (bgEl) { bgEl.dataset.mouth = 'closed'; bgEl.src = 'img/' + panel.bgPrefix + 'closed' + panel.bgExt; }
    // Re-anchor the shoulder bird per panel — the two cutscene angles
    // place Mike's shoulder at very different heights:
    //   - Ice panels  ('cutscene-')      Mike is on the LEFT facing AWAY,
    //     only his upper-back/durag visible. Shoulder ~ 38% down.
    //   - Mike panels ('cutscene-mike-') Mike is on the LEFT facing US,
    //     full upper body visible. Shoulder ~ 22% down (much higher).
    applyCutsceneBirdAnchor(panel);
  }

  function applyCutsceneBirdAnchor(panel) {
    var el = document.getElementById('cutscene-bird');
    if (!el) return;
    // Reset transform so the new anchor isn't combined with an in-flight
    // offset from a previous panel
    el.classList.remove('flying');
    el.style.transform = '';
    // Per playtest: pinning to Mike's shoulder is finicky (different
    // angles place his shoulder at different heights and the bird kept
    // ending up on his stomach or in midair). Easier and more visually
    // consistent: have the bird perch on the TOP-LEFT EDGE of the
    // dialogue box. The box position is the same across all panels so
    // one anchor works for both Ice and Mike speaker views, and the
    // composition reads like a parrot sitting on a railing while the
    // characters talk.
    var anchor = { left: '8%', top: '63%', width: '9%' };
    el.style.left  = anchor.left;
    el.style.top   = anchor.top;
    el.style.width = anchor.width;
  }

  function tickCutscene(now) {
    if (!cutscene.active) return;
    // Animate the shoulder budgie even when the dialogue is settled
    // (showingChoices) so it stays alive while the player reads.
    tickBird(now);
    var panel = currentPanel();
    if (!panel) return;
    var bg = document.getElementById('cutscene-bg');

    // IDLE ANIMATION — keep cycling the speaker's frames even after
    // text has finished typing (during showingChoices). 3 frames cycle
    // every CUTSCENE_MOUTH_MS, then a brief pause every 3rd loop so
    // it reads as natural fidgeting (mouth + hands) rather than a
    // hyperactive twitch. The cycle pattern:
    //   cycle 1: closed → mid → open
    //   cycle 2: closed → mid → open
    //   cycle 3: closed → mid → open
    //   PAUSE on closed for ~700ms, then repeat.
    if (cutscene.showingChoices) {
      var idleElapsed = now - cutscene.startedAt;
      var CYCLE_MS = CUTSCENE_MOUTH_MS * 3;            // 3 frames per cycle
      var LOOP_MS = CYCLE_MS * 3 + 700;                // 3 cycles + pause
      var loopPos = idleElapsed % LOOP_MS;
      var idleVariant;
      if (loopPos >= CYCLE_MS * 3) {
        idleVariant = 'closed';                         // pause beat
      } else {
        var idleIdx = Math.floor(loopPos / CUTSCENE_MOUTH_MS) % 3;
        idleVariant = ['closed', 'mid', 'open'][idleIdx];
      }
      if (bg && bg.dataset.mouth !== idleVariant) {
        bg.dataset.mouth = idleVariant;
        bg.src = 'img/' + panel.bgPrefix + idleVariant + panel.bgExt;
      }
      return; // skip the typewriter logic below
    }

    // Mouth animation cycle while typing
    var mouthIdx = Math.floor((now - cutscene.startedAt) / CUTSCENE_MOUTH_MS) % 3;
    var mouthVariant = ['closed', 'mid', 'open'][mouthIdx];
    if (bg && bg.dataset.mouth !== mouthVariant) {
      bg.dataset.mouth = mouthVariant;
      bg.src = 'img/' + panel.bgPrefix + mouthVariant + panel.bgExt;
    }
    // Typewriter
    var elapsed = now - cutscene.startedAt;
    var targetChars = Math.min(panel.line.length, Math.floor(elapsed / CUTSCENE_TYPE_MS));
    if (targetChars > cutscene.typedChars) {
      playSfx('dialogue-beep');
      cutscene.typedChars = targetChars;
      var txt2 = document.getElementById('cutscene-text');
      if (txt2) txt2.textContent = panel.line.slice(0, targetChars);
    }
    // Text complete — settle on closed mouth + show buttons
    if (cutscene.typedChars >= panel.line.length) {
      cutscene.showingChoices = true;
      if (bg) { bg.dataset.mouth = 'closed'; bg.src = 'img/' + panel.bgPrefix + 'closed' + panel.bgExt; }
      showCutsceneButtons(panel);
      // Punctuation cue at panel end — ice-neck for Ice panels, damage for Mike's
      playSfx(panel.speaker === 'ICE POSEIDON' ? 'ice-neck' : 'damage');
    }
  }

  function showCutsceneButtons(panel) {
    var ch = document.getElementById('cutscene-choices');
    if (!ch) return;
    ch.innerHTML = '';
    if (panel.choices && panel.choices.length) {
      panel.choices.forEach(function (text, i) {
        var b = document.createElement('button');
        b.type = 'button';
        b.dataset.choice = String(i);
        b.textContent = text;
        ch.appendChild(b);
      });
    } else {
      var b = document.createElement('button');
      b.type = 'button';
      b.dataset.choice = '0';
      b.textContent = 'CONTINUE ▶';
      ch.appendChild(b);
    }
    ch.classList.remove('hidden');
    // Highlight the first button so arrow-up/down navigation has a
    // starting point + keyboard users immediately see their position.
    setCutsceneSelection(0);
  }

  // Keyboard navigation for cutscene choice buttons. Arrow up/down
  // moves the highlight, Enter / Space fires the highlighted choice.
  function setCutsceneSelection(idx) {
    var ch = document.getElementById('cutscene-choices');
    if (!ch) return;
    var btns = ch.querySelectorAll('button[data-choice]');
    if (btns.length === 0) return;
    if (idx < 0) idx = btns.length - 1;
    if (idx >= btns.length) idx = 0;
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('selected', i === idx);
    }
    cutscene.selectionIdx = idx;
  }
  function moveCutsceneSelection(delta) {
    var ch = document.getElementById('cutscene-choices');
    if (!ch) return;
    var btns = ch.querySelectorAll('button[data-choice]');
    if (btns.length === 0) return;
    var cur = cutscene.selectionIdx != null ? cutscene.selectionIdx : 0;
    setCutsceneSelection(cur + delta);
  }
  function activateCutsceneSelection() {
    var ch = document.getElementById('cutscene-choices');
    if (!ch) return;
    var btns = ch.querySelectorAll('button[data-choice]');
    var idx = cutscene.selectionIdx != null ? cutscene.selectionIdx : 0;
    if (idx >= btns.length) return;
    var btn = btns[idx];
    if (!btn) return;
    advanceCutscene(parseInt(btn.dataset.choice, 10));
  }

  // Called when player clicks a choice/continue button.
  function advanceCutscene(choiceIdx) {
    var def = currentDef();
    if (!def) return;
    ga('cutscene_choice', { def: cutscene.defId, panel: cutscene.panelIdx, selected_option: choiceIdx });
    var nextIdx = cutscene.panelIdx + 1;
    if (nextIdx >= def.panels.length) {
      // All panels done — fire onComplete effect, then dismiss the
      // overlay UNLESS onComplete chained to a new cutscene (e.g.,
      // before-water → adin-ross). In that case `cutscene.defId` will
      // have changed; preserve the new state instead of clobbering it
      // back to closed/null and accidentally killing the chain.
      var preDefId = cutscene.defId;
      if (def.onComplete) def.onComplete();
      if (cutscene.defId !== preDefId) {
        // Chained to a different cutscene — let it run, do nothing.
        return;
      }
      cutscene.active = false;
      cutscene.defId = null;
      var ov = document.getElementById('overlay-cutscene');
      if (ov) {
        ov.classList.add('hidden');
        // Always strip is-stormy + is-jail-bg on cutscene end so the
        // next panel doesn't inherit the previous one's bg/overlay.
        ov.classList.remove('is-stormy');
        ov.classList.remove('is-jail-bg');
      }
      // Resume the mob-yelling ambient loop now that dialogue is over,
      // unless the onComplete started the water phase OR Mike is
      // mid-jail (water + jail handle their own audio routing).
      if (state.phase === 'playing'
          && state.water.phase === 'none'
          && (!state.jail || state.jail.phase === 'none')) {
        startLoop('mob-angry');
      }
    } else {
      transitionToPanel(nextIdx);
    }
  }

  // ============================================================
  // GA event wrapper. Defaults to a no-op if gtag isn't loaded (so the
  // game still works if GA fails to load or is blocked by adblock).
  // ============================================================
  function ga(eventName, params) {
    if (typeof window.gtag === 'function') {
      try { window.gtag('event', eventName, params || {}); } catch (e) {}
    }
  }

  // ============================================================
  // Pause — toggleable via P key, ESC, or the pause button. When paused,
  // the game loop skips its update step (positions/spawns frozen) but
  // keeps rendering so the world stays on screen with a "PAUSED"
  // overlay. Music + ambient mob loop pause too; resumed on unpause.
  // ============================================================
  function togglePause() {
    if (state.phase !== 'playing') return;
    setPaused(!state.paused);
  }
  // Track when the player paused so we can SHIFT every wall-clock
  // expiry timestamp forward by the same delta on resume. Without this,
  // a long pause silently expires every active effect (horse, ham,
  // weed, controls-reversed, invuln, etc.) — bug reported in playtest:
  // pausing during a horse boost lost the horse on resume.
  var pauseStartedAt = 0;

  function setPaused(v) {
    var wasPaused = state.paused;
    state.paused = !!v;
    var ov = document.getElementById('overlay-pause');
    if (ov) ov.classList.toggle('hidden', !state.paused);
    var btn = document.getElementById('btn-pause');
    if (btn) btn.classList.toggle('is-paused', state.paused);

    var now = performance.now();
    if (state.paused && !wasPaused) {
      // Just paused — record the wall-clock so we know how long we were
      // paused for when the player resumes.
      pauseStartedAt = now;
    } else if (!state.paused && wasPaused) {
      // Resuming — every "expires-at" timestamp in state needs to shift
      // forward by the pause duration so effects continue from where
      // they left off, not in their already-expired ghost state.
      var pauseDur = now - pauseStartedAt;
      if (pauseDur > 0) shiftEffectTimers(pauseDur);
      pauseStartedAt = 0;
    }

    // Pause/resume looping audio. SFX (one-shot) don't need to be touched.
    Object.keys(AUDIO_DEFS).forEach(function (k) {
      var def = AUDIO_DEFS[k];
      if (!def.loop) return;
      var inst = audioInstances[k];
      if (!inst) return;
      if (state.paused) {
        if (!inst.paused) inst.pause();
      } else {
        // Only resume the tracks that should be playing in this state
        // (current music + mob ambient).
        if (k === currentMusicKey || k === 'mob-angry') {
          inst.play().catch(function () {});
        }
      }
    });
  }

  // Shift every wall-clock expiry timestamp forward by delta (ms).
  // Called on resume so the effect that was halfway through a pause
  // doesn't appear to have expired in the gap.
  function shiftEffectTimers(delta) {
    var e = state.effects;
    if (e.hamFreezeUntil > 0)         e.hamFreezeUntil += delta;
    if (e.hamBonusUntil > 0)          e.hamBonusUntil += delta;
    if (e.weedDebuffUntil > 0)        e.weedDebuffUntil += delta;
    if (e.horseBoostUntil > 0)        e.horseBoostUntil += delta;
    if (e.controlsReversedUntil > 0)  e.controlsReversedUntil += delta;
    if (e.textShownAt > 0)            e.textShownAt += delta;
    if (e.textShownUntil > 0)         e.textShownUntil += delta;
    if (state.invulnUntil > 0)        state.invulnUntil += delta;
    // Player jump in progress
    if (state.player && state.player.jumpStart > 0) state.player.jumpStart += delta;
    // Ice neck-stretch animation
    if (state.ice && state.ice.neckStretchUntil > 0) state.ice.neckStretchUntil += delta;
    // Coin particles' spawnedAt + life is alive-time-relative; shift
    // their spawnedAt so the elapsed math stays correct.
    if (state.coinParticles) {
      for (var i = 0; i < state.coinParticles.length; i++) {
        state.coinParticles[i].spawnedAt += delta;
      }
    }
    // Hurricane / water phase wall-clock timestamps. Without these
    // shifts, pausing during the water phase would let the wall-clock
    // advance while startedAt stayed put — on resume, tickWater would
    // see elapsed > WATER_TOTAL_MS and IMMEDIATELY exit the phase,
    // dropping Mike back on the street mid-segment.
    if (state.water && state.water.phase !== 'none') {
      state.water.startedAt += delta;
      if (state.water.nextLightningAt > 0) state.water.nextLightningAt += delta;
      if (state.water.lightningUntil > 0)  state.water.lightningUntil += delta;
    }
    // Cross-traffic cop cars — swerveStartedAt is wall-clock-anchored
    // for the feint envelope. Spawn timestamps too.
    if (state.crossCars) {
      for (var ci = 0; ci < state.crossCars.length; ci++) {
        var c = state.crossCars[ci];
        if (c.spawnedAt > 0) c.spawnedAt += delta;
        if (c.swerveStartedAt > 0) c.swerveStartedAt += delta;
      }
    }
    // Cross-car spawn cadence is dt-based (state.crossCarSpawnTimer
    // is an accumulator), so it's already pause-safe — no shift needed.
    // Same for fauna spawnTimer.
    // Coin-reward flash overlay
    if (state.coinRewardFlash && state.coinRewardFlash.startedAt > 0) {
      state.coinRewardFlash.startedAt += delta;
    }
    // New-record celebration overlay (v0.18.51)
    if (state.newRecordFlash && state.newRecordFlash.startedAt > 0) {
      state.newRecordFlash.startedAt += delta;
    }
    // ============================================================
    // v0.18.51: shift every sprite-animation spawnedAt forward too,
    // so the (now - spawnedAt) frame-picker doesn't jump on resume.
    // Without these, pausing froze gameplay but sprites kept playing
    // their walk cycles in place — visually weird and broke "pause
    // means everything pauses" intuition.
    // ============================================================
    function shiftSpawnedAt(arr) {
      if (!arr) return;
      for (var i = 0; i < arr.length; i++) {
        if (arr[i] && arr[i].spawnedAt > 0) arr[i].spawnedAt += delta;
      }
    }
    shiftSpawnedAt(state.obstacles);
    shiftSpawnedAt(state.pickups);
    shiftSpawnedAt(state.fauna);
    shiftSpawnedAt(state.chaseOfficers);
    shiftSpawnedAt(state.coinsArr);
    // Shoovy boat (single object, not an array)
    if (state.water && state.water.shoovyBoat && state.water.shoovyBoat.spawnedAt > 0) {
      state.water.shoovyBoat.spawnedAt += delta;
    }
    // Cutscene typewriter — without this, pausing during the intro
    // text would let the unpaused-elapsed math advance past the
    // typewriter's end on resume, jump-printing the rest of the line.
    if (typeof cutscene !== 'undefined' && cutscene.active && cutscene.startedAt > 0) {
      cutscene.startedAt += delta;
    }
  }

  // ============================================================
  // State.
  // ============================================================
  var sprites = {}; // key -> Image (loaded async)
  var canvas, ctx;
  var lastTime = 0;
  var bgScrollX = 0;          // for parallax scroll of skyline panorama
  var currentRoadKey = null;  // which bg-road-N is being used this run

  var state = {
    phase: 'loading',  // 'loading' | 'menu' | 'playing' | 'gameover'
    paused: false,     // true when player has paused (P / ESC / pause button)
    speed: SPEED_INITIAL,
    distance: 0,         // meters traveled (1 px ≈ 0.1 m for nicer numbers)
    distancePx: 0,       // raw pixel distance (used for procedural BG features)
    elapsedMs: 0,        // ms of "playing" time (excludes paused time)
    coins: 0,
    multiplier: 1,
    lives: LIVES_INITIAL,
    invulnUntil: 0,      // performance.now() timestamp; until then no hits register
    player: { lane: STARTING_LANE, targetLane: STARTING_LANE, lerpX: 1, jumpStart: 0 },
    obstacles: [],       // [{lane, y, type, spawnedAt, bobPhase, w, h, hit}]
    coinsArr: [],        // [{lane, y, w, h, picked}]
    pickups: [],         // [{lane, y, type, spawnedAt, w, h, picked}]
    spawnTimer: 0,
    seagulls: [],        // [{x, y, vx, scale, spawnedAt}] — title-screen flock
    seagullSpawnTimer: 0,
    iceSidekickJoined: false, // toggles via cut scenes during a run
    iceTrailing: false,       // true after the 'ice-returns' cutscene — Ice chases from behind instead of running beside
    cutscenesTriggered: {},   // { defId: true } — per-run flags so each fires once
    ice: {
      neckStretchUntil: 0,    // ms timestamp when neck-stretch animation ends (0 = idle running pose)
      lastSide: 1,            // -1 = Mike's left, +1 = Mike's right (Ice mirrors when Mike lane-shifts)
    },
    iceCoinsCollected: 0,     // Ice's running total this run (for HUD if we ever surface it)
    // XENA THE WITCH — anti-sidekick (v0.18.52 phase C). Activated by
    // jailBailXena() when player chose "BAIL XENA INSTEAD" in jail.
    // She follows like Ice but STEALS coins/weed so Mike can't have them.
    xenaFollowing: false,
    xena: {
      lastSide: -1,           // mirrors Ice — typically opposite side
      grabFlashUntil: 0,      // brief gold-tint flash on her body after a snipe
    },
    xenaStolenCount: 0,       // for stats / future HUD
    // For canvas-side screen-distortion at bail-xena trigger
    xenaBailDistortUntil: 0,
    // v0.18.59 — Shoovy sunset celebration timer. Set to performance.now() + 4000
    // when the water phase exits AFTER a successful Shoovy meeting.
    // drawEffects renders puffin-88 in the corner with fade while > now.
    shoovySunsetUntil: 0,
    effects: {
      hamFreezeUntil: 0,  // game-world frozen until this timestamp (ms)
      hamBonusUntil: 0,   // coin shower + 4x music until this timestamp
      weedDebuffUntil: 0, // slow + red tint until this timestamp
      horseBoostUntil: 0, // 1.7x scroll + horse-riding sprite until this timestamp
      controlsReversedUntil: 0, // phone-thief-induced left/right inversion
      // Center-screen text overlay (Mario-1UP style for ham + brief
      // burst for 400 / weed pickups)
      textLabel: '',
      textColor: '#FFD566',
      textShownAt: 0,
      textShownUntil: 0,
    },
    // Coin particles spawned by the phone-thief snatch animation.
    // Each: {x, y, vx, vy, spawnedAt, life, frameOffset}
    coinParticles: [],
    // Cross-traffic cop cars — drive horizontally across the road
    // perpendicular to Mike's direction. Each:
    //   {x, y, w, h, vx, dir (-1=left, +1=right), spawnedAt, hit}
    crossCars: [],
    crossCarSpawnTimer: 0,
    crossCarNextSpawnMs: 0,
    // Background fauna — sidewalk-walking pigeons/cats/dogs/goats.
    // Each: {x, y, w, h, sprite, bobPhase, bobAmp, spawnedAt}
    fauna: [],
    faunaSpawnTimer: 0,
    faunaNextSpawnMs: 0,
    // Stoned-chase officers — spawned when Mike grabs weed, despawn
    // when the debuff ends. Each: {x, y, w, h, lane, sprite, spawnedAt,
    // bobPhase}. Pure ambient (no collision).
    chaseOfficers: [],
    // Hurricane / water segment state machine.
    water: {
      phase: 'none',        // 'none' | 'entering' | 'water' | 'exiting'
      startedAt: 0,         // wall-clock ms of phase entry
      lastTriggeredAt: 0,   // distance (m) of last water trigger; 0 = never
      lastLightningAt: 0,
      nextLightningAt: 0,
      lightningUntil: 0,    // wall-clock ms until current flash ends
      raindrops: [],        // [{x, y, vy, len}]
      // Shoovy's sailboat that approaches Mike from screen bottom mid-
      // water and triggers the meeting cutscene. {x, y, w, h, spawnedAt}
      // or null when not active.
      shoovyBoat: null,
      shoovyTriggered: false, // true once the cutscene has fired this segment
      completed: false,       // true once the segment fully ended; blocks repeats
    },
    // Random death-pose sprite picked at endRun. Rendered on the road
    // (drawPlayer) AND in the gameover overlay panel so they match.
    gameOverDeathKey: null,
    // Dev god mode — set from ?god=1 URL param. While true, Mike's
    // lives never decrement, attempt counter increment is skipped, and
    // score-submit dialog is suppressed. HUD shows a small badge.
    godMode: false,
    // Coin-reward flash overlay — fires on big coin grants like the
    // post-water Adin gift. {amount, startedAt, durationMs} or null.
    coinRewardFlash: null,
    // New-record celebration overlay (v0.18.51) — fires once per run
    // when state.distance crosses leaderboardTopScore. Skipped if the
    // leaderboard is empty (top===0) or hasn't loaded yet (null).
    leaderboardTopScore: null,
    newRecordTriggered: false,
    newRecordFlash: null,
    // ============================================================
    // JAIL FEATURE (v0.18.52). Mike gets jailed on his 2nd cumulative
    // cop touch (cop cars + cross-traffic cops both count; chase
    // officers don't currently collide). Counter resets on death,
    // quit, or successful bail.
    // ============================================================
    copTouches: 0,         // cumulative cop hits this run (resets at jail-bail)
    bailCount: 0,          // self-bails so far this run (drives price doubling)
    jail: {
      // Phase machine for the jail sequence:
      //   'none'       — not jailed, normal play
      //   'busted'     — BUSTED flash + sirencops.mp3, world frozen,
      //                  ~2.4s before transitioning to 'cell'
      //   'cell'       — jail bg + dialogue overlay; awaiting choice
      //   'bailing'    — bailed-out.mp3 + fade-back to gameplay
      phase: 'none',
      startedAt: 0,        // wall-clock ms of phase entry (used for blink
                           //  loop on jail bg + BUSTED flash math)
      // Saved checkpoint so a self-bail can restore Mike at the spot
      // he was caught (with the soft 150m roll-back per design).
      checkpointDistance: 0,
      checkpointLane: 0,
    },
  };

  // ============================================================
  // Asset loading.
  // ============================================================
  function loadOne(key, path) {
    return new Promise(function (resolve) {
      var img = new Image();
      var done = false;
      var settle = function () {
        if (done) return;
        done = true;
        resolve();
      };
      img.onload = function () { sprites[key] = img; settle(); };
      img.onerror = function () {
        console.warn('Failed to load sprite:', path);
        settle(); // don't block startup; missing sprite just won't render
      };
      img.src = path;
      // CRITICAL: timeout fallback. On mobile networks a single hung
      // image request can stall the entire Promise.all forever, leaving
      // the game stuck in loading phase and the canvas blank — exactly
      // the bug reported on mobile. After 12 sec we resolve anyway so
      // boot proceeds; the missing sprite just won't render.
      setTimeout(settle, 12000);
    });
  }

  function loadAll() {
    var keys = Object.keys(SPRITE_PATHS);
    return Promise.all(keys.map(function (k) {
      return loadOne(k, SPRITE_PATHS[k]);
    }));
  }

  // ============================================================
  // Canvas + resize.
  // ============================================================
  function resize() {
    // Use device pixel ratio for crisp rendering on retina, but cap at
    // 2x so we don't murder mobile GPUs at 3x DPR.
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = viewW();
    var h = viewH();
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels
  }

  // CSS-pixel dimensions. Defensive on mobile: visualViewport tracks the
  // ACTUAL visible region (excluding the address bar / soft keyboard),
  // documentElement.clientWidth/Height ignores scrollbars and is the
  // most reliable cross-browser measure. window.innerWidth/Height can
  // be off by the scrollbar width on some mobile Safari versions.
  function viewW() {
    if (window.visualViewport && window.visualViewport.width) {
      return Math.round(window.visualViewport.width);
    }
    return document.documentElement.clientWidth || window.innerWidth;
  }
  function viewH() {
    if (window.visualViewport && window.visualViewport.height) {
      return Math.round(window.visualViewport.height);
    }
    return document.documentElement.clientHeight || window.innerHeight;
  }

  function laneX(lane) {
    return laneXOnRoad(lane);
  }

  function playerY() {
    // Mike is now PINNED NEAR THE TOP of the screen — he's running
    // DOWN-hill, so the top of the screen represents higher elevation
    // and the bottom is where the road descends to. Obstacles spawn at
    // the bottom (far ahead in the distance below) and travel UP toward
    // Mike's fixed Y position.
    // Returns the Y coordinate of Mike's FEET (sprite is bottom-anchored).
    return viewH() * 0.32;
  }

  // ============================================================
  // Input — keyboard + tap zones.
  // ============================================================
  function shiftLane(direction) {
    if (state.phase !== 'playing') return;
    // Phone-thief reversed-controls effect: invert left/right while
    // the timer is still running. Player intent stays the same but the
    // dodge they meant to make goes the opposite way.
    if (performance.now() < state.effects.controlsReversedUntil) {
      direction = -direction;
    }
    var newLane = state.player.targetLane + direction;
    if (newLane < 0 || newLane >= LANES) return;
    state.player.targetLane = newLane;
    state.player.lerpX = 0; // restart lerp from current position
    playSfx('swoosh');
  }

  function triggerJump() {
    if (state.phase !== 'playing' || state.paused) return;
    if (state.jail && state.jail.phase !== 'none') return; // no jumping in jail
    var now = performance.now();
    // Block re-jumping mid-air (force a clean landing first)
    if (now - state.player.jumpStart < JUMP_DURATION * 1000) return;
    state.player.jumpStart = now;
    playSfx('jump');
    ga('jump', { at_distance: Math.floor(state.distance) });
  }
  function isAirborne(now) {
    var elapsed = now - state.player.jumpStart;
    return elapsed >= 0 && elapsed < JUMP_DURATION * 1000;
  }
  // Returns vertical lift offset (negative = up) for the player at this moment
  function jumpLiftPx(now) {
    if (!isAirborne(now)) return 0;
    var t = (now - state.player.jumpStart) / (JUMP_DURATION * 1000); // 0..1
    // Parabolic arc: 4t(1-t) peaks at 1.0 when t=0.5
    var arc = 4 * t * (1 - t);
    return -arc * (viewH() * JUMP_HEIGHT_FRAC);
  }

  function bindInput() {
    window.addEventListener('keydown', function (e) {
      if (e.repeat) return;
      var key = e.key;
      if (state.phase === 'menu' || state.phase === 'gameover') {
        // v0.18.58 — don't fire the Enter / Space restart shortcut if
        // the user is typing in a form control. Submit-score dialog
        // input + kick-username input both use Enter to mean "submit
        // this form"; pre-fix the global listener fired startRun()
        // simultaneously, so a player typing their handle after a
        // death and pressing Enter to submit would restart the game
        // mid-submit. Now we ignore Enter/Space when an input/textarea/
        // select/contenteditable has focus.
        var active = document.activeElement;
        var typingInForm = active && (
          active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.tagName === 'SELECT' ||
          active.isContentEditable
        );
        if (!typingInForm && (key === ' ' || key === 'Enter')) startRun();
        return;
      }
      // Cut scene — keyboard navigation for choice buttons. Arrow up/down
      // moves the highlight, Enter / Space activates the highlighted
      // choice. Only available once the dialogue has finished typing in
      // and the choice buttons are showing.
      if (cutscene.active) {
        if (cutscene.showingChoices) {
          if (key === 'ArrowUp' || key === 'w' || key === 'W') {
            moveCutsceneSelection(-1);
            e.preventDefault();
            return;
          }
          if (key === 'ArrowDown' || key === 's' || key === 'S') {
            moveCutsceneSelection(+1);
            e.preventDefault();
            return;
          }
          if (key === 'Enter' || key === ' ') {
            activateCutsceneSelection();
            e.preventDefault();
            return;
          }
        }
        return;
      }
      // Playing — handle pause + lane shift
      if (key === 'p' || key === 'P' || key === 'Escape') {
        togglePause(); e.preventDefault(); return;
      }
      // Space + ArrowUp + W = JUMP (over jump-only obstacles like cop cars)
      if (key === ' ' || key === 'ArrowUp' || key === 'w' || key === 'W') {
        e.preventDefault();
        triggerJump();
        return;
      }
      if (state.paused) return; // ignore lane input while paused
      if (state.jail && state.jail.phase !== 'none') return; // ditto for jail
      if (key === 'ArrowLeft' || key === 'a' || key === 'A') {
        shiftLane(-1); e.preventDefault();
      } else if (key === 'ArrowRight' || key === 'd' || key === 'D') {
        shiftLane(+1); e.preventDefault();
      }
    });

    // Tap input — left half of screen = move left, right half = right.
    // We listen on document so the HUD/overlays don't swallow taps.
    function tapHandler(e) {
      if (state.phase !== 'playing') return;
      if (state.paused) return; // tap-to-resume handled by the pause overlay click
      if (cutscene.active) return; // cut scene UI uses its own button clicks
      // If the tap came from a button or overlay, let the click bubble.
      if (e.target.closest('button') || e.target.closest('.overlay:not(.hidden)')) {
        return;
      }
      // Mouse button routing:
      //   LEFT  (0) -> lane shift based on tap-x half
      //   MIDDLE (1) -> JUMP (parity with SPACE / ArrowUp / W)
      //   RIGHT (2) -> reserved for pause via contextmenu listener
      if (e.type === 'mousedown') {
        if (e.button === 1) {
          // Some browsers open auto-scroll on middle-click; suppress it.
          e.preventDefault();
          triggerJump();
          return;
        }
        if (e.button !== 0) return;
      }
      var x;
      if (e.type === 'touchstart') {
        x = e.touches[0].clientX;
        e.preventDefault();
      } else {
        x = e.clientX;
      }
      shiftLane(x < window.innerWidth / 2 ? -1 : +1);
    }
    document.addEventListener('touchstart', tapHandler, { passive: false });
    document.addEventListener('mousedown', tapHandler);
    // Middle-click on some platforms also fires `auxclick` — block its
    // default (browser auto-scroll cursor) so jumping doesn't leave a
    // scroll-cursor stuck on screen.
    document.addEventListener('auxclick', function (e) {
      if (e.button === 1 && state.phase === 'playing') e.preventDefault();
    });

    // Right-click (contextmenu) toggles pause during play. Suppress the
    // browser context menu either way so it doesn't pop up over the game.
    document.addEventListener('contextmenu', function (e) {
      // Allow context menu on form inputs (so the leaderboard input
      // dialog still has paste etc.)
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
        return;
      }
      e.preventDefault();
      if (state.phase === 'playing') togglePause();
    });
  }

  // ============================================================
  // Sprite-aware sizing helpers.
  // Scale factor derived from the source sprite's natural dimensions
  // so all sprites in a category render at consistent screen height.
  // ============================================================
  function scaledSize(spriteKey, targetHeightFrac) {
    var img = sprites[spriteKey];
    if (!img) return { w: 60, h: 60 };
    var targetH = viewH() * targetHeightFrac;
    var scale = targetH / img.height;
    return { w: img.width * scale, h: targetH };
  }

  // ============================================================
  // Spawn.
  // ============================================================
  function pickRandomLane(avoidLane) {
    var lanes = [0, 1, 2].filter(function (l) { return l !== avoidLane; });
    return lanes[Math.floor(Math.random() * lanes.length)];
  }

  function spawnObstacle() {
    var type = OBSTACLE_TYPES[Math.floor(Math.random() * OBSTACLE_TYPES.length)];
    // Use the first frame for sizing (all frames in a type came from
    // the same source sheet so they share canvas dimensions).
    var size = scaledSize(type.frames[0], OBSTACLE_TARGET_HEIGHT_FRAC);
    var lane = Math.floor(Math.random() * LANES);
    state.obstacles.push({
      lane: lane,
      y: viewH() + size.h,         // start BELOW visible area (will travel UP)
      type: type,
      spawnedAt: performance.now(),
      bobPhase: Math.random() * Math.PI * 2, // randomize so multiple walkers don't bob in sync
      w: size.w,
      h: size.h,
      hit: false,
    });
    return lane; // so coin spawner can avoid the same lane
  }

  // Bonus phone-thief spawn for the post-water difficulty ramp. Picks
  // one of the two reaching-pedestrian variants (left-handed grab vs
  // right-handed grab via the flipped sheet) and drops it in a lane
  // OTHER than avoidLane so the player has to track two threats at
  // once. Otherwise both spawns can land in the same lane and the
  // second snatcher is functionally invisible behind the first.
  function spawnExtraPhoneThief(avoidLane) {
    var thiefIds = ['walk-reaching', 'walk-reaching-flipped'];
    var pickId = thiefIds[Math.floor(Math.random() * thiefIds.length)];
    var type = null;
    for (var i = 0; i < OBSTACLE_TYPES.length; i++) {
      if (OBSTACLE_TYPES[i].id === pickId) { type = OBSTACLE_TYPES[i]; break; }
    }
    if (!type) return; // defensive — shouldn't happen but no-op if so
    var size = scaledSize(type.frames[0], OBSTACLE_TARGET_HEIGHT_FRAC);
    // Pick a lane that isn't avoidLane. With LANES=3 we just shift by
    // a random non-zero offset so the result is guaranteed different.
    var lane = (avoidLane + 1 + Math.floor(Math.random() * (LANES - 1))) % LANES;
    state.obstacles.push({
      lane: lane,
      y: viewH() + size.h,
      type: type,
      spawnedAt: performance.now(),
      bobPhase: Math.random() * Math.PI * 2,
      w: size.w,
      h: size.h,
      hit: false,
    });
  }

  // v0.18.56 — When Mike is stoned (weed debuff active), bonus cop
  // car spawns. Reads as "police presence ramps up because he's
  // visibly impaired." Picked in a non-avoidLane so the player
  // always has at least one safe option to dodge into. Only fires
  // while weed is active, scaled by the spawn-tick chance set at
  // the call site.
  function spawnExtraCopCar(avoidLane) {
    var type = null;
    for (var i = 0; i < OBSTACLE_TYPES.length; i++) {
      if (OBSTACLE_TYPES[i].id === 'cop-car') { type = OBSTACLE_TYPES[i]; break; }
    }
    if (!type) return;
    var size = scaledSize(type.frames[0], OBSTACLE_TARGET_HEIGHT_FRAC);
    var lane = (avoidLane + 1 + Math.floor(Math.random() * (LANES - 1))) % LANES;
    state.obstacles.push({
      lane: lane,
      y: viewH() + size.h,
      type: type,
      spawnedAt: performance.now(),
      bobPhase: Math.random() * Math.PI * 2,
      w: size.w,
      h: size.h,
      hit: false,
    });
  }

  // ============================================================
  // HURRICANE / WATER SEGMENT
  // ============================================================

  // Called every frame in update(). If conditions are met, kicks off
  // the pre-water cutscene (which then chains into startWaterPhase via
  // its onComplete) OR starts the water phase directly when there's
  // no Ice to do the cutscene with.
  function maybeTriggerWater() {
    if (state.water.phase !== 'none') return;
    if (cutscene.active) return;
    // SINGLE-SHOT POLICY: water now fires ONCE per run unless dev
    // explicitly opts back into recurrence. After the first segment
    // exits, lastTriggeredAt is non-zero AND state.water.completed
    // is true; this gate blocks subsequent triggers.
    if (state.water.completed) return;
    var distSinceLast = state.distance - state.water.lastTriggeredAt;
    var threshold = state.water.lastTriggeredAt === 0
      ? WATER_FIRST_DISTANCE_M
      : WATER_INTERVAL_M;
    if (distSinceLast < threshold) return;
    // First-water cutscene chain:
    //   - Ice still with Mike → before-water (North Pole) → adin-ross → water
    //   - Ice already gone    → adin-ross → water
    // Subsequent waters skip the cutscene chain and dive straight in.
    var firstWater = state.water.lastTriggeredAt === 0;
    if (firstWater && state.iceSidekickJoined && !state.cutscenesTriggered['before-water']) {
      state.cutscenesTriggered['before-water'] = true;
      // before-water's onComplete chains to adin-ross, whose onComplete
      // starts the water phase.
      startCutscene('before-water');
    } else if (firstWater && !state.cutscenesTriggered['adin-ross']) {
      state.cutscenesTriggered['adin-ross'] = true;
      startCutscene('adin-ross');
    } else {
      startWaterPhase();
    }
  }

  function startWaterPhase() {
    var now = performance.now();
    state.water.phase = 'entering';
    state.water.startedAt = now;
    state.water.lastTriggeredAt = state.distance;
    // Clear any in-flight street objects so they don't keep scrolling
    // on top of the sea. Pickups too — collecting a ham mid-ocean
    // would be weird. Coin particles let cull naturally.
    state.obstacles = [];
    state.coinsArr = [];
    state.pickups = [];
    state.crossCars = [];
    state.fauna = [];
    state.chaseOfficers = [];
    // Ice does not exist in the water — Mike's solo on the mattress.
    // Force-clear in case some code path got here without going through
    // the before-water cutscene (e.g., dev URL ?water=1 skip).
    state.iceSidekickJoined = false;
    state.iceTrailing = false;
    // Audio swap: stop street ambient, start water + rain bed
    stopLoop('mob-angry');
    startLoop('water-loop');
    startLoop('rain-loop');
    // Spawn the initial swarm of raindrops at random offsets
    seedRaindrops();
    // Schedule first lightning flash a bit into the segment
    state.water.nextLightningAt = now + 800 + Math.random() * 1200;
    state.water.lightningUntil = 0;
    state.water.shoovyBoat = null;
    state.water.shoovyTriggered = false;
    ga('water_segment_started', { at_distance: Math.floor(state.distance) });
  }

  // Advances the water state machine (entering → water → exiting →
  // none) and fires lightning + spawns/moves raindrops while active.
  function tickWater(now) {
    if (state.water.phase === 'none') return;
    var elapsed = now - state.water.startedAt;
    if (state.water.phase === 'entering' && elapsed >= WATER_ENTER_MS) {
      state.water.phase = 'water';
    } else if (state.water.phase === 'water' && elapsed >= WATER_ENTER_MS + WATER_BODY_MS) {
      state.water.phase = 'exiting';
      // Boat doesn't follow Mike onto the boat ramp — it lives in open
      // water only. Clear it on transition to exiting if still around.
      state.water.shoovyBoat = null;
    } else if (state.water.phase === 'exiting' && elapsed >= WATER_TOTAL_MS) {
      // Phase done — restore street ambient + cut ALL hurricane audio.
      // Stop the loops and any in-flight thunder one-shots so the
      // street resumes in clean silence (apart from mob ambient).
      var hadShoovyEncounter = state.water.shoovyTriggered;
      state.water.phase = 'none';
      state.water.completed = true;     // SINGLE-SHOT: blocks repeat triggers
      state.water.raindrops = [];
      state.water.lightningUntil = 0;
      stopLoop('water-loop');
      stopLoop('rain-loop');
      for (var ti = 0; ti < THUNDER_VARIANTS.length; ti++) {
        stopLoop(THUNDER_VARIANTS[ti]);
      }
      if (state.phase === 'playing') startLoop('mob-angry');
      // v0.18.59 SHOOVY SUNSET CELEBRATION — only fires if Mike
      // actually met Shoovy mid-water. Brief 4s pose (puffin-88,
      // Shoovy sailing into the sunset) drawn in the upper-right
      // canvas corner with fade-in/fade-out. Storytelling beat:
      // "Shoovy made it out too, sailing off into the distance."
      if (hadShoovyEncounter) {
        state.shoovySunsetUntil = performance.now() + 4000;
      }
      // POST-WATER ADIN REWARD — only if Mike actually met Shoovy
      // (the cutscene fired). Adin pops back in, reneges on the $70k,
      // tosses 10 Cx as a consolation. Fires once per segment via
      // shoovyTriggered flag (which gets reset on next startWaterPhase).
      if (hadShoovyEncounter && !state.cutscenesTriggered['adin-post-water']) {
        state.cutscenesTriggered['adin-post-water'] = true;
        // Defer one frame so the water-phase cleanup completes first.
        setTimeout(function () { startCutscene('adin-post-water'); }, 50);
      }
    }

    if (state.water.phase === 'none') return;

    // Lightning trigger — fires a screen flash AND a random thunder
    // variant on the SAME frame so the audio cracks at the same instant
    // the screen lights up (real lightning + thunder are perceived
    // simultaneously when nearby — this is a hurricane right on top
    // of Mike). 3-variant random pool so back-to-back claps don't
    // repeat the same sample.
    if (now >= state.water.nextLightningAt) {
      state.water.lightningUntil = now + WATER_LIGHTNING_FLASH_MS;
      state.water.nextLightningAt = now + WATER_LIGHTNING_INTERVAL_MS
        + Math.random() * WATER_LIGHTNING_INTERVAL_JITTER_MS;
      var thunderKey = THUNDER_VARIANTS[Math.floor(Math.random() * THUNDER_VARIANTS.length)];
      playSfx(thunderKey);
    }

    // SHOOVY MID-WATER — only relevant during the water body. Spawns
    // boat at SHOOVY_BOAT_SPAWN_MS into the phase, scrolls it up at
    // SHOOVY_BOAT_VY (slower than world so it visibly approaches Mike),
    // fires the meeting cutscene when boat reaches the trigger Y.
    if (state.water.phase === 'water' && !state.water.shoovyTriggered) {
      var bodyElapsed = elapsed - WATER_ENTER_MS;
      if (bodyElapsed >= SHOOVY_BOAT_SPAWN_MS && !state.water.shoovyBoat) {
        // Spawn boat at the bottom of the screen, centered horizontally.
        var bSize = scaledSize('shoovy-sail-01', SHOOVY_BOAT_HEIGHT_FRAC);
        if (bSize.w && bSize.h) {
          state.water.shoovyBoat = {
            x: viewW() / 2,           // centered (boat will draw centered on this)
            y: viewH() + bSize.h / 2, // start fully off-screen at the bottom
            w: bSize.w,
            h: bSize.h,
            spawnedAt: now,
          };
        }
      }
      if (state.water.shoovyBoat) {
        // Use a per-frame dt accumulator (we're in tickWater which runs
        // once per frame). Approximate dt ~16ms; safer is the wall-clock
        // delta since spawn.
        var b = state.water.shoovyBoat;
        // Move up slowly — vy is per-second so multiply by ~16ms/1000.
        // Actually for stable framerate-independent motion, use the
        // last-frame dt. Since tickWater is called from update() which
        // already has dt in scope, use a simple wall-clock delta here.
        if (!b.lastTickAt) b.lastTickAt = now;
        var bdt = (now - b.lastTickAt) / 1000;
        b.lastTickAt = now;
        b.y -= SHOOVY_BOAT_VY * bdt;
        // Trigger cutscene when boat top reaches the threshold Y.
        var triggerY = viewH() * SHOOVY_BOAT_TRIGGER_Y_FRAC;
        if ((b.y - b.h / 2) <= triggerY) {
          state.water.shoovyTriggered = true;
          startCutscene('shoovy-meeting');
        }
      }
    }

    // Raindrops — physics tick. Reset to top when off-screen bottom
    // (rain is constant during the segment, no spawn cadence needed).
    var vh = viewH();
    var vw = viewW();
    for (var i = 0; i < state.water.raindrops.length; i++) {
      var d = state.water.raindrops[i];
      d.y += d.vy;
      // Slight horizontal drift for hurricane-wind feel
      d.x -= d.vy * 0.18;
      if (d.y > vh + d.len || d.x < -20) {
        // Recycle: respawn at random Y above viewport top + random X
        d.x = Math.random() * (vw + 100);
        d.y = -Math.random() * vh * 0.5 - d.len;
      }
    }
  }

  function seedRaindrops() {
    state.water.raindrops = [];
    var vh = viewH();
    var vw = viewW();
    for (var i = 0; i < WATER_RAIN_DROPS; i++) {
      // vy is per-frame px (assumes ~16ms tick); use a range so close
      // drops fall faster than far drops (parallax depth fake).
      var vy = 14 + Math.random() * 14;
      var len = 14 + Math.random() * 18;
      state.water.raindrops.push({
        x: Math.random() * (vw + 100),
        y: Math.random() * vh,
        vy: vy,
        len: len,
      });
    }
  }

  // STONED CHASE — spawn a posse of officers behind Mike that walk
  // upward toward him for the duration of the weed debuff. They never
  // catch up (their effective speed is slightly less than the world
  // scroll) but their presence on screen reads as "the city is onto
  // you while you're high in public."
  function spawnStonedChase() {
    if (state.distance < STONED_CHASE_START_DISTANCE_M) return;
    var count = STONED_CHASE_MIN_OFFICERS
      + Math.floor(Math.random() * (STONED_CHASE_MAX_OFFICERS - STONED_CHASE_MIN_OFFICERS + 1));
    var now = performance.now();
    // Pick variants WITHOUT replacement so a posse of 4 officers
    // shows 4 distinct characters (until we run out of variants —
    // then we wrap and start repeating, which is fine).
    var variantPool = COP_OFFICER_VARIANTS.slice();
    // Shuffle in place
    for (var s = variantPool.length - 1; s > 0; s--) {
      var sj = Math.floor(Math.random() * (s + 1));
      var tmp = variantPool[s]; variantPool[s] = variantPool[sj]; variantPool[sj] = tmp;
    }
    for (var i = 0; i < count; i++) {
      var variant = variantPool[i % variantPool.length];
      // Each officer's sprite has its own size (different chars =
      // different dimensions). Compute per-officer instead of using a
      // single shared `size` from one reference frame.
      var size = scaledSize(variant[0], STONED_CHASE_OFFICER_HEIGHT_FRAC);
      if (!size.w || !size.h) continue;
      var lane = Math.floor(Math.random() * LANES);
      var yJitter = Math.random() * size.h * 0.8;
      state.chaseOfficers.push({
        lane: lane,
        y: viewH() + size.h + yJitter,
        w: size.w,
        h: size.h,
        sprites: variant,                    // 2-frame walk cycle for this officer
        spawnedAt: now,
        bobPhase: Math.random() * Math.PI * 2,
        // Per-officer frame offset so two officers using the same
        // variant still don't step in lockstep.
        frameOffset: Math.floor(Math.random() * variant.length) * STONED_CHASE_FRAME_MS,
      });
    }
    ga('stoned_chase_spawned', { at_distance: Math.floor(state.distance), count: count });
  }

  // Background fauna — pick a random species (weighted), random frame
  // from that species' pool, and a sidewalk side. Spawn just below
  // visible area; will scroll up with effSpeed.
  function pickWeightedFaunaType() {
    var totalW = FAUNA_TYPES.reduce(function (a, t) { return a + t.weight; }, 0);
    var r = Math.random() * totalW;
    for (var i = 0; i < FAUNA_TYPES.length; i++) {
      r -= FAUNA_TYPES[i].weight;
      if (r <= 0) return FAUNA_TYPES[i];
    }
    return FAUNA_TYPES[0];
  }

  function spawnFauna() {
    var t = pickWeightedFaunaType();
    var frameIdx = Math.floor(Math.random() * t.frameCount) + 1;
    var spriteKey = t.framePrefix + (frameIdx < 10 ? '0' + frameIdx : frameIdx);
    var size = scaledSize(spriteKey, t.heightFrac);
    if (!size.w || !size.h) return; // sprite not loaded yet, skip
    var w = viewW();
    // Sidewalk strip is the 7% margin outside the 5 driving lanes
    // (matches laneXOnRoad's `sidewalkW = w * 0.07`). Pick a random
    // X within that strip on either side, with a small inset so
    // creatures don't render half-clipped at the viewport edge.
    var sidewalkW = w * 0.07;
    var inset = Math.min(sidewalkW * 0.2, size.w * 0.3);
    // v0.18.51: occasionally one will scurry ACROSS the road instead
    // of trundling up a sidewalk. Pure ambient — fauna are still
    // harmless, no collision check anywhere. ~12% of spawns cross.
    var crossing = Math.random() < 0.12;
    var x, vx;
    if (crossing) {
      // Pick a side to enter from; vx points toward the other side.
      // Speed is fast-ish so it doesn't loiter mid-road for ages.
      var fromLeft = Math.random() < 0.5;
      x = fromLeft ? -size.w - 8 : w + 8;
      vx = (fromLeft ? 1 : -1) * (260 + Math.random() * 120);  // px/sec
    } else {
      var side = Math.random() < 0.5 ? 'L' : 'R';
      if (side === 'L') {
        // x is the LEFT edge of the sprite within left sidewalk
        x = inset + Math.random() * Math.max(0, sidewalkW - size.w - inset);
      } else {
        x = (w - sidewalkW) + Math.random() * Math.max(0, sidewalkW - size.w - inset);
      }
      vx = 0;
    }
    state.fauna.push({
      x: x,
      y: viewH() + size.h + 60,
      w: size.w,
      h: size.h,
      sprite: spriteKey,
      bobPhase: Math.random() * Math.PI * 2,
      bobAmp: t.bobAmp,
      spawnedAt: performance.now(),
      vx: vx,                  // 0 = sidewalk loiterer, !=0 = cross-road dasher
      crossing: crossing,
    });
  }

  // Cross-traffic cop car — spawns from off-screen left or right and
  // drives across the road perpendicular to Mike's direction. Uses the
  // overhead-view sprite (cop-overhead-XX), which is rotated 90° at
  // render time. So the on-SCREEN dimensions after rotation are:
  //   visualHorizontalExtent = size.h  (source's TALL axis)
  //   visualVerticalExtent   = size.w  (source's WIDE axis)
  // We store size.w/size.h as-is and account for the swap in the
  // spawn/cull/collision math.
  function spawnCrossCar() {
    var size = scaledSize('cop-overhead-01', CROSS_CAR_HEIGHT_FRAC);
    var dir = Math.random() < 0.5 ? -1 : +1;
    // Use the post-rotation horizontal extent (size.h) so the car
    // spawns FULLY off-screen, not half-poking out at the start.
    var startX = dir > 0 ? -size.h : viewW() + size.h;
    // Y range: near Mike's foot line +/- 4% viewH so it overlaps Mike's
    // hitbox when crossing his lane. Random within that band so cars
    // don't all cross at the exact same Y. size.w is the visual
    // vertical extent post-rotation.
    var y = playerY() - size.w * 0.85 + (Math.random() * 0.04 - 0.02) * viewH();
    state.crossCars.push({
      x: startX,
      y: y,
      baseY: y,           // original Y line — swerve oscillates around this
      w: size.w,          // source-w = visual vertical extent post-rotation
      h: size.h,          // source-h = visual horizontal extent post-rotation
      vx: CROSS_CAR_SPEED * dir,
      dir: dir,
      spawnedAt: performance.now(),
      hit: false,
      swerveStartedAt: 0, // set when the car triggers its feint near Mike
    });
  }

  function getObstacleSprite(o, now) {
    var t = o.type;
    if (!t.frames.length) return null;
    if (t.frames.length === 1 || !t.frameMs) return t.frames[0];
    var idx = Math.floor((now - o.spawnedAt) / t.frameMs) % t.frames.length;
    return t.frames[idx];
  }

  function getObstacleDrift(o, now) {
    if (!o.type.bobPx) return 0;
    // Sine wobble — gives the look of a person swaying as they walk
    return Math.sin((now - o.spawnedAt) / 380 + o.bobPhase) * o.type.bobPx;
  }

  function spawnCoin(avoidLane) {
    var size = scaledSize('cx-coin-01', COIN_TARGET_HEIGHT_FRAC);
    state.coinsArr.push({
      lane: pickRandomLane(avoidLane),
      y: viewH() + size.h + 80, // a bit further than the obstacle so they don't overlap
      w: size.w,
      h: size.h,
      picked: false,
    });
  }

  function pickWeightedPickupType() {
    var totalWeight = PICKUP_TYPES.reduce(function (a, t) { return a + t.weight; }, 0);
    var r = Math.random() * totalWeight;
    for (var i = 0; i < PICKUP_TYPES.length; i++) {
      r -= PICKUP_TYPES[i].weight;
      if (r <= 0) return PICKUP_TYPES[i];
    }
    return PICKUP_TYPES[0];
  }

  function spawnPickup(avoidLane) {
    var type = pickWeightedPickupType();
    // Per-type height override (horse renders MUCH bigger than the
    // generic pickup size since it's a real animal silhouette, not a
    // small collectible item).
    var heightFrac = type.heightFracOverride || PICKUP_TARGET_HEIGHT_FRAC;
    var size = scaledSize(type.frames[0], heightFrac);
    // HORSE spawns on the SIDEWALK only — placed in lane 0 or lane LANES-1
    // (the edge lanes) so the player has to swerve to the side of the
    // road to grab it. Other pickups spawn anywhere as before.
    var lane;
    if (type.kind === 'horse') {
      lane = (Math.random() < 0.5) ? 0 : (LANES - 1);
    } else {
      lane = pickRandomLane(avoidLane);
    }
    state.pickups.push({
      lane: lane,
      y: viewH() + size.h + 140,
      type: type,
      spawnedAt: performance.now(),
      w: size.w,
      h: size.h,
      picked: false,
    });
  }

  function getPickupSprite(p, now) {
    var t = p.type;
    if (t.frames.length === 1 || !t.frameMs) return t.frames[0];
    var idx = Math.floor((now - p.spawnedAt) / t.frameMs) % t.frames.length;
    return t.frames[idx];
  }

  // Coin-reward flash overlay — fires on big coin grants (currently
  // just the post-water Adin gift). Shows "+N Cx" centered with a
  // spinning cx-coin sprite next to it, scales in then fades out.
  // Also plays the coin-pickup SFX a few times rapidly to sell the
  // grant audibly. Drawn from drawEffects each frame while active.
  // ============================================================
  // JAIL FEATURE (v0.18.52)
  // ============================================================

  // Constants
  var JAIL_BAIL_PRICE_BASE   = 75;     // 1st jail bail cost
  var JAIL_BUSTED_FLASH_MS   = 3600;   // BUSTED text flash duration (bumped 2400 -> 3600 per user)
  var JAIL_RESUME_ROLLBACK_M = 150;    // soft penalty on self-bail
  var JAIL_BAIL_FADE_MS      = 1400;   // fade-back duration to gameplay
  var JAIL_BG_BLINK_MS       = 600;    // eye-blink loop on jail bg

  // Returns the bail price for the player's CURRENT bail attempt.
  // Doubles each prior self-bail this run: 75 → 150 → 300 → 600...
  function jailBailPrice() {
    return JAIL_BAIL_PRICE_BASE * Math.pow(2, state.bailCount);
  }

  // Cop touch interceptor — called from BOTH the lane-cop-car
  // collision and cross-traffic cop-car collision. Increments the
  // counter; on the 2nd hit, triggers jail INSTEAD of life loss.
  // Returns true if the caller should skip the regular life-loss /
  // death code path (i.e., we entered jail this frame).
  function handleCopHit(now) {
    if (state.godMode) return false;        // dev mode never gets jailed
    if (state.jail.phase !== 'none') return true; // already jailed
    state.copTouches += 1;
    if (state.copTouches >= 2) {
      enterJail(now);
      return true;     // skip life-loss path
    }
    // First cop hit — fall through to normal life-loss behavior.
    return false;
  }

  function enterJail(now) {
    if (now == null) now = performance.now();
    state.jail.phase = 'busted';
    state.jail.startedAt = now;
    state.jail.checkpointDistance = state.distance;
    state.jail.checkpointLane = state.player.targetLane;
    state.invulnUntil = now + 999999;        // freeze hit detection
    // Pause every looping audio track. We resume the right ones on
    // bail-out, or stop them entirely on quit.
    Object.keys(AUDIO_DEFS).forEach(function (k) {
      var def = AUDIO_DEFS[k];
      if (!def.loop) return;
      var inst = audioInstances[k];
      if (inst && !inst.paused) inst.pause();
    });
    // Sirens during the BUSTED flash.
    playSfx('sirencops');
    ga('jailed', {
      at_distance: Math.floor(state.distance),
      cop_touches: state.copTouches,
      bail_count_so_far: state.bailCount,
    });
  }

  // Tick called from update() / render() — handles the BUSTED → cell
  // transition once the flash duration is up. Optionally chains
  // through the ice-bails-on-mike cutscene if Ice was tagging along
  // when Mike got busted (v0.18.56).
  function tickJail(now) {
    if (state.jail.phase === 'busted') {
      if (now - state.jail.startedAt >= JAIL_BUSTED_FLASH_MS) {
        // If Ice was following Mike when the bust happened, fire the
        // "uhhh, so yeah, I'll call you." cutscene first. Its onComplete
        // drops Ice + transitions to the cell phase + starts jail loops.
        // If Ice wasn't around, skip directly to the cell.
        if (state.iceSidekickJoined) {
          state.jail.phase = 'ice-leaving';
          state.jail.startedAt = now;
          startCutscene('ice-bails-on-mike');
        } else {
          state.jail.phase = 'cell';
          state.jail.startedAt = now;
          showJailOverlay();
          startLoop('jailed');
          startLoop('policejail');
        }
      }
    }
  }

  function showJailOverlay() {
    var ov = document.getElementById('overlay-jail');
    if (!ov) return;
    ov.classList.remove('hidden');
    // Update bail-self button label with the current price.
    var payBtn = document.getElementById('jail-pay');
    if (payBtn) {
      var price = jailBailPrice();
      var canAfford = state.coins >= price;
      payBtn.textContent = 'PAY ' + price + ' Cx';
      payBtn.disabled = !canAfford;
      payBtn.classList.toggle('is-disabled', !canAfford);
    }
  }

  function hideJailOverlay() {
    var ov = document.getElementById('overlay-jail');
    if (ov) ov.classList.add('hidden');
  }

  // PAY ___ Cx — self-bail. Deducts coins, increments bail counter
  // (so next jail is 2x more expensive), resets cop touches, rolls
  // distance back ~150m, plays bailed-out.mp3, fades back to gameplay.
  function jailBailSelf() {
    var price = jailBailPrice();
    if (state.coins < price) return;          // shouldn't happen — UI gates
    state.coins -= price;
    state.bailCount += 1;
    state.copTouches = 0;
    // Soft penalty: roll the distance back so the bail isn't a free
    // skip past whatever cop was about to hit Mike. Per user spec.
    state.distance = Math.max(0, state.distance - JAIL_RESUME_ROLLBACK_M);
    state.distancePx = Math.max(0, state.distancePx - JAIL_RESUME_ROLLBACK_M * 10);
    state.player.lane = state.jail.checkpointLane;
    state.player.targetLane = state.jail.checkpointLane;
    state.player.lerpX = 1;
    state.player.jumpStart = 0;
    // Wipe whatever was on screen at jail-entry — they don't survive.
    state.obstacles = [];
    state.coinsArr = [];
    state.pickups = [];
    state.crossCars = [];
    state.fauna = [];
    state.chaseOfficers = [];
    state.coinParticles = [];
    // Pickups (per spec: don't survive jail)
    state.effects.hamFreezeUntil = 0;
    state.effects.hamBonusUntil = 0;
    state.effects.weedDebuffUntil = 0;
    state.effects.horseBoostUntil = 0;
    state.effects.controlsReversedUntil = 0;
    state.effects.textShownUntil = 0;
    state.invulnUntil = performance.now() + 1500; // brief grace on resume
    finishJailExit();
  }

  // BAIL XENA — alternative to self-bail. Costs whatever Cx Mike has
  // (could be 0). Drops Mike to 1 life (or stays at 1 if already at 1).
  // Resets cop touches + rolls distance back like self-bail. Triggers
  // a screen distortion + xena-bailed-out.mp3 sting, then fires the
  // 'xena-bail' cutscene whose onComplete activates Xena's follower.
  function jailBailXena() {
    // Spend whatever Mike has. Could be 0 — that's the design.
    state.coins = 0;
    // Drop to 1 life (no-op if already at 1, never increases lives).
    if (state.lives > 1) state.lives = 1;
    // v0.18.56 — Ice wasn't in jail with Mike, so he can't follow him
    // out. Drop the sidekick relationship entirely. Re-clear the
    // ice-returns cutscene flag so the player can re-meet Ice via
    // that beat once (or wait for it to re-trigger after distance
    // crosses 3800m again). first-meet flag stays set since they've
    // already met.
    state.iceSidekickJoined = false;
    state.iceTrailing = false;
    if (state.cutscenesTriggered) {
      delete state.cutscenesTriggered['ice-returns'];
    }
    // Same resume mechanics as self-bail:
    state.copTouches = 0;
    state.distance = Math.max(0, state.distance - JAIL_RESUME_ROLLBACK_M);
    state.distancePx = Math.max(0, state.distancePx - JAIL_RESUME_ROLLBACK_M * 10);
    state.player.lane = state.jail.checkpointLane;
    state.player.targetLane = state.jail.checkpointLane;
    state.player.lerpX = 1;
    state.player.jumpStart = 0;
    state.obstacles = [];
    state.coinsArr = [];
    state.pickups = [];
    state.crossCars = [];
    state.fauna = [];
    state.chaseOfficers = [];
    state.coinParticles = [];
    state.effects.hamFreezeUntil = 0;
    state.effects.hamBonusUntil = 0;
    state.effects.weedDebuffUntil = 0;
    state.effects.horseBoostUntil = 0;
    state.effects.controlsReversedUntil = 0;
    state.effects.textShownUntil = 0;
    state.invulnUntil = performance.now() + 1500;
    // Screen distortion overlay duration — drives a canvas-side
    // "warp + chromatic-aberration" effect for the next 1500ms while
    // the dialogue cutscene starts up. Drawn from drawEffects().
    state.xenaBailDistortUntil = performance.now() + 1500;
    // Hide the jail UI immediately. The cutscene overlay (HTML) takes
    // over and the canvas distortion plays underneath / behind it.
    hideJailOverlay();
    // Stop the jail loops — the cutscene runs in 'ambient silence'
    // until xena-bail finishes and finishJailExit restarts music.
    stopLoop('jailed');
    stopLoop('policejail');
    state.jail.phase = 'bailing'; // gates input; finishJailExit returns it to 'none'
    // Distortion-effect sting
    playSfx('xena-bailed-out');
    // Fire the cutscene after a brief delay so the distortion is the
    // first thing the player perceives.
    setTimeout(function () { startCutscene('xena-bail'); }, 700);
  }

  // QUIT TO TITLE — bypass the bail entirely.
  function jailQuitToTitle() {
    hideJailOverlay();
    stopLoop('jailed');
    stopLoop('policejail');
    state.jail.phase = 'none';
    // endRun then explicitly close the gameover overlay so the player
    // lands on the title screen, not the post-death summary.
    endRun();
    var go = document.getElementById('overlay-gameover');
    if (go) go.classList.add('hidden');
    var st = document.getElementById('overlay-start');
    if (st) st.classList.remove('hidden');
    state.phase = 'menu';
    syncChromeForPhase();
  }

  // Common bail-out tail — used by both self-bail and (later in
  // phase C) the bail-Xena flow. Plays bailed-out.mp3, stops jail
  // loops, restarts the gameplay music + ambient, returns the player
  // to the running state. Phase 'bailing' just gates input briefly.
  function finishJailExit() {
    state.jail.phase = 'bailing';
    state.jail.startedAt = performance.now();
    hideJailOverlay();
    stopLoop('jailed');
    stopLoop('policejail');
    playSfx('bailed-out');
    // Resume the music + mob ambient that were playing pre-jail.
    if (currentMusicKey) {
      var inst = audioInstances[currentMusicKey];
      if (inst) inst.play().catch(function () {});
    }
    if (state.water.phase === 'none') startLoop('mob-angry');
    // After a brief fade, drop back to normal play.
    setTimeout(function () {
      state.jail.phase = 'none';
      state.invulnUntil = performance.now() + 1500;
    }, JAIL_BAIL_FADE_MS);
  }

  function triggerCoinRewardFlash(amount) {
    state.coinRewardFlash = {
      amount: amount,
      startedAt: performance.now(),
      durationMs: 2400,
    };
    // Rapid coin-pickup chirps (5 chirps over ~400ms) for audio feedback
    for (var i = 0; i < 5; i++) {
      setTimeout(function () { playSfx('coin-pickup'); }, i * 80);
    }
  }

  // v0.18.51: NEW-RECORD CELEBRATION. Fires once per run when
  // state.distance crosses the leaderboard's current #1 score (cached
  // at run start in startRun). Skipped if the leaderboard hadn't
  // loaded (null) or was empty (0). Big "NEW RECORD!" overlay scales
  // in, holds, fades out — same envelope as triggerCoinRewardFlash.
  function triggerNewRecordFlash() {
    state.newRecordTriggered = true;
    state.newRecordFlash = {
      startedAt: performance.now(),
      durationMs: 3200,
    };
    // Triumphant audio: play the coin-pickup SFX a bunch in a fanfare
    // burst. We don't have a dedicated cheer/fanfare SFX yet, so reuse
    // what's loaded — sounds like a coin shower hit which reads as a
    // celebratory cue regardless.
    for (var i = 0; i < 10; i++) {
      setTimeout(function () { playSfx('coin-pickup'); }, i * 60);
    }
    ga('new_record_celebrated', {
      at_distance: Math.floor(state.distance),
      previous_top: state.leaderboardTopScore,
    });
  }

  function showPickupText(label, color, durationMs) {
    var now = performance.now();
    state.effects.textLabel = label;
    state.effects.textColor = color;
    state.effects.textShownAt = now;
    state.effects.textShownUntil = now + durationMs;
  }

  function applyPickup(kind) {
    var now = performance.now();
    ga(kind + '_collected', { at_distance: Math.floor(state.distance) });
    if (kind === 'ham') {
      // STACKING: if a ham bonus is already running, EXTEND it by another
      // HAM_BONUS_MS instead of resetting (and skip the freeze + chipmunk
      // re-trigger so back-to-back hams feel rewarding instead of jarring).
      var hamStacking = state.effects.hamBonusUntil > now;
      if (hamStacking) {
        state.effects.hamBonusUntil += HAM_BONUS_MS;
      } else {
        state.effects.hamFreezeUntil = now + HAM_FREEZE_MS;
        state.effects.hamBonusUntil = now + HAM_FREEZE_MS + HAM_BONUS_MS;
        // Music goes 4x chipmunk-speed during the bonus window
        var mInst = currentMusicKey ? audioInstances[currentMusicKey] : null;
        if (mInst) mInst.playbackRate = 4;
      }
      showPickupText(hamStacking ? 'HAM +' : 'HAM!', '#FFD566', HAM_FREEZE_MS);
      playSfx('ham-pickup');
    } else if (kind === 'h400') {
      state.lives = Math.min(state.lives + 1, LIVES_MAX);
      // Red — matches the 400 sprite color and signals "life gained"
      showPickupText('+1 LIFE!', '#ff5a6b', 900);
      playSfx('ham-pickup'); // reuse the celebratory 1up jingle
    } else if (kind === 'weed') {
      // STACKING: if already stoned, EXTEND the debuff window instead of
      // resetting it, so the player feels punished for greedy weed grabs.
      var weedStacking = state.effects.weedDebuffUntil > now;
      if (weedStacking) {
        state.effects.weedDebuffUntil += WEED_DEBUFF_MS;
      } else {
        state.effects.weedDebuffUntil = now + WEED_DEBUFF_MS;
        // Music slows to 0.6x to amplify the debuff feel
        var mInst2 = currentMusicKey ? audioInstances[currentMusicKey] : null;
        if (mInst2) mInst2.playbackRate = 0.6;
      }
      // Green — weed-themed; debuff vibe via shaky text
      showPickupText(weedStacking ? 'STONED +' : 'STONED', '#90EE90', 900);
      playSfx('damage');
      // STONED CHASE — at higher distances, weed grabs summon a posse
      // of cops who chase Mike on foot for the duration of the debuff.
      // Pure visual flavor (the weed already debuffs Mike enough);
      // the chase reads as the city catching up on Mike for being
      // high in public.
      spawnStonedChase();
    } else if (kind === 'horse') {
      // STACKING: extend horse boost the same way ham/weed stack.
      if (state.effects.horseBoostUntil > now) {
        state.effects.horseBoostUntil += HORSE_BOOST_MS;
      } else {
        state.effects.horseBoostUntil = now + HORSE_BOOST_MS;
      }
      showPickupText('GIDDY UP!', '#8B4513', 900);
      playSfx('ham-pickup'); // reuse celebratory jingle until horse-neigh.mp3 lands
    }
  }

  // PHONE THIEF — fired from collision when an NPC marked phoneThief
  // contacts Mike. Drains coins, spawns a coin-particle burst, sets
  // the reversed-controls timer, plays the snatch SFX. `mikeCenterY`
  // is the world-space Y where the particles should originate.
  function triggerPhoneThief(now, mikeCenterY) {
    // Drain coins (clamp at 0). Recompute multiplier so a ×3 player
    // who gets snatched down to 4 coins drops back to ×1 — same
    // thresholds as the normal coin-pickup path.
    var lost = Math.min(state.coins, PHONE_THIEF_COINS_LOST);
    state.coins = Math.max(0, state.coins - PHONE_THIEF_COINS_LOST);
    if (state.coins >= 16) state.multiplier = 3;
    else if (state.coins >= 6) state.multiplier = 2;
    else state.multiplier = 1;

    // 3-second left/right inversion. STACKING: if already reversed,
    // extend rather than reset (consistent with ham/weed/horse).
    if (state.effects.controlsReversedUntil > now) {
      state.effects.controlsReversedUntil += PHONE_THIEF_REVERSED_MS;
    } else {
      state.effects.controlsReversedUntil = now + PHONE_THIEF_REVERSED_MS;
    }

    // Centered red text overlay. Show how many coins were actually
    // lost (could be < 10 if the player had < 10 banked).
    showPickupText('SNATCHED -' + lost + ' Cx', '#ff5a6b', 1200);

    // Coin particle burst — radial spray from Mike's chest. One
    // particle per coin lost so the visual reads as "all those coins
    // just flew out of you." Each gets a random outward velocity +
    // gravity. Coin sprite frame randomized for visual variety.
    var mikeX = laneX(state.player.targetLane);
    var coinSize = scaledSize('cx-coin-01', COIN_TARGET_HEIGHT_FRAC);
    var particleCount = Math.max(1, lost);
    var vh = viewH();
    for (var i = 0; i < particleCount; i++) {
      // Random angle in upper hemisphere (-π to 0) so they fly UP+OUT
      var angle = -Math.PI * (0.15 + 0.7 * Math.random());
      var speed = vh * (0.9 + Math.random() * 0.6); // px/sec
      state.coinParticles.push({
        x: mikeX + (Math.random() - 0.5) * coinSize.w,
        y: mikeCenterY + (Math.random() - 0.5) * coinSize.h,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        spawnedAt: now,
        life: 1100 + Math.random() * 400, // ms
        w: coinSize.w * 0.85,
        h: coinSize.h * 0.85,
        frameOffset: Math.floor(Math.random() * 8) * 80, // randomize spin start
      });
    }

    playSfx('punch-phone-snatch');
  }

  function tickEffects(now) {
    // Restore music playback rate when bonus/debuff expires
    if (state.effects.hamBonusUntil > 0 && now > state.effects.hamBonusUntil) {
      state.effects.hamBonusUntil = 0;
      var inst = currentMusicKey ? audioInstances[currentMusicKey] : null;
      if (inst) inst.playbackRate = 1;
      playSfx('bonus-end');
    }
    if (state.effects.weedDebuffUntil > 0 && now > state.effects.weedDebuffUntil) {
      state.effects.weedDebuffUntil = 0;
      var inst2 = currentMusicKey ? audioInstances[currentMusicKey] : null;
      if (inst2) inst2.playbackRate = 1;
    }
  }

  // ============================================================
  // Update — physics, spawning, collisions.
  // ============================================================
  function update(dt) {
    // PAUSE — true freeze. Skip even the tick* helpers (cutscene
    // typewriter, effect expiries, water-phase state machine) so the
    // pause overlay is a hard stop. shiftEffectTimers handles bumping
    // spawnedAt + expiry timestamps on resume so animations continue
    // mid-cycle instead of jumping. v0.18.54 fix: was missing,
    // causing distance + elapsedMs to tick during pause.
    if (state.paused) return;

    // TICKS that run during cutscene/jail/ham freeze (but NOT during
    // pause — see above). These drive timer-based animations + state
    // machines that need to keep advancing during dialogue/jail dialog
    // even though the world itself is frozen.
    var nowMs = performance.now();
    tickEffects(nowMs);
    tickCutscene(nowMs);
    tickWater(nowMs);

    // FREEZE SHORT-CIRCUITS — block distance/elapsedMs accumulation +
    // spawning + collisions when:
    //   - cutscene active (per user spec — distance must NOT tick during
    //     dialogue or back-to-back triggers fire)
    //   - jailed (BUSTED flash, cell, bailing all freeze the world)
    //   - ham-freeze active (Mario-style 1UP pause)
    if (cutscene.active) return;
    if (state.jail && state.jail.phase !== 'none') return;
    if (nowMs < state.effects.hamFreezeUntil) return;

    // ============================================================
    // ADVANCING WORLD — distance, lerp, spawning, collisions.
    // ============================================================
    state.speed = Math.min(SPEED_MAX, state.speed + SPEED_GROWTH * dt);
    var pxThisFrame = state.speed * dt;
    state.distance += pxThisFrame * 0.1; // 0.1 = px-to-meters fudge
    state.distancePx += pxThisFrame;     // raw px counter for procedural BG
    state.elapsedMs += dt * 1000;        // wall-clock playing time (excludes paused)
    // NEW-RECORD CELEBRATION trigger. Fires the first frame distance
    // crosses the cached leaderboard top. Guarded on:
    //  - cache loaded (null = still fetching)
    //  - cache > 0 (skip empty leaderboard per design)
    //  - not already triggered this run
    //  - not in god mode (dev runs shouldn't fanfare)
    if (!state.newRecordTriggered
        && !state.godMode
        && state.leaderboardTopScore != null
        && state.leaderboardTopScore > 0
        && state.distance > state.leaderboardTopScore) {
      triggerNewRecordFlash();
    }

    // Lane lerp — smoothly interpolate Mike's X over a short duration.
    state.player.lerpX = Math.min(1, state.player.lerpX + dt * 8);

    // (FREEZE check + tickEffects/tickCutscene/tickWater moved to the
    // TOP of update() in v0.18.53 so they run regardless of frozen
    // state. The short-circuits above already returned by now if
    // we're paused/jailed/in-cutscene, so the rest of update() is
    // running on a free-flowing frame.)
    var nowMs = performance.now();
    // Distance-triggered cut scene (first encounter only)
    maybeTriggerCutscene();
    // Distance-triggered hurricane segment (clean street between cut scenes)
    maybeTriggerWater();
    // While the water segment is active, NO obstacles / pickups /
    // cross-cars / fauna spawn (Mike's at sea, not on the street).
    var inWater = state.water.phase !== 'none';

    // Effective speed — modified by active bonus/debuff effects
    var effSpeed = state.speed;
    // STONED — slow Mike + the world to a noticeable crawl. Bumped
    // from 0.55 -> 0.38 per playtest ("slow down more when stoned").
    if (nowMs < state.effects.weedDebuffUntil) effSpeed *= 0.38;
    // HAM bonus: world scroll also speeds up to match the chipmunk-music
    // tempo, so the visual pace matches the audio pace
    if (nowMs > state.effects.hamFreezeUntil && nowMs < state.effects.hamBonusUntil) {
      effSpeed *= 1.7;
    }
    // HORSE boost: 1.7x scroll for the duration of the ride
    if (nowMs < state.effects.horseBoostUntil) effSpeed *= HORSE_SPEED_MULT;

    // Move obstacles + coins + pickups UP toward Mike.
    var i;
    for (i = 0; i < state.obstacles.length; i++) {
      var obs = state.obstacles[i];
      // NPC runners get an EXTRA scroll bump on top of the world
      // speed so they read as "running past Mike" instead of just
      // sliding with the ground. Without this they tracked the
      // background tile exactly = looked like a stationary cardboard
      // cutout. ~25% extra speed reads as a clear sprint.
      var extra = (obs.type && obs.type.id === 'npc-runner') ? effSpeed * 0.25 : 0;
      obs.y -= (effSpeed + extra) * dt;
    }
    for (i = 0; i < state.coinsArr.length; i++) {
      state.coinsArr[i].y -= effSpeed * dt;
    }
    for (i = 0; i < state.pickups.length; i++) {
      state.pickups[i].y -= effSpeed * dt;
    }

    // Cull off-screen (above the top edge).
    state.obstacles = state.obstacles.filter(function (o) {
      return o.y > -o.h - 50;
    });
    state.coinsArr = state.coinsArr.filter(function (c) {
      return c.y > -c.h - 50 && !c.picked;
    });
    state.pickups = state.pickups.filter(function (p) {
      return p.y > -p.h - 50 && !p.picked;
    });

    // Phone-thief coin particles — physics tick. These live in screen
    // coordinates (not world-scroll) so they don't get pulled along
    // with the road; they fly through screen space and fade as their
    // life elapses.
    var GRAVITY = viewH() * 2.4; // px/sec^2
    for (i = 0; i < state.coinParticles.length; i++) {
      var pp = state.coinParticles[i];
      pp.x += pp.vx * dt;
      pp.y += pp.vy * dt;
      pp.vy += GRAVITY * dt;
    }
    state.coinParticles = state.coinParticles.filter(function (pp) {
      return (nowMs - pp.spawnedAt) < pp.life;
    });

    // Spawn timer.
    state.spawnTimer += dt;
    var t = Math.max(0, state.distance) / 600; // ramp factor
    var spawnInterval = Math.max(
      SPAWN_INTERVAL_MIN,
      SPAWN_INTERVAL_INITIAL - t * 0.05
    );
    // POST-HURRICANE difficulty ramp — once Mike's back on land after
    // the storm, the city gets MEAN. More frequent pickups (which now
    // includes more weed/ham/horse), more frequent spawns of the
    // phone-thief obstacle (handled via OBSTACLE_TYPES weighting since
    // both walk-reaching variants are in the pool). Distance-based
    // ramp: 1.0× at water exit, scales up to 2.5× over the next 5000m.
    var dangerMul = 1.0;
    if (state.water.completed) {
      var distSinceWater = state.distance - state.water.lastTriggeredAt;
      var k = Math.min(1, distSinceWater / 5000);  // 0 -> 1 over 5km
      dangerMul = 1.0 + k * 1.5;                   // 1.0 -> 2.5
    }

    if (!inWater && state.spawnTimer >= spawnInterval) {
      state.spawnTimer = 0;
      var obstLane = spawnObstacle();
      // Coin shower during ham bonus — much heavier than before. Was
      // ~1.6 coins per obstacle spawn (1 guaranteed + 60% extra). Now
      // 3-5 coins spread across multiple lanes, with each one biased
      // toward landing AHEAD of the player so they actually rake them
      // in instead of feeling like the shower is happening behind them.
      var coinChance = COIN_SPAWN_PROBABILITY;
      var hamActive = nowMs < state.effects.hamBonusUntil;
      if (hamActive) coinChance = 1.0;
      if (Math.random() < coinChance) {
        spawnCoin(obstLane);
      }
      if (hamActive) {
        var extraCount = 3 + Math.floor(Math.random() * 3); // 3-5 extras
        for (var ec = 0; ec < extraCount; ec++) {
          spawnCoin(null);
        }
      }
      // Pickup spawn — base 0.06, scales up to 0.15 post-water (capped).
      // More pickups means more weed/ham/phone-thief opportunities for
      // Mike to mess up under pressure.
      var pickupChance = Math.min(0.15, PICKUP_SPAWN_PROBABILITY * dangerMul);
      if (Math.random() < pickupChance) {
        spawnPickup(obstLane);
      }
      // Bonus phone-thief spawn (post-water only) — extra chance to
      // also spawn a snatcher in a different lane on the same tick,
      // giving the player two threats to track. 0% pre-water → up to
      // ~25% at danger 2.5×.
      if (state.water.completed && Math.random() < (dangerMul - 1.0) * 0.16) {
        spawnExtraPhoneThief(obstLane);
      }
      // v0.18.56 — Mike is STONED → police presence ramps up. ~30%
      // chance per spawn tick to drop a bonus cop car in a different
      // lane while the weed debuff is active. Forces the player to
      // make jump decisions more often during the slow-down. Cop
      // cars are jump-only so this is a "press SPACE more" stress,
      // not a hopeless wall.
      if (nowMs < state.effects.weedDebuffUntil && Math.random() < 0.30) {
        spawnExtraCopCar(obstLane);
      }
    }

    // Background fauna — pigeons/cats/dogs/goats walking the sidewalks.
    // Pure ambient; no collision, no gameplay impact. Spawn cadence is
    // random in the FAUNA_SPAWN_MIN..MAX range so the street feels
    // populated without becoming a parade.
    state.faunaSpawnTimer += dt * 1000;
    if (!inWater && state.faunaSpawnTimer >= state.faunaNextSpawnMs) {
      state.faunaSpawnTimer = 0;
      state.faunaNextSpawnMs = FAUNA_SPAWN_MIN_MS
        + Math.random() * (FAUNA_SPAWN_MAX_MS - FAUNA_SPAWN_MIN_MS);
      spawnFauna();
    }
    // Move + cull fauna. Sidewalk loiterers scroll up with effSpeed
    // like obstacles; cross-road dashers also slide horizontally via
    // their per-fauna vx (set in spawnFauna for the ~12% of spawns
    // that pick "crossing"). They despawn when they slide past the
    // viewport horizontally OR scroll off the top.
    var viewWForCull = viewW();
    for (i = 0; i < state.fauna.length; i++) {
      state.fauna[i].y -= effSpeed * dt;
      if (state.fauna[i].vx) state.fauna[i].x += state.fauna[i].vx * dt;
    }
    state.fauna = state.fauna.filter(function (f) {
      if (f.y <= -f.h - 40) return false;
      // Crossers: cull once fully off the side they were headed to.
      if (f.crossing) {
        if (f.vx > 0 && f.x > viewWForCull + 20) return false;
        if (f.vx < 0 && f.x < -f.w - 20) return false;
      }
      return true;
    });

    // Stoned-chase officers — scroll up at slightly LESS than world
    // speed so they appear to slowly catch up on Mike (but never
    // actually overtake him). Despawn when the weed debuff ends OR
    // when they scroll off-screen (e.g., player picks up another weed
    // mid-chase, distance grows past their cull point).
    if (state.chaseOfficers.length > 0) {
      var chaseSpeed = effSpeed * 0.92;  // 8% slower = always trailing
      for (i = 0; i < state.chaseOfficers.length; i++) {
        state.chaseOfficers[i].y -= chaseSpeed * dt;
      }
      // Cull: off-screen at top OR weed debuff has ended
      var weedActive = nowMs < state.effects.weedDebuffUntil;
      state.chaseOfficers = state.chaseOfficers.filter(function (o) {
        if (!weedActive) return false;            // debuff over → all officers despawn
        return o.y > -o.h - 40;                   // still on screen
      });
    }

    // Cross-traffic cop car spawning + movement. Spawns kick in at
    // CROSS_CAR_START_DISTANCE_M and accelerate (shorter intervals)
    // as distance grows.
    if (!inWater && state.distance >= CROSS_CAR_START_DISTANCE_M) {
      state.crossCarSpawnTimer += dt * 1000; // ms
      if (state.crossCarSpawnTimer >= state.crossCarNextSpawnMs) {
        state.crossCarSpawnTimer = 0;
        // Compute next interval based on current distance: lerp from
        // FAR (early) -> NEAR (peak) over CROSS_CAR_RAMP_M meters.
        var ramp = Math.min(1, (state.distance - CROSS_CAR_START_DISTANCE_M) / CROSS_CAR_RAMP_M);
        state.crossCarNextSpawnMs = CROSS_CAR_SPAWN_MS_FAR
          + (CROSS_CAR_SPAWN_MS_NEAR - CROSS_CAR_SPAWN_MS_FAR) * ramp;
        // Add slight random jitter so spawns aren't perfectly metronomic
        state.crossCarNextSpawnMs *= (0.85 + Math.random() * 0.3);
        spawnCrossCar();
      }
    }
    // Move + animate cross cars (with feint-swerve telegraph) + cull.
    var mikeLaneX = laneX(state.player.targetLane);
    var mikeLineY = playerY() - 40;  // approximate Mike's chest height
    // MERCY: when Mike's down to his last life, every cross car drives
    // ~30% slower so the player has more reaction time. Reads as the
    // city giving Mike a break when he's on his last leg.
    var crossSpeedMul = (state.lives <= 1) ? 0.70 : 1.0;
    for (i = 0; i < state.crossCars.length; i++) {
      var ccc = state.crossCars[i];
      ccc.x += ccc.vx * dt * crossSpeedMul;
      // Trigger feint-swerve once when car gets within trigger range
      // of Mike's lane center (X distance check, regardless of side
      // it came from).
      var ccCenterX = ccc.x + ccc.h / 2;
      var distToMikeX = Math.abs(ccCenterX - mikeLaneX);
      if (ccc.swerveStartedAt === 0 && distToMikeX < CROSS_CAR_SWERVE_TRIGGER_PX) {
        ccc.swerveStartedAt = nowMs;
      }
      // Apply swerve: phase 0->0.5 = AWAY from Mike's Y, 0.5->1.0 =
      // BACK toward Mike's Y. sin(phase * π) gives a smooth
      // 0->1->0 envelope; sign chosen so phase ~0.25 deviates AWAY
      // from Mike, phase ~0.75 deviates TOWARD Mike (just past base).
      // Simpler: full sin wave so it goes AWAY then BACK in one curve.
      if (ccc.swerveStartedAt > 0) {
        var elapsed = nowMs - ccc.swerveStartedAt;
        if (elapsed < CROSS_CAR_SWERVE_DUR_MS) {
          var phase = elapsed / CROSS_CAR_SWERVE_DUR_MS;  // 0..1
          // Direction: positive offset = AWAY from Mike (if Mike below
          // baseY, push car UP/away first; vice versa).
          var awayDir = (mikeLineY > ccc.baseY) ? -1 : +1;
          // sin(phase * π) peaks 1 at phase 0.5, then back to 0 at 1.
          // Multiply by awayDir so the peak is the AWAY swerve. Then
          // for phase > 0.5 it returns toward base. This gives the
          // "feint and back" feel without an actual hit-zone deviation
          // (Mike's collision still uses the car's actual Y).
          var envelope = Math.sin(phase * Math.PI);
          ccc.y = ccc.baseY + envelope * awayDir * (viewH() * CROSS_CAR_SWERVE_AMPLITUDE_FRAC);
        } else {
          // Swerve done — settle exactly back to baseY for the rest
          // of the run across the screen.
          ccc.y = ccc.baseY;
        }
      }
    }
    state.crossCars = state.crossCars.filter(function (c) {
      // Cull when fully off the opposite edge. Use c.h (post-rotation
      // visual horizontal extent), NOT c.w (which is the source's
      // wide axis = visual VERTICAL extent post-rotation).
      return (c.dir > 0 ? c.x < viewW() + c.h + 50 : c.x > -c.h - 50);
    });

    // Collisions.
    var px = laneX(state.player.targetLane); // approx — fine for v0.1
    var py = playerY();
    var playerSize = scaledSize('mike-run-01', PLAYER_TARGET_HEIGHT_FRAC);
    var pHitW = playerSize.w * 0.45;
    var pHitH = playerSize.h * 0.55;

    var now = performance.now();
    for (i = 0; i < state.obstacles.length; i++) {
      var o = state.obstacles[i];
      if (o.hit) continue;
      if (o.lane !== state.player.targetLane) continue;
      var oy = o.y; // top of obstacle
      // Y collision: when the obstacle's vertical center is near Mike's center
      var oCenterY = oy + o.h / 2;
      var pCenterY = py - playerSize.h * 0.4;
      if (Math.abs(oCenterY - pCenterY) < (o.h * 0.4 + pHitH * 0.5)) {
        // Jump-only obstacles (cop cars) don't register if Mike is mid-jump
        if (o.type && o.type.jumpOnly && isAirborne(now)) {
          // mark "skipped" so we don't re-check next frame and ding again
          o.hit = true;
          continue;
        }
        o.hit = true;
        if (now > state.invulnUntil) {
          // PHONE THIEF — special-cased: doesn't take a life, instead
          // steals coins, reverses controls, and triggers the snatch
          // particle burst. Still triggers invuln so Mike doesn't get
          // snatched 3x in a row by overlapping NPCs.
          if (o.type && o.type.phoneThief) {
            triggerPhoneThief(now, py - playerSize.h * 0.4);
            state.invulnUntil = now + INVULN_TIME * 1000;
            ga('phone_thief_hit', {
              at_distance: Math.floor(state.distance),
              coins_lost: PHONE_THIEF_COINS_LOST,
            });
            continue;
          }
          // JAIL FEATURE — cop-car collisions count toward the 2-touch
          // jail trigger. Cars use jumpOnly so the only obstacle type
          // that reaches this branch with id === 'cop-car' is a cop
          // car. We hand off to handleCopHit; if it returns true, jail
          // was triggered and we skip the regular life-loss path.
          var isCop = o.type && o.type.id === 'cop-car';
          if (isCop && handleCopHit(now)) {
            // Jail entered — short-circuit out of the obstacle loop.
            // No damage SFX (sirens already played in enterJail).
            return;
          }
          if (!state.godMode) state.lives--;
          state.invulnUntil = now + INVULN_TIME * 1000;
          ga('obstacle_hit', {
            at_distance: Math.floor(state.distance),
            lives_left: state.lives,
            obstacle_kind: o.type ? o.type.id : 'unknown',
          });
          // Damage SFX on every hit; full death sting only when lives = 0
          if (state.lives > 0) {
            playSfx('damage');
          } else {
            endRun();
          }
        }
      }
    }
    // CROSS-TRAFFIC collision — overhead cop cars crossing the road.
    // Box-vs-box check. POST-ROTATION the visual hitbox is:
    //   horizontal extent on screen = cc.h (source TALL axis)
    //   vertical extent on screen   = cc.w (source WIDE axis)
    // Mike can JUMP over them — same affordance as the parked cop car.
    for (i = 0; i < state.crossCars.length; i++) {
      var cc = state.crossCars[i];
      if (cc.hit) continue;
      // Mike's hitbox center
      var mikeCx = laneX(state.player.targetLane);
      var mikeCy = py - playerSize.h * 0.4;
      // Car center in screen-coords. cc.x is the LEFT edge of the
      // visual rect (which spans cc.h horizontally post-rotation).
      var ccCx = cc.x + cc.h / 2;
      var ccCy = cc.y + cc.w / 2;
      var ccHitW = cc.h * 0.75;   // 75% of the visual horizontal extent
      var ccHitH = cc.w * 0.70;   // 70% of the visual vertical extent
      if (Math.abs(mikeCx - ccCx) < (ccHitW * 0.5 + pHitW * 0.5)
          && Math.abs(mikeCy - ccCy) < (ccHitH * 0.5 + pHitH * 0.5)) {
        // JUMP TO AVOID — if Mike is mid-jump, mark the car as
        // already-resolved so it doesn't ding on the next frame, but
        // skip the damage. Same pattern as jumpOnly cop cars.
        if (isAirborne(now)) {
          cc.hit = true;
          continue;
        }
        cc.hit = true;
        if (now > state.invulnUntil) {
          // JAIL — cross-traffic cop cars also count as cop touches.
          if (handleCopHit(now)) return;
          if (!state.godMode) state.lives--;
          state.invulnUntil = now + INVULN_TIME * 1000;
          ga('cross_car_hit', {
            at_distance: Math.floor(state.distance),
            lives_left: state.lives,
          });
          if (state.lives > 0) {
            playSfx('damage');
          } else {
            endRun();
          }
        }
      }
    }

    for (i = 0; i < state.coinsArr.length; i++) {
      var co = state.coinsArr[i];
      if (co.picked) continue;
      // XENA snipes coins BEFORE Ice or Mike can grab them. Returns
      // true if she stole it; in that case skip both Ice + Mike paths.
      if (tryXenaSnipe(co, now, 'coin')) continue;
      // Ice gets second crack at the coin if it's within his reach radius
      if (tryIceGrab(co, now)) continue;
      if (co.lane !== state.player.targetLane) continue;
      var coCenterY = co.y + co.h / 2;
      var pCenterY2 = py - playerSize.h * 0.4;
      if (Math.abs(coCenterY - pCenterY2) < (co.h * 0.6 + pHitH * 0.4)) {
        co.picked = true;
        state.coins++;
        playSfx('coin-pickup');
        // Multiplier: 1x for first 5, 2x for next 10, 3x thereafter
        if (state.coins >= 16) state.multiplier = 3;
        else if (state.coins >= 6) state.multiplier = 2;
      }
    }
    // Pickup collisions (ham / 400 / weed). Xena steals WEED only
    // (per spec — her hostility cluster). Ham / 400 / horse / phone
    // are unaffected by her — those land normally.
    for (i = 0; i < state.pickups.length; i++) {
      var pk = state.pickups[i];
      if (pk.picked) continue;
      if (pk.type && pk.type.kind === 'weed') {
        if (tryXenaSnipe(pk, now, 'weed')) continue;
      }
      if (pk.lane !== state.player.targetLane) continue;
      var pkCenterY = pk.y + pk.h / 2;
      var pCenterY3 = py - playerSize.h * 0.4;
      if (Math.abs(pkCenterY - pCenterY3) < (pk.h * 0.6 + pHitH * 0.4)) {
        pk.picked = true;
        applyPickup(pk.type.kind);
      }
    }

    // Slow ambient drift on the skyline panorama. Most of the sense of
    // forward motion now comes from the procedural road details (lane
    // dashes, crosswalks, sidewalk grates scrolling DOWN), so this
    // horizontal drift just adds a subtle "you're moving" cue without
    // making the static skyline feel like the primary scrolling layer.
    bgScrollX -= state.speed * dt * 0.012;

    updateHUD();
  }

  function updateHUD() {
    var scoreEl = document.querySelector('.score');
    var timeEl  = document.querySelector('.time');
    var coinsEl = document.querySelector('.coins');
    var livesEl = document.querySelector('.lives');
    if (scoreEl) scoreEl.textContent = Math.floor(state.distance) + ' m';
    if (timeEl)  timeEl.textContent  = formatTime(state.elapsedMs);
    if (coinsEl) coinsEl.textContent = 'Cx ' + Math.floor(state.coins) + ' ×' + state.multiplier;
    if (livesEl) {
      var hearts = '';
      // Show as many filled hearts as current lives. If lives are above
      // initial 3 (from a 400 pickup), all extra lives show as filled.
      // If lives are below initial 3, show empty hearts for the missing ones.
      var displaySlots = Math.max(LIVES_INITIAL, state.lives);
      for (var i = 0; i < displaySlots; i++) {
        hearts += i < state.lives ? '❤' : '♡';
      }
      livesEl.textContent = hearts;
    }
    // Active-effect badges with live countdowns
    var effEl = document.getElementById('hud-effects');
    if (effEl) {
      var nowMs = performance.now();
      var html = '';
      if (nowMs < state.effects.hamBonusUntil) {
        var hamRem = ((state.effects.hamBonusUntil - nowMs) / 1000).toFixed(1);
        html += '<span class="eff eff-ham">🍖 ' + hamRem + 's</span>';
      }
      if (nowMs < state.effects.weedDebuffUntil) {
        var weedRem = ((state.effects.weedDebuffUntil - nowMs) / 1000).toFixed(1);
        // Maple-leaf emoji — closest weed-leaf silhouette in Unicode
        // (no dedicated cannabis emoji exists; this is the convention)
        html += '<span class="eff eff-weed">🍁 ' + weedRem + 's</span>';
      }
      if (nowMs < state.effects.horseBoostUntil) {
        var horseRem = ((state.effects.horseBoostUntil - nowMs) / 1000).toFixed(1);
        html += '<span class="eff eff-horse">🐎 ' + horseRem + 's</span>';
      }
      if (nowMs < state.effects.controlsReversedUntil) {
        var revRem = ((state.effects.controlsReversedUntil - nowMs) / 1000).toFixed(1);
        // Reversed-arrow emoji signals "your input is flipped right now"
        html += '<span class="eff eff-reversed">🔄 ' + revRem + 's</span>';
      }
      // GOD MODE badge — shows whenever ?god=1 was set on the URL.
      // Sits alongside the active-effect badges so it's visually obvious
      // you're in dev mode + scores won't count.
      if (state.godMode) {
        html += '<span class="eff eff-god">👁 GOD MODE</span>';
      }
      effEl.innerHTML = html;
    }
  }
  function formatTime(ms) {
    var totalSec = Math.floor(ms / 1000);
    var m = Math.floor(totalSec / 60);
    var s = totalSec % 60;
    return m + ':' + (s < 10 ? '0' + s : s);
  }

  // ============================================================
  // Render.
  // ============================================================
  function render(now) {
    var w = viewW();
    var h = viewH();

    // Background fill (visible behind any unfilled regions)
    ctx.fillStyle = '#1a1230';
    ctx.fillRect(0, 0, w, h);

    if (state.phase === 'menu') {
      // Title screen — draw the cover-art bg and let the seagulls fly
      // across the sky. The HTML overlay (start panel with ON BABY!
      // title + START button) sits on top of this.
      drawTitleScreen(now);
      return;
    }

    // Road covers the WHOLE viewport — Mike is now near the top of the
    // playfield rather than the bottom, and the bg-road tile already
    // contains everything (asphalt, sidewalks, painted markings, manhole
    // covers, shops on the edges).
    drawRoad(0, h);

    // Background fauna (sidewalk-walking pigeons/cats/dogs/goats).
    // Drawn AFTER the road but BEFORE obstacles so passing vehicles
    // can occlude them in the depth pass — they're meant to be
    // ambient set-dressing, not foreground.
    drawFauna(now);

    // Obstacles + coins + pickups, sorted so closer (lower-Y) ones
    // draw on top. Tag each item with its category so we know which
    // sprite-source to use.
    var allDrawables = [];
    for (var oi = 0; oi < state.obstacles.length; oi++) {
      allDrawables.push({ kind: 'obs', d: state.obstacles[oi] });
    }
    for (var ci = 0; ci < state.coinsArr.length; ci++) {
      allDrawables.push({ kind: 'coin', d: state.coinsArr[ci] });
    }
    for (var pi = 0; pi < state.pickups.length; pi++) {
      allDrawables.push({ kind: 'pickup', d: state.pickups[pi] });
    }
    allDrawables.sort(function (a, b) { return b.d.y - a.d.y; });
    for (var k = 0; k < allDrawables.length; k++) {
      var item = allDrawables[k];
      var d = item.d;
      var spriteKey, drift = 0, cropFrac = 0;
      if (item.kind === 'obs') {
        spriteKey = getObstacleSprite(d, now);
        drift = getObstacleDrift(d, now);
        // Per-type bottom-crop hides the ground-shadow ellipse baked
        // into NPC + cop-car sprites. Same trick Ice uses (srcCropFrac).
        if (d.type && d.type.bottomCropFrac) cropFrac = d.type.bottomCropFrac;
      } else if (item.kind === 'coin') {
        spriteKey = pickCoinSprite(now);
      } else {
        spriteKey = getPickupSprite(d, now);
      }
      if (cropFrac > 0) {
        drawAtCropped(spriteKey, laneX(d.lane) + drift, d.y, d.w, d.h, cropFrac);
      } else {
        drawAt(spriteKey, laneX(d.lane) + drift, d.y, d.w, d.h);
      }
    }

    // Stoned-chase officers — trail Mike on foot during weed debuff.
    // Drawn after the lane-spawn obstacles (so they layer naturally
    // among pedestrians) but before Mike + cross cars so faster
    // foreground elements still occlude them.
    drawChaseOfficers(now);

    // Cross-traffic cop cars — drawn AFTER obstacles but BEFORE Mike
    // so they can occlude lane-spawned NPCs (depth) but Mike still
    // appears in front when they overlap. Mirror sprite horizontally
    // when driving left-to-right so the headlights face direction of
    // travel (sprites natively face DOWN i.e. toward the camera in
    // overhead view; we rotate visually by flipping when going right).
    drawCrossCars(now);

    // Render order matters for the Ice/Mike depth pass:
    // - Side-kick Ice runs BESIDE Mike at the same Y → can draw after
    //   Mike since they share the same depth plane.
    // - Trailing Ice is FURTHER UP the road (behind Mike in perspective)
    //   → must draw BEFORE Mike so Mike correctly occludes him.
    if (state.iceTrailing) {
      drawIce(now);
      drawPlayer(now);
    } else {
      drawPlayer(now);
      drawIce(now);
    }
    // Xena (anti-sidekick) — drawn alongside Ice on the opposite side.
    // Same Y plane as Mike, so render after Mike like side-kick Ice.
    drawXena(now);

    // Shoovy's sailboat (mid-water approach). Drawn AFTER Mike so the
    // boat is visibly closer to camera than Mike (it's coming toward
    // him). Only shows during the water phase + when state.water.shoovyBoat
    // exists. drawShoovyBoat early-returns if the boat is null.
    drawShoovyBoat(now);

    // Phone-thief coin particles — drawn AFTER the player so the burst
    // visually originates from in front of Mike's chest. Each coin
    // spins (frame cycles using its own offset) and fades out as its
    // life elapses.
    drawCoinParticles(now);

    // Effect overlays
    drawEffects(now);
  }

  // Render the stoned-chase officer posse trailing Mike. Each officer
  // cycles through a 4-frame walk animation (their own frameOffset so
  // they don't all march in lockstep) with a small Y-bob for stride
  // bounce. Drawn AFTER obstacles + fauna but BEFORE Mike — they're
  // gameplay-adjacent enough to read as "characters" not bg dressing,
  // but Mike still occludes any officer who scrolls under his Y.
  function drawChaseOfficers(now) {
    if (state.chaseOfficers.length === 0) return;
    for (var i = 0; i < state.chaseOfficers.length; i++) {
      var o = state.chaseOfficers[i];
      // Each officer has its own 2-frame walk cycle from its variant
      // pool, so 4 officers spawned together show 4 distinct chars.
      var fIdx = Math.floor((now + o.frameOffset) / STONED_CHASE_FRAME_MS) % o.sprites.length;
      var key = o.sprites[fIdx];
      var bob = Math.sin((now - o.spawnedAt) / 120 + o.bobPhase) * 6;
      drawAtCropped(key, laneX(o.lane), o.y + bob, o.w, o.h, 0.05);
    }
  }

  // Render background fauna walking the sidewalks. Each creature gets
  // a small sin-wave Y-bob for "alive" feel even though most species
  // here aren't true walk-cycle animations (sprite frames are visual
  // variants, not stride sequences). drawAtCropped trims the small
  // ground-shadow ellipse baked into the source art.
  function drawFauna(now) {
    if (state.fauna.length === 0) return;
    for (var i = 0; i < state.fauna.length; i++) {
      var f = state.fauna[i];
      var bob = Math.sin((now - f.spawnedAt) / 220 + f.bobPhase) * f.bobAmp;
      // f.x is the LEFT edge of the sprite (not center) since fauna
      // sit on a sidewalk strip not a lane center. drawAt centers
      // horizontally on the supplied x, so add half-width to the LEFT
      // edge to get the center.
      drawAtCropped(f.sprite, f.x + f.w / 2, f.y + bob, f.w, f.h, 0.05);
    }
  }

  // Render the cross-traffic cop cars. Sprite is overhead-view so
  // it natively shows the car pointing DOWN (toward the camera).
  // Rotate via canvas transform so the car visually points the
  // direction of travel: -90deg for leftward (dir=-1), +90deg for
  // rightward (dir=+1). Light bar cycles R/B at fast cadence.
  function drawCrossCars(now) {
    if (state.crossCars.length === 0) return;
    var lightFrames = ['cop-overhead-01', 'cop-overhead-02', 'cop-overhead-03', 'cop-overhead-04'];
    for (var i = 0; i < state.crossCars.length; i++) {
      var cc = state.crossCars[i];
      var key = lightFrames[Math.floor(now / CROSS_CAR_FRAME_MS) % lightFrames.length];
      var img = sprites[key];
      if (!img) continue;
      // After 90deg rotation the source's TALL axis becomes screen-horizontal
      // (the car's length when viewed from the side). cc.h is sized to be
      // that on-screen length; the matching scale factor preserves the
      // source's native aspect ratio so the car doesn't get squashed into
      // a near-square. Previous version used swapped w/h literally
      // which gave a 0.97x scale on one axis and 0.28x on the other —
      // hence the smooshed-into-a-box look.
      var s = cc.h / img.height;
      var rw = img.width * s;   // image-x extent (becomes screen-vertical post-rotate)
      var rh = img.height * s;  // image-y extent (becomes screen-horizontal post-rotate)
      var cx = cc.x + cc.w / 2;
      var cy = cc.y + cc.h / 2;
      ctx.save();
      ctx.translate(cx, cy);
      // Native sprite faces down. dir=+1 (going right) -> rotate -90
      // so the car points right. dir=-1 (going left) -> rotate +90.
      ctx.rotate(cc.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
      ctx.drawImage(img, -rw / 2, -rh / 2, rw, rh);
      ctx.restore();
    }
  }

  // Render the in-flight coin particles spawned by triggerPhoneThief.
  // Render Shoovy's sailboat approaching Mike during the water body.
  // Cycles 4 frames at SHOOVY_BOAT_FRAME_MS for a "actively sailing"
  // animation. Drawn after the water tiles but before Mike so the
  // boat can pass behind him visually as it scrolls up.
  function drawShoovyBoat(now) {
    if (!state.water || !state.water.shoovyBoat) return;
    // Boat ONLY exists in open water — never visible during the
    // entering (cliff) or exiting (boat ramp) transition tiles where
    // street is partially showing. Player rule: "Shoovy's boat should
    // never touch land."
    if (state.water.phase !== 'water') return;
    var b = state.water.shoovyBoat;
    var fIdx = Math.floor((now - b.spawnedAt) / SHOOVY_BOAT_FRAME_MS) % SHOOVY_BOAT_FRAMES.length;
    var key = SHOOVY_BOAT_FRAMES[fIdx];
    var img = sprites[key];
    if (!img) return;
    // Re-derive size from the current frame's dimensions so different
    // frames render at consistent visual scale (some frames are wider
    // than others depending on sail position).
    var refImg = sprites['shoovy-sail-01'] || img;
    var pxPerSrc = (viewH() * SHOOVY_BOAT_HEIGHT_FRAC) / refImg.height;
    var dw = img.width * pxPerSrc;
    var dh = img.height * pxPerSrc;
    // Subtle Y-bob on top of the steady upward scroll, so the boat
    // looks like it's rocking on the waves.
    var bob = Math.sin((now - b.spawnedAt) / 240) * (viewH() * 0.012);
    ctx.drawImage(img, b.x - dw / 2, b.y - dh / 2 + bob, dw, dh);
  }

  function drawCoinParticles(now) {
    if (state.coinParticles.length === 0) return;
    for (var i = 0; i < state.coinParticles.length; i++) {
      var pp = state.coinParticles[i];
      var elapsed = now - pp.spawnedAt;
      var t = Math.min(1, elapsed / pp.life);
      // Hold full alpha for first 60% of life, then fade out.
      var alpha = t < 0.6 ? 1 : (1 - (t - 0.6) / 0.4);
      // Spin: cycle through cx-coin-01..08 using the time-shifted offset
      var spinIdx = Math.floor((elapsed + pp.frameOffset) / 80) % 8 + 1;
      var key = 'cx-coin-' + (spinIdx < 10 ? '0' + spinIdx : spinIdx);
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      drawAt(key, pp.x, pp.y, pp.w, pp.h);
      ctx.restore();
    }
  }

  function drawEffects(now) {
    var w = viewW();
    var h = viewH();

    // COIN REWARD FLASH — drawn over everything else so it pops on
    // top of any other overlays. "+N Cx" centered with a spinning
    // cx-coin to the LEFT of the text. Scales in (0.6→1.2) over the
    // first 30% of duration, holds at 1.0 for the middle, fades out
    // in the last 30%.
    if (state.coinRewardFlash) {
      var crf = state.coinRewardFlash;
      var elapsed = now - crf.startedAt;
      if (elapsed >= crf.durationMs) {
        state.coinRewardFlash = null;
      } else {
        var t = elapsed / crf.durationMs;       // 0 → 1
        var scale, alpha;
        if (t < 0.30) {
          // Scale-in beat
          var k = t / 0.30;
          scale = 0.6 + 0.6 * k;
          alpha = k;
        } else if (t < 0.70) {
          scale = 1.2 - (t - 0.30) / 0.40 * 0.2; // 1.2 → 1.0
          alpha = 1;
        } else {
          // Fade-out
          var k2 = (t - 0.70) / 0.30;
          scale = 1.0;
          alpha = 1 - k2;
        }
        // Slight Y rise during the flash for a "popping up" feel
        var yLift = -t * h * 0.04;
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
        ctx.translate(w / 2, h / 2 + yLift);
        ctx.scale(scale, scale);

        // Spinning coin sprite — cycle through cx-coin-01..08 fast
        var coinKey = pickCoinSprite(now);
        var coinImg = sprites[coinKey];
        var coinSize = h * 0.13;
        var textX = 0;
        if (coinImg) {
          var coinW = coinImg.width * (coinSize / coinImg.height);
          // Position coin to the LEFT of the centered text
          ctx.drawImage(coinImg, -coinSize - 10, -coinSize / 2, coinW, coinSize);
        }

        // "+N Cx" text in gold with shadow
        ctx.fillStyle = '#FFD566';
        ctx.font = 'bold ' + Math.floor(h * 0.13) + 'px "VT323", monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
        ctx.shadowOffsetX = 4;
        ctx.shadowOffsetY = 4;
        ctx.shadowBlur = 0;
        ctx.fillText('+' + crf.amount + ' Cx', 14, 0);
        ctx.restore();
      }
    }

    // NEW-RECORD CELEBRATION (v0.18.51) — drawn on top of everything.
    // Big "NEW RECORD!" text with a sub-line showing the distance,
    // gold/orange gradient + soft pulsing glow + confetti sparkles.
    // Same scale-in/hold/fade-out envelope as the coin-reward flash.
    if (state.newRecordFlash) {
      var nrf = state.newRecordFlash;
      var nrElapsed = now - nrf.startedAt;
      if (nrElapsed >= nrf.durationMs) {
        state.newRecordFlash = null;
      } else {
        var nrt = nrElapsed / nrf.durationMs;
        var nrScale, nrAlpha;
        if (nrt < 0.20) {
          var nrk = nrt / 0.20;
          nrScale = 0.4 + 0.8 * nrk;       // 0.4 → 1.2 quick punch in
          nrAlpha = nrk;
        } else if (nrt < 0.75) {
          // Hold + slight rhythmic pulse
          var holdK = (nrt - 0.20) / 0.55;
          nrScale = 1.2 - holdK * 0.2 + Math.sin(nrElapsed / 110) * 0.04;
          nrAlpha = 1;
        } else {
          var nrk2 = (nrt - 0.75) / 0.25;
          nrScale = 1.0;
          nrAlpha = 1 - nrk2;
        }
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, nrAlpha));
        // Confetti sparkles — quick fixed pattern of dots flickering
        // around the headline. Drawn before the text so text reads on top.
        var confettiCount = 22;
        for (var ci = 0; ci < confettiCount; ci++) {
          // Stable per-i pseudo-random so confetti positions don't twitch
          var seed = ci * 9301 + 49297;
          var rx = ((seed % 1000) / 1000) * w;
          var ry = (((seed * 7) % 1000) / 1000) * h;
          var rphase = ((ci * 173) % 360) * Math.PI / 180;
          var sparkA = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(nrElapsed / 120 + rphase));
          ctx.globalAlpha = nrAlpha * sparkA;
          var hue = (ci * 47) % 360;
          ctx.fillStyle = 'hsl(' + hue + ', 90%, 65%)';
          var sparkR = 4 + (ci % 5);
          ctx.fillRect(rx - sparkR / 2, ry - sparkR / 2, sparkR, sparkR);
        }
        ctx.globalAlpha = nrAlpha;
        // Headline + subline — centered, scaled
        ctx.translate(w / 2, h / 2);
        ctx.scale(nrScale, nrScale);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // Soft gold glow halo behind the text
        ctx.shadowColor = 'rgba(255, 200, 50, 0.85)';
        ctx.shadowBlur = 30;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.fillStyle = '#FFE176';
        ctx.font = 'bold ' + Math.floor(h * 0.16) + 'px "VT323", monospace';
        ctx.fillText('NEW RECORD!', 0, -h * 0.04);
        // Subline shows the new distance + the previous top
        ctx.shadowBlur = 12;
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold ' + Math.floor(h * 0.08) + 'px "VT323", monospace';
        var distLabel = Math.floor(state.distance) + ' m';
        ctx.fillText(distLabel, 0, h * 0.06);
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
        ctx.font = Math.floor(h * 0.04) + 'px "VT323", monospace';
        ctx.fillText('previous best ' + state.leaderboardTopScore + ' m',
                     0, h * 0.115);
        ctx.restore();
      }
    }

    // HURRICANE OVERLAY — rain + lightning. Drawn early so the
    // pickup-text + countdown bars later in this function still
    // render on top.
    if (state.water.phase !== 'none') {
      // Slight blue-grey storm tint
      ctx.fillStyle = 'rgba(28, 50, 70, 0.18)';
      ctx.fillRect(0, 0, w, h);
      // Rain — slanted streaks, white at low opacity
      ctx.strokeStyle = 'rgba(200, 220, 255, 0.55)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (var di = 0; di < state.water.raindrops.length; di++) {
        var d = state.water.raindrops[di];
        ctx.moveTo(d.x, d.y);
        // Match the horizontal drift used in tickWater for visual
        // consistency: -0.18 * vy per frame, scaled by len.
        ctx.lineTo(d.x + d.len * 0.18, d.y - d.len);
      }
      ctx.stroke();
      // Lightning flash — full-screen white at high alpha during the
      // brief flash window. Two sub-flashes per trigger (jagged feel).
      if (now < state.water.lightningUntil) {
        var fProg = (state.water.lightningUntil - now) / WATER_LIGHTNING_FLASH_MS;
        // Stutter: alpha bounces high → low → high within the window
        var flickerOn = Math.floor((1 - fProg) * 6) % 2 === 0;
        ctx.fillStyle = flickerOn ? 'rgba(255, 255, 255, 0.85)' : 'rgba(255, 255, 255, 0.30)';
        ctx.fillRect(0, 0, w, h);
      }
    }

    // HAM FREEZE — white→purple flash full-screen
    if (now < state.effects.hamFreezeUntil) {
      var flashOn = (Math.floor(now / 60) % 2 === 0);
      ctx.fillStyle = flashOn ? 'rgba(255,255,255,.6)' : 'rgba(142,92,203,.4)';
      ctx.fillRect(0, 0, w, h);
    }
    // Generic pickup-text overlay — fires for HAM (during freeze),
    // 400 (+1 LIFE!), and WEED (STONED). Scales up + fades out.
    if (now < state.effects.textShownUntil && state.effects.textLabel) {
      var dur = state.effects.textShownUntil - state.effects.textShownAt;
      var elapsed = now - state.effects.textShownAt;
      var t = elapsed / dur; // 0 → 1
      var fade = 1 - t;       // 1 → 0
      var scale = 1 + t * 0.5; // grows from 1.0× to 1.5×
      ctx.save();
      ctx.globalAlpha = Math.min(1, fade * 1.6); // hold full alpha most of the duration, then fade
      ctx.fillStyle = state.effects.textColor;
      ctx.font = 'bold ' + Math.floor(h * 0.16) + 'px "VT323", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.translate(w / 2, h / 2);
      ctx.scale(scale, scale);
      ctx.shadowColor = 'rgba(0,0,0,.75)';
      ctx.shadowBlur = 20;
      ctx.fillText(state.effects.textLabel, 0, 0);
      ctx.restore();
    }
    // HAM BONUS — pulsing purple border + countdown bar at top
    if (now > state.effects.hamFreezeUntil && now < state.effects.hamBonusUntil) {
      var bRem = (state.effects.hamBonusUntil - now) / HAM_BONUS_MS; // 1→0
      var pulse = 0.5 + 0.5 * Math.sin(now / 90);
      ctx.strokeStyle = 'rgba(142,92,203,' + (0.4 + pulse * 0.4) + ')';
      ctx.lineWidth = 8 + pulse * 6;
      ctx.strokeRect(4, 4, w - 8, h - 8);
      // Countdown bar
      ctx.fillStyle = 'rgba(142,92,203,.85)';
      ctx.fillRect(0, 0, w * bRem, 6);
    }
    // WEED — red tint + countdown bar at top
    if (now < state.effects.weedDebuffUntil) {
      var wRem = (state.effects.weedDebuffUntil - now) / WEED_DEBUFF_MS;
      var redPulse = 0.5 + 0.5 * Math.sin(now / 240);
      ctx.fillStyle = 'rgba(180,30,40,' + (0.10 + redPulse * 0.08) + ')';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(220,40,40,.85)';
      ctx.fillRect(0, 0, w * wRem, 6);
    }
    // PHONE-THIEF reversed-controls — pink-magenta tint + countdown bar
    // so the player gets a clear visual cue that their input is flipped.
    if (now < state.effects.controlsReversedUntil) {
      var rRem = (state.effects.controlsReversedUntil - now) / PHONE_THIEF_REVERSED_MS;
      var pinkPulse = 0.5 + 0.5 * Math.sin(now / 180);
      ctx.fillStyle = 'rgba(255,90,170,' + (0.07 + pinkPulse * 0.07) + ')';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,90,170,.85)';
      ctx.fillRect(0, 0, w * rRem, 6);
    }

    // XENA BAIL-OUT DISTORTION (v0.18.52 phase C) — animated chromatic
    // wave/glitch overlay played for ~1.5s after the player picks
    // BAIL XENA. Reads as a "she's casting something" moment before
    // the cutscene panel slides in. Pure canvas effect (no DOM), so
    // it sits behind the cutscene HTML but in front of the gameplay
    // canvas — same render-layer as the BUSTED flash below.
    if (now < state.xenaBailDistortUntil) {
      var dProg = 1 - (state.xenaBailDistortUntil - now) / 1500;  // 0→1
      // Three-pass tinted scanline veil (red / green / blue offsets)
      var ampPx = 14 * (1 - Math.abs(dProg - 0.5) * 2); // pulses
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ['rgba(255, 60, 200, 0.30)',
       'rgba(60, 255, 200, 0.25)',
       'rgba(80, 120, 255, 0.30)'].forEach(function (col, i) {
        ctx.fillStyle = col;
        var ox = Math.sin(now / (90 + i * 30) + i * 1.7) * ampPx;
        ctx.fillRect(ox, 0, w, h);
      });
      ctx.restore();
      // Glitch bars — randomly placed horizontal slabs of inverted lines
      var nBars = 5;
      ctx.save();
      ctx.globalAlpha = 0.45 * (1 - dProg);
      for (var bi = 0; bi < nBars; bi++) {
        var by = ((now / (40 + bi * 17)) * 30 + bi * 200) % h;
        var bh = 4 + (bi % 3) * 3;
        ctx.fillStyle = bi % 2 === 0 ? 'rgba(255, 80, 220, 0.7)' : 'rgba(80, 220, 255, 0.7)';
        ctx.fillRect(0, by, w, bh);
      }
      ctx.restore();
    }

    // SHOOVY SUNSET CELEBRATION (v0.18.59) — fires for 4s after the
    // water phase exits IF Mike actually met Shoovy mid-water. Big
    // puffin-88 sprite (Shoovy sailing into the sunset) anchored
    // upper-right with fade-in/fade-out + a subtle bob. Reads as
    // "Shoovy made it out too, off into the distance."
    if (state.shoovySunsetUntil > 0 && now < state.shoovySunsetUntil) {
      var ssImg = sprites['shoovy-puffin-88'];
      if (ssImg) {
        var ssTotal = 4000;
        var ssRem = (state.shoovySunsetUntil - now) / ssTotal;     // 1 -> 0
        var ssElapsed = ssTotal - (state.shoovySunsetUntil - now); // 0 -> 4000
        // Fade in over first 25%, hold, fade out over last 30%.
        var ssAlpha;
        if (ssRem > 0.75) {
          ssAlpha = (1 - ssRem) / 0.25;
        } else if (ssRem < 0.30) {
          ssAlpha = ssRem / 0.30;
        } else {
          ssAlpha = 1;
        }
        // Sized to ~22% of viewport height, anchored near upper-right.
        var ssTargetH = h * 0.22;
        var ssScale = ssTargetH / ssImg.height;
        var ssW = ssImg.width * ssScale;
        var ssH = ssTargetH;
        // Subtle bob so the sunset boat reads as floating, not a sticker.
        var ssBob = Math.sin(ssElapsed / 320) * (h * 0.008);
        var ssX = w - ssW - 24;
        var ssY = 80 + ssBob;
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, ssAlpha));
        // Soft golden glow behind the boat
        ctx.shadowColor = 'rgba(255, 200, 90, 0.6)';
        ctx.shadowBlur = 28;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.drawImage(ssImg, ssX, ssY, ssW, ssH);
        ctx.restore();
      }
    } else if (state.shoovySunsetUntil > 0 && now >= state.shoovySunsetUntil) {
      // Cleanup once the window has passed
      state.shoovySunsetUntil = 0;
    }

    // BUSTED FLASH OVERLAY (v0.18.52) — drawn DEAD LAST so it covers
    // everything else during the brief siren / freeze sequence before
    // the jail HTML overlay slides in. Big "BUSTED" text alternating
    // red and blue (police-light cycling), full-screen tinted veil
    // also alternating red/blue. Lasts JAIL_BUSTED_FLASH_MS, then the
    // jail dialogue overlay takes over.
    if (state.jail.phase === 'busted') {
      var jb = now - state.jail.startedAt;
      // POLICE-LIGHT BAR — faster alternation (140ms, ~7 Hz) + heavier
      // saturation on both colors so neither dominates visually. Pre-tune
      // (200ms, opacity 0.55) read as "stuck on blue" because the human
      // eye smears at 5 Hz; bumping to 7 Hz with full-saturation R+B
      // pops the strobe.
      var redFrame = Math.floor(jb / 140) % 2 === 0;
      ctx.fillStyle = redFrame
        ? 'rgba(255, 25, 35, 0.72)'
        : 'rgba(35, 100, 255, 0.72)';
      ctx.fillRect(0, 0, w, h);
      // Diagonal "siren bar" stripes scrolling across the screen for
      // extra urgency — same R/B colors offset so they overlap the
      // veil with sharper contrast.
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      var stripeOffset = (jb / 8) % 80;
      for (var bs = -200; bs < w + 200; bs += 80) {
        ctx.fillStyle = (Math.floor((bs + stripeOffset) / 80) % 2 === 0)
          ? 'rgba(255, 50, 80, 0.45)'
          : 'rgba(60, 130, 255, 0.45)';
        ctx.beginPath();
        ctx.moveTo(bs + stripeOffset, 0);
        ctx.lineTo(bs + stripeOffset + 50, 0);
        ctx.lineTo(bs + stripeOffset + 50 - 200, h);
        ctx.lineTo(bs + stripeOffset - 200, h);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      // BUSTED text — punchy scale pulse + color flip with the strobe
      var pulse = (jb % 280 < 140) ? 1 : 0.9;     // 7 Hz throb
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(pulse, pulse);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold ' + Math.floor(h * 0.26) + 'px "VT323", monospace';
      // Strong dark drop-shadow so text reads on either color
      ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
      ctx.shadowBlur = 36;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 8;
      ctx.fillStyle = redFrame ? '#FFE176' : '#FFFFFF';
      ctx.fillText('BUSTED', 0, 0);
      ctx.shadowBlur = 0;
      ctx.font = Math.floor(h * 0.045) + 'px "VT323", monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fillText('caught by the cops', 0, h * 0.18);
      ctx.restore();
    }
  }

  // ============================================================
  // Title screen — cover art + animated seagull flock.
  // ============================================================
  var seagullLastTick = 0;
  // Title-screen shoulder budgie — same 5-phase state machine as the
  // cutscene bird, but rendered onto the canvas (since the title is
  // also canvas-drawn) and positioned in IMAGE-relative coordinates
  // that get mapped through the title-image's cover-fit transform.
  // Mike's visible left shoulder (from viewer perspective) sits roughly
  // at (x:14%, y:68%) of the source titlescreen.jpg.
  var TITLE_BIRD_PERCH_FRAMES = ['budgie-13', 'budgie-14', 'budgie-13', 'budgie-16'];
  var TITLE_BIRD_FLAP_FRAMES  = ['budgie-01', 'budgie-02', 'budgie-03', 'budgie-04'];
  var TITLE_BIRD_PERCH_FRAME_MS = 600;
  var TITLE_BIRD_FLAP_FRAME_MS  = 90;
  var TITLE_BIRD_PERCH_SETTLE_MS = 5500;
  var TITLE_BIRD_TAKEOFF_MS = 350;
  // Flight to the FAR EDGE off-screen — passes over Mike + Ice
  var TITLE_BIRD_FLY_OUT_MS = 1800;
  // Out-of-frame pause before swooping back from the opposite side
  var TITLE_BIRD_OFFSCREEN_MS = 900;
  // Flight back IN from the opposite edge to Mike's shoulder
  var TITLE_BIRD_FLY_IN_MS = 2000;
  // Image-relative anchor for Mike's shoulder on titlescreen.jpg.
  // Tuned per playtest feedback (v0.18.22):
  //   - Y raised from 68% -> 50% so the bird sits near the chain/collar
  //     instead of floating below the visible torso.
  //   - Size bumped from 6% -> 11% so the bird actually reads at the
  //     scale it should next to a person (was tiny + easy to miss).
  var TITLE_BIRD_BASE_X_FRAC = 0.16;
  var TITLE_BIRD_BASE_Y_FRAC = 0.50;
  var TITLE_BIRD_SIZE_FRAC = 0.11;  // bird height as fraction of image height
  // Off-screen targets — bird needs to clear the IMAGE bounds entirely.
  // Base anchor X is 0.16 in image-fraction. Going off-screen RIGHT
  // means moving +1.0 (to ~1.16, beyond the right edge); going off
  // LEFT means -0.30 (to ~-0.14, beyond the left edge). Both expressed
  // as image-WIDTH fractions, then converted in render code.
  var TITLE_BIRD_OFFSCREEN_RIGHT = 1.00;
  var TITLE_BIRD_OFFSCREEN_LEFT  = -0.40;
  // Vertical arc — the bird rises during the flight so it crosses the
  // image at roughly chest height for Ice (the right character).
  var TITLE_BIRD_FLY_UP_FRAC = -0.18;
  var titleBird = {
    phase: 'perch',
    nextPhaseAt: 0,
    transitionStartAt: 0,
    fromX: 0, fromY: 0,
    toX: 0, toY: 0,
    transitionDur: 0,
  };

  function tickTitleBird(now) {
    if (now < titleBird.nextPhaseAt) return;
    if (titleBird.phase === 'perch') {
      titleBird.phase = 'takeoff';
      titleBird.nextPhaseAt = now + TITLE_BIRD_TAKEOFF_MS;
    } else if (titleBird.phase === 'takeoff') {
      // Fly OUT to the right edge of the title image, exiting frame
      titleBird.phase = 'flyout';
      titleBird.nextPhaseAt = now + TITLE_BIRD_FLY_OUT_MS;
      titleBird.transitionStartAt = now;
      titleBird.transitionDur = TITLE_BIRD_FLY_OUT_MS;
      titleBird.fromX = 0; titleBird.fromY = 0;
      // toX uses image-WIDTH fractions; later mapped through aspect
      // ratio inside drawTitleBird so it scales with viewport.
      titleBird.toX = TITLE_BIRD_OFFSCREEN_RIGHT;
      titleBird.toY = TITLE_BIRD_FLY_UP_FRAC;
    } else if (titleBird.phase === 'flyout') {
      // Off-screen pause — bird is hidden, then teleports to the
      // opposite (left) side ready to fly back in.
      titleBird.phase = 'offscreen';
      titleBird.nextPhaseAt = now + TITLE_BIRD_OFFSCREEN_MS;
    } else if (titleBird.phase === 'offscreen') {
      // Fly BACK IN from the opposite edge to Mike's shoulder
      titleBird.phase = 'flyin';
      titleBird.nextPhaseAt = now + TITLE_BIRD_FLY_IN_MS;
      titleBird.transitionStartAt = now;
      titleBird.transitionDur = TITLE_BIRD_FLY_IN_MS;
      titleBird.fromX = TITLE_BIRD_OFFSCREEN_LEFT;
      titleBird.fromY = TITLE_BIRD_FLY_UP_FRAC;
      titleBird.toX = 0; titleBird.toY = 0;
    } else if (titleBird.phase === 'flyin') {
      titleBird.phase = 'perch';
      titleBird.nextPhaseAt = now + TITLE_BIRD_PERCH_SETTLE_MS;
    }
  }

  // Smooth-step easing for the canvas-side flight transitions
  function easeInOut(t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return t * t * (3 - 2 * t);
  }

  function drawTitleBird(now, imgX, imgY, imgW, imgH) {
    // Off-screen pause phase: don't render at all.
    if (titleBird.phase === 'offscreen') return;
    var birdSprite = sprites['budgie-13'];
    if (!birdSprite) return;
    // Frame swap based on phase. Mirror the bird sprite when flying
    // BACK IN from the left side so it visibly faces the direction of
    // travel (the source budgie sprites face right by default).
    var flipH = false;
    var key;
    if (titleBird.phase === 'perch') {
      key = TITLE_BIRD_PERCH_FRAMES[Math.floor(now / TITLE_BIRD_PERCH_FRAME_MS) % TITLE_BIRD_PERCH_FRAMES.length];
    } else {
      key = TITLE_BIRD_FLAP_FRAMES[Math.floor(now / TITLE_BIRD_FLAP_FRAME_MS) % TITLE_BIRD_FLAP_FRAMES.length];
      // During flyin (coming from left), face right -> default orientation.
      // During flyout (going right), bird is already going its native dir.
      // No flip needed for either since native sprite faces right; bird
      // is moving rightward in flyout AND coming from left in flyin (so
      // its motion vector is also rightward). All good without flip.
    }
    var frame = sprites[key] || birdSprite;
    // Compute current fractional offset.
    // For flyout/flyin we interpolate; for perch/takeoff offset stays 0.
    var ox = 0, oy = 0;
    if ((titleBird.phase === 'flyout' || titleBird.phase === 'flyin') && titleBird.transitionDur > 0) {
      var t = easeInOut((now - titleBird.transitionStartAt) / titleBird.transitionDur);
      ox = titleBird.fromX + (titleBird.toX - titleBird.fromX) * t;
      oy = titleBird.fromY + (titleBird.toY - titleBird.fromY) * t;
    }
    // Anchor + offset → canvas coords. ox is in image-WIDTH fractions
    // (so flying off the right edge actually clears the image), oy is
    // in image-HEIGHT fractions.
    var cx = imgX + (TITLE_BIRD_BASE_X_FRAC + ox) * imgW;
    var cy = imgY + (TITLE_BIRD_BASE_Y_FRAC + oy) * imgH;
    var targetH = imgH * TITLE_BIRD_SIZE_FRAC;
    var scale = targetH / frame.height;
    var drawW = frame.width * scale;
    var drawH = targetH;
    if (flipH) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(-1, 1);
      ctx.drawImage(frame, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();
    } else {
      ctx.drawImage(frame, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
    }
  }

  function drawTitleScreen(now) {
    var w = viewW();
    var h = viewH();
    var ts = sprites['titlescreen'];
    var imgX = 0, imgY = 0, iw = w, ih = h;
    if (ts) {
      // Cover-fit (fill viewport, may crop). Aspect-ratio aware.
      var s = Math.max(w / ts.width, h / ts.height);
      iw = ts.width * s;
      ih = ts.height * s;
      imgX = (w - iw) / 2;
      imgY = (h - ih) / 2;
      ctx.drawImage(ts, imgX, imgY, iw, ih);
    }

    // Tick seagull simulation in render (no separate update loop while in menu).
    var dt = Math.min(0.1, (now - seagullLastTick) / 1000);
    seagullLastTick = now;
    updateSeagulls(dt, now);

    // Draw seagulls (right→left flight)
    for (var i = 0; i < state.seagulls.length; i++) {
      drawSeagull(state.seagulls[i], now);
    }

    // Title-screen shoulder bird — perched on Mike's shoulder + flies
    // off and back periodically. Drawn after seagulls so it's on top.
    tickTitleBird(now);
    if (ts) drawTitleBird(now, imgX, imgY, iw, ih);
  }

  function updateSeagulls(dt, now) {
    // Move existing seagulls
    for (var i = 0; i < state.seagulls.length; i++) {
      state.seagulls[i].x += state.seagulls[i].vx * dt;
    }
    // Cull off-screen on the right (they're flying L→R now)
    state.seagulls = state.seagulls.filter(function (g) {
      return g.x < viewW() + 200;
    });
    // Spawn new ones periodically
    state.seagullSpawnTimer += dt;
    if (state.seagullSpawnTimer > 1.6 + Math.random() * 1.4) {
      state.seagullSpawnTimer = 0;
      state.seagulls.push({
        x: -60,
        // Sky region — top 35% of viewport
        y: viewH() * (0.04 + Math.random() * 0.30),
        // Positive vx — fly LEFT→RIGHT (matches the seagull sprite's
        // beak-pointing-right orientation; flying the other way looked
        // backwards)
        vx: 60 + Math.random() * 90,
        // Smaller default scale (0.4-0.7) so they don't dominate the title
        scale: 0.4 + Math.random() * 0.3,
        flapPhase: Math.random() * 1000,
      });
    }
  }

  function drawSeagull(g, now) {
    // Cycle through flying frames 10-12 every 130 ms (wing-flap cadence).
    // Skipping frame 09 because it has a ground shadow blob at the bird's
    // feet that looks weird on a clearly-airborne sprite.
    var idx = 10 + Math.floor((now + g.flapPhase) / 130) % 3;
    var key = 'seagull-' + idx;
    var img = sprites[key];
    if (!img) return;
    var w = img.width * g.scale;
    var hh = img.height * g.scale;
    // Drop shadow so the white-bodied seagulls don't disappear against
    // the bright sky in the title-screen background image.
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, .55)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 4;
    ctx.drawImage(img, g.x - w / 2, g.y - hh / 2, w, hh);
    ctx.restore();
  }

  function drawRoad(yTop, yBot) {
    var w = viewW();
    var roadH = yBot - yTop;
    // During the water segment, swap the regular road tile out for
    // the water tile sequence (enter → alternating sea → exit).
    if (state.water.phase !== 'none') {
      drawWaterRoad(yTop, yBot);
      return;
    }
    var bg = currentRoadKey ? sprites[currentRoadKey] : null;

    if (bg) {
      // --- Image-based road: tile the vertical-tiling bg image ---
      // Scale to fit viewport width; tile vertically with scrolling
      // offset that ties to distance traveled. The road moves UP past
      // the player, so as distancePx grows, the offset shifts the
      // tile's drawn Y position UP.
      var bgScale = w / bg.width;
      var tileH = bg.height * bgScale;
      var offset = state.distancePx % tileH;
      // First tile starts BELOW yTop by `offset` (so it visually
      // scrolls up). Then we draw additional copies above to fill the
      // whole road area.
      var firstY = yTop - offset + tileH;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, yTop, w, roadH);
      ctx.clip();
      for (var ty = firstY - tileH; ty - tileH < yBot; ty += tileH) {
        ctx.drawImage(bg, 0, ty, w, tileH);
      }
      ctx.restore();
    } else {
      // --- Procedural fallback (used if road image fails to load) ---
      drawRoadProcedural(yTop, yBot);
    }
  }

  // Water-segment road renderer. Composes a vertical sequence of
  // tiles based on phase elapsed time:
  //   ENTERING: scrolls the bg-water-enter tile UP through the
  //     viewport (one-shot transition from street → cliff edge).
  //   WATER:    alternates tile-a / tile-b stacked vertically in the
  //     scroll loop, faking animated sea waves.
  //   EXITING:  scrolls the bg-water-exit tile UP (boat-ramp → street).
  // All tiles share the same scale-to-fit-viewport-width math as the
  // regular road renderer + the same distancePx scroll offset so
  // motion stays continuous through the phase boundaries.
  function drawWaterRoad(yTop, yBot) {
    var w = viewW();
    var roadH = yBot - yTop;
    var enter = sprites['bg-water-enter'];
    var tileA = sprites['bg-water-tile-a'];
    var tileB = sprites['bg-water-tile-b'];
    var exit  = sprites['bg-water-exit'];
    if (!tileA || !tileB) return; // assets not loaded — skip
    var refImg = enter || tileA;
    var bgScale = w / refImg.width;
    var tileH = refImg.height * bgScale;
    var offset = state.distancePx % tileH;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, yTop, w, roadH);
    ctx.clip();

    var phase = state.water.phase;
    var elapsed = performance.now() - state.water.startedAt;

    if (phase === 'water') {
      // Pure sea phase — no transition tile, just animated waves.
      ctx.fillStyle = '#1d6587';
      ctx.fillRect(0, yTop, w, roadH);
      drawAlternatingSea(0, yTop, yBot, tileH, offset);
      ctx.restore();
      return;
    }

    // Resolve the transition tile for this phase + compute its Y rect.
    var transitionTile = null;
    var transitionDur = 0;
    // PHASE-RELATIVE elapsed: each transition tile's animation progress
    // is measured from the START OF ITS OWN PHASE, not from the total
    // water-segment start. The earlier code used `elapsed` (total)
    // directly, which made tProgress = elapsed/transitionDur >> 1
    // during the EXIT phase (elapsed at exit start = WATER_ENTER_MS +
    // WATER_BODY_MS = 12500ms; transitionDur = 2500ms; ratio = 5).
    // Result: the exit tile rendered fully scrolled-off from the very
    // first frame of the exit phase — never visible to the player.
    var phaseStartElapsed = 0;
    if (phase === 'entering') {
      transitionTile = enter;
      transitionDur = WATER_ENTER_MS;
      phaseStartElapsed = 0;
    } else if (phase === 'exiting') {
      transitionTile = exit;
      transitionDur = WATER_EXIT_MS;
      phaseStartElapsed = WATER_ENTER_MS + WATER_BODY_MS;
    }
    if (!transitionTile || transitionDur <= 0) {
      ctx.restore();
      return;
    }
    var phaseElapsed = Math.max(0, elapsed - phaseStartElapsed);
    var tProgress = Math.min(1, phaseElapsed / transitionDur);
    var transitionTileH = transitionTile.height * (w / transitionTile.width);
    // Tile scrolls UP across the viewport: t=0 → tile top at yBot (just
    // appearing at viewport bottom); t=1 → tile top at yTop - tileH
    // (tile fully off the top).
    var tileTopY = yBot - tProgress * (yBot - yTop + transitionTileH);
    var tileBotY = tileTopY + transitionTileH;

    // Layered BG: SOURCE world ABOVE the tile (where it's been after
    // scrolling past — Mike came from there), DESTINATION world BELOW
    // the tile (where it's going — Mike is heading there).
    //   ENTERING (street → water): above = STREET, below = SEA
    //   EXITING  (water → street): above = SEA,    below = STREET
    // The transition tile itself bridges the two (street content at
    // its top edge for enter, water content at its top edge for exit
    // — confirmed against the source art).
    var aboveIsSea = (phase === 'exiting');
    var belowIsSea = (phase === 'entering');

    // Render BG ABOVE the tile (clipped to [yTop, tileTopY])
    if (tileTopY > yTop) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, yTop, w, Math.max(0, tileTopY - yTop));
      ctx.clip();
      if (aboveIsSea) {
        ctx.fillStyle = '#1d6587';
        ctx.fillRect(0, yTop, w, tileTopY - yTop);
        drawAlternatingSea(0, yTop, tileTopY, tileH, offset);
      } else {
        drawStreetTileForBackground(yTop, tileTopY);
      }
      ctx.restore();
    }
    // Render BG BELOW the tile (clipped to [tileBotY, yBot])
    if (tileBotY < yBot) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, tileBotY, w, Math.max(0, yBot - tileBotY));
      ctx.clip();
      if (belowIsSea) {
        ctx.fillStyle = '#1d6587';
        ctx.fillRect(0, tileBotY, w, yBot - tileBotY);
        drawAlternatingSea(0, tileBotY, yBot, tileH, offset);
      } else {
        drawStreetTileForBackground(tileBotY, yBot);
      }
      ctx.restore();
    }

    // Finally draw the transition tile on top
    ctx.drawImage(transitionTile, 0, tileTopY, w, transitionTileH);

    ctx.restore();
  }

  // Helper: render the regular street tile filling [yTop, yBot]. Used
  // as the BACKGROUND underlay during the EXITING water phase so the
  // boat-ramp transition reveals STREET (not more sea) as it scrolls
  // up off the top of the screen.
  function drawStreetTileForBackground(yTop, yBot) {
    var w = viewW();
    var roadH = yBot - yTop;
    var bg = currentRoadKey ? sprites[currentRoadKey] : null;
    if (!bg) {
      // Fallback to procedural road if image missing
      drawRoadProcedural(yTop, yBot);
      return;
    }
    var bgScale = w / bg.width;
    var tileH = bg.height * bgScale;
    var offset = state.distancePx % tileH;
    var firstY = yTop - offset + tileH;
    for (var ty = firstY - tileH; ty - tileH < yBot; ty += tileH) {
      ctx.drawImage(bg, 0, ty, w, tileH);
    }
  }

  // Helper: tile bg-water-tile-a and bg-water-tile-b ALTERNATING
  // vertically with the standard scroll offset, so the wave pattern
  // animates as the world scrolls past.
  function drawAlternatingSea(x, yTop, yBot, tileH, offset) {
    var w = viewW();
    var tileA = sprites['bg-water-tile-a'];
    var tileB = sprites['bg-water-tile-b'];
    if (!tileA || !tileB) return;
    var firstY = yTop - offset + tileH;
    // Tile index 0 = A, 1 = B, 2 = A, 3 = B... Pick which tile to use
    // for the FIRST drawn tile based on how many full tile-heights
    // have passed in the total scroll.
    var startIdx = Math.floor(state.distancePx / tileH);
    var i = 0;
    for (var ty = firstY - tileH; ty - tileH < yBot; ty += tileH) {
      var tile = ((startIdx + i) % 2 === 0) ? tileA : tileB;
      ctx.drawImage(tile, x, ty, w, tileH);
      i++;
    }
  }

  function drawRoadProcedural(yTop, yBot) {
    var w = viewW();
    var roadH = yBot - yTop;
    var sidewalkW = w * 0.07;
    var roadL = sidewalkW;
    var roadR = w - sidewalkW;
    var roadW = roadR - roadL;

    // Sidewalks
    ctx.fillStyle = '#5a5a64';
    ctx.fillRect(0, yTop, sidewalkW, roadH);
    ctx.fillRect(roadR, yTop, sidewalkW, roadH);
    ctx.fillStyle = '#3a3a40';
    ctx.fillRect(sidewalkW - 3, yTop, 3, roadH);
    ctx.fillRect(roadR, yTop, 3, roadH);
    // Sidewalk grates — scroll UP (start below, move up)
    var detailScroll = state.distancePx % SIDEWALK_DETAIL_INTERVAL_PX;
    for (var sy = yBot + SIDEWALK_DETAIL_INTERVAL_PX - detailScroll;
         sy > yTop - SIDEWALK_DETAIL_INTERVAL_PX;
         sy -= SIDEWALK_DETAIL_INTERVAL_PX) {
      ctx.fillStyle = '#3e3e46';
      ctx.fillRect(sidewalkW * 0.20, sy, sidewalkW * 0.60, 22);
      ctx.fillRect(roadR + sidewalkW * 0.20, sy, sidewalkW * 0.60, 22);
    }
    // Asphalt
    ctx.fillStyle = '#2a2a2e';
    ctx.fillRect(roadL, yTop, roadW, roadH);
    // Crosswalks scrolling UP
    var cwScroll = state.distancePx % CROSSWALK_INTERVAL_PX;
    var cwY = yBot + CROSSWALK_INTERVAL_PX - cwScroll;
    while (cwY > yTop - CROSSWALK_INTERVAL_PX) {
      if (cwY + 22 > yTop && cwY < yBot) {
        var stripeCount = 7;
        var stripeW = roadW / (stripeCount * 2 - 1);
        ctx.fillStyle = '#f4f4f4';
        for (var s = 0; s < stripeCount; s++) {
          var sx = roadL + s * stripeW * 2;
          ctx.fillRect(sx, cwY, stripeW, 22);
        }
      }
      cwY -= CROSSWALK_INTERVAL_PX;
    }
    // Lane dashes scrolling UP (positive offset shifts dashes upward)
    ctx.strokeStyle = '#FFD566';
    ctx.lineWidth = 3;
    ctx.setLineDash([26, 24]);
    ctx.lineDashOffset = state.distancePx % 50;
    for (var i = 1; i < LANES; i++) {
      var lx = roadL + (roadW / LANES) * i;
      ctx.beginPath();
      ctx.moveTo(lx, yTop);
      ctx.lineTo(lx, yBot);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  // Mike's lane center now spans the ROAD area, not the full canvas
  // (so he stays on asphalt, not on the sidewalk).
  function laneXOnRoad(lane) {
    var w = viewW();
    var sidewalkW = w * 0.07;
    var roadL = sidewalkW;
    var roadW = w - 2 * sidewalkW;
    return roadL + (roadW / LANES) * (lane + 0.5);
  }

  function pickCoinSprite(now) {
    // Cycle through cx-coin-01..08 over time for a spinning effect.
    var idx = Math.floor(now / COIN_FRAME_MS) % 8 + 1;
    return 'cx-coin-' + (idx < 10 ? '0' + idx : idx);
  }

  function drawAt(spriteKey, x, y, w, h) {
    var img = sprites[spriteKey];
    if (!img) {
      // Fallback so missing sprites still show as a colored box.
      ctx.fillStyle = '#ff00ff';
      ctx.fillRect(x - w/2, y, w, h);
      return;
    }
    ctx.drawImage(img, x - w/2, y, w, h);
  }

  // Draw a sprite while pulling the source rect short on the bottom by
  // cropFrac (0..1). Used to hide the ground-shadow ellipse baked into
  // NPC + cop-car art without re-extracting every sprite. Render
  // height also shrinks proportionally so the crop doesn't visually
  // STRETCH the remaining content.
  function drawAtCropped(spriteKey, x, y, w, h, cropFrac) {
    var img = sprites[spriteKey];
    if (!img) {
      ctx.fillStyle = '#ff00ff';
      ctx.fillRect(x - w/2, y, w, h);
      return;
    }
    var srcH = img.height * (1 - cropFrac);
    var dstH = h * (1 - cropFrac);
    ctx.drawImage(img, 0, 0, img.width, srcH, x - w/2, y, w, dstH);
  }

  // ============================================================
  // ICE side-kick — runs alongside Mike, auto-grabs nearby coins.
  // Ice prefers to stand on the side of Mike with the most road room
  // (so he doesn't immediately fly off-screen when Mike picks an edge
  // lane). Each pickup triggers a neck-stretch animation.
  // ============================================================
  function iceX() {
    // Position Ice on Mike's side that has more room. If Mike is in
    // the leftmost lane, Ice goes to the right; rightmost lane → Ice
    // goes left; otherwise Ice picks the side with more empty road.
    var mikeX = laneX(state.player.targetLane);
    var w = viewW();
    var leftRoom = mikeX;
    var rightRoom = w - mikeX;
    var side = (leftRoom > rightRoom) ? -1 : +1;
    state.ice.lastSide = side;
    return mikeX + side * (w * ICE_OFFSET_X_FRAC);
  }

  function pickIceFrame(now) {
    // Neck-stretching after a fresh coin grab — neck-stretch frames in
    // the extracted set are ice-23..29 (7 frames of the neck growing
    // longer). Animate forward through them over the stretch duration.
    if (now < state.ice.neckStretchUntil) {
      var t = 1 - (state.ice.neckStretchUntil - now) / ICE_NECK_STRETCH_MS; // 0→1
      var stretchFrame = 23 + Math.floor(t * 7);
      if (stretchFrame > 29) stretchFrame = 29;
      return 'ice-' + (stretchFrame < 10 ? '0' + stretchFrame : stretchFrame);
    }
    // Camera-POV run cycle — only frames 14 + 16 (the two stride poses).
    // Frame 15 was a STANDING-still pose that, alternated between 14
    // and 16, made the run cycle look like it kept "pausing" with one
    // leg always planted. Dropping it gives a cleaner 2-frame stride
    // alternation. Y-bob in drawIce simulates the bounce a real run
    // would have so the limited frame count still reads as motion.
    var frames = [14, 16];
    var frame = frames[Math.floor(now / RUN_FRAME_MS) % frames.length];
    return 'ice-' + frame;
  }

  function drawIce(now) {
    if (!state.iceSidekickJoined) return;
    if (cutscene.active) return;
    // Ice never appears during the water/hurricane phase — Mike's
    // floating alone on his mattress. Even if some path left
    // iceSidekickJoined=true going into water (e.g., dev URL params
    // skipping the before-water cutscene), defensively hide him here.
    if (state.water && state.water.phase !== 'none') return;
    // During horse boost, Ice rides on Mike's horse (built into the
    // mike-ice-horse-* sprite), so no separate Ice render needed.
    if (performance.now() < state.effects.horseBoostUntil) return;
    var key = pickIceFrame(now);
    var img = sprites[key];
    var baseImg = sprites['ice-15']; // reference frame for the base Ice height
    if (!img || !baseImg) return;
    var pxPerSrc = (viewH() * ICE_HEIGHT_FRAC) / baseImg.height;
    var w = img.width * pxPerSrc;
    // Height policy:
    //   - During neck-stretch: per-frame (img.height varies, that's the
    //     POINT — taller stretch frames render proportionally taller).
    //   - During run cycle: LOCK to baseImg.height so the small
    //     per-frame height differences in ice-14 / ice-16 don't cause
    //     a visible vertical flicker every animation tick.
    var stretching = now < state.ice.neckStretchUntil;
    var h = (stretching ? img.height : baseImg.height) * pxPerSrc;
    // Y-bob: small sine-wave vertical oscillation while NOT mid-stretch
    var bob = 0;
    if (now >= state.ice.neckStretchUntil) {
      bob = Math.sin(now / 110) * (viewH() * 0.012);
    }

    // TRAILING MODE — after the 'ice-returns' cutscene, Ice chases
    // Mike from BEHIND instead of running beside him. Same lane as
    // Mike (so he reads as actively pursuing), positioned further
    // down the road (higher screen Y). Render at slightly smaller
    // scale + with the ground-perspective offset so he reads as
    // "further away" behind Mike.
    var x, y, srcCropFrac;
    if (state.iceTrailing) {
      x = laneX(state.player.targetLane);
      // Trail offset: ~12% of viewport height ABOVE Mike's foot line
      // (negative = up). Per playtest the original positive offset
      // landed Ice in the wrong spot; flipping the sign reads correctly
      // — Ice appears further up the road (in the perspective sense)
      // chasing Mike from behind.
      var trailOffsetY = -viewH() * 0.12;
      // Slight scale-down for "further from camera" perspective.
      var trailScale = 0.85;
      w *= trailScale;
      h *= trailScale;
      y = playerY() - h + bob + trailOffsetY;
      srcCropFrac = 0.91;
      // Force lastSide to +1 so trailing Ice always faces forward
      // (toward the camera / toward Mike). No mirror flipping needed.
      state.ice.lastSide = +1;
    } else {
      // SIDE-KICK MODE — original behavior, run beside Mike on the
      // side of the road that has more room.
      x = iceX();
      y = playerY() - h + bob; // bottom-anchored at Mike's foot line
      srcCropFrac = 0.91;
    }

    // CROP the bottom of the source image to hide the ground-shadow
    // ellipse that's baked into every Ice frame.
    var srcH = img.height * srcCropFrac;
    var dstH = h * srcCropFrac;
    // Mirror horizontally if Ice is on Mike's left (so he faces forward)
    ctx.save();
    if (state.ice.lastSide < 0) {
      ctx.translate(x + w / 2, y);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, img.width, srcH, -w / 2, 0, w, dstH);
    } else {
      ctx.drawImage(img, 0, 0, img.width, srcH, x - w / 2, y, w, dstH);
    }
    ctx.restore();
  }

  // Called from coin-collision logic — Ice grabs any coin within his
  // reach radius, regardless of lane. Returns true if Ice grabbed it.
  function tryIceGrab(coin, now) {
    if (!state.iceSidekickJoined) return false;
    if (coin.picked) return false;
    var ix = iceX();
    // Ice's vertical center for collision is half his run-cycle height
    var iceFullH = viewH() * ICE_HEIGHT_FRAC;
    var iy = playerY() - iceFullH * 0.5;
    var coinCx = laneX(coin.lane);
    var coinCy = coin.y + coin.h / 2;
    var dx = coinCx - ix;
    var dy = coinCy - iy;
    if (dx * dx + dy * dy < ICE_REACH_PX * ICE_REACH_PX) {
      coin.picked = true;
      state.iceCoinsCollected++;
      // Ice's grabs add to player's score at the configured bonus rate
      state.coins += ICE_COIN_BONUS;
      state.ice.neckStretchUntil = now + ICE_NECK_STRETCH_MS;
      playSfx('coin-pickup');
      playSfx('ice-neck');
      return true;
    }
    return false;
  }

  // ============================================================
  // XENA THE WITCH — anti-sidekick (v0.18.52 phase C). Mirrors Ice's
  // rendering path but on the OPPOSITE side of Mike (or same side if
  // Ice is also there — they jostle for room). Steals Cx coins +
  // weed pickups from Mike instead of grabbing for him.
  // ============================================================
  function xenaX() {
    // Pick the side OPPOSITE to where Ice is. If Ice isn't around,
    // pick the side with more room (mirrors Ice's iceX logic).
    var mikeX = laneX(state.player.targetLane);
    var w = viewW();
    var leftRoom = mikeX;
    var rightRoom = w - mikeX;
    var side;
    if (state.iceSidekickJoined && !state.iceTrailing) {
      // Ice is on the side with more room — Xena takes the other.
      side = (leftRoom > rightRoom) ? +1 : -1;
    } else {
      side = (leftRoom > rightRoom) ? -1 : +1;
    }
    state.xena.lastSide = side;
    return mikeX + side * (w * XENA_OFFSET_X_FRAC);
  }

  function pickXenaFrame(now) {
    // Cycle through 4 walk frames at XENA_FRAME_MS. Picked from the
    // 18-frame walk sheet; frames 1-4 are the front-facing run cycle.
    var frames = ['xena-walk-01', 'xena-walk-02', 'xena-walk-03', 'xena-walk-04'];
    return frames[Math.floor(now / XENA_FRAME_MS) % frames.length];
  }

  function drawXena(now) {
    if (!state.xenaFollowing) return;
    if (cutscene.active) return;
    // No Xena during the water phase — same rule as Ice. Mike's
    // alone on the mattress raft.
    if (state.water && state.water.phase !== 'none') return;
    if (now < state.effects.horseBoostUntil) return;  // hidden during horse ride
    var key = pickXenaFrame(now);
    var img = sprites[key];
    var baseImg = sprites['xena-walk-01'];
    if (!img || !baseImg) return;
    var pxPerSrc = (viewH() * XENA_HEIGHT_FRAC) / baseImg.height;
    var w = img.width * pxPerSrc;
    var h = baseImg.height * pxPerSrc;
    var bob = Math.sin(now / 110) * (viewH() * 0.012);
    var x = xenaX();
    var y = playerY() - h + bob;

    ctx.save();
    // GRAB FLASH — bigger / brighter / pulsing per user feedback.
    // Pulses both shadowBlur and color over the flash window so the
    // halo "twinkles" rather than sitting at a fixed brightness.
    var flashing = now < state.xena.grabFlashUntil;
    if (flashing) {
      var flashRem = (state.xena.grabFlashUntil - now) / XENA_GRAB_FLASH_MS;
      // Sine pulse so the halo throbs through the flash duration
      var pulseT = Math.sin(now / 70) * 0.5 + 0.5;            // 0..1
      var blurPx = 24 + pulseT * 22;                          // 24..46 px
      var colorAlpha = 0.7 + pulseT * 0.3;                    // 0.7..1.0
      ctx.shadowColor = 'rgba(255, 220, 120, ' + colorAlpha + ')';
      ctx.shadowBlur = blurPx;
      // Also slight scale punch at the start of the flash
      var scalePop = 1 + Math.max(0, (flashRem - 0.6)) * 0.25;  // 1..1.10
      var dx = x;
      var dy = y;
      ctx.translate(dx, dy);
      ctx.scale(scalePop, scalePop);
      ctx.translate(-dx, -dy);
    }
    // Mirror horizontally if she's on Mike's left so she faces forward
    if (state.xena.lastSide < 0) {
      ctx.translate(x + w / 2, y);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, img.width, img.height, -w / 2, 0, w, h);
    } else {
      ctx.drawImage(img, 0, 0, img.width, img.height, x - w / 2, y, w, h);
    }
    ctx.restore();
  }

  // tryXenaSnipe — called from coin / pickup collision paths BEFORE
  // Mike's own collision check. Returns true if Xena stole the item
  // (caller should treat the item as already-consumed and skip Mike's
  // normal collection / debuff effect).
  //
  // Logic:
  //   1. Bail out if Xena isn't following or is already invisible.
  //   2. Item must be within XENA_REACH_PX of Xena's current position.
  //   3. Roll a 30% chance per item per frame it spends in radius.
  //      Once she "decides to steal" she keeps the decision (item.xenaTagged)
  //      so subsequent frames don't re-roll and accidentally let Mike
  //      grab a coin she'd already committed to.
  function tryXenaSnipe(item, now, kind) {
    if (!state.xenaFollowing) return false;
    if (!item || item.picked) return false;
    if (cutscene.active) return false;
    if (state.water && state.water.phase !== 'none') return false;
    if (now < state.effects.horseBoostUntil) return false;
    var ix = xenaX();
    var iy = playerY() - (viewH() * XENA_HEIGHT_FRAC) * 0.5;
    var itemCx = laneX(item.lane);
    var itemCy = item.y + (item.h || 60) / 2;
    var dx = itemCx - ix;
    var dy = itemCy - iy;
    if (dx * dx + dy * dy > XENA_REACH_PX * XENA_REACH_PX) return false;
    if (item.xenaTagged) {
      // Already committed; consume on actual reach
      // (when item passes Xena's Y line)
      if (itemCy >= iy - 10) {
        item.picked = true;
        state.xenaStolenCount++;
        state.xena.grabFlashUntil = now + XENA_GRAB_FLASH_MS;
        playSfx('xena-coin-pickup');
        ga('xena_stole', { kind: kind || 'unknown' });
        return true;
      }
      return false;  // tagged but hasn't reached her yet
    }
    // First time in radius — roll for steal commitment
    if (Math.random() < XENA_STEAL_PROB) {
      item.xenaTagged = true;
    }
    return false;
  }

  function drawPlayer(now) {
    // Lerp X smoothly between current and target lane.
    var fromLane = state.player.lane;
    var toLane = state.player.targetLane;
    var t = state.player.lerpX;
    var x = laneX(fromLane) + (laneX(toLane) - laneX(fromLane)) * t;
    if (t >= 1) state.player.lane = toLane;

    // GAME OVER — render the random death-pose sprite at Mike's last
    // position instead of the running animation. The death image stays
    // on the road behind the gameover overlay panel so the cause-of-
    // death visually matches what the player sees in the panel above.
    if (state.phase === 'gameover' && state.gameOverDeathKey) {
      var dimg = sprites[state.gameOverDeathKey];
      if (dimg) {
        // Render at ~1.4x Mike's normal height so the dramatic pose
        // reads clearly in the open road space.
        var dHeightFrac = PLAYER_TARGET_HEIGHT_FRAC * 1.4;
        var dTargetH = viewH() * dHeightFrac;
        var dScale = dTargetH / dimg.height;
        var dW = dimg.width * dScale;
        var dH = dTargetH;
        ctx.drawImage(dimg, x - dW / 2, playerY() - dH, dW, dH);
      }
      return;
    }

    // Determine which sprite-set Mike uses right now:
    // 1. HORSE boost active → horse-riding (solo if Ice hasn't joined,
    //    Mike+Ice duo if Ice has joined post-cutscene)
    // 2. Otherwise → standard run-cycle (with jump-pose freeze if airborne)
    var nowMs = performance.now();
    // WATER PHASE — Mike sits on a mattress, no run cycle. Cycle
    // through the 12 mattress frames slowly for a "floating bob"
    // animation. Bigger render scale than running Mike since the
    // mattress sprite includes the raft underneath.
    if (state.water.phase !== 'none') {
      var mFrame = Math.floor(nowMs / 280) % 12 + 1;
      var mKey = 'mike-mattress-' + (mFrame < 10 ? '0' + mFrame : mFrame);
      var mImg = sprites[mKey];
      if (mImg) {
        var mHeightFrac = PLAYER_TARGET_HEIGHT_FRAC * 1.4;
        var mTargetH = viewH() * mHeightFrac;
        var mScale = mTargetH / mImg.height;
        var mDw = mImg.width * mScale;
        var mDh = mTargetH;
        // Slight up/down bob on top of the frame cycle for that
        // "rocking on waves" feel
        var bob = Math.sin(nowMs / 380) * 6;
        ctx.drawImage(mImg, x - mDw / 2, playerY() - mDh + bob, mDw, mDh);
      }
      return;
    }
    var onHorse = nowMs < state.effects.horseBoostUntil;
    var key, sizingKey;
    if (onHorse) {
      // Cycle horse-riding frames. Use mike-ice-horse if Ice has joined.
      var horsePrefix = state.iceSidekickJoined ? 'mike-ice-horse-' : 'mike-horse-';
      var horseFrameCount = state.iceSidekickJoined ? 14 : 8;
      var hframe = (Math.floor(now / RUN_FRAME_MS) % horseFrameCount) + 1;
      key = horsePrefix + (hframe < 10 ? '0' + hframe : hframe);
      sizingKey = horsePrefix + '01';
    } else if (isAirborne(now)) {
      key = 'mike-run-03';
      sizingKey = 'mike-run-01';
    } else {
      // STONED — slow the run-cycle frame rate so Mike's legs visibly
      // animate slower (matches the world-scroll slowdown). Default
      // RUN_FRAME_MS = 80 -> stoned uses 200ms (2.5x slower).
      var stonedFrameMs = nowMs < state.effects.weedDebuffUntil ? RUN_FRAME_MS * 2.5 : RUN_FRAME_MS;
      var frame = Math.floor(now / stonedFrameMs) % 8 + 1;
      key = 'mike-run-' + (frame < 10 ? '0' + frame : frame);
      sizingKey = 'mike-run-01';
    }
    // Horse sprite is taller than the running Mike — bump scale slightly
    // Horse-riding sprite needs a much larger scale than standing-Mike
    // because the sprite includes BOTH the horse AND the rider stacked
    // on top. Multiplier 1.4 made the combined silhouette only barely
    // taller than Mike alone, so the horse part was tiny + felt
    // inconsistent with the larger horse-pickup sprite (heightFrac
    // 0.22 just for the horse). Bumped to 2.4 so the horse part of the
    // ride sprite reads at roughly the same visual height as the
    // pickup horse before mounting.
    var heightFrac = onHorse ? PLAYER_TARGET_HEIGHT_FRAC * 2.4 : PLAYER_TARGET_HEIGHT_FRAC;
    var size = scaledSize(sizingKey, heightFrac);
    // Apply jump lift (negative Y offset = up) so Mike arcs over jump-only obstacles
    var y = playerY() - size.h + jumpLiftPx(now);

    // Flash on i-frames (after a hit)
    var flashAlpha = 1;
    if (now < state.invulnUntil) {
      flashAlpha = (Math.floor(now / 80) % 2 === 0) ? 0.35 : 1;
    }
    ctx.globalAlpha = flashAlpha;
    drawAt(key, x, y, size.w, size.h);
    ctx.globalAlpha = 1;
  }

  // ============================================================
  // Game-state transitions.
  // ============================================================
  function pickRandomRoadTile() {
    var keys = ['bg-road-1', 'bg-road-2', 'bg-road-3', 'bg-road-4'];
    var loaded = keys.filter(function (k) { return sprites[k]; });
    if (!loaded.length) return null;
    return loaded[Math.floor(Math.random() * loaded.length)];
  }

  function startRun() {
    state.phase = 'playing';
    setPaused(false); // ensure not stuck in paused state from a previous run
    state.speed = SPEED_INITIAL;
    state.distance = 0;
    state.distancePx = 0;
    state.elapsedMs = 0;
    state.coins = 0;
    state.multiplier = 1;
    state.lives = LIVES_INITIAL;
    state.player.lane = STARTING_LANE;
    state.player.targetLane = STARTING_LANE;
    state.player.lerpX = 1;
    state.player.jumpStart = 0;
    state.obstacles = [];
    state.coinsArr = [];
    state.pickups = [];
    state.coinParticles = [];
    state.coinRewardFlash = null;
    state.crossCars = [];
    state.crossCarSpawnTimer = 0;
    state.crossCarNextSpawnMs = CROSS_CAR_SPAWN_MS_FAR;
    state.fauna = [];
    state.faunaSpawnTimer = 0;
    state.faunaNextSpawnMs = FAUNA_SPAWN_MIN_MS;
    state.chaseOfficers = [];
    state.water.phase = 'none';
    state.water.startedAt = 0;
    state.water.lastTriggeredAt = 0;
    state.water.lastLightningAt = 0;
    state.water.nextLightningAt = 0;
    state.water.lightningUntil = 0;
    state.water.raindrops = [];
    state.water.shoovyBoat = null;
    state.water.shoovyTriggered = false;
    state.water.completed = false;
    state.gameOverDeathKey = null;
    // JAIL feature reset (v0.18.52)
    state.copTouches = 0;
    state.bailCount = 0;
    state.jail.phase = 'none';
    state.jail.startedAt = 0;
    state.jail.checkpointDistance = 0;
    state.jail.checkpointLane = 0;
    state.xenaFollowing = false;
    state.xena.lastSide = -1;
    state.xena.grabFlashUntil = 0;
    state.xenaStolenCount = 0;
    state.xenaBailDistortUntil = 0;
    state.shoovySunsetUntil = 0;
    // ====================================================
    // NEW-RECORD CELEBRATION (v0.18.51)
    // Cache the leaderboard's current top score at run start.
    // While running, if state.distance crosses it ONCE, we fire the
    // newRecordFlash overlay. Skipped entirely if the leaderboard
    // hasn't loaded yet (null) or is empty (top===0).
    // ====================================================
    state.leaderboardTopScore = null;
    state.newRecordTriggered = false;
    state.newRecordFlash = null;
    if (window.RunnerLeaderboard && window.RunnerLeaderboard.fetchTop) {
      window.RunnerLeaderboard.fetchTop(1).then(function (rows) {
        if (rows && rows.length > 0 && typeof rows[0].score === 'number') {
          state.leaderboardTopScore = rows[0].score;
          console.log('[run] leaderboard top score cached for new-record check:', state.leaderboardTopScore);
        } else {
          // Empty leaderboard — explicit 0 sentinel so the trigger
          // skips (won't fire on score=0 board, per design ask).
          state.leaderboardTopScore = 0;
          console.log('[run] leaderboard empty; new-record celebration disabled this run');
        }
      }).catch(function (e) {
        // Network or rules error — leave null, never trigger
        console.warn('[run] leaderboard top-score fetch failed:', e);
        state.leaderboardTopScore = null;
      });
    }
    state.spawnTimer = 0;
    state.invulnUntil = 0;
    state.effects.hamFreezeUntil = 0;
    state.effects.hamBonusUntil = 0;
    state.effects.weedDebuffUntil = 0;
    state.effects.horseBoostUntil = 0;
    state.effects.controlsReversedUntil = 0;
    state.effects.textShownUntil = 0;
    state.effects.textLabel = '';
    // Cut scene resets: each new run starts with Ice gone and all
    // cutscene triggers cleared so the multi-stage Ice arc replays
    // (First Meet → Mike Tells Off → Ice Returns) every fresh run.
    cutscene.active = false;
    cutscene.defId = null;
    state.cutscenesTriggered = {};
    state.iceSidekickJoined = false;
    state.iceTrailing = false;
    state.ice.neckStretchUntil = 0;
    state.iceCoinsCollected = 0;
    document.getElementById('overlay-cutscene').classList.add('hidden');
    // Reset music playback rate in case prior run ended mid-bonus
    if (currentMusicKey && audioInstances[currentMusicKey]) {
      audioInstances[currentMusicKey].playbackRate = 1;
    }
    currentRoadKey = pickRandomRoadTile();
    document.getElementById('overlay-start').classList.add('hidden');
    document.getElementById('overlay-gameover').classList.add('hidden');
    updateHUD();
    syncChromeForPhase();
    // Stop any leftover death/gameover audio from the previous run before
    // kicking off the new bg music. Without this, a quick RUN AGAIN tap
    // would leave the "meow meow" gameover sting playing on top of the
    // fresh background music for ~3 seconds.
    stopLoop('death');
    stopLoop('death-gameover');
    // Audio: random bg music + ambient mob loop in the distance
    startBackgroundMusic();
    startLoop('mob-angry');
    ga('game_started');

    // ============================================================
    // DEV PARAM application (only fires if URL contains the params).
    // ============================================================
    state.godMode = !!devParams.god;
    if (devParams.dist > 0) {
      state.distance = devParams.dist;
      state.distancePx = devParams.dist * 10;  // px/m fudge factor matches update()
      console.log('[dev] startRun seeded distance to', devParams.dist, 'm');
    }
    if (devParams.water) {
      // Skip directly into the water phase. Pretend Ice already left
      // (no cutscene chain), then start water immediately.
      state.iceSidekickJoined = false;
      state.iceTrailing = false;
      state.cutscenesTriggered['before-water'] = true;
      state.cutscenesTriggered['adin-ross'] = true;
      console.log('[dev] startRun jumping straight into water phase');
      // Defer one frame so the rest of startRun finishes setting state
      setTimeout(function () { startWaterPhase(); }, 0);
    }
    if (devParams.cut) {
      // Defer to next tick so the rest of startRun completes first.
      // Validate against CUTSCENE_DEFS so a typo doesn't crash.
      var cutId = devParams.cut;
      if (CUTSCENE_DEFS[cutId]) {
        console.log('[dev] startRun firing cutscene:', cutId);
        setTimeout(function () { startCutscene(cutId); }, 50);
      } else {
        console.warn('[dev] unknown ?cut= name:', cutId, '(valid:', Object.keys(CUTSCENE_DEFS).join(', '), ')');
      }
    }

    // Bump the global attempts counter (Firebase). Best-effort —
    // failures swallow silently so they don't block the run start.
    // GOD MODE: skip the increment so dev runs don't pollute stats.
    if (!state.godMode && window.RunnerLeaderboard && window.RunnerLeaderboard.incrementAttemptCount) {
      window.RunnerLeaderboard.incrementAttemptCount();
    }
  }

  function quitToTitle() {
    // Hard reset back to title screen — clears game state, hides
    // pause + gameover overlays, shows the start overlay.
    setPaused(false);
    state.phase = 'menu';
    stopBackgroundMusic();
    stopLoop('mob-angry');
    // Hurricane segment audio — stop loops + thunder one-shots so they
    // don't keep playing if the player quit mid-water.
    stopLoop('water-loop');
    stopLoop('rain-loop');
    for (var ti = 0; ti < THUNDER_VARIANTS.length; ti++) {
      stopLoop(THUNDER_VARIANTS[ti]);
    }
    state.water.phase = 'none';
    state.water.raindrops = [];
    state.water.lightningUntil = 0;
    // Stop the death + gameover-music SFX explicitly. They're one-shots
    // (not loops) but if the player quits to title BEFORE death-gameover
    // finishes its ~3 sec play, it'd keep playing on the title screen.
    stopLoop('death');
    stopLoop('death-gameover');
    // Restart bg music for the title screen
    startBackgroundMusic();
    document.getElementById('overlay-start').classList.remove('hidden');
    document.getElementById('overlay-pause').classList.add('hidden');
    document.getElementById('overlay-gameover').classList.add('hidden');
    syncChromeForPhase();
    // Refresh stats — if the player just submitted a score, the
    // numbers should reflect that on return to title.
    refreshTitleStats();
  }

  // Show/hide chrome based on game phase. Pause button only relevant
  // during play. Body gets a `phase-playing` class so CSS can disable
  // the BookHockeys link's pointer-events during play (stray clicks
  // during gameplay shouldn't navigate the user away).
  function syncChromeForPhase() {
    var pauseBtn = document.getElementById('btn-pause');
    if (pauseBtn) {
      pauseBtn.classList.toggle('hidden', state.phase !== 'playing');
    }
    document.body.classList.toggle('phase-playing', state.phase === 'playing');
  }

  // ============================================================
  // PNG SHARE — composes a 1080x1080 image of the player's run
  // (title-card art bg + score panel + streamer credit) and downloads
  // it. Reads the player's submitted handle from RunnerLeaderboard if
  // they submitted this session; otherwise renders without the credit
  // line. Pure offscreen canvas; same-origin assets so toDataURL works
  // without taint.
  // ============================================================
  function doSharePng() {
    var hintEl = document.getElementById('share-hint');
    var setHint = function (msg, isErr) {
      if (!hintEl) return;
      hintEl.textContent = msg;
      hintEl.classList.toggle('error', !!isErr);
    };
    setHint('Building image…');
    try {
      var dataUrl = buildSharePng();
      if (!dataUrl) {
        setHint('Could not build image (assets not loaded)', true);
        return;
      }
      // Trigger download via temporary link
      var distance = Math.floor(state.distance);
      var fname = 'onbaby-run-' + distance + 'm.png';
      var a = document.createElement('a');
      a.href = dataUrl;
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setHint('Saved as ' + fname);
      ga('share_png_generated', { distance: distance, score: state.coins * state.multiplier * 10 + distance });
    } catch (err) {
      console.error('[share] failed:', err);
      setHint('Couldn\'t build image: ' + (err.message || err), true);
    }
  }

  function buildSharePng() {
    var bg = sprites['titlescreen'];
    if (!bg) return null;
    var W = 1080;
    var H = 1080;
    var oc = document.createElement('canvas');
    oc.width = W;
    oc.height = H;
    var c = oc.getContext('2d');

    // 1) Background — cover-fit the title art so it fills the square,
    // anchored to the top so Mike + Ice's faces stay visible (cropping
    // happens at the bottom which is mostly road).
    var s = Math.max(W / bg.width, H / bg.height);
    var bw = bg.width * s;
    var bh = bg.height * s;
    c.drawImage(bg, (W - bw) / 2, 0, bw, bh);
    // Subtle dark vignette at the top + bottom so the text panels read
    // cleanly against the busy art.
    var grad = c.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(8, 6, 14, 0.75)');
    grad.addColorStop(0.18, 'rgba(8, 6, 14, 0.0)');
    grad.addColorStop(0.55, 'rgba(8, 6, 14, 0.0)');
    grad.addColorStop(1, 'rgba(8, 6, 14, 0.92)');
    c.fillStyle = grad;
    c.fillRect(0, 0, W, H);

    // 2) Top — "ON BABY!" cursive title
    c.save();
    c.font = 'bold 90px Pacifico, "VT323", cursive';
    c.fillStyle = '#C9A4FF';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.shadowColor = 'rgba(142, 92, 203, 0.7)';
    c.shadowOffsetX = 6;
    c.shadowOffsetY = 6;
    c.shadowBlur = 0;
    c.fillText('On Baby!', W / 2, 90);
    c.restore();

    // 3) Score panel — semi-opaque card centered lower-third
    var distance = Math.floor(state.distance);
    var coins = state.coins;
    var mult = state.multiplier;
    var totalScore = distance + coins * mult * 10;
    var panelW = W * 0.85;
    var panelH = 320;
    var panelX = (W - panelW) / 2;
    var panelY = H - panelH - 110;
    c.fillStyle = 'rgba(14, 10, 28, 0.86)';
    c.strokeStyle = 'rgba(201, 164, 255, 0.5)';
    c.lineWidth = 3;
    roundedRect(c, panelX, panelY, panelW, panelH, 22);
    c.fill();
    c.stroke();

    // 3a) "MY SCORE" label
    c.fillStyle = 'rgba(201, 164, 255, 0.85)';
    c.font = '700 28px "VT323", monospace';
    c.textAlign = 'center';
    c.fillText('MY SCORE', W / 2, panelY + 42);

    // 3b) Big total
    c.fillStyle = '#FFD566';
    c.font = '700 110px "VT323", monospace';
    c.shadowColor = 'rgba(0, 0, 0, 0.6)';
    c.shadowOffsetX = 4;
    c.shadowOffsetY = 4;
    c.shadowBlur = 0;
    c.fillText(totalScore.toLocaleString(), W / 2, panelY + 130);
    c.shadowOffsetX = 0;
    c.shadowOffsetY = 0;

    // 3c) Distance + Cx breakdown — three columns below the total
    var rowY = panelY + 215;
    c.font = '700 30px "VT323", monospace';
    c.fillStyle = '#fff';
    c.textAlign = 'center';
    c.fillText(distance.toLocaleString() + ' m', W / 2 - 280, rowY);
    c.fillText('Cx ' + coins, W / 2, rowY);
    c.fillText('×' + mult, W / 2 + 280, rowY);
    c.fillStyle = 'rgba(201, 164, 255, 0.65)';
    c.font = '500 17px "VT323", monospace';
    c.fillText('DISTANCE', W / 2 - 280, rowY + 32);
    c.fillText('COINS', W / 2, rowY + 32);
    c.fillText('MULTIPLIER', W / 2 + 280, rowY + 32);

    // 4) Streamer credit (if they submitted this session)
    var byHandle = window.RunnerLeaderboard && window.RunnerLeaderboard.lastSubmittedIdentity;
    var byPlatform = window.RunnerLeaderboard && window.RunnerLeaderboard.lastSubmittedPlatform;
    if (byHandle) {
      var bottomY = H - 70;
      c.fillStyle = 'rgba(255, 255, 255, 0.65)';
      c.font = '500 22px "VT323", monospace';
      c.textAlign = 'center';
      var label = 'submitted by';
      c.fillText(label, W / 2 - 80, bottomY);
      // Platform icon (simple colored square + letter so we don't have
      // to await SVG → image conversion)
      c.fillStyle = byPlatform === 'twitch' ? '#9146ff' : '#53fc18';
      var iconSize = 28;
      var iconX = W / 2 - 8;
      var iconY = bottomY - iconSize / 2 - 4;
      c.fillRect(iconX, iconY, iconSize, iconSize);
      c.fillStyle = byPlatform === 'twitch' ? '#fff' : '#000';
      c.font = '900 20px "VT323", monospace';
      c.textBaseline = 'middle';
      c.fillText(byPlatform === 'twitch' ? 'T' : 'K', iconX + iconSize / 2, iconY + iconSize / 2);
      c.textBaseline = 'alphabetic';
      // Handle
      c.fillStyle = '#fff';
      c.font = '700 26px "VT323", monospace';
      c.textAlign = 'left';
      c.fillText(byHandle, iconX + iconSize + 10, bottomY);
    }

    // 5) URL caption + version pill at the very bottom for branding
    c.fillStyle = 'rgba(201, 164, 255, 0.85)';
    c.font = '700 24px "VT323", monospace';
    c.textAlign = 'center';
    c.fillText('OUREMPIREX.COM/RUN', W / 2, H - 28);

    return oc.toDataURL('image/png');
  }

  // Helper for rounded-rect paths — chartcompat path the share PNG uses.
  function roundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function endRun() {
    state.phase = 'gameover';
    syncChromeForPhase();
    // Audio: death sting first, then queue the gameover music
    stopBackgroundMusic();
    stopLoop('mob-angry');
    // Cut hurricane audio if Mike died mid-water (sea/rain/thunder
    // loops would keep playing on the gameover screen otherwise).
    stopLoop('water-loop');
    stopLoop('rain-loop');
    for (var tdi = 0; tdi < THUNDER_VARIANTS.length; tdi++) {
      stopLoop(THUNDER_VARIANTS[tdi]);
    }
    playSfx('death');
    setTimeout(function () { playSfx('death-gameover'); }, 600);
    var ov = document.getElementById('overlay-gameover');
    ov.classList.remove('hidden');
    // Pick a random death-pose sprite for variety on each game over.
    // 12 poses available (sniped, electrocuted, fire, frozen, anvil,
    // drowned, R.I.P., etc.). The SAME sprite is shown both on the
    // gameover overlay panel AND rendered on the road where Mike died,
    // so the cause-of-death matches between the two views.
    var di = Math.floor(Math.random() * 12) + 1;
    var dk = di < 10 ? '0' + di : '' + di;
    var deathKey = 'mike-death-' + dk;
    state.gameOverDeathKey = deathKey;
    var deathImg = document.getElementById('gameover-death-img');
    if (deathImg) {
      deathImg.src = 'img/sprites/' + deathKey + '.png';
    }
    var fs = ov.querySelector('.final-score');
    var fc = ov.querySelector('.final-coins');
    var totalCoinScore = state.coins * state.multiplier * 10;
    if (fs) fs.textContent = Math.floor(state.distance) + ' m';
    if (fc) fc.textContent = 'Cx ' + state.coins + ' ×' + state.multiplier
      + '  (+' + totalCoinScore + ')';
    ga('game_over', {
      final_distance: Math.floor(state.distance),
      final_coins: state.coins,
      final_multiplier: state.multiplier,
      final_score: Math.floor(state.distance) + totalCoinScore,
      duration_sec: Math.floor(state.elapsedMs / 1000),
    });

    // v0.18.53 — AUTO-SUBMIT to leaderboard if a kick username is in
    // sessionStorage. Skip in god mode (dev runs shouldn't pollute
    // the board), skip if the user explicitly chose SKIP at start
    // (empty-string sentinel), skip if RunnerLeaderboard isn't loaded.
    var kickUser = '';
    try { kickUser = sessionStorage.getItem('kick_username_v1') || ''; }
    catch (e) {}
    if (!state.godMode && kickUser
        && window.RunnerLeaderboard
        && window.RunnerLeaderboard.submit) {
      var finalScore = Math.floor(state.distance) + totalCoinScore;
      window.RunnerLeaderboard.submit({
        identity: kickUser,
        identityType: 'kick',
        distance: Math.floor(state.distance),
        coins: state.coins,
        multiplier: state.multiplier,
        // v0.18.60 — durationSec was missing, which made submit()
        // do Math.floor(undefined) = NaN. Firebase rejects NaN, so
        // every auto-submit was silently failing. Pass it explicitly
        // (same value endRun's GA event already uses).
        durationSec: Math.floor(state.elapsedMs / 1000),
        score: finalScore,
      }).then(function () {
        console.log('[run] auto-submitted score for', kickUser);
        // Hide the manual SUBMIT button — score is already in.
        var sb = document.getElementById('btn-submit-score');
        if (sb) {
          sb.textContent = 'SUBMITTED ✓';
          sb.disabled = true;
          sb.style.opacity = '.55';
        }
      }).catch(function (err) {
        console.warn('[run] auto-submit failed:', err);
        // Manual button stays available as a fallback.
      });
    }
  }

  // ============================================================
  // Game loop.
  // ============================================================
  // While paused, freeze the `now` value passed to render so every
  // sprite's (now - spawnedAt) frame-picker math stays put. On resume
  // shiftEffectTimers shifts every spawnedAt forward by the pause
  // duration, so when render starts seeing real `now` again the math
  // resolves to the same frame index — no animation jump-cut.
  var pauseFrozenRenderNow = 0;

  function loop(now) {
    var dt = Math.min(0.05, (now - lastTime) / 1000); // clamp dt to avoid huge jumps after tab switch
    lastTime = now;
    // update() is ALWAYS called when playing — its internal short-circuit
    // (after the tick* calls) handles freezing distance/spawning when
    // paused/jailed/cutscene. The pre-v0.18.53 attempt to gate update()
    // entirely on `frozen` broke tickCutscene (typewriter never advanced
    // during dialogue) and tickJail's busted→cell transition. Pre-tick
    // calls inside update() must run unconditionally.
    if (state.phase === 'playing') update(dt);
    var inJail = state.jail && state.jail.phase !== 'none';
    var inCutscene = (typeof cutscene !== 'undefined') && cutscene.active;
    if (inJail) tickJail(now);
    // Render-time freeze for sprite walk-cycles. Skipped during the
    // BUSTED flash so its police-light alternation animates; everything
    // else (cell, bailing, paused, cutscene) freezes sprite time.
    var frozenRender =
      state.paused
      || (inJail && state.jail.phase !== 'busted')
      || inCutscene;
    var renderNow;
    if (frozenRender) {
      if (!pauseFrozenRenderNow) pauseFrozenRenderNow = now;
      renderNow = pauseFrozenRenderNow;
    } else {
      pauseFrozenRenderNow = 0;
      renderNow = now;
    }
    if (state.phase !== 'loading') render(renderNow);
    requestAnimationFrame(loop);
  }

  // ============================================================
  // Audio control UI — 3 sliders + master mute, persists via storage.
  // ============================================================
  function bindAudioUI() {
    var toggle = document.getElementById('audio-toggle');
    var panel = document.getElementById('audio-panel');
    if (!toggle || !panel) return;

    // Sync slider positions to current mixer state on load
    ['music', 'sfx', 'dialogue'].forEach(function (channel) {
      var slider = panel.querySelector('input[data-channel="' + channel + '"]');
      var muteBtn = panel.querySelector('button[data-mute-channel="' + channel + '"]');
      if (slider) {
        slider.value = Math.round(audioMixer[channel].volume * 100);
        slider.addEventListener('input', function () {
          audioMixer[channel].volume = clamp01(slider.value / 100);
          // Adjusting volume implicitly unmutes (familiar UX)
          if (slider.value > 0) audioMixer[channel].muted = false;
          applyMixer();
          saveMixerToStorage();
          syncMuteButton(channel);
        });
      }
      if (muteBtn) {
        syncMuteButton(channel);
        muteBtn.addEventListener('click', function () {
          audioMixer[channel].muted = !audioMixer[channel].muted;
          applyMixer();
          saveMixerToStorage();
          syncMuteButton(channel);
        });
      }
    });

    // Master mute
    var masterBtn = document.getElementById('audio-master-mute');
    if (masterBtn) {
      syncMasterButton();
      masterBtn.addEventListener('click', function () {
        audioMixer.masterMuted = !audioMixer.masterMuted;
        applyMixer();
        saveMixerToStorage();
        syncMasterButton();
        syncToggleIcon();
      });
    }

    // Skip-to-next-track button (cycles through the bg music tracks)
    var skipBtn = document.getElementById('audio-next-track');
    if (skipBtn) {
      skipBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        nextMusicTrack();
      });
    }

    // Click toggle to expand/collapse panel
    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      panel.classList.toggle('open');
    });
    // Click anywhere outside the panel to close it
    document.addEventListener('click', function (e) {
      if (!panel.contains(e.target) && e.target !== toggle) {
        panel.classList.remove('open');
      }
    });
    syncToggleIcon();
  }

  function syncMuteButton(channel) {
    var btn = document.querySelector('button[data-mute-channel="' + channel + '"]');
    if (btn) btn.classList.toggle('is-muted', audioMixer[channel].muted);
  }
  function syncMasterButton() {
    var btn = document.getElementById('audio-master-mute');
    if (btn) btn.classList.toggle('is-muted', audioMixer.masterMuted);
  }
  function syncToggleIcon() {
    var t = document.getElementById('audio-toggle');
    if (t) t.classList.toggle('is-muted', audioMixer.masterMuted);
  }

  // ============================================================
  // DEV PARAMS — gated behind a localStorage flag so even someone
  // who reads the JS source can't unlock these via URL alone. To
  // enable dev mode in YOUR browser, open DevTools console (F12) on
  // /run/ and run:
  //
  //   localStorage.setItem('empirex_runner_dev_2026', 'unlock');
  //
  // After that, the URL params below work IN YOUR BROWSER ONLY.
  // Other visitors hitting the same URL with params still get
  // normal play (params silently ignored without the flag).
  //
  //   ?god=1     — Mike doesn't lose lives, doesn't count toward
  //                 leaderboard or attempt counter. HUD shows GOD MODE.
  //   ?dist=NNN  — start at this distance (meters) instead of 0.
  //   ?cut=NAME  — fire a specific cutscene on game start. Names:
  //                 first-meet, mike-tells-off, ice-returns,
  //                 before-water, adin-ross, shoovy-meeting.
  //   ?water=1   — jump directly to the water phase on start.
  //
  // To DISABLE dev mode again: localStorage.removeItem('empirex_runner_dev_2026')
  // ============================================================
  var DEV_UNLOCK_KEY = 'empirex_runner_dev_2026';
  var DEV_UNLOCK_VAL = 'unlock';
  var devParams = (function () {
    var p = { enabled: false, god: false, dist: 0, cut: '', water: false };
    try {
      // Gate: only honor URL params if localStorage flag is set.
      if (localStorage.getItem(DEV_UNLOCK_KEY) !== DEV_UNLOCK_VAL) {
        return p;
      }
      p.enabled = true;
      var sp = new URLSearchParams(location.search);
      p.god = sp.get('god') === '1';
      p.dist = parseFloat(sp.get('dist')) || 0;
      p.cut = sp.get('cut') || '';
      p.water = sp.get('water') === '1';
      console.log('[dev] DEV MODE UNLOCKED. Params:', p);
    } catch (e) { /* SSR or non-browser env — ignore */ }
    return p;
  })();

  // ============================================================
  // Boot.
  // ============================================================
  function init() {
    canvas = document.getElementById('game');
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    // Mobile orientation change + visualViewport changes (address bar
    // showing/hiding on iOS Safari changes the height). Both can leave
    // the canvas at the wrong size if we don't re-measure.
    window.addEventListener('orientationchange', resize);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', resize);
    }
    bindInput();
    loadAudio();
    bindAudioUI();

    // After clicking START / RUN AGAIN, blur the button so it doesn't
    // keep keyboard focus. Otherwise pressing space mid-game would
    // re-trigger the focused button (browser default), restarting the
    // game from scratch instead of doing nothing (or jumping in v0.17).
    function startAndBlur(e) {
      if (e && e.currentTarget && e.currentTarget.blur) e.currentTarget.blur();
      // v0.18.53 — KICK USERNAME PROMPT. If we don't have a session
      // username yet, intercept the START click and show the prompt
      // modal first. The modal's GO button calls startRun() after
      // saving the username; SKIP starts without leaderboard binding.
      var saved = '';
      try { saved = sessionStorage.getItem('kick_username_v1') || ''; }
      catch (err) { /* private mode / quota — proceed without prompt */ }
      if (!saved) {
        showUsernamePrompt();
        return;
      }
      startRun();
    }
    document.getElementById('btn-start').addEventListener('click', startAndBlur);
    document.getElementById('btn-restart').addEventListener('click', startAndBlur);

    // ============================================================
    // KICK USERNAME PROMPT wiring (v0.18.53)
    // ============================================================
    function showUsernamePrompt() {
      var modal = document.getElementById('overlay-username');
      var input = document.getElementById('username-input');
      if (!modal || !input) {
        // DOM missing for some reason — fall back to running unbranded
        startRun();
        return;
      }
      modal.classList.remove('hidden');
      // Defer focus by a tick so the show transition + browser focus
      // shift cooperate (otherwise the input can lose focus on Safari).
      setTimeout(function () { input.focus(); }, 50);
    }
    function hideUsernamePrompt() {
      var modal = document.getElementById('overlay-username');
      if (modal) modal.classList.add('hidden');
    }
    function commitUsername(name) {
      var clean = (name || '').trim().replace(/^@/, '').toLowerCase();
      if (!clean) return false;
      // Lite slug validation — kick usernames are alphanumerics +
      // underscore + hyphen typically. Strip everything else.
      clean = clean.replace(/[^a-z0-9_\-]/g, '');
      if (!clean) return false;
      try { sessionStorage.setItem('kick_username_v1', clean); }
      catch (err) { /* ignore — game still runs without persistence */ }
      return clean;
    }
    var unGo = document.getElementById('btn-username-go');
    if (unGo) unGo.addEventListener('click', function () {
      var input = document.getElementById('username-input');
      var name = input ? input.value : '';
      if (commitUsername(name)) {
        hideUsernamePrompt();
        startRun();
      } else {
        if (input) {
          input.style.borderColor = '#ff3b3b';
          input.focus();
          setTimeout(function () { input.style.borderColor = ''; }, 800);
        }
      }
    });
    var unSkip = document.getElementById('btn-username-skip');
    if (unSkip) unSkip.addEventListener('click', function () {
      // Skip — record an empty marker so we don't re-prompt this
      // session, but the auto-submit at game-over checks for a
      // non-empty value before firing.
      try { sessionStorage.setItem('kick_username_v1', ''); }
      catch (err) {}
      try { sessionStorage.setItem('kick_username_skipped_v1', '1'); }
      catch (err) {}
      hideUsernamePrompt();
      startRun();
    });
    var unInput = document.getElementById('username-input');
    if (unInput) unInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (unGo) unGo.click();
      }
    });

    // Mirror the bottom-of-screen version label inside the audio
    // settings panel so it's also visible there (handy for bug reports).
    var gv = document.querySelector('.game-version');
    var apv = document.getElementById('audio-panel-version');
    if (gv && apv) apv.textContent = gv.textContent;

    // Leaderboard buttons (require window.RunnerLeaderboard which is
    // loaded as an ES module — may not be ready immediately on first
    // paint, but will be by the time game-over fires).
    var subBtn = document.getElementById('btn-submit-score');
    if (subBtn) subBtn.addEventListener('click', function (e) {
      e.target.blur();
      if (!window.RunnerLeaderboard) return;
      // GOD MODE: refuse submit so dev runs don't pollute the leaderboard.
      if (state.godMode) {
        alert('GOD MODE active — score submit disabled.');
        return;
      }
      window.RunnerLeaderboard.openSubmitDialog({
        distance: state.distance,
        coins: state.coins,
        multiplier: state.multiplier,
        durationSec: state.elapsedMs / 1000,
      });
    });
    var lbBtn = document.getElementById('btn-leaderboard');
    if (lbBtn) lbBtn.addEventListener('click', function (e) {
      e.target.blur();
      if (!window.RunnerLeaderboard) return;
      window.RunnerLeaderboard.openLeaderboard();
    });
    var titleLbBtn = document.getElementById('btn-title-leaderboard');
    if (titleLbBtn) titleLbBtn.addEventListener('click', function (e) {
      e.target.blur();
      if (!window.RunnerLeaderboard) return;
      window.RunnerLeaderboard.openLeaderboard();
    });
    // QUIT-TO-TITLE button in pause menu — resets to menu phase
    var quitBtn = document.getElementById('btn-pause-quit');
    if (quitBtn) quitBtn.addEventListener('click', function (e) {
      e.target.blur();
      quitToTitle();
    });
    // QUIT-TO-TITLE button on game-over screen
    var goQuitBtn = document.getElementById('btn-gameover-quit');
    if (goQuitBtn) goQuitBtn.addEventListener('click', function (e) {
      e.target.blur();
      quitToTitle();
    });
    // ============================================================
    // JAIL overlay buttons (v0.18.52)
    // ============================================================
    var jailPay = document.getElementById('jail-pay');
    if (jailPay) jailPay.addEventListener('click', function (e) {
      e.target.blur();
      if (state.jail.phase !== 'cell') return;
      jailBailSelf();
    });
    var jailQuit = document.getElementById('jail-quit');
    if (jailQuit) jailQuit.addEventListener('click', function (e) {
      e.target.blur();
      if (state.jail.phase !== 'cell') return;
      jailQuitToTitle();
    });
    // BAIL XENA — phase C. Spends all coins (could be 0), drops Mike
    // to 1 life, and Xena follows him as an anti-sidekick.
    var jailXena = document.getElementById('jail-bail-xena');
    if (jailXena) jailXena.addEventListener('click', function (e) {
      e.target.blur();
      if (state.jail.phase !== 'cell') return;
      jailBailXena();
    });
    // ============================================================
    // JAIL bg eye-blink loop — swaps src between open/closed every
    // JAIL_BG_BLINK_MS while the cell is shown. Cheap setInterval is
    // fine; runs forever in the background but only does work while
    // overlay is visible (image src writes are cheap when same
    // value).
    // ============================================================
    var jailBgBlink = (function () {
      var bg = document.getElementById('jail-bg');
      var open = true;
      return setInterval(function () {
        if (!bg) return;
        if (state.jail.phase !== 'cell') return;
        open = !open;
        bg.src = open ? 'img/jail-bg-open.png' : 'img/jail-bg-closed.png';
      }, JAIL_BG_BLINK_MS);
    })();
    // SHARE-PNG button on game-over screen — generates a 1080x1080
    // composite (title art bg + score panel + streamer credit) and
    // triggers download. Hint shows status feedback.
    var shareBtn = document.getElementById('btn-share-png');
    if (shareBtn) shareBtn.addEventListener('click', function (e) {
      e.target.blur();
      doSharePng();
    });
    // Cut-scene choice/continue buttons — advances to next panel or
    // finishes the cut scene. Buttons are populated dynamically per
    // panel by showCutsceneButtons().
    var choiceContainer = document.getElementById('cutscene-choices');
    if (choiceContainer) {
      choiceContainer.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-choice]');
        if (!btn) return;
        e.target.blur();
        advanceCutscene(parseInt(btn.dataset.choice, 10));
      });
    }

    // Pause button (in HUD) + click on the pause overlay to resume.
    var pauseBtn = document.getElementById('btn-pause');
    if (pauseBtn) {
      pauseBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        togglePause();
      });
    }
    var pauseOv = document.getElementById('overlay-pause');
    if (pauseOv) {
      pauseOv.addEventListener('click', function () {
        if (state.paused) togglePause();
      });
    }

    loadAll().then(function () {
      state.phase = 'menu';
      syncChromeForPhase(); // hide pause button on title (only relevant during play)
      // Pick a road tile for the title-screen backdrop and start the
      // ambient horizontal drift so menu doesn't look flat.
      currentRoadKey = pickRandomRoadTile();
      // Try to start music immediately. Browsers will block this until
      // first user interaction — bindAutoplayUnlock catches that case
      // and retries on the first click/tap/keypress.
      startBackgroundMusic();
      bindAutoplayUnlock();
      // Fetch + render the global title-screen stats (total runs +
      // current high score). Best-effort; failures leave the "—"
      // placeholders in place.
      refreshTitleStats();
      // DEV PARAMS auto-start: when dev mode is unlocked AND the URL
      // implies a game-state change (cut/water/dist), skip the title
      // screen and jump straight into the run so the URL acts like a
      // direct "go-to-scene" link. Otherwise let the title screen
      // appear normally for normal play (god=1 alone doesn't auto-start
      // — the player still picks when to start their god-mode run).
      var shouldAutoStart = devParams.enabled
        && (devParams.cut || devParams.water || devParams.dist > 0);
      requestAnimationFrame(function (t) {
        lastTime = t;
        loop(t);
        if (shouldAutoStart) {
          console.log('[dev] auto-starting run from URL params');
          // Defer one tick so loop() has settled and audio unlock is wired.
          setTimeout(function () { startRun(); }, 30);
        }
      });
    });
  }

  // Fetch global stats from Firebase + populate the title-screen
  // counter row. Called on boot AND on quitToTitle so the numbers
  // refresh after a successful score submission.
  //
  // TIMING NOTE: leaderboard.js loads as `<script type="module">`
  // (deferred). index.js (regular script) often finishes loadAll()
  // BEFORE the module finishes parsing, so window.RunnerLeaderboard
  // can be undefined here on first call. We retry up to 20 times at
  // 150ms intervals (~3s total) so the stats appear as soon as the
  // module is ready — instead of silently giving up and leaving "—".
  var titleStatsRetries = 0;
  function refreshTitleStats() {
    if (!window.RunnerLeaderboard || !window.RunnerLeaderboard.fetchTitleStats) {
      if (titleStatsRetries++ < 20) {
        setTimeout(refreshTitleStats, 150);
      } else {
        console.warn('[stats] gave up waiting for RunnerLeaderboard module');
      }
      return;
    }
    titleStatsRetries = 0;
    window.RunnerLeaderboard.fetchTitleStats().then(function (stats) {
      console.log('[stats] fetched title stats:', stats);
      var attEl = document.getElementById('ts-attempts');
      var todayEl = document.getElementById('ts-attempts-today');
      var topEl = document.getElementById('ts-top-score');
      var byEl  = document.getElementById('ts-top-by');
      // Render 0 as "0" not "—" — distinguishes "fetch succeeded but
      // empty" from "fetch failed". Helps diagnose Firebase issues.
      if (attEl) attEl.textContent = (stats.attempts != null) ? stats.attempts.toLocaleString() : '—';
      if (todayEl) {
        todayEl.textContent = (stats.attemptsToday != null)
          ? '+' + stats.attemptsToday.toLocaleString() + ' today'
          : '';
      }
      if (topEl) topEl.textContent = stats.top ? stats.top.score.toLocaleString() : '—';
      if (byEl) {
        if (stats.top && stats.top.identity) {
          var url = stats.top.identityType === 'twitch'
            ? 'https://twitch.tv/' + stats.top.identity
            : 'https://kick.com/' + stats.top.identity;
          var icon = stats.top.identityType === 'twitch'
            ? '<svg class="lb-platform-icon" viewBox="0 0 24 24" aria-hidden="true">'
              + '<path fill="#9146ff" d="M3.5 3l-1 4v13h4v3h3l3-3h4l5-5V3zM6 5h14v9l-3 3h-4l-3 3v-3H6zm5 8h2V8h-2zm5 0h2V8h-2z"/></svg>'
            : '<svg class="lb-platform-icon" viewBox="0 0 24 24" aria-hidden="true">'
              + '<rect width="24" height="24" rx="4" fill="#53fc18"/>'
              + '<path fill="#000" d="M5 4h3v6l5-6h4l-6 7 6 9h-4l-5-7v7H5z"/></svg>';
          byEl.innerHTML = 'by ' + icon + '<a href="' + url + '" target="_blank" rel="noopener" style="color:#fff;text-decoration:none;">' + stats.top.identity + '</a>';
        } else {
          byEl.textContent = '';
        }
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
