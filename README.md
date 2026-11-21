# Echo

A phone-first music and video player that uses YouTube for its catalog. It runs as a static site on GitHub Pages. There is no server and no account; everything is stored on your phone.

- **Home**: Daily Mixes, Discover Weekly, On Repeat, Jump back in, Recently played and radios for your top artists.
- **Player**: switch between *Song* and *Video*, with shuffle, repeat, a queue, and autoplay radio when the queue runs out.
- **Lyrics**: full lyrics from Genius, karaoke-style synced lyrics from lrclib, and a **Meaning** tab with Genius's "About this song" text and line-by-line explanations. Highlighted lyric lines can be tapped for their explanation.
- **Downloads**: audio (MP3) or video (MP4). Downloads are saved to your phone and kept inside the app for offline playback.
- **Library**: Liked Songs, playlists, Downloads (you can also import any audio/video file) and History. It also has backup and restore.

## How the recommendations work

The design follows Spotify's publicly described approach, built from parts that are available for free:

1. **Taste profile from implicit signals.** A full listen counts as +1, skipping before 30 seconds counts as −1.2, and a like counts as +3. Older signals fade with a 14-day half-life, per song and per artist.
2. **Candidates from collaborative filtering.** For your strongest songs, Echo loads YouTube's *Mix* radio, which is built from what millions of people listen to together. Songs that show up in several of your mixes rank higher.
3. **Ranking.** Songs are scored on how often they show up together with your songs, plus how much you like the artist. Songs you've skipped lose points, and so do songs you heard in the last few hours. A little randomness lets new songs through.
4. **Diversity.** The same artist never appears twice within 3 slots, and duplicate uploads are removed. Live versions, covers and "slowed" edits are pushed down.

Discover Weekly only includes artists you have never played, and it stays the same for the whole week. Each Daily Mix is built around a different taste cluster.

## Put it on GitHub Pages

1. Create a new **public** repo on github.com, for example `echo`.
2. Upload every file in this folder: `index.html`, `app.js`, `style.css`, `sw.js`, `manifest.webmanifest`, `icon.svg` and `.nojekyll`. You can drag them onto the repo page under "Add file → Upload files".
3. In the repo, go to **Settings → Pages → Build and deployment**, set **Source: Deploy from a branch**, choose **Branch: main / (root)**, and save.
4. After about a minute the site is live at `https://<your-username>.github.io/echo/`.
5. Open that URL in **Brave** on your phone, then use **⋮ → Add to Home screen** so it opens like an app.

When you change a file later, increase the `?v=2` in `index.html` so phones load the new version.

## Free keys (paste them in ⚙ Settings inside the app)

| What | Why | Where |
|---|---|---|
| YouTube Data API key | Searching all of YouTube (~100 searches/day free; results are cached) | console.cloud.google.com, then enable **YouTube Data API v3**, then **Credentials → Create API key**. Restrict it to `https://<you>.github.io/*`. |
| Genius access token | Genius lyrics and song meanings | genius.com/api-clients, then **New API Client** (any URL), then **Generate Access Token** |
| cobalt server *(optional)* | One-tap downloads inside the app | Self-host cobalt (github.com/imputnet/cobalt, Docker). Without it, Download copies the link and opens cobalt.tools. |

Playback, Mixes, radio, recommendations and synced lyrics need **no keys**. Keys are stored only on your phone and are never in the repo.

## Brave tips

- Brave Shields blocks YouTube ads inside the player, so playback has no ads.
- **Background play / screen off:** YouTube's embedded player pauses when Brave goes to the background. Two fixes:
  - Turn on Brave's background video setting (Android: *Settings → Media → Background video playback*; on older versions it's the flag `brave://flags/#brave-background-video-playback`).
  - Or download a song: downloaded songs play through the phone's own media player, so they keep going with the screen locked, and lock-screen controls work.
- If a song won't start the first time, tap the video once. Some phones need a single tap inside the YouTube player before it is allowed to play.

## Limits

- Some videos have embedding turned off by the uploader. Echo skips those automatically.
- Downloading from YouTube is against YouTube's Terms of Service. Use it for your own personal listening.
- Echo is not affiliated with YouTube, Spotify or Genius.
