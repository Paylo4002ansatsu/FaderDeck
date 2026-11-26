'use strict';

const RELEASES_PAGE = 'https://github.com/Paylo4002ansatsu/FaderDeck/releases/latest';

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
  if (!status.mandatory) {
    try {
      if (sessionStorage.getItem(versionKey) === 'true') return;
    } catch {}
  }

  const overlay = document.createElement('div');
  overlay.className = 'fd-update-overlay';

  const dialog = document.createElement('section');
  dialog.className = 'fd-update-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'fd-update-title');
  dialog.setAttribute('aria-describedby', 'fd-update-summary');

  const heading = document.createElement('p');
  heading.className = 'fd-update-eyebrow';
  heading.textContent = status.mandatory ? 'ATUALIZAÇÃO OBRIGATÓRIA' : 'NOVA VERSÃO DISPONÍVEL';

  const title = document.createElement('h2');
  title.id = 'fd-update-title';
  title.textContent = `FaderDeck ${status.latestVersion}`;

  const version = document.createElement('p');
  version.className = 'fd-update-version';
  version.textContent = `Versão atual: ${status.currentVersion}`;

  const summary = document.createElement('p');
  summary.id = 'fd-update-summary';
  summary.className = 'fd-update-summary';
  summary.textContent = status.releaseNotes || 'Uma nova versão do FaderDeck está disponível.';

  const actions = document.createElement('div');
  actions.className = 'fd-update-actions';

  const download = document.createElement('a');
  download.className = 'fd-update-primary';
  download.textContent = 'Atualizar agora';
  download.href = trustedDownloadUrl(status.downloadUrl || status.releaseUrl);
  download.target = '_blank';
  download.rel = 'noopener noreferrer';
  actions.append(download);

  if (!status.mandatory) {
    const dismiss = document.createElement('button');
    dismiss.className = 'fd-update-secondary';
    dismiss.type = 'button';
    dismiss.textContent = 'Continuar na versão atual';
    dismiss.addEventListener('click', closeModal);
    actions.append(dismiss);
  }

  dialog.append(heading, title, version, summary, actions);
  overlay.append(dialog);
  document.body.append(overlay);
  document.body.classList.add('fd-update-open');

  function closeModal() {
    if (status.mandatory) return;
    try {
      sessionStorage.setItem(versionKey, 'true');
    } catch {}
    overlay.remove();
    document.body.classList.remove('fd-update-open');
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !status.mandatory) closeModal();
  });
  download.focus();
}

async function checkForApplicationUpdate() {
  try {
    const response = await fetch('/api/app/update-status', { cache: 'no-store' });
    if (!response.ok) return;
    addUpdateModal(await response.json());
  } catch {
    // Update checks must never block access to the application.
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', checkForApplicationUpdate, { once: true });
} else {
  checkForApplicationUpdate();
}
