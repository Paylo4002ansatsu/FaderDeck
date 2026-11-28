'use strict';

const WebSocket = require('ws');
const { parseRequestTarget } = require('../server-utils.cjs');
const {
  safeEqual,
  isLoopbackHost,
  isLoopbackRequest,
  isSameOriginLocalAdminRequest,
} = require('./auth.cjs');
const { attachWebSocketHandlers } = require('./websocket-handler.cjs');

function createWebSocketGateway({
  servers,
  getToken,
  getLocalPort,
  layout,
  scheduleLayoutSave,
  midiManager,
  entitlementService,
}) {
  const wss = new WebSocket.Server({ noServer: true, maxPayload: 1024 * 1024 });

  for (const server of servers) {
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
      const trustedLocalPanel =
        !request.socket.encrypted &&
        isLoopbackHost(requestUrl.hostname) &&
        isLoopbackRequest(request) &&
        isSameOriginLocalAdminRequest(request, getLocalPort());
      if (
        requestUrl.pathname !== '/ws' ||
        !safeEqual(requestUrl.searchParams.get('token') || '', getToken())
      ) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      try {
        wss.handleUpgrade(request, socket, head, (client) => {
          client.authorized = true;
          client.isMobile =
            !trustedLocalPanel &&
            (requestUrl.searchParams.get('device') === 'mobile' ||
              /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(request.headers['user-agent'] || ''));
          wss.emit('connection', client, request);
        });
      } catch {
        socket.destroy();
      }
    });
  }

  function broadcast(payload, excludedClient = null) {
    const frame = JSON.stringify(payload);
    for (const client of wss.clients) {
      if (client !== excludedClient && client.readyState === WebSocket.OPEN && client.authorized)
        client.send(frame);
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
    entitlementService,
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
      connectedMobileClients: [...wss.clients].filter(
        (client) => client.readyState === WebSocket.OPEN && client.authorized && client.isMobile,
      ).length,
      remoteAddresses: [
        ...new Set(remote.map((client) => client._socket?.remoteAddress).filter(Boolean)),
      ],
    };
  }

  wss.on('connection', (client) => {
    broadcast({
      type: 'mobile_status',
      connectedMobileClients: getStatus().connectedMobileClients,
    });
    if (client.isMobile) {
      broadcast(
        { type: 'mobile_connected', connectedMobileClients: getStatus().connectedMobileClients },
        client,
      );
      client.on('close', () => {
        broadcast({
          type: 'mobile_status',
          connectedMobileClients: getStatus().connectedMobileClients,
        });
      });
    }
  });

  function closeAll(code, reason) {
    for (const client of wss.clients) {
      client.authorized = false;
      try {
        client.close(code, reason);
      } catch {}
    }
  }

  function terminateAll() {
    for (const client of wss.clients) {
      client.authorized = false;
      try {
        client.terminate();
      } catch {}
    }
  }

  return { broadcast, getStatus, closeAll, terminateAll, webSocketServer: wss };
}

module.exports = { createWebSocketGateway };
