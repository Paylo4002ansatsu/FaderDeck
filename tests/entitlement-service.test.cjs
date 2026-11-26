'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createEntitlementService,
  generateDeviceHash,
  getDeviceHash,
} = require('../bridge/entitlement-service.cjs');
const { getSupabaseClient, isSupabaseConfigured } = require('../bridge/supabase-client.cjs');

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

function validEntitlement(overrides = {}) {
  const serverTime = '2026-11-26T12:00:00.000Z';
  return {
    allowed: true,
    kind: 'trial',
    expires_at: new Date(Date.parse(serverTime) + 7 * DAY_IN_MILLISECONDS).toISOString(),
    server_time: serverTime,
    offline_grace_until: new Date(Date.parse(serverTime) + DAY_IN_MILLISECONDS).toISOString(),
    ...overrides,
  };
}

test('denies access when there is no authenticated session', async () => {
  let validationCalls = 0;
  const service = createEntitlementService({
    getSession: async () => null,
    validateLicense: async () => {
      validationCalls += 1;
      return validEntitlement();
    },
    getDeviceHash: () => 'device-hash',
  });

  const entitlement = await service.getEntitlement();

  assert.equal(entitlement.allowed, false);
  assert.equal(validationCalls, 0);
});

test('accepts a valid server entitlement and sends the local device hash', async () => {
  let requestBody;
  const service = createEntitlementService({
    getSession: async () => ({
      access_token: 'test-token',
      user: { id: 'test-user' },
    }),
    validateLicense: async (body) => {
      requestBody = body;
      return validEntitlement({ kind: 'license' });
    },
    getDeviceHash: () => 'stable-device-hash',
    monotonicNow: () => 1000,
  });

  const entitlement = await service.getEntitlement();

  assert.equal(entitlement.allowed, true);
  assert.equal(entitlement.kind, 'license');
  assert.equal(requestBody.device_hash, 'stable-device-hash');
});

test('allows offline use within the grace window and denies it after the window', async () => {
  let connected = true;
  let monotonicTime = 5000;
  const service = createEntitlementService({
    getSession: async () => ({
      access_token: 'test-token',
      user: { id: 'test-user' },
    }),
    validateLicense: async () => {
      if (!connected) {
        const error = new Error('network unavailable');
        error.name = 'FunctionsFetchError';
        throw error;
      }
      return validEntitlement();
    },
    getDeviceHash: () => 'stable-device-hash',
    monotonicNow: () => monotonicTime,
  });

  assert.equal((await service.getEntitlement()).allowed, true);

  connected = false;
  monotonicTime += DAY_IN_MILLISECONDS - 1000;
  assert.equal((await service.getEntitlement()).allowed, true);

  monotonicTime += 2000;
  assert.equal((await service.getEntitlement()).allowed, false);
});

test('does not use offline grace when the server rejects validation', async () => {
  let serverRejects = false;
  const service = createEntitlementService({
    getSession: async () => ({
      access_token: 'test-token',
      user: { id: 'test-user' },
    }),
    validateLicense: async () => {
      if (serverRejects) {
        const error = new Error('function returned an HTTP error');
        error.name = 'FunctionsHttpError';
        throw error;
      }
      return validEntitlement();
    },
    getDeviceHash: () => 'stable-device-hash',
    monotonicNow: () => 1000,
  });

  assert.equal((await service.getEntitlement()).allowed, true);
  serverRejects = true;
  assert.equal((await service.getEntitlement()).allowed, false);
});

test('denies offline use after the entitlement expires even if grace remains', async () => {
  let connected = true;
  let monotonicTime = 5000;
  const service = createEntitlementService({
    getSession: async () => ({
      access_token: 'test-token',
      user: { id: 'test-user' },
    }),
    validateLicense: async () => {
      if (!connected) {
        const error = new Error('network unavailable');
        error.name = 'FunctionsFetchError';
        throw error;
      }
      const base = validEntitlement({ kind: 'license' });
      return {
        ...base,
        expires_at: new Date(Date.parse(base.server_time) + 12 * 60 * 60 * 1000).toISOString(),
      };
    },
    getDeviceHash: () => 'stable-device-hash',
    monotonicNow: () => monotonicTime,
  });

  assert.equal((await service.getEntitlement()).allowed, true);

  connected = false;
  monotonicTime += 13 * 60 * 60 * 1000;
  assert.equal((await service.getEntitlement()).allowed, false);
});

test('device hash is stable for the same operating system identifier', () => {
  const identifierProvider = () => 'stable-machine-id';
  const firstHash = getDeviceHash({ platform: 'linux', identifierProvider });
  const secondHash = getDeviceHash({ platform: 'linux', identifierProvider });

  assert.equal(firstHash, secondHash);
  assert.match(firstHash, /^[a-f0-9]{64}$/);
  assert.notEqual(
    firstHash,
    generateDeviceHash({ platform: 'linux', machineIdentifier: 'different-machine-id' }),
  );
});

test('Supabase client stays uninitialized when local credentials are absent', () => {
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_PUBLISHABLE_KEY;

  try {
    assert.equal(isSupabaseConfigured(), false);
    assert.equal(getSupabaseClient(), null);
    assert.equal(
      isSupabaseConfigured({
        SUPABASE_URL: 'https://project.example',
        SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
      }),
      true,
    );
  } finally {
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = originalKey;
  }
});
