/* sw.js — オフラインキャッシュ（レッスンWi-Fi不安定でも動く） */
var CACHE = 'daichi-piano-v1';
var ASSETS = [
  './', './index.html', './styles.css', './manifest.webmanifest',
  './js/theory.js', './js/songs.js', './js/audio.js', './js/pitch.js',
  './js/render.js', './js/keyboard.js', './js/app.js',
  './icons/icon-192.png', './icons/icon-512.png'
];
self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) { return Promise.all(ASSETS.map(function (a) { return c.add(a).catch(function(){}); })); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) { if (k !== CACHE) return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(function (r) {
      return r || fetch(e.request).then(function (resp) {
        var copy = resp.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy).catch(function(){}); });
        return resp;
      }).catch(function () { return caches.match('./index.html'); });
    })
  );
});
