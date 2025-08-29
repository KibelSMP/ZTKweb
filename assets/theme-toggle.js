// renamed from theme.js
(function(){
	const key = 'ztk-theme';
	const root = document.documentElement;
	function apply(theme){ root.setAttribute('data-theme', theme); }
	function getPreferred(){
		const saved = localStorage.getItem(key);
		if (saved === 'dark' || saved === 'light') return saved;
		return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
	}
	let current = getPreferred();
	apply(current);
	const btn = document.getElementById('theme-toggle');
	if (btn) btn.addEventListener('click', () => {
		current = current === 'dark' ? 'light' : 'dark';
		localStorage.setItem(key, current);
		apply(current);
	});
	try {
		if (window.matchMedia) {
			const mq = window.matchMedia('(prefers-color-scheme: dark)');
			mq.addEventListener('change', () => {
				const saved = localStorage.getItem(key);
				if (saved !== 'dark' && saved !== 'light') {
					current = mq.matches ? 'dark' : 'light';
					apply(current);
				}
			});
		}
	} catch {}
})();
// Przełącznik widoku satelitarnego mapy
(function(){
	const btn = document.getElementById('sat-toggle');
	const map = document.getElementById('map');
	if (!btn || !map) return;
	const key = 'ztk-satellite';
	try {
		const saved = localStorage.getItem(key);
		const on = saved === '1' || saved === 'true';
		if (on) {
			map.classList.add('satellite-active');
			btn.setAttribute('aria-pressed', 'true');
		}
	} catch {}
	btn.addEventListener('click', () => {
		const active = map.classList.toggle('satellite-active');
		btn.setAttribute('aria-pressed', active ? 'true' : 'false');
		try { localStorage.setItem(key, active ? '1' : '0'); } catch {}
	});
})();
