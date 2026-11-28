'use strict';

const { splitMessages } = require('./midi-manager.cjs');

function updateControls(layout, updates) {
  const byId = new Map(updates.map((update) => [update.id, update]));
  const applied = [];
  const pages = layout.pages.map((page) => {
    if (!Array.isArray(page?.controls)) return page;
    return {
      ...page,
      controls: page.controls.map((control) => {
        if (!control || typeof control !== 'object') return control;
        const update = byId.get(control.id);
        if (!update) return control;
        if (
          control.kind === 'fader' &&
          typeof update.value === 'number' &&
          Number.isFinite(update.value) &&
          update.value >= 0 &&
          update.value <= 1
        ) {
          applied.push({ id: control.id, value: update.value });
          return { ...control, value: update.value };
        }
        if (control.kind === 'pad' && typeof update.active === 'boolean') {
          applied.push({ id: control.id, active: update.active });
          return { ...control, active: update.active };
        }
        return control;
      }),
    };
  });
  return { layout: applied.length ? { ...layout, pages } : layout, updates: applied };
}

function updatesFromMidi(layout, bytes) {
  let current = layout;
  const changed = new Map();
  for (const message of splitMessages(bytes)) {
    const [status, first, second] = message;
    const kind = status & 0xf0;
    const channel = (status & 0x0f) + 1;
    const updates = [];
    for (const page of current.pages) {
      if (!Array.isArray(page?.controls)) continue;
      for (const control of page.controls) {
        if (!control || control.channel !== channel) continue;
        if (control.kind === 'pad') {
          if (
            control.message === 'note' &&
            control.number === first &&
            (kind === 0x80 || kind === 0x90)
          )
            updates.push({ id: control.id, active: kind === 0x90 && second > 0 });
          if (control.message === 'cc' && kind === 0xb0 && control.number === first)
            updates.push({ id: control.id, active: second > 0 });
          continue;
        }
        if (control.kind !== 'fader') continue;
        let value;
        if (control.message === 'pitch' && kind === 0xe0) value = first + (second << 7);
        else if (control.message === 'aftertouch' && kind === 0xd0) value = first;
        else if (control.message === 'cc' && kind === 0xb0) {
          if (control.resolution === 14) {
            const cc = Math.min(31, Math.max(0, control.cc));
            const normalized =
              control.curve === 'log'
                ? (Math.exp(control.value * Math.log(128)) - 1) / 127
                : control.value;
            const previous = Math.round(control.min + normalized * (control.max - control.min));
            if (first === cc) value = (second << 7) | (previous & 127);
            else if (first === cc + 32) value = (previous & 16256) | second;
          } else if (first === control.cc) value = second;
        }
        if (value === undefined) continue;
        const ratio = Math.min(1, Math.max(0, (value - control.min) / (control.max - control.min)));
        updates.push({
          id: control.id,
          value: control.curve === 'log' ? Math.log(1 + ratio * 127) / Math.log(128) : ratio,
        });
      }
    }
    const result = updateControls(current, updates);
    current = result.layout;
    for (const update of result.updates) changed.set(update.id, update);
  }
  return { layout: current, updates: [...changed.values()] };
}

module.exports = { updateControls, updatesFromMidi };
