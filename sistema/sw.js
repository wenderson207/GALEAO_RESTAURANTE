// =====================================================================
// Service Worker — deixa o SISTEMA abrindo mesmo sem internet (tablet).
// Estratégia "rede primeiro": com internet pega a versão nova do código;
// sem internet usa a cópia salva. (Os DADOS ficam no IndexedDB, não aqui.)
// =====================================================================
const CACHE = "estoque-app-v2";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const doSistema = url.origin === self.location.origin && url.pathname.includes("/sistema/");
  const sdk = url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/");
  const fonte = url.hostname.includes("fonts.g");
  if (!doSistema && !sdk && !fonte) return; // Firestore/Auth passam direto

  if (sdk || fonte) {
    // versão fixa: cache primeiro
    e.respondWith(caches.match(req).then((r) => r || fetch(req).then((resp) => {
      const copia = resp.clone(); caches.open(CACHE).then((c) => c.put(req, copia)); return resp;
    })));
    return;
  }
  e.respondWith(fetch(req).then((resp) => {
    if (resp.ok) { const copia = resp.clone(); caches.open(CACHE).then((c) => c.put(req, copia)); }
    return resp;
  }).catch(() => caches.match(req).then((r) => r || caches.match("./index.html"))));
});
