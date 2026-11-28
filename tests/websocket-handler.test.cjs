'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const { attachWebSocketHandlers } = require('../bridge/websocket-handler.cjs');

class FakeSocket extends EventEmitter {
  constructor() {
    super();
    this.sent = [];
    this.authorized = true;
  }
  send(value) {
    this.sent.push(JSON.parse(value));
  }
  message(value) {
    this.emit('message', Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)));
  }
}

function createFixture({
  initialized = false,
  hasOutput = true,
  entitlementAllowed = true,
  entitlement,
} = {}) {
  const wss = new EventEmitter();
  let layout = { version: 0, pages: [], activePageId: '' };
  let ready = initialized;
  let seedOwner = null;
  let outputAvailable = hasOutput;
  const midiMessages = [];
  const broadcasts = [];
  let saveCount = 0;
  attachWebSocketHandlers(wss, {
    getLayout: () => layout,
    setLayout: (next) => {
      layout = next;
    },
    isLayoutInitialized: () => ready,
    setLayoutInitialized: (value) => {
      ready = value;
    },
    getLayoutSeedOwner: () => seedOwner,
    setLayoutSeedOwner: (socket) => {
      seedOwner = socket;
    },
    layoutPayload: () => ({ type: 'layout', layout }),
    scheduleLayoutSave: () => {
      saveCount += 1;
    },
    broadcast: (message, excluded) => broadcasts.push({ message, excluded }),
    midiManager: {
      hasOutput: () => outputAvailable,
      send: (bytes) => {
        if (!outputAvailable) throw new Error('sem porta');
        midiMessages.push([...bytes]);
      },
    },
    entitlementService: {
      getCachedEntitlement: () => entitlement || { allowed: entitlementAllowed },
    },
  });
  return {
    wss,
    connect() {
      const socket = new FakeSocket();
      wss.emit('connection', socket, {});
      return socket;
    },
    get layout() {
      return layout;
    },
    set outputAvailable(value) {
      outputAvailable = value;
    },
    midiMessages,
    broadcasts,
    get saveCount() {
      return saveCount;
    },
  };
}

test('sends ready and current layout on connect; responds to ping and tolerates malformed JSON', () => {
  const fixture = createFixture({ initialized: true });
  const socket = fixture.connect();
  assert.deepEqual(socket.sent, [
    { type: 'ready' },
    { type: 'layout', layout: { version: 0, pages: [], activePageId: '' } },
  ]);
  socket.message({ type: 'ping', sentAt: 123 });
  assert.deepEqual(socket.sent.at(-1), { type: 'pong', sentAt: 123 });
  socket.message('{not-json');
  assert.equal(socket.sent.length, 3);
});

test('only the first connected client may seed an empty layout; updates broadcast and debounce-save', () => {
  const fixture = createFixture();
  const owner = fixture.connect();
  const other = fixture.connect();
  const proposed = { version: 8, pages: [{ id: 'p1', faders: [] }], activePageId: '' };
  other.message({ type: 'layout', layout: proposed });
  assert.deepEqual(fixture.layout.pages, []);
  assert.equal(other.sent.at(-1).type, 'layout');

  owner.message({ type: 'layout', layout: proposed, sourceId: 'x'.repeat(120) });
  assert.equal(fixture.layout.version, 8);
  assert.equal(fixture.layout.activePageId, 'p1');
  assert.equal(fixture.saveCount, 1);
  assert.equal(fixture.broadcasts.at(-1).message.sourceId.length, 100);
  assert.equal(fixture.broadcasts.at(-1).message.layout.version, 8);
  owner.message({ type: 'layout', layout: { version: 0, pages: [{ id: 'p2' }] } });
  assert.equal(fixture.layout.version, 9);
  assert.equal(fixture.saveCount, 2);
});

test('sends MIDI before broadcasting the updated control to other clients and retains its state', async () => {
  const fixture = createFixture();
  const sender = fixture.connect();
  sender.message({
    type: 'layout',
    layout: { pages: [{ id: 'page', controls: [{ id: 'fader', kind: 'fader', value: 0 }] }] },
  });
  sender.message({
    type: 'midi',
    sourceId: 'desktop',
    data: [0xb0, 7, 64],
    control: { id: 'fader', value: 0.5 },
  });
  await new Promise(setImmediate);
  assert.deepEqual(fixture.midiMessages, [[0xb0, 7, 64]]);
  assert.deepEqual(fixture.broadcasts.at(-1), {
    message: { type: 'controls', controls: [{ id: 'fader', value: 0.5 }], sourceId: 'desktop' },
    excluded: sender,
  });
  assert.equal(fixture.layout.pages[0].controls[0].value, 0.5);
  const newcomer = fixture.connect();
  assert.equal(newcomer.sent[1].layout.pages[0].controls[0].value, 0.5);
});

test('clears the seed owner on disconnect so a reconnect can initialize layout', () => {
  const fixture = createFixture();
  const first = fixture.connect();
  first.emit('close');
  const reconnect = fixture.connect();
  reconnect.message({ type: 'layout', layout: { pages: [{ id: 'fresh' }] } });
  assert.equal(fixture.layout.activePageId, 'fresh');
});

test('rejects MIDI without output, malformed/out-of-range payloads, and preserves send failure feedback', async () => {
  const fixture = createFixture({ initialized: true, hasOutput: false });
  const socket = fixture.connect();
  socket.message({ type: 'midi', data: [0x90, 60, 100] });
  await new Promise(setImmediate);
  assert.equal(socket.sent.at(-1).message, 'Selecione uma saída MIDI na tela da ponte.');
  fixture.outputAvailable = true;
  socket.message({ type: 'midi', data: [0x90, 60, 100, 0x80, 60, 0] });
  await new Promise(setImmediate);
  assert.deepEqual(fixture.midiMessages, [[0x90, 60, 100, 0x80, 60, 0]]);
  socket.message({ type: 'midi', data: [0x90, -1, 100] });
  socket.message({ type: 'midi', data: [0x90, 60, 128] });
  socket.message({ type: 'midi', data: [0xb0, 128, 0] });
  socket.message({ type: 'midi', data: [0x90, 60, '100'] });
  socket.message({ type: 'midi', data: [0x90, 60, 100, 0xb0, 2, 128] });
  await new Promise(setImmediate);
  assert.equal(fixture.midiMessages.length, 1);
  assert.match(socket.sent.at(-1).message, /Dados MIDI devem estar entre 0 e 127/);
  socket.message({ type: 'midi', data: new Array(257).fill(0) });
  assert.match(socket.sent.at(-1).message, /Mensagem MIDI inválida/);
});

test('blocks MIDI with a structured error when entitlement is not allowed', async () => {
  const fixture = createFixture({ initialized: true, entitlementAllowed: false });
  const socket = fixture.connect();

  socket.message({ type: 'midi', data: [0x90, 60, 100] });
  await new Promise(setImmediate);

  assert.deepEqual(socket.sent.at(-1), {
    type: 'error',
    code: 'ENTITLEMENT_REQUIRED',
    message: 'É necessária uma licença ativa ou um teste gratuito válido para usar MIDI.',
  });

  assert.deepEqual(fixture.midiMessages, []);
  assert.deepEqual(fixture.broadcasts, []);
});

test('does not send queued MIDI after the socket authorization is revoked', async () => {
  const wss = new EventEmitter();
  const socket = new FakeSocket();
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  let sent = false;
  attachWebSocketHandlers(wss, {
    getLayout: () => ({}),
    setLayout() {},
    isLayoutInitialized: () => true,
    setLayoutInitialized() {},
    getLayoutSeedOwner: () => null,
    setLayoutSeedOwner() {},
    layoutPayload: () => ({ type: 'layout' }),
    scheduleLayoutSave() {},
    broadcast() {},
    midiManager: { hasOutput: () => true, send: () => (sent = true) },
    entitlementService: { getCachedEntitlement: () => pending },
  });
  wss.emit('connection', socket);
  socket.message({ type: 'midi', data: [0x90, 60, 100] });
  await new Promise(setImmediate);
  socket.authorized = false;
  release({ allowed: true });
  await new Promise(setImmediate);
  assert.equal(sent, false);
});

test('does not log credentials contained in entitlement errors', async () => {
  const socket = new FakeSocket();
  const originalError = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args.join(' '));
  try {
    const wss = new EventEmitter();
    attachWebSocketHandlers(wss, {
      getLayout: () => ({}),
      setLayout() {},
      isLayoutInitialized: () => true,
      setLayoutInitialized() {},
      getLayoutSeedOwner: () => null,
      setLayoutSeedOwner() {},
      layoutPayload: () => ({ type: 'layout' }),
      scheduleLayoutSave() {},
      broadcast() {},
      midiManager: { hasOutput: () => true, send() {} },
      entitlementService: {
        getCachedEntitlement: () => Promise.reject(new Error('secret-test-token')),
      },
    });
    wss.emit('connection', socket);
    socket.message({ type: 'midi', data: [0x90, 60, 100] });
    await new Promise(setImmediate);
    assert.ok(logs.some((line) => line.includes('entitlement')));
    assert.ok(logs.every((line) => !line.includes('secret-test-token')));
  } finally {
    console.error = originalError;
  }
});

test('reports the device limit when MIDI is blocked by the plan', async () => {
  const fixture = createFixture({
    entitlement: { allowed: false, code: 'DEVICE_LIMIT_REACHED', message: 'Limite atingido.' },
  });
  const socket = fixture.connect();
  socket.message({ type: 'midi', data: [0x90, 60, 100] });
  await new Promise(setImmediate);
  assert.equal(socket.sent.at(-1).code, 'DEVICE_LIMIT_REACHED');
  assert.equal(socket.sent.at(-1).message, 'Limite atingido.');
  assert.deepEqual(fixture.midiMessages, []);
});

test('reports output-device send failures to the client without crashing other events', async () => {
  const wss = new EventEmitter();
  const socket = new FakeSocket();
  attachWebSocketHandlers(wss, {
    getLayout: () => ({ version: 1, pages: [{ id: 'p' }], activePageId: 'p' }),
    setLayout() {},
    isLayoutInitialized: () => true,
    setLayoutInitialized() {},
    getLayoutSeedOwner: () => null,
    setLayoutSeedOwner() {},
    layoutPayload: () => ({ type: 'layout', layout: {} }),
    scheduleLayoutSave() {},
    broadcast() {},
    midiManager: {
      hasOutput: () => true,
      send: () => {
        throw new Error('dispositivo desconectado');
      },
    },
    entitlementService: {
      getCachedEntitlement: () => ({ allowed: true }),
    },
  });
  wss.emit('connection', socket, {});
  socket.message({ type: 'midi', data: [0x90, 1, 1] });
  await new Promise(setImmediate);
  assert.match(socket.sent.at(-1).message, /Falha ao enviar MIDI: dispositivo desconectado/);
  socket.message({ type: 'ping', sentAt: 5 });
  assert.equal(socket.sent.at(-1).sentAt, 5);
});
