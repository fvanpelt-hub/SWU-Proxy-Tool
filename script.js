// SW:U Proxy Sheet Tool v0.2 with Netlify proxy for CORS-safe API & images
const SWU_FN = '/.netlify/functions/swu';

function swu(path, params={}){
  const u = new URL(SWU_FN, location.origin);
  u.searchParams.set('path', path);
  for(const [k,v] of Object.entries(params)) if(v!=null) u.searchParams.set(k, v);
  return u.toString();
}

// ---- State ----
const state = {
  dpi: 300,
  cardW_in: 2.5,
  cardH_in: 3.5,
  bleed_mm: 0.5,
  cols: 4,
  rows: 2,
  marginL_in: 0.5,
  marginT_in: 0.75,
  pageW_in: 11,
  pageH_in: 8.5,
  sheets: [ { slots: [] } ],
  sheetIndex: 0,
  catalog: [],
  overlayOpacity: 0.2,
  overlayVisible: true,
};

// ---- Elements ----
const sheetCanvas = document.getElementById('sheet');
const ctx = sheetCanvas.getContext('2d');
const overlayEl = document.getElementById('overlay');

const controls = {
  dpi: document.getElementById('dpi'),
  cardW: document.getElementById('cardW'),
  cardH: document.getElementById('cardH'),
  bleedMM: document.getElementById('bleedMM'),
  cols: document.getElementById('cols'),
  rows: document.getElementById('rows'),
  marginL: document.getElementById('marginL'),
  marginT: document.getElementById('marginT'),
  overlayToggle: document.getElementById('overlayToggle'),
  overlayOpacity: document.getElementById('overlayOpacity'),
  overlayFile: document.getElementById('overlayFile'),
  pasteList: document.getElementById('pasteList'),
  searchBox: document.getElementById('searchBox'),
  autocomplete: document.getElementById('autocomplete'),
};

const buttons = {
  prev: document.getElementById('btnPrev'),
  next: document.getElementById('btnNext'),
  png: document.getElementById('btnSavePNG'),
  print: document.getElementById('btnPrint'),
  parse: document.getElementById('btnParse'),
  addSearch: document.getElementById('btnAddSearch'),
  imgUpload: document.getElementById('imgUpload'),
  clearSheet: document.getElementById('btnClearSheet'),
  clearAll: document.getElementById('btnClearAll'),
  dxf: document.getElementById('btnExportDXF'),
  saveJSON: document.getElementById('btnSaveJSON'),
  loadJSON: document.getElementById('btnLoadJSON'),
};

const pageLabel = document.getElementById('pageLabel');
const statusBar = document.getElementById('statusBar');
const thumbStrip = document.getElementById('thumbStrip');

// ---- Utils ----
const mm2in = mm => mm / 25.4;
function px(inches){ return Math.round(inches * state.dpi); }
function slotCount(){ return state.cols * state.rows; }
function ensureSlots(sheet){ const need = slotCount(); while(sheet.slots.length < need) sheet.slots.push({}); if(sheet.slots.length > need) sheet.slots.length = need; }
function logStatus(msg){ statusBar.textContent = msg; }

function saveLocal(){
  const toSave = {
    ...state,
    sheets: state.sheets.map(s => ({
      slots: s.slots.map(slot => ({
        name: slot.name || null, src: slot.src || null, set: slot.set || null, number: slot.number || null
      })),
      thumbDataUrl: s.thumbDataUrl || null,
    }))
  };
  localStorage.setItem('swu_proxy_tool_v0_2', JSON.stringify(toSave));
}

function loadLocal(){
  const raw = localStorage.getItem('swu_proxy_tool_v0_2');
  if(!raw) return false;
  try{
    const obj = JSON.parse(raw);
    Object.assign(state, obj);
    overlayEl.style.opacity = state.overlayOpacity;
    overlayEl.classList.toggle('hide', !state.overlayVisible);
    render();
    return true;
  }catch{ return false; }
}

// ---- API helpers via proxy ----
async function fetchCatalogNames(){
  try{
    const res = await fetch(swu('/catalog/card-names'));
    state.catalog = await res.json() || [];
  }catch(e){
    console.warn('catalog fetch failed', e);
  }
}

async function resolveCardByName(name){
  const q = `name:"${name}"`;
  try{
    const res = await fetch(swu('/cards/search', { q }));
    if(res.ok){
      const list = await res.json();
      if(Array.isArray(list) && list.length){
        const c = list[0];
        if(c?.set && c?.setnumber){
          return {
            name: c.name,
            set: c.set,
            number: c.setnumber,
            image: swu(`/cards/${c.set}/${c.setnumber}`, { format: 'image' }),
          };
        }
      }
    }
  }catch(e){ console.warn('search err', e); }

  if(state.catalog?.length){
    const hit = state.catalog.find(n => n.toLowerCase() === name.toLowerCase()) ||
                state.catalog.find(n => n.toLowerCase().includes(name.toLowerCase()));
    if(hit){
      try{
        const res2 = await fetch(swu('/cards/search', { q: `name:"${hit}"` }));
        const list2 = await res2.json();
        if(list2?.length){
          const c = list2[0];
          return {
            name: c.name,
            set: c.set,
            number: c.setnumber,
            image: swu(`/cards/${c.set}/${c.setnumber}`, { format: 'image' }),
          };
        }
      }catch(e){}
    }
  }
  return null;
}

// ---- Layout & Drawing ----
function currentSheet(){ return state.sheets[state.sheetIndex]; }
function updateFromControls(){
  state.dpi = parseInt(controls.dpi.value, 10);
  state.cardW_in = parseFloat(controls.cardW.value);
  state.cardH_in = parseFloat(controls.cardH.value);
  state.bleed_mm = parseFloat(controls.bleedMM.value);
  state.cols = parseInt(controls.cols.value,10);
  state.rows = parseInt(controls.rows.value,10);
  state.marginL_in = parseFloat(controls.marginL.value);
  state.marginT_in = parseFloat(controls.marginT.value);
  state.overlayVisible = controls.overlayToggle.checked;
  state.overlayOpacity = parseFloat(controls.overlayOpacity.value);
  overlayEl.style.opacity = state.overlayOpacity;
  overlayEl.classList.toggle('hide', !state.overlayVisible);
  sheetCanvas.width = px(state.pageW_in);
  sheetCanvas.height = px(state.pageH_in);
}

function render(){
  updateFromControls();
  const pageW_px = sheetCanvas.width;
  const pageH_px = sheetCanvas.height;
  const cardW_px = px(state.cardW_in);
  const cardH_px = px(state.cardH_in);
  const bleed_px = px(mm2in(state.bleed_mm));
  const marginL_px = px(state.marginL_in);
  const marginT_px = px(state.marginT_in);

  const ctx = sheetCanvas.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0,0,pageW_px,pageH_px);

  // calibration square
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
  ctx.strokeRect(30, pageH_px - 30 - px(1), px(1), px(1));

  const sheet = currentSheet(); ensureSlots(sheet);
  for(let r=0; r<state.rows; r++){
    for(let c=0; c<state.cols; c++){
      const idx = r*state.cols + c;
      const slot = sheet.slots[idx] || {};
      const x = marginL_px + c*cardW_px;
      const y = marginT_px + r*cardH_px;

      // bleed edge
      ctx.fillStyle = '#000000';
      ctx.fillRect(x - bleed_px, y - bleed_px, cardW_px + 2*bleed_px, cardH_px + 2*bleed_px);

      if(slot.img){
        ctx.drawImage(slot.img, x, y, cardW_px, cardH_px);
      }else{
        ctx.fillStyle = '#141922';
        ctx.fillRect(x, y, cardW_px, cardH_px);
        ctx.strokeStyle = '#273142'; ctx.lineWidth = 2; ctx.strokeRect(x,y,cardW_px,cardH_px);
        ctx.fillStyle = '#9aa3ad'; ctx.font = '16px sans-serif'; ctx.fillText('Empty', x+10, y+24);
      }
    }
  }
  renderThumb(); saveLocal(); updatePageLabel();
}

function renderThumb(){
  const sheet = currentSheet();
  const thumb = document.createElement('canvas');
  const scale = 300/3300;
  thumb.width = Math.round(sheetCanvas.width * scale);
  thumb.height = Math.round(sheetCanvas.height * scale);
  const tctx = thumb.getContext('2d');
  tctx.drawImage(sheetCanvas, 0, 0, thumb.width, thumb.height);
  sheet.thumbDataUrl = thumb.toDataURL('image/png');
  thumbStrip.innerHTML = '';
  state.sheets.forEach((s,i)=>{
    const img = document.createElement('img');
    img.src = s.thumbDataUrl || '';
    img.alt = `Sheet ${i+1}`;
    img.onclick = ()=>{ state.sheetIndex = i; render(); };
    thumbStrip.appendChild(img);
  });
}
function updatePageLabel(){ pageLabel.textContent = `Sheet ${state.sheetIndex+1} / ${state.sheets.length}`; }

// ---- Adders ----
async function addCardByName(name, qty=1){
  if(!name) return;
  const resolved = await resolveCardByName(name);
  if(!resolved){ logStatus(`Could not resolve “${name}”.`); return; }
  for(let i=0;i<qty;i++){ await addImageByURL(resolved.image, resolved.name || name); }
}

function loadImage(url){
  return new Promise((resolve, reject)=>{
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = ()=> resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

async function addImageByURL(url, label=''){
  const sheet = currentSheet(); ensureSlots(sheet);
  const emptyIndex = sheet.slots.findIndex(s => !s.img);
  const target = (emptyIndex >= 0) ? emptyIndex : sheet.slots.length;
  if(target >= slotCount()){
    state.sheets.push({ slots: [] });
    state.sheetIndex = state.sheets.length - 1;
    ensureSlots(currentSheet());
  }
  try{
    const img = await loadImage(url);
    const slot = currentSheet().slots.find(s => !s.img);
    if(slot){ slot.img = img; slot.name = label; slot.src = url; }
    render(); logStatus(`Added: ${label || url}`);
  }catch(e){ console.error(e); logStatus('Failed to load image URL'); }
}

function parseLines(text){
  const lines = text.split(/\\r?\\n/).map(s=>s.trim()).filter(Boolean);
  const items = [];
  for(const line of lines){
    let qty = 1, name = line;
    const m1 = line.match(/^(\\d+)\\s+x?\\s*(.+)$/i);
    if(m1){ qty = parseInt(m1[1],10); name = m1[2]; }
    else {
      const m2 = line.match(/^(.+?)\\s+x\\s*(\\d+)$/i);
      if(m2){ name = m2[1]; qty = parseInt(m2[2],10); }
    }
    name = name.replace(/\\(.*?\\)/g,'').replace(/\\s{2,}/g,' ').trim();
    items.push({name, qty});
  }
  return items;
}

// ---- DXF export ---- (unchanged from v0.1)
function exportDXF(){
  const pageW_in = state.pageW_in;
  const pageH_in = state.pageH_in;
  const cardW = state.cardW_in;
  const cardH = state.cardH_in;
  const cols = state.cols;
  const rows = state.rows;
  const marginL = state.marginL_in;
  const marginT = state.marginT_in;

  let entities = '';
  for(let r=0; r<rows; r++){
    for(let c=0; c<cols; c++){
      const x = marginL + c*cardW;
      const y = marginT + r*cardH;
      const pts = [[x,y],[x+cardW,y],[x+cardW,y+cardH],[x,y+cardH],[x,y]];
      entities += polyline(pts);
    }
  }
  const dxf = headerDXF() + entities + footerDXF();
  const blob = new Blob([dxf], {type:'application/dxf'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `swu_proxy_cutlines_${Date.now()}.dxf`;
  a.click();
}
function headerDXF(){ return `0
SECTION
2
HEADER
9
$INSUNITS
70
1
9
$LIMMIN
10
0.0
20
0.0
9
$LIMMAX
10
${state.pageW_in.toFixed(4)}
20
${state.pageH_in.toFixed(4)}
0
ENDSEC
0
SECTION
2
ENTITIES
`; }
function footerDXF(){ return `0
ENDSEC
0
EOF
`; }
function polyline(points){
  let s = `0
LWPOLYLINE
8
cut
90
${points.length}
70
1
`;
  for(const [x,y] of points){
    s += `10
${x.toFixed(4)}
20
${(state.pageH_in - y).toFixed(4)}
`;
  }
  return s;
}

// ---- Events ----
buttons.png.onclick = () => {
  sheetCanvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `swu_sheet_${state.sheetIndex+1}_${state.dpi}dpi.png`; a.click();
  });
};
buttons.print.onclick = () => window.print();
buttons.dxf.onclick = exportDXF;
buttons.prev.onclick = ()=>{ if(state.sheetIndex>0){ state.sheetIndex--; render(); } };
buttons.next.onclick = ()=>{ if(state.sheetIndex<state.sheets.length-1){ state.sheetIndex++; render(); } };
buttons.clearSheet.onclick = ()=>{ currentSheet().slots = []; render(); };
buttons.clearAll.onclick = ()=>{ state.sheets = [{slots:[]}]; state.sheetIndex = 0; render(); };

buttons.saveJSON.onclick = ()=>{
  const data = localStorage.getItem('swu_proxy_tool_v0_2') || '{}';
  const blob = new Blob([data], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'swu_proxy_layout.json';
  a.click();
};
buttons.loadJSON.onclick = ()=>{
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'application/json';
  inp.onchange = () => {
    const f = inp.files?.[0]; if(!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try{
        const obj = JSON.parse(reader.result);
        localStorage.setItem('swu_proxy_tool_v0_2', JSON.stringify(obj));
        loadLocal(); logStatus('Layout loaded.');
      }catch(e){ logStatus('Invalid JSON.'); }
    };
    reader.readAsText(f);
  };
  inp.click();
};

buttons.parse.onclick = async ()=>{
  const text = controls.pasteList.value.trim();
  if(!text) return;
  const items = parseLines(text);
  for(const it of items){ await addCardByName(it.name, it.qty); }
};
buttons.addSearch.onclick = async ()=>{
  const name = controls.searchBox.value.trim();
  if(name) await addCardByName(name, 1);
};
buttons.imgUpload.onchange = async (e)=>{
  const files = Array.from(e.target.files||[]);
  for(const f of files){
    const url = URL.createObjectURL(f);
    await addImageByURL(url, f.name);
  }
};

controls.searchBox.addEventListener('input', () => {
  const q = controls.searchBox.value.trim().toLowerCase();
  if(!q){ controls.autocomplete.style.display='none'; return; }
  const matches = state.catalog.filter(n => n.toLowerCase().includes(q));
  const box = controls.autocomplete;
  box.innerHTML = '';
  matches.slice(0,12).forEach(n => {
    const div = document.createElement('div');
    div.textContent = n; div.onclick = () => { controls.searchBox.value = n; box.style.display='none'; };
    box.appendChild(div);
  });
  box.style.display = matches.length ? 'block' : 'none';
});
document.addEventListener('click', (e)=>{
  if(!controls.autocomplete.contains(e.target) && e.target!==controls.searchBox){
    controls.autocomplete.style.display = 'none';
  }
});

// ---- Boot ----
(async function init(){
  loadLocal();
  ensureSlots(currentSheet());
  await fetchCatalogNames();
  render();
  logStatus('Ready. (Now using Netlify function proxy for API + images)');
})();
