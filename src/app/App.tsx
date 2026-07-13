import { useCallback, useState } from 'react'
import { BrowserRouter, MemoryRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { createStudioRepository, type StudioRepository } from '../data/studioRepository'
import { AppShell } from './AppShell'
import { ProductDetail } from './ProductDetail'
import { ProductGrid } from './ProductGrid'

interface AppProps { repository?: StudioRepository; initialEntries?: string[] }

export default function App({ repository: injectedRepository, initialEntries }: AppProps) {
  const [repository] = useState(() => injectedRepository ?? createStudioRepository(localStorage))
  const [products, setProducts] = useState(() => repository.listProducts())
  const refresh = useCallback(() => setProducts(repository.listProducts()), [repository])
  const Router = initialEntries ? MemoryRouter : BrowserRouter

  return (
    <Router {...(initialEntries ? { initialEntries } : {})}>
      <Routes>
        <Route path="/" element={<Navigate to="/products" replace />} />
        <Route path="/products" element={<Workspace products={products}><ProductGrid products={products} repository={repository} onRefresh={refresh} /></Workspace>} />
        <Route path="/products/:productId/:tab?" element={<Workspace products={products}><ProductDetail products={products} repository={repository} onRefresh={refresh} /></Workspace>} />
        <Route path="*" element={<Navigate to="/products" replace />} />
      </Routes>
    </Router>
  )
}

function Workspace({ products, children }: { products: ReturnType<StudioRepository['listProducts']>; children: React.ReactNode }) {
  const { productId } = useParams()
  return <AppShell products={products} currentProductId={productId}>{children}</AppShell>
}
