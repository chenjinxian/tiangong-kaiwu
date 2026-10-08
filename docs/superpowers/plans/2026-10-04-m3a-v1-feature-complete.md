# M3-a v1 特征完整（圆角+特征树/参数/引用/预览 UX）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 打通选择性圆角（fillet）特征与前端特征系统 UX——fillet 入特征链（邻面对持久引用+引用自愈）、suppress/reorder op、影子预览、前端特征树/参数面板/视口选边引用/预览反馈全部接到 M1 特征 RPC 上，达成「拉伸+布尔+圆角+前端特征 UX 可用」（roadmap M3 的非草图半壁，即 M3-a）。

**Architecture:** fillet 走 ElementGeometryCache 异步通道（`SolidModelingCommand.blendEdges`，Blend=24），而 M1 求值管道是 EDE 同步回调——本计划引入**异步预求值前相**（op 在 `txn.saveChanges` 之前沿依赖图求值脏子链、打 preEvaluated 标记，EDE 回调见标记即短路取缓存）与**会话级 scratch 库求值载体**（中间输出 entry 数组写入 scratch StandaloneDb 的 carrier 元素，缓存通道在 scratch 库上跑，真实库 changeset 零污染）。边引用编码为**两邻面 TopologyID 对**（op33 `EdgesFromId` 的边寻址契约）。预览 = 影子缓存试算（不写库、不用 rollback mark——mark 的 TS 面在 itwinjs-core 不存在，留 T3.10 前再补）。前端以 `useFeatureSystem` hook 收敛特征 RPC（树/op/租约/表单模型/预览/引用解析），重构既有 FeaturePanel 数据源（旧 IPC 骨架废弃）。

**Tech Stack:** TypeScript（私有仓 MS：ESM `.js` 后缀、zod v4、Vitest、StandaloneDb+HubMock 基座）｜前端：React 18 hooks、@itwin/itwinui-react v3、@tanstack/react-query（可选）、Vitest+jsdom、Playwright。跨双仓：私有仓 `D:\Github\luban-backend`（modeling-server）+ 公开仓 `D:\Github\tiangong-kaiwu`（luban-cad、itwinjs-core 只读消费）。

**Spec:** `docs/superpowers/specs/2026-09-28-cad-full-program-roadmap.md`（M3 里程碑行 :208；T3.4 :80 / T3.5 :81 / T3.8 :84；WS6 T6.1-T6.6 :134-139；T1.8 注记 :53；风险 #6 双 op 面接缝 :221、#11 前置解除注记 :226）。架构根：`docs/superpowers/specs/2026-09-27-feature-system-imodel-architecture-design.md`。

## Global Constraints

- **双仓记账**：SDD 台账 `.superpowers/sdd/2026-10-04-m3a-v1-feature-complete/progress.md`（公开仓）；私有仓 commit 哈希记入台账（backend-privatization 先例）。
- **分支约定**：两仓各开 `feature/m3a-v1-features`（自各自 main）**就地 checkout，禁 worktree**——私有仓 `link:` 解析钉死 `D:\Github\tiangong-kaiwu` 兄弟路径（私有化 Preflight Ruling 既定）。
- **link: 项目禁用 `pnpm add`**：加依赖手改 package.json + `corepack pnpm@10 install --no-frozen-lockfile`（本计划无新增依赖，预期不触发）。
- **shared 包改动后必须重建**：`cd luban-cad/packages/shared && pnpm build`，私有仓 MS 与前端才能看到新导出（CLAUDE.md 实测坑）。
- **非交互 pnpm 加 `CI=true`**；**rush 重装后必须重跑 `scripts/replace-imodeljs-native.ps1`**（本计划不动 rush，预期不触发）。
- **编辑硬约束**：一切真实库写经 `EditTxn` + `saveChanges`；scratch 库非 iModel 数据面，其写不受此约束（它只是内核 op 的进料斗）。
- **每任务收尾门禁**：
  - 私有仓：`cd D:\Github\luban-backend\modeling-server && npx tsc --noEmit`（0 错）+ `pnpm test`（基线 29 文件 ≈262 过/8 skip，不得回归）+ `pnpm lint`（0 error）。
  - 公开仓前端：相关包 `npx vitest run <文件>` 全绿 + `cd luban-cad/apps/web && npx vitest run`（基线 373 过/11 跳）不回归；e2e 任务另跑 `npx playwright test e2e/features.spec.ts`（前置：全栈起 + MS 源码模式，见 Design Note 8）。
- **schema 演进纪律**：LubanCAD schema 只加不删不改（T7.6）——本计划零 schema 变更（fillet 复用 Feature 类，参数 JSON 自由形状）。
- **几何断言纪律**：跨求值比较一律 `TestHost.normalizeBrepGeomJson`（ACIS blob 非确定性，风险 #9）。
- **M3-a 不含**（显式划出）：T6.5 草图模式 UI、T4.6/T4.7 草图编辑交互与约束显示、M2-UX 清单 #1/#2/#3（归 M3-b 后续计划）；T3.9 L3 输出缓存、T3.10 L2 内核级重跑、T3.11 破坏式编辑打标、T3.12 崩溃恢复（后续里程碑）；产物发布（`publish.ps1`）推迟到 M3 整体（M3-b 后）一次发版。
- **commit 风格**：conventional 前缀 + 中文主语 + 任务号/里程碑内嵌，结尾 `Co-Authored-By: Claude Code <noreply@anthropic.com>`；私有仓 scope 用 `(modeling-server)`，公开仓跨包用 `feat(shared)+feat(web)` 形态。

## Design Notes（执行前必读，含 5 项 roadmap 偏离裁决）

1. **【裁决 D-1】边引用 = 两邻面 TopologyID 对，非单边 id**。roadmap T3.4 写「params 存 `(nodeId,entityId)` 边引用」，但 op33 `EdgesFromIdRequestProps` 的实际契约是 `faceIds: TopologyIdProps[]`（恰 2 元素、序无关——`EditBuiltInCommand.ts:446-477`，"The two adjacent faces identifying the edge"）。`TopologyIdProps.entityId` 也是面语义（"Entity (face) identifier"）。故 `FilletParams.edges` 存 `[{faceA:{nodeId,entityId}, faceB:{nodeId,entityId}}]`；求值时 `edgesFromId` 面对→缓存子实体 id→`BlendEdgesProps.edges`。**引用自愈机制**：面分裂时 op32 返回多个子实体 id（WS1 已证），面对持久 id 不变；上游改形后邻接关系若消失（面被吃掉），`edgesFromId` 返回空 → fillet status=1 失败级联（语义正确：引用真丢了）。
2. **【裁决 D-2】fillet 求值 = 异步预求值前相 + EDE 标记短路**。`blendEdges`/`createElementGeometryCache`/`edgesFromId` 全是 Promise 面（`elementGeometryCacheOperation` NAPI 虽可能同步，但 TS 面是 async，不可在同步 EDE 回调里消费）。方案：`FeatureService.applyOp` 在参数行写入后、`txn.end("save")` 前，调 `FeatureEngine.preEvaluateDirty(db, dirtyIds)`（async）——沿 EDE 边算出脏子链拓扑序，逐节点求值（非 fillet 走既有同步 `evaluateFeature`，fillet 走新 `evaluateFilletAsync`），结果写特征缓存并打 `preEvaluated` 标记；随后 `saveChanges` 的 EDE 回调见标记即**跳过重算直接取缓存**（单写者租约保证前相与落库间无并发变更，安全）。纯 extrude/boolean 链（无 fillet 后裔）前相为 no-op，M1 路径零扰动。冷路径 `rebuildAll` 转 async 同机制。失败语义不变：前相内失败 `markFailed`（同一 txn），级联跳过、body 保留旧几何。
3. **【裁决 D-3】求值载体 = 会话级 scratch StandaloneDb**。缓存通道绑元素 id（`updateElementGeometryCache({id})` 读元素几何流），而中间输出只是内存 entry 数组。方案：按 `db.key` 惰性建 scratch 库（`StandaloneDb.createEmpty` + `LubanCadSchema.importTo` + 一个 carrier `LubanBodySolid` 元素），求值时把上游输出 entry 写进 carrier（scratch 库内 txn+save，本地不 push）→ 缓存通道在 scratch 库上跑 → 结果 entry 回真实库的特征缓存。真实库 changeset 只含参数行+body 间接几何行，**M1 行级语义零污染**（对比方案「真实库内隐藏元素载体」会给每个 changeset 添直写噪音行）。nodeId 随 SAB blob 携带（TS 面不可见但跨库保真，WS1 实证），scratch 物化不影响 TopologyID 解析。
4. **【裁决 D-4】T3.8 预览 = 影子缓存试算，不用 rollback mark**。mark 的 TS 调用面在 itwinjs-core **零存在**（仅私有仓测试文件本地 interface，`TopologyId.test.ts:123-132`）；为预览把它提升为生产面 + 会话 mark 表重建，成本高于收益。影子求值：复制真实特征缓存为 shadow Map，在 shadow 上重算脏子链（fillet 同样走 scratch 载体），不写任何真实库行，返回 `{ok, error?, affected:[{featureId,status}]}`。mark 保留给 T3.10（L2 内核级重跑）届时再补 TS 面。**已知边界（记录不硬凑）**：v1 预览反馈是「成功/失败/受影响清单」级，非视口几何级实时预览；视口几何预览（经 DynamicGraphicsRequest/Decorator）列为后续增强。
5. **【裁决 D-5】undo 覆盖面维持 M1 口径**：仅 `updateParams` 可逆（fillet 改半径走 updateParams，天然可逆✓）；`setFeatureSuppressed`/`reorderFeature`/fillet 的 insert 记 oplog 但 v1 不可逆（UI 以 toast 提示），与 M2-UX 债 #1（草图 op 不可撤销）同族，统一归后续「undo 覆盖面扩展」。
6. **op31-35 不进 IPC**：`SolidModelingCommandIpc` 无这 5 个方法（调研实证），本计划也不加——前端经新 RPC `resolveEdgeRef` 间接消费（服务端进程内直调 `SolidModelingCommand`，范式照 `TopologyId.test.ts`：直构实例 + `createElementGeometryCache` 前提）。
7. **表单模型**：Registry 的参数真相是 zod（非 JSON Schema，T3.1 实现事实）；为前端表单在 `FeatureTypeDefinition` 加 `formFields: FeatureFormField[]`（UI 投影，含中文 label 与字段 kind），经 RPC `getFeatureFormModel` 下发。一致性由测试锁死（formFields 名集 ≡ zod shape 键集）。字段 kind v1 五种：`number | json | boolean | edgeRefs | readonlyText`（`profile` 用 json 文本域——Onshape 级轮廓编辑归 M3-b 草图 UX）。
8. **e2e 前置**：`docker compose up -d` + `powershell -File scripts/start-ms-host.ps1 -Source D:\Github\luban-backend\modeling-server -Detach`（MS 源码模式跑私有仓工作树——分支上的改动直接生效）；前端 webServer 由 playwright 自起。WS 握手偶发挂起已有 reload 自愈（helpers）。MS 限流 100 req/15min/IP——新 e2e 全部走 `loginWithSession` 会话注入。
9. **线程亲和旧坑已治愈**（风险 #11：thread_local 懒注册，probe-t6 八臂过）——Task 1 探针含混合调用序回归臂（mark 类读 op 后接异步缓存调用），若复现硬崩立即停下按风险 #11 排查路径走，不得绕。
10. **既有直改工具与特征系统并存**：`RoundEdgesTool`（editor-frontend）与 `RoundEdgesDialog`（本仓）是**直改 BodySolid 的破坏式路径**（T3.11 领域），M3-a 不动它们、不做检测打标；特征化 fillet 是并列的新参数化路径。用户教育（何时用哪个）归 M3-b/产品化。

## File Structure

```
私有仓 D:\Github\luban-backend\modeling-server\src\feature\
  EvalCarrier.ts            [新] scratch 库求值载体（carrierFor/writeCarrierGeometry/测试清理）
  FeatureTypeRegistry.ts    [改] fillet 注册（schema/formFields）+ FeatureTypeDefinition 扩展 + getFeatureFormModel
  FeatureEngine.ts          [改] preEvaluateDirty/evaluateFilletAsync/preEvaluated 标记/EDE 短路/queryFeatureDescendants/rebuildAll 转 async
  FeatureService.ts         [改] applyOp 前相接线 + setFeatureSuppressed/reorderFeature 分支 + previewOp
  FeatureRpcImpl.ts         [改] previewFeatureOp/resolveEdgeRef/getFeatureFormModel 实现
  FilletFlow.test.ts        [新] T3.4+T3.5+T1.8 出口测试（含 Task 1 探针转正用例）
  FeatureService.test.ts    [改] 追加 suppress/reorder/preview 用例
  main.ts                   [改] BentleyCloudRpcManager.initializeImpl 数组补 LubanFeatureRpcInterface（T6.6 后端半，随 Task 6）
公开仓 D:\Github\tiangong-kaiwu\luban-cad\
  packages/shared/src/rpc/LubanFeatureRpcInterface.ts  [改] 类型/方法扩展（Task 2）
  packages/web-viewer/src/WebInitializer.ts            [改] rpcInterfaces 数组补注册（Task 6，T6.6 前端半）
  apps/web/features/editor/hooks/useFeatureSystem.ts   [新] 特征系统 hook（Task 6）
  apps/web/features/editor/components/FeaturePanel.tsx [改] 数据源换 RPC + 状态徽标 + suppress/删除/排序（Task 7）
  apps/web/features/editor/components/FeatureParamForm.tsx [新] 表单模型驱动参数表单（Task 8）
  apps/web/features/editor/hooks/useFeatures.ts        [删] 旧 IPC 骨架废弃（Task 7）
  apps/web/features/editor/components/FeaturePanel.css [改] 徽标/表单样式
  apps/web/e2e/features.spec.ts                        [新] 特征 UX e2e（Task 7-10 渐增）
```

---

### Task 1: 探针——fillet 求值通道可行性钉（scratch 载体 + op33 桥接 + 混合调用序）

**Files:**
- Create: `D:\Github\luban-backend\modeling-server\src\feature\FilletFlow.test.ts`（本任务先建探针骨架，Task 3 扩为出口测试）

**Interfaces:**
- Produces: 探针结论写回本计划附录（执行者完成后在 progress.md 记录「探针裁决」）；`EvalCarrier` 的经验证调用序（Task 3 实现的输入）。

- [ ] **Step 1: 写探针测试（先红——EvalCarrier 尚不存在，用内联最小实现探）**

```ts
// FilletFlow.test.ts 探针段（Task 3 会重构为正式出口测试）
import { describe, it, expect, beforeAll } from "vitest";
import { StandaloneDb, EditTxn } from "@itwin/core-backend";
import { SolidModelingCommand, type TopologyIdProps } from "@itwin/editor-backend";
import { SubEntityType } from "@itwin/editor-common";
import * as path from "node:path";
import { ensureHostStarted, makeTempDir, normalizeBrepGeomJson } from "./test/TestHost.js";
import { LubanCadSchema, createFeatureModels, insertFeatureElement, insertBodySolidElement, insertFeatureDrive } from "./LubanCadSchema.js";
import { FeatureEngine } from "./FeatureEngine.js";

// 与生产设计同构：scratch 库 + carrier 元素
async function makeScratch(dir: string) {
  const db = StandaloneDb.createEmpty(path.join(dir, "scratch.bim"), { rootSubject: { name: "scratch" }, enableTransactions: true });
  await LubanCadSchema.importTo(db);
  const txn = new EditTxn(db, "carrier"); txn.start();
  const ctx = await createFeatureModels(txn);
  const carrier = await insertBodySolidElement(txn, ctx);
  txn.saveChanges("carrier init");
  return { db, carrierId: carrier };
}
```

测试体（4 臂）：(a) 真实库建 extrude+booleanSubtract 两特征链（照 `FeatureEngine.test.ts:28-43` 范式），取 body BRep entry；(b) entry 写入 scratch carrier → `new SolidModelingCommand(scratch.db, "probe")` → `createElementGeometryCache(carrierId)` → `allTopologyIds(carrierId)` 返回面 TopologyID 非空；(c) 取任两邻面 id 对（从 `allTopologyIds` 取前两个面——box 上任意两面若不邻则换对，循环试到 `edgesFromId` 非空）→ `edgesFromId(carrierId, [a,b])` 返回非空子实体 id → `blendEdges(carrierId, {edges: 子实体, radii: 0.1, propagateSmooth: true}, {wantGeometry: true})` → `entryArray` 非空；(d) 混合调用序：上述缓存 op 之后紧接着再跑一次 `createElementGeometryCache` + `allTopologyIds`（无 mark 参与，验证线程亲和修复在寻常序下稳定）；再回真实库跑一次 `createBRepGeometry` Unite（双 op 面接缝，风险 #6）。

- [ ] **Step 2: 跑探针** `npx vitest run src/feature/FilletFlow.test.ts`——预期 (a)(b) 绿、(c)(d) 暴露真实行为（邻面对选取、SubEntityProps.id 数字转换 `Number(idStr)`）。若 (d) 硬崩：停下，按 Design Note 9 处理（上报，不绕）。
- [ ] **Step 3: 记录探针裁决**到 `.superpowers/sdd/2026-10-04-m3a-v1-feature-complete/progress.md`（邻面对选取策略结论 / blend 返回 entry 形态 / 任何意外），commit 探针测试（`test(modeling-server): fillet 通道探针——scratch 载体+op33 桥接+混合调用序（M3-a T1）`）。

### Task 2: shared 类型与 RPC 契约扩展

**Files:**
- Modify: `D:\Github\tiangong-kaiwu\luban-cad\packages\shared\src\rpc\LubanFeatureRpcInterface.ts`
- Test: `D:\Github\tiangong-kaiwu\luban-cad\packages\shared\src\rpc\LubanFeatureRpcInterface.test.ts`（追加）

**Interfaces:**
- Produces（后续所有任务的 wire 类型，逐字为准）:

```ts
export type LubanFeatureType = "extrude" | "booleanAdd" | "booleanSubtract" | "fillet";
/** 内核持久拓扑 id（面语义；op31-34 的 TS 形状，EditBuiltInCommand.ts:418-424） */
export interface LubanTopologyId { nodeId: number; entityId: number }
/** 边引用 = 两邻面拓扑 id 对（op33 EdgesFromId 的边寻址契约，恰 2 元素序无关） */
export interface FilletEdgeRef { faceA: LubanTopologyId; faceB: LubanTopologyId }
export interface FilletParams { radius: number; propagateSmooth: boolean; edges: FilletEdgeRef[] }
export type FeatureParams = ExtrudeParams | FilletParams;

export type FeatureOp =
  | { kind: "insertFeature"; featureType: LubanFeatureType; params: FeatureParams }
  | { kind: "updateParams"; featureId: string; params: FeatureParams }
  | { kind: "deleteFeature"; featureId: string }
  | { kind: "setFeatureSuppressed"; featureId: string; suppressed: boolean }
  | { kind: "reorderFeature"; featureId: string; to: number }  // to=目标序位（1 基）
  | { kind: "updateSketchConstraint"; sketchId: string; constraintId: number; value: number }
  | { kind: "undo" } | { kind: "redo" };

export interface PreviewResult { ok: boolean; error?: string; affected: Array<{ featureId: string; status: number }> }
export type FeatureFormFieldKind = "number" | "json" | "boolean" | "edgeRefs" | "readonlyText";
export interface FeatureFormField { name: string; label: string; kind: FeatureFormFieldKind; readOnly?: boolean }
export interface FeatureFormModelEntry { fields: FeatureFormField[] }
export type FeatureFormModel = Record<string, FeatureFormModelEntry>;
```

RPC 类新增三方法（`interfaceVersion` 升 `1.1.0`）：
```ts
public async previewFeatureOp(_iModelKey: string, _op: FeatureOp, _sessionId: string): Promise<PreviewResult> { return this.forward(arguments); }
public async resolveEdgeRef(_iModelKey: string, _elementId: string, _subEntityId: number): Promise<{ ok: boolean; ref?: FilletEdgeRef; error?: string }> { return this.forward(arguments); }
public async getFeatureFormModel(_iModelKey: string): Promise<FeatureFormModel> { return this.forward(arguments); }
```

- [ ] **Step 1: 写失败测试**——`LubanFeatureRpcInterface.test.ts` 追加：fillet 类型联合可赋值、`FilletParams` 形状断言（编译期 + `interfaceVersion === "1.1.0"`）。
- [ ] **Step 2: 跑红** `cd luban-cad/packages/shared && npx vitest run src/rpc/LubanFeatureRpcInterface.test.ts`。
- [ ] **Step 3: 实现类型扩展**（上文逐字）；`src/index.ts` 的 type 导出行补 `LubanTopologyId, FilletEdgeRef, FilletParams, FeatureParams, PreviewResult, FeatureFormField, FeatureFormModel`。
- [ ] **Step 4: 跑绿 + 构建** `npx vitest run && pnpm build`（tsc 产物更新——私有仓 MS 与前端的消费前提）。
- [ ] **Step 5: Commit**（公开仓）`feat(shared): 特征 RPC v1.1——fillet 类型/邻面对边引用/suppress/reorder/preview/表单模型（M3-a T2）`

### Task 3: MS fillet 特征——注册、预求值通道、出口测试（T3.4 + T3.5 + T1.8 验证）

**Files:**
- Create: `D:\Github\luban-backend\modeling-server\src\feature\EvalCarrier.ts`
- Modify: `FeatureTypeRegistry.ts`、`FeatureEngine.ts`、`FeatureService.ts`
- Test: `FilletFlow.test.ts`（探针转正+扩展）

**Interfaces:**
- Consumes: Task 2 shared 类型；Task 1 探针验证的调用序；`SolidModelingCommand`（`@itwin/editor-backend`，vitest alias 已钉单图）；`SubEntityType`（`@itwin/editor-common`）。
- Produces:
  - `EvalCarrier.ts`：`carrierFor(dbKey: string): { db: StandaloneDb; carrierId: Id64String }`（惰性建 scratch 库+schema+carrier 元素）；`writeCarrierGeometry(dbKey: string, entries: ElementGeometryDataEntry[]): void`（scratch 内 txn 直写 carrier 几何流）；`disposeCarrierForTest(dbKey?: string): void`。
  - `FeatureTypeDefinition` 增字段：`booleanOp?: "unite" | "subtract"`（fillet 无）、`formFields: FeatureFormField[]`；注册 `"fillet"`（`requiresUpstream: true`）。
  - `FeatureEngine` 增：`preEvaluateDirty(db: IModelDb, dirtyIds: Id64String[]): Promise<void>`；`evaluateFilletAsync(db, featureId, upstreamEntries, params): Promise<ElementGeometryDataEntry[]>`（模块内）；`queryFeatureDescendants(db, ids): Id64String[]`（`queryAllFeatureDrives` 一次取全边后内存 BFS）；`consumePreEvaluated(dbKey, elId): boolean`（EDE 回调消费标记）。
  - `FeatureService.applyOp`：insert/update/delete/suppress/reorder 落参数行后、`txn.end("save")` 前调 `preEvaluateDirty`（`try/finally` 清标记）；`rebuildAll` 转 async（调用方 `ensureWarm`/`ensureInitialized` 已是 async）。

- [ ] **Step 1: 写出口测试（先红）**——`FilletFlow.test.ts` 正式段：
  1. **fillet 插入→再生**：extrude(square 2, dist 1) → booleanSubtract(square 0.5, dist 3) → 从 `allTopologyIds`（经 carrier 探针同构路径）取一对邻面 ref → `applyOp insertFeature fillet{radius:0.05, propagateSmooth:true, edges:[ref]}` → 断言 body BRep entry 数 >0 且与无 fillet 链的 body 归一化 JSON 不等（形状真变了）。
  2. **改半径→再生**：`updateParams` radius 0.05→0.15 → body 归一化 JSON 再变。
  3. **【T3.5 确定性不变式】**：全链 `rebuildAll` 两遍 → 两次 body 归一化 JSON **逐字节相等**（nodeId 小整数不被 normalize 掩蔽，确定性可断言）。
  4. **【引用自愈】**：`updateParams` booleanSubtract 的 distance 3→2（上游改形）→ fillet 引用仍解析（body 仍含圆角结果：归一化 JSON ≠ 无 fillet 对照）。
  5. **【引用失效级联】**：构造必然失效引用（faceA=faceB 或不邻对）→ insert 被拒或 status=1 级联（body 保留旧几何）。
  6. **【T1.8 桥接验证】**：探针臂转正——`edgesFromId` 面对→子实体 id 可直接喂 `BlendEdgesProps.edges`（`Number(idStr)` 转换）。
  7. **回归臂**：纯 extrude+boolean 链（无 fillet）applyOp 路径行为与 M1 基线一致（`FeatureEngine.test.ts` 既有用例不回归即覆盖，本文件加一个最小双特征链冒烟）。
- [ ] **Step 2: 跑红** `npx vitest run src/feature/FilletFlow.test.ts`。
- [ ] **Step 3: 实现 `EvalCarrier.ts`**（Design Note 3 方案；scratch 路径 `makeTempDir("carrier-")` 下按 dbKey 安全名；`StandaloneDb.createEmpty` + `LubanCadSchema.importTo` + `createFeatureModels` + `insertBodySolidElement`）。
- [ ] **Step 4: 实现 Registry fillet 注册**——zod schema：`radius: z.number().positive()`、`propagateSmooth: z.boolean().default(true)`、`edges: z.array(z.object({faceA: topoId, faceB: topoId})).min(1)`（`topoId = z.object({nodeId: z.number().int(), entityId: z.number().int()})`）；`formFields`：extrude/boolean=[profile(json), distance(number), sketchId(readonlyText)], fillet=[radius(number), propagateSmooth(boolean), edges(edgeRefs)]；`parseFeatureParams` 返回类型放宽 `ExtrudeParams | FilletParams`。`getFeatureFormModel(): FeatureFormModel`（从注册表投影）+ 一致性测试（formFields 名集 ≡ zod shape 键集，三个类型逐个断言）。
- [ ] **Step 5: 实现 Engine 预求值通道**——`preEvaluateDirty`：`queryFeatureDescendants`（BFS）得脏集 → 按 `queryAllFeatures` 的 orderKey 序遍历脏节点 → suppressed 直通（`cache.set(id, upstream)`，照 `evaluateFeature` :176-179）→ fillet：上游缓存缺失抛错（照 :172）→ `evaluateFilletAsync`（`EvalCarrier` 写上游 entries → `SolidModelingCommand` 实例 → `createElementGeometryCache` → 逐 ref `edgesFromId`（空→抛 `边引用失效…`）→ `blendEdges` `{wantGeometry: true}` → 返回 entryArray → `clearElementGeometryCache`）→ 非 fillet：既有 `evaluateFeature` 同步路径 → 全部成功者 `cache.set` + `markPreEvaluated`；失败者 `markFailed(txn, id)` + 脏集内其下游跳过（保持脏不写）。EDE 回调 `onFeatureNode` 首行加 `if (consumePreEvaluated(db.key, arg.elId)) return;`。`rebuildAll` 转 async（fillet 节点走 `evaluateFilletAsync`）。
- [ ] **Step 6: 接线 FeatureService**——五个写 op 分支在 `txn.end("save")` 前插 `await preEvaluateDirty(this._db, [dirtyId])`（insert=新特征 id；update/suppress=featureId；delete=无后裔需求可跳过；reorder=移动特征 id）；`try/finally` 清标记集。布尔两步制（trajectoryDefense :296-337）注意：两步之间的 `evaluateFeature` 手动调用保持不变（同步路径不受影响）。
- [ ] **Step 7: 跑绿 + 全量门禁**（Global Constraints 门禁三连）。
- [ ] **Step 8: Commit**（私有仓）`feat(modeling-server): fillet 特征入链——邻面对引用+预求值通道+scratch 载体（M3-a T3.4/T3.5/T1.8）`

### Task 4: MS suppress / reorder op

**Files:**
- Modify: `FeatureService.ts`、`OpLog.ts`（如需 payload 辅助）
- Test: `FeatureService.test.ts`（追加）

**Interfaces:**
- Consumes: Task 2 的 `setFeatureSuppressed`/`reorderFeature` op 形状。
- Produces: `applySuppress(sessionId, featureId, suppressed)` / `applyReorder(sessionId, featureId, to)`（FeatureService 内部方法，oplog 记 `opType: "setFeatureSuppressed" | "reorderFeature"`，payload 含 old/new；不可逆口径 Design Note 5）。

- [ ] **Step 1: 写失败测试**——(a) suppress：插入链 f1(extrude)→f2(booleanSubtract)→body，`applyOp setFeatureSuppressed(f2, true)` → body 变化（= f1 直通，对照 M1 suppress 测试 `FeatureEngine.test.ts:76-97` 语义）→ unsuppress 恢复；(b) reorder：三特征链 f1→f2→f3（f3=booleanAdd 依赖 f2），`reorderFeature(f3, 2)`（合法：f3 无依赖边约束时）成功且 `getTree()` orderKey 重排为 1,2,3 连续；非法移动（把 f1 移到 f2 之后，f1 是 f2 的图源）→ `ok:false, error:"重排违反依赖顺序…"`；© undo 对 suppress/reorder 报「不可撤销」文案（口径一致）。
- [ ] **Step 2: 跑红 → Step 3: 实现**——`applyReorder` 守卫：读全特征+全边 → 目标排列做拓扑校验（每个特征的图源序位 < 自身序位）→ 通过则重写 orderKey（index+1）。suppress：`txn.updateElement<FeatureProps>({id, suppressed})` + `preEvaluateDirty` + save。
- [ ] **Step 4: 绿+门禁 → Step 5: Commit**（私有仓）`feat(modeling-server): setFeatureSuppressed/reorderFeature op——依赖序守卫+oplog（M3-a T6.1 后备）`

### Task 5: MS previewFeatureOp（影子求值，T3.8）

**Files:**
- Modify: `FeatureService.ts`、`FeatureEngine.ts`（求值函数加 cache 参数化）、`FeatureRpcImpl.ts`
- Test: `FeatureService.test.ts`（追加）

**Interfaces:**
- Consumes: Task 2 `PreviewResult`；Task 3 求值内核。
- Produces: `FeatureService.previewOp(sessionId, op): Promise<PreviewResult>`（不写真实库：脏子链在 shadow Map 求值；fillet 走 scratch 载体照常；返回受影响特征及试算 status）。`FeatureRpcImpl.previewFeatureOp` 薄壳。

- [ ] **Step 1: 写失败测试**——(a) extrude 链 `updateParams` distance 改值的 preview → `ok:true` + affected 含该特征及其后裔（status 0）；(b) 非法值（distance=-1，zod 拒收路径）→ `ok:false` + error 文案；(c) **无变更断言**：preview 前后 body 几何流字节相同（同持久 blob 可字节比）+ 特征 params JSON 不变 + oplog 行数不变；(d) fillet 半径 preview（有 fillet 的链）→ ok（scratch 载体被用但不影响真实库）。
- [ ] **Step 2: 跑红 → Step 3: 实现**——`evaluateFeatureInto(db, featureId, cache)` 参数化抽取（既有 `evaluateFeature` 变薄壳调它）；`previewOp`：`ensureWarm`（健康修复语义照旧）→ shadow = `new Map(cacheFor(db))` → 对 op 模拟效果（updateParams 只影响 params 读取——求值函数加 `paramsOverride?: Map<id, params>` 或先算 dirty 子链再用覆写参数求值）→ 收集 affected。租约校验同 applyOp。
- [ ] **Step 4: 绿+门禁 → Step 5: Commit**（私有仓）`feat(modeling-server): previewFeatureOp 影子求值——试算反馈级预览不落库（M3-a T3.8）`

### Task 6: T6.6 双端 RPC 接线 + useFeatureSystem hook

**Files:**
- Modify: 私有仓 `main.ts`（initializeImpl 数组）；公开仓 `packages/web-viewer/src/WebInitializer.ts`（rpcInterfaces 数组）
- Create: 公开仓 `apps/web/features/editor/hooks/useFeatureSystem.ts`
- Test: `apps/web/features/editor/hooks/useFeatureSystem.test.ts`

**Interfaces:**
- Consumes: Task 2 RPC 面（客户端 `LubanFeatureRpcInterface.getClient()`）。
- Produces:

```ts
export interface UseFeatureSystem {
  tree: FeatureTreeEntry[]; loading: boolean; error?: string;
  formModel?: FeatureFormModel; leaseOk: boolean;
  refresh(): Promise<void>;
  applyOp(op: FeatureOp): Promise<FeatureOpResult>;   // 成功后自动 refresh
  previewOp(op: FeatureOp): Promise<PreviewResult | undefined>;
  resolveEdgeRef(elementId: string, subEntityId: number): Promise<{ ok: boolean; ref?: FilletEdgeRef; error?: string }>;
}
export function useFeatureSystem(connection: BriefcaseConnection | undefined, opts?: { enabled?: boolean }): UseFeatureSystem;
```

行为规格：`sessionId = useRef(crypto.randomUUID())`；enabled（默认 `!!connection && !readonly`）时 acquireWriteLease → 10s 间隔 renew → unmount/失能 release；`getTree` 用 connection.key；`onCommitted`（`connection.txns.onCommitted`）触发 refresh（外部 changeset 亦刷新，为 T5.5 留口）；formModel 惰性取一次。lease 被拒 → `leaseOk:false`（UI 降级只读，不阻断读树）。

- [ ] **Step 1: 写失败测试**——vi.mock `@luban-cad/shared` 的 `LubanFeatureRpcInterface.getClient`（假 client：树/表单/租约/apply/preview/resolve 可编程返回）+ mock `connection`（`key`、`txns.onCommitted.addListener/removeListener`）；断言：初始 load 树、applyOp 成功 refresh、lease acquire/release 时序（unmount 释放）、onCommitted 回调触发 refresh。
- [ ] **Step 2: 跑红 → Step 3: 实现** hook + 双端注册（私有仓 `main.ts:112-115` 数组加 `LubanFeatureRpcInterface`（import 自 `@luban-cad/shared`）；`WebInitializer.ts:40` 同）。
- [ ] **Step 4: 连通冒烟**（手动/半自动）：起源码模式 MS + `pnpm dev`，浏览器 console `LubanFeatureRpcInterface.getClient().getFeatureFormModel(...)` 返回 4 类型表单（截图或 console 记录入 progress.md）。
- [ ] **Step 5: 绿+门禁 → Step 6: 双仓 Commit**——私有仓 `feat(modeling-server): 特征 RPC 进 initializeImpl 数组（M3-a T6.6 后端半）`；公开仓 `feat(web)+feat(web-viewer): 特征 RPC 前端注册 + useFeatureSystem hook（M3-a T6.6）`

### Task 7: T6.1 特征树接新 RPC（旧 IPC 骨架废弃）

**Files:**
- Modify: `apps/web/features/editor/components/FeaturePanel.tsx`（重构数据源）、`FeaturePanel.css`、`features/editor/index.ts`（barrel 调整）
- Delete: `apps/web/features/editor/hooks/useFeatures.ts` + `useFeatures` 相关测试
- Test: `FeaturePanel.test.tsx`（改/新）+ `apps/web/e2e/features.spec.ts`（新）

**Interfaces:**
- Consumes: Task 6 `UseFeatureSystem`；Task 2 `FeatureTreeEntry`。
- Produces: FeaturePanel props 改 `useFeatureSystem` 注入（`props: { fs: UseFeatureSystem; onEditFeature(entry): void }`）；树行 = 图标（extrude ⬆/布尔 ⊕⊖/fillet ⌒）+ `featureType` label + **失败红点（status!==0）/抑制灰（suppressed）徽标** + orderKey 序号；行内动作：抑制 toggle（`setFeatureSuppressed`）、删除（`deleteFeature`，链尾守卫错误 → toast）、上移/下移（`reorderFeature to=orderKey∓1`）；底部「新建特征」入口（type Select 项 = formModel 键集）。

- [ ] **Step 1: 写失败测试**——组件级：mock `UseFeatureSystem`，断言树行渲染/徽标 class（`.feature-row--failed`、`.feature-row--suppressed`）/suppress 与删除与上移的 RPC 调用参数；hook 缺失（lease 拒）时只读态。
- [ ] **Step 2: 跑红 → Step 3: 实现**（保留既有 iTwinUI 结构与 css 风格；`useFeatures.ts` 删除后全仓 grep 无引用再删；`CadFeatureRecord` IPC 面保留在 shared/MS 不动——旧模型兼容，UI 不再消费）。
- [ ] **Step 4: e2e（features.spec.ts 第一批）**——`loginWithSession` → `navigateToEditor` → 断言特征树容器 `.feature-tree-panel` 可见、空态文案「暂无特征」、新建对话框打开 type 选项含 4 类型、取消关闭。（前置：Design Note 8 栈。）
- [ ] **Step 5: 绿+门禁+e2e → Step 6: Commit**（公开仓）`feat(web): 特征树接 M1 特征 RPC——徽标/抑制/删除/排序+旧 IPC 骨架废弃（M3-a T6.1）`

### Task 8: T6.2 参数面板（表单模型驱动）

**Files:**
- Create: `apps/web/features/editor/components/FeatureParamForm.tsx` + 追加 `FeaturePanel.css` 段
- Modify: `FeaturePanel.tsx`（编辑对话框换用 FeatureParamForm）
- Test: `FeatureParamForm.test.tsx`、e2e 追加

**Interfaces:**
- Consumes: `FeatureFormField`（kind 五种）、`FeatureParams`。
- Produces: `FeatureParamForm(props: { fields: FeatureFormField[]; value: Record<string, unknown>; onChange(next): void; disabled?: boolean; edgePicker?: React.ReactNode })`——`edgeRefs` kind 渲染 chips + `edgePicker` 插槽（Task 9 注入「从视图选边」按钮）；`json` kind 渲染 Textarea（失焦 parse，非法 → 行内错误不外传）；`readonlyText` 渲染只读 Text。编辑流：FeaturePanel「编辑」→ Dialog 内表单 →「应用」→ `fs.applyOp({kind:"updateParams", featureId, params})` → `ok:false` 时错误文案**在表单顶部 Alert 呈现**（M2-UX 债 #4 清偿：守卫文案到前端可见）。

- [ ] **Step 1: 写失败测试**——number/json/boolean/readonlyText/edgeRefs 五 kind 渲染与 onChange 行为；json 非法输入行内报错；应用失败 Alert 显示 error 文案。
- [ ] **Step 2: 跑红 → Step 3: 实现**。
- [ ] **Step 4: e2e 追加**——新建 extrude 特征（type 选 extrude → distance 填 2 → profile json 填 `[{"x":0,"y":0},{"x":2,"y":0},{"x":2,"y":2},{"x":0,"y":2}]` → 创建）→ 树行出现；编辑改 distance 3 → 应用 → toast 成功；再改非法（distance=-1）→ 应用 → Alert 可见错误文案。
- [ ] **Step 5: 绿+门禁+e2e → Step 6: Commit**（公开仓）`feat(web): 表单模型驱动参数面板——五 kind 字段+守卫错误呈现（M3-a T6.2，清偿 M2-UX#4）`

### Task 9: T6.3 视口选边 → 邻面对引用

**Files:**
- Modify: `FeatureParamForm.tsx`（edgeRefs 字段的 edgePicker 实装）、`FeaturePanel.tsx`（编辑态传递 connection）
- Create: `apps/web/features/editor/hooks/useEdgeRefPicker.ts`
- Test: `useEdgeRefPicker.test.ts`、e2e 追加

**Interfaces:**
- Consumes: 既有 `runSelectSubEntityTool`（`features/modeling/SelectSubEntityTool.ts:171-177`，options `{mode:'edge', onSubEntitySelected, onComplete}`——回调形参含 elementId 与 `SubEntityLocationProps`）；Task 6 `resolveEdgeRef`。
- Produces: `useEdgeRefPicker(connection, fs)` → `{ picking, refs: FilletEdgeRef[], start(), stop(), removeAt(i) }`——start 跑选择工具；每选中一条边：`resolveEdgeRef(elementId, subEntity.id)` → ok 则 push ref、失败 toast（错误文案）；chips 渲染 `#i 面对(nodeId/entityId ×2)` 摘要 + 删除。

- [ ] **Step 1: 写失败测试**——mock `runSelectSubEntityTool`（捕获 options）+ mock `fs.resolveEdgeRef`；断言选中回调 → resolve 参数（elementId, 数字 id）→ ref 入列；resolve 失败不入列。
- [ ] **Step 2: 跑红 → Step 3: 实现**（注意 `SubEntityProps.id` 是 number——`locateSubEntities` 回包即数字，直传 RPC；RPC 端 `String()` 化喂 op31，照 WS1 wire 契约）。
- [ ] **Step 4: e2e 追加**——对种子模型（有几何体）新建 fillet 特征 → 表单出现「从视图选边」按钮 → 点击后 `expectToolActivated(page, 'SelectSubEntity')` → Escape 退出（子实体命中的几何级点击不断言——flaky 面，交互正确性由单测+MS 集成测试双保险）。
- [ ] **Step 5: 绿+门禁+e2e → Step 6: Commit**（公开仓）`feat(web): 视口选边→邻面对引用——resolveEdgeRef 管道+chips（M3-a T6.3）`

### Task 10: T6.4 预览管道（试算反馈级）

**Files:**
- Modify: `FeatureParamForm.tsx`/`FeaturePanel.tsx`（编辑对话框接预览）
- Test: `FeatureParamForm.test.tsx` 追加、e2e 追加

**Interfaces:**
- Consumes: Task 5 `previewFeatureOp`、Task 6 `fs.previewOp`。
- Produces: 编辑对话框内参数变更后 400ms debounce → `fs.previewOp({kind:"updateParams", featureId, params: 草稿})` → 顶部 `PreviewBadge`：成功 `✓ 试算通过（N 个特征受影响）`（positive）/失败 `⚠ 试算失败：<error>`（negative）；「应用」按钮在预览失败时禁用（可强制覆盖——「仍要应用」次按钮，防引用失效误操作同时不锁死）。取消编辑 → 不留状态。

- [ ] **Step 1: 写失败测试**——fake timers 推进 debounce → previewOp 以草稿参数调用；失败 → badge 文案 + 应用禁用 + 「仍要应用」可点；成功 → badge + 应用可用。
- [ ] **Step 2: 跑红 → Step 3: 实现**。
- [ ] **Step 4: e2e 追加**——编辑 extrude distance 改值 → 等 `.preview-badge` 出现成功文案 → 应用成功；（非法值路径断言 badge 失败文案已在 Task 8 e2e 覆盖一半，此处补 badge 元素）。
- [ ] **Step 5: 绿+门禁+e2e → Step 6: Commit**（公开仓）`feat(web): 参数试算预览管道——debounce preview+反馈徽标（M3-a T6.4，反馈级口径）`

### Task 11: 收口——全量门禁、e2e 全绿、文档与 roadmap、合并

**Files:**
- Modify: `docs/superpowers/specs/2026-09-28-cad-full-program-roadmap.md`（T3.4/T3.5/T3.8/T6.1/T6.2/T6.3/T6.4/T6.6 标 ✅ 含裁决注记；M3 里程碑行加 M3-a 达成注记 + M3-b 立项指引；风险 #6 双 op 面接缝补「T3.4 已验证」结案注）
- Modify: `luban-cad/CLAUDE.md`（功能状态表 Editor/Modeling 行补参数化特征系统 ✅（M3-a）；Pattern 行不动）
- Add: `luban-cad/apps/web/demo-flow.mjs` 入库（上一会话产物，chore）
- Modify: 私有仓 `CLAUDE.md` 测试口径基线数更新（如计数变化）

- [ ] **Step 1: 双仓全量门禁**——私有仓 `pnpm test && npx tsc --noEmit && pnpm lint`；公开仓 shared/viewer-core/web-viewer/apps/web 各 `npx vitest run`；`cd luban-cad/apps/web && npx playwright test`（45 基线 + features.spec 新增全绿；前置 Design Note 8 栈，MS 源码模式）。
- [ ] **Step 2: 手动演示复核**——`node demo-flow.mjs` 跑通（新特征 UX 下无损）；如演示脚本需适配新 UI（特征树/参数面板步骤），最小增补步骤 13-14（建特征→改参→预览 badge 截图）。
- [ ] **Step 3: 文档更新**（上文 Files；roadmap 注记逐条对应 5 项裁决 D-1~D-5 的落点说明）。
- [ ] **Step 4: memory 更新**（CAD 主线进展：M3-a 达成、fillet 求值通道裁决、双仓分支名）。
- [ ] **Step 5: 终审请求**——superpowers:requesting-code-review 整支审查（两仓 diff）；修复波后进 Step 6。
- [ ] **Step 6: 合并（用户确认点·四停）**——两仓 `feature/m3a-v1-features` → main（`--no-ff` 保留合并节点，照 M1/M2 先例）；推送前 `.Tiles/.bim` 大资产检查（upstream-sync-gotchas 坑单）。
- [ ] **Step 7: 产物发布决定（用户确认点）**——默认**推迟**到 M3-b 完成后一次 `publish.ps1 -Tag backend-202610XX`；若用户要求即刻发版，走 publish.ps1 全流程。

## Self-Review 结论

1. **Spec 覆盖**：T3.4=Task 1+3（含 T1.8 桥接验证臂与出口标准「上游改形后引用自愈、可选边」双断言）；T3.5=Task 3 Step 1.3/1.4（确定性两遍重跑+引用自愈，出口「任意中间特征改参后全链引用不断」）；T3.8=Task 5（口径改道裁决 D-4 已显式登记）；T6.6=Task 6；T6.1=Task 7（含拖拽排序的 op 化——v1 上下移按钮，拖拽 UI 为增强不阻塞出口）；T6.2=Task 8；T6.3=Task 9（拾取反查经 op31+op7 组合，出口「点选面/边建引用」以边实现——fillet 消费面；纯面引用消费方不存在于 M3 范围）；T6.4=Task 10（依赖 T3.8 ✓ Task 5）。WS7 测试债部分已于 2026-10-03 清偿（前置完成）。M3 里程碑的草图半壁显式划归 M3-b（Goal 行与 Global Constraints「M3-a 不含」）。
2. **占位符扫描**：无 TBD/「适当处理」类步骤；Task 1 Step 1 测试体为四臂描述+骨架代码（探针任务的本质是探索，臂的断言已具体到方法与期望返回形态；邻面对枚举策略显式写为「循环试到 edgesFromId 非空」）。
3. **类型一致性**：`FilletEdgeRef{faceA,faceB:LubanTopologyId{nodeId,entityId}}` 在 Task 2（定义）/3（edgesFromId 入参拆对）/9（resolveEdgeRef 回包）三处一致；`PreviewResult` Task 2/5/6/10 一致；`FeatureFormFieldKind` 五值 Task 2/4/8 一致；`reorderFeature to`（1 基序位）Task 2/4/7 一致；`UseFeatureSystem` 方法集 Task 6 定义 = Task 7/8/9/10 消费集；`SubEntityProps.id` number→RPC→MS 端 String() 化的转换在 Task 5(wire 注释)/9(Step 3) 两端写明。
4. **裁决偏离清单**（供用户评审）：D-1 边引用编码改邻面对（op33 契约倒逼）；D-2 预求值前相+标记短路（async/同步接缝）；D-3 scratch 库载体（changeset 零污染）；D-4 预览影子求值弃 mark（TS 面不存在+成本）；D-5 undo 覆盖面维持 M1 口径。全部在 Design Notes 显式登记，收口时写入 roadmap 注记。
