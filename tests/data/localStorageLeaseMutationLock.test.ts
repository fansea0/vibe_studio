import { beforeEach, describe, expect, it } from 'vitest'

import {
  createLocalStorageLeaseMutationLock,
  createStudioRepository,
  STUDIO_MUTATION_LOCK_KEY,
} from '../../src/data/studioRepository'

describe('localStorage lease mutation lock', () => {
  beforeEach(() => localStorage.clear())

  it('lets independent lock instances serialize through shared storage', async () => {
    const first = createLocalStorageLeaseMutationLock(localStorage)
    const second = createLocalStorageLeaseMutationLock(localStorage)
    const order: string[] = []

    await Promise.all([
      first.request(() => { order.push('first') }),
      second.request(() => { order.push('second') }),
    ])

    expect(order).toEqual(['first', 'second'])
    expect(localStorage.getItem(STUDIO_MUTATION_LOCK_KEY)).toBeNull()
  })

  it('preserves concurrent writes from independent repositories', async () => {
    const first = createStudioRepository(localStorage, createLocalStorageLeaseMutationLock(localStorage))
    const second = createStudioRepository(localStorage, createLocalStorageLeaseMutationLock(localStorage))
    const product = first.listProducts()[0]!

    await Promise.all([
      first.saveWorkItem({
        id: 'lease-a', productId: product.id, type: 'bug', title: 'A', priority: 'medium',
        dueDate: null, status: 'todo', createdAt: product.createdAt, updatedAt: product.updatedAt,
      }),
      second.saveVersion({
        id: 'lease-b', productId: product.id, number: '8.8.8', status: 'planned', releasedAt: null,
        notes: '', createdAt: product.createdAt, updatedAt: product.updatedAt,
      }),
    ])

    const snapshot = first.readSnapshot()
    expect(snapshot.workItems).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'lease-a' })]))
    expect(snapshot.versions).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'lease-b' })]))
  })

  it('takes over an expired lease', async () => {
    localStorage.setItem(STUDIO_MUTATION_LOCK_KEY, JSON.stringify({ owner: 'dead', expiresAt: 9 }))
    const lock = createLocalStorageLeaseMutationLock(localStorage, { now: () => 10, owner: 'live' })

    await expect(lock.request(() => 'recovered')).resolves.toBe('recovered')
    expect(localStorage.getItem(STUDIO_MUTATION_LOCK_KEY)).toBeNull()
  })

  it('times out on a live lease and releases only its own lease after exceptions', async () => {
    localStorage.setItem(STUDIO_MUTATION_LOCK_KEY, JSON.stringify({ owner: 'other', expiresAt: 100 }))
    const blocked = createLocalStorageLeaseMutationLock(localStorage, {
      now: () => 10, owner: 'blocked', timeoutMs: 0, sleep: async () => undefined,
    })
    await expect(blocked.request(() => undefined)).rejects.toMatchObject({ code: 'LOCK_UNAVAILABLE' })
    expect(JSON.parse(localStorage.getItem(STUDIO_MUTATION_LOCK_KEY) ?? '').owner).toBe('other')

    localStorage.removeItem(STUDIO_MUTATION_LOCK_KEY)
    const owned = createLocalStorageLeaseMutationLock(localStorage, { owner: 'owned' })
    await expect(owned.request(() => { throw new Error('boom') })).rejects.toThrow('boom')
    expect(localStorage.getItem(STUDIO_MUTATION_LOCK_KEY)).toBeNull()
  })
})
