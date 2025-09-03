// renamed from viewer.js
// Content copied from viewer.js
(async function () {
  const mapEl = document.getElementById('map');
  if (!mapEl) return;
  try {
    const [stRes, lnRes, locRes] = await Promise.all([
      fetch('assets/stations.json', { cache: 'no-store' }),
      fetch('assets/lines.json', { cache: 'no-store' }),
      fetch('assets/localities.json', { cache: 'no-store' }).catch(() => new Response('[]', { headers: { 'Content-Type': 'application/json' } }))
    ]);
  if (!stRes.ok || !lnRes.ok) throw new Error('HTTP ' + stRes.status + '/' + lnRes.status);
  const stations = await stRes.json();
  const lines = await lnRes.json();
    let localities = [];
    try { localities = await locRes.json(); } catch { localities = []; }
  const canvas = document.createElement('canvas');
    canvas.width = mapEl.clientWidth;
    canvas.height = mapEl.clientHeight;
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.pointerEvents = 'none';
  mapEl.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    let highlightedSegments = [];
    const colorMapLight = { Red: '#d32f2f', Pink: '#e91e63', Blue: '#1976d2', Green: '#388e3c', White: '#ffffff', Black: '#000000', Grey: '#757575', Gray: '#757575', Brown: '#6d4c41', Lime: '#cddc39', Yellow: '#fbc02d', Cyan: '#00bcd4', Purple: '#7b1fa2', 'Light Blue': '#03a9f4', 'Light blue': '#03a9f4', Magenta: '#d81b60', 'Light gray': '#bdbdbd', 'Light grey': '#bdbdbd', Orange: '#ff9800', Birch: '#c0a16b', Warped: '#673ab7', Accacia: '#9ccc65', Cherry: '#c2185b', Oak: '#795548', Mangrove: '#2e7d32', Jungle: '#43a047' };
    const colorMapDark = { Red: '#ef5350', Pink: '#f06292', Blue: '#64b5f6', Green: '#66bb6a', White: '#eceff1', Black: '#cfd8dc', Grey: '#bdbdbd', Gray: '#bdbdbd', Brown: '#bcaaa4', Lime: '#dce775', Yellow: '#ffd54f', Cyan: '#4dd0e1', Purple: '#ba68c8', 'Light Blue': '#4fc3f7', 'Light blue': '#4fc3f7', Magenta: '#f48fb1', 'Light gray': '#e0e0e0', 'Light grey': '#e0e0e0', Orange: '#ffa726', Birch: '#d7b98c', Warped: '#9575cd', Accacia: '#aed581', Cherry: '#e57373', Oak: '#a1887f', Mangrove: '#81c784', Jungle: '#81c784' };
    const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark';
    function getColorForLine(line) {
      const dark = isDark();
      if (dark && line?.hexDarkMode) return String(line.hexDarkMode);
      if (!dark && line?.hexLightMode) return String(line.hexLightMode);
      const lineColor = line?.color;
      if (!lineColor) return dark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)';
      const m = dark ? colorMapDark : colorMapLight;
      return m[lineColor] || (dark ? '#bdbdbd' : '#555');
    }
    function getScale() {
      const v = getComputedStyle(mapEl).getPropertyValue('--map-scale');
      const s = parseFloat(v.trim());
      return Number.isFinite(s) && s > 0 ? s : 1;
    }
    let allowedTypes = new Set(['IC','REGIO','METRO','ON_DEMAND']);
    function typeKeyFor(lineId, line) { const cat = String(line?.category || '').toUpperCase(); if (cat.includes('METRO')) return 'METRO'; if (cat.includes('IC')) return 'IC'; if (lineId.startsWith('NŻ') || cat.includes('ON')) return 'ON_DEMAND'; return 'REGIO'; }
    function pairKey(a,b){ return a < b ? `${a}|${b}` : `${b}|${a}`; }
    function dirKey(a,b){ return `${a}>${b}`; }
    function getPtsForDirection(line, a, b){ if (line && line.shapesDir){ const dk = dirKey(a,b); if (Array.isArray(line.shapesDir[dk])) return line.shapesDir[dk].slice(); const rd = dirKey(b,a); if (Array.isArray(line.shapesDir[rd])) return line.shapesDir[rd].slice().reverse(); } const key = pairKey(a,b); const arr = Array.isArray(line?.shapes?.[key]) ? line.shapes[key] : []; return a < b ? arr.slice() : arr.slice().reverse(); }
    let lastScale = null;
    function drawLines() {
      const baseW = mapEl.clientWidth; const baseH = mapEl.clientHeight; const scale = getScale(); const dpr = Math.max(1, window.devicePixelRatio || 1);
      canvas.style.width = baseW + 'px'; canvas.style.height = baseH + 'px';
      canvas.width = Math.max(1, Math.round(baseW * dpr * scale)); canvas.height = Math.max(1, Math.round(baseH * dpr * scale));
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.clearRect(0, 0, baseW, baseH);
      Object.entries(lines).forEach(([id, line]) => {
        const t = typeKeyFor(id, line); if (!allowedTypes.has(t)) return; const seq = Array.isArray(line?.stations) ? line.stations : []; if (!seq.length) return;
        ctx.lineWidth = 2 / scale; ctx.strokeStyle = getColorForLine(line); ctx.globalAlpha = 0.25; ctx.beginPath(); let started = false; let prev = null;
        for (const sid of seq) { const st = stations[sid]; if (!st || !Array.isArray(st.coordinates)) { started = false; prev = null; continue; } const [t, l] = st.coordinates.map(Number); const x = (l / 100) * baseW; const y = (t / 100) * baseH; if (!started) { ctx.moveTo(x, y); started = true; prev = sid; } else { const pts = getPtsForDirection(line, prev, sid); for (const p of pts) { const px = (p[1] / 100) * baseW; const py = (p[0] / 100) * baseH; ctx.lineTo(px, py); } ctx.lineTo(x, y); prev = sid; } }
        ctx.stroke();
      });
      ctx.globalAlpha = 0.95;
      highlightedSegments.forEach(seg => { const line = lines[seg.lineId]; if (!line) return; ctx.lineWidth = 4 / scale; ctx.strokeStyle = getColorForLine(line); ctx.beginPath(); let started = false; let prev = null; for (const sid of seg.stations) { const st = stations[sid]; if (!st || !Array.isArray(st.coordinates)) { started = false; prev = null; continue; } const [t, l] = st.coordinates.map(Number); const x = (l / 100) * baseW; const y = (t / 100) * baseH; if (!started) { ctx.moveTo(x, y); started = true; prev = sid; } else { const pts = getPtsForDirection(line, prev, sid); for (const p of pts) { const px = (p[1] / 100) * baseW; const py = (p[0] / 100) * baseH; ctx.lineTo(px, py); } ctx.lineTo(x, y); prev = sid; } } ctx.stroke(); });
      ctx.globalAlpha = 1; lastScale = scale;
    }
  drawLines();
  window.addEventListener('resize', drawLines);
  // Redraw lines when the map element size changes (e.g., during export capture)
  const roLines = new ResizeObserver(() => drawLines());
  roLines.observe(mapEl);
    const mo = new MutationObserver(() => { const s = getScale(); if (s !== lastScale) drawLines(); });
    mo.observe(mapEl, { attributes: true, attributeFilter: ['style'] });
    const moTheme = new MutationObserver(drawLines); moTheme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener('route:highlight', (ev) => { const legs = ev && ev.detail && Array.isArray(ev.detail.legs) ? ev.detail.legs : []; highlightedSegments = legs.map(l => ({ lineId: String(l.lineId), stations: Array.isArray(l.stations) ? l.stations : [] })); drawLines(); });
    window.addEventListener('lines:visibility', (ev) => { const arr = ev?.detail?.allowed; if (Array.isArray(arr) && arr.length) { allowedTypes = new Set(arr); drawLines(); } });
  const stationContainer = document.createElement('div');
  stationContainer.className = 'stations-layer';
  mapEl.appendChild(stationContainer);
  Object.entries(stations).forEach(([id, st]) => {
      if (!st || !Array.isArray(st.coordinates)) return; const [top, left] = st.coordinates; const el = document.createElement('div'); const t = st.type; const isHub = t === 'hub'; const extra = [isHub ? 'hub' : null, t ? `type-${t}` : null].filter(Boolean).join(' ');
  el.className = 'station-marker' + (extra ? ' ' + extra : ''); el.dataset.stationId = id; el.style.top = `${top}%`; el.style.left = `${left}%`; el.title = `${st.name || id}`;
      const lab = document.createElement('div'); lab.className = 'station-label'; lab.textContent = st.name || id; el.appendChild(lab); mapEl.appendChild(el);
    });
  // Move created station markers into stations-layer container
  mapEl.querySelectorAll('.station-marker').forEach(el => stationContainer.appendChild(el));

    // Localities layer: simple circular markers with labels; hidden by default until toggled on
    let locLayer = document.getElementById('localities-layer');
    if (!locLayer) {
      locLayer = document.createElement('div');
      locLayer.id = 'localities-layer';
      locLayer.className = 'localities-layer';
      // append as last child; stacking controlled via z-index in CSS
      mapEl.appendChild(locLayer);
    }
    function renderLocalities() {
      locLayer.innerHTML = '';
      for (const loc of Array.isArray(localities) ? localities : []) {
        const x = Number(loc.x); const y = Number(loc.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        const el = document.createElement('div');
        const type = String(loc.type || '').toLowerCase();
        const typeCls = type ? ` type-${type}` : '';
        el.className = 'locality-marker' + typeCls;
  // store normalized name for lookup
  el.dataset.localityName = String(loc.name || '').trim().toLowerCase();
        el.style.left = `${x}%`;
        el.style.top = `${y}%`;
        el.title = String(loc.name || '');
        const lab = document.createElement('div');
        lab.className = 'locality-label';
  lab.textContent = String(loc.name || '').trim();
        el.appendChild(lab);
        locLayer.appendChild(el);
      }
    }
    renderLocalities();

  // Label collision avoidance
    function computeLabelRects(marker) {
      const lab = marker.querySelector('.station-label');
      if (!lab) return null;
  // Candidate positions: top (default), right, left, bottom
      const rectMarker = marker.getBoundingClientRect();
  // Reset position classes
      lab.classList.remove('label-pos-top','label-pos-right','label-pos-left','label-pos-bottom','label-hidden');
      const positions = [
        { cls: 'label-pos-top' },
        { cls: 'label-pos-right' },
        { cls: 'label-pos-left' },
        { cls: 'label-pos-bottom' }
      ];
      return { lab, rectMarker, positions };
    }

    function layoutLabelsAvoidingOverlap() {
      const markers = Array.from(mapEl.querySelectorAll('.station-marker.view-only'));
      const used = [];
  // Fast AABB collision test
      const isColliding = (a,b) => !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
      for (const m of markers) {
        const data = computeLabelRects(m);
        if (!data) continue;
        const { lab, positions } = data;
        let placed = false;
        for (const p of positions) {
          // apply class and measure
          lab.classList.remove('label-pos-top','label-pos-right','label-pos-left','label-pos-bottom','label-hidden');
          lab.classList.add(p.cls);
          const r = lab.getBoundingClientRect();
          // discard if outside the map container
          const mapR = mapEl.getBoundingClientRect();
          if (r.left < mapR.left || r.right > mapR.right || r.top < mapR.top || r.bottom > mapR.bottom) {
            continue;
          }
          // check against already placed labels
          let ok = true;
          for (const u of used) { if (isColliding(r, u)) { ok = false; break; } }
          if (ok) {
            used.push(r);
            placed = true;
            break;
          }
        }
        if (!placed) {
          // if cannot place without overlap, hide
          lab.classList.add('label-hidden');
        }
      }
    }

  // Run after initial render and on resize/zoom/theme changes
  function relayoutSoon() { requestAnimationFrame(() => { layoutLabelsAvoidingOverlap(); /* localities have simpler labels, no collision mgmt for now */ }); }
    relayoutSoon();
    window.addEventListener('resize', relayoutSoon);
  const ro = new ResizeObserver(relayoutSoon);
  ro.observe(mapEl);
    const mo2 = new MutationObserver(relayoutSoon);
    mo2.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    // Toggle visibility of localities layer
    let localitiesVisible = false;
    function applyLocalitiesVisibility(v){ localitiesVisible = !!v; locLayer.style.display = localitiesVisible ? '' : 'none'; }
    // Toggle visibility of network (stations + lines)
    let networkVisible = true;
    function applyNetworkVisibility(v){
      networkVisible = !!v;
      canvas.style.display = networkVisible ? '' : 'none';
      stationContainer.style.display = networkVisible ? '' : 'none';
    }
    // Initialize visibility using URL/localStorage to avoid race with events
    (function initVisibility(){
      function parseURLLayers(){
        try {
          const url = new URL(window.location.href);
          const raw = url.searchParams.get('layers');
          if (!raw) return null;
          const set = new Set((raw||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean));
          return {
            localities: set.has('loc') || set.has('localities'),
            network: set.has('net') || set.has('network')
          };
        } catch { return null; }
      }
      // Defaults: network ON, localities OFF
      let st = { localities: false, network: true };
      const fromUrl = parseURLLayers();
      if (fromUrl) st = Object.assign(st, fromUrl);
      else {
        try {
          const raw = localStorage.getItem('ztk-map-layers');
          if (raw) {
            const obj = JSON.parse(raw);
            st = { localities: !!obj.localities, network: obj.network !== false };
          }
        } catch {}
      }
      applyLocalitiesVisibility(!!st.localities);
      applyNetworkVisibility(!!st.network);
    })();
    // Also react to future changes via events
    window.addEventListener('localities:visibility', (ev) => { applyLocalitiesVisibility(!!ev?.detail?.visible); });
  window.addEventListener('network:visibility', (ev) => { applyNetworkVisibility(!!ev?.detail?.visible); });
  // Localities use % positioning; no resize handler needed
  } catch (e) {
    console.error('Nie udało się wczytać stations.json/lines.json', e);
    const alert = document.getElementById('data-error');
    if (alert) {
      alert.textContent = 'Nie udało się wczytać danych mapy (stations/lines). Odśwież stronę lub sprawdź połączenie.';
      alert.classList.remove('hidden');
    }
  }
})();
