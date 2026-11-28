'use strict';

const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const { createMidiManager } = require('./bridge/midi-manager.cjs');
const { createLayoutPersistence } = require('./bridge/layout-persistence.cjs');
const { createHttpHandler } = require('./bridge/http-router.cjs');
const { createWebSocketGateway } = require('./bridge/websocket-gateway.cjs');
const { createTokenStore } = require('./bridge/token-store.cjs');
const { networkAddresses, networkAddress } = require('./bridge/network-addresses.cjs');
const { createTlsIdentity } = require('./bridge/tls-identity.cjs');
const { createEntitlementService } = require('./bridge/entitlement-service.cjs');
const { createSecureStorage } = require('./bridge/secure-storage.cjs');
const supabaseClient = require('./bridge/supabase-client.cjs');
const { createUpdateChecker } = require('./bridge/update-checker.cjs');

const configuredPort = Number(process.env.FADER_BRIDGE_PORT);
const BASE_PORT =
  Number.isInteger(configuredPort) && configuredPort >= 1 && configuredPort <= 65535
    ? configuredPort
    : 8787;
const configuredSecurePort = Number(process.env.FADER_BRIDGE_HTTPS_PORT);
const BASE_SECURE_PORT =
  Number.isInteger(configuredSecurePort) &&
  configuredSecurePort >= 0 &&
  configuredSecurePort <= 65535
    ? configuredSecurePort
    : 8788;
let PORT = BASE_PORT;
let SECURE_PORT = BASE_SECURE_PORT;
const HOST = '127.0.0.1';
const SECURE_HOST = '0.0.0.0';
const DATA_DIR = process.env.FADERDECK_DATA_DIR || __dirname;
const CLIENT_DIR = path.join(__dirname, 'client');
if (!fs.existsSync(path.join(CLIENT_DIR, 'index.html')))
  console.warn('Painel não encontrado: use o fader-bridge.zip gerado pelo build');
let TOKEN_FILE = '';
let TOKEN = '';
let tokenStore = null;
let layoutPersistence = null;
let midi;
let midiManager = null;
let connectionManager = null;
let secureServer = null;
let tlsIdentity = null;
let layout = { version: 0, pages: [], activePageId: '' };
let layoutInitialized = layout.pages.length > 0;
let layoutSeedOwner = null;
let initialized = false;
let shutdownPromise = null;
let entitlementRefreshTimer = null;
let secureStorage;
if (process.versions.electron) {
  try {
    secureStorage = createSecureStorage(DATA_DIR, require('electron').safeStorage);
    supabaseClient.configureAuthStorage(secureStorage);
  } catch (error) {
    console.warn(
      'Armazenamento seguro indisponível; acesso offline após reiniciar desativado:',
      error.message,
    );
  }
}
const entitlementService = createEntitlementService({ storage: secureStorage });
const updateChecker = createUpdateChecker();

function initialize() {
  if (initialized) return;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  TOKEN_FILE = path.join(DATA_DIR, '.faderdeck-token');
  tokenStore = createTokenStore(TOKEN_FILE, {
    onSaveError: (error) =>
      console.warn(
        'Não foi possível salvar .faderdeck-token; o código mudará no próximo reinício:',
        error.message,
      ),
  });
  TOKEN = tokenStore.loadOrCreate();
  layoutPersistence = createLayoutPersistence({
    filePath: path.join(DATA_DIR, 'faderdeck-layout.json'),
    onError: (prefix, error) => console.error(prefix, error.message),
  });
  layoutPersistence.initializeWriter();
  layout = layoutPersistence.load(layout);
  layoutInitialized = layout.pages.length > 0;

  try {
    midi = require('@julusian/midi');
    midiManager = createMidiManager({ midi, platform: process.platform, broadcast });
    if (process.platform === 'darwin') {
      try {
        if (midiManager.initializeVirtualOutput())
          console.log('Porta MIDI virtual FaderDeck criada automaticamente.');
      } catch (error) {
        console.warn('Não foi possível criar a porta virtual FaderDeck:', error.message);
      }
    }
  } catch (error) {
    console.error(
      '\nNão foi possível carregar @julusian/midi. Rode npm install e confira os pré-requisitos nativos do seu sistema.\n',
      error.message,
    );
    throw error;
  }
  tlsIdentity = createTlsIdentity(
    DATA_DIR,
    networkAddresses().map((entry) => entry.address),
  );
  secureServer = https.createServer({ key: tlsIdentity.key, cert: tlsIdentity.cert }, httpHandler);
  secureServer.on('error', logServerError);
  connectionManager = createWebSocketGateway({
    servers: [server, secureServer],
    getToken: () => TOKEN,
    getLocalPort: () => PORT,
    layout: {
      get: () => layout,
      set: (nextLayout) => {
        layout = nextLayout;
      },
      isInitialized: () => layoutInitialized,
      setInitialized: (value) => {
        layoutInitialized = value;
      },
      getSeedOwner: () => layoutSeedOwner,
      setSeedOwner: (socket) => {
        layoutSeedOwner = socket;
      },
      payload: layoutPayload,
    },
    scheduleLayoutSave,
    midiManager: {
      send: (bytes) => midiManager.send(bytes),
      hasOutput: () => midiManager.hasOutput(),
    },
    entitlementService,
  });
  initialized = true;
}

function broadcast(payload) {
  connectionManager?.broadcast(payload);
}

function layoutPayload() {
  return { type: 'layout', layout };
}

function persistLayout() {
  if (!layoutPersistence)
    return Promise.reject(new Error('O armazenamento do layout ainda não foi inicializado.'));
  return layoutPersistence.persist(layout);
}

function scheduleLayoutSave() {
  layoutPersistence.schedule(() => layout);
}

function rotateToken() {
  const nextToken = tokenStore.rotate();
  TOKEN = nextToken;
  connectionManager?.closeAll(4001, 'Código renovado');
  return nextToken;
}

function mobileUrl() {
  return `https://${networkAddress()}:${SECURE_PORT}/#bridgeToken=${encodeURIComponent(TOKEN)}`;
}

function logServerError(error) {
  if (error.code !== 'EADDRINUSE') console.error(`Erro no servidor: ${error.message}`);
}

const httpHandler = createHttpHandler({
  clientDir: CLIENT_DIR,
  getPort: () => PORT,
  getSecurePort: () => SECURE_PORT,
  getToken: () => TOKEN,
  getCaCertificate: () => tlsIdentity?.caCertificate || '',
  getCaFingerprint: () => tlsIdentity?.fingerprint || '',
  getLayout: () => layout,
  setLayout: (nextLayout) => {
    layout = nextLayout;
  },
  setLayoutInitialized: (value) => {
    layoutInitialized = value;
  },
  getMidiManager: () => midiManager,
  getConnectionStatus: () => connectionManager.getStatus(),
  networkAddress,
  networkAddresses,
  rotateToken,
  persistLayout,
  broadcast,
  entitlementService,
  supabaseClient,
  updateChecker,
});
const server = http.createServer(httpHandler);
server.on('error', logServerError);

function listenWithFallback(listener, firstPort, host) {
  const lastPort = firstPort === 0 ? 0 : Math.min(firstPort + 20, 65535);
  let lastError;
  return (async () => {
    for (let candidate = firstPort; candidate <= lastPort; candidate += 1) {
      try {
        return await new Promise((resolve, reject) => {
          const onError = (error) => {
            listener.off('listening', onListening);
            reject(error);
          };
          const onListening = () => {
            listener.off('error', onError);
            resolve(listener.address().port);
          };
          listener.once('error', onError);
          listener.once('listening', onListening);
          listener.listen(candidate, host);
        });
      } catch (error) {
        if (error.code !== 'EADDRINUSE') throw error;
        lastError = error;
      }
    }
    throw new Error(`Nenhuma porta livre encontrada a partir de ${firstPort}.`, {
      cause: lastError,
    });
  })();
}

function closeServer(listener) {
  if (!listener?.listening) return Promise.resolve();
  return new Promise((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      listener.closeAllConnections?.();
      finish();
    }, 1500);
    timer.unref?.();
    try {
      listener.close(finish);
    } catch {
      finish();
    }
  });
}

async function start(startPort = BASE_PORT) {
  if (server.listening && secureServer?.listening) return PORT;
  initialize();
  const firstPort =
    Number.isInteger(startPort) && startPort >= 0 && startPort <= 65535 ? startPort : BASE_PORT;
  PORT = await listenWithFallback(server, firstPort, HOST);
  try {
    const firstSecurePort =
      BASE_SECURE_PORT === BASE_PORT && PORT < 65535 ? PORT + 1 : BASE_SECURE_PORT;
    SECURE_PORT = await listenWithFallback(secureServer, firstSecurePort, SECURE_HOST);
  } catch (error) {
    await closeServer(server);
    PORT = BASE_PORT;
    throw error;
  }

  entitlementRefreshTimer = setInterval(() => {
    entitlementService.getEntitlement().catch((error) => {
      console.error('Não foi possível revalidar a licença:', error);
    });
  }, 30 * 1000);
  entitlementRefreshTimer.unref();
  console.log(`FaderDeck · ponte local ativa na porta ${PORT}; HTTPS LAN na ${SECURE_PORT}.`);
  if (require.main === module) {
    const ip = networkAddress();
    console.log(`Painel HTTPS na rede: https://${ip}:${SECURE_PORT}/`);
    console.log(`Admin / QR:        http://127.0.0.1:${PORT}/bridge`);
    console.log(`Endereço de rede: ${ip}. Instale o certificado CA antes de conectar.`);
    console.log('Pressione Ctrl+C para encerrar.\n');
  }
  return PORT;
}

async function shutdown() {
  if (shutdownPromise) return shutdownPromise;
  shutdownPromise = (async () => {
    clearInterval(entitlementRefreshTimer);
    entitlementRefreshTimer = null;
    if (initialized && layoutPersistence) {
      try {
        await layoutPersistence.flush(() => layout);
      } catch (error) {
        console.error('Falha ao salvar layout ao encerrar:', error.message);
      }
    }
    midiManager?.shutdown();
    connectionManager?.terminateAll();
    await Promise.all([closeServer(server), closeServer(secureServer)]);
  })();
  try {
    await shutdownPromise;
  } finally {
    shutdownPromise = null;
  }
}

if (require.main === module) {
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    shutdown()
      .then(() => {
        process.exitCode = 0;
      })
      .catch((error) => {
        console.error(`Falha ao encerrar a ponte: ${error.message}`);
        process.exitCode = 1;
      });
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  start().catch((error) => {
    console.error(`Não foi possível iniciar a ponte: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  server,
  getHttpsServer: () => secureServer,
  start,
  stop: shutdown,
  shutdown,
  rotateToken,
  getToken: () => TOKEN,
  getPort: () => PORT,
  getSecurePort: () => SECURE_PORT,
  dataDir: DATA_DIR,
  networkAddress,
  networkAddresses,
  mobileUrl,
  hasMidi: () => Boolean(midiManager?.hasOutput()),
};
