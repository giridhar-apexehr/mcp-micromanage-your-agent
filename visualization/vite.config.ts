import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@data': path.resolve(__dirname, '../data'),
    },
  },
  server: {
    // 静的ファイルをルートディレクトリからも提供
    fs: {
      allow: ['..'],
    },
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
      '/csrf': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
      '/data': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
      '/healthz': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
      '/readyz': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
  // 標準のpublicディレクトリ
  publicDir: path.resolve(__dirname, 'public'),
})
