const CACHE = 'stash-v6';          // app shell (versioned)
const MUSIC = 'stash-music';       // audio tracks, kept across versions
const ART = 'stash-art';           // gallery images, kept across versions
const ASSETS = ['./', './index.html', './manifest.json', './icon.svg', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, {cache: 'reload'})))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => ![CACHE, MUSIC, ART].includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });
const inflight = new Set();
function cacheFull(url) { // download the whole track once so it plays offline next time
  if (inflight.has(url)) return Promise.resolve(); inflight.add(url);
  return caches.open(MUSIC).then(c => c.match(url).then(hit => hit || fetch(url, {cache: 'no-store'}).then(r => { if (r.ok && r.status === 200) return c.put(url, r); })))
    .catch(() => {}).finally(() => inflight.delete(url));
}
async function ranged(res, range) {
  const buf = await res.arrayBuffer(), n = buf.byteLength, type = res.headers.get('Content-Type') || 'audio/mpeg';
  if (!range) return new Response(buf, {status: 200, headers: {'Content-Type': type, 'Content-Length': String(n), 'Accept-Ranges': 'bytes'}});
  const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
  let s = m[1] ? +m[1] : null, en = m[2] ? +m[2] : null;
  if (s === null) { s = Math.max(0, n - (en || 0)); en = n - 1; } else if (en === null || en >= n) en = n - 1;
  if (s >= n) return new Response(null, {status: 416, headers: {'Content-Range': `bytes */${n}`}});
  return new Response(buf.slice(s, en + 1), {status: 206, headers: {'Content-Type': type, 'Content-Range': `bytes ${s}-${en}/${n}`, 'Content-Length': String(en - s + 1), 'Accept-Ranges': 'bytes'}});
}
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.includes('/music/')) {
    const key = url.origin + url.pathname;
    e.respondWith(caches.open(MUSIC).then(c => c.match(key)).then(hit => {
      if (hit) return ranged(hit, req.headers.get('range'));
      e.waitUntil(cacheFull(key));
      return fetch(req);
    }));
    return;
  }
  const put = (name) => res => { if (res.ok && res.status === 200) { const cp = res.clone(); caches.open(name).then(c => c.put(req, cp)); } return res; };
  if (req.mode === 'navigate') { // network-first so updates arrive; cached page when offline
    e.respondWith(fetch(req, {cache: 'no-store'}).then(put(CACHE)).catch(() => caches.match(req, {ignoreSearch: true}).then(r => r || caches.match('./index.html'))));
    return;
  }
  const bucket = url.pathname.includes('/art/') ? ART : CACHE;
  e.respondWith(caches.match(req, {ignoreSearch: true}).then(r => r || fetch(req).then(put(bucket))));
});
