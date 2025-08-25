// Silhouette Sheet Tool — SW:Unlimited
// Letter landscape @300DPI = 3300×2550. 4×2 of 2.5×3.5 (750×1050).
// Overlay (template PNG + SVG corners) is always drawn fully opaque.

const DPI = 300;
const PAGE_W = 3300, PAGE_H = 2550;
const CARD_W = Math.round(2.5*DPI); // 750
const CARD_H = Math.round(3.5*DPI); // 1050
const MARGIN = Math.round(0.5*DPI); // 150
const COLS = 4, ROWS = 2;
const COL_GAP = 0;
const ROW_GAP = Math.round(0.5*DPI); // 150

const canvas = document.getElementById('sheetCanvas');
const ctx = canvas.getContext('2d', { alpha: false });
ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = 'high';

const showGuidesEl = document.getElementById('showGuides');
const cardListEl = document.getElementById('cardList');
const buildBtn = document.getElementById('buildBtn');
const templateFileEl = document.getElementById('templateFile');
const exportBtn = document.getElementById('exportPng');
const printBtn = document.getElementById('printBtn');
const prevSheet = document.getElementById('prevSheet');
const nextSheet = document.getElementById('nextSheet');
const sheetLabel = document.getElementById('sheetLabel');

let bakedTemplate = null;   // optional PNG
let svgCorners   = null;    // SVG cut path
let pages = [[]];
let pageIndex = 0;

init();

async function init(){
  console.log('[swu-sheet] script loaded');

  try { bakedTemplate = await loadImage('assets/template_resized_1056x816.png'); } catch(e){}
  try { svgCorners   = await loadImage('assets/letter_poker_v2_fixed.svg'); } catch(e){}

  await build();
  console.log('[swu-sheet] init complete');
}

function positionsForPage(){
  const slots = [];
  const startX = MARGIN, startY = MARGIN;
  for(let r=0;r<ROWS;r++){
    for(let c=0;c<COLS;c++){
      const x = startX + c*(CARD_W + COL_GAP);
      const y = startY + r*(CARD_H + ROW_GAP);
      slots.push({x,y,w:CARD_W,h:CARD_H});
    }
  }
  return slots;
}

function parseList(text){
  return (text||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean).flatMap(line=>{
    const m = line.match(/^(.*)\s+x(\d+)$/i);
    if(m){ return Array.from({length:Math.max(1,parseInt(m[2],10))},()=>m[1].trim()); }
    return [line];
  });
}

async function fetchJSON(url){
  const res = await fetch(url);
  if(!res.ok) throw new Error('HTTP '+res.status);
  return await res.json();
}

function proxiedImage(rawUrl){
  return loadImage('/.netlify/functions/swu?img='+encodeURIComponent(rawUrl));
}

async function resolveByName(name){
  // primary search
  try{
    const q = encodeURIComponent(`name:"${name}"`);
    const data = await fetchJSON(`/.netlify/functions/swu?path=%2Fcards%2Fsearch&q=${q}`);
    if(data?.data?.length){
      const hit = data.data[0];
      const art = hit.FrontArt || hit.Front || hit.front || hit.image;
      if(art) return proxiedImage(art);
    }
  }catch(e){ console.warn('search failed', e); }

  // fallback via catalog
  try{
    const list = await fetchJSON('/.netlify/functions/swu?path=%2Fcatalog%2Fcard-names');
    const names = list?.data || [];
    const best = names.find(n=>n.toLowerCase()===name.toLowerCase()) ||
                 names.find(n=>n.toLowerCase().includes(name.toLowerCase()));
    if(best){
      const q = encodeURIComponent(`name:"${best}"`);
      const data = await fetchJSON(`/.netlify/functions/swu?path=%2Fcards%2Fsearch&q=${q}`);
      const art = data?.data?.[0]?.FrontArt;
      if(art) return proxiedImage(art);
    }
  }catch(e){ console.warn('catalog fallback failed', e); }

  return null;
}

async function build(){
  buildBtn.disabled = true;
  try{
    const names = parseList(cardListEl.value);
    const imgs = [];
    for(const nm of names){
      const img = await resolveByName(nm);
      imgs.push({name:nm, img});
    }
    pages = [];
    for(let i=0;i<imgs.length;i+=8) pages.push(imgs.slice(i,i+8));
    if(pages.length===0) pages=[[]];
    pageIndex = 0;
    render();
  }finally{
    buildBtn.disabled = false;
  }
}

function clearCanvas(){
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0,0,PAGE_W,PAGE_H);
}

function drawTemplate(){
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  if(bakedTemplate) ctx.drawImage(bakedTemplate, 0,0, PAGE_W, PAGE_H);
  if(svgCorners)   ctx.drawImage(svgCorners,   0,0, PAGE_W, PAGE_H);
  ctx.restore();
}

function drawGuides(){
  if(!showGuidesEl.checked) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(60,130,255,.6)';
  ctx.lineWidth = 2;
  for(const s of positionsForPage()){
    ctx.strokeRect(s.x, s.y, s.w, s.h);
  }
  ctx.strokeRect(0.5,0.5,PAGE_W-1,PAGE_H-1);
  ctx.restore();
}

function render(){
  clearCanvas();
  drawTemplate();
  const slots = positionsForPage();
  const page = pages[pageIndex] || [];
  for(let i=0;i<Math.min(8, slots.length); i++){
    const s = slots[i];
    const item = page[i];
    if(!item) continue;
    if(item.img) ctx.drawImage(item.img, s.x, s.y, s.w, s.h);
    else{
      ctx.fillStyle='rgba(255,0,0,0.14)'; ctx.fillRect(s.x,s.y,s.w,s.h);
      ctx.fillStyle='#b00'; ctx.font='18px ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial';
      ctx.fillText('Failed:', s.x+6, s.y+22);
      ctx.fillStyle='#c99'; ctx.fillText(item.name, s.x+6, s.y+42);
    }
  }
  drawGuides();
  sheetLabel.textContent = `Sheet ${pageIndex+1} of ${pages.length}`;
}

function loadImage(srcOrBlob){
  return new Promise((resolve,reject)=>{
    const img = new Image();
    img.onload = ()=> resolve(img);
    img.onerror = reject;
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.loading = 'eager';
    img.src = srcOrBlob instanceof Blob ? URL.createObjectURL(srcOrBlob) : srcOrBlob;
  });
}

// events
buildBtn.addEventListener('click', build);
showGuidesEl.addEventListener('change', render);
templateFileEl.addEventListener('change', async (e)=>{
  const f = e.target.files?.[0];
  if(f){ bakedTemplate = await loadImage(f); render(); }
});
exportBtn.addEventListener('click', ()=>{
  const a = document.createElement('a');
  a.download = `swu-sheet_${pageIndex+1}of${pages.length}.png`;
  a.href = canvas.toDataURL('image/png');
  a.click();
});
printBtn.addEventListener('click', ()=> window.print());
prevSheet.addEventListener('click', ()=>{ if(pageIndex>0){ pageIndex--; render(); } });
nextSheet.addEventListener('click', ()=>{ if(pageIndex<pages.length-1){ pageIndex++; render(); } });
