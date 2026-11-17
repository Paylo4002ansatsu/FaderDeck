'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.join(__dirname, '..');
const stageScript = fs.readFileSync(path.join(root, 'client/stage-mode-enhancements.js'), 'utf8');

class FakeClassList {
  constructor(initial = []) {
    this.values = new Set(initial);
  }

  add(value) {
    this.values.add(value);
  }

  remove(value) {
    this.values.delete(value);
  }

  contains(value) {
    return this.values.has(value);
  }

  toggle(value, force) {
    const shouldAdd = force === undefined ? !this.contains(value) : force;
    if (shouldAdd) this.add(value);
    else this.remove(value);
    return shouldAdd;
  }
}

class FakeElement {
  constructor(classes = []) {
    this.classList = new FakeClassList(classes);
    this.attributes = {};
    this.children = [];
    this.listeners = new Map();
    this.closestMap = new Map();
    this.parentNode = null;
    this.textContent = '';
    this.scrollLeft = 0;
    this.scrollWidth = 800;
    this.clientWidth = 300;
    this.clickCount = 0;
  }

  set className(value) {
    this.classList = new FakeClassList(value.split(/\s+/).filter(Boolean));
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  addEventListener(type, callback) {
    const callbacks = this.listeners.get(type) || [];
    callbacks.push(callback);
    this.listeners.set(type, callbacks);
  }

  append(child) {
    child.parentNode = this;
    this.children.push(child);
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }

  closest(selector) {
    return this.closestMap.get(selector) || null;
  }

  querySelector(selector) {
    return this.children.find((child) => child.selector === selector) || null;
  }

  click() {
    this.clickCount += 1;
    for (const callback of this.listeners.get('click') || []) callback({ target: this });
  }
}

function createStageHarness(savedPreference = null) {
  const storage = new Map();
  if (savedPreference !== null) storage.set('faderdeck.stage.showNames', savedPreference);

  const rootElement = new FakeElement();
  const body = new FakeElement();
  const documentElement = new FakeElement();
  const stage = new FakeElement(['app-shell', 'stage-mode']);
  const exitButton = new FakeElement();
  exitButton.selector = '.stage-exit-handle';
  stage.querySelector = (selector) => (selector === '.stage-exit-handle' ? exitButton : null);

  const documentListeners = new Map();
  const document = {
    active: true,
    body,
    documentElement,
    observer: null,
    addEventListener(type, callback) {
      const callbacks = documentListeners.get(type) || [];
      callbacks.push(callback);
      documentListeners.set(type, callbacks);
    },
    createElement() {
      return new FakeElement();
    },
    getElementById(id) {
      return id === 'root' ? rootElement : null;
    },
    querySelector(selector) {
      if (selector === '.app-shell.stage-mode') return this.active ? stage : null;
      if (selector === '.app-shell.stage-mode .stage-exit-handle') {
        return this.active ? exitButton : null;
      }
      return null;
    },
    emit(type, event) {
      for (const callback of documentListeners.get(type) || []) callback(event);
    },
  };

  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback;
      document.observer = this;
    }

    observe() {}
  }

  const window = {
    localStorage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        storage.set(key, value);
      },
    },
    setTimeout() {
      return 1;
    },
    clearTimeout() {},
  };

  vm.runInNewContext(stageScript, { MutationObserver: FakeMutationObserver, document, window });
  return { body, document, exitButton, stage, storage };
}

function makePointerTarget(scroller, lane, { blocked = false } = {}) {
  const target = new FakeElement();
  target.closestMap.set('.app-shell.stage-mode .stage-fader-scroll', scroller);
  target.closestMap.set('.stage-lane-fader', lane);
  target.closestMap.set('.stage-fader-rail', null);
  target.closestMap.set(
    '.fader-body, .fader-track, .fader-thumb, [role="slider"], input, textarea, select, button, a, .pad-card',
    blocked ? new FakeElement() : null,
  );
  return target;
}

test('a preferência Nomes persiste e é reaplicada quando o palco é reaberto', () => {
  const harness = createStageHarness();
  const { body, document, stage, storage } = harness;
  const toolbar = body.children[0];
  const toggle = toolbar.children[0];

  assert.equal(stage.classList.contains('fd-stage-names-hidden'), false);
  assert.equal(toggle.textContent, 'Nomes: ligado');
  assert.equal(toggle.attributes['aria-pressed'], 'true');

  toggle.click();
  assert.equal(stage.classList.contains('fd-stage-names-hidden'), true);
  assert.equal(toggle.textContent, 'Nomes: desligado');
  assert.equal(storage.get('faderdeck.stage.showNames'), 'false');

  document.active = false;
  document.observer.callback();
  assert.equal(body.children.length, 0);

  document.active = true;
  document.observer.callback();
  assert.equal(stage.classList.contains('fd-stage-names-hidden'), true);
  assert.equal(body.children[0].children[0].textContent, 'Nomes: desligado');
});

test('Escape aciona a mesma ação do botão Sair dentro do modo palco', () => {
  const { document, exitButton } = createStageHarness();
  const event = {
    key: 'Escape',
    target: new FakeElement(),
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  };

  document.emit('keydown', event);

  assert.equal(exitButton.clickCount, 1);
  assert.equal(event.prevented, true);
});

test('roda comum e Shift+roda rolam horizontalmente sem mover o valor do fader', () => {
  const { document } = createStageHarness();
  const scroller = new FakeElement();
  scroller.scrollLeft = 10;
  const target = new FakeElement();
  target.closestMap.set('.app-shell.stage-mode .stage-fader-scroll', scroller);
  const event = {
    target,
    shiftKey: true,
    deltaY: 120,
    prevented: false,
    stopped: false,
    preventDefault() {
      this.prevented = true;
    },
    stopPropagation() {
      this.stopped = true;
    },
  };

  document.emit('wheel', event);

  assert.equal(scroller.scrollLeft, 130);
  assert.equal(event.prevented, true);
  assert.equal(event.stopped, true);
});

test('trackpad horizontal usa o scroll nativo e wheel sobre o fader não rola os canais', () => {
  const { document } = createStageHarness();
  const scroller = new FakeElement();
  scroller.scrollLeft = 10;
  const trackpadTarget = new FakeElement();
  trackpadTarget.closestMap.set('.app-shell.stage-mode .stage-fader-scroll', scroller);
  const horizontalTrackpadEvent = {
    target: trackpadTarget,
    shiftKey: false,
    deltaX: 45,
    deltaY: 0,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
    stopPropagation() {},
  };

  document.emit('wheel', horizontalTrackpadEvent);
  assert.equal(horizontalTrackpadEvent.prevented, false);

  const browserZoomEvent = {
    target: trackpadTarget,
    shiftKey: false,
    ctrlKey: true,
    metaKey: false,
    deltaX: 0,
    deltaY: 45,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
    stopPropagation() {},
  };
  document.emit('wheel', browserZoomEvent);
  assert.equal(scroller.scrollLeft, 10);
  assert.equal(browserZoomEvent.prevented, false);

  const faderTarget = new FakeElement();
  faderTarget.closestMap.set('.app-shell.stage-mode .stage-fader-scroll', scroller);
  faderTarget.closestMap.set(
    '.fader-body, .fader-track, .fader-thumb, [role="slider"], input, textarea, select, button, a, .pad-card',
    new FakeElement(),
  );
  const faderWheelEvent = {
    target: faderTarget,
    shiftKey: false,
    deltaX: 0,
    deltaY: 45,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
    stopPropagation() {},
  };

  document.emit('wheel', faderWheelEvent);
  assert.equal(scroller.scrollLeft, 10);
  assert.equal(faderWheelEvent.prevented, false);
});

test('arrastar uma área não interativa rola os canais; arrastar o trilho do fader não', () => {
  const { document, exitButton } = createStageHarness();
  const scroller = new FakeElement();
  const lane = new FakeElement();
  const headerTarget = makePointerTarget(scroller, lane);
  const startScrollLeft = scroller.scrollLeft;

  document.emit('pointerdown', {
    pointerType: 'mouse',
    button: 0,
    pointerId: 7,
    clientX: 100,
    target: headerTarget,
  });
  const moveEvent = {
    pointerId: 7,
    clientX: 70,
    preventDefault() {
      this.prevented = true;
    },
  };
  document.emit('pointermove', moveEvent);
  assert.equal(scroller.scrollLeft, startScrollLeft + 30);
  assert.equal(scroller.classList.contains('fd-stage-dragging'), true);
  assert.equal(moveEvent.prevented, true);

  document.emit('pointerup', { pointerId: 7 });
  assert.equal(scroller.classList.contains('fd-stage-dragging'), false);

  const channelClick = {
    target: headerTarget,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
    stopImmediatePropagation() {},
  };
  document.emit('click', channelClick);
  assert.equal(channelClick.prevented, true);

  document.emit('pointerdown', {
    pointerType: 'mouse',
    button: 0,
    pointerId: 10,
    clientX: 100,
    target: headerTarget,
  });
  document.emit('pointermove', { pointerId: 10, clientX: 90, preventDefault() {} });
  document.emit('pointerup', { pointerId: 10 });
  assert.equal(scroller.scrollLeft, startScrollLeft + 40);
  const exitClick = {
    target: exitButton,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
    stopImmediatePropagation() {},
  };
  document.emit('click', exitClick);
  assert.equal(exitClick.prevented, false);

  const blockedTarget = makePointerTarget(scroller, lane, { blocked: true });
  document.emit('pointerdown', {
    pointerType: 'mouse',
    button: 0,
    pointerId: 8,
    clientX: 100,
    target: blockedTarget,
  });
  document.emit('pointermove', {
    pointerId: 8,
    clientX: 20,
    preventDefault() {},
  });
  assert.equal(scroller.scrollLeft, startScrollLeft + 40);

  const touchTarget = makePointerTarget(scroller, lane);
  document.emit('pointerdown', {
    pointerType: 'touch',
    button: 0,
    pointerId: 9,
    clientX: 100,
    target: touchTarget,
  });
  document.emit('pointermove', {
    pointerId: 9,
    clientX: 20,
    preventDefault() {},
  });
  assert.equal(scroller.scrollLeft, startScrollLeft + 40);
});

test('landing usa a mesma imagem do ícone desktop e oferece uma prévia de palco interativa', () => {
  const desktopIcon = fs.readFileSync(path.join(root, 'build/icon.png'));
  const siteIcon = fs.readFileSync(path.join(root, 'docs/faderdeck-icon.png'));
  const html = fs.readFileSync(path.join(root, 'docs/index.html'), 'utf8');
  const script = fs.readFileSync(path.join(root, 'docs/app.js'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'docs/styles.css'), 'utf8');

  assert.deepEqual(siteIcon, desktopIcon);
  assert.match(html, /rel="icon" href="faderdeck-icon\.png"/);
  assert.match(html, /rel="apple-touch-icon" href="faderdeck-icon\.png"/);
  assert.doesNotMatch(html, /logo\.svg|class="mini-mark">FD/);
  assert.match(html, /id="stage-demo-names-toggle"/);
  assert.equal((html.match(/class="stage-demo-lane"/g) || []).length, 5);
  assert.match(script, /setupStagePreview/);
  assert.match(script, /faderdeck\.landing\.stagePreview\.showNames/);
  assert.match(styles, /\.stage-demo\.names-hidden \.stage-demo-channel-head/);
  assert.match(styles, /IBM Plex Mono/);
  for (const color of ['#40ded0', '#f8b84e', '#6f9cff', '#c18bff', '#ff7187']) {
    assert.match(html, new RegExp(color));
  }
  for (const font of [
    'inter-400.woff2',
    'inter-500.woff2',
    'ibm-plex-mono-400.woff2',
    'ibm-plex-mono-500.woff2',
  ]) {
    assert.equal(fs.existsSync(path.join(root, 'docs/assets/fonts', font)), true);
  }
});

test('o app carrega e armazena em cache os assets auxiliares do palco', () => {
  const html = fs.readFileSync(path.join(root, 'client/index.html'), 'utf8');
  const serviceWorker = fs.readFileSync(path.join(root, 'client/sw.js'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'client/stage-mode-enhancements.css'), 'utf8');

  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /stage-mode-enhancements\.css/);
  assert.match(html, /stage-mode-enhancements\.js/);
  assert.match(serviceWorker, /faderdeck-shell-v4/);
  assert.match(serviceWorker, /'\/stage-mode-enhancements\.css'/);
  assert.match(serviceWorker, /'\/stage-mode-enhancements\.js'/);
  assert.match(styles, /min-height:\s*48px/);
  assert.match(styles, /safe-area-inset-top/);
  assert.match(
    styles,
    /\.stage-mode button\.stage-exit-handle > span\s*\{[^}]*width:\s*auto !important;[^}]*background:\s*transparent !important;/,
  );
  assert.match(styles, /padding-top:\s*60px/);
  assert.match(styles, /touch-action:\s*pan-x/);
  assert.match(styles, /scroll-snap-type:\s*none\s*!important/);
  assert.match(styles, /stage-mode:not\(\.fd-stage-names-hidden\)/);
  assert.match(styles, /stage-mode\.fd-stage-names-hidden/);
});
