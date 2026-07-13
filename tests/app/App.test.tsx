import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import App from '../../src/app/App'
import { createStudioRepository, RepositoryError } from '../../src/data/studioRepository'

const renderApp = (initialEntry = '/products', repository = createStudioRepository(localStorage)) =>
  render(<App initialEntries={[initialEntry]} repository={repository} />)

describe('product workspace', () => {
  beforeEach(() => localStorage.clear())
  afterEach(cleanup)

  it('opens Flora from its accessible product card and renders exactly five ordered tabs', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(within(screen.getByRole('region', { name: '活跃产品' })).getByRole('link', { name: /Flora/ }))

    expect(screen.getByRole('heading', { name: 'Flora' })).toBeInTheDocument()
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      '概览',
      '任务',
      '版本',
      '文档',
      '设置',
    ])
  })

  it('creates a product and navigates to its overview', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByRole('button', { name: '新建产品' }))
    await user.type(screen.getByLabelText('产品名称'), 'Focus Flow')
    await user.type(screen.getByLabelText('产品描述'), 'A focused planning space.')
    await user.type(screen.getByLabelText('产品图标'), '🎯')
    await user.type(screen.getByLabelText('用户数'), '12')
    await user.click(screen.getByRole('button', { name: '创建产品' }))

    expect(await screen.findByRole('heading', { name: 'Focus Flow' })).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
  })

  it('rejects duplicate names and non-HTTPS app URLs', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByRole('button', { name: '新建产品' }))
    await user.type(screen.getByLabelText('产品名称'), ' flora ')
    await user.type(screen.getByLabelText('应用地址'), 'http://unsafe.example.com')
    await user.click(screen.getByRole('button', { name: '创建产品' }))

    expect(screen.getByText('产品名称已存在')).toBeInTheDocument()
    expect(screen.getByText('应用地址必须以 https:// 开头')).toBeInTheDocument()
  })

  it('updates user count and source in settings and reflects it on overview', async () => {
    const user = userEvent.setup()
    renderApp('/products/flora/settings')

    const userCount = screen.getByLabelText('用户数')
    await user.clear(userCount)
    await user.type(userCount, '3000')
    const source = screen.getByLabelText('用户数来源')
    await user.clear(source)
    await user.type(source, 'billing records')
    await user.click(screen.getByRole('button', { name: '保存设置' }))

    expect(screen.getByRole('status')).toHaveTextContent('设置已保存')
    await user.click(screen.getByRole('tab', { name: '概览' }))
    expect(screen.getByText('3,000')).toBeInTheDocument()
    expect(screen.getByText('billing records')).toBeInTheDocument()
  })

  it('archives only after confirmation and hides the product from the active overview', async () => {
    const user = userEvent.setup()
    renderApp('/products/flora/settings')

    await user.click(screen.getByRole('button', { name: '归档产品' }))
    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByText(/归档后可在产品总览恢复/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '确认归档' }))

    expect(await screen.findByRole('heading', { name: '产品总览' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Flora/ })).not.toBeInTheDocument()
  })

  it('restores an archived product from the overview', async () => {
    const repository = createStudioRepository(localStorage)
    const flora = repository.listProducts().find(({ id }) => id === 'flora')!
    repository.saveProduct({
      ...flora,
      status: 'archived',
      archivedAt: '2026-07-13T08:00:00.000Z',
    })
    const user = userEvent.setup()
    renderApp('/products', repository)

    await user.click(screen.getByRole('button', { name: '查看已归档产品' }))
    await user.click(screen.getByRole('button', { name: '恢复 Flora' }))

    expect(within(screen.getByRole('region', { name: '活跃产品' })).getByRole('link', { name: /Flora/ })).toBeInTheDocument()
    expect(repository.listProducts().find(({ id }) => id === 'flora')).toMatchObject({
      status: 'developing',
      archivedAt: null,
    })
  })

  it('keeps data and operations disabled and non-navigable', async () => {
    const user = userEvent.setup()
    renderApp()

    const disabledItem = screen.getByText('数据与运营（即将推出）')
    expect(disabledItem).toHaveAttribute('aria-disabled', 'true')
    expect(disabledItem.closest('a')).toBeNull()
    await user.click(disabledItem)
    expect(screen.getByRole('heading', { name: '产品总览' })).toBeInTheDocument()
  })

  it('shows repository persistence errors without reporting success', async () => {
    const repository = createStudioRepository(localStorage)
    const failingRepository = {
      ...repository,
      saveProduct: () => {
        throw new RepositoryError('PERSISTENCE_FAILED', 'Studio changes could not be persisted.')
      },
    }
    const user = userEvent.setup()
    renderApp('/products', failingRepository)

    await user.click(screen.getByRole('button', { name: '新建产品' }))
    await user.type(screen.getByLabelText('产品名称'), 'Failure Case')
    await user.click(screen.getByRole('button', { name: '创建产品' }))

    expect(screen.getByRole('alert')).toHaveTextContent('保存失败，请稍后重试')
    expect(screen.queryByRole('heading', { name: 'Failure Case' })).not.toBeInTheDocument()
  })

  it('distinguishes missing and archived product routes', async () => {
    const { unmount } = renderApp('/products/not-here')
    expect(screen.getByRole('heading', { name: '产品不存在' })).toBeInTheDocument()
    unmount()

    const repository = createStudioRepository(localStorage)
    const flora = repository.listProducts().find(({ id }) => id === 'flora')!
    repository.saveProduct({ ...flora, status: 'archived', archivedAt: new Date().toISOString() })
    renderApp('/products/flora', repository)
    expect(screen.getByRole('heading', { name: '产品已归档' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '恢复产品' })).toBeInTheDocument()
  })
})
