(() => {
  'use strict';

  if (document.documentElement.classList.contains('fd-mobile-surface')) return;

  const STORAGE_KEY = 'faderdeck.stage.showNames';
  const STAGE_SELECTOR = '.app-shell.stage-mode';
  const EXIT_SELECTOR = `${STAGE_SELECTOR} .stage-exit-handle`;
  const NO_SCROLL_DRAG_SELECTOR =
    '.fader-body, .fader-track, .fader-thumb, [role="slider"], input, textarea, select, button, a, .pad-card';

  function readShowNames() {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      return saved === null || saved === 'true';
    } catch {
      return true;
    }
  }

  let showNames = readShowNames();
  let toolbar = null;
  let toggleButton = null;
  let activeDrag = null;
  let suppressClick = false;
  let suppressClickScroller = null;
  let suppressClickTimer = null;

  function persistShowNames() {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(showNames));
    } catch {
      // Preferência temporária para origens que não permitem armazenamento local.
    }
  }

  function updateToggleLabel() {
    if (!toggleButton) return;
    toggleButton.textContent = `Nomes: ${showNames ? 'ligado' : 'desligado'}`;
    toggleButton.setAttribute('aria-pressed', String(showNames));
    toggleButton.setAttribute(
      'aria-label',
      showNames ? 'Esconder nomes dos canais' : 'Mostrar nomes dos canais',
    );
  }

  function createToolbar() {
    if (toolbar) return;
    toolbar = document.createElement('div');
    toolbar.className = 'fd-stage-mode-tools';
    toolbar.setAttribute('role', 'group');
    toolbar.setAttribute('aria-label', 'Opções do modo palco');

    toggleButton = document.createElement('button');
    toggleButton.type = 'button';
    toggleButton.className = 'fd-stage-names-toggle';
    toggleButton.addEventListener('click', () => {
      showNames = !showNames;
      persistShowNames();
      applyStagePreference();
    });

    toolbar.append(toggleButton);
    document.body.append(toolbar);
    updateToggleLabel();
  }

  function removeToolbar() {
    toolbar?.remove();
    toolbar = null;
    toggleButton = null;
  }

  function applyStagePreference() {
    const stage = document.querySelector(STAGE_SELECTOR);
    if (!stage) {
      removeToolbar();
      return;
    }

    const shouldHideNames = !showNames;
    if (stage.classList.contains('fd-stage-names-hidden') !== shouldHideNames) {
      stage.classList.toggle('fd-stage-names-hidden', shouldHideNames);
    }
    createToolbar();
    updateToggleLabel();
  }

  function handleEscape(event) {
    if (event.key !== 'Escape' || !document.querySelector(STAGE_SELECTOR)) return;
    if (event.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;

    const exitButton = document.querySelector(EXIT_SELECTOR);
    if (!exitButton) return;

    event.preventDefault();
    exitButton.click();
  }

  function handleWheel(event) {
    if (
      event.deltaY === 0 ||
      event.ctrlKey ||
      event.metaKey ||
      (!event.shiftKey && event.deltaX !== 0)
    ) {
      return;
    }
    const scroller = event.target?.closest?.(`${STAGE_SELECTOR} .stage-fader-scroll`);
    if (!scroller || scroller.scrollWidth <= scroller.clientWidth) return;
    if (event.target?.closest?.(NO_SCROLL_DRAG_SELECTOR)) return;

    event.preventDefault();
    event.stopPropagation();
    scroller.scrollLeft += event.deltaY;
  }

  function handlePointerDown(event) {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;

    const target = event.target;
    const scroller = target?.closest?.(`${STAGE_SELECTOR} .stage-fader-scroll`);
    if (!scroller || target.closest(NO_SCROLL_DRAG_SELECTOR)) return;

    const lane = target.closest('.stage-lane-fader');
    const rail = target.closest('.stage-fader-rail');
    if (!lane && !rail) return;

    activeDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: scroller.scrollLeft,
      scroller,
      moved: false,
    };
  }

  function handlePointerMove(event) {
    if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;

    const deltaX = event.clientX - activeDrag.startX;
    if (!activeDrag.moved && Math.abs(deltaX) < 4) return;

    activeDrag.moved = true;
    activeDrag.scroller.scrollLeft = activeDrag.startScrollLeft - deltaX;
    activeDrag.scroller.classList.add('fd-stage-dragging');
    event.preventDefault();
  }

  function handlePointerEnd(event) {
    if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;

    const didMove = activeDrag.moved;
    const scroller = activeDrag.scroller;
    scroller.classList.remove('fd-stage-dragging');
    activeDrag = null;

    if (!didMove) return;
    suppressClick = true;
    suppressClickScroller = scroller;
    window.clearTimeout(suppressClickTimer);
    suppressClickTimer = window.setTimeout(() => {
      suppressClick = false;
      suppressClickScroller = null;
    }, 0);
  }

  function suppressDragClick(event) {
    const clickedScroller = event.target?.closest?.(`${STAGE_SELECTOR} .stage-fader-scroll`);
    if (!suppressClick || clickedScroller !== suppressClickScroller) return;
    suppressClick = false;
    suppressClickScroller = null;
    window.clearTimeout(suppressClickTimer);
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  const appRoot = document.getElementById('root') || document.documentElement;
  const observer = new MutationObserver(applyStagePreference);
  observer.observe(appRoot, {
    attributes: true,
    attributeFilter: ['class'],
    childList: true,
    subtree: true,
  });

  document.addEventListener('keydown', handleEscape);
  document.addEventListener('wheel', handleWheel, { capture: true, passive: false });
  document.addEventListener('pointerdown', handlePointerDown, true);
  document.addEventListener('pointermove', handlePointerMove, { capture: true, passive: false });
  document.addEventListener('pointerup', handlePointerEnd, true);
  document.addEventListener('pointercancel', handlePointerEnd, true);
  document.addEventListener('click', suppressDragClick, true);

  applyStagePreference();
})();
