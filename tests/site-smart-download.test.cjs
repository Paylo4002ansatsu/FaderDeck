'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const platformDetection = require('../docs/platform-detection.js');

const appSource = fs.readFileSync(path.join(__dirname, '../docs/app.js'), 'utf8');
const WINDOWS_URL =
  'https://github.com/Paylo4002ansatsu/FaderDeck/releases/download/1.0.3/FaderDeck-Windows-Setup.exe';
const MACOS_URL =
  'https://github.com/Paylo4002ansatsu/FaderDeck/releases/download/1.0.3/FaderDeck-Mac.dmg';

class FakeElement {
  constructor(href = '') {
    this.href = href;
    this.textContent = '';
    this.innerHTML = '';
    this.attributes = new Map();
    this.classes = new Set();
    this.classList = {
      toggle: (name, enabled) => {
        if (enabled) this.classes.add(name);
        else this.classes.delete(name);
      },
    };
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === 'href') this.href = '';
  }
}

function createPage(navigatorRef) {
  const elements = new Map([
    ['year', new FakeElement()],
    ['smart-download', new FakeElement('#downloads')],
    ['smart-download-label', new FakeElement()],
    ['smart-download-icon', new FakeElement()],
    ['download-compatibility-message', new FakeElement()],
    ['download-windows', new FakeElement(WINDOWS_URL)],
    ['download-windows-detail', new FakeElement()],
    ['download-mac', new FakeElement(MACOS_URL)],
  ]);
  const documentRef = { getElementById: (id) => elements.get(id) || null };
  const windowRef = {
    FaderDeckPlatformDetection: platformDetection,
    navigator: navigatorRef,
    localStorage: { getItem: () => null, setItem: () => {} },
  };

  vm.runInNewContext(appSource, { window: windowRef, document: documentRef, Date });
  return new Promise((resolve) => {
    setImmediate(() => resolve(elements));
  });
}

test('the main and manual Windows buttons select x64 only for 64-bit Windows', async () => {
  const elements = await createPage({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  });

  assert.equal(elements.get('smart-download').href, WINDOWS_URL);
  assert.match(elements.get('smart-download-label').textContent, /Windows 64-bit/);
  assert.equal(elements.get('download-windows').href, WINDOWS_URL);
  assert.match(elements.get('download-compatibility-message').textContent, /64-bit detectado/);
});

test('the main and manual Windows buttons are disabled on 32-bit Windows', async () => {
  const elements = await createPage({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win32; x86)',
  });

  assert.equal(elements.get('smart-download').href, '');
  assert.equal(elements.get('smart-download').attributes.get('aria-disabled'), 'true');
  assert.equal(elements.get('download-windows').href, '');
  assert.equal(elements.get('download-windows').attributes.get('aria-disabled'), 'true');
  assert.match(elements.get('download-windows-detail').textContent, /indisponível/i);
  assert.match(elements.get('download-compatibility-message').textContent, /Windows 32-bit/);
});

test('the Mac fallback never misidentifies Safari as Intel and uses the universal DMG', async () => {
  const elements = await createPage({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
  });

  assert.equal(elements.get('smart-download').href, MACOS_URL);
  assert.equal(elements.get('download-mac').href, MACOS_URL);
  assert.equal(elements.get('smart-download-label').textContent, 'Baixar para macOS (Universal)');
  assert.match(elements.get('download-compatibility-message').textContent, /Intel e Apple Silicon/);
});

test('User-Agent Client Hints can label Apple Silicon while keeping the universal DMG', async () => {
  const elements = await createPage({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    userAgentData: {
      platform: 'macOS',
      getHighEntropyValues: async () => ({ architecture: 'arm' }),
    },
  });

  assert.equal(elements.get('smart-download').href, MACOS_URL);
  assert.match(elements.get('smart-download-label').textContent, /Apple Silicon/);
  assert.match(elements.get('download-compatibility-message').textContent, /universal/i);
});
