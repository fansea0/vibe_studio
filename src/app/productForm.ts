import type { Product, ProductStatus } from '../domain/models'

export interface ProductFormValues {
  name: string
  description: string
  productType: string
  icon: string
  status: ProductStatus
  completionPercent: string
  userCount: string
  userCountSource: string
  appUrl: string
}

export type ProductFormErrors = Partial<Record<keyof ProductFormValues, string>>

export const productToFormValues = (product?: Product): ProductFormValues => ({
  name: product?.name ?? '',
  description: product?.description ?? '',
  productType: product?.productType ?? 'web-app',
  icon: product?.icon ?? '✨',
  status: product?.status ?? 'developing',
  completionPercent: String(product?.completionPercent ?? 0),
  userCount: String(product?.userCount ?? 0),
  userCountSource: product?.userCountSource ?? '',
  appUrl: product?.appUrl ?? '',
})

export const validateProductValues = (
  values: ProductFormValues,
  products: readonly Product[],
  currentProductId?: string,
): ProductFormErrors => {
  const errors: ProductFormErrors = {}
  const normalizedName = values.name.trim().toLocaleLowerCase()
  if (normalizedName === '') errors.name = '请输入产品名称'
  else if (
    products.some(
      (product) =>
        product.id !== currentProductId &&
        product.name.trim().toLocaleLowerCase() === normalizedName,
    )
  ) {
    errors.name = '产品名称已存在'
  }

  const completion = Number(values.completionPercent)
  if (!Number.isInteger(completion) || completion < 0 || completion > 100) {
    errors.completionPercent = '完成度必须是 0 到 100 的整数'
  }
  const users = Number(values.userCount)
  if (!Number.isInteger(users) || users < 0) errors.userCount = '用户数必须是非负整数'
  if (values.appUrl.trim() !== '' && !values.appUrl.trim().startsWith('https://')) {
    errors.appUrl = '应用地址必须以 https:// 开头'
  }
  return errors
}

export const mergeProductValues = (
  product: Product,
  values: ProductFormValues,
  timestamp: string,
): Product => ({
  ...product,
  name: values.name.trim(),
  description: values.description.trim(),
  productType: values.productType.trim(),
  icon: values.icon.trim() || '✨',
  status: values.status,
  completionPercent: Number(values.completionPercent),
  userCount: Number(values.userCount),
  userCountSource: values.userCountSource.trim(),
  appUrl: values.appUrl.trim() || null,
  updatedAt: timestamp,
})

export const createProductId = (name: string, products: readonly Product[]): string => {
  const base = name
    .trim()
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || `product-${Date.now()}`
  let candidate = base
  let suffix = 2
  const ids = new Set(products.map(({ id }) => id))
  while (ids.has(candidate)) {
    candidate = `${base}-${suffix}`
    suffix += 1
  }
  return candidate
}
