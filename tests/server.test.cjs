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

function waitForMessage(socket, predicate, timeoutMs = 1000) {
  const existing = socket.receivedMessages?.find(predicate);
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Timeout aguardando mensagem WebSocket')),
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

test('server does not listen on import, retries an occupied port, and survives malformed targets', async (t) => {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'faderdeck-server-test-'));
  const previousDataDir = process.env.FADERDECK_DATA_DIR;
  process.env.FADERDECK_DATA_DIR = dataDirectory;

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
      occupiedServer.listen(0, '0.0.0.0', resolve);
    });
    const occupiedPort = occupiedServer.address().port;
    await bridge.start(occupiedPort);
    assert.notEqual(bridge.getPort(), occupiedPort);
  } finally {
    if (occupiedServer.listening) await new Promise((resolve) => occupiedServer.close(resolve));
    Module._load = originalLoad;
    if (previousDataDir === undefined) delete process.env.FADERDECK_DATA_DIR;
    else process.env.FADERDECK_DATA_DIR = previousDataDir;
  }

  const port = bridge.getPort();
  assert.match(
    bridge.mobileUrl(),
    new RegExp(`^http://[^/]+:${port}/\\?bridgeToken=[a-f0-9]{32}$`),
  );
  const malformed = await request(port, '/%ZZ');
  assert.equal(malformed.status, 400);
  assert.match(malformed.body, /Requisição inválida/);

  const healthy = await request(port, '/api/status');
  assert.equal(healthy.status, 200);
  const invalidLayout = await request(
    port,
    '/api/layout',
    JSON.stringify({ layout: { version: 1, pages: [] } }),
    'PUT',
  );
  assert.equal(invalidLayout.status, 400);
  const traversal = await request(port, '/%2e%2e/server.cjs');
  assert.equal(traversal.status, 404);
  assert.equal(JSON.parse(healthy.body).remoteClients, 0);

  const invalidJson = await request(port, '/api/layout', '{', 'PUT');
  assert.equal(invalidJson.status, 400);
  assert.match(invalidJson.body, /JSON inválido/);

  const oversized = await request(port, '/api/layout', 'x'.repeat(16 * 1024 + 1), 'PUT');
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
  assert.equal(
    fs.readFileSync(path.join(dataDirectory, '.faderdeck-token'), 'utf8').trim(),
    bridge.getToken(),
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
  const adminCss = await request(port, '/admin/bridge.css');
  assert.equal(adminCss.status, 200);
  assert.match(adminCss.headers['content-type'], /text\/css/);

  const guidePage = await request(port, '/guia-midi-windows.html');
  assert.equal(guidePage.status, 200);
  assert.match(guidePage.headers['content-type'], /text\/html/);
  assert.match(guidePage.body, /Do loopMIDI ao primeiro/);
  const guideImage = await request(port, '/guia-assets/loopmidi-window.png');
  assert.equal(guideImage.status, 200);
  assert.match(guideImage.headers['content-type'], /image\/png/);
  assert.ok(guideImage.body.length > 0);

  const pairing = await request(port, '/api/pairing');
  assert.equal(pairing.status, 200);
  const pairingData = JSON.parse(pairing.body);
  assert.match(pairingData.url, /bridgeToken=/);
  assert.match(pairingData.qr, /^data:image\/png;base64,/);
  assert.equal(pairingData.port, bridge.getPort());

  const connect = () =>
    new Promise((resolve, reject) => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      socket.receivedMessages = [];
      socket.on('message', (raw) => {
        try {
          socket.receivedMessages.push(JSON.parse(raw.toString()));
        } catch {}
      });
      socket.once('open', () => resolve(socket));
      socket.once('error', reject);
    });
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
  assert.notEqual(bridge.getToken(), oldToken);
  assert.equal(await rotatedClose, 4001);
  assert.equal(
    fs.readFileSync(path.join(dataDirectory, '.faderdeck-token'), 'utf8').trim(),
    bridge.getToken(),
  );
});
