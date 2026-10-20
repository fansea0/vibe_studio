import { useDroppable } from '@dnd-kit/core'
import type { ReactNode } from 'react'
import type { WorkItem, WorkItemStatus } from '../domain/models'
import { workItemStatusLabels } from './workItemPresentation'
import { statusColumnDot } from './taskPresentation'

interface TaskColumnProps {
  status: WorkItemStatus
  items: WorkItem[]
  children: ReactNode
  /** 空列时给出的引导文案，按状态区分。 */
  emptyHint?: string
}

export function TaskColumn({ status, items, children, emptyHint }: TaskColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${status}` })
  return (
    <section ref={setNodeRef} className={`task-column ${isOver ? 'drag-over' : ''}`} aria-label={`${workItemStatusLabels[status]} ${items.length}`}>
      <header className="task-column-header">
        <span className="task-column-dot" style={{ background: statusColumnDot(status) }} aria-hidden="true" />
        <h3>{workItemStatusLabels[status]}</h3>
        <span className="task-column-count">{items.length}</span>
      </header>
      {items.length === 0
        ? <p className="task-column-empty">{emptyHint ?? `还没有${workItemStatusLabels[status]}的任务`}</p>
        : <div className="task-list">{children}</div>}
    </section>
  )
}
