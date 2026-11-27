import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const repositoryRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(repositoryRoot, 'docs'),
  envDir: repositoryRoot,
  build: {
    outDir: path.join(repositoryRoot, 'dist'),
    emptyOutDir: true,
  },
});
