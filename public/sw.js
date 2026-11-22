/* BX Deck Lab — service worker: cache de imagens de peças (cache-first), dados do catálogo
 * (stale-while-revalidate) e aquecimento em segundo plano na primeira visita. */
// v3 revalida o índice antes de responder e descarta catálogos/imagens antigos.
const VERSION = 'v3';
const IMG_CACHE = 'bx-img-' + VERSION;
const API_CACHE = 'bx-api-' + VERSION;
const IMG_HOSTS = ['cdn.shopify.com', 'img.beybladehub.app', 'static.wikia.nocookie.net', 'beybladehub.app'];
// Só dados de catálogo (mudam raramente). Decks, perfis e torneios ficam sempre na rede pra não mostrar lista velha depois de publicar/editar.
const API_SWR = ['/api/parts-index', '/api/parts', '/api/products', '/api/decks-featured', '/api/site'];
const API_NEVER = ['/api/me', '/api/auth', '/api/oauth', '/api/admin', '/api/cosmetics'];

// Only the account ID is retained here. Bluetooth and private session data never
// run in a service worker; capture still belongs to the connected browser page.
function pushAccount(value,{write=false}={}) {
  return new Promise((resolve,reject)=>{
    const open=indexedDB.open('bx-push-settings',1);
    open.onupgradeneeded=()=>open.result.createObjectStore('settings');
    open.onerror=()=>reject(open.error);
    open.onsuccess=()=>{
      const db=open.result,tx=db.transaction('settings',write?'readwrite':'readonly'),store=tx.objectStore('settings');
      const request=write?store.put(value,'account'):store.get('account');let result;
      request.onsuccess=()=>{result=request.result;};
      tx.oncomplete=()=>{db.close();resolve(write?value:result);};
      tx.onerror=()=>{db.close();reject(tx.error);};
    };
  });
}
self.addEventListener('message',event=>{
  if(event.data?.type==='bp-push-account')event.waitUntil(pushAccount(typeof event.data.userId==='string'?event.data.userId:null,{write:true}));
});
self.addEventListener('push',event=>{
  event.waitUntil((async()=>{
    let data;try{data=event.data.json();}catch{return;}
    if(!data || !['battle-pass-launch','battle-pass-test'].includes(data.type) || await pushAccount()!==data.userId)return;
    const fallback='/assets/pwa/icon-192.png';let icon=fallback;
    try{const url=new URL(data.icon,self.location.origin);if(url.protocol==='https:' || url.origin===self.location.origin)icon=url.href;}catch{}
    const url=new URL('/battle-pass',self.location.origin);if(typeof data.sessionId==='string')url.searchParams.set('session',data.sessionId);
    await self.registration.showNotification(String(data.title??'BX Lab').slice(0,120),{
      body:String(data.body??'').slice(0,220),icon,badge:fallback,
      tag:'bx-training-'+(data.sessionId??'test'),renotify:false,silent:true,
      timestamp:Number.isFinite(Date.parse(data.at))?Date.parse(data.at):Date.now(),
      data:{url:url.href,sessionId:data.sessionId??null,eventId:data.eventId??null,userId:data.userId},
    });
  })());
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const data=event.notification.data??{},windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const client=windows.find(w=>w.frameType!=='nested' && new URL(w.url).origin===self.location.origin);
    if(client){await client.focus();client.postMessage({type:'bp-open-session',sessionId:data.sessionId});return;}
    const url=new URL('/battle-pass',self.location.origin);if(data.sessionId)url.searchParams.set('session',data.sessionId);
    await self.clients.openWindow(url.href);
  })());
});

self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (![IMG_CACHE, API_CACHE].includes(k)) await caches.delete(k);
    await self.clients.claim();
    for(const client of await self.clients.matchAll({type:'window',includeUncontrolled:true}))client.postMessage({type:'bp-worker-ready'});
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
      // O índice decide quais peças aparecem no montador. Revalidar antes
      // de responder evita devolver um catálogo antigo na primeira abertura.
      if (url.pathname === '/api/parts-index') {
        try {
          const fresh = await fetch(req, { cache: 'no-cache', signal: AbortSignal.timeout(8000) });
          if (fresh.ok) { await cache.put(req, fresh.clone()); return fresh; }
          if (!hit) return fresh;
        } catch { /* offline: usa a última versão boa */ }
        return hit || Response.error();
      }
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
