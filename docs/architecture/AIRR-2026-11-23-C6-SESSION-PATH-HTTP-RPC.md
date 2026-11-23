# AIRR：G1 C6 — 配置脱敏与有状态 HTTP RPC 关闭

- 标题：modeling-server `getConfiguration` 不再返回宿主绝对路径；有状态 RPC 默认只能经已认证 `/ipc` WebSocket；`saveChanges/pushChanges` 补写租约校验
- 日期：2026-11-23
- Owner：平台/安全（G1 C6 验证切片）
- 关联：`docs/architecture/SESSION-ISOLATION-DESIGN.md` §4.4 第 5 条（BC-15，路径不出网）、§10 开放问题 8（HTTP RPC）；`docs/architecture/G1-EXECUTION-PLAN.md`（G1 会话隔离）；C6 只读审计（2026-11-23）；`EXCEPTIONS.md` X-19
- 预计影响仓：私有 `luban-backend/modeling-server`（middleware/config/RPC/IPC 测试）；公共文档。`shared`/`web`/`viewer`/`editor`/`imodelhub-services` **不改**
- 是否需要 ADR：**否**。不新增 RPC/契约/schema/数据迁移；只收紧既有 HTTP 面的可达性并删除一个静态配置字段

> 状态：**实施完成（单元/静态检查；Proposed，ARB 签字未记录）**。真栈未执行；
> 不勾选 G1 Gate、不宣称真栈绿。

---

## 1. 目标与验收

### 1.1 审计事实（C6 只读审计）

1. `modeling-server/src/rpc/LubanRpcImpl.ts` 的 `getConfiguration()` 返回
   `cacheDir: config.BRIEFCASE_CACHE_LOCATION`，把宿主绝对路径经 RPC 回给客户端，
   违反 `SESSION-ISOLATION-DESIGN.md` §4.4 第 5 条“服务端路径不出网”。
2. HTTP RPC 面 `GET/POST /:title/:version/mode/*`（`src/main.ts`）只做 JWT 认证
   （`src/middleware/rpcGuard.ts`），没有连接会话。`src/session/guards.ts` 对
   “无 SessionContext” 的调用按 legacy/unit/HTTP 放行，因此 HTTP 调用可以触达
   **有状态/文档绑定** 操作（briefcase、save/push/undo 类、Feature RPC、`terminate`），
   绕过 `/ipc` 的连接会话与所有权边界。这是设计开放问题 8 的缺口。
3. `src/ipc/AppFunctionIpcHandler.ts` 的 `saveChanges`/`pushChanges` 只做 key 所有权
   （`_assertKey(key, true)`），不校验本会话是否仍持有稳定 docId 的写租约。

### 1.2 验收标准

1. `getConfiguration()` 的返回值不含 `cacheDir`，也不含任何宿主绝对路径；方法签名
   仍是 `Promise<Record<string, string | number | boolean>>`（`shared` 不变）。
2. `HTTP_STATEFUL_RPC_MODE` 默认 `deny`：
   - 有状态操作在 HTTP 面返回稳定 `403` + `code=HttpStatefulRpcDenied`；
   - 不可解析的操作路径返回稳定 `400` + `code=InvalidRpcOperation`；
   - **拒绝发生在 `rpcGuard` 之前**：不调用 Hub `/auth/me`、不打开/写入 briefcase；
   - 纯静态操作与上游只读面（read/tile）继续可经 HTTP 访问；
   - `/ipc`、`/ws` 行为不变。
3. `saveChanges`/`pushChanges` 对“本会话已登记的 rw briefcase”要求写租约：
   无租约（含他人持有）即 `409 DocumentLocked`，且在任何 db 写入前拒绝；
   `SESSION_ISOLATION_MODE=off` 回退旧行为，`shadow` 只告警不阻断。
4. 错误与日志不含 token/secret/宿主路径；HTTP 拒绝日志只含 method + 脱敏 pathname。
5. 单元测试覆盖允许/拒绝/回滚/无 Hub 调用/无路径泄漏；`tsc --noEmit`、ESLint 通过。
6. 真栈双会话 e2e 在栈恢复后执行（本切片只记录手工步骤，不宣称已执行）。

### 1.3 非目标

- 不做 per-document ACL、OBO、真实归因、session TTL、外部 lease/fencing（C5/B3）。
- 不改 Part Studio/草图/FeatureOp/几何内核/native/渲染/Onshape parity。
- 不改 `shared` RPC 接口版本；不新增/删除操作方法；不改调用参数。
- 不处理 `/rpc/metadata`（保持开放，OpenAPI bootstrap 源）。
- 不把 `IModelReadRpcInterface`/`IModelTileRpcInterface` 改为会话绑定；只维持其
  既有只读可达性（开放问题 8 的“保留只读面”分支）。
- 不扩展 `pullChanges`/`abandonChanges`/`toggleGraphicalEditingScope` 的租约门禁
  （见 §8 后续项）。
- 不勾选 G1 Gate。

---

## 2. 复用矩阵

| 需求能力 | 候选复用 | 覆盖度 | 决策 | 不新建的理由 | 许可证 |
|---|---|---|---|---|---|
| 从 RPC URL 解析接口/操作名 | `itwinjs-core/core/common/src/rpc/web/BentleyCloudRpcProtocol.ts` `getOperationFromPath()`（`new URL` + 末段 `<interface>-<version>-<operation>`） | 完整 | **复用**（middleware 接收该 protocol 实例；仅额外做形状校验以返回 400） | 与协议实际分发逻辑同源，避免自造解析器漂移 | MIT（vendored fork 内） |
| HTTP RPC 认证 | `modeling-server/src/middleware/rpcGuard.ts`（B5a 同源 token 提取/校验） | 完整 | **复用且保留**；新门禁串在其前 | 认证语义不变；新门禁只做静态拒绝 | 本仓 |
| 配置/开关校验 | `modeling-server/src/config.ts` zod schema | 完整 | **扩展**：新增 `HTTP_STATEFUL_RPC_MODE` | 与既有 `SESSION_*`、`DIRECT_EDIT_GUARD_MODE` 同风格 | 本仓 |
| 错误码/HTTP 形态 | `SessionError`/`rpcGuard` 的 `{error:{code,message}}` | 完整 | **复用形态**；HTTP 门禁用独立稳定码 | 不把 HTTP 拒绝伪装成 session 错误 | 本仓 |
| 写租约 | `modeling-server/src/feature/WriteLease.ts` `writeLeases.assertHeld(docId, sessionId)` | 完整 | **复用** | 已有稳定 docId/租约；禁止第二套锁 | 本仓 |
| 会话所有权 | `assertSessionKeyAccess` / `sessionRegistry.findOwn` | 完整 | **复用**作为租约前置 | 不重复 key/文件比对 | 本仓 |
| 日志脱敏 | `utils/logSanitize.ts` `sanitizeUrlForLog` | 完整 | **复用** | B5a 已消除 query 串泄漏 | 本仓 |

**结论**：全部复用现有标准入口，无新依赖、无新 RPC、无并行实现。

---

## 3. 精确入口与变更

| 文件 | 入口 | 变更 |
|---|---|---|
| `modeling-server/src/rpc/LubanRpcImpl.ts` | `getConfiguration()` | 删除 `cacheDir`；只保留 `version/apiVersion/maxUploadSize` |
| `modeling-server/src/middleware/httpStatefulRpcGuard.ts`（新） | `httpStatefulRpcGuard(protocol, {mode?})` | 复用协议解析器；静态定义有状态操作；deny 时 403/400，先于认证与协议处理 |
| `modeling-server/src/main.ts` | `GET/POST /:title/:version/mode/*` | 链路改为 `httpStatefulRpcGuard → rpcGuard → protocol`；启动日志打印模式 |
| `modeling-server/src/config.ts` | `HTTP_STATEFUL_RPC_MODE` | `deny|allow`，默认 `deny` |
| `modeling-server/src/ipc/AppFunctionIpcHandler.ts` | `saveChanges` / `pushChanges` | 在 key 所有权之后、db 操作之前校验写租约（stable `docId`） |
| `modeling-server/src/session/guards.ts` | 文件头注释 | 更新“HTTP 有状态缺口”为已在 HTTP 边界关闭 |
| `docs/architecture/EXCEPTIONS.md` | X-19 | 登记 `allow` 回滚窗口（owner/失效日期/退出计划） |
| `docs/architecture/SESSION-ISOLATION-DESIGN.md` | §10 开放问题 8 | 记录 C6 默认 deny 决策 |

### 3.1 有状态判定（封闭清单）

HTTP 面只允许以下**纯静态/只读**操作；其余（含未知接口，fail-closed）一律有状态拒绝：

| 接口 | HTTP 允许 | 拒绝（有状态/文档或会话绑定） |
|---|---|---|
| `LubanRpcInterface` | `getConfiguration` | `acquireBriefcase`、`releaseBriefcase`、`pullChangesets`、`pushChanges`、`compareChangesets`、`readExternalSavedViews`、`writeExternalSavedViews`、`readExternalCameraPaths`、`writeExternalCameraPaths`、`exportIModel`、`terminate`、`detectConflicts`、`resolveConflicts`、`hasLocalChanges` |
| `LubanFeatureRpcInterface` | `getFeatureFormModel`（纯静态注册表投影，忽略 iModelKey） | `listPartStudios`、`createPartStudio`、`renamePartStudio`、`deletePartStudio`、`getFeatureTree`、`applyFeatureOp`、`acquireWriteLease`、`releaseWriteLease`、`previewFeatureOp`、`resolveEdgeRef`、`resolveFaceRef`、`getSketch`、`listSketches`、`getVariables`、`getBodies`、`getMassProperties`、`renameFeature`、`renameBody` |
| `IModelReadRpcInterface` | 全部（上游只读面） | — |
| `IModelTileRpcInterface` | 全部（上游只读/tile 面） | — |
| 其他/未知接口 | — | 全部（fail-closed） |

判定理由：
- `LubanRpcInterface` 的读方法（`compareChangesets`/`detectConflicts`/`hasLocalChanges`/
  `exportIModel`/`readExternal*`）虽不改数据，但靠进程内**全局 key 注册表**解析已打开
  的 briefcase，不是无状态读；HTTP 无会话所有权，故归入拒绝。
- `LubanFeatureRpcInterface` 除 `getFeatureFormModel` 外都需要 `iModelKey` 解析全局
  `IModelDb`/FeatureService；读方法同样可能读到其他会话的已打开文档，故拒绝。
- read/tile 接口是 iTwin 标准只读面，不创建 briefcase、不写会话状态；保留其既有
  HTTP 可达性，符合开放问题 8 的“保留只读面”分支。

### 3.2 拒绝语义与顺序

```text
deny（默认）：
  parse fail                                    -> 400 InvalidRpcOperation（不查 Hub）
  stateful / unknown interface                  -> 403 HttpStatefulRpcDenied（不查 Hub）
  stateless operation                           -> next() -> rpcGuard（认证）-> protocol
allow（仅回滚窗口，X-19）：
  全部 next() -> rpcGuard -> protocol（恢复硬化前行为）
```

- 门禁放在 `rpcGuard` **之前**：拒绝是静态决定，绝不为被拒请求调用 Hub `/auth/me`，
  也不进入协议 handler，因此不会 open/write briefcase。该顺序不构成授权旁路——门禁
  只会拒绝，从不放行未认证请求到协议层（stateless 请求仍需 `rpcGuard` 认证）。
- 403/400 响应体只含稳定 code 与固定文案，不含路径、query、token、接口内部信息。
- 日志只记 method + `sanitizeUrlForLog()` 的 pathname + 接口/操作名。
- `/ipc` 与 `/ws` 不经过该 middleware；会话建立、所有权、租约语义不变。

---

## 4. 跨仓影响

| 仓/层 | 契约 | schema/迁移 | native/接口 | 测试 | 发布 |
|---|---|---|---|---|---|
| web | 无（`getConfiguration`/HTTP RPC 无调用点） | 无 | 无 | 不适用 | 无 |
| shared | 无（签名仍为 `Record`，不 bump） | 无 | 无 | 不适用 | 无 |
| viewer/editor | 无 | 无 | 无 | 不适用 | 无 |
| itwinjs-core | 无（只读复用 `getOperationFromPath`） | 无 | 无 | 不适用 | 无 |
| modeling-server | HTTP 面可达性收紧；`getConfiguration` 字段删除 | 无 | 无 | 新增/更新单测 | 需重启 MS 进程/镜像 |
| webhook-agent | 无 | 无 | 无 | 不适用 | 无 |
| hub/DanQing | 无（被拒请求不访问 Hub） | 无 | 无 | 不适用 | 无 |

- 版本兼容矩阵：无契约版本变化；旧的 HTTP 有状态调用方会收到 403（fail-closed），
  这是本切片的目的。产品前端全部 RPC 走 `/ipc`，无已知调用方。
- 配对 PR：仅本切片；`shared` 不发布。
- 发布顺序：MS 重建/重启即可；无 Hub 依赖。

---

## 5. 数据/事务/安全

- 数据事实源：不变（iModel/BIS + `params`）。
- schema/params 变化与迁移：无。
- 事务边界：`saveChanges`/`pushChanges` 仍需写租约；不改变 `BriefcaseTxns` 语义。
- Undo/redo：不变；不涉及 UI/工具生命周期。
- 写租约/权限/限流：
  - `saveChanges`/`pushChanges`：`_assertKey(key, write)` → 本会话登记的 rw briefcase →
    `writeLeases.assertHeld(record.docId, session.sessionId)`；无租约即 `DocumentLocked`。
  - 无 SessionContext 的 legacy/unit/CLI 调用保持旧行为（生产 `/ipc` 恒有会话）。
  - `SESSION_ISOLATION_MODE=off` 跳过；`shadow` 告警放行；`enforce` 抛错。
  - 不改限流。
- 密钥/日志/审计：HTTP 门禁日志不含 query/token；`getConfiguration` 不含路径；
  租约错误沿用 `WriteLeaseError.code=DocumentLocked`，不新增日志敏感字段。

---

## 6. 性能与渲染

- 性能预算：每个 HTTP RPC 请求增加一次纯字符串路径解析 + Set/Map 查找，
  无 I/O、无 Hub、无 db；`/ipc` 热路径零变化。
- 大模型/规模测试：不适用（不触碰几何/渲染）。
- 渲染路径/视觉基线：不适用。

---

## 7. 测试证据

### 7.1 单元测试（本次执行，见 §7.4 实际输出）

| 测试 | 覆盖 |
|---|---|
| `src/rpc/LubanRpcImpl.test.ts` | `getConfiguration` 不含 `cacheDir`、不含绝对路径；其余字段保留 |
| `src/middleware/httpStatefulRpcGuard.test.ts`（新） | deny：`pushChanges`/`applyFeatureOp`/`getFeatureTree`/未知接口 → 403；stateless `getConfiguration`/`getFeatureFormModel`/read/tile → next；畸形路径 → 400；allow → next；拒绝时不调用 Hub；日志/响应无 token/路径 |
| `src/middleware/rpcGuard.test.ts` | B5a 认证行为不回归 |
| `src/config.test.ts` | `HTTP_STATEFUL_RPC_MODE` 默认 `deny`；`allow` 可显式设置；非法值退出 1 |
| `src/ipc/AppFunctionIpcHandler.session.test.ts` | 跨会话 key 仍先拒；rw 记录无租约 → save/push 拒绝且 db 未写；持租约 → 成功；readonly → `SessionOwnership`；无会话 legacy 路径不变 |
| `src/ipc/AppFunctionIpcHandler.test.ts` / `.perSession.test.ts` | 既有保存/推送/打开/关闭行为不回归 |

### 7.2 `tsc` / ESLint

- `npx tsc --noEmit`（modeling-server）→ 期望 exit 0。
- `npx eslint <本次改动文件>` → 期望 exit 0。

### 7.3 真栈双会话 e2e（**未执行，栈未起；不宣称**）

待栈恢复后按以下步骤执行，并把实际输出补入本节：

1. 起栈：`powershell -NoProfile -File scripts/quickstart.ps1`；
   确认 `powershell -File scripts/verify-stack.ps1` 全绿。
2. HTTP 有状态拒绝（同一已登录 token）：
   ```bash
   curl -i -X POST \
     "http://localhost:5401/LubanCAD/v1.0/mode/1/context/<itwin-guid>/imodel/<imodel-guid>/changeset/0/LubanRpcInterface-1.1.0-pushChanges" \
     -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{}'
   # 期望：HTTP 403 {"error":{"code":"HttpStatefulRpcDenied",...}}
   # 期望：MS 日志无 /auth/me 调用、无 briefcase open/push；日志无 token
   ```
3. HTTP 纯静态允许：
   ```bash
   curl -i \
     "http://localhost:5401/LubanCAD/v1.0/mode/1/context/<itwin-guid>/imodel/<imodel-guid>/changeset/0/LubanRpcInterface-1.1.0-getConfiguration" \
     -H "Authorization: Bearer <token>"
   # 期望：HTTP 200；响应无 cacheDir/绝对路径
   ```
4. 双浏览器上下文（A/B 两账号，同一文档）：A 打开可写 briefcase 并编辑；
   B 尝试用 A 的 key 调 `saveChanges`/`pushChanges` → 403/409，A 的文件不被触碰；
   A 的 `/ipc` 编辑/undo/save/push 正常。现有 `e2e/session-isolation.spec.ts`
   **尚不存在**；本步骤当前为手工/未来 spec，未执行。
5. `HTTP_STATEFUL_RPC_MODE=allow` 仅作回滚演练：确认恢复旧行为并在结束后改回 `deny`；
   发布配置与 `verify-stack` 不得设置 `allow`。

### 7.4 实际结果（2026-11-23 执行）

```text
cd D:\Github\luban-backend\modeling-server
npx vitest run src/middleware src/ipc src/rpc src/session
# Test Files  24 passed (24)
# Tests       234 passed (234)

npx tsc --noEmit
# exit 0（无输出）
```

- 单测：7 个直接相关套件 **89 passed**；middleware/ipc/rpc/session 全量 **24 files / 234 tests passed**。
  - `httpStatefulRpcGuard.test.ts`（新）20 tests：deny 403（push/terminate/export/read ESV/
    applyFeatureOp/getFeatureTree/acquireWriteLease/未知接口）、stateless 放行、read/tile 放行、
    畸形 400、allow 放行、拒绝路径不调用 fetch、日志/响应无 token/路径；另以 Express 路由
    集成用例证明只有 `/:title/:version/mode/*` 被拦截，`/ipc`、`/ws` 不受影响。
  - `LubanRpcImpl.test.ts`：`getConfiguration` 不再含 `cacheDir`，且无绝对路径。
  - `AppFunctionIpcHandler.session.test.ts`：无租约 save/push → `DocumentLocked` 且 db 未写；
    持租约成功；他人租约阻断；readonly → `SessionOwnership`；跨会话 key 仍先拒。
  - `config.test.ts`：`HTTP_STATEFUL_RPC_MODE` 默认 deny / allow / 非法退出 1。
- ESLint（本次新增/改动逻辑文件）：`src/middleware/httpStatefulRpcGuard.ts`、
  `httpStatefulRpcGuard.test.ts`、`src/main.ts`、`src/session/guards.ts`、
  `src/ipc/AppFunctionIpcHandler.session.test.ts` → **exit 0**。
  对既有文件整体执行 ESLint 仍会报**本次未触碰行**的历史债务
  （`src/rpc/LubanRpcImpl.ts` 未用导入/deprecated 类型、`src/ipc/AppFunctionIpcHandler.ts`
  的 deprecated `db.saveChanges/abandonChanges`、`src/config.ts` 既有 `no-console`、
  `src/rpc/LubanRpcImpl.test.ts` 的命名规则）；本切片未扩大这些债务。
- 真栈：**未执行**（栈未起；未宣称）。

### 7.5 已知残余 / 后续

- `pullChanges`/`abandonChanges`/`toggleGraphicalEditingScope` 仍未校验写租约
  （任务明确不扩大；需要单独测试矩阵后再加）。
- `saveChanges`/`pushChanges` 的租约是 30s TTL、前端每 10s 续租；后台标签页被浏览器
  节流超过 TTL 时，恢复后的首次 save/push 可能先收到 `DocumentLocked`，下一次续租后
  恢复。所有既有写路径（FeatureOp/直改）本就要求租约，因此“有未推事务但从未持租约”
  的产品路径不存在；该瞬态失败按 fail-closed 接受。
- HTTP read/tile 面仍是“认证后的只读面”，不是会话绑定；若未来要求零跨会话读，
  需要 B3 per-doc ACL/会话绑定只读面。
- `getConfiguration` 删除 `cacheDir` 属于行为收紧；无已知调用方，但不 bump 版本
  （方法签名未变）。
- 真栈双会话 spec 缺失：需要新增 `e2e/session-isolation.spec.ts` 并在栈恢复后执行。

---

## 8. 回滚与发布

- `getConfiguration`：回滚需重新加入字段（不建议；违反 BC-15）。
- HTTP 门禁：设置 `HTTP_STATEFUL_RPC_MODE=allow`（显式、启动告警、登记 X-19，
  仅回滚窗口）；代码路径保留 `allow` 分支，到期删除。
- 写租约：`SESSION_ISOLATION_MODE=off` 回退旧行为；`shadow` 观察。
- 无数据迁移/无 schema/无产物变更。
- 发布：MS 重启即可；不 commit/push/publish（由 release owner 执行）。

## 9. 评审结论

- 复用矩阵完成：是
- 跨仓影响明确：是
- P0 例外已登记：是（X-19，`allow` 回滚窗口）
- ADR：不需要
- Owner 签字：ARB 签字未记录
- 结论：实施完成（单元/静态检查以 §7.4 为准）；真栈验收待栈恢复
