'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { prepareReleaseNotes, versionSection } = require('../scripts/prepare-release-notes.cjs');

const changelog = [
  '# Histórico',
  '## [1.0.8] - data',
  '### Correções & Arquitetura',
  '- Interno',
  '## 1.0.7',
  '### Destaques para você',
  '- Melhoria',
  '### Correções & Arquitetura',
  '- Técnico',
  '## 1.0.6',
  '- Antigo',
].join('\n');

function prepare(version, fetchImpl) {
  return prepareReleaseNotes({
    changelog,
    version,
    repository: 'owner/repo',
    token: 'test-token',
    apiUrl: 'https://api.example.test',
    fetchImpl,
  });
}

test('selects only the section for the exact tagged version', () => {
  assert.equal(
    versionSection(changelog, '1.0.7'),
    '## 1.0.7\n### Destaques para você\n- Melhoria\n### Correções & Arquitetura\n- Técnico',
  );
  assert.match(versionSection(changelog, '1.0.8'), /^## \[1\.0\.8\]/);
  assert.equal(versionSection(changelog, '1.0.70'), '');
});

test('prepares new releases and preserves existing release notes without duplication', async () => {
  const section = versionSection(changelog, '1.0.7');
  const created = await prepare('1.0.7', async (url, options) => {
    assert.equal(url, 'https://api.example.test/repos/owner/repo/releases/tags/1.0.7');
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    return { status: 404 };
  });
  assert.equal(created, section);
  const existing = await prepare('1.0.7', async () => ({
    ok: true,
    json: async () => ({ body: 'Notas já publicadas.' }),
  }));
  assert.equal(existing, `${section}\n\nNotas já publicadas.`);
  const repeated = await prepare('1.0.7', async () => ({
    ok: true,
    json: async () => ({ body: existing }),
  }));
  assert.equal(repeated, existing);
  await assert.rejects(
    prepare('1.0.9', () => assert.fail('não deve consultar a API')),
    /não contém a versão 1\.0\.9/,
  );
});

test('reports GitHub errors instead of replacing existing notes', async () => {
  await assert.rejects(
    prepare('1.0.7', async () => ({ status: 500, ok: false })),
    /HTTP 500/,
  );
});
