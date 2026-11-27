'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'docs/index.html'), 'utf8');
const authCallback = fs.readFileSync(path.join(root, 'docs/auth-callback.js'), 'utf8');
const envExample = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('website auth callback uses public Supabase configuration and handles both URL formats', () => {
  assert.equal(packageJson.dependencies['@supabase/supabase-js'] !== undefined, true);
  assert.match(envExample, /^VITE_SUPABASE_URL=$/m);
  assert.match(envExample, /^VITE_SUPABASE_PUBLISHABLE_KEY=$/m);
  assert.match(html, /type="module" src="\/auth-callback\.js"/);
  assert.match(authCallback, /window\.location\.search/);
  assert.match(authCallback, /window\.location\.hash/);
  assert.match(authCallback, /onAuthStateChange/);
  assert.match(authCallback, /PASSWORD_RECOVERY/);
  assert.match(authCallback, /history\.replaceState/);
});

test('website auth callback supports confirmation, recovery, password update and sign-out', () => {
  assert.match(authCallback, /callbackType === 'signup' \|\| callbackType === 'email'/);
  assert.match(authCallback, /callbackType === 'recovery'/);
  assert.match(authCallback, /auth\.updateUser\(\{\s+password:/);
  assert.match(authCallback, /auth\.signOut\(\)/);
  assert.match(authCallback, /Este link expirou ou é inválido\./);
  assert.match(html, /id="password-recovery-modal"/);
  assert.match(html, /minlength="8"/);
});
