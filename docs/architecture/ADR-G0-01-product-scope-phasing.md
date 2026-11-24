# ADR-G0-01：产品范围与分期边界

> 状态：**Proposed under owner directive 2026-11-24; not ARB-signed**（业主指令下拟制，尚未经 ARB 签字）
> 日期：2026-11-24
> 关联：`G0-DECISION-REGISTER.md`（D0-1 产品范围）、`G0-EXECUTION-PLAN.md` §4/§6、`10-ARCHITECTURE-HARDENING-PLAN.md` §0/§1/§5、`09-INDUSTRIAL-TARGET-ARCHITECTURE.md` §0/§1/§10/§16、`ADR-G0-02`、`ADR-G0-03`、`ADR-G0-07`（G0 计划项）、`ADR-G0-08`（G0 计划项）
> 影响面：产品承诺、能力账本、G4/G5 排期、示例与验收覆盖、对外文案与商务口径
> 本 ADR 只冻结范围与分期边界，不新增功能、不改 schema、不代表任何能力已交付；不含私有源码、密钥或 native 构建证据。

---

## 1. 背景与当前事实

1. 目标产品长期覆盖 Onshape 的主要产品面：Part Studio、装配、工程图、文档/版本/共享、导入导出、基础 PDM/发布；Render Studio、企业/多租户属于更长周期的可选面（09 §0）。
2. 当前成熟度不是“专业级云 CAD 已实现”：09 §1 明确 Part Studio 的 I1/I2 子集达到工程可用，I3–I9（数据完整性、安全/租户、规模/SLA、协作、发布/运维、合规、完整产品面）未达到工业生产标准；当前形态适合本地单团队演示、受控内网、单用户编辑。
3. 当前产品面仍以 Part Studio 为主；装配、工程图、PDM/发布在 09 §15 的映射中属于“必须新建/重构”的目标层，不是可用现状。
4. G0 决策尚未经 ARB 签字，G1 Gate 也未通过；按 10 §10 的执行规则，G0/G1 未过时不进入全功能开发，只允许维护、Spike 与平台正确性工作。G1 状态文档也明确“G0 ARB 未签字、G1 Gate 15 项均未勾选”（`G1-WAVE2-STATUS-2026-11-23.md` 开头及 §2）。
5. D0-1 的建议默认是“近期 Part Studio + 基础 PDM；装配/工程图/高级 PDM 作为 G5 独立轨道，架构预留”，并明确失败判据是继续以“全量 Onshape 已实现”对外承诺、或在 G4 前铺装配/图纸实现。
6. “基础 PDM”在本 ADR 中必须窄定义：只覆盖文档/版本的基础能力（文档发现、命名、版本查看等可被证据支持的部分），不包含发布/审批/ECN、BOM/Where Used、PLM 连接器、工程图发布或高级权限工作流。高级 PDM 属于 G5 的独立产品域。
7. “架构预留”不等于实现或承诺：数据模型、契约和模块边界可以为装配/工程图/PDM 留出位置，但这些能力的实现仍需各自 AIRR/ADR、Gate 与许可裁决（09 §16、10 §1/§11）。

---

## 2. 决策

### D-A 近期产品范围

1. **近期对外可承诺的范围 = Part Studio + 基础 PDM。** Part Studio 是唯一进入功能深度的建模工作区；基础 PDM 只承载文档/版本的基础使用闭环。
2. **基础 PDM 的允许内容**（以已有关闭证据为限）：文档列表/创建/重命名/删除保护、版本命名与历史查看、与 Part Studio 打开流程直接相关的文档操作。任何一项在 G1/G2 对应证据关闭前只能标注为受限或 blocked。
3. **基础 PDM 的非范围**：发布/审批/ECN、BOM/Where Used、PLM/ERP 连接、供应商/变更工作流、工程图发布包、跨文档引用治理。以上一律归入 G5/K7 或独立产品域，不得以“PDM 基础”名义提前实现。
4. 近期不承诺：装配实例/Mate/BOM、工程图/HLR/尺寸/GD&T、Render Studio/PBR/离线渲染、STEP/IGES/Parasolid、实时协同/presence、多租户 SaaS、生产级 SLA。上述能力的对外口径统一为“未交付/路线图/受许可或 Gate 阻塞”，不得使用“已支持”“全量 Onshape”等表述。
5. 能力账本、UI 入口、帮助文档、报价与销售材料必须使用同一范围口径；任何 blocked/deferred 能力必须显式可见，禁止假 full、假分享、假版本。

### D-B 架构预留全量 Onshape

6. **文档/工作区模型按目标形态预留**：`Tenant → Project(iTwin) → Document(iModel) → typed Tab + Version/NamedVersion/Reference`；Tab 必须有显式类型（Part Studio/Assembly/Drawing/Variable Studio/Imported/Derived），不得继续依赖 UserLabel 前缀作为唯一发现机制（09 §4.1）。
7. **装配/工程图是独立工作区与独立服务面**：装配用 BIS occurrence + GeometryPart + placement + sourceRef；Mate 需要独立 3D solver；工程图需要 DrawingService/HLR/投影/尺寸链路。不得把装配树、Mate、BOM 或图纸投影塞进 Part Studio 特征链或几何内核（09 §10、P0-09）。
8. **特征平台预留**：Feature Manifest、显式输入/输出端口、DAG 执行器、持久拓扑引用、统一 undo/预览是目标契约；当前单输出/线性链限制属于应用层实现约束，不是 iTwin 存储约束（09 §7）。
9. **UI/选择预留**：WorkspaceModule、typed Tab、SelectionRef（document/occurrence/vertex）、CommandRegistry、FormRuntime 是目标接缝；装配/工程图接入不得复制四套全局选择状态（09 §8）。
10. **PDM 预留**：ReleaseCandidate/Release/ReleaseItem/Approval/Revision/PartNumber/BOM/WhereUsed 由独立 PDM 服务承载，绑定 Version/checkpoint，不写入 changeset ExtendedData 自由 JSON（09 §10.4）。
11. 以上预留只表示“未来可以在不改承重契约的前提下接入”，不表示相应能力已实现、已获许可或已排期；每项仍需在 G5 或独立 ADR 中重新评估。

### D-C Gate 分离与功能冻结

12. **G4 与 G5 是独立 Gate**：G4 = G3 之后的 Part Studio 功能扩展；G5 = 装配/工程图/PDM/导入导出等专业产品面，各自独立立项、独立能力账本、独立证据，不与 Part Studio 混波次（10 §1/§5）。
13. **G1/G2 前不铺功能**：在 G1（会话/身份/账本/灾备）与 G2（契约/工作区/特征图/选择）未过之前，只允许维护性修复、Spike、平台正确性工作与契约冻结；新增 FeatureType、草图工具、UI 波次、schema 字段、native op 一律进入 G4/G5 backlog，不在当前波次实现。
14. **范围变更入口唯一**：任何扩大近期范围的需求必须回到 Product Owner，记录对 G4/G5、示例覆盖、许可与证据的影响；不得由单个工作流以“顺手做”方式改变范围。
15. **基础 PDM 依赖账本与版本证据**：版本查看/命名必须以 D0-4 的不可变账本与真实 checkpoint 为前提。当前 Named Version checkpoint 生成默认关闭（X-17）、clone/fork 仍为 fail-closed 切片（X-16），因此在这些证据关闭前不得宣称“版本快照可用”或“历史可复制”。
16. **基础 PDM 不替代分享/权限**：文档共享、链接分享、组权限属于 B3/B4 与 ADR-G0-16 的范围；在 per-doc ACL 与真实分享执行完成前，基础 PDM 不得包含对外分享承诺。

---

## 3. 备选方案与拒绝理由

| 选项 | 内容 | 拒绝理由 |
|---|---|---|
| A | 只做 Part Studio，不做任何 PDM | 文档与版本的发现/命名是使用 Part Studio 的最小闭环；完全不做会把文档模型债务留到后续，且无法支撑 G4 的示例与验收 |
| B（本 ADR） | Part Studio + 基础 PDM；装配/工程图/高级 PDM 后置；架构按全量预留 | 与当前平台成熟度匹配；避免在未冻结契约上铺功能；保留演进空间 |
| C | 立即按全量 Onshape 承诺并同步铺装配/工程图/PDM | 平台正确性、许可、会话/ACL、账本/DR 均未达标；将把单输出/单文档/单 briefcase 假设扩散到所有产品域 |
| D | Part Studio + 装配 + 工程图先做，PDM 后补 | 违反 Gate 顺序；typed Tab/SelectionRef/HLR/Mate solver 未冻结，先做会把错误契约写进 UI 与服务 |
| E | 只预留“最小架构”，等产品需要时再加 | 文档/工作区/引用/版本模型的后补迁移成本高（09 §4.1/§15）；会把已交付文档变成迁移对象 |
| F | 把 G4 并入 G1/G2，功能与平台一起铺 | 功能广度依赖 G2 的 manifest/输出/拓扑契约；绕过 Gate 会重复 10 §7 的返工风险 |

---

## 4. 后果与风险

### 正向

- 对外承诺与当前证据一致；避免“全量 Onshape”造成的信任与验收风险。
- G4/G5 分开后，Part Studio 的深度投入不会被装配/图纸的未决契约拖累。
- 数据模型、Tab 类型、引用与 PDM 边界提前预留，降低后续迁移成本。

### 负向/成本

- 短期产品面窄于竞品，商务与销售需要明确解释“路线图不是已交付”。
- “基础 PDM”定义若不受控，容易膨胀为发布/BOM/工作流，反噬 G1/G2 资源。
- G4/G5 的独立立项需要额外 owner、AIRR、许可与证据预算；资源不足时路线图会停留为文档。

### 主要风险

| 风险 | 触发 | 缓解 |
|---|---|---|
| 范围漂移 | 以“Part Studio 增强”为名加入装配/图纸/BOM 能力 | 范围变更回 Product Owner；新增 FeatureType/工作区必须走 Gate |
| 预留被误读为交付 | 销售/文档把“架构预留”写成“即将支持” | 能力账本统一 blocked/deferred 标签；对外文案评审 |
| 基础 PDM 过度承诺 | 在 X-16/X-17 未关闭时宣传版本快照/复制 | 版本能力按 D4/D5 证据分级；未闭项显式标注受限 |
| G5 永久后置 | 商业压力下把 G5 当作“以后再说” | G5 独立立项与 owner；在产品路线图登记 Gate 依赖 |
| 能力账本漂移 | UI 入口先于后端证据开放 | 发布门检查能力账本与 UI 一致性；blocked 入口不可达 |

---

## 5. 迁移、回滚与失败判据

### 迁移

- 本 ADR 不涉及 schema、数据或 native 迁移；迁移对象是产品口径、能力账本、UI 入口与 backlog 分层。
- 将现有路线图拆为：近期（Part Studio + 基础 PDM）、G4（Part Studio 深度）、G5（装配/工程图/PDM/导入导出独立轨道）；每项标注 owner、Gate、证据与许可前置。
- 在能力账本中把装配/工程图/高级 PDM/STEP/实时协同/多租户标为 blocked 或 deferred，并绑定对应 ADR/Gate。

### 回滚

- 若业主/ARB 决定缩窄近期范围：撤回对外口径、关闭未获证据的 UI 入口、保留已创建数据；不需要数据模型回滚，因为本 ADR 未删除任何契约。
- 若决定扩大范围：必须新建 ADR 修订或新 ADR，重新评估 G4/G5、许可、证据与容量；不得直接修改本 ADR 的结论。
- 预留架构本身不回滚；若未来放弃某产品域，保留 typed Tab/代码枚举的兼容性，避免破坏已存在文档。

### 失败判据

1. 对外材料或销售口径继续使用“全量 Onshape 已实现/已支持”。
2. G1/G2 未过仍新增 FeatureType、装配/图纸实现或大面积 UI 波次。
3. 把装配树、Mate、BOM、图纸投影塞进 Part Studio 特征链或几何内核。
4. 在 X-16/X-17 未关闭时宣称版本快照/历史复制可用。
5. 基础 PDM 被扩张为发布/审批/BOM/PLM，而未走 G5 立项。
6. G4/G5 混在同一 Gate/波次，无法独立验收与回滚。
7. 能力账本与 UI/文档口径不一致，出现 blocked 能力可被用户触达。

任一失败判据触发时：停止新增功能 intake，回到 Product Owner/ARB 重新裁决，并更新能力账本。

---

## 6. 证据状态

| 类别 | 已有 | 缺失/未证明 |
|---|---|---|
| 决策 | D0-1 已登记为 Proposed；本 ADR 给出窄定义与 Gate 分离 | ARB 签字；Product Owner 对“基础 PDM”范围的书面确认 |
| 目标架构 | 09 给出 I0–I9、目标分层、文档/工作区/PDM 边界；10 给出 G0–G5 顺序与 G4/G5 验收 | G4/G5 的独立 AIRR、owner、资源与排期 |
| 当前事实 | 09 §1 记录当前成熟度；G1 状态文档明确 Gate 未通过 | 经真栈验证的完整 Part Studio 能力矩阵；基础 PDM 的端到端证据 |
| 契约 | 09/10 描述目标 manifest/输出/拓扑/Workspace/Selection | G2 契约冻结；typed Tab/SelectionRef/WorkspaceModule 的落地证据 |
| 版本/PDM | D0-4 决策方向、ADR-G0-04、X-16/X-17 记录当前边界 | 真实 checkpoint 生成/readback、版本打开、clone/fork 内容复制（D3–D6） |
| 许可 | D0-7/D0-12 与 09 §13 记录 STEP/ACIS/libslvs 边界 | G5 各域的许可裁决与分发授权 |

**不得宣称**：全量 Onshape 已实现；装配/工程图/高级 PDM 可用；基础 PDM 等于发布管理；版本快照已真实生成；G4/G5 已排期或已获资源；架构预留在没有 ADR/Gate 的情况下可直接实现。

---

## 7. 关联 D0 / Spike / 例外

- **D0**：D0-1（本 ADR）、D0-4（账本/版本，基础 PDM 前置）、D0-7（导入导出与许可，G5 前置）、D0-8（装配/工程图边界，G5 前置）、D0-12（市场/合规，影响 G5 分发）。
- **Spike**：S0-6（多输出/拓扑，G4 前置）、S0-13（clone/fork 内容，基础 PDM/版本前置）、S0-14（冷开基线，版本体验前置）。`G0-SPIKE-REGISTER.md` 当前仍为 Not started/待填；本 ADR 不把 Spike 计划当作证据。
- **例外**：X-16（clone/fork fail-closed）、X-17（checkpoint 生成默认 OFF）、X-06（单进程写租约，影响协作而非范围）、X-08（libslvs GPL，G5 分发前置）。
- **Gate**：G1/G2 功能冻结；G3 生产就绪；G4 Part Studio 深度；G5 专业产品面。

---

## 8. 签字与状态

- 拟制依据：业主 2026-11-24 指令（“draft architecture ADRs under owner directive”）。
- 当前状态：**Proposed — not ARB-signed**。在 ARB 签字前，本 ADR 只能作为范围与实现约束，不能作为 G4/G5 “已批准/已排期”的证据。
- 签字栏（待）：

| 角色 | 姓名 | 日期 | 结论 |
|---|---|---|---|
| Product Owner | | | |
| Architecture Owner | | | |
| Feature Platform Owner | | | |
| Legal（G5 许可相关） | | | |
