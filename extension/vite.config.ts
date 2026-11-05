import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        // main - 관리 화면 , background - 아이콘 클릭 처리
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        background: fileURLToPath(new URL('./src/background.ts', import.meta.url)),
      },
      output: {
        // manifest에서 참조하는 Worker의 파일명을 빌드마다 동일하게 유지합니다.
        entryFileNames: (chunk): string => chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:18000',
        changeOrigin: true,
        // 개발 요청의 접두사를 제거해 기존 FastAPI 경로를 그대로 사용합니다.
        rewrite: (path: string): string => path.replace(/^\/api/, ''),
      },
    },
  },
});
