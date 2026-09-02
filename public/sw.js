/* BX Deck Lab — service worker: cache de imagens de peças (cache-first), dados do catálogo
 * (stale-while-revalidate) e aquecimento em segundo plano na primeira visita. */
const VERSION = 'v1';
const IMG_CACHE = 'bx-img-' + VERSION;
const API_CACHE = 'bx-api-' + VERSION;
const IMG_HOSTS = ['cdn.shopify.com', 'img.beybladehub.app', 'static.wikia.nocookie.net', 'beybladehub.app'];
// Só dados de catálogo (mudam raramente). Decks, perfis e torneios ficam sempre na rede pra não mostrar lista velha depois de publicar/editar.
const API_SWR = ['/api/parts-index', '/api/parts', '/api/products', '/api/decks-featured', '/api/site'];
const API_NEVER = ['/api/me', '/api/auth', '/api/oauth', '/api/admin', '/api/cosmetics'];

self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (![IMG_CACHE, API_CACHE].includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

const isImageHost = (url) => IMG_HOSTS.some((h) => url.host === h || url.host.endsWith('.' + h));
const isSwrApi = (url) => url.origin === self.location.origin && API_SWR.some((p) => url.pathname === p || url.pathname.startsWith(p)) && !API_NEVER.some((p) => url.pathname.startsWith(p)) && !url.search.includes('mine=');

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url; try { url = new URL(req.url); } catch { return; }

  const looksImage = req.destination === 'image' || /\.(png|jpe?g|webp|gif|avif|svg)$/i.test(url.pathname);
  if ((isImageHost(url) && looksImage) || (url.origin === self.location.origin && url.pathname.startsWith('/uploads/'))) {
    e.respondWith((async () => {
      const cache = await caches.open(IMG_CACHE);
      const hit = await cache.match(req.url);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && (res.ok || res.type === 'opaque')) cache.put(req.url, res.clone()).catch(() => {});
        return res;
      } catch (err) { return hit || Response.error(); }
    })());
    return;
  }

  if (isSwrApi(url)) {
    e.respondWith((async () => {
      const cache = await caches.open(API_CACHE);
      const hit = await cache.match(req);
      const refresh = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()).catch(() => {}); return res; }).catch(() => null);
      if (hit) { e.waitUntil(refresh); return hit; }
      const res = await refresh;
      return res || new Response(JSON.stringify({ error: 'offline' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    })());
  }
});

// Aquecimento: a página manda a lista de fotos do catálogo; baixamos devagar o que ainda não está em cache.
let warming = false;
self.addEventListener('message', (e) => {
  const msg = e.data || {};
  if (msg.type !== 'warm' || !Array.isArray(msg.urls) || warming) return;
  warming = true;
  e.waitUntil((async () => {
    const cache = await caches.open(IMG_CACHE);
    const todo = [];
    for (const u of msg.urls.slice(0, 1500)) { try { if (!(await cache.match(u))) todo.push(u); } catch {} }
    let i = 0;
    await Promise.all(Array.from({ length: 3 }, async () => {
      while (i < todo.length) {
        const u = todo[i++];
        try {
          const res = await fetch(new Request(u, { mode: 'no-cors', referrerPolicy: 'no-referrer' }));
          if (res && (res.ok || res.type === 'opaque')) await cache.put(u, res);
        } catch {}
        await new Promise((r) => setTimeout(r, 40));
      }
    }));
    warming = false;
    const clients = await self.clients.matchAll();
    clients.forEach((c) => c.postMessage({ type: 'warmed', count: todo.length }));
  })());
});
