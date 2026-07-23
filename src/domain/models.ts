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
  isPublic?: boolean
  showcasePagePath?: string
  createdAt: string
  updatedAt: string
}

export interface PublicProduct {
  id: string
  name: string
  description: string
  icon: string
  status: ProductStatus
  currentVersion: string
  userCount: number
  appUrl: string | null
  updatedAt: string
  showcasePagePath: string
}

export type SocialPlatform = 'github' | 'twitter' | 'website' | 'linkedin' | 'wechat'

export interface SocialLink {
  platform: SocialPlatform
  label: string
  url: string
}

export interface ShowcaseProfile {
  displayName: string
  tagline: string
  avatarUrl: string | null
  statusLine: string
  statusPillText: string
  aboutParagraphs: string[]
  contactEmail: string
  socialLinks: SocialLink[]
}

export interface CommitSummary { sha: string; shortSha: string; author: string; committedAt: string; subject: string }

export type WorkItemEventType =
  | 'created' | 'status_changed' | 'commented' | 'deleted' | 'restored' | 'purged' | 'edited'

export interface WorkItem {
  id: string
  productId: string
  type: WorkItemType
  title: string
  description: string
  assignee: string
  priority: Priority
  dueDate: string | null
  status: WorkItemStatus
  createdAt: string
  updatedAt: string
  isDeleted: boolean
  deletedAt: string | null
  deletedBy: string
}

export interface WorkItemComment {
  id: string
  workItemId: string
  author: string
  body: string
  createdAt: string
}

export interface WorkItemEvent {
  id: string
  workItemId: string
  type: WorkItemEventType
  actor: string
  fromStatus: WorkItemStatus | null
  toStatus: WorkItemStatus | null
  meta: Record<string, unknown>
  createdAt: string
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
