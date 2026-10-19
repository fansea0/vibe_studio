import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'
import { createViteApiPlugin } from './src/server/viteApiPlugin.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), createViteApiPlugin()],
  // data/ 存放 SQLite 数据库与作品页 HTML。数据库每次写入都会触发文件变更，
  // 若被 Vite 监听到会导致整页 reload 并打断进行中的 API 请求。
  // 只忽略数据库文件；作品页 HTML 仍可被静态服务访问（改完需手动重启 dev server）。
  server: {
    port: 5173,
    // 端口被占用时不直接失败，自动顺延到下一个可用端口。
    // 想要「强制释放端口再启动」请用 `npm run dev`（scripts/dev-force.mjs 会先释放端口）。
    strictPort: false,
    // 浏览器窗口由 scripts/dev-force.mjs 统一管理（macOS 上以独立应用窗口打开），
    // 这里关掉 Vite 自带的 open，避免重复弹窗。
    open: false,
    watch: { ignored: ['**/data/**/*.sqlite', '**/data/**/*.sqlite-*', '**/data/**/*.db', '**/data/**/*.db-*'] },
  },
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
