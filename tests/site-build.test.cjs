'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const siteOrigin = 'https://fader-deck.vercel.app';

test('production site includes its pages, internal links and referenced assets', (t) => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'faderdeck-site-test-'));
  t.after(() => fs.rmSync(output, { recursive: true, force: true }));
  execFileSync(
    process.execPath,
    [
      path.join(root, 'node_modules/vite/bin/vite.js'),
      'build',
      '--config',
      path.join(root, 'vite.config.mjs'),
      '--outDir',
      output,
      '--emptyOutDir',
    ],
    { cwd: root, stdio: 'pipe' },
  );

  function checkReference(reference, from) {
    if (/^(?:data:|mailto:|tel:|javascript:)/i.test(reference)) return;
    const url = new URL(reference, `${siteOrigin}/${from}`);
    if (url.origin !== siteOrigin) return;
    const relativePath = decodeURIComponent(url.pathname.slice(1)) || 'index.html';
    const filePath = path.join(output, relativePath);
    assert.ok(fs.existsSync(filePath), `${from}: missing ${url.pathname}`);
    if (url.hash) {
      const target = fs.readFileSync(filePath, 'utf8');
      const ids = [...target.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]);
      assert.ok(
        ids.includes(decodeURIComponent(url.hash.slice(1))),
        `${from}: missing ${url.hash}`,
      );
    }
  }

  for (const page of ['index.html', 'guia-midi-windows.html']) {
    const pagePath = path.join(output, page);
    assert.ok(fs.existsSync(pagePath), `missing page ${page}`);
    const html = fs.readFileSync(pagePath, 'utf8');
    for (const match of html.matchAll(/\b(?:href|src)=["']([^"']+)["']/g)) {
      checkReference(match[1], page);
    }
    for (const match of html.matchAll(
      /<meta\b[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/g,
    )) {
      checkReference(match[1], page);
    }
  }

  const assets = path.join(output, 'assets');
  for (const file of fs.readdirSync(assets).filter((name) => name.endsWith('.css'))) {
    const css = fs.readFileSync(path.join(assets, file), 'utf8');
    for (const match of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
      checkReference(match[1], `assets/${file}`);
    }
  }
});
