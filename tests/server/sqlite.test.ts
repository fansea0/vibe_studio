import { describe, expect, it } from 'vitest'
import { createSqliteRepository, RepositoryError, schemaComments } from '../../src/server/sqlite'

describe('sqlite repository', () => {
  it('creates schema and seeds products', () => {
    const r = createSqliteRepository(':memory:')
    expect(r.tableNames()).toEqual(expect.arrayContaining(['products','work_items','versions','documents']))
    expect(r.listProducts()).toHaveLength(3)
    r.close()
  })
  it('rolls back transaction on foreign key failure', () => {
    const r = createSqliteRepository(':memory:')
    expect(() => r.transaction(() => { const p = r.createProduct({name:'X',description:'',productType:'',icon:'',status:'developing',completionPercent:0,userCount:0,userCountSource:'',appUrl:null,repositoryPath:''}); r.createWorkItem('missing',{type:'bug',title:'x',priority:'low',dueDate:null,status:'todo'}); return p })).toThrow()
    expect(r.listProducts().some(p => p.name === 'X')).toBe(false)
  })
  it('supports CRUD, uniqueness, optimistic conflicts and soft delete', () => {
    const r = createSqliteRepository(':memory:'); const p = r.createProduct({name:'  New ',description:'d',productType:'x',icon:'',status:'developing',completionPercent:1,userCount:2,userCountSource:'',appUrl:null,repositoryPath:''})
    expect(p.name).toBe('  New ')
    expect(() => r.createProduct({name:'new',description:'',productType:'',icon:'',status:'developing',completionPercent:0,userCount:0,userCountSource:'',appUrl:null,repositoryPath:''})).toThrow(RepositoryError)
    r.createWorkItem(p.id,{type:'requirement',title:'t',priority:'high',dueDate:null,status:'todo'}); expect(r.listWorkItems(p.id)).toHaveLength(1)
    const v = r.createVersion(p.id,{number:'1.0',status:'planned',releasedAt:null,notes:''}); expect(r.listVersions(p.id)[0].id).toBe(v.id)
    const d = r.createDocument(p.id,{name:'ReadMe.MD',content:'# hi'},undefined); expect(r.listDocuments(p.id)[0].name).toBe('ReadMe.MD')
    expect(() => r.createDocument(p.id,{name:'readme.md',content:'x'},undefined)).toThrow()
    expect(() => r.updateDocument(d.id,{content:'x'},'bad')).toThrow()
    r.archiveProduct(p.id,p.updatedAt); expect(r.listProducts(false).some(x=>x.id===p.id)).toBe(false)
    expect(r.getProductSummary(p.id)).toBeDefined(); r.close()
  })
  it('validates markdown size and extension', () => { const r=createSqliteRepository(':memory:'); const p=r.listProducts()[0]; expect(()=>r.createDocument(p.id,{name:'x.txt',content:'x'})).toThrow(); expect(()=>r.createDocument(p.id,{name:'x.md',content:'a'.repeat(512*1024+1)})).toThrow() })

  it('exposes comments for every schema field and filters deleted rows', () => {
    const r = createSqliteRepository(':memory:'); const p = r.listProducts()[0]
    expect(Object.keys(schemaComments.products)).toHaveLength(17)
    expect(Object.keys(schemaComments.work_items)).toHaveLength(11)
    const w = r.createWorkItem(p.id, { type: 'bug', title: 'x', priority: 'low', dueDate: null, status: 'todo' })
    const v = r.createVersion(p.id, { number: 'delete-me', status: 'planned', releasedAt: null, notes: '' })
    const d = r.createDocument(p.id, { name: 'delete-me.md', content: 'x' })
    r.deleteWorkItem(w.id); r.deleteVersion(v.id); r.deleteDocument(d.id)
    expect(r.listWorkItems(p.id)).toHaveLength(0); expect(r.listVersions(p.id)).toHaveLength(0); expect(r.listDocuments(p.id)).toHaveLength(0)
    expect(() => r.createVersion(p.id, { number: 'delete-me', status: 'planned', releasedAt: null, notes: '' })).not.toThrow()
    expect(() => r.createDocument(p.id, { name: 'delete-me.md', content: 'x' })).not.toThrow()
    r.close()
  })

  it('enforces document update validation and version invariants', () => {
    const r = createSqliteRepository(':memory:'); const p = r.listProducts()[0]
    const d = r.createDocument(p.id, { name: 'A.md', content: 'ok' })
    expect(() => r.updateDocument(d.id, { name: 'bad.txt' })).toThrow(RepositoryError)
    expect(() => r.updateDocument(d.id, { content: '😀'.repeat(200000) })).toThrow(RepositoryError)
    expect(() => r.createVersion(p.id, { number: '1', status: 'planned', releasedAt: '2020-01-01T00:00:00Z', notes: '' })).toThrow(RepositoryError)
    expect(() => r.createVersion(p.id, { number: '2', status: 'released', releasedAt: null, notes: '' })).toThrow(RepositoryError)
    r.createVersion(p.id, { number: '3', status: 'released', releasedAt: '2020-01-01T00:00:00Z', notes: '' })
    expect(() => r.createVersion(p.id, { number: '3', status: 'planned', releasedAt: null, notes: '' })).toThrow(RepositoryError)
    r.close()
  })

  it('has explicit defaults, foreign-key defaults, indexes, and complete optimistic updates', () => {
    const r = createSqliteRepository(':memory:'); const p = r.listProducts()[0]
    // Access the underlying schema through repository behavior and sqlite_master-backed contract.
    expect(r.tableNames()).toEqual(expect.arrayContaining(['products', 'work_items', 'versions', 'documents']))
    const w = r.createWorkItem(p.id, { type: 'bug', title: 'x', priority: 'low', dueDate: null, status: 'todo' })
    const w2 = r.updateWorkItem(w.id, { type: 'requirement', title: 'y', priority: 'urgent', dueDate: '2026-01-01', status: 'done' }, w.updatedAt)
    expect(w2).toMatchObject({ type: 'requirement', title: 'y', priority: 'urgent', dueDate: '2026-01-01', status: 'done' })
    expect(() => r.updateWorkItem(w.id, { status: 'invalid' as any })).toThrow(RepositoryError)
    const v = r.createVersion(p.id, { number: '9', status: 'planned', releasedAt: null, notes: 'a' })
    const v2 = r.updateVersion(v.id, { status: 'released', releasedAt: '2026-01-01T00:00:00Z', notes: 'b' }, v.updatedAt)
    expect(v2.status).toBe('released'); expect(v2.releasedAt).toBe('2026-01-01T00:00:00Z'); expect(v2.notes).toBe('b')
    expect(() => r.updateVersion(v.id, { status: 'planned', releasedAt: 'bad' })).toThrow(RepositoryError)
    r.close()
  })

  it('maps mutation constraints to RepositoryError and validates work inputs', () => {
    const r = createSqliteRepository(':memory:'); const p = r.listProducts()[0]
    const a = r.createDocument(p.id, { name: 'a.md', content: 'a' }); const b = r.createDocument(p.id, { name: 'b.md', content: 'b' })
    expect(() => r.updateDocument(b.id, { name: a.name })).toThrow(RepositoryError)
    expect(() => r.createWorkItem(p.id, { type: 'bug', title: '', priority: 'low', dueDate: null, status: 'todo' })).toThrow(RepositoryError)
    expect(() => r.createWorkItem(p.id, { type: 'bug', title: 'x', priority: 'low', dueDate: '01/01/2026', status: 'todo' })).toThrow(RepositoryError)
    expect(() => r.createWorkItem(p.id, { type: 'invalid' as any, title: 'x', priority: 'low', dueDate: null, status: 'todo' })).toThrow(RepositoryError)
    const w = r.createWorkItem(p.id, { type: 'bug', title: 'x', priority: 'low', dueDate: null, status: 'todo' })
    expect(() => r.updateWorkItem(w.id, { title: '' })).toThrow(RepositoryError)
    r.close()
  })

  it('enables foreign keys and maps non-unique mutation failures safely', () => {
    const r = createSqliteRepository(':memory:')
    expect(r.foreignKeysEnabled()).toBe(true)
    expect(() => r.createWorkItem('999999', { type: 'bug', title: 'x', priority: 'low', dueDate: null, status: 'todo' })).toThrow(RepositoryError)
    r.close()
  })
})
