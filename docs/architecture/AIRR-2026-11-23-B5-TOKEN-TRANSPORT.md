# AIRR：G1 B5a 查询串 token 退役与 URL/日志最小化

- 标题：G1 B5a — 移除 `?token=` 传输并最小化 URL/token 日志
- 日期：2026-11-23
- Owner：平台/安全（owner directive 2026-11-23）
- 关联 Issue/需求：`G1-EXECUTION-PLAN.md` WS-B B5（token 全生命周期）；`IDENTITY-ACL-DESIGN.md` §2.5/§3.2；`SESSION-ISOLATION-DESIGN.md` §3.1
- 预计影响仓：私有 `luban-backend/modeling-server`、公共仓 `services/bff`、公共仓 `docs/architecture`
- 是否需要 ADR：**否（本切片不新增令牌契约/schema/渲染/求解器接口）**。身份归因总体方向另见 `ADR-G0-16-identity-attribution.md`（Proposed，未 ARB 签字）。兼容回滚开关登记为 `EXCEPTIONS.md` X-18。

> 状态：**Owner directive 2026-11-23 授权实施；ARB 签字未记录（Proposed）**。本 AIRR 不勾选任何 G1 Gate 项；B5 的登出/撤权/改密即时失效与旧 WS 关闭仍阻塞于 Hub B1.2。

---

## 1. 目标与验收

### 1.1 用户问题/业务目标

只读审计确认 token 仍可经 URL 查询串传输，且建模服务（MS）在 401/429/安全日志中输出含查询串的 URL。查询串会进入浏览器历史、反向代理/访问日志、错误采集与工单，是 token 泄露的独立通道。本切片把该通道默认关闭，并让生产日志不再输出查询串或 token-like 值。

### 1.2 可观察验收标准

1. **默认拒绝**：MS 的 `/ipc`、`/ws` WebSocket 升级与 HTTP RPC guard，以及 BFF `/api/*`，在默认配置下收到非空 `?token=` 时失败关闭（HTTP 401；WS 升级拒绝，沿用现有 `verifyClient` 的 401 语义），且**不**调用 Hub `/auth/me`、**不**放行到下游。
2. **合法传输不回归**：`Authorization: Bearer` 与同源 `luban_cad_auth` cookie 仍按原语义工作；前端 viewer 现有 cookie 传输与 nginx 主日志（只记 `$uri`）不修改。
3. **兼容窗口显式**：仅当显式设置 `SESSION_TOKEN_VIA_QUERY=allow` 时才接受查询串 token；MS 启动时必须打印脱敏告警，使用查询串的请求产生脱敏告警；该窗口登记在 `EXCEPTIONS.md` X-18。
4. **日志最小化**：MS 的 401/503 RPC guard 日志、429 限流日志、安全审计日志、请求完成日志与 RPC 500 错误日志只输出 **method + pathname**；任何 `?token=`、`access_token=`、`id_token=`、`refresh_token=` 与非空 JWT 形态值不得出现在日志字段中。
5. **测试可复核**：新增/改写单元测试覆盖默认拒绝、兼容开关、cookie/header 不回归、三类 token 参数与 JWT 的脱敏。

### 1.3 非目标（明确不做）

- 不做 Hub 会话绑定 token 撤销（B1.2a，hub 代码不在本任务所有权内）。
- 不做 MS WS 连接建立后的周期复验/登出关闭（B1.2b，需要连接身份上下文）。
- 不实现 OBO/service token、per-document ACL、PDP、写租约改造。
- 不删除 `Authorization`/cookie 传输；不引入一次性 WS ticket。
- 不修改前端 viewer、`deploy/nginx.conf`、`deploy/default.conf.template`。
- 不清理历史日志/工单中的既有 token；不建设日志轮转/脱敏管道（后续 B8）。
- 不承诺“全部入口零 token”；本切片只覆盖上述 MS/BFF 入口与日志点。

---

## 2. 关联项目能力清单

| 项目/仓 | 相关能力 | 现有 API/工具/实现 | 版本/路径 | 结论 |
|---|---|---|---|---|
| itwinjs-core | WS/IPC 升级与 `verifyClient` | `express-ws` + 标准 `LocalhostIpcHost`；无第二套 WS 栈 | `itwinjs-core/core/backend` | 复用；不改 fork |
| luban-cad/packages/viewer | WS 握手 token 传输 | 同源 `luban_cad_auth` cookie；日志只记 origin/path | `packages/viewer/src/host/web-initializer.ts` | 复用，不修改 |
| luban-cad/packages/shared | 契约 | 本切片无 RPC/接口变更 | `packages/shared` | 不适用 |
| luban-backend/modeling-server | WS/RPC 认证 | `extractToken`（header/cookie/query）、`verifyWsUpgrade`、`rpcGuard`、`validateToken` | `src/middleware/wsAuth.ts`、`rpcGuard.ts` | 扩展：单一提取器 + 配置门 |
| luban-backend/modeling-server | 日志 | 自研 `logger`；401/429/安全/RPC 错误日志 | `src/utils/logger.ts`、`src/middleware/security.ts`、`src/main.ts` | 扩展：统一脱敏 helper |
| imodelhub-services | token 校验 | `/auth/me` 仅被调用；本切片不改 hub | 私有仓 | 复用，不修改 |
| services/bff | `/api` JWT 终止 | `extractToken` 三形态；`createApp` 中间件 | `services/bff/src/{auth,app,config}.ts` | 扩展：同一配置门 |
| 官方 clients/BisSchemas | 认证头 | `Authorization: Bearer` | — | 复用 |
| DanQing/参考项目 | — | 无 | — | 不适用 |

---

## 3. 复用决策矩阵

| 需求能力 | 候选复用 | 覆盖度 | 决策 | 不新建的理由/新建的理由 | 许可证 |
|---|---|---|---|---|---|
| token 提取 | MS `extractToken` / BFF `extractToken` | 已支持 header/cookie/query | **扩展**：同一函数加 `allowQueryToken` 选项与查询串探测，不新增认证路径 | 保持单一提取器，避免第二套 auth | MIT（仓内） |
| 配置校验 | MS `zod` config schema；BFF `loadConfig` fail-fast；开关名沿用 `SESSION-ISOLATION-DESIGN.md` §7.1 | 已支持 env → typed config | **扩展**：`SESSION_TOKEN_VIA_QUERY` 枚举，默认 deny | 沿用既有模式与既有开关名 | MIT（仓内） |
| WS 拒绝语义 | `main.ts` `verifyClient` 回调 `(false, 401)` | 已存在 | **复用**：返回 false 即 401 | 不改 WS 生命周期 | MIT（仓内） |
| 日志脱敏 | 无现成 helper | — | **新建** `utils/logSanitize.ts`（纯函数） | 集中一处，可单测；避免各调用点手写 split | MIT（仓内） |
| 反向代理脱敏 | `deploy/nginx.conf` 已用 `$uri` | 已满足 | **复用，不修改** | 防止回归即可 | — |

**规则**：优先复用；新建的只有两个小函数（URL 取 path、token-like 文本脱敏），理由是现有代码无等价实现且需要统一回归测试。

---

## 4. 跨仓影响

| 仓/层 | 契约 | schema/迁移 | native/接口 | 测试 | 发布 |
|---|---|---|---|---|---|
| web | 无 | 无 | 无 | 不涉及 | 无 |
| shared | 无 | 无 | 无 | 不涉及 | 无 |
| viewer | 无（继续 cookie；已核对 `web-initializer.ts` 不把 token 放 URL） | 无 | 无 | 不涉及 | 无 |
| editor | 无 | 无 | 无 | 不涉及 | 无 |
| itwinjs-core | 无 | 无 | 无 | 不涉及 | 无 |
| imodel-native | 无 | 无 | 无 | 不涉及 | 无 |
| modeling-server | 内部认证行为收紧；无跨仓 DTO | 无 | 无 | wsAuth/rpcGuard/security/config/logSanitize 单测 | 需重建/重启 MS 生效 |
| webhook-agent | 无（不接触用户 token） | 无 | 无 | 不涉及 | 无 |
| hub/DanQing | 无修改；仅减少被调用次数（被拒绝请求不再打 `/auth/me`） | 无 | 无 | 不涉及 | 无 |
| services/bff | `/api` 认证行为收紧；env 新增 `SESSION_TOKEN_VIA_QUERY` | 无 | 无 | app/config 单测 | 需重建 BFF 镜像/重启 |

- 版本兼容矩阵：无 shared 契约变更；MS/BFF 可独立发布。
- 配对 PR：MS 变更 + BFF 变更 + 公共文档（本 AIRR/ADR/EXCEPTIONS/索引）同批。
- 发布顺序：MS 与 BFF 可同时或任一先后；两者默认均为 deny，不存在一侧依赖另一侧的兼容窗口。
- 回滚：单侧设置 `SESSION_TOKEN_VIA_QUERY=allow` 并重启即可恢复旧行为；见 §8。

---

## 5. 数据/事务/安全

- 数据事实源：无数据变更；认证结果仍以 Hub `/auth/me` 为准。
- schema/params 变化与迁移：无。
- 旧数据 fixture：不适用。
- 事务边界：本切片在认证中间件，不进入 `BriefcaseTxns`；不触碰 FeatureOp/直改/undo。
- Undo/redo：不适用（无用户可见写操作）。
- 写租约/权限/限流：限流不变；仅 429 日志字段脱敏。认证失败不改变限流计数语义。
- 密钥/日志/审计：
  - 不接受查询串 token 后，MS/BFF 不再把 token 写入 URL 相关日志。
  - 日志 helper 只输出 pathname，并额外脱敏 `token`/`access_token`/`id_token`/`refresh_token` 参数值与 JWT 形态串。
  - 兼容窗口开启时记录“已接受查询串 token”的脱敏告警（无 token 值），作为审计证据。

### 5.1 受影响入口与失败语义

| 入口 | 位置 | 默认（deny）行为 | 兼容（allow）行为 |
|---|---|---|---|
| MS WS 升级 `/ipc`、`/ws` | `wsAuth.verifyWsUpgrade` → `main.ts` `verifyClient` | 非空 `?token=` → `verifyWsUpgrade=false` → 升级拒绝（401，沿用现有回调）；不验 token | header > cookie > query；query 命中时脱敏告警 |
| MS HTTP RPC | `rpcGuard` | 非空 `?token=` → 401 `Unauthorized`，消息 `Authentication token must not be sent in the URL`；不调用 Hub | 同上；query 命中时脱敏告警 |
| BFF `/api/*` | `services/bff/src/app.ts` | 非空 `?token=` → 401 `Unauthorized`，同一消息；不代理、不调用 Hub | 同上；启动时告警 |
| MS 401/503/429/安全/RPC 500 日志 | `rpcGuard.ts`、`security.ts`、`logger.ts`、`main.ts` | method + pathname；无查询串、无 token-like 值 | 同左（允许兼容不等于允许泄露） |

**统一语义**：

- deny 模式下，只要请求携带非空 `token` 查询参数即拒绝，即使同时带有合法 header/cookie；这是显式的“旧客户端必须升级”信号，避免静默忽略后行为不确定。
- 无 token、无效 token、Hub 不可用的既有 401/503 语义不变。
- 拒绝路径不降级为匿名、不降级为服务账号、不回退到其他凭据。
- WS 拒绝沿用现有 `verifyClient` 回调：`callback(false, 401, 'Unauthorized')`；不新增 close code 协议。
- 错误响应不回显 token 或查询串。

### 5.2 配置与回滚

| 服务 | 配置 | 取值 | 默认 | 行为 |
|---|---|---|---|---|
| MS | `SESSION_TOKEN_VIA_QUERY` | `deny` / `allow` | `deny` | `allow` = 显式兼容窗口；启动 warn |
| BFF | `SESSION_TOKEN_VIA_QUERY` | `deny` / `allow` | `deny` | `allow` = 显式兼容窗口；启动 warn |

- 回滚步骤：在对应服务设置 `SESSION_TOKEN_VIA_QUERY=allow` 并重启；记录变更单与原因；到期前恢复 `deny`。
- 部署注记：MS 宿主进程经根 `.env` 读取该键；BFF 的 compose `environment` 列表本切片未改（不在文件所有权内），缺省即 deny；如确需 BFF 回滚窗口，需在 BFF 部署面显式注入该键并同样登记 X-18。
- 兼容窗口为**例外**，登记 `EXCEPTIONS.md` X-18（owner/失效日期/退出计划）。
- 不做“静默自动回退”：配置非法值在启动时失败（MS zod / BFF `loadConfig` throw）。

---

## 6. 性能与渲染

- 性能预算：认证路径只增加一次查询串解析（`URLSearchParams`，微秒级）；拒绝路径不增加 Hub 往返，实际降低负载。
- 大模型/规模测试：不适用。
- 渲染路径：不涉及。
- 视觉基线：不涉及。

---

## 7. 测试证据

### 7.1 单元（计划 → 结果）

| 测试 | 覆盖 | 结果 |
|---|---|---|
| `modeling-server/src/utils/logSanitize.test.ts`（新） | pathname-only；`?token=`/`access_token=`/`id_token=`/`refresh_token=`/JWT 脱敏；空值 | **通过**（合并运行） |
| `modeling-server/src/middleware/wsAuth.test.ts` | 默认拒绝 query-only、cookie+query；兼容开关接受；cookie/header/无效 token 不回归；不调用 Hub | **通过**（合并运行） |
| `modeling-server/src/middleware/rpcGuard.test.ts` | 默认拒绝 query-only、cookie+query；兼容开关接受；401/503 日志脱敏 | **通过**（合并运行） |
| `modeling-server/src/middleware/security.test.ts` | 429 日志只含 pathname；安全审计日志脱敏 | **通过**（合并运行） |
| `modeling-server/src/config.test.ts` | 默认 `deny`；`allow` 显式；非法值退出 1 并点名 | **通过（12/12）** |
| `services/bff/test/app.test.ts` | 默认拒绝 query；兼容开关接受；cookie/Bearer 不回归；配置默认/非法值 | **通过（22/22）** |

### 7.1.1 实际运行记录（2026-11-23）

```text
# modeling-server（5 个文件：logSanitize/wsAuth/rpcGuard/security/config）
Test Files  5 passed (5)   Tests  76 passed (76)

# services/bff
Test Files  1 passed (1)   Tests  22 passed (22)

# 类型检查
modeling-server: npx tsc --noEmit  -> exit 0
services/bff:    npx tsc --noEmit  -> exit 0
```

- ESLint（仅触及的 MS 文件）：新文件/新代码无新增错误；`config.ts`/`logger.ts` 报出的 `no-deprecated`/`no-console`/命名规则为既有债务，未在本切片扩大。
- 未运行全量 MS 测试套件（含 native/feature 依赖）；本切片的认证/日志模块已由上述窄测试覆盖。

### 7.2 真栈 e2e（本切片）

- 认证行为可用单元/本地 mock 完整覆盖，不依赖真实 Hub 数据。
- **栈状态（2026-11-23 检查）**：`nginx`/`web`/`imodelhub`/`webhook-agent`/`luban-bff` 容器在跑；**MS 宿主 :5401 未运行**，运行中的 BFF 容器为 24h 前旧构建（不含本切片）。因此**未验证**真实 MS WS/HTTP 401 行为，也**不宣称真栈绿**。
- 需在栈可用且 MS/BFF 重新构建后复核 §7.3 的 WS/HTTP 负例；BFF 回滚开关若要在 compose 形态使用，还需在 BFF 部署面注入 `SESSION_TOKEN_VIA_QUERY`（见 §5.2 部署注记）。
- B1.2 的真栈项（登出后旧 WS 关闭、撤权后下一次请求 403）不在本切片，仍为阻塞项。

### 7.3 手工复核（栈可用时）

```powershell
# 默认 deny：query token 必须被拒绝（占位值不是真实 token）
# WS：预期 HTTP 401 / 升级失败
curl.exe -i --http1.1 -H "Connection: Upgrade" -H "Upgrade: websocket" `
  -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" `
  "http://localhost:5401/ipc?token=placeholder-not-a-real-token"
# HTTP RPC：预期 401，且 MS 日志无 token/查询串
curl.exe -i "http://localhost:5401/LubanCAD/v1.0/mode/1/op?token=placeholder-not-a-real-token"
```

### 7.4 失败注入/负路径

- Hub 不可用且带 header token → 仍 503（既有测试）。
- Hub 不可用且带 query token（deny）→ 401 且不触发 Hub 调用（新增测试）。
- 日志注入：`?token=...&access_token=...&id_token=...` 与 JWT 形态串 → 断言日志中无原值。

---

## 8. 回滚与发布

- 回滚方式：`SESSION_TOKEN_VIA_QUERY=allow` + 重启（仅限登记窗口）；不涉及代码回退。
- 数据迁移回滚：不适用。
- 产物/镜像 provenance：MS/BFF 需重建产物；发布清单记录 commit/digest（发布由 release owner 执行）。
- 兼容窗口：默认关闭；任何开启都登记 X-18，最长到 2026-12-31。
- 发布门：`verify-stack` 全绿；确认 nginx 主日志仍不记查询串；确认前端仍走 cookie。
- 不 commit/push/publish（本任务约束）。

---

## 9. 评审结论

- 复用矩阵完成：是
- 跨仓影响明确：是
- P0 例外已登记：是（X-18，仅回滚窗口）
- ADR：不需要新增；`ADR-G0-16` 作为总体身份归因草案另行提出（Proposed，未 ARB 签字）
- Owner 签字：owner directive 2026-11-23（实施授权）；ARB 签字未记录
- 结论：按 owner directive 实施 B5a；B1.2a/B1.2b 顺延为下一批（见 §10）

## 10. 后续切片（本任务不实施）

1. **B1.2a（Hub）**：session-bound token 撤销——logout/改密/停用后 access token 与 OBO 立即失效；Hub JWT 策略查 session；撤销记录按 `sid`/`jti`。hub 代码所有权不在本任务。
2. **B1.2b（MS）**：WS 连接建立后周期复验、登出/撤权关闭连接（401/4401 + close）；连接 principal 进入 handler 上下文。
3. B5 剩余：Bearer 形态统一、裸 JWT/`Authorization` 兼容清理、token 全生命周期真栈证据。
