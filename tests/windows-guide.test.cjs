'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const docsGuidePath = path.join(root, 'docs', 'guia-midi-windows.html');
const clientGuidePath = path.join(root, 'client', 'guia-midi-windows.html');
const requiredImages = [
  'ableton-midi-ports.png',
  'fl-studio-midi-input.png',
  'loopmidi-window.png',
];

test('GitHub root README is the single step-by-step guide with working image paths', () => {
  const readmePath = path.join(root, 'README.md');
  const readme = fs.readFileSync(readmePath, 'utf8');
  assert.match(readme, /^# FaderDeck — instalação e configuração/m);
  assert.match(readme, /## Windows — instalação e primeiro uso/);
  assert.match(readme, /New port-name/);
  assert.match(readme, /Aplicar portas MIDI/);
  assert.equal(fs.existsSync(path.join(root, 'README-ponte.md')), false);

  const imagePaths = [...readme.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1]);
  assert.equal(imagePaths.length, 3);
  for (const imagePath of imagePaths) {
    assert.equal(
      fs.existsSync(path.join(root, imagePath)),
      true,
      `Imagem do README ausente: ${imagePath}`,
    );
  }
});

test('Pages and installed app contain the same Windows guide and image assets', () => {
  const docsGuide = fs.readFileSync(docsGuidePath, 'utf8');
  const clientGuide = fs.readFileSync(clientGuidePath, 'utf8');
  assert.equal(clientGuide, docsGuide);
  assert.match(docsGuide, /class="brand-mark"[^>]*><img src="faderdeck-icon\.png"/);
  assert.match(docsGuide, /\.topbar nav a\s*\{[^}]*text-decoration:\s*none/s);
  assert.match(docsGuide, /\.topbar nav a:hover\s*\{[^}]*color:\s*var\(--teal\)/s);
  assert.match(docsGuide, /letter-spacing: 0\.005em/);
  assert.match(docsGuide, /\.step p\s*\{[^}]*line-height: 1\.75/s);
  assert.match(docsGuide, /figcaption\s*\{[^}]*font-size: 14px/s);
  assert.match(docsGuide, /\.contents a\s*\{[^}]*min-height: 44px/s);
  assert.match(docsGuide, /\.chip\s*\{[^}]*font-size: 14px/s);
  assert.match(docsGuide, /\.callout\s*\{[^}]*font-size: 14px/s);
  assert.match(docsGuide, /\.admin-label\s*\{[^}]*font-size: 14px/s);
  assert.match(docsGuide, /\.footer\s*\{[^}]*font-size: 14px/s);
  assert.deepEqual(
    fs.readFileSync(path.join(root, 'client', 'faderdeck-icon.png')),
    fs.readFileSync(path.join(root, 'docs', 'faderdeck-icon.png')),
  );

  const imageSources = [...docsGuide.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(imageSources.sort(), [
    'faderdeck-icon.png',
    'guia-assets/ableton-midi-ports.png',
    'guia-assets/fl-studio-midi-input.png',
    'guia-assets/loopmidi-window.png',
  ]);

  for (const imageName of requiredImages) {
    const docsImage = path.join(root, 'docs', 'guia-assets', imageName);
    const clientImage = path.join(root, 'client', 'guia-assets', imageName);
    assert.equal(fs.existsSync(docsImage), true, `Imagem Pages ausente: ${imageName}`);
    assert.equal(fs.existsSync(clientImage), true, `Imagem do app ausente: ${imageName}`);
    assert.deepEqual(fs.readFileSync(clientImage), fs.readFileSync(docsImage));
  }
});

test('guide documents verified Windows setup and all requested DAWs without inventing UI', () => {
  const guide = fs.readFileSync(docsGuidePath, 'utf8');
  for (const requiredText of [
    'New port-name',
    'FaderDeck',
    'Aplicar portas MIDI',
    'REAPER',
    'Ableton Live',
    'FL Studio',
    'Cubase',
    'ChurchDAW',
    'Sistema → Áudio e MIDI',
    'Ferramentas → Mapear MIDI',
    'loopMIDI precisa ficar ativo',
    'Ilustração esquemática',
    'Captura real',
  ]) {
    assert.ok(guide.includes(requiredText), `Conteúdo obrigatório ausente: ${requiredText}`);
  }
  assert.equal(guide.includes('Auto detect'), false);
  assert.equal(guide.includes('Node.js no app desktop'), true);
});

test('guide route is declared and Electron packaging includes client guide assets', () => {
  const routes = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'manus-routes.json'), 'utf8'));
  assert.ok(routes.routes.some((route) => route.path === '/guia-midi-windows.html'));

  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.ok(packageJson.build.files.includes('client/**/*'));
});
