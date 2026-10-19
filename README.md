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
npm run dev # http://localhost:5173
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

SQLite API 与前端由 Vite 插件在同一端口提供，开发地址为 `http://localhost:5173`。

`npm run dev` 会先释放被占用的端口再启动：如果是本项目残留的 vite 进程会直接结束它并复用 5173；
如果是其他程序占用则不强制终止，自动改用下一个可用端口（控制台会打印实际地址）。
用 `PORT=6000 npm run dev` 可指定其他端口，`npm run dev:plain` 则完全不做端口处理。

## 作品集对外展示

`/showcase` 是一个对外公开访问的作品集页面，面向潜在合作者、招聘方和好奇的访客，展示当前对外公开的产品。

- 在工作台的产品设置中勾选 **对外公开** 即可让该产品出现在 `/showcase`。
- 公开的产品只能展示名称、描述、图标、状态、当前版本、用户数和 `appUrl`，**不会**展示任务、Bug、文档等内部协作数据。
- 个人信息、tagline、关于我段落、联系方式和社交链接在 `data/showcase-profile.json` 中配置，修改后需要重启 dev server。
- 详情页 `/showcase/:productId` 仅对公开且未归档的产品可见；不公开或已归档的 ID 返回 404。

## 自定义作品页

每个公开产品都可以挂一个完全自定义的 HTML 展示页，用 iframe 在作品详情页里加载。

### 使用方式

1. 在 `data/products/<product-id>/showcase.html` 创建 HTML 文件
2. 在工作台 → 产品设置 → **自定义作品页路径** 填入路径（例如 `data/products/1/showcase.html`）
3. 重启 dev server（Vite 需要重新读取新文件）
4. 访问 `/showcase/<product-id>` 即可看到你的自定义作品页

作品页 HTML 是**沙箱化**的（`sandbox="allow-scripts"`，**不**含 `allow-same-origin`），可以自由写 CSS/JS/动画/3D，但拿不到主站的 cookie / localStorage。

**重要约束**：
- HTML 文件必须放在 `data/products/<你的产品ID>/showcase.html` 下，**不能跨产品访问其他产品的目录**（`/api/showcase/pages/:id` 路由会拒绝）
- 产品 ID 在 SQLite 里查看（工作台 → 产品网格 → 点击产品名 → 看 URL 中的 `:productId`）

### 接收产品数据

父页面在 iframe 加载完成后会用 `postMessage` 推送产品数据：

```html
<script>
  window.addEventListener('message', function (event) {
    if (event.origin !== window.location.origin) return;
    if (event.data && event.data.type === 'vibe-studio:showcase-data') {
      var product = event.data.product;
      document.body.innerHTML = '<h1>' + product.name + '</h1>' +
        '<p>当前版本：' + product.currentVersion + '</p>';
    }
  });
</script>
```

`product` 字段包含：`id, name, description, icon, status, currentVersion, userCount, appUrl, updatedAt, showcasePagePath`。

### 打开外链（访问应用等）

由于沙箱拦截 `target="_blank"`，作品页想打开外链时应通过 `parent.postMessage` 通知主页面：

```html
<button onclick="parent.postMessage({ type: 'vibe-studio:open-url', url: 'https://example.com' }, '*')">
  访问应用
</button>
```

主页面会用 `window.open(url, '_blank', 'noopener,noreferrer')` 打开。

### 示例

完整可参考的示例见 `data/products/1/showcase.html`（首次启动时会作为 Flora 的 demo 启用）。

## 部署说明

应用使用 `BrowserRouter`。生产服务器必须把未知深链 fallback 到 `index.html`：Nginx 可配置 `try_files $uri $uri/ /index.html`；Vercel 与 Netlify 请启用 SPA rewrite（将 `/*` 重写到 `/index.html`）。
