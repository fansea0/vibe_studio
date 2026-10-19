import type { Product, ProductVersion, WorkItem } from './models.js'

export const NO_RELEASED_VERSION = '—'

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
  const productVersions = versions.filter((version) => version.productId === product.id)
  const doneCount = productItems.filter((item) => item.status === 'done').length

  return {
    // 完成度由任务板自动推导，不再要求用户手动维护一个百分比。
    completionPercent: productItems.length === 0 ? 0 : Math.round((doneCount / productItems.length) * 100),
    userCount: product.userCount,
    openRequirementCount: productItems.filter(
      (item) => item.type === 'requirement' && item.status !== 'done',
    ).length,
    openBugCount: productItems.filter((item) => item.type === 'bug' && item.status !== 'done').length,
    currentVersion: deriveCurrentVersion(productVersions),
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
  return releasedVersions[0]?.number ?? NO_RELEASED_VERSION
}
