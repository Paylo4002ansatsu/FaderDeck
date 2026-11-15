// Injetado pelo app desktop dentro do painel: botão "Conectar celular" + janela com o QR.
(() => {
  if (window.__fdQrInstalled) return;
  window.__fdQrInstalled = true;

  const style = document.createElement('style');
  style.textContent = `
  #fdqr-btn{display:inline-flex;align-items:center;gap:6px;cursor:pointer;font:600 11px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:.02em;
    color:var(--brand,#2fe0c0);background:transparent;border:1px solid var(--border,#2a3d3b);border-radius:8px;height:28px;padding:0 10px;white-space:nowrap}
  #fdqr-btn:hover{background:rgba(47,224,192,.10);border-color:var(--brand,#2fe0c0)}
  #fdqr-btn svg{width:14px;height:14px;flex:none}
  #fdqr-btn.fdqr-float{position:fixed;left:14px;bottom:14px;z-index:2147482000;height:34px;background:#13201f;box-shadow:0 4px 18px rgba(0,0,0,.45)}
  .fdqr-backdrop{position:fixed;inset:0;z-index:2147483000;background:rgba(5,12,11,.72);display:grid;place-items:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
  .fdqr-card{position:relative;width:min(420px,92vw);max-height:92vh;overflow:auto;background:#13201f;color:#eef8f6;border:1px solid #2a3d3b;border-radius:18px;padding:26px 24px 22px;text-align:center;box-shadow:0 24px 70px rgba(0,0,0,.6)}
  .fdqr-card h2{margin:0 0 4px;font-size:20px}
  .fdqr-sub{margin:0 0 12px;color:#a9c4c0;font-size:14px;line-height:1.45}
  .fdqr-x{position:absolute;top:10px;right:12px;width:30px;height:30px;border:0;border-radius:8px;background:transparent;color:#a9c4c0;font-size:22px;line-height:1;cursor:pointer}
  .fdqr-x:hover{background:rgba(255,255,255,.08);color:#fff}
  .fdqr-qr{display:grid;place-items:center;min-height:296px}
  .fdqr-qr img{width:280px;height:280px;background:#fff;border-radius:14px;padding:8px}
  .fdqr-url{display:block;margin:12px 0 10px;padding:9px 10px;border-radius:8px;background:#0c1716;color:#2fe0c0;font:11px/1.4 ui-monospace,Menlo,monospace;word-break:break-all;text-align:left}
  .fdqr-btnrow{display:flex;gap:8px;justify-content:center;margin-bottom:10px}
  .fdqr-act{cursor:pointer;border-radius:9px;border:1px solid #2fe0c0;background:#2fe0c0;color:#0c1716;font:700 13px -apple-system,sans-serif;padding:9px 14px}
  .fdqr-act.sec{background:transparent;color:#2fe0c0}
  .fdqr-note{margin:6px 0 0;font-size:12px;line-height:1.5;color:#a9c4c0;text-align:left}
  .fdqr-status{min-height:18px;margin:8px 0 0;font-size:13px;color:#a9c4c0}
  .fdqr-status.ok{color:#2fe0c0;font-weight:700}`;
  document.head.appendChild(style);

  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let modal = null;
  let pollTimer = null;

  function close() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    document.removeEventListener('keydown', onKey, true);
    if (modal) { modal.remove(); modal = null; }
  }
  function onKey(event) { if (event.key === 'Escape') { event.stopPropagation(); close(); } }

  async function remoteCount() {
    try { const r = await fetch('/api/status', { cache: 'no-store' }); return Number((await r.json()).remoteClients) || 0; } catch { return 0; }
  }

  async function open() {
    if (modal) return;
    modal = document.createElement('div');
    modal.className = 'fdqr-backdrop';
    modal.innerHTML = '<div class="fdqr-card" role="dialog" aria-modal="true" aria-label="Conectar celular">'
      + '<button class="fdqr-x" type="button" aria-label="Fechar">×</button>'
      + '<h2>Conectar o celular</h2>'
      + '<p class="fdqr-sub">Com o celular no mesmo Wi-Fi, aponte a câmera para o QR.</p>'
      + '<div class="fdqr-qr">Carregando…</div>'
      + '<code class="fdqr-url"></code>'
      + '<div class="fdqr-btnrow"><button class="fdqr-act" type="button" data-copy>Copiar link</button><button class="fdqr-act sec" type="button" data-close>Fechar</button></div>'
      + '<p class="fdqr-note"></p><p class="fdqr-status" role="status"></p></div>';
    document.body.appendChild(modal);
    document.addEventListener('keydown', onKey, true);
    modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
    modal.querySelector('.fdqr-x').addEventListener('click', close);
    modal.querySelector('[data-close]').addEventListener('click', close);

    const statusEl = modal.querySelector('.fdqr-status');
    let pairing = null;
    modal.querySelector('[data-copy]').addEventListener('click', async () => {
      if (!pairing) return;
      try { await navigator.clipboard.writeText(pairing.url); statusEl.textContent = 'Link copiado.'; }
      catch { statusEl.textContent = 'Não consegui copiar; selecione o link acima.'; }
    });

    try {
      const response = await fetch('/api/pairing', { cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      pairing = await response.json();
      if (!modal) return;
      modal.querySelector('.fdqr-qr').innerHTML = '<img alt="QR para conectar o celular" src="' + esc(pairing.qr) + '">';
      modal.querySelector('.fdqr-url').textContent = pairing.url;
      const ips = (pairing.addresses || []).map((a) => a.address + ' (' + a.interface + ')').join(' · ') || pairing.ip;
      modal.querySelector('.fdqr-note').innerHTML = '<strong>IPs deste computador:</strong> ' + esc(ips)
        + '<br><strong>Não abre no celular?</strong> Confira o mesmo Wi-Fi e permita conexões de entrada para o FaderDeck em Ajustes do Sistema → Rede → Firewall.';
    } catch (error) {
      modal.querySelector('.fdqr-qr').textContent = 'Não consegui obter o QR (' + error.message + ').';
      return;
    }

    const initial = await remoteCount();
    pollTimer = setInterval(async () => {
      if (!modal) return;
      if ((await remoteCount()) > initial) {
        statusEl.textContent = '✓ Celular conectado!';
        statusEl.className = 'fdqr-status ok';
        clearInterval(pollTimer); pollTimer = null;
        setTimeout(close, 1400);
      }
    }, 1500);
  }

  function ensureButton() {
    const host = document.querySelector('.topbar-actions');
    let button = document.getElementById('fdqr-btn');
    if (!button) {
      button = document.createElement('button');
      button.id = 'fdqr-btn';
      button.type = 'button';
      button.title = 'Conectar celular (QR) · ⌘K';
      button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v3M14 20h3M20 20h1"/></svg><span>Conectar celular</span>';
      button.addEventListener('click', open);
    }
    if (host) {
      button.classList.remove('fdqr-float');
      if (button.parentElement !== host) host.insertBefore(button, host.firstChild);
    } else {
      button.classList.add('fdqr-float');
      if (button.parentElement !== document.body) document.body.appendChild(button);
    }
  }

  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; ensureButton(); });
  }).observe(document.body, { childList: true, subtree: true });
  ensureButton();

  window.__fdShowQr = open;
})();
