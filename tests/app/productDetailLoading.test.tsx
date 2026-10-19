import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

const fetchMock = vi.fn()
beforeEach(() => { fetchMock.mockReset(); globalThis.fetch = fetchMock as unknown as typeof fetch })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

const okJson = (data: unknown, status = 200) => Promise.resolve({ ok: status === 200, status, json: async () => ({ data }) } as Response)

describe('product detail loading state', () => {
  it('shows a loading state before the snapshot arrives instead of a false "not found"', async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => { release = resolve })
    fetchMock.mockImplementation((url: string | URL) => {
      const u = String(url)
      if (u.endsWith('/api/products')) return gate.then(() => okJson([{ product: { id: '1', name: 'Flora', description: '', icon: '🌿', status: 'beta', userCount: 10, appUrl: null, repositoryPath: '', archivedAt: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' } }]))
      return okJson([])
    })

    const { StudioApp } = await import('../../src/app/App')
    render(<StudioApp initialEntries={['/products/1']} />)

    expect(screen.getByRole('heading', { name: '正在加载产品' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '产品不存在' })).not.toBeInTheDocument()

    release?.()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Flora' })).toBeInTheDocument())
  })
})
