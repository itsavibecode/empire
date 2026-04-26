# EmpireX Runner — ideas board

Drop ideas here whenever they hit, even half-formed. I'll work from this
list when building / iterating. Format is loose — bullets, paragraphs,
sketches, screenshots, whatever helps.

To add a screenshot: drop it in `run/concept/` and reference it here as
`![desc](concept/filename.png)`.

---

## Confirmed mechanics (locked from chat)

- **Player:** Mike Smalls Jr (durag, "T" chain), runs downhill, auto-forward
- **Side-kick:** Ice Poseidon (selfie stick, blue Sonic shirt). Met partway
  through the run — neck stretches upward to flag down Mike as he
  approaches. Once met, Ice runs alongside and auto-collects Cx coins.
- **Cx coin:** score multiplier; the more collected, the higher the
  multiplier. Stacks/streak bonus TBD.
- **URL:** `/run/`
- **Tone:** affectionate parody of IRL streaming culture. Cartoony,
  not actually mocking real victims. Mob is goofy not menacing.

## Open design questions

- [ ] Mob speed: starts slow, ramps up over time? Or always at fixed
      catch-up rate that punishes hesitation?
- [ ] Phone-thief mechanic: tap-to-swat or hold-to-shield?
- [ ] Lives system: one-hit-and-mob-catches-you, or 3-strike system?
- [ ] Levels with checkpoints, or pure endless?
- [ ] Coin-multiplier reset on hit, or persists?
- [ ] How does Ice Poseidon "join up" visually — does he run beside Mike,
      behind him, or like a Sonic chao?

## Ideas to explore

### Leaderboard (deferred — needs backend decision)

Persistent scoreboard so users can post their best run + see everyone else's. Requires a backend (localStorage only would be per-device).

**Backend options, ranked roughly by effort:**

1. **Firebase Realtime Database** (free tier ~10 GB read/month): drop-in JS SDK, no server code. Write a score → read top 100. Auth optional (Google sign-in to prevent spam) or anonymous (display-name field with profanity filter). ~1-2 hours of work to wire end-to-end. Best ROI.
2. **Supabase** (free tier 500 MB DB): Postgres-backed, similar JS SDK to Firebase. More flexible long-term (real DB, not document store) but slightly more setup. ~2-3 hours.
3. **Cloudflare D1 + Worker** (very generous free tier): write a tiny Worker that exposes `POST /score` and `GET /scores`. SQLite-backed. Most control but most code. ~3-4 hours.
4. **Google Form → Sheets** backend (low-tech): submit scores via a hidden Google Form, read top scores from the published Sheets CSV. Zero infra, but flaky and rate-limited. Useful as a 1-week prototype.
5. **GitHub Issues API as pseudo-backend**: each score = a comment on a "leaderboard" issue. Works but spammy and not really designed for this.

**UX shape:**
- Game-over screen: "Submit your score" with a name input (3-letter arcade-style? full handle?)
- "View leaderboard" button on title + game-over
- Top 10 + your-rank around your-position
- All-time / today / this-week tabs
- Anti-cheat is **the hard problem** — anyone can DevTools their score before submit. Mitigations: rate-limiting per IP, sanity-check max-distance-per-second, sign requests with a server-side secret (not viable for static-site setup), or just accept that the leaderboard is honor-system + entertainment, not competitive.

**My pick for v1:** Firebase Realtime DB. Lowest infra effort, 99% of users don't cheat, and "honor system" is fine for a parody mini-game. We can always migrate to Supabase if it grows.

When you want this built, tell me which backend to use (or "you pick") and I'll wire it.

---

### Other

---

## Asset wishlist (things I'd love but don't have yet)

(empty — drop sprite-sheet ideas here)

---

## Audio wishlist

- Background music (high-energy, vaguely Latin or similar)
- Footsteps loop
- Cx coin pickup ding
- Multiplier-up "bing" (when streak bonus increases)
- Ice Poseidon "EYO" voice line on first encounter
- Mob roar (looped, gets louder as mob closes in)
- Phone-grab fail sound
- Game-over sting

---

## Out of scope for v0.1 (notes for later)

- Character select (other streamers as playable)
- Persistent high-score leaderboard (would need a backend)
- Multiplayer / co-op
- Cosmetic unlocks via Cx coin economy
