import { Component, useEffect, useMemo, useState, type ChangeEvent, type ErrorInfo, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'

import type { MarkdownDocument } from '../domain/models'
import { Modal } from './Modal'

interface DocumentWorkspaceProps {
  productId: string
  documents: MarkdownDocument[]
  onSaveDocument: (document: MarkdownDocument) => void
}

interface PendingDocument {
  name: string
  content: string
  existing: MarkdownDocument
}

const isMarkdownName = (name: string): boolean => /\.(?:md|markdown)$/i.test(name)

const newestDocumentId = (documents: MarkdownDocument[]): string | null =>
  [...documents].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]?.id ?? null

const createId = (): string =>
  typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `document-${Date.now()}-${Math.random().toString(16).slice(2)}`

const copyName = (name: string, documents: MarkdownDocument[]): string => {
  const extensionStart = name.lastIndexOf('.')
  const base = name.slice(0, extensionStart)
  const extension = name.slice(extensionStart)
  const existingNames = new Set(documents.map((document) => document.name.toLocaleLowerCase()))
  let copyNumber = 1
  let candidate = `${base}-副本${extension}`

  while (existingNames.has(candidate.toLocaleLowerCase())) {
    copyNumber += 1
    candidate = `${base}-副本-${copyNumber}${extension}`
  }
  return candidate
}

const formatDate = (value: string): string =>
  new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date(value))

const nextUpdatedAt = (previous: string): string =>
  new Date(Math.max(Date.now(), Date.parse(previous) + 1)).toISOString()

export function DocumentWorkspace({ productId, documents, onSaveDocument }: DocumentWorkspaceProps) {
  const [selectedId, setSelectedId] = useState<string | null>(() => newestDocumentId(documents))
  const [pending, setPending] = useState<PendingDocument | null>(null)
  const [error, setError] = useState('')
  const orderedDocuments = useMemo(
    () => [...documents].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [documents],
  )
  const selected = documents.find(({ id }) => id === selectedId) ?? orderedDocuments[0] ?? null

  useEffect(() => {
    if (selectedId === null || !documents.some(({ id }) => id === selectedId)) {
      setSelectedId(newestDocumentId(documents))
    }
  }, [documents, selectedId])

  const save = (document: MarkdownDocument): boolean => {
    try {
      onSaveDocument(document)
      setSelectedId(document.id)
      setError('')
      return true
    } catch {
      setError('保存失败，请稍后重试')
      return false
    }
  }

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    setError('')

    if (!isMarkdownName(file.name)) {
      setError('仅支持 .md 或 .markdown 文件')
      input.value = ''
      return
    }

    let content: string
    try {
      content = await file.text()
    } catch {
      setError('读取文档失败，请检查文件后重试')
      input.value = ''
      return
    }
    input.value = ''

    const existing = documents.find(
      (document) => document.name.toLocaleLowerCase() === file.name.toLocaleLowerCase(),
    )
    if (existing) {
      setPending({ name: file.name, content, existing })
      return
    }

    const now = new Date().toISOString()
    save({ id: createId(), productId, name: file.name, content, createdAt: now, updatedAt: now })
  }

  const overwrite = () => {
    if (!pending) return
    const saved = save({
      ...pending.existing,
      content: pending.content,
      updatedAt: nextUpdatedAt(pending.existing.updatedAt),
    })
    if (saved) setPending(null)
  }

  const saveCopy = () => {
    if (!pending) return
    const now = new Date().toISOString()
    const saved = save({
      id: createId(),
      productId,
      name: copyName(pending.name, documents),
      content: pending.content,
      createdAt: now,
      updatedAt: now,
    })
    if (saved) setPending(null)
  }

  return (
    <section className="document-stack" aria-labelledby="documents-title">
      <header className="section-heading document-heading">
        <div><h2 id="documents-title">Markdown 文档</h2><p>上传并安全预览产品相关的 Markdown 文件。</p></div>
        <label className="button-link upload-label">上传 Markdown 文档<input type="file" accept=".md,.markdown" onChange={handleUpload} /></label>
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
                <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{selected.content}</ReactMarkdown>
              </PreviewBoundary>
            </article>
          )}
        </div>
      )}
      {pending && (
        <Modal title="文档名称冲突" onClose={() => setPending(null)} className="confirm-dialog">
          <p>当前产品中已存在同名文档“{pending.existing.name}”。请选择处理方式。</p>
          {error && <p role="alert" className="feedback error">{error}</p>}
          <div className="dialog-actions">
            <button type="button" className="secondary" onClick={() => setPending(null)}>取消</button>
            <button type="button" className="secondary" onClick={saveCopy}>另存为新文档</button>
            <button type="button" onClick={overwrite}>覆盖现有文档</button>
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
