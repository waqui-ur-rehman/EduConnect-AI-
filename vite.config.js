import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    fs: {
      deny: ['.env', '.env.*', '*.{crt,pem,key,p12,pfx,cer,der}', '.npmrc', '.yarnrc.yml', '**/.git/**', '**/backend/uploads/**', '**/backend/private/**'],
    },
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY || 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
    },
    watch: {
      ignored: ['**/.verification-preview/**', '**/backend/uploads/**'],
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    css: true,
    exclude: ['**/node_modules/**', '**/dist/**', 'backend/**', 'tests/e2e/**', 'playwright-report/**', 'test-results/**'],
  },
})
