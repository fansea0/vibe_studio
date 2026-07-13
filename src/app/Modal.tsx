import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react'

interface ModalProps {
  title: string
  children: ReactNode
  onClose: () => void
  className?: string
  showCloseButton?: boolean
  closeDisabled?: boolean
}

const focusableSelector = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function Modal({ title, children, onClose, className = '', showCloseButton = true, closeDisabled = false }: ModalProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = dialogRef.current
    const firstFocusable = dialog?.querySelector<HTMLElement>('[data-autofocus]')
      ?? dialog?.querySelector<HTMLElement>(focusableSelector)
    firstFocusable?.focus()

    const keepFocusInside = (event: FocusEvent) => {
      if (dialog && event.target instanceof Node && !dialog.contains(event.target)) firstFocusable?.focus()
    }
    document.addEventListener('focusin', keepFocusInside)
    return () => {
      document.removeEventListener('focusin', keepFocusInside)
      previousFocus?.focus()
    }
  }, [])

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      if (!closeDisabled) onClose()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])]
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="dialog-backdrop">
      <section ref={dialogRef} className={`dialog ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={handleKeyDown}>
        <div className="dialog-heading">
          <h2 id={titleId}>{title}</h2>
          {showCloseButton && <button type="button" className="icon-button" onClick={onClose} aria-label="关闭" data-autofocus disabled={closeDisabled}>×</button>}
        </div>
        {children}
      </section>
    </div>
  )
}
