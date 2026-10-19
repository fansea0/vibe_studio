# Vibe Studio · 技术文档

> 目的：让 AI 在开发时无需盲目搜索代码即可理解项目结构、模块职责、关键约定。
> 阅读对象：后续维护者、Code Review、自动化 Agent。
> 适用版本：`package.json` 中 `vibe-studio@0.0.0`（Node 22.12+）。

---

## 1. 项目一句话

Vibe Studio 是一个**本地优先的产品管理工作台**（React 18 + Vite + SQLite）。它把产品、需求/Bug、版本、Markdown 文档四类实体聚合到同一个产品上下文中，并通过 Vite 插件在同一端口提供 SQLite 持久化 API，**开发期零外部依赖**。

---

## 2. 技术栈速览

| 层 | 选型 | 备注 |
|---|---|---|
| UI 框架 | React 18 + React Router v7 | `BrowserRouter`，SPA fallback 需服务器配置 |
| 语言 | TypeScript 6 + 严格模式 | `verbatimModuleSyntax`、`erasableSyntaxOnly` |
| 构建 | Vite 7 + `@vitejs/plugin-react` | `strictPort: true`，端口固定 `6000` |
| 样式 | 原生 CSS（`src/styles/global.css`） | 无 CSS 框架 |
| 拖拽 | `@dnd-kit/core` + `@dnd-kit/sortable` | 用于 TaskBoard 看板 |
| Markdown | `react-markdown` + `rehype-sanitize` | 自定义 `img`/`a` 渲染器 |
| 持久化（服务端） | `better-sqlite3` | 由 Vite 中间件挂载 |
| 持久化（客户端 fallback） | localStorage + IndexedDB + Web Locks | 已标记为 Legacy，仅测试场景使用 |
| 测试 | Vitest 3 + jsdom + Testing Library | `tests/**` + `src/test/setup.ts` |
| Lint | oxlint | `react` / `typescript` / `oxc` 插件 |

> **重要**：当前生产路径走 SQLite API。`legacy StudioRepository`（IndexedDB/localStorage）保留在 `src/data/studioRepository.ts`，仅供 `App.LegacyApp`（repository 注入）使用，**不要在新增功能时走 legacy 路径**。

---

## 3. 目录结构

```
src/
├── app/                # React 组件 + 表单/展示工具
│   ├── App.tsx         # 路由 + ApiApp/LegacyApp 分派
│   ├── AppShell.tsx    # 左侧导航 + 主区布局
│   ├── ProductGrid.tsx # /products 产品总览
│   ├── ProductDetail.tsx
│   ├── ProductDialog.tsx / ProductFields.tsx
│   ├── ProductOverview.tsx / ProductSettings.tsx
│   ├── TaskBoard.tsx   # 需求/Bug 看板
│   ├── VersionList.tsx # 版本列表
│   ├── DocumentWorkspace.tsx
│   ├── Modal.tsx       # 无障碍模态（焦点陷阱）
│   ├── productForm.ts / productLifecycle.ts / productPresentation.ts
│   ├── workItemPresentation.ts / workItemTransition.ts
│   ├── dateForm.ts / mutationError.ts
├── client/             # 浏览器侧 API 客户端
│   ├── api.ts          # 所有 fetch 封装
│   └── useCommitPolling.ts
├── domain/             # 纯领域模型与规则
│   ├── models.ts
│   ├── documentName.ts
│   └── productMetrics.ts
├── data/               # Legacy 仓储（IndexedDB/localStorage）
│   ├── seedStudio.ts
│   └── studioRepository.ts
├── server/             # Node 侧：API + SQLite + Git + Vite 插件
│   ├── api.ts          # 路由 + 错误归一化
│   ├── sqlite.ts       # better-sqlite3 仓储
│   ├── gitLog.ts
│   └── viteApiPlugin.ts
├── styles/global.css
├── test/setup.ts
└── main.tsx
tests/                  # 与 src 平行的测试目录
└── app|client|config|data|domain|server/
docs/                   # 本目录
data/                   # SQLite 文件目录（gitignore）
```

---

## 4. 分层与调用关系

```
┌────────────────────────────────────────────────────────────┐
│  React Components (src/app)                                │
│  App → AppShell → ProductGrid / ProductDetail → Tabs      │
└────────────┬───────────────────────────────────────────────┘
             │ props callbacks + domain types
             ▼
┌────────────────────────────────────────────────────────────┐
│  Client API (src/client/api.ts)                            │
│  fetchSnapshot / createProduct / updateProduct / commits…  │
└────────────┬───────────────────────────────────────────────┘
             │ HTTP /api/*
             ▼
┌────────────────────────────────────────────────────────────┐
│  Server API (src/server/api.ts)  createApiHandler          │
│  路由 + 参数校验 + 错误码归一化                            │
└────────────┬───────────────────────────────────────────────┘
             │ SqliteRepository 接口
             ▼
┌────────────────────────────────────────────────────────────┐
│  SqliteRepository (src/server/sqlite.ts)                   │
│  better-sqlite3 + 外键 + 唯一索引 + 单调时间戳             │
└────────────────────────────────────────────────────────────┘
             ▲
             │ Vite middleware /api
┌────────────┴───────────────────────────────────────────────┐
│  src/server/viteApiPlugin.ts                               │
│  与 Vite dev server 同进程同端口                           │
└────────────────────────────────────────────────────────────┘
```

模块边界：

- `domain/` 是**纯函数 + 类型**，禁止 import React、禁止 fetch。
- `app/` 只能依赖 `domain/`、`client/`、`styles/`，不能直接 `import from '../server/*'`。
- `client/` 只走 HTTP，不持有业务规则；规则在 `domain/`。
- `server/` 是 Node 上下文；浏览器代码不可 import。

---

## 5. 领域模型（`src/domain/models.ts`）

### 枚举

| 类型 | 取值 |
|---|---|
| `ProductStatus` | `developing` / `beta` / `released` / `archived` |
| `WorkItemType` | `requirement` / `bug` |
| `WorkItemStatus` | `todo` / `in_progress` / `done` |
| `VersionStatus` | `planned` / `released` |
| `Priority` | `low` / `medium` / `high` / `urgent` |

### 实体

```ts
Product {
  id, name, description, icon,
  status: ProductStatus,
  userCount, appUrl: string | null, repositoryPath: string,
  isDeleted?, archivedAt: string | null,
  isPublic?, showcasePagePath?,
  createdAt: ISO, updatedAt: ISO
}

WorkItem   { id, productId, type, title, priority, dueDate: ISO|null, status, createdAt, updatedAt }
Version    { id, productId, number, status, releasedAt: ISO|null, notes, createdAt, updatedAt }
Document   { id, productId, name, content, createdAt, updatedAt }
CommitSummary { sha, shortSha, author, committedAt, subject }
```

### 衍生度量（`domain/productMetrics.ts`）

```
completionPercent = round(done 任务数 / 全部任务数 * 100)，无任务时为 0
userCount         = product.userCount
openRequirementCount = count(requirement & status != done)
openBugCount         = count(bug & status != done)
currentVersion       = released 版本按 releasedAt ?? updatedAt 倒序第一条的 number，否则 '—'
```

### 文档名校验（`domain/documentName.ts`）

- `MAX_MARKDOWN_FILE_BYTES = 512 * 1024`（512 KiB）
- `validateDocumentName(name)` 返回 `{valid:true, name:NFC+trim}` 或 `{valid:false}`
- 规则：trim 非空、长度 ≤ 180、无 C0/C1 控制字符、必须以 `.md` 或 `.markdown` 结尾（大小写不敏感）

---

## 6. SQLite 表结构（`src/server/sqlite.ts`）

所有表开启 `pragma('foreign_keys = ON')`。枚举字段在 DB 中存为 `INTEGER`，领域模型里是字符串，由仓储层映射。

### `products`

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | — | |
| `name` / `normalized_name` | TEXT | `''` | normalized_name 用于唯一性 |
| `description`, `product_type`, `icon`, `user_count_source`, `app_url`, `repository_path` | TEXT | `''` | |
| `status` | INTEGER | 0 | 0=developing, 1=beta, 2=released, 3=archived |
| `completion_percent` / `user_count` | INTEGER | 0 | |
| `archived_at` | TEXT | `''` | |
| `status_before_archive` | INTEGER | 0 | 归档前状态，恢复时回填 |
| `created_at` / `updated_at` | TEXT | `''` | ISO |
| `is_deleted` | INTEGER | 0 | 软删 |

索引：`CREATE UNIQUE INDEX products_name_uq ON products(normalized_name) WHERE is_deleted=0`

### `work_items` / `versions` / `documents`

三表结构同构：`id INTEGER PK`, `product_id INTEGER FK→products(id)`, 各自业务字段, `created_at`/`updated_at`, `is_deleted`, `archive_deleted`。

- `work_items.type` 0=requirement / 1=bug；`priority` 0..3；`status` 0..2；`due_date` YYYY-MM-DD。
- `versions.status` 0=planned / 1=released；`released_at` 仅在 released 时必填 ISO-Z。
- `documents.content` UTF-8 ≤ 512 KiB；`normalized_name` = NFC + trim + lower。

索引：
- `versions_product_number_uq ON (product_id, number) WHERE is_deleted=0`
- `documents_product_name_uq ON (product_id, normalized_name) WHERE is_deleted=0`
- `work_items_product_idx` / `versions_product_idx` / `documents_product_idx`

迁移：
- `ALTER TABLE products ADD COLUMN status_before_archive`（幂等）
- 为三子表添加 `archive_deleted`（try/catch 静默）

### Repository 接口（`SqliteRepository`）

```ts
listProducts(includeArchived=true)
getProduct / createProduct / updateProduct / archiveProduct / restoreProduct
listWorkItems / createWorkItem / updateWorkItem / deleteWorkItem
listVersions / createVersion / updateVersion / deleteVersion
listDocuments / createDocument / updateDocument / deleteDocument
getProductSummary(pid) => { product, workItems:count, versions:count, documents:count }
transaction(fn) / tableNames() / foreignKeysEnabled() / close()
```

关键约束：
- `archiveProduct`：事务内记录 `status_before_archive`、将 status=3、写 `archived_at`、把三子表 `is_deleted=1, archive_deleted=1`。
- `restoreProduct`：恢复 status（beta/released 用原值，否则 0），清空 `archived_at`，复活 `archive_deleted=1` 的子表。
- `bump(old)`：`updated_at` 单调递增（`max(now, old+1ms)`），避免同毫秒写丢失。

### 错误模型

```ts
class RepositoryError extends Error {
  code: 'VALIDATION_FAILED' | 'NOT_FOUND' | 'CONFLICT' | 'DUPLICATE'
}
```

`mapMutationError` 把 SQLite 错误归一：
- `UNIQUE constraint failed` → `DUPLICATE`
- `FOREIGN KEY constraint failed` → `NOT_FOUND`
- 其它 → `VALIDATION_FAILED`

---

## 7. HTTP API（`src/server/api.ts`）

### 工厂

```ts
createApiHandler({ repository, readGitLog? }) => (req, res) => Promise<void>
```

- `body(req)`：累积 body，**上限 1 MB**，解析失败抛 400。
- `send(res, status, body)`：统一 `application/json`。
- `map(e)` 错误归一：
  - `e.status===400` → `VALIDATION_FAILED/400`
  - `RepositoryError` 按 code → `NOT_FOUND/404`、`CONFLICT|DUPLICATE/409`、其它 400
  - `GitLogError` → `GIT_REPOSITORY_INVALID/400`，其它 500
  - 兜底 `INTERNAL_ERROR/500`

### 路由总表

| 方法 | 路径 | 入参 | 成功响应 |
|---|---|---|---|
| GET | `/api/products` | — | 200，产品 + 每个产品的 `getProductSummary` |
| POST | `/api/products` | `Product` body | 201，新 product |
| GET | `/api/products/:id` | — | 200 / 404 |
| PATCH | `/api/products/:id` | `{...product, expectedUpdatedAt}` | 200 |
| POST | `/api/products/:id/archive` | `{expectedUpdatedAt}` | 200 |
| POST | `/api/products/:id/restore` | `{expectedUpdatedAt}` | 200 |
| GET | `/api/products/:id/commits?limit=5` | query `limit` | 200 `{items, checkedAt}` |
| GET | `/api/products/:id/work-items` | — | 200 |
| POST | `/api/products/:id/work-items` | body（自动剔除 `productId`） | 201 |
| GET | `/api/products/:id/work-items/:childId` | — | 200 / 404 |
| DELETE | `/api/products/:id/work-items/:childId` | — | 200 |
| GET / POST | `/api/products/:id/versions` | 同上 | 200 / 201 |
| GET / DELETE | `/api/products/:id/versions/:childId` | — | 同上 |
| GET / POST | `/api/products/:id/documents` | 同上 | 200 / 201 |
| GET / DELETE | `/api/products/:id/documents/:childId` | — | 同上 |
| PATCH | `/api/work-items/:id` | `{...item, expectedUpdatedAt}` | 200 |
| PATCH | `/api/versions/:id` | `{...version, expectedUpdatedAt}` | 200 |
| PATCH | `/api/documents/:id` | `{...doc, expectedUpdatedAt}` | 200 |

注意：
- `PATCH /api/products/:id` 校验时会与数据库当前值 merge，所以缺省字段也会校验；`expectedUpdatedAt` 在校验后删除。
- 任意未匹配路径 → 404 `NOT_FOUND`。

### 客户端调用（`src/client/api.ts`）

| 函数 | HTTP |
|---|---|
| `fetchSnapshot()` | GET `/api/products` + 聚合子资源 |
| `createProduct(p)` | POST `/api/products` |
| `updateProduct(p, expectedUpdatedAt)` | PATCH `/api/products/:id` |
| `archiveProduct(id, expectedUpdatedAt)` | POST `/api/products/:id/archive` |
| `restoreProduct(id, expectedUpdatedAt)` | POST `/api/products/:id/restore` |
| `createWorkItem(item)` | POST `/api/products/:productId/work-items` |
| `updateWorkItem(item, expectedUpdatedAt)` | PATCH `/api/work-items/:id` |
| `createVersion(v)` | POST `/api/products/:productId/versions` |
| `updateVersion(v, expectedUpdatedAt)` | PATCH `/api/versions/:id` |
| `createDocument(d, expectedUpdatedAt)` | POST `/api/products/:productId/documents` |
| `updateDocument(d, expectedUpdatedAt)` | PATCH `/api/documents/:id` |
| `fetchCommits(productId, signal?, limit=5)` | GET `/api/products/:productId/commits?limit=N` |

统一封装：`request<T>(url, opts)` 解析 `{data?, error?{code,message}}`；非 ok 抛 `ApiError(code?, status?)`。

---

## 8. Git 集成（`src/server/gitLog.ts` + `useCommitPolling.ts`）

### 服务端 `readGitLog(repoPath, limit)`

1. `limit` 校验：整数 ∈ [1, 20]
2. `repoPath` 必须是绝对路径、不含 `\0`
3. `stat` 确认是目录，否则 `GIT_REPOSITORY_INVALID`
4. `git -C <path> rev-parse --is-inside-work-tree` 验证是 Git 工作区
5. `git -C <path> log -n <limit> --date=iso-strict --pretty=format:%H\t%h\t%an\t%aI\t%s`
6. 按 `\t` 切 5 段 → `{sha, shortSha, author, committedAt, subject}`
7. 返回 `{items, checkedAt: now.toISOString()}`

### 客户端轮询 Hook

- 状态：`{commits, loading, error, checkedAt}`
- 空 `productId` 直接清空
- 挂载立即 `load()`，之后 `setInterval(load, 60_000)`
- 每次请求前 `abort()` 上一个 `AbortController`；卸载时清 interval + abort
- `AbortError` 静默忽略，其它错误展示 `'暂时无法读取 Git 更新'`

> Git 失败只显示提示，不影响产品/任务/文档数据。

---

## 9. Vite 插件（`src/server/viteApiPlugin.ts`）

```ts
createViteApiPlugin({ databasePath?, gitReader? }): Plugin
```

- 插件名：`vibe-studio-api`
- `configureServer(server)`：
  1. 默认 DB 路径 `data/vibe-studio.sqlite`（可参数覆盖）
  2. `repo = createSqliteRepository(file)`
  3. `handler = createApiHandler({ repository: repo, readGitLog: gitReader })`
  4. `server.middlewares.use('/api', handler)` — `/api/*` 全部交给 Node 处理
  5. `server.httpServer?.once('close', () => repo?.close())`

效果：开发态访问 `http://localhost:6000/api/*` 即 SQLite API，**无独立后端端口**。

`vite.config.ts` 要点：

```ts
plugins: [react(), createViteApiPlugin()]
server: { port: 6000, strictPort: true }
test: { environment: 'jsdom', setupFiles: './src/test/setup.ts' }
```

---

## 10. 前端路由与状态

`App.tsx` 是路由与状态入口：

- `/` → 重定向 `/products`
- `/products` → `ProductGrid`
- `/products/:productId/:tab?` → `ProductDetail`，5 个子 tab：`overview` / `tasks` / `versions` / `documents` / `settings`；非法 tab 重定向到 `overview`

数据获取：
- `ApiApp`：通过 `fetchSnapshot()` 拉数据，所有 mutation 后 `refresh()`
- `LegacyApp`：注入 `repository` 时使用（旧版 IndexedDB/localStorage 仓储）

### 关键模式

| 模式 | 实现 |
|---|---|
| **变更-后-刷新** | `ApiApp.mutate()`：执行操作 → `refresh()` |
| **乐观锁 token** | 保存时传 `{expectedUpdatedAt}`，后端命中 `*_CONFLICT` |
| **多窗口冲突** | `mutationError.ts` 翻译 + UI 保留草稿；`ProductSettings.externalProduct` 显示冲突提示；`DocumentWorkspace.pending` 走 Modal 三选项（覆盖/另存/取消） |
| **a11y** | `Modal` 焦点陷阱/ESC/Tab 循环；`ProductFields` 通过 `cloneElement` 注入 `aria-invalid`/`aria-describedby`；错误信息 `role="alert"` |
| **拖拽落点** | `TaskCard` 同时 `useDraggable` + `useDroppable(id = item:${id}:${status})`，支持落回原列 |
| **Markdown 安全** | `rehypeSanitize` + 自定义 `img`（阻止图片）/ `a`（仅允许 `#锚点` `http(s)://` `mailto:`）；`PreviewBoundary` ErrorBoundary 防崩溃 |

---

## 11. 表单/校验工具

### `app/productForm.ts`

- `ProductFormValues`：所有字段都是 string，便于表单绑定。
- `getSafeHttpsUrl(value)`：仅放行 `https://` 且 hostname 非空，否则 null。
- `productToFormValues(product?)`：Product → Form，默认 `icon='✨'`、`status='developing'`。
- `validateProductValues(values, products, currentProductId?)`：
  - `name` 唯一性（非大小写敏感，trim 后）
  - `userCount` ≥ 0 整数
  - `appUrl` 必须 HTTPS
- 表单只暴露必填与高频字段；`repositoryPath`、`isPublic`、`showcasePagePath` 收在「高级设置」折叠区，由 `ProductFields` 的 `advancedOpen` 控制。
- `mergeProductValues(product, values, timestamp)`：icon 兜底 `'✨'`；空 `appUrl` → null。
- `createProductId(name, products)`：kebab-case NFKD slug，冲突追加 `-2` `-3`，兜底 `product-${Date.now()}`。

### `app/dateForm.ts`

- `isValidDateValue(value)`：正则 + `Date.UTC` 回环校验
- `dateValueToIso(value)`：`YYYY-MM-DD` → `YYYY-MM-DDT00:00:00.000Z`
- `getLocalDateValue(date)`：基于本地时区生成
- `isoToDateValue(value)`：截前 10 位

### `app/mutationError.ts`

已知错误码 → 中文提示：

| code | 中文 |
|---|---|
| `LOCK_UNAVAILABLE` | 当前无法安全获取写入锁，请稍后重试 |
| `PRODUCT_CONFLICT` | 产品已在其他窗口更新，你的草稿已保留 |
| 其它 | `fallback` |

### `app/workItemTransition.ts`

`resolveWorkItemStatus(currentStatus, targetId)`：

- targetId 形如 `column:todo` 或 `item:${id}:${status}`
- 后缀匹配返回 `WorkItemStatus | null`（与当前状态相同返回 null → 跳过保存）

### `domain/documentName.ts`

- `MAX_MARKDOWN_FILE_BYTES = 512 * 1024`
- `normalizeDocumentName(name)`：`trim().normalize('NFC').toLowerCase()`
- `validateDocumentName(name)`：见 §5

---

## 12. 测试约定

### 命令

```bash
npm test -- --run            # Vitest 单次运行
npm run typecheck:test       # tsc --noEmit -p tsconfig.test.json
npm run lint                 # oxlint
npm run build                # tsc -b + typecheck:test + vite build
```

### 测试目录

```
tests/
├── app/         # React 组件 + 交互（App / TaskBoardDnd / TasksVersions / AppDocuments）
├── client/      # api / useCommitPolling
├── config/      # vitest 配置冒烟
├── data/        # Legacy 仓储：documentRepositoryConcurrency / indexedDbMutationLock / studioRepository
├── domain/      # documentName / productMetrics
└── server/      # gitLog / sqlite
```

测试模式：
- 组件测试用 `jsdom + @testing-library/react` + `userEvent`
- 服务端测试用真实 `better-sqlite3`（memory 或 temp file）
- 仓储测试覆盖：单调时间戳、唯一约束、外键、归档恢复、多窗口冲突 token

### TS 配置

- `tsconfig.app.json`：`target es2023`、`jsx react-jsx`、`verbatimModuleSyntax`、`erasableSyntaxOnly`
- `tsconfig.test.json`：extends app + 加 `vitest/globals`、`@testing-library/jest-dom`
- `tsconfig.node.json`：用于 `vite.config.ts`

### Lint（`.oxlintrc.json`）

```json
{
  "plugins": ["react", "typescript", "oxc"],
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

---

## 13. 开发与部署注意事项

- 端口 `6000` 是 `strictPort`，被占用直接失败，**不要改回默认 5173**。
- 应用使用 `BrowserRouter`，生产部署必须把未知深链 fallback 到 `index.html`：
  - Nginx：`try_files $uri $uri/ /index.html`
  - Vercel/Netlify：启用 SPA rewrite
- SQLite 文件位于 `data/vibe-studio.sqlite`，已被 `.gitignore` 忽略；首次启动空库，**不会**迁移旧 `localStorage`。
- Markdown 文件限制：`.md`/`.markdown`、单文件 ≤ 512 KiB；生产环境大文件请用服务端存储。
- Git 路径必须为绝对路径；Git 失败只显示提示，不阻塞产品/任务/文档。
- **Vite 监听配置**：`server.watch.ignored` 排除了 `data/` 下的 SQLite 文件。数据库每次写入都会产生文件变更，
  若被监听到会触发整页 reload 并打断进行中的 API 请求（表现为产品列表一直为空）。
  作品页 HTML 未被排除，仍可正常通过 `/data/products/<id>/showcase.html` 访问。

## 13.1 响应式断点（`src/styles/*.css`）

| 断点 | 布局变化 |
|---|---|
| `> 1180px` | 宽屏：概览页两栏（摘要+指标 \| Git 记录，后者 sticky）、指标卡横排、设置表单限宽 860px |
| `≤ 1180px` | 常规桌面：单栏概览、产品网格按 `auto-fit` 自适应列数 |
| `≤ 980px` | 侧栏收窄至 200px，产品网格降为 2 列 |
| `≤ 720px` | 移动端：侧栏收为顶部条、全部单列、表单标题行保持横向 |

网格统一用 `repeat(auto-fit, minmax(min(Xpx, 100%), 1fr))`：`auto-fit` 让末尾空轨道塌缩（产品少时不留空列），
`min()` 兜底避免窄屏横向溢出。

---

## 14. 常见改动指引（给 AI）

| 想做的事 | 看哪里 |
|---|---|
| 新增产品字段 | `domain/models.ts` → `app/productForm.ts` → `server/sqlite.ts` 建表/迁移 → `server/api.ts` 校验 |
| 新增工作项字段 | `domain/models.ts` → `app/TaskBoard.tsx` → `server/sqlite.ts` → `server/api.ts` |
| 新增枚举值 | `domain/models.ts` + `app/*Presentation.ts` 标签 + `server/sqlite.ts` INTEGER 映射 |
| 新增 API 端点 | `server/api.ts` 路由 + `client/api.ts` 封装 + `app/ApiApp` 调用 |
| 改 Markdown 预览 | `app/DocumentWorkspace.tsx`（`components` 自定义渲染器） |
| 改拖拽规则 | `app/workItemTransition.ts` + `TaskBoard.finishDrag` |
| 调整轮询频率 | `client/useCommitPolling.ts`（当前 60_000 ms） |
| 新增并发锁策略 | `data/studioRepository.ts`（仅 Legacy 路径） |
| 加全局 a11y | `app/Modal.tsx` + `app/ProductFields.tsx` 的 `cloneElement` 模式 |

---

## 15. 已知/显式约束

- Vite 端口固定 `6000`，不能改回 `5173`。
- 所有 mutation 必须传 `expectedUpdatedAt`（新建传 `null`），后端会做乐观锁。
- `legacy StudioRepository` 仅供测试 / 历史回退；新增功能**不要走该路径**。
- 文档名校验失败时，前端不进入保存逻辑；后端 `RepositoryError` 也会被 `mapMutationError` 归一为 `DUPLICATE`。
- Git 路径只能是绝对路径且必须是工作区；CLI 调用用 `git -C` 而非 `chdir`，避免进程级副作用。