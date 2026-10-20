import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import type { Product, WorkItem } from '../domain/models'
import { CommandPalette } from './CommandPalette'
import { PaletteContext } from './paletteContext'
import { IconInbox, IconSearch } from './icons'

interface AppShellProps {
  products: Product[]
  workItems?: WorkItem[]
  trashWorkItems?: WorkItem[]
  currentProductId?: string
  children: ReactNode
}

export function AppShell({ products, workItems = [], trashWorkItems = [], currentProductId, children }: AppShellProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const activeProducts = products.filter(({ archivedAt }) => archivedAt === null)
  const onProducts = location.pathname === '/products'
  const onWorkCenter = location.pathname === '/tasks'

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const openPalette = useCallback(() => setPaletteOpen(true), [])
  const closePalette = useCallback(() => setPaletteOpen(false), [])
  const paletteContext = useMemo(
    () => ({ isOpen: paletteOpen, open: openPalette, close: closePalette, toggle: () => setPaletteOpen((open) => !open) }),
    [paletteOpen, openPalette, closePalette],
  )

  return (
    <PaletteContext.Provider value={paletteContext}>
      <div className="workspace">
        <aside className="sidebar">
          <Link className="brand" to="/products"><span>VS</span>Vibe Studio</Link>
          <button type="button" className="sidebar-search" onClick={openPalette}>
            <IconSearch />
            <span>搜索产品或任务</span>
            <kbd>⌘K</kbd>
          </button>
          <nav aria-label="主导航">
            <p className="nav-label">工作台</p>
            <Link className={`nav-link ${onProducts ? 'active' : ''}`} to="/products">产品</Link>
            <Link className={`nav-link ${onWorkCenter ? 'active' : ''}`} to="/tasks"><IconInbox size={13} />需求中心</Link>
            {activeProducts.length > 0 && <p className="nav-label">常用产品</p>}
            {activeProducts.map((product) => (
              <Link className={`nav-link product-shortcut ${currentProductId === product.id ? 'current' : ''}`} to={`/products/${product.id}`} key={product.id}>
                <span>{product.icon}</span>{product.name}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="main"><div className="content">{children}</div></main>
        <CommandPalette
          open={paletteOpen}
          products={products}
          workItems={workItems}
          trashItems={trashWorkItems}
          onClose={closePalette}
          onNavigate={(path) => { closePalette(); navigate(path) }}
        />
      </div>
    </PaletteContext.Provider>
  )
}
