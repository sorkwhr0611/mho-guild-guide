// 직장인수렵단 공략집: 홈 화면 앱용 서비스 워커 (항상 새 버전 먼저, 오프라인이면 저장본)
const C = "mho-guide-v1";
self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET" || new URL(r.url).origin !== location.origin || r.url.includes("/api/")) return;
  e.respondWith(fetch(r).then((res) => { const cp = res.clone(); caches.open(C).then((c) => c.put(r, cp)); return res; }).catch(() => caches.match(r)));
});
