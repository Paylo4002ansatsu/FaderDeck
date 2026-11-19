'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const workflow = fs.readFileSync(path.join(root, '.github/workflows/build-windows.yml'), 'utf8');
const bridgePackager = fs.readFileSync(path.join(root, 'scripts/package-bridge.py'), 'utf8');

test('Electron and standalone bridge packages include extracted server modules', () => {
  assert.ok(packageJson.build.files.includes('bridge/**/*'));
  for (const moduleName of [
    'midi-manager.cjs',
    'auth.cjs',
    'websocket-handler.cjs',
    'layout-persistence.cjs',
    'websocket-gateway.cjs',
    'http-router.cjs',
    'token-store.cjs',
    'network-addresses.cjs',
  ]) {
    assert.ok(
      bridgePackager.includes(`"${moduleName}"`),
      `${moduleName} is packaged for standalone bridge`,
    );
  }
});

test('universal macOS merge recognizes shared x64 and ARM64 MIDI prebuilds', () => {
  assert.equal(
    packageJson.build.mac.x64ArchFiles,
    'Contents/Resources/app.asar.unpacked/node_modules/@julusian/midi/prebuilds/midi-darwin-*/**',
  );
});

test('Monterey compatibility pins Electron 43 and defines an Intel build', () => {
  assert.match(packageJson.devDependencies.electron, /^43\.\d+\.\d+$/);
  assert.equal(packageJson.build.mac.minimumSystemVersion, '12.0.0');
  assert.match(packageJson.scripts['dist:mac:monterey'], /--x64/);
  assert.match(packageJson.scripts['dist:mac:monterey'], /--publish never/);
});

test('Windows and macOS artifacts use distinct names suitable for one release', () => {
  assert.equal(packageJson.build.win.artifactName, 'FaderDeck-Windows-Setup.exe');
  assert.equal(packageJson.build.mac.artifactName, 'FaderDeck-Mac.${ext}');
  assert.notEqual(packageJson.build.win.artifactName, packageJson.build.mac.artifactName);
});

test('tagged release publishes both platforms before updating site links', () => {
  assert.match(workflow, /release_tag:/);
  assert.match(workflow, /artifact_run_id:/);
  assert.match(workflow, /RELEASE_TAG: \$\{\{ inputs\.release_tag \|\| github\.ref_name \}\}/);
  assert.match(workflow, /does not match package\.json version/);
  assert.match(workflow, /runner: windows-latest/);
  assert.match(workflow, /runner: macos-latest/);
  const releaseJob = workflow.split('publish-release:')[1]?.split('update-site-download:')[0];
  assert.ok(releaseJob, 'publish-release job exists');
  assert.match(releaseJob, /needs: build/);
  assert.match(releaseJob, /always\(\)/);
  assert.match(releaseJob, /actions: read/);
  assert.match(releaseJob, /run-id: \$\{\{ inputs\.artifact_run_id \|\| github\.run_id \}\}/);
  assert.match(releaseJob, /find release-assets -mindepth 2/);
  assert.match(releaseJob, /release-assets\/\*\.exe/);
  assert.match(releaseJob, /release-assets\/\*\.dmg/);
  assert.match(releaseJob, /release-assets\/\*\.zip/);
  const siteJob = workflow.split('update-site-download:')[1];
  assert.ok(siteJob, 'update-site-download job exists');
  assert.match(siteJob, /needs: publish-release/);
  assert.match(siteJob, /update:site-download-version/);
});
