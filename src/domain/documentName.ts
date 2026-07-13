export const MAX_MARKDOWN_FILE_BYTES = 512 * 1024
export const utf8ByteLength = (value: string): number => new TextEncoder().encode(value).byteLength

const markdownExtension = /\.(?:md|markdown)$/i
const hasControlCharacter = (value: string): boolean =>
  [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 31 || (codePoint >= 127 && codePoint <= 159)
  })

export const normalizeDocumentName = (name: string): string =>
  name.trim().normalize('NFC').toLowerCase()

export type DocumentNameValidation =
  | { valid: true; name: string }
  | { valid: false }

export const validateDocumentName = (name: string): DocumentNameValidation => {
  const trimmed = name.trim().normalize('NFC')
  if (
    trimmed.length === 0 ||
    trimmed.length > 180 ||
    hasControlCharacter(trimmed) ||
    !markdownExtension.test(trimmed)
  ) return { valid: false }
  return { valid: true, name: trimmed }
}
