# hub W1 安全与正确性快赢 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 imodelhub P2/P3 长尾 Wave 1 六项安全/正确性快赢（CORS、trust proxy、常量时间 key、管道顺序、重复日志、briefcase 属主）。

**Architecture:** 六项均为独立小改，按顺序执行（共享 `src/main.ts` 的三项串行）；每项 TDD + 单测/集成钉 + lint/build。

**Tech Stack:** NestJS 11 / TypeScript / Jest / supertest / Express.

**Spec:** `docs/superpowers/plans/2026-10-27-hub-p2-p3-backlog.md`（Wave 1）；`D:\Github\imodelhub-services\docs\AUDIT-2026-10-12.md`。

## Global Constraints

- 官方 SDK 契约优先：`@itwin/imodels-client-authoring` / `itwins-client` 实测全链路必须保持绿。
- 不恢复 `TEST_MODE`；`/health*` 全桶免疫；`NoStoreInterceptor` 的 `/itwins`、`/imodels` 读缓存口径不得回退。
- 每项完成定义：单测（新增回归钉）+ lint + build；不引入新依赖。
- 实现仓为 `D:\Github\imodelhub-services`（独立 git 仓，main 分支）；**只本地 commit，不 push**（推送由控制方在波次收口时征询用户）。
- 该仓 pre-commit 钩子已知损坏；提交失败时用 `--no-verify`。
- 测试命令：`npx jest --config test/jest-unit.json <path>`；全量：`npx jest --config test/jest-unit.json`；lint：`npm run lint`；build：`npm run build`。

### Task 1: P2-01 CORS 允许列表锚定

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

### Task 2: P2-02 trust proxy 与限流键

**Files:**
- Modify: `src/main.ts`、`src/config/app.config.ts`、`src/common/throttler/auth-throttler.guard.ts`
- Test: `test/unit/trust-proxy.spec.ts`（新建）

- [ ] **Step 1: 写失败测试**：supertest 两请求带不同 `X-Forwarded-For`，在 `TRUST_PROXY=1` 下 `req.ip` 不同且 AuthThrottlerGuard 计数互不影响；`TRUST_PROXY=0` 时忽略 XFF。
- [ ] **Step 2: 跑测试确认失败**。
- [ ] **Step 3: 实现**：`app.set('trust proxy', <config>)`（默认 1，生产由 env 指定；禁止 `true` 盲信任意 XFF）；AuthThrottlerGuard 键使用 `req.ip` 的解析结果。
- [ ] **Step 4: 回归**：单测全绿 + 登录限流实测（6 次登录第 6 次 429，换 XFF 可继续）。
- [ ] **Step 5: 提交**：`fix(hub): trust proxy 可配+限流按真实客户端 IP——审计 P2-02`。

### Task 3: P2-03 常量时间密钥比较

**Files:**
- Create: `src/common/crypto/safe-compare.ts`
- Modify: `src/common/guards/agent-api-key.guard.ts:45`、`src/common/guards/api-key.guard.ts:41`
- Test: `test/unit/safe-compare.spec.ts`

- [ ] **Step 1: 写失败测试**：等长/不等长/空串/前后缀相同密钥；结果正确且不抛长度异常。
- [ ] **Step 2: 跑测试确认失败**。
- [ ] **Step 3: 实现**：`crypto.timingSafeEqual` + 长度不等时先做一次假比较再返回 false。
- [ ] **Step 4: 回归**：两 guard 改用 helper；`rg "apiKey !==|!== apiKey" src/common/guards` 零命中。
- [ ] **Step 5: 提交**：`fix(hub): API key 常量时间比较——审计 P2-03`。

### Task 4: P2-07 管道顺序与密钥字段豁免

**Files:**
- Modify: `src/main.ts`（global pipes 顺序）、`src/common/pipes/input-sanitization.pipe.ts`
- Test: `test/unit/input-sanitization.pipe.spec.ts`（补充）

- [ ] **Step 1: 写失败测试**：密码含 `<`、`&`、允许标签时注册/登录一致；displayName XSS 仍被清洗；token 字段不被改写。
- [ ] **Step 2: 跑测试确认失败**。
- [ ] **Step 3: 实现**：sanitize 先于 validate，或对 `password`/`token`/`refreshToken` 等字段显式跳过 HTML 清洗；字段名单集中在一处。
- [ ] **Step 4: 回归**：单测 + 认证 e2e（注册→登录→refresh）绿。
- [ ] **Step 5: 提交**：`fix(hub): 清洗先于校验+密钥字段豁免——审计 P2-07`。

### Task 5: P2-12 去除重复请求日志

**Files:**
- Modify: `src/common/logger/logger.config.ts`、`src/common/middleware/request-logger.middleware.ts`、`src/app.module.ts`
- Test: `test/unit/request-logging.spec.ts`（新建）

- [ ] **Step 1: 写失败测试**：一次请求只产生一条 access 日志（mock logger 计数）；5xx 仍带 requestId/耗时。
- [ ] **Step 2: 跑测试确认失败**。
- [ ] **Step 3: 实现**：保留 pino auto logging，移除自定义 RequestLoggerMiddleware（或反之），避免双写。
- [ ] **Step 4: 回归**：单测 + 本地栈一次请求日志计数实测。
- [ ] **Step 5: 提交**：`fix(hub): 去除重复请求日志——审计 P2-12`。

### Task 6: P2-13 禁止客户端指定 briefcase 属主

**Files:**
- Modify: `src/imodels/briefcases.controller.ts:117-145`、`src/imodels/dto/create-briefcase.dto.ts`
- Test: `test/unit/briefcases.owner.spec.ts` + `test/integration/` 权限矩阵补例

- [ ] **Step 1: 写失败测试**：普通用户 JWT + 他人 `userId` 创建 briefcase，结果属主必须是 JWT 用户或 403；服务账号通道可按文档指定属主。
- [ ] **Step 2: 跑测试确认失败**。
- [ ] **Step 3: 实现**：DTO 的 `userId` 仅服务账号分支消费；普通用户强制 JWT 身份；同族 create/update DTO 做一次 sweep。
- [ ] **Step 4: 回归**：权限矩阵 16/16 + 并发 e2e 8/8 保持绿。
- [ ] **Step 5: 提交**：`fix(hub): briefcase 属主取 JWT 身份——审计 P2-13`。

## 验收

六项全部完成后：`npx jest --config test/jest-unit.json` 全绿（当前 700，基线只增不减）、`npm run lint`、`npm run build`；镜像重发与 `verify-stack` 由波次收口统一执行。
