'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { isTrustedPanelUrl, safeExternalUrl } = require('../electron-utils.cjs');

test('trusted panel navigation is limited to the exact local origin and port', () => {
  assert.equal(isTrustedPanelUrl('http://127.0.0.1:8787/', 8787), true);
  assert.equal(isTrustedPanelUrl('http://127.0.0.1:8788/', 8787), false);
  assert.equal(isTrustedPanelUrl('http://localhost:8787/', 8787), false);
  assert.equal(isTrustedPanelUrl('https://127.0.0.1:8787/', 8787), false);
  assert.equal(isTrustedPanelUrl('http://127.0.0.1:8787@evil.example/', 8787), false);
  assert.equal(isTrustedPanelUrl('file:///etc/passwd', 8787), false);
});

test('external navigation allows web protocols only', () => {
  assert.equal(safeExternalUrl('https://example.com/docs'), 'https://example.com/docs');
  assert.equal(safeExternalUrl('http://example.com'), 'http://example.com/');
  assert.equal(safeExternalUrl('javascript:alert(1)'), null);
  assert.equal(safeExternalUrl('file:///etc/passwd'), null);
  assert.equal(safeExternalUrl('not a URL'), null);
});
