import type { CommitSummary, MarkdownDocument, Product, ProductVersion, PublicProduct, ShowcaseProfile, WorkItem, WorkItemComment, WorkItemEvent } from '../domain/models'

export interface StudioSnapshot { products: Product[]; workItems: WorkItem[]; versions: ProductVersion[]; documents: MarkdownDocument[] }
export interface ApiError extends Error { code?: string; status?: number }

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { headers: { 'content-type': 'application/json', ...(options?.headers ?? {}) }, ...options })
  const body = await response.json().catch(() => ({})) as { data?: T; error?: { code?: string; message?: string } }
  if (!response.ok) {
    const error = new Error(body.error?.message ?? `请求失败 (${response.status})`) as ApiError
    error.code = body.error?.code; error.status = response.status
    throw error
  }
  return body.data as T
}

const json = (method: string, body: unknown) => ({ method, body: JSON.stringify(body) })

export async function fetchSnapshot(): Promise<StudioSnapshot> {
  const summaries = await request<Array<{ product: Product }>>('/api/products')
  const products = summaries.map(({ product }) => product)
  const children = await Promise.all(products.map(async (product) => {
    const [workItems, versions, documents] = await Promise.all([
      request<WorkItem[]>(`/api/products/${product.id}/work-items`),
      request<ProductVersion[]>(`/api/products/${product.id}/versions`),
      request<MarkdownDocument[]>(`/api/products/${product.id}/documents`),
    ])
    return { workItems, versions, documents }
  }))
  return {
    products,
    workItems: children.flatMap(({ workItems }) => workItems),
    versions: children.flatMap(({ versions }) => versions),
    documents: children.flatMap(({ documents }) => documents),
  }
}

export const createProduct = (product: Product) => request<Product>('/api/products', json('POST', product))
export const updateProduct = (product: Product, expectedUpdatedAt: string | null) => request<Product>(`/api/products/${product.id}`, json('PATCH', { ...product, expectedUpdatedAt }))
export const archiveProduct = (id: string, expectedUpdatedAt: string) => request<Product>(`/api/products/${id}/archive`, json('POST', { expectedUpdatedAt }))
export const restoreProduct = (id: string, expectedUpdatedAt: string) => request<Product>(`/api/products/${id}/restore`, json('POST', { expectedUpdatedAt }))
export const createWorkItem = (item: WorkItem) => request<WorkItem>(`/api/products/${item.productId}/work-items`, json('POST', item))
export const updateWorkItem = (item: WorkItem, expectedUpdatedAt: string) => request<WorkItem>(`/api/work-items/${item.id}`, json('PATCH', { ...item, expectedUpdatedAt }))
export const listWorkItemsRaw = (productId: string, opts: { includeDeleted?: boolean; onlyDeleted?: boolean } = {}) => {
  const params = new URLSearchParams()
  if (opts.includeDeleted) params.set('includeDeleted', '1')
  if (opts.onlyDeleted) params.set('onlyDeleted', '1')
  const qs = params.toString()
  return request<WorkItem[]>(`/api/products/${encodeURIComponent(productId)}/work-items${qs ? `?${qs}` : ''}`)
}
export const softDeleteWorkItem = (productId: string, workItemId: string, expectedUpdatedAt: string, actor: string) =>
  request<WorkItem>(`/api/products/${encodeURIComponent(productId)}/work-items/${encodeURIComponent(workItemId)}`, json('DELETE', { expectedUpdatedAt, actor }))
export const restoreWorkItem = (productId: string, workItemId: string, expectedUpdatedAt: string, actor: string) =>
  request<WorkItem>(`/api/products/${encodeURIComponent(productId)}/work-items/${encodeURIComponent(workItemId)}/restore`, json('POST', { expectedUpdatedAt, actor }))
export const purgeWorkItem = (productId: string, workItemId: string, expectedUpdatedAt: string) =>
  request<null>(`/api/products/${encodeURIComponent(productId)}/work-items/${encodeURIComponent(workItemId)}/permanent`, json('DELETE', { expectedUpdatedAt }))
export const listWorkItemComments = (productId: string, workItemId: string) =>
  request<WorkItemComment[]>(`/api/products/${encodeURIComponent(productId)}/work-items/${encodeURIComponent(workItemId)}/comments`)
export const createWorkItemComment = (productId: string, workItemId: string, body: { author: string; body: string }) =>
  request<WorkItemComment>(`/api/products/${encodeURIComponent(productId)}/work-items/${encodeURIComponent(workItemId)}/comments`, json('POST', body))
export const listWorkItemEvents = (productId: string, workItemId: string) =>
  request<WorkItemEvent[]>(`/api/products/${encodeURIComponent(productId)}/work-items/${encodeURIComponent(workItemId)}/events`)
export const createVersion = (version: ProductVersion) => request<ProductVersion>(`/api/products/${version.productId}/versions`, json('POST', version))
export const updateVersion = (version: ProductVersion, expectedUpdatedAt: string) => request<ProductVersion>(`/api/versions/${version.id}`, json('PATCH', { ...version, expectedUpdatedAt }))
export const createDocument = (document: MarkdownDocument, expectedUpdatedAt: string | null) => request<MarkdownDocument>(`/api/products/${document.productId}/documents`, json('POST', { ...document, expectedUpdatedAt }))
export const updateDocument = (document: MarkdownDocument, expectedUpdatedAt: string) => request<MarkdownDocument>(`/api/documents/${document.id}`, json('PATCH', { ...document, expectedUpdatedAt }))
export interface CommitLogResponse { items: CommitSummary[]; checkedAt: string }
export const fetchCommits = (productId: string, signal?: AbortSignal, limit = 5) => request<CommitLogResponse>(`/api/products/${encodeURIComponent(productId)}/commits?limit=${limit}`, { signal })
export const fetchShowcaseProfile = (signal?: AbortSignal) => request<ShowcaseProfile>('/api/showcase/profile', { signal })
export const fetchShowcaseProducts = (signal?: AbortSignal) => request<PublicProduct[]>('/api/showcase/products', { signal })
export const fetchShowcaseProduct = (id: string, signal?: AbortSignal) => request<PublicProduct>(`/api/showcase/products/${encodeURIComponent(id)}`, { signal })
