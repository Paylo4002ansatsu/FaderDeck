'use strict';

const WebSocket = require('ws');
const { parseRequestTarget } = require('../server-utils.cjs');
const { safeEqual, isLoopbackHost, isLoopbackRequest } = require('./auth.cjs');
const { attachWebSocketHandlers } = require('./websocket-handler.cjs');

function createWebSocketGateway({ server, getToken, layout, scheduleLayoutSave, midiManager }) {
  const wss = new WebSocket.Server({ noServer: true, maxPayload: 1024 * 1024 });

  server.on('upgrade', (request, socket, head) => {
    let requestUrl;
    try {
      ({ url: requestUrl } = parseRequestTarget(
        request.url || '/',
        request.headers.host || 'localhost',
      ));
    } catch {
      socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
      return;
    }
    const localBrowser = isLoopbackHost(requestUrl.hostname) && isLoopbackRequest(request);
    if (
      requestUrl.pathname !== '/ws' ||
      (!localBrowser && !safeEqual(requestUrl.searchParams.get('token') || '', getToken()))
    ) {
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

  function broadcast(payload) {
    const frame = JSON.stringify(payload);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN && client.authorized) client.send(frame);
    }
  }

  attachWebSocketHandlers(wss, {
    getLayout: layout.get,
    setLayout: layout.set,
    isLayoutInitialized: layout.isInitialized,
    setLayoutInitialized: layout.setInitialized,
    getLayoutSeedOwner: layout.getSeedOwner,
    setLayoutSeedOwner: layout.setSeedOwner,
    layoutPayload: layout.payload,
    scheduleLayoutSave,
    broadcast,
    midiManager,
  });

  function getStatus() {
    const remote = [...wss.clients].filter(
      (client) =>
        client.readyState === WebSocket.OPEN &&
        !isLoopbackHost(client._socket?.remoteAddress || ''),
    );
    return {
      clients: wss.clients.size,
      remoteClients: remote.length,
      remoteAddresses: [
        ...new Set(remote.map((client) => client._socket?.remoteAddress).filter(Boolean)),
      ],
    };
  }

  function closeAll(code, reason) {
    for (const client of wss.clients) {
      try {
        client.close(code, reason);
      } catch {}
    }
  }

  function terminateAll() {
    for (const client of wss.clients) {
      try {
        client.terminate();
      } catch {}
    }
  }

  return { broadcast, getStatus, closeAll, terminateAll, webSocketServer: wss };
}

module.exports = { createWebSocketGateway };
