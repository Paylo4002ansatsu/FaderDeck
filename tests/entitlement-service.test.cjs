'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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
    getMachineName: () => 'Test computer',
    monotonicNow: () => 1000,
  });

  const entitlement = await service.getEntitlement();

  assert.equal(entitlement.allowed, true);
  assert.equal(entitlement.kind, 'license');
  assert.equal(requestBody.device_hash, 'stable-device-hash');
  assert.equal(requestBody.device_label, 'Test computer');
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
  assert.equal(service.getCachedEntitlement().allowed, false);
});

test('preserves a device limit response for the account interface', async () => {
  const devices = [{ machineId: 'a'.repeat(64), name: 'Computador', last_seen_at: null }];
  const service = createEntitlementService({
    getSession: async () => ({ access_token: 'token', user: { id: 'user' } }),
    validateLicense: async () =>
      validEntitlement({
        allowed: false,
        kind: 'license',
        offline_grace_until: null,
        code: 'DEVICE_LIMIT_REACHED',
        message: 'Limite de dispositivos atingido.',
        plan_code: 'solo_30',
        max_devices: 1,
        devices,
      }),
    getDeviceHash: () => 'stable-device-hash',
    monotonicNow: () => 1000,
  });
  const entitlement = await service.getEntitlement();
  assert.equal(entitlement.code, 'DEVICE_LIMIT_REACHED');
  assert.equal(entitlement.plan_code, 'solo_30');
  assert.deepEqual(entitlement.devices, devices);
  assert.equal(service.getCachedEntitlement().allowed, false);
});

test('accepts a 72-hour grace period and expires it at the exact limit', async () => {
  let connected = true;
  let monotonicTime = 5000;
  const service = createEntitlementService({
    getSession: async () => ({ access_token: 'token', user: { id: 'user' } }),
    validateLicense: async () => {
      if (!connected) {
        const error = new Error('network unavailable');
        error.name = 'FunctionsFetchError';
        throw error;
      }
      const entitlement = validEntitlement();
      entitlement.offline_grace_until = new Date(
        Date.parse(entitlement.server_time) + 3 * DAY_IN_MILLISECONDS,
      ).toISOString();
      return entitlement;
    },
    getDeviceHash: () => 'stable-device-hash',
    monotonicNow: () => monotonicTime,
  });

  assert.equal((await service.getEntitlement()).allowed, true);
  connected = false;
  monotonicTime += 3 * DAY_IN_MILLISECONDS - 1;
  assert.equal((await service.getEntitlement()).allowed, true);
  monotonicTime += 1;
  assert.equal((await service.getEntitlement()).allowed, false);
});

test('rejects a server grace period longer than 72 hours', async () => {
  const entitlement = validEntitlement();
  entitlement.offline_grace_until = new Date(
    Date.parse(entitlement.server_time) + 3 * DAY_IN_MILLISECONDS + 1,
  ).toISOString();
  const service = createEntitlementService({
    getSession: async () => ({ access_token: 'token', user: { id: 'user' } }),
    validateLicense: async () => entitlement,
    getDeviceHash: () => 'stable-device-hash',
    monotonicNow: () => 1000,
  });
  assert.equal((await service.getEntitlement()).allowed, false);
});

test('does not restore access if validation finishes after the cache is cleared', async () => {
  let finishValidation;
  const pending = new Promise((resolve) => {
    finishValidation = resolve;
  });
  const service = createEntitlementService({
    getSession: async () => ({ access_token: 'token', user: { id: 'user' } }),
    validateLicense: () => pending,
    getDeviceHash: () => 'stable-device-hash',
    monotonicNow: () => 1000,
  });
  const validation = service.getEntitlement();
  await Promise.resolve();
  service.clearCache();
  finishValidation(validEntitlement());
  assert.equal((await validation).allowed, false);
  assert.equal(service.getCachedEntitlement().allowed, false);
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

test('restores offline access after a restart and revokes it on server denial', async () => {
  const saved = new Map();
  const storage = {
    getItem: async (key) => saved.get(key) ?? null,
    setItem: async (key, value) => saved.set(key, value),
    removeItem: async (key) => saved.delete(key),
  };
  let wallTime = 1000000;
  let offline = false;
  let revoked = false;
  const options = {
    storage,
    wallNow: () => wallTime,
    monotonicNow: () => 1000,
    getSession: async () => {
      if (offline) {
        const error = new Error('offline');
        error.name = 'AuthRetryableFetchError';
        throw error;
      }
      return { access_token: 'token', user: { id: 'user', email: 'user@example.com' } };
    },
    validateLicense: async () =>
      validEntitlement(
        revoked
          ? { allowed: false, kind: 'license', offline_grace_until: null }
          : { kind: 'license', expires_at: null },
      ),
    getDeviceHash: () => 'a'.repeat(64),
    getMachineName: () => 'Computer',
  };
  const first = createEntitlementService(options);
  assert.equal((await first.getEntitlement()).allowed, true);
  offline = true;
  wallTime += 60 * 60 * 1000;
  const restarted = createEntitlementService(options);
  assert.equal((await restarted.getEntitlement()).allowed, true);
  assert.equal(restarted.getOfflineSession().user.id, 'user');
  offline = false;
  revoked = true;
  assert.equal((await restarted.getEntitlement()).allowed, false);
  assert.equal(saved.size, 0);
  offline = true;
  assert.equal((await createEntitlementService(options).getEntitlement()).allowed, false);
});

test('offline cache rejects a different computer, clock rollback and expired grace', async () => {
  const saved = new Map();
  const storage = {
    getItem: async (key) => saved.get(key) ?? null,
    setItem: async (key, value) => saved.set(key, value),
    removeItem: async (key) => saved.delete(key),
  };
  let wallTime = 1000000;
  let offline = false;
  let machine = 'a'.repeat(64);
  const options = {
    storage,
    wallNow: () => wallTime,
    monotonicNow: () => 1000,
    getSession: async () => {
      if (offline) {
        const error = new Error('offline');
        error.name = 'AuthRetryableFetchError';
        throw error;
      }
      return { access_token: 'token', user: { id: 'user' } };
    },
    validateLicense: async () => validEntitlement({ kind: 'license', expires_at: null }),
    getDeviceHash: () => machine,
    getMachineName: () => 'Computer',
  };
  assert.equal((await createEntitlementService(options).getEntitlement()).allowed, true);
  offline = true;
  machine = 'b'.repeat(64);
  assert.equal((await createEntitlementService(options).getEntitlement()).allowed, false);
  machine = 'a'.repeat(64);
  wallTime -= 1;
  assert.equal((await createEntitlementService(options).getEntitlement()).allowed, false);
  wallTime += DAY_IN_MILLISECONDS + 1;
  assert.equal((await createEntitlementService(options).getEntitlement()).allowed, false);
});

test('a different account cannot inherit an offline entitlement', async () => {
  const saved = new Map();
  const storage = {
    getItem: async (key) => saved.get(key) ?? null,
    setItem: async (key, value) => saved.set(key, value),
    removeItem: async (key) => saved.delete(key),
  };
  let userId = 'first-user';
  let offline = false;
  const service = createEntitlementService({
    storage,
    wallNow: () => 1000000,
    monotonicNow: () => 1000,
    getSession: async () => ({ access_token: 'token', user: { id: userId } }),
    validateLicense: async () => {
      if (offline) {
        const error = new Error('offline');
        error.name = 'FunctionsFetchError';
        throw error;
      }
      return validEntitlement();
    },
    getDeviceHash: () => 'a'.repeat(64),
    getMachineName: () => 'Computer',
  });
  assert.equal((await service.getEntitlement()).allowed, true);
  userId = 'second-user';
  offline = true;
  assert.equal((await service.getEntitlement()).allowed, false);
  assert.equal(service.getOfflineSession(), null);
  assert.equal(saved.size, 0);
});

test('persisted offline grace expires at 72 hours after restart', async () => {
  const saved = new Map();
  const storage = {
    getItem: async (key) => saved.get(key) ?? null,
    setItem: async (key, value) => saved.set(key, value),
    removeItem: async (key) => saved.delete(key),
  };
  let wallTime = 1000000;
  let offline = false;
  const options = {
    storage,
    wallNow: () => wallTime,
    monotonicNow: () => 1000,
    getSession: async () => {
      if (offline) {
        const error = new Error('offline');
        error.name = 'AuthRetryableFetchError';
        throw error;
      }
      return { access_token: 'token', user: { id: 'user' } };
    },
    validateLicense: async () =>
      validEntitlement({
        kind: 'license',
        expires_at: null,
        offline_grace_until: '2026-11-29T12:00:00.000Z',
      }),
    getDeviceHash: () => 'a'.repeat(64),
    getMachineName: () => 'Computer',
  };
  assert.equal((await createEntitlementService(options).getEntitlement()).allowed, true);
  offline = true;
  wallTime += 3 * DAY_IN_MILLISECONDS - 1;
  assert.equal((await createEntitlementService(options).getEntitlement()).allowed, true);
  wallTime += 1;
  assert.equal((await createEntitlementService(options).getEntitlement()).allowed, false);
});

test('trial and explicit reactivation use the local device identity', async () => {
  const requests = [];
  const service = createEntitlementService({
    getSession: async () => ({ access_token: 'token', user: { id: 'user' } }),
    startTrial: async (body) => requests.push(body),
    validateLicense: async (body) => {
      requests.push(body);
      return validEntitlement();
    },
    getDeviceHash: () => 'a'.repeat(64),
    getMachineName: () => 'Computer',
    monotonicNow: () => 1000,
  });
  await service.startTrial();
  await service.reactivateDevice();
  assert.equal(requests[0].device_hash, 'a'.repeat(64));
  assert.equal(requests[1].device_hash, 'a'.repeat(64));
  assert.equal(requests[1].reactivate, true);
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

test('uses the fallback identifier when the operating system identifier fails', () => {
  const hash = getDeviceHash({
    platform: 'linux',
    identifierProvider: () => {
      throw new Error('unavailable');
    },
    fallbackProvider: () => 'stable-fallback',
  });
  assert.equal(
    hash,
    generateDeviceHash({ platform: 'linux', machineIdentifier: 'stable-fallback' }),
  );
});

test('Supabase client stays uninitialized when local credentials are absent', () => {
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_PUBLISHABLE_KEY;

  try {
    assert.equal(isSupabaseConfigured({}), false);
    if (!fs.existsSync(path.join(__dirname, '../bridge/runtime-config.generated.cjs'))) {
      assert.equal(isSupabaseConfigured(), false);
      assert.equal(getSupabaseClient(), null);
    }
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
