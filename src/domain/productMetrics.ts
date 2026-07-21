import type { Product, ProductVersion, WorkItem } from './models'

export interface ProductMetrics {
  completionPercent: number
  userCount: number
  openRequirementCount: number
  openBugCount: number
  currentVersion: string
}

export const deriveProductMetrics = (
  product: Product,
  items: readonly WorkItem[],
  versions: readonly ProductVersion[],
): ProductMetrics => {
  const productItems = items.filter((item) => item.productId === product.id)
  const releasedVersions = versions
    .filter((version) => version.productId === product.id && version.status === 'released')
    .toSorted((left, right) => {
      const leftRelease = left.releasedAt ?? left.updatedAt
      const rightRelease = right.releasedAt ?? right.updatedAt
      return (
        Date.parse(rightRelease) - Date.parse(leftRelease) ||
        Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
      )
    })

  return {
    completionPercent: product.completionPercent,
    userCount: product.userCount,
    openRequirementCount: productItems.filter(
      (item) => item.type === 'requirement' && item.status !== 'done',
    ).length,
    openBugCount: productItems.filter((item) => item.type === 'bug' && item.status !== 'done').length,
    currentVersion: releasedVersions[0]?.number ?? '—',
  }
}

export const deriveCurrentVersion = (versions: readonly ProductVersion[]): string => {
  const releasedVersions = versions
    .filter((version) => version.status === 'released')
    .toSorted((left, right) => {
      const leftRelease = left.releasedAt ?? left.updatedAt
      const rightRelease = right.releasedAt ?? right.updatedAt
      return (
        Date.parse(rightRelease) - Date.parse(leftRelease) ||
        Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
      )
    })
  return releasedVersions[0]?.number ?? '—'
}
