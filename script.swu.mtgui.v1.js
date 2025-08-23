/* SWU MTG-style UI — keeps SWU resolvers; draws baked template */
(function(){
  'use strict';

  // Geometry
  const DPI = 300;
  const CARD_W_IN = 2.5, CARD_H_IN = 3.5;
  const PAGE_W = 11*DPI, PAGE_H = 8.5*DPI; // landscape
  const CARD_W = Math.round(CARD_W_IN*DPI), CARD_H = Math.round(CARD_H_IN*DPI);
  const COLS = 4, ROWS = 2;
  const MARGIN_X = Math.round(0.5*DPI), MARGIN_Y = Math.round(0.75*DPI);
  const GAP_X = 0, GAP_Y = 0;

  const $ = sel => document.querySelector(sel);
  const canvas = $('#canvas');
  const ctx = canvas.getContext('2d');

  const state = {
    sheetIndex: 0,
    sheets: [[]],
    cache: new Map(),
    underBmp: null,  // silhouette template PNG
    overBmp: null,   // cut path SVG
  };

  // ---- UI wiring
  window.addEventListener('DOMContentLoaded', () => {
    $('#btnBuild').addEventListener('click', build);
    $('#btnExportPNG').addEventListener('click', exportPNG);
    $('#btnPrint').addEventListener('click', () => window.print());
    $('#sheetPrev').addEventListener('click', () => { nav(-1); });
    $('#sheetNext').addEventListener('click', () => { nav(+1); });
    $('#fileTemplate').addEventListener('change', onTemplatePicked);

    // Preload baked assets (work with site /assets/ paths)
    preloadDefaults().then(() => render());
  });

  async function onTemplatePicked(e){
    const f = e.target.files?.[0];
    if (!f) return;
    try{
      const bmp = await createImageBitmap(f);
      state.underBmp = bmp; // use picked file as underlay
      render();
    }catch(err){ console.warn('[swu] template pick failed', err); }
  }

  async function preloadDefaults(){
    try{
      const u = await fetch('assets/template_resized_1056x816.png');
      if (u.ok) state.underBmp = await createImageBitmap(await u.blob());
    }catch{ /* optional */ }
    try{
      const o = await fetch('assets/letter_poker_v2_fixed.svg');
      if (o.ok) state.overBmp = await createImageBitmap(await o.blob());
    }catch{ /* optional */ }
  }

  function status(msg){ $('#statusBar').textContent = msg; }

  // ---- Build sheets from textarea
  function parseList(txt){
    const lines = txt.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const out = [];
    for (const line of lines){
      // allow trailing xN or (N)
      const m = line.match(/^(.*?)(?:\s+x(\d+)|\s+\((\d+)\))?$/i);
      const name = (m?.[1]||'').trim();
      const n = parseInt(m?.[2] || m?.[3] || '1', 10) || 1;
      for (let i=0;i<n;i++) out.push(name);
    }
    return out;
  }

  function chunk(arr, n){
    const out=[]; for(let i=0;i<arr.length;i+=n) out.push(arr.slice(i,i+n)); return out;
  }

  function build(){
    const names = parseList($('#cardList').value);
    if (!names.length){ status('Paste a list first.'); return; }
    const pages = chunk(names, COLS*ROWS);
    state.sheets = pages.map(page => page.map(n => ({ name:n })));
    state.sheetIndex = 0;
    status(`Built ${pages.length} sheet(s).`);
    render();
  }

  function nav(delta){
    const N = state.sheets.length;
    state.sheetIndex = ( (state.sheetIndex + delta) % N + N ) % N;
    render();
  }

  // ---- SWU resolvers (kept)
  const FN_BASE = '/.netlify/functions/swu?';
  async function swuSearchByName(name){
    const url = `${FN_BASE}path=${encodeURIComponent('/cards/search')}&q=${encodeURIComponent('name:"'+name+'"')}`;
    const r = await fetch(url, {cache:'no-store'});
    if (!r.ok) throw new Error('search '+r.status);
    const j = await r.json();
    if (!j || !j.data || !j.data.length) throw new Error('No match for "'+name+'"');
    return j.data[0]; // first hit
  }
  async function swuFetchCardImage(set, num){
    const path = `/cards/${set.toLowerCase()}/${encodeURIComponent(num)}`;
    const url = `${FN_BASE}path=${encodeURIComponent(path)}&format=image`;
    const r = await fetch(url, {cache:'no-store'});
    if (!r.ok) throw new Error('image '+r.status);
    const blob = await r.blob();
    return await createImageBitmap(blob);
  }
  async function resolveImage(name){
    const key = 'img:'+name.toLowerCase();
    if (state.cache.has(key)) return state.cache.get(key);
    const hit = await swuSearchByName(name);
    const bmp = await swuFetchCardImage(hit.Set, hit.Number);
    state.cache.set(key, bmp);
    return bmp;
  }

  // ---- Render
  async function render(){
    const page = state.sheets[state.sheetIndex] || [];
    $('#sheetLabel').textContent = `Sheet ${state.sheetIndex+1} of ${state.sheets.length||1}`;

    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.fillRect(0,0,PAGE_W,PAGE_H);

    // underlay for silhouette
    if (state.underBmp){
      ctx.globalAlpha = 1;
      ctx.drawImage(state.underBmp, 0,0, PAGE_W, PAGE_H);
    }
    ctx.restore();

    // draw cards grid
    const startX = MARGIN_X, startY = MARGIN_Y;
    let drawn = 0;
    for (let r=0;r<ROWS;r++){
      for (let c=0;c<COLS;c++){
        const slot = r*COLS + c;
        const card = page[slot];
        const x = startX + c*(CARD_W + GAP_X);
        const y = startY + r*(CARD_H + GAP_Y);
        if (!card){
          continue;
        }
        try{
          const bmp = await resolveImage(card.name);
          ctx.drawImage(bmp, x, y, CARD_W, CARD_H);
          drawn++;
        }catch(err){
          ctx.save();
          ctx.strokeStyle = '#c33'; ctx.lineWidth = 6; ctx.globalAlpha = .5;
          ctx.strokeRect(x,y,CARD_W,CARD_H);
          ctx.fillStyle = '#c33'; ctx.font = '20px ui-monospace, monospace';
          ctx.fillText('Failed: '+card.name, x+8, y+24);
          ctx.restore();
        }
      }
    }

    // overlay guides on top (checkbox like MTG)
    if ($('#chkGuides').checked){
      drawGuides(ctx, startX, startY, CARD_W, CARD_H, COLS, ROWS);
      if (state.overBmp){
        ctx.save(); ctx.globalAlpha = 1;
        ctx.drawImage(state.overBmp, 0,0, PAGE_W, PAGE_H);
        ctx.restore();
      }
    }

    status(`${drawn}/${page.length} slots filled @ ${PAGE_W}×${PAGE_H} (landscape)`);
  }

  function drawGuides(ctx, x0, y0, w, h, cols, rows){
    ctx.save();
    ctx.strokeStyle = '#4aa3ff'; ctx.lineWidth = 3;
    for (let r=0;r<rows;r++){
      for (let c=0;c<cols;c++){
        const x = x0 + c*w;
        const y = y0 + r*h;
        ctx.strokeRect(x,y,w,h);
      }
    }
    ctx.restore();
  }

  // ---- Export
  function exportPNG(){
    const a = document.createElement('a');
    a.download = `swu-sheet-${state.sheetIndex+1}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  }

})();