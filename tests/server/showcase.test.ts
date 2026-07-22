import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApiHandler } from '../../src/server/api.js'
import { createSqliteRepository } from '../../src/server/sqlite.js'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

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

const invokeRaw = async (handler: ReturnType<typeof createApiHandler>, method: string, url: string, body?: unknown) => {
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
  return { status: res.statusCode, body: chunks.length ? Buffer.concat(chunks).toString('utf8') : '' }
}

describe('showcase SQL filter', () => {
  let repo: ReturnType<typeof createSqliteRepository>
  beforeEach(() => { repo = createSqliteRepository(':memory:') })
  afterEach(() => { repo.close() })

  it('listPublicProducts returns only isPublic=1 non-archived products', () => {
    const all = repo.listProducts(true)
    const first = repo.updateProduct(String(all[0].id), { isPublic: true })
    expect(first.isPublic).toBe(true)
    const listed = repo.listPublicProducts()
    expect(listed).toHaveLength(1)
    expect(listed[0].id).toBe(String(all[0].id))
  })

  it('getPublicProduct returns null for archived products even when isPublic=1', () => {
    const all = repo.listProducts(true)
    const first = repo.updateProduct(String(all[0].id), { isPublic: true })
    repo.archiveProduct(String(first.id))
    expect(repo.getPublicProduct(String(first.id))).toBeUndefined()
  })

  it('listPublicProducts returns one row per product even when multiple versions share released_at', () => {
    const all = repo.listProducts(true)
    const product = all[0]
    repo.updateProduct(String(product.id), { isPublic: true })
    // Create three released versions all with the same releasedAt
    const sameDate = '2026-01-01T00:00:00.000Z'
    repo.createVersion(String(product.id), { number: 'v1.0', status: 'released', releasedAt: sameDate, notes: '' })
    repo.createVersion(String(product.id), { number: 'v1.1', status: 'released', releasedAt: sameDate, notes: '' })
    repo.createVersion(String(product.id), { number: 'v1.2', status: 'released', releasedAt: sameDate, notes: '' })
    const listed = repo.listPublicProducts()
    expect(listed).toHaveLength(1) // NOT 3
  })

  it('getPublicProduct returns null for non-public products', () => {
    const all = repo.listProducts(true)
    const product = all.find(p => p.name !== 'Flora')!
    expect(product).toBeDefined()
    expect(repo.getPublicProduct(String(product.id))).toBeUndefined()
  })
})

describe('showcase API', () => {
  it('GET /api/showcase/products filters private and archived', async () => {
    const repo = createSqliteRepository(':memory:')
    const handler = createApiHandler({ repository: repo, profileReader: async () => ({ displayName: '', tagline: '', avatarUrl: null, statusLine: '', statusPillText: '', aboutParagraphs: [], contactEmail: '', socialLinks: [] }) })
    const all = repo.listProducts(true)
    repo.updateProduct(String(all[0].id), { isPublic: true })
    const res = await invoke(handler, 'GET', '/api/showcase/products')
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    repo.close()
  })

  it('GET /api/showcase/products/:id returns 404 for private or archived', async () => {
    const repo = createSqliteRepository(':memory:')
    const handler = createApiHandler({ repository: repo, profileReader: async () => ({ displayName: '', tagline: '', avatarUrl: null, statusLine: '', statusPillText: '', aboutParagraphs: [], contactEmail: '', socialLinks: [] }) })
    const product = repo.listProducts(true).find(p => p.name !== 'Flora')!
    expect(product).toBeDefined()
    const res = await invoke(handler, 'GET', `/api/showcase/products/${product.id}`)
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

describe('showcase pages API', () => {
  it('GET /api/showcase/pages/:id returns 404 when product is private or archived', async () => {
    const repo = createSqliteRepository(':memory:')
    const handler = createApiHandler({ repository: repo, profileReader: async () => ({ displayName: '', tagline: '', avatarUrl: null, statusLine: '', statusPillText: '', aboutParagraphs: [], contactEmail: '', socialLinks: [] }) })
    const product = repo.listProducts(true).find(p => p.name !== 'Flora')!
    expect(product).toBeDefined()
    const res = await invoke(handler, 'GET', `/api/showcase/pages/${product.id}`)
    expect(res.status).toBe(404)
    repo.close()
  })

  it('GET /api/showcase/pages/:id returns 404 when showcasePagePath is empty', async () => {
    const repo = createSqliteRepository(':memory:')
    const handler = createApiHandler({ repository: repo, profileReader: async () => ({ displayName: '', tagline: '', avatarUrl: null, statusLine: '', statusPillText: '', aboutParagraphs: [], contactEmail: '', socialLinks: [] }) })
    const product = repo.listProducts(true).find(p => p.name !== 'Flora')!
    expect(product).toBeDefined()
    repo.updateProduct(String(product.id), { isPublic: true, showcasePagePath: '' } as any)
    const res = await invoke(handler, 'GET', `/api/showcase/pages/${product.id}`)
    expect(res.status).toBe(404)
    repo.close()
  })
})

describe('showcase pages API with file', () => {
  let productId: string
  let dir: string
  beforeEach(async () => {
    const repoForSeed = createSqliteRepository(':memory:')
    const nonFlora = repoForSeed.listProducts(true).find(p => p.name !== 'Flora')!
    productId = String(nonFlora.id)
    repoForSeed.close()
    dir = join(process.cwd(), 'data/products', productId)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'showcase.html'), '<h1>flora</h1>', 'utf8')
  })
  afterEach(async () => { await rm(join(process.cwd(), 'data/products', productId), { recursive: true, force: true }) })

  it('GET /api/showcase/pages/:id returns HTML when public + path configured', async () => {
    const repo = createSqliteRepository(':memory:')
    const handler = createApiHandler({ repository: repo, profileReader: async () => ({ displayName: '', tagline: '', avatarUrl: null, statusLine: '', statusPillText: '', aboutParagraphs: [], contactEmail: '', socialLinks: [] }) })
    const nonFlora = repo.listProducts(true).find(p => p.name !== 'Flora')!
    const configured = `data/products/${nonFlora.id}/showcase.html`
    repo.updateProduct(String(nonFlora.id), { isPublic: true, showcasePagePath: configured } as any)
    const res = await invokeRaw(handler, 'GET', `/api/showcase/pages/${nonFlora.id}`)
    expect(res.status).toBe(200)
    expect(res.body).toBe('<h1>flora</h1>')
    repo.close()
  })

  it('GET /api/showcase/pages/:id returns 405 on POST', async () => {
    const repo = createSqliteRepository(':memory:')
    const handler = createApiHandler({ repository: repo, profileReader: async () => ({ displayName: '', tagline: '', avatarUrl: null, statusLine: '', statusPillText: '', aboutParagraphs: [], contactEmail: '', socialLinks: [] }) })
    const nonFlora = repo.listProducts(true).find(p => p.name !== 'Flora')!
    const configured = `data/products/${nonFlora.id}/showcase.html`
    repo.updateProduct(String(nonFlora.id), { isPublic: true, showcasePagePath: configured } as any)
    const res = await invoke(handler, 'POST', `/api/showcase/pages/${nonFlora.id}`, {})
    expect(res.status).toBe(405)
    repo.close()
  })

  it('GET /api/showcase-pages/:id/showcase.html serves HTML for any product that has a configured path', async () => {
    const repo = createSqliteRepository(':memory:')
    const handler = createApiHandler({ repository: repo, profileReader: async () => ({ displayName: '', tagline: '', avatarUrl: null, statusLine: '', statusPillText: '', aboutParagraphs: [], contactEmail: '', socialLinks: [] }) })
    const dir = join(process.cwd(), 'data/products/preview-test')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'showcase.html'), '<h1>preview</h1>', 'utf8')
    try {
      const nonFlora = repo.listProducts(true).find(p => p.name !== 'Flora')!
      const id = String(nonFlora.id)
      repo.updateProduct(id, { isPublic: false, showcasePagePath: `data/products/${id}/showcase.html` } as any)
      const configuredId = id
      await mkdir(join(process.cwd(), `data/products/${configuredId}`), { recursive: true })
      await writeFile(join(process.cwd(), `data/products/${configuredId}/showcase.html`), '<h1>preview</h1>', 'utf8')
      const res = await invokeRaw(handler, 'GET', `/api/showcase-pages/${configuredId}/showcase.html`)
      expect(res.status).toBe(200)
      expect(res.body).toBe('<h1>preview</h1>')
    } finally {
      await rm(join(process.cwd(), 'data/products/preview-test'), { recursive: true, force: true })
      const configuredId = String(repo.listProducts(true).find(p => p.name !== 'Flora')!.id)
      await rm(join(process.cwd(), `data/products/${configuredId}`), { recursive: true, force: true })
    }
    repo.close()
  })

  it('GET /api/showcase-pages/:id/showcase.html returns 404 when showcasePagePath is not configured', async () => {
    const repo = createSqliteRepository(':memory:')
    const handler = createApiHandler({ repository: repo, profileReader: async () => ({ displayName: '', tagline: '', avatarUrl: null, statusLine: '', statusPillText: '', aboutParagraphs: [], contactEmail: '', socialLinks: [] }) })
    const nonFlora = repo.listProducts(true).find(p => p.name !== 'Flora')!
    const res = await invoke(handler, 'GET', `/api/showcase-pages/${nonFlora.id}/showcase.html`)
    expect(res.status).toBe(404)
    repo.close()
  })
})