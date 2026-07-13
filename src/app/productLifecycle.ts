import type { Product } from '../domain/models'

export const normalizeProductLifecycle = (product: Product, activating = false): Product => {
  if (product.status !== 'archived' || (!activating && product.archivedAt !== null)) return product
  return { ...product, status: 'developing' }
}
