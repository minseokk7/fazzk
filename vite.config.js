import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte({
    preprocess: {
      typescript: true
    }
  })],
  server: {
    port: 3000,
    host: true,
    hmr: {
      port: 3002  // HMR WebSocket을 다른 포트로 분리
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // 프로덕션에서 console.log 제거
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug'],
      },
      mangle: {
        safari10: true,
      },
    },
    rollupOptions: {
      output: {
        manualChunks: {
          // 벤더 라이브러리 분리
          vendor: ['svelte', 'svelte/store'],
          router: ['svelte-spa-router'],
          tauri: ['@tauri-apps/api'],
        },
      },
    },
    // 청크 크기 경고 임계값 조정
    chunkSizeWarningLimit: 1000,
  },
  resolve: {
    alias: {
      '$lib': '/src/lib',
      '$routes': '/src/routes'
    }
  },
  // 의존성 최적화
  optimizeDeps: {
    include: [
      'svelte',
      'svelte/store',
      'svelte-spa-router',
      '@tauri-apps/api',
    ],
  },
})
