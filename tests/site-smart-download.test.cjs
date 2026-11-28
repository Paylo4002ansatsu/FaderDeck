'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const platformDetection = require('../docs/platform-detection.js');
const rootReadme = fs.readFileSync(path.join(__dirname, '../README.md'), 'utf8');

const appSource = fs.readFileSync(path.join(__dirname, '../docs/app.js'), 'utf8');
const siteStyles = fs.readFileSync(path.join(__dirname, '../docs/styles.css'), 'utf8');
const landingHtml = fs.readFileSync(path.join(__dirname, '../docs/index.html'), 'utf8');
const WINDOWS_URL = landingHtml.match(
  /https:\/\/github\.com\/Paylo4002ansatsu\/FaderDeck\/releases\/download\/[^/]+\/FaderDeck-Windows-Setup\.exe/,
)?.[0];
const MACOS_URL = landingHtml.match(
  /https:\/\/github\.com\/Paylo4002ansatsu\/FaderDeck\/releases\/download\/[^/]+\/FaderDeck-Mac\.dmg/,
)?.[0];

test('README links to the current release and Vercel site', () => {
  const { version } = require('../package.json');
  const releaseVersion = WINDOWS_URL?.match(/\/download\/([^/]+)\//)?.[1];
  assert.equal(releaseVersion, version);
  assert.ok(MACOS_URL.includes(`/download/${version}/`));
  assert.ok(
    rootReadme.includes(
      `![Versão ${version}](https://img.shields.io/badge/vers%C3%A3o-${version.replaceAll('-', '--')}-20b2aa)`,
    ),
  );
  assert.ok(rootReadme.includes('https://github.com/Paylo4002ansatsu/FaderDeck/releases'));
  assert.ok(rootReadme.includes('https://fader-deck.vercel.app/'));
  assert.ok(rootReadme.includes('https://fader-deck.vercel.app/guia-midi-windows.html'));
  assert.equal(rootReadme.includes('paylo4002ansatsu.github.io/FaderDeck'), false);
  assert.ok(landingHtml.includes('https://fader-deck.vercel.app/faderdeck-icon.png'));
});

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
    ['download-macos-monterey', new FakeElement()],
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

test('landing page clearly presents Windows and macOS without development jargon', () => {
  const description = landingHtml.match(/<meta name="description" content="([^"]+)"/);
  assert.ok(description);
  assert.match(description[1], /Windows/);
  assert.match(description[1], /macOS/);
  assert.match(landingHtml, /Windows e macOS/);
  assert.match(landingHtml, /loopMIDI/);
  assert.match(landingHtml, /no Mac, o FaderDeck cria a porta automaticamente/i);
  assert.match(landingHtml, /loopMIDI em execução/);
  assert.match(landingHtml, /compatibilidade com Windows 11/);
  assert.match(landingHtml, /sem isolamento entre eles/);
  assert.match(landingHtml, /macOS Ventura 13 ou posterior/);
  assert.match(landingHtml, /não há instalador Monterey para Apple Silicon/);
  assert.doesNotMatch(
    landingHtml,
    /WebSocket|CoreMIDI|IP:PORTA|Application Support|token|npm|Node\.js/i,
  );
  assert.doesNotMatch(
    landingHtml,
    /Seus layouts ficam no seu Mac|Do Mac para o|Ponte virtual no macOS/i,
  );
});

test('Monterey compatibility button links to Intel installer when public installer exists', () => {
  const button = landingHtml.match(
    /<a class="platform-button monterey-download-button"[^>]*href="([^"]+)"[^>]*>/,
  );
  assert.ok(button, 'Monterey button exists');
  assert.match(button[1], /FaderDeck-Mac-Monterey-Intel\.dmg$/);
  assert.match(landingHtml, /Mac Intel · macOS Monterey 12/);
  assert.match(siteStyles, /\.monterey-download-button/);
});

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

test('the Mac fallback sends Safari to the version-specific installer choices', async () => {
  const elements = await createPage({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
  });

  assert.equal(elements.get('smart-download').href, '#downloads');
  assert.equal(elements.get('download-mac').href, MACOS_URL);
  assert.match(elements.get('download-macos-monterey').href, /FaderDeck-Mac-Monterey-Intel\.dmg$/);
  assert.equal(elements.get('smart-download-label').textContent, 'Escolher instalador para Mac');
  assert.match(
    elements.get('download-compatibility-message').textContent,
    /Monterey 12.*Mac Intel.*macOS 13/,
  );
});

test('Mac architecture hints do not bypass the macOS version-specific installer choices', async () => {
  const elements = await createPage({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    userAgentData: {
      platform: 'macOS',
      getHighEntropyValues: async () => ({ architecture: 'arm' }),
    },
  });

  assert.equal(elements.get('smart-download').href, '#downloads');
  assert.equal(elements.get('download-mac').href, MACOS_URL);
  assert.match(elements.get('download-macos-monterey').href, /FaderDeck-Mac-Monterey-Intel\.dmg$/);
  assert.equal(elements.get('smart-download-label').textContent, 'Escolher instalador para Mac');
  assert.match(
    elements.get('download-compatibility-message').textContent,
    /macOS 13 Ventura ou posterior/,
  );
});

test('landing uses local brand fonts and a readable responsive type scale', () => {
  assert.doesNotMatch(siteStyles, /fonts\.googleapis\.com/);
  assert.match(siteStyles, /font-family:Inter;src:url\("assets\/fonts\/inter-400\.woff2"\)/);
  assert.match(
    siteStyles,
    /font-family:"IBM Plex Mono";src:url\("assets\/fonts\/ibm-plex-mono-400\.woff2"\)/,
  );
  assert.match(siteStyles, /body\{[^}]*font-size:16px;line-height:1\.7/s);
  assert.match(siteStyles, /\.feature-card p,\s*\.tray-copy p,[\s\S]*?font-size: 14px/s);
  assert.match(siteStyles, /\.feature-grid \{ grid-template-columns: 1fr; \}/);
  assert.match(siteStyles, /\.primary-nav a \{ min-height: 44px;/);
  assert.match(siteStyles, /\.menu-toggle \{ min-width: 44px; min-height: 44px; \}/);
});
