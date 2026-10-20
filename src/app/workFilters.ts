import type { Priority, WorkItem, WorkItemStatus, WorkItemType } from '../domain/models'
import { priorityLabels, workItemStatusLabels, workItemTypeLabels } from './workItemPresentation'

/** 到期筛选：所有选项都用「全部」之外的具体值，'all' 表示不限制。 */
export type DueFilter = 'all' | 'overdue' | 'today' | 'week' | 'none'
export type WorkViewMode = 'board' | 'list'
export type WorkSortKey = 'priority' | 'due' | 'updated'

export interface WorkFilters {
  query: string
  type: WorkItemType | 'all'
  priority: Priority | 'all'
  status: WorkItemStatus | 'all'
  productId: string | 'all'
  due: DueFilter
}

export const defaultWorkFilters: WorkFilters = {
  query: '',
  type: 'all',
  priority: 'all',
  status: 'all',
  productId: 'all',
  due: 'all',
}

const MS_PER_DAY = 86_400_000

const priorityRank: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

export const localDateValue = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const startOfToday = (): Date => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today
}

/** 距离截止日期的天数：负数表示已逾期，null 表示没有截止日期。 */
export const daysUntilDue = (dueDate: string | null): number | null => {
  if (!dueDate) return null
  const due = new Date(`${dueDate.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(due.getTime())) return null
  return Math.round((due.getTime() - startOfToday().getTime()) / MS_PER_DAY)
}

/** 面向人的截止日期文案：逾期/今天/明天/N 天后，7 天以外回落到月/日。 */
export const dueDateLabel = (dueDate: string | null): string | null => {
  const days = daysUntilDue(dueDate)
  if (days === null || dueDate === null) return null
  if (days < 0) return `逾期 ${Math.abs(days)} 天`
  if (days === 0) return '今天'
  if (days === 1) return '明天'
  if (days <= 7) return `${days} 天后`
  return `${dueDate.slice(5, 7)}/${dueDate.slice(8, 10)}`
}

export const normalizeQuery = (query: string): string => query.trim().toLowerCase()

/** 标题、描述、负责人、项目名任意字段命中即可，多个关键词按「与」关系叠加。 */
export const matchesQuery = (item: WorkItem, query: string, productName = ''): boolean => {
  const normalized = normalizeQuery(query)
  if (!normalized) return true
  const haystack = [item.title, item.description, item.assignee, productName]
    .join('\n')
    .toLowerCase()
  return normalized.split(/\s+/).every((token) => haystack.includes(token))
}

export const matchesDue = (item: WorkItem, due: DueFilter): boolean => {
  if (due === 'all') return true
  const days = daysUntilDue(item.dueDate)
  if (due === 'none') return item.dueDate === null
  if (days === null) return false
  if (due === 'overdue') return days < 0
  if (due === 'today') return days === 0
  return days >= 0 && days <= 7
}

export const filterWorkItems = (
  items: readonly WorkItem[],
  filters: WorkFilters,
  productNames: ReadonlyMap<string, string> = new Map(),
): WorkItem[] => items.filter((item) => {
  if (filters.type !== 'all' && item.type !== filters.type) return false
  if (filters.priority !== 'all' && item.priority !== filters.priority) return false
  if (filters.status !== 'all' && item.status !== filters.status) return false
  if (filters.productId !== 'all' && item.productId !== filters.productId) return false
  if (!matchesDue(item, filters.due)) return false
  return matchesQuery(item, filters.query, productNames.get(item.productId) ?? '')
})

const compareDue = (left: WorkItem, right: WorkItem): number => {
  const leftDays = daysUntilDue(left.dueDate)
  const rightDays = daysUntilDue(right.dueDate)
  if (leftDays === null && rightDays === null) return 0
  if (leftDays === null) return 1
  if (rightDays === null) return -1
  return leftDays - rightDays
}

export const sortWorkItems = (items: readonly WorkItem[], key: WorkSortKey): WorkItem[] => items.toSorted((left, right) => {
  if (key === 'updated') return Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
  if (key === 'due') {
    return compareDue(left, right) || priorityRank[left.priority] - priorityRank[right.priority]
  }
  return priorityRank[left.priority] - priorityRank[right.priority] || compareDue(left, right)
})

export const countActiveFilters = (filters: WorkFilters): number => [
  filters.type, filters.priority, filters.status, filters.productId, filters.due,
].filter((value) => value !== 'all').length

export type FilterDimension = 'type' | 'priority' | 'status' | 'productId' | 'due'

const passesExcept = (
  item: WorkItem,
  filters: WorkFilters,
  dimension: FilterDimension,
  productNames: ReadonlyMap<string, string>,
): boolean => {
  if (dimension !== 'type' && filters.type !== 'all' && item.type !== filters.type) return false
  if (dimension !== 'priority' && filters.priority !== 'all' && item.priority !== filters.priority) return false
  if (dimension !== 'status' && filters.status !== 'all' && item.status !== filters.status) return false
  if (dimension !== 'productId' && filters.productId !== 'all' && item.productId !== filters.productId) return false
  if (dimension !== 'due' && !matchesDue(item, filters.due)) return false
  return matchesQuery(item, filters.query, productNames.get(item.productId) ?? '')
}

/** 某个筛选项下还有多少条命中的任务，用于在筛选菜单里显示计数。 */
export const countByDimension = (
  items: readonly WorkItem[],
  filters: WorkFilters,
  dimension: FilterDimension,
  productNames: ReadonlyMap<string, string> = new Map(),
): Map<string, number> => {
  const counts = new Map<string, number>()
  const bump = (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1)
  if (dimension === 'due') {
    const values: DueFilter[] = ['all', 'overdue', 'today', 'week', 'none']
    for (const value of values) {
      const total = items.filter((item) => passesExcept(item, filters, 'due', productNames) && matchesDue(item, value)).length
      counts.set(value, total)
    }
    return counts
  }
  for (const item of items) {
    if (!passesExcept(item, filters, dimension, productNames)) continue
    if (dimension === 'type') bump(item.type)
    else if (dimension === 'priority') bump(item.priority)
    else if (dimension === 'status') bump(item.status)
    else bump(item.productId)
  }
  return counts
}

export interface FilterChip {
  key: keyof WorkFilters
  label: string
  value: string
}

/** 当前生效的筛选条件，渲染成可单独移除的标签。 */
export const activeFilterChips = (
  filters: WorkFilters,
  productName: (productId: string) => string,
): FilterChip[] => {
  const chips: FilterChip[] = []
  if (filters.type !== 'all') chips.push({ key: 'type', label: '类型', value: workItemTypeLabels[filters.type] })
  if (filters.priority !== 'all') chips.push({ key: 'priority', label: '优先级', value: priorityLabels[filters.priority] })
  if (filters.status !== 'all') chips.push({ key: 'status', label: '状态', value: workItemStatusLabels[filters.status] })
  if (filters.productId !== 'all') chips.push({ key: 'productId', label: '项目', value: productName(filters.productId) })
  if (filters.due !== 'all') chips.push({ key: 'due', label: '截止', value: dueFilterLabels[filters.due] })
  return chips
}

export const dueFilterLabels: Record<DueFilter, string> = {
  all: '全部时间',
  overdue: '已逾期',
  today: '今天到期',
  week: '本周内',
  none: '无截止日期',
}

export const typeFilterLabels: Record<WorkItemType | 'all', string> = { all: '全部类型', ...workItemTypeLabels }
export const priorityFilterLabels: Record<Priority | 'all', string> = { all: '全部优先级', ...priorityLabels }
export const statusFilterLabels: Record<WorkItemStatus | 'all', string> = { all: '全部状态', ...workItemStatusLabels }
