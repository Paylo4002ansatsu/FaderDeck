'use strict';

const RELEASES_PAGE = 'https://github.com/Paylo4002ansatsu/FaderDeck/releases/latest';
let pendingUpdate = null;
let accountAllowed = false;
let accountCheckComplete = false;
let updateOverlay = null;
let closeUpdateModal = null;

function isAccountAllowed(status) {
  return status?.session?.authenticated === true && status.entitlement?.allowed === true;
}

function showPendingUpdate() {
  if (
    !accountCheckComplete ||
    !accountAllowed ||
    !pendingUpdate ||
    updateOverlay ||
    window.__fdAccountOverlayBusy?.()
  ) {
    return;
  }
  addUpdateModal(pendingUpdate);
}

window.addEventListener('faderdeck:account-status', (event) => {
  accountAllowed = isAccountAllowed(event.detail);
  if (!accountAllowed) closeUpdateModal?.(false);
  else showPendingUpdate();
});

function trustedDownloadUrl(value) {
  if (typeof value !== 'string') return RELEASES_PAGE;
  try {
    const url = new URL(value);
    if (
      url.protocol === 'https:' &&
      ['github.com', 'objects.githubusercontent.com'].includes(url.hostname)
    ) {
      return url.toString();
    }
  } catch {}
  return RELEASES_PAGE;
}

function addUpdateModal(status) {
  if (status.updateAvailable !== true) return;
  const versionKey = `faderdeck-update-dismissed:${status.latestVersion || ''}`;
  try {
    if (sessionStorage.getItem(versionKey) === 'true') return;
  } catch {}

  const overlay = document.createElement('div');
  overlay.className = 'fd-update-overlay';
  updateOverlay = overlay;

  const dialog = document.createElement('section');
  dialog.className = 'fd-update-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'fd-update-title');

  const heading = document.createElement('p');
  heading.className = 'fd-update-eyebrow';
  heading.textContent = 'NOVA VERSÃO DISPONÍVEL';

  const title = document.createElement('h2');
  title.id = 'fd-update-title';
  title.textContent = `FaderDeck ${status.latestVersion}`;

  const version = document.createElement('p');
  version.className = 'fd-update-version';
  version.textContent = `Versão atual: ${status.currentVersion}`;

  const actions = document.createElement('div');
  actions.className = 'fd-update-actions';

  const download = document.createElement('a');
  download.className = 'fd-update-primary';
  download.textContent = 'Atualizar agora';
  download.href = trustedDownloadUrl(status.downloadUrl || status.releaseUrl);
  download.target = '_blank';
  download.rel = 'noopener noreferrer';
  actions.append(download);

  const dismiss = document.createElement('button');
  dismiss.className = 'fd-update-secondary';
  dismiss.type = 'button';
  dismiss.textContent = 'Continuar na versão atual';
  dismiss.addEventListener('click', () => closeModal(true));
  actions.append(dismiss);

  dialog.append(heading, title, version);
  if (typeof status.releaseNotes === 'string' && status.releaseNotes.trim()) {
    const summary = document.createElement('ul');
    summary.id = 'fd-update-summary';
    summary.className = 'fd-update-summary';
    for (const note of status.releaseNotes.split('\n')) {
      if (!note.trim()) continue;
      const item = document.createElement('li');
      item.textContent = note.trim();
      summary.append(item);
    }
    dialog.setAttribute('aria-describedby', summary.id);
    dialog.append(summary);
  }
  dialog.append(actions);
  overlay.append(dialog);
  document.body.append(overlay);
  document.body.classList.add('fd-update-open');

  function closeModal(dismissed) {
    if (dismissed) {
      pendingUpdate = null;
      try {
        sessionStorage.setItem(versionKey, 'true');
      } catch {}
    }
    overlay.remove();
    document.body.classList.remove('fd-update-open');
    document.removeEventListener('keydown', onKey);
    updateOverlay = null;
    closeUpdateModal = null;
  }

  function onKey(event) {
    if (event.key === 'Escape') closeModal(true);
  }
  closeUpdateModal = closeModal;
  document.addEventListener('keydown', onKey);
  download.focus();
}

async function checkForApplicationUpdate() {
  try {
    const response = await fetch('/api/app/update-status', { cache: 'no-store' });
    if (!response.ok) return;
    pendingUpdate = await response.json();
    if (pendingUpdate.updateAvailable !== true) return;
    if (typeof window.__fdGetAccountStatus !== 'function') {
      console.warn('Não foi possível verificar a licença antes de exibir a atualização.');
      return;
    }
    const account = await window.__fdGetAccountStatus(true);
    accountAllowed = isAccountAllowed(account);
    accountCheckComplete = true;
    showPendingUpdate();
  } catch (error) {
    console.warn('Não foi possível verificar a atualização:', error);
  }
}

function initializeUpdateCheck() {
  new MutationObserver(showPendingUpdate).observe(document.body, { childList: true });
  checkForApplicationUpdate();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeUpdateCheck, { once: true });
} else {
  initializeUpdateCheck();
}
