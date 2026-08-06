import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import App from '../../src/app/App'
import { resolveWorkItemStatus } from '../../src/app/workItemTransition'
import { createStudioRepository, RepositoryError } from '../../src/data/studioRepository'
import type { ProductVersion } from '../../src/domain/models'

const renderApp = (
  initialEntry: string,
  repository = createStudioRepository(localStorage),
) => {
  const shared = repository
  const result = render(<App initialEntries={[initialEntry]} repository={shared} />)
  return { ...result, repository: shared }
}

const quickCreateTask = async (title: string) => {
  const input = screen.getByRole('textbox', { name: '新建任务标题' })
  await userEvent.type(input, title)
  await userEvent.click(screen.getByRole('button', { name: '创建' }))
}

const createTask = async (
  title: string,
  type: 'requirement' | 'bug' = 'requirement',
  repository: ReturnType<typeof createStudioRepository> = createStudioRepository(localStorage),
) => {
  await quickCreateTask(title)
  if (type === 'bug') {
    const all = repository.listWorkItems('flora')
    const target = all.find((it) => it.title === title.trim())
    if (target) await repository.saveWorkItem({ ...target, type })
  }
}

describe('task board', () => {
  beforeEach(() => localStorage.clear())
  afterEach(cleanup)

  it('filters Bug without changing or showing requirements', async () => {
    renderApp('/products/flora/tasks')

    await userEvent.click(screen.getByRole('button', { name: 'Bug' }))

    expect(screen.getByText('Reminder shifts after timezone change')).toBeInTheDocument()
    expect(screen.queryByText('Add seasonal watering schedules')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '全部' })).toBeInTheDocument()
  })

  it('creates requirement and Bug records for only the current product', async () => {
    const { repository } = renderApp('/products/flora/tasks')

    await createTask('  Better journal  ')
    await createTask('Fix leaf scanner', 'bug', repository)

    expect(repository.listWorkItems('flora')).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'Better journal', type: 'requirement', status: 'todo' }),
      expect.objectContaining({ title: 'Fix leaf scanner', type: 'bug', status: 'todo' }),
    ]))
    expect(repository.listWorkItems('resume-genius')).toHaveLength(2)
  })

  it('rejects empty titles and ignores surrounding whitespace', async () => {
    const { repository } = renderApp('/products/flora/tasks')
    const before = repository.listWorkItems('flora')
    const input = screen.getByRole('textbox', { name: '新建任务标题' })
    const submit = screen.getByRole('button', { name: '创建' })

    expect(submit).toBeDisabled()
    await userEvent.type(input, '   ')
    expect(submit).toBeDisabled()
    await userEvent.click(submit)

    expect(repository.listWorkItems('flora')).toEqual(before)
  })

  it('moves work through labelled status selects and refreshes overview metrics', async () => {
    renderApp('/products/flora/tasks')
    const requirementStatus = screen.getByRole('combobox', {
      name: 'Add seasonal watering schedules 状态',
    })
    const bugStatus = screen.getByRole('combobox', {
      name: 'Reminder shifts after timezone change 状态',
    })

    await userEvent.selectOptions(requirementStatus, 'done')
    await userEvent.selectOptions(bugStatus, 'in_progress')
    await userEvent.click(screen.getByRole('link', { name: '概览' }))

    expect(screen.getByText('未完成需求').nextElementSibling).toHaveTextContent('0')
    expect(screen.getByText('未关闭 Bug').nextElementSibling).toHaveTextContent('1')
  })

  it('resolves only valid changed drop targets', () => {
    expect(resolveWorkItemStatus('todo', null)).toBeNull()
    expect(resolveWorkItemStatus('todo', 'not-a-column')).toBeNull()
    expect(resolveWorkItemStatus('todo', 'todo')).toBeNull()
    expect(resolveWorkItemStatus('todo', 'column:done')).toBe('done')
    expect(resolveWorkItemStatus('todo', 'item:any:in_progress')).toBe('in_progress')
  })

  it('shows repository failures as alerts', async () => {
    const repository = createStudioRepository(localStorage)
    const failingRepository = {
      ...repository,
      saveWorkItem: () => {
        throw new RepositoryError('PERSISTENCE_FAILED', 'failed')
      },
    }
    renderApp('/products/flora/tasks', failingRepository)

    await quickCreateTask('Cannot persist')

    expect(screen.getByRole('alert')).toHaveTextContent('保存失败，请稍后重试')
    expect(screen.queryByText('Cannot persist')).not.toBeInTheDocument()
  })
})

describe('manual versions', () => {
  beforeEach(() => localStorage.clear())
  afterEach(cleanup)

  const openCreateVersion = async () => {
    await userEvent.click(screen.getByRole('button', { name: '新建版本' }))
    return screen.getByRole('dialog', { name: '新建版本' })
  }

  it('lists newest first and marks the current released version', () => {
    renderApp('/products/flora/versions')

    const versions = screen.getAllByRole('article')
    expect(versions[0]).toHaveTextContent('1.5.0')
    expect(versions[1]).toHaveTextContent('1.4.0')
    expect(versions[1]).toHaveTextContent('当前版本')
  })

  it('creates a released version and refreshes currentVersion immediately', async () => {
    const repository = createStudioRepository(localStorage)
    renderApp('/products/flora/versions', repository)
    const dialog = await openCreateVersion()
    await userEvent.type(within(dialog).getByLabelText('版本号'), ' v0.8.2 ')
    await userEvent.selectOptions(within(dialog).getByLabelText('状态'), 'released')
    fireEvent.change(within(dialog).getByLabelText('发布日期'), { target: { value: '2026-07-13' } })
    await userEvent.type(within(dialog).getByLabelText('版本说明'), 'Manual release')
    await userEvent.click(within(dialog).getByRole('button', { name: '创建版本' }))
    await userEvent.click(screen.getByRole('link', { name: '概览' }))

    expect(screen.getByText('当前版本').nextElementSibling).toHaveTextContent('v0.8.2')
    expect(repository.listVersions('flora')).toEqual(expect.arrayContaining([
      expect.objectContaining({ number: 'v0.8.2', status: 'released', releasedAt: '2026-07-13T00:00:00.000Z' }),
    ]))
  })

  it('keeps planned releases from becoming current and discards their dates', async () => {
    const repository = createStudioRepository(localStorage)
    renderApp('/products/flora/versions', repository)
    const dialog = await openCreateVersion()
    await userEvent.type(within(dialog).getByLabelText('版本号'), '9.0-planned')
    fireEvent.change(within(dialog).getByLabelText('发布日期'), { target: { value: '2026-07-13' } })
    await userEvent.click(within(dialog).getByRole('button', { name: '创建版本' }))

    expect(repository.listVersions('flora').find(({ number }) => number === '9.0-planned')).toMatchObject({
      status: 'planned', releasedAt: null,
    })
    await userEvent.click(screen.getByRole('link', { name: '概览' }))
    expect(screen.getByText('当前版本').nextElementSibling).toHaveTextContent('1.4.0')
  })

  it('fills the local date for released versions without a release date', async () => {
    const now = new Date()
    const expectedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T00:00:00.000Z`
    const repository = createStudioRepository(localStorage)
    renderApp('/products/flora/versions', repository)
    const dialog = await openCreateVersion()
    await userEvent.type(within(dialog).getByLabelText('版本号'), '1.6.0')
    await userEvent.selectOptions(within(dialog).getByLabelText('状态'), 'released')
    await userEvent.click(within(dialog).getByRole('button', { name: '创建版本' }))

    expect(repository.listVersions('flora').find(({ number }) => number === '1.6.0')?.releasedAt)
      .toBe(expectedDate)
  })

  it('rejects duplicate version numbers and invalid released dates', async () => {
    const repository = createStudioRepository(localStorage)
    renderApp('/products/flora/versions', repository)
    const dialog = await openCreateVersion()
    await userEvent.type(within(dialog).getByLabelText('版本号'), '1.4.0')
    await userEvent.selectOptions(within(dialog).getByLabelText('状态'), 'released')
    fireEvent.change(within(dialog).getByLabelText('发布日期'), { target: { value: '2026-02-30' } })
    await userEvent.click(within(dialog).getByRole('button', { name: '创建版本' }))

    expect(within(dialog).getAllByRole('alert').map((alert) => alert.textContent)).toEqual(
      expect.arrayContaining(['版本号已存在', '请输入有效日期']),
    )
    expect(within(dialog).getByLabelText('版本号')).toHaveAccessibleDescription('版本号已存在')
    expect(within(dialog).getByLabelText('发布日期')).toHaveAccessibleDescription('请输入有效日期')
    expect(repository.listVersions('flora').filter(({ number }) => number === '1.4.0')).toHaveLength(1)
  })

  it('reports repository failures without adding a version', async () => {
    const repository = createStudioRepository(localStorage)
    const failingRepository = {
      ...repository,
      saveVersion: (_version: ProductVersion) => {
        throw new RepositoryError('PERSISTENCE_FAILED', 'failed')
      },
    }
    renderApp('/products/flora/versions', failingRepository)
    const dialog = await openCreateVersion()
    await userEvent.type(within(dialog).getByLabelText('版本号'), 'failure')
    await userEvent.click(within(dialog).getByRole('button', { name: '创建版本' }))

    expect(within(dialog).getByRole('alert')).toHaveTextContent('保存失败，请稍后重试')
    expect(screen.queryByText('failure')).not.toBeInTheDocument()
  })

  it('reports a stale-dialog duplicate rejected by the repository without adding it twice', async () => {
    const repository = createStudioRepository(localStorage)
    const externalRepository = createStudioRepository(localStorage)
    renderApp('/products/flora/versions', repository)
    const dialog = await openCreateVersion()
    await externalRepository.saveVersion({
      id: 'external-stale-version',
      productId: 'flora',
      number: 'stale-release',
      status: 'planned',
      releasedAt: null,
      notes: '',
      createdAt: '2026-07-13T00:00:00.000Z',
      updatedAt: '2026-07-13T00:00:00.000Z',
    })

    await userEvent.type(within(dialog).getByLabelText('版本号'), ' stale-release ')
    await userEvent.click(within(dialog).getByRole('button', { name: '创建版本' }))

    expect(within(dialog).getByRole('alert')).toHaveTextContent('保存失败，请稍后重试')
    expect(externalRepository.listVersions('flora').filter(({ number }) => number === 'stale-release'))
      .toHaveLength(1)
  })

  it('keeps versions isolated to their owning product', async () => {
    const repository = createStudioRepository(localStorage)
    const resumeBefore = repository.listVersions('resume-genius')
    renderApp('/products/flora/versions', repository)
    const dialog = await openCreateVersion()
    await userEvent.type(within(dialog).getByLabelText('版本号'), 'flora-only')
    await userEvent.click(within(dialog).getByRole('button', { name: '创建版本' }))

    expect(repository.listVersions('resume-genius')).toEqual(resumeBefore)
    expect(repository.listVersions('flora')).toEqual(expect.arrayContaining([
      expect.objectContaining({ number: 'flora-only', productId: 'flora' }),
    ]))
  })
})
