# RW1 安全与网关实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 清零 D3 安全债（RPC 面 guard + 危险方法删除）、引入 BFF 薄层统一同源面（D2/D4/D12）、落地契约中心 v1（OpenAPI 生成管线）。

**Architecture:** MS HTTP RPC 面加 JWT guard（复用 wsAuth 的提取/校验逻辑，express 中间件形态）；BFF 为 Node 薄反代（JWT 验证终结+限流+CORS 单点），nginx 参数化 HUB 上游；契约中心用 TS Compiler API 手写生成器（零新依赖）+ zod 原生 JSON Schema。

**Tech Stack:** Express（MS 既有）、Fastify 或 Express（BFF 新服务，选 Express 与 MS 栈一致）、TypeScript Compiler API、zod 4。

**Spec:** `docs/superpowers/specs/2026-10-15-platform-architecture-design.md`（RW1 节 + A5/A6 裁决）

## Global Constraints

- **前置依赖**：Task 1/2 触碰私有仓 `modeling-server/src/main.ts` 与 `OpenCloudRpcImpl.ts`——S4（Sync 私有仓适配，在途）同文件在改。**RW1 私有仓任务必须在 S4 落地后开工**（在其分支之上继续）。
- 勘察实证事实（计划的契约基线）：
  - 前端 RPC 实际走 `/ipc` WS（IpcSession 拦截，WebAppRpcRequest 不经 HTTP）——HTTP RPC 三路由（main.ts:230-263）是闲置暴露面；guard 可全拦不破坏功能
  - `readExternalFile`/`writeExternalFile`/`getAccessToken` 全仓**零消费方**（luban-cad 命中均为 FE 自有 auth 同名异物）——可整体删除
  - DEEP_ANALYSIS §8.1 第 4 条（服务账号默认口令）已被 config.ts zod 根治——标「已消」
  - wsAuth 的 `extractToken`（:64-85 三级取 token）/`validateToken`（:91-110 hub /auth/me+60s 缓存）与传输无关，可包成 HTTP 中间件
  - nginx envsubst 机制（BFF_UPSTREAM 变量照抄 MS_UPSTREAM 模式）；HUB 上游硬编码 host.docker.internal:4000 在 default.conf.template:72-134
  - `/rpc/metadata`（handleOpenApiDescriptionRequest）输出 OpenAPI 3.0 骨架——契约中心 bootstrap 源，保持开放（只读 schema 无数据暴露）
- 官方客户端源码强制参考（D:\Github 七检出；契约中心无仓内先例，itwins/imodels-clients 均手写 markdown 无 openapi 工具链）
- pnpm 一律 `corepack pnpm@10`；私有仓 link: 禁 pnpm add；提交格式 `类型(scope): 中文描述（RW1-Tn）` + `Co-Authored-By: Claude Code <noreply@anthropic.com>`
- 已知缺口登记（不修）：/ipc WS 长连接 token 不重验 + per-message 无鉴权（token 撤销后连接仍有效）——RW1 显式登记为 P1 缺口（Ruling：修法为 WS ping 间隔重验，涉及 LocalhostIpcHost 生命周期，超出 RW1 范围；若错：安全审计发现后再补丁）
- 每任务验收：触碰面测试绿 + 私有仓任务另跑 MS 聚焦测试

## File Structure

| 文件 | 职责 |
|---|---|
| 私有仓 `modeling-server/src/middleware/rpcGuard.ts`（新建） | HTTP RPC JWT guard 中间件（复用 wsAuth 提取/校验） |
| 私有仓 `modeling-server/src/main.ts`（改） | 三条 RPC 路由挂 guard |
| 私有仓 `modeling-server/src/rpc/OpenCloudRpcImpl.ts`（改） | 删三危险方法 |
| 本仓 `luban-cad/packages/shared/src/rpc/OpenCloudRpcInterface.ts`（改） | 删三方法声明 |
| 本仓 `docs/DEEP_ANALYSIS.md`（改） | §8.1 对齐（①②③已修，④标已消，行号更新） |
| 本仓 `services/bff/`（新建，独立 pnpm 项目） | BFF 薄层：/api JWT 验证终结+限流+CORS+反代 MS/HUB |
| 本仓 `deploy/default.conf.template`（改） | HUB 上游参数化（HUB_UPSTREAM）+/api 指 BFF |
| 本仓 `docker-compose.yml`（改） | bff 服务接入 |
| 本仓 `scripts/generate-openapi.ts`（新建） | TS Compiler API 生成器：RpcInterface→OpenAPI 3.0 |

---

### Task RW1-1: MS HTTP RPC guard（安全债①）

**Files:**
- Create: 私有仓 `modeling-server/src/middleware/rpcGuard.ts` + `rpcGuard.test.ts`
- Modify: 私有仓 `modeling-server/src/main.ts:230-263`
- Test: rpcGuard.test.ts + 既有 main 路由冒烟

**Interfaces:**
- Consumes: `wsAuth.ts` 的 `extractToken`/`validateToken`（导出形态如缺则最小导出改造）
- Produces: `rpcGuard(req, res, next)` express 中间件——无有效 token 401 `{"error":{"code":"Unauthorized"}}`；`/rpc/metadata` 不挂（保持开放作契约 bootstrap 源）

- [ ] **Step 1: TDD**——失败测试：①无 token 401；②Authorization Bearer 有效（mock validateToken）放行；③cookie `luban_cad_auth` 取 token 放行；④`?token=` query 放行；⑤validateToken 503（hub 不可达）返回 503 非放行
- [ ] **Step 2: RED→实现**——rpcGuard.ts 包 wsAuth 逻辑（不复制，导入复用；wsAuth 若未导出则加 export）
- [ ] **Step 3: main.ts 接线**——`app.get/post('/:title/:version/mode/*', rpcGuard, handler)`；metadata 路由不动
- [ ] **Step 4: 验证**——MS 聚焦测试 + 全量一次；手动冒烟：直连 :4001 无 token GET RPC → 401；带 token → 正常
- [ ] **Step 5: Commit（私有仓）** `fix(ms): HTTP RPC 面加 JWT guard——清零安全债①（RW1-T1）`

### Task RW1-2: 危险方法三连删（安全债②③）+ 文档对齐

**Files:**
- Modify: 私有仓 `modeling-server/src/rpc/OpenCloudRpcImpl.ts:159-171,186-190` + `OpenCloudRpcImpl.test.ts`（对应用例删）
- Modify: 本仓 `luban-cad/packages/shared/src/rpc/OpenCloudRpcInterface.ts:130-139,163-165`
- Modify: 本仓 `docs/DEEP_ANALYSIS.md` §8.1
- Test: shared 包 typecheck/build；MS 全量测试

**Interfaces:**
- Produces: OpenCloudRpcInterface 收窄三方法（零消费方已实证——删除前再 grep 复核一次）

- [ ] **Step 1: 复核零消费**——grep `readExternalFile|writeExternalFile|getAccessToken` 于 luban-cad src/features/packages（排除 FE 自有 auth 同名）；确认零 RPC 消费
- [ ] **Step 2: 删接口声明（本仓）**→ shared `pnpm build` 绿 → Commit 本仓 `refactor(shared): OpenCloudRpcInterface 删除三危险方法声明（RW1-T2）`
- [ ] **Step 3: 删实现+测试（私有仓）**→ MS 全量测试绿 → Commit（私有仓）`fix(ms): 删除 readExternalFile/writeExternalFile/getAccessToken 实现——清零安全债②③（RW1-T2）`
- [ ] **Step 4: DEEP_ANALYSIS 对齐**——§8.1 四项标注：①②③已修（注 RW1 提交）、④已消（config zod 根治+ServiceAccountAuthClient 缓存）；行号更新到当前布局；登记 /ipc 长连接重验为已知 P1 缺口 → Commit 本仓
- [ ] **Step 5: 三仓联动冒烟**——前端 build 绿（消费面收窄不破）

### Task RW1-3: BFF 服务 v1 + nginx 参数化（D2/D4/D12）

**Files:**
- Create: 本仓 `services/bff/`（package.json/src/server.ts/src/proxy.ts/src/auth.ts/src/rateLimit.ts/Dockerfile/test/）
- Modify: 本仓 `deploy/default.conf.template`（HUB 上游 → `${HUB_UPSTREAM}`；`/api` → `${BFF_UPSTREAM}`）
- Modify: 本仓 `docker-compose.yml`（bff 服务：build ./services/bff——Ruling 见下）

**Interfaces:**
- Produces: `luban-bff` 服务（Express）：`/api/*`→MS（JWT 验证终结：Authorization 提取→hub /auth/me 校验+60s 缓存→401/透传）；HUB 九前缀反代（不终结，透传）；全局限流（内存令牌桶 100/15min/IP 超越单服务）；CORS 单点（同源为主，dev origin 白名单）；`/health`
- Ruling: BFF v1 用 compose `build: ./services/bff`（偏离全 GHCR 惯例——BFF 无原生依赖上下文极小；稳定后再上 GHCR 管线）—— 若错：compose 多一次本地构建延迟，无功能影响

- [ ] **Step 1: TDD（BFF 单测）**——①/api 无 token 401；②有效 token 透传 MS（mock 上游）；③HUB 前缀透传不改写；④限流触发 429；⑤/health 200
- [ ] **Step 2: 实现**——Express + http-proxy-middleware（或手写 proxy，避免新依赖则手写 fetch 反代；**选零依赖手写**，BFF 面 API 量小）+ supertest
- [ ] **Step 3: nginx 模板参数化**——`HUB_UPSTREAM`（缺省 host.docker.internal:4000）替换 9 处硬编码；`/api` 上游换 `${BFF_UPSTREAM}`（缺省 host.docker.internal:4001 直达 MS——BFF 未启用时行为不变）
- [ ] **Step 4: compose 接入**——bff 服务（build/stack 网络/healthcheck/depends_on imodelhub healthy）+ `BFF_UPSTREAM: luban-bff:4003` env 注入 nginx
- [ ] **Step 5: 联调验证**——`docker compose up -d bff nginx` → curl :80/api 无 token 401（经 BFF）→ 带登录 token 200 → /itwins 经 BFF 透传正常 → e2e 冒烟（login+documents 两 spec）
- [ ] **Step 6: Commit** `feat(bff): BFF v1——/api JWT 终结+限流+CORS 单点+HUB 反代；nginx 上游参数化（RW1-T3）`

### Task RW1-4: 契约中心 v1（OpenAPI 生成管线）

**Files:**
- Create: 本仓 `scripts/generate-openapi.ts`（TS Compiler API：解析 `packages/shared/src/rpc/*.ts` 的 RpcInterface 方法签名 → OpenAPI 3.0 paths；zod 注册表（若可从私有仓 import——不可则手写 op 参数 schema 声明块）→ components）
- Create: 本仓 `docs/api-specs/luban-rpc.json`（生成产物，提交入库）
- Modify: 本仓 `package.json` 或 CI（生成器入口 + drift 校验：重跑生成→diff 零变化）

**Interfaces:**
- Produces: `npx tsx scripts/generate-openapi.ts` → `docs/api-specs/luban-rpc.json`；CI/验收门含 drift 检查（生成产物与入库产物逐字节一致）
- 覆盖面 v1：OpenCloudRpcInterface + LubanFeatureRpcInterface 全方法（path/参数类型/返回类型占位 schema）；`OpenCloudIpcInterface`（非 RpcInterface 形态）v1 显式排除并登记

- [ ] **Step 1: TDD**——生成器单测：给定Fixture interface（临时 ts 文件）→ 断言产出的 paths/method/参数枚举正确
- [ ] **Step 2: 实现**——Compiler API 解析（interfaceName/interfaceVersion/方法签名/JSDoc 摘要）；`/rpc/metadata` 骨架作对照源（不依赖它，仅校验方法面完整）
- [ ] **Step 3: 生成+入库+drift 门**——产出 luban-rpc.json 提交；`pnpm gen:openapi && git diff --exit-code docs/api-specs/luban-rpc.json` 进验收
- [ ] **Step 4: Commit** `feat(contract): 契约中心 v1——RpcInterface→OpenAPI 生成管线+drift 门（RW1-T4）`

### Task RW1-5: RW1 验收门

- [ ] **Step 1: 渗透自测三项**——①直连 :4001 HTTP RPC 无 token→401（GET+POST 两式）；②grep 三危险方法全仓源码零命中（itwinjs-core 冻结历史区除外）；③compose 栈 :80/api 无 token→401、带 token→通
- [ ] **Step 2: 全量回归**——本仓 lint/test/build + e2e 全绿（--workers=1）+ verify-stack
- [ ] **Step 3: 产物检查**——luban-rpc.json 存在且 drift 门绿；DEEP_ANALYSIS §8.1 状态更新
- [ ] **Step 4: spec 勾选 + ledger 收口**（含 /ipc 重验 P1 缺口登记）

---

## Self-Review 结论

- **Spec 覆盖**：RW1 门三件（安全三项清零/同源单面化/spec 管线）→ T1/T2（安全）+ T3（同源）+ T4（spec）+ T5（验收）全覆盖；D12 参数化并入 T3。
- **冲突扫描**：T1/T2 与 S4 同文件（私有仓 main.ts/OpenCloudRpcImpl.ts）——Global Constraints 已锁顺序（S4 落地后开工）；T2 删接口声明在本仓 shared，与 S4 私有仓无交集。
- **类型一致性**：rpcGuard 消费 wsAuth 导出（如缺则 T1 内最小导出改造，已写明）；BFF 零依赖手写反代（避免 http-proxy-middleware 新依赖裁决已记）。
- **占位符**：无——所有路由/行号/中间件链均来自勘察实证。
