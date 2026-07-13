import { IDBDatabase, IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'

import {
  createIndexedDbMutationLock,
  createStudioRepository,
  type MutationLock,
} from '../../src/data/studioRepository'

describe('IndexedDB mutation lock', () => {
  it('strictly serializes two independent lock instances through real transactions', async () => {
    const factory = new IDBFactory()
    const first = createIndexedDbMutationLock(factory)
    const second = createIndexedDbMutationLock(factory)
    const order: string[] = []

    await Promise.all([
      first.request('studio', () => { order.push('start1', 'end1') }),
      second.request('studio', () => { order.push('start2', 'end2') }),
    ])

    expect(order).toEqual(['start1', 'end1', 'start2', 'end2'])
  })

  it('preserves concurrent product, document, and version writes from independent repositories', async () => {
    const factory = new IDBFactory()
    const first = createStudioRepository(localStorage, createIndexedDbMutationLock(factory))
    const second = createStudioRepository(localStorage, createIndexedDbMutationLock(factory))
    const product = first.listProducts().find(({ id }) => id === 'flora')!

    await Promise.all([
      first.saveProduct({ ...product, name: 'Indexed Flora' }, { expectedUpdatedAt: product.updatedAt }),
      second.saveDocument({
        id: 'idb-document', productId: product.id, name: 'idb.md', content: '# IDB',
        createdAt: product.createdAt, updatedAt: product.updatedAt,
      }, { expectedUpdatedAt: null }),
      second.saveVersion({
        id: 'idb-version', productId: product.id, number: '7.7.7', status: 'planned', releasedAt: null,
        notes: '', createdAt: product.createdAt, updatedAt: product.updatedAt,
      }),
    ])

    expect(first.readSnapshot()).toMatchObject({
      products: expect.arrayContaining([expect.objectContaining({ id: product.id, name: 'Indexed Flora' })]),
      documents: expect.arrayContaining([expect.objectContaining({ id: 'idb-document' })]),
      versions: expect.arrayContaining([expect.objectContaining({ id: 'idb-version' })]),
    })
  })

  it('aborts on an operation error and lets the next request enter', async () => {
    const factory = new IDBFactory()
    const first = createIndexedDbMutationLock(factory)
    const second = createIndexedDbMutationLock(factory)
    const original = new Error('boom')

    await expect(first.request('studio', () => { throw original })).rejects.toBe(original)
    await expect(second.request('studio', () => 'next')).resolves.toBe('next')
  })

  it('rejects an asynchronous operation because it would outlive the transaction', async () => {
    const lock = createIndexedDbMutationLock(new IDBFactory())

    await expect(lock.request('studio', async () => 'unsafe'))
      .rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
  })

  it('wraps IndexedDB open and transaction failures as typed lock errors', async () => {
    const openFailure = {
      open: () => { throw new DOMException('denied', 'SecurityError') },
    } as unknown as IDBFactory
    await expect(createIndexedDbMutationLock(openFailure).request('studio', () => undefined))
      .rejects.toMatchObject({ code: 'LOCK_UNAVAILABLE' })

    const factory = new IDBFactory()
    const transactionFailure: MutationLock = createIndexedDbMutationLock(factory)
    await transactionFailure.request('studio', () => undefined)
    const originalTransaction = IDBDatabase.prototype.transaction
    IDBDatabase.prototype.transaction = (() => {
      throw new DOMException('closed', 'InvalidStateError')
    }) as typeof originalTransaction
    try {
      await expect(transactionFailure.request('studio', () => undefined))
        .rejects.toMatchObject({ code: 'LOCK_UNAVAILABLE' })
    } finally {
      IDBDatabase.prototype.transaction = originalTransaction
    }
  })
})
