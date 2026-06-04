import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  base: '/workmate/admin/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 7173,
    proxy: {
      '/workmate/console': {
        target: 'http://localhost:6173',
        changeOrigin: true,
      },
      '/workmate/health': {
        target: 'http://localhost:6173',
        changeOrigin: true,
      },
    },
  },
})