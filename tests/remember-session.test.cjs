'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  configureAuthStorage,
  getSupabaseClient,
  signInWithEmailAndPassword,
} = require('../bridge/supabase-client.cjs');

test('remember choice controls whether the auth session is saved to secure storage', async () => {
  process.env.SUPABASE_URL = 'https://example.invalid';
  process.env.SUPABASE_ANON_KEY = 'test-key';
  const saved = new Map();
  configureAuthStorage({
    getItem: async (key) => saved.get(key) ?? null,
    setItem: async (key, value) => saved.set(key, value),
    removeItem: async (key) => saved.delete(key),
  });
  const auth = getSupabaseClient().auth;
  await auth.initializePromise;
  auth.signInWithPassword = async () => ({ data: {}, error: null });
  await signInWithEmailAndPassword('user@example.invalid', 'password', false);
  await auth.storage.setItem(auth.storageKey, 'temporary-session');
  assert.equal(saved.has(auth.storageKey), false);
  assert.equal(await auth.storage.getItem(auth.storageKey), 'temporary-session');
  await signInWithEmailAndPassword('user@example.invalid', 'password', true);
  await auth.storage.setItem(auth.storageKey, 'remembered-session');
  assert.equal(saved.get(auth.storageKey), 'remembered-session');
});
