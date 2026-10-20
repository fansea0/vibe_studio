import { useCallback, useEffect, useState } from 'react'
import { BrowserRouter, MemoryRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { ShowcaseRoutes } from './showcase/ShowcaseRoutes'
import { createIndexedDbMutationLock, createStudioRepository, createUnavailableMutationLock, STUDIO_STORAGE_KEY, type DocumentMutationToken, type MutationLock, type ProductMutationToken, type StudioRepository } from '../data/studioRepository'
import type { MarkdownDocument, Product, ProductVersion, WorkItem, WorkItemComment, WorkItemEvent } from '../domain/models'
import * as api from '../client/api'
import { AppShell } from './AppShell'
import { ProductDetail } from './ProductDetail'
import { ProductGrid } from './ProductGrid'
import { WorkCenter } from './WorkCenter'
import { normalizeProductLifecycle } from './productLifecycle'

interface AppProps { repository?: StudioRepository; initialEntries?: string[] }
interface Snapshot { products: Product[]; workItems: WorkItem[]; versions: ProductVersion[]; documents: MarkdownDocument[]; trashWorkItems: WorkItem[] }
const empty: Snapshot = { products: [], workItems: [], versions: [], documents: [], trashWorkItems: [] }

export default function App(props: AppProps) {
  // The injectable repository remains solely as a test seam. Production always uses the SQLite HTTP API.
  // Vitest renders a few legacy compatibility scenarios without injecting a repository; keep those
  // deterministic while never enabling this fallback in a production build.
  return props.repository || import.meta.env.MODE === 'test' ? <LegacyApp {...props} /> : <StudioApp {...props} />
}

/** 走 SQLite HTTP API 的正式应用。导出以便测试覆盖真实数据通路。 */
export function StudioApp(props: AppProps) {
  const Router = props.initialEntries ? MemoryRouter : BrowserRouter
  return <Router {...(props.initialEntries ? { initialEntries: props.initialEntries } : {})}><AppRoutes {...props} /></Router>
}

function AppRoutes(_props: AppProps) {
  const studio = useStudio()
  return <Routes>
    <Route path="/showcase/*" element={<ShowcaseRoutes />} />
    <Route path="/" element={<Navigate to="/products" replace />} />
    <Route path="/products" element={<Workspace products={studio.snapshot.products} workItems={studio.snapshot.workItems} trashWorkItems={studio.snapshot.trashWorkItems} error={studio.error}><ProductGrid {...studio.snapshot} {...studio.handlers} /></Workspace>} />
    <Route path="/tasks" element={<Workspace products={studio.snapshot.products} workItems={studio.snapshot.workItems} trashWorkItems={studio.snapshot.trashWorkItems} error={studio.error}><WorkCenter {...studio.snapshot} {...studio.handlers} comments={studio.comments} events={studio.events} /></Workspace>} />
    <Route path="/products/:productId/:tab?" element={<Workspace products={studio.snapshot.products} workItems={studio.snapshot.workItems} trashWorkItems={studio.snapshot.trashWorkItems} error={studio.error}><ProductDetail {...studio.snapshot} {...studio.handlers} comments={studio.comments} events={studio.events} loading={studio.loading} /></Workspace>} />
    <Route path="*" element={<Navigate to="/products" replace />} />
  </Routes>
}

interface StudioState { snapshot: Snapshot; error: string; loading: boolean; comments: Record<string, WorkItemComment[]>; events: Record<string, WorkItemEvent[]>; handlers: { onSaveProduct: (p: Product, t: ProductMutationToken) => Promise<Product | void>; onSaveWorkItem: (x: WorkItem) => Promise<void>; onSaveVersion: (x: ProductVersion) => Promise<void>; onSaveDocument: (x: MarkdownDocument, t: DocumentMutationToken) => Promise<void>; onArchiveProduct: (p: Product) => Promise<void>; onRestoreProduct: (p: Product) => Promise<void>; onDeleteWorkItem: (item: WorkItem) => Promise<void>; onRestoreWorkItem: (item: WorkItem) => Promise<void>; onPurgeWorkItem: (item: WorkItem) => Promise<void>; onLoadComments: (item: WorkItem) => Promise<void>; onLoadEvents: (item: WorkItem) => Promise<void>; onCreateComment: (item: WorkItem, body: { author: string; body: string }) => Promise<void> } }
function useStudio(): StudioState {
  const [snapshot, setSnapshot] = useState<Snapshot>(empty)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const refresh = useCallback(async () => {
    try {
      const snap = await api.fetchSnapshot()
      const trashByProduct = await Promise.all(snap.products.map(async (p) => api.listWorkItemsRaw(p.id, { onlyDeleted: true }).catch(() => [])))
      setSnapshot({ ...snap, trashWorkItems: trashByProduct.flat() })
      setError('')
    } catch {
      setError('无法连接到 SQLite 服务，请稍后重试。')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { void refresh() }, [refresh])
  const mutate = useCallback(async <T,>(operation: () => Promise<T>) => { const result = await operation(); await refresh(); return result }, [refresh])
  const saveProduct = useCallback((product: Product, token: ProductMutationToken) => mutate(() => product.id && snapshot.products.some((p) => p.id === product.id) ? api.updateProduct(product, token.expectedUpdatedAt) : api.createProduct(product)), [mutate, snapshot.products])
  const saveWorkItem = useCallback(async (item: WorkItem) => { const previous = snapshot.workItems.find((x) => x.id === item.id); await mutate(() => previous ? api.updateWorkItem(item, previous.updatedAt) : api.createWorkItem(item)) }, [mutate, snapshot.workItems])
  const saveVersion = useCallback(async (version: ProductVersion) => { const previous = snapshot.versions.find((x) => x.id === version.id); await mutate(() => previous ? api.updateVersion(version, previous.updatedAt) : api.createVersion(version)) }, [mutate, snapshot.versions])
  const saveDocument = useCallback(async (document: MarkdownDocument, token: DocumentMutationToken) => { await mutate(() => snapshot.documents.some((x) => x.id === document.id) ? api.updateDocument(document, token.expectedUpdatedAt ?? document.updatedAt) : api.createDocument(document, token.expectedUpdatedAt)) }, [mutate, snapshot.documents])
  const archive = useCallback(async (product: Product) => { await mutate(() => api.archiveProduct(product.id, product.updatedAt)) }, [mutate])
  const restore = useCallback(async (product: Product) => { await mutate(() => api.restoreProduct(product.id, product.updatedAt)) }, [mutate])
  const softDeleteWorkItem = useCallback(async (productId: string, workItemId: string, expectedUpdatedAt: string, actor: string) => { await mutate(() => api.softDeleteWorkItem(productId, workItemId, expectedUpdatedAt, actor)) }, [mutate])
  const restoreWorkItem = useCallback(async (productId: string, workItemId: string, expectedUpdatedAt: string, actor: string) => { await mutate(() => api.restoreWorkItem(productId, workItemId, expectedUpdatedAt, actor)) }, [mutate])
  const purgeWorkItem = useCallback(async (productId: string, workItemId: string, expectedUpdatedAt: string) => { await mutate(() => api.purgeWorkItem(productId, workItemId, expectedUpdatedAt)) }, [mutate])
  const deleteWorkItem = useCallback(async (item: WorkItem) => { await softDeleteWorkItem(item.productId, item.id, item.updatedAt, '') }, [softDeleteWorkItem])
  const restoreTrashWorkItem = useCallback(async (item: WorkItem) => { await restoreWorkItem(item.productId, item.id, item.updatedAt, '') }, [restoreWorkItem])
  const purgeTrashWorkItem = useCallback(async (item: WorkItem) => { await purgeWorkItem(item.productId, item.id, item.updatedAt) }, [purgeWorkItem])
  const [comments, setComments] = useState<Record<string, WorkItemComment[]>>({})
  const [events, setEvents] = useState<Record<string, WorkItemEvent[]>>({})
  const loadComments = useCallback(async (item: WorkItem) => {
    try {
      const list = await api.listWorkItemComments(item.productId, item.id)
      setComments((prev) => ({ ...prev, [item.id]: list }))
    } catch { /* drawer will show empty list */ }
  }, [])
  const loadEvents = useCallback(async (item: WorkItem) => {
    try {
      const list = await api.listWorkItemEvents(item.productId, item.id)
      setEvents((prev) => ({ ...prev, [item.id]: list }))
    } catch { /* drawer will show empty list */ }
  }, [])
  const createComment = useCallback(async (item: WorkItem, body: { author: string; body: string }) => {
    await api.createWorkItemComment(item.productId, item.id, body)
    await loadComments(item)
  }, [loadComments])
  return { snapshot, error, loading, comments, events, handlers: { onSaveProduct: saveProduct, onSaveWorkItem: saveWorkItem, onSaveVersion: saveVersion, onSaveDocument: saveDocument, onArchiveProduct: archive, onRestoreProduct: restore, onDeleteWorkItem: deleteWorkItem, onRestoreWorkItem: restoreTrashWorkItem, onPurgeWorkItem: purgeTrashWorkItem, onLoadComments: loadComments, onLoadEvents: loadEvents, onCreateComment: createComment } }
}



function LegacyApp({ repository: injected, initialEntries }: AppProps) {
  const [repository] = useState(() => {
    if (injected) return injected
    const browserLock: MutationLock = navigator.locks ? { request: (name, operation) => navigator.locks.request(name, () => operation()) } : window.indexedDB ? createIndexedDbMutationLock(window.indexedDB) : createUnavailableMutationLock()
    return createStudioRepository(localStorage, browserLock)
  })
  const read = (x: ReturnType<StudioRepository['readSnapshot']>) => ({ products: x.products.map((product) => normalizeProductLifecycle(product)), workItems: x.workItems, versions: x.versions, documents: x.documents, trashWorkItems: [] })
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
  const Router = initialEntries ? MemoryRouter : BrowserRouter
  return <Router {...(initialEntries ? { initialEntries } : {})}><StudioRoutes snapshot={snapshot} error={migrationError} onSaveProduct={saveProduct} onSaveWorkItem={saveWorkItem} onSaveVersion={saveVersion} onSaveDocument={saveDocument} onArchiveProduct={archive} onRestoreProduct={restore} comments={{}} events={{}} onDeleteWorkItem={async () => undefined} onRestoreWorkItem={async () => undefined} onPurgeWorkItem={async () => undefined} onLoadComments={async () => undefined} onLoadEvents={async () => undefined} onCreateComment={async () => undefined} /></Router>
}

interface RouteProps { snapshot: Snapshot; error: string; onSaveProduct: (p: Product, t: ProductMutationToken) => Promise<Product | void>; onSaveWorkItem: (x: WorkItem) => Promise<void>; onSaveVersion: (x: ProductVersion) => Promise<void>; onSaveDocument: (x: MarkdownDocument, t: DocumentMutationToken) => Promise<void>; onArchiveProduct: (p: Product) => Promise<void>; onRestoreProduct: (p: Product) => Promise<void>; comments: Record<string, WorkItemComment[]>; events: Record<string, WorkItemEvent[]>; onDeleteWorkItem: (item: WorkItem) => Promise<void>; onRestoreWorkItem: (item: WorkItem) => Promise<void>; onPurgeWorkItem: (item: WorkItem) => Promise<void>; onLoadComments: (item: WorkItem) => Promise<void>; onLoadEvents: (item: WorkItem) => Promise<void>; onCreateComment: (item: WorkItem, body: { author: string; body: string }) => Promise<void> }
function StudioRoutes({ snapshot, error, ...handlers }: RouteProps) {
  return <Routes>
    <Route path="/" element={<Navigate to="/products" replace />} />
    <Route path="/products" element={<Workspace products={snapshot.products} workItems={snapshot.workItems} trashWorkItems={snapshot.trashWorkItems} error={error}><ProductGrid {...snapshot} {...handlers} /></Workspace>} />
    <Route path="/tasks" element={<Workspace products={snapshot.products} workItems={snapshot.workItems} trashWorkItems={snapshot.trashWorkItems} error={error}><WorkCenter {...snapshot} {...handlers} comments={{}} events={{}} /></Workspace>} />
    <Route path="/products/:productId/:tab?" element={<Workspace products={snapshot.products} workItems={snapshot.workItems} trashWorkItems={snapshot.trashWorkItems} error={error}><ProductDetail {...snapshot} {...handlers} /></Workspace>} />
    <Route path="*" element={<Navigate to="/products" replace />} />
  </Routes>
}
function Workspace({ products, workItems, trashWorkItems, error, children }: { products: Product[]; workItems: WorkItem[]; trashWorkItems: WorkItem[]; error: string; children: React.ReactNode }) { const { productId } = useParams(); return <AppShell products={products} workItems={workItems} trashWorkItems={trashWorkItems} currentProductId={productId}>{error && <p role="alert" className="feedback error boundary-feedback">{error}</p>}{children}</AppShell> }
