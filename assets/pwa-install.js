// Unobtrusive PWA install banner with per-system instructions
(() => {
  const NEVER_KEY = 'pwaInstall.never';
  const CLOSED_SESSION_KEY = 'pwaInstall.closedSession';
  const ls = window.localStorage;

  const isInstalled = () => {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  };

  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  const isAndroid = /Android/.test(ua);
  const isEdge = /Edg\//.test(ua);
  const isChrome = /Chrome\//.test(ua) && !isEdge && !/Brave\//.test(ua);
  const isFirefox = /Firefox\//.test(ua);
  const isMac = /Macintosh/.test(ua);
  const isSafari = /^((?!Chrome|Chromium|Edg|OPR|Brave).)*Safari\//.test(ua);
  const isMacSafari = isMac && isSafari;

  let deferredPrompt = null;

  function shouldShow() {
    if (isInstalled()) return false;
    if (ls.getItem(NEVER_KEY) === 'true') return false;
    if (sessionStorage.getItem(CLOSED_SESSION_KEY) === 'true') return false;
  // Do not show on Firefox (no native install support)
    if (isFirefox) return false;
    return true;
  }

  function buildInstructions() {
    if (isIOS) {
      return 'Na iOS: stuknij Udostępnij (ikona z kwadratem i strzałką) → Do ekranu początkowego.';
    }
    if (isAndroid && deferredPrompt) {
      return 'Na Androidzie: kliknij Zainstaluj, aby dodać aplikację.';
    }
    if (isAndroid) {
      return 'Na Androidzie: kliknij ⋮ w przeglądarce → Zainstaluj aplikację.';
    }
    if (isMacSafari) {
      return 'Na macOS Safari: Udostępnij → Dodaj do Docka.';
    }
    if (isEdge) {
      return 'W Edge: menu … → Aplikacje → Zainstaluj tę witrynę jako aplikację.';
    }
    if (isChrome) {
      return 'W Chrome: kliknij ikonę instalacji w pasku adresu lub menu ⋮ → Zainstaluj ZTKweb.';
    }
    return 'Zainstaluj jako aplikację z menu przeglądarki, aby działała w trybie pełnoekranowym i offline.';
  }

  function createBanner() {
    const banner = document.createElement('div');
    banner.className = 'pwa-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-live', 'polite');

    const content = document.createElement('div');
    content.className = 'pwa-banner-content';

    const textBox = document.createElement('div');
    textBox.className = 'pwa-banner-text';
    const title = document.createElement('strong');
    title.textContent = 'Zainstaluj ZTKweb';
    const desc = document.createElement('div');
    desc.className = 'pwa-banner-desc';
    desc.textContent = 'Szybszy start, tryb pełnoekranowy i dostęp offline.';
    const how = document.createElement('div');
    how.className = 'pwa-banner-how';
    how.textContent = buildInstructions();
    textBox.appendChild(title);
    textBox.appendChild(desc);
    textBox.appendChild(how);

    const actions = document.createElement('div');
    actions.className = 'pwa-banner-actions';

    let installBtn = null;
    if (deferredPrompt && (isAndroid || isChrome || isEdge)) {
      installBtn = document.createElement('button');
      installBtn.className = 'btn-primary';
      installBtn.textContent = 'Zainstaluj';
      installBtn.addEventListener('click', async () => {
        try {
          deferredPrompt.prompt();
          const { outcome } = await deferredPrompt.userChoice;
          deferredPrompt = null;
          if (outcome === 'accepted') {
            hideBanner(true);
          } else {
            // no-op, user might have closed — keep option to retry
          }
        } catch {}
      });
      actions.appendChild(installBtn);
    }

    const neverLabel = document.createElement('label');
    neverLabel.className = 'pwa-banner-never';
    const never = document.createElement('input');
    never.type = 'checkbox';
    never.addEventListener('change', () => {
      if (never.checked) ls.setItem(NEVER_KEY, 'true');
      else ls.removeItem(NEVER_KEY);
    });
    neverLabel.appendChild(never);
    neverLabel.appendChild(document.createTextNode(' Nie pokazuj ponownie'));

  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn btn-secondary pwa-close-text';
    closeBtn.textContent = 'Zamknij';
    closeBtn.addEventListener('click', () => hideBanner(false));

    actions.appendChild(closeBtn);
    actions.appendChild(neverLabel);

    const xBtn = document.createElement('button');
    xBtn.className = 'pwa-banner-close';
    xBtn.setAttribute('aria-label', 'Zamknij');
    xBtn.textContent = '×';
    xBtn.addEventListener('click', () => hideBanner(false));

    content.appendChild(textBox);
    content.appendChild(actions);
    banner.appendChild(content);
    banner.appendChild(xBtn);

  document.body.appendChild(banner);

    function hideBanner(installed) {
      banner.classList.add('hide');
      sessionStorage.setItem(CLOSED_SESSION_KEY, 'true');
      if (installed) ls.setItem(NEVER_KEY, 'true');
      setTimeout(() => banner.remove(), 250);
    }

    return banner;
  }

  // Main logic
  if (!shouldShow()) return;

  window.addEventListener('appinstalled', () => {
    ls.setItem(NEVER_KEY, 'true');
  });

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (!document.querySelector('.pwa-banner')) createBanner();
  });

  // On iOS/Safari and browsers without beforeinstallprompt — show after a short delay
  window.addEventListener('load', () => {
    setTimeout(() => {
      if (!document.querySelector('.pwa-banner') && shouldShow()) {
        createBanner();
      }
    }, 1500);
  });
})();
