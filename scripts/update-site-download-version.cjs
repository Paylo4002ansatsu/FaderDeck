'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPOSITORY = 'Paylo4002ansatsu/FaderDeck';
const WINDOWS_ASSET = 'FaderDeck-Windows-Setup.exe';
const RELEASE_TAG_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function validateReleaseTag(tag) {
  if (typeof tag !== 'string' || !RELEASE_TAG_PATTERN.test(tag)) {
    throw new Error('Informe uma tag numérica no formato 1.2.3, sem prefixo v.');
  }
  return tag;
}

function replaceExactlyOne(content, pattern, replacement, fileName, description) {
  const matches = [...content.matchAll(pattern)];
  if (matches.length !== 1) {
    throw new Error(`${fileName}: esperado um único ${description}, encontrados ${matches.length}.`);
  }
  return content.replace(pattern, replacement);
}

function updateSiteDownloadVersion(docsDirectory, tag) {
  const version = validateReleaseTag(tag);
  const windowsUrl = `https://github.com/${REPOSITORY}/releases/download/${version}/${WINDOWS_ASSET}`;
  const files = {
    html: path.join(docsDirectory, 'index.html'),
    script: path.join(docsDirectory, 'app.js'),
    readme: path.join(docsDirectory, 'README.md'),
  };

  const original = Object.fromEntries(
    Object.entries(files).map(([key, filePath]) => [key, fs.readFileSync(filePath, 'utf8')]),
  );

  const updated = {
    html: replaceExactlyOne(
      original.html,
      /https:\/\/github\.com\/Paylo4002ansatsu\/FaderDeck\/releases\/download\/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\/FaderDeck-Windows-Setup\.exe/g,
      windowsUrl,
      'docs/index.html',
      'link Windows',
    ),
    script: replaceExactlyOne(
      original.script,
      /https:\/\/github\.com\/Paylo4002ansatsu\/FaderDeck\/releases\/download\/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\/FaderDeck-Windows-Setup\.exe/g,
      windowsUrl,
      'docs/app.js',
      'link Windows',
    ),
    readme: replaceExactlyOne(
      original.readme,
      /https:\/\/github\.com\/Paylo4002ansatsu\/FaderDeck\/releases\/download\/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\/FaderDeck-Windows-Setup\.exe/g,
      windowsUrl,
      'docs/README.md',
      'link Windows documentado',
    ),
  };

  updated.html = replaceExactlyOne(
    updated.html,
    /Windows Setup · \d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/g,
    `Windows Setup · ${version}`,
    'docs/index.html',
    'rótulo de versão',
  );

  for (const [key, filePath] of Object.entries(files)) {
    if (updated[key] !== original[key]) fs.writeFileSync(filePath, updated[key], 'utf8');
  }

  return { version, windowsUrl, changed: Object.keys(files).filter((key) => updated[key] !== original[key]) };
}

function main() {
  const tag = process.argv[2];
  const result = updateSiteDownloadVersion(path.resolve(__dirname, '..', 'docs'), tag);
  if (result.changed.length === 0) {
    console.log(`Os links do site já apontam para ${result.version}: ${result.windowsUrl}`);
    return;
  }
  console.log(`Link Windows atualizado para ${result.version}: ${result.windowsUrl}`);
  console.log(`Arquivos atualizados: ${result.changed.map((key) => `${key}`).join(', ')}`);
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
