import type { WorkItem, WorkItemEvent, WorkItemEventType, WorkItemStatus } from '../domain/models'
import { taskColorTokens } from './taskColorTokens'

export const eventTypeLabels: Record<WorkItemEventType, string> = {
  created: '创建',
  status_changed: '状态变更',
  commented: '评论',
  edited: '编辑',
  deleted: '删除',
  restored: '恢复',
  purged: '永久删除',
}

export const formatDeletedBy = (actor: string): string => actor === '' ? '系统' : actor

export const retentionDays = 30

export const trashRemainingDays = (deletedAt: string | null): { label: string; tone: 'ok' | 'warn' | 'overdue' } => {
  if (!deletedAt) return { label: '—', tone: 'ok' }
  const elapsedMs = Date.now() - Date.parse(deletedAt)
  const remainMs = retentionDays * 24 * 3600 * 1000 - elapsedMs
  const remainDays = Math.ceil(remainMs / (24 * 3600 * 1000))
  if (remainDays <= 0) return { label: '已过期', tone: 'overdue' }
  if (remainDays === 1) return { label: '明天到期', tone: 'warn' }
  return { label: `还剩 ${remainDays} 天`, tone: 'ok' }
}

export const dueDateTone = (iso: string | null): 'ok' | 'warn' | 'overdue' | 'none' => {
  if (!iso) return 'none'
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const due = new Date(`${iso.slice(0, 10)}T00:00:00`)
  const diff = Math.round((due.getTime() - today.getTime()) / (24 * 3600 * 1000))
  if (diff < 0) return 'overdue'
  if (diff <= 2) return 'warn'
  return 'ok'
}

export const priorityChipColor = (priority: WorkItem['priority']): { bg: string; fg: string } => ({
  bg: taskColorTokens.chipPriorityBg[priority],
  fg: taskColorTokens.chipPriorityFg[priority],
})

export const typeChipColor = (type: WorkItem['type']): { bg: string; fg: string } => taskColorTokens.chipType[type]

export const statusColumnDot = (status: WorkItemStatus): string => taskColorTokens.statusColumnDot[status]

export const describeEvent = (event: WorkItemEvent): string => {
  switch (event.type) {
    case 'created': return `${event.actor || '系统'} 创建了任务`
    case 'status_changed': return `${event.actor || '系统'} 将状态从 ${event.fromStatus ?? '?'} 改为 ${event.toStatus ?? '?'}`
    case 'commented': return `${event.actor || '系统'} 添加了评论`
    case 'edited': {
      const field = (event.meta?.field as string | undefined) ?? '字段'
      return `${event.actor || '系统'} 修改了 ${field}`
    }
    case 'deleted': return `${event.actor || '系统'} 将任务移入回收站`
    case 'restored': return `${event.actor || '系统'} 从回收站恢复了任务`
    case 'purged': return `${event.actor || '系统'} 永久删除了任务`
  }
}