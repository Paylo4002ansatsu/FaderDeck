'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { safeEqual, isLoopbackHost, isLoopbackRequest, isSameOriginLocalAdminRequest, hasLocalHostHeader } = require('../bridge/auth.cjs');

function request({ host, origin, remoteAddress = '127.0.0.1', encrypted = false } = {}) {
  return {
    headers: { ...(host ? { host } : {}), ...(origin ? { origin } : {}) },
    socket: { remoteAddress, encrypted },
  };
}

test('compares token bytes safely and rejects different values and lengths', () => {
  assert.equal(safeEqual('abcdef', 'abcdef'), true);
  assert.equal(safeEqual('abcdef', 'abcdeg'), false);
  assert.equal(safeEqual('abc', 'abcd'), false);
});

test('recognizes loopback hosts and rejects non-loopback hosts', () => {
  for (const host of ['localhost', '127.0.0.1', '::1', '[::1]', '::ffff:127.0.0.1']) assert.equal(isLoopbackHost(host), true, host);
  assert.equal(isLoopbackHost('10.0.0.2'), false);
});

test('classifies local socket peers, including mapped IPv4 loopback', () => {
  assert.equal(isLoopbackRequest(request()), true);
  assert.equal(isLoopbackRequest(request({ remoteAddress: '::ffff:127.0.0.1' })), true);
  assert.equal(isLoopbackRequest(request({ remoteAddress: '192.168.1.15' })), false);
});

test('allows token rotation only for matching local origin and active port', () => {
  const valid = request({ host: '127.0.0.1:8787', origin: 'http://127.0.0.1:8787' });
  assert.equal(isSameOriginLocalAdminRequest(valid, 8787), true);
  assert.equal(isSameOriginLocalAdminRequest(request({ host: 'localhost:8787', origin: 'http://localhost:8787' }), 8787), true);
  assert.equal(isSameOriginLocalAdminRequest(request({ host: '127.0.0.1:8787', origin: 'http://127.0.0.1:8788' }), 8787), false);
  assert.equal(isSameOriginLocalAdminRequest(request({ host: '10.0.0.5:8787', origin: 'http://10.0.0.5:8787' }), 8787), false);
  assert.equal(isSameOriginLocalAdminRequest(request({ host: '127.0.0.1:8787' }), 8787), false);
});

test('matches HTTPS origins only on the active HTTPS port and rejects malformed hosts', () => {
  assert.equal(isSameOriginLocalAdminRequest(request({ host: 'localhost:443', origin: 'https://localhost', encrypted: true }), 443), true);
  assert.equal(isSameOriginLocalAdminRequest(request({ host: 'localhost:443', origin: 'http://localhost:443', encrypted: true }), 443), false);
  assert.equal(isSameOriginLocalAdminRequest(request({ host: 'bad host', origin: 'http://localhost' }), 80), false);
});

test('pairing host header requires loopback and exact listener port', () => {
  assert.equal(hasLocalHostHeader(request({ host: '127.0.0.1:8787' }), 8787), true);
  assert.equal(hasLocalHostHeader(request({ host: 'localhost' }), 80), true);
  assert.equal(hasLocalHostHeader(request({ host: '127.0.0.1:8788' }), 8787), false);
  assert.equal(hasLocalHostHeader(request({ host: '192.168.1.5:8787' }), 8787), false);
});
