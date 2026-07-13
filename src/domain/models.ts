export type ProductStatus = 'developing' | 'beta' | 'released' | 'archived'
export type WorkItemType = 'requirement' | 'bug'
export type WorkItemStatus = 'todo' | 'in_progress' | 'done'
export type VersionStatus = 'planned' | 'released'
export type Priority = 'low' | 'medium' | 'high' | 'urgent'

export interface Product {
  id: string
  name: string
  description: string
  productType: string
  icon: string
  status: ProductStatus
  completionPercent: number
  userCount: number
  userCountSource: string
  appUrl: string | null
  repositoryPath: string
  isDeleted?: boolean
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CommitSummary { sha: string; shortSha: string; author: string; committedAt: string; subject: string }

export interface WorkItem {
  id: string
  productId: string
  type: WorkItemType
  title: string
  priority: Priority
  dueDate: string | null
  status: WorkItemStatus
  createdAt: string
  updatedAt: string
}

export interface ProductVersion {
  id: string
  productId: string
  number: string
  status: VersionStatus
  releasedAt: string | null
  notes: string
  createdAt: string
  updatedAt: string
}

export interface MarkdownDocument {
  id: string
  productId: string
  name: string
  content: string
  createdAt: string
  updatedAt: string
}
