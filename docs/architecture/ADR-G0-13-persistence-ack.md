# ADR-G0-13：持久化 ack 与未推送窗口

> 状态：**Proposed under owner directive 2026-11-24; not ARB-signed**
> 日期：2026-11-24
> 决策来源：`G0-DECISION-REGISTER.md` D0-13（仍为 Proposed，未 ARB 签字）
> 关联：`docs/adr/0017-editor-flow-parity-defaults.md`、`ADR-G0-04-ledger-version-checkpoint.md`、`ADR-G0-09-session-process-model.md`、`ADR-G0-10-undo-granularity.md`、`G1-EXECUTION-PLAN.md`（D/E）、`G1-WAVE2-STATUS-2026-11-23.md`、`EXCEPTIONS.md`（X-15/X-17）、`G0-SPIKE-REGISTER.md`（S0-16）、`../research/lubancad-architecture-assessment/09-INDUSTRIAL-TARGET-ARCHITECTURE.md` §4.2/§4.4
> 影响面：FeatureOp/直改/save 的 RPC 语义、autosave/push、UI 状态、session briefcase/outbox、Hub changeset、checkpoint、用户承诺与故障恢复
> 本 ADR 只使用公开、脱敏事实；不包含私有源码、密钥或 native 构建证据。

---

## 1. 背景与约束

1. **当前“成功”有歧义。** FeatureOp/直改 RPC 成功只表示本地 briefcase 已保存；真正的云端持久化要等 Hub push 成功并形成 changeset。用户看到“成功/已保存”时，云端可能还没有数据。
2. **当前自动推送有窗口。** ADR-0017 D5 采用 Onshape 式自动保存：本地 `saveChanges` 后，`useAutoPush` 以防抖 20–30s 静默推送；崩溃、缓存删除、会话结束或网络失败会留下未推送窗口。`G0-DECISION-REGISTER.md` D0-13 记录当前约为 20s 防抖，并指出现有实现没有把“本地成功”和“云端持久化”区分给用户。
3. **ADR-0017 移除了常规保存/推送/未推送 UI。** 其 D5 明确“移除常规保存/推送/未推送 UI 与 Ctrl+S 保存语义”，并登记了 X-15：autosave push 会开启新 changeset 会话，已推送事务不再保证可 Undo。D0-13 要求 UI 明示未推送窗口，二者需要显式对账。
4. **checkpoint 不是保存。** checkpoint 是按每 N 条 changeset/Named Version 生成的历史快照，用于加速打开和版本打开；它不是每次保存的 ack。当前 D4 生成开关默认 OFF（X-17），更不能用 checkpoint 充当“已保存”证据。
5. **当前没有 outbox/retry 语义。** 推送失败、崩溃、浏览器 reload、MS 重启后的未推送编辑边界没有被量化；S0-16 在 `G0-SPIKE-REGISTER.md` 仍为 Not started。`SESSION-ISOLATION-DESIGN.md` §4.5 已指出：新会话不复用旧本地文件，防抖窗口内的未推送编辑会丢失，C7 之前只能依靠 beforeunload 提示或显式 flush。
6. 本 ADR 不新增 Part Studio 功能，不改变“FeatureOp 是唯一参数化写管道”和“标准事务/事件”边界。

## 2. 决策

### D-A 三个持久化层级，名称与语义固定

| 层级 | 触发/含义 | 持久范围 | 是否可撤销 | 是否可称为“已保存到云端” |
|---|---|---|---|---|
| `local-saved` | RPC 成功且会话 briefcase 的本地 `saveChanges` 成功 | 仅当前会话/本地文件；进程/缓存丢失可导致丢失（C7 前不承诺恢复） | 是（受 ADR-G0-10 的组/作者/push 边界约束） | 否 |
| `cloud-persisted` | Hub push 成功，changeset 已封账（对象存在 + 大小 + 服务端 SHA-256 + 链一致） | 云端 changeset；按 09 §4.4 的 ack 后 RPO=0 目标 | 否（push ack 是 undo 边界，见 ADR-G0-10/X-15） | 是 |
| `checkpointed` | checkpoint worker 在指定 changeset index/versions 生成成功并可回读 | 历史快照；用于快速打开/版本打开，不是每次保存 | 不适用（快照不可变） | 不等于 cloud-persisted；不能替代 push ack |

1. `cloud-persisted` 的判定以 ADR-G0-04 的封账语义为准：只有 `complete` 通过服务端字节/大小/哈希校验并进入 `fileUploaded`（或等价封账状态）才算；仅有 HTTP 200、仅有上传意图、仅有本地事务都不算。
2. `checkpointed` 只表示“历史快照可用”；一个文档可以已经 cloud-persisted 但尚未 checkpointed；checkpoint 失败不回滚 push ack，也不得把“已保存”降级为失败。
3. 任何 UI/文档/日志不得把 `local-saved` 或 `checkpointed` 写成 `cloud-persisted`。

### D-B RPC 契约：ok 只代表本地已保存

1. FeatureOp、直改、`saveChanges` 的 RPC 成功语义固定为：**会话本地 briefcase 的变更已保存**。它不表示 Hub 已持久化。
2. 如果本地保存失败，RPC 必须失败；不得返回 ok 后把错误留给后台。
3. 不在现有写 RPC 中加入 `cloudPersisted` 之类的布尔字段；云端状态通过 push/ack 状态与事件暴露。若确需新增状态字段，必须是 additive 可选字段、按 P0-07 更新 `INTERFACE-FREEZE-MATRIX.md` 并双端同版本发布；不得并行 REST DTO 或第二套契约。
4. 读/tile API 不得隐式触发 save/push/rebuild；持久化状态不得靠读路径“顺便”推进。

### D-C 推送 ack 是云端持久化，也是 undo 边界

1. 一次 push 只有在 Hub 成功创建并封账 changeset 后才算 ack；ack 必须记录 changesetId、目标文档、本地事务/组范围、时间与结果。
2. push 失败不得把状态改为 cloud-persisted，也不得丢弃本地已保存的编辑；用户必须能看到失败并重试。
3. push ack 开启新的 changeset 会话，构成 undo 的持久化边界（X-15）。UI 必须说明推送后的 undo 深度变化；不得宣称与 Onshape 相同。
4. push ack 后的 RPO=0 目标只适用于该 changeset 已封账的对象与元数据；不覆盖未推送的本地编辑，也不覆盖对象存储/DB 未完成恢复演练的现实。

### D-D 检查点不是每次保存的 ack

1. checkpoint 由每 N 条 changeset（建议 100–500）或 Named Version 触发，异步生成、回读验证；不是每次 `saveChanges`/push 的同步步骤。
2. 关闭 `CHECKPOINT_GENERATION_ENABLED`（X-17）时，push 仍可形成 cloud-persisted changeset；checkpoint 不可用只是打开/版本加速能力受限，不得因此宣称“保存失败”或“数据未持久化”。
3. 反向也成立：checkpoint 生成成功不代表某次用户编辑已推送；它只是某个已存在 changeset 的快照。

### D-E UI 必须显示未推送窗口

1. 用户可见状态至少包含：
   - 本地已保存、尚未同步（`local-saved` / unpushed）；
   - 正在同步（`pushing`）；
   - 已保存到云端（`cloud-persisted`，显示时间/版本）；
   - 同步失败，将重试 / 立即重试（`push-failed`，非模态、可见、不阻塞编辑）；
   - 会话即将结束且有未同步更改（beforeunload/关闭页签提示）。
2. **保留自动保存心智模型**：不恢复 Ctrl+S 作为主要保存流程，不要求用户每次手动 push；可以保留显式“重试同步”入口。
3. 状态必须来自真实的本地保存/push/ack 结果，不能由“RPC ok”或“checkpoint 存在”推断。多会话各自显示各自的持久化状态；一个会话的 push 不能让另一个会话误显示为“已保存到云端”。
4. 未推送窗口必须可量化：至少记录从最后一次本地保存到 push ack 的时间、失败次数、未推送事务/组数、脏文件保留状态；S0-16 的验收以这些数据为准。

### D-F outbox 与重试语义

1. **push outbox**（服务端、按会话/文档）在发起推送前记录意图：`{ docId, sessionId, briefcaseId, baseChangesetId, localTxnRange/operationGroupIds, idempotencyKey, attempt, nextRetryAt, state }`。状态至少包含 `pending / pushing / acked / failed-retryable / failed-terminal / abandoned`。
2. **single-flight**：同一文档同一会话同时最多一个 push；重复请求合并，不得并发创建多个 changeset。
3. **重试**：指数退避 + 抖动、有界重试；失败可见；不得静默丢弃。terminal 失败需要用户显式选择（重试/导出/在 HITL 下放弃），不得自动丢弃本地编辑。
4. **ack 与对账**：只有封账成功的 changeset 进入 `acked`；若在“已发出但未确认”的窗口崩溃，恢复时按 base changeset/索引/摘要对账。无法安全判定是否已创建时 fail-closed，要求用户确认，不得静默生成重复 changeset。
5. **进程/会话边界**：MS 重启后 outbox 记录必须可恢复或明确标记为不可恢复；浏览器 reload 建立新会话，旧 dirty briefcase 按会话保留策略处理（建议 24h，但当前不是产品承诺），新会话不得自动接管旧写者/旧文件；C7 之前不得承诺“离线编辑自动恢复”。
6. **丢弃**：放弃未推送编辑必须由 owner 在 HITL（预览→确认→审计）下执行；不得自动清理 dirty 文件，不得自动 push。

### D-G 与 ADR-0017 的对账

ADR-0017 D5 的“移除常规保存/推送/未推送 UI”与 D0-13 的“UI 必须明示未推送窗口”存在表述冲突。本 ADR 的裁决口径是：

1. **保留 ADR-0017 的产品方向**：移除手动 Ctrl+S/手动 push 作为主流程，保留 Onshape 式自动保存与文档级版本。
2. **修正“未推送 UI”的解释**：移除的是“手动保存/手动推送控件与工作流”，不是“持久化状态不可见”。必须增加非模态的持久化状态指示与失败重试入口；这不等于恢复手动保存。
3. **不宣称 ADR-0017 已批准或已被修改**：ADR-0017 本身仍为 Proposed；本 ADR 只记录对账口径，后续应由 owner/ARB 在 ADR-0017 或其继任 ADR 中确认。若 owner 否决该口径，回退方案是恢复最小只读状态提示，而不是回到“隐藏未推送窗口”。
4. **X-15 不因本 ADR 关闭**：ADR-0017 的 autosave/undo 深度差异仍然 open；本 ADR 只要求 UI 诚实显示 push 边界，undo 语义由 ADR-G0-10 处理。

### D-H 不变量

| ID | 不变量 |
|---|---|
| INV-1 | RPC ok = 本地已保存；不等于 Hub 已持久化 |
| INV-2 | cloud-persisted 只在 push ack 且 changeset 封账后成立 |
| INV-3 | checkpoint 是历史快照，不是每次保存的 ack |
| INV-4 | 未推送窗口对用户可见；失败不静默、不自动丢弃 |
| INV-5 | push 单飞、可重试、幂等/对账；不产生重复 changeset |
| INV-6 | dirty 文件不自动推送、不自动删除；跨会话不自动接管 |
| INV-7 | push ack 是 undo 边界；不承诺跨 push 的 undo 深度 |

## 3. 备选方案

| 选项 | 内容 | 结论与理由 |
|---|---|---|
| A | 本地 commit 即“已保存” | **拒绝**。会把本地成功当云端持久化，崩溃/清缓存即产生错误承诺 |
| B | 写 RPC 等待 Hub push 后才返回 ok | **拒绝**。编辑延迟与云端强耦合；离线/网络抖动会阻塞编辑；也无法消除 push 失败窗口 |
| C | 每次保存都生成 checkpoint 作为 ack | **拒绝**。成本与语义都不成立；checkpoint 是周期性历史快照，不是事务 ack |
| D | 保留 ADR-0017 的“无保存/推送 UI” | **拒绝（按字面）**。隐藏未推送窗口会造成静默数据丢失；需要状态可见 |
| E | 三层状态 + 自动 push + outbox/重试 + 状态指示 | **采用**。符合 D0-13，保持 Onshape 式自动保存，同时给出真实耐久语义 |

## 4. 后果

**正向**

- “已保存”有明确、可审计的定义；本地成功与云端持久化不再混淆。
- 用户能看到未推送窗口与失败，支持重试；减少静默丢失。
- checkpoint/push 的职责分离，避免用 checkpoint 充当保存 ack。
- outbox 为崩溃恢复/C7 提供可验证的中间状态。

**负向/代价**

- 需要服务端 outbox 与 UI 状态面；实现与测试成本增加。
- 自动 push 仍会产生较高的 changeset 频率（约 720/日/文档量级），需要 ADR-G0-04 的 checkpoint/GC 与 `10-ARCHITECTURE-HARDENING-PLAN.md` E7 的配额配套。
- push 失败会更显眼，产品上需要处理“长时间离线/持续失败”的 UX。
- 浏览器 reload/会话切换在 C7 前仍可能丢失未推送编辑；只能诚实提示，不能承诺恢复。
- X-15 的 undo 深度差异仍然存在。

## 5. 迁移、回滚与失败判据

### 5.1 迁移

1. **状态映射**：从现有状态推导 UI 状态——有未推事务 = local-saved/unpushed；push 在途 = pushing；最近一次 push 成功 = cloud-persisted；push 错误 = push-failed。先只读展示，不改写数据。
2. **outbox 为 additive 元数据**：以会话/文档为键，记录推送意图与 ack；不改变 changeset 账本结构。若需要 DB 表，按 ADR-G0-15 的迁移契约做 additive 迁移与回滚。
3. **共享契约**：若新增 UI 状态 RPC/DTO，必须按 P0-07 做 additive 可选字段、更新接口冻结矩阵、shared → editor → viewer → web → backend 同批发布；优先复用现有 push 状态/事件，避免新增第二套 DTO。
4. **开关**：`VITE_EDITOR_AUTOSAVE` 保留（ADR-0017 Stage F 回滚）；建议增加持久化状态开关（实施时登记配置清单），默认开启“状态可见、自动 push”；关闭只影响 UI 展示，不改变 D-B/D-C 的语义定义。
5. **S0-16**：在隔离环境完成“编辑但不 push、杀 MS/删缓存、重开”的丢失范围量化；未完成前不得声称未推送窗口已测量或已解决。

### 5.2 回滚

| 层 | 回滚方式 | 数据影响 |
|---|---|---|
| UI 状态 | 隐藏状态指示/恢复旧 UI；保留自动 push | 不改变本地/云端数据；不得回退到“把 local 当 cloud” |
| outbox | 关闭 outbox 消费，保留记录；恢复旧 push 路径 | 记录成为惰性元数据；不删除 dirty 文件 |
| autosave | `VITE_EDITOR_AUTOSAVE` 关闭，恢复手动推送工作流（ADR-0017 回滚） | 版本/历史只增不改；需要重新暴露手动控件 |
| 契约 | 回退 additive 字段/UI；旧客户端忽略未知字段 | 无迁移；不得删除已封账 changeset |
| checkpoint | 关闭生成开关（X-17），保留既有成功 checkpoint | push/保存语义不变；只是不能生成新快照 |

回滚不得把已 push 的 changeset 标为未保存，也不得删除用户未推送的本地数据来“清理状态”。

### 5.3 失败判据

1. UI 显示“已保存/已同步”，但 Hub 没有对应已封账 changeset。
2. 用 checkpoint 存在推断保存成功，或用 `local-saved` 推断云端持久化。
3. push 失败不可见、无重试、或 outbox 静默丢记录。
4. 重试/崩溃恢复产生重复 changeset 且无对账。
5. RPC ok 在本地保存失败时返回，或写 RPC 被 Hub push 阻塞到不可用。
6. 未推送窗口没有状态、没有计量；S0-16 未执行就宣称窗口已量化。
7. 新会话自动接管旧 dirty 文件并推送，或 dirty 文件被自动删除。
8. 关闭/离开页面可能丢未推送编辑却无提示。
9. 宣称 X-15 已解决或 undo 深度与 Onshape 一致。

## 6. 证据状态

- **ADR-0017（公开）**：D5 记录 autosave 20–30s 防抖、移除常规保存/推送/未推送 UI、保留 dev 开关；该 ADR 为 Proposed，未 ARB 签字。
- **例外**：X-15（autosave/undo 深度）与 X-17（checkpoint 生成开关默认 OFF）均 open；X-17 只影响 checkpoint，不改变 push ack 的定义。
- **当前实现状态**：`G1-WAVE2-STATUS-2026-11-23.md` 没有登记持久化 ack/outbox/UI 状态切片；没有 outbox/retry 实现证据；S0-16 未开始；没有未推送窗口的真实栈计时。
- **会话边界**：`SESSION-ISOLATION-DESIGN.md` §4.5 记录 reload/整页导航会建立新会话、防抖窗口内未推送编辑会丢失；C7 未实现。
- **缺失/不得宣称**：没有 cloud-persisted UI 证据、没有 outbox 真栈证据、没有 S0-16 结论；本 ADR 未获 ARB 签字。不得宣称“自动保存已具备云端持久化保证”或“未推送窗口已解决”。

## 7. 关联与未决

- `G0-DECISION-REGISTER.md` D0-13、`G0-EXECUTION-PLAN.md` §4/§5（S0-16）。
- `docs/adr/0017-editor-flow-parity-defaults.md`（D5 autosave/文档级版本、X-15 登记）。
- `ADR-G0-04`（changeset 封账、checkpoint 语义）、`ADR-G0-09`（会话/reload/briefcase 保留）、`ADR-G0-10`（undo 边界）。
- `EXCEPTIONS.md` X-15、X-17。
- `G1-EXECUTION-PLAN.md` WS-D/WS-E、`G1-WAVE2-STATUS-2026-11-23.md`、`G0-SPIKE-REGISTER.md` S0-16。
- 未决：outbox 是否需要独立持久表与恢复 worker；push 幂等键/对账规则；未推送窗口的 UI 形态（顶部状态/文档列表/两者）；C7 之前 reload 丢失的产品口径；X-15 的最终解决方式（接受边界或 undo/push 解耦）。

---

**关联**：`ADR-G0-04-ledger-version-checkpoint.md`、`ADR-G0-09-session-process-model.md`、`ADR-G0-10-undo-granularity.md`、`docs/adr/0017-editor-flow-parity-defaults.md`、`G0-DECISION-REGISTER.md`、`EXCEPTIONS.md`。
