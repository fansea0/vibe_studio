# Vibe Studio SQLite 与 Git 更新 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans (required). Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Replace browser localStorage persistence with SQLite-backed local APIs, run Vite on port 6000, and display each product's latest Git commits with a one-minute refresh.

**Architecture:** React remains the browser client. Vite Node middleware exposes JSON APIs backed by a better-sqlite3 repository; a safe Git service uses execFile to read commit metadata. The browser consumes API data and a separate commit-polling hook. No old localStorage data is migrated or read.

**Tech Stack:** React/TypeScript/Vite 7, Node 22.12+, better-sqlite3, Vitest, React Testing Library, execFile from node:child_process.

---

## File structure

~~~text
src/server/sqlite.ts             # SQLite connection, schema, seed, typed CRUD
src/server/api.ts                # JSON API routes and status mapping
src/server/gitLog.ts             # Safe git log parser
src/server/viteApiPlugin.ts      # Vite configureServer middleware
src/client/api.ts                 # Browser fetch client
src/client/useProductData.ts      # API resource and mutation state
src/client/useCommitPolling.ts    # Immediate + 60-second commit polling
src/app/App.tsx                   # API-backed app state
src/app/ProductGrid.tsx           # Latest commit summary on cards
src/app/ProductDetail.tsx         # Recent commits in overview
src/app/ProductSettings.tsx        # Local Git repository path
vite.config.ts                    # Port 6000 and API plugin
data/.gitkeep                     # SQLite directory marker
tests/server/*                    # Schema, API and Git tests
tests/client/*                    # Fetch and polling tests
tests/app/*Sqlite*                # API-backed lifecycle tests
~~~

## Task 1: Add SQLite schema, repository, and seed data

**Files:**
- Create: src/server/sqlite.ts, data/.gitkeep, tests/server/sqlite.test.ts
- Modify: src/domain/models.ts, .gitignore, package.json

- [ ] **Step 1: Write failing schema and transaction tests.**

~~~ts
it('creates tables and seeds three products', () => {
  const repo = createSqliteRepository(':memory:')
  expect(repo.listProducts()).toHaveLength(3)
  expect(repo.tableNames()).toEqual(
    expect.arrayContaining(['products', 'work_items', 'versions', 'documents']),
  )
})

it('rolls back a child insert failure', () => {
  const repo = createSqliteRepository(':memory:')
  expect(() => repo.transaction(() => {
    repo.insertProduct(validProduct)
    repo.insertWorkItem({ ...validWorkItem, productId: 'missing' })
  })).toThrow()
  expect(repo.findProduct(validProduct.id)).toBeNull()
})
~~~

Run: npm test -- --run tests/server/sqlite.test.ts
Expected: FAIL because src/server/sqlite.ts is absent.

- [ ] **Step 2: Implement createSqliteRepository(filename).**

Use parameterized SQL, foreign keys, NOT NULL/default fields and indexes. Create products, work_items, versions and documents. Seed Flora, ResumeGenius and Text War only when products is empty. Add repository methods for product CRUD/archive/restore, work-item CRUD, version CRUD, document CRUD, product summaries and transaction. Enforce product/document normalized-name uniqueness, foreign keys, enum values, release invariants, Markdown extension and 512 KiB UTF-8 limit. Throw typed errors VALIDATION_FAILED, NOT_FOUND, CONFLICT and DUPLICATE. Add repositoryPath to Product.

- [ ] **Step 3: Run repository tests, then commit.**

Run: npm test -- --run tests/server/sqlite.test.ts
Expected: schema, seed, CRUD, rollback and constraint tests pass.

~~~bash
git add package.json package-lock.json .gitignore data/.gitkeep src/domain/models.ts src/server/sqlite.ts tests/server/sqlite.test.ts
git commit -m "feat: add SQLite persistence repository"
~~~

## Task 2: Add safe Git log API and port 6000

**Files:**
- Create: src/server/gitLog.ts, src/server/api.ts, src/server/viteApiPlugin.ts
- Modify: vite.config.ts, package.json
- Create: tests/server/gitLog.test.ts, tests/server/api.test.ts

- [ ] **Step 1: Write failing Git and API tests.**

Create a temporary Git fixture with two commits. Assert newest-first parsing into sha, shortSha, author, committedAt and subject. Assert a path containing shell characters is rejected without creating a file. API tests must cover product summaries, commits, 400 invalid limit, 404 product, 409 conflict and structured Git errors.

- [ ] **Step 2: Implement readGitLog(repositoryPath, limit).**

Require an absolute existing directory, call execFile('git', ['-C', path, 'rev-parse', '--is-inside-work-tree']), then execFile with log, date=iso-strict and tab-separated pretty format. Cap limit at 20; map invalid repository to GIT_REPOSITORY_INVALID and command failures to GIT_READ_FAILED. Never use shell:true or a concatenated command string.

- [ ] **Step 3: Implement JSON API routes.**

Implement GET/POST/PATCH products; archive/restore; work-item GET/POST/PATCH; version GET/POST; document GET/POST/PATCH; and GET products/:id/commits?limit=5. Use parameterized repository calls and response envelopes data or error. Return 200/201/400/404/409/500. Git errors must not alter SQLite data.

- [ ] **Step 4: Integrate Vite and verify.**

Set server.port=6000 and server.strictPort=true. Register one SQLite repository/API middleware per Vite process and close the DB on shutdown. Run:

~~~bash
npm test -- --run tests/server/gitLog.test.ts tests/server/api.test.ts
npm run dev -- --host 127.0.0.1
curl -fsS http://127.0.0.1:6000/api/products
~~~

Expected: tests pass, Vite prints port 6000, curl returns seeded product JSON.

~~~bash
git add src/server vite.config.ts package.json package-lock.json tests/server
git commit -m "feat: add SQLite API and Git commit service"
~~~

## Task 3: Switch the client from localStorage to SQLite APIs

**Files:**
- Create: src/client/api.ts, src/client/useProductData.ts, tests/app/AppSqlite.test.tsx
- Modify: src/app/App.tsx, src/app/ProductDialog.tsx, src/app/ProductSettings.tsx, src/app/ProductDetail.tsx, src/domain/models.ts

- [ ] **Step 1: Write failing API-backed lifecycle tests.**

Mock global fetch with API response envelopes, not repository objects. Assert App loads products from GET /api/products, settings saves an absolute Local Git repository path with PATCH and expected updated_at, and API 409 leaves the draft visible with an alert.

- [ ] **Step 2: Implement typed client and data hook.**

Export getProducts, getProductData, saveProduct, saveWorkItem, saveVersion, saveDocument, archiveProduct and restoreProduct. Parse data/error envelopes and map non-2xx to ClientApiError. useProductData owns loading/error, aborts stale GETs, refreshes after successful mutations and never accesses localStorage or SQLite.

- [ ] **Step 3: Replace App and forms.**

Remove createStudioRepository from App. Add Product.repositoryPath and a validated “本地 Git 仓库路径” field. Pass API snapshots and mutation callbacks to the existing five-tab UI. Keep draft state on commit refresh and show structured API errors.

- [ ] **Step 4: Verify and commit client migration.**

Run: npm test -- --run tests/app/AppSqlite.test.tsx tests/app/App.test.tsx tests/app/TasksVersions.test.tsx tests/app/AppDocuments.test.tsx
Expected: API-backed tests pass and no App path imports the local repository.

~~~bash
git add src/client src/app src/domain/models.ts tests/app/AppSqlite.test.tsx
git commit -m "feat: switch dashboard to SQLite API"
~~~

## Task 4: Add commit summaries and 60-second polling

**Files:**
- Create: src/client/useCommitPolling.ts, tests/client/useCommitPolling.test.tsx
- Modify: src/app/ProductGrid.tsx, src/app/ProductDetail.tsx, src/app/App.tsx, src/styles/global.css

- [ ] **Step 1: Write failing timer tests.**

~~~tsx
it('loads immediately, refreshes at 60 seconds and aborts on unmount', async () => {
  vi.useFakeTimers()
  const fetchCommits = vi.fn()
    .mockResolvedValueOnce({ items: [{ subject: 'initial' }] })
    .mockResolvedValueOnce({ items: [{ subject: 'next' }] })
  const view = renderHook(() => useCommitPolling('p1', fetchCommits))
  expect(await screen.findByText('initial')).toBeInTheDocument()
  await act(async () => { vi.advanceTimersByTime(60_000) })
  expect(fetchCommits).toHaveBeenCalledTimes(2)
  view.unmount()
  expect(abortSpy).toHaveBeenCalled()
})
~~~

- [ ] **Step 2: Implement useCommitPolling.**

Fetch immediately on product change, use setInterval(60000), skip overlapping requests, pass AbortController.signal, clear/abort on cleanup, and expose commits, checkedAt, loading and non-fatal error.

- [ ] **Step 3: Add both UI surfaces.**

Cards show latest subject, short SHA and relative time. Product overview shows five commits with author/date. Render all Git fields as text. Display “暂无 Git 更新” or a retryable error. Polling must not reload tasks, versions, documents or active drafts.

- [ ] **Step 4: Verify and commit.**

Run: npm test -- --run tests/client/useCommitPolling.test.tsx tests/app/AppSqlite.test.tsx
Expected: immediate load, one request per minute, cleanup, error fallback and card/detail rendering pass.

~~~bash
git add src/client/useCommitPolling.ts src/app/ProductGrid.tsx src/app/ProductDetail.tsx src/app/App.tsx src/styles/global.css tests/client/useCommitPolling.test.tsx
git commit -m "feat: show and poll Git commit updates"
~~~

## Task 5: Documentation, database guardrails and full verification

**Files:**
- Modify: README.md, .gitignore
- Create: tests/server/portAndDatabase.test.ts, tests/app/SqliteLifecycle.test.tsx

- [ ] **Step 1: Write failing guardrail tests.**

Assert Vite server port is 6000 and .gitignore contains data/*.sqlite, data/*.sqlite-shm and data/*.sqlite-wal. Assert the lifecycle can create a product, save a task/version/document through the API and reload it.

- [ ] **Step 2: Update README and ignore rules.**

Document npm install, npm run dev, http://localhost:6000, data/vibe-studio.sqlite, backup guidance, no localStorage migration, absolute Git repository paths, Git errors, 60-second polling, BrowserRouter SPA fallback and Node 22.12+. Keep SQLite files ignored but data/.gitkeep tracked.

- [ ] **Step 3: Run complete verification and smoke test.**

~~~bash
npm test -- --run
npm run typecheck:test
npm run build
npm run lint
git diff --check
npm run dev -- --host 127.0.0.1
curl -fsS http://127.0.0.1:6000/api/products
curl -fsS 'http://127.0.0.1:6000/api/products/<id>/commits?limit=5'
~~~

Expected: all tests/build/typecheck/lint pass; API returns JSON; Git errors are structured and do not change SQLite.

- [ ] **Step 4: Commit final integration.**

~~~bash
git add README.md .gitignore tests/server/portAndDatabase.test.ts tests/app/SqliteLifecycle.test.tsx
git commit -m "docs: finalize SQLite and Git update workflow"
~~~

## Plan Self-Review

- Coverage: Task 1 schema/seed/transactions; Task 2 API, safe Git, and port; Task 3 SQLite-only client; Task 4 immediate/60-second polling and card/detail UI; Task 5 database ignore rules, README and end-to-end checks.
- No migration task is present by design.
- No placeholder steps remain; each task has concrete paths, commands, assertions and commit boundaries.
- Product repositoryPath and CommitSummary types are introduced before the API client and polling tasks that consume them.

