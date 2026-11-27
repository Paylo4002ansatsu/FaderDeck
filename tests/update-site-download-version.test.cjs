'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { updateSiteDownloadVersion } = require('../scripts/update-site-download-version.cjs');

const WINDOWS_100 =
  'https://github.com/Paylo4002ansatsu/FaderDeck/releases/download/1.0.0/FaderDeck-Windows-Setup.exe';
const MACOS_101 =
  'https://github.com/Paylo4002ansatsu/FaderDeck/releases/download/1.0.1/FaderDeck-Mac.dmg';
const WINDOWS_120 =
  'https://github.com/Paylo4002ansatsu/FaderDeck/releases/download/1.2.0/FaderDeck-Windows-Setup.exe';
const MACOS_120 =
  'https://github.com/Paylo4002ansatsu/FaderDeck/releases/download/1.2.0/FaderDeck-Mac.dmg';
const MONTEREY_101 =
  'https://github.com/Paylo4002ansatsu/FaderDeck/releases/download/1.0.1/FaderDeck-Mac-Monterey-Intel.dmg';
const MONTEREY_120 =
  'https://github.com/Paylo4002ansatsu/FaderDeck/releases/download/1.2.0/FaderDeck-Mac-Monterey-Intel.dmg';

function createDocsFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'faderdeck-site-version-'));
  fs.writeFileSync(
    path.join(directory, 'index.html'),
    `<a href="#downloads">Smart download</a> <a href="${WINDOWS_100}">Windows · 64-bit · 1.0.0</a> <a href="${MACOS_101}">Mac download</a> <a href="${MONTEREY_101}">Mac Intel · 1.0.1 · DMG</a>`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(directory, 'app.js'),
    `const MACOS_URL = '${MACOS_101}'; button.href = '${WINDOWS_100}'; const MONTEREY_URL = '${MONTEREY_101}';`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(directory, 'README.md'),
    'Os links atuais permanecem fixos em `1.0.0`\n',
    'utf8',
  );
  return directory;
}

function readFixture(directory) {
  return Object.fromEntries(
    ['index.html', 'app.js', 'README.md'].map((name) => [
      name,
      fs.readFileSync(path.join(directory, name), 'utf8'),
    ]),
  );
}

test('updates both platform links and the Windows label to one numeric tag', (t) => {
  const docsDirectory = createDocsFixture();
  t.after(() => fs.rmSync(docsDirectory, { recursive: true, force: true }));

  const result = updateSiteDownloadVersion(docsDirectory, '1.2.0');
  const files = readFixture(docsDirectory);
  assert.equal(result.windowsUrl, WINDOWS_120);
  assert.equal(result.macosUrl, MACOS_120);
  assert.deepEqual(result.changed, ['html', 'script', 'readme']);
  assert.equal((files['index.html'].match(new RegExp(WINDOWS_120, 'g')) || []).length, 1);
  assert.equal((files['index.html'].match(new RegExp(MACOS_120, 'g')) || []).length, 1);
  assert.match(files['index.html'], /Windows · 64-bit · 1\.2\.0/);
  assert.equal((files['app.js'].match(new RegExp(WINDOWS_120, 'g')) || []).length, 1);
  assert.equal((files['app.js'].match(new RegExp(MACOS_120, 'g')) || []).length, 1);
  assert.ok(files['index.html'].includes(MONTEREY_120));
  assert.ok(files['app.js'].includes(MONTEREY_120));
  assert.match(files['index.html'], /Mac Intel · 1\.2\.0 · DMG/);
  assert.match(files['README.md'], /Os links atuais permanecem fixos em `1\.2\.0`/);
  for (const text of Object.values(files)) {
    assert.doesNotMatch(text, /releases\/download\/v1\.2\.0\//);
  }
});

test('rejects a tag with v prefix before changing files', (t) => {
  const docsDirectory = createDocsFixture();
  t.after(() => fs.rmSync(docsDirectory, { recursive: true, force: true }));
  const before = readFixture(docsDirectory);

  assert.throws(() => updateSiteDownloadVersion(docsDirectory, 'v1.2.0'), /sem prefixo v/);
  assert.deepEqual(readFixture(docsDirectory), before);
});

test('validates all platform links before writing any files', (t) => {
  const docsDirectory = createDocsFixture();
  t.after(() => fs.rmSync(docsDirectory, { recursive: true, force: true }));
  const before = readFixture(docsDirectory);
  fs.writeFileSync(path.join(docsDirectory, 'app.js'), 'const MACOS_URL = "missing";', 'utf8');
  const invalidBefore = readFixture(docsDirectory);

  assert.throws(
    () => updateSiteDownloadVersion(docsDirectory, '1.2.0'),
    /docs\/app\.js: esperados 1 link Windows, encontrados 0/,
  );
  assert.deepEqual(readFixture(docsDirectory), invalidBefore);
  assert.notDeepEqual(invalidBefore, before);
});
