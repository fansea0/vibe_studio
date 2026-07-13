import type { Priority, WorkItemStatus, WorkItemType } from '../domain/models'

export const workItemStatusLabels: Record<WorkItemStatus, string> = {
  todo: '待处理',
  in_progress: '进行中',
  done: '已完成',
}

export const workItemTypeLabels: Record<WorkItemType, string> = {
  requirement: '需求',
  bug: 'Bug',
}

export const priorityLabels: Record<Priority, string> = {
  low: '低',
  medium: '中',
  high: '高',
  urgent: '紧急',
}

export const workItemStatuses = Object.keys(workItemStatusLabels) as WorkItemStatus[]
export const workItemTypes = Object.keys(workItemTypeLabels) as WorkItemType[]
export const priorities = Object.keys(priorityLabels) as Priority[]
