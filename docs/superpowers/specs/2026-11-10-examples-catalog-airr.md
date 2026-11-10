# AIRR — 全部示例目录页（`/examples`）2026-11-10

**状态**：已批准（用户 2026-11-10 明确“需要”；本切片只做只读目录与打开入口）。
**范围**：public web 只读页面 + 静态脱敏 catalog + 既有客户端解析 iModel；
不改 shared/backend/native/schema/RPC，不新增建模管道。

## 1. 目标

把私有 `example-index.json` 的 **18 个 `replicable-now`** 示例投影为产品内
统一目录：一个页面看全 18 个示例的名称、owner/document/Part Studio、目标体积、
严格轨状态，并在当前登录账号可访问时直接打开对应 iModel。解决现状
`/showcase` 只写 13/18、本地画廊 17/18 且未部署、入口分散的问题。

## 2. 复用矩阵（P0-03）

| 需要 | 复用 | 不新建 |
|---|---|---|
| 路由/页面壳 | `src/config/routes.tsx`、既有 route CSS 模式 | 第二套路由 |
| 登录态 | `AuthSession.getStoredAuth()` | 新 auth 状态机 |
| iTwin/iModel 列表 | `ItwinsClient.list`、`ImodelsClient.list` | 新 REST DTO/RPC |
| 打开示例 | 既有 `/documents/:iTwinId/:iModelId` | 新编辑器入口 |
| 封面 | `public/showcase/*` 真实栈资产 + 2 张新采集 | 概念图/伪造截图 |
| 计数/状态 | 私有 index 的 18 行（脱敏投影） | 前端再算能力矩阵 |

## 3. 数据与公开边界

- 公共 catalog 只含：展示名、owner、文档名、Part Studio 名、目标体积、
  严格轨状态、封面路径、精确 iModel/项目名（用于运行时解析）。
- 不提交原始 features/sketch/坐标、elementId/docId、私有路径或 UI 证据。
- catalog 是私有 index 的**脱敏投影**，不是第二事实源；私有 index 变更时
  同步更新并跑 catalog 测试（18 条、唯一 id、字段完整）。
- 不硬编码 iTwin/iModel UUID；按 `项目名 + iModel 名` 精确匹配，缺失或
  同名多义时**不打开**，回退文档中心，不猜。

## 4. 交互

- `/examples` 公开可读；owner 过滤 + 文本搜索；18 张卡片。
- 已登录且唯一匹配到 iModel：主动作“打开示例”直达
  `/documents/<iTwinId>/<iModelId>`。
- 未登录：“登录后打开”；已登录但未匹配/无权限： “在文档中心查找”，
  并显式提示当前环境未定位到该示例，不假装可打开。
- `/showcase` 更新为 18 个示例并链接 `/examples`；文档中心欢迎区入口
  改到 `/examples`。

## 5. 测试与验收

- 单测：catalog 18/唯一/字段；页面 18 卡、owner 过滤、搜索、未登录/
  已匹配/未匹配三态；Showcase 计数与链接。
- `tsc`/lint/vitest；`rebuild-web.ps1` 后 `verify-stack` 17/17。
- 真栈 smoke：`/examples` 18 卡；以示例账号登录时，Bumper 等可解析卡
  出现直达链接；不修改模型数据。
- 回滚：路由和页面均为纯新增；回滚提交即恢复。无 schema/数据迁移。

## 6. 风险

- 当前账号没有 “Onshape 示例复刻” 项目访问权时只能看到封面与“查找”回退；
  这是权限事实，不用假链接掩盖。示例 iModel 的权威来源仍是 hub/BIS。
- 示例项目是 **B-model**：文档中心要显示它，web 镜像必须以
  `VITE_B_MODEL_ENABLED=true` 构建（`rebuild-web.ps1 -BModelEnabled true`）。
  目录页的直达链接不依赖该开关，但缺少它时用户无法从文档中心发现项目。
- 页面公开只含已公开的聚合数据；不把 test 账号凭据写入前端或文档。
