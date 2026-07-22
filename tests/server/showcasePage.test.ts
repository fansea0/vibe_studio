import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RepositoryError } from '../../src/server/sqlite.js'
import { readShowcasePage, resolveShowcasePath } from '../../src/server/showcasePage.js'

describe('resolveShowcasePath', () => {
  it('accepts a path under data/products/<productId>/', () => {
    const resolved = resolveShowcasePath('flora', 'data/products/flora/showcase.html')
    expect(resolved.endsWith('data/products/flora/showcase.html')).toBe(true)
  })

  it('rejects path traversal via ..', () => {
    expect(() => resolveShowcasePath('flora', '../etc/passwd')).toThrow(RepositoryError)
  })

  it('rejects absolute paths', () => {
    expect(() => resolveShowcasePath('flora', '/etc/passwd')).toThrow(RepositoryError)
  })

  it('rejects paths under another product directory', () => {
    expect(() => resolveShowcasePath('flora', 'data/products/other-id/showcase.html')).toThrow(RepositoryError)
  })

  it('rejects unsafe productId (special characters)', () => {
    expect(() => resolveShowcasePath('flo/ra', 'data/products/flora/showcase.html')).toThrow(RepositoryError)
  })
})

describe('readShowcasePage', () => {
  let dir: string
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'showcase-')) })
  afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

  it('returns file content', async () => {
    const file = join(dir, 'page.html')
    await writeFile(file, '<h1>hi</h1>', 'utf8')
    expect(await readShowcasePage(file)).toBe('<h1>hi</h1>')
  })

  it('throws NOT_FOUND when file is missing', async () => {
    await expect(readShowcasePage(join(dir, 'missing.html'))).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
