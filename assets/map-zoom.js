// renamed from zoom.js
(function () {
  const viewport = document.getElementById('map-viewport');
  const map = document.getElementById('map');
  if (!viewport || !map) return;

  let scale = 1;
  let tx = 0; // translate x (px)
  let ty = 0; // translate y (px)
  const minScale = 0.5;
  const maxScale = 8;

  function applyTransform() {
    // Zaokrąglij przesunięcia do siatki pikseli urządzenia, aby uniknąć rozmycia przy subpikselach
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const snappedTx = Math.round(tx * dpr) / dpr;
    const snappedTy = Math.round(ty * dpr) / dpr;
    // translate3d promuje warstwę i poprawia próbkowanie podczas skalowania
    map.style.transform = `translate3d(${snappedTx}px, ${snappedTy}px, 0) scale(${scale})`;
    map.style.setProperty('--map-scale', String(scale));
    // ułatwienie dla CSS: próg etykiet przy 2x
    map.setAttribute('data-zoom-level', scale >= 2 ? 'gte2' : 'lt2');
  }

  function zoomAt(factor, cx, cy) {
    const newScale = Math.max(minScale, Math.min(maxScale, scale * factor));
    if (newScale === scale) return;
    // przeskaluj względem punktu (cx, cy) w viewport
    const rect = map.getBoundingClientRect();
    const mx = cx - rect.left;
    const my = cy - rect.top;
    const k = newScale / scale;
    tx = cx - k * (cx - tx);
    ty = cy - k * (cy - ty);
    scale = newScale;
    applyTransform();
  }

  function centerOn(percentTop, percentLeft, opts = {}) {
    // promilowe -> px w ramach viewportu (map ma 100% szer/wys viewportu)
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const xTarget = (percentLeft / 100) * vw;
    const yTarget = (percentTop / 100) * vh;
    // opcjonalne docelowe powiększenie
    const targetScale = Math.max(minScale, Math.min(maxScale, opts.scale ?? Math.max(2, scale)));
    // ustaw absolutnie: punkt (xTarget, yTarget) w przestrzeni mapy ma trafić w środek viewportu
    scale = targetScale;
    const cx = vw / 2;
    const cy = vh / 2;
    tx = cx - targetScale * xTarget;
    ty = cy - targetScale * yTarget;
    applyTransform();
  }

  function fitBounds(bounds) {
    // bounds: { minTop, minLeft, maxTop, maxLeft } w % mapy
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const pad = 0.05; // 5% padding
    const minL = Math.min(bounds.minLeft, bounds.maxLeft);
    const maxL = Math.max(bounds.minLeft, bounds.maxLeft);
    const minT = Math.min(bounds.minTop, bounds.maxTop);
    const maxT = Math.max(bounds.minTop, bounds.maxTop);
    const wPct = Math.max(0.001, (maxL - minL) * (1 + pad*2));
    const hPct = Math.max(0.001, (maxT - minT) * (1 + pad*2));
    const scaleX = 100 / wPct;
    const scaleY = 100 / hPct;
    const targetScale = Math.max(minScale, Math.min(maxScale, Math.min(scaleX, scaleY)));
    const cxPct = (minL + maxL) / 2;
    const cyPct = (minT + maxT) / 2;
    // resetuj poprzednie przesunięcia, by uniknąć kumulacji
    tx = 0; ty = 0;
    centerOn(cyPct, cxPct, { scale: targetScale });
  }

  // Wheel zoom
  viewport.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey) {
      const factor = e.deltaY < 0 ? 1.1 : 1/1.1;
      zoomAt(factor, e.clientX, e.clientY);
      e.preventDefault();
    }
  }, { passive: false });

  // Drag to pan
  let dragging = false;
  let lx = 0, ly = 0;
  viewport.addEventListener('mousedown', (e) => {
    if ((e.target).classList && (e.target).classList.contains('station-marker')) return; // nie chwytaj markerów
    dragging = true; lx = e.clientX; ly = e.clientY; e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    tx += e.clientX - lx; ty += e.clientY - ly; lx = e.clientX; ly = e.clientY;
    applyTransform();
  });
  window.addEventListener('mouseup', () => dragging = false);

  // Buttons
  const btnIn = document.getElementById('zoom-in');
  const btnOut = document.getElementById('zoom-out');
  const btnReset = document.getElementById('zoom-reset');
  if (btnIn) btnIn.addEventListener('click', () => zoomAt(1.2, viewport.clientWidth/2, viewport.clientHeight/2));
  if (btnOut) btnOut.addEventListener('click', () => zoomAt(1/1.2, viewport.clientWidth/2, viewport.clientHeight/2));
  if (btnReset) btnReset.addEventListener('click', () => { scale = 1; tx = 0; ty = 0; applyTransform(); });

  applyTransform();

  // API przez event: center-on-station z detail: { top:number, left:number, scale?:number }
  window.addEventListener('center-on-station', (e) => {
    const d = e && e.detail || {};
    const top = Number(d.top);
    const left = Number(d.left);
    const sc = d.scale;
    if (Number.isFinite(top) && Number.isFinite(left)) {
      centerOn(top, left, { scale: sc });
    }
  });

  // API: dopasuj do trasy/obszaru – event fit-to-bounds z detail: { minTop, minLeft, maxTop, maxLeft }
  window.addEventListener('fit-to-bounds', (e) => {
    const b = e && e.detail || {};
    if ([b.minTop,b.minLeft,b.maxTop,b.maxLeft].every(v => Number.isFinite(Number(v)))) {
      fitBounds({
        minTop: Number(b.minTop), minLeft: Number(b.minLeft),
        maxTop: Number(b.maxTop), maxLeft: Number(b.maxLeft)
      });
    }
  });
})();
