# Vibe Studio 自定义作品展示页设计

## 1. 目标与首期范围

为已实现的 `/showcase` 作品集增加**自定义作品详情页**能力：每个公开产品可以挂一个由用户手写的独立 HTML 文件，详情页用 iframe 加载并通过 postMessage 注入产品数据。HTML 在沙箱中运行（无 `allow-same-origin`），可以自由写 CSS/JS/动画/交互演示，但拿不到主站的 cookie/localStorage。

首期交付范围：

- **`Product.showcasePagePath`** 新字段，可选填，默认空字符串。
- **`PublicProduct.showcasePagePath`** 字段透传，公开 API 返回。
- **新 API** `GET /api/showcase/pages/:productId` —— 返回 HTML 内容，受 `isPublic` 过滤保护 + 路径解析防越权。
- **新组件** `ProductShowcaseFrame.tsx` —— 渲染 sandboxed iframe，postMessage 注入数据。
- **`ShowcaseDetailPage` 集成**：有 `showcasePagePath` 用新组件；空则 fallback 到原 description 文本。
- **工作台表单** —— 产品设置/新建对话框增加 "自定义作品页路径" 输入框。
- **示例 HTML** —— `data/products/flora/showcase.html` 作为可参考、可删除的 demo；在 Flora 产品上启用作为首个 demo。

**不在首期范围**：iframe 自适应高度、HTML 文件热重载、富文本/Markdown 写作模式、SEO 优化（HTML 在 iframe 内对搜索引擎不可见）、后台编辑器。

## 2. 目标用户与使用方式

**目标用户**：vibe 工作室主本人，希望把每个作品作为独立产品页对外展示，能写 CSS 动画、3D demo、视频嵌入、交互式截图等丰富内容。

**使用方式**：
1. 在 `data/products/<product-id>/showcase.html` 写 HTML（任意编辑器）
2. 在工作台 → 产品设置 → 填入路径
3. 重启 dev server（Vite 需要重新读取新文件）
4. 访问 `/showcase/<product-id>` 看到自定义作品页

**访客体验**：进入 `/showcase/<id>`，看到主外壳（Hero + breadcrumb + 作品名称 + 联系方式 footer），中间嵌入 iframe 展示作品。

## 3. 数据模型

### 3.1 Product 新增字段

```ts
export interface Product {
  // ... 现有所有字段
  showcasePagePath?: string  // 新增，可选；空字符串表示使用默认详情页
}
```

### 3.2 PublicProduct 新增字段

```ts
export interface PublicProduct {
  // ... 现有字段
  showcasePagePath: string  // 新增；空字符串表示使用默认详情页
}
```

`PublicProduct` 暴露该字段是必要的：详情页要决定渲染 iframe 还是 fallback；如果未来首页卡片想展示"自定义"角标也能复用。

### 3.3 SQLite 列

```sql
ALTER TABLE products ADD COLUMN showcase_page_path TEXT NOT NULL DEFAULT ''
```

迁移沿用现有 `try { ALTER TABLE ... } catch { }` 风格（参照 `sqlite.ts:148`）。

### 3.4 文件存储约定

```
data/
└── products/
    └── <product-id>/
        └── showcase.html    ← 自定义作品页（用户手写）
```

每个产品一个目录，目录名 = product id（已有 `createProductId` 生成规则保证唯一性）。HTML 文件名固定 `showcase.html`。

## 4. 后端实现

### 4.1 现有接口扩展

`ProductInput` / `createProduct` / `updateProduct` / `mapProduct` 都需要支持 `showcase_page_path` 列。和 `isPublic` 的处理方式完全一致 —— 透传读写。

`validateProduct`（`api.ts:8`）增加 3 条校验：

```ts
if (b.showcasePagePath !== undefined && typeof b.showcasePagePath !== 'string')
  throw new RepositoryError('VALIDATION_FAILED', 'showcasePagePath')
if (b.showcasePagePath !== undefined && b.showcasePagePath.includes('..'))
  throw new RepositoryError('VALIDATION_FAILED', 'showcasePagePath')
if (b.showcasePagePath !== undefined && b.showcasePagePath.startsWith('/'))
  throw new RepositoryError('VALIDATION_FAILED', 'showcasePagePath')
```

不校验路径必须存在 —— 写时文件可以暂时没创建，详情页加载时再校验。

### 4.2 新模块 `src/server/showcasePage.ts`

导出 2 个函数：

```ts
// 安全路径解析（防越权核心逻辑）
export function resolveShowcasePath(productId: string, configuredPath: string): string {
  if (!SAFE_ID.test(productId)) throw new RepositoryError('NOT_FOUND', 'product')
  const full = path.resolve(process.cwd(), configuredPath)
  const expectedPrefix = path.resolve(process.cwd(), 'data/products', productId) + path.sep
  if (!full.startsWith(expectedPrefix)) throw new RepositoryError('VALIDATION_FAILED', 'showcasePagePath')
  return full
}

// 文件读取（ENOENT 抛 NOT_FOUND）
export async function readShowcasePage(filePath: string): Promise<string> {
  return readFile(filePath, 'utf8').catch(() => {
    throw new RepositoryError('NOT_FOUND', 'showcase page')
  })
}
```

`SAFE_ID = /^[a-z0-9-_]+$/i` —— 拒绝含 `..` / `/` / 特殊字符的 productId，防止路径穿越。

### 4.3 新 API 路由

```
GET /api/showcase/pages/:productId
  → 返回 showcase.html 内容，Content-Type: text/html; charset=utf-8
  → 404 { error: { code: 'NOT_FOUND', message: '作品未公开或不存在' } }
```

注册位置：`api.ts` 的 showcase 分支里。逻辑：

```ts
const m = p.match(/^\/api\/showcase\/pages\/([^/]+)$/)
if (m) {
  if (method !== 'GET') throw Object.assign(new Error('方法不允许'), { status: 405 })
  const id = m[1]
  const product = repository.getPublicProduct(id)
  if (!product?.showcasePagePath) return send(res, 404, { error: { code: 'NOT_FOUND', message: '作品未公开或不存在' } })
  const filePath = resolveShowcasePath(id, product.showcasePagePath)
  const content = await readShowcasePage(filePath)
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.end(content)
  return
}
```

**关键安全点**：
- 必须经过 `repository.getPublicProduct(id)` —— 自动应用 `is_public=1 AND is_deleted=0 AND status!=3` 过滤
- 即使 `showcasePagePath` 字段被设了，私密产品也会被过滤掉
- `resolveShowcasePath` 做二次校验，防止 DB 里的字段被污染成 `../../etc/passwd`

### 4.4 405 处理

路由里如果 `method !== 'GET'` 抛 `Object.assign(new Error('方法不允许'), { status: 405 })`，复用 Task 2 的 `rejectIfNotGet` 模式。

## 5. 前端实现

### 5.1 新组件 `src/app/showcase/ProductShowcaseFrame.tsx`

```tsx
interface Props { product: PublicProduct }

export function ProductShowcaseFrame({ product }: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [reloadKey, setReloadKey] = useState(0)

  if (!product.showcasePagePath) return null

  const src = `/api/showcase/pages/${encodeURIComponent(product.id)}`

  const handleLoad = () => {
    setLoadState('ready')
    const iframe = iframeRef.current?.contentWindow
    if (!iframe) return
    iframe.postMessage(
      { type: 'vibe-studio:showcase-data', product },
      window.location.origin,
    )
  }

  useEffect(() => {
    const handler = (event: MessageEvent) => {
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
        <div className={`showcase-frame-state showcase-frame-${loadState}`}>
          {loadState === 'loading' && <p>正在加载作品页...</p>}
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
        title={`${product.name} 作品展示`}
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

### 5.2 关键设计点

**sandbox 策略**：
- ✅ `allow-scripts` —— 允许跑 JS（动画、交互、3D）
- ❌ **不加 `allow-same-origin`** —— 跨域，作品页拿不到父页面 cookie/localStorage
- ❌ 不加 `allow-forms` / `allow-popups` / `allow-top-navigation`

**postMessage 协议**：
- 父 → 子：`{ type: 'vibe-studio:showcase-data', product: PublicProduct }` 在 iframe `onLoad` 时推送
- 子 → 父：`{ type: 'vibe-studio:open-url', url: string }` 作品页想跳外链时调用，父页面用 `window.open` 打开（避免沙箱拦截 `target=_blank`）
- 父监听 `message` 时只接受 `event.origin === window.location.origin` 防止恶意 iframe 注入

**iframe 高度**：首期固定 `800px`（移动端 `600px`）+ 内部滚动。不做自适应（spec §13 明确不做）。

### 5.3 `ShowcaseDetailPage` 集成

```tsx
{product.showcasePagePath ? (
  <ProductShowcaseFrame product={product} />
) : (
  <section className="showcase-detail-desc">
    <p>{product.description || '暂无简介'}</p>
  </section>
)}
```

fallback 完全保留 —— 没设 `showcasePagePath` 的产品显示原 description 文本。

### 5.4 CSS 新增

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
.showcase-frame-error button {
  margin-top: 16px;
}
@media (max-width: 900px) {
  .showcase-frame { height: 600px; }
}
```

### 5.5 工作台表单

`ProductFields.tsx` 在 "对外公开" 开关下方增加：

```tsx
<div className="span-2 field">
  <label htmlFor="product-showcasePagePath">
    自定义作品页路径
    <input
      id="product-showcasePagePath"
      type="text"
      name="showcasePagePath"
      value={values.showcasePagePath}
      onChange={change}
      placeholder="data/products/<product-id>/showcase.html"
    />
  </label>
  <small className="field-hint">留空使用默认详情页；需重启 dev server 让 Vite 读取新文件</small>
</div>
```

`productForm.ts` 扩展 `ProductFormValues`：

```ts
export interface ProductFormValues {
  // ... 现有字段
  showcasePagePath: string  // 新增
}
```

更新 `productToFormValues` 和 `mergeProductValues` 透传该字段。

## 6. 文件结构

```
data/
└── products/
    └── flora/
        └── showcase.html       # 新增：示例 HTML（首期 demo）

src/
├── domain/
│   └── models.ts               # 修改：Product + PublicProduct 加 showcasePagePath
├── server/
│   ├── sqlite.ts               # 修改：mapProduct/createProduct/updateProduct + showcase_page_path 列
│   ├── api.ts                  # 修改：validateProduct 校验 + 新路由 /api/showcase/pages/:id
│   └── showcasePage.ts         # 新增：resolveShowcasePath + readShowcasePage
├── client/
│   └── api.ts                  # PublicProduct 类型已包含新字段（无需额外 fetcher）
├── app/
│   ├── showcase/
│   │   ├── ProductShowcaseFrame.tsx   # 新增
│   │   └── ShowcaseDetailPage.tsx     # 修改：集成 ProductShowcaseFrame
│   ├── ProductFields.tsx              # 修改：加 showcasePagePath 输入框
│   └── productForm.ts                 # 修改：ProductFormValues 加字段
└── styles/
    └── showcase.css                   # 修改：加 .showcase-frame + 状态样式

tests/
├── server/
│   ├── showcasePage.test.ts           # 新增：路径解析 + 文件读取
│   └── showcase.test.ts               # 修改：加 2 个 PublicProduct 字段用例
└── app/
    └── showcaseFrame.test.tsx         # 新增：组件渲染 + postMessage spy
```

## 7. 数据流

### 7.1 详情页加载自定义作品

```
/showcase/<product-id>
  ↓ useShowcaseProduct(id) → GET /api/showcase/products/<id>
  ↓ 返回 PublicProduct { ..., showcasePagePath: "data/products/flora/showcase.html" }
  ↓ ShowcaseDetailPage 检查 showcasePagePath 非空
  ↓ 渲染 <ProductShowcaseFrame product={...} />
    ↓ iframe src = /api/showcase/pages/<id>
    ↓ 后端：getPublicProduct(id) → resolveShowcasePath → readShowcasePage → 返回 text/html
    ↓ iframe onLoad → postMessage 推送 showcase-data
    ↓ 作品页 JS 接收数据并渲染
```

### 7.2 作品页跨域 postMessage

```
作品页 JS: parent.postMessage({ type: 'vibe-studio:open-url', url: 'https://flora.example' }, '*')
  ↓ 浏览器转发 message 到父窗口
  ↓ 父窗口 message handler 校验 origin === window.location.origin
  ↓ 校验通过 → window.open(url, '_blank', 'noopener,noreferrer')
```

### 7.3 错误处理

| 情况 | 表现 |
|---|---|
| productId 不存在 / 私密 / 已归档 | `/api/showcase/pages/<id>` 返回 404；`getPublicProduct` 返回 undefined |
| `showcasePagePath` 为空 | `/api/showcase/pages/<id>` 返回 404 |
| 路径解析失败（穿越/绝对路径/非自有目录） | `/api/showcase/pages/<id>` 返回 400 |
| 文件不存在 | `/api/showcase/pages/<id>` 返回 404 |
| iframe 加载错误（网络/CORS） | UI 显示"作品页加载失败"+"重新加载"按钮 |
| 作品页 JS 内部错误 | 沙箱隔离，不影响外壳 |

## 8. 集成改动

### 8.1 `client/api.ts`

`PublicProduct` 类型已包含 `showcasePagePath`（由 `domain/models.ts` 重新导出）。无需新增 fetcher —— 现有 `fetchShowcaseProduct(id)` 已经返回完整 `PublicProduct`。

### 8.2 `ShowcaseDetailPage.tsx`

`ShowcaseDetailPage` 在 description 区域用 ProductShowcaseFrame 替换文本。`useShowcaseProduct` 已返回完整 `PublicProduct`，无需改动。

### 8.3 工作台表单

`ProductSettings.tsx` 和 `ProductDialog.tsx` 都通过共享的 `<ProductFields>` 组件渲染输入框 —— 改一处即可同时影响新建和编辑流程。

## 9. 示例 HTML demo

### 9.1 `data/products/flora/showcase.html`

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>Flora · 自定义作品页示例</title>
    <style>
      body {
        margin: 0;
        padding: 32px;
        font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
        background: linear-gradient(135deg, #f0fff4, #e6fffa);
        color: #1d2130;
      }
      h1 { font-size: 32px; margin: 0 0 16px; }
      .meta { color: #747887; font-size: 14px; margin-bottom: 24px; }
      button {
        padding: 10px 18px; border: 0; border-radius: 10px;
        background: #14845a; color: white; font-weight: 700; cursor: pointer;
      }
      button:hover { background: #0f6d4b; }
    </style>
  </head>
  <body>
    <h1 id="title">加载中…</h1>
    <p class="meta" id="meta">等待父页面推送产品数据…</p>
    <button id="open" style="display:none">访问应用</button>

    <script>
      window.addEventListener('message', (event) => {
        if (event.origin !== 'http://localhost:5173' && event.origin !== window.location.origin) return
        if (event.data?.type !== 'vibe-studio:showcase-data') return
        const { product } = event.data
        document.getElementById('title').textContent = product.name
        document.getElementById('meta').textContent =
          `${product.icon}  ${product.currentVersion}  ·  ${product.userCount.toLocaleString()} 用户`
        const btn = document.getElementById('open')
        if (product.appUrl) {
          btn.style.display = 'inline-block'
          btn.textContent = `访问 ${product.name}`
          btn.onclick = () => parent.postMessage(
            { type: 'vibe-studio:open-url', url: product.appUrl }, '*'
          )
        }
      })
    </script>
  </body>
</html>
```

### 9.2 在 Flora 产品上启用 demo

demo 数据已经在 `sqlite.ts:174` 创建了 Flora 产品（id = `flora`）。在 Flora 上：
- `isPublic = true`
- `showcasePagePath = "data/products/flora/showcase.html"`

可以在 migration 阶段通过 `updateProduct` 设置，或者让用户在 UI 里手动设置。

**首期方案**：在实现阶段的 commit message 里说明 —— 用户可以在工作台手动开启这两个字段。或者在 SQLite seed 里直接给 Flora 启用（让用户立刻看到 demo 效果）。

## 10. 测试策略

### 10.1 新增测试

| 文件 | 覆盖 |
|---|---|
| `tests/server/showcasePage.test.ts` | 路径解析 5 个用例（合法 / `..` / 绝对路径 / 跨产品 / 非安全 id）；文件读取（ENOENT → NOT_FOUND）；端到端 4 个 API 场景 |
| `tests/app/showcaseFrame.test.tsx` | 5 个用例：有 path 渲染 iframe / 无 path 返回 null / src 编码正确 / sandbox 不含 same-origin / onLoad 后 postMessage 被调用 |
| `tests/server/showcase.test.ts`（修改） | 加 2 个用例：PublicProduct 默认 `showcasePagePath=""`；更新后能取回 |

### 10.2 不动现有测试

所有现有 185 个测试继续通过。

### 10.3 运行命令

沿用现有：

```bash
npm run lint
npm test -- --run
npm run typecheck:test
npm run build
```

## 11. 风险与缓解

| # | 风险 | 影响 | 缓解 |
|---|---|---|---|
| R1 | 路径穿越（用户在 UI 填 `../../etc/passwd`） | 高 | 前端 UI 提示 + 服务端二次 `path.resolve` + `startsWith` 校验 |
| R2 | 跨产品访问（A 写 B 的路径） | 中 | productId 必须在 `data/products/<self>/` 下 |
| R3 | iframe 性能（重型动画） | 低 | 固定 800px + 文档建议作者控制文件体积 |
| R4 | HTML 写得太烂影响主站 | 低 | sandbox 完全隔离 + 主页面只渲染外壳 |
| R5 | 数据库字段被污染成绝对路径 | 中 | `validateProduct` 拒绝以 `/` 开头 + 服务端二次解析 |
| R6 | 重启 dev server 才能加载新文件 | 低 | README 说明清楚；后续可考虑文件监听 + 缓存失效 |
| R7 | 恶意 iframe 通过 postMessage 注入父页面 | 中 | 父监听 `event.origin === window.location.origin` 才处理 |
| R8 | Flora 示例 HTML 修改后默认 commit 污染 | 低 | README 标注"这是示例，作者可删" |

## 12. 实施步骤（5 个阶段）

### 阶段 1：数据层（后端 + SQLite）
- `src/domain/models.ts`：Product + PublicProduct 加 `showcasePagePath`
- `src/server/sqlite.ts`：schema 加 `showcase_page_path` 列；`mapProduct` 透传；`createProduct` / `updateProduct` 写入
- `src/server/showcasePage.ts`：新建，`resolveShowcasePath` + `readShowcasePage`
- `src/server/api.ts`：`validateProduct` 校验 + 新路由 `/api/showcase/pages/:id`

**验证**：`npm run typecheck:test` 通过；`showcase.test.ts` 新增 2 个用例 pass。

### 阶段 2：示例 HTML
- `data/products/flora/showcase.html` 创建
- 在 `sqlite.ts` seed 给 Flora 启用 `isPublic = true` + `showcasePagePath = "data/products/flora/showcase.html"`（可选；让用户首启即看到 demo）

**验证**：浏览器访问 `/showcase/flora` 显示示例内容。

### 阶段 3：前端组件
- `src/app/showcase/ProductShowcaseFrame.tsx` 新建
- `src/app/showcase/ShowcaseDetailPage.tsx` 集成
- `src/styles/showcase.css` 加 iframe + 状态样式
- `src/app/productForm.ts`：`ProductFormValues` 加字段，`productToFormValues` / `mergeProductValues` 透传
- `src/app/ProductFields.tsx`：加输入框
- 工作台 `ProductSettings` / `ProductDialog` 自动获得新输入框（通过共享 ProductFields）

**验证**：手动跑 `/showcase/flora` 看到 iframe 加载示例；fallback 路径（设空）回到 description 文本。

### 阶段 4：测试
- `tests/server/showcasePage.test.ts` 新建
- `tests/app/showcaseFrame.test.tsx` 新建
- `tests/server/showcase.test.ts` 加 2 个用例

**验证**：`npm test -- --run` 全绿（应有 195+ 用例）。

### 阶段 5：README + 完整验证
- README 加 "自定义作品页" 小节（含示例 HTML 模板 + postMessage 协议）
- 完整 `lint + test + typecheck + build`

**验证**：所有自动化测试通过；构建产物大小变化 < 30 KB。

## 13. 范围外（明确不做）

- iframe 自适应高度
- HTML 文件热重载（需重启 dev server）
- 后台编辑器 / Markdown 写作模式
- HTML 在 iframe 内的 SEO 优化
- 多页 SPA（每个作品独立域名）
- HTML 版本管理
- 作品页访问统计
- 跨产品共享 HTML（每个产品只能用自己目录的文件）