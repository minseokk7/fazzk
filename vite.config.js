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
    emptyOutDir: true
  },
  resolve: {
    alias: {
      '$lib': '/src/lib',
      '$routes': '/src/routes'
    }
  }
})
