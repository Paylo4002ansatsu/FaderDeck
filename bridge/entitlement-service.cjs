'use strict';

const { generateDeviceHash, getDeviceHash, getMachineName } = require('./machine-id.cjs');
const { getCurrentSession, invokeEdgeFunction } = require('./supabase-client.cjs');

const GRACE_IN_MILLISECONDS = 72 * 60 * 60 * 1000;
const OFFLINE_CACHE_KEY = 'faderdeck-offline-entitlement-v1';

function deniedEntitlement(reason) {
  return {
    allowed: false,
    kind: 'none',
    expires_at: null,
    server_time: null,
    offline_grace_until: null,
    ...(reason ? { reason } : {}),
  };
}

function normalizeEntitlement(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (typeof value.allowed !== 'boolean') return null;
  if (!['license', 'trial', 'none'].includes(value.kind)) return null;
  if (typeof value.server_time !== 'string' || !Number.isFinite(Date.parse(value.server_time))) {
    return null;
  }
  if (
    value.expires_at !== null &&
    (typeof value.expires_at !== 'string' || !Number.isFinite(Date.parse(value.expires_at)))
  ) {
    return null;
  }
  if (
    value.offline_grace_until !== null &&
    (typeof value.offline_grace_until !== 'string' ||
      !Number.isFinite(Date.parse(value.offline_grace_until)))
  ) {
    return null;
  }

  const serverTime = Date.parse(value.server_time);
  const graceUntil =
    value.offline_grace_until === null ? null : Date.parse(value.offline_grace_until);
  if (
    value.allowed &&
    (value.kind === 'none' ||
      graceUntil === null ||
      graceUntil <= serverTime ||
      graceUntil > serverTime + GRACE_IN_MILLISECONDS)
  ) {
    return null;
  }

  return {
    allowed: value.allowed,
    kind: value.kind,
    expires_at: value.expires_at,
    server_time: value.server_time,
    offline_grace_until: value.offline_grace_until,
    ...(typeof value.plan_code === 'string' ? { plan_code: value.plan_code } : {}),
    ...(Number.isInteger(value.max_devices) ? { max_devices: value.max_devices } : {}),
    ...(typeof value.code === 'string' ? { code: value.code } : {}),
    ...(typeof value.message === 'string' ? { message: value.message } : {}),
    ...(Array.isArray(value.devices)
      ? {
          devices: value.devices.filter(
            (device) =>
              device &&
              typeof device === 'object' &&
              typeof device.machineId === 'string' &&
              /^[0-9a-f]{64}$/.test(device.machineId) &&
              (device.name === null || typeof device.name === 'string'),
          ),
        }
      : {}),
  };
}

function isNetworkFailure(error) {
  const networkErrorCodes = new Set([
    'ECONNABORTED',
    'ECONNREFUSED',
    'ECONNRESET',
    'EHOSTUNREACH',
    'ENETDOWN',
    'ENETUNREACH',
    'ENOTFOUND',
    'ETIMEDOUT',
  ]);
  let current = error;

  while (current && typeof current === 'object') {
    if (
      current.name === 'FunctionsFetchError' ||
      current.name === 'AuthRetryableFetchError' ||
      networkErrorCodes.has(current.code)
    ) {
      return true;
    }
    current = current.cause;
  }

  return false;
}

function createEntitlementService({
  getSession = getCurrentSession,
  validateLicense = (body) => invokeEdgeFunction('license-validate', body),
  startTrial = (body) => invokeEdgeFunction('trial-start', body),
  getDeviceHash: resolveDeviceHash = getDeviceHash,
  getMachineName: resolveMachineName = getMachineName,
  monotonicNow = () => Number(process.hrtime.bigint()) / 1e6,
  wallNow = Date.now,
  storage,
} = {}) {
  let cached = null;
  let deviceHash;
  let deviceLabel;
  let validationSequence = 0;

  async function restoreOfflineCache(expectedUserId) {
    if (cached) return;
    if (!storage) return;
    let snapshot;
    try {
      const saved = await storage.getItem(OFFLINE_CACHE_KEY);
      if (!saved) return;
      snapshot = JSON.parse(saved);
      if (expectedUserId && snapshot.userId !== expectedUserId) {
        await storage.removeItem(OFFLINE_CACHE_KEY);
        return;
      }
      const entitlement = normalizeEntitlement(snapshot.entitlement);
      const now = wallNow();
      const elapsed = now - snapshot.requestStartedWall;
      if (
        !entitlement?.allowed ||
        typeof snapshot.userId !== 'string' ||
        !snapshot.userId ||
        snapshot.deviceHash !== resolveDeviceHash() ||
        !Number.isFinite(elapsed) ||
        elapsed < 0 ||
        elapsed >= GRACE_IN_MILLISECONDS
      ) {
        return;
      }
      cached = {
        userId: snapshot.userId,
        email: typeof snapshot.email === 'string' ? snapshot.email : null,
        entitlement,
        requestStartedAt: monotonicNow() - elapsed,
        requestStartedWall: snapshot.requestStartedWall,
        serverTime: Date.parse(entitlement.server_time),
        graceUntil: Date.parse(entitlement.offline_grace_until),
        expiresAt: entitlement.expires_at === null ? null : Date.parse(entitlement.expires_at),
      };
    } catch (error) {
      console.error('Não foi possível restaurar o acesso offline:', error.message);
    }
  }

  function resolveOfflineEntitlement(userId) {
    if (!cached || cached.userId !== userId) return deniedEntitlement('offline_unavailable');
    if (!cached.entitlement.allowed) return cached.entitlement;

    let elapsed;
    try {
      const monotonicElapsed = monotonicNow() - cached.requestStartedAt;
      const wallElapsed = wallNow() - cached.requestStartedWall;
      if (monotonicElapsed < 0 || wallElapsed < 0)
        return deniedEntitlement('offline_clock_invalid');
      elapsed = Math.max(monotonicElapsed, wallElapsed);
    } catch {
      return deniedEntitlement('offline_clock_unavailable');
    }

    if (!Number.isFinite(elapsed) || elapsed < 0) {
      return deniedEntitlement('offline_clock_invalid');
    }

    const estimatedServerTime = cached.serverTime + elapsed;
    const expired =
      estimatedServerTime >= cached.graceUntil ||
      (cached.expiresAt !== null && estimatedServerTime >= cached.expiresAt);
    return expired ? { ...cached.entitlement, allowed: false } : cached.entitlement;
  }

  function getDeviceDetails() {
    deviceHash ??= resolveDeviceHash();
    deviceLabel ??= resolveMachineName();
    return {
      device_hash: deviceHash,
      ...(deviceLabel ? { device_label: deviceLabel } : {}),
    };
  }

  async function getEntitlement({ reactivate = false } = {}) {
    const sequence = ++validationSequence;
    let session;
    try {
      session = await getSession();
    } catch (error) {
      if (sequence !== validationSequence) return deniedEntitlement('validation_superseded');
      if (isNetworkFailure(error) && !reactivate) {
        await restoreOfflineCache();
        if (sequence !== validationSequence) return deniedEntitlement('validation_superseded');
        return cached
          ? resolveOfflineEntitlement(cached.userId)
          : deniedEntitlement('offline_unavailable');
      }
      await clearCache();
      return deniedEntitlement('session_unavailable');
    }
    if (sequence !== validationSequence) return deniedEntitlement('validation_superseded');

    const userId = session?.user?.id;
    if (!session?.access_token || typeof userId !== 'string' || !userId) {
      await clearCache();
      return deniedEntitlement('not_authenticated');
    }
    if (cached && cached.userId !== userId) {
      cached = null;
      if (storage) await storage.removeItem(OFFLINE_CACHE_KEY);
      if (sequence !== validationSequence) return deniedEntitlement('validation_superseded');
    }

    let requestStartedAt;
    let requestStartedWall;
    try {
      requestStartedAt = monotonicNow();
      requestStartedWall = wallNow();
      getDeviceDetails();
    } catch {
      await clearCache();
      return deniedEntitlement('device_identity_unavailable');
    }

    let response;
    try {
      response = await validateLicense({
        ...getDeviceDetails(),
        offline_grace_hours: 72,
        ...(reactivate ? { reactivate: true } : {}),
      });
    } catch (error) {
      if (sequence !== validationSequence) return deniedEntitlement('validation_superseded');
      if (isNetworkFailure(error) && !reactivate) {
        await restoreOfflineCache(userId);
        if (sequence !== validationSequence) return deniedEntitlement('validation_superseded');
        return resolveOfflineEntitlement(userId);
      }
      await clearCache();
      return deniedEntitlement('server_validation_failed');
    }

    if (sequence !== validationSequence) return deniedEntitlement('validation_superseded');
    const entitlement = normalizeEntitlement(response);
    if (!entitlement) {
      await clearCache();
      return deniedEntitlement('invalid_server_response');
    }

    cached = {
      userId,
      email: typeof session.user.email === 'string' ? session.user.email : null,
      entitlement,
      requestStartedAt,
      requestStartedWall,
      serverTime: Date.parse(entitlement.server_time),
      graceUntil:
        entitlement.offline_grace_until === null
          ? null
          : Date.parse(entitlement.offline_grace_until),
      expiresAt: entitlement.expires_at === null ? null : Date.parse(entitlement.expires_at),
    };

    if (storage) {
      try {
        if (entitlement.allowed) {
          await storage.setItem(
            OFFLINE_CACHE_KEY,
            JSON.stringify({
              userId,
              email: cached.email,
              deviceHash,
              requestStartedWall,
              entitlement,
            }),
          );
        } else {
          await storage.removeItem(OFFLINE_CACHE_KEY);
        }
      } catch (error) {
        console.error('Não foi possível salvar o acesso offline:', error.message);
        await clearCache();
        return deniedEntitlement('offline_storage_failed');
      }
      if (sequence !== validationSequence) return deniedEntitlement('validation_superseded');
    }
    return resolveOfflineEntitlement(userId);
  }

  async function clearCache() {
    validationSequence += 1;
    cached = null;
    if (storage) await storage.removeItem(OFFLINE_CACHE_KEY);
  }

  function getCachedEntitlement() {
    if (!cached) return deniedEntitlement('offline_unavailable');
    return resolveOfflineEntitlement(cached.userId);
  }

  return {
    clearCache,
    getCachedEntitlement,
    getOfflineSession: () => {
      if (!cached || !resolveOfflineEntitlement(cached.userId).allowed) return null;
      return { user: { id: cached.userId, email: cached.email } };
    },
    getEntitlement,
    startTrial: () => startTrial(getDeviceDetails()),
    reactivateDevice: () => getEntitlement({ reactivate: true }),
  };
}

module.exports = {
  createEntitlementService,
  generateDeviceHash,
  getDeviceHash,
  isNetworkFailure,
};
