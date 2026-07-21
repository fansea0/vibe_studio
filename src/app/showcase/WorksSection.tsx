import { useEffect, useRef } from 'react'
import { ProductShowcaseCard } from './ProductShowcaseCard'
import { useShowcaseProducts } from './useShowcaseProducts'

export function WorksSection() {
  const { products, error, loading } = useShowcaseProducts()
  const gridRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    const cards = Array.from(grid.querySelectorAll<HTMLElement>('.showcase-card'))
    const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (typeof IntersectionObserver === 'undefined' || prefersReducedMotion) {
      cards.forEach((c) => c.classList.add('is-revealed'))
      return
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const el = entry.target as HTMLElement
          const index = cards.indexOf(el)
          el.style.transitionDelay = `${index * 60}ms`
          el.classList.add('is-revealed')
          observer.unobserve(el)
        }
      })
    }, { threshold: 0.1 })
    cards.forEach((c) => observer.observe(c))
    return () => observer.disconnect()
  }, [products])

  return (
    <section className="showcase-section">
      <h2 className="showcase-section-title">精选作品</h2>
      {error && <p role="alert" className="feedback error">{error}</p>}
      {loading && <p>正在加载作品...</p>}
      {!loading && !error && products.length === 0 && <p className="showcase-empty">还没有公开的作品。</p>}
      <div className="showcase-grid" ref={gridRef}>
        {products.map((product) => <ProductShowcaseCard key={product.id} product={product} />)}
      </div>
    </section>
  )
}