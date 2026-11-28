'use strict';

const statusElement = document.querySelector('#status');
const accountStateElement = document.querySelector('#account-state');
const accountEmailElement = document.querySelector('#account-email');
const accountMessageElement = document.querySelector('#account-message');
const accountFeedbackBannerElement = document.querySelector('#account-feedback-banner');
const accountTitleElement = document.querySelector('#account-title');
const accountDescriptionElement = document.querySelector('#account-description');
const ACCOUNT_EMAIL_SENT_MESSAGE =
  'Enviamos um link de confirmação para o seu e-mail. Verifique sua caixa de entrada e spam.';
const ACCOUNT_RESET_RATE_LIMIT_MESSAGE =
  'Aguarde 60 segundos antes de solicitar um novo código de recuperação.';
const ACCOUNT_RESET_SEND_ERROR_MESSAGE =
  'Não foi possível enviar o e-mail de recuperação. Tente novamente mais tarde.';
let token = '';
let mobileUrl = '';
let accountMode = 'login';
let resetFlowState = {
  step: null,
  email: null,
  code: null,
};

function translateAccountError(message, mode) {
  if (mode !== 'reset') return message;
  if (/rate limit|for security purposes/i.test(message)) {
    return ACCOUNT_RESET_RATE_LIMIT_MESSAGE;
  }
  if (/error sending recovery email/i.test(message)) {
    return ACCOUNT_RESET_SEND_ERROR_MESSAGE;
  }
  if (/invalid email|email address.*invalid/i.test(message)) {
    return 'O endereço de e-mail informado é inválido.';
  }
  return message;
}

async function requestJson(url, options) {
  const response = await fetch(url, { cache: 'no-store', ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Falha HTTP ${response.status}`);
  return data;
}

async function loadPairing() {
  const pairing = await requestJson('/api/pairing');
  mobileUrl = pairing.url;
  token = new URLSearchParams(new URL(pairing.url).hash.slice(1)).get('bridgeToken') || '';
  document.querySelector('#pairing-qr').src = pairing.qr;
  document.querySelector('#pairing-code').textContent = token;
  document.querySelector('#mobile-url').textContent = mobileUrl;
  document.querySelector('#ca-fingerprint').textContent = pairing.caFingerprint;
  document.querySelector('#chosen-address').textContent = `${pairing.ip}:${pairing.port}`;
  document.querySelector('#other-ips').textContent =
    pairing.addresses
      .slice(1)
      .map((item) => `${item.address} (${item.interface})`)
      .join(' · ') || 'Nenhum outro IP local detectado';
}

async function loadPorts() {
  const data = await requestJson('/api/ports');
  if (data.warning) statusElement.textContent = `MIDI ainda indisponível: ${data.warning}`;
  const warning = document.querySelector('#midi-warning');
  if (data.warnings?.length) {
    warning.hidden = false;
    warning.textContent = data.warnings.join(' ');
  }
  for (const [id, list, selected, title] of [
    ['output', data.outputs, data.outputIndex, 'Escolha uma saída…'],
    ['input', data.inputs, data.inputIndex, 'Nenhuma entrada (opcional)'],
  ]) {
    const element = document.getElementById(id);
    element.replaceChildren();
    const none = document.createElement('option');
    none.value = '-1';
    none.textContent = title;
    element.append(none);
    for (const port of list) {
      const option = document.createElement('option');
      option.value = String(port.index);
      option.textContent = port.name || `Porta ${port.index}`;
      element.append(option);
    }
    element.value = String(selected);
  }
}

function formatAccountDate(value) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(timestamp);
}

function renderAccountStatus(status) {
  const authenticated = status.session?.authenticated === true;
  const entitlement = status.entitlement || {};
  const allowed = entitlement.allowed === true;
  const trialAvailable = status.trial_available === true;
  const loginForm = document.querySelector('#account-login');
  const actions = document.querySelector('#account-actions');
  const trialButton = document.querySelector('#account-trial-start');
  const logoutButton = document.querySelector('#account-logout');
  const licenseLink = document.querySelector('#account-license-link');
  const gateMessage = document.querySelector('#account-gate-message');
  const authFooter = document.querySelector('#account-auth-footer');
  const loginButton = document.querySelector('#account-login-submit');
  let deviceList = document.querySelector('#account-devices');
  if (!deviceList) {
    deviceList = document.createElement('div');
    deviceList.id = 'account-devices';
    gateMessage.after(deviceList);
  }
  deviceList.replaceChildren();
  if (authenticated && entitlement.code === 'DEVICE_REACTIVATION_REQUIRED') {
    const reactivate = document.createElement('button');
    reactivate.type = 'button';
    reactivate.textContent = 'Reativar este computador';
    reactivate.addEventListener('click', async () => {
      reactivate.disabled = true;
      try {
        const nextStatus = await requestJson('/api/account/devices/activate', { method: 'POST' });
        renderAccountStatus(nextStatus);
      } catch (error) {
        gateMessage.textContent = error.message;
        reactivate.disabled = false;
      }
    });
    deviceList.appendChild(reactivate);
  }
  if (authenticated && entitlement.code === 'DEVICE_LIMIT_REACHED') {
    for (const device of entitlement.devices || []) {
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
          renderAccountStatus(nextStatus);
        } catch (error) {
          gateMessage.textContent = error.message;
          remove.disabled = false;
        }
      });
      row.append(name, remove);
      deviceList.appendChild(row);
    }
    const upgrade = document.createElement('a');
    upgrade.href = 'https://fader-deck.vercel.app';
    upgrade.target = '_blank';
    upgrade.rel = 'noopener noreferrer';
    upgrade.textContent = 'Fazer upgrade (R$ 50)';
    deviceList.appendChild(upgrade);
  }

  accountEmailElement.hidden = !authenticated || !status.session.email;
  accountEmailElement.textContent = authenticated ? status.session.email || '' : '';
  loginForm.hidden = authenticated || !status.supabase_configured;
  authFooter.hidden = authenticated || !status.supabase_configured;
  loginButton.disabled = !status.supabase_configured;
  actions.hidden = !authenticated;
  trialButton.hidden = !authenticated || !trialAvailable;
  logoutButton.hidden = !authenticated;
  licenseLink.hidden = !authenticated || allowed || trialAvailable;

  if (!status.supabase_configured) {
    accountTitleElement.textContent = 'Acesso indisponível';
    accountDescriptionElement.textContent = 'Configure o acesso Supabase no processo local.';
    accountStateElement.textContent = 'Não autenticado';
    accountStateElement.dataset.state = 'unknown';
    gateMessage.hidden = false;
  } else if (!authenticated) {
    setAccountMode(accountMode);
    accountStateElement.textContent = 'Não autenticado';
    accountStateElement.dataset.state = 'unknown';
    gateMessage.hidden = true;
  } else {
    accountTitleElement.textContent = 'Sua conta FaderDeck';
    accountDescriptionElement.textContent =
      'Gerencie seu teste grátis e sua licença neste computador.';
    gateMessage.hidden = false;
  }

  if (authenticated && allowed && entitlement.kind === 'trial') {
    accountStateElement.textContent = 'Teste Grátis';
    accountStateElement.dataset.state = 'active';
    const endDate = formatAccountDate(entitlement.expires_at);
    gateMessage.textContent = endDate
      ? `Seu teste termina em ${endDate}.`
      : 'Seu teste está ativo.';
  } else if (authenticated && allowed && entitlement.kind === 'license') {
    accountStateElement.textContent =
      entitlement.plan_code === 'solo_30'
        ? 'Plano Individual — R$ 30 (1 dispositivo)'
        : entitlement.plan_code === 'multi_50'
          ? 'Plano Multi — R$ 50'
          : 'Licença ativa';
    accountStateElement.dataset.state = 'active';
    const endDate = formatAccountDate(entitlement.expires_at);
    gateMessage.textContent = endDate
      ? `Sua licença é válida até ${endDate}.`
      : 'Sua licença está ativa.';
  } else if (authenticated && trialAvailable) {
    accountStateElement.textContent = 'Teste gratuito disponível';
    accountStateElement.dataset.state = 'pending';
    gateMessage.textContent = 'Seu teste grátis de 7 dias está disponível para esta conta.';
  } else if (authenticated) {
    accountStateElement.textContent =
      entitlement.plan_code === 'solo_30'
        ? 'Plano Individual — R$ 30 (1 dispositivo)'
        : entitlement.plan_code === 'multi_50'
          ? 'Plano Multi — R$ 50'
          : 'Sem licença ativa';
    accountStateElement.dataset.state = 'expired';
    gateMessage.textContent =
      entitlement.message ||
      'Seu teste expirou ou não há uma licença ativa. Adquira uma licença para continuar.';
  }

  document.querySelector('#save').disabled = !allowed;
}

function showAccountFeedbackBanner(message, state = 'success') {
  accountFeedbackBannerElement.textContent = message;
  accountFeedbackBannerElement.dataset.state = state;
  accountFeedbackBannerElement.hidden = false;
}

function clearAccountFeedbackBanner() {
  accountFeedbackBannerElement.hidden = true;
  accountFeedbackBannerElement.textContent = '';
}

function setAccountMode(mode, { clearFeedback = false } = {}) {
  const modeChanged = accountMode !== mode;
  accountMode = mode;
  if (clearFeedback && modeChanged) clearAccountFeedbackBanner();
  if (modeChanged) {
    document.querySelector('#account-login-password').value = '';
    document.querySelector('#account-password-confirm').value = '';
    document.querySelector('#account-password-confirm').setCustomValidity('');
  }

  const isLogin = mode === 'login';
  const isSignup = mode === 'signup';
  const isReset = mode === 'reset';

  document.querySelector('#account-password-wrap').hidden = isReset;
  document.querySelector('#account-login-password').required = !isReset;
  document.querySelector('#account-login-password').autocomplete = isLogin
    ? 'current-password'
    : 'new-password';
  document.querySelector('#account-password-confirm-wrap').hidden = !isSignup;
  document.querySelector('#account-password-confirm').required = isSignup;
  document.querySelector('#account-remember-wrap').hidden = !isLogin;
  document.querySelector('#account-login-footer').hidden = !isLogin;
  document.querySelector('#account-signup-footer').hidden = !isSignup;
  document.querySelector('#account-reset-footer').hidden = !isReset;

  document.querySelector('#account-email-wrap').hidden = isReset && resetFlowState.step !== 1;
  document.querySelector('#account-login-email').disabled = isReset && resetFlowState.step !== 1;
  document.querySelector('#account-login-email').required = !isReset || resetFlowState.step === 1;
  document.querySelector('#account-reset-verify-code').disabled =
    !isReset || resetFlowState.step !== 2;
  document.querySelector('#account-reset-verify-code').required =
    isReset && resetFlowState.step === 2;
  document.querySelector('#account-reset-new-password').disabled =
    !isReset || resetFlowState.step !== 3;
  document.querySelector('#account-reset-new-password').required =
    isReset && resetFlowState.step === 3;
  document.querySelector('#account-reset-confirm-password').disabled =
    !isReset || resetFlowState.step !== 3;
  document.querySelector('#account-reset-confirm-password').required =
    isReset && resetFlowState.step === 3;
  if (isReset) {
    const step = resetFlowState.step || 1;
    document.querySelector('#account-reset-verify-code-wrap').hidden = step !== 2;
    document.querySelector('#account-reset-new-password-wrap').hidden = step !== 3;
    document.querySelector('#account-reset-confirm-password-wrap').hidden = step !== 3;

    document.querySelector('#account-reset-step-links').hidden = step === 1;
    document.querySelector('#account-reset-verify-email-display').hidden = step !== 2;
    document.querySelector('#account-reset-step2-resend').hidden = step !== 2;
    document.querySelector('#account-reset-step2-change-email').hidden = step !== 2;
    document.querySelector('#account-reset-step2-back').hidden = step !== 2;
    document.querySelector('#account-reset-step3-back').hidden = step !== 3;
  } else {
    document.querySelector('#account-reset-verify-code-wrap').hidden = true;
    document.querySelector('#account-reset-new-password-wrap').hidden = true;
    document.querySelector('#account-reset-confirm-password-wrap').hidden = true;
    document.querySelector('#account-reset-step-links').hidden = true;
  }

  accountTitleElement.textContent = isSignup
    ? 'Criar sua conta'
    : isReset
      ? 'Recuperar acesso'
      : 'Bem-vindo de volta';
  accountDescriptionElement.textContent = isSignup
    ? 'Cadastre-se para liberar seu teste grátis de 7 dias.'
    : isReset
      ? resetFlowState.step === 1
        ? 'Informe o e-mail da sua conta.'
        : resetFlowState.step === 2
          ? 'Digite o código enviado para o seu e-mail.'
          : 'Defina uma nova senha para sua conta.'
      : 'Entre com o e-mail da sua conta para ativar o FaderDeck.';
  document.querySelector('#account-login-submit').textContent = isSignup
    ? 'Criar conta e testar grátis'
    : isReset
      ? resetFlowState.step === 1
        ? 'Enviar código de recuperação'
        : resetFlowState.step === 2
          ? 'Validar código'
          : 'Salvar nova senha'
      : 'Entrar no FaderDeck';
}

async function loadAccountStatus() {
  try {
    const status = await requestJson('/api/account/status');
    renderAccountStatus(status);
  } catch (error) {
    accountStateElement.textContent = 'Indisponível';
    accountStateElement.dataset.state = 'expired';
    document.querySelector('#account-gate-message').textContent =
      'Não foi possível consultar a conta. O MIDI permanece bloqueado até validar o entitlement.';
    document.querySelector('#account-gate-message').hidden = false;
    document.querySelector('#save').disabled = true;
    accountMessageElement.textContent = error.message;
  }
}

document.querySelector('#account-login').addEventListener('submit', async (event) => {
  event.preventDefault();
  clearAccountFeedbackBanner();
  const email = document.querySelector('#account-login-email').value.trim();
  const passwordInput = document.querySelector('#account-login-password');
  const confirmPasswordInput = document.querySelector('#account-password-confirm');
  const submitButton = document.querySelector('#account-login-submit');
  const isSignup = accountMode === 'signup';
  const isReset = accountMode === 'reset';

  if (isReset) {
    if (resetFlowState.step === 1) {
      const loadingText = 'Enviando…';
      submitButton.disabled = true;
      submitButton.textContent = loadingText;
      accountMessageElement.textContent = loadingText;

      try {
        await requestJson('/api/account/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        resetFlowState.email = email;
        resetFlowState.step = 2;
        setAccountMode('reset', { clearFeedback: false });
        document.querySelector('#reset-verify-email').textContent = email;
        document.querySelector('#account-reset-verify-code').focus();
        accountMessageElement.textContent = '';
        showAccountFeedbackBanner(`Código enviado para ${email}. Verifique sua caixa de entrada.`);
      } catch (error) {
        accountMessageElement.textContent = '';
        showAccountFeedbackBanner(translateAccountError(error.message, accountMode), 'error');
      } finally {
        submitButton.disabled = false;
        setAccountMode(accountMode);
      }
      return;
    }

    if (resetFlowState.step === 2) {
      const code = document.querySelector('#account-reset-verify-code').value.trim();
      if (!/^\d{6,8}$/.test(code)) {
        showAccountFeedbackBanner('O código deve conter de 6 a 8 dígitos numéricos.', 'error');
        return;
      }

      const loadingText = 'Validando…';
      submitButton.disabled = true;
      submitButton.textContent = loadingText;
      accountMessageElement.textContent = loadingText;

      try {
        await requestJson('/api/account/reset-password/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: resetFlowState.email, code }),
        });
        resetFlowState.code = code;
        resetFlowState.step = 3;
        setAccountMode('reset', { clearFeedback: false });
        document.querySelector('#account-reset-new-password').focus();
        accountMessageElement.textContent = '';
        showAccountFeedbackBanner('Código verificado. Agora defina sua nova senha.');
      } catch (error) {
        accountMessageElement.textContent = '';
        showAccountFeedbackBanner(error.message, 'error');
      } finally {
        submitButton.disabled = false;
        setAccountMode(accountMode);
      }
      return;
    }

    if (resetFlowState.step === 3) {
      const newPassword = document.querySelector('#account-reset-new-password').value;
      const confirmPassword = document.querySelector('#account-reset-confirm-password').value;

      if (newPassword !== confirmPassword) {
        showAccountFeedbackBanner('As senhas não coincidem.', 'error');
        return;
      }

      if (newPassword.length < 8) {
        showAccountFeedbackBanner('A senha deve ter no mínimo 8 caracteres.', 'error');
        return;
      }

      const loadingText = 'Salvando…';
      submitButton.disabled = true;
      submitButton.textContent = loadingText;
      accountMessageElement.textContent = loadingText;

      try {
        await requestJson('/api/account/reset-password/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: newPassword }),
        });
        resetFlowState = { step: null, email: null, code: null };
        setAccountMode('login', { clearFeedback: true });
        document.querySelector('#account-login-password').value = '';
        document.querySelector('#account-reset-new-password').value = '';
        document.querySelector('#account-reset-confirm-password').value = '';
        accountMessageElement.textContent = '';
        showAccountFeedbackBanner('Senha alterada com sucesso! Entre com sua nova senha.');
      } catch (error) {
        accountMessageElement.textContent = '';
        showAccountFeedbackBanner(error.message, 'error');
      } finally {
        submitButton.disabled = false;
        setAccountMode(accountMode);
      }
      return;
    }
  }

  const loadingText = isSignup ? 'Criando conta…' : 'Entrando…';

  if (isSignup && passwordInput.value !== confirmPasswordInput.value) {
    confirmPasswordInput.setCustomValidity('As senhas não coincidem.');
    confirmPasswordInput.reportValidity();
    showAccountFeedbackBanner('As senhas não coincidem.', 'error');
    return;
  }
  confirmPasswordInput.setCustomValidity('');
  submitButton.disabled = true;
  submitButton.textContent = loadingText;
  accountMessageElement.textContent = loadingText;

  try {
    const status = await requestJson(isSignup ? '/api/account/signup' : '/api/account/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: passwordInput.value,
        ...(!isSignup ? { remember: document.querySelector('#account-remember').checked } : {}),
      }),
    });
    passwordInput.value = '';
    confirmPasswordInput.value = '';
    renderAccountStatus(status);
    if (status.confirmation_required) {
      setAccountMode('login');
      accountMessageElement.textContent = '';
      showAccountFeedbackBanner(ACCOUNT_EMAIL_SENT_MESSAGE);
    } else {
      accountMessageElement.textContent =
        status.message || (isSignup ? 'Conta criada.' : 'Sessão atualizada.');
    }
  } catch (error) {
    accountMessageElement.textContent = '';
    showAccountFeedbackBanner(translateAccountError(error.message, accountMode), 'error');
  } finally {
    submitButton.disabled = document.querySelector('#account-login').hidden;
    submitButton.textContent =
      accountMode === 'signup'
        ? 'Criar conta e testar grátis'
        : accountMode === 'reset'
          ? 'Enviar código de recuperação'
          : 'Entrar no FaderDeck';
  }
});

document.querySelector('#account-mode-login').addEventListener('click', () => {
  setAccountMode('login', { clearFeedback: true });
});

document.querySelector('#account-mode-signup').addEventListener('click', () => {
  setAccountMode('signup', { clearFeedback: true });
});

document.querySelector('#account-forgot-password').addEventListener('click', async () => {
  resetFlowState.step = 1;
  setAccountMode('reset', { clearFeedback: true });
  document.querySelector('#account-login-email').focus();
});

document.querySelector('#account-reset-back').addEventListener('click', () => {
  resetFlowState = { step: null, email: null, code: null };
  setAccountMode('login', { clearFeedback: true });
});

document.querySelector('#account-reset-step2-back').addEventListener('click', () => {
  resetFlowState.step = 1;
  setAccountMode('reset', { clearFeedback: true });
  document.querySelector('#account-login-email').focus();
});

document.querySelector('#account-reset-step2-change-email').addEventListener('click', () => {
  resetFlowState.step = 1;
  setAccountMode('reset', { clearFeedback: true });
  document.querySelector('#account-login-email').value = resetFlowState.email || '';
  document.querySelector('#account-login-email').focus();
});

document.querySelector('#account-reset-step2-resend').addEventListener('click', async () => {
  const button = document.querySelector('#account-reset-step2-resend');
  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = 'Reenviando…';

  try {
    await requestJson('/api/account/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: resetFlowState.email }),
    });
    showAccountFeedbackBanner('Código reenviado. Verifique seu e-mail.');
  } catch (error) {
    showAccountFeedbackBanner(error.message, 'error');
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
});

document.querySelector('#account-reset-step3-back').addEventListener('click', () => {
  resetFlowState.step = 2;
  setAccountMode('reset', { clearFeedback: true });
  document.querySelector('#account-reset-verify-code').focus();
});

document.querySelectorAll('[data-password-toggle]').forEach((button) => {
  button.addEventListener('click', () => {
    const input = document.getElementById(button.dataset.passwordToggle);
    const visible = input.type === 'password';
    input.type = visible ? 'text' : 'password';
    button.textContent = visible ? 'Ocultar' : 'Mostrar';
    button.setAttribute('aria-pressed', String(visible));
    button.setAttribute('aria-label', visible ? 'Ocultar senha' : 'Mostrar senha');
  });
});

document.querySelector('#account-trial-start').addEventListener('click', async () => {
  const button = document.querySelector('#account-trial-start');
  button.disabled = true;
  button.textContent = 'Iniciando…';
  accountMessageElement.textContent = 'Iniciando o teste gratuito…';

  try {
    const status = await requestJson('/api/account/trial/start', { method: 'POST' });
    renderAccountStatus(status);
    accountMessageElement.textContent = 'Teste gratuito atualizado.';
  } catch (error) {
    accountMessageElement.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = 'Iniciar teste grátis de 7 dias';
  }
});

document.querySelector('#account-logout').addEventListener('click', async () => {
  const button = document.querySelector('#account-logout');
  button.disabled = true;
  button.textContent = 'Trocando…';
  accountMessageElement.textContent = 'Trocando de conta…';

  try {
    const status = await requestJson('/api/account/logout', { method: 'POST' });
    renderAccountStatus(status);
    accountMessageElement.textContent = 'Sessão encerrada.';
  } catch (error) {
    accountMessageElement.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = 'Trocar de conta';
  }
});

document.querySelector('#save').addEventListener('click', async () => {
  statusElement.textContent = 'Aplicando…';
  try {
    const data = await requestJson('/api/ports/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        outputIndex: Number(document.querySelector('#output').value),
        inputIndex: Number(document.querySelector('#input').value),
      }),
    });
    statusElement.textContent = `Portas MIDI aplicadas. Saída: ${data.outputName || 'nenhuma'}. Entrada: ${data.inputName || 'nenhuma'}.`;
  } catch (error) {
    statusElement.textContent = error.message;
  }
});

document.querySelector('#test-phone').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(mobileUrl);
  } catch {}
  statusElement.textContent =
    'Link copiado, se o navegador permitir. Abra-o no iPhone agora; aguardando conexão do celular…';
  for (let attempt = 0; attempt < 15; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      const data = await requestJson('/api/status');
      if (data.remoteClients > 0) {
        statusElement.textContent = `Celular conectado à ponte. Endereço visto: ${data.remoteAddresses.join(', ')}`;
        return;
      }
    } catch {}
  }
  statusElement.textContent =
    'Ainda não recebi conexão do celular. Confira o mesmo Wi-Fi, o endereço do QR e o aviso do Firewall acima.';
});

document.querySelector('#renew-token').addEventListener('click', async () => {
  if (
    !confirm(
      'Gerar um novo código? Todos os celulares conectados precisarão escanear o QR novamente.',
    )
  )
    return;
  statusElement.textContent = 'Gerando novo código…';
  try {
    await requestJson('/api/token/regenerate', {
      method: 'POST',
      headers: { 'X-FaderDeck-Admin': 'rotate-token' },
    });
    location.reload();
  } catch (error) {
    statusElement.textContent = error.message;
  }
});

Promise.all([loadPairing(), loadPorts(), loadAccountStatus()]).catch((error) => {
  statusElement.textContent = `Não foi possível carregar a administração: ${error.message}`;
});
setAccountMode('login');
