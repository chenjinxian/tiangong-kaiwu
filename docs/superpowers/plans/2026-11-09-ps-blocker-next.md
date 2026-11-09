# PS blocker 下一阶段实施计划（2026-11-09）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在当前 14 个严格绿示例的基础上，按真实 PS blocker 排名把下一批
“只差 1–2 个根能力”的示例转绿，并把无法在本阶段解决的内核/架构项落成可审计的
blocked 证据；阶段目标 **严格绿 ≥ 18**，且不把 blocked 项计绿。

**Architecture:** 继续走“私有 Onshape 语料 → 公共 scenario replay → 标准
FeatureOp/RPC → 真栈 e2e”的单一链路。新增能力优先落在 **shared 纯几何工具**
（面集/位置证据选择）与 **converter**（Onshape query → scenario）两侧；
产品 RPC/UI 契约不在本阶段扩展，除非 AIRR/ADR 先行批准。

**Tech Stack:** TypeScript / iTwin.js BriefcaseConnection / Playwright / Vitest /
私有 Onshape parity corpus（CDP 只读 API）/ 真形 BRep 内核（经 `SolidKernel.h`）。

**Spec / 依据:**
- `docs/architecture/PRODUCT-GOALS-AND-ENGINEERING-PRINCIPLES.md`
- `docs/superpowers/plans/2026-11-09-ps-blocker-driven.md`（当前执行台账与 blocked 状态）
- `docs/adr/0006-onshape-new-feature-types.md`（面选择/selector 语义）
- `docs/adr/0009-sketch-external-references.md`（PROJECTED/PIERCE 等）
- `docs/adr/0015-multi-target-feature-scope.md`（多体作用域）
- 私有索引 `D:\Github\onshape-parity-data\manifest\example-index.json`
- 私有 BRepCore 审计台账 `D:\Github\imodel-native\docs\audit\BREPCORE-AUDIT-LEDGER.md`

## Global Constraints

- **P0-04**：新契约/schema/native/渲染/求解器/迁移先 AIRR/ADR；本计划只允许
  test-only replay、shared 纯工具、converter 与数据采集，不新增 RPC 载荷。
- **P0-05/P0-06**：所有写操作仍走 `LubanFeatureRpcInterface` + 标准事务；
  不得新增第二套建模/选择/撤销状态机。
- **P0-07/P0-09**：shared 契约改动必须版本 bump + 双端同发布；ACIS 仅
  Modeler + Polyhedra；真形只经 `SolidKernel.h`。
- **不伪造**：blocked 项必须写 `blocked-selector`/`blocked-capability`/
  `blocked-kernel` 证据；禁止默认 region 0、任意边、放宽断言或把近似体积标 complete。
- **数据边界**：原始 features/截图/面证据只留私有仓；公共仓只提交脱敏的
  code/test/doc 与聚合数字。
- **提交**：每个 Task 只在用户授权范围内提交；发布由 release owner 执行。
- **测试门禁**：shared 全量、web 全量、`tsc --noEmit`、目标真栈 spec 全绿；
  触碰 shared 后必须重建 `dist`，触碰 editor 导出后按 shared → editor → viewer 重建。

## 0. 当前基线与目标

| 指标 | 当前 |
|---|---:|
| 严格绿 `replicable-now` | **14** |
| blocked-selector | 4 |
| blocked-kernel | 4 |
| blocked-capability | 15 |
| 最快候选 | Alignment/iOS（regionRisk）、Dog Bone/Rocker（PROJECTED）、Fox RP23（CENTERLINE）、Intro Part 3/4（同面积面集）、Intro Part 5/6（单线 imprint face split）、Bumper（12 边 fillet）、Handle Parts（跨体 fillet） |

**阶段目标：**
1. 用“面积 + 位置（bbox）”证据解决 regionRisk / 同面积面集：**+2~3 个严格绿**
   （Alignment、Intro Part 3；iOS/Part 4 条件转绿）。
2. CENTERLINE_DIMENSION 与 capFace/sweptFace 各做一个数据/转换批次：
   **+1~3 个严格绿**，并把其余候选落 blocked 证据。
3. Bumper 12 边 fillet 做 native probe + ctest；PROJECTED/多体做 AIRR/ADR；
   **不要求本阶段转绿**，但必须给出可复现结论。
4. 阶段退出：严格绿 **≥18**；索引重生成并 verify 0 errors；计划/ADR/审计台账更新。

---

## 1. 文件结构（本阶段会触碰）

- 公共 shared：`luban-cad/packages/shared/src/sketch/profile-area-select.ts`、
  `profile-area-select.test.ts`、`index.ts`。
- 公共 replay：`luban-cad/apps/web/e2e/examples/replay/run.ts`、
  `scenario-to-op.spec.ts`、`intro-cad-parts.spec.ts`、
  `sample-assignment-scenario.spec.ts`、新增 `region-risk-exact.spec.ts`。
- 公共文档：`docs/superpowers/plans/2026-11-09-ps-blocker-next.md`、
  `docs/superpowers/plans/2026-11-09-ps-blocker-driven.md`、ADR-0006/0009/0015。
- 私有 converter/数据：`D:\Github\onshape-parity-data\tools\scenario\from-onshape-v2.mjs`、
  新增 `tools/analyze-centerline.mjs`、`tools/collect-face-evidence.mjs`、
  `tools/collect-face-evidence.test.mjs`。
- 私有 native：`D:\Github\imodel-native\iModelCore\BRepCore\Tests\NonPublished\BRepCore_SmokeTests.cpp`、
  `docs/audit/BREPCORE-AUDIT-LEDGER.md`。

---

## Task 1: shared 面域位置证据（bbox）选择

**Files:**
- Modify: `luban-cad/packages/shared/src/sketch/profile-area-select.ts`
- Modify: `luban-cad/packages/shared/src/sketch/profile-area-select.test.ts`
- Modify: `luban-cad/packages/shared/src/index.ts`

**Interfaces:**
- Consumes: 现有 `selectProfileRegionsByArea(regions, targetArea, options)`。
- Produces:
  ```ts
  export interface RegionBoundsMm { minX: number; minY: number; maxX: number; maxY: number }
  export interface AreaSelectableRegion { area: number; bounds?: RegionBoundsMm }
  export interface ProfileAreaSelectOptions {
    requireRegions?: readonly number[];
    toleranceRatio?: number;
    toleranceMm2?: number;
    maxRegions?: number;
    /** 目标面的世界/草图 bbox；有值时要求选集 union bbox 匹配。 */
    profileBoundsMm?: RegionBoundsMm;
    /** bbox 容差（mm，缺省 0.2）。 */
    boundsToleranceMm?: number;
  }
  ```

- [ ] **Step 1: 写失败测试（bbox 唯一性）**

在 `profile-area-select.test.ts` 增加：
```ts
it('bbox 证据能区分同面积同形区域', () => {
  const cells = [
    { area: 645.16, bounds: { minX: 0, minY: 0, maxX: 25.4, maxY: 25.4 } },
    { area: 645.16, bounds: { minX: 0, minY: 25.4, maxX: 25.4, maxY: 50.8 } },
    { area: 645.16, bounds: { minX: 0, minY: 50.8, maxX: 25.4, maxY: 76.2 } },
  ];
  const picked = selectProfileRegionsByArea(cells, 1935.48, {
    profileBoundsMm: { minX: 0, minY: 0, maxX: 25.4, maxY: 76.2 },
  });
  expect(picked?.regions).toEqual([0, 1, 2]);
  expect(picked?.ambiguous).toBe(false);
});
```
以及 bbox 不匹配返回 undefined、缺少 bounds 返回 undefined 两个断言。

- [ ] **Step 2: 运行测试确认失败**

```bash
cd luban-cad/packages/shared
npx vitest run src/sketch/profile-area-select.test.ts
```
Expected: FAIL（`profileBoundsMm` 未知/选择错误）。

- [ ] **Step 3: 实现 union bbox 过滤**

在 `profile-area-select.ts` 增加：
```ts
function unionBounds(regions: readonly AreaSelectableRegion[], mask: number): RegionBoundsMm | undefined {
  let bounds: RegionBoundsMm | undefined;
  for (let i = 0; i < regions.length; i++) {
    if ((mask & (1 << i)) === 0) continue;
    const b = regions[i]!.bounds;
    if (!b) return undefined;
    bounds = bounds === undefined ? { ...b } : {
      minX: Math.min(bounds.minX, b.minX),
      minY: Math.min(bounds.minY, b.minY),
      maxX: Math.max(bounds.maxX, b.maxX),
      maxY: Math.max(bounds.maxY, b.maxY),
    };
  }
  return bounds;
}
function boundsMatch(a: RegionBoundsMm | undefined, b: RegionBoundsMm, tol: number): boolean {
  return a !== undefined
    && Math.abs(a.minX - b.minX) <= tol && Math.abs(a.minY - b.minY) <= tol
    && Math.abs(a.maxX - b.maxX) <= tol && Math.abs(a.maxY - b.maxY) <= tol;
}
```
在子集循环中、面积容差判断之后追加：
```ts
if (options.profileBoundsMm !== undefined
  && !boundsMatch(unionBounds(regions, mask), options.profileBoundsMm, options.boundsToleranceMm ?? 0.2))
  continue;
```
回调/导出保持不变。

- [ ] **Step 4: 运行 shared 全量**

```bash
corepack pnpm@10 test
corepack pnpm@10 run build
```
Expected: 全部通过（含既有 189 项 + 新增）。

- [ ] **Step 5: 更新公共导出与文档**

在 `index.ts` 导出 `RegionBoundsMm`；在 ADR-0006 切片 H 追加一句“位置证据：
bbox 作为 area 的第二 oracle，多解时不得按 mask 猜”。

- [ ] **Step 6: 提交**

```bash
git add luban-cad/packages/shared/src/sketch/profile-area-select.ts \
  luban-cad/packages/shared/src/sketch/profile-area-select.test.ts \
  luban-cad/packages/shared/src/index.ts docs/adr/0006-onshape-new-feature-types.md
git commit -m "feat(shared): add bbox evidence to profile region selection"
```

---

## Task 2: Intro Part 3 同面积面集转绿（Part 4 条件处理）

**Files:**
- Modify: `D:\Github\onshape-parity-data\tools\scenario\from-onshape-v2.mjs`
- Modify: `luban-cad/apps/web/e2e/examples/replay/run.ts`
- Modify: `luban-cad/apps/web/e2e/examples/intro-cad-parts.spec.ts`
- Regenerate: `scenarios/Onshape-Training-Repo-c6a3cd9aa3daa7819cae0c44-2b8c683d9655e48fb91f2cd9.scenario.json`
- Test: 同上 spec

**Interfaces:**
- Consumes: Task 1 的 `profileBoundsMm` 选项。
- Produces: converter `profileBoundsMm` 证据；runner 把 product region
  `outerBoundary` 的 bbox 传入 selector。

- [ ] **Step 1: 写 Part 3 严格断言**

在 `intro-cad-parts.spec.ts` 把 Part 3 的 `strict` 改为 `true`，删除
`test.fail` 与 record policy；保留 Part 4 的 `strict:false`/test.fail。

- [ ] **Step 2: 运行确认失败**

```bash
cd luban-cad/apps/web
npx playwright test e2e/examples/intro-cad-parts.spec.ts --grep "Part 3" --reporter=line
```
Expected: FAIL（当前 −35.7%）。

- [ ] **Step 3: converter 增加 Part 3 面积+bbox 证据**

在 `PROFILE_AREA_EVIDENCE` 增加（值来自 `bodydetails` 顶面，见计划台账）：
```js
FhicQzLrEpPKnTC_0: {
  areaMm2: 1935.48,
  boundsMm: { minX: 0, minY: 0, maxX: 25.4, maxY: 76.2 },
  source: "bodydetails z=76.2 top",
},
FijqmYzUKpSUCsb_1: {
  areaMm2: 1290.32,
  boundsMm: { minX: 25.4, minY: 50.8, maxX: 76.2, maxY: 76.2 },
  source: "bodydetails z=50.8 top",
},
FjATqioVG6COotV_1: {
  areaMm2: 645.16,
  boundsMm: { minX: 25.4, minY: 25.4, maxX: 50.8, maxY: 50.8 },
  source: "bodydetails z=25.4 top",
},
```
并在 `convertExtrude` 的 params 中输出：
```js
...(profileArea?.boundsMm ? { profileBoundsMm: profileArea.boundsMm } : {}),
```
若 `PROFILE_AREA_EVIDENCE` 结构改为 `{ areaMm2, boundsMm?, source }`，同步
Drive Sleeve 四项；Drive Sleeve 无 bbox 时仍只走 area。

- [ ] **Step 4: runner 组装 region bbox 并传入**

在 `run.ts` 顶部从 `@luban-cad/shared` 追加 `type RegionBoundsMm` 类型导入，
然后在 area 证据块：
```ts
const regionBounds = (region: SketchRegionDto) => {
  const pts = region.outerBoundary ?? [];
  if (pts.length === 0) return undefined;
  return {
    minX: Math.min(...pts.map((p) => p.x)), minY: Math.min(...pts.map((p) => p.y)),
    maxX: Math.max(...pts.map((p) => p.x)), maxY: Math.max(...pts.map((p) => p.y)),
  };
};
const regionAreas = sketch!.regions!.map((region) => ({
  area: region.area,
  bounds: regionBounds(region),
}));
const profileBoundsMm = (feature.params as { profileBoundsMm?: RegionBoundsMm }).profileBoundsMm;
```
两个 `selectProfileRegionsByArea` 调用都传 `...(profileBoundsMm ? { profileBoundsMm } : {})`。
注意 `outerBoundary` 类型在 shared DTO 中为 `SketchPointDto[]`；若字段名不同，
按实际 DTO 取（`outerBoundary` 已在 `SketchRegionDto` 中使用）。

- [ ] **Step 5: 重转 scenario 并跑真栈**

```bash
cd D:\Github\onshape-parity-data
node tools/scenario/from-onshape-v2.mjs --doc c6a3cd9aa3daa7819cae0c44 \
  --element 2b8c683d9655e48fb91f2cd9 \
  --out scenarios/Onshape-Training-Repo-c6a3cd9aa3daa7819cae0c44-2b8c683d9655e48fb91f2cd9.scenario.json
cd D:\Github\tiangong-kaiwu\luban-cad\apps\web
npx playwright test e2e/examples/intro-cad-parts.spec.ts --grep "Part 3" --reporter=line
```
Expected: **229,418.896 mm³ ±0.5%**，树/status/body/push+重开全绿。

- [ ] **Step 6: Part 4 决策**

用同一机制尝试 Part 4（先重新采集 bodydetails 的顶面 boxes）；只有
**面积+bbox 唯一**才加证据并转 strict；多解/不唯一则保留 test.fail 并在
`KNOWN_SELECTOR_BLOCKERS` 写“Part 4 面集位置证据不足”。不得为了让测试过而
挑任意同面积子集。

- [ ] **Step 7: 提交**

```bash
git add luban-cad/apps/web/e2e/examples/replay/run.ts \
  luban-cad/apps/web/e2e/examples/intro-cad-parts.spec.ts
git commit -m "test(intro): Part 3 strict via area+bbox evidence"
```
（私有 converter/scenario 不提交。）

---

## Task 3: Alignment regionRisk 精确化（iOS 条件）

**Files:**
- Modify: `D:\Github\onshape-parity-data\tools\scenario\from-onshape-v2.mjs`
- Regenerate: `scenarios/Explore-Onshape-Models-39f2540fb7997e7badbd6ee3-d1989636af28eb77f9e99c58.scenario.json`
- Test: `luban-cad/apps/web/e2e/examples/sample-assignment-scenario.spec.ts`

**Interfaces:**
- Consumes: `PROFILE_AREA_EVIDENCE`（Task 2）。
- Produces: Alignment Cut 2 holes 精确面域；iOS Extrude 1 证据或 blocked 记录。

- [ ] **Step 1: 基线失败/近似证据**

```bash
cd luban-cad/apps/web
npx playwright test e2e/examples/sample-assignment-scenario.spec.ts --reporter=line
```
记录当前 volume（基线 8915.890 vs 8915.860）与 run notes 的 `regionRisk`。

- [ ] **Step 2: 写 area 证据**

Alignment Sketch 2 为两个 r=5.715mm 圆（Cut 2 holes）。目标切削轮廓面积：
`2 * π * 5.715² = 205.2 mm²`。
在 `PROFILE_AREA_EVIDENCE` 增加：
```js
FJHQlRU8HHNoz71_1: {
  areaMm2: 205.2,
  source: "Sketch 2 two r=5.715 holes",
},
```
如果 product region 面积与本值差 >0.00001%，先用调试日志打印实际面域面积，
把证据校准到**实际 product 面积**（记录 Onshape 面积与 product 面积两个数），
不得放宽到 0.2% 来“凑”。

- [ ] **Step 3: 重转 + 真栈**

```bash
cd D:\Github\onshape-parity-data
node tools/scenario/from-onshape-v2.mjs --doc 39f2540fb7997e7badbd6ee3 \
  --element d1989636af28eb77f9e99c58 \
  --out scenarios/Explore-Onshape-Models-39f2540fb7997e7badbd6ee3-d1989636af28eb77f9e99c58.scenario.json
cd D:\Github\tiangong-kaiwu\luban-cad\apps\web
npx playwright test e2e/examples/sample-assignment-scenario.spec.ts --reporter=line
```
Expected: 8915.860 ±0.5%，tree/status/body/push+重开一致；notes 不再有
`regionRisk` 近似标记。

- [ ] **Step 4: iOS 决策**

iOS First Part Extrude 1 的 regionRisk [0,1,2] 目标面积先从
`bodydetails` + 逐 feature 体积方程推导；只有面积能唯一选出 3 个面域才加证据。
否则保持 `blocked-evidence`，在计划中写“iOS 需要位置/面 ID 证据”，不得用
前缀 [0,1,2] 冒充精确。

- [ ] **Step 5: 提交**

```bash
git add luban-cad/apps/web/e2e/examples/sample-assignment-scenario.spec.ts
git commit -m "test(sample-assignment): exact region evidence for Cut 2 holes"
```
（若 spec 未改，仅更新计划台账；私有数据不提交。）

---

## Task 4: CENTERLINE_DIMENSION refs 分析 + converter 批次

**Files:**
- Create: `D:\Github\onshape-parity-data\tools\analyze-centerline.mjs`
- Modify: `D:\Github\onshape-parity-data\tools\scenario\from-onshape-v2.mjs`
- Reconvert affected scenarios; Modify: private index if needed.
- Test: `scenario-to-op.spec.ts`（新增 constraint 形态单测）+ 一个真实 PS。

**Interfaces:**
- Consumes: raw constraint `BTMSketchConstraint`，现有 `ref()`/`quantityMm()`。
- Produces: `CENTERLINE_DIMENSION` 支持的 refs 形态清单；converter 映射率。

- [ ] **Step 1: 采集/分析 26 个 blocker**

`analyze-centerline.mjs` 遍历 `documents/**/features.json(.gz)`，对每个
`CENTERLINE_DIMENSION` 输出：
```json
{"doc":"...","element":"...","sketch":"...","parameterIds":[...],
 "refParts":["circle.center","line","point",...],"hasLength":true,
 "expression":"160 mm"}
```
输出到 `manifest/centerline-forms.json`；按形态分组计数。
至少打印 Top 10 形态。

- [ ] **Step 2: 选择可实现子集**

优先实现：
- circle/arc + center 的 CENTERLINE_DIMENSION → `diameter`/`radius` 或
  `distance`（按 Onshape 语义：值=跨中心线全宽，映射时 /2）；
- line+line/point 的现有 distance 通道；
- 无法解析的外部引用/未知形态保持 dropped 并登记。

- [ ] **Step 3: 写 translator 单测**

在 `scenario-to-op.spec.ts` 增加对应 constraint 映射测试（例如 circle
CENTERLINE_DIMENSION → `diameter` value=80，保留 sourceType）。
Run: `npx playwright test e2e/examples/replay/scenario-to-op.spec.ts`。

- [ ] **Step 4: 重转 + 选一个真实 PS**

优先 Fox RP23（当前仅 CENTERLINE + scenario missing）；只有树/体积/status 全绿
才升级严格 spec。若 29 特征链仍有其它实际失败，保持 blocked-converter 并记录
具体失败，不得只改索引。

- [ ] **Step 5: 提交**

```bash
git add luban-cad/apps/web/e2e/examples/replay/scenario-to-op.spec.ts
git commit -m "feat(replay): cover additional CENTERLINE_DIMENSION refs"
```

---

## Task 5: capFace/sweptFace 面证据批量

**Files:**
- Create: `D:\Github\onshape-parity-data\tools\collect-face-evidence.mjs`
- Create: `D:\Github\onshape-parity-data\tools\collect-face-evidence.test.mjs`
- Modify: `from-onshape-v2.mjs` 的 `PROFILE_AREA_EVIDENCE`
- Modify: private `index-examples.mjs` known-selector 表（仅当证据不足）

**Interfaces:**
- Consumes: CDP 只读 `bodydetails?includeTopology=true`；query deterministicIds。
- Produces: `manifest/face-evidence.json`（每个 CAP_FACE/SWEPT_FACE 候选的
  face id/area/box/surface；证据来源）。

- [ ] **Step 1: 写 collector 纯函数测试**

在 `collect-face-evidence.mjs` 中导出：
```js
export function matchCapFace(faces, area, bounds, tol = 0.2) {
  return faces.filter((face) =>
    face.surface === 'PLANE'
    && Math.abs((face.area ?? 0) - area) <= Math.max(1e-6, Math.abs(area) * 1e-7)
    && Math.abs(face.box.min[0] - bounds.minX) <= tol
    && Math.abs(face.box.min[1] - bounds.minY) <= tol
    && Math.abs(face.box.max[0] - bounds.maxX) <= tol
    && Math.abs(face.box.max[1] - bounds.maxY) <= tol,
  ).map((face) => face.id);
}
```
`collect-face-evidence.test.mjs`：
```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { matchCapFace } from './collect-face-evidence.mjs';

test('picks planar cap faces by area+bbox', () => {
  const faces = [
    { id: 'A', area: 100, surface: 'PLANE', box: { min: [0, 0, 0], max: [10, 10, 0] } },
    { id: 'B', area: 200, surface: 'PLANE', box: { min: [0, 0, 10], max: [10, 20, 10] } },
  ];
  assert.deepEqual(matchCapFace(faces, 200, { minX: 0, minY: 0, maxX: 10, maxY: 20 }), ['B']);
});
```
（`node --test tools/collect-face-evidence.test.mjs` 必须通过。）

- [ ] **Step 2: 采集 26 个 PS**

```bash
cd D:\Github\onshape-parity-data
node tools/collect-face-evidence.mjs --owner "Onshape Training Repo" --limit 200
```
只读、带 retry-after；输出 `manifest/face-evidence.json`；任何 429/无面证据
如实写 `blocked-evidence`，不伪造。

- [ ] **Step 3: 映射保守子集**

仅当某 feature 的候选 face **area+bbox 唯一**且 sketch region 子集唯一时，
写入 `PROFILE_AREA_EVIDENCE`/`profileBoundsMm`；否则登记 `blocked-selector`。
先选择 1–2 个 ≤2-blocker 的 PS 转 strict，不批量放宽。

- [ ] **Step 4: 真栈与索引**

对每个转绿 PS 跑对应 spec（或新增 `region-risk-exact.spec.ts`），要求树/
status/body/逐 body 体积/push+重开全绿；重生成 index 并 verify。

- [ ] **Step 5: 提交**

```bash
git add luban-cad/apps/web/e2e/examples/<new-spec>.ts
git commit -m "test(examples): area/bbox evidence for cap-face selector"
```

---

## Task 6: Bumper 12 边 fillet native probe + 产品守卫

**Files:**
- Modify: `D:\Github\imodel-native\iModelCore\BRepCore\Tests\NonPublished\BRepCore_SmokeTests.cpp`
- Modify: `D:\Github\imodel-native\docs\audit\BREPCORE-AUDIT-LEDGER.md`
- Modify: `D:\Github\luban-backend\modeling-server\src\feature\AsyncFeatureEval.ts`（仅加日志/守卫，不改语义）
- Test: ctest `BRepCoreTest`（gtest 套件名；源文件是 `BRepCore_SmokeTests.cpp`）+ 真栈 `bumper-block-approx.spec.ts`

**Interfaces:**
- Consumes: `BRepUtil::Modify::BlendEdges`、`GetBodyFaces`、`MassProperties`。
- Produces: 多边 blend 的 native 证据；Bumper 错误的 kernel/caller 判定。

- [ ] **Step 1: 写 native 多边测试（先失败/观察）**

在 `BRepCore_SmokeTests.cpp` 增加（`makeBox` 必须是本测试作用域内的局部 lambda，
不能依赖 `FaceLevelModify` 内部的同名 lambda）：
```cpp
TEST_F(BRepCoreSmokeTests, BlendMultiEdgeBox)
{
  auto makeBox = []() {
    IBRepEntityPtr e;
    DgnBoxDetail d(DPoint3d::From(0, 0, 0), DPoint3d::From(0, 0, 1),
                   DVec3d::From(1, 0, 0), DVec3d::From(0, 1, 0), 1, 1, 1, 1, true);
    BRepUtil::Create::BodyFromSolidPrimitive(e, *ISolidPrimitive::CreateDgnBox(d));
    return e;
  };
  IBRepEntityPtr box = makeBox();
  bvector<ISubEntityPtr> edges;
  ASSERT_EQ(12u, BRepUtil::GetBodyEdges(&edges, *box));
  bvector<double> radii(12, 0.05);
  ASSERT_EQ(SUCCESS, BRepUtil::Modify::BlendEdges(*box, edges, radii, false));
  double volume = 0; DPoint3d centroid; double inertia[3][3];
  ASSERT_EQ(SUCCESS, BRepUtil::MassProperties(*box, &volume, nullptr, &centroid, inertia, 1e-6));
  ASSERT_GT(volume, 0.0);
}
```
再加 3/4 边与“布尔压印盒”各一例；若 12 边盒体即失败，直接确认内核边界。

- [ ] **Step 2: 跑 ctest**

```bash
cd D:\Github\imodel-native
cmake --build --preset win-x64-debug --target BRepCoreTest
ctest --preset win-x64-debug -R BRepCoreTest --output-on-failure
```
记录成功/失败与 `find_err_ident`（若可捕获）。

- [ ] **Step 3: 下游日志/守卫**

在 backend fillet 失败路径记录：target body face/edge 数、选中边数、半径是否
均匀、BlendEdges 返回值。若 BlendEdges 成功但几何为空，产品必须 status=1，
不得假成功。

- [ ] **Step 4: 真栈复核**

```bash
cd luban-cad/apps/web
npx playwright test e2e/examples/bumper-block-approx.spec.ts --reporter=line
```
Expected: 仍为 record（或修复后 strict）；无论结果，更新审计台账
F1/F6 状态与证据。

- [ ] **Step 5: 提交**

```bash
git -C D:\Github\imodel-native add docs/audit/BREPCORE-AUDIT-LEDGER.md \
  iModelCore/BRepCore/Tests/NonPublished/BRepCore_SmokeTests.cpp
git -C D:\Github\imodel-native commit -m "test(brepcore): multi-edge blend probe"
```

---

## Task 7: PROJECTED / 多体 AIRR-ADR（设计，不写产品代码）

**Files:**
- Create/modify: `docs/superpowers/specs/2026-11-09-sketch-external-refs-async-airr.md`
- Modify: `docs/adr/0009-sketch-external-references.md`
- Create/modify: `docs/adr/0015-multi-target-feature-scope.md`

**Interfaces:** 无代码接口；产出设计/决策/回滚/测试矩阵。

- [ ] **Step 1: PROJECTED 1b AIRR**

写清：当前同步读草图 → 实体边投影需异步 `SolidModelingCommand`；评估
(a) 异步草图求值路径，(b) 可失效同步快照缓存；选一；旧库回退；UI 证据缺口；
测试矩阵（平行/非平行、源面失效、跨体）。

- [ ] **Step 2: 多体 ADR-0015**

写清单 FeatureOp 多目标契约（`targetBodyIds` vs per-body 子操作）、
fillet/pattern/mirror 的跨体语义、事务/撤销、失败回退；明确不改变单 target
旧载荷。

- [ ] **Step 3: 评审与登记**

计划文档记录“未批准前不写产品代码”；把 P3/P5 任务保持 blocked-design；
不把 AIRR/ADR 当作绿例。

- [ ] **Step 4: 提交**

```bash
git add docs/superpowers/specs/2026-11-09-sketch-external-refs-async-airr.md \
  docs/adr/0009-sketch-external-references.md docs/adr/0015-multi-target-feature-scope.md
git commit -m "docs: AIRR/ADR for external sketch refs and multi-body scope"
```

---

## Task 8: 重索引、演示与阶段收口

**Files:**
- Private: `manifest/example-index.json`, `manifest/face-evidence.json`,
  `manifest/centerline-forms.json`
- Public: `docs/superpowers/plans/2026-11-09-ps-blocker-next.md`、
  `docs/superpowers/plans/2026-11-09-ps-blocker-driven.md`
- Demo: `luban-cad/apps/web/demo-artifacts/examples/index.html`（本地生成）

- [ ] **Step 1: 重生成索引并验证**

```bash
cd D:\Github\onshape-parity-data
node tools/index-examples.mjs
node tools/verify-example-index.mjs
```
Expected: 0 errors；strict `replicable-now` ≥18；blocked 计数有变化时记录原因。

- [ ] **Step 2: 回归门**

```bash
cd luban-cad/packages/shared && corepack pnpm@10 test && corepack pnpm@10 run build
cd ../apps/web && corepack pnpm@10 test && corepack pnpm@10 exec tsc --noEmit
npx playwright test e2e/examples/<changed-specs> --reporter=line
```

- [ ] **Step 3: 演示素材/画廊**

若新增严格绿示例：用 `e2e/examples/demo-new-examples.spec.ts` 的同一模式补
manifest/截图；`node luban-cad/scripts/onshape-parity/gallery.mjs` 重生成；
如需更新 `/showcase`，按现有 1920×1080 webp 资产格式增加卡片。

- [ ] **Step 4: 计划收口**

在 `2026-11-09-ps-blocker-driven.md` 追加本阶段执行记录：
- 每个 Task 的 strict/blocked 实际结果；
- 新严格绿清单与体积误差；
- 未解决项的证据路径（不得写“完成”）；
- 阶段目标 18 的达成/未达成与原因。

- [ ] **Step 5: 提交/推送（按用户授权）**

```bash
git add docs luban-cad/packages/shared luban-cad/apps/web/e2e
git commit -m "docs(plan): close PS blocker next phase"
git push origin main
```

---

## 验证矩阵

| 变更 | 单元 | 契约 | 真栈 |
|---|---|---|---|
| shared bbox 选择 | `profile-area-select.test.ts` 全绿 | `tsc` + shared build | Drive Sleeve、Intro Part 3 |
| regionRisk area 证据 | converter 转换 + index verify | translator 50/50 | Alignment、iOS |
| CENTERLINE refs | scenario-to-op 新单测 | shared build | Fox RP23（或 blocked 证据） |
| capFace/sweptFace 证据 | collector 测试 | index verify | 目标 PS spec |
| Bumper 多边 fillet | native ctest | 下游字段无变化 | Bumper record/strict |
| AIRR/ADR | 文档自检 | 无代码 | 无 |

## 停止条件

- 面积/bbox 仍多解 → `blocked-selector`，禁止任选同面积子集。
- 目标面面积无法从采集证据唯一反解 → `blocked-evidence`，不猜。
- PROJECTED/多体未批准 AIRR/ADR → 不写产品代码。
- 内核失败不能复现或修复 → `blocked-kernel` + native 台账，不用产品近似冒充。
- 任何真栈非 status=0 或体积超差 → 不放宽断言，不升严格绿。

## 阶段退出标准

1. 严格绿 ≥18（从 14 起）；所有新增绿都有真栈树/status/逐 body 体积/push+冷重开。
2. 新增 blocked 项都有可复现证据路径。
3. shared/web 全量、tsc、index verify 全绿。
4. 计划、ADR、审计台账、演示画廊同步更新。
