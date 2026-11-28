'use strict';

const { test, expect } = require('@playwright/test');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');

test('desktop device limit allows removal and activates the new computer', async ({ page }) => {
  const machineId = 'a'.repeat(64);
  let removed = false;
  const status = () => ({
    session: { authenticated: true, email: 'a***@e***.com' },
    supabase_configured: true,
    trial_available: false,
    entitlement: removed
      ? { allowed: true, kind: 'license', plan_code: 'solo_30' }
      : {
          allowed: false,
          kind: 'license',
          plan_code: 'solo_30',
          code: 'DEVICE_LIMIT_REACHED',
          message: 'Limite de dispositivos atingido.',
          devices: [{ machineId, name: 'Computador anterior' }],
        },
  });
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    if (new URL(request.url()).pathname === '/api/account/devices/remove') {
      expect(request.postDataJSON()).toEqual({ machineId });
      removed = true;
    }
    return route.fulfill({ json: status() });
  });
  await page.goto('/');
  await page.setContent('<!doctype html><html><head></head><body></body></html>');
  await page.addScriptTag({ path: path.join(root, 'assets/qr-overlay.js') });
  await expect(page.getByText('Computador anterior')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Fazer upgrade (R$ 50)' })).toHaveAttribute(
    'href',
    'https://fader-deck.vercel.app',
  );
  await page.getByRole('button', { name: 'Remover dispositivo' }).click();
  await expect(page.getByText('Sua licença está ativa.')).toBeVisible();
  await expect(page.getByText('Plano Individual — R$ 30 (1 dispositivo)')).toBeVisible();
});

test('administration allows removing a device at the plan limit', async ({ page }) => {
  const machineId = 'b'.repeat(64);
  let removed = false;
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === '/api/pairing') {
      return route.fulfill({ json: { url: 'https://localhost/#bridgeToken=test', addresses: [] } });
    }
    if (pathname === '/api/ports') {
      return route.fulfill({ json: { outputs: [], inputs: [], outputIndex: -1, inputIndex: -1 } });
    }
    if (pathname === '/api/account/devices/remove') {
      expect(request.postDataJSON()).toEqual({ machineId });
      removed = true;
    }
    return route.fulfill({
      json: {
        session: { authenticated: true, email: 'a***@e***.com' },
        supabase_configured: true,
        entitlement: removed
          ? { allowed: true, kind: 'license', plan_code: 'solo_30' }
          : {
              allowed: false,
              kind: 'license',
              plan_code: 'solo_30',
              code: 'DEVICE_LIMIT_REACHED',
              message: 'Limite de dispositivos atingido.',
              devices: [{ machineId, name: 'Computador anterior' }],
            },
      },
    });
  });
  await page.goto('/');
  await page.setContent(
    require('node:fs').readFileSync(path.join(root, 'client/admin/index.html'), 'utf8'),
  );
  await page.addScriptTag({ path: path.join(root, 'client/admin/bridge.js') });
  await expect(page.getByText('Computador anterior')).toBeVisible();
  await page.getByRole('button', { name: 'Remover dispositivo' }).click();
  await expect(page.getByText('Sua licença está ativa.')).toBeVisible();
  await expect(page.getByText('Plano Individual — R$ 30 (1 dispositivo)')).toBeVisible();
});

for (const view of ['desktop', 'administration']) {
  test(`${view} requires explicit device reactivation`, async ({ page }) => {
    let activated = false;
    await page.route('**/api/**', async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === '/api/pairing') {
        return route.fulfill({
          json: { url: 'https://localhost/#bridgeToken=test', addresses: [] },
        });
      }
      if (pathname === '/api/ports') {
        return route.fulfill({
          json: { outputs: [], inputs: [], outputIndex: -1, inputIndex: -1 },
        });
      }
      if (pathname === '/api/account/devices/activate') activated = true;
      return route.fulfill({
        json: {
          session: { authenticated: true, email: 'a***@e***.com' },
          supabase_configured: true,
          entitlement: activated
            ? { allowed: true, kind: 'license', plan_code: 'solo_30' }
            : {
                allowed: false,
                kind: 'license',
                code: 'DEVICE_REACTIVATION_REQUIRED',
                message: 'Este computador foi removido.',
              },
        },
      });
    });
    await page.goto('/');
    if (view === 'desktop') {
      await page.setContent('<!doctype html><html><head></head><body></body></html>');
      await page.addScriptTag({ path: path.join(root, 'assets/qr-overlay.js') });
    } else {
      await page.setContent(
        require('node:fs').readFileSync(path.join(root, 'client/admin/index.html'), 'utf8'),
      );
      await page.addScriptTag({ path: path.join(root, 'client/admin/bridge.js') });
    }
    await page.getByRole('button', { name: 'Reativar este computador' }).click();
    await expect(page.getByText('Sua licença está ativa.')).toBeVisible();
    expect(activated).toBe(true);
  });
}

test('desktop overlay completes recovery and supports retry and changing email', async ({
  page,
}) => {
  const requests = [];
  let verifyFails = true;
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const body = route.request().postDataJSON();
    requests.push({ path: url.pathname, body });
    if (url.pathname === '/api/account/status') {
      return route.fulfill({
        json: { session: { authenticated: false }, supabase_configured: true },
      });
    }
    if (url.pathname.endsWith('/verify') && verifyFails) {
      verifyFails = false;
      return route.fulfill({ status: 401, json: { error: 'Código inválido ou expirado.' } });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto('/');
  await page.setContent('<!doctype html><html><head></head><body></body></html>');
  await page.addScriptTag({ path: path.join(root, 'assets/qr-overlay.js') });

  await page.getByRole('button', { name: 'Esqueci minha senha' }).click();
  await page.getByLabel('E-MAIL').fill('first@example.com');
  await page.getByRole('button', { name: 'Enviar código de recuperação' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Código enviado' })).toHaveText(
    'Código enviado para first@example.com. Verifique sua caixa de entrada.',
  );
  await page.getByRole('button', { name: 'Reenviar código' }).click();
  await page.getByRole('button', { name: 'Alterar e-mail' }).click();
  await page.getByLabel('E-MAIL').fill('person@example.com');
  await page.getByRole('button', { name: 'Enviar código de recuperação' }).click();
  const codeInput = page.getByLabel('CÓDIGO DE VERIFICAÇÃO');
  await expect(codeInput).toHaveAttribute('maxlength', '8');
  await codeInput.fill('12345');
  expect(await codeInput.evaluate((input) => input.checkValidity())).toBe(false);
  await codeInput.fill('12345a');
  expect(await codeInput.evaluate((input) => input.checkValidity())).toBe(false);
  await codeInput.fill('01234567');
  await page.getByRole('button', { name: 'Validar código' }).click();
  await expect(page.getByText('Código inválido ou expirado.')).toBeVisible();
  await page.getByRole('button', { name: 'Validar código' }).click();
  await expect(page.getByRole('button', { name: 'Salvar nova senha' })).toBeVisible();
  await page.locator('#fdqr-reset-password').fill('password123');
  await page.locator('#fdqr-reset-password-confirm').fill('different123');
  await page.getByRole('button', { name: 'Salvar nova senha' }).click();
  await expect(page.getByText('As senhas não coincidem.')).toBeVisible();
  await page.locator('#fdqr-reset-password-confirm').fill('password123');
  await page.locator('[aria-controls="fdqr-reset-password"]').click();
  await expect(page.locator('#fdqr-reset-password')).toHaveAttribute('type', 'text');
  await page.locator('[aria-controls="fdqr-reset-password"]').click();
  await page.getByRole('button', { name: 'Salvar nova senha' }).click();
  await expect(page.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeVisible();
  await expect(
    page.getByText('Senha alterada com sucesso! Entre com sua nova senha.'),
  ).toBeVisible();
  expect(requests.filter((item) => item.path.includes('reset-password'))).toEqual([
    { path: '/api/account/reset-password', body: { email: 'first@example.com' } },
    { path: '/api/account/reset-password', body: { email: 'first@example.com' } },
    { path: '/api/account/reset-password', body: { email: 'person@example.com' } },
    {
      path: '/api/account/reset-password/verify',
      body: { email: 'person@example.com', code: '01234567' },
    },
    {
      path: '/api/account/reset-password/verify',
      body: { email: 'person@example.com', code: '01234567' },
    },
    { path: '/api/account/reset-password/confirm', body: { password: 'password123' } },
  ]);
});

test('administration recovery advances and returns to a usable login form', async ({ page }) => {
  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/account/status') {
      return route.fulfill({
        json: { session: { authenticated: false }, supabase_configured: true },
      });
    }
    if (pathname === '/api/pairing') {
      return route.fulfill({ json: { url: 'https://localhost/#bridgeToken=test', addresses: [] } });
    }
    if (pathname === '/api/ports') {
      return route.fulfill({ json: { outputs: [], inputs: [], outputIndex: -1, inputIndex: -1 } });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto('/');
  await page.setContent(
    require('node:fs').readFileSync(path.join(root, 'client/admin/index.html'), 'utf8'),
  );
  await page.addScriptTag({ path: path.join(root, 'client/admin/bridge.js') });
  await page.getByRole('button', { name: 'Esqueci minha senha' }).click();
  await page.locator('#account-login-email').fill('person@example.com');
  await page.getByRole('button', { name: 'Enviar código de recuperação' }).click();
  await expect(page.getByRole('button', { name: 'Validar código' })).toBeVisible();
  const codeInput = page.locator('#account-reset-verify-code');
  await expect(codeInput).toHaveAttribute('maxlength', '8');
  await codeInput.fill('12345');
  expect(await codeInput.evaluate((input) => input.checkValidity())).toBe(false);
  await codeInput.fill('12345678');
  await page.getByRole('button', { name: 'Validar código' }).click();
  await expect(page.getByRole('button', { name: 'Salvar nova senha' })).toBeVisible();
  await page.locator('#account-reset-new-password').fill('password123');
  await page.locator('#account-reset-confirm-password').fill('password123');
  await page.getByRole('button', { name: 'Salvar nova senha' }).click();
  await expect(page.getByRole('button', { name: 'Entrar no FaderDeck' })).toBeVisible();
  await expect(page.locator('#account-login-email')).toBeEnabled();
  await expect(page.locator('#account-reset-verify-code')).toBeDisabled();
});
