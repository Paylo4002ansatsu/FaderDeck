'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const docsGuidePath = path.join(root, 'docs', 'guia-midi-windows.html');
const clientGuidePath = path.join(root, 'client', 'guia-midi-windows.html');
const docsGuideCssPath = path.join(root, 'docs', 'guia-midi-windows.css');
const clientGuideCssPath = path.join(root, 'client', 'guia-midi-windows.css');
const requiredImages = ['loopmidi-window.png'];

test('GitHub root README links to the Windows guide and local logo', () => {
  const readmePath = path.join(root, 'README.md');
  const readme = fs.readFileSync(readmePath, 'utf8');
  assert.match(readme, /^# FaderDeck$/m);
  assert.match(readme, /## Instalação e MIDI/);
  assert.match(readme, /loopMIDI/);
  assert.match(readme, /https:\/\/fader-deck\.vercel\.app\/guia-midi-windows\.html/);
  assert.equal(fs.existsSync(path.join(root, 'README-ponte.md')), false);

  const imagePaths = [...readme.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(imagePaths.length > 0);
  for (const imagePath of imagePaths) {
    assert.equal(
      fs.existsSync(path.join(root, imagePath)),
      true,
      `Imagem do README ausente: ${imagePath}`,
    );
  }
});

test('published and installed guides link home and include their Windows guide assets', () => {
  const docsGuide = fs.readFileSync(docsGuidePath, 'utf8');
  const clientGuide = fs.readFileSync(clientGuidePath, 'utf8');
  const docsGuideCss = fs.readFileSync(docsGuideCssPath, 'utf8');
  const clientGuideCss = fs.readFileSync(clientGuideCssPath, 'utf8');
  assert.equal(clientGuideCss, docsGuideCss);
  assert.match(docsGuide, /<a href="index\.html">Início<\/a>/);
  assert.match(clientGuide, /<a href="index\.html">Início<\/a>/);
  for (const guide of [docsGuide, clientGuide]) {
    assert.match(guide, /<link rel="stylesheet" href="guia-midi-windows\.css"/);
    assert.doesNotMatch(guide, /<style[\s>]/);
  }
  assert.match(docsGuide, /class="brand-mark"[^>]*><img src="faderdeck-icon\.png"/);
  assert.match(docsGuideCss, /\.topbar nav a\s*\{[^}]*text-decoration:\s*none/s);
  assert.match(docsGuideCss, /\.topbar nav a:hover\s*\{[^}]*color:\s*var\(--teal\)/s);
  assert.match(docsGuideCss, /letter-spacing: 0\.005em/);
  assert.match(docsGuideCss, /\.step p\s*\{[^}]*line-height: 1\.75/s);
  assert.match(docsGuideCss, /figcaption\s*\{[^}]*font-size: 14px/s);
  assert.match(docsGuideCss, /\.contents a\s*\{[^}]*min-height: 44px/s);
  assert.match(docsGuideCss, /\.chip\s*\{[^}]*font-size: 14px/s);
  assert.match(docsGuideCss, /\.callout\s*\{[^}]*font-size: 14px/s);
  assert.match(docsGuideCss, /\.admin-label\s*\{[^}]*font-size: 14px/s);
  assert.match(docsGuideCss, /\.footer\s*\{[^}]*font-size: 14px/s);
  assert.deepEqual(
    fs.readFileSync(path.join(root, 'client', 'faderdeck-icon.png')),
    fs.readFileSync(path.join(root, 'docs', 'public', 'faderdeck-icon.png')),
  );

  const imageSources = [...docsGuide.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(imageSources.sort(), ['faderdeck-icon.png', 'guia-assets/loopmidi-window.png']);
  assert.doesNotMatch(docsGuide, /REAPER|Ableton Live|FL Studio|Cubase/);

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
  const clientGuide = fs.readFileSync(clientGuidePath, 'utf8');
  for (const requiredText of [
    'New port-name',
    'FaderDeck',
    'Aplicar portas MIDI',
    'ChurchDAW',
    'Kontakt',
    'Sistema → Áudio e MIDI',
    'Ferramentas → Mapear MIDI',
    'loopMIDI',
    'Ilustração esquemática',
    'Captura real',
  ]) {
    assert.ok(guide.includes(requiredText), `Conteúdo obrigatório ausente: ${requiredText}`);
  }
  assert.equal(guide.includes('Auto detect'), false);
  assert.equal(clientGuide.includes('Node.js no app desktop'), true);
});

test('guide route is declared and Electron packaging includes client guide assets', () => {
  const routes = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'manus-routes.json'), 'utf8'));
  assert.ok(routes.routes.some((route) => route.path === '/guia-midi-windows.html'));

  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.ok(packageJson.build.files.includes('client/**/*'));
});
