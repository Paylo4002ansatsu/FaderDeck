'use strict';

/* global window, location */
const { test, expect } = require('@playwright/test');
const http = require('node:http');
const path = require('node:path');
const { createHttpHandler } = require('../../bridge/http-router.cjs');
const { createWebSocketGateway } = require('../../bridge/websocket-gateway.cjs');

const root = path.resolve(__dirname, '../..');

async function createFixture(entitlement, expired) {
  const state = { entitlement, expired, sends: [], updateChecks: 0, selections: 0 };
  let port = 0;
  let layout = { version: 0, pages: [], activePageId: '' };
  let initialized = false;
  let seedOwner = null;
  let gateway;
  const service = {
    async getEntitlement() {
      return state.entitlement;
    },
    getCachedEntitlement() {
      return state.entitlement;
    },
  };
  const midiManager = {
    hasOutput: () => true,
    send: (bytes) => state.sends.push(bytes),
    listPorts: () => ({ outputs: [], inputs: [] }),
    selectedOutputIndex: -1,
    selectedInputIndex: -1,
    selectPorts() {
      state.selections += 1;
      return {};
    },
  };
  const server = http.createServer(
    createHttpHandler({
      clientDir: path.join(root, 'client'),
      getPort: () => port,
      getLanPort: () => 0,
      getToken: () => 'test-token',
      getLayout: () => layout,
      setLayout: (value) => {
        layout = value;
      },
      setLayoutInitialized: (value) => {
        initialized = value;
      },
      getMidiManager: () => midiManager,
      getConnectionStatus: () => ({ clients: 0, remoteClients: 0, remoteAddresses: [] }),
      networkAddress: () => '127.0.0.1',
      networkAddresses: () => [],
      rotateToken() {},
      persistLayout: async () => {},
      broadcast: (message) => gateway.broadcast(message),
      entitlementService: service,
      supabaseClient: {
        isSupabaseConfigured: () => true,
        getCurrentSession: async () => ({ user: { id: 'user', email: 'user@example.com' } }),
        invokeEdgeFunction: async () => ({ trial: {}, expired: state.expired }),
      },
      updateChecker: {
        checkForUpdate: async () => {
          state.updateChecks += 1;
          return {
            updateAvailable: true,
            latestVersion: '1.2.0',
            currentVersion: '1.0.7',
            releaseNotes: '',
            downloadUrl: 'https://github.com/Paylo4002ansatsu/FaderDeck/releases/latest',
          };
        },
      },
    }),
  );
  gateway = createWebSocketGateway({
    servers: [server],
    getToken: () => 'test-token',
    getLocalPort: () => port,
    layout: {
      get: () => layout,
      set: (value) => {
        layout = value;
      },
      isInitialized: () => initialized,
      setInitialized: (value) => {
        initialized = value;
      },
      getSeedOwner: () => seedOwner,
      setSeedOwner: (value) => {
        seedOwner = value;
      },
      payload: () => ({ type: 'layout', layout }),
    },
    scheduleLayoutSave() {},
    midiManager,
    entitlementService: service,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
  return {
    state,
    url: `http://127.0.0.1:${port}/`,
    async close() {
      gateway.terminateAll();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

async function injectDesktopScripts(page, fixture) {
  await page.goto(fixture.url);
  await page.addScriptTag({ path: path.join(root, 'assets/qr-overlay.js') });
  await page.addScriptTag({ path: path.join(root, 'client/update-modal.js') });
}

async function sendMidi(page, waitForError) {
  return page.evaluate(
    (shouldWaitForError) =>
      new Promise((resolve, reject) => {
        const socket = new WebSocket(`ws://${location.host}/ws?token=test-token`);
        const timeout = setTimeout(
          () => {
            socket.close();
            shouldWaitForError ? reject(new Error('Resposta MIDI ausente')) : resolve(null);
          },
          shouldWaitForError ? 2000 : 150,
        );
        socket.onopen = () => socket.send(JSON.stringify({ type: 'midi', data: [144, 60, 100] }));
        socket.onerror = () => {
          clearTimeout(timeout);
          reject(new Error('Falha ao conectar o WebSocket de teste'));
        };
        socket.onmessage = (event) => {
          const message = JSON.parse(event.data);
          if (message.type !== 'error') return;
          clearTimeout(timeout);
          socket.close();
          resolve(message);
        };
      }),
    waitForError,
  );
}

test('expired trial takes priority and the real gateway still blocks MIDI', async ({ page }) => {
  const fixture = await createFixture({ allowed: false, kind: 'none' }, true);
  try {
    await injectDesktopScripts(page, fixture);
    await expect(
      page.getByRole('heading', { name: 'Período de Avaliação Encerrado' }),
    ).toBeVisible();
    await expect.poll(() => fixture.state.updateChecks).toBe(1);
    await page.evaluate(() => window.__fdGetAccountStatus());
    await expect(page.locator('.fd-update-overlay')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('heading', { name: 'Período de Avaliação Encerrado' }),
    ).toBeVisible();
    expect(await sendMidi(page, true)).toMatchObject({
      type: 'error',
      code: 'ENTITLEMENT_REQUIRED',
    });
    expect(fixture.state.sends).toEqual([]);
    const response = await page.evaluate(async () => {
      const result = await fetch('/api/ports/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'test-token', outputIndex: 0, inputIndex: -1 }),
      });
      return { status: result.status, body: await result.json() };
    });
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('ENTITLEMENT_REQUIRED');
    expect(fixture.state.selections).toBe(0);
  } finally {
    await fixture.close();
  }
});

test('waits for the account response before displaying an available update', async ({ page }) => {
  const fixture = await createFixture({ allowed: false, kind: 'none' }, true);
  let releaseStatus;
  const gate = new Promise((resolve) => {
    releaseStatus = resolve;
  });
  await page.route('**/api/account/status', async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await injectDesktopScripts(page, fixture);
    await expect.poll(() => fixture.state.updateChecks).toBe(1);
    await expect(page.locator('.fd-update-overlay')).toHaveCount(0);
    releaseStatus();
    await expect(
      page.getByRole('heading', { name: 'Período de Avaliação Encerrado' }),
    ).toBeVisible();
    await page.evaluate(() => window.__fdGetAccountStatus());
    await expect(page.locator('.fd-update-overlay')).toHaveCount(0);
  } finally {
    releaseStatus();
    await fixture.close();
  }
});

test('does not open the update when the account cannot be checked', async ({ page }) => {
  const fixture = await createFixture({ allowed: true, kind: 'trial' }, false);
  await page.route('**/api/account/status', (route) =>
    route.fulfill({ status: 503, json: { error: 'Indisponível' } }),
  );
  try {
    await injectDesktopScripts(page, fixture);
    await expect(
      page.getByText('Não foi possível consultar a conta.', { exact: false }),
    ).toBeVisible();
    await expect.poll(() => fixture.state.updateChecks).toBe(1);
    await page.evaluate(() => window.__fdGetAccountStatus());
    await expect(page.locator('.fd-update-overlay')).toHaveCount(0);
  } finally {
    await fixture.close();
  }
});

for (const entitlement of [
  { allowed: true, kind: 'trial' },
  { allowed: true, kind: 'license', plan_code: 'solo_30' },
  { allowed: true, kind: 'license', plan_code: 'multi_50' },
]) {
  test(`continuing dismisses only the update for ${entitlement.plan_code || entitlement.kind}`, async ({
    page,
  }) => {
    const fixture = await createFixture(entitlement, entitlement.kind === 'license');
    const accountPosts = [];
    page.on('request', (request) => {
      if (request.method() !== 'GET' && new URL(request.url()).pathname.startsWith('/api/account/'))
        accountPosts.push(request.url());
    });
    try {
      await injectDesktopScripts(page, fixture);
      const update = page.locator('.fd-update-overlay');
      await expect(update.getByText('NOVA VERSÃO DISPONÍVEL')).toBeVisible();
      await update.getByRole('button', { name: 'Continuar na versão atual' }).click();
      await expect(update).toHaveCount(0);
      await expect(page.locator('.fdqr-access')).toHaveCount(0);
      expect(accountPosts).toEqual([]);
      expect(await sendMidi(page, false)).toBeNull();
      await expect.poll(() => fixture.state.sends).toEqual([[144, 60, 100]]);
    } finally {
      await fixture.close();
    }
  });
}

test('a later denial removes the update and displays the expired-trial lock', async ({ page }) => {
  const fixture = await createFixture({ allowed: true, kind: 'trial' }, false);
  try {
    await injectDesktopScripts(page, fixture);
    await expect(page.locator('.fd-update-overlay')).toBeVisible();
    fixture.state.entitlement = { allowed: false, kind: 'none' };
    fixture.state.expired = true;
    await page.evaluate(() => window.__fdGetAccountStatus(true));
    await expect(page.locator('.fd-update-overlay')).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Período de Avaliação Encerrado' }),
    ).toBeVisible();
    expect(await sendMidi(page, true)).toMatchObject({ code: 'ENTITLEMENT_REQUIRED' });
    expect(fixture.state.sends).toEqual([]);
  } finally {
    await fixture.close();
  }
});

test('revocation replaces an open account dialog after device activation', async ({ page }) => {
  const fixture = await createFixture(
    { allowed: false, kind: 'license', code: 'DEVICE_REACTIVATION_REQUIRED' },
    false,
  );
  await page.route('**/api/account/devices/activate', (route) => {
    fixture.state.entitlement = { allowed: true, kind: 'license', plan_code: 'solo_30' };
    return route.fulfill({
      json: {
        session: { authenticated: true, email: 'user@example.com' },
        entitlement: fixture.state.entitlement,
      },
    });
  });
  try {
    await injectDesktopScripts(page, fixture);
    await page.getByRole('button', { name: 'Reativar este computador' }).click();
    await expect(page.getByText('Sua licença está ativa.')).toBeVisible();
    await expect(page.locator('.fd-update-overlay')).toHaveCount(0);
    fixture.state.entitlement = { allowed: false, kind: 'none' };
    fixture.state.expired = true;
    await page.evaluate(() => window.__fdGetAccountStatus(true));
    await expect(
      page.getByRole('heading', { name: 'Período de Avaliação Encerrado' }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.fdqr-access')).toBeVisible();
    await expect(page.locator('.fd-update-overlay')).toHaveCount(0);
  } finally {
    await fixture.close();
  }
});

test('a pending update appears after activating a device and closing the account dialog', async ({
  page,
}) => {
  const fixture = await createFixture(
    { allowed: false, kind: 'license', code: 'DEVICE_REACTIVATION_REQUIRED' },
    false,
  );
  await page.route('**/api/account/devices/activate', (route) => {
    fixture.state.entitlement = { allowed: true, kind: 'license', plan_code: 'solo_30' };
    return route.fulfill({
      json: {
        session: { authenticated: true, email: 'user@example.com' },
        entitlement: fixture.state.entitlement,
      },
    });
  });
  try {
    await injectDesktopScripts(page, fixture);
    await expect.poll(() => fixture.state.updateChecks).toBe(1);
    await page.getByRole('button', { name: 'Reativar este computador' }).click();
    await expect(page.getByText('Sua licença está ativa.')).toBeVisible();
    await expect(page.locator('.fd-update-overlay')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('.fd-update-overlay')).toBeVisible();
    await page.getByRole('button', { name: 'Continuar na versão atual' }).click();
    expect(await sendMidi(page, false)).toBeNull();
    await expect.poll(() => fixture.state.sends).toEqual([[144, 60, 100]]);
  } finally {
    await fixture.close();
  }
});

test('the update waits until the pairing dialog closes', async ({ page }) => {
  const fixture = await createFixture({ allowed: true, kind: 'trial' }, false);
  let releaseUpdate;
  const gate = new Promise((resolve) => {
    releaseUpdate = resolve;
  });
  await page.route('**/api/app/update-status', async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await injectDesktopScripts(page, fixture);
    await page.evaluate(() => window.__fdShowQr());
    await expect(page.getByRole('dialog', { name: 'Conectar celular' })).toBeVisible();
    releaseUpdate();
    await expect.poll(() => fixture.state.updateChecks).toBe(1);
    await page.evaluate(() => window.__fdGetAccountStatus());
    await expect(page.locator('.fd-update-overlay')).toHaveCount(0);
    await page.locator('.fdqr-card [data-close]').click();
    await expect(page.locator('.fd-update-overlay')).toBeVisible();
  } finally {
    releaseUpdate();
    await fixture.close();
  }
});

test('a late pairing response cannot close or replace the expired-trial lock', async ({ page }) => {
  const fixture = await createFixture({ allowed: true, kind: 'trial' }, false);
  let releasePairing;
  const gate = new Promise((resolve) => {
    releasePairing = resolve;
  });
  await page.route('**/api/pairing', async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await injectDesktopScripts(page, fixture);
    await expect(page.locator('.fd-update-overlay')).toBeVisible();
    await page.getByRole('button', { name: 'Continuar na versão atual' }).click();
    await page.evaluate(() => {
      window.__fdShowQr();
    });
    await expect(page.getByRole('dialog', { name: 'Conectar celular' })).toBeVisible();
    fixture.state.entitlement = { allowed: false, kind: 'none' };
    fixture.state.expired = true;
    await page.evaluate(() => window.__fdGetAccountStatus(true));
    releasePairing();
    await expect(
      page.getByRole('heading', { name: 'Período de Avaliação Encerrado' }),
    ).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Conectar celular' })).toHaveCount(0);
  } finally {
    releasePairing();
    await fixture.close();
  }
});
