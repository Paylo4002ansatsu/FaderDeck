'use strict';

const { test, expect, devices } = require('@playwright/test');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const WebSocket = require('ws');

let bridge;
let directory;
let input;
const sentMidi = [];
const entitlement = { allowed: true, kind: 'trial' };

test.beforeAll(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'faderdeck-sync-'));
  const previousDir = process.env.FADERDECK_DATA_DIR;
  const previousLan = process.env.FADER_BRIDGE_LAN_PORT;
  process.env.FADERDECK_DATA_DIR = directory;
  process.env.FADER_BRIDGE_LAN_PORT = '0';
  const originalLoad = Module._load;
  const midi = {
    Output: class {
      getPortCount() {
        return 1;
      }
      getPortName() {
        return 'FaderDeck';
      }
      openPort() {}
      openVirtualPort() {}
      closePort() {}
      sendMessage(bytes) {
        sentMidi.push(bytes);
      }
    },
    Input: class extends EventEmitter {
      getPortCount() {
        return 1;
      }
      getPortName() {
        return 'DAW';
      }
      ignoreTypes() {}
      openPort() {
        input = this;
      }
      closePort() {}
    },
  };
  Module._load = function stub(request, parent, isMain) {
    if (request === '@julusian/midi') return midi;
    if (request === './bridge/entitlement-service.cjs')
      return {
        createEntitlementService: () => ({
          getEntitlement: async () => entitlement,
          getCachedEntitlement: async () => entitlement,
        }),
      };
    if (request === './bridge/supabase-client.cjs')
      return {
        isSupabaseConfigured: () => true,
        getCurrentSession: async () => ({ user: { id: 'test', email: 'test@example.com' } }),
        invokeEdgeFunction: async () => ({ trial: {}, expired: false }),
      };
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    bridge = require('../../server.cjs');
    await bridge.start(0);
  } finally {
    Module._load = originalLoad;
    if (previousDir === undefined) delete process.env.FADERDECK_DATA_DIR;
    else process.env.FADERDECK_DATA_DIR = previousDir;
    if (previousLan === undefined) delete process.env.FADER_BRIDGE_LAN_PORT;
    else process.env.FADER_BRIDGE_LAN_PORT = previousLan;
  }
});

test.afterAll(async () => {
  if (bridge) await bridge.shutdown();
  if (directory) fs.rmSync(directory, { recursive: true, force: true });
});

test('desktop, phone and DAW synchronize controls and QR connection feedback', async ({
  browser,
}) => {
  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    userAgent: 'Mozilla/5.0 Chrome/140.0.0.0 Electron/38.0.0',
    serviceWorkers: 'block',
  });
  const phone = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
  const tablet = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
    serviceWorkers: 'block',
  });
  await tablet.addInitScript(() => {
    Object.defineProperty(navigator, 'platform', { value: 'MacIntel' });
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 5 });
  });
  const computer = await desktop.newPage();
  const mobile = await phone.newPage();
  try {
    await computer.goto(`http://127.0.0.1:${bridge.getPort()}/`);
    await computer.addScriptTag({ path: path.resolve(__dirname, '../../assets/qr-overlay.js') });
    await expect(computer.locator('.fd-connection-indicator')).toHaveText(
      'Nenhum celular conectado',
    );
    await expect(computer.getByRole('button', { name: 'Abrir configurações MIDI' })).toContainText(
      'Conectado',
    );
    const selected = await computer.evaluate(async (token) => {
      const response = await fetch('/api/ports/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, outputIndex: 0, inputIndex: 0 }),
      });
      return response.status;
    }, bridge.getToken());
    expect(selected).toBe(200);
    await computer.getByRole('button', { name: 'Editar', exact: true }).click();
    await computer.getByRole('button', { name: 'Pad', exact: true }).click();
    await expect(computer.locator('.pad-card')).toHaveCount(1);
    await computer.getByRole('button', { name: 'Tocar', exact: true }).click();
    await computer.getByRole('slider', { name: 'Vocal' }).focus();
    await computer.keyboard.press('Home');
    await expect
      .poll(() => sentMidi.some((bytes) => bytes[0] === 176 && bytes[1] === 1 && bytes[2] === 0))
      .toBe(true);
    await computer.locator('.fd-connection-indicator').click();
    await expect(computer.getByRole('dialog', { name: 'Conectar celular' })).toBeVisible();
    const rejected = await new Promise((resolve) => {
      const socket = new WebSocket(
        `ws://127.0.0.1:${bridge.getLanPort()}/ws?token=wrong&device=mobile`,
        {
          headers: { 'User-Agent': 'iPhone Mobile' },
        },
      );
      socket.on('unexpected-response', (_request, response) => resolve(response.statusCode));
      socket.on('error', () => resolve(0));
    });
    expect(rejected).toBe(401);
    await expect(computer.locator('.fd-connection-indicator')).toHaveText(
      'Nenhum celular conectado',
    );

    await mobile.goto(`http://127.0.0.1:${bridge.getLanPort()}/#bridgeToken=${bridge.getToken()}`);
    await expect(mobile.locator('.fd-connection-indicator')).toHaveText('Conectado ao computador');
    await expect(computer.getByRole('dialog', { name: 'Conectar celular' })).toHaveCount(0);
    await expect(computer.getByText('Dispositivo conectado')).toBeVisible();
    await expect(computer.locator('.fd-connection-indicator')).toHaveText('Celular conectado');
    await expect(mobile.locator('.pad-card')).toHaveCount(1);
    await expect(mobile.getByRole('slider', { name: 'Vocal' })).toHaveAttribute(
      'aria-valuenow',
      '0',
    );
    const ids = (page) =>
      page
        .locator('.panel-grid > .control-card')
        .evaluateAll((controls) => controls.map((control) => control.dataset.controlId));
    expect(await ids(mobile)).toEqual(await ids(computer));

    await mobile.getByRole('slider', { name: 'Vocal' }).focus();
    await mobile.keyboard.press('End');
    await expect(computer.getByRole('slider', { name: 'Vocal' })).toHaveAttribute(
      'aria-valuenow',
      '127',
    );
    await expect
      .poll(() => sentMidi.some((bytes) => bytes[0] === 176 && bytes[1] === 1 && bytes[2] === 127))
      .toBe(true);
    await computer.getByRole('slider', { name: 'Vocal' }).focus();
    await computer.keyboard.press('Home');
    await expect(mobile.getByRole('slider', { name: 'Vocal' })).toHaveAttribute(
      'aria-valuenow',
      '0',
    );
    const beforeDaw = sentMidi.length;
    input.emit('message', 0, [0xb0, 1, 64]);
    await expect(computer.getByRole('slider', { name: 'Vocal' })).toHaveAttribute(
      'aria-valuenow',
      '64',
    );
    await expect(mobile.getByRole('slider', { name: 'Vocal' })).toHaveAttribute(
      'aria-valuenow',
      '64',
    );
    expect(sentMidi.length).toBe(beforeDaw);

    const pad = computer.locator('.pad-surface');
    const box = await pad.boundingBox();
    await computer.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await computer.mouse.down();
    await expect(mobile.locator('.pad-card')).toHaveClass(/pad-active/);
    await computer.mouse.up();
    await expect(mobile.locator('.pad-card')).not.toHaveClass(/pad-active/);
    await expect
      .poll(() => sentMidi.some((bytes) => bytes[0] === 144 && bytes[1] === 36))
      .toBe(true);
    await expect
      .poll(() => sentMidi.some((bytes) => bytes[0] === 128 && bytes[1] === 36))
      .toBe(true);
    await mobile.locator('.pad-surface').scrollIntoViewIfNeeded();
    const mobilePadBox = await mobile.locator('.pad-surface').boundingBox();
    const beforeMobilePad = sentMidi.length;
    await mobile.mouse.move(
      mobilePadBox.x + mobilePadBox.width / 2,
      mobilePadBox.y + mobilePadBox.height / 2,
    );
    await mobile.mouse.down();
    await expect(computer.locator('.pad-card')).toHaveClass(/pad-active/);
    await mobile.mouse.up();
    await expect(computer.locator('.pad-card')).not.toHaveClass(/pad-active/);
    await expect.poll(() => sentMidi.length - beforeMobilePad).toBe(2);
    input.emit('message', 0, [0x90, 36, 100]);
    await expect(computer.locator('.pad-card')).toHaveClass(/pad-active/);
    await expect(mobile.locator('.pad-card')).toHaveClass(/pad-active/);
    input.emit('message', 0, [0x80, 36, 0]);
    await expect(mobile.locator('.pad-card')).not.toHaveClass(/pad-active/);

    await mobile.getByRole('button', { name: 'Palco', exact: true }).click();
    await expect(mobile.locator('.stage-mode > .fd-connection-indicator')).toBeVisible();
    await expect(mobile.locator('.stage-lane-fader').first()).toBeVisible();
    const badge = await mobile.locator('.fd-connection-indicator').boundingBox();
    const fader = await mobile.locator('.stage-lane-fader').first().boundingBox();
    expect(badge.y + badge.height).toBeLessThanOrEqual(fader.y);
    const secondMobile = await tablet.newPage();
    await secondMobile.goto(
      `http://127.0.0.1:${bridge.getLanPort()}/#bridgeToken=${bridge.getToken()}`,
    );
    await expect(secondMobile.getByRole('slider', { name: 'Vocal' })).toHaveAttribute(
      'aria-valuenow',
      '64',
    );
    expect(await ids(secondMobile)).toEqual(await ids(computer));
    await expect
      .poll(async () =>
        computer.evaluate(
          async () => (await (await fetch('/api/status')).json()).connectedMobileClients,
        ),
      )
      .toBe(2);
    await mobile.close();
    await expect(computer.locator('.fd-connection-indicator')).toHaveText('Celular conectado');
    await secondMobile.close();
    await expect(computer.locator('.fd-connection-indicator')).toHaveText(
      'Nenhum celular conectado',
    );
    await expect(computer.getByText('Dispositivo conectado')).toHaveCount(0, { timeout: 5000 });
    const newSocket = new Promise((resolve) => computer.once('websocket', resolve));
    bridge.rotateToken();
    const reconnected = await newSocket;
    expect(new URL(reconnected.url()).searchParams.get('token')).toBe(bridge.getToken());
    await expect(computer.getByRole('button', { name: 'Abrir configurações MIDI' })).toContainText(
      'Conectado',
    );
    const beforeReconnectMove = sentMidi.length;
    await computer.getByRole('slider', { name: 'Vocal' }).focus();
    await computer.keyboard.press('End');
    await expect.poll(() => sentMidi.length).toBeGreaterThan(beforeReconnectMove);
  } finally {
    await desktop.close();
    await phone.close();
    await tablet.close();
  }
});
