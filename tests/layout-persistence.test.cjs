'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createLayoutPersistence } = require('../bridge/layout-persistence.cjs');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

 test('loads the existing layout JSON shape without migration or data loss', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'faderdeck-layout-store-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'faderdeck-layout.json');
  const legacyLayout = { version: 7, pages: [{ id: 'stage', controls: [{ id: 'f1', x: 0.2 }] }], activePageId: 'stage', customField: 'preserve' };
  fs.writeFileSync(filePath, JSON.stringify(legacyLayout));
  const persistence = createLayoutPersistence({ filePath });
  assert.deepEqual(persistence.load({ version: 0, pages: [], activePageId: '' }), legacyLayout);
});

test('uses default layout when persisted JSON is invalid or has an incompatible root shape', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'faderdeck-layout-store-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'faderdeck-layout.json');
  const fallback = { version: 0, pages: [], activePageId: '' };
  fs.writeFileSync(filePath, '{invalid');
  const persistence = createLayoutPersistence({ filePath });
  assert.deepEqual(persistence.load(fallback), fallback);
  fs.writeFileSync(filePath, JSON.stringify({ version: '1', pages: [] }));
  assert.deepEqual(persistence.load(fallback), fallback);
});

test('debounced save persists the latest snapshot and flush cancels pending timer', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'faderdeck-layout-store-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'nested', 'faderdeck-layout.json');
  let layout = { version: 1, pages: [{ id: 'first' }] };
  const persistence = createLayoutPersistence({ filePath, debounceMs: 40 });
  persistence.initializeWriter();
  persistence.schedule(() => layout);
  layout = { version: 2, pages: [{ id: 'latest' }] };
  persistence.schedule(() => layout);
  assert.equal(persistence.pending, true);
  await persistence.flush(() => layout);
  assert.equal(persistence.pending, false);
  assert.deepEqual(JSON.parse(fs.readFileSync(filePath, 'utf8')), layout);
  await wait(60);
  assert.deepEqual(JSON.parse(fs.readFileSync(filePath, 'utf8')), layout);
});

test('debounced writes report errors and later writes continue to work', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'faderdeck-layout-store-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'layout.json');
  const reported = [];
  let layout = { version: 1, pages: [{ id: 'one' }] };
  const persistence = createLayoutPersistence({
    filePath,
    debounceMs: 5,
    createWriter: () => async () => { throw new Error('disk full'); },
    onError: (prefix, error) => reported.push([prefix, error.message]),
  });
  persistence.initializeWriter();
  persistence.schedule(() => layout);
  await wait(20);
  assert.deepEqual(reported, [['Falha ao salvar layout:', 'disk full']]);
  assert.equal(persistence.pending, false);
  assert.equal(typeof persistence.cancel(), 'boolean');
});
