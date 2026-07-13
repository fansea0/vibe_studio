import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from '../../src/app/App'
import { createStudioRepository, RepositoryError } from '../../src/data/studioRepository'
import type { MarkdownDocument } from '../../src/domain/models'

const renderDocuments = (
  repository = createStudioRepository(localStorage),
  productId = 'flora',
) => render(<App initialEntries={[`/products/${productId}/documents`]} repository={repository} />)

const markdownFile = (
  name: string,
  content: string,
  read: () => Promise<string> = async () => content,
) => {
  const file = new File([content], name)
  Object.defineProperty(file, 'text', { configurable: true, value: vi.fn(read) })
  return file
}

const storedDocument = (patch: Partial<MarkdownDocument> = {}): MarkdownDocument => ({
  id: 'existing-document',
  productId: 'flora',
  name: 'guide.md',
  content: '# Existing guide',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-02T00:00:00.000Z',
  ...patch,
})

describe('Markdown document workspace', () => {
  beforeEach(() => localStorage.clear())
  afterEach(cleanup)

  it('rejects non-Markdown extensions before reading or saving the file', async () => {
    const repository = createStudioRepository(localStorage)
    const saveDocument = vi.spyOn(repository, 'saveDocument')
    const file = markdownFile('notes.txt', '# Not Markdown')
    const user = userEvent.setup({ applyAccept: false })
    renderDocuments(repository)

    const input = screen.getByLabelText('上传 Markdown 文档')
    expect(input).toHaveAttribute('accept', '.md,.markdown')
    await user.upload(input, file)

    expect(screen.getByRole('alert')).toHaveTextContent('仅支持 .md 或 .markdown 文件')
    expect(file.text).not.toHaveBeenCalled()
    expect(saveDocument).not.toHaveBeenCalled()
  })

  it.each(['PLAN.MD', 'release.MarkDown'])('accepts the case-insensitive extension %s', async (name) => {
    const repository = createStudioRepository(localStorage)
    const file = markdownFile(name, '# Accepted')
    const user = userEvent.setup()
    renderDocuments(repository)

    await user.upload(screen.getByLabelText('上传 Markdown 文档'), file)

    expect(await screen.findByRole('heading', { name: 'Accepted' })).toBeInTheDocument()
    expect(repository.listDocuments('flora')).toEqual(expect.arrayContaining([
      expect.objectContaining({ name, content: '# Accepted' }),
    ]))
  })

  it('uploads Markdown, previews it safely, and keeps documents isolated by product', async () => {
    const repository = createStudioRepository(localStorage)
    const resumeBefore = repository.listDocuments('resume-genius')
    const user = userEvent.setup()
    renderDocuments(repository)

    await user.upload(
      screen.getByLabelText('上传 Markdown 文档'),
      markdownFile('flora-guide.md', '# Flora guide'),
    )

    expect(await screen.findByRole('heading', { name: 'Flora guide' })).toBeInTheDocument()
    expect(repository.listDocuments('flora')).toEqual(expect.arrayContaining([
      expect.objectContaining({ productId: 'flora', name: 'flora-guide.md' }),
    ]))
    expect(repository.listDocuments('resume-genius')).toEqual(resumeBefore)
  })

  it('sanitizes raw HTML and script content from Markdown previews', async () => {
    const user = userEvent.setup()
    const { container } = renderDocuments()

    await user.upload(
      screen.getByLabelText('上传 Markdown 文档'),
      markdownFile('unsafe.md', '# Safe\n<script>window.pwned = true</script>\n<img src=x onerror="alert(1)">'),
    )

    expect(await screen.findByRole('heading', { name: 'Safe' })).toBeInTheDocument()
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('[onerror]')).toBeNull()
  })

  it('overwrites a same-name document while retaining identity and creation time', async () => {
    const repository = createStudioRepository(localStorage)
    const existing = storedDocument()
    repository.saveDocument(existing)
    const user = userEvent.setup()
    renderDocuments(repository)

    await user.upload(screen.getByLabelText('上传 Markdown 文档'), markdownFile('GUIDE.md', '# Updated'))
    const dialog = screen.getByRole('dialog', { name: '文档名称冲突' })
    await user.click(within(dialog).getByRole('button', { name: '覆盖现有文档' }))

    expect(repository.listDocuments('flora').filter(({ id }) => id === existing.id)).toEqual([
      expect.objectContaining({
        id: existing.id,
        createdAt: existing.createdAt,
        name: existing.name,
        content: '# Updated',
      }),
    ])
    expect(repository.listDocuments('flora')[0]?.updatedAt).not.toBe(existing.updatedAt)
    expect(await screen.findByRole('heading', { name: 'Updated' })).toBeInTheDocument()
  })

  it('saves same-name uploads as readable, incrementing copies', async () => {
    const repository = createStudioRepository(localStorage)
    repository.saveDocument(storedDocument())
    repository.saveDocument(storedDocument({ id: 'copy-one', name: 'guide-副本.md' }))
    const user = userEvent.setup()
    renderDocuments(repository)

    await user.upload(screen.getByLabelText('上传 Markdown 文档'), markdownFile('guide.md', '# New copy'))
    await user.click(within(screen.getByRole('dialog', { name: '文档名称冲突' }))
      .getByRole('button', { name: '另存为新文档' }))

    expect(repository.listDocuments('flora')).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'guide-副本-2.md', content: '# New copy' }),
    ]))
  })

  it('cancels a same-name upload without changing stored documents', async () => {
    const repository = createStudioRepository(localStorage)
    repository.saveDocument(storedDocument())
    const before = repository.listDocuments('flora')
    const user = userEvent.setup()
    renderDocuments(repository)

    await user.upload(screen.getByLabelText('上传 Markdown 文档'), markdownFile('guide.md', '# Ignored'))
    await user.click(within(screen.getByRole('dialog', { name: '文档名称冲突' }))
      .getByRole('button', { name: '取消' }))

    expect(repository.listDocuments('flora')).toEqual(before)
    expect(screen.getByRole('heading', { name: 'Existing guide' })).toBeInTheDocument()
  })

  it('reports file read failures and retains the existing document', async () => {
    const repository = createStudioRepository(localStorage)
    repository.saveDocument(storedDocument())
    const before = repository.listDocuments('flora')
    const failedFile = markdownFile('broken.md', '', async () => { throw new Error('read failed') })
    const user = userEvent.setup()
    renderDocuments(repository)

    await user.upload(screen.getByLabelText('上传 Markdown 文档'), failedFile)

    expect(await screen.findByRole('alert')).toHaveTextContent('读取文档失败，请检查文件后重试')
    expect(repository.listDocuments('flora')).toEqual(before)
    expect(screen.getByRole('heading', { name: 'Existing guide' })).toBeInTheDocument()
  })

  it('reports repository failures and retains the existing document and preview', async () => {
    const repository = createStudioRepository(localStorage)
    repository.saveDocument(storedDocument())
    const before = repository.listDocuments('flora')
    const failingRepository = {
      ...repository,
      saveDocument: () => { throw new RepositoryError('PERSISTENCE_FAILED', 'quota exceeded') },
    }
    const user = userEvent.setup()
    renderDocuments(failingRepository)

    await user.upload(screen.getByLabelText('上传 Markdown 文档'), markdownFile('new.md', '# Unsaved'))

    expect(await screen.findByRole('alert')).toHaveTextContent('保存失败，请稍后重试')
    expect(repository.listDocuments('flora')).toEqual(before)
    expect(screen.getByRole('heading', { name: 'Existing guide' })).toBeInTheDocument()
  })

  it('keeps the conflict dialog open with one alert when overwrite persistence fails', async () => {
    const repository = createStudioRepository(localStorage)
    repository.saveDocument(storedDocument())
    const before = repository.listDocuments('flora')
    const failingRepository = {
      ...repository,
      saveDocument: () => { throw new RepositoryError('PERSISTENCE_FAILED', 'quota exceeded') },
    }
    const user = userEvent.setup()
    renderDocuments(failingRepository)

    await user.upload(screen.getByLabelText('上传 Markdown 文档'), markdownFile('GUIDE.md', '# Unsaved'))
    const dialog = screen.getByRole('dialog', { name: '文档名称冲突' })
    await user.click(within(dialog).getByRole('button', { name: '覆盖现有文档' }))

    expect(screen.getByRole('dialog', { name: '文档名称冲突' })).toBeInTheDocument()
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(within(dialog).getByRole('alert')).toHaveTextContent('保存失败，请稍后重试')
    expect(repository.listDocuments('flora')).toEqual(before)
  })

  it('refreshes documents from the App snapshot after a storage event', async () => {
    const repository = createStudioRepository(localStorage)
    const externalRepository = createStudioRepository(localStorage)
    renderDocuments(repository)

    externalRepository.saveDocument(storedDocument({
      id: 'external-document',
      name: 'external.md',
      content: '# External document',
      updatedAt: '2026-07-13T09:00:00.000Z',
    }))
    window.dispatchEvent(new StorageEvent('storage', { key: 'vibe-studio:v1' }))

    expect(await screen.findByRole('button', { name: /external.md/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Product-brief.md/ })).toHaveAttribute('aria-current', 'true')
    expect(within(screen.getByRole('article', { name: '文档预览' }))
      .getByRole('heading', { name: 'Flora' })).toBeInTheDocument()
  })

  it('refreshes a stale workspace into the conflict flow when another tab saves the name first', async () => {
    const firstRepository = createStudioRepository(localStorage)
    const staleRepository = createStudioRepository(localStorage)
    const first = renderDocuments(firstRepository)
    const stale = renderDocuments(staleRepository)
    const firstView = within(first.container)
    const staleView = within(stale.container)
    const user = userEvent.setup()

    await user.upload(
      firstView.getByLabelText('上传 Markdown 文档'),
      markdownFile('guide.md', '# First tab'),
    )
    await user.upload(
      staleView.getByLabelText('上传 Markdown 文档'),
      markdownFile('GUIDE.MD', '# Second tab'),
    )

    const dialog = await staleView.findByRole('dialog', { name: '文档名称冲突' })
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      '同名文档已在其他窗口保存，请选择覆盖、另存或取消',
    )
    expect(firstRepository.listDocuments('flora').filter(
      ({ name }) => name.toLocaleLowerCase() === 'guide.md',
    )).toHaveLength(1)

    await user.click(within(dialog).getByRole('button', { name: '覆盖现有文档' }))

    expect(staleView.queryByRole('dialog', { name: '文档名称冲突' })).not.toBeInTheDocument()
    expect(staleRepository.listDocuments('flora').filter(
      ({ name }) => name.toLocaleLowerCase() === 'guide.md',
    )).toEqual([
      expect.objectContaining({ content: '# Second tab' }),
    ])
  })

  it('keeps pending content after a concurrent copy-name collision and recomputes the next copy', async () => {
    const setupRepository = createStudioRepository(localStorage)
    setupRepository.saveDocument(storedDocument())
    const firstRepository = createStudioRepository(localStorage)
    const staleRepository = createStudioRepository(localStorage)
    const first = renderDocuments(firstRepository)
    const stale = renderDocuments(staleRepository)
    const firstView = within(first.container)
    const staleView = within(stale.container)
    const user = userEvent.setup()

    await user.upload(
      firstView.getByLabelText('上传 Markdown 文档'),
      markdownFile('guide.md', '# First copy'),
    )
    await user.click(within(firstView.getByRole('dialog', { name: '文档名称冲突' }))
      .getByRole('button', { name: '另存为新文档' }))
    await user.upload(
      staleView.getByLabelText('上传 Markdown 文档'),
      markdownFile('guide.md', '# Second copy'),
    )
    const staleDialog = staleView.getByRole('dialog', { name: '文档名称冲突' })

    await user.click(within(staleDialog).getByRole('button', { name: '另存为新文档' }))

    expect(await within(staleDialog).findByRole('alert')).toHaveTextContent(
      '同名文档已在其他窗口保存，请选择覆盖、另存或取消',
    )
    expect(staleRepository.listDocuments('flora').filter(
      ({ name }) => name.includes('副本'),
    )).toHaveLength(1)

    await user.click(within(staleDialog).getByRole('button', { name: '另存为新文档' }))

    expect(staleView.queryByRole('dialog', { name: '文档名称冲突' })).not.toBeInTheDocument()
    expect(staleRepository.listDocuments('flora')).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'guide-副本.md', content: '# First copy' }),
      expect.objectContaining({ name: 'guide-副本-2.md', content: '# Second copy' }),
    ]))
  })

  it('normalizes surrounding whitespace before computing a unique copy name', async () => {
    const repository = createStudioRepository(localStorage)
    repository.saveDocument(storedDocument())
    repository.saveDocument(storedDocument({ id: 'existing-copy', name: 'guide-副本.md' }))
    const user = userEvent.setup()
    renderDocuments(repository)

    await user.upload(
      screen.getByLabelText('上传 Markdown 文档'),
      markdownFile(' guide.md', '# Whitespace copy'),
    )
    await user.click(within(screen.getByRole('dialog', { name: '文档名称冲突' }))
      .getByRole('button', { name: '另存为新文档' }))

    expect(screen.queryByRole('dialog', { name: '文档名称冲突' })).not.toBeInTheDocument()
    expect(repository.listDocuments('flora')).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'guide-副本-2.md', content: '# Whitespace copy' }),
    ]))
  })
})
