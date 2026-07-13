import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Product } from '../domain/models'

interface AppShellProps { products: Product[]; currentProductId?: string; children: ReactNode }

export function AppShell({ products, currentProductId, children }: AppShellProps) {
  const activeProducts = products.filter(({ archivedAt }) => archivedAt === null)
  return (
    <div className="workspace">
      <aside className="sidebar">
        <Link className="brand" to="/products"><span>VS</span>Vibe Studio</Link>
        <nav aria-label="主导航">
          <p className="nav-label">工作台</p>
          <Link className="nav-link active" to="/products">产品</Link>
          <span className="nav-link disabled" aria-disabled="true">数据与运营（即将推出）</span>
          <p className="nav-label">常用产品</p>
          {activeProducts.map((product) => (
            <Link className={`nav-link product-shortcut ${currentProductId === product.id ? 'current' : ''}`} to={`/products/${product.id}`} key={product.id}>
              <span>{product.icon}</span>{product.name}
            </Link>
          ))}
        </nav>
        <div className="sidebar-footer">
          {currentProductId ? <Link className="nav-link" to={`/products/${currentProductId}/settings`}>设置</Link> : <span className="nav-link disabled" aria-disabled="true">设置</span>}
        </div>
      </aside>
      <main className="main"><div className="content">{children}</div></main>
    </div>
  )
}
