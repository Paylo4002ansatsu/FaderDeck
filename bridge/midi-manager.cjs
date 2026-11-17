'use strict';

const NO_MIDI_PORT = -1;
const VIRTUAL_OUTPUT_INDEX = -2;

function splitMessages(bytes) {
  const output = [];
  for (let index = 0; index < bytes.length;) {
    const status = bytes[index];
    if (status < 0x80) {
      index += 1;
      continue;
    }
    const kind = status & 0xf0;
    const length = kind === 0xc0 || kind === 0xd0 ? 2 : 3;
    if (index + length > bytes.length) break;
    output.push(bytes.slice(index, index + length));
    index += length;
  }
  return output;
}

function createMidiManager({ midi, platform = process.platform, broadcast = () => {} }) {
  if (!midi?.Output || !midi?.Input)
    throw new TypeError('A MIDI driver with Output and Input constructors is required.');

  let virtualOutput = null;
  let midiOutput = null;
  let midiInput = null;
  let selectedOutputIndex = NO_MIDI_PORT;
  let selectedInputIndex = NO_MIDI_PORT;

  function initializeVirtualOutput() {
    if (platform !== 'darwin' || virtualOutput) return false;
    try {
      virtualOutput = new midi.Output();
      virtualOutput.openVirtualPort('FaderDeck');
      midiOutput = virtualOutput;
      selectedOutputIndex = VIRTUAL_OUTPUT_INDEX;
      return true;
    } catch (error) {
      try {
        virtualOutput?.closePort();
      } catch {}
      virtualOutput = null;
      midiOutput = null;
      selectedOutputIndex = NO_MIDI_PORT;
      throw error;
    }
  }

  function listPorts() {
    let output = null;
    let input = null;
    let warning = '';
    const outputs = [];
    const inputs = [];
    try {
      output = new midi.Output();
      input = new midi.Input();
      for (let index = 0; index < output.getPortCount(); index += 1)
        outputs.push({ index, name: output.getPortName(index) });
      if (platform === 'darwin' && virtualOutput)
        outputs.unshift({ index: VIRTUAL_OUTPUT_INDEX, name: 'FaderDeck (virtual)' });
      for (let index = 0; index < input.getPortCount(); index += 1)
        inputs.push({ index, name: input.getPortName(index) });
    } catch (error) {
      warning = error.message || 'Não foi possível inicializar MIDI neste computador.';
    } finally {
      try {
        if (output !== virtualOutput) output?.closePort();
      } catch {}
      try {
        input?.closePort();
      } catch {}
    }
    const warnings =
      virtualOutput &&
      outputs.some(
        (port) => port.index !== VIRTUAL_OUTPUT_INDEX && /\bFaderDeck\b/i.test(port.name),
      )
        ? [
            'Há outra porta MIDI chamada FaderDeck (possivelmente IAC). Use somente uma das duas para evitar duplicidade.',
          ]
        : [];
    return { outputs, inputs, warnings, ...(warning ? { warning } : {}) };
  }

  function closePorts() {
    if (midiInput) {
      try {
        midiInput.removeAllListeners('message');
        midiInput.closePort();
      } catch {}
      midiInput = null;
    }
    if (midiOutput && midiOutput !== virtualOutput) {
      try {
        midiOutput.closePort();
      } catch {}
      midiOutput = null;
    }
    if (virtualOutput && selectedOutputIndex === VIRTUAL_OUTPUT_INDEX) midiOutput = virtualOutput;
  }

  function selectPorts(outputIndex, inputIndex) {
    const ports = listPorts();
    const outIndex = Number.isInteger(outputIndex) ? outputIndex : NO_MIDI_PORT;
    const inIndex = Number.isInteger(inputIndex) ? inputIndex : NO_MIDI_PORT;
    const validVirtualOutput = outIndex === VIRTUAL_OUTPUT_INDEX && Boolean(virtualOutput);
    const validPhysicalOutput =
      outIndex >= 0 && ports.outputs.some((port) => port.index === outIndex);
    if (outIndex !== NO_MIDI_PORT && !validVirtualOutput && !validPhysicalOutput)
      throw new Error('A saída MIDI selecionada não está mais disponível.');
    if (
      inIndex !== NO_MIDI_PORT &&
      (inIndex < 0 || !ports.inputs.some((port) => port.index === inIndex))
    )
      throw new Error('A entrada MIDI selecionada não está mais disponível.');
    closePorts();
    selectedOutputIndex = outIndex;
    selectedInputIndex = inIndex;
    try {
      if (selectedOutputIndex === VIRTUAL_OUTPUT_INDEX && virtualOutput) midiOutput = virtualOutput;
      else if (selectedOutputIndex >= 0) {
        midiOutput = new midi.Output();
        midiOutput.openPort(selectedOutputIndex);
      } else midiOutput = null;
      if (selectedInputIndex >= 0) {
        midiInput = new midi.Input();
        midiInput.ignoreTypes(false, false, false);
        midiInput.on('message', (_deltaTime, message) => {
          broadcast({ type: 'midi', direction: 'in', data: Array.from(message) });
        });
        midiInput.openPort(selectedInputIndex);
      }
    } catch (error) {
      closePorts();
      selectedOutputIndex = NO_MIDI_PORT;
      selectedInputIndex = NO_MIDI_PORT;
      midiOutput = null;
      midiInput = null;
      throw error;
    }
    return { outputIndex: selectedOutputIndex, inputIndex: selectedInputIndex };
  }

  function send(bytes) {
    if (!midiOutput || selectedOutputIndex === NO_MIDI_PORT)
      throw new Error('Selecione uma saída MIDI na tela da ponte.');
    for (const message of splitMessages(bytes)) midiOutput.sendMessage(message);
  }

  function shutdown() {
    closePorts();
    if (virtualOutput) {
      try {
        virtualOutput.closePort();
      } catch {}
      virtualOutput = null;
      midiOutput = null;
    }
    selectedOutputIndex = NO_MIDI_PORT;
    selectedInputIndex = NO_MIDI_PORT;
  }

  return {
    initializeVirtualOutput,
    listPorts,
    closePorts,
    selectPorts,
    send,
    shutdown,
    hasOutput: () => Boolean(midiOutput),
    get selectedOutputIndex() {
      return selectedOutputIndex;
    },
    get selectedInputIndex() {
      return selectedInputIndex;
    },
    get virtualOutput() {
      return virtualOutput;
    },
  };
}

module.exports = { NO_MIDI_PORT, VIRTUAL_OUTPUT_INDEX, splitMessages, createMidiManager };
