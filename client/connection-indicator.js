/* global window, document, navigator, requestAnimationFrame, MutationObserver */
(() => {
  'use strict';

  const desktop = /Electron\//i.test(navigator.userAgent);
  if (document.documentElement.classList.contains('fd-mobile-surface')) return;
  let connected = window.__fdBridgeStatus === 'connected';
  let mobileCount = window.__fdMobileCount || 0;
  let indicator;
  let scheduled = false;

  function render() {
    scheduled = false;
    const shell = document.querySelector('.app-shell');
    const target = shell?.classList.contains('stage-mode')
      ? shell
      : shell?.querySelector('.topbar-actions');
    if (!target) return;
    if (!indicator) {
      indicator = document.createElement(desktop ? 'button' : 'div');
      indicator.className = 'fd-connection-indicator';
      indicator.setAttribute('role', desktop ? 'button' : 'status');
      if (desktop) {
        indicator.type = 'button';
        indicator.addEventListener('click', () => window.__fdShowQr?.());
      }
    }
    indicator.classList.toggle('connected', desktop ? mobileCount > 0 : connected);
    const text = desktop
      ? mobileCount > 0
        ? 'Celular conectado'
        : 'Nenhum celular conectado'
      : connected
        ? 'Conectado ao computador'
        : 'Desconectado';
    if (indicator.textContent !== text) indicator.textContent = text;
    if (indicator.parentElement !== target) {
      target.prepend(indicator);
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(render);
  }

  window.addEventListener('faderdeck:bridge-status', (event) => {
    connected = event.detail === 'connected';
    if (!connected) mobileCount = 0;
    schedule();
  });
  window.addEventListener('faderdeck:mobile-status', (event) => {
    mobileCount = event.detail;
    schedule();
  });
  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  });
  schedule();
})();
