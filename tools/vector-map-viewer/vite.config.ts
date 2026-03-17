import { resolve } from 'node:path'
import { defineConfig, searchForWorkspaceRoot } from 'vite'

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 4176,
    fs: {
      allow: [searchForWorkspaceRoot(process.cwd()), resolve(__dirname, '../../frontend/src')],
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4176,
  },
})