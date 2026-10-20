import { DndContext, type DragEndEvent } from '@dnd-kit/core'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Product, WorkItem, WorkItemComment, WorkItemEvent, WorkItemStatus } from '../domain/models'
import { resolveWorkItemStatus } from './workItemTransition'
import { mutationErrorMessage } from './mutationError'
import { TaskCard } from './TaskCard'
import { TaskColumn } from './TaskColumn'
import { TaskDialog } from './TaskDialog'
import { TaskDetailDrawer } from './TaskDetailDrawer'
import { TaskDoneBar } from './TaskDoneBar'
import { TaskTrashList } from './TaskTrashList'
import { workItemStatuses, workItemTypeLabels } from './workItemPresentation'
import { PopoverMenu, WorkToolbar } from './WorkToolbar'
import { WorkListView } from './WorkListView'
import { usePalette } from './paletteContext'
import {
  countActiveFilters,
  countByDimension,
  defaultWorkFilters,
  dueFilterLabels,
  filterWorkItems,
  matchesQuery,
  priorityFilterLabels,
  sortWorkItems,
  statusFilterLabels,
  type WorkFilters,
  type WorkSortKey,
  type WorkViewMode,
} from './workFilters'
import { IconInbox, IconPlus } from './icons'

export interface WorkSurfaceProps {
  scope: 'product' | 'all'
  productId?: string
  items: WorkItem[]
  trashItems: WorkItem[]
  products: Product[]
  comments: Record<string, WorkItemComment[]>
  events: Record<string, WorkItemEvent[]>
  onSaveWorkItem: (item: WorkItem) => Promise<void>
  onDeleteWorkItem: (item: WorkItem) => Promise<void>
  onRestoreWorkItem: (item: WorkItem) => Promise<void>
  onPurgeWorkItem: (item: WorkItem) => Promise<void>
  onLoadComments: (item: WorkItem) => Promise<void>
  onLoadEvents: (item: WorkItem) => Promise<void>
  onCreateComment: (item: WorkItem, body: { author: string; body: string }) => Promise<void>
}

type Facets = Omit<WorkFilters, 'query'>

const facetsDefaults: Facets = {
  type: defaultWorkFilters.type,
  priority: defaultWorkFilters.priority,
  status: defaultWorkFilters.status,
  productId: defaultWorkFilters.productId,
  due: defaultWorkFilters.due,
}

const sortLabels: Record<WorkSortKey, string> = { priority: '优先级', due: '截止日期', updated: '最近更新' }

export function WorkSurface(props: WorkSurfaceProps) {
  const {
    scope, productId, items, trashItems, products, comments, events,
    onSaveWorkItem, onDeleteWorkItem, onRestoreWorkItem, onPurgeWorkItem,
    onLoadComments, onLoadEvents, onCreateComment,
  } = props
  const [searchParams, setSearchParams] = useSearchParams()
  const palette = usePalette()
  const [facets, setFacets] = useState<Facets>(facetsDefaults)
  const [mode, setMode] = useState<WorkViewMode>('board')
  const [sortKey, setSortKey] = useState<WorkSortKey>('priority')
  const [doneExpanded, setDoneExpanded] = useState(false)
  const [quickTitle, setQuickTitle] = useState('')
  const [newProductId, setNewProductId] = useState('')
  const [editing, setEditing] = useState<WorkItem | null>(null)
  const [creating, setCreating] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<WorkItem | null>(null)
  const [confirmPurge, setConfirmPurge] = useState<WorkItem | null>(null)
  const [detailItem, setDetailItem] = useState<WorkItem | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const query = searchParams.get('q') ?? ''
  const openId = searchParams.get('open')
  const trashParam = searchParams.get('trash') === '1'
  const tab: 'work' | 'trash' = trashParam ? 'trash' : 'work'

  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products])
  const productNames = useMemo(() => new Map(products.map((product) => [product.id, product.name])), [products])

  const scopedItems = useMemo(
    () => (scope === 'product' && productId ? items.filter((item) => item.productId === productId) : items),
    [scope, productId, items],
  )
  const scopedTrash = useMemo(
    () => (scope === 'product' && productId ? trashItems.filter((item) => item.productId === productId) : trashItems),
    [scope, productId, trashItems],
  )

  const filters = useMemo<WorkFilters>(() => ({ ...facets, query }), [facets, query])
  const matched = useMemo(
    () => filterWorkItems(scopedItems, filters, productNames),
    [scopedItems, filters, productNames],
  )
  const matchedTrash = useMemo(
    () => scopedTrash.filter((item) => matchesQuery(item, query, productNames.get(item.productId) ?? '')),
    [scopedTrash, query, productNames],
  )
  const searching = query.trim() !== ''

  const sorted = useMemo(() => sortWorkItems(matched, sortKey), [matched, sortKey])
  const openItems = sorted.filter((item) => item.status !== 'done')
  const doneItems = sorted.filter((item) => item.status === 'done')
  const showDone = doneExpanded || facets.status === 'done'
  const listItems = showDone ? sorted : openItems

  const setQuery = useCallback((value: string) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      if (value.trim()) next.set('q', value)
      else next.delete('q')
      return next
    }, { replace: true })
  }, [setSearchParams])

  const clearOpenParam = useCallback(() => {
    setSearchParams((previous) => {
      if (!previous.has('open')) return previous
      const next = new URLSearchParams(previous)
      next.delete('open')
      return next
    }, { replace: true })
  }, [setSearchParams])

  // 快速创建时归属的项目：优先用「项目」筛选，其次是手动选择，最后回落到第一个活跃产品。
  const fallbackProductId = scope === 'product'
    ? (productId ?? '')
    : (products.find((product) => product.archivedAt === null)?.id || products[0]?.id || '')
  const effectiveNewProductId = newProductId || fallbackProductId
  const activeProductId = scope === 'product'
    ? (productId ?? '')
    : (facets.productId !== 'all' ? facets.productId : effectiveNewProductId)

  // 通过命令面板跳转过来时，直接打开对应任务的详情。
  useEffect(() => {
    if (!openId) return
    const target = scopedItems.find((item) => item.id === openId)
    if (!target) return
    setDetailItem(target)
    void onLoadComments(target)
    void onLoadEvents(target)
  }, [openId, scopedItems, onLoadComments, onLoadEvents])

  const overlayOpen = creating || editing !== null || confirmDelete !== null || confirmPurge !== null || detailItem !== null

  // 快捷键：/ 聚焦搜索，c 新建任务。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      const editable = target?.closest('input,textarea,select,[contenteditable="true"]') !== null && target?.closest('input,textarea,select,[contenteditable="true"]') !== undefined
      if (editable) return
      if (overlayOpen) return
      if (event.key === '/') {
        event.preventDefault()
        searchRef.current?.focus()
      } else if (event.key === 'c') {
        event.preventDefault()
        setCreating(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [overlayOpen])

  const handleSaveStatus = async (item: WorkItem, status: WorkItemStatus) => {
    if (item.status === status || busy) return
    setBusy(true); setError('')
    try { await onSaveWorkItem({ ...item, status, updatedAt: new Date().toISOString() }) } catch (e) { setError(mutationErrorMessage(e, '保存失败，请稍后重试')) } finally { setBusy(false) }
  }

  const handleQuickCreate = async (event: FormEvent) => {
    event.preventDefault()
    const title = quickTitle.trim()
    if (!title || busy) return
    const targetProductId = scope === 'product' ? (productId ?? '') : effectiveNewProductId
    if (!targetProductId) {
      setError('请先选择要归属的产品')
      return
    }
    const now = new Date().toISOString()
    const draft: WorkItem = {
      id: `${targetProductId}-${crypto.randomUUID()}`,
      productId: targetProductId,
      type: 'requirement',
      title,
      description: '',
      assignee: '',
      priority: 'medium',
      dueDate: null,
      status: 'todo',
      isDeleted: false,
      deletedAt: null,
      deletedBy: '',
      createdAt: now,
      updatedAt: now,
    }
    setBusy(true); setError('')
    try { await onSaveWorkItem(draft); setQuickTitle('') } catch (e) { setError(mutationErrorMessage(e, '保存失败，请稍后重试')) } finally { setBusy(false) }
  }

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
    const item = scopedItems.find(({ id }) => id === String(active.id))
    if (!item) return
    const next = resolveWorkItemStatus(item.status, over === null ? null : String(over.id))
    if (next !== null) void handleSaveStatus(item, next)
  }

  const openDetail = (item: WorkItem) => {
    setDetailItem(item)
    void onLoadComments(item)
    void onLoadEvents(item)
  }

  const closeDetail = () => {
    setDetailItem(null)
    clearOpenParam()
  }

  const priorityCounts = countByDimension(scopedItems, filters, 'priority', productNames)
  const statusCounts = countByDimension(scopedItems, filters, 'status', productNames)
  const dueCounts = countByDimension(scopedItems, filters, 'due', productNames)
  const productCounts = countByDimension(scopedItems, filters, 'productId', productNames)
  const activeFilterCount = countActiveFilters(filters)

  const projectOptions = useMemo(
    () => products
      .filter((product) => product.archivedAt === null)
      .map((product) => ({ value: product.id, label: `${product.icon} ${product.name}`, count: productCounts.get(product.id) ?? 0 })),
    [products, productCounts],
  )

  const productMenuOptions = [{ value: 'all', label: '全部项目', count: scopedItems.length }, ...projectOptions]
  const priorityMenuOptions = (['all', 'low', 'medium', 'high', 'urgent'] as const).map((value) => ({
    value,
    label: value === 'all' ? '全部优先级' : priorityFilterLabels[value],
    count: priorityCounts.get(value) ?? 0,
  }))
  const statusMenuOptions = (['all', 'todo', 'in_progress', 'done'] as const).map((value) => ({
    value,
    label: value === 'all' ? '全部状态' : statusFilterLabels[value],
    count: statusCounts.get(value) ?? 0,
  }))
  const dueMenuOptions = (['all', 'overdue', 'today', 'week', 'none'] as const).map((value) => ({
    value,
    label: dueFilterLabels[value],
    count: dueCounts.get(value) ?? 0,
  }))
  const sortMenuOptions = (['priority', 'due', 'updated'] as const).map((value) => ({
    value,
    label: sortLabels[value],
  }))

  const showProductBadge = scope === 'all'
  const resultLabel = searching
    ? `找到 ${matched.length + matchedTrash.length} 条结果`
    : `${matched.length} 个任务`

  const tabs = (
    <div className="work-view-tabs" role="group" aria-label="任务视图切换">
      <button type="button" className={tab === 'work' ? 'selected' : ''} aria-pressed={tab === 'work'} onClick={() => setSearchParams((previous) => { const next = new URLSearchParams(previous); next.delete('trash'); return next }, { replace: true })}>任务</button>
      <button type="button" className={tab === 'trash' ? 'selected' : ''} aria-pressed={tab === 'trash'} onClick={() => setSearchParams((previous) => { const next = new URLSearchParams(previous); next.set('trash', '1'); return next }, { replace: true })}>
        回收站{scopedTrash.length > 0 && <span className="badge">{scopedTrash.length}</span>}
      </button>
    </div>
  )

  return (
    <section className="work-stack" aria-label="需求安排">
      <WorkToolbar
        leading={tabs}
        query={query}
        onQueryChange={setQuery}
        mode={mode}
        onModeChange={setMode}
        onCreate={() => setCreating(true)}
        onOpenPalette={palette.open}
        searchPlaceholder={scope === 'all' ? '搜索所有项目的需求、Bug…' : '搜索标题、描述或负责人…'}
        searchRef={searchRef}
      />

      {tab === 'work' && (
        <>
          <form className="work-quick-create" onSubmit={handleQuickCreate}>
            <span className="work-quick-icon" aria-hidden="true"><IconPlus /></span>
            <input
              aria-label="新建任务标题"
              placeholder="输入标题后回车快速创建，截止日期、描述可在详情里补充"
              value={quickTitle}
              onChange={(e) => setQuickTitle(e.target.value)}
              disabled={busy}
            />
            {scope === 'all' && (
              <select aria-label="新建任务归属项目" value={effectiveNewProductId} onChange={(e) => setNewProductId(e.target.value)} disabled={busy}>
                {products.filter((product) => product.archivedAt === null).map((product) => (
                  <option key={product.id} value={product.id}>{product.icon} {product.name}</option>
                ))}
              </select>
            )}
            <button type="submit" disabled={busy || !quickTitle.trim()}>创建</button>
          </form>

          <div className="work-filterbar" aria-label="任务筛选">
            <div className="work-type-pills" role="group" aria-label="按类型筛选">
              {(['all', 'requirement', 'bug'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={facets.type === value ? 'selected' : ''}
                  aria-pressed={facets.type === value}
                  onClick={() => setFacets((previous) => ({ ...previous, type: value }))}
                >
                  {value === 'all' ? '全部' : workItemTypeLabels[value]}
                </button>
              ))}
            </div>
            {scope === 'all' && (
              <PopoverMenu
                label="项目"
                value={facets.productId}
                options={productMenuOptions}
                onChange={(value) => setFacets((previous) => ({ ...previous, productId: value }))}
                displayLabel={facets.productId === 'all' ? undefined : productNames.get(facets.productId)}
              />
            )}
            <PopoverMenu
              label="优先级"
              value={facets.priority}
              options={priorityMenuOptions}
              onChange={(value) => setFacets((previous) => ({ ...previous, priority: value as Facets['priority'] }))}
              displayLabel={facets.priority === 'all' ? undefined : priorityFilterLabels[facets.priority]}
            />
            <PopoverMenu
              label="状态"
              value={facets.status}
              options={statusMenuOptions}
              onChange={(value) => setFacets((previous) => ({ ...previous, status: value as Facets['status'] }))}
              displayLabel={facets.status === 'all' ? undefined : statusFilterLabels[facets.status]}
            />
            <PopoverMenu
              label="截止"
              value={facets.due}
              options={dueMenuOptions}
              onChange={(value) => setFacets((previous) => ({ ...previous, due: value as Facets['due'] }))}
              displayLabel={facets.due === 'all' ? undefined : dueFilterLabels[facets.due]}
            />
            <PopoverMenu
              label="排序"
              value={sortKey}
              options={sortMenuOptions}
              onChange={(value) => setSortKey(value as WorkSortKey)}
              displayLabel={sortLabels[sortKey]}
              emphasize={false}
            />
            <span className="work-filterbar-spacer" />
            <span className="work-result-count">{resultLabel}</span>
            {activeFilterCount > 0 && (
              <button type="button" className="work-clear-filters" onClick={() => { setFacets(facetsDefaults); setQuery('') }}>
                清除筛选（{activeFilterCount}）
              </button>
            )}
          </div>
        </>
      )}

      {error && <p role="alert" className="feedback error">{error}</p>}

      {tab === 'trash' ? (
        <TaskTrashList items={matchedTrash} onRestore={(i) => void handleRestore(i)} onPurge={(i) => setConfirmPurge(i)} />
      ) : searching ? (
        <SearchResults
          items={sorted}
          trashItems={matchedTrash}
          products={productMap}
          showProduct={showProductBadge}
          onOpenDetail={openDetail}
          onEdit={setEditing}
          onDelete={setConfirmDelete}
        />
      ) : mode === 'list' ? (
        <ListResults
          items={listItems}
          doneCount={doneItems.length}
          doneExpanded={showDone}
          onToggleDone={() => setDoneExpanded((expanded) => !expanded)}
          products={productMap}
          showProduct={showProductBadge}
          onOpenDetail={openDetail}
          onEdit={setEditing}
          onDelete={setConfirmDelete}
        />
      ) : (
        <BoardResults
          items={openItems}
          doneItems={doneItems}
          doneExpanded={showDone}
          onToggleDone={() => setDoneExpanded((expanded) => !expanded)}
          products={productMap}
          showProduct={showProductBadge}
          onSaveStatus={handleSaveStatus}
          onOpenDetail={openDetail}
          onEdit={setEditing}
          onDelete={setConfirmDelete}
          onDragEnd={finishDrag}
        />
      )}

      {creating && (
        <TaskDialog
          productId={activeProductId || fallbackProductId}
          onSave={onSaveWorkItem}
          onClose={() => setCreating(false)}
        />
      )}
      {editing && <TaskDialog productId={editing.productId} initial={editing} onSave={onSaveWorkItem} onClose={() => setEditing(null)} />}

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
          onClose={closeDetail}
          onUpdate={(next) => onSaveWorkItem(next)}
          onComment={(body) => onCreateComment(detailItem, body)}
        />
      )}
    </section>
  )
}

interface BoardResultsProps {
  items: WorkItem[]
  doneItems: WorkItem[]
  doneExpanded: boolean
  onToggleDone: () => void
  products: ReadonlyMap<string, Product>
  showProduct: boolean
  onSaveStatus: (item: WorkItem, status: WorkItemStatus) => void
  onOpenDetail: (item: WorkItem) => void
  onEdit: (item: WorkItem) => void
  onDelete: (item: WorkItem) => void
  onDragEnd: (event: DragEndEvent) => void
}

function BoardResults({ items, doneItems, doneExpanded, onToggleDone, products, showProduct, onSaveStatus, onOpenDetail, onEdit, onDelete, onDragEnd }: BoardResultsProps) {
  const todoItems = items.filter((item) => item.status === 'todo')
  const progressItems = items.filter((item) => item.status === 'in_progress')
  return (
    <DndContext onDragEnd={onDragEnd}>
      <div className="task-board">
        {workItemStatuses.filter((status) => status !== 'done').map((status) => {
          const columnItems = status === 'todo' ? todoItems : progressItems
          return (
            <TaskColumn key={status} status={status} items={columnItems} emptyHint={status === 'todo' ? '把要做的事放进来' : '拖一张卡片开始推进'}>
              {columnItems.map((item) => {
                const product = products.get(item.productId)
                return (
                  <TaskCard
                    key={item.id}
                    item={item}
                    onSaveStatus={onSaveStatus}
                    onOpenDetail={onOpenDetail}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    productBadge={showProduct && product ? { name: product.name, icon: product.icon } : null}
                  />
                )
              })}
            </TaskColumn>
          )
        })}
      </div>
      <TaskDoneBar
        items={doneItems}
        expanded={doneExpanded}
        onToggle={onToggleDone}
        products={products}
        showProduct={showProduct}
        onOpenDetail={onOpenDetail}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </DndContext>
  )
}

interface ListResultsProps {
  items: WorkItem[]
  doneCount: number
  doneExpanded: boolean
  onToggleDone: () => void
  products: ReadonlyMap<string, Product>
  showProduct: boolean
  onOpenDetail: (item: WorkItem) => void
  onEdit: (item: WorkItem) => void
  onDelete: (item: WorkItem) => void
}

function ListResults({ items, doneCount, doneExpanded, onToggleDone, products, showProduct, onOpenDetail, onEdit, onDelete }: ListResultsProps) {
  return (
    <>
      {items.length === 0
        ? <div className="work-empty"><IconInbox size={20} /><h3>这里还没有任务</h3><p>在上方输入标题就能创建，或换个筛选条件看看。</p></div>
        : <WorkListView items={items} products={products} showProduct={showProduct} onOpenDetail={onOpenDetail} onEdit={onEdit} onDelete={onDelete} />}
      {doneCount > 0 && (
        <div className="work-list-done">
          <button type="button" className="work-list-done-toggle" aria-expanded={doneExpanded} onClick={onToggleDone}>
            {doneExpanded ? '隐藏已完成' : `显示已完成（${doneCount}）`}
          </button>
        </div>
      )}
    </>
  )
}

interface SearchResultsProps {
  items: WorkItem[]
  trashItems: WorkItem[]
  products: ReadonlyMap<string, Product>
  showProduct: boolean
  onOpenDetail: (item: WorkItem) => void
  onEdit: (item: WorkItem) => void
  onDelete: (item: WorkItem) => void
}

/** 搜索结果：包含已完成任务，回收站里的命中也一并列出。 */
function SearchResults({ items, trashItems, products, showProduct, onOpenDetail, onEdit, onDelete }: SearchResultsProps) {
  if (items.length === 0 && trashItems.length === 0) {
    return (
      <div className="work-empty">
        <IconInbox size={20} />
        <h3>没有匹配的任务</h3>
        <p>换个关键词，或清除筛选条件再试试。已完成的任务也会被搜到。</p>
      </div>
    )
  }
  return (
    <div className="work-search-results">
      {items.length > 0 && (
        <section className="work-result-group">
          <header className="work-result-group-header">
            <h3>任务</h3>
            <span>{items.length} 条 · 含已完成</span>
          </header>
          <WorkListView items={items} products={products} showProduct={showProduct} onOpenDetail={onOpenDetail} onEdit={onEdit} onDelete={onDelete} />
        </section>
      )}
      {trashItems.length > 0 && (
        <section className="work-result-group">
          <header className="work-result-group-header">
            <h3>回收站</h3>
            <span>{trashItems.length} 条</span>
          </header>
          <ul className="work-trash-results">
            {trashItems.map((item) => (
              <li key={item.id} className="work-row">
                <span className="work-row-status" data-status="done" />
                <span className="work-row-title static">{item.title}</span>
                {showProduct && <span className="work-row-project">{products.get(item.productId)?.name ?? '—'}</span>}
                <span className="chip chip-trash">回收站</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
