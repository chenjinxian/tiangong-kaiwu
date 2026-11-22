# 数据协同 / 实时编辑 / 版本 / PDM：架构深挖

> 核心结论：
> - **基础版本/权限/共享**：**B（部分满足）**——iModelHub + changeset + Named Version + iTwin 权限可用于单组织文档协作；但 Named Version 只是元数据，没有 checkpoint/恢复/比较闭环。
> - **单用户实时编辑**：**B**——RPC/IPC + FeatureOp + 预览 + 原生事务可用，但 autosave push 会清空 undo。
> - **单写者 + 多只读**：**当前不可用（D→B）**——MS 共享 briefcase/文件，IPC 对所有连接广播、requestId 从 1 递增，第二个打开者（含只读）会关闭前一会话 DB；必须先做会话隔离。
> - **异步多用户（多 briefcase）**：**B（底座具备，应用未接）**——Hub 支持多 briefcase/锁/rebase；应用层单 briefcase + 单写租约；undo 所有权/身份/缓存失效未接。
> - **多用户同时编辑（Onshape 式）**：**D（方向性冲突）**——单写者租约 + 单 briefcase + changeset/briefcase + 无 presence/操作流/冲突 UX。
> - **分支/合并**：**D**——changeset 单父链 + fork 新 iModel，无版本图/跨 iModel merge；`preserveHistory` 不生效。
> - **评论/任务/Follow/发布/PLM**：**C**——需要新平台服务与数据模型。
> - **冷开/规模**：**B（本地）/ C（生产 SLA）**——无 changeset checkpoint 生成器，冷开全量重放；20s autosave 放大历史；账本可 PATCH/DELETE，悬挂 changeset 可永久阻塞链头。

---

## 1. 当前数据/协同架构

### 1.1 iModel/BIS 与 changeset

```
iModel（文档容器）
 ├─ BIS 元素/关系（Part Studio scope、Feature、Sketch、BodySolid、OpLogEntry）
 ├─ Changeset（index 单调递增的线性历史）
 ├─ Named Version（对某个 changeset 的命名引用）
 ├─ Briefcase（用户可写本地副本；带 briefcaseId）
 ├─ Checkpoint（加速打开/恢复的数据库快照）
 └─ Lock（按 briefcase/对象粒度）
```

- Changeset 是**线性**的；单父链，服务端强制 `parentId=链头`，append-only（但 API 有 PATCH/DELETE 软删，不是严格不可变账本）。Named Version 只是命名引用，不是分支。
- 打开模型时下载 briefcase/checkpoint；本地编辑后 `saveChanges` → `pushChanges` 上传 changeset。
- 多用户可以各自持有 briefcase；iTwin briefcase/changeset 机制本身支持 push/merge，但应用层在其上加了单写者门禁（见下）。
- **Checkpoint 只有 baseline（index 0）**：`createOrUpdateForChangeset` 无调用方；Named Version 创建**不生成** checkpoint/缩略图，`NamedVersionCreated` 事件不发射，计数恒 0。冷开 = 下载 baseline + 按序 apply 全部 changeset。
- **没有 read-only 版本打开路径**：MS `openCheckpoint` 未实现、`downloadBriefcase` 无 changeset/version 参数；即使记录“引用 V1”，产品也无法打开 V1。版本引用/Assembly 钉版本/Derived 在此之前都是不可解析的。
- Hub 提供 iTwin/iModel 成员、角色、组、邀请、分享、权限；应用有分享对话框与 Readonly/Editable 判定。但 **groups/shares 只存不判**，授权链路只读 owner/userMember/roles。

### 1.2 应用层单写者租约

- `modeling-server` 的 `WriteLeaseRegistry`：**一个 iModel 同一时刻仅一个活跃编辑会话**；TTL 30s；前端 10s renew；其他会话取租约被拒。
- **更严重的正确性问题（代码路径，需双浏览器 e2e 复核）**：MS 对同一 iModel 只缓存/复用一个 briefcase 文件；`openBriefcase` 在打开前会 close 同 key/同文件名的现有 `BriefcaseDb`。第二个同角色打开者（编辑者/编辑者，或只读/只读）落在同一文件时，会**关闭第一个会话的后端 DB**，前端无自动恢复。多人协作不是“降级只读”，而是直接断线。
- **IPC 不是按连接隔离**：`LocalhostIpcHost` 对所有 WS 连接广播，前端 `_nextRequest` 每页从 1 递增；两个客户端相同 requestId 可能互相命中 pending promise。第二用户（含只读）不是“看同一模型”，而是会收到别人的响应/把命令串到别人的库。
- **直接编辑绕过写门**：pattern/mirror/delete/transform 等 editor 直改命令不检查写租约、不查 ACL、不写 OpLog；`DirectEditGuard` 只打 `overridden` 标记。即使只保留“单写者”，直改入口也必须绑定会话/权限，否则租约只是 FeatureOp 的局部约定。
- 为什么存在：特征求值/缓存/写事务需要一个确定的写者；iModel 原生事务、EDE 传播、缓存标记与 save 之间不能被另一个写者插入。
- 后果：
  - 两个用户不能同时编辑同一 Part Studio；第二人取租约被拒，写 op 在 35s 自愈窗口后失败。
  - 共享 briefcase 的原生 undo 栈不属于用户会话：A 的 undo 可能撤销 B 的修改；20s push 还会清空整个栈。
  - 没有 presence/光标/选择/跟随/“谁在编辑”提示。
  - 任何“实时协作”都退化为“单写者 + 其他人刷新/重开看 changeset”。

### 1.3 自动保存与撤销

- `useAutoPush` 默认 20s 防抖调用 `connection.pushChanges`；push 开启新 changeset 会话并**清空原生 undo/redo 栈**。
- 每次 push 前 core 会先 `pullMergePush`（拉取他人 changeset、rebase 本地事务），再推送；当前单 briefcase 下主要是开销。
- 这是为降低“未保存变更”风险做的取舍，但直接导致：
  - 用户 20s 后无法撤销之前的操作（除非重新打开版本）。
  - 与 Onshape “自动保存但无限撤销/历史”不一致。
  - **历史线性放大**：4 小时活跃编辑、20s 一次约 720 changeset/日/文档，一周约 5,000；没有 checkpoint 时每次冷开都要重放，存储对象数单调增长。
- 当前 OpLog 只覆盖部分 op（`updateParams`/`updateVariables`）的线性撤销；插入/删除/重排依赖原生事务。
- **这不是几何/数据模型阻塞**，可通过调整 autosave/push 策略、扩展 op log、按用户保留 undo 来改进；但与多用户协同一起设计更合适。

### 1.4 版本/共享现状

- 前端有 Changesets 列表、Named Version 创建/列表、分享对话框、只读/可编辑判定。
- 没有：
  - 分支/分叉/合并（顶栏 `main` 是静态 pill；Merge/Restore 为 gated 占位）。
  - 版本比较/差异 UI（后端 compare 也返回未实现）。
  - 评论/标记/任务/Follow/View Only 工具栏完整实现。
  - 发布/修订/审批/作废/PLM/BOM。
- **判定**：基础版本/共享 B；Onshape 级 PDM/协同 C。

### 1.5 版本账本的当前缺陷

- **changeset 可改写且可挖洞**：PATCH 可改 `parentId`；parentId 缺失时不做链头校验，可创建第二个根；DELETE 软删不检查子节点/NV/checkpoint 引用，形成 index 空洞；列表不过滤 `waitingForFile`。
- **complete 不校验字节**：`completeFileUpload` 只检查 filePath 非空，不校验 blob 存在/大小/checksum；checksum 下载路径不比对。可产生幽灵 changeset。
- **悬挂 changeset 阻塞链头**：create 先落 `WaitingForFile` 行，链头判定不区分状态；若上传/complete 前崩溃，后续 push 永久 422；无清理 job。
- **fork 语义不实且可能复制空文档**：fork 只复制最新成功 checkpoint；对已有编辑的文档，最新 checkpoint 仍是 baseline（index 0），因此 clone/fork 得到的是**空文档**而非当前内容；`preserveHistory` 只进 operation metadata；一旦有 mid-history checkpoint，fork 可能因外键指向目标不存在的 changeset 而失败；跨 iTwin fork 还会因 checkpoint 内 iTwinId 未重写而失败。
- **正确顺序**：**冻结账本（不可变 + 悬挂恢复 + fork 语义）→ checkpoint 生成 → Named Version 真快照 → restore/compare → refs/分支**。checkpoint 不能先于账本修复，否则 fork/clone 会先坏。
- **持久性边界**：FeatureOp 返回 ok 只代表本地 briefcase 已保存，不等于 hub 已持久化；普通编辑依赖前端 20s push，崩溃/磁盘损坏可能丢窗口；读树/读草图在 cold/cache miss 时还会触发 `ensureWarm/rebuildAll` 的写事务。读路径写库、RPC 成功语义必须在工业级契约中明确。

---

## 2. Onshape 的协同模型 vs 当前模型

| 维度 | Onshape | 当前 LubanCAD |
|---|---|---|
| 同时编辑 | 多用户同时编辑同一文档/Part Studio；实时 presence | 单 iModel 单写租约 + 单 briefcase；第二个同角色打开者关闭前一会话 DB |
| 异步多用户 | 同一工作区实时 | Hub 支持多 briefcase/锁/rebase；应用未接 per-user briefcase |
| 自动保存 | 自动保存，undo/历史可用 | 20s push，清空原生 undo；每次一笔 changeset |
| 版本 | Version 不可变；Branch 分叉；Merge/Restore | changeset + Named Version（仅元数据）；无 checkpoint/restore/compare；无 branch/merge |
| 评论/任务 | 评论/标记/@/任务/Follow | 无后端/无 UI |
| 权限 | View/Edit/Copy/Link/Export/Comment/Share/Delete；Light/Guest/项目角色 | iTwin 角色 + iModel 四维 ACL（粗粒度）；groups/shares 只存不判；MS 通道不查 ACL |
| 审计 | 版本/修订/评论/审批历史 | changeset/OpLog/webhook delivery 可追溯；但 changeset/briefcase 归服务账号、OpLog.user 是 sessionId |
| 发布 | Release candidate/审批/修订/作废/水印/审计 | 无 |
| PLM | Arena/BOM/Change 同步 | 无 |
| 规模 | 多租户 SaaS | 本地单栈/单 MS 进程；无 checkpoint 生成器，冷开随历史线性劣化 |

### 2.1 为什么“多用户同时编辑”是 D 而不是 C

不是因为 iTwin 不能多 briefcase，而是因为当前架构的**核心假设**不同：

1. **写模型**：FeatureOp 写 BIS + 几何缓存 + EDE + OpLog；同一 Part Studio 的并发写需要操作级排序/冲突处理，而当前只有“单写者租约”。
2. **编辑语义**：特征链/orderKey/依赖边是强一致的；两个用户同时插入/删除/重排特征会产生结构性冲突，不能像文本 OT 一样简单合并。当前特征图还是“每 body 单源线性链 + 单输出 + tail-only 删除”，连 Onshape 的任意特征图/回滚都不支持，更不足以承载并发结构编辑。
3. **操作粒度**：`updateSketch`/`updateVariables` 是**整表覆写**（不是逐实体/逐变量 delta）；并发草图/变量编辑必然互相覆盖，无法做最小合并单元。
4. **体验语义**：Onshape 的同时编辑包含 presence/选择/光标/Follow/逐用户 undo；当前没有事件总线/房间模型/操作广播。
5. **持久化语义**：changeset 是线性历史；Onshape branch/merge 是版本图；当前没有 branch/merge 数据模型。
6. **Undo 语义**：多用户同时编辑需要 per-user undo/operation ownership；当前原生 undo 是连接级，push 还会清空。

因此，需要的新层至少包括：
- **会话隔离**：per-session IPC 路由、briefcase 文件/key、Editor 命令；共享 briefcase/全局广播下连多只读都不可用。
- **账本冻结**：changeset 不可变、悬挂 `waitingForFile` 恢复、fork 语义；否则 checkpoint/版本/发布都建在可改写账本上。
- per-user briefcase（去掉单 briefcase 共享与 close-existing 互踢）与 per-user 写租约/锁冲突 UI。
- **undo 所有权**：OpLog 随 changeset 传播，`findUndoTarget` 不按 user/briefcase 过滤；异步多用户第一步是让 undo 按用户/会话过滤，而不是只加 briefcase 数量。
- 会话隔离：per-session IPC 路由/文件/key/Editor 命令；共享 briefcase 与全局 IPC 广播下，“多只读”也不可用。
- 房间/在线状态服务（presence、光标、选择、follow）。
- 操作流/序列化（每个 FeatureOp 带 clientId/opId，服务器排序/冲突处理）。
- 特征/草图的并发冲突策略（结构性冲突如何拒绝/合并/提示；整表覆写必须改成 delta 或拒绝并发）。
- Per-user undo 与 changeset/版本的关系。
- checkpoint 生成器（按 N changeset / Named Version），否则每次 pull/冷开都重放全历史。
- 用户归因（briefcase/changeset/OpLog 带真实 userId）与 per-iModel 授权。

这是一个**独立的协同子系统**，不是打开两个 briefcase 就能得到。

### 2.2 可复用的部分

- iTwin changeset/checkpoint/briefcase/lock 仍是持久化与合并的底座；Hub 的多 briefcase/锁矩阵/advisory-lock 事务、core 的 `pullMergePush`/rebase/semantic rebase 已具备，可支撑**异步多 briefcase**（B）。
- WebSocket `/ipc`/`/ws` 已有通道；可以扩展新的协作房间/事件。
- FeatureOp/OpLog/FeatureService 是操作语义的单一入口；协同层可以以 FeatureOp 为操作单位。
- iTwin/iModel 权限/分享可作为协作权限基础。

### 2.3 选项

| 选项 | 含义 | 代价 | 建议 |
|---|---|---|---|
| A. 单写者 + 多只读（现状意图） | 一个编辑者，其他只读；保存后重开/刷新看结果 | **中**（当前共享 briefcase/IPC 广播下不可用，需先做会话隔离） | 若近期不做多人同时编辑，明确对外口径，不要宣称 Onshape 级实时协同；会话隔离前不要对第二个用户开放 |
| B1. 异步多 briefcase | 每用户 briefcase + 锁 + 周期 pull + 锁冲突 UI；不共享 undo | 中（底座已有） | **当前架构的自然延伸**；先修会话隔离/undo 所有权/权限/归因/账本+checkpoint，再接线 |
| B2. 渐进感知 | presence/评论/Follow/通知，保留单写者写门禁 | 中 | 先做非破坏性协作，作为过渡 |
| C. 真同时编辑 | 服务端权威操作流/冲突处理/逐用户 undo/presence | 高 | 需独立 ADR/团队；P1 操作流相对可控，P2 OT/P3 CRDT 不建议（特征图不是文本/集合） |

**建议**：短期 A + B1/B2；是否进入 C，应由产品目标决定，不能默认。若只做 C 的 UI（presence/光标）而没有操作流与 per-user undo，就是假实时协同。

---

## 3. 版本/分支/合并

### 3.1 当前

- Changeset 单父线性链；服务端强制 parent=链头；append-only，但 PATCH/DELETE 管理端点存在，不是严格不可变账本。
- Named Version 只有名称/描述/状态元数据；创建不生成 checkpoint/缩略图/事件，`namedVersionCount` 不递增；PUT checkpoint 只建 `Scheduled` 行，没有真实文件。
- 没有 branch/merge/restore/compare UI；应用顶栏 `main` 是静态 pill；Move/Copy/Restore workspace 为 gated。
- `fork` 只是新建 iModel + 复制最新 checkpoint 容器，不复制 changesets/Named Versions；`preserveHistory` 只进 operation metadata。
- Hub 没有 branch/merge API；后端 compareChangesets 返回 `featureAvailable:false`；core 有 `ChangeSummary/ChangesetReader` 但无产品 API/UI。
- **恢复/比较**：内核具备（reverse/apply、ChangeSummary），缺产品层，判 **B**。
- **前提**：先冻结账本（不可变/悬挂恢复/fork 语义），再做 checkpoint 生成器 + read-only 版本打开路径（`openCheckpoint`/`downloadBriefcase` 版本参数），否则“版本快照/恢复”只是给 changeset 改名字，Assembly/Derived 也无法钉住版本。

### 3.2 Onshape 模型

- Version 不可变；Branch 从 Version 分出，末端最多一个 Workspace；Merge/Restore 按 Tab Keep/Merge/Replace；Merge 不能 Undo，只能 revert；Workspace protections；版本图。
- 这些需要：
  - 分支指针/版本图数据模型；
  - 按 Tab/元素/特征的差异与合并算法；
  - 冲突检测/用户选择/回滚；
  - 与 changeset/checkpoint 的映射（不是简单再建一条 changeset）。

### 3.3 判定与建议

- **分支/合并 D**：changeset 单父链 + fork 新 iModel，不是“加一列/加个 UI”能解决；需要版本图服务/跨 iModel merge/冲突策略，属方向性改造。
- **恢复/比较 B**：可用“读取历史点 → 生成反向 changeset → 推为 head”实现，不必支持任意 DAG；比较用 ChangeSummary/ChangesetReader，补 RPC/UI。
- 先 **冻结账本**（changeset 不可变 + 悬挂恢复 + fork 语义），再做 **checkpoint + Named Version 真实快照 + Restore/Compare**（B），再评估 Branch/Merge（D）。
- 若未来要做装配/工程图/发布，版本/快照/修订必须先稳定；否则 BOM/图纸/发布都会建立在流沙上。

---

## 4. 评论/任务/Follow/通知

- 当前无评论/任务/Follow 后端；前端只有图标/占位。
- Onshape 这些是协作状态，不进入模型 changeset（文档明确“评论不进入历史”）。
- **建议**：独立协作服务/表（评论/线程/@/任务/Follow/通知），以文档/版本/tab/实体为锚点；不要写入 BIS 几何事务；权限服务端强制。
- 判定：**C（新服务）**；与实时协同可分开做，先做评论/通知不需要改建模底座。

---

## 5. 发布/修订/PLM

- 当前 hub 只有 changeset/Named Version/权限；没有 Release candidate/审批/修订/作废/水印/BOM/Arena。
- Onshape 的发布是绑定不可变版本的独立记录，工作区不写 State/Revision；包含审批人/观察者/团队/项目角色/委派/通知/审计；修订号单调、零件号唯一、配置独立。
- **审计原料可用但归因缺位**：changeset 有 creatorId/pushDate/description、OpLog 有 opType/payload/before-after、webhook delivery 有状态/重试；但 MS 用服务账号推 changeset/briefcase，OpLog.user 是 session UUID，不是真实用户。按用户审计/配额/合规当前不成立。
- **事件缺口**：hub 只 emit iModel/iTwin/member 类事件；changeset pushed、Named Version created 没有发射点，WA 对应 handler 是死代码。
- **建议**：
  - 先做 `ReleaseCandidate/Release/ReleaseItem/Approval` 数据模型 + 状态机 + 审计；不要塞入 BIS。
  - 先修用户归因（briefcase/changeset/OpLog 带真实 userId）与 changeset/NV 事件发射。
  - 零件号/修订/水印/配置作为独立服务；BOM 从装配/Part Studio 投影。
  - PLM/Arena 是外部连接器，单向上传 + 审批回传；幂等键与预检。
- 判定：发布/PLM **C**；操作级审计 **B**（需先修归因）；依赖装配 BOM 与版本/权限。

---

## 6. 规模/安全/多租户

### 6.1 规模

- 单 `modeling-server` 进程；FeatureService/FeatureOutputCache/WriteLease/求值队列都是进程内存态；没有跨进程租约/缓存协调。
- Hub 是 NestJS 单服务 + Postgres/Azurite/Redis；当前部署是本地单栈（无 HA/跨区/备份策略）；没有 Onshape 多租户/大规模团队吞吐证据。
- **历史/冷开**：无 changeset checkpoint 生成器；4 小时活跃编辑 × 20s ≈ 720 changeset/日/文档，一周约 5,000、一月约 2 万；冷开按序 apply 全部 changeset，线性劣化。checkpoint 是当前最高杠杆工程项。
- **存储**：每 changeset 一个 blob + 每 iModel 一个 CloudSqlite 容器；无 changeset GC/压缩/配额；软删 30 天后才清。
- **Lock/briefcase**：active 锁无 TTL（只清 released 30 天）；briefcase 无 stale 清理；briefcaseId 池 1–65535，无耗尽保护；多 briefcase 一开就会暴露陈旧锁永久阻塞。
- **Baseline 队列**：webhook 路径事件到达即生成，无集中队列/并发上限；recovery 路径 5 分钟最多 10 个（约 120/小时）；突发创建会打满 WA，前端只等 60s。
- 限流：HTTP RPC 100 req/15min/IP；`/ipc` WebSocket 是否受限流未确认；大团队需要更细粒度限流/配额/队列。
- **判定**：本地/单团队 B；生产规模/恢复 SLA C（工程可解，但需要 checkpoint/GC/HA/队列设计与压测）。

### 6.2 安全/权限

- 前端有 Readonly/Editable 判定；服务端 hub 有 iTwin 角色 + iModel `isSecured` 四维 ACL，契约/e2e 真实可用；WS Upgrade 验签。
- **但前端权限门不是安全边界**：
  - 后端到 hub 使用单一 admin 服务账号 + X-API-Key 直通（`SystemAgentOrResourceGuard`）；
  - RPC/IPC 只把 JWT 拿到 `/auth/me` 验“是不是有效用户”，**不查 iModel ACL**；任何已认证用户知道 iModelId 就能 `downloadBriefcase`/写 FeatureOp（若开放自助注册更甚）；
  - WS 握手后 token 缓存/过期不再校验；
  - 合法 token 可尝试任意 iModelId/文件路径（IDOR/任意文件打开风险，代码推断，未做渗透验证）。
- **共享执行缺口**：groups 只存不判；`AccessControlShare` 的 email/domain/allow/deny 只做 CRUD，授权链路完全不读；无链接分享/公开文档/所有权转移/folder 继承/Team/Company；mutation 实际要求 Manage，与官方 Write 语义不一致。
- **网络/凭证卫生缺口**：WS token 放在 URL 查询串并可能进入 console/nginx 日志；连接后不再复验，登出/撤权不生效；WA 管理/调试端点无认证且默认发布到 0.0.0.0；Azurite 使用公开 well-known 开发密钥并暴露端口/`/azurite` 前缀；入口无 TLS/HSTS。这些都阻断对外 SaaS。
- 这意味着“分享/权限”只在 hub 前端/hub API 层部分生效，后端通道可绕过文档级 ACL；在扩大协作/多租户前必须做 per-iModel 授权、连接后 token 生命周期校验、下载/打开/FeatureOp 统一 ACL，并补**负例安全测试**（非成员经 MS 打开/写入必须 403）。
- Onshape 级企业权限（Full/Light/Guest/项目角色/发布权限/匿名链接/审计）当前没有。
- **建议**：权限单点服务端裁决；前端只呈现；写租约与权限解耦；不要让“页签隐藏”代替鉴权。MS 应以用户身份访问 hub 或经受信代理校验，而不是服务账号直通。**会话隔离（IPC/briefcase/Editor）与 ACL 是同一前置**：共享 briefcase + 全局 IPC 广播下，连只读用户也会互踢/串响应。

### 6.3 多租户

- 当前更像“私有部署单栈”；iTwin/iModel 可以有多个 iTwin/项目，但没有企业/租户/席位/账单模型。
- 若做 SaaS，需要租户隔离、存储命名空间、配额、审计、计费；属于 C 级平台工程。
- **MS 是有状态会话服务**：native + 本地 briefcase 不能网络共享；多实例需要按文档粘性路由 + 外部 lease/fencing + 故障从 checkpoint 重新水化。鉴于 `EditCommandAdmin`/IpcHost 全局单例，进程级会话 actor 可能比单进程多会话更安全。
- 在 R13 授权缺口关闭前，不建议把当前栈直接暴露为多租户服务。

### 6.4 发布/契约一致性

- 源码 shared 1.85，最新发布产物 shared 1.64；外部引用/PIERCE/表达式/槽宽/多截面 loft/draft 等 20+ 契约版本只在源码模式可用。
- `interface-freeze.json`/`opDsl`/`docs/Architecture.md` 存在漂移。
- **含义**：协同/数据功能的状态必须以“源码/产物”分层记录；对外发布前做契约对账，否则用户看到的不是源码能力。

---

## 7. 建议的协同/数据路线

1. **先明确产品口径**：单写者/异步多 briefcase/真同时编辑三选一。若是前两者，更新对外文案与能力账本；若选实时，启动协同 ADR/spike。
2. **安全先于分享**：per-iModel 授权、连接后 token 校验、下载/打开/FeatureOp 统一 ACL；负例安全测试；shares/groups 真正参与授权。
3. **账本先冻结，再 checkpoint**：changeset 不可变/悬挂恢复/fork 语义 → 每 N changeset / 每 Named Version 生成真实 checkpoint；200+ changeset 冷开基线；否则版本/恢复/多用户 pull 都会放大延迟，fork 还会先坏。
4. **修单用户体验**：autosave 不破坏 undo；版本/恢复/比较可见；用户归因（briefcase/changeset/OpLog 真实 userId）；预览/失败提示。
5. **补基础 PDM**：Named Version 真实快照、Restore/Compare、评论/通知、分享/权限矩阵；不先做 branch/merge。
6. **异步多用户**：per-user briefcase、锁冲突 UI、周期 pull、active lock/briefcase 过期、per-user undo；依赖 2/3。
7. **补发布/修订**：Release candidate/审批/修订/零件号/水印；changeset/NV 事件发射；与版本/工程图/装配 BOM 联动。
8. **再做分支/合并**：需要版本图/差异/冲突/回滚；fork 是副本不是分支；不要用“另存 changeset”冒充。
9. **最后谈 PLM/多租户/规模**：外部连接器 + 平台服务 + checkpoint/GC/HA/队列；不写入模型 schema。

---

## 8. 结论

- 数据底座（iModel/BIS + changeset + briefcase + 锁/rebase + 权限）是可靠资产；Hub 的锁矩阵、服务端取号、advisory lock、SDK 兼容、baseline 补偿都有真实测试。
- 但当前应用的协同语义是“**单写者 + 单 briefcase + 变更集**”，不是 Onshape “**多用户同时编辑 + 版本图 + PDM**”；而且共享 briefcase + IPC 广播 + 单 Editor 命令使“单写者 + 多只读”也不可用，直改还绕过写门。
- 版本/共享可做到 B，但 Named Version 目前只是元数据；分支/合并是 D；评论/任务/发布/PLM 是 C；真正多用户同时编辑是 D；异步多 briefcase 是 B（底座已有，应用未接）。
- **最高杠杆的三件事**：会话隔离（任何第二用户/分享的前置）、账本冻结 + checkpoint（版本/恢复/协作的前置）、per-iModel 授权 + 真实 userId（分享/审计的前置）。这三件不做，扩协作只会放大问题。
- 这不是“再做一点 UI”能解决的，必须作为产品/架构裁决先定，再决定是否投入。
