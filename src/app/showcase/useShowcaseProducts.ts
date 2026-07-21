import { useEffect, useState } from 'react'
import type { PublicProduct } from '../../domain/models'
import { fetchShowcaseProducts } from '../../client/api'

export function useShowcaseProducts() {
  const [products, setProducts] = useState<PublicProduct[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    fetchShowcaseProducts(controller.signal).then(setProducts).catch(() => setError('暂时无法加载作品列表')).finally(() => setLoading(false))
    return () => controller.abort()
  }, [])
  return { products, error, loading }
}