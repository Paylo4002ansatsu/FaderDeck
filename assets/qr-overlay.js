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
  .fdqr-connected-toast{position:fixed;top:max(18px,env(safe-area-inset-top));left:50%;z-index:2147483100;display:flex;align-items:center;gap:10px;padding:13px 18px;border:1px solid #285d48;border-radius:12px;background:#142a21;color:#e5fff0;box-shadow:0 12px 35px rgba(0,0,0,.4);font:600 13px -apple-system,sans-serif;transform:translateX(-50%);transition:opacity .3s ease}
  .fdqr-connected-toast span{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:#32c875;color:#06251b;font-weight:800}
  .fdqr-connected-toast.fdqr-fading{opacity:0}
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
  .fdqr-auth-switch{display:flex;gap:6px;margin:0 0 12px;padding:4px;border-radius:10px;background:#0c1716}
  .fdqr-auth-tab{flex:1;padding:8px;border:1px solid transparent;border-radius:7px;background:transparent;color:#a9c4c0;font:600 12px -apple-system,sans-serif;cursor:pointer}
  .fdqr-auth-tab.active{border-color:#2a3d3b;background:#20302e;color:#2fe0c0}
  .fdqr-reset-link{display:block;margin:10px auto 0;padding:0;border:0;background:transparent;color:#a9c4c0;font:12px -apple-system,sans-serif;text-decoration:underline;text-underline-offset:3px;cursor:pointer}
  .fdqr-access .fdqr-act{width:100%;margin-top:12px}
  .fdqr-access .fdqr-act:disabled{opacity:.55;cursor:wait}
  .fdqr-access .fdqr-act.sec{width:auto}
  .fdqr-access .fdqr-btnrow{margin-top:8px;margin-bottom:0}
  .fdqr-access a{color:#2fe0c0;text-underline-offset:3px}
  .fdqr-access-message{min-height:18px;margin:10px 0 0;color:#a9c4c0;font-size:12px;line-height:1.45}
  .fdqr-access-error{color:#ffb8a8}
  @media (max-height:560px) and (min-width:600px){
    .fdqr-card:not(.fdqr-access){width:min(780px,94vw);display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:24px;text-align:left;align-content:start;padding:20px 24px}
    .fdqr-card:not(.fdqr-access)>h2,.fdqr-card:not(.fdqr-access)>.fdqr-sub,.fdqr-card:not(.fdqr-access)>.fdqr-url,.fdqr-card:not(.fdqr-access)>.fdqr-btnrow,.fdqr-card:not(.fdqr-access)>.fdqr-note,.fdqr-card:not(.fdqr-access)>.fdqr-status{grid-column:2}
    .fdqr-card:not(.fdqr-access)>.fdqr-qr{grid-column:1;grid-row:1 / span 6}
    .fdqr-btnrow{justify-content:flex-start}
  }
  @media (max-width:420px){.fdqr-card{padding:22px 16px 18px}}
  .fdqr-backdrop{padding:24px;box-sizing:border-box}
  .fdqr-card.fdqr-access{display:grid;width:min(1020px,calc(100vw - 48px));min-height:min(570px,calc(100vh - 96px));max-height:calc(100vh - 48px);grid-template-columns:minmax(0,.92fr) minmax(0,1.08fr);gap:16px;overflow:auto;padding:16px;border-color:rgba(255,255,255,.07);border-radius:20px;background:#0b0d10;text-align:left}
  .fdqr-identity,.fdqr-account-panel{min-width:0;border:1px solid rgba(255,255,255,.07);border-radius:16px}
  .fdqr-identity{display:flex;flex-direction:column;justify-content:space-between;padding:clamp(28px,4vw,48px);background:radial-gradient(ellipse at 0 0,rgba(16,185,129,.14),transparent 58%),linear-gradient(145deg,#11171a,#101216 72%)}
  .fdqr-identity-brand{display:flex;align-items:center;gap:12px;margin-bottom:clamp(32px,6vh,60px);color:#f3f5f6;font-size:19px;font-weight:750;letter-spacing:-.03em}
  .fdqr-identity-brand img{width:54px;height:54px;border:1px solid rgba(255,255,255,.1);border-radius:14px;object-fit:cover}
  .fdqr-identity-kicker{margin:0 0 12px;color:#34d399;font-size:10px;font-weight:750;letter-spacing:.18em}
  .fdqr-identity h1{margin:0;color:#f5f7f8;font-size:clamp(36px,4vw,50px);font-weight:760;line-height:1.07;letter-spacing:-.055em}
  .fdqr-identity-description{max-width:350px;margin:18px 0 0;color:#a7afb7;font-size:13px;line-height:1.75}
  .fdqr-security-pill{display:inline-flex;min-height:42px;max-width:100%;align-items:center;gap:10px;padding:0 13px;border:1px solid rgba(255,255,255,.07);border-radius:12px;background:rgba(255,255,255,.04);color:#bdc5cc;font-size:9px;font-weight:700;letter-spacing:.07em}
  .fdqr-security-dot{position:relative;width:8px;height:8px;flex:none;border-radius:50%;background:#34d399;box-shadow:0 0 12px rgba(52,211,153,.6)}
  .fdqr-security-dot:after{position:absolute;inset:-4px;border:1px solid rgba(52,211,153,.45);border-radius:50%;content:"";animation:fdqr-pulse 2s ease-out infinite}
  @keyframes fdqr-pulse{0%{transform:scale(.65);opacity:.8}100%{transform:scale(1.7);opacity:0}}
  .fdqr-account-panel{display:flex;min-height:0;flex-direction:column;justify-content:center;padding:clamp(28px,4vw,48px);background:#14171d;box-shadow:0 22px 60px rgba(0,0,0,.28)}
  .fdqr-access [hidden]{display:none!important}
  .fdqr-account-heading{margin:0 0 20px}
  .fdqr-account-heading h2{margin:0 0 8px;color:#f3f5f7;font-size:clamp(25px,3vw,31px);font-weight:750;line-height:1.16;letter-spacing:-.04em}
  .fdqr-account-heading .fdqr-sub{margin:0;color:#a7afb7;font-size:13px;line-height:1.6}
  .fdqr-access-message{min-height:0;margin:0;color:#a7f3d0;font-size:12px;line-height:1.55}
  .fdqr-access-message:not([hidden]){margin:0 0 18px;padding:11px 13px;border:1px solid rgba(52,211,153,.34);border-radius:9px;background:rgba(16,185,129,.1);font-weight:600}
  .fdqr-access-message.fdqr-access-error{border-color:rgba(251,113,133,.42);background:rgba(251,113,133,.1);color:#fecdd3}
  .fdqr-auth-switch{display:flex;gap:7px;margin:0 0 18px;padding:4px;border:1px solid rgba(255,255,255,.04);border-radius:10px;background:#101318}
  .fdqr-auth-tab{min-height:36px;padding:7px 10px;border:1px solid transparent;border-radius:7px;background:transparent;color:#aab2bb;font:600 11px -apple-system,sans-serif}
  .fdqr-auth-tab.active{border-color:rgba(52,211,153,.25);background:rgba(16,185,129,.11);color:#6ee7b7}
  .fdqr-auth-form{display:grid;gap:14px}
  .fdqr-access .fdqr-auth-form>label{display:grid;gap:7px;margin:0;color:#aab2bb;font-size:9px;font-weight:750;letter-spacing:.13em}
  .fdqr-access .fdqr-auth-form input:not([type=checkbox]){height:47px;padding:0 13px;border-color:rgba(255,255,255,.09);border-radius:8px;background:#101318;color:#f2f4f6;font:13px -apple-system,sans-serif}
  .fdqr-access .fdqr-auth-form input:not([type=checkbox]):focus{border-color:#10b981;outline:2px solid rgba(16,185,129,.15)}
  .fdqr-password-wrap{position:relative}
  .fdqr-password-wrap input{padding-right:76px!important}
  .fdqr-password-toggle{position:absolute;top:50%;right:10px;transform:translateY(-50%);padding:5px;border:0;background:transparent;color:#aab2bb;font:600 10px -apple-system,sans-serif;cursor:pointer}
  .fdqr-remember{display:flex!important;align-items:center;gap:9px;margin:0!important;color:#bdc5cc!important;font-size:10px!important;font-weight:500!important;letter-spacing:0!important;cursor:pointer}
  .fdqr-remember input{width:16px;height:16px;margin:0;accent-color:#10b981}
  .fdqr-access .fdqr-auth-form .fdqr-act,.fdqr-account-action{width:100%;min-height:46px;margin:2px 0 0;border-radius:8px;background:#10b981;color:#06251b;font-size:12px}
  .fdqr-access .fdqr-auth-form .fdqr-act:hover,.fdqr-account-action:hover{background:#34d399}
  .fdqr-access .fdqr-auth-form .fdqr-act:disabled,.fdqr-account-action:disabled{opacity:.55;cursor:wait}
  .fdqr-access-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:16px}
  .fdqr-access-footer a,.fdqr-access-footer button,.fdqr-reset-link{width:auto;margin:0;padding:0;border:0;background:transparent;color:#aab2bb;font:600 10px -apple-system,sans-serif;text-align:left;text-decoration:none;cursor:pointer}
  .fdqr-access-footer a{color:#6ee7b7}
  .fdqr-access-footer button:hover,.fdqr-access-footer a:hover,.fdqr-reset-link:hover{color:#6ee7b7}
  .fdqr-reset-link{display:block;margin:14px 0 0;color:#6ee7b7}
  .fdqr-reset-link:disabled{opacity:.55;cursor:wait}
  .fdqr-account-panel .fdqr-btnrow{justify-content:flex-start;margin:12px 0}
  .fdqr-account-panel .fdqr-btnrow a{display:inline-flex;min-height:42px;align-items:center;padding:0 14px;border:1px solid #10b981;border-radius:8px;color:#6ee7b7;font-size:11px;font-weight:700;text-decoration:none}
  .fdqr-account-panel>.fdqr-act{margin-top:8px}
  @media (max-width:760px){.fdqr-card.fdqr-access{width:min(540px,calc(100vw - 32px));min-height:0;grid-template-columns:minmax(0,1fr);gap:12px;padding:12px}.fdqr-identity{min-height:230px;padding:24px}.fdqr-identity-brand{margin-bottom:26px}.fdqr-identity h1{font-size:36px}.fdqr-identity-description{margin-top:12px}.fdqr-security-pill{min-height:36px;margin-top:20px}.fdqr-account-panel{padding:26px}}
  @media (max-width:420px){.fdqr-card.fdqr-access{width:calc(100vw - 20px);max-height:calc(100vh - 20px);gap:10px;padding:10px}.fdqr-identity{min-height:205px;padding:20px}.fdqr-identity-brand img{width:44px;height:44px}.fdqr-identity h1{font-size:32px}.fdqr-account-panel{padding:20px}.fdqr-access-footer{align-items:flex-start;flex-direction:column;gap:10px}}
  @media (prefers-reduced-motion:reduce){.fdqr-security-dot:after{animation:none}}`;
  document.head.appendChild(style);

  const esc = (t) =>
    String(t).replace(
      /[&<>"]/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
    );
  let modal = null;
  let opening = false;
  let accountStatusPromise = null;
  let accountStatusPending = false;
  let accountStatusGeneration = 0;

  function publishAccountStatus(status) {
    renderAccountIndicator(status);
    window.dispatchEvent(new CustomEvent('faderdeck:account-status', { detail: status }));
    if (
      status?.entitlement?.allowed !== true &&
      (!modal?.querySelector('.fdqr-access') || modal.dataset.accessBlocked !== 'true')
    ) {
      showAccess(
        status,
        status ? '' : 'Não foi possível consultar a conta. Verifique a conexão e tente novamente.',
      );
    }
  }

  function close() {
    document.removeEventListener('keydown', onKey, true);
    if (modal) {
      modal.remove();
      modal = null;
    }
  }
  function onKey(event) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (modal?.dataset.accessBlocked === 'true') {
        event.preventDefault();
        return;
      }
      close();
    }
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, { cache: 'no-store', ...options });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Falha HTTP ${response.status}`);
    return data;
  }

  function translateAccountError(message, isReset) {
    if (!isReset) return message;
    if (/rate limit|for security purposes/i.test(message)) {
      return 'Aguarde 60 segundos antes de solicitar um novo código de recuperação.';
    }
    if (/error sending recovery email/i.test(message)) {
      return 'Não foi possível enviar o e-mail de recuperação. Tente novamente mais tarde.';
    }
    if (/invalid email|email address.*invalid/i.test(message)) {
      return 'O endereço de e-mail informado é inválido.';
    }
    return message;
  }

  function accountStatusText(status) {
    if (!status?.session?.authenticated) return 'Não autenticado';
    const entitlement = status.entitlement || {};
    if (entitlement.kind === 'license') {
      return entitlement.plan_code === 'solo_30'
        ? 'Plano Individual — R$ 30 (1 dispositivo)'
        : entitlement.plan_code === 'multi_50'
          ? 'Plano Multi — R$ 50'
          : 'Licença ativa';
    }
    if (entitlement.allowed === true && entitlement.kind === 'trial') {
      const remaining = Date.parse(entitlement.expires_at) - Date.parse(entitlement.server_time);
      const days = Number.isFinite(remaining) ? Math.max(1, Math.ceil(remaining / 86400000)) : null;
      return days
        ? `Teste Grátis · ${days} ${days === 1 ? 'dia restante' : 'dias restantes'}`
        : 'Teste Grátis';
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
    modal.dataset.accessBlocked = String(status?.entitlement?.allowed !== true);
    const card = document.createElement('div');
    card.className = 'fdqr-card fdqr-access';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'fdqr-access-title');

    const identity = document.createElement('section');
    identity.className = 'fdqr-identity';
    const brand = document.createElement('div');
    brand.className = 'fdqr-identity-brand';
    const logo = document.createElement('img');
    logo.src = '/faderdeck-icon.png';
    logo.alt = '';
    const brandName = document.createElement('span');
    brandName.textContent = 'FaderDeck';
    brand.append(logo, brandName);
    const kicker = document.createElement('p');
    kicker.className = 'fdqr-identity-kicker';
    kicker.textContent = 'FADERDECK / DESKTOP';
    const identityTitle = document.createElement('h1');
    identityTitle.append('Seu controlador.', document.createElement('br'), 'Sua licença.');
    const identityDescription = document.createElement('p');
    identityDescription.className = 'fdqr-identity-description';
    identityDescription.textContent =
      '7 dias grátis no cadastro. Gerencie sua licença com segurança pela sua conta.';
    const identityContent = document.createElement('div');
    identityContent.append(brand, kicker, identityTitle, identityDescription);
    const securityPill = document.createElement('div');
    securityPill.className = 'fdqr-security-pill';
    const securityDot = document.createElement('span');
    securityDot.className = 'fdqr-security-dot';
    securityDot.setAttribute('aria-hidden', 'true');
    const securityText = document.createElement('span');
    securityText.textContent = 'SESSÃO PROTEGIDA PELO SISTEMA';
    securityPill.append(securityDot, securityText);
    identity.append(identityContent, securityPill);
    card.appendChild(identity);

    const accountPanel = document.createElement('section');
    accountPanel.className = 'fdqr-account-panel';
    const heading = document.createElement('header');
    heading.className = 'fdqr-account-heading';
    const title = document.createElement('h2');
    title.id = 'fdqr-access-title';
    const accountMessage = document.createElement('p');
    accountMessage.className = 'fdqr-sub';
    const authenticated = status?.session?.authenticated === true;
    const trialExpired =
      authenticated &&
      status.trial_expired === true &&
      status.entitlement?.allowed !== true &&
      status.entitlement?.kind !== 'license';
    title.textContent = authenticated
      ? trialExpired
        ? 'Período de Avaliação Encerrado'
        : 'Sua conta FaderDeck'
      : '';
    accountMessage.textContent = authenticated ? `Conta: ${status.session.email || ''}` : '';
    heading.append(title, accountMessage);
    accountPanel.appendChild(heading);

    const message = document.createElement('p');
    message.className = `fdqr-access-message${errorMessage ? ' fdqr-access-error' : ''}`;
    message.setAttribute('role', 'status');
    message.setAttribute('aria-live', 'polite');
    message.textContent =
      errorMessage ||
      status?.entitlement?.message ||
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
              : '');
    message.hidden = !message.textContent;
    accountPanel.appendChild(message);

    if (authenticated && status?.entitlement?.code === 'DEVICE_REACTIVATION_REQUIRED') {
      const reactivate = document.createElement('button');
      reactivate.type = 'button';
      reactivate.className = 'fdqr-act';
      reactivate.textContent = 'Reativar este computador';
      reactivate.addEventListener('click', async () => {
        reactivate.disabled = true;
        try {
          const nextStatus = await requestJson('/api/account/devices/activate', { method: 'POST' });
          setAccountStatus(nextStatus);
          showAccess(nextStatus);
        } catch (error) {
          message.textContent = error.message;
          message.hidden = false;
          reactivate.disabled = false;
        }
      });
      accountPanel.appendChild(reactivate);
    }

    if (authenticated && status?.entitlement?.code === 'DEVICE_LIMIT_REACHED') {
      const devices = document.createElement('div');
      for (const device of status.entitlement.devices || []) {
        const row = document.createElement('div');
        const name = document.createElement('span');
        name.textContent = device.name || 'Computador';
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = 'Remover dispositivo';
        remove.addEventListener('click', async () => {
          remove.disabled = true;
          try {
            const nextStatus = await requestJson('/api/account/devices/remove', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ machineId: device.machineId }),
            });
            setAccountStatus(nextStatus);
            showAccess(nextStatus);
          } catch (error) {
            message.textContent = error.message;
            message.hidden = false;
            remove.disabled = false;
          }
        });
        row.append(name, remove);
        devices.appendChild(row);
      }
      const upgrade = document.createElement('a');
      upgrade.href = 'https://fader-deck.vercel.app';
      upgrade.target = '_blank';
      upgrade.rel = 'noopener noreferrer';
      upgrade.textContent = 'Fazer upgrade (R$ 50)';
      devices.appendChild(upgrade);
      accountPanel.appendChild(devices);
    }

    if (!status?.session?.authenticated) {
      let authMode = 'login';
      let resetStep = 1;
      let resetEmail = '';
      const authSwitch = document.createElement('div');
      authSwitch.className = 'fdqr-auth-switch';
      authSwitch.setAttribute('role', 'tablist');
      authSwitch.setAttribute('aria-label', 'Acesso à conta');
      const loginTab = document.createElement('button');
      loginTab.className = 'fdqr-auth-tab';
      loginTab.type = 'button';
      loginTab.setAttribute('role', 'tab');
      loginTab.textContent = 'Entrar';
      const signupTab = document.createElement('button');
      signupTab.className = 'fdqr-auth-tab';
      signupTab.type = 'button';
      signupTab.setAttribute('role', 'tab');
      signupTab.textContent = 'Criar conta';
      authSwitch.append(loginTab, signupTab);
      accountPanel.appendChild(authSwitch);

      const form = document.createElement('form');
      form.className = 'fdqr-auth-form';
      form.id = 'fdqr-account-form';
      const emailLabel = document.createElement('label');
      emailLabel.htmlFor = 'fdqr-account-email';
      emailLabel.textContent = 'E-MAIL';
      const email = document.createElement('input');
      email.id = 'fdqr-account-email';
      email.type = 'email';
      email.name = 'email';
      email.autocomplete = 'username';
      email.required = true;
      emailLabel.append(email);

      const passwordLabel = document.createElement('label');
      passwordLabel.htmlFor = 'fdqr-account-password';
      passwordLabel.textContent = 'SENHA';
      const passwordWrap = document.createElement('div');
      passwordWrap.className = 'fdqr-password-wrap';
      const password = document.createElement('input');
      password.id = 'fdqr-account-password';
      password.type = 'password';
      password.name = 'password';
      password.autocomplete = 'current-password';
      password.required = true;
      passwordWrap.appendChild(password);
      const passwordToggle = document.createElement('button');
      passwordToggle.className = 'fdqr-password-toggle';
      passwordToggle.type = 'button';
      passwordToggle.textContent = 'Mostrar';
      passwordToggle.setAttribute('aria-controls', password.id);
      passwordToggle.setAttribute('aria-pressed', 'false');
      passwordToggle.setAttribute('aria-label', 'Mostrar senha');
      passwordToggle.addEventListener('click', () => {
        const visible = password.type === 'password';
        password.type = visible ? 'text' : 'password';
        passwordToggle.textContent = visible ? 'Ocultar' : 'Mostrar';
        passwordToggle.setAttribute('aria-pressed', String(visible));
        passwordToggle.setAttribute('aria-label', visible ? 'Ocultar senha' : 'Mostrar senha');
      });
      passwordWrap.appendChild(passwordToggle);
      passwordLabel.append(passwordWrap);

      const confirmLabel = document.createElement('label');
      confirmLabel.htmlFor = 'fdqr-account-password-confirm';
      confirmLabel.textContent = 'CONFIRMAR SENHA';
      const confirmPassword = document.createElement('input');
      confirmPassword.id = 'fdqr-account-password-confirm';
      confirmPassword.type = 'password';
      confirmPassword.name = 'password-confirm';
      confirmPassword.autocomplete = 'new-password';
      confirmLabel.append(confirmPassword);

      const codeLabel = document.createElement('label');
      codeLabel.htmlFor = 'fdqr-reset-code';
      codeLabel.textContent = 'CÓDIGO DE VERIFICAÇÃO';
      const code = document.createElement('input');
      code.id = 'fdqr-reset-code';
      code.type = 'text';
      code.inputMode = 'numeric';
      code.autocomplete = 'one-time-code';
      code.maxLength = 8;
      code.pattern = '[0-9]{6,8}';
      codeLabel.append(code);

      function createResetPasswordField(id, labelText) {
        const label = document.createElement('label');
        label.htmlFor = id;
        label.textContent = labelText;
        const wrap = document.createElement('div');
        wrap.className = 'fdqr-password-wrap';
        const input = document.createElement('input');
        input.id = id;
        input.type = 'password';
        input.autocomplete = 'new-password';
        input.minLength = 8;
        const toggle = document.createElement('button');
        toggle.className = 'fdqr-password-toggle';
        toggle.type = 'button';
        toggle.textContent = 'Mostrar';
        toggle.setAttribute('aria-controls', id);
        toggle.setAttribute('aria-pressed', 'false');
        toggle.setAttribute('aria-label', 'Mostrar senha');
        toggle.addEventListener('click', () => {
          const visible = input.type === 'password';
          input.type = visible ? 'text' : 'password';
          toggle.textContent = visible ? 'Ocultar' : 'Mostrar';
          toggle.setAttribute('aria-pressed', String(visible));
          toggle.setAttribute('aria-label', visible ? 'Ocultar senha' : 'Mostrar senha');
        });
        wrap.append(input, toggle);
        label.append(wrap);
        return { label, input };
      }

      const newPassword = createResetPasswordField('fdqr-reset-password', 'NOVA SENHA');
      const newPasswordConfirm = createResetPasswordField(
        'fdqr-reset-password-confirm',
        'CONFIRMAR NOVA SENHA',
      );
      const resetActions = document.createElement('div');
      resetActions.className = 'fdqr-access-footer';
      const resend = document.createElement('button');
      resend.type = 'button';
      resend.textContent = 'Reenviar código';
      const changeEmail = document.createElement('button');
      changeEmail.type = 'button';
      changeEmail.textContent = 'Alterar e-mail';
      resetActions.append(resend, changeEmail);

      const rememberLabel = document.createElement('label');
      rememberLabel.className = 'fdqr-remember';
      const remember = document.createElement('input');
      remember.type = 'checkbox';
      remember.checked = true;
      const rememberText = document.createElement('span');
      rememberText.textContent = 'Manter conectado neste computador';
      rememberLabel.append(remember, rememberText);

      const login = document.createElement('button');
      login.className = 'fdqr-act';
      login.type = 'submit';
      const resetLink = document.createElement('button');
      resetLink.className = 'fdqr-reset-link';
      resetLink.type = 'button';
      resetLink.textContent = 'Esqueci minha senha';
      const signupFooter = document.createElement('button');
      signupFooter.className = 'fdqr-reset-link';
      signupFooter.type = 'button';
      signupFooter.textContent = 'Já tenho conta · Entrar';
      const resetFooter = document.createElement('button');
      resetFooter.className = 'fdqr-reset-link';
      resetFooter.type = 'button';
      resetFooter.textContent = 'Voltar para o login';

      function setResetBusy(busy) {
        login.disabled = busy;
        resend.disabled = busy;
        changeEmail.disabled = busy;
        resetFooter.disabled = busy;
      }

      function updateAuthMode({ clearMessage = true } = {}) {
        const signingUp = authMode === 'signup';
        const resetting = authMode === 'reset';
        loginTab.classList.toggle('active', !signingUp && !resetting);
        loginTab.setAttribute('aria-selected', String(!signingUp && !resetting));
        signupTab.classList.toggle('active', signingUp);
        signupTab.setAttribute('aria-selected', String(signingUp));
        authSwitch.hidden = resetting;
        title.textContent = signingUp
          ? 'Criar sua conta'
          : resetting
            ? 'Recuperar acesso'
            : 'Bem-vindo de volta';
        accountMessage.textContent = signingUp
          ? 'Cadastre-se para liberar seu teste grátis de 7 dias.'
          : resetting
            ? resetStep === 1
              ? 'Informe o e-mail da sua conta.'
              : resetStep === 2
                ? 'Digite o código enviado para o seu e-mail.'
                : 'Defina uma nova senha para sua conta.'
            : 'Entre com o e-mail da sua conta para ativar o FaderDeck.';
        emailLabel.hidden = resetting && resetStep !== 1;
        email.disabled = emailLabel.hidden;
        email.required = !resetting || resetStep === 1;
        passwordLabel.hidden = resetting;
        password.required = !resetting;
        password.minLength = signingUp ? 8 : 0;
        password.autocomplete = signingUp ? 'new-password' : 'current-password';
        confirmLabel.hidden = !signingUp;
        confirmPassword.required = signingUp;
        rememberLabel.hidden = !(!signingUp && !resetting);
        resetLink.hidden = !(!signingUp && !resetting);
        signupFooter.hidden = !signingUp;
        resetFooter.hidden = !resetting;
        codeLabel.hidden = !resetting || resetStep !== 2;
        code.disabled = codeLabel.hidden;
        code.required = resetting && resetStep === 2;
        newPassword.label.hidden = !resetting || resetStep !== 3;
        newPassword.input.disabled = newPassword.label.hidden;
        newPassword.input.required = resetting && resetStep === 3;
        newPasswordConfirm.label.hidden = !resetting || resetStep !== 3;
        newPasswordConfirm.input.disabled = newPasswordConfirm.label.hidden;
        newPasswordConfirm.input.required = resetting && resetStep === 3;
        resetActions.hidden = !resetting || resetStep !== 2;
        login.textContent = signingUp
          ? 'Criar conta e testar grátis'
          : resetting
            ? resetStep === 1
              ? 'Enviar código de recuperação'
              : resetStep === 2
                ? 'Validar código'
                : 'Salvar nova senha'
            : 'Entrar no FaderDeck';
        login.disabled = false;
        if (clearMessage) {
          message.textContent = '';
          message.hidden = true;
          message.classList.remove('fdqr-access-error');
          message.classList.add('fdqr-access-success');
        }
        password.type = 'password';
        passwordToggle.textContent = 'Mostrar';
        passwordToggle.setAttribute('aria-pressed', 'false');
        passwordToggle.setAttribute('aria-label', 'Mostrar senha');
        password.value = '';
        confirmPassword.value = '';
        confirmPassword.setCustomValidity('');
      }
      loginTab.addEventListener('click', () => {
        authMode = 'login';
        updateAuthMode();
      });
      signupTab.addEventListener('click', () => {
        authMode = 'signup';
        updateAuthMode();
      });
      resetLink.addEventListener('click', () => {
        authMode = 'reset';
        resetStep = 1;
        resetEmail = '';
        code.value = '';
        newPassword.input.value = '';
        newPasswordConfirm.input.value = '';
        updateAuthMode();
        email.focus();
      });
      signupFooter.addEventListener('click', () => {
        authMode = 'login';
        updateAuthMode();
      });
      resetFooter.addEventListener('click', () => {
        authMode = 'login';
        code.value = '';
        newPassword.input.value = '';
        newPasswordConfirm.input.value = '';
        updateAuthMode();
      });
      changeEmail.addEventListener('click', () => {
        resetStep = 1;
        code.value = '';
        updateAuthMode();
        email.focus();
      });
      resend.addEventListener('click', async () => {
        setResetBusy(true);
        try {
          await requestJson('/api/account/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: resetEmail }),
          });
          code.value = '';
          message.textContent = `Código enviado para ${resetEmail}. Verifique sua caixa de entrada.`;
          message.classList.remove('fdqr-access-error');
          message.hidden = false;
          code.focus();
        } catch (error) {
          message.textContent = translateAccountError(error.message, true);
          message.classList.add('fdqr-access-error');
          message.hidden = false;
        } finally {
          setResetBusy(false);
        }
      });
      updateAuthMode({ clearMessage: false });
      form.append(
        emailLabel,
        passwordLabel,
        confirmLabel,
        rememberLabel,
        codeLabel,
        newPassword.label,
        newPasswordConfirm.label,
        login,
        resetActions,
      );
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const signingUp = authMode === 'signup';
        const resetting = authMode === 'reset';
        message.textContent = '';
        message.hidden = true;
        message.classList.remove('fdqr-access-error');
        message.classList.add('fdqr-access-success');
        if (signingUp && password.value !== confirmPassword.value) {
          confirmPassword.setCustomValidity('As senhas não coincidem.');
          confirmPassword.reportValidity();
          message.textContent = 'As senhas não coincidem.';
          message.classList.remove('fdqr-access-success');
          message.classList.add('fdqr-access-error');
          message.hidden = false;
          return;
        }
        confirmPassword.setCustomValidity('');
        if (resetting && resetStep === 2 && !/^\d{6,8}$/.test(code.value)) {
          message.textContent = 'O código deve conter de 6 a 8 dígitos numéricos.';
          message.classList.add('fdqr-access-error');
          message.hidden = false;
          return;
        }
        if (
          resetting &&
          resetStep === 3 &&
          newPassword.input.value !== newPasswordConfirm.input.value
        ) {
          message.textContent = 'As senhas não coincidem.';
          message.classList.add('fdqr-access-error');
          message.hidden = false;
          return;
        }
        login.disabled = true;
        if (resetting) setResetBusy(true);
        message.textContent = resetting
          ? resetStep === 1
            ? 'Enviando…'
            : resetStep === 2
              ? 'Validando…'
              : 'Salvando…'
          : signingUp
            ? 'Criando conta…'
            : 'Entrando…';
        try {
          if (resetting) {
            if (resetStep === 1) {
              const sentEmail = email.value.trim();
              await requestJson('/api/account/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: sentEmail }),
              });
              resetEmail = sentEmail;
              resetStep = 2;
              updateAuthMode();
              message.textContent = `Código enviado para ${resetEmail}. Verifique sua caixa de entrada.`;
              message.hidden = false;
              code.focus();
            } else if (resetStep === 2) {
              await requestJson('/api/account/reset-password/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: resetEmail, code: code.value }),
              });
              resetStep = 3;
              code.value = '';
              updateAuthMode();
              newPassword.input.focus();
            } else {
              await requestJson('/api/account/reset-password/confirm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: newPassword.input.value }),
              });
              newPassword.input.value = '';
              newPasswordConfirm.input.value = '';
              authMode = 'login';
              updateAuthMode();
              message.textContent = 'Senha alterada com sucesso! Entre com sua nova senha.';
              message.hidden = false;
              password.focus();
            }
            return;
          }

          const accountStatus = await requestJson(
            signingUp ? '/api/account/signup' : '/api/account/login',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: email.value.trim(),
                password: password.value,
                ...(!signingUp ? { remember: remember.checked } : {}),
              }),
            },
          );
          password.value = '';
          setAccountStatus(accountStatus);
          if (signingUp && accountStatus.confirmation_required) {
            authMode = 'login';
            updateAuthMode({ clearMessage: false });
            message.textContent =
              'Enviamos um link para o seu e-mail. Verifique sua caixa de entrada (e spam) para continuar.';
            message.hidden = false;
            return;
          }
          if (accountStatus.entitlement?.allowed === true) {
            close();
            await open();
          } else {
            showAccess(accountStatus);
          }
        } catch (error) {
          if (signingUp) {
            const latestStatus = await getAccountStatus(true);
            if (latestStatus?.session?.authenticated) {
              setAccountStatus(latestStatus);
              showAccess(latestStatus, error.message);
              return;
            }
          }
          message.textContent = translateAccountError(error.message, resetting);
          message.classList.add('fdqr-access-error');
          message.classList.remove('fdqr-access-success');
          message.hidden = false;
          login.disabled = false;
        } finally {
          if (resetting) setResetBusy(false);
        }
      });
      const footer = document.createElement('div');
      footer.className = 'fdqr-access-footer';
      const purchaseLink = document.createElement('a');
      purchaseLink.href = 'https://fader-deck.vercel.app/';
      purchaseLink.target = '_blank';
      purchaseLink.rel = 'noopener noreferrer';
      purchaseLink.textContent = 'Comprar uma licença';
      footer.append(resetLink, purchaseLink);
      accountPanel.append(authSwitch, form, footer, signupFooter, resetFooter);
    }

    if (status?.session?.authenticated && status.trial_available) {
      const startTrial = document.createElement('button');
      startTrial.className = 'fdqr-act';
      startTrial.type = 'button';
      startTrial.textContent = 'Iniciar teste grátis de 7 dias';
      startTrial.addEventListener('click', async () => {
        startTrial.disabled = true;
        message.textContent = 'Iniciando o teste grátis…';
        message.hidden = false;
        message.classList.remove('fdqr-access-error');
        message.classList.add('fdqr-access-success');
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
          message.classList.remove('fdqr-access-success');
          startTrial.disabled = false;
        }
      });
      startTrial.classList.add('fdqr-account-action');
      accountPanel.appendChild(startTrial);
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
      accountPanel.appendChild(row);
    }

    if (status?.session?.authenticated) {
      const switchAccount = document.createElement('button');
      switchAccount.className = 'fdqr-reset-link';
      switchAccount.type = 'button';
      switchAccount.textContent = 'Trocar de conta';
      switchAccount.addEventListener('click', async () => {
        switchAccount.disabled = true;
        message.textContent = 'Encerrando sessão…';
        message.hidden = false;
        try {
          const nextStatus = await requestJson('/api/account/logout', { method: 'POST' });
          setAccountStatus(nextStatus);
          showAccess(nextStatus);
        } catch (error) {
          message.textContent = error.message;
          message.classList.add('fdqr-access-error');
          message.classList.remove('fdqr-access-success');
          switchAccount.disabled = false;
        }
      });
      accountPanel.appendChild(switchAccount);
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
      accountPanel.appendChild(continueButton);
    }

    card.appendChild(accountPanel);
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
    const generation = accountStatusGeneration;
    accountStatusPromise = requestJson('/api/account/status')
      .then((status) => {
        if (generation !== accountStatusGeneration) return accountStatusPromise;
        publishAccountStatus(status);
        return status;
      })
      .catch((error) => {
        if (generation !== accountStatusGeneration) return accountStatusPromise;
        console.warn('Não foi possível consultar o estado da conta:', error);
        publishAccountStatus(null);
        return null;
      })
      .finally(() => {
        if (generation === accountStatusGeneration) accountStatusPending = false;
      });
    return accountStatusPromise;
  }

  function setAccountStatus(status) {
    accountStatusGeneration += 1;
    accountStatusPending = false;
    accountStatusPromise = Promise.resolve(status);
    publishAccountStatus(status);
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
      const qrModal = modal;
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
        if (modal !== qrModal) return;
        modal.querySelector('.fdqr-qr').innerHTML =
          '<img alt="QR para conectar o celular" src="' + esc(pairing.qr) + '">';
        modal.querySelector('.fdqr-url').textContent = pairing.url;
        const ips =
          (pairing.addresses || []).map((a) => a.address + ' (' + a.interface + ')').join(' · ') ||
          pairing.ip;
        modal.querySelector('.fdqr-note').innerHTML =
          '<strong>IPs deste computador:</strong> ' +
          esc(ips) +
          '<br>Use uma rede confiável: a conexão local não é criptografada. Se não conectar, confira o mesmo Wi-Fi.';
      } catch {
        if (modal !== qrModal) return;
        qrModal.querySelector('.fdqr-qr').textContent =
          'Não foi possível carregar o QR. Verifique a conexão com a ponte e tente novamente.';
        return;
      }
    } finally {
      opening = false;
    }
  }

  let toastTimer;
  window.addEventListener('faderdeck:mobile-connected', () => {
    if (modal && !modal.querySelector('.fdqr-access')) close();
    let toast = document.querySelector('.fdqr-connected-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'fdqr-connected-toast';
      toast.setAttribute('role', 'status');
      toast.innerHTML = '<span aria-hidden="true">✓</span>Dispositivo conectado';
      document.body.appendChild(toast);
    }
    toast.classList.remove('fdqr-fading');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.add('fdqr-fading');
      toastTimer = setTimeout(() => toast.remove(), 300);
    }, 2500);
  });

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
  window.__fdGetAccountStatus = getAccountStatus;
  window.__fdAccountOverlayBusy = () => opening || !!modal;
  getAccountStatus().then((status) => {
    if (!modal && status?.entitlement?.allowed !== true) {
      showAccess(
        status,
        status ? '' : 'Não foi possível consultar a conta. Verifique a conexão e tente novamente.',
      );
    }
  });
})();
