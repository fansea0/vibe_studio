import type { ProductStatus } from '../domain/models'

export const productStatusLabels: Record<ProductStatus, string> = {
  developing: '开发中',
  beta: 'Beta',
  released: '已发布',
  archived: '已归档',
}
