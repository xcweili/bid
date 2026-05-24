import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: '0.0.0.0',
    hmr: {
      overlay: false
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8888',
        changeOrigin: true
      }
    }
  }
})
