'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const WebSocket = require('ws');
const QRCode = require('qrcode');
const { parseRequestTarget, createAtomicFileWriter } = require('./server-utils.cjs');

const configuredPort = Number(process.env.FADER_BRIDGE_PORT);
const BASE_PORT = Number.isInteger(configuredPort) && configuredPort >= 1 && configuredPort <= 65535 ? configuredPort : 8787;
const MAX_REQUEST_BODY_BYTES = 16 * 1024;
let PORT = BASE_PORT;
const HOST = '0.0.0.0';
const TOKEN_ROTATION_HEADER = 'x-faderdeck-admin';
const TOKEN_ROTATION_HEADER_VALUE = 'rotate-token';
const DATA_DIR = process.env.FADERDECK_DATA_DIR || __dirname;
const CLIENT_DIR = path.join(__dirname, 'client');
if (!fs.existsSync(path.join(CLIENT_DIR, 'index.html'))) console.warn('Painel não encontrado: use o fader-bridge.zip gerado pelo build');
let TOKEN_FILE = '';
function loadOrCreateToken(tokenFile) {
  try {
    const saved = fs.readFileSync(tokenFile, 'utf8').trim();
    if (/^[a-f0-9]{32}$/i.test(saved)) { try { fs.chmodSync(tokenFile, 0o600); } catch {} return saved; }
  } catch {}
  const token = crypto.randomBytes(16).toString('hex');
  try { fs.writeFileSync(tokenFile, `${token}\n`, { encoding: 'utf8', mode: 0o600 }); fs.chmodSync(tokenFile, 0o600); }
  catch (error) { console.warn('Não foi possível salvar .faderdeck-token; o código mudará no próximo reinício:', error.message); }
  return token;
}
let TOKEN = '';
let LAYOUT_FILE = '';
let layoutWriter = null;
const NO_MIDI_PORT = -1;
let selectedOutputIndex = NO_MIDI_PORT;
let selectedInputIndex = NO_MIDI_PORT;
let midiOutput = null;
let midiInput = null;
let virtualOutput = null;
const VIRTUAL_OUTPUT_INDEX = -2;
let midi;
let layout = { version: 0, pages: [], activePageId: '' };
let layoutPersistTimer = null;
let layoutInitialized = layout.pages.length > 0;
let layoutSeedOwner = null;
let initialized = false;
let shutdownPromise = null;

function initialize() {
  if (initialized) return;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  TOKEN_FILE = path.join(DATA_DIR, '.faderdeck-token');
  TOKEN = loadOrCreateToken(TOKEN_FILE);
  LAYOUT_FILE = path.join(DATA_DIR, 'faderdeck-layout.json');
  layoutWriter = createAtomicFileWriter(LAYOUT_FILE);
  try {
    const saved = JSON.parse(fs.readFileSync(LAYOUT_FILE, 'utf8'));
    if (saved && Number.isInteger(saved.version) && Array.isArray(saved.pages)) layout = saved;
  } catch {}
  layoutInitialized = layout.pages.length > 0;

  try {
    midi = require('@julusian/midi');
    if (process.platform === 'darwin') {
      try {
        virtualOutput = new midi.Output();
        virtualOutput.openVirtualPort('FaderDeck');
        midiOutput = virtualOutput;
        selectedOutputIndex = VIRTUAL_OUTPUT_INDEX;
        console.log('Porta MIDI virtual FaderDeck criada automaticamente.');
      } catch (error) {
        virtualOutput = null;
        console.warn('Não foi possível criar a porta virtual FaderDeck:', error.message);
      }
    }
  } catch (error) {
    console.error('\nNão foi possível carregar @julusian/midi. Rode npm install e confira os pré-requisitos nativos do seu sistema.\n', error.message);
    throw error;
  }
  initialized = true;
}

function networkAddresses() {
  const interfaces = os.networkInterfaces();
  const candidates = [];
  for (const [name, entries] of Object.entries(interfaces)) {
    if (/(docker|veth|virtualbox|vmware|tailscale|wireguard|utun|tun\d*|tap\d*|zerotier|hamachi|loopback|^lo$|^br-)/i.test(name)) continue;
    for (const entry of entries || []) {
      if (!entry || entry.family !== 'IPv4' || entry.internal || entry.address.startsWith('169.254.')) continue;
      const octets = entry.address.split('.').map(Number);
      const private192 = octets[0] === 192 && octets[1] === 168;
      const private10 = octets[0] === 10;
      const private172 = octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31;
      const carrierNat = octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127;
      if (carrierNat) continue;
      const score = private192 ? 100 : private10 ? 95 : private172 ? 75 : 20;
      candidates.push({ address: entry.address, interface: name, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

function networkAddress() { return networkAddresses()[0]?.address ?? '127.0.0.1'; }

function listPorts() {
  let output = null;
  let input = null;
  let warning = '';
  const outputs = [];
  const inputs = [];
  try {
    output = new midi.Output();
    input = new midi.Input();
    for (let index = 0; index < output.getPortCount(); index += 1) outputs.push({ index, name: output.getPortName(index) });
    if (process.platform === 'darwin' && virtualOutput) outputs.unshift({ index: VIRTUAL_OUTPUT_INDEX, name: 'FaderDeck (virtual)' });
    for (let index = 0; index < input.getPortCount(); index += 1) inputs.push({ index, name: input.getPortName(index) });
  } catch (error) {
    warning = error.message || 'Não foi possível inicializar MIDI neste computador.';
  } finally {
  try { if (output !== virtualOutput) output?.closePort(); } catch {}
    try { input?.closePort(); } catch {}
  }
  const warnings = virtualOutput && outputs.some((port) => port.index !== VIRTUAL_OUTPUT_INDEX && /\bFaderDeck\b/i.test(port.name))
    ? ['Há outra porta MIDI chamada FaderDeck (possivelmente IAC). Use somente uma das duas para evitar duplicidade.']
    : [];
  return { outputs, inputs, warnings, ...(warning ? { warning } : {}) };
}

function closeMidiPorts() {
  if (midiInput) {
    try { midiInput.removeAllListeners('message'); midiInput.closePort(); } catch {}
    midiInput = null;
  }
  if (midiOutput && midiOutput !== virtualOutput) {
    try { midiOutput.closePort(); } catch {}
    midiOutput = null;
  }
  if (virtualOutput && selectedOutputIndex === VIRTUAL_OUTPUT_INDEX) midiOutput = virtualOutput;
}

function broadcast(payload) {
  const frame = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN && client.authorized) client.send(frame);
  }
}

function selectMidiPorts(outputIndex, inputIndex) {
  const ports = listPorts();
  const outIndex = Number.isInteger(outputIndex) ? outputIndex : NO_MIDI_PORT;
  const inIndex = Number.isInteger(inputIndex) ? inputIndex : NO_MIDI_PORT;
  const validVirtualOutput = outIndex === VIRTUAL_OUTPUT_INDEX && Boolean(virtualOutput);
  const validPhysicalOutput = outIndex >= 0 && ports.outputs.some((port) => port.index === outIndex);
  if (outIndex !== NO_MIDI_PORT && !validVirtualOutput && !validPhysicalOutput) throw new Error('A saída MIDI selecionada não está mais disponível.');
  if (inIndex !== NO_MIDI_PORT && (inIndex < 0 || !ports.inputs.some((port) => port.index === inIndex))) throw new Error('A entrada MIDI selecionada não está mais disponível.');
  closeMidiPorts();
  selectedOutputIndex = outIndex;
  selectedInputIndex = inIndex;
  if (selectedOutputIndex === VIRTUAL_OUTPUT_INDEX && virtualOutput) midiOutput = virtualOutput;
  else if (selectedOutputIndex >= 0) {
    midiOutput = new midi.Output();
    midiOutput.openPort(selectedOutputIndex);
  } else midiOutput = null;
  if (selectedInputIndex >= 0) {
    midiInput = new midi.Input();
    midiInput.ignoreTypes(false, false, false);
    midiInput.on('message', (_deltaTime, message) => {
      broadcast({ type: 'midi', direction: 'in', data: Array.from(message) });
    });
    midiInput.openPort(selectedInputIndex);
  }
  return { outputIndex: selectedOutputIndex, inputIndex: selectedInputIndex };
}

function isLoopbackRequest(request) {
  const address = request.socket.remoteAddress || '';
  return address === '127.0.0.1' || address === '::1' || address.startsWith('::ffff:127.0.0.1');
}

function isLoopbackHost(hostname) {
  const normalized = hostname.replace(/^::ffff:/, '');
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1' || normalized === '[::1]';
}

function isSameOriginLocalAdminRequest(request) {
  const hostHeader = request.headers.host;
  const originHeader = request.headers.origin;
  if (typeof hostHeader !== 'string' || typeof originHeader !== 'string') return false;
  const protocol = request.socket.encrypted ? 'https:' : 'http:';
  try {
    const hostUrl = new URL(`${protocol}//${hostHeader}`);
    const originUrl = new URL(originHeader);
    const effectivePort = Number(hostUrl.port || (protocol === 'https:' ? 443 : 80));
    return hostUrl.origin === originUrl.origin
      && isLoopbackHost(hostUrl.hostname)
      && isLoopbackHost(originUrl.hostname)
      && effectivePort === PORT;
  } catch {
    return false;
  }
}

function layoutPayload() { return { type: 'layout', layout }; }

function persistLayout() {
  if (!layoutWriter) return Promise.reject(new Error('O armazenamento do layout ainda não foi inicializado.'));
  return layoutWriter(JSON.stringify(layout, null, 2));
}

function scheduleLayoutSave() {
  if (layoutPersistTimer) clearTimeout(layoutPersistTimer);
  layoutPersistTimer = setTimeout(() => {
    layoutPersistTimer = null;
    persistLayout().catch((error) => console.error('Falha ao salvar layout:', error.message));
  }, 500);
}

function hasLocalHostHeader(request) {
  try {
    const hostUrl = new URL(`http://${request.headers.host || ''}`);
    return isLoopbackHost(hostUrl.hostname) && Number(hostUrl.port || 80) === PORT;
  } catch { return false; }
}

function sendJson(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    let settled = false;
    request.on('data', (chunk) => {
      if (settled) return;
      totalBytes += chunk.length;
      if (totalBytes > MAX_REQUEST_BODY_BYTES) {
        settled = true;
        const error = new Error('Corpo da requisição excede o limite de 16 KB.');
        error.statusCode = 413;
        reject(error);
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (settled) return;
      if (totalBytes === 0) { settled = true; resolve({}); return; }
      try {
        settled = true;
        resolve(JSON.parse(Buffer.concat(chunks, totalBytes).toString('utf8')));
      } catch {
        settled = true;
        const error = new Error('JSON inválido.');
        error.statusCode = 400;
        reject(error);
      }
    });
    request.on('aborted', () => {
      if (settled) return;
      settled = true;
      const error = new Error('A requisição foi interrompida.');
      error.statusCode = 400;
      reject(error);
    });
    request.on('error', (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp4': 'video/mp4', '.webmanifest': 'application/manifest+json', '.json': 'application/json; charset=utf-8', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon' })[ext] || 'application/octet-stream';
}

async function bridgePage() {
  const addresses = networkAddresses();
  const ip = addresses[0]?.address ?? '127.0.0.1';
  const otherIps = addresses.slice(1);
  const mobileUrl = `http://${ip}:${PORT}/?bridgeToken=${encodeURIComponent(TOKEN)}`;
  const qr = await QRCode.toDataURL(mobileUrl, { margin: 1, width: 204, color: { dark: '#13201f', light: '#ffffff' } });
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#111416"><title>FaderDeck · Ponte local</title><style>
*{box-sizing:border-box}body{margin:0;background:#101416;color:#edf3f1;font:14px Inter,system-ui,-apple-system,Segoe UI,sans-serif}.wrap{max-width:980px;margin:auto;padding:28px 20px 50px}.top{display:flex;align-items:center;gap:13px;margin-bottom:23px}.mark{width:38px;height:38px;border-radius:11px;background:#162524;border:1px solid #31514e;display:flex;align-items:center;justify-content:center;color:#40ded0;font-size:20px}.top small{display:block;color:#82918e;font-size:9px;letter-spacing:.16em;margin-top:3px}.top strong{letter-spacing:.12em;font-size:14px}.top strong span{color:#40ded0}.layout{display:grid;grid-template-columns:1fr 300px;gap:18px}.card{border:1px solid #2b3738;border-radius:15px;background:#171e20;padding:21px}.card h1{font-size:21px;margin:2px 0 7px}.card p{font-size:12px;color:#99a7a3;line-height:1.6;margin:0 0 18px}.label{display:block;color:#9ba9a5;font-size:10px;margin:15px 0 6px}select{width:100%;height:40px;border:1px solid #344140;border-radius:8px;background:#111819;color:#edf3f1;padding:0 10px;font:12px inherit}button{min-height:39px;border:1px solid #40ded0;border-radius:8px;background:#40ded0;color:#071a18;padding:0 14px;font-weight:700;cursor:pointer;margin-top:12px}button:hover{background:#6cf0e4}.full{width:100%}.secondary{background:#202a2c;color:#edf3f1;border-color:#394747}.note{border:1px solid #354341;border-radius:8px;padding:10px;margin-top:13px;color:#bdc8c5;font-size:10px;line-height:1.55}.warn{border-color:#9b6e28;background:#352813;color:#ffe0a8}.side{text-align:center}.side h2{font-size:14px;margin:0 0 6px}.side p{font-size:10px;margin:0 0 15px}.qr{width:214px;height:214px;background:#fff;border-radius:10px;padding:5px;margin:0 auto 14px}.qr img{display:block;width:100%;height:100%}.code{font:700 19px ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.15em;color:#40ded0;overflow-wrap:anywhere}.url{overflow-wrap:anywhere;font:10px ui-monospace,monospace;color:#aab7b3;margin-top:8px}.ip{font:700 12px ui-monospace,monospace;color:#fff}.other-ips{margin-top:6px;color:#aab7b3;font:10px ui-monospace,monospace;overflow-wrap:anywhere}.status{min-height:22px;font-size:10px;color:#40ded0;margin-top:8px;line-height:1.45}.pill{display:inline-flex;align-items:center;gap:6px;color:#81dfa5;font-size:9px;letter-spacing:.1em}.dot{width:6px;height:6px;border-radius:50%;background:#81dfa5}.footer{color:#a5b1ae;font-size:9px;margin-top:14px;line-height:1.6}.row{display:flex;gap:8px}.row button{flex:1;font-size:10px;padding:0 8px}@media(max-width:700px){.wrap{padding:18px 12px}.layout{grid-template-columns:1fr}.side{order:-1}.card{padding:16px}.qr{width:184px;height:184px}}
</style></head><body><main class="wrap"><header class="top"><div class="mark">≋</div><div><strong>FADER<span>DECK</span></strong><small>PONTE MIDI LOCAL</small></div></header><div class="layout"><section class="card"><div class="pill"><i class="dot"></i> PONTE ATIVA</div><h1>Conecte a DAW</h1><p>Escolha a porta MIDI virtual que a DAW recebe. No Windows, use loopMIDI; no macOS, a ponte cria a porta virtual FaderDeck automaticamente.</p><label class="label" for="output">Saída MIDI para a DAW</label><select id="output"></select><label class="label" for="input">Entrada MIDI para MIDI Learn (opcional)</label><select id="input"></select><button id="save" class="full">Aplicar portas MIDI</button><div id="midi-warning" class="note warn" hidden></div><div class="note"><strong>Firewall do Mac:</strong> se o iPhone não abrir o QR, permita conexões de entrada para Node.js em <em>Ajustes do Sistema → Rede → Firewall → Opções</em>. Ambos precisam estar no mesmo Wi-Fi; redes de convidados podem bloquear comunicação entre aparelhos.</div><div class="note">Endereço escolhido: <span class="ip">${ip}:${PORT}</span><br><span class="label">Outros IPs disponíveis nesta máquina</span><div class="other-ips">${otherIps.length ? otherIps.map((item) => `${item.address} (${item.interface})`).join(' · ') : 'Nenhum outro IP local detectado'}</div></div><div id="status" class="status" role="status" aria-live="polite"></div><div class="footer">O código fica salvo em <code>.faderdeck-token</code> e permanece igual após reiniciar. Gerar outro código invalida o anterior e exige novo pareamento nos celulares.</div></section><section class="card side"><h2>Conectar celular</h2><p>Escaneie este QR com a câmera do iPhone conectado à mesma rede Wi-Fi.</p><div class="qr"><img alt="QR para abrir FaderDeck nesta rede" src="${qr}"></div><div class="code">${TOKEN}</div><div class="url">${mobileUrl}</div><div class="row"><button id="test-phone" type="button">Testar celular</button><button id="renew-token" class="secondary" type="button">Gerar novo código</button></div></section></div></main><script>
const token=${JSON.stringify(TOKEN)},mobileUrl=${JSON.stringify(mobileUrl)},status=document.querySelector('#status');async function load(){try{const r=await fetch('/api/ports',{cache:'no-store'});const d=await r.json();if(d.warning)status.textContent='MIDI ainda indisponível: '+d.warning;const w=document.querySelector('#midi-warning');if(d.warnings?.length){w.hidden=false;w.textContent=d.warnings.join(' ')}for(const [id,list,selected,title] of [['output',d.outputs,d.outputIndex,'Escolha uma saída…'],['input',d.inputs,d.inputIndex,'Nenhuma entrada (opcional)']]){const el=document.getElementById(id);el.innerHTML='';const none=document.createElement('option');none.value='-1';none.textContent=title;el.append(none);for(const p of list){const o=document.createElement('option');o.value=p.index;o.textContent=p.name||('Porta '+p.index);el.append(o)}el.value=String(selected)}}catch(e){status.textContent='Não foi possível ler as portas MIDI: '+e.message}}document.querySelector('#save').addEventListener('click',async()=>{status.textContent='Aplicando…';try{const r=await fetch('/api/ports/select',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,outputIndex:Number(document.querySelector('#output').value),inputIndex:Number(document.querySelector('#input').value)})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Erro ao aplicar');status.textContent='Portas MIDI aplicadas. Saída: '+(d.outputName||'nenhuma')+'. Entrada: '+(d.inputName||'nenhuma')+'.'}catch(e){status.textContent=e.message}});document.querySelector('#test-phone').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(mobileUrl)}catch{}status.textContent='Link copiado, se o navegador permitir. Abra-o no iPhone agora; aguardando conexão do celular…';for(let i=0;i<15;i++){await new Promise(r=>setTimeout(r,1000));try{const r=await fetch('/api/status',{cache:'no-store'});const d=await r.json();if(d.remoteClients>0){status.textContent='Celular conectado à ponte. Endereço visto: '+d.remoteAddresses.join(', ');return}}catch{}}status.textContent='Ainda não recebi conexão do celular. Confira o mesmo Wi-Fi, o endereço do QR e o aviso do Firewall acima.'});document.querySelector('#renew-token').addEventListener('click',async()=>{if(!confirm('Gerar um novo código? Todos os celulares conectados precisarão escanear o QR novamente.'))return;status.textContent='Gerando novo código…';try{const r=await fetch('/api/token/regenerate',{method:'POST',headers:{'X-FaderDeck-Admin':'rotate-token'}});const d=await r.json();if(!r.ok)throw new Error(d.error||'Não foi possível renovar');location.reload()}catch(e){status.textContent=e.message}});load();
</script></body></html>`;
}

function rotateToken() {
  const nextToken = crypto.randomBytes(16).toString('hex');
  fs.writeFileSync(TOKEN_FILE, `${nextToken}\n`, { encoding: 'utf8', mode: 0o600 });
  fs.chmodSync(TOKEN_FILE, 0o600);
  TOKEN = nextToken;
  for (const client of wss.clients) { try { client.close(4001, 'Código renovado'); } catch {} }
  return nextToken;
}

const server = http.createServer(async (request, response) => {
  let requestUrl;
  let pathname;
  try {
    ({ url: requestUrl, pathname } = parseRequestTarget(request.url || '/', request.headers.host || 'localhost'));
  } catch {
    return sendJson(response, 400, { error: 'Requisição inválida.' });
  }
  try {
    if ((pathname === '/bridge' || pathname === '/bridge/' || pathname.startsWith('/api/ports') || pathname === '/api/status' || pathname === '/api/pairing' || pathname === '/api/token/regenerate') && !isLoopbackRequest(request)) return sendJson(response, 403, { error: 'Abra a administração no próprio computador em http://127.0.0.1:8787/bridge.' });
    if (pathname === '/api/auth') {
      response.setHeader('Access-Control-Allow-Origin', '*');
      response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      response.setHeader('Access-Control-Allow-Private-Network', 'true');
      if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
      if (request.method !== 'GET') return sendJson(response, 405, { error: 'Método não permitido.' });
      if (!isLoopbackRequest(request) && !safeEqual(requestUrl.searchParams.get('token') || '', TOKEN)) return sendJson(response, 401, { error: 'Código de pareamento inválido.' });
      return sendJson(response, 200, { authorized: true });
    }
    if (request.method === 'POST' && pathname === '/api/token/regenerate') {
      if (!isSameOriginLocalAdminRequest(request) || request.headers[TOKEN_ROTATION_HEADER] !== TOKEN_ROTATION_HEADER_VALUE) {
        return sendJson(response, 403, { error: 'A rotação do código só é permitida pela página /bridge aberta neste computador.' });
      }
      rotateToken();
      return sendJson(response, 200, { tokenUpdated: true });
    }
    if (request.method === 'GET' && pathname === '/api/pairing') {
      if (!hasLocalHostHeader(request)) return sendJson(response, 403, { error: 'O pareamento só pode ser consultado neste computador.' });
      const ip = networkAddress();
      const url = `http://${ip}:${PORT}/?bridgeToken=${encodeURIComponent(TOKEN)}`;
      const qr = await QRCode.toDataURL(url, { margin: 1, width: 280, color: { dark: '#13201f', light: '#ffffff' } });
      return sendJson(response, 200, {
        url, qr, ip, port: PORT,
        addresses: networkAddresses().map((item) => ({ address: item.address, interface: item.interface })),
      });
    }
    if (request.method === 'GET' && pathname === '/api/status') {
      const remote = [...wss.clients].filter((client) => client.readyState === WebSocket.OPEN && !isLoopbackHost(client._socket?.remoteAddress || ''));
      return sendJson(response, 200, { clients: wss.clients.size, remoteClients: remote.length, remoteAddresses: [...new Set(remote.map((client) => client._socket?.remoteAddress).filter(Boolean))] });
    }
    if (request.method === 'GET' && pathname === '/api/ports') {
      const ports = listPorts();
      return sendJson(response, 200, { ...ports, outputIndex: selectedOutputIndex, inputIndex: selectedInputIndex });
    }
    if (pathname === '/api/layout' && request.method === 'GET') {
      if (!isLoopbackRequest(request) && !safeEqual(requestUrl.searchParams.get('token') || '', TOKEN)) return sendJson(response, 401, { error: 'Código de pareamento inválido.' });
      return sendJson(response, 200, layout);
    }
    if (pathname === '/api/layout' && request.method === 'PUT') {
      const body = await readBody(request);
      if (!isLoopbackRequest(request) && !safeEqual(String(body.token || ''), TOKEN)) return sendJson(response, 401, { error: 'Código de pareamento inválido.' });
      if (!body.layout || !Array.isArray(body.layout.pages) || body.layout.pages.length === 0 || body.layout.pages.length > 100) return sendJson(response, 400, { error: 'Layout inválido.' });
      layout = { version: Math.max(layout.version + 1, Number(body.layout.version) || 0), pages: body.layout.pages, activePageId: String(body.layout.activePageId || body.layout.pages[0]?.id || '') };
      layoutInitialized = true;
      await persistLayout();
      broadcast(layoutPayload());
      return sendJson(response, 200, layout);
    }
    if (request.method === 'POST' && pathname === '/api/ports/select') {
      const body = await readBody(request);
      if (!safeEqual(String(body.token || ''), TOKEN)) return sendJson(response, 401, { error: 'Código de pareamento inválido.' });
      const selected = selectMidiPorts(Number(body.outputIndex), Number(body.inputIndex));
      const ports = listPorts();
      return sendJson(response, 200, { ...selected, outputName: ports.outputs.find((port) => port.index === selected.outputIndex)?.name || '', inputName: ports.inputs.find((port) => port.index === selected.inputIndex)?.name || '' });
    }
    if (request.method !== 'GET') return sendJson(response, 405, { error: 'Método não permitido.' });
    if (pathname === '/bridge' || pathname === '/bridge/') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(await bridgePage());
      return;
    }

    let relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    let filePath = path.resolve(CLIENT_DIR, relative);
    if (!filePath.startsWith(CLIENT_DIR + path.sep) && filePath !== CLIENT_DIR) return sendJson(response, 403, { error: 'Caminho inválido.' });
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      if (!path.extname(relative)) filePath = path.join(CLIENT_DIR, 'index.html');
      else return sendJson(response, 404, { error: 'Arquivo não encontrado.' });
    }
    response.writeHead(200, { 'Content-Type': contentType(filePath), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    fs.createReadStream(filePath).pipe(response);
  } catch (error) {
    const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
    if (statusCode >= 500) console.error('Falha ao tratar requisição:', error);
    if (!response.headersSent) sendJson(response, statusCode, { error: statusCode >= 500 ? 'Erro interno.' : error?.message || 'Requisição inválida.' });
    else response.destroy();
  }
});

function safeEqual(candidate, expected) {
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const wss = new WebSocket.Server({ noServer: true, maxPayload: 1024 * 1024 });
server.on('upgrade', (request, socket, head) => {
  let requestUrl;
  try {
    ({ url: requestUrl } = parseRequestTarget(request.url || '/', request.headers.host || 'localhost'));
  } catch {
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    return;
  }
  const localBrowser = isLoopbackHost(requestUrl.hostname) && isLoopbackRequest(request);
  if (requestUrl.pathname !== '/ws' || (!localBrowser && !safeEqual(requestUrl.searchParams.get('token') || '', TOKEN))) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }
  try {
    wss.handleUpgrade(request, socket, head, (client) => {
      client.authorized = true;
      wss.emit('connection', client, request);
    });
  } catch {
    socket.destroy();
  }
});

wss.on('connection', (socket) => {
  if (!layoutInitialized && !layoutSeedOwner) layoutSeedOwner = socket;
  socket.send(JSON.stringify({ type: 'ready' }));
  socket.send(JSON.stringify(layoutPayload()));
  socket.on('close', () => { if (!layoutInitialized && socket === layoutSeedOwner) layoutSeedOwner = null; });
  socket.on('message', (raw) => {
    let message;
    try { message = JSON.parse(raw.toString()); } catch { return; }
    if (message.type === 'ping') {
      socket.send(JSON.stringify({ type: 'pong', sentAt: Number(message.sentAt) || 0 }));
      return;
    }
    if (message.type === 'layout' && message.layout && Array.isArray(message.layout.pages) && message.layout.pages.length > 0 && message.layout.pages.length <= 100) {
      if (!layoutInitialized && socket !== layoutSeedOwner) { socket.send(JSON.stringify(layoutPayload())); return; }
      layout = { version: Math.max(layout.version + 1, Number(message.layout.version) || 0), pages: message.layout.pages, activePageId: String(message.layout.activePageId || message.layout.pages[0]?.id || '') };
      layoutInitialized = true;
      scheduleLayoutSave();
      broadcast({ ...layoutPayload(), sourceId: typeof message.sourceId === 'string' ? message.sourceId.slice(0, 100) : '' });
      return;
    }
    if (message.type !== 'midi' || !Array.isArray(message.data) || message.data.length > 256) return;
    if (!midiOutput || selectedOutputIndex === NO_MIDI_PORT) {
      socket.send(JSON.stringify({ type: 'error', message: 'Selecione uma saída MIDI na tela da ponte.' }));
      return;
    }
    const bytes = message.data.map((value) => Number(value));
    if (bytes.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return;
    try {
      for (const midiMessage of splitMessages(bytes)) midiOutput.sendMessage(midiMessage);
    } catch (error) {
      socket.send(JSON.stringify({ type: 'error', message: `Falha ao enviar MIDI: ${error.message}` }));
    }
  });
});

function splitMessages(bytes) {
  const output = [];
  for (let index = 0; index < bytes.length;) {
    const status = bytes[index];
    if (status < 0x80) { index += 1; continue; }
    const kind = status & 0xf0;
    const length = kind === 0xc0 || kind === 0xd0 ? 2 : 3;
    if (index + length > bytes.length) break;
    output.push(bytes.slice(index, index + length));
    index += length;
  }
  return output;
}

server.on('error', (error) => {
  if (error.code !== 'EADDRINUSE') console.error(`Erro no servidor: ${error.message}`);
});

async function start(startPort = BASE_PORT) {
  if (server.listening) return PORT;
  initialize();
  const firstPort = Number.isInteger(startPort) && startPort >= 0 && startPort <= 65535 ? startPort : BASE_PORT;
  const lastPort = firstPort === 0 ? 0 : Math.min(firstPort + 20, 65535);
  let lastError;

  for (let candidate = firstPort; candidate <= lastPort; candidate += 1) {
    PORT = candidate;
    try {
      await new Promise((resolve, reject) => {
        const onError = (error) => {
          server.off('listening', onListening);
          reject(error);
        };
        const onListening = () => {
          server.off('error', onError);
          PORT = server.address().port;
          resolve();
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(candidate, HOST);
      });
      console.log(`FaderDeck · ponte ativa na porta ${PORT}.`);
      if (require.main === module) {
        const ip = networkAddress();
        console.log(`Painel no celular: ${mobileUrl()}`);
        console.log(`Admin / QR:        http://127.0.0.1:${PORT}/bridge`);
        console.log(`Código de pareamento: ${TOKEN}`);
        console.log(`Endereço de rede: ${ip}. Escaneie o QR na página de administração.`);
        console.log('Pressione Ctrl+C para encerrar.\n');
      }
      return PORT;
    } catch (error) {
      if (error.code !== 'EADDRINUSE') throw error;
      lastError = error;
    }
  }

  throw new Error(`Nenhuma porta livre encontrada a partir de ${firstPort}.`, { cause: lastError });
}

async function shutdown() {
  if (shutdownPromise) return shutdownPromise;
  shutdownPromise = (async () => {
    if (layoutPersistTimer) {
      clearTimeout(layoutPersistTimer);
      layoutPersistTimer = null;
    }
    if (initialized && layoutWriter) {
      try { await persistLayout(); } catch (error) { console.error('Falha ao salvar layout ao encerrar:', error.message); }
    }
    closeMidiPorts();
    for (const client of wss.clients) { try { client.terminate(); } catch {} }
    if (!server.listening) return;
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        server.closeAllConnections?.();
        resolve();
      }, 1500);
      timer.unref?.();
      try {
        server.close(() => { clearTimeout(timer); resolve(); });
      } catch {
        clearTimeout(timer);
        resolve();
      }
    });
  })();
  try { await shutdownPromise; } finally { shutdownPromise = null; }
}

if (require.main === module) {
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    shutdown().then(() => { process.exitCode = 0; }).catch((error) => {
      console.error(`Falha ao encerrar a ponte: ${error.message}`);
      process.exitCode = 1;
    });
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  start().catch((error) => {
    console.error(`Não foi possível iniciar a ponte: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  server,
  start,
  stop: shutdown,
  shutdown,
  rotateToken,
  getToken: () => TOKEN,
  getPort: () => PORT,
  dataDir: DATA_DIR,
  networkAddress,
  networkAddresses,
  mobileUrl: () => `http://${networkAddress()}:${PORT}/?bridgeToken=${encodeURIComponent(TOKEN)}`,
  hasMidi: () => Boolean(midiOutput),
};
