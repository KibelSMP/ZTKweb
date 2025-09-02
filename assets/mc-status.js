(function(){
	const el = document.getElementById('mc-status');
	if (!el) return;
	const text = el.querySelector('.text');

	// Zarządzanie cyklicznym odświeżaniem i widocznością względem łączności
	let intervalId = null;
	function startTimer(){ if (!intervalId) intervalId = setInterval(check, 60000); }
	function stopTimer(){ if (intervalId){ clearInterval(intervalId); intervalId = null; } }
	function applyConnectivityState(){
		if (navigator.onLine) {
			// pokaż widżet i wykonaj natychmiastowy check
			el.hidden = false;
			check();
			startTimer();
		} else {
			// ukryj widżet offline i wstrzymaj odświeżanie
			stopTimer();
			el.hidden = true;
			el.classList.remove('online','offline');
			if (text) text.textContent = '';
		}
	}
	// Java server – configuration from data-* attributes, if provided
	const HOST = (el.dataset && el.dataset.host) ? String(el.dataset.host) : 'kibel.csrv.gg';
	const FORCED_PORT = (el.dataset && el.dataset.port) ? String(el.dataset.port) : null;
	// Java server – check multiple providers and variants with/without port
	const BASE_MCSRVS = 'https://api.mcsrvstat.us/2/';
	const BASE_MCSTATUS = 'https://api.mcstatus.io/v2/status/java/';
	function withNoCache(url) {
		const sep = url.includes('?') ? '&' : '?';
		return `${url}${sep}_=${Date.now()}`; // cache buster
	}
	function endpointsNow() {
		const hosts = FORCED_PORT ? [`${HOST}:${FORCED_PORT}`] : [HOST, `${HOST}:25565`];
		const urls = [];
		for (const h of hosts) {
			urls.push(withNoCache(`${BASE_MCSRVS}${h}`));
			urls.push(withNoCache(`${BASE_MCSTATUS}${h}`));
		}
		return urls;
	}

	function normalizeCandidate(raw, url) {
		if (!raw || typeof raw !== 'object') return null;
		const isMcSrv = url.includes('mcsrvstat.us');
		const isMcStatus = url.includes('mcstatus.io');
		try {
			if (isMcSrv) {
				return {
					source: 'mcsrvstat',
					url,
					online: !!raw.online,
					onlinePlayers: safeNumber(raw?.players?.online),
					maxPlayers: safeNumber(raw?.players?.max),
				};
			}
			if (isMcStatus) {
				return {
					source: 'mcstatus',
					url,
					online: !!raw.online,
					onlinePlayers: safeNumber(raw?.players?.online),
					maxPlayers: safeNumber(raw?.players?.max),
				};
			}
		} catch { /* no-op */ }
		return null;
	}

	function pickBest(cands) {
		// Filter available and online
		const online = cands.filter(c => c && c.online);
		if (online.length === 0) return null;
		// First discard records with max<=1 (common bad ping artifact) if other options exist
		const nonTrivial = online.filter(c => c.maxPlayers === null || c.maxPlayers > 1);
		const pool = nonTrivial.length ? nonTrivial : online;
		// Prefer highest players.online; if tie, prefer one with sensible max
		pool.sort((a, b) => {
			const ao = a.onlinePlayers ?? -1;
			const bo = b.onlinePlayers ?? -1;
			if (bo !== ao) return bo - ao;
			const as = (a.maxPlayers ?? 0) <= 1 ? 0 : 1;
			const bs = (b.maxPlayers ?? 0) <= 1 ? 0 : 1;
			if (bs !== as) return bs - as;
			// prefer mcstatus, then mcsrvstat
			const prio = { mcstatus: 2, mcsrvstat: 1 };
			return (prio[b.source]||0) - (prio[a.source]||0);
		});
		return pool[0];
	}

	function looksSuspicious(online, max) {
		if (max !== null && max <= 1) return true; // very small max is a common artifact
		if (online !== null && max !== null && online > max) return true;
		return false;
	}

	function safeNumber(v) { return typeof v === 'number' && isFinite(v) ? v : null; }

	async function fetchWithTimeout(url, ms = 5000) {
		const ctrl = new AbortController();
		const timer = setTimeout(() => ctrl.abort(), ms);
		try {
			const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
			if (!res.ok) throw new Error('HTTP ' + res.status);
			return await res.json();
		} finally {
			clearTimeout(timer);
		}
	}

	async function check() {
		// Nie próbuj odpytywać zewnętrznych API, gdy urządzenie jest offline
		if (!navigator.onLine) return;
		try {
			if (text) text.textContent = 'Sprawdzanie statusu…';
			el.classList.remove('online','offline');

			// Fetch Java variants (with/without port) in parallel and choose a sensible answer
			const urls = endpointsNow();
			const results = await Promise.allSettled(urls.map(u => fetchWithTimeout(u)));
			const normalized = results.map((r, i) => r.status === 'fulfilled' ? normalizeCandidate(r.value, urls[i]) : null);
			const best = pickBest(normalized);
			const isOnline = !!best;
			if (isOnline) {
				const onlinePlayers = best.onlinePlayers;
				const maxPlayers = best.maxPlayers;
				el.classList.add('online');
				if (onlinePlayers !== null && !looksSuspicious(onlinePlayers, maxPlayers)) {
					if (text) text.textContent = maxPlayers !== null
						? `Serwer online • ${onlinePlayers}/${maxPlayers} graczy`
						: `Serwer online • ${onlinePlayers} graczy`;
				} else {
					if (text) text.textContent = 'Serwer online';
				}
			} else {
				el.classList.add('offline');
				if (text) text.textContent = 'Serwer offline';
			}
		} catch (e) {
			el.classList.add('offline');
			if (text) text.textContent = 'Serwer offline';
		}
	}

	// Inicjalizacja i nasłuch zmian łączności
	applyConnectivityState();
	window.addEventListener('online', applyConnectivityState);
	window.addEventListener('offline', applyConnectivityState);
})();
