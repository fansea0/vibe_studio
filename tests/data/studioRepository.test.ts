import { beforeEach, describe, expect, it } from 'vitest'

import type { MarkdownDocument, Product, ProductVersion, WorkItem } from '../../src/domain/models'
import { seedStudio } from '../../src/data/seedStudio'
import { createStudioRepository } from '../../src/data/studioRepository'

const STORAGE_KEY = 'vibe-studio:v1'
const flushMutations = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
}

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
  repositoryPath: '',
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
  name: `Document-${id}.md`,
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

  it('starts from the Studio seed and round-trips products', async () => {
    const repository = createStudioRepository(localStorage)

    expect(repository.listProducts()).toEqual(seedStudio.products)

    await repository.saveProduct(product, { expectedUpdatedAt: null })

    expect(repository.listProducts()).toContainEqual(expect.objectContaining({ id: product.id, name: product.name }))
  })

  it('isolates every child record collection by productId', async () => {
    const repository = createStudioRepository(localStorage)
    await repository.saveWorkItem(workItem('item-a', 'flora'))
    await repository.saveWorkItem(workItem('item-b', 'resume-genius'))
    await repository.saveVersion(version('version-a', 'flora'))
    await repository.saveVersion(version('version-b', 'resume-genius'))
    await repository.saveDocument(document('document-a', 'flora'), { expectedUpdatedAt: null })
    await repository.saveDocument(document('document-b', 'resume-genius'), { expectedUpdatedAt: null })

    expect(repository.listWorkItems('flora').map(({ id }) => id)).toContain('item-a')
    expect(repository.listVersions('flora').map(({ id }) => id)).toContain('version-a')
    expect(repository.listDocuments('flora').map(({ id }) => id)).toContain('document-a')
  })

  it('keeps child records with the same id when their productId differs', async () => {
    const repository = createStudioRepository(localStorage)

    await repository.saveWorkItem(workItem('shared', 'flora'))
    await repository.saveWorkItem(workItem('shared', 'resume-genius'))
    await repository.saveVersion(version('shared', 'flora'))
    await repository.saveVersion(version('shared', 'resume-genius'))
    await repository.saveDocument(document('shared', 'flora'), { expectedUpdatedAt: null })
    await repository.saveDocument(document('shared', 'resume-genius'), { expectedUpdatedAt: null })

    expect(repository.listWorkItems('flora')).toContainEqual(workItem('shared', 'flora'))
    expect(repository.listWorkItems('resume-genius')).toContainEqual(
      workItem('shared', 'resume-genius'),
    )
    expect(repository.listVersions('flora')).toContainEqual(version('shared', 'flora'))
    expect(repository.listVersions('resume-genius')).toContainEqual(
      version('shared', 'resume-genius'),
    )
    expect(repository.listDocuments('flora')).toContainEqual(expect.objectContaining({ id: 'shared' }))
    expect(repository.listDocuments('resume-genius')).toContainEqual(expect.objectContaining({ id: 'shared' }))
  })

  it('updates records with the same id instead of appending duplicates', async () => {
    const repository = createStudioRepository(localStorage)
    await repository.saveProduct(product, { expectedUpdatedAt: null })
    const storedProduct = repository.listProducts().find(({ id }) => id === product.id)!
    await repository.saveProduct({ ...product, name: 'Renamed Product' }, { expectedUpdatedAt: storedProduct.updatedAt })
    await repository.saveWorkItem(workItem('item-a', product.id))
    await repository.saveWorkItem({ ...workItem('item-a', product.id), title: 'Updated item' })

    expect(repository.listProducts().filter(({ id }) => id === product.id)).toEqual([
      expect.objectContaining({ name: 'Renamed Product' }),
    ])
    expect(repository.listWorkItems(product.id)).toEqual([
      expect.objectContaining({ id: 'item-a', title: 'Updated item' }),
    ])
  })

  it('reset persists an explicit empty state without implicitly reseeding', async () => {
    const repository = createStudioRepository(localStorage)

    await repository.reset()

    expect(repository.listProducts()).toEqual([])
    expect(repository.listWorkItems('flora')).toEqual([])
    expect(repository.listVersions('flora')).toEqual([])
    expect(repository.listDocuments('flora')).toEqual([])
    expect(createStudioRepository(localStorage).listProducts()).toEqual([])
  })

  it('recovers corrupt JSON to seed data and rewrites a valid payload', async () => {
    localStorage.setItem(STORAGE_KEY, '{corrupt')

    const repository = createStudioRepository(localStorage)

    expect(repository.listProducts()).toEqual(seedStudio.products)
    await flushMutations()
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

  it('drops records with missing required fields and rewrites cleaned data', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ products: [{ id: 'broken' }], workItems: [], versions: [], documents: [] }),
    )

    const repository = createStudioRepository(localStorage)

    expect(repository.listProducts()).toEqual([])
    await flushMutations()
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '').products).toEqual([])
  })

  it('drops persisted entities with empty ids, product ids, or product names', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      products: [product, { ...product, id: '' }, { ...product, id: 'blank-name', name: '   ' }],
      workItems: [workItem('valid-item', product.id), workItem('', product.id), workItem('blank-product', '')],
      versions: [version('valid-version', product.id), version('', product.id), version('blank-product', '')],
      documents: [document('valid-document', product.id), document('', product.id), document('blank-product', '')],
    }))

    const snapshot = createStudioRepository(localStorage).readSnapshot()

    expect(snapshot.products).toEqual([product])
    expect(snapshot.workItems).toEqual([workItem('valid-item', product.id)])
    expect(snapshot.versions).toEqual([version('valid-version', product.id)])
    expect(snapshot.documents).toEqual([document('valid-document', product.id)])
  })

  it('rejects mutations with empty entity ids, product ids, or product names', async () => {
    const repository = createStudioRepository(localStorage)

    await expect(repository.saveProduct({ ...product, id: '' }, { expectedUpdatedAt: null }))
      .rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    await expect(repository.saveProduct({ ...product, name: '   ' }, { expectedUpdatedAt: null }))
      .rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    await expect(repository.saveWorkItem(workItem('', 'flora')))
      .rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    await expect(repository.saveWorkItem(workItem('item', '')))
      .rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    await expect(repository.saveVersion(version('', 'flora')))
      .rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    await expect(repository.saveVersion(version('version', '')))
      .rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    await expect(repository.saveDocument(document('', 'flora'), { expectedUpdatedAt: null }))
      .rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    await expect(repository.saveDocument(document('document', ''), { expectedUpdatedAt: null }))
      .rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
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
    ['missing Markdown extension', { name: 'guide.txt' }],
    ['empty name', { name: '' }],
    ['non-string name', { name: null }],
    ['non-string content', { content: null }],
  ])('rejects invalid saveDocument data: %s', async (_case, patch) => {
    const storage = new FaultyStorage()
    const repository = createStudioRepository(storage)
    repository.listDocuments('flora')
    const writesBeforeMutation = storage.writeAttempts

    await expect(repository.saveDocument({
      ...document('invalid', 'flora'),
      ...patch,
    } as MarkdownDocument, { expectedUpdatedAt: null })).rejects.toMatchObject({
      name: 'RepositoryError',
      code: 'VALIDATION_FAILED',
    })
    expect(storage.writeAttempts).toBe(writesBeforeMutation)
  })

  it('salvages valid documents when external storage contains invalid document payloads', async () => {
    const valid = document('valid-markdown', product.id)
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      products: [product],
      workItems: [],
      versions: [],
      documents: [
        valid,
        { ...document('bad-extension', product.id), name: 'notes.txt' },
        { ...document('empty-name', product.id), name: '' },
        { ...document('bad-content', product.id), content: 42 },
      ],
    }))

    const repository = createStudioRepository(localStorage)

    expect(repository.listDocuments(product.id)).toEqual([valid])
    await flushMutations()
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '').documents).toEqual([valid])
    expect(repository.listProducts()).toEqual([product])
  })

  it('drops oversized and inverted-lifecycle external documents while canonicalizing valid names', async () => {
    const canonical = { ...document('canonical', product.id), name: ' cafe\u0301.md ' }
    const oversized = { ...document('oversized', product.id), content: '你'.repeat(200_000) }
    const inverted = {
      ...document('inverted', product.id),
      createdAt: '2026-07-03T00:00:00.000Z',
      updatedAt: '2026-07-02T00:00:00.000Z',
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      products: [product], workItems: [], versions: [], documents: [canonical, oversized, inverted],
    }))

    const repository = createStudioRepository(localStorage)

    expect(repository.listDocuments(product.id)).toEqual([
      expect.objectContaining({ id: 'canonical', name: 'café.md' }),
    ])
    await flushMutations()
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '').documents).toEqual([
      expect.objectContaining({ id: 'canonical', name: 'café.md' }),
    ])
  })

  it('rejects oversized UTF-8 document content without persisting', async () => {
    const repository = createStudioRepository(localStorage)

    await expect(repository.saveDocument(
      { ...document('oversized-save', 'flora'), content: '你'.repeat(200_000) },
      { expectedUpdatedAt: null },
    )).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    expect(repository.listDocuments('flora')).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'oversized-save' }),
    ]))
  })

  it('requires create and update document tokens to match repository state', async () => {
    const repository = createStudioRepository(localStorage)
    const original = document('token-state', 'flora')
    await repository.saveDocument(original, { expectedUpdatedAt: null })
    const stored = repository.listDocuments('flora').find(({ id }) => id === original.id)!

    await expect(repository.saveDocument(original, { expectedUpdatedAt: null }))
      .rejects.toMatchObject({ code: 'DOCUMENT_CONFLICT' })
    await expect(repository.saveDocument(
      { ...original, id: 'missing-update' },
      { expectedUpdatedAt: stored.updatedAt },
    )).rejects.toMatchObject({ code: 'DOCUMENT_CONFLICT' })
  })

  it('rejects a case-insensitive duplicate document name from the latest storage snapshot', async () => {
    const firstRepository = createStudioRepository(localStorage)
    const staleRepository = createStudioRepository(localStorage)
    firstRepository.listDocuments('flora')
    staleRepository.listDocuments('flora')

    await firstRepository.saveDocument({ ...document('first-guide', 'flora'), name: 'guide.md' }, { expectedUpdatedAt: null })

    await expect(staleRepository.saveDocument({
      ...document('stale-guide', 'flora'),
      name: ' GUIDE.MD ',
    }, { expectedUpdatedAt: null })).rejects.toMatchObject({
      name: 'RepositoryError',
      code: 'DUPLICATE_DOCUMENT',
      message: expect.stringContaining('GUIDE.MD'),
    })
    expect(firstRepository.listDocuments('flora').filter(
      ({ name }) => name.toLocaleLowerCase() === 'guide.md',
    )).toHaveLength(1)
  })

  it('rejects a stale duplicate copy name', async () => {
    const firstRepository = createStudioRepository(localStorage)
    const staleRepository = createStudioRepository(localStorage)

    await firstRepository.saveDocument({
      ...document('first-copy', 'flora'),
      name: 'guide-副本.md',
    }, { expectedUpdatedAt: null })

    await expect(staleRepository.saveDocument({
      ...document('stale-copy', 'flora'),
      name: 'GUIDE-副本.md',
    }, { expectedUpdatedAt: null })).rejects.toMatchObject({ code: 'DUPLICATE_DOCUMENT' })
  })

  it('allows overwriting the same document id without treating its name as a duplicate', async () => {
    const repository = createStudioRepository(localStorage)
    const original = { ...document('same-document', 'flora'), name: 'guide.md' }
    await repository.saveDocument(original, { expectedUpdatedAt: null })
    const storedOriginal = repository.listDocuments('flora').find(({ id }) => id === original.id)!

    await expect(repository.saveDocument({
      ...original,
      name: ' GUIDE.MD ',
      content: '# Updated',
      updatedAt: '2026-07-02T00:00:00.000Z',
    }, { expectedUpdatedAt: storedOriginal.updatedAt })).resolves.toBeUndefined()
    expect(repository.listDocuments('flora').filter(({ id }) => id === original.id)).toEqual([
      expect.objectContaining({ name: 'GUIDE.MD', content: '# Updated' }),
    ])
  })

  it('allows the same normalized document name in different products', async () => {
    const repository = createStudioRepository(localStorage)

    await repository.saveDocument({ ...document('flora-guide', 'flora'), name: 'guide.md' }, { expectedUpdatedAt: null })

    await expect(repository.saveDocument({
      ...document('resume-guide', 'resume-genius'),
      name: ' GUIDE.MD ',
    }, { expectedUpdatedAt: null })).resolves.toBeUndefined()
    expect(repository.listDocuments('flora')).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'guide.md' }),
    ]))
    expect(repository.listDocuments('resume-genius')).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'GUIDE.MD' }),
    ]))
  })

  it('salvages duplicate external names per product by keeping the latest updated document', async () => {
    const older = {
      ...document('older-guide', product.id),
      name: 'guide.md',
      updatedAt: '2026-07-02T00:30:00+14:00',
    }
    const latest = {
      ...document('latest-guide', product.id),
      name: ' GUIDE.MD '.trim(),
      updatedAt: '2026-07-01T23:00:00.000Z',
    }
    const otherProduct = { ...product, id: 'other-product', name: 'Other Product' }
    const crossProduct = {
      ...document('cross-product-guide', otherProduct.id),
      name: 'Guide.md',
      updatedAt: '2026-07-02T00:00:00.000Z',
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      products: [product, otherProduct],
      workItems: [],
      versions: [],
      documents: [older, crossProduct, latest],
    }))

    const repository = createStudioRepository(localStorage)

    expect(repository.listDocuments(product.id)).toEqual([latest])
    expect(repository.listDocuments(otherProduct.id)).toEqual([crossProduct])
    await flushMutations()
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '').documents).toEqual([
      crossProduct,
      latest,
    ])
  })

  it('salvages duplicate document ids per product by keeping the actual latest update', () => {
    const older = { ...document('shared-id', product.id), name: 'older.md', updatedAt: '2026-07-02T00:30:00+14:00' }
    const latest = { ...document('shared-id', product.id), name: 'latest.md', updatedAt: '2026-07-01T23:00:00.000Z' }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      products: [product], workItems: [], versions: [], documents: [older, latest],
    }))

    const repository = createStudioRepository(localStorage)

    expect(repository.listDocuments(product.id)).toEqual([latest])
  })

  it('returns a deep-cloned validated snapshot', () => {
    const repository = createStudioRepository(localStorage)
    const first = repository.readSnapshot()
    first.products[0]!.name = 'Mutated outside repository'

    expect(repository.readSnapshot().products[0]!.name).not.toBe('Mutated outside repository')
  })

  it('does not collide product ids and document names containing colons during salvage', () => {
    const productA = { ...product, id: 'a', name: 'Product A' }
    const productAB = { ...product, id: 'a:b', name: 'Product AB' }
    const documentA = { ...document('colon-name', productA.id), name: 'b:c.md' }
    const documentAB = { ...document('colon-product', productAB.id), name: 'c.md' }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      products: [productA, productAB],
      workItems: [],
      versions: [],
      documents: [documentA, documentAB],
    }))

    const repository = createStudioRepository(localStorage)

    expect(repository.listDocuments(productA.id)).toEqual([documentA])
    expect(repository.listDocuments(productAB.id)).toEqual([documentAB])
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '').documents).toEqual([
      documentA,
      documentAB,
    ])
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

  it('returns the last-known-good snapshot when storage reads fail', async () => {
    const storage = new FaultyStorage()
    const repository = createStudioRepository(storage)
    repository.listProducts()
    await repository.saveProduct(product, { expectedUpdatedAt: null })
    storage.failReads = true

    expect(repository.listProducts()).toContainEqual(expect.objectContaining({ id: product.id, name: product.name }))
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

  it('throws a typed error and retains the snapshot when save persistence fails', async () => {
    const storage = new FaultyStorage()
    const repository = createStudioRepository(storage)
    repository.listProducts()
    storage.failWrites = true

    await expect(repository.saveProduct(product, { expectedUpdatedAt: null })).rejects.toMatchObject({ name: 'RepositoryError', code: 'PERSISTENCE_FAILED' })
    storage.failReads = true
    expect(repository.listProducts()).not.toContainEqual(product)
  })

  it('throws a typed error and retains data when reset persistence fails', async () => {
    const storage = new FaultyStorage()
    const repository = createStudioRepository(storage)
    repository.listProducts()
    storage.failWrites = true

    await expect(repository.reset()).rejects.toMatchObject({ name: 'RepositoryError', code: 'PERSISTENCE_FAILED' })
    storage.failReads = true
    expect(repository.listProducts()).toEqual(seedStudio.products)
  })

  it.each([
    ['completionPercent', { completionPercent: 101 }],
    ['userCount', { userCount: -1 }],
  ])('rejects invalid saveProduct %s without writing or changing the snapshot', async (_field, patch) => {
    const storage = new FaultyStorage()
    const repository = createStudioRepository(storage)
    repository.listProducts()
    const writesBeforeMutation = storage.writeAttempts
    const invalidProduct = { ...seedStudio.products[0], ...patch }

    await expect(repository.saveProduct(invalidProduct, { expectedUpdatedAt: invalidProduct.updatedAt })).rejects.toMatchObject({ name: 'RepositoryError', code: 'VALIDATION_FAILED' })
    expect(storage.writeAttempts).toBe(writesBeforeMutation)

    storage.failReads = true
    expect(repository.listProducts()).toEqual(seedStudio.products)
  })

  it('rejects orphan child mutations without writing or changing the snapshot', async () => {
    const storage = new FaultyStorage()
    const repository = createStudioRepository(storage)
    repository.listProducts()
    const writesBeforeMutation = storage.writeAttempts

    for (const saveOrphan of [
      () => repository.saveWorkItem(workItem('orphan', 'missing')),
      () => repository.saveVersion(version('orphan', 'missing')),
    ]) {
      await expect(saveOrphan()).rejects.toMatchObject({ name: 'RepositoryError', code: 'PRODUCT_NOT_FOUND' })
      expect(storage.writeAttempts).toBe(writesBeforeMutation)
    }
    await expect(repository.saveDocument(document('orphan', 'missing'), { expectedUpdatedAt: null })).rejects.toMatchObject({
      name: 'RepositoryError', code: 'PRODUCT_NOT_FOUND',
    })
    expect(storage.writeAttempts).toBe(writesBeforeMutation)

    storage.failReads = true
    expect(repository.listProducts()).toEqual(seedStudio.products)
    expect(repository.listWorkItems('missing')).toEqual([])
  })

  it('does not replace the snapshot from external storage when an orphan mutation fails', async () => {
    const storage = new FaultyStorage()
    const repository = createStudioRepository(storage)
    repository.listProducts()
    await repository.saveProduct(product, { expectedUpdatedAt: null })
    const expectedSnapshot = repository.listProducts()
    storage.data.set(STORAGE_KEY, JSON.stringify(seedStudio))
    const writesBeforeMutation = storage.writeAttempts

    await expect(repository.saveWorkItem(workItem('orphan', 'missing'))).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' })
    expect(storage.writeAttempts).toBe(writesBeforeMutation)

    storage.failReads = true
    expect(repository.listProducts()).toEqual(expectedSnapshot)
  })

  it('persists valid upserts after rejecting an invalid mutation', async () => {
    const storage = new FaultyStorage()
    const repository = createStudioRepository(storage)
    repository.listProducts()

    await expect(repository.saveProduct({ ...product, completionPercent: 101 }, { expectedUpdatedAt: null })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })

    await repository.saveProduct(product, { expectedUpdatedAt: null })
    await repository.saveWorkItem(workItem('valid-after-rejection', product.id))

    expect(repository.listProducts()).toContainEqual(expect.objectContaining({ id: product.id, name: product.name }))
    expect(repository.listWorkItems(product.id)).toContainEqual(
      workItem('valid-after-rejection', product.id),
    )
  })

  it('rejects a duplicate normalized version number from the latest storage snapshot', async () => {
    const firstRepository = createStudioRepository(localStorage)
    const staleRepository = createStudioRepository(localStorage)
    firstRepository.listVersions('flora')
    staleRepository.listVersions('flora')
    await firstRepository.saveVersion({ ...version('external-version', 'flora'), number: '2.0.0' })

    await expect(staleRepository.saveVersion({
      ...version('stale-version', 'flora'),
      number: ' 2.0.0 ',
    })).rejects.toMatchObject({
      name: 'RepositoryError',
      code: 'DUPLICATE_VERSION',
      message: expect.stringContaining('2.0.0'),
    })
    expect(firstRepository.listVersions('flora').filter(({ number }) => number === '2.0.0'))
      .toHaveLength(1)
  })

  it('allows updating the same version id without treating it as a duplicate', async () => {
    const repository = createStudioRepository(localStorage)
    await repository.saveVersion({ ...version('same-version', 'flora'), number: '2.0.0' })

    await expect(repository.saveVersion({
      ...version('same-version', 'flora'),
      number: ' 2.0.0 ',
      notes: 'Updated notes',
    })).resolves.toBeUndefined()
    expect(repository.listVersions('flora').filter(({ id }) => id === 'same-version')).toEqual([
      expect.objectContaining({ number: '2.0.0', notes: 'Updated notes' }),
    ])
  })

  it.each([
    ['planned with a release date', { status: 'planned', releasedAt: '2026-07-13T00:00:00.000Z' }],
    ['released without a release date', { status: 'released', releasedAt: null }],
    ['released with an invalid date', { status: 'released', releasedAt: '2026-02-30T00:00:00.000Z' }],
  ] as const)('rejects saveVersion when %s', async (_case, patch) => {
    const storage = new FaultyStorage()
    const repository = createStudioRepository(storage)
    repository.listVersions('flora')
    const writesBeforeMutation = storage.writeAttempts

    await expect(repository.saveVersion({
      ...version('invalid-release-state', 'flora'),
      ...patch,
    })).rejects.toMatchObject({
      name: 'RepositoryError',
      code: 'VALIDATION_FAILED',
    })
    expect(storage.writeAttempts).toBe(writesBeforeMutation)
    expect(repository.listVersions('flora')).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'invalid-release-state' }),
    ]))
  })

  it('drops externally stored versions with contradictory release state without harming valid versions', async () => {
    const validPlanned = { ...version('valid-planned', product.id), number: '1.0.0' }
    const validReleased = {
      ...version('valid-released', product.id),
      number: '1.1.0',
      status: 'released' as const,
      releasedAt: '2026-07-13T00:00:00.000Z',
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      products: [product],
      workItems: [],
      versions: [
        validPlanned,
        validReleased,
        { ...version('bad-planned', product.id), number: 'bad-a', releasedAt: '2026-07-13T00:00:00.000Z' },
        { ...version('bad-released', product.id), number: 'bad-b', status: 'released', releasedAt: null },
        { ...version('bad-date', product.id), number: 'bad-c', status: 'released', releasedAt: '2026-02-30T00:00:00.000Z' },
      ],
      documents: [],
    }))

    const repository = createStudioRepository(localStorage)

    expect(repository.listVersions(product.id)).toEqual([validPlanned, validReleased])
    await flushMutations()
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '').versions).toEqual([
      validPlanned,
      validReleased,
    ])
  })
})
