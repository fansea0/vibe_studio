import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { useState } from 'react'
import type { WorkItem, WorkItemStatus } from '../domain/models'
import { isoToDateValue } from './dateForm'
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
        {item.assignee && <span className="chip chip-assignee" title={item.assignee}>{item.assignee.slice(0, 1).toUpperCase()}</span>}
      </div>
      <h4>{item.title}</h4>
      {item.description && <p className="task-card-snippet">{item.description.slice(0, 80)}{item.description.length > 80 ? '…' : ''}</p>}
      <div className="task-card-footer">
        <label className="status-select" onClick={(e) => e.stopPropagation()}>
          <span className="visually-hidden">状态</span>
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
