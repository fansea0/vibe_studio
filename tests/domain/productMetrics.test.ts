import { describe, expect, it } from 'vitest'

import type { Product, ProductVersion, WorkItem } from '../../src/domain/models'
import { deriveProductMetrics } from '../../src/domain/productMetrics'

const product: Product = {
  id: 'flora',
  name: 'Flora',
  description: 'Plant care companion',
  productType: 'mobile-app',
  icon: '🌿',
  status: 'developing',
  completionPercent: 72,
  userCount: 1280,
  userCountSource: 'analytics',
  appUrl: 'https://flora.example.com',
  repositoryPath: '',
  archivedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
}

const item = (
  id: string,
  productId: string,
  type: WorkItem['type'],
  status: WorkItem['status'],
): WorkItem => ({
  id,
  productId,
  type,
  title: id,
  priority: 'medium',
  dueDate: null,
  status,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
})

const version = (
  id: string,
  productId: string,
  number: string,
  status: ProductVersion['status'],
  releasedAt: string | null,
  updatedAt = '2026-01-01T00:00:00.000Z',
): ProductVersion => ({
  id,
  productId,
  number,
  status,
  releasedAt,
  notes: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt,
})

describe('deriveProductMetrics', () => {
  it('counts only non-done requirements and bugs', () => {
    const metrics = deriveProductMetrics(product, [
      item('r1', 'flora', 'requirement', 'todo'),
      item('r2', 'flora', 'requirement', 'in_progress'),
      item('r3', 'flora', 'requirement', 'done'),
      item('b1', 'flora', 'bug', 'todo'),
      item('b2', 'flora', 'bug', 'done'),
    ], [])

    expect(metrics.openRequirementCount).toBe(2)
    expect(metrics.openBugCount).toBe(1)
  })

  it('uses the latest released version and keeps product headline metrics', () => {
    const metrics = deriveProductMetrics(product, [], [
      version('v1', 'flora', '1.0.0', 'released', '2026-02-01T00:00:00.000Z'),
      version('v2', 'flora', '1.1.0', 'released', '2026-05-01T00:00:00.000Z'),
      version('v3', 'flora', '1.2.0', 'planned', null, '2026-07-01T00:00:00.000Z'),
    ])

    expect(metrics.currentVersion).toBe('1.1.0')
    expect(metrics.completionPercent).toBe(72)
    expect(metrics.userCount).toBe(1280)
  })

  it('uses updatedAt to break ties when releasedAt is unavailable', () => {
    const metrics = deriveProductMetrics(product, [], [
      version('v1', 'flora', '0.9.0', 'released', null, '2026-03-01T00:00:00.000Z'),
      version('v2', 'flora', '1.0.0', 'released', null, '2026-04-01T00:00:00.000Z'),
    ])

    expect(metrics.currentVersion).toBe('1.0.0')
  })

  it('compares ISO release timestamps by instant across timezone offsets', () => {
    const metrics = deriveProductMetrics(product, [], [
      version('v1', 'flora', '1.0.0', 'released', '2026-07-01T00:30:00+08:00'),
      version('v2', 'flora', '1.1.0', 'released', '2026-06-30T18:00:00.000Z'),
    ])

    expect(metrics.currentVersion).toBe('1.1.0')
  })

  it('uses an em dash when the product has no released version', () => {
    const metrics = deriveProductMetrics(product, [], [
      version('v1', 'flora', '1.0.0', 'planned', null),
    ])

    expect(metrics.currentVersion).toBe('—')
  })

  it('ignores records belonging to other products', () => {
    const metrics = deriveProductMetrics(product, [
      item('r1', 'other', 'requirement', 'todo'),
      item('b1', 'other', 'bug', 'in_progress'),
    ], [
      version('v1', 'other', '99.0.0', 'released', '2026-07-01T00:00:00.000Z'),
    ])

    expect(metrics.openRequirementCount).toBe(0)
    expect(metrics.openBugCount).toBe(0)
    expect(metrics.currentVersion).toBe('—')
  })
})
