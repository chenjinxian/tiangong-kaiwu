# imodelhub 契约同步实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 前端与私有仓后端全面适配新版 imodelhub-services（HEAD 645c7ed，审计修复+P5 官方 SDK 兼容套件），修掉全部 BREAKING 差异、重写潜在消费面，并以新栈收口 P0 验收门。

**Architecture:** 三条战线顺序推进——本仓前端（auth 修复→契约正名+翻页→潜在面重写）→ 私有仓 luban-backend（MS 存储主机改写层+依赖收紧+cosmetic，WA 失败分支现实化）→ 验收与发布（新镜像栈 e2e 全绿后配对发布）。

**Tech Stack:** React 18 + vitest（前端）；NestJS hub（对齐目标）；modeling-server/webhook-agent（私有仓，pnpm，SDK @itwin/imodels-client-authoring 6.2.2）。

**Spec:** `docs/superpowers/specs/2026-10-14-frontend-onshape-redesign-design.md`（母计划）+ 双勘察报告（`.superpowers/sdd/2026-10-14-frontend-p0-foundation/` 下 task 报告与 ledger 引用）。

## Global Constraints

- 基线契约事实（新版 hub，勘察实证）：
  - 错误包络 `{statusCode, message, error:{code,message}, timestamp, path[, errors]}`；`error.code` 白名单 5 码（CheckpointNotFound/iModelNotFound/iTwinNotFound/BriefcaseNotFound/ConflictingLocks）；422 字段明细在顶层 `errors`
  - `_links` 全部绝对化（PUBLIC_BASE_URL 优先）；itwins 翻页 `$skip/$top`（默认 top=10、clamp≤200）；imodels 系 `$continuationToken`+`$top`；`_links.next` 满页即出
  - id：changeset 40-hex（双档兼收 UUID）；briefcaseId/fileSize 均 number
  - auth：refresh 必须 `Authorization: Bearer <refreshToken>` 头；forgot=`/auth/forgot/password`；reset=`/auth/reset/password` body `{hash,password}`
  - accessControl members：`/accesscontrol/itwins/:id/members/users[...]`，包络 `{members:[{id,email,roles[]}]}`；roles 条目 `{id,displayName,...}`
  - webhooks 官方面：`GET /webhooks?scope=&scopeId=`、`GET/PATCH/DELETE /webhooks/:webhookId`、`POST /webhooks`；字段 `callbackUrl/eventTypes/scope/scopeId/active`
- 前端工作分支：`feat/imodelhub-contract-sync`（自 `feat/frontend-p0-foundation` HEAD 切出）；私有仓分支同名（在 D:\Github\luban-backend）
- pnpm 一律 `corepack pnpm@10`；link: 项目禁 `pnpm add`（私有仓 MS 改依赖手改 package.json + install --no-frozen-lockfile，前后核对 lockfile `link:` 计数）
- 存量 lint 口径沿用 P0：触碰文件零新增错误
- 提交信息：`类型(web|ms|wa): 中文描述（Sync Sn）` + `Co-Authored-By: Claude Code <noreply@anthropic.com>`
- **发布（S6）是外向动作：push 镜像/建 Release 前须用户确认**；验收（S5）用源码模式 MS + 新 hub 镜像先行
- 状态诚实：不改 hub 代码（它是对齐目标）；前端不造 hub 没有的能力

## File Structure

| 文件 | 职责 |
|---|---|
| `apps/web/features/auth/services/auth/client.ts`（改） | S1：refresh Bearer 头；forgot/reset 路径+字段 |
| `apps/web/features/auth/services/auth/client.test.ts`（改/建） | S1 断言 |
| `apps/web/shared/services/itwins/client.ts`（改） | S2：subClass→subclass；列表 $top=200+跟页 |
| `apps/web/features/itwin/hooks/useITwinsQuery.ts`（改） | S2：翻页聚合 |
| `apps/web/shared/api/httpClient.ts`（改） | S2：422 errors 细节挂 ApiError.details |
| `apps/web/e2e/helpers.ts`（改） | S2：直打 API 加 $top |
| `apps/web/shared/services/webhooks/client.ts`（重写） | S3：官方路由+字段 |
| `apps/web/shared/services/accessControl/client.ts`（重写） | S3：members/users 官方面+类型 |
| `apps/web/features/imodel/services/client.ts`（改） | S3：getDownloadUrl 改 baselinefile 端点 |
| `luban-cad/packages/shared/src/imodelhub-api/types.ts`（删） | S3：死类型库退役 |
| 私有仓 `modeling-server/src/main.ts`（改） | S4：预签名 URL 主机改写层 |
| 私有仓 `modeling-server/package.json`（改） | S4：SDK 版本收紧 |
| 私有仓 `modeling-server/src/routes/retry.ts`、`rpc/OpenCloudRpcImpl.ts`、`test-downloaded-baseline.test.ts`（改） | S4：cosmetic×3 |
| 私有仓 `modeling-server/src/projects/service.ts`（删） | S4：休眠代码退役 |
| 私有仓 `webhook-agent/src/baseline-generator.ts`（改） | S4：失败分支现实化 |

---

### Task S1: auth 契约修复（BREAKING×2）

**Files:**
- Modify: `luban-cad/apps/web/features/auth/services/auth/client.ts:284,468,484`
- Test: `luban-cad/apps/web/features/auth/services/auth/client.test.ts`（无则建）

**Interfaces:**
- Consumes: hub `/auth/refresh`（Bearer refresh token）、`/auth/forgot/password`、`/auth/reset/password {hash,password}`
- Produces: `refreshToken()`/`forgotPassword()`/`resetPassword()` 行为不变、契约修正；下游 UserContext 零改动

- [ ] **Step 1: 失败测试先行**——测试覆盖：①refresh 请求头含 `Authorization: Bearer <refreshToken>`；②forgot POST `/auth/forgot/password`；③reset POST `/auth/reset/password` 且 body 为 `{hash,password}`（旧字段 token/newPassword 断言不再出现）
- [ ] **Step 2: 跑测试确认失败**（现状头缺失+路径 404 形态）
- [ ] **Step 3: 实现**——`refreshToken()` fetch headers 加 Authorization；两处路径与 body 字段按 Constraints；函数签名与导出零改动
- [ ] **Step 4: 聚焦测试绿 + 全量 `corepack pnpm@10 test` 一次**
- [ ] **Step 5: Commit** `fix(web): auth 对齐新 hub——refresh Bearer 头+forgot/reset 路径与字段（Sync S1）`

### Task S2: itwins 契约正名 + 翻页 + 422 细节

**Files:**
- Modify: `luban-cad/apps/web/shared/services/itwins/client.ts`、`features/itwin/hooks/useITwinsQuery.ts`、`shared/api/httpClient.ts`、`e2e/helpers.ts`

**Interfaces:**
- Produces: `queryITwins/queryFavoriteITwins/queryRecentITwins` 返回全量聚合（$top=200 起步 + `_links.next` 跟页，硬帽 5 页=1000 条防失控）；`ApiError.details?: Record<string,string>`（422 时携带字段级明细，调用方可选消费）；helpers 直打列表加 `$top=100~200`

- [ ] **Step 1: 失败测试先行**——①createITwin body 含 `subclass` 不含 `subClass`；②列表请求带 `$top=200` 且响应含 `_links.next` 时发起第二跳；③httpClient 422 时 ApiError.details 携带 `{field:msg}`
- [ ] **Step 2: 确认失败 → 实现**——client 改 body 字段+拼 `$top=200`；新增小工具 `followNextLinks(firstPage, cap=5)`（fetch 裸 _links.next.href，已是绝对 URL）；useITwinsQuery 聚合；httpClient 422 分支读 `errorData.errors` 挂 details；helpers.ts:177/184 加 `$top`
- [ ] **Step 3: 聚焦+全量测试**
- [ ] **Step 4: Commit** `fix(web): itwins subclass 正名+列表跟页+422 字段细节透出（Sync S2）`

### Task S3: 潜在消费面重写（webhooks/accessControl/download/死类型）

**Files:**
- Rewrite: `luban-cad/apps/web/shared/services/webhooks/client.ts`、`shared/services/accessControl/client.ts`
- Modify: `luban-cad/apps/web/features/imodel/services/client.ts`（getDownloadUrl）
- Delete: `luban-cad/packages/shared/src/imodelhub-api/types.ts`（未 barrel 导出，零消费方——删除前 grep 复核）
- Test: 两 client 各配契约测试（路由/字段/包络断言）

**Interfaces:**
- Produces（P3 Share 对话框直接消费）:
  ```ts
  // webhooks/client.ts
  interface WebhookSubscription { id: string; callbackUrl: string; eventTypes: string[]; scope: string; scopeId: string; active: boolean }
  listWebhooks(scope?: string, scopeId?: string): Promise<WebhookSubscription[]>
  createWebhook(req: { callbackUrl: string; eventTypes: string[]; scope: string; scopeId: string }): Promise<WebhookSubscription>
  updateWebhook(id, patch: { callbackUrl?; eventTypes?; active? }): Promise<WebhookSubscription>
  deleteWebhook(id): Promise<void>
  ```
  ```ts
  // accessControl/client.ts
  interface ITwinMember { id: string; email: string; roles: { id: string; displayName: string }[] }
  listUserMembers(iTwinId): Promise<ITwinMember[]>          // GET members/users → data.members
  addUserMember(iTwinId, req: { email: string; roleId: string }): Promise<ITwinMember>
  updateUserMember(iTwinId, memberId, patch): Promise<ITwinMember>
  removeUserMember(iTwinId, memberId): Promise<void>
  listRoles(iTwinId): Promise<{ id: string; displayName: string }[]>   // data.roles[].displayName
  ```
  `getDownloadUrl` 改 `GET /imodels/:id/baselinefile` 读 `_links.download.href`（iModel 资源无 download 链接）
- briefcases client **不改**（指向 modeling-server 自有面，非 hub 契约）——在文件头注释登记此裁决

- [ ] **Step 1: grep 复核死类型零引用 → 删除**
- [ ] **Step 2: 契约测试先行（两 client 路由/字段/包络）→ 重写实现**
- [ ] **Step 3: getDownloadUrl 改道 + 单测**
- [ ] **Step 4: 全量测试 + lint 触碰面**
- [ ] **Step 5: Commit** `refactor(web): webhooks/accessControl 官方契约重写+download 改道 baselinefile+死类型退役（Sync S3）`

### Task S4: 私有仓 MS/WA 适配（分支 feat/imodelhub-contract-sync @ D:\Github\luban-backend）

**Files:**
- Modify: `modeling-server/src/main.ts:65-71`（cloudStorage 构造处）
- Modify: `modeling-server/package.json`（依赖收紧）
- Modify: `modeling-server/src/routes/retry.ts:84`、`src/rpc/OpenCloudRpcImpl.ts:54,61`、`src/test-downloaded-baseline.test.ts:20`
- Delete: `modeling-server/src/projects/service.ts`（+其 test；grep 确认休眠）
- Modify: `webhook-agent/src/baseline-generator.ts:765-789`

**Interfaces:**
- Produces: MS 预签名上传/下载跨 `azurite`→宿主 DNS 断点消除（cloudStorage 包装层把 presigned URL 主机改写为 `AZURE_BLOB_PUBLIC_HOST` env 覆盖值，缺省不改写——仿 hub e2e 的 HostRewritingAzureStorage 思路，仅在 URL host 匹配 `AZURE_BLOB_ENDPOINT` 的 host 时替换）；依赖 `imodels-client-authoring` 收紧 `^6.2.2`、`imodels-access-backend` 升 6.x 最新；WA 轮询超时错误附最后 state

- [ ] **Step 1: MS 包装层 TDD**（单测：URL host 命中端点 host→改写；不命中→原样；env 缺省→恒原样）
- [ ] **Step 2: 依赖收紧**（手改 package.json + `CI=true corepack pnpm@10 install --no-frozen-lockfile`，link: 计数前后核对）+ MS 冒烟（`pnpm build` 或启动自检）
- [ ] **Step 3: cosmetic 三处 + 休眠删除 + WA 失败分支**（超时 Error.message 附 `lastState=<state>`；`initializationFailed` 死分支改注释说明 hub 折叠语义）
- [ ] **Step 4: 私有仓测试**（MS `pnpm test` 聚焦改动面 + WA `pnpm test`）
- [ ] **Step 5: Commit（私有仓）** `fix(ms/wa): 适配新 hub——预签名主机改写层+SDK 收紧+cosmetic 清偿（Sync S4）`

### Task S5: 新栈验收（= P0-T10 解除阻塞）

- [ ] **Step 1: 起栈**——`generate-env.ps1` → hub 新镜像（`docker compose pull imodelhub && docker compose up -d`；hub `.env` 核对 `INTERNAL_API_KEY`=`AGENT_API_KEY`=MS/WA 的 `IMODELHUB_API_KEY`）→ MS **源码模式**（`start-ms-host.ps1 -Source D:\Github\luban-backend\modeling-server`）→ `verify-stack.ps1`
- [ ] **Step 2: 静态门复核**（test/build 绿；lint 触碰面零新增）
- [ ] **Step 3: 全量 e2e**（`--workers=1`；重点观察 changeset 推送路径是否触发 S4 改写层；WS/限流坑按既有纪律处理）
- [ ] **Step 4: 重定向抽查 + P0 spec 勾选**（此前 T10 未完事项）
- [ ] **Step 5: 验收记录**（两 ledger 各记一笔：P0 ledger T10 complete + Sync ledger S5 complete）

### Task S6: 配对发布（外向动作，动手前向用户确认）

- [ ] **Step 1: 确认发布物配对**——hub 镜像已发（用户）；MS tgz 重构建（含 S4 改动，弃用 dist-out 现存 20261014/15/16 未发布件或经用户确认对应关系）；WA 镜像是否重发（S4 仅 cosmetic，可与旧 latest 兼容——用户裁决）
- [ ] **Step 2: `build-ms-dist.ps1` + `build-images.ps1`（如需）+ `publish.ps1`**（classic PAT；tag 建议 `backend-20261015`）
- [ ] **Step 3: 发布后回归**——本仓干净检出侧 `fetch-backend.ps1` 拉新产物 → `verify-stack.ps1` 复验

---

## Self-Review 结论

- **覆盖**：前端勘察的 BREAKING×3→S1/S2；潜在面×5→S3；私有仓 BREAKING-1/TYPE-SHIFT/COSMETIC→S4；验收→S5；发布→S6。机会项（WA 生产自注册 webhook、itwins-client 升 2.5.4）裁决：前者是新功能非适配（defer，登记）；后者随休眠代码删除一并消解。
- **类型一致性**：S3 产出的 `ITwinMember`/`WebhookSubscription` 与 P3 波次 Share 对话框消费面一致；S2 `ApiError.details` 为可选新增不破坏 T1 契约。
- **占位符**：无——所有路由/字段/包络均来自勘察实证。
