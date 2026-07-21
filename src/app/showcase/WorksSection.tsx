import { ProductShowcaseCard } from './ProductShowcaseCard'
import { useShowcaseProducts } from './useShowcaseProducts'

export function WorksSection() {
  const { products, error, loading } = useShowcaseProducts()
  return (
    <section className="showcase-section">
      <h2 className="showcase-section-title">精选作品</h2>
      {error && <p role="alert" className="feedback error">{error}</p>}
      {loading && <p>正在加载作品...</p>}
      {!loading && !error && products.length === 0 && <p className="showcase-empty">还没有公开的作品。</p>}
      <div className="showcase-grid">
        {products.map((product) => <ProductShowcaseCard key={product.id} product={product} />)}
      </div>
    </section>
  )
}