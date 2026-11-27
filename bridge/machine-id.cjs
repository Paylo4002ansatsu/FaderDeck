'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

function readSystemIdentifier(platform) {
  if (platform === 'darwin') {
    const output = execFileSync('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    });
    const identifier = output.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/)?.[1];
    if (identifier) return identifier;
  } else if (platform === 'win32') {
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
  } else if (platform === 'linux') {
    for (const filePath of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
      try {
        const identifier = fs.readFileSync(filePath, 'utf8').trim();
        if (identifier) return identifier;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
  }
  throw new Error(`Operating system identifier unavailable: ${platform}`);
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

function fallbackIdentifier() {
  const addresses = Object.values(os.networkInterfaces())
    .flat()
    .filter((entry) => entry && !entry.internal && entry.mac && entry.mac !== '00:00:00:00:00:00')
    .map((entry) => entry.mac.toLowerCase())
    .sort();
  const identifier = addresses[0] || os.hostname().trim();
  if (!identifier) throw new Error('No fallback machine identifier is available.');
  return identifier;
}

function getDeviceHash({
  platform = process.platform,
  identifierProvider = readSystemIdentifier,
  fallbackProvider = fallbackIdentifier,
} = {}) {
  let identifier;
  try {
    identifier = identifierProvider(platform);
  } catch (error) {
    console.warn(
      'Não foi possível ler o identificador do sistema; usando alternativa:',
      error.message,
    );
    identifier = fallbackProvider();
  }
  return generateDeviceHash({ platform, machineIdentifier: identifier });
}

function getMachineName() {
  return os.hostname();
}

module.exports = { generateDeviceHash, getDeviceHash, getMachineName };
