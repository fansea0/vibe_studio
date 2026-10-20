import type { MarkdownDocument, Product, ProductVersion, WorkItem } from '../domain/models'
import { MAX_MARKDOWN_FILE_BYTES, normalizeDocumentName, utf8ByteLength, validateDocumentName } from '../domain/documentName'
import { seedStudio, type StudioData } from './seedStudio'

export const STUDIO_STORAGE_KEY = 'vibe-studio:v1'
const STUDIO_MUTATION_LOCK_NAME = 'vibe-studio:mutations'
const MUTATION_LOCK_DATABASE = 'vibe-studio-mutation-lock'
const MUTATION_LOCK_STORE = 'locks'

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
const isNonEmptyString = (value: unknown): value is string =>
  isString(value) && value.trim().length > 0
const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)
const isNullableString = (value: unknown): value is string | null =>
  value === null || isString(value)
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean'
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
// 截止日期允许 `YYYY-MM-DD`（SQLite 存储格式）或完整 ISO 串（历史数据）
const isDueDate = (value: unknown): value is string | null =>
  value === null || isIsoDate(value) || /^\d{4}-\d\d-\d\d$/.test(value as string)
const isOneOf = <T extends string>(value: unknown, options: readonly T[]): value is T =>
  isString(value) && (options as readonly string[]).includes(value)

const isProduct = (value: unknown): value is Product =>
  isRecord(value) &&
  isNonEmptyString(value.id) &&
  isNonEmptyString(value.name) &&
  isString(value.description) &&
  isString(value.icon) &&
  isOneOf(value.status, ['developing', 'beta', 'released', 'archived']) &&
  isNumber(value.userCount) &&
  Number.isInteger(value.userCount) &&
  value.userCount >= 0 &&
  isNullableString(value.appUrl) &&
  isNullableIsoDate(value.archivedAt) &&
  isIsoDate(value.createdAt) &&
  isIsoDate(value.updatedAt)

const isWorkItem = (value: unknown): value is WorkItem =>
  isRecord(value) &&
  isNonEmptyString(value.id) &&
  isNonEmptyString(value.productId) &&
  isOneOf(value.type, ['requirement', 'bug']) &&
  isNonEmptyString(value.title) &&
  isString(value.description) &&
  isString(value.assignee) &&
  isOneOf(value.priority, ['low', 'medium', 'high', 'urgent']) &&
  isDueDate(value.dueDate) &&
  isOneOf(value.status, ['todo', 'in_progress', 'done']) &&
  isBoolean(value.isDeleted) &&
  isNullableIsoDate(value.deletedAt) &&
  isString(value.deletedBy) &&
  isIsoDate(value.createdAt) &&
  isIsoDate(value.updatedAt)

const hasValidVersionReleaseState = (value: Record<string, unknown>): boolean =>
  (value.status === 'planned' && value.releasedAt === null) ||
  (value.status === 'released' && isIsoDate(value.releasedAt))

const isVersion = (value: unknown): value is ProductVersion =>
  isRecord(value) &&
  isNonEmptyString(value.id) &&
  isNonEmptyString(value.productId) &&
  isString(value.number) &&
  value.number.length > 0 &&
  value.number === value.number.trim() &&
  isOneOf(value.status, ['planned', 'released']) &&
  hasValidVersionReleaseState(value) &&
  isString(value.notes) &&
  isIsoDate(value.createdAt) &&
  isIsoDate(value.updatedAt)

const isDocument = (value: unknown): value is MarkdownDocument =>
  isRecord(value) &&
  isNonEmptyString(value.id) &&
  isNonEmptyString(value.productId) &&
  isString(value.name) &&
  validateDocumentName(value.name).valid &&
  isString(value.content) &&
  utf8ByteLength(value.content) <= MAX_MARKDOWN_FILE_BYTES &&
  isIsoDate(value.createdAt) &&
  isIsoDate(value.updatedAt) &&
  Date.parse(value.createdAt) <= Date.parse(value.updatedAt)

const validRecords = <T>(value: unknown, validate: (record: unknown) => record is T): T[] => {
  if (!Array.isArray(value)) return []
  return value.filter(validate)
}

const uniqueDocuments = (documents: MarkdownDocument[]): MarkdownDocument[] => {
  const retained = new Set<MarkdownDocument>()
  const seenIds = new Map<string, Set<string>>()
  const seenNames = new Map<string, Set<string>>()
  const ranked = documents
    .map((document, index) => ({ document, index }))
    .sort((left, right) =>
      Date.parse(right.document.updatedAt) - Date.parse(left.document.updatedAt) ||
      left.index - right.index,
    )
  for (const { document } of ranked) {
    const productIds = seenIds.get(document.productId) ?? new Set<string>()
    const productNames = seenNames.get(document.productId) ?? new Set<string>()
    const name = normalizeDocumentName(document.name)
    if (productIds.has(document.id) || productNames.has(name)) continue
    productIds.add(document.id)
    productNames.add(name)
    seenIds.set(document.productId, productIds)
    seenNames.set(document.productId, productNames)
    retained.add(document)
  }
  return documents.filter((document) => retained.has(document))
}

const canonicalDocuments = (value: unknown): MarkdownDocument[] => {
  if (!Array.isArray(value)) return []
  return value.flatMap((candidate) => {
    if (!isRecord(candidate) || !isString(candidate.name)) return []
    const validation = validateDocumentName(candidate.name)
    if (!validation.valid) return []
    const canonical = { ...candidate, name: validation.name }
    return isDocument(canonical) ? [canonical] : []
  })
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
    documents: uniqueDocuments(
      canonicalDocuments(value.documents).filter(belongsToProduct),
    ),
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

export type RepositoryErrorCode =
  | 'PERSISTENCE_FAILED'
  | 'VALIDATION_FAILED'
  | 'PRODUCT_NOT_FOUND'
  | 'DUPLICATE_VERSION'
  | 'DUPLICATE_DOCUMENT'
  | 'DUPLICATE_PRODUCT'
  | 'DOCUMENT_CONFLICT'
  | 'PRODUCT_CONFLICT'
  | 'LOCK_UNAVAILABLE'

export class RepositoryError extends Error {
  readonly code: RepositoryErrorCode

  constructor(code: RepositoryErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'RepositoryError'
    this.code = code
  }
}

const requireValid = <T>(
  value: unknown,
  validate: (candidate: unknown) => candidate is T,
): T => {
  if (!validate(value)) {
    throw new RepositoryError('VALIDATION_FAILED', 'Studio record validation failed.')
  }
  return value
}

const requireProduct = (data: StudioData, productId: string): void => {
  if (!data.products.some(({ id }) => id === productId)) {
    throw new RepositoryError(
      'PRODUCT_NOT_FOUND',
      `Studio product "${productId}" does not exist.`,
    )
  }
}

export interface StudioRepository {
  readSnapshot(): StudioData
  listProducts(): Product[]
  saveProduct(product: Product, token: ProductMutationToken): Promise<void>
  migrateLegacyProductLifecycle(productId: string): Promise<void>
  listWorkItems(productId: string): WorkItem[]
  saveWorkItem(item: WorkItem): Promise<void>
  listVersions(productId: string): ProductVersion[]
  saveVersion(version: ProductVersion): Promise<void>
  listDocuments(productId: string): MarkdownDocument[]
  saveDocument(document: MarkdownDocument, token: DocumentMutationToken): Promise<void>
  reset(): Promise<void>
}

export interface DocumentMutationToken { expectedUpdatedAt: string | null }
export interface ProductMutationToken { expectedUpdatedAt: string | null }

export interface MutationLock {
  request<T>(name: string, operation: () => T): Promise<T>
}

const lockUnavailable = (message: string, cause?: unknown): RepositoryError =>
  new RepositoryError('LOCK_UNAVAILABLE', message, { cause })

export const createIndexedDbMutationLock = (indexedDB: IDBFactory): MutationLock => {
  let databasePromise: Promise<IDBDatabase> | null = null

  const openDatabase = (): Promise<IDBDatabase> => {
    if (databasePromise !== null) return databasePromise
    databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      let request: IDBOpenDBRequest
      try {
        request = indexedDB.open(MUTATION_LOCK_DATABASE, 1)
      } catch (cause) {
        reject(lockUnavailable('IndexedDB mutation lock could not be opened.', cause))
        return
      }
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(MUTATION_LOCK_STORE)) {
          request.result.createObjectStore(MUTATION_LOCK_STORE, { keyPath: 'name' })
        }
      }
      request.onsuccess = () => {
        const database = request.result
        const close = () => {
          database.close()
          databasePromise = null
        }
        database.onversionchange = close
        database.onclose = () => { databasePromise = null }
        resolve(database)
      }
      request.onerror = () => reject(lockUnavailable('IndexedDB mutation lock could not be opened.', request.error))
      request.onblocked = () => reject(lockUnavailable('IndexedDB mutation lock upgrade was blocked.'))
    }).catch((error) => {
      databasePromise = null
      throw error
    })
    return databasePromise
  }

  return {
    request: async <T,>(name: string, operation: () => T): Promise<T> => {
      const database = await openDatabase()
      return new Promise<T>((resolve, reject) => {
        let transaction: IDBTransaction
        try {
          transaction = database.transaction(MUTATION_LOCK_STORE, 'readwrite')
        } catch (cause) {
          databasePromise = null
          reject(lockUnavailable('IndexedDB mutation transaction could not be started.', cause))
          return
        }

        let result: T
        let operationError: unknown
        let infrastructureError: RepositoryError | null = null
        let settled = false
        const rejectOnce = (error: unknown) => {
          if (settled) return
          settled = true
          reject(error)
        }
        transaction.oncomplete = () => {
          if (settled) return
          settled = true
          resolve(result)
        }
        transaction.onerror = () => rejectOnce(
          operationError ?? infrastructureError ?? lockUnavailable('IndexedDB mutation transaction failed.', transaction.error),
        )
        transaction.onabort = () => rejectOnce(
          operationError ?? infrastructureError ?? lockUnavailable('IndexedDB mutation transaction was aborted.', transaction.error),
        )

        let store: IDBObjectStore
        let gate: IDBRequest
        try {
          store = transaction.objectStore(MUTATION_LOCK_STORE)
          gate = store.get(name)
        } catch (cause) {
          infrastructureError = lockUnavailable('IndexedDB mutation transaction could not be queued.', cause)
          transaction.abort()
          return
        }
        gate.onerror = () => {
          infrastructureError = lockUnavailable('IndexedDB mutation transaction could not acquire the lock.', gate.error)
        }
        gate.onsuccess = () => {
          try {
            result = operation()
          } catch (error) {
            operationError = error
            transaction.abort()
            return
          }
          if (isRecord(result) && typeof result.then === 'function') {
            operationError = new RepositoryError(
              'VALIDATION_FAILED',
              'Mutation lock operations must be synchronous.',
            )
            transaction.abort()
            return
          }
          try {
            store.put({ name, updatedAt: Date.now() })
          } catch (cause) {
            infrastructureError = lockUnavailable('IndexedDB mutation transaction could not be committed.', cause)
            transaction.abort()
          }
        }
      })
    },
  }
}

const storageMutationQueues = new WeakMap<Storage, Promise<void>>()

/** In-process serialization for tests and explicitly injected non-browser storage only. */
const createStorageMutationLock = (storage: Storage): MutationLock => ({
  request: <T,>(_name: string, operation: () => T): Promise<T> => {
    const previous = storageMutationQueues.get(storage) ?? Promise.resolve()
    const result = previous.catch(() => undefined).then(operation)
    storageMutationQueues.set(storage, result.then(() => undefined, () => undefined))
    return result
  },
})

export const createUnavailableMutationLock = (): MutationLock => ({
  request: async () => {
    throw new RepositoryError('LOCK_UNAVAILABLE', 'Cross-tab mutation locking is unavailable.')
  },
})

export const createStudioRepository = (
  storage: Storage,
  mutationLock: MutationLock = createStorageMutationLock(storage),
): StudioRepository => {
  let lastKnownGood = cloneSeed()
  let recoveryPending = false

  const persistMutation = (data: StudioData): void => {
    const sanitized = sanitizeStudio(data) ?? emptyStudio()
    try {
      storage.setItem(STUDIO_STORAGE_KEY, JSON.stringify(sanitized))
    } catch (cause) {
      throw new RepositoryError(
        'PERSISTENCE_FAILED',
        'Studio changes could not be persisted.',
        { cause },
      )
    }
    lastKnownGood = cloneStudio(sanitized)
  }

  const scheduleRecovery = (fallback: StudioData): void => {
    if (recoveryPending) return
    recoveryPending = true
    void mutationLock.request(STUDIO_MUTATION_LOCK_NAME, () => {
      let payload: string | null
      try { payload = storage.getItem(STUDIO_STORAGE_KEY) } catch { return }
      if (payload === null) return
      let recovered = fallback
      try { recovered = sanitizeStudio(JSON.parse(payload)) ?? fallback } catch { /* use fallback */ }
      if (JSON.stringify(recovered) !== payload) persistMutation(recovered)
    }).catch(() => {
      // Reads remain available even when repair persistence or locking is unavailable.
    }).finally(() => { recoveryPending = false })
  }

  const read = (commitSnapshot = true): StudioData => {
    let payload: string | null
    try {
      payload = storage.getItem(STUDIO_STORAGE_KEY)
    } catch {
      return cloneStudio(lastKnownGood)
    }

    if (payload === null) {
      const seeded = cloneSeed()
      if (commitSnapshot) {
        lastKnownGood = cloneStudio(seeded)
      }
      return cloneStudio(seeded)
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(payload)
    } catch {
      const recovered = cloneStudio(lastKnownGood)
      if (commitSnapshot) scheduleRecovery(recovered)
      return recovered
    }

    const sanitized = sanitizeStudio(parsed)
    if (sanitized === null) {
      const recovered = cloneStudio(lastKnownGood)
      if (commitSnapshot) scheduleRecovery(recovered)
      return recovered
    }

    if (commitSnapshot) {
      lastKnownGood = cloneStudio(sanitized)
      if (JSON.stringify(sanitized) !== payload) scheduleRecovery(sanitized)
    }
    return cloneStudio(sanitized)
  }

  return {
    readSnapshot: () => read(),
    listProducts: () => read().products,
    saveProduct: (product, token) => mutationLock.request(STUDIO_MUTATION_LOCK_NAME, () => {
      const data = read(false)
      const stored = data.products.find(({ id }) => id === product.id)
      if (!isRecord(token) || !(token.expectedUpdatedAt === null || isString(token.expectedUpdatedAt))) {
        throw new RepositoryError('VALIDATION_FAILED', 'Product mutation token is required.')
      }
      if (
        (token.expectedUpdatedAt === null && stored !== undefined) ||
        (token.expectedUpdatedAt !== null && stored?.updatedAt !== token.expectedUpdatedAt)
      ) throw new RepositoryError('PRODUCT_CONFLICT', 'Product changed since it was loaded.')
      const name = isString(product.name) ? product.name.trim().normalize('NFC') : product.name
      const now = Date.now()
      const updatedAt = new Date(stored ? Math.max(now, Date.parse(stored.updatedAt) + 1) : now).toISOString()
      const validProduct = requireValid({
        ...product,
        name,
        createdAt: stored?.createdAt ?? updatedAt,
        updatedAt,
      }, isProduct)
      const normalizedName = validProduct.name.toLowerCase()
      if (data.products.some((candidate) =>
        candidate.id !== validProduct.id && candidate.name.trim().normalize('NFC').toLowerCase() === normalizedName,
      )) throw new RepositoryError('DUPLICATE_PRODUCT', `Product name "${validProduct.name}" already exists.`)
      persistMutation({ ...data, products: upsertProduct(data.products, validProduct) })
    }),
    migrateLegacyProductLifecycle: (productId) => mutationLock.request(STUDIO_MUTATION_LOCK_NAME, () => {
      const data = read(false)
      const stored = data.products.find(({ id }) => id === productId)
      if (!stored || stored.status !== 'archived' || stored.archivedAt !== null) return
      const updatedAt = new Date(Math.max(Date.now(), Date.parse(stored.updatedAt) + 1)).toISOString()
      persistMutation({
        ...data,
        products: upsertProduct(data.products, { ...stored, status: 'developing', updatedAt }),
      })
    }),
    listWorkItems: (productId) => read().workItems.filter((item) => item.productId === productId),
    saveWorkItem: (item) => mutationLock.request(STUDIO_MUTATION_LOCK_NAME, () => {
      const validItem = requireValid(item, isWorkItem)
      const data = read(false)
      requireProduct(data, validItem.productId)
      persistMutation({ ...data, workItems: upsertChild(data.workItems, validItem) })
    }),
    listVersions: (productId) => read().versions.filter((version) => version.productId === productId),
    saveVersion: (version) => mutationLock.request(STUDIO_MUTATION_LOCK_NAME, () => {
      const validVersion = requireValid({ ...version, number: version.number.trim() }, isVersion)
      const data = read(false)
      requireProduct(data, validVersion.productId)
      const duplicate = data.versions.some((storedVersion) =>
        storedVersion.productId === validVersion.productId &&
        storedVersion.id !== validVersion.id &&
        storedVersion.number === validVersion.number,
      )
      if (duplicate) {
        throw new RepositoryError(
          'DUPLICATE_VERSION',
          `Version number "${validVersion.number}" already exists for this product.`,
        )
      }
      persistMutation({ ...data, versions: upsertChild(data.versions, validVersion) })
    }),
    listDocuments: (productId) => read().documents.filter((document) => document.productId === productId),
    saveDocument: (document, token) => mutationLock.request(STUDIO_MUTATION_LOCK_NAME, () => {
      if (!isNonEmptyString(document.id) || !isNonEmptyString(document.productId)) {
        throw new RepositoryError('VALIDATION_FAILED', 'Document identifiers are required.')
      }
      const nameValidation = isString(document.name)
        ? validateDocumentName(document.name)
        : { valid: false as const }
      const data = read(false)
      requireProduct(data, document.productId)
      const stored = data.documents.find(
        (candidate) => candidate.productId === document.productId && candidate.id === document.id,
      )
      if (!isRecord(token) || !(token.expectedUpdatedAt === null || isString(token.expectedUpdatedAt))) {
        throw new RepositoryError('VALIDATION_FAILED', 'Document mutation token is required.')
      }
      if (
        (token.expectedUpdatedAt === null && stored !== undefined) ||
        (token.expectedUpdatedAt !== null && stored?.updatedAt !== token.expectedUpdatedAt)
      ) {
        throw new RepositoryError('DOCUMENT_CONFLICT', 'Document changed since it was loaded.')
      }
      const now = new Date().toISOString()
      const timestamp = stored
        ? new Date(Math.max(Date.now(), Date.parse(stored.updatedAt) + 1)).toISOString()
        : now
      const candidate = {
        ...document,
        name: nameValidation.valid ? nameValidation.name : document.name,
        createdAt: stored?.createdAt ?? timestamp,
        updatedAt: timestamp,
      }
      const validDocument = requireValid(candidate, isDocument)
      const normalizedName = normalizeDocumentName(validDocument.name)
      const duplicate = data.documents.some((storedDocument) =>
        storedDocument.productId === validDocument.productId &&
        storedDocument.id !== validDocument.id &&
        normalizeDocumentName(storedDocument.name) === normalizedName,
      )
      if (duplicate) {
        throw new RepositoryError(
          'DUPLICATE_DOCUMENT',
          `Document name "${validDocument.name}" already exists for this product.`,
        )
      }
      persistMutation({ ...data, documents: upsertChild(data.documents, validDocument) })
    }),
    reset: () => mutationLock.request(STUDIO_MUTATION_LOCK_NAME, () => persistMutation(emptyStudio())),
  }
}
