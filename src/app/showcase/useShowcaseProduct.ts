import { useEffect, useState } from 'react'
import type { PublicProduct } from '../../domain/models'
import { fetchShowcaseProduct } from '../../client/api'
import { isAbort } from './abort'

export function useShowcaseProduct(id: string) {
  const [product, setProduct] = useState<PublicProduct | null>(null)
  const [error, setError] = useState<'' | 'notFound' | 'load'>('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    fetchShowcaseProduct(id, controller.signal)
      .then(setProduct)
      .catch((cause: unknown) => {
        if (isAbort(cause)) return
        setError((cause as { status?: number }).status === 404 ? 'notFound' : 'load')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [id])
  return { product, error, loading }
}