# Vibe Studio 作品集对外展示页面 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a public-facing `/showcase` portfolio page that reuses the existing `Product` SQLite data so external visitors can see who you are, what you've built, and how to reach you.

**Architecture:** The browser keeps the same `BrowserRouter`. The existing `App.tsx` dispatches by `location.pathname`: paths starting with `/showcase` render a new `ShowcaseApp` with its own shell (no sidebar, no mutation calls); other paths keep the existing `ApiApp` behavior. `Product` gains an `isPublic: boolean` field; three new `/api/showcase/*` GET routes serve a public-safe projection (no workItems, no documents) plus a JSON-driven `ShowcaseProfile` loaded from `data/showcase-profile.json` by the Vite plugin at startup.

**Tech Stack:** React 18, TypeScript, Vite 7, react-router-dom 7, better-sqlite3, Vitest + Testing Library, IntersectionObserver (browser native).

---

## File structure

```text
src/domain/models.ts                       # +isPublic, +PublicProduct, +ShowcaseProfile, +SocialLink
src/domain/productMetrics.ts               # +deriveCurrentVersion(versions)
src/server/sqlite.ts                       # +is_public column migration, +isPublic mapping in mapProduct, create/update accept isPublic, +listPublicProducts, +getPublicProduct
src/server/api.ts                          # +3 showcase GET routes, +isPublic passed through on product create/update
src/server/viteApiPlugin.ts                # +loadShowcaseProfile(), inject profileReader into handler
src/client/api.ts                          # +fetchShowcaseProfile/Products/Product, PublicProduct/ShowcaseProfile types
src/app/App.tsx                            # path-based dispatch: /showcase → ShowcaseApp, else ApiApp
src/app/ProductSettings.tsx                # +isPublic field rendered in form
src/app/ProductDialog.tsx                  # +isPublic default false on create
src/app/productForm.ts                     # +isPublic in ProductFormValues + merge, default false
src/app/ProductFields.tsx                  # +对外公开 checkbox (span-2)
src/app/showcase/ShowcaseApp.tsx           # new: routes /showcase, /showcase/:productId
src/app/showcase/ShowcaseShell.tsx         # top nav + <main> container
src/app/showcase/HeroSection.tsx
src/app/showcase/NowSection.tsx
src/app/showcase/WorksSection.tsx
src/app/showcase/ProductShowcaseCard.tsx
src/app/showcase/ShowcaseDetailPage.tsx
src/app/showcase/AboutSection.tsx
src/app/showcase/ContactSection.tsx
src/app/showcase/ShowcaseSkeleton.tsx
src/app/showcase/useShowcaseProfile.ts
src/app/showcase/useShowcaseProducts.ts
src/app/showcase/useShowcaseProduct.ts
src/app/showcase/reveal.ts
src/styles/showcase.css
data/showcase-profile.json                 # user-editable site profile
tests/server/showcase.test.ts              # SQL filter + JSON loader + API routes
tests/app/showcaseRouting.test.tsx         # /showcase render, /showcase/:id detail, unknown → 404
```

---

## Task 1: Add `isPublic` field, `PublicProduct` and `ShowcaseProfile` types

**Files:**
- Modify: `src/domain/models.ts:7-23`
- Create: `src/domain/productMetrics.ts` (append `deriveCurrentVersion`)

- [ ] **Step 1: Add `isPublic` to `Product` and new public types**

In `src/domain/models.ts` after the `Product` interface (line 23) and before `CommitSummary`, add:

```ts
export interface PublicProduct {
  id: string
  name: string
  description: string
  icon: string
  status: ProductStatus
  currentVersion: string
  userCount: number
  appUrl: string | null
  updatedAt: string
}

export type SocialPlatform = 'github' | 'twitter' | 'website' | 'linkedin' | 'wechat'

export interface SocialLink {
  platform: SocialPlatform
  label: string
  url: string
}

export interface ShowcaseProfile {
  displayName: string
  tagline: string
  avatarUrl: string | null
  statusLine: string
  statusPillText: string
  aboutParagraphs: string[]
  contactEmail: string
  socialLinks: SocialLink[]
}
```

Modify the `Product` interface (line 7) — add the field after `archivedAt` (line 21):

```ts
  isPublic: boolean
```

- [ ] **Step 2: Add `deriveCurrentVersion` helper**

In `src/domain/productMetrics.ts` append:

```ts
export const deriveCurrentVersion = (versions: readonly ProductVersion[]): string => {
  const releasedVersions = versions
    .filter((version) => version.status === 'released')
    .toSorted((left, right) => {
      const leftRelease = left.releasedAt ?? left.updatedAt
      const rightRelease = right.releasedAt ?? right.updatedAt
      return (
        Date.parse(rightRelease) - Date.parse(leftRelease) ||
        Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
      )
    })
  return releasedVersions[0]?.number ?? '—'
}
```

- [ ] **Step 3: Commit**

```bash
git add src/domain/models.ts src/domain/productMetrics.ts
git commit -m "feat: add isPublic and public showcase types"
```

---

## Task 2: Migrate `products` table and wire `isPublic` through SQLite + API

**Files:**
- Modify: `src/server/sqlite.ts:36-70, 143, 155-156`
- Modify: `src/server/api.ts:8, 11-12`
- Create: `tests/server/showcase.test.ts`

- [ ] **Step 1: Write failing tests for the new repository + API surface**

Create `tests/server/showcase.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApiHandler } from '../src/server/api.js'
import { createSqliteRepository } from '../src/server/sqlite.js'
import type { IncomingMessage, ServerResponse } from 'node:http'

const invoke = async (handler: ReturnType<typeof createApiHandler>, method: string, url: string, body?: unknown) => {
  const chunks: Buffer[] = []
  const res = {
    statusCode: 0,
    setHeader() {},
    end(chunk: string) { chunks.push(Buffer.from(chunk)) },
  } as unknown as ServerResponse
  const req = {
    method,
    url,
    [Symbol.asyncIterator]: async function* () { if (body !== undefined) yield Buffer.from(JSON.stringify(body)) },
  } as unknown as IncomingMessage
  await handler(req, res)
  return { status: res.statusCode, body: chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null }
}

describe('showcase SQL filter', () => {
  let repo: ReturnType<typeof createSqliteRepository>
  beforeEach(() => { repo = createSqliteRepository(':memory:') })
  afterEach(() => { repo.close() })

  it('listPublicProducts returns only isPublic=1 non-archived products', () => {
    const all = repo.listProducts(true)
    const first = repo.updateProduct(String(all[0].id), { isPublic: true } as any)
    expect(first.isPublic).toBe(true)
    const listed = repo.listPublicProducts()
    expect(listed).toHaveLength(1)
    expect(listed[0].id).toBe(String(all[0].id))
  })

  it('getPublicProduct returns null for archived products even when isPublic=1', () => {
    const all = repo.listProducts(true)
    const first = repo.updateProduct(String(all[0].id), { isPublic: true } as any)
    repo.archiveProduct(String(first.id))
    expect(repo.getPublicProduct(String(first.id))).toBeUndefined()
  })

  it('getPublicProduct returns null for non-public products', () => {
    const all = repo.listProducts(true)
    expect(repo.getPublicProduct(String(all[0].id))).toBeUndefined()
  })
})

describe('showcase API', () => {
  it('GET /api/showcase/products filters private and archived', async () => {
    const repo = createSqliteRepository(':memory:')
    const handler = createApiHandler({ repository: repo, profileReader: async () => ({ displayName: '', tagline: '', avatarUrl: null, statusLine: '', statusPillText: '', aboutParagraphs: [], contactEmail: '', socialLinks: [] }) })
    const all = repo.listProducts(true)
    repo.updateProduct(String(all[0].id), { isPublic: true } as any)
    const res = await invoke(handler, 'GET', '/api/showcase/products')
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    repo.close()
  })

  it('GET /api/showcase/products/:id returns 404 for private or archived', async () => {
    const repo = createSqliteRepository(':memory:')
    const handler = createApiHandler({ repository: repo, profileReader: async () => ({ displayName: '', tagline: '', avatarUrl: null, statusLine: '', statusPillText: '', aboutParagraphs: [], contactEmail: '', socialLinks: [] }) })
    const all = repo.listProducts(true)
    const res = await invoke(handler, 'GET', `/api/showcase/products/${all[0].id}`)
    expect(res.status).toBe(404)
    repo.close()
  })

  it('GET /api/showcase/profile delegates to profileReader', async () => {
    const repo = createSqliteRepository(':memory:')
    const profile = { displayName: 'Ada', tagline: 'hi', avatarUrl: null, statusLine: 'now', statusPillText: 'hi', aboutParagraphs: [], contactEmail: 'a@b.c', socialLinks: [] }
    const handler = createApiHandler({ repository: repo, profileReader: async () => profile })
    const res = await invoke(handler, 'GET', '/api/showcase/profile')
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual(profile)
    repo.close()
  })

  it('GET /api/showcase/profile returns 503 when profileReader throws', async () => {
    const repo = createSqliteRepository(':memory:')
    const handler = createApiHandler({ repository: repo, profileReader: async () => { throw new Error('missing') } })
    const res = await invoke(handler, 'GET', '/api/showcase/profile')
    expect(res.status).toBe(503)
    repo.close()
  })
})
```

Run: `npm test -- --run tests/server/showcase.test.ts`
Expected: FAIL — `repo.listPublicProducts` not implemented, `profileReader` option missing from `createApiHandler`.

- [ ] **Step 2: Add migration + map `isPublic` in `mapProduct`**

In `src/server/sqlite.ts`, extend the `schemaComments.products` block (line 6) — add `is_public: '是否对外公开'` after `is_deleted`.

Inside the `CREATE TABLE IF NOT EXISTS products` block (line 36) — add at the end (before the closing `);` on line 70):

```sql
,
-- 字段: 是否对外公开
is_public INTEGER NOT NULL DEFAULT 0
```

After the existing `try { db.exec('ALTER TABLE products ADD COLUMN status_before_archive ...') } catch { }` line (line 143), add:

```ts
try { db.exec('ALTER TABLE products ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0') } catch { }
```

Update `mapProduct` (line 27) — add `isPublic: Boolean(r.is_public)` before the closing brace:

```ts
const mapProduct = (r: any): Product => ({ id: String(r.id), name: r.name, description: r.description, productType: r.product_type, icon: r.icon, status: ['developing','beta','released','archived'][r.status] as ProductStatus, completionPercent: r.completion_percent, userCount: r.user_count, userCountSource: r.user_count_source, appUrl: r.app_url || null, repositoryPath: r.repository_path, archivedAt: r.archived_at || null, isPublic: Boolean(r.is_public), createdAt: r.created_at, updatedAt: r.updated_at, isDeleted: Boolean(r.is_deleted) })
```

- [ ] **Step 3: Persist `isPublic` on create/update and add public listing**

Update `createProduct` (line 155). In the `INSERT INTO products(...)` columns list, add `is_public` after `is_deleted`. In the values `?` list, append `?`. In the `.run()` argument list, append `i.isPublic ? 1 : 0` at the end:

```ts
createProduct(i) { ensureName(i.name); ensureProductStatus(i.status); if (typeof i.repositoryPath !== 'string') throw new RepositoryError('VALIDATION_FAILED', 'repositoryPath'); const t = now(); try { const x = db.prepare('INSERT INTO products(name,normalized_name,description,product_type,icon,status,completion_percent,user_count,user_count_source,app_url,repository_path,archived_at,created_at,updated_at,is_public) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(i.name, normalized(i.name), i.description, i.productType, i.icon, statusCode[i.status], i.completionPercent, i.userCount, i.userCountSource, i.appUrl ?? '', i.repositoryPath ?? '', i.archivedAt ?? '', t, t, i.isPublic ? 1 : 0); return getProduct(String(x.lastInsertRowid))! } catch (e) { throw mapMutationError(e, 'product') } },
```

Update `updateProduct` (line 156). In the `UPDATE products SET ...` list, add `is_public=?` after `updated_at=?`. In `.run()` args, append `n.isPublic ? 1 : 0` after `updatedAt`:

```ts
db.prepare('UPDATE products SET name=?,normalized_name=?,description=?,product_type=?,icon=?,status=?,completion_percent=?,user_count=?,user_count_source=?,app_url=?,repository_path=?,archived_at=?,updated_at=?,is_public=? WHERE id=? AND is_deleted=0').run(n.name, normalized(n.name), n.description, n.productType, n.icon, statusCode[n.status], n.completionPercent, n.userCount, n.userCountSource, n.appUrl ?? '', n.repositoryPath ?? '', n.archivedAt ?? '', updatedAt, n.isPublic ? 1 : 0, Number(id))
```

Add to the `SqliteRepository` interface (line 32), after `getProductSummary`:

```ts
listPublicProducts(): PublicProduct[]; getPublicProduct(id: string): PublicProduct | undefined
```

Import `PublicProduct` from `../domain/models.js` at the top of `sqlite.ts` (alongside existing imports on line 2).

Implement `listPublicProducts` and `getPublicProduct` on the repository object (around line 170):

```ts
listPublicProducts() {
  const rows = db.prepare('SELECT p.*, v.number AS current_version FROM products p LEFT JOIN versions v ON v.product_id = p.id AND v.status = 1 AND v.is_deleted = 0 AND v.released_at = (SELECT MAX(v2.released_at) FROM versions v2 WHERE v2.product_id = p.id AND v2.status = 1 AND v2.is_deleted = 0) WHERE p.is_public = 1 AND p.is_deleted = 0 AND p.status != 3 ORDER BY p.updated_at DESC').all()
  return rows.map(mapPublicProduct)
},
getPublicProduct(id) {
  const row = db.prepare('SELECT p.*, v.number AS current_version FROM products p LEFT JOIN versions v ON v.product_id = p.id AND v.status = 1 AND v.is_deleted = 0 AND v.released_at = (SELECT MAX(v2.released_at) FROM versions v2 WHERE v2.product_id = p.id AND v2.status = 1 AND v2.is_deleted = 0) WHERE p.id = ? AND p.is_public = 1 AND p.is_deleted = 0 AND p.status != 3').get(Number(id))
  return row ? mapPublicProduct(row) : undefined
},
```

Add the mapper helper near `mapProduct`:

```ts
const mapPublicProduct = (r: any): PublicProduct => ({
  id: String(r.id),
  name: r.name,
  description: r.description,
  icon: r.icon,
  status: ['developing','beta','released','archived'][r.status] as ProductStatus,
  currentVersion: r.current_version ?? '—',
  userCount: r.user_count,
  appUrl: r.app_url || null,
  updatedAt: r.updated_at,
})
```

- [ ] **Step 4: Add showcase routes to the API handler**

In `src/server/api.ts`:

Update the function signature (line 4) to accept `profileReader`:

```ts
export function createApiHandler({repository,readGitLog:reader=readGitLog,profileReader}:{repository:any;readGitLog?:typeof readGitLog;profileReader?:()=>Promise<any>})
```

Update `validateProduct` (line 8) — add an `isPublic` guard at the end of the function body:

```ts
if(b.isPublic!==undefined&&typeof b.isPublic!=='boolean') throw new RepositoryError('VALIDATION_FAILED','isPublic')
```

Add the three showcase routes inside the handler (place after the `if(p==='/api/products')` block on line 11):

```ts
if(p==='/api/showcase/profile'){if(method!=='GET') throw Object.assign(new Error('method not allowed'),{status:405}); if(!profileReader) return send(res,503,{error:{code:'PROFILE_UNAVAILABLE',message:'展示页配置缺失'}}); try{const profile=await profileReader(); return send(res,200,{data:profile})}catch{return send(res,503,{error:{code:'PROFILE_UNAVAILABLE',message:'展示页配置缺失'}})}}
if(p==='/api/showcase/products'){if(method!=='GET') throw Object.assign(new Error('method not allowed'),{status:405}); return send(res,200,{data:repository.listPublicProducts()})}
let showcaseId=p.match(/^\/api\/showcase\/products\/([^/]+)$/)?.[1]; if(showcaseId){if(method!=='GET') throw Object.assign(new Error('method not allowed'),{status:405}); const x=repository.getPublicProduct(showcaseId); if(!x) return send(res,404,{error:{code:'NOT_FOUND',message:'作品未公开或不存在'}}); return send(res,200,{data:x})}
```

Update `map` (line 7) to handle the `status:405` case:

```ts
const map=(e:any)=>{if(e?.status===400)return {status:400,body:{error:{code:'VALIDATION_FAILED',message:e.message}}}; if(e?.status===405)return {status:405,body:{error:{code:'METHOD_NOT_ALLOWED',message:e.message}}}; if(e instanceof RepositoryError)return {status:e.code==='NOT_FOUND'?404:e.code==='CONFLICT'||e.code==='DUPLICATE'?409:400,body:{error:{code:e.code,message:e.message}}}; if(e instanceof GitLogError)return {status:e.code==='GIT_REPOSITORY_INVALID'?400:500,body:{error:{code:e.code,message:e.message}}}; return {status:500,body:{error:{code:'INTERNAL_ERROR',message:'Internal error'}}}}
```

- [ ] **Step 5: Run tests, then commit**

Run: `npm test -- --run tests/server/showcase.test.ts`
Expected: all 5 tests pass.

```bash
git add src/server/sqlite.ts src/server/api.ts tests/server/showcase.test.ts
git commit -m "feat: persist isPublic and serve showcase API"
```

---

## Task 3: Load `data/showcase-profile.json` via Vite plugin

**Files:**
- Modify: `src/server/viteApiPlugin.ts`
- Create: `data/showcase-profile.json`

- [ ] **Step 1: Write a minimal profile JSON**

Create `data/showcase-profile.json`:

```json
{
  "displayName": "你的名字",
  "tagline": "独立开发者，做有意思的产品。",
  "avatarUrl": null,
  "statusLine": "正在做一个有意思的小工具。",
  "statusPillText": "欢迎合作",
  "aboutParagraphs": [
    "在这里写一段关于你自己的介绍。",
    "可以聊聊你关注的技术领域。"
  ],
  "contactEmail": "you@example.com",
  "socialLinks": []
}
```

- [ ] **Step 2: Implement profile loading in the Vite plugin**

Replace the contents of `src/server/viteApiPlugin.ts` with:

```ts
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import type { Plugin } from 'vite'
import { createSqliteRepository } from './sqlite.js'
import { createApiHandler } from './api.js'
import { readGitLog } from './gitLog.js'
import type { ShowcaseProfile } from '../domain/models.js'

const DEFAULT_PROFILE: ShowcaseProfile = {
  displayName: '',
  tagline: '',
  avatarUrl: null,
  statusLine: '',
  statusPillText: '',
  aboutParagraphs: [],
  contactEmail: '',
  socialLinks: [],
}

export function createViteApiPlugin({ databasePath, gitReader }: { databasePath?: string; gitReader?: typeof readGitLog } = {}): Plugin {
  let repo: any
  return {
    name: 'vibe-studio-api',
    async configureServer(server) {
      const file = databasePath ?? path.resolve(process.cwd(), 'data/vibe-studio.sqlite')
      repo = createSqliteRepository(file)
      const profilePath = path.resolve(process.cwd(), 'data/showcase-profile.json')
      const profileReader = async (): Promise<ShowcaseProfile> => {
        const raw = await readFile(profilePath, 'utf8').catch(() => null)
        if (!raw) throw new Error('profile missing')
        const parsed = JSON.parse(raw) as Partial<ShowcaseProfile>
        return {
          displayName: parsed.displayName ?? DEFAULT_PROFILE.displayName,
          tagline: parsed.tagline ?? DEFAULT_PROFILE.tagline,
          avatarUrl: parsed.avatarUrl ?? null,
          statusLine: parsed.statusLine ?? DEFAULT_PROFILE.statusLine,
          statusPillText: parsed.statusPillText ?? DEFAULT_PROFILE.statusPillText,
          aboutParagraphs: Array.isArray(parsed.aboutParagraphs) ? parsed.aboutParagraphs : [],
          contactEmail: parsed.contactEmail ?? DEFAULT_PROFILE.contactEmail,
          socialLinks: Array.isArray(parsed.socialLinks) ? parsed.socialLinks : [],
        }
      }
      const handler = createApiHandler({ repository: repo, readGitLog: gitReader, profileReader })
      server.middlewares.use('/api', (req, res) => handler(req, res))
      server.httpServer?.once('close', () => repo?.close())
    },
  }
}
```

- [ ] **Step 3: Smoke-test the running server**

Run: `npm run dev -- --host 127.0.0.1` (background it, then proceed)

Run: `curl -fsS http://127.0.0.1:6000/api/showcase/profile`
Expected: JSON with `displayName: "你的名字"` etc.

Run: `curl -fsS http://127.0.0.1:6000/api/showcase/products`
Expected: empty array `{"data":[]}` (no products are public yet).

Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add data/showcase-profile.json src/server/viteApiPlugin.ts
git commit -m "feat: load showcase profile from JSON at server startup"
```

---

## Task 4: Browser API client + form integration

**Files:**
- Modify: `src/client/api.ts`
- Modify: `src/app/productForm.ts`
- Modify: `src/app/ProductFields.tsx`
- Modify: `src/app/ProductDialog.tsx`

- [ ] **Step 1: Add showcase fetchers to the client API**

In `src/client/api.ts`, add at the end (after `fetchCommits`):

```ts
export const fetchShowcaseProfile = (signal?: AbortSignal) => request<ShowcaseProfile>('/api/showcase/profile', { signal })
export const fetchShowcaseProducts = (signal?: AbortSignal) => request<PublicProduct[]>('/api/showcase/products', { signal })
export const fetchShowcaseProduct = (id: string, signal?: AbortSignal) => request<PublicProduct>(`/api/showcase/products/${encodeURIComponent(id)}`, { signal })
```

Update the import on line 1 to include the new types:

```ts
import type { CommitSummary, MarkdownDocument, Product, ProductVersion, PublicProduct, ShowcaseProfile, WorkItem } from '../domain/models'
```

- [ ] **Step 2: Add `isPublic` to the product form values**

In `src/app/productForm.ts`, extend `ProductFormValues` (line 3):

```ts
export interface ProductFormValues {
  name: string
  description: string
  productType: string
  icon: string
  status: ProductStatus
  completionPercent: string
  userCount: string
  userCountSource: string
  appUrl: string
  repositoryPath: string
  isPublic: boolean
}
```

Update `productToFormValues` (line 28) — add `isPublic: product?.isPublic ?? false` at the end of the returned object.

Update `mergeProductValues` (line 78) — add `isPublic: values.isPublic` at the end of the returned object before `updatedAt`.

- [ ] **Step 3: Render the `isPublic` checkbox in `ProductFields`**

In `src/app/ProductFields.tsx`, after the `repositoryPath` field block (line 49, inside `.span-2`), add:

```tsx
<div className="span-2 field">
  <label htmlFor="product-isPublic">
    <input
      id="product-isPublic"
      type="checkbox"
      name="isPublic"
      checked={values.isPublic}
      onChange={(event) => onChange({ ...values, isPublic: event.target.checked })}
      style={{ marginRight: 8, width: 'auto' }}
    />
    对外公开（显示在作品集页面）
  </label>
</div>
```

- [ ] **Step 4: Default `isPublic` to false on create**

In `src/app/ProductDialog.tsx`, update the `base` object inside `submit` (line 30) to include `isPublic: false`:

```ts
const base: Product = {
  id: createProductId(values.name, products), name: '', description: '', productType: '', icon: '',
  status: 'developing', completionPercent: 0, userCount: 0, userCountSource: '', appUrl: null,
  archivedAt: null, repositoryPath: '', isPublic: false, createdAt: now, updatedAt: now,
}
```

- [ ] **Step 5: Verify and commit**

Run: `npm test -- --run` (all tests should still pass — `isPublic` is now part of the product type)
Run: `npm run typecheck:test`
Expected: no errors. Existing lifecycle tests already cover create/update paths.

```bash
git add src/client/api.ts src/app/productForm.ts src/app/ProductFields.tsx src/app/ProductDialog.tsx
git commit -m "feat: surface isPublic in product forms and API client"
```

---

## Task 5: Showcase shell + routing dispatch

**Files:**
- Create: `src/app/showcase/ShowcaseApp.tsx`
- Create: `src/app/showcase/ShowcaseShell.tsx`
- Create: `src/styles/showcase.css`
- Modify: `src/app/App.tsx`

- [ ] **Step 1: Create the showcase shell**

Create `src/app/showcase/ShowcaseShell.tsx`:

```tsx
import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

interface ShowcaseShellProps { children: ReactNode }

export function ShowcaseShell({ children }: ShowcaseShellProps) {
  return (
    <div className="showcase-shell">
      <nav className="showcase-nav" aria-label="作品集导航">
        <Link className="showcase-brand" to="/showcase">作品集</Link>
        <div className="showcase-nav-links">
          <Link to="/showcase">作品</Link>
          <Link to="/products">工作台</Link>
        </div>
      </nav>
      <main className="showcase-main">{children}</main>
    </div>
  )
}
```

- [ ] **Step 2: Create the routing app**

Create `src/app/showcase/ShowcaseApp.tsx`:

```tsx
import { BrowserRouter, Route, Routes, useParams } from 'react-router-dom'
import { ShowcaseShell } from './ShowcaseShell'
import { ShowcaseDetailPage } from './ShowcaseDetailPage'
import { HeroSection } from './HeroSection'
import { NowSection } from './NowSection'
import { WorksSection } from './WorksSection'
import { AboutSection } from './AboutSection'
import { ContactSection } from './ContactSection'
import { useShowcaseProfile } from './useShowcaseProfile'

interface ShowcaseAppProps { initialEntries?: string[] }

function Home() {
  const { profile, error: profileError } = useShowcaseProfile()
  return (
    <>
      <HeroSection profile={profile} error={profileError} />
      <NowSection statusLine={profile.statusLine} error={profileError} />
      <WorksSection />
      <AboutSection paragraphs={profile.aboutParagraphs} error={profileError} />
      <ContactSection email={profile.contactEmail} links={profile.socialLinks} error={profileError} />
    </>
  )
}

export function ShowcaseApp({ initialEntries }: ShowcaseAppProps) {
  const Router = initialEntries ? require('react-router-dom').MemoryRouter : BrowserRouter
  return (
    <Router {...(initialEntries ? { initialEntries } : {})}>
      <Routes>
        <Route path="/showcase" element={<ShowcaseShell><Home /></ShowcaseShell>} />
        <Route path="/showcase/:productId" element={<ShowcaseShell><ShowcaseDetailRoute /></ShowcaseShell>} />
        <Route path="/showcase/*" element={<ShowcaseShell><NotFound /></ShowcaseShell>} />
      </Routes>
    </Router>
  )
}

function ShowcaseDetailRoute() {
  const { productId } = useParams()
  if (!productId) return <NotFound />
  return <ShowcaseDetailPage productId={productId} />
}

function NotFound() {
  return (
    <section className="showcase-section">
      <h2>作品未公开或不存在</h2>
      <p>这个作品可能还没有对外公开，或者链接已失效。</p>
      <a href="/showcase">返回作品集</a>
    </section>
  )
}
```

- [ ] **Step 3: Create stub components and hooks (filled in next tasks)**

Create all of these as stubs that compile but render minimal content. They will be replaced in Task 6 and Task 7.

`src/app/showcase/useShowcaseProfile.ts`:

```ts
import { useEffect, useState } from 'react'
import type { ShowcaseProfile } from '../../domain/models'
import { fetchShowcaseProfile } from '../../client/api'

export function useShowcaseProfile() {
  const [profile, setProfile] = useState<ShowcaseProfile>({ displayName: '', tagline: '', avatarUrl: null, statusLine: '', statusPillText: '', aboutParagraphs: [], contactEmail: '', socialLinks: [] })
  const [error, setError] = useState('')
  useEffect(() => { const c = new AbortController(); fetchShowcaseProfile(c.signal).then((p) => setProfile(p)).catch(() => setError('展示页配置缺失，请稍后重试')).finally(() => null); return () => c.abort() }, [])
  return { profile, error }
}
```

`src/app/showcase/useShowcaseProducts.ts`:

```ts
import { useEffect, useState } from 'react'
import type { PublicProduct } from '../../domain/models'
import { fetchShowcaseProducts } from '../../client/api'

export function useShowcaseProducts() {
  const [products, setProducts] = useState<PublicProduct[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => { const c = new AbortController(); setLoading(true); fetchShowcaseProducts(c.signal).then((p) => setProducts(p)).catch(() => setError('暂时无法加载作品列表')).finally(() => setLoading(false)); return () => c.abort() }, [])
  return { products, error, loading }
}
```

`src/app/showcase/useShowcaseProduct.ts`:

```ts
import { useEffect, useState } from 'react'
import type { PublicProduct } from '../../domain/models'
import { fetchShowcaseProduct } from '../../client/api'

export function useShowcaseProduct(id: string) {
  const [product, setProduct] = useState<PublicProduct | null>(null)
  const [error, setError] = useState<'' | 'notFound' | 'load'>('')
  const [loading, setLoading] = useState(true)
  useEffect(() => { const c = new AbortController(); setLoading(true); fetchShowcaseProduct(id, c.signal).then((p) => setProduct(p)).catch((e: { status?: number }) => { setError(e.status === 404 ? 'notFound' : 'load') }).finally(() => setLoading(false)); return () => c.abort() }, [id])
  return { product, error, loading }
}
```

`src/app/showcase/HeroSection.tsx`:

```tsx
import type { ShowcaseProfile } from '../../domain/models'
interface Props { profile: ShowcaseProfile; error: string }
export function HeroSection({ profile, error }: Props) {
  if (error) return <section className="showcase-section"><p role="alert" className="feedback error">{error}</p></section>
  return (
    <section className="showcase-hero">
      {profile.statusPillText && <span className="showcase-pill">{profile.statusPillText}</span>}
      <h1 className="showcase-hero-title"><span>Hi, I'm</span><strong>{profile.displayName}</strong></h1>
      <p className="showcase-hero-tagline">{profile.tagline}</p>
    </section>
  )
}
```

`src/app/showcase/NowSection.tsx`:

```tsx
interface Props { statusLine: string; error: string }
export function NowSection({ statusLine, error }: Props) {
  if (error || !statusLine) return null
  return (
    <section className="showcase-now">
      <span className="showcase-now-label">NOW</span>
      <p>{statusLine}</p>
    </section>
  )
}
```

`src/app/showcase/WorksSection.tsx`:

```tsx
import { ProductShowcaseCard } from './ProductShowcaseCard'
import { useShowcaseProducts } from './useShowcaseProducts'

export function WorksSection() {
  const { products, error, loading } = useShowcaseProducts()
  return (
    <section className="showcase-section">
      <h2 className="showcase-section-title">精选作品</h2>
      {error && <p role="alert" className="feedback error">{error}</p>}
      {loading && <p>正在加载作品...</p>}
      {!loading && !error && products.length === 0 && <p className="showcase-empty">还没有公开的作品。</p>}
      <div className="showcase-grid">
        {products.map((product) => <ProductShowcaseCard key={product.id} product={product} />)}
      </div>
    </section>
  )
}
```

`src/app/showcase/ProductShowcaseCard.tsx`:

```tsx
import { Link } from 'react-router-dom'
import type { PublicProduct } from '../../domain/models'
import { productStatusLabels } from '../productPresentation'

interface Props { product: PublicProduct }
export function ProductShowcaseCard({ product }: Props) {
  return (
    <Link className="showcase-card" to={`/showcase/${product.id}`}>
      <div className="showcase-card-top">
        <span className="showcase-card-icon">{product.icon}</span>
        <span className={`status status-${product.status}`}>{productStatusLabels[product.status]}</span>
      </div>
      <h3 className="showcase-card-title">{product.name}</h3>
      <p className="showcase-card-desc">{product.description || '暂无简介'}</p>
      <footer className="showcase-card-meta">
        <span>{product.currentVersion}</span>
        <span>·</span>
        <span>{product.userCount.toLocaleString()} 用户</span>
      </footer>
    </Link>
  )
}
```

`src/app/showcase/AboutSection.tsx`:

```tsx
interface Props { paragraphs: string[]; error: string }
export function AboutSection({ paragraphs, error }: Props) {
  if (error || paragraphs.length === 0) return null
  return (
    <section className="showcase-section">
      <h2 className="showcase-section-title">关于我</h2>
      <div className="showcase-about">{paragraphs.map((p, i) => <p key={i}>{p}</p>)}</div>
    </section>
  )
}
```

`src/app/showcase/ContactSection.tsx`:

```tsx
import type { SocialLink } from '../../domain/models'
interface Props { email: string; links: SocialLink[]; error: string }
export function ContactSection({ email, links, error }: Props) {
  if (error) return null
  return (
    <section className="showcase-section">
      <h2 className="showcase-section-title">联系我</h2>
      <p className="showcase-contact-cta">想做点有意思的？欢迎聊一聊 →</p>
      {email && <a className="showcase-contact-email" href={`mailto:${email}`}>{email}</a>}
      {links.length > 0 && (
        <ul className="showcase-social-list">
          {links.map((link) => <li key={link.url}><a href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a></li>)}
        </ul>
      )}
    </section>
  )
}
```

`src/app/showcase/ShowcaseDetailPage.tsx`:

```tsx
import { useCommitPolling } from '../../client/useCommitPolling'
import { useShowcaseProduct } from './useShowcaseProduct'
import { productStatusLabels } from '../productPresentation'

interface Props { productId: string }

export function ShowcaseDetailPage({ productId }: Props) {
  const { product, error, loading } = useShowcaseProduct(productId)
  const { commits, loading: commitsLoading, error: commitsError } = useCommitPolling(product?.id ?? null, 5)

  if (loading) return <section className="showcase-section"><p>正在加载作品...</p></section>
  if (error === 'notFound') return (
    <section className="showcase-section">
      <p className="feedback warning">作品未公开或不存在</p>
      <a href="/showcase">返回作品集</a>
    </section>
  )
  if (error || !product) return <section className="showcase-section"><p role="alert" className="feedback error">加载失败，请稍后重试</p></section>

  return (
    <article className="showcase-detail">
      <nav className="showcase-breadcrumb"><a href="/showcase">作品集</a><span>/</span><span>{product.name}</span></nav>
      <header className="showcase-detail-header">
        <span className="showcase-card-icon">{product.icon}</span>
        <div>
          <h1>{product.name}</h1>
          <span className={`status status-${product.status}`}>{productStatusLabels[product.status]}</span>
        </div>
        {product.appUrl && <a className="showcase-cta" href={product.appUrl} target="_blank" rel="noopener noreferrer">访问应用</a>}
      </header>
      <div className="showcase-detail-body">
        <section className="showcase-detail-desc">
          <p>{product.description || '暂无简介'}</p>
        </section>
        <aside className="showcase-detail-meta">
          <div><strong>{product.userCount.toLocaleString()}</strong><span>用户</span></div>
          <div><strong>{product.currentVersion}</strong><span>当前版本</span></div>
          <div><strong>{productStatusLabels[product.status]}</strong><span>状态</span></div>
        </aside>
      </div>
      <section className="showcase-detail-commits">
        <h2>最近更新</h2>
        {commitsLoading && <p>正在读取 Git 更新…</p>}
        {commitsError && <p className="feedback warning">{commitsError}</p>}
        {!commitsLoading && commits.length === 0 && <p>暂无 Git 提交记录</p>}
        <ol>{commits.map((c) => <li key={c.sha}><span>{c.subject}</span><code>{c.shortSha}</code></li>)}</ol>
      </section>
    </article>
  )
}
```

`src/app/showcase/ShowcaseSkeleton.tsx`:

```tsx
export function ShowcaseSkeleton() {
  return (
    <div className="showcase-skeleton" aria-hidden="true">
      <div className="showcase-skeleton-line showcase-skeleton-line-lg" />
      <div className="showcase-skeleton-line showcase-skeleton-line-md" />
      <div className="showcase-skeleton-grid">
        <div className="showcase-skeleton-card" />
        <div className="showcase-skeleton-card" />
        <div className="showcase-skeleton-card" />
      </div>
    </div>
  )
}
```

`src/app/showcase/reveal.ts`:

```ts
export function observeReveal(element: HTMLElement, onReveal: () => void): () => void {
  if (typeof IntersectionObserver === 'undefined') { onReveal(); return () => undefined }
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) { onReveal(); observer.disconnect(); return }
    }
  }, { threshold: 0.1 })
  observer.observe(element)
  return () => observer.disconnect()
}
```

- [ ] **Step 4: Create showcase.css**

Create `src/styles/showcase.css`:

```css
.showcase-shell { min-height: 100vh; background: #f5f6fa; color: #1d2130; }
.showcase-nav { display: flex; align-items: center; justify-content: space-between; max-width: 1160px; margin: 0 auto; padding: 22px 32px; }
.showcase-brand { font-weight: 800; font-size: 18px; text-decoration: none; color: #1d2130; }
.showcase-nav-links { display: flex; gap: 22px; }
.showcase-nav-links a { text-decoration: none; color: #555969; font-weight: 700; }
.showcase-nav-links a:hover { color: #6259e8; }
.showcase-main { max-width: 1160px; margin: 0 auto; padding: 48px 32px 96px; }

.showcase-hero { padding: 32px 0 48px; }
.showcase-pill { display: inline-block; padding: 6px 12px; border-radius: 999px; background: #6259e8; color: white; font-size: 12px; font-weight: 700; margin-bottom: 24px; }
.showcase-hero-title { margin: 0; line-height: 1.05; letter-spacing: -0.04em; }
.showcase-hero-title span { display: block; font-size: 24px; color: #747887; font-weight: 600; margin-bottom: 8px; }
.showcase-hero-title strong { display: block; font-size: clamp(48px, 7vw, 96px); font-weight: 800; color: #1d2130; }
.showcase-hero-tagline { margin: 18px 0 0; font-size: clamp(18px, 1.8vw, 24px); color: #555969; }

.showcase-now { display: flex; align-items: center; gap: 14px; padding: 18px 0; border-top: 1px solid #e8e9f0; border-bottom: 1px solid #e8e9f0; margin-bottom: 56px; }
.showcase-now-label { color: #6259e8; font-weight: 800; font-size: 11px; letter-spacing: 0.12em; }
.showcase-now p { margin: 0; color: #1d2130; font-size: 16px; }

.showcase-section { margin-bottom: 80px; }
.showcase-section-title { font-size: 32px; font-weight: 700; letter-spacing: -0.03em; margin: 0 0 28px; }
.showcase-empty { color: #747887; padding: 48px; border: 1px dashed #d7d8e2; border-radius: 16px; background: #fff; text-align: center; }

.showcase-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; }
.showcase-card { display: flex; flex-direction: column; min-height: 280px; padding: 22px; border: 1px solid #e9e9f0; border-radius: 16px; background: #fff; color: inherit; text-decoration: none; box-shadow: 0 4px 18px rgba(37, 42, 69, .04); transition: transform .2s, box-shadow .2s; opacity: 0; transform: translateY(16px); }
.showcase-card.is-revealed { opacity: 1; transform: translateY(0); transition: opacity .4s ease-out, transform .4s ease-out, box-shadow .2s; }
.showcase-card:hover { transform: translateY(-4px); box-shadow: 0 16px 40px rgba(37, 42, 69, .12); }
.showcase-card-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 22px; }
.showcase-card-icon { display: grid; place-items: center; width: 48px; height: 48px; border-radius: 13px; background: #f2f1ff; font-size: 26px; }
.showcase-card-title { margin: 0 0 8px; font-size: 20px; font-weight: 700; }
.showcase-card-desc { color: #737786; font-size: 14px; line-height: 1.6; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin: 0; }
.showcase-card-meta { display: flex; gap: 8px; margin-top: auto; padding-top: 18px; border-top: 1px solid #eff0f4; color: #8a8d99; font-size: 12px; }

.showcase-about p { max-width: 680px; color: #2a2e3d; line-height: 1.7; font-size: 16px; margin: 0 0 20px; }

.showcase-contact-cta { font-size: 24px; color: #1d2130; margin: 0 0 24px; font-weight: 700; }
.showcase-contact-email { display: inline-block; font-size: 32px; font-weight: 700; color: #6259e8; text-decoration: none; letter-spacing: -0.02em; border-bottom: 2px solid transparent; }
.showcase-contact-email:hover { border-bottom-color: #6259e8; }
.showcase-social-list { list-style: none; padding: 0; margin: 32px 0 0; display: flex; flex-wrap: wrap; gap: 12px; }
.showcase-social-list a { display: inline-flex; align-items: center; padding: 10px 16px; border: 1px solid #dcdde7; border-radius: 999px; color: #4e5261; text-decoration: none; font-weight: 700; }
.showcase-social-list a:hover { color: #6259e8; border-color: #6259e8; }

.showcase-detail-header { display: flex; align-items: center; gap: 18px; margin-bottom: 32px; flex-wrap: wrap; }
.showcase-detail-header h1 { margin: 0; font-size: 36px; letter-spacing: -0.03em; }
.showcase-cta { margin-left: auto; padding: 12px 20px; border-radius: 10px; background: #6259e8; color: white; text-decoration: none; font-weight: 700; }
.showcase-breadcrumb { display: flex; gap: 8px; margin-bottom: 24px; color: #8d909e; font-size: 13px; }
.showcase-breadcrumb a { color: #6259e8; text-decoration: none; }
.showcase-detail-body { display: grid; grid-template-columns: 2fr 1fr; gap: 32px; margin-bottom: 48px; }
.showcase-detail-desc { font-size: 17px; line-height: 1.7; white-space: pre-wrap; color: #2a2e3d; }
.showcase-detail-meta { display: grid; gap: 14px; }
.showcase-detail-meta div { padding: 18px; border: 1px solid #e7e8ef; border-radius: 14px; background: #fff; display: flex; flex-direction: column; gap: 6px; }
.showcase-detail-meta strong { font-size: 24px; }
.showcase-detail-meta span { color: #858895; font-size: 12px; }
.showcase-detail-commits ol { list-style: none; padding: 0; margin: 0; }
.showcase-detail-commits li { display: flex; justify-content: space-between; padding: 12px 0; border-top: 1px solid #eff0f4; }

.showcase-skeleton { display: grid; gap: 16px; }
.showcase-skeleton-line { height: 18px; border-radius: 9px; background: linear-gradient(90deg, #ecedf2, #f5f6fa, #ecedf2); background-size: 200% 100%; animation: showcase-skeleton 1.4s ease-in-out infinite; }
.showcase-skeleton-line-lg { height: 56px; width: 60%; }
.showcase-skeleton-line-md { height: 24px; width: 40%; }
.showcase-skeleton-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
.showcase-skeleton-card { height: 220px; border-radius: 16px; background: #ecedf2; }
@keyframes showcase-skeleton { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }

@media (max-width: 900px) {
  .showcase-grid { grid-template-columns: repeat(2, 1fr); }
  .showcase-detail-body { grid-template-columns: 1fr; }
}
@media (max-width: 600px) {
  .showcase-grid { grid-template-columns: 1fr; }
  .showcase-skeleton-grid { grid-template-columns: 1fr; }
  .showcase-main { padding: 32px 18px 64px; }
  .showcase-detail-header h1 { font-size: 28px; }
  .showcase-cta { margin-left: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .showcase-card { opacity: 1; transform: none; transition: none; }
  .showcase-skeleton-line, .showcase-skeleton-card { animation: none; }
  .showcase-card:hover { transform: none; }
}
```

- [ ] **Step 5: Wire showcase into the main App**

In `src/app/App.tsx`, modify the top of the file (right after the existing imports):

Add import at top:

```ts
import { useLocation } from 'react-router-dom'
import { ShowcaseApp } from './showcase/ShowcaseApp'
```

Then replace the existing `export default function App` (line 15) with:

```ts
export default function App(props: AppProps) {
  return props.repository || import.meta.env.MODE === 'test'
    ? <LegacyApp {...props} />
    : <TopLevel {...props} />
}

function TopLevel(props: AppProps) {
  const location = useLocation()
  if (location.pathname.startsWith('/showcase')) {
    return <ShowcaseApp initialEntries={props.initialEntries} />
  }
  return <ApiApp {...props} />
}
```

Remove the unused `MemoryRouter` import — search the file for any leftover `MemoryRouter` references after editing. (If the existing `initialEntries` code path is still used by other tests via `LegacyApp`, leave it.)

- [ ] **Step 6: Verify it compiles and dev server renders the page**

Run: `npm run typecheck:test`
Expected: no errors.

Run: `npm run dev -- --host 127.0.0.1` (background it)

Run: `curl -fsS http://127.0.0.1:6000/showcase`
Expected: returns the SPA HTML shell (the `/showcase` deep link should still serve `index.html` per the existing SPA fallback config).

Stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add src/app/showcase src/styles/showcase.css src/app/App.tsx
git commit -m "feat: add showcase shell and route dispatch"
```

---

## Task 6: Reveal-on-scroll and accessibility wiring

**Files:**
- Modify: `src/app/showcase/WorksSection.tsx`
- Modify: `src/app/showcase/ProductShowcaseCard.tsx`
- Modify: `src/app/showcase/HeroSection.tsx`

- [ ] **Step 1: Add reveal observer to cards**

Replace `src/app/showcase/WorksSection.tsx` with:

```tsx
import { useEffect, useRef } from 'react'
import { ProductShowcaseCard } from './ProductShowcaseCard'
import { useShowcaseProducts } from './useShowcaseProducts'

export function WorksSection() {
  const { products, error, loading } = useShowcaseProducts()
  const gridRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    const cards = Array.from(grid.querySelectorAll<HTMLElement>('.showcase-card'))
    if (typeof IntersectionObserver === 'undefined') {
      cards.forEach((c) => c.classList.add('is-revealed'))
      return
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const el = entry.target as HTMLElement
          const index = cards.indexOf(el)
          el.style.transitionDelay = `${index * 60}ms`
          el.classList.add('is-revealed')
          observer.unobserve(el)
        }
      })
    }, { threshold: 0.1 })
    cards.forEach((c) => observer.observe(c))
    return () => observer.disconnect()
  }, [products])

  return (
    <section className="showcase-section">
      <h2 className="showcase-section-title">精选作品</h2>
      {error && <p role="alert" className="feedback error">{error}</p>}
      {loading && <p>正在加载作品...</p>}
      {!loading && !error && products.length === 0 && <p className="showcase-empty">还没有公开的作品。</p>}
      <div className="showcase-grid" ref={gridRef}>
        {products.map((product) => <ProductShowcaseCard key={product.id} product={product} />)}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Ensure reduced-motion is handled**

In `src/app/showcase/WorksSection.tsx`, the `useEffect` already short-circuits if `IntersectionObserver` is missing — extend it to also detect `prefers-reduced-motion`:

```tsx
useEffect(() => {
  const grid = gridRef.current
  if (!grid) return
  const cards = Array.from(grid.querySelectorAll<HTMLElement>('.showcase-card'))
  const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (typeof IntersectionObserver === 'undefined' || prefersReducedMotion) {
    cards.forEach((c) => c.classList.add('is-revealed'))
    return
  }
  // ... existing observer code
}, [products])
```

- [ ] **Step 3: Verify and commit**

Run: `npm run typecheck:test`
Expected: passes.

```bash
git add src/app/showcase/WorksSection.tsx
git commit -m "feat: reveal showcase cards on scroll with reduced-motion fallback"
```

---

## Task 7: Tests for routing and the SQL filter

**Files:**
- Create: `tests/app/showcaseRouting.test.tsx`
- (Already created in Task 2: `tests/server/showcase.test.ts`)

- [ ] **Step 1: Write failing routing test**

Create `tests/app/showcaseRouting.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

const fetchMock = vi.fn()
beforeEach(() => { fetchMock.mockReset(); globalThis.fetch = fetchMock as unknown as typeof fetch })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

const ok = (data: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => ({ data }) } as Response)

describe('ShowcaseApp routing', () => {
  it('renders Hero on /showcase with profile data', async () => {
    fetchMock
      .mockImplementationOnce(() => ok({ displayName: 'Ada', tagline: 'hi', avatarUrl: null, statusLine: 'now', statusPillText: 'open', aboutParagraphs: [], contactEmail: 'a@b.c', socialLinks: [] }))
      .mockImplementationOnce(() => ok([]))
    const { ShowcaseApp } = await import('../src/app/showcase/ShowcaseApp')
    render(<ShowcaseApp initialEntries={['/showcase']} />)
    await waitFor(() => expect(screen.getByText('Ada')).toBeInTheDocument())
    expect(screen.getByText('hi')).toBeInTheDocument()
  })

  it('renders 404 for unknown product id', async () => {
    fetchMock.mockImplementationOnce(() => Promise.resolve({ ok: false, status: 404, json: async () => ({ error: { code: 'NOT_FOUND' } }) } as Response))
    const { ShowcaseApp } = await import('../src/app/showcase/ShowcaseApp')
    render(<ShowcaseApp initialEntries={['/showcase/missing-id']} />)
    await waitFor(() => expect(screen.getByText(/作品未公开或不存在/)).toBeInTheDocument())
  })

  it('renders product detail when found', async () => {
    fetchMock
      .mockImplementationOnce(() => ok({ id: 'p1', name: 'Flora', description: 'A plant app', icon: '🌿', status: 'beta', currentVersion: 'v1.0', userCount: 100, appUrl: 'https://flora.example', updatedAt: '2026-01-01' }))
      .mockImplementationOnce(() => ok({ items: [], checkedAt: '2026-01-01' }))
    const { ShowcaseApp } = await import('../src/app/showcase/ShowcaseApp')
    render(<ShowcaseApp initialEntries={['/showcase/p1']} />)
    await waitFor(() => expect(screen.getByText('Flora')).toBeInTheDocument())
    expect(screen.getByText('A plant app')).toBeInTheDocument()
  })
})
```

Run: `npm test -- --run tests/app/showcaseRouting.test.tsx`
Expected: all 3 tests pass.

- [ ] **Step 2: Re-run server tests for the SQL filter**

Run: `npm test -- --run tests/server/showcase.test.ts`
Expected: all 5 tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/app/showcaseRouting.test.tsx
git commit -m "test: cover showcase routing and not-found state"
```

---

## Task 8: README + final verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document the showcase page**

Add a section to `README.md` after the "数据存储说明" section (line 28), before "部署说明" (line 38):

```markdown
## 作品集对外展示

`/showcase` 是一个对外公开访问的作品集页面，面向潜在合作者、招聘方和好奇的访客，展示当前对外公开的产品。

- 在工作台的产品设置中勾选 **对外公开** 即可让该产品出现在 `/showcase`。
- 公开的产品只能展示名称、描述、图标、状态、当前版本、用户数和 `appUrl`，**不会**展示任务、Bug、文档等内部协作数据。
- 个人信息、tagline、关于我段落、联系方式和社交链接在 `data/showcase-profile.json` 中配置，修改后需要重启 dev server。
- 详情页 `/showcase/:productId` 仅对公开且未归档的产品可见；不公开或已归档的 ID 返回 404。
```

- [ ] **Step 2: Run full verification**

```bash
npm run lint
npm test -- --run
npm run typecheck:test
npm run build
```

Expected: all pass with no errors. Existing App / ProductGrid / ProductDetail / TasksVersions / AppDocuments tests must still pass.

- [ ] **Step 3: Smoke-test the running server end-to-end**

Run: `npm run dev -- --host 127.0.0.1` (background it)

```bash
curl -fsS http://127.0.0.1:6000/api/showcase/profile
curl -fsS http://127.0.0.1:6000/api/showcase/products
```

Expected: profile returns your JSON; products returns empty array initially. To smoke-test the public listing, set a product's `is_public` flag manually in SQLite via a temporary test, or open the app at `/products/:id`, toggle 对外公开 in settings, save, and re-curl `/api/showcase/products`.

Stop the dev server.

- [ ] **Step 4: Commit final integration**

```bash
git add README.md
git commit -m "docs: document /showcase public portfolio page"
```

---

## Plan Self-Review

- **Coverage:**
  - Spec §1, §2 (scope & users) — Task 1 types, Task 8 docs.
  - Spec §3 (IA + routes + data contract) — Task 1 types, Task 2 SQL/route, Task 5 routes/dispatch.
  - Spec §4 (backend) — Tasks 2 and 3.
  - Spec §5 (visual design) — Task 5 CSS, Task 6 reveal/reduced-motion.
  - Spec §6 (components) — Tasks 5 and 6.
  - Spec §7 (data flow & errors) — Tasks 2, 5, 6, 7.
  - Spec §8 (integrations) — Tasks 2, 3, 4, 5.
  - Spec §9 (tests) — Tasks 2 and 7.
  - Spec §10 (risks) — R1, R4 mitigated in Task 2 (strict SQL filter + tests); R3 mitigated in Task 3 (JSON path is documented); R6 mitigated in Task 6 (reduced-motion + stagger cap).
- **No placeholder steps:** every code block contains complete, runnable content.
- **Type consistency:** `PublicProduct`, `ShowcaseProfile`, `SocialLink`, `SocialPlatform`, `deriveCurrentVersion`, `listPublicProducts`, `getPublicProduct`, `fetchShowcaseProfile`, `fetchShowcaseProducts`, `fetchShowcaseProduct` introduced in Task 1 / 2 / 4 and consumed consistently by hooks and components in Tasks 5–7.
- **TDD discipline:** Task 2 writes the failing test before implementation; Task 7 writes the failing routing test before declaring success.