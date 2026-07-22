import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { ProductShowcaseFrame } from '../../src/app/showcase/ProductShowcaseFrame'
import type { PublicProduct } from '../../src/domain/models'

const baseProduct: PublicProduct = {
  id: 'flora',
  name: 'Flora',
  description: 'plant app',
  icon: '🌿',
  status: 'beta',
  currentVersion: 'v1.0',
  userCount: 100,
  appUrl: 'https://flora.example',
  updatedAt: '2026-01-01',
  showcasePagePath: 'data/products/flora/showcase.html',
}

describe('ProductShowcaseFrame', () => {
  beforeEach(() => { Object.defineProperty(window, 'location', { value: { origin: 'http://localhost' }, writable: true }) })
  afterEach(() => { cleanup(); vi.restoreAllMocks() })

  it('renders iframe with the correct src when showcasePagePath is set', () => {
    const { container } = render(<ProductShowcaseFrame product={baseProduct} />)
    const iframe = container.querySelector('iframe')
    expect(iframe).not.toBeNull()
    expect(iframe?.getAttribute('src')).toBe('/api/showcase/pages/flora')
  })

  it('renders iframe with sandbox="allow-scripts" (no allow-same-origin)', () => {
    const { container } = render(<ProductShowcaseFrame product={baseProduct} />)
    const iframe = container.querySelector('iframe')
    const sandbox = iframe?.getAttribute('sandbox') ?? ''
    expect(sandbox).toContain('allow-scripts')
    expect(sandbox).not.toContain('allow-same-origin')
  })

  it('returns null when showcasePagePath is empty', () => {
    const { container } = render(<ProductShowcaseFrame product={{ ...baseProduct, showcasePagePath: '' }} />)
    expect(container.querySelector('iframe')).toBeNull()
  })

  it('encodes productId in the iframe src', () => {
    const { container } = render(<ProductShowcaseFrame product={{ ...baseProduct, id: 'a/b c' }} />)
    const iframe = container.querySelector('iframe')
    expect(iframe?.getAttribute('src')).toBe('/api/showcase/pages/a%2Fb%20c')
  })

  it('listens for vibe-studio:open-url messages and opens the URL', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    render(<ProductShowcaseFrame product={baseProduct} />)
    const event = new MessageEvent('message', {
      origin: 'http://localhost',
      data: { type: 'vibe-studio:open-url', url: 'https://example.com' },
    })
    window.dispatchEvent(event)
    expect(openSpy).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer')
  })

  it('ignores messages from foreign origins', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    render(<ProductShowcaseFrame product={baseProduct} />)
    const event = new MessageEvent('message', {
      origin: 'https://evil.example',
      data: { type: 'vibe-studio:open-url', url: 'https://example.com' },
    })
    window.dispatchEvent(event)
    expect(openSpy).not.toHaveBeenCalled()
  })
})
