'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createTokenStore } = require('../bridge/token-store.cjs');
const { networkAddresses, networkAddress } = require('../bridge/network-addresses.cjs');

function ipv4(address, internal = false) { return { address, family: 'IPv4', internal, netmask: '255.255.255.0', mac: '00:00:00:00:00:00', cidr: `${address}/24` }; }

test('reuses a valid persisted pairing token and enforces private file permissions on POSIX', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'faderdeck-token-store-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const tokenPath = path.join(directory, '.faderdeck-token');
  fs.writeFileSync(tokenPath, '0123456789abcdef0123456789abcdef\n', { mode: 0o644 });
  const token = createTokenStore(tokenPath).loadOrCreate();
  assert.equal(token, '0123456789abcdef0123456789abcdef');
  if (process.platform !== 'win32') assert.equal(fs.statSync(tokenPath).mode & 0o777, 0o600);
});

test('replaces malformed tokens and rotates persistently to a different 32-character token', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'faderdeck-token-store-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const tokenPath = path.join(directory, '.faderdeck-token');
  fs.writeFileSync(tokenPath, 'not-a-valid-token');
  const store = createTokenStore(tokenPath);
  const first = store.loadOrCreate();
  assert.match(first, /^[a-f0-9]{32}$/);
  const second = store.rotate();
  assert.match(second, /^[a-f0-9]{32}$/);
  assert.notEqual(second, first);
  assert.equal(fs.readFileSync(tokenPath, 'utf8').trim(), second);
});

test('keeps startup available if initial token persistence fails and reports the error', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'faderdeck-token-store-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const errors = [];
  const tokenPath = path.join(directory, 'missing-parent', '.faderdeck-token');
  const store = createTokenStore(tokenPath, { onSaveError: (error) => errors.push(error.message) });
  const token = store.loadOrCreate();
  assert.match(token, /^[a-f0-9]{32}$/);
  assert.equal(errors.length, 1);
});

test('selects private Wi-Fi addresses ahead of corporate networks and filters virtual, link-local, and CGNAT adapters', () => {
  const interfaces = {
    eth0: [ipv4('10.25.3.10')],
    wlan0: [ipv4('192.168.20.7')],
    corp172: [ipv4('172.20.4.2')],
    public: [ipv4('8.8.8.8')],
    carrier: [ipv4('100.80.1.4')],
    linklocal: [ipv4('169.254.3.4')],
    docker0: [ipv4('172.18.0.1')],
    internal: [ipv4('192.168.1.1', true)],
    wlanIpv6: [{ address: 'fe80::1', family: 'IPv6', internal: false }],
  };
  const entries = networkAddresses(interfaces);
  assert.deepEqual(entries.map(({ address }) => address), ['192.168.20.7', '10.25.3.10', '172.20.4.2', '8.8.8.8']);
  assert.equal(networkAddress(interfaces), '192.168.20.7');
});

test('falls back to loopback when no usable interface exists', () => {
  assert.deepEqual(networkAddresses({ lo: [ipv4('127.0.0.1', true)], apipa: [ipv4('169.254.1.2')] }), []);
  assert.equal(networkAddress({}), '127.0.0.1');
});
