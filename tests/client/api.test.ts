import { describe, expect, it, vi } from 'vitest'
import { fetchSnapshot, updateProduct } from '../../src/client/api'

describe('SQLite API client', () => {
  it('loads products and their child collections', async () => {
    const product = { id: 'flora', name: 'Flora', repositoryPath: '', status: 'developing', userCount: 0, description: '', icon: '🌿', appUrl: null, archivedAt: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url === '/api/products' ? { data: [{ product }] } : { data: [] }), { status: 200, headers: { 'content-type': 'application/json' } })))
    await expect(fetchSnapshot()).resolves.toMatchObject({ products: [product], workItems: [], versions: [], documents: [] })
    expect(fetch).toHaveBeenCalledWith('/api/products/flora/work-items', expect.any(Object))
  })

  it('surfaces structured API errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { code: 'CONFLICT', message: 'stale' } }), { status: 409 })))
    await expect(updateProduct({ id: 'x' } as never, 'old')).rejects.toMatchObject({ code: 'CONFLICT', status: 409, message: 'stale' })
  })
})
