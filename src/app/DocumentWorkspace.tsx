import { Component, useEffect, useMemo, useRef, useState, type ChangeEvent, type ErrorInfo, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'

import type { DocumentMutationToken } from '../data/studioRepository'
import type { MarkdownDocument } from '../domain/models'
import { MAX_MARKDOWN_FILE_BYTES, normalizeDocumentName, validateDocumentName } from '../domain/documentName'
import { Modal } from './Modal'
import { mutationErrorMessage } from './mutationError'

interface DocumentWorkspaceProps {
  productId: string
  documents: MarkdownDocument[]
  onSaveDocument: (document: MarkdownDocument, token: DocumentMutationToken) => Promise<void>
}

interface PendingDocument {
  name: string
  content: string
}

const isDuplicateDocumentError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null &&
  'code' in error && error.code === 'DUPLICATE_DOCUMENT'
const duplicateDocumentMessage = '同名文档已在其他窗口保存，请选择覆盖、另存或取消'
const isDocumentConflictError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null &&
  'code' in error && error.code === 'DOCUMENT_CONFLICT'
const documentConflictMessage = '文档已在其他窗口更新，请重新选择覆盖、另存或取消'

const newestDocumentId = (documents: MarkdownDocument[]): string | null =>
  [...documents].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]?.id ?? null

const createId = (): string =>
  typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `document-${Date.now()}-${Math.random().toString(16).slice(2)}`

const copyName = (name: string, documents: MarkdownDocument[]): string => {
  const trimmedName = name.trim()
  const extensionStart = trimmedName.lastIndexOf('.')
  const base = trimmedName.slice(0, extensionStart)
  const extension = trimmedName.slice(extensionStart)
  const existingNames = new Set(documents.map((document) => normalizeDocumentName(document.name)))
  let copyNumber = 1
  let suffix = '-副本'
  let candidate = `${base.slice(0, 180 - extension.length - suffix.length)}${suffix}${extension}`

  while (existingNames.has(normalizeDocumentName(candidate))) {
    copyNumber += 1
    suffix = `-副本-${copyNumber}`
    candidate = `${base.slice(0, 180 - extension.length - suffix.length)}${suffix}${extension}`
  }
  return candidate
}

const formatDate = (value: string): string =>
  new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date(value))

const safePreviewUrl = (url: string): string => {
  if (url.startsWith('#')) return url
  if (url.startsWith('//')) return ''
  try {
    const parsed = new URL(url)
    return ['http:', 'https:', 'mailto:'].includes(parsed.protocol) ? url : ''
  } catch {
    return ''
  }
}

export function DocumentWorkspace({ productId, documents, onSaveDocument }: DocumentWorkspaceProps) {
  const [selectedId, setSelectedId] = useState<string | null>(() => newestDocumentId(documents))
  const [pending, setPending] = useState<PendingDocument | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const uploadGeneration = useRef(0)
  const mounted = useRef(true)
  const orderedDocuments = useMemo(
    () => [...documents].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [documents],
  )
  const selected = documents.find(({ id }) => id === selectedId) ?? orderedDocuments[0] ?? null
  const pendingExisting = pending
    ? documents.find((document) => normalizeDocumentName(document.name) === normalizeDocumentName(pending.name)) ?? null
    : null

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      uploadGeneration.current += 1
    }
  }, [])

  useEffect(() => {
    if (selectedId === null || !documents.some(({ id }) => id === selectedId)) {
      setSelectedId(newestDocumentId(documents))
    }
  }, [documents, selectedId])

  const save = async (
    document: MarkdownDocument,
    pendingOnDuplicate?: PendingDocument,
    expectedUpdatedAt: string | null = null,
  ): Promise<boolean> => {
    try {
      await onSaveDocument(document, { expectedUpdatedAt })
      if (!mounted.current) return true
      setSelectedId(document.id)
      setError('')
      return true
    } catch (saveError) {
      if (!mounted.current) return false
      if (isDuplicateDocumentError(saveError)) {
        if (pendingOnDuplicate) setPending(pendingOnDuplicate)
        setError(duplicateDocumentMessage)
      } else if (isDocumentConflictError(saveError)) {
        if (pendingOnDuplicate) setPending(pendingOnDuplicate)
        setError(documentConflictMessage)
      } else {
        setError(mutationErrorMessage(saveError, '保存失败，请稍后重试'))
      }
      return false
    }
  }

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    const generation = ++uploadGeneration.current
    setError('')

    const nameValidation = validateDocumentName(file.name)
    if (!nameValidation.valid) {
      setError(/\.(?:md|markdown)$/i.test(file.name)
        ? '文件名必须为 1–180 个字符且不能包含控制字符'
        : '仅支持 .md 或 .markdown 文件')
      input.value = ''
      return
    }
    if (file.size > MAX_MARKDOWN_FILE_BYTES) {
      setError('Markdown 文件不能超过 512 KiB')
      input.value = ''
      return
    }

    setBusy(true)
    let content: string
    try {
      content = await file.text()
    } catch {
      if (!mounted.current || generation !== uploadGeneration.current) return
      setError('读取文档失败，请检查文件后重试')
      input.value = ''
      setBusy(false)
      return
    }
    if (!mounted.current || generation !== uploadGeneration.current) return
    input.value = ''

    const existing = documents.find(
      (document) => normalizeDocumentName(document.name) === normalizeDocumentName(nameValidation.name),
    )
    if (existing) {
      setPending({ name: nameValidation.name, content })
      setBusy(false)
      return
    }

    const now = new Date().toISOString()
    await save(
      { id: createId(), productId, name: nameValidation.name, content, createdAt: now, updatedAt: now },
      { name: nameValidation.name, content },
    )
    if (mounted.current && generation === uploadGeneration.current) setBusy(false)
  }

  const overwrite = async () => {
    if (!pending || !pendingExisting) return
    setBusy(true)
    const saved = await save({
      ...pendingExisting,
      content: pending.content,
    }, pending, pendingExisting.updatedAt)
    if (saved) setPending(null)
    if (mounted.current) setBusy(false)
  }

  const saveCopy = async () => {
    if (!pending) return
    setBusy(true)
    const now = new Date().toISOString()
    const saved = await save({
      id: createId(),
      productId,
      name: copyName(pending.name, documents),
      content: pending.content,
      createdAt: now,
      updatedAt: now,
    }, pending)
    if (saved) setPending(null)
    if (mounted.current) setBusy(false)
  }

  const closeConflict = () => {
    setPending(null)
    setError('')
  }

  return (
    <section className="document-stack" aria-labelledby="documents-title" aria-busy={busy}>
      <header className="section-heading document-heading">
        <div><h2 id="documents-title">Markdown 文档</h2><p>上传并安全预览产品相关的 Markdown 文件。</p></div>
        <label className="button-link upload-label">上传 Markdown 文档<input type="file" accept=".md,.markdown" onChange={handleUpload} disabled={busy} /></label>
      </header>
      {error && pending === null && <p role="alert" className="feedback error">{error}</p>}
      {documents.length === 0 ? (
        <section className="empty-card document-empty" aria-label="暂无文档">
          <h3>还没有 Markdown 文档</h3>
          <p>使用上方入口上传第一个 .md 或 .markdown 文件。</p>
        </section>
      ) : (
        <div className="document-workspace">
          <aside className="document-list" aria-label="文档列表">
            {orderedDocuments.map((document) => (
              <button
                type="button"
                key={`${document.productId}:${document.id}`}
                className={selected?.id === document.id ? 'selected' : ''}
                aria-current={selected?.id === document.id ? 'true' : undefined}
                onClick={() => setSelectedId(document.id)}
              >
                <strong>{document.name}</strong>
                <span>上传：{formatDate(document.createdAt)}</span>
                <span>更新：{formatDate(document.updatedAt)}</span>
              </button>
            ))}
          </aside>
          {selected && (
            <article className="document-preview" aria-labelledby="document-preview-title">
              <h2 id="document-preview-title">文档预览</h2>
              <PreviewBoundary key={`${selected.id}:${selected.updatedAt}`}>
                <ReactMarkdown
                  rehypePlugins={[rehypeSanitize]}
                  urlTransform={safePreviewUrl}
                  components={{
                    img: ({ alt }) => <span className="blocked-image">图片已阻止{alt ? `：${alt}` : ''}</span>,
                    a: ({ href, children }) => {
                      const safeHref = safePreviewUrl(href ?? '')
                      if (!safeHref) return <span>{children}</span>
                      const external = !safeHref.startsWith('#')
                      return <a href={safeHref} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{children}</a>
                    },
                  }}
                >{selected.content}</ReactMarkdown>
              </PreviewBoundary>
            </article>
          )}
        </div>
      )}
      {pending && (
        <Modal title="文档名称冲突" onClose={closeConflict} closeDisabled={busy} className="confirm-dialog">
          <p>当前产品中已存在同名文档“{pendingExisting?.name ?? pending.name}”。请选择处理方式。</p>
          {error && <p role="alert" className="feedback error">{error}</p>}
          <div className="dialog-actions">
            <button type="button" className="secondary" onClick={closeConflict} disabled={busy}>取消</button>
            <button type="button" className="secondary" onClick={saveCopy} disabled={!pendingExisting || busy}>另存为新文档</button>
            <button type="button" onClick={overwrite} disabled={!pendingExisting || busy}>覆盖现有文档</button>
          </div>
        </Modal>
      )}
    </section>
  )
}

interface PreviewBoundaryProps { children: ReactNode }
interface PreviewBoundaryState { failed: boolean }

class PreviewBoundary extends Component<PreviewBoundaryProps, PreviewBoundaryState> {
  state: PreviewBoundaryState = { failed: false }

  static getDerivedStateFromError(): PreviewBoundaryState {
    return { failed: true }
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // The source stays in the snapshot; this boundary prevents a blank workspace.
  }

  render() {
    if (this.state.failed) {
      return <p role="alert" className="feedback error">文档预览失败，源文件已保留，请稍后重试。</p>
    }
    return this.props.children
  }
}
