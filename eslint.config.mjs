import js from '@eslint/js';
import globals from 'globals';

const nodeFiles = [
  'main.js',
  'electron-utils.cjs',
  'server.cjs',
  'server-utils.cjs',
  'bridge/**/*.cjs',
  'scripts/**/*.{js,cjs,mjs}',
  'tests/**/*.{js,cjs,mjs}',
];

const browserFiles = [
  'assets/**/*.js',
  'client/bridge-bootstrap.js',
  'client/update-modal.js',
  'client/admin/**/*.js',
  'client/stage-mode-enhancements.js',
  'client/sw.js',
  'docs/**/*.js',
  'qr-overlay.js',
];

export default [
  {
    ignores: ['client/assets/**', 'coverage/**', 'dist/**', 'node_modules/**', 'release/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,cjs,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
    },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: nodeFiles,
    languageOptions: {
      sourceType: 'commonjs',
      globals: globals.node,
    },
  },
  {
    files: browserFiles,
    languageOptions: {
      sourceType: 'script',
      globals: globals.browser,
    },
  },
  {
    files: ['docs/auth-callback.js'],
    languageOptions: {
      sourceType: 'module',
    },
  },
];
