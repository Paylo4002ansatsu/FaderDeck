'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { versionSection } = require('../bridge/update-checker.cjs');

async function prepareReleaseNotes({ changelog, version, repository, token, apiUrl, fetchImpl }) {
  const section = versionSection(changelog, version);
  if (!section) throw new Error(`O CHANGELOG.md não contém a versão ${version}.`);
  const response = await fetchImpl(
    `${apiUrl}/repos/${repository}/releases/tags/${encodeURIComponent(version)}`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  );
  if (response.status === 404) return section;
  if (!response.ok)
    throw new Error(`Não foi possível consultar a release: HTTP ${response.status}`);
  const release = await response.json();
  const existing = typeof release.body === 'string' ? release.body : '';
  if (versionSection(existing, version)) return existing;
  return [section, existing].filter(Boolean).join('\n\n');
}

async function main() {
  const taggedChangelog = process.env.RELEASE_CHANGELOG;
  const changelogPath = fs.existsSync(taggedChangelog) ? taggedChangelog : 'CHANGELOG.md';
  const body = await prepareReleaseNotes({
    changelog: fs.readFileSync(changelogPath, 'utf8'),
    version: process.env.RELEASE_TAG,
    repository: process.env.GITHUB_REPOSITORY,
    token: process.env.GITHUB_TOKEN,
    apiUrl: process.env.GITHUB_API_URL,
    fetchImpl: fetch,
  });
  const output = path.join(process.env.RUNNER_TEMP, 'faderdeck-release-notes.md');
  fs.writeFileSync(output, body);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `body_path=${output}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Não foi possível preparar as notas da release:', error);
    process.exitCode = 1;
  });
}

module.exports = { prepareReleaseNotes, versionSection };
