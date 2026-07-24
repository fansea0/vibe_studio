import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import type { WorkItem } from '../../src/domain/models'
import { TaskBoard } from '../../src/app/TaskBoard'

const baseItem = (overrides: Partial<WorkItem> = {}): WorkItem => ({
  id: 'p1-item-1', productId: 'p1', type: 'requirement', title: 't', description: '', assignee: '', priority: 'medium', dueDate: null, status: 'todo',
  createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z', isDeleted: false, deletedAt: null, deletedBy: '',
  ...overrides,
})

const noop = async () => {}

const renderBoard = (props: Partial<Parameters<typeof TaskBoard>[0]> = {}) => render(
  <TaskBoard
    productId="p1"
    items={[]}
    trashItems={[]}
    comments={{}}
    events={{}}
    onSaveWorkItem={noop}
    onDeleteWorkItem={noop}
    onRestoreWorkItem={noop}
    onPurgeWorkItem={noop}
    onLoadComments={noop}
    onLoadEvents={noop}
    onCreateComment={noop}
    onOpenDetail={() => {}}
    onCloseDetail={() => {}}
    detailItem={null}
    {...props}
  />,
)

describe('TaskBoard', () => {
  afterEach(cleanup)
  it('renders board by default with column counts', () => {
    renderBoard({
      items: [baseItem(), baseItem({ id: 'p1-item-2', status: 'in_progress' })],
    })
    expect(screen.getByText('需求与 Bug')).toBeInTheDocument()
    const todoColumn = screen.getByRole('region', { name: '待处理 1' })
    expect(todoColumn).toBeInTheDocument()
  })

  it('switches to trash tab', async () => {
    const user = userEvent.setup()
    renderBoard({
      trashItems: [baseItem({ id: 'trash-1', isDeleted: true, deletedAt: new Date().toISOString(), deletedBy: 'bob' })],
    })
    await user.click(screen.getByRole('button', { name: /回收站/ }))
    expect(screen.getByRole('list', { name: '回收站' })).toBeInTheDocument()
  })

  it('shows trash count badge', () => {
    renderBoard({
      trashItems: [baseItem({ isDeleted: true, deletedAt: new Date().toISOString(), deletedBy: 'bob' })],
    })
    expect(screen.getByRole('button', { name: /回收站\s*1/ })).toBeInTheDocument()
  })

  it('filters by type', async () => {
    const user = userEvent.setup()
    renderBoard({
      items: [baseItem(), baseItem({ id: 'p1-bug', type: 'bug' })],
    })
    await user.click(screen.getByRole('button', { name: 'Bug', pressed: false }))
    expect(screen.getAllByText(/^Bug$/).length).toBeGreaterThan(0)
  })
})