# ADR-G0-15：Schema、Params 与 Native 迁移契约

> 状态：**Proposed under owner directive 2026-11-24; not ARB-signed**
> 日期：2026-11-24
> 决策来源：`G0-DECISION-REGISTER.md` D0-15（仍为 Proposed，未 ARB 签字）
> 关联：`ADR-G0-04-ledger-version-checkpoint.md`、`G1-EXECUTION-PLAN.md`（WS-D/WS-E）、`../research/lubancad-architecture-assessment/09-INDUSTRIAL-TARGET-ARCHITECTURE.md` §4.3、`10-ARCHITECTURE-HARDENING-PLAN.md`（E4/E5/H10）、`EXCEPTIONS.md`（X-09/X-12）、`docs/adr/0020-sketch-expressions-and-variables.md`
> 影响面：EC schema、Feature/Sketch params、native BRep/checkpoint、`PartStudioMigration`、迁移 CLI/作业、旧 `.bim` 回归语料、可复现发布与回滚
> 本 ADR 只使用公开、脱敏事实；不包含私有源码、密钥或 native 构建证据；旧 fixture 若含客户数据只能私有保存，公开仓只记录 manifest/hash。

---

## 1. 背景与约束

1. **schema/params/native 是三个不同域，当前都缺少统一的版本锚点。** `09-INDUSTRIAL-TARGET-ARCHITECTURE.md` §4.3 的目标是 EC schema 按域拆分，但 feature/sketch 的 `params` 没有 `paramsVersion`；只有变量表有 `version:1`。一旦需要重命名、改类型或删字段，就没有迁移锚点。
2. **`PartStudioMigration` 还不是生产迁移。** 当前更接近测试级探针：未接生产 RPC，且不能保证源快照一致性、源写租约、目标空断言、两阶段幂等与回滚报告。它的测试通过不等于可对真实旧库执行迁移。
3. **旧 `.bim`/params fixture 矩阵缺失。** 没有真实二进制旧库回归语料，就无法证明“新版本打开旧库仍可读、可重建、可回滚”。
4. **native 兼容矩阵缺失且存在多份 checkout。** X-12 记录存在多份 `imodel-native` checkout/zip（2.2.1/2.2.5 等），版本/provenance 不确定；native ctest 未进托管 CI（X-09）。没有 canonical manifest 与读写矩阵，native 升级无法证明旧 BRep/checkpoint 仍可打开/重建。
5. **迁移必须在不可变账本与真实 checkpoint 之上进行。** ADR-G0-04 已冻结 changeset 封账与 checkpoint 控制面；迁移不得改写历史 changeset，只能生成新的 changeset/版本或恢复为新 head。
6. **D0-15 要求**：schema/params/native 全部版本化；旧 `.bim`/params fixture；迁移 CLI dry-run/verify/rollback；单一 canonical native 与 provenance；没有回滚路径不得迁移。
7. 本 ADR 不决定 TrueForm 切换本身（由 D0-5 的独立 ADR 决定），只决定任何格式/内核迁移必须满足的契约。

## 2. 决策

### D-A 三个域全部版本化，缺版本不得写入

1. **EC schema**：每个域（如 `LubanCAD`/`LubanAssembly`/`LubanDrawing`/`LubanTab`）带独立 `schemaVersion`。任何 schema 变更必须 bump 对应域版本，并提供该域的迁移函数；additive 优先，破坏性变更采用 expansion → 迁移/回填 → contraction。
2. **Feature/Sketch params**：每个特征/草图类型在 FeatureManifest 中声明 `paramVersion`，实际 params 文本携带 `paramsVersion`。新写入不得缺少版本。
3. **Native 几何流**：`BRepData` 带 `format/kernel` 标签（D0-5），并记录写入器版本/最小读取器版本；`SolidKernel.h` 协议版本单独登记。旧 BRep/checkpoint 必须进入“写入版本 × 可读版本”矩阵。
4. **legacy 兼容**：读取到无版本 params/schema 时，按显式 legacy 适配器处理（推断为 v0/最早已发布版本），不得静默按最新版本解析。适配器必须可测试、可回退。
5. **版本升级与字段变更**：zod 默认值只能用于“新增可选字段”；重命名、类型变化、删除字段、语义变化必须走迁移函数，不得只靠默认值。

### D-B 旧库/旧参数 fixture 是发布前置

1. 回归语料必须包含**真实旧 `.bim` 二进制与 params 快照**，不能只用内存合成对象；每个受支持版本至少一份。
2. 每份 fixture 带 manifest：来源版本、schemaVersion/paramsVersion、native 版本/provenance、预期特征/元素数、体积/包围盒/关键拓扑 id、内容哈希。公开仓只记录 manifest/hash 与脱敏结论；含客户数据的 fixture 放私有受控目录。
3. 旧库验收至少覆盖：只读打开、按当前参数重建、保存/推送新 changeset、再次冷开、回滚后旧版本可读。不能只验证“能打开”而不验证“能重建”。
4. fixture 回归失败直接阻断发布；不得把失败改写成“已知差异”而不登记例外。

### D-C 迁移 CLI/作业：dry-run、verify、rollback 缺一不可

1. 迁移以**后台作业/CLI**执行，不进入读路径，不在用户打开文档时隐式迁移；读 API 不得隐式 rebuild/写事务。
2. 每个迁移至少提供：
   - `dry-run`：只读扫描，输出将迁移的文档/元素/字段、预计变更与不可迁移项；
   - `verify`：迁移后校验结构、参数、几何/重建结果与预期 fixture；
   - `rollback`：撤销迁移或恢复到迁移前状态（优先用新 changeset/版本表达，不改写历史）。
3. **幂等/可重试/可暂停**：同一迁移重复执行不产生重复数据；失败可重试；大库可暂停/继续；报告持久化（迁移 id、输入版本、输出版本、计数、失败明细、校验摘要）。
4. **源安全**：迁移前必须有源快照/备份与源写租约；迁移期间阻止并发写入；目标为空断言；两阶段提交（先写新、后切换/清理）。
5. **审计**：记录发起人、服务身份、文档、源/目标版本、dry-run 结果、实际执行结果与回滚结果；禁止无审计的批量改写。
6. **历史不可变**：迁移不得修改已封账 changeset 或既有 checkpoint 的字节/链；迁移结果以新 changeset/版本/新 checkpoint 表达（ADR-G0-04）。

### D-D 回滚是迁移的一部分；没有回滚不得迁移

1. 每个迁移必须有可执行的回滚路径：反向迁移、恢复到迁移前备份/checkpoint，或以新 changeset 表达逆变更。回滚本身也必须经过 verify。
2. 如果回滚不可行：
   - 该变更不得以“迁移”名义悄悄发布；
   - 必须单独立 ADR、登记例外、要求 HITL（预览→确认→提交+审计），并证明旧数据仍可读或有明确的不可逆声明；
   - 不得用“先备份了”替代回滚设计。
3. DB schema 迁移必须 up/down 都在隔离库验证；down 在存在新版本数据时 fail-closed，提示先导出/降级，不假装可逆。
4. native 升级回滚：保留上一版 canonical native 二进制；迁移后的 BRep/checkpoint 必须能被上一版读取，或迁移受门禁阻塞；不允许“升级后旧二进制打不开且无退路”。

### D-E Canonical native、provenance 与读写矩阵

1. **单一 canonical checkout**：建立 canonical manifest（版本、commit、digest、构建来源）；归档/删除非 canonical 副本；X-12 未关闭前不得宣称 native 版本可追溯。
2. **provenance**：发布产物记录 native 版本/commit/digest 与构建环境；`NativeLibrary.ts`/manifest 可对账；禁止手改生成产物。
3. **读写矩阵**：旧 BRep、旧 checkpoint、旧 `.bim` 在当前 native 下的可打开/可重建结果必须有矩阵与 fixture；native 升级必须同时通过旧库矩阵与 ctest。
4. **CI**：native ctest/旧 fixture 回归进入托管 CI（X-09）；未执行不得宣称“升级兼容”。
5. TrueForm 切换必须遵守同一契约：SAB 兼容、双后端一致性、迁移、回滚、provenance 全部有证据后才可启动 M1；本 ADR 不批准 TrueForm M1。

### D-F 变更门禁

任何触及 schema/params/native 的 PR/发布必须同时具备：

1. 版本 bump（schemaVersion/paramsVersion/native 版本）与迁移函数；
2. 新旧 fixture 回归（至少上一发布版本可读/可重建）；
3. dry-run/verify/rollback 证据；
4. 回滚计划与备份/快照说明；
5. 接口冻结矩阵、例外登记、发布 manifest 更新；
6. 没有回滚路径时不得合并/发布。

### D-G 不变量

| ID | 不变量 |
|---|---|
| INV-1 | 新写入的 schema/params 必须带版本；无版本只作为 legacy 读取 |
| INV-2 | 迁移不改写已封账 changeset/既有 checkpoint；结果以新 changeset/版本表达 |
| INV-3 | 每个迁移具备 dry-run、verify、rollback；缺一不得执行 |
| INV-4 | 迁移幂等、可重试、可暂停；源有快照/写租约；目标空断言 |
| INV-5 | 旧 `.bim`/params fixture 矩阵是发布前置；只读打开与重建都要验证 |
| INV-6 | 单一 canonical native + provenance；旧 BRep/checkpoint 有读写矩阵 |
| INV-7 | 迁移不得在读路径隐式触发；读 API 不写库/不 rebuild |

## 3. 备选方案

| 选项 | 内容 | 结论与理由 |
|---|---|---|
| A | 只做 additive 字段，不引入版本 | **拒绝**。只能覆盖新增可选字段；重命名/类型变化/删除无锚点，旧库最终不可维护 |
| B | 不兼容重开，旧库由用户自行导出/重建 | **拒绝**。违反旧库可读/可回滚目标；会造成不可逆数据损失与支持灾难 |
| C | 版本化 + 旧 fixture + dry-run/verify/rollback（本决策） | **采用**。满足 D0-15；成本是版本字段、语料与迁移基础设施，但可验证、可回退 |
| D | 迁移只做备份，不做 rollback | **拒绝**。备份不是回滚路径；无法验证恢复一致性，也无法在失败时快速止损 |
| E | 多 native checkout 并行，按需选择 | **拒绝**。provenance 不确定，X-12 已登记；必须单一 canonical |

## 4. 后果

**正向**

- 旧库/旧参数/旧 BRep 的可读、可重建、可回滚成为可验证契约，而不是口头承诺。
- schema/params/native 升级有统一门禁，避免“新版本打开旧库就坏”。
- fixture 与 provenance 为发布可复现、故障定位与许可审计提供基础。
- `PartStudioMigration` 的生产化有明确前置条件（快照/租约/幂等/回滚/报告）。

**负向/代价**

- 每个域都要补版本字段、迁移函数与 fixture；初期交付变慢。
- 迁移作业需要隔离环境、备份、锁与报告存储；大库迁移有窗口成本。
- native canonical 化与旧 BRep 矩阵需要构建/存储与 CI 资源。
- 支持窗口（至少上一发布版本）会限制激进清理旧代码的自由度。

## 5. 本 ADR 的实施迁移、回滚与失败判据

### 5.1 实施阶段

| 阶段 | 内容 | 退出条件 |
|---|---|---|
| P0 | 版本字段 additive（schemaVersion/paramsVersion/format-kernel 标签）；legacy 适配器 | 新写入带版本；旧无版本可读；无行为变化 |
| P1 | 旧 `.bim`/params fixture 语料与 manifest；只读打开/重建基线 | 至少上一发布版本通过；fixture 入回归 |
| P2 | 迁移 CLI dry-run/verify（只读/影子），报告持久化 | 隔离库上 dry-run 可复现；无写操作 |
| P3 | 迁移作业 apply + rollback；源快照/写租约/两阶段/幂等 | 旧库迁移后可读/可重建；rollback 验证通过 |
| P4 | native canonical manifest/provenance + 读写矩阵 + ctest CI | 单一 canonical；旧 BRep/checkpoint 矩阵通过 |
| P5 | TrueForm/SAB 迁移决策（独立 ADR） | 双后端一致性/迁移/回滚/provenance 证据齐备 |

开关建议：`MIGRATION_MODE=off|dry-run|apply`（实施时登记配置清单）；默认 `off`，`dry-run` 可在生产只读环境运行，`apply` 必须绑定迁移 id 与备份/快照。

### 5.2 回滚

| 层 | 回滚方式 | 数据影响 |
|---|---|---|
| 版本字段 | additive 字段保留；关闭读取强制；legacy 适配器继续工作 | 不删除已写版本；旧代码忽略未知字段 |
| fixture/读取 | 回退应用版本；旧 fixture 仍可读 | 无数据改写 |
| 迁移作业 | 反向迁移或恢复迁移前备份/新 changeset 逆变更 | 不修改已封账历史；回滚报告入库 |
| native | 恢复上一版 canonical 二进制；保留 provenance | 迁移产物须可被上一版读取，否则不得升级 |
| schema DB | up/down 迁移；down 在新版本数据存在时 fail-closed | 先导出/降级，不假装可逆 |

回滚不得以删除旧库、清空历史或改写 changeset 为代价；dirty/迁移中的文档必须先暂停作业并保存报告。

### 5.3 失败判据

1. 新写入的 feature/sketch params 缺少 `paramsVersion`，或 schema 变更未 bump 域版本。
2. 迁移没有 dry-run、verify 或 rollback 中任一项；或 rollback 未验证就宣称可回滚。
3. 迁移修改已封账 changeset/既有 checkpoint，或绕过 ADR-G0-04 的封账链。
4. 迁移非幂等/不可重试/不可暂停；无源快照/写租约/目标空断言；迁移在读路径隐式执行。
5. 旧 `.bim`/params fixture 矩阵缺失，或只用内存合成数据；旧库只能打开不能重建。
6. 存在多份 native checkout / 无 provenance；native 升级没有旧 BRep/checkpoint 读写矩阵。
7. 新版本打开旧库后不可读/不可重建，且无可用回滚。
8. 把测试级 `PartStudioMigration` 当生产迁移使用，或没有源快照保证就批量迁移。
9. 迁移报告/审计缺失，或失败被改写成“已知差异”而未登记例外。

## 6. 证据状态

- **公开事实**：`09-INDUSTRIAL-TARGET-ARCHITECTURE.md` §4.3 记录“当前只有变量表有 `version:1`，feature/sketch 的 `params` 没有版本锚点”；`PartStudioMigration` 只是测试级探针，未接生产 RPC，且不保证源快照；旧 `.bim`/params fixture 与 native 可读矩阵缺失。
- **native**：X-12（多份 checkout）、X-09（native/feature 未进托管 CI）均 open；没有 canonical manifest 或旧 BRep 读写矩阵证据。
- **G1 状态**：`G1-WAVE2-STATUS-2026-11-23.md` 的 WS-E 明确 E1/E2/E8 未完成；E4/E5（迁移）未列入已完成项。ADR-G0-04 的账本/checkpoint 控制面不等于 params/schema/native 迁移完成。
- **测试边界**：`docs/adr/0001-itwin-imodel-data-model.md` 记录 `PartStudioMigration` 的测试通过，但测试通过不构成生产迁移/旧库 fixture 证据。
- **缺失/不得宣称**：没有 `paramsVersion` 实现证据、没有旧 fixture 矩阵、没有迁移 CLI dry-run/verify/rollback 真栈证据、没有 canonical native provenance、没有 TrueForm/SAB 迁移证据；本 ADR 未获 ARB 签字。不得宣称旧库迁移已完成或 G1 迁移门已通过。

## 7. 关联与未决

- `G0-DECISION-REGISTER.md` D0-15、`G0-EXECUTION-PLAN.md` §4。
- `ADR-G0-04`（changeset 封账、checkpoint/版本、迁移不改历史）。
- `ADR-G0-05`（几何持久化/TrueForm，独立 ADR）与 `09` §9、`10` H10。
- `G1-EXECUTION-PLAN.md` Sprint 3 E3/E4/E5、`G1-WAVE2-STATUS-2026-11-23.md`。
- `EXCEPTIONS.md` X-09（CI）、X-12（native checkout/provenance）。
- `docs/adr/0020-sketch-expressions-and-variables.md`（变量版本与迁移）。
- 未决：支持窗口（至少上一发布版本，是否扩到 N-2）；paramsVersion 的存储形态（每元素字段 vs 文档级注册表）；native 读写矩阵的版本粒度；`PartStudioMigration` 生产化的源快照/租约/回滚实现；TrueForm M1 的迁移与双后端一致性方案。

---

**关联**：`ADR-G0-04-ledger-version-checkpoint.md`、`ADR-G0-09-session-process-model.md`、`G0-DECISION-REGISTER.md`、`G1-EXECUTION-PLAN.md`、`EXCEPTIONS.md`、`../research/lubancad-architecture-assessment/09-INDUSTRIAL-TARGET-ARCHITECTURE.md`。
