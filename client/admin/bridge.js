'use strict';

const status = document.querySelector('#status');
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
  token = new URL(pairing.url).searchParams.get('bridgeToken') || '';
  document.querySelector('#pairing-qr').src = pairing.qr;
  document.querySelector('#pairing-code').textContent = token;
  document.querySelector('#mobile-url').textContent = mobileUrl;
  document.querySelector('#chosen-address').textContent = `${pairing.ip}:${pairing.port}`;
  document.querySelector('#other-ips').textContent = pairing.addresses.slice(1).map((item) => `${item.address} (${item.interface})`).join(' · ') || 'Nenhum outro IP local detectado';
}

async function loadPorts() {
  const data = await requestJson('/api/ports');
  if (data.warning) status.textContent = `MIDI ainda indisponível: ${data.warning}`;
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

document.querySelector('#save').addEventListener('click', async () => {
  status.textContent = 'Aplicando…';
  try {
    const data = await requestJson('/api/ports/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, outputIndex: Number(document.querySelector('#output').value), inputIndex: Number(document.querySelector('#input').value) }),
    });
    status.textContent = `Portas MIDI aplicadas. Saída: ${data.outputName || 'nenhuma'}. Entrada: ${data.inputName || 'nenhuma'}.`;
  } catch (error) {
    status.textContent = error.message;
  }
});

document.querySelector('#test-phone').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(mobileUrl); } catch {}
  status.textContent = 'Link copiado, se o navegador permitir. Abra-o no iPhone agora; aguardando conexão do celular…';
  for (let attempt = 0; attempt < 15; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      const data = await requestJson('/api/status');
      if (data.remoteClients > 0) {
        status.textContent = `Celular conectado à ponte. Endereço visto: ${data.remoteAddresses.join(', ')}`;
        return;
      }
    } catch {}
  }
  status.textContent = 'Ainda não recebi conexão do celular. Confira o mesmo Wi-Fi, o endereço do QR e o aviso do Firewall acima.';
});

document.querySelector('#renew-token').addEventListener('click', async () => {
  if (!confirm('Gerar um novo código? Todos os celulares conectados precisarão escanear o QR novamente.')) return;
  status.textContent = 'Gerando novo código…';
  try {
    await requestJson('/api/token/regenerate', { method: 'POST', headers: { 'X-FaderDeck-Admin': 'rotate-token' } });
    location.reload();
  } catch (error) {
    status.textContent = error.message;
  }
});

Promise.all([loadPairing(), loadPorts()]).catch((error) => {
  status.textContent = `Não foi possível carregar a administração: ${error.message}`;
});
