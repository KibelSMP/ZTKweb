// Map layers controller: satellite and political (can be active simultaneously)
(function(){
  const map = document.getElementById('map');
  const menu = document.getElementById('map-layers-menu');
  if (!map || !menu) return;

  const KEY = 'ztk-map-layers'; // JSON: { satellite:boolean, political:boolean, localities:boolean, network:boolean }
   const URL_KEY = 'layers'; // CSV: sat,pol,loc,net

   function parseURLLayers() {
     try {
       const url = new URL(window.location.href);
       const raw = url.searchParams.get(URL_KEY);
       if (!raw) return null;
       const set = new Set((raw || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
       return {
         satellite: set.has('sat') || set.has('satellite'),
         political: set.has('pol') || set.has('political'),
         localities: set.has('loc') || set.has('localities'),
         network: set.has('net') || set.has('network')
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
       if (st.localities) parts.push('loc');
  if (st.network) parts.push('net');
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
  return { satellite: !!obj.satellite, political: !!obj.political, localities: !!obj.localities, network: obj.network !== false };
      }
    } catch {}
  // Backward compatibility with previous satellite key
    let sat = false;
    try { const old = localStorage.getItem('ztk-satellite'); sat = (old === '1' || old === 'true'); } catch {}
    return { satellite: sat, political: false, localities: false, network: true };
  }
  function saveState(st){ try { localStorage.setItem(KEY, JSON.stringify({ satellite: !!st.satellite, political: !!st.political, localities: !!st.localities, network: !!st.network })); } catch {} }

  function apply(st){
  // Satellite as #map background
    map.classList.toggle('satellite-active', !!st.satellite);
  // Political as overlay (class on #map controls ::after in CSS)
    map.classList.toggle('political-active', !!st.political);
  // Set custom CSS variable controlling political overlay opacity
    const opacity = st.political ? (st.satellite ? 0.7 : 1) : 0;
    map.style.setProperty('--political-overlay-opacity', String(opacity));
    // Broadcast localities visibility to renderers
    window.dispatchEvent(new CustomEvent('localities:visibility', { detail: { visible: !!st.localities } }));
  // Broadcast network (stations+lines)
  window.dispatchEvent(new CustomEvent('network:visibility', { detail: { visible: !!st.network } }));
  }

  // Initialize form and map
  const st = getState();
  apply(st);
    writeURLLayers(st);
  const cbSat = menu.querySelector('input[name="map-layer-satellite"]');
  const cbPol = menu.querySelector('input[name="map-layer-political"]');
  const cbLoc = menu.querySelector('input[name="map-layer-localities"]');
  const cbNet = menu.querySelector('input[name="map-layer-network"]');
  if (cbSat) cbSat.checked = !!st.satellite;
  if (cbPol) cbPol.checked = !!st.political;
  if (cbLoc) cbLoc.checked = !!st.localities;
  if (cbNet) cbNet.checked = st.network !== false;

  // Changes
  menu.addEventListener('change', () => {
    const next = {
      satellite: !!(cbSat && cbSat.checked),
      political: !!(cbPol && cbPol.checked),
      localities: !!(cbLoc && cbLoc.checked),
      network: !!(cbNet ? cbNet.checked : true)
    };
    apply(next);
    saveState(next);
  writeURLLayers(next);
    // Update packed q if present and both endpoints are set
    try {
      const url = new URL(window.location.href);
      const q = url.searchParams.get('q');
      const f = url.searchParams.get('f') || url.searchParams.get('from');
      const t = url.searchParams.get('t') || url.searchParams.get('to');
      if (q || (f && t)) {
        window.dispatchEvent(new CustomEvent('layers:changed'));
      }
    } catch {}
  });

  // If other parts of the app force-enable network, reflect it in UI/state
  window.addEventListener('network:visibility', (ev) => {
    const visible = !!ev?.detail?.visible;
    if (!visible) return; // only auto-enable
    if (cbNet && !cbNet.checked) {
      cbNet.checked = true;
      const next = {
        satellite: !!(cbSat && cbSat.checked),
        political: !!(cbPol && cbPol.checked),
        localities: !!(cbLoc && cbLoc.checked),
        network: true
      };
      apply(next);
      saveState(next);
      writeURLLayers(next);
    }
  });

  // If other parts of the app force-enable localities, reflect it in UI/state
  window.addEventListener('localities:visibility', (ev) => {
    const visible = !!ev?.detail?.visible;
    if (!visible) return; // only auto-enable
    if (cbLoc && !cbLoc.checked) {
      cbLoc.checked = true;
      const next = {
        satellite: !!(cbSat && cbSat.checked),
        political: !!(cbPol && cbPol.checked),
        localities: true,
        network: !!(cbNet ? cbNet.checked : true)
      };
      apply(next);
      saveState(next);
      writeURLLayers(next);
    }
  });
})();
