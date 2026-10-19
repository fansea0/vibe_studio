import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

const fetchMock = vi.fn()
beforeEach(() => { fetchMock.mockReset(); globalThis.fetch = fetchMock as unknown as typeof fetch })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

const okJson = (data: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => ({ data }) } as Response)

const publicProduct = { id: 'p1', name: 'Flora', description: 'A plant app', icon: '🌿', status: 'beta', currentVersion: '1.0.0', userCount: 100, appUrl: null, updatedAt: '2026-01-01' }

describe('works section reveal', () => {
  it('shows cards even when IntersectionObserver never fires', async () => {
    // 观察器存在但从不回调，模拟后台标签页 / 无头环境
    const observe = vi.fn()
    const unobserve = vi.fn()
    const disconnect = vi.fn()
    vi.stubGlobal('IntersectionObserver', class {
      constructor(_cb: unknown, _options?: unknown) {}
      observe = observe
      unobserve = unobserve
      disconnect = disconnect
    })
    fetchMock.mockImplementation((url: string | URL) => {
      const u = String(url)
      if (u.endsWith('/api/showcase/products')) return okJson([publicProduct])
      return okJson([])
    })

    const { WorksSection } = await import('../../src/app/showcase/WorksSection')
    const { container } = render(<MemoryRouter><WorksSection /></MemoryRouter>)

    await waitFor(() => expect(screen.getByText('Flora')).toBeInTheDocument())

    // 兜底定时器触发后，卡片必须可见
    await waitFor(() => {
      const card = container.querySelector('.showcase-card')
      expect(card).toHaveClass('is-revealed')
    }, { timeout: 4000 })

    vi.unstubAllGlobals()
  })

  it('keeps cards visible when IntersectionObserver is unsupported', async () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    fetchMock.mockImplementation((url: string | URL) => {
      const u = String(url)
      if (u.endsWith('/api/showcase/products')) return okJson([publicProduct])
      return okJson([])
    })

    const { WorksSection } = await import('../../src/app/showcase/WorksSection')
    const { container } = render(<MemoryRouter><WorksSection /></MemoryRouter>)

    await waitFor(() => expect(screen.getByText('Flora')).toBeInTheDocument())
    expect(container.querySelector('.showcase-grid')).not.toHaveClass('is-animated')

    vi.unstubAllGlobals()
  })
})
