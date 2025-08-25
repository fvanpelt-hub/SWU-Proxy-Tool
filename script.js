/* SWU Silhouette Tool — MTG-style layout */
(() => {
  const W = 3300, H = 2550; // 11x8.5 @ 300dpi
  const DPI = 300;
  const COLS = 4, ROWS = 2;
  const M_LR = 0.5 * DPI;  // 150
  const M_TB = 0.75 * DPI; // 225
  const CARD_W = 2.5 * DPI; // 750
  const CARD_H = 3.5 * DPI; // 1050
  const SLOT_X = (c) => M_LR + c * CARD_W;
  const SLOT_Y = (r) => M_TB + r * CARD_H;

  // DOM
  const canvas = document.getElementById('sheet');
  const ctx = canvas.getContext('2d');
  const deckEl = document.getElementById('deck');
  const showGuidesEl = document.getElementById('showGuides');
  const fileTemplateEl = document.getElementById('fileTemplate');
  const statusEl = document.getElementById('status');
  const pagerEl = document.getElementById('pager');

  const prevBtn = document.getElementById('prev');
  const nextBtn = document.getElementById('next');
  const btnBuild = document.getElementById('btnBuild');
  const btnExport = document.getElementById('btnExport');
  const btnPrint = document.getElementById('btnPrint');

  // built-in template
  const bakedTemplateURL = 'assets/template_resized_1056x816.png';
  let overlayImg = null;
  let pages = [[]]; // array of arrays of {name, img}

  // Helper: draw guides and overlay
  async function drawGuides() {
    // white page bg
    ctx.fillStyle = '#fff';
    ctx.fillRect(0,0,W,H);

    if (showGuidesEl.checked) {
      // soft outer box
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 2;
      ctx.strokeRect(M_LR, M_TB, W - 2*M_LR, H - 2*M_TB);

      // grid lines
      ctx.strokeStyle = 'rgba(64,150,255,0.7)';
      for (let c=1;c<COLS;c++){
        const x = SLOT_X(c);
        ctx.beginPath(); ctx.moveTo(x, M_TB); ctx.lineTo(x, H-M_TB); ctx.stroke();
      }
      for (let r=1;r<ROWS;r++){
        const y = SLOT_Y(r);
        ctx.beginPath(); ctx.moveTo(M_LR, y); ctx.lineTo(W-M_LR, y); ctx.stroke();
      }

      // overlay template
      if (!overlayImg) {
        overlayImg = await loadImage(bakedTemplateURL).catch(()=>null);
      }
      if (overlayImg) {
        ctx.globalAlpha = 0.25;
        ctx.drawImage(overlayImg, 0, 0, W, H);
        ctx.globalAlpha = 1;
      }
    }
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

  async function fetchJSON(path, params={}) {
    const url = new URL('/.netlify/functions/swu', location.origin);
    url.searchParams.set('path', path);
    for (const [k,v] of Object.entries(params)) url.searchParams.set(k,v);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`proxy ${res.status}`);
    return await res.json();
  }

  async function proxyImage(url) {
    const fn = new URL('/.netlify/functions/swu', location.origin);
    fn.searchParams.set('proxy', url);
    const res = await fetch(fn.toString());
    if (!res.ok) throw new Error(`img proxy ${res.status}`);
    const blob = await res.blob();
    return await createImageBitmap(blob);
  }

  function parseDeckLines(text) {
    const out = [];
    text.split(/\r?\n/).map(s => s.trim()).filter(Boolean).forEach(line => {
      // parse optional " xN"
      let m = line.match(/(.+?)\s+x(\d+)$/i);
      if (m) {
        const name = m[1].trim();
        const n = Math.max(1, parseInt(m[2],10));
        for (let i=0;i<n;i++) out.push(name);
      } else {
        out.push(line);
      }
    });
    return out;
  }

  async function resolveByName(name) {
    try {
      // Search API
      const q = `name:"${name}"`;
      const data = await fetchJSON('/cards/search', { q });
      const arr = (data && (data.data || data)) || [];
      if (arr.length) {
        const card = arr[0];
        const imgUrl = (card.FrontArt || card.frontArt || card.image || '').replace(/^http:/,'https:');
        if (imgUrl) {
          const bmp = await proxyImage(imgUrl);
          return bmp;
        }
        // fallback try to derive CDN path from Set + Number (3 digits)
        const set = (card.Set || card.set || '').toString().toUpperCase();
        let num = (card.Number || card.number || '').toString().padStart(3,'0');
        if (set && num) {
          const cdn = `https://cdn.swu-db.com/images/cards/${set}/${num}.png`;
          const bmp = await proxyImage(cdn);
          return bmp;
        }
      }
      throw new Error('No SWU match');
    } catch (e) {
      console.log('[swu] resolve fail', name, e);
      return null;
    }
  }

  async function renderPage(pageIndex=0) {
    await drawGuides();
    const list = pages[pageIndex] || [];
    let i = 0;
    for (let r=0;r<ROWS;r++) {
      for (let c=0;c<COLS;c++) {
        if (i >= list.length) return;
        const slot = list[i++];
        const x = SLOT_X(c), y = SLOT_Y(r);
        if (slot.img) {
          // fit image to card
          ctx.drawImage(slot.img, x, y, CARD_W, CARD_H);
        } else {
          // failed placeholder
          ctx.fillStyle = 'rgba(255,0,0,0.08)';
          ctx.fillRect(x, y, CARD_W, CARD_H);
          ctx.fillStyle = '#c33';
          ctx.font = '22px system-ui,Segoe UI,Roboto';
          ctx.fillText('Failed:', x+10, y+28);
          ctx.fillText(slot.name, x+10, y+52);
        }
      }
    }
  }

  function paginate(items) {
    const perPage = COLS*ROWS;
    const pages = [];
    for (let i=0;i<items.length;i+=perPage) pages.push(items.slice(i, i+perPage));
    return pages.length ? pages : [[]];
  }

  async function buildSheets() {
    try {
      status('Resolving names…');
      const names = parseDeckLines(deckEl.value);
      const resolved = [];
      for (const name of names) {
        const img = await resolveByName(name);
        resolved.push({ name, img });
        await sleep(10);
      }
      pages = paginate(resolved);
      state.page = 0;
      pagerEl.textContent = `Sheet ${state.page+1} of ${pages.length}`;
      status('Done.');
      await renderPage(0);
    } catch (e) {
      status('Error building sheets. See console.');
      console.error(e);
    }
  }

  function status(msg){ statusEl.textContent = msg; }

  const state = { page: 0 };

  prevBtn.addEventListener('click', async () => {
    state.page = Math.max(0, state.page-1);
    pagerEl.textContent = `Sheet ${state.page+1} of ${pages.length}`;
    await renderPage(state.page);
  });
  nextBtn.addEventListener('click', async () => {
    state.page = Math.min(pages.length-1, state.page+1);
    pagerEl.textContent = `Sheet ${state.page+1} of ${pages.length}`;
    await renderPage(state.page);
  });
  btnBuild.addEventListener('click', buildSheets);
  showGuidesEl.addEventListener('change', () => renderPage(state.page));

  fileTemplateEl.addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    overlayImg = await loadImage(url).catch(()=>null);
    await renderPage(state.page);
  });

  btnExport.addEventListener('click', async () => {
    const png = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = png; a.download = 'swu-sheet.png';
    a.click();
  });

  btnPrint.addEventListener('click', async () => {
    window.print();
  });

  // initial
  (async () => {
    await drawGuides();
    // Preload card names through proxy (useful for typeahead in the future)
    try {
      const names = await fetchJSON('/catalog/card-names');
      console.log('[swu] card names loaded', names?.values?.length || names?.length || 0);
    } catch (e) {
      console.warn('[swu] names failed', e);
    }
  })();
})();
