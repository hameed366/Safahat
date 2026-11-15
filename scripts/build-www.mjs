// Builds www/ for Capacitor from src/safahat.html: bundles every library and the
// base fonts locally (works offline), and injects the native capability layer.
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const www = path.join(root, 'www');
const nm = p => path.join(root, 'node_modules', p);
fs.rmSync(www, { recursive: true, force: true });
fs.mkdirSync(path.join(www, 'lib'), { recursive: true });

// 1) libraries (same versions the web artifact loads from cdnjs)
const LIBS = {
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js': ['pdfjs-dist/build/pdf.min.js', 'pdf.min.js'],
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js': ['pdfjs-dist/build/pdf.worker.min.js', 'pdf.worker.min.js'],
  'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js': ['pdf-lib/dist/pdf-lib.min.js', 'pdf-lib.min.js'],
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js': ['jszip/dist/jszip.min.js', 'jszip.min.js'],
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js': ['xlsx/dist/xlsx.full.min.js', 'xlsx.full.min.js'],
  'https://cdnjs.cloudflare.com/ajax/libs/pptxgenjs/3.12.0/pptxgen.bundle.js': ['pptxgenjs/dist/pptxgen.bundle.js', 'pptxgen.bundle.js'],
};
// pdf.js cmaps + standard fonts so Arabic/CJK PDFs render offline
for (const d of ['cmaps', 'standard_fonts']) {
  const src = nm('pdfjs-dist/' + d);
  if (fs.existsSync(src)) fs.cpSync(src, path.join(www, 'lib', d), { recursive: true });
}
let html = fs.readFileSync(path.join(root, 'src/safahat.html'), 'utf8');
for (const [url, [from, to]] of Object.entries(LIBS)) {
  fs.copyFileSync(nm(from), path.join(www, 'lib', to));
  html = html.split(url).join('lib/' + to);
}
// connection hints for the CDNs are pointless once everything is local
html = html.replace(/<link rel="preconnect" href="https:\/\/cdnjs\.cloudflare\.com"[^>]*>\n?/g, '');
const leftover = html.match(/https:\/\/cdnjs\.cloudflare\.com[^'"`\s)]*/g);
if (leftover) { console.error('Unmapped CDN URLs:', leftover); process.exit(1); }

// 2) base fonts (the extra font catalogue still loads from Google Fonts when online)
const FONTS = ['ibm-plex-sans-arabic', 'amiri', 'readex-pro', 'reem-kufi'];
const W = { 'ibm-plex-sans-arabic': [400, 500, 700], amiri: [400, 700], 'readex-pro': [500, 600, 700], 'reem-kufi': [600, 700] };
let fontLinks = '';
for (const f of FONTS) {
  const dir = nm('@fontsource/' + f);
  fs.cpSync(path.join(dir, 'files'), path.join(www, 'fonts', f, 'files'), { recursive: true });
  for (const w of W[f]) {
    const css = path.join(dir, `${w}.css`);
    if (!fs.existsSync(css)) continue;
    fs.copyFileSync(css, path.join(www, 'fonts', f, `${w}.css`));
    fontLinks += `<link rel="stylesheet" href="fonts/${f}/${w}.css">\n`;
  }
}
html = html.replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css2\?family=Amiri[^"]*">/, fontLinks);

// 3) native capability layer, loaded before the app
await build({ entryPoints: [path.join(root, 'src/native-shim.js')], bundle: true, format: 'iife', target: ['safari15', 'chrome100'], minify: true, outfile: path.join(www, 'native-shim.js') });
html = html.replace('<script src="lib/pdf.min.js"></script>', '<script src="native-shim.js"></script>\n<script src="lib/pdf.min.js"></script>');

// 4) full document (the artifact host normally supplies this skeleton)
const head = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no">
<meta name="format-detection" content="telephone=no">
<meta name="theme-color" content="#0f1b1e">
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);color-scheme:light}body{margin:0;font:14px system-ui,-apple-system,sans-serif}img{max-width:100%}[hidden]{display:none!important}html,body{overscroll-behavior:none;-webkit-tap-highlight-color:transparent}</style>
</head>
<body>
`;
// 5) web edition (node scripts/build-www.mjs --web): an installable app for "Add to Home Screen" on iPhone/iPad,
//    with a service worker that keeps everything on the device so it opens without internet
const WEB = process.argv.includes('--web');
let pageHead = head;
if (WEB) {
  for (const f of fs.readdirSync(path.join(root, 'web'))) fs.copyFileSync(path.join(root, 'web', f), path.join(www, f));
  pageHead = head.replace('<meta name="theme-color" content="#0f1b1e">', `<meta name="theme-color" content="#0f1b1e">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="icon" type="image/png" href="icon-192.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="صفحات">
<script>window.SAFAHAT_WEB=true;if('serviceWorker' in navigator)addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));</script>`);
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.relative(www, path.join(d, e.name)).split(path.sep).join('/')]);
  const all = walk(www).concat(['index.html']);
  // the core is stored on first visit; fonts files, cmaps and the rest are stored the first time they are used
  const core = ['./', 'index.html', 'native-shim.js', 'manifest.webmanifest', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png']
    .concat(all.filter(f => /^lib\/[^/]+\.js$/.test(f) || /^fonts\/[^/]+\/\d+\.css$/.test(f)));
  const crypto = await import('node:crypto');
  const ver = crypto.createHash('sha1').update(html).update(String(Date.now())).digest('hex').slice(0, 10);
  fs.writeFileSync(path.join(www, 'sw.js'), `const V='safahat-${ver}',CORE=${JSON.stringify([...new Set(core)])};
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V&&k!=='safahat-cdn').map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
const CDN=/^https:\\/\\/(cdn\\.jsdelivr\\.net|tessdata\\.projectnaptha\\.com|fonts\\.googleapis\\.com|fonts\\.gstatic\\.com)\\//;
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);
  if(u.origin===location.origin){
    if(r.mode==='navigate'){e.respondWith(fetch(r).then(res=>{const c=res.clone();caches.open(V).then(x=>x.put('index.html',c));return res;}).catch(()=>caches.match('index.html')));return;}
    e.respondWith(caches.match(r,{ignoreSearch:true}).then(hit=>hit||fetch(r).then(res=>{if(res.ok){const c=res.clone();caches.open(V).then(x=>x.put(r,c));}return res;})));return;}
  if(CDN.test(r.url))e.respondWith(caches.open('safahat-cdn').then(x=>x.match(r).then(hit=>hit||fetch(r).then(res=>{if(res.ok||res.type==='opaque')x.put(r,res.clone());return res;}))));
});
`);
  console.log('web edition: manifest + service worker (' + core.length + ' core files)');
}
fs.writeFileSync(path.join(www, 'index.html'), pageHead + html + '\n</body>\n</html>\n');
console.log('www built:', fs.readdirSync(path.join(www, 'lib')).join(', '));
