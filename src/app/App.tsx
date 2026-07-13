import { useCallback, useEffect, useState } from 'react'
import { BrowserRouter, MemoryRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { createStudioRepository, createUnavailableMutationLock, STUDIO_STORAGE_KEY, type DocumentMutationToken, type MutationLock, type StudioRepository } from '../data/studioRepository'
import type { MarkdownDocument, Product, ProductVersion, WorkItem } from '../domain/models'
import { AppShell } from './AppShell'
import { ProductDetail } from './ProductDetail'
import { ProductGrid } from './ProductGrid'
import { normalizeProductLifecycle } from './productLifecycle'

interface AppProps { repository?: StudioRepository; initialEntries?: string[] }
interface StudioSnapshot { products: Product[]; workItems: WorkItem[]; versions: ProductVersion[]; documents: MarkdownDocument[] }
interface StudioState { snapshot: StudioSnapshot; migrationError: string; migrations: Product[] }

const readStudioState = (repository: StudioRepository): StudioState => {
  const stored = repository.readSnapshot()
  const storedProducts = stored.products
  const products = storedProducts.map((product) => normalizeProductLifecycle(product))
  return {
    snapshot: {
      products,
      workItems: stored.workItems,
      versions: stored.versions,
      documents: stored.documents,
    },
    migrationError: '',
    migrations: products.filter((product, index) => product !== storedProducts[index]),
  }
}

export default function App({ repository: injectedRepository, initialEntries }: AppProps) {
  const [repository] = useState(() => {
    if (injectedRepository) return injectedRepository
    const browserLock: MutationLock = navigator.locks
      ? { request: (operation) => navigator.locks.request('vibe-studio:documents', operation) }
      : createUnavailableMutationLock()
    return createStudioRepository(localStorage, browserLock)
  })
  const [studioState, setStudioState] = useState(() => readStudioState(repository))
  const [initialMigrations] = useState(() => studioState.migrations)
  const { snapshot, migrationError } = studioState
  const saveProduct = useCallback(async (product: Product) => {
    try { await repository.saveProduct(product) } catch (error) {
      setStudioState(readStudioState(repository)); throw error
    }
    setStudioState(readStudioState(repository))
  }, [repository])
  const saveWorkItem = useCallback(async (item: WorkItem) => {
    try { await repository.saveWorkItem(item) } catch (error) {
      setStudioState(readStudioState(repository)); throw error
    }
    setStudioState(readStudioState(repository))
  }, [repository])
  const saveVersion = useCallback(async (version: ProductVersion) => {
    try { await repository.saveVersion(version) } catch (error) {
      setStudioState(readStudioState(repository)); throw error
    }
    setStudioState(readStudioState(repository))
  }, [repository])
  const saveDocument = useCallback(async (document: MarkdownDocument, token: DocumentMutationToken) => {
    try {
      await repository.saveDocument(document, token)
    } catch (error) {
      setStudioState(readStudioState(repository))
      throw error
    }
    setStudioState(readStudioState(repository))
  }, [repository])
  const archiveProduct = useCallback(async (product: Product) => {
    const now = new Date().toISOString()
    await saveProduct({ ...product, archivedAt: now, updatedAt: now })
  }, [saveProduct])
  const restoreProduct = useCallback(async (product: Product) => {
    const restored = normalizeProductLifecycle({
      ...product,
      archivedAt: null,
      updatedAt: new Date().toISOString(),
    }, true)
    await saveProduct(restored)
  }, [saveProduct])
  useEffect(() => {
    let cancelled = false
    const migrate = async () => {
      const migrations = initialMigrations
      if (migrations.length === 0) return
      try {
        for (const product of migrations) await repository.saveProduct(product)
        if (!cancelled) setStudioState(readStudioState(repository))
      } catch {
        if (!cancelled) setStudioState((current) => ({
          ...current,
          migrationError: '旧版产品数据迁移失败，当前已使用安全视图。',
        }))
      }
    }
    void migrate()
    return () => { cancelled = true }
  }, [initialMigrations, repository])
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
