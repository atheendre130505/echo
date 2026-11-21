# Echo

A phone-first music player (audio only) that uses YouTube for its catalog. It runs as a static site on GitHub Pages. There is no server and no account; everything is stored on your phone.

- **Song catalog**: tens of thousands of songs with their YouTube IDs (see below). Searches hit it instantly, and those songs play straight away.
- **Search with no keys**: catalog results first, then Apple's music catalog, then YouTube results a few seconds later. Tap any song and Echo finds the right upload and plays it.
- **New music without searching**: "Trending in your country", daily charts for 16 genres (Bollywood, Tamil, Telugu, Indian Pop, Pop, Hip-Hop, K-Pop…), and **Release Radar**, which shows new songs from artists you listen to.
- **Home**: Daily Mixes, Discover Weekly, On Repeat, Jump back in, Recently played and radios for your top artists.
- **Player**: audio only, with shuffle, repeat, a queue, and autoplay radio when the queue runs out. When there's a choice, Echo picks the plain audio upload over the music video.
- **Lyrics**: full lyrics from Genius, karaoke-style synced lyrics from lrclib, and a **Meaning** tab with Genius's "About this song" text and line-by-line explanations. Highlighted lyric lines can be tapped for their explanation.
- **Downloads**: MP3 audio through a Python script (yt-dlp) running on your phone. **Every song you listen to past 30 seconds is downloaded automatically**, and Library → Downloads has a button to download everything you've listened to. Files go to Downloads/Echo; downloaded songs play offline and in the background.
- **Library**: Liked Songs, playlists, Downloads (you can also import any audio/video file) and History. It also has backup and restore.

## Only songs

Echo only plays songs, never "some video". Every track is checked before it plays:

- It counts as a song if it's in the song catalog, or if Apple Music has a song with that title by an artist named on the upload.
- Anything about a song rather than the song itself is rejected: making-of and behind-the-scenes clips, teasers, trailers, interviews, reactions, covers, fan edits, Shorts, status clips, jukeboxes and similar.
- While a track plays, its length is checked against the real song. A 40-second clip or a 20-minute video is skipped.
- Search shows songs only. There are no raw YouTube video results or link pasting.

## Song catalog (data/)

[`data/songs.tsv`](data/songs.tsv) maps songs to YouTube video IDs, focused on **Indian (Bollywood, Punjabi, Tamil, Telugu, …) and English** music. It's built by [`dataset/build.py`](dataset/build.py) from:

- **Wikidata**: every song or single that has a performer and an official YouTube video ID (about 40,000).
- **YouTube playlists** for 119 searches across Bollywood (by era, mood and singer), Punjabi, South Indian, regional, and English (by genre, decade and artist). Only items that look like songs are kept: 1.5–9 minutes long, at least 100,000 views, and none of the clip types listed above. Plain audio uploads are marked so they're preferred.
- **Apple Music charts** for India (14 genres) and English-speaking countries. Any chart song that isn't in the catalog yet is looked up on YouTube.

A GitHub Action ([`.github/workflows/dataset.yml`](.github/workflows/dataset.yml)) runs every Monday and continues where the last run stopped, so the catalog keeps growing with new songs. You can also start it any time from the repo's **Actions** tab, under **update song catalog** → **Run workflow**.

## Song radio: more like what you're hearing

Tap any song (from search, a chart, trending or recently played) and Echo plays it, then queues songs like it:

- The song you're on counts most. Its YouTube Mix (the songs people play right after it) is the main signal. Songs near the top of that Mix are the closest matches, so they count more.
- The Mixes of the 3 closest songs, plus the last couple of songs you finished, are folded in. Songs and artists that keep showing up across these related Mixes form the core of that sound, and rank highest.
- Your overall taste only nudges the order a little, so the radio stays close to the current song.
- Skip a song in the first 30 seconds and Echo removes that artist's queued songs. Skip twice in a row and it rebuilds the rest of the queue from the last song you listened to all the way through.

Example from testing: Tum Hi Ho leads to Galliyan, Janam Janam, Agar Tum Saath Ho and Kaun Tujhe. Numb leads to Linkin Park, Eminem, Imagine Dragons and Green Day.

## Your searches count too

What you search for shows what you want to hear, even before you press play:

- **Pressing search** gives the top matching song a search signal (+0.6, a bit more than starting a song, less than a full listen). If the query names an artist ("arijit singh"), that artist gets a signal too.
- **Tapping a search result** counts as a stronger pick (+0.8), on top of the normal play signals.
- When a search brings in an artist that wasn't in your taste yet, your Daily Mixes and Release Radar rebuild to include them.
- Home shows **"Because you searched '…'"** with songs like your latest search (for 7 days).

Search signals fade over time like everything else (14-day half-life).

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
| YouTube Data API key *(optional)* | Makes YouTube video results appear faster. Search already works without it. | console.cloud.google.com, then enable **YouTube Data API v3**, then **Credentials → Create API key**. Restrict it to `https://<you>.github.io/*`. |
| Genius access token | Genius lyrics and song meanings | genius.com/api-clients, then **New API Client** (any URL), then **Generate Access Token** |
Search, charts, playback, Mixes, radio, recommendations and synced lyrics need **no keys**. Keyless YouTube search goes through the free Jina reader (r.jina.ai), which allows about 20 searches a minute.

**You enter keys once.** They're saved on your phone in two places (localStorage and IndexedDB), and the app asks the browser to keep its storage permanently. If one copy is lost, the other restores it silently. For the worst case (all site data wiped), **Settings → Copy restore link** gives you a private link: open it once and your keys are back. Keys are never in the repo.

## Downloads

A website can't save YouTube audio by itself (YouTube scrambles its audio links and blocks downloads from servers), so a small app on your phone does the work. Echo supports two:

**Easy: the Seal app (nothing to set up).** Install [Seal](https://f-droid.org/packages/com.junkfood.seal/) from F-Droid or its [GitHub page](https://github.com/JunkFood02/Seal/releases/latest). It's free and open source; YouTube downloaders aren't allowed on the Play Store. Then tap Download in Echo, pick **Seal** in the share menu, choose **Audio**, and tap Download. Seal converts the song to MP3 and saves it to Download/Seal. After the first time, Download goes straight to the share menu. To play those files offline inside Echo, add them with Library → Downloads → Import.

**Automatic: the Termux helper.** Use this if you want every song you listen to downloaded by itself and kept inside Echo. The setup is below.

### Termux helper (Python + yt-dlp, on your phone)

Downloads run through [`echo_dl.py`](echo_dl.py), a small Python script that uses yt-dlp. It runs on your own phone, so YouTube sees your normal connection. (Running it on GitHub's servers doesn't work: YouTube blocks them.)

One-time setup on Android:

1. Install **Termux** from F-Droid (the Play Store version is outdated).
2. Open Termux and run:
   ```bash
   curl -fsSL https://atheendre130505.github.io/echo/setup.sh | bash
   ```
   This installs Python, ffmpeg and yt-dlp and starts the helper. It also makes the helper start whenever Termux opens.
3. Tap Download in Echo. Songs are saved as MP3 to **Downloads/Echo**, and they also play offline inside the app.

After restarting your phone, open Termux once. Run the same command again any time to update yt-dlp.

On a computer, `pip install yt-dlp` then `python echo_dl.py --serve` does the same thing while you use Echo in that computer's browser. Without ffmpeg, audio is saved as M4A.

## Brave tips

- Brave Shields blocks YouTube ads inside the player, so playback has no ads.
- **Background play / screen off:** YouTube's embedded player pauses when Brave goes to the background. Two fixes:
  - Turn on Brave's background video setting (Android: *Settings → Media → Background video playback*; on older versions it's the flag `brave://flags/#brave-background-video-playback`).
  - Or download a song: downloaded songs play through the phone's own media player, so they keep going with the screen locked, and lock-screen controls work.
- If a song won't start the first time, tap the player once. Some phones need a single tap inside the YouTube player before it is allowed to play.

## Limits

- Some videos have embedding turned off by the uploader. Echo skips those automatically.
- Downloading from YouTube is against YouTube's Terms of Service. Use it for your own personal listening.
- Echo is not affiliated with YouTube, Spotify or Genius.
