// 인터넷 없이도 열리게 화면 파일만 보관 (연결 주소 /api는 보관 안 함)
var CACHE = "pcs-photo-2", FILES = ["./", "app.js", "photo.js", "link.js", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
// 새 파일 먼저, 안 되면 보관본
self.addEventListener("fetch", function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.indexOf("/api/") === 0) return;
  e.respondWith(fetch(e.request).then(function (r) {
    if (r.ok) { var copy = r.clone(); caches.open(CACHE).then(function (c) { c.put(url.pathname === "/" ? "./" : e.request, copy); }); }
    return r;
  }).catch(function () { return caches.match(url.pathname === "/" ? "./" : e.request); }));
});
