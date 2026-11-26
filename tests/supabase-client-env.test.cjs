'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { loadPublicSupabaseEnv } = require('../bridge/supabase-client.cjs');

test('loads only public Supabase settings from .env and preserves existing environment values', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'faderdeck-env-test-'));
  const envFilePath = path.join(directory, '.env');
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(
    envFilePath,
    [
      'SUPABASE_URL="https://project.example"',
      'SUPABASE_PUBLISHABLE_KEY=publishable-from-file # inline comment',
      'SUPABASE_SECRET_KEY=must-not-be-loaded',
    ].join('\n'),
  );

  const env = {
    SUPABASE_URL: 'https://existing.example',
    SUPABASE_SECRET_KEY: 'keep-existing-secret',
  };
  const loadedKeys = loadPublicSupabaseEnv({ env, envFilePath });

  assert.deepEqual(loadedKeys, ['SUPABASE_PUBLISHABLE_KEY']);
  assert.equal(env.SUPABASE_URL, 'https://existing.example');
  assert.equal(env.SUPABASE_PUBLISHABLE_KEY, 'publishable-from-file');
  assert.equal(env.SUPABASE_SECRET_KEY, 'keep-existing-secret');

  const cleanEnv = {};
  loadPublicSupabaseEnv({ env: cleanEnv, envFilePath });
  assert.equal(Object.hasOwn(cleanEnv, 'SUPABASE_SECRET_KEY'), false);
});
