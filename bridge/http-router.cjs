'use strict';

const fs = require('node:fs');
const path = require('node:path');
const QRCode = require('qrcode');
const { parseRequestTarget } = require('../server-utils.cjs');
const {
  safeEqual,
  isLoopbackRequest,
  isSameOriginLocalAdminRequest,
  hasLocalHostHeader,
} = require('./auth.cjs');
const defaultSupabaseClient = require('./supabase-client.cjs');
const { isNetworkFailure } = require('./entitlement-service.cjs');

const MAX_REQUEST_BODY_BYTES = 16 * 1024;
const TOKEN_ROTATION_HEADER = 'x-faderdeck-admin';
const TOKEN_ROTATION_HEADER_VALUE = 'rotate-token';
const ENTITLEMENT_REQUIRED = 'ENTITLEMENT_REQUIRED';

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    let settled = false;
    request.on('data', (chunk) => {
      if (settled) return;
      totalBytes += chunk.length;
      if (totalBytes > MAX_REQUEST_BODY_BYTES) {
        settled = true;
        const error = new Error('Corpo da requisição excede o limite de 16 KB.');
        error.statusCode = 413;
        reject(error);
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (settled) return;
      if (totalBytes === 0) {
        settled = true;
        resolve({});
        return;
      }
      try {
        settled = true;
        resolve(JSON.parse(Buffer.concat(chunks, totalBytes).toString('utf8')));
      } catch {
        settled = true;
        const error = new Error('JSON inválido.');
        error.statusCode = 400;
        reject(error);
      }
    });
    request.on('aborted', () => {
      if (settled) return;
      settled = true;
      const error = new Error('A requisição foi interrompida.');
      error.statusCode = 400;
      reject(error);
    });
    request.on('error', (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return (
    {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.mp4': 'video/mp4',
      '.webmanifest': 'application/manifest+json',
      '.json': 'application/json; charset=utf-8',
      '.woff2': 'font/woff2',
      '.woff': 'font/woff',
      '.ico': 'image/x-icon',
    }[ext] || 'application/octet-stream'
  );
}

function maskEmail(email) {
  if (typeof email !== 'string') return null;
  const separator = email.lastIndexOf('@');
  if (separator <= 0 || separator === email.length - 1) return null;
  const localPart = email.slice(0, separator);
  const domain = email.slice(separator + 1);
  const lastDot = domain.lastIndexOf('.');
  const visibleDomain = lastDot > 0 ? domain.slice(0, lastDot) : domain;
  const suffix = lastDot > 0 ? domain.slice(lastDot) : '';
  return `${localPart[0]}***@${visibleDomain[0]}***${suffix}`;
}

function safeEntitlement(entitlement) {
  return {
    allowed: entitlement?.allowed === true,
    kind: ['license', 'trial', 'none'].includes(entitlement?.kind) ? entitlement.kind : 'none',
    expires_at: typeof entitlement?.expires_at === 'string' ? entitlement.expires_at : null,
    server_time: typeof entitlement?.server_time === 'string' ? entitlement.server_time : null,
    offline_grace_until:
      typeof entitlement?.offline_grace_until === 'string' ? entitlement.offline_grace_until : null,
    ...(typeof entitlement?.plan_code === 'string' ? { plan_code: entitlement.plan_code } : {}),
    ...(Number.isInteger(entitlement?.max_devices) ? { max_devices: entitlement.max_devices } : {}),
    ...(typeof entitlement?.code === 'string' ? { code: entitlement.code } : {}),
    ...(typeof entitlement?.message === 'string' ? { message: entitlement.message } : {}),
    ...(Array.isArray(entitlement?.devices)
      ? {
          devices: entitlement.devices.map((device) => ({
            machineId: device.machineId,
            name: device.name,
            last_seen_at: device.last_seen_at,
          })),
        }
      : {}),
  };
}

function createHttpHandler({
  clientDir,
  getPort,
  getSecurePort,
  getToken,
  getCaCertificate,
  getCaFingerprint,
  getLayout,
  setLayout,
  setLayoutInitialized,
  getMidiManager,
  getConnectionStatus,
  networkAddress,
  networkAddresses,
  rotateToken,
  persistLayout,
  broadcast,
  entitlementService,
  supabaseClient = defaultSupabaseClient,
  updateChecker = { checkForUpdate: async () => null },
}) {
  const activeEntitlementService = entitlementService ?? {
    async getEntitlement() {
      return { allowed: false };
    },
  };

  async function getAccountStatus() {
    const supabaseConfigured = supabaseClient.isSupabaseConfigured();
    let session;
    let offlineEntitlement;
    if (supabaseConfigured) {
      try {
        session = await supabaseClient.getCurrentSession();
      } catch (error) {
        if (!isNetworkFailure(error)) throw error;
        offlineEntitlement = await activeEntitlementService.getEntitlement();
        session = activeEntitlementService.getOfflineSession?.();
      }
    }

    if (!session && !offlineEntitlement) await activeEntitlementService.clearCache?.();
    const entitlement = session
      ? safeEntitlement(offlineEntitlement || (await activeEntitlementService.getEntitlement()))
      : safeEntitlement(null);
    let trialStatus = null;

    if (session && !offlineEntitlement) {
      try {
        trialStatus = await supabaseClient.invokeEdgeFunction('trial-status');
      } catch (error) {
        console.warn('Não foi possível atualizar o estado do trial:', error.message);
      }
    }

    const trialAvailable = Boolean(
      session && trialStatus && !trialStatus.trial && entitlement.kind !== 'license',
    );

    return {
      session: {
        authenticated: Boolean(session),
        email: session ? maskEmail(session.user?.email) : null,
      },
      entitlement,
      supabase_configured: supabaseConfigured,
      trial_available: trialAvailable,
      trial_expired: trialStatus?.expired === true,
    };
  }

  async function activateTrialIfAvailable() {
    const status = await getAccountStatus();
    if (!status.trial_available) return status;

    try {
      await activeEntitlementService.startTrial();
    } catch (error) {
      await activeEntitlementService.clearCache?.();
      console.error('Não foi possível iniciar o trial após autenticar:', error);
      throw error;
    }

    return getAccountStatus();
  }

  async function requireEntitlement(response) {
    let entitlement;
    try {
      entitlement = await activeEntitlementService.getEntitlement();
    } catch (error) {
      console.error('Não foi possível validar o entitlement antes do acesso MIDI:', error);
    }
    if (entitlement?.allowed === true) return true;

    sendJson(response, 403, {
      code: entitlement?.code === 'DEVICE_LIMIT_REACHED' ? entitlement.code : ENTITLEMENT_REQUIRED,
      error:
        entitlement?.message ||
        'É necessária uma licença ativa ou um teste gratuito válido para usar MIDI.',
    });
    return false;
  }

  return async (request, response) => {
    let requestUrl;
    let pathname;
    try {
      ({ url: requestUrl, pathname } = parseRequestTarget(
        request.url || '/',
        request.headers.host || 'localhost',
      ));
    } catch {
      return sendJson(response, 400, { error: 'Requisição inválida.' });
    }

    try {
      if (
        (pathname === '/bridge' ||
          pathname === '/bridge/' ||
          pathname.startsWith('/api/ports') ||
          pathname === '/api/status' ||
          pathname === '/api/pairing' ||
          pathname === '/api/token/regenerate' ||
          pathname.startsWith('/api/account/')) &&
        !isLoopbackRequest(request)
      ) {
        return sendJson(response, 403, {
          error: 'Abra a administração no próprio computador em http://127.0.0.1:8787/bridge.',
        });
      }
      if (pathname === '/api/auth') {
        response.setHeader('Access-Control-Allow-Origin', '*');
        response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        response.setHeader('Access-Control-Allow-Private-Network', 'true');
        if (request.method === 'OPTIONS') {
          response.writeHead(204);
          response.end();
          return;
        }
        if (request.method !== 'GET')
          return sendJson(response, 405, { error: 'Método não permitido.' });
        if (
          !(
            !request.socket.encrypted &&
            isLoopbackRequest(request) &&
            isSameOriginLocalAdminRequest(request, getPort())
          ) &&
          !safeEqual(requestUrl.searchParams.get('token') || '', getToken())
        )
          return sendJson(response, 401, { error: 'Código de pareamento inválido.' });
        return sendJson(response, 200, { authorized: true });
      }
      if (pathname === '/api/account/status') {
        if (request.method !== 'GET')
          return sendJson(response, 405, { error: 'Método não permitido.' });
        return sendJson(response, 200, await getAccountStatus());
      }
      if (pathname === '/api/app/update-status') {
        if (request.method !== 'GET')
          return sendJson(response, 405, { error: 'Método não permitido.' });
        let updateStatus;
        try {
          updateStatus = await updateChecker.checkForUpdate();
        } catch {
          updateStatus = null;
        }
        return sendJson(response, 200, {
          currentVersion: updateStatus?.currentVersion ?? null,
          latestVersion: updateStatus?.latestVersion ?? null,
          updateAvailable: updateStatus?.updateAvailable === true,
          mandatory: updateStatus?.mandatory === true,
          releaseNotes: updateStatus?.releaseNotes ?? '',
          downloadUrl: updateStatus?.downloadUrl ?? null,
          releaseUrl: updateStatus?.releaseUrl ?? null,
        });
      }
      if (
        pathname === '/api/account/login' ||
        pathname === '/api/account/signup' ||
        pathname === '/api/account/reset-password' ||
        pathname === '/api/account/password-reset' ||
        pathname === '/api/account/reset-password/verify' ||
        pathname === '/api/account/reset-password/confirm' ||
        pathname === '/api/account/devices/remove' ||
        pathname === '/api/account/devices/activate' ||
        pathname === '/api/account/trial/start' ||
        pathname === '/api/account/logout'
      ) {
        if (request.method !== 'POST')
          return sendJson(response, 405, { error: 'Método não permitido.' });
        if (!isSameOriginLocalAdminRequest(request, getPort())) {
          return sendJson(response, 403, {
            error: 'Ação permitida somente nesta interface local.',
          });
        }
        const supabaseConfigured = supabaseClient.isSupabaseConfigured();
        if (!supabaseConfigured && pathname !== '/api/account/logout') {
          return sendJson(response, 503, {
            code: 'SUPABASE_NOT_CONFIGURED',
            error: 'A autenticação comercial ainda não está configurada neste ambiente.',
          });
        }

        if (pathname === '/api/account/devices/remove') {
          const session = await supabaseClient.getCurrentSession();
          if (!session) {
            return sendJson(response, 401, {
              code: 'AUTHENTICATION_REQUIRED',
              error: 'Entre na sua conta antes de remover um dispositivo.',
            });
          }

          const body = await readBody(request);
          if (
            !body ||
            typeof body.machineId !== 'string' ||
            !/^[0-9a-f]{64}$/.test(body.machineId)
          ) {
            return sendJson(response, 400, { error: 'Identificador de dispositivo inválido.' });
          }
          await supabaseClient.invokeEdgeFunction('device-remove', { machineId: body.machineId });
          await activeEntitlementService.clearCache?.();
          return sendJson(response, 200, await getAccountStatus());
        }

        if (pathname === '/api/account/devices/activate') {
          const session = await supabaseClient.getCurrentSession();
          if (!session) {
            return sendJson(response, 401, {
              code: 'AUTHENTICATION_REQUIRED',
              error: 'Entre na sua conta antes de reativar este dispositivo.',
            });
          }
          await activeEntitlementService.reactivateDevice();
          return sendJson(response, 200, await getAccountStatus());
        }

        if (pathname === '/api/account/login') {
          const body = await readBody(request);
          if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return sendJson(response, 400, { error: 'O corpo deve ser um objeto JSON.' });
          }
          if (typeof body.email !== 'string' || typeof body.password !== 'string') {
            return sendJson(response, 400, { error: 'E-mail e senha são obrigatórios.' });
          }
          try {
            await supabaseClient.signInWithEmailAndPassword(
              body.email.trim(),
              body.password,
              body.remember !== false,
            );
          } catch (error) {
            return sendJson(response, error.status === 429 ? 429 : 401, {
              code: 'AUTHENTICATION_FAILED',
              error:
                error.status === 429
                  ? 'Muitas tentativas. Aguarde antes de tentar novamente.'
                  : 'Não foi possível autenticar com esse e-mail e senha.',
            });
          }
          try {
            return sendJson(response, 200, await activateTrialIfAvailable());
          } catch {
            return sendJson(response, 502, {
              code: 'TRIAL_ACTIVATION_FAILED',
              error:
                'Sua conta foi autenticada, mas não foi possível iniciar o teste grátis. Tente novamente.',
            });
          }
        }

        if (pathname === '/api/account/signup') {
          const body = await readBody(request);
          if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return sendJson(response, 400, { error: 'O corpo deve ser um objeto JSON.' });
          }
          if (
            typeof body.email !== 'string' ||
            !body.email.trim() ||
            typeof body.password !== 'string' ||
            !body.password
          ) {
            return sendJson(response, 400, { error: 'E-mail e senha são obrigatórios.' });
          }

          let signup;
          try {
            signup = await supabaseClient.signUpWithEmailAndPassword(
              body.email.trim(),
              body.password,
            );
          } catch (error) {
            return sendJson(response, error.status === 429 ? 429 : 400, {
              code: 'SIGNUP_FAILED',
              error:
                error.status === 429
                  ? 'Muitas tentativas. Aguarde antes de tentar novamente.'
                  : 'Não foi possível criar a conta. Verifique os dados e tente novamente.',
            });
          }

          if (signup?.session) {
            try {
              await activeEntitlementService.startTrial();
            } catch (error) {
              await activeEntitlementService.clearCache?.();
              console.error('Conta criada, mas não foi possível iniciar o trial:', error);
              return sendJson(response, 502, {
                code: 'TRIAL_ACTIVATION_FAILED',
                error:
                  'Sua conta foi criada, mas não foi possível iniciar o teste grátis. Entre novamente e tente iniciar o teste.',
              });
            }
          }

          const status = await getAccountStatus();
          return sendJson(response, 200, {
            ...status,
            confirmation_required: !signup?.session,
            message: signup?.session
              ? null
              : 'Enviamos um link de confirmação para o seu e-mail. Confirme o cadastro antes de entrar.',
          });
        }

        if (
          pathname === '/api/account/reset-password' ||
          pathname === '/api/account/password-reset'
        ) {
          const body = await readBody(request);
          if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return sendJson(response, 400, { error: 'O corpo deve ser um objeto JSON.' });
          }
          if (typeof body.email !== 'string' || !body.email.trim()) {
            return sendJson(response, 400, { error: 'Informe um e-mail válido.' });
          }
          try {
            await supabaseClient.resetPasswordForEmail(body.email.trim());
          } catch (error) {
            const upstreamStatus =
              Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599
                ? error.status
                : 502;
            return sendJson(response, upstreamStatus, {
              code: error?.code || 'PASSWORD_RESET_FAILED',
              error:
                error?.message ||
                'Não foi possível solicitar a recuperação de senha. Tente novamente.',
              status: error?.status ?? null,
            });
          }
          return sendJson(response, 200, {
            sent: true,
            message: 'Se o e-mail estiver cadastrado, enviaremos um código de recuperação.',
          });
        }

        if (pathname === '/api/account/reset-password/verify') {
          const body = await readBody(request);
          if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return sendJson(response, 400, { error: 'O corpo deve ser um objeto JSON.' });
          }
          if (typeof body.email !== 'string' || !body.email.trim()) {
            return sendJson(response, 400, { error: 'Informe um e-mail válido.' });
          }
          if (typeof body.code !== 'string' || !/^\d{6,8}$/.test(body.code)) {
            return sendJson(response, 400, {
              error: 'O código de verificação deve conter de 6 a 8 dígitos numéricos.',
            });
          }
          try {
            await supabaseClient.verifyOtp({
              email: body.email.trim(),
              token: body.code,
              type: 'recovery',
            });
          } catch (error) {
            const invalid = error.status === 400 || error.status === 401 || error.status === 403;
            return sendJson(response, invalid ? 401 : error.status === 429 ? 429 : 502, {
              code: invalid ? 'INVALID_CODE' : 'PASSWORD_VERIFY_FAILED',
              error: invalid
                ? 'Código inválido ou expirado. Verifique o e-mail e tente novamente.'
                : error.status === 429
                  ? 'Muitas tentativas. Aguarde antes de tentar novamente.'
                  : 'Não foi possível validar o código. Tente novamente.',
            });
          }
          return sendJson(response, 200, {
            verified: true,
            message: 'Código verificado com sucesso. Você pode agora definir uma nova senha.',
          });
        }

        if (pathname === '/api/account/reset-password/confirm') {
          const body = await readBody(request);
          if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return sendJson(response, 400, { error: 'O corpo deve ser um objeto JSON.' });
          }
          if (typeof body.password !== 'string' || body.password.length < 8) {
            return sendJson(response, 400, {
              error: 'A senha deve ter no mínimo 8 caracteres.',
            });
          }
          try {
            await supabaseClient.updateUser({ password: body.password });
            await supabaseClient.signOutRecovery();
          } catch (error) {
            return sendJson(response, error.status === 429 ? 429 : 400, {
              code: 'PASSWORD_UPDATE_FAILED',
              error: error?.message || 'Não foi possível atualizar a senha. Tente novamente.',
            });
          }
          return sendJson(response, 200, {
            updated: true,
            message: 'Senha alterada com sucesso! Entre com sua nova senha.',
          });
        }

        if (pathname === '/api/account/trial/start') {
          const session = await supabaseClient.getCurrentSession();
          if (!session) {
            return sendJson(response, 401, {
              code: 'AUTHENTICATION_REQUIRED',
              error: 'Entre na sua conta antes de iniciar o teste.',
            });
          }
          await activeEntitlementService.startTrial();
          return sendJson(response, 200, await getAccountStatus());
        }

        try {
          if (supabaseConfigured) await supabaseClient.signOut();
        } finally {
          await activeEntitlementService.clearCache?.();
        }
        return sendJson(response, 200, await getAccountStatus());
      }
      if (request.method === 'POST' && pathname === '/api/token/regenerate') {
        if (
          !isSameOriginLocalAdminRequest(request, getPort()) ||
          request.headers[TOKEN_ROTATION_HEADER] !== TOKEN_ROTATION_HEADER_VALUE
        ) {
          return sendJson(response, 403, {
            error:
              'A rotação do código só é permitida pela página /bridge aberta neste computador.',
          });
        }
        rotateToken();
        return sendJson(response, 200, { tokenUpdated: true });
      }
      if (request.method === 'GET' && pathname === '/api/pairing') {
        const originAllowed =
          request.headers.origin === undefined || isSameOriginLocalAdminRequest(request, getPort());
        if (
          !isLoopbackRequest(request) ||
          !hasLocalHostHeader(request, getPort()) ||
          !originAllowed
        )
          return sendJson(response, 403, {
            error: 'O pareamento só pode ser consultado neste computador.',
          });
        const ip = networkAddress();
        const port = getSecurePort();
        const url = `https://${ip}:${port}/#bridgeToken=${encodeURIComponent(getToken())}`;
        const qr = await QRCode.toDataURL(url, {
          margin: 1,
          width: 280,
          color: { dark: '#13201f', light: '#ffffff' },
        });
        return sendJson(response, 200, {
          url,
          qr,
          ip,
          port,
          caFingerprint: getCaFingerprint(),
          addresses: networkAddresses().map((item) => ({
            address: item.address,
            interface: item.interface,
          })),
        });
      }
      if (request.method === 'GET' && pathname === '/bridge-ca.crt') {
        if (!isLoopbackRequest(request) || !hasLocalHostHeader(request, getPort()))
          return sendJson(response, 403, {
            error: 'O certificado CA só pode ser baixado neste computador.',
          });
        response.writeHead(200, {
          'Content-Type': 'application/x-x509-ca-cert',
          'Content-Disposition': 'attachment; filename="faderdeck-local-ca.crt"',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        });
        response.end(getCaCertificate());
        return;
      }
      if (request.method === 'GET' && pathname === '/api/status') {
        return sendJson(response, 200, getConnectionStatus());
      }
      if (request.method === 'GET' && pathname === '/api/ports') {
        const midiManager = getMidiManager();
        const ports = midiManager.listPorts();
        return sendJson(response, 200, {
          ...ports,
          outputIndex: midiManager.selectedOutputIndex,
          inputIndex: midiManager.selectedInputIndex,
        });
      }
      if (pathname === '/api/layout' && request.method === 'GET') {
        if (
          !(
            !request.socket.encrypted &&
            isLoopbackRequest(request) &&
            isSameOriginLocalAdminRequest(request, getPort())
          ) &&
          !safeEqual(requestUrl.searchParams.get('token') || '', getToken())
        )
          return sendJson(response, 401, { error: 'Código de pareamento inválido.' });
        return sendJson(response, 200, getLayout());
      }
      if (pathname === '/api/layout' && request.method === 'PUT') {
        const body = await readBody(request);
        if (
          !(
            !request.socket.encrypted &&
            isLoopbackRequest(request) &&
            isSameOriginLocalAdminRequest(request, getPort())
          ) &&
          !safeEqual(String(body.token || ''), getToken())
        )
          return sendJson(response, 401, { error: 'Código de pareamento inválido.' });
        const currentLayout = getLayout();
        if (
          !body.layout ||
          !Array.isArray(body.layout.pages) ||
          body.layout.pages.length === 0 ||
          body.layout.pages.length > 100
        )
          return sendJson(response, 400, { error: 'Layout inválido.' });
        const nextLayout = {
          version: Math.max(currentLayout.version + 1, Number(body.layout.version) || 0),
          pages: body.layout.pages,
          activePageId: String(body.layout.activePageId || body.layout.pages[0]?.id || ''),
        };
        setLayout(nextLayout);
        setLayoutInitialized(true);
        await persistLayout();
        broadcast({ type: 'layout', layout: nextLayout });
        return sendJson(response, 200, nextLayout);
      }
      if (request.method === 'POST' && pathname === '/api/ports/select') {
        const body = await readBody(request);
        if (!safeEqual(String(body.token || ''), getToken()))
          return sendJson(response, 401, { error: 'Código de pareamento inválido.' });
        if (!(await requireEntitlement(response))) return;
        const midiManager = getMidiManager();
        const selected = midiManager.selectPorts(Number(body.outputIndex), Number(body.inputIndex));
        const ports = midiManager.listPorts();
        return sendJson(response, 200, {
          ...selected,
          outputName: ports.outputs.find((port) => port.index === selected.outputIndex)?.name || '',
          inputName: ports.inputs.find((port) => port.index === selected.inputIndex)?.name || '',
        });
      }
      if (request.method !== 'GET')
        return sendJson(response, 405, { error: 'Método não permitido.' });
      if (pathname === '/bridge' || pathname === '/bridge/') {
        const adminPage = path.join(clientDir, 'admin', 'index.html');
        response.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        });
        response.end(fs.readFileSync(adminPage));
        return;
      }

      const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      let filePath = path.resolve(clientDir, relative);
      if (!filePath.startsWith(clientDir + path.sep) && filePath !== clientDir)
        return sendJson(response, 403, { error: 'Caminho inválido.' });
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        if (!path.extname(relative)) filePath = path.join(clientDir, 'index.html');
        else return sendJson(response, 404, { error: 'Arquivo não encontrado.' });
      }
      response.writeHead(200, {
        'Content-Type': contentType(filePath),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      fs.createReadStream(filePath).pipe(response);
    } catch (error) {
      const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
      if (statusCode >= 500) console.error('Falha ao tratar requisição:', error);
      if (!response.headersSent)
        sendJson(response, statusCode, {
          error: statusCode >= 500 ? 'Erro interno.' : error?.message || 'Requisição inválida.',
        });
      else response.destroy();
    }
  };
}

module.exports = { createHttpHandler, sendJson, readBody, contentType };
