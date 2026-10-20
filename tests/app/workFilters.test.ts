import { describe, expect, it } from 'vitest'
import type { WorkItem } from '../../src/domain/models'
import {
  countByDimension,
  defaultWorkFilters,
  daysUntilDue,
  dueDateLabel,
  localDateValue,
  filterWorkItems,
  matchesDue,
  matchesQuery,
  sortWorkItems,
  type WorkFilters,
} from '../../src/app/workFilters'

const item = (overrides: Partial<WorkItem> = {}): WorkItem => ({
  id: 'w1', productId: 'flora', type: 'requirement', title: '给植物加水', description: '按季节调整频率', assignee: 'me', priority: 'medium',
  dueDate: null, status: 'todo', createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z', isDeleted: false, deletedAt: null, deletedBy: '',
  ...overrides,
})

const day = (offset: number) => {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + offset)
  return localDateValue(date)
}

const filters = (overrides: Partial<WorkFilters> = {}): WorkFilters => ({ ...defaultWorkFilters, ...overrides })

describe('workFilters', () => {
  it('computes days until due date', () => {
    expect(daysUntilDue(null)).toBeNull()
    expect(daysUntilDue(day(0))).toBe(0)
    expect(daysUntilDue(day(3))).toBe(3)
    expect(daysUntilDue(day(-2))).toBe(-2)
  })

  it('renders human friendly due labels', () => {
    expect(dueDateLabel(null)).toBeNull()
    expect(dueDateLabel(day(0))).toBe('今天')
    expect(dueDateLabel(day(1))).toBe('明天')
    expect(dueDateLabel(day(-3))).toBe('逾期 3 天')
    expect(dueDateLabel(day(3))).toBe('3 天后')
  })

  it('matches query across title, description, assignee and product name', () => {
    const target = item()
    expect(matchesQuery(target, '')).toBe(true)
    expect(matchesQuery(target, '植物')).toBe(true)
    expect(matchesQuery(target, '季节')).toBe(true)
    expect(matchesQuery(target, 'ME')).toBe(true)
    expect(matchesQuery(target, 'Flora')).toBe(false)
    expect(matchesQuery(target, 'Flora', 'Flora')).toBe(true)
    expect(matchesQuery(target, '不存在的词')).toBe(false)
  })

  it('treats multiple keywords as AND', () => {
    const target = item()
    expect(matchesQuery(target, '植物 季节')).toBe(true)
    expect(matchesQuery(target, '植物 不存在')).toBe(false)
  })

  it('buckets due dates', () => {
    const overdue = item({ dueDate: day(-1) })
    const today = item({ dueDate: day(0) })
    const week = item({ dueDate: day(4) })
    const later = item({ dueDate: day(30) })
    const none = item({ dueDate: null })
    expect(matchesDue(overdue, 'overdue')).toBe(true)
    expect(matchesDue(today, 'overdue')).toBe(false)
    expect(matchesDue(today, 'today')).toBe(true)
    expect(matchesDue(week, 'week')).toBe(true)
    expect(matchesDue(later, 'week')).toBe(false)
    expect(matchesDue(none, 'none')).toBe(true)
    expect(matchesDue(week, 'all')).toBe(true)
  })

  it('filters by every facet', () => {
    const items = [
      item({ id: 'a', type: 'requirement', priority: 'high', status: 'todo', productId: 'flora' }),
      item({ id: 'b', type: 'bug', priority: 'urgent', status: 'done', productId: 'text-war' }),
    ]
    expect(filterWorkItems(items, filters({ type: 'bug' })).map(({ id }) => id)).toEqual(['b'])
    expect(filterWorkItems(items, filters({ priority: 'high' })).map(({ id }) => id)).toEqual(['a'])
    expect(filterWorkItems(items, filters({ status: 'done' })).map(({ id }) => id)).toEqual(['b'])
    expect(filterWorkItems(items, filters({ productId: 'text-war' })).map(({ id }) => id)).toEqual(['b'])
    expect(filterWorkItems(items, filters({ query: '植物' })).map(({ id }) => id)).toEqual(['a', 'b'])
  })

  it('keeps finished tasks inside the filter pipeline', () => {
    const items = [item({ id: 'a' }), item({ id: 'b', status: 'done' })]
    expect(filterWorkItems(items, filters({ status: 'done' })).map(({ id }) => id)).toEqual(['b'])
    expect(filterWorkItems(items, filters({ query: '植物' })).map(({ id }) => id)).toEqual(['a', 'b'])
  })

  it('sorts by priority, due date and recency', () => {
    const items = [
      item({ id: 'low', priority: 'low' }),
      item({ id: 'urgent', priority: 'urgent' }),
      item({ id: 'high', priority: 'high' }),
    ]
    expect(sortWorkItems(items, 'priority').map(({ id }) => id)).toEqual(['urgent', 'high', 'low'])
    expect(sortWorkItems(items, 'updated')[0].id).toBe('low')

    const dated = [
      item({ id: 'later', dueDate: day(5) }),
      item({ id: 'sooner', dueDate: day(1) }),
      item({ id: 'none' }),
    ]
    expect(sortWorkItems(dated, 'due').map(({ id }) => id)).toEqual(['sooner', 'later', 'none'])
  })

  it('counts how many tasks each filter option would keep', () => {
    const items = [
      item({ id: 'a', type: 'requirement', status: 'todo' }),
      item({ id: 'b', type: 'bug', status: 'done' }),
    ]
    const counts = countByDimension(items, filters(), 'type')
    expect(counts.get('requirement')).toBe(1)
    expect(counts.get('bug')).toBe(1)

    const statusCounts = countByDimension(items, filters({ type: 'bug' }), 'status')
    expect(statusCounts.get('done')).toBe(1)
    expect(statusCounts.get('todo') ?? 0).toBe(0)
  })
})
