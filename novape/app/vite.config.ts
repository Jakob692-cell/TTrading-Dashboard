import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `vite build --mode single` emits one self-contained index.html
// (JS, CSS, fonts and images inlined) for sharing a clickable preview.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
  },
  test: {
    environment: 'node',
  },
}));
