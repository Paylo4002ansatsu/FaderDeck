'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPOSITORY = 'Paylo4002ansatsu/FaderDeck';
const WINDOWS_ASSET = 'FaderDeck-Windows-Setup.exe';
const MACOS_ASSET = 'FaderDeck-Mac.dmg';
const MONTEREY_ASSET = 'FaderDeck-Mac-Monterey-Intel.dmg';
const RELEASE_TAG_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const WINDOWS_URL_PATTERN =
  /https:\/\/github\.com\/Paylo4002ansatsu\/FaderDeck\/releases\/download\/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\/FaderDeck-Windows-Setup\.exe/g;
const MACOS_URL_PATTERN =
  /https:\/\/github\.com\/Paylo4002ansatsu\/FaderDeck\/releases\/(?:latest\/download|download\/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\/FaderDeck-Mac\.dmg/g;
const MONTEREY_URL_PATTERN =
  /https:\/\/github\.com\/Paylo4002ansatsu\/FaderDeck\/releases\/(?:latest\/download|download\/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\/FaderDeck-Mac-Monterey-Intel\.dmg/g;

function validateReleaseTag(tag) {
  if (typeof tag !== 'string' || !RELEASE_TAG_PATTERN.test(tag)) {
    throw new Error('Informe uma tag numérica no formato 1.2.3, sem prefixo v.');
  }
  return tag;
}

function replaceExpectedCount(content, pattern, replacement, expectedCount, fileName, description) {
  const matches = [...content.matchAll(pattern)];
  if (matches.length !== expectedCount) {
    throw new Error(
      `${fileName}: esperados ${expectedCount} ${description}, encontrados ${matches.length}.`,
    );
  }
  return content.replace(pattern, replacement);
}

function updateSiteDownloadVersion(docsDirectory, tag) {
  const version = validateReleaseTag(tag);
  const downloads = {
    windowsUrl: `https://github.com/${REPOSITORY}/releases/download/${version}/${WINDOWS_ASSET}`,
    macosUrl: `https://github.com/${REPOSITORY}/releases/download/${version}/${MACOS_ASSET}`,
    montereyUrl: `https://github.com/${REPOSITORY}/releases/download/${version}/${MONTEREY_ASSET}`,
  };
  const files = {
    html: path.join(docsDirectory, 'index.html'),
    script: path.join(docsDirectory, 'app.js'),
    readme: path.join(docsDirectory, 'README.md'),
  };
  const original = Object.fromEntries(
    Object.entries(files).map(([key, filePath]) => [key, fs.readFileSync(filePath, 'utf8')]),
  );

  const expectedLinks = { html: 1, script: 1, readme: 0 };
  const updated = {};
  for (const key of Object.keys(files)) {
    updated[key] = replaceExpectedCount(
      original[key],
      WINDOWS_URL_PATTERN,
      downloads.windowsUrl,
      expectedLinks[key],
      `docs/${path.basename(files[key])}`,
      'link Windows',
    );
    updated[key] = replaceExpectedCount(
      updated[key],
      MACOS_URL_PATTERN,
      downloads.macosUrl,
      expectedLinks[key],
      `docs/${path.basename(files[key])}`,
      'link(s) macOS',
    );
    updated[key] = replaceExpectedCount(
      updated[key],
      MONTEREY_URL_PATTERN,
      downloads.montereyUrl,
      expectedLinks[key],
      `docs/${path.basename(files[key])}`,
      'link(s) macOS Monterey',
    );
  }

  updated.html = replaceExpectedCount(
    updated.html,
    /Windows · 64-bit · \d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/g,
    `Windows · 64-bit · ${version}`,
    1,
    'docs/index.html',
    'rótulo de versão Windows 64-bit',
  );

  updated.html = updated.html.replace(
    /Mac Intel · \d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)? · DMG/g,
    `Mac Intel · ${version} · DMG`,
  );
  updated.readme = updated.readme.replace(
    /Os links atuais permanecem fixos em `\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?`/g,
    `Os links atuais permanecem fixos em \`${version}\``,
  );

  for (const [key, filePath] of Object.entries(files)) {
    if (updated[key] !== original[key]) fs.writeFileSync(filePath, updated[key], 'utf8');
  }

  return {
    version,
    ...downloads,
    changed: Object.keys(files).filter((key) => updated[key] !== original[key]),
  };
}

function main() {
  const tag = process.argv[2];
  const result = updateSiteDownloadVersion(path.resolve(__dirname, '..', 'docs'), tag);
  if (result.changed.length === 0) {
    console.log(`Os dois instaladores do site já apontam para ${result.version}.`);
    return;
  }
  console.log(`Downloads Windows/macOS atualizados para a release ${result.version}.`);
  console.log(`Windows: ${result.windowsUrl}`);
  console.log(`macOS: ${result.macosUrl}`);
  console.log(
    `Arquivos atualizados: ${result.changed.map((key) => `docs/${key === 'script' ? 'app.js' : key === 'html' ? 'index.html' : 'README.md'}`).join(', ')}`,
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { updateSiteDownloadVersion, validateReleaseTag };
