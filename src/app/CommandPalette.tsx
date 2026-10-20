import { useEffect, useMemo, useRef, useState } from 'react'
import type { Product, WorkItem } from '../domain/models'
import { workItemStatusLabels } from './workItemPresentation'
import { matchesQuery } from './workFilters'
import { IconSearch, IconInbox } from './icons'

interface PaletteEntry {
  id: string
  group: string
  title: string
  hint?: string
  badge?: string
  run: () => void
}

interface CommandPaletteProps {
  open: boolean
  products: Product[]
  workItems: WorkItem[]
  trashItems: WorkItem[]
  onClose: () => void
  onNavigate: (path: string) => void
}

const MAX_PER_GROUP = 6

export function CommandPalette({ open, products, workItems, trashItems, onClose, onNavigate }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const productNames = useMemo(() => new Map(products.map((product) => [product.id, product.name])), [products])

  const entries = useMemo<PaletteEntry[]>(() => {
    const commands: PaletteEntry[] = [
      { id: 'cmd-work', group: '快捷入口', title: '需求中心', hint: '查看所有项目的需求', run: () => onNavigate('/tasks') },
      { id: 'cmd-products', group: '快捷入口', title: '产品总览', hint: '回到工作台', run: () => onNavigate('/products') },
    ]
    const matchingProducts: PaletteEntry[] = products
      .filter((product) => product.archivedAt === null)
      .filter((product) => matchesQuery({ title: product.name, description: product.description, assignee: '' } as WorkItem, query, ''))
      .map((product) => ({
        id: `product-${product.id}`,
        group: '产品',
        title: product.name,
        hint: product.description,
        badge: product.icon,
        run: () => onNavigate(`/products/${product.id}`),
      }))
    const matchingTasks: PaletteEntry[] = workItems
      .filter((item) => matchesQuery(item, query, productNames.get(item.productId) ?? ''))
      .map((item) => ({
        id: `task-${item.id}`,
        group: '任务',
        title: item.title,
        hint: productNames.get(item.productId) ?? '',
        badge: workItemStatusLabels[item.status],
        run: () => onNavigate(`/tasks?open=${encodeURIComponent(item.id)}`),
      }))
    const matchingTrash: PaletteEntry[] = trashItems
      .filter((item) => matchesQuery(item, query, productNames.get(item.productId) ?? ''))
      .map((item) => ({
        id: `trash-${item.id}`,
        group: '回收站',
        title: item.title,
        hint: productNames.get(item.productId) ?? '',
        badge: '回收站',
        run: () => onNavigate(`/tasks?open=${encodeURIComponent(item.id)}`),
      }))

    const groups: PaletteEntry[] = []
    if (query.trim() === '') groups.push(...commands, ...matchingProducts.slice(0, MAX_PER_GROUP))
    else groups.push(...matchingProducts.slice(0, MAX_PER_GROUP), ...matchingTasks.slice(0, MAX_PER_GROUP), ...matchingTrash.slice(0, MAX_PER_GROUP))
    return groups
  }, [products, workItems, trashItems, query, productNames, onNavigate])

  useEffect(() => {
    if (!open) {
      setQuery('')
      setActiveIndex(0)
      return
    }
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(timer)
  }, [open])

  useEffect(() => { setActiveIndex(0) }, [query])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  const activate = (entry: PaletteEntry | undefined) => {
    if (!entry) return
    onClose()
    entry.run()
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => Math.min(index + 1, entries.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      activate(entries[activeIndex])
    }
  }

  let lastGroup = ''

  return (
    <div className="palette-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="命令面板">
        <div className="palette-input-row">
          <IconSearch className="palette-search-icon" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="搜索产品、任务，或输入命令…"
            aria-label="搜索产品与任务"
            aria-activedescendant={entries[activeIndex] ? `palette-option-${activeIndex}` : undefined}
          />
          <kbd className="palette-esc">Esc</kbd>
        </div>
        <div className="palette-list" ref={listRef}>
          {entries.length === 0 && (
            <div className="palette-empty"><IconInbox size={18} /><p>没有匹配的产品或任务</p></div>
          )}
          {entries.map((entry, index) => {
            const showGroup = entry.group !== lastGroup
            lastGroup = entry.group
            return (
              <div key={entry.id}>
                {showGroup && <div className="palette-group">{entry.group}</div>}
                <button
                  type="button"
                  id={`palette-option-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  className={`palette-option ${index === activeIndex ? 'active' : ''}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => activate(entry)}
                >
                  {entry.badge && <span className="palette-badge">{entry.badge}</span>}
                  <span className="palette-option-text">
                    <span className="palette-option-title">{entry.title}</span>
                    {entry.hint && <span className="palette-option-hint">{entry.hint}</span>}
                  </span>
                </button>
              </div>
            )
          })}
        </div>
        <footer className="palette-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span>
          <span><kbd>↵</kbd> 打开</span>
          <span><kbd>Esc</kbd> 关闭</span>
        </footer>
      </div>
    </div>
  )
}
