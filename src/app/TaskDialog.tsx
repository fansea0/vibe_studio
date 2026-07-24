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
    const nextErrors: { title?: string; dueDate?: string; save?: string } = {
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
  const dueInput = draft.dueDate ? draft.dueDate.slice(0, 10) : ''
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
            <input id="task-due" placeholder="YYYY-MM-DD" value={dueInput} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value ? `${e.target.value}T00:00:00.000Z` : null })} aria-invalid={errors.dueDate ? true : undefined} aria-describedby={errors.dueDate ? 'task-due-err' : undefined} />
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
