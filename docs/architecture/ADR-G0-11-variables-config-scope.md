# ADR-G0-11：变量 / 配置作用域

> 状态：**Proposed under owner directive 2026-11-24; not ARB-signed**
> 日期：2026-11-24
> 关联：`G0-DECISION-REGISTER.md` D0-11、`10-ARCHITECTURE-HARDENING-PLAN.md` WS-F（F9）、`09-INDUSTRIAL-TARGET-ARCHITECTURE.md` §7.2、`../research/lubancad-architecture-assessment/08-ARCHITECTURE-EXTENSIBILITY.md` §4.1、`docs/adr/0020-sketch-expressions-and-variables.md`、`ADR-G0-10`（undo 粒度）、`ADR-G0-15`（schema/params 迁移）
> 影响面：变量表/变量作用域、表达式求值上下文、Feature params、配置/覆盖层预留、Variable Studio、跨 tab 求值、迁移与回滚
> 本 ADR 只使用公开、脱敏事实；不含私有源码、密钥或 native 构建证据。

---

## 1. 背景与当前事实

1. **D0-11 的方向**：变量采用**文档级**作用域，`configId`/覆盖层预留；不把单配置写死进 `params`。
2. **当前实现是 per Part Studio**：
   - ADR-0020 引入 `LubanCAD.PartStudioVariables`，**每个 Part Studio scope 一个**变量表；变量名在 scope 内唯一，表达式字符串是设计意图，求值结果不落库。
   - 变量表有 `version:1`；旧 iModel 无该元素 = 空变量表。变量变更通过 `updateVariables` 整表覆写，可逆，并在当前 scope 内重建。
   - ADR-0020 明确不做跨 Part Studio/跨文档变量，也不做 Configurations；当前“所有变量对当前 scope 内所有特征可见”是产品实现口径（相对 live 的有序可见性是一个已登记的产品超集）。
3. **per-PS 表已开始加深单表假设**：公开可演进性审计记录：
   - 变量表是 per Part Studio scope；
   - 若未来要 Variable Studio/文档变量，需要文档级变量元素 + 复合求值上下文 + 迁移；
   - 现在每个新表达式字段都在加深“单表/单作用域”假设。
4. **`params` 仍是事实源，但缺 per-feature 版本**：特征 `params` 是不透明 JSON，没有 `paramsVersion`；只有变量表有 `version:1`。变量/配置作用域变更若没有迁移锚点，会与 D0-15 的迁移契约冲突。
5. **当前无 Configurations**：没有配置集/配置变量/配置覆盖层；特征参数是当前单配置的物化快照（数值）加可选 `*Expression` 原文。若现在把“单配置”写死进 params/schema，未来配置化需要重写所有参数/特征。
6. **作用域不是权限/版本**：变量作用域、`configId`、配置覆盖都不能替代 per-doc ACL、Version/changeset 或租约；它们只是求值上下文。

---

## 2. 决策

### 2.1 现在裁决：变量目标作用域为文档级

1. **长期模型是文档级变量**（iModel 内跨 tab 共享），不是 per Part Studio 单表。文档级变量表/ Variable Studio 是后续变量值的单一权威模型；Part Studio 只是消费方之一。本裁决不是“保留 per-PS、以后再议”：文档级是当前目标模型，per-PS 只因迁移/兼容风险暂作过渡实现。
2. 当前 `LubanCAD.PartStudioVariables`（每 scope 一个）是**过渡兼容实现**，不得作为长期契约冻结：
   - 新 shared 契约、新 feature、新 UI 不得再引入“变量只在当前 Part Studio 可见/只读当前 scope 表”的长期假设；
   - 不得新增 feature-owned 变量表或绕过统一求值上下文；
   - 现有实现可以继续服务旧文档/旧客户端，但必须按迁移计划收敛，而不是继续扩展。
3. 本 ADR 立即生效的是**契约方向与边界**；文档级变量元素、迁移 CLI、Variable Studio UI 等的具体实现按独立 AIRR/切片排期，不表示已实现。

### 2.2 统一求值上下文（resolver）边界

1. 所有变量/表达式消费者（草图尺寸、特征字段、未来配置/装配/图纸）必须通过统一的求值上下文解析变量，不得直接读取某个 scope 的单表。
2. 求值上下文至少表达：
   - 文档作用域（基础变量）；
   - tab/工作区作用域的显式覆盖（过渡期/未来配置层，见 2.4）；
   - 特征/字段的表达式与物化数值快照。
3. 解析顺序必须显式、可审计；重复名、循环、未知变量、作用域冲突必须返回结构化错误，不得静默 shadow/最后写入者获胜。
4. 后端仍是权威求值点（P0-06）：前端可本地预校验，但写/重建以服务端求值结果为准；不得出现“前端算一套、后端存另一套”。

### 2.3 文档级变量模型与迁移

1. 目标模型：文档级变量元素（Variable Studio 兼容）作为变量值/表达式的单一权威；旧文档无该元素 = 空文档变量表。
2. 迁移从 per-PS 表到文档级表，必须满足：
   - 同名同表达式可确定性合并；
   - 同名不同表达式是**显式冲突**，阻止该文档自动迁移并要求用户/管理员裁决，不得静默选取一个；
   - 旧文档的 per-PS 表在迁移验证前保留；迁移不 dual-write（P0-06），采用明确的读优先级窗口（文档级存在则读文档级，否则读 legacy per-PS）；
   - 迁移 CLI 支持 dry-run/verify/rollback、幂等、旧 `.bim`/params fixture；
   - 迁移后特征表达式重新绑定到文档级上下文，必须逐文档验证求值结果/几何/体积/冷重开；不得静默改变语义。
3. 过渡期契约必须明确 legacy 状态：`perPartStudio` 与 `document` 不能在同一文档中隐式混用；混合状态必须可诊断，写入路径必须选定单一权威。
4. 迁移完成并验证后，per-PS 表转为只读/弃用；删除前保留回滚窗口，不得直接丢弃旧数据。

### 2.4 `configId`/覆盖层预留

1. 预留 `configId` 与配置覆盖层：未来配置解析发生在表达式求值之前，对变量值/特征参数做显式覆盖；`configId` 是求值上下文的一部分。
2. 当前**不实现**配置 UI/配置集/配置变量；不得为配置复制整份特征树，不得把“当前配置”写死进 `params` schema。
3. 特征 `params` 继续保存当前配置的物化数值快照与表达式原文；未来配置切换必须重新求值并生成对应快照/缓存键，不得静默复用旧配置的物化值。
4. `configId` **不是** Version/changeset、不是权限/ACL、不是租约/会话标识；不得用它做授权判断、版本解析或审计主键。

### 2.5 与 undo/审计/迁移的边界

1. 变量/配置变更仍是标准事务：可撤销、可审计；文档级变量可能影响多个 tab，undo/redo 的影响范围必须显式（按 `ADR-G0-10` 的操作组语义），不得跨会话回退他人编辑。
2. 变量/配置 schema/params 变更必须带版本、旧 fixture、迁移与回滚（`ADR-G0-15`）；不得在无迁移锚点的情况下改变作用域语义。
3. 变量/配置不进入 changeset 的“权限/发布”语义；发布/PDM 仍绑定 Version/checkpoint（`ADR-G0-08`）。

---

## 3. 备选方案与拒绝理由

| 方案 | 内容 | 结论 |
|---|---|---|
| A | 永久 per Part Studio 变量表 | **拒绝**：与 D0-11 建议相反；Variable Studio/文档变量/配置需要重写，且每个新表达式字段继续加深单表假设 |
| B | 立即大爆炸迁移到文档级 | **拒绝**：缺文档级元素、冲突策略、旧 fixture 与回滚；会静默改变同名变量语义 |
| C | 变量作为 `LubanFeature` 行 | **拒绝**：变量不是特征，会污染特征树/顺序/依赖图（ADR-0020 已拒绝） |
| D | 为每个配置复制整份特征树/变量表 | **拒绝**：历史膨胀、双事实源、undo/迁移不可维护 |
| E | `configId` 用作版本/权限标识 | **拒绝**：混淆求值上下文与版本/授权，产生越权/错误版本解析风险 |
| F | per-PS 与文档级双写 | **拒绝**：违反 P0-06 单一事实源；一致性/回滚不可控 |
| G | 同名变量静默 last-write-wins | **拒绝**：会静默改变几何/参数语义；必须显式冲突 |

---

## 4. 后果与风险

**正向**

- 变量作用域从“实现细节”提升为有明确目标与迁移路径的架构决策；Variable Studio/配置有可演进接缝。
- 统一 resolver 边界避免每个新表达式字段继续绑定单 scope 表。
- `configId`/覆盖层预留不引入当前实现复杂度，但避免未来重写参数模型。

**代价/风险**

- 过渡期存在 per-PS legacy 债务；在文档级模型落地前，契约必须同时容忍两种状态，增加测试/迁移成本。
- 文档级变量跨 tab 共享会改变同名变量的可见性/求值语义；冲突裁决需要产品/用户参与，不能全自动。
- 变量/配置变更可能影响多个 tab，undo/审计/缓存失效范围扩大。
- 配置层未来需要求值器/缓存键/快照/迁移支持；当前不实现意味着后续仍需一次 schema/契约升级。
- 若迁移验证不足，可能出现几何/体积/参数静默变化；必须以 fixture/真栈/冷重开对比阻断。
- 当前没有专门的 EXCEPTIONS 条目覆盖“per-PS 过渡模型”；若它持续到 G2 之后，必须登记例外并给 owner/失效日期/退出计划。

---

## 5. 迁移、回滚与失败判据

### 5.1 迁移

1. **阶段 0（契约边界）**：统一求值上下文/resolver 接口；旧 per-PS 读取作为 legacy provider；新消费者不得直接读单表。此阶段不改变旧文档行为。
2. **阶段 1（additive 文档级模型）**：新增文档级变量元素/类型（additive schema），旧文档 = 空；建立旧 `.bim`/params fixture 与 dry-run/verify/rollback 迁移 CLI。
3. **阶段 2（迁移与读优先级）**：按 2.3 的冲突策略迁移 per-PS 表；读优先级显式（文档级存在则读文档级，否则 legacy per-PS）；不 dual-write；逐文档验证表达式/几何/体积/冷重开。
4. **阶段 3（收敛）**：新写入只进文档级；per-PS 表只读/弃用；验证窗口后删除或归档，保留回滚所需的旧数据/备份。
5. **配置未来迁移**：配置元数据/覆盖层独立版本化；旧单配置文档 = 默认配置；配置切换重新求值并生成快照；回滚移除配置层但不改写历史 changeset。

### 5.2 回滚

1. **迁移回滚**：在读优先级窗口内切回 legacy per-PS；文档级数据保留以便重试迁移；不删除旧表、不改写历史 changeset。
2. **作用域回滚**：若文档级模型出现正确性/性能问题，停止新写入并恢复 legacy 读取；已写入文档级数据的文档必须能继续被读取，或按迁移 CLI 回滚到迁移前快照。
3. **配置回滚**：关闭配置层/UI，继续使用当前物化快照；不得把配置覆盖值写回 `params` 作为“永久默认”。
4. **不得回滚成**：删除旧变量表、静默重绑定表达式、用 dual-write 掩盖不一致。

### 5.3 失败判据

出现以下任一情况，本决策失败：

- 继续新增 per-PS 变量 API/字段，或把 per-PS 单表写进长期 shared 契约；
- 变量表塞进每个特征的 `params`，或为配置复制整份特征树；
- 同名变量冲突静默 last-write-wins / 静默 shadow；
- `configId` 被当作 Version、changeset、ACL 或审计主键；
- 文档级迁移无冲突策略、无旧 fixture、无 dry-run/verify/rollback；
- per-PS 与文档级 dual-write，或迁移后静默改变几何/体积/参数；
- 变量/配置变更绕过事务/undo/审计，或跨用户 undo 回退；
- 没有版本锚点就改变变量作用域语义（违反 `ADR-G0-15`）；
- per-PS 过渡模型持续超过 G2 且未登记 EXCEPTIONS。

---

## 6. 证据状态

| 项目 | 状态 | 说明 |
|---|---|---|
| per-PS 变量表 | **已实现（ADR-0020）** | `LubanCAD.PartStudioVariables` 每 scope 一个；shared 契约/后端/真栈有公开实现记录 |
| 文档级变量模型 | **未实现** | 无文档级变量元素/求值上下文/迁移 |
| 统一 resolver 边界 | **未实现** | 当前消费者按 scope 表读取；需要新契约切片 |
| `configId`/配置覆盖 | **未实现/仅预留** | 无配置数据模型/UI/求值层 |
| 迁移 CLI/旧 fixture | **未实现** | 无 per-PS → 文档级迁移证据 |
| 冲突策略/回滚演练 | **未实现** | 无同名冲突/回滚证据 |
| EXCEPTIONS 登记 | **未登记** | 当前表无对应条目；若过渡模型持续需新增 |
| ARB 签字 | **无** | 本 ADR 仍为 Proposed |

本 ADR 不把 ADR-0020 的 per-PS 实现当作文档级模型已实现，也不把“预留 configId”当作配置能力已交付。

---

## 7. 签字与状态

- 拟制依据：业主 2026-11-24 指令（G0 ADR 草案，先文档后代码）。
- 当前状态：**Proposed under owner directive 2026-11-24; not ARB-signed**。在 ARB 签字前，本 ADR 只能作为实现约束与评审材料。
- 签字栏（待）：

| 角色 | 姓名 | 日期 | 结论 |
|---|---|---|---|
| 架构 owner | | | |
| Feature Platform owner | | | |
| 前端/Workspace owner | | | |
| 数据/迁移 owner | | | |

---

## 8. 关联

- 决策：D0-11（变量/配置作用域）、D0-10（undo 粒度，间接）、D0-15（schema/params 迁移，强制）。
- Spike：无直接 G0 Spike；ADR-0020 的实现/真栈证据是当前 per-PS 基线，不能替代文档级迁移证据。
- 工作包：F9（配置边界）、F7（统一 undo/preview，间接）、E4/E5（迁移/旧 fixture，间接）。
- 例外：当前 `EXCEPTIONS.md` 无变量作用域条目；若 per-PS 过渡模型在 G2 后仍保留，必须登记 owner/失效日期/退出计划。
- 文档：`09` §7.2、`10` §3 WS-F（F9）、`08-ARCHITECTURE-EXTENSIBILITY.md` §4.1、`docs/adr/0020-sketch-expressions-and-variables.md`、`ADR-G0-10`（undo）、`ADR-G0-15`（迁移契约）。
