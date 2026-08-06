import { DndContext, type DragEndEvent } from '@dnd-kit/core'
import { useState, type FormEvent } from 'react'
import type { WorkItem, WorkItemComment, WorkItemEvent, WorkItemStatus } from '../domain/models'
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
  comments: Record<string, WorkItemComment[]>
  events: Record<string, WorkItemEvent[]>
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
  const [quickTitle, setQuickTitle] = useState('')
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

  const handleQuickCreate = async (event: FormEvent) => {
    event.preventDefault()
    const title = quickTitle.trim()
    if (!title || busy) return
    const now = new Date().toISOString()
    const draft: WorkItem = {
      id: `${productId}-${crypto.randomUUID()}`,
      productId,
      type: 'requirement',
      title,
      description: '',
      assignee: '',
      priority: 'medium',
      dueDate: null,
      status: 'todo' as WorkItemStatus,
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
      </div>
      <form className="quick-create" onSubmit={handleQuickCreate}>
        <input
          aria-label="新建任务标题"
          placeholder="输入任务标题后回车快速创建，截止日期/描述等可在详情中补充"
          value={quickTitle}
          onChange={(e) => setQuickTitle(e.target.value)}
          disabled={busy}
        />
        <button type="submit" disabled={busy || !quickTitle.trim()}>创建</button>
      </form>

      <nav className="task-view-tabs" aria-label="任务视图切换">
        <button type="button" className={view === 'board' ? 'selected' : ''} aria-pressed={view === 'board'} onClick={() => setView('board')}>看板</button>
        <button type="button" className={view === 'trash' ? 'selected' : ''} aria-pressed={view === 'trash'} onClick={() => setView('trash')}>回收站{trashCount > 0 && <span className="badge">{trashCount}</span>}</button>
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
              {workItemStatuses.map((status) => {
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
            </div>
          </DndContext>
          <p className="task-summary">待处理 {boardCounts[0]} · 进行中 {boardCounts[1]} · 已完成 {boardCounts[2]}</p>
        </>
      ) : (
        <TaskTrashList items={trashItems} onRestore={(i) => void handleRestore(i)} onPurge={(i) => setConfirmPurge(i)} />
      )}

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