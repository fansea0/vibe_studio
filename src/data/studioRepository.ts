import type { MarkdownDocument, Product, ProductVersion, WorkItem } from '../domain/models'
import { seedStudio, type StudioData } from './seedStudio'

const STORAGE_KEY = 'vibe-studio:v1'

const emptyStudio = (): StudioData => ({
  products: [],
  workItems: [],
  versions: [],
  documents: [],
})

const cloneSeed = (): StudioData => JSON.parse(JSON.stringify(seedStudio)) as StudioData
const cloneStudio = (data: StudioData): StudioData =>
  JSON.parse(JSON.stringify(data)) as StudioData

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isString = (value: unknown): value is string => typeof value === 'string'
const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)
const isNullableString = (value: unknown): value is string | null =>
  value === null || isString(value)
const RFC3339_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/

const isIsoDate = (value: unknown): value is string => {
  if (!isString(value)) return false

  const match = RFC3339_PATTERN.exec(value)
  if (match === null || Number.isNaN(Date.parse(value))) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = Number(match[6])
  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= (daysInMonth[month - 1] ?? 0) &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59
  )
}
const isNullableIsoDate = (value: unknown): value is string | null =>
  value === null || isIsoDate(value)
const isOneOf = <T extends string>(value: unknown, options: readonly T[]): value is T =>
  isString(value) && (options as readonly string[]).includes(value)

const isProduct = (value: unknown): value is Product =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.name) &&
  isString(value.description) &&
  isString(value.productType) &&
  isString(value.icon) &&
  isOneOf(value.status, ['developing', 'beta', 'released', 'archived']) &&
  isNumber(value.completionPercent) &&
  Number.isInteger(value.completionPercent) &&
  value.completionPercent >= 0 &&
  value.completionPercent <= 100 &&
  isNumber(value.userCount) &&
  Number.isInteger(value.userCount) &&
  value.userCount >= 0 &&
  isString(value.userCountSource) &&
  isNullableString(value.appUrl) &&
  isNullableIsoDate(value.archivedAt) &&
  isIsoDate(value.createdAt) &&
  isIsoDate(value.updatedAt)

const isWorkItem = (value: unknown): value is WorkItem =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.productId) &&
  isOneOf(value.type, ['requirement', 'bug']) &&
  isString(value.title) &&
  isOneOf(value.priority, ['low', 'medium', 'high', 'urgent']) &&
  isNullableIsoDate(value.dueDate) &&
  isOneOf(value.status, ['todo', 'in_progress', 'done']) &&
  isIsoDate(value.createdAt) &&
  isIsoDate(value.updatedAt)

const isVersion = (value: unknown): value is ProductVersion =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.productId) &&
  isString(value.number) &&
  isOneOf(value.status, ['planned', 'released']) &&
  isNullableIsoDate(value.releasedAt) &&
  isString(value.notes) &&
  isIsoDate(value.createdAt) &&
  isIsoDate(value.updatedAt)

const isDocument = (value: unknown): value is MarkdownDocument =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.productId) &&
  isString(value.name) &&
  isString(value.content) &&
  isIsoDate(value.createdAt) &&
  isIsoDate(value.updatedAt)

const validRecords = <T>(value: unknown, validate: (record: unknown) => record is T): T[] => {
  if (!Array.isArray(value)) return []
  return value.filter(validate)
}

const sanitizeStudio = (value: unknown): StudioData | null => {
  if (!isRecord(value)) return null

  const products = validRecords(value.products, isProduct)
  const productIds = new Set(products.map(({ id }) => id))
  const belongsToProduct = <T extends { productId: string }>(record: T): boolean =>
    productIds.has(record.productId)

  return {
    products,
    workItems: validRecords(value.workItems, isWorkItem).filter(belongsToProduct),
    versions: validRecords(value.versions, isVersion).filter(belongsToProduct),
    documents: validRecords(value.documents, isDocument).filter(belongsToProduct),
  }
}

const upsertProduct = <T extends { id: string }>(records: T[], record: T): T[] => {
  const existingIndex = records.findIndex(({ id }) => id === record.id)
  if (existingIndex === -1) return [...records, record]

  return records.map((existing, index) => (index === existingIndex ? record : existing))
}

const upsertChild = <T extends { id: string; productId: string }>(
  records: T[],
  record: T,
): T[] => {
  const existingIndex = records.findIndex(
    ({ id, productId }) => id === record.id && productId === record.productId,
  )
  if (existingIndex === -1) return [...records, record]

  return records.map((existing, index) => (index === existingIndex ? record : existing))
}

export type RepositoryErrorCode = 'PERSISTENCE_FAILED'

export class RepositoryError extends Error {
  readonly code: RepositoryErrorCode

  constructor(code: RepositoryErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'RepositoryError'
    this.code = code
  }
}

export interface StudioRepository {
  listProducts(): Product[]
  saveProduct(product: Product): void
  listWorkItems(productId: string): WorkItem[]
  saveWorkItem(item: WorkItem): void
  listVersions(productId: string): ProductVersion[]
  saveVersion(version: ProductVersion): void
  listDocuments(productId: string): MarkdownDocument[]
  saveDocument(document: MarkdownDocument): void
  reset(): void
}

export const createStudioRepository = (storage: Storage): StudioRepository => {
  let lastKnownGood = cloneSeed()

  const tryRecoveryWrite = (data: StudioData): void => {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      // Reads remain available from the in-memory snapshot when persistence is unavailable.
    }
  }

  const persistMutation = (data: StudioData): void => {
    const sanitized = sanitizeStudio(data) ?? emptyStudio()
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(sanitized))
    } catch (cause) {
      throw new RepositoryError(
        'PERSISTENCE_FAILED',
        'Studio changes could not be persisted.',
        { cause },
      )
    }
    lastKnownGood = cloneStudio(sanitized)
  }

  const read = (): StudioData => {
    let payload: string | null
    try {
      payload = storage.getItem(STORAGE_KEY)
    } catch {
      return cloneStudio(lastKnownGood)
    }

    if (payload === null) {
      const seeded = cloneSeed()
      lastKnownGood = cloneStudio(seeded)
      tryRecoveryWrite(seeded)
      return cloneStudio(seeded)
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(payload)
    } catch {
      const recovered = cloneStudio(lastKnownGood)
      tryRecoveryWrite(recovered)
      return recovered
    }

    const sanitized = sanitizeStudio(parsed)
    if (sanitized === null) {
      const recovered = cloneStudio(lastKnownGood)
      tryRecoveryWrite(recovered)
      return recovered
    }

    lastKnownGood = cloneStudio(sanitized)
    if (JSON.stringify(sanitized) !== payload) tryRecoveryWrite(sanitized)
    return cloneStudio(sanitized)
  }

  return {
    listProducts: () => read().products,
    saveProduct: (product) => {
      const data = read()
      persistMutation({ ...data, products: upsertProduct(data.products, product) })
    },
    listWorkItems: (productId) => read().workItems.filter((item) => item.productId === productId),
    saveWorkItem: (item) => {
      const data = read()
      persistMutation({ ...data, workItems: upsertChild(data.workItems, item) })
    },
    listVersions: (productId) => read().versions.filter((version) => version.productId === productId),
    saveVersion: (version) => {
      const data = read()
      persistMutation({ ...data, versions: upsertChild(data.versions, version) })
    },
    listDocuments: (productId) => read().documents.filter((document) => document.productId === productId),
    saveDocument: (document) => {
      const data = read()
      persistMutation({ ...data, documents: upsertChild(data.documents, document) })
    },
    reset: () => persistMutation(emptyStudio()),
  }
}
