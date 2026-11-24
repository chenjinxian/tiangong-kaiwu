# ADR-G2-01：单一 Feature Manifest 与 `paramsVersion`

> 状态：**Proposed under owner directive 2026-11-24; not ARB-signed**
> 日期：2026-11-24
> 关联：`G2-CONTRACT-FREEZE-PLAN-2026-11-24.md` C1、`G2-SPIKES-2026-11-24.md` S-G2-01、
> `G0-GATE-REPORT-2026-11-24.md`、`INDUSTRIAL-READINESS-PROGRAM-2026-11-24.md` W7、
> `09-INDUSTRIAL-TARGET-ARCHITECTURE.md` §7.1、`10-ARCHITECTURE-HARDENING-PLAN.md` WS-F、
> `08-ARCHITECTURE-EXTENSIBILITY.md` §4.3、`ADR-G0-15-migration-contract.md`、
> `EXCEPTIONS.md` X-11。
> 影响面：`@luban-cad/shared` Feature 契约、后端 FeatureTypeRegistry/zod、opDsl、
> 表单模型、ribbon/capability、AI tool spec、旧 `params` 兼容、CI 契约门、双端发布。
> 本 ADR 只使用公开、脱敏事实；不包含私有源码、密钥或 native 构建证据。

---

## 1. 背景与当前事实

1. **类型与 DSL 已漂移。** `LubanFeatureType` 当前有 21 个类型
   （`extrude/booleanAdd/booleanSubtract/fillet/chamfer/shell/revolve/loft/sweep/mirror/
   pattern/featurePattern/featureMirror/booleanBodies/hole/cPlane/faceExtrude/transform/
   splitPart/moveFace/draft`），而 `opDsl.FEATURE_TYPES` 只有 20 项，缺 `draft`。
   结果是产品已支持的 `draft` 经 DSL 解析会报“未知 featureType”。
2. **契约不是单一来源。** 同一个 FeatureType 至少跨 9+ 手写注册点：
   shared 的 `LubanFeatureType`/`FeatureParams` 联合、后端 zod schema、
   `FeatureTypeRegistry`、`FeatureFormField[]`、`opDsl.FEATURE_TYPES`、
   `opDsl.test.ts` 的 `ALL_FEATURE_TYPES`、UI ribbon、capabilities、`FeatureDialog`
   分支、图标/i18n/树/测试等。新增类型必须逐点同步；漏一处不会在同一处暴露。
3. **编译期穷举不可靠。** `packages/shared/tsconfig.json` 为 `strict:false`；主 tsconfig
   排除 `src/**/*.test.ts`，`tsconfig.test.json` 只 include 两个测试，
   `opDsl.test.ts` 不在默认 typecheck 中。`Record<LubanFeatureType,true>` 的穷举
   因此既不受 strict 约束，也不一定进入 `test:types`。
4. **`params` 没有版本锚点。** `FeatureTreeEntry.params` 是 `unknown`，特征 params 是
   不透明 JSON；没有 `paramsVersion`（只有变量表有 `version:1`）。一旦需要重命名/改类型/
   删字段，只能靠“只加可选字段 + zod 默认”维持旧库，无法 dry-run/迁移/回滚。
5. **表单模型不完整且未被前端消费。** `FeatureFormFieldKind` 只有
   `number|json|boolean|edgeRefs|faceRefs|readonlyText`；没有单位、枚举/select、默认值、
   min/max、条件显示、分组、帮助/i18n。`getFeatureFormModel` 在前端零消费，UI 仍按
   featureType 写专用表单。
6. **版本信息与运行时脱节。** `LubanFeatureRpcInterface` 已到 `1.85.0`，而
   `@luban-cad/shared` 包版本仍是 `1.0.0`；没有机器可读的 manifest hash、没有运行时
   握手；`contract-freeze.json` 只冻结顶层导出的 token stream，不覆盖 manifest/生成物。
7. **这不是“重构一下类型”的问题。** 只要继续按现状加特征，9+ 注册点、DSL 覆盖、
   form 漂移、params 迁移会一起放大；而 G2 的目标是让扩展成本可预测，不是先做更多类型。

---

## 2. 决策

### 2.1 单一机器可读 Manifest 是 FeatureType 的唯一事实源

每个 FeatureType 由一份 manifest 条目声明，至少包含：

```text
FeatureManifest {
  type, paramVersion,
  paramsSchema, formSchema,
  inputs[] {role,type,required,multiplicity},
  outputs[] {portId,kind,cardinality},
  structuralKeys[],
  evaluatorKey,
  preview: none|shadow,
  risk: safe|destructive,
  hitl: none|preview+confirm,
  toolSpec, aiSpec, capability, i18nKey, tests[]
}
```

约束：

1. **`type` 与 `LubanFeatureType` 全等**：21 类型逐一有 manifest；新增类型必须先有条目，
   不允许先写手写 union/UI。
2. **`paramVersion` 必填**：每个类型独立版本；`paramsSchema` 必须是该版本的 schema；
   迁移函数/钩子按 `(type, fromVersion → toVersion)` 登记。
3. **`inputs/outputs` 是声明而非执行器**：本 ADR 只冻结声明与兼容语义；完整 DAG 执行器
   见 ADR-G2-02 与后续图执行器 ADR，不在本 ADR 内实现。
4. **`structuralKeys` 显式**：目标 body、草图/源特征、面/边引用、boolean targets/tools
   等结构键，编辑时只读或按契约处理；不得由 evaluator 隐式读取缓存。
5. **`capability/toolSpec/aiSpec/i18nKey/tests` 进入 manifest**：能力档位、命令参数、
   AI 工具规格、i18n 键和测试清单不再各自手写。

### 2.2 由 manifest 生成/校验契约面

至少覆盖以下产物；生成或由 manifest 校验，二者选其一但必须有唯一来源：

1. TypeScript 类型：`LubanFeatureType`、`FeatureParams` 联合/各 Params 类型。
2. 后端 zod schema（或等价运行时校验）与 `FeatureTypeRegistry` 元数据。
3. `opDsl` 的 `FEATURE_TYPES` 白名单（含 `draft`）与 DSL 往返测试清单。
4. `FeatureFormModel`/`formSchema`（字段类型、单位、默认值、枚举、条件、校验）。
5. ribbon/capability/命令/AI tool spec 的元数据（与 `CommandRegistry` 的最终形态对接；
   在 CommandRegistry 冻结前，生成物可作为其输入）。
6. i18n 键、图标/分组元数据、测试清单。

**禁止**：生成物被手改；同一语义在 manifest 与手写文件各写一份；用 CI “比对”代替
单一来源（CI 只能作为过渡门，不能成为长期第二事实源）。

### 2.3 `paramsVersion` 与迁移

1. **持久化**：新写入的特征/草图 params 必须携带 `paramsVersion`（字段位置由实现决定，
   但必须在 params 文本内且可被旧代码忽略）。
2. **旧数据**：缺 `paramsVersion` 的旧行按 **legacy 1** 解释；读取路径报告
   `legacy/absent`，不得假装已迁移。
3. **未知版本**：高于当前支持版本的 params **fail-closed**，返回稳定错误；不得按当前
   schema 猜测、不得静默丢字段。
4. **迁移**：按 manifest 的 `(type, version)` 迁移函数执行；支持 dry-run/verify/rollback；
   默认不批量改写；旧 `.bim`/params fixture 进入回归。
5. **与 ADR-G0-15 对齐**：schema/params/native 三域分别版本化；本 ADR 只负责 feature/
   sketch params 的 manifest 锚点，不替代 schema/native 迁移。

### 2.4 严格类型、生成门与运行时握手

1. **strict**：覆盖 Feature 契约与 opDsl 的 shared 文件必须 `strict:true`（可先按文件
   开启，最终目标为 shared 全 strict）；`opDsl.test.ts` 必须进入 `test:types`。
2. **全等门**：CI 检查 `LubanFeatureType`、manifest、opDsl、registry、form/capability
   集合全等；`draft` 必须在列；任何漏同步阻断合并。
3. **生成物漂移门**：CI 重新生成到临时目录并 diff；非零 diff 阻断。
4. **运行时握手**：客户端连接时校验 `interfaceVersion` + `manifestHash`；不匹配时
   fail-closed 或降级到只读，不得静默继续。包版本与 interfaceVersion 必须对齐；
   `contract-freeze.json` 增加 manifest hash（工具扩展单独 PR）。
5. **双端发布**：shared → backend → web 同批；禁止 npm registry 替换 `link:`；
   生成物/契约版本进入 release manifest。

### 2.5 采用顺序（只冻结契约，不铺功能）

1. **Manifest v0**：21 类型覆盖，先 dry-run；不改 UI 行为。
2. **修 `draft`、strict、opDsl 全等**：这是 G2 最低门槛，不是“顺手优化”。
3. **生成物 shadow**：生成物与手写面并行，diff 必须可解释；逐步替换手写源。
4. **单特征 pilot**：选一个简单特征（如 extrude blind 或 hole）由 manifest 驱动表单/
   DSL/AI spec，对拍旧 UI；无回归后才扩到其它类型。
5. **新特征门禁**：Manifest 未冻结前，不得新增 FeatureType；已有类型不得继续增加手写
   注册点。

### 2.6 本 ADR 不做什么

- 不实现 DAG/图执行器、FeatureRow 持久布局、多输出执行。
- 不实现完整 FormRuntime widget API、不替换现有 UI。
- 不重写后端 evaluator/FeatureService；只要求其消费 manifest 元数据。
- 不做 params 全量迁移；只定义版本锚点与旧行兼容。
- 不新增 FeatureType。

---

## 3. 备选方案与拒绝理由

| 方案 | 内容 | 结论 |
|---|---|---|
| A | 保持手写多清单，只加 CI 比对 | **拒绝**：CI 只能发现漂移，不能消除 9+ 注册点；生成物/手写双源仍在；新类型成本不降。 |
| B | 以 zod schema 为唯一来源，反射生成 TS/DSL/表单 | **拒绝（作为唯一方案）**：zod 表达表单/能力/AI/结构键/迁移能力不足；可作为 manifest 的运行时校验实现，但不做唯一来源。 |
| C | 运行时反射现有 registry，不生成类型 | **拒绝**：编译期类型/DSL 白名单/表单需要静态产物；运行时反射不能阻止漏类型。 |
| D | 只由后端 manifest 生成，前端消费远程 schema | **拒绝**：离线/旧客户端/构建期类型无法保证；跨仓契约必须可版本化、可在构建期校验；远程 schema 可作补充，不作唯一源。 |
| E | 先修 `draft`/strict，不做 manifest | **拒绝**：只修表面漂移，9+ 注册点仍在；下一批特征继续返工。 |
| F | 全量迁移所有 params 后再冻结 | **拒绝**：成本/风险过大，且 G2 不需要全量迁移；additive 版本 + 旧行 legacy 足够先冻结。 |
| G | 本决策：manifest + 生成/校验 + paramsVersion + strict/握手 | **采用**：直接消除多事实源，保留旧数据兼容与回滚；执行器/表单实现可后置。 |

---

## 4. 后果与风险

**正向**

- 新增 FeatureType 的目标改动点降到 manifest + evaluator（+ 可选 UI 扩展），不再横跨
  9+ 手写面。
- `draft`/DSL/表单/能力/AI spec 的漂移有单一来源与 CI 门；AI 生成整链不再“假全类型”。
- `paramsVersion` 为旧库迁移/回滚提供锚点；旧数据不需要先全量重写。
- strict + 运行时握手让源码/产物/客户端版本漂移可发现。

**代价/风险**

- manifest schema 需要一次设计成本；过度设计会拖慢 21 类型覆盖。
- 生成器/模板/CI 漂移门是新工程资产，需要维护；生成物不能手改。
- 旧后端/旧客户端可能忽略 `paramsVersion`；未知版本必须 fail-closed，存在兼容窗口。
- `strict:true` 可能暴露大量既存类型错误；必须先修/登记，不能靠 `any` 放水。
- 运行时握手会让版本不匹配的旧客户端直接失败；需要发布列车与灰度。
- manifest 不能替代执行器；如果只做 manifest 不改输出/拓扑，单输出假设仍会返工
  （见 ADR-G2-02）。

---

## 5. 迁移、回滚与失败判据

### 5.1 迁移

1. **Manifest 文件 additive**：新增机器可读 manifest；不删除旧手写文件，先生成/校验。
2. **旧 params**：缺 `paramsVersion` 按 legacy 1 读；新写入带当前版本；不对旧行批量
   回填。读取面暴露 `legacy/absent`。
3. **旧 DSL**：20 类型旧文本逐字往返；补 `draft` 后可解析；未知类型仍拒绝。
4. **生成物**：先生成到临时目录并 diff；shadow 阶段由开关选择生成物/手写物；enforce
   阶段切换为生成物。生成物必须可重复生成（同输入同字节/hash）。
5. **发布顺序**：shared（类型/DSL/manifest）→ backend（zod/registry）→ web（form/
   ribbon/capability/AI spec）同批；版本 bump + 双端 PR；release manifest 记录 hash。
6. **旧 fixture**：无版本 params、旧 DSL、旧 `.bim` 的 feature 行必须进入回归；公开仓
   只记录 manifest/hash 与脱敏结论。

### 5.2 回滚

1. `FEATURE_MANIFEST_MODE=off`：回到旧手写产物/旧 DSL 白名单；manifest 与生成物保留但
   不再消费。
2. `FEATURE_PARAMS_VERSION_MODE=off|shadow|enforce`（建议名，实施时登记配置清单）：
   off 按旧行为读无版本 params；enforce 才拒绝未知版本；回滚不删除已写入的
   `paramsVersion` 字段（旧代码应忽略）。
3. 运行时握手可降级为“记录不匹配 + 只读”，不得在回滚时伪造版本。
4. 回滚不批量改写旧 params、不删除旧 DSL、不删除旧手写注册点；回滚后旧库必须可读。

### 5.3 失败判据

出现任一情况，本决策失败，Manifest 不得标记冻结：

- 21 类型不能全部表达；`draft` 仍不在 opDsl；DSL 仍不可生成 `draft`。
- 生成物必须手改才能与现有面一致；或 manifest 与手写文件仍是双事实源。
- `shared` 契约文件仍 `strict:false`，或 `opDsl.test.ts` 仍不在 typecheck。
- 无 `paramsVersion` 或缺省/未知版本语义未实现；旧 params 不可读。
- 运行时握手缺失，源码/产物版本漂移无法阻断。
- 新增 FeatureType 仍跨 9+ 手写点；或为了“覆盖 21”伪造 manifest 条目/空 schema。
- S-G2-01 未通过就宣称 Manifest 冻结。

---

## 6. 证据状态

| 项目 | 状态 | 说明 |
|---|---|---|
| 21 类型清单 | **已确认（源码）** | `LubanFeatureType` 21 项 |
| opDsl 全等 | **未通过** | 当前 20 项，缺 `draft` |
| 单一 manifest | **未实现** | 公开树无机器可读 manifest/生成器 |
| 9+ 注册点 | **存在** | shared/后端/registry/form/opDsl/ribbon/capabilities/Dialog/图标/i18n/测试 |
| `paramsVersion` | **未实现** | `FeatureTreeEntry.params: unknown`；无版本字段 |
| shared strict | **未通过** | `packages/shared/tsconfig.json` `strict:false` |
| `opDsl.test.ts` typecheck | **未覆盖** | `tsconfig.test.json` 未 include |
| 运行时握手 | **未实现** | `INTERFACE-FREEZE-MATRIX` 记录缺失 |
| S-G2-01 | **Not run** | 本文件不宣称通过 |
| ARB 签字 | **无** | 本 ADR 仍为 Proposed |

> 本 ADR 不把规划、生成器草案、私有 registry 或未执行 Spike 写成“已通过”。在 ARB 签字与
> S-G2-01 证据齐备前，不得把 Manifest 描述为已冻结/已生成/已覆盖全部类型。

---

## 7. 签字与状态

- 拟制依据：业主 2026-11-24 指令（G2 预冻结文档包，先契约后代码）。
- 当前状态：**Proposed under owner directive 2026-11-24; not ARB-signed**。
- 签字栏（待）：

| 角色 | 姓名 | 日期 | 结论 |
|---|---|---|---|
| Architecture owner | | | |
| Feature owner | | | |
| Backend/contract owner | | | |
| Frontend owner | | | |
| QA/CI owner | | | |

## 8. 关联

- 计划：`G2-CONTRACT-FREEZE-PLAN-2026-11-24.md` C1、阶段 1。
- Spike：`G2-SPIKES-2026-11-24.md` S-G2-01。
- ADR：`ADR-G0-15`（迁移契约）、`ADR-G2-02`（输出/拓扑/选择）、`ADR-G2-04`
  （CommandRegistry/session）。
- 其他：`INTERFACE-FREEZE-MATRIX.md`、`contract-freeze.json`、`EXCEPTIONS.md` X-11。
- 未决：manifest 存储形态（shared JSON vs 后端生成）、生成器实现语言、`paramsVersion`
  的位置（每元素字段 vs 文档级注册表）、旧客户端兼容窗口、formSchema 的字段集合。
