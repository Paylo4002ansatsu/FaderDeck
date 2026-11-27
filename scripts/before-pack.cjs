'use strict';

const fs = require('node:fs');
const path = require('node:path');
const obfuscator = require('javascript-obfuscator');
const { prepareBuild } = require('./prepare-build.cjs');

module.exports = async function beforePack() {
  prepareBuild();
  const root = path.join(__dirname, '..');
  const target = path.join(root, '.faderdeck-build', 'bridge');
  fs.mkdirSync(target, { recursive: true });
  for (const name of ['supabase-client.cjs', 'http-router.cjs', 'machine-id.cjs']) {
    const source = fs.readFileSync(path.join(root, 'bridge', name), 'utf8');
    const result = obfuscator.obfuscate(source, {
      compact: true,
      target: 'node',
      seed: 1,
      identifierNamesGenerator: 'hexadecimal',
      renameGlobals: false,
    });
    fs.writeFileSync(path.join(target, name), result.getObfuscatedCode());
  }
};
