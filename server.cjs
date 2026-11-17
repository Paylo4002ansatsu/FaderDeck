'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createMidiManager } = require('./bridge/midi-manager.cjs');
const { createLayoutPersistence } = require('./bridge/layout-persistence.cjs');
const { createHttpHandler } = require('./bridge/http-router.cjs');
const { createWebSocketGateway } = require('./bridge/websocket-gateway.cjs');
const { createTokenStore } = require('./bridge/token-store.cjs');
const { networkAddresses, networkAddress } = require('./bridge/network-addresses.cjs');

const configuredPort = Number(process.env.FADER_BRIDGE_PORT);
const BASE_PORT =
  Number.isInteger(configuredPort) && configuredPort >= 1 && configuredPort <= 65535
    ? configuredPort
    : 8787;
let PORT = BASE_PORT;
const HOST = '0.0.0.0';
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
let layout = { version: 0, pages: [], activePageId: '' };
let layoutInitialized = layout.pages.length > 0;
let layoutSeedOwner = null;
let initialized = false;
let shutdownPromise = null;

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
  return `http://${networkAddress()}:${PORT}/?bridgeToken=${encodeURIComponent(TOKEN)}`;
}

const server = http.createServer(
  createHttpHandler({
    clientDir: CLIENT_DIR,
    getPort: () => PORT,
    getToken: () => TOKEN,
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
  }),
);
connectionManager = createWebSocketGateway({
  server,
  getToken: () => TOKEN,
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
});

server.on('error', (error) => {
  if (error.code !== 'EADDRINUSE') console.error(`Erro no servidor: ${error.message}`);
});

async function start(startPort = BASE_PORT) {
  if (server.listening) return PORT;
  initialize();
  const firstPort =
    Number.isInteger(startPort) && startPort >= 0 && startPort <= 65535 ? startPort : BASE_PORT;
  const lastPort = firstPort === 0 ? 0 : Math.min(firstPort + 20, 65535);
  let lastError;

  for (let candidate = firstPort; candidate <= lastPort; candidate += 1) {
    PORT = candidate;
    try {
      await new Promise((resolve, reject) => {
        const onError = (error) => {
          server.off('listening', onListening);
          reject(error);
        };
        const onListening = () => {
          server.off('error', onError);
          PORT = server.address().port;
          resolve();
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(candidate, HOST);
      });
      console.log(`FaderDeck · ponte ativa na porta ${PORT}.`);
      if (require.main === module) {
        const ip = networkAddress();
        console.log(`Painel no celular: ${mobileUrl()}`);
        console.log(`Admin / QR:        http://127.0.0.1:${PORT}/bridge`);
        console.log(`Código de pareamento: ${TOKEN}`);
        console.log(`Endereço de rede: ${ip}. Escaneie o QR na página de administração.`);
        console.log('Pressione Ctrl+C para encerrar.\n');
      }
      return PORT;
    } catch (error) {
      if (error.code !== 'EADDRINUSE') throw error;
      lastError = error;
    }
  }

  throw new Error(`Nenhuma porta livre encontrada a partir de ${firstPort}.`, { cause: lastError });
}

async function shutdown() {
  if (shutdownPromise) return shutdownPromise;
  shutdownPromise = (async () => {
    if (initialized && layoutPersistence) {
      try {
        await layoutPersistence.flush(() => layout);
      } catch (error) {
        console.error('Falha ao salvar layout ao encerrar:', error.message);
      }
    }
    midiManager?.shutdown();
    connectionManager.terminateAll();
    if (!server.listening) return;
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        server.closeAllConnections?.();
        resolve();
      }, 1500);
      timer.unref?.();
      try {
        server.close(() => {
          clearTimeout(timer);
          resolve();
        });
      } catch {
        clearTimeout(timer);
        resolve();
      }
    });
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
  start,
  stop: shutdown,
  shutdown,
  rotateToken,
  getToken: () => TOKEN,
  getPort: () => PORT,
  dataDir: DATA_DIR,
  networkAddress,
  networkAddresses,
  mobileUrl,
  hasMidi: () => Boolean(midiManager?.hasOutput()),
};
