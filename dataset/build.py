#!/usr/bin/env python3
"""Builds Echo's song catalog: data/songs.tsv (songs -> YouTube video IDs).

Focus: Indian (Bollywood, Punjabi, Tamil, Telugu, ...) and English music.

Sources
  1. Wikidata: every song/single/recording with a performer and an official YouTube video ID.
  2. YouTube playlists: playlists found for Indian and English searches (genres, eras,
     top artists) are read 100 songs at a time. Only items that look like songs are
     kept: 90 s to 9 min long, no making-of / teaser / reaction / shorts / etc.
  3. Apple Music charts (India and English-speaking countries): any chart song not yet
     in the catalog is looked up on YouTube, preferring the plain audio upload.

Run weekly by .github/workflows/dataset.yml. Every run keeps what is already there,
so the catalog only grows; data/harvest.json remembers which playlists and searches
are done so each run continues where the last one stopped.

Columns (tab separated): id, title, artist, year, source, kind, dur
  source: wd = Wikidata, pl = playlist, ch = charts
  kind:   a = audio upload (Topic channel / official audio), v = music video
  dur:    length in seconds when known
"""
import argparse
import json
import os
import re
import time
import unicodedata
import urllib.parse
import urllib.request

UA = 'EchoDatasetBuilder/1.0 (personal music app; github.com/atheendre130505/echo)'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
MAIN = os.path.join(DATA, 'songs.tsv')
STATE = os.path.join(DATA, 'harvest.json')
COLS = 7

# Same normalisation as norm() in app.js, so keys match on both sides.
KEEP = re.compile(r'[^a-z0-9\u0900-\u097f\u0600-\u06ff\u3040-\u30ff\u4e00-\u9fff]+')
def norm(s):
    return KEEP.sub('', unicodedata.normalize('NFKD', str(s or '')).lower())

# Anything that is about a song rather than the song itself. Same list as JUNK_RE in app.js.
JUNK = re.compile(r'\b(making|behind the scenes|bts|shooting|on set|rehearsal|teaser|trailer|promo|interview|press|launch|event|reaction|reacts?|review|explained|podcast|documentary|karaoke|8d|slowed|reverb|nightcore|sped\s*up|jukebox|nonstop|non-stop|mashup|medley|full album|dialogue|scene|comedy|status|ringtone|1 hour|10 hours|full movie|episode|vlog|unboxing|tutorial|lesson|how to|choreography|dance cover|cover|fan made|shorts|news|live stream)\b|#shorts', re.I)
LABEL = re.compile(r'^(t-?series|yrf|yash raj films|saregama|sony music|zee music|tips|speed records|eros|venus|shemaroo|times music|desi music factory|white hill|aditya music|lahari|think music|sun ?tv|universal music|warner music|red chillies|rajshri|ultra|bollytube|9xm|vevo|.*records)', re.I)


def get(url, data=None, headers=None, timeout=120):
    req = urllib.request.Request(url, data=data, headers={'User-Agent': UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def load():
    rows = {}
    if os.path.exists(MAIN):
        with open(MAIN, encoding='utf-8') as f:
            for line in f:
                p = line.rstrip('\n').split('\t')
                if len(p) >= 3 and p[0] != 'id':
                    rows[p[0]] = (p + [''] * COLS)[:COLS]
    return rows


def save(rows):
    os.makedirs(DATA, exist_ok=True)
    clean = lambda s: str(s).replace('\t', ' ').replace('\n', ' ').strip()
    with open(MAIN, 'w', encoding='utf-8', newline='\n') as f:
        f.write('id\ttitle\tartist\tyear\tsource\tkind\tdur\n')
        for vid, r in sorted(rows.items(), key=lambda kv: (norm(kv[1][2]), norm(kv[1][1]))):
            f.write('\t'.join(clean(x) for x in [vid, *r[1:COLS]]) + '\n')


def song_key(artist, title):
    return norm(re.split(r',|&| x | feat\.? | ft\.? ', artist or '')[0]) + '|' + norm(re.sub(r'\s*[\(\[].*?[\)\]]', '', title or ''))


# ---------- 1. Wikidata ----------
SPARQL = '''SELECT ?yt ?sLabel ?pLabel (YEAR(?d) AS ?y) WHERE {
  ?s wdt:P1651 ?yt ; wdt:P175 ?p .
  FILTER NOT EXISTS { ?s wdt:P31 wd:Q482994 }
  %s
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul,hi,pa,ta,te,bn,mr,es,fr,de,pt,it". }
}'''
SLICES = ['OPTIONAL { ?s wdt:P577 ?d } FILTER(!BOUND(?d))'] + [
    '?s wdt:P577 ?d . FILTER(YEAR(?d) >= %d && YEAR(?d) < %d)' % r for r in
    [(1000, 1980), (1980, 1995), (1995, 2003), (2003, 2008), (2008, 2011), (2011, 2013), (2013, 2015),
     (2015, 2017), (2017, 2019), (2019, 2021), (2021, 2023), (2023, 2100)]]


def wikidata(rows):
    for sl in SLICES:
        raw = None
        for attempt in range(3):
            try:
                body = urllib.parse.urlencode({'query': SPARQL % sl}).encode()
                raw = get('https://query.wikidata.org/sparql', body, {'Accept': 'text/tab-separated-values', 'Content-Type': 'application/x-www-form-urlencoded'}, timeout=90)
                break
            except Exception as e:
                print('  wikidata retry', attempt + 1, str(e)[:80], flush=True)
                time.sleep(10)
        if raw is None:
            continue
        n = 0
        for line in raw.decode('utf-8', 'replace').split('\n')[1:]:
            p = line.split('\t')
            if len(p) < 3:
                continue
            vid = p[0].strip('"')
            title = re.sub(r'^"|"(@[\w-]+)?$', '', p[1])
            artist = re.sub(r'^"|"(@[\w-]+)?$', '', p[2])
            year = re.sub(r'\D', '', p[3]) if len(p) > 3 else ''
            if not re.fullmatch(r'[\w-]{11}', vid) or re.fullmatch(r'Q\d+', title) or re.fullmatch(r'Q\d+', artist):
                continue
            if vid in rows:
                if rows[vid][4] == 'wd' and artist not in rows[vid][2]:
                    rows[vid][2] += ', ' + artist
                continue
            rows[vid] = [vid, title, artist, year, 'wd', 'v', '']
            n += 1
        print(f'  wikidata {sl[:45]!r}: {n} new', flush=True)
        time.sleep(2)


# ---------- shared: the free reader that renders YouTube pages ----------
_last = [0.0]
def reader(url, timeout_s=20):
    wait = 3.2 - (time.time() - _last[0])  # stay under ~20 requests/minute
    if wait > 0:
        time.sleep(wait)
    _last[0] = time.time()
    for attempt in range(3):
        try:
            return get('https://r.jina.ai/' + url, headers={'X-Timeout': str(timeout_s)}, timeout=timeout_s + 40).decode('utf-8', 'replace')
        except Exception as e:
            print('   reader retry:', str(e)[:70], flush=True)
            time.sleep(30 if '429' in str(e) else 5)
    return ''


def dur_of(s):
    try:
        return sum(int(x) * 60 ** i for i, x in enumerate(reversed(s.split(':'))))
    except Exception:
        return 0


def parse_items(md):
    """Video entries (id, title, channel, seconds) from a rendered results or playlist page."""
    out, seen = [], set()
    for m in re.finditer(r'^### \[(.+?)\]\(https://www\.youtube\.com/watch\?v=([\w-]{11})[^)]*\)', md, re.M):
        vid, title = m.group(2), re.sub(r'\\([\[\]()_*#])', r'\1', m.group(1))
        if vid in seen or re.match(r'^Mix\s*[-–]', title):
            continue
        seen.add(vid)
        before = md[max(0, m.start() - 900):m.start()]
        seg = before[before.rfind('[![Image'):]
        d = re.search(r'\)\s+(\d{1,2}(?::\d{2}){1,2})[\s\]]', seg)
        after = md[m.end():m.end() + 600]
        ch = re.search(r'\[([^\]]+)\]\(https://www\.youtube\.com/(?:channel/|@)', after)
        v = re.search(r'\n\s*([\d.]+)\s*([KMB]?)\s*(?:views?\s*)?(?:•\s*)?\d+\s*\w+ ago', after)
        views = float(v.group(1)) * {'': 1, 'K': 1e3, 'M': 1e6, 'B': 1e9}[v.group(2)] if v else -1
        out.append((vid, title, ch.group(1).strip() if ch else '', dur_of(d.group(1)) if d else 0, views))
    return out


TIDY = re.compile(r'\s*[\(\[\{][^\)\]\}]*(official|video|audio|lyric|lyrical|4k|\bhd\b|\bhq\b|full song|song|remaster|visuali[sz]er|mv|m/v)[^\)\]\}]*[\)\]\}]', re.I)
def song_from_video(title, channel):
    """Best guess at (song title, artist) from a YouTube title. Topic channels are exact."""
    if channel.endswith(' - Topic'):
        return title, channel[:-8]
    t = TIDY.sub('', title)
    t = re.sub(r'\b(full song|full video|official (music )?video|official audio|lyrical( video)?|with lyrics|lyrics|video song|audio song|4k|hd)\b', '', t, flags=re.I)
    parts = [x.strip(' -|"\'') for x in re.split(r'\s+[|]\s+|\s+[-–—]\s+', t) if x.strip(' -|"\'')]
    if not parts:
        return title, channel
    if LABEL.match(channel) or not channel:
        # "Song | Movie | Singer" or "Singer - Song": keep the whole thing searchable; first part is usually the song
        return parts[0].strip('"“”'), ', '.join(parts[1:3]) or channel
    if len(parts) >= 2 and norm(parts[0]) and norm(parts[0]) in norm(channel):
        return parts[1], parts[0]
    return parts[0], channel


def looks_like_song(title, secs):
    return 90 <= secs <= 540 and not JUNK.search(title)


def is_audio(title, channel):
    return channel.endswith(' - Topic') or bool(re.search(r'official audio|\baudio\b|full audio|audio song', title, re.I))


# ---------- 2. playlists ----------
SEARCHES = [
    # Bollywood / Hindi
    'bollywood hits', 'latest bollywood songs', 'new hindi songs 2026', 'new hindi songs 2025', 'bollywood songs 2024',
    'bollywood romantic songs', 'hindi sad songs', 'bollywood party songs', 'bollywood dance songs', 'hindi love songs',
    '90s bollywood songs', '2000s bollywood songs', '80s bollywood songs', 'old hindi songs', 'kishore kumar songs',
    'lata mangeshkar songs', 'mohammed rafi songs', 'arijit singh songs', 'shreya ghoshal songs', 'atif aslam songs',
    'sonu nigam songs', 'kk songs', 'jubin nautiyal songs', 'pritam songs', 'vishal shekhar songs', 'a r rahman hindi songs',
    'shankar ehsaan loy songs', 'sunidhi chauhan songs', 'neha kakkar songs', 'darshan raval songs', 'udit narayan songs',
    'kumar sanu songs', 'alka yagnik songs', 'mohit chauhan songs', 'armaan malik songs', 'b praak songs', 'sachet tandon songs',
    'hindi indie songs', 'lofi hindi songs', 'hindi wedding songs', 'sufi songs hindi', 'ghazal jagjit singh', 'bhajan songs',
    # Punjabi
    'punjabi hits', 'new punjabi songs', 'diljit dosanjh songs', 'ap dhillon songs', 'sidhu moose wala songs', 'karan aujla songs',
    'guru randhawa songs', 'badshah songs', 'yo yo honey singh songs', 'shubh songs',
    # South
    'tamil hits', 'tamil melody songs', 'anirudh songs', 'sid sriram songs', 'a r rahman tamil songs', 'ilaiyaraaja songs',
    'telugu hits', 'telugu melody songs', 'devi sri prasad songs', 'thaman songs', 'malayalam hits', 'kannada hits',
    # Other Indian
    'marathi songs', 'bengali songs', 'gujarati garba songs', 'haryanvi songs', 'bhojpuri songs',
    # English
    'top english songs', 'english pop hits', 'top 100 songs 2025', 'billboard hot 100', 'best songs of 2024', 'best songs 2026',
    '2010s hits', '2000s hits', '90s hits', '80s hits', '70s classic rock', 'rock classics', 'alternative rock hits',
    'hip hop hits', 'rap hits', 'r&b hits', 'edm hits', 'house music hits', 'indie pop', 'country hits', 'love songs english',
    'sad english songs', 'chill songs', 'workout songs', 'road trip songs', 'taylor swift songs', 'ed sheeran songs',
    'the weeknd songs', 'drake songs', 'eminem songs', 'coldplay songs', 'imagine dragons songs', 'linkin park songs',
    'bruno mars songs', 'justin bieber songs', 'dua lipa songs', 'billie eilish songs', 'ariana grande songs',
    'post malone songs', 'maroon 5 songs', 'one direction songs', 'rihanna songs', 'beyonce songs', 'adele songs',
    'queen songs', 'michael jackson songs', 'the beatles songs', 'bts songs', 'kpop hits',
]
PL_PER_SEARCH = 3


def playlists(rows, state, budget):
    done_q, done_pl = set(state.get('queries', [])), set(state.get('playlists', []))
    calls = added = 0
    for q in SEARCHES:
        if q in done_q:
            continue
        if calls >= budget:
            break
        md = reader('https://www.youtube.com/results?search_query=' + urllib.parse.quote(q + ' playlist') + '&sp=EgIQAw%253D%253D', 15)
        calls += 1
        ids = []
        for m in re.finditer(r'list=([A-Za-z0-9_-]{13,})', md):
            if m.group(1) not in ids and not m.group(1).startswith('RD'):
                ids.append(m.group(1))
        n_q = 0
        for pl in ids[:PL_PER_SEARCH]:
            if pl in done_pl:
                continue
            page = reader('https://www.youtube.com/playlist?list=' + pl, 25)
            calls += 1
            for vid, title, ch, secs, views in parse_items(page):
                # 100k+ views keeps out low-quality re-uploads; unknown view count is kept
                if vid in rows or not looks_like_song(title, secs) or 0 <= views < 100_000:
                    continue
                st, sa = song_from_video(title, ch)
                rows[vid] = [vid, st, sa, '', 'pl', 'a' if is_audio(title, ch) else 'v', str(secs)]
                n_q += 1
            done_pl.add(pl)
        added += n_q
        done_q.add(q)
        print(f'  playlists {q!r}: +{n_q}', flush=True)
        state['queries'], state['playlists'] = sorted(done_q), sorted(done_pl)
    print(f'  playlists: added {added} songs with {calls} page reads ({len(done_q)}/{len(SEARCHES)} searches done)', flush=True)
    # once every search is done, start over next time so playlists' new songs get picked up
    if len(done_q) >= len(SEARCHES):
        state['queries'] = []


# ---------- 3. charts ----------
COUNTRIES = ['in', 'us', 'gb', 'ca', 'au', 'ae', 'pk', 'sg', 'ie', 'nz']
IN_GENRES = [0, 1263, 1185, 1264, 1265, 1266, 1262, 1267, 14, 18, 17, 15, 20, 7]


def charts():
    seen, out = set(), []
    for cc in COUNTRIES:
        for g in (IN_GENRES if cc == 'in' else [0, 14, 18, 17, 21, 20]):
            url = f'https://itunes.apple.com/{cc}/rss/topsongs/limit=100{"/genre=%d" % g if g else ""}/json'
            try:
                feed = json.loads(get(url, timeout=30)).get('feed', {})
            except Exception:
                continue
            e = feed.get('entry') or []
            for x in (e if isinstance(e, list) else [e]):
                title, artist = x['im:name']['label'], x['im:artist']['label']
                k = song_key(artist, title)
                if k not in seen:
                    seen.add(k)
                    out.append((title, artist, (x.get('im:releaseDate') or {}).get('label', '')[:4]))
            time.sleep(0.3)
    return out


def best_match(title, artist, results):
    t = norm(re.sub(r'\s*[\(\[].*?[\)\]]', '', title))
    a = norm(re.split(r',|&', artist)[0])
    best, bs = None, 0
    for i, (vid, vt, ch, secs, _views) in enumerate(results[:10]):
        s, nt, nc = -i * 0.2, norm(vt), norm(ch)
        if not looks_like_song(vt, secs or 200):
            continue
        if t and t in nt: s += 3
        if a and (a in nt or a in nc): s += 2
        if ch.endswith(' - Topic'): s += 2.5
        if re.search(r'official audio|\(audio\)|\[audio\]|full audio|audio song', vt, re.I): s += 1.5
        if re.search(r'\blive\b|remix|lofi|lo-fi', vt, re.I) and not re.search(r'live|remix|lofi', title, re.I): s -= 3
        if s > bs:
            best, bs = (vid, 'a' if is_audio(vt, ch) else 'v', secs), s
    return best if bs >= 4 else None


def add_chart_songs(rows, budget):
    have = {song_key(r[2], r[1]) for r in rows.values()}
    todo = [c for c in charts() if song_key(c[1], c[0]) not in have]
    print(f'  charts: {len(todo)} songs not in the catalog yet, looking up {min(budget, len(todo))}', flush=True)
    n = 0
    for title, artist, year in todo[:budget]:
        q = f'{re.split(r",|&", artist)[0].strip()} {re.sub(r"\s*[\(\[].*?[\)\]]", "", title)} audio'
        m = best_match(title, artist, parse_items(reader('https://www.youtube.com/results?search_query=' + urllib.parse.quote(q), 15)))
        if m and m[0] not in rows:
            rows[m[0]] = [m[0], title, artist, year, 'ch', m[1], str(m[2] or '')]
            n += 1
    print(f'  charts: added {n}', flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--skip-wikidata', action='store_true')
    ap.add_argument('--playlist-budget', type=int, default=400, help='max playlist page reads this run')
    ap.add_argument('--chart-budget', type=int, default=600, help='max YouTube lookups for new chart songs')
    a = ap.parse_args()
    rows = load()
    state = json.load(open(STATE)) if os.path.exists(STATE) else {}
    print(f'start: {len(rows)} songs', flush=True)
    jp = os.path.join(DATA, 'songs-jp.tsv')
    if os.path.exists(jp):
        os.remove(jp)  # the Japanese catalog is no longer used
    if not a.skip_wikidata:
        wikidata(rows); save(rows)
    if a.playlist_budget:
        try:
            playlists(rows, state, a.playlist_budget)
        finally:
            save(rows); json.dump(state, open(STATE, 'w'), indent=0)
    if a.chart_budget:
        add_chart_songs(rows, a.chart_budget); save(rows)
    meta = {'songs': len(rows), 'updated': time.strftime('%Y-%m-%d')}
    json.dump(meta, open(os.path.join(DATA, 'meta.json'), 'w'))
    print('done:', meta)


if __name__ == '__main__':
    main()
