'use strict';
// FaderDeck para macOS: processo principal do Electron.
// Sobe a ponte (server.cjs) dentro do app, fica na barra de menus e oferece o QR de pareamento
// dentro do próprio painel (botão "Conectar celular", atalho ⌘K, menu da barra e menu do app).
const { app, BrowserWindow, Tray, Menu, nativeImage, dialog, shell, clipboard } = require('electron');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

const BASE_PORT = 8787;
const AUTO_QR_DELAY_MS = 5000; // se nenhum celular conectar nesse tempo, mostra o QR sozinho
let bridge = null;
let port = BASE_PORT;
let tray = null;
let panelWindow = null;
let panelLoaded = Promise.resolve();
let remoteClients = 0;
let quitting = false;
let lastMenuKey = '';
let autoQrDone = false;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => { if (bridge) openPanel(); });
  app.whenReady().then(boot).catch((error) => {
    dialog.showErrorBox('FaderDeck', `Não foi possível iniciar: ${error.message}`);
    app.exit(1);
  });
}

// Mantém o app vivo na barra de menus quando as janelas fecham.
app.on('window-all-closed', () => {});
app.on('activate', () => { if (bridge) openPanel(); });
app.on('before-quit', (event) => {
  if (quitting || !bridge) return;
  event.preventDefault();
  quitting = true;
  Promise.resolve(bridge.shutdown()).catch(() => {}).finally(() => app.exit(0));
});

function findFreePort(start) {
  return new Promise((resolve, reject) => {
    const attempt = (candidate, tries) => {
      if (tries > 20) return reject(new Error('Nenhuma porta livre encontrada a partir de 8787.'));
      const probe = net.createServer();
      probe.once('error', () => attempt(candidate + 1, tries + 1));
      probe.once('listening', () => probe.close(() => resolve(candidate)));
      probe.listen(candidate, '0.0.0.0');
    };
    attempt(start, 0);
  });
}

async function boot() {
  const dataDir = app.getPath('userData'); // ~/Library/Application Support/FaderDeck
  fs.mkdirSync(dataDir, { recursive: true });
  const firstRun = !fs.existsSync(path.join(dataDir, '.faderdeck-token'));
  if (firstRun) await offerImport(dataDir, true);

  port = await findFreePort(BASE_PORT);
  process.env.FADERDECK_DATA_DIR = dataDir;
  process.env.FADER_BRIDGE_PORT = String(port);
  try {
    bridge = require('./server.cjs');
  } catch (error) {
    dialog.showErrorBox('FaderDeck', `Não foi possível iniciar a ponte MIDI.\n\n${error.message}`);
    app.exit(1);
    return;
  }

  buildAppMenu();
  createTray();
  setInterval(refreshStatus, 3000);
  await refreshStatus();

  const openedAtLogin = app.getLoginItemSettings().wasOpenedAtLogin;
  if (openedAtLogin) return; // iniciou com o Mac: fica só na barra de menus
  await openPanel();
  if (firstRun) { autoQrDone = true; await showQr(); }
  else setTimeout(autoShowQrIfNeeded, AUTO_QR_DELAY_MS);
}

// Mostra o QR sozinho, uma vez por abertura, se nenhum celular reconectou.
async function autoShowQrIfNeeded() {
  if (autoQrDone) return;
  autoQrDone = true;
  await refreshStatus();
  if (remoteClients === 0 && panelWindow && !panelWindow.isDestroyed() && panelWindow.isVisible()) showQr();
}

// ---------- janela do painel ----------
function overlaySource() {
  try { return fs.readFileSync(path.join(__dirname, 'assets', 'qr-overlay.js'), 'utf8'); } catch { return ''; }
}

function openPanel() {
  if (panelWindow && !panelWindow.isDestroyed()) { panelWindow.show(); panelWindow.focus(); return panelLoaded; }
  panelWindow = new BrowserWindow({
    width: 1180, height: 780, minWidth: 720, minHeight: 480,
    title: 'FaderDeck', backgroundColor: '#13201f',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  const contents = panelWindow.webContents;
  panelLoaded = new Promise((resolve) => {
    contents.on('did-finish-load', async () => {
      try { await contents.executeJavaScript(overlaySource()); } catch {}
      resolve();
    });
  });
  panelWindow.loadURL(`http://127.0.0.1:${port}/`);
  panelWindow.on('closed', () => { panelWindow = null; });
  return panelLoaded;
}

async function showQr() {
  await openPanel();
  if (!panelWindow || panelWindow.isDestroyed()) return;
  panelWindow.show();
  panelWindow.focus();
  try { await panelWindow.webContents.executeJavaScript('window.__fdShowQr && window.__fdShowQr()'); } catch {}
}

// ---------- menu do app (barra superior do macOS) ----------
function buildAppMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'FaderDeck',
      submenu: [
        { role: 'about', label: 'Sobre o FaderDeck' },
        { type: 'separator' },
        { label: 'Conectar celular (QR)…', accelerator: 'CmdOrCtrl+K', click: showQr },
        { label: 'Portas MIDI e administração…', click: () => shell.openExternal(`http://127.0.0.1:${port}/bridge`) },
        { type: 'separator' },
        { role: 'hide', label: 'Ocultar FaderDeck' },
        { role: 'hideOthers', label: 'Ocultar outros' },
        { role: 'unhide', label: 'Mostrar todos' },
        { type: 'separator' },
        { label: 'Sair do FaderDeck', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() },
      ],
    },
    { role: 'editMenu', label: 'Editar' },
    {
      label: 'Visualizar',
      submenu: [
        { role: 'reload', label: 'Recarregar' },
        { role: 'togglefullscreen', label: 'Tela cheia' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Tamanho real' },
        { role: 'zoomIn', label: 'Aumentar' },
        { role: 'zoomOut', label: 'Diminuir' },
      ],
    },
    { role: 'windowMenu', label: 'Janela' },
  ]));
}

// ---------- barra de menus (ícone) ----------
function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'trayTemplate.png'));
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip('FaderDeck');
  buildTrayMenu();
}

function buildTrayMenu() {
  const statusLine = remoteClients > 0 ? `Ponte ativa · ${remoteClients} aparelho(s) conectado(s)` : 'Ponte ativa · nenhum celular conectado';
  const midiLine = bridge && bridge.hasMidi() ? 'Porta MIDI: FaderDeck (pronta)' : 'Porta MIDI: escolha uma saída em “Portas MIDI”';
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: statusLine, enabled: false },
    { label: midiLine, enabled: false },
    { type: 'separator' },
    { label: 'Conectar celular (QR)…', click: showQr },
    { label: 'Abrir painel', click: openPanel },
    { label: 'Copiar link do celular', click: () => clipboard.writeText(bridge.mobileUrl()) },
    { label: 'Portas MIDI e administração…', click: () => shell.openExternal(`http://127.0.0.1:${port}/bridge`) },
    { type: 'separator' },
    { label: 'Renovar código de pareamento…', click: renewToken },
    { label: 'Importar dados da ponte antiga…', click: () => offerImport(app.getPath('userData'), false) },
    { label: 'Abrir ao iniciar o Mac', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked, openAsHidden: true }) },
    { label: 'Mostrar pasta de dados', click: () => shell.openPath(app.getPath('userData')) },
    { type: 'separator' },
    { label: 'Sair do FaderDeck', click: () => app.quit() },
  ]));
  tray.setTitle(remoteClients > 0 ? ` ${remoteClients}` : '');
}

async function refreshStatus() {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/status`, { cache: 'no-store' });
    const data = await response.json();
    remoteClients = Number(data.remoteClients) || 0;
  } catch { remoteClients = 0; }
  const key = `${remoteClients}|${bridge && bridge.hasMidi()}`;
  if (tray && key !== lastMenuKey) { lastMenuKey = key; buildTrayMenu(); }
}

async function renewToken() {
  const answer = await dialog.showMessageBox({
    type: 'question', buttons: ['Gerar novo código', 'Cancelar'], defaultId: 1, cancelId: 1,
    message: 'Gerar um novo código de pareamento?',
    detail: 'Todos os celulares conectados precisarão escanear o QR novamente.',
  });
  if (answer.response !== 0) return;
  bridge.rotateToken();
  showQr();
}

// ---------- importar dados da ponte antiga ----------
async function offerImport(dataDir, isFirstRun) {
  if (isFirstRun) {
    const ask = await dialog.showMessageBox({
      type: 'question', buttons: ['Escolher pasta…', 'Começar do zero'], defaultId: 1, cancelId: 1,
      message: 'Você já usava a ponte FaderDeck (fader-bridge) neste Mac?',
      detail: 'Se sim, escolha a pasta antiga para trazer o painel e o código de pareamento. Seus celulares continuam conectados sem novo QR.',
    });
    if (ask.response !== 0) return;
  }
  const picked = await dialog.showOpenDialog({
    title: 'Escolha a pasta antiga do fader-bridge', properties: ['openDirectory'],
    message: 'A pasta que contém faderdeck-layout.json e .faderdeck-token (arquivos ocultos: Cmd+Shift+. no Finder).',
  });
  if (picked.canceled || !picked.filePaths[0]) return;
  const source = picked.filePaths[0];
  const names = ['faderdeck-layout.json', '.faderdeck-token'];
  const found = names.filter((name) => fs.existsSync(path.join(source, name)));
  if (found.length === 0) {
    await dialog.showMessageBox({ type: 'warning', message: 'Não encontrei os arquivos nessa pasta.', detail: 'Procure por faderdeck-layout.json e .faderdeck-token (ocultos).' });
    return;
  }
  if (bridge) await bridge.shutdown(); // grava o estado atual antes de substituir
  for (const name of found) {
    const target = path.join(dataDir, name);
    if (fs.existsSync(target)) fs.copyFileSync(target, `${target}.bak`);
    fs.copyFileSync(path.join(source, name), target);
    if (name === '.faderdeck-token') { try { fs.chmodSync(target, 0o600); } catch {} }
  }
  if (!isFirstRun) {
    await dialog.showMessageBox({ message: 'Dados importados.', detail: 'O FaderDeck vai reiniciar.' });
    app.relaunch();
    app.exit(0);
  }
}
