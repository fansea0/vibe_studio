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
