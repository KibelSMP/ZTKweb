// Logika strony eksportu: spina UI i podgląd
(function(){
  const form = document.getElementById('export-form');
  const titleEl = document.getElementById('print-title');
  const legendEl = document.getElementById('legend');
  const mapEl = document.getElementById('map');
  const viewportEl = document.querySelector('.preview-viewport');
  const pageInner = document.querySelector('.page-inner');
  const btnRefresh = document.getElementById('refresh');
  const btnPdf = document.getElementById('pdf');
  const btnPrint = null;

  if (!form || !titleEl || !legendEl || !mapEl || !viewportEl || !pageInner) return;
  // Debounce helper
  let resizeT = 0;
  function debouncedSize(rearmMs = 60){
    clearTimeout(resizeT);
    resizeT = setTimeout(sizeSquareViewport, rearmMs);
  }

  // Obserwuj legendę i reaguj na zmiany jej zawartości, aby przeliczyć miejsce dla mapy
  const moLegend = new MutationObserver(() => debouncedSize(50));
  moLegend.observe(legendEl, { childList: true, subtree: true, characterData: true });

  // Czekaj, aż layout się ustabilizuje (2x rAF + krótki timeout)
  function waitForIdle(ms = 120){
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, ms)));
    });
  }

  // Wymuś jasny motyw wewnątrz podglądu
  pageInner.setAttribute('data-forced-theme', 'light');
  pageInner.classList.add('force-light');

  function sizeSquareViewport(){
    // zmierz dostępne miejsce w .page-inner: to siatka (tytuł, viewport, legenda, stopka)
    // Ustaw aspect-ratio = 1, ale dodatkowo wymuś maksymalny kwadrat który zmieści się w szerokości i wysokości kolumny
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
    // dostępna wysokość na viewport
    const availH = Math.max(0, totalH - titleH - legendH - footerH - gaps);
    const availW = Math.max(0, totalW);
  const side = Math.max(0, Math.min(availW, availH));
  viewportEl.style.height = side + 'px';
  viewportEl.style.width = side + 'px';
  }

  function applyOptions(){
    const fd = new FormData(form);
    const title = String(fd.get('title') || '').trim();
    const sat = fd.get('sat') === 'on';
    const showLegend = fd.get('legend') === 'on';
    const legendScale = parseFloat(fd.get('legendScale') || '0.8') || 0.8;

    titleEl.textContent = title || '';

    // sat
    mapEl.classList.toggle('satellite-active', !!sat);

  // legend visibility and scale (layout-aware)
  legendEl.style.display = showLegend ? '' : 'none';
  // Zamiast transform (nie wpływa na layout), skalujemy typografię i spacing
  const baseSize = 14; // px
  const baseLine = 1.2;
  const sizePx = Math.max(10, Math.round(baseSize * legendScale));
  legendEl.style.fontSize = sizePx + 'px';
  legendEl.style.lineHeight = baseLine;

    // po zmianach ustaw rozmiar kwadratu
    sizeSquareViewport();
  }

  function gatherTypes(){
    const fd = new FormData(form);
    const types = fd.getAll('types').map(String);
    if (!types.length) return ['IC','REGIO','METRO','ON_DEMAND'];
    return types;
  }

  // Nasze renderery nasłuchują na window na zdarzenie 'lines:visibility'
  function broadcastTypes(){
    const allowed = gatherTypes();
    window.dispatchEvent(new CustomEvent('lines:visibility', { detail: { allowed } }));
  }

  // Inicjalne ustawienia + fit całości mapy po załadowaniu danych markerów
  function fitWholeMapWhenReady(){
    // Po krótkim opóźnieniu zakładamy, że stacje są już dodane, dopasuj do 0..100%
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('fit-to-bounds', { detail: { minTop: 0, minLeft: 0, maxTop: 100, maxLeft: 100 } }));
    }, 150);
  }

  function refresh(){ applyOptions(); broadcastTypes(); }

  btnRefresh?.addEventListener('click', refresh);
  btnPdf?.addEventListener('click', async () => {
    // Upewnij się, że podgląd jest aktualny i policzony
    refresh();
    await waitForIdle(140); // poczekaj na wyrenderowanie legendy i przeliczenie rozmiaru
    const src = document.querySelector('.page-inner');
    if (!src) return;
    if (typeof html2pdf === 'undefined') {
      // spróbuj doładować z cdnjs jako fallback
      await new Promise((resolve) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
        s.onload = resolve;
        s.onerror = resolve;
        document.head.appendChild(s);
      });
    }
  if (typeof html2pdf === 'undefined') return;
    const opt = {
      margin:       [0, 0, 0, 0],
      filename:     `ztk-eksport-${new Date().toISOString().slice(0,10)}.pdf`,
      image:        { type: 'jpeg', quality: 0.95 },
      html2canvas:  { scale: 2, backgroundColor: '#ffffff', useCORS: true },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak:    { mode: ['avoid-all'] }
    };
    if (html2pdf.__isStub) {
      alert('PDF zostanie wydrukowany przez przeglądarkę (wersja offline biblioteki).');
    }
  html2pdf().set(opt).from(src).save();
  });
  form.addEventListener('input', refresh);
  window.addEventListener('resize', debouncedSize);

  // Przed drukiem zastosuj ustawienia druku i przelicz rozmiar mapy
  function beforePrint(){
    pageInner.classList.add('print-mode');
    // daj CSS czas na zastosowanie reguł, potem przelicz
  setTimeout(() => { sizeSquareViewport(); }, 0);
  }
  function afterPrint(){ pageInner.classList.remove('print-mode'); setTimeout(sizeSquareViewport, 0); }
  // tryb druku nieużywany – eksport przez PDF

  // Inicjalizacja
  refresh();
  fitWholeMapWhenReady();
  // Po wyrenderowaniu legendy (asynchronicznie) jeszcze raz dopasuj rozmiar
  setTimeout(sizeSquareViewport, 200);
})();
