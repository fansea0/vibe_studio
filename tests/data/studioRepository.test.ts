import { beforeEach, describe, expect, it } from 'vitest'

import type { MarkdownDocument, Product, ProductVersion, WorkItem } from '../../src/domain/models'
import { seedStudio } from '../../src/data/seedStudio'
import { createStudioRepository } from '../../src/data/studioRepository'

const STORAGE_KEY = 'vibe-studio:v1'

const product: Product = {
  id: 'test-product',
  name: 'Test Product',
  description: 'Repository fixture',
  productType: 'web-app',
  icon: '🧪',
  status: 'beta',
  completionPercent: 50,
  userCount: 42,
  userCountSource: 'test',
  appUrl: null,
  archivedAt: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
}

const workItem = (id: string, productId: string): WorkItem => ({
  id,
  productId,
  type: 'requirement',
  title: `Item ${id}`,
  priority: 'medium',
  dueDate: null,
  status: 'todo',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
})

const version = (id: string, productId: string): ProductVersion => ({
  id,
  productId,
  number: '1.0.0',
  status: 'planned',
  releasedAt: null,
  notes: '',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
})

const document = (id: string, productId: string): MarkdownDocument => ({
  id,
  productId,
  name: `Document ${id}`,
  content: '# Fixture',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
})

class FaultyStorage implements Storage {
  readonly data = new Map<string, string>()
  failReads = false
  failWrites = false
  writeAttempts = 0

  get length(): number {
    return this.data.size
  }

  clear(): void {
    this.data.clear()
  }

  getItem(key: string): string | null {
    if (this.failReads) throw new DOMException('Storage read denied', 'SecurityError')
    return this.data.get(key) ?? null
  }

  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.data.delete(key)
  }

  setItem(key: string, value: string): void {
    this.writeAttempts += 1
    if (this.failWrites) throw new DOMException('Storage quota exceeded', 'QuotaExceededError')
    this.data.set(key, value)
  }
}

describe('createStudioRepository', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('starts from the Studio seed and round-trips products', () => {
    const repository = createStudioRepository(localStorage)

    expect(repository.listProducts()).toEqual(seedStudio.products)

    repository.saveProduct(product)

    expect(repository.listProducts()).toContainEqual(product)
  })

  it('isolates every child record collection by productId', () => {
    const repository = createStudioRepository(localStorage)
    repository.saveWorkItem(workItem('item-a', 'flora'))
    repository.saveWorkItem(workItem('item-b', 'resume-genius'))
    repository.saveVersion(version('version-a', 'flora'))
    repository.saveVersion(version('version-b', 'resume-genius'))
    repository.saveDocument(document('document-a', 'flora'))
    repository.saveDocument(document('document-b', 'resume-genius'))

    expect(repository.listWorkItems('flora').map(({ id }) => id)).toContain('item-a')
    expect(repository.listVersions('flora').map(({ id }) => id)).toContain('version-a')
    expect(repository.listDocuments('flora').map(({ id }) => id)).toContain('document-a')
  })

  it('keeps child records with the same id when their productId differs', () => {
    const repository = createStudioRepository(localStorage)

    repository.saveWorkItem(workItem('shared', 'flora'))
    repository.saveWorkItem(workItem('shared', 'resume-genius'))
    repository.saveVersion(version('shared', 'flora'))
    repository.saveVersion(version('shared', 'resume-genius'))
    repository.saveDocument(document('shared', 'flora'))
    repository.saveDocument(document('shared', 'resume-genius'))

    expect(repository.listWorkItems('flora')).toContainEqual(workItem('shared', 'flora'))
    expect(repository.listWorkItems('resume-genius')).toContainEqual(
      workItem('shared', 'resume-genius'),
    )
    expect(repository.listVersions('flora')).toContainEqual(version('shared', 'flora'))
    expect(repository.listVersions('resume-genius')).toContainEqual(
      version('shared', 'resume-genius'),
    )
    expect(repository.listDocuments('flora')).toContainEqual(document('shared', 'flora'))
    expect(repository.listDocuments('resume-genius')).toContainEqual(
      document('shared', 'resume-genius'),
    )
  })

  it('updates records with the same id instead of appending duplicates', () => {
    const repository = createStudioRepository(localStorage)
    repository.saveProduct(product)
    repository.saveProduct({ ...product, name: 'Renamed Product' })
    repository.saveWorkItem(workItem('item-a', product.id))
    repository.saveWorkItem({ ...workItem('item-a', product.id), title: 'Updated item' })

    expect(repository.listProducts().filter(({ id }) => id === product.id)).toEqual([
      expect.objectContaining({ name: 'Renamed Product' }),
    ])
    expect(repository.listWorkItems(product.id)).toEqual([
      expect.objectContaining({ id: 'item-a', title: 'Updated item' }),
    ])
  })

  it('reset persists an explicit empty state without implicitly reseeding', () => {
    const repository = createStudioRepository(localStorage)

    repository.reset()

    expect(repository.listProducts()).toEqual([])
    expect(repository.listWorkItems('flora')).toEqual([])
    expect(repository.listVersions('flora')).toEqual([])
    expect(repository.listDocuments('flora')).toEqual([])
    expect(createStudioRepository(localStorage).listProducts()).toEqual([])
  })

  it('recovers corrupt JSON to seed data and rewrites a valid payload', () => {
    localStorage.setItem(STORAGE_KEY, '{corrupt')

    const repository = createStudioRepository(localStorage)

    expect(repository.listProducts()).toEqual(seedStudio.products)
    expect(() => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '')).not.toThrow()
  })

  it('recovers structurally damaged record arrays without throwing', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ products: [], workItems: [null], versions: [], documents: [] }),
    )

    const repository = createStudioRepository(localStorage)

    expect(() => repository.listWorkItems('flora')).not.toThrow()
    expect(repository.listProducts()).toEqual([])
  })

  it('drops records with missing required fields and rewrites cleaned data', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ products: [{ id: 'broken' }], workItems: [], versions: [], documents: [] }),
    )

    const repository = createStudioRepository(localStorage)

    expect(repository.listProducts()).toEqual([])
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '').products).toEqual([])
  })

  it.each(['July 1, 2026', '2026-02-30T00:00:00.000Z'])(
    'rejects a non-RFC3339 or impossible date: %s',
    (invalidDate) => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          ...seedStudio,
          products: [{ ...seedStudio.products[0], updatedAt: invalidDate }],
        }),
      )

      const repository = createStudioRepository(localStorage)

      expect(repository.listProducts()).toEqual([])
    },
  )

  it('keeps valid custom data when one document is damaged', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        products: [product],
        workItems: [],
        versions: [],
        documents: [document('valid', product.id), { id: 'broken', productId: product.id }],
      }),
    )

    const repository = createStudioRepository(localStorage)

    expect(repository.listProducts()).toEqual([product])
    expect(repository.listDocuments(product.id)).toEqual([document('valid', product.id)])
  })

  it.each([
    ['completion below zero', { completionPercent: -1 }],
    ['completion above one hundred', { completionPercent: 101 }],
    ['fractional completion', { completionPercent: 50.5 }],
    ['negative user count', { userCount: -1 }],
    ['fractional user count', { userCount: 1.5 }],
  ])('drops a product with invalid %s', (_case, override) => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        products: [{ ...product, ...override }],
        workItems: [],
        versions: [],
        documents: [],
      }),
    )

    expect(createStudioRepository(localStorage).listProducts()).toEqual([])
  })

  it('keeps completion and user count boundary values', () => {
    const zeroProduct = { ...product, id: 'zero', completionPercent: 0, userCount: 0 }
    const completeProduct = { ...product, id: 'complete', completionPercent: 100 }
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        products: [zeroProduct, completeProduct],
        workItems: [],
        versions: [],
        documents: [],
      }),
    )

    expect(createStudioRepository(localStorage).listProducts()).toEqual([
      zeroProduct,
      completeProduct,
    ])
  })

  it('drops orphan child records whose productId has no product', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        products: [product],
        workItems: [workItem('valid', product.id), workItem('orphan', 'missing')],
        versions: [version('valid', product.id), version('orphan', 'missing')],
        documents: [document('valid', product.id), document('orphan', 'missing')],
      }),
    )

    const repository = createStudioRepository(localStorage)

    expect(repository.listWorkItems('missing')).toEqual([])
    expect(repository.listVersions('missing')).toEqual([])
    expect(repository.listDocuments('missing')).toEqual([])
    expect(repository.listWorkItems(product.id)).toEqual([workItem('valid', product.id)])
  })

  it('returns the last-known-good snapshot when storage reads fail', () => {
    const storage = new FaultyStorage()
    const repository = createStudioRepository(storage)
    repository.listProducts()
    repository.saveProduct(product)
    storage.failReads = true

    expect(repository.listProducts()).toContainEqual(product)
  })

  it('uses a safe seed snapshot when the first storage read fails', () => {
    const storage = new FaultyStorage()
    storage.failReads = true

    expect(createStudioRepository(storage).listProducts()).toEqual(seedStudio.products)
  })

  it('returns a safe snapshot when corrupt-data recovery cannot be written', () => {
    const storage = new FaultyStorage()
    storage.data.set(STORAGE_KEY, '{corrupt')
    storage.failWrites = true

    expect(createStudioRepository(storage).listProducts()).toEqual(seedStudio.products)
  })

  it('throws a typed error and retains the snapshot when save persistence fails', () => {
    const storage = new FaultyStorage()
    const repository = createStudioRepository(storage)
    repository.listProducts()
    storage.failWrites = true

    expect(() => repository.saveProduct(product)).toThrowError(
      expect.objectContaining({ name: 'RepositoryError', code: 'PERSISTENCE_FAILED' }),
    )
    try {
      repository.saveProduct(product)
    } catch (error) {
      expect(error).toMatchObject({ code: 'PERSISTENCE_FAILED' })
    }
    storage.failReads = true
    expect(repository.listProducts()).not.toContainEqual(product)
  })

  it('throws a typed error and retains data when reset persistence fails', () => {
    const storage = new FaultyStorage()
    const repository = createStudioRepository(storage)
    repository.listProducts()
    storage.failWrites = true

    expect(() => repository.reset()).toThrowError(
      expect.objectContaining({ name: 'RepositoryError', code: 'PERSISTENCE_FAILED' }),
    )
    storage.failReads = true
    expect(repository.listProducts()).toEqual(seedStudio.products)
  })

  it.each([
    ['completionPercent', { completionPercent: 101 }],
    ['userCount', { userCount: -1 }],
  ])('rejects invalid saveProduct %s without writing or changing the snapshot', (_field, patch) => {
    const storage = new FaultyStorage()
    const repository = createStudioRepository(storage)
    repository.listProducts()
    const writesBeforeMutation = storage.writeAttempts
    const invalidProduct = { ...seedStudio.products[0], ...patch }

    expect(() => repository.saveProduct(invalidProduct)).toThrowError(
      expect.objectContaining({ name: 'RepositoryError', code: 'VALIDATION_FAILED' }),
    )
    expect(storage.writeAttempts).toBe(writesBeforeMutation)

    storage.failReads = true
    expect(repository.listProducts()).toEqual(seedStudio.products)
  })

  it('rejects orphan child mutations without writing or changing the snapshot', () => {
    const storage = new FaultyStorage()
    const repository = createStudioRepository(storage)
    repository.listProducts()
    const writesBeforeMutation = storage.writeAttempts

    for (const saveOrphan of [
      () => repository.saveWorkItem(workItem('orphan', 'missing')),
      () => repository.saveVersion(version('orphan', 'missing')),
      () => repository.saveDocument(document('orphan', 'missing')),
    ]) {
      expect(saveOrphan).toThrowError(
        expect.objectContaining({ name: 'RepositoryError', code: 'PRODUCT_NOT_FOUND' }),
      )
      expect(storage.writeAttempts).toBe(writesBeforeMutation)
    }

    storage.failReads = true
    expect(repository.listProducts()).toEqual(seedStudio.products)
    expect(repository.listWorkItems('missing')).toEqual([])
  })

  it('does not replace the snapshot from external storage when an orphan mutation fails', () => {
    const storage = new FaultyStorage()
    const repository = createStudioRepository(storage)
    repository.listProducts()
    repository.saveProduct(product)
    const expectedSnapshot = repository.listProducts()
    storage.data.set(STORAGE_KEY, JSON.stringify(seedStudio))
    const writesBeforeMutation = storage.writeAttempts

    expect(() => repository.saveWorkItem(workItem('orphan', 'missing'))).toThrowError(
      expect.objectContaining({ code: 'PRODUCT_NOT_FOUND' }),
    )
    expect(storage.writeAttempts).toBe(writesBeforeMutation)

    storage.failReads = true
    expect(repository.listProducts()).toEqual(expectedSnapshot)
  })

  it('persists valid upserts after rejecting an invalid mutation', () => {
    const storage = new FaultyStorage()
    const repository = createStudioRepository(storage)
    repository.listProducts()

    expect(() =>
      repository.saveProduct({ ...product, completionPercent: 101 }),
    ).toThrowError(expect.objectContaining({ code: 'VALIDATION_FAILED' }))

    repository.saveProduct(product)
    repository.saveWorkItem(workItem('valid-after-rejection', product.id))

    expect(repository.listProducts()).toContainEqual(product)
    expect(repository.listWorkItems(product.id)).toContainEqual(
      workItem('valid-after-rejection', product.id),
    )
  })
})
