// Export page logic: ties UI and preview together
(function(){
  const form = document.getElementById('export-form');
  const titleEl = document.getElementById('print-title');
  const legendEl = document.getElementById('legend');
  const mapEl = document.getElementById('map');
  const viewportEl = document.querySelector('.preview-viewport');
  const pageInner = document.querySelector('.page-inner');
  const btnPdf = document.getElementById('pdf');
  const btnPrint = null;

  if (!form || !titleEl || !legendEl || !mapEl || !viewportEl || !pageInner) return;
  // Debounce helper
  let resizeT = 0;
  function debouncedSize(rearmMs = 60){
    clearTimeout(resizeT);
    resizeT = setTimeout(sizeSquareViewport, rearmMs);
  }

  // Observe legend and react to its content changes to recompute map area
  const moLegend = new MutationObserver(() => debouncedSize(50));
  moLegend.observe(legendEl, { childList: true, subtree: true, characterData: true });

  // Wait for layout to settle (2x rAF + short timeout)
  function waitForIdle(ms = 120){
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, ms)));
    });
  }

  // Force light theme inside the preview (local CSS vars override)
  pageInner.classList.add('force-light');

  function sizeSquareViewport(){
  // measure available space in .page-inner: it's a grid (title, viewport, legend, footer)
  // Set aspect-ratio = 1, and enforce the largest square that fits both width and height of the column
    const cs = getComputedStyle(pageInner);
    const padV = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const padH = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const totalH = pageInner.clientHeight - padV;
    const totalW = pageInner.clientWidth - padH;
    const titleH = titleEl.offsetHeight;
    const legendH = legendEl.offsetHeight;
    const footerEl = document.getElementById('print-footer');
    const footerH = footerEl ? footerEl.offsetHeight : 0;
    const gaps = 3 *  (parseFloat(getComputedStyle(pageInner).rowGap) || 0);
  // available height for viewport
    const availH = Math.max(0, totalH - titleH - legendH - footerH - gaps);
    const availW = Math.max(0, totalW);
  // subtract a small tolerance to avoid rounding overflow that may trigger a second page
  // Reserve a few extra pixels to be safe against rounding and print scaling
  const safety = 4;
  const side = Math.max(0, Math.min(availW, availH) - safety);
  viewportEl.style.height = side + 'px';
  viewportEl.style.width = side + 'px';
  }

  // Ensure the entire page content fits within one page by shrinking legend text if needed
  async function autoFit(maxSteps = 10) {
    for (let i = 0; i < maxSteps; i++) {
      // Recompute viewport size based on current legend height
      sizeSquareViewport();
      await waitForIdle(50);
      const pageH = pageInner.clientHeight;
      const contentH = pageInner.scrollHeight;
      if (contentH <= pageH) break; // fits
  // Shrink legend font-size by 5%
      const cs = getComputedStyle(legendEl);
      const curPx = parseFloat(cs.fontSize) || 14;
  const nextPx = Math.max(1, Math.round(curPx * 0.95));
      if (nextPx >= curPx) break; // can't shrink further
      legendEl.style.fontSize = nextPx + 'px';
    }
    // Final pass to snap viewport after any size change
    sizeSquareViewport();
  }

  function applyOptions(){
    const fd = new FormData(form);
    const title = String(fd.get('title') || '').trim();
    const sat = fd.get('sat') === 'on';
  const pol = fd.get('pol') === 'on';
    const showLegend = fd.get('legend') === 'on';
    const legendScale = parseFloat(fd.get('legendScale') || '0.8') || 0.8;
  const labelScale = parseFloat(fd.get('labelScale') || '1') || 1;

    titleEl.textContent = title || '';

    // sat
    mapEl.classList.toggle('satellite-active', !!sat);
  // political overlay
  mapEl.classList.toggle('political-active', !!pol);
  const polOpacity = pol ? (sat ? 0.7 : 1) : 0;
  mapEl.style.setProperty('--political-overlay-opacity', String(polOpacity));

  // legend visibility and scale (layout-aware)
  legendEl.style.display = showLegend ? '' : 'none';
  // Instead of transform (which doesn't affect layout), scale typography and spacing
  const baseSize = 14; // px
  const baseLine = 1.2;
  const sizePx = Math.max(1, Math.round(baseSize * legendScale));
  legendEl.style.fontSize = sizePx + 'px';
  legendEl.style.lineHeight = baseLine;

  // station label scale: adjust font-size and vertical offset via CSS variables
  mapEl.style.setProperty('--station-label-scale', String(labelScale));
  // Apply font-size scaling for labels (base ~ 11px in app.css)
  const baseLabelPx = 11;
  const labelPx = Math.max(6, Math.round(baseLabelPx * labelScale));
  mapEl.style.setProperty('--station-label-font-size', labelPx + 'px');
  // Adjust default offset above marker proportionally (was translateY(-120%))
  const baseOffset = 120; // percent of label height
  const newOffset = Math.round(baseOffset * Math.max(0.5, labelScale));
  mapEl.style.setProperty('--station-label-offset', `${newOffset}%`);

  // after changes, set square size
    sizeSquareViewport();
  }

  function gatherTypes(){
    const fd = new FormData(form);
    const types = fd.getAll('types').map(String);
    if (!types.length) return ['IC','REGIO','METRO','ON_DEMAND'];
    return types;
  }

  // Our renderers listen on window for 'lines:visibility'
  function broadcastTypes(){
    const allowed = gatherTypes();
    window.dispatchEvent(new CustomEvent('lines:visibility', { detail: { allowed } }));
  }

  // Initial settings + fit entire map after markers are loaded
  function fitWholeMapWhenReady(){
  // After a short delay we assume stations are added; fit to 0..100%
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('fit-to-bounds', { detail: { minTop: 0, minLeft: 0, maxTop: 100, maxLeft: 100 } }));
    }, 150);
  }

  function refresh(){ applyOptions(); broadcastTypes(); }
  btnPdf?.addEventListener('click', async () => {
  // Ensure the preview is up-to-date and sized
  refresh();
  await waitForIdle(140); // poczekaj na wyrenderowanie legendy i przeliczenie rozmiaru
  await autoFit(); // dopasuj legendę i mapę, aby zmieściły się na jednej stronie
    const src = document.querySelector('.page-inner');
    if (!src) return;
  // html2pdf is bundled locally (assets/vendor/html2pdf.bundle.min.js) and loaded via export.html
  // Force one more layout pass to ensure canvas and labels align to final size
  window.dispatchEvent(new Event('resize'));
  await waitForIdle(50);

  // Align element to viewport start to avoid partial offscreen capture artifacts
  const prevScrollX = window.scrollX; const prevScrollY = window.scrollY;
  try { window.scrollTo(0, 0); } catch {}
  await waitForIdle(30);

  const rect = src.getBoundingClientRect();
  const capW = Math.round(rect.width);
  const capH = Math.round(rect.height);
    const opt = {
      margin:       [0, 0, 0, 0],
      filename:     `ztk-eksport-${new Date().toISOString().slice(0,10)}.pdf`,
  image:        { type: 'jpeg', quality: 0.95 },
  // Neutralize window scroll to prevent vertical shift in capture
  html2canvas:  { scale: 2, backgroundColor: '#ffffff', useCORS: true, scrollY: -window.scrollY, scrollX: -window.scrollX },
  // Use standard A4; our layout safety margins keep it to one page
  jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
  // Disable page breaking to avoid second blank page
  pagebreak:    { mode: [] }
    };
  // using local vendor bundle only
  await html2pdf().set(opt).from(src).save();
  // Restore previous scroll position
  try { window.scrollTo(prevScrollX, prevScrollY); } catch {}
  });
  form.addEventListener('input', refresh);
  window.addEventListener('resize', debouncedSize);

  // Before printing, apply print settings and recompute map size
  function beforePrint(){
    pageInner.classList.add('print-mode');
  // give CSS time to apply rules, then recompute
  setTimeout(() => { sizeSquareViewport(); }, 0);
  }
  function afterPrint(){ pageInner.classList.remove('print-mode'); setTimeout(sizeSquareViewport, 0); }
  // print mode not used – export via PDF

  // Initialization
  refresh();
  fitWholeMapWhenReady();
  // After legend renders (async) adjust size again
  setTimeout(sizeSquareViewport, 200);
})();
