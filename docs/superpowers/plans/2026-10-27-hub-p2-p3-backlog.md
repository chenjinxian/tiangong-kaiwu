# imodelhub P2/P3 长尾清零 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 清零 imodelhub-services 审计后剩余的 **30 项 P2/P3/长尾**（P0/P1 已闭），把安全、契约、数据完整性、可观测性与工程质量拉到可持续交付线。

**Architecture:** 按「安全快赢 → 契约/数据完整性 → 并发与可观测性 → 工程护栏」四波推进；每波独立可发布、独立验收、可回退。所有契约改动以官方 SDK 实测为准，所有写路径保持幂等/可回滚，不恢复 TEST_MODE。

**Tech Stack:** NestJS 11 / TypeORM / PostgreSQL / Redis / BullMQ / Jest / k6 / GitHub Actions / Docker.

**Spec:** `D:\Github\imodelhub-services\docs\AUDIT-2026-10-12.md`、`docs\BACKLOG.md`、`docs\superpowers\specs\2026-10-12-rbac-authorization-design.md`、`2026-10-13-p2-concurrency-design.md`、`2026-10-13-p3-performance-design.md`、`2026-10-13-p4-engineering-design.md`。

## Global Constraints

- 官方 SDK 契约优先：`@itwin/imodels-client-authoring` / `itwins-client` 实测全链路必须保持绿。
- 不恢复 `TEST_MODE`；`/health*` 全桶免疫；`NoStoreInterceptor` 的 `/itwins`、`/imodels` 读缓存口径不得回退。
- 所有 schema 变更必须带迁移（含回滚路径）与孤儿数据清理；所有写路径保持事务/幂等/可回滚。
- 每项完成定义：单测（新增回归钉）+ lint + build + 相关 e2e/集成；发布窗走私有仓镜像重发。
- 不在本计划内改动 flaky 连接类用例的既有口径；新增测试必须确定性与可重跑。

## 项目总览（30 项）

| 主题 | 项 | Wave |
|---|---|---|
| 安全/授权 | P2-01 CORS 锚定、P2-02 trust proxy、P2-03 常量时间 API key、P2-07 管道顺序、P2-12 双日志、P2-13 client userId、P2-14 checkpoint SAS、P2-06 OIDC 状态/XSS | W1（01/02/03/07/12/13）+ W2（14/06） |
| 契约 | P2-15 access-control 成员列表 | W2 |
| 数据完整性 | P2-08 checkpoint FK、P2-09 存储生命周期、P2-10 changeset 预签名、L-07 遗留表 | W2 |
| 并发 | P2-11 定点 UPDATE、L-02 全面事务基建 | W2/W3 |
| 输入/隐私 | P2-05 图片上传 multer、P2-07、P2-12 | W1/W2 |
| 可观测性 | P2-04 metrics 端口、P3-06 Grafana | W3 |
| 性能 | L-03 ETag/304 与压缩分级 | W3 |
| 工程 | P3-01 k6 端口、P3-02 死 env、P3-03 版权头、P3-04 端口语义、P3-05 Procfile、P3-07 TS 严格、P3-08 any、L-04 SBOM、L-05 覆盖/冒烟、L-06 release-it | W4 |

## Wave 1 — 安全与正确性快赢（最先做，全部 S 级）

**DoD**：六项各有失败→通过的单测/集成钉；`npm run test:unit`、`npm run lint`、`npm run build` 全绿；不影响现有 SDK 套件与 verify-stack。

### Task W1-1: P2-01 CORS 允许列表锚定

**Files:**
- Modify: `D:\Github\imodelhub-services\src\main.ts`（`enableCors` origin 回调）
- Test: `test/unit/main.cors.spec.ts`（新建）

**Interfaces:**
- Produces: `isAllowedOrigin(origin, allowedOrigins, nodeEnv): boolean`（抽成可测纯函数，main.ts 消费）

- [ ] **Step 1: 写失败测试**：`ALLOWED_ORIGINS=https://app.example.com` 时，`https://app.example.com.evil.test`、`https://evil.test/app.example.com` 必须 false；精确 origin true；`http://localhost:5300/5301` 按配置 true；development 仅放行 loopback（`localhost`/`127.0.0.1`）。
- [ ] **Step 2: 跑测试确认失败**：`npx jest --config test/jest-unit.json test/unit/main.cors.spec.ts`。
- [ ] **Step 3: 实现**：去掉 `new RegExp(allowed).test(origin)`；配置项仅接受精确 origin 或显式 `^...$` 锚定正则；development 增加 loopback 白名单而非全开；`credentials: true` 仅在 origin 命中时保留。
- [ ] **Step 4: 回归**：新增测试通过；`npx jest --config test/jest-unit.json` 全绿；`npm run lint`。
- [ ] **Step 5: 提交**：`fix(hub): CORS 允许列表锚定+开发态收敛 loopback——审计 P2-01`。

### Task W1-2: P2-02 trust proxy 与限流键

**Files:**
- Modify: `src/main.ts`、`src/config/app.config.ts`、`src/common/throttler/auth-throttler.guard.ts`
- Test: `test/unit/trust-proxy.spec.ts`（新建）

- [ ] **Step 1: 写失败测试**：supertest 两请求带不同 `X-Forwarded-For`，在 `TRUST_PROXY=1` 下 `req.ip` 不同且 AuthThrottlerGuard 计数互不影响；`TRUST_PROXY=0` 时忽略 XFF。
- [ ] **Step 2: 跑测试确认失败**。
- [ ] **Step 3: 实现**：`app.set('trust proxy', <config>)`（默认 1，生产由 env 指定；禁止 `true` 盲信任意 XFF）；AuthThrottlerGuard 键使用 `req.ip` 的解析结果。
- [ ] **Step 4: 回归**：单测全绿 + 登录限流实测（6 次登录第 6 次 429，换 XFF 可继续）。
- [ ] **Step 5: 提交**：`fix(hub): trust proxy 可配+限流按真实客户端 IP——审计 P2-02`。

### Task W1-3: P2-03 常量时间密钥比较

**Files:**
- Create: `src/common/crypto/safe-compare.ts`
- Modify: `src/common/guards/agent-api-key.guard.ts:45`、`src/common/guards/api-key.guard.ts:41`
- Test: `test/unit/safe-compare.spec.ts`

- [ ] **Step 1: 写失败测试**：等长/不等长/空串/前后缀相同密钥；结果正确且不抛长度异常。
- [ ] **Step 2: 跑测试确认失败**。
- [ ] **Step 3: 实现**：`crypto.timingSafeEqual` + 长度不等时先做一次假比较再返回 false。
- [ ] **Step 4: 回归**：两 guard 改用 helper；`rg "apiKey !==|!== apiKey" src/common/guards` 零命中。
- [ ] **Step 5: 提交**：`fix(hub): API key 常量时间比较——审计 P2-03`。

### Task W1-4: P2-07 管道顺序与密钥字段豁免

**Files:**
- Modify: `src/main.ts`（global pipes 顺序）、`src/common/pipes/input-sanitization.pipe.ts`
- Test: `test/unit/input-sanitization.pipe.spec.ts`（补充）

- [ ] **Step 1: 写失败测试**：密码含 `<`、`&`、允许标签时注册/登录一致；displayName XSS 仍被清洗；token 字段不被改写。
- [ ] **Step 2: 跑测试确认失败**。
- [ ] **Step 3: 实现**：sanitize 先于 validate，或对 `password`/`token`/`refreshToken` 等字段显式跳过 HTML 清洗；字段名单集中在一处。
- [ ] **Step 4: 回归**：单测 + 认证 e2e（注册→登录→refresh）绿。
- [ ] **Step 5: 提交**：`fix(hub): 清洗先于校验+密钥字段豁免——审计 P2-07`。

### Task W1-5: P2-12 去除重复请求日志

**Files:**
- Modify: `src/common/logger/logger.config.ts`、`src/common/middleware/request-logger.middleware.ts`、`src/app.module.ts`
- Test: `test/unit/request-logging.spec.ts`（新建）

- [ ] **Step 1: 写失败测试**：一次请求只产生一条 access 日志（mock logger 计数）；5xx 仍带 requestId/耗时。
- [ ] **Step 2: 跑测试确认失败**。
- [ ] **Step 3: 实现**：保留 pino auto logging，移除自定义 RequestLoggerMiddleware（或反之），避免双写。
- [ ] **Step 4: 回归**：单测 + 本地栈一次请求日志计数实测。
- [ ] **Step 5: 提交**：`fix(hub): 去除重复请求日志——审计 P2-12`。

### Task W1-6: P2-13 禁止客户端指定 briefcase 属主

**Files:**
- Modify: `src/imodels/briefcases.controller.ts:117-145`、`src/imodels/dto/create-briefcase.dto.ts`
- Test: `test/unit/briefcases.owner.spec.ts` + `test/integration/` 权限矩阵补例

- [ ] **Step 1: 写失败测试**：普通用户 JWT + 他人 `userId` 创建 briefcase，结果属主必须是 JWT 用户或 403；服务账号通道可按文档指定属主。
- [ ] **Step 2: 跑测试确认失败**。
- [ ] **Step 3: 实现**：DTO 的 `userId` 仅服务账号分支消费；普通用户强制 JWT 身份；同族 create/update DTO 做一次 sweep。
- [ ] **Step 4: 回归**：权限矩阵 16/16 + 并发 e2e 8/8 保持绿。
- [ ] **Step 5: 提交**：`fix(hub): briefcase 属主取 JWT 身份——审计 P2-13`。

## Wave 2 — 契约与数据完整性（8 项）

> 每项仍是独立任务，开工时按本文件的 DoD 补 TDD 步骤；验收命令统一：
> `npx jest --config test/jest-unit.json`、`npm run test:e2e`、`npm run lint`、`npm run build`。

- [ ] **P2-15** access-control 成员列表：`id` 返回成员行 UUID、`roles` join 真实 `{id,displayName}`、新 iTwin 默认角色种子；PATCH/DELETE 用返回 id 成功；前端 Share 对话框去 UUID 守卫。Files: `src/access-control/access-control.controller.ts:203-279`、`.../access-control-user-member.repository.ts`、role seed。
- [ ] **P2-08** checkpoints 外键 + 孤儿清理：迁移加 FK（CASCADE/SET NULL 按父表裁定）、先清理孤儿、`information_schema` 断言。Files: `src/database/migrations/20260307000005-CreateCheckpointsTable.ts`、`checkpoint.entity.ts`。
- [ ] **P2-10** changeset 预签名读时重签：不再持久化 24h URL；list/detail 每次 mint 短 TTL URL；过期可恢复。Files: `changesets.service.ts:671-684`、`changesets.controller.ts:128-157`、`changeset.entity.ts:106`。
- [ ] **P2-14** checkpoint SAS 短 TTL：clone/fork/baseline 不再持久化 30 天 SAS；GET 时 mint 5–15 分钟；与 MS/WA 协调刷新。Files: `imodels.service.ts:83-84,480-500,941-960`、`checkpoints.controller.ts:59-66`、`itwin-azure-storage.adapter.ts:295-345`。
- [ ] **P2-05** 图片上传 multer 配置：storage/limits/MIME/文件数；返回真实文件名与可访问 URL；大文件内存有界。Files: `itwins.controller.ts:459-469`、file service/repository。
- [ ] **P2-09** 存储生命周期：iModel/changeset 删除清理 baseline/changeset/thumbnail blob；幂等清理 job + 保留期；跨租户隔离。Files: `imodels.service.ts:295-318`、`changesets.service.ts:218-230`、`storage.port.ts`、`src/imodels/jobs/`。
- [ ] **P2-06** OIDC 状态与 XSS：授权码/设备码/token 落 Redis（多副本）；device 页输出转义；`/oauth/authorize` 认证流可完成。Files: `oidc.service.ts:36-46,303-391`、`oidc.controller.ts:114-174,423-489`。
- [ ] **L-07** 遗留 `itwin_members` 表退役：确认零行/零读后迁移 drop + 删实体；相关 e2e 绿。Files: `itwin-member.entity.ts`、两个迁移文件、`itwin-members.service.ts:30`。

## Wave 3 — 并发、可观测性与性能（5 项）

- [ ] **P2-11** 定点 UPDATE：itwin/imodel/briefcase/user 仓储改 `UPDATE ... RETURNING`，消除读-改-写丢失窗口；查询计数钉。Files: 四仓 `*.repository.ts`。
- [ ] **L-02** 全面事务基建：先出跨模块写路径清单与幂等策略（spike），再逐流程接入 `runInTransaction`；故障注入测试（每个写点之间）全有或全无。Files: `transaction.util.ts`、多服务。
- [ ] **P2-04** metrics 端口/鉴权：`METRICS_PORT` 真正监听；生产 `/metrics` 不在 APP_PORT 裸奔；Prometheus 改抓正确端口；health 不受影响。Files: `metrics.module.ts:11-14`、`app.config.ts:224-233`、`monitoring/prometheus.yml:15-18`。
- [ ] **P3-06** Grafana 仪表盘：提交 HTTP rate/latency/error + webhook 队列 dashboard JSON，Grafana API 验收。Files: `monitoring/grafana/provisioning/dashboards/`。
- [ ] **L-03** ETag/304 与压缩分级：仅对明确可缓存端点启用条件 GET；认证动态响应保持 `no-store`；Range/下载路径不回归；基准数据入档。Files: `main.ts:175-179`、`no-store.interceptor.ts`、`compression.middleware.ts`。

## Wave 4 — 工程护栏（11 项）

- [ ] **P3-01** k6 默认 `:4000` 且去 `/api`；本地栈 k6 冒烟绿。Files: `test/load/k6.config.ts:14,21`、`test/load/README.md`、`test/load/scripts/*.sh`。
- [ ] **P3-02** 清死 env：`WORKER_HOST`/`AZURITE_QUEUE_ENDPOINT`/`AZURITE_TABLE_ENDPOINT`；跨仓确认无消费后删除。Files: `env-example-relational:86,92-93`。
- [ ] **P3-03** 版权头统一品牌/SPDX。Files: `api-key.guard.ts:2`、`imodels-admin.controller.ts:2`。
- [ ] **P3-04** 端口语义统一 `APP_PORT`（CI/package/e2e/k6）。Files: `startup.relational.ci.sh:9`、`package.json:37`、`k6.config.ts:14`、`env-example-relational:2`。
- [ ] **P3-05** 删除/标注 Heroku `Procfile`。Files: `Procfile:1-2`。
- [ ] **P3-07** TS 严格化（逐 flag）：`noUncheckedIndexedAccess`、`strictPropertyInitialization`；tsc/build/测试保持绿。Files: `tsconfig.json:23-25`、实体/DTO。
- [ ] **P3-08** `no-explicit-any` 开为 warn/error；基线清理 + 少量 justified allowlist。Files: `eslint.config.mjs:47`。
- [ ] **L-04** 依赖漏洞/SBOM 门：CI 产出报告，high/critical 失败或建 tracked issue；例外带到期。Files: `.github/workflows/ci.yml`、`renovate.json`。
- [ ] **L-05** 覆盖率棘轮 + 29 控制器冒烟补齐。Files: `test/jest-unit.json`、`test/integration/smoke-crud.e2e-spec.ts`。
- [ ] **L-06** release-it 自动化：dry-run/gated workflow 生成版本/CHANGELOG/tag/Release；镜像链不变。Files: `package.json:41,181-205`、`.github/workflows/`。
- [ ] **P1 #31 复核**：`webhook-seed.service.ts:28-35` 生产跳过 webhook 种子与文档「P1 全闭」矛盾——确认是否仍为有意设计；若是债务，纳入本波修复并更新审计台账。

## 验收与发布

- 每波结束：`npm run test:unit`（当前 700 基线只增不减）、`npm run test:e2e`、`npm run lint`、`npm run build` 全绿；镜像经私有仓 `build-images/publish` 重发；总仓 `verify-stack.ps1` 17/17。
- 安全类改动（W1/W2 安全项）发布前做一次 OWASP 走查：CORS 欺骗、登录枚举、SAS 泄露、XSS。
- 回退：每项独立 commit，镜像 tag 保留上一版；schema 迁移必须可逆。

## 风险

- P2-14/P2-09 涉及 MS/WA/对象存储跨仓协调，先出接口契约再动代码。
- P2-06 OIDC 需要前端登录/回调设计，可能拉长到独立子项目。
- L-02/P3-07 是大范围机械改动，必须分小批合入，避免阻塞发布窗。
