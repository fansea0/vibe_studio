import { beforeEach, describe, expect, it } from 'vitest'

import { createStudioRepository, createUnavailableMutationLock, type MutationLock } from '../../src/data/studioRepository'
import type { MarkdownDocument } from '../../src/domain/models'
import { seedStudio } from '../../src/data/seedStudio'

const candidate = (id: string, name: string, content = '# Content'): MarkdownDocument => ({
  id,
  productId: 'flora',
  name,
  content,
  createdAt: '2030-01-02T00:00:00.000Z',
  updatedAt: '2020-01-01T00:00:00.000Z',
})

class ControlledLock implements MutationLock {
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

    const first = repository.saveDocument(candidate('first', 'first.md'), { expectedUpdatedAt: null })
    const second = repository.saveDocument(candidate('second', 'second.md'), { expectedUpdatedAt: null })
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
    const first = repository.saveDocument(candidate('first', 'café.md'), { expectedUpdatedAt: null })
    const second = repository.saveDocument(candidate('second', ' CAFE\u0301.MD '), { expectedUpdatedAt: null })

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
    await repository.saveDocument(candidate('lifecycle', 'lifecycle.md'), { expectedUpdatedAt: null })
    const created = repository.listDocuments('flora').find(({ id }) => id === 'lifecycle')!
    expect(Date.parse(created.createdAt)).toBeLessThanOrEqual(Date.parse(created.updatedAt))

    await repository.saveDocument(
      { ...created, content: '# Updated', createdAt: '2040-01-01T00:00:00.000Z' },
      { expectedUpdatedAt: created.updatedAt },
    )
    const updated = repository.listDocuments('flora').find(({ id }) => id === 'lifecycle')!
    expect(updated.createdAt).toBe(created.createdAt)
    expect(Date.parse(updated.updatedAt)).toBeGreaterThan(Date.parse(created.updatedAt))
  })

  it('rejects a stale overwrite compare token without changing the stored document', async () => {
    const repository = createStudioRepository(localStorage)
    await repository.saveDocument(candidate('stale', 'stale.md', '# Original'), { expectedUpdatedAt: null })
    const original = repository.listDocuments('flora').find(({ id }) => id === 'stale')!
    await repository.saveDocument({ ...original, content: '# Current' }, { expectedUpdatedAt: original.updatedAt })
    const current = repository.listDocuments('flora').find(({ id }) => id === 'stale')!

    await expect(repository.saveDocument(
      { ...original, content: '# Stale writer' },
      { expectedUpdatedAt: original.updatedAt },
    )).rejects.toMatchObject({ code: 'DOCUMENT_CONFLICT' })
    expect(repository.listDocuments('flora').find(({ id }) => id === 'stale')).toEqual(current)
  })

  it('serializes document, product, task, version, and reset mutations through one lock', async () => {
    const lock = new ControlledLock()
    const repository = createStudioRepository(localStorage, lock)
    const product = repository.listProducts().find(({ id }) => id === 'flora')!
    const documentSave = repository.saveDocument(candidate('mixed', 'mixed.md'), { expectedUpdatedAt: null })
    const productSave = repository.saveProduct({ ...product, name: 'Locked Flora' }, { expectedUpdatedAt: product.updatedAt })
    const taskSave = repository.saveWorkItem({
      id: 'locked-task', productId: 'flora', type: 'bug', title: 'Locked', priority: 'medium',
      dueDate: null, status: 'todo', createdAt: product.createdAt, updatedAt: product.updatedAt,
    })
    const versionSave = repository.saveVersion({
      id: 'locked-version', productId: 'flora', number: '9.9.9', status: 'planned', releasedAt: null,
      notes: '', createdAt: product.createdAt, updatedAt: product.updatedAt,
    })
    expect(lock.size).toBe(4)
    for (const operation of [documentSave, productSave, taskSave, versionSave]) {
      await lock.releaseNext()
      await operation
    }
    expect(repository.readSnapshot()).toMatchObject({
      products: expect.arrayContaining([expect.objectContaining({ id: 'flora', name: 'Locked Flora' })]),
      documents: expect.arrayContaining([expect.objectContaining({ id: 'mixed' })]),
      workItems: expect.arrayContaining([expect.objectContaining({ id: 'locked-task' })]),
      versions: expect.arrayContaining([expect.objectContaining({ id: 'locked-version' })]),
    })

    const latestProduct = repository.listProducts().find(({ id }) => id === product.id)!
    const lateSave = repository.saveProduct({ ...latestProduct, name: 'Will reset' }, { expectedUpdatedAt: latestProduct.updatedAt })
    const reset = repository.reset()
    await lock.releaseNext(); await lateSave
    await lock.releaseNext(); await reset
    expect(repository.readSnapshot()).toEqual({ products: [], workItems: [], versions: [], documents: [] })
  })

  it('surfaces a typed error when the mutation lock is unavailable', async () => {
    const repository = createStudioRepository(localStorage, createUnavailableMutationLock())

    const product = repository.listProducts()[0]!
    await expect(repository.saveProduct(product, { expectedUpdatedAt: product.updatedAt })).rejects.toMatchObject({
      code: 'LOCK_UNAVAILABLE',
    })
  })

  it('serializes canonical salvage write-back through the mutation lock', async () => {
    localStorage.setItem('vibe-studio:v1', JSON.stringify({
      ...seedStudio,
      documents: [{ ...candidate('canonical-lock', ' guide.md '), createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' }],
    }))
    const lock = new ControlledLock()
    const repository = createStudioRepository(localStorage, lock)

    expect(repository.listDocuments('flora')[0]?.name).toBe('guide.md')
    expect(lock.size).toBe(1)
    expect(JSON.parse(localStorage.getItem('vibe-studio:v1') ?? '').documents[0].name).toBe(' guide.md ')
    await lock.releaseNext()
    expect(JSON.parse(localStorage.getItem('vibe-studio:v1') ?? '').documents[0].name).toBe('guide.md')
  })

  it('enforces product create tokens and normalized unique names', async () => {
    const lock = new ControlledLock()
    const repository = createStudioRepository(localStorage, lock)
    const base = repository.listProducts()[0]!
    const first = repository.saveProduct({ ...base, id: 'new-a', name: 'Café' }, { expectedUpdatedAt: null })
    const duplicate = repository.saveProduct({ ...base, id: 'new-b', name: ' CAFE\u0301 ' }, { expectedUpdatedAt: null })
    await lock.releaseNext(); await first
    await lock.releaseNext()

    await expect(duplicate).rejects.toMatchObject({ code: 'DUPLICATE_PRODUCT' })
    const sameId = repository.saveProduct({ ...base, id: 'new-a' }, { expectedUpdatedAt: null })
    await lock.releaseNext()
    await expect(sameId).rejects.toMatchObject({ code: 'PRODUCT_CONFLICT' })
  })

  it('preserves product creation time and rejects stale update tokens', async () => {
    const repository = createStudioRepository(localStorage)
    const original = repository.listProducts()[0]!
    await repository.saveProduct({ ...original, name: 'First update', createdAt: '2040-01-01T00:00:00.000Z' }, { expectedUpdatedAt: original.updatedAt })
    const current = repository.listProducts().find(({ id }) => id === original.id)!
    expect(current.createdAt).toBe(original.createdAt)
    expect(Date.parse(current.updatedAt)).toBeGreaterThan(Date.parse(original.updatedAt))

    await expect(repository.saveProduct({ ...original, name: 'Stale' }, { expectedUpdatedAt: original.updatedAt }))
      .rejects.toMatchObject({ code: 'PRODUCT_CONFLICT' })
  })

  it('migrates only legacy lifecycle fields from the latest locked product', async () => {
    const lock = new ControlledLock()
    const repository = createStudioRepository(localStorage, lock)
    const original = repository.listProducts()[0]!
    localStorage.setItem('vibe-studio:v1', JSON.stringify({
      ...repository.readSnapshot(),
      products: [{ ...original, status: 'archived', archivedAt: null }],
    }))
    const migration = repository.migrateLegacyProductLifecycle(original.id)
    const latest = JSON.parse(localStorage.getItem('vibe-studio:v1') ?? '')
    latest.products[0].name = 'Latest name'
    latest.products[0].userCount = 999
    localStorage.setItem('vibe-studio:v1', JSON.stringify(latest))
    await lock.releaseNext(); await migration

    expect(repository.listProducts()[0]).toMatchObject({
      name: 'Latest name', userCount: 999, status: 'developing', archivedAt: null,
    })
  })

  it('does not rewrite a product whose lifecycle is already valid', async () => {
    const lock = new ControlledLock()
    const repository = createStudioRepository(localStorage, lock)
    const product = repository.listProducts()[0]!
    const before = localStorage.getItem('vibe-studio:v1')
    const migration = repository.migrateLegacyProductLifecycle(product.id)
    await lock.releaseNext(); await migration

    expect(localStorage.getItem('vibe-studio:v1')).toBe(before)
  })
})
