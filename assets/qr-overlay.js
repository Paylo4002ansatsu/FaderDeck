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
  #fd-account-status{position:fixed;right:max(14px,env(safe-area-inset-right));bottom:max(14px,env(safe-area-inset-bottom));z-index:2147482000;display:flex;align-items:center;gap:8px;max-width:calc(100vw - 28px);padding:7px 10px;border:1px solid #2a3d3b;border-radius:10px;background:#13201f;color:#a9c4c0;box-shadow:0 4px 18px rgba(0,0,0,.4);font:11px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
  #fd-account-status button{border:0;background:transparent;color:#2fe0c0;font:600 11px -apple-system,sans-serif;cursor:pointer}
  #fd-account-status .fd-account-error{color:#ffb8a8}
  .fdqr-access{text-align:left}
  .fdqr-access h2{margin-bottom:8px}
  .fdqr-access .fdqr-sub{margin-bottom:15px}
  .fdqr-access label{display:block;margin:12px 0 5px;color:#a9c4c0;font-size:12px}
  .fdqr-access input{width:100%;height:40px;box-sizing:border-box;border:1px solid #2a3d3b;border-radius:8px;background:#0c1716;color:#eef8f6;padding:0 10px;font:13px -apple-system,sans-serif}
  .fdqr-access input:focus-visible,.fdqr-access button:focus-visible,.fdqr-access a:focus-visible{outline:2px solid #2fe0c0;outline-offset:2px}
  .fdqr-access .fdqr-act{width:100%;margin-top:12px}
  .fdqr-access .fdqr-act:disabled{opacity:.55;cursor:wait}
  .fdqr-access .fdqr-act.sec{width:auto}
  .fdqr-access .fdqr-btnrow{margin-top:8px;margin-bottom:0}
  .fdqr-access a{color:#2fe0c0;text-underline-offset:3px}
  .fdqr-access-message{min-height:18px;margin:10px 0 0;color:#a9c4c0;font-size:12px;line-height:1.45}
  .fdqr-access-error{color:#ffb8a8}
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
  let opening = false;
  let accountStatusPromise = null;
  let accountStatusPending = false;

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

  async function requestJson(url, options = {}) {
    const response = await fetch(url, { cache: 'no-store', ...options });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Falha HTTP ${response.status}`);
    return data;
  }

  function accountStatusText(status) {
    if (!status?.session?.authenticated) return 'Não autenticado';
    const entitlement = status.entitlement || {};
    if (entitlement.allowed === true && entitlement.kind === 'license') return 'Licença ativa';
    if (entitlement.allowed === true && entitlement.kind === 'trial') {
      const remaining = Date.parse(entitlement.expires_at) - Date.parse(entitlement.server_time);
      const days = Number.isFinite(remaining) ? Math.max(1, Math.ceil(remaining / 86400000)) : null;
      return days
        ? `Teste · ${days} ${days === 1 ? 'dia restante' : 'dias restantes'}`
        : 'Teste ativo';
    }
    return 'Expirado';
  }

  function renderAccountIndicator(status) {
    let indicator = document.getElementById('fd-account-status');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'fd-account-status';
      indicator.setAttribute('role', 'status');
      document.body.appendChild(indicator);
    }
    indicator.replaceChildren();
    const label = document.createElement('span');
    label.textContent = accountStatusText(status);
    indicator.appendChild(label);

    if (status?.session?.authenticated) {
      const logout = document.createElement('button');
      logout.type = 'button';
      logout.textContent = 'Sair';
      logout.addEventListener('click', async () => {
        logout.disabled = true;
        try {
          const nextStatus = await requestJson('/api/account/logout', { method: 'POST' });
          setAccountStatus(nextStatus);
          if (modal) close();
          await showAccess(nextStatus);
        } catch {
          logout.disabled = false;
          let error = indicator.querySelector('.fd-account-error');
          if (!error) {
            error = document.createElement('span');
            error.className = 'fd-account-error';
            error.setAttribute('role', 'status');
            indicator.insertBefore(error, logout);
          }
          error.textContent = 'Não foi possível encerrar a sessão.';
        }
      });
      indicator.appendChild(logout);
    } else {
      const signIn = document.createElement('button');
      signIn.type = 'button';
      signIn.textContent = 'Entrar';
      signIn.addEventListener('click', () => showAccess(status));
      indicator.appendChild(signIn);
    }
  }

  function showAccess(status, errorMessage = '') {
    if (modal) close();
    modal = document.createElement('div');
    modal.className = 'fdqr-backdrop';
    const card = document.createElement('div');
    card.className = 'fdqr-card fdqr-access';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'fdqr-access-title');

    const title = document.createElement('h2');
    title.id = 'fdqr-access-title';
    title.textContent = 'Acesso e Licenciamento';
    card.appendChild(title);

    const accountMessage = document.createElement('p');
    accountMessage.className = 'fdqr-sub';
    accountMessage.textContent = status?.session?.authenticated
      ? `Conta: ${status.session.email || ''}`
      : 'Entre na sua conta para ativar o FaderDeck.';
    card.appendChild(accountMessage);

    const message = document.createElement('p');
    message.className = `fdqr-access-message${errorMessage ? ' fdqr-access-error' : ''}`;
    message.setAttribute('role', 'status');
    message.textContent =
      errorMessage ||
      (status?.supabase_configured === false
        ? 'A autenticação ainda não está configurada neste ambiente.'
        : status?.entitlement?.allowed === true && status.entitlement.kind === 'trial'
          ? `Teste de 7 dias ativo. Término: ${status.entitlement.expires_at || 'consulte sua conta'}.`
          : status?.entitlement?.allowed === true
            ? 'Sua licença está ativa.'
            : status?.session?.authenticated
              ? status.trial_available
                ? 'Sua conta pode iniciar o teste grátis de 7 dias.'
                : 'Seu acesso expirou. Adquira uma licença para continuar.'
              : 'Entre na sua conta para ativar o FaderDeck.');
    card.appendChild(message);

    if (!status?.session?.authenticated) {
      const form = document.createElement('form');
      const emailLabel = document.createElement('label');
      emailLabel.textContent = 'E-mail';
      const email = document.createElement('input');
      email.type = 'email';
      email.name = 'email';
      email.autocomplete = 'username';
      email.required = true;
      emailLabel.appendChild(email);

      const passwordLabel = document.createElement('label');
      passwordLabel.textContent = 'Senha';
      const password = document.createElement('input');
      password.type = 'password';
      password.name = 'password';
      password.autocomplete = 'current-password';
      password.required = true;
      passwordLabel.appendChild(password);

      const login = document.createElement('button');
      login.className = 'fdqr-act';
      login.type = 'submit';
      login.textContent = 'Entrar';
      form.append(emailLabel, passwordLabel, login);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        login.disabled = true;
        message.textContent = 'Entrando…';
        message.classList.remove('fdqr-access-error');
        try {
          const nextStatus = await requestJson('/api/account/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email.value.trim(), password: password.value }),
          });
          password.value = '';
          setAccountStatus(nextStatus);
          if (nextStatus.entitlement?.allowed === true) {
            close();
            await open();
          } else {
            showAccess(nextStatus);
          }
        } catch (error) {
          message.textContent = error.message;
          message.classList.add('fdqr-access-error');
          login.disabled = false;
        }
      });
      card.appendChild(form);
    }

    if (status?.session?.authenticated && status.trial_available) {
      const startTrial = document.createElement('button');
      startTrial.className = 'fdqr-act';
      startTrial.type = 'button';
      startTrial.textContent = 'Iniciar teste grátis de 7 dias';
      startTrial.addEventListener('click', async () => {
        startTrial.disabled = true;
        message.textContent = 'Iniciando o teste grátis…';
        message.classList.remove('fdqr-access-error');
        try {
          const nextStatus = await requestJson('/api/account/trial/start', { method: 'POST' });
          setAccountStatus(nextStatus);
          if (nextStatus.entitlement?.allowed === true) {
            close();
            await open();
          } else {
            showAccess(nextStatus);
          }
        } catch (error) {
          message.textContent = error.message;
          message.classList.add('fdqr-access-error');
          startTrial.disabled = false;
        }
      });
      card.appendChild(startTrial);
    }

    if (
      status?.session?.authenticated &&
      status.entitlement?.allowed !== true &&
      !status.trial_available
    ) {
      const purchase = document.createElement('a');
      purchase.href = 'https://fader-deck.vercel.app/';
      purchase.target = '_blank';
      purchase.rel = 'noopener noreferrer';
      purchase.textContent = 'Adquirir licença';
      const row = document.createElement('div');
      row.className = 'fdqr-btnrow';
      row.appendChild(purchase);
      card.appendChild(row);
    }

    if (status?.entitlement?.allowed === true) {
      const continueButton = document.createElement('button');
      continueButton.className = 'fdqr-act';
      continueButton.type = 'button';
      continueButton.textContent = 'Conectar celular';
      continueButton.addEventListener('click', async () => {
        close();
        await open();
      });
      card.appendChild(continueButton);
    }

    modal.appendChild(card);
    document.body.appendChild(modal);
    document.addEventListener('keydown', onKey, true);
    if (!status?.session?.authenticated) card.querySelector('input')?.focus();
    else card.querySelector('button')?.focus();
  }

  function getAccountStatus(refresh = false) {
    if (accountStatusPending || (!refresh && accountStatusPromise)) {
      return accountStatusPromise;
    }

    accountStatusPending = true;
    accountStatusPromise = requestJson('/api/account/status')
      .then((status) => {
        renderAccountIndicator(status);
        return status;
      })
      .catch(() => null)
      .finally(() => {
        accountStatusPending = false;
      });
    return accountStatusPromise;
  }

  function setAccountStatus(status) {
    accountStatusPending = false;
    accountStatusPromise = Promise.resolve(status);
    renderAccountIndicator(status);
  }

  async function open() {
    if (modal || opening) return;
    opening = true;
    try {
      const account = await getAccountStatus(true);
      if (account?.entitlement?.allowed !== true) {
        if (!modal) {
          showAccess(
            account,
            account
              ? ''
              : 'Não foi possível consultar a conta. Verifique a conexão e tente novamente.',
          );
        }
        return;
      }
      renderAccountIndicator(account);

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
      } catch {
        modal.querySelector('.fdqr-qr').textContent =
          'Não foi possível carregar o QR. Verifique a conexão com a ponte e tente novamente.';
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
    } finally {
      opening = false;
    }
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
  getAccountStatus().then((status) => {
    if (!modal && status?.entitlement?.allowed !== true) {
      showAccess(
        status,
        status ? '' : 'Não foi possível consultar a conta. Verifique a conexão e tente novamente.',
      );
    }
  });
})();
