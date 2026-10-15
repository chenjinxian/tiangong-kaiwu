# RW2 CAD 核心收敛实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 收敛两套建模心智（D7 打标隔离带）+ op DSL v1（文本真相源雏形）+ 特征类型扩展第一批（chamfer/shell 特征化，revolve/pattern 定案）+ 顺手清债四件 + RW1 遗留三件接线。

**Architecture:** 直改工具经 fork EditBuiltInCommand 的 DI 挂钩打标 BodySolid jsonProperties（零 schema 演进）；op DSL 与 zod 注册表/FeatureFormModel 三方同源共享元数据；特征扩展走 FeatureTypeRegistry + evaluate*Async 镜像 fillet 范式；引擎硬编码判型泛化为注册表驱动。

**Tech Stack:** TypeScript + vitest（本仓）/ jest（私有仓）；zod 4；iTwin.js editor 通道（31-op 协议）。

**Spec:** `docs/superpowers/specs/2026-10-15-platform-architecture-design.md`（RW2 节 + A5/A6 裁定）

## Global Constraints

- **RW1 已收官**（本仓 main + 私有仓 feat/rw1-security-gateway 合并基线）；RW2 在其上开工
- 勘察实证事实（计划的契约基线）：
  - D7 打标载体=BodySolid `jsonProperties`（ElementProps.jsonProperties，须 JSON 字符串）；DI 挂钩仿 `bindFeatureEngine`（LubanCadSchema.ts:94）；写点四方法（EditBuiltInCommand.ts:40/59/82/121 + SolidModelingCommand writeChanges :855-881）
  - op DSL：FeatureOp 判别联合 10 分支（LubanFeatureRpcInterface.ts:35-45）；判别键=featureType（非 kind）；zod v4.6.5 `z.toJSONSchema` 可用；默认值坑（propagateSmooth .default(true)——发射端恒写全 schema 键）
  - 特征扩展：同步通道 runKernel→createBRepGeometry（Hollow7 仅全露面均匀壳化）；异步通道 evaluateFilletAsync 范式（EvalCarrier scratch）；chamfer→Chamfer=25（复用 resolveEdgeRef 零新码）；shell→HollowFaces=19（需新 resolveFaceRef）；revolve→SpinFaces=21（异步+轮廓→片体造形问题，中工作量）；pattern→无内核 op（最深，背负两笔债）
  - 引擎硬编码判型 4 处（FeatureEngine.ts:350/365/422/499 的 `"fillet"===`）必须泛化注册表驱动
  - UndoManager 假成功病灶：探测不存在方法后无条件 success=true；真 API 在 connection.txns（reverseSingleTxn/reinstateTxn/isUndoPossible async）
  - PatternCommand 死码应删非注册（RW1 先例；注册=新增绕开特征系统的写面）
  - deleteSketch 四件：shared 加 op 分支+interfaceVersion 1.3.0+重生成 drift 门；FeatureService 校验分支+applyDeleteSketch（守卫：被任一特征引用即拒收）+previewOp 镜像分支；oplog 非 invertible
- 官方客户端源码强制参考（D:\Github 七检出）
- pnpm 一律 corepack pnpm@10；私有仓 link: 禁 pnpm add
- 提交格式：`类型(scope): 中文描述（RW2-Tn）` + trailer；存量 lint 触碰面零新增
- fork 修改（EditBuiltInCommand.ts）记 `docs/ITWINJS_CORE_MODIFICATIONS.md`

## File Structure

| 文件 | 职责 |
|---|---|
| 私有仓 `feature/DirectEditGuard.ts`（新建） | D7 打标 DI 挂钩实现（探测+打标+暂停再生判定） |
| fork `editor/backend/src/EditBuiltInCommand.ts`（改） | 4 写方法首行调挂钩（fork 修改记台账） |
| 私有仓 `feature/FeatureEngine.ts`（改） | writeBody/rebuildAll 加暂停再生判定 + 判型泛化注册表驱动 |
| 本仓 `packages/shared/src/opDsl.ts`（新建） | op DSL v1 双向序列化（FeatureOp[]↔文本） |
| 私有仓 `feature/FeatureTypeRegistry.ts`（改） | chamfer/shell 新类型注册 + zod schema |
| 私有仓 `feature/FeatureService.ts`（改） | chamfer/shell evaluate 通道 + deleteSketch op |
| 本仓 `apps/web/src/core/undo/UndoManager.ts`（改） | 假成功修复（接真 txns API） |
| 本仓 `apps/web/features/modeling/PatternTools.ts`（改） | ID 收集 bug 修复 |
| 私有仓 `commands/PatternCommand.ts`（删） | 死码退役 |
| 本仓 `scripts/generate-env.ps1` + `scripts/generate-openapi.ts` + `deploy/default.conf.template`（改） | RW1 遗留三件 |

---

### Task RW2-1: RW1 遗留三件接线（开门顺手件）

**Files:**
- Modify: `scripts/generate-env.ps1:19-40`（$envMap 加 BFF_UPSTREAM）+ `.env.example:46` 旁注释
- Modify: `scripts/generate-openapi.ts:290-316`（SchemaEmitter UnionType 分支 `$ref`+nullable → `{anyOf:[{$ref}],nullable:true}` 包裹）
- Modify: `deploy/default.conf.template:8-10`（容器形态注记）
- Test: 生成器测试补 $ref+nullable 用例 + drift 门复验

- [ ] **Step 1**: generate-env.ps1 envMap 加 `'BFF_UPSTREAM' = 'host.docker.internal:4001'`（与 compose 缺省同值；幂等语义现成）；.env.example 补注释行
- [ ] **Step 2**: openapi 生成器 `$ref`+nullable 修复 + 测试用例 + `pnpm gen:openapi` 重生成 + drift 门绿
- [ ] **Step 3**: nginx 模板头注释补容器形态（「容器形态（BFF 未启用）：保持 host-gateway 直达宿主 MS 或改 modeling-server:4001」）
- [ ] **Step 4**: Commit（本仓，可一笔）`chore: RW1 遗留三件接线——generate-env 接管 BFF_UPSTREAM+openapi nullable 包裹+nginx 容器形态注记（RW2-T1）`

### Task RW2-2: 顺手清债 A——UndoManager 假成功修复

**Files:**
- Modify: `luban-cad/apps/web/src/core/undo/UndoManager.ts:169-241`
- Modify: `luban-cad/apps/web/src/core/undo/useUndoManager.ts`（canUndo/canRedo 改事件驱动缓存态）
- Test: 既有测试适配 + 新增行为测试（undo 成功/失败/不可用三态真实断言）

**Interfaces:**
- Consumes: `connection.txns`（BriefcaseTxns）：`reverseSingleTxn():260`、`reinstateTxn():347`、`isUndoPossible():230`/`isRedoPossible():237`（async）、`onCommitted/onUndoRedo` 事件
- Produces: UndoManager 真实语义（undo 调 txns.reverseSingleTxn、按 IModelStatus 判成功）；FeaturePanel 的特征撤销（OpLog 通道）与编辑撤销语义区分——UI 文案「特征撤销」/「编辑撤销」分立

- [ ] **Step 1**: TDD——失败测试：mock connection.txns.reverseSingleTxn 返回非零 IModelStatus → undo() 应 success=false（现恒 true 必红）
- [ ] **Step 2**: 实现：undo/redo 接真 API（`conn.txns.reverseSingleTxn()` + IModelStatus 判定）；canUndo/canRedo 从 sync getter 改为 onCommitted/onUndoRedo 事件驱动的缓存 boolean
- [ ] **Step 3**: FeaturePanel undo/redo 按钮文案区分（「特征撤销/重做」vs「编辑撤销/重做」——UndoRedoToolbar 的语义保持编辑栈）
- [ ] **Step 4**: 全量测试 + Commit `fix(web): UndoManager 接真 txns API 修假成功 no-op+特征/编辑撤销文案分立（RW2-T2）`

### Task RW2-3: 顺手清债 B——PatternTools ID bug + PatternCommand 死码删 + deleteSketch op

**Files:**
- Modify: `luban-cad/apps/web/features/modeling/PatternTools.ts:131-134,331-334`（push 移入内层循环）
- Create: `luban-cad/apps/web/features/modeling/PatternTools.test.ts`
- Delete: 私有仓 `modeling-server/src/commands/PatternCommand.ts`
- Modify: `luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts`（FeatureOp 加 deleteSketch + interfaceVersion 1.3.0）
- Modify: 私有仓 `feature/FeatureService.ts`（校验分支+applyDeleteSketch+previewOp 镜像+oplog）
- Modify: 本仓 `docs/api-specs/luban-rpc.json`（重生成过 drift 门）

**Interfaces:**
- Produces: FeatureOp 加 `{kind:'deleteSketch', sketchId}`；FeatureService.applyDeleteSketch（守卫：被任一特征引用即拒收——queryAllFeatureDrives 按 sourceId 过滤）；previewOp 同分支镜像

- [ ] **Step 1**: PatternTools bug 修 + 新建单测（mock basicManipulationIpc；断言 N 副本全入 newIds）
- [ ] **Step 2**: PatternCommand 删（grep 零引用复核）+ luban-cad/CLAUDE.md 功能状态表 Pattern 行同步
- [ ] **Step 3**: deleteSketch TDD——shared 加分支+版本 bump+重生成；FeatureService 校验+apply+preview+oplog；守卫测试（被引用拒收/未被引用删成功）
- [ ] **Step 4**: 全量测试双仓 + drift 门 + Commit 两仓 `fix: PatternTools ID 收集+PatternCommand 死码删+deleteSketch op 补齐（RW2-T3）`

### Task RW2-4: D7 打标隔离带（直改工具 overridden 标记）

**Files:**
- Create: 私有仓 `modeling-server/src/feature/DirectEditGuard.ts`（DI 挂钩实现）
- Modify: fork `itwinjs-core/editor/backend/src/EditBuiltInCommand.ts`（4 写方法首行调挂钩）+ `docs/ITWINJS_CORE_MODIFICATIONS.md` 登记
- Modify: 私有仓 `feature/FeatureEngine.ts`（writeBody:461/rebuildAll:518-526 加暂停再生判定）
- Modify: 私有仓 `feature/FeatureService.ts`（重新参数化入口：清标记+rebuildAll）
- Test: 直改打标/暂停再生/重新参数化三流程测试

**Interfaces:**
- Produces: `bindDirectEditGuard(hooks)`（LubanCadSchema 同款 DI）；BodySolid jsonProperties 存 `{luban:{overridden:{at,op,tool}}}`；直改 BodySolid 触发打标；writeBody/rebuildAll 见标跳过；`reparameterizeBody()` 清标记+全量重建（RPC 或 FeatureOp 入口——v1 走 FeatureService 方法，前端调用面后续波次）
- Consumes: 打标探测用 `LubanBodySolid.classFullName` 比对（v1 单 body 充分）

- [ ] **Step 1**: TDD——直改打标（transformPlacement 后 body jsonProperties 有标记）/暂停再生（标记后 writeBody 跳过）/重新参数化（清标+重建恢复）
- [ ] **Step 2**: DirectEditGuard.ts + EditBuiltInCommand 挂钩（4 写点）+ FeatureEngine 暂停判定 + FeatureService 重新参数化
- [ ] **Step 3**: fork 修改记 ITWINJS_CORE_MODIFICATIONS.md；rush build editor/backend 验证
- [ ] **Step 4**: MS 全量测试 + 前端 build 冒烟 + Commit 两仓 `feat(ms): D7 直改打标隔离带——overridden 标记+暂停再生+重新参数化（RW2-T4）`

### Task RW2-5: op DSL v1（FeatureOp 链↔可读 DSL 双向序列化）

**Files:**
- Create: `luban-cad/packages/shared/src/opDsl.ts` + `opDsl.test.ts`
- Modify: `luban-cad/packages/shared/src/rpc/index.ts`（导出）
- Test: 往返恒等（op[]→DSL→op[]）+ 默认值坑（propagateSmooth 恒写全）+ 注释位保留/丢弃语义

**Interfaces:**
- Produces:
  ```ts
  export function opsToDsl(ops: FeatureOp[]): string
  export function dslToOps(dsl: string): FeatureOp[]
  ```
  DSL 形态（v1 序列化格式非语言）：每行一 op——`op <kind> [featureType] {json params} // 注释`；discriminant 双键（kind+featureType）定位 schema；发射端恒写全 schema 键（含默认值）；解析即 zod 校验（未知键剥离=规范化，注释 `//` 后丢弃）
- Consumes: FeatureTypeRegistry 的 zod schema（经 packages/shared 或私有仓——opDsl 在 shared 包，zod 校验可选注入）

- [ ] **Step 1**: TDD——往返恒等测试（全 10 分支覆盖：序列化→解析→断言深等）；propagateSmooth 默认值显式化断言；注释行保留/丢弃语义断言
- [ ] **Step 2**: 实现 opDsl.ts（发射：kind+featureType+JSON.stringify(params 全键)；解析：行拆分+注释剥离+JSON.parse+zod parse）
- [ ] **Step 3**: shared build + 全量测试 + Commit `feat(shared): op DSL v1——FeatureOp 链双向序列化（RW2-T5）`

### Task RW2-6: 特征类型扩展第一批——chamfer 特征化（最浅）

**Files:**
- Modify: 私有仓 `feature/FeatureTypeRegistry.ts`（chamferSchema + formFields 注册）
- Modify: 私有仓 `feature/FeatureEngine.ts`（evaluateChamferAsync 镜像 evaluateFilletAsync + 判型泛化注册表驱动——4 处硬编码 `"fillet"===` 改注册表查询）
- Modify: 本仓 `packages/shared/src/rpc/LubanFeatureRpcInterface.ts`（LubanFeatureType+FeatureParams 加 chamfer + interfaceVersion bump）
- Modify: 本仓 `apps/web/features/editor/components/FeaturePanel.tsx`（FEATURE_TYPE_LABELS + 参数表单 edgeRefs kind 现成）
- Test: chamfer 特征全链（insert/参数表单/试算预览/抑制/删除）+ 引擎判型泛化回归（fillet 不回归）

**Interfaces:**
- Produces: `chamfer` 特征类型全管道；FeatureEngine 判型注册表驱动（新增异步类型零硬编码改）
- Consumes: Chamfer=25 内核 op；resolveEdgeRef 零新码

- [ ] **Step 1**: 判型泛化先行（FeatureEngine 4 处 `"fillet"===` → 注册表驱动查询 `booleanOp===undefined` 语义）+ fillet 回归测试绿
- [ ] **Step 2**: chamferSchema+formFields 注册 + evaluateChamferAsync（镜像 fillet：carrier 清缓存→拓扑寻址→Chamfer op→回包）
- [ ] **Step 3**: 前端 FeaturePanel 类型注册 + 契约重生成过 drift 门
- [ ] **Step 4**: 全链测试（TDD）+ demo-flow 可加一幕 + Commit 两仓 `feat: chamfer 特征化——引擎判型泛化注册表驱动+Chamfer 通道（RW2-T6）`

### Task RW2-7: 特征类型扩展——shell 特征化（次浅，需 resolveFaceRef）

**Files:**
- Modify: 私有仓 FeatureTypeRegistry（shellSchema：defaultDistance/faces 面拓扑 id[]/distances）+ FeatureEngine（evaluateShellAsync + HollowFaces=19 通道）
- Modify: 私有仓 FeatureRpcImpl（新增 resolveFaceRef RPC——fork op31 topologyIdFromSubEntity+op32 facesFromId 已备）
- Modify: 本仓 shared（LubanFeatureType+FeatureParams+版本 bump+drift 重生成）
- Modify: 本仓 FeaturePanel（faceRefs kind 或复用 edgeRefs 形态——前端选面拾取器 useFaceRefPicker 镜像 useEdgeRefPicker）
- Test: shell 全链 + resolveFaceRef 寻址测试

- [ ] **Step 1**: resolveFaceRef RPC + 测试（拓扑 id→面解析）
- [ ] **Step 2**: shellSchema+evaluateShellAsync（HollowFaces=19：defaultDistance+faces+distances；注意 0=穿孔移除面语义）
- [ ] **Step 3**: 前端选面拾取器+参数表单
- [ ] **Step 4**: 全链测试 + Commit 两仓 `feat: shell 特征化——resolveFaceRef 寻址+HollowFaces 通道+选面拾取（RW2-T7）`

### Task RW2-8: revolve/pattern 定案 + 文档（中/深两型的立项裁决）

**Files:**
- Modify: 本仓 `docs/superpowers/specs/2026-10-15-platform-architecture-design.md`（RW2 节补 revolve/pattern 定案）
- Modify: `docs/superpowers/plans/2026-10-15-rw2-cad-convergence.md`（本计划尾部补两型的立项裁决）

**Interfaces:**
- Produces: revolve 立项卡（SpinFaces=21 异步通道+轮廓→片体造形问题+前端无现存工具——工作量与依赖清单）；pattern 立项卡（无内核 op+阵列生成语义+背负 PatternTools bug/PatternCommand 删后清零）——两型均显式「下一波次启动」

- [ ] **Step 1**: revolve/pattern 定案文档（依赖/工作量/阻塞点/启动条件）
- [ ] **Step 2**: Commit `docs: RW2 revolve/pattern 定案——下一波次立项卡（RW2-T8）`

### Task RW2-9: RW2 验收门

- [ ] **Step 1**: 双仓全量测试（web 629+/MS 302+/WA 46）+ build 双仓 + drift 门
- [ ] **Step 2**: e2e 全量（栈可用则跑——53 基线+新特征类型用例；chamfer/shell 特征链）
- [ ] **Step 3**: demo-flow 扩幕（chamfer/shell 新幕）+ 24 幕回归
- [ ] **Step 4**: spec 勾选 + ledger 收口

---

## Self-Review 结论

- **Spec 覆盖**：RW2 四项（D7 打标/op DSL/特征扩展/顺手清债）→ T4/T5/T6-T7/T2-T3 全覆盖 + RW1 遗留三件（T1）+ 验收（T9）
- **依赖顺序**：T1（开门）→T2/T3（清债独立）→T4（D7，私有仓重）→T5（op DSL，shared 独立）→T6/T7（特征扩展，T4 判型泛化是 T6 前置）→T8（定案）→T9（验收）
- **类型一致性**：op DSL 的 FeatureOp 消费与 shared 接口一致；chamfer/shell 的 FeatureParams 联合与注册表 schema 双端同步；deleteSketch 的守卫与 FeatureService 校验链一致
- **占位符**：无——所有插入点/枚举值/行号均勘察实证
- **revolve/pattern 不本波实施**：勘察定级中/深，定案文档立项（T8）——避免范围失控（蓝图 R8 风险缓解）
