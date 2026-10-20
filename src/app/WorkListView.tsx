import type { Product, WorkItem } from '../domain/models'
import { priorityLabels, workItemStatusLabels, workItemTypeLabels } from './workItemPresentation'
import { dueDateLabel } from './workFilters'
import { dueDateTone, priorityChipColor, typeChipColor } from './taskPresentation'
import { IconBug, IconClock, IconSpark } from './icons'

interface WorkListViewProps {
  items: WorkItem[]
  products: ReadonlyMap<string, Product>
  showProduct: boolean
  onOpenDetail: (item: WorkItem) => void
  onEdit: (item: WorkItem) => void
  onDelete: (item: WorkItem) => void
}

/** 列表视图：一行一条任务，适合密集浏览和横向比较。 */
export function WorkListView({ items, products, showProduct, onOpenDetail, onEdit, onDelete }: WorkListViewProps) {
  return (
    <div className="work-table">
      <div className="work-table-head" aria-hidden="true">
        <span className="work-col-status" />
        <span className="work-col-title">任务</span>
        {showProduct && <span className="work-col-project">项目</span>}
        <span className="work-col-type">类型</span>
        <span className="work-col-priority">优先级</span>
        <span className="work-col-due">截止</span>
        <span className="work-col-actions" />
      </div>
      <ul className="work-table-body">
        {items.map((item) => {
          const product = products.get(item.productId)
          const typeColor = typeChipColor(item.type)
          const pColor = priorityChipColor(item.priority)
          const dueTone = dueDateTone(item.dueDate)
          const dueLabel = dueDateLabel(item.dueDate)
          return (
            <li key={item.id} className="work-row" data-status={item.status}>
              <span className="work-row-status" data-status={item.status} title={workItemStatusLabels[item.status]} />
              <button type="button" className="work-row-title" onClick={() => onOpenDetail(item)}>{item.title}</button>
              {showProduct && (
                <span className="work-row-project">
                  {product && <span aria-hidden="true">{product.icon}</span>}
                  {product?.name ?? '—'}
                </span>
              )}
              <span className="chip chip-type" style={{ background: typeColor.bg, color: typeColor.fg }}>
                {item.type === 'bug' ? <IconBug /> : <IconSpark />}
                {workItemTypeLabels[item.type]}
              </span>
              <span className="chip chip-priority" style={{ background: pColor.bg, color: pColor.fg }}>{priorityLabels[item.priority]}</span>
              <span className="work-row-due">
                {dueLabel
                  ? <span className={`chip chip-due chip-due-${dueTone}`}><IconClock />{dueLabel}</span>
                  : <span className="work-row-none">—</span>}
              </span>
              <span className="work-row-actions">
                <button type="button" className="work-row-edit" onClick={() => onEdit(item)}>编辑</button>
                <button type="button" className="work-row-delete" onClick={() => onDelete(item)}>删除</button>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
