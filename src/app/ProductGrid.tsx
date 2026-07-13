import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Product, ProductVersion, WorkItem } from '../domain/models'
import { deriveProductMetrics } from '../domain/productMetrics'
import { ProductDialog } from './ProductDialog'
import { productStatusLabels } from './productPresentation'
import { mutationErrorMessage } from './mutationError'

interface ProductGridProps {
  products: Product[]
  workItems: WorkItem[]
  versions: ProductVersion[]
  onSaveProduct: (product: Product) => Promise<void>
  onRestoreProduct: (product: Product) => Promise<void>
}

export function ProductGrid({ products, workItems, versions, onSaveProduct, onRestoreProduct }: ProductGridProps) {
  const [creating, setCreating] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [error, setError] = useState('')
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const navigate = useNavigate()
  const active = products.filter(({ archivedAt }) => archivedAt === null)
  const archived = products.filter(({ archivedAt }) => archivedAt !== null)

  const restore = async (product: Product) => {
    setRestoringId(product.id)
    try {
      await onRestoreProduct(product)
      setError('')
    } catch (error) { setError(mutationErrorMessage(error, '恢复失败，请稍后重试')) } finally { setRestoringId(null) }
  }

  return (
    <>
      <header className="page-heading"><div><p className="eyebrow">PRODUCT WORKSPACE</p><h1>产品总览</h1><p>集中查看产品进度、用户规模和当前版本。</p></div><button aria-label="新建产品" onClick={() => setCreating(true)}>＋ 新建产品</button></header>
      {error && <p role="alert" className="feedback error">{error}</p>}
      <section className="product-grid" aria-label="活跃产品">
        {active.map((product) => {
          const metrics = deriveProductMetrics(product, workItems, versions)
          return <Link className="product-card" to={`/products/${product.id}`} key={product.id} aria-label={`${product.name}，打开产品详情`}>
            <div className="card-top"><span className="product-icon">{product.icon}</span><span className={`status status-${product.status}`}>{productStatusLabels[product.status]}</span></div>
            <h2>{product.name}</h2><p className="description">{product.description || '暂未填写产品描述。'}</p>
            <div className="card-metrics"><span><strong>{metrics.openRequirementCount}</strong> 未完成需求</span><span><strong>{metrics.openBugCount}</strong> 未关闭 Bug</span><span><strong>{metrics.userCount.toLocaleString()}</strong> 用户</span><span><strong>{metrics.currentVersion}</strong> 当前版本</span></div>
            <footer>更新于 {new Date(product.updatedAt).toLocaleDateString('zh-CN')}</footer>
          </Link>
        })}
      </section>
      {active.length === 0 && <div className="empty-card"><h2>还没有活跃产品</h2><p>新建产品，或从归档区恢复已有产品。</p></div>}
      {archived.length > 0 && <section className="archive-section"><button className="text-button" aria-label={showArchived ? '收起已归档产品' : '查看已归档产品'} onClick={() => setShowArchived((shown) => !shown)}>{showArchived ? '收起已归档产品' : '查看已归档产品'}（{archived.length}）</button>{showArchived && <div className="archived-grid">{archived.map((product) => <article className="archived-card" key={product.id}><span className="product-icon">{product.icon}</span><div><div className="archived-title"><h3>{product.name}</h3><span className="status status-archived">已归档</span></div><p>{product.description}</p></div><button className="secondary" onClick={() => void restore(product)} aria-label={`恢复 ${product.name}`} disabled={restoringId !== null}>恢复</button></article>)}</div>}</section>}
      {creating && <ProductDialog products={products} onSaveProduct={onSaveProduct} onClose={() => setCreating(false)} onCreated={(product) => { setCreating(false); navigate(`/products/${product.id}`) }} />}
    </>
  )
}
