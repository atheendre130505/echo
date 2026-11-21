// Offline shell so downloaded songs still play without a connection.
const V = 'echo-v8';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'icon.svg', 'manifest.webmanifest'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  // one cached copy per file: the song catalog is versioned with ?u=…, don't keep every old version
  const key = u.origin + u.pathname;
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(V).then(x => x.put(key, c)); } return r; })
    .catch(() => caches.match(key).then(r => r || caches.match('index.html'))));
});
