'use strict';

const crypto = require('node:crypto');
const { URL } = require('node:url');

function safeEqual(candidate, expected) {
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function isLoopbackHost(hostname) {
  const normalized = hostname.replace(/^::ffff:/, '');
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1' || normalized === '[::1]';
}

function isLoopbackRequest(request) {
  const address = request.socket.remoteAddress || '';
  return address === '127.0.0.1' || address === '::1' || address.startsWith('::ffff:127.0.0.1');
}

function isSameOriginLocalAdminRequest(request, port) {
  const hostHeader = request.headers.host;
  const originHeader = request.headers.origin;
  if (typeof hostHeader !== 'string' || typeof originHeader !== 'string') return false;
  const protocol = request.socket.encrypted ? 'https:' : 'http:';
  try {
    const hostUrl = new URL(`${protocol}//${hostHeader}`);
    const originUrl = new URL(originHeader);
    const effectivePort = Number(hostUrl.port || (protocol === 'https:' ? 443 : 80));
    return hostUrl.origin === originUrl.origin
      && isLoopbackHost(hostUrl.hostname)
      && isLoopbackHost(originUrl.hostname)
      && effectivePort === port;
  } catch {
    return false;
  }
}

function hasLocalHostHeader(request, port) {
  try {
    const hostUrl = new URL(`http://${request.headers.host || ''}`);
    return isLoopbackHost(hostUrl.hostname) && Number(hostUrl.port || 80) === port;
  } catch { return false; }
}

module.exports = { safeEqual, isLoopbackHost, isLoopbackRequest, isSameOriginLocalAdminRequest, hasLocalHostHeader };
