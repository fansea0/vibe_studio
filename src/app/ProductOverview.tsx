import type { Product } from '../domain/models'
import type { ProductMetrics } from '../domain/productMetrics'
import { productStatusLabels } from './productPresentation'
import { useCommitPolling } from '../client/useCommitPolling'

interface ProductOverviewProps { product: Product; metrics: ProductMetrics }

export function ProductOverview({ product, metrics }: ProductOverviewProps) {
  const { commits, loading, error } = useCommitPolling(product.id, 5)
  const hasTasks = metrics.openRequirementCount + metrics.openBugCount > 0 || metrics.completionPercent > 0
  return (
    <section className="overview-stack" aria-labelledby="product-overview-title">
      <section className="overview-card summary-card">
        <div><span className={`status status-${product.status}`}>{productStatusLabels[product.status]}</span><h2 id="product-overview-title">产品概览</h2><p>{product.description || '暂未填写产品描述。'}</p></div>
        <div className="completion">
          <strong>{hasTasks ? `${metrics.completionPercent}%` : '—'}</strong>
          <span>{hasTasks ? '任务完成率' : '暂无任务'}</span>
          {hasTasks && <progress max="100" value={metrics.completionPercent} />}
        </div>
      </section>
      <section className="metrics-grid" aria-label="产品指标">
        <article><span>未完成需求</span><strong>{metrics.openRequirementCount}</strong></article>
        <article><span>未关闭 Bug</span><strong>{metrics.openBugCount}</strong></article>
        <article><span>用户数</span><strong>{metrics.userCount.toLocaleString()}</strong></article>
        <article><span>当前版本</span><strong>{metrics.currentVersion}</strong></article>
      </section>
      <section className="overview-card details-list"><div><span>最近更新</span><strong>{new Date(product.updatedAt).toLocaleString('zh-CN')}</strong></div><div><span>Git 仓库</span><strong>{product.repositoryPath || '未配置'}</strong></div></section>
      <section className="overview-card commit-history"><div className="section-heading"><div><h2>最新 Git 更新</h2><p>每分钟自动检查本地仓库的 commit log。</p></div></div>{loading && <p>正在读取 Git 更新…</p>}{error && <p className="feedback warning">{error}</p>}{!loading && !error && commits.length === 0 && <p>暂无 Git 提交记录。</p>}{commits.length > 0 && <ol>{commits.map((commit) => <li key={commit.sha}><div><strong>{commit.subject}</strong><span>{commit.author} · {new Date(commit.committedAt).toLocaleString('zh-CN')}</span></div><code>{commit.shortSha}</code></li>)}</ol>}</section>
    </section>
  )
}
