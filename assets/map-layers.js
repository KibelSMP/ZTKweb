// Map layers controller: satellite and political (can be active simultaneously)
(function(){
  const map = document.getElementById('map');
  const menu = document.getElementById('map-layers-menu');
  if (!map || !menu) return;

  const KEY = 'ztk-map-layers'; // JSON: { satellite:boolean, political:boolean }
   const URL_KEY = 'layers'; // CSV: sat,pol

   function parseURLLayers() {
     try {
       const url = new URL(window.location.href);
       const raw = url.searchParams.get(URL_KEY);
       if (!raw) return null;
       const set = new Set((raw || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
       return {
         satellite: set.has('sat') || set.has('satellite'),
         political: set.has('pol') || set.has('political')
       };
     } catch {
       return null;
     }
   }
   function writeURLLayers(st) {
     try {
       const url = new URL(window.location.href);
       const parts = [];
       if (st.satellite) parts.push('sat');
       if (st.political) parts.push('pol');
       if (parts.length) url.searchParams.set(URL_KEY, parts.join(','));
       else url.searchParams.delete(URL_KEY);
       window.history.replaceState({}, '', url.toString());
     } catch {}
   }

  function getState(){
  // Prefer URL if present
    const fromUrl = parseURLLayers();
    if (fromUrl) return fromUrl;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const obj = JSON.parse(raw);
        return { satellite: !!obj.satellite, political: !!obj.political };
      }
    } catch {}
  // Backward compatibility with previous satellite key
    let sat = false;
    try { const old = localStorage.getItem('ztk-satellite'); sat = (old === '1' || old === 'true'); } catch {}
    return { satellite: sat, political: false };
  }
  function saveState(st){ try { localStorage.setItem(KEY, JSON.stringify({ satellite: !!st.satellite, political: !!st.political })); } catch {} }

  function apply(st){
  // Satellite as #map background
    map.classList.toggle('satellite-active', !!st.satellite);
  // Political as overlay (class on #map controls ::after in CSS)
    map.classList.toggle('political-active', !!st.political);
  // Set custom CSS variable controlling political overlay opacity
    const opacity = st.political ? (st.satellite ? 0.7 : 1) : 0;
    map.style.setProperty('--political-overlay-opacity', String(opacity));
  }

  // Initialize form and map
  const st = getState();
  apply(st);
    writeURLLayers(st);
  const cbSat = menu.querySelector('input[name="map-layer-satellite"]');
  const cbPol = menu.querySelector('input[name="map-layer-political"]');
  if (cbSat) cbSat.checked = !!st.satellite;
  if (cbPol) cbPol.checked = !!st.political;

  // Changes
  menu.addEventListener('change', () => {
    const next = {
      satellite: !!(cbSat && cbSat.checked),
      political: !!(cbPol && cbPol.checked)
    };
    apply(next);
    saveState(next);
  writeURLLayers(next);
  });
})();
