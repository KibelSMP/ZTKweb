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
  // Snap translations to device pixel grid to avoid blur on subpixels
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const snappedTx = Math.round(tx * dpr) / dpr;
    const snappedTy = Math.round(ty * dpr) / dpr;
  // translate3d promotes a layer and improves sampling while scaling
    map.style.transform = `translate3d(${snappedTx}px, ${snappedTy}px, 0) scale(${scale})`;
    map.style.setProperty('--map-scale', String(scale));
  // convenience for CSS: label threshold at 2x
    map.setAttribute('data-zoom-level', scale >= 2 ? 'gte2' : 'lt2');
  }

  function zoomAt(factor, cx, cy) {
  const newScale = Math.max(minScale, Math.min(maxScale, scale * factor));
  if (newScale === scale) return;
  // Compute cursor position relative to map (before scale change)
  const mapX = (cx - tx) / scale;
  const mapY = (cy - ty) / scale;
  scale = newScale;
  // After scaling, adjust translation so the point under cursor stays under cursor
  tx = cx - mapX * scale;
  ty = cy - mapY * scale;
  applyTransform();
  }

  function centerOn(percentTop, percentLeft, opts = {}) {
  // percent -> px within viewport (map fills the viewport)
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const xTarget = (percentLeft / 100) * vw;
    const yTarget = (percentTop / 100) * vh;
  // optional target zoom
    const targetScale = Math.max(minScale, Math.min(maxScale, opts.scale ?? Math.max(2, scale)));
  // set absolutely: point (xTarget, yTarget) in map space should land at viewport center
    scale = targetScale;
    const cx = vw / 2;
    const cy = vh / 2;
    tx = cx - targetScale * xTarget;
    ty = cy - targetScale * yTarget;
    applyTransform();
  }

  function fitBounds(bounds) {
  // bounds: { minTop, minLeft, maxTop, maxLeft } in map percentages
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
  // reset previous translations to avoid accumulation
    tx = 0; ty = 0;
    centerOn(cyPct, cxPct, { scale: targetScale });
  }

  // Wheel zoom
  viewport.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey) {
      const factor = e.deltaY < 0 ? 1.1 : 1/1.1;
      const rect = viewport.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      zoomAt(factor, x, y);
      e.preventDefault();
    }
  }, { passive: false });

  // Drag to pan (mouse)
  let dragging = false;
  let lx = 0, ly = 0;
  viewport.addEventListener('mousedown', (e) => {
  if ((e.target).classList && (e.target).classList.contains('station-marker')) return; // don't grab markers
    dragging = true; lx = e.clientX; ly = e.clientY; e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    tx += e.clientX - lx; ty += e.clientY - ly; lx = e.clientX; ly = e.clientY;
    applyTransform();
  });
  window.addEventListener('mouseup', () => dragging = false);

  // Touch events for mobile: pan and pinch-zoom
  let touchDragging = false;
  let lastTouchX = 0, lastTouchY = 0;
  let pinchZooming = false;
  let lastDist = 0;
  let pinchCenter = { x: 0, y: 0 };

  viewport.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
  // Pan start
      touchDragging = true;
      lastTouchX = e.touches[0].clientX;
      lastTouchY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
  // Pinch start
      pinchZooming = true;
      lastDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      pinchCenter = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2 - viewport.getBoundingClientRect().left,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2 - viewport.getBoundingClientRect().top
      };
    }
  }, { passive: false });

  viewport.addEventListener('touchmove', (e) => {
    if (touchDragging && e.touches.length === 1) {
      const dx = e.touches[0].clientX - lastTouchX;
      const dy = e.touches[0].clientY - lastTouchY;
      tx += dx;
      ty += dy;
      lastTouchX = e.touches[0].clientX;
      lastTouchY = e.touches[0].clientY;
      applyTransform();
      e.preventDefault();
    } else if (pinchZooming && e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = dist / lastDist;
      zoomAt(factor, pinchCenter.x, pinchCenter.y);
      lastDist = dist;
  // update pinchCenter continuously
      pinchCenter = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2 - viewport.getBoundingClientRect().left,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2 - viewport.getBoundingClientRect().top
      };
      e.preventDefault();
    }
  }, { passive: false });

  viewport.addEventListener('touchend', (e) => {
    if (e.touches.length === 0) {
      touchDragging = false;
      pinchZooming = false;
    } else if (e.touches.length === 1) {
      pinchZooming = false;
  // continue drag if one finger remains
      lastTouchX = e.touches[0].clientX;
      lastTouchY = e.touches[0].clientY;
      touchDragging = true;
    }
  });

  // Buttons
  const btnIn = document.getElementById('zoom-in');
  const btnOut = document.getElementById('zoom-out');
  const btnReset = document.getElementById('zoom-reset');
  if (btnIn) btnIn.addEventListener('click', () => zoomAt(1.2, viewport.clientWidth/2, viewport.clientHeight/2));
  if (btnOut) btnOut.addEventListener('click', () => zoomAt(1/1.2, viewport.clientWidth/2, viewport.clientHeight/2));
  if (btnReset) btnReset.addEventListener('click', () => { scale = 1; tx = 0; ty = 0; applyTransform(); });

  applyTransform();

  // API via event: center-on-station with detail: { top:number, left:number, scale?:number }
  window.addEventListener('center-on-station', (e) => {
    const d = e && e.detail || {};
    const top = Number(d.top);
    const left = Number(d.left);
    const sc = d.scale;
    if (Number.isFinite(top) && Number.isFinite(left)) {
      centerOn(top, left, { scale: sc });
    }
  });

  // API: fit to route/area – event fit-to-bounds with detail: { minTop, minLeft, maxTop, maxLeft }
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
