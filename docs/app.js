/* FADERDECK — DOWNLOADS E NAVEGAÇÃO DA LANDING
 * URLs literais e IDs preservados para manter a seleção automática existente.
 */
const WINDOWS_URL =
  'https://github.com/Paylo4002ansatsu/FaderDeck/releases/download/1.0.8/FaderDeck-Windows-Setup.exe';
const MACOS_URL =
  'https://github.com/Paylo4002ansatsu/FaderDeck/releases/download/1.0.8/FaderDeck-Mac.dmg';
const MACOS_MONTEREY_URL =
  'https://github.com/Paylo4002ansatsu/FaderDeck/releases/download/1.0.8/FaderDeck-Mac-Monterey-Intel.dmg';

const icons = {
  windows:
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M2 4.8 10 3.7v7.7H2V4.8Zm9.1-1.3L22 1.8v9.6H11.1V3.5ZM2 12.7h8v7.7L2 19.3v-6.6Zm9.1 0H22v9.6l-10.9-1.5v-8.1Z"/></svg>',
  apple:
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.37 12.22c.02 2.29 2.01 3.05 2.03 3.06-.02.05-.32 1.1-1.05 2.17-.63.92-1.28 1.83-2.31 1.85-1.01.02-1.34-.6-2.5-.6-1.15 0-1.51.58-2.47.62-1 .04-1.77-.99-2.41-1.9-1.31-1.9-2.31-5.37-.96-7.72.67-1.17 1.87-1.91 3.17-1.93.99-.02 1.92.67 2.52.67.59 0 1.71-.83 2.89-.71.49.02 1.87.2 2.76 1.5-.07.04-1.65.97-1.67 2.99ZM14.47 5.8c.53-.64.89-1.53.79-2.42-.77.03-1.7.51-2.25 1.15-.5.57-.94 1.48-.82 2.35.86.07 1.74-.44 2.28-1.08Z"/></svg>',
  download:
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v11m0 0 4-4m-4 4-4-4M5 17v3h14v-3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

const platformDetection = window.FaderDeckPlatformDetection;

function setAnchorTarget(anchor, href, available = true) {
  if (!anchor) return;
  anchor.classList.toggle('is-unavailable', !available);
  if (!available) {
    anchor.removeAttribute('href');
    anchor.setAttribute('aria-disabled', 'true');
    anchor.setAttribute('tabindex', '-1');
    return;
  }
  anchor.href = href;
  anchor.removeAttribute('aria-disabled');
  anchor.removeAttribute('tabindex');
}

async function setupSmartDownload() {
  const button = document.getElementById('smart-download');
  const label = document.getElementById('smart-download-label');
  const icon = document.getElementById('smart-download-icon');
  if (!button || !label || !icon || !platformDetection) return;

  const navigatorRef = window.navigator;
  const platform = platformDetection.detectPlatform(navigatorRef);
  let windowsBitness = 'unknown';
  let macChip = 'unknown';
  if (platform === 'windows') {
    windowsBitness = await platformDetection.detectWindowsBitness(navigatorRef);
  } else if (platform === 'macos') {
    macChip = await platformDetection.detectMacChip(navigatorRef);
  }

  const target = platformDetection.resolveDownloadTarget(platform, windowsBitness, macChip);
  label.textContent = target.label;
  button.setAttribute('aria-label', target.label);
  if (target.download === 'windows') {
    icon.innerHTML = icons.windows;
    setAnchorTarget(button, WINDOWS_URL);
  } else if (target.download === 'macos') {
    icon.innerHTML = icons.apple;
    setAnchorTarget(button, MACOS_URL);
  } else if (target.download === 'downloads') {
    icon.innerHTML = icons.download;
    setAnchorTarget(button, '#downloads');
  } else {
    icon.innerHTML = icons.windows;
    setAnchorTarget(button, '', false);
  }

  const message = document.getElementById('download-compatibility-message');
  if (message) message.textContent = target.message;
  const windowsButton = document.getElementById('download-windows');
  const windowsDetail = document.getElementById('download-windows-detail');
  const windowsUnavailable = platform === 'windows' && windowsBitness === '32';
  setAnchorTarget(windowsButton, WINDOWS_URL, !windowsUnavailable);
  if (windowsUnavailable && windowsDetail)
    windowsDetail.textContent = 'Indisponível em Windows 32-bit';
  const macButton = document.getElementById('download-mac');
  if (macButton) macButton.href = MACOS_URL;
  const macMontereyButton = document.getElementById('download-macos-monterey');
  if (macMontereyButton) macMontereyButton.href = MACOS_MONTEREY_URL;
}

function setupMobileMenu() {
  const toggle = document.getElementById('menu-toggle');
  const nav = document.getElementById('primary-nav');
  if (!toggle || !nav) return;
  const close = () => {
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Abrir menu');
    nav.classList.remove('is-open');
  };
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
    toggle.setAttribute('aria-label', open ? 'Abrir menu' : 'Fechar menu');
    nav.classList.toggle('is-open', !open);
  });
  nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', close));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      close();
      toggle.focus();
    }
  });
}

function setupBackToTop() {
  const button = document.getElementById('back-to-top');
  if (!button) return;
  const updateVisibility = () => {
    button.classList.toggle('is-visible', window.scrollY > 360);
  };
  window.addEventListener('scroll', updateVisibility, { passive: true });
  updateVisibility();
}

if (typeof document !== 'undefined') {
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
  setupSmartDownload().catch(() => {
    const message = document.getElementById('download-compatibility-message');
    if (message) {
      message.textContent =
        'Não foi possível detectar seu sistema automaticamente. Escolha uma opção de download abaixo.';
    }
  });
  setupMobileMenu();
  setupBackToTop();
}
