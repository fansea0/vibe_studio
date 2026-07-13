import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from '../../src/app/App'
import { createStudioRepository } from '../../src/data/studioRepository'

type CapturedDragEnd = (event: {
  active: { id: string }
  over: { id: string } | null
}) => void

let capturedDragEnd: CapturedDragEnd | null = null

vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>()
  return {
    ...actual,
    DndContext: ({ children, onDragEnd }: { children: ReactNode; onDragEnd?: CapturedDragEnd }) => {
      capturedDragEnd = onDragEnd ?? null
      return children
    },
    useDraggable: () => ({
      attributes: {},
      listeners: undefined,
      setNodeRef: () => undefined,
      transform: null,
    }),
    useDroppable: () => ({
      isOver: false,
      setNodeRef: () => undefined,
    }),
  }
})

describe('TaskBoard DndContext integration', () => {
  beforeEach(() => {
    localStorage.clear()
    capturedDragEnd = null
  })
  afterEach(cleanup)

  it('ignores an invalid target without saving or changing the item', () => {
    const repository = createStudioRepository(localStorage)
    const saveWorkItem = vi.fn(repository.saveWorkItem)
    const original = repository.listWorkItems('flora').find(({ id }) => id === 'flora-reminder-timezone')
    render(<App initialEntries={['/products/flora/tasks']} repository={{ ...repository, saveWorkItem }} />)

    expect(capturedDragEnd).not.toBeNull()
    act(() => capturedDragEnd?.({
      active: { id: 'flora-reminder-timezone' },
      over: { id: 'not-a-column' },
    }))

    expect(saveWorkItem).not.toHaveBeenCalled()
    expect(repository.listWorkItems('flora').find(({ id }) => id === 'flora-reminder-timezone')).toEqual(original)
  })

  it('persists a valid drop and refreshes the board and overview metrics', async () => {
    const repository = createStudioRepository(localStorage)
    const saveWorkItem = vi.fn(repository.saveWorkItem)
    render(<App initialEntries={['/products/flora/tasks']} repository={{ ...repository, saveWorkItem }} />)

    expect(capturedDragEnd).not.toBeNull()
    act(() => capturedDragEnd?.({
      active: { id: 'flora-reminder-timezone' },
      over: { id: 'column:done' },
    }))

    expect(saveWorkItem).toHaveBeenCalledWith(expect.objectContaining({
      id: 'flora-reminder-timezone',
      status: 'done',
    }))
    expect(screen.getByRole('region', { name: '已完成 1' })).toHaveTextContent(
      'Reminder shifts after timezone change',
    )
    await userEvent.click(screen.getByRole('link', { name: '概览' }))
    expect(screen.getByText('未关闭 Bug').nextElementSibling).toHaveTextContent('0')
  })
})
