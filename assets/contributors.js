(function () {
    // Simple accessible modal that loads contributors.md and renders as preformatted text (Markdown kept as-is)
    const openBtn = document.getElementById("contributors-open");
    const modal = document.getElementById("contributors-modal");
    const overlay = document.getElementById("contributors-overlay");
    const content = document.getElementById("contributors-content");
    const titleEl = document.getElementById("contributors-title");
    const closeBtn = document.getElementById("contributors-close");
    if (!openBtn || !modal || !overlay || !content || !closeBtn) return;

    let lastActive = null;

    async function loadContributors() {
        try {
            const res = await fetch("/contributors.md", { cache: "no-store" });
            if (!res.ok) throw new Error("HTTP " + res.status);
            const raw = await res.text();
            // Split lines; first non-empty line becomes modal title (strip leading markdown #)
            const lines = raw.split(/\r?\n/);
            let first = lines.length ? lines[0] : "";
            if (/^\s*#/.test(first)) first = first.replace(/^\s*#+\s*/, "");
            const body = lines.slice(1).join("\n");
            if (titleEl) titleEl.textContent = first || "Autorzy i wkład";
            // Minimal MD-to-HTML for body
            const html = body
                .replace(/^## (.*)$/gm, "<h3>$1</h3>")
                .replace(/^\- (.*)$/gm, "<li>$1</li>")
                .replace(/(^|\n)(<li>)/g, "$1<ul>$2")
                .replace(/(<\/li>)(?!\n<li>)/g, "$1</ul>");
            content.innerHTML = html.trim();
        } catch (e) {
            content.textContent = "Nie udało się wczytać listy autorów.";
        }
    }

    function open() {
        lastActive = document.activeElement;
        modal.classList.add("open");
        overlay.classList.add("open");
        modal.setAttribute("aria-hidden", "false");
        overlay.setAttribute("aria-hidden", "false");
        // load content on first open
        if (!content.getAttribute("data-loaded")) {
            loadContributors().then(() =>
                content.setAttribute("data-loaded", "1")
            );
        }
        // focus the close button
        closeBtn.focus();
        document.body.classList.add("no-scroll");
    }
    function close() {
        modal.classList.remove("open");
        overlay.classList.remove("open");
        modal.setAttribute("aria-hidden", "true");
        overlay.setAttribute("aria-hidden", "true");
        document.body.classList.remove("no-scroll");
        if (lastActive && lastActive.focus) {
            try {
                lastActive.focus();
            } catch {}
        }
    }

    function onKey(e) {
        if (e.key === "Escape") {
            close();
        }
    }
    function onOverlay(e) {
        if (e.target === overlay) {
            close();
        }
    }

    openBtn.addEventListener("click", open);
    closeBtn.addEventListener("click", close);
    overlay.addEventListener("click", onOverlay);
    document.addEventListener("keydown", onKey);
})();
