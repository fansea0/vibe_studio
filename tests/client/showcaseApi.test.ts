import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchShowcaseProfile, fetchShowcaseProducts, fetchShowcaseProduct } from '../../src/client/api'

const fetchMock = vi.fn()
beforeEach(() => { fetchMock.mockReset(); globalThis.fetch = fetchMock as unknown as typeof fetch })
afterEach(() => { vi.restoreAllMocks() })

const okJson = (data: unknown, status = 200) => Promise.resolve({ ok: status === 200, status, json: async () => ({ data }) } as Response)

describe('showcase API client', () => {
  it('fetchShowcaseProfile unwraps data envelope and returns ShowcaseProfile', async () => {
    const profile = { displayName: 'Ada', tagline: 'hi', avatarUrl: null, statusLine: 'now', statusPillText: 'open', aboutParagraphs: [], contactEmail: 'a@b.c', socialLinks: [] }
    fetchMock.mockImplementationOnce(() => okJson(profile))
    const result = await fetchShowcaseProfile()
    expect(result).toEqual(profile)
    expect(fetchMock).toHaveBeenCalledWith('/api/showcase/profile', expect.objectContaining({ headers: expect.any(Object) }))
  })

  it('fetchShowcaseProducts returns array of PublicProduct', async () => {
    const products = [{ id: 'p1', name: 'Flora', description: 'plant', icon: '🌿', status: 'beta', currentVersion: 'v1.0', userCount: 100, appUrl: null, updatedAt: '2026-01-01' }]
    fetchMock.mockImplementationOnce(() => okJson(products))
    const result = await fetchShowcaseProducts()
    expect(result).toEqual(products)
    expect(result).toHaveLength(1)
  })

  it('fetchShowcaseProduct returns single PublicProduct', async () => {
    const product = { id: 'p1', name: 'Flora', description: 'plant', icon: '🌿', status: 'beta', currentVersion: 'v1.0', userCount: 100, appUrl: null, updatedAt: '2026-01-01' }
    fetchMock.mockImplementationOnce(() => okJson(product))
    const result = await fetchShowcaseProduct('p1')
    expect(result).toEqual(product)
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/api/showcase/products/p1')
  })

  it('fetchShowcaseProduct encodes special characters in id', async () => {
    fetchMock.mockImplementationOnce(() => okJson({}))
    await fetchShowcaseProduct('a/b c')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/showcase/products/a%2Fb%20c')
  })

  it('fetchShowcaseProfile throws ApiError on non-2xx', async () => {
    fetchMock.mockImplementationOnce(() => Promise.resolve({ ok: false, status: 503, json: async () => ({ error: { code: 'PROFILE_UNAVAILABLE', message: '展示页配置缺失' } }) } as Response))
    await expect(fetchShowcaseProfile()).rejects.toThrow('展示页配置缺失')
  })
})