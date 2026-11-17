'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const { createMidiManager, splitMessages, NO_MIDI_PORT, VIRTUAL_OUTPUT_INDEX } = require('../bridge/midi-manager.cjs');

function createFakeMidi({ outputNames = ['MIDI Out'], inputNames = ['MIDI In'] } = {}) {
  const state = { outputNames, inputNames, outputs: [], inputs: [], sent: [], openedOutputs: [], openedInputs: [], failOutput: false };
  class Output {
    constructor() { state.outputs.push(this); }
    getPortCount() { return state.outputNames.length; }
    getPortName(index) { return state.outputNames[index]; }
    openPort(index) { state.openedOutputs.push(index); if (state.failOutput) throw new Error('device unavailable'); this.opened = true; }
    openVirtualPort(name) { this.virtualName = name; this.opened = true; }
    sendMessage(message) { state.sent.push([...message]); }
    closePort() { this.closed = true; }
  }
  class Input extends EventEmitter {
    constructor() { super(); state.inputs.push(this); }
    getPortCount() { return state.inputNames.length; }
    getPortName(index) { return state.inputNames[index]; }
    openPort(index) { state.openedInputs.push(index); this.opened = true; }
    ignoreTypes(...args) { this.ignoredTypes = args; }
    closePort() { this.closed = true; }
  }
  return { midi: { Output, Input }, state };
}

test('splits concatenated Note On, Note Off, CC and channel-specific Program Change messages', () => {
  const bytes = [0x90, 60, 127, 0x82, 60, 0, 0xb3, 7, 99, 0xc4, 10];
  assert.deepEqual(splitMessages(bytes), [
    [0x90, 60, 127],
    [0x82, 60, 0],
    [0xb3, 7, 99],
    [0xc4, 10],
  ]);
});

test('preserves Note On, Note Off, CC and Program Change status nibbles on all 16 MIDI channels', () => {
  for (let channel = 0; channel < 16; channel += 1) {
    const noteOn = 0x90 | channel;
    const noteOff = 0x80 | channel;
    const controlChange = 0xb0 | channel;
    const programChange = 0xc0 | channel;
    assert.deepEqual(splitMessages([noteOn, 60, 100, noteOff, 60, 0, controlChange, 7, 99, programChange, 11]), [
      [noteOn, 60, 100], [noteOff, 60, 0], [controlChange, 7, 99], [programChange, 11],
    ]);
  }
});

test('ignores leading data bytes and drops an incomplete trailing MIDI message', () => {
  assert.deepEqual(splitMessages([1, 2, 0x90, 64]), []);
  assert.deepEqual(splitMessages([0x90, 64, 100, 0x80, 64]), [[0x90, 64, 100]]);
});

test('selects physical ports, routes input messages and reopens a different output', () => {
  const { midi, state } = createFakeMidi();
  const received = [];
  const manager = createMidiManager({ midi, platform: 'linux', broadcast: (message) => received.push(message) });
  assert.deepEqual(manager.listPorts().outputs, [{ index: 0, name: 'MIDI Out' }]);
  assert.deepEqual(manager.selectPorts(0, 0), { outputIndex: 0, inputIndex: 0 });
  const input = state.inputs.at(-1);
  assert.deepEqual(input.ignoredTypes, [false, false, false]);
  input.emit('message', 0.001, [0x91, 60, 110]);
  assert.deepEqual(received, [{ type: 'midi', direction: 'in', data: [0x91, 60, 110] }]);

  manager.send([0x90, 60, 127, 0x80, 60, 0]);
  assert.deepEqual(state.sent, [[0x90, 60, 127], [0x80, 60, 0]]);
  assert.deepEqual(manager.selectPorts(NO_MIDI_PORT, NO_MIDI_PORT), { outputIndex: -1, inputIndex: -1 });
  assert.equal(state.outputs.at(-1).closed, true);
  assert.equal(manager.hasOutput(), false);
  assert.throws(() => manager.send([0x90, 1, 1]), /Selecione uma saída MIDI/);
});

test('rejects unavailable or invalid negative MIDI port indices', () => {
  const { midi } = createFakeMidi();
  const manager = createMidiManager({ midi, platform: 'win32' });
  assert.throws(() => manager.selectPorts(99, NO_MIDI_PORT), /saída MIDI selecionada não está mais disponível/);
  assert.throws(() => manager.selectPorts(NO_MIDI_PORT, -2), /entrada MIDI selecionada não está mais disponível/);
  assert.throws(() => manager.selectPorts(-2, NO_MIDI_PORT), /saída MIDI selecionada não está mais disponível/);
});

test('handles device removal between port listing and selection without opening stale index', () => {
  const { midi, state } = createFakeMidi();
  const manager = createMidiManager({ midi, platform: 'win32' });
  manager.listPorts();
  state.outputNames = [];
  assert.throws(() => manager.selectPorts(0, NO_MIDI_PORT), /não está mais disponível/);
  assert.deepEqual(state.openedOutputs, []);
});

test('rolls back partially opened MIDI ports after driver error and permits clean reconnection', () => {
  const { midi, state } = createFakeMidi();
  const manager = createMidiManager({ midi, platform: 'win32' });
  state.failOutput = true;
  assert.throws(() => manager.selectPorts(0, NO_MIDI_PORT), /device unavailable/);
  assert.equal(state.outputs.at(-1).closed, true);
  assert.equal(manager.selectedOutputIndex, NO_MIDI_PORT);
  assert.equal(manager.hasOutput(), false);
  state.failOutput = false;
  assert.deepEqual(manager.selectPorts(0, NO_MIDI_PORT), { outputIndex: 0, inputIndex: NO_MIDI_PORT });
  assert.equal(manager.hasOutput(), true);
});

test('creates and preserves macOS virtual output, reports duplicate FaderDeck ports, and closes it on shutdown', () => {
  const { midi, state } = createFakeMidi({ outputNames: ['FaderDeck IAC'] });
  const manager = createMidiManager({ midi, platform: 'darwin' });
  assert.equal(manager.initializeVirtualOutput(), true);
  assert.equal(manager.selectedOutputIndex, VIRTUAL_OUTPUT_INDEX);
  const ports = manager.listPorts();
  assert.equal(ports.outputs[0].index, VIRTUAL_OUTPUT_INDEX);
  assert.equal(ports.warnings.length, 1);
  manager.selectPorts(VIRTUAL_OUTPUT_INDEX, NO_MIDI_PORT);
  manager.send([0xb0, 10, 127]);
  assert.deepEqual(state.sent, [[0xb0, 10, 127]]);
  const virtual = manager.virtualOutput;
  manager.shutdown();
  assert.equal(virtual.closed, true);
  assert.equal(manager.hasOutput(), false);
  assert.equal(manager.initializeVirtualOutput(), true);
});

test('reports MIDI discovery failures and recovers from failed virtual port initialization', () => {
  const brokenDriver = {
    Output: class {
      openVirtualPort() { throw new Error('driver indisponível'); }
      getPortCount() { throw new Error('sem backend MIDI'); }
      closePort() { this.closed = true; }
    },
    Input: class { getPortCount() { return 0; } closePort() {} },
  };
  const manager = createMidiManager({ midi: brokenDriver, platform: 'darwin' });
  assert.throws(() => manager.initializeVirtualOutput(), /driver indisponível/);
  assert.equal(manager.virtualOutput, null);
  assert.equal(manager.hasOutput(), false);
  assert.match(manager.listPorts().warning, /sem backend MIDI/);
});
