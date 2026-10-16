// 오프라인용 서비스워커
// 온라인이면 항상 최신 파일을 먼저 받고(네트워크 우선), 오프라인일 때만 저장해 둔 파일을 씁니다.
const CACHE = 'study-planner-v4';
const ASSETS = ['./', 'index.html', 'style.css?v=4', 'app.js?v=4', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then(res => {
      if (res.ok && (res.type === 'basic' || res.type === 'cors')) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request).then(hit => hit || caches.match('./')))
  );
});
