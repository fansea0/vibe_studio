import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from 'react'
import { IconCheck, IconChevron, IconList, IconBoard, IconPlus, IconSearch } from './icons'

export interface MenuOption {
  value: string
  label: string
  count?: number
}

interface PopoverMenuProps {
  label: string
  value: string
  options: MenuOption[]
  onChange: (value: string) => void
  /** 触发器上回显的当前值，默认取选项自身的文案。 */
  displayLabel?: string
  menuLabel?: string
  /** 排序这类常驻选项不该看起来像「已激活的筛选」。 */
  emphasize?: boolean
}

/** 轻量下拉菜单：键盘可达、点击外部关闭、选中后回显。 */
export function PopoverMenu({ label, value, options, onChange, displayLabel, menuLabel, emphasize = true }: PopoverMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef<(HTMLLIElement | null)[]>([])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  useEffect(() => {
    if (!open) return
    const selected = options.findIndex((option) => option.value === value)
    optionRefs.current[selected >= 0 ? selected : 0]?.focus()
  }, [open, options, value])

  const choose = (next: string) => {
    onChange(next)
    setOpen(false)
    triggerRef.current?.focus()
  }

  const onListKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const current = optionRefs.current.findIndex((node) => node === document.activeElement)
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      optionRefs.current[Math.min(current + 1, options.length - 1)]?.focus()
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      optionRefs.current[Math.max(current - 1, 0)]?.focus()
    } else if (event.key === 'Home') {
      event.preventDefault()
      optionRefs.current[0]?.focus()
    } else if (event.key === 'End') {
      event.preventDefault()
      optionRefs.current[options.length - 1]?.focus()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
    }
  }

  const current = options.find((option) => option.value === value)

  return (
    <div className="popover-menu" ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className={`popover-trigger ${emphasize && value !== 'all' ? 'active' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((shown) => !shown)}
      >
        <span className="popover-trigger-label">{label}</span>
        {value !== 'all' && <span className="popover-trigger-value">{displayLabel ?? current?.label ?? value}</span>}
        <IconChevron size={12} />
      </button>
      {open && (
        <ul className="popover-list" role="listbox" aria-label={menuLabel ?? label} onKeyDown={onListKeyDown}>
          {options.map((option, index) => (
            <li
              key={option.value}
              ref={(node) => { optionRefs.current[index] = node }}
              role="option"
              aria-selected={option.value === value}
              tabIndex={-1}
              className={option.value === value ? 'selected' : ''}
              onClick={() => choose(option.value)}
              onKeyDown={(event: KeyboardEvent<HTMLLIElement>) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  choose(option.value)
                }
              }}
            >
              <IconCheck size={12} className="popover-check" />
              <span className="popover-option-label">{option.label}</span>
              {option.count !== undefined && <span className="popover-count">{option.count}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

interface WorkToolbarProps {
  query: string
  onQueryChange: (value: string) => void
  mode: 'board' | 'list'
  onModeChange: (mode: 'board' | 'list') => void
  onCreate: () => void
  onOpenPalette: () => void
  searchPlaceholder: string
  searchRef?: Ref<HTMLInputElement>
  /** 工具栏左侧的固定内容（任务/回收站切换）。 */
  leading?: ReactNode
}

export function WorkToolbar({ query, onQueryChange, mode, onModeChange, onCreate, onOpenPalette, searchPlaceholder, searchRef, leading }: WorkToolbarProps) {
  return (
    <div className="work-toolbar">
      {leading}
      <div className="work-search">
        <IconSearch className="work-search-icon" />
        <input
          ref={searchRef}
          type="search"
          aria-label="搜索任务"
          placeholder={searchPlaceholder}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
        <button type="button" className="work-search-shortcut" onClick={onOpenPalette} aria-label="打开命令面板">
          <kbd>⌘</kbd><kbd>K</kbd>
        </button>
      </div>
      <div className="work-toolbar-actions">
        <div className="work-view-switch" role="group" aria-label="视图切换">
          <button type="button" aria-pressed={mode === 'board'} onClick={() => onModeChange('board')}><IconBoard />看板</button>
          <button type="button" aria-pressed={mode === 'list'} onClick={() => onModeChange('list')}><IconList />列表</button>
        </div>
        <button type="button" className="work-new-button" onClick={onCreate}><IconPlus />新建任务</button>
      </div>
    </div>
  )
}
