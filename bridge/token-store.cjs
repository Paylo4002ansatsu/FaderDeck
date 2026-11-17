'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');

function createTokenStore(filePath, { onSaveError = () => {} } = {}) {
  if (typeof filePath !== 'string' || filePath.length === 0) throw new TypeError('filePath must be a non-empty string');

  function write(token) {
    fs.writeFileSync(filePath, `${token}\n`, { encoding: 'utf8', mode: 0o600 });
    fs.chmodSync(filePath, 0o600);
  }

  function loadOrCreate() {
    try {
      const saved = fs.readFileSync(filePath, 'utf8').trim();
      if (/^[a-f0-9]{32}$/i.test(saved)) {
        try { fs.chmodSync(filePath, 0o600); } catch {}
        return saved;
      }
    } catch {}
    const token = crypto.randomBytes(16).toString('hex');
    try { write(token); }
    catch (error) { onSaveError(error); }
    return token;
  }

  function rotate() {
    const token = crypto.randomBytes(16).toString('hex');
    write(token);
    return token;
  }

  return { loadOrCreate, rotate };
}

module.exports = { createTokenStore };
