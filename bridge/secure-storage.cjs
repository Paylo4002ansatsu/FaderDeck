'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createAtomicFileWriter, createSerialQueue } = require('../server-utils.cjs');

function createSecureStorage(directory, safeStorage) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('O armazenamento seguro do sistema não está disponível.');
  }
  const fileForKey = (key) =>
    path.join(
      directory,
      `.faderdeck-secure-${crypto.createHash('sha256').update(key).digest('hex')}`,
    );
  const writers = new Map();
  function writerFor(file) {
    if (!writers.has(file)) {
      const write = createAtomicFileWriter(file);
      writers.set(
        file,
        createSerialQueue(async (value) => {
          if (value !== null) return write(value);
          try {
            await fs.promises.unlink(file);
          } catch (error) {
            if (error.code !== 'ENOENT') throw error;
          }
        }),
      );
    }
    return writers.get(file);
  }
  return {
    async getItem(key) {
      let encrypted;
      try {
        encrypted = await fs.promises.readFile(fileForKey(key), 'utf8');
      } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
      }
      return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
    },
    async setItem(key, value) {
      const file = fileForKey(key);
      const encrypted = safeStorage.encryptString(value).toString('base64');
      await writerFor(file)(encrypted);
    },
    async removeItem(key) {
      await writerFor(fileForKey(key))(null);
    },
  };
}

module.exports = { createSecureStorage };
