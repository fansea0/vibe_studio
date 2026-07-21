import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApiHandler } from '../../src/server/api.js'
import { createSqliteRepository } from '../../src/server/sqlite.js'
import type { IncomingMessage, ServerResponse } from 'node:http'

const invoke = async (handler: ReturnType<typeof createApiHandler>, method: string, url: string, body?: unknown) => {
  const chunks: Buffer[] = []
  const res = {
    statusCode: 0,
    setHeader() {},
    end(chunk: string) { chunks.push(Buffer.from(chunk)) },
  } as unknown as ServerResponse
  const req = {
    method,
    url,
    [Symbol.asyncIterator]: async function* () { if (body !== undefined) yield Buffer.from(JSON.stringify(body)) },
  } as unknown as IncomingMessage
  await handler(req, res)
  return { status: res.statusCode, body: chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null }
}

describe('showcase SQL filter', () => {
  let repo: ReturnType<typeof createSqliteRepository>
  beforeEach(() => { repo = createSqliteRepository(':memory:') })
  afterEach(() => { repo.close() })

  it('listPublicProducts returns only isPublic=1 non-archived products', () => {
    const all = repo.listProducts(true)
    const first = repo.updateProduct(String(all[0].id), { isPublic: true } as any)
    expect(first.isPublic).toBe(true)
    const listed = repo.listPublicProducts()
    expect(listed).toHaveLength(1)
    expect(listed[0].id).toBe(String(all[0].id))
  })

  it('getPublicProduct returns null for archived products even when isPublic=1', () => {
    const all = repo.listProducts(true)
    const first = repo.updateProduct(String(all[0].id), { isPublic: true } as any)
    repo.archiveProduct(String(first.id))
    expect(repo.getPublicProduct(String(first.id))).toBeUndefined()
  })

  it('getPublicProduct returns null for non-public products', () => {
    const all = repo.listProducts(true)
    expect(repo.getPublicProduct(String(all[0].id))).toBeUndefined()
  })
})

describe('showcase API', () => {
  it('GET /api/showcase/products filters private and archived', async () => {
    const repo = createSqliteRepository(':memory:')
    const handler = createApiHandler({ repository: repo, profileReader: async () => ({ displayName: '', tagline: '', avatarUrl: null, statusLine: '', statusPillText: '', aboutParagraphs: [], contactEmail: '', socialLinks: [] }) })
    const all = repo.listProducts(true)
    repo.updateProduct(String(all[0].id), { isPublic: true } as any)
    const res = await invoke(handler, 'GET', '/api/showcase/products')
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    repo.close()
  })

  it('GET /api/showcase/products/:id returns 404 for private or archived', async () => {
    const repo = createSqliteRepository(':memory:')
    const handler = createApiHandler({ repository: repo, profileReader: async () => ({ displayName: '', tagline: '', avatarUrl: null, statusLine: '', statusPillText: '', aboutParagraphs: [], contactEmail: '', socialLinks: [] }) })
    const all = repo.listProducts(true)
    const res = await invoke(handler, 'GET', `/api/showcase/products/${all[0].id}`)
    expect(res.status).toBe(404)
    repo.close()
  })

  it('GET /api/showcase/profile delegates to profileReader', async () => {
    const repo = createSqliteRepository(':memory:')
    const profile = { displayName: 'Ada', tagline: 'hi', avatarUrl: null, statusLine: 'now', statusPillText: 'hi', aboutParagraphs: [], contactEmail: 'a@b.c', socialLinks: [] }
    const handler = createApiHandler({ repository: repo, profileReader: async () => profile })
    const res = await invoke(handler, 'GET', '/api/showcase/profile')
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual(profile)
    repo.close()
  })

  it('GET /api/showcase/profile returns 503 when profileReader throws', async () => {
    const repo = createSqliteRepository(':memory:')
    const handler = createApiHandler({ repository: repo, profileReader: async () => { throw new Error('missing') } })
    const res = await invoke(handler, 'GET', '/api/showcase/profile')
    expect(res.status).toBe(503)
    repo.close()
  })
})