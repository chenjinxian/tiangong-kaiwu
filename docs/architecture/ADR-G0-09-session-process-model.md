# ADR-G0-09：会话与进程模型（单进程 owner-scoped 过渡，process-per-document actor 为目标）

> 状态：**Proposed under owner directive 2026-11-24; not ARB-signed**
> 日期：2026-11-24
> 决策来源：`G0-DECISION-REGISTER.md` D0-9（仍为 Proposed，未 ARB 签字）
> 关联：`SESSION-ISOLATION-DESIGN.md`、`G1-EXECUTION-PLAN.md`（WS-C）、`G1-WAVE2-STATUS-2026-11-23.md`、`VIEWER-IPC-LIFECYCLE.md`、`EXCEPTIONS.md`（X-06/X-18/X-19/X-20）、`ITWINJS_CORE_MODIFICATIONS.md`
> 影响面：modeling-server（MS）进程/会话状态、IPC 路由、briefcase 文件与 key、Editor/undo 所有权、写租约、HA/多实例部署
> 本 ADR 只使用公开、脱敏事实；不包含私有源码、密钥或 native 构建证据。

---

## 1. 背景与约束

1. **MS 当前是一个宿主进程。** `IpcHost`、`EditCommandAdmin`、briefcase 缓存、FeatureService 单例、租约注册表等均为进程级对象。若两个已验证会话共享这些对象，A 的响应、活动命令、undo、关闭或推送操作可能作用到 B 的会话。
2. **C1 只完成了响应按连接路由。** `SESSION-ISOLATION-DESIGN.md` §1 已记录公开设计级事实：分片重组状态、处理队列、push/progress 广播仍有进程级残留；handler 尚未普遍获得可信连接上下文。仅修响应路由不能阻止跨会话资源访问。
3. **决策册 D0-9 的建议是 per-document actor**，并要求先证明 IPC/Editor/briefcase 隔离。2026-11-24 owner 指令选择分阶段实施：G1 期间保持一个 MS 进程，但所有可变状态必须按“已验证会话”owner-scoped；process-per-document actor 作为 C5/C7 与 fencing 完成后的 HA 目标，而不是当前形态。
4. **写租约当前是单进程 30s 内存租约（X-06）。** 在 C5 外部 lease/fencing 之前，多 MS 实例无法保证同一文档只有一个写者。本 ADR 把“单实例可写”写成显式硬前提，而不是隐含假设。
5. **G1 的能力上限是单写者 + 多只读。** 不承诺多用户生产、HA、故障接管、跨实例会话迁移或离线协作。
6. 本 ADR 不新增 Part Studio 功能，不引入第二套模型库/渲染平台/撤销状态机（P0-01/P0-05/P0-10）。

## 2. 决策

### D-A G1 进程形态：一个 MS 进程，状态 owner-scoped

1. **G1 期间一个部署栈只运行一个可写 MS 进程。** 不把“多实例 + 共享文件/内存租约”当作受支持形态。
2. **单进程内允许多个会话并行**，但下列状态必须按会话（或按会话 + 文档）分区，不得继续使用进程级单值：
   - 本地 briefcase 文件、服务端签发的 briefcase key、briefcaseId 与 manifest；
   - Editor 活跃命令（每个 owner 一个槽，不再使用全局 `_activeCommand` 单槽）；
   - 每个会话的 undo/redo 游标与作者过滤状态；
   - 写租约、会话注册、请求/响应路由和进度订阅；
   - 按 dbKey 的 FeatureService、缓存、队列与临时文件表。
3. **C5 之前多实例可写部署不受支持。** 部署层必须强制单副本；MS 必须提供启动守卫（共享注册/心跳等）以便在检测到第二个可写实例时拒绝可写启动。启动守卫只是防误部署，不能替代外部 lease/fencing。
4. **进程级不可变注册表可以共享**（例如命令类注册表），但任何可变实例状态必须 owner-scoped。是否可共享以“是否随用户/文档变化”判定。

### D-B 会话身份权威来自连接，不来自 RPC 参数

1. WS upgrade 验证 token 后，MS 生成服务端 `SessionRecord`，至少包含 `sessionId`、`connectionId`、`principal { userId, tenantId? }`、状态与过期信息。`sessionId` 由服务端生成，客户端传值不构成授权。
2. 每条 IPC 消息通过连接上下文取得会话；handler 只信任 `SessionContext.require()`。客户端传来的 `sessionId`、`user`、`fileName`、`key` 只用于兼容、幂等和错误提示，不能用于“找到会话”或授权。
3. 缺少连接上下文、token 过期/撤销、会话不匹配时 fail-closed（401/403），不得回退到默认用户、服务账号或共享 key。
4. 敏感入口（打开/保存/推送/直改/FeatureOp/租约获取/版本打开）复验会话状态；既有 WebSocket 的周期复验窗口按 X-20 登记，不宣称“下一请求生效”。

### D-C 一 session 一 briefcase 文件与 key

1. 每个可写会话使用独立 briefcase 文件、独立服务端签发 key 与独立 briefcaseId；文件位于会话专属目录，key 为不透明值，客户端不接触服务端绝对路径。
2. **不允许两个会话打开同一个可变 `.bim`。** 只读会话默认也使用各自副本；若未来共享不可变 checkpoint 文件，必须作为显式例外登记并验证 SQLite 多读者/生命周期。
3. `openBriefcase`、`closeIModel`、`saveChanges`、`pullChanges`、`pushChanges`、`undo/redo/discard`、`reverseTxns*`、tile/read、saved views/camera、export 等所有文件入口先校验 key 属于当前会话，再触碰数据库；否则 `403 SessionOwnership`，且不关闭/不修改目标库。
4. 路径先注册表、后路径：只接受会话注册表内的文件，拒绝 `..`、绝对路径、UNC、设备名、符号链接逃逸、保留名等；错误信息不回显他人路径。
5. 会话关闭/崩溃时：clean 文件按策略清理；dirty 文件保留/隔离，**绝不自动推送、绝不自动删除用户未推送数据**；不同 epoch 不复用旧文件。

### D-D Editor、undo 与写租约的所有权

1. Editor 活跃命令按 owner（会话）分槽；`startCommand`、`callMethod`、`finishCommand` 只解析本会话的命令，不提供全局 fallback。
2. 直接编辑的每个写方法经过统一写门禁：会话所有权 + per-doc ACL + 有效写租约（C5 后加 epoch）+ 标准事务/审计；缺一 fail-closed。查询方法至少要求会话所有权，不要求写租约。
3. 写租约键使用稳定文档 id（`iModelId`），不得使用 per-session 文件 key；否则两个会话各自持有“不同 key 的租约”，隔离失效。
4. 同一文档在单 MS 进程内最多一个可写会话；多只读可并存。OpLog 的 undo/redo/discard 按作者（userId/sessionId/briefcaseId）过滤，A 的 undo 不得回退 B 的编辑。
5. 直改与 FeatureOp 共享同一权限/租约/审计边界，不建立第二套编辑或撤销状态机。

### D-E process-per-document actor 是 HA 目标，不是当前实现

1. **目标形态**：路由进程校验会话后，把文档会话路由到 per-document actor；actor 各持一个 `BriefcaseDb`、`EditCommandAdmin`、`FeatureService`、租约客户端与缓存；客户端不直接暴露 actor 端口。这样可把 native 全局状态、undo 栈、事务与崩溃域收敛到单文档。
2. **启动条件**：C5 外部 lease/fencing 生效、C7 会话恢复/从 checkpoint 水化可用、会话路由/粘性路由经过真栈验证、双用户部署 canary 通过、actor 的进程生命周期/优雅关闭/崩溃恢复/可观测性有证据。缺一不迁移。
3. **一次选定，不双轨上线。** 不得同时维护“进程内 owner-scoped”和“actor 形态”两套生产实现；切换通过单一开关与部署单元完成，回退也只能回到一个形态。
4. 在 actor 尚未实现前，本 ADR 不把 actor 的隔离/HA 能力计入任何完成声明。

### D-F 能力声明上限

G1 期间允许的声明只有：

- 单 MS 实例、单写者 + 多只读；
- 会话级 IPC/briefcase/Editor/undo 所有权已有代码与单测；
- 未能证明双用户部署形态时不宣称“多用户可用”。

不得声明：多用户生产、多实例 HA、故障接管、跨实例会话迁移、离线持久化、C5/C7 已完成。

### D-G 不变量

| ID | 不变量 |
|---|---|
| INV-1 | 授权只来自连接上下文；客户端 sessionId/user/key/fileName 永不作为授权依据 |
| INV-2 | 两个会话不共享可变 briefcase、活跃 Editor 命令、undo 栈、租约或可变缓存 |
| INV-3 | 每个写路径同时具备 ACL + 租约/epoch + 文件所有权 + 标准事务；缺一 fail-closed |
| INV-4 | 同一文档同时最多一个写者（单进程内；C5 后跨实例）；只读可多个 |
| INV-5 | C5 前多实例可写部署被拒绝或不支持；单实例假设显式可见 |
| INV-6 | dirty 文件不自动推送、不自动删除；不同 epoch 不复用旧 briefcase |
| INV-7 | process-per-document actor 只是目标；未满足启动条件前不得作为已实现能力引用 |

## 3. 备选方案

| 选项 | 内容 | 结论与理由 |
|---|---|---|
| A | 单进程 + 共享全局单例，仅修响应路由 | **拒绝**。无法阻止跨会话 close/save/push/undo；S0-1 的核心失败模式仍在 |
| B | G1 立即 per-session 进程 | **后置**。需要进程路由、生命周期、C5/C7；当前没有 fencing/恢复证据，成本高于收益 |
| C | G1 立即 process-per-document actor | **作为目标，不在 G1 立即实施**。方向正确，但先要 C5/C7、路由和真栈隔离证据；否则只是把未验证的隔离假设搬进更多进程 |
| D | 单进程 + 每会话 owner-scoped 状态（本决策） | **采用（过渡）**。用最小进程模型先证明状态隔离；保留 actor 的单向迁移跑道 |

## 4. 后果

**正向**

- 在不引入多进程复杂度的情况下，把会话隔离落到可测试的 owner 边界。
- 与 C5/C7 的目标架构兼容；actor 迁移不需要推翻数据模型或 undo 模型。
- 单实例假设被显式登记，避免“内存租约 = 多实例租约”的错误承诺。

**负向/代价**

- 单进程崩溃影响所有会话；没有 HA/故障接管。
- 必须做一次进程级可变单例审计，并持续防止新代码引入全局单值。
- 每会话一个 briefcase 文件会消耗 briefcaseId/磁盘；dirty 文件保留需要配额与清理策略。
- 浏览器 reload/整页导航建立新会话，旧本地未推送编辑不会自动续用；这与 ADR-G0-13 的未推送窗口直接相关。
- C5/C7 是硬阻塞；在此之前不能把多用户、HA 或会话恢复写成已完成。

## 5. 迁移、回滚与失败判据

### 5.1 分阶段迁移

| 阶段 | 内容 | 退出条件 |
|---|---|---|
| Phase 0 | C1 补强：per-connection 分片重组、处理队列、每消息连接上下文、响应只回来源 | 双连接同 requestId、大消息并发、慢请求隔离有测试 |
| Phase 1 | C2 shadow：SessionRecord/principal/注册表，仍用旧共享缓存，记录“若 per-session 会属于谁” | 无双连接串线、无误报 |
| Phase 2 | C2b per-session briefcase：会话目录、服务端 key/fileName、前端消费 key | 双用户同文档打开/关闭/读写不互踢（需真栈） |
| Phase 3 | C3 editor/undo enforce：命令分槽、直改门禁、OpLog author、租约键改 docId | 双会话 undo/直改不串；旧 OpLog 行行为已登记 |
| Phase 4 | C6 收口：全部路径/所有权入口、HTTP 有状态 RPC 默认拒绝（X-19） | 越权 key/路径/HTTP 负例 403；真栈证据 |
| Phase 5 | C5 外部 lease/fencing + C7 会话恢复 | 双实例不双写；崩溃/重启可恢复；epoch 生效 |
| Phase 6 | process-per-document actor | 第 2 节 D-E 的启动条件全部满足；单向切换 |

功能开关（实现以配置清单为准）：`SESSION_ISOLATION_MODE=off/shadow/enforce`、`SESSION_BRIEFCASE_LAYOUT=legacy-shared/per-session`（设计文档中也称 `SESSION_BRIEFCASE_MODE`）、`EDITOR_OWNERSHIP_MODE=off/shadow/enforce`、`OPLOG_AUTHOR_FILTER=off/shadow/enforce`、`EXTERNAL_LEASE_MODE=off/shadow/enforce`、`HTTP_STATEFUL_RPC_MODE=deny/allow`（X-19）、`SESSION_TOKEN_VIA_QUERY=allow/deny`（X-18）。非法组合（例如 per-session 布局却关闭 owner 校验）必须在启动时拒绝。

### 5.2 回滚

| 层 | 回滚方式 | 数据影响 |
|---|---|---|
| core IPC | 回退 per-connection 队列/上下文/重组改动；保留 C1 响应路由 | 无持久数据变化 |
| MS session/owner | 开关回 `off/legacy-shared`；重启清内存注册表 | 会话目录保留，不自动删除；旧共享缓存可继续 |
| Editor | `EDITOR_OWNERSHIP_MODE=off` 恢复全局单槽 | 无持久变化；进行中的命令需重启 |
| OpLog | `OPLOG_AUTHOR_FILTER=off` 恢复旧过滤；新字段被旧代码忽略 | 旧行/新行均可读，不回写 |
| lease | `EXTERNAL_LEASE_MODE=off` 回本地租约，部署强制单实例 | 外部租约按 TTL 过期；本地文件保留 |
| actor | 路由回进程内形态并关闭 actor 单元 | 必须先 drain 会话；dirty 文件保留，不自动迁移/推送 |

回滚前必须先 drain 活跃会话：结束活跃命令、关闭句柄、写 manifest；不得在开关切换时让两个会话同时持有同一文件。禁止把“回滚”当作删除用户 dirty 数据的同义词。

### 5.3 失败判据

出现任一即视为本 ADR 失败/不得宣称完成：

1. 任一 close/save/pull/push/undo 可跨会话作用于他人 briefcase。
2. handler 用客户端传入的 sessionId/user/key 决定授权或找到会话。
3. 仍存在未 owner-scoped 的可变全局状态（命令实例、briefcase、undo、租约、可变缓存），且无登记例外。
4. 两个会话能打开同一个可变 `.bim`。
5. C5 未完成却部署多个可写 MS 实例，或把内存租约当跨实例租约。
6. 未跑真实双用户部署 canary 就宣称多用户可用。
7. 宣称 C7 会话恢复/HA，但无法从 checkpoint 水化或无法证明不双写。
8. dirty 文件被自动推送、自动删除或跨 epoch 复用。
9. 宣称 process-per-document actor 已实现，但没有路由、fencing、恢复或 actor 真栈证据。

## 6. 证据状态

- **设计级公开事实**：`SESSION-ISOLATION-DESIGN.md` §1 列出 C1 残留、briefcase 缓存、全局 Editor 单槽、OpLog 无作者过滤、租约键为文件 key 等现状；该文档为 Proposed 设计，不是实现验收。
- **C6 公开证据**：`G1-WAVE2-STATUS-2026-11-23.md` §1 记录 C6 的 MS 受影响 suite 24 files/234 tests、tsc/eslint，以及 C6 AIRR；同时明确“双会话真栈 e2e 未跑”，`pullChanges/abandonChanges/toggleGraphicalEditingScope` 的租约检查顺延。
- **C2b 公开使用点**：`AIRR-2026-11-23-D5-VERSION-OPEN.md` 的隔离 canary 使用 `SESSION_BRIEFCASE_LAYOUT=per-session` 做版本只读打开；这是 per-session 布局的单会话证据，不是双用户隔离证据。
- **owner 2026-11-24 实施快照**：C1/C2/C2b/C3/C6 已有代码与单测；C1/C2/C3 的测试计数未在公开文档登记，因此本 ADR 不引用具体数字。
- **缺失/未完成**：尚无真实双用户部署形态 canary；C5 外部 lease/fencing 与 C7 恢复未实现（`G1-WAVE2-STATUS-2026-11-23.md` §2.6）；G0 S0-1 在 `G0-SPIKE-REGISTER.md` 仍为 Not started；X-06、X-19、X-20 仍 open。
- **签字**：本 ADR 为 owner 指令下的拟制稿，未获 ARB 签字；不得作为 G1 Gate 通过或多用户生产承诺的依据。

## 7. 关联与未决

- `G0-DECISION-REGISTER.md` D0-9、`G0-EXECUTION-PLAN.md` §4/§7。
- `SESSION-ISOLATION-DESIGN.md`（C1 残留、SessionRegistry、owner 矩阵、C5 接口、测试矩阵）。
- `G1-EXECUTION-PLAN.md` WS-C（C1–C7）、`G1-WAVE2-STATUS-2026-11-23.md`。
- `EXCEPTIONS.md` X-06（单进程内存租约）、X-18（query token 回滚）、X-19（HTTP 有状态 RPC 回滚）、X-20（WS 周期复验窗口）。
- `ADR-G0-10`（undo 粒度）、`ADR-G0-13`（持久化 ack 与未推送窗口）。
- 未决：C5 lease 后端（Postgres/Redis）与 epoch 持久化；C7 reconnect cookie/水化语义；每写 session 一个 briefcaseId 的配额策略；只读 checkpoint 是否允许共享不可变文件；actor 的内存/启动成本与进程编排。

---

**关联**：`ADR-G0-04-ledger-version-checkpoint.md`、`ADR-G0-10-undo-granularity.md`、`ADR-G0-13-persistence-ack.md`、`G0-DECISION-REGISTER.md`、`G1-EXECUTION-PLAN.md`、`SESSION-ISOLATION-DESIGN.md`。
