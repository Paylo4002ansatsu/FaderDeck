/* global document, window, getComputedStyle, DOMMatrixReadOnly, requestAnimationFrame */
(() => {
  'use strict';

  function reorder(controls, sourceId, targetId) {
    const source = controls.find((control) => control.id === sourceId);
    if (!source) return controls;
    const matching = controls.filter((control) => control.kind === source.kind);
    const from = matching.findIndex((control) => control.id === sourceId);
    const to = matching.findIndex((control) => control.id === targetId);
    if (to < 0 || from === to) return controls;
    matching.splice(to, 0, matching.splice(from, 1)[0]);
    let index = 0;
    return controls.map((control) => (control.kind === source.kind ? matching[index++] : control));
  }

  function begin(event, grid, card, controls) {
    const rect = card.getBoundingClientRect();
    const ghost = card.cloneNode(true);
    ghost.classList.add('fd-grid-drag-ghost');
    ghost.removeAttribute('data-control-id');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.setAttribute('inert', '');
    Object.assign(ghost.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    document.body.append(ghost);
    card.classList.add('fd-grid-drag-placeholder');
    event.preventDefault();
    grid.setPointerCapture(event.pointerId);
    return {
      kind: 'grid-reorder',
      pointerId: event.pointerId,
      id: card.dataset.controlId,
      targetId: '',
      startX: event.clientX,
      startY: event.clientY,
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2,
      grid,
      card,
      ghost,
      controls,
      originalControls: controls,
    };
  }

  function move(drag, event) {
    const x = event.clientX - drag.startX;
    const y = event.clientY - drag.startY;
    drag.ghost.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    const centerX = drag.centerX + x;
    const centerY = drag.centerY + y;
    const cards = [...drag.grid.querySelectorAll(':scope > [data-control-id]')];
    const source = drag.controls.find((control) => control.id === drag.id);
    const target = cards.find((card) => {
      const control = drag.controls.find((item) => item.id === card.dataset.controlId);
      if (!control || control.kind !== source.kind || control.id === drag.id) return false;
      const rect = card.getBoundingClientRect();
      const transform = getComputedStyle(card).transform;
      const matrix = transform === 'none' ? null : new DOMMatrixReadOnly(transform);
      const left = rect.left - (matrix?.m41 || 0);
      const top = rect.top - (matrix?.m42 || 0);
      return (
        centerX >= left &&
        centerX <= left + rect.width &&
        centerY >= top &&
        centerY <= top + rect.height
      );
    });
    if (!target || target.dataset.controlId === drag.targetId) return;
    drag.targetId = target.dataset.controlId;
    const before = new Map(cards.map((card) => [card, card.getBoundingClientRect()]));
    const order = reorder(drag.controls, drag.id, drag.targetId);
    drag.controls = order;
    cards.forEach((card) => {
      card.style.transition = 'none';
      card.style.transform = '';
      card.style.order = String(
        order.findIndex((control) => control.id === card.dataset.controlId),
      );
    });
    cards.forEach((card) => {
      const previous = before.get(card);
      const next = card.getBoundingClientRect();
      card.style.transform = `translate(${previous.left - next.left}px, ${previous.top - next.top}px)`;
    });
    void drag.grid.offsetWidth;
    cards.forEach((card) => {
      card.style.transition = 'transform 200ms cubic-bezier(0.2, 0, 0, 1)';
      card.style.transform = '';
    });
  }

  function end(drag) {
    drag.ghost.remove();
    drag.card.classList.remove('fd-grid-drag-placeholder');
    requestAnimationFrame(() => {
      for (const card of drag.grid.querySelectorAll(':scope > [data-control-id]')) {
        card.style.removeProperty('order');
        card.style.removeProperty('transition');
        card.style.removeProperty('transform');
      }
    });
  }

  function destination(drag) {
    const source = drag.originalControls.find((control) => control.id === drag.id);
    const current = drag.controls.filter((control) => control.kind === source.kind);
    const original = drag.originalControls.filter((control) => control.kind === source.kind);
    return original[current.findIndex((control) => control.id === drag.id)]?.id;
  }

  window.fdGridReorder = { begin, move, end, reorder, destination };
})();
