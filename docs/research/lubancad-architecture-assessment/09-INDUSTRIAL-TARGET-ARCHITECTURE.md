# 工业级专业云 CAD 目标架构

> 状态：**Proposed（2026-11-22）**，待架构/安全/SRE/产品评审与 ADR 批准；不是已实施现状。
>
> 目标：定义“专业级云 CAD / 工业级生产标准”下的目标架构，而不是继续按当前 Part Studio 子集增量补功能。
>
> 结论先行：
> - **当前底座可复用，但不能直接以现状进入工业生产。**
> - 工业级不是“功能更多”，而是身份/会话、数据账本、灾备、规模、发布、合规、产品面同时成立。
> - 目标架构采用“控制面 + 文档会话面 + 作业面 + 数据面 + PDM 面”的分层；iModel/BIS 仍是模型事实源，但不再是平台唯一状态容器。
> - 先冻结 12 组架构契约（身份/ACL/会话/账本/版本/输出/拓扑/工作区/选择/作业/发布/合规），再进入全功能开发。

---

## 0. 范围与假设

**目标产品**：专业级云 CAD，至少覆盖 Onshape 的主要产品面：Part Studio、装配、工程图、文档/版本/共享、导入导出、基础 PDM/发布；长期可选 Render Studio、企业/多租户。

**部署形态**：
- 近期：单租户/私有部署也可，但架构必须能演进到多租户 SaaS。
- 中期：多租户云服务，具备租户隔离、配额、审计、HA/DR。

**不在本文件内**：
- 具体 UI 像素/交互细节；
- 具体功能排期日历；
- 未经许可的 ACIS/STEP/native 细节。

**“工业级”的判定**：
- 不是“能演示”，而是“在真实客户模型、真实多人、真实故障、真实攻击、真实升级下仍然可预测、可恢复、可审计、可支持”。
- “绝对正确”在软件工程中不可证明；本文件把它操作化为：**所有已识别单行道都有 ADR、原型、失败判据和回滚；所有 P0 门禁有可重复测试；没有已知结构性返工。**

---

## 1. 工业级门槛（I0–I9）

| 门 | 维度 | 必须成立 | 证据 |
|---|---|---|---|
| I0 | 架构治理 | 每个单行道有 ADR、备选、回滚；契约有版本/冻结/兼容矩阵 | ADR 索引、interface-freeze、manifest |
| I1 | 功能正确性 | 目标产品面的主要功能有真实行为、失败语义、旧数据兼容 | 单测/StandaloneDb/真栈/体积金标 |
| I2 | 几何稳健性 | 退化/病态/大模型/复杂拓扑不崩溃、不静默错误；体积/质量属性可信 | 语料回归、fuzz/property、精确质量属性 |
| I3 | 数据完整性 | 历史不可变、版本可打开、引用可解析、备份/PITR/恢复演练 | ledger fixture、DR drill、恢复报告 |
| I4 | 安全/租户 | 强身份、per-doc ACL、会话隔离、租户隔离、审计、渗透测试 | 负例 e2e、审计日志、pentest |
| I5 | 规模/SLA | 多实例、HA、队列、配额、压测、SLO、故障切换 | 负载/soak/chaos、SLO 报告 |
| I6 | 协作 | 多用户（至少异步）安全协作、冲突处理、逐用户 undo | 双用户/双 briefcase/undo 隔离 |
| I7 | 发布/运维 | CI/ctest、provenance/SBOM、灰度/回滚、监控/告警/on-call | 发布门、runbook、事故演练 |
| I8 | 合规/许可 | ACIS/libslvs/STEP/TrueForm 边界、SBOM、数据驻留、审计留存 | 许可矩阵、SBOM、合规证据 |
| I9 | 产品面 | Part Studio + 装配 + 工程图 + 文档/版本/PDM + 导入导出 | 能力账本 + 真栈证据 |

**当前**：I1/I2 的 Part Studio 子集达到工程可用；I0 部分有；I3–I9 未达到工业生产标准。当前形态适合**本地单团队演示、受控内网、单用户编辑**；不适合对外多用户 SaaS、受监管行业生产，也不适合作为“专业级云 CAD”对外承诺。目标架构必须按 I0→I9 建，而不是“先做功能，后补平台”。

### 1.1 当前生产成熟度（L0–L4）

| 维度 | 当前 | 目标 | 主要缺口 |
|---|---|---|---|
| CI/质量门 | L1 | L3+ | 托管 CI 只覆盖类型/少量单测/lint；backend 123 测试仅 6 个进 CI；native ctest、web 生产 build、BFF、镜像、安全/SBOM 未进 CI；真栈 e2e 人工；最近发布跳过全量 e2e；interface-freeze 当前红 |
| 发布/可追溯 | L1− | L3+ | MS 构建依赖宿主路径/无 lockfile/`tsc --noCheck`；native fallback + provenance 含本地路径；`latest` 可变；无 manifest/签名/SBOM；至少五套版本标识；源码 1.85 vs 产物 1.64；升级先删旧树、无原子回滚 |
| 环境一致 | L1 | L3 | 无 staging/IaC；dev(vite) 与部署镜像不同、主 e2e 不打部署产物；“生产”仍 maildev/Azurite 默认 key/HTTP nginx/端口暴露；Node/基础镜像未钉；MS 未设 `trust proxy` |
| 可观测 | L0–L1 | L3 | MS/WA/BFF 无 metrics/trace/统一 requestId；健康检查静态、不查依赖；无告警/on-call/SLO；日志无轮转 |
| 数据完整性 | L0–L1 | L3 | changeset 可 PATCH parentId/可无父根/软删挖洞；complete 不校验 blob/checksum；等待行阻塞链头；无 scrubber/对账/修复 job |
| 迁移/兼容 | L1 | L3 | params 无版本（仅变量表 version:1）；无旧 `.bim` fixture；PartStudioMigration 非生产；native BRep 兼容矩阵/X-12 未关闭 |
| 灾备 | L0 | L3 | 单卷、无自动备份/PITR/对象版本化/恢复演练/RPO-RTO；备份文档与现行 compose 不一致；DB/对象存储无成套恢复 |
| 规模/HA | L0–L1 | L3 | 单 Windows 宿主 MS、单 hub/DB/Redis/Azurite；内存租约/限流/进度；无队列/配额/容量模型；Redis 256MB noeviction、WA 队列无卷、cron 非分布式 |

---

## 2. 目标架构原则

1. **模型事实源唯一**：iModel/BIS 存模型；Postgres 存平台元数据；对象存储存不可变 blob；禁止双写事实。
2. **账本不可变**：changeset/version/checkpoint 只追加；引用键用 changesetId/versionId，不用可变名称。
3. **会话隔离**：每个用户/文档会话有独立 IPC、briefcase、Editor 命令、undo 所有权；不共享 briefcase 文件。
4. **控制面/数据面/会话面/作业面分离**：编辑进程不承担 checkpoint/导入/导出/渲染等长任务。
5. **身份与授权单点**：IdP 统一身份；hub 是 PDP；MS/worker/hub 数据面是 PEP；所有入口按“真实用户 + 资源 + action”判定。
6. **契约先行**：FeatureOp/Feature Manifest/域 RPC/Schema 由单一清单生成；运行时握手；版本兼容矩阵。
7. **端口化特征图**：特征声明输入/输出端口；一个 body 一个生产者输出，一个特征可多输出；执行器按 DAG 调度。
8. **工作区模块化**：Tab/Workspace 是一等类型；Part Studio/Assembly/Drawing 各自模块，不互相 import 内部。
9. **几何内核只提供几何**：实例、Mate、BOM、图纸投影、文件转换在服务层；`SolidKernel` 不含产品子系统。
10. **渲染唯一底座**：iTwin 交互渲染；PBR/离线作为 ADR 的可选路径；不引入第二交互渲染平台。
11. **可恢复优先**：任何长任务可取消/重试/幂等；任何状态可从事务日志/checkpoint 恢复。
12. **可观测默认开启**：requestId/sessionId/userId/tenantId 贯穿日志/指标/审计。
13. **失败诚实**：不支持/未实现/降级/近似必须显式；禁止假成功、假 full、假分享。
14. **默认安全**：最小权限、密钥管理、传输/静态加密、输入校验、限流、供应链审计。
15. **默认可回滚**：每次发布/迁移/契约变更都有回滚或前滚方案；数据迁移有旧 fixture。
16. **优先成熟基础设施**：IdP、对象存储、KMS、队列、Postgres HA/PITR、可观测性优先使用成熟托管/开源组件；不要自研这些平台能力，把工程投入放在 CAD 差异面。

---

## 3. 目标逻辑架构

```
┌──────────────────────────────────────────────────────────────────────┐
│ Edge / Web                                                           │
│  CDN · WAF · TLS · SPA · WebSocket gateway · rate limit · session    │
└───────────────┬──────────────────────────────────────────────────────┘
                │ OIDC / JWT / delegation
┌───────────────▼──────────────────────────────────────────────────────┐
│ Control Plane（hub）                                                 │
│  Identity/Tenant · Project/Document · Workspace/Tab · ACL/PDP        │
│  Changeset/Checkpoint/Version/Refs · Webhook/Outbox · Release/PDM    │
└───────┬───────────────────────────────┬──────────────────────────────┘
        │ metadata                      │ events
┌───────▼───────────────┐      ┌────────▼─────────────────────────────┐
│ Metadata DB (HA/PITR) │      │ Event Bus / Queue (BullMQ/outbox)    │
│ Postgres + RLS        │      │ checkpoint/import/export/render/PLM  │
└───────┬───────────────┘      └────────┬─────────────────────────────┘
        │                              │
┌───────▼──────────────────────────────▼───────────────────────────────┐
│ Document Session Plane（per-document actor）                         │
│  Briefcase file/key per session · FeatureService · Editor · IPC      │
│  external lease + fencing · per-session permission · undo ownership  │
└───────┬──────────────────────────────────────────────────────────────┘
        │
┌───────▼──────────────────────────────────────────────────────────────┐
│ Geometry / Native Workers                                            │
│  SolidKernel/PSBRep (ACIS now) · facet/tile · topology snapshot      │
│  TrueForm optional (format tag/SAB decision) · ctest in CI           │
└───────┬──────────────────────────────────────────────────────────────┘
        │
┌───────▼──────────────────────────────────────────────────────────────┐
│ Data Plane                                                           │
│  Object storage（immutable blobs, tenant/iModel prefixes, KMS）      │
│  Briefcase cache（local, not network FS） · backups/PITR · lifecycle │
└──────────────────────────────────────────────────────────────────────┘
```

**关键边界**：
- Control plane 不跑 native 几何；只做元数据/策略/编排。
- Session plane 不生成 checkpoint/导入导出；只做交互编辑。
- Worker 不做用户会话；只做可重试作业。
- PDM 服务不把发布状态写进 changeset 的 ExtendedData；独立事务模型。

---

## 4. 目标数据与版本模型

### 4.1 领域对象

```
Tenant
└─ Project（iTwin）
   └─ Document（iModel，一条 changeset 时间线）
      ├─ TabDirectory
      │  ├─ LubanTab（type=partStudio|assembly|drawing|variableStudio|imported|derived）
      │  │   ├─ modelSet {def, phys, drawing, sheet}
      │  │   └─ sourceRef?（Derived/Imported/In-Context）
      │  ├─ LubanTab ...
      │  └─ Workspace/Tab registry
      ├─ Version（不可变，绑定 changesetId + checkpointId）
      ├─ NamedVersion（展示名，指向 Version）
      ├─ Reference（source/target/version/state）
      └─ Audit/Access metadata
```

- **Document = iModel**，不拆成多个 iModel。
- **Tab = typed LubanTab**，不是 UserLabel 前缀。
- **Part Studio = tab 的一种**，仍用 def/phys model set。
- **Version = 不可变 changeset + 真实 checkpoint**；Named Version 只是展示名。
- **Reference** 从第一天记录 source/target/version/state，支撑 BOM/Where Used/Derived。

### 4.2 不可变账本

- changeset：append-only；**禁止改 parentId/index/id**；除 genesis 外必须有 parent 且同 iModel；DELETE 需检查子节点/NV/checkpoint 引用，不能软删挖洞。只在应用层做白名单不够，DB 侧用只读角色/触发器/权限兜底；历史更正一律以新 changeset 表达。
- 链完整性：`parentId + prevHash + SHA-256 + size` 组成可验证链；按 N 条构建 Merkle root，作为 checkpoint/Version 的 manifest 根；读取/恢复/复制时校验。
- `waitingForFile`：有超时/恢复/重用；列表默认不暴露未完成行；崩溃后重试 push 必须成功。
- complete：服务端计算并校验 blob 存在、大小、SHA-256；下载/读取校验；失败不得标记 fileUploaded；不匹配对象隔离并告警。
- checkpoint：每个 Version/每 N changeset（建议 100–500）异步生成；带 `manifestHash/createdFromIndex`；per-iModel 串行；回读打开 + `verifyCheckpoint`；失败有上限、告警、可重试；Named Version checkpoint 不得是 `Scheduled` 幽灵行，GET 未 ready 应返回 409/等待而不是假快照。
- version open：支持按 changesetId/versionId read-only 打开；引用键统一 changesetId/versionId；恢复=以当前 head 为父生成新 changeset，不改历史。
- fork：明确 Duplicate（只复制当前 checkpoint，即“内容副本”）与 Fork with history（复制 changeset/blob/NV/checkpoint 并保持父链）两个 API；当前“只复制 baseline 会导致新文档为空”必须修复或改名；checkpoint 外键必须先重设计，否则第一个 mid-history checkpoint 就会让 clone/fork FK 失败；跨 iTwin 要么重写 checkpoint 内 GUID，要么明确拒绝，不伪造 `preserveHistory`。
- compare：ChangeSummary/ChangesetReader 服务化，提供元素/特征级 diff。
- 完整性：定期 scrubber/DB↔storage reconciler/链校验；主动巡检、损坏隔离、告警、修复、对账报告；不能只靠打开时被动失败。
- 事务/持久性边界：明确“RPC ok = 本地 briefcase 已保存，不等于 hub 已持久化”；定义 autosave/push 窗口（当前 20s 防抖，约 720 changeset/日/文档）、崩溃恢复、推送失败重试与 UI 未保存提示；读 API 不得隐式触发 rebuild/写事务（预热必须是显式 job/操作）。
- 缓存/undo 一致性：pull 后使 FeatureOutputCache/服务态失效（订阅 `onChangesetApplied`，不只看 featureId 是否存在）；undo 必须按 user/briefcase 过滤，A 的 undo 不得回退 B 的编辑；直改必须留下可审计的操作语义（至少 op 类型/操作数/actor），不能只留 `overridden` 时间戳。

### 4.3 迁移与兼容

- EC schema 按域拆分（`LubanCAD`/`LubanAssembly`/`LubanDrawing`/`LubanTab`）；additive 优先，DB 迁移遵循“先 expansion 后 contraction”。
- 每个 schema/params 变更带 `schemaVersion/paramsVersion`、迁移函数、旧库 fixture、回滚。当前只有变量表有 `version:1`，feature/sketch 的 `params` 没有版本锚点，必须先补。
- 旧 `.bim`/params 二进制 fixture 入回归库（不是内存合成）；迁移 CLI 支持 dry-run/verify/rollback；迁移在后台 job 执行，幂等、可重试、可暂停；不阻塞编辑。
- `PartStudioMigration` 生产化前提：源快照一致性 + 源写租约、目标空断言、两阶段幂等、回滚、校验报告入库；当前只是测试级探针，未接生产 RPC，且明确不保证源快照。
- native/ACIS 几何流要有“写入版本/可读矩阵”：旧 BRep/checkpoint 在新 native 下可打开、可重建；单一 canonical checkout（X-12）与 CI 回归（X-09）是前提。
- 迁移前备份 + 迁移中锁 + 大表在线索引；旧 iModel 可读、可写、可重建；不能“新版本打开旧库就坏”。

### 4.4 备份/DR

- 目标拓扑：控制面（hub 无状态多副本）、数据面（Postgres HA + 对象存储 + Redis HA）、会话面（MS worker 可替换）、作业面（队列 worker）；不再有单卷单副本的“生产”。
- Postgres：HA + WAL 归档 + PITR + 自动备份；恢复演练有记录。对象存储：生产使用 S3/Azure Blob 等持久服务（Azurite 仅开发）；版本化/对象锁/生命周期/跨区复制；checkpoint/changeset 校验和。
- 跨存储一致性：备份必须同时记录“DB 快照 + 对象存储 manifest”；恢复按 runbook 先 DB 后对象或按 manifest 对齐；单独恢复任一侧都会得到悬挂引用。
- Redis/队列：HA（Sentinel/Cluster）或托管；队列与缓存分离；`noeviction` 必须配合容量/告警，不能静默丢事件；WA 的 forward queue 必须落持久卷或外置队列；Hub cron 改为分布式幂等 job。
- Briefcase/锁：本地缓存可丢弃；从 checkpoint/账本重建；缓存必须有容量上限/淘汰/关闭清理；active 锁/租约必须有 TTL/fencing/自动回收，briefcase 必须有 stale 清理与 id 池耗尽保护。
- 删除：软删/保留期/租户删除/合规删除；引用完整性检查；软删 iModel 的 DB 行/blob/tile 一起走生命周期，不能只删存储留永久行。
- 历史：changeset/checkpoint 归档/GC/压缩/legal hold；版本引用保护；tile 孤儿清理；不可无审计删除。
- 目标 RPO/RTO（Gate 0 批准）：Postgres 元数据与对象存储 RPO ≤ 5 min（PITR/版本化/跨区），RTO ≤ 1 h；已 push 的编辑 ack 后 RPO=0；未 push 本地编辑不承诺云端持久化，必须 UI 明示。当前单卷且无备份，实际为“不可恢复”。
- 每季度至少一次完整 DR 演练；每次 schema 迁移有回滚演练。

---

## 5. 身份、授权与租户

### 5.1 身份

- IdP：OIDC/SSO（企业）+ 本地账号（可选）+ MFA/WebAuthn；账号状态（inactive/locked/deleted）在登录与每次鉴权都生效。当前登录路径不检查 status、软删用户 token 仍被 MS 视为有效，必须先修；密码策略不能只有 `MinLength(6)`，需复杂度/泄露库/历史/限速。
- Token：短时 access + refresh 轮换；`jti`/session denylist；WS 连接绑定 session/jti；过期/撤权/登出/改密关闭或降级连接。登出必须同时失效 access（或把 access 缩短到可接受窗口并明示）与已建 WS；不能只删 refresh。
- Token 存储/传输：不得出现在 URL 查询串、浏览器 console、nginx/APM/支持包；优先 HttpOnly Secure SameSite cookie + CSRF，或内存 access + HttpOnly refresh。当前 sessionStorage 单键保存 access+refresh，XSS 可同时取走。
- CSRF/Origin：写路径必须有真实 CSRF 或显式 Bearer-only 设计；WS upgrade 必须校验 Origin；当前 CSRF 中间件存在但前端未发送 token，等于未接线。
- 服务身份：后台任务用独立 service identity（SPIFFE/mTLS 或短时 client credentials），标注 serviceName；用户触发路径必须 on-behalf-of，禁止共享 API key 代表任意用户。
- 企业生命周期：SCIM/离职禁用、会话列表/撤销、MFA 强制策略；inactive/locked/deleted 在登录、RPC、WS、对象存储直链每个入口都生效。

### 5.2 授权

- 模型：`effective = union(project role, document ACL, group grants, link share)`；deny 优先。当前 groups/shares 只存不判、Share 对话框只复制 URL，必须在产品上隐藏/删除“假分享”直到真正执行。
- PDP：hub 负责策略决策；PEP：MS/worker/storage 的每个入口执行；服务账号不得作为用户路径的替代身份（MS 混淆代理是当前最高危授权缺口）。
- 入口清单：下载、打开、读树、写 FeatureOp、直改、pull/push、checkpoint、导出、分享、发布、审计查询、tile/对象存储直链、WA baseline/tile、progress/retry、`openBriefcase(fileName)`。
- 负例：非成员、跨租户、撤权后连接、链接分享撤销、组权限、只读写入、任意路径/任意 key/任意 iModelId。
- 自助注册/邀请：默认关闭公开注册；企业邀请/域名/审批；配额/试用限制；当前“任意邮箱可注册”不能进入生产。
- 对象/文档/工作区级 ACL：至少 document 与 tab 级；Part Studio/装配/图纸/导出物不再共享一个 iModel 权限位。

### 5.3 会话隔离

- 每 session 独立 IPC 路由/requestId 域；禁止全局广播；RPC token 显式绑定连接，不依赖全局 fallback。当前 `LocalTransport.send` 广播且两端 requestId 都从 1 开始，会把 A 的响应 resolve 给 B。
- 每 session 独立 briefcase 文件/key（文件名含 session/user 标识）；禁止共享/close 误伤；openBriefcase 路径白名单 + 规范化解引用；close/save/pull/push/undo 校验 owner。
- Editor 命令按 session 绑定；或 process-per-session；禁止复用全局 `EditCommandAdmin` 单槽。
- 写租约/锁必须带 user/session/briefcase；外部 lease + fencing token；过期/回收。
- direct edit 与 FeatureOp 共享同一权限/租约/审计边界；直改入口必须经过会话门。
- WS：upgrade 校验 Origin/CSRF/租户策略；连接建立后定期复验或订阅撤权；IPC 消息也受 per-user 限流（不能只依赖 Express 中间件）。
- 会话失败/重连从 checkpoint 水化；不共享内存状态。
- 限流：按 user/tenant/jti，而非仅 IP；代理后设置可信 `trust proxy`（当前 MS 未设置，所有用户共享一个 100 req/15min 桶），同时禁止直连绕过。

### 5.4 审计

- 独立 append-only audit（WORM/hash chain 或对象锁）：actor、onBehalfOf、tenant、resource、action、requestId、sessionId、before/after hash、decision。
- 覆盖登录/失败、权限变更、下载/导出、打开、写、直改、发布、管理员/API key 操作；可按用户/文档/时间查询；可导出 SIEM；保留期/法律保留可配置。
- 高风险操作审计写失败必须阻断；审计不能只是 webhook delivery 状态或 iModel 内可改 OpLog。
- 真实归因：changeset/briefcase/OpLog 的 actor 必须是真实用户（当前 MS 服务账号 + 客户端 sessionId 代替），否则审计/撤销/计费都不可信。

### 5.5 数据分类与保护

| 数据 | 分类 | 保护 | 保留/删除 |
|---|---|---|---|
| 模型/几何/参数 | 客户机密/IP | 传输 TLS；静态加密；租户前缀；对象不可变 | 客户删除/保留期；审计删除 |
| 身份/邮箱/成员 | PII | 加密/最小化；访问审计 | 按隐私政策；账号删除 |
| Changeset/checkpoint | 客户 IP + 审计 | 校验和；版本化；备份 | 保留期/合规 |
| 权限/审计 | 安全敏感 | append-only；只读/导出审计 | 合规留存 |
| Secrets/keys | Secret | KMS/Vault；不落日志；轮换 | 不导出/不进备份明文 |
| 日志/指标 | 运营数据 | PII 脱敏；访问控制 | 短期保留 + 聚合 |

- 传输：入口/MS/hub/DB/Redis/对象存储全 TLS；当前 nginx 仍只有 HTTP、DB/Redis 无 TLS、Azurite 用公开默认密钥。
- 静态：卷/对象/KMS 信封加密；密钥不落镜像/日志/CI；当前无 KMS/Vault、无卷加密证据。
- 日志：MS/WA/BFF 无统一 requestId、无 redact；URL 查询串/邮箱/模型名可能落日志；必须有 PII 策略与保留期。
- 密钥最小权限：按服务拆分 DB/对象存储/队列/签名密钥；WA/MS 不得通过 `env_file` 持有全局 `AUTH_JWT_SECRET`/DB 管理员口令；共享 API key 不能同时是数据面 RBAC 旁路、baseline 管理面和 admin 面的唯一凭据。
- SSRF/回调：webhook callback/URL 校验、预签名上传的来源/大小/类型限制；对象存储 CORS 不得为 `*`。

### 5.6 供应链与租户

- 依赖 SBOM、镜像签名、漏洞扫描、许可证审查。
- 租户：元数据 RLS/tenantId、对象前缀、KMS key、配额、删除隔离；禁止跨租户查询。
- 出口管制/数据驻留：按目标市场配置存储区域；不把客户模型/日志传到未授权区域。

---

## 6. 文档会话与计算平面

### 6.1 会话模型

- Control plane 分配 document/session；session plane 每文档一个 actor。
- 每 actor 持有：BriefcaseDb、FeatureService、Editor、IPC、lease/fencing、缓存。
- 单写者/异步多 briefcase/实时三种路线由产品裁决；架构支持：
  - 单写者：每 session 独立文件/key，只读者也独立。
  - 异步多 briefcase：per-user briefcase + undo 所有权 + pull 缓存失效 + 冲突 UI。
  - 实时：独立 op 流服务；不复用共享 BriefcaseDb 的原生 undo。

### 6.2 进程模型

- 推荐 **process-per-session** 或 **process-per-document actor**；避免在单进程复用 `EditCommandAdmin`/IpcHost 全局单例。
- 若单进程多会话，必须 fork/改 editor/IPC 单例并证明隔离；这是 P0 评估项。
- 控制面无状态多副本（hub/BFF/web），会话面按 document/session 粘性路由；外部 lease + fencing token 决定唯一写者；MS 本地 briefcase 视为可丢弃缓存，失败从 checkpoint 水化。
- 外部化进程态：写租约、限流、进度、会话注册、队列；不能继续用进程内 `Map` 作为多实例协调。
- Windows native 约束：session host 可 Windows；控制面/worker 可 Linux；调度按平台能力路由；不能把“Windows 宿主进程”当作不可替换资产。
- MS 必须作为 **Windows 服务/守护进程**运行（WinSW/NSSM/服务包装），支持开机自启、崩溃重启、日志轮转、优雅 drain 后停机；不能是手工用户进程 + `Stop-Process -Force`。升级要版本化目录 + 原子切换 + N-2 保留，不能先删旧树再解压。
- 健康：liveness/readiness 分离；readiness 检查 hub/对象存储/队列/许可证；MS `/health` 不能永远是静态 healthy。

### 6.3 作业

- checkpoint、baseline、compare、restore、import/export、render、PLM 同步全部走队列。
- per-document 串行键；幂等键；可取消；超时；重试退避；死信；作业状态可查询、可告警。
- 作业结果写对象存储 + 元数据；不占用编辑事件循环。
- 事件 outbox：changeset/version/权限/发布事件与业务事务同库落 outbox，再投递；Redis 满/重启不能静默丢事件（当前 256MB `noeviction` + emit 失败只记日志）。
- WA 的 forward queue 必须落持久卷或外置队列；容器重建不能丢待转发事件；baseline/recovery 有全局并发上限与背压。
- Hub cron 改分布式幂等 job（DB/Redis 锁 + 幂等键），不能依赖进程内 `isRunning`/`retryCounts`。

### 6.4 规模

- 控制面无状态水平扩展；session plane 按 document 粘性路由 + 外部 lease/fencing。
- 缓存/租约/队列外置；session 失败从 checkpoint 重新水化。
- 配额：租户/用户/文档/存储/日 changeset/并发会话/checkpoint 数/作业/导出；限流按 user/tenant/jti。
- 缓存/briefcase：显式容量上限/淘汰/关闭清理；本地 briefcase 不是无界缓存（开发机可积累数千 iModel、十 GB 级，且当前无清理机制）。FeatureOutputCache/FeatureService/OpLog 也要有上限/索引/分页，不能随打开文档数单调增长。
- 历史增长：20s 自动保存约 720 changeset/日/文档、1.5 万/月；必须 checkpoint（每 100–500 条）+ 归档/GC/配额，否则冷开从 baseline 线性重放、对象数单调增长，打开时间不可控。
- 内核：同步 native 求值不能长期占用单一事件循环；重活（rebuild/checkpoint/import/export）走 worker/队列，交互会话与心跳不被阻塞。
- 存储生命周期：changeset/checkpoint 归档、tile 孤儿 GC、软删 iModel 的 DB/blob/tile 一致清理；每对象有租户前缀与保留策略。
- SLO：编辑延迟、打开时间、保存/推送、作业完成、可用性；有容量模型与压测（当前只有单 Part Studio/百余 body/单写者证据，不能外推多用户/大历史/装配）。

### 6.5 SLO 基线（Gate 0 定义具体数值）

| SLO | 测量 | 目标（待 Gate 0 定） | 失败处理 |
|---|---|---|---|
| API 可用性 | 成功请求/总请求 | 生产级目标 | 告警/事故 |
| 编辑交互延迟 | p95/p99 操作往返 | 帧预算内 | 性能预算/回滚 |
| 文档打开 | p95 冷/热打开 | 产品目标 | checkpoint/缓存 |
| 保存/推送 | p95 | 产品目标 | 队列/重试/告警 |
| 长作业 | checkpoint/import/export p95 | 产品目标 | 队列/取消/重试 |
| 错误率 | 5xx/业务失败 | 产品目标 | 发布阻断 |
| 恢复 | RPO/RTO | 产品目标 | DR 演练 |
| 安全修复 | critical/high 修复时限 | 合规目标 | 发布阻断 |

### 6.6 容量模型维度

- 租户/项目/文档/Part Studio/装配/工程图数量；
- 每文档 changeset 数、checkpoint 数、历史深度；
- 每文档 body/面/边/草图实体/特征数；
- 并发编辑者/只读观察者/会话数；
- tile 请求/秒、pick/秒、facet 冷构建量；
- checkpoint/import/export/render 作业量与队列长度；
- 对象存储容量/请求/带宽、Postgres 行数/IOPS、Redis/队列吞吐；
- 每租户配额/成本；扩容/降级策略。
- G0 定目标值；G3 用负载/soak 验证。

---

## 7. Feature Platform

### 7.1 Feature Manifest（单一来源）

```
FeatureManifest {
  type, paramVersion,
  paramsSchema, formSchema,
  inputs[] {role,type,required,multiplicity},
  outputs[] {key,kind,cardinality},
  structuralKeys[],
  evaluatorKey,
  preview: none|shadow,
  risk: safe|destructive,
  hitl: none|preview+confirm,
  toolSpec, aiSpec, capability, i18nKey, tests[]
}
```

生成：TS 类型、zod、FeatureTypeRegistry、opDsl 白名单、FeatureFormModel、ribbon/capability、AI tool spec、契约测试。

### 7.2 特征图

- FeatureRow：`graphVersion/inputsJson/outputsJson/treeIndex` 加法引入。
- FeatureInput：角色（target/tool/profile/path/source/plane）。
- FeatureOutput：`outputKey`，body 唯一生产者输出；一个特征可多输出。
- 执行器：DAG 拓扑排序；`treeIndex` 只做显示/tie-break；显式 dirty closure。
- 历史：插入/删除/重排/回滚；失败节点标记 stale/failed；不静默假成功。
- 统一 undo：操作组/事务为唯一用户可见撤销单位；FeatureOp/原生/直改统一语义。
- 预览/提交：共享 `validateFeatureOp -> plan`，预览只做影子求值。
- 配置：参数上下文/覆盖层预留 configId；不把单配置写死进 params。

### 7.3 拓扑身份

- `TopologyRef { documentId, workspaceId, bodyKey, persistentId, sessionId? }`。
- 单目标 fillet/chamfer 必须校验 bodyKey；顶点补持久 own id 或明确不可持久。
- 插入/删除/多输出后引用解析有几何回退/查询命名；失败 fail-closed。

---

## 8. Workspace / UI 平台

- `LubanTab` type + `WorkspaceModule`：PartStudio/Assembly/Drawing/File 各自注册。
- `WorkspaceRef {tenantId, projectId, documentId, tabId, kind, versionRef?}`。
- 每文档 SessionHost：连接池、per-session store、lease、undo policy。
- `ViewportHost`：3D spatial / 2D drawing；不同视口独立选择域/装饰。
- `SelectionRef {documentId, workspaceId, occurrencePath[], bodyKey, topologyRef, vertexRef?}`。
- `SelectionDomain`：Part Studio/Assembly/Drawing 各适配；不复制四套全局表示。
- `CommandRegistry`：ribbon/palette/keymap/capability/AI spec 同源。
- `FormRuntime`：manifest → 字段/默认值/单位/枚举/条件/校验/表达式。
- 多 tab：每 tab 打开/关闭/脏标记/相机/撤销/布局；切 tab 关闭/重挂对话框。

---

## 9. Geometry / Kernel

- `SolidKernel.h` 保持唯一几何门面；PSBRep 协议版本化。
- `BRepData` 增加 `format/kernel` 标签（默认 ACIS）；SAB 兼容/迁移/双格式 ADR。
- 拓扑 ID：面/边 own id、顶点 own id 或诚实限制；无几何回退则明确引用失效语义。
- 精确质量属性通道统一；facet 路径只作近似并标注。
- FacetEntity 预留 face/edge ID；tile 可后续消费。
- BRep 实例/放置原型查询：应用层 occurrence/GeometryPart；内核可选 transform 参数，不塞装配树。
- 批量 `TopologySnapshot`/`PickBatch` 只读服务；geometryGuid/revision 缓存；解耦 Editor 单命令槽。
- 原生 ctest 进 CI；单一 canonical checkout；接口冻结/枚举生成；provenance。
- TrueForm：M1 前完成 SAB 兼容决策、双后端一致性、迁移工具、回滚。

---

## 10. 装配 / 工程图 / 导入导出 / PDM

### 10.1 装配

- 数据：BIS occurrence + GeometryPart + placement + sourceRef；不塞内核。
- 实例：共享原型 + occurrence transform；part 版本/失效。
- Mate/Relations：独立 3D solver；不复用 2D 草图求解器。
- BOM：occurrence 聚合 + part properties（part number/description/revision/material）+ 引用索引。
- 干涉：AABB broadphase + 候选对内核布尔/距离；不逐对深拷贝。
- 仿真：独立子系统，不在 Part Studio 特征链。

### 10.2 工程图

- 显示：`SheetViewState/DrawingViewState/ViewCreator2d`。
- 生成：独立 DrawingService/HLR/投影/剖视/尺寸/GD&T/表格；不和 3D Part Studio 共享视口状态机。
- 尺寸关联：持久拓扑 ID 或投影几何稳定 ID；模型变更更新。
- 导出：DXF/DWG/PDF/DWT 独立许可/格式裁决。

### 10.3 导入导出

- 服务层 ImportExportJob；格式探测/单位/装配层级/失败策略/配额。
- 网格：STL/OBJ/3MF/GLTF 作为 mesh body；不强行 BRep 化。
- 精确：STEP/IGES/Parasolid 需 ACIS InterOp 许可、第三方翻译器或 TrueForm IO；不能自研近似 healing。
- DXF 草图已有；工程图 DXF/DWG 归 DrawingService。

### 10.4 PDM/发布

- 独立 PDM 服务：ReleaseCandidate/Release/ReleaseItem/Approval/Revision/PartNumber/BOM/WhereUsed。
- 绑定 Version/checkpoint，不写 changeset ExtendedData 自由 JSON。
- 事件 outbox；审计；PLM 连接器幂等同步。

---

## 11. 协作与实时

- 短期：异步多 briefcase（B）；按文档/用户隔离；undo 所有权；冲突 UI；pull 后缓存失效。
- 中期：presence/评论/Follow/通知（C），独立协作服务，不写入 BIS 几何事务。
- 实时：D 级独立 ADR；服务端权威 op 流（推荐），不建议 OT/CRDT；per-user undo/会话隔离/操作排序/重放/幂等。
- 任何“多人同时编辑”承诺前，必须先完成会话隔离、账本/checkpoint、ACL/归因。

---

## 12. 发布 / 运维 / 可观测

- CI：self-hosted Windows runner（native/backend 全量）；shared/viewer/editor/web 单测/lint/tsc；backend 全量契约/单测；native ctest；真栈 e2e；接口冻结；安全扫描；SBOM。
- CD：构建一次、多环境 promote；release manifest（tag+digest+源 commit+契约版本+SBOM digest）唯一部署源；镜像/基础设施 digest 钉版，生产禁止 `latest`；镜像签名；provenance；canary/回滚；数据库迁移门。
- 环境：dev/staging/prod 同形态；secrets 管理；配置校验；禁止宿主 dist 遮蔽镜像。
- 网络：全链路 TLS（入口/MS/hub/DB/Redis/对象存储）；HSTS/CSP/X-Frame-Options/Referrer-Policy；WAF；服务网络分段；DB/Redis/对象存储不发布宿主公网；WA 管理端点认证 + 仅内网/回环；MS/WA 默认绑定回环或显式白名单。
- 观测：结构化日志、requestId/traceId、metrics、健康/就绪、审计、SLO、告警、on-call、事故演练。
- DR：Postgres PITR、对象存储版本化/跨区、checkpoint 重建、恢复演练。
- 安全：威胁模型、SAST/DAST/依赖漏洞、渗透测试、密钥轮换、最小权限、WAF/限流。
- 支持：工单/分级/升级路径、SLA、状态页、事故沟通、客户数据导出/删除请求；发布说明/已知问题/兼容矩阵。

**当前差距（I3–I7）**：
- CI 只覆盖类型/少量单测/lint；backend 123 测试仅 6 个进 CI；native ctest 未进 CI；web 生产包/BFF/镜像构建/漏洞/SBOM/secret/license 不在托管 CI；真栈 e2e 人工；最近发布跳过全量 e2e；backend interface-freeze 当前为红（SolverTypes/schema hash/schemaVersion）；发布清单仍写旧基线（55 条 e2e/后端 910 等），与实际 144 个顶层 spec（共 238）不符。
- MS 产物依赖宿主路径/rush `lib/`/本地 native checkout、无 lockfile、`tsc --noCheck`；native 是 store dev build + `fallbackRequired=true`，provenance 含宿主绝对路径并随公开产物分发；镜像 `latest` 可变；无 manifest/签名/SBOM；源码 1.85 vs 发布 1.64，RPC 版本握手会让整个 Feature 面失效而门禁不检查。
- 发布版本标识至少五套（shared 1.0.0/interface 1.85、MS `/health` 1.0.0、web 0.1.0、hub 1.2.0、日期 tag）；无“发布单元”把 web/MS/hub/schema/shared 绑定；升级先删旧树、无原子切换/N-2、`-Tag` 会混入 latest 镜像；hub 启动即迁移，无预备份/审批/回滚编排。
- “生产”仍 maildev、公开 Azurite well-known key、HTTP nginx、WA/Azurite 端口暴露；MS 是手工 Windows 用户进程（`Start-Process` + PID 文件 + `Stop-Process -Force`），无服务守护/开机自启/优雅停机/日志轮转；compose 中不存在注释所说的 modeling-server 容器形态。
- 无 staging/IaC；dev 是 vite、生产是镜像，主 e2e 默认不打部署产物；Node/基础镜像版本漂移且未钉 digest；容器无资源限制/日志轮转/安全选项。
- 代理后 MS 未设 `trust proxy`，所有用户共享一个 IP 限流桶；HUB/BFF/MS 前缀与 CORS 靠人工同步，无契约测试；`/ipc` 消息绕过 Express 限流。
- 无可观测 metrics/trace/统一 requestId/告警/on-call；MS/WA/BFF 健康检查不查依赖；无备份/PITR/恢复演练；单 hub/DB/Redis/Azurite、单 MS 宿主；Redis 256MB `noeviction`、WA 队列无卷、Hub cron 非分布式。

---

## 13. 合规与许可

- ACIS：Modeler+Polyhedra；InterOp/healing/STEP 不接线；**对外分发含 ACIS 的 MS 产物需法务书面授权/第三方通知/出口分类**；blocked op 在 native/API 入口 fail-closed。
- libslvs：GPL-3.0-only；规则是“仅纯云 SaaS、on-prem/客户端不打包”。当前公开 MS 产物若包含 `slvs.node` 并对外分发，与政策直接冲突，必须在发布前解决（源码邀约/第三方通知/商业例外/移除产物）；绳墨替换门禁。
- 许可门：ThickenSheet 等 blocked-license 工具不得无条件注册/经 IPC 可达；许可检查要在 native/服务入口 fail-closed，而不是只靠 UI 不显示。
- TrueForm：M0；SAB/迁移/双后端一致性门禁；不作为近期承诺。
- 第三方：许可证清单、SBOM、出口管制、数据驻留、隐私、审计留存。
- 企业：SSO/MFA、角色/组、审计、配额、数据删除/导出。
- 合规目标：按 SOC 2 Type II / ISO 27001 类控制建设（访问控制、变更管理、事件响应、备份、监控、漏洞管理、供应商管理、数据留存）；认证与否是商务/审计结果，但控制必须先存在。
- 隐私/数据驻留：按目标市场选择存储区域；客户可导出/删除；日志/备份不含明文密钥；保留期可配置。

---

## 14. 架构不变量（必须由 CI/门禁执行）

1. iModel/BIS 是唯一模型事实源；无第二模型库。
2. params 是参数化事实源；几何不双写。
3. FeatureOp 是唯一参数化写管道；直改最终有统一审计/撤销语义。
4. iTwin 是唯一交互渲染底座；无第二渲染平台。
5. shared 是唯一跨仓契约；版本化/双端发布/运行时握手。
6. 每 session 独立 IPC/briefcase/Editor；无共享文件/广播。
7. changeset/version 不可变（append-only + hash chain）；引用用 changesetId/versionId；Version 绑定真实 checkpoint。
8. 所有入口 per-doc ACL；无服务账号直通用户路径；每 session 独立 IPC/briefcase/Editor/undo。
9. 新特征必须声明 inputs/outputs/structuralKeys；不允许单输出假设扩散。
10. 新工作区必须通过 WorkspaceModule 注册，不改 Part Studio 内部。
11. 发布必须 release manifest/provenance/SBOM/interface-freeze 全绿；源码与产物契约版本一致。
12. 每个能力有真栈/失败/回滚证据；禁止假 full/假分享/假成功。

---

## 15. 与现状的映射

| 目标层 | 当前可复用 | 必须新建/重构 |
|---|---|---|
| 身份/ACL | iTwin 角色/iModel ACL 基础 | IdP/SSO、PDP/PEP、per-doc ACL、会话隔离、审计 |
| 控制面 | hub iModels/changesets/versions | typed Tab/Refs/Version/PDM/outbox |
| 会话面 | MS、FeatureService、Editor、tile | per-session IPC/briefcase/Editor、外部 lease |
| 数据面 | Postgres/Azurite/对象存储 | HA/PITR/备份/DR/tenant prefixes/lifecycle |
| 特征平台 | FeatureOp/Registry/tree/preview | manifest/graph outputs/topology identity/unified undo |
| 工作区/UI | Part Studio 五区壳/工具/选择 | WorkspaceModule/typed Tab/per-session store/ViewportHost/SelectionDomain/FormRuntime |
| 几何 | ACIS/SolidKernel/PSBRep/topology ID | format tag/vertex id/exact mass/facet IDs/batch pick/instancing ADR |
| 协作 | changeset/briefcase/lock/rebase | async multi-briefcase/undo ownership; realtime optional |
| 装配/工程图/PDM | BIS 基础/2D 显示原语 | 独立服务/求解器/HLR/BOM/release |
| 运维/发布 | compose/verify-stack/e2e | self-hosted CI/可复现构建/staging/release manifest/N-2/原子升级/SLO/observability/DR/SBOM/pentest |
| 安全/网络 | CORS/密钥卫生闸/部分 RBAC | TLS 全链路/KMS/WA 端点认证/网络分段/Azurite 密钥与暴露收敛/按用户限流/可信代理/SAST/DAST |
| 许可/合规 | 公开边界/部分 SBOM | ACIS 分发/libslvs GPL/Thicken fail-closed/隐私/数据驻留/SOC2/ISO 控制 |

---

## 15.1 目标组件与仓库归属

| 组件 | 归属 | 职责 | 不应承担 |
|---|---|---|---|
| Control Plane（hub） | imodelhub-services | 身份/租户/文档/ACL/changeset/checkpoint/version/refs/outbox | 几何/编辑/长任务 |
| Session Plane（MS） | luban-backend | 文档会话、Briefcase/FeatureService/Editor/IPC、交互求值 | 平台元数据权威、checkpoint/导入导出长任务 |
| Job Workers | webhook-agent / 新 worker | baseline/checkpoint/compare/import/export/render/PLM | 用户交互会话 |
| Native geometry | imodel-native | SolidKernel/PSBRep/facet/topology/tile 支撑 | 装配树/PDM/文件格式 |
| PDM（新服务） | 平台新服务 | release/revision/approval/BOM/WhereUsed/PLM | BIS 几何写事务 |
| Web/UI | luban-cad/apps/web + viewer/editor | 工作区 UI、选择、工具、表单、渲染投影 | 模型事实源/权限最终裁决 |
| Infra | 平台/SRE | 部署/CI/CD/观测/备份/DR/密钥 | 产品业务逻辑 |
| TrueForm | trueform（私有） | 几何内核长期替代 | iModel/BIS/事务/装配 |

**原则**：组件边界与仓库边界一致，避免“MS 承担平台元数据”“hub 承担几何”“内核承担产品子系统”。

---

## 16. 结论

- 目标架构不是“重写”，而是**在正确底座上加平台层**：控制面、会话面、作业面、数据面、PDM 面。
- 在架构冻结前，不应把“全部功能”铺开；否则每加一个特征都会加深单输出/单文档/手写契约的债务。
- 工业级的核心不是更多几何，而是：**身份/会话、不可变账本、灾难恢复、规模、发布、合规、可观测**。
- 本文件是目标；具体工作包、门禁和顺序见 `10-ARCHITECTURE-HARDENING-PLAN.md`。
