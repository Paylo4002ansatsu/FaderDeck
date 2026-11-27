'use strict';

const { generateDeviceHash, getDeviceHash, getMachineName } = require('./machine-id.cjs');
const { getCurrentSession, invokeEdgeFunction } = require('./supabase-client.cjs');

const GRACE_IN_MILLISECONDS = 72 * 60 * 60 * 1000;

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
    if (current.name === 'FunctionsFetchError' || networkErrorCodes.has(current.code)) {
      return true;
    }
    current = current.cause;
  }

  return false;
}

function createEntitlementService({
  getSession = getCurrentSession,
  validateLicense = (body) => invokeEdgeFunction('license-validate', body),
  getDeviceHash: resolveDeviceHash = getDeviceHash,
  getMachineName: resolveMachineName = getMachineName,
  monotonicNow = () => Number(process.hrtime.bigint()) / 1e6,
} = {}) {
  let cached = null;
  let deviceHash;
  let deviceLabel;
  let validationSequence = 0;

  function resolveOfflineEntitlement(userId) {
    if (!cached || cached.userId !== userId) return deniedEntitlement('offline_unavailable');
    if (!cached.entitlement.allowed) return cached.entitlement;

    let elapsed;
    try {
      elapsed = monotonicNow() - cached.requestStartedAt;
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

  async function getEntitlement() {
    const sequence = ++validationSequence;
    let session;
    try {
      session = await getSession();
    } catch {
      if (sequence === validationSequence) cached = null;
      return deniedEntitlement('session_unavailable');
    }
    if (sequence !== validationSequence) return deniedEntitlement('validation_superseded');

    const userId = session?.user?.id;
    if (!session?.access_token || typeof userId !== 'string' || !userId) {
      cached = null;
      return deniedEntitlement('not_authenticated');
    }

    let requestStartedAt;
    try {
      requestStartedAt = monotonicNow();
      deviceHash ??= resolveDeviceHash();
      deviceLabel ??= resolveMachineName();
    } catch {
      cached = null;
      return deniedEntitlement('device_identity_unavailable');
    }

    let response;
    try {
      response = await validateLicense({
        device_hash: deviceHash,
        ...(deviceLabel ? { device_label: deviceLabel } : {}),
        offline_grace_hours: 72,
      });
    } catch (error) {
      if (sequence !== validationSequence) return deniedEntitlement('validation_superseded');
      if (isNetworkFailure(error)) return resolveOfflineEntitlement(userId);
      cached = null;
      return deniedEntitlement('server_validation_failed');
    }

    if (sequence !== validationSequence) return deniedEntitlement('validation_superseded');
    const entitlement = normalizeEntitlement(response);
    if (!entitlement) {
      cached = null;
      return deniedEntitlement('invalid_server_response');
    }

    cached = {
      userId,
      entitlement,
      requestStartedAt,
      serverTime: Date.parse(entitlement.server_time),
      graceUntil:
        entitlement.offline_grace_until === null
          ? null
          : Date.parse(entitlement.offline_grace_until),
      expiresAt: entitlement.expires_at === null ? null : Date.parse(entitlement.expires_at),
    };

    return resolveOfflineEntitlement(userId);
  }

  function clearCache() {
    validationSequence += 1;
    cached = null;
  }

  function getCachedEntitlement() {
    if (!cached) return deniedEntitlement('offline_unavailable');
    return resolveOfflineEntitlement(cached.userId);
  }

  return { clearCache, getCachedEntitlement, getEntitlement };
}

module.exports = {
  createEntitlementService,
  generateDeviceHash,
  getDeviceHash,
};
