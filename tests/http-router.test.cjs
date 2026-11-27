'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');
const { createHttpHandler } = require('../bridge/http-router.cjs');

async function createFixture({ entitlementService, supabaseClient, updateChecker } = {}) {
  let port = 0;
  let selectedPortCalls = 0;
  let layout = { version: 0, pages: [], activePageId: '' };
  const server = http.createServer(
    createHttpHandler({
      clientDir: path.join(__dirname, '..', 'client'),
      getPort: () => port,
      getSecurePort: () => 0,
      getToken: () => 'bridge-token',
      getCaCertificate: () => '',
      getCaFingerprint: () => '',
      getLayout: () => layout,
      setLayout: (next) => {
        layout = next;
      },
      setLayoutInitialized() {},
      getMidiManager: () => ({
        listPorts: () => ({ outputs: [], inputs: [] }),
        selectedOutputIndex: -1,
        selectedInputIndex: -1,
        selectPorts(outputIndex, inputIndex) {
          selectedPortCalls += 1;
          return { outputIndex, inputIndex };
        },
      }),
      getConnectionStatus: () => ({ clients: 0, remoteClients: 0, remoteAddresses: [] }),
      networkAddress: () => '127.0.0.1',
      networkAddresses: () => [],
      rotateToken() {},
      persistLayout: async () => {},
      broadcast() {},
      entitlementService,
      supabaseClient,
      updateChecker,
    }),
  );
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  port = server.address().port;

  return {
    port,
    server,
    get selectedPortCalls() {
      return selectedPortCalls;
    },
  };
}

function request(fixture, url, body, method = 'GET') {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const outgoing = http.request(
      {
        hostname: '127.0.0.1',
        port: fixture.port,
        path: url,
        method,
        headers: {
          Origin: `http://127.0.0.1:${fixture.port}`,
          ...(payload
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
              }
            : {}),
        },
      },
      (incoming) => {
        let responseBody = '';
        incoming.setEncoding('utf8');
        incoming.on('data', (chunk) => {
          responseBody += chunk;
        });
        incoming.on('end', () =>
          resolve({ status: incoming.statusCode, body: JSON.parse(responseBody) }),
        );
      },
    );
    outgoing.once('error', reject);
    outgoing.end(payload);
  });
}

test('requires a valid entitlement before selecting MIDI ports', async (t) => {
  const fixture = await createFixture({
    entitlementService: { getEntitlement: async () => ({ allowed: false }) },
  });
  t.after(() => new Promise((resolve) => fixture.server.close(resolve)));

  const response = await request(
    fixture,
    '/api/ports/select',
    { token: 'bridge-token', outputIndex: 0, inputIndex: -1 },
    'POST',
  );

  assert.equal(response.status, 403);
  assert.equal(response.body.code, 'ENTITLEMENT_REQUIRED');
  assert.equal(fixture.selectedPortCalls, 0);
});

test('allows MIDI port selection when the entitlement is valid', async (t) => {
  const fixture = await createFixture({
    entitlementService: { getEntitlement: async () => ({ allowed: true }) },
  });
  t.after(() => new Promise((resolve) => fixture.server.close(resolve)));

  const response = await request(
    fixture,
    '/api/ports/select',
    { token: 'bridge-token', outputIndex: 0, inputIndex: -1 },
    'POST',
  );

  assert.equal(response.status, 200);
  assert.equal(fixture.selectedPortCalls, 1);
});

test('account routes mask the email and never return session tokens', async (t) => {
  let session = null;
  let entitlementAllowed = false;
  const calls = [];
  const fixture = await createFixture({
    entitlementService: {
      async getEntitlement() {
        return {
          allowed: entitlementAllowed,
          kind: entitlementAllowed ? 'trial' : 'none',
          expires_at: entitlementAllowed ? '2026-12-03T12:00:00.000Z' : null,
          server_time: '2026-11-26T12:00:00.000Z',
          offline_grace_until: entitlementAllowed ? '2026-11-27T12:00:00.000Z' : null,
        };
      },
      clearCache() {
        calls.push('clearCache');
      },
    },
    supabaseClient: {
      isSupabaseConfigured: () => true,
      async getCurrentSession() {
        return session;
      },
      async signInWithEmailAndPassword() {
        session = {
          access_token: 'secret-access-token',
          refresh_token: 'secret-refresh-token',
          user: { id: 'user-id', email: 'alex@example.com' },
        };
      },
      async invokeEdgeFunction(name) {
        calls.push(name);
        if (name === 'trial-start') entitlementAllowed = true;
        return { trial: null, expired: false };
      },
      async signOut() {
        session = null;
      },
    },
  });
  t.after(() => new Promise((resolve) => fixture.server.close(resolve)));

  const login = await request(
    fixture,
    '/api/account/login',
    { email: 'alex@example.com', password: 'passphrase' },
    'POST',
  );
  assert.equal(login.status, 200);
  assert.equal(login.body.session.email, 'a***@e***.com');
  assert.equal(login.body.entitlement.allowed, true);
  assert.equal(calls.filter((name) => name === 'trial-start').length, 1);
  assert.equal(JSON.stringify(login.body).includes('secret-access-token'), false);
  assert.equal(JSON.stringify(login.body).includes('secret-refresh-token'), false);

  const started = await request(fixture, '/api/account/trial/start', {}, 'POST');
  assert.equal(started.status, 200);
  assert.equal(started.body.entitlement.allowed, true);
  assert.ok(calls.includes('trial-start'));

  const loggedOut = await request(fixture, '/api/account/logout', {}, 'POST');
  assert.equal(loggedOut.status, 200);
  assert.equal(loggedOut.body.session.authenticated, false);
  assert.ok(calls.includes('clearCache'));
});

test('signup starts a trial immediately when Supabase returns a session', async (t) => {
  let session = null;
  let entitlementAllowed = false;
  const calls = [];
  const fixture = await createFixture({
    entitlementService: {
      async getEntitlement() {
        return {
          allowed: entitlementAllowed,
          kind: entitlementAllowed ? 'trial' : 'none',
          expires_at: entitlementAllowed ? '2026-12-03T12:00:00.000Z' : null,
          server_time: '2026-11-26T12:00:00.000Z',
          offline_grace_until: entitlementAllowed ? '2026-11-27T12:00:00.000Z' : null,
        };
      },
    },
    supabaseClient: {
      isSupabaseConfigured: () => true,
      async getCurrentSession() {
        return session;
      },
      async signUpWithEmailAndPassword(email, password) {
        assert.equal(email, 'new@example.com');
        assert.equal(password, 'new-password');
        session = {
          access_token: 'signup-access-token',
          refresh_token: 'signup-refresh-token',
          user: { id: 'new-user-id', email },
        };
        return { session };
      },
      async invokeEdgeFunction(name) {
        calls.push(name);
        if (name === 'trial-start') {
          assert.ok(session, 'signup session is available before starting the trial');
          entitlementAllowed = true;
          return { trial: { status: 'active' } };
        }
        return {
          trial: { status: 'active', ends_at: '2026-12-03T12:00:00.000Z' },
          expired: false,
        };
      },
    },
  });
  t.after(() => new Promise((resolve) => fixture.server.close(resolve)));

  const response = await request(
    fixture,
    '/api/account/signup',
    { email: 'new@example.com', password: 'new-password' },
    'POST',
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.session.authenticated, true);
  assert.equal(response.body.entitlement.allowed, true);
  assert.equal(response.body.confirmation_required, false);
  assert.equal(calls[0], 'trial-start');
  assert.equal(JSON.stringify(response.body).includes('signup-access-token'), false);
  assert.equal(JSON.stringify(response.body).includes('signup-refresh-token'), false);
});

test('signup asks users to confirm email when Supabase returns no session', async (t) => {
  const calls = [];
  const fixture = await createFixture({
    supabaseClient: {
      isSupabaseConfigured: () => true,
      async getCurrentSession() {
        return null;
      },
      async signUpWithEmailAndPassword() {
        return { session: null };
      },
      async invokeEdgeFunction(name) {
        calls.push(name);
      },
    },
  });
  t.after(() => new Promise((resolve) => fixture.server.close(resolve)));

  const response = await request(
    fixture,
    '/api/account/signup',
    { email: 'confirm@example.com', password: 'new-password' },
    'POST',
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.session.authenticated, false);
  assert.equal(response.body.confirmation_required, true);
  assert.equal(
    response.body.message,
    'Enviamos um link de confirmação para o seu e-mail. Confirme o cadastro antes de entrar.',
  );
  assert.deepEqual(calls, []);
});

test('password reset delegates to Supabase without revealing account existence', async (t) => {
  let resetEmail = null;
  const fixture = await createFixture({
    supabaseClient: {
      isSupabaseConfigured: () => true,
      async resetPasswordForEmail(email) {
        resetEmail = email;
      },
    },
  });
  t.after(() => new Promise((resolve) => fixture.server.close(resolve)));

  const response = await request(
    fixture,
    '/api/account/reset-password',
    { email: 'person@example.com' },
    'POST',
  );

  assert.equal(response.status, 200);
  assert.equal(resetEmail, 'person@example.com');
  assert.match(response.body.message, /se o e-mail estiver cadastrado/i);
});

test('password reset relays Supabase error details and status', async (t) => {
  const fixture = await createFixture({
    supabaseClient: {
      isSupabaseConfigured: () => true,
      async resetPasswordForEmail() {
        throw Object.assign(
          new Error('For security purposes, you can only request this after 60 seconds.'),
          { status: 429, code: 'over_email_send_rate_limit' },
        );
      },
    },
  });
  t.after(() => new Promise((resolve) => fixture.server.close(resolve)));

  const response = await request(
    fixture,
    '/api/account/reset-password',
    { email: 'person@example.com' },
    'POST',
  );

  assert.equal(response.status, 429);
  assert.equal(
    response.body.error,
    'For security purposes, you can only request this after 60 seconds.',
  );
  assert.equal(response.body.status, 429);
  assert.equal(response.body.code, 'over_email_send_rate_limit');
});

test('verify OTP endpoint validates recovery code', async (t) => {
  const verifiedTokens = [];
  const fixture = await createFixture({
    supabaseClient: {
      isSupabaseConfigured: () => true,
      async verifyOtp({ email, token }) {
        if (token === '000000') {
          throw Object.assign(new Error('Invalid OTP'), { status: 403 });
        }
        verifiedTokens.push(token);
        return { user: { id: 'user-id', email } };
      },
    },
  });
  t.after(() => new Promise((resolve) => fixture.server.close(resolve)));

  for (const code of ['123456', '0123456', '01234567']) {
    const validResponse = await request(
      fixture,
      '/api/account/reset-password/verify',
      { email: 'person@example.com', code },
      'POST',
    );
    assert.equal(validResponse.status, 200);
    assert.equal(validResponse.body.verified, true);
  }
  assert.deepEqual(verifiedTokens, ['123456', '0123456', '01234567']);

  const invalidResponse = await request(
    fixture,
    '/api/account/reset-password/verify',
    { email: 'person@example.com', code: '000000' },
    'POST',
  );

  assert.equal(invalidResponse.status, 401);
  assert.equal(invalidResponse.body.code, 'INVALID_CODE');
  assert.match(invalidResponse.body.error, /inválido ou expirado/i);
});

test('verify OTP rejects codes outside the 6-to-8-digit numeric range', async (t) => {
  const fixture = await createFixture({
    supabaseClient: {
      isSupabaseConfigured: () => true,
    },
  });
  t.after(() => new Promise((resolve) => fixture.server.close(resolve)));

  for (const code of ['12345', '123456789', '12345a', '１２３４５６', 12345678]) {
    const response = await request(
      fixture,
      '/api/account/reset-password/verify',
      { email: 'person@example.com', code },
      'POST',
    );
    assert.equal(response.status, 400);
    assert.match(response.body.error, /6 a 8 dígitos numéricos/);
  }
});

test('verify OTP distinguishes rate limiting and service failures from invalid codes', async (t) => {
  let status = 429;
  const fixture = await createFixture({
    supabaseClient: {
      isSupabaseConfigured: () => true,
      async verifyOtp() {
        throw Object.assign(new Error('upstream failure'), { status });
      },
    },
  });
  t.after(() => new Promise((resolve) => fixture.server.close(resolve)));

  const body = { email: 'person@example.com', code: '123456' };
  const limited = await request(fixture, '/api/account/reset-password/verify', body, 'POST');
  assert.equal(limited.status, 429);
  assert.equal(limited.body.code, 'PASSWORD_VERIFY_FAILED');
  status = 503;
  const unavailable = await request(fixture, '/api/account/reset-password/verify', body, 'POST');
  assert.equal(unavailable.status, 502);
  assert.equal(unavailable.body.code, 'PASSWORD_VERIFY_FAILED');
});

test('password confirm endpoint updates password and signs out', async (t) => {
  const calls = [];
  const fixture = await createFixture({
    supabaseClient: {
      isSupabaseConfigured: () => true,
      async updateUser({ password }) {
        calls.push({ action: 'updateUser', password });
        return { user: { id: 'user-id' } };
      },
      async signOutRecovery() {
        calls.push({ action: 'signOutRecovery' });
      },
    },
  });
  t.after(() => new Promise((resolve) => fixture.server.close(resolve)));

  const response = await request(
    fixture,
    '/api/account/reset-password/confirm',
    { password: 'NewPassword123' },
    'POST',
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.updated, true);
  assert.match(response.body.message, /sucesso/i);
  assert.deepEqual(calls, [
    { action: 'updateUser', password: 'NewPassword123' },
    { action: 'signOutRecovery' },
  ]);
});

test('password confirm rejects passwords shorter than 8 characters', async (t) => {
  const fixture = await createFixture({
    supabaseClient: {
      isSupabaseConfigured: () => true,
    },
  });
  t.after(() => new Promise((resolve) => fixture.server.close(resolve)));

  const response = await request(
    fixture,
    '/api/account/reset-password/confirm',
    { password: 'short' },
    'POST',
  );

  assert.equal(response.status, 400);
  assert.match(response.body.error, /8 caracteres/);
});

test('update status route returns the injected release-check result', async (t) => {
  const fixture = await createFixture({
    updateChecker: {
      async checkForUpdate() {
        return {
          currentVersion: '1.0.4',
          latestVersion: '1.0.5',
          updateAvailable: true,
          mandatory: true,
          releaseNotes: 'Correções.',
          downloadUrl: 'https://github.com/FaderDeck/releases/download/v1.0.5/app.dmg',
          releaseUrl: 'https://github.com/FaderDeck/releases/tag/v1.0.5',
        };
      },
    },
  });
  t.after(() => new Promise((resolve) => fixture.server.close(resolve)));

  const response = await request(fixture, '/api/app/update-status');

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    currentVersion: '1.0.4',
    latestVersion: '1.0.5',
    updateAvailable: true,
    mandatory: true,
    releaseNotes: 'Correções.',
    downloadUrl: 'https://github.com/FaderDeck/releases/download/v1.0.5/app.dmg',
    releaseUrl: 'https://github.com/FaderDeck/releases/tag/v1.0.5',
  });
});
