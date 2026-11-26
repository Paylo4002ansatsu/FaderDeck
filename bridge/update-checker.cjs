'use strict';

const fs = require('node:fs');
const path = require('node:path');

const RELEASES_API_URL = 'https://api.github.com/repos/Paylo4002ansatsu/FaderDeck/releases/latest';
const RELEASE_PAGE_URL = 'https://github.com/Paylo4002ansatsu/FaderDeck/releases/latest';
const DEFAULT_TIMEOUT_MS = 4000;
const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;

function parseVersion(value) {
  if (typeof value !== 'string') return null;
  const match = value
    .trim()
    .replace(/^v/i, '')
    .match(
      /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/,
    );
  if (!match) return null;
  const prerelease = match[4] ? match[4].split('.') : [];
  if (prerelease.some((part) => /^\d+$/.test(part) && part.length > 1 && part.startsWith('0'))) {
    return null;
  }
  return {
    major: BigInt(match[1]),
    minor: BigInt(match[2]),
    patch: BigInt(match[3]),
    prerelease,
  };
}

function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return null;

  for (const component of ['major', 'minor', 'patch']) {
    if (a[component] !== b[component]) return a[component] > b[component] ? 1 : -1;
  }

  if (a.prerelease.length === 0 && b.prerelease.length === 0) return 0;
  if (a.prerelease.length === 0) return 1;
  if (b.prerelease.length === 0) return -1;

  const sharedLength = Math.min(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const leftPart = a.prerelease[index];
    const rightPart = b.prerelease[index];
    if (leftPart === rightPart) continue;
    const leftNumeric = /^\d+$/.test(leftPart);
    const rightNumeric = /^\d+$/.test(rightPart);
    if (leftNumeric && rightNumeric) {
      const leftNumber = BigInt(leftPart);
      const rightNumber = BigInt(rightPart);
      if (leftNumber !== rightNumber) return leftNumber > rightNumber ? 1 : -1;
      continue;
    }
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftPart > rightPart ? 1 : -1;
  }
  if (a.prerelease.length === b.prerelease.length) return 0;
  return a.prerelease.length > b.prerelease.length ? 1 : -1;
}

function safeHttpsUrl(value, fallback = null) {
  if (typeof value !== 'string') return fallback;
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      !['github.com', 'objects.githubusercontent.com'].includes(url.hostname)
    ) {
      return fallback;
    }
    return url.toString();
  } catch {
    return fallback;
  }
}

function selectDownloadUrl(assets, platform, releaseUrl) {
  if (!Array.isArray(assets)) return releaseUrl;

  const extensions =
    platform === 'darwin' ? ['.dmg', '.zip'] : platform === 'win32' ? ['.exe'] : [];
  for (const extension of extensions) {
    const asset = assets.find(
      (candidate) =>
        typeof candidate?.name === 'string' &&
        candidate.name.toLowerCase().endsWith(extension) &&
        safeHttpsUrl(candidate.browser_download_url),
    );
    if (asset) return safeHttpsUrl(asset.browser_download_url, releaseUrl);
  }
  return releaseUrl;
}

function offlineStatus(currentVersion) {
  return {
    currentVersion,
    latestVersion: null,
    updateAvailable: false,
    mandatory: false,
    releaseNotes: '',
    downloadUrl: null,
    releaseUrl: null,
  };
}

function createUpdateChecker({
  packageJsonPath = path.join(__dirname, '..', 'package.json'),
  platform = process.platform,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  cacheTtlMs = DEFAULT_CACHE_TTL_MS,
  now = Date.now,
} = {}) {
  let currentVersion = '0.0.0';
  try {
    currentVersion = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')).version;
    if (!parseVersion(currentVersion)) currentVersion = '0.0.0';
  } catch {
    currentVersion = '0.0.0';
  }

  let cachedStatus = null;
  let cachedAt = 0;
  let pendingCheck = null;

  async function checkForUpdate() {
    if (typeof fetchImpl !== 'function') return offlineStatus(currentVersion);
    if (cachedStatus && now() - cachedAt < cacheTtlMs) return cachedStatus;
    if (pendingCheck) return pendingCheck;

    pendingCheck = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      timeout.unref?.();

      try {
        const response = await fetchImpl(RELEASES_API_URL, {
          headers: {
            Accept: 'application/vnd.github+json',
            'User-Agent': 'FaderDeck-Update-Checker',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          signal: controller.signal,
        });
        if (!response.ok) return offlineStatus(currentVersion);

        const release = await response.json();
        const latestVersion =
          typeof release?.tag_name === 'string' ? release.tag_name.replace(/^v/i, '') : null;
        const comparison = compareVersions(latestVersion, currentVersion);
        if (comparison === null) return offlineStatus(currentVersion);

        const releaseUrl = safeHttpsUrl(release.html_url, RELEASE_PAGE_URL);
        const releaseNotes = [release.name, release.body]
          .filter((part) => typeof part === 'string' && part.trim())
          .join('\n\n')
          .replace(/\[(?:REQUIRED|OBRIGATORIA)\]/gi, '')
          .trim()
          .slice(0, 8000);
        const mandatory = /\[(?:REQUIRED|OBRIGATORIA)\]/i.test(
          `${release.name || ''}\n${release.body || ''}`,
        );
        const updateAvailable = comparison > 0;

        return {
          currentVersion,
          latestVersion,
          updateAvailable,
          mandatory: updateAvailable && mandatory,
          releaseNotes,
          downloadUrl: updateAvailable
            ? selectDownloadUrl(release.assets, platform, releaseUrl)
            : null,
          releaseUrl,
        };
      } catch {
        return offlineStatus(currentVersion);
      } finally {
        clearTimeout(timeout);
        pendingCheck = null;
      }
    })();

    const result = await pendingCheck;
    cachedStatus = result;
    cachedAt = now();
    return result;
  }

  return { checkForUpdate, currentVersion };
}

module.exports = {
  compareVersions,
  createUpdateChecker,
  parseVersion,
  selectDownloadUrl,
};
