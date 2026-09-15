// Cache only the shipped application. Imported databases and Bangumi requests
// are never sent to, or stored by, this service worker.
const PREFIX='funshiki-shell-';
self.addEventListener('install',event=>event.waitUntil((async()=>{const r=await fetch('/mobile/offline-files.json',{cache:'no-store'});const manifest=await r.json();const cache=await caches.open(PREFIX+manifest.version);await cache.addAll([...manifest.files,'/mobile/','/mobile/offline-files.json']);})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{const manifest=await (await fetch('/mobile/offline-files.json').catch(()=>caches.match('/mobile/offline-files.json'))).json();const keep=PREFIX+manifest.version;for(const key of await caches.keys())if(key.startsWith(PREFIX)&&key!==keep)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(url.origin!==location.origin||event.request.method!=='GET')return;event.respondWith((async()=>{const cached=await caches.match(event.request);return cached||fetch(event.request);})());});
