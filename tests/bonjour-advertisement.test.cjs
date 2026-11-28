'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const { advertiseLanService } = require('../bridge/bonjour-advertisement.cjs');

test('advertises the LAN port and stops the helper on shutdown', () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => {
    child.killed = true;
  };
  let command;
  const stop = advertiseLanService(8788, {
    spawnProcess: (file, args) => {
      command = { file, args };
      return child;
    },
  });
  assert.deepEqual(command, {
    file: '/usr/bin/dns-sd',
    args: ['-R', 'FaderDeck', '_faderdeck._tcp', 'local.', '8788'],
  });
  stop();
  assert.equal(child.killed, true);
  child.emit('close', 0);
});
