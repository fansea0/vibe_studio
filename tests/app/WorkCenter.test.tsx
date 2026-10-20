import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Product, WorkItem } from '../../src/domain/models'
import { WorkCenter } from '../../src/app/WorkCenter'

const products: Product[] = [
  { id: 'flora', name: 'Flora', description: '植物养护', icon: '🌿', status: 'beta', userCount: 10, appUrl: null, repositoryPath: '', archivedAt: null, createdAt: '', updatedAt: '' },
  { id: 'text-war', name: 'Text War', description: '文字对战', icon: '⚔️', status: 'released', userCount: 20, appUrl: null, repositoryPath: '', archivedAt: null, createdAt: '', updatedAt: '' },
]

const workItem = (overrides: Partial<WorkItem> = {}): WorkItem => ({
  id: 'w1', productId: 'flora', type: 'requirement', title: '任务', description: '', assignee: '', priority: 'medium', dueDate: null,
  status: 'todo', createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z', isDeleted: false, deletedAt: null, deletedBy: '',
  ...overrides,
})

const noop = async () => {}

const renderCenter = (props: Partial<Parameters<typeof WorkCenter>[0]> = {}) => {
  const onSaveWorkItem = vi.fn(noop)
  const view = render(
    <MemoryRouter>
      <WorkCenter
        workItems={[]}
        trashWorkItems={[]}
        products={products}
        comments={{}}
        events={{}}
        onSaveWorkItem={onSaveWorkItem}
        onDeleteWorkItem={noop}
        onRestoreWorkItem={noop}
        onPurgeWorkItem={noop}
        onLoadComments={noop}
        onLoadEvents={noop}
        onCreateComment={noop}
        {...props}
      />
    </MemoryRouter>,
  )
  return { ...view, onSaveWorkItem }
}

describe('WorkCenter', () => {
  afterEach(cleanup)

  it('aggregates tasks from every project', () => {
    renderCenter({
      workItems: [
        workItem({ id: 'a', productId: 'flora', title: 'Flora 的需求' }),
        workItem({ id: 'b', productId: 'text-war', title: 'Text War 的需求' }),
      ],
    })
    expect(screen.getByText('Flora 的需求')).toBeInTheDocument()
    expect(screen.getByText('Text War 的需求')).toBeInTheDocument()
    expect(screen.getByText('需求中心')).toBeInTheDocument()
  })

  it('marks which project a task belongs to', () => {
    renderCenter({ workItems: [workItem({ id: 'a', productId: 'text-war', title: '跨项目的需求' })] })
    const card = screen.getByText('跨项目的需求').closest('article') as HTMLElement
    expect(within(card).getByText('Text War')).toBeInTheDocument()
  })

  it('hides finished tasks from the board but keeps them searchable', async () => {
    const user = userEvent.setup()
    renderCenter({
      workItems: [
        workItem({ id: 'a', title: '还没做的事' }),
        workItem({ id: 'b', title: '做完的事', status: 'done' }),
      ],
    })

    expect(screen.queryByText('做完的事')).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: '已完成 1' })).toBeInTheDocument()

    await user.type(screen.getByRole('searchbox', { name: '搜索任务' }), '做完')
    expect(screen.getByText('做完的事')).toBeInTheDocument()
    expect(screen.queryByText('还没做的事')).not.toBeInTheDocument()
  })

  it('narrows results down to a single project', async () => {
    const user = userEvent.setup()
    renderCenter({
      workItems: [
        workItem({ id: 'a', productId: 'flora', title: 'Flora 的需求' }),
        workItem({ id: 'b', productId: 'text-war', title: 'Text War 的需求' }),
      ],
    })

    await user.click(screen.getByRole('button', { name: /项目/ }))
    const projectMenu = screen.getByRole('listbox', { name: '项目' })
    await user.click(within(projectMenu).getByRole('option', { name: /Text War/ }))
    expect(screen.getByText('Text War 的需求')).toBeInTheDocument()
    expect(screen.queryByText('Flora 的需求')).not.toBeInTheDocument()
  })

  it('creates a quick task under the selected project', async () => {
    const user = userEvent.setup()
    const { onSaveWorkItem } = renderCenter()

    await user.selectOptions(screen.getByRole('combobox', { name: '新建任务归属项目' }), 'text-war')
    await user.type(screen.getByRole('textbox', { name: '新建任务标题' }), '新需求')
    await user.click(screen.getByRole('button', { name: '创建' }))

    expect(onSaveWorkItem).toHaveBeenCalledWith(expect.objectContaining({
      title: '新需求',
      productId: 'text-war',
      status: 'todo',
    }))
  })

  it('switches between board and list layout', async () => {
    const user = userEvent.setup()
    renderCenter({ workItems: [workItem({ id: 'a', title: '列表里的需求' })] })

    expect(screen.getByRole('region', { name: '待处理 1' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '列表' }))
    expect(screen.queryByRole('region', { name: '待处理 1' })).not.toBeInTheDocument()
    expect(screen.getByText('列表里的需求')).toBeInTheDocument()
  })
})
