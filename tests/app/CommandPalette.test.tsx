import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Product, WorkItem } from '../../src/domain/models'
import { AppShell } from '../../src/app/AppShell'

const products: Product[] = [
  { id: 'flora', name: 'Flora', description: '植物养护', icon: '🌿', status: 'beta', userCount: 10, appUrl: null, repositoryPath: '', archivedAt: null, createdAt: '', updatedAt: '' },
]

const workItem = (overrides: Partial<WorkItem> = {}): WorkItem => ({
  id: 'w1', productId: 'flora', type: 'requirement', title: '任务', description: '', assignee: '', priority: 'medium', dueDate: null,
  status: 'todo', createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z', isDeleted: false, deletedAt: null, deletedBy: '',
  ...overrides,
})

const renderShell = (props: Partial<Parameters<typeof AppShell>[0]> = {}) => {
  const navigate = vi.fn()
  const view = render(
    <MemoryRouter initialEntries={['/products']}>
      <Routes>
        <Route path="*" element={<AppShell products={products} workItems={[]} trashWorkItems={[]} {...props}><div>内容</div></AppShell>} />
      </Routes>
    </MemoryRouter>,
  )
  return { ...view, navigate }
}

describe('CommandPalette', () => {
  afterEach(cleanup)

  it('opens with the ⌘K shortcut', async () => {
    const user = userEvent.setup()
    renderShell()
    expect(screen.queryByRole('dialog', { name: '命令面板' })).not.toBeInTheDocument()
    await user.keyboard('{Meta>}k{/Meta}')
    expect(await screen.findByRole('dialog', { name: '命令面板' })).toBeInTheDocument()
  })

  it('opens from the sidebar search entry', async () => {
    const user = userEvent.setup()
    renderShell()
    await user.click(screen.getByRole('button', { name: /搜索产品或任务/ }))
    expect(await screen.findByRole('dialog', { name: '命令面板' })).toBeInTheDocument()
  })

  it('finds finished tasks, which are collapsed on the board', async () => {
    const user = userEvent.setup()
    renderShell({
      workItems: [
        workItem({ id: 'a', title: '还没做的事' }),
        workItem({ id: 'b', title: '做完的事', status: 'done' }),
      ],
    })

    await user.keyboard('{Meta>}k{/Meta}')
    const input = await screen.findByRole('textbox', { name: '搜索产品与任务' })
    await user.type(input, '做完')
    expect(screen.getByText('做完的事')).toBeInTheDocument()
  })

  it('lists products and reaches them with the keyboard', async () => {
    const user = userEvent.setup()
    renderShell({ workItems: [workItem({ id: 'a', title: '搜索我' })] })

    await user.keyboard('{Meta>}k{/Meta}')
    const input = await screen.findByRole('textbox', { name: '搜索产品与任务' })
    await user.type(input, 'Flora')
    const options = await screen.findAllByRole('option')
    expect(options.some((option) => within(option).queryByText('Flora'))).toBe(true)
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    renderShell()
    await user.keyboard('{Meta>}k{/Meta}')
    expect(await screen.findByRole('dialog', { name: '命令面板' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: '命令面板' })).not.toBeInTheDocument()
  })
})
