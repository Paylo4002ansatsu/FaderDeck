'use strict';

const statusElement = document.querySelector('#status');
const accountStateElement = document.querySelector('#account-state');
const accountEmailElement = document.querySelector('#account-email');
const accountMessageElement = document.querySelector('#account-message');
let token = '';
let mobileUrl = '';

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
  const loginButton = document.querySelector('#account-login-submit');

  accountEmailElement.hidden = !authenticated || !status.session.email;
  accountEmailElement.textContent = authenticated ? `Conta: ${status.session.email || ''}` : '';
  loginForm.hidden = authenticated || !status.supabase_configured;
  loginButton.disabled = !status.supabase_configured;
  actions.hidden = !authenticated;
  trialButton.hidden = !authenticated || !trialAvailable;
  logoutButton.hidden = !authenticated;
  licenseLink.hidden = !authenticated || allowed || trialAvailable;

  if (!status.supabase_configured) {
    accountStateElement.textContent = 'Não autenticado';
    accountStateElement.dataset.state = 'unknown';
    gateMessage.textContent =
      'Login indisponível neste ambiente. Configure o acesso Supabase no processo local.';
    gateMessage.hidden = false;
  } else if (!authenticated) {
    accountStateElement.textContent = 'Não autenticado';
    accountStateElement.dataset.state = 'unknown';
    gateMessage.textContent = 'Entre na sua conta para consultar o entitlement e liberar o MIDI.';
    gateMessage.hidden = false;
  } else if (allowed && entitlement.kind === 'trial') {
    accountStateElement.textContent = 'Teste de 7 dias ativo';
    accountStateElement.dataset.state = 'active';
    const endDate = formatAccountDate(entitlement.expires_at);
    gateMessage.textContent = endDate
      ? `Seu teste termina em ${endDate}.`
      : 'Seu teste está ativo.';
    gateMessage.hidden = false;
  } else if (allowed && entitlement.kind === 'license') {
    accountStateElement.textContent = 'Licença ativa';
    accountStateElement.dataset.state = 'active';
    const endDate = formatAccountDate(entitlement.expires_at);
    gateMessage.textContent = endDate
      ? `Sua licença é válida até ${endDate}.`
      : 'Sua licença está ativa.';
    gateMessage.hidden = false;
  } else if (trialAvailable) {
    accountStateElement.textContent = 'Teste gratuito disponível';
    accountStateElement.dataset.state = 'pending';
    gateMessage.textContent = 'Inicie seu teste gratuito de 7 dias para liberar o MIDI.';
    gateMessage.hidden = false;
  } else {
    accountStateElement.textContent = 'Expirado';
    accountStateElement.dataset.state = 'expired';
    gateMessage.textContent =
      'Não há entitlement ativo. Adquira uma licença para voltar a usar MIDI.';
    gateMessage.hidden = false;
  }

  document.querySelector('#save').disabled = !allowed;
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
  const email = document.querySelector('#account-login-email').value.trim();
  const passwordInput = document.querySelector('#account-login-password');
  const submitButton = document.querySelector('#account-login-submit');
  submitButton.disabled = true;
  accountMessageElement.textContent = 'Entrando…';

  try {
    const status = await requestJson('/api/account/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: passwordInput.value }),
    });
    passwordInput.value = '';
    renderAccountStatus(status);
    accountMessageElement.textContent = 'Sessão atualizada.';
  } catch (error) {
    accountMessageElement.textContent = error.message;
  } finally {
    submitButton.disabled = document.querySelector('#account-login').hidden;
  }
});

document.querySelector('#account-trial-start').addEventListener('click', async () => {
  const button = document.querySelector('#account-trial-start');
  button.disabled = true;
  accountMessageElement.textContent = 'Iniciando o teste gratuito…';

  try {
    const status = await requestJson('/api/account/trial/start', { method: 'POST' });
    renderAccountStatus(status);
    accountMessageElement.textContent = 'Teste gratuito atualizado.';
  } catch (error) {
    accountMessageElement.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#account-logout').addEventListener('click', async () => {
  const button = document.querySelector('#account-logout');
  button.disabled = true;
  accountMessageElement.textContent = 'Saindo…';

  try {
    const status = await requestJson('/api/account/logout', { method: 'POST' });
    renderAccountStatus(status);
    accountMessageElement.textContent = 'Sessão encerrada.';
  } catch (error) {
    accountMessageElement.textContent = error.message;
  } finally {
    button.disabled = false;
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
