'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const forge = require('node-forge');

const { pki } = forge;
const CA_DIRECTORY = '.faderdeck-tls';
const CA_IDENTITY_FILE = 'ca-identity.pem';

function serialNumber() {
  return `00${crypto.randomBytes(16).toString('hex')}`;
}

function setValidity(certificate, years) {
  certificate.validity.notBefore = new Date(Date.now() - 60_000);
  certificate.validity.notAfter = new Date();
  certificate.validity.notAfter.setFullYear(certificate.validity.notAfter.getFullYear() + years);
}

function writePrivateFile(filePath, contents) {
  const temporaryPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, contents, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    fs.chmodSync(temporaryPath, 0o600);
    fs.linkSync(temporaryPath, filePath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath);
  }
}

function loadOrCreateAuthority(dataDirectory) {
  const directory = path.join(dataDirectory, CA_DIRECTORY);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
  const identityPath = path.join(directory, CA_IDENTITY_FILE);

  if (!fs.existsSync(identityPath)) {
    const keys = pki.rsa.generateKeyPair(2048);
    const certificate = pki.createCertificate();
    certificate.version = 2;
    certificate.serialNumber = serialNumber();
    certificate.publicKey = keys.publicKey;
    setValidity(certificate, 10);
    const attributes = [{ name: 'commonName', value: 'FaderDeck Local Certificate Authority' }];
    certificate.setSubject(attributes);
    certificate.setIssuer(attributes);
    certificate.setExtensions([
      { name: 'basicConstraints', cA: true, critical: true },
      {
        name: 'keyUsage',
        keyCertSign: true,
        cRLSign: true,
        digitalSignature: true,
        critical: true,
      },
      { name: 'subjectKeyIdentifier' },
    ]);
    certificate.sign(keys.privateKey, forge.md.sha256.create());
    try {
      writePrivateFile(
        identityPath,
        pki.certificateToPem(certificate) + pki.privateKeyToPem(keys.privateKey),
      );
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }

  let identity;
  try {
    if (!fs.lstatSync(identityPath).isFile()) throw new Error('Expected a regular identity file.');
    fs.chmodSync(identityPath, 0o600);
    identity = fs.readFileSync(identityPath, 'utf8');
  } catch (error) {
    throw new Error('Não foi possível ler a identidade TLS local do FaderDeck.', { cause: error });
  }

  try {
    const certificatePem = identity.match(
      /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/,
    )?.[0];
    const privateKeyPem = identity.match(
      /-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA )?PRIVATE KEY-----/,
    )?.[0];
    if (!certificatePem || !privateKeyPem) throw new Error('Expected certificate and private key.');
    const certificate = pki.certificateFromPem(certificatePem);
    const privateKey = pki.privateKeyFromPem(privateKeyPem);
    const x509 = new crypto.X509Certificate(certificatePem);
    const privateKeyObject = crypto.createPrivateKey(pki.privateKeyToPem(privateKey));
    const isCa = certificate.getExtension('basicConstraints')?.cA === true;
    if (!isCa || !x509.verify(x509.publicKey) || !x509.checkPrivateKey(privateKeyObject))
      throw new Error('A identidade TLS local não é uma autoridade certificadora válida.');
    return { certificate, privateKey };
  } catch (error) {
    throw new Error(
      'A identidade TLS local do FaderDeck está inválida; não foi substituída automaticamente.',
      { cause: error },
    );
  }
}

function createTlsIdentity(dataDirectory, addresses = []) {
  const authority = loadOrCreateAuthority(dataDirectory);
  const keys = pki.rsa.generateKeyPair(2048);
  const certificate = pki.createCertificate();
  certificate.version = 2;
  certificate.serialNumber = serialNumber();
  certificate.publicKey = keys.publicKey;
  setValidity(certificate, 1);
  certificate.setSubject([{ name: 'commonName', value: 'FaderDeck Local Server' }]);
  certificate.setIssuer(authority.certificate.subject.attributes);

  const altNames = [
    { type: 2, value: 'localhost' },
    { type: 7, ip: '127.0.0.1' },
    ...Array.from(new Set(addresses.filter((address) => net.isIP(address) === 4)), (ip) => ({
      type: 7,
      ip,
    })),
  ];
  certificate.setExtensions([
    { name: 'basicConstraints', cA: false, critical: true },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, critical: true },
    { name: 'extKeyUsage', serverAuth: true },
    {
      name: 'subjectAltName',
      altNames,
    },
    { name: 'subjectKeyIdentifier' },
  ]);
  certificate.sign(authority.privateKey, forge.md.sha256.create());

  const caCertificate = pki.certificateToPem(authority.certificate);
  const certificatePem = pki.certificateToPem(certificate);
  return {
    caCertificate,
    fingerprint: new crypto.X509Certificate(caCertificate).fingerprint256,
    key: pki.privateKeyToPem(keys.privateKey),
    cert: certificatePem,
  };
}

module.exports = { createTlsIdentity };
