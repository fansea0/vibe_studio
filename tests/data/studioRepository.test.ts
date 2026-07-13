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
    repository.saveWorkItem(workItem('item-a', 'product-a'))
    repository.saveWorkItem(workItem('item-b', 'product-b'))
    repository.saveVersion(version('version-a', 'product-a'))
    repository.saveVersion(version('version-b', 'product-b'))
    repository.saveDocument(document('document-a', 'product-a'))
    repository.saveDocument(document('document-b', 'product-b'))

    expect(repository.listWorkItems('product-a').map(({ id }) => id)).toEqual(['item-a'])
    expect(repository.listVersions('product-a').map(({ id }) => id)).toEqual(['version-a'])
    expect(repository.listDocuments('product-a').map(({ id }) => id)).toEqual(['document-a'])
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
    expect(repository.listProducts()).toEqual(seedStudio.products)
  })

  it('rejects records with missing required fields and rewrites seed data', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ products: [{ id: 'broken' }], workItems: [], versions: [], documents: [] }),
    )

    const repository = createStudioRepository(localStorage)

    expect(repository.listProducts()).toEqual(seedStudio.products)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '').products).toEqual(seedStudio.products)
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

      expect(repository.listProducts()).toEqual(seedStudio.products)
    },
  )
})
