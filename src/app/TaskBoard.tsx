import { DndContext, useDraggable, useDroppable, type DragEndEvent } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { useState, type FormEvent } from 'react'
import type { Priority, WorkItem, WorkItemStatus, WorkItemType } from '../domain/models'
import { Modal } from './Modal'
import { dateValueToIso, isValidDateValue, isoToDateValue } from './dateForm'
import { priorityLabels, priorities, workItemStatusLabels, workItemStatuses, workItemTypeLabels, workItemTypes } from './workItemPresentation'
import { resolveWorkItemStatus } from './workItemTransition'
import { mutationErrorMessage } from './mutationError'

interface TaskBoardProps {
  productId: string
  items: WorkItem[]
  onSaveWorkItem: (item: WorkItem) => Promise<void>
}

type Filter = 'all' | WorkItemType

export function TaskBoard({ productId, items, onSaveWorkItem }: TaskBoardProps) {
  const [filter, setFilter] = useState<Filter>('all')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const visibleItems = filter === 'all' ? items : items.filter(({ type }) => type === filter)

  const saveStatus = async (item: WorkItem, status: WorkItemStatus) => {
    if (item.status === status || busy) return
    setBusy(true)
    try {
      await onSaveWorkItem({ ...item, status, updatedAt: new Date().toISOString() })
      setError('')
    } catch (error) {
      setError(mutationErrorMessage(error, '保存失败，请稍后重试'))
    } finally {
      setBusy(false)
    }
  }

  const finishDrag = ({ active, over }: DragEndEvent) => {
    const item = items.find(({ id }) => id === String(active.id))
    if (item === undefined) return
    const nextStatus = resolveWorkItemStatus(item.status, over === null ? null : String(over.id))
    if (nextStatus !== null) void saveStatus(item, nextStatus)
  }

  return (
    <section className="work-stack" aria-labelledby="task-board-title">
      <div className="section-heading work-heading">
        <div><h2 id="task-board-title">需求与 Bug</h2><p>按状态跟进产品工作项。</p></div>
        <button aria-label="新建任务" onClick={() => setCreating(true)} disabled={busy}>＋ 新建任务</button>
      </div>
      <div className="filter-bar" aria-label="任务筛选">
        {([['all', '全部'], ['requirement', '需求'], ['bug', 'Bug']] as const).map(([value, label]) =>
          <button key={value} className={filter === value ? 'selected' : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>,
        )}
      </div>
      {error && <p role="alert" className="feedback error">{error}</p>}
      <DndContext onDragEnd={finishDrag}>
        <div className="task-board">
          {workItemStatuses.map((status) => {
            const columnItems = visibleItems.filter((item) => item.status === status)
            return <TaskColumn key={status} status={status} items={columnItems} onSaveStatus={saveStatus} />
          })}
        </div>
      </DndContext>
      {creating && <TaskDialog productId={productId} onSave={onSaveWorkItem} onClose={() => setCreating(false)} />}
    </section>
  )
}

function TaskColumn({ status, items, onSaveStatus }: { status: WorkItemStatus; items: WorkItem[]; onSaveStatus: (item: WorkItem, status: WorkItemStatus) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${status}` })
  return <section ref={setNodeRef} className={`task-column ${isOver ? 'drag-over' : ''}`} aria-label={`${workItemStatusLabels[status]} ${items.length}`}>
    <h3>{workItemStatusLabels[status]} <span>{items.length}</span></h3>
    <div className="task-list">{items.map((item) => <TaskCard key={item.id} item={item} onSaveStatus={onSaveStatus} />)}</div>
  </section>
}

function TaskCard({ item, onSaveStatus }: { item: WorkItem; onSaveStatus: (item: WorkItem, status: WorkItemStatus) => void }) {
  const draggable = useDraggable({ id: item.id })
  const droppable = useDroppable({ id: `item:${item.id}:${item.status}` })
  const style = { transform: CSS.Translate.toString(draggable.transform) }
  const setCardRef = (node: HTMLElement | null) => {
    draggable.setNodeRef(node)
    droppable.setNodeRef(node)
  }
  return <article ref={setCardRef} className="task-card" style={style}>
    <button type="button" className="drag-handle" aria-label={`拖动 ${item.title}`} {...draggable.listeners} {...draggable.attributes}>⠿</button>
    <h4>{item.title}</h4>
    <div className="task-meta"><span>{workItemTypeLabels[item.type]}</span><span>{priorityLabels[item.priority]}</span>{item.dueDate && <span>{isoToDateValue(item.dueDate)}</span>}</div>
    <label className="status-select">状态<select aria-label={`${item.title} 状态`} value={item.status} onChange={(event) => onSaveStatus(item, event.target.value as WorkItemStatus)}>{workItemStatuses.map((status) => <option key={status} value={status}>{workItemStatusLabels[status]}</option>)}</select></label>
  </article>
}

function TaskDialog({ productId, onSave, onClose }: { productId: string; onSave: (item: WorkItem) => Promise<void>; onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState<WorkItemType>('requirement')
  const [priority, setPriority] = useState<Priority>('medium')
  const [dueDate, setDueDate] = useState('')
  const [errors, setErrors] = useState<{ title?: string; dueDate?: string; save?: string }>({})
  const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const nextErrors = {
      ...(!title.trim() ? { title: '请输入标题' } : {}),
      ...(dueDate && !isValidDateValue(dueDate) ? { dueDate: '请输入有效日期' } : {}),
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    const now = new Date().toISOString()
    const item: WorkItem = { id: `${productId}-${crypto.randomUUID()}`, productId, title: title.trim(), type, priority, dueDate: dueDate ? dateValueToIso(dueDate) : null, status: 'todo', createdAt: now, updatedAt: now }
    setBusy(true)
    try { await onSave(item); onClose() } catch (error) { setErrors({ save: mutationErrorMessage(error, '保存失败，请稍后重试') }) } finally { setBusy(false) }
  }
  return <Modal title="新建任务" onClose={onClose} closeDisabled={busy}><form onSubmit={submit} noValidate>
    <div className="field"><label htmlFor="work-item-title">标题</label><input id="work-item-title" value={title} onChange={(event) => setTitle(event.target.value)} aria-invalid={errors.title ? true : undefined} aria-describedby={errors.title ? 'work-item-title-error' : undefined} />{errors.title && <span id="work-item-title-error" role="alert" className="field-error">{errors.title}</span>}</div>
    <div className="form-grid"><label className="field">类型<select value={type} onChange={(event) => setType(event.target.value as WorkItemType)}>{workItemTypes.map((value) => <option key={value} value={value}>{workItemTypeLabels[value]}</option>)}</select></label>
    <label className="field">优先级<select value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>{priorities.map((value) => <option key={value} value={value}>{priorityLabels[value]}</option>)}</select></label>
    <div className="field span-2"><label htmlFor="work-item-due-date">截止日期</label><input id="work-item-due-date" placeholder="YYYY-MM-DD" value={dueDate} onChange={(event) => setDueDate(event.target.value)} aria-invalid={errors.dueDate ? true : undefined} aria-describedby={errors.dueDate ? 'work-item-due-date-error' : undefined} />{errors.dueDate && <span id="work-item-due-date-error" role="alert" className="field-error">{errors.dueDate}</span>}</div></div>
    {errors.save && <p role="alert" className="feedback error">{errors.save}</p>}
    <div className="dialog-actions"><button type="button" className="secondary" onClick={onClose} disabled={busy}>取消</button><button type="submit" disabled={busy}>创建任务</button></div>
  </form></Modal>
}
