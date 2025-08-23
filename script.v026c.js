// SWU Proxy Sheet Tool — v0.2.6c
(function(){
  'use strict';
  console.log('[swu-sheet] script loaded');
  var FN_BASE = '/.netlify/functions';
  function $(id){ return document.getElementById(id); }
  function clamp(n,a,b){ return Math.max(a, Math.min(b, n)); }
  function mmToPx(mm,dpi){ return (mm/25.4)*dpi; }
  function inToPx(inch,dpi){ return inch*dpi; }
  function byBtnText(txt){
    var cand = document.querySelectorAll('button, input[type="button"], input[type="submit"]');
    for (var i=0;i<cand.length;i++){
      var t = (cand[i].textContent || cand[i].value || '').trim().toLowerCase();
      if (t === txt.toLowerCase()) return cand[i];
    }
    return null;
  }
  function SWU(path, params){
    params = params || {};
    var usp = new URLSearchParams(Object.assign({ path: path }, params));
    return fetch(FN_BASE + '/swu?' + usp.toString(), { redirect: 'follow' });
  }
  var blobCache = new Map();
  var bmpCache  = new Map();
  function fetchWithBackoff(url, tries, timeoutMs){
    tries = tries || 4; timeoutMs = timeoutMs || 12000;
    if (blobCache.has(url)) return Promise.resolve(blobCache.get(url));
    var lastErr;
    var attempt = function(i){
      return new Promise(function(resolve){
        var ctl = new AbortController();
        var t = setTimeout(function(){ ctl.abort(); }, timeoutMs);
        fetch(url, { signal: ctl.signal, redirect: 'follow' })
          .then(function(res){
            clearTimeout(t);
            if(!res.ok) throw new Error(res.status + ' ' + res.statusText);
            return res.blob();
          })
          .then(function(blob){
            blobCache.set(url, blob);
            resolve(blob);
          })
          .catch(function(e){
            lastErr = e;
            setTimeout(function(){
              if (i+1 < tries) resolve(attempt(i+1)); else resolve(Promise.reject(lastErr));
            }, 250*(i+1));
          });
      });
    };
    return attempt(0);
  }
  function fileToBitmap(file){
    if(!file) return Promise.resolve(null);
    var p = file instanceof Blob ? Promise.resolve(file) : file.arrayBuffer().then(function(buf){ return new Blob([buf], {type: file.type || 'image/png'}); });
    return p.then(function(blob){ return createImageBitmap(blob); });
  }
  function trySearchByName(name){
    return SWU('/cards/search', { q: 'name:"' + name + '"' })
      .then(function(r){ if(!r.ok) return null; return r.json(); })
      .then(function(js){
        if(!js) return null;
        return Array.isArray(js) ? js[0] : (js.data && js.data[0]) || null;
      });
  }
  function titleCase(s){
    return String(s||'').toLowerCase().replace(/\b([a-z])/g, function(m,c){ return c.toUpperCase(); });
  }
  function resolveSWUByName(name){
    var cacheKey = 'name:' + name;
    if (bmpCache.has(cacheKey)) return Promise.resolve(bmpCache.get(cacheKey));
    return trySearchByName(name).then(function(hit){
      if (hit) return hit;
      return SWU('/catalog/card-names')
        .then(function(res){ return res.ok ? res.json() : null; })
        .then(function(cat){
          var names = (cat && (cat.data || cat.values || cat)) || [];
          var needle = String(name||'').toLowerCase().trim();
          var best = names.find(function(n){ return String(n||'').toLowerCase() === needle; }) ||
                     names.find(function(n){ return String(n||'').toLowerCase().indexOf(needle) !== -1; }) ||
                     titleCase(name);
          return trySearchByName(best);
        });
    }).then(function(hit){
      if (!hit) throw new Error('No SWU match for "' + name + '"');
      var set = hit.set || hit.setCode || hit.code || hit.Set || hit.set_code;
      var num = (hit.setnumber != null ? hit.setnumber
              : hit.number != null ? hit.number
              : hit.collector_number != null ? hit.collector_number
              : hit.Number);
      if (set && num != null){
        var url = FN_BASE + '/swu?' + new URLSearchParams({ path: '/cards/' + set + '/' + num, format: 'image' }).toString();
        return fetchWithBackoff(url).then(createImageBitmap).then(function(bmp){ bmpCache.set(cacheKey, bmp); return bmp; });
      }
      var direct = hit.image || (hit.images && (hit.images.large || hit.images.front)) || hit.img || hit.imageUrl || hit.FrontArt;
      if (!direct) throw new Error('No image URL for "' + name + '"');
      try {
        var u = new URL(direct);
        if (u.hostname.slice(-10) === 'swu-db.com'){
          var prox = FN_BASE + '/swu?' + new URLSearchParams({ url: u.toString() }).toString();
          return fetchWithBackoff(prox).then(createImageBitmap).then(function(bmp){ bmpCache.set(cacheKey, bmp); return bmp; });
        }
      } catch(e){}
      return fetchWithBackoff(direct).then(createImageBitmap).then(function(bmp){ bmpCache.set(cacheKey, bmp); return bmp; });
    });
  }
  function chooseOrientation(dpi, cols, rows, cardW, cardH, mL, mT){
    var fitsPortrait  = (cols*cardW + 2*mL <= 8.5) && (rows*cardH + 2*mT <= 11);
    var fitsLandscape = (cols*cardW + 2*mL <= 11 ) && (rows*cardH + 2*mT <= 8.5);
    return fitsPortrait ? { wIn: 8.5, hIn: 11, orient: 'portrait' }
         : fitsLandscape ? { wIn: 11, hIn: 8.5, orient: 'landscape' }
         : { wIn: 11, hIn: 8.5, orient: 'landscape' };
  }
  function getGeom(){
    var dpi   = parseInt(($('#dpi') && $('#dpi').value) || '300', 10) || 300;
    var cardW = parseFloat(($('#cardW') && $('#cardW').value) || '2.5');
    var cardH = parseFloat(($('#cardH') && $('#cardH').value) || '3.5');
    var rows  = parseInt(($('#rows') && $('#rows').value) || '2', 10);
    var cols  = parseInt(($('#cols') && $('#cols').value) || '4', 10);
    var mL    = parseFloat(($('#marginL') && $('#marginL').value) || '0.5');
    var mT    = parseFloat(($('#marginT') && $('#marginT').value) || '0.75');
    var bleed = parseFloat(($('#bleedMM') && $('#bleedMM').value) || '0.5');
    var or = chooseOrientation(dpi, cols, rows, cardW, cardH, mL, mT);
    var PAGE_W = Math.round(inToPx(or.wIn, dpi));
    var PAGE_H = Math.round(inToPx(or.hIn, dpi));
    var CW = Math.round(inToPx(cardW, dpi));
    var CH = Math.round(inToPx(cardH, dpi));
    var BL = Math.max(0, Math.round(mmToPx(bleed, dpi)));
    var startX = Math.round(inToPx(mL, dpi));
    var startY = Math.round(inToPx(mT, dpi));
    var slots = [];
    for (var r=0;r<rows;r++){
      for (var c=0;c<cols;c++){
        var x = startX + c*CW;
        var y = startY + r*CH;
        slots.push({x:x, y:y, w:CW, h:CH});
      }
    }
    return { dpi:dpi, PAGE_W:PAGE_W, PAGE_H:PAGE_H, CW:CW, CH:CH, BL:BL, rows:rows, cols:cols, slots:slots, wIn:or.wIn, hIn:or.hIn, orient:or.orient };
  }
  var state = { names: [], overlayBmp: null, overlayPath: null };
  function loadOverlay(){
    if (state.overlayBmp) return Promise.resolve();
    var p = 'assets/letter_poker_v2_fixed.svg';
    return fetch(p).then(function(r){ if(!r.ok) throw new Error('overlay fetch failed'); return r.blob(); })
      .then(function(b){
        if (p.toLowerCase().slice(-4) !== '.svg') return createImageBitmap(b);
        return new Promise(function(resolve, reject){
          var url = URL.createObjectURL(b);
          var img = new Image(); img.decoding = 'async'; img.src = url;
          img.onload = function(){ resolve(img); };
          img.onerror = function(e){ reject(e); };
        });
      }).then(function(bmp){ state.overlayBmp = bmp; state.overlayPath = p; })
      .catch(function(e){ console.warn('[swu-sheet] overlay load failed', e); });
  }
  function wrapText(ctx, text, x, y, mw, lh){
    var lines = String(text||'').split('\n').reduce(function(acc, line){
      var words = line.split(' '), buf = '';
      for (var i=0;i<words.length;i++){
        var t = buf ? (buf + ' ' + words[i]) : words[i];
        if (ctx.measureText(t).width > mw){
          acc.push(buf || words[i]); buf = words[i];
        } else { buf = t; }
      }
      if (buf) acc.push(buf);
      return acc;
    }, []);
    for (var j=0;j<lines.length;j++) ctx.fillText(lines[j], x, y + j*lh);
  }
  function render(){
    var geom = getGeom();
    var canvas = $('#sheet') || document.querySelector('canvas') || document.createElement('canvas');
    if (!canvas.parentNode) document.body.appendChild(canvas);
    var ctx = canvas.getContext('2d', { alpha:false });
    if (canvas.width !== geom.PAGE_W) canvas.width = geom.PAGE_W;
    if (canvas.height !== geom.PAGE_H) canvas.height = geom.PAGE_H;
    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,geom.PAGE_W, geom.PAGE_H);
    return loadOverlay().then(function(){
      var overlayOn = ($('#overlayToggle') && $('#overlayToggle').checked) || false;
      var overlayOpacity = parseFloat(($('#overlayOpacity') && $('#overlayOpacity').value) || '1');
      if (overlayOn && state.overlayBmp){
        ctx.save(); ctx.globalAlpha = clamp(overlayOpacity, 0, 1);
        ctx.drawImage(state.overlayBmp, 0, 0, geom.PAGE_W, geom.PAGE_H);
        ctx.restore();
      }
      if (geom.BL > 0){
        ctx.fillStyle = '#000';
        geom.slots.forEach(function(s){
          ctx.fillRect(s.x - geom.BL, s.y - geom.BL, s.w + 2*geom.BL, s.h + 2*geom.BL);
        });
      }
      var names = state.names.slice(0, geom.slots.length);
      var chain = Promise.resolve();
      names.forEach(function(name, i){
        chain = chain.then(function(){
          var s = geom.slots[i];
          return resolveSWUByName(name).then(function(bmp){
            ctx.drawImage(bmp, s.x, s.y, s.w, s.h);
          }).catch(function(e){
            console.warn('[swu-sheet] failed image', name, e);
            ctx.fillStyle = '#ffeded'; ctx.fillRect(s.x, s.y, s.w, s.h);
            ctx.strokeStyle = '#d33'; ctx.lineWidth = 6; ctx.strokeRect(s.x+3, s.y+3, s.w-6, s.h-6);
            ctx.fillStyle = '#900'; ctx.font = '26px system-ui, sans-serif';
            wrapText(ctx, 'Failed:\n' + name, s.x + 16, s.y + 40, s.w - 32, 34);
          });
        });
      });
      var sb = $('#statusBar');
      if (sb) sb.textContent = names.length + '/' + geom.slots.length + ' slots @ ' + geom.PAGE_W + 'x' + geom.PAGE_H + ' (' + geom.orient + ')';
      console.log('[swu-sheet]', names.length + '/' + geom.slots.length + ' slots filled @ ' + geom.PAGE_W + 'x' + geom.PAGE_H + ' (' + geom.orient + ')');
      return chain;
    });
  }
  function bind(){
    Array.prototype.forEach.call(document.querySelectorAll('form'), function(f){
      f.addEventListener('submit', function(e){ e.preventDefault(); });
    });
    var parseBtn = $('#btnParse') || byBtnText('Add from Pasted List');
    var addBtn   = $('#btnAddSearch') || byBtnText('Add');
    var saveBtn  = $('#btnSavePNG') || byBtnText('Export PNG');
    var printBtn = $('#btnPrint') || byBtnText('Print');
    saveBtn && saveBtn.addEventListener('click', function(e){
      e.preventDefault();
      var a = document.createElement('a');
      a.href = ($('#sheet') || document.querySelector('canvas')).toDataURL('image/png');
      a.download = 'cards-sheet.png'; a.click();
    });
    printBtn && printBtn.addEventListener('click', function(e){
      e.preventDefault();
      var jsPDF = window.jspdf && window.jspdf.jsPDF;
      var g = getGeom();
      if (jsPDF){
        var doc = new jsPDF({ orientation: g.wIn > g.hIn ? 'landscape' : 'portrait', unit: 'in', format: [g.wIn, g.hIn] });
        var dataURL = ($('#sheet') || document.querySelector('canvas')).toDataURL('image/jpeg', 0.95);
        doc.addImage(dataURL, 'JPEG', 0, 0, g.wIn, g.hIn);
        doc.save('cards-sheet.pdf');
      } else { window.print(); }
    });
    parseBtn && parseBtn.addEventListener('click', function(e){
      e.preventDefault();
      var area = $('#pasteList') || document.querySelector('textarea');
      function sanitize(s){ return String(s||'').replace(/^\s*\d+\s*[x×]\s*/i,'').replace(/\s{2,}/g,' ').trim(); }
      var names = String(area && area.value || '').split(/[\n,;]+/).map(sanitize).filter(Boolean);
      console.log('[swu-sheet] parsed names:', names);
      state.names = names; render();
    });
    addBtn && addBtn.addEventListener('click', function(e){
      e.preventDefault();
      var box = $('#searchBox') || document.querySelector('input[type="text"]');
      function sanitize(s){ return String(s||'').replace(/^\s*\d+\s*[x×]\s*/i,'').replace(/\s{2,}/g,' ').trim(); }
      var n = sanitize(box && box.value || ''); if (!n) return; state.names.push(n); render();
    });
    var of = $('#overlayFile');
    if (of) of.addEventListener('change', function(e){
      var f = e.target.files && e.target.files[0];
      fileToBitmap(f).then(function(bmp){ state.overlayBmp = bmp; state.overlayPath = (f && f.name) || 'upload'; render(); });
    });
    var ot = $('#overlayToggle'); if (ot) ot.addEventListener('change', render);
    var oo = $('#overlayOpacity'); if (oo) oo.addEventListener('input', render);
    ['cardW','cardH','rows','cols','marginL','marginT','dpi','bleedMM'].forEach(function(id){
      var el = document.getElementById(id);
      if (el){ el.addEventListener('input', render); el.addEventListener('change', render); }
    });
  }
  function init(){
    if ($('#rows') && !$('#rows').value) $('#rows').value = '2';
    if ($('#cols') && !$('#cols').value) $('#cols').value = '4';
    bind();
    SWU('/catalog/card-names').then(function(p){ console.log('[swu-sheet] proxy ping:', p.status); }).catch(function(e){ console.error('[swu-sheet] proxy ping failed', e); });
    render().then(function(){ console.log('[swu-sheet] init complete'); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();