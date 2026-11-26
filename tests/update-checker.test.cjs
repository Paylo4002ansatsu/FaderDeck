'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  compareVersions,
  createUpdateChecker,
  selectDownloadUrl,
} = require('../bridge/update-checker.cjs');

const RELEASES_API_URL = 'https://api.github.com/repos/Paylo4002ansatsu/FaderDeck/releases/latest';

function response(release) {
  return {
    ok: true,
    async json() {
      return release;
    },
  };
}

function makeChecker({ platform = 'darwin', release, fetchImpl, timeoutMs = 4000 } = {}) {
  return createUpdateChecker({
    packageJsonPath: path.join(__dirname, '..', 'package.json'),
    platform,
    timeoutMs,
    cacheTtlMs: 0,
    fetchImpl:
      fetchImpl ||
      (async () =>
        response({
          tag_name: 'v1.0.5',
          name: 'FaderDeck 1.0.5',
          body: 'Novidades da versão.',
          html_url: 'https://github.com/Paylo4002ansatsu/FaderDeck/releases/tag/v1.0.5',
          assets: [
            {
              name: 'FaderDeck-Mac.dmg',
              browser_download_url:
                'https://github.com/Paylo4002ansatsu/FaderDeck/releases/download/v1.0.5/FaderDeck-Mac.dmg',
            },
            {
              name: 'FaderDeck-Windows-Setup.exe',
              browser_download_url:
                'https://github.com/Paylo4002ansatsu/FaderDeck/releases/download/v1.0.5/FaderDeck-Windows-Setup.exe',
            },
          ],
          ...release,
        })),
  });
}

test('compares released versions including prefix v and prerelease tags', () => {
  assert.equal(compareVersions('1.0.5', '1.0.4'), 1);
  assert.equal(compareVersions('1.0.4', 'v1.0.5'), -1);
  assert.equal(compareVersions('v1.0.5', '1.0.5'), 0);
  assert.equal(compareVersions('1.0.5', '1.0.5-rc.1'), 1);
  assert.equal(compareVersions('not-a-version', '1.0.5'), null);
});

test('selects macOS DMG before ZIP and Windows EXE assets', () => {
  const assets = [
    { name: 'FaderDeck-Mac.zip', browser_download_url: 'https://github.com/a/mac.zip' },
    { name: 'FaderDeck-Mac.dmg', browser_download_url: 'https://github.com/a/mac.dmg' },
    { name: 'FaderDeck-Windows-Setup.exe', browser_download_url: 'https://github.com/a/app.exe' },
  ];

  assert.equal(
    selectDownloadUrl(assets, 'darwin', 'https://github.com/releases/latest'),
    'https://github.com/a/mac.dmg',
  );
  assert.equal(
    selectDownloadUrl(assets, 'win32', 'https://github.com/releases/latest'),
    'https://github.com/a/app.exe',
  );
  assert.equal(
    selectDownloadUrl([], 'darwin', 'https://github.com/releases/latest'),
    'https://github.com/releases/latest',
  );
});

test('detects required and optional updates and sends GitHub request headers', async () => {
  let requestUrl;
  let requestOptions;
  const requiredChecker = makeChecker({
    release: { name: '[REQUIRED] FaderDeck 1.0.5', body: 'Atualização importante.' },
    fetchImpl: async (url, options) => {
      requestUrl = url;
      requestOptions = options;
      return response({
        tag_name: 'v1.0.5',
        name: '[REQUIRED] FaderDeck 1.0.5',
        body: 'Atualização importante.',
        html_url: 'https://github.com/Paylo4002ansatsu/FaderDeck/releases/tag/v1.0.5',
        assets: [],
      });
    },
  });
  const required = await requiredChecker.checkForUpdate();
  assert.equal(requestUrl, RELEASES_API_URL);
  assert.equal(requestOptions.headers['User-Agent'], 'FaderDeck-Update-Checker');
  assert.equal(required.updateAvailable, true);
  assert.equal(required.mandatory, true);
  assert.equal(required.downloadUrl, required.releaseUrl);
  assert.doesNotMatch(required.releaseNotes, /REQUIRED/i);

  const optionalChecker = makeChecker({
    release: { name: 'FaderDeck 1.0.5', body: 'Novidades disponíveis.' },
  });
  const optional = await optionalChecker.checkForUpdate();
  assert.equal(optional.updateAvailable, true);
  assert.equal(optional.mandatory, false);
  assert.match(optional.releaseNotes, /Novidades disponíveis/);
  assert.match(optional.downloadUrl, /\.dmg$/);

  const mandatoryByPortugueseMarker = makeChecker({
    fetchImpl: async () =>
      response({
        tag_name: 'v1.0.5',
        name: 'FaderDeck',
        body: '[OBRIGATORIA] Atualize para continuar.',
        html_url: 'https://github.com/Paylo4002ansatsu/FaderDeck/releases/latest',
        assets: [],
      }),
  });
  assert.equal((await mandatoryByPortugueseMarker.checkForUpdate()).mandatory, true);
});

test('selects Windows download and reports no update when the local version is current', async () => {
  const windowsChecker = makeChecker({ platform: 'win32' });
  const windowsResult = await windowsChecker.checkForUpdate();
  assert.match(windowsResult.downloadUrl, /\.exe$/);

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'faderdeck-update-check-'));
  const packageJsonPath = path.join(directory, 'package.json');
  fs.writeFileSync(packageJsonPath, JSON.stringify({ version: '1.0.5' }));
  try {
    const currentChecker = createUpdateChecker({
      packageJsonPath,
      fetchImpl: async () =>
        response({
          tag_name: 'v1.0.5',
          html_url: 'https://github.com/Paylo4002ansatsu/FaderDeck/releases/latest',
          assets: [],
        }),
    });
    const current = await currentChecker.checkForUpdate();
    assert.equal(current.updateAvailable, false);
    assert.equal(current.latestVersion, '1.0.5');
    assert.equal(current.downloadUrl, null);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('fails safely and silently when GitHub is offline or the request times out', async () => {
  const offlineChecker = makeChecker({
    fetchImpl: async () => {
      throw new Error('offline');
    },
  });
  const offline = await offlineChecker.checkForUpdate();
  assert.equal(offline.updateAvailable, false);
  assert.equal(offline.mandatory, false);
  assert.equal(offline.latestVersion, null);

  const timeoutChecker = makeChecker({
    timeoutMs: 20,
    fetchImpl: (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      }),
  });
  const timeoutResult = await timeoutChecker.checkForUpdate();
  assert.equal(timeoutResult.updateAvailable, false);
  assert.equal(timeoutResult.downloadUrl, null);
});
