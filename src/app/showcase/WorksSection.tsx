import { useEffect, useRef, useState } from 'react'
import { ProductShowcaseCard } from './ProductShowcaseCard'
import { useShowcaseProducts } from './useShowcaseProducts'

export function WorksSection() {
  const { products, error, loading } = useShowcaseProducts()
  const gridRef = useRef<HTMLDivElement | null>(null)
  // 入场动画是渐进增强：默认卡片可见，只有在确认浏览器支持观察器后才隐藏等待揭示。
  // 否则一旦观察器未触发（例如后台标签页、无头环境），作品卡片会永久不可见。
  const [animate, setAnimate] = useState(false)

  useEffect(() => {
    const grid = gridRef.current
    if (!grid || products.length === 0) return
    const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (typeof IntersectionObserver === 'undefined' || prefersReducedMotion) return
    setAnimate(true)
    const cards = Array.from(grid.querySelectorAll<HTMLElement>('.showcase-card'))
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
    // 兜底：2 秒内仍未揭示的卡片直接显示，避免永久隐藏。
    const fallback = window.setTimeout(() => {
      cards.forEach((c) => c.classList.add('is-revealed'))
    }, 2000)
    return () => { observer.disconnect(); window.clearTimeout(fallback) }
  }, [products])

  return (
    <section className="showcase-section">
      <h2 className="showcase-section-title">精选作品</h2>
      {error && <p role="alert" className="feedback error">{error}</p>}
      {loading && <p>正在加载作品...</p>}
      {!loading && !error && products.length === 0 && <p className="showcase-empty">还没有公开的作品。</p>}
      <div className={`showcase-grid${animate ? ' is-animated' : ''}`} ref={gridRef}>
        {products.map((product) => <ProductShowcaseCard key={product.id} product={product} />)}
      </div>
    </section>
  )
}
