# ADR-G0-10：Undo 粒度与操作组

> 状态：**Proposed under owner directive 2026-11-24; not ARB-signed**
> 日期：2026-11-24
> 决策来源：`G0-DECISION-REGISTER.md` D0-10（仍为 Proposed，未 ARB 签字）
> 关联：`SESSION-ISOLATION-DESIGN.md` §5、`G1-EXECUTION-PLAN.md`（C3）、`G1-WAVE2-STATUS-2026-11-23.md`、`EXCEPTIONS.md`（X-05/X-15）、`docs/adr/0017-editor-flow-parity-defaults.md`、`../research/lubancad-architecture-assessment/09-INDUSTRIAL-TARGET-ARCHITECTURE.md` §7.2、`10-ARCHITECTURE-HARDENING-PLAN.md`（WS-C/F/I）
> 影响面：web/viewer/editor/backend 的撤销入口、OpLog、原生 `BriefcaseTxns`、直改、草图、预览/提交语义、协作 undo 所有权
> 本 ADR 只使用公开、脱敏事实；不包含私有源码、密钥或 native 构建证据。

---

## 1. 背景与约束

1. **当前存在两层 undo。** 一层是每个 `BriefcaseDb` 的原生 `BriefcaseTxns`（直改/`UndoTool`/`reverseTxns`/`reinstateTxn`），另一层是 FeatureService 的持久化 OpLog（参数化特征、变量/参数撤销）。两层没有统一的用户可见顺序。
2. **OpLog 的 undo 目前不按作者过滤。** `SESSION-ISOLATION-DESIGN.md` §1 F10 记录其查询只按 Part Studio 过滤；C3 设计增加 `author { userId, sessionId, briefcaseId }` 并要求 undo/redo/discard 只处理本会话作者的行。这是多会话隔离的前置。
3. **草图整体覆写 op 非 invertible（X-05）。** `insertSketch`/`updateSketch` 以整体覆写方式产生变更，无法保证可逆；当前 undo 不完整，与 P0-10 的“可撤销或 HITL”硬约束冲突。
4. **自动保存/推送改变 undo 深度（X-15）。** Onshape 式静默 `pushChanges` 会开启新 changeset 会话，已推送事务不再保证可 Undo；ADR-0017 D5 已登记该差异，但尚未解决。
5. **D0-10 要求操作组/事务是唯一用户可见撤销单位**，FeatureOp、原生直改、草图编辑统一语义；不允许保留两套互不相通的用户可见 undo。
6. 本 ADR 不新增第二套撤销状态机或模型库（P0-01/P0-05/P0-10）；实现必须复用 `BriefcaseTxns`、`EditTxn`、OpLog 和标准 `onCommitted`/`onModelGeometryChanged`。

## 2. 决策

### D-A 操作组（operation group）是唯一用户可见撤销单位

1. **定义**：一个操作组由一次已提交的用户命令产生，包含该命令在同一会话中提交的全部写入。示例：
   - 特征对话框 ✓ 提交；
   - 直改拖拽/镜像/移动提交；
   - 草图编辑模式 ✓ 退出/提交；
   - 变量表一次提交（若一次提交产生多行，属于同一组）。
2. **不产生组**：预览、取消、失败、无实际变更的 no-op、只读查询。失败的提交不得留下半个组。
3. **组必须原子可逆**：组内若包含多个事务/多行 OpLog，撤销必须作为一个整体；任一成员不可逆则整个组标记为不可逆，不允许“撤销一半”。
4. **组标识**：服务端在提交时分配 `operationGroupId`（会话内单调序号），至少记录 `sessionId`、`userId`、`briefcaseId`、写入路径（feature/direct-edit/sketch）、`invertible`、`createdAt`；推送成功后追加 `changesetId`。组标识只用于撤销/重做/审计和 UI 标签，不进入公共 RPC 的授权判断。
5. **UI 单位**：Undo/Redo 的可用性、提示文本和一次点击的粒度都以组为单位，不以单个事务、单个特征或单个 drag 事件为单位。

### D-B 一个用户可见 undo 栈，物理实现可分层

1. 每个工作区（当前为 Part Studio scope）只暴露一组 Undo/Redo 入口；不得同时提供“特征撤销”和“编辑撤销”两个独立用户栈。
2. 允许底层保留两种物理机制：原生 `BriefcaseTxns` 负责直改事务，OpLog 负责参数化特征/变量；但必须由一个撤销协调器按组的提交顺序统一解析，先撤销最新组，再撤销更早组。
3. 协调器只保存组映射（组 → 原生 txn 范围 / OpLog 行范围）和会话内顺序；不得复制几何、不得建立第二套文档状态。
4. 撤销/重做必须走标准事务与标准事件；禁止自定义事件替代 `onCommitted`/`onModelGeometryChanged`，禁止绕过写租约/ACL/审计。

### D-C 作者与会话所有权

1. G1 的 undo 语义是 **per-session**：只允许撤销/重做本会话作者提交的组。作者由服务端 `SessionContext` 派生，不信任客户端 `user`/`sessionId`。
2. push/pull 后，其他作者的组会进入本地库；undo/redo/discard 必须跳过这些组，不得回退他人编辑。若本会话没有可撤销组，返回“无可撤销操作”，不得借用他人组。
3. 旧 OpLog 行没有 author 时：
   - legacy 模式按旧行为（可能可撤销）；
   - enforce 模式下不可被新会话撤销/重做，UI 必须诚实提示；
   - 不允许为了“看起来兼容”给旧行伪造 author。
4. per-user（同一用户多会话共享 undo）是后续决策，不在 G1 承诺；在未裁决前按 per-session 实现。

### D-D FeatureOp、直改、草图共享同一组语义

| 路径 | 物理撤销机制 | 组映射 | 统一要求 |
|---|---|---|---|
| FeatureOp / 变量 | OpLog | 组 → OpLog 行范围 | 组提交顺序与 OpLog 顺序一致；undo 只处理本作者行 |
| 原生直改 | `BriefcaseTxns` | 组 → txn 范围 | 组结束时记录 txn 边界；undo 只撤销本会话文件内事务 |
| 草图提交 | OpLog/草图 op | 组 → 草图 op 行 | 可逆时与特征同组语义；不可逆时按 D-E 处理 |

1. 无论哪条路径，一次用户提交只产生一个组；组完成后才允许下一次提交，避免“半提交”组。
2. 撤销/重做后的几何、参数、树和选择投影必须通过标准重建/事件更新；不得只改 UI 状态。
3. 若某路径无法提供稳定的组边界，必须在提交前拆分命令或将该组标记为不可逆，不得静默合并。

### D-E 不可逆操作：X-05 仍 open，禁止假成功

1. 每个组在提交时记录 `invertible`。不可逆组必须在 UI 上明确不可撤销，不得显示可用的 Undo。
2. **撤销遇到最新不可逆组时停止，不得跳过它去撤销更早的组**；否则会产生“较晚编辑仍在、较早编辑已回退”的错误状态。
3. X-05 的合规路径只有两种：
   - 实现可逆 op（记录足够的前像/后像并验证）；
   - 正式 HITL：预览 → 确认 → 提交 + 审计，并明确该操作不可撤销。
4. 在 X-05 关闭前，草图整体覆写 op 不得被计入“统一 undo 已覆盖草图”的完成声明；UI 文案必须说明真实边界。
5. 任何“撤销成功”响应都必须对应实际状态回退；禁止 no-op 假成功。

### D-F 推送是 undo 的持久化边界（X-15）

1. 推送确认（Hub push ack）意味着当前 changeset 已封账并开启新 changeset 会话；原生事务栈的 undo 边界随之改变。
2. G1 不承诺跨 push ack 的 undo：
   - 原生直改组在 push 后不再保证可撤销；
   - OpLog 特征组能否跨 push 撤销，取决于是否实现并测试了“以新的前向 changeset 表达逆操作”；未实现前必须诚实失败；
   - UI 不得宣称与 Onshape 相同 undo 深度。
3. 组记录在 push 后追加 `changesetId`；协调器在跨 push 撤销请求上必须返回可解释的失败或执行真实的逆操作，不得把旧事务“恢复”到已推送历史中。
4. X-15 保持 open；本 ADR 只固定“不得假成功”和“UI 必须显示边界”，不宣称解决 undo 深度问题。

### D-G 预览、提交与失败语义

1. 预览只做影子求值，不产生组、不写 OpLog、不占用原生事务栈。
2. 提交失败/取消：回滚未提交事务，不产生组；不得留下可被 undo 的“幽灵组”。
3. 一次提交若产生多个事务，协调器必须在提交前确认它们可被一个组原子覆盖；否则拆分为多个用户可见提交。
4. 只读会话、租约失效、fencing 失败时，undo/redo 同样 fail-closed，并保持文档状态不变。

### D-H 统一 undo 验收测试（必须执行，不能只用单测）

以下用例是完成本 ADR 的最低真栈验收矩阵；在真实 MS + 真实 Hub/Azurite/Postgres + 两个独立客户端上下文执行，单元测试只能作为补充。

| ID | 场景 | 期望 |
|---|---|---|
| UD-01 | 单个 FeatureOp 组 undo/redo | 参数、几何、树一致；组只回退一次 |
| UD-02 | 单个直改组 undo/redo | 原生 txn 只影响本组；几何正确 |
| UD-03 | 草图提交组 | 可逆时与特征同语义；不可逆时明确拒绝，UI 不显示可用 Undo |
| UD-04 | 混合顺序 A(FeatureOp) → B(直改) → C(草图) 连续 undo/redo | 严格按 C、B、A 回退；redo 按 A、B、C 恢复；跨路径顺序正确 |
| UD-05 | 两个会话 A/B 各自提交后 undo | 各自只撤销自己的组；互不影响 |
| UD-06 | A push、B pull 后 B undo | B 跳过 A 的组；只回退 B 自己的组 |
| UD-07 | push ack 后 undo | 不假成功；UI 显示 undo 边界；不把旧事务塞回历史 |
| UD-08 | 最新组不可逆 | undo 停止；不得跳过该组回退更早组 |
| UD-09 | 预览/取消/失败/no-op | 不产生组；不改变 undo/redo 可用性 |
| UD-10 | 撤销/重做后的标准事件与缓存 | `onCommitted`/`onModelGeometryChanged` 触发；派生缓存失效；无影子状态 |

未通过 UD-01..UD-10 前，不得宣称“统一 undo”完成。

### D-I 不变量

| ID | 不变量 |
|---|---|
| INV-1 | 用户只看到一个 undo/redo 栈；不存在两套互不相通的用户可见撤销 |
| INV-2 | 一个操作组原子可逆；任何成员不可逆则整组不可逆 |
| INV-3 | undo/redo/discard 只处理当前会话作者的行/事务 |
| INV-4 | 不可逆组阻断 undo，不允许跳过 |
| INV-5 | push 边界必须诚实可见；不承诺 Onshape 等价 undo 深度 |
| INV-6 | 撤销/重做走标准事务与标准事件；无第二套状态机 |
| INV-7 | 任何 undo 成功响应都必须对应真实状态回退 |

## 3. 备选方案

| 选项 | 内容 | 结论与理由 |
|---|---|---|
| A | 文档级 undo | **拒绝**。会把其他页签/其他会话/其他用户的编辑一起回退，违反协作与所有权不变量 |
| B | 页签级 undo | **拒绝**。页签共享同一文档，跨页签依赖与重建顺序无法用页签边界稳定表达；仍无法解决直改/特征两层栈 |
| C | 保留两套独立 undo，仅按作者过滤 | **拒绝**。用户仍会看到两套栈；跨路径顺序不可预测；D0-10 明确要求统一 |
| D | G1 新建事件溯源 undo 服务 | **拒绝（G1）**。会引入第二套状态机和新的持久化面；实时协作时应由独立 op 流 ADR 重新评估 |
| E | 操作组 + 协调器，复用原生/OpLog（本决策） | **采用**。满足 D0-10，且不违反 P0-01/P0-05；代价是需要组元数据和真栈测试 |

## 4. 后果

**正向**

- 用户看到一致的 Undo/Redo 粒度与顺序，跨 FeatureOp/直改/草图不再出现两套栈。
- 作者过滤为多会话隔离提供可验证的 undo 所有权。
- 不可逆组和 push 边界被显式暴露，避免假成功与过度承诺。

**负向/代价**

- 需要在 FeatureOp/直改/草图三条路径上统一记录组边界；旧工具/旧客户端需要兼容。
- 旧 OpLog 行在 enforce 模式下不可撤销，存在一次性 UX 影响。
- X-05 未关闭前，草图 undo 仍不完整；X-15 未关闭前，跨 push undo 仍受限。
- 组元数据、协调器和 UD-01..UD-10 真栈测试增加交付成本。

## 5. 迁移、回滚与失败判据

### 5.1 迁移

1. **additive 元数据**：OpLog JSON 增加可选 `operationGroupId/operationSeq/author/invertible`；原生事务使用 label/appData 记录组 id 与边界。按 `SESSION-ISOLATION-DESIGN.md` §5.3，OpLog 作者是 JSON 追加，不需要 schema 迁移。
2. **shadow 阶段**：`UNIFIED_UNDO_MODE=off|shadow|enforce`（建议开关名，实施时登记到配置清单）。shadow 只记录组映射与违规，不改变现有 undo 行为；enforce 才启用单一入口和作者过滤。
3. **旧行兼容**：无组/无 author 的旧行按 legacy 行为；enforce 下不可撤销，UI 诚实提示。不得回填伪造作者。
4. **持久化组索引**：G1 只需要会话内顺序；若未来需要跨会话/跨 push 的持久组索引，必须按 ADR-G0-15 做版本化与迁移，不在本 ADR 内偷偷新增 schema。
5. **发布顺序**：shared（如新增可选字段）→ editor → viewer `dist` → web → backend；任何公共契约变更按 P0-07 bump 版本并双端发布。

### 5.2 回滚

- `UNIFIED_UNDO_MODE=off`：恢复按路径的旧撤销入口；组元数据保留但不再消费。
- `OPLOG_AUTHOR_FILTER=off`：恢复旧过滤；旧行/新行均可读，不回写。
- 原生组 label/appData 是未知键时旧代码应忽略；不得因回滚删除或重写已提交事务。
- 回滚不得把“已推送事务”重新变成可撤销；不得删除用户历史。

### 5.3 失败判据

1. 仍有两个用户可见 undo 栈，或 UI 分别提供“特征撤销/编辑撤销”。
2. A 的 undo 能回退 B 的组/事务；或 pull 后 undo 命中他人行。
3. 组内部分成员被撤销、部分保留；或组顺序与提交顺序不一致。
4. 最新组不可逆却跳过它撤销更早组。
5. push 后 undo 返回成功但状态未回退，或把旧事务写回已推送历史。
6. 预览/失败/取消产生可撤销组。
7. 撤销/重做绕过标准事务/事件，或产生未失效的派生缓存。
8. UD-01..UD-10 未执行就宣称统一 undo 完成。

## 6. 证据状态

- **公开设计事实**：`SESSION-ISOLATION-DESIGN.md` §5.3 明确当前两层 undo、OpLog 应按 author 过滤、push 后原生事务不可 undo；这是设计基线，不是已验收实现。
- **例外**：X-05（草图整体覆写 op 非 invertible）与 X-15（自动保存/推送后的 undo 深度）均 open，失效日期分别为 2026-12-31 与 2027-03-31（以 `EXCEPTIONS.md` 为准）。
- **owner 2026-11-24 实施快照**：C3（Editor/undo 所有权）已有代码与单测；公开文档未登记 C3 的具体测试计数，本 ADR 不引用未登记数字。
- **缺失**：没有统一 undo 真栈测试（UD-01..UD-10 未执行）；没有双用户部署 canary；X-05/X-15 未关闭；本 ADR 未获 ARB 签字。
- **不得宣称**：统一 undo 已完成、与 Onshape undo 深度一致、草图 undo 完整、跨 push undo 可用。

## 7. 关联与未决

- `G0-DECISION-REGISTER.md` D0-10、`G0-EXECUTION-PLAN.md` §4。
- `SESSION-ISOLATION-DESIGN.md` §5（两层 undo、作者过滤、直改门禁）。
- `G1-EXECUTION-PLAN.md` C3.1/C3.2/C3.3、`G1-WAVE2-STATUS-2026-11-23.md`。
- `EXCEPTIONS.md` X-05、X-15。
- `ADR-G0-09`（会话/进程/undo 所有权）、`ADR-G0-13`（push ack 与未推送窗口）、`docs/adr/0017-editor-flow-parity-defaults.md`（autosave/文档级版本）。
- 未决：per-user 多会话 undo 是否必要；X-05 的可逆 op vs HITL 选择；跨 push 撤销是否以新前向 changeset 实现；统一组索引是否需要持久化。

---

**关联**：`ADR-G0-09-session-process-model.md`、`ADR-G0-13-persistence-ack.md`、`G0-DECISION-REGISTER.md`、`G1-EXECUTION-PLAN.md`、`SESSION-ISOLATION-DESIGN.md`、`EXCEPTIONS.md`。
