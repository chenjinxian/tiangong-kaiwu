# ADR-G0-05：几何持久化与 TrueForm 切换门禁

> 状态：**Proposed under owner directive 2026-11-24; not ARB-signed**
> 日期：2026-11-24
> 关联：`G0-DECISION-REGISTER.md` D0-5、`G0-SPIKE-REGISTER.md` S0-11、`10-ARCHITECTURE-HARDENING-PLAN.md` WS-H（H1/H10）与 WS-L（L4）、`09-INDUSTRIAL-TARGET-ARCHITECTURE.md` §9、`../research/lubancad-architecture-assessment/07-KERNEL-AND-NATIVE.md`、`../parity/KERNEL-BOUNDARIES.md`、`EXCEPTIONS.md` X-07/X-12
> 影响面：geometry stream / `BRepData`、native 持久化、FeatureOp 重建、旧 iModel 兼容、checkpoint/版本打开、导入几何、发布 provenance
> 本 ADR 只使用公开、脱敏事实；不含私有源码、密钥或 native 构建证据。实现状态以公开文档与可复现测试为准，不把规划当成已实现。

---

## 1. 背景与当前事实

1. **D0-5 的方向**：`G0-DECISION-REGISTER.md` 建议选项 C——当前继续 ACIS SAB 持久化，`BRepData` 增加 `format/kernel` 标签；TrueForm（真形）是长期方向，M1 前必须完成 SAB 兼容、双后端一致性、迁移与回滚。
2. **生产持久化是 ACIS SAB**。公开内核审计记录：iModel geometry stream 中存 ACIS SAB 字节，`BRepData` 目前只有 `brepType`，没有内核/格式标签。这意味着：
   - 混合后端文档无法仅凭数据诊断；
   - 未来迁移无法从数据面区分“ACIS 字节 / TrueForm 字节 / 其他来源”；
   - 若先启动 TrueForm 再补标签，迁移和回滚都会失去可判定的边界。
3. **TrueForm 当前只是文档/合同规划对象**。公开状态是 M0 脚手架（version/status 级别），没有拓扑、曲线/曲面、布尔、序列化、tessellation 或适配层；公开树中没有 `SolidKernel.h`，也没有 TrueForm 生产接线。TrueForm 不是当前可用的第二生产内核，也不是近期交付承诺。
4. **切换门禁未关闭**：
   - **SAB 策略未裁决**：TrueForm 若不能读取既有 SAB，就必须全量迁移或从 `params` 重求值；若能读取，则涉及格式许可与巨大工程量。两条路线的影响面不同，不能“先切了再说”。
   - **`SolidKernel.h` 的 111 导出合同/清单未冻结为绿色基线**：公开 2026-11-22 审计记录 interface-freeze 为红（PSBRep 归一化哈希与冻结值不符、opCount 38≠37、op37 未同 PR 更新 manifest）。该门禁本身属于 P0-08，但在变绿前不得启动 TrueForm M1。
   - **无同 fixture 的双后端一致性证据**：没有同一语料在 ACIS 与 TrueForm 下的几何/拓扑/质量属性/facet/tile/下游真栈对照。
   - **迁移与回滚未定义**：旧 `.bim`/params fixture 不足，native BRep 可读矩阵缺失，X-12（多份 native checkout）未关闭，无法证明“旧库可读、可重建、可回滚”。
   - **provenance 与性能未闭环**：发布产物 provenance 与源码 HEAD 的绑定、单一 canonical checkout、性能预算都还没有作为 M1 门禁证据。
5. **事实源不因标签而改变**：`params` 仍是参数化设计意图的事实源；几何是求值产物。`format/kernel` 标签只描述“这段持久化几何由哪个后端/格式产生”，不能成为第二套设计意图或第二套模型事实源。

---

## 2. 决策

### 2.1 生产持久化保持 ACIS SAB

在本 ADR 的门禁全部通过之前：

1. **ACIS SAB 是唯一生产几何持久化格式**。任何新写入路径不得写入 TrueForm-only 字节，也不得把 TrueForm-only 数据作为“未来兼容”的旁路格式。
2. TrueForm 不得作为生产默认后端；不得在产品路径上暴露“切换到 TrueForm”的开关或承诺。
3. 任何“TrueForm 已接入/已生产”的对外表述都禁止，直到 M1 门禁和 ARB 签字完成。

### 2.2 先加 additive `format/kernel` 标签（H1）

在任何 TrueForm M1 之前，必须完成 `BRepData` 的 additive `format/kernel` 标签：

1. **缺省语义**：没有标签的既有几何按 **legacy ACIS** 解释；这是显式兼容策略，不等于“已验证”。读取路径必须能报告 `legacy/absent` 状态。
2. **标签位置**：标签跟随持久化几何数据（geometry stream / `BRepData` 投影），不放进 `params`。`params` 仍只表达设计意图。
3. **标签取值**：至少能区分 ACIS SAB、TrueForm 及未来受支持格式；未知值、混合值或后端不支持的组合在写入/重建时 **fail-closed**，不得静默按 ACIS 解释。
4. **兼容性**：标签必须是 additive、可被旧代码忽略的形态；旧代码忽略标签时仍能读取 ACIS 字节；如果旧代码无法安全忽略，则 H1 门禁不通过，不能进入 M1。
5. **接口与测试**：标签进入 interface-freeze 矩阵；旧 iModel fixture 必须覆盖“无标签 → ACIS 可读、可重建”；S0-11 必须给出可复现结论。标签是诊断和迁移规划的基础，不是 TrueForm 的启动许可。

### 2.3 TrueForm M1 的全部门禁

TrueForm M1 只有在以下条件 **同时** 满足后才能启动；缺一项即 NO-GO：

1. **SAB 策略已裁决**：明确 TrueForm 是否读取 SAB；若不读取，必须给出经批准的迁移/重求值方案、成本、失败语义与回滚，且不得破坏旧文档可打开性。
2. **合同清单冻结且绿**：`SolidKernel.h` 的 111 导出合同、PSBRep op 清单、interface-freeze 检查全部为绿；op 增删必须同 PR 更新 manifest。当前红基线不得作为 M1 起点。
3. **双后端一致性语料**：同一 fixture 在 ACIS 与 TrueForm 下对比几何、拓扑、质量属性、facet/tile 内容与下游 FeatureOp/真栈结果；不允许“只过单测”或“只比包围盒”。
4. **迁移与回滚**：旧 `.bim`/params fixture、schema/params 版本、迁移 CLI 的 dry-run/verify/rollback、native BRep 可读矩阵、单一 canonical checkout（X-12）全部具备；任何 TrueForm 写入的文档必须能被回滚后端读取，否则不得写入。
5. **provenance**：发布产物能对账到源码 commit、native 版本与构建来源；不得使用含宿主绝对路径或来源不明 native 的产物作为 M1 证据。
6. **许可与法务**：TrueForm 自身及任何格式读写路径的许可/分发/出口结论明确；不能把未授权能力带入产品。
7. **性能与容量**：给出与 ACIS 基线可比的冷开/重建/大模型预算；不能以“功能先通、性能后补”进入 M1。
8. **ARB 签字**：上述证据经 ARB 评审并记录；本 ADR 的状态仍是 Proposed，不能替代签字。

### 2.4 唯一几何门面与失败语义

1. TrueForm 只能经 `SolidKernel.h`/PSBRep 后端契约接入（P0-09）；业务层、FeatureOp、UI 不得出现第二套内核 API 或旁路几何。
2. 不支持的后端/格式/标签组合必须返回稳定、可诊断的错误；不得回退到近似几何、不得假成功、不得把旧几何静默重求值后冒充原数据。
3. 质量属性、facet/tile、拓扑引用等派生结果必须带“后端/精度/是否近似”的诚实状态；近似结果不能支撑 `full` 能力或 strict 示例。

---

## 3. 备选方案与拒绝理由

| 方案 | 内容 | 结论 |
|---|---|---|
| A | 永久保留 ACIS SAB，不加格式标签 | **拒绝**：短期最省事，但混合后端不可诊断、迁移不可规划，把单行道留到未来；与 D0-5 的失败判据一致 |
| B | 立即切换 TrueForm | **拒绝**：TrueForm 仅 M0，无拓扑/序列化/适配层；会阻断现有几何链，且无 SAB 兼容/双后端/回滚证据 |
| C | SAB 与 TrueForm 双写 | **拒绝**：制造双事实源，违反 P0-06；一致性、存储、回滚成本不可接受 |
| D | 只在 `params` 中记录内核/格式 | **拒绝**：`params` 是设计意图；导入几何、直改、派生几何不一定有可对应的 params，标签必须跟随几何数据 |
| E | 未知标签静默按 ACIS 读取 | **拒绝**：fail-open，可能把非 ACIS 字节当 SAB 解析，属于数据损坏级风险 |
| F | 先启动 M1，再补 SAB 策略/回滚 | **拒绝**：正是 D0-5 失败判据；“先做出来再说”会把迁移风险变成不可逆历史 |

---

## 4. 后果与风险

**正向**

- 当前产品继续使用成熟 ACIS SAB，不因内核路线阻塞 Part Studio 主链。
- 加标签后，混合后端、旧文档、迁移来源在未来可被诊断；为 TrueForm 保留可演进接缝。
- M1 门禁把 SAB 策略、双后端一致性、回滚和 provenance 提前变成可验收条件，避免“切换后才发现旧库打不开”。

**代价/风险**

- `format/kernel` 标签需要 schema/native/interface-freeze/旧 fixture 工作量；它不是“零成本预留”。
- ACIS SAB 的锁定效应继续存在：内核替换、ACIS 分发许可、旧文档迁移风险仍在。
- TrueForm 仍不可用；产品不能把 TrueForm 作为近期卖点或 Onshape 对标前提。
- 当前 interface-freeze 红是独立 P0-08 债务；即使本 ADR 通过，M1 仍被它阻塞。
- 标签本身不能证明双后端一致；若把“有标签”误读为“可切换”，会产生虚假安全感。

---

## 5. 迁移、回滚与失败判据

### 5.1 迁移

1. **H1 标签迁移**：additive 增加标签；旧文档无标签按 legacy ACIS 读取；不重写旧几何字节，不做批量改写。S0-11 用旧 `.bim` fixture 验证“加标签后仍可读、可重建、可回滚标签”。
2. **旧文档策略**：legacy absent 状态必须可查询；列表/诊断/迁移报告能区分“显式 ACIS”和“legacy 未标注”。
3. **未来 TrueForm 迁移**：只有在 SAB 策略裁决后才有迁移；迁移必须可 dry-run、可 verify、可 rollback、幂等，并有旧库 fixture。若采用重求值路线，必须明确“旧文档仍可由 ACIS 打开”的窗口和失败处理。

### 5.2 回滚

1. **当前阶段回滚**：关闭/移除任何 TrueForm 实验路径，继续 ACIS SAB；标签为 additive，旧代码忽略标签或按 legacy ACIS 读取。
2. **M1 后回滚**：必须能切回 ACIS 后端并读取回滚窗口内的所有文档；任何 TrueForm 写入的文档若不能被 ACIS 读取，必须在写入前被门禁拒绝，而不是事后“再迁移一次”。
3. **不得回滚成“删除标签/删除旧数据”**：标签和旧数据是诊断与恢复依据；回滚不得重写历史 changeset。

### 5.3 失败判据

出现以下任一情况，本决策失败，M1 不得启动或必须停止：

- 未加 `format/kernel` 标签就启动 TrueForm M1；
- 旧 iModel 在新内核/新标签下不可读且无回滚；
- 未知/混合标签被静默按 ACIS 解释；
- 只做单测或合成 fixture，缺少同 fixture 双后端与下游真栈对照；
- 111 导出合同/PSBRep manifest 仍红，或 M1 未绑定 interface-freeze 绿基线；
- TrueForm 写入的文档无法被回滚后端读取；
- 未完成许可/法务与 provenance 门禁就对外分发或宣称生产可用。

---

## 6. 证据状态

| 项目 | 状态 | 说明 |
|---|---|---|
| S0-11 format/kernel 标签兼容 | **Not started** | `G0-SPIKE-REGISTER.md` 记录为未开始；无 PASS 证据 |
| H1 `format/kernel` 标签实现 | **未实现** | 公开树无该 additive 标签实现；不得声称已预留 |
| TrueForm M1 | **未启动** | 公开状态 M0；无 SAB 策略、双后端、迁移/回滚证据 |
| SAB 兼容决策 | **未裁决** | 本 ADR 只规定门禁，不代替决策/证据 |
| 111 导出/manifest | **未冻结为绿** | 公开 2026-11-22 审计记录 interface-freeze 红；不得作为 M1 起点 |
| 双后端一致性 | **无证据** | 无语料/真栈对照 |
| 迁移/回滚 | **无证据** | 缺旧 fixture、可读矩阵、dry-run/rollback 记录 |
| ARB 签字 | **无** | 本 ADR 仍为 Proposed |

本 ADR 不把任何规划、私有 native 证据或未执行的 Spike 写成“已通过”。在 ARB 签字与上述证据齐备前，不得将 TrueForm 描述为已接入、可切换或生产可用。

---

## 7. 签字与状态

- 拟制依据：业主 2026-11-24 指令（G0 ADR 草案，先文档后代码）。
- 当前状态：**Proposed under owner directive 2026-11-24; not ARB-signed**。在 ARB 签字前，本 ADR 只能作为实现约束与评审材料，不能作为 G0/G2/G5 Gate 已通过的证据。
- 签字栏（待）：

| 角色 | 姓名 | 日期 | 结论 |
|---|---|---|---|
| 架构 owner | | | |
| Kernel owner | | | |
| Native/发布 owner | | | |
| 许可/法务 | | | |

---

## 8. 关联

- 决策：D0-5（几何持久化）、D0-15（schema/params/native 迁移契约）。
- Spike：S0-11（format/kernel 标签兼容）。
- 工作包：H1（format/kernel 标签）、H10（TrueForm/SAB 决策）、L4（TrueForm 许可/迁移）。
- 例外：X-07（second backend 未落地、静态 ABI）、X-12（多份 native checkout）。
- 文档：`09` §9（Geometry/Kernel）、`10` §2.1/§3 WS-H/WS-L、`07-KERNEL-AND-NATIVE.md`、`../parity/KERNEL-BOUNDARIES.md`、`ADR-G0-07`（导入导出许可）、`ADR-G0-15`（迁移契约）。
