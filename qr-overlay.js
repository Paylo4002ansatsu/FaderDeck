// Injetado pelo app desktop dentro do painel: botão "Conectar celular" + janela com o QR.
(() => {
  if (window.__fdQrInstalled) return;
  window.__fdQrInstalled = true;

  const style = document.createElement('style');
  style.textContent = `
  #fdqr-btn{cursor:pointer}
  #fdqr-btn svg{width:15px;height:15px;flex:none}
  #fdqr-btn.fdqr-rail{display:flex;align-items:center;gap:8px;width:calc(100% - 8px);margin:22px 4px 0;padding:10px 8px;box-sizing:border-box;text-align:left;
    font:600 11px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--brand,#2fe0c0);background:var(--brand-dim,rgba(47,224,192,.10));border:1px solid var(--brand,#2fe0c0);border-radius:8px}
  #fdqr-btn.fdqr-rail:hover{filter:brightness(1.15)}
  #fdqr-btn.fdqr-rail kbd{margin-left:auto;font:500 10px ui-monospace,Menlo,monospace;opacity:.7;border:1px solid currentColor;border-radius:5px;padding:1px 5px}
  #fdqr-btn.fdqr-rail + .rail-footer{margin-top:10px}
  #fdqr-btn.fdqr-float{position:fixed;left:max(14px,env(safe-area-inset-left));bottom:max(14px,env(safe-area-inset-bottom));z-index:2147482000;display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 12px;
    font:600 12px -apple-system,sans-serif;color:var(--brand,#2fe0c0);background:#13201f;border:1px solid var(--brand,#2fe0c0);border-radius:10px;box-shadow:0 4px 18px rgba(0,0,0,.45)}
  #fdqr-btn.fdqr-float kbd{display:none}
  .fdqr-backdrop{position:fixed;inset:0;z-index:2147483000;background:rgba(5,12,11,.72);display:grid;place-items:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
  .fdqr-card{position:relative;width:min(420px,92vw);max-height:92vh;overflow:auto;background:#13201f;color:#eef8f6;border:1px solid #2a3d3b;border-radius:18px;padding:26px 24px 22px;text-align:center;box-shadow:0 24px 70px rgba(0,0,0,.6)}
  .fdqr-card h2{margin:0 0 4px;font-size:20px}
  .fdqr-sub{margin:0 0 12px;color:#a9c4c0;font-size:14px;line-height:1.45}
  .fdqr-x{position:absolute;top:10px;right:12px;width:30px;height:30px;border:0;border-radius:8px;background:transparent;color:#a9c4c0;font-size:22px;line-height:1;cursor:pointer}
  .fdqr-x:hover{background:rgba(255,255,255,.08);color:#fff}
  .fdqr-qr{display:grid;place-items:center;min-height:0}
  .fdqr-qr img{width:min(280px,64vw,44vh);height:auto;aspect-ratio:1/1;background:#fff;border-radius:14px;padding:8px;box-sizing:border-box}
  .fdqr-url{display:block;margin:12px 0 10px;padding:9px 10px;border-radius:8px;background:#0c1716;color:#2fe0c0;font:11px/1.4 ui-monospace,Menlo,monospace;word-break:break-all;text-align:left}
  .fdqr-btnrow{display:flex;gap:8px;justify-content:center;margin-bottom:10px}
  .fdqr-act{cursor:pointer;border-radius:9px;border:1px solid #2fe0c0;background:#2fe0c0;color:#0c1716;font:700 13px -apple-system,sans-serif;padding:9px 14px}
  .fdqr-act.sec{background:transparent;color:#2fe0c0}
  .fdqr-note{margin:6px 0 0;font-size:12px;line-height:1.5;color:#a9c4c0;text-align:left}
  .fdqr-status{min-height:18px;margin:8px 0 0;font-size:13px;color:#a9c4c0}
  .fdqr-status.ok{color:#2fe0c0;font-weight:700}
  @media (max-height:560px) and (min-width:600px){
    .fdqr-card{width:min(780px,94vw);display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:24px;text-align:left;align-content:start;padding:20px 24px}
    .fdqr-card>h2,.fdqr-card>.fdqr-sub,.fdqr-card>.fdqr-url,.fdqr-card>.fdqr-btnrow,.fdqr-card>.fdqr-note,.fdqr-card>.fdqr-status{grid-column:2}
    .fdqr-card>.fdqr-qr{grid-column:1;grid-row:1 / span 6}
    .fdqr-btnrow{justify-content:flex-start}
  }
  @media (max-width:420px){.fdqr-card{padding:22px 16px 18px}}`;
  document.head.appendChild(style);

  const esc = (t) =>
    String(t).replace(
      /[&<>"]/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
    );
  let modal = null;
  let pollTimer = null;

  function close() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    document.removeEventListener('keydown', onKey, true);
    if (modal) {
      modal.remove();
      modal = null;
    }
  }
  function onKey(event) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    }
  }

  async function remoteCount() {
    try {
      const r = await fetch('/api/status', { cache: 'no-store' });
      return Number((await r.json()).remoteClients) || 0;
    } catch {
      return 0;
    }
  }

  async function open() {
    if (modal) return;
    modal = document.createElement('div');
    modal.className = 'fdqr-backdrop';
    modal.innerHTML =
      '<div class="fdqr-card" role="dialog" aria-modal="true" aria-label="Conectar celular">' +
      '<button class="fdqr-x" type="button" aria-label="Fechar">×</button>' +
      '<h2>Conectar o celular</h2>' +
      '<p class="fdqr-sub">Com o celular no mesmo Wi-Fi, aponte a câmera para o QR.</p>' +
      '<div class="fdqr-qr">Carregando…</div>' +
      '<code class="fdqr-url"></code>' +
      '<div class="fdqr-btnrow"><button class="fdqr-act" type="button" data-copy>Copiar link</button><button class="fdqr-act sec" type="button" data-close>Fechar</button></div>' +
      '<p class="fdqr-note"></p><p class="fdqr-status" role="status"></p></div>';
    document.body.appendChild(modal);
    document.addEventListener('keydown', onKey, true);
    modal.addEventListener('click', (event) => {
      if (event.target === modal) close();
    });
    modal.querySelector('.fdqr-x').addEventListener('click', close);
    modal.querySelector('[data-close]').addEventListener('click', close);

    const statusEl = modal.querySelector('.fdqr-status');
    let pairing = null;
    modal.querySelector('[data-copy]').addEventListener('click', async () => {
      if (!pairing) return;
      try {
        await navigator.clipboard.writeText(pairing.url);
        statusEl.textContent = 'Link copiado.';
      } catch {
        statusEl.textContent = 'Não consegui copiar; selecione o link acima.';
      }
    });

    try {
      const response = await fetch('/api/pairing', { cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      pairing = await response.json();
      if (!modal) return;
      modal.querySelector('.fdqr-qr').innerHTML =
        '<img alt="QR para conectar o celular" src="' + esc(pairing.qr) + '">';
      modal.querySelector('.fdqr-url').textContent = pairing.url;
      const ips =
        (pairing.addresses || []).map((a) => a.address + ' (' + a.interface + ')').join(' · ') ||
        pairing.ip;
      modal.querySelector('.fdqr-note').innerHTML =
        '<strong>IPs deste computador:</strong> ' +
        esc(ips) +
        '<br><strong>Não abre no celular?</strong> Confira o mesmo Wi-Fi e permita conexões de entrada para o FaderDeck em Ajustes do Sistema → Rede → Firewall.';
    } catch (error) {
      modal.querySelector('.fdqr-qr').textContent =
        'Não consegui obter o QR (' + error.message + ').';
      return;
    }

    const initial = await remoteCount();
    pollTimer = setInterval(async () => {
      if (!modal) return;
      if ((await remoteCount()) > initial) {
        statusEl.textContent = '✓ Celular conectado!';
        statusEl.className = 'fdqr-status ok';
        clearInterval(pollTimer);
        pollTimer = null;
        setTimeout(close, 1400);
      }
    }, 1500);
  }

  function railUsable(rail) {
    if (!rail) return false;
    try {
      return getComputedStyle(rail).display !== 'none';
    } catch {
      return true;
    }
  }

  function ensureButton() {
    const stage = !!document.querySelector('.stage-mode');
    const rail = document.querySelector('.page-rail');
    let button = document.getElementById('fdqr-btn');
    if (!button) {
      button = document.createElement('button');
      button.id = 'fdqr-btn';
      button.type = 'button';
      button.title = 'Conectar celular (QR) · ⌘K';
      button.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v3M14 20h3M20 20h1"/></svg><span>Conectar celular</span>';
      button.addEventListener('click', open);
    }
    button.style.display = stage ? 'none' : '';
    if (railUsable(rail)) {
      if (button.className !== 'fdqr-rail') button.className = 'fdqr-rail';
      const footer = rail.querySelector('.rail-footer');
      if (footer) {
        if (button.parentElement !== rail || button.nextElementSibling !== footer)
          rail.insertBefore(button, footer);
      } else if (button.parentElement !== rail) rail.appendChild(button);
    } else {
      if (button.className !== 'fdqr-float') button.className = 'fdqr-float';
      if (button.parentElement !== document.body) document.body.appendChild(button);
    }
  }

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      ensureButton();
    });
  };
  new MutationObserver(schedule).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  });
  window.addEventListener('resize', schedule);
  ensureButton();

  window.__fdShowQr = open;
})();
