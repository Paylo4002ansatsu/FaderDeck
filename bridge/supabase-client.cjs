'use strict';

const { createClient } = require('@supabase/supabase-js');
const fs = require('node:fs');
const path = require('node:path');

const EDGE_FUNCTIONS = new Set(['trial-start', 'trial-status', 'license-validate']);
const PUBLIC_ENV_KEYS = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY'];
const AUTH_REDIRECT_URL = 'https://fader-deck.vercel.app';
let client;
let clientUrl;
let clientKey;
let recoveryClient;
let recoveryVerified = false;

function parseEnvValue(rawValue) {
  const value = rawValue.trim();
  const quote = value[0];
  if ((quote === '"' || quote === "'" || quote === '`') && value.endsWith(quote)) {
    return value
      .slice(1, -1)
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\(["'`\\])/g, '$1');
  }
  return value.replace(/\s+#.*$/, '').trim();
}

function loadPublicSupabaseEnv({
  env = process.env,
  envFilePath = path.join(__dirname, '..', '.env'),
} = {}) {
  let contents;
  try {
    contents = fs.readFileSync(envFilePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  const values = new Map();
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(
      /^\s*(?:export\s+)?(SUPABASE_URL|SUPABASE_PUBLISHABLE_KEY)\s*=\s*(.*)$/,
    );
    if (match) values.set(match[1], parseEnvValue(match[2]));
  }

  const loadedKeys = [];
  for (const key of PUBLIC_ENV_KEYS) {
    if (env[key]?.trim()) continue;
    const value = values.get(key);
    if (!value) continue;
    env[key] = value;
    loadedKeys.push(key);
  }
  return loadedKeys;
}

loadPublicSupabaseEnv();

function isSupabaseConfigured(env = process.env) {
  return Boolean(env.SUPABASE_URL?.trim() && env.SUPABASE_PUBLISHABLE_KEY?.trim());
}

function createMemoryStorage() {
  const values = new Map();
  return {
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
    async removeItem(key) {
      values.delete(key);
    },
  };
}

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !key) return null;

  if (!client || url !== clientUrl || key !== clientKey) {
    client = createClient(url, key, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: false,
        persistSession: true,
        storage: createMemoryStorage(),
      },
    });
    clientUrl = url;
    clientKey = key;
  }

  return client;
}

function requireSupabaseClient() {
  const configuredClient = getSupabaseClient();
  if (!configuredClient) {
    throw new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.');
  }
  return configuredClient;
}

async function signInWithEmailAndPassword(email, password) {
  const { data, error } = await requireSupabaseClient().auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

async function signUpWithEmailAndPassword(email, password) {
  const { data, error } = await requireSupabaseClient().auth.signUp({
    email,
    password,
    options: { emailRedirectTo: AUTH_REDIRECT_URL },
  });
  if (error) throw error;
  return data;
}

async function resetPasswordForEmail(email) {
  const { data, error } = await requireSupabaseClient().auth.resetPasswordForEmail(email);
  if (error) throw error;
  return data;
}

async function verifyOtp({ email, token, type = 'recovery' }) {
  const configuredClient = requireSupabaseClient();
  recoveryVerified = false;
  recoveryClient = createClient(configuredClient.supabaseUrl, configuredClient.supabaseKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: true,
      storage: createMemoryStorage(),
    },
  });
  const { data, error } = await recoveryClient.auth.verifyOtp({
    email,
    token,
    type,
  });
  if (error) throw error;
  if (!data.session) throw new Error('A verificação não retornou uma sessão de recuperação.');
  recoveryVerified = true;
  return data;
}

async function updateUser({ password }) {
  if (!recoveryVerified || !recoveryClient) {
    throw new Error('Valide um código de recuperação antes de alterar a senha.');
  }
  const { data, error } = await recoveryClient.auth.updateUser({ password });
  if (error) throw error;
  return data;
}

async function signOutRecovery() {
  if (!recoveryClient) return;
  const currentClient = recoveryClient;
  recoveryVerified = false;
  recoveryClient = null;
  const { error } = await currentClient.auth.signOut({ scope: 'local' });
  if (error) throw error;
}

async function signOut() {
  const { error } = await requireSupabaseClient().auth.signOut({ scope: 'local' });
  if (error) throw error;
}

async function getCurrentSession() {
  const { data, error } = await requireSupabaseClient().auth.getSession();
  if (error) throw error;
  return data.session;
}

async function invokeEdgeFunction(name, body = {}) {
  if (!EDGE_FUNCTIONS.has(name)) {
    throw new TypeError(`Unsupported Supabase Edge Function: ${name}`);
  }

  const { data, error } = await requireSupabaseClient().functions.invoke(name, { body });
  if (error) throw error;
  return data;
}

module.exports = {
  getCurrentSession,
  getSupabaseClient,
  invokeEdgeFunction,
  isSupabaseConfigured,
  loadPublicSupabaseEnv,
  resetPasswordForEmail,
  signInWithEmailAndPassword,
  signUpWithEmailAndPassword,
  signOut,
  signOutRecovery,
  updateUser,
  verifyOtp,
};
