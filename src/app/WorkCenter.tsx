import type { Product, WorkItem, WorkItemComment, WorkItemEvent } from '../domain/models'
import { WorkSurface } from './WorkSurface'

interface WorkCenterProps {
  workItems: WorkItem[]
  trashWorkItems: WorkItem[]
  products: Product[]
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

/**
 * 需求中心：把多个 vibe 项目的需求排在同一张看板上。
 * 面向个人开发者——一个人要同时照看好几条产品线时，跨项目总览比逐个点进产品更有用。
 */
export function WorkCenter({ workItems, trashWorkItems, products, comments, events, onSaveWorkItem, onDeleteWorkItem, onRestoreWorkItem, onPurgeWorkItem, onLoadComments, onLoadEvents, onCreateComment }: WorkCenterProps) {
  const activeProducts = products.filter(({ archivedAt }) => archivedAt === null)
  const openCount = workItems.filter((item) => item.status !== 'done').length
  const doneCount = workItems.filter((item) => item.status === 'done').length

  return (
    <>
      <header className="page-heading work-center-heading">
        <div>
          <p className="eyebrow">WORK PLANNING</p>
          <h1>需求中心</h1>
          <p>把 {activeProducts.length} 个项目的需求排在一起，先推进最要紧的那条。</p>
        </div>
        <div className="work-center-stats">
          <span><strong>{openCount}</strong> 进行中</span>
          <span><strong>{doneCount}</strong> 已完成</span>
        </div>
      </header>
      <WorkSurface
        scope="all"
        items={workItems}
        trashItems={trashWorkItems}
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
    </>
  )
}
