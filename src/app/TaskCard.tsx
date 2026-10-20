import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { useRef, useState } from 'react'
import type { WorkItem, WorkItemStatus } from '../domain/models'
import { priorityLabels, workItemStatusLabels, workItemStatuses, workItemTypeLabels } from './workItemPresentation'
import { dueDateLabel } from './workFilters'
import { dueDateTone, priorityChipColor, typeChipColor } from './taskPresentation'
import { IconBug, IconClock, IconSpark } from './icons'

interface TaskCardProps {
  item: WorkItem
  onSaveStatus: (item: WorkItem, status: WorkItemStatus) => void
  onOpenDetail: (item: WorkItem) => void
  onEdit: (item: WorkItem) => void
  onDelete: (item: WorkItem) => void
  /** 跨项目视图里展示归属项目，产品内视图不传。 */
  productBadge?: { name: string; icon: string } | null
  /** 已完成区里的紧凑卡片：不显示描述，标题单行。 */
  compact?: boolean
}

export function TaskCard({ item, onSaveStatus, onOpenDetail, onEdit, onDelete, productBadge = null, compact = false }: TaskCardProps) {
  const draggable = useDraggable({ id: item.id })
  const style = { transform: CSS.Translate.toString(draggable.transform) }
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDetailsElement>(null)
  const typeColor = typeChipColor(item.type)
  const pColor = priorityChipColor(item.priority)
  const dueTone = dueDateTone(item.dueDate)
  const dueLabel = dueDateLabel(item.dueDate)

  // 菜单项被点击后要同时收起 <details>，否则壳子还开着，下一次点「⋯」反而是关闭。
  const closeMenu = () => {
    setMenuOpen(false)
    if (menuRef.current?.open) menuRef.current.removeAttribute('open')
  }

  return (
    <article
      ref={draggable.setNodeRef}
      className={`task-card ${draggable.isDragging ? 'dragging' : ''} ${compact ? 'task-card-compact' : ''}`}
      data-priority={item.priority}
      data-status={item.status}
      style={style}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button,select,details')) return
        onOpenDetail(item)
      }}
    >
      <span className="task-card-priority-bar" style={{ background: pColor.fg }} aria-hidden="true" />
      <div className="task-card-chips">
        <span className="chip chip-type" style={{ background: typeColor.bg, color: typeColor.fg }}>
          {item.type === 'bug' ? <IconBug /> : <IconSpark />}
          {workItemTypeLabels[item.type]}
        </span>
        <span className="chip chip-priority" style={{ background: pColor.bg, color: pColor.fg }}>{priorityLabels[item.priority]}</span>
        {dueLabel && (
          <span className={`chip chip-due chip-due-${dueTone}`}>
            <IconClock />
            {dueLabel}
            <span className="visually-hidden">{item.dueDate ? `，截止 ${item.dueDate.slice(0, 10)}` : ''}</span>
          </span>
        )}
        {productBadge && (
          <span className="chip chip-project" title={productBadge.name}>
            <span aria-hidden="true">{productBadge.icon}</span>{productBadge.name}
          </span>
        )}
        {item.assignee && <span className="chip chip-assignee" title={item.assignee}>{item.assignee.slice(0, 1).toUpperCase()}</span>}
      </div>
      <h4>
        <button type="button" className="task-card-title" onClick={() => onOpenDetail(item)}>{item.title}</button>
      </h4>
      {!compact && item.description && <p className="task-card-snippet">{item.description.slice(0, 80)}{item.description.length > 80 ? '…' : ''}</p>}
      <div className="task-card-footer">
        <label className="status-select" onClick={(e) => e.stopPropagation()}>
          <span className="status-dot" data-status={item.status} aria-hidden="true" />
          <span className="visually-hidden">状态</span>
          <select aria-label={`${item.title} 状态`} value={item.status} onChange={(e) => onSaveStatus(item, e.target.value as WorkItemStatus)}>
            {workItemStatuses.map((s) => <option key={s} value={s}>{workItemStatusLabels[s]}</option>)}
          </select>
        </label>
        <button type="button" className="drag-handle" aria-label={`拖动 ${item.title}`} {...draggable.listeners} {...draggable.attributes}>⠿</button>
        <details ref={menuRef} className="task-menu" onClick={(e) => e.stopPropagation()} onToggle={(e) => setMenuOpen((e.target as HTMLDetailsElement).open)}>
          <summary aria-label="任务操作">⋯</summary>
          {menuOpen && (
            <ul className="task-menu-list">
              <li><button type="button" onClick={() => { closeMenu(); onEdit(item) }}>编辑</button></li>
              <li><button type="button" className="danger-link" onClick={() => { closeMenu(); onDelete(item) }}>删除</button></li>
            </ul>
          )}
        </details>
      </div>
    </article>
  )
}
