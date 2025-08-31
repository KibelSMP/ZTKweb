// renamed from search.js
(async function () {
	const fromInput = document.getElementById('from');
	const toInput = document.getElementById('to');
	const swapBtn = document.getElementById('swap');
	const searchBtn = document.getElementById('search');
	const list = document.getElementById('stations-list');
	const stationInput = document.getElementById('station');
	const stationSearchBtn = document.getElementById('station-search');
	const stationClearBtn = document.getElementById('station-clear');
	const resultsEl = document.getElementById('search-results');
	const typeCheckboxes = Array.from(document.querySelectorAll('#type-filters .line-type'));
	if (!fromInput || !toInput || !list || !resultsEl) return;
	// Stan tras i wyboru
	let currentRoutes = [];
	let selectedIndex = 0;

	// Wczytaj niezależnie stacje i linie
	const [stRes, lnRes] = await Promise.all([
		fetch('assets/stations.json', { cache: 'no-store' }),
		fetch('assets/lines.json', { cache: 'no-store' })
	]);
	/** @type {Record<string, {name?:string, voivodeship?:string, coordinates?:[number,number]|null, type?:string}>} */
	const stations = await stRes.json();
	/** @type {Record<string, {color?:string|null, category?:string, relation?:string, stations?:string[]}>} */
	const lines = await lnRes.json();
	// helper: sprawdź czy dana stacja jest oznaczona jako pomijana na danej linii
	function isSkipped(lineId, stationId) {
		const arr = lines?.[lineId]?.skipped;
		return Array.isArray(arr) && arr.includes(stationId);
	}
	// Mapowanie nazw kolorów na CSS (jak w viewer.js)
	const colorMapLight = {
		Red: '#d32f2f', Pink: '#e91e63', Blue: '#1976d2', Green: '#388e3c', White: '#ffffff', Black: '#000000',
		Grey: '#757575', Gray: '#757575', Brown: '#6d4c41', Lime: '#cddc39', Yellow: '#fbc02d', Cyan: '#00bcd4',
		Purple: '#7b1fa2', 'Light Blue': '#03a9f4', 'Light blue': '#03a9f4', Magenta: '#d81b60', 'Light gray': '#bdbdbd', 'Light grey': '#bdbdbd',
		Orange: '#ff9800', Birch: '#c0a16b', Warped: '#673ab7', Accacia: '#9ccc65', Cherry: '#c2185b', Oak: '#795548',
		Mangrove: '#2e7d32', Jungle: '#43a047'
	};
	const colorMapDark = {
		Red: '#ef5350', Pink: '#f06292', Blue: '#64b5f6', Green: '#66bb6a', White: '#eceff1', Black: '#cfd8dc',
		Grey: '#bdbdbd', Gray: '#bdbdbd', Brown: '#bcaaa4', Lime: '#dce775', Yellow: '#ffd54f', Cyan: '#4dd0e1',
		Purple: '#ba68c8', 'Light Blue': '#4fc3f7', 'Light blue': '#4fc3f7', Magenta: '#f48fb1', 'Light gray': '#e0e0e0', 'Light grey': '#e0e0e0',
		Orange: '#ffa726', Birch: '#d7b98c', Warped: '#9575cd', Accacia: '#aed581', Cherry: '#e57373', Oak: '#a1887f',
		Mangrove: '#81c784', Jungle: '#81c784'
	};
	const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark';
	const getColor = (lineId) => {
		const line = lines[lineId];
		const dark = isDark();
		if (!line) return dark ? '#bdbdbd' : '#555';
		// prefer HEX fields if available
		if (dark && line.hexDarkMode) return String(line.hexDarkMode);
		if (!dark && line.hexLightMode) return String(line.hexLightMode);
		const c = line.color;
		const map = dark ? colorMapDark : colorMapLight;
		return (c && map[c]) ? map[c] : (dark ? '#bdbdbd' : '#555');
	};

	// Typy linii i ich etykiety
	const typeLabelMap = {
		IC: 'InterCity',
		REGIO: 'Regionalne',
		METRO: 'Metro',
		ON_DEMAND: 'Na żądanie'
	};
	function typeKeyFor(lineId, line) {
		const cat = String(line?.category || '').toUpperCase();
		if (cat.includes('METRO')) return 'METRO';
		if (cat.includes('IC')) return 'IC';
		if (lineId.startsWith('NŻ') || cat.includes('ON')) return 'ON_DEMAND';
		return 'REGIO';
	}

	// build datalist (both name and id)
	const items = Object.entries(stations).map(([id, st]) => ({ id, name: st.name || id })).sort((a,b)=>a.name.localeCompare(b.name,'pl'));
	// Nie pokazuj ID w podpowiedziach
	list.innerHTML = items.map(({id, name}) => `<option value="${name}"></option>`).join('');

	// Pomocnicze: format wartości pola wejściowego jako "Name (ID)"
	function formatStationValue(id) {
		if (!id) return '';
		const st = stations[id];
		const name = st?.name || id;
		return `${name}`;
	}

	// URL helpers
	function updateURL(mutator) {
		const url = new URL(window.location.href);
		const sp = url.searchParams;
		mutator(sp);
		// unikaj pustego ?
		url.search = sp.toString();
		window.history.replaceState({}, '', url.toString());
	}
	function csvSelectedTypes() {
		const set = new Set(typeCheckboxes.filter(cb => cb.checked).map(cb => cb.dataset.type));
		return Array.from(set).join(',');
	}

	// helper: parse input into station id (support name or "Name (ID)")
	function parseStation(text) {
		if (!text) return null;
		const m = text.match(/\(([A-Z]{2,})\)\s*$/);
		if (m && stations[m[1]]) return m[1];
		// try exact id
		const up = text.trim().toUpperCase();
		if (stations[up]) return up;
		// try by name
		const found = items.find(it => it.name.toLowerCase() === text.trim().toLowerCase());
		return found ? found.id : null;
	}

	// wyszukaj pojedynczą stację i wycentruj mapę
	function focusStation() {
		const id = parseStation(stationInput?.value || '');
		if (!id || !stations[id] || !Array.isArray(stations[id].coordinates)) return;
		const [top, left] = stations[id].coordinates.map(Number);
		// wyślij event do zoom.js, by wycentrował i lekko przybliżył
		window.dispatchEvent(new CustomEvent('center-on-station', { detail: { top, left, scale: 2.5 } }));
		// zdejmij poprzednie podświetlenie
		document.querySelectorAll('.station-marker.highlighted-station').forEach(el => el.classList.remove('highlighted-station'));
		// nadaj podświetlenie wskazanej stacji
		const el = document.querySelector(`.station-marker[data-station-id="${id}"]`);
		if (el) {
			el.classList.add('highlighted-station');
			// automatycznie wygasz po kilku sekundach, pozostaw etykietę widoczną przy hover
			setTimeout(() => {
				el.classList.remove('highlighted-station');
			}, 3500);
		}
		// zaktualizuj URL, usuń parametry trasy
		updateURL(sp => {
			sp.set('station', id);
			sp.delete('from');
			sp.delete('to');
			sp.delete('sel');
		});
	}

	// utrzymuj zestaw aktywnych typów linii (IC/REGIO/METRO/ON_DEMAND)
	function currentTypes() {
		const set = new Set(typeCheckboxes.filter(cb => cb.checked).map(cb => cb.dataset.type));
		// minimum jeden musi być zaznaczony; jeśli nie, przywróć poprzedni stan pierwszego
		if (set.size === 0 && typeCheckboxes.length) {
			// włącz pierwszy i dodaj do seta
			typeCheckboxes[0].checked = true;
			set.add(typeCheckboxes[0].dataset.type);
		}
		return set;
	}

	// Build graph: nodes=stations, edges=rides along lines with attribute lineId and hop cost, z filtrem typów
	// We allow staying on the same line for 0 transfer cost; changing line incurs +1 transfer.
	function buildGraph() {
		const adj = new Map(); // id -> Array<{to, lineId}>
		const allowed = currentTypes();
		for (const [lineId, line] of Object.entries(lines)) {
			const cat = String(line.category || '').toUpperCase();
			const typeKey = cat.includes('METRO') ? 'METRO' : cat.includes('IC') ? 'IC' : (cat.includes('REGIO') ? 'REGIO' : (lineId.startsWith('NŻ') || cat.includes('ON') ? 'ON_DEMAND' : 'REGIO'));
			if (!allowed.has(typeKey)) continue;
			const seq = Array.isArray(line.stations) ? line.stations : [];
			for (let i=0; i<seq.length-1; i++) {
				const a = seq[i], b = seq[i+1];
				if (!stations[a] || !stations[b]) continue;
				if (!adj.has(a)) adj.set(a, []);
				if (!adj.has(b)) adj.set(b, []);
				// treat as undirected for simplicity; if you want directed, add only a->b
				adj.get(a).push({ to: b, lineId });
				adj.get(b).push({ to: a, lineId });
			}
		}
		return adj;
	}

	function findRoutes(src, dst, maxResults=3) {
		if (!src || !dst || src===dst) return [];
		const adj = buildGraph();
		// Dijkstra variant minimizing (transfers, steps)
		const key = (t,s) => `${t}|${s}`;
		const pq = []; // min-heap: [transfers, steps, node, prevNode, prevLine]
		const best = new Map(); // node -> best tuple
		pq.push([0, 0, src, null, null]);

		const parents = new Map(); // node -> {prev, line}
		while (pq.length) {
			// pop min
			pq.sort((a,b)=> a[0]-b[0] || a[1]-b[1]);
			const [tr, stp, u, p, pl] = pq.shift();
			if (best.has(u)) {
				const [btr, bstp] = best.get(u);
				if (btr < tr || (btr === tr && bstp <= stp)) continue;
			}
			best.set(u, [tr, stp]);
			if (p) parents.set(u, { prev: p, line: pl });
			if (u === dst) break;
			const edges = adj.get(u) || [];
			for (const {to, lineId} of edges) {
				// Zasady skipped: nie wolno wsiadać na linii na stacji pomijanej; nie wolno się przesiadać na/ze skipped;
				// oraz nie wolno kończyć na dst, jeśli dst jest pomijana na tej linii.
				if (pl === null) {
					if (isSkipped(lineId, u)) continue; // start nie może być skipped dla wybranej linii
				} else if (pl !== lineId) {
					if (isSkipped(pl, u) || isSkipped(lineId, u)) continue; // nie przesiadamy się na/ze skipped
				}
				if (to === dst && isSkipped(lineId, to)) continue; // nie można wysiąść na dst pomijanej przez linię
				const addTr = (pl && pl !== lineId) ? 1 : 0;
				const nt = tr + addTr;
				const ns = stp + 1;
				const curBest = best.get(to);
				if (!curBest || nt < curBest[0] || (nt === curBest[0] && ns < curBest[1])) {
					pq.push([nt, ns, to, u, lineId]);
				}
			}
		}

		if (!best.has(dst)) return [];
		// reconstruct path
		const path = [];
		let cur = dst;
		let lastLine = null;
		while (cur && cur !== src) {
			const pr = parents.get(cur);
			if (!pr) break;
			path.push({ to: cur, from: pr.prev, lineId: pr.line });
			cur = pr.prev;
			lastLine = pr.line;
		}
		path.reverse();

		// group into legs by line
		const legs = [];
		let curLeg = null;
		for (const step of path) {
			if (!curLeg || curLeg.lineId !== step.lineId) {
				if (curLeg) legs.push(curLeg);
				curLeg = { lineId: step.lineId, stations: [step.from, step.to] };
			} else {
				const last = curLeg.stations[curLeg.stations.length-1];
				if (last !== step.to) curLeg.stations.push(step.to);
			}
		}
		if (curLeg) legs.push(curLeg);
		const first = { transfers: legs.length - 1, steps: path.length, legs };
		// prosta heurystyka: generuj do (maxResults-1) alternatyw przez wykluczanie kolejno linii z pierwszej trasy
		const alts = [];
		// zbuduj zbiór linii z pierwszej trasy
		const firstLines = new Set(first.legs.map(l => l.lineId));
		for (const lineId of Array.from(firstLines)) {
			if (alts.length >= maxResults - 1) break;
			// tymczasowo wyklucz tę linię i przelicz
			const saved = lines[lineId];
			delete lines[lineId];
			const adj2 = buildGraph();
			// krótki dijkstra copy-paste (dla prostoty)
			const pq = [[0,0,src,null,null]]; const best = new Map(); const parents = new Map();
			while (pq.length) {
				pq.sort((a,b)=> a[0]-b[0] || a[1]-b[1]);
				const [tr, stp, u, p, pl] = pq.shift();
				if (best.has(u)) { const [btr, bstp]=best.get(u); if (btr<tr || (btr===tr && bstp<=stp)) continue; }
				best.set(u, [tr, stp]); if (p) parents.set(u, { prev:p, line:pl }); if (u===dst) break;
				const edges = adj2.get(u) || [];
				for (const {to, lineId:lid} of edges) {
					// zastosuj te same zasady skipped dla alternatyw
					if (pl === null) {
						if (isSkipped(lid, u)) continue;
					} else if (pl !== lid) {
						if (isSkipped(pl, u) || isSkipped(lid, u)) continue;
					}
					if (to === dst && isSkipped(lid, to)) continue;
					const addTr=(pl&&pl!==lid)?1:0; const nt=tr+addTr; const ns=stp+1; const cur=best.get(to);
					if (!cur || nt<cur[0] || (nt===cur[0] && ns<cur[1])) pq.push([nt, ns, to, u, lid]);
				}
			}
			if (best.has(dst)) {
				const path=[]; let cur=dst; while (cur && cur!==src) { const pr=parents.get(cur); if(!pr) break; path.push({to:cur, from:pr.prev, lineId:pr.line}); cur=pr.prev; }
				path.reverse();
				const legs2=[]; let curLeg=null; for (const step of path){ if(!curLeg||curLeg.lineId!==step.lineId){ if(curLeg) legs2.push(curLeg); curLeg={lineId:step.lineId, stations:[step.from, step.to]}; } else { const last=curLeg.stations[curLeg.stations.length-1]; if(last!==step.to) curLeg.stations.push(step.to);} }
				if (curLeg) legs2.push(curLeg);
				alts.push({ transfers: legs2.length-1, steps: path.length, legs: legs2 });
			}
			lines[lineId] = saved; // restore
		}
		// deduplikacja tras po sekwencji legów i stacji
		const unique = [];
		const seen = new Set();
		for (const r of [first, ...alts]) {
			const sig = r.legs.map(l => `${l.lineId}:${l.stations.join('-')}`).join('|');
			if (!seen.has(sig)) { seen.add(sig); unique.push(r); }
		}
		return unique.slice(0, maxResults);
	}

	function renderResults(routes) {
		if (!routes.length) { resultsEl.textContent = 'Brak połączenia.'; return; }
		const fmtStation = (id) => `${stations[id]?.name || id}`;
		const fmtLeg = (leg) => {
			const line = lines[leg.lineId] || {};
			let rel = line.relation || '';
			if (typeof rel === 'string') rel = rel.split(/\n|\r/)[0];
			const name = `${leg.lineId}: ${rel}`;
			const tkey = typeKeyFor(leg.lineId, line);
			const tlabel = typeLabelMap[tkey] || tkey;
			const board = leg.stations[0];
			const alight = leg.stations[leg.stations.length - 1];
			return { id: leg.lineId, name, typeKey: tkey, typeLabel: tlabel, board: fmtStation(board), alight: fmtStation(alight), stations: leg.stations };
		};
		const htmlCards = routes.map((r, idx) => {
			const firstLineId = r.legs[0]?.lineId;
			const routeColor = firstLineId ? getColor(firstLineId) : '#999';
			const header = `<div class=\"itinerary-header\">\n        <div>Trasa</div>\n        <div class=\"itinerary-meta\">Przesiadki: ${r.transfers} • Przystanki: ${r.steps}</div>\n      </div>`;
			const legs = r.legs.map(leg => fmtLeg(leg));
			const body = legs.map((lg, lidx) => {
				// Dla IC ukrywamy stacje pośrednie oznaczone jako skipped
				const seq = lg.typeKey === 'IC'
					? lg.stations.filter((s, i) => {
							const isEnd = (i === 0) || (i === lg.stations.length - 1);
							return isEnd || !isSkipped(lg.id, s);
						})
					: lg.stations;
				const stationsHtml = seq.map((s, i) => {
					const label = stations[s]?.name || s;
					if (lg.typeKey === 'IC') {
						// dla IC nie wyświetlamy w ogóle skipped, więc bez klasy
						return `<span class=\"station\">${label}</span>`;
					}
					const isEnd = (i === 0) || (i === seq.length - 1);
					const sk = !isEnd && isSkipped(lg.id, s);
					return `<span class=\"station${sk ? ' skipped' : ''}\">${label}</span>`;
				}).join(' <span class=\"sep\">→</span> ');
				return (
					`<div class=\"leg\">\n            <div class=\"leg-index\">${lidx+1}.</div>\n            <div class=\"line\">\n              <span class=\"line-pill\" data-line-id=\"${lg.id}\"><span class=\"line-dot\"></span>${lg.name}</span>\n              <span class=\"type-badge\" data-type=\"${lg.typeKey}\">${lg.typeLabel}</span>\n            </div>\n            <div class=\"stations\">${stationsHtml}</div>\n            <div class=\"board\">Wsiąść: ${lg.board}</div>\n            <div class=\"alight\">Wysiąść: ${lg.alight}</div>\n          </div>`
				);
			}).join('');
			const isSel = idx === selectedIndex;
			const footer = `<div class=\"itinerary-footer\">\n        <button class=\"btn-choose\" data-index=\"${idx}\" aria-pressed=\"${isSel}\">${isSel ? 'Wybrano' : 'Wybierz'}</button>\n      </div>`;
			return `<div class=\"itinerary${isSel ? ' selected' : ''}\" data-index=\"${idx}\" style=\"--route-color:${routeColor}\" role=\"button\" tabindex=\"0\" aria-pressed=\"${isSel}\">${header}${body}${footer}</div>`;
		}).join('');
		resultsEl.innerHTML = `<div class=\"results-grid\" role=\"list\">${htmlCards}</div>`;
		// Pokoloruj kropki w pigułkach zgodnie z kolorem danej linii
		resultsEl.querySelectorAll('.leg .line .line-pill').forEach((pill) => {
			const id = pill.getAttribute('data-line-id');
			if (!id) return;
			const dot = pill.querySelector('.line-dot');
			if (dot) dot.style.background = getColor(id);
			pill.style.borderColor = getColor(id) + '33';
			pill.style.background = `color-mix(in oklab, ${getColor(id)} 12%, transparent)`;
		});
	}

	function selectRoute(idx) {
		const r = currentRoutes[idx];
		if (!r) return;
		selectedIndex = idx;
		// Podświetl wybraną trasę na mapie
		window.dispatchEvent(new CustomEvent('route:highlight', { detail: { legs: r.legs } }));
		// Zaznacz przystanki wysiadania
		document.querySelectorAll('.station-marker.highlight-stop').forEach(el => el.classList.remove('highlight-stop'));
		// Usuń poprzednie oznaczenia ważnych stacji
		document.querySelectorAll('.station-marker.important').forEach(el => el.classList.remove('important'));
		r.legs.forEach(leg => {
			const alight = leg.stations[leg.stations.length - 1];
			const el = document.querySelector(`.station-marker[data-station-id="${alight}"]`);
			if (el) el.classList.add('highlight-stop');
		});
		// Oznacz jako ważne: stacje wsiadania i wysiadania każdego segmentu (przesiadki), oraz skrajne (start/dest)
		const firstLeg = r.legs[0];
		const lastLeg = r.legs[r.legs.length - 1];
		const importantIds = new Set();
		if (firstLeg) importantIds.add(firstLeg.stations[0]); // start
		if (lastLeg) importantIds.add(lastLeg.stations[lastLeg.stations.length - 1]); // dest
		r.legs.forEach(leg => {
			importantIds.add(leg.stations[0]);   // punkt wsiadania (może być przesiadka lub start)
			importantIds.add(leg.stations[leg.stations.length - 1]); // punkt wysiadania (może być przesiadka lub dest)
		});
		importantIds.forEach(id => {
			const el = document.querySelector(`.station-marker[data-station-id="${id}"]`);
			if (el) el.classList.add('important');
		});
		// Dopasuj widok mapy do całej trasy
		const coords = [];
		r.legs.forEach(leg => leg.stations.forEach(sid => {
			const st = stations[sid];
			if (st && Array.isArray(st.coordinates)) coords.push(st.coordinates.map(Number));
		}));
		if (coords.length) {
			let minTop = Infinity, minLeft = Infinity, maxTop = -Infinity, maxLeft = -Infinity;
			coords.forEach(([t,l]) => { if (t<minTop) minTop=t; if (t>maxTop) maxTop=t; if (l<minLeft) minLeft=l; if (l>maxLeft) maxLeft=l; });
			window.dispatchEvent(new CustomEvent('fit-to-bounds', { detail: { minTop, minLeft, maxTop, maxLeft } }));
		}
	}

	// gdy zmieni się motyw, przerysuj wyniki (kolory pigułek)
	const moTheme = new MutationObserver(() => {
		// odśwież aktualnie wyrenderowane wyniki bez zmiany treści (przekoloruj)
		resultsEl.querySelectorAll('.leg .line .line-pill').forEach((pill) => {
			const id = pill.getAttribute('data-line-id');
			if (!id) return;
			const dot = pill.querySelector('.line-dot');
			const col = getColor(id);
			if (dot) dot.style.background = col;
			pill.style.borderColor = col + '33';
			pill.style.background = `color-mix(in oklab, ${col} 12%, transparent)`;
		});
	});
	moTheme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

	function runSearch() {
		const src = parseStation(fromInput.value);
		const dst = parseStation(toInput.value);
		if (!src || !dst) { resultsEl.textContent = 'Wybierz poprawne stacje.'; return; }
		// wyczyść poprzednie oznaczenia ważnych stacji
		document.querySelectorAll('.station-marker.important').forEach(el => el.classList.remove('important'));
		currentRoutes = findRoutes(src, dst, 3);
		selectedIndex = 0;
		renderResults(currentRoutes);
		if (currentRoutes.length) {
			selectRoute(0);
		}
		// zaktualizuj URL (only ids), usuń parametr station
		updateURL(sp => {
			sp.set('from', src);
			sp.set('to', dst);
			const types = csvSelectedTypes();
			if (types) sp.set('types', types); else sp.delete('types');
			sp.set('sel', String(selectedIndex));
			sp.delete('station');
		});
	}

	searchBtn?.addEventListener('click', runSearch);
	// reaguj na zmianę filtrów; nie pozwól odznaczyć wszystkich
	typeCheckboxes.forEach(cb => {
		cb.addEventListener('change', () => {
			// wymuś min. 1
			const checked = typeCheckboxes.filter(x => x.checked);
			if (checked.length === 0) {
				cb.checked = true;
				return;
			}
			// przelicz wyniki jeśli oba pola stacji ustawione
			// oraz wyczyść poprzednie oznaczenia ważnych stacji
			document.querySelectorAll('.station-marker.important').forEach(el => el.classList.remove('important'));
			if (fromInput.value && toInput.value) runSearch();
			// wyślij event do viewer.js, aby przefiltrował rysowanie
			const allowed = new Set(typeCheckboxes.filter(x => x.checked).map(x => x.dataset.type));
			window.dispatchEvent(new CustomEvent('lines:visibility', { detail: { allowed: Array.from(allowed) } }));
			// aktualizuj URL z typami
			updateURL(sp => {
				const types = Array.from(allowed).join(',');
				if (types) sp.set('types', types); else sp.delete('types');
			});
		});
	});
	swapBtn?.addEventListener('click', () => {
		const a = fromInput.value; fromInput.value = toInput.value; toInput.value = a;
		// zresetuj wybór trasy i URL (station->null, sel->0)
		updateURL(sp => {
			const src = parseStation(fromInput.value);
			const dst = parseStation(toInput.value);
			if (src) sp.set('from', src); else sp.delete('from');
			if (dst) sp.set('to', dst); else sp.delete('to');
			sp.delete('station');
			sp.set('sel', '0');
		});
	});
	[fromInput, toInput].forEach(el => el.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') runSearch();
	}));

	// Obsługa wyszukiwarki stacji
	stationSearchBtn?.addEventListener('click', focusStation);
	stationInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') focusStation(); });
	stationClearBtn?.addEventListener('click', () => {
		if (stationInput) stationInput.value = '';
		// usuń wyróżnienie stacji
		document.querySelectorAll('.station-marker.highlighted-station').forEach(el => el.classList.remove('highlighted-station'));
		// usuń station z URL
		updateURL(sp => { sp.delete('station'); });
	});

	// Delegacja kliknięcia w przycisk „Wybierz”
	resultsEl.addEventListener('click', (e) => {
		const target = e.target;
    
		// klik w przycisk
		const btn = target && target.closest ? target.closest('.btn-choose') : null;
		if (btn) {
			const idx = Number(btn.getAttribute('data-index'));
			if (Number.isFinite(idx)) {
				selectRoute(idx);
				renderResults(currentRoutes);
				// uaktualnij sel w URL
				updateURL(sp => { sp.set('sel', String(idx)); });
			}
			return;
		}
		// klik w kartę
		const card = target && target.closest ? target.closest('.itinerary') : null;
		if (card && card.hasAttribute('data-index')) {
			const idx = Number(card.getAttribute('data-index'));
			if (Number.isFinite(idx)) {
				selectRoute(idx);
				renderResults(currentRoutes);
				updateURL(sp => { sp.set('sel', String(idx)); });
			}
		}
	});

	// Klawiatura: Enter/Space wybierają kartę; strzałki zmieniają wybór
	resultsEl.addEventListener('keydown', (e) => {
		const card = e.target && e.target.closest ? e.target.closest('.itinerary') : null;
		if (!card) return;
		const idx = Number(card.getAttribute('data-index'));
		if (!Number.isFinite(idx)) return;
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			selectRoute(idx);
			renderResults(currentRoutes);
			updateURL(sp => { sp.set('sel', String(idx)); });
		} else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
			e.preventDefault();
			const next = Math.min(currentRoutes.length - 1, idx + 1);
			const el = resultsEl.querySelector(`.itinerary[data-index="${next}"]`);
			if (el) el.focus();
		} else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
			e.preventDefault();
			const prev = Math.max(0, idx - 1);
			const el = resultsEl.querySelector(`.itinerary[data-index="${prev}"]`);
			if (el) el.focus();
		}
	});

	// Parsowanie URL na starcie (route/station/types/sel)
	(function applyURLAtLoad() {
		const url = new URL(window.location.href);
		const sp = url.searchParams;
		// typy
		const typesParam = sp.get('types');
		if (typesParam) {
			const wanted = new Set(typesParam.split(',').map(s => s.trim()).filter(Boolean));
			if (wanted.size) {
				typeCheckboxes.forEach(cb => cb.checked = wanted.has(cb.dataset.type));
			}
		}
		// station-only
		const stParam = sp.get('station');
		if (stParam) {
			const id = parseStation(stParam) || stParam.toUpperCase();
			if (stations[id]) {
				if (stationInput) stationInput.value = formatStationValue(id);
				// opóźnij focusStation do następnej klatki, aby DOM był gotowy
				setTimeout(() => focusStation(), 0);
			}
		}
		// route
		const f = sp.get('from');
		const t = sp.get('to');
		if (f && t) {
			const fid = parseStation(f) || f.toUpperCase();
			const tid = parseStation(t) || t.toUpperCase();
			if (stations[fid]) fromInput.value = formatStationValue(fid); else fromInput.value = f;
			if (stations[tid]) toInput.value = formatStationValue(tid); else toInput.value = t;
			setTimeout(() => {
				runSearch();
				const sel = parseInt(sp.get('sel') || '0', 10);
				if (Number.isFinite(sel) && currentRoutes[sel]) {
					selectRoute(sel);
					renderResults(currentRoutes);
				}
			}, 0);
		}
	})();

	// Czyszczenie wyszukiwania trasy
	const routeClearBtn = document.getElementById('route-clear');
	routeClearBtn?.addEventListener('click', () => {
		if (fromInput) fromInput.value = '';
		if (toInput) toInput.value = '';
		// wyczyść wyniki
		currentRoutes = [];
		selectedIndex = 0;
		resultsEl.textContent = '';
		// zdejmij podświetlenia i ważne stacje
		window.dispatchEvent(new CustomEvent('route:highlight', { detail: { legs: [] } }));
		document.querySelectorAll('.station-marker.highlight-stop').forEach(el => el.classList.remove('highlight-stop'));
		document.querySelectorAll('.station-marker.important').forEach(el => el.classList.remove('important'));
		// wyczyść parametry trasy w URL
		updateURL(sp => { sp.delete('from'); sp.delete('to'); sp.delete('sel'); });
	});
})();
