'use strict';

const fs = require('node:fs');
const path = require('node:path');
const QRCode = require('qrcode');
const { parseRequestTarget } = require('../server-utils.cjs');
const { safeEqual, isLoopbackRequest, isSameOriginLocalAdminRequest, hasLocalHostHeader } = require('./auth.cjs');

const MAX_REQUEST_BODY_BYTES = 16 * 1024;
const TOKEN_ROTATION_HEADER = 'x-faderdeck-admin';
const TOKEN_ROTATION_HEADER_VALUE = 'rotate-token';

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

function createHttpHandler({
  clientDir,
  getPort,
  getToken,
  getLayout,
  setLayout,
  setLayoutInitialized,
  getMidiManager,
  getConnectionStatus,
  networkAddress,
  networkAddresses,
  rotateToken,
  persistLayout,
  broadcast,
}) {
  return async (request, response) => {
    let requestUrl;
    let pathname;
    try {
      ({ url: requestUrl, pathname } = parseRequestTarget(request.url || '/', request.headers.host || 'localhost'));
    } catch {
      return sendJson(response, 400, { error: 'Requisição inválida.' });
    }

    try {
      if ((pathname === '/bridge' || pathname === '/bridge/' || pathname.startsWith('/api/ports') || pathname === '/api/status' || pathname === '/api/pairing' || pathname === '/api/token/regenerate') && !isLoopbackRequest(request)) {
        return sendJson(response, 403, { error: 'Abra a administração no próprio computador em http://127.0.0.1:8787/bridge.' });
      }
      if (pathname === '/api/auth') {
        response.setHeader('Access-Control-Allow-Origin', '*');
        response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        response.setHeader('Access-Control-Allow-Private-Network', 'true');
        if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
        if (request.method !== 'GET') return sendJson(response, 405, { error: 'Método não permitido.' });
        if (!isLoopbackRequest(request) && !safeEqual(requestUrl.searchParams.get('token') || '', getToken())) return sendJson(response, 401, { error: 'Código de pareamento inválido.' });
        return sendJson(response, 200, { authorized: true });
      }
      if (request.method === 'POST' && pathname === '/api/token/regenerate') {
        if (!isSameOriginLocalAdminRequest(request, getPort()) || request.headers[TOKEN_ROTATION_HEADER] !== TOKEN_ROTATION_HEADER_VALUE) {
          return sendJson(response, 403, { error: 'A rotação do código só é permitida pela página /bridge aberta neste computador.' });
        }
        rotateToken();
        return sendJson(response, 200, { tokenUpdated: true });
      }
      if (request.method === 'GET' && pathname === '/api/pairing') {
        if (!hasLocalHostHeader(request, getPort())) return sendJson(response, 403, { error: 'O pareamento só pode ser consultado neste computador.' });
        const ip = networkAddress();
        const port = getPort();
        const url = `http://${ip}:${port}/?bridgeToken=${encodeURIComponent(getToken())}`;
        const qr = await QRCode.toDataURL(url, { margin: 1, width: 280, color: { dark: '#13201f', light: '#ffffff' } });
        return sendJson(response, 200, {
          url, qr, ip, port,
          addresses: networkAddresses().map((item) => ({ address: item.address, interface: item.interface })),
        });
      }
      if (request.method === 'GET' && pathname === '/api/status') {
        return sendJson(response, 200, getConnectionStatus());
      }
      if (request.method === 'GET' && pathname === '/api/ports') {
        const midiManager = getMidiManager();
        const ports = midiManager.listPorts();
        return sendJson(response, 200, { ...ports, outputIndex: midiManager.selectedOutputIndex, inputIndex: midiManager.selectedInputIndex });
      }
      if (pathname === '/api/layout' && request.method === 'GET') {
        if (!isLoopbackRequest(request) && !safeEqual(requestUrl.searchParams.get('token') || '', getToken())) return sendJson(response, 401, { error: 'Código de pareamento inválido.' });
        return sendJson(response, 200, getLayout());
      }
      if (pathname === '/api/layout' && request.method === 'PUT') {
        const body = await readBody(request);
        if (!isLoopbackRequest(request) && !safeEqual(String(body.token || ''), getToken())) return sendJson(response, 401, { error: 'Código de pareamento inválido.' });
        const currentLayout = getLayout();
        if (!body.layout || !Array.isArray(body.layout.pages) || body.layout.pages.length === 0 || body.layout.pages.length > 100) return sendJson(response, 400, { error: 'Layout inválido.' });
        const nextLayout = { version: Math.max(currentLayout.version + 1, Number(body.layout.version) || 0), pages: body.layout.pages, activePageId: String(body.layout.activePageId || body.layout.pages[0]?.id || '') };
        setLayout(nextLayout);
        setLayoutInitialized(true);
        await persistLayout();
        broadcast({ type: 'layout', layout: nextLayout });
        return sendJson(response, 200, nextLayout);
      }
      if (request.method === 'POST' && pathname === '/api/ports/select') {
        const body = await readBody(request);
        if (!safeEqual(String(body.token || ''), getToken())) return sendJson(response, 401, { error: 'Código de pareamento inválido.' });
        const midiManager = getMidiManager();
        const selected = midiManager.selectPorts(Number(body.outputIndex), Number(body.inputIndex));
        const ports = midiManager.listPorts();
        return sendJson(response, 200, { ...selected, outputName: ports.outputs.find((port) => port.index === selected.outputIndex)?.name || '', inputName: ports.inputs.find((port) => port.index === selected.inputIndex)?.name || '' });
      }
      if (request.method !== 'GET') return sendJson(response, 405, { error: 'Método não permitido.' });
      if (pathname === '/bridge' || pathname === '/bridge/') {
        const adminPage = path.join(clientDir, 'admin', 'index.html');
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        response.end(fs.readFileSync(adminPage));
        return;
      }

      const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      let filePath = path.resolve(clientDir, relative);
      if (!filePath.startsWith(clientDir + path.sep) && filePath !== clientDir) return sendJson(response, 403, { error: 'Caminho inválido.' });
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        if (!path.extname(relative)) filePath = path.join(clientDir, 'index.html');
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
  };
}

module.exports = { createHttpHandler, sendJson, readBody, contentType };
