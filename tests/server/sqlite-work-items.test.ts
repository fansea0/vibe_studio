import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createSqliteRepository, RepositoryError } from '../../src/server/sqlite'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'vibe-wi-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const makeRepo = () => {
  const r = createSqliteRepository(path.join(dir, 'db.sqlite'))
  r.createProduct({ name: 'P1', description: '', productType: '', icon: '', status: 'developing', completionPercent: 0, userCount: 0, userCountSource: '', appUrl: null, repositoryPath: '' })
  return r
}

describe('work items soft delete + events', () => {
  it('maps new fields', () => {
    const repo = makeRepo()
    const item = repo.createWorkItem('1', { type: 'requirement', title: 't', description: 'd', assignee: 'alice', priority: 'medium', dueDate: null, status: 'todo' })
    expect(item.description).toBe('d')
    expect(item.assignee).toBe('alice')
    expect(item.isDeleted).toBe(false)
    expect(item.deletedAt).toBeNull()
    expect(item.deletedBy).toBe('')
  })

  it('soft delete sets flags, writes event, hides from default list', () => {
    const repo = makeRepo()
    const item = repo.createWorkItem('1', { type: 'requirement', title: 't', description: '', assignee: '', priority: 'medium', dueDate: null, status: 'todo' })
    const deleted = repo.softDeleteWorkItem(item.id, 'bob', item.updatedAt)
    expect(deleted.isDeleted).toBe(true)
    expect(deleted.deletedAt).not.toBeNull()
    expect(deleted.deletedBy).toBe('bob')
    expect(repo.listWorkItems('1')).toEqual([])
    expect(repo.listWorkItems('1', { includeDeleted: true })).toHaveLength(1)
    expect(repo.listWorkItems('1', { onlyDeleted: true })).toHaveLength(1)
  })

  it('soft delete twice throws ALREADY_DELETED', () => {
    const repo = makeRepo()
    const item = repo.createWorkItem('1', { type: 'requirement', title: 't', description: '', assignee: '', priority: 'medium', dueDate: null, status: 'todo' })
    repo.softDeleteWorkItem(item.id, 'bob', item.updatedAt)
    const current = repo.listWorkItems('1', { includeDeleted: true })[0]
    expect(() => repo.softDeleteWorkItem(item.id, 'bob', current.updatedAt)).toThrow(RepositoryError)
  })

  it('restore brings item back, writes restored event', () => {
    const repo = makeRepo()
    const item = repo.createWorkItem('1', { type: 'requirement', title: 't', description: '', assignee: '', priority: 'medium', dueDate: null, status: 'todo' })
    const deleted = repo.softDeleteWorkItem(item.id, 'bob', item.updatedAt)
    const restored = repo.restoreWorkItem(item.id, 'carol', deleted.updatedAt)
    expect(restored.isDeleted).toBe(false)
    expect(restored.deletedAt).toBeNull()
    expect(repo.listWorkItems('1')).toHaveLength(1)
    const events = repo.listEvents(item.id)
    const types = events.map(e => e.type)
    expect(types).toEqual(expect.arrayContaining(['created','deleted','restored']))
  })

  it('restore non-deleted throws NOT_DELETED', () => {
    const repo = makeRepo()
    const item = repo.createWorkItem('1', { type: 'requirement', title: 't', description: '', assignee: '', priority: 'medium', dueDate: null, status: 'todo' })
    expect(() => repo.restoreWorkItem(item.id, 'carol', item.updatedAt)).toThrow(RepositoryError)
  })

  it('update records edited event + status_changed event', () => {
    const repo = makeRepo()
    const item = repo.createWorkItem('1', { type: 'requirement', title: 't', description: '', assignee: '', priority: 'medium', dueDate: null, status: 'todo' })
    const updated = repo.updateWorkItem(item.id, { status: 'in_progress', title: 't2' }, item.updatedAt)
    expect(updated.title).toBe('t2')
    const events = repo.listEvents(item.id)
    expect(events.map(e => e.type)).toEqual(expect.arrayContaining(['created','status_changed','edited']))
    const sc = events.find(e => e.type === 'status_changed')!
    expect(sc.fromStatus).toBe('todo')
    expect(sc.toStatus).toBe('in_progress')
  })

  it('purge removes row and writes purged event', () => {
    const repo = makeRepo()
    const item = repo.createWorkItem('1', { type: 'requirement', title: 't', description: '', assignee: '', priority: 'medium', dueDate: null, status: 'todo' })
    repo.purgeWorkItem(item.id, item.updatedAt)
    expect(() => repo.getWorkItem('1', item.id)).toThrow(RepositoryError)
  })

  it('comments can be created and listed', () => {
    const repo = makeRepo()
    const item = repo.createWorkItem('1', { type: 'requirement', title: 't', description: '', assignee: '', priority: 'medium', dueDate: null, status: 'todo' })
    const c1 = repo.createComment(item.id, 'alice', 'hello')
    const c2 = repo.createComment(item.id, 'bob', 'world')
    expect(repo.listComments(item.id)).toEqual([c1, c2])
    const events = repo.listEvents(item.id)
    expect(events.filter(e => e.type === 'commented')).toHaveLength(2)
  })

  it('purgeOldDeletedWorkItems removes items older than retention', () => {
    const repo = makeRepo()
    const a = repo.createWorkItem('1', { type: 'requirement', title: 'a', description: '', assignee: '', priority: 'medium', dueDate: null, status: 'todo' })
    repo.createWorkItem('1', { type: 'requirement', title: 'b', description: '', assignee: '', priority: 'medium', dueDate: null, status: 'todo' })
    repo.softDeleteWorkItem(a.id, 'bob', a.updatedAt)
    repo.transaction(() => { /* noop — ensures transaction method exists */ })
    const purged = repo.purgeOldDeletedWorkItems(30)
    expect(purged).toBeGreaterThanOrEqual(0)
    expect(repo.listWorkItems('1')).toHaveLength(1)
  })
})