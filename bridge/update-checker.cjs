'use strict';

const fs = require('node:fs');
const path = require('node:path');

const RELEASES_API_URL = 'https://api.github.com/repos/Paylo4002ansatsu/FaderDeck/releases';
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

function versionSection(changelog, version) {
  const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const heading = new RegExp(
    `^##\\s+(?:\\[v?${escapedVersion}\\]|v?${escapedVersion})(?:\\s|$)`,
    'i',
  );
  const lines = changelog.split(/\r?\n/);
  const start = lines.findIndex((line) => heading.test(line));
  if (start < 0) return '';
  let end = start + 1;
  while (end < lines.length && !/^##\s/.test(lines[end])) end += 1;
  return lines.slice(start, end).join('\n').trim();
}

function userFacingNotes(body, version) {
  if (typeof body !== 'string') return '';
  if (/^##\s+(?:\[v?\d+\.\d+\.\d+[^]]*\]|v?\d+\.\d+\.\d+(?:[-+][\w.-]+)?)(?:\s|$)/im.test(body)) {
    body = versionSection(body, version);
  }
  const lines = body.split(/\r?\n/);
  let inFence = false;
  let inHighlights = false;
  const items = [];
  for (const line of lines) {
    if (/^ {0,3}(?:`{3,}|~{3,})/.test(line)) {
      if (inHighlights) break;
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (!inHighlights) {
      inHighlights = /^ {0,3}###\s+Destaques para você\s*#*\s*$/i.test(line);
      continue;
    }
    if (!line.trim()) continue;
    const match = line.match(/^ {0,3}(?:[-+*]|\d+[.)])\s+(.+)$/);
    if (!match) break;
    const item = match[1]
      .replace(/!?\[([^\]]*)\]\([^)]+\)/g, '$1')
      .replace(/<[^>]*>/g, '')
      .replace(/[*_`~]/g, '')
      .trim();
    if (!item || /https?:\/\/|www\.|full changelog/i.test(item)) continue;
    items.push(item);
  }
  return items.join('\n');
}

function createUpdateChecker({
  packageJsonPath = path.join(__dirname, '..', 'package.json'),
  currentVersion: installedVersion,
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
  if (installedVersion !== undefined) {
    if (!parseVersion(installedVersion)) throw new TypeError('Versão instalada inválida.');
    currentVersion = installedVersion;
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
        const releases = [];
        let page = 1;
        let hasNext;
        do {
          const response = await fetchImpl(`${RELEASES_API_URL}?per_page=100&page=${page}`, {
            headers: {
              Accept: 'application/vnd.github+json',
              'User-Agent': 'FaderDeck-Update-Checker',
              'X-GitHub-Api-Version': '2022-11-28',
            },
            signal: controller.signal,
          });
          if (!response.ok) throw new Error(`GitHub respondeu HTTP ${response.status}.`);
          const results = await response.json();
          if (!Array.isArray(results)) throw new TypeError('Lista de releases inválida.');
          releases.push(...results);
          const link = response.headers?.get('link');
          hasNext = link ? /\brel\s*=\s*"next"/i.test(link) : results.length === 100;
          page += 1;
        } while (hasNext);

        const published = releases
          .filter((release) => {
            const version = parseVersion(release?.tag_name);
            return (
              release?.draft !== true &&
              release?.prerelease !== true &&
              version?.prerelease.length === 0
            );
          })
          .sort((a, b) => compareVersions(b.tag_name, a.tag_name));
        if (published.length === 0) return offlineStatus(currentVersion);

        const release = published[0];
        const latestVersion = release.tag_name.replace(/^v/i, '');
        const pending = published.filter(
          (item) => compareVersions(item.tag_name, currentVersion) > 0,
        );
        const releaseNotes = [
          ...new Set(
            pending.flatMap((item) =>
              userFacingNotes(item.body, item.tag_name.replace(/^v/i, ''))
                .split('\n')
                .filter(Boolean),
            ),
          ),
        ].join('\n');

        const releaseUrl = safeHttpsUrl(release.html_url, RELEASE_PAGE_URL);
        const mandatory = /\[(?:REQUIRED|OBRIGATORIA)\]/i.test(
          `${release.name || ''}\n${release.body || ''}`,
        );
        const updateAvailable = pending.length > 0;

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
      } catch (error) {
        console.warn('Não foi possível consultar as releases:', error);
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
  versionSection,
};
