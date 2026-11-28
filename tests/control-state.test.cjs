'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { updateControls, updatesFromMidi } = require('../bridge/control-state.cjs');

const makeLayout = () => ({
  pages: [
    {
      id: 'page',
      controls: [
        {
          id: 'fader',
          kind: 'fader',
          channel: 1,
          message: 'cc',
          cc: 7,
          resolution: 7,
          min: 0,
          max: 127,
          value: 0,
          curve: 'linear',
        },
        {
          id: 'precise',
          kind: 'fader',
          channel: 2,
          message: 'cc',
          cc: 3,
          resolution: 14,
          min: 0,
          max: 16383,
          value: 0,
          curve: 'linear',
        },
        {
          id: 'pitch',
          kind: 'fader',
          channel: 3,
          message: 'pitch',
          min: 0,
          max: 16383,
          value: 0,
          curve: 'log',
        },
        { id: 'pad', kind: 'pad', channel: 1, message: 'note', number: 36, active: false },
      ],
    },
  ],
});

test('applies validated control changes without altering layout order or other controls', () => {
  const layout = makeLayout();
  const result = updateControls(layout, [
    { id: 'fader', value: 0.75 },
    { id: 'pad', active: true },
    { id: 'precise', value: 3 },
  ]);
  assert.deepEqual(result.updates, [
    { id: 'fader', value: 0.75 },
    { id: 'pad', active: true },
  ]);
  assert.equal(result.layout.pages[0].controls[0].value, 0.75);
  assert.equal(result.layout.pages[0].controls[3].active, true);
  assert.equal(layout.pages[0].controls[0].value, 0);
});

test('maps DAW MIDI feedback for faders, 14-bit controls, curves and note-off pads', () => {
  let result = updatesFromMidi(
    makeLayout(),
    [0xb0, 7, 64, 0xb1, 3, 64, 0xb1, 35, 3, 0xe2, 0, 64, 0x90, 36, 100],
  );
  assert.deepEqual(result.updates.slice(0, 2), [
    { id: 'fader', value: 64 / 127 },
    { id: 'precise', value: 8195 / 16383 },
  ]);
  assert.ok(
    Math.abs(result.updates[2].value - Math.log(1 + (8192 / 16383) * 127) / Math.log(128)) < 1e-10,
  );
  assert.deepEqual(result.updates[3], { id: 'pad', active: true });
  result = updatesFromMidi(result.layout, [0x90, 36, 0]);
  assert.deepEqual(result.updates, [{ id: 'pad', active: false }]);
  assert.deepEqual(updatesFromMidi(result.layout, [0xb5, 7, 127]).updates, []);
});
