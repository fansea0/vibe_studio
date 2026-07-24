import { describe, expect, it } from 'vitest'
import { describeEvent, dueDateTone, formatDeletedBy, retentionDays, trashRemainingDays } from '../../src/app/taskPresentation'

describe('taskPresentation', () => {
  it('formats actor fallback', () => {
    expect(formatDeletedBy('')).toBe('系统')
    expect(formatDeletedBy('alice')).toBe('alice')
  })

  it('calculates retention', () => {
    expect(retentionDays).toBe(30)
  })

  it('trashRemainingDays handles null', () => {
    expect(trashRemainingDays(null).label).toBe('—')
  })

  it('trashRemainingDays recent', () => {
    const r = trashRemainingDays(new Date().toISOString())
    expect(r.label).toMatch(/还剩|明天到期/)
  })

  it('trashRemainingDays expired', () => {
    const r = trashRemainingDays(new Date(Date.now() - 31 * 24 * 3600 * 1000).toISOString())
    expect(r.label).toBe('已过期')
    expect(r.tone).toBe('overdue')
  })

  it('dueDateTone', () => {
    expect(dueDateTone(null)).toBe('none')
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const past = new Date(today.getTime() - 24 * 3600 * 1000); const future = new Date(today.getTime() + 24 * 3600 * 1000)
    const pastIso = past.toISOString().slice(0, 10); const futureIso = future.toISOString().slice(0, 10)
    expect(dueDateTone(pastIso)).toBe('overdue')
    expect(dueDateTone(futureIso)).toBe('warn')
  })

  it('describeEvent creates', () => {
    expect(describeEvent({ id: 'e', workItemId: 'w', type: 'created', actor: 'alice', fromStatus: null, toStatus: null, meta: {}, createdAt: '' })).toContain('alice')
  })

  it('describeEvent status_changed', () => {
    const r = describeEvent({ id: 'e', workItemId: 'w', type: 'status_changed', actor: '', fromStatus: 'todo', toStatus: 'done', meta: {}, createdAt: '' })
    expect(r).toContain('todo')
    expect(r).toContain('done')
  })
})