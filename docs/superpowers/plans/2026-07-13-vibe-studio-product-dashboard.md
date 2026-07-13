# Vibe Studio 产品看板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Build a desktop-first Vibe Studio Web app that centrally manages products, requirements, Bugs, versions and Markdown documents.

**Architecture:** Implement a Vite React SPA. React Router separates the product-card overview from product detail tabs. A typed repository is the only storage boundary and initially persists to browser localStorage; overview data is derived from the underlying product, work-item and version records.

**Tech Stack:** React 18, TypeScript, Vite, React Router, @dnd-kit, react-markdown, rehype-sanitize, Vitest, React Testing Library, CSS modules.

---

## File structure

~~~text
src/
  app/App.tsx                         # Routes and selected product lifecycle
  app/AppShell.tsx                    # Sidebar, header and main layout
  domain/models.ts                    # Typed domain records and status unions
  domain/productMetrics.ts            # Pure summary derivation
  data/studioRepository.ts            # localStorage-backed CRUD boundary
  data/seedStudio.ts                  # First-run sample data
  features/products/ProductGrid.tsx   # Product overview and creation
  features/products/ProductOverview.tsx
  features/tasks/TaskBoard.tsx        # Requirements/Bug board
  features/versions/VersionList.tsx   # Manual version management
  features/documents/DocumentWorkspace.tsx
  features/settings/ProductSettings.tsx
  styles/                             # Focused CSS modules
tests/
  domain/productMetrics.test.ts
  data/studioRepository.test.ts
  features/ProductGrid.test.tsx
  features/TaskBoard.test.tsx
  features/VersionList.test.tsx
  features/DocumentWorkspace.test.tsx
  app/ProductLifecycle.test.tsx
~~~

## Task 1: Bootstrap the React application and test harness

**Files:**
- Create: \`package.json\`, \`vite.config.ts\`, \`src/main.tsx\`, \`src/test/setup.ts\`
- Create: \`src/app/App.tsx\`, \`tests/app/App.test.tsx\`

- [ ] **Step 1: Initialize git and commit the approved design materials.**

~~~bash
git init
git add docs/superpowers/specs/2026-07-13-vibe-studio-product-dashboard-design.md docs/superpowers/plans/2026-07-13-vibe-studio-product-dashboard.md
git commit -m "docs: add Vibe Studio design and plan"
~~~

Expected: a root commit contains the approved documents.

- [ ] **Step 2: Create the Vite TypeScript workspace and install the selected packages.**

~~~bash
npm create vite@latest . -- --template react-ts
npm install react-router-dom @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities react-markdown rehype-sanitize
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
~~~

- [ ] **Step 3: Write the failing application test.**

Create \`tests/app/App.test.tsx\`:

~~~tsx
import { render, screen } from '@testing-library/react';
import { App } from '../../src/app/App';

it('renders the product overview', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: '产品总览' })).toBeInTheDocument();
});
~~~

- [ ] **Step 4: Confirm the test fails.**

Run: \`npm test -- --run tests/app/App.test.tsx\`

Expected: FAIL because \`App\` is not implemented.

- [ ] **Step 5: Implement the minimum entry component and test configuration.**

Create \`src/app/App.tsx\`:

~~~tsx
export function App() {
  return <h1>产品总览</h1>;
}
~~~

Create \`src/main.tsx\`:

~~~tsx
import ReactDOM from 'react-dom/client';
import { App } from './app/App';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
~~~

Configure Vitest for \`jsdom\` and import \`@testing-library/jest-dom/vitest\` from \`src/test/setup.ts\`.

- [ ] **Step 6: Verify and commit.**

~~~bash
npm test -- --run tests/app/App.test.tsx
npm run build
git add package.json package-lock.json vite.config.ts src tests
git commit -m "chore: bootstrap Vibe Studio web app"
~~~

Expected: test and production build pass.

## Task 2: Add domain records, metric derivation and local persistence

**Files:**
- Create: \`src/domain/models.ts\`, \`src/domain/productMetrics.ts\`
- Create: \`src/data/studioRepository.ts\`, \`src/data/seedStudio.ts\`
- Create: \`tests/domain/productMetrics.test.ts\`, \`tests/data/studioRepository.test.ts\`

- [ ] **Step 1: Write the failing metric test.**

~~~ts
import { deriveProductMetrics } from '../../src/domain/productMetrics';

it('counts only unfinished requirements and Bugs', () => {
  const metrics = deriveProductMetrics(
    { id: 'flora', name: 'Flora', status: 'developing', completionPercent: 72, userCount: 205, userCountSource: 'App Store', archivedAt: null },
    [
      { id: 'r1', productId: 'flora', type: 'requirement', title: 'Sync', priority: 'high', dueDate: null, status: 'todo' },
      { id: 'b1', productId: 'flora', type: 'bug', title: 'Crash', priority: 'urgent', dueDate: null, status: 'in_progress' },
      { id: 'r2', productId: 'flora', type: 'requirement', title: 'Search', priority: 'low', dueDate: null, status: 'done' },
    ],
    [],
  );
  expect(metrics).toMatchObject({ openRequirementCount: 1, openBugCount: 1, currentVersion: '—' });
});
~~~

- [ ] **Step 2: Run it and confirm it fails.**

Run: \`npm test -- --run tests/domain/productMetrics.test.ts\`

Expected: FAIL because the function is absent.

- [ ] **Step 3: Define stable types and implement the pure metric function.**

In \`src/domain/models.ts\`, define:
- \`ProductStatus = 'developing' | 'beta' | 'released' | 'archived'\`
- \`WorkItemType = 'requirement' | 'bug'\`
- \`WorkItemStatus = 'todo' | 'in_progress' | 'done'\`
- \`VersionStatus = 'planned' | 'released'\`
- \`Product\`, \`WorkItem\`, \`ProductVersion\`, and \`MarkdownDocument\` interfaces with string IDs and ISO timestamp strings.

In \`src/domain/productMetrics.ts\`, implement:

~~~ts
export function deriveProductMetrics(product: Product, items: WorkItem[], versions: ProductVersion[]) {
  const activeItems = items.filter((item) => item.status !== 'done');
  const released = versions.filter((version) => version.status === 'released')
    .sort((a, b) => b.releasedAt.localeCompare(a.releasedAt))[0];
  return {
    completionPercent: product.completionPercent,
    userCount: product.userCount,
    openRequirementCount: activeItems.filter((item) => item.type === 'requirement').length,
    openBugCount: activeItems.filter((item) => item.type === 'bug').length,
    currentVersion: released?.number ?? '—',
  };
}
~~~

- [ ] **Step 4: Write the failing repository round-trip test.**

~~~ts
import { createStudioRepository } from '../../src/data/studioRepository';

it('persists a product through the storage boundary', () => {
  const repository = createStudioRepository(window.localStorage);
  repository.reset();
  repository.saveProduct({ id: 'p1', name: 'Text War', status: 'beta', completionPercent: 60, userCount: 532, userCountSource: 'manual', archivedAt: null });
  expect(repository.listProducts()).toEqual([expect.objectContaining({ id: 'p1', name: 'Text War' })]);
});
~~~

- [ ] **Step 5: Implement the repository.**

\`createStudioRepository(storage: Storage)\` must namespace records under \`vibe-studio:v1\`, accept the injected \`Storage\` (never access \`window\` directly), provide typed list/save/delete methods for each record type and a \`reset()\` method. Seed the sample products only when the namespace has no persisted payload.

- [ ] **Step 6: Verify and commit.**

~~~bash
npm test -- --run tests/domain/productMetrics.test.ts tests/data/studioRepository.test.ts
git add src/domain src/data tests/domain tests/data
git commit -m "feat: add Studio domain and local persistence"
~~~

Expected: both tests pass.

## Task 3: Deliver navigation, card overview, product detail, and settings

**Files:**
- Create: \`src/app/AppShell.tsx\`, \`src/features/products/ProductGrid.tsx\`
- Create: \`src/features/products/ProductDialog.tsx\`, \`src/features/products/ProductOverview.tsx\`
- Create: \`src/features/settings/ProductSettings.tsx\`
- Modify: \`src/app/App.tsx\`
- Create: \`tests/features/ProductGrid.test.tsx\`, \`tests/features/ProductSettings.test.tsx\`

- [ ] **Step 1: Write the failing card-to-detail test.**

~~~tsx
it('opens a selected product detail from its overview card', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('link', { name: /Flora/ }));
  expect(await screen.findByRole('heading', { name: 'Flora' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: '概览' })).toBeInTheDocument();
});
~~~

- [ ] **Step 2: Confirm it fails.**

Run: \`npm test -- --run tests/features/ProductGrid.test.tsx\`

Expected: FAIL because routes and cards do not exist.

- [ ] **Step 3: Build routes and the constrained sidebar.**

Use \`BrowserRouter\` with \`/products\` and \`/products/:productId/:tab?\`. The sidebar has only the active 产品 entry, optional product shortcuts, Settings, and an inaccessible disabled label \`数据与运营（即将推出）\`. Do not add experiments, resources, AI, data analytics, or design navigation.

- [ ] **Step 4: Implement cards and product creation.**

\`ProductGrid\` displays non-archived product cards with icon, name, description, status, unfinished requirement count, open Bug count, user count, current version and updated time. \`ProductDialog\` requires a unique non-empty name and accepts description, type, status, icon, completion percent, user count, user-count source and optional HTTPS app link. After saving, navigate to its overview.

- [ ] **Step 5: Implement exactly five product tabs and overview aggregation.**

Tabs must be ordered \`概览\`, \`任务\`, \`版本\`, \`文档\`, \`设置\`. \`ProductOverview\` gets precomputed metrics as props and renders status, description, manual completion percentage, open requirement/Bug counts, user count, current version and updated time. An unknown or archived ID shows \`产品不存在或已归档\` with a link to 产品总览.

- [ ] **Step 6: Write and implement settings validation.**

Test:

~~~tsx
it('updates the manual user count and data source', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('link', { name: /Flora/ }));
  await user.click(screen.getByRole('tab', { name: '设置' }));
  await user.clear(screen.getByLabelText('用户量'));
  await user.type(screen.getByLabelText('用户量'), '250');
  await user.type(screen.getByLabelText('统计口径 / 来源'), 'App Store Connect');
  await user.click(screen.getByRole('button', { name: '保存设置' }));
  expect(screen.getByText('250')).toBeInTheDocument();
});
~~~

\`ProductSettings\` must validate an integer completion percentage in \`0..100\`, non-negative integer user count, and blank-or-HTTPS URL. Archive requires a confirmation dialog, sets \`archivedAt\`, and returns to \`/products\`.

- [ ] **Step 7: Add the visual system, verify and commit.**

Use a pale neutral canvas, white rounded cards, blue-violet primary actions and responsive desktop grid in focused CSS modules.

~~~bash
npm test -- --run tests/features/ProductGrid.test.tsx tests/features/ProductSettings.test.tsx
npm run build
git add src/app src/features/products src/features/settings src/styles tests/features
git commit -m "feat: add product workspace and settings"
~~~

Expected: all tests and build pass.

## Task 4: Implement requirements/Bug Kanban and manual versions

**Files:**
- Create: \`src/features/tasks/TaskBoard.tsx\`, \`src/features/tasks/TaskDialog.tsx\`
- Create: \`src/features/versions/VersionList.tsx\`, \`src/features/versions/VersionDialog.tsx\`
- Create: \`tests/features/TaskBoard.test.tsx\`, \`tests/features/VersionList.test.tsx\`

- [ ] **Step 1: Write failing task-board tests.**

~~~tsx
it('filters to Bugs and persists a status change', async () => {
  const user = userEvent.setup();
  render(<TaskBoard productId="flora" />);
  await user.click(screen.getByRole('button', { name: 'Bug' }));
  expect(screen.getByText('同步失败')).toBeInTheDocument();
  expect(screen.queryByText('日记搜索')).not.toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText('同步失败状态'), 'in_progress');
  expect(screen.getByRole('heading', { name: '进行中' })).toHaveTextContent('1');
});
~~~

- [ ] **Step 2: Confirm it fails.**

Run: \`npm test -- --run tests/features/TaskBoard.test.tsx\`

Expected: FAIL because TaskBoard is absent.

- [ ] **Step 3: Implement the requirements/Bug-only Kanban.**

Render fixed columns \`待处理\`, \`进行中\`, and \`已完成\`, plus filters \`全部\`, \`需求\`, and \`Bug\`. Task creation requires title, restricts type to \`requirement\` or \`bug\`, accepts priority and optional due date, and starts in \`todo\`. Use @dnd-kit to persist drag changes and include a per-card labelled status select for keyboard access. Counts on the overview must be recomputed after every mutation and exclude \`done\` items.

- [ ] **Step 4: Write failing version publishing test.**

~~~tsx
it('uses a released version as the current version', async () => {
  const user = userEvent.setup();
  render(<VersionList productId="flora" />);
  await user.click(screen.getByRole('button', { name: '新建版本' }));
  await user.type(screen.getByLabelText('版本号'), 'v0.8.2');
  await user.selectOptions(screen.getByLabelText('状态'), 'released');
  await user.click(screen.getByRole('button', { name: '保存版本' }));
  expect(screen.getByText('当前版本：v0.8.2')).toBeInTheDocument();
});
~~~

- [ ] **Step 5: Implement manual version records.**

Require a version number and status; accept release date and change notes. A released version without a date uses today’s ISO date. List newest first and derive the displayed current version from the newest released record. Do not validate semantic-version format or call Git/app-store services.

- [ ] **Step 6: Verify and commit.**

~~~bash
npm test -- --run tests/features/TaskBoard.test.tsx tests/features/VersionList.test.tsx tests/domain/productMetrics.test.ts
npm run build
git add src/features/tasks src/features/versions tests/features
git commit -m "feat: add tasks and manual versions"
~~~

Expected: tests and build pass.

## Task 5: Implement safe Markdown documents and final integration

**Files:**
- Create: \`src/features/documents/DocumentWorkspace.tsx\`
- Create: \`tests/features/DocumentWorkspace.test.tsx\`, \`tests/app/ProductLifecycle.test.tsx\`
- Modify: \`src/app/App.tsx\`, \`README.md\`

- [ ] **Step 1: Write failing document validation and preview tests.**

~~~tsx
it('rejects a non-Markdown upload', async () => {
  const user = userEvent.setup();
  render(<DocumentWorkspace productId="flora" />);
  await user.upload(screen.getByLabelText('上传 Markdown 文档'), new File(['binary'], 'brief.pdf'));
  expect(screen.getByRole('alert')).toHaveTextContent('仅支持 .md 或 .markdown 文件');
});

it('renders an uploaded Markdown heading', async () => {
  const user = userEvent.setup();
  render(<DocumentWorkspace productId="flora" />);
  await user.upload(screen.getByLabelText('上传 Markdown 文档'), new File(['# 产品文档'], 'prd.md'));
  expect(await screen.findByRole('heading', { name: '产品文档' })).toBeInTheDocument();
});
~~~

- [ ] **Step 2: Confirm the tests fail.**

Run: \`npm test -- --run tests/features/DocumentWorkspace.test.tsx\`

Expected: FAIL because DocumentWorkspace is absent.

- [ ] **Step 3: Implement Markdown-only storage and preview.**

Accept only filenames ending in \`.md\` or \`.markdown\` case-insensitively, read with \`File.text()\`, and save content plus product ID and timestamps. Render a document list (name/uploaded/updated) and selected preview using \`ReactMarkdown\` plus \`rehype-sanitize\`. On matching name, require a choice between \`覆盖现有文档\` and \`另存为新文档\`; overwrite retains ID while save-as-new appends \`-副本\` before the extension. Preserve source content and show an error state if render fails.

- [ ] **Step 4: Write the failing complete lifecycle test.**

~~~tsx
it('creates a product and exposes all five detail tabs', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: '新建产品' }));
  await user.type(screen.getByLabelText('产品名称'), 'Focus Timer');
  await user.click(screen.getByRole('button', { name: '创建产品' }));
  expect(await screen.findByRole('heading', { name: 'Focus Timer' })).toBeInTheDocument();
  for (const name of ['概览', '任务', '版本', '文档', '设置']) {
    expect(screen.getByRole('tab', { name })).toBeInTheDocument();
  }
});
~~~

- [ ] **Step 5: Integrate and document local-first constraints.**

Wire all five tabs in \`App.tsx\`, reload repository data after mutations at the detail-route boundary, and add README commands:

~~~bash
npm install
npm run dev
npm test -- --run
npm run build
~~~

State that data and Markdown contents are stored in browser localStorage, therefore isolated to that browser, clearable by the user, and intended only for small Markdown documents. Server-side storage is required for production or large files.

- [ ] **Step 6: Run full verification and commit.**

~~~bash
npm test -- --run
npm run build
git add src/features/documents src/app/App.tsx README.md tests
git commit -m "feat: complete Vibe Studio product dashboard"
~~~

Expected: all tests pass and the production build has no TypeScript errors.

## Plan Self-Review

- Spec coverage: Tasks 3–5 cover the product-only sidebar, card overview, five detail tabs, requirements/Bug Kanban, manual versions, Markdown-only documents, settings, archive and manual user metrics. Explicitly excluded AI, design, analytics, experiments and external integrations are not implemented.
- Placeholder scan: the task sequence names each file, exact behavior, test command and commit boundary.
- Type consistency: all task and version status literals originate in Task 2, and only \`deriveProductMetrics\` computes product counts and current version.

