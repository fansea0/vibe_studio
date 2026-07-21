import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

const fetchMock = vi.fn()
beforeEach(() => { fetchMock.mockReset(); globalThis.fetch = fetchMock as unknown as typeof fetch })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

const okJson = (data: unknown, status = 200) => Promise.resolve({ ok: status === 200, status, json: async () => ({ data }) } as Response)

describe('ShowcaseApp routing', () => {
  it('renders Hero on /showcase with profile data', async () => {
    fetchMock.mockImplementation((url: string | URL) => {
      const u = String(url)
      if (u.endsWith('/api/showcase/profile')) return okJson({ displayName: 'Ada', tagline: 'hi', avatarUrl: null, statusLine: 'now', statusPillText: 'open', aboutParagraphs: [], contactEmail: 'a@b.c', socialLinks: [] })
      if (u.endsWith('/api/showcase/products')) return okJson([])
      return okJson({})
    })
    const { ShowcaseApp } = await import('../../src/app/showcase/ShowcaseApp')
    render(<ShowcaseApp initialEntries={['/showcase']} />)
    await waitFor(() => expect(screen.getByText('Ada')).toBeInTheDocument())
    expect(screen.getByText('hi')).toBeInTheDocument()
  })

  it('renders 404 for unknown product id', async () => {
    fetchMock.mockImplementation((url: string | URL) => {
      const u = String(url)
      if (u.includes('/api/showcase/products/')) return okJson({}, 404)
      return okJson({})
    })
    const { ShowcaseApp } = await import('../../src/app/showcase/ShowcaseApp')
    render(<ShowcaseApp initialEntries={['/showcase/missing-id']} />)
    await waitFor(() => expect(screen.getByText(/作品未公开或不存在/)).toBeInTheDocument())
  })

  it('renders product detail when found', async () => {
    fetchMock.mockImplementation((url: string | URL) => {
      const u = String(url)
      if (u.endsWith('/api/showcase/products/p1')) return okJson({ id: 'p1', name: 'Flora', description: 'A plant app', icon: '🌿', status: 'beta', currentVersion: 'v1.0', userCount: 100, appUrl: 'https://flora.example', updatedAt: '2026-01-01' })
      if (u.includes('/api/products/') && u.includes('/commits')) return okJson({ items: [], checkedAt: '2026-01-01' })
      return okJson({})
    })
    const { ShowcaseApp } = await import('../../src/app/showcase/ShowcaseApp')
    render(<ShowcaseApp initialEntries={['/showcase/p1']} />)
    await waitFor(() => expect(screen.getAllByText('Flora').length).toBeGreaterThan(0))
    expect(screen.getByText('A plant app')).toBeInTheDocument()
  })
})