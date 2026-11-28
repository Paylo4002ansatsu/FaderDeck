/* global window, document, navigator, console, MutationObserver */
(() => {
  'use strict';

  const isMobile =
    !/Electron\//i.test(navigator.userAgent) &&
    (/Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
  if (!isMobile) return;

  const root = document.documentElement;
  root.classList.add('fd-mobile-surface');
  document.addEventListener('DOMContentLoaded', () => {
    const toolbar = document.createElement('header');
    toolbar.className = 'fd-mobile-toolbar';
    toolbar.setAttribute('aria-label', 'Controles da superfície');

    const status = document.createElement('span');
    status.className = 'fd-mobile-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    const stage = document.createElement('button');
    stage.type = 'button';
    stage.className = 'fd-mobile-stage-toggle';
    const stageIcon = document.createElement('span');
    stageIcon.className = 'fd-mobile-stage-icon';
    stageIcon.setAttribute('aria-hidden', 'true');
    const stageLabel = document.createElement('span');
    stage.append(stageIcon, stageLabel);
    stage.addEventListener('click', () => {
      const shell = document.querySelector('.app-shell');
      const toggle = shell?.classList.contains('stage-mode')
        ? shell.querySelector('.stage-exit-handle')
        : shell?.querySelector('.stage-toggle');
      toggle?.click();
    });

    const fullscreen = document.createElement('button');
    fullscreen.type = 'button';
    fullscreen.className = 'fd-mobile-fullscreen';
    fullscreen.textContent = 'Tela cheia';
    fullscreen.disabled = !document.documentElement.requestFullscreen;
    if (fullscreen.disabled) fullscreen.title = 'Tela cheia não disponível neste navegador';
    fullscreen.addEventListener('click', async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
      } catch (error) {
        console.error('Não foi possível alterar a tela cheia.', error);
        status.textContent = 'Tela cheia indisponível';
      }
    });

    function render() {
      const connected = window.__fdBridgeStatus === 'connected';
      status.classList.toggle('connected', connected);
      status.textContent = connected ? 'Conectado' : 'Reconectando...';
      const inStage = Boolean(document.querySelector('.app-shell.stage-mode'));
      if (!stageIcon.firstChild) {
        const originalIcon = document.querySelector('.topbar .stage-toggle svg');
        if (originalIcon) stageIcon.append(originalIcon.cloneNode(true));
      }
      toolbar.classList.toggle('stage-active', inStage);
      stageLabel.textContent = inStage ? '✕ Sair' : 'Palco';
      stage.setAttribute('aria-label', inStage ? 'Sair do modo Palco' : 'Abrir Modo Palco');
      stage.setAttribute('aria-pressed', String(inStage));
    }

    toolbar.append(status, stage, fullscreen);
    document.body.prepend(toolbar);
    window.addEventListener('faderdeck:bridge-status', render);
    new MutationObserver(render).observe(document.getElementById('root'), {
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
      childList: true,
    });
    render();
  });
})();
