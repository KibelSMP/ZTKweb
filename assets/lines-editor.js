// Edytor linii: pozwala modyfikować sekwencje stacji dla linii, oznaczać skipped i eksportować/importować lines.json
(function(){
  const mapEl = document.getElementById('map');
  const sel = document.getElementById('line-select');
  const search = document.getElementById('line-search');
  const status = document.getElementById('line-editor-status');
  const addInput = document.getElementById('conn-add');
  const addBtn = document.getElementById('btn-add-conn');
  const clearBtn = document.getElementById('btn-clear-conns');
  const btnImportLines = document.getElementById('btn-import-lines');
  const btnDownloadLines = document.getElementById('btn-download-lines');
  const listEl = document.getElementById('connections');
  const datalist = document.getElementById('stations-list');
  const btnImportStations = document.getElementById('btn-import-stations');
  const fileImportStations = document.getElementById('file-import-stations');
  const fileImportLines = document.getElementById('file-import-lines');
  // sterowanie tłem mapy
  const btnUploadBg = document.getElementById('btn-upload-bg');
  const btnClearBg = document.getElementById('btn-clear-bg');
  const inputBg = document.getElementById('bg-upload');
  // props
  const propId = document.getElementById('prop-id');
  const propCategory = document.getElementById('prop-category');
  const propColor = document.getElementById('prop-color');
  const propHexLight = document.getElementById('prop-hex-light');
  const propHexDark = document.getElementById('prop-hex-dark');
  const propHexLightColor = document.getElementById('prop-hex-light-color');
  const propHexDarkColor = document.getElementById('prop-hex-dark-color');
  const propHexLightSwatch = document.getElementById('prop-hex-light-swatch');
  const propHexDarkSwatch = document.getElementById('prop-hex-dark-swatch');
  const propRelation = document.getElementById('prop-relation');

  /** @type {Record<string, {name?: string, voivodeship?: string, coordinates?: [number,number]|null, type?: string}>} */
  let stations = {};
  /** @type {Record<string, {color?: string|null, category?: string, relation?: string, stations?: string[], skipped?: string[], hexLightMode?: string, hexDarkMode?: string, shapes?: Record<string, Array<[number,number]>>, anchors?: Record<string, [number,number]>}>} */
  let lines = {};
  // tryb edycji kształtu pojedynczego segmentu
  /** @type {null | {a:string,b:string, idx:number, points: Array<[number,number]>}} */
  let shapeMode = null;
  let shapeLayer = null; // overlay na mapie dla uchwytów
  let shapeToolbar = null;
  let suppressAddPointClick = false;
  let shapeAnchorA = null, shapeAnchorB = null, shapeHelpSpan = null;

  function setStatus(msg){ if (status) status.textContent = msg; }

  function fillStationsDatalist(){
    const items = Object.entries(stations).map(([id, st]) => ({id, name: st.name || id}))
      .sort((a,b)=>a.name.localeCompare(b.name,'pl'));
    datalist.innerHTML = items.map(({id,name})=>`<option value="${name} (${id})"></option>`).join('');
  }
  function parseStation(text){
    if (!text) return null;
    const m = text.match(/\(([A-Z]{2,})\)\s*$/);
    if (m && stations[m[1]]) return m[1];
    const up = text.trim().toUpperCase();
    if (stations[up]) return up;
    const items = Object.entries(stations).map(([id, st]) => ({id, name: st.name || id}));
    const found = items.find(it => it.name.toLowerCase() === text.trim().toLowerCase());
    return found ? found.id : null;
  }

  function buildSelect(){
    const items = Object.entries(lines).map(([id, ln])=>({id, rel: (ln.relation||'').toString().split(/\n|\r/)[0]}))
      .sort((a,b)=> a.id.localeCompare(b.id,'pl'));
    sel.innerHTML='';
    for (const it of items){
      const opt = document.createElement('option');
      opt.value = it.id; opt.textContent = `${it.id}: ${it.rel}`.trim();
      sel.appendChild(opt);
    }
  }

  function getScale(){
    const v = getComputedStyle(mapEl).getPropertyValue('--map-scale');
    const s = parseFloat(v.trim());
    return Number.isFinite(s) && s>0 ? s : 1;
  }

  function ensureCanvas(){
    let canvas = mapEl.querySelector('canvas#conn');
    if (!canvas){
      canvas = document.createElement('canvas');
      canvas.id = 'conn';
      canvas.style.position='absolute'; canvas.style.top='0'; canvas.style.left='0'; canvas.style.pointerEvents='none';
      mapEl.appendChild(canvas);
    }
    const baseW = mapEl.clientWidth, baseH = mapEl.clientHeight;
    const dpr = Math.max(1, window.devicePixelRatio||1);
    const scale = getScale();
    canvas.style.width = baseW+'px'; canvas.style.height = baseH+'px';
    canvas.width = Math.max(1, Math.round(baseW*dpr*scale));
    canvas.height = Math.max(1, Math.round(baseH*dpr*scale));
    return canvas;
  }

  function ensureShapeOverlay(){
    if (!shapeLayer){
      const layer = document.createElement('div');
      layer.id = 'shape-layer';
      layer.style.position = 'absolute';
      layer.style.top = '0'; layer.style.left = '0';
      layer.style.right = '0'; layer.style.bottom = '0';
      layer.style.pointerEvents = 'none';
      mapEl.appendChild(layer);
      shapeLayer = layer;
    }
  if (!shapeToolbar){
      const tb = document.createElement('div');
    tb.className = 'shape-toolbar';
  tb.innerHTML = `
        <div class="shape-toolbar-row">
    <span id="shape-help">Tryb odcinka: kliknij, aby dodać punkt; przeciągnij, aby przesunąć; dwuklik usuwa punkt. Kolejność punktów jest kierunkowa.</span>
          <span class="shape-toolbar-actions">
            <button id="shape-save" class="btn btn-sm">Zapisz</button>
    <button id="shape-straighten" class="btn btn-sm btn-warning">Wyprostuj odcinek</button>
            <button id="shape-cancel" class="btn btn-sm btn-secondary">Anuluj</button>
          </span>
        </div>`;
  tb.style.display = 'none';
  const host = mapEl.parentElement || document.body; // umieść toolbar poza transformowaną mapą
  host.appendChild(tb);
      shapeToolbar = tb;
      shapeHelpSpan = tb.querySelector('#shape-help');
  // obsługa przycisków
  tb.querySelector('#shape-save').addEventListener('click', ()=>{
        if (!shapeMode) return;
        const lineId = sel.value; if (!lineId) return;
        const ln = lines[lineId] = lines[lineId] || {};
        const currentPoints = Array.isArray(shapeMode.points) ? shapeMode.points.slice() : [];
    // shapesDir: kierunkowe A>B
    ln.shapesDir = ln.shapesDir || {};
    const dkey = dirKey(shapeMode.a, shapeMode.b);
    if (!currentPoints.length) delete ln.shapesDir[dkey]; else ln.shapesDir[dkey] = currentPoints;
    // legacy shapes: bez kierunku
    const key = pairKey(shapeMode.a, shapeMode.b);
    const pts = normalizePtsForStore(shapeMode.a, shapeMode.b, currentPoints);
    ln.shapes = ln.shapes || {};
    if (!pts.length) delete ln.shapes[key]; else ln.shapes[key] = pts;
        exitShapeMode(); rebuild(); setStatus('Zapisano kształt odcinka.');
      });
      tb.querySelector('#shape-straighten').addEventListener('click', ()=>{
        if (!shapeMode) return;
        const lineId = sel.value; if (!lineId) return;
        const ln = lines[lineId] = lines[lineId] || {};
        // wyczyść punkty dla pary w shapesDir i legacy shapes
        if (ln.shapesDir){ delete ln.shapesDir[dirKey(shapeMode.a, shapeMode.b)]; }
        const key = pairKey(shapeMode.a, shapeMode.b);
        if (ln.shapes){ delete ln.shapes[key]; }
        shapeMode.points = [];
        renderShapeOverlay();
        rebuild();
        setStatus('Odcinek wyprostowany.');
      });
      tb.querySelector('#shape-cancel').addEventListener('click', ()=>{ exitShapeMode(); setStatus('Anulowano edycję kształtu.'); });
    }
  }

  function pairKey(a,b){ return a < b ? `${a}|${b}` : `${b}|${a}`; }
  function dirKey(a,b){ return `${a}>${b}`; }
  function getPtsForPairInOrder(ln, a, b){
    const key = pairKey(a,b);
    const arr = ln && ln.shapes && Array.isArray(ln.shapes[key]) ? ln.shapes[key] : [];
    if (!arr.length) return [];
    // arr jest w kolejności zgodnej z key (posortowanej alfabetycznie). Jeśli rysujemy w odwrotnej, odwróć.
  return a < b ? arr.slice() : arr.slice().reverse();
  }
  function getPtsForDirection(ln, a, b){
    if (ln && ln.shapesDir) {
      const dk = dirKey(a,b);
      if (Array.isArray(ln.shapesDir[dk])) return ln.shapesDir[dk].slice();
      const rd = dirKey(b,a);
      if (Array.isArray(ln.shapesDir[rd])) return ln.shapesDir[rd].slice().reverse();
    }
    return getPtsForPairInOrder(ln, a, b);
  }
  function normalizePtsForStore(a,b, points){
  const pts = Array.isArray(points)? points.filter(p=> Array.isArray(p) && p.length===2).map(p=>[Number(p[0]),Number(p[1])]) : [];
  return a < b ? pts : pts.slice().reverse();
  }

  // geometra: dystans punkt–odcinek w przestrzeni procentowej (left,top)
  function dist2PointToSeg(p, a, b){
    // p,a,b: [top,left] w %; przelicz na [x,y] = [left, top]
    const px = p[1], py = p[0];
    const ax = a[1], ay = a[0];
    const bx = b[1], by = b[0];
    const vx = bx - ax, vy = by - ay;
    const wx = px - ax, wy = py - ay;
    const vv = vx*vx + vy*vy;
    let t = vv > 0 ? (wx*vx + wy*vy) / vv : 0;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    const cx = ax + t*vx, cy = ay + t*vy;
    const dx = px - cx, dy = py - cy;
    return dx*dx + dy*dy;
  }

  function insertPointByNearestSegment(aId, bId, pts, newP){
    const aSt = stations[aId]; const bSt = stations[bId];
    const a = Array.isArray(aSt?.coordinates) ? [Number(aSt.coordinates[0]), Number(aSt.coordinates[1])] : null;
    const b = Array.isArray(bSt?.coordinates) ? [Number(bSt.coordinates[0]), Number(bSt.coordinates[1])] : null;
    if (!a || !b){ pts.push(newP); return; }
    const nodes = [a, ...pts, b];
    let bestI = 0; let bestD = Infinity;
    for (let i=0;i<nodes.length-1;i++){
      const d2 = dist2PointToSeg(newP, nodes[i], nodes[i+1]);
      if (d2 < bestD){ bestD = d2; bestI = i; }
    }
    // bestI wskazuje segment: nodes[bestI] -> nodes[bestI+1]
    // indeks wstawienia do pts:
    //  - jeśli segment A->pts[0] (bestI==0): insert at 0
    //  - jeśli segment pts[i-1]->pts[i] (1..n-1): insert at i
    //  - jeśli segment pts[n-1]->B (bestI==n): insert at n (push)
    const n = pts.length;
    const insertIdx = Math.min(Math.max(bestI, 0), n);
    pts.splice(insertIdx, 0, newP);
  }
  function exitShapeMode(){
    shapeMode = null;
    if (shapeLayer){ shapeLayer.innerHTML = ''; shapeLayer.style.pointerEvents = 'none'; }
    if (shapeToolbar){ shapeToolbar.style.display = 'none'; }
    draw();
  }
  function enterShapeMode(idx){
    const id = sel.value; const ln = lines[id]; if (!ln) return;
    const seq = Array.isArray(ln.stations)? ln.stations: [];
    const a = seq[idx]; const b = seq[idx+1]; if (!a || !b) return;
    ensureShapeOverlay();
  // ustaw etykietę kontekstu odcinka
    if (shapeHelpSpan) {
      const an = stations[a]?.name || a; const bn = stations[b]?.name || b;
      shapeHelpSpan.textContent = `Odcinek: ${an} ⇄ ${bn} — klik: dodaj, przeciągnij: przesuń, dwuklik: usuń`;
    }
  const pts = getPtsForDirection(ln, a, b);
    shapeMode = {a,b, idx, points: pts.slice()};
    shapeLayer.style.pointerEvents = 'auto';
    shapeToolbar.style.display = 'block';
    renderShapeOverlay();
  }
  function renderShapeOverlay(){
    draw(); // narysuj linię bazową z aktualnymi punktami
    if (!shapeMode) return;
    // dodaj uchwyty
    shapeLayer.innerHTML = '';
    const width = mapEl.clientWidth, height = mapEl.clientHeight;
    // uchwyty dla punktów pośrednich
    shapeMode.points.forEach((p, i)=>{
      const el = document.createElement('div');
      el.className = 'shape-handle';
      el.style.left = p[1] + '%';
      el.style.top = p[0] + '%';
      el.title = 'Dwuklik: usuń';
      shapeLayer.appendChild(el);
  let dragging = false; let startX=0, startY=0; let moved=false;
      function setPosFromEvent(ev){
        const rect = mapEl.getBoundingClientRect();
        const left = Math.min(100, Math.max(0, ((ev.clientX - rect.left)/rect.width)*100));
        const top = Math.min(100, Math.max(0, ((ev.clientY - rect.top)/rect.height)*100));
        shapeMode.points[i] = [top, left];
        el.style.left = left + '%'; el.style.top = top + '%';
        draw(); // odśwież podgląd
      }
  el.addEventListener('mousedown', (ev)=>{ ev.preventDefault(); ev.stopPropagation(); dragging=true; moved=false; startX=ev.clientX; startY=ev.clientY; document.body.style.userSelect='none'; });
  window.addEventListener('mousemove', (ev)=>{ if(dragging){ if (!moved && (Math.abs(ev.clientX-startX)>2 || Math.abs(ev.clientY-startY)>2)) moved=true; setPosFromEvent(ev); }});
  window.addEventListener('mouseup', ()=>{ if(dragging){ dragging=false; document.body.style.userSelect=''; if (moved) suppressAddPointClick = true; }});
      el.addEventListener('dblclick', (ev)=>{ ev.preventDefault(); ev.stopPropagation(); shapeMode.points.splice(i,1); renderShapeOverlay(); });
    });
    // klik na mapę dodaje nowy punkt
    shapeLayer.onclick = (ev)=>{
      if (!shapeMode) return;
  if (suppressAddPointClick) { suppressAddPointClick = false; return; }
      const target = ev.target;
      if (target && (target.closest && (target.closest('.shape-handle') || target.closest('.shape-toolbar')))) return;
      const rect = mapEl.getBoundingClientRect();
      const left = Math.min(100, Math.max(0, ((ev.clientX - rect.left)/rect.width)*100));
      const top = Math.min(100, Math.max(0, ((ev.clientY - rect.top)/rect.height)*100));
      insertPointByNearestSegment(shapeMode.a, shapeMode.b, shapeMode.points, [top, left]);
      renderShapeOverlay();
    };
  }

  function draw(){
    const canvas = ensureCanvas();
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height);
    // rysuj markery stacji (read-only)
    const width = mapEl.clientWidth, height = mapEl.clientHeight;
    const dpr = Math.max(1, window.devicePixelRatio||1); const scale = getScale();
  ctx.setTransform(dpr*scale,0,0,dpr*scale,0,0);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
    Object.entries(stations).forEach(([id, st]) => {
      if (!Array.isArray(st.coordinates)) return;
      const [t,l] = st.coordinates.map(Number);
      const x=(l/100)*width, y=(t/100)*height;
      ctx.fillStyle = '#666'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1/scale;
      ctx.beginPath(); ctx.arc(x, y, 3/scale, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    });
    const id = sel.value;
    const line = lines[id]; if (!line) return;
    const seq = Array.isArray(line.stations)? line.stations: [];
  ctx.lineWidth = 3/scale; ctx.strokeStyle = '#00bcd4'; ctx.globalAlpha=0.9;
  ctx.beginPath(); let started=false; let prevSid=null; let prevX=0, prevY=0;
    for (const sid of seq){
      const st = stations[sid];
      const coords = st && Array.isArray(st.coordinates) ? st.coordinates.map(Number) : null;
      if (!coords){ started=false; prevSid=null; continue; }
      const [t,l] = coords; const x=(l/100)*width; const y=(t/100)*height;
      if (!started){ ctx.moveTo(x,y); started=true; prevSid=sid; prevX=x; prevY=y; }
    else {
  const editingThis = shapeMode && ((shapeMode.a===prevSid && shapeMode.b===sid) || (shapeMode.a===sid && shapeMode.b===prevSid));
  let pts;
  if (editingThis){
    const forward = (shapeMode.a===prevSid && shapeMode.b===sid);
    const arr = shapeMode.points || [];
    pts = forward ? arr : arr.slice().reverse();
  } else {
    pts = getPtsForDirection(line, prevSid, sid);
  }
  for (const p of pts){ const px=(p[1]/100)*width, py=(p[0]/100)*height; ctx.lineTo(px,py); }
  ctx.lineTo(x,y);
        prevSid=sid; prevX=x; prevY=y;
      }
    }
    ctx.stroke();
    ctx.globalAlpha=1;
  }

  function renderList(){
    const id = sel.value; const ln = lines[id] || {};
    const seq = Array.isArray(ln.stations)? ln.stations: [];
    const skipped = new Set(Array.isArray(ln.skipped)? ln.skipped: []);
    if (!seq.length){ listEl.innerHTML = '<div class="legend-empty">Brak połączeń — dodaj stacje powyżej.</div>'; return; }
    const parts = [];
    seq.forEach((sid, idx)=>{
      const name = stations[sid]?.name || sid;
      const isSk = skipped.has(sid);
      const isLast = idx === seq.length - 1;
      parts.push(`<div class="conn-item${isSk?' skipped':''}" data-idx="${idx}" data-id="${sid}">
        <span class="conn-name">${idx+1}. ${name} (${sid})</span>
        <span class="conn-actions">
          <button class="btn btn-sm" data-act="up">↑</button>
          <button class="btn btn-sm" data-act="down">↓</button>
          <button class="btn btn-sm" data-act="toggle-skip">${isSk?'Odznacz':'Pomiń'}</button>
          <button class="btn btn-sm btn-danger" data-act="remove">Usuń</button>
        </span>
      </div>`);
      if (!isLast) {
        parts.push(`<div class="conn-sep" data-idx="${idx}"><span class="seg-link" role="button" title="Edytuj kształt odcinka">odcinek</span></div>`);
      }
    });
    listEl.innerHTML = `<div class="conn-list">${parts.join('')}</div>`;
  }

  function saveBlob(obj){ return new Blob([JSON.stringify(obj,null,2)], {type:'application/json;charset=utf-8'}); }
  function download(filename, blob){ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href); a.remove();}, 100); }

  function rebuild(){ renderList(); draw(); }

  function loadProps(){
    const id = sel.value; const ln = lines[id] || {};
    propId.value = id || '';
    const rawCat = String(ln.category || '').toUpperCase();
    // mapowanie luźnych nazw na klucze
    let cat = '';
    if (rawCat.includes('METRO')) cat = 'METRO';
    else if (rawCat.includes('IC')) cat = 'IC';
    else if (rawCat.includes('ON')) cat = 'ON_DEMAND';
    else if (rawCat.includes('REGIO')) cat = 'REGIO';
    propCategory.value = cat;
    propColor.value = ln.color || '';
  propHexLight.value = ln.hexLightMode || '';
  propHexDark.value = ln.hexDarkMode || '';
  // ustaw pickery, jeśli poprawne hexy
  try { const v = /^#([0-9a-f]{6})$/i.test(propHexLight.value) ? propHexLight.value : '#000000'; propHexLightColor.value = v; if(propHexLightSwatch) propHexLightSwatch.style.background = v; } catch {}
  try { const v = /^#([0-9a-f]{6})$/i.test(propHexDark.value) ? propHexDark.value : '#000000'; propHexDarkColor.value = v; if(propHexDarkSwatch) propHexDarkSwatch.style.background = v; } catch {}
    propRelation.value = ln.relation || '';
  }
  function saveProps(){
    const id = sel.value; if (!id) return;
    const ln = lines[id] = lines[id] || {};
    ln.category = propCategory.value || '';
    ln.color = propColor.value || '';
  ln.hexLightMode = propHexLight.value || '';
  ln.hexDarkMode = propHexDark.value || '';
    ln.relation = propRelation.value || '';
    setStatus('Zapisano właściwości linii.');
  }

  // Interakcje
  search.addEventListener('input', ()=>{
    const q = search.value.trim().toLowerCase();
    const opts = Array.from(sel.options);
    const hit = opts.find(o=>o.textContent.toLowerCase().includes(q));
    if (hit) sel.value = hit.value;
    rebuild();
  });
  sel.addEventListener('change', ()=>{ exitShapeMode(); rebuild(); loadProps(); });
  addBtn.addEventListener('click', ()=>{
    const id = sel.value; if (!id) return;
    const sid = parseStation(addInput.value);
    if (!sid){ setStatus('Wybierz poprawną stację do dodania.'); return; }
    lines[id] = lines[id] || {}; lines[id].stations = Array.isArray(lines[id].stations)? lines[id].stations: [];
    lines[id].stations.push(sid);
    addInput.value='';
    rebuild(); setStatus('Dodano stację do linii.');
  });
  clearBtn.addEventListener('click', ()=>{
    const id = sel.value; if (!id) return;
    if (!lines[id]) return; const ok = window.confirm('Wyczyścić wszystkie połączenia tej linii?'); if (!ok) return;
    lines[id].stations = []; lines[id].skipped = [];
  exitShapeMode(); rebuild(); setStatus('Wyczyszczono połączenia.');
  });
  listEl.addEventListener('click', (e)=>{
    // klik w separator "odcinek"
    const seg = e.target.closest('.seg-link');
    if (seg) {
      const sep = seg.closest('.conn-sep');
      if (!sep) return;
      const idx = Number(sep.dataset.idx);
      const id = sel.value; const ln = lines[id]; if (!ln || !Array.isArray(ln.stations)) return;
      if (idx >= 0 && idx < ln.stations.length-1) { enterShapeMode(idx); setStatus('Edycja kształtu odcinka.'); }
      return;
    }
    // inne akcje przycisków w wierszu stacji
    const btn = e.target.closest('button'); if (!btn) return;
    const item = e.target.closest('.conn-item'); if (!item) return;
    const act = btn.dataset.act; const idx = Number(item.dataset.idx); const id = sel.value; const ln = lines[id];
    if (!ln || !Array.isArray(ln.stations)) return;
    if (act==='up' && idx>0){ const t=ln.stations[idx-1]; ln.stations[idx-1]=ln.stations[idx]; ln.stations[idx]=t; exitShapeMode(); }
    else if (act==='down' && idx<ln.stations.length-1){ const t=ln.stations[idx+1]; ln.stations[idx+1]=ln.stations[idx]; ln.stations[idx]=t; exitShapeMode(); }
    else if (act==='remove'){ ln.stations.splice(idx,1); if (Array.isArray(ln.skipped)) ln.skipped = ln.skipped.filter(s=> s!==item.dataset.id); exitShapeMode(); }
    else if (act==='toggle-skip'){
      ln.skipped = Array.isArray(ln.skipped)? ln.skipped: [];
      const sid = item.dataset.id;
      if (ln.skipped.includes(sid)) ln.skipped = ln.skipped.filter(s=>s!==sid); else ln.skipped.push(sid);
    }
    rebuild(); setStatus('Zaktualizowano połączenia.');
  });

  btnImportLines.addEventListener('click', ()=>{
    const input = fileImportLines; if (!input) return; input.value='';
    input.onchange = async ()=>{
      const f = input.files && input.files[0]; if (!f) return;
      try{ const txt = await f.text(); const json = JSON.parse(txt);
        if (!json || Array.isArray(json) || typeof json !== 'object') { setStatus('Nieprawidłowy format.'); return; }
        // minimalna walidacja
        lines = json; exitShapeMode(); buildSelect(); rebuild(); setStatus(`Zaimportowano ${Object.keys(lines).length} linii.`);
      } catch(e){ setStatus('Błąd importu: '+e); }
    };
    input.click();
  });
  btnDownloadLines.addEventListener('click', ()=>{
    download('lines.json', saveBlob(lines));
  });
  btnImportStations && btnImportStations.addEventListener('click', ()=>{
    const input = fileImportStations; if (!input) return; input.value='';
    input.onchange = async ()=>{
      const f = input.files && input.files[0]; if (!f) return;
      try{ const txt = await f.text(); const json = JSON.parse(txt);
        if (!json || Array.isArray(json) || typeof json !== 'object') { setStatus('Nieprawidłowy format stations.json.'); return; }
  stations = json; exitShapeMode(); fillStationsDatalist(); rebuild(); setStatus(`Zaimportowano ${Object.keys(stations).length} stacji.`);
      } catch(e){ setStatus('Błąd importu stacji: '+e); }
    };
    input.click();
  });

  // Tło mapy wgrywane przez użytkownika (dzielone z edytorem stacji)
  function applyBgFromStorage() {
    try {
      const url = localStorage.getItem('editor.mapBg');
      if (url) {
        mapEl.style.backgroundImage = `url('${url}')`;
        mapEl.style.backgroundSize = 'cover';
        mapEl.style.backgroundPosition = 'center';
        mapEl.style.backgroundRepeat = 'no-repeat';
      } else {
        mapEl.style.backgroundImage = '';
      }
    } catch {}
  }

  // Upload/wyczyszczenie tła mapy
  btnUploadBg && btnUploadBg.addEventListener('click', () => { inputBg && inputBg.click(); });
  inputBg && inputBg.addEventListener('change', async () => {
    const file = inputBg.files && inputBg.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setStatus('Nieprawidłowy plik (wymagany obraz).'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const dataUrl = reader.result;
        localStorage.setItem('editor.mapBg', String(dataUrl));
        applyBgFromStorage();
        setStatus('Załadowano tło mapy.');
      } catch (e) { setStatus('Nie udało się zapisać tła: ' + e); }
    };
    reader.readAsDataURL(file);
  });
  btnClearBg && btnClearBg.addEventListener('click', () => {
    localStorage.removeItem('editor.mapBg');
    applyBgFromStorage();
    setStatus('Usunięto tło mapy.');
  });

  function loadData(){
    setStatus('Ładowanie stations.json/lines.json…');
    return Promise.all([
      fetch('../assets/stations.json', {cache:'no-store'}).then(r=>r.json()).then(j=>{stations=j}),
      fetch('../assets/lines.json', {cache:'no-store'}).then(r=>r.json()).then(j=>{lines=j}),
    ]).then(()=>{
  fillStationsDatalist(); buildSelect(); rebuild(); loadProps(); setStatus('Gotowe.');
    }).catch(e=> setStatus('Błąd ładowania: '+e));
  }

  // Rysowanie przy zmianach skali/okna oraz zapis propsów przy zmianie pól
  window.addEventListener('resize', draw);
  const mo = new MutationObserver(draw); mo.observe(mapEl, {attributes:true, attributeFilter:['style']});
  [propCategory, propColor, propHexLight, propHexDark, propRelation].forEach(el=>{
    el && el.addEventListener('change', saveProps);
    el && el.addEventListener('blur', saveProps);
  });
  // synchronizacja pól tekstowych z color pickers
  if (propHexLightColor && propHexLight) {
    propHexLightColor.addEventListener('input', ()=>{ const v = propHexLightColor.value.toUpperCase(); propHexLight.value = v; if(propHexLightSwatch) propHexLightSwatch.style.background = v; saveProps(); });
    propHexLight.addEventListener('input', ()=>{
      const v = propHexLight.value.trim();
      if (/^#([0-9a-f]{6})$/i.test(v)) { try { propHexLightColor.value = v; if(propHexLightSwatch) propHexLightSwatch.style.background = v; } catch {} }
    });
  }
  if (propHexDarkColor && propHexDark) {
    propHexDarkColor.addEventListener('input', ()=>{ const v = propHexDarkColor.value.toUpperCase(); propHexDark.value = v; if(propHexDarkSwatch) propHexDarkSwatch.style.background = v; saveProps(); });
    propHexDark.addEventListener('input', ()=>{
      const v = propHexDark.value.trim();
      if (/^#([0-9a-f]{6})$/i.test(v)) { try { propHexDarkColor.value = v; if(propHexDarkSwatch) propHexDarkSwatch.style.background = v; } catch {} }
    });
  }

  loadData();
  applyBgFromStorage();
})();
