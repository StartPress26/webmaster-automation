import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const engine = process.env.CONTENT_ENGINE === 'bing' ? 'bing' : 'naver';

export default defineConfig({
  build: {
    emptyOutDir: false,
    copyPublicDir: false,
    lib: {
      entry: fileURLToPath(new URL(`./src/engines/${engine}/content.ts`, import.meta.url)),
      name: engine === 'bing' ? 'StartPressBingReader' : 'StartPressNaverReader', formats: ['iife'], fileName: (): string => `${engine}-content.js`,
    },
  },
});
