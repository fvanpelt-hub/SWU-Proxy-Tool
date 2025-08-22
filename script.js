/* SWU Proxy Sheet Tool — robust client (v0.2.3) */
(() => {
  'use strict';
  console.log('[swu-sheet] script loaded');

  // Netlify Function base declared early (avoids TDZ)
  const FN_BASE = '/.netlify/functions';

  // DOM ready
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // Helpers
  const $ = (id) => document.getElementById(id);
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const mmToPx = (mm, dpi) => (mm / 25.4) * dpi;
  const inToPx  = (inch, dpi) => inch * dpi;

  // Find a button by visible text as a fallback when IDs differ
  function byBtnText(txt) {
    return Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]'))
      .find(b => (b.textContent || b.value || '').trim().toLowerCase() === txt.toLowerCase()) || null;
  }

  function SWU(path, params = {}) {
    const usp = new URLSearchParams({ path, ...params });
    return fetch(`${FN_BASE}/swu?${usp.toString()}`, { redirect: 'follow' });
  }

  const blobCache = new Map(); // url -> Blob
  const bmpCache  = new Map(); // key -> ImageBitmap

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
      } catch (e) {
        lastErr = e;
        await new Promise(r => setTimeout(r, 300 * (i + 1)));
      }
    }
    throw lastErr;
  }

  async function fileToBitmap(file) {
    if (!file) return null;
    const blob = file instanceof Blob ? file : new Blob([await file.arrayBuffer()], { type: file.type || 'image/png' });
    return await createImageBitmap(blob);
  }

  // Resolve SWU image by name via proxy
  async function resolveSWUByName(name) {
    const cacheKey = `name:${name}`;
    if (bmpCache.has(cacheKey)) return bmpCache.get(cacheKey);

    // 1) Search
    const search = await SWU('/cards/search', { q: `name:"${name}"` });
    if (!search.ok) throw new Error(`SWU search failed for "${name}"`);
    const js = await search.json();
    const hit = Array.isArray(js) ? js[0] : js?.data?.[0];
    if (!hit) throw new Error(`No SWU match for "${name}"`);

    // 2) set/number -> image (support varied field casings)
    const set = hit.set || hit.setCode || hit.code || hit.Set || hit.set_code;
    const num = (hit.setnumber ?? hit.number ?? hit.collector_number ?? hit.Number);
    if (set && num != null) {
      const url = `${FN_BASE}/swu?${new URLSearchParams({ path: `/cards/${set}/${num}`, format: 'image' })}`;
      const blob = await fetchWithBackoff(url);
      const bmp = await createImageBitmap(blob);
      bmpCache.set(cacheKey, bmp);
      return bmp;
    }

    // 3) direct URL fallback, but proxy swu-db.com hosts to avoid CORS
    const direct = hit.image || hit.images?.large || hit.images?.front || hit.img || hit.imageUrl || hit.FrontArt;
    if (!direct) throw new Error(`No image URL for "${name}"`);

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

  const state = { names: [], overlayBmp: null };

  function parseList(text) { return (text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean); }

  function getGeom() {
    const dpi   = parseInt(($('#dpi')?.value || '300'), 10) || 300;
    const cardW = parseFloat($('#cardW')?.value || '2.5');
    const cardH = parseFloat($('#cardH')?.value || '3.5');
    const rows  = clamp(parseInt($('#rows')?.value || '4', 10), 1, 10);
    const cols  = clamp(parseInt($('#cols')?.value || '2', 10), 1, 10);
    const mL    = parseFloat($('#marginL')?.value || '0.5');
    const mT    = parseFloat($('#marginT')?.value || '0.75');
    const bleed = parseFloat($('#bleedMM')?.value || '0.5');

    const PAGE_W_IN = 8.5, PAGE_H_IN = 11;
    const PAGE_W = Math.round(inToPx(PAGE_W_IN, dpi));
    const PAGE_H = Math.round(inToPx(PAGE_H_IN, dpi));
    const CW = Math.round(inToPx(cardW, dpi));
    const CH = Math.round(inToPx(cardH, dpi));
    const BL = Math.max(0, Math.round(mmToPx(bleed, dpi)));

    const startX = Math.round(inToPx(mL, dpi));
    const startY = Math.round(inToPx(mT, dpi));
    const availW = PAGE_W - startX * 2 - cols * CW;
    const availH = PAGE_H - startY * 2 - rows * CH;
    const gapX = cols > 1 ? Math.floor(availW / (cols - 1)) : 0;
    const gapY = rows > 1 ? Math.floor(availH / (rows - 1)) : 0;

    const slots = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = startX + c * (CW + gapX);
        const y = startY + r * (CH + gapY);
        slots.push({ x, y, w: CW, h: CH });
      }
    }
    return { dpi, PAGE_W, PAGE_H, CW, CH, BL, rows, cols, slots, PAGE_W_IN, PAGE_H_IN };
  }

  function wrapText(ctx, text, x, y, mw, lh) {
    const lines = (text + '').split('\n').flatMap(line => {
      const words = line.split(' ');
      let buf = '', out = [];
      for (const w of words) {
        const t = buf ? buf + ' ' + w : w;
        if (ctx.measureText(t).width > mw) { out.push(buf || w); buf = w; }
        else buf = t;
      }
      if (buf) out.push(buf);
      return out;
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

    const overlayOn = $('#overlayToggle')?.checked ?? true;
    const overlayOpacity = parseFloat($('#overlayOpacity')?.value || '1');
    if (overlayOn && state.overlayBmp) {
      ctx.save(); ctx.globalAlpha = clamp(overlayOpacity, 0, 1);
      ctx.drawImage(state.overlayBmp, 0, 0, geom.PAGE_W, geom.PAGE_H);
      ctx.restore();
    }

    if (geom.BL > 0) {
      ctx.fillStyle = '#000';
      for (const s of geom.slots) ctx.fillRect(s.x - geom.BL, s.y - geom.BL, s.w + 2*geom.BL, s.h + 2*geom.BL);
    }

    const names = state.names.slice(0, geom.slots.length);
    for (let i = 0; i < names.length; i++) {
      const s = geom.slots[i], name = names[i];
      try {
        const bmp = await resolveSWUByName(name);
        ctx.drawImage(bmp, s.x, s.y, s.w, s.h);
      } catch (e) {
        console.warn('[swu-sheet] failed image', name, e);
        ctx.fillStyle = '#ffeded'; ctx.fillRect(s.x, s.y, s.w, s.h);
        ctx.strokeStyle = '#d33'; ctx.lineWidth = 6; ctx.strokeRect(s.x+3, s.y+3, s.w-6, s.h-6);
        ctx.fillStyle = '#900'; ctx.font = '26px system-ui, sans-serif';
        wrapText(ctx, `Failed:\n${name}`, s.x + 16, s.y + 40, s.w - 32, 34);
      }
    }

    const sb = $('#statusBar'); if (sb) sb.textContent = `${names.length}/${geom.slots.length} slots filled @ ${geom.PAGE_W}×${geom.PAGE_H}`;
    console.log('[swu-sheet]', `${names.length}/${geom.slots.length} slots filled @ ${geom.PAGE_W}×${geom.PAGE_H}`);
  }

  function bind() {
    document.querySelectorAll('form').forEach(f => f.addEventListener('submit', e => e.preventDefault()));

    // Buttons: prefer IDs, fallback to visible text
    const parseBtn = document.getElementById('btnParse')      || byBtnText('Add from Pasted List');
    const addBtn   = document.getElementById('btnAddSearch')  || byBtnText('Add');
    const saveBtn  = document.getElementById('btnSavePNG')    || byBtnText('Export PNG');
    const printBtn = document.getElementById('btnPrint')      || byBtnText('Print');

    saveBtn && saveBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const a = document.createElement('a');
      a.href = ($('#sheet') || document.querySelector('canvas')).toDataURL('image/png');
      a.download = 'cards-sheet.png'; a.click();
    });

    printBtn && printBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const jsPDF = window.jspdf && window.jspdf.jsPDF;
      if (jsPDF) {
        const { PAGE_W_IN, PAGE_H_IN } = getGeom();
        const doc = new jsPDF({ orientation: 'portrait', unit: 'in', format: [PAGE_W_IN, PAGE_H_IN] });
        const dataURL = ($('#sheet') || document.querySelector('canvas')).toDataURL('image/jpeg', 0.95);
        doc.addImage(dataURL, 'JPEG', 0, 0, PAGE_W_IN, PAGE_H_IN);
        doc.save('cards-sheet.pdf');
      } else {
        window.print();
      }
    });

    parseBtn && parseBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const area = document.getElementById('pasteList') || document.querySelector('textarea');
      const names = (area?.value || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      if (!names.length) { alert('Paste card names, one per line.'); return; }
      state.names = names;
      await render();
    });

    addBtn && addBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const box = document.getElementById('searchBox') || document.querySelector('input[type="text"]');
      const n = (box?.value || '').trim();
      if (!n) return;
      state.names.push(n);
      await render();
    });

    document.getElementById('overlayFile')?.addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0];
      state.overlayBmp = await fileToBitmap(f);
      await render();
    });
    document.getElementById('overlayToggle')?.addEventListener('change', render);
    document.getElementById('overlayOpacity')?.addEventListener('input', render);

    ['cardW','cardH','rows','cols','marginL','marginT','dpi','bleedMM'].forEach(id => {
      const el = document.getElementById(id);
      el?.addEventListener('input', render);
      el?.addEventListener('change', render);
    });
  }

  async function init() {
    bind();
    try {
      const ping = await SWU('/catalog/card-names');
      console.log('[swu-sheet] proxy ping:', ping.status);
    } catch (e) {
      console.error('[swu-sheet] proxy ping failed', e);
    }
    await render();
    console.log('[swu-sheet] init complete');
  }
})();
