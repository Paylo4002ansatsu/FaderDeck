'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function parseRequestTarget(requestTarget, hostHeader = 'localhost') {
  const parsedUrl = new URL(requestTarget || '/', `http://${hostHeader || 'localhost'}`);
  return { url: parsedUrl, pathname: decodeURIComponent(parsedUrl.pathname) };
}

function createSerialQueue(task) {
  if (typeof task !== 'function') throw new TypeError('task must be a function');
  let tail = Promise.resolve();

  return (...args) => {
    const result = tail.catch(() => {}).then(() => task(...args));
    tail = result.catch(() => {});
    return result;
  };
}

function createAtomicFileWriter(filePath) {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    throw new TypeError('filePath must be a non-empty string');
  }

  return createSerialQueue(async (contents) => {
    const temporaryPath = path.join(
      path.dirname(filePath),
      `.${path.basename(filePath)}.${process.pid}.${crypto.randomUUID()}.tmp`,
    );

    try {
      await fs.promises.writeFile(temporaryPath, String(contents), {
        encoding: 'utf8',
        mode: 0o600,
      });
      await fs.promises.rename(temporaryPath, filePath);
    } catch (error) {
      try { await fs.promises.unlink(temporaryPath); } catch {}
      throw error;
    }
  });
}

module.exports = { parseRequestTarget, createSerialQueue, createAtomicFileWriter };
