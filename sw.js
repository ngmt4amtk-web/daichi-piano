/* sw.js — オフライン対応（ネットワーク優先・更新が必ず反映される）
 * 旧版: キャッシュ優先で更新が出ない問題 → v2でネットワーク優先に変更。 */
var CACHE = 'daichi-piano-v4';
var ASSETS = [
  './', './index.html', './styles.css', './manifest.webmanifest',
  './js/theory.js', './js/songs.js', './js/audio.js', './js/pitch.js',
  './js/render.js', './js/keyboard.js', './js/app.js',
  './icons/icon-192.png', './icons/icon-512.png'
];
self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(ASSETS.map(function (a) { return c.add(a).catch(function () {}); }));
  }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) { if (k !== CACHE) return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
// ネットワーク優先: オンラインなら常に最新、失敗時のみキャッシュ（オフライン）
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(function (resp) {
      var copy = resp.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy).catch(function () {}); });
      return resp;
    }).catch(function () {
      return caches.match(e.request).then(function (r) { return r || caches.match('./index.html'); });
    })
  );
});
