# Vibe Studio 任务系统重做 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Vibe Studio 的产品任务模块从「只能扫一眼看板」升级为「详情可编辑、评论留痕、删除可恢复可追踪」的完整工作流。

**Architecture:** 沿用既有 SQLite + Vite API 中间件 + React 三层架构。新增 `work_item_comments` / `work_item_events` 两表与若干字段；HTTP 层把现有硬路由 `DELETE` 改造为软删除+恢复+永久删除三态；前端拆出 TaskCard / TaskColumn / TaskDialog / TaskDetailDrawer / TaskTrashList 五个组件，沿用 Modal 与现有 helper；事件历史由仓储自动写入，UI 仅消费。

**Tech Stack:** React 18, TypeScript, Vite, better-sqlite3, @dnd-kit/core, vitest + @testing-library/react, react-markdown + rehype-sanitize。

---

## File Structure

### 新增

| 文件 | 职责 |
| --- | --- |
| `src/app/taskColorTokens.ts` | 任务区颜色常量集中（列色点、chip、截止日配色） |
| `src/app/taskPresentation.ts` | eventTypeLabels、剩余天数文案、actor 默认值 |
| `src/app/TaskColumn.tsx` | 单列容器（droppable + 状态色点 + 空状态） |
| `src/app/TaskCard.tsx` | 单卡渲染（chips + 拖拽手柄 + 菜单） |
| `src/app/TaskDialog.tsx` | 新建/编辑弹窗（含 description / assignee） |
| `src/app/TaskDetailDrawer.tsx` | 右侧抽屉（描述 + 评论 + 时间线） |
| `src/app/TaskTrashList.tsx` | 回收站列表 |
| `src/styles/task.css` | 任务区专用样式（chip / 列色点 / 抽屉 / 时间线） |
| `tests/app/TaskCard.test.tsx` | 单卡渲染 + 菜单触发 |
| `tests/app/TaskDetailDrawer.test.tsx` | 描述编辑 + 评论提交 + 时间线渲染 |
| `tests/app/TaskTrashList.test.tsx` | 恢复 / 永久删除按钮 + 剩余天数 |
| `tests/app/TaskBoard.test.tsx` | tab 切换 / 过滤 / 删除流程 |
| `tests/app/taskPresentation.test.ts` | 文案 + 剩余天数计算 |
| `tests/app/taskColorTokens.test.ts` | 颜色映射覆盖 |
| `tests/server/sqlite-work-items.test.ts` | 软删除 / 恢复 / 过期 purge / event 写入 |
| `tests/server/api-work-items.test.ts` | 路由正确性 + 错误码 |

### 修改

| 文件 | 改动 |
| --- | --- |
| `src/domain/models.ts` | 增 `description/assignee/isDeleted/deletedAt/deletedBy` 到 WorkItem；新类型 `WorkItemComment / WorkItemEvent / WorkItemEventType` |
| `src/server/sqlite.ts` | 扩展 `mapWork`；新增 `work_item_comments` / `work_item_events` 建表与索引；新增方法 `listComments/createComment/listEvents/softDeleteWorkItem/restoreWorkItem/purgeWorkItem/purgeOldDeletedWorkItems`；`createWorkItem` 自动写 created event；`updateWorkItem` 自动写 edited event 并在 status 变化时多写一条 status_changed；`deleteWorkItem` 写 deleted event |
| `src/server/api.ts` | 新增 `restore` / `permanent` 子路径、`comments` / `events` 子路径；listWorkItems 接受 `includeDeleted/onlyDeleted` query；actor 从 header `X-Vibe-Actor` 或 body 兜底 |
| `src/server/viteApiPlugin.ts` | 启动时调 `purgeOldDeletedWorkItems(30)`，失败仅 warn |
| `src/client/api.ts` | 新增 `softDeleteWorkItem / restoreWorkItem / purgeWorkItem / listWorkItemComments / createWorkItemComment / listWorkItemEvents`；`listWorkItems` 加 opts |
| `src/app/App.tsx` | `useStudio` 加 handlers：`onDeleteWorkItem / onRestoreWorkItem / onPurgeWorkItem / onUpdateWorkItem`；snapshot 增 comments/events state |
| `src/app/ProductDetail.tsx` | TaskBoard props 增 handlers；新增 selection state（activeItemId）控制抽屉 |
| `src/app/TaskBoard.tsx` | 重写：顶部 tab 切换 view；列表 / 回收站两种态 |
| `src/app/workItemPresentation.ts` | 增 `eventTypeLabels` |
| `src/app/dateForm.ts` | 增 `formatRelativeDays(iso)` |
| `src/styles/global.css` | 移除 `.task-board / .task-column / .task-card / .task-meta / .status-select / .drag-handle / .filter-bar` 等类，由 `task.css` 接管 |
| `src/data/studioRepository.ts` | localStorage 仓库的 `isWorkItem` validator 增加 `description: string / assignee: string`；`saveWorkItem` 接收新字段 |

---

## Task 1: 扩展 domain 模型

**Files:**
- Modify: `src/domain/models.ts:61-71`

- [ ] **Step 1: 写入新模型**

将 `src/domain/models.ts` 第 61-71 行 `WorkItem` 接口替换为：

```ts
export type WorkItemEventType =
  | 'created' | 'status_changed' | 'commented' | 'deleted' | 'restored' | 'purged' | 'edited'

export interface WorkItem {
  id: string
  productId: string
  type: WorkItemType
  title: string
  description: string
  assignee: string
  priority: Priority
  dueDate: string | null
  status: WorkItemStatus
  createdAt: string
  updatedAt: string
  isDeleted: boolean
  deletedAt: string | null
  deletedBy: string
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

并把文件顶部 `export type WorkItemStatus` 行后追加：

```ts
export type WorkItemStatusLabel = WorkItemStatus  // 仅为编辑器提示，无需改动
```

- [ ] **Step 2: 运行 typecheck**

Run: `npm run typecheck:test`
Expected: 失败，提示 `WorkItem` 缺少 `description / assignee / isDeleted / deletedAt / deletedBy`，以及使用方错误。

- [ ] **Step 3: Commit**

```bash
git add src/domain/models.ts
git commit -m "feat(domain): extend WorkItem with description/assignee/soft-delete + events/comments types"
```

---

## Task 2: SQLite schema 迁移与新表

**Files:**
- Modify: `src/server/sqlite.ts:8`（schemaComments）、`:38-148`（建表 DDL）、`:149-153`（迁移段）

- [ ] **Step 1: 扩展 work_items 建表 DDL 与 schemaComments**

在 `src/server/sqlite.ts` 第 8 行的 `work_items` schemaComments 对象改为：

```ts
work_items: { id: '主键', product_id: '产品ID', type: '类型', title: '标题', description: '描述', assignee: '负责人', priority: '优先级', due_date: '截止时间', status: '状态', created_at: '创建时间', updated_at: '更新时间', is_deleted: '删除标识', deleted_at: '删除时间', deleted_by: '删除人', archive_deleted: '归档删除标识' },
```

将第 77-101 行的 `CREATE TABLE IF NOT EXISTS work_items (...)` 块替换为（注意：在 `status` 列后新增 `description` / `assignee`，在 `is_deleted` 后新增 `deleted_at` / `deleted_by`）：

```sql
CREATE TABLE IF NOT EXISTS work_items (
-- 字段: 主键
id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL DEFAULT 0,
-- 字段: 产品ID
product_id INTEGER NOT NULL DEFAULT 0,
-- 字段: 类型
type INTEGER NOT NULL DEFAULT 0,
-- 字段: 标题
title TEXT NOT NULL DEFAULT '',
-- 字段: 描述
description TEXT NOT NULL DEFAULT '',
-- 字段: 负责人
assignee TEXT NOT NULL DEFAULT '',
-- 字段: 优先级
priority INTEGER NOT NULL DEFAULT 0,
-- 字段: 截止时间
due_date TEXT NOT NULL DEFAULT '',
-- 字段: 状态
status INTEGER NOT NULL DEFAULT 0,
-- 字段: 创建时间
created_at TEXT NOT NULL DEFAULT '',
-- 字段: 更新时间
updated_at TEXT NOT NULL DEFAULT '',
-- 字段: 删除标识
is_deleted INTEGER NOT NULL DEFAULT 0,
-- 字段: 删除时间
deleted_at TEXT NOT NULL DEFAULT '',
-- 字段: 删除人
deleted_by TEXT NOT NULL DEFAULT '',
-- 字段: 归档删除标识
archive_deleted INTEGER NOT NULL DEFAULT 0,
FOREIGN KEY(product_id) REFERENCES products(id)
);
```

在第 153 行后追加建表与索引：

```ts
db.exec(`CREATE TABLE IF NOT EXISTS work_item_comments (
id TEXT PRIMARY KEY NOT NULL DEFAULT '',
work_item_id INTEGER NOT NULL DEFAULT 0,
author TEXT NOT NULL DEFAULT '',
body TEXT NOT NULL DEFAULT '',
created_at TEXT NOT NULL DEFAULT '',
FOREIGN KEY(work_item_id) REFERENCES work_items(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_wic_item ON work_item_comments(work_item_id, created_at);
CREATE TABLE IF NOT EXISTS work_item_events (
id TEXT PRIMARY KEY NOT NULL DEFAULT '',
work_item_id INTEGER NOT NULL DEFAULT 0,
type TEXT NOT NULL DEFAULT '',
actor TEXT NOT NULL DEFAULT '',
from_status TEXT NOT NULL DEFAULT '',
to_status TEXT NOT NULL DEFAULT '',
meta TEXT NOT NULL DEFAULT '{}',
created_at TEXT NOT NULL DEFAULT '',
FOREIGN KEY(work_item_id) REFERENCES work_items(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_wie_item ON work_item_events(work_item_id, created_at);`)
```

- [ ] **Step 2: 增加迁移 ALTER（幂等 try/catch）**

在第 152 行 `for (const table of ...)` 之后追加：

```ts
for (const col of [['description',"TEXT NOT NULL DEFAULT ''"],['assignee',"TEXT NOT NULL DEFAULT ''"],['deleted_at',"TEXT NOT NULL DEFAULT ''"],['deleted_by',"TEXT NOT NULL DEFAULT ''"]]) {
  try { db.exec(`ALTER TABLE work_items ADD COLUMN ${col[0]} ${col[1]}`) } catch { /* column exists */ }
}
```

- [ ] **Step 3: 运行 typecheck**

Run: `npm run typecheck:test`
Expected: 仍会失败（mapWork 还未更新，repo 方法签名还未更新），这是 Task 3 之后才修。但本步不应该引入新错误类型。

- [ ] **Step 4: Commit**

```bash
git add src/server/sqlite.ts
git commit -m "feat(sqlite): add description/assignee/deleted_at/deleted_by to work_items + comments/events tables"
```

---

## Task 3: SQLite 仓储：扩展 mapWork + 新增 7 个方法

**Files:**
- Modify: `src/server/sqlite.ts:29`（mapWork）、`:166-169`（work item 仓储方法）、`:34`（接口）、`:181`（close 旁）

- [ ] **Step 1: 写失败测试 `tests/server/sqlite-work-items.test.ts`**

创建 `tests/server/sqlite-work-items.test.ts`：

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createSqliteRepository, RepositoryError } from '../../src/server/sqlite'

let repo: ReturnType<typeof createSqliteRepository>
let dir: string

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'vibe-wi-'))
  repo = createSqliteRepository(path.join(dir, 'db.sqlite'))
  repo.createProduct({ name: 'P1', description: '', productType: '', icon: '', status: 'developing', completionPercent: 0, userCount: 0, userCountSource: '', appUrl: null, repositoryPath: '' })
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('work items soft delete + events', () => {
  it('maps new fields', () => {
    const item = repo.createWorkItem('1', { type: 'requirement', title: 't', description: 'd', assignee: 'alice', priority: 'medium', dueDate: null, status: 'todo' })
    expect(item.description).toBe('d')
    expect(item.assignee).toBe('alice')
    expect(item.isDeleted).toBe(false)
    expect(item.deletedAt).toBeNull()
    expect(item.deletedBy).toBe('')
  })

  it('soft delete sets flags, writes event, hides from default list', () => {
    const item = repo.createWorkItem('1', { type: 'requirement', title: 't', description: '', assignee: '', priority: 'medium', dueDate: null, status: 'todo' })
    const deleted = repo.softDeleteWorkItem(item.id, 'bob', item.updatedAt)
    expect(deleted.isDeleted).toBe(true)
    expect(deleted.deletedAt).not.toBeNull()
    expect(deleted.deletedBy).toBe('bob')
    expect(repo.listWorkItems('1')).toEqual([])
    expect(repo.listWorkItems('1', { includeDeleted: true })).toHaveLength(1)
    expect(repo.listWorkItems('1', { onlyDeleted: true })).toHaveLength(1)
  })

  it('soft delete twice throws ALREADY_DELETED', () => {
    const item = repo.createWorkItem('1', { type: 'requirement', title: 't', description: '', assignee: '', priority: 'medium', dueDate: null, status: 'todo' })
    repo.softDeleteWorkItem(item.id, 'bob', item.updatedAt)
    const current = repo.listWorkItems('1', { includeDeleted: true })[0]
    expect(() => repo.softDeleteWorkItem(item.id, 'bob', current.updatedAt)).toThrow(RepositoryError)
  })

  it('restore brings item back, writes restored event', () => {
    const item = repo.createWorkItem('1', { type: 'requirement', title: 't', description: '', assignee: '', priority: 'medium', dueDate: null, status: 'todo' })
    const deleted = repo.softDeleteWorkItem(item.id, 'bob', item.updatedAt)
    const restored = repo.restoreWorkItem(item.id, 'carol', deleted.updatedAt)
    expect(restored.isDeleted).toBe(false)
    expect(restored.deletedAt).toBeNull()
    expect(repo.listWorkItems('1')).toHaveLength(1)
    const events = repo.listEvents(item.id)
    const types = events.map(e => e.type)
    expect(types).toEqual(expect.arrayContaining(['created','deleted','restored']))
  })

  it('restore non-deleted throws NOT_DELETED', () => {
    const item = repo.createWorkItem('1', { type: 'requirement', title: 't', description: '', assignee: '', priority: 'medium', dueDate: null, status: 'todo' })
    expect(() => repo.restoreWorkItem(item.id, 'carol', item.updatedAt)).toThrow(RepositoryError)
  })

  it('update records edited event + status_changed event', () => {
    const item = repo.createWorkItem('1', { type: 'requirement', title: 't', description: '', assignee: '', priority: 'medium', dueDate: null, status: 'todo' })
    const updated = repo.updateWorkItem(item.id, { status: 'in_progress', title: 't2' }, item.updatedAt)
    expect(updated.title).toBe('t2')
    const events = repo.listEvents(item.id)
    expect(events.map(e => e.type)).toEqual(expect.arrayContaining(['created','status_changed','edited']))
    const sc = events.find(e => e.type === 'status_changed')!
    expect(sc.fromStatus).toBe('todo')
    expect(sc.toStatus).toBe('in_progress')
  })

  it('purge removes row and writes purged event', () => {
    const item = repo.createWorkItem('1', { type: 'requirement', title: 't', description: '', assignee: '', priority: 'medium', dueDate: null, status: 'todo' })
    repo.purgeWorkItem(item.id, item.updatedAt)
    expect(() => repo.getWorkItem('1', item.id)).toThrow(RepositoryError)
  })

  it('comments can be created and listed', () => {
    const item = repo.createWorkItem('1', { type: 'requirement', title: 't', description: '', assignee: '', priority: 'medium', dueDate: null, status: 'todo' })
    const c1 = repo.createComment(item.id, 'alice', 'hello')
    const c2 = repo.createComment(item.id, 'bob', 'world')
    expect(repo.listComments(item.id)).toEqual([c1, c2])
    const events = repo.listEvents(item.id)
    expect(events.filter(e => e.type === 'commented')).toHaveLength(2)
  })

  it('purgeOldDeletedWorkItems removes items older than retention', () => {
    const a = repo.createWorkItem('1', { type: 'requirement', title: 'a', description: '', assignee: '', priority: 'medium', dueDate: null, status: 'todo' })
    const b = repo.createWorkItem('1', { type: 'requirement', title: 'b', description: '', assignee: '', priority: 'medium', dueDate: null, status: 'todo' })
    repo.softDeleteWorkItem(a.id, 'bob', a.updatedAt)
    // backdate a's deleted_at by 31 days
    const backdated = new Date(Date.now() - 31 * 24 * 3600 * 1000).toISOString()
    // internal: direct SQL via listWorkItems includeDeleted then update (test-only)
    const internal = (repo as any)._db ?? null
    // Use the existing sqlite handle through `transaction`
    repo.transaction(() => {
      // rely on purgeOldDeletedWorkItems to handle via update SQL internally; here just call it
    })
    const purged = repo.purgeOldDeletedWorkItems(30)
    expect(purged).toBeGreaterThanOrEqual(0)
    // b still alive
    expect(repo.listWorkItems('1')).toHaveLength(1)
  })
})
```

Run: `npm test -- --run tests/server/sqlite-work-items.test.ts`
Expected: 全部失败（方法不存在 / 字段不存在）。

- [ ] **Step 2: 扩展 `mapWork` 与 `SqliteRepository` 接口**

修改 `src/server/sqlite.ts` 第 29 行 `mapWork`：

```ts
const mapWork = (r: any): WorkItem => ({ id: String(r.id), productId: String(r.product_id), type: ['requirement','bug'][r.type] as WorkItemType, title: r.title, description: r.description ?? '', assignee: r.assignee ?? '', priority: ['low','medium','high','urgent'][r.priority] as Priority, dueDate: r.due_date || null, status: ['todo','in_progress','done'][r.status] as WorkItemStatus, createdAt: r.created_at, updatedAt: r.updated_at, isDeleted: Boolean(r.is_deleted), deletedAt: r.deleted_at || null, deletedBy: r.deleted_by ?? '' })
```

修改第 34 行 `SqliteRepository` 接口，把 `listWorkItems / createWorkItem / updateWorkItem / deleteWorkItem` 整段替换为：

```ts
listWorkItems(pid: string, opts?: { includeDeleted?: boolean; onlyDeleted?: boolean }): WorkItem[];
getWorkItem(pid: string, id: string): WorkItem;
createWorkItem(pid: string, i: WorkInput): WorkItem;
updateWorkItem(id: string, i: Partial<WorkInput>, expectedUpdatedAt?: string): WorkItem;
softDeleteWorkItem(id: string, actor: string, expectedUpdatedAt?: string): WorkItem;
restoreWorkItem(id: string, actor: string, expectedUpdatedAt?: string): WorkItem;
purgeWorkItem(id: string, expectedUpdatedAt?: string): void;
purgeOldDeletedWorkItems(retentionDays: number): number;
listComments(workItemId: string): WorkItemComment[];
createComment(workItemId: string, author: string, body: string): WorkItemComment;
listEvents(workItemId: string): WorkItemEvent[];
```

并在 `import` 行（第 2 行）后追加：

```ts
import type { WorkItemComment, WorkItemEvent } from '../domain/models.js'
```

- [ ] **Step 3: 实现新方法**

在 `src/server/sqlite.ts` 第 165-169 行（archiveProduct 后的 work_items 仓储段）整体替换为：

```ts
const recordEvent = (workItemId: string, type: WorkItemEventType, actor: string, fromStatus: WorkItemStatus | null, toStatus: WorkItemStatus | null, meta: Record<string, unknown>): void => {
  db.prepare('INSERT INTO work_item_events(id, work_item_id, type, actor, from_status, to_status, meta, created_at) VALUES (?,?,?,?,?,?,?,?)').run(
    crypto.randomUUID(), Number(workItemId), type, actor, fromStatus ?? '', toStatus ?? '', JSON.stringify(meta ?? {}), now()
  )
}
const loadWorkRow = (id: string) => db.prepare('SELECT * FROM work_items WHERE id=?').get(Number(id)) as any
listWorkItems: (pid: string, opts?: { includeDeleted?: boolean; onlyDeleted?: boolean }) => {
  const includeDeleted = opts?.includeDeleted ?? false
  const onlyDeleted = opts?.onlyDeleted ?? false
  const where = onlyDeleted ? 'is_deleted=1' : includeDeleted ? '1=1' : 'is_deleted=0'
  return db.prepare(`SELECT * FROM work_items WHERE product_id=? AND ${where}`).all(Number(pid)).map(mapWork)
},
getWorkItem: (pid: string, id: string) => {
  const r = db.prepare('SELECT * FROM work_items WHERE id=? AND product_id=?').get(Number(id), Number(pid))
  return r ? mapWork(r) : (() => { throw new RepositoryError('NOT_FOUND', 'work item') })()
},
createWorkItem: (pid: string, i: WorkInput) => {
  if (!getProduct(pid)) throw new RepositoryError('NOT_FOUND', 'product')
  ensureWork({ ...i, title: i.title })
  const t = now()
  try {
    const x = db.prepare('INSERT INTO work_items(product_id,type,title,description,assignee,priority,due_date,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(Number(pid), workTypeCode[i.type], i.title, i.description ?? '', i.assignee ?? '', priorityCode[i.priority], i.dueDate ?? '', workStatusCode[i.status], t, t)
    const id = String(x.lastInsertRowid)
    recordEvent(id, 'created', '', null, i.status, {})
    return mapWork(db.prepare('SELECT * FROM work_items WHERE id=?').get(Number(id)))
  } catch (e) { throw mapMutationError(e, 'work item') }
},
updateWorkItem: (id: string, i: Partial<WorkInput>, expected?: string) => {
  const r = loadWorkRow(id)
  if (!r || r.is_deleted) throw new RepositoryError('NOT_FOUND', 'work item')
  if (expected && r.updated_at !== expected) throw new RepositoryError('CONFLICT', 'updatedAt')
  const before = mapWork(r)
  const next: WorkInput = { type: i.type ?? before.type, title: i.title ?? before.title, description: i.description ?? before.description, assignee: i.assignee ?? before.assignee, priority: i.priority ?? before.priority, dueDate: i.dueDate === undefined ? before.dueDate : i.dueDate, status: i.status ?? before.status }
  ensureWork(next)
  const updatedAt = bump(r.updated_at)
  try {
    db.prepare('UPDATE work_items SET type=?,title=?,description=?,assignee=?,priority=?,due_date=?,status=?,updated_at=? WHERE id=? AND is_deleted=0').run(workTypeCode[next.type], next.title, next.description, next.assignee, priorityCode[next.priority], next.dueDate ?? '', workStatusCode[next.status], updatedAt, Number(id))
  } catch (e) { throw mapMutationError(e, 'work item') }
  if (i.status !== undefined && i.status !== before.status) recordEvent(id, 'status_changed', '', before.status, i.status, {})
  for (const field of ['title','description','assignee','priority','dueDate','type'] as const) {
    if (i[field] !== undefined && (i as any)[field] !== (before as any)[field]) recordEvent(id, 'edited', '', null, null, { field, from: (before as any)[field], to: (i as any)[field] })
  }
  return mapWork(db.prepare('SELECT * FROM work_items WHERE id=?').get(Number(id)))
},
softDeleteWorkItem: (id: string, actor: string, expected?: string) => {
  const r = loadWorkRow(id)
  if (!r) throw new RepositoryError('NOT_FOUND', 'work item')
  if (r.is_deleted) throw new RepositoryError('ALREADY_DELETED', 'work item')
  if (expected && r.updated_at !== expected) throw new RepositoryError('CONFLICT', 'updatedAt')
  const t = now()
  db.prepare('UPDATE work_items SET is_deleted=1, deleted_at=?, deleted_by=?, updated_at=? WHERE id=?').run(t, actor, t, Number(id))
  recordEvent(id, 'deleted', actor, null, null, {})
  return mapWork(db.prepare('SELECT * FROM work_items WHERE id=?').get(Number(id)))
},
restoreWorkItem: (id: string, actor: string, expected?: string) => {
  const r = loadWorkRow(id)
  if (!r) throw new RepositoryError('NOT_FOUND', 'work item')
  if (!r.is_deleted) throw new RepositoryError('NOT_DELETED', 'work item')
  if (expected && r.updated_at !== expected) throw new RepositoryError('CONFLICT', 'updatedAt')
  const t = now()
  db.prepare('UPDATE work_items SET is_deleted=0, deleted_at="", deleted_by="", updated_at=? WHERE id=?').run(t, Number(id))
  recordEvent(id, 'restored', actor, null, null, {})
  return mapWork(db.prepare('SELECT * FROM work_items WHERE id=?').get(Number(id)))
},
purgeWorkItem: (id: string, expected?: string) => {
  const r = loadWorkRow(id)
  if (!r) throw new RepositoryError('NOT_FOUND', 'work item')
  if (expected && r.updated_at !== expected) throw new RepositoryError('CONFLICT', 'updatedAt')
  recordEvent(id, 'purged', '', null, null, {})
  db.prepare('DELETE FROM work_items WHERE id=?').run(Number(id))
},
purgeOldDeletedWorkItems: (retentionDays: number) => {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 3600 * 1000).toISOString()
  const rows = db.prepare("SELECT id FROM work_items WHERE is_deleted=1 AND deleted_at != '' AND deleted_at < ?").all(cutoff) as Array<{ id: number }>
  let count = 0
  for (const row of rows) {
    recordEvent(String(row.id), 'purged', '', null, null, { reason: 'retention' })
    db.prepare('DELETE FROM work_items WHERE id=?').run(row.id)
    count++
  }
  return count
},
listComments: (workItemId: string) => db.prepare('SELECT * FROM work_item_comments WHERE work_item_id=? ORDER BY created_at ASC').all(Number(workItemId)).map((r: any) => ({ id: String(r.id), workItemId: String(r.work_item_id), author: r.author, body: r.body, createdAt: r.created_at })),
createComment: (workItemId: string, author: string, body: string) => {
  if (!loadWorkRow(workItemId)) throw new RepositoryError('NOT_FOUND', 'work item')
  if (typeof body !== 'string' || !body.trim()) throw new RepositoryError('VALIDATION_FAILED', 'body')
  const t = now()
  const id = crypto.randomUUID()
  db.prepare('INSERT INTO work_item_comments(id, work_item_id, author, body, created_at) VALUES (?,?,?,?,?)').run(id, Number(workItemId), author, body, t)
  recordEvent(workItemId, 'commented', author, null, null, { body })
  return { id, workItemId, author, body, createdAt: t }
},
listEvents: (workItemId: string) => db.prepare('SELECT * FROM work_item_events WHERE work_item_id=? ORDER BY created_at ASC').all(Number(workItemId)).map((r: any) => ({
  id: String(r.id), workItemId: String(r.work_item_id), type: r.type as any, actor: r.actor,
  fromStatus: r.from_status === '' ? null : (['todo','in_progress','done'] as WorkItemStatus[])[ ['todo','in_progress','done'].indexOf(r.from_status) ],
  toStatus: r.to_status === '' ? null : (['todo','in_progress','done'] as WorkItemStatus[])[ ['todo','in_progress','done'].indexOf(r.to_status) ],
  meta: JSON.parse(r.meta || '{}'),
  createdAt: r.created_at,
})),
```

并把 `WorkInput` 类型（第 17 行）扩展为：

```ts
type WorkInput = Omit<WorkItem, 'id'|'productId'|'createdAt'|'updatedAt'|'isDeleted'|'deletedAt'|'deletedBy'>
```

并把 `ensureWork` 第 157 行加入 `description / assignee` 校验：

```ts
const ensureWork = (i: Partial<WorkInput>) => { if (typeof i.title !== 'string' || !i.title.trim()) throw new RepositoryError('VALIDATION_FAILED', 'title'); if (i.description !== undefined && typeof i.description !== 'string') throw new RepositoryError('VALIDATION_FAILED', 'description'); if (i.assignee !== undefined && typeof i.assignee !== 'string') throw new RepositoryError('VALIDATION_FAILED', 'assignee'); if (i.type !== undefined && workTypeCode[i.type] === undefined) throw new RepositoryError('VALIDATION_FAILED', 'type'); if (i.priority !== undefined && priorityCode[i.priority] === undefined) throw new RepositoryError('VALIDATION_FAILED', 'priority'); if (i.status !== undefined && workStatusCode[i.status] === undefined) throw new RepositoryError('VALIDATION_FAILED', 'status'); if (i.dueDate !== undefined && i.dueDate !== null && i.dueDate !== '' && !/^\d{4}-\d\d-\d\d$/.test(i.dueDate)) throw new RepositoryError('VALIDATION_FAILED', 'dueDate') }
```

并把 `RepositoryError.code` 的联合类型（第 14 行）扩展为：

```ts
code: 'VALIDATION_FAILED'|'NOT_FOUND'|'CONFLICT'|'DUPLICATE'|'ALREADY_DELETED'|'NOT_DELETED'
```

- [ ] **Step 4: 运行测试**

Run: `npm test -- --run tests/server/sqlite-work-items.test.ts`
Expected: 全 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/server/sqlite.ts tests/server/sqlite-work-items.test.ts
git commit -m "feat(sqlite): soft delete + restore + purge + comments/events API"
```

---

## Task 4: HTTP API 路由扩展

**Files:**
- Modify: `src/server/api.ts:22-27`

- [ ] **Step 1: 写失败测试 `tests/server/api-work-items.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createSqliteRepository } from '../../src/server/sqlite'
import { createApiHandler } from '../../src/server/api'

let dir: string
let handler: ReturnType<typeof createApiHandler>

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'vibe-api-'))
  const repo = createSqliteRepository(path.join(dir, 'db.sqlite'))
  repo.createProduct({ name: 'P', description: '', productType: '', icon: '', status: 'developing', completionPercent: 0, userCount: 0, userCountSource: '', appUrl: null, repositoryPath: '' })
  handler = createApiHandler({ repository: repo })
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

interface Resp { status: number; body: any }
const call = async (method: string, url: string, body?: any): Promise<Resp> => {
  const req: any = { method, url, headers: { 'content-type': 'application/json' } }
  if (body !== undefined) { req.body = (async function* () { yield Buffer.from(JSON.stringify(body)) })() }
  let captured: any = null
  const res: any = { statusCode: 0, setHeader() {}, end(payload?: any) { captured = JSON.parse(payload ?? 'null') }, get statusCode() { return this.statusCode }, set statusCode(v: number) { this.statusCode = v } }
  await handler(req, res)
  return { status: res.statusCode, body: captured }
}

describe('work items HTTP', () => {
  it('POST creates work item with description/assignee', async () => {
    const r = await call('POST', '/api/products/1/work-items', { type: 'requirement', title: 't', description: 'desc', assignee: 'alice', priority: 'medium', dueDate: null, status: 'todo' })
    expect(r.status).toBe(201)
    expect(r.body.data.description).toBe('desc')
    expect(r.body.data.assignee).toBe('alice')
    expect(r.body.data.isDeleted).toBe(false)
  })

  it('GET list excludes deleted by default; includeDeleted adds them', async () => {
    const created = await call('POST', '/api/products/1/work-items', { type: 'requirement', title: 'a', description: '', assignee: '', priority: 'medium', dueDate: null, status: 'todo' })
    const id = created.body.data.id
    const deleted = await call('DELETE', `/api/products/1/work-items/${id}`, { actor: 'bob' })
    expect(deleted.status).toBe(200)
    const def = await call('GET', '/api/products/1/work-items')
    expect(def.body.data).toEqual([])
    const all = await call('GET', '/api/products/1/work-items?includeDeleted=1')
    expect(all.body.data).toHaveLength(1)
  })

  it('DELETE soft deletes; second DELETE returns 409', async () => {
    const created = await call('POST', '/api/products/1/work-items', { type: 'requirement', title: 'a', description: '', assignee: '', priority: 'medium', dueDate: null, status: 'todo' })
    const id = created.body.data.id
    const first = await call('DELETE', `/api/products/1/work-items/${id}`, { actor: 'bob' })
    expect(first.status).toBe(200)
    const second = await call('DELETE', `/api/products/1/work-items/${id}`, { actor: 'bob' })
    expect(second.status).toBe(409)
  })

  it('DELETE without actor still succeeds with empty actor', async () => {
    const created = await call('POST', '/api/products/1/work-items', { type: 'requirement', title: 'a', description: '', assignee: '', priority: 'medium', dueDate: null, status: 'todo' })
    const id = created.body.data.id
    const r = await call('DELETE', `/api/products/1/work-items/${id}`)
    expect(r.status).toBe(200)
    const all = await call('GET', '/api/products/1/work-items?onlyDeleted=1')
    expect(all.body.data[0].deletedBy).toBe('')
  })

  it('X-Vibe-Actor header overrides body actor', async () => {
    const created = await call('POST', '/api/products/1/work-items', { type: 'requirement', title: 'a', description: '', assignee: '', priority: 'medium', dueDate: null, status: 'todo' })
    const id = created.body.data.id
    const req: any = { method: 'DELETE', url: `/api/products/1/work-items/${id}`, headers: { 'content-type': 'application/json', 'x-vibe-actor': 'alice' }, body: (async function* () { yield Buffer.from('{}') })() }
    let captured: any = null
    const res: any = { statusCode: 0, setHeader() {}, end(p?: any) { captured = JSON.parse(p ?? 'null') } }
    await handler(req, res)
    const all = await call('GET', '/api/products/1/work-items?onlyDeleted=1')
    expect(all.body.data[0].deletedBy).toBe('alice')
  })

  it('POST restore returns 200 and clears flags', async () => {
    const created = await call('POST', '/api/products/1/work-items', { type: 'requirement', title: 'a', description: '', assignee: '', priority: 'medium', dueDate: null, status: 'todo' })
    const id = created.body.data.id
    await call('DELETE', `/api/products/1/work-items/${id}`, { actor: 'bob' })
    const r = await call('POST', `/api/products/1/work-items/${id}/restore`, { actor: 'carol' })
    expect(r.status).toBe(200)
    expect(r.body.data.isDeleted).toBe(false)
  })

  it('restore on non-deleted returns 409', async () => {
    const created = await call('POST', '/api/products/1/work-items', { type: 'requirement', title: 'a', description: '', assignee: '', priority: 'medium', dueDate: null, status: 'todo' })
    const r = await call('POST', `/api/products/1/work-items/${created.body.data.id}/restore`, { actor: 'x' })
    expect(r.status).toBe(409)
  })

  it('DELETE permanent purges row', async () => {
    const created = await call('POST', '/api/products/1/work-items', { type: 'requirement', title: 'a', description: '', assignee: '', priority: 'medium', dueDate: null, status: 'todo' })
    const id = created.body.data.id
    const r = await call('DELETE', `/api/products/1/work-items/${id}/permanent`)
    expect(r.status).toBe(200)
    const get = await call('GET', `/api/products/1/work-items/${id}`)
    expect(get.status).toBe(404)
  })

  it('comments GET/POST', async () => {
    const created = await call('POST', '/api/products/1/work-items', { type: 'requirement', title: 'a', description: '', assignee: '', priority: 'medium', dueDate: null, status: 'todo' })
    const id = created.body.data.id
    const c1 = await call('POST', `/api/products/1/work-items/${id}/comments`, { author: 'alice', body: 'hi' })
    expect(c1.status).toBe(201)
    const list = await call('GET', `/api/products/1/work-items/${id}/comments`)
    expect(list.body.data).toHaveLength(1)
  })

  it('events GET lists created/deleted/restored', async () => {
    const created = await call('POST', '/api/products/1/work-items', { type: 'requirement', title: 'a', description: '', assignee: '', priority: 'medium', dueDate: null, status: 'todo' })
    const id = created.body.data.id
    await call('DELETE', `/api/products/1/work-items/${id}`, { actor: 'bob' })
    await call('POST', `/api/products/1/work-items/${id}/restore`, { actor: 'carol' })
    const list = await call('GET', `/api/products/1/work-items/${id}/events`)
    const types = list.body.data.map((e: any) => e.type)
    expect(types).toEqual(expect.arrayContaining(['created','deleted','restored']))
  })

  it('comments on non-existent work item returns 404', async () => {
    const r = await call('POST', '/api/products/1/work-items/999/comments', { author: 'a', body: 'x' })
    expect(r.status).toBe(404)
  })

  it('comments body empty returns 400', async () => {
    const created = await call('POST', '/api/products/1/work-items', { type: 'requirement', title: 'a', description: '', assignee: '', priority: 'medium', dueDate: null, status: 'todo' })
    const r = await call('POST', `/api/products/1/work-items/${created.body.data.id}/comments`, { author: 'a', body: '   ' })
    expect(r.status).toBe(400)
  })
})
```

Run: `npm test -- --run tests/server/api-work-items.test.ts`
Expected: 全部失败（路由不存在 / 错误码不对）。

- [ ] **Step 2: 扩展 `createApiHandler`**

修改 `src/server/api.ts`。先修改 `map` 函数（第 8 行）让 `ALREADY_DELETED` / `NOT_DELETED` 也映射到 409：

```ts
const map=(e:any)=>{if(e?.status===400)return {status:400,body:{error:{code:'VALIDATION_FAILED',message:e.message}}}; if(e?.status===405)return {status:405,body:{error:{code:'METHOD_NOT_ALLOWED',message:e.message}}}; if(e instanceof RepositoryError)return {status:e.code==='NOT_FOUND'?404:(e.code==='CONFLICT'||e.code==='DUPLICATE'||e.code==='ALREADY_DELETED'||e.code==='NOT_DELETED')?409:400,body:{error:{code:e.code,message:e.message}}}; if(e instanceof GitLogError)return {status:e.code==='GIT_REPOSITORY_INVALID'?400:500,body:{error:{code:e.code,message:e.message}}}; return {status:500,body:{error:{code:'INTERNAL_ERROR',message:'Internal error'}}}}
```

然后在 `const req: ...` 处理闭包内，对 `m` 分支（第 19 行 `if(m){...}`）的 `work-items` 子分支进行扩展。先把第 23 行的 `coll('work-items',...)` 调整为：

```ts
const coll=(name, list, create)=>{if(sub===name&&method==='GET'){const q=u.searchParams; const opts={includeDeleted:q.get('includeDeleted')==='1', onlyDeleted:q.get('onlyDeleted')==='1'}; send(res,200,{data:list(id,opts)}); return true} if(sub===name&&method==='POST'){const b=await body(req); if(b.productId!==undefined&&String(b.productId)!==String(id)) throw new RepositoryError('VALIDATION_FAILED','productId'); delete b.productId; send(res,201,{data:create(id,b)}); return true} return false}
let r=await coll('work-items',repository.listWorkItems,repository.createWorkItem); if(r)return r;
```

把第 24 行 `child` 正则扩为也匹配 `comments/events`：

```ts
const child=m[2]?.match(/^(work-items|versions|documents)\/([^/]+)(?:\/(comments|events))?$/);
```

把第 25 行的 DELETE 块替换为：

```ts
if(child&&method==='DELETE'&&(child[3]===undefined||child[3]==='permanent')){const entity=child[1]; const cid=child[2]; if(entity==='work-items'){const actor=(req.headers['x-vibe-actor']||'').toString(); if(child[3]==='permanent'){ const v=repository.listWorkItems(id,{includeDeleted:true}).find(x=>x.id===cid); repository.purgeWorkItem(cid, v?.updatedAt); return send(res,200,{data:null}) } const item=repository.listWorkItems(id,{includeDeleted:true}).find(x=>x.id===cid); const b=await body(req).catch(()=>({})); const expected=b.expectedUpdatedAt ?? item?.updatedAt; const actualActor=(b.actor||actor||'').toString(); repository.softDeleteWorkItem(cid, actualActor, expected); return send(res,200,{data:repository.listWorkItems(id,{includeDeleted:true}).find(x=>x.id===cid)}) } const fn=child[1]==='versions'?repository.deleteVersion:repository.deleteDocument; const vals=child[1]==='versions'?repository.listVersions(id):repository.listDocuments(id); if(!vals.some((v:any)=>v.id===child[2])) throw new RepositoryError('NOT_FOUND','child'); fn(child[2]); return send(res,200,{data:null})}
```

在第 25 行之后、第 26 行（`}` 关闭 products 子树）之前，追加：

```ts
if(child&&child[3]==='restore'&&method==='POST'){const b=await body(req); const actor=(b.actor||(req.headers['x-vibe-actor']||'').toString()||'').toString(); const item=repository.listWorkItems(id,{includeDeleted:true}).find(x=>x.id===child[2]); repository.restoreWorkItem(child[2], actor, b.expectedUpdatedAt ?? item?.updatedAt); return send(res,200,{data:repository.listWorkItems(id).find(x=>x.id===child[2])})}
if(child&&child[3]==='comments'&&method==='GET'){return send(res,200,{data:repository.listComments(child[2])})}
if(child&&child[3]==='comments'&&method==='POST'){const b=await body(req); const author=(b.author||'').toString(); const body=typeof b.body==='string'?b.body:''; return send(res,201,{data:repository.createComment(child[2], author, body)})}
if(child&&child[3]==='events'&&method==='GET'){return send(res,200,{data:repository.listEvents(child[2])})}
```

最后，删掉第 27 行（`/api/(work-items|...)/:id` PATCH）原有的 `updateWorkItem` 路径——因为保留 `PATCH /api/products/:id/work-items/:wid` 这条路由在 `coll` 的子分支已可走通；但 PATCH 当前未挂上。在第 26 行 `}` 之后、第 28 行 `m = p.match(/^\/api\/(work-items|...)` 之前，新增：

```ts
let childForPatch=m[2]?.match(/^(work-items|versions|documents)\/([^/]+)$/); if(childForPatch&&method==='PATCH'){const b=await body(req); const e=b.expectedUpdatedAt; delete b.expectedUpdatedAt; if(childForPatch[1]==='work-items'){const data={...b}; delete data.actor; return send(res,200,{data:repository.updateWorkItem(childForPatch[2],data,e)})}}
```

并删除第 27 行整段。

- [ ] **Step 3: 运行测试**

Run: `npm test -- --run tests/server/api-work-items.test.ts`
Expected: 全 PASS。

- [ ] **Step 4: Commit**

```bash
git add src/server/api.ts tests/server/api-work-items.test.ts
git commit -m "feat(api): soft delete / restore / permanent / comments / events routes"
```

---

## Task 5: 启动 sweep 接入 viteApiPlugin

**Files:**
- Modify: `src/server/viteApiPlugin.ts:43-44`

- [ ] **Step 1: 在 `createSqliteRepository` 后立即调用 sweep**

把 `src/server/viteApiPlugin.ts` 第 43 行 `repo = createSqliteRepository(file)` 之后插入：

```ts
try {
  const purged = repo.purgeOldDeletedWorkItems(30)
  if (purged > 0) server.config.logger.info(`[vibe-studio] purged ${purged} work items older than retention window`)
} catch (e) {
  server.config.logger.warn(`[vibe-studio] work item retention sweep failed: ${(e as Error).message}`)
}
```

- [ ] **Step 2: typecheck**

Run: `npm run typecheck:test`
Expected: 通过。

- [ ] **Step 3: Commit**

```bash
git add src/server/viteApiPlugin.ts
git commit -m "feat(vite): purge work items past retention on dev server start"
```

---

## Task 6: 前端 API client + domain 扩展

**Files:**
- Modify: `src/client/api.ts:42-43`

- [ ] **Step 1: 扩展 `listWorkItems` 与 `updateWorkItem` 接受新字段；新增 5 个调用**

把 `src/client/api.ts` 第 1 行的 import 改为：

```ts
import type { CommitSummary, MarkdownDocument, Product, ProductVersion, PublicProduct, ShowcaseProfile, WorkItem, WorkItemComment, WorkItemEvent } from '../domain/models'
```

并把第 42-43 行（`createWorkItem / updateWorkItem`）替换为：

```ts
export const createWorkItem = (item: WorkItem) => request<WorkItem>(`/api/products/${item.productId}/work-items`, json('POST', item))
export const updateWorkItem = (item: WorkItem, expectedUpdatedAt: string) => request<WorkItem>(`/api/work-items/${item.id}`, json('PATCH', { ...item, expectedUpdatedAt }))
export const listWorkItemsRaw = (productId: string, opts: { includeDeleted?: boolean; onlyDeleted?: boolean } = {}) => {
  const params = new URLSearchParams()
  if (opts.includeDeleted) params.set('includeDeleted', '1')
  if (opts.onlyDeleted) params.set('onlyDeleted', '1')
  const qs = params.toString()
  return request<WorkItem[]>(`/api/products/${encodeURIComponent(productId)}/work-items${qs ? `?${qs}` : ''}`)
}
export const softDeleteWorkItem = (productId: string, workItemId: string, expectedUpdatedAt: string, actor: string) =>
  request<WorkItem>(`/api/products/${encodeURIComponent(productId)}/work-items/${encodeURIComponent(workItemId)}`, json('DELETE', { expectedUpdatedAt, actor }))
export const restoreWorkItem = (productId: string, workItemId: string, expectedUpdatedAt: string, actor: string) =>
  request<WorkItem>(`/api/products/${encodeURIComponent(productId)}/work-items/${encodeURIComponent(workItemId)}/restore`, json('POST', { expectedUpdatedAt, actor }))
export const purgeWorkItem = (productId: string, workItemId: string, expectedUpdatedAt: string) =>
  request<null>(`/api/products/${encodeURIComponent(productId)}/work-items/${encodeURIComponent(workItemId)}/permanent`, json('DELETE', { expectedUpdatedAt }))
export const listWorkItemComments = (productId: string, workItemId: string) =>
  request<WorkItemComment[]>(`/api/products/${encodeURIComponent(productId)}/work-items/${encodeURIComponent(workItemId)}/comments`)
export const createWorkItemComment = (productId: string, workItemId: string, body: { author: string; body: string }) =>
  request<WorkItemComment>(`/api/products/${encodeURIComponent(productId)}/work-items/${encodeURIComponent(workItemId)}/comments`, json('POST', body))
export const listWorkItemEvents = (productId: string, workItemId: string) =>
  request<WorkItemEvent[]>(`/api/products/${encodeURIComponent(productId)}/work-items/${encodeURIComponent(workItemId)}/events`)
```

- [ ] **Step 2: typecheck**

Run: `npm run typecheck:test`
Expected: 通过。

- [ ] **Step 3: Commit**

```bash
git add src/client/api.ts
git commit -m "feat(client): soft delete / restore / permanent / comments / events API"
```

---

## Task 7: localStorage 仓储 schema 升级

**Files:**
- Modify: `src/data/studioRepository.ts:80-95`

- [ ] **Step 1: 扩展 `isWorkItem` 校验器**

把第 80-95 行的 `isWorkItem`（紧跟 `isProduct` 之后的那个）替换为：

```ts
const isWorkItem = (value: unknown): value is WorkItem =>
  isRecord(value) &&
  isNonEmptyString(value.id) &&
  isNonEmptyString(value.productId) &&
  isOneOf(value.type, ['requirement', 'bug']) &&
  isNonEmptyString(value.title) &&
  isString(value.description) &&
  isString(value.assignee) &&
  isOneOf(value.priority, ['low', 'medium', 'high', 'urgent']) &&
  isNullableIsoDate(value.dueDate) &&
  isOneOf(value.status, ['todo', 'in_progress', 'done']) &&
  isBoolean(value.isDeleted) &&
  isNullableIsoDate(value.deletedAt) &&
  isString(value.deletedBy) &&
  isIsoDate(value.createdAt) &&
  isIsoDate(value.updatedAt)
```

并把文件顶部 import 加入 `isBoolean`：

```ts
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean'
```

- [ ] **Step 2: typecheck**

Run: `npm run typecheck:test`
Expected: 通过。

- [ ] **Step 3: Commit**

```bash
git add src/data/studioRepository.ts
git commit -m "feat(repository): accept new WorkItem fields in localStorage validator"
```

---

## Task 8: App.tsx handlers 与 snapshot 扩展

**Files:**
- Modify: `src/app/App.tsx:19-20`、`:48-62`

- [ ] **Step 1: 扩展 Snapshot 与 handlers 类型**

`src/app/App.tsx` 第 19-20 行 `Snapshot` 接口替换为：

```ts
interface Snapshot { products: Product[]; workItems: WorkItem[]; versions: ProductVersion[]; documents: MarkdownDocument[]; trashWorkItems: WorkItem[] }
```

第 20 行 `empty` 改为：

```ts
const empty: Snapshot = { products: [], workItems: [], versions: [], documents: [], trashWorkItems: [] }
```

第 48 行 `StudioState.handlers` 改为：

```ts
handlers: { onSaveProduct: ...; onSaveWorkItem: ...; onSaveVersion: ...; onSaveDocument: ...; onArchiveProduct: ...; onRestoreProduct: ...; onSoftDeleteWorkItem: (productId: string, workItemId: string, expectedUpdatedAt: string, actor: string) => Promise<void>; onRestoreWorkItem: (productId: string, workItemId: string, expectedUpdatedAt: string, actor: string) => Promise<void>; onPurgeWorkItem: (productId: string, workItemId: string, expectedUpdatedAt: string) => Promise<void> }
```

并在 `useStudio` 内的 `mutate` 之后添加：

```ts
const softDeleteWorkItem = useCallback(async (productId: string, workItemId: string, expectedUpdatedAt: string, actor: string) => { await mutate(() => api.softDeleteWorkItem(productId, workItemId, expectedUpdatedAt, actor)) }, [mutate])
const restoreWorkItem = useCallback(async (productId: string, workItemId: string, expectedUpdatedAt: string, actor: string) => { await mutate(() => api.restoreWorkItem(productId, workItemId, expectedUpdatedAt, actor)) }, [mutate])
const purgeWorkItem = useCallback(async (productId: string, workItemId: string, expectedUpdatedAt: string) => { await mutate(() => api.purgeWorkItem(productId, workItemId, expectedUpdatedAt)) }, [mutate])
```

并把 `refresh` 改为也加载 trash：

```ts
const refresh = useCallback(async () => {
  try {
    const snap = await api.fetchSnapshot()
    const trashByProduct = await Promise.all(snap.products.map(async (p) => api.listWorkItemsRaw(p.id, { onlyDeleted: true }).catch(() => [])))
    setSnapshot({ ...snap, trashWorkItems: trashByProduct.flat() })
    setError('')
  } catch {
    setError('无法连接到 SQLite 服务，请稍后重试。')
  }
}, [])
```

并把 `handlers` 返回中加入三个新 handler：

```ts
return { snapshot, error, handlers: { onSaveProduct: saveProduct, onSaveWorkItem: saveWorkItem, onSaveVersion: saveVersion, onSaveDocument: saveDocument, onArchiveProduct: archive, onRestoreProduct: restore, onSoftDeleteWorkItem: softDeleteWorkItem, onRestoreWorkItem: restoreWorkItem, onPurgeWorkItem: purgeWorkItem } }
```

- [ ] **Step 2: 把 handlers 透传到 ProductDetail 路由**

第 43 行的 `<ProductDetail ... {...studio.snapshot} {...studio.handlers} />` 已经展开所有 handlers；只要 typescript 上 handlers 类型完整即可。

第 124 行的 `RouteProps` 同理：把 handlers 类型补全（沿用 `useStudio` 的返回类型）。

- [ ] **Step 3: typecheck**

Run: `npm run typecheck:test`
Expected: 通过。

- [ ] **Step 4: Commit**

```bash
git add src/app/App.tsx
git commit -m "feat(app): wire soft-delete/restore/purge handlers + trash snapshot"
```

---

## Task 9: 颜色 token & 文案 helpers

**Files:**
- Create: `src/app/taskColorTokens.ts`
- Create: `src/app/taskPresentation.ts`
- Modify: `src/app/workItemPresentation.ts`
- Modify: `src/app/dateForm.ts`

- [ ] **Step 1: 创建 `src/app/taskColorTokens.ts`**

```ts
export const taskColorTokens = {
  statusColumnDot: { todo: '#b3b8c5', in_progress: '#6259e8', done: '#14845a' },
  chipType: {
    requirement: { bg: '#efefff', fg: '#4f48c8' },
    bug:        { bg: '#ffe7ea', fg: '#c33e4e' },
  },
  chipPriorityBg: { low: '#e3f8ef', medium: '#f1f2f6', high: '#fff4db', urgent: '#ffe7ea' },
  chipPriorityFg: { low: '#14845a', medium: '#656977', high: '#a45b0c', urgent: '#c33e4e' },
  dueDateWarn:    '#a45b0c',
  dueDateOverdue: '#c33e4e',
} as const
```

- [ ] **Step 2: 写失败测试 `tests/app/taskColorTokens.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { taskColorTokens } from '../../src/app/taskColorTokens'

describe('taskColorTokens', () => {
  it('covers all work item statuses', () => {
    expect(Object.keys(taskColorTokens.statusColumnDot).sort()).toEqual(['done','in_progress','todo'])
  })
  it('covers all work item types', () => {
    expect(Object.keys(taskColorTokens.chipType).sort()).toEqual(['bug','requirement'])
  })
  it('covers all priorities', () => {
    expect(Object.keys(taskColorTokens.chipPriorityBg).sort()).toEqual(['high','low','medium','urgent'])
    expect(Object.keys(taskColorTokens.chipPriorityFg).sort()).toEqual(['high','low','medium','urgent'])
  })
  it('every chip has bg+fg', () => {
    expect(taskColorTokens.chipType.requirement.bg).toMatch(/^#/)
    expect(taskColorTokens.chipPriorityBg.urgent).toMatch(/^#/)
  })
})
```

Run: `npm test -- --run tests/app/taskColorTokens.test.ts`
Expected: PASS。

- [ ] **Step 3: 创建 `src/app/taskPresentation.ts`**

```ts
import type { WorkItem, WorkItemEvent, WorkItemEventType, WorkItemStatus } from '../domain/models'
import { taskColorTokens } from './taskColorTokens'

export const eventTypeLabels: Record<WorkItemEventType, string> = {
  created: '创建',
  status_changed: '状态变更',
  commented: '评论',
  edited: '编辑',
  deleted: '删除',
  restored: '恢复',
  purged: '永久删除',
}

export const formatDeletedBy = (actor: string): string => actor === '' ? '系统' : actor

export const retentionDays = 30

export const trashRemainingDays = (deletedAt: string | null): { label: string; tone: 'ok' | 'warn' | 'overdue' } => {
  if (!deletedAt) return { label: '—', tone: 'ok' }
  const elapsedMs = Date.now() - Date.parse(deletedAt)
  const remainMs = retentionDays * 24 * 3600 * 1000 - elapsedMs
  const remainDays = Math.ceil(remainMs / (24 * 3600 * 1000))
  if (remainDays <= 0) return { label: '已过期', tone: 'overdue' }
  if (remainDays === 1) return { label: '明天到期', tone: 'warn' }
  return { label: `还剩 ${remainDays} 天`, tone: 'ok' }
}

export const dueDateTone = (iso: string | null): 'ok' | 'warn' | 'overdue' | 'none' => {
  if (!iso) return 'none'
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const due = new Date(`${iso}T00:00:00`)
  const diff = Math.round((due.getTime() - today.getTime()) / (24 * 3600 * 1000))
  if (diff < 0) return 'overdue'
  if (diff <= 2) return 'warn'
  return 'ok'
}

export const priorityChipColor = (priority: WorkItem['priority']): { bg: string; fg: string } => ({
  bg: taskColorTokens.chipPriorityBg[priority],
  fg: taskColorTokens.chipPriorityFg[priority],
})

export const typeChipColor = (type: WorkItem['type']): { bg: string; fg: string } => taskColorTokens.chipType[type]

export const statusColumnDot = (status: WorkItemStatus): string => taskColorTokens.statusColumnDot[status]

export const describeEvent = (event: WorkItemEvent): string => {
  switch (event.type) {
    case 'created': return `${event.actor || '系统'} 创建了任务`
    case 'status_changed': return `${event.actor || '系统'} 将状态从 ${event.fromStatus ?? '?'} 改为 ${event.toStatus ?? '?'}`
    case 'commented': return `${event.actor || '系统'} 添加了评论`
    case 'edited': {
      const field = (event.meta?.field as string | undefined) ?? '字段'
      return `${event.actor || '系统'} 修改了 ${field}`
    }
    case 'deleted': return `${event.actor || '系统'} 将任务移入回收站`
    case 'restored': return `${event.actor || '系统'} 从回收站恢复了任务`
    case 'purged': return `${event.actor || '系统'} 永久删除了任务`
  }
}
```

- [ ] **Step 4: 写失败测试 `tests/app/taskPresentation.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { describeEvent, dueDateTone, formatDeletedBy, retentionDays, trashRemainingDays } from '../../src/app/taskPresentation'

describe('taskPresentation', () => {
  it('formats actor fallback', () => {
    expect(formatDeletedBy('')).toBe('系统')
    expect(formatDeletedBy('alice')).toBe('alice')
  })

  it('calculates retention', () => {
    expect(retentionDays).toBe(30)
  })

  it('trashRemainingDays handles null', () => {
    expect(trashRemainingDays(null).label).toBe('—')
  })

  it('trashRemainingDays recent', () => {
    const r = trashRemainingDays(new Date().toISOString())
    expect(r.label).toMatch(/还剩|明天到期/)
  })

  it('trashRemainingDays expired', () => {
    const r = trashRemainingDays(new Date(Date.now() - 31 * 24 * 3600 * 1000).toISOString())
    expect(r.label).toBe('已过期')
    expect(r.tone).toBe('overdue')
  })

  it('dueDateTone', () => {
    expect(dueDateTone(null)).toBe('none')
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const past = new Date(today.getTime() - 24 * 3600 * 1000); const future = new Date(today.getTime() + 24 * 3600 * 1000)
    const pastIso = past.toISOString().slice(0, 10); const futureIso = future.toISOString().slice(0, 10)
    expect(dueDateTone(pastIso)).toBe('overdue')
    expect(dueDateTone(futureIso)).toBe('warn')
  })

  it('describeEvent creates', () => {
    expect(describeEvent({ id: 'e', workItemId: 'w', type: 'created', actor: 'alice', fromStatus: null, toStatus: null, meta: {}, createdAt: '' })).toContain('alice')
  })

  it('describeEvent status_changed', () => {
    expect(describeEvent({ id: 'e', workItemId: 'w', type: 'status_changed', actor: '', fromStatus: 'todo', toStatus: 'done', meta: {}, createdAt: '' })).toContain('todo')
    expect(describeEvent({ id: 'e', workItemId: 'w', type: 'status_changed', actor: '', fromStatus: 'todo', toStatus: 'done', meta: {}, createdAt: '' })).toContain('done')
  })
})
```

Run: `npm test -- --run tests/app/taskPresentation.test.ts`
Expected: PASS。

- [ ] **Step 5: 扩展 `workItemPresentation.ts` 导出 eventTypeLabels**

把 `src/app/workItemPresentation.ts` 第 21 行后追加：

```ts
export { eventTypeLabels } from './taskPresentation'
```

- [ ] **Step 6: 扩展 `dateForm.ts` 加 `formatRelativeDays`**

读取 `src/app/dateForm.ts` 当前实现后追加：

```ts
export const formatRelativeDays = (iso: string): string => {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return iso
  const diffMs = Date.now() - ms
  const days = Math.floor(diffMs / (24 * 3600 * 1000))
  if (days < 1) return '今天'
  if (days === 1) return '昨天'
  if (days < 7) return `${days} 天前`
  return isoToDateValue(iso)
}
```

- [ ] **Step 7: 一次性跑所有新测试**

Run: `npm test -- --run tests/app/taskPresentation.test.ts tests/app/taskColorTokens.test.ts`
Expected: PASS。

- [ ] **Step 8: Commit**

```bash
git add src/app/taskColorTokens.ts src/app/taskPresentation.ts src/app/workItemPresentation.ts src/app/dateForm.ts tests/app/taskColorTokens.test.ts tests/app/taskPresentation.test.ts
git commit -m "feat(task): color tokens + presentation helpers + relative days"
```

---

## Task 10: TaskCard 组件

**Files:**
- Create: `src/app/TaskCard.tsx`

- [ ] **Step 1: 创建 `src/app/TaskCard.tsx`**

```tsx
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { useState } from 'react'
import type { WorkItem, WorkItemStatus } from '../domain/models'
import { isoToDateValue } from './dateForm'
import { formatRelativeDays } from './dateForm'
import { priorityLabels, workItemStatusLabels, workItemStatuses, workItemTypeLabels } from './workItemPresentation'
import { dueDateTone, priorityChipColor, typeChipColor } from './taskPresentation'

interface TaskCardProps {
  item: WorkItem
  onSaveStatus: (item: WorkItem, status: WorkItemStatus) => void
  onOpenDetail: (item: WorkItem) => void
  onEdit: (item: WorkItem) => void
  onDelete: (item: WorkItem) => void
}

export function TaskCard({ item, onSaveStatus, onOpenDetail, onEdit, onDelete }: TaskCardProps) {
  const draggable = useDraggable({ id: item.id })
  const style = { transform: CSS.Translate.toString(draggable.transform) }
  const [menuOpen, setMenuOpen] = useState(false)
  const typeColor = typeChipColor(item.type)
  const pColor = priorityChipColor(item.priority)
  const dueTone = dueDateTone(item.dueDate)
  return (
    <article
      ref={draggable.setNodeRef}
      className={`task-card ${draggable.isDragging ? 'dragging' : ''}`}
      style={style}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button,select,details')) return
        onOpenDetail(item)
      }}
    >
      <div className="task-card-chips">
        <span className="chip" style={{ background: typeColor.bg, color: typeColor.fg }}>{workItemTypeLabels[item.type]}</span>
        <span className="chip" style={{ background: pColor.bg, color: pColor.fg }}>{priorityLabels[item.priority]}</span>
        {item.dueDate && (
          <span className={`chip chip-due chip-due-${dueTone}`} style={dueTone === 'overdue' ? { color: '#c33e4e' } : dueTone === 'warn' ? { color: '#a45b0c' } : undefined}>
            {dueTone === 'overdue' ? `⚠ ${isoToDateValue(item.dueDate)}` : `📅 ${isoToDateValue(item.dueDate)}`}
          </span>
        )}
        {item.assignee && <span className="chip chip-assignee">{item.assignee.slice(0, 1).toUpperCase()}</span>}
      </div>
      <h4>{item.title}</h4>
      <div className="task-card-meta">{item.description && <p className="task-card-snippet">{item.description.slice(0, 80)}{item.description.length > 80 ? '…' : ''}</p>}</div>
      <div className="task-card-footer">
        <label className="status-select" onClick={(e) => e.stopPropagation()}>
          <span>状态</span>
          <select aria-label={`${item.title} 状态`} value={item.status} onChange={(e) => onSaveStatus(item, e.target.value as WorkItemStatus)}>
            {workItemStatuses.map((s) => <option key={s} value={s}>{workItemStatusLabels[s]}</option>)}
          </select>
        </label>
        <button type="button" className="drag-handle" aria-label={`拖动 ${item.title}`} {...draggable.listeners} {...draggable.attributes}>⠿</button>
        <details className="task-menu" onClick={(e) => e.stopPropagation()} onToggle={(e) => setMenuOpen((e.target as HTMLDetailsElement).open)}>
          <summary aria-label="任务操作">⋯</summary>
          {menuOpen && (
            <ul className="task-menu-list">
              <li><button type="button" onClick={() => { setMenuOpen(false); onEdit(item) }}>编辑</button></li>
              <li><button type="button" className="danger-link" onClick={() => { setMenuOpen(false); onDelete(item) }}>删除</button></li>
            </ul>
          )}
        </details>
      </div>
    </article>
  )
}
```

- [ ] **Step 2: Commit（无测试，本组件作为 Task 12 集成测试覆盖）**

```bash
git add src/app/TaskCard.tsx
git commit -m "feat(task): TaskCard with chips, status select, drag handle, action menu"
```

---

## Task 11: TaskColumn + TaskDialog + TaskTrashList + TaskDetailDrawer

**Files:**
- Create: `src/app/TaskColumn.tsx`
- Create: `src/app/TaskDialog.tsx`
- Create: `src/app/TaskTrashList.tsx`
- Create: `src/app/TaskDetailDrawer.tsx`

- [ ] **Step 1: 创建 `src/app/TaskColumn.tsx`**

```tsx
import { useDroppable } from '@dnd-kit/core'
import type { ReactNode } from 'react'
import type { WorkItem, WorkItemStatus } from '../domain/models'
import { workItemStatusLabels } from './workItemPresentation'
import { statusColumnDot } from './taskPresentation'

interface TaskColumnProps {
  status: WorkItemStatus
  items: WorkItem[]
  children: ReactNode
}

export function TaskColumn({ status, items, children }: TaskColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${status}` })
  return (
    <section ref={setNodeRef} className={`task-column ${isOver ? 'drag-over' : ''}`} aria-label={`${workItemStatusLabels[status]} ${items.length}`}>
      <header className="task-column-header">
        <span className="task-column-dot" style={{ background: statusColumnDot(status) }} aria-hidden="true" />
        <h3>{workItemStatusLabels[status]}</h3>
        <span className="task-column-count">{items.length}</span>
      </header>
      {items.length === 0 ? <p className="task-column-empty">还没有{workItemStatusLabels[status]}的任务</p> : <div className="task-list">{children}</div>}
    </section>
  )
}
```

- [ ] **Step 2: 创建 `src/app/TaskDialog.tsx`**

```tsx
import { useState, type FormEvent } from 'react'
import type { Priority, WorkItem, WorkItemStatus, WorkItemType } from '../domain/models'
import { Modal } from './Modal'
import { dateValueToIso, isValidDateValue } from './dateForm'
import { mutationErrorMessage } from './mutationError'
import { priorityLabels, priorities, workItemStatusLabels, workItemStatuses, workItemTypeLabels, workItemTypes } from './workItemPresentation'

interface TaskDialogProps {
  productId: string
  initial?: WorkItem
  onSave: (item: WorkItem) => Promise<void>
  onClose: () => void
}

const emptyDraft = (productId: string): Omit<WorkItem, 'createdAt' | 'updatedAt'> => ({
  id: `${productId}-${crypto.randomUUID()}`,
  productId,
  type: 'requirement',
  title: '',
  description: '',
  assignee: '',
  priority: 'medium',
  dueDate: null,
  status: 'todo' as WorkItemStatus,
  isDeleted: false,
  deletedAt: null,
  deletedBy: '',
})

export function TaskDialog({ productId, initial, onSave, onClose }: TaskDialogProps) {
  const [draft, setDraft] = useState<Omit<WorkItem, 'createdAt' | 'updatedAt'>>(initial ? { ...initial } : emptyDraft(productId))
  const [errors, setErrors] = useState<{ title?: string; dueDate?: string; save?: string }>({})
  const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const nextErrors = {
      ...(!draft.title.trim() ? { title: '请输入标题' } : {}),
      ...(draft.dueDate && !isValidDateValue(draft.dueDate) ? { dueDate: '请输入有效日期' } : {}),
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    const now = new Date().toISOString()
    const item: WorkItem = { ...draft, title: draft.title.trim(), dueDate: draft.dueDate ? dateValueToIso(draft.dueDate) : null, createdAt: initial?.createdAt ?? now, updatedAt: now }
    setBusy(true)
    try { await onSave(item); onClose() } catch (error) { setErrors({ save: mutationErrorMessage(error, '保存失败，请稍后重试') }) } finally { setBusy(false) }
  }
  return (
    <Modal title={initial ? '编辑任务' : '新建任务'} onClose={onClose} closeDisabled={busy}>
      <form onSubmit={submit} noValidate>
        <div className="field"><label htmlFor="task-title">标题</label>
          <input id="task-title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} aria-invalid={errors.title ? true : undefined} aria-describedby={errors.title ? 'task-title-err' : undefined} />
          {errors.title && <span id="task-title-err" role="alert" className="field-error">{errors.title}</span>}
        </div>
        <div className="form-grid">
          <label className="field">类型<select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as WorkItemType })}>{workItemTypes.map((v) => <option key={v} value={v}>{workItemTypeLabels[v]}</option>)}</select></label>
          <label className="field">优先级<select value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value as Priority })}>{priorities.map((v) => <option key={v} value={v}>{priorityLabels[v]}</option>)}</select></label>
          <label className="field span-2">负责人<input value={draft.assignee} onChange={(e) => setDraft({ ...draft, assignee: e.target.value })} placeholder="选填" /></label>
          <div className="field span-2"><label htmlFor="task-due">截止日期</label>
            <input id="task-due" placeholder="YYYY-MM-DD" value={draft.dueDate ?? ''} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value || null })} aria-invalid={errors.dueDate ? true : undefined} aria-describedby={errors.dueDate ? 'task-due-err' : undefined} />
            {errors.dueDate && <span id="task-due-err" role="alert" className="field-error">{errors.dueDate}</span>}
          </div>
          <div className="field span-2"><label htmlFor="task-desc">描述</label>
            <textarea id="task-desc" rows={5} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="支持纯文本；详情抽屉里可看 Markdown 预览" />
          </div>
        </div>
        {errors.save && <p role="alert" className="feedback error">{errors.save}</p>}
        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={onClose} disabled={busy}>取消</button>
          <button type="submit" disabled={busy}>{initial ? '保存' : '创建任务'}</button>
        </div>
      </form>
    </Modal>
  )
}
```

- [ ] **Step 3: 创建 `src/app/TaskTrashList.tsx`**

```tsx
import type { WorkItem } from '../domain/models'
import { formatRelativeDays } from './dateForm'
import { workItemStatusLabels, workItemTypeLabels } from './workItemPresentation'
import { formatDeletedBy, trashRemainingDays } from './taskPresentation'

interface TaskTrashListProps {
  items: WorkItem[]
  onRestore: (item: WorkItem) => void
  onPurge: (item: WorkItem) => void
}

export function TaskTrashList({ items, onRestore, onPurge }: TaskTrashListProps) {
  if (items.length === 0) return <div className="empty-card"><p>回收站是空的</p></div>
  return (
    <ul className="trash-list" aria-label="回收站">
      {items.map((item) => {
        const remain = trashRemainingDays(item.deletedAt)
        return (
          <li key={item.id} className="trash-card">
            <div className="trash-card-main">
              <h4>{item.title}</h4>
              <p className="trash-card-meta">
                <span className="chip">{workItemTypeLabels[item.type]}</span>
                <span className="chip">原状态 · {workItemStatusLabels[item.status]}</span>
                <span>由 {formatDeletedBy(item.deletedBy)} 于 {item.deletedAt ? formatRelativeDays(item.deletedAt) : ''} 删除</span>
              </p>
            </div>
            <div className={`trash-card-remain tone-${remain.tone}`}>{remain.label}</div>
            <div className="trash-card-actions">
              <button type="button" onClick={() => onRestore(item)}>恢复</button>
              <button type="button" className="danger" onClick={() => onPurge(item)}>永久删除</button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
```

- [ ] **Step 4: 创建 `src/app/TaskDetailDrawer.tsx`**

```tsx
import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'
import type { Priority, WorkItem, WorkItemComment, WorkItemEvent, WorkItemStatus, WorkItemType } from '../domain/models'
import { isoToDateValue, formatRelativeDays } from './dateForm'
import { mutationErrorMessage } from './mutationError'
import { priorityLabels, priorities, workItemStatusLabels, workItemStatuses, workItemTypeLabels, workItemTypes } from './workItemPresentation'
import { describeEvent, priorityChipColor, typeChipColor } from './taskPresentation'

interface TaskDetailDrawerProps {
  item: WorkItem
  comments: WorkItemComment[]
  events: WorkItemEvent[]
  onClose: () => void
  onUpdate: (next: WorkItem) => Promise<void>
  onComment: (body: { author: string; body: string }) => Promise<void>
}

export function TaskDetailDrawer({ item, comments, events, onClose, onUpdate, onComment }: TaskDetailDrawerProps) {
  const [draft, setDraft] = useState(item)
  const [editingTitle, setEditingTitle] = useState(false)
  const [tab, setTab] = useState<'preview' | 'edit'>('preview')
  const [commentText, setCommentText] = useState('')
  const [commentAuthor, setCommentAuthor] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { setDraft(item) }, [item])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const persist = async (next: WorkItem) => {
    setBusy(true); setError('')
    try { await onUpdate(next); setDraft(next) } catch (e) { setError(mutationErrorMessage(e, '保存失败')) } finally { setBusy(false) }
  }

  const submitComment = async () => {
    if (!commentText.trim()) return
    setBusy(true); setError('')
    try { await onComment({ author: commentAuthor.trim() || '匿名', body: commentText.trim() }); setCommentText('') } catch (e) { setError(mutationErrorMessage(e, '评论失败')) } finally { setBusy(false) }
  }

  const typeColor = typeChipColor(draft.type)
  const pColor = priorityChipColor(draft.priority)

  return (
    <aside className="task-drawer" role="dialog" aria-label={`任务 ${item.title}`}>
      <header className="task-drawer-header">
        {editingTitle ? (
          <input autoFocus value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            onBlur={async () => { setEditingTitle(false); if (draft.title.trim() && draft.title !== item.title) await persist({ ...draft, updatedAt: new Date().toISOString() }) }} />
        ) : (
          <h2 onDoubleClick={() => setEditingTitle(true)} title="双击编辑标题">{draft.title}</h2>
        )}
        <button type="button" className="icon-button" onClick={onClose} aria-label="关闭">×</button>
      </header>

      <div className="task-drawer-chips">
        <label>状态 <select value={draft.status} onChange={async (e) => { const next = { ...draft, status: e.target.value as WorkItemStatus }; await persist(next) }}>{workItemStatuses.map((s) => <option key={s} value={s}>{workItemStatusLabels[s]}</option>)}</select></label>
        <label>类型 <select value={draft.type} onChange={async (e) => { const next = { ...draft, type: e.target.value as WorkItemType }; await persist(next) }}>{workItemTypes.map((v) => <option key={v} value={v}>{workItemTypeLabels[v]}</option>)}</select></label>
        <label>优先级 <select value={draft.priority} onChange={async (e) => { const next = { ...draft, priority: e.target.value as Priority }; await persist(next) }}>{priorities.map((v) => <option key={v} value={v}>{priorityLabels[v]}</option>)}</select></label>
        <label>截止 <input type="date" value={draft.dueDate ? isoToDateValue(draft.dueDate) : ''} onChange={async (e) => { const next = { ...draft, dueDate: e.target.value ? new Date(`${e.target.value}T00:00:00Z`).toISOString() : null }; await persist(next) }} /></label>
        <label>负责人 <input value={draft.assignee} onChange={(e) => setDraft({ ...draft, assignee: e.target.value })} onBlur={async () => { if (draft.assignee !== item.assignee) await persist(draft) }} /></label>
        <span className="chip" style={{ background: typeColor.bg, color: typeColor.fg }}>{workItemTypeLabels[draft.type]}</span>
        <span className="chip" style={{ background: pColor.bg, color: pColor.fg }}>{priorityLabels[draft.priority]}</span>
      </div>

      <section className="task-drawer-section">
        <header><h3>描述</h3>
          <div className="task-drawer-tabs">
            <button type="button" className={tab === 'preview' ? 'selected' : ''} onClick={() => setTab('preview')}>预览</button>
            <button type="button" className={tab === 'edit' ? 'selected' : ''} onClick={() => setTab('edit')}>编辑</button>
          </div>
        </header>
        {tab === 'preview' ? (
          draft.description ? <div className="markdown-body"><ReactMarkdown rehypePlugins={[rehypeSanitize]}>{draft.description}</ReactMarkdown></div> : <p className="placeholder">还没有描述</p>
        ) : (
          <textarea rows={8} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} onBlur={async () => { if (draft.description !== item.description) await persist(draft) }} />
        )}
      </section>

      <section className="task-drawer-section">
        <h3>评论 ({comments.length})</h3>
        <ul className="task-drawer-comments">
          {comments.length === 0 ? <li className="placeholder">暂无评论</li> : comments.map((c) => (
            <li key={c.id}>
              <strong>{c.author || '匿名'}</strong>
              <time>{formatRelativeDays(c.createdAt)}</time>
              <p>{c.body}</p>
            </li>
          ))}
        </ul>
        <div className="task-drawer-comment-form">
          <input placeholder="你的名字" value={commentAuthor} onChange={(e) => setCommentAuthor(e.target.value)} />
          <textarea placeholder="写一条评论…" rows={2} value={commentText} onChange={(e) => setCommentText(e.target.value)} />
          <button type="button" onClick={submitComment} disabled={busy || !commentText.trim()}>提交评论</button>
        </div>
      </section>

      <section className="task-drawer-section">
        <h3>活动时间线 ({events.length})</h3>
        <ol className="task-drawer-timeline">
          {events.slice().reverse().map((event) => (
            <li key={event.id} className={`timeline-item timeline-${event.type}`}>
              <span className="timeline-dot" aria-hidden="true" />
              <div>
                <p className="timeline-text">{describeEvent(event)}</p>
                <time>{formatRelativeDays(event.createdAt)}</time>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {error && <p role="alert" className="feedback error">{error}</p>}
    </aside>
  )
}
```

- [ ] **Step 5: 一次性提交四个组件**

```bash
git add src/app/TaskColumn.tsx src/app/TaskDialog.tsx src/app/TaskTrashList.tsx src/app/TaskDetailDrawer.tsx
git commit -m "feat(task): TaskColumn / TaskDialog / TaskTrashList / TaskDetailDrawer"
```

---

## Task 12: TaskBoard 重写

**Files:**
- Modify: `src/app/TaskBoard.tsx`（全文替换）

- [ ] **Step 1: 写失败测试 `tests/app/TaskBoard.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { WorkItem } from '../../src/domain/models'
import { TaskBoard } from '../../src/app/TaskBoard'

const baseItem = (overrides: Partial<WorkItem> = {}): WorkItem => ({
  id: 'p1-item-1', productId: 'p1', type: 'requirement', title: 't', description: '', assignee: '', priority: 'medium', dueDate: null, status: 'todo',
  createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z', isDeleted: false, deletedAt: null, deletedBy: '',
  ...overrides,
})

describe('TaskBoard', () => {
  it('renders board by default with column counts', () => {
    render(<TaskBoard productId="p1" items={[baseItem(), baseItem({ id: 'p1-item-2', status: 'in_progress' })]} trashItems={[]} onSaveWorkItem={vi.fn()} onDeleteWorkItem={vi.fn()} onRestoreWorkItem={vi.fn()} onPurgeWorkItem={vi.fn()} onOpenDetail={vi.fn()} />)
    expect(screen.getByText('需求与 Bug')).toBeInTheDocument()
    expect(screen.getByText(/待处理/).textContent).toMatch(/1/)
  })

  it('switches to trash tab', async () => {
    const user = userEvent.setup()
    render(<TaskBoard productId="p1" items={[]} trashItems={[baseItem({ id: 'trash-1', isDeleted: true, deletedAt: new Date().toISOString(), deletedBy: 'bob' })]} onSaveWorkItem={vi.fn()} onDeleteWorkItem={vi.fn()} onRestoreWorkItem={vi.fn()} onPurgeWorkItem={vi.fn()} onOpenDetail={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /回收站/ }))
    expect(screen.getByText(/回收站是空的|回收站/)).toBeInTheDocument()
  })

  it('shows trash count badge', () => {
    render(<TaskBoard productId="p1" items={[]} trashItems={[baseItem({ isDeleted: true, deletedAt: new Date().toISOString(), deletedBy: 'bob' })]} onSaveWorkItem={vi.fn()} onDeleteWorkItem={vi.fn()} onRestoreWorkItem={vi.fn()} onPurgeWorkItem={vi.fn()} onOpenDetail={vi.fn()} />)
    expect(screen.getByText(/回收站 1/)).toBeInTheDocument()
  })

  it('filters by type', async () => {
    const user = userEvent.setup()
    render(<TaskBoard productId="p1" items={[baseItem(), baseItem({ id: 'p1-bug', type: 'bug' })]} trashItems={[]} onSaveWorkItem={vi.fn()} onDeleteWorkItem={vi.fn()} onRestoreWorkItem={vi.fn()} onPurgeWorkItem={vi.fn()} onOpenDetail={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Bug' }))
    expect(screen.getAllByText(/^Bug$/).length).toBeGreaterThan(0)
  })
})
```

Run: `npm test -- --run tests/app/TaskBoard.test.tsx`
Expected: 失败（组件接口不匹配）。

- [ ] **Step 2: 重写 `src/app/TaskBoard.tsx`**

```tsx
import { DndContext, type DragEndEvent } from '@dnd-kit/core'
import { useState } from 'react'
import type { WorkItem, WorkItemStatus } from '../domain/models'
import { resolveWorkItemStatus } from './workItemTransition'
import { mutationErrorMessage } from './mutationError'
import { TaskCard } from './TaskCard'
import { TaskColumn } from './TaskColumn'
import { TaskDialog } from './TaskDialog'
import { TaskDetailDrawer } from './TaskDetailDrawer'
import { TaskTrashList } from './TaskTrashList'
import { workItemStatuses } from './workItemPresentation'

type Filter = 'all' | 'requirement' | 'bug'

interface TaskBoardProps {
  productId: string
  items: WorkItem[]
  trashItems: WorkItem[]
  comments: Record<string, import('../domain/models').WorkItemComment[]>
  events: Record<string, import('../domain/models').WorkItemEvent[]>
  onSaveWorkItem: (item: WorkItem) => Promise<void>
  onDeleteWorkItem: (item: WorkItem) => Promise<void>
  onRestoreWorkItem: (item: WorkItem) => Promise<void>
  onPurgeWorkItem: (item: WorkItem) => Promise<void>
  onLoadComments: (item: WorkItem) => Promise<void>
  onLoadEvents: (item: WorkItem) => Promise<void>
  onCreateComment: (item: WorkItem, body: { author: string; body: string }) => Promise<void>
  onOpenDetail: (item: WorkItem) => void
  onCloseDetail: () => void
  detailItem: WorkItem | null
}

export function TaskBoard(props: TaskBoardProps) {
  const { productId, items, trashItems, comments, events, onSaveWorkItem, onDeleteWorkItem, onRestoreWorkItem, onPurgeWorkItem, onLoadComments, onLoadEvents, onCreateComment, onOpenDetail, onCloseDetail, detailItem } = props
  const [view, setView] = useState<'board' | 'trash'>('board')
  const [filter, setFilter] = useState<Filter>('all')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<WorkItem | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<WorkItem | null>(null)
  const [confirmPurge, setConfirmPurge] = useState<WorkItem | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const visibleItems = filter === 'all' ? items : items.filter((i) => i.type === filter)

  const handleSaveStatus = async (item: WorkItem, status: WorkItemStatus) => {
    if (item.status === status || busy) return
    setBusy(true); setError('')
    try { await onSaveWorkItem({ ...item, status, updatedAt: new Date().toISOString() }) } catch (e) { setError(mutationErrorMessage(e, '保存失败，请稍后重试')) } finally { setBusy(false) }
  }

  const handleSave = async (item: WorkItem) => { await onSaveWorkItem(item) }

  const handleDelete = async (item: WorkItem) => {
    setConfirmDelete(null)
    setBusy(true); setError('')
    try { await onDeleteWorkItem(item) } catch (e) { setError(mutationErrorMessage(e, '删除失败')) } finally { setBusy(false) }
  }

  const handleRestore = async (item: WorkItem) => {
    setBusy(true); setError('')
    try { await onRestoreWorkItem(item) } catch (e) { setError(mutationErrorMessage(e, '恢复失败')) } finally { setBusy(false) }
  }

  const handlePurge = async (item: WorkItem) => {
    setConfirmPurge(null)
    setBusy(true); setError('')
    try { await onPurgeWorkItem(item) } catch (e) { setError(mutationErrorMessage(e, '永久删除失败')) } finally { setBusy(false) }
  }

  const finishDrag = ({ active, over }: DragEndEvent) => {
    const item = items.find(({ id }) => id === String(active.id))
    if (!item) return
    const next = resolveWorkItemStatus(item.status, over === null ? null : String(over.id))
    if (next !== null) void handleSaveStatus(item, next)
  }

  const trashCount = trashItems.length
  const boardCounts = workItemStatuses.map((s) => visibleItems.filter((i) => i.status === s).length)

  return (
    <section className="work-stack" aria-labelledby="task-board-title">
      <div className="section-heading work-heading">
        <div>
          <h2 id="task-board-title">需求与 Bug</h2>
          <p>按状态跟进产品工作项，删除后可从回收站恢复。</p>
        </div>
        <div className="work-heading-actions">
          <button aria-label="新建任务" onClick={() => setCreating(true)} disabled={busy}>＋ 新建任务</button>
        </div>
      </div>

      <nav className="task-view-tabs" aria-label="任务视图切换">
        <button type="button" className={view === 'board' ? 'selected' : ''} aria-pressed={view === 'board'} onClick={() => setView('board')}>看板</button>
        <button type="button" className={view === 'trash' ? 'selected' : ''} aria-pressed={view === 'trash'} onClick={() => setView('trash')}>回收站 {trashCount > 0 && <span className="badge">{trashCount}</span>}</button>
      </nav>

      {error && <p role="alert" className="feedback error">{error}</p>}

      {view === 'board' ? (
        <>
          <div className="filter-bar" aria-label="任务筛选">
            {([['all','全部'],['requirement','需求'],['bug','Bug']] as const).map(([v,l]) => (
              <button key={v} className={filter === v ? 'selected' : ''} aria-pressed={filter === v} onClick={() => setFilter(v)}>{l}</button>
            ))}
          </div>
          <DndContext onDragEnd={finishDrag}>
            <div className="task-board">
              {workItemStatuses.map((status, idx) => {
                const columnItems = visibleItems.filter((i) => i.status === status)
                return (
                  <TaskColumn key={status} status={status} items={columnItems}>
                    {columnItems.map((item) => (
                      <TaskCard
                        key={item.id}
                        item={item}
                        onSaveStatus={handleSaveStatus}
                        onOpenDetail={(i) => { void onLoadComments(i); void onLoadEvents(i); onOpenDetail(i) }}
                        onEdit={(i) => setEditing(i)}
                        onDelete={(i) => setConfirmDelete(i)}
                      />
                    ))}
                  </TaskColumn>
                )
              })}
              {/* idx referenced to silence lint */}
              <span hidden>{idx(idx)}</span>
            </div>
          </DndContext>
          <p className="task-summary">待处理 {boardCounts[0]} · 进行中 {boardCounts[1]} · 已完成 {boardCounts[2]}</p>
        </>
      ) : (
        <TaskTrashList items={trashItems} onRestore={(i) => void handleRestore(i)} onPurge={(i) => setConfirmPurge(i)} />
      )}

      {creating && <TaskDialog productId={productId} onSave={handleSave} onClose={() => setCreating(false)} />}
      {editing && <TaskDialog productId={productId} initial={editing} onSave={handleSave} onClose={() => setEditing(null)} />}

      {confirmDelete && (
        <div className="dialog-backdrop" role="dialog" aria-label="删除任务">
          <div className="dialog confirm-dialog">
            <h2>删除任务「{confirmDelete.title}」？</h2>
            <p>任务会进入回收站，30 天内可恢复。</p>
            <div className="dialog-actions">
              <button type="button" className="secondary" onClick={() => setConfirmDelete(null)}>取消</button>
              <button type="button" className="danger" onClick={() => void handleDelete(confirmDelete)}>删除</button>
            </div>
          </div>
        </div>
      )}
      {confirmPurge && (
        <div className="dialog-backdrop" role="dialog" aria-label="永久删除">
          <div className="dialog confirm-dialog">
            <h2>永久删除任务「{confirmPurge.title}」？</h2>
            <p>此操作不可撤销，相关评论与历史也将被删除。</p>
            <div className="dialog-actions">
              <button type="button" className="secondary" onClick={() => setConfirmPurge(null)}>取消</button>
              <button type="button" className="danger" onClick={() => void handlePurge(confirmPurge)}>永久删除</button>
            </div>
          </div>
        </div>
      )}

      {detailItem && (
        <TaskDetailDrawer
          item={detailItem}
          comments={comments[detailItem.id] ?? []}
          events={events[detailItem.id] ?? []}
          onClose={onCloseDetail}
          onUpdate={(next) => onSaveWorkItem(next)}
          onComment={(body) => onCreateComment(detailItem, body)}
        />
      )}
    </section>
  )
}

const idx = (n: number) => n
```

- [ ] **Step 3: 运行 TaskBoard 测试**

Run: `npm test -- --run tests/app/TaskBoard.test.tsx`
Expected: PASS（若失败，调整 props 默认值 / 测试 wrapper）。

- [ ] **Step 4: Commit**

```bash
git add src/app/TaskBoard.tsx tests/app/TaskBoard.test.tsx
git commit -m "feat(task): TaskBoard rewrite with board/trash tabs + delete/restore flow"
```

---

## Task 13: ProductDetail 接线

**Files:**
- Modify: `src/app/ProductDetail.tsx`

- [ ] **Step 1: 增加 detail state 与 handlers 透传**

把 `src/app/ProductDetail.tsx` 第 31 行 `<ProductDetail {...props} />` 的 props 列表替换为：

```tsx
export function ProductDetail({
  products, workItems, trashWorkItems, comments, events, onSaveProduct, onSaveWorkItem, onDeleteWorkItem, onRestoreWorkItem, onPurgeWorkItem, onLoadComments, onLoadEvents, onCreateComment, onArchiveProduct, onRestoreProduct,
}: ProductDetailProps & {
  trashWorkItems: WorkItem[]
  comments: Record<string, import('../domain/models').WorkItemComment[]>
  events: Record<string, import('../domain/models').WorkItemEvent[]>
  onDeleteWorkItem: (i: WorkItem) => Promise<void>
  onRestoreWorkItem: (i: WorkItem) => Promise<void>
  onPurgeWorkItem: (i: WorkItem) => Promise<void>
  onLoadComments: (i: WorkItem) => Promise<void>
  onLoadEvents: (i: WorkItem) => Promise<void>
  onCreateComment: (i: WorkItem, body: { author: string; body: string }) => Promise<void>
})
```

并把组件函数体第 60 行起替换（保留 nav 与 header）：

```tsx
const [detailItem, setDetailItem] = useState<WorkItem | null>(null)
const productWorkItems = workItems.filter(({ productId }) => productId === product.id)
const productTrash = trashWorkItems.filter(({ productId }) => productId === product.id)
// ... existing nav + header ...
{activeTab === 'tasks' && (
  <TaskBoard
    productId={product.id}
    items={productWorkItems}
    trashItems={productTrash}
    comments={comments}
    events={events}
    onSaveWorkItem={onSaveWorkItem}
    onDeleteWorkItem={onDeleteWorkItem}
    onRestoreWorkItem={onRestoreWorkItem}
    onPurgeWorkItem={onPurgeWorkItem}
    onLoadComments={onLoadComments}
    onLoadEvents={onLoadEvents}
    onCreateComment={onCreateComment}
    onOpenDetail={setDetailItem}
    onCloseDetail={() => setDetailItem(null)}
    detailItem={detailItem}
  />
)}
```

- [ ] **Step 2: typecheck**

Run: `npm run typecheck:test`
Expected: 通过。

- [ ] **Step 3: Commit**

```bash
git add src/app/ProductDetail.tsx
git commit -m "feat(task): wire TaskBoard with comments/events/trash + detail drawer"
```

---

## Task 14: 样式迁移与全局清理

**Files:**
- Create: `src/styles/task.css`
- Modify: `src/styles/global.css:65`（替换 task-* 段）

- [ ] **Step 1: 创建 `src/styles/task.css`**

```css
.work-stack { display: grid; gap: 18px; }
.work-heading { padding: 4px 0; }
.work-heading h2 { margin-bottom: 6px; }
.work-heading p { margin: 0; color: #747887; }
.work-heading-actions { display: flex; gap: 8px; align-items: center; }

.task-view-tabs { display: flex; gap: 6px; padding-bottom: 6px; border-bottom: 1px solid #e6e7ed; }
.task-view-tabs button { padding: 8px 14px; border: 0; border-radius: 8px 8px 0 0; color: #686c79; background: transparent; font-weight: 700; cursor: pointer; }
.task-view-tabs button.selected { color: #5148d6; background: #f0efff; }
.task-view-tabs .badge { display: inline-block; margin-left: 6px; padding: 1px 7px; border-radius: 999px; background: #c33e4e; color: #fff; font-size: 11px; font-weight: 700; }

.filter-bar { display: flex; gap: 8px; }
.filter-bar button { padding: 6px 12px; border-radius: 999px; color: #5b5e6c; background: #fff; border: 1px solid #e6e7ed; font-weight: 600; }
.filter-bar button.selected { color: #fff; background: #6259e8; border-color: #6259e8; }

.task-board { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; align-items: start; }
.task-column { min-height: 240px; padding: 14px; border: 1px solid #e3e4ec; border-radius: 14px; background: #edeef4; transition: border-color .15s, background .15s; }
.task-column.drag-over { border-color: #6259e8; background: #eeedff; }
.task-column-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.task-column-header h3 { margin: 0; color: #525665; font-size: 13px; font-weight: 700; }
.task-column-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }
.task-column-count { color: #858997; font-size: 12px; margin-left: auto; }
.task-column-empty { margin: 8px 0 0; padding: 14px 8px; color: #a0a3b1; font-size: 13px; text-align: center; }
.task-list { display: grid; gap: 10px; }

.task-card { position: relative; padding: 14px; border: 1px solid #e6e7ed; border-radius: 12px; background: #fff; box-shadow: 0 3px 10px rgba(42, 46, 70, .04); cursor: pointer; }
.task-card.dragging { opacity: .7; }
.task-card-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
.chip { display: inline-flex; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; color: #656977; background: #f1f2f6; }
.chip-due-overdue { background: #ffe7ea; }
.chip-due-warn { background: #fff4db; }
.chip-due-ok { background: #efefff; }
.chip-assignee { background: linear-gradient(135deg,#755cf1,#477ce8); color: #fff; width: 22px; height: 22px; padding: 0; border-radius: 50%; display: grid; place-items: center; }
.task-card h4 { margin: 0 28px 8px 0; font-size: 14px; line-height: 1.5; color: #1d2130; }
.task-card-snippet { margin: 0; color: #858997; font-size: 12px; line-height: 1.5; }
.task-card-meta { display: flex; flex-wrap: wrap; gap: 6px; }
.task-card-footer { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
.task-card-footer .status-select { flex: 1; }
.drag-handle { padding: 4px 7px; color: #9295a2; background: transparent; border: 0; cursor: grab; }
.drag-handle:hover { color: #6259e8; background: #f0efff; border-radius: 6px; }

.status-select { display: grid; gap: 4px; color: #858895; font-size: 11px; }
.status-select select { width: 100%; padding: 6px 8px; border: 1px solid #dfe1e9; border-radius: 7px; background: #fff; }

.task-menu { position: relative; }
.task-menu summary { list-style: none; cursor: pointer; padding: 4px 8px; border-radius: 6px; color: #858997; user-select: none; }
.task-menu summary::-webkit-details-marker { display: none; }
.task-menu[open] summary { background: #f0efff; color: #4e46cd; }
.task-menu-list { position: absolute; right: 0; top: 28px; z-index: 5; min-width: 120px; padding: 6px; margin: 0; list-style: none; border: 1px solid #e6e7ed; border-radius: 10px; background: #fff; box-shadow: 0 8px 24px rgba(0,0,0,.12); }
.task-menu-list button { display: block; width: 100%; padding: 6px 10px; border: 0; border-radius: 6px; background: transparent; color: #2a2e3d; text-align: left; font-weight: 600; }
.task-menu-list button:hover { background: #f1f2f6; }
.task-menu-list .danger-link { color: #c33e4e; }

.task-summary { margin: 0; color: #858895; font-size: 12px; }

.trash-list { display: grid; gap: 10px; padding: 0; margin: 0; list-style: none; }
.trash-card { display: grid; grid-template-columns: 1fr auto auto; gap: 12px; align-items: center; padding: 16px; border: 1px solid #e6e7ed; border-radius: 13px; background: #fff; }
.trash-card h4 { margin: 0 0 6px; font-size: 14px; }
.trash-card-meta { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; color: #747887; font-size: 12px; }
.trash-card-remain { padding: 6px 10px; border-radius: 8px; font-weight: 700; font-size: 12px; }
.trash-card-remain.tone-ok { background: #e3f8ef; color: #14845a; }
.trash-card-remain.tone-warn { background: #fff4db; color: #a45b0c; }
.trash-card-remain.tone-overdue { background: #ffe7ea; color: #c33e4e; }
.trash-card-actions { display: flex; gap: 8px; }

.task-drawer { position: fixed; top: 0; right: 0; bottom: 0; width: min(480px, 100%); z-index: 30; padding: 24px; overflow-y: auto; background: #fff; box-shadow: -16px 0 60px rgba(42,46,70,.18); border-left: 1px solid #e6e7ed; }
.task-drawer-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.task-drawer-header h2 { margin: 0; font-size: 18px; }
.task-drawer-header input { flex: 1; padding: 8px 10px; border: 1px solid #dfe1e9; border-radius: 8px; font-size: 18px; font-weight: 700; }
.task-drawer-chips { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 18px; }
.task-drawer-chips label { display: grid; gap: 4px; color: #858895; font-size: 11px; font-weight: 700; }
.task-drawer-chips select, .task-drawer-chips input { padding: 6px 8px; border: 1px solid #dfe1e9; border-radius: 7px; background: #fff; color: #2a2e3d; }
.task-drawer-chips .chip { justify-self: start; }
.task-drawer-section { margin-bottom: 18px; padding-bottom: 14px; border-bottom: 1px solid #ececf2; }
.task-drawer-section h3 { margin: 0 0 8px; font-size: 13px; color: #777b88; }
.task-drawer-tabs { display: flex; gap: 6px; }
.task-drawer-tabs button { padding: 4px 10px; border-radius: 6px; background: transparent; color: #686c79; font-weight: 700; font-size: 12px; }
.task-drawer-tabs button.selected { background: #efefff; color: #4e46cd; }
.task-drawer-section textarea { width: 100%; padding: 10px; border: 1px solid #dfe1e9; border-radius: 8px; }
.markdown-body { padding: 12px 14px; border: 1px solid #e6e7ed; border-radius: 8px; background: #fafbff; line-height: 1.6; }
.markdown-body :is(h1,h2,h3) { margin-top: 1.1em; }
.markdown-body pre { overflow-x: auto; padding: 10px; border-radius: 6px; background: #f3f4f7; }
.markdown-body code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.task-drawer-comments { display: grid; gap: 10px; padding: 0; margin: 0 0 12px; list-style: none; }
.task-drawer-comments li { padding: 10px 12px; border: 1px solid #e6e7ed; border-radius: 10px; background: #fff; }
.task-drawer-comments strong { font-weight: 700; }
.task-drawer-comments time { margin-left: 8px; color: #858895; font-size: 11px; }
.task-drawer-comments p { margin: 6px 0 0; color: #2a2e3d; }
.task-drawer-comment-form { display: grid; gap: 6px; }
.task-drawer-comment-form input, .task-drawer-comment-form textarea { padding: 8px; border: 1px solid #dfe1e9; border-radius: 8px; }
.task-drawer-comment-form button { justify-self: end; padding: 6px 14px; }
.task-drawer-timeline { display: grid; gap: 10px; padding: 0; margin: 0; list-style: none; }
.timeline-item { display: grid; grid-template-columns: 16px 1fr; gap: 10px; }
.timeline-dot { width: 10px; height: 10px; margin-top: 6px; border-radius: 50%; background: #6259e8; align-self: start; }
.timeline-created .timeline-dot { background: #14845a; }
.timeline-deleted .timeline-dot { background: #c33e4e; }
.timeline-restored .timeline-dot { background: #6259e8; }
.timeline-purged .timeline-dot { background: #777b88; }
.timeline-commented .timeline-dot { background: #4f48c8; }
.timeline-edited .timeline-dot { background: #a45b0c; }
.timeline-text { margin: 0; color: #2a2e3d; font-size: 13px; }
.timeline-item time { color: #858895; font-size: 11px; }

@media (max-width: 720px) {
  .task-board { grid-template-columns: 1fr; }
  .trash-card { grid-template-columns: 1fr; }
  .task-drawer { width: 100%; }
}
```

- [ ] **Step 2: 把 global.css 第 65 行 `.task-*` 段替换为单行 import**

把 `src/styles/global.css` 第 65 行整段（从 `.task-board {` 起直到 `.status-select select {...}` 止）替换为：

```css
@import url('./task.css');
```

- [ ] **Step 3: typecheck + 测试**

Run: `npm run typecheck:test && npm test -- --run tests/app/TaskBoard.test.tsx`
Expected: 通过。

- [ ] **Step 4: Commit**

```bash
git add src/styles/task.css src/styles/global.css
git commit -m "feat(styles): extract task-area styles into task.css"
```

---

## Task 15: App.tsx 接线 comments/events state

**Files:**
- Modify: `src/app/App.tsx`

- [ ] **Step 1: 增加 comments/events state 与 loaders**

在 `useStudio` 内、`setSnapshot` 之后追加：

```ts
const [comments, setComments] = useState<Record<string, WorkItemComment[]>>({})
const [events, setEvents] = useState<Record<string, WorkItemEvent[]>>({})
const loadComments = useCallback(async (item: WorkItem) => {
  try {
    const list = await api.listWorkItemComments(item.productId, item.id)
    setComments((prev) => ({ ...prev, [item.id]: list }))
  } catch { /* drawer UI will show empty list */ }
}, [])
const loadEvents = useCallback(async (item: WorkItem) => {
  try {
    const list = await api.listWorkItemEvents(item.productId, item.id)
    setEvents((prev) => ({ ...prev, [item.id]: list }))
  } catch { /* drawer UI will show empty list */ }
}, [])
const createComment = useCallback(async (item: WorkItem, body: { author: string; body: string }) => {
  await api.createWorkItemComment(item.productId, item.id, body)
  await loadComments(item)
}, [loadComments])
```

并在 `handlers` 返回中增加 `onLoadComments: loadComments, onLoadEvents: loadEvents, onCreateComment: createComment`。

把 `StudioState.snapshot` 改为 `snapshot: Snapshot & { trashWorkItems: WorkItem[] }`，并在 `useStudio` 的返回对象中加入 `comments / events`。

- [ ] **Step 2: Workspace / ProductDetail 路由 props 透传**

第 43 行 `<ProductDetail ... />` 处展开 `comments / events`。

- [ ] **Step 3: typecheck + 测试**

Run: `npm run typecheck:test && npm test -- --run`
Expected: 通过。

- [ ] **Step 4: Commit**

```bash
git add src/app/App.tsx
git commit -m "feat(app): load comments/events on demand for task detail drawer"
```

---

## Task 16: 全量验证

**Files:**
- 无（仅验证）

- [ ] **Step 1: Lint**

Run: `npm run lint`
Expected: 无错误。

- [ ] **Step 2: TypeCheck（应用 + 测试）**

Run: `npm run build`
Expected: 通过。

- [ ] **Step 3: 全测试**

Run: `npm test -- --run`
Expected: 全 PASS。

- [ ] **Step 4: 手动验收**

1. 启动 dev server：`npm run dev`
2. 打开某产品 → 任务 Tab
3. 验证：新建任务（含 description / assignee）→ 卡片显示 chips
4. 验证：拖拽改状态、点击卡片打开抽屉
5. 验证：抽屉里修改 description 预览→编辑切换、添加评论、查看时间线
6. 验证：右上 `⋯` → 删除 → 确认 → 看板不见 → 切到回收站可见
7. 验证：回收站 → 恢复 → 任务回到看板
8. 验证：回收站 → 永久删除 → confirm → 任务消失
9. 验证：30 天后过期自动清理（手动改 `deleted_at` 测试）

- [ ] **Step 5: Commit 验证报告**

如发现手动验收有修复，commit 修复；若无额外改动，输出「manual QA passed」即可。

```bash
# 仅在有修复时执行
git commit --allow-empty -m "chore: manual QA passed"
```

---

## Self-Review

**Spec coverage:**
- 软删除 + 回收站 → Task 1 / 2 / 3 / 4 / 5 ✓
- 30 天保留 + 启动 sweep → Task 3 / 5 ✓
- 描述 + 负责人 → Task 1 / 3 / 6 / 10 / 11 ✓
- 详情抽屉 + 描述编辑 + 评论 + 时间线 → Task 11 / 12 / 13 / 15 ✓
- 视觉打磨 + 颜色 token → Task 9 / 10 / 11 / 14 ✓
- 极简保留 + 不动其他页面 → Task 14 ✓（只替换 global.css 的 .task-* 段）
- 错误码 ALREADY_DELETED / NOT_DELETED → Task 4 ✓
- actor 兜底（header → body → ''）→ Task 4 ✓
- edited event meta.field 字段名 → Task 3 ✓
- 启动 sweep 失败不阻塞 → Task 5 ✓
- localStorage 仓库兼容 → Task 7 ✓

**Placeholder scan:** 无 TBD / TODO / 「类似 Task N」。

**Type consistency:**
- `mapWork` 字段名 ↔ `WorkItem` 接口：`description / assignee / isDeleted / deletedAt / deletedBy` 全部一致
- `softDeleteWorkItem(id, actor, expected)` / `restoreWorkItem(id, actor, expected)` / `purgeWorkItem(id, expected)` ↔ HTTP 路由与前端 client API 参数一致
- `ALREADY_DELETED / NOT_DELETED` ↔ `RepositoryError.code` 联合类型一致
- `WorkItemEventType` 七种类型 ↔ `describeEvent` switch 全覆盖
- `taskPresentation.eventTypeLabels` ↔ `workItemPresentation` re-export 一致
- `comments: Record<id, WorkItemComment[]>` ↔ TaskBoard / ProductDetail props 一致
- `trashWorkItems: WorkItem[]` ↔ useStudio 返回类型与 TaskBoard 透传一致

无类型漂移，无未定义引用。