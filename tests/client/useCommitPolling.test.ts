import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCommitPolling } from '../../src/client/useCommitPolling'

describe('useCommitPolling', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { items: [{ sha: 'abc', shortSha: 'abc', author: 'A', committedAt: '2026-01-01T00:00:00Z', subject: 'fix' }], checkedAt: '2026-01-01T00:00:01Z' } }) })) })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
  it('loads immediately and once per minute', async () => {
    const { result, unmount } = renderHook(() => useCommitPolling('p1'))
    await act(async () => { await Promise.resolve() })
    expect(result.current.commits[0].subject).toBe('fix')
    expect(fetch).toHaveBeenCalledTimes(1)
    await act(async () => { vi.advanceTimersByTime(60_000); await Promise.resolve() })
    expect(fetch).toHaveBeenCalledTimes(2)
    unmount()
    await act(async () => { vi.advanceTimersByTime(60_000) })
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('does not overlap an in-flight request', async () => {
    let resolve: ((value: Response) => void) | undefined
    vi.mocked(fetch).mockImplementation(() => new Promise((r) => { resolve = r }) as Promise<Response>)
    renderHook(() => useCommitPolling('p1'))
    await act(async () => { vi.advanceTimersByTime(120_000) })
    expect(fetch).toHaveBeenCalledTimes(1)
    await act(async () => { resolve?.({ ok: true, json: async () => ({ data: { items: [], checkedAt: '' } }) } as Response) })
  })
})
