(function(){
	const el = document.getElementById('mc-status');
	if (!el) return;
	const text = el.querySelector('.text');
	// Serwer Java – konfiguracja z atrybutów data-*, jeśli podane
	const HOST = (el.dataset && el.dataset.host) ? String(el.dataset.host) : 'kibel.csrv.gg';
	const FORCED_PORT = (el.dataset && el.dataset.port) ? String(el.dataset.port) : null;
	// Serwer Java – sprawdzamy kilku dostawców oraz wariant z/bez portu
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
		// Filtruj dostępne i online
		const online = cands.filter(c => c && c.online);
		if (online.length === 0) return null;
		// Najpierw odrzuć rekordy z max<=1 (częsty artefakt błędnego pingu), jeśli są inne opcje
		const nonTrivial = online.filter(c => c.maxPlayers === null || c.maxPlayers > 1);
		const pool = nonTrivial.length ? nonTrivial : online;
		// Preferuj największe players.online, a przy remisie taki z sensownym max
		pool.sort((a, b) => {
			const ao = a.onlinePlayers ?? -1;
			const bo = b.onlinePlayers ?? -1;
			if (bo !== ao) return bo - ao;
			const as = (a.maxPlayers ?? 0) <= 1 ? 0 : 1;
			const bs = (b.maxPlayers ?? 0) <= 1 ? 0 : 1;
			if (bs !== as) return bs - as;
			// prefer mcstatus, potem mcsrvstat
			const prio = { mcstatus: 2, mcsrvstat: 1 };
			return (prio[b.source]||0) - (prio[a.source]||0);
		});
		return pool[0];
	}

	function looksSuspicious(online, max) {
		if (max !== null && max <= 1) return true; // bardzo mały limit to częsty artefakt
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
		try {
			if (text) text.textContent = 'Sprawdzanie statusu…';
			el.classList.remove('online','offline');

			// Pobierz równolegle warianty Java (z/bez portu) i wybierz sensowną odpowiedź
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

	// pierwszy strzał + odświeżanie co 60 s
	check();
	setInterval(check, 60000);
})();
