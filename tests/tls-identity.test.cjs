'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createTlsIdentity } = require('../bridge/tls-identity.cjs');

test('creates a protected local CA and signs a server certificate for loopback and LAN hosts', (t) => {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'faderdeck-tls-test-'));
  t.after(() => fs.rmSync(dataDirectory, { recursive: true, force: true }));

  const identity = createTlsIdentity(dataDirectory, ['192.168.10.24', 'invalid-address']);
  const authority = new crypto.X509Certificate(identity.caCertificate);
  const serverCertificate = new crypto.X509Certificate(identity.cert);
  assert.equal(authority.ca, true);
  assert.equal(authority.verify(authority.publicKey), true);
  assert.equal(serverCertificate.verify(authority.publicKey), true);
  assert.match(serverCertificate.subjectAltName, /127\.0\.0\.1/);
  assert.match(serverCertificate.subjectAltName, /192\.168\.10\.24/);
  assert.equal(identity.fingerprint, authority.fingerprint256);

  const identityPath = path.join(dataDirectory, '.faderdeck-tls', 'ca-identity.pem');
  if (process.platform !== 'win32') assert.equal(fs.statSync(identityPath).mode & 0o777, 0o600);
  const nextIdentity = createTlsIdentity(dataDirectory, ['192.168.10.24']);
  assert.equal(nextIdentity.caCertificate, identity.caCertificate);
  assert.notEqual(nextIdentity.cert, identity.cert);
});

test('does not silently replace an invalid persisted CA identity', (t) => {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'faderdeck-tls-invalid-'));
  t.after(() => fs.rmSync(dataDirectory, { recursive: true, force: true }));
  const identityPath = path.join(dataDirectory, '.faderdeck-tls', 'ca-identity.pem');
  fs.mkdirSync(path.dirname(identityPath), { recursive: true });
  fs.writeFileSync(identityPath, 'invalid certificate material');

  assert.throws(() => createTlsIdentity(dataDirectory), /identidade TLS local.*inválida/);
  assert.equal(fs.readFileSync(identityPath, 'utf8'), 'invalid certificate material');
});
