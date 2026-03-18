import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined
          }

          if (id.includes('node_modules/@pixi/') || id.includes('node_modules/pixi.js/')) {
            return 'vendor-pixi'
          }

          if (id.includes('node_modules/@radix-ui/')) {
            return 'vendor-radix'
          }

          if (id.includes('node_modules/@supabase/')) {
            return 'vendor-supabase'
          }

          return 'vendor'
        },
      },
    },
  },
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:8010',
      '/ws': {
        target: 'ws://localhost:8010',
        ws: true,
      },
    },
  },
})
