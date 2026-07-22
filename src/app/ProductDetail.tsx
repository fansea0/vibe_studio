import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import type { DocumentMutationToken, ProductMutationToken } from '../data/studioRepository'
import type { MarkdownDocument, Product, ProductVersion, WorkItem } from '../domain/models'
import { deriveProductMetrics } from '../domain/productMetrics'
import { DocumentWorkspace } from './DocumentWorkspace'
import { ProductOverview } from './ProductOverview'
import { ProductSettings } from './ProductSettings'
import { TaskBoard } from './TaskBoard'
import { VersionList } from './VersionList'
import { getSafeHttpsUrl } from './productForm'
import { mutationErrorMessage } from './mutationError'

interface ProductDetailProps {
  products: Product[]
  workItems: WorkItem[]
  versions: ProductVersion[]
  documents: MarkdownDocument[]
  onSaveProduct: (product: Product, token: ProductMutationToken) => Promise<Product | void>
  onSaveWorkItem: (item: WorkItem) => Promise<void>
  onSaveVersion: (version: ProductVersion) => Promise<void>
  onSaveDocument: (document: MarkdownDocument, token: DocumentMutationToken) => Promise<void>
  onArchiveProduct: (product: Product) => Promise<void>
  onRestoreProduct: (product: Product) => Promise<void>
}
const tabs = [
  { id: 'overview', label: '概览' }, { id: 'tasks', label: '任务' }, { id: 'versions', label: '版本' },
  { id: 'documents', label: '文档' }, { id: 'settings', label: '设置' },
] as const

export function ProductDetail({ products, workItems, versions, documents, onSaveProduct, onSaveWorkItem, onSaveVersion, onSaveDocument, onArchiveProduct, onRestoreProduct }: ProductDetailProps) {
  const { productId = '', tab } = useParams()
  const navigate = useNavigate()
  const [restoreError, setRestoreError] = useState('')
  const [restoreBusy, setRestoreBusy] = useState(false)
  const product = products.find(({ id }) => id === productId)
  if (!product) return <StateCard title="产品不存在" text="未找到对应产品，它可能已被移除或链接有误。" />
  if (product.archivedAt !== null) {
    const restore = async () => {
      setRestoreBusy(true)
      try {
        await onRestoreProduct(product)
        navigate(`/products/${product.id}`)
      } catch (error) {
        setRestoreError(mutationErrorMessage(error, '恢复失败，请稍后重试'))
      } finally {
        setRestoreBusy(false)
      }
    }
    return <StateCard title="产品已归档" text="该产品已从活跃工作台隐藏，但数据仍然保留。">{restoreError && <p role="alert" className="feedback error">{restoreError}</p>}<button onClick={() => void restore()} disabled={restoreBusy}>恢复产品</button></StateCard>
  }
  const activeTab = tab ?? 'overview'
  if (!tabs.some(({ id }) => id === activeTab)) return <Navigate to={`/products/${product.id}/overview`} replace />
  const metrics = deriveProductMetrics(product, workItems, versions)
  const appUrl = getSafeHttpsUrl(product.appUrl)

  return (
    <>
      <nav className="breadcrumb" aria-label="面包屑"><Link to="/products">产品</Link><span>/</span><span>{product.name}</span></nav>
      <header className="detail-heading"><div className="detail-title"><span className="hero-icon">{product.icon}</span><div><h1>{product.name}</h1><p>{product.description || '暂未填写产品描述。'}</p></div></div><div className="detail-actions">{appUrl && <a className="external-button" href={appUrl} target="_blank" rel="noopener noreferrer">访问应用 ↗</a>}{(product.isPublic || product.showcasePagePath) && <Link className="external-button showcase-button" to={`/showcase/${product.id}`} title={product.isPublic ? '在作品集页面查看（已公开）' : '预览自定义作品集页面（产品未公开，外部访客看不到）'}>{product.isPublic ? '查看作品集页 ↗' : '预览自定义页 ↗'}</Link>}</div></header>
      <nav className="tabs" aria-label="产品详情">{tabs.map(({ id, label }) => <Link key={id} aria-current={activeTab === id ? 'page' : undefined} className={activeTab === id ? 'selected' : ''} to={`/products/${product.id}/${id}`}>{label}</Link>)}</nav>
      {activeTab === 'overview' && <ProductOverview product={product} metrics={metrics} />}
      {activeTab === 'tasks' && <TaskBoard productId={product.id} items={workItems.filter(({ productId: ownerId }) => ownerId === product.id)} onSaveWorkItem={onSaveWorkItem} />}
      {activeTab === 'versions' && <VersionList productId={product.id} versions={versions.filter(({ productId: ownerId }) => ownerId === product.id)} currentVersion={metrics.currentVersion} onSaveVersion={onSaveVersion} />}
      {activeTab === 'documents' && <DocumentWorkspace productId={product.id} documents={documents.filter(({ productId: ownerId }) => ownerId === product.id)} onSaveDocument={onSaveDocument} />}
      {activeTab === 'settings' && <ProductSettings product={product} products={products} onSaveProduct={onSaveProduct} onArchiveProduct={onArchiveProduct} onArchived={() => navigate('/products')} />}
    </>
  )
}

function StateCard({ title, text, children }: { title: string; text: string; children?: React.ReactNode }) {
  return <section className="state-card"><h1>{title}</h1><p>{text}</p><div className="state-actions">{children}<Link className="secondary button-link" to="/products">返回产品总览</Link></div></section>
}
