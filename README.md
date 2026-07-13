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
npm run dev
npm test -- --run
npm run typecheck:test
npm run build
```

`npm run build` 会同时检查应用、Vite 配置和测试代码的 TypeScript 类型。

## 数据存储说明

产品、任务、版本和文档数据保存在浏览器 `localStorage` 中，仅属于当前单浏览器的本地数据，用户清理浏览器站点数据时也会被清理。Markdown 文档以文本形式存储，只适合小文件，单个文件上限为 512 KiB；生产环境或大文件场景应改用服务端存储。

多标签写入优先使用浏览器 Web Locks；不支持时使用 IndexedDB `readwrite` transaction fallback，让同一浏览器的多个标签页按事务顺序执行同步读改写。该机制不替代服务端事务或多设备同步。若 Web Locks 与 IndexedDB 均不可用，应用仍可读取本地数据，但会禁用写操作并提示无法安全写入。

## 部署说明

应用使用 `BrowserRouter`。生产服务器必须把未知深链 fallback 到 `index.html`：Nginx 可配置 `try_files $uri $uri/ /index.html`；Vercel 与 Netlify 请启用 SPA rewrite（将 `/*` 重写到 `/index.html`）。
