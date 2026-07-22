# Vibe Studio · 文档索引

本目录是 Vibe Studio 项目的 AI 友好文档。目的是让后续 AI 接手开发时**无需盲目搜索代码**就能快速建立全局心智模型。

## 文档清单

| 文档 | 面向 | 内容 |
|---|---|---|
| [PRODUCT.md](./PRODUCT.md) | 产品 / 新成员 / AI | 定位、用户、核心概念、功能清单、用户旅程、边界限制、FAQ |
| [TECHNICAL.md](./TECHNICAL.md) | 工程师 / AI | 技术栈、目录结构、模块调用关系、领域模型、SQLite 表结构、HTTP API、Git 集成、Vite 插件、测试约定、改动指引 |

## 阅读顺序建议

**AI 接手开发时**：
1. 先读 `PRODUCT.md` §1–§4，建立"这是做什么的、有什么功能"的心智模型
2. 再读 `TECHNICAL.md` §1–§6（技术栈、目录、领域模型、SQLite 表结构）
3. 改代码前查阅 `TECHNICAL.md` §14「常见改动指引」定位入口文件
4. 跑通 `npm test -- --run` 与 `npm run typecheck:test` 验证

**新成员 onboarding**：
1. `README.md`（项目根目录）→ 跑 `npm run dev`
2. `PRODUCT.md` → 了解产品
3. `TECHNICAL.md` §4 分层与调用关系 → 看 `src/app/App.tsx` 入口

## 维护约定

- **改完代码必须同步更新本目录对应章节**，否则文档会过期误导后续 AI
- 新增枚举值 → 更新 `TECHNICAL.md` §5 + `PRODUCT.md` §6
- 新增 API 端点 → 更新 `TECHNICAL.md` §7
- 新增产品功能 → 更新 `PRODUCT.md` §4 + §5
- 新增文件 / 重构目录 → 更新 `TECHNICAL.md` §3

## 项目根目录其它参考

- [`../README.md`](../README.md)：环境要求、常用命令、存储与部署说明
- [`../.oxlintrc.json`](../.oxlintrc.json)：Lint 规则
- [`../vite.config.ts`](../vite.config.ts)：端口 6000、strictPort、Vite 插件挂载