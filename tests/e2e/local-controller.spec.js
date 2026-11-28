'use strict';

/* global indexedDB, getComputedStyle */
const { test, expect, devices } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

let bridge;
let dataDirectory;

test.use({ ...devices['iPhone 13'], serviceWorkers: 'block' });

test.beforeAll(async () => {
  dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'faderdeck-lan-e2e-'));
  const previousDataDir = process.env.FADERDECK_DATA_DIR;
  const previousLanPort = process.env.FADER_BRIDGE_LAN_PORT;
  process.env.FADERDECK_DATA_DIR = dataDirectory;
  process.env.FADER_BRIDGE_LAN_PORT = '0';
  const originalLoad = Module._load;
  const midiStub = {
    Output: class {
      getPortCount() {
        return 0;
      }
      openVirtualPort() {}
      closePort() {}
    },
    Input: class {
      getPortCount() {
        return 0;
      }
      closePort() {}
    },
  };
  Module._load = function loadWithMidiStub(requested, parent, isMain) {
    if (requested === '@julusian/midi') return midiStub;
    return originalLoad.call(this, requested, parent, isMain);
  };
  try {
    bridge = require('../../server.cjs');
    await bridge.start(0);
  } finally {
    Module._load = originalLoad;
    if (previousDataDir === undefined) delete process.env.FADERDECK_DATA_DIR;
    else process.env.FADERDECK_DATA_DIR = previousDataDir;
    if (previousLanPort === undefined) delete process.env.FADER_BRIDGE_LAN_PORT;
    else process.env.FADER_BRIDGE_LAN_PORT = previousLanPort;
  }
});

test.afterAll(async () => {
  if (bridge) await bridge.shutdown();
  if (dataDirectory) fs.rmSync(dataDirectory, { recursive: true, force: true });
});

test('editor reorders a non-overlapping grid and stage keeps the saved order on desktop', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1400 },
    userAgent: 'Mozilla/5.0 Chrome/140.0.0.0 Electron/38.0.0',
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  await page.route('**/api/auth**', (route) => route.abort());
  await page.goto(`http://127.0.0.1:${bridge.server.address().port}/`);
  await expect(page.getByRole('slider', { name: 'Vocal' })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise((resolve, reject) => {
            const request = indexedDB.open('faderdeck-local', 1);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              const db = request.result;
              const read = db.transaction('workspace').objectStore('workspace').get('current');
              read.onsuccess = () => {
                db.close();
                resolve(Boolean(read.result));
              };
              read.onerror = () => reject(read.error);
            };
          }),
      ),
    )
    .toBe(true);
  await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('faderdeck-local', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction('workspace', 'readwrite');
          const store = transaction.objectStore('workspace');
          const read = store.get('current');
          read.onsuccess = () => {
            const state = read.result;
            for (const control of state.pages[0].controls) {
              control.gridX = 0;
              control.gridY = 0;
            }
            store.put(state, 'current');
          };
          transaction.oncomplete = () => {
            db.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      }),
  );
  await page.reload();
  await expect(page.getByRole('slider', { name: 'Vocal' })).toBeVisible();
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  const cards = page.locator('.panel-grid > .fader-card');
  await expect(cards).toHaveCount(8);

  const names = async (selector) =>
    page
      .locator(selector)
      .evaluateAll((elements) =>
        elements.map((element) => element.querySelector('.control-title').textContent.trim()),
      );
  const original = await names('.panel-grid > .fader-card');
  const first = cards.nth(0);
  const third = cards.nth(2);
  const sourceBox = await first.boundingBox();
  const targetBox = await third.boundingBox();
  const handleBox = await first.locator('.drag-handle').boundingBox();
  const startX = handleBox.x + handleBox.width / 2;
  const startY = handleBox.y + handleBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(
    startX + targetBox.x + targetBox.width / 2 - (sourceBox.x + sourceBox.width / 2),
    startY + targetBox.y + targetBox.height / 2 - (sourceBox.y + sourceBox.height / 2),
    { steps: 12 },
  );
  await expect(first).toHaveClass(/fd-grid-drag-placeholder/);
  await expect.poll(() => first.evaluate((element) => element.style.order)).toBe('2');
  await expect.poll(() => third.evaluate((element) => element.style.transition)).toContain('200ms');
  await page.mouse.up();
  const reordered = [original[1], original[2], original[0], ...original.slice(3)];
  await expect.poll(() => names('.panel-grid > .fader-card')).toEqual(reordered);

  await expect
    .poll(() =>
      cards.evaluateAll((elements) =>
        elements.every((element) => getComputedStyle(element).transform === 'none'),
      ),
    )
    .toBe(true);
  const rectangles = await cards.evaluateAll((elements) =>
    elements.map((element) => {
      const { left, right, top, bottom } = element.getBoundingClientRect();
      return { left, right, top, bottom };
    }),
  );
  for (let i = 0; i < rectangles.length; i += 1) {
    for (let j = i + 1; j < rectangles.length; j += 1) {
      const a = rectangles[i];
      const b = rectangles[j];
      expect(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top).toBe(
        true,
      );
    }
  }
  await page.getByRole('button', { name: 'Palco', exact: true }).click();
  await expect.poll(() => names('.stage-lane-fader')).toEqual(reordered);
  await expect(page.locator('.no-bridge-banner')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('slider', { name: 'Vocal' })).toBeVisible();
  await page.getByRole('button', { name: 'Palco', exact: true }).click();
  await expect.poll(() => names('.stage-lane-fader')).toEqual(reordered);
  await expect(page.locator('.no-bridge-banner')).toHaveCount(0);
  await page.getByRole('button', { name: 'Sair do modo Palco' }).click();
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  const returnSource = await cards.nth(0).boundingBox();
  const returnTarget = await cards.nth(2).boundingBox();
  const returnHandle = await cards.nth(0).locator('.drag-handle').boundingBox();
  const returnX = returnHandle.x + returnHandle.width / 2;
  const returnY = returnHandle.y + returnHandle.height / 2;
  await page.mouse.move(returnX, returnY);
  await page.mouse.down();
  await page.mouse.move(
    returnX + returnTarget.x + returnTarget.width / 2 - (returnSource.x + returnSource.width / 2),
    returnY + returnTarget.y + returnTarget.height / 2 - (returnSource.y + returnSource.height / 2),
    { steps: 12 },
  );
  await page.mouse.move(returnX, returnY, { steps: 12 });
  await page.mouse.up();
  await expect.poll(() => names('.panel-grid > .fader-card')).toEqual(reordered);
  await expect
    .poll(() =>
      cards.evaluateAll((elements) =>
        elements.every((element) => getComputedStyle(element).transform === 'none'),
      ),
    )
    .toBe(true);

  const cancelSource = await cards.nth(0).boundingBox();
  const cancelTarget = await cards.nth(2).boundingBox();
  const cancelHandle = await cards.nth(0).locator('.drag-handle').boundingBox();
  const cancelX = cancelHandle.x + cancelHandle.width / 2;
  const cancelY = cancelHandle.y + cancelHandle.height / 2;
  await page.mouse.move(cancelX, cancelY);
  await page.mouse.down();
  await page.mouse.move(
    cancelX + cancelTarget.x + cancelTarget.width / 2 - (cancelSource.x + cancelSource.width / 2),
    cancelY + cancelTarget.y + cancelTarget.height / 2 - (cancelSource.y + cancelSource.height / 2),
    { steps: 12 },
  );
  await expect(cards.nth(0)).toHaveClass(/fd-grid-drag-placeholder/);
  await page.locator('.panel-grid').dispatchEvent('pointercancel', { pointerId: 1 });
  await page.mouse.up();
  await expect(page.locator('.fd-grid-drag-ghost')).toHaveCount(0);
  await expect.poll(() => names('.panel-grid > .fader-card')).toEqual(reordered);
  await expect
    .poll(() =>
      cards.evaluateAll((elements) =>
        elements.every((element) => getComputedStyle(element).transform === 'none'),
      ),
    )
    .toBe(true);

  const rowSource = await cards.nth(0).boundingBox();
  const rowTarget = await cards.nth(7).boundingBox();
  const rowHandle = await cards.nth(0).locator('.drag-handle').boundingBox();
  expect(rowTarget.y).toBeGreaterThan(rowSource.y);
  const rowX = rowHandle.x + rowHandle.width / 2;
  const rowY = rowHandle.y + rowHandle.height / 2;
  await page.mouse.move(rowX, rowY);
  await page.mouse.down();
  await page.mouse.move(
    rowX + rowTarget.x + rowTarget.width / 2 - (rowSource.x + rowSource.width / 2),
    rowY + rowTarget.y + rowTarget.height / 2 - (rowSource.y + rowSource.height / 2),
    { steps: 1 },
  );
  await page.mouse.up();
  const acrossRows = [...reordered.slice(1), reordered[0]];
  await expect.poll(() => names('.panel-grid > .fader-card')).toEqual(acrossRows);
  await page.getByRole('button', { name: 'Palco', exact: true }).click();
  await expect.poll(() => names('.stage-lane-fader')).toEqual(acrossRows);
  await page.reload();
  await expect(page.getByRole('slider', { name: 'Vocal' })).toBeVisible();
  await page.getByRole('button', { name: 'Palco', exact: true }).click();
  await expect.poll(() => names('.stage-lane-fader')).toEqual(acrossRows);
  await context.close();
});

test('a disconnected desktop browser does not show the mobile pairing warning', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0.0.0',
    isMobile: false,
    hasTouch: false,
    serviceWorkers: 'block',
  });
  try {
    const page = await context.newPage();
    await page.route('**/api/auth**', (route) => route.abort());
    await page.goto(`http://127.0.0.1:${bridge.server.address().port}/`);
    await expect(page.getByRole('slider', { name: 'Vocal' })).toBeVisible();
    await page.getByRole('button', { name: 'Palco', exact: true }).click();
    await expect(page.locator('.no-bridge-banner')).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('mobile HTTP controller initializes, connects via WS and shows disconnect status', async ({
  page,
}) => {
  const url = bridge.mobileUrl();
  expect(new URL(url).protocol).toBe('http:');
  test.skip(new URL(url).hostname === '127.0.0.1', 'Nenhuma interface LAN disponível.');
  const sockets = [];
  let updateChecks = 0;
  await page.route('**/api/app/update-status', (route) => {
    updateChecks += 1;
    return route.fulfill({ json: { updateAvailable: true, latestVersion: '9.0.0' } });
  });
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await page.goto(url);
  await expect(page.locator('#root')).not.toBeEmpty();
  await expect(page.locator('.fd-update-overlay')).toHaveCount(0);
  expect(updateChecks).toBe(0);
  await expect.poll(() => sockets.some((socket) => socket.startsWith('ws://'))).toBe(true);
  await expect(page.getByRole('slider', { name: 'Vocal' })).toBeVisible();
  await expect(page.locator('.fd-mobile-status')).toHaveText('Conectado');
  const firstSocket = new URL(sockets[0]);
  expect(firstSocket.host).toBe(new URL(url).host);
  expect(firstSocket.pathname).toBe('/ws');
  expect(firstSocket.searchParams.get('token')).toBe(
    new URLSearchParams(new URL(url).hash.slice(1)).get('bridgeToken'),
  );

  await page.evaluate(() => localStorage.setItem('faderdeck-bridge-url-v1', '127.0.0.1:8787'));
  sockets.length = 0;
  await page.reload();
  await expect(page.locator('.fd-mobile-status')).toHaveText('Conectado');
  expect(new URL(sockets[0]).host).toBe(new URL(url).host);

  const oldToken = bridge.getToken();
  bridge.rotateToken();
  const newQr = new URL(bridge.mobileUrl());
  newQr.searchParams.set('bridgeToken', oldToken);
  sockets.length = 0;
  await page.goto(newQr.toString());
  await expect(page.locator('.fd-mobile-status')).toHaveText('Conectado');
  expect(new URL(sockets[0]).searchParams.get('token')).toBe(bridge.getToken());
  await page.getByRole('button', { name: 'Abrir Modo Palco' }).click();
  await bridge.shutdown();
  await expect(page.getByRole('button', { name: 'Sair do modo Palco' })).toBeVisible();
  await expect(page.locator('.no-bridge-banner')).toBeHidden();
  const warningBox = await page.locator('.fd-mobile-toolbar').boundingBox();
  const faderBox = await page.locator('.stage-lane-fader').first().boundingBox();
  expect(warningBox.y + warningBox.height).toBeLessThanOrEqual(faderBox.y);
  await page.getByRole('button', { name: 'Sair do modo Palco' }).click();
  await expect(page.locator('.fd-mobile-status')).toHaveText('Reconectando...');
});
