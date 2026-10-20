import { useDroppable } from '@dnd-kit/core'
import type { Product, WorkItem } from '../domain/models'
import { TaskCard } from './TaskCard'
import { IconCheckCircle, IconChevron } from './icons'

interface TaskDoneBarProps {
  items: WorkItem[]
  expanded: boolean
  onToggle: () => void
  products: ReadonlyMap<string, Product>
  showProduct: boolean
  onOpenDetail: (item: WorkItem) => void
  onEdit: (item: WorkItem) => void
  onDelete: (item: WorkItem) => void
}

/**
 * 已完成任务的折叠区：默认只占一行，不抢看板视觉；
 * 同时它本身是拖拽落点，任务可以直接拖进来标记完成。
 */
export function TaskDoneBar({ items, expanded, onToggle, products, showProduct, onOpenDetail, onEdit, onDelete }: TaskDoneBarProps) {
  const { setNodeRef, isOver } = useDroppable({ id: 'column:done' })
  return (
    <section ref={setNodeRef} className={`work-done ${expanded ? 'expanded' : ''} ${isOver ? 'drag-over' : ''}`} aria-label={`已完成 ${items.length}`}>
      <header className="work-done-header">
        <button type="button" className="work-done-toggle" aria-expanded={expanded} onClick={onToggle}>
          <IconCheckCircle size={15} />
          <span>已完成</span>
          <span className="work-done-count">{items.length}</span>
          <IconChevron size={12} className={expanded ? 'flip' : ''} />
        </button>
        <span className="work-done-hint">
          {expanded ? '展开中 · 折叠后不占用看板空间' : '折叠中 · 展开查看，或把任务拖到这里标完成'}
        </span>
      </header>
      {expanded && (
        items.length === 0
          ? <p className="work-done-empty">还没有已完成的任务</p>
          : (
            <div className="work-done-grid">
              {items.map((item) => {
                const product = products.get(item.productId)
                return (
                  <TaskCard
                    key={item.id}
                    item={item}
                    compact
                    productBadge={showProduct && product ? { name: product.name, icon: product.icon } : null}
                    onSaveStatus={() => {}}
                    onOpenDetail={onOpenDetail}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
                )
              })}
            </div>
          )
      )}
    </section>
  )
}
