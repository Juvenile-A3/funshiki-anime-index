// Cache only the shipped application. Imported databases and Bangumi requests
// are never sent to, or stored by, this service worker.
const PREFIX='funshiki-shell-';
const SHELL_VERSION='7adad368d12c6993';
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const r=await fetch('/mobile/offline-files.json',{cache:'no-store'});
  if(!r.ok)throw Error('Application manifest unavailable');
  const manifest=await r.json();
  if(manifest.version!==SHELL_VERSION)throw Error('Application update is still publishing');
  const cache=await caches.open(PREFIX+SHELL_VERSION);
  await cache.addAll([...manifest.files,'/mobile/','/mobile/offline-files.json'].map(url=>new Request(url,{cache:'reload'})));
  await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const key of await caches.keys())if(key.startsWith(PREFIX)&&key!==PREFIX+SHELL_VERSION)await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(url.origin!==location.origin||event.request.method!=='GET')return;event.respondWith((async()=>{const cache=await caches.open(PREFIX+SHELL_VERSION);return await cache.match(event.request)||fetch(event.request);})());});
