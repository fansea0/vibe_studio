import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createSqliteRepository } from '../../src/server/sqlite'
import { createApiHandler } from '../../src/server/api'

let dir: string
let handler: ReturnType<typeof createApiHandler>

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'vibe-api-'))
  const repo = createSqliteRepository(path.join(dir, 'db.sqlite'))
  repo.createProduct({ name: 'P', description: '', productType: '', icon: '', status: 'developing', completionPercent: 0, userCount: 0, userCountSource: '', appUrl: null, repositoryPath: '' })
  handler = createApiHandler({ repository: repo })
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

interface CallResult { status: number; body: any }
const call = async (method: string, url: string, body?: any, headers?: Record<string, string>): Promise<CallResult> => {
  const lowerHeaders: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers ?? {})) lowerHeaders[k.toLowerCase()] = v
  const req: any = { method, url, headers: { 'content-type': 'application/json', ...lowerHeaders } }
  if (body !== undefined) {
    req[Symbol.asyncIterator] = async function* () { yield Buffer.from(JSON.stringify(body)) }
  }
  let captured: any = null
  const res: any = {
    statusCode: 0,
    setHeader() {},
    end(payload?: any) { captured = JSON.parse(payload ?? 'null') },
  }
  await handler(req as IncomingMessage, res as unknown as ServerResponse)
  return { status: res.statusCode, body: captured }
}

describe('work items HTTP', () => {
  it('POST creates work item with description/assignee', async () => {
    const r = await call('POST', '/api/products/1/work-items', { type: 'requirement', title: 't', description: 'desc', assignee: 'alice', priority: 'medium', dueDate: null, status: 'todo' })
    expect(r.status).toBe(201)
    expect(r.body.data.description).toBe('desc')
    expect(r.body.data.assignee).toBe('alice')
    expect(r.body.data.isDeleted).toBe(false)
  })

  it('GET list excludes deleted by default; includeDeleted adds them', async () => {
    const created = await call('POST', '/api/products/1/work-items', { type: 'requirement', title: 'a', description: '', assignee: '', priority: 'medium', dueDate: null, status: 'todo' })
    const id = created.body.data.id
    const deleted = await call('DELETE', `/api/products/1/work-items/${id}`, { actor: 'bob' })
    expect(deleted.status).toBe(200)
    const def = await call('GET', '/api/products/1/work-items')
    expect(def.body.data).toEqual([])
    const all = await call('GET', '/api/products/1/work-items?includeDeleted=1')
    expect(all.body.data).toHaveLength(1)
  })

  it('DELETE soft deletes; second DELETE returns 409', async () => {
    const created = await call('POST', '/api/products/1/work-items', { type: 'requirement', title: 'a', description: '', assignee: '', priority: 'medium', dueDate: null, status: 'todo' })
    const id = created.body.data.id
    const first = await call('DELETE', `/api/products/1/work-items/${id}`, { actor: 'bob' })
    expect(first.status).toBe(200)
    const second = await call('DELETE', `/api/products/1/work-items/${id}`, { actor: 'bob' })
    expect(second.status).toBe(409)
  })

  it('DELETE without actor still succeeds with empty actor', async () => {
    const created = await call('POST', '/api/products/1/work-items', { type: 'requirement', title: 'a', description: '', assignee: '', priority: 'medium', dueDate: null, status: 'todo' })
    const id = created.body.data.id
    const r = await call('DELETE', `/api/products/1/work-items/${id}`)
    expect(r.status).toBe(200)
    const all = await call('GET', '/api/products/1/work-items?onlyDeleted=1')
    expect(all.body.data[0].deletedBy).toBe('')
  })

  it('X-Vibe-Actor header overrides body actor', async () => {
    const created = await call('POST', '/api/products/1/work-items', { type: 'requirement', title: 'a', description: '', assignee: '', priority: 'medium', dueDate: null, status: 'todo' })
    const id = created.body.data.id
    const r = await call('DELETE', `/api/products/1/work-items/${id}`, {}, { 'x-vibe-actor': 'alice' })
    expect(r.status).toBe(200)
    const all = await call('GET', '/api/products/1/work-items?onlyDeleted=1')
    expect(all.body.data[0].deletedBy).toBe('alice')
  })

  it('POST restore returns 200 and clears flags', async () => {
    const created = await call('POST', '/api/products/1/work-items', { type: 'requirement', title: 'a', description: '', assignee: '', priority: 'medium', dueDate: null, status: 'todo' })
    const id = created.body.data.id
    await call('DELETE', `/api/products/1/work-items/${id}`, { actor: 'bob' })
    const r = await call('POST', `/api/products/1/work-items/${id}/restore`, { actor: 'carol' })
    expect(r.status).toBe(200)
    expect(r.body.data.isDeleted).toBe(false)
  })

  it('restore on non-deleted returns 409', async () => {
    const created = await call('POST', '/api/products/1/work-items', { type: 'requirement', title: 'a', description: '', assignee: '', priority: 'medium', dueDate: null, status: 'todo' })
    const r = await call('POST', `/api/products/1/work-items/${created.body.data.id}/restore`, { actor: 'x' })
    expect(r.status).toBe(409)
  })

  it('DELETE permanent purges row', async () => {
    const created = await call('POST', '/api/products/1/work-items', { type: 'requirement', title: 'a', description: '', assignee: '', priority: 'medium', dueDate: null, status: 'todo' })
    const id = created.body.data.id
    const r = await call('DELETE', `/api/products/1/work-items/${id}/permanent`)
    expect(r.status).toBe(200)
    const get = await call('GET', `/api/products/1/work-items/${id}`)
    expect(get.status).toBe(404)
  })

  it('comments GET/POST', async () => {
    const created = await call('POST', '/api/products/1/work-items', { type: 'requirement', title: 'a', description: '', assignee: '', priority: 'medium', dueDate: null, status: 'todo' })
    const id = created.body.data.id
    const c1 = await call('POST', `/api/products/1/work-items/${id}/comments`, { author: 'alice', body: 'hi' })
    expect(c1.status).toBe(201)
    const list = await call('GET', `/api/products/1/work-items/${id}/comments`)
    expect(list.body.data).toHaveLength(1)
  })

  it('events GET lists created/deleted/restored', async () => {
    const created = await call('POST', '/api/products/1/work-items', { type: 'requirement', title: 'a', description: '', assignee: '', priority: 'medium', dueDate: null, status: 'todo' })
    const id = created.body.data.id
    await call('DELETE', `/api/products/1/work-items/${id}`, { actor: 'bob' })
    await call('POST', `/api/products/1/work-items/${id}/restore`, { actor: 'carol' })
    const list = await call('GET', `/api/products/1/work-items/${id}/events`)
    const types = list.body.data.map((e: any) => e.type)
    expect(types).toEqual(expect.arrayContaining(['created','deleted','restored']))
  })

  it('comments on non-existent work item returns 404', async () => {
    const r = await call('POST', '/api/products/1/work-items/999/comments', { author: 'a', body: 'x' })
    expect(r.status).toBe(404)
  })

  it('comments body empty returns 400', async () => {
    const created = await call('POST', '/api/products/1/work-items', { type: 'requirement', title: 'a', description: '', assignee: '', priority: 'medium', dueDate: null, status: 'todo' })
    const r = await call('POST', `/api/products/1/work-items/${created.body.data.id}/comments`, { author: 'a', body: '   ' })
    expect(r.status).toBe(400)
  })
})
