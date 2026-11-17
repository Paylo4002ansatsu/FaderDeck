'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const workflow = fs.readFileSync(path.join(root, '.github/workflows/build-windows.yml'), 'utf8');

test('universal macOS merge recognizes shared x64 and ARM64 MIDI prebuilds', () => {
  assert.equal(
    packageJson.build.mac.x64ArchFiles,
    'Contents/Resources/app.asar.unpacked/node_modules/@julusian/midi/prebuilds/midi-darwin-*/**',
  );
});

test('Windows and macOS artifacts use distinct names suitable for one release', () => {
  assert.equal(packageJson.build.win.artifactName, 'FaderDeck-Windows-Setup.exe');
  assert.equal(packageJson.build.mac.artifactName, 'FaderDeck-Mac.${ext}');
  assert.notEqual(packageJson.build.win.artifactName, packageJson.build.mac.artifactName);
});

test('tagged release publishes both platforms before updating site links', () => {
  assert.match(workflow, /RELEASE_TAG: \$\{\{ github\.ref_name \}\}/);
  assert.match(workflow, /does not match package\.json version/);
  assert.match(workflow, /runner: windows-latest/);
  assert.match(workflow, /runner: macos-latest/);
  const releaseJob = workflow.split('publish-release:')[1]?.split('update-site-download:')[0];
  assert.ok(releaseJob, 'publish-release job exists');
  assert.match(releaseJob, /needs: build/);
  assert.match(releaseJob, /find release-assets -mindepth 2/);
  assert.match(releaseJob, /release-assets\/\*\.exe/);
  assert.match(releaseJob, /release-assets\/\*\.dmg/);
  assert.match(releaseJob, /release-assets\/\*\.zip/);
  const siteJob = workflow.split('update-site-download:')[1];
  assert.ok(siteJob, 'update-site-download job exists');
  assert.match(siteJob, /needs: publish-release/);
  assert.match(siteJob, /update:site-download-version/);
});
