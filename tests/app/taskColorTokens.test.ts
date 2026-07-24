import { describe, expect, it } from 'vitest'
import { taskColorTokens } from '../../src/app/taskColorTokens'

describe('taskColorTokens', () => {
  it('covers all work item statuses', () => {
    expect(Object.keys(taskColorTokens.statusColumnDot).sort()).toEqual(['done','in_progress','todo'])
  })
  it('covers all work item types', () => {
    expect(Object.keys(taskColorTokens.chipType).sort()).toEqual(['bug','requirement'])
  })
  it('covers all priorities', () => {
    expect(Object.keys(taskColorTokens.chipPriorityBg).sort()).toEqual(['high','low','medium','urgent'])
    expect(Object.keys(taskColorTokens.chipPriorityFg).sort()).toEqual(['high','low','medium','urgent'])
  })
  it('every chip has bg+fg', () => {
    expect(taskColorTokens.chipType.requirement.bg).toMatch(/^#/)
    expect(taskColorTokens.chipPriorityBg.urgent).toMatch(/^#/)
  })
})