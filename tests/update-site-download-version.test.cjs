'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { updateSiteDownloadVersion } = require('../scripts/update-site-download-version.cjs');

const URL_100 = 'https://github.com/Paylo4002ansatsu/FaderDeck/releases/download/1.0.0/FaderDeck-Windows-Setup.exe';
const URL_120 = 'https://github.com/Paylo4002ansatsu/FaderDeck/releases/download/1.2.0/FaderDeck-Windows-Setup.exe';

function createDocsFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'faderdeck-site-version-'));
  fs.writeFileSync(path.join(directory, 'index.html'), `<a href="${URL_100}">Windows Setup · 1.0.0</a>`, 'utf8');
  fs.writeFileSync(path.join(directory, 'app.js'), `button.href = '${URL_100}';`, 'utf8');
  fs.writeFileSync(path.join(directory, 'README.md'), `Download: ${URL_100}\n`, 'utf8');
  return directory;
}

test('updates the HTML, smart-download script and README to the numeric tag without v', (t) => {
  const docsDirectory = createDocsFixture();
  t.after(() => fs.rmSync(docsDirectory, { recursive: true, force: true }));

  const result = updateSiteDownloadVersion(docsDirectory, '1.2.0');
  assert.equal(result.windowsUrl, URL_120);
  assert.deepEqual(result.changed, ['html', 'script', 'readme']);
  assert.match(fs.readFileSync(path.join(docsDirectory, 'index.html'), 'utf8'), new RegExp(URL_120.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(fs.readFileSync(path.join(docsDirectory, 'index.html'), 'utf8'), /Windows Setup · 1\.2\.0/);
  assert.match(fs.readFileSync(path.join(docsDirectory, 'app.js'), 'utf8'), new RegExp(URL_120.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(fs.readFileSync(path.join(docsDirectory, 'README.md'), 'utf8'), new RegExp(URL_120.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  for (const name of ['index.html', 'app.js', 'README.md']) {
    assert.doesNotMatch(fs.readFileSync(path.join(docsDirectory, name), 'utf8'), /releases\/download\/v1\.2\.0\//);
  }
});

test('rejects a tag with v prefix before changing files', (t) => {
  const docsDirectory = createDocsFixture();
  t.after(() => fs.rmSync(docsDirectory, { recursive: true, force: true }));
  const before = Object.fromEntries(['index.html', 'app.js', 'README.md'].map((name) => [name, fs.readFileSync(path.join(docsDirectory, name), 'utf8')]));

  assert.throws(() => updateSiteDownloadVersion(docsDirectory, 'v1.2.0'), /sem prefixo v/);
  for (const [name, contents] of Object.entries(before)) {
    assert.equal(fs.readFileSync(path.join(docsDirectory, name), 'utf8'), contents);
  }
});

test('validates all expected links before writing any files', (t) => {
  const docsDirectory = createDocsFixture();
  t.after(() => fs.rmSync(docsDirectory, { recursive: true, force: true }));
  const htmlPath = path.join(docsDirectory, 'index.html');
  const appPath = path.join(docsDirectory, 'app.js');
  const originalHtml = fs.readFileSync(htmlPath, 'utf8');
  fs.writeFileSync(appPath, 'button.href = "missing";', 'utf8');

  assert.throws(() => updateSiteDownloadVersion(docsDirectory, '1.2.0'), /docs\/app\.js: esperado um único link Windows/);
  assert.equal(fs.readFileSync(htmlPath, 'utf8'), originalHtml);
});
