'use strict';

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
  },
) {
  wss.on('connection', (socket) => {
    if (!isLayoutInitialized() && !getLayoutSeedOwner()) setLayoutSeedOwner(socket);
    socket.send(JSON.stringify({ type: 'ready' }));
    socket.send(JSON.stringify(layoutPayload()));
    socket.on('close', () => {
      if (!isLayoutInitialized() && socket === getLayoutSeedOwner()) setLayoutSeedOwner(null);
    });
    socket.on('message', (raw) => {
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
      if (message.type !== 'midi' || !Array.isArray(message.data) || message.data.length > 256)
        return;
      if (!midiManager.hasOutput()) {
        socket.send(
          JSON.stringify({ type: 'error', message: 'Selecione uma saída MIDI na tela da ponte.' }),
        );
        return;
      }
      const bytes = message.data.map((value) => Number(value));
      if (bytes.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return;
      try {
        midiManager.send(bytes);
      } catch (error) {
        socket.send(
          JSON.stringify({ type: 'error', message: `Falha ao enviar MIDI: ${error.message}` }),
        );
      }
    });
  });
}

module.exports = { attachWebSocketHandlers };
