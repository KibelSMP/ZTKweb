(function(){
  // Full-page outage banner until a configured date/time in Warsaw timezone.
  // Toggle showing the remaining time (countdown) and note below:
  const SHOW_TIME = false; // set to true to display time left and availability note
  // Target end time (Europe/Warsaw wall time). Format: YYYY-MM-DDTHH:mm[:ss]
  // Example: '2025-09-04T00:00:00' for midnight night 3/4 IX 2025.
  const TARGET_TIME = '2025-09-03T23:59:59';

  // Helper: parse 'YYYY-MM-DDTHH:mm[:ss]' into numbers
  function parseLocalIso(str){
    const m = String(str||'').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!m) return null;
    return {
      y: +m[1], mo: +m[2], d: +m[3], h: +m[4], mi: +m[5], s: +(m[6]||0)
    };
  }

  // Helper: get timezone offset minutes for given instant in a TZ (positive east of UTC)
  function tzOffsetMinutes(tz, instantMs){
    const d = new Date(instantMs);
    // Prefer shortOffset (e.g., GMT+2), fallback to short (GMT+02:00)
    let str = '';
    try { str = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset', hour12: false }).format(d); }
    catch {
      try { str = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short', hour12: false }).format(d); }
      catch { return 0; }
    }
    const m = str.match(/GMT\s*([+-]?\d{1,2})(?::?(\d{2}))?/i) || str.match(/UTC\s*([+-]?\d{1,2})(?::?(\d{2}))?/i);
    if (!m) return 0;
    const sign = m[1]?.startsWith('-') ? -1 : 1;
    const hh = Math.abs(parseInt(m[1]||'0',10)) || 0;
    const mm = parseInt(m[2]||'0',10) || 0;
    return sign * (hh*60 + mm);
  }

  // Convert Warsaw local wall time to absolute instant (ms since epoch)
  function warsawLocalToInstant(parts){
    const tz = 'Europe/Warsaw';
    // First guess: interpret as if UTC
    let guess = Date.UTC(parts.y, parts.mo-1, parts.d, parts.h, parts.mi, parts.s||0);
    // Compute offset at guessed instant and adjust
    let off1 = tzOffsetMinutes(tz, guess);
    let exact = guess - off1*60*1000;
    // Recompute once to handle DST boundaries
    const off2 = tzOffsetMinutes(tz, exact);
    if (off2 !== off1) exact = guess - off2*60*1000;
    return exact;
  }
  try {
  const now = new Date();
  // Determine target instant in Warsaw
  const parts = parseLocalIso(TARGET_TIME);
  const endMs = parts ? warsawLocalToInstant(parts) : (Date.now());
  const end = new Date(endMs);
  if (Date.now() >= endMs) return; // after target – no banner

    // Create overlay
    const overlay = document.createElement('div');
    overlay.id = 'outage-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-live', 'assertive');
    overlay.innerHTML = [
      '<div class="outage-box" role="document">',
      '  <div class="outage-icon" aria-hidden="true">⚠️</div>',
      '  <h1 class="outage-title">Przerwa w działaniu</h1>',
  '  <div class="outage-text">Ze względu na awarię serwera Minecraft, ZTKweb jest nieczynne.</div>',
      SHOW_TIME ? '  <div class="outage-countdown" aria-live="polite"></div>' : '',
  SHOW_TIME ? '  <div class="outage-note">Dostęp zostanie przywrócony po zakończeniu prac.</div>' : '',
      '</div>'
    ].join('');

    // Styles (scoped)
    const style = document.createElement('style');
    style.textContent = `
      #outage-overlay { position: fixed; inset: 0; z-index: 2000; display: grid; place-items: center; padding: 24px; background: color-mix(in oklab, var(--bg) 55%, #000 45%); }
      html[data-theme="dark"] #outage-overlay { background: color-mix(in oklab, var(--bg) 70%, #000 30%); }
      #outage-overlay .outage-box { max-width: 720px; width: 100%; border: 1px solid var(--border); border-radius: 14px; box-shadow: var(--shadow); background: var(--panel); color: var(--text); padding: 24px; text-align: center; -webkit-backdrop-filter: saturate(1.1) blur(6px); backdrop-filter: saturate(1.1) blur(6px); }
      #outage-overlay .outage-icon { font-size: 40px; margin-bottom: 10px; }
      #outage-overlay .outage-title { margin: 0 0 6px 0; font-size: 28px; }
      #outage-overlay .outage-text { font-size: 16px; color: var(--muted); margin-bottom: 10px; }
      #outage-overlay .outage-countdown { font-size: 18px; font-weight: 700; margin: 8px 0 2px; }
      #outage-overlay .outage-note { font-size: 13px; color: var(--muted); }
      body { overflow: hidden; }
    `;

    // Countdown + mount control
    const countdownEl = overlay.querySelector('.outage-countdown');
    let mounted = false;
    let iv = null;
    let tmo = null;
    function removeOverlay(){
      if (iv) { try { clearInterval(iv); } catch {} iv = null; }
      if (tmo) { try { clearTimeout(tmo); } catch {} tmo = null; }
      try { overlay.remove(); } catch {}
      try { if (style && style.parentNode) style.parentNode.removeChild(style); } catch {}
      document.body.style.overflow = '';
      mounted = false;
    }
    function updateCountdown(){
      const ms = endMs - Date.now();
      if (ms <= 0) { removeOverlay(); return; }
      if (!SHOW_TIME) return; // don't render text when disabled
      const s = Math.floor(ms / 1000) % 60;
      const m = Math.floor(ms / 60000) % 60;
      const h = Math.floor(ms / 3600000);
      if (countdownEl) countdownEl.textContent = `Pozostało: ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }
    function mountOverlay(){
      if (mounted) return;
      if (!navigator.onLine) return; // don't show when offline
      document.head.appendChild(style);
      document.body.appendChild(overlay);
      mounted = true;
      if (SHOW_TIME) {
        updateCountdown();
        iv = setInterval(() => {
          if (Date.now() >= endMs) { clearInterval(iv); iv = null; updateCountdown(); }
          else updateCountdown();
        }, 1000);
      } else {
        const ms = Math.max(0, endMs - Date.now());
        tmo = setTimeout(removeOverlay, ms);
      }
    }

    // Mount on load if online and before end time
    document.addEventListener('DOMContentLoaded', () => {
      if (Date.now() < endMs && navigator.onLine) mountOverlay();
    });

    // Respond to connectivity changes
    window.addEventListener('offline', () => { removeOverlay(); });
    window.addEventListener('online', () => { if (Date.now() < endMs) mountOverlay(); });
  } catch {}
})();
