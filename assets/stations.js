// Adnotator współrzędnych stacji na mapie.
// - Ładuje stations.json i lines.json, listę stacji oraz istniejące współrzędne.
// - Umożliwia wybór stacji, kliknięcie na mapie i przypisanie top/left w %.
// - Renderuje markery na mapie.
// - Umożliwia pobranie stations.json (stacje z współrzędnymi) i lines.json.

(function () {
  const mapEl = document.getElementById('map');
  const sel = document.getElementById('station-select');
  const search = document.getElementById('station-search');
  const status = document.getElementById('annotator-status');
  const btnClearOne = document.getElementById('btn-clear-one');
  const btnClearAll = document.getElementById('btn-clear-all');
  const btnDownloadStations = document.getElementById('btn-download-stations');
  const btnUploadBg = document.getElementById('btn-upload-bg');
  const btnClearBg = document.getElementById('btn-clear-bg');
  const inputBg = document.getElementById('bg-upload');
  const btnImport = document.getElementById('btn-import');
  const selType = document.getElementById('station-type');
  const btnAddStation = document.getElementById('btn-add-station');
  const btnDeleteStation = document.getElementById('btn-delete-station');
  const inputNewId = document.getElementById('new-station-id');
  const inputNewName = document.getElementById('new-station-name');

  /** @type {{stations: Record<string, {name?: string, voivodeship?: string, coordinates?: [number,number]|null, type?: string}>}} */
  let data = { stations: {} };

  /** @type {Record<string, [number, number]>} */
  let coords = {};

  function setStatus(msg) {
    if (status) status.textContent = msg;
  }

  async function loadInfo() {
    setStatus('Ładowanie stations.json/lines.json…');
  const stRes = await fetch('../assets/stations.json', { cache: 'no-store' });
  data.stations = await stRes.json();
    // zainicjalizuj coords z data.stations
    coords = {};
    Object.entries(data.stations || {}).forEach(([id, st]) => {
      if (st && Array.isArray(st.coordinates)) {
        coords[id] = [Number(st.coordinates[0]), Number(st.coordinates[1])];
      }
    });
    buildSelect();
  renderAll();
  setStatus('Gotowe. Wybierz stację i kliknij na mapie.');
  }

  function buildSelect() {
    const items = Object.entries(data.stations || {})
      .map(([id, st]) => ({ id, name: st.name || id }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pl'));
    sel.innerHTML = '';
    for (const it of items) {
      const opt = document.createElement('option');
      opt.value = it.id;
      opt.textContent = `${it.name} (${it.id})`;
      sel.appendChild(opt);
    }
    // ustaw typ dla pierwszej wybranej stacji
    updateTypeSelect(sel.value);
  }
  function updateTypeSelect(id){
    if (!selType) return;
    const t = data.stations[id]?.type || '';
    selType.value = t || '';
  }

  function ensureCanvas() {
    let canvas = mapEl.querySelector('canvas#conn');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'conn';
      canvas.style.position = 'absolute';
      canvas.style.top = '0';
      canvas.style.left = '0';
      canvas.style.pointerEvents = 'none';
      mapEl.appendChild(canvas);
    }
  const baseW = mapEl.clientWidth;
  const baseH = mapEl.clientHeight;
  const scaleVal = parseFloat(getComputedStyle(mapEl).getPropertyValue('--map-scale')) || 1;
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.style.width = baseW + 'px';
  canvas.style.height = baseH + 'px';
  canvas.width = Math.max(1, Math.round(baseW * dpr * scaleVal));
  canvas.height = Math.max(1, Math.round(baseH * dpr * scaleVal));
    return canvas;
  }

  function renderConnections() {
    // W panelu edytora stacji nie rysujemy linii — tylko czyścimy canvas.
    const canvas = ensureCanvas();
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height);
  }

  function renderMarkers() {
    // usuń istniejące markery wygenerowane przez skrypt
    Array.from(mapEl.querySelectorAll('.station-marker.generated')).forEach(el => el.remove());
    Object.entries(coords).forEach(([id, [top, left]]) => {
      const el = document.createElement('div');
  const st = data.stations[id];
  const t = st && st.type;
  const isHub = t === 'hub';
  const extra = [isHub ? 'hub' : null, t ? `type-${t}` : null].filter(Boolean).join(' ');
  el.className = 'station-marker generated' + (extra ? ' ' + extra : '');
      el.style.top = `${top}%`;
      el.style.left = `${left}%`;
  el.title = `${data.stations[id]?.name || id}`;
      const lab = document.createElement('div');
      lab.className = 'station-label';
      lab.textContent = data.stations[id]?.name || id;
      el.appendChild(lab);
      mapEl.appendChild(el);
    });

  // po wyrenderowaniu – unikaj kolizji etykiet
  layoutLabelsAvoidingOverlap();
  }

  function renderAll() {
  // odśwież coords z data.stations
    coords = coords || {};
    Object.entries(data.stations || {}).forEach(([id, st]) => {
      if (st && Array.isArray(st.coordinates)) coords[id] = [Number(st.coordinates[0]), Number(st.coordinates[1])];
    });
    renderMarkers();
  renderConnections();
  }

  // Unikanie kolizji etykiet (wersja dla edytora)
  function layoutLabelsAvoidingOverlap(){
    const markers = Array.from(mapEl.querySelectorAll('.station-marker.generated'));
    const used = [];
    const mapR = mapEl.getBoundingClientRect();
    const isColliding = (a,b) => !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
    for (const m of markers){
      const lab = m.querySelector('.station-label');
      if (!lab) continue;
      lab.classList.remove('label-pos-top','label-pos-right','label-pos-left','label-pos-bottom','label-hidden');
      const tries = ['label-pos-top','label-pos-right','label-pos-left','label-pos-bottom'];
      let placed = false;
      for (const cls of tries){
        lab.classList.remove('label-pos-top','label-pos-right','label-pos-left','label-pos-bottom','label-hidden');
        lab.classList.add(cls);
        const r = lab.getBoundingClientRect();
        if (r.left < mapR.left || r.right > mapR.right || r.top < mapR.top || r.bottom > mapR.bottom) continue;
        let ok = true; for (const u of used){ if (isColliding(r,u)) { ok = false; break; } }
        if (ok){ used.push(r); placed = true; break; }
      }
      if (!placed) lab.classList.add('label-hidden');
    }
  }

  function saveToBlob(obj) {
    return new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json;charset=utf-8' });
  }

  function download(filename, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 100);
  }

  function filteredOptions(query) {
    const q = query.trim().toLowerCase();
    if (!q) return Array.from(sel.options);
    return Array.from(sel.options).filter(o => o.textContent.toLowerCase().includes(q));
  }

  // Interakcje UI: dodawaj punkt tylko przy kliknięciu (bez przeciągania)
  const CLICK_THRESHOLD = 5; // px
  let isDown = false;
  let sx = 0, sy = 0;
  mapEl.addEventListener('pointerdown', (e) => {
    isDown = true; sx = e.clientX; sy = e.clientY;
  });
  mapEl.addEventListener('pointerup', (e) => {
    if (!isDown) return; isDown = false;
    const dx = e.clientX - sx; const dy = e.clientY - sy;
    const moved = Math.hypot(dx, dy) > CLICK_THRESHOLD;
    if (moved) return; // ignoruj przeciągnięcia
    const rect = mapEl.getBoundingClientRect();
    const topPct = ((e.clientY - rect.top) / rect.height) * 100;
    const leftPct = ((e.clientX - rect.left) / rect.width) * 100;
    const id = sel.value;
    if (!id) return;
    coords[id] = [Number(topPct.toFixed(2)), Number(leftPct.toFixed(2))];
    renderAll();
    setStatus(`Ustawiono ${id} → top ${coords[id][0]}%, left ${coords[id][1]}%`);
  });
  mapEl.addEventListener('pointercancel', () => { isDown = false; });

  search.addEventListener('input', () => {
    const opts = filteredOptions(search.value);
    if (opts.length) sel.value = opts[0].value;
  });

  btnClearOne.addEventListener('click', () => {
    const id = sel.value;
    if (!id) return;
  delete coords[id];
  renderAll();
    setStatus(`Usunięto współrzędne dla ${id}.`);
  });

  btnClearAll.addEventListener('click', () => {
  coords = {};
  renderAll();
    setStatus('Wyczyszczono wszystkie współrzędne.');
  });

  // Upload tła mapy
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
  btnUploadBg && btnUploadBg.addEventListener('click', () => {
    inputBg && inputBg.click();
  });
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

  btnDownloadStations && btnDownloadStations.addEventListener('click', () => {
    // wstrzyknij coords do stations
    const out = JSON.parse(JSON.stringify(data.stations));
    Object.keys(out).forEach(id => {
      out[id] = out[id] || {};
      out[id].coordinates = coords[id] ? coords[id] : null;
    });
    download('stations.json', saveToBlob(out));
  });

  // Dodawanie nowej stacji
  btnAddStation && btnAddStation.addEventListener('click', () => {
    const idRaw = (inputNewId?.value || '').trim();
    const nameRaw = (inputNewName?.value || '').trim();
    if (!idRaw) { setStatus('Podaj ID nowej stacji.'); return; }
    const id = idRaw.toUpperCase();
    if (data.stations[id]) { setStatus(`Stacja ${id} już istnieje.`); return; }
    data.stations[id] = { name: nameRaw || id };
    // brak współrzędnych na start
    buildSelect();
    sel.value = id;
    updateTypeSelect(id);
    renderAll();
    setStatus(`Dodano stację ${id}. Kliknij na mapie, aby przypisać współrzędne.`);
  });

  // Usuwanie bieżącej stacji (z danych i współrzędnych)
  btnDeleteStation && btnDeleteStation.addEventListener('click', () => {
    const id = sel.value;
    if (!id) return;
    if (!data.stations[id]) { setStatus('Brak takiej stacji.'); return; }
    // Sprawdź użycia stacji w liniach
    const usedIn = [];
    Object.entries(data.lines || {}).forEach(([lid, line]) => {
      const inStations = Array.isArray(line.stations) && line.stations.includes(id);
      const inSkipped = Array.isArray(line.skipped) && line.skipped.includes(id);
      if (inStations || inSkipped) usedIn.push(lid);
    });
    if (usedIn.length) {
      const list = usedIn.slice(0, 5).join(', ') + (usedIn.length > 5 ? ` i ${usedIn.length - 5} więcej…` : '');
      setStatus(`Nie można usunąć stacji ${id}: używana w liniach: ${list}. Usuń referencje w liniach i spróbuj ponownie.`);
      return;
    }
    // Potwierdzenie usunięcia
    const ok = window.confirm(`Czy na pewno chcesz usunąć stację ${id}? Operacja jest nieodwracalna.`);
    if (!ok) { setStatus('Anulowano usuwanie.'); return; }
    delete data.stations[id];
    delete coords[id];
    buildSelect();
    renderAll();
    setStatus(`Usunięto stację ${id}.`);
  });

  // zmiana wybranej stacji -> zsynchronizuj selektor typu
  sel.addEventListener('change', () => updateTypeSelect(sel.value));

  // zmiana typu stacji z UI
  selType && selType.addEventListener('change', () => {
    const id = sel.value;
    if (!id) return;
    const val = selType.value || undefined;
    if (!data.stations[id]) data.stations[id] = {};
    if (val) data.stations[id].type = val; else delete data.stations[id].type;
    renderAll();
    setStatus(`Ustawiono typ dla ${id}: ${val || 'brak'}`);
  });

  btnImport.addEventListener('click', async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const json = JSON.parse(text);
        let imported = 0;
        // Obsłuż format: stations.json (mapa id -> meta)
        if (json && !Array.isArray(json) && typeof json === 'object') {
          const keys = Object.keys(json);
          const looksLikeStations = keys.every(k => typeof json[k] === 'object' && (!json[k] || 'name' in json[k] || 'coordinates' in json[k] || 'voivodeship' in json[k]));
          if (looksLikeStations) {
            // scal stacje, współrzędne i typy
            Object.entries(json).forEach(([id, st]) => {
              if (!data.stations[id]) data.stations[id] = {};
              Object.assign(data.stations[id], st);
              if (st && Array.isArray(st.coordinates)) {
                coords[id] = [Number(st.coordinates[0]), Number(st.coordinates[1])];
                imported++;
              }
            });
            updateTypeSelect(sel.value);
          } else {
            setStatus('Nieznany format. Użyj stations.json.');
          }
        }
        renderAll();
        setStatus(`Zaimportowano ${imported} elementów z ${file.name}.`);
      } catch (e) {
        setStatus('Błąd importu: ' + e);
      }
    };
    input.click();
  });

  // Start
  loadInfo().then(() => applyBgFromStorage()).catch(err => setStatus('Błąd ładowania: ' + err));
  window.addEventListener('resize', () => renderConnections());
  const mo = new MutationObserver(() => renderConnections());
  mo.observe(mapEl, { attributes: true, attributeFilter: ['style'] });
  // odśwież po zmianie motywu
  const moTheme = new MutationObserver(() => renderConnections());
  moTheme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
})();
