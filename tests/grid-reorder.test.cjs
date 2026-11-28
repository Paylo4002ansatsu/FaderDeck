'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const window = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../client/grid-reorder.js'), 'utf8'), {
  window,
});
const { reorder, destination } = window.fdGridReorder;
const controls = [
  { id: 'a', kind: 'fader' },
  { id: 'pad', kind: 'pad' },
  { id: 'b', kind: 'fader' },
  { id: 'c', kind: 'fader' },
];
const ids = (items) => Array.from(items, (item) => item.id);

test('reordena faders mantendo pads em seus lugares e preservando os objetos', () => {
  const result = reorder(controls, 'a', 'c');
  assert.deepEqual(ids(result), ['b', 'pad', 'c', 'a']);
  assert.equal(result[1], controls[1]);
  assert.equal(result[3], controls[0]);
  assert.equal(reorder(controls, 'a', 'pad'), controls);
  assert.equal(reorder(controls, 'missing', 'c'), controls);
});

test('destino final acompanha movimentos sucessivos e retorno à posição original', () => {
  let preview = reorder(controls, 'a', 'c');
  const drag = { id: 'a', originalControls: controls, controls: preview };
  assert.equal(destination(drag), 'c');
  preview = reorder(preview, 'a', 'b');
  drag.controls = preview;
  assert.deepEqual(ids(preview), ids(controls));
  assert.equal(destination(drag), 'a');
});
