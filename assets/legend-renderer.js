// renamed from legend.js
(async function(){
	const el = document.getElementById('legend');
	if (!el) return;

	/** @type {Record<string, {color?:string|null, hexLightMode?:string|null, hexDarkMode?:string|null, category?:string, relation?:string, stations?:string[]}>} */
	let lines = {};
	/** @type {Set<string>} */
	let allowedTypes = new Set(['REGIO','METRO','ON_DEMAND','IC']);

	function isDark(){
		return document.documentElement.getAttribute('data-theme') === 'dark';
	}

	function colorFromName(name){
		const colorMap = {
			Red: '#d32f2f', Pink: '#e91e63', Blue: '#1976d2', Green: '#388e3c',
			White: '#ffffff', Black: '#000000', Grey: '#757575', Gray: '#757575',
			Brown: '#6d4c41', Lime: '#cddc39', Yellow: '#fbc02d', Cyan: '#00bcd4',
			Purple: '#7b1fa2', 'Light Blue': '#03a9f4', 'Light blue': '#03a9f4',
			Magenta: '#d81b60', 'Light gray': '#bdbdbd', 'Light grey': '#bdbdbd',
			Orange: '#ff9800', Birch: '#c0a16b', Warped: '#673ab7', Accacia: '#9ccc65',
			Cherry: '#c2185b', Oak: '#795548', Mangrove: '#2e7d32', Jungle: '#43a047'
		};
		return colorMap[name] || '#999';
	}

	function getLineColor(line){
		if (isDark() && line?.hexDarkMode) return String(line.hexDarkMode);
		if (!isDark() && line?.hexLightMode) return String(line.hexLightMode);
		if (line?.hexLightMode) return String(line.hexLightMode);
		if (line?.hexDarkMode) return String(line.hexDarkMode);
		return colorFromName(line?.color);
	}

	function typeKeyFor(id, line){
		const cat = String(line?.category || '').toUpperCase();
		if (cat.includes('METRO')) return 'METRO';
		if (cat.includes('IC')) return 'IC';
		if (id.startsWith('NŻ') || cat.includes('ON')) return 'ON_DEMAND';
		return 'REGIO';
	}

	function section(title, arr){
		const items = arr.map(([id, line]) => {
			const col = getLineColor(line);
			let rel = line.relation || '';
			if (typeof rel === 'string') rel = rel.split(/\n|\r/)[0];
			return `<div class="legend-item"><span class="legend-line" style="border-top-color:${col}"></span><span>${id}: ${rel}</span></div>`;
		}).join('');
		return `<div class="legend-group"><div class="legend-title">${title}</div><div class="legend-row">${items || '<span class="legend-empty">—</span>'}</div></div>`;
	}

	function render(){
		// Stations section
		const stationsGroup = `
			<div class="legend-group">
				<div class="legend-title">Stacje</div>
				<div class="legend-row">
					<div class="legend-item"><span class="legend-dot" style="background:#808080"></span><span>stacja pasażerska</span></div>
					<div class="legend-item"><span class="legend-dot" style="background:#444444; width:12px; height:12px; border-radius:2px;"></span><span>węzeł przesiadkowy</span></div>
					<div class="legend-item"><span class="legend-dot" style="background:#7b1fa2; width:8px; height:8px; display:inline-block; border-radius:2px; transform: rotate(45deg);"></span><span>możliwa przesiadka do Endu</span></div>
					<div class="legend-item"><span class="legend-dot" style="background:#d32f2f; width:12px; height:12px; border-radius:2px;"></span><span>stacja metra</span></div>
				</div>
			</div>`;

		// Group lines by type with filtering based on allowedTypes
		const groups = { REGIO: [], METRO: [], ON_DEMAND: [], IC: [] };
		Object.entries(lines).forEach(([id, line]) => {
			const key = typeKeyFor(id, line);
			if (allowedTypes.has(key)) groups[key].push([id, line]);
		});
		Object.values(groups).forEach(arr => arr.sort((a,b)=> a[0].localeCompare(b[0],'pl')));

		const parts = [stationsGroup];
		if (groups.REGIO.length) parts.push(section('Linie REGIO', groups.REGIO));
		if (groups.METRO.length) parts.push(section('Linie METRO', groups.METRO));
		if (groups.ON_DEMAND.length) parts.push(section('Linie NA ŻĄDANIE', groups.ON_DEMAND));
		if (groups.IC.length) parts.push(section('Linie INTERCITY', groups.IC));
		const html = parts.join('');
		el.innerHTML = html;
	}

	// Load and render
	try {
		const res = await fetch('assets/lines.json', { cache: 'no-store' });
		lines = await res.json();
		render();
		// React to theme changes to refresh colors
		const mo = new MutationObserver(render);
		mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
		// React to type filter changes (map and export page broadcast 'lines:visibility')
		window.addEventListener('lines:visibility', (ev) => {
			const arr = ev?.detail?.allowed;
			if (Array.isArray(arr) && arr.length) {
				allowedTypes = new Set(arr.map(String));
			} else {
				allowedTypes = new Set(['REGIO','METRO','ON_DEMAND','IC']);
			}
			render();
		});
	} catch (e) {
		// silently ignore
	}
})();
