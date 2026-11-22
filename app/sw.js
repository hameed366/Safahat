const V='safahat-b506e5b4cb',CORE=["./","index.html","native-shim.js","manifest.webmanifest","apple-touch-icon.png","icon-192.png","icon-512.png","fonts/amiri/400.css","fonts/amiri/700.css","fonts/ibm-plex-sans-arabic/400.css","fonts/ibm-plex-sans-arabic/500.css","fonts/ibm-plex-sans-arabic/700.css","fonts/readex-pro/500.css","fonts/readex-pro/600.css","fonts/readex-pro/700.css","fonts/reem-kufi/600.css","fonts/reem-kufi/700.css","lib/jszip.min.js","lib/pdf-lib.min.js","lib/pdf.min.js","lib/pdf.worker.min.js","lib/pptxgen.bundle.js","lib/xlsx.full.min.js"];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V&&k!=='safahat-cdn').map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
const CDN=/^https:\/\/(cdn\.jsdelivr\.net|tessdata\.projectnaptha\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);
  if(u.origin===location.origin){
    if(r.mode==='navigate'){e.respondWith(fetch(r).then(res=>{const c=res.clone();caches.open(V).then(x=>x.put('index.html',c));return res;}).catch(()=>caches.match('index.html')));return;}
    e.respondWith(caches.match(r,{ignoreSearch:true}).then(hit=>hit||fetch(r).then(res=>{if(res.ok){const c=res.clone();caches.open(V).then(x=>x.put(r,c));}return res;})));return;}
  if(CDN.test(r.url))e.respondWith(caches.open('safahat-cdn').then(x=>x.match(r).then(hit=>hit||fetch(r).then(res=>{if(res.ok||res.type==='opaque')x.put(r,res.clone());return res;}))));
});
