import { beforeEach, describe, expect, it } from 'vitest'

import { createStudioRepository, type DocumentLock } from '../../src/data/studioRepository'
import type { MarkdownDocument } from '../../src/domain/models'

const candidate = (id: string, name: string, content = '# Content'): MarkdownDocument => ({
  id,
  productId: 'flora',
  name,
  content,
  createdAt: '2030-01-02T00:00:00.000Z',
  updatedAt: '2020-01-01T00:00:00.000Z',
})

class ControlledLock implements DocumentLock {
  private readonly queued: Array<{
    operation: () => Promise<unknown> | unknown
    resolve: (value: unknown) => void
    reject: (reason: unknown) => void
  }> = []

  request<T>(operation: () => Promise<T> | T): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queued.push({
        operation,
        resolve: resolve as (value: unknown) => void,
        reject,
      })
    })
  }

  get size(): number { return this.queued.length }

  async releaseNext(): Promise<void> {
    const next = this.queued.shift()
    if (!next) throw new Error('No queued lock operation')
    try { next.resolve(await next.operation()) } catch (error) { next.reject(error) }
  }
}

describe('document repository concurrency', () => {
  beforeEach(() => localStorage.clear())

  it('preserves two different documents whose saves are started before either lock runs', async () => {
    const lock = new ControlledLock()
    const repository = createStudioRepository(localStorage, lock)

    const first = repository.saveDocument(candidate('first', 'first.md'))
    const second = repository.saveDocument(candidate('second', 'second.md'))
    expect(lock.size).toBe(2)

    await lock.releaseNext()
    await first
    await lock.releaseNext()
    await second

    expect(repository.listDocuments('flora')).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'first' }),
      expect.objectContaining({ id: 'second' }),
    ]))
  })

  it('rejects the second of two concurrently started normalized names', async () => {
    const lock = new ControlledLock()
    const repository = createStudioRepository(localStorage, lock)
    const first = repository.saveDocument(candidate('first', 'café.md'))
    const second = repository.saveDocument(candidate('second', ' CAFE\u0301.MD '))

    await lock.releaseNext()
    await first
    await lock.releaseNext()

    await expect(second).rejects.toMatchObject({ code: 'DUPLICATE_DOCUMENT' })
    expect(repository.listDocuments('flora').filter(
      ({ name }) => name.normalize('NFC').toLowerCase() === 'café.md',
    )).toHaveLength(1)
  })

  it('generates valid timestamps and maintains lifecycle on same-id updates', async () => {
    const repository = createStudioRepository(localStorage)
    await repository.saveDocument(candidate('lifecycle', 'lifecycle.md'))
    const created = repository.listDocuments('flora').find(({ id }) => id === 'lifecycle')!
    expect(Date.parse(created.createdAt)).toBeLessThanOrEqual(Date.parse(created.updatedAt))

    await repository.saveDocument(
      { ...created, content: '# Updated', createdAt: '2040-01-01T00:00:00.000Z' },
      created.updatedAt,
    )
    const updated = repository.listDocuments('flora').find(({ id }) => id === 'lifecycle')!
    expect(updated.createdAt).toBe(created.createdAt)
    expect(Date.parse(updated.updatedAt)).toBeGreaterThan(Date.parse(created.updatedAt))
  })

  it('rejects a stale overwrite compare token without changing the stored document', async () => {
    const repository = createStudioRepository(localStorage)
    await repository.saveDocument(candidate('stale', 'stale.md', '# Original'))
    const original = repository.listDocuments('flora').find(({ id }) => id === 'stale')!
    await repository.saveDocument({ ...original, content: '# Current' }, original.updatedAt)
    const current = repository.listDocuments('flora').find(({ id }) => id === 'stale')!

    await expect(repository.saveDocument(
      { ...original, content: '# Stale writer' },
      original.updatedAt,
    )).rejects.toMatchObject({ code: 'DOCUMENT_CONFLICT' })
    expect(repository.listDocuments('flora').find(({ id }) => id === 'stale')).toEqual(current)
  })
})
