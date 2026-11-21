/* Echo — a phone-first music + video player on top of YouTube.
   Static site: runs on GitHub Pages, everything is stored on the device. */
'use strict';

/* ───────────────────────── utilities ───────────────────────── */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DAY = 864e5;
const store = {
  get(k, d) { try { const v = localStorage.getItem('echo:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('echo:' + k, JSON.stringify(v)); } catch (e) { pruneCache(); try { localStorage.setItem('echo:' + k, JSON.stringify(v)); } catch {} } },
  del(k) { try { localStorage.removeItem('echo:' + k); } catch {} },
  keys() { try { return Object.keys(localStorage).filter(k => k.startsWith('echo:')).map(k => k.slice(5)); } catch { return []; } }
};
function pruneCache(maxAge = 3 * DAY) {
  for (const k of store.keys()) {
    if (!/^(mix|s|gen|gly|lrc|chart|rr|ver):/.test(k)) continue;
    const age = /^(gen|gly|lrc|ver):/.test(k) ? 30 * DAY : maxAge;
    const v = store.get(k); if (!v || !v.at || Date.now() - v.at > age) store.del(k);
  }
}
const ta = document.createElement('textarea');
const decode = s => { ta.innerHTML = s; return ta.value; };
const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9ऀ-ॿ؀-ۿ぀-ヿ一-鿿]+/g, '');
const fmt = s => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
function waitFor(fn, ms = 10000) { return new Promise((res, rej) => { const t0 = Date.now(); (function chk() { if (fn()) return res(); if (Date.now() - t0 > ms) return rej(new Error('timeout')); setTimeout(chk, 100); })(); }); }
function rng(seed) { let h = 1779033703 ^ String(seed).length; for (const c of String(seed)) { h = Math.imul(h ^ c.charCodeAt(0), 3432918353); h = h << 13 | h >>> 19; } return () => { h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; }; }
const dayKey = () => new Date().toISOString().slice(0, 10);
const weekKey = () => { const d = new Date(); const j = new Date(d.getFullYear(), 0, 1); return d.getFullYear() + 'w' + Math.ceil(((d - j) / DAY + j.getDay() + 1) / 7); };
async function pool(items, n, fn) { const out = new Array(items.length); let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k], k); } catch { out[k] = null; } } })); return out; }

/* ───────────────────────── icons ───────────────────────── */
const P = {
  home: ['f', 'M12 3l9 8h-3v9h-5v-6h-2v6H6v-9H3z'],
  search: ['f', 'M10 3a7 7 0 015.6 11.2l5.1 5.1-1.4 1.4-5.1-5.1A7 7 0 1110 3zm0 2a5 5 0 100 10 5 5 0 000-10z'],
  lib: ['f', 'M4 3h2v18H4zM9 3h2v18H9zM14.3 3.7l1.9-.6 5.1 17.3-1.9.6z'],
  play: ['f', 'M8 5.1v13.8L19 12z'],
  pause: ['f', 'M6.5 5h3.5v14H6.5zM14 5h3.5v14H14z'],
  next: ['f', 'M5.5 6l9 6-9 6zM16 6h2.5v12H16z'],
  prev: ['f', 'M18.5 6l-9 6 9 6zM5.5 6H8v12H5.5z'],
  shuffle: ['s', 'M16 4h4v4M4 20L20 4M20 16v4h-4M14.5 14.5L20 20M4 4l5 5'],
  repeat: ['s', 'M17 2l3 3-3 3M3 11V9a4 4 0 014-4h13M7 22l-3-3 3-3M21 13v2a4 4 0 01-4 4H4'],
  heart: ['s', 'M12 20.5l-1.4-1.3C5.4 14.5 2 11.4 2 7.6 2 4.5 4.4 2 7.5 2c1.7 0 3.4.8 4.5 2.1C13.1 2.8 14.8 2 16.5 2 19.6 2 22 4.5 22 7.6c0 3.8-3.4 6.9-8.6 11.6z'],
  heartF: ['f', 'M12 20.5l-1.4-1.3C5.4 14.5 2 11.4 2 7.6 2 4.5 4.4 2 7.5 2c1.7 0 3.4.8 4.5 2.1C13.1 2.8 14.8 2 16.5 2 19.6 2 22 4.5 22 7.6c0 3.8-3.4 6.9-8.6 11.6z'],
  more: ['f', 'M5 10a2 2 0 110 4 2 2 0 010-4zm7 0a2 2 0 110 4 2 2 0 010-4zm7 0a2 2 0 110 4 2 2 0 010-4z'],
  down: ['s', 'M6 9l6 6 6-6'],
  back: ['s', 'M15 5l-7 7 7 7'],
  dl: ['s', 'M12 3v12M7 10l5 5 5-5M5 21h14'],
  dlDone: ['f', 'M12 2a10 10 0 110 20 10 10 0 010-20zm-1 5v6.6l-2.3-2.3-1.4 1.4 4.7 4.7 4.7-4.7-1.4-1.4-2.3 2.3V7z'],
  queue: ['s', 'M3 6h13M3 12h13M3 18h8M16 15v6l5-3z'],
  share: ['s', 'M4 12v8h16v-8M12 3v13M7 8l5-5 5 5'],
  gear: ['s', 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z'],
  plus: ['s', 'M12 5v14M5 12h14'],
  radio: ['s', 'M12 14a2 2 0 100-4 2 2 0 000 4zM16.2 7.8a6 6 0 010 8.4M7.8 16.2a6 6 0 010-8.4M19 5a10 10 0 010 14M5 19A10 10 0 015 5'],
  next2: ['s', 'M3 6h13M3 12h9M3 18h9M17 11v8M13 15h8'],
  yt: ['s', 'M22 12s0-3.5-.4-5.1a2.6 2.6 0 00-1.9-1.9C18 4.6 12 4.6 12 4.6s-6 0-7.7.4a2.6 2.6 0 00-1.9 1.9C2 8.5 2 12 2 12s0 3.5.4 5.1a2.6 2.6 0 001.9 1.9c1.7.4 7.7.4 7.7.4s6 0 7.7-.4a2.6 2.6 0 001.9-1.9c.4-1.6.4-5.1.4-5.1zM10 15V9l5 3z'],
  trash: ['s', 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13'],
  music: ['s', 'M9 18V5l12-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zM21 16a3 3 0 11-6 0 3 3 0 016 0z'],
  clock: ['s', 'M12 22a10 10 0 100-20 10 10 0 000 20zM12 6v6l4 2'],
  film: ['s', 'M3 4h18v16H3zM7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4'],
  upload: ['s', 'M12 21V9M7 14l5-5 5 5M5 3h14'],
  refresh: ['s', 'M21 12a9 9 0 01-15.5 6.3L3 16M3 12a9 9 0 0115.5-6.3L21 8M21 3v5h-5M3 21v-5h5'],
  x: ['s', 'M6 6l12 12M18 6L6 18'],
};
const ic = n => { const [k, d] = P[n]; return `<svg class="${k}" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`; };

/* ───────────────────────── state ───────────────────────── */
const S = Object.assign({ ghToken: '', wifiOnly: true, preferLocal: true, autoplay: true, autoDl: true, mode: 'audio' }, store.get('settings', {}));
for (const k of ['cobaltUrl', 'cobaltKey', 'dlVia', 'geniusToken', 'ytKey']) delete S[k];
// Settings (incl. keys) are written to localStorage AND IndexedDB, and the browser is asked to keep storage persistent.
const saveS = () => { store.set('settings', S); try { idb.kvSet('settings', JSON.parse(JSON.stringify(S))).catch(() => {}); navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch {} };
const META = store.get('meta', {});
let metaT; const saveMeta = () => { clearTimeout(metaT); metaT = setTimeout(() => store.set('meta', META), 400); };
const LIKES = store.get('likes', []);           // ordered ids, newest last
const likeSet = new Set(LIKES);
const EV = store.get('ev', []);                 // listening events
const PL = store.get('pl', {});                 // playlists
const DLX = store.get('dlx', {});               // downloads index {id:{audio:size,video:size}}
let HOME = store.get('home', null);

/* ───────────────────────── track metadata ───────────────────────── */
const thumb = (id, q = 'mqdefault') => META[id]?.art || (String(id).startsWith('local:') ? 'icon.svg' : `https://i.ytimg.com/vi/${id}/${q}.jpg`);
function cleanChannel(c) { return String(c || '').replace(/\s*-\s*Topic$/i, '').replace(/\s*VEVO$/i, '').replace(/\s+(Official|Music|Official Channel)$/i, '').trim(); }
function parseTitle(raw, ch) {
  let artist = cleanChannel(ch);
  let s = decode(String(raw || ''));
  s = s.replace(/\s*[\(\[【][^\)\]】]*(official|video|audio|lyric|visuali[sz]er|4k|\bhd\b|\bhq\b|remaster|\bmv\b|m\/v|full song|explicit|clip)[^\)\]】]*[\)\]】]/gi, '');
  s = s.replace(/\s*\|.*$/, '').replace(/\s*#\S+/g, '').trim();
  let title = s;
  const parts = s.split(/\s+[-–—~]\s+/);
  if (parts.length >= 2) {
    const a = parts[0].trim(), b = parts.slice(1).join(' - ').trim();
    const na = norm(a), nb = norm(b), nc = norm(artist);
    if (nb && nc && (nb === nc || nc.includes(nb) || nb.includes(nc)) && !(na && nc.includes(na))) { title = a; artist = b; }
    else { artist = a; title = b; }
  }
  title = title.replace(/\s*(official\s*)?(music\s*)?video\s*$/i, '').replace(/\s*(lyrics?|audio)\s*$/i, '').trim();
  return { title: title || decode(raw), artist: artist || 'Unknown artist' };
}
function trackFrom(id, rawTitle, channel) {
  const p = parseTitle(rawTitle, channel);
  const t = META[id] && META[id].fixed ? { raw: decode(rawTitle), ch: channel } : { id, title: p.title, artist: p.artist, raw: decode(rawTitle), ch: channel };
  META[id] = Object.assign(META[id] || {}, t); saveMeta(); return META[id];
}
const metaInflight = {};
async function meta(id) {
  if (META[id]) return META[id];
  if (metaInflight[id]) return metaInflight[id];
  return metaInflight[id] = (async () => {
    const r = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + id));
    if (!r.ok) throw new Error('meta ' + r.status);
    const j = await r.json();
    return trackFrom(id, j.title, j.author_name);
  })().finally(() => delete metaInflight[id]);
}
const metas = ids => pool(ids, 6, meta).then(a => a.filter(Boolean));
const primaryArtist = a => String(a || '').split(/\s*(?:,|&|\bx\b|\bfeat\.?|\bft\.?|\bwith\b|\band\b)\s*/i)[0].trim();
const akey = a => norm(primaryArtist(a)) || norm(a);
const songKey = t => akey(t.artist) + '|' + norm(t.title.replace(/\s*[\(\[].*?[\)\]]/g, '').replace(/\s+(ft|feat)\.?\s.*$/i, ''));

/* ───────────────────────── recommendation engine ─────────────────────────
   Spotify-style, rebuilt from the public description of how it works:
   1) Taste profile from implicit feedback — full listens (+), early skips
      under 30 s (−), likes (++), all decaying with a 14-day half-life.
   2) Candidate generation by collaborative filtering — YouTube "Mix" radio
      playlists (built from what millions of listeners play together) for
      your strongest seed tracks; songs appearing in several seed mixes score
      higher (co-occurrence).
   3) Ranking — co-occurrence + artist affinity − negative signals −
      recently-played fatigue + a little exploration noise.
   4) Diversity re-rank — no artist twice within 3 slots, duplicates removed.
   Shelves: Daily Mixes (one per taste cluster/top artist, familiar + new),
   Discover Weekly (only artists you've never played, fixed for the week),
   On Repeat, Jump Back In, Recently Played, and endless Autoplay radio. */
// search = you searched and the top song matched; pick = you tapped a search result
const W = { play: 0.25, done: 1, skip: -1.2, search: 0.6, pick: 0.8 };
const HALF = 14 * DAY;
let PROF = null;
function logEv(k, t) {
  if (!t || String(t.id).startsWith('local:') && k !== 'play') return;
  EV.push({ i: t.id, a: akey(t.artist), k, t: Date.now() });
  if (EV.length > 5000) EV.splice(0, EV.length - 5000);
  store.set('ev', EV); PROF = null; scheduleSync(20000);
}
function profile() {
  if (PROF) return PROF;
  const now = Date.now(), tr = {}, ar = {}, cnt = {}, cnt30 = {}, last = {}, skips = {};
  for (const e of EV) {
    const d = Math.pow(0.5, (now - e.t) / HALF), w = (W[e.k] || 0) * d;
    if (e.i) tr[e.i] = (tr[e.i] || 0) + w; if (e.a) ar[e.a] = (ar[e.a] || 0) + w;
    if (e.k === 'done') { cnt[e.i] = (cnt[e.i] || 0) + 1; if (now - e.t < 30 * DAY) cnt30[e.i] = (cnt30[e.i] || 0) + 1; }
    if (e.k === 'skip') skips[e.i] = (skips[e.i] || 0) + 1;
    if (e.k === 'play') last[e.i] = e.t;
  }
  for (const id of LIKES) { tr[id] = (tr[id] || 0) + 3; const m = META[id]; if (m) { const a = akey(m.artist); ar[a] = (ar[a] || 0) + 1.5; } }
  return PROF = { tr, ar, cnt, cnt30, last, skips };
}
const hasHistory = () => EV.some(e => e.k !== 'skip') || LIKES.length > 0;
/* Searches are taste signals too: what you look for shows intent before you play it.
   The top matching song gets a search signal (song + its artist). If the query names
   an artist ("arijit singh"), that artist gets one as well. New artists from a search
   make Home rebuild your mixes and Release Radar. */
function logSearch(q, ts) {
  if (!ts || !ts.length) return;
  const nq = norm(q), before = profile().ar;
  const art = ts.map(t => primaryArtist(t.artist)).find(a => { const na = norm(a); return na.length > 2 && (nq.includes(na) || na.includes(nq)); });
  resolveYT(ts[0]).then(r => {
    logEv('search', r);
    if (art && akey(art) !== akey(r.artist)) logEv('search', { id: '', artist: art });
    store.set('lastSearch', { q, id: r.id, at: Date.now() });
    if (!(before[akey(r.artist)] > 0)) { HOME = null; store.del('home'); if (RR) RR.at = 0; }
  }).catch(() => { if (art) logEv('search', { id: '', artist: art }); });
}
function logPick(q, t) {
  resolveYT(t).then(r => { logEv('pick', r); store.set('lastSearch', { q, id: r.id, at: Date.now() }); }).catch(() => {});
}
function topTracks(n, filter) {
  const p = profile();
  return Object.entries(p.tr).filter(([id, s]) => s > 0 && META[id] && !id.startsWith('local:') && (!filter || filter(META[id]))).sort((a, b) => b[1] - a[1]).slice(0, n).map(x => x[0]);
}
function weightedPick(ids, n, r) {
  const p = profile(), pool_ = ids.slice(), out = [];
  while (out.length < n && pool_.length) {
    const ws = pool_.map(id => Math.max(0.05, p.tr[id] || 0.1)); const tot = ws.reduce((a, b) => a + b, 0);
    let x = r() * tot, k = 0; while (k < ws.length - 1 && (x -= ws[k]) > 0) k++;
    out.push(pool_.splice(k, 1)[0]);
  }
  return out;
}
async function candidates(seeds) {
  const c = new Map();
  const mixes = await pool(seeds, 1, getMix);
  mixes.forEach(ids => (ids || []).forEach((id, pos) => c.set(id, (c.get(id) || 0) + 1 + Math.max(0, 0.5 - pos / 50))));
  return c;
}
async function rank(cands, o = {}) {
  const p = profile(), r = rng(o.seed ?? Math.random());
  const maxA = Math.max(1, ...Object.values(p.ar));
  const ids = [...cands.entries()].filter(([id]) => !(o.exclude && o.exclude.has(id))).sort((a, b) => b[1] - a[1]).slice(0, o.pool || 70).map(x => x[0]);
  const tracks = await metas(ids);
  const seen = new Set(o.excludeSongs || []);
  // artist cluster: artists that recur across the candidate mixes are the core of this sound
  const aw = {}; if (o.cluster) for (const t of tracks) { const a = akey(t.artist); aw[a] = (aw[a] || 0) + (cands.get(t.id) || 0); }
  const scored = [];
  for (const t of tracks) {
    const a = akey(t.artist), known = (p.ar[a] || 0) !== 0 || EV.some(e => e.a === a);
    let s = Math.log1p(cands.get(t.id) || 0) * 1.2 + ((p.ar[a] || 0) / maxA) * (o.affinity ?? 0.9);
    if (o.cluster) s += Math.log1p(Math.max(0, aw[a] - (cands.get(t.id) || 0))) * o.cluster;
    if (likeSet.has(t.id)) s += 0.4;
    if ((p.tr[t.id] || 0) < 0) s -= 2 + (p.skips[t.id] || 0) * 0.5;
    if ((p.ar[a] || 0) < -1) s -= 1;
    if (p.last[t.id] && Date.now() - p.last[t.id] < 4 * 3600e3) s -= 1.5;
    if (o.novelty === 'new' && known) continue;
    if (o.novelty === 'familiar' && known) s += 0.6;
    if (!o.allowVariants && JUNK_RE.test(t.raw || t.title || '')) continue; // making-of, teasers, shorts, reactions… are not songs
    if (/\b(live|instrumental)\b/i.test(t.raw || '') && !o.allowVariants) s -= 1.2;
    s += -Math.log(-Math.log(r() * 0.999 + 0.0005)) * 0.35; // gumbel exploration
    scored.push({ t, s });
  }
  scored.sort((a, b) => b.s - a.s);
  // diversity re-rank
  const out = [], recentA = [], held = [];
  for (const x of scored) {
    const sk = songKey(x.t); if (seen.has(sk)) continue;
    const a = akey(x.t.artist);
    if (recentA.slice(-3).includes(a)) { held.push(x); continue; }
    out.push(x.t); seen.add(sk); recentA.push(a);
    for (let i = 0; i < held.length; i++) { const h = held[i], ha = akey(h.t.artist); if (!recentA.slice(-3).includes(ha) && !seen.has(songKey(h.t))) { out.push(h.t); seen.add(songKey(h.t)); recentA.push(ha); held.splice(i, 1); i--; } }
    if (out.length >= Math.ceil((o.n || 25) * 1.6)) break;
  }
  for (const h of held) { if (out.length >= Math.ceil((o.n || 25) * 1.6)) break; if (!seen.has(songKey(h.t))) { out.push(h.t); seen.add(songKey(h.t)); } }
  return verifySongs(out.map(dsAudioOf), o.n || 25);
}
const MIX_COLORS = ['#e8115b', '#1e3264', '#8d67ab', '#e1118c', '#148a08', '#bc5900', '#509bf5', '#dc148c'];
async function buildHome(onShelf) {
  const p = profile(), now = Date.now();
  const out = { at: now, day: dayKey(), mixes: [], dw: null };
  // Daily mixes: cluster by top artists
  const artists = Object.entries(p.ar).filter(([, s]) => s > 0.3).sort((a, b) => b[1] - a[1]).map(x => x[0]);
  const used = new Set(), usedIds = new Set(); let k = 0;
  for (const a of artists) {
    if (out.mixes.length >= 4) break;
    if (used.has(a)) continue;
    const seeds = topTracks(3, m => akey(m.artist) === a); if (!seeds.length) continue;
    const r = rng(dayKey() + a);
    const pick = weightedPick(seeds, 2, r);
    const c = await candidates(pick);
    seeds.forEach(id => c.set(id, (c.get(id) || 0) + 2));
    // cluster: artists that co-occur in this mix join the cluster so the next mix covers a different taste
    const list = await rank(c, { n: 25, seed: dayKey() + a, novelty: 'familiar', exclude: usedIds });
    if (list.length < 5) continue;
    const names = []; for (const t of list) { const ak = akey(t.artist); if (p.ar[ak] > 0) used.add(ak); const pa = primaryArtist(t.artist); if (!names.includes(pa)) names.push(pa); }
    used.add(a); list.slice(0, 12).forEach(t => { if (!seeds.includes(t.id)) usedIds.add(t.id); });
    const mix = { key: 'daily' + (k + 1), title: 'Daily Mix ' + (k + 1), sub: names.slice(0, 4).join(', ') + ' and more', ids: list.map(t => t.id), color: MIX_COLORS[k % MIX_COLORS.length] };
    out.mixes.push(mix); k++; onShelf && onShelf(out);
  }
  // Discover weekly
  const wk = weekKey(), prevDW = HOME && HOME.dw && HOME.dw.week === wk ? HOME.dw : null;
  if (prevDW) out.dw = prevDW;
  else {
    const seeds = weightedPick(topTracks(12), 5, rng(wk));
    if (seeds.length) {
      const c = await candidates(seeds);
      const list = await rank(c, { n: 30, seed: wk, novelty: 'new', pool: 120 });
      if (list.length) out.dw = { key: 'dw', week: wk, title: 'Discover Weekly', sub: 'New music picked for you every week', ids: list.map(t => t.id), color: '#509bf5' };
    }
  }
  onShelf && onShelf(out);
  return out;
}
/* Song radio — "more like what I'm hearing".
   The song you're on dominates. Its YouTube Mix (songs people play right after it)
   is the main signal; two hops from that mix and the last couple of songs you
   actually finished this session are folded in, so songs that show up across
   several related mixes (the "centre" of that sound) rank highest. Your overall
   taste only nudges the order a little (affinity 0.35), so the radio stays
   close to the current song instead of drifting to your usual favourites. */
async function radioFor(track, exclude = new Set()) {
  const c = new Map();
  // early positions in a Mix are the closest matches; the long tail drifts toward general hits
  const add = (ids, w) => (ids || []).slice(0, 60).forEach((id, pos) => c.set(id, (c.get(id) || 0) + w * Math.max(0.15, 1 - pos / 40)));
  const base = await getMix(track.id); add(base, 2);
  const recentGood = PS.session.filter(x => x.done && x.id !== track.id && Date.now() - x.t < 45 * 60e3).slice(-2).map(x => x.id);
  const hops = (base || []).slice(0, 3);
  const more = await pool([...recentGood, ...hops], 1, getMix);
  more.forEach((ids, k) => add(ids, k < recentGood.length ? 0.7 : 0.6));
  if (!c.size) return [];
  return rank(c, { n: 30, exclude, excludeSongs: [songKey(track)], affinity: 0.35, pool: 100, cluster: 0.5 });
}
function startRadio(t) { if (t) playQueue([t], 0, t.title + ' Radio', 'radio'); }

/* ───────────────────────── YouTube players ───────────────────────── */
let yt = null, ytReady = false;
window.onYouTubeIframeAPIReady = () => {
  const pv = { playsinline: 1, controls: 0, rel: 0, iv_load_policy: 3, fs: 0, disablekb: 1, modestbranding: 1, origin: location.origin };
  yt = new YT.Player('yt', { width: '100%', height: '100%', playerVars: pv, events: { onReady: () => { ytReady = true; }, onStateChange: onYTState, onError: onYTError } });
};
let mixChain = Promise.resolve();
function getMix(id) {
  const c = store.get('mix:' + id);
  if (c && Date.now() - c.at < 2 * DAY && c.ids.length) return Promise.resolve(c.ids);
  const p = mixChain.then(() => fetchMix(id));
  mixChain = p.catch(() => {});
  return p.then(ids => { store.set('mix:' + id, { at: Date.now(), ids }); return ids; }).catch(() => relatedViaApi(id));
}
async function fetchMix(id) {
  // A fresh hidden player per request: re-using one player returns stale lists.
  await waitFor(() => window.YT && YT.Player, 20000);
  return new Promise((res, rej) => {
    const host = document.createElement('div'); $('#ytfWrap').appendChild(host);
    const t0 = Date.now(); let p, iv, fin = false;
    const end = (ok, l) => { if (fin) return; fin = true; clearInterval(iv); clearTimeout(to); try { p.destroy(); } catch {} host.remove(); ok ? res(l.filter(x => x !== id)) : rej(new Error('mix failed')); };
    const to = setTimeout(() => end(false), 12000);
    p = new YT.Player(host, { width: 200, height: 200, playerVars: { listType: 'playlist', list: 'RD' + id, mute: 1, autoplay: 0, playsinline: 1, origin: location.origin },
      events: { onReady: () => { iv = setInterval(() => { let l = []; try { l = p.getPlaylist() || []; } catch {} if (l.length > 2) end(true, l.slice()); }, 200); }, onError: () => end(false) } });
  });
}
async function relatedViaApi(id) {
  const t = META[id]; if (!t) return [];
  try { return (await ytSearch(primaryArtist(t.artist) + ' songs')).map(x => x.id).filter(x => x !== id); } catch { return []; }
}
async function ytSearch(q) {
  const ck = 's:' + q.toLowerCase().trim();
  const c = store.get(ck);
  if (c && Date.now() - c.at < 7 * DAY) return c.ids.map(i => META[i]).filter(Boolean);
  const ts = (await jinaSearch(q)).map(v => { const t = trackFrom(v.id, v.title, v.ch); if (v.dur && !t.dur) t.dur = v.dur; return t; });
  saveMeta(); store.set(ck, { at: Date.now(), ids: ts.map(t => t.id) });
  return ts;
}
/* Keyless YouTube search: the Jina reader renders youtube.com/results and returns it as text. */
const parseDur = s => s ? String(s).split(':').reduce((a, b) => a * 60 + +b, 0) : 0;
async function jinaSearch(q) {
  const r = await fetch('https://r.jina.ai/https://www.youtube.com/results?search_query=' + encodeURIComponent(q), { headers: { 'X-Timeout': '12', 'X-Wait-For-Selector': 'ytd-video-renderer' } });
  if (!r.ok) throw new Error(r.status === 429 ? 'Too many searches, wait a minute' : 'search service ' + r.status);
  const md = await r.text(), out = [], seen = new Set();
  const re = /^### \[(.+?)\]\(https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})[^)]*\)/gm; let m;
  while ((m = re.exec(md))) {
    const id = m[2], title = m[1].replace(/\\([\[\]()_*#])/g, '$1');
    if (seen.has(id) || /^Mix\s*[-–]/.test(title)) continue; seen.add(id);
    const after = md.slice(re.lastIndex, re.lastIndex + 600), before = md.slice(Math.max(0, m.index - 800), m.index);
    const ch = after.match(/\[([^\]]+)\]\(https:\/\/www\.youtube\.com\/(?:channel\/|@)/);
    const seg = before.slice(before.lastIndexOf('[![Image')), d = seg.match(/\)\s+(\d{1,2}(?::\d{2}){1,2})\s/);
    out.push({ id, title, ch: ch ? ch[1].trim() : '', dur: d ? parseDur(d[1]) : 0 });
  }
  if (!out.length) throw new Error('no results');
  return out;
}

/* Apple's catalog: instant song search, charts and new releases (no key).
   These songs are matched to a YouTube video when you play them. */
const CC = () => (S.country || ((navigator.language || 'en-US').split('-')[1] || 'us')).toLowerCase().slice(0, 2);
const countryName = () => { try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(CC().toUpperCase()); } catch { return CC().toUpperCase(); } };
const amArt = u => String(u || '').replace(/\/\d+x\d+(bb)?\.(jpg|png)$/, '/600x600bb.jpg');
function amTrack(o) {
  const t = { id: 'am:' + o.id, title: o.title, artist: o.artist, art: amArt(o.art), dur: o.dur || 0, album: o.album || '', rel: o.rel || '', pending: true };
  META[t.id] = Object.assign(META[t.id] || {}, t); return META[t.id];
}
const amFromApi = x => amTrack({ id: x.trackId, title: x.trackName, artist: x.artistName, art: x.artworkUrl100, dur: (x.trackTimeMillis || 0) / 1000, album: x.collectionName, rel: x.releaseDate });
async function itunesSearch(q) {
  const r = await fetch(`https://itunes.apple.com/search?media=music&entity=song&limit=25&country=${CC()}&term=${encodeURIComponent(q)}`);
  const j = await r.json(); const out = (j.results || []).filter(x => x.trackId).map(amFromApi); saveMeta(); return out;
}
const GENRES = [[0, 'Top 50', '#1e3264'], [1263, 'Bollywood', '#e1118c'], [14, 'Pop', '#8d67ab'], [18, 'Hip-Hop', '#bc5900'], [1185, 'Indian Pop', '#e8115b'], [1264, 'Tamil', '#148a08'], [1265, 'Telugu', '#dc148c'], [1266, 'Regional Indian', '#477d95'], [1262, 'Indian', '#a56752'], [21, 'Rock', '#e91429'], [17, 'Dance', '#0d73ec'], [15, 'R&B / Soul', '#503750'], [20, 'Alternative', '#608108'], [7, 'Electronic', '#509bf5'], [51, 'K-Pop', '#e13300'], [1267, 'Devotional', '#7d4b32']];
const genreName = g => (GENRES.find(x => x[0] === +g) || [0, 'Top 50'])[1];
async function chart(genre = 0) {
  const ck = 'chart:' + CC() + ':' + genre, c = store.get(ck);
  if (c && Date.now() - c.at < 6 * 3600e3) { const l = c.ids.map(i => META[i]).filter(Boolean); if (l.length) return l; }
  const r = await fetch(`https://itunes.apple.com/${CC()}/rss/topsongs/limit=50${+genre ? '/genre=' + genre : ''}/json`);
  const j = await r.json(); let e = (j.feed && j.feed.entry) || []; if (!Array.isArray(e)) e = [e];
  const out = e.map(x => amTrack({ id: x.id.attributes['im:id'], title: x['im:name'].label, artist: x['im:artist'].label, art: x['im:image'][x['im:image'].length - 1].label, album: x['im:collection'] && x['im:collection']['im:name'] && x['im:collection']['im:name'].label, rel: x['im:releaseDate'] && x['im:releaseDate'].label }));
  saveMeta(); store.set(ck, { at: Date.now(), ids: out.map(t => t.id) }); return out;
}
async function releaseRadar() {
  const p = profile(), seen = new Set(), out = [], cutoff = Date.now() - 150 * DAY;
  const names = Object.entries(p.ar).filter(([, s]) => s > 0.3).sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([a]) => { const id = topTracks(1, m => akey(m.artist) === a)[0]; return id && primaryArtist(META[id].artist); }).filter(Boolean);
  for (const n of names) {
    try {
      const a = ((await (await fetch(`https://itunes.apple.com/search?entity=musicArtist&limit=3&country=${CC()}&term=${encodeURIComponent(n)}`)).json()).results || []).find(x => norm(x.artistName) === norm(n));
      if (!a) continue;
      const l = (await (await fetch(`https://itunes.apple.com/lookup?id=${a.artistId}&entity=song&sort=recent&limit=10&country=${CC()}`)).json()).results || [];
      l.filter(x => x.wrapperType === 'track' && Date.parse(x.releaseDate) > cutoff).slice(0, 4).forEach(x => { const t = amFromApi(x), k = songKey(t); if (!seen.has(k)) { seen.add(k); out.push(t); } });
    } catch {}
  }
  saveMeta();
  return out.sort((a, b) => Date.parse(b.rel) - Date.parse(a.rel));
}
// words that name a specific version, e.g. "(Dance Mix)", "(Lofi Flip)", "(Punjabi Version)"
const variantWords = title => (String(title).match(/[\(\[]([^\)\]]+)[\)\]]/g) || []).map(x => x.slice(1, -1)).filter(x => !/^(from|feat|ft\.|with)\b/i.test(x))
  .flatMap(x => x.toLowerCase().match(/[a-z]{3,}/g) || []).filter(w => !['version', 'the', 'and', 'from', 'original'].includes(w));
function pickBest(t, list) {
  const nt = norm(cleanForSearch(t.title)), na = norm(primaryArtist(t.artist)), vw = variantWords(t.title);
  const variant = vw.length > 0 || /\b(live|remix|cover|acoustic|unplugged|lofi|slowed|reprise)\b/i.test(t.title);
  let best = null, bs = -1e9;
  list.forEach((v, i) => {
    const raw = v.raw || v.title || '', tt = norm(raw), ch = norm(v.ch || '');
    let s = -i * 0.15;
    if (nt && tt.includes(nt)) s += 3; else if (nt && nt.length > 4 && nt.includes(norm(v.title))) s += 1;
    if (na && (tt.includes(na) || ch.includes(na))) s += 2;
    if (/\s-\stopic$/i.test(v.ch || '')) s += 2.5;            // auto-generated studio audio: exactly the song
    else if (/vevo$/i.test(v.ch || '')) s += 1;
    if (/official audio|\((full )?audio\)|\[audio\]|audio song|full audio/i.test(raw)) s += 1.5;
    if (JUNK_RE.test(raw) && !JUNK_RE.test(t.title)) s -= 5;
    if (t.dur && v.dur) { const d = Math.abs(t.dur - v.dur); s += d < 4 ? 2 : d < 15 ? 1 : d > 90 ? -3 : 0; }
    if (!variant && /\b(live|cover|karaoke|8d|slowed|reverb|sped\s*up|nightcore|instrumental|remix|reaction|1 hour|10 hours|teaser|trailer|lofi|lo-fi|status|ringtone)\b/i.test(raw)) s -= 3;
    if (v.dur > 900) s -= 4;
    if (vw.length) { const lr = raw.toLowerCase(); s += vw.every(w => lr.includes(w)) ? 2 : -3; }
    if (s > bs) { bs = s; best = v; }
  });
  return bs >= 1 ? best : null;
}
/* ───────── Song catalog: data/songs.tsv ─────────
   Indian and English songs with their YouTube IDs (Wikidata, curated
   playlists and chart songs, grown weekly by .github/workflows/dataset.yml).
   Searching it is instant and needs no network after the first load, and
   matched songs play straight away. */
const JUNK_RE = /\b(making|behind the scenes|bts|teaser|trailer|promo|interview|reaction|karaoke|8d|slowed|reverb|nightcore|sped\s*up|jukebox|full album|dialogue|scene|status|ringtone|1 hour|10 hours|full movie|episode|vlog|unboxing|tutorial|dance cover|shorts)\b|#shorts/i;
const DS = { rows: null, byKey: null, loading: null, jp: null, meta: null };
const dsKey = (artist, title) => norm(primaryArtist(artist)) + '|' + norm(cleanForSearch(title));
function dsParse(text) {
  const out = [];
  for (const line of text.split('\n')) { const p = line.split('\t'); if (p.length < 3 || p[0] === 'id') continue; p.nt = norm(p[1]); p.na = norm(p[2]); out.push(p); }
  return out;
}
function loadDS(jp) {
  return DS.loading || (DS.loading = fetch('data/meta.json', { cache: 'no-cache' }).then(r => r.json()).catch(() => ({}))
    .then(m => { DS.meta = m; return fetch('data/songs.tsv?u=' + (m.updated || '')); }).then(r => r.ok ? r.text() : '')
    .then(t => {
      DS.rows = dsParse(t); DS.byKey = new Map(); DS.byId = new Map(DS.rows.map(p => [p[0], p]));
      for (const p of DS.rows) { const k = dsKey(p[2], p[1]), e = DS.byKey.get(k); if (!e || (p[5] === 'a' && e[5] !== 'a')) DS.byKey.set(k, p); }
      return DS.rows;
    }).catch(() => (DS.rows = [])));
}
function dsTrack(p) {
  if (!META[p[0]] || !META[p[0]].fixed) META[p[0]] = Object.assign(META[p[0]] || {}, { id: p[0], title: p[1], artist: p[2], year: p[3], kind: p[5], dur: +p[6] || 0, fixed: true });
  return META[p[0]];
}
async function dsFind(t) {
  await loadDS(); if (!DS.byKey) return null;
  let p = DS.byKey.get(dsKey(t.artist, t.title));
  if (!p) {
    // playlist songs keep the video's wording ("Kesariya | Brahmastra | Arijit Singh"): title + an artist inside it
    const nt = norm(cleanForSearch(t.title)), arts = String(t.artist).split(/,|&|\bx\b|feat\.?|ft\.?/i).map(norm).filter(a => a.length > 2);
    if (nt.length >= 4 && arts.length) {
      let best = 0;
      for (const r of DS.rows) {
        if (!r.nt.includes(nt)) continue;
        const hay = r.nt + r.na; if (!arts.some(a => hay.includes(a))) continue;
        const sc = (r.nt === nt ? 3 : r.nt.startsWith(nt) ? 2 : 1) + (r[5] === 'a' ? 0.5 : 0) + (t.dur && +r[6] ? (Math.abs(t.dur - +r[6]) < 15 ? 1 : -2) : 0);
        if (sc > best) { best = sc; p = r; }
      }
      if (best < 1) p = null;
    }
  }
  return p ? dsTrack(p) : null;
}
// the catalog's audio upload of the same song, if it has one (keeps likes/history on the original id otherwise)
function dsAudioOf(t) {
  if (!DS.byKey || !t || t.kind === 'a') return t;
  const p = DS.byKey.get(dsKey(t.artist, t.title));
  return p && p[5] === 'a' && p[0] !== t.id ? dsTrack(p) : t;
}
async function dsSearch(q, n = 20) {
  const rows = await loadDS();
  const toks = q.toLowerCase().split(/\s+/).map(norm).filter(Boolean); if (!toks.length) return [];
  const nq = norm(q), hits = [];
  for (const p of rows) {
    const hay = p.nt + '\u0001' + p.na;
    if (!toks.every(k => hay.includes(k))) continue;
    let sc = 0;
    if (p.nt === nq) sc += 6; else if (p.nt.startsWith(nq)) sc += 3;
    if (p.na === nq) sc += 4; else if (p.na.startsWith(nq)) sc += 2;
    if (toks.every(k => p.nt.includes(k))) sc += 1;
    if (p[5] === 'a') sc += 0.3;
    sc += Math.min(1, Math.max(0, (+p[3] || 1990) - 1990) / 35);   // gently favour newer songs
    hits.push([sc, p]);
  }
  hits.sort((a, b) => b[0] - a[0]);
  const seen = new Set(), out = [];
  for (const [, p] of hits) { const k = dsKey(p[2], p[1]); if (seen.has(k)) continue; seen.add(k); out.push(dsTrack(DS.byKey && DS.byKey.get(k) || p)); if (out.length >= n) break; }
  return out;
}
/* ───────── Is this actually a song? ─────────
   Echo only plays songs. A track counts as a song when it's in the song
   catalog, or Apple Music has a song with the same title by an artist named
   in the video. Anything else (making-of clips, teasers, interviews,
   reactions, fan edits…) is dropped, and while playing, a track whose length
   doesn't fit a song is skipped. */
const LABEL_RE = /^(t-?series|yrf|yash raj|saregama|sony music|zee music|tips|speed records|eros|venus|shemaroo|times music|desi music|white hill|aditya music|lahari|think music|sun ?tv|universal music|warner music|red chillies|rajshri|.*records|.*vevo)/i;
const isVerified = t => !t || t.pending || String(t.id).startsWith('local:') || (DS.byId && DS.byId.has(t.id)) || (t.fixed && !t.unv);
async function verifySong(t) {
  if (!t) return null;
  if (t.pending || String(t.id).startsWith('local:')) return t;
  await loadDS().catch(() => {});
  const row = DS.byId && DS.byId.get(t.id); if (row) return dsTrack(row);
  if (t.fixed && !t.unv) return t;
  const ck = 'ver:' + t.id, c = store.get(ck);
  if (c) return c.ok ? t : null;
  const raw = t.raw || t.title || '';
  const fail = () => { store.set(ck, { at: Date.now(), ok: false }); return null; };
  if (JUNK_RE.test(raw)) return fail();
  const same = DS.byKey && DS.byKey.get(dsKey(t.artist, t.title));
  if (same) return dsTrack(same);                       // the catalog's upload of this song
  const title = cleanForSearch(t.title), label = LABEL_RE.test(t.artist) || LABEL_RE.test(t.ch || '');
  const r = await fetch(`https://itunes.apple.com/search?media=music&entity=song&limit=10&country=${CC()}&term=${encodeURIComponent(label ? title : primaryArtist(t.artist) + ' ' + title)}`);
  if (!r.ok) throw new Error('itunes ' + r.status);    // busy: leave it unchecked for now
  const res = (await r.json()).results || [];
  const nr = norm(raw + ' ' + (t.ch || '') + ' ' + t.artist);
  const hit = res.find(x => {
    const nt = norm(cleanForSearch(x.trackName)); if (nt.length < 2 || !nr.includes(nt)) return false;
    const arts = String(x.artistName).split(/,|&|\bx\b|feat\.?|ft\.?/i).map(norm).filter(a => a.length > 2);
    const film = norm(cleanForSearch(x.collectionName || ''));
    return arts.some(a => nr.includes(a)) || (film.length > 3 && nr.includes(film));
  });
  if (!hit) return fail();
  Object.assign(t, { title: hit.trackName, artist: hit.artistName, art: amArt(hit.artworkUrl100), dur: (hit.trackTimeMillis || 0) / 1000, fixed: true }); delete t.unv; saveMeta();
  store.set(ck, { at: Date.now(), ok: true });
  return t;
}
async function verifySongs(list, n) {
  await loadDS().catch(() => {});
  const out = []; let budget = 14;                     // network checks per list; the rest are checked right before they play
  for (const t of list) {
    if (out.length >= n) break;
    const net = !isVerified(t) && !store.get('ver:' + t.id) && !(DS.byKey && DS.byKey.get(dsKey(t.artist, t.title)));
    let v;
    if (net && budget <= 0) { t.unv = true; v = t; }
    else { if (net) budget--; try { v = await verifySong(t); } catch { t.unv = true; v = t; } }
    if (v && !out.some(x => x.id === v.id)) out.push(v);
  }
  return out;
}
// while playing: a "song" that is 40 s or 25 min long, or far off the known length, isn't the song
function wrongLength(t, d) {
  if (!d || !t) return false;
  if (t.dur) return Math.abs(d - t.dur) > Math.max(120, t.dur * 0.5);
  return d < 60 || d > 900;
}
const resolving = {};
function resolveYT(t) {
  if (!t || !t.pending) return Promise.resolve(t);
  const m = store.get('map:' + t.id);
  if (m && META[m.yt]) return Promise.resolve(META[m.yt]);
  return resolving[t.id] || (resolving[t.id] = (async () => {
    const hit = await dsFind(t).catch(() => null);
    if (hit) { store.set('map:' + t.id, { yt: hit.id }); return hit; }
    const list = await ytSearch([primaryArtist(t.artist), cleanForSearch(t.title), ...variantWords(t.title)].join(' '));
    const best = pickBest(t, list); if (!best) throw new Error('not found');
    // first match wins: another Apple version that maps to the same video must not rename it
    const r = META[best.id] && META[best.id].fixed ? META[best.id] : (META[best.id] = Object.assign(META[best.id] || {}, { id: best.id, title: t.title, artist: t.artist, art: t.art, album: t.album, dur: t.dur || 0, fixed: true }));
    saveMeta(); store.set('map:' + t.id, { yt: best.id }); return r;
  })().finally(() => delete resolving[t.id]));
}
const ytId = s => { s = String(s || '').trim(); const m = s.match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([\w-]{11})/); if (m) return m[1]; return /^[\w-]{11}$/.test(s) && /[A-Z0-9_-]/.test(s) && /[a-z]/.test(s) ? s : null; };

/* ───────────────────────── playback ───────────────────────── */
const lv = $('#lv');
const PS = { q: [], i: -1, ctx: '', ctxKey: '', src: null, playing: false, shuffle: false, repeat: 0, logged: false, startT: 0, orig: null, url: null, session: [], auto: new Set(), skipRun: 0 };
const cur = () => PS.q[PS.i] || null;
function curTime() { if (PS.src === 'local') return lv.currentTime || 0; try { return yt && yt.getCurrentTime ? yt.getCurrentTime() || 0 : 0; } catch { return 0; } }
function curDur() { if (PS.src === 'local') return isFinite(lv.duration) ? lv.duration : 0; try { return yt && yt.getDuration ? yt.getDuration() || 0 : 0; } catch { return 0; } }
function playQueue(tracks, i = 0, ctx = '', ctxKey = '') {
  PS.q = tracks.filter(Boolean).slice(); PS.i = Math.max(0, Math.min(i, PS.q.length - 1)); PS.ctx = ctx; PS.ctxKey = ctxKey; PS.orig = null; PS.auto = new Set(); PS.skipRun = 0;
  if (PS.shuffle) { const c = PS.q.splice(PS.i, 1)[0]; shuffleArr(PS.q); PS.q.unshift(c); PS.i = 0; }
  loadCur(true);
}
function shuffleArr(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
async function loadCur(autoplay = true) {
  let t = cur(); if (!t) return;
  if (t.pending) {
    renderPlayer(); $('#miniArtist').textContent = 'Finding on YouTube…';
    try { const r = await resolveYT(t); if (cur() !== t) return; PS.q[PS.i] = r; t = r; }
    catch (e) { if (cur() !== t) return; toast(`Couldn't find “${t.title}” on YouTube — skipping`); PS.q.splice(PS.i, 1); if (PS.i < PS.q.length) return loadCur(autoplay); return; }
  }
  if (!isVerified(t)) {
    let v; try { v = await verifySong(t); } catch { v = t; }   // can't check right now: allow, the length check still applies
    if (cur() !== t) return;
    if (!v) { PS.q.splice(PS.i, 1); if (PS.i < PS.q.length) return loadCur(autoplay); return; }
    if (v !== t) { PS.q[PS.i] = v; t = v; }
  }
  PS.logged = false; PS.startT = Date.now(); PS.dlAsked = false; PS.lenChecked = false;
  $('#tapHint').hidden = true;
  const localKey = await pickLocal(t);
  if (PS.url) { URL.revokeObjectURL(PS.url); PS.url = null; }
  if (localKey) {
    try { yt && yt.pauseVideo && yt.pauseVideo(); } catch {}
    const rec = await idb.get(localKey);
    if (rec) { PS.src = 'local'; PS.url = URL.createObjectURL(rec.blob); lv.src = PS.url; if (autoplay) lv.play().catch(() => toast('Tap play to start')); }
  } else if (String(t.id).startsWith('local:')) { toast('That local file is no longer on this device'); return; }
  else {
    lv.pause(); lv.removeAttribute('src'); lv.load();
    PS.src = 'yt';
    try { await waitFor(() => ytReady, 15000); } catch { toast('YouTube player failed to load — check your connection'); return; }
    if (autoplay) yt.loadVideoById(t.id); else yt.cueVideoById(t.id);
    if (autoplay) setTimeout(() => { if (cur() === t && PS.src === 'yt') { let st; try { st = yt.getPlayerState(); } catch {} if (st !== 1 && st !== 3) { $('#tapHint').hidden = false; if (!$('#np').classList.contains('open')) openNP(); setMode('video', true); } } }, 3500);
  }
  renderPlayer(); loadLyrics(t); setMediaSession(t); paintColor(t);
  const nx = PS.q[PS.i + 1]; if (nx) (nx.pending ? resolveYT(nx) : verifySong(nx)).catch(() => {});
  if (S.autoplay && PS.i >= PS.q.length - 2) extendQueue();
}
async function pickLocal(t) {
  const d = DLX[t.id]; if (!d) return null;
  if (!S.preferLocal && navigator.onLine && !String(t.id).startsWith('local:')) return null;
  const want = d.audio ? 'audio' : 'video';
  return d[want] ? t.id + ':' + want : null;
}
let extending = false;
async function extendQueue() {
  if (extending) return; const t = cur(); if (!t || String(t.id).startsWith('local:')) return;
  extending = true;
  try {
    const ex = new Set(PS.q.map(x => x.id));
    const more = await radioFor(t, ex);
    const keys = new Set(PS.q.map(songKey));
    more.filter(m => !keys.has(songKey(m))).slice(0, PS.q.length - PS.i <= 2 ? 25 : 15).forEach(m => { PS.q.push(m); PS.auto.add(m.id); });
    renderQueueSheetIfOpen();
  } catch {} finally { extending = false; }
}
function onStarted() {
  const t = cur(); if (!t || PS.logged) return; PS.logged = true; logEv('play', t); bumpRecent(t.id);
  PS.session.push({ id: t.id, t: Date.now(), done: false }); if (PS.session.length > 20) PS.session.shift();
}
function markDone(t) { const s = PS.session.slice().reverse().find(x => x.id === t.id); if (s) s.done = true; }
function onEnded() { const t = cur(); logEv('done', t); if (t) markDone(t); PS.skipRun = 0; if (PS.repeat === 2) { seekTo(0); play(); return; } next(false); }
function next(user = true) {
  const t = cur();
  if (user && t && curTime() < 30 && curDur() > 45) {
    logEv('skip', t); PS.skipRun++;
    // adapt like Spotify radio: drop queued radio picks by the artist you just skipped…
    const a = akey(t.artist);
    PS.q = PS.q.filter((x, k) => k <= PS.i || !PS.auto.has(x.id) || akey(x.artist) !== a);
    // …and after two skips in a row, re-steer the rest of the radio from the last song you finished
    if (PS.skipRun >= 2) {
      PS.q = PS.q.filter((x, k) => k <= PS.i + 1 || !PS.auto.has(x.id));
      const good = PS.session.slice().reverse().find(x => x.done);
      if (good && META[good.id]) radioFor(META[good.id], new Set(PS.q.map(x => x.id))).then(l => { l.slice(0, 20).forEach(m => { PS.q.push(m); PS.auto.add(m.id); }); renderQueueSheetIfOpen(); }).catch(() => {});
      PS.skipRun = 0;
    }
  } else if (user && t && curTime() >= 60) { markDone(t); PS.skipRun = 0; }
  if (PS.i < PS.q.length - 1) { PS.i++; loadCur(); }
  else if (PS.repeat === 1 && PS.q.length) { PS.i = 0; loadCur(); }
  else if (S.autoplay) { extendQueue().then(() => { if (PS.i < PS.q.length - 1) { PS.i++; loadCur(); } else { pause(); } }); toast('Finding more songs…'); }
  else pause();
}
function prev() { if (curTime() > 3 || PS.i === 0) seekTo(0); else { PS.i--; loadCur(); } }
function play() { if (PS.src === 'local') lv.play().catch(() => {}); else try { yt.playVideo(); } catch {} }
function pause() { if (PS.src === 'local') lv.pause(); else try { yt.pauseVideo(); } catch {} }
function toggle() { if (!cur()) return; PS.playing ? pause() : play(); }
function seekTo(s) { if (PS.src === 'local') lv.currentTime = s; else try { yt.seekTo(s, true); } catch {} }
function onYTState(e) {
  if (PS.src !== 'yt') return;
  if (e.data === 1) {
    PS.playing = true; $('#tapHint').hidden = true;
    const t = cur(), d = curDur();
    if (!PS.lenChecked && d) { PS.lenChecked = true; if (wrongLength(t, d)) { store.set('ver:' + t.id, { at: Date.now(), ok: false }); toast(`Skipped “${t.title}”: that upload isn't the song`, 2500); next(false); return; } }
    onStarted();
  }
  else if (e.data === 2 || e.data === -1 || e.data === 5) PS.playing = false;
  else if (e.data === 0) { PS.playing = false; onEnded(); }
  renderPP();
}
function onYTError(e) {
  if (PS.src !== 'yt') return;
  const t = cur();
  toast((e.data === 101 || e.data === 150) ? `"${t ? t.title : 'This video'}" can't be played outside YouTube — skipping` : 'Playback error — skipping');
  setTimeout(() => next(false), 900);
}
lv.addEventListener('playing', () => { PS.playing = true; onStarted(); renderPP(); });
lv.addEventListener('pause', () => { PS.playing = false; renderPP(); });
lv.addEventListener('ended', () => { PS.playing = false; onEnded(); });
function bumpRecent(id) { const r = store.get('recent', []).filter(x => x !== id); r.unshift(id); store.set('recent', r.slice(0, 60)); }

/* media session (lock screen / headphone controls) */
function setMediaSession(t) {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artist, album: PS.ctx || 'Echo', artwork: [{ src: thumb(t.id, 'hqdefault'), sizes: '480x360', type: 'image/jpeg' }] });
    const h = { play, pause, nexttrack: () => next(true), previoustrack: prev, seekto: d => seekTo(d.seekTime), seekbackward: () => seekTo(curTime() - 10), seekforward: () => seekTo(curTime() + 10) };
    for (const [k, f] of Object.entries(h)) navigator.mediaSession.setActionHandler(k, f);
  } catch {}
}
setInterval(() => {
  const d = curDur(), c = curTime();
  if (cur()) {
    const pct = d ? c / d * 100 : 0;
    $('#miniBar').style.width = pct + '%';
    if (!seeking) { $('#seek').value = d ? Math.round(c / d * 1000) : 0; $('#seek').style.setProperty('--p', pct + '%'); $('#tCur').textContent = fmt(c); }
    $('#tDur').textContent = fmt(d);
    syncLyrics(c);
    if (S.autoDl && PS.playing && !PS.dlAsked && c > 30 && PS.src === 'yt') { PS.dlAsked = true; queueDl(cur()); }
    if ('mediaSession' in navigator && d && PS.playing) try { navigator.mediaSession.setPositionState({ duration: d, position: Math.min(c, d), playbackRate: 1 }); } catch {}
    if (PS.src === 'yt' && ytReady) { try { const st = yt.getPlayerState(); const pl = st === 1 || st === 3; if (pl !== PS.playing) { PS.playing = pl; renderPP(); } } catch {} }
  }
}, 400);

/* ───────────────────────── player UI ───────────────────────── */
let seeking = false;
function renderPP() {
  const h = ic(PS.playing ? 'pause' : 'play');
  $('#pp').innerHTML = h; $('#miniPP').innerHTML = h;
  if ('mediaSession' in navigator) try { navigator.mediaSession.playbackState = PS.playing ? 'playing' : 'paused'; } catch {}
  $$('.row').forEach(r => r.classList.toggle('cur', !!cur() && r.dataset.id === cur().id));
}
function renderLike() {
  const t = cur(), on = t && likeSet.has(t.id);
  for (const b of [$('#npLike'), $('#miniLike')]) { b.innerHTML = ic(on ? 'heartF' : 'heart'); b.classList.toggle('on', !!on); }
}
function renderPlayer() {
  const t = cur(); $('#mini').hidden = !t; if (!t) return;
  $('#miniArt').src = thumb(t.id); $('#miniTitle').textContent = t.title; $('#miniArtist').textContent = t.artist;
  $('#npArt').src = thumb(t.id, 'hqdefault'); $('#npTitle').textContent = t.title; $('#npArtist').textContent = t.artist;
  $('#npCtx').textContent = PS.ctx || 'Echo';
  $('#np').classList.toggle('local', PS.src === 'local');
  $('#shuf').classList.toggle('on', PS.shuffle);
  $('#rep').classList.toggle('on', PS.repeat > 0); $('#rep').classList.toggle('one', PS.repeat === 2);
  const d = DLX[t.id]; $('#npDl').innerHTML = ic(d ? 'dlDone' : 'dl'); $('#npDl').classList.toggle('on', !!d);
  renderLike(); renderPP(); setMode(S.mode);
}
function setMode(m, temp) {
  if (!temp) m = 'audio';   // audio-only app; video is shown only briefly when a phone needs one tap on the player to start
  $('#np').classList.toggle('video', m === 'video');
  $$('#npMode button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
}
function openNP() { const np = $('#np'); if (np.classList.contains('open')) return; np.classList.add('open'); np.setAttribute('aria-hidden', 'false'); history.pushState({ np: 1 }, ''); }
function closeNP(fromPop) { const np = $('#np'); if (!np.classList.contains('open')) return; np.classList.remove('open'); np.setAttribute('aria-hidden', 'true'); if (!fromPop && history.state && history.state.np) history.back(); }
function paintColor(t) {
  const img = new Image(); img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      const c = document.createElement('canvas'); c.width = c.height = 16; const x = c.getContext('2d'); x.drawImage(img, 0, 0, 16, 16);
      const d = x.getImageData(0, 0, 16, 16).data; let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) { const s = Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]); const w = 1 + s / 40; r += d[i] * w; g += d[i + 1] * w; b += d[i + 2] * w; n += w; }
      r /= n; g /= n; b /= n; const L = 0.299 * r + 0.587 * g + 0.114 * b, k = L > 120 ? 120 / L : L < 50 ? 60 / Math.max(L, 1) : 1;
      const col = `rgb(${Math.min(255, r * k) | 0},${Math.min(255, g * k) | 0},${Math.min(255, b * k) | 0})`;
      document.documentElement.style.setProperty('--npc', col);
      $('#lyr').style.setProperty('--lc', `rgb(${Math.min(255, r * k * .8) | 0},${Math.min(255, g * k * .8) | 0},${Math.min(255, b * k * .8) | 0})`);
    } catch {}
  };
  img.src = thumb(t.id);
}
function toggleLike(t) {
  if (!t) return;
  if (likeSet.has(t.id)) { likeSet.delete(t.id); LIKES.splice(LIKES.indexOf(t.id), 1); toast('Removed from Liked Songs'); }
  else { likeSet.add(t.id); LIKES.push(t.id); toast('Added to Liked Songs'); }
  store.set('likes', LIKES); noteLike(t.id, likeSet.has(t.id)); PROF = null; renderLike();
  if (route().name === 'list' && route().arg === 'liked') renderView();
}

/* ───────────────────────── lyrics ─────────────────────────
   From lrclib.net (free, no key): time-synced lines that follow the song when
   available (tap a line to jump there), plain lyrics otherwise. */
const LY = { id: null, synced: null, plain: null, status: 'loading' };
const cleanForSearch = s => String(s).replace(/\s*[\(\[].*?[\)\]]/g, '').replace(/\s+(ft|feat|featuring)\.?\s.*$/i, '').replace(/["“”]/g, '').trim();
async function loadLyrics(t) {
  Object.assign(LY, { id: t.id, synced: null, plain: null, status: 'loading' }); renderLyrics();
  if (String(t.id).startsWith('local:')) { LY.status = 'none'; renderLyrics(); return; }
  const id = t.id;
  try { const r = await lrclib(t); if (LY.id !== id) return; LY.synced = r.synced; LY.plain = r.plain; LY.status = r.synced || r.plain ? 'ok' : 'none'; }
  catch { if (LY.id !== id) return; LY.status = 'none'; }
  renderLyrics();
}
async function lrclib(t) {
  const ck = 'lrc:' + t.id, c = store.get(ck);
  if (c && Date.now() - c.at < 30 * DAY) return c;
  const title = cleanForSearch(t.title), artist = primaryArtist(t.artist);
  let j = null;
  try { const r = await fetch('https://lrclib.net/api/get?track_name=' + encodeURIComponent(title) + '&artist_name=' + encodeURIComponent(artist)); if (r.ok) j = await r.json(); } catch {}
  if (!j || !(j.syncedLyrics || j.plainLyrics)) {
    const r = await fetch('https://lrclib.net/api/search?q=' + encodeURIComponent(title + ' ' + artist));
    const arr = r.ok ? await r.json() : [];
    j = arr.find(x => x.syncedLyrics && norm(x.trackName).includes(norm(title))) || arr.find(x => x.plainLyrics && norm(x.trackName).includes(norm(title))) || null;
  }
  const out = { at: Date.now(), synced: j && j.syncedLyrics ? parseLRC(j.syncedLyrics) : null, plain: j && j.plainLyrics ? j.plainLyrics.split('\n') : null };
  store.set(ck, out); return out;
}
function parseLRC(s) {
  const out = [];
  for (const line of s.split('\n')) { const m = [...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)]; const txt = line.replace(/\[[^\]]*\]/g, '').trim(); for (const x of m) out.push({ t: +x[1] * 60 + +x[2], s: txt }); }
  return out.sort((a, b) => a.t - b.t);
}
function renderLyrics() {
  const b = $('#lyrBody'); b.className = 'lyr-body';
  if (LY.status === 'loading') { b.innerHTML = '<span class="ln" style="opacity:.6">Loading…</span>'; return; }
  if (LY.synced && LY.synced.length) {
    b.innerHTML = LY.synced.map((l, i) => `<span class="sy" data-i="${i}" data-t="${l.t}">${esc(l.s) || '♪'}</span>`).join('') + '<span class="src">Lyrics: lrclib.net · tap a line to jump there</span>';
    $$('.sy', b).forEach(x => x.onclick = () => seekTo(+x.dataset.t));
    lastSy = -1; syncLyrics(curTime(), true);
  } else if (LY.plain) {
    b.innerHTML = LY.plain.map(l => l.trim() ? `<span class="ln">${esc(l)}</span>` : '<span class="ln">&nbsp;</span>').join('') + '<span class="src">Lyrics: lrclib.net</span>';
  } else b.innerHTML = '<span class="ln" style="opacity:.7">No lyrics found for this song.</span>';
}
let lastSy = -1;
function syncLyrics(t, force) {
  if (!LY.synced || !LY.synced.length) return;
  let k = -1; for (let i = 0; i < LY.synced.length; i++) { if (LY.synced[i].t <= t + 0.25) k = i; else break; }
  if (k === lastSy && !force) return; lastSy = k;
  $$('#lyrBody .sy').forEach((el, i) => { el.classList.toggle('now', i === k); el.classList.toggle('past', i < k); });
  const el = $(`#lyrBody .sy[data-i="${k}"]`), np = $('#np');
  if (el && np.classList.contains('open')) { const r = el.getBoundingClientRect(); if (r.top < 80 || r.bottom > innerHeight - 120) np.scrollBy({ top: r.top - innerHeight * 0.4, behavior: 'smooth' }); }
}

/* ───────────────────────── sync: phone ⇄ laptop ─────────────────────────
   Likes, history and playlists are merged through a private GitHub gist.
   The laptop service downloads your songs and puts the ones this phone doesn't
   have yet into an "inbox" in your private echo-music repo; Echo copies them
   from there into its own storage so they play offline, reports what it has,
   and the laptop clears them from the inbox. Needs one GitHub token (gist + repo). */
const SYNC_DESC = 'Echo sync (private)', SYNC_FILE = 'echo-sync.json';
const LIKE_TS = store.get('likeTs', {});            // id -> [liked 1/0, time changed]
let LAPTOP = store.get('laptop', null);              // { name, at } — when the laptop service last checked in
let STORE = store.get('inboxStore', null);           // { repo, inbox: { videoId: blobSha } }
const DEV = store.get('dev') || (() => { const d = 'd' + Math.random().toString(36).slice(2, 10); store.set('dev', d); return d; })();
const REQ = new Set(store.get('dlReq', []));          // songs this device asked the laptop to download
let syncT = null, syncing = null;
function noteLike(id, on) { LIKE_TS[id] = [on ? 1 : 0, Date.now()]; store.set('likeTs', LIKE_TS); scheduleSync(); }
function scheduleSync(ms = 5000) { if (!S.ghToken) return; clearTimeout(syncT); syncT = setTimeout(syncNow, ms); }
async function ghApi(path, opt = {}) {
  const r = await fetch('https://api.github.com' + path, Object.assign({}, opt, { headers: Object.assign({ Authorization: 'Bearer ' + S.ghToken, Accept: 'application/vnd.github+json' }, opt.body ? { 'Content-Type': 'application/json' } : {}) }));
  if (r.status === 401) throw new Error('GitHub token was rejected');
  if (!r.ok) throw new Error('GitHub ' + r.status);
  return r.json();
}
async function syncGist() {
  let id = store.get('syncGist'); if (id) return id;
  const g = (await ghApi('/gists?per_page=100')).find(x => x.description === SYNC_DESC && x.files[SYNC_FILE]);
  id = g ? g.id : (await ghApi('/gists', { method: 'POST', body: JSON.stringify({ description: SYNC_DESC, public: false, files: { [SYNC_FILE]: { content: '{"v":1}' } } }) })).id;
  store.set('syncGist', id); return id;
}
function syncNow() {
  if (!S.ghToken) return Promise.resolve();
  return syncing || (syncing = (async () => {
    const gid = await syncGist();
    const g = await ghApi('/gists/' + gid);
    const f = g.files[SYNC_FILE] || {};
    let text = f.content || '{}'; if (f.truncated && f.raw_url) text = await (await fetch(f.raw_url)).text();
    let R = {}; try { R = JSON.parse(text); } catch {}
    const before = JSON.stringify(R);
    // likes: the newest change wins on both devices
    for (const id of LIKES) if (!LIKE_TS[id]) LIKE_TS[id] = [1, 0];
    for (const [id, v] of Object.entries(R.likes || {})) if (!LIKE_TS[id] || v[1] > LIKE_TS[id][1]) LIKE_TS[id] = v;
    LIKES.length = 0; likeSet.clear();
    Object.entries(LIKE_TS).filter(([, v]) => v[0]).sort((a, b) => a[1][1] - b[1][1]).forEach(([id]) => { LIKES.push(id); likeSet.add(id); });
    store.set('likes', LIKES); store.set('likeTs', LIKE_TS); R.likes = LIKE_TS;
    // history: everything from both devices
    const key = e => e.i + '|' + e.k + '|' + e.t, have = new Set(EV.map(key));
    for (const r of R.ev || []) { const e = { i: r[0], a: r[1], k: r[2], t: r[3] }; if (!have.has(key(e))) { EV.push(e); have.add(key(e)); } }
    EV.sort((a, b) => a.t - b.t); if (EV.length > 5000) EV.splice(0, EV.length - 5000);
    store.set('ev', EV); PROF = null; R.ev = EV.map(e => [e.i, e.a, e.k, e.t]);
    // playlists: newest version of each wins (deleted ones are kept as a marker)
    for (const [id, pl] of Object.entries(R.pl || {})) if (!PL[id] || (pl.at || 0) > (PL[id].at || 0)) PL[id] = pl;
    store.set('pl', PL); R.pl = PL;
    // song names so the other device can show them
    R.meta = R.meta || {};
    for (const [id, m] of Object.entries(R.meta)) if (!META[id]) META[id] = { id, title: m[0], artist: m[1], art: m[2] || undefined, fixed: true };
    for (const id of new Set([...LIKES, ...EV.map(e => e.i), ...Object.values(PL).flatMap(x => x.ids || [])])) {
      const m = META[id]; if (m && m.title && !R.meta[id] && !String(id).startsWith('local:') && !m.pending) R.meta[id] = [m.title, m.artist || '', m.art || ''];
    }
    saveMeta();
    const rec = [...new Set([...store.get('recent', []), ...(R.recent || [])])].slice(0, 60); store.set('recent', rec); R.recent = rec;
    if (R.laptop) { LAPTOP = R.laptop; store.set('laptop', LAPTOP); }
    if (R.store) { STORE = R.store; store.set('inboxStore', STORE); }
    // what this device already has (so the laptop can clear its inbox) and what it asked for
    for (const id of [...REQ]) if (DLX[id]) REQ.delete(id);
    store.set('dlReq', [...REQ]);
    const local = await helperUp();
    R.have = R.have || {}; R.have[DEV] = { ids: Object.keys(DLX).filter(i => /^[\w-]{11}$/.test(i)).sort(), local, at: (R.have[DEV] && R.have[DEV].at) || 0 };
    R.req = R.req || {}; if (REQ.size) R.req[DEV] = [...REQ]; else delete R.req[DEV];
    if (JSON.stringify(R) !== before) R.have[DEV].at = Date.now();
    R.v = 1;
    if (JSON.stringify(R) !== before) await ghApi('/gists/' + gid, { method: 'PATCH', body: JSON.stringify({ files: { [SYNC_FILE]: { content: JSON.stringify(R) } } }) });
    store.set('lastSync', Date.now()); store.del('syncErr');
    pullFromLaptop();
  })().catch(e => { store.set('syncErr', e.message); }).finally(() => { syncing = null; }));
}
// songs worth keeping: liked, finished, or played without skipping (newest first)
function wantedIds() {
  const skipped = new Set(), played = [];
  for (const e of EV) { if (e.k === 'skip') skipped.add(e.i); else if (e.k === 'done') { skipped.delete(e.i); played.push(e.i); } else if (e.k === 'play' || e.k === 'pick') played.push(e.i); }
  return [...new Set([...LIKES.slice().reverse(), ...played.reverse().filter(i => !skipped.has(i))])].filter(i => /^[\w-]{11}$/.test(i));
}
const onWifi = () => { const c = navigator.connection; return !c || !c.type || c.type === 'wifi' || c.type === 'ethernet'; };
const inInbox = id => !!(STORE && STORE.inbox && STORE.inbox[id]);
async function pullFromLaptop() {
  if (!S.autoDl || (S.wifiOnly && !onWifi())) return;
  const local = await helperUp();
  let n = 0;
  for (const id of new Set([...REQ, ...wantedIds()])) {
    if (DLX[id]) continue;
    const t = META[id] || { id, title: 'Song', artist: '' };
    if (local ? queueDl(t) : inInbox(id) && queueInbox(t)) n++;
    if (n >= 300) break;
  }
  if (n && !store.get('pullNoted')) { store.set('pullNoted', 1); toast(`Copying ${n} songs ${local ? 'from your downloader' : 'from your laptop'} so they play offline`); }
}
// Songs from the laptop's inbox in your private GitHub repo, one at a time, into Echo's storage.
const inQ = []; let inBusy = false;
function queueInbox(t) {
  if (!t || DLX[t.id] || !inInbox(t.id) || inQ.some(x => x.id === t.id)) return false;
  inQ.push(t); runInbox(); return true;
}
async function runInbox() {
  if (inBusy) return; inBusy = true; let got = 0;
  try {
    while (inQ.length) {
      const t = inQ.shift(); if (DLX[t.id] || !inInbox(t.id)) continue;
      try {
        const r = await fetch(`https://api.github.com/repos/${STORE.repo}/git/blobs/${STORE.inbox[t.id]}`, { headers: { Authorization: 'Bearer ' + S.ghToken, Accept: 'application/vnd.github.raw+json' } });
        if (!r.ok) continue;
        await saveLocal(t, 'audio', new Blob([await r.arrayBuffer()], { type: 'audio/mpeg' }));
        got++;
      } catch {}
    }
  } finally {
    inBusy = false;
    if (got) { scheduleSync(3000); if (route().arg === 'dl') renderView(); }
  }
}

/* ───────────────────────── downloads ─────────────────────────
   Downloads run through echo_dl.py (yt-dlp) on your own phone or computer.
   The script listens on 127.0.0.1:8977, saves the file to Downloads/Echo,
   and streams it back so the app can also keep it for offline playback. */
const idb = (() => {
  let dbp; const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('echo', 2);
    r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains('dl')) db.createObjectStore('dl', { keyPath: 'key' }); if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = async (store_, mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction(store_, mode); const q = fn(t.objectStore(store_)); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }); };
  return {
    put: v => tx('dl', 'readwrite', s => s.put(v)), get: k => tx('dl', 'readonly', s => s.get(k)), del: k => tx('dl', 'readwrite', s => s.delete(k)), all: () => tx('dl', 'readonly', s => s.getAll()),
    kvGet: k => tx('kv', 'readonly', s => s.get(k)), kvSet: (k, v) => tx('kv', 'readwrite', s => s.put(v, k)),
  };
})();
const HELPER = 'http://127.0.0.1:8977';
const SETUP_CMD = `curl -fsSL ${location.origin}${location.pathname.replace(/[^/]*$/, '')}setup.sh | bash`;
async function helperUp() {
  try {
    const c = new AbortController(); setTimeout(() => c.abort(), 1500);
    const r = await fetch(HELPER + '/ping', { signal: c.signal });
    const ok = r.ok && (await r.json()).app === 'echo-dl';
    if (ok) store.set('helperSeen', 1);
    return ok;
  } catch { return false; }
}
/* Starting the downloader for you: a web page can't run commands, but it can open an app.
   Echo opens Termux; the line the setup added to Termux's startup starts the downloader.
   Press Back and Echo carries on as soon as the downloader answers. It then keeps running
   in the background (Termux holds a wake lock) until the phone restarts. */
const IS_ANDROID = /Android/i.test(navigator.userAgent);
const TERMUX_INTENT = 'intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=com.termux;S.browser_fallback_url=' + encodeURIComponent('https://f-droid.org/packages/com.termux/') + ';end';
// Downloads on this device go through its own downloader (Termux on the phone, the laptop service on the laptop).
async function helperBase() {
  return (await helperUp()) ? { base: HELPER, key: '', remote: false } : null;
}
// No downloader here but a laptop is synced: ask the laptop to fetch it; it arrives through the inbox.
function askLaptop(t) {
  if (inInbox(t.id)) { queueInbox(t); toast(`Copying “${t.title}” from your laptop…`); return; }
  REQ.add(t.id); store.set('dlReq', [...REQ]); scheduleSync(500);
  toast(`Your laptop will download “${t.title}”. It'll be here in a few minutes, playable offline.`, 4500);
}
let starting = null;
function startHelper() {
  return starting || (starting = (async () => {
    if (await helperUp()) return true;
    if (!IS_ANDROID || !store.get('helperSeen')) return false;   // not set up on this phone yet
    const tn = toast('Opening Termux to start the downloader. Press Back to return.', 0);
    location.href = TERMUX_INTENT;
    for (let i = 0; i < 60; i++) {
      await sleep(1000);
      if (await helperUp()) { tn.set('Downloader is running'); tn.hide(1500); return true; }
    }
    tn.set("The downloader didn't start. Open Termux once, then try again."); tn.hide(5000);
    return false;
  })().finally(() => { starting = null; }));
}
function helperSetup(t, kind) {
  const s = sheet(`<div class="grab"></div><h3>Turn on downloads (one time)</h3>
    <p class="muted small">A website can't save YouTube audio by itself, so a small Python downloader (yt-dlp) runs inside <b>Termux</b> on your phone and saves each song as MP3 to <b>Downloads/Echo</b>. Songs also play offline here.</p>
    <ol class="steps">
      <li>Install <b>Termux</b> from <a href="https://f-droid.org/packages/com.termux/" target="_blank" rel="noopener">F-Droid</a> (the Play Store version is outdated).</li>
      <li>Open Termux, paste this, press Enter, and tap Allow when it asks for storage:<pre id="cmd">${esc(SETUP_CMD)}</pre><button class="btn ghost" id="cpy">Copy command</button></li>
      <li>Come back here and tap <b>Try again</b>.</li>
    </ol>
    <p class="muted small">That's the only setup. After this, when you tap Download and the downloader isn't running, Echo opens Termux for you. It starts by itself: just press Back.</p>
    <p class="muted small"><b>Easier: use your laptop.</b> If your laptop runs the Echo laptop service, just add your GitHub token in Settings → Sync on this phone. The laptop downloads everything you like or play, and the phone copies the songs in by itself.</p>
    <div class="bar"><button class="btn acc" id="retry">Try again</button></div>`);
  $('#cpy', s).onclick = () => navigator.clipboard.writeText(SETUP_CMD).then(() => toast('Copied — paste it in Termux'));
  $('#retry', s).onclick = () => { closeSheet(); if (t && t.id) download(t, kind); else downloadHistory(); };
}
async function download(t, kind, quiet) {
  let hb = await helperBase();
  if (!hb) { if (quiet) return; if (S.ghToken && LAPTOP) { askLaptop(t); return; } if (await startHelper()) hb = { base: HELPER, key: '' }; else { helperSetup(t, kind); return; } }
  const tn = quiet ? { set() {}, hide() {} } : toast(hb.remote ? `Getting “${t.title}” from your laptop…` : `Downloading “${t.title}” on your phone…`, 0);
  try {
    const r = await fetch(`${hb.base}/download?id=${encodeURIComponent(t.id)}&kind=${kind}${hb.key ? '&key=' + encodeURIComponent(hb.key) : ''}`);
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || 'helper ' + r.status); }
    const total = +r.headers.get('content-length') || 0, reader = r.body.getReader(), chunks = []; let got = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); got += value.length; tn.set(`Saving into Echo · ${total ? Math.round(got / total * 100) + '%' : (got / 1048576).toFixed(1) + ' MB'}`, total ? got / total : null); }
    const blob = new Blob(chunks, { type: r.headers.get('content-type') || (kind === 'audio' ? 'audio/mpeg' : 'video/mp4') });
    await saveLocal(t, kind, blob);
    tn.set(`Downloaded “${t.title}” — in Downloads/Echo and playable offline`); tn.hide(4000);
  } catch (e) { tn.set('Download failed: ' + String(e.message).replace(/^ERROR:\s*/, '').slice(0, 160)); tn.hide(6000); }
}
// Every song you listen to is saved through the helper in the background, one at a time.
const dlQ = []; let dlBusy = false;
function queueDl(t) {
  if (!t || t.pending || DLX[t.id] || String(t.id).startsWith('local:') || dlQ.some(x => x.id === t.id)) return false;
  dlQ.push(t); runDl(); return true;
}
async function runDl() {
  if (dlBusy) return; dlBusy = true;
  try {
    while (dlQ.length) {
      if (!(await helperBase())) { dlQ.length = 0; break; }
      const t = dlQ.shift(); if (!DLX[t.id]) await download(t, 'audio', true).catch(() => {});
    }
  } finally { dlBusy = false; if (route().arg === 'dl') renderView(); }
}
async function downloadHistory() {
  if (!(await helperBase())) {
    if (S.ghToken && LAPTOP) { await syncNow(); pullFromLaptop(); toast('Copying everything from your laptop. New songs arrive as the laptop downloads them.', 4500); return; }
    if (!(await startHelper())) { helperSetup(null, 'audio'); return; }
  }
  const ids = wantedIds();
  let n = 0; for (const id of ids) { const t = META[id]; if (t && isVerified(t) && queueDl(t)) n++; }
  toast(n ? `Downloading ${n} songs in the background` : 'Everything you listened to is already downloaded');
}
async function saveLocal(t, kind, blob) {
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch {}
  await idb.put({ key: t.id + ':' + kind, id: t.id, kind, blob, size: blob.size, at: Date.now() });
  DLX[t.id] = Object.assign(DLX[t.id] || {}, { [kind]: blob.size, at: Date.now() }); store.set('dlx', DLX);
  if (!META[t.id]) { META[t.id] = t; saveMeta(); }
  if (cur() && cur().id === t.id) renderPlayer();
}
async function removeLocal(id) {
  for (const k of ['audio', 'video']) await idb.del(id + ':' + k).catch(() => {});
  delete DLX[id]; store.set('dlx', DLX); toast('Removed download'); renderView(); if (cur() && cur().id === id) renderPlayer();
}
function importFiles(files) {
  [...files].forEach(async f => {
    const kind = f.type.startsWith('video') ? 'video' : 'audio';
    const base = f.name.replace(/\.[^.]+$/, ''); const p = base.split(/\s+-\s+/);
    const t = { id: 'local:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), title: p[1] || base, artist: p[1] ? p[0] : 'Local file', raw: base };
    META[t.id] = t; saveMeta(); await saveLocal(t, kind, f); toast('Imported ' + f.name); renderView();
  });
}

/* ───────────────────────── sheets, toast ───────────────────────── */
function sheet(html) { $('#sheet').innerHTML = html; $('#sheetWrap').hidden = false; return $('#sheet'); }
function closeSheet() { $('#sheetWrap').hidden = true; $('#sheet').innerHTML = ''; }
$('.sheet-scrim').onclick = closeSheet;
let toastT;
function toast(msg, ms = 2600) {
  const el = $('#toast'); el.hidden = false; el.innerHTML = esc(msg); clearTimeout(toastT);
  if (ms) toastT = setTimeout(() => el.hidden = true, ms);
  return { set(m, p) { el.hidden = false; el.innerHTML = esc(m) + (p != null ? `<div class="prog"><i style="width:${p * 100}%"></i></div>` : ''); }, hide(after = 0) { clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, after); } };
}
function trackMenu(t, opts = {}) {
  const s = sheet(`<div class="grab"></div>
    <div class="sh-head"><img src="${esc(thumb(t.id))}" alt=""><div><b>${esc(t.title)}</b><span>${esc(t.artist)}</span></div></div>
    <button class="mi" data-a="like">${ic(likeSet.has(t.id) ? 'heartF' : 'heart')}${likeSet.has(t.id) ? 'Remove from Liked Songs' : 'Add to Liked Songs'}</button>
    <button class="mi" data-a="pl">${ic('plus')}Add to playlist</button>
    ${opts.plId ? `<button class="mi" data-a="rmpl">${ic('x')}Remove from this playlist</button>` : ''}
    <button class="mi" data-a="next">${ic('next2')}Play next</button>
    <button class="mi" data-a="queue">${ic('queue')}Add to queue</button>
    <button class="mi" data-a="radio">${ic('radio')}Go to song radio</button>
    ${String(t.id).startsWith('local:') ? '' : `<button class="mi" data-a="dla">${ic('dl')}Download</button>`}
    ${DLX[t.id] ? `<button class="mi" data-a="rmdl">${ic('trash')}Remove download</button>` : ''}
    ${String(t.id).startsWith('local:') || t.pending ? '' : `<button class="mi" data-a="share">${ic('share')}Share</button><a class="mi" href="https://www.youtube.com/watch?v=${esc(t.id)}" target="_blank" rel="noopener">${ic('yt')}Open on YouTube</a>`}`);
  s.onclick = async e => {
    const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a; closeSheet();
    if (t.pending && !['next', 'queue'].includes(a)) { const tn = toast('Finding on YouTube…', 0); try { t = await resolveYT(t); tn.hide(); } catch { tn.set("Couldn't find it on YouTube"); tn.hide(2500); return; } }
    if (a === 'like') toggleLike(t);
    else if (a === 'pl') addToPlaylist(t);
    else if (a === 'rmpl') { const p = PL[opts.plId]; p.ids = p.ids.filter(x => x !== t.id); store.set('pl', PL); renderView(); }
    else if (a === 'next') { if (!cur()) playQueue([t], 0, 'Queue'); else { PS.q.splice(PS.i + 1, 0, t); toast('Playing next'); } }
    else if (a === 'queue') { if (!cur()) playQueue([t], 0, 'Queue'); else { PS.q.push(t); toast('Added to queue'); } }
    else if (a === 'radio') go('list/radio:' + t.id);
    else if (a === 'dla') download(t, 'audio');
    else if (a === 'dlv') download(t, 'video');
    else if (a === 'rmdl') removeLocal(t.id);
    else if (a === 'share') shareTrack(t);
  };
}
function shareTrack(t) { const url = 'https://www.youtube.com/watch?v=' + t.id; if (navigator.share) navigator.share({ title: t.title + ' — ' + t.artist, url }).catch(() => {}); else navigator.clipboard.writeText(url).then(() => toast('Link copied')); }
function addToPlaylist(t) {
  const items = Object.entries(PL).filter(([, p]) => !p.del).sort((a, b) => b[1].at - a[1].at);
  const s = sheet(`<div class="grab"></div><h3>Add to playlist</h3><button class="mi" data-new="1">${ic('plus')}New playlist</button>` + items.map(([id, p]) => `<button class="mi" data-id="${esc(id)}">${ic('music')}${esc(p.name)} <span class="muted small">· ${p.ids.length}</span></button>`).join(''));
  s.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.new) { const n = prompt('Playlist name', 'My playlist #' + (items.length + 1)); if (!n) return; const id = 'p' + Date.now().toString(36); PL[id] = { name: n, ids: [t.id], at: Date.now() }; store.set('pl', PL); closeSheet(); toast('Added to ' + n); }
    else if (b.dataset.id) { const p = PL[b.dataset.id]; if (!p.ids.includes(t.id)) p.ids.push(t.id); p.at = Date.now(); store.set('pl', PL); closeSheet(); toast('Added to ' + p.name); }
  };
}
function openQueue() {
  const s = sheet(''); renderQueueSheet(s);
  s.onclick = e => {
    const rm = e.target.closest('[data-rm]'); if (rm) { e.stopPropagation(); PS.q.splice(+rm.dataset.rm, 1); renderQueueSheet(s); return; }
    const r = e.target.closest('[data-qi]'); if (r) { PS.i = +r.dataset.qi; loadCur(); closeSheet(); }
  };
}
function renderQueueSheet(s) {
  const t = cur();
  s.innerHTML = `<div class="grab"></div><h3>Queue</h3>` + (t ? `<p class="muted small">NOW PLAYING</p>${rowHTML(t, -1, true)}` : '') +
    `<p class="muted small" style="margin-top:14px">NEXT FROM: ${esc(PS.ctx || 'Queue')}${S.autoplay ? ' · autoplay on' : ''}</p>` +
    PS.q.slice(PS.i + 1).map((x, k) => `<div class="row" data-qi="${PS.i + 1 + k}"><img src="${esc(thumb(x.id))}" alt="" loading="lazy"><div class="rm"><b>${esc(x.title)}</b><span>${esc(x.artist)}</span></div><button class="ib" data-rm="${PS.i + 1 + k}" aria-label="Remove">${ic('x')}</button></div>`).join('') +
    (PS.q.length - PS.i - 1 === 0 ? '<p class="muted small">Nothing queued — autoplay will pick songs like this one.</p>' : '');
}
function renderQueueSheetIfOpen() { const s = $('#sheet'); if (!$('#sheetWrap').hidden && s.querySelector('h3') && s.querySelector('h3').textContent === 'Queue') renderQueueSheet(s); }

/* ───────────────────────── settings ───────────────────────── */
function openSettings() {
  const s = sheet(`<div class="grab"></div><h3>Settings</h3>
    <label for="sCc">Country for charts and new releases</label>
    <input type="text" id="sCc" value="${esc(CC())}" maxlength="2" placeholder="in" autocomplete="off">
    <div class="help">Two-letter code, e.g. in, us, gb.</div>
    <label for="sGh">Sync with your laptop (GitHub token)</label>
    <input type="password" id="sGh" value="${esc(S.ghToken)}" placeholder="ghp_…" autocomplete="off">
    <div class="help"><a href="https://github.com/settings/tokens/new?scopes=gist,repo&description=Echo" target="_blank" rel="noopener">Create a token</a> (the <b>gist</b> and <b>repo</b> boxes are pre-ticked; pick "No expiration"), then paste it here, once per device. Likes, history and playlists sync through a private gist, and songs your laptop downloads are copied onto this device so they play offline. <span id="syncSt"></span></div>
    <div class="tog"><span>Copy songs from the laptop only on Wi-Fi</span><input type="checkbox" id="sWifi" ${S.wifiOnly ? 'checked' : ''}></div>
    <label>Downloads</label>
    <div class="help" id="hlp">Checking the download helper…</div>
    <div class="tog"><span>Autoplay similar songs when the queue ends</span><input type="checkbox" id="sAuto" ${S.autoplay ? 'checked' : ''}></div>
    <div class="tog"><span>Play downloaded copy when available (works offline and in background)</span><input type="checkbox" id="sLoc" ${S.preferLocal ? 'checked' : ''}></div>
    <div class="tog"><span>Download every song I listen to (past 30 seconds), using the download helper</span><input type="checkbox" id="sAdl" ${S.autoDl ? 'checked' : ''}></div>
    <div class="bar"><button class="btn acc" id="sSave">Save</button><button class="btn ghost" id="sExp">Back up data</button><label class="btn ghost" style="margin:0;color:var(--tx)">Restore<input type="file" id="sImp" accept="application/json" hidden></label></div>
    <div class="bar"><button class="btn ghost" id="sRe">Refresh recommendations</button><button class="btn ghost" id="sClr">Clear listening history</button></div>
    <label>Keep your keys safe</label>
    <div class="help">Your token is saved on this device permanently (in two places, and the browser is asked not to clear them). If the browser's data ever gets wiped, open your restore link once and everything comes back. It's a private link, so keep it to yourself (e.g. in your notes).</div>
    <div class="bar"><button class="btn ghost" id="sLink">Copy restore link</button></div>
    <p class="help" style="margin-top:18px">Your history, likes, playlists and keys stay on your devices and your own private gist. Echo is not affiliated with YouTube or Spotify.</p>`);
  helperUp().then(ok => { const h = $('#hlp'); if (h) h.innerHTML = ok ? '✓ Downloader is running on this device. Songs are saved to Downloads/Echo (Music/Echo on the laptop).' : S.ghToken && LAPTOP ? 'Songs come from your laptop: it downloads everything you like or play, and this device copies them in by itself. ' + '<a href="#" id="dlOpt">Other options</a>' : (store.get('helperSeen') ? 'Downloader not running right now. Tapping Download opens Termux to start it; press Back to return. ' : 'Downloads are not set up yet. ') + '<a href="#" id="dlOpt">Download setup</a>'; const o = $('#dlOpt'); if (o) o.onclick = e => { e.preventDefault(); helperSetup(null, 'audio'); }; });
  { const st = $('#syncSt'), last = store.get('lastSync'), err = store.get('syncErr');
    if (st && S.ghToken) st.innerHTML = '<br>' + (err ? '⚠ ' + esc(err) : last ? '✓ Synced ' + new Date(last).toLocaleString() : 'Not synced yet') + (LAPTOP ? ` · laptop ${esc(LAPTOP.name || '')} last checked in ${new Date(LAPTOP.at).toLocaleString()}` : '') + (STORE && STORE.inbox ? ` · ${Object.keys(STORE.inbox).filter(i => !DLX[i]).length} songs waiting to copy` : ''); }
  $('#sLink', s).onclick = () => { const keys = { ghToken: S.ghToken, country: S.country }; navigator.clipboard.writeText(location.origin + location.pathname + '#restore=' + btoa(unescape(encodeURIComponent(JSON.stringify(keys))))).then(() => toast('Restore link copied')); };
  $('#sSave', s).onclick = () => {
    S.country = ($('#sCc').value.trim().toLowerCase().match(/^[a-z]{2}$/) || [''])[0]; S.ghToken = $('#sGh').value.trim(); S.wifiOnly = $('#sWifi').checked;
    S.autoplay = $('#sAuto').checked; S.preferLocal = $('#sLoc').checked; S.autoDl = $('#sAdl').checked; saveS(); closeSheet(); toast('Saved'); if (S.ghToken) { store.del('syncErr'); syncNow().then(() => { const e = store.get('syncErr'); toast(e ? 'Sync: ' + e : 'Synced with your other devices'); renderView(); }); } renderView();
  };
  $('#sExp', s).onclick = () => {
    const data = {}; for (const k of store.keys()) if (!/^(mix|s|gen|gly|lrc|chart|rr):/.test(k)) data[k] = store.get(k);
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' })); a.download = 'echo-backup-' + dayKey() + '.json'; a.click();
  };
  $('#sImp', s).onchange = async e => { try { const d = JSON.parse(await e.target.files[0].text()); for (const [k, v] of Object.entries(d)) store.set(k, v); toast('Restored — reloading'); setTimeout(() => location.reload(), 800); } catch { toast('That file is not an Echo backup'); } };
  $('#sRe', s).onclick = () => { closeSheet(); HOME = null; store.del('home'); go('home'); };
  $('#sClr', s).onclick = () => { if (!confirm('Clear listening history? Likes, playlists and downloads are kept.')) return; EV.length = 0; store.set('ev', EV); store.set('recent', []); store.del('home'); HOME = null; PROF = null; closeSheet(); renderView(); };
}

/* ───────────────────────── views ───────────────────────── */
const route = () => { const h = decodeURIComponent(location.hash.slice(1)) || 'home'; const [name, ...rest] = h.split('/'); return { name, arg: rest.join('/') }; };
const go = h => { if (location.hash === '#' + h) renderView(); else location.hash = h; };
window.addEventListener('hashchange', () => { closeSheet(); renderView(); });
window.addEventListener('popstate', () => { if ($('#np').classList.contains('open') && !(history.state && history.state.np)) closeNP(true); });
const V = $('#view');
function rowHTML(t, i, noMenu) {
  const d = DLX[t.id];
  return `<div class="row${cur() && cur().id === t.id ? ' cur' : ''}" data-id="${esc(t.id)}" data-i="${i}"><img src="${esc(thumb(t.id))}" alt="" loading="lazy"><div class="rm"><b>${esc(t.title)}</b><span>${d ? ic('dlDone') : ''}${esc(t.artist)}</span></div>${noMenu ? '' : `<button class="ib" data-menu="${i}" aria-label="More">${ic('more')}</button>`}</div>`;
}
function bindRows(root, tracks, ctx, ctxKey, opts = {}) {
  root.onclick = e => {
    const m = e.target.closest('[data-menu]'); if (m) { e.stopPropagation(); trackMenu(tracks[+m.dataset.menu], opts); return; }
    const r = e.target.closest('.row[data-i]'); if (r) { const i = +r.dataset.i; if (cur() && cur().id === tracks[i].id) { openNP(); return; } if (opts.onPick) opts.onPick(tracks[i]); opts.radio ? startRadio(tracks[i]) : playQueue(tracks, i, ctx, ctxKey); }
  };
}
function cardHTML(c) {
  let cov;
  if (c.kind === 'liked') cov = `<div class="liked-cov" style="width:100%;height:100%">${ic('heartF')}</div>`;
  else if (c.ids && c.ids.length >= 4 && c.collage) cov = `<div class="collage">${c.ids.slice(0, 4).map(id => `<img src="${esc(thumb(id))}" alt="" loading="lazy">`).join('')}</div>`;
  else cov = `<img src="${esc(thumb(c.ids ? c.ids[0] : c.id))}" alt="" loading="lazy">`;
  return `<button class="card" data-go="${esc(c.go || '')}" data-play="${esc(c.play || '')}" data-cq="${esc(c.cq || '')}" data-rq="${esc(c.rq || '')}"><div class="cov">${cov}${c.color ? `<i class="tag" style="background:${c.color}"></i><div class="band">${esc(c.title)}</div>` : ''}</div><b>${esc(c.title)}</b><span>${esc(c.sub || '')}</span></button>`;
}
function greeting() { const h = new Date().getHours(); return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; }
const BEC = {};
let homeBuilding = null, rrBuilding = null, RR = store.get('rr:list', null);
const skelCards = n => Array.from({ length: n }, () => '<div class="card"><div class="cov skel"></div><b class="muted">&nbsp;</b></div>').join('');
const chartCards = () => GENRES.slice(0, 10).map(([g, n, c]) => `<button class="card" data-go="list/chart:${g}"><div class="cov genre-cov" style="background:${c}"><span>${esc(n)}</span><small>${g ? 'Top songs' : esc(countryName())}</small></div><b>${esc(g ? n + ' — Top songs' : 'Top 50 — ' + countryName())}</b><span>Updated daily</span></button>`).join('');
function playChart(g, i) { chart(g).then(list => startRadio(list[i])).catch(() => toast('Charts unavailable right now')); }
async function viewHome() {
  const recent = store.get('recent', []);
  const quick = [];
  if (LIKES.length) quick.push(`<button class="qi" data-go="list/liked"><div class="cov liked-cov">${ic('heartF')}</div><span>Liked Songs</span></button>`);
  if (RR && RR.ids.length) quick.push(`<button class="qi" data-go="list/rr"><img src="${esc(thumb(RR.ids[0]))}" alt=""><span>Release Radar</span></button>`);
  (HOME && HOME.mixes || []).slice(0, 2).forEach(m => quick.push(`<button class="qi" data-go="list/${m.key}"><img src="${esc(thumb(m.ids[0]))}" alt=""><span>${esc(m.title)}</span></button>`));
  if (HOME && HOME.dw) quick.push(`<button class="qi" data-go="list/dw"><img src="${esc(thumb(HOME.dw.ids[0]))}" alt=""><span>Discover Weekly</span></button>`);
  recent.slice(0, 8 - quick.length).forEach(id => META[id] && quick.push(`<button class="qi" data-play="${esc(id)}"><img src="${esc(thumb(id))}" alt=""><span>${esc(META[id].title)}</span></button>`));
  V.innerHTML = `<div class="top"><h1>${greeting()}</h1><button class="ib" id="gear" aria-label="Settings">${ic('gear')}</button></div>
    ${quick.length ? `<div class="quick">${quick.slice(0, 6).join('')}</div>` : ''}
    <div id="hs"></div>`;
  $('#gear').onclick = openSettings;
  const hs = $('#hs');
  const trending = `<h3 class="sh">Trending in ${esc(countryName())}</h3><div class="shelf" id="trend">${skelCards(4)}</div>`;
  const draw = () => {
    let h = '';
    if (!hasHistory()) {
      h += `<div class="note"><b>Welcome to Echo.</b> Tap any song to start, or search for anything. Echo learns from what you play, skip and like, then builds your Daily Mixes, Discover Weekly and Release Radar.</div>`;
      h += trending + `<h3 class="sh">Charts</h3><div class="shelf">${chartCards()}</div>`;
    } else {
      const mixes = (HOME && HOME.mixes || []).map(m => ({ title: m.title, sub: m.sub, ids: m.ids, color: m.color, go: 'list/' + m.key }));
      if (HOME && HOME.dw) mixes.unshift({ title: 'Discover Weekly', sub: HOME.dw.sub, ids: HOME.dw.ids, color: HOME.dw.color, go: 'list/dw', collage: true });
      if (RR && RR.ids.length) mixes.unshift({ title: 'Release Radar', sub: 'New songs from artists you play', ids: RR.ids, color: '#e8115b', go: 'list/rr', collage: true });
      const onRepeat = Object.entries(profile().cnt30).filter(([id, n]) => n >= 2 && META[id]).sort((a, b) => b[1] - a[1]).map(x => x[0]);
      if (onRepeat.length >= 3) mixes.push({ title: 'On Repeat', sub: 'Songs you love right now', ids: onRepeat, go: 'list/repeat', collage: true });
      const last = (cur() && !cur().pending && !String(cur().id).startsWith('local:')) ? cur() : META[recent.find(id => META[id] && !String(id).startsWith('local:'))];
      if (last) h += `<h3 class="sh">More like ${esc(last.title)}</h3><div class="shelf sim" data-seed="${esc(last.id)}">${skelCards(4)}</div>`;
      const ls = store.get('lastSearch');
      if (ls && Date.now() - ls.at < 7 * DAY && META[ls.id] && (!last || ls.id !== last.id)) h += `<h3 class="sh">Because you searched “${esc(ls.q)}”</h3><div class="shelf sim" data-seed="${esc(ls.id)}">${skelCards(4)}</div>`;
      h += `<h3 class="sh">Made for you</h3><div class="shelf">${mixes.map(cardHTML).join('') || ''}${homeBuilding || rrBuilding ? '<div class="card"><div class="cov skel"></div><b class="muted">Mixing…</b></div>' : ''}</div>`;
      if (recent.length) h += `<h3 class="sh">Recently played</h3><div class="shelf">${recent.filter(id => META[id]).slice(0, 15).map(id => cardHTML({ title: META[id].title, sub: META[id].artist, id, play: id })).join('')}</div>`;
      const p = profile(), now = Date.now();
      const jump = Object.entries(p.cnt).filter(([id, n]) => n >= 2 && META[id] && (!p.last[id] || now - p.last[id] > 10 * DAY)).sort((a, b) => b[1] - a[1]).slice(0, 15).map(x => x[0]);
      if (jump.length) h += `<h3 class="sh">Jump back in</h3><div class="shelf">${jump.map(id => cardHTML({ title: META[id].title, sub: META[id].artist, id, play: id })).join('')}</div>`;
      const topA = Object.entries(p.ar).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).slice(0, 8);
      if (topA.length) {
        const cards = topA.map(([a]) => { const id = topTracks(1, m => akey(m.artist) === a)[0]; return id ? cardHTML({ title: primaryArtist(META[id].artist) + ' Radio', sub: 'Based on ' + META[id].title, id, go: 'list/radio:' + id }) : ''; }).join('');
        h += `<h3 class="sh">Your top artist radios</h3><div class="shelf">${cards}</div>`;
      }
      h += trending;
      h += `<h3 class="sh">Charts</h3><div class="shelf">${chartCards()}</div>`;
    }
    hs.innerHTML = h;
    for (const bc of $$('.shelf.sim')) { const sid = bc.dataset.seed; (BEC[sid] ? Promise.resolve(BEC[sid]) : radioFor(META[sid]).then(l => (BEC[sid] = l)))
      .then(l => { if (!document.body.contains(bc)) return; bc.innerHTML = l.slice(0, 20).map(t => cardHTML({ title: t.title, sub: t.artist, id: t.id, rq: t.id })).join('') || '<p class="muted small">Play a bit more to see similar songs.</p>'; })
      .catch(() => { bc.innerHTML = ''; }); }
    const tr = $('#trend');
    if (tr) chart(0).then(ts => { if (!document.body.contains(tr)) return; tr.innerHTML = ts.slice(0, 25).map((t, i) => cardHTML({ title: t.title, sub: t.artist, id: t.id, cq: '0:' + i })).join(''); })
      .catch(() => { tr.innerHTML = '<p class="muted small">Charts unavailable right now.</p>'; });
  };
  draw();
  V.onclick = e => {
    const g = e.target.closest('[data-go]'); if (g && g.dataset.go) { go(g.dataset.go); return; }
    const rq = e.target.closest('[data-rq]'); if (rq && rq.dataset.rq) { startRadio(META[rq.dataset.rq]); return; }
    const c = e.target.closest('[data-cq]'); if (c && c.dataset.cq) { const [gg, i] = c.dataset.cq.split(':'); playChart(gg, +i); return; }
    const p = e.target.closest('[data-play]'); if (p && p.dataset.play) { const t = META[p.dataset.play]; if (t) startRadio(t); }
  };
  if (hasHistory() && (!HOME || HOME.day !== dayKey() || Date.now() - HOME.at > 6 * 3600e3) && !homeBuilding) {
    homeBuilding = buildHome(partial => { HOME = Object.assign({}, HOME || {}, partial, { at: HOME ? HOME.at : 0 }); if (route().name === 'home') draw(); })
      .then(h => { HOME = h; store.set('home', h); }).catch(() => {}).finally(() => { homeBuilding = null; if (route().name === 'home') draw(); });
    draw();
  }
  if (hasHistory() && (!RR || Date.now() - RR.at > 12 * 3600e3) && !rrBuilding) {
    rrBuilding = releaseRadar().then(ts => { RR = { at: Date.now(), ids: ts.map(t => t.id) }; store.set('rr:list', RR); }).catch(() => {})
      .finally(() => { rrBuilding = null; if (route().name === 'home') draw(); });
  }
}
function viewSearch(q = '') {
  const recentQ = store.get('recentQ', []);
  V.innerHTML = `<div class="top"><h1>Search</h1></div>
    <div class="sbox"><form id="sf">${ic('search')}<input id="sq" type="search" enterkeyhint="search" placeholder="Songs, artists, albums" value="${esc(q)}" autocomplete="off"></form></div>
    <div id="sr"></div>`;
  const inp = $('#sq'), sr = $('#sr');
  const browse = () => {
    sr.innerHTML = (recentQ.length ? `<h3 class="sh">Recent searches</h3><div class="recent-q">${recentQ.map(x => `<button class="chip" data-q="${esc(x)}">${esc(x)}</button>`).join('')}</div>` : '') +
      `<h3 class="sh">Browse charts</h3><div class="genres">${GENRES.map(([g, n, c]) => `<button class="genre" style="background:${c}" data-go="list/chart:${g}">${esc(n)}</button>`).join('')}</div>`;
  };
  const mine = () => new Set([...LIKES, ...store.get('recent', []), ...EV.map(e => e.i), ...Object.values(PL).flatMap(p => p.ids), ...Object.keys(DLX)]);
  const localResults = s => { const n = norm(s); if (!n) return []; const ids = mine(); return [...ids].map(i => META[i]).filter(t => t && t.title && !t.pending && isVerified(t) && (norm(t.title).includes(n) || norm(t.artist).includes(n))).slice(0, 5); };
  let tok = 0;
  const show = async (s, remote) => {
    const my = ++tok;
    const loc = localResults(s);
    sr.innerHTML = (loc.length ? `<h3 class="sh">In your library</h3><div id="srl">${loc.map((t, i) => rowHTML(t, i)).join('')}</div>` : '') +
      `<div id="srd"></div><div id="sra"><h3 class="sh">More songs</h3><p class="muted small">Searching…</p></div>`;
    if (loc.length) bindRows($('#srl'), loc, 'Search: ' + s, '', { radio: true, onPick: t => logPick(s, t) });
    let dsHits = [];
    dsSearch(s).then(ts => {
      if (my !== tok || !ts.length) return; dsHits = ts; const el = $('#srd');
      el.innerHTML = '<h3 class="sh">Songs</h3>' + ts.map((t, i) => rowHTML(t, i)).join('');
      bindRows(el, ts, 'Search: ' + s, '', { radio: true, onPick: t => logPick(s, t) });
      if (remote) logSearch(s, ts);
    }).catch(() => {});
    itunesSearch(s).then(ts => {
      if (my !== tok) return; const el = $('#sra');
      if (!ts.length) { el.innerHTML = dsHits.length ? '' : '<p class="muted small" style="margin-top:12px">No songs found.</p>'; return; }
      const have = new Set(dsHits.map(songKey)); ts = ts.filter(t => !have.has(songKey(t)));
      if (!ts.length) { el.innerHTML = ''; return; }
      el.innerHTML = `<h3 class="sh">${dsHits.length ? 'More songs' : 'Songs'}</h3>` + ts.map((t, i) => rowHTML(t, i)).join('');
      bindRows(el, ts, 'Search: ' + s, '', { radio: true, onPick: t => logPick(s, t) });
      if (remote && !dsHits.length) logSearch(s, ts);
    }).catch(() => { if (my === tok) $('#sra').innerHTML = ''; });
    if (!remote) return;
    store.set('recentQ', [s, ...recentQ.filter(x => x.toLowerCase() !== s.toLowerCase())].slice(0, 10));
  };
  let deb; inp.oninput = () => { clearTimeout(deb); deb = setTimeout(() => inp.value.trim() ? show(inp.value.trim(), false) : browse(), 450); };
  $('#sf').onsubmit = e => { e.preventDefault(); inp.blur(); const s = inp.value.trim(); if (s) { history.replaceState(null, '', '#search/' + encodeURIComponent(s)); show(s, true); } };
  sr.addEventListener('click', e => {
    const c = e.target.closest('[data-q]'); if (c) { inp.value = c.dataset.q; $('#sf').requestSubmit(); return; }
    const g = e.target.closest('[data-go]'); if (g) go(g.dataset.go);
  });
  if (q) show(q, true); else browse();
}
function viewLibrary() {
  const pls = Object.entries(PL).filter(([, p]) => !p.del).sort((a, b) => b[1].at - a[1].at);
  const nd = Object.keys(DLX).length;
  V.innerHTML = `<div class="top"><h1>Your Library</h1><div><button class="ib" id="lNew" aria-label="New playlist">${ic('plus')}</button><button class="ib" id="gear" aria-label="Settings">${ic('gear')}</button></div></div>
    <div id="ll">
    <div class="row" data-go="list/liked"><div class="cov liked-cov">${ic('heartF')}</div><div class="rm"><b>Liked Songs</b><span>Playlist · ${LIKES.length} songs</span></div></div>
    <div class="row" data-go="list/dl"><div class="cov dl-cov">${ic('dl')}</div><div class="rm"><b>Downloads</b><span>Available offline · ${nd} ${nd === 1 ? 'item' : 'items'}</span></div></div>
    <div class="row" data-go="list/recent"><div class="cov hist-cov">${ic('clock')}</div><div class="rm"><b>Recently played</b><span>History</span></div></div>
    ${(HOME && HOME.mixes || []).map(m => `<div class="row" data-go="list/${m.key}"><img src="${esc(thumb(m.ids[0]))}" alt=""><div class="rm"><b>${esc(m.title)}</b><span>Made for you</span></div></div>`).join('')}
    ${pls.map(([id, p]) => `<div class="row" data-go="list/pl:${esc(id)}">${p.ids[0] ? `<img src="${esc(thumb(p.ids[0]))}" alt="">` : `<div class="cov pl-cov">${ic('music')}</div>`}<div class="rm"><b>${esc(p.name)}</b><span>Playlist · ${p.ids.length} songs</span></div></div>`).join('')}
    </div>`;
  $('#gear').onclick = openSettings;
  $('#lNew').onclick = () => { const n = prompt('Playlist name', 'My playlist #' + (pls.length + 1)); if (!n) return; const id = 'p' + Date.now().toString(36); PL[id] = { name: n, ids: [], at: Date.now() }; store.set('pl', PL); go('list/pl:' + id); };
  $('#ll').onclick = e => { const r = e.target.closest('[data-go]'); if (r) go(r.dataset.go); };
}
async function resolveList(key) {
  if (key === 'liked') return { title: 'Liked Songs', sub: LIKES.length + ' songs', ids: LIKES.slice().reverse(), kind: 'liked', hc: '#4a2bd4' };
  if (key === 'recent') return { title: 'Recently played', sub: 'Your listening history', ids: store.get('recent', []), hc: '#7a3b00' };
  if (key === 'dl') return { title: 'Downloads', sub: 'Plays offline, even in the background', ids: Object.entries(DLX).sort((a, b) => (b[1].at || 0) - (a[1].at || 0)).map(x => x[0]), kind: 'dl', hc: '#0d6b3a' };
  if (key === 'repeat') { const c = profile().cnt30; return { title: 'On Repeat', sub: 'Songs you love right now', ids: Object.entries(c).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).map(x => x[0]).slice(0, 30) }; }
  if (key === 'dw') return HOME && HOME.dw ? { title: 'Discover Weekly', sub: HOME.dw.sub + ' · refreshes Monday', ids: HOME.dw.ids, hc: '#509bf5' } : null;
  if (key.startsWith('daily')) { const m = HOME && HOME.mixes.find(x => x.key === key); return m ? { title: m.title, sub: m.sub, ids: m.ids, hc: m.color } : null; }
  if (key === 'rr') return RR && RR.ids.length ? { title: 'Release Radar', sub: 'New songs from artists you play · updated daily', ids: RR.ids, hc: '#e8115b' } : null;
  if (key.startsWith('chart:')) {
    const g = key.slice(6), ts = await chart(g), gc = GENRES.find(x => x[0] === +g);
    return { title: +g ? genreName(g) + ' — Top songs' : 'Top 50 — ' + countryName(), sub: 'Most popular in ' + countryName() + ' right now · updated daily', ids: ts.map(t => t.id), hc: gc ? gc[2] : '#1e3264' };
  }
  if (key.startsWith('pl:')) { const p = PL[key.slice(3)]; return p && !p.del ? { title: p.name, sub: p.ids.length + ' songs', ids: p.ids.slice(), plId: key.slice(3) } : null; }
  if (key.startsWith('radio:')) {
    const id = key.slice(6), seed = await meta(id).catch(() => null); if (!seed) return null;
    const list = await radioFor(seed);
    return { title: primaryArtist(seed.artist) + ' — ' + seed.title + ' Radio', sub: 'Songs like ' + seed.title, ids: [seed.id, ...list.map(t => t.id)] };
  }
  return null;
}
async function viewList(key) {
  V.innerHTML = `<div class="lh"><button class="ib back" id="bk">${ic('back')}</button><div class="bigcov skel"></div><div class="lh-info"><h2>&nbsp;</h2><p>${key.startsWith('radio:') ? 'Tuning the radio…' : '&nbsp;'}</p></div></div>`;
  $('#bk').onclick = () => history.length > 1 ? history.back() : go('home');
  const L = await resolveList(key).catch(() => null);
  if (route().arg !== key) return;
  if (!L) { V.innerHTML += '<p class="empty">This list isn’t available yet — it will appear after you listen a bit more.</p>'; return; }
  const tracks = (await metas(L.ids)).filter(Boolean);
  if (route().arg !== key) return;
  const cover = L.kind === 'liked' ? `<div class="liked-cov">${ic('heartF')}</div>` : L.kind === 'dl' ? `<div class="dl-cov">${ic('dl')}</div>` : tracks.length >= 4 ? `<div class="collage">${tracks.slice(0, 4).map(t => `<img src="${esc(thumb(t.id))}" alt="">`).join('')}</div>` : tracks[0] ? `<img src="${esc(thumb(tracks[0].id, 'hqdefault'))}" alt="">` : `<div class="pl-cov">${ic('music')}</div>`;
  V.innerHTML = `<div class="lh" style="--hc:${esc(L.hc || '#3a3a3a')}"><button class="ib back" id="bk">${ic('back')}</button><div class="bigcov">${cover}</div>
    <div class="lh-info"><h2>${esc(L.title)}</h2><p>${esc(L.sub || '')}</p></div>
    <div class="lh-act">${L.kind === 'dl' ? `<button class="btn ghost" id="dlAll">Download all I've listened to</button><label class="ib" title="Import file">${ic('upload')}<input type="file" id="imp" accept="audio/*,video/*" multiple hidden></label>` : ''}${L.plId ? `<button class="ib" id="plDel" aria-label="Delete playlist">${ic('trash')}</button>` : ''}${key.startsWith('daily') || key.startsWith('radio:') ? `<button class="ib" id="reroll" aria-label="Refresh">${ic('refresh')}</button>` : ''}<span class="sp"></span>
      <button class="ib${PS.shuffle ? ' on' : ''}" id="lShuf" aria-label="Shuffle">${ic('shuffle')}</button><button class="playbig" id="lPlay" aria-label="Play">${ic('play')}</button></div></div>
    <div id="lt">${tracks.length ? tracks.map((t, i) => rowHTML(t, i)).join('') : `<p class="empty">${L.kind === 'dl' ? 'No downloads yet. Use ⋯ → Download on any song, or import a file with the upload button.' : L.plId ? 'Empty playlist — add songs with ⋯ → Add to playlist.' : 'Nothing here yet.'}</p>`}</div>`;
  $('#bk').onclick = () => history.length > 1 ? history.back() : go('home');
  $('#lPlay').onclick = () => tracks.length && playQueue(tracks, 0, L.title, key);
  $('#lShuf').onclick = () => { PS.shuffle = !PS.shuffle; $('#lShuf').classList.toggle('on', PS.shuffle); renderPlayer(); if (PS.shuffle && tracks.length) playQueue(tracks, Math.floor(Math.random() * tracks.length), L.title, key); };
  bindRows($('#lt'), tracks, L.title, key, { plId: L.plId, radio: key.startsWith('chart:') });
  const imp = $('#imp'); if (imp) imp.onchange = e => importFiles(e.target.files);
  const da = $('#dlAll'); if (da) da.onclick = downloadHistory;
  const pd = $('#plDel'); if (pd) pd.onclick = () => { if (confirm('Delete “' + L.title + '”?')) { PL[L.plId] = { name: L.title, ids: [], at: Date.now(), del: true }; store.set('pl', PL); scheduleSync(); go('library'); } };
  const rr = $('#reroll'); if (rr) rr.onclick = () => { if (key.startsWith('radio:')) { store.del('mix:' + key.slice(6)); viewList(key); } else { HOME = null; store.del('home'); go('home'); toast('Rebuilding your mixes…'); } };
}
function renderView() {
  const r = route();
  $$('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === (r.name === 'list' ? (/^(liked|dl|recent|pl:)/.test(r.arg) ? 'library' : 'home') : r.name)));
  V.onclick = null; scrollTo(0, 0);
  if (r.name === 'search') viewSearch(r.arg);
  else if (r.name === 'library') viewLibrary();
  else if (r.name === 'list' && r.arg) viewList(r.arg);
  else viewHome();
}

/* ───────────────────────── wiring ───────────────────────── */
$('#tabs').innerHTML = `<a href="#home" data-tab="home">${ic('home')}Home</a><a href="#search" data-tab="search">${ic('search')}Search</a><a href="#library" data-tab="library">${ic('lib')}Your Library</a>`;
$('#npClose').innerHTML = ic('down'); $('#npMore').innerHTML = ic('more');
$('#prev').innerHTML = ic('prev'); $('#next').innerHTML = ic('next'); $('#shuf').innerHTML = ic('shuffle'); $('#rep').innerHTML = ic('repeat');
$('#npRadio').innerHTML = ic('radio'); $('#npShare').innerHTML = ic('share'); $('#npQueue').innerHTML = ic('queue'); $('#npDl').innerHTML = ic('dl');
$('#mini').onclick = e => { if (e.target.closest('#miniPP')) { toggle(); return; } if (e.target.closest('#miniLike')) { toggleLike(cur()); return; } openNP(); };
$('#npClose').onclick = () => closeNP();
$('#npMore').onclick = () => cur() && trackMenu(cur());
$('#pp').onclick = toggle; $('#next').onclick = () => next(true); $('#prev').onclick = prev;
$('#shuf').onclick = () => {
  PS.shuffle = !PS.shuffle;
  if (PS.shuffle) { PS.orig = PS.q.slice(); const rest = PS.q.splice(PS.i + 1); PS.q.push(...shuffleArr(rest)); }
  else if (PS.orig) { const c = cur(); PS.q = PS.orig; PS.i = Math.max(0, PS.q.findIndex(x => x.id === c.id)); PS.orig = null; }
  renderPlayer();
};
$('#rep').onclick = () => { PS.repeat = (PS.repeat + 1) % 3; renderPlayer(); toast(['Repeat off', 'Repeat all', 'Repeat one'][PS.repeat], 1200); };
$('#npLike').onclick = () => toggleLike(cur());
$('#npDl').onclick = () => { const t = cur(); if (!t) return; if (String(t.id).startsWith('local:')) { toast('Already on your device'); return; } if (DLX[t.id]) { const sh = sheet(`<div class="grab"></div><h3>Downloaded</h3><button class="mi" data-k="rm">${ic('trash')}Remove download</button>`); sh.onclick = e => { if (e.target.closest('[data-k]')) { closeSheet(); removeLocal(t.id); } }; return; } download(t, 'audio'); };
$('#npRadio').onclick = () => { const t = cur(); if (t) { closeNP(); setTimeout(() => go('list/radio:' + t.id), 50); } };
$('#npShare').onclick = () => cur() && shareTrack(cur());
$('#npQueue').onclick = openQueue;
$$('#npMode button').forEach(b => b.onclick = () => { setMode(b.dataset.mode); const t = cur(); if (t && DLX[t.id] && PS.src === 'local') { const want = b.dataset.mode === 'video' ? 'video' : 'audio'; if (DLX[t.id][want]) { const pos = curTime(); loadCur(true).then(() => setTimeout(() => seekTo(pos), 300)); } } });
const seek = $('#seek');
seek.addEventListener('input', () => { seeking = true; const d = curDur(); $('#tCur').textContent = fmt(seek.value / 1000 * d); seek.style.setProperty('--p', seek.value / 10 + '%'); });
seek.addEventListener('change', () => { seekTo(seek.value / 1000 * curDur()); seeking = false; });
document.addEventListener('keydown', e => { if (e.target.matches('input')) return; if (e.code === 'Space') { e.preventDefault(); toggle(); } if (e.key === 'Escape') { closeSheet(); closeNP(); } });
// swipe down on the player header to close
(() => { let y0 = null; const np = $('#np'); np.addEventListener('touchstart', e => { y0 = np.scrollTop <= 0 && !e.target.closest('#seek,.np-media') ? e.touches[0].clientY : null; }, { passive: true }); np.addEventListener('touchend', e => { if (y0 != null && e.changedTouches[0].clientY - y0 > 110) closeNP(); y0 = null; }, { passive: true }); })();

pruneCache();
// Keys never need re-entering: restore from a restore link, or from the IndexedDB copy if localStorage was cleared.
(() => {
  const m = location.hash.match(/^#restore=(.+)$/);
  if (m) {
    try { const k = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1]))))); for (const f of ['ghToken', 'country']) if (k[f]) S[f] = k[f]; saveS(); setTimeout(() => toast('Your keys are restored'), 300); } catch {}
    history.replaceState(null, '', location.pathname + '#home');
  }
})();
idb.kvGet('settings').then(saved => {
  const hasLocal = !!localStorage.getItem('echo:settings');
  if (saved && (!hasLocal || (!S.ghToken && saved.ghToken))) {
    for (const f of ['ghToken', 'country']) if (!S[f] && saved[f]) S[f] = saved[f];
    store.set('settings', S); if (cur()) loadLyrics(cur()); renderView();
  } else if (hasLocal) saveS();
}).catch(() => {});
renderView();
renderLyrics();
// sync on start, every 3 minutes, and when the app goes to the background
setTimeout(syncNow, 1500); setInterval(syncNow, 3 * 60e3);
document.addEventListener('visibilitychange', () => { if (document.hidden) syncNow(); else scheduleSync(500); });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
