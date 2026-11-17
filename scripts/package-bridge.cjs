'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const scriptPath = path.join(__dirname, 'package-bridge.py');
const candidates = process.platform === 'win32'
  ? [['python', []], ['py', ['-3']]]
  : [['python3', []], ['python', []]];

for (const [executable, prefixArgs] of candidates) {
  const result = spawnSync(executable, [...prefixArgs, scriptPath], { stdio: 'inherit' });
  if (!result.error) process.exit(result.status ?? 1);
}

console.error('Python 3 não foi encontrado. Instale Python 3 para gerar o pacote da ponte.');
process.exitCode = 1;
