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
  isNumber(value.userCount) &&
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

const isProductRecords = (value: unknown): boolean =>
  Array.isArray(value) && value.every(isProduct)

const isStudioData = (value: unknown): value is StudioData => {
  if (!isRecord(value)) return false

  return (
    isProductRecords(value.products) &&
    Array.isArray(value.workItems) &&
    value.workItems.every(isWorkItem) &&
    Array.isArray(value.versions) &&
    value.versions.every(isVersion) &&
    Array.isArray(value.documents) &&
    value.documents.every(isDocument)
  )
}

const upsert = <T extends { id: string }>(records: T[], record: T): T[] => {
  const existingIndex = records.findIndex(({ id }) => id === record.id)
  if (existingIndex === -1) return [...records, record]

  return records.map((existing, index) => (index === existingIndex ? record : existing))
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
  const write = (data: StudioData): void => {
    storage.setItem(STORAGE_KEY, JSON.stringify(data))
  }

  const read = (): StudioData => {
    const payload = storage.getItem(STORAGE_KEY)
    if (payload === null) {
      const seeded = cloneSeed()
      write(seeded)
      return seeded
    }

    try {
      const parsed: unknown = JSON.parse(payload)
      if (isStudioData(parsed)) return parsed
    } catch {
      // Invalid persisted data is replaced below with a known-good snapshot.
    }

    const recovered = cloneSeed()
    write(recovered)
    return recovered
  }

  const save = <K extends keyof StudioData>(key: K, record: StudioData[K][number]): void => {
    const data = read()
    const records = data[key] as Array<{ id: string }>
    data[key] = upsert(records, record) as StudioData[K]
    write(data)
  }

  return {
    listProducts: () => read().products,
    saveProduct: (product) => save('products', product),
    listWorkItems: (productId) => read().workItems.filter((item) => item.productId === productId),
    saveWorkItem: (item) => save('workItems', item),
    listVersions: (productId) => read().versions.filter((version) => version.productId === productId),
    saveVersion: (version) => save('versions', version),
    listDocuments: (productId) => read().documents.filter((document) => document.productId === productId),
    saveDocument: (document) => save('documents', document),
    reset: () => write(emptyStudio()),
  }
}
