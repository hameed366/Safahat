/*
 * صفحات — طبقة التطبيق الأصلي (iOS / Android)
 * Provides the same `window.claude.use(name)` capabilities the web version
 * gets inside Claude, implemented with native plugins:
 *   downloads → save into the app's Documents folder (visible in the Files app) + system share sheet
 *   sample    → Claude API with the user's own key (stored on the device only)
 *   assets / db / user → not available (cloud sync stays off; backup files still work)
 * It also forwards PDFs opened "with صفحات" from other apps.
 */
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { App } from '@capacitor/app';

const KEY = 'safahat-api-key';
const MODELS = { quick: 'claude-haiku-5-5', default: 'claude-sonnet-5-5', complex: 'claude-opus-5-5' };
const store = {
  get(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } },
  set(k, v) { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) {} },
};

async function toBase64(data) {
  let blob;
  if (data instanceof Blob) blob = data;
  else if (typeof data === 'string') blob = new Blob([data], { type: 'text/plain;charset=utf-8' });
  else if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) blob = new Blob([data]);
  else blob = new Blob([String(data)]);
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return btoa(s);
}
const safeName = n => String(n || 'ملف').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').slice(0, 180);

/* ---------- downloads ---------- */
const downloads = {
  async save({ filename, data }) {
    const name = safeName(filename);
    const b64 = await toBase64(data);
    // Documents is visible in the Files app under "On My iPhone/iPad › صفحات" (and in app storage on Android)
    const res = await Filesystem.writeFile({ path: 'صفحات/' + name, data: b64, directory: Directory.Documents, recursive: true });
    try {
      await Share.share({ title: name, files: [res.uri], dialogTitle: name });
    } catch (e) {
      // closing the share sheet is fine — the file is already saved in Documents
    }
    return { ok: true };
  },
};

/* ---------- Claude API (user's own key) ---------- */
function apiError(status, msg) {
  const e = new Error(msg || 'error');
  e.code = status === 401 || status === 403 ? 'not_granted' : status === 429 || status === 529 ? 'rate_limited' : status === 413 ? 'too_large' : 'unavailable';
  return e;
}
async function sample(input, opts = {}) {
  const key = store.get(KEY);
  if (!key) throw Object.assign(new Error('no key'), { code: 'not_granted' });
  let messages = typeof input === 'string' ? [{ role: 'user', content: input }] : input.map(m => ({ role: m.role, content: m.content }));
  if (opts.images && opts.images.length) {
    const last = messages[messages.length - 1];
    const blocks = [];
    for (const img of opts.images) blocks.push({ type: 'image', source: { type: 'base64', media_type: img.type && /^image\/(png|jpeg|gif|webp)$/.test(img.type) ? img.type : 'image/jpeg', data: await toBase64(img) } });
    blocks.push({ type: 'text', text: typeof last.content === 'string' ? last.content : String(last.content) });
    last.content = blocks;
  }
  const model = (opts.model) || MODELS[opts.modelTier || 'default'] || MODELS.default;
  const stream = typeof opts.onText === 'function';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: opts.signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model, max_tokens: 8192, stream, messages }),
  });
  if (!res.ok) { let t = ''; try { t = await res.text(); } catch (e) {} throw apiError(res.status, t); }
  if (!stream) {
    const j = await res.json();
    const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    return { text, truncated: j.stop_reason === 'max_tokens' };
  }
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '', text = '', stop = null;
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
      const line = chunk.split('\n').find(l => l.startsWith('data:')); if (!line) continue;
      let ev; try { ev = JSON.parse(line.slice(5).trim()); } catch (e) { continue; }
      if (ev.type === 'content_block_delta' && ev.delta && ev.delta.type === 'text_delta') { text += ev.delta.text; try { opts.onText({ text, delta: ev.delta.text }); } catch (e) {} }
      else if (ev.type === 'message_delta' && ev.delta) stop = ev.delta.stop_reason || stop;
      else if (ev.type === 'error') throw apiError(500, ev.error && ev.error.message);
    }
  }
  return { text, truncated: stop === 'max_tokens' };
}
sample.limits = async () => ({ images: { maxCount: 20, maxInputBytes: 5 * 1024 * 1024 } });
sample.json = async (input, opts) => { const r = await sample(input, opts); const s = r.text; const a = s.search(/[\[{]/); return JSON.parse(s.slice(a, s.lastIndexOf(s[a] === '[' ? ']' : '}') + 1)); };

/* ---------- capability entry point (same shape as inside Claude) ---------- */
window.claude = {
  use: async name => {
    if (name === 'downloads') return downloads;
    if (name === 'sample') return store.get(KEY) ? sample : null;
    return null;
  },
};
window.SAFAHAT_NATIVE = {
  platform: Capacitor.getPlatform(),
  getKey: () => store.get(KEY),
  setKey: v => store.set(KEY, v),
  models: MODELS,
};

/* ---------- PDFs opened "with صفحات" from Files, Mail, WhatsApp… ---------- */
const pending = [];
async function openUrl(url) {
  if (!url || !/^(file|content):/i.test(url)) return;
  try {
    const r = await Filesystem.readFile({ path: url });
    const bin = atob(typeof r.data === 'string' ? r.data : await toBase64(r.data));
    const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    let name = decodeURIComponent(url.split('/').pop().split('?')[0] || 'ملف.pdf');
    const isPdf = u[0] === 0x25 && u[1] === 0x50 && u[2] === 0x44 && u[3] === 0x46;
    if (isPdf && !/\.pdf$/i.test(name)) name += '.pdf';
    const type = isPdf ? 'application/pdf' : /\.(png)$/i.test(name) ? 'image/png' : /\.(jpe?g)$/i.test(name) ? 'image/jpeg' : 'application/octet-stream';
    const file = new File([u], name, { type });
    if (window.safahatOpenFiles) window.safahatOpenFiles([file]); else pending.push(file);
  } catch (e) { console.warn('open-in failed', e); }
}
if (Capacitor.isNativePlatform()) {
  App.addListener('appUrlOpen', ev => openUrl(ev.url));
  App.getLaunchUrl().then(r => r && openUrl(r.url)).catch(() => {});
  const flush = setInterval(() => { if (window.safahatOpenFiles && pending.length) { window.safahatOpenFiles(pending.splice(0)); } if (window.safahatOpenFiles && !pending.length) clearInterval(flush); }, 700);
  setTimeout(() => clearInterval(flush), 60000);
}
