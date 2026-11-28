'use strict';

const { spawn } = require('node:child_process');

function advertiseLanService(port, { spawnProcess = spawn, retryDelayMs = 15000 } = {}) {
  let processHandle;
  let retryTimer;
  let stopped = false;

  function start() {
    if (stopped) return;
    processHandle = spawnProcess(
      '/usr/bin/dns-sd',
      ['-R', 'FaderDeck', '_faderdeck._tcp', 'local.', String(port)],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    processHandle.stdout.on('data', (data) => {
      const message = data.toString().trim();
      if (/\berror\b|\bfailed\b/i.test(message)) console.warn('Bonjour:', message);
    });
    processHandle.stderr.on('data', (data) => {
      console.warn('Bonjour:', data.toString().trim());
    });
    processHandle.on('error', (error) => {
      console.warn('Não foi possível anunciar o FaderDeck na rede local:', error.message);
    });
    processHandle.on('close', (code) => {
      processHandle = null;
      if (stopped) return;
      console.warn(`Anúncio Bonjour encerrado (${code}); tentando novamente.`);
      retryTimer = setTimeout(start, retryDelayMs);
      retryTimer.unref();
    });
  }

  start();
  return () => {
    stopped = true;
    clearTimeout(retryTimer);
    processHandle?.kill();
  };
}

module.exports = { advertiseLanService };
