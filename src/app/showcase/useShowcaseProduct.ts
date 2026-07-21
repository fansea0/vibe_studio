import { useEffect, useState } from 'react'
import type { PublicProduct } from '../../domain/models'
import { fetchShowcaseProduct } from '../../client/api'

export function useShowcaseProduct(id: string) {
  const [product, setProduct] = useState<PublicProduct | null>(null)
  const [error, setError] = useState<'' | 'notFound' | 'load'>('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    fetchShowcaseProduct(id, controller.signal)
      .then(setProduct)
      .catch((e: { status?: number }) => { setError(e.status === 404 ? 'notFound' : 'load') })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [id])
  return { product, error, loading }
}