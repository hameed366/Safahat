# Offline check of the bundled OCR: serves www/, blocks every outside request, and reads a test image
# with the same engine files and paths the app uses. Run by .github/workflows/check.yml.
import asyncio, subprocess, sys, time
from playwright.async_api import async_playwright
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8799', '-d', 'www'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
JS = r"""async () => {
  const base = new URL(window.SAFAHAT_OCR_BASE, location.href).href;
  await new Promise((ok, no) => { const s = document.createElement('script'); s.src = base + 'tesseract.min.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
  const c = document.createElement('canvas'); c.width = 900; c.height = 260; const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, 900, 260); x.fillStyle = '#000';
  x.font = '48px sans-serif'; x.fillText('Hello Safahat 2026', 40, 90);
  x.font = '56px serif'; x.direction = 'rtl'; x.textAlign = 'right'; x.fillText('مرحبا بكم في صفحات', 860, 200);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const w = await Tesseract.createWorker('ara+eng', 1, { workerPath: base + 'worker.min.js', corePath: base + 'core', langPath: base + 'lang' });
  const r = await w.recognize(blob); await w.terminate();
  return r.data.text;
}"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page()
        outside = []
        async def guard(route):
            u = route.request.url
            if u.startswith('http://localhost:8799/') or u.startswith('data:') or u.startswith('blob:'): await route.continue_()
            else: outside.append(u); await route.abort()
        await pg.route('**/*', guard)
        await pg.goto('http://localhost:8799/index.html'); await pg.wait_for_timeout(2000)
        base = await pg.evaluate('window.SAFAHAT_OCR_BASE || ""')
        if not base: print('FAIL: OCR is not bundled in www/'); sys.exit(1)
        text = await pg.evaluate(JS)
        print('Recognized:', repr(text))
        ok = 'Hello' in text and 'صفحات' in text
        print('Blocked outside requests during the test:', len(outside))
        print('PASS' if ok else 'FAIL'); await b.close(); srv.terminate(); sys.exit(0 if ok else 1)
asyncio.run(main())
