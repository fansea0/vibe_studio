import { useCallback, useEffect, useState } from 'react'
import { BrowserRouter, MemoryRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { createStudioRepository, STUDIO_STORAGE_KEY, type StudioRepository } from '../data/studioRepository'
import type { Product, ProductVersion, WorkItem } from '../domain/models'
import { AppShell } from './AppShell'
import { ProductDetail } from './ProductDetail'
import { ProductGrid } from './ProductGrid'

interface AppProps { repository?: StudioRepository; initialEntries?: string[] }
interface StudioSnapshot { products: Product[]; workItems: WorkItem[]; versions: ProductVersion[] }

const readStudioSnapshot = (repository: StudioRepository): StudioSnapshot => {
  const products = repository.listProducts()
  return {
    products,
    workItems: products.flatMap(({ id }) => repository.listWorkItems(id)),
    versions: products.flatMap(({ id }) => repository.listVersions(id)),
  }
}

export default function App({ repository: injectedRepository, initialEntries }: AppProps) {
  const [repository] = useState(() => injectedRepository ?? createStudioRepository(localStorage))
  const [snapshot, setSnapshot] = useState(() => readStudioSnapshot(repository))
  const saveProduct = useCallback((product: Product) => {
    repository.saveProduct(product)
    setSnapshot(readStudioSnapshot(repository))
  }, [repository])
  const archiveProduct = useCallback((product: Product) => {
    const now = new Date().toISOString()
    saveProduct({ ...product, archivedAt: now, updatedAt: now })
  }, [saveProduct])
  const restoreProduct = useCallback((product: Product) => {
    saveProduct({ ...product, archivedAt: null, updatedAt: new Date().toISOString() })
  }, [saveProduct])
  useEffect(() => {
    const refreshFromStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === STUDIO_STORAGE_KEY) {
        setSnapshot(readStudioSnapshot(repository))
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
        <Route path="/products" element={<Workspace products={snapshot.products}><ProductGrid {...snapshot} onSaveProduct={saveProduct} onRestoreProduct={restoreProduct} /></Workspace>} />
        <Route path="/products/:productId/:tab?" element={<Workspace products={snapshot.products}><ProductDetail {...snapshot} onSaveProduct={saveProduct} onArchiveProduct={archiveProduct} onRestoreProduct={restoreProduct} /></Workspace>} />
        <Route path="*" element={<Navigate to="/products" replace />} />
      </Routes>
    </Router>
  )
}

function Workspace({ products, children }: { products: ReturnType<StudioRepository['listProducts']>; children: React.ReactNode }) {
  const { productId } = useParams()
  return <AppShell products={products} currentProductId={productId}>{children}</AppShell>
}
