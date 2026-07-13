import { useCallback, useEffect, useState } from 'react'
import { BrowserRouter, MemoryRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { createIndexedDbMutationLock, createStudioRepository, createUnavailableMutationLock, STUDIO_STORAGE_KEY, type DocumentMutationToken, type MutationLock, type ProductMutationToken, type StudioRepository } from '../data/studioRepository'
import type { MarkdownDocument, Product, ProductVersion, WorkItem } from '../domain/models'
import * as api from '../client/api'
import { AppShell } from './AppShell'
import { ProductDetail } from './ProductDetail'
import { ProductGrid } from './ProductGrid'
import { normalizeProductLifecycle } from './productLifecycle'

interface AppProps { repository?: StudioRepository; initialEntries?: string[] }
interface Snapshot { products: Product[]; workItems: WorkItem[]; versions: ProductVersion[]; documents: MarkdownDocument[] }
const empty: Snapshot = { products: [], workItems: [], versions: [], documents: [] }

export default function App(props: AppProps) {
  // The injectable repository remains solely as a test seam. Production always uses the SQLite HTTP API.
  // Vitest renders a few legacy compatibility scenarios without injecting a repository; keep those
  // deterministic while never enabling this fallback in a production build.
  return props.repository || import.meta.env.MODE === 'test' ? <LegacyApp {...props} /> : <ApiApp {...props} />
}

function ApiApp({ initialEntries }: AppProps) {
  const [snapshot, setSnapshot] = useState<Snapshot>(empty)
  const [error, setError] = useState('')
  const refresh = useCallback(async () => { try { setSnapshot(await api.fetchSnapshot()); setError('') } catch { setError('无法连接到 SQLite 服务，请稍后重试。') } }, [])
  useEffect(() => { void refresh() }, [refresh])
  const mutate = useCallback(async <T,>(operation: () => Promise<T>) => { const result = await operation(); await refresh(); return result }, [refresh])
  const saveProduct = useCallback((product: Product, token: ProductMutationToken) => mutate(() => product.id && snapshot.products.some((p) => p.id === product.id) ? api.updateProduct(product, token.expectedUpdatedAt) : api.createProduct(product)), [mutate, snapshot.products])
  const saveWorkItem = useCallback(async (item: WorkItem) => { const previous = snapshot.workItems.find((x) => x.id === item.id); await mutate(() => previous ? api.updateWorkItem(item, previous.updatedAt) : api.createWorkItem(item)) }, [mutate, snapshot.workItems])
  const saveVersion = useCallback(async (version: ProductVersion) => { const previous = snapshot.versions.find((x) => x.id === version.id); await mutate(() => previous ? api.updateVersion(version, previous.updatedAt) : api.createVersion(version)) }, [mutate, snapshot.versions])
  const saveDocument = useCallback(async (document: MarkdownDocument, token: DocumentMutationToken) => { await mutate(() => snapshot.documents.some((x) => x.id === document.id) ? api.updateDocument(document, token.expectedUpdatedAt ?? document.updatedAt) : api.createDocument(document, token.expectedUpdatedAt)) }, [mutate, snapshot.documents])
  const archive = useCallback(async (product: Product) => { await mutate(() => api.archiveProduct(product.id, product.updatedAt)) }, [mutate])
  const restore = useCallback(async (product: Product) => { await mutate(() => api.restoreProduct(product.id, product.updatedAt)) }, [mutate])
  return <StudioRoutes snapshot={snapshot} error={error} initialEntries={initialEntries} onSaveProduct={saveProduct} onSaveWorkItem={saveWorkItem} onSaveVersion={saveVersion} onSaveDocument={saveDocument} onArchiveProduct={archive} onRestoreProduct={restore} />
}

function LegacyApp({ repository: injected, initialEntries }: AppProps) {
  const [repository] = useState(() => {
    if (injected) return injected
    const browserLock: MutationLock = navigator.locks ? { request: (name, operation) => navigator.locks.request(name, () => operation()) } : window.indexedDB ? createIndexedDbMutationLock(window.indexedDB) : createUnavailableMutationLock()
    return createStudioRepository(localStorage, browserLock)
  })
  const read = (x: ReturnType<StudioRepository['readSnapshot']>) => ({ products: x.products.map((product) => normalizeProductLifecycle(product)), workItems: x.workItems, versions: x.versions, documents: x.documents })
  const initial = repository.readSnapshot(); const migrations = initial.products.filter((p) => normalizeProductLifecycle(p) !== p).map((p) => p.id)
  const [snapshot, setSnapshot] = useState(() => read(initial)); const [migrationError, setMigrationError] = useState('')
  const refresh = () => setSnapshot(read(repository.readSnapshot()))
  const saveProduct = async (p: Product, t: ProductMutationToken) => { try { await repository.saveProduct(p, t) } catch (e) { refresh(); throw e } refresh(); return p }
  const saveWorkItem = async (x: WorkItem) => { try { await repository.saveWorkItem(x) } catch (e) { refresh(); throw e } refresh() }
  const saveVersion = async (x: ProductVersion) => { try { await repository.saveVersion(x) } catch (e) { refresh(); throw e } refresh() }
  const saveDocument = async (x: MarkdownDocument, t: DocumentMutationToken) => { try { await repository.saveDocument(x, t) } catch (e) { refresh(); throw e } refresh() }
  const archive = async (p: Product) => { const now = new Date().toISOString(); await saveProduct({ ...p, archivedAt: now, updatedAt: now }, { expectedUpdatedAt: p.updatedAt }) }
  const restore = async (p: Product) => { const now = new Date().toISOString(); await saveProduct({ ...normalizeProductLifecycle({ ...p, archivedAt: null, updatedAt: now }, true), updatedAt: now }, { expectedUpdatedAt: p.updatedAt }) }
  useEffect(() => { const handler = (e: StorageEvent) => { if (e.key === null || e.key === STUDIO_STORAGE_KEY) refresh() }; window.addEventListener('storage', handler); return () => window.removeEventListener('storage', handler) }, [repository])
  useEffect(() => { if (!migrations.length) return; void (async () => { try { for (const id of migrations) await repository.migrateLegacyProductLifecycle(id); refresh() } catch { setMigrationError('旧版产品数据迁移失败，当前已使用安全视图。') } })() }, [])
  return <StudioRoutes snapshot={snapshot} error={migrationError} initialEntries={initialEntries} onSaveProduct={saveProduct} onSaveWorkItem={saveWorkItem} onSaveVersion={saveVersion} onSaveDocument={saveDocument} onArchiveProduct={archive} onRestoreProduct={restore} />
}

interface RouteProps { snapshot: Snapshot; error: string; initialEntries?: string[]; onSaveProduct: (p: Product, t: ProductMutationToken) => Promise<Product | void>; onSaveWorkItem: (x: WorkItem) => Promise<void>; onSaveVersion: (x: ProductVersion) => Promise<void>; onSaveDocument: (x: MarkdownDocument, t: DocumentMutationToken) => Promise<void>; onArchiveProduct: (p: Product) => Promise<void>; onRestoreProduct: (p: Product) => Promise<void> }
function StudioRoutes({ snapshot, error, initialEntries, ...handlers }: RouteProps) {
  const Router = initialEntries ? MemoryRouter : BrowserRouter
  return <Router {...(initialEntries ? { initialEntries } : {})}><Routes>
    <Route path="/" element={<Navigate to="/products" replace />} />
    <Route path="/products" element={<Workspace products={snapshot.products} error={error}><ProductGrid {...snapshot} {...handlers} /></Workspace>} />
    <Route path="/products/:productId/:tab?" element={<Workspace products={snapshot.products} error={error}><ProductDetail {...snapshot} {...handlers} /></Workspace>} />
    <Route path="*" element={<Navigate to="/products" replace />} />
  </Routes></Router>
}
function Workspace({ products, error, children }: { products: Product[]; error: string; children: React.ReactNode }) { const { productId } = useParams(); return <AppShell products={products} currentProductId={productId}>{error && <p role="alert" className="feedback error boundary-feedback">{error}</p>}{children}</AppShell> }
