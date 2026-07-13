import { describe, expect, it } from 'vitest'
import { createSqliteRepository, RepositoryError } from '../../src/server/sqlite'

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
})
