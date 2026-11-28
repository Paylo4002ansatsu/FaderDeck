'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { spawnSync } = require('node:child_process');

const bootstrap = fs.readFileSync(path.join(__dirname, '../client/bridge-bootstrap.js'), 'utf8');

function runBootstrap(address) {
  const initialUrl = new URL(address);
  const location = {
    pathname: initialUrl.pathname,
    search: initialUrl.search,
    hash: initialUrl.hash,
  };
  const replacements = [];
  const window = {
    location,
    history: {
      replaceState(_state, _title, nextAddress) {
        replacements.push(nextAddress);
        const nextUrl = new URL(nextAddress, initialUrl.origin);
        location.pathname = nextUrl.pathname;
        location.search = nextUrl.search;
        location.hash = nextUrl.hash;
      },
    },
  };
  vm.runInNewContext(bootstrap, { URLSearchParams, window });
  return { location, replacements };
}

test('moves the pairing code from the URL fragment into app state without retaining the fragment', () => {
  const { location, replacements } = runBootstrap(
    'http://192.168.10.24:8788/#bridgeToken=demo-code',
  );
  assert.equal(new URLSearchParams(location.search).get('bridgeToken'), 'demo-code');
  assert.equal(location.hash, '');
  assert.equal(replacements.length, 1);
});

test('prefers the latest QR fragment over an older query code', () => {
  const { location, replacements } = runBootstrap(
    'http://192.168.10.24:8788/?bridgeToken=query-code#bridgeToken=fragment-code',
  );
  assert.equal(new URLSearchParams(location.search).get('bridgeToken'), 'fragment-code');
  assert.equal(location.hash, '');
  assert.equal(replacements.length, 1);
});

test('distributed controller bundle has valid JavaScript syntax', () => {
  const bundle = path.join(__dirname, '../client/assets/index-RrCrAh5A.js');
  const result = spawnSync(process.execPath, ['--check', bundle], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});
