'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { parseRequestTarget, createSerialQueue, createAtomicFileWriter } = require('../server-utils.cjs');

function request(port, requestPath, body, method = 'GET', additionalHeaders = {}) {
  return new Promise((resolve, reject) => {
    const headers = {
      ...(body === undefined ? {} : {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      }),
      ...additionalHeaders,
    };
    const outgoing = http.request({ hostname: '127.0.0.1', port, path: requestPath, method, headers }, (incoming) => {
      let body = '';
      incoming.setEncoding('utf8');
      incoming.on('data', (chunk) => { body += chunk; });
      incoming.on('end', () => resolve({ status: incoming.statusCode, body }));
    });
    outgoing.once('error', reject);
    outgoing.end(body);
  });
}

test('request-target parsing rejects invalid percent escapes', () => {
  assert.equal(parseRequestTarget('/bridge?ready=1', '127.0.0.1:8787').pathname, '/bridge');
  assert.throws(() => parseRequestTarget('/%ZZ', '127.0.0.1:8787'), URIError);
});

test('serial queue preserves order and recovers after a failed task', async () => {
  const started = [];
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
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
      getPortCount() { return 0; }
      getPortName() { return ''; }
      closePort() {}
      sendMessage() {}
      openVirtualPort() {}
    },
    Input: class {
      getPortCount() { return 0; }
      getPortName() { return ''; }
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
  const malformed = await request(port, '/%ZZ');
  assert.equal(malformed.status, 400);
  assert.match(malformed.body, /Requisição inválida/);

  const healthy = await request(port, '/api/status');
  assert.equal(healthy.status, 200);
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
  assert.equal(fs.readFileSync(path.join(dataDirectory, '.faderdeck-token'), 'utf8').trim(), bridge.getToken());
});
