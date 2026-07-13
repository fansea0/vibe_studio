import { useCallback, useEffect, useState } from 'react'
import { BrowserRouter, MemoryRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { createStudioRepository, STUDIO_STORAGE_KEY, type DocumentLock, type StudioRepository } from '../data/studioRepository'
import type { MarkdownDocument, Product, ProductVersion, WorkItem } from '../domain/models'
import { AppShell } from './AppShell'
import { ProductDetail } from './ProductDetail'
import { ProductGrid } from './ProductGrid'
import { normalizeProductLifecycle } from './productLifecycle'

interface AppProps { repository?: StudioRepository; initialEntries?: string[] }
interface StudioSnapshot { products: Product[]; workItems: WorkItem[]; versions: ProductVersion[]; documents: MarkdownDocument[] }
interface StudioState { snapshot: StudioSnapshot; migrationError: string }

const readStudioState = (repository: StudioRepository): StudioState => {
  const stored = repository.readSnapshot()
  const storedProducts = stored.products
  let migrationError = ''
  const products = storedProducts.map((product) => {
    const normalized = normalizeProductLifecycle(product)
    if (normalized !== product) {
      try {
        repository.saveProduct(normalized)
      } catch {
        migrationError = '旧版产品数据迁移失败，当前已使用安全视图。'
      }
    }
    return normalized
  })
  return {
    snapshot: {
      products,
      workItems: stored.workItems,
      versions: stored.versions,
      documents: stored.documents,
    },
    migrationError,
  }
}

export default function App({ repository: injectedRepository, initialEntries }: AppProps) {
  const [repository] = useState(() => {
    if (injectedRepository) return injectedRepository
    const browserLock: DocumentLock | undefined = navigator.locks
      ? { request: (operation) => navigator.locks.request('vibe-studio:documents', operation) }
      : undefined
    return createStudioRepository(localStorage, browserLock)
  })
  const [studioState, setStudioState] = useState(() => readStudioState(repository))
  const { snapshot, migrationError } = studioState
  const saveProduct = useCallback((product: Product) => {
    repository.saveProduct(product)
    setStudioState(readStudioState(repository))
  }, [repository])
  const saveWorkItem = useCallback((item: WorkItem) => {
    repository.saveWorkItem(item)
    setStudioState(readStudioState(repository))
  }, [repository])
  const saveVersion = useCallback((version: ProductVersion) => {
    repository.saveVersion(version)
    setStudioState(readStudioState(repository))
  }, [repository])
  const saveDocument = useCallback(async (document: MarkdownDocument, expectedUpdatedAt?: string) => {
    try {
      await repository.saveDocument(document, expectedUpdatedAt)
    } catch (error) {
      setStudioState(readStudioState(repository))
      throw error
    }
    setStudioState(readStudioState(repository))
  }, [repository])
  const archiveProduct = useCallback((product: Product) => {
    const now = new Date().toISOString()
    saveProduct({ ...product, archivedAt: now, updatedAt: now })
  }, [saveProduct])
  const restoreProduct = useCallback((product: Product) => {
    const restored = normalizeProductLifecycle({
      ...product,
      archivedAt: null,
      updatedAt: new Date().toISOString(),
    }, true)
    saveProduct(restored)
  }, [saveProduct])
  useEffect(() => {
    const refreshFromStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === STUDIO_STORAGE_KEY) {
        setStudioState(readStudioState(repository))
      }
    }
    window.addEventListener('storage', refreshFromStorage)
    return () => window.removeEventListener('storage', refreshFromStorage)
  }, [repository])
  const Router = initialEntries ? MemoryRouter : BrowserRouter

  return (
    <Router {...(initialEntries ? { initialEntries } : {})}>
      <Routes>
        <Route path="/" element={<Navigate to="/products" replace />} />
        <Route path="/products" element={<Workspace products={snapshot.products} migrationError={migrationError}><ProductGrid {...snapshot} onSaveProduct={saveProduct} onRestoreProduct={restoreProduct} /></Workspace>} />
        <Route path="/products/:productId/:tab?" element={<Workspace products={snapshot.products} migrationError={migrationError}><ProductDetail {...snapshot} onSaveProduct={saveProduct} onSaveWorkItem={saveWorkItem} onSaveVersion={saveVersion} onSaveDocument={saveDocument} onArchiveProduct={archiveProduct} onRestoreProduct={restoreProduct} /></Workspace>} />
        <Route path="*" element={<Navigate to="/products" replace />} />
      </Routes>
    </Router>
  )
}

function Workspace({ products, migrationError, children }: { products: ReturnType<StudioRepository['listProducts']>; migrationError: string; children: React.ReactNode }) {
  const { productId } = useParams()
  return <AppShell products={products} currentProductId={productId}>{migrationError && <p role="alert" className="feedback error boundary-feedback">{migrationError}</p>}{children}</AppShell>
}
