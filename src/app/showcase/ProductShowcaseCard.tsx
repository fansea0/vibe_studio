import { Link } from 'react-router-dom'
import type { PublicProduct } from '../../domain/models'
import { productStatusLabels } from '../productPresentation'

interface Props { product: PublicProduct }
export function ProductShowcaseCard({ product }: Props) {
  return (
    <Link className="showcase-card" to={`/showcase/${product.id}`}>
      <div className="showcase-card-top">
        <span className="showcase-card-icon">{product.icon}</span>
        <span className={`status status-${product.status}`}>{productStatusLabels[product.status]}</span>
      </div>
      <h3 className="showcase-card-title">{product.name}</h3>
      <p className="showcase-card-desc">{product.description || '暂无简介'}</p>
      <footer className="showcase-card-meta">
        <span>{product.currentVersion}</span>
        <span>·</span>
        <span>{product.userCount.toLocaleString()} 用户</span>
      </footer>
    </Link>
  )
}