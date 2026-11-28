'use strict';

window.__fdLayoutSignature = (pages, activePageId) =>
  JSON.stringify({
    activePageId,
    pages: pages.map((page) => ({
      ...page,
      controls: page.controls.map((control) =>
        Object.fromEntries(
          Object.entries(control).filter(([key]) => key !== 'value' && key !== 'active'),
        ),
      ),
    })),
  });

const fragment = new URLSearchParams(window.location.hash.slice(1));
const bridgeToken = fragment.get('bridgeToken');
if (bridgeToken) {
  const query = new URLSearchParams(window.location.search);
  query.set('bridgeToken', bridgeToken);
  window.history.replaceState(null, '', `${window.location.pathname}?${query.toString()}`);
}
