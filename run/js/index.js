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
  var PICKUP_TYPES = [
    // HAM — short freeze + coin shower + chipmunk music. 7-frame spin.
    { kind: 'ham',  frames: _seq('ham-spin-', 7),    frameMs: 90,  weight: 3 },
    // 400 — instant +1 life. 20-frame spin (very smooth).
    { kind: 'h400', frames: _seq('h400-spin-', 20),  frameMs: 60,  weight: 1 },
    // WEED — debuff (slow + red tint). 16-frame spin.
    { kind: 'weed', frames: _seq('weed-spin-', 16),  frameMs: 70,  weight: 2 },
    // HORSE — 8-sec speed boost. Static icon (will replace with proper
    // spinning sheet later). Mike's run-cycle gets temporarily swapped
    // for the horse-riding sprite during the boost window.
    { kind: 'horse', frames: ['horse-icon'],         frameMs: 0,   weight: 1 },
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
  var OBSTACLE_TYPES = [
    // Walking pedestrian A (hoodie dude, 4-frame walk cycle)
    { id: 'walk-hoodie',  frames: ['npc-pedestrian-01','npc-pedestrian-02','npc-pedestrian-03','npc-pedestrian-04'], frameMs: 160, bobPx: 22 },
    // Walking woman in red (4-frame walk)
    { id: 'walk-woman',   frames: ['npc-pedestrian-05','npc-pedestrian-06','npc-pedestrian-07','npc-pedestrian-08'], frameMs: 160, bobPx: 22 },
    // PHONE THIEF — reaching dude lunges for Mike's selfie stick.
    // On contact: doesn't take a life, instead steals 10 Cx coins,
    // reverses controls for 3s, sprays coin particles outward, and
    // shows a red "-10 COINS" overlay. The 4-frame reach animation
    // sells the snatch motion. Faster cadence than the other walkers.
    { id: 'walk-reaching', frames: ['npc-pedestrian-09','npc-pedestrian-10','npc-pedestrian-11','npc-pedestrian-12'], frameMs: 130, bobPx: 14, phoneThief: true },
    // Static protesters (each holds a parody picket sign)
    { id: 'static-protester', frames: ['npc-protester-01'], frameMs: 0, bobPx: 0 },
    { id: 'static-protester', frames: ['npc-protester-02'], frameMs: 0, bobPx: 0 },
    { id: 'static-protester', frames: ['npc-protester-03'], frameMs: 0, bobPx: 0 },
    { id: 'static-protester', frames: ['npc-protester-04'], frameMs: 0, bobPx: 0 },
    { id: 'static-protester', frames: ['npc-protester-05'], frameMs: 0, bobPx: 0 },
    { id: 'static-protester', frames: ['npc-protester-06'], frameMs: 0, bobPx: 0 },
    // Static chibi NPCs (street pedestrians from the grid sheet)
    { id: 'static-chibi', frames: ['npc-grid-01'], frameMs: 0, bobPx: 0 },
    { id: 'static-chibi', frames: ['npc-grid-02'], frameMs: 0, bobPx: 0 },
    { id: 'static-chibi', frames: ['npc-grid-05'], frameMs: 0, bobPx: 0 },
    { id: 'static-chibi', frames: ['npc-grid-09'], frameMs: 0, bobPx: 0 },
    { id: 'static-chibi', frames: ['npc-grid-13'], frameMs: 0, bobPx: 0 },
    { id: 'static-chibi', frames: ['npc-grid-17'], frameMs: 0, bobPx: 0 },
    // COP CAR — jump-only. Lane shift won't help; you must jump over it.
    // Multiple paint variants in the cop-car sheet (16 frames showing
    // different angle/light combos); we pick one at random per spawn.
    { id: 'cop-car', frames: ['cop-car-01'], frameMs: 0, bobPx: 0, jumpOnly: true },
    { id: 'cop-car', frames: ['cop-car-02'], frameMs: 0, bobPx: 0, jumpOnly: true },
    { id: 'cop-car', frames: ['cop-car-05'], frameMs: 0, bobPx: 0, jumpOnly: true },
    { id: 'cop-car', frames: ['cop-car-09'], frameMs: 0, bobPx: 0, jumpOnly: true },
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
  // Horse pickup item icon — use the same horse-overhead frame as the item sprite
  SPRITE_PATHS['horse-icon'] = 'img/sprites/mike-horse-05.png';
  // Ice Poseidon side-kick frames — preload all 29 from the source sheet
  // so the run cycle + neck-stretch animations have everything they need.
  for (var ic = 1; ic <= 29; ic++) {
    var ick = 'ice-' + (ic < 10 ? '0' + ic : ic);
    SPRITE_PATHS[ick] = 'img/sprites/' + ick + '.png';
  }
  // Cop car sprites (referenced by OBSTACLE_TYPES below)
  ['01', '02', '05', '09'].forEach(function (n) {
    SPRITE_PATHS['cop-car-' + n] = 'img/sprites/cop-car-' + n + '.png';
  });
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
  };

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
    var keys = Object.keys(AUDIO_DEFS).filter(function (k) {
      return AUDIO_DEFS[k].channel === 'music';
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
      onComplete: function () { state.iceSidekickJoined = true; },
    },
  };

  var cutscene = {
    active: false,
    defId: null,
    panelIdx: 0,
    startedAt: 0,
    typedChars: 0,
    showingChoices: false,
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
      if (state.distance < def.triggerDistanceM) continue;
      if (state.cutscenesTriggered[defId]) continue;
      if (def.requires && !def.requires()) continue;
      state.cutscenesTriggered[defId] = true;
      startCutscene(defId);
      return;
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
    transitionToPanel(0);
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
  }

  function tickCutscene(now) {
    if (!cutscene.active) return;
    var panel = currentPanel();
    if (!panel) return;
    if (cutscene.showingChoices) return; // text done, waiting for input
    // Mouth animation cycle while typing
    var mouthIdx = Math.floor((now - cutscene.startedAt) / CUTSCENE_MOUTH_MS) % 3;
    var mouthVariant = ['closed', 'mid', 'open'][mouthIdx];
    var bg = document.getElementById('cutscene-bg');
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
  }

  // Called when player clicks a choice/continue button.
  function advanceCutscene(choiceIdx) {
    var def = currentDef();
    if (!def) return;
    ga('cutscene_choice', { def: cutscene.defId, panel: cutscene.panelIdx, selected_option: choiceIdx });
    var nextIdx = cutscene.panelIdx + 1;
    if (nextIdx >= def.panels.length) {
      // All panels done — fire the onComplete effect + dismiss
      if (def.onComplete) def.onComplete();
      cutscene.active = false;
      cutscene.defId = null;
      var ov = document.getElementById('overlay-cutscene');
      if (ov) ov.classList.add('hidden');
      // Resume the mob-yelling ambient loop now that dialogue is over
      if (state.phase === 'playing') startLoop('mob-angry');
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
  function setPaused(v) {
    state.paused = !!v;
    var ov = document.getElementById('overlay-pause');
    if (ov) ov.classList.toggle('hidden', !state.paused);
    var btn = document.getElementById('btn-pause');
    if (btn) btn.classList.toggle('is-paused', state.paused);
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
    cutscenesTriggered: {},   // { defId: true } — per-run flags so each fires once
    ice: {
      neckStretchUntil: 0,    // ms timestamp when neck-stretch animation ends (0 = idle running pose)
      lastSide: 1,            // -1 = Mike's left, +1 = Mike's right (Ice mirrors when Mike lane-shifts)
    },
    iceCoinsCollected: 0,     // Ice's running total this run (for HUD if we ever surface it)
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
        if (key === ' ' || key === 'Enter') startRun();
        return;
      }
      // Cut scene blocks all gameplay input (player picks via mouse/tap on the choice buttons)
      if (cutscene.active) return;
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
      // Mouse: only respond to LEFT button (e.button === 0). Right-click
      // (e.button === 2) is reserved for pause via the contextmenu listener
      // — without this guard a right-click would also fire mousedown and
      // trigger a lane-shift, which is exactly the bug reported in v0.17.3.
      if (e.type === 'mousedown' && e.button !== 0) return;
      // If the tap came from a button or overlay, let the click bubble.
      if (e.target.closest('button') || e.target.closest('.overlay:not(.hidden)')) {
        return;
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
    var size = scaledSize(type.frames[0], PICKUP_TARGET_HEIGHT_FRAC);
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
    // Speed ramps up over time, capped.
    state.speed = Math.min(SPEED_MAX, state.speed + SPEED_GROWTH * dt);
    var pxThisFrame = state.speed * dt;
    state.distance += pxThisFrame * 0.1; // 0.1 = px-to-meters fudge
    state.distancePx += pxThisFrame;     // raw px counter for procedural BG
    state.elapsedMs += dt * 1000;        // wall-clock playing time (excludes paused)

    // Lane lerp — smoothly interpolate Mike's X over a short duration.
    state.player.lerpX = Math.min(1, state.player.lerpX + dt * 8);

    // FREEZE check: during the Mario-1UP ham-pickup freeze OR during
    // the Mike-meets-Ice cut scene, don't move the world or run spawn
    // timers. Effects still tick so the freeze itself can expire.
    var nowMs = performance.now();
    tickEffects(nowMs);
    tickCutscene(nowMs);
    if (cutscene.active) return;
    if (nowMs < state.effects.hamFreezeUntil) return;
    // Distance-triggered cut scene (first encounter only)
    maybeTriggerCutscene();

    // Effective speed — modified by active bonus/debuff effects
    var effSpeed = state.speed;
    if (nowMs < state.effects.weedDebuffUntil) effSpeed *= 0.55;
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
      state.obstacles[i].y -= effSpeed * dt;
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
    if (state.spawnTimer >= spawnInterval) {
      state.spawnTimer = 0;
      var obstLane = spawnObstacle();
      // Coin shower during ham bonus — guaranteed coin + extras
      var coinChance = COIN_SPAWN_PROBABILITY;
      if (nowMs < state.effects.hamBonusUntil) coinChance = 1.0;
      if (Math.random() < coinChance) {
        spawnCoin(obstLane);
      }
      if (nowMs < state.effects.hamBonusUntil && Math.random() < 0.6) {
        spawnCoin(obstLane);
      }
      // Special pickup spawn (rare)
      if (Math.random() < PICKUP_SPAWN_PROBABILITY) {
        spawnPickup(obstLane);
      }
    }

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
          state.lives--;
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
    for (i = 0; i < state.coinsArr.length; i++) {
      var co = state.coinsArr[i];
      if (co.picked) continue;
      // Ice gets first crack at the coin if it's within his reach radius
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
    // Pickup collisions (ham / 400 / weed)
    for (i = 0; i < state.pickups.length; i++) {
      var pk = state.pickups[i];
      if (pk.picked) continue;
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
      var spriteKey, drift = 0;
      if (item.kind === 'obs') {
        spriteKey = getObstacleSprite(d, now);
        drift = getObstacleDrift(d, now);
      } else if (item.kind === 'coin') {
        spriteKey = pickCoinSprite(now);
      } else {
        spriteKey = getPickupSprite(d, now);
      }
      drawAt(spriteKey, laneX(d.lane) + drift, d.y, d.w, d.h);
    }

    // Player (last, on top)
    drawPlayer(now);
    // Ice side-kick (after Mike so they share the same Y plane)
    drawIce(now);

    // Phone-thief coin particles — drawn AFTER the player so the burst
    // visually originates from in front of Mike's chest. Each coin
    // spins (frame cycles using its own offset) and fades out as its
    // life elapses.
    drawCoinParticles(now);

    // Effect overlays
    drawEffects(now);
  }

  // Render the in-flight coin particles spawned by triggerPhoneThief.
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
  }

  // ============================================================
  // Title screen — cover art + animated seagull flock.
  // ============================================================
  var seagullLastTick = 0;
  function drawTitleScreen(now) {
    var w = viewW();
    var h = viewH();
    var ts = sprites['titlescreen'];
    if (ts) {
      // Cover-fit (fill viewport, may crop). Aspect-ratio aware.
      var s = Math.max(w / ts.width, h / ts.height);
      var iw = ts.width * s;
      var ih = ts.height * s;
      ctx.drawImage(ts, (w - iw) / 2, (h - ih) / 2, iw, ih);
    }

    // Tick seagull simulation in render (no separate update loop while in menu).
    var dt = Math.min(0.1, (now - seagullLastTick) / 1000);
    seagullLastTick = now;
    updateSeagulls(dt, now);

    // Draw seagulls (right→left flight)
    for (var i = 0; i < state.seagulls.length; i++) {
      drawSeagull(state.seagulls[i], now);
    }
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
    // During horse boost, Ice rides on Mike's horse (built into the
    // mike-ice-horse-* sprite), so no separate Ice render needed.
    if (performance.now() < state.effects.horseBoostUntil) return;
    var key = pickIceFrame(now);
    var img = sprites[key];
    var baseImg = sprites['ice-15']; // reference frame for the base Ice height
    if (!img || !baseImg) return;
    // Compute scale so ice-15 renders at ICE_HEIGHT_FRAC * viewH.
    // Then ANY current frame gets that same px-per-source-px ratio
    // applied — meaning neck-stretch frames (which are taller in the
    // source) render proportionally taller, so the neck visibly
    // EXTENDS UPWARD when Ice grabs a coin. Without this, scaledSize
    // would force every frame into ice-15's box and the stretch would
    // be invisible.
    var pxPerSrc = (viewH() * ICE_HEIGHT_FRAC) / baseImg.height;
    var w = img.width * pxPerSrc;
    var h = img.height * pxPerSrc;
    var x = iceX();
    // Y-bob: small sine-wave vertical oscillation while NOT mid-stretch
    // — fakes the up/down bounce of a real run cycle and disguises the
    // fact that we only have 2 distinct stride frames to alternate.
    var bob = 0;
    if (now >= state.ice.neckStretchUntil) {
      bob = Math.sin(now / 110) * (viewH() * 0.012);
    }
    var y = playerY() - h + bob; // bottom-anchored at Mike's foot line
    // CROP the bottom 9% of the source image to hide the ground-shadow
    // ellipse that's baked into every Ice frame. Render at the same
    // visible footprint but pull the source rect short on the bottom.
    var srcCropFrac = 0.91;
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

  function drawPlayer(now) {
    // Lerp X smoothly between current and target lane.
    var fromLane = state.player.lane;
    var toLane = state.player.targetLane;
    var t = state.player.lerpX;
    var x = laneX(fromLane) + (laneX(toLane) - laneX(fromLane)) * t;
    if (t >= 1) state.player.lane = toLane;

    // Determine which sprite-set Mike uses right now:
    // 1. HORSE boost active → horse-riding (solo if Ice hasn't joined,
    //    Mike+Ice duo if Ice has joined post-cutscene)
    // 2. Otherwise → standard run-cycle (with jump-pose freeze if airborne)
    var nowMs = performance.now();
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
      var frame = Math.floor(now / RUN_FRAME_MS) % 8 + 1;
      key = 'mike-run-' + (frame < 10 ? '0' + frame : frame);
      sizingKey = 'mike-run-01';
    }
    // Horse sprite is taller than the running Mike — bump scale slightly
    var heightFrac = onHorse ? PLAYER_TARGET_HEIGHT_FRAC * 1.4 : PLAYER_TARGET_HEIGHT_FRAC;
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
    // Audio: random bg music + ambient mob loop in the distance
    startBackgroundMusic();
    startLoop('mob-angry');
    ga('game_started');
  }

  function quitToTitle() {
    // Hard reset back to title screen — clears game state, hides
    // pause + gameover overlays, shows the start overlay.
    setPaused(false);
    state.phase = 'menu';
    stopBackgroundMusic();
    stopLoop('mob-angry');
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

  function endRun() {
    state.phase = 'gameover';
    syncChromeForPhase();
    // Audio: death sting first, then queue the gameover music
    stopBackgroundMusic();
    stopLoop('mob-angry');
    playSfx('death');
    setTimeout(function () { playSfx('death-gameover'); }, 600);
    var ov = document.getElementById('overlay-gameover');
    ov.classList.remove('hidden');
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
  }

  // ============================================================
  // Game loop.
  // ============================================================
  function loop(now) {
    var dt = Math.min(0.05, (now - lastTime) / 1000); // clamp dt to avoid huge jumps after tab switch
    lastTime = now;
    if (state.phase === 'playing' && !state.paused) update(dt);
    if (state.phase !== 'loading') render(now);
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
      startRun();
    }
    document.getElementById('btn-start').addEventListener('click', startAndBlur);
    document.getElementById('btn-restart').addEventListener('click', startAndBlur);

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
      requestAnimationFrame(function (t) { lastTime = t; loop(t); });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
