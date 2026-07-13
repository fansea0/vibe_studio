import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import type { Product, ProductVersion, WorkItem } from '../domain/models'
import { deriveProductMetrics } from '../domain/productMetrics'
import { ProductOverview } from './ProductOverview'
import { ProductSettings } from './ProductSettings'
import { getSafeHttpsUrl } from './productForm'

interface ProductDetailProps {
  products: Product[]
  workItems: WorkItem[]
  versions: ProductVersion[]
  onSaveProduct: (product: Product) => void
  onArchiveProduct: (product: Product) => void
  onRestoreProduct: (product: Product) => void
}
const tabs = [
  { id: 'overview', label: '概览' }, { id: 'tasks', label: '任务' }, { id: 'versions', label: '版本' },
  { id: 'documents', label: '文档' }, { id: 'settings', label: '设置' },
] as const

export function ProductDetail({ products, workItems, versions, onSaveProduct, onArchiveProduct, onRestoreProduct }: ProductDetailProps) {
  const { productId = '', tab } = useParams()
  const navigate = useNavigate()
  const [restoreError, setRestoreError] = useState('')
  const product = products.find(({ id }) => id === productId)
  if (!product) return <StateCard title="产品不存在" text="未找到对应产品，它可能已被移除或链接有误。" />
  if (product.archivedAt !== null) {
    const restore = () => {
      try {
        onRestoreProduct(product)
        navigate(`/products/${product.id}`)
      } catch {
        setRestoreError('恢复失败，请稍后重试')
      }
    }
    return <StateCard title="产品已归档" text="该产品已从活跃工作台隐藏，但数据仍然保留。">{restoreError && <p role="alert" className="feedback error">{restoreError}</p>}<button onClick={restore}>恢复产品</button></StateCard>
  }
  const activeTab = tab ?? 'overview'
  if (!tabs.some(({ id }) => id === activeTab)) return <Navigate to={`/products/${product.id}/overview`} replace />
  const metrics = deriveProductMetrics(product, workItems, versions)
  const appUrl = getSafeHttpsUrl(product.appUrl)

  return (
    <>
      <nav className="breadcrumb" aria-label="面包屑"><Link to="/products">产品</Link><span>/</span><span>{product.name}</span></nav>
      <header className="detail-heading"><div className="detail-title"><span className="hero-icon">{product.icon}</span><div><h1>{product.name}</h1><p>{product.description || '暂未填写产品描述。'}</p></div></div>{appUrl && <a className="external-button" href={appUrl} target="_blank" rel="noopener noreferrer">访问应用 ↗</a>}</header>
      <nav className="tabs" aria-label="产品详情">{tabs.map(({ id, label }) => <Link key={id} aria-current={activeTab === id ? 'page' : undefined} className={activeTab === id ? 'selected' : ''} to={`/products/${product.id}/${id}`}>{label}</Link>)}</nav>
      {activeTab === 'overview' && <ProductOverview product={product} metrics={metrics} />}
      {activeTab === 'settings' && <ProductSettings product={product} products={products} onSaveProduct={onSaveProduct} onArchiveProduct={onArchiveProduct} onArchived={() => navigate('/products')} />}
      {(activeTab === 'tasks' || activeTab === 'versions' || activeTab === 'documents') && <section className="overview-card placeholder" aria-labelledby={`${activeTab}-placeholder-title`}><div className="placeholder-icon">◇</div><h2 id={`${activeTab}-placeholder-title`}>{tabs.find(({ id }) => id === activeTab)?.label}</h2><p>此工作区将在后续功能中开放。</p></section>}
    </>
  )
}

function StateCard({ title, text, children }: { title: string; text: string; children?: React.ReactNode }) {
  return <section className="state-card"><h1>{title}</h1><p>{text}</p><div className="state-actions">{children}<Link className="secondary button-link" to="/products">返回产品总览</Link></div></section>
}
