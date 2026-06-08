/* Shared authentication helpers for the Empire X voting subsystem.
   Imported by:
     - /voting/                  (sign-in button, session check, vote casting)
     - /voting/auth/callback/    (Kick OAuth code exchange after redirect)
     - /voting/overlay/          (read-only — no auth needed, just config)
     - /voting/overlay/voters/   (read-only)

   Architecture: voters authenticate via Kick OAuth (PKCE) -> the
   worker exchanges the code for a Kick access token, fetches the
   user's Kick profile, then issues a short-lived session JWT signed
   with the worker's SESSION_JWT_SECRET. The browser stores that JWT
   in localStorage and sends it as `Authorization: Bearer <jwt>` on
   every authenticated worker call.

   We don't use cookies because the worker is on a different domain
   (empire-worker.sevendwarfs.workers.dev) than the voting pages
   (ourempirex.com) -- cross-site cookies would need a custom domain
   on the worker, which we skipped for the MVP. localStorage + Bearer
   header is the simpler path.
*/

const WORKER = 'https://empire-worker.sevendwarfs.workers.dev';
const STORAGE_KEY = 'ex_voting_session';

// Kick OAuth client config. Must match the bookhockeys developer
// app's settings on kick.com AND the worker's KICK_* env vars in
// wrangler.toml. The Client ID is public/safe to commit.
const KICK = {
  authorize_url: 'https://id.kick.com/oauth/authorize',
  client_id: '01KTMJH63ZRSYKZM4X5ZFMG33V',
  redirect_uri: 'https://ourempirex.com/voting/auth/callback',
  scope: 'user:read',
};


// ─── Session storage ───────────────────────────────────────────

/** Read the current session object from localStorage. Shape:
 *  { token, user: {username, user_id, profile_pic, account_age_days},
 *    is_admin, saved_at }
 *  Returns null if no session or storage is corrupt. */
export function getSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
  // PKCE scratch-state too — these are sessionStorage so they auto-
  // clear with the tab, but cleaning up on sign-out is good hygiene.
  sessionStorage.removeItem('ex_pkce_verifier');
  sessionStorage.removeItem('ex_oauth_state');
  sessionStorage.removeItem('ex_return_to');
}


// ─── PKCE (Proof Key for Code Exchange) ────────────────────────
// PKCE protects the OAuth code exchange against interception. The
// browser generates a random `verifier`, hashes it (SHA-256) to a
// `challenge`, sends the challenge to Kick during redirect, then
// sends the original verifier to the worker during code exchange.
// Kick verifies the hash matches before issuing a token.

function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function generatePKCE() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(64)));
  const digest = await crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(verifier));
  const challenge = base64url(new Uint8Array(digest));
  return { verifier, challenge };
}


// ─── Sign-in flow ──────────────────────────────────────────────

/** Kick off the Kick OAuth sign-in flow. Stores PKCE verifier +
 *  state in sessionStorage, then redirects to Kick's authorize URL.
 *  After Kick redirects back to /voting/auth/callback the callback
 *  page calls exchangeCode() to complete sign-in. */
export async function startKickSignIn() {
  const { verifier, challenge } = await generatePKCE();
  const state = base64url(crypto.getRandomValues(new Uint8Array(16)));

  sessionStorage.setItem('ex_pkce_verifier', verifier);
  sessionStorage.setItem('ex_oauth_state', state);
  // Remember where to send the user after sign-in completes.
  sessionStorage.setItem('ex_return_to', location.pathname + location.search);

  const url = new URL(KICK.authorize_url);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', KICK.client_id);
  url.searchParams.set('redirect_uri', KICK.redirect_uri);
  url.searchParams.set('scope', KICK.scope);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', state);

  location.href = url.toString();
}

/** Sign out: clear local session + reload. We don't bother revoking
 *  the Kick access token on Kick's side -- our session JWT just
 *  expires when localStorage is cleared, and the access token is
 *  only ever used once (during exchangeCode) before being discarded
 *  server-side. */
export function signOut() {
  clearSession();
  location.reload();
}


// ─── OAuth callback handler ────────────────────────────────────

/** Exchange the OAuth `code` + stored PKCE verifier for a session
 *  JWT. Called by /voting/auth/callback/. Returns
 *    { token, user, is_admin }
 *  on success. Throws on error. */
export async function exchangeCode(code, codeVerifier) {
  const res = await fetch(WORKER + '/voting/auth/exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, code_verifier: codeVerifier }),
  });
  if (!res.ok) {
    let body = null;
    try { body = await res.json(); } catch { /* ignore */ }
    const detail = body && (body.detail || body.error) || res.statusText;
    throw new Error('Exchange failed (' + res.status + '): ' + detail);
  }
  return await res.json();
}


// ─── Session verification ──────────────────────────────────────

/** Check the current session against the worker. Returns the
 *  server-side view of the session ({user, is_admin}) if valid,
 *  null if the session is missing or rejected. Clears localStorage
 *  on rejection so the UI can reflect "signed out" cleanly. */
export async function checkSession() {
  const sess = getSession();
  if (!sess || !sess.token) return null;
  try {
    const res = await fetch(WORKER + '/voting/me', {
      headers: { 'Authorization': 'Bearer ' + sess.token },
    });
    if (res.status === 401) {
      clearSession();
      return null;
    }
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}


// ─── Voting API ────────────────────────────────────────────────

/** Cast a vote for the given option_id in the currently-open poll.
 *  Returns { ok, status, body } so callers can distinguish
 *  authentication errors (401) from poll-state errors (409 with
 *  reasons like 'already_voted', 'account_too_young', etc.). */
export async function castVote(optionId) {
  const sess = getSession();
  if (!sess) throw new Error('not signed in');
  const res = await fetch(WORKER + '/voting/vote', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + sess.token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ option_id: optionId }),
  });
  let body = null;
  try { body = await res.json(); } catch { /* empty */ }
  return { ok: res.ok, status: res.status, body };
}


// ─── Admin actions ─────────────────────────────────────────────

/** Open a new poll (admin only). `payload` is a poll spec:
 *    { question, options: [{id, label, streamer_slug?}, ...],
 *      min_account_age_days?, closes_in_seconds? } */
export async function openPoll(payload) {
  const sess = getSession();
  if (!sess) throw new Error('not signed in');
  const res = await fetch(WORKER + '/voting/poll/open', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + sess.token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  let body = null;
  try { body = await res.json(); } catch { /* empty */ }
  return { ok: res.ok, status: res.status, body };
}

/** Close a poll early (admin only). `promote: true` schedules the
 *  rank-promotion pipeline (currently no-op pending the GH PAT). */
export async function closePoll(pollId, promote) {
  const sess = getSession();
  if (!sess) throw new Error('not signed in');
  const res = await fetch(WORKER + '/voting/poll/close', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + sess.token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ poll_id: pollId, promote: !!promote }),
  });
  let body = null;
  try { body = await res.json(); } catch { /* empty */ }
  return { ok: res.ok, status: res.status, body };
}
