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
  // Obstacle pool — pull a varied set from protesters and the chibi
  // grid so spawns don't all look identical.
  var OBSTACLE_KEYS = [
    'npc-protester-01', 'npc-protester-02', 'npc-protester-03',
    'npc-protester-04', 'npc-protester-05', 'npc-protester-06',
    'npc-grid-01', 'npc-grid-02', 'npc-grid-05',
    'npc-grid-09', 'npc-grid-13', 'npc-grid-17',
  ];
  OBSTACLE_KEYS.forEach(function (k) {
    SPRITE_PATHS[k] = 'img/sprites/' + k + '.png';
  });
  // Background skyline — wide panorama, drawn at top stripe of canvas.
  SPRITE_PATHS['bg-pano'] = 'img/bg/bg-chile-pano.png';

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
    // Stop whatever's playing first
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

  // ============================================================
  // State.
  // ============================================================
  var sprites = {}; // key -> Image (loaded async)
  var canvas, ctx;
  var lastTime = 0;
  var bgScrollX = 0; // for parallax scroll of skyline

  var state = {
    phase: 'loading',  // 'loading' | 'menu' | 'playing' | 'gameover'
    speed: SPEED_INITIAL,
    distance: 0,         // meters traveled (1 px ≈ 0.1 m for nicer numbers)
    distancePx: 0,       // raw pixel distance (used for procedural BG features)
    coins: 0,
    multiplier: 1,
    lives: LIVES_INITIAL,
    invulnUntil: 0,      // performance.now() timestamp; until then no hits register
    player: { lane: STARTING_LANE, targetLane: STARTING_LANE, lerpX: 1 },
    obstacles: [],       // [{lane, y, sprite, w, h, hit}]
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
    // Bottom of canvas, with a margin for the URL caption.
    return viewH() - viewH() * 0.10;
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
    var key = OBSTACLE_KEYS[Math.floor(Math.random() * OBSTACLE_KEYS.length)];
    var size = scaledSize(key, OBSTACLE_TARGET_HEIGHT_FRAC);
    var lane = Math.floor(Math.random() * LANES);
    state.obstacles.push({
      lane: lane,
      y: -size.h,         // start above visible area
      spriteKey: key,
      w: size.w,
      h: size.h,
      hit: false,
    });
    return lane; // so coin spawner can avoid the same lane
  }

  function spawnCoin(avoidLane) {
    var size = scaledSize('cx-coin-01', COIN_TARGET_HEIGHT_FRAC);
    state.coinsArr.push({
      lane: pickRandomLane(avoidLane),
      y: -size.h - 80,    // a bit higher than the obstacle so they don't overlap
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

    // Move obstacles + coins down.
    var i;
    for (i = 0; i < state.obstacles.length; i++) {
      state.obstacles[i].y += state.speed * dt;
    }
    for (i = 0; i < state.coinsArr.length; i++) {
      state.coinsArr[i].y += state.speed * dt;
    }

    // Cull off-screen.
    state.obstacles = state.obstacles.filter(function (o) {
      return o.y < viewH() + 100;
    });
    state.coinsArr = state.coinsArr.filter(function (c) {
      return c.y < viewH() + 100 && !c.picked;
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

    // Sky / road background — flat fills (cheap, predictable)
    ctx.fillStyle = '#1a1230'; // night purple
    ctx.fillRect(0, 0, w, h);

    // Skyline strip — top 30% of canvas, panorama tiled horizontally
    var skyH = h * 0.30;
    var bg = sprites['bg-pano'];
    if (bg) {
      var bgScale = skyH / bg.height;
      var bgW = bg.width * bgScale;
      var offset = ((bgScrollX % bgW) + bgW) % bgW;
      ctx.drawImage(bg, -offset, 0, bgW, skyH);
      ctx.drawImage(bg, -offset + bgW, 0, bgW, skyH);
    }

    // Road area (below skyline)
    drawRoad(skyH, h);

    // Obstacles (sort by Y so closer ones draw over far ones)
    var allDrawables = state.obstacles.concat(state.coinsArr);
    allDrawables.sort(function (a, b) { return a.y - b.y; });
    for (var i = 0; i < allDrawables.length; i++) {
      var d = allDrawables[i];
      drawAt(d.spriteKey || pickCoinSprite(now), laneX(d.lane), d.y, d.w, d.h);
    }

    // Player (last, on top)
    drawPlayer(now);
  }

  function drawRoad(yTop, yBot) {
    var w = viewW();
    var roadH = yBot - yTop;
    var sidewalkW = w * 0.07;            // sidewalks on far edges
    var roadL = sidewalkW;
    var roadR = w - sidewalkW;
    var roadW = roadR - roadL;

    // --- Sidewalk strips (scroll downward) ---
    // Concrete grey base
    ctx.fillStyle = '#5a5a64';
    ctx.fillRect(0, yTop, sidewalkW, roadH);
    ctx.fillRect(roadR, yTop, sidewalkW, roadH);
    // Curb edge — slightly darker line at the road boundary
    ctx.fillStyle = '#3a3a40';
    ctx.fillRect(sidewalkW - 3, yTop, 3, roadH);
    ctx.fillRect(roadR, yTop, 3, roadH);
    // Periodic darker tiles along sidewalks (manholes/grates) — scroll down
    // with distance so they appear to fly past the player
    var detailScroll = state.distancePx % SIDEWALK_DETAIL_INTERVAL_PX;
    for (var sy = yTop - SIDEWALK_DETAIL_INTERVAL_PX + detailScroll;
         sy < yBot;
         sy += SIDEWALK_DETAIL_INTERVAL_PX) {
      ctx.fillStyle = '#3e3e46';
      ctx.fillRect(sidewalkW * 0.20, sy, sidewalkW * 0.60, 22);
      ctx.fillRect(roadR + sidewalkW * 0.20, sy, sidewalkW * 0.60, 22);
    }

    // --- Asphalt road ---
    ctx.fillStyle = '#2a2a2e';
    ctx.fillRect(roadL, yTop, roadW, roadH);

    // --- Crosswalks (white stripes spanning the road) ---
    // Periodic — every CROSSWALK_INTERVAL_PX pixels of distance traveled
    var cwScroll = state.distancePx % CROSSWALK_INTERVAL_PX;
    var cwY = yTop - CROSSWALK_INTERVAL_PX + cwScroll;
    while (cwY < yBot) {
      if (cwY + 60 > yTop && cwY < yBot) {
        // Draw 7 stripes across the road
        var stripeCount = 7;
        var stripeW = roadW / (stripeCount * 2 - 1);
        ctx.fillStyle = '#f4f4f4';
        for (var s = 0; s < stripeCount; s++) {
          var sx = roadL + s * stripeW * 2;
          ctx.fillRect(sx, cwY, stripeW, 22);
        }
      }
      cwY += CROSSWALK_INTERVAL_PX;
    }

    // --- Lane divider dashes (scrolling downward) ---
    ctx.strokeStyle = '#FFD566';
    ctx.lineWidth = 3;
    ctx.setLineDash([26, 24]);
    // lineDashOffset goes negative to make dashes appear to move DOWN the road
    ctx.lineDashOffset = -state.distancePx % 50;
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
  function startRun() {
    state.phase = 'playing';
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
    if (state.phase === 'playing') update(dt);
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

    loadAll().then(function () {
      state.phase = 'menu';
      requestAnimationFrame(function (t) { lastTime = t; loop(t); });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
