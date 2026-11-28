'use strict';

const { test, expect } = require('@playwright/test');

const releaseRoute = 'https://github.com/Paylo4002ansatsu/FaderDeck/releases/download/**';
const installerNames = new Set([
  'FaderDeck-Windows-Setup.exe',
  'FaderDeck-Mac.dmg',
  'FaderDeck-Mac-Monterey-Intel.dmg',
]);

function monitorPageFailures(page) {
  const failures = [];

  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(`console error: ${message.text()}`);
  });
  page.on('pageerror', (error) => failures.push(`uncaught page error: ${error.message}`));
  page.on('requestfailed', (request) => {
    const url = new URL(request.url());
    if (url.hostname === 'github.com' && url.pathname.includes('/releases/download/')) return;
    failures.push(`request failed: ${url.pathname}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      failures.push(`HTTP ${response.status()}: ${new URL(response.url()).pathname}`);
    }
  });

  return () => expect(failures).toEqual([]);
}

async function createVisitor(browser, userAgent) {
  const context = await browser.newContext(userAgent ? { userAgent } : {});
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgentData', {
      configurable: true,
      value: undefined,
    });
  });
  return { context, page: await context.newPage() };
}

async function installDownloadMock(page) {
  await page.route(releaseRoute, async (route) => {
    const filename = new URL(route.request().url()).pathname.split('/').pop();
    if (!installerNames.has(filename)) {
      await route.abort();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/octet-stream',
      headers: {
        'content-disposition': `attachment; filename="${filename}"`,
      },
      body: 'playwright installer fixture',
    });
  });
}

async function clickInstaller(page, selector, filename) {
  const downloadPromise = page.waitForEvent('download');
  await page.locator(selector).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(filename);
}

async function expectAvailableArtifact(request, url, filename) {
  let response;
  try {
    response = await request.head(url, { timeout: 20_000 });
    if (response.status() === 302) {
      const location = response.headers().location;
      if (!location) throw new Error('missing redirect location');
      response = await request.head(location, { timeout: 20_000 });
    }
  } catch {
    throw new Error(`HEAD request failed for ${filename}`);
  }

  expect([200, 302], `${filename} must be available`).toContain(response.status());
  const headers = response.headers();
  const contentType = (headers['content-type'] || '').split(';')[0].toLowerCase();
  expect(['application/octet-stream', 'application/x-apple-diskimage']).toContain(contentType);
  expect(Number(headers['content-length'])).toBeGreaterThan(1_000_000);
  expect((headers['content-disposition'] || '').toLowerCase()).toContain(filename.toLowerCase());
}

test('anonymous visitors can open the landing page and public Windows guide without page or network errors', async ({
  browser,
  baseURL,
}) => {
  const { context, page } = await createVisitor(browser);
  const expectNoFailures = monitorPageFailures(page);

  try {
    const landingResponse = await page.goto(baseURL, { waitUntil: 'networkidle' });
    expect(landingResponse.status()).toBe(200);
    await expect(page.locator('h1')).toContainText('Seu controle.');
    await page.goto(new URL('/guia-midi-windows.html', baseURL).toString(), {
      waitUntil: 'networkidle',
    });
    await expect(page).toHaveTitle(/Guia MIDI para Windows/);
    await expect(page.locator('main h1')).toContainText('GUIA VISUAL');
    expectNoFailures();
  } finally {
    await context.close();
  }
});

test('plan comparison and real screenshots remain usable on desktop and mobile', async ({
  page,
}) => {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');

    await expect(page.locator('.trial-banner')).toContainText('7 dias');
    await expect(page.locator('.trial-banner')).toContainText('Sem cartão');
    const cards = page.locator('.plan-grid .plan-card');
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toContainText('1 computador');
    await expect(cards.nth(1)).toContainText('2 computadores');

    for (const image of await page.locator('.product-showcase img').all()) {
      await image.scrollIntoViewIfNeeded();
      await expect(image).toBeVisible();
      await expect.poll(() => image.evaluate((element) => element.naturalWidth)).toBeGreaterThan(0);
      const ratio = await image.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return (bounds.width / bounds.height) * (element.naturalHeight / element.naturalWidth);
      });
      expect(Math.abs(ratio - 1)).toBeLessThan(0.01);
    }
    expect(
      await page.locator('html').evaluate((element) => element.scrollWidth),
    ).toBeLessThanOrEqual(width);
  }
});

test('Windows 64-bit visitor can start the installer download from the smart button', async ({
  browser,
  baseURL,
}) => {
  const { context, page } = await createVisitor(
    browser,
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
  );
  const expectNoFailures = monitorPageFailures(page);

  try {
    await page.goto(baseURL, { waitUntil: 'networkidle' });
    await expect(page.locator('#smart-download-label')).toHaveText('Baixar para Windows 64-bit');
    await expect(page.locator('#smart-download')).toHaveAttribute(
      'href',
      /FaderDeck-Windows-Setup\.exe$/,
    );
    await installDownloadMock(page);
    await clickInstaller(page, '#smart-download', 'FaderDeck-Windows-Setup.exe');
    expectNoFailures();
  } finally {
    await context.close();
  }
});

test('macOS visitor can choose and start both published Mac installer downloads', async ({
  browser,
  baseURL,
}) => {
  const { context, page } = await createVisitor(
    browser,
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
  );
  const expectNoFailures = monitorPageFailures(page);

  try {
    await page.goto(baseURL, { waitUntil: 'networkidle' });
    await expect(page.locator('#smart-download-label')).toHaveText('Escolher instalador para Mac');
    await expect(page.locator('#smart-download')).toHaveAttribute('href', '#downloads');
    await page.locator('#smart-download').click();
    await expect(page).toHaveURL(/#downloads$/);

    await installDownloadMock(page);
    await clickInstaller(page, '#download-mac', 'FaderDeck-Mac.dmg');
    await clickInstaller(page, '#download-macos-monterey', 'FaderDeck-Mac-Monterey-Intel.dmg');
    expectNoFailures();
  } finally {
    await context.close();
  }
});

test('Linux visitor is sent to the supported download choices instead of a Linux installer', async ({
  browser,
  baseURL,
}) => {
  const { context, page } = await createVisitor(
    browser,
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
  );
  const expectNoFailures = monitorPageFailures(page);

  try {
    await page.goto(baseURL, { waitUntil: 'networkidle' });
    await expect(page.locator('#smart-download-label')).toHaveText('Baixar Aplicativo');
    await expect(page.locator('#smart-download')).toHaveAttribute('href', '#downloads');
    await page.locator('#smart-download').click();
    await expect(page).toHaveURL(/#downloads$/);
    await expect(page.locator('#download-windows')).toBeVisible();
    await expect(page.locator('#download-mac')).toBeVisible();
    expectNoFailures();
  } finally {
    await context.close();
  }
});

test('published installer links resolve to release assets with valid type and size', async ({
  browser,
  baseURL,
  request,
}) => {
  const { context, page } = await createVisitor(browser);

  try {
    await page.goto(baseURL, { waitUntil: 'networkidle' });
    const assets = [
      ['#download-windows', 'FaderDeck-Windows-Setup.exe'],
      ['#download-mac', 'FaderDeck-Mac.dmg'],
      ['#download-macos-monterey', 'FaderDeck-Mac-Monterey-Intel.dmg'],
    ];

    for (const [selector, filename] of assets) {
      const href = await page.locator(selector).getAttribute('href');
      expect(href).toBeTruthy();
      const url = new URL(href);
      expect(url.protocol).toBe('https:');
      expect(url.hostname).toBe('github.com');
      expect(url.pathname.endsWith(`/${filename}`)).toBe(true);
      await expectAvailableArtifact(request, url.toString(), filename);
    }
  } finally {
    await context.close();
  }
});
