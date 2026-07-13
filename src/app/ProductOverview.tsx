import type { Product } from '../domain/models'
import type { ProductMetrics } from '../domain/productMetrics'

interface ProductOverviewProps { product: Product; metrics: ProductMetrics }
const statusLabels = { developing: '开发中', beta: 'Beta', released: '已发布', archived: '已归档' }

export function ProductOverview({ product, metrics }: ProductOverviewProps) {
  return (
    <div className="overview-stack">
      <section className="overview-card summary-card">
        <div><span className={`status status-${product.status}`}>{statusLabels[product.status]}</span><h2>产品概览</h2><p>{product.description || '暂未填写产品描述。'}</p></div>
        <div className="completion"><strong>{metrics.completionPercent}%</strong><span>手动完成度</span><progress max="100" value={metrics.completionPercent} /></div>
      </section>
      <section className="metrics-grid" aria-label="产品指标">
        <article><span>未完成需求</span><strong>{metrics.openRequirementCount}</strong></article>
        <article><span>未关闭 Bug</span><strong>{metrics.openBugCount}</strong></article>
        <article><span>用户数</span><strong>{metrics.userCount.toLocaleString()}</strong><small>{product.userCountSource || '未注明来源'}</small></article>
        <article><span>当前版本</span><strong>{metrics.currentVersion}</strong></article>
      </section>
      <section className="overview-card details-list"><div><span>产品类型</span><strong>{product.productType || '—'}</strong></div><div><span>最近更新</span><strong>{new Date(product.updatedAt).toLocaleString('zh-CN')}</strong></div></section>
    </div>
  )
}
