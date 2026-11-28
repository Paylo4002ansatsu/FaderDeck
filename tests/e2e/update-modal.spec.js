'use strict';

/* global window */
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { createUpdateChecker } = require('../../bridge/update-checker.cjs');

test('desktop update modal only shows explicit friendly notes and permits continuing', async ({
  page,
}) => {
  const checker = createUpdateChecker({
    currentVersion: '1.0.7',
    fetchImpl: async () => ({
      ok: true,
      json: async () => [
        {
          tag_name: '1.2.0',
          name: '[REQUIRED] FaderDeck',
          body: '### Correções & Arquitetura\n- Alteração interna.\n**Full Changelog**: https://github.com/example',
          html_url: 'https://github.com/Paylo4002ansatsu/FaderDeck/releases/latest',
          assets: [],
        },
        {
          tag_name: '1.1.0',
          body: '### Correções & Arquitetura\n- Outra alteração interna.',
          html_url: 'https://github.com/Paylo4002ansatsu/FaderDeck/releases/tag/v1.1.0',
          assets: [],
        },
      ],
    }),
  });
  const status = await checker.checkForUpdate();
  await page.route('**/api/app/update-status', (route) =>
    route.fulfill({
      json: status,
    }),
  );
  await page.goto('/');
  await page.setContent(
    '<!doctype html><html><head></head><body><main>Faders</main></body></html>',
  );
  await page.evaluate(() => {
    window.__fdGetAccountStatus = async () => ({
      session: { authenticated: true },
      entitlement: { allowed: true, kind: 'trial' },
    });
  });
  await page.addScriptTag({ path: path.resolve(__dirname, '../../client/update-modal.js') });
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('NOVA VERSÃO DISPONÍVEL')).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'FaderDeck 1.2.0' })).toBeVisible();
  await expect(dialog.getByText('Versão atual: 1.0.7')).toBeVisible();
  await expect(dialog.locator('.fd-update-summary')).toHaveCount(0);
  await expect(dialog).not.toContainText('GitHub');
  await expect(dialog).not.toContainText('Alteração interna');
  await dialog.getByRole('button', { name: 'Continuar na versão atual' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Faders')).toBeVisible();
});

test('desktop update modal renders highlights from all pending releases', async ({ page }) => {
  const changelog = fs.readFileSync(path.resolve(__dirname, '../../CHANGELOG.md'), 'utf8');
  const checker = createUpdateChecker({
    currentVersion: '1.0.7',
    fetchImpl: async () => ({
      ok: true,
      json: async () => [
        {
          tag_name: '1.0.8',
          body: changelog + '\n**Full Changelog**: https://github.com/example',
          html_url: 'https://github.com/Paylo4002ansatsu/FaderDeck/releases/latest',
          assets: [],
        },
        {
          tag_name: '1.0.9',
          body: '### Destaques para você\n- Novos controles para suas músicas.\n- Organize seus faders com mais facilidade.\n### Correções & Arquitetura\n- Interno',
          html_url: 'https://github.com/Paylo4002ansatsu/FaderDeck/releases/tag/v1.0.9',
          assets: [],
        },
      ],
    }),
  });
  const status = await checker.checkForUpdate();
  await page.route('**/api/app/update-status', (route) => route.fulfill({ json: status }));
  await page.goto('/');
  await page.setContent('<!doctype html><html><body><main>Faders</main></body></html>');
  await page.evaluate(() => {
    window.__fdGetAccountStatus = async () => ({
      session: { authenticated: true },
      entitlement: { allowed: true, kind: 'license' },
    });
  });
  await page.addScriptTag({ path: path.resolve(__dirname, '../../client/update-modal.js') });
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'FaderDeck 1.0.9' })).toBeVisible();
  const items = dialog.locator('.fd-update-summary li');
  await expect(items).toHaveText([
    'Novos controles para suas músicas.',
    'Organize seus faders com mais facilidade.',
    'Encontre seus faders na mesma ordem no Modo Palco.',
    'Toque no Modo Palco sem avisos cobrindo seus controles.',
  ]);
  await expect(dialog).not.toContainText('Arquitetura');
  await expect(dialog).not.toContainText('Full Changelog');
  await expect(dialog.locator('.fd-update-summary a')).toHaveCount(0);
});
