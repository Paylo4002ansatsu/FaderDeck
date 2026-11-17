'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createAtomicFileWriter } = require('../server-utils.cjs');

function createLayoutPersistence({
  filePath,
  debounceMs = 500,
  onError = () => {},
  createWriter = createAtomicFileWriter,
}) {
  if (typeof filePath !== 'string' || filePath.length === 0)
    throw new TypeError('filePath must be a non-empty string');
  let writer = null;
  let timer = null;

  function load(defaultLayout) {
    try {
      const saved = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (saved && Number.isInteger(saved.version) && Array.isArray(saved.pages)) return saved;
    } catch {}
    return defaultLayout;
  }

  function initializeWriter() {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    writer = createWriter(filePath);
  }

  function persist(layout) {
    if (!writer)
      return Promise.reject(new Error('O armazenamento do layout ainda não foi inicializado.'));
    return writer(JSON.stringify(layout, null, 2));
  }

  function schedule(getLayout) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      persist(getLayout()).catch((error) => onError('Falha ao salvar layout:', error));
    }, debounceMs);
  }

  async function flush(getLayout) {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (writer) await persist(getLayout());
  }

  function cancel() {
    if (!timer) return false;
    clearTimeout(timer);
    timer = null;
    return true;
  }

  return {
    load,
    initializeWriter,
    persist,
    schedule,
    flush,
    cancel,
    get pending() {
      return Boolean(timer);
    },
  };
}

module.exports = { createLayoutPersistence };
