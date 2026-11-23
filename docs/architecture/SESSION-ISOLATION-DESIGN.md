# G1 C2/C3/C6 会话隔离实现设计

> 状态：**Proposed（设计，未开工实现）**（2026-11-22）
> 范围：G1 WS-C 的 C2（per-session briefcase）、C3（Editor/undo 所有权）、C6（路径/所有权）；
> C5 外部 lease/fencing 只做接口设计，不在本设计内实现。
> 依赖：B1（身份）、B3（ACL/PEP）、C1（per-connection IPC 路由）。
> 关联：`G1-EXECUTION-PLAN.md`、`../ITWINJS_CORE_MODIFICATIONS.md`、`VIEWER-IPC-LIFECYCLE.md`、
> `INTERFACE-FREEZE-MATRIX.md`、`EXCEPTIONS.md`。
> 原则：**不新增 Part Studio 功能；不对外分享；G1 期间只承诺单写者 + 多只读**。

---

## 0. 结论摘要

1. **会话权威在连接上，不在 RPC 参数里。** WS upgrade 验证 token 后生成服务端
   `SessionRecord`（userId / sessionId / connectionId / tenant），IPC handler 通过
   每消息的连接上下文取值。客户端传来的 `sessionId`、`user`、`fileName`、`key`
   一律降级为兼容参数/幂等提示，永远不作为授权依据。
2. **briefcase 一 session 一文件、一写者一 briefcaseId。** 文件放在会话专属目录，
   key 由服务端签发；`openBriefcase` 不再关闭别人的库；`close/save/pull/push/undo`
   先校验 key 属于当前 session，再按文件操作。路径只接受会话注册表 + 规范化白名单
   内的文件，客户端不能指定任意路径。
3. **Editor 活跃命令按 session 分槽，undo 按作者过滤。** 把
   `EditCommandAdmin` 的进程级 `_activeCommand` 改为“每 owner 一个活跃命令”；
   直改写方法走统一写门禁（ACL + lease + 审计）。FeatureService 的 OpLog 增加
   author（userId/sessionId/briefcaseId），`undo/redo/discard` 只处理本会话作者的行。
   原生 `BriefcaseTxns` 栈因一 session 一文件而天然隔离，但仍需所有入口 owner 校验。
4. **写租约键从文件 key 改为稳定文档 id（iModelId）。** 这是 C2 的前置修正：否则
   per-session 文件会让两个写者各自持有“不同 key 的租约”，隔离形同虚设。
   C5 之前单 MS 进程内内存租约有效；多 MS 实例必须外部 lease 或硬性拒绝启动。
5. **C1 已修响应路由，但还有三个跨连接残留必须先补：**
   `IpcWebSocketTransport.notifyIncoming` 的分片重组状态是进程级共享；
   `IpcWebSocketBackend._processingQueue` 是全局队列；push/progress 仍广播。
   这些不修，handler 拿到的连接上下文可能串线。
6. **推荐路径：进程内 owner-scoped 状态（C3a），process-per-document actor 作为
   审计发现不可收敛全局单例时的后备（C3b 决策点）。** 不为两种形态同时写两套实现。

---

## 1. 现状核对（实现事实）

下表是本设计依赖的现状，均以代码位置核对（只列相对文件位置；不粘贴私有代码或内部证据）：

| # | 断言 | 现状位置 | 对隔离的影响 |
|---|---|---|---|
| F1 | C1 已做响应按连接路由 | `itwinjs-core/core/common/src/ipc/IpcWebSocket.ts`（`ipcConnection` symbol、Response 携带来源）、`IpcWebSocketTransport.ts`（`InSentOrder.deliver` 附加来源）、`core/backend/src/LocalhostIpcHost.ts`（`LocalTransport.send` 只回来源连接） | 双页面同 `requestId` 不会再把 A 的响应 resolve 到 B；但 handler 仍不知道来源，且下文的传输残留仍在 |
| F2 | 前端 requestId 是每页面实例 | `IpcWebSocketFrontend._nextRequest` / `_pendingRequests` 为实例字段 | 多页面天然都从 1 开始，必须依赖 F1 的连接域隔离 |
| F3 | C1 残留：分片重组状态进程级共享 | `IpcWebSocketTransport.notifyIncoming` 的 `_partial/_received/_outstanding` 为单实例字段 | 两个连接并发发送大消息（含二进制分片）可能互相拼接；C2 前必须改为 per-connection |
| F4 | C1 残留：处理队列全局 | `IpcWebSocketBackend._processingQueue` / `processMessages()` 全局递归 | 连接 A 的慢请求阻塞 B；若用“包住 listener”的方式做 AsyncLocalStorage，后续消息会在错误上下文里执行 |
| F5 | C1 残留：push/progress 广播 | `LocalTransport.send` 无来源即广播；`/ws` 的 `broadcastProgress(wsClients, ...)` 向所有连接推 | 进度/推送仍可跨用户泄露；C1.3 未完成 |
| F6 | briefcase 缓存按 iModelId 复用 | 私有 `modeling-server/src/ipc/LubanIpcHandler.ts`：`getCachedBriefcases(iModelId)`，读写共用已缓存文件；`_inFlight` 键为 `iModelId:readonly` | 两个用户会拿到同一个 `.bim`，后开者复用前者的 briefcaseId/文件 |
| F7 | `openBriefcase` 会关闭同 key/同文件名的既有库 | 私有 `modeling-server/src/ipc/AppFunctionIpcHandler.ts`：先 `findByKey`/`findByFilename`，命中即 `close()`，再 `BriefcaseDb.open` | 用户 B 打开同文档会踢掉 A；且 `args.fileName` 是客户端字符串，可指向任意本地 `.bim` |
| F8 | `closeIModel/saveChanges/pull/push/undo` 只按 key 操作、无 owner 校验 | 同上：`closeIModel(key)`、`saveChanges(key)`、`abandonChanges`、`pullChanges`、`pushChanges`、`reverseTxns*`、`reinstateTxn*`、`restartTxnSession`、`isUndoPossible` 等 | 知道/猜到 key 即可关闭、保存、推送、撤销别人的库 |
| F9 | Editor 进程级单槽 | `luban-cad/packages/editor/backend/src/EditCommand.ts`：`EditCommandAdmin._activeCommand` 为 static 单值；`EditorAppHandler.startCommand()` 先全局 `finishCommand()`；`callMethod()` 直接取全局 `activeCommand` | B 启动直改会结束 A 的活跃命令；B 的 `callMethod` 打到 A 的命令 |
| F10 | OpLog undo 不按用户/briefcase 过滤 | 私有 `modeling-server/src/feature/OpLog.ts`：`queryOpLog(db, partStudioId?)` 只按 Part Studio 过滤；`findUndoTarget` 取最新未撤销行 | A 的 undo 可能回退 B 已 pull 入本地的操作；`payload.user` 来自租约 holderUser，不是可信身份 |
| F11 | 写租约键是文件 key，身份来自客户端参数 | 私有 `modeling-server/src/feature/WriteLease.ts`：`acquire(key, sessionId, user)`，内存 30s TTL；`FeatureRpcImpl.acquireWriteLease(..., user?)`；FeatureService 全部 `assertHeld(this.dbKey, sessionId)` | per-session 文件会让租约键分裂；客户端可伪造 `sessionId/user`；多 MS 实例无互斥 |
| F12 | 前端 sessionId 由页面生成、key 用 fileName | `luban-cad/apps/web/src/modules/part-studio/hooks/useEditorSession.ts`（`crypto.randomUUID()`）；`packages/viewer/src/connection/use-briefcase-connection.ts`（`key: result.fileName`） | 客户端身份不能作为授权；fileName 作为 key 把路径语义带入协议 |
| F13 | 其他客户端可控路径面 | 私有 `LubanRpcImpl` 的 `read/writeExternalSavedViews`、`read/writeExternalCameraPaths`（由 `bimFileName` 拼路径）；`LubanIpcHandler._findDb`（相对 cwd 解析）；`getConfiguration` 返回 `cacheDir` | C6 必须覆盖所有文件入口，不能只堵 `openBriefcase` |
| F14 | HTTP RPC 面存在 | 私有 `main.ts` 的 `/:title/:version/mode/*` + `rpcGuard`；`/rpc/metadata` 开放 | HTTP 请求没有 WS 连接上下文；写 RPC 若不在 enforce 模式拒绝，等于绕过会话隔离 |

---

## 2. 不变量与威胁模型

### 2.1 身份层级

| 概念 | 来源 | 用途 | 是否可信 |
|---|---|---|---|
| **principal（主体）** | WS upgrade 验证 token 后的 hub `/auth/me` 结果（userId、email、可选 tenant） | ACL、审计、租约 holder 显示 | 服务端验证后可信 |
| **session（会话）** | MS 在连接建立时生成的 ULID/UUID，服务端保存 | IPC/Editor/undo/briefcase 的 owner 键 | 服务端生成，客户端传值不授权 |
| **connection（连接）** | 每个 WS socket 一个 | 响应路由、连接上下文 | 服务端持有 ws 对象 |
| **document（文档）** | `iModelId`（G1 仅 head） | 写租约稳定键、ACL 对象 | 客户端可提名，需 ACL 校验 |
| **briefcase（本地副本）** | 服务端分配的 `{fileName, briefcaseId}` | 本地事务/undo 栈、文件所有权 | 服务端注册表 |
| **lease epoch（fencing）** | C5 外部 lease 服务递增 | 跨 MS 写者互斥 | 服务端获取，客户端不可指定 |

### 2.2 硬不变量

- **I1 权威来自连接**：任何 handler 的授权只读 `SessionContext.current()`；RPC 参数中的
  sessionId/user/key/fileName 只能用于兼容、幂等和错误提示，不能用于“找到会话”。
- **I2 一文档一写者（G1）**：同一文档同一时刻最多一个可写会话；只读会话可多个。
  C5 之前该约束只在单 MS 进程内成立；多实例部署必须被拒绝或由 C5 覆盖。
- **I3 无可变共享文件**：两个 session 不打开同一个可变 `.bim`。只读 checkpoint 副本
  也默认每 session 一份；若未来共享不可变 checkpoint 文件，须作为显式例外登记。
- **I4 每个写路径四件套**：ACL allow + 有效写租约/epoch + session 文件所有权 +
  标准事务（`BriefcaseTxns`/`EditTxn`）。缺一 fail-closed。
- **I5 undo 所有权**：原生 undo 只在会话自己的 briefcase 上；FeatureService undo/redo
  只处理本会话作者写入的 OpLog 行。
- **I6 fail-closed**：上下文缺失、租约服务不可用、路径校验失败、文件归属不明时，
  拒绝写入；只读面可继续但不得伪造数据。
- **I7 不泄露服务端路径**：客户端只看到服务端签发的 key，不看到绝对路径；错误信息
  不回显他人路径/用户名以外的敏感信息。

### 2.3 攻击者能力假设

- 客户端可以篡改所有 RPC/WS 参数（sessionId、user、iModelKey、fileName、partStudioId、
  requestId 等）。
- 客户端可以重放旧请求、并发开多个页面、在 token 过期后继续用旧 socket。
- 客户端不能读取其他进程内存，但可能猜到/拿到别人的 key 或 sessionId（视为非秘密）。
- 恶意输入包括 `..`、绝对路径、UNC、Windows 设备名、符号链接/目录联接、大小写变体、
  URL 编码、Unicode 规范化、超长字符串、GUID 形状伪造。

---

## 3. 会话身份传播

### 3.1 WS upgrade → 主体

现状：`verifyWsUpgrade(req)` 只返回 boolean（`modeling-server/src/middleware/wsAuth.ts`），
只拿 `/auth/me` 的 200/非 200，不保存 userId；token 可来自 `Authorization`、cookie 或
`?token=` 查询参数。

目标流程：

```text
WS upgrade (/ipc 或 /ws)
  -> extractToken: Authorization Bearer > HttpOnly cookie > (兼容期) query token
  -> hub /auth/me: 200 => AuthPrincipal { userId, email, tenantId?, tokenJti?, expiresAt? }
  -> SessionRegistry.create({ connectionId, principal, transport })
  -> WeakMap<ws, SessionRecord>
  -> 之后所有 IPC 消息通过连接上下文取 SessionRecord
```

实现要点：

1. `verifyWsUpgrade` 改为返回 `AuthPrincipal | undefined`（或校验结果 + principal），
   不再只回 boolean。把 principal 附到 upgrade `req` 的 symbol 上供 `/ipc`/`/ws`
   回调读取；如果 express-ws 的 req 对象不能保证同一引用，则用按 token 哈希的
   短 TTL principal 缓存（不按 IP）。不得在 handler 内重新信任客户端传来的用户字段。
2. **query token 兼容**：enforce 模式拒绝 `?token=`（会进 nginx/访问日志）；legacy 模式
   允许但记录脱敏告警。**B5a（2026-11-23）已默认拒绝**：MS/BFF 仅在显式
   `SESSION_TOKEN_VIA_QUERY=allow` 回滚窗口接受（`EXCEPTIONS.md` X-18）；
   `Authorization`/cookie 传输不变。
3. token 过期/撤销：`SessionRecord` 保存 `expiresAt`/`lastValidatedAt`；在
   `openBriefcase`、`acquireWriteLease`、`pushChanges` 等敏感入口和周期性心跳处
   复验（B1.2c 默认每次回源；如显式 opt-in 正缓存，负结果不得毒化）。失效则 `401/4401 SessionExpired`
   并关闭连接。
4. `/ipc` 与 `/ws` 都建立 session；若两者属于同一浏览器登录，可用服务端签发的
   HttpOnly reconnect cookie 绑定到同一逻辑会话。否则至少按 user 做进度 ACL，
   briefcase 归属仍以 `/ipc` 的 session 为准。

### 3.2 core：每消息连接上下文（C1 补强）

C1 现在只把来源连接放到 Response 上，handler 看不到来源。建议在 core 增加
`IpcConnectionContext`（`core/backend/src/IpcConnectionContext.ts`，新文件），
并加一个 common→backend 的薄接缝：

```text
core/common/src/ipc/IpcWebSocket.ts
  IpcWebSocket.connectionContext?: {
    run<T>(connection: unknown, fn: () => Promise<T>): Promise<T>
  }

core/backend/src/LocalhostIpcHost.ts
  startup 时安装：
    IpcWebSocket.connectionContext = { run: (c, fn) => IpcConnectionContext.run(c, fn) }
  LocalTransport.connect 的 close 清理同时通知 context 清理

core/backend/src/IpcConnectionContext.ts
  AsyncLocalStorage<unknown>
  run(connection, fn) / current(): unknown | undefined
```

**关键实现纪律**：必须在 `IpcWebSocketBackend.processMessages()` 里对**每条消息**
按 `message[ipcConnection]` 建立上下文，不得只在 socket 的 `message` listener 外层
包一层。原因：`_processingQueue` 是全局的，A 的 async 链会递归处理 B 的消息；若只在
listener 上包 ALS，B 的消息会继承 A 的上下文。

同时修 C1 残留：

- `IpcWebSocketTransport.notifyIncoming` 的 `_partial/_received/_outstanding` 改成
  `Map<connection, ReassemblyState>`（`notifyClose` 删除），否则两个连接的大消息会
  拼接串线。
- `IpcWebSocketBackend._processingQueue` 改成 per-connection 队列（无来源的消息走
  一个默认队列，兼容测试/旧调用）。目标是：A 的慢请求不阻塞 B；每连接内保序。
- 响应仍按 C1 的 `ipcConnection` 只回来源；目标连接已断开时丢弃，绝不回落广播。
- push 是否按连接路由是 C1.3 的范围；本设计只要求 **不把“无来源”当作广播到所有人**
  继续扩展。

这些 core 修改必须登记 `docs/ITWINJS_CORE_MODIFICATIONS.md`（最小面、可回退）。

### 3.3 MS：SessionRegistry / SessionContext

新增（私有仓相对路径）：

- `modeling-server/src/session/SessionRegistry.ts`
- `modeling-server/src/session/SessionContext.ts`

记录形状（设计，不是私有代码）：

```text
SessionRecord {
  sessionId: string            // 服务端生成，非秘密
  connectionId: string
  principal: { userId, email, displayName?, tenantId? }
  state: active | draining | closed
  opened: Map<key, BriefcaseRecord>
  activeEditCommand?: { commandId, iModelKey, startedAt }
  lease?: { docId, epoch, expiresAt }
  createdAt / lastSeenAt / reconnectGraceUntil
}

BriefcaseRecord {
  key: string                  // 服务端签发，opaque
  docId: string                // iModelId
  iTwinId: string
  fileName: string             // 绝对路径，服务端内部
  briefcaseId: number
  mode: readonly | rw
  state: provisioning | open | draining | retained | quarantined
  manifestVersion: number
  leaseEpoch?: number
}
```

`SessionContext.current()` 从 `IpcConnectionContext.current()` 取 ws 对象，
查 `WeakMap` 得到 `SessionRecord`；无上下文时 `require()` 抛出
`SessionRequired`（enforce 模式 handler 统一转 401/403）。测试/CLI 只能用显式
`runWithSessionForTest()` 注入，生产路径不提供“无会话默认用户”。

### 3.4 传播到 FeatureService / Editor / OpLog

```text
IPC invoke (channel + method)
  -> core per-message connection context
  -> IpcHandler dispatcher
  -> LubanFeatureRpcImpl / AppFunctionIpcHandler / LubanIpcHandler / EditorAppHandler
     => SessionContext.require()
     => SessionRegistry.requireOpenBriefcase(iModelKey)
     => FeatureService(session, briefcase)
        -> WriteLease.assertHeld(docId, sessionId)
        -> OpLog.insert(payload.author = principal/session/briefcase)
        -> Editor command registry (owner = sessionId)
```

各层职责：

| 层 | 变化 |
|---|---|
| `LubanFeatureRpcImpl` | 每个方法入口先做 `requireSession()` + `requireOwnedKey(iModelKey)`；不接受客户端 `sessionId` 作为身份；传给 FeatureService 的 sessionId 用 context |
| FeatureService | 单例键继续按 dbKey（per-session 后天然唯一）；租约断言改用稳定 docId；OpLog 写 author；undo/redo 过滤 author |
| WriteLease | `acquire/renew/release/assertHeld` 的 holder 来自 principal；sessionId 来自 context；键改 docId |
| OpLog | 新条目携带 `author { userId, sessionId, briefcaseId, epoch? }`；查询时增加 author 过滤 |
| Editor | 活跃命令按 session 分槽；`callMethod` 只解析本 session 的命令；写方法走门禁 |
| AppFunctionIpcHandler | `open/close/save/pull/push/undo/...` 全部先查 file/key 归属 |
| LubanIpcHandler | `downloadBriefcase` 按 session 下载到会话目录；`_findDb` 只接受本 session key |

#### 3.4.1 不信任客户端 sessionId 的具体规则

1. handler 内**禁止** `sessions.get(args.sessionId)`、`dbByKey.get(args.iModelKey)` 后
   直接操作；必须先 `SessionContext.require()`，再 `session.opened.get(args.iModelKey)`。
2. `applyFeatureOp/preview/rename/createPartStudio/...` 的 `sessionId` 参数：
   - enforce 模式：必须等于 `session.legacyClientSessionId`（兼容绑定）或服务端签发
     sessionId；否则 `403 SessionMismatch`。**即使相等，也只用于幂等/审计，不用于授权。**
   - legacy 模式：记录首次绑定的 client id；不同连接若声明同一 client id，拒绝
     `409 SessionAlreadyBound`，防止“猜 id 接管”。
3. `acquireWriteLease(iModelKey, sessionId, user?)` 的 `user` 参数忽略；holder 显示名
   取 principal。`sessionId` 同上按兼容绑定校验。
4. `iModelKey` 必须是本 session 的 `opened` 键，或（只读面）本 session 的只读 checkpoint
   key；不得是全局 `IModelDb._openDbs` 中任意 key。
5. `fileName`/`bimFileName`/`key` 只作为“期望值”与注册表比对，不参与路径解析（见 §4.4）。
6. 重连：sessionId 单独不足以恢复会话；恢复必须持服务端签发的 reconnect cookie/token
   （HttpOnly、SameSite=Strict、绑定 token fingerprint），且 principal 一致、仍在
   grace 内。

### 3.5 HTTP RPC 与 `/ws`

- **HTTP RPC**：`rpcGuard` 增加了 token 校验但没有连接上下文。enforce 模式下：
  - 有状态接口（`LubanRpcInterface`、`LubanFeatureRpcInterface` 以及任何按 key 操作的
    读写实现）一律 403，提示走 `/ipc`；
  - `IModelReadRpcInterface`/`IModelTileRpcInterface` 若必须保留 HTTP，则要求请求携带
    服务端签发的短期 session binding，或只允许无 key 的 stateless 操作。
  - `/rpc/metadata` 保持开放（无状态契约发现）。
- **`/ws` 进度**：`wsClients` 从裸 Set 改为按 session 记录；`broadcastProgress` 只发给
  与 `iModelId` 有读权限/订阅关系的连接；至少不得向未授权用户广播文档初始化进度。
  `iModelProgressMap` 的 GET 路由也要加 ACL。此项归 C1.3，但 C2 的双用户验收依赖它。
- **RPC token key 防御**：`RpcHandler.request` 内所有带 `key` 的 RPC，校验 key 属于当前
  session（或为公开只读 checkpoint）；防止 key 泄露后通过 tile/read RPC 读取他人未推送
  的本地编辑。可在 core 增加 `RpcSessionGuard` 钩子，由 MS 注入；不新增公共 RPC。

---

## 4. Per-session briefcase

### 4.1 命名与目录

```text
<BRIEFCASE_CACHE_LOCATION>/sessions/<sessionId>/<iModelId>/<briefcaseId>.bim
<BRIEFCASE_CACHE_LOCATION>/sessions/<sessionId>/<iModelId>/<briefcaseId>.session.json
```

- `<sessionId>`：服务端生成的 ULID/UUID；不接受客户端路径片段。
- `<iModelId>`：严格 GUID 校验后才入路径；`iTwinId` 同。
- `<briefcaseId>`：整数；只读 checkpoint 用 0；可写用 hub 分配的合法 id（≥ FirstValid）。
- key：服务端签发 `sess:<sessionId>:<iModelId>:<briefcaseId>`（opaque）。前端把它作为
  `BriefcaseConnection.openFile({ key })` 和后续 RPC 的 iModelKey；不再用 fileName 当 key。
- 目录故意放在 `<iModelId>/briefcases/` 之外：`BriefcaseManager.getCachedBriefcases()`
  扫描的是 `<cacheRoot>/<iModelId>/briefcases`，不会误认 `sessions/` 下的文件。
- 每个文件配 sidecar manifest（state/owner/doc/mode/briefcaseId/createdAt/checksum），
  在下载前以 `provisioning` 写入，打开/关闭/隔离时原子更新；进程崩溃后 sweeper 依据它
  判断归属和可否保留。

### 4.2 生命周期

```text
provisioning -> opening -> open -> draining -> closed
                                      \-> retained (dirty, 可重连/人工恢复)
                                      \-> quarantined (归属不明/跨 epoch/损坏)
```

**打开（写）**：

1. `SessionContext.require()` + B3 ACL `canWrite(docId)`；无 ACL 时 fail-closed。
2. 若本 session 已注册同 doc 的可写 briefcase：幂等返回同一个 key/file。
3. 若同 doc 已被其他 session（本进程）持有写租约：提前返回 `409 DocumentLocked`
   （C5 后由外部 lease 判定），不要先下载一个注定不能写的文件。
4. 分配 briefcaseId：`BriefcaseManager.acquireNewBriefcaseId({ iModelId, ... })`；
   建议 alias/deviceName 使用 session 的不可逆短哈希，避免 PII；每可写 session 一个。
5. `BriefcaseManager.downloadBriefcase({ iTwinId, iModelId, briefcaseId, fileName })`
   显式 fileName 指向会话目录；失败时删除半成品并释放 briefcaseId。
6. `BriefcaseDb.open({ fileName, key, readonly: false })`；成功后写 manifest=open。
7. 所有并发打开以 `${sessionId}:${iModelId}:rw` 为 in-flight 键合并；不同 session
   各下载各的，不再用 `iModelId:readonly` 全局合并。

**打开（只读）**：

- 本 session 独立下载 checkpoint 副本（briefcaseId=0，显式 fileName），
  `BriefcaseDb.open({ readonly: true })`。满足“无可变共享文件”。
- 可选优化：未来允许只读会话共享同一个**不可变** checkpoint 文件（只读打开），但必须
  登记例外并验证 SQLite 多读者/文件生命周期；本设计默认每 session 一份。
- `readonly` 由服务端按 B3 权限和请求意图决定；客户端把只读会话请求成 `readonly:false`
  不生效（若用户有写权限，也只会获得新的可写 session；若没有，403）。

**并发语义**：

| 场景 | 行为 |
|---|---|
| 同 session 同 doc 再次 open | 幂等返回同一 key/file |
| 同 session 同 doc 第二个 rw 请求 | `409 AlreadyOpen`；不允许同 session 两把写句柄 |
| 不同 session 同 doc（写+写） | G1：第二个写请求 `409 DocumentLocked`（本地租约）；两个只读可并存 |
| 不同 session 同 doc（写+只读） | 写者持自有文件；只读者下自有 checkpoint 副本 |
| 不同 session 同 doc（只读+只读） | 各自副本，互不 close |
| 同 session 的旧连接请求在新连接到达后重试 | 旧 session 已 draining 时拒绝；新 session 从 reconnect cookie 恢复或另开新文件 |

### 4.3 owner 校验矩阵

所有方法先 `SessionContext.require()`，再按 key 查 `session.opened`；key 不在本 session
即 `403 SessionOwnership`，且**不得触碰任何 db**。

| 入口 | 现状 | 目标 |
|---|---|---|
| `openBriefcase(args)` | 关闭同 key/文件名任意既有库；打开任意 fileName | `fileName` 必须等于本 session 注册文件；只关闭本 session 自己的旧句柄；禁止关闭他人 |
| `closeIModel(key)` | 任意 key 直接 close | key ∈ 本 session；否则 403，不 close |
| `saveChanges/abandonChanges` | 任意 key | key ∈ 本 session + 持租约；否则 403/409 |
| `hasPendingTxns/isUndoPossible/isRedoPossible/getUndoString/getRedoString` | 任意 key | key ∈ 本 session；否则 403（或对不存在返回 false，但不暴露他人状态） |
| `pullChanges/pushChanges` | 任意 key | key ∈ 本 session + 持租约；push 前做 lease/epoch 复验 |
| `cancelPullChangesRequest/cancelPushChangesRequest` | 按 key 改全局 status map | 只取消本 session 的操作 |
| `toggleGraphicalEditingScope` | 任意 key | key ∈ 本 session，且仅可写 |
| `reverseTxns/reverseAllTxn/reinstateTxn/reverseTxnsAsync/reverseAllTxnsAsync/reinstateTxnAsync/restartTxnSession` | 任意 key | key ∈ 本 session；活跃命令也须属于本 session |
| `LubanFeatureRpcInterface.*` | 按 iModelKey 找全局 db | key ∈ 本 session；写方法再加 ACL+lease |
| `LubanIpcHandler.createAssembly/listAssemblies` | `_findDb(fileName)` 可相对 cwd | 只接受本 session key；不接受路径 |
| `read/writeExternalSavedViews`、`read/writeExternalCameraPaths` | 任意 `bimFileName` 拼路径 | 只接受本 session 的 key/注册文件；sidecar 写会话目录 |
| tile/read RPC 的 key | 全局 `findByKey` | key ∈ 本 session |

状态码建议：所有权失败统一 `403 SessionOwnership`；写租约被他人持有 `409 DocumentLocked`
（返回 holder 显示名）；fencing 失败 `409 Fenced`；路径非法 `400 InvalidPath`；
重复打开 `409 AlreadyOpen`；会话缺失/过期 `401 SessionRequired/SessionExpired`。

### 4.4 路径规范化与 open 白名单

原则：**先注册表、后路径；客户端永不直接决定路径。**

1. **注册表优先**：`openBriefcase` 只接受本 session `opened` 中已存在的 key。下载时
   fileName 由服务端生成，客户端没有参与机会。
2. **规范化**（写文件前/打开前都做）：
   - `path.resolve` 后取 `fs.realpathSync.native`（文件不存在时 realpath 其父目录再拼
     basename），Windows 下大小写不敏感比较。
   - `rel = path.relative(sessionRoot, candidate)`；拒绝 `rel === ''`（目录本身）、
     `rel.startsWith('..' + sep)`、`path.isAbsolute(rel)`。
   - 拒绝 UNC（`\\`）、设备命名空间（`\\?\`、`\\.\`）、盘符相对路径、NUL 截断、
     Windows 保留名（`CON`, `NUL`, `COM1..9`, `LPT1..9`）、尾随点/空格、
     alternate data stream（`:`）、符号链接/目录联接逃逸（realpath 后再校验）。
   - 只接受 `.bim` 作为数据库文件；sidecar 只由服务端在会话目录写。
3. **身份校验**：打开后校验文件内部 `iModelId/iTwinId` 与请求/注册一致；不一致
   `403 DocumentMismatch`，不进入 BriefcaseDb。
4. **ID 校验**：`iModelId/iTwinId` 必须符合 GUID 形状；`sessionId` 服务端生成；
   `briefcaseId` 整数且在合法区间；partStudioId 等仅作 EC 标识，不入路径。
5. **服务端路径不出网**：`getConfiguration()` 不再返回 `cacheDir`；错误消息只含逻辑
   key/原因，不含绝对路径。
6. **兼容期**：legacy 模式下允许打开 `<cacheRoot>/<iModelId>/briefcases/<n>.bim`，
   但仍须 realpath 在 cacheRoot 内且无其他 session 持有；enforce 模式只接受
   session 目录。

需要覆盖的入口：`openBriefcase`、`downloadBriefcase`（iModelId/iTwinId）、
`LubanIpcHandler._findDb`、ESV/camera 路径、`exportIModel` 输出（若未来落盘）、
tile storage key、`EvalCarrier` 的临时文件（已用 safeName，但仍按 sessionRoot 校验）、
以及任何未来的导入/导出。

### 4.5 缓存、清理与崩溃

- **关闭**：`closeIModel`/session 到期 → `db.close()`（按 iTwin 语义保存或由策略
  abandon）→ manifest 置 `closed`。
- **保留策略**：
  - clean（`!hasPendingTxns` 且无未推事务）：宽限期后删除文件并释放 briefcaseId；
  - dirty（有本地未推事务）：保留到用户重连/人工恢复窗口（默认建议 24h）；
    到期移入 `quarantine/`，**绝不自动删除用户未推数据，也绝不自动 push**；
  - active：永不被 sweeper 删除。
- **崩溃恢复**：启动时扫描 `sessions/` 的 manifest；`provisioning/opening` 视为半成品，
  删除并释放 briefcaseId；`draining` 按 TTL 到期处理；不自动把旧文件交给新 session。
- **已知语义变化（reload/unload）**：浏览器 reload 建立新 session，不续用旧本地文件；
  自动保存防抖窗口（默认 20s）内的未推送编辑会丢失。旧的共享 briefcase 会“碰巧”
  保留它们，不能作为产品承诺。C7 之前需要 beforeunload 未保存提示或 session 恢复
  （同用户串行复用，见下条）；e2e 在 reload 前必须显式落库（`pushExampleChanges` /
  `reloadWithFlush`），不得依赖旧本地文件。
- **整页 scope 导航同理**：多 Part Studio 文档中，用 `page.goto` 直接打开另一个
  `?model=<scope>` 也是新 session，不会续用当前 scope 的未推送编辑；e2e 的
  `openBModelEditor/openBModelPartStudio` 现在导航前调用 `flushPendingChanges`
  （Element Organization 的 O-Ring 曾因此丢失）。产品内的 SPA 页签切换复用同一
  briefcase，不触发该语义；若要支持 URL 直开跨 scope，需 C7 的会话恢复/提示。
- **冷重开必须按持久图/params 重算**：新 session 的 `FeatureOutputCache` 为冷，
  `rebuildAll` 不得依赖上一个 session 的热缓存。中间 faceExtrude 的 body 目标
  由 Feature→Feature 后裔图证明恢复（见私有 AIRR 2026-11-23），不再把
  “同一 briefcase 的热结果”当作冷重开事实。
- **briefcaseId 配额**：每写 session 一个 ID 会消耗 hub 配额；干净关闭尽快 release；
  长期 dirty 文件占 ID。若配额成为问题，C2 可增加“同用户单写 briefcase 串行复用”的
  池化策略（见开放问题）。
- **进程内缓存清理**：session 关闭时清理 `FeatureService.services` 键
  （`dbKey::scope`）、`warmAttemptedKeys`、`docInitQueues`、`evalQueues`、
  `preEvaluatedMarks`、`SketchProjectionSnapshot.snapshots/changeEpochs/bodyEpochs`、
  `EvalCarrier.carriers` 等按 dbKey 的模块级表；否则长跑多 session 会内存/临时文件泄漏。
  需要提供 `disposeForDbKey(dbKey)` 统一收口。
- **changeset 缓存**：`BriefcaseManager.getChangeSetsPath(iModelId)` 是 per-iModel 的
  共享目录。它存放的是内容寻址的 change blob，属于**不可变数据**；本设计允许只读共享，
  但必须在 `EXCEPTIONS.md` 登记。若要求字面“零共享文件”，则为每个 session 指定独立
  cache 根/下载目录；代价是重复下载。默认：不可变 blob 可共享，可变 briefcase 绝不共享。
- **磁盘配额**：per-session/per-user 配额 + 全局水位；清理只清 closed/retained 且
  无活跃句柄的文件；清理动作写审计。

### 4.6 写租约键必须改为稳定 docId（C2 前置）

当前 `WriteLeaseRegistry` 用 `iModelKey`（即文件 key）。per-session 文件后，A、B 的
`iModelKey` 不同，两个写者在本地都会 `assertHeld` 成功——租约失去意义。

目标：

```text
docId = iModelId（G1 head；未来版本打开可加 changeset/version 维度）
Lease = { docId, sessionId, userId, instanceId, epoch?, expiresAt }
acquire/renew/release/assertHeld(docId, sessionId)
holderUser(docId)
```

- FeatureService、PartStudioRegistry、直改门禁全部改用 briefcase 内真实 `iModel.iModelId`
  作为 lease key，不得再用 `this.dbKey` 当租约键（dbKey 仅作服务缓存键）。
- holder 显示名来自 principal；`epoch` C5 之前为 undefined/0。
- 长操作租约：当前前端每 10s renew，但 IPC 每连接队列会把 renew 排在长 op 之后，
  30s TTL 可能在 op 中途过期。设计要求：**服务端在 op 开始时按操作预算延长租约**
  （`beginOperation(docId, sessionId, budget)`），或提供独立于 op 队列的续租通道；
  外部 lease 由 MS 后台续租，不依赖客户端。op 结束/失败释放 hold。此点列入开放问题。

---

## 5. Editor 命令与 undo 所有权

### 5.1 问题拆解

- `EditCommandAdmin.commands` 是命令类注册表，进程级共享是合理的（类不可变）。
- `EditCommandAdmin._activeCommand` 是**活跃实例**，必须按 owner 分槽。
- `EditorAppHandler.startCommand` 的 `finishCommand()` 是全局的；`callMethod` 取全局
  活跃命令；两者都必须在连接上下文中解析到本 session。
- `EditCommand` 实例写入时没有 session/lease/ACL 概念；直改可绕过 FeatureService。
- 原生 undo 栈按 BriefcaseDb 实例；per-session 文件后天然隔离，但
  `IpcAppFunctions.reverseTxns(key)` 仍可被他人用 key 调用。
- FeatureService OpLog undo 是持久化层语义；push/pull 后其他作者的 OpLog 行会进入
  本地库，必须按 author 过滤。

### 5.2 方案 A（推荐先行）：进程内 per-session 命令槽

改动集中在自有包 `luban-cad/packages/editor`（不涉及上游 fork）：

```text
EditCommandAdmin
  commands: Map<commandId, class>            // 保持全局
  _activeByOwner: Map<ownerKey, EditCommand> // ownerKey = sessionId
  activeCommandFor(ownerKey)
  finishCommandFor(ownerKey)
  runCommandFor(ownerKey, cmd)
  dropOwner(ownerKey)                        // session 关闭时 abandon
```

`EditCommand` 实例增加运行时 `ownerSessionId`（不序列化给客户端）。

`EditorAppHandler`：

- `startCommand(commandId, iModelKey, ...args)`：
  1. `SessionContext.require()`；
  2. `iModelKey` 必须是本 session 已打开的 briefcase（§4.3）；
  3. 写命令要求 ACL/lease（或至少在写方法门禁处，见下）；
  4. 只 `finishCommandFor(owner)`，不动其他 owner；
  5. `runCommandFor(owner, new Command(...))`；命令实例绑定 owner。
  6. `commandId === ""` 只结束本 owner 的命令。
- `callMethod(methodName, ...args)`：
  1. 取本 owner 的 active command；没有 → `NoActiveCommand`；
  2. 命令的 iModel 必须仍是本 session 打开且未关闭的 briefcase；
  3. 不提供“全局 fallback”；没有上下文（HTTP/测试）按 fail-closed。
- session drain/close、登出、fencing 失败：`dropOwner(owner)`，默认 `abandonEdits()`，
  **不自动 save**。
- 单元测试需要无上下文直接调用的场景：显式 `runWithSessionForTest()` 或
  `EditCommandAdmin` 的测试专用 default owner；生产构造不提供默认。

**直改写门禁（C3.3）**：借鉴现有 `bindDirectEditGuard` 的 DI 形态，在
`luban-cad/packages/editor/backend/src/EditBuiltInCommand.ts` 的写方法入口
（`BasicManipulationCommand`/`SolidModelingCommand` 的写操作，非查询方法）调用
`EditWriteGuard`：

```text
EditWriteGuard {
  beforeWrite(iModel, op, elementIds): void
}
```

MS 注入实现：

1. `SessionContext.require()`；
2. key/文件属于本 session；
3. B3 ACL `canWrite(docId)`；
4. `writeLeases.assertHeld(docId, sessionId)`（C5 后加 epoch 校验）；
5. 审计（userId/sessionId/docId/briefcaseId/op/elementIds）；
6. 任一失败抛标准错误 → `callMethod` 返回失败，不落事务。

查询类方法不要求租约，但要求 session 所有权。写方法清单以只读白名单反向定义，
避免新增写方法漏门禁。直改事务仍走 `BasicManipulationCommand` 的 EditTxn /
`onCommitted`，不改变标准管道。

### 5.3 Undo 所有权

**两层 undo**：

| 层 | 存储 | 隔离方式 | 所有权动作 |
|---|---|---|---|
| 原生 `BriefcaseTxns`（UndoTool/RedoTool、`reverseTxns`、`reinstateTxn`） | 每个 BriefcaseDb 文件内的事务栈 | 一 session 一文件后天然隔离；重启/重连用 `restartSession` 清掉不明确的历史 | `AppFunctionIpcHandler` 的 key owner 校验 + 本 session 活跃命令校验；禁止跨 session |
| FeatureService OpLog（`kind:"undo"/"redo"`、变量/参数撤销） | iModel 内 `LubanCAD.OpLogEntry`（JSON payload） | 持久化后跨 push/pull；必须按 author 过滤 | 增加 `author {userId, sessionId, briefcaseId, epoch?}`；undo/redo/discard 只处理本 author 行 |

**OpLog 改动**：

1. `OpPayload` 新增可选 `author` 字段（JSON 追加，无需 schema 迁移）：
   `{ userId, sessionId, briefcaseId, epoch? }`。
2. `insertOpLogEntry` 的调用点不再使用 `writeLeases.holderUser(dbKey)` 作为 user；
   改由服务层从 `SessionContext` 传入完整 author。`payload.user` 保留用于显示/兼容，
   但授权只看 `author`（缺失时按 legacy 规则）。
3. `queryOpLog(db, partStudioId?, authorFilter?)` 保持现有 Part Studio 过滤，并新增
   可选 author 过滤（payload JSON 之后过滤，和现有做法一致）。
4. `findUndoTarget/findRedoTarget/findToDiscard` 增加 `isOwnedBy(row, author)` 判断：
   - enforce 模式：无 author 的旧行**不可被新会话 undo/redo**；有 author 时必须
     `sessionId` 与当前一致（G1 语义是 per-session，不是 per-user）。
   - legacy 模式：维持旧行为（仅 partStudio 过滤）。
5. `discard` 只丢弃本 author 的 undone 行，避免新 op 清掉他人的 redo 分支。
6. `applyVariablesHistory`、`undoInternal`、`redoInternal`、`reorder` 等所有消费 OpLog 的
   路径统一走带 author 的查询；不允许旁路全量 `queryOpLog`。
7. 审计/兼容：`payload.user` 仍可显示；新字段对旧代码是未知键，旧版本忽略。

**跨 push/pull 的语义**：

- A push 的 `insertFeature` 行在 B pull 后进入 B 的本地库；author=A。B 的 undo 扫描
  跳过该行，继续找 B 自己的最新未撤销行。若 B 自己没有可撤销行 → “无可撤销操作”。
- A 自己重新打开/pull 后，仍可 undo 自己的旧未撤销行（sessionId 需为同一逻辑会话；
  若是新 session，按 G1 per-session 语义不可 undo 旧 session 的行。用户级 undo 需要
  sessionId 之外的 user 维度，留作后续决策）。
- 原生 undo 只能撤销本文件的事务；push 后 `StartNewSession` 语义不变，已推事务不可
  undo（现有行为）。X-15 的自动保存/undo 深度边界不因本设计改变：默认不逐笔 auto-push，
  push 仍是显式用户操作，C3 不宣称扩大 undo 深度。
- 多事务分组（变量表）在途禁止 undo、init 事务守卫等现有语义保持不变，按 session
  独立生效。

### 5.4 方案 B（后备）：process-per-document actor

若审计发现仍有无法收敛的进程级单例（native/EDE/全局缓存），或需要崩溃隔离，则改为
每文档一个 actor 进程：

```text
MS main（auth/router）
  -> SessionRouter: sessionId -> actorProcess
  -> actor: 一个 IModelHost + 一个 BriefcaseDb + 一个 EditCommandAdmin
             + 一个 FeatureService + 一个 lease 客户端
  -> 客户端帧只进 router；router 校验 session 后转发，actor 不直接暴露端口
```

优点：

- `EditCommandAdmin`、`IModelDb._openDbs`、native 全局状态天然 per-document；
- undo 栈/事务/租约完全隔离；native 崩溃只影响一个文档；
- 外部 lease 的 holder 可以是 actor 进程，fencing 语义更自然。

代价/前置：

- 每文档 native 运行时内存/启动成本；进程生命周期、重连、优雅关闭、崩溃恢复；
- tile/RPC 需从 actor 回传或由 router 代理；IPC 帧需要 requestId/连接映射；
- 不能在 actor 与进程内方案之间共享部分状态；必须一次选定；
- 发布/运维复杂度上升（进程数、日志、健康检查）。

**决策建议**：C2/C3 先按方案 A 实现，并在 C3 启动前完成一次“进程级可变单例审计”；
若发现除 `EditCommandAdmin`、租约、OpLog、briefcase 注册表之外还有不可按 session
收敛的状态，再切方案 B。G1 风险表已把 actor 列为降险手段，决策记录进 ADR/例外，
不允许两套并行上线。

---

## 6. 外部 lease/fencing（C5，仅接口设计）

### 6.1 职责分层

| 层 | 职责 |
|---|---|
| 本地 `BriefcaseRegistry`（C2） | 哪个 session 可以碰哪个本地文件；防串文件 |
| 本地 `WriteLeaseRegistry`（C3） | 单 MS 进程内的写者互斥；C5 后是外部 lease 的本地镜像 |
| 外部 LeaseService（C5） | 跨 MS 实例/跨进程的文档级单写者；epoch 单调递增 |
| Hub changeset | 最终版本链；不作为租约权威（但有冲突检测） |

### 6.2 接口形状

建议在 MS 内定义（不新增公共 RPC）：

```text
DocLeaseService {
  acquire(docId, contender, ttlMs): Promise<LeaseGrant | LeaseConflict>
  renew(docId, sessionId, epoch, ttlMs): Promise<LeaseGrant | LeaseFenced>
  release(docId, sessionId, epoch): Promise<void>
  validate(docId, epoch): Promise<boolean>       // 写前/推送前栅栏检查
  current(docId): Promise<LeaseGrant | undefined>
}

LeaseGrant {
  docId
  epoch: number            // 单调递增；每次成功 acquire 递增
  holder: { instanceId, sessionId, userId }
  expiresAt: number        // 服务端时钟
}
```

语义：

- `acquire` 用条件写（Redis `SET NX PX` + Lua CAS，或 Postgres
  `UPDATE ... WHERE expires_at < now()` / 唯一行 + 版本号）保证只有一个赢家；
  同一 holder 重入返回同一 epoch 并续期。
- `renew` 必须同时匹配 `docId + sessionId + epoch`；不匹配返回 `Fenced`。
- `release` 只允许当前 epoch 持有者；释放后可被他人以更高 epoch 获取。
- `epoch` 只能由 LeaseService 递增并只经服务端内部传递；客户端响应只显示 holder
  和过期时间，不返回可提交的 epoch。
- 时钟：TTL/过期以服务端时钟为准；客户端时间不参与。

### 6.3 与本地 briefcase 的交互

1. **写打开前**：先 `acquire` 外部 lease，再下载/打开可写 briefcase。拿不到就只读或
   409。epoch 写入 `SessionRecord.lease` 和 briefcase manifest。
2. **每次写**：`FeatureService.applyOp`、`PartStudioRegistry` 写方法、直改写门禁、
   `saveChanges`、`pushChanges` 先校验本地镜像 + `validate(docId, epoch)`（可缓存
   短期结果，超过安全窗口必须重新校验）。C5 前 `validate` 为本地内存检查。
3. **长操作**：服务端后台续租；op 开始时 `beginOperation` 延长到预算 + margin；
   commit 前最后一次 `validate`；epoch 变了则 `txn.end("abandon")` 并返回
   `409 Fenced`，不得把半成品写入。
4. **推送屏障**：`pushChanges` 在创建 changeset 前校验 epoch；失败不 push，本地
   脏事务保留（用户可重新取 lease 后再推）。changeset 描述/appData 可带 epoch 便于
   审计，但 hub 不把它当授权。
5. **租约丢失**：立即把 session 置 `fenced`：拒绝新写、`dropOwner` 活跃编辑命令、
   abandon 活动事务、把 briefcase 标为只读/隔离；不自动 push、不删除 dirty 文件。
   新的更高 epoch 持有者必须下载**新副本**（或从 checkpoint 重建），绝不复用旧文件。
6. **只读会话**：不取写 lease，可独立 pull/查看；不参与 fencing。
7. **多实例与单实例**：C5 前若部署多个 MS 实例，外部 lease 关闭时必须拒绝可写启动
   （例如启动时用共享 DB/Redis 探测实例数，或部署层强制单副本）；否则本地租约无法
   阻止双写。

### 6.4 失败模式

| 失败 | 行为 |
|---|---|
| LeaseService 不可达 | 写 fail-closed；只读继续；不降级为本地内存租约（多实例下危险） |
| renew 失败/epoch 被抢 | 标记 fenced；abandon 活跃命令/事务；保留 dirty 文件；不 push |
| MS 崩溃 | 租约按 TTL 自然过期；新持有者更高 epoch；旧文件隔离 |
| 两实例同时 acquire | 条件写只允许一个；败者 409 |
| 推送瞬间 epoch 过期 | push 前 validate 拒绝；若仍发生竞态，hub changeset 冲突/审计兜底 |
| 网络分区 | 旧持有者失去续租 → 过期；分区恢复后其写请求 validate 失败 |
| 服务端时钟漂移 | 以 lease 服务时钟为准；MS 只比较返回的 expiresAt 与自身单调时间，留安全边际 |

### 6.5 审计与可观测性

- 租约 acquire/renew/release/fenced 全部写审计（docId、user、session、instance、
  epoch、原因）；不含 token。
- 指标：租约等待时长、fenced 次数、dirty 文件数、外部服务错误率。
- 与本地 briefcase 的对应关系写 manifest，便于故障定位；manifest 不进客户端。

---

## 7. 迁移、兼容与回滚

### 7.1 功能开关

| 开关 | 取值 | 作用 |
|---|---|---|
| `SESSION_ISOLATION_MODE` | `off / shadow / enforce` | 是否启用连接上下文与 owner 校验；shadow 只记录违规不拒绝 |
| `SESSION_BRIEFCASE_MODE` | `legacy-shared / per-session` | 文件/缓存策略 |
| `EDITOR_OWNERSHIP_MODE` | `off / shadow / enforce` | Editor 命令分槽与直改门禁 |
| `OPLOG_AUTHOR_FILTER` | `off / shadow / enforce` | undo/redo/discard 作者过滤 |
| `EXTERNAL_LEASE_MODE` | `off / shadow / enforce` | C5；shadow 只观测 epoch 不阻断 |
| `SESSION_RECONNECT_GRACE_MS` | 数值 | 断线保留窗口 |
| `SESSION_FILE_RETENTION_MS` | 数值 | dirty 文件保留窗口 |
| `SESSION_TOKEN_VIA_QUERY` | `allow / deny` | 兼容期 query token；B5a 起默认 `deny`，`allow` 仅作已登记回滚窗口（X-18） |
| `HTTP_STATEFUL_RPC_MODE` | `deny / allow` | C6：有状态 HTTP RPC 默认拒绝（403 `HttpStatefulRpcDenied`，先于认证/协议处理，不查 Hub）；`allow` 仅作已登记回滚窗口（X-19） |

开关只由服务端配置决定；客户端不能请求某模式。非法组合（如 `per-session` +
`off` 的 owner 校验）启动时拒绝。

### 7.2 分阶段迁移

**Phase 0（C1 补强，前置）**

- per-connection 分片重组、per-connection 处理队列、每消息 ALS 上下文；
- 双连接 requestId 相同、大消息并发、慢请求隔离测试；
- 只记录，不改变 briefcase/editor 行为。

**Phase 1（C2 shadow）**

- 建立 `SessionRecord`、principal 解析、session/briefcase 注册表；
- 仍用共享缓存路径，但记录“若 per-session 会属于哪个 session/文件”；
- 观察日志：open 冲突、owner 违规、路径拒绝、undo author 统计；
- 退出标准：无双连接串线、无误报。

**Phase 2（C2 per-session briefcase）**

- 新会话走会话目录；旧共享缓存只允许一个 legacy 会话；
- `downloadBriefcase/openBriefcase` 返回服务端 key/fileName；
- 前端改为使用服务端 key；旧前端用 fileName 作为 key 时由兼容映射识别；
- 旧缓存采用策略：无 pending 且未被占用 → 复制/adopt 到会话目录（不移动、不删除）；
  有 pending → 保持 legacy 模式直到干净或由用户处置，不静默接管。

**Phase 3（C3 enforce）**

- Editor 命令按 owner 分槽；直改写门禁；
- OpLog 写 author + undo 过滤；
- 租约键改稳定 docId；
- 旧 OpLog 行在 enforce 模式不可撤销（一次性影响登记）；
- 双用户/双 session 真栈验收。

**Phase 4（C5 shadow → enforce）**

- 接入外部 lease；shadow 记录 epoch/冲突；enforce 后多 MS 实例才允许写。

### 7.3 单用户与旧客户端兼容

- 单用户单页面：行为应保持逐字一致；区别只是文件路径/key 由服务端签发、undo 归属
  打标。旧会话首次写入时若 OpLog 无 author，legacy 模式仍可 undo；切 enforce 后
  旧行不可 undo，需在发布说明/UI 诚实提示。
- 旧客户端仍发送 `crypto.randomUUID()` 的 sessionId：
  - `SESSION_ISOLATION_MODE=shadow/off`：按旧行为；服务器记录 client id 与连接绑定；
  - `enforce`：接受但只作为兼容/幂等参数；若与连接绑定不一致 → 403。旧客户端不应
    因此失去单用户功能。
- 旧客户端用 `fileName` 作为 key：`openBriefcase` 先按 fileName 在注册表反查；只允许
  本 session 的文件；否则 403。新前端使用服务端 key。
- 共享契约：若需要把服务端 sessionId/reconnect 信息返回给前端，扩展
  `BriefcaseDownloadResult` 等 DTO 时按 P0-07 bump shared `interfaceVersion` 双端发布；
  优先选择可选字段，保留旧字段一版。OpLog author 是 iModel 内 JSON 追加，不需要
  schema 版本迁移。
- 发布顺序：shared（可选字段）→ backend → editor（若改导出面）→ viewer `dist` →
  web。editor 变更后必须重建 viewer（见仓规），再做真栈 e2e。

### 7.4 回滚

| 层 | 回滚方式 | 数据影响 |
|---|---|---|
| core | 回退 per-connection 队列/ALS/重组三处文件；C1 响应路由保留 | 无持久数据变化 |
| MS session/owner | 开关回 `off/legacy-shared`；重启清内存注册表 | 会话目录文件保留，不自动删除；旧共享缓存可继续 |
| Editor | `EDITOR_OWNERSHIP_MODE=off` 恢复全局单槽 | 无持久变化；进行中的命令需重启 |
| OpLog | `OPLOG_AUTHOR_FILTER=off` 恢复旧过滤；新字段被旧代码忽略 | 旧行/新行均可读；不回写 |
| 外部 lease | `EXTERNAL_LEASE_MODE=off` 回本地租约，部署强制单实例 | 租约状态在外部服务 TTL 过期；本地文件保留 |
| 前端 | 回退 shared/editor/viewer/web；旧 key=fileName 兼容路径仍可用 | 无迁移 |

回滚前必须先把 active session drain：abandon 活跃命令、关闭句柄、写 manifest；
不得在开关切换瞬间让两个 session 同时持有同一文件。禁止把回滚当作“删除会话文件”的
同义词——dirty 文件保留并告警。

---

## 8. 测试矩阵

所有“真栈”用例要求：真实 MS + hub/Azurite/Postgres + 两个独立浏览器上下文/客户端；
`workers=1`，会话注入登录，避免 MS 限流（100/15min）误伤；涉及未保存数据时先清场。
单元/契约测试只是补充，不得替代真栈验收。

### 8.1 IPC / 会话身份

| ID | 场景 | 期望 |
|---|---|---|
| IPC-01 | A、B 同时 invoke，双方 requestId 都为 1，返回值不同 | 各收各的响应，无串线 |
| IPC-02 | A 发慢请求（>秒级），B 发快请求 | B 不被 A 阻塞；A 完成自己的响应 |
| IPC-03 | A、B 并发发送含二进制分片的大消息 | 两个消息都完整解码；无拼接错乱 |
| IPC-04 | B 在 RPC 中传 A 的 sessionId/user | 403/参数被忽略；操作仍按 B 上下文拒绝 |
| IPC-05 | B 在 RPC 中传 A 的 iModelKey | 403 SessionOwnership；A 的库不受影响 |
| IPC-06 | 过期/撤销 token 新建 WS | 401；已有 session 下一次敏感操作被拒并关闭 |
| IPC-07 | A 的 `/ws` 进度事件 | 无权限的 B 收不到；有权限的成员收到 |
| IPC-08 | HTTP 写 RPC | enforce 下 403；不得绕过 WS session |

### 8.2 briefcase / 路径 / 所有权

| ID | 场景 | 期望 |
|---|---|---|
| BC-01 | A、B 同时以写身份打开同一文档 | 两个独立 key/file/briefcaseId；B 的 open 不关闭 A；A 不受影响 |
| BC-02 | A 写、B 只读打开同一文档 | B 得到独立 checkpoint 副本；B 不可写；A 的文件不被 close |
| BC-03 | 两个只读会话 | 各自副本/句柄，互不关闭 |
| BC-04 | 同 session 重复 open 同文档 | 幂等返回同一 key/file，不重复下载 |
| BC-05 | B 用 A 的 key 调 `openBriefcase`/`closeIModel` | 403；A 仍打开 |
| BC-06 | B 用 A 的 key 调 `saveChanges/abandonChanges/toggleGraphicalEditingScope` | 403；A 的待提交事务不变 |
| BC-07 | B 用 A 的 key 调 `pullChanges/pushChanges/cancel*` | 403；hub 无新 changeset |
| BC-08 | B 用 A 的 key 调所有 `reverseTxns*/reinstateTxn*` | 403；A 的 undo 栈不变 |
| BC-09 | 路径遍历：`../`、绝对路径、UNC、`\\?\`、ADS、保留名、尾点/空格、大小写变体 | 400/403；不创建/打开任何越界文件 |
| BC-10 | 符号链接/目录联接指向会话根之外 | 403；不打开目标 |
| BC-11 | 会话根内但未注册/属于他人的文件 | 403；不打开 |
| BC-12 | 文件内部 iModelId/iTwinId 与请求不符 | 403 DocumentMismatch |
| BC-13 | 会话关闭清理 | clean 文件按策略删除并释放 ID；dirty 保留；active 不删 |
| BC-14 | 进程崩溃后重启 sweeper | 半成品清理；dirty 隔离；不自动交给新 session |
| BC-15 | `getConfiguration`/错误消息 | 不返回服务端绝对路径 |
| BC-16 | ESV/camera 路径传入任意路径 | 403；合法 key 只写会话目录 |

### 8.3 Editor / undo 所有权

| ID | 场景 | 期望 |
|---|---|---|
| ED-01 | A、B 各自 `startCommand` basicManipulation | 两个活跃命令并存；B 不 finish A |
| ED-02 | A 有活跃命令，B 调 `callMethod` | B 得到 NoActiveCommand；A 命令不受影响 |
| ED-03 | A 调 `callMethod` | 只打到 A 的命令/iModel |
| ED-04 | A 断开/登出 | 只 abandon A 的命令；B 的命令保留 |
| ED-05 | B 直改写 A 的 key（或伪造请求） | 403；A 的几何/事务不变 |
| ED-06 | A、B 各自执行 FeatureOp 后 undo | 各自只撤销自己的 op |
| ED-07 | A push、B pull 后 B undo | B 跳过 A 的行；B 只回退自己的行 |
| ED-08 | 旧 OpLog 行（无 author）在 enforce 模式 | 不可被新会话 undo/redo；legacy 模式行为不变 |
| ED-09 | 原生 undo（UndoTool/reverseTxns） | 只影响本会话文件的本地事务；B 不受影响 |
| ED-10 | 变量表多事务分组在途 | 仍拒绝 undo/redo；A/B 各自独立 |
| ED-11 | init 事务守卫、不可逆 opType | 现有拒绝语义保持，按 session 独立 |
| ED-12 | 新 op 到达时 discard undone 行 | 只 discard 本 author 的 undone 行 |

### 8.4 崩溃 / 重连

| ID | 场景 | 期望 |
|---|---|---|
| CR-01 | A 的 WS 断开 | 进入 draining；B 不能访问 A 文件；租约按 TTL 过期 |
| CR-02 | 持 reconnect cookie 在 grace 内重连 | 恢复同一逻辑 session/key/file；未保存数据仍在；旧 requestId 不 resolve |
| CR-03 | 无 cookie 重连 | 新 session；旧文件保留/隔离；不复用旧句柄 |
| CR-04 | MS 重启 | 内存 session 丢失；新 session 不接管旧写者；sweeper 安全处理 |
| CR-05 | 外部 lease 已升 epoch 的旧 session 写入 | 409 Fenced；不落事务、不 push |
| CR-06 | 旧页面/旧响应的迟到帧 | 不 resolve 新页面请求；不关闭新连接 |

### 8.5 外部 lease（C5 实现后）

| ID | 场景 | 期望 |
|---|---|---|
| LS-01 | 两个 MS 实例同时 acquire 同文档 | 一个成功，一个 409/DocumentLocked |
| LS-02 | 旧 holder renew/写入 | Fenced；无事务 |
| LS-03 | 续租失败后 push | push 前拒绝；本地 dirty 保留 |
| LS-04 | lease 服务不可用 | 写 fail-closed；只读继续 |
| LS-05 | 新 holder 获取更高 epoch | 必须下载新副本；不复用旧 briefcase 文件 |
| LS-06 | TTL 到期/时钟边界 | 旧租约失效；新 acquire 成功且 epoch 递增 |
| LS-07 | 只读会话 | 不取 lease；不参与 fencing |

### 8.6 兼容 / 回滚 / 性能

| ID | 场景 | 期望 |
|---|---|---|
| CP-01 | 旧单用户全流程（开/编辑/undo/save/push/close） | 行为不回归；真栈绿 |
| CP-02 | 旧客户端 client sessionId / key=fileName | 兼容映射可用；不获得他人权限 |
| CP-03 | 开关回 off/legacy-shared | 可回到共享缓存；无数据丢失；dirty 文件保留 |
| CP-04 | 开关切换时 active session | 先 drain 再切换；不双写 |
| PF-01 | 双 session 内存/CPU/文件数 | 有基线；清理不阻塞事件循环；长跑无泄漏 |
| PF-02 | 第二写者 open 被拒延迟 | 先租约检查后下载，不产生无效 briefcase |

---

## 9. 文件级实现计划

> 公共仓只列相对路径；私有仓以“`modeling-server/src/...`”相对路径表示。设计不复制
> 私有代码。所有 PR 按“代码 + 单测/契约 + 真栈/故障注入 + 文档/例外更新”交付。

### 9.1 公共仓（itwinjs-core / luban-cad）

| 文件（相对路径） | 改动 | 对应用例 |
|---|---|---|
| `itwinjs-core/core/common/src/ipc/IpcWebSocket.ts` | 增加 `connectionContext` 接缝；保留 C1 `ipcConnection` | IPC-01..04 |
| `itwinjs-core/core/common/src/ipc/IpcWebSocketTransport.ts` | per-connection 分片重组；保留来源附加 | IPC-03 |
| `itwinjs-core/core/backend/src/LocalhostIpcHost.ts` | 安装 ALS hook；连接关闭清理重组/上下文 | IPC-02/03 |
| `itwinjs-core/core/backend/src/IpcConnectionContext.ts`（新） | `AsyncLocalStorage` + `current()` | IPC-02..04 |
| `itwinjs-core/core/backend/src/IpcWebSocketBackend`（若拆文件） | per-connection 处理队列；每条消息建立上下文 | IPC-01..03 |
| `itwinjs-core/core/backend/src/RpcHandler` / `IpcHost.ts` | 可选 `RpcSessionGuard` 钩子（key 所有权/tile/read） | IPC-05 |
| `itwinjs-core/core/backend/src/core-backend.ts` | 导出内部上下文 API | — |
| `luban-cad/packages/editor/backend/src/EditCommand.ts` | `_activeCommand` → per-owner 槽；start/call/finish 用上下文 | ED-01..04 |
| `luban-cad/packages/editor/backend/src/EditBuiltInCommand.ts` | 写方法调用 `EditWriteGuard` DI 钩子 | ED-05 |
| `luban-cad/packages/editor/backend/src/EditCommandOwnership.ts`（新） | owner 类型/守卫接口/注册表 | ED-01..05 |
| `luban-cad/packages/editor/backend/src/test/EditCommandOwnership.test.ts`（新） | 双 session 单测 | ED-01..04 |
| `luban-cad/packages/editor/frontend/src/EditTool.ts` | 如需要，明确 key 语义；不新增身份 | — |
| `luban-cad/packages/viewer/src/connection/use-briefcase-connection.ts` | 使用服务端 key/fileName；重连 cookie；错误展示 | BC-01/02, CR-02 |
| `luban-cad/apps/web/src/modules/part-studio/hooks/useEditorSession.ts` | 消费服务端 sessionId；不再以客户端 UUID 作身份；兼容参数 | IPC-04, CP-02 |
| `luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts` | 视决策加可选 session 字段/版本 bump；不改变写方法签名（优先） | CP-02 |
| `luban-cad/packages/shared/src/rpc/LubanRpcInterface.ts` | 如改 ESV/camera 语义则 bump 版本 | BC-16 |
| `luban-cad/apps/web/e2e/session-isolation.spec.ts`（新） | 双浏览器上下文真栈 | BC/ED/CR 全 |
| `docs/ITWINJS_CORE_MODIFICATIONS.md` | 记录 core 改动与回滚 | — |

### 9.2 私有仓（luban-backend/modeling-server）

| 文件（相对路径） | 改动 | 对应用例 |
|---|---|---|
| `modeling-server/src/session/SessionRegistry.ts`（新） | session/connection/briefcase/lease 注册表；TTL/drain/reconnect | IPC/CR |
| `modeling-server/src/session/SessionContext.ts`（新） | ALS→SessionRecord；`require()`/测试注入 | IPC |
| `modeling-server/src/session/SessionPrincipal.ts`（新） | token→principal；短 TTL 缓存；重验策略 | IPC-06 |
| `modeling-server/src/session/PathGuard.ts`（新） | realpath/白名单/Windows 规则/GUID 校验 | BC-09..12 |
| `modeling-server/src/session/BriefcaseRegistry.ts`（新） | 会话目录、manifest、in-flight、清理/quota | BC-01..15 |
| `modeling-server/src/session/ExternalLeaseClient.ts`（新，接口） | C5 normalize；本地 shadow | LS |
| `modeling-server/src/middleware/wsAuth.ts` | `verifyWsUpgrade` 返回 principal；query token 策略 | IPC-06 |
| `modeling-server/src/main.ts` | `/ipc`/`/ws` 建 session；per-connection 进度；HTTP 写拒绝；启动守卫 | IPC-07/08, CP |
| `modeling-server/src/ipc/AppFunctionIpcHandler.ts` | 所有 key 方法 owner；open 不关闭他人；path/lease 校验 | BC-01..08 |
| `modeling-server/src/ipc/LubanIpcHandler.ts` | `downloadBriefcase` per-session；`_findDb` key-only；清理 | BC-01..14 |
| `modeling-server/src/feature/FeatureRpcImpl.ts` | 每方法 `requireOwnedKey`；session 来自 context | IPC-05, ED-06 |
| `modeling-server/src/feature/FeatureService.ts` | lease docId；OpLog author；dispose per dbKey | ED-06..12, PF |
| `modeling-server/src/feature/OpLog.ts` | author 字段/过滤；undo/redo/discard | ED-06..12 |
| `modeling-server/src/feature/WriteLease.ts` | 稳定 docId；principal holder；epoch 预留；beginOperation | ED-06, LS |
| `modeling-server/src/feature/DirectEditGuard.ts` | 注入 write guard 的 MS 实现（ACL/lease/audit） | ED-05 |
| `modeling-server/src/rpc/LubanRpcImpl.ts` | ESV/camera 改为 key；不返回 cacheDir | BC-15/16 |
| `modeling-server/src/rpc/export-gltf.ts` | 文件名派生只接受会话文件 | BC-16 |
| `modeling-server/src/middleware/rpcGuard.ts` | HTTP 有状态接口拒绝/会话绑定 | IPC-08 |
| `modeling-server/src/middleware/webhookEvents.ts` | 进度订阅按 session/ACL（C1.3 协同） | IPC-07 |
| `modeling-server/src/config.ts` | 开关与默认值/非法组合拒绝 | CP-03 |
| `modeling-server/src/session/*.test.ts` | registry/context/path/lease 单测 | 全部 |
| `modeling-server/src/ipc/AppFunctionIpcHandler.session.test.ts` | 跨 session close/save/push/undo | BC/ED |
| `modeling-server/src/feature/FeatureService.undoOwnership.test.ts` | OpLog author 过滤 | ED |
| `modeling-server/src/feature/WriteLease.docKey.test.ts` | 同文档不同文件 key 的互斥 | ED/LS |
| `modeling-server/src/rpc/LubanRpcImpl.pathGuard.test.ts` | ESV/camera/路径 | BC-16 |

### 9.3 交付顺序与门禁

1. **PR-0（core）**：per-connection 重组/队列/ALS + 双客户端测试 + 台账。
2. **PR-1（MS 骨架）**：session/principal/path guard + shadow 日志；无行为变更。
3. **PR-2（C2 briefcase）**：per-session download/open/owner + 前端 key；真栈双写/读写。
4. **PR-3（C3 editor/undo）**：命令分槽 + 直改门禁 + OpLog author + 租约 docId；
   双 session undo 真栈。
5. **PR-4（C6 收口）**：所有路径面、HTTP、tile/read key、配置脱敏；
   路径遍历/负例矩阵。
6. **PR-5（C5 接口）**：lease client 接口 + 本地 shadow + 部署守卫；
   实现排入 Sprint 2。
7. 每步更新 `ITWINJS_CORE_MODIFICATIONS.md`、`INTERFACE-FREEZE-MATRIX.md`、
   `EXCEPTIONS.md`（若共享不可变 blob/query token 等例外）、能力/证据索引。

**开工门（P0-04）**：本设计作为 C2/C3/C6 的 AIRR 输入，但不替代 AIRR。以下三项在编码前
必须单独 ADR/决策并写入决策记录：进程内 owner-scoped vs process-per-document actor；
外部 lease 服务接口与后端选型；shared 契约若新增 session/reconnect 字段的版本化与
双端发布。未裁决前只能做 shadow/测试夹具，不得启用 enforce。

---

## 10. 开放问题（需在 C2/C3 开工前裁决）

1. **进程内 vs process-per-document actor**：是否接受进程内 owner-scoped 状态？
   触发切 actor 的条件（不可收敛的全局单例、native 崩溃隔离要求、内存预算）是什么？
   建议：先做一次性可变单例审计，再在 C3 kickoff 由 ADR 定案；不要两套并行。
2. **briefcaseId 策略**：每写 session 一个 ID 的 hub 配额/alias/释放成本是否可接受？
   若不可，是否退化为“每用户一个可写 briefcase，但同一时刻只允许一个 session”
   （第二页面只读/拒绝），以及如何保证跨设备不双写？
3. **只读副本**：每 session 独立 checkpoint 副本（本设计默认）还是允许共享不可变
   checkpoint 文件？若共享，需登记例外并验证 SQLite 多读者/清理竞态。
4. **changeset 缓存共享**：`getChangeSetsPath` 的不可变 blob 共享是否满足“无共享文件”
   的验收口径？若要求字面零共享，需 per-session change 下载目录与配额代价评估。
5. **重连语义**：reconnect cookie 的 TTL、绑定方式（token fingerprint/IP/UA 是否参与）、
   跨 `/ipc` 与 `/ws` 是否同一逻辑 session、grace 内新连接是否继承未完成命令。
6. **undo 语义粒度**：G1 定为 per-session（不同标签页不共享 undo）是否符合产品预期？
   还是 per-user（同用户多 session 共享 undo）？两者对 OpLog author 过滤和原生栈
   的处理不同；若 per-user，需要服务端 user 维度并在 undo 时合并过滤。
7. **旧 OpLog 行**：enforce 模式下旧行不可 undo 的 UX 是否可接受？是否需要迁移时
   为旧行补 author（若可证明单用户/单文件来源）？不允许伪造。
8. **HTTP RPC**：是否彻底关闭有状态 HTTP RPC（推荐），还是保留带 session binding 的
   只读面？`/rpc/metadata` 继续开放是否可接受。
   **C6 决策（2026-11-23，实施切片）**：有状态 HTTP RPC 默认关闭
   （`HTTP_STATEFUL_RPC_MODE=deny`，403 `HttpStatefulRpcDenied`，先于认证/协议处理，
   不查 Hub、不触 briefcase）；保留上游 read/tile 只读面与两个纯静态操作
   （`getConfiguration`、`getFeatureFormModel`）；`allow` 仅作已登记的 X-19 回滚窗口。
   详见 `AIRR-2026-11-23-C6-SESSION-PATH-HTTP-RPC.md`。
9. **直改租约粒度**：所有直改 `callMethod` 都要求写租约，还是只在写方法门禁处要求？
   查询方法是否需要 ACL/所有权（本设计：需要 session 所有权，不需要写租约）。
10. **长操作与租约 TTL**：服务端 `beginOperation` 的预算上限、是否允许越过 30s TTL、
    外部 lease 续租失败的 mid-op 回滚策略（`txn.end("abandon")` 是否覆盖所有路径）。
11. **外部 lease 后端**：Postgres（当前栈已有、可审计/持久）还是 Redis（性能、需持久化
    配置）？epoch 的持久化、故障转移、跨区延迟和时钟安全边际。
12. **ACL 来源（B3）**：per-doc 权限来自 hub 的 iTwin/iModel RBAC 还是本地 ACL 表？
    tenantId 从哪里来？C2/C3 在 ACL 未就绪时是否只能 shadow，不能 enforce？
13. **Fencing 与 hub**：hub 没有 lease 条件推送；MS 在 push 前校验 epoch 仍存在
    “校验后、推送前”窗口。是否接受该残余风险，还是要求在 changeset appData 里带
    epoch + 推送后核对/审计？
14. **接口冻结**：服务端签发 sessionId/reconnect 是否要改 `BriefcaseDownloadResult`
    与 shared 版本？若改，旧客户端兼容窗口与双端发布节奏如何安排。
15. **会话文件保留**：dirty 文件保留 24h 是否足够？是否需要用户可见的“恢复未保存会话”
   入口（HITL），以及管理员清理审批。

---

## 11. 验收清单（G1 映射）

- [ ] 双用户（含只读）同文档：不互踢、不串 IPC/命令/undo（BC-01/02/03、ED-01..09）。
- [ ] 跨 session 的 close/save/pull/push/undo 全部 403，且不触碰目标库（BC-05..08）。
- [ ] 所有路径入口拒绝遍历/符号链接/UNC/设备名/未注册文件（BC-09..12/16）。
- [ ] 客户端传他人 sessionId/user/key 不获得任何权限（IPC-04/05）。
- [ ] 会话崩溃/重连：不双写、不丢 dirty 文件、不把旧文件交给新 session（CR-01..06）。
- [ ] OpLog undo/redo 按 author 过滤；旧行在 enforce 下诚实不可撤销（ED-06..12）。
- [ ] 写租约按稳定 docId；多 MS 实例在 C5 前被拒绝或由外部 lease 保护（LS-01..07）。
- [ ] 开关可回滚；旧单用户流程与旧客户端兼容（CP-01..04）。
- [ ] 所有新增行为有单测/契约 + 真栈或故障注入证据；文档/台账/例外同 PR。
- [ ] 不新增 Part Studio 功能、不引入第二套状态机/undo/模型库（P0-01/05/10）。

---

## 附录 A：错误/状态映射（建议）

| 条件 | 返回 |
|---|---|
| 无连接上下文（enforce） | `401 SessionRequired` |
| token/session 过期/撤销 | `401 SessionExpired`；关闭 WS |
| key/file 不属于当前 session | `403 SessionOwnership`（不回显他人路径） |
| 文档 ACL 拒绝 | `403 Forbidden`（B3） |
| 文件内部 iModelId/iTwinId 不符 | `403 DocumentMismatch` |
| 写租约被他人持有 | `409 DocumentLocked`（holder 显示名） |
| 外部 epoch 失效 | `409 Fenced` |
| 同 session 重复写打开 | `409 AlreadyOpen` |
| 路径非法/遍历 | `400 InvalidPath` |
| 命令不存在/不属本 session | `NoActiveCommand`/`FunctionNotFound`（不泄露他人命令） |
| undo 无可撤销行 | 现有 `"无可撤销的操作"` 语义；不跨 author |

## 附录 B：设计记录形状（非代码）

```text
SessionRecord:
  sessionId, connectionId, principal{userId,email,displayName?,tenantId?},
  state, opened: Map<key,BriefcaseRecord>, activeEditCommand?,
  lease?{docId,epoch,expiresAt}, createdAt,lastSeenAt,reconnectGraceUntil

BriefcaseRecord:
  key, docId(iModelId), iTwinId, fileName(server-only), briefcaseId,
  mode(readonly|rw), state, manifestVersion, leaseEpoch?

OpAuthor:
  userId, sessionId, briefcaseId, epoch?
```

这些是进程内/本地 manifest 的设计字段，不进入公共 RPC 响应；客户端只看到服务端
签发的 opaque key、逻辑 sessionId（用于显示/幂等）和错误原因。
