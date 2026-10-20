import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWorkItem, updateWorkItem } from '../../src/client/api'
import { dueDateToStorage } from '../../src/app/dateForm'

const item = {
  id: 'w1', productId: '1', type: 'requirement' as const, title: 't', description: '', assignee: '', priority: 'medium' as const,
  dueDate: null, status: 'todo' as const, createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
  isDeleted: false, deletedAt: null, deletedBy: '',
}

const stubFetch = (body: unknown) => {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    new Response(JSON.stringify({ data: body }), { status: 200, headers: { 'content-type': 'application/json' } }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('dueDate 写入格式', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('写入前把完整 ISO 串裁成 YYYY-MM-DD', async () => {
    const fetchMock = stubFetch({ ...item, dueDate: '2026-10-22' })
    await updateWorkItem({ ...item, dueDate: '2026-10-22T00:00:00.000Z' }, item.updatedAt)
    const sent = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(sent.dueDate).toBe('2026-10-22')
  })

  it('新建任务时也使用 YYYY-MM-DD', async () => {
    const fetchMock = stubFetch(item)
    await createWorkItem({ ...item, dueDate: '2026-10-22' })
    const sent = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(sent.dueDate).toBe('2026-10-22')
  })

  it('没有截止日期时传 null', async () => {
    const fetchMock = stubFetch(item)
    await updateWorkItem({ ...item, dueDate: null }, item.updatedAt)
    const sent = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(sent.dueDate).toBeNull()
  })

  it('dueDateToStorage 保留日期部分', () => {
    expect(dueDateToStorage('2026-10-22')).toBe('2026-10-22')
    expect(dueDateToStorage('2026-10-22T00:00:00.000Z')).toBe('2026-10-22')
  })
})
