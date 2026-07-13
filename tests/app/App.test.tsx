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

  it('opens Flora and renders exactly five ordered route links', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(within(screen.getByRole('region', { name: '活跃产品' })).getByRole('link', { name: /Flora/ }))

    expect(screen.getByRole('heading', { name: 'Flora' })).toBeInTheDocument()
    const detailNav = screen.getByRole('navigation', { name: '产品详情' })
    expect(within(detailNav).getAllByRole('link').map((link) => link.textContent)).toEqual([
      '概览',
      '任务',
      '版本',
      '文档',
      '设置',
    ])
    expect(within(detailNav).getByRole('link', { name: '概览' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('heading', { name: '产品概览' })).toBeInTheDocument()
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

  it('rejects empty numeric fields when creating and does not persist the product', async () => {
    const repository = createStudioRepository(localStorage)
    const user = userEvent.setup()
    renderApp('/products', repository)

    await user.click(screen.getByRole('button', { name: '新建产品' }))
    await user.type(screen.getByLabelText('产品名称'), 'Empty Metrics')
    await user.clear(screen.getByLabelText('完成度'))
    await user.clear(screen.getByLabelText('用户数'))
    await user.click(screen.getByRole('button', { name: '创建产品' }))

    expect(screen.getAllByRole('alert').map((alert) => alert.textContent)).toEqual(
      expect.arrayContaining(['请输入完成度', '请输入用户数']),
    )
    expect(repository.listProducts().some(({ name }) => name === 'Empty Metrics')).toBe(false)
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
    await user.click(screen.getByRole('link', { name: '概览' }))
    expect(screen.getByText('3,000')).toBeInTheDocument()
    expect(screen.getByText('billing records')).toBeInTheDocument()
  })

  it('rejects empty numeric fields in settings and preserves stored values', async () => {
    const repository = createStudioRepository(localStorage)
    const original = repository.listProducts().find(({ id }) => id === 'flora')!
    const user = userEvent.setup()
    renderApp('/products/flora/settings', repository)

    await user.clear(screen.getByLabelText('完成度'))
    await user.clear(screen.getByLabelText('用户数'))
    await user.click(screen.getByRole('button', { name: '保存设置' }))

    expect(screen.getAllByRole('alert').map((alert) => alert.textContent)).toEqual(
      expect.arrayContaining(['请输入完成度', '请输入用户数']),
    )
    expect(repository.listProducts().find(({ id }) => id === 'flora')).toEqual(original)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('archives only after confirmation and hides the product from the active overview', async () => {
    const user = userEvent.setup()
    renderApp('/products/flora/settings')

    await user.click(screen.getByRole('button', { name: '归档产品' }))
    const dialog = screen.getByRole('dialog')
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
      status: 'beta',
      archivedAt: '2026-07-13T08:00:00.000Z',
    })
    const user = userEvent.setup()
    renderApp('/products', repository)

    await user.click(screen.getByRole('button', { name: '查看已归档产品' }))
    await user.click(screen.getByRole('button', { name: '恢复 Flora' }))

    expect(within(screen.getByRole('region', { name: '活跃产品' })).getByRole('link', { name: /Flora/ })).toBeInTheDocument()
    expect(repository.listProducts().find(({ id }) => id === 'flora')).toMatchObject({
      status: 'beta',
      archivedAt: null,
    })
  })

  it.each([
    ['flora', 'beta'],
    ['text-war', 'released'],
  ] as const)('preserves %s lifecycle status across archive and restore', async (productId, status) => {
    const repository = createStudioRepository(localStorage)
    const product = repository.listProducts().find(({ id }) => id === productId)!
    const user = userEvent.setup()
    renderApp(`/products/${productId}/settings`, repository)

    await user.click(screen.getByRole('button', { name: '归档产品' }))
    await user.click(screen.getByRole('button', { name: '确认归档' }))
    expect(repository.listProducts().find(({ id }) => id === productId)).toMatchObject({
      status,
      archivedAt: expect.any(String),
    })
    await user.click(screen.getByRole('button', { name: '查看已归档产品' }))
    await user.click(screen.getByRole('button', { name: `恢复 ${product.name}` }))

    expect(repository.listProducts().find(({ id }) => id === productId)).toMatchObject({
      status,
      archivedAt: null,
    })
  })

  it('refreshes its snapshot after a relevant cross-tab storage event', async () => {
    const repository = createStudioRepository(localStorage)
    renderApp('/products', repository)
    const flora = repository.listProducts().find(({ id }) => id === 'flora')!

    repository.saveProduct({ ...flora, name: 'Flora Cross Tab' })
    window.dispatchEvent(new StorageEvent('storage', { key: 'vibe-studio:v1' }))

    expect(await screen.findByRole('link', { name: /Flora Cross Tab，打开产品详情/ })).toBeInTheDocument()
  })

  it('restores a legacy archived product into a valid developing lifecycle', async () => {
    const repository = createStudioRepository(localStorage)
    const flora = repository.listProducts().find(({ id }) => id === 'flora')!
    repository.saveProduct({ ...flora, status: 'archived', archivedAt: new Date().toISOString() })
    const user = userEvent.setup()
    renderApp('/products', repository)

    await user.click(screen.getByRole('button', { name: '查看已归档产品' }))
    await user.click(screen.getByRole('button', { name: '恢复 Flora' }))

    expect(repository.listProducts().find(({ id }) => id === 'flora')).toMatchObject({
      status: 'developing',
      archivedAt: null,
    })
    expect(within(screen.getByRole('region', { name: '活跃产品' })).getByRole('link', { name: /Flora/ })).toBeInTheDocument()
  })

  it('migrates a legacy active archived status when loading the App boundary', () => {
    const repository = createStudioRepository(localStorage)
    const flora = repository.listProducts().find(({ id }) => id === 'flora')!
    repository.saveProduct({ ...flora, status: 'archived', archivedAt: null })

    renderApp('/products', repository)

    expect(repository.listProducts().find(({ id }) => id === 'flora')).toMatchObject({
      status: 'developing',
      archivedAt: null,
    })
    expect(screen.getByRole('link', { name: /Flora，打开产品详情/ })).toBeInTheDocument()
  })

  it('keeps a safe view and reports a failed legacy migration', () => {
    const repository = createStudioRepository(localStorage)
    const flora = repository.listProducts().find(({ id }) => id === 'flora')!
    repository.saveProduct({ ...flora, status: 'archived', archivedAt: null })
    const failingRepository = {
      ...repository,
      saveProduct: () => {
        throw new RepositoryError('PERSISTENCE_FAILED', 'migration failed')
      },
    }

    renderApp('/products', failingRepository)

    expect(screen.getByRole('alert')).toHaveTextContent('旧版产品数据迁移失败')
    expect(within(screen.getByRole('link', { name: /Flora，打开产品详情/ })).getByText('开发中')).toBeInTheDocument()
  })

  it('preserves a settings draft when another product changes externally', async () => {
    const repository = createStudioRepository(localStorage)
    const user = userEvent.setup()
    renderApp('/products/flora/settings', repository)
    const name = screen.getByLabelText('产品名称')
    await user.clear(name)
    await user.type(name, 'Flora Draft')
    const resume = repository.listProducts().find(({ id }) => id === 'resume-genius')!

    repository.saveProduct({ ...resume, name: 'Resume External', updatedAt: new Date().toISOString() })
    window.dispatchEvent(new StorageEvent('storage', { key: 'vibe-studio:v1' }))

    expect(await screen.findByRole('link', { name: /Resume External/ })).toBeInTheDocument()
    expect(name).toHaveValue('Flora Draft')
    expect(screen.queryByText(/当前产品已在其他窗口更新/)).not.toBeInTheDocument()
  })

  it('preserves a dirty draft and offers the current product external version', async () => {
    const repository = createStudioRepository(localStorage)
    const user = userEvent.setup()
    renderApp('/products/flora/settings', repository)
    const name = screen.getByLabelText('产品名称')
    await user.clear(name)
    await user.type(name, 'Flora Draft')
    const flora = repository.listProducts().find(({ id }) => id === 'flora')!

    repository.saveProduct({ ...flora, name: 'Flora External', updatedAt: '2026-07-13T09:00:00.000Z' })
    window.dispatchEvent(new StorageEvent('storage', { key: 'vibe-studio:v1' }))

    expect(name).toHaveValue('Flora Draft')
    expect(await screen.findByRole('alert')).toHaveTextContent('当前产品已在其他窗口更新')
    await user.click(screen.getByRole('button', { name: '加载外部版本' }))
    expect(name).toHaveValue('Flora External')
  })

  it('traps focus in the create dialog, closes on Escape, and restores trigger focus', async () => {
    const user = userEvent.setup()
    renderApp()
    const trigger = screen.getByRole('button', { name: '新建产品' })

    await user.click(trigger)
    const dialog = screen.getByRole('dialog', { name: '新建产品' })
    expect(within(dialog).getByRole('button', { name: '关闭' })).toHaveFocus()
    await user.tab({ shift: true })
    expect(within(dialog).getByRole('button', { name: '创建产品' })).toHaveFocus()
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog', { name: '新建产品' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('uses the shared keyboard-accessible dialog for archive confirmation', async () => {
    const user = userEvent.setup()
    renderApp('/products/flora/settings')
    const trigger = screen.getByRole('button', { name: '归档产品' })

    await user.click(trigger)
    expect(screen.getByRole('dialog', { name: /确认归档 Flora/ })).toBeInTheDocument()
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog', { name: /确认归档 Flora/ })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('rejects incomplete HTTPS URLs and associates the error with its field', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByRole('button', { name: '新建产品' }))
    await user.type(screen.getByLabelText('产品名称'), 'Bad URL')
    await user.type(screen.getByLabelText('应用地址'), 'https://')
    await user.click(screen.getByRole('button', { name: '创建产品' }))

    const input = screen.getByLabelText('应用地址')
    const error = screen.getByText('请输入有效的 HTTPS 应用地址')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAttribute('aria-describedby', error.id)
  })

  it('does not render unsafe persisted app URLs', () => {
    const repository = createStudioRepository(localStorage)
    const flora = repository.listProducts().find(({ id }) => id === 'flora')!
    repository.saveProduct({ ...flora, appUrl: 'javascript:alert(1)' })

    renderApp('/products/flora', repository)

    expect(screen.queryByRole('link', { name: /访问应用/ })).not.toBeInTheDocument()
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
    repository.saveProduct({ ...flora, status: 'beta', archivedAt: new Date().toISOString() })
    renderApp('/products/flora', repository)
    expect(screen.getByRole('heading', { name: '产品已归档' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '恢复产品' })).toBeInTheDocument()
  })
})
