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
  const [draft, setDraft] = useState<WorkItem>(item)
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
  const dueInput = draft.dueDate ? isoToDateValue(draft.dueDate) : ''

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
        <label>状态 <select value={draft.status} onChange={async (e) => { const next = { ...draft, status: e.target.value as WorkItemStatus, updatedAt: new Date().toISOString() }; await persist(next) }}>{workItemStatuses.map((s) => <option key={s} value={s}>{workItemStatusLabels[s]}</option>)}</select></label>
        <label>类型 <select value={draft.type} onChange={async (e) => { const next = { ...draft, type: e.target.value as WorkItemType, updatedAt: new Date().toISOString() }; await persist(next) }}>{workItemTypes.map((v) => <option key={v} value={v}>{workItemTypeLabels[v]}</option>)}</select></label>
        <label>优先级 <select value={draft.priority} onChange={async (e) => { const next = { ...draft, priority: e.target.value as Priority, updatedAt: new Date().toISOString() }; await persist(next) }}>{priorities.map((v) => <option key={v} value={v}>{priorityLabels[v]}</option>)}</select></label>
        <label>截止 <input type="date" value={dueInput} onChange={async (e) => { const next = { ...draft, dueDate: e.target.value ? new Date(`${e.target.value}T00:00:00Z`).toISOString() : null, updatedAt: new Date().toISOString() }; await persist(next) }} /></label>
        <label>负责人 <input value={draft.assignee} onChange={(e) => setDraft({ ...draft, assignee: e.target.value })} onBlur={async () => { if (draft.assignee !== item.assignee) await persist({ ...draft, updatedAt: new Date().toISOString() }) }} /></label>
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
          <textarea rows={8} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} onBlur={async () => { if (draft.description !== item.description) await persist({ ...draft, updatedAt: new Date().toISOString() }) }} />
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
