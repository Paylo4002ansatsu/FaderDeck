'use strict';

function isTrustedPanelUrl(value, port) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) return false;
  try {
    const target = new URL(value);
    return (
      target.protocol === 'http:' &&
      target.hostname === '127.0.0.1' &&
      target.port === String(port) &&
      target.username === '' &&
      target.password === ''
    );
  } catch {
    return false;
  }
}

function safeExternalUrl(value) {
  try {
    const target = new URL(value);
    if (target.protocol !== 'https:' && target.protocol !== 'http:') return null;
    return target.href;
  } catch {
    return null;
  }
}

module.exports = { isTrustedPanelUrl, safeExternalUrl };
