/* SWU MTG-style UI — print @ exact scale; MTG-like layout */
(function(){
  'use strict';

  // Geometry constants
  const DPI = 300;
  const CARD_W_IN = 2.5, CARD_H_IN = 3.5;
  const PAGE_W = 11*DPI, PAGE_H = 8.5*DPI; // landscape
  const CARD_W = Math.round(CARD_W_IN*DPI), CARD_H = Math.round(CARD_H_IN*DPI);
  const COLS = 4, ROWS = 2;
  const MARGIN_X = Math.round(0.5*DPI), MARGIN_Y = Math.round(0.75*DPI);

  const $ = sel => document.querySelector(sel);
  const canvas = $('#canvas');
  const ctx = canvas.getContext('2d', {alpha:false});

  // force canvas pixels
  canvas.width = PAGE_W; canvas.height = PAGE_H;

  const state = {
    sheetIndex: 0,
    sheets: [[]],
    cache: new Map(),
    underBmp: null,  // silhouette template (PNG)
    overBmp: null,   // cut path (SVG)
  };

  window.addEventListener('DOMContentLoaded', () => {
    $('#btnBuild').addEventListener('click', build);
    $('#btnExportPNG').addEventListener('click', exportPNG);
    $('#btnPrint').addEventListener('click', printRawCanvas);
    $('#sheetPrev').addEventListener('click', () => nav(-1));
    $('#sheetNext').addEventListener('click', () => nav(1));
    $('#fileTemplate').addEventListener('change', onTemplatePicked);

    // Preload baked overlay assets
    preloadDefaults().then(render);
  });

  async function onTemplatePicked(e){
    const f = e.target.files?.[0]; if (!f) return;
    try{ state.underBmp = await createImageBitmap(f); render(); }catch{}
  }

  async function preloadDefaults(){
    try{
      const u = await fetch('assets/template_resized_1056x816.png', {cache:'force-cache'});
      if (u.ok) state.underBmp = await createImageBitmap(await u.blob());
    }catch{}
    try{
      const o = await fetch('assets/letter_poker_v2_fixed.svg', {cache:'force-cache'});
      if (o.ok) state.overBmp = await createImageBitmap(await o.blob());
    }catch{}
  }

  function status(msg){ $('#statusBar').textContent = msg; }

  // Build sheets from textarea list
  function parseList(txt){
    const lines = txt.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const out = [];
    for (const line of lines){
      const m = line.match(/^(.*?)(?:\s+x(\d+)|\s+\((\d+)\))?$/i);
      const name = (m?.[1]||'').trim();
      const n = parseInt(m?.[2] || m?.[3] || '1',10) || 1;
      for(let i=0;i<n;i++) out.push(name);
    }
    return out;
  }
  const PAGE_SLOTS = 8;
  function chunk(arr, n){ const r=[]; for(let i=0;i<arr.length;i+=n) r.push(arr.slice(i,i+n)); return r; }

  function build(){
    const names = parseList($('#cardList').value);
    if (!names.length){ status('Paste a list first.'); return; }
    state.sheets = chunk(names, PAGE_SLOTS).map(page => page.map(n => ({name:n})));
    state.sheetIndex = 0;
    status(`Built ${state.sheets.length} sheet(s).`);
    render();
  }
  function nav(d){ const N = state.sheets.length || 1; state.sheetIndex = ( (state.sheetIndex+d)%N + N ) % N; render(); }

  // SWU API (via Netlify function)
  const FN_BASE = '/.netlify/functions/swu?';
  async function swuSearchByName(name){
    const url = `${FN_BASE}path=${encodeURIComponent('/cards/search')}&q=${encodeURIComponent('name:\"'+name+'\"')}`;
    const r = await fetch(url, {cache:'no-store'});
    if (!r.ok) throw new Error('search '+r.status);
    const j = await r.json();
    if (!j?.data?.length) throw new Error('No SWU match for \"'+name+'\"');
    return j.data[0];
  }
  async function swuFetchCardImage(set, num){
    const path = `/cards/${set.toLowerCase()}/${encodeURIComponent(num)}`;
    const url = `${FN_BASE}path=${encodeURIComponent(path)}&format=image`;
    const r = await fetch(url, {cache:'no-store'});
    if (!r.ok) throw new Error('image '+r.status);
    return await createImageBitmap(await r.blob());
  }
  async function resolveImage(name){
    const key = 'img:'+name.toLowerCase();
    if (state.cache.has(key)) return state.cache.get(key);
    const hit = await swuSearchByName(name);
    const bmp = await swuFetchCardImage(hit.Set, hit.Number);
    state.cache.set(key, bmp);
    return bmp;
  }

  async function render(){
    const page = state.sheets[state.sheetIndex] || [];
    $('#sheetLabel').textContent = `Sheet ${state.sheetIndex+1} of ${state.sheets.length||1}`;
    const ctx = canvas.getContext('2d', {alpha:false});

    // white sheet
    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height);

    // underlay
    if (state.underBmp){ ctx.drawImage(state.underBmp, 0,0, canvas.width, canvas.height); }

    // grid
    let drawn = 0;
    for (let r=0;r<ROWS;r++){
      for (let c=0;c<COLS;c++){
        const i = r*COLS + c;
        const card = page[i]; if (!card) continue;
        const x = MARGIN_X + c*CARD_W;
        const y = MARGIN_Y + r*CARD_H;
        try{
          const bmp = await resolveImage(card.name);
          ctx.drawImage(bmp, x, y, CARD_W, CARD_H);
          drawn++;
        }catch{
          ctx.save();
          ctx.strokeStyle='#c33'; ctx.lineWidth=6; ctx.globalAlpha=.5;
          ctx.strokeRect(x,y,CARD_W,CARD_H);
          ctx.fillStyle='#c33'; ctx.font='20px ui-monospace, monospace';
          ctx.fillText('Failed: '+card.name, x+8, y+24);
          ctx.restore();
        }
      }
    }

    // overlay guides (if checked)
    if ($('#chkGuides').checked){
      // light rectangles
      ctx.save(); ctx.strokeStyle='#4aa3ff'; ctx.lineWidth=3;
      for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++){
        const x = MARGIN_X + c*CARD_W, y = MARGIN_Y + r*CARD_H;
        ctx.strokeRect(x,y,CARD_W,CARD_H);
      }
      ctx.restore();
      // baked svg overlay if available
      if (state.overBmp){ ctx.drawImage(state.overBmp, 0,0, canvas.width, canvas.height); }
    }

    status(`${drawn}/${page.length} slots filled @ ${canvas.width}×${canvas.height}`);
  }

  function exportPNG(){
    const a = document.createElement('a');
    a.download = `swu-sheet-${state.sheetIndex+1}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  }

  function printRawCanvas(){
    const dataUrl = canvas.toDataURL('image/png');
    const w = window.open('', '_blank', 'noopener,noreferrer');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8">
      <title>Print</title>
      <style>
        @page { size: 11in 8.5in; margin: 0; }
        html,body{ margin:0; padding:0; background:#fff; }
        img{ width:11in; height:8.5in; display:block; }
      </style>
    </head><body>
      <img src="${dataUrl}"/>
      <script>window.onload=()=>{window.focus();window.print();setTimeout(()=>window.close(),400)};<\/script>
    </body></html>`);
    w.document.close();
  }

})();