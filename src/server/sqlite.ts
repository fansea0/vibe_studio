import Database from 'better-sqlite3'
import type { Product, ProductVersion, WorkItem, MarkdownDocument, ProductStatus, WorkItemType, WorkItemStatus, VersionStatus, Priority, PublicProduct, WorkItemComment, WorkItemEvent, WorkItemEventType } from '../domain/models.js'
import { NO_RELEASED_VERSION } from '../domain/productMetrics.js'

type Comments = Record<string, Record<string, string>>
export const schemaComments: Comments = {
  products: { id: '主键', name: '名称', normalized_name: '规范化名称', description: '描述', product_type: '类型', icon: '图标', status: '状态', status_before_archive: '归档前状态', completion_percent: '完成度', user_count: '用户数', user_count_source: '用户数来源', app_url: '应用地址', repository_path: '仓库路径', archived_at: '归档时间', created_at: '创建时间', updated_at: '更新时间', is_deleted: '删除标识', is_public: '是否对外公开', showcase_page_path: '自定义作品页路径' },
  work_items: { id: '主键', product_id: '产品ID', type: '类型', title: '标题', description: '描述', assignee: '负责人', priority: '优先级', due_date: '截止时间', status: '状态', created_at: '创建时间', updated_at: '更新时间', is_deleted: '删除标识', deleted_at: '删除时间', deleted_by: '删除人', archive_deleted: '归档删除标识' },
  versions: { id: '主键', product_id: '产品ID', number: '版本号', status: '状态', released_at: '发布时间', notes: '备注', created_at: '创建时间', updated_at: '更新时间', is_deleted: '删除标识', archive_deleted: '归档删除标识' },
  documents: { id: '主键', product_id: '产品ID', name: '名称', normalized_name: '规范化名称', content: '内容', created_at: '创建时间', updated_at: '更新时间', is_deleted: '删除标识', archive_deleted: '归档删除标识' }
}
export class RepositoryError extends Error {
  code: 'VALIDATION_FAILED'|'NOT_FOUND'|'CONFLICT'|'DUPLICATE'|'ALREADY_DELETED'|'NOT_DELETED'
  constructor(code: 'VALIDATION_FAILED'|'NOT_FOUND'|'CONFLICT'|'DUPLICATE'|'ALREADY_DELETED'|'NOT_DELETED', message: string) { super(message); this.code = code; this.name = 'RepositoryError' }
}
type ProductInput = Omit<Product, 'id'|'createdAt'|'updatedAt'|'archivedAt'|'isDeleted'> & { archivedAt?: string|null }
type WorkInput = Omit<WorkItem, 'id'|'productId'|'createdAt'|'updatedAt'|'isDeleted'|'deletedAt'|'deletedBy'>
type VersionInput = Omit<ProductVersion, 'id'|'productId'|'createdAt'|'updatedAt'>
type DocInput = Pick<MarkdownDocument, 'name'|'content'>
const now = () => new Date().toISOString()
const normalized = (s: string) => s.normalize('NFC').trim().toLowerCase()
const statusCode: Record<string, number> = { developing: 0, beta: 1, released: 2, archived: 3 }
const versionCode: Record<string, number> = { planned: 0, released: 1 }
const workTypeCode: Record<string, number> = { requirement: 0, bug: 1 }
const priorityCode: Record<string, number> = { low: 0, medium: 1, high: 2, urgent: 3 }
const workStatusCode: Record<string, number> = { todo: 0, in_progress: 1, done: 2 }
const bump = (old: string) => { const n = Date.parse(old); const t = Date.now(); return new Date(Math.max(t, Number.isNaN(n) ? t : n + 1)).toISOString() }
const mapProduct = (r: any): Product => ({ id: String(r.id), name: r.name, description: r.description, productType: r.product_type, icon: r.icon, status: ['developing','beta','released','archived'][r.status] as ProductStatus, completionPercent: r.completion_percent, userCount: r.user_count, userCountSource: r.user_count_source, appUrl: r.app_url || null, repositoryPath: r.repository_path, archivedAt: r.archived_at || null, isPublic: r.is_public === 1, showcasePagePath: r.showcase_page_path || '', createdAt: r.created_at, updatedAt: r.updated_at, isDeleted: Boolean(r.is_deleted) })
const mapWork = (r: any): WorkItem => ({ id: String(r.id), productId: String(r.product_id), type: ['requirement','bug'][r.type] as WorkItemType, title: r.title, description: r.description ?? '', assignee: r.assignee ?? '', priority: ['low','medium','high','urgent'][r.priority] as Priority, dueDate: r.due_date || null, status: ['todo','in_progress','done'][r.status] as WorkItemStatus, createdAt: r.created_at, updatedAt: r.updated_at, isDeleted: Boolean(r.is_deleted), deletedAt: r.deleted_at || null, deletedBy: r.deleted_by ?? '' })
const mapVersion = (r: any): ProductVersion => ({ id: String(r.id), productId: String(r.product_id), number: r.number, status: ['planned','released'][r.status] as VersionStatus, releasedAt: r.released_at || null, notes: r.notes, createdAt: r.created_at, updatedAt: r.updated_at })
const mapPublicProduct = (r: any): PublicProduct => ({ id: String(r.id), name: r.name, description: r.description, icon: r.icon, status: ['developing','beta','released','archived'][r.status] as ProductStatus, currentVersion: r.current_version ?? NO_RELEASED_VERSION, userCount: r.user_count, appUrl: r.app_url || null, updatedAt: r.updated_at, showcasePagePath: r.showcase_page_path ?? '' })
const mapDocument = (r: any): MarkdownDocument => ({ id: String(r.id), productId: String(r.product_id), name: r.name, content: r.content, createdAt: r.created_at, updatedAt: r.updated_at })

export interface SqliteRepository { listProducts(includeArchived?: boolean): Product[]; getProduct(id: string): Product|undefined; createProduct(i: ProductInput): Product; updateProduct(id: string, i: Partial<ProductInput>, expectedUpdatedAt?: string): Product; archiveProduct(id: string, e?: string): Product; restoreProduct(id: string, e?: string): Product; listWorkItems(pid: string, opts?: { includeDeleted?: boolean; onlyDeleted?: boolean }): WorkItem[]; getWorkItem(pid: string, id: string): WorkItem; createWorkItem(pid: string, i: WorkInput): WorkItem; updateWorkItem(id: string, i: Partial<WorkInput>, expectedUpdatedAt?: string): WorkItem; softDeleteWorkItem(id: string, actor: string, expectedUpdatedAt?: string): WorkItem; restoreWorkItem(id: string, actor: string, expectedUpdatedAt?: string): WorkItem; purgeWorkItem(id: string, expectedUpdatedAt?: string): void; purgeOldDeletedWorkItems(retentionDays: number): number; listComments(workItemId: string): WorkItemComment[]; createComment(workItemId: string, author: string, body: string): WorkItemComment; listEvents(workItemId: string): WorkItemEvent[]; deleteWorkItem(id: string): void; listVersions(pid: string): ProductVersion[]; createVersion(pid: string, i: VersionInput): ProductVersion; updateVersion(id: string, i: Partial<VersionInput>, expectedUpdatedAt?: string): ProductVersion; deleteVersion(id: string): void; listDocuments(pid: string): MarkdownDocument[]; createDocument(pid: string, i: DocInput, e?: string): MarkdownDocument; updateDocument(id: string, i: Partial<DocInput>, e?: string): MarkdownDocument; deleteDocument(id: string): void; getProductSummary(pid: string): any; listPublicProducts(): PublicProduct[]; getPublicProduct(id: string): PublicProduct|undefined; transaction<T>(fn: () => T): T; tableNames(): string[]; foreignKeysEnabled(): boolean; close(): void }

export function createSqliteRepository(filename: string): SqliteRepository {
  const db = new Database(filename); db.pragma('foreign_keys = ON')
  db.exec(`CREATE TABLE IF NOT EXISTS products (
-- 字段: 主键
id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL DEFAULT 0,
-- 字段: 名称
name TEXT NOT NULL DEFAULT '',
-- 字段: 规范化名称
normalized_name TEXT NOT NULL DEFAULT '',
-- 字段: 描述
description TEXT NOT NULL DEFAULT '',
-- 字段: 类型
product_type TEXT NOT NULL DEFAULT '',
-- 字段: 图标
icon TEXT NOT NULL DEFAULT '',
-- 字段: 状态
status INTEGER NOT NULL DEFAULT 0,
-- 字段: 完成度
completion_percent INTEGER NOT NULL DEFAULT 0,
-- 字段: 用户数
user_count INTEGER NOT NULL DEFAULT 0,
-- 字段: 用户数来源
user_count_source TEXT NOT NULL DEFAULT '',
-- 字段: 应用地址
app_url TEXT NOT NULL DEFAULT '',
-- 字段: 仓库路径
repository_path TEXT NOT NULL DEFAULT '',
-- 字段: 归档时间
archived_at TEXT NOT NULL DEFAULT '',
status_before_archive INTEGER NOT NULL DEFAULT 0,
-- 字段: 创建时间
created_at TEXT NOT NULL DEFAULT '',
-- 字段: 更新时间
updated_at TEXT NOT NULL DEFAULT '',
-- 字段: 删除标识
is_deleted INTEGER NOT NULL DEFAULT 0,
-- 字段: 是否对外公开
is_public INTEGER NOT NULL DEFAULT 0,
-- 字段: 自定义作品页路径
showcase_page_path TEXT NOT NULL DEFAULT ''
);
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
CREATE TABLE IF NOT EXISTS versions (
-- 字段: 主键
id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL DEFAULT 0,
-- 字段: 产品ID
product_id INTEGER NOT NULL DEFAULT 0,
-- 字段: 版本号
number TEXT NOT NULL DEFAULT '',
-- 字段: 状态
status INTEGER NOT NULL DEFAULT 0,
-- 字段: 发布时间
released_at TEXT NOT NULL DEFAULT '',
-- 字段: 备注
notes TEXT NOT NULL DEFAULT '',
-- 字段: 创建时间
created_at TEXT NOT NULL DEFAULT '',
-- 字段: 更新时间
updated_at TEXT NOT NULL DEFAULT '',
-- 字段: 删除标识
is_deleted INTEGER NOT NULL DEFAULT 0,
-- 字段: 归档删除标识
archive_deleted INTEGER NOT NULL DEFAULT 0,
FOREIGN KEY(product_id) REFERENCES products(id)
);
CREATE TABLE IF NOT EXISTS documents (
-- 字段: 主键
id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL DEFAULT 0,
-- 字段: 产品ID
product_id INTEGER NOT NULL DEFAULT 0,
-- 字段: 名称
name TEXT NOT NULL DEFAULT '',
-- 字段: 规范化名称
normalized_name TEXT NOT NULL DEFAULT '',
-- 字段: 内容
content TEXT NOT NULL DEFAULT '',
-- 字段: 创建时间
created_at TEXT NOT NULL DEFAULT '',
-- 字段: 更新时间
updated_at TEXT NOT NULL DEFAULT '',
-- 字段: 删除标识
is_deleted INTEGER NOT NULL DEFAULT 0,
-- 字段: 归档删除标识
archive_deleted INTEGER NOT NULL DEFAULT 0,
FOREIGN KEY(product_id) REFERENCES products(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS products_name_uq ON products(normalized_name) WHERE is_deleted=0;
CREATE UNIQUE INDEX IF NOT EXISTS versions_product_number_uq ON versions(product_id,number) WHERE is_deleted=0;
CREATE UNIQUE INDEX IF NOT EXISTS documents_product_name_uq ON documents(product_id,normalized_name) WHERE is_deleted=0;`)
  try { db.exec('ALTER TABLE products ADD COLUMN status_before_archive INTEGER NOT NULL DEFAULT 0') } catch { }
  try { db.exec('ALTER TABLE products ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0') } catch { }
  try { db.exec('ALTER TABLE products ADD COLUMN showcase_page_path TEXT NOT NULL DEFAULT \'\'') } catch { }
  for (const table of ['work_items','versions','documents']) { try { db.exec(`ALTER TABLE ${table} ADD COLUMN archive_deleted INTEGER NOT NULL DEFAULT 0`) } catch { } }
  for (const col of [['description',"TEXT NOT NULL DEFAULT ''"],['assignee',"TEXT NOT NULL DEFAULT ''"],['deleted_at',"TEXT NOT NULL DEFAULT ''"],['deleted_by',"TEXT NOT NULL DEFAULT ''"]]) {
    try { db.exec(`ALTER TABLE work_items ADD COLUMN ${col[0]} ${col[1]}`) } catch { /* column exists */ }
  }
  db.exec('CREATE INDEX IF NOT EXISTS work_items_product_idx ON work_items(product_id); CREATE INDEX IF NOT EXISTS versions_product_idx ON versions(product_id); CREATE INDEX IF NOT EXISTS documents_product_idx ON documents(product_id)')
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
  const getProduct = (id: string) => { const r = db.prepare('SELECT * FROM products WHERE id=? AND is_deleted=0').get(Number(id)); return r ? mapProduct(r) : undefined }
  const ensureName = (name: string) => { if (typeof name !== 'string' || !normalized(name)) throw new RepositoryError('VALIDATION_FAILED', 'name') }
  const ensureProductStatus = (status: string) => { if (statusCode[status] === undefined) throw new RepositoryError('VALIDATION_FAILED', 'status') }
  const ensureWork = (i: Partial<WorkInput>) => { if (typeof i.title !== 'string' || !i.title.trim()) throw new RepositoryError('VALIDATION_FAILED', 'title'); if (i.description !== undefined && typeof i.description !== 'string') throw new RepositoryError('VALIDATION_FAILED', 'description'); if (i.assignee !== undefined && typeof i.assignee !== 'string') throw new RepositoryError('VALIDATION_FAILED', 'assignee'); if (i.type !== undefined && workTypeCode[i.type] === undefined) throw new RepositoryError('VALIDATION_FAILED', 'type'); if (i.priority !== undefined && priorityCode[i.priority] === undefined) throw new RepositoryError('VALIDATION_FAILED', 'priority'); if (i.status !== undefined && workStatusCode[i.status] === undefined) throw new RepositoryError('VALIDATION_FAILED', 'status'); if (i.dueDate !== undefined && i.dueDate !== null && i.dueDate !== '' && !/^\d{4}-\d\d-\d\d$/.test(i.dueDate)) throw new RepositoryError('VALIDATION_FAILED', 'dueDate') }
  const mapMutationError = (e: unknown, entity: string): RepositoryError => { const message = e instanceof Error ? e.message : ''; if (/unique constraint/i.test(message)) return new RepositoryError('DUPLICATE', entity); if (/foreign key constraint/i.test(message)) return new RepositoryError('NOT_FOUND', entity); return new RepositoryError('VALIDATION_FAILED', entity) }
  const ensureDoc = (i: Partial<DocInput>) => { if (typeof i.name !== 'string' || !normalized(i.name) || !/\.(md|markdown)$/i.test(i.name) || typeof i.content !== 'string' || Buffer.byteLength(i.content, 'utf8') > 512 * 1024) throw new RepositoryError('VALIDATION_FAILED', 'document') }
  const recordEvent = (workItemId: string, type: WorkItemEventType, actor: string, fromStatus: WorkItemStatus | null, toStatus: WorkItemStatus | null, meta: Record<string, unknown>): void => {
    db.prepare('INSERT INTO work_item_events(id, work_item_id, type, actor, from_status, to_status, meta, created_at) VALUES (?,?,?,?,?,?,?,?)').run(
      crypto.randomUUID(), Number(workItemId), type, actor, fromStatus ?? '', toStatus ?? '', JSON.stringify(meta ?? {}), now()
    )
  }
  const loadWorkRow = (id: string) => db.prepare('SELECT * FROM work_items WHERE id=?').get(Number(id)) as any
  const repository: SqliteRepository = {
    listProducts(includeArchived = true) { const rows = db.prepare(`SELECT * FROM products WHERE is_deleted=0 ${includeArchived ? '' : 'AND status!=3'}`).all(); return rows.map(mapProduct) },
    getProduct,
    createProduct(i) { ensureName(i.name); ensureProductStatus(i.status); if (typeof i.repositoryPath !== 'string') throw new RepositoryError('VALIDATION_FAILED', 'repositoryPath'); const t = now(); try { const x = db.prepare('INSERT INTO products(name,normalized_name,description,product_type,icon,status,completion_percent,user_count,user_count_source,app_url,repository_path,archived_at,created_at,updated_at,is_public,showcase_page_path) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(i.name, normalized(i.name), i.description, i.productType, i.icon, statusCode[i.status], i.completionPercent, i.userCount, i.userCountSource, i.appUrl ?? '', i.repositoryPath ?? '', i.archivedAt ?? '', t, t, i.isPublic ? 1 : 0, i.showcasePagePath ?? ''); return getProduct(String(x.lastInsertRowid))! } catch (e) { throw mapMutationError(e, 'product') } },
    updateProduct(id, i, expected) { const p = getProduct(id); if (!p) throw new RepositoryError('NOT_FOUND', 'product'); if (expected && p.updatedAt !== expected) throw new RepositoryError('CONFLICT', 'updatedAt'); const n = { ...p, ...i }; ensureName(n.name); ensureProductStatus(n.status); if (typeof n.repositoryPath !== 'string') throw new RepositoryError('VALIDATION_FAILED', 'repositoryPath'); if (statusCode[n.status] === undefined) throw new RepositoryError('VALIDATION_FAILED', 'status'); const updatedAt = bump(p.updatedAt); try { db.prepare('UPDATE products SET name=?,normalized_name=?,description=?,product_type=?,icon=?,status=?,completion_percent=?,user_count=?,user_count_source=?,app_url=?,repository_path=?,archived_at=?,updated_at=?,is_public=?,showcase_page_path=? WHERE id=? AND is_deleted=0').run(n.name, normalized(n.name), n.description, n.productType, n.icon, statusCode[n.status], n.completionPercent, n.userCount, n.userCountSource, n.appUrl ?? '', n.repositoryPath ?? '', n.archivedAt ?? '', updatedAt, n.isPublic ? 1 : 0, n.showcasePagePath ?? '', Number(id)) } catch (e) { throw mapMutationError(e, 'product') } return getProduct(id)! },
    archiveProduct(id, e) { return db.transaction(() => { const p=getProduct(id); if(!p) throw new RepositoryError('NOT_FOUND','product'); if(p.status==='archived') throw new RepositoryError('CONFLICT','already archived'); if(e&&p.updatedAt!==e) throw new RepositoryError('CONFLICT','updatedAt'); const t=now(); db.prepare('UPDATE products SET status_before_archive=status,status=3,archived_at=?,updated_at=? WHERE id=?').run(t,t,Number(id)); for(const table of ['work_items','versions','documents']) { db.prepare(`UPDATE ${table} SET is_deleted=1,archive_deleted=1 WHERE product_id=? AND is_deleted=0`).run(Number(id)) } return getProduct(id)! })() }, restoreProduct(id, e) { return db.transaction(() => { const p=getProduct(id); if(!p) throw new RepositoryError('NOT_FOUND','product'); if(p.status!=='archived') throw new RepositoryError('CONFLICT','not archived'); if(e&&p.updatedAt!==e) throw new RepositoryError('CONFLICT','updatedAt'); const row=db.prepare('SELECT status_before_archive FROM products WHERE id=?').get(Number(id)) as any; const status=row?.status_before_archive===1||row?.status_before_archive===2?row.status_before_archive:0; const t=now(); db.prepare('UPDATE products SET status=?,archived_at="",updated_at=? WHERE id=?').run(status,t,Number(id)); for(const table of ['work_items','versions','documents']) { db.prepare(`UPDATE ${table} SET is_deleted=0,archive_deleted=0 WHERE product_id=? AND archive_deleted=1`).run(Number(id)) } return getProduct(id)! })() },
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
  db.prepare("UPDATE work_items SET is_deleted=0, deleted_at='', deleted_by='', updated_at=? WHERE id=?").run(t, Number(id))
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
deleteWorkItem(id) { if (!db.prepare('UPDATE work_items SET is_deleted=1 WHERE id=? AND is_deleted=0').run(Number(id)).changes) throw new RepositoryError('NOT_FOUND', 'work item') },
    listVersions(pid) { return db.prepare('SELECT * FROM versions WHERE product_id=? AND is_deleted=0').all(Number(pid)).map(mapVersion) },
    createVersion(pid, i) { if (!getProduct(pid)) throw new RepositoryError('NOT_FOUND', 'product'); if (versionCode[i.status] === undefined || typeof i.number !== 'string' || !i.number.trim() || (i.status === 'planned' && i.releasedAt) || (i.status === 'released' && (!i.releasedAt || Number.isNaN(Date.parse(i.releasedAt)) || !/^\d{4}-\d\d-\d\dT.*Z$/.test(i.releasedAt)))) throw new RepositoryError('VALIDATION_FAILED', 'version'); const t = now(); try { const x = db.prepare('INSERT INTO versions(product_id,number,status,released_at,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(Number(pid), i.number, versionCode[i.status], i.releasedAt ?? '', i.notes, t, t); return mapVersion(db.prepare('SELECT * FROM versions WHERE id=?').get(Number(x.lastInsertRowid))) } catch (e) { throw mapMutationError(e, 'version') } },
    updateVersion(id, i, expected) { const r = db.prepare('SELECT * FROM versions WHERE id=? AND is_deleted=0').get(Number(id)) as any; if (!r) throw new RepositoryError('NOT_FOUND', 'version'); if (expected && r.updated_at !== expected) throw new RepositoryError('CONFLICT', 'updatedAt'); const status = i.status === undefined ? ['planned','released'][r.status] as VersionStatus : i.status; const releasedAt = i.releasedAt === undefined ? (r.released_at || null) : i.releasedAt; if (versionCode[status] === undefined || typeof (i.number ?? r.number) !== 'string' || !(i.number ?? r.number).trim() || (status === 'planned' && releasedAt) || (status === 'released' && (!releasedAt || Number.isNaN(Date.parse(releasedAt)) || !/^\d{4}-\d\d-\d\dT.*Z$/.test(releasedAt)))) throw new RepositoryError('VALIDATION_FAILED', 'version'); try { db.prepare('UPDATE versions SET number=?,status=?,released_at=?,notes=?,updated_at=? WHERE id=? AND is_deleted=0').run(i.number ?? r.number, versionCode[status], releasedAt ?? '', i.notes ?? r.notes, bump(r.updated_at), Number(id)) } catch (e) { throw mapMutationError(e, 'version') } return mapVersion(db.prepare('SELECT * FROM versions WHERE id=?').get(Number(id))) },
    deleteVersion(id) { if (!db.prepare('UPDATE versions SET is_deleted=1 WHERE id=? AND is_deleted=0').run(Number(id)).changes) throw new RepositoryError('NOT_FOUND', 'version') },
    listDocuments(pid) { return db.prepare('SELECT * FROM documents WHERE product_id=? AND is_deleted=0').all(Number(pid)).map(mapDocument) },
    createDocument(pid, i) { if (!getProduct(pid)) throw new RepositoryError('NOT_FOUND', 'product'); ensureDoc(i); const t = now(); try { const x = db.prepare('INSERT INTO documents(product_id,name,normalized_name,content,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(Number(pid), i.name, normalized(i.name), i.content, t, t); return mapDocument(db.prepare('SELECT * FROM documents WHERE id=?').get(Number(x.lastInsertRowid))) } catch (e) { throw mapMutationError(e, 'document') } },
    updateDocument(id, i, expected) { const r = db.prepare('SELECT * FROM documents WHERE id=? AND is_deleted=0').get(Number(id)) as any; if (!r) throw new RepositoryError('NOT_FOUND', 'document'); if (expected && r.updated_at !== expected) throw new RepositoryError('CONFLICT', 'updatedAt'); const n = { name: i.name ?? r.name, content: i.content ?? r.content }; ensureDoc(n); const updatedAt = bump(r.updated_at); try { db.prepare('UPDATE documents SET name=?,normalized_name=?,content=?,updated_at=? WHERE id=? AND is_deleted=0').run(n.name, normalized(n.name), n.content, updatedAt, Number(id)) } catch (e) { throw mapMutationError(e, 'document') } return mapDocument(db.prepare('SELECT * FROM documents WHERE id=?').get(Number(id))) },
    deleteDocument(id) { if (!db.prepare('UPDATE documents SET is_deleted=1 WHERE id=? AND is_deleted=0').run(Number(id)).changes) throw new RepositoryError('NOT_FOUND', 'document') },
    getProductSummary(pid) { return { product: getProduct(pid), workItems: repository.listWorkItems(pid).length, versions: repository.listVersions(pid).length, documents: repository.listDocuments(pid).length } },
    listPublicProducts() { const rows = db.prepare(`SELECT p.*, (SELECT v2.number FROM versions v2 WHERE v2.product_id = p.id AND v2.status = 1 AND v2.is_deleted = 0 ORDER BY v2.released_at DESC, v2.updated_at DESC LIMIT 1) AS current_version FROM products p WHERE p.is_public = 1 AND p.is_deleted = 0 AND p.status != 3 ORDER BY p.updated_at DESC`).all(); return rows.map(mapPublicProduct) },
    getPublicProduct(id) { const row = db.prepare(`SELECT p.*, (SELECT v2.number FROM versions v2 WHERE v2.product_id = p.id AND v2.status = 1 AND v2.is_deleted = 0 ORDER BY v2.released_at DESC, v2.updated_at DESC LIMIT 1) AS current_version FROM products p WHERE p.id = ? AND p.is_public = 1 AND p.is_deleted = 0 AND p.status != 3`).get(Number(id)); return row ? mapPublicProduct(row) : undefined },
    transaction<T>(fn: () => T) { return db.transaction(fn)() }, tableNames() { return ['products','work_items','versions','documents'] }, foreignKeysEnabled() { return Number(db.pragma('foreign_keys', { simple: true })) === 1 }, close() { db.close() }
  }
  const count = (db.prepare('SELECT count(*) AS c FROM products').get() as any).c
  if (!count) {
    console.warn('[vibe-studio] database is empty — seeding 3 demo products. To preserve your data across restarts, never delete data/vibe-studio.sqlite manually.')
    for (const p of [{ name: 'Flora', productType: 'mobile-app', icon: '🌿', status: 'beta', completionPercent: 78, userCount: 2640, isPublic: true, showcasePagePath: 'data/products/1/showcase.html' }, { name: 'ResumeGenius', productType: 'web-app', icon: '📄', status: 'developing', completionPercent: 62, userCount: 890 }, { name: 'Text War', productType: 'game', icon: '⚔️', status: 'released', completionPercent: 100, userCount: 12400 }]) repository.createProduct({ ...p, description: '', userCountSource: '', appUrl: null, repositoryPath: '' } as ProductInput)
  }
  return repository
}
