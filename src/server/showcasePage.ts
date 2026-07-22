import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { RepositoryError } from './sqlite.js'

const SAFE_ID = /^[a-z0-9-_]+$/i
const SHOWCASE_ROOT = path.resolve(process.cwd(), 'data/products')

export function resolveShowcasePath(productId: string, configuredPath: string): string {
  if (!SAFE_ID.test(productId)) throw new RepositoryError('NOT_FOUND', 'product')
  const full = path.resolve(process.cwd(), configuredPath)
  const expectedPrefix = SHOWCASE_ROOT + path.sep + productId + path.sep
  if (!full.startsWith(expectedPrefix)) throw new RepositoryError('VALIDATION_FAILED', 'showcasePagePath')
  return full
}

export async function readShowcasePage(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, 'utf8')
  } catch {
    throw new RepositoryError('NOT_FOUND', 'showcase page')
  }
}
