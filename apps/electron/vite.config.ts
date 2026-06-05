import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import pkg from './package.json' with { type: 'json' }

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  root: resolve(__dirname, 'src/renderer'),
  base: './',
  build: {
    outDir: resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
  },
  resolve: {
    dedupe: [
      '@tiptap/core',
      '@tiptap/pm',
      '@tiptap/react',
      '@tiptap/suggestion',
      '@tiptap/extension-mention',
      'prosemirror-model',
      'prosemirror-state',
      'prosemirror-transform',
      'prosemirror-view',
    ],
    alias: [
      { find: '@/types', replacement: resolve(__dirname, 'src/types') },
      // @/auth/renderer 等子路径映射到 src/auth/
      { find: /^@\/auth\/(.*)/, replacement: resolve(__dirname, 'src/auth/$1') },
      { find: '@', replacement: resolve(__dirname, 'src/renderer') },
    ],
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true, // 确保使用指定端口，如被占用则报错
    open: false,
  },
})
