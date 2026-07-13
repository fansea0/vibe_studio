# Vibe Studio

Vibe Studio 产品管理前端，基于 React 18、TypeScript 和 Vite。

## 环境要求

- Node.js 22.12.0+ LTS（项目提供 `.nvmrc`）
- npm

```bash
nvm use
npm install
```

## 常用命令

```bash
npm run dev # http://localhost:6000
npm test -- --run
npm run typecheck:test
npm run build
```

`npm run build` 会同时检查应用、Vite 配置和测试代码的 TypeScript 类型。

## 数据存储说明

产品、任务、版本和 Markdown 文档数据由 Vite 本地 API 写入 SQLite，默认文件为 `data/vibe-studio.sqlite`。本版本不迁移旧的 `localStorage` 数据；首次启动使用空数据库。Markdown 文档仅支持 `.md`/`.markdown`，单个文件上限为 512 KiB。

旧版 `localStorage` 仅属于单浏览器，用户清理浏览器站点数据会清除旧数据；新 SQLite 数据不受该操作影响。Markdown 仍以文本形式存储，适合小文件；生产环境的大文件应使用服务端存储。

旧版多标签方案曾使用 Web Locks 与 IndexedDB `readwrite` transaction；当 Web Locks 与 IndexedDB 不可用时会禁用写操作。该兼容说明仅针对旧版 localStorage 仓储，当前 SQLite API 使用服务端事务。

每个产品在设置中填写本机 Git 仓库的绝对路径。工作台首次加载产品时读取最新提交，并每 60 秒刷新一次；Git 读取失败只显示提示，不影响产品、任务和文档数据。

SQLite API 与前端由 Vite 插件在同一端口提供，开发地址固定为 `http://localhost:6000`。

## 部署说明

应用使用 `BrowserRouter`。生产服务器必须把未知深链 fallback 到 `index.html`：Nginx 可配置 `try_files $uri $uri/ /index.html`；Vercel 与 Netlify 请启用 SPA rewrite（将 `/*` 重写到 `/index.html`）。
