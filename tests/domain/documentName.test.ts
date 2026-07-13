import { describe, expect, it } from 'vitest'

import {
  MAX_MARKDOWN_FILE_BYTES,
  normalizeDocumentName,
  validateDocumentName,
} from '../../src/domain/documentName'

describe('document names', () => {
  it('normalizes whitespace, Unicode composition, and case without locale rules', () => {
    expect(normalizeDocumentName('  CAFÉ.MD ')).toBe(normalizeDocumentName('cafe\u0301.md'))
    expect(normalizeDocumentName('İ.MD')).toBe('i\u0307.md')
  })

  it('accepts Markdown names from 1 to 180 trimmed characters', () => {
    expect(validateDocumentName('a.md')).toEqual({ valid: true, name: 'a.md' })
    const maximum = `${'a'.repeat(177)}.md`
    expect(validateDocumentName(maximum)).toEqual({ valid: true, name: maximum })
  })

  it.each([
    ['wrong extension', 'guide.txt'],
    ['control character', 'bad\u0000.md'],
    ['too long', `${'a'.repeat(178)}.md`],
  ])('rejects %s', (_case, name) => {
    expect(validateDocumentName(name).valid).toBe(false)
  })

  it('sets the Markdown upload limit to 512 KiB', () => {
    expect(MAX_MARKDOWN_FILE_BYTES).toBe(512 * 1024)
  })
})
