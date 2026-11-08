import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  build: {
    emptyOutDir: false,
    copyPublicDir: false,
    lib: {
      entry: fileURLToPath(new URL('./src/engines/naver/content.ts', import.meta.url)),
      name: 'StartPressNaverReader', formats: ['iife'], fileName: (): string => 'naver-content.js',
    },
  },
});
