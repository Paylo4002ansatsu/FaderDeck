'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const WebSocket = require('ws');
const {
  parseRequestTarget,
  createSerialQueue,
  createAtomicFileWriter,
} = require('../server-utils.cjs');

function request(port, requestPath, body, method = 'GET', additionalHeaders = {}) {
  return new Promise((resolve, reject) => {
    const headers = {
      ...(body === undefined
        ? {}
        : {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          }),
      ...additionalHeaders,
    };
    const outgoing = http.request(
      { hostname: '127.0.0.1', port, path: requestPath, method, headers },
      (incoming) => {
        let body = '';
        incoming.setEncoding('utf8');
        incoming.on('data', (chunk) => {
          body += chunk;
        });
        incoming.on('end', () =>
          resolve({ status: incoming.statusCode, body, headers: incoming.headers }),
        );
      },
    );
    outgoing.once('error', reject);
    outgoing.end(body);
  });
}

function rejectedWebSocket(url, options = {}) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, options);
    let settled = false;
    const finish = (status) => {
      if (settled) return;
      settled = true;
      resolve(status);
    };
    socket.once('unexpected-response', (_request, response) => {
      response.resume();
      finish(response.statusCode);
    });
    socket.once('open', () => {
      socket.terminate();
      finish(101);
    });
    socket.once('error', (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

function waitForMessage(socket, predicate, timeoutMs = 1000) {
  const existing = socket.receivedMessages?.find(predicate);
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            `Timeout aguardando mensagem WebSocket (state=${socket.readyState}, received=${(socket.receivedMessages || []).map((message) => message.type).join(',')}).`,
          ),
        ),
      timeoutMs,
    );
    const onMessage = (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (!predicate(message)) return;
      clearTimeout(timer);
      socket.off('message', onMessage);
      resolve(message);
    };
    socket.on('message', onMessage);
  });
}

test('request-target parsing rejects invalid percent escapes', () => {
  assert.equal(parseRequestTarget('/bridge?ready=1', '127.0.0.1:8787').pathname, '/bridge');
  assert.throws(() => parseRequestTarget('/%ZZ', '127.0.0.1:8787'), URIError);
});

test('serial queue preserves order and recovers after a failed task', async () => {
  const started = [];
  let releaseFirst;
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const queue = createSerialQueue(async (value) => {
    started.push(`start:${value}`);
    if (value === 'first') await firstGate;
    if (value === 'fail') throw new Error('expected failure');
    started.push(`end:${value}`);
  });

  const first = queue('first');
  const second = queue('second');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(started, ['start:first']);
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(started, ['start:first', 'end:first', 'start:second', 'end:second']);

  await assert.rejects(queue('fail'), /expected failure/);
  await queue('after-failure');
  assert.equal(started.at(-1), 'end:after-failure');
});

test('atomic file writer persists the last queued snapshot without temporary files', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'faderdeck-layout-test-'));
  const filePath = path.join(directory, 'layout.json');
  try {
    const write = createAtomicFileWriter(filePath);
    await Promise.all([write('{"version":1}'), write('{"version":2}')]);
    assert.equal(fs.readFileSync(filePath, 'utf8'), '{"version":2}');
    assert.deepEqual(fs.readdirSync(directory), ['layout.json']);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('secure storage encrypts persisted values and removes them in order', async (t) => {
  const { createSecureStorage } = require('../bridge/secure-storage.cjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'faderdeck-secure-storage-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const storage = createSecureStorage(directory, {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`encrypted:${Buffer.from(value).toString('base64')}`),
    decryptString: (value) => Buffer.from(value.toString().slice(10), 'base64').toString(),
  });
  await storage.setItem('session', 'private-value');
  assert.equal(await storage.getItem('session'), 'private-value');
  assert.equal(
    fs
      .readFileSync(path.join(directory, fs.readdirSync(directory)[0]), 'utf8')
      .includes('private-value'),
    false,
  );
  await storage.removeItem('session');
  assert.equal(await storage.getItem('session'), null);
});

test('server does not listen on import, retries an occupied port, and survives malformed targets', async (t) => {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'faderdeck-server-test-'));
  const previousDataDir = process.env.FADERDECK_DATA_DIR;
  const previousLanPort = process.env.FADER_BRIDGE_LAN_PORT;
  const previousSupabaseUrl = process.env.SUPABASE_URL;
  const previousSupabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const previousFetch = globalThis.fetch;
  process.env.FADERDECK_DATA_DIR = dataDirectory;
  process.env.FADER_BRIDGE_LAN_PORT = '0';
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_PUBLISHABLE_KEY;

  const Module = require('node:module');
  const originalLoad = Module._load;
  const midiStub = {
    Output: class {
      getPortCount() {
        return 0;
      }
      getPortName() {
        return '';
      }
      closePort() {}
      sendMessage() {}
      openVirtualPort() {}
    },
    Input: class {
      getPortCount() {
        return 0;
      }
      getPortName() {
        return '';
      }
      closePort() {}
      openPort() {}
      ignoreTypes() {}
    },
  };
  Module._load = function loadWithMidiStub(requested, parent, isMain) {
    if (requested === '@julusian/midi') return midiStub;
    return originalLoad.call(this, requested, parent, isMain);
  };

  let bridge;
  t.after(async () => {
    if (bridge) await bridge.stop();
    fs.rmSync(dataDirectory, { recursive: true, force: true });
  });
  const occupiedServer = net.createServer();
  try {
    bridge = require('../server.cjs');
    assert.equal(bridge.server.listening, false);
    assert.equal(fs.existsSync(path.join(dataDirectory, '.faderdeck-token')), false);
    await new Promise((resolve, reject) => {
      occupiedServer.once('error', reject);
      occupiedServer.listen(0, '127.0.0.1', resolve);
    });
    const occupiedPort = occupiedServer.address().port;
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => [{ tag_name: 'v4.5.7', body: '### Destaques para você\n- Uma novidade' }],
    });
    await bridge.start(occupiedPort, { currentVersion: '4.5.6' });
    assert.notEqual(bridge.getPort(), occupiedPort);
  } finally {
    if (occupiedServer.listening) await new Promise((resolve) => occupiedServer.close(resolve));
    Module._load = originalLoad;
    globalThis.fetch = previousFetch;
    if (previousDataDir === undefined) delete process.env.FADERDECK_DATA_DIR;
    else process.env.FADERDECK_DATA_DIR = previousDataDir;
    if (previousLanPort === undefined) delete process.env.FADER_BRIDGE_LAN_PORT;
    else process.env.FADER_BRIDGE_LAN_PORT = previousLanPort;
    if (previousSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousSupabaseUrl;
    if (previousSupabaseKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = previousSupabaseKey;
  }

  const port = bridge.getPort();
  const lanPort = bridge.getLanPort();
  assert.equal(bridge.server.address().address, '127.0.0.1');
  assert.equal(bridge.lanServer.address().address, '0.0.0.0');
  assert.ok(
    new RegExp(`^http://[^/]+:${lanPort}/#bridgeToken=[a-f0-9]{32}$`).test(bridge.mobileUrl()),
    'mobile URL must use HTTP and keep the pairing code in the fragment',
  );
  const malformed = await request(port, '/%ZZ');
  assert.equal(malformed.status, 400);
  assert.match(malformed.body, /Requisição inválida/);

  const healthy = await request(port, '/api/status');
  assert.equal(healthy.status, 200);
  const update = JSON.parse((await request(port, '/api/app/update-status')).body);
  assert.equal(update.currentVersion, '4.5.6');
  assert.equal(update.latestVersion, '4.5.7');
  assert.equal(update.releaseNotes, 'Uma novidade');
  const accountStatus = await request(port, '/api/account/status');
  assert.equal(accountStatus.status, 200);
  assert.equal(
    JSON.parse(accountStatus.body).supabase_configured,
    require('../bridge/supabase-client.cjs').isSupabaseConfigured(),
  );
  const blockedMidiSelection = await request(
    port,
    '/api/ports/select',
    JSON.stringify({ token: bridge.getToken(), outputIndex: 0, inputIndex: -1 }),
    'POST',
  );
  assert.equal(blockedMidiSelection.status, 403);
  assert.equal(JSON.parse(blockedMidiSelection.body).code, 'ENTITLEMENT_REQUIRED');
  const localOrigin = `http://127.0.0.1:${port}`;
  assert.equal((await request(port, '/api/auth')).status, 401);
  assert.equal(
    (await request(port, '/api/auth', undefined, 'GET', { Origin: 'https://attacker.example' }))
      .status,
    401,
  );
  assert.equal(
    (await request(port, '/api/auth', undefined, 'GET', { Origin: localOrigin })).status,
    200,
  );
  const localAuth = await request(port, '/api/auth', undefined, 'POST', { Origin: localOrigin });
  assert.equal(localAuth.status, 200);
  assert.equal(JSON.parse(localAuth.body).token, bridge.getToken());
  assert.equal(
    (await request(port, '/api/auth', undefined, 'POST', { Origin: 'https://attacker.example' }))
      .status,
    401,
  );
  assert.equal((await request(port, '/api/layout')).status, 401);
  assert.equal(
    (await request(port, '/api/layout', undefined, 'GET', { Origin: localOrigin })).status,
    200,
  );
  const invalidLayout = await request(
    port,
    '/api/layout',
    JSON.stringify({ layout: { version: 1, pages: [] } }),
    'PUT',
    { Origin: localOrigin },
  );
  assert.equal(invalidLayout.status, 400);
  const traversal = await request(port, '/%2e%2e/server.cjs');
  assert.equal(traversal.status, 404);
  assert.equal(JSON.parse(healthy.body).remoteClients, 0);

  const invalidJson = await request(port, '/api/layout', '{', 'PUT', { Origin: localOrigin });
  assert.equal(invalidJson.status, 400);
  assert.match(invalidJson.body, /JSON inválido/);

  const oversized = await request(port, '/api/layout', 'x'.repeat(16 * 1024 + 1), 'PUT', {
    Origin: localOrigin,
  });
  assert.equal(oversized.status, 413);
  assert.match(oversized.body, /limite de 16 KB/);

  const missingOrigin = await request(port, '/api/token/regenerate', undefined, 'POST', {
    'X-FaderDeck-Admin': 'rotate-token',
  });
  assert.equal(missingOrigin.status, 403);

  const authorizedRotation = await request(port, '/api/token/regenerate', undefined, 'POST', {
    Origin: `http://127.0.0.1:${port}`,
    'X-FaderDeck-Admin': 'rotate-token',
  });
  assert.equal(authorizedRotation.status, 200);
  assert.ok(
    fs.readFileSync(path.join(dataDirectory, '.faderdeck-token'), 'utf8').trim() ===
      bridge.getToken(),
    'rotated credential must persist',
  );

  const admin = await request(port, '/bridge');
  assert.equal(admin.status, 200);
  assert.equal(admin.headers['cache-control'], 'no-store');
  assert.match(admin.body, /\/admin\/bridge\.css/);
  assert.match(admin.body, /\/admin\/bridge\.js/);
  assert.doesNotMatch(admin.body, /<style[\s>]/i);
  assert.doesNotMatch(admin.body, /<script(?![^>]*src=)[^>]*>/i);
  const adminScript = await request(port, '/admin/bridge.js');
  assert.equal(adminScript.status, 200);
  assert.match(adminScript.body, /api\/pairing/);
  const appIndex = await request(port, '/');
  assert.equal(appIndex.status, 200);
  assert.match(appIndex.body, /bridge-bootstrap\.js/);
  const bootstrap = await request(port, '/bridge-bootstrap.js');
  assert.equal(bootstrap.status, 200);
  assert.match(bootstrap.body, /location\.hash/);
  const adminCss = await request(port, '/admin/bridge.css');
  assert.equal(adminCss.status, 200);
  assert.match(adminCss.headers['content-type'], /text\/css/);

  const guidePage = await request(port, '/guia-midi-windows.html');
  assert.equal(guidePage.status, 200);
  assert.match(guidePage.headers['content-type'], /text\/html/);
  assert.match(guidePage.body, /Do loopMIDI ao primeiro/);
  assert.match(guidePage.body, /guia-midi-windows\.css/);
  const guideCss = await request(port, '/guia-midi-windows.css');
  assert.equal(guideCss.status, 200);
  assert.match(guideCss.headers['content-type'], /text\/css/);
  assert.match(guideCss.body, /\.topbar/);
  const guideImage = await request(port, '/guia-assets/loopmidi-window.png');
  assert.equal(guideImage.status, 200);
  assert.match(guideImage.headers['content-type'], /image\/png/);
  assert.ok(guideImage.body.length > 0);

  const pairing = await request(port, '/api/pairing', undefined, 'GET', {
    Origin: localOrigin,
  });
  assert.equal(pairing.status, 200);
  const pairingWithoutOrigin = await request(port, '/api/pairing');
  assert.equal(pairingWithoutOrigin.status, 200);
  const pairingData = JSON.parse(pairing.body);
  const pairingUrl = new URL(pairingData.url);
  assert.equal(pairingUrl.protocol, 'http:');
  assert.equal(pairingUrl.search, '');
  assert.ok(new URLSearchParams(pairingUrl.hash.slice(1)).has('bridgeToken'));
  assert.ok(/^data:image\/png;base64,/.test(pairingData.qr), 'pairing QR must be a PNG data URL');
  assert.equal(pairingData.port, lanPort);

  const lanIndex = await request(lanPort, '/');
  assert.equal(lanIndex.status, 200);
  assert.match(lanIndex.body, /bridge-bootstrap\.js/);
  assert.equal(
    (await request(port, '/api/bridge-config.js')).body,
    'window.__fdLanBridge = false;',
  );
  assert.equal(
    (await request(lanPort, '/api/bridge-config.js')).body,
    'window.__fdLanBridge = true;',
  );
  assert.equal((await request(lanPort, '/api/auth')).status, 401);
  if (bridge.networkAddress() !== '127.0.0.1') {
    const remoteBase = `http://${bridge.networkAddress()}:${lanPort}`;
    for (const route of ['/api/account/status', '/api/pairing', '/api/ports']) {
      const response = await fetch(`${remoteBase}${route}`, { signal: AbortSignal.timeout(3000) });
      assert.equal(response.status, 403, `${route} must remain local-only`);
    }
    const authUrl = new URL('/api/auth', remoteBase);
    authUrl.searchParams.set('token', 'invalid');
    assert.equal((await fetch(authUrl)).status, 401);
    authUrl.searchParams.set('token', bridge.getToken());
    const remoteAuth = await fetch(authUrl);
    assert.equal(remoteAuth.status, 200);
    assert.equal((await remoteAuth.json()).token, undefined);
    const socketUrl = new URL('/ws?token=invalid', remoteBase);
    socketUrl.protocol = 'ws:';
    assert.equal(await rejectedWebSocket(socketUrl.toString()), 401);
  }

  const connect = () =>
    new Promise((resolve, reject) => {
      const socket = new WebSocket(
        `ws://127.0.0.1:${port}/ws?token=${encodeURIComponent(bridge.getToken())}`,
        { headers: { Origin: localOrigin } },
      );
      socket.receivedMessages = [];
      socket.on('message', (raw) => {
        try {
          socket.receivedMessages.push(JSON.parse(raw.toString()));
        } catch {}
      });
      socket.once('open', () => resolve(socket));
      socket.once('error', reject);
    });
  assert.equal(await rejectedWebSocket(`ws://127.0.0.1:${port}/ws`), 401);
  assert.equal(
    await rejectedWebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { Origin: localOrigin } }),
    401,
  );
  assert.equal(await rejectedWebSocket(`ws://127.0.0.1:${lanPort}/ws`), 401);
  assert.equal(await rejectedWebSocket(`ws://127.0.0.1:${lanPort}/ws?token=invalid`), 401);
  assert.equal(
    await rejectedWebSocket(`ws://127.0.0.1:${port}/ws`, {
      headers: { Origin: 'https://attacker.example' },
    }),
    401,
  );
  assert.equal(
    await rejectedWebSocket(`ws://127.0.0.1:${lanPort}/ws`, {
      headers: { Origin: `http://127.0.0.1:${lanPort}` },
    }),
    401,
  );
  const firstClient = await connect();
  t.after(() => {
    try {
      firstClient.terminate();
    } catch {}
  });
  const initialReady = await waitForMessage(firstClient, (message) => message.type === 'ready');
  assert.deepEqual(initialReady, { type: 'ready' });
  const initialLayout = await waitForMessage(firstClient, (message) => message.type === 'layout');
  assert.equal(Array.isArray(initialLayout.layout.pages), true);
  const pongPromise = waitForMessage(firstClient, (message) => message.type === 'pong');
  firstClient.send(JSON.stringify({ type: 'ping', sentAt: 456 }));
  assert.deepEqual(await pongPromise, { type: 'pong', sentAt: 456 });
  const loopbackLatencyMs = [];
  for (let sample = 0; sample < 20; sample += 1) {
    const sentAt = 1000 + sample;
    const startedAt = process.hrtime.bigint();
    const samplePromise = waitForMessage(
      firstClient,
      (message) => message.type === 'pong' && message.sentAt === sentAt,
    );
    firstClient.send(JSON.stringify({ type: 'ping', sentAt }));
    await samplePromise;
    loopbackLatencyMs.push(Number(process.hrtime.bigint() - startedAt) / 1e6);
  }
  loopbackLatencyMs.sort((a, b) => a - b);
  assert.ok(loopbackLatencyMs[19] < 1000, `loopback ping max ${loopbackLatencyMs[19]} ms`);
  assert.equal(firstClient.readyState, WebSocket.OPEN);

  const syncPromise = waitForMessage(
    firstClient,
    (message) => message.type === 'layout' && message.sourceId === 'server-ws-test',
  );
  firstClient.send(
    JSON.stringify({
      type: 'layout',
      sourceId: 'server-ws-test',
      layout: { pages: [{ id: 'ws-page' }] },
    }),
  );
  const synchronized = await syncPromise;
  assert.equal(synchronized.layout.activePageId, 'ws-page');
  const lanClient = await new Promise((resolve, reject) => {
    const socket = new WebSocket(
      `ws://127.0.0.1:${lanPort}/ws?token=${encodeURIComponent(bridge.getToken())}`,
      {
        headers: { Origin: `http://127.0.0.1:${lanPort}` },
      },
    );
    socket.receivedMessages = [];
    socket.on('message', (raw) => {
      try {
        socket.receivedMessages.push(JSON.parse(raw.toString()));
      } catch {}
    });
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
  t.after(() => {
    try {
      lanClient.terminate();
    } catch {}
  });
  const lanReady = await waitForMessage(lanClient, (message) => message.type === 'ready');
  assert.deepEqual(lanReady, { type: 'ready' });
  const firstClientClosed = new Promise((resolve) => firstClient.once('close', resolve));
  firstClient.close();
  await firstClientClosed;
  const reconnected = await connect();
  t.after(() => {
    try {
      reconnected.terminate();
    } catch {}
  });
  const reconnectLayout = await waitForMessage(
    reconnected,
    (message) => message.type === 'layout' && message.layout.activePageId === 'ws-page',
  );
  assert.equal(reconnectLayout.layout.activePageId, 'ws-page');
  const oldToken = bridge.getToken();
  const rotatedClose = new Promise((resolve) => reconnected.once('close', (code) => resolve(code)));
  const rotateWhileConnected = await request(port, '/api/token/regenerate', undefined, 'POST', {
    Origin: `http://127.0.0.1:${port}`,
    'X-FaderDeck-Admin': 'rotate-token',
  });
  assert.equal(rotateWhileConnected.status, 200);
  assert.ok(bridge.getToken() !== oldToken, 'token rotation must issue a new credential');
  assert.equal(await rotatedClose, 4001);
  assert.equal(
    await rejectedWebSocket(`ws://127.0.0.1:${port}/ws?token=${encodeURIComponent(oldToken)}`),
    401,
  );
  assert.ok(
    fs.readFileSync(path.join(dataDirectory, '.faderdeck-token'), 'utf8').trim() ===
      bridge.getToken(),
    'rotated credential must persist',
  );
});
