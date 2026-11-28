'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'client/admin/index.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'client/admin/bridge.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'client/admin/bridge.css'), 'utf8');
const desktopOverlay = fs.readFileSync(path.join(root, 'assets/qr-overlay.js'), 'utf8');

test('account feedback banner displays the confirmation guidance prominently', () => {
  assert.match(
    html,
    /id="account-feedback-banner"[^>]*role="status"[^>]*aria-live="polite"[^>]*hidden/,
  );
  assert.match(
    script,
    /Enviamos um link de confirmação para o seu e-mail\. Verifique sua caixa de entrada e spam\./,
  );
  assert.match(script, /Aguarde 60 segundos antes de solicitar um novo código de recuperação\./);
  assert.match(script, /\/rate limit\|for security purposes\/i\.test\(message\)/);
  assert.match(script, /\/error sending recovery email\/i\.test\(message\)/);
  assert.match(
    script,
    /Não foi possível enviar o e-mail de recuperação\. Tente novamente mais tarde\./,
  );
  assert.match(
    styles,
    /\.account-feedback-banner\s*{\s*margin:\s*0 0 20px;[^}]*background:\s*rgb\(16 185 129 \/ 10%\);[^}]*color:\s*#a7f3d0;/s,
  );
  assert.match(
    styles,
    /\.account-feedback-banner\[data-state=['"]error['"]\]\s*{[^}]*color:\s*#fecdd3;/s,
  );
});

test('account feedback clears only on retries or a user-selected tab change', () => {
  assert.match(script, /if \(clearFeedback && modeChanged\) clearAccountFeedbackBanner\(\)/);
  assert.match(
    script,
    /document\.querySelector\('#account-login'\)\.addEventListener\('submit'[\s\S]*?clearAccountFeedbackBanner\(\)/,
  );
  assert.match(
    script,
    /document\.querySelector\('#account-forgot-password'\)\.addEventListener\('click', async \(\) => {\s+resetFlowState\.step = 1;[\s\S]*?setAccountMode\('reset', { clearFeedback: true }\)/,
  );
  assert.match(
    script,
    /if \(status\.confirmation_required\) {[\s\S]*?showAccountFeedbackBanner\(ACCOUNT_EMAIL_SENT_MESSAGE\)/,
  );
  assert.match(
    script,
    /await requestJson\('\/api\/account\/reset-password'[\s\S]*?showAccountFeedbackBanner\(/,
  );
});

test('access page presents split-screen login, signup, reset and authenticated states', () => {
  assert.match(html, /FaderDeck — Acesso/);
  assert.match(html, /class="identity-panel"/);
  assert.match(html, /class="access-card"/);
  assert.match(html, /Seu controlador\.<br \/>Sua licença\./);
  assert.match(html, /7 dias grátis no cadastro/);
  assert.match(html, /Manter conectado neste computador/);
  assert.match(html, /account-password-toggle/);
  assert.match(html, /account-mode-signup/);
  assert.match(html, /account-reset-back/);
  assert.match(html, /account-trial-start/);
  assert.match(html, /account-license-link/);
  assert.match(html, /Trocar de conta/);
  assert.match(script, /setAccountMode\('reset'/);
  assert.match(script, /\/api\/account\/trial\/start/);
  assert.match(script, /\/api\/account\/status/);
  assert.match(script, /\/api\/account\/signup/);
  assert.match(script, /\/api\/account\/login/);
});

test('Electron main-window access modal renders the redesigned account flows', () => {
  assert.match(desktopOverlay, /className = 'fdqr-card fdqr-access'/);
  assert.match(desktopOverlay, /className = 'fdqr-identity'/);
  assert.match(desktopOverlay, /className = 'fdqr-account-panel'/);
  assert.match(desktopOverlay, /Seu controlador\./);
  assert.match(desktopOverlay, /Sua licença\./);
  assert.match(desktopOverlay, /CONFIRMAR SENHA/);
  assert.match(desktopOverlay, /Esqueci minha senha/);
  assert.match(desktopOverlay, /Voltar para o login/);
  assert.match(desktopOverlay, /\/api\/account\/login/);
  assert.match(desktopOverlay, /\/api\/account\/signup/);
  assert.match(desktopOverlay, /\/api\/account\/reset-password/);
  assert.match(desktopOverlay, /\/api\/account\/reset-password\/verify/);
  assert.match(desktopOverlay, /\/api\/account\/reset-password\/confirm/);
  assert.match(desktopOverlay, /\/api\/account\/trial\/start/);
  assert.match(desktopOverlay, /Verifique sua caixa de entrada \(e spam\) para continuar\./);
  assert.match(desktopOverlay, /\/error sending recovery email\/i\.test\(message\)/);
  assert.match(
    desktopOverlay,
    /Não foi possível enviar o e-mail de recuperação\. Tente novamente mais tarde\./,
  );
});

test('QR modal warns that the local connection is not encrypted', () => {
  assert.match(desktopOverlay, /Use uma rede confiável: a conexão local não é criptografada/);
  assert.doesNotMatch(desktopOverlay, /Conexão não é privada/);
});

test('only the Electron window injects the update modal', () => {
  const root = path.join(__dirname, '..');
  const client = fs.readFileSync(path.join(root, 'client/index.html'), 'utf8');
  const admin = fs.readFileSync(path.join(root, 'client/admin/index.html'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  assert.doesNotMatch(client, /<script[^>]+update-modal\.js/);
  assert.doesNotMatch(admin, /<script[^>]+update-modal\.js/);
  assert.match(main, /client', 'update-modal\.js'/);
  assert.match(main, /executeJavaScript\(updateModal\)/);
});
