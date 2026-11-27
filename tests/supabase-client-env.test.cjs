'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  getSupabaseClient,
  getCurrentSession,
  loadPublicSupabaseEnv,
  resetPasswordForEmail,
  signUpWithEmailAndPassword,
  signOutRecovery,
  updateUser,
  verifyOtp,
} = require('../bridge/supabase-client.cjs');

test('recovery session is isolated from the account session and required for password updates', async () => {
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const originalFetch = global.fetch;
  process.env.SUPABASE_URL = 'https://recovery.example';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'publishable-key';
  const calls = [];
  global.fetch = async (input, options) => {
    const url = new URL(input);
    calls.push({ path: url.pathname, method: options.method });
    const payload = url.pathname.endsWith('/verify')
      ? {
          access_token: 'recovery-token',
          refresh_token: 'recovery-refresh',
          expires_in: 3600,
          token_type: 'bearer',
          user: { id: 'recovery-user', email: 'person@example.com' },
        }
      : { id: 'recovery-user', email: 'person@example.com' };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    await assert.rejects(updateUser({ password: 'password123' }), /Valide um código/);
    await verifyOtp({ email: 'person@example.com', token: '123456' });
    assert.equal(await getCurrentSession(), null);
    await updateUser({ password: 'password123' });
    await signOutRecovery();
    await assert.rejects(updateUser({ password: 'password123' }), /Valide um código/);
    assert.deepEqual(calls, [
      { path: '/auth/v1/verify', method: 'POST' },
      { path: '/auth/v1/user', method: 'PUT' },
      { path: '/auth/v1/logout', method: 'POST' },
    ]);
  } finally {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = originalKey;
  }
});

test('signup and password reset call Supabase with the expected options', async () => {
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  process.env.SUPABASE_URL = 'https://project.example';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'publishable-key';

  const auth = getSupabaseClient().auth;
  const originalSignUp = auth.signUp;
  const originalResetPasswordForEmail = auth.resetPasswordForEmail;
  let signupCredentials;
  let resetArguments;
  auth.signUp = async (credentials) => {
    signupCredentials = credentials;
    return { data: { user: { email: credentials.email }, session: null }, error: null };
  };
  auth.resetPasswordForEmail = async (...args) => {
    resetArguments = args;
    return { data: {}, error: null };
  };

  try {
    const signup = await signUpWithEmailAndPassword('new@example.com', 'secure-password');
    await resetPasswordForEmail('new@example.com');

    assert.deepEqual(signupCredentials, {
      email: 'new@example.com',
      password: 'secure-password',
      options: { emailRedirectTo: 'https://fader-deck.vercel.app' },
    });
    assert.equal(signup.session, null);
    assert.deepEqual(resetArguments, ['new@example.com']);
  } finally {
    auth.signUp = originalSignUp;
    auth.resetPasswordForEmail = originalResetPasswordForEmail;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = originalKey;
  }
});

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
