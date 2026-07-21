# Vibe Studio 作品集对外展示页面设计

## 1. 目标与首期范围

为 Vibe Studio 增加一个**对外公开访问**的作品集页面 `/showcase`，让外部访客（潜在合作者、招聘方、对你个人感兴趣的人）能在不进入内部工作台的前提下，了解你是谁、做过哪些项目、当前在做什么、以及如何联系你。

设计原则：**个人作品集 / 简历风格**，沿用现有工作台的视觉语言（同根同源，不分裂）。

首期交付范围：

- **新路由** `/showcase` 和 `/showcase/:productId`，与现有 `/products/*` 共存但不交叉。
- **数据复用**：直接读现有 SQLite 中的 `Product` 表，新增 `isPublic` 布尔字段控制对外可见性。
- **单页布局**：Hero + Now + Works + About + Contact 五段。
- **作品详情页**：复用现有产品的描述、状态、版本、用户量、`appUrl`、最近 Git 提交。
- **联系人入口**：邮箱 + 社交链接，纯静态展示。
- **作品配置**：个人信息、tagline、关于我、联系方式首期落到 `data/showcase-profile.json`，由 Vite 插件在启动时读入。

**不在首期范围**：暗色模式、i18n 多语言切换、SEO/Open Graph 优化、评论/点赞/订阅、profile 后台编辑（改 JSON 文件即可）、独立部署 / CDN。

## 2. 目标用户与使用方式

目标访客分三类：

1. **潜在合作者 / 招聘方**：30 秒内看到你是谁、做了什么、当前在做什么、如何联系。
2. **对你的项目好奇的用户**：点击进入作品卡片后能看到完整介绍、当前版本、用户量、最近更新，能跳转到应用。
3. **媒体 / 围观者**：通过单个作品详情页了解项目全貌。

访客旅程：进入 `/showcase` → 浏览 Hero 确认身份 → 浏览 Now 知道当前状态 → 浏览 Works 卡片 → 可选进入作品详情 → 滑到底部联系。

不强制访客注册或登录；不展示内部数据（任务数、Bug 数、文档内容等内部协作信息）。

## 3. 信息架构

### 3.1 路由

```
/                              → 现有行为不变（redirect 到 /products）
/products                      → 现有工作台
/products/*                    → 现有产品详情
/showcase                      → 作品集主页（新增）
/showcase/:productId           → 单个公开作品详情（新增）
/showcase/*（其他）            → 显示"作品未公开或不存在"
```

`/showcase/*` 与 `/products/*` **共用 `BrowserRouter`** 但**视觉外壳完全隔离**：展示页有独立顶部 nav，不显示工作台侧边栏，仅调用 `fetchShowcase*` 系列只读接口，不走任何 mutation 流程。

### 3.2 页面层级

```
/showcase
├── ShowcaseShell（顶部 nav + 容器）
│   ├── HeroSection（displayName + tagline + 头像 + status pill）
│   ├── NowSection（statusLine，一行字）
│   ├── WorksSection
│   │   └── ProductShowcaseGrid
│   │       └── ProductShowcaseCard × N（点击 → /showcase/:productId）
│   ├── AboutSection（aboutParagraphs）
│   └── ContactSection（contactEmail + socialLinks）
└── ShowcaseDetailPage（/showcase/:productId）
    ├── 面包屑
    ├── 标题 + 图标 + 状态 + 当前版本 + appUrl 外链按钮
    ├── 描述（取 Product.description）
    ├── 关键指标条（用户量 / 当前版本 / 状态 / 最近更新时间）
    └── 最近 Git 提交（复用 useCommitPolling，最多 5 条）
```

### 3.3 数据契约

**新增 TS 类型**（`src/domain/models.ts`）：

```ts
export interface Product {
  // ... 现有字段
  isPublic: boolean           // 新增，默认 false
}

export interface PublicProduct {
  id: string
  name: string
  description: string
  icon: string
  status: ProductStatus
  currentVersion: string      // 通过 deriveProductMetrics 取最近一个 released 版本
  userCount: number
  appUrl: string | null
  updatedAt: string
}

export interface ShowcaseProfile {
  displayName: string          // Hero 主标题
  tagline: string              // Hero 副标题一行字
  avatarUrl: string | null     // Hero 头像（可空，显示默认占位）
  statusLine: string           // Now 区块一行字
  statusPillText: string       // Hero 顶部 pill 文案
  aboutParagraphs: string[]    // About 区块段落
  contactEmail: string
  socialLinks: Array<{
    platform: 'github' | 'twitter' | 'website' | 'linkedin' | 'wechat'
    label: string
    url: string
  }>
}
```

**新增 SQLite 列**：`products.is_public INTEGER NOT NULL DEFAULT 0`。沿用现有 `try { ALTER TABLE } catch {}` 的迁移风格（见 `sqlite.ts:143-144`），加：

```ts
try { db.exec('ALTER TABLE products ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0') } catch { }
```

## 4. 后端接口

### 4.1 新增路由（`src/server/api.ts`）

| Method | Path | 行为 |
|---|---|---|
| `GET` | `/api/showcase/profile` | 读 `data/showcase-profile.json` 返回；文件不存在返回 503 + 空默认 profile |
| `GET` | `/api/showcase/products` | SQL：`SELECT ... FROM products WHERE is_public=1 AND is_deleted=0 AND status!=3 ORDER BY updated_at DESC` |
| `GET` | `/api/showcase/products/:id` | SQL 同上 + `AND id=?`；找不到 → 404 |

**`currentVersion` 计算**：调用现有 `deriveProductMetrics(product, workItems, versions)` 取 `metrics.currentVersion`（在 `src/domain/productMetrics.ts` 中定义）。该函数已经是工作台依赖，因此直接复用，不引入新的指标逻辑。

**字段映射**（snake ↔ camel，与现有 `mapProduct` 风格一致）：
- `is_public` ↔ `isPublic`
- `user_count` ↔ `userCount`
- `app_url` ↔ `appUrl`
- `updated_at` ↔ `updatedAt`

### 4.2 现有写接口扩展

`POST /api/products` 和 `PUT /api/products/:id` 增加可选 `isPublic: boolean` 字段，序列化层做映射。如果不传则保持现有值（创建时默认 `false`，更新时保留原值）。

### 4.3 配置加载

`data/showcase-profile.json` 示例结构：

```json
{
  "displayName": "你的名字",
  "tagline": "独立开发者，做有意思的产品。",
  "avatarUrl": null,
  "statusLine": "正在做一个有意思的 AI 小工具。",
  "statusPillText": "欢迎合作",
  "aboutParagraphs": [
    "第一段自述...",
    "第二段自述..."
  ],
  "contactEmail": "you@example.com",
  "socialLinks": [
    { "platform": "github", "label": "GitHub @xxx", "url": "https://github.com/xxx" }
  ]
}
```

Vite 插件（`src/server/viteApiPlugin.ts`）启动时读此文件，缓存到内存；每次请求时直接返回缓存值。**不**支持热更新（如需修改需重启 dev server）。后续如要支持后台编辑，迁到 SQLite。

## 5. 视觉设计

### 5.1 整体调性

- **风格关键词**：克制、现代、独立开发者、可信
- **基调**：明亮浅色（沿用 `#f5f6fa` 主背景）+ 单一紫蓝主色（`#6259e8`）+ 大字号标题 + 大量留白
- **与现有工作台的关系**：完全沿用 `global.css` 的变量、间距、卡片样式、状态色

**所有展示页专用样式以 `showcase-` 前缀命名**，避免和工作台 `.product-card` 等冲突。

### 5.2 排版

| 用途 | 桌面端 | 移动端 |
|---|---|---|
| Hero 主标题 | `clamp(48px, 7vw, 96px)`，字重 800，letter-spacing `-0.04em` | 48px |
| Hero 副标题 | `clamp(18px, 1.8vw, 24px)` | 18px |
| 区段标题 | `32px`，字重 700 | 26px |
| 区段副标题 | `16px` | 同 |
| 正文段落 | `16-17px`，line-height `1.7` | 同 |
| 元信息 | `12-13px`，字重 700 | 同 |

字体沿用 `Inter, ui-sans-serif, system-ui`（现有 `index.html` 已在用），**不引入新字体**。

### 5.3 配色

```
主背景：   #f5f6fa
卡片底：   #ffffff
主色：     #6259e8
主色深：   #5148d6（hover）
文字主：   #1d2130
文字次：   #555969
文字辅：   #747887
分割线：   #e8e9f0
```

Hero 头像圆形 `120px × 120px`，紫色 8% 透明描边作为"光环"。

### 5.4 各区块视觉

**Hero**：
- 左对齐（不居中）
- 顶部 `status pill`：紫底白字，显示 `statusPillText`
- 主标题两行：`Hi, I'm`（灰色小字）+ `<displayName>`（深色大字）
- 副标题 tagline
- meta 行：`📍 <城市>` `→ <状态文字>`（首期固定结构，city 留空隐藏）
- 头像右上角（桌面），移动端移到主标题上方

**Now**：
- 整段只占一行字的高度
- 左侧紫色短横 + `NOW` 小标（沿用现有 `.eyebrow` 风格）
- 文字一行，溢出省略号

**Works**：
- 区段标题：`精选作品`
- 网格：桌面 3 列、平板 2 列、手机 1 列
- **卡片样式**（`.showcase-card`）：
  ```
  ┌─────────────────────────┐
  │ [图标]           [状态] │
  │                         │
  │ Product Name            │  ← 20px 字重 700
  │ 一句简介描述...          │  ← 14px 灰色，最多 2 行
  │                         │
  │ ─────────────────────── │  ← 分割线
  │ v1.2.0  ·  12,345 用户  │  ← 12px meta
  └─────────────────────────┘
  ```
- hover：上浮 4px + 阴影加深（`0 16px 40px rgba(37, 42, 69, .12)`），过渡 200ms
- 入场动效：进入视口时透明度 `0→1` + `translateY(16px → 0)`，过渡 400ms ease-out，每张卡片延迟 60ms
- 状态色复用现有 `.status-developing/.status-beta/.status-released`

**ShowcaseDetail（作品详情页）**：
- 简化面包屑：`作品集 / <产品名>`
- 标题区：图标 + 名称 + 状态 pill + `appUrl` 外链按钮（`appUrl` 为 null 时不显示）
- 下方两列布局（桌面），单列堆叠（移动）：
  - 左：`description` 完整内容（保留换行），纯文本不渲染 Markdown
  - 右：指标卡（用户量 / 当前版本 / 状态 / 最近更新时间）+ 最近 5 条 Git 提交（复用 `useCommitPolling`）

**About**：
- 区段标题：`关于我`
- 段落 `max-width: 680px`，左对齐不居中，段间距 20px

**Contact**：
- 区段标题：`联系我`
- 一句话 CTA：`想做点有意思的？欢迎聊一聊 →`
- 邮箱 `mailto:` 大字（hover 变色）+ 社交链接圆形按钮（灰色边框，hover 变紫）

### 5.5 微动效

只做两种：
1. hover 反馈
2. 滚动入场淡入（IntersectionObserver）

全局 `prefers-reduced-motion: reduce` 时禁用所有动效。

### 5.6 暗色模式

**首期不做**。

## 6. 组件拆分

### 6.1 文件结构

```
src/
├── app/
│   ├── showcase/                          ← 新增
│   │   ├── ShowcaseApp.tsx
│   │   ├── ShowcaseShell.tsx
│   │   ├── HeroSection.tsx
│   │   ├── NowSection.tsx
│   │   ├── WorksSection.tsx
│   │   ├── ProductShowcaseCard.tsx
│   │   ├── ShowcaseDetailPage.tsx
│   │   ├── AboutSection.tsx
│   │   ├── ContactSection.tsx
│   │   ├── ShowcaseSkeleton.tsx
│   │   ├── useShowcaseProfile.ts
│   │   ├── useShowcaseProducts.ts
│   │   ├── useShowcaseProduct.ts
│   │   └── reveal.ts
│   ├── ProductSettings.tsx                ← 修改：加"对外公开"开关
│   ├── ProductDialog.tsx                  ← 修改：加"对外公开"开关
│   └── App.tsx                            ← 修改：根据 path 切换外壳
├── client/
│   └── api.ts                             ← 修改：加 showcase API + PublicProduct / ShowcaseProfile
├── server/
│   ├── api.ts                             ← 修改：加 showcase 路由 + 产品写接口支持 isPublic
│   ├── sqlite.ts                          ← 修改：products 表加 is_public 列；mapProduct 加 isPublic 字段
│   └── viteApiPlugin.ts                   ← 修改：启动时读 showcase-profile.json
├── styles/
│   └── showcase.css                       ← 新增：展示页专用样式
└── domain/
    └── models.ts                          ← 修改：Product 加 isPublic；新增 PublicProduct / ShowcaseProfile
data/
└── showcase-profile.json                  ← 新增：站点配置
src/test/
├── showcaseApi.test.ts                    ← 新增
├── showcaseRouting.test.tsx               ← 新增
└── publicProductFilter.test.ts            ← 新增
```

### 6.2 组件职责

| 组件 | 职责 | 输入 | 依赖 |
|---|---|---|---|
| `ShowcaseApp` | 路由根，独立外壳 | `initialEntries?` | `BrowserRouter` |
| `ShowcaseShell` | 顶部 nav + `<main>` 容器 | `children` | - |
| `HeroSection` | Hero 区渲染 | `profile: ShowcaseProfile` | - |
| `NowSection` | Now 区渲染 | `statusLine: string` | - |
| `WorksSection` | 拉公开产品列表 + 渲染网格 | - | `useShowcaseProducts` |
| `ProductShowcaseCard` | 单卡渲染 | `product: PublicProduct` | `react-router-dom` |
| `ShowcaseDetailPage` | 单个公开产品详情 | URL param `productId` | `useShowcaseProduct`, `useCommitPolling` |
| `AboutSection` | About 区渲染 | `paragraphs: string[]` | - |
| `ContactSection` | Contact 区渲染 | `email`, `socialLinks` | - |
| `reveal.ts` | IntersectionObserver 工具，注册 DOM 元素并返回是否进入视口 | - | - |

## 7. 数据流

### 7.1 `/showcase` 主页

```
ShowcaseApp（路由根）
├── useShowcaseProfile() → { profile | error | loading }
├── useShowcaseProducts() → { products | error | loading }
└── ShowcaseShell
    ├── HeroSection（profile 加载前：骨架）
    ├── NowSection（同上）
    ├── WorksSection（loading：3 个卡片骨架；error：降级提示）
    ├── AboutSection（profile 加载前：骨架）
    └── ContactSection（同上）
```

- `profile` 和 `products` **并行** `Promise.all` 拉取
- 任一失败 → 对应区块独立显示错误 + 重试按钮，**不**阻塞其他区块

### 7.2 `/showcase/:productId`

```
ShowcaseDetailPage
├── useShowcaseProduct(id) → { product | notFound | error | loading }
├── loading → 单卡骨架
├── notFound → "作品未公开或不存在" + 回主页按钮
├── error → 重试按钮
└── 详情布局（product 存在时）
```

### 7.3 错误处理

| 情况 | 表现 |
|---|---|
| 后端完全挂掉 | 全屏"作品集暂不可用" + 重试按钮 |
| 单个区块拉取失败 | 该区块独立显示错误，不影响其他区块 |
| `appUrl` 为 `null` | 不显示"访问应用"按钮 |
| 描述为空 | 显示"暂无简介"占位 |
| `socialLinks` 为空数组 | Contact 区块只显示邮箱 |
| Git 提交读取失败 | 显示现有错误提示（复用现有 useCommitPolling 行为） |
| profile JSON 缺失 | 返回 503，前端显示"展示页配置缺失，请联系管理员" |

## 8. 集成改动

### 8.1 `App.tsx` 路由分发

顶层 `App` 组件判断当前 `location.pathname`：

- 以 `/showcase` 开头 → 渲染 `<ShowcaseApp>`（不读 snapshot、不调用 mutation）
- 其他 → 渲染现有 `<ApiApp>` 或 `<LegacyApp>`

实现：在 `App.tsx` 内用 `useLocation()` 判断，根据结果只渲染对应外壳。**不**用嵌套 Router（避免 `BrowserRouter` 嵌套）。

### 8.2 `ProductSettings.tsx` / `ProductDialog.tsx`

新增 checkbox：

```tsx
<label className="field-checkbox">
  <input type="checkbox" checked={product.isPublic} onChange={...} />
  对外公开（显示在作品集页面）
</label>
```

提交时 `isPublic` 随表单一起保存。`ProductDialog.tsx`（新建）默认 `false`。

### 8.3 `sqlite.ts` 迁移

加在现有 `try { ALTER TABLE ... } catch {}` 块之后（参照 `sqlite.ts:143-144`）：

```ts
try { db.exec('ALTER TABLE products ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0') } catch { }
```

`mapProduct`（`sqlite.ts:27`）增加 `isPublic: Boolean(r.is_public)` 字段。

`createProduct` 和 `updateProduct` 接受 `isPublic` 字段，写入对应列。

### 8.4 `viteApiPlugin.ts`

启动时（`configureServer` 钩子内）读 `data/showcase-profile.json`：

- 文件存在 → 解析后缓存到内存
- 文件不存在 → 缓存一个空默认 profile（显示"配置缺失"提示）
- 后续 `/api/showcase/profile` 请求直接返回缓存值

## 9. 测试策略

### 9.1 新增测试

| 文件 | 覆盖 |
|---|---|
| `src/test/showcaseApi.test.ts` | mock fetch，验证 `fetchShowcaseProducts` / `fetchShowcaseProfile` / `fetchShowcaseProduct` 字段映射 |
| `src/test/showcaseRouting.test.tsx` | 验证 `/showcase` 渲染 Hero；`/showcase/:id` 渲染详情；未知 ID 显示 404 |
| `src/test/publicProductFilter.test.ts` | 验证 SQL 过滤条件 `is_public=1 AND is_deleted=0 AND status!=3` 排除归档和私密产品 |

### 9.2 不动现有测试

保持向后兼容，所有现有 vitest 用例继续通过。

### 9.3 运行命令

沿用现有：

```bash
npm run lint
npm test -- --run
npm run typecheck:test
npm run build
```

## 10. 风险与缓解

| # | 风险 | 影响 | 缓解 |
|---|---|---|---|
| R1 | `is_public` 列加到现有 products 表，旧数据迁移 | 中 | 默认 0；现有 `try { ALTER TABLE } catch {}` 模式已支持空表 |
| R2 | `/showcase` 与 `/products` 共用 Router，外壳切换闪烁 | 低 | `App.tsx` 顶层 path 检查直接决定外壳，不在组件内二次切换 |
| R3 | `data/showcase-profile.json` 修改需要重启 | 低 | 首期接受；README 注明 |
| R4 | 公开 API 无鉴权，错误配置可能泄露内部产品 | 中 | SQL 严格过滤 `is_public=1 AND is_deleted=0 AND status!=3`；后端测试覆盖 |
| R5 | `useCommitPolling` 在公开页每 60s 轮询带宽浪费 | 低 | 详情页只在用户进入时轮询，离开清除（现有 hook 已有清理逻辑） |
| R6 | 移动端 IntersectionObserver 多卡片性能 | 低 | 限制每页最多 12 个公开产品（前端分页后续加）；`will-change` 仅在视口内启用 |
| R7 | 工作台 nav 的"产品"链接点了之后跳工作台；展示页 nav 切换要保持状态 | 低 | ShowcaseShell nav 用 `<Link to="/showcase">` / `<Link to="/products">`，各自独立外壳 |

## 11. 实施步骤（5 个阶段）

### 阶段 1：数据层地基

1. `src/domain/models.ts`：`Product` 加 `isPublic: boolean`
2. `src/server/sqlite.ts`：schema 加 `is_public` 列；`mapProduct` 字段映射；`createProduct`/`updateProduct` 支持写入
3. `src/server/api.ts`：加 `/api/showcase/profile` / `/api/showcase/products` / `/api/showcase/products/:id` 三个路由
4. `src/client/api.ts`：加 `fetchShowcaseProfile` / `fetchShowcaseProducts` / `fetchShowcaseProduct` + `PublicProduct` / `ShowcaseProfile` 类型
5. 现有产品 POST/PUT 路由允许传 `isPublic`
6. `src/app/ProductSettings.tsx` / `ProductDialog.tsx` 加 checkbox

**验证**：`curl /api/showcase/products` 返回空数组；后端更新某产品 `isPublic=true` 后接口能返回；`ProductSettings` 保存后 DB 字段更新正确。

### 阶段 2：展示页骨架 + 路由

1. `src/app/showcase/ShowcaseApp.tsx`：挂 `/showcase` 和 `/showcase/:productId` 路由
2. `src/app/App.tsx`：path 分发，根据前缀切换 `<ShowcaseApp>` / `<ApiApp>`
3. `src/app/showcase/ShowcaseShell.tsx`：顶部 nav + 容器
4. `src/styles/showcase.css`：基础布局、CSS 变量、reset
5. `src/server/viteApiPlugin.ts`：启动时读 `data/showcase-profile.json` 并缓存
6. `data/showcase-profile.json`：写入示例 profile

**验证**：访问 `/showcase` 显示空骨架（只有 nav）；`/showcase/foo` 显示 404 占位。

### 阶段 3：Hero + Now + About + Contact

1. `useShowcaseProfile.ts`
2. `HeroSection.tsx` / `NowSection.tsx` / `AboutSection.tsx` / `ContactSection.tsx`
3. `reveal.ts`（IntersectionObserver 工具）+ 各区块接入
4. `prefers-reduced-motion` 兜底

**验证**：用真实 profile JSON 填充，所有静态区正确渲染；移动端单列、桌面端三列响应式正常。

### 阶段 4：作品网格 + 详情页

1. `useShowcaseProducts.ts` / `useShowcaseProduct.ts`
2. `WorksSection.tsx` + `ProductShowcaseCard.tsx`
3. `ShowcaseDetailPage.tsx` + 接入 `useCommitPolling`
4. `ShowcaseSkeleton.tsx`
5. 错误处理（404 / 网络失败 / 单独区块降级）

**验证**：后端把 2 个产品设为 `isPublic=true`，主页显示 2 张卡；点击跳详情页正确；未知 ID 显示 404；后端挂掉时主页降级。

### 阶段 5：测试 + 打磨

1. `src/test/showcaseApi.test.ts` / `showcaseRouting.test.tsx` / `publicProductFilter.test.ts`
2. 完整跑 `npm run lint && npm test -- --run && npm run typecheck:test && npm run build`
3. 浏览器手工走查：Chrome / Safari / Firefox 桌面 + 移动端模拟
4. 无障碍：键盘 Tab、focus ring 可见、`prefers-reduced-motion` 验证
5. README 更新：加 `/showcase` 说明

**验证**：所有自动化测试通过；构建产物大小变化 < 30KB（gzip 后）。

## 12. TODO List

```markdown
### 数据层
- [ ] Product 类型加 isPublic 字段
- [ ] SQLite schema 加 is_public 列
- [ ] /api/showcase/profile 路由
- [ ] /api/showcase/products 路由（带过滤）
- [ ] /api/showcase/products/:id 路由
- [ ] client/api.ts 加 fetchShowcaseProfile / fetchShowcaseProducts / fetchShowcaseProduct
- [ ] 现有产品 POST/PUT 支持 isPublic 字段
- [ ] ProductSettings 加"对外公开"开关
- [ ] ProductDialog 加"对外公开"开关
- [ ] sqlite.ts mapProduct 加 isPublic 映射

### 展示页
- [ ] ShowcaseApp 路由根
- [ ] App.tsx path 分发
- [ ] ShowcaseShell 顶部 nav
- [ ] showcase.css 基础样式
- [ ] data/showcase-profile.json 示例
- [ ] viteApiPlugin 启动时读 profile JSON
- [ ] useShowcaseProfile hook
- [ ] useShowcaseProducts hook
- [ ] useShowcaseProduct hook
- [ ] reveal.ts IntersectionObserver 工具
- [ ] HeroSection
- [ ] NowSection
- [ ] AboutSection
- [ ] ContactSection
- [ ] WorksSection
- [ ] ProductShowcaseCard
- [ ] ShowcaseDetailPage
- [ ] ShowcaseSkeleton
- [ ] prefers-reduced-motion 兜底

### 测试 & 打磨
- [ ] showcaseApi.test.ts
- [ ] showcaseRouting.test.tsx
- [ ] publicProductFilter.test.ts
- [ ] 跑完整 lint + test + typecheck + build
- [ ] 浏览器桌面/移动手工走查
- [ ] 键盘 Tab 无障碍走查
- [ ] README 更新 /showcase 说明
```

## 13. 范围外（明确不做）

- 暗色模式
- 国际化 i18n
- 后台编辑 profile
- SEO / Open Graph 优化
- 评论 / 点赞 / 订阅
- 多语言切换
- CDN / 静态站点生成
- 自动化头像优化 / WebP 转换