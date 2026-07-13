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

产品、任务、版本和文档数据保存在浏览器 `localStorage` 中，仅属于当前单浏览器的本地数据，用户清理浏览器站点数据时也会被清理。Markdown 文档以文本形式存储，只适合小文件；生产环境或大文件场景应改用服务端存储。
