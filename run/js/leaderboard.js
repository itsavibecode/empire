/*
 * EmpireX Runner — Firebase Realtime Database leaderboard.
 *
 * Self-contained module that handles:
 *   - Firebase init (Realtime DB only — no Auth, no Analytics SDK)
 *   - 3-mode identity input (display name / arcade tag / streamer handle)
 *   - Profanity filter for display names (3-layer: bad-words +
 *     leo-profanity + custom hate term list, with l33t-speak normalize)
 *   - Score submission with anti-spam (per-session localStorage flag,
 *     server-side sanity range)
 *   - Top-100 fetch + render (sorted by combined score descending)
 *   - Streamer-handle entries become clickable links to kick.com or
 *     twitch.com
 *
 * Uses Firebase v12 modular SDK (ESM imports from gstatic CDN).
 * Loaded as `<script type="module">` so it doesn't need a bundler.
 *
 * Usage from main game:
 *   window.RunnerLeaderboard.submit({ identity, identityType, distance,
 *                                      coins, multiplier, durationSec })
 *   window.RunnerLeaderboard.fetchTop(100).then(rows => ...)
 *   window.RunnerLeaderboard.openSubmitDialog(scoreData)
 *   window.RunnerLeaderboard.openLeaderboard()
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import {
  getDatabase, ref, push, query, orderByChild,
  limitToLast, get, runTransaction
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js";

// ============================================================
// Firebase config — public-by-design web API key.
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyB7CQytKx0RPVm3h8Hqx0Wld0W0qLbElNo",
  authDomain: "onbabygame-dbb77.firebaseapp.com",
  databaseURL: "https://onbabygame-dbb77-default-rtdb.firebaseio.com",
  projectId: "onbabygame-dbb77",
  storageBucket: "onbabygame-dbb77.firebasestorage.app",
  messagingSenderId: "487863234770",
  appId: "1:487863234770:web:693fce29071e1774277d0b",
  measurementId: "G-LH0P1H8NRY"
};

const fbApp = initializeApp(firebaseConfig);
const db = getDatabase(fbApp);

// (Profanity filter / display-name modes removed in v0.17.3 — leaderboard
// is now streamer-handle-only so the handle character regex
// `[a-zA-Z0-9_]` does all the validation we need. If we ever re-add
// free-text display names, the filter from the v0.17.2 commit history
// can be restored.)

// ============================================================
// Anti-spam: client-side sanity caps + per-session "submitted" flag.
// ============================================================
const SUBMIT_KEY = 'runner-leaderboard-submitted';
const MAX_DISTANCE = 100000;     // anything above is obvious cheat
const MAX_COINS = 10000;
const MIN_DURATION_SEC = 5;      // sub-5-sec runs are bot/spam

function alreadySubmittedThisRun(scoreData) {
  // We allow re-submitting a different run. The key encodes the score
  // so a player can submit each new run but not double-submit one.
  const sig = SUBMIT_KEY + ':' + Math.floor(scoreData.distance) + ':' + scoreData.coins;
  if (localStorage.getItem(sig) === '1') return true;
  return false;
}
function markSubmitted(scoreData) {
  const sig = SUBMIT_KEY + ':' + Math.floor(scoreData.distance) + ':' + scoreData.coins;
  try { localStorage.setItem(sig, '1'); } catch (e) {}
}

function sanityCheck(scoreData) {
  if (!scoreData) return 'no score';
  if (scoreData.distance > MAX_DISTANCE) return 'distance over limit';
  if (scoreData.coins > MAX_COINS) return 'coins over limit';
  if (scoreData.durationSec < MIN_DURATION_SEC) return 'too quick';
  return null;
}

// ============================================================
// Submit / fetch.
// ============================================================
async function submit(scoreData) {
  const fail = sanityCheck(scoreData);
  if (fail) throw new Error('sanity check failed: ' + fail);
  if (alreadySubmittedThisRun(scoreData)) {
    throw new Error('already submitted');
  }

  // Streamer-handle only. Allow alphanumeric + underscore, max 25 chars
  // (matches Kick + Twitch username rules).
  const it = scoreData.identityType;
  if (!['kick', 'twitch'].includes(it)) {
    throw new Error('Pick Kick or Twitch');
  }
  let identity = String(scoreData.identity || '').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 25);
  if (identity.length === 0) throw new Error('Enter a handle');

  // Combined score: distance (m) + coins × multiplier × 10
  const score = Math.floor(scoreData.distance) + scoreData.coins * scoreData.multiplier * 10;

  const entry = {
    identity,
    identityType: it,
    distance: Math.floor(scoreData.distance),
    coins: scoreData.coins,
    multiplier: scoreData.multiplier,
    durationSec: Math.floor(scoreData.durationSec),
    score,
    createdAt: Date.now(),
  };

  // Push to /scores in Firebase RTDB. Auto-generates a unique ID.
  await push(ref(db, 'scores'), entry);
  markSubmitted(scoreData);
  return entry;
}

async function fetchTop(limit = 100) {
  const q = query(ref(db, 'scores'), orderByChild('score'), limitToLast(limit));
  const snap = await get(q);
  if (!snap.exists()) return [];
  // Firebase returns the rows in ASCENDING order when using orderByChild.
  // We want descending (highest first), so reverse after pulling.
  const rows = [];
  snap.forEach(child => {
    rows.push({ id: child.key, ...child.val() });
  });
  rows.sort((a, b) => b.score - a.score);
  return rows;
}

// Atomic increment of the global attempts counter. Called from startRun
// in index.js. Uses runTransaction so two players starting simultaneously
// don't lose a count to a race condition. Best-effort — fail silently if
// Firebase is unreachable so a flaky network doesn't block the game.
async function incrementAttemptCount() {
  try {
    await runTransaction(ref(db, 'stats/attempts'), (current) => {
      return (current || 0) + 1;
    });
  } catch (e) {
    // swallow — title-screen stats degrade gracefully
    console.warn('[leaderboard] attempt counter increment failed:', e);
  }
}

// Fetch combined title-screen stats: total attempts + top entry. One
// call so the title overlay can populate both numbers in a single
// promise. Falls back to nulls on any Firebase error.
async function fetchTitleStats() {
  try {
    const [attemptsSnap, topRows] = await Promise.all([
      get(ref(db, 'stats/attempts')),
      fetchTop(1),
    ]);
    return {
      attempts: attemptsSnap.exists() ? attemptsSnap.val() : 0,
      top: topRows.length ? topRows[0] : null,
    };
  } catch (e) {
    console.warn('[leaderboard] title-stats fetch failed:', e);
    return { attempts: 0, top: null };
  }
}

// ============================================================
// UI — submit dialog + leaderboard view.
// ============================================================
function buildSubmitDialog(scoreData) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay overlay-submit';
  overlay.innerHTML = `
    <h2>SUBMIT YOUR SCORE</h2>
    <p class="score-line">${Math.floor(scoreData.distance)} m · Cx ${scoreData.coins} ×${scoreData.multiplier} · ${formatTime(scoreData.durationSec * 1000)}</p>
    <p class="score-total">Total: ${Math.floor(scoreData.distance) + scoreData.coins * scoreData.multiplier * 10}</p>
    <div class="submit-input-wrap" data-mode="streamer">
      <select class="submit-platform" aria-label="Streaming platform">
        <option value="kick">Kick</option>
        <option value="twitch">Twitch</option>
      </select>
      <input type="text" class="submit-input handle" placeholder="username" maxlength="25" autocomplete="off">
    </div>
    <p class="submit-help">Your handle becomes a clickable link to your channel on the leaderboard.</p>
    <p class="submit-error" hidden></p>
    <div class="submit-buttons">
      <button type="button" class="submit-cancel">Cancel</button>
      <button type="button" class="submit-go">SUBMIT</button>
    </div>
  `;
  return overlay;
}

function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m + ':' + (s < 10 ? '0' + s : s);
}

function openSubmitDialog(scoreData) {
  const dlg = buildSubmitDialog(scoreData);
  document.body.appendChild(dlg);

  // Auto-focus the handle input so the user can just type
  setTimeout(() => dlg.querySelector('.submit-input.handle')?.focus(), 50);

  dlg.querySelector('.submit-cancel').addEventListener('click', () => dlg.remove());

  dlg.querySelector('.submit-go').addEventListener('click', async () => {
    const errEl = dlg.querySelector('.submit-error');
    errEl.hidden = true;
    try {
      const identityType = dlg.querySelector('.submit-platform').value; // 'kick' or 'twitch'
      const identity = dlg.querySelector('.submit-input.handle').value;
      const submitted = await submit({ ...scoreData, identityType, identity });
      if (typeof window.gtag === 'function') {
        window.gtag('event', 'leaderboard_submitted', { identity_type: submitted.identityType });
      }
      dlg.remove();
      openLeaderboard();
    } catch (e) {
      errEl.hidden = false;
      errEl.textContent = e.message || String(e);
    }
  });
}

async function openLeaderboard() {
  const overlay = document.createElement('div');
  overlay.className = 'overlay overlay-leaderboard';
  overlay.innerHTML = `
    <h2>LEADERBOARD</h2>
    <div class="leaderboard-loading">Loading...</div>
    <div class="leaderboard-rows" hidden></div>
    <button type="button" class="leaderboard-close">Close</button>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('.leaderboard-close').addEventListener('click', () => overlay.remove());
  try {
    // Top 10 only, rendered in a 2-column grid (5 per column).
    // Tighter than the old top-100 single column — easier to scan.
    const rows = await fetchTop(10);
    const wrap = overlay.querySelector('.leaderboard-rows');
    wrap.hidden = false;
    overlay.querySelector('.leaderboard-loading').hidden = true;
    if (!rows.length) {
      wrap.innerHTML = '<p class="empty">No scores yet. Be the first.</p>';
      return;
    }
    // Inline SVG platform icons — replaces the verbose "kick.com/" /
    // "twitch.tv/" prefixes. URL still points to the right place when
    // clicked. Kept inline so there's no extra asset to ship + the
    // colors stay crisp at any size.
    const KICK_ICON = '<svg class="lb-platform-icon" viewBox="0 0 24 24" aria-hidden="true">'
      + '<rect width="24" height="24" rx="4" fill="#53fc18"/>'
      + '<path fill="#000" d="M5 4h3v6l5-6h4l-6 7 6 9h-4l-5-7v7H5z"/>'
      + '</svg>';
    const TWITCH_ICON = '<svg class="lb-platform-icon" viewBox="0 0 24 24" aria-hidden="true">'
      + '<path fill="#9146ff" d="M3.5 3l-1 4v13h4v3h3l3-3h4l5-5V3zM6 5h14v9l-3 3h-4l-3 3v-3H6zm5 8h2V8h-2zm5 0h2V8h-2z"/>'
      + '</svg>';
    wrap.innerHTML = rows.map((r, i) => {
      let ident;
      if (r.identityType === 'kick') {
        ident = `<a href="https://kick.com/${r.identity}" target="_blank" rel="noopener" title="kick.com/${r.identity}">${KICK_ICON}<span class="lb-handle">${r.identity}</span></a>`;
      } else if (r.identityType === 'twitch') {
        ident = `<a href="https://twitch.tv/${r.identity}" target="_blank" rel="noopener" title="twitch.tv/${r.identity}">${TWITCH_ICON}<span class="lb-handle">${r.identity}</span></a>`;
      } else {
        // Legacy entries from v0.17.2 days (display name / arcade tag) — render plain
        ident = `<span class="display-name">${r.identity}</span>`;
      }
      return `<div class="lb-row${i < 3 ? ' top3' : ''}">
        <span class="lb-rank">#${i + 1}</span>
        <span class="lb-ident">${ident}</span>
        <span class="lb-score">${r.score}</span>
        <span class="lb-detail">${r.distance}m · Cx${r.coins}×${r.multiplier}</span>
      </div>`;
    }).join('');
  } catch (e) {
    overlay.querySelector('.leaderboard-loading').textContent = 'Couldn\'t load leaderboard: ' + (e.message || e);
  }
}

// Expose to the rest of the game (which is non-module classic JS)
window.RunnerLeaderboard = {
  submit,
  fetchTop,
  openSubmitDialog,
  openLeaderboard,
  incrementAttemptCount,
  fetchTitleStats,
};
