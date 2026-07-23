# Vibe Studio 任务系统重做设计

## 1. 目标与范围

当前任务模块（`src/app/TaskBoard.tsx`）存在三类用户痛点：

1. **无法删除** —— 服务端 `DELETE /api/products/:id/work-items/:wid` 已存在（`src/server/api.ts:25`），但前端 `TaskBoard` 没有删除按钮，看板无法清理。
2. **删除无追溯** —— `src/server/sqlite.ts` 中 `deleteWorkItem` 直接执行 SQL DELETE，行消失后无法知道「谁、什么时候、为什么删」。
3. **任务信息太薄** —— 模型只有 `title / type / priority / dueDate / status`，无描述、无评论、无变更历史。
4. **UI 简陋** —— 任务区配色单调（裸 pill 灰底）、无空状态、看板层次不清。

本次重做范围：

1. 软删除 + 回收站机制（30 天保留期），过期自动清理。
2. 任务增加描述、负责人；详情抽屉展示描述 + 评论 + 完整活动时间线。
3. 任务区视觉打磨（彩色 chip、列色点、空状态、回收站入口），保持极简调性，不动 Product / Version / Document 等页面。
4. 提供手动「永久删除」入口供用户立即清理。

不在范围：

- 不改 Product / Version / Document 任何模型或 UI
- 不引入实时协作、@提及、推送通知
- 不改服务端端口、API 鉴权、SQLite 文件位置

## 2. 总体架构

```text
React UI
   │ HTTP /api
   ▼
Vite Node 中间件（:6000）
   └── SQLite CRUD（better-sqlite3）
        ├── work_items        （+ isDeleted/deletedAt/deletedBy/description/assignee）
        ├── work_item_comments（新表）
        ├── work_item_events  （新表）
        └── 启动 sweep：purgeOldDeletedWorkItems(30)
```

- 沿用 `src/server/sqlite.ts` 的 `Repository` 接口风格，新增方法挂同名 export。
- 沿用 `src/server/api.ts` 的路由拼接约定，新端点写在 `m = ...work-items...` 的子分支。
- 前端沿用 `src/client/api.ts` 的命名风格 + 乐观锁 `expectedUpdatedAt` 模式。
- 启动 sweep 在 `createApiHandler` 工厂外层或 vite 插件里执行一次，失败仅 warn 不阻塞。

## 3. 数据模型

### 3.1 work_items（增量字段）

```sql
ALTER TABLE work_items ADD COLUMN is_deleted  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE work_items ADD COLUMN deleted_at  TEXT;
ALTER TABLE work_items ADD COLUMN deleted_by  TEXT NOT NULL DEFAULT '';
ALTER TABLE work_items ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE work_items ADD COLUMN assignee    TEXT NOT NULL DEFAULT '';
```

迁移策略：现有库用 `ALTER TABLE`；新库由建表脚本直接包含。版本兼容在 `src/server/sqlite.ts` 的 `migrate()` 里追加。

### 3.2 work_item_comments（新表）

```sql
CREATE TABLE work_item_comments (
  id           TEXT PRIMARY KEY,
  work_item_id TEXT NOT NULL,
  author       TEXT NOT NULL DEFAULT '',
  body         TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL,
  FOREIGN KEY (work_item_id) REFERENCES work_items(id) ON DELETE CASCADE
);
CREATE INDEX idx_wic_item ON work_item_comments(work_item_id, created_at);
```

### 3.3 work_item_events（新表）

```sql
CREATE TABLE work_item_events (
  id           TEXT PRIMARY KEY,
  work_item_id TEXT NOT NULL,
  type         TEXT NOT NULL,         -- 'created' | 'status_changed' | 'commented' | 'deleted' | 'restored' | 'purged' | 'edited'
  actor        TEXT NOT NULL DEFAULT '',
  from_status  TEXT,
  to_status    TEXT,
  meta         TEXT NOT NULL DEFAULT '{}',  -- JSON：编辑/删除原因等
  created_at   TEXT NOT NULL,
  FOREIGN KEY (work_item_id) REFERENCES work_items(id) ON DELETE CASCADE
);
CREATE INDEX idx_wie_item ON work_item_events(work_item_id, created_at);
```

### 3.4 Domain 模型（src/domain/models.ts）

```ts
export type WorkItemEventType =
  | 'created' | 'status_changed' | 'commented'
  | 'deleted' | 'restored' | 'purged' | 'edited'

export interface WorkItem {
  id: string
  productId: string
  type: WorkItemType
  title: string
  description: string          // 新增
  assignee: string             // 新增
  priority: Priority
  dueDate: string | null
  status: WorkItemStatus
  createdAt: string
  updatedAt: string
  isDeleted: boolean           // 新增
  deletedAt: string | null     // 新增
  deletedBy: string            // 新增
}

export interface WorkItemComment {
  id: string
  workItemId: string
  author: string
  body: string
  createdAt: string
}

export interface WorkItemEvent {
  id: string
  workItemId: string
  type: WorkItemEventType
  actor: string
  fromStatus: WorkItemStatus | null
  toStatus: WorkItemStatus | null
  meta: Record<string, unknown>
  createdAt: string
}
```

### 3.5 仓储 API（src/server/sqlite.ts 增量）

```ts
listWorkItems(productId, opts?: { includeDeleted?: boolean; onlyDeleted?: boolean }): WorkItem[]
getWorkItem(productId, id): WorkItem | null            // 沿用现有 getWorkItem 语义，补 deleted 校验

softDeleteWorkItem(id, actor, expectedUpdatedAt): WorkItem          // 设 is_deleted/deleted_at/deleted_by + 写 deleted event
restoreWorkItem(id, actor, expectedUpdatedAt): WorkItem             // 清字段 + 写 restored event
purgeWorkItem(id, expectedUpdatedAt): void                            // 立即硬删 + 写 purged event
purgeOldDeletedWorkItems(retentionDays: number): number               // 启动 sweep

createComment(workItemId, author, body): WorkItemComment             // 写 commented event
listComments(workItemId): WorkItemComment[]

listEvents(workItemId): WorkItemEvent[]                               // 按 created_at 升序
recordStatusChange(workItemId, from, to, actor): WorkItemEvent       // saveStatus 触发
recordCreate(workItemId, actor): WorkItemEvent                        // createWorkItem 触发
```

事件写入由仓储封装，UI 不直接调 `recordXxx`，而是经 `saveStatus / softDelete / restore / create / createComment` 自动产生。

### 3.6 错误码

复用 `RepositoryError`：

| 错误码 | 场景 |
| --- | --- |
| `NOT_FOUND` | 工作项不存在（getWorkItem / delete / restore） |
| `CONFLICT` | expectedUpdatedAt 不匹配 |
| `VALIDATION_FAILED` | title 空、status 非法、id 不属于 productId |
| `ALREADY_DELETED` | 删除已软删除的工作项 → 409 |
| `NOT_DELETED` | 恢复未删除的工作项 → 409 |

### 3.7 软删除语义与冲突保护

- `softDeleteWorkItem` / `restoreWorkItem` 都接受 `expectedUpdatedAt`，与其他 PATCH 一致。
- 删除前二次校验 `workItemId.productId === currentProductId`，防跨产品 ID 串改。
- `restoreWorkItem` 写 `restored` event 后，`is_deleted=0`、`deleted_at=null`、`updated_at=now`。
- `purgeWorkItem` 也走乐观锁；触发 `purged` event，但同时 `DELETE FROM work_items WHERE id=?`，cascade 自动删 comments/events。
- `purgeOldDeletedWorkItems(30)` 扫描 `is_deleted=1 AND deleted_at < now - 30d`；每条先写 `purged` event 再删行（保留事件行）。

## 4. HTTP API

所有路由挂 `src/server/api.ts` 的既有 `m = p.match(/^\/api\/products\/([^/]+)(?:\/(.*))?$/)` 分支。`work-items` 子树扩展如下。

### 4.1 工作项 CRUD（修改既有 + 新增）

```
GET    /api/products/:id/work-items?includeDeleted=1&onlyDeleted=1
POST   /api/products/:id/work-items                       body: WorkItem  → 201 WorkItem（写 created event）
GET    /api/products/:id/work-items/:wid                                        → 200 WorkItem
PATCH  /api/products/:id/work-items/:wid                  body: { expectedUpdatedAt, ...fields } → 200 WorkItem（写 edited event）
DELETE /api/products/:id/work-items/:wid                  body: { expectedUpdatedAt, actor } → 200 WorkItem（写 deleted event）
POST   /api/products/:id/work-items/:wid/restore          body: { expectedUpdatedAt, actor } → 200 WorkItem
DELETE /api/products/:id/work-items/:wid/permanent        body: { expectedUpdatedAt }        → 200 null
```

`actor` 取自请求 header `X-Vibe-Actor`（可空字符串默认）。

Query 语义：

- 默认（无 query）：仅返回 `is_deleted=0`
- `includeDeleted=1`：全部
- `onlyDeleted=1`：仅回收站

### 4.2 评论（新资源）

```
GET    /api/products/:id/work-items/:wid/comments         → WorkItemComment[]
POST   /api/products/:id/work-items/:wid/comments         body: { author, body } → 201 WorkItemComment（自动写 commented event）
```

### 4.3 事件/历史（新资源）

```
GET    /api/products/:id/work-items/:wid/events           → WorkItemEvent[]  # 按 created_at 升序
```

### 4.4 自动清理（启动 sweep，不暴露 HTTP）

- 在 `viteApiPlugin` 配置时调用 `repository.purgeOldDeletedWorkItems(30)`
- 删除前对每行写 `purged` event（保留审计）
- try/catch 失败仅 warn，不阻塞 dev server

### 4.5 前端 API client 增量（src/client/api.ts）

```ts
api.listWorkItems(productId, opts?: { includeDeleted?: boolean; onlyDeleted?: boolean }): Promise<WorkItem[]>
api.softDeleteWorkItem(productId, workItemId, expectedUpdatedAt, actor): Promise<void>
api.restoreWorkItem(productId, workItemId, expectedUpdatedAt, actor): Promise<void>
api.purgeWorkItem(productId, workItemId, expectedUpdatedAt): Promise<void>
api.listWorkItemComments(productId, workItemId): Promise<WorkItemComment[]>
api.createWorkItemComment(productId, workItemId, body: { author; body: string }): Promise<WorkItemComment>
api.listWorkItemEvents(productId, workItemId): Promise<WorkItemEvent[]>
```

`App.tsx` 的 `useStudio` 增加对应 handlers，沿用 `mutate()` 包装（操作后自动 `refresh()`）。

## 5. 前端组件拆分

### 5.1 文件结构

```
src/app/
  TaskBoard.tsx            # 重写：顶部 tab（看板/回收站），传入新 handlers
  TaskColumn.tsx           # 新抽出：列容器 + droppable + 状态色点
  TaskCard.tsx             # 新抽出：单卡，菜单（编辑/删除），点击触发详情抽屉
  TaskDialog.tsx           # 新建/编辑弹窗，沿用 Modal，新增 description/assignee
  TaskDetailDrawer.tsx     # 新：右侧抽屉，描述 + 评论 + timeline
  TaskTrashList.tsx        # 新：回收站列表，含剩余天数、恢复/永久删除按钮
  taskPresentation.ts      # 新：eventTypeLabels、deadline 着色规则、剩余天数文案
  taskColorTokens.ts       # 新：颜色 token 集中管理

src/styles/
  task.css                 # 新：chip、列色点、抽屉、时间线、空状态样式
                            # 现有 global.css 的 .task-* 类整体迁出/替换
```

### 5.2 TaskBoard 重写

- 顶部 tab：`[ 看板 ] [ 回收站 N ]`，纯按钮切换 `view: 'board' | 'trash'`
- 看板态：
  - 列色点 + 状态名 + 数量
  - chip 筛选条：全部 / 需求 / Bug / 紧急
  - 空列：文案 "还没有{状态}的任务"
  - 底部状态条："进行中 X · 待处理 Y · 已完成 Z" + 回收站入口
- 回收站态：渲染 `<TaskTrashList>`
- props 增加：`onDeleteWorkItem / onRestoreWorkItem / onPurgeWorkItem / onUpdateWorkItem`
- 保留：`@dnd-kit/core` 拖拽改状态逻辑（`workItemTransition.ts`）

### 5.3 TaskCard

- 字段展示：
  - 类型 chip（需求紫 / Bug 红）
  - 优先级 chip（低/中/高/urgent，按颜色 token 渲染）
  - 截止日期 chip（剩余天数 / 已过期着色）
  - 标题
  - 负责人头像缩写（取 `assignee` 首字母，无则不显示）
- 右上角 `⋯` 菜单：`编辑 / 删除`
- 点击卡片主体 → `onOpenDetail(item)`
- 拖拽手柄保留（`⠿`）

### 5.4 TaskDialog（新建/编辑）

- 沿用现有 Modal + form 结构
- 字段：title（必填）、type、priority、dueDate、assignee、description（textarea 4 行）
- 编辑模式：标题置顶 + 一组 chip
- 校验保留：title 必填、dueDate 格式

### 5.5 TaskDetailDrawer

- 右侧抽屉，宽度 480px，挡住部分看板
- 顶部：标题（点击变 input 保存）+ 状态 dropdown + 类型/优先级/截止日期/负责人 chip（行内编辑）
- 中部：描述（Markdown 编辑 ↔ 预览 tab，沿用 `react-markdown` + `rehype-sanitize`）
- 中下部：评论列表 + 输入框（提交触发 `createWorkItemComment`）
- 底部：**活动时间线**（最新在上）：
  - created：{actor} 创建
  - status_changed：从 {fromStatus} → {toStatus}
  - edited：{actor} 修改了 {meta.field}（解析 meta JSON）
  - commented：{actor} 评论
  - deleted / restored / purged：{actor} {动作} 任务
- 关闭：右上角 X 或 ESC

### 5.6 TaskTrashList

- 每行展示：标题、原状态 pill、删除人、删除时间、剩余天数（"还剩 X 天" / "明天到期" / "已过期"）
- 操作：`[恢复]`（紫色）+ `[永久删除]`（红色，需 confirm）
- 空状态："回收站是空的"

### 5.7 颜色 token（taskColorTokens.ts）

```ts
export const taskColorTokens = {
  statusColumnDot: { todo: '#b3b8c5', in_progress: '#6259e8', done: '#14845a' },
  chipType: {
    requirement: { bg: '#efefff', fg: '#4f48c8' },
    bug:        { bg: '#ffe7ea', fg: '#c33e4e' },
  },
  chipPriorityBg:  { low: '#e3f8ef', medium: '#f1f2f6', high: '#fff4db', urgent: '#ffe7ea' },
  chipPriorityFg:  { low: '#14845a', medium: '#656977', high: '#a45b0c', urgent: '#c33e4e' },
  dueDateWarn:     '#a45b0c',
  dueDateOverdue:  '#c33e4e',
}
```

### 5.8 沿用与复用

- `Modal`：新建、编辑、删除确认、永久删除确认
- `mutationError.ts`：错误展示
- `workItemTransition.ts`：拖拽改状态逻辑保留
- `workItemPresentation.ts`：labels 字典保留，新增 `eventTypeLabels`
- `dateForm.ts`：截止日期格式化，新增 `formatRelativeDays(iso)` → "还剩 X 天" / "已过期 Y 天"

## 6. 测试

`tests/` 下新增：

- `taskColorTokens.test.ts` —— 所有 token 字段覆盖
- `taskPresentation.test.ts` —— event 文案、剩余天数文案
- `TaskCard.test.tsx` —— 渲染、点击触发回调、菜单触发删除回调
- `TaskDetailDrawer.test.tsx` —— 描述编辑、评论提交、timeline 渲染、关闭
- `TaskTrashList.test.tsx` —— 恢复/永久删除按钮、剩余天数显示
- `TaskBoard.test.tsx` —— tab 切换、过滤、删除流程（用 vi.fn mock handlers）
- `sqlite-work-items.test.ts` —— 软删除、恢复、永久删除、过期 purge、event 自动写入
- `api-work-items.test.ts` —— 路由正确性、错误码（ALREADY_DELETED / NOT_DELETED / NOT_FOUND / CONFLICT）

沿用既有 testing-library + vitest 配置。

## 7. CR 检查点（自审）

- 数据库：所有新字段 NOT NULL + 默认值；新表 COLLATE 与既有 `work_items` 一致（默认 utf8mb4_general_ci）
- API：所有 PATCH/DELETE/POST 走 `expectedUpdatedAt` 乐观锁
- UI：保留现有 Modal / dnd-kit / 工作台布局模式，不破坏 Product / Version / Document 页面
- 代码：组件粒度 TaskCard / TaskColumn / TaskDetailDrawer / TaskTrashList 各自职责单一
- 数据隔离：`softDeleteWorkItem` 二次校验 `productId` 一致
- 性能：`work_item_events` 按 `work_item_id, created_at` 索引；列表查询默认不返回已删除

## 8. 发布步骤

1. 后端：`src/server/sqlite.ts` 加新方法 + 迁移 SQL；`src/server/api.ts` 扩路由；启动 sweep 接入
2. API client：`src/client/api.ts` 新增函数
3. 类型：`src/domain/models.ts` 新增类型
4. UI 组件：`src/app/TaskBoard.tsx` 重写并拆出子组件
5. 样式：`src/styles/task.css` 新增；`src/styles/global.css` 移除/精简 `.task-*` 类
6. 测试：覆盖单元 + 集成 + e2e 拖拽
7. `npm run typecheck:test && npm run build && npm test -- --run`
8. 手动验收：创建 → 编辑 → 评论 → 删除 → 恢复 → 永久删除 → 改 `deleted_at` 模拟过期验证 purge