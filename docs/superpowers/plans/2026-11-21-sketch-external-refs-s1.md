# 草图外部引用 S1（模型边/端点投影 + 投影快照基础设施）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付 S1：同 Part Studio 模型边/边端点的精确投影（PROJECTED USE / USE_END），
以进程内可失效投影快照支撑同步读面；真栈验收 20×20×10 盒体顶面四边 → 闭合投影环 →
拉伸 10 = **4000 mm³**，改上游尺寸联动 **6000 mm³**，push + 冷重开、undo/redo、
源失效失败封闭。

**Architecture:** shared 1.85.0 新增 `externalRefs` 持久引用表与投影状态；私有后端用
「异步预求值 + 进程内快照 + 同步读面」（AIRR Option B），快照键 = sketchId +
externalRefs 摘要 + 源 body revision + changeEpoch，绝不落库；body 拓扑经
`SolidModelingCommand`（scratch carrier + `edgesFromOwnId` + `getSubEntityGeometry`）
精确读取；读面只查快照，缺失/过期失败封闭；web 仅扩展既有 Use 覆盖层的候选来源与
最小状态提示，不新增投影样式/对话框。

**Tech Stack:** TypeScript、iTwin.js/iModel/BIS、`LubanFeatureRpcInterface` FeatureOp、
`@itwin/core-geometry`、`@itwin/editor-backend` `SolidModelingCommand`、私有
modeling-server、Vitest、Playwright 真栈。

**Spec:** `docs/superpowers/specs/2026-11-21-sketch-external-references-airr.md`
（§4.3/§4.4/§4.5/§4.7/§4.8/§7 S1/§8）；`docs/adr/0024-sketch-external-refs-model-topology.md`；
`docs/adr/0025-solver-fixed-reference-geometry.md`；
`docs/architecture/SKETCH-EXTERNAL-REFS-S0-PROBES.md`（S1 放行；line/arc 精确；spline 边拒收）。

## Global Constraints

- **P0-01/P0-05/P0-06**：iModel/BIS 唯一底座；所有写操作走 `LubanFeatureRpcInterface`
  FeatureOp + 标准事务；草图事实源仍是 `params`（entities/constraints/plane/**externalRefs**），
  投影几何只在读面派生，禁止写入 params 坐标作为第二事实源、禁止 native geometry stream、
  禁止影子元素。
- **P0-07**：shared **1.85.0** 与 `LubanFeatureRpcInterface.interfaceVersion` 同批 bump；
  发布顺序 shared → backend → web；旧 1.35/1.84 载荷与旧库逐字兼容。
- **P0-09**：S1 **不改动 solver-neutral 契约**（`SolverTypes`/`SketchWireNormalizer`/
  `SlvsSolver`/`SketchSolveRequest` 零变更，不引入 `fixedEntityIds`）；投影实体继续经
  `splitProjectedEntities` 排除 DOF，约束引用投影实体继续拒收。
- **P0-10**：写入走标准事务，失败零变更；外部引用写入复用既有草图整体覆写 op，X-05 例外
  不变，S1 不新增例外；真栈 undo/redo 用原生事务验证。
- **不伪造**：禁止回退插入时坐标、最近边/最近面、旧快照、折线化/采样/椭圆近似；失败必须
  给结构化错误码，消费特征 `status=1`。S1 不包含 PIERCE、面投影、INTERSECTED、
  SILHOUETTED（S2+ gated）。
- **真栈门禁**：shared 单测/test:types、后端 StandaloneDb、web 单测 + `tsc --noEmit`、
  真栈 e2e 全绿；jsdom-only 不得宣称完成。
- **数据边界**：公共仓不出现私有绝对路径、私有 id、原始 BRep/坐标证据；本计划以
  `<LUBAN_BACKEND>` 指代私有仓 `luban-backend`，不含其绝对路径。
- **提交**：实现子代理不 commit/push；父 agent 在切片验证后按仓提交。

## 0. 范围与非目标

**S1 范围**
- 契约：`SketchExternalRef` 判别联合（`sketchEntity` / `bodyEdge` / `bodyFace`）、
  `SketchExternalReferenceDto`、`SketchProjectionRequest` 联合、投影状态/错误 DTO、
  `SketchDto.externalRefs/projection`、`insertSketch/updateSketch.externalRefs`、
  `externalRefs` omission guard 所需类型面。
- 后端：进程内投影快照、异步拓扑读取、预求值/冷重建/读面 hook、失效（源 body 改参/
  抑制/删除/直接编辑/undo/redo）、读面失败封闭、bodyEdge 精确投影、驱动边重接、
  删除守卫。
- web：Use 覆盖层扩展模型边/边端点候选（复用 `readBrepEdgeHandles` + `resolveEdgeRef`）、
  `updateSketch` 携带 `externalRefs`、最小失败 toast；不新增投影样式/对话框/
  offset/spacing 控件。
- e2e：`sketch-projection-body.spec.ts` 成功 + 失败注入；旧 `sketch-projection.spec.ts`、
  `sketch-use.spec.ts` 回归。

**明确非目标（S1 不做）**
- `bodyFace` 面边界投影、PIERCE、INTERSECTED、SILHOUETTED、独立 vertex 持久契约、
  约束引用投影曲线、投影线专属样式、offset/spacing/构造性选项 UI、跨文档/派生/导入几何。
- 以上源/kind 在 S1 op 边界一律 `projection-unsupported` 拒绝，不提供假入口。
- 求解器 `fixedEntityIds`：S1 不需要；ADR-0025 的固定参考语义归 S2+。

## 1. 文件地图

**公共仓（repo-relative）**

| 动作 | 文件 | 责任 |
|---|---|---|
| Modify | `luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts` | 1.85.0 契约：联合、DTO、状态/错误、FeatureOp 字段、版本注释 |
| Modify | `luban-cad/packages/shared/src/index.ts` | 导出新增类型 |
| Modify | `luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.test.ts` | 版本、联合窄化、状态 DTO、编译期穷举 |
| Modify | `luban-cad/packages/shared/src/opDsl.ts` | insertSketch/updateSketch `externalRefs` 发射与解析 |
| Modify | `luban-cad/packages/shared/src/opDsl.test.ts` | externalRefs 往返深等 |
| Modify | `luban-cad/apps/web/src/modules/part-studio/internal/sketch-use.ts` | 体边候选纯逻辑、entity block 分配、externalRefs 行 |
| Create | `luban-cad/apps/web/src/modules/part-studio/internal/sketch-use-candidates.ts` | 异步加载/解析体边候选（注入 readEdges/resolveEdgeRef） |
| Modify | `luban-cad/apps/web/src/modules/part-studio/components/SketchUseOverlay.tsx` | 渲染/命中体边与端点候选，点击回调 |
| Modify | `luban-cad/apps/web/src/modules/part-studio/components/PartStudioCanvas.tsx` | Use 体边拾取接线、投影失败 marker/toast、`externalRefs` 透传 |
| Modify | `luban-cad/apps/web/src/modules/part-studio/hooks/useSketchSystem.ts` | `applyUpdate(..., externalRefs?)`、保存 externalRefs、projection 状态 |
| Modify | `luban-cad/apps/web/src/modules/part-studio/internal/sketch-delete.ts` | `projected.source` 联合窄化（保持派生点清理） |
| Create | `luban-cad/apps/web/src/modules/part-studio/test/sketch-use-candidates.test.ts` | 候选/块分配/行构造/错误消息单测 |
| Modify | `luban-cad/apps/web/src/modules/part-studio/test/useSketchSystem.test.ts` | externalRefs 携带与 projection 状态 |
| Modify | `luban-cad/apps/web/src/common/i18n/locales/zh-CN/part-studio.json` | Use 边候选与失败提示文案 |
| Modify | `luban-cad/apps/web/src/common/i18n/locales/en/part-studio.json` | 同上 |
| Create | `luban-cad/apps/web/e2e/sketch-projection-body.spec.ts` | 真栈成功/改上游/undo/redo/push+冷开/失败注入 |
| Verify | `luban-cad/apps/web/e2e/sketch-projection.spec.ts`、`sketch-use.spec.ts` | 1a / 草图源 Use 回归，不改断言 |
| Modify | `docs/architecture/INTERFACE-FREEZE-MATRIX.md` | 1.84.0→1.85.0 与 v1.85 条目 |
| Modify | `docs/parity/capability-ledger.json` + `docs/parity/CAPABILITY-LEDGER.md` | 外部引用 S1 能力行 `partial`（仅 bodyEdge） |

**私有后端（`<LUBAN_BACKEND>` = 私有仓 `luban-backend`，路径相对其仓根）**

| 动作 | 文件 | 责任 |
|---|---|---|
| Create | `modeling-server/src/feature/SketchProjectionErrors.ts` | `ProjectionResolutionError`、错误码常量、resolved source 类型 |
| Create | `modeling-server/src/feature/SketchProjectionSnapshot.ts` | 快照键/摘要/缓存表/provider/prepare/lookup/invalidate/cleanup |
| Create | `modeling-server/src/feature/SketchEdgeProjection.ts` | 世界边曲线 → 草图局部实体（line/circle/arc/端点）纯数学 |
| Create | `modeling-server/src/feature/SketchExternalRefWrite.ts` | 规范化/块校验/解析外部引用/omission guard/依赖源收集 |
| Modify | `modeling-server/src/feature/SketchProjection.ts` | 1a 联合窄化、externalRefs 读面合并、失败抛错 |
| Modify | `modeling-server/src/feature/SketchRegions.ts` | `readResolvedSketch` 失败传播（消费特征 status=1） |
| Modify | `modeling-server/src/feature/FeatureService.ts` | 写面异步预计算、externalRefs 落库、读面状态、驱动边/重接、删除守卫、失效 |
| Modify | `modeling-server/src/feature/FeatureRpcImpl.ts` | `getSketch` 前只读 prepare（不新增 RPC） |
| Modify | `modeling-server/src/feature/FeatureEngine.ts` | `preEvaluateDirty`/`rebuildAll`/`evaluateChainForPreview` 逐特征 prepare |
| Modify | `modeling-server/src/feature/LubanCadSchema.ts` | `SketchRow.params.externalRefs`、insert/update params 写入保形 |
| Modify | `modeling-server/src/feature/DirectEditGuard.ts` | 直接编辑失效快照 |
| Create | `modeling-server/src/feature/SketchProjectionSnapshot.test.ts` | 快照键/命中/失效/stale/missing/只读/无写库 |
| Create | `modeling-server/src/feature/SketchEdgeProjection.test.ts` | 精确/拒收/构造性/端点/块校验纯测 |
| Create | `modeling-server/src/feature/SketchEdgeProjectionFlow.test.ts` | StandaloneDb 4000 mm³/改上游/守卫/失败矩阵 |
| Modify | `modeling-server/src/feature/DirectEditGuard.test.ts` | 直改失效快照单测 |

**Viewer**：无文件改动（S1 不新增投影样式；失败引用不下发曲线，现有
`sketch-curves-decoration.test.ts` 保持绿）。

## 2. 任务依赖

`Task 1（契约 + 消费者窄化）→ Task 2（快照基础设施）→ Task 3（边投影写/读/守卫）→
Task 4（web Use + 状态）→ Task 5（真栈 e2e + 文档收口）`。Task 4 的纯逻辑可在 Task 1 后
与 Task 2/3 并行，但集成验收在 Task 3 后。

---

## Task 1: shared 1.85.0 契约 + 消费者窄化

**Files**
- Modify: `luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts`
- Modify: `luban-cad/packages/shared/src/index.ts`
- Modify: `luban-cad/packages/shared/src/opDsl.ts`
- Test: `luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.test.ts`
- Test: `luban-cad/packages/shared/src/opDsl.test.ts`
- Modify (机械窄化): `<LUBAN_BACKEND>/modeling-server/src/feature/SketchProjection.ts`
- Modify (机械窄化): `<LUBAN_BACKEND>/modeling-server/src/feature/FeatureService.ts`
- Modify (机械窄化): `luban-cad/apps/web/src/modules/part-studio/internal/sketch-delete.ts`
- Modify: `docs/architecture/INTERFACE-FREEZE-MATRIX.md`

**Interfaces**

```ts
export type SketchExternalRef =
  | { kind: "sketchEntity"; sketchId: string; entityId: number;
      part?: "curve" | "start" | "end" | "center" }
  | { kind: "bodyEdge"; bodyId: string; topologyRef: LubanTopologyId;
      part?: "curve" | "start" | "end" }
  | { kind: "bodyFace"; bodyId: string; topologyRef: LubanTopologyId;
      loops?: "outer" | "all" };

export type SketchExternalRefKind =
  | "project" | "projectEndpoint" | "pierce" | "intersect" | "silhouette";

export interface SketchExternalReferenceDto {
  id: number;
  kind: SketchExternalRefKind;
  source: SketchExternalRef;
  entityIds: number[];
  localEntityId?: number;
  options?: { silhouette?: "aligned" | "antiAligned" | "outer" | "inner" };
  construction?: boolean;
}

export interface SketchProjectedMarker {
  kind: "projected";
  source: SketchExternalRef;
  refId?: number;
  derivation?: SketchExternalRefKind;
  derived?: boolean;
}

export type SketchProjectionRequest =
  | { entityId: number; sourceSketchId: string; sourceEntityId: number }
  | { entityId: number; source: SketchExternalRef };

export type SketchProjectionErrorCode =
  | "projection-source-missing" | "projection-source-ambiguous"
  | "projection-non-exact" | "projection-degenerate"
  | "projection-unsupported" | "projection-forward-reference"
  | "projection-cross-project" | "projection-cycle"
  | "projection-snapshot-missing" | "projection-snapshot-stale"
  | "projection-pierce-miss" | "projection-pierce-ambiguous"
  | "projection-source-changed-type" | "projection-external-refs-omitted";

export interface SketchProjectionErrorDto {
  refId?: number;
  source?: SketchExternalRef;
  code: SketchProjectionErrorCode;
  detail?: string;
}

export interface SketchProjectionStatusDto {
  status: "ok" | "failed";
  failedRefIds: number[];
  errors: SketchProjectionErrorDto[];
}

export interface SketchDto {
  /* existing fields unchanged */
  externalRefs?: SketchExternalReferenceDto[];
  projection?: SketchProjectionStatusDto;
}

export type FeatureOp =
  | { kind: "insertSketch"; entities: SketchEntityDto[]; constraints: SketchConstraintDto[];
      plane?: SketchPlaneDto; projections?: SketchProjectionRequest[];
      externalRefs?: SketchExternalReferenceDto[] }
  | { kind: "updateSketch"; sketchId: string; entities: SketchEntityDto[];
      constraints: SketchConstraintDto[]; externalRefs?: SketchExternalReferenceDto[] }
  /* other ops unchanged */;
```

**Steps**

- [ ] **Step 1: 写失败契约测试**
  - 版本断言全部改为 `"1.85.0"`。
  - 新增三分支 `SketchExternalRef` 构造/窄化/穷举 switch（无 default 编译通过）。
  - `SketchExternalReferenceDto` + `SketchProjectionStatusDto` 失败状态构造。
  - `opDsl.test.ts` 新增 insert/update `externalRefs` 往返深等。
- [ ] **Step 2: 运行失败**：`cd luban-cad/packages/shared && corepack pnpm@10 run test` → FAIL。
- [ ] **Step 3: 落契约与版本**：按上表替换类型；`interfaceVersion = "1.85.0"`；`index.ts`
  导出新类型；`opDsl.ts` 发射 insert/update `externalRefs`（存在才发射），解析时逐行校验
  `id` 数字、`kind` 5 值、`source.kind` 3 值、`entityIds` 数字数组、
  `bodyEdge/bodyFace` 的 `topologyRef.{nodeId,entityId}`、`sketchEntity` 的
  `sketchId/entityId`；`projections` 同时接受旧分支与 `{entityId, source}` 新分支。
- [ ] **Step 4: 机械窄化消费者（不改行为）**
  - `SketchProjection.ts`：新增 `asSketchEntitySource`，非 `sketchEntity` 抛
    `投影源种类尚未支持: <kind>（S1 仅 bodyEdge 走 externalRefs 通道）`；`synthesizeGroup`
    与 `resolveProjectedEntities` 使用窄化后的 source。
  - `FeatureService.ts` 的 `projectionSourceIds` 只收集 `marker.source.kind === "sketchEntity"`；
    `precomputeSketchWrite` 遇新 `source` 分支返回
    `{ ok:false, error:"projection-unsupported: 模型边/面投影请使用 externalRefs（S1）" }`。
  - `sketch-delete.ts`：新增 `projectedSourceKey`，仅 `sketchEntity` 返回
    `${sketchId}:${entityId}`；派生点仅在其 key 非空且不在 `liveRoots` 时删除。
- [ ] **Step 5: 双端编译**：
  ```bash
  cd luban-cad/packages/shared && corepack pnpm@10 run build
  corepack pnpm@10 run test && corepack pnpm@10 run test:types
  cd <LUBAN_BACKEND>/modeling-server && npx tsc -p tsconfig.json --noEmit
  cd luban-cad/apps/web && corepack pnpm@10 run build
  ```
  期望：PASS；旧 1a 测试逐字通过。
- [ ] **Step 6: 更新冻结矩阵并交给父 agent 提交**：`LubanFeatureRpcInterface` 行
  **1.85.0** + v1.85 条目（union/DTO/状态/错误码；S4 条件性/blocked 如实登记）。

---

## Task 2: 后端投影快照基础设施

**Files**：见文件地图（`SketchProjectionErrors.ts`、`SketchProjectionSnapshot.ts` 及其
test；`FeatureRpcImpl.ts`、`FeatureEngine.ts`、`FeatureService.ts`、`DirectEditGuard.ts`）。

**Interfaces**

```ts
export class ProjectionResolutionError extends Error {
  public constructor(public readonly errors: SketchProjectionErrorDto[]) { ... }
}

export interface ResolvedExternalRefSource {
  bodyId: string;
  part: "curve" | "start" | "end";
  curve: CurvePrimitive; // 世界坐标；line/arc/spline 由投影层裁决精确性
}

export interface ProjectionSnapshotKey {
  sketchId: string;
  sourceDigest: string;   // params.externalRefs + legacy projected 根标记 canonical 摘要
  bodyRevision: string;   // 逐源 body 的 source feature/params/suppressed/body-active + bodyEpoch
  changeEpoch: number;    // db 级进程内单调；不可归属提交/undo/redo bump
}

export type ProjectionSnapshotRef =
  | { refId: number; status: "ok"; source: ResolvedExternalRefSource }
  | { refId: number; status: "failed"; errors: SketchProjectionErrorDto[] };

export interface ProjectionSnapshot {
  key: ProjectionSnapshotKey;
  refs: ReadonlyMap<number, ProjectionSnapshotRef>;
  generatedAtMs: number; // 仅诊断
}

export type SketchProjectionLookup =
  | { ok: true; snapshot: ProjectionSnapshot }
  | { ok: false; code: "projection-snapshot-missing" | "projection-snapshot-stale" };

export interface PrepareSketchProjectionsOptions {
  cache?: ReadonlyMap<string, ElementGeometryDataEntry[]>;
}

export function canonicalExternalRefsDigest(refs: readonly SketchExternalReferenceDto[] | undefined): string;
export function lookupSketchProjectionSnapshot(db: IModelDb, sketchId: string,
  refs: readonly SketchExternalReferenceDto[]): SketchProjectionLookup;
export async function prepareSketchProjections(db: IModelDb, sketchIds: readonly string[],
  opts?: PrepareSketchProjectionsOptions): Promise<void>;
export async function prepareSketchProjectionsForFeature(db: IModelDb, featureId: string,
  cache: ReadonlyMap<string, ElementGeometryDataEntry[]> | undefined): Promise<void>;
export function invalidateSketchProjectionSnapshots(db: IModelDb,
  opts?: { bodyIds?: readonly string[]; sketchIds?: readonly string[]; all?: boolean }): void;
export function invalidateProjectionSnapshotForDirectEdit(db: IModelDb, bodyOrFeatureId: string): void;
export function clearSketchProjectionSnapshotForSketch(db: IModelDb, sketchId: string): void;
export function resetSketchProjectionSnapshotsForTest(): void;
export async function readBodyEdgeCurve(db: IModelDb, bodyId: string, topologyRef: LubanTopologyId,
  entries?: ElementGeometryDataEntry[]): Promise<CurvePrimitive>;
```

**关键行为**
- 快照表 `Map<db.key, Map<sketchId, ProjectionSnapshot>>`；进程内、惰性、不落库、不跨进程、
  无 TTL。
- `readBodyEdgeCurve`：body 不存在/`bodyIsActive===false`/无未抑制源 →
  `projection-source-missing`；`entries` 无 BRep 同理；独立 scratch key
  `${dbKey}::sketch-projection` + `SolidModelingCommand`（clear cache → create cache →
  `edgesFromOwnId` → `getSubEntityGeometry`）；0 片段 → source-missing，>1 →
  `projection-source-ambiguous`（detail=fragments=N）；单片段曲线缺失 → source-missing；
  `ElementGeometry.toGeometryQuery` 失败 → source-missing；`finally` 清缓存；命令槽用
  `withProjectionEvalLock(dbKey)` 串行。
- `prepareSketchProjections` 对每张草图：无 externalRefs 跳过；逐 ref 解析（仅
  `bodyEdge`，其他 kind 记 `projection-unsupported`）；成功/失败都写快照、不抛（DB 致命
  错误除外）；cache 路径按 body source feature 倒序匹配。
- `bodyRevision` = 逐 body `{bodyId, active, 排序 sourceFeatureIds, 各 feature
  {orderKey,suppressed,params 摘要}, bodyEpoch}` 的 FNV-1a 64 位摘要。
- `invalidate...`：指定 body/sketch 清对应快照；无参数或 `all:true` bump epoch 清全部；
  直接编辑按 bodyId 清，无法判定时 bump 清全部。
- 只读 briefcase 命令不可启动 → ref 记 `projection-snapshot-missing`。

**Steps**
- [ ] **Step 1: 写失败测试**：StandaloneDb 盒体 + 草图 params externalRef；断言
  prepare 命中（`generatedAtMs` 不变）、改源参数后 `stale`、失效后 `missing`；
  只读重开 prepare 成功且不写库；源删除/抑制 → failed/source-missing；无关 body 失效不
  影响目标；分片歧义纯测；缺失 body。
- [ ] **Step 2: 运行失败**：
  `cd <LUBAN_BACKEND>/modeling-server && npx vitest run src/feature/SketchProjectionSnapshot.test.ts`
- [ ] **Step 3: 实现错误类型与快照模块**（按上述接口/行为）。
- [ ] **Step 4: 接 hook**
  - `FeatureRpcImpl.getSketch`：`prepareSketchProjectionsForRead(sketchId)` 后返回。
  - `FeatureService.prepareSketchProjectionsForRead`：无 externalRefs 早退；prepare 失败
    吞掉，让 getSketch 返回 snapshot-missing。
  - `FeatureEngine.preEvaluateDirty`：dirty 草图含 externalRefs 时不早退；每行求值前
    `prepareSketchProjectionsForFeature(db,row.id,cache)`；`evaluateChainForPreview`、
    `rebuildAll` 同样逐行 prepare。
  - `DirectEditGuard` 的 BodySolid 分支调用 `invalidateProjectionSnapshotForDirectEdit`。
- [ ] **Step 5: 跑快照/回归**：
  `npx vitest run src/feature/SketchProjectionSnapshot.test.ts src/feature/DirectEditGuard.test.ts src/feature/SketchProjectionFlow.test.ts`
  + `npx tsc -p tsconfig.json --noEmit`；旧 1a 投影 4/4 不变。

---

## Task 3: 后端 bodyEdge 精确投影、持久化、驱动边与守卫

**Files**：见文件地图（`SketchEdgeProjection.ts`、`SketchExternalRefWrite.ts` 及其 test；
`SketchProjection.ts`、`SketchRegions.ts`、`FeatureService.ts`、`LubanCadSchema.ts`）。

**Interfaces**

```ts
export function projectResolvedEdgeToEntities(
  resolved: ResolvedExternalRefSource,
  targetPlane: SketchPlaneDto | undefined,
  row: SketchExternalReferenceDto,
): SketchEntityDto[]; // 失败抛 ProjectionResolutionError

export function requireExternalRefEntityBlock(
  row: SketchExternalReferenceDto,
  curveKind: "line" | "arc" | "circle" | "point",
): void;

export interface ExternalRefResolutionResult {
  entities: SketchEntityDto[];
  failedRefIds: number[];
  errors: SketchProjectionErrorDto[];
}
export function resolveExternalRefEntities(db: IModelDb, sketchId: string,
  params: { entities: SketchEntityDto[]; externalRefs?: SketchExternalReferenceDto[];
    plane?: SketchPlaneDto }): ExternalRefResolutionResult;
export function requireExternalRefEntities(db: IModelDb, sketchId: string,
  params: { entities: SketchEntityDto[]; externalRefs?: SketchExternalReferenceDto[];
    plane?: SketchPlaneDto }): SketchEntityDto[];

export interface ExternalRefWritePlan {
  externalRefs: SketchExternalReferenceDto[];
  synthesized: SketchEntityDto[];
  driveSourceIds: string[];
  bodyIds: string[];
}
export async function planExternalRefWrite(db: IModelDb, sketchId: string | undefined,
  plane: SketchPlaneDto | undefined, localEntities: readonly SketchEntityDto[],
  localConstraints: readonly SketchConstraintDto[],
  externalRefs: readonly SketchExternalReferenceDto[] | undefined,
  existing: readonly SketchExternalReferenceDto[] | undefined,
  physModelId: string | undefined,
  cache?: ReadonlyMap<string, ElementGeometryDataEntry[]>,
): Promise<ExternalRefWritePlan | { ok: false; code: SketchProjectionErrorCode; detail: string }>;
```

**精确投影规则（逐条实现）**
- 只接受 `LineSegment3d` 与 `Arc3d`；其他曲线 → `projection-non-exact`
  （detail=`edge-kind=<constructor name>`）。
- 直线：任意平面；两端世界点经 `fromWorld` 变局部；`hypot <= 1e-9` →
  `projection-degenerate`。
- 圆/弧：`|abs(arc.perpendicularVector · targetNormal) - 1| > 1e-6` →
  `projection-non-exact`；`radius <= 0` 或 `|sweep| <= 1e-12` → `projection-degenerate`；
  `|abs(sweep)-2π| <= 1e-9` 输出 `circle`，否则 `arc`；扫角符号按起点/中点相对圆心叉积
  确定（含法向反向镜像）。
- 端点 `part:"start"|"end"`：闭合整圆无端点 → `projection-unsupported`
  detail=`closed-edge-endpoint`；直线/弧返回一个 `point`。
- 块布局：line `[root, root+1, root+2]`；circle/arc `[root, root+1]`；endpoint `[root]`；
  合成实体带 `projected:{kind:"projected",source,refId,derivation,derived?}`；
  `construction:true` 时 root 与派生点全部 true。
- 读面先剔除 params.entities 中落在 externalRefs.block 的 id，再按快照合成；持久根实体
  kind 与合成 root kind 不同 → `projection-source-changed-type`。
- 空/重复/重叠/超 4096 id → op 拒收 `projection-unsupported`（detail 指明 block）。
- omission guard：`updateSketch` 且库内 externalRefs 非空、op 未携带该键 →
  `projection-external-refs-omitted`，零变更。
- 前向/循环：源 body 的任一非 suppressed source feature 在
  `queryFeatureDescendants(db,[sketchId])` → `projection-cycle`；否则草图树序位
  （同 `getTree` 的 `featureCount+0.5`）`<=` 源 feature `orderKey` →
  `projection-forward-reference`。
- 跨 scope：body 不在本 studio phys model → `projection-cross-project`。
- `construction` 传递：legacy 草图源同步补源实体 construction（修复 1a 缺口）。

**Steps**
- [ ] **Step 1: 纯数学失败测试**：line 任意平面精确（3 实体、端点坐标）；circle/arc
  平行平面精确；tilted 弧 → non-exact；spline → non-exact；退化线 → degenerate；
  line 端点 → 单 point；闭合圆端点 → unsupported；construction 传递；块长度 2/重复/
  超 4096 → unsupported。
- [ ] **Step 2: 运行失败**：`npx vitest run src/feature/SketchEdgeProjection.test.ts`。
- [ ] **Step 3: 实现 `SketchEdgeProjection.ts`**（按上述规则；复用
  `sketchPlaneTransformFromDto`；错误用 `ProjectionResolutionError`）。
- [ ] **Step 4: StandaloneDb 出口测试（4000/6000）**：建 20×20 源草图 + 拉伸 10 盒体 →
  枚举 z=10 四条线边并 `topologyIdFromSubEntity` → insertSketch（plane z=10，externalRefs
  4 行、每行 entityIds 3 个）→ prepare → `getSketch`：projection ok、externalRefs 4、
  entities 12、DOF 0、region area 400；消费拉伸 10 → 新 body **4000 mm³**；驱动边
  `extrude -> projectedSketch`、`extrude -> consumer`；改源宽 30 → area 600、consumer
  **6000 mm³**、树全 status 0。
- [ ] **Step 5: 运行失败**：`npx vitest run src/feature/SketchEdgeProjectionFlow.test.ts`。
- [ ] **Step 6: 实现写面/读面/驱动边/守卫**
  - `precomputeExternalRefsWrite` → `planExternalRefWrite`；失败返回
    `${code}: ${detail}`；apply/preview 镜像。
  - `precomputeSketchWrite(op, plan)`：剔除块 id；旧 projections 合成；追加 synthesized；
    约束引用块/legacy projected id → 既有文案拒收；求解仅本地实体；
    `SketchWriteReady` 增 externalRefs/driveSourceIds。
  - `applyInsertSketch`/`applyUpdateSketch` 写入 externalRefs；清空 incoming 边后按
    `driveSourceIds` 重接；`deleteSketch` 清快照。
  - `getSketch`：无快照/stale 用 lookup 得错误状态；失败时返回 status failed、
    failedRefIds、errors，剔除失败曲线、不计算 regions；成功 status ok。
  - `SketchRegions.readResolvedSketch`：`requireExternalRefEntities` 失败抛错 →
    特征 status=1。
  - `LubanCadSchema`：params/insert/update 增 externalRefs 保形。
  - 驱动边重接：单目标 insert/delete 后 `rewireExternalRefDependents`。
  - 删除守卫：删除会被 externalRefs 引用的 body 唯一驱动特征 → 拒绝，error 含
    `外部引用`。
  - 写后失效：按 op 类型失效对应 body/sketch 快照；reorder/updateVariables/undo/redo
    全失效；草图写 save 后 `prepareSketchProjections`。
- [ ] **Step 7: 补齐失败/守卫并运行**：source 抑制 → failed/source-missing、无 projected
  实体、regions undefined、consumer status 1；恢复 → ok/4000；删源 → 守卫拒收；
  updateSketch 省略 refs → omitted 拒收；前向/循环 → 对应 code；非平行圆 → non-exact；
  坏 body/edge → source-missing；清快照 → snapshot-missing；旧 1a 4/4 不变。运行：
  ```bash
  cd <LUBAN_BACKEND>/modeling-server
  npx vitest run src/feature/SketchEdgeProjection.test.ts src/feature/SketchEdgeProjectionFlow.test.ts \
    src/feature/SketchProjectionSnapshot.test.ts src/feature/SketchProjectionFlow.test.ts \
    src/feature/SketchOps.test.ts src/feature/FeatureService.test.ts
  npx tsc -p tsconfig.json --noEmit
  ```

---

## Task 4: web Use 覆盖层扩展 + externalRefs 透传 + 最小失败提示

**Files**：见文件地图（sketch-use.ts、sketch-use-candidates.ts、SketchUseOverlay.tsx、
PartStudioCanvas.tsx、useSketchSystem.ts、单测、i18n）。

**Interfaces**

```ts
export interface SketchUseBodyCandidate {
  bodyKey: string;
  subEntityId: number;
  topologyRef: LubanTopologyId;
  part: "curve" | "start" | "end";
  curveKind: "line" | "arc";
  curve: BrepEdgeCurve;
}
export function nextExternalRefId(refs: readonly SketchExternalReferenceDto[]): number;
export function nextEntityBlockStart(entities: readonly SketchEntityDto[],
  constraints: readonly { id: number }[], refs: readonly SketchExternalReferenceDto[],
  slots: number): number | undefined;
export function buildBodyEdgeExternalRefRow(args: {
  id: number; bodyKey: string; topologyRef: LubanTopologyId;
  part: "curve" | "start" | "end"; curveKind: "line" | "arc";
  entities: readonly SketchEntityDto[]; constraints: readonly { id: number }[];
  externalRefs: readonly SketchExternalReferenceDto[];
}): SketchExternalReferenceDto | { ok: false; error: "no-entity-block" };
export function projectionFailureMessage(t: (key: string,
  options?: Record<string, unknown>) => string,
  projection: SketchProjectionStatusDto): string;

export interface LoadBodyCandidatesArgs { iModelKey: string; bodies: readonly BodyInfo[];
  readEdges: (iModelKey: string, bodies: readonly BodyInfo[]) => Promise<BrepEdgeHandle[] | undefined>;
  resolveEdgeRef: (iModelKey: string, bodyKey: string, subEntityId: number) =>
    Promise<{ ok: boolean; ref?: { edge: LubanTopologyId }; error?: string }>; }
export async function loadSketchUseBodyCandidates(args: LoadBodyCandidatesArgs): Promise<{
  candidates: SketchUseBodyCandidate[]; skipped: number; errors: string[]; }>;
```

**Steps**
- [ ] **Step 1: 写失败纯逻辑测试**
  - line/arc 各产 curve/start/end 候选；other 曲线与 resolve 失败跳过并计数/收集错误。
  - 块分配避开实体/约束/已有引用（示例：实体 1,2、约束 3、引用 [4,5,6]、slots 3 →
    起点 7）；`nextExternalRefId([2,9])` → 10。
  - `buildBodyEdgeExternalRefRow` 精确形状：id 3、kind project、source bodyEdge、
    entityIds [1,2,3]。
  - `projectionFailureMessage` 按 code 映射，未知 code 有兜底。
  - `useSketchSystem`：未显式传 externalRefs 时保留活动草图引用；projection 失败状态
    透出到 hook。
- [ ] **Step 2: 运行失败**：`cd luban-cad/apps/web && corepack pnpm@10 run test -- ...`
- [ ] **Step 3: 实现纯逻辑与候选加载**：slots line=3、arc=2、endpoint=1；
  `kind=part==="curve"?"project":"projectEndpoint"`；错误文案映射
  non-exact→projectionNonExact、source/snapshot missing/stale→projectionSourceMissing、
  degenerate→projectionDegenerate、其余→projectionFailed。
- [ ] **Step 4: 接覆盖层与宿主**
  - `SketchUseOverlay`：`bodies` prop；effect 用
    `withExclusiveBrepCommand(loadSketchUseBodyCandidates(...))`；虚线灰蓝/悬停橙；
    端点优先 6 px、曲线 6 px 命中；点击 `onPickBody`；空态仅在无草图源且无体候选时。
  - `PartStudioCanvas`：`onPickBody` 构造 ref 行（id/块分配）；`applyUpdate` 携带
    refs；失败 toast；`projection.status==="failed"` 渲染
    `[data-testid=sketch-projection-status][data-status=failed][data-error-codes=...]`，
    按 codes 去重发一次 Error toast。
  - `useSketchSystem`：activeSketchRef；`applyUpdate(entities,constraints,externalRefs?)`
    未传时保留活动草图引用；refresh 设置 projection state。
  - i18n zh/en：`usePrompt`、`useEmpty`、`useBodyEdgeUnsupported`、`useResolveFailed`、
    `projectionFailed`、`projectionNonExact`、`projectionSourceMissing`、
    `projectionDegenerate`。
- [ ] **Step 5: 运行 web 单测/编译**：目标测试 + `build` + `lint`；现有 Use 草图源测试不变。

---

## Task 5: 真栈 e2e + 回归 + 文档收口

**Files**：Create `luban-cad/apps/web/e2e/sketch-projection-body.spec.ts`；回归
`sketch-projection.spec.ts`、`sketch-use.spec.ts`；更新 capability ledger 两文件；复核
X-05（不新增例外）。

**Steps**
- [ ] **Step 1: 成功用例**：RPC 建 20×20 源草图 + 拉伸 10 → 4000；读顶面 4 条线边并
  resolveEdgeRef；externalRefs 4 行；插入投影草图（plane z=10）→ getSketch projection
  ok、externalRefs 4、entities 12、DOF 0、area 400；消费拉伸 10 → 新 body 4000；改源宽
  30 → area 600、consumer 6000；**原生 Undo → 4000、Redo → 6000**；push + 冷重开 6000、
  projection ok、externalRefs 4。
- [ ] **Step 2: 失败用例**：删源特征 → 守卫 ok=false 且 error 含「外部引用」；抑制源 →
  getSketch projection failed、errors 含 source-missing、failedRefIds 全 4、无 projected
  实体、regions undefined、consumer tree status 1；恢复 → ok、4000。
- [ ] **Step 3: 运行**：
  ```bash
  cd luban-cad/apps/web
  corepack pnpm@10 run typecheck:e2e
  corepack pnpm@10 exec playwright test e2e/sketch-projection-body.spec.ts --workers=1
  ```
  期望 **2 passed**；429 按 retry-after 等待后干净复跑，不放宽断言。
- [ ] **Step 4: 回归 + 全量**：
  ```bash
  corepack pnpm@10 exec playwright test e2e/sketch-projection.spec.ts e2e/sketch-use.spec.ts --workers=1
  cd <LUBAN_BACKEND>/modeling-server && npm test
  cd luban-cad/packages/shared && corepack pnpm@10 run test && corepack pnpm@10 run test:types
  cd luban-cad/apps/web && corepack pnpm@10 run test && corepack pnpm@10 run build
  ```
- [ ] **Step 5: 文档收口**：capability ledger 新增/更新 `sketch.externalRefs.modelEdge`
  为 `partial`（仅 bodyEdge；S2+ 未做），contractRef `LubanFeatureRpcInterface 1.85.0`，
  backendRef `<LUBAN_BACKEND>/modeling-server/src/feature/SketchEdgeProjection.ts`，
  evidence 指向 `e2e/sketch-projection-body.spec.ts`；CAPABILITY-LEDGER.md 同步一行；
  复核 X-05 仍开放、不新增例外。

---

## 3. 统一验证命令

```bash
cd luban-cad/packages/shared && corepack pnpm@10 run build && corepack pnpm@10 run test
corepack pnpm@10 run test:types

cd <LUBAN_BACKEND>/modeling-server
npx tsc -p tsconfig.json --noEmit
npx vitest run src/feature/SketchProjectionSnapshot.test.ts src/feature/SketchEdgeProjection.test.ts \
  src/feature/SketchEdgeProjectionFlow.test.ts src/feature/SketchProjectionFlow.test.ts \
  src/feature/SketchOps.test.ts src/feature/FeatureService.test.ts
npm test

cd luban-cad/apps/web
corepack pnpm@10 run test -- src/modules/part-studio/test/sketch-use-candidates.test.ts \
  src/modules/part-studio/test/useSketchSystem.test.ts src/modules/part-studio/test/sketch-use.test.ts
corepack pnpm@10 run build && corepack pnpm@10 run lint && corepack pnpm@10 run typecheck:e2e
corepack pnpm@10 exec playwright test e2e/sketch-projection-body.spec.ts --workers=1
corepack pnpm@10 exec playwright test e2e/sketch-projection.spec.ts e2e/sketch-use.spec.ts --workers=1
```

## 4. 回滚计划

- **停止创建**：回退 web Use 体边候选与后端写面 externalRefs 分支；S1 前行为（仅草图源
  1a）逐字恢复；已存在含 bodyEdge externalRefs 的文档保留数据，不自动删除。
- **读取**：回退后读面必须失败封闭而非静默旧坐标；旧解析器遇非 sketchEntity 源抛
  `投影源种类尚未支持`，旧于 1.85 的后端遇未知形态同样抛错，不假成功。
- **快照**：纯进程内，进程重启即清空；无库清理/迁移回滚脚本。
- **求解器**：零变更，无需回滚；约束引用投影实体仍拒收。
- **发布门**：shared→backend→web 同批；旧库 fixture、1a/Use 回归、真栈成功+失败、
  冷重开、`verify-stack` 全绿才发布。

## 5. 自查（spec 覆盖）

- §4.3 契约：Task 1 全覆盖。
- §4.4 快照与 hook：Task 2 + Task 3。
- §4.5 求解器：S1 不启用 fixedEntityIds；保持 split/拒收约束引用。
- §4.7 持久化/版本：Task 1/3/5。
- §4.8 失败语义：Task 2/3 逐 code + Task 5 失败 e2e。
- §7 S1 退出测试：Task 3（4000/6000、拒收矩阵、只读 missing、1a 回归）+ Task 5
  （真栈 2 passed、push+冷开、undo/redo、删/抑制源）。
- S2+ gated：bodyFace/pierce/intersect/silhouette 一律 `projection-unsupported`，
  无 UI 假入口。
