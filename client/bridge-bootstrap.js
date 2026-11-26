'use strict';

const fragment = new URLSearchParams(window.location.hash.slice(1));
const bridgeToken = fragment.get('bridgeToken');
if (bridgeToken) {
  const query = new URLSearchParams(window.location.search);
  if (!query.has('bridgeToken')) query.set('bridgeToken', bridgeToken);
  window.history.replaceState(null, '', `${window.location.pathname}?${query.toString()}`);
}
