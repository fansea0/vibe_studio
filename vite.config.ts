import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'
import { createViteApiPlugin } from './src/server/viteApiPlugin.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), createViteApiPlugin()],
  server: { port: 5173, strictPort: true },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    exclude: [
      ...configDefaults.exclude,
      '**/.worktrees/**',
      '**/worktrees/**',
    ],
  },
})
