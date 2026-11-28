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

const RELEASES_API_URL =
  'https://api.github.com/repos/Paylo4002ansatsu/FaderDeck/releases?per_page=100&page=1';
const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'faderdeck-update-fixture-'));
const fixturePackage = path.join(fixtureDirectory, 'package.json');
fs.writeFileSync(fixturePackage, JSON.stringify({ version: '1.0.4' }));
test.after(() => fs.rmSync(fixtureDirectory, { recursive: true, force: true }));

function response(release) {
  return {
    ok: true,
    async json() {
      return Array.isArray(release) ? release : [release];
    },
  };
}

function makeChecker({ platform = 'darwin', release, fetchImpl, timeoutMs = 4000 } = {}) {
  return createUpdateChecker({
    packageJsonPath: fixturePackage,
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
  assert.equal(optional.releaseNotes, '');
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

test('only extracts clean list items from user-facing highlights', async () => {
  const friendly = await makeChecker({
    release: {
      body: [
        '## 1.0.5',
        '### Destaques para você',
        '- Organize seus **faders** com mais facilidade.',
        '- Encontre seus controles na mesma ordem.',
        '1. Veja [melhorias no palco](https://github.com/example).',
        '### Correções & Arquitetura',
        '- Detalhe técnico que não deve aparecer.',
        '**Full Changelog**: https://github.com/example',
      ].join('\n'),
    },
  }).checkForUpdate();
  assert.equal(
    friendly.releaseNotes,
    'Organize seus faders com mais facilidade.\nEncontre seus controles na mesma ordem.\nVeja melhorias no palco.',
  );
  const technical = await makeChecker({
    release: {
      body: '### Correções & Arquitetura\n- Alteração interna.\n**Full Changelog**: https://github.com/example',
    },
  }).checkForUpdate();
  assert.equal(technical.releaseNotes, '');
});

test('does not use empty, fenced, old-version or technical sections as highlights', async () => {
  for (const body of [
    '### Destaques para você\n\n### Correções & Arquitetura\n- Interno',
    '```\n### Destaques para você\n- Exemplo em código\n```',
    '## 1.0.5\n### Correções & Arquitetura\n- Interno\n## 1.0.4\n### Destaques para você\n- Destaque antigo',
    '### Destaques para você\n- https://github.com/exemplo\n- **Full Changelog**: https://github.com/exemplo',
    '[FADERDECK_UI]Texto antigo[/FADERDECK_UI]',
  ]) {
    const result = await makeChecker({ release: { body } }).checkForUpdate();
    assert.equal(result.releaseNotes, '', body);
  }
});

test('aggregates unique highlights from every pending stable release across pages', async () => {
  const requests = [];
  const pages = [
    [
      {
        tag_name: 'v1.0.6',
        body: '### Destaques para você\n- Organize seus faders.\n- Toque com facilidade.',
      },
      { tag_name: 'v1.2.0', draft: true, body: '### Destaques para você\n- Rascunho' },
      { tag_name: 'v2.0.0', prerelease: true, body: '### Destaques para você\n- Prévia' },
      { tag_name: 'v1.3.0-rc.1', body: '### Destaques para você\n- Prévia por tag' },
      { tag_name: 'invalid', body: '### Destaques para você\n- Inválida' },
    ],
    [
      {
        tag_name: 'v1.0.10',
        body: '### Destaques para você\n- Toque com facilidade.\n- Veja [seus controles](https://github.com/example).\n### Correções & Arquitetura\n- Interno',
        html_url: 'https://github.com/Paylo4002ansatsu/FaderDeck/releases/tag/v1.0.10',
        assets: [
          { name: 'FaderDeck.dmg', browser_download_url: 'https://github.com/a/latest.dmg' },
        ],
      },
      { tag_name: 'v1.0.8', body: '### Correções & Arquitetura\n- Bastidores' },
      { tag_name: 'v1.0.4', body: '### Destaques para você\n- Versão já instalada' },
      { tag_name: 'v1.0.3', body: '### Destaques para você\n- Versão antiga' },
    ],
  ];
  const checker = makeChecker({
    fetchImpl: async (url) => {
      requests.push(url);
      const index = requests.length - 1;
      return {
        ...response(pages[index]),
        headers: {
          get: () => (index === 0 ? '<https://api.github.com/next>; rel="next"' : null),
        },
      };
    },
  });
  const result = await checker.checkForUpdate();
  assert.deepEqual(requests, [RELEASES_API_URL, RELEASES_API_URL.replace('&page=1', '&page=2')]);
  assert.equal(result.latestVersion, '1.0.10');
  assert.equal(result.currentVersion, '1.0.4');
  assert.equal(
    result.releaseNotes,
    'Toque com facilidade.\nVeja seus controles.\nOrganize seus faders.',
  );
  assert.equal(result.downloadUrl, 'https://github.com/a/latest.dmg');
});

test('uses the injected desktop version and excludes installed highlights', async () => {
  const checker = createUpdateChecker({
    packageJsonPath: fixturePackage,
    currentVersion: '1.0.8',
    fetchImpl: async () =>
      response([
        { tag_name: 'v1.0.8', body: '### Destaques para você\n- Já instalada' },
        { tag_name: 'v1.0.9', body: '### Correções & Arquitetura\n- Interno' },
        { tag_name: 'v1.0.10', body: '### Correções & Arquitetura\n- Interno também' },
      ]),
  });
  const result = await checker.checkForUpdate();
  assert.equal(result.currentVersion, '1.0.8');
  assert.equal(result.latestVersion, '1.0.10');
  assert.equal(result.updateAvailable, true);
  assert.equal(result.releaseNotes, '');
});

test('continues past a full page even without a Link header', async () => {
  const requests = [];
  const checker = makeChecker({
    fetchImpl: async (url) => {
      requests.push(url);
      return response(
        requests.length === 1
          ? Array.from({ length: 100 }, () => ({ tag_name: 'invalid' }))
          : [{ tag_name: 'v1.0.5', body: '### Destaques para você\n- Novidade' }],
      );
    },
  });
  const result = await checker.checkForUpdate();
  assert.equal(requests.length, 2);
  assert.equal(result.releaseNotes, 'Novidade');
});

test('keeps all eligible highlights beyond the old per-release length limit', async () => {
  const items = Array.from({ length: 60 }, (_, index) => `Novidade ${index} para os músicos.`);
  const result = await makeChecker({
    release: { body: `### Destaques para você\n${items.map((item) => `- ${item}`).join('\n')}` },
  }).checkForUpdate();
  assert.deepEqual(result.releaseNotes.split('\n'), items);
});

test('does not return incomplete results if a later page fails', async () => {
  const checker = makeChecker({
    fetchImpl: async (url) =>
      url.endsWith('page=1')
        ? {
            ...response([{ tag_name: 'v1.0.6' }]),
            headers: { get: () => '<https://api.github.com/next>; rel="next"' },
          }
        : { ok: false, status: 503 },
  });
  const result = await checker.checkForUpdate();
  assert.equal(result.updateAvailable, false);
  assert.equal(result.latestVersion, null);
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

test('fails safely when GitHub is offline or the request times out', async () => {
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
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    const timeoutResult = await timeoutChecker.checkForUpdate();
    assert.equal(timeoutResult.updateAvailable, false);
    assert.equal(timeoutResult.downloadUrl, null);
  } finally {
    clearTimeout(keepAlive);
  }
});
