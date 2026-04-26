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
  var LIVES_INITIAL = 3;
  var INVULN_TIME = 1.2;           // seconds of i-frames after a hit (flashes Mike)

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
  // Obstacle TYPES — each entry is one kind of street-person spawn,
  // either an animated walk cycle or a single static frame. Walking
  // NPCs cycle through their `frames` at `frameMs` per frame and
  // wobble horizontally by `bobPx` for a subtle "in motion" look.
  // Static NPCs (signs/standing characters) just sit there.
  var OBSTACLE_TYPES = [
    // Walking pedestrian A (hoodie dude, 4-frame walk cycle)
    { id: 'walk-hoodie',  frames: ['npc-pedestrian-01','npc-pedestrian-02','npc-pedestrian-03','npc-pedestrian-04'], frameMs: 160, bobPx: 22 },
    // Walking woman in red (4-frame walk)
    { id: 'walk-woman',   frames: ['npc-pedestrian-05','npc-pedestrian-06','npc-pedestrian-07','npc-pedestrian-08'], frameMs: 160, bobPx: 22 },
    // Reaching dude (4-frame "phone-thief" reach pose, faster cadence)
    { id: 'walk-reaching', frames: ['npc-pedestrian-09','npc-pedestrian-10','npc-pedestrian-11','npc-pedestrian-12'], frameMs: 130, bobPx: 14 },
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
  };

  var audioInstances = {};
  var audioMixer = {
    music:    { volume: 0.5, muted: false },
    sfx:      { volume: 0.7, muted: false },
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
    coins: 0,
    multiplier: 1,
    lives: LIVES_INITIAL,
    invulnUntil: 0,      // performance.now() timestamp; until then no hits register
    player: { lane: STARTING_LANE, targetLane: STARTING_LANE, lerpX: 1 },
    obstacles: [],       // [{lane, y, type, spawnedAt, bobPhase, w, h, hit}]
    coinsArr: [],        // [{lane, y, w, h, picked}]
    spawnTimer: 0,
  };

  // ============================================================
  // Asset loading.
  // ============================================================
  function loadOne(key, path) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () { sprites[key] = img; resolve(); };
      img.onerror = function () {
        console.warn('Failed to load sprite:', path);
        resolve(); // don't block startup; missing sprite just won't render
      };
      img.src = path;
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
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels
  }

  // CSS-pixel dimensions (post-DPR transform) — use these everywhere
  // for game logic so coordinates match what the player sees.
  function viewW() { return window.innerWidth; }
  function viewH() { return window.innerHeight; }

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
    var newLane = state.player.targetLane + direction;
    if (newLane < 0 || newLane >= LANES) return;
    state.player.targetLane = newLane;
    state.player.lerpX = 0; // restart lerp from current position
  }

  function bindInput() {
    window.addEventListener('keydown', function (e) {
      if (e.repeat) return;
      var key = e.key;
      if (state.phase === 'menu' || state.phase === 'gameover') {
        if (key === ' ' || key === 'Enter') startRun();
        return;
      }
      // Playing — handle pause + lane shift
      if (key === 'p' || key === 'P' || key === 'Escape') {
        togglePause(); e.preventDefault(); return;
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

  // ============================================================
  // Update — physics, spawning, collisions.
  // ============================================================
  function update(dt) {
    // Speed ramps up over time, capped.
    state.speed = Math.min(SPEED_MAX, state.speed + SPEED_GROWTH * dt);
    var pxThisFrame = state.speed * dt;
    state.distance += pxThisFrame * 0.1; // 0.1 = px-to-meters fudge
    state.distancePx += pxThisFrame;     // raw px counter for procedural BG

    // Lane lerp — smoothly interpolate Mike's X over a short duration.
    state.player.lerpX = Math.min(1, state.player.lerpX + dt * 8);

    // Move obstacles + coins UP toward Mike (he's at the top, world
    // scrolls up past him — he's running DOWN-hill so the world
    // appears to move up across the camera).
    var i;
    for (i = 0; i < state.obstacles.length; i++) {
      state.obstacles[i].y -= state.speed * dt;
    }
    for (i = 0; i < state.coinsArr.length; i++) {
      state.coinsArr[i].y -= state.speed * dt;
    }

    // Cull off-screen (above the top edge).
    state.obstacles = state.obstacles.filter(function (o) {
      return o.y > -o.h - 50;
    });
    state.coinsArr = state.coinsArr.filter(function (c) {
      return c.y > -c.h - 50 && !c.picked;
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
      if (Math.random() < COIN_SPAWN_PROBABILITY) {
        spawnCoin(obstLane);
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
        o.hit = true;
        if (now > state.invulnUntil) {
          state.lives--;
          state.invulnUntil = now + INVULN_TIME * 1000;
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
      if (co.lane !== state.player.targetLane) continue;
      var coCenterY = co.y + co.h / 2;
      var pCenterY2 = py - playerSize.h * 0.4;
      if (Math.abs(coCenterY - pCenterY2) < (co.h * 0.6 + pHitH * 0.4)) {
        co.picked = true;
        state.coins++;
        // Multiplier: 1x for first 5, 2x for next 10, 3x thereafter
        if (state.coins >= 16) state.multiplier = 3;
        else if (state.coins >= 6) state.multiplier = 2;
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
    var coinsEl = document.querySelector('.coins');
    var livesEl = document.querySelector('.lives');
    if (scoreEl) scoreEl.textContent = Math.floor(state.distance) + ' m';
    if (coinsEl) coinsEl.textContent = 'Cx ' + state.coins + ' ×' + state.multiplier;
    if (livesEl) {
      var hearts = '';
      for (var i = 0; i < LIVES_INITIAL; i++) {
        hearts += i < state.lives ? '❤' : '♡';
      }
      livesEl.textContent = hearts;
    }
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

    // Road covers the WHOLE viewport — Mike is now near the top of the
    // playfield rather than the bottom, and the bg-road tile already
    // contains everything (asphalt, sidewalks, painted markings, manhole
    // covers, shops on the edges). The previous separate skyline strip
    // would have overlapped Mike's sprite, so we drop it for v0.14.
    drawRoad(0, h);

    // Obstacles + coins. Sort by Y so the closer-to-Mike ones draw on
    // top of farther ones (since Mike is at top, "closer to him" = lower Y).
    // We sort DESCENDING by Y here — items with higher Y are farther
    // away (further down the road) and should draw FIRST (under closer
    // items). Closer items (lower Y) draw last, on top.
    var allDrawables = state.obstacles.concat(state.coinsArr);
    allDrawables.sort(function (a, b) { return b.y - a.y; });
    for (var i = 0; i < allDrawables.length; i++) {
      var d = allDrawables[i];
      var spriteKey, drift = 0;
      if (d.type) {
        // Animated obstacle with frame cycle + wobble
        spriteKey = getObstacleSprite(d, now);
        drift = getObstacleDrift(d, now);
      } else {
        // Coin (spinning)
        spriteKey = pickCoinSprite(now);
      }
      drawAt(spriteKey, laneX(d.lane) + drift, d.y, d.w, d.h);
    }

    // Player (last, on top)
    drawPlayer(now);
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

  function drawPlayer(now) {
    // Lerp X smoothly between current and target lane.
    var fromLane = state.player.lane;
    var toLane = state.player.targetLane;
    var t = state.player.lerpX;
    var x = laneX(fromLane) + (laneX(toLane) - laneX(fromLane)) * t;
    if (t >= 1) state.player.lane = toLane;

    var size = scaledSize('mike-run-01', PLAYER_TARGET_HEIGHT_FRAC);
    var y = playerY() - size.h;

    // Run-cycle frame
    var frame = Math.floor(now / RUN_FRAME_MS) % 8 + 1;
    var key = 'mike-run-' + (frame < 10 ? '0' + frame : frame);

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
    state.coins = 0;
    state.multiplier = 1;
    state.lives = LIVES_INITIAL;
    state.player.lane = STARTING_LANE;
    state.player.targetLane = STARTING_LANE;
    state.player.lerpX = 1;
    state.obstacles = [];
    state.coinsArr = [];
    state.spawnTimer = 0;
    state.invulnUntil = 0;
    currentRoadKey = pickRandomRoadTile();
    document.getElementById('overlay-start').classList.add('hidden');
    document.getElementById('overlay-gameover').classList.add('hidden');
    updateHUD();
    // Audio: random bg music + ambient mob loop in the distance
    startBackgroundMusic();
    startLoop('mob-angry');
  }

  function endRun() {
    state.phase = 'gameover';
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
    bindInput();
    loadAudio();
    bindAudioUI();

    document.getElementById('btn-start').addEventListener('click', startRun);
    document.getElementById('btn-restart').addEventListener('click', startRun);

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
