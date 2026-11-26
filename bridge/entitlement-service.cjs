'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { getCurrentSession, invokeEdgeFunction } = require('./supabase-client.cjs');

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

function readSystemIdentifier(platform) {
  if (platform === 'darwin') {
    try {
      const output = execFileSync('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 5000,
      });
      const identifier = output.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/)?.[1];
      if (identifier) return identifier;
    } catch (error) {
      throw new Error('Unable to read the macOS machine identifier.', { cause: error });
    }
    throw new Error('The macOS machine identifier was not found.');
  }

  if (platform === 'win32') {
    try {
      const output = execFileSync(
        'reg.exe',
        ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'],
        {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
          timeout: 5000,
          windowsHide: true,
        },
      );
      const identifier = output.match(/MachineGuid\s+REG_SZ\s+(.+)/i)?.[1]?.trim();
      if (identifier) return identifier;
    } catch (error) {
      throw new Error('Unable to read the Windows machine identifier.', { cause: error });
    }
    throw new Error('The Windows machine identifier was not found.');
  }

  if (platform === 'linux') {
    for (const filePath of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
      try {
        const identifier = fs.readFileSync(filePath, 'utf8').trim();
        if (identifier) return identifier;
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw new Error('Unable to read the Linux machine identifier.', { cause: error });
        }
      }
    }
    throw new Error('The Linux machine identifier was not found.');
  }

  throw new Error(`Unsupported operating system for device identification: ${platform}`);
}

function generateDeviceHash({ platform = process.platform, machineIdentifier } = {}) {
  const identifier =
    typeof machineIdentifier === 'string' ? machineIdentifier.trim() : machineIdentifier;
  if (typeof identifier !== 'string' || !identifier) {
    throw new TypeError('A non-empty operating system identifier is required.');
  }

  return crypto
    .createHash('sha256')
    .update(`faderdeck-device-v1:${platform}:${identifier}`, 'utf8')
    .digest('hex');
}

function getDeviceHash({
  platform = process.platform,
  identifierProvider = readSystemIdentifier,
} = {}) {
  return generateDeviceHash({
    platform,
    machineIdentifier: identifierProvider(platform),
  });
}

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
      graceUntil > serverTime + DAY_IN_MILLISECONDS)
  ) {
    return null;
  }

  return {
    allowed: value.allowed,
    kind: value.kind,
    expires_at: value.expires_at,
    server_time: value.server_time,
    offline_grace_until: value.offline_grace_until,
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
  monotonicNow = () => Number(process.hrtime.bigint()) / 1e6,
} = {}) {
  let cached = null;
  let deviceHash;

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
    let session;
    try {
      session = await getSession();
    } catch {
      cached = null;
      return deniedEntitlement('session_unavailable');
    }

    const userId = session?.user?.id;
    if (!session?.access_token || typeof userId !== 'string' || !userId) {
      cached = null;
      return deniedEntitlement('not_authenticated');
    }

    let requestStartedAt;
    try {
      requestStartedAt = monotonicNow();
      deviceHash ??= resolveDeviceHash();
    } catch {
      return deniedEntitlement('device_identity_unavailable');
    }

    let response;
    try {
      response = await validateLicense({ device_hash: deviceHash });
    } catch (error) {
      return isNetworkFailure(error)
        ? resolveOfflineEntitlement(userId)
        : deniedEntitlement('server_validation_failed');
    }

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
