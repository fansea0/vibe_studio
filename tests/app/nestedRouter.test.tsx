import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'

import App from '../../src/app/App'

const fetchMock = vi.fn()
beforeEach(() => { fetchMock.mockReset(); globalThis.fetch = fetchMock as unknown as typeof fetch })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('App router nesting', () => {
  it('renders App at /products without nested Router error', () => {
    fetchMock.mockImplementation(() => new Promise(() => {}))

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    expect(() => render(<App initialEntries={['/products']} />)).not.toThrow()

    const nestedRouterError = errorSpy.mock.calls.some((call) =>
      String(call[0]).includes('You cannot render a <Router> inside another <Router>'),
    )
    expect(nestedRouterError).toBe(false)

    errorSpy.mockRestore()
  })

  it('renders App at /showcase without nested Router error', () => {
    fetchMock.mockImplementation(() => new Promise(() => {}))

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    expect(() => render(<App initialEntries={['/showcase']} />)).not.toThrow()

    const nestedRouterError = errorSpy.mock.calls.some((call) =>
      String(call[0]).includes('You cannot render a <Router> inside another <Router>'),
    )
    expect(nestedRouterError).toBe(false)

    errorSpy.mockRestore()
  })
})