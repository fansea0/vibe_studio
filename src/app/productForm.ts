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
  repositoryPath: string
  isPublic: boolean
}

export type ProductFormErrors = Partial<Record<keyof ProductFormValues, string>>

export const getSafeHttpsUrl = (value: string | null): string | null => {
  if (value === null || value.trim() === '') return null
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' && url.hostname !== '' ? url.href : null
  } catch {
    return null
  }
}

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
  repositoryPath: product?.repositoryPath ?? '',
  isPublic: product?.isPublic ?? false,
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

  const completionText = values.completionPercent.trim()
  const completion = Number(completionText)
  if (completionText === '') errors.completionPercent = '请输入完成度'
  else if (!Number.isInteger(completion) || completion < 0 || completion > 100) {
    errors.completionPercent = '完成度必须是 0 到 100 的整数'
  }
  const userCountText = values.userCount.trim()
  const users = Number(userCountText)
  if (userCountText === '') errors.userCount = '请输入用户数'
  else if (!Number.isInteger(users) || users < 0) errors.userCount = '用户数必须是非负整数'
  const appUrl = values.appUrl.trim()
  if (appUrl !== '' && getSafeHttpsUrl(appUrl) === null) {
    errors.appUrl = appUrl.startsWith('https://')
      ? '请输入有效的 HTTPS 应用地址'
      : '应用地址必须以 https:// 开头'
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
  repositoryPath: values.repositoryPath.trim(),
  isPublic: values.isPublic,
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
