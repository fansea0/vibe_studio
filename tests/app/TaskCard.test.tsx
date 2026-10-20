import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkItem } from '../../src/domain/models'
import { TaskCard } from '../../src/app/TaskCard'

const item: WorkItem = {
  id: 'w1', productId: 'p1', type: 'requirement', title: '可编辑的任务', description: '描述', assignee: 'Lin', priority: 'high', dueDate: null,
  status: 'todo', createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z', isDeleted: false, deletedAt: null, deletedBy: '',
}

const noop = () => {}

const renderCard = (overrides: Partial<Parameters<typeof TaskCard>[0]> = {}) => {
  const onEdit = vi.fn(noop)
  const onDelete = vi.fn(noop)
  const onOpenDetail = vi.fn(noop)
  render(
    <TaskCard item={item} onSaveStatus={noop} onOpenDetail={onOpenDetail} onEdit={onEdit} onDelete={onDelete} {...overrides} />,
  )
  return { onEdit, onDelete, onOpenDetail }
}

describe('TaskCard', () => {
  afterEach(cleanup)

  it('从卡片菜单触发编辑与删除', async () => {
    const user = userEvent.setup()
    const { onEdit, onDelete } = renderCard()
    await user.click(screen.getByLabelText('任务操作'))
    await user.click(screen.getByRole('button', { name: '编辑' }))
    expect(onEdit).toHaveBeenCalledWith(item)
    await user.click(screen.getByLabelText('任务操作'))
    await user.click(screen.getByRole('button', { name: '删除' }))
    expect(onDelete).toHaveBeenCalledWith(item)
  })

  it('标题按钮打开详情，优先级与类型可读', () => {
    const { onOpenDetail } = renderCard()
    screen.getByRole('button', { name: '可编辑的任务' }).click()
    expect(onOpenDetail).toHaveBeenCalledWith(item)
    expect(screen.getByText('需求')).toBeInTheDocument()
    expect(screen.getByText('高')).toBeInTheDocument()
  })

  it('跨项目视图展示归属项目徽标', () => {
    renderCard({ productBadge: { name: 'Flora', icon: '🌿' } })
    expect(screen.getByText('Flora')).toBeInTheDocument()
  })
})
