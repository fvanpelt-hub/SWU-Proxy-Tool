\
/* SWU Proxy Sheet Tool — v0.2.6b
   - Case-insensitive name search + catalog fallback (fixes 'luke skywalker')
   - Keeps overlay + pasted-list fixes from 0.2.6a
*/
(() => {
  'use strict';
  console.log('[swu-sheet] script loaded');
  const FN_BASE = '/.netlify/functions';
  const $ = (id) => document.getElementById(id);
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const mmToPx = (mm, dpi) => (mm / 25.4) * dpi;
  const inToPx  = (inch, dpi) => inch * dpi;

  function byBtnText(txt) {
    return Array.from(document.querySelectorAll('button, input[type=\"button\"], input[type=\"submit\"]'))
      .find(b => (b.textContent || b.value || '').trim().toLowerCase() === txt.toLowerCase()) || null;
  }
  function SWU(path, params = {}) {
    const usp = new URLSearchParams({ path, ...params });
    return fetch(`${FN_BASE}/swu?${usp.toString()}`, { redirect: 'follow' });
  }

  const blobCache = new Map();
  const bmpCache  = new Map();

  async function fetchWithBackoff(url, tries = 4, timeoutMs = 12000) {
    if (blobCache.has(url)) return blobCache.get(url);
    let lastErr;
    for (let i = 0; i < tries; i++) {
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), timeoutMs);
        const res = await fetch(url, { signal: ctl.signal, redirect: 'follow' });
        clearTimeout(t);
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const blob = await res.blob();
        blobCache.set(url, blob);
        return blob;
      } catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 250 * (i + 1))); }
    }
    throw lastErr;
  }

  async function fileToBitmap(file) {
    if (!file) return null;
    const blob = file instanceof Blob ? file : new Blob([await file.arrayBuffer()], { type: file.type || 'image/png' });
    return await createImageBitmap(blob);
  }

  // --- Name resolution helpers ---
  async function trySearchByName(name) {
    const res = await SWU('/cards/search', { q: `name:\"${name}\"` });
    if (!res.ok) return null;
    const js = await res.json();
    return Array.isArray(js) ? js[0] : js?.data?.[0] || null;
  }
  function titleCase(s) {
    return (s || '').toLowerCase().replace(/\b([a-z])/g, (m, c) => c.toUpperCase());
  }

  async function resolveSWUByName(name) {
    const cacheKey = `name:${name}`;
    if (bmpCache.has(cacheKey)) return bmpCache.get(cacheKey);

    // 1) exact
    let hit = await trySearchByName(name);

    // 2) fallback: catalog case-insensitive/partial
    if (!hit) {
      try {
        const catRes = await SWU('/catalog/card-names');
        if (catRes.ok) {
          const cat = await catRes.json();
          const names = cat?.data || cat?.values || cat || [];
          const needle = (name || '').toLowerCase().trim();
          let best = names.find(n => (n || '').toLowerCase() === needle)
                  || names.find(n => (n || '').toLowerCase().includes(needle))
                  || titleCase(name);
          hit = await trySearchByName(best);
          if (!hit) console.warn('[swu-sheet] catalog fallback failed for', name, '→ tried', best);
        }
      } catch (e) { console.warn('[swu-sheet] catalog fetch failed', e); }
    }

    if (!hit) throw new Error(`No SWU match for \"${name}\"`);

    const set = hit.set || hit.setCode || hit.code || hit.Set || hit.set_code;
    const num = (hit.setnumber ?? hit.number ?? hit.collector_number ?? hit.Number);
    if (set && num != null) {
      const url = `${FN_BASE}/swu?${new URLSearchParams({ path: `/cards/${set}/${num}`, format: 'image' })}`;
      const blob = await fetchWithBackoff(url);
      const bmp = await createImageBitmap(blob);
      bmpCache.set(cacheKey, bmp);
      return bmp;
    }

    const direct = hit.image || hit.images?.large || hit.images?.front || hit.img || hit.imageUrl || hit.FrontArt;
    if (!direct) throw new Error(`No image URL for \"${name}\"`);
    try {
      const u = new URL(direct);
      if (u.hostname.endsWith('swu-db.com')) {
        const prox = `${FN_BASE}/swu?${new URLSearchParams({ url: u.toString() })}`;
        const blob = await fetchWithBackoff(prox);
        const bmp = await createImageBitmap(blob);
        bmpCache.set(cacheKey, bmp);
        return bmp;
      }
    } catch {}
    const blob = await fetchWithBackoff(direct);
    const bmp = await createImageBitmap(blob);
    bmpCache.set(cacheKey, bmp);
    return bmp;
  }

  // ---- geometry + rendering (unchanged from 0.2.6a) ----
  function chooseOrientation(dpi, cols, rows, cardW, cardH, mL, mT) {
    const fitsPortrait  = (cols * cardW + 2 * mL <= 8.5) && (rows * cardH + 2 * mT <= 11);
    const fitsLandscape = (cols * cardW + 2 * mL <= 11)  && (rows * cardH + 2 * mT <= 8.5);
    return fitsPortrait ? { wIn: 8.5, hIn: 11, orient: 'portrait' }
         : fitsLandscape ? { wIn: 11, hIn: 8.5, orient: 'landscape' }
         : { wIn: 11, hIn: 8.5, orient: 'landscape' };
  }
  function getGeom() {
    const dpi   = parseInt(($('#dpi')?.value || '300'), 10) || 300;
    const cardW = parseFloat($('#cardW')?.value || '2.5');
    const cardH = parseFloat($('#cardH')?.value || '3.5');
    const rows  = parseInt($('#rows')?.value || '2', 10);
    const cols  = parseInt($('#cols')?.value || '4', 10);
    const mL    = parseFloat($('#marginL')?.value || '0.5');
    const mT    = parseFloat($('#marginT')?.value || '0.75');
    const bleed = parseFloat($('#bleedMM')?.value || '0.5');
    const { wIn, hIn, orient } = chooseOrientation(dpi, cols, rows, cardW, cardH, mL, mT);
    const PAGE_W = Math.round(inToPx(wIn, dpi));
    const PAGE_H = Math.round(inToPx(hIn, dpi));
    const CW = Math.round(inToPx(cardW, dpi));
    const CH = Math.round(inToPx(cardH, dpi));
    const BL = Math.max(0, Math.round(mmToPx(bleed, dpi)));
    const startX = Math.round(inToPx(mL, dpi));
    const startY = Math.round(inToPx(mT, dpi));
    const slots = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = startX + c * CW; const y = startY + r * CH; slots.push({ x, y, w: CW, h: CH });
    }
    return { dpi, PAGE_W, PAGE_H, CW, CH, BL, rows, cols, slots, wIn, hIn, orient };
  }
  async function ensureUserSVGOverlay() {
    if (state.overlayBmp) return;
    const p = 'assets/letter_poker_v2_fixed.svg';
    try { state.overlayBmp = await (await fetch(p)).blob().then(async b => {
      const low = p.toLowerCase();
      if (!low.endsWith('.svg')) return await createImageBitmap(b);
      const url = URL.createObjectURL(b); const img = new Image(); img.decoding = 'async'; img.src = url;
      try { if (img.decode) await img.decode(); else await new Promise((res, rej) => { img.onload = res; img.onerror = rej; }); } finally {}
      return img;
    }); state.overlayPath = p; } catch (e) { console.warn('[swu-sheet] overlay load failed', e); }
  }
  const state = { names: [], overlayBmp: null, overlayPath: null };
  function wrapText(ctx, text, x, y, mw, lh) {
    const lines = (text + '').split('\\n').flatMap(line => {
      const words = line.split(' '); let buf = '', out = [];
      for (const w of words) { const t = buf ? buf + ' ' + w : w; if (ctx.measureText(t).width > mw) { out.push(buf || w); buf = w; } else buf = t; }
      if (buf) out.push(buf); return out;
    });
    lines.forEach((ln, i) => ctx.fillText(ln, x, y + i * lh));
  }
  async function render() {
    const geom = getGeom();
    const canvas = $('#sheet') || document.querySelector('canvas') || document.createElement('canvas');
    if (!canvas.parentNode) document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d', { alpha: false });
    if (canvas.width !== geom.PAGE_W) canvas.width = geom.PAGE_W;
    if (canvas.height !== geom.PAGE_H) canvas.height = geom.PAGE_H;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, geom.PAGE_W, geom.PAGE_H);
    await ensureUserSVGOverlay();
    const overlayOn = $('#overlayToggle')?.checked ?? true;
    const overlayOpacity = parseFloat($('#overlayOpacity')?.value || '1');
    if (overlayOn && state.overlayBmp) { ctx.save(); ctx.globalAlpha = clamp(overlayOpacity, 0, 1);
      ctx.drawImage(state.overlayBmp, 0, 0, geom.PAGE_W, geom.PAGE_H); ctx.restore(); }
    if (geom.BL > 0) { ctx.fillStyle = '#000';
      for (const s of geom.slots) ctx.fillRect(s.x - geom.BL, s.y - geom.BL, s.w + 2*geom.BL, s.h + 2*geom.BL); }
    const names = state.names.slice(0, geom.slots.length);
    for (let i = 0; i < names.length; i++) {
      const s = geom.slots[i], name = names[i];
      try { const bmp = await resolveSWUByName(name); ctx.drawImage(bmp, s.x, s.y, s.w, s.h); }
      catch (e) { console.warn('[swu-sheet] failed image', name, e);
        ctx.fillStyle = '#ffeded'; ctx.fillRect(s.x, s.y, s.w, s.h);
        ctx.strokeStyle = '#d33'; ctx.lineWidth = 6; ctx.strokeRect(s.x+3, s.y+3, s.w-6, s.h-6);
        ctx.fillStyle = '#900'; ctx.font = '26px system-ui, sans-serif';
        wrapText(ctx, `Failed:\n${name}`, s.x + 16, s.y + 40, s.w - 32, 34); }
    }
    const sb = $('#statusBar'); if (sb) sb.textContent = `${names.length}/${geom.slots.length} slots @ ${geom.PAGE_W}×${geom.PAGE_H} (${geom.orient})`;
    console.log('[swu-sheet]', `${names.length}/${geom.slots.length} slots filled @ ${geom.PAGE_W}×${geom.PAGE_H} (${geom.orient})`);
  }
  function bind() {
    document.querySelectorAll('form').forEach(f => f.addEventListener('submit', e => e.preventDefault()));
    const parseBtn = $('#btnParse') || byBtnText('Add from Pasted List');
    const addBtn   = $('#btnAddSearch') || byBtnText('Add');
    const saveBtn  = $('#btnSavePNG') || byBtnText('Export PNG');
    const printBtn = $('#btnPrint') || byBtnText('Print');
    saveBtn && saveBtn.addEventListener('click', (e) => { e.preventDefault();
      const a = document.createElement('a'); a.href = ($('#sheet') || document.querySelector('canvas')).toDataURL('image/png');
      a.download = 'cards-sheet.png'; a.click(); });
    printBtn && printBtn.addEventListener('click', (e) => { e.preventDefault();
      const jsPDF = window.jspdf && window.jspdf.jsPDF; const { wIn, hIn } = getGeom();
      if (jsPDF) { const doc = new jsPDF({ orientation: wIn > hIn ? 'landscape' : 'portrait', unit: 'in', format: [wIn, hIn] });
        const dataURL = ($('#sheet') || document.querySelector('canvas')).toDataURL('image/jpeg', 0.95);
        doc.addImage(dataURL, 'JPEG', 0, 0, wIn, hIn); doc.save('cards-sheet.pdf'); } else { window.print(); } });
    parseBtn && parseBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const area = $('#pasteList') || document.querySelector('textarea');
      const sanitize = (s) => s.replace(/^\s*\d+\s*[x×]\s*/i, '').replace(/\s{2,}/g, ' ').trim();
      const names = (area?.value || '').split(/[\n,;]+/).map(sanitize).filter(Boolean);
      console.log('[swu-sheet] parsed names:', names);
      state.names = names; await render();
    });
    addBtn && addBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const box = $('#searchBox') || document.querySelector('input[type=\"text\"]');
      const sanitize = (s) => s.replace(/^\s*\d+\s*[x×]\s*/i, '').replace(/\s{2,}/g, ' ').trim();
      const n = sanitize(box?.value || ''); if (!n) return; state.names.push(n); await render();
    });
    $('#overlayFile')?.addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0]; state.overlayBmp = await fileToBitmap(f);
      state.overlayPath = f?.name || 'upload'; await render();
    });
    $('#overlayToggle')?.addEventListener('change', render);
    $('#overlayOpacity')?.addEventListener('input', render);
    ['cardW','cardH','rows','cols','marginL','marginT','dpi','bleedMM'].forEach(id => {
      const el = document.getElementById(id); el?.addEventListener('input', render); el?.addEventListener('change', render);
    });
  }
  async function init() {
    if ($('#rows')) $('#rows').value = $('#rows').value || '2';
    if ($('#cols')) $('#cols').value = $('#cols').value || '4';
    bind();
    try { const ping = await SWU('/catalog/card-names'); console.log('[swu-sheet] proxy ping:', ping.status); }
    catch (e) { console.error('[swu-sheet] proxy ping failed', e); }
    await render(); console.log('[swu-sheet] init complete');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
