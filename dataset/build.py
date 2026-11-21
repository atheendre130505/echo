#!/usr/bin/env python3
"""Builds Echo's song -> YouTube dataset (data/songs.tsv, data/songs-jp.tsv).

Sources
  1. Wikidata: every song/single/recording that has a performer and a YouTube video ID.
  2. ayousanz/music-youtube-list (Hugging Face): ~500k YouTube music videos, mostly
     Japanese; filtered to real songs and written to a separate file.
  3. Apple Music charts (many countries and genres): songs missing from the dataset
     are looked up on YouTube and added. This is what keeps new songs coming in.

Run weekly by .github/workflows/dataset.yml. Every step keeps what is already in
the files, so the dataset only grows.

Columns (tab separated): youtube_id, title, artist, year, source, kind
  source: wd = Wikidata, hf = Hugging Face, ch = charts
  kind:   a = audio upload (Topic channel / official audio), v = music video, '' = unknown
"""
import argparse
import csv
import gzip
import io
import json
import os
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request

UA = 'EchoDatasetBuilder/1.0 (personal music app; github.com/atheendre130505/echo)'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
MAIN, JP = os.path.join(DATA, 'songs.tsv'), os.path.join(DATA, 'songs-jp.tsv')

# Same normalisation as the app (norm() in app.js), so keys match on both sides.
KEEP = re.compile(r'[^a-z0-9\u0900-\u097f\u0600-\u06ff\u3040-\u30ff\u4e00-\u9fff]+')
def norm(s):
    return KEEP.sub('', unicodedata.normalize('NFKD', str(s or '')).lower())

JUNK = re.compile(r'\b(making|behind the scenes|bts|teaser|trailer|promo|interview|reaction|karaoke|cover|8d|slowed|reverb|nightcore|sped up|jukebox|full album|lyrics? video|dialogue|scene|shorts?)\b', re.I)


def get(url, data=None, headers=None, timeout=120):
    req = urllib.request.Request(url, data=data, headers={'User-Agent': UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def load(path):
    rows = {}
    if os.path.exists(path):
        with open(path, encoding='utf-8') as f:
            for line in f:
                p = line.rstrip('\n').split('\t')
                if len(p) >= 3 and p[0] != 'id':
                    rows[p[0]] = (p + ['', '', ''])[:6]
    return rows


def save(path, rows):
    os.makedirs(DATA, exist_ok=True)
    clean = lambda s: str(s).replace('\t', ' ').replace('\n', ' ').strip()
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write('id\ttitle\tartist\tyear\tsource\tkind\n')
        for vid, r in sorted(rows.items(), key=lambda kv: (norm(kv[1][2]), norm(kv[1][1]))):
            f.write('\t'.join(clean(x) for x in [vid, *r[1:6]]) + '\n')


# ---------- 1. Wikidata ----------
SPARQL = '''SELECT ?yt ?sLabel ?pLabel (YEAR(?d) AS ?y) WHERE {
  ?s wdt:P1651 ?yt ; wdt:P175 ?p .
  FILTER NOT EXISTS { ?s wdt:P31 wd:Q482994 }
  %s
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul,hi,es,fr,de,pt,it,ja,ko,ru,ta,te,pa,bn,ar,tr". }
}'''
SLICES = ['OPTIONAL { ?s wdt:P577 ?d } FILTER(!BOUND(?d))'] + [
    '?s wdt:P577 ?d . FILTER(YEAR(?d) >= %d && YEAR(?d) < %d)' % r for r in
    [(1000, 1980), (1980, 1995), (1995, 2003), (2003, 2008), (2008, 2011), (2011, 2013), (2013, 2015),
     (2015, 2017), (2017, 2019), (2019, 2021), (2021, 2023), (2023, 2100)]]


def wikidata(rows):
    total = 0
    for sl in SLICES:
        for attempt in range(3):
            try:
                body = urllib.parse.urlencode({'query': SPARQL % sl}).encode()
                raw = get('https://query.wikidata.org/sparql', body, {'Accept': 'text/tab-separated-values', 'Content-Type': 'application/x-www-form-urlencoded'}, timeout=90)
                break
            except Exception as e:
                print('  wikidata slice retry', attempt + 1, str(e)[:80], flush=True)
                time.sleep(10)
        else:
            continue
        lines = raw.decode('utf-8', 'replace').split('\n')[1:]
        n = 0
        for line in lines:
            p = line.split('\t')
            if len(p) < 3:
                continue
            vid = p[0].strip('"')
            title = re.sub(r'^"|"(@[\w-]+)?$', '', p[1])
            artist = re.sub(r'^"|"(@[\w-]+)?$', '', p[2])
            year = re.sub(r'\D', '', p[3]) if len(p) > 3 else ''
            if not re.fullmatch(r'[\w-]{11}', vid) or re.fullmatch(r'Q\d+', title) or re.fullmatch(r'Q\d+', artist):
                continue
            if vid in rows and rows[vid][4] == 'wd' and artist not in rows[vid][2]:
                rows[vid][2] = rows[vid][2] + ', ' + artist  # several performers
                continue
            if vid not in rows:
                rows[vid] = [vid, title, artist, year, 'wd', 'v']
                n += 1
        total += n
        print(f'  wikidata {sl[:40]!r}: {len(lines)} rows, {n} new', flush=True)
        time.sleep(2)
    return total


# ---------- 2. Hugging Face (Japanese music videos) ----------
HF = 'https://huggingface.co/datasets/ayousanz/music-youtube-list/resolve/main/filtered_meta.jsonl'


def fix_mojibake(s):
    try:
        return s.encode('latin-1').decode('utf-8')
    except Exception:
        return s


def huggingface(rows):
    if rows:
        print('  hugging face: already imported, skipping')
        return 0
    req = urllib.request.Request(HF, headers={'User-Agent': UA})
    n = 0
    with urllib.request.urlopen(req, timeout=600) as r:
        for line in io.TextIOWrapper(r, encoding='utf-8', errors='replace'):
            try:
                v = json.loads(line)
            except Exception:
                continue
            if v.get('categoryId') != '10' or not (60 <= (v.get('durationSec') or 0) <= 600) or (v.get('viewCount') or 0) < 50000:
                continue
            title, ch = fix_mojibake(v.get('title', '')), fix_mojibake(v.get('channelTitle', ''))
            if JUNK.search(title):
                continue
            topic = ch.endswith(' - Topic')
            rows[v['videoId']] = [v['videoId'], title, ch.replace(' - Topic', ''), (v.get('published') or '')[:4], 'hf', 'a' if topic else 'v']
            n += 1
    print(f'  hugging face: {n} songs', flush=True)
    return n


# ---------- 3. Charts: new songs ----------
COUNTRIES = ['in', 'us', 'gb', 'ca', 'au', 'ae', 'pk', 'sg', 'za', 'ng', 'ie', 'nz', 'ph', 'my', 'id', 'mx', 'br', 'es', 'fr', 'de', 'kr', 'jp']
GENRES = [0, 1263, 1185, 1264, 1265, 1266, 1262, 14, 18, 21, 17, 15, 20, 7, 51, 12, 1267]


def charts():
    seen, out = set(), []
    for cc in COUNTRIES:
        for g in (GENRES if cc == 'in' else [0, 14, 18, 17]):
            url = f'https://itunes.apple.com/{cc}/rss/topsongs/limit=100{"/genre=%d" % g if g else ""}/json'
            try:
                feed = json.loads(get(url, timeout=30)).get('feed', {})
            except Exception:
                continue
            e = feed.get('entry') or []
            for x in (e if isinstance(e, list) else [e]):
                title, artist = x['im:name']['label'], x['im:artist']['label']
                k = norm(artist.split(',')[0].split('&')[0]) + '|' + norm(re.sub(r'\s*[\(\[].*?[\)\]]', '', title))
                if k not in seen:
                    seen.add(k)
                    out.append((title, artist, (x.get('im:releaseDate') or {}).get('label', '')[:4]))
            time.sleep(0.3)
    return out


def parse_jina(md):
    res, seen = [], set()
    for m in re.finditer(r'^### \[(.+?)\]\(https://www\.youtube\.com/watch\?v=([\w-]{11})[^)]*\)', md, re.M):
        vid, title = m.group(2), re.sub(r'\\([\[\]()_*#])', r'\1', m.group(1))
        if vid in seen or re.match(r'^Mix\s*[-–]', title):
            continue
        seen.add(vid)
        after = md[m.end():m.end() + 600]
        ch = re.search(r'\[([^\]]+)\]\(https://www\.youtube\.com/(?:channel/|@)', after)
        res.append((vid, title, ch.group(1).strip() if ch else ''))
    return res


def best_match(title, artist, results):
    t = norm(re.sub(r'\s*[\(\[].*?[\)\]]', '', title))
    a = norm(artist.split(',')[0].split('&')[0])
    best, bs = None, 0
    for i, (vid, vt, ch) in enumerate(results[:10]):
        s, nt, nc = -i * 0.2, norm(vt), norm(ch)
        if t and t in nt: s += 3
        if a and (a in nt or a in nc): s += 2
        if ch.endswith(' - Topic'): s += 2.5          # auto-generated studio audio: exactly the song
        if re.search(r'official audio|\(audio\)|\[audio\]|full audio|audio song', vt, re.I): s += 1.5
        if JUNK.search(vt) and not JUNK.search(title): s -= 5
        if re.search(r'\blive\b|remix|lofi|lo-fi', vt, re.I) and not re.search(r'live|remix|lofi', title, re.I): s -= 3
        if s > bs:
            best, bs = (vid, 'a' if ch.endswith(' - Topic') or re.search(r'audio', vt, re.I) else 'v'), s
    return best if bs >= 4 else None


def add_chart_songs(rows, budget):
    have = {norm(r[2].split(',')[0].split('&')[0]) + '|' + norm(re.sub(r'\s*[\(\[].*?[\)\]]', '', r[1])) for r in rows.values()}
    todo = [c for c in charts() if norm(c[1].split(',')[0].split('&')[0]) + '|' + norm(re.sub(r'\s*[\(\[].*?[\)\]]', '', c[0])) not in have]
    print(f'  charts: {len(todo)} songs not in the dataset yet, looking up {min(budget, len(todo))}', flush=True)
    n = 0
    for title, artist, year in todo[:budget]:
        q = f'{artist.split(",")[0].split("&")[0].strip()} {re.sub(r"\s*[\(\[].*?[\)\]]", "", title)} audio'
        try:
            md = get('https://r.jina.ai/https://www.youtube.com/results?search_query=' + urllib.parse.quote(q),
                     headers={'X-Timeout': '15', 'X-Wait-For-Selector': 'ytd-video-renderer'}, timeout=60).decode('utf-8', 'replace')
            m = best_match(title, artist, parse_jina(md))
            if m and m[0] not in rows:
                rows[m[0]] = [m[0], title, artist, year, 'ch', m[1]]
                n += 1
        except Exception as e:
            print('   lookup failed:', str(e)[:80], flush=True)
            if '429' in str(e):
                time.sleep(60)
        time.sleep(3.2)  # stay under the free reader's 20 requests/minute
    print(f'  charts: added {n}', flush=True)
    return n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--skip-wikidata', action='store_true')
    ap.add_argument('--skip-hf', action='store_true')
    ap.add_argument('--chart-budget', type=int, default=600, help='max YouTube lookups for new chart songs')
    a = ap.parse_args()
    main_rows, jp_rows = load(MAIN), load(JP)
    print(f'start: {len(main_rows)} songs, {len(jp_rows)} Japanese songs', flush=True)
    if not a.skip_wikidata:
        wikidata(main_rows); save(MAIN, main_rows)
    if not a.skip_hf:
        huggingface(jp_rows); save(JP, jp_rows)
    if a.chart_budget:
        add_chart_songs(main_rows, a.chart_budget); save(MAIN, main_rows)
    meta = {'songs': len(main_rows), 'songs_jp': len(jp_rows), 'updated': time.strftime('%Y-%m-%d')}
    with open(os.path.join(DATA, 'meta.json'), 'w') as f:
        json.dump(meta, f)
    print('done:', meta)


if __name__ == '__main__':
    main()
