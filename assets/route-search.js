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
	const prioTransfers = /** @type {HTMLInputElement|null} */ (document.getElementById('prio-transfers'));
	const prioStops = /** @type {HTMLInputElement|null} */ (document.getElementById('prio-stops'));
	const typeFiltersSummary = /** @type {HTMLElement|null} */ (document.getElementById('type-filters-summary'));
	const prioritySummary = /** @type {HTMLElement|null} */ (document.getElementById('priority-summary'));
	const layersMenu = /** @type {HTMLElement|null} */ (document.getElementById('map-layers-menu'));
	if (!fromInput || !toInput || !list || !resultsEl) return;
	// Routes state and selection
	let currentRoutes = [];
	let selectedIndex = 0;
	/** @type {'transfers'|'stops'} */
	let priority = 'transfers';

	function setPriorityFromUI(){
		if (prioStops && prioStops.checked) priority = 'stops';
		else priority = 'transfers';
	}
	function getPriority(){ return priority; }
	function setPriorityFromParam(val){
		const v = String(val || '').toLowerCase();
		if (v === 'stops' || v === 'transfers') {
			priority = v;
			if (prioStops) prioStops.checked = (v === 'stops');
			if (prioTransfers) prioTransfers.checked = (v === 'transfers');
		}
	}

	// Load stations and lines independently
	const [stRes, lnRes] = await Promise.all([
		fetch('assets/stations.json', { cache: 'no-store' }),
		fetch('assets/lines.json', { cache: 'no-store' })
	]);
	/** @type {Record<string, {name?:string, voivodeship?:string, coordinates?:[number,number]|null, type?:string}>} */
	const stations = await stRes.json();
	/** @type {Record<string, {color?:string|null, category?:string, relation?:string, stations?:string[]}>} */
	const lines = await lnRes.json();
	// helper: check if a station is marked as skipped on a given line
	function isSkipped(lineId, stationId) {
		const arr = lines?.[lineId]?.skipped;
		return Array.isArray(arr) && arr.includes(stationId);
	}
	// Map color names to CSS (same as in viewer.js)
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

	// Line types and their labels
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
	// Do not show IDs in suggestions
	list.innerHTML = items.map(({id, name}) => `<option value="${name}"></option>`).join('');

	// Helper: format input field value as "Name (ID)"
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
		// avoid empty ?
		url.search = sp.toString();
		window.history.replaceState({}, '', url.toString());
	}

	// Compact type mask encoding: IC=1, REGIO=2, METRO=4, ON_DEMAND=8
	const typeBitMap = { IC: 1, REGIO: 2, METRO: 4, ON_DEMAND: 8 };
	function encodeSelectedTypesBits() {
		let mask = 0;
		typeCheckboxes.forEach(cb => { if (cb.checked) mask |= (typeBitMap[cb.dataset.type] || 0); });
		return String(mask);
	}
	function applyTypesFromParam(val) {
		if (!val) return false;
		// If numeric, treat as bitmask; otherwise treat as CSV list
		const isNum = /^\d+$/.test(String(val).trim());
		if (isNum) {
			const mask = parseInt(String(val), 10);
			typeCheckboxes.forEach(cb => {
				const bit = typeBitMap[cb.dataset.type] || 0;
				cb.checked = (mask & bit) === bit;
			});
			return true;
		}
		const wanted = new Set(String(val).split(',').map(s => s.trim()).filter(Boolean));
		if (wanted.size) {
			typeCheckboxes.forEach(cb => cb.checked = wanted.has(cb.dataset.type));
			return true;
		}
		return false;
	}

	// Layers helpers: sat=1, pol=2
	function getLayersMask() {
		const cbSat = /** @type {HTMLInputElement|null} */ (document.querySelector('#map-layers-menu input[name="map-layer-satellite"]'));
		const cbPol = /** @type {HTMLInputElement|null} */ (document.querySelector('#map-layers-menu input[name="map-layer-political"]'));
		let mask = 0;
		if (cbSat && cbSat.checked) mask |= 1;
		if (cbPol && cbPol.checked) mask |= 2;
		return mask;
	}
	function writeLayersParamFromMask(mask) {
		updateURL(sp => {
			const parts = [];
			if (mask & 1) parts.push('sat');
			if (mask & 2) parts.push('pol');
			if (parts.length) sp.set('layers', parts.join(',')); else sp.delete('layers');
		});
	}

	// Base64url helpers
	function b64urlEncode(str) {
		// ASCII-only content expected; if needed, upgrade to UTF-8 encoder
		return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/,'');
	}
	function b64urlDecode(str) {
		let s = String(str).replace(/-/g,'+').replace(/_/g,'/');
		const pad = s.length % 4; if (pad) s += '='.repeat(4-pad);
		return atob(s);
	}

	// Pack/unpack state into single param q (versioned)
	function encodeRouteStateQ(src, dst) {
		const maskDec = parseInt(encodeSelectedTypesBits(), 10) || 0;
		const tyHex = maskDec.toString(16).toUpperCase();
		const pch = getPriority() === 'stops' ? 's' : 't';
		const sel = String(selectedIndex || 0);
		const layersHex = getLayersMask().toString(16).toUpperCase();
		const payload = `1|${src}|${dst}|${tyHex}|${pch}|${sel}|${layersHex}`;
		return b64urlEncode(payload);
	}
	function encodeStationStateQ(id) {
		return b64urlEncode(`2|${id}`);
	}
	function tryApplyQ(qval) {
		try {
			const raw = b64urlDecode(qval);
			const parts = raw.split('|');
			if (parts[0] === '1' && parts.length >= 6) {
				const [, f, t, tyHex, pch, selStr, layersHex] = parts;
				if (f) fromInput.value = formatStationValue(f);
				if (t) toInput.value = formatStationValue(t);
				// apply types from hex mask
				const mask = parseInt(tyHex, 16);
				typeCheckboxes.forEach(cb => {
					const bit = typeBitMap[cb.dataset.type] || 0;
					cb.checked = (mask & bit) === bit;
				});
				// priority
				const pr = (pch === 's') ? 'stops' : 'transfers';
				setPriorityFromParam(pr);
				refreshPrioritySummary();
				refreshTypeFiltersSummary();
				// layers (optional)
				if (layersHex !== undefined) {
					const lmask = parseInt(layersHex || '0', 16) || 0;
					writeLayersParamFromMask(lmask);
				}
				setTimeout(() => {
					runSearch();
					const idx = parseInt(selStr || '0', 10);
					if (Number.isFinite(idx) && currentRoutes[idx]) {
						selectRoute(idx);
						renderResults(currentRoutes);
					}
				}, 0);
				return true;
			}
			if (parts[0] === '2' && parts[1]) {
				const id = parts[1];
				if (stationInput) stationInput.value = formatStationValue(id);
				setTimeout(() => focusStation(), 0);
				return true;
			}
			return false;
		} catch { return false; }
	}

	function refreshTypeFiltersSummary() {
		if (!typeFiltersSummary) return;
		const checked = typeCheckboxes.filter(cb => cb.checked);
		if (checked.length === typeCheckboxes.length) {
			typeFiltersSummary.textContent = 'Wszystkie';
			return;
		}
		if (checked.length === 0) {
			typeFiltersSummary.textContent = '—';
			return;
		}
		const labelByType = new Map(Array.from(document.querySelectorAll('#type-filters .line-type')).map(input => [input.dataset.type, input.parentElement?.textContent?.trim() || input.dataset.type]));
		const names = checked.map(cb => labelByType.get(cb.dataset.type) || cb.dataset.type);
		typeFiltersSummary.textContent = names.join(', ');
	}

	function refreshPrioritySummary() {
		if (!prioritySummary) return;
		prioritySummary.textContent = (prioStops && prioStops.checked) ? 'Mniej przystanków' : 'Mniej przesiadek';
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

	// find a single station and center the map
	function focusStation() {
		const id = parseStation(stationInput?.value || '');
		if (!id || !stations[id] || !Array.isArray(stations[id].coordinates)) return;
		const [top, left] = stations[id].coordinates.map(Number);
		// send event to zoom.js to center and slightly zoom in
		window.dispatchEvent(new CustomEvent('center-on-station', { detail: { top, left, scale: 2.5 } }));
		// remove previous highlight
		document.querySelectorAll('.station-marker.highlighted-station').forEach(el => el.classList.remove('highlighted-station'));
		// add highlight to the selected station
		const el = document.querySelector(`.station-marker[data-station-id="${id}"]`);
		if (el) {
			el.classList.add('highlighted-station');
			// auto-fade after a few seconds; keep label visible on hover
			setTimeout(() => {
				el.classList.remove('highlighted-station');
			}, 3500);
		}
		// update URL, remove route params
		updateURL(sp => {
			sp.set('station', id);
			sp.delete('from');
			sp.delete('to');
			sp.delete('sel');
		});
	}

	// maintain a set of active line types (IC/REGIO/METRO/ON_DEMAND)
	function currentTypes() {
		const set = new Set(typeCheckboxes.filter(cb => cb.checked).map(cb => cb.dataset.type));
		// at least one must be checked; if not, restore previous state for the first
		if (set.size === 0 && typeCheckboxes.length) {
			// enable the first and add to the set
			typeCheckboxes[0].checked = true;
			set.add(typeCheckboxes[0].dataset.type);
		}
		return set;
	}

	// Build graph: nodes=stations, edges=rides along lines with attribute lineId and hop cost, with type filtering
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

	function better(aTr, aSt, bTr, bSt) {
		// return true if (aTr,aSt) is strictly better than (bTr,bSt) under selected priority
		const pr = getPriority();
		if (pr === 'stops') {
			return (aSt < bSt) || (aSt === bSt && aTr < bTr);
		}
		// default: transfers priority
		return (aTr < bTr) || (aTr === bTr && aSt < bSt);
	}

	function dominates(aTr, aSt, bTr, bSt) {
		// return true if (aTr,aSt) is as good or better than (bTr,bSt) under selected priority
		const pr = getPriority();
		if (pr === 'stops') {
			return (aSt < bSt) || (aSt === bSt && aTr <= bTr);
		}
		return (aTr < bTr) || (aTr === bTr && aSt <= bSt);
	}

	const BIG_M = 1000000;
	function weightOf(tr, st) {
		const pr = getPriority();
		if (pr === 'stops') return st * BIG_M + tr;
		return tr * BIG_M + st;
	}

	function findRoutes(src, dst, maxResults=3) {
		if (!src || !dst || src===dst) return [];
		const adj = buildGraph();
		// Dijkstra variant z elastycznym priorytetowaniem (przesiadki vs przystanki)
		const stateKey = (node, lastLine) => `${node}|${lastLine || ''}`;
		const pq = []; // min-heap: [weight, transfers, steps, node, prevStateKey, lastLine]
		const best = new Map(); // stateKey -> bestWeight
		const parents = new Map(); // stateKey -> { prevKey: string|null, node: string, line: string|null }
		pq.push([weightOf(0,0), 0, 0, src, null, null]);

		while (pq.length) {
			// pop min według aktywnego priorytetu
			pq.sort((a,b)=> a[0]-b[0]);
			const [w, tr, stp, u, prevKey, pl] = pq.shift();
			const sk = stateKey(u, pl);
			const curW = best.get(sk);
			if (curW !== undefined && curW <= w) continue;
			best.set(sk, w);
			parents.set(sk, { prevKey, node: u, line: pl });
			if (u === dst) { var dstKey = sk; break; }
			const edges = adj.get(u) || [];
			for (const {to, lineId} of edges) {
				// Skipped rules: cannot board a line at a skipped station; cannot transfer to/from skipped;
				// and cannot end at dst if dst is skipped on that line.
				if (pl === null) {
					if (isSkipped(lineId, u)) continue; // start cannot be skipped for the chosen line
				} else if (pl !== lineId) {
					if (isSkipped(pl, u) || isSkipped(lineId, u)) continue; // no transfer to/from skipped
				}
				if (to === dst && isSkipped(lineId, to)) continue; // cannot alight at dst skipped by the line
				const addTr = (pl && pl !== lineId) ? 1 : 0;
				const nt = tr + addTr;
				const ns = stp + 1;
				const vKey = stateKey(to, lineId);
				const nw = weightOf(nt, ns);
				const vBestW = best.get(vKey);
				if (vBestW === undefined || nw < vBestW) {
					pq.push([nw, nt, ns, to, sk, lineId]);
				}
			}
		}

		if (!dstKey) return [];
		// reconstruct path from dst state back to a source state
		const path = [];
		let walkKey = dstKey;
		while (walkKey) {
			const nodeInfo = parents.get(walkKey);
			if (!nodeInfo) break;
			const prevInfo = nodeInfo.prevKey ? parents.get(nodeInfo.prevKey) : null;
			if (prevInfo && nodeInfo.line) {
				path.push({ to: nodeInfo.node, from: prevInfo.node, lineId: nodeInfo.line });
			}
			walkKey = nodeInfo.prevKey;
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
		// simple heuristic: generate up to (maxResults-1) alternatives by excluding lines from the first route
		const alts = [];
		// build a set of lines from the first route
		const firstLines = new Set(first.legs.map(l => l.lineId));
		for (const lineId of Array.from(firstLines)) {
			if (alts.length >= maxResults - 1) break;
			// temporarily exclude this line and recompute
			const saved = lines[lineId];
			delete lines[lineId];
			const adj2 = buildGraph();
			// short dijkstra copy-paste (for simplicity)
			const pq = [[weightOf(0,0),0,0,src,null,null]]; const best = new Map(); const parents = new Map();
			while (pq.length) {
				pq.sort((a,b)=> a[0]-b[0]);
				const [w, tr, stp, u, prevKey, pl] = pq.shift();
				const sk = stateKey(u, pl);
				const curW = best.get(sk);
				if (curW !== undefined && curW <= w) continue;
				best.set(sk, w); parents.set(sk, { prevKey, node:u, line:pl }); if (u===dst) { var dstKey2 = sk; break; }
				const edges = adj2.get(u) || [];
				for (const {to, lineId:lid} of edges) {
					// apply the same skipped rules for alternatives
					if (pl === null) {
						if (isSkipped(lid, u)) continue;
					} else if (pl !== lid) {
						if (isSkipped(pl, u) || isSkipped(lid, u)) continue;
					}
					if (to === dst && isSkipped(lid, to)) continue;
					const addTr=(pl&&pl!==lid)?1:0; const nt=tr+addTr; const ns=stp+1; const nw=weightOf(nt,ns); const vKey=stateKey(to,lid); const cb=best.get(vKey);
					if (cb === undefined || nw < cb) pq.push([nw, nt, ns, to, sk, lid]);
				}
			}
			if (dstKey2) {
				const path=[]; let w=dstKey2; while (w){ const ni=parents.get(w); if(!ni) break; const pi = ni.prevKey ? parents.get(ni.prevKey) : null; if (pi && ni.line){ path.push({to:ni.node, from:pi.node, lineId:ni.line}); } w = ni.prevKey; }
				path.reverse();
				const legs2=[]; let curLeg=null; for (const step of path){ if(!curLeg||curLeg.lineId!==step.lineId){ if(curLeg) legs2.push(curLeg); curLeg={lineId:step.lineId, stations:[step.from, step.to]}; } else { const last=curLeg.stations[curLeg.stations.length-1]; if(last!==step.to) curLeg.stations.push(step.to);} }
				if (curLeg) legs2.push(curLeg);
				alts.push({ transfers: legs2.length-1, steps: path.length, legs: legs2 });
			}
			lines[lineId] = saved; // restore
		}
		// deduplicate routes by sequence of legs and stations
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
				// For IC, hide intermediate stations marked as skipped
				const seq = lg.typeKey === 'IC'
					? lg.stations.filter((s, i) => {
							const isEnd = (i === 0) || (i === lg.stations.length - 1);
							return isEnd || !isSkipped(lg.id, s);
						})
					: lg.stations;
				const stationsHtml = seq.map((s, i) => {
					const label = stations[s]?.name || s;
					if (lg.typeKey === 'IC') {
						// For IC we don't render skipped at all, so no class
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
			return `<div class=\"itinerary${isSel ? ' selected' : ''}\" id=\"itinerary-${idx}\" data-index=\"${idx}\" style=\"--route-color:${routeColor}\" role=\"listitem\" aria-selected=\"${isSel}\" tabindex=\"0\">${header}${body}${footer}</div>`;
		}).join('');
		resultsEl.innerHTML = `<div class=\"results-grid\" role=\"list\">${htmlCards}</div>`;
		// Color the dots in pills according to the line color
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
		// Highlight the selected route on the map
		window.dispatchEvent(new CustomEvent('route:highlight', { detail: { legs: r.legs } }));
		// Mark alighting stops
		document.querySelectorAll('.station-marker.highlight-stop').forEach(el => el.classList.remove('highlight-stop'));
		// Remove previous important station markings
		document.querySelectorAll('.station-marker.important').forEach(el => el.classList.remove('important'));
		r.legs.forEach(leg => {
			const alight = leg.stations[leg.stations.length - 1];
			const el = document.querySelector(`.station-marker[data-station-id="${alight}"]`);
			if (el) el.classList.add('highlight-stop');
		});
		// Mark as important: boarding and alighting stations of each segment (transfers), and endpoints (start/dest)
		const firstLeg = r.legs[0];
		const lastLeg = r.legs[r.legs.length - 1];
		const importantIds = new Set();
		if (firstLeg) importantIds.add(firstLeg.stations[0]); // start
		if (lastLeg) importantIds.add(lastLeg.stations[lastLeg.stations.length - 1]); // dest
		r.legs.forEach(leg => {
			importantIds.add(leg.stations[0]);   // boarding point (may be a transfer or start)
			importantIds.add(leg.stations[leg.stations.length - 1]); // alighting point (may be a transfer or destination)
		});
		importantIds.forEach(id => {
			const el = document.querySelector(`.station-marker[data-station-id="${id}"]`);
			if (el) el.classList.add('important');
		});
		// Update ARIA selected and selected class on cards
		resultsEl.querySelectorAll('.itinerary').forEach((el) => {
			const i = Number(el.getAttribute('data-index'));
			const isSel = i === selectedIndex;
			el.classList.toggle('selected', isSel);
			el.setAttribute('aria-selected', String(isSel));
		});
		// Focus selected card without scrolling the list
		const selCard = resultsEl.querySelector(`.itinerary[data-index="${selectedIndex}"]`);
		if (selCard) {
			selCard.focus({ preventScroll: true });
		}
		// Smoothly scroll the map section into view for immediate context
		const mapTarget = document.querySelector('#map-viewport') || document.querySelector('.map-section');
		if (mapTarget && mapTarget.scrollIntoView) {
			mapTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
		// Fit the map view to the entire route
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

	// when theme changes, refresh results (pill colors)
	const moTheme = new MutationObserver(() => {
		// refresh currently rendered results without changing content (recolor)
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

	// Update URL when layers change (to keep q and layers in sync)
	window.addEventListener('layers:changed', () => {
		const src = parseStation(fromInput.value);
		const dst = parseStation(toInput.value);
		const lmask = getLayersMask();
		writeLayersParamFromMask(lmask);
		if (src && dst) {
			updateURL(sp => { sp.set('q', encodeRouteStateQ(src, dst)); });
		}
	});

	function runSearch() {
		const src = parseStation(fromInput.value);
		const dst = parseStation(toInput.value);
		if (!src || !dst) { resultsEl.textContent = 'Wybierz poprawne stacje.'; return; }
		// clear previous important station markings
		document.querySelectorAll('.station-marker.important').forEach(el => el.classList.remove('important'));
		currentRoutes = findRoutes(src, dst, 3);
		selectedIndex = 0;
		renderResults(currentRoutes);
		if (currentRoutes.length) {
			selectRoute(0);
		}
		// update URL (only ids), remove station param
		updateURL(sp => {
			// single packed param
			sp.set('q', encodeRouteStateQ(src, dst));
			// cleanup legacy
			['station','st','from','to','types','prio','sel','f','t','ty','p','s'].forEach(k=>sp.delete(k));
		});
	}

	searchBtn?.addEventListener('click', runSearch);
	// react to filter changes; don't allow unchecking all
	typeCheckboxes.forEach(cb => {
		cb.addEventListener('change', () => {
			// enforce min. 1
			const checked = typeCheckboxes.filter(x => x.checked);
			if (checked.length === 0) {
				cb.checked = true;
				return;
			}
			refreshTypeFiltersSummary();
			// recompute results if both station fields are set
			// and clear previous important station markings
			document.querySelectorAll('.station-marker.important').forEach(el => el.classList.remove('important'));
			if (fromInput.value && toInput.value) runSearch();
			// send event to viewer.js to filter drawing
			const allowed = new Set(typeCheckboxes.filter(x => x.checked).map(x => x.dataset.type));
			window.dispatchEvent(new CustomEvent('lines:visibility', { detail: { allowed: Array.from(allowed) } }));
			// update packed q if both endpoints are present; otherwise keep ty for shareable partial state
			const src = parseStation(fromInput.value);
			const dst = parseStation(toInput.value);
			if (src && dst) {
				updateURL(sp => { sp.set('q', encodeRouteStateQ(src, dst)); ['ty','types'].forEach(k=>sp.delete(k)); });
			} else {
				updateURL(sp => {
					const ty = encodeSelectedTypesBits();
					if (ty && ty !== '15') sp.set('ty', ty); else sp.delete('ty');
					sp.delete('types');
				});
			}
		});
	});
	swapBtn?.addEventListener('click', () => {
		const a = fromInput.value; fromInput.value = toInput.value; toInput.value = a;
		// reset route selection and URL (station->null, sel->0)
		updateURL(sp => {
			const src = parseStation(fromInput.value);
			const dst = parseStation(toInput.value);
			sp.delete('station'); sp.delete('st');
			if (src && dst) {
				selectedIndex = 0;
				sp.set('q', encodeRouteStateQ(src, dst));
				['f','t','from','to','sel','s'].forEach(k=>sp.delete(k));
			} else {
				if (src) sp.set('f', src); else sp.delete('f');
				if (dst) sp.set('t', dst); else sp.delete('t');
				sp.set('s', '0'); sp.delete('sel'); sp.delete('from'); sp.delete('to'); sp.delete('q');
			}
		});
	});
	[fromInput, toInput].forEach(el => el.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') runSearch();
	}));

	// Station search handling
	stationSearchBtn?.addEventListener('click', focusStation);
	stationInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') focusStation(); });
	stationClearBtn?.addEventListener('click', () => {
		if (stationInput) stationInput.value = '';
		// remove station highlight
		document.querySelectorAll('.station-marker.highlighted-station').forEach(el => el.classList.remove('highlighted-station'));
		// remove station from URL
		updateURL(sp => { sp.delete('station'); sp.delete('st'); sp.delete('q'); });
	});

	// Delegate click on the "Choose" button
	resultsEl.addEventListener('click', (e) => {
		const target = e.target;
    
		// click on the button
		const btn = target && target.closest ? target.closest('.btn-choose') : null;
		if (btn) {
			const idx = Number(btn.getAttribute('data-index'));
			if (Number.isFinite(idx)) {
				selectRoute(idx);
				renderResults(currentRoutes);
				// update sel in URL
				updateURL(sp => { sp.set('sel', String(idx)); });
			}
			return;
		}
		// click on the card
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

	// Keyboard: Enter/Space choose a card; arrows change selection
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

	// Parse URL at load (route/station/types/sel)
	(function applyURLAtLoad() {
		const url = new URL(window.location.href);
		const sp = url.searchParams;
		// packed q has priority
		const q = sp.get('q');
		if (q && tryApplyQ(q)) return;
		// priority
		const pr = sp.get('p') || sp.get('prio');
		if (pr) setPriorityFromParam(pr === 's' ? 'stops' : pr === 't' ? 'transfers' : pr);
		refreshPrioritySummary();
		// types
		const typesParam = sp.get('ty') || sp.get('types');
		if (typesParam) {
			applyTypesFromParam(typesParam);
		}
		refreshTypeFiltersSummary();
		// station-only
		const stParam = sp.get('st') || sp.get('station');
		if (stParam) {
			const id = parseStation(stParam) || stParam.toUpperCase();
			if (stations[id]) {
				if (stationInput) stationInput.value = formatStationValue(id);
				// delay focusStation to next frame so DOM is ready
				setTimeout(() => focusStation(), 0);
			}
		}
		// route
		const f = sp.get('f') || sp.get('from');
		const t = sp.get('t') || sp.get('to');
		if (f && t) {
			const fid = parseStation(f) || f.toUpperCase();
			const tid = parseStation(t) || t.toUpperCase();
			if (stations[fid]) fromInput.value = formatStationValue(fid); else fromInput.value = f;
			if (stations[tid]) toInput.value = formatStationValue(tid); else toInput.value = t;
			setTimeout(() => {
				runSearch();
				const sel = parseInt(sp.get('s') || sp.get('sel') || '0', 10);
				if (Number.isFinite(sel) && currentRoutes[sel]) {
					selectRoute(sel);
					renderResults(currentRoutes);
				}
			}, 0);
		}
	})();

	// Clear route search
	const routeClearBtn = document.getElementById('route-clear');
	routeClearBtn?.addEventListener('click', () => {
		if (fromInput) fromInput.value = '';
		if (toInput) toInput.value = '';
		// clear results
		currentRoutes = [];
		selectedIndex = 0;
		resultsEl.textContent = '';
		// remove highlights and important stations
		window.dispatchEvent(new CustomEvent('route:highlight', { detail: { legs: [] } }));
		document.querySelectorAll('.station-marker.highlight-stop').forEach(el => el.classList.remove('highlight-stop'));
		document.querySelectorAll('.station-marker.important').forEach(el => el.classList.remove('important'));
		// clear route params in URL (and any station-only param to avoid stale state)
		updateURL(sp => { ['from','to','sel','station','prio','f','t','s','st','p','ty','types'].forEach(k=>sp.delete(k)); });
	});

	// React to priority changes
	[prioTransfers, prioStops].forEach((el) => {
		if (!el) return;
		el.addEventListener('change', () => {
			setPriorityFromUI();
			refreshPrioritySummary();
			// recompute if both endpoints selected
			if (fromInput.value && toInput.value) {
				runSearch();
			} else {
				// update URL prio only
				updateURL(sp => { sp.set('p', getPriority() === 'stops' ? 's' : 't'); sp.delete('prio'); });
			}
		});
	});

	// Init summaries
	refreshTypeFiltersSummary();
	refreshPrioritySummary();
})();
