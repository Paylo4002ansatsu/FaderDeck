'use strict';

const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');

test('standalone bridge ZIP contains every modular server dependency and separate admin assets', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'faderdeck-bridge-package-'));
  const archivePath = path.join(directory, 'fader-bridge-test.zip');
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const build = spawnSync('python3', [path.join(root, 'scripts/package-bridge.py')], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, FADER_BRIDGE_OUTPUT: archivePath },
  });
  assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);
  assert.equal(fs.existsSync(archivePath), true);

  const verify = `import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); names=set(z.namelist()); required={"server.cjs","server-utils.cjs","bridge/midi-manager.cjs","bridge/auth.cjs","bridge/websocket-handler.cjs","bridge/layout-persistence.cjs","bridge/websocket-gateway.cjs","bridge/http-router.cjs","bridge/token-store.cjs","bridge/network-addresses.cjs","client/index.html","client/admin/index.html","client/admin/bridge.css","client/admin/bridge.js"}; missing=required-names; assert not missing, missing; assert z.testzip() is None`;
  execFileSync('python3', ['-c', verify, archivePath], { cwd: root, stdio: 'pipe' });
});
