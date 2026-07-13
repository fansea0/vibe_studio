# Vibe Studio SQLite 与 Git 更新设计

## 1. 目标与范围

在现有 Vibe Studio 产品工作台上增加两个能力：

1. 开发服务器固定使用 6000 端口。
2. 产品配置、任务、版本和 Markdown 文档全部由本机 SQLite 持久化；每个产品可配置本地 Git 仓库路径，工作台每 60 秒读取最近 commit 并展示在“最新更新”区域。

本次不迁移旧 localStorage。SQLite 初始化后成为唯一业务数据源；旧浏览器 localStorage 数据不再读取。

## 2. 总体架构

```text
React UI
   │ HTTP /api
   ▼
Vite Node 中间件（:6000）
   ├── SQLite CRUD（better-sqlite3）
   └── Git log 读取（child_process.execFile）
          │
          ▼
     本地 Git 仓库路径
```

- Vite 继续承载前端开发服务器，同时注册本地 API 中间件。
- SQLite 文件默认位于项目根目录 `data/vibe-studio.sqlite`；启动时创建目录、表和演示数据。
- 前端只通过 API 访问业务数据，不再直接访问 localStorage、SQLite 或 Git。
- Git 读取只允许使用产品设置中保存的本地仓库路径；使用 `execFile('git', args)` 传参，禁止 shell 拼接。
- 生产部署若需要此能力，应将同一 API 抽成独立 Node 服务；本次只覆盖本地工作台。

## 3. SQLite 数据模型

所有表使用 `INTEGER PRIMARY KEY AUTOINCREMENT`，时间字段使用 ISO 字符串，JSON/扩展字段使用 TEXT。业务表字段均 NOT NULL 并提供默认值；删除使用 `is_deleted` 标识。

### 3.1 products

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | INTEGER | 自增主键 |
| name | TEXT | 产品名称，应用层 trim 后唯一 |
| description | TEXT | 产品描述，默认空字符串 |
| product_type | TEXT | 产品类型，默认空字符串 |
| icon | TEXT | 图标标识，默认空字符串 |
| status | INTEGER | developing/beta/released/archived 的枚举值 |
| completion_percent | INTEGER | 0–100 |
| user_count | INTEGER | 非负用户量 |
| user_count_source | TEXT | 统计口径 |
| app_url | TEXT | HTTPS 地址或空字符串 |
| repository_path | TEXT | 本地 Git 仓库绝对路径或空字符串 |
| archived_at | TEXT | 归档时间或空字符串 |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |
| is_deleted | INTEGER | 0 未删除 / 1 已删除 |

### 3.2 work_items

保存需求和 Bug 看板数据：product_id、type、title、priority、due_date、status、created_at、updated_at、is_deleted。product_id 建立索引，删除产品时使用事务级软删除。

### 3.3 versions

保存 product_id、number、status、released_at、notes、created_at、updated_at、is_deleted。`(product_id, number)` 唯一；`planned` 版本 released_at 为空，`released` 必须有合法时间。

### 3.4 documents

保存 product_id、name、content、created_at、updated_at、is_deleted。`(product_id, normalized_name)` 唯一；content 仍限制为不超过 512 KiB 的 UTF-8 文本，只接受 `.md` / `.markdown` 文件名。

### 3.5 初始化

数据库首次创建时执行幂等建表和索引语句，并插入 Flora、ResumeGenius、Text War 演示数据。启动不会读取或导入旧 localStorage。

## 4. API 设计

### 4.1 产品与业务数据

- `GET /api/products`：返回未删除产品及其摘要指标。
- `POST /api/products`：创建产品，校验名称、数值、HTTPS URL、仓库路径。
- `PATCH /api/products/:id`：使用 `updated_at` 做乐观并发校验。
- `POST /api/products/:id/archive`：事务内归档产品及其业务数据。
- `POST /api/products/:id/restore`：恢复产品，保留原生命周期状态。
- `GET /api/products/:id/work-items`、`POST /api/products/:id/work-items`、`PATCH /api/work-items/:id`：需求/Bug 看板。
- `GET /api/products/:id/versions`、`POST /api/products/:id/versions`：手动版本。
- `GET /api/products/:id/documents`、`POST /api/products/:id/documents`、`PATCH /api/documents/:id`：Markdown 文档。

写入失败统一返回 JSON 错误：`{ code, message, fieldErrors? }`。SQLite 使用事务；并发冲突返回 409，参数错误返回 400，记录不存在返回 404。

### 4.2 Git commit

`GET /api/products/:id/commits?limit=5`

服务端读取产品 repository_path，执行等价参数：

```text
git -C <repository_path> log -n 5 --date=iso-strict --pretty=format:%H%x09%h%x09%an%x09%aI%x09%s
```

响应：

```json
{
  "items": [
    { "sha": "完整 SHA", "shortSha": "短 SHA", "author": "作者", "committedAt": "ISO 时间", "subject": "提交信息" }
  ],
  "checkedAt": "ISO 时间"
}
```

仓库路径为空、路径不存在、不是 Git 仓库或 git 命令失败时，返回可展示的错误码和 message，不影响产品、任务等 SQLite 数据。

## 5. 前端更新策略

- 产品总览首次加载请求产品摘要和各产品最新 commit。
- 产品详情首次进入时请求该产品的业务数据和 commit 列表。
- commit 请求每 60 秒执行一次；使用 `setInterval`，组件卸载时清理；请求进行中不重复发起。
- 只更新 commit 数据和“最新更新”展示，不重载任务、版本、文档表单，避免覆盖用户草稿。
- 展示内容：短 SHA、subject、作者、相对时间；无 commit 时显示空状态，错误时显示“暂时无法读取 Git 更新”及重试入口。
- 产品卡片的“最新更新”显示最新 commit subject 与时间；详情概览显示最近 5 条 commit 列表。

## 6. 配置与运行

`vite.config.ts`：

- `server.port = 6000`
- `server.strictPort = true`
- 注册 API 中间件

`package.json`：

- `dev` 启动 Vite 6000 端口。
- 增加 SQLite/API 所需依赖和启动说明。

README 明确：

- `npm run dev` 后访问 `http://localhost:6000`。
- 数据库文件路径与备份方式。
- Git 仓库路径需要是本机绝对路径，服务只读取该路径的 commit 元信息。
- Git 读取错误不会破坏 SQLite 数据。

## 7. 错误处理与安全

- 所有 SQL 使用参数绑定，禁止拼接用户输入。
- Git 使用 `execFile` 参数数组，禁止 `shell: true`。
- repository_path 必须是绝对路径；服务端检查目录存在并执行 `git rev-parse --is-inside-work-tree`。
- SQLite 写事务失败整体回滚；乐观并发冲突不覆盖新数据。
- 定时请求使用 AbortController；组件卸载或切换产品时取消请求。
- Git subject、author 作为文本渲染，不使用 dangerouslySetInnerHTML。

## 8. 验收与测试

1. `npm run dev` 监听 6000，非 6000 端口不作为默认端口。
2. 首次启动创建 SQLite 文件、表、索引和演示数据，不读取 localStorage。
3. 产品、任务、版本、文档 CRUD 在刷新页面后仍保持。
4. 产品设置可保存 repository_path；非法路径得到可理解错误。
5. mock Git 仓库返回最近 5 条 commit，并显示在卡片和详情最新更新区域。
6. 定时器每 60 秒触发一次；请求失败可重试且不影响任务/文档草稿。
7. SQL 注入、shell 注入、非法路径和 Git 错误均被阻断并返回结构化错误。
8. 单元测试覆盖 schema、事务回滚、并发冲突、Git parser、API 错误、前端定时刷新和卸载清理。
