'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { FuseV1Options } = require('@electron/fuses');
const afterPack = require('../scripts/after-pack.cjs');

const root = path.join(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const workflow = fs.readFileSync(path.join(root, '.github/workflows/build-windows.yml'), 'utf8');
const bridgePackager = fs.readFileSync(path.join(root, 'scripts/package-bridge.py'), 'utf8');

test('build configuration requires public Supabase credentials and rejects secret keys', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'faderdeck-build-config-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.mkdirSync(path.join(directory, 'scripts'));
  fs.mkdirSync(path.join(directory, 'bridge'));
  fs.copyFileSync(
    path.join(root, 'scripts/prepare-build.cjs'),
    path.join(directory, 'scripts/prepare-build.cjs'),
  );
  fs.writeFileSync(
    path.join(directory, 'bridge/supabase-client.cjs'),
    'exports.loadPublicSupabaseEnv = () => [];\n',
  );
  const env = { ...process.env };
  delete env.SUPABASE_URL;
  delete env.SUPABASE_ANON_KEY;
  delete env.SUPABASE_PUBLISHABLE_KEY;
  const run = (extraEnv) =>
    spawnSync(process.execPath, [path.join(directory, 'scripts/prepare-build.cjs')], {
      env: { ...env, ...extraEnv },
      encoding: 'utf8',
    });
  assert.notEqual(run({}).status, 0);
  assert.notEqual(
    run({ SUPABASE_URL: 'https://example.invalid', SUPABASE_ANON_KEY: 'sb_secret_forbidden' })
      .status,
    0,
  );
  assert.equal(
    run({ SUPABASE_URL: 'https://example.invalid', SUPABASE_ANON_KEY: 'sb_publishable_test' })
      .status,
    0,
  );
  const config = require(path.join(directory, 'bridge/runtime-config.generated.cjs'));
  assert.deepEqual(config, { url: 'https://example.invalid', anonKey: 'sb_publishable_test' });
});

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

test('fuses are applied after universal slices have been merged', async () => {
  const calls = [];
  const packager = { addElectronFuses: async (context, config) => calls.push({ context, config }) };
  await afterPack({
    packager,
    electronPlatformName: 'darwin',
    appOutDir: '/output/mac-universal-arm64-temp',
  });
  assert.equal(calls.length, 0);
  await afterPack({ packager, electronPlatformName: 'darwin', appOutDir: '/output/mac-universal' });
  assert.equal(calls.length, 1);
  const config = calls[0].config;
  assert.equal(config[FuseV1Options.OnlyLoadAppFromAsar], true);
  assert.equal(config[FuseV1Options.EnableEmbeddedAsarIntegrityValidation], true);
  assert.equal(config[FuseV1Options.RunAsNode], false);
  assert.equal(config[FuseV1Options.EnableNodeCliInspectArguments], false);
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
  assert.match(workflow, /platform: macOS Monterey Intel/);
  assert.match(workflow, /--config\.electronVersion=43\.8\.12/);
  assert.match(workflow, /--config\.mac\.minimumSystemVersion=12\.0\.0/);
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
  assert.match(releaseJob, /test -s release-assets\/FaderDeck-Mac-Monterey-Intel\.dmg/);
  const siteJob = workflow.split('update-site-download:')[1];
  assert.ok(siteJob, 'update-site-download job exists');
  assert.match(siteJob, /needs: publish-release/);
  assert.match(siteJob, /update:site-download-version/);
});
