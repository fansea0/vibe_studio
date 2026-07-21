import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

interface ShowcaseShellProps { children: ReactNode }

export function ShowcaseShell({ children }: ShowcaseShellProps) {
  return (
    <div className="showcase-shell">
      <nav className="showcase-nav" aria-label="作品集导航">
        <Link className="showcase-brand" to="/showcase">作品集</Link>
        <div className="showcase-nav-links">
          <Link to="/showcase">作品</Link>
          <Link to="/products">工作台</Link>
        </div>
      </nav>
      <main className="showcase-main">{children}</main>
    </div>
  )
}