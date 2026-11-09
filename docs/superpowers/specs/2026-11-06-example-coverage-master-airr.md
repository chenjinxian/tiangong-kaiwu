# AIRR — Onshape 示例全量覆盖与草图/特征能力建设

- 标题：Onshape 示例全量覆盖与草图/特征能力建设
- 日期：2026-11-06
- Owner：平台团队（LubanCAD）
- 关联需求：基于私有 Onshape parity 语料，把所有可由原始草图/原生特征复刻的 Part Studio 在 luban-cad 中实现；覆盖多文档、多 Part Studio、多 body/part，并补齐所需草图/特征/UI。
- 预计影响仓：`tiangong-kaiwu`（public web/docs/e2e）、私有 `luban-backend`、私有 `onshape-parity-data`；必要时 `imodel-native`。
- 是否需要 ADR：**是**。新增/变更 FeatureOp、sketch DTO、scenario v1 字段、示例 registry 契约分别走 ADR-0003/0004/0005/0006 的增量；本 AIRR 只批准测试/数据/回放基础设施，不直接批准新的产品 FeatureOp。

---

## 1. 目标与验收

### 目标

1. 把已采集的 Part Studio 变成机器可读的示例宇宙：每条有唯一分类、证据、特征/草图签名、逐 body 体积与阻塞原因。
2. 每个可复刻 PS 都有持久 iModel（一个 Onshape 文档 = 一个 iModel，多个 Part Studio = 多个 B-mode scope/页签）、真实特征链、可重开、可回放演示。
3. 按解锁价值实现缺失的草图/特征能力与 UI；不以示例为由绕过 `LubanFeatureRpcInterface` FeatureOp、事务或标准工具生命周期。
4. 对 import/装配/自定义 FeatureScript/钣金等不可复刻或非原生轨道，明确 `excluded-*`/`blocked-*` 并保留证据，不伪造通过。

### 验收（对每个 PS）

- `geometry/constraints/ui/persist` 四维状态；`overall=complete` 仅四维全 complete。
- 特征树类型/顺序/status=0 与 scenario/Onshape 一致。
- 多 body：body 数一致，逐 body nominal 体积（`massproperties.per-part.json.bodies[key].volume[0]`）在容差内；不得用聚合体积替代。
- 草图：实体/约束 kind 与数量、DOF/solve 状态与采集证据一致；未实现约束必须 `blocked-capability`。
- 推送 changeset 成功，重开同一 iModel/PS 后树/体/体积一致。
- 演示 manifest 记录每步截图、UI/RPC 标记、scenario hash、验证时间；blocked PS 有 blocker/证据。

### 非目标（本计划）

- 不实现通用 Documents 文件夹后端/嵌套 iTwin 层级；示例目录层级只进生成式 catalog/index。
- 不复刻 Assembly/Drawing 本身；只复刻文档内独立 Part Studio。
- 不解析/模拟任意自定义 FeatureScript。
- 首批不实现钣金完整引擎；相关 PS 标 `blocked-sheet-metal`，Wave 4 单独 triage。
- 不新增第二套建模 API、选择状态机、渲染平台或产品 RPC。

## 2. 现状证据

- 526 发现文档；476 有 PS；API PS 1685；磁盘 PS 目录 1470；有 features 的 PS **227**（2026-11-07 index 实测）；48 个 features-complete 文档。
- 145 个 PS 有 per-body mass（145 complete），91 个有 parts；85/145 可测 PS 为 multi-body，最大 146 body。
- 严格分类（2026-11-07 index 刷新，含内核阻塞登记 + 产品 FeatureType 真相）：**2 个 `replicable-now`**、**29 个 `blocked-converter`**、**21 个 `blocked-capability`**、1294 个 `blocked-evidence`、1 个 `blocked-kernel`（Gaiter Fillet 1）、18 个 `blocked-sheet-metal`、69 个 import、21 个 custom、10 个 specialized、5 个 empty；`verify-example-index` ok（0 errors / 5 warnings）。
- 转换器当前 1 complete / **17 geometryComplete** / 6 smoke / **77 blocked** / **50 failed** / 48 skipped（2026-11-07 manifest；精确贝塞尔样条转换后 failed 53→50、geometryComplete 16→17；failed 归因见连续计划「converter 失败/单 blocker 复查」）。
- 现有 12 个示例 iModel 是单 PS legacy；`verify-imodels.spec.ts` 曾硬编码 UUID 且只校验聚合体积。**2026-11-08 已重写为 state.json 驱动**：每 document 一条 test（失败隔离），逐 scope 校验树/status/active body 数/体积，state 缺失 fail closed；`verify-registry.spec.ts` 负责静态 registry 期望。Part Studio 多页签/多 scope 已由 B registry 支持。
- `opDsl.ts` 白名单漏 `hole`/`cPlane`；已在本 AIRR 的执行切片中修复并加测试。
- 公共仓 `dist-backend` 产物可能是 shared 1.21；真栈前必须做版本握手。

详细数据索引与报告在私有仓：
`manifest/example-index.json`、`manifest/example-index.validation.json`、`manifest/selector-matrix.json`、`docs/EXAMPLE-COVERAGE.md`。

## 3. 复用决策矩阵

| 能力 | 复用 | 决策 | 理由 |
|---|---|---|---|
| 特征写入 | `LubanFeatureRpcInterface` / FeatureOp | 复用，仅扩展字段/类型 | P0-05 单一建模管道 |
| 草图事实源 | `params`（entities+constraints+plane） | 复用 | P0-06；`sketches.json` 只有几何/solve，缺 constraints |
| 多 Part Studio | B registry `list/create/rename/deletePartStudio` + `?model=` | 复用 | 已真实可用，不新建页签机制 |
| 示例 iModel | `ensureSeedProject`/`ensureExampleImodel`/`openBModelEditor` | 扩展 | 保留 12 个 legacy，新增 document 级 |
| 场景回放 | `scripts/onshape-parity/*` + `e2e/helpers` RPC | 扩展 | scenario 是测试契约，不是产品 API |
| 边/面选择 | `resolveEdgeRef`/`resolveFaceRef` + 现有 selection authority | 扩展 semantic resolver | 不新增 RPC；CAP_EDGE 已存在 |
| 演示 | `demoShot`/`Playwright` | 扩展为 registry/state 驱动 | 消除手写 UUID/manifest |
| 示例索引 | 私有 corpus 脚本 | 新建 | 数据调度与公共 registry 分离 |
| 内核 | 真形（TrueForm）经 `SolidKernel.h` | 只通过私有后端 | 不在 public 仓接线 |

## 4. 架构裁决

1. **一个文档 = 一个 iModel；一个 PS = 一个 B-mode scope/页签**。新示例按 document 建；legacy 12 个保留 `layout: legacy`，能在原 iModel 补页签的原地升级，不破坏性删除。
2. **静态 registry / 运行态 state 分离**。`e2e/examples/registry.json` 描述要建什么；`demo-artifacts/examples/state.json` 记录实际 project/iModel/scope/changeset/体积/错误；reopen verifier 只读 state。
3. **blocked PS 不建空 scope**；文档状态取所有 PS 最差状态。
4. **翻译器只产 FeatureOp**。精确草图可 RPC 复原且在演示中标注；特征优先真实 UI；不支持的步骤抛 `BlockedError`，不静默跳过。
5. **selector 不新增产品 RPC**。语义 selector 在 e2e resolver 层解析；无法解析标 `blocked-selector`，不默认 region 0。
6. **转换器自证完整**：raw-vs-scenario 交叉校验；raw 有几何特征而 scenario 丢失时该 PS 标 `blocked-converter`，禁止用 dropped scenario 对拍体积。
7. **数据边界**：原始 features/截图/坐标/cookie 只留私有仓；public registry 只含脱敏 id/名称/期望/状态/路径引用。

## 5. 跨仓影响

| 仓/层 | 本 AIRR 首切片 | 后续 FeatureOp 变更 | 测试/发布 |
|---|---|---|---|
| shared | `opDsl` hole/cPlane 白名单；registry 类型在 e2e（非 runtime） | ADR-0004/0005/0006 增量 + minor bump | shared test + 双端同发布 |
| web | e2e registry/replay/verifier；DocumentDetails 多 PS 导航 | 新 channel/dialog/preview | vitest + 真栈 e2e |
| viewer/editor | 不改首切片 | 仅选择/装饰扩展 | 重建 dist 后回归 |
| backend（私有） | 版本握手；新 feature evaluator | 按 feature 类型逐个 ADR | StandaloneDb + 真栈 |
| native | 不改 | 仅当内核能力缺口 | ctest + 下游 |
| parity-data（私有） | coverage/index/selector/report | 继续采集 | 不 commit/push（用户指令） |

## 6. 数据/事务/安全

- 事实源：iModel/BIS + FeatureOp `params`；不新增几何流事实源。
- 所有写操作走 `BriefcaseTxns`/`saveChanges`；示例构建走真实 UI + 标准 RPC；`EXAMPLE_RESET` 是显式测试重置。
- 写租约：一个 iModel 一个 lease；多 PS 复用；blocked PS 不建 scope。
- 密钥/日志：不采集/不写入 Cookie/XSRF/token；采集脚本只走已登录 CDP 页签。
- 数据仓：采集数据/证据不入公共仓；public registry 发布前扫描 raw features/截图/token/绝对私有路径。
- 证据完整性：index 记录 source files + sha256 + collectedAt；体积 nominal 规则固定为 `volume[0]`。

## 7. 测试与证据

- 数据 plane：`node tools/index-examples.mjs`、`verify-example-index.mjs`、`analyze-selectors.mjs`、`report-example-coverage.mjs`；索引可重复生成。
- 契约：shared opDsl 白名单/往返（已加 hole/cPlane）；scenario schema/validator 单测。
- 回放：translator/selector 单测（简化 fixtures）；多 PS dry-run；B0 legacy 12/12。
- 真栈：registry 驱动 build + `verify-registry.spec.ts`；每能力合成 + 一个真实示例；多 body 逐 body 对拍。
- 视觉：每个新特征对话框按 Onshape live 证据截图对照；无证据不宣称 UI 对齐。
- 性能：146 body/39 PS 文档分别做打开/切换/推送基线；超预算拆批而非放宽断言。
- known-red：现有 `sketch-extrude` 保持登记，不放宽/删除断言。

## 8. 风险与回滚

| 风险 | 缓解 | 回滚 |
|---|---|---|
| 后端产物陈旧/版本不符 | 1.0 版本握手 fail closed；批次前 fetch/verify-stack | 停批，回退该批次；不降 shared 断言 |
| 大模型/多 PS 超时 | dry-run + 性能基线 + 分批 | 保留已建 scope，删除未完成批次重跑 |
| selector 不可解析 | taxonomy + resolver + `blocked-selector` | 该示例 blocked，不默认 region 0 |
| 转换器假完整 | raw-vs-scenario 校验 | 回退 scenario；标 blocked-converter |
| UI/特征规模失控 | 按 unlock 数排序；无证据不新增控件 | 翻回 gated，保留 contract/backend |
| 数据配额 | `--reserve`/429 停止，采集不阻塞实现 | 等 retry-after 后续跑 |
| 公私边界 | 发布扫描拒绝 raw/token/截图 | 移除越界文件，改私有注入 |

## 9. 首切片（本次实施）

1. 私有仓：coverage 去重/对账；`example-index.json`；validation；selector matrix；coverage report；arc 保真 + quantity 表达式修复。
2. public：`opDsl` hole/cPlane 白名单 + 测试；locale hole；AIRR 本文件。
3. 已落地基础设施：registry 类型/加载器/JSON、多 PS helpers、scenario→FeatureOp translator、RPC runner、state/demo session、生成式 gallery、registry-driven verifier。
4. 首个 document 级多 PS 示例：`Exercise: Element Organization`（O-Ring sketch+revolve / Bushing sketch+extrude，2 页签、2 bodies，重开 2/2）；Bushing imprintFace 明确按 region 0 近似。
5. B0 legacy：11/12 重开绿；Sample Assignment 为 known-red（iModel 特征链不完整，重建 UI Extrude 1 时 RPC 15s 超时），不以放宽断言掩盖。
6. 已落地 W1.0 边选择器切片（2026-11-06）：converter CAP_EDGE/SWEPT_EDGE +
   相邻实体端点消歧；backend 圆弧/扫掠边解析；public e2e dev-only 只读边枚举 +
   `resolveEdgeRef`。证据：converter 9/9、backend matcher 7/7、ScenarioReplay 11/11、
   `e2e/examples/edge-selector.spec.ts` 合成圆盘倒角 770.737 mm³（setup+test 2 passed）。
   真实 iOS/Hand Brake 探针受 imprintFace/revolve region 0 阻塞（非边选择器）。
7. T3 参数化 Shell UI 已落地（官方帮助页证据；`ShellDialog` + 真栈
   `e2e/shell.spec.ts` 2 passed，1084.000 mm³；Hollow 无契约不渲染假控件）。
8. 下一执行切片：T4 imprintFace/面域解析（解锁 iOS、Hand Brake、Stirrup 真实示例）
   + extrude variants。

## 10. 批准记录

- 用户 2026-11-06 审批总计划（`C:\Users\24389\.claude\plans\gleaming-prancing-riddle.md`）。
- 本 AIRR 与总计划同源；新增 FeatureOp/schema 仍须独立 ADR 与 shared 版本 bump。
