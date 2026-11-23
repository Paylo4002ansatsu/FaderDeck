'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  detectMacChip,
  detectPlatform,
  detectWindowsBitness,
  resolveDownloadTarget,
} = require('../docs/platform-detection.js');

test('detects Windows and macOS from User-Agent Client Hints and fallback User-Agent', () => {
  assert.equal(detectPlatform({ userAgentData: { platform: 'Windows' } }), 'windows');
  assert.equal(
    detectPlatform({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }),
    'macos',
  );
  assert.equal(detectPlatform({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' }), 'other');
});

test('prefers Windows OS bitness hints over a 32-bit browser user-agent marker', async () => {
  const navigatorRef = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; WOW64; x86)',
    userAgentData: {
      getHighEntropyValues: async () => ({ architecture: 'x86', bitness: '64' }),
    },
  };

  assert.equal(await detectWindowsBitness(navigatorRef), '64');
});

test('detects Windows 32-bit and 64-bit with User-Agent fallback', async () => {
  assert.equal(
    await detectWindowsBitness({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win32; x86)' }),
    '32',
  );
  assert.equal(
    await detectWindowsBitness({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }),
    '64',
  );
  assert.equal(
    await detectWindowsBitness({ userAgent: 'Mozilla/5.0 (Windows NT 10.0)' }),
    'unknown',
  );
});

test('falls back to User-Agent detection if Windows Client Hints fail', async () => {
  const navigatorRef = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    userAgentData: {
      getHighEntropyValues: async () => {
        throw new Error('hints unavailable');
      },
    },
  };

  assert.equal(await detectWindowsBitness(navigatorRef), '64');
});

test('identifies Mac chips only from architecture hints and otherwise leaves chip unknown', async () => {
  assert.equal(
    await detectMacChip({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    }),
    'unknown',
  );
  assert.equal(
    await detectMacChip({
      userAgentData: { getHighEntropyValues: async () => ({ architecture: 'arm' }) },
    }),
    'apple-silicon',
  );
  assert.equal(
    await detectMacChip({
      userAgentData: { getHighEntropyValues: async () => ({ architecture: 'x86' }) },
    }),
    'intel',
  );
});

test('routes Windows x64 to the supported installer and never offers it to Windows x86', () => {
  const x64 = resolveDownloadTarget('windows', '64');
  assert.equal(x64.download, 'windows');
  assert.equal(x64.available, true);
  assert.match(x64.label, /64-bit/);

  const x86 = resolveDownloadTarget('windows', '32');
  assert.equal(x86.download, null);
  assert.equal(x86.available, false);
  assert.match(x86.message, /Windows 32-bit/);
});

test('routes Mac users to installer choices that account for macOS version', () => {
  const intel = resolveDownloadTarget('macos', 'unknown', 'intel');
  const appleSilicon = resolveDownloadTarget('macos', 'unknown', 'apple-silicon');
  const safariFallback = resolveDownloadTarget('macos', 'unknown', 'unknown');

  assert.equal(intel.download, 'downloads');
  assert.equal(appleSilicon.download, 'downloads');
  assert.equal(safariFallback.download, 'downloads');
  assert.match(intel.message, /Monterey.*Universal/);
  assert.match(appleSilicon.message, /macOS 13 Ventura ou posterior/);
  assert.match(safariFallback.message, /Monterey 12.*somente para Mac Intel.*macOS 13/);
});
