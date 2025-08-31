(function () {
    // Harmonogram promocji: wczytaj JSON i ustaw obrazek/link
    async function loadPromotions() {
        const remoteUrl = "https://raw.githubusercontent.com/KibelSMP/ZTKweb-promotions/refs/heads/main/promotions.json";
        // 1) Spróbuj zdalny JSON
        try {
            const res = await fetch(remoteUrl, { cache: "no-store" });
            if (!res.ok) throw new Error("HTTP " + res.status);
            const data = await res.json();
            return Array.isArray(data?.items) ? data.items : [];
        } catch (e) {
            // 2) Fallback do lokalnego pliku (offline lub awaria zdalnego)
            try {
                const resLocal = await fetch("assets/promotions.json", { cache: "no-store" });
                if (!resLocal.ok) throw new Error("HTTP " + resLocal.status);
                const dataLocal = await resLocal.json();
                return Array.isArray(dataLocal?.items) ? dataLocal.items : [];
            } catch {
                return [];
            }
        }
    }
    function nowUTC() {
        return new Date();
    }
    function isActive(item, now) {
        try {
            const s = item.startsAt ? new Date(item.startsAt) : null;
            const e = item.endsAt ? new Date(item.endsAt) : null;
            if (s && now < s) return false;
            if (e && now > e) return false;
            return true;
        } catch {
            return false;
        }
    }
    function pickActive(items) {
        const now = nowUTC();
        const active = items.filter((it) => isActive(it, now));
        if (!active.length) return null;
    // sort by priority descending, then by latest endsAt, then by id
        active.sort((a, b) => {
            const pa = Number(a.priority ?? 0),
                pb = Number(b.priority ?? 0);
            if (pb !== pa) return pb - pa;
            const ea = a.endsAt ? Date.parse(a.endsAt) : 0;
            const eb = b.endsAt ? Date.parse(b.endsAt) : 0;
            if (eb !== ea) return eb - ea;
            return String(a.id || "").localeCompare(String(b.id || ""));
        });
        return active[0];
    }
    function applyPromo(promo) {
        const container = document.querySelector(".promo-slot");
        const link = document.getElementById("promo-link");
        const img = container ? container.querySelector("img") : null;
        if (!container || !link || !img) return;
        if (!promo) {
            // fallback do domyślnego pliku (bez wersjonowania)
            img.src = "assets/promo-default.png";
            img.alt = "Promocja";
            link.href =
                "https://discord.com/channels/865183769626279966/940688602667569202";
            return;
        }
        const src = promo.image || "assets/promo-default.png";
        img.src = src;
        img.alt = promo.alt || promo.title || "Promocja";
        if (promo.link) link.href = promo.link;
        if (promo.title) img.title = promo.title;
    }
    async function init() {
        const items = await loadPromotions();
        const current = pickActive(items);
        applyPromo(current);
    }
    // uruchom po załadowaniu DOM
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
