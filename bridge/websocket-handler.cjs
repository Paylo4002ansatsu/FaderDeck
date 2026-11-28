'use strict';

const { updateControls } = require('./control-state.cjs');
const { validateMidiBytes } = require('./midi-manager.cjs');

function attachWebSocketHandlers(
  wss,
  {
    getLayout,
    setLayout,
    isLayoutInitialized,
    setLayoutInitialized,
    getLayoutSeedOwner,
    setLayoutSeedOwner,
    layoutPayload,
    scheduleLayoutSave,
    broadcast,
    midiManager,
    entitlementService,
  },
) {
  const activeEntitlementService = entitlementService ?? {
    async getCachedEntitlement() {
      return { allowed: false };
    },
  };

  wss.on('connection', (socket) => {
    let midiQueue = Promise.resolve();
    if (!isLayoutInitialized() && !getLayoutSeedOwner()) setLayoutSeedOwner(socket);
    socket.send(JSON.stringify({ type: 'ready' }));
    socket.send(JSON.stringify(layoutPayload()));
    socket.on('close', () => {
      if (!isLayoutInitialized() && socket === getLayoutSeedOwner()) setLayoutSeedOwner(null);
    });
    socket.on('message', (raw) => {
      if (!socket.authorized) return;
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (message.type === 'ping') {
        socket.send(JSON.stringify({ type: 'pong', sentAt: Number(message.sentAt) || 0 }));
        return;
      }
      if (
        message.type === 'layout' &&
        message.layout &&
        Array.isArray(message.layout.pages) &&
        message.layout.pages.length > 0 &&
        message.layout.pages.length <= 100
      ) {
        if (!isLayoutInitialized() && socket !== getLayoutSeedOwner()) {
          socket.send(JSON.stringify(layoutPayload()));
          return;
        }
        const current = getLayout();
        const next = message.layout;
        setLayout({
          version: Math.max(current.version + 1, Number(next.version) || 0),
          pages: next.pages,
          activePageId: String(next.activePageId || next.pages[0]?.id || ''),
        });
        setLayoutInitialized(true);
        scheduleLayoutSave();
        broadcast({
          ...layoutPayload(),
          sourceId: typeof message.sourceId === 'string' ? message.sourceId.slice(0, 100) : '',
        });
        return;
      }
      if (message.type !== 'midi') return;
      if (!Array.isArray(message.data) || message.data.length > 256) {
        socket.send(JSON.stringify({ type: 'error', message: 'Mensagem MIDI inválida.' }));
        return;
      }
      midiQueue = midiQueue
        .then(() => forwardMidi(message))
        .catch(() => console.error('Não foi possível processar a mensagem MIDI.'));
    });

    async function forwardMidi(message) {
      const readEntitlement =
        activeEntitlementService.getCachedEntitlement || activeEntitlementService.getEntitlement;
      let entitlement;
      try {
        entitlement = await readEntitlement.call(activeEntitlementService);
      } catch {
        console.error('Não foi possível verificar o entitlement antes de encaminhar MIDI.');
      }
      if (!socket.authorized) return;
      if (entitlement?.allowed !== true) {
        socket.send(
          JSON.stringify({
            type: 'error',
            code:
              entitlement?.code === 'DEVICE_LIMIT_REACHED'
                ? entitlement.code
                : 'ENTITLEMENT_REQUIRED',
            message:
              entitlement?.message ||
              'É necessária uma licença ativa ou um teste gratuito válido para usar MIDI.',
          }),
        );
        return;
      }
      if (!midiManager.hasOutput()) {
        socket.send(
          JSON.stringify({ type: 'error', message: 'Selecione uma saída MIDI na tela da ponte.' }),
        );
        return;
      }
      const bytes = message.data;
      try {
        validateMidiBytes(bytes);
        midiManager.send(bytes);
        const sourceId = typeof message.sourceId === 'string' ? message.sourceId.slice(0, 100) : '';
        if (message.control && typeof message.control.id === 'string') {
          const result = updateControls(getLayout(), [message.control]);
          if (result.updates.length) {
            setLayout(result.layout);
            scheduleLayoutSave();
            broadcast({ type: 'controls', controls: result.updates, sourceId }, socket);
          } else {
            socket.send(
              JSON.stringify({
                type: 'error',
                message: 'Controle não encontrado no painel compartilhado.',
              }),
            );
          }
        } else {
          broadcast({ type: 'midi', direction: 'out', data: bytes, sourceId }, socket);
        }
      } catch (error) {
        socket.send(
          JSON.stringify({ type: 'error', message: `Falha ao enviar MIDI: ${error.message}` }),
        );
      }
    }
  });
}

module.exports = { attachWebSocketHandlers };
