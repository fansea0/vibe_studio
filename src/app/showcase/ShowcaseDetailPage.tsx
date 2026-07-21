import { useCommitPolling } from '../../client/useCommitPolling'
import { useShowcaseProduct } from './useShowcaseProduct'
import { productStatusLabels } from '../productPresentation'

interface Props { productId: string }

export function ShowcaseDetailPage({ productId }: Props) {
  const { product, error, loading } = useShowcaseProduct(productId)
  const { commits, loading: commitsLoading, error: commitsError } = useCommitPolling(product?.id ?? null, 5)

  if (loading) return <section className="showcase-section"><p>正在加载作品...</p></section>
  if (error === 'notFound') return (
    <section className="showcase-section">
      <p className="feedback warning">作品未公开或不存在</p>
      <a href="/showcase">返回作品集</a>
    </section>
  )
  if (error || !product) return <section className="showcase-section"><p role="alert" className="feedback error">加载失败，请稍后重试</p></section>

  return (
    <article className="showcase-detail">
      <nav className="showcase-breadcrumb"><a href="/showcase">作品集</a><span>/</span><span>{product.name}</span></nav>
      <header className="showcase-detail-header">
        <span className="showcase-card-icon">{product.icon}</span>
        <div>
          <h1>{product.name}</h1>
          <span className={`status status-${product.status}`}>{productStatusLabels[product.status]}</span>
        </div>
        {product.appUrl && <a className="showcase-cta" href={product.appUrl} target="_blank" rel="noopener noreferrer">访问应用</a>}
      </header>
      <div className="showcase-detail-body">
        <section className="showcase-detail-desc">
          <p>{product.description || '暂无简介'}</p>
        </section>
        <aside className="showcase-detail-meta">
          <div><strong>{product.userCount.toLocaleString()}</strong><span>用户</span></div>
          <div><strong>{product.currentVersion}</strong><span>当前版本</span></div>
          <div><strong>{productStatusLabels[product.status]}</strong><span>状态</span></div>
        </aside>
      </div>
      <section className="showcase-detail-commits">
        <h2>最近更新</h2>
        {commitsLoading && <p>正在读取 Git 更新…</p>}
        {commitsError && <p className="feedback warning">{commitsError}</p>}
        {!commitsLoading && commits.length === 0 && <p>暂无 Git 提交记录</p>}
        <ol>{commits.map((c) => <li key={c.sha}><span>{c.subject}</span><code>{c.shortSha}</code></li>)}</ol>
      </section>
    </article>
  )
}