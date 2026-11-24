# G0 决策登记册（Decision Register）

> 状态：**Proposed / 待 ARB 签字**（2026-11-22；2026-11-24 审计后仍 0/16 签字）
> 输入：`G0-EXECUTION-PLAN.md`、`09-INDUSTRIAL-TARGET-ARCHITECTURE.md`、`10-ARCHITECTURE-HARDENING-PLAN.md`
> **2026-11-24 收口**：20 份 `ADR-G0-*.md` 已全部存在（均 Proposed under owner directive，
> 未 ARB 签字）；决策/Spike 的实际证据映射与 G1 条件放行口径见
> [`G0-GATE-REPORT-2026-11-24.md`](./G0-GATE-REPORT-2026-11-24.md) 与
> [`INDUSTRIAL-READINESS-PROGRAM-2026-11-24.md`](./INDUSTRIAL-READINESS-PROGRAM-2026-11-24.md)。
> 本册 16 项仍全部 Proposed，不得据此宣称 G0 通过。
> 规则：本册中的“建议”不是自动裁决；只有 ARB/指定 owner 明确签字后才生效。未签字项不得作为对外功能承诺依据；实现只能按显式 owner 指令作为工作假设，并登记回滚。
>
> **2026-11-22 owner 指令**：按建议继续执行 G0/G1；本册所有条目仍标记 **Proposed**，不视为正式签字。已开始的 C1（IPC 按连接路由）、D1（账本不可变）等实现按建议默认值作为工作假设，若后续签字否决，按各工作包回滚方案撤销。

## 1. 使用方式

1. ARB 逐项处理：**接受建议 / 修改后接受 / 拒绝 / 延后**。
2. 每项必须写明：裁决人、日期、状态、条件（若有）、关联 ADR。
3. “延后”必须同时写明：阻塞哪些工作包、最晚决策日、失败动作；不得留空。
4. 任何与建议不同的选择，必须在 ADR 中补：备选方案、失败判据、回滚方式。
5. 签字后本册是决策事实源；架构文档/代码/计划与本册冲突时，以本册 + ADR 为准。

## 2. 签字角色

| 角色 | 决策范围 |
|---|---|
| Product Owner | 产品范围、部署/租户、市场/合规、导入导出范围 |
| Architecture Owner | 架构边界、进程/会话模型、账本/迁移、跨仓契约 |
| Security Owner | 身份归因、ACL、租户、密钥/审计 |
| Data Owner | 账本、版本/fork、灾备、迁移、持久化 ack |
| Frontend/Session Owner | 会话隔离、Undo、变量/配置、UI 状态边界 |
| Kernel Owner | 几何持久化、格式标签、HLR/渲染/内核能力 |
| Legal | ACIS/libslvs/STEP/数据驻留/出口 |

## 3. 决策总表

| ID | 决策 | 建议默认 | 主责 | 关联 ADR | 状态 |
|---|---|---|---|---|---|
| D0-1 | 产品范围 | 近期 Part Studio+基础 PDM；架构按全量预留 | Product | ADR-G0-01 | Proposed |
| D0-2 | 部署/租户 | 单租户先上线，`tenantId` 架构预留 | Product/Arch | ADR-G0-02 | Proposed |
| D0-3 | 协同模型 | 异步多 briefcase 先；实时独立 ADR | Product/Session | ADR-G0-03 | Proposed |
| D0-4 | 账本/版本/分支 | 不可变账本 + 真实 checkpoint；Duplicate 与 Fork with history 双语义 | Data | ADR-G0-04 | Proposed |
| D0-5 | 几何持久化 | BRepData 加 format/kernel 标签；TrueForm 长期 | Kernel | ADR-G0-05 | Proposed |
| D0-6 | 渲染 | iTwin 唯一交互；PBR/离线独立 ADR | Frontend | ADR-G0-06 | Proposed |
| D0-7 | 导入导出 | mesh/DXF 先；STEP/IGES 先许可裁决 | Product/Legal | ADR-G0-07 | Proposed |
| D0-8 | 装配/工程图 | 实例/只读显示先；Mate/HLR 后置 | Product/Arch | ADR-G0-08 | Proposed |
| D0-9 | 进程模型 | per-document actor；先证明 IPC/Editor/briefcase 隔离 | Session | ADR-G0-09 | Proposed |
| D0-10 | Undo 粒度 | 操作组；FeatureOp/原生/直改统一语义 | Frontend/Session | ADR-G0-10 | Proposed |
| D0-11 | 变量/配置作用域 | 文档级变量 + config 层预留 | Feature | ADR-G0-11 | Proposed |
| D0-12 | 目标市场/合规 | 先明确数据驻留/许可/出口，再收客户数据 | Product/Legal | ADR-G0-12 | Proposed |
| D0-13 | 持久化 ack | RPC ok=本地已保存；push ack=云端持久化；UI 明示未推送 | Data/Frontend | ADR-G0-13 | Proposed |
| D0-14 | 灾备等级 | HA+PITR+对象版本化；RPO≤5m、RTO≤1h | Data/SRE | ADR-G0-14 | Proposed |
| D0-15 | 迁移契约 | schema/params/native 全版本化；旧 fixture；dry-run/rollback | Data/Kernel | ADR-G0-15 | Proposed |
| D0-16 | 身份归因 | 用户路径 on-behalf-of；真实 user 进 changeset/OpLog/audit | Security | ADR-G0-16 | Proposed |

## 4. 逐项决策卡

### D0-1 产品范围

- **问题**：近期只交付 Part Studio，还是同时铺装配/工程图/PDM？
- **选项**：A 仅 Part Studio；B Part Studio + 基础 PDM；C 全量 Onshape。
- **建议**：B。近期 Part Studio + 基础 PDM 文档/版本；装配/工程图/高级 PDM 作为 G5 独立轨道，架构预留。
- **理由**：当前产品深度和平台正确性都不足以支撑全量承诺；先把 Part Studio 做深，避免把未冻结契约扩散到装配/图纸。
- **失败判据**：继续用“全量 Onshape 已实现”对外承诺；G4 前铺装配/图纸实现。
- **影响**：G4/G5 范围、PM 排期、示例覆盖。
- **关联**：ADR-G0-01、10 §1。

### D0-2 部署/租户

- **问题**：先做单租户私有部署，还是直接多租户 SaaS？
- **选项**：A 单租户；B 多租户；C 双形态。
- **建议**：A 先上线，B 架构预留；所有表和对象键从第一天带 `tenantId`，不要用 iTwinId 临时充当。
- **理由**：单租户可降低首期合规/运维复杂度，但租户键后补会迁移 ACL/存储/备份。
- **失败判据**：单租户假设写死进 schema/对象键/权限模型。
- **影响**：B10、E2、L5/L6、所有 ACL/存储路径。
- **关联**：ADR-G0-02、09 §5/§6、10 B10。

### D0-3 协同模型

- **问题**：单写者、异步多 briefcase、实时协同，先做哪个？
- **选项**：A 单写者；B 异步多 briefcase；C 实时。
- **建议**：B 为近期目标；A 作为当前可用基线；C 独立 ADR，不在 G1/G2 实现。
- **理由**：会话隔离 + undo 所有权 + per-user briefcase 是任何多用户前提；实时需要独立 op 流服务，成本最高。
- **失败判据**：未做会话隔离就上 presence/实时 UI；把“共享 briefcase + 广播”当多用户。
- **影响**：C/I/D10、分享/权限产品面。
- **关联**：ADR-G0-03、09 §11、10 WS-I。

### D0-4 账本/版本/分支

- **问题**：changeset 是否严格不可变？Version 何时绑定 checkpoint？Fork 复制内容还是历史？
- **选项**：A 可变账本 + 分支图；B 不可变账本 + 线性版本 + Duplicate/Fork with history；C 仅命名版本。
- **建议**：B。changeset append-only；Version 必须绑定真实 checkpoint；Fork 明确 Duplicate（内容副本）与 Fork with history（复制账本/版本）；分支后置。
- **理由**：当前 PATCH parentId、无父根、软删挖洞、Named Version 无 checkpoint、clone 空文档会摧毁版本/审计/发布基础。
- **失败判据**：checkpoint 先于账本冻结；用 fork 新 iModel 冒充分支；`preserveHistory` 只写 metadata。
- **影响**：D1–D8、PDM/发布、审计、协作。
- **关联**：ADR-G0-04、04/08/09、10 WS-D。

### D0-5 几何持久化

- **问题**：ACIS SAB 继续作为持久化格式，还是切换 TrueForm？
- **选项**：A 继续 SAB；B 立即切 TrueForm；C 双格式/标签过渡。
- **建议**：C。当前 SAB 持久化，BRepData 增加 `format/kernel` 标签；TrueForm M1 前完成 SAB 兼容、双后端一致性、迁移、回滚、provenance。
- **理由**：没有格式标签，混合后端/迁移不可诊断；立即切 TrueForm 会阻断现有几何链。
- **失败判据**：未打标签就启动 TrueForm M1；旧 iModel 在新内核下不可读且无回滚。
- **影响**：H1/H10、L4、导入导出、质量属性。
- **关联**：ADR-G0-05、07、09 §9。

### D0-6 渲染

- **问题**：继续 iTwin WebGL，还是引入 PBR/DanQing/离线渲染？
- **选项**：A iTwin 唯一；B iTwin + PBR；C DanQing/离线。
- **建议**：A 为交互渲染唯一底座；PBR/离线作为 ADR 可选路径；DanQing 未接入前不得作为产品渲染路径。
- **理由**：换渲染平台会违反 P0-01；PBR 需要 core fork 或独立服务，不能先做材质 UI。
- **失败判据**：第二套交互渲染平台；未定管线就做 Render Studio 资产库。
- **影响**：K8、UI 外观、性能预算。
- **关联**：ADR-G0-06、05/09、10 K8。

### D0-7 导入导出

- **问题**：先做 mesh/DXF，还是承诺 STEP/IGES/Parasolid？
- **选项**：A mesh/DXF；B 全部精确交换；C 许可内第三方。
- **建议**：A。mesh/DXF 先；STEP/IGES/Parasolid 先许可裁决，未获授权不接线、不承诺。
- **理由**：ACIS 3D InterOp 未授权；STEP 需要真形或第三方翻译器；不能自研近似 healing。
- **失败判据**：对外承诺 STEP；接线未授权 ACIS InterOp。
- **影响**：K6/L3、导入作业、数据迁移。
- **关联**：ADR-G0-07、09 §10、10 WS-K/L。

### D0-8 装配/工程图

- **问题**：先做装配实例、Mate、BOM，还是先做工程图/HLR？
- **选项**：A 装配实例；B 工程图只读；C 同时。
- **建议**：A + B 的只读显示先；Mate/3D 求解器、HLR/尺寸/表格后置，独立 ADR。
- **理由**：BIS 有 occurrence/GeometryPart 基础；Mate 需要 3D solver，工程图需要 HLR/投影引擎，不能塞进 Part Studio。
- **失败判据**：把装配/图纸塞进 Part Studio 特征链；无 HLR 先做自动视图 UI。
- **影响**：K1–K5、BOM/Where Used、PDM。
- **关联**：ADR-G0-08、09 §10、10 WS-K。

### D0-9 进程模型

- **问题**：MS 单进程多会话，还是 per-session/per-document actor？
- **选项**：A 单进程多会话；B per-session；C per-document actor。
- **建议**：C。先证明 per-session IPC/briefcase/Editor/undo 隔离；若单进程多会话，必须 fork/改全局单例并证明隔离。
- **理由**：`EditCommandAdmin`、IpcHost、briefcase 缓存都是进程级单例；IPC 广播和 requestId 冲突会让第二用户串线。
- **失败判据**：复用全局 Editor/IPC 单例；两个用户打开同一文档互相关闭。
- **影响**：C1–C7、J8、HA/多实例。
- **关联**：ADR-G0-09、09 §6、10 WS-C。

### D0-10 Undo 粒度

- **问题**：Undo 是文档级、页签级还是操作组级？
- **选项**：A 文档；B 页签；C 操作组。
- **建议**：C。操作组/事务为唯一用户可见撤销单位；FeatureOp、原生直改、草图编辑统一语义；与协作模型一起定。
- **理由**：两套不互通 undo 会在多用户/多 tab/直改场景产生跨用户回退。
- **失败判据**：保留两套 undo；B 的 undo 能回退 A 的编辑。
- **影响**：F7/I2、C3、UI 撤销。
- **关联**：ADR-G0-10、09 §7、10 WS-C/F/I。

### D0-11 变量/配置作用域

- **问题**：变量是 per Part Studio、文档级还是配置级？
- **选项**：A per-PS；B 文档级；C 配置层。
- **建议**：B + C 预留。文档级变量 + `configId`/覆盖层预留；不把单配置写死进 params。
- **理由**：当前变量表是 per scope；继续加深会让 Variable Studio/配置无法演进。
- **失败判据**：继续加单表假设；为配置复制整份特征。
- **影响**：F9、表达式、Workspace/Variable Studio。
- **关联**：ADR-G0-11、08 §4.4、10 F9。

### D0-12 目标市场/合规

- **问题**：先服务中国、全球还是私有化客户？
- **选项**：A 中国；B 全球；C 私有化。
- **建议**：先明确数据驻留/许可/出口，再决定收集客户数据；目标市场未定前不做生产数据托管。
- **理由**：ACIS/libslvs/出口/隐私/数据驻留是发布阻断项；先收数据会制造不可逆合规风险。
- **失败判据**：未定驻留/许可就收集客户模型；公开分发未授权产物。
- **影响**：L5/L6、DR、身份/租户、发布。
- **关联**：ADR-G0-12、09 §13、10 WS-L。

### D0-13 持久化 ack

- **问题**：用户操作何时算“已保存”？
- **选项**：A 本地 commit；B hub push ack；C checkpoint。
- **建议**：RPC ok=本地 briefcase 已保存；hub push ack=云端已持久化；checkpoint 是历史快照，不是每次保存。UI 必须明示“未推送”窗口。
- **理由**：当前 20s 防抖 push，崩溃/缓存丢失会丢窗口；把本地成功当云端保存是错误承诺。
- **失败判据**：UI 显示已保存但 hub 无数据；无崩溃恢复/重试语义。
- **影响**：D/E7、autosave、outbox、UI 状态。
- **关联**：ADR-G0-13、09 §4/§6、10 D/E。

### D0-14 灾备等级

- **问题**：生产是否接受单卷/Azurite？RPO/RTO 多少？
- **选项**：A 单卷；B HA+PITR；C 跨区/WORM。
- **建议**：B 为生产最低：Postgres HA+PITR、对象存储版本化/跨区、Redis HA/持久队列；RPO≤5m、RTO≤1h；Azurite 仅开发。
- **理由**：当前 changeset/blob 唯一副本在单卷，卷损坏即历史永久丢失；无恢复演练不能承诺可靠性。
- **失败判据**：生产用 Azurite/单卷；无 PITR/恢复演练；备份命令过时。
- **影响**：E1–E3、J9、SLO/HA。
- **关联**：ADR-G0-14/17、09 §4.4、10 WS-E/J。

### D0-15 迁移契约

- **问题**：schema/params/native 是否版本化？旧库如何兼容/回滚？
- **选项**：A 只 additive；B 版本化+fixture+回滚；C 不兼容重开。
- **建议**：B。每域 schema/params 带版本；旧 `.bim`/params fixture；迁移 CLI dry-run/verify/rollback；native BRep 可读矩阵；单一 canonical checkout。
- **理由**：当前 params 无版本、旧 fixture 缺、PartStudioMigration 非生产；native 升级后旧 BRep/checkpoint 兼容性无矩阵。
- **失败判据**：params 无版本；迁移不可回滚；旧库被新版本打开即坏。
- **影响**：E4/E5、D1、H10、发布。
- **关联**：ADR-G0-15、09 §4.3、10 WS-D/E/H。

### D0-16 身份归因

- **问题**：MS 继续服务账号 + 共享 API key，还是用户 on-behalf-of？
- **选项**：A 服务账号；B on-behalf-of；C 混合。
- **建议**：B。用户触发路径必须 on-behalf-of；changeset/briefcase/OpLog/audit 记录真实 user；后台任务用独立 service identity 并标 `serviceName/onBehalfOf`。
- **理由**：MS 服务账号直通会绕过 Hub ACL，审计/撤销/计费/配额全部失真；共享 API key 是数据面 RBAC 旁路。
- **失败判据**：共享 API key 代表任意用户；OpLog.user 用客户端 sessionId 冒充。
- **影响**：B2/B3/D10、审计、协作、租户。
- **关联**：ADR-G0-16、09 §5、10 WS-B/D。

## 5. 签字记录

> 未签字项保持 Proposed；签字后填写。

| 决策 | 裁决人 | 角色 | 日期 | 结果（接受/修改/拒绝/延后） | 条件/备注 | ADR |
|---|---|---|---|---|---|---|
| D0-1 |  | Product |  |  |  | ADR-G0-01 |
| D0-2 |  | Product/Arch |  |  |  | ADR-G0-02 |
| D0-3 |  | Product/Session |  |  |  | ADR-G0-03 |
| D0-4 |  | Data |  |  |  | ADR-G0-04 |
| D0-5 |  | Kernel |  |  |  | ADR-G0-05 |
| D0-6 |  | Frontend |  |  |  | ADR-G0-06 |
| D0-7 |  | Product/Legal |  |  |  | ADR-G0-07 |
| D0-8 |  | Product/Arch |  |  |  | ADR-G0-08 |
| D0-9 |  | Session |  |  |  | ADR-G0-09 |
| D0-10 |  | Frontend/Session |  |  |  | ADR-G0-10 |
| D0-11 |  | Feature |  |  |  | ADR-G0-11 |
| D0-12 |  | Product/Legal |  |  |  | ADR-G0-12 |
| D0-13 |  | Data/Frontend |  |  |  | ADR-G0-13 |
| D0-14 |  | Data/SRE |  |  |  | ADR-G0-14 |
| D0-15 |  | Data/Kernel |  |  |  | ADR-G0-15 |
| D0-16 |  | Security |  |  |  | ADR-G0-16 |

## 6. 变更控制

- 已签字决策变更必须新建 ADR 修订或新 ADR，不得直接改本册结论。
- 本册只记录决策，不记录实现进度；实现状态在各工作包/证据索引。
- 与 `09/10` 冲突时，以本册签字结论 + ADR 为准，并同步修订 09/10。

---

**关联**：`G0-EXECUTION-PLAN.md`、`G0-SPIKE-REGISTER.md`、`../research/lubancad-architecture-assessment/09-INDUSTRIAL-TARGET-ARCHITECTURE.md`、`10-ARCHITECTURE-HARDENING-PLAN.md`。
