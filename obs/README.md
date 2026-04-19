# Empire X · BRB Overlay

A full-screen OBS browser source that shows the Confirmed Streamers of [ourempirex.com](https://ourempirex.com) who are **currently live on Kick**, with their streams embedded, viewer counts, and a party-vibe background video loop behind it all.

Lives at **`https://ourempirex.com/obs/`**.

---

## What it does

Every 90 seconds, the overlay checks all 21 confirmed streamers against Kick's API (via the same public CORS proxies ourempirex.com uses) and rebuilds the grid with only those who are live, ordered by viewer count (highest first). Offline streamers never appear. Background videos shuffle behind everything at ~35% opacity for atmosphere.

```
┌──────────────────────────────────────────────┐
│            — THE PARTY NEVER STOPS —         │
│                  EMPIRE X                    │
│         Ourempirex · Confirmed Streamers     │
│                                              │
│  [● ON THE NETWORK] │ 400 IN THE CHAT │ ...  │
│                                              │
│  ┌─────┐  ┌─────┐  ┌─────┐                   │
│  │1.2K │  │ 890 │  │ 453 │    ← only         │
│  │live │  │live │  │live │      live ones    │
│  └─────┘  └─────┘  └─────┘                   │
│  ┌─────┐                                     │
│  │ 312 │                                     │
│  │live │                                     │
│  └─────┘                                     │
│                                              │
│   ◁◁◁ shuffled videos behind, 35% opacity  ▷▷▷│
└──────────────────────────────────────────────┘
```

If more than 6 are live, the grid rotates through pages of 6 every 45 seconds.

---

## Setup

### 1. File structure

```
<repo-root>/
└── obs/
    ├── index.html
    ├── README.md
    └── videos/
        ├── videos.json
        ├── empirexvideo.mp4
        └── (any other background clips)
```

### 2. Add background videos

Put any `.mp4` files you want to shuffle into `obs/videos/`, then list them in `obs/videos/videos.json`:

```json
{
  "videos": [
    "empirexvideo.mp4",
    "party-montage.mp4",
    "house-walkthrough.mp4"
  ]
}
```

Recommended: H.264 MP4s, 1920x1080, 20–60s each, under ~20 MB per file. Audio in the files doesn't matter — they're all muted in the browser.

### 3. Add as OBS browser source

1. New scene called `BRB`
2. Sources **+** → **Browser**
3. URL: `https://ourempirex.com/obs/`
4. Width: `1920`, Height: `1080`
5. ✅ **Shutdown source when not visible** (saves CPU)
6. ✅ **Refresh browser when scene becomes active**
7. ✅ **Control audio via OBS** (so OBS picks up the featured streamer's audio)
8. Hotkey the BRB scene for easy switching

That's it. No API keys, no credentials, no GitHub Actions. Works immediately.

---

## How the live check works

The overlay fetches `https://kick.com/api/v2/channels/{slug}` for each streamer through public CORS proxies (`allorigins.win` and `corsproxy.io` as fallback). Kick's API returns a `livestream` object that's either `null` (offline) or populated with `viewer_count`, `session_title`, etc. — same method used by ourempirex.com's Confirmed Streamers section.

Poll interval is 90 seconds (fast enough to catch streamers going live, slow enough to be polite to the proxies). Request concurrency is capped at 5 simultaneous fetches so we don't spam the proxy services.

**If both proxies are down** at the same time, streamers appear as offline until the proxies recover. This is rare but worth knowing.

---

## Editing

All config is in the `CONFIG` block at the top of `obs/index.html`:

| Setting | Default | What it does |
|---|---|---|
| `ROSTER` | 21 names | List of Confirmed Streamers to check |
| `POLL_MS` | `90_000` | How often to re-check live status (ms) |
| `ROTATE_MS` | `45_000` | How long each page of 6 shows before rotating (ms) |
| `VIDEO_OPACITY` | `0.35` | Background video brightness (0–1) |
| `CHAT_COUNT_TEXT` | `'400 IN THE CHAT'` | Static text in the subtitle bar |

Color variables at the top of `<style>`:

```css
--gold:  #d4a94a;   /* primary accent */
--kick:  #53fc18;   /* Kick brand green */
--bg-0:  #070608;   /* deepest background */
```

### Updating the chat count dynamically

Right now `400 IN THE CHAT` is a placeholder. If you want it to reflect the actual total (e.g., sum of viewer counts across all live streamers, or your own stream's chat), look for `#chatCount` in the HTML — the `updateSummary()` function in JS has the data it needs, you'd just pipe `totalViewers` into it.

---

## Troubleshooting

**All streamers show as offline but I know someone's live** — the CORS proxies may be temporarily down. Check the browser console for fetch errors. Wait 2 minutes or refresh the source.

**A live streamer's embed is blank/black** — they've disabled embedding on their Kick channel. Nothing you can do except remove them from the `ROSTER`.

**Background videos don't autoplay** — refresh the browser source; autoplay sometimes blocks on first load. Videos are already `muted playsinline`, which is what autoplay requires.

**Viewer counts seem stale** — they update every 90 seconds. Kick itself only updates its viewer count every ~30s, so your overlay will be within ~2 min of truth.

**The "400 IN THE CHAT" text is wrong** — it's placeholder static text. See "Updating the chat count dynamically" above.
