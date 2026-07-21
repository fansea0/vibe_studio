# Vibe Studio 自定义作品展示页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-product custom HTML showcase page that renders in a sandboxed iframe inside the existing `/showcase/:productId` detail view, fed product data via postMessage.

**Architecture:** A new `Product.showcasePagePath` field points at a user-authored HTML file under `data/products/<productId>/showcase.html`. A new `GET /api/showcase/pages/:productId` route serves the file through the existing showcase API (enforcing `is_public=1` filter + path-traversal guards). A new `ProductShowcaseFrame` component renders the file in a sandboxed iframe, then injects product data via postMessage.

**Tech Stack:** React 18, TypeScript, Vite 7, react-router-dom 7, better-sqlite3, Vitest + Testing Library, native `iframe.sandbox` + `postMessage` (no new deps).

---

## File structure

```text
src/domain/models.ts                                # +showcasePagePath on Product + PublicProduct
src/server/sqlite.ts                                # +showcase_page_path column, map/create/update
src/server/showcasePage.ts                          # NEW: resolveShowcasePath + readShowcasePage
src/server/api.ts                                   # +validate showcasePagePath, +/api/showcase/pages/:id route
src/client/api.ts                                   # PublicProduct type already re-exports showcasePagePath
src/app/showcase/ProductShowcaseFrame.tsx           # NEW: sandboxed iframe + postMessage
src/app/showcase/ShowcaseDetailPage.tsx             # integrate ProductShowcaseFrame with fallback
src/styles/showcase.css                             # +.showcase-frame + state styles
src/app/productForm.ts                              # +showcasePagePath in ProductFormValues
src/app/ProductFields.tsx                           # +showcasePagePath input
data/products/flora/showcase.html                   # NEW: example demo HTML
tests/server/showcasePage.test.ts                   # NEW: path resolution + file read
tests/server/showcase.test.ts                       # +2 tests for PublicProduct field pass-through
tests/app/showcaseFrame.test.tsx                    # NEW: component render + postMessage spy
README.md                                           # +"自定义作品页" section
```

---

## Task 1: Add `showcasePagePath` field, `resolveShowcasePath` helper, file reader (TDD)

**Files:**
- Modify: `src/domain/models.ts:7-23` (Product interface), `src/domain/models.ts:26-36` (PublicProduct interface)
- Create: `src/server/showcasePage.ts`
- Test: `tests/server/showcasePage.test.ts`

- [ ] **Step 1: Write failing tests for path resolution + file reader**

Create `tests/server/showcasePage.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RepositoryError } from '../../src/server/sqlite'
import { readShowcasePage, resolveShowcasePath } from '../../src/server/showcasePage'

describe('resolveShowcasePath', () => {
  it('accepts a path under data/products/<productId>/', () => {
    const resolved = resolveShowcasePath('flora', 'data/products/flora/showcase.html')
    expect(resolved.endsWith('data/products/flora/showcase.html')).toBe(true)
  })

  it('rejects path traversal via ..', () => {
    expect(() => resolveShowcasePath('flora', '../etc/passwd')).toThrow(RepositoryError)
  })

  it('rejects absolute paths', () => {
    expect(() => resolveShowcasePath('flora', '/etc/passwd')).toThrow(RepositoryError)
  })

  it('rejects paths under another product directory', () => {
    expect(() => resolveShowcasePath('flora', 'data/products/other-id/showcase.html')).toThrow(RepositoryError)
  })

  it('rejects unsafe productId (special characters)', () => {
    expect(() => resolveShowcasePath('flo/ra', 'data/products/flora/showcase.html')).toThrow(RepositoryError)
  })
})

describe('readShowcasePage', () => {
  let dir: string
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'showcase-')) })
  afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

  it('returns file content', async () => {
    const file = join(dir, 'page.html')
    await writeFile(file, '<h1>hi</h1>', 'utf8')
    expect(await readShowcasePage(file)).toBe('<h1>hi</h1>')
  })

  it('throws NOT_FOUND when file is missing', async () => {
    await expect(readShowcasePage(join(dir, 'missing.html'))).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
```

Run: `npm test -- --run tests/server/showcasePage.test.ts`
Expected: FAIL — module `src/server/showcasePage.ts` does not exist.

- [ ] **Step 2: Add `showcasePagePath` to Product and PublicProduct**

In `src/domain/models.ts`, modify the `Product` interface (line 7) — add after `isPublic` (line 21):

```ts
  showcasePagePath?: string
```

In the `PublicProduct` interface (lines 26-36), add at the end (after `updatedAt: string`):

```ts
  showcasePagePath: string
```

- [ ] **Step 3: Implement `src/server/showcasePage.ts`**

Create `src/server/showcasePage.ts`:

```ts
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { RepositoryError } from './sqlite.js'

const SAFE_ID = /^[a-z0-9-_]+$/i
const SHOWCASE_ROOT = path.resolve(process.cwd(), 'data/products')

export function resolveShowcasePath(productId: string, configuredPath: string): string {
  if (!SAFE_ID.test(productId)) throw new RepositoryError('NOT_FOUND', 'product')
  const full = path.resolve(process.cwd(), configuredPath)
  const expectedPrefix = SHOWCASE_ROOT + path.sep + productId + path.sep
  if (!full.startsWith(expectedPrefix)) throw new RepositoryError('VALIDATION_FAILED', 'showcasePagePath')
  return full
}

export async function readShowcasePage(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, 'utf8')
  } catch {
    throw new RepositoryError('NOT_FOUND', 'showcase page')
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- --run tests/server/showcasePage.test.ts`
Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/domain/models.ts src/server/showcasePage.ts tests/server/showcasePage.test.ts
git commit -m "feat: add showcasePagePath field and path resolver"
```

---

## Task 2: SQLite migration + Product CRUD pass-through (TDD)

**Files:**
- Modify: `src/server/sqlite.ts` (schemaComments, CREATE TABLE, ALTER, mapProduct, createProduct, updateProduct)
- Test: `tests/server/sqlite.test.ts` (existing assertion may need update)

- [ ] **Step 1: Write failing test for the new field persistence**

In `tests/server/sqlite.test.ts`, the existing test at line 32 asserts `Object.keys(schemaComments.products)` has length 18 (after Task 2 added `is_public`). This will need to be updated to **19** after adding `showcase_page_path`.

Read the existing test, find the assertion (`expect(Object.keys(schemaComments.products)).toHaveLength(18)`), and add a new test below it:

```ts
it('createProduct and updateProduct persist showcase_page_path', () => {
  const repo = createSqliteRepository(':memory:')
  const all = repo.listProducts(true)
  const created = repo.createProduct({ name: 'TestProduct', description: 'desc', productType: 'web-app', icon: '✨', status: 'developing', completionPercent: 0, userCount: 0, userCountSource: '', appUrl: null, repositoryPath: '', isPublic: false, showcasePagePath: 'data/products/test-product/showcase.html' } as any)
  expect(created.showcasePagePath).toBe('data/products/test-product/showcase.html')
  const updated = repo.updateProduct(String(created.id), { showcasePagePath: '' } as any)
  expect(updated.showcasePagePath).toBe('')
  repo.close()
})
```

Run: `npm test -- --run tests/server/sqlite.test.ts`
Expected: FAIL — `createProduct` doesn't yet write `showcase_page_path`.

- [ ] **Step 2: Update `schemaComments.products` (line 6)**

Add `showcase_page_path: '自定义作品页路径'` after `is_public: '是否对外公开'`.

- [ ] **Step 3: Add `showcase_page_path` column to CREATE TABLE**

In the `CREATE TABLE IF NOT EXISTS products` block (line 36-70), add before the closing `);`:

```sql
,
-- 字段: 自定义作品页路径
showcase_page_path TEXT NOT NULL DEFAULT ''
```

- [ ] **Step 4: Add ALTER TABLE migration**

After the existing `ALTER TABLE ... is_public` line (around line 148), add:

```ts
try { db.exec('ALTER TABLE products ADD COLUMN showcase_page_path TEXT NOT NULL DEFAULT \'\'') } catch { }
```

- [ ] **Step 5: Update `mapProduct` (line 27)**

Add `showcasePagePath: r.showcase_page_path || ''` before `createdAt`:

```ts
const mapProduct = (r: any): Product => ({ id: String(r.id), name: r.name, description: r.description, productType: r.product_type, icon: r.icon, status: ['developing','beta','released','archived'][r.status] as ProductStatus, completionPercent: r.completion_percent, userCount: r.user_count, userCountSource: r.user_count_source, appUrl: r.app_url || null, repositoryPath: r.repository_path, archivedAt: r.archived_at || null, isPublic: Boolean(r.is_public), showcasePagePath: r.showcase_page_path || '', createdAt: r.created_at, updatedAt: r.updated_at, isDeleted: Boolean(r.is_deleted) })
```

- [ ] **Step 6: Update `createProduct` INSERT (line 155)**

Add `showcase_page_path` to the column list, value placeholder, and `.run()` args (after `is_public`):

```ts
createProduct(i) { ensureName(i.name); ensureProductStatus(i.status); if (typeof i.repositoryPath !== 'string') throw new RepositoryError('VALIDATION_FAILED', 'repositoryPath'); const t = now(); try { const x = db.prepare('INSERT INTO products(name,normalized_name,description,product_type,icon,status,completion_percent,user_count,user_count_source,app_url,repository_path,archived_at,created_at,updated_at,is_public,showcase_page_path) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(i.name, normalized(i.name), i.description, i.productType, i.icon, statusCode[i.status], i.completionPercent, i.userCount, i.userCountSource, i.appUrl ?? '', i.repositoryPath ?? '', i.archivedAt ?? '', t, t, i.isPublic ? 1 : 0, i.showcasePagePath ?? ''); return getProduct(String(x.lastInsertRowid))! } catch (e) { throw mapMutationError(e, 'product') } },
```

- [ ] **Step 7: Update `updateProduct` UPDATE (line 156)**

Add `showcase_page_path=?` after `is_public=?` and pass `n.showcasePagePath ?? ''`:

```ts
db.prepare('UPDATE products SET name=?,normalized_name=?,description=?,product_type=?,icon=?,status=?,completion_percent=?,user_count=?,user_count_source=?,app_url=?,repository_path=?,archived_at=?,updated_at=?,is_public=?,showcase_page_path=? WHERE id=? AND is_deleted=0').run(n.name, normalized(n.name), n.description, n.productType, n.icon, statusCode[n.status], n.completionPercent, n.userCount, n.userCountSource, n.appUrl ?? '', n.repositoryPath ?? '', n.archivedAt ?? '', updatedAt, n.isPublic ? 1 : 0, n.showcasePagePath ?? '', Number(id))
```

- [ ] **Step 8: Update `mapPublicProduct` (line 31)**

Add `showcasePagePath: r.showcase_page_path || ''` to the mapped object:

```ts
const mapPublicProduct = (r: any): PublicProduct => ({
  id: String(r.id),
  name: r.name,
  description: r.description,
  icon: r.icon,
  status: ['developing','beta','released','archived'][r.status] as ProductStatus,
  currentVersion: r.current_version ?? NO_RELEASED_VERSION,
  userCount: r.user_count,
  appUrl: r.app_url || null,
  updatedAt: r.updated_at,
  showcasePagePath: r.showcase_page_path || '',
})
```

- [ ] **Step 9: Update `tests/server/sqlite.test.ts:32` assertion**

Change the existing `toHaveLength(18)` to `toHaveLength(19)`.

- [ ] **Step 10: Run tests and commit**

Run: `npm test -- --run tests/server/sqlite.test.ts`
Expected: all pass (including the new test).

```bash
git add src/server/sqlite.ts tests/server/sqlite.test.ts
git commit -m "feat: persist showcasePagePath in SQLite"
```

---

## Task 3: New API route `GET /api/showcase/pages/:productId` (TDD)

**Files:**
- Modify: `src/server/api.ts:8` (validateProduct)
- Test: `tests/server/showcase.test.ts` (extend existing)

- [ ] **Step 1: Write failing API tests**

Append to `tests/server/showcase.test.ts` (inside the `describe('showcase API')` block):

```ts
import { resolveShowcasePath, readShowcasePage } from '../src/server/showcasePage.js'
import { writeFile, mkdir } from 'node:fs/promises'

describe('showcase pages API', () => {
  it('GET /api/showcase/pages/:id returns 404 when product is private or archived', async () => {
    const repo = createSqliteRepository(':memory:')
    const handler = createApiHandler({ repository: repo, profileReader: async () => ({ displayName: '', tagline: '', avatarUrl: null, statusLine: '', statusPillText: '', aboutParagraphs: [], contactEmail: '', socialLinks: [] }) })
    const all = repo.listProducts(true)
    const res = await invoke(handler, 'GET', `/api/showcase/pages/${all[0].id}`)
    expect(res.status).toBe(404)
    repo.close()
  })

  it('GET /api/showcase/pages/:id returns 404 when showcasePagePath is empty', async () => {
    const repo = createSqliteRepository(':memory:')
    const handler = createApiHandler({ repository: repo, profileReader: async () => ({ displayName: '', tagline: '', avatarUrl: null, statusLine: '', statusPillText: '', aboutParagraphs: [], contactEmail: '', socialLinks: [] }) })
    const all = repo.listProducts(true)
    repo.updateProduct(String(all[0].id), { isPublic: true, showcasePagePath: '' } as any)
    const res = await invoke(handler, 'GET', `/api/showcase/pages/${all[0].id}`)
    expect(res.status).toBe(404)
    repo.close()
  })
})
```

For the success case (200 returning HTML), the test must create a real file. Add:

```ts
import { writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

describe('showcase pages API with file', () => {
  let dir: string
  beforeEach(async () => {
    dir = join(process.cwd(), `data/products/flora-test`)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'showcase.html'), '<h1>flora</h1>', 'utf8')
  })
  afterEach(async () => { await rm(join(process.cwd(), 'data/products/flora-test'), { recursive: true, force: true }) })

  it('GET /api/showcase/pages/:id returns HTML when public + path configured', async () => {
    const repo = createSqliteRepository(':memory:')
    const handler = createApiHandler({ repository: repo, profileReader: async () => ({ displayName: '', tagline: '', avatarUrl: null, statusLine: '', statusPillText: '', aboutParagraphs: [], contactEmail: '', socialLinks: [] }) })
    // Need a product whose id is 'flora-test' — create one explicitly
    const created = repo.createProduct({ id: 'flora-test', name: 'FloraTest', description: '', productType: 'web-app', icon: '🌿', status: 'developing', completionPercent: 0, userCount: 0, userCountSource: '', appUrl: null, repositoryPath: '', isPublic: true, showcasePagePath: 'data/products/flora-test/showcase.html' } as any)
    const res = await invoke(handler, 'GET', `/api/showcase/pages/${created.id}`)
    expect(res.status).toBe(200)
    expect(res.body).toBe('<h1>flora</h1>')
    repo.close()
  })

  it('GET /api/showcase/pages/:id returns 405 on POST', async () => {
    const repo = createSqliteRepository(':memory:')
    const handler = createApiHandler({ repository: repo, profileReader: async () => ({ displayName: '', tagline: '', avatarUrl: null, statusLine: '', statusPillText: '', aboutParagraphs: [], contactEmail: '', socialLinks: [] }) })
    const all = repo.listProducts(true)
    repo.updateProduct(String(all[0].id), { isPublic: true, showcasePagePath: 'data/products/flora/showcase.html' } as any)
    const res = await invoke(handler, 'POST', `/api/showcase/pages/${all[0].id}`, {})
    expect(res.status).toBe(405)
    repo.close()
  })
})
```

Run: `npm test -- --run tests/server/showcase.test.ts`
Expected: FAIL — route not registered.

- [ ] **Step 2: Add `showcasePagePath` validation in `validateProduct` (api.ts:8)**

Inside the `validateProduct` body (after the existing `isPublic` check), add:

```ts
if(b.showcasePagePath!==undefined&&typeof b.showcasePagePath!=='string') throw new RepositoryError('VALIDATION_FAILED','showcasePagePath')
if(b.showcasePagePath!==undefined&&b.showcasePagePath.includes('..')) throw new RepositoryError('VALIDATION_FAILED','showcasePagePath')
if(b.showcasePagePath!==undefined&&b.showcasePagePath.startsWith('/')) throw new RepositoryError('VALIDATION_FAILED','showcasePagePath')
```

- [ ] **Step 3: Add the new route in `api.ts`**

After the existing showcase route block (after `getPublicProduct` route, around line 15), add:

```ts
let pageId=p.match(/^\/api\/showcase\/pages\/([^/]+)$/)?.[1]; if(pageId){rejectIfNotGet(method); const product=repository.getPublicProduct(pageId); if(!product||!product.showcasePagePath) return send(res,404,{error:{code:'NOT_FOUND',message:'作品未公开或不存在'}}); const filePath=resolveShowcasePath(pageId,product.showcasePagePath); const content=await readShowcasePage(filePath); res.statusCode=200; res.setHeader('content-type','text/html; charset=utf-8'); res.end(content); return}
```

This reuses the existing `rejectIfNotGet` helper from Task 2 of the previous showcase feature. **Confirm** by reading `src/server/api.ts` around line 8 — `rejectIfNotGet` should already be defined.

Add the import at the top of `src/server/api.ts`:

```ts
import { resolveShowcasePath, readShowcasePage } from './showcasePage.js'
```

- [ ] **Step 4: Run tests**

Run: `npm test -- --run tests/server/showcase.test.ts`
Expected: all pass (existing 7 + new 4 = 11).

- [ ] **Step 5: Commit**

```bash
git add src/server/api.ts tests/server/showcase.test.ts
git commit -m "feat: serve custom showcase pages through /api/showcase/pages/:id"
```

---

## Task 4: Example HTML demo at `data/products/flora/showcase.html`

**Files:**
- Create: `data/products/flora/showcase.html`

- [ ] **Step 1: Create the example HTML file**

Create `data/products/flora/showcase.html` (the directory may not exist yet — Vite's API plugin will create it on first write):

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Flora · 自定义作品页示例</title>
    <style>
      :root { color-scheme: light; }
      body {
        margin: 0;
        padding: 32px;
        font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
        background: linear-gradient(135deg, #f0fff4, #e6fffa);
        color: #1d2130;
      }
      h1 { font-size: 32px; margin: 0 0 12px; letter-spacing: -0.02em; }
      p.meta { color: #747887; font-size: 14px; margin: 0 0 24px; }
      button {
        padding: 10px 18px; border: 0; border-radius: 10px;
        background: #14845a; color: white; font-weight: 700; cursor: pointer;
        font: inherit;
      }
      button:hover { background: #0f6d4b; }
      .note {
        margin-top: 24px; padding: 12px 16px; border-radius: 10px;
        background: rgba(255,255,255,0.6); color: #555969; font-size: 13px;
      }
    </style>
  </head>
  <body>
    <h1 id="title">加载中…</h1>
    <p class="meta" id="meta">等待父页面推送产品数据…</p>
    <button id="open" style="display:none">访问应用</button>
    <div class="note">
      这是 <code>data/products/flora/showcase.html</code> 的示例内容。
      你可以在此文件中自由写 HTML / CSS / JavaScript，刷新作品详情页即可看到效果。
    </div>

    <script>
      window.addEventListener('message', function (event) {
        if (event.origin !== window.location.origin) return;
        if (!event.data || event.data.type !== 'vibe-studio:showcase-data') return;
        var product = event.data.product;
        document.getElementById('title').textContent = product.name;
        document.getElementById('meta').textContent =
          (product.icon || '') + '  ' +
          (product.currentVersion || '—') + '  ·  ' +
          (product.userCount || 0).toLocaleString() + ' 用户';
        var btn = document.getElementById('open');
        if (product.appUrl) {
          btn.style.display = 'inline-block';
          btn.textContent = '访问 ' + product.name;
          btn.onclick = function () {
            parent.postMessage({ type: 'vibe-studio:open-url', url: product.appUrl }, '*');
          };
        }
      });
    </script>
  </body>
</html>
```

- [ ] **Step 2: Verify file is reachable via the new API**

Run dev server: `npm run dev > /tmp/dev.log 2>&1 &`
Wait 4 seconds.

```bash
curl -fsS -X POST http://localhost:5173/api/products -H "content-type: application/json" -d '{"name":"Flora","description":"","productType":"web-app","icon":"🌿","status":"developing","completionPercent":0,"userCount":0,"userCountSource":"","appUrl":null,"repositoryPath":"","isPublic":true,"showcasePagePath":"data/products/flora/showcase.html"}'
```

Then `curl -fsS http://localhost:5173/api/showcase/pages/flora`
Expected: returns HTML content starting with `<!doctype html>`

Stop dev server.

- [ ] **Step 3: Commit**

```bash
git add data/products/flora/showcase.html
git commit -m "feat: add flora showcase page demo"
```

Note: the demo HTML file in `data/products/` is **committed** because it's an example, not the user's SQLite file.

---

## Task 5: `ProductShowcaseFrame` component

**Files:**
- Create: `src/app/showcase/ProductShowcaseFrame.tsx`
- Modify: `src/app/showcase/ShowcaseDetailPage.tsx`
- Modify: `src/styles/showcase.css`

- [ ] **Step 1: Create the component**

Create `src/app/showcase/ProductShowcaseFrame.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import type { PublicProduct } from '../../domain/models'

interface Props { product: PublicProduct }

export function ProductShowcaseFrame({ product }: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [reloadKey, setReloadKey] = useState(0)

  if (!product.showcasePagePath) return null

  const src = '/api/showcase/pages/' + encodeURIComponent(product.id)

  const handleLoad = () => {
    setLoadState('ready')
    const iframe = iframeRef.current?.contentWindow
    if (!iframe) return
    try {
      iframe.postMessage(
        { type: 'vibe-studio:showcase-data', product },
        window.location.origin,
      )
    } catch { /* sandbox may block in some browsers; ignore */ }
  }

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      if (event.data?.type === 'vibe-studio:open-url' && typeof event.data.url === 'string') {
        try { window.open(event.data.url, '_blank', 'noopener,noreferrer') } catch { /* ignore */ }
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  return (
    <>
      {loadState !== 'ready' && (
        <div className={'showcase-frame-state showcase-frame-' + loadState}>
          {loadState === 'loading' && <p>正在加载作品页…</p>}
          {loadState === 'error' && (
            <>
              <p>作品页加载失败</p>
              <button onClick={() => { setLoadState('loading'); setReloadKey((k) => k + 1) }}>重新加载</button>
            </>
          )}
        </div>
      )}
      <iframe
        key={reloadKey}
        ref={iframeRef}
        src={src}
        title={product.name + ' 作品展示'}
        className="showcase-frame"
        sandbox="allow-scripts"
        hidden={loadState !== 'ready'}
        onLoad={handleLoad}
        onError={() => setLoadState('error')}
      />
    </>
  )
}
```

- [ ] **Step 2: Integrate into `ShowcaseDetailPage`**

Read `src/app/showcase/ShowcaseDetailPage.tsx`. Find the `<section className="showcase-detail-desc">` block (around line 28). Replace it with:

```tsx
      {product.showcasePagePath ? (
        <ProductShowcaseFrame product={product} />
      ) : (
        <section className="showcase-detail-desc">
          <p>{product.description || '暂无简介'}</p>
        </section>
      )}
```

Add import at top of file:

```ts
import { ProductShowcaseFrame } from './ProductShowcaseFrame'
```

- [ ] **Step 3: Add CSS**

Append to `src/styles/showcase.css`:

```css
.showcase-frame {
  width: 100%;
  min-height: 600px;
  height: 800px;
  border: 1px solid #e7e8ef;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 3px 14px rgba(42, 46, 70, .035);
}
.showcase-frame-state {
  padding: 48px 24px;
  border: 1px dashed #d7d8e2;
  border-radius: 16px;
  background: #fff;
  text-align: center;
  color: #747887;
}
.showcase-frame-state button {
  margin-top: 16px;
}
@media (max-width: 900px) {
  .showcase-frame { height: 600px; }
}
```

- [ ] **Step 4: Verify typecheck**

Run: `npm run typecheck:test`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add src/app/showcase/ProductShowcaseFrame.tsx src/app/showcase/ShowcaseDetailPage.tsx src/styles/showcase.css
git commit -m "feat: render product showcase pages in sandboxed iframe"
```

---

## Task 6: Workbench form integration (`ProductFormValues` + `ProductFields`)

**Files:**
- Modify: `src/app/productForm.ts`
- Modify: `src/app/ProductFields.tsx`

- [ ] **Step 1: Extend `ProductFormValues`**

In `src/app/productForm.ts`, add `showcasePagePath: string` to the `ProductFormValues` interface (line 3):

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
  showcasePagePath: string
}
```

In `productToFormValues` (line 28), add `showcasePagePath: product?.showcasePagePath ?? ''` at the end of the returned object.

In `mergeProductValues` (line 78), add `showcasePagePath: values.showcasePagePath.trim()` at the end before `updatedAt`.

- [ ] **Step 2: Render the input in `ProductFields`**

In `src/app/ProductFields.tsx`, after the `isPublic` checkbox block (around line 50-62), add:

```tsx
<div className="span-2 field">
  <label htmlFor="product-showcasePagePath">自定义作品页路径</label>
  <input
    id="product-showcasePagePath"
    type="text"
    name="showcasePagePath"
    value={values.showcasePagePath}
    onChange={change}
    placeholder="data/products/<product-id>/showcase.html"
  />
  <small className="field-hint">留空使用默认详情页；填写后需重启 dev server 让 Vite 读取新文件</small>
</div>
```

- [ ] **Step 3: Verify typecheck and existing tests**

Run: `npm run typecheck:test && npm test -- --run tests/app/App.test.tsx`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/productForm.ts src/app/ProductFields.tsx
git commit -m "feat: surface showcasePagePath in product forms"
```

---

## Task 7: Component tests for `ProductShowcaseFrame` (TDD)

**Files:**
- Create: `tests/app/showcaseFrame.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `tests/app/showcaseFrame.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { ProductShowcaseFrame } from '../../src/app/showcase/ProductShowcaseFrame'
import type { PublicProduct } from '../../src/domain/models'

const baseProduct: PublicProduct = {
  id: 'flora',
  name: 'Flora',
  description: 'plant app',
  icon: '🌿',
  status: 'beta',
  currentVersion: 'v1.0',
  userCount: 100,
  appUrl: 'https://flora.example',
  updatedAt: '2026-01-01',
  showcasePagePath: 'data/products/flora/showcase.html',
}

describe('ProductShowcaseFrame', () => {
  beforeEach(() => { Object.defineProperty(window, 'location', { value: { origin: 'http://localhost' }, writable: true }) })
  afterEach(() => { cleanup(); vi.restoreAllMocks() })

  it('renders iframe with the correct src when showcasePagePath is set', () => {
    const { container } = render(<ProductShowcaseFrame product={baseProduct} />)
    const iframe = container.querySelector('iframe')
    expect(iframe).not.toBeNull()
    expect(iframe?.getAttribute('src')).toBe('/api/showcase/pages/flora')
  })

  it('renders iframe with sandbox="allow-scripts" (no allow-same-origin)', () => {
    const { container } = render(<ProductShowcaseFrame product={baseProduct} />)
    const iframe = container.querySelector('iframe')
    const sandbox = iframe?.getAttribute('sandbox') ?? ''
    expect(sandbox).toContain('allow-scripts')
    expect(sandbox).not.toContain('allow-same-origin')
  })

  it('returns null when showcasePagePath is empty', () => {
    const { container } = render(<ProductShowcaseFrame product={{ ...baseProduct, showcasePagePath: '' }} />)
    expect(container.querySelector('iframe')).toBeNull()
  })

  it('encodes productId in the iframe src', () => {
    const { container } = render(<ProductShowcaseFrame product={{ ...baseProduct, id: 'a/b c' }} />)
    const iframe = container.querySelector('iframe')
    expect(iframe?.getAttribute('src')).toBe('/api/showcase/pages/a%2Fb%20c')
  })
})
```

Run: `npm test -- --run tests/app/showcaseFrame.test.tsx`
Expected: all 4 tests pass (component already implemented in Task 5).

- [ ] **Step 2: Add postMessage behavior test**

Append to the same file:

```tsx
  it('listens for vibe-studio:open-url messages and opens the URL', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    render(<ProductShowcaseFrame product={baseProduct} />)
    const event = new MessageEvent('message', {
      origin: 'http://localhost',
      data: { type: 'vibe-studio:open-url', url: 'https://example.com' },
    })
    window.dispatchEvent(event)
    expect(openSpy).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer')
  })

  it('ignores messages from foreign origins', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    render(<ProductShowcaseFrame product={baseProduct} />)
    const event = new MessageEvent('message', {
      origin: 'https://evil.example',
      data: { type: 'vibe-studio:open-url', url: 'https://example.com' },
    })
    window.dispatchEvent(event)
    expect(openSpy).not.toHaveBeenCalled()
  })
```

- [ ] **Step 3: Run all component tests**

Run: `npm test -- --run tests/app/showcaseFrame.test.tsx`
Expected: 6 tests pass.

- [ ] **Step 4: Commit**

```bash
git add tests/app/showcaseFrame.test.tsx
git commit -m "test: cover ProductShowcaseFrame render and postMessage"
```

---

## Task 8: README + final verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add the "自定义作品页" section**

Read current `README.md` to find a good insertion point — after the existing `## 作品集对外展示` section.

Append:

```markdown

## 自定义作品页

每个公开产品都可以挂一个完全自定义的 HTML 展示页，用 iframe 在作品详情页里加载。

### 使用方式

1. 在 `data/products/<product-id>/showcase.html` 创建 HTML 文件
2. 在工作台 → 产品设置 → **自定义作品页路径** 填入路径（例如 `data/products/flora/showcase.html`）
3. 重启 dev server（Vite 需要重新读取新文件）
4. 访问 `/showcase/<product-id>` 即可看到你的自定义作品页

作品页 HTML 是**沙箱化**的（`sandbox="allow-scripts"`，**不**含 `allow-same-origin`），可以自由写 CSS/JS/动画/3D，但拿不到主站的 cookie / localStorage。

### 接收产品数据

父页面在 iframe 加载完成后会用 `postMessage` 推送产品数据：

```html
<script>
  window.addEventListener('message', function (event) {
    if (event.origin !== window.location.origin) return;
    if (event.data && event.data.type === 'vibe-studio:showcase-data') {
      var product = event.data.product;
      document.body.innerHTML = '<h1>' + product.name + '</h1>' +
        '<p>当前版本：' + product.currentVersion + '</p>';
    }
  });
</script>
```

`product` 字段包含：`id, name, description, icon, status, currentVersion, userCount, appUrl, updatedAt, showcasePagePath`。

### 打开外链（访问应用等）

由于沙箱拦截 `target="_blank"`，作品页想打开外链时应通过 `parent.postMessage` 通知主页面：

```html
<button onclick="parent.postMessage({ type: 'vibe-studio:open-url', url: 'https://example.com' }, '*')">
  访问应用
</button>
```

主页面会用 `window.open(url, '_blank', 'noopener,noreferrer')` 打开。

### 示例

完整可参考的示例见 `data/products/flora/showcase.html`。
```

- [ ] **Step 2: Run full verification**

```bash
npm run lint
npm test -- --run
npm run typecheck:test
npm run build
```

Expected: all green. New tests: `tests/server/showcasePage.test.ts` (7) + `tests/app/showcaseFrame.test.tsx` (6) + `tests/server/showcase.test.ts` (+4) = +17 tests. Total ≈ 202.

- [ ] **Step 3: End-to-end smoke test**

```bash
npm run dev > /tmp/dev.log 2>&1 &
sleep 4
curl -fsS http://localhost:5173/api/showcase/profile
echo ""
curl -fsS http://localhost:5173/api/showcase/products/flora
echo ""
curl -fsS http://localhost:5173/api/showcase/pages/flora | head -c 200
echo ""
pkill -f vite
```

Expected:
- profile returns JSON
- /api/showcase/products/flora returns product JSON with `showcasePagePath` field
- /api/showcase/pages/flora returns HTML content

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document custom showcase pages"
```

---

## Plan Self-Review

- **Coverage:**
  - Spec §1 (scope) — Tasks 1-8.
  - Spec §3 (data model) — Tasks 1, 2.
  - Spec §4 (backend) — Tasks 2, 3.
  - Spec §5 (frontend) — Tasks 5, 6.
  - Spec §6 (file structure) — All tasks.
  - Spec §7 (data flow) — Tasks 3, 5.
  - Spec §8 (integrations) — Tasks 5, 6.
  - Spec §9 (example HTML) — Task 4.
  - Spec §10 (testing) — Tasks 1, 2, 3, 7.
  - Spec §11 (risks) — Mitigated in Task 3 (`path.resolve` + `startsWith`) and Task 5 (origin check).
  - Spec §12 (5-stage implementation) — Mapped to Tasks 1-8.
  - Spec §13 (out of scope) — Confirmed: no iframe auto-resize, no hot-reload, no editor, etc.
- **No placeholder steps:** every code block is complete and runnable.
- **Type consistency:**
  - `Product.showcasePagePath?: string` (Task 1) consumed by `mapProduct` (Task 2) as `r.showcase_page_path || ''` (preserves undefined → '')
  - `PublicProduct.showcasePagePath: string` (Task 1) returned by `mapPublicProduct` (Task 2), exposed via `fetchShowcaseProduct` (no fetcher changes needed)
  - `ProductFormValues.showcasePagePath: string` (Task 6) flows into `mergeProductValues` → `Product.showcasePagePath` → `mapPublicProduct` → `PublicProduct.showcasePagePath` → `ProductShowcaseFrame` (consumed in Task 5)
  - `resolveShowcasePath` (Task 1) used by API route in Task 3.
  - `readShowcasePage` (Task 1) used by API route in Task 3.
- **TDD discipline:** Tasks 1, 2, 3, 7 all write failing tests first.
- **Idempotency:** Each task ends with a clean commit; subsequent tasks build on a green baseline.