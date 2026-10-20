import type { Product, WorkItem, WorkItemComment, WorkItemEvent } from '../domain/models'
import { WorkSurface } from './WorkSurface'

interface TaskBoardProps {
  productId: string
  items: WorkItem[]
  trashItems: WorkItem[]
  products?: Product[]
  comments: Record<string, WorkItemComment[]>
  events: Record<string, WorkItemEvent[]>
  onSaveWorkItem: (item: WorkItem) => Promise<void>
  onDeleteWorkItem: (item: WorkItem) => Promise<void>
  onRestoreWorkItem: (item: WorkItem) => Promise<void>
  onPurgeWorkItem: (item: WorkItem) => Promise<void>
  onLoadComments: (item: WorkItem) => Promise<void>
  onLoadEvents: (item: WorkItem) => Promise<void>
  onCreateComment: (item: WorkItem, body: { author: string; body: string }) => Promise<void>
}

/** 单个产品的需求看板：与全局需求中心共用同一套筛选、搜索和折叠逻辑。 */
export function TaskBoard({ productId, items, trashItems, products = [], comments, events, onSaveWorkItem, onDeleteWorkItem, onRestoreWorkItem, onPurgeWorkItem, onLoadComments, onLoadEvents, onCreateComment }: TaskBoardProps) {
  return (
    <section className="work-panel" aria-labelledby="task-board-title">
      <div className="section-heading work-heading">
        <div>
          <h2 id="task-board-title">需求与 Bug</h2>
          <p>按状态跟进工作项；已完成的会自动折叠，随时能搜回来。</p>
        </div>
      </div>
      <WorkSurface
        scope="product"
        productId={productId}
        items={items}
        trashItems={trashItems}
        products={products}
        comments={comments}
        events={events}
        onSaveWorkItem={onSaveWorkItem}
        onDeleteWorkItem={onDeleteWorkItem}
        onRestoreWorkItem={onRestoreWorkItem}
        onPurgeWorkItem={onPurgeWorkItem}
        onLoadComments={onLoadComments}
        onLoadEvents={onLoadEvents}
        onCreateComment={onCreateComment}
      />
    </section>
  )
}
