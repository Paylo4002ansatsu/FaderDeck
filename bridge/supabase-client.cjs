'use strict';

const { createClient } = require('@supabase/supabase-js');

const EDGE_FUNCTIONS = new Set(['trial-start', 'trial-status', 'license-validate']);
let client;
let clientUrl;
let clientKey;

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
  signInWithEmailAndPassword,
  signOut,
};
