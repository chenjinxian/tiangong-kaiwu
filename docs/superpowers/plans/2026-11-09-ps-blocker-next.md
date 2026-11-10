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
- 私有索引：`onshape-parity-data` 的 example-index（路径不展开）
- 私有 BRepCore 审计台账：私有 `imodel-native`（路径与条目细节不在此复述）

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
- 私有 converter/数据：私有 `onshape-parity-data` 的 scenario converter 与
  centerline/face-evidence 工具（路径不展开）。
- 私有 native：私有 `imodel-native` 的 BRepCore smoke test 与审计台账
  （测试名/路径/条目细节不公开复述）。

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
- Modify: `onshape-parity-data\tools\scenario\from-onshape-v2.mjs`
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
cd <private onshape-parity-data>
node tools/scenario/from-onshape-v2.mjs --doc c6a3cd9aa3daa7819cae0c44 \
  --element 2b8c683d9655e48fb91f2cd9 \
  --out scenarios/Onshape-Training-Repo-c6a3cd9aa3daa7819cae0c44-2b8c683d9655e48fb91f2cd9.scenario.json
cd luban-cad/apps/web
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
- Modify: `onshape-parity-data\tools\scenario\from-onshape-v2.mjs`
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
cd <private onshape-parity-data>
node tools/scenario/from-onshape-v2.mjs --doc 39f2540fb7997e7badbd6ee3 \
  --element d1989636af28eb77f9e99c58 \
  --out scenarios/Explore-Onshape-Models-39f2540fb7997e7badbd6ee3-d1989636af28eb77f9e99c58.scenario.json
cd luban-cad/apps/web
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
- Create: `onshape-parity-data\tools\analyze-centerline.mjs`
- Modify: `onshape-parity-data\tools\scenario\from-onshape-v2.mjs`
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
- Create: `onshape-parity-data\tools\collect-face-evidence.mjs`
- Create: `onshape-parity-data\tools\collect-face-evidence.test.mjs`
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
cd <private onshape-parity-data>
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
- Private: 私有 `imodel-native` 的多边 blend smoke 探针与审计台账
  （测试名/路径/条目细节不在此复述）
- Private: 私有 `luban-backend` fillet 失败路径守卫（仅加日志/守卫，不改语义；
  **未提交、尚未进入产物**）
- Test: 私有 native ctest + 真栈 `bumper-block-strict.spec.ts`（2026-11-09
  follow-up：Fillet 1 审计 20 边覆盖；原 record 轨同日退场）

**Interfaces:**
- Consumes: 私有内核的 blend/body-face/mass 只读能力（具体符号不公开复述）。
- Produces: 多边 blend 的**聚合**内核边界结论；Bumper 的 kernel/caller 判定。
  具体测试名、拓扑计数、探针体积与内核错误码只在私有审计台账。

- [ ] **Step 1: 写 native 多边测试（先失败/观察）**

在私有 native smoke 测试中增加多边 blend 探针：盒体 12 边、3 边链、4 边闭环
与布尔压印盒各一例，记录成功/失败与干净回滚。**测试代码不在此复述**；证据
只写私有审计台账。

- [ ] **Step 2: 跑私有 native ctest**

在私有 `imodel-native` 构建并运行对应 native 测试，记录成功/失败与错误标识
（若可捕获）。**构建命令、测试名与错误码只在私有台账**，不复制到公开仓。

- [ ] **Step 3: 下游日志/守卫**

在 backend fillet 失败路径记录：target body face/edge 数、选中边数、半径是否
均匀、blend 返回值。若 blend 成功但几何为空，产品必须 status=1，不得假成功。
该守卫为**设计/未提交，尚未进入产物**。

- [ ] **Step 4: 真栈复核**

```bash
cd luban-cad/apps/web
npx playwright test e2e/examples/bumper-block-strict.spec.ts --reporter=line
```
Expected: 严格轨（Fillet 1 **16/16 实际选择**；底面 4 条 z=0 尖边未选）；通用
resolver 对 Fillet 1 仍解析 12 条边（`genericResolver=12-edge blocked`；分类已按
strict 轨提升，发布栈不成立）。无论结果，更新私有审计台账的聚合状态与证据指针。

- [ ] **Step 5: 提交**

私有 `imodel-native` / `luban-backend` 变更按私有约束保持**未提交**；公开仓
不复制 native 测试代码/错误码/路径。若后续授权提交，只提交私有仓变更，公开侧
仍只登记聚合结论。

---

## Task 6b（设计已批准；实现另批）：CAP_FACE 起始面 + 拔模的精确 faceExtrude

> **2026-11-10 设计切片（用户已批准实现）**：AIRR
> `docs/superpowers/specs/2026-11-10-extrude-startface-draft-airr.md` /
> ADR-0016 `docs/adr/0016-extrude-start-face-draft.md`。
> 状态 **已批准实现（2026-11-10）**；S9/S10/S11 已解析；体积模型修正为 prismoid。
> **2026-11-10 A3/A4 实测（未推送）**：S10 CAP_FACE → 产品 faceExtrude 已接线
> （converter `capFaceProfile` + runner 起始面解析 + `resolveFaceRef`）；
> pre-fillet **657,764.787185**、20/20 line、rb=3 oracle **16/16**、最终
> **636,731.650 vs 636,731.499（+0.000024%）**、6 特征全 status=0、1 body、
> push+冷重开、approximateSteps=0。**证据更正**：Onshape Fillet 1 实际只选
> **16 条边**（底面 4 条 z=0 边为尖边；最终 body 仅 16 个 R5 圆角柱面、无底环
> 圆角；live 截图底边为直尖边），oracle 16/20 是**完整选择**而不是缺口；
> 旧审计 20 边回退（634,347.216，−0.374%）多选底面环，已从 strict spec 移除。
> ADR-0016/AIRR 的“oracle 20/20（含底面 loop）”门已修订为
> **16/16（覆盖全部实际选择边）+ 底面 loop 尖边**；A4 按修订后的门完成。
> 索引口径（2026-11-10 发布闭口）：私有 `replicable-now` **18**——Bumper
> 为第 18 例，条目携带 `strictPath=rb3-oracle-16/16`、
> `requiresBackend=backend-20261110`、`genericResolver=12-edge blocked`；
> 私有 converter/oracle/scenario 已提交，A1/A2 backend 随
> `backend-20261110`（shared 1.64.0）发布；公开 strict spec **19**（含 iOS）。
> generic resolver 仍是 12 边 blocked-kernel，是独立限制，不影响 strict
> oracle 轨。

**Files（设计产物，本次已落）:**
- `docs/superpowers/specs/2026-11-10-extrude-startface-draft-airr.md`
- `docs/adr/0016-extrude-start-face-draft.md`
- 本计划、`docs/README.md`、ADR-0006 指针（可选）

**设计要点:**
- 设计前根因：CAP_FACE 被映射成既有 `extrude.startOffsetMm` + `draftAngleDeg`，
  轮廓仍是原草图面域；40 是从上游深度推断的偏移；拔模是整环 2D 偏置+Loft；
  最终 body 侧边为 `curvePrimitive`。**S1 已解析**（native Loft smooth skin；
  A2 逐边解析壳体 20/20 line）。**S5 已解析**：oracle 的 16/20 不是缺口——
  Onshape Fillet 1 实际只选 16 条（5 faces + 4 edges），底面 4 条 z=0 loop 尖边
  未选。
- 选 A：扩展 `FaceExtrudeParams.startOffsetMm/draftAngleDeg/draftPullDirection`，
  以 `bodyId`/`faceRef` 的**起始面边界**为轮廓。
- **S9/S10/S11 已解析（2026-11-10）**：
  - S9：中性面=起始/profile 面 z=40；10° 从 pull direction 量起；
    `draftPullDirection=true` 收窄；z=40 的 180×50 → z=80 的
    165.893842×35.893842；δ=40·tan10°。
  - S10：CAP_FACE 在 `entities` profile 槽；`startOffsetEntity` 空、
    `startOffset=false`；37 个 `entities` vs 29 个 `startOffsetEntity`
    （27 个 `startOffset=true`）；A 只适用 37 个面驱动特征。
  - S11：startOffset=0；25 mm `startOffsetDistance` 默认未使用；面 z=40、
    depth 40 → 顶面 z=80。
- **体积模型修正**：上体是等距偏置 prismoid，不是相似截面锥台；闭式
  `h/6(A0+A1+4Am)`；rb=3 BRep 积分 upper **297,764.7871846836**、pre-fillet
  **657,764.7871846836**（实测 657,764.787185）；当前产品已匹配。前稿
  297,002.158/657,002.158 与 762.629“Extrude 2 残差”是错误模型。**最终差修订**：
  旧 −0.374% 是审计 20 边回退多选底面 loop（≈2,384 mm³），不是下游 fillet
  能力边界，也不是 Extrude 2 残差；16 边轨最终差 +0.151 mm³（+0.000024%）。
- **A1/A2 测试门分离**：
  - A1 = 面轮廓/偏移/参数接线 + 失败封闭；拔模继续复用整环偏置+Loft（**不修 P3**）；
    记录 prismoid 297,764.787 baseline，**不**断言解析边/20-20。
  - A2 = face-driven profile（S10）+ line/arc 锥面边（tool 体与最终 Unite 体，
    实测 20/20 line）+ **Bumper pre-fillet 657,764.787185** + Fillet 1
    **16/16 实际选择**（底面 4 条尖边未选）+ 最终 ±0.5%（+0.000024%）。
    体积已匹配，不是 A2 的差异化项。A2 已达成。
- **body 归属**：faceRef 按 `bodyId` 逐体解析；跨体/多 body 歧义 status=1；旧单 body
  载荷逐字兼容，旧多 body 歧义登记 fail closed；29 个 start-reference 家族 blocked/
  approximate。
- **helper 适配**：既有草图面域拔模 helper 只接受 `SketchRegion`；既有整环拔模
  helper 未导出。A1 需导出既有整环 helper 并新增面轮廓整环拔模 helper
  （Loop/ParityRegion）；不把面 Loop 强塞给 SketchRegion helper。
- 拒绝 B（`ExtrudeParams.startFaceRef`：与 faceExtrude 双路径）、C（无面身份）、
  D（replay-only 硬编码/调参：非参数化、不可 AI 编辑）。
- 无 UI：无 live 起始面/拔模对话框证据；AI/回放走标准 FeatureOp + 已解析 faceRef。

**Approval/next steps（已批准；实现另批）:**
- [x] 用户批准实现（AIRR + ADR-0016，2026-11-10）。
- [x] A1（**已实现，non-exact，2026-11-10**）：shared 1.64.0 契约 + backend schema/求值器 +
      面轮廓与既有整环拔模 helper 适配 + body 归属/环分类/零相交失败封闭；
      面轮廓/offset/angle 参数往返；真栈 prismoid **657,764.787 mm³** push+冷重开；
      **不宣称解析边/20-20（A2 后续达成）**。能力状态：无 UI；converter/translator
      属 A3 未接；发布需新 backend 产物（旧 backend-20261109 不识别新字段，X-11）。
- [x] A2：解析边 spike/实现（私有 native/TS 或等价构造；无 P0-08）；合成矩形 →
      tool/最终 Unite **20/20 line**、297,764.787/657,764.787、holed 全 line/arc。
      **Bumper 实测证明原“20/20（含底面 loop）”门与 Onshape 选择不符**：实际选择
      16 条（底面 4 条尖边未选）；ADR-0016/AIRR 已修订为 16/16 + 底面尖边。
- [x] A3：S9/S10/S11 已解析证据指针 + converter `capFaceProfile`（起始面
      平面/面积/AABB 证据，featureId 索引，ADD-only）+ translator
      `faceExtrude` startOffset/draft + runner 起始面解析（`readFaceHandles`
      唯一匹配 → `resolveFaceRef`）；旧 capFaceExtrude/start-reference 近似路径
      保留；未解析 fail closed（test-only）。
- [x] A4：Bumper 严格轨已实测：pre-fillet **657,764.787185**（绝对容差
      0.01 mm³）、20/20 line、rb=3 oracle **16/16**、最终
      **636,731.650（+0.000024%）**、全 status=0、1 body、push+冷重开、
      approximateSteps=0、冷重开落库参数复核。ADR-0016/AIRR 已修订为
      16/16 + 底面尖边；审计 20 边回退已退役。Bumper 私有索引为
      `replicable-now`（第 18 例），携带 `genericResolver=12-edge blocked`、
      `requiresBackend=backend-20261110`、`strictPath=rb3-oracle-16/16`；
      A1/A2 随 `backend-20261110` 发布，私有 evidence 已提交。
- [ ] UI：另 AIRR（live 证据齐备后）。

---

## Task 7: PROJECTED / 多体 AIRR-ADR（设计，不写产品代码）

**Files:**
- Create/modify: `docs/superpowers/specs/2026-11-09-sketch-external-refs-async-airr.md`
- Modify: `docs/adr/0009-sketch-external-references.md`
- Create/modify: `docs/adr/0015-multi-target-feature-scope.md`

**Interfaces:** 无代码接口；产出设计/决策/回滚/测试矩阵。

> **2026-11-09 完成（设计）**：AIRR、ADR-0009 增量与 ADR-0015 扩展已落，状态均为
> **提议/未批准**；P3/P5 保持 blocked-design；**未批准前不写产品代码**；不计入严格绿。

- [x] **Step 1: PROJECTED 1b AIRR**

写清：当前同步读草图 → 实体边投影需异步 `SolidModelingCommand`；评估
(a) 异步草图求值路径，(b) 可失效同步快照缓存；选一；旧库回退；UI 证据缺口；
测试矩阵（平行/非平行、源面失效、跨体）。

- [x] **Step 2: 多体 ADR-0015**

写清单 FeatureOp 多目标契约（`targetBodyIds` vs per-body 子操作）、
fillet/pattern/mirror 的跨体语义、事务/撤销、失败回退；明确不改变单 target
旧载荷。

- [x] **Step 3: 设计登记（评审签字另列）**

计划文档记录“未批准前不写产品代码”；把 P3/P5 任务保持 blocked-design；
不把 AIRR/ADR 当作绿例。本 step 只登记设计，不宣称评审通过；复审/签字由 reviewer
与用户另列。

- [x] **Step 4: 提交**

```bash
git add docs/superpowers/specs/2026-11-09-sketch-external-refs-async-airr.md \
  docs/adr/0009-sketch-external-references.md docs/adr/0015-multi-target-feature-scope.md
git commit -m "docs: AIRR/ADR for external sketch refs and multi-body scope"
```

---

## Task 8: 重索引、演示与阶段收口

> **执行结果（2026-11-09）**：strict `replicable-now` **16**（目标 ≥18，未达，
> 缺口 2）；`verify-example-index` **0 errors / 5 warnings**。新增严格绿：
> Intro Part 3（229,418.896 mm³，0.000%）与 Sample Assignment / Alignment
> （8,915.890 mm³，+0.00034%）。**计数口径**：16 为当前工作树；干净私有检出
> 重索引为 15（私有索引生成器/converter/scenario 未提交，Part 3 strict 依赖
> 私有 scenario）；Alignment 的 `Cut 2 more holes` 保留一条已审计人工面域覆盖，
> 纯证据驱动计数 15（`Cut 2 holes` 面积证据精确）。缺额原因与未解决项证据见
> `2026-11-09-ps-blocker-driven.md`「PS blocker 下一阶段执行记录」。
> **2026-11-10 发布闭口**：目标 ≥18 达成——私有
> `manifest/example-index.json` `replicable-now` **18**（Bumper 为第 18 例，
> 字段 `strictPath=rb3-oracle-16/16`、`requiresBackend=backend-20261110`、
> `genericResolver=12-edge blocked`）、`verify-example-index` **0 errors /
> 5 warnings**；公开 strict spec **19**（含 Bumper S10 严格轨与 iOS First
> Part）。iOS First Part 用 `EXAMPLE_RESET=1` 真栈 **2 passed（1.9m）**：
> 157,478.736 vs 157,478.9（0.0001%）、树 sketch/extrude/extrude/chamfer
> 全 status=0、1 body、push+冷重开。A1/A2 随 `backend-20261110`（shared
> 1.64.0）发布，私有 converter/oracle/scenario 已提交；发布产物 Bumper
> strict 2 passed。Bumper 的 generic resolver 仍是 12 边 blocked-kernel，
> 不得把 strict 轨说成通用能力。

**Files:**
- Private: `manifest/example-index.json`, `manifest/face-evidence.json`,
  `manifest/centerline-forms.json`
- Public: `docs/superpowers/plans/2026-11-09-ps-blocker-next.md`、
  `docs/superpowers/plans/2026-11-09-ps-blocker-driven.md`
- Demo: `luban-cad/apps/web/demo-artifacts/examples/index.html`（本地生成）

- [x] **Step 1: 重生成索引并验证（2026-11-09 首次执行 16/18；2026-11-10 闭口 18/18）**

```bash
cd <private onshape-parity-data>
node tools/index-examples.mjs
node tools/verify-example-index.mjs
```
Expected: 0 errors；strict `replicable-now` ≥18；blocked 计数有变化时记录原因。
Actual: **0 errors / 5 warnings；strict 16**（未达 18）。归因修正：Part 3 移出
`KNOWN_SELECTOR_BLOCKERS`（真栈严格绿证据）；Part 4 blocker 更新为 2/4/70 候选；
`CENTERLINE_DIMENSION` 按 converter→产品 `DISTANCE` 归因（4 PS constraints
dropped→complete，无分类提升）。blocked-selector 4 → 3。

2026-11-10 闭口复跑：`node tools/index-examples.mjs` → `replicableNow=18`、
`measurableReplicableNow=18`、`rawReplicableNow=46`；`node
tools/verify-example-index.mjs` → **0 errors / 5 warnings**（与首次执行相同的
5 条空 features 签名警告）。blocked-kernel 4 → 3；replicable-now 17 → 18。

- [x] **Step 2: 回归门**

```bash
cd luban-cad/packages/shared && corepack pnpm@10 test && corepack pnpm@10 run build
cd ../apps/web && corepack pnpm@10 test && corepack pnpm@10 exec tsc --noEmit
npx playwright test e2e/examples/<changed-specs> --reporter=line
```
Actual: shared **192/192** + build clean；web **1527/1527**（116 files）+ tsc
（app/e2e）clean；真栈逐 spec：Part 1/2/3 各 **2 passed**、sample **2 passed**、
drive-sleeve **3 passed**、wheel **2 passed**、scenario-to-op **51 passed**、
bumper record **2 passed**（+3.303%，未升绿；2026-11-09 follow-up 审计 20 边
覆盖：634,347.216 vs 636,731.499，−0.374%。**2026-11-10 A4 最终取代**：
S10 faceExtrude + rb=3 oracle **16/16 实际选择** → **636,731.650（+0.000024%）**、
全 status=0/1 body/push+冷重开；审计 20 边回退已退役，见 Task 6b/A4）、
demo Part 3 **2 passed**、
ShowcaseRoute **1/1**。Part 4/5/6 保持 test.fail known-red。批量首轮遇 MS
100 req/15min 429，按 spec 分窗重跑（未改配置）；`verify-imodels` 可选未跑
（严格用例用自管 E2E iModel，未重置既有持久示例）。

- [x] **Step 3: 演示素材/画廊**

若新增严格绿示例：用 `e2e/examples/demo-new-examples.spec.ts` 的同一模式补
manifest/截图；`node luban-cad/scripts/onshape-parity/gallery.mjs` 重生成；
如需更新 `/showcase`，按现有 1920×1080 webp 资产格式增加卡片。
Actual: 新增 `intro-part-3`（manifest + 1920×1080 WebP，iModel 7d81c6b0，
actual=229418.896）；gallery **17 manifests / 13 state docs / 0 mismatch**；
`/showcase` Intro 卡片更新为 Part 1–3（真实截图）。未为 blocked 项加卡片。

- [x] **Step 4: 计划收口**

在 `2026-11-09-ps-blocker-driven.md` 追加本阶段执行记录：
- 每个 Task 的 strict/blocked 实际结果；
- 新严格绿清单与体积误差；
- 未解决项的证据路径（不得写“完成”）；
- 阶段目标 18 的达成/未达成与原因。
Actual: 已追加「PS blocker 下一阶段执行记录（2026-11-09，Task 8 收口）」，
含逐任务表、严格绿/误差、缺口 2 的原因与证据路径。

- [x] **Step 5: 提交/推送（按用户授权）**

```bash
git add docs luban-cad/packages/shared luban-cad/apps/web/e2e
git commit -m "docs(plan): close PS blocker next phase"
git push origin main
```
Actual: 已提交 docs/演示/画廊资产到 main；**按授权不 push**。私有仓生成物
（index/face-evidence/centerline-forms/converter/scenario）保持未提交；
native/backend 仓未提交。

---

## 验证矩阵

| 变更 | 单元 | 契约 | 真栈 |
|---|---|---|---|
| shared bbox 选择 | `profile-area-select.test.ts` 全绿 | `tsc` + shared build | Drive Sleeve、Intro Part 3 |
| regionRisk area 证据 | converter 转换 + index verify | translator 50/50 | Alignment、iOS |
| CENTERLINE refs | scenario-to-op 新单测 | shared build | Fox RP23（或 blocked 证据） |
| capFace/sweptFace 证据 | collector 测试 | index verify | 目标 PS spec |
| Bumper 多边 fillet | native ctest | 下游字段无变化 | Bumper strict（ADR-0016 A2/A3/A4：Fillet 1 **16/16 实际选择**，底面 4 条 z=0 边尖边未选；旧审计 20 边回退已退役，曾多选底面 loop）；通用 resolver 12 边仍 blocked-kernel |
| CAP_FACE 起始面+拔模（ADR-0016，A1/A2/A3/A4 已实现） | shared 1.64.0 契约 + S1/S5/S9/S10/S11 已解析证据 | 后端 faceExtrude/A2 测试；公共 translator/resolver 单测；真栈 Bumper strict + A2 face-extrude + Part 3 | A1 prismoid 297,764.787 baseline（不宣称精确）/ A2 解析边 tool 12/12、最终 Unite **20/20 line** + pre-fillet **657,764.787185** + Fillet 1 **16/16 实际选择**（底面 4 条尖边未选）+ 最终 **636,731.650 vs 636,731.499（+0.000024%）**、全 status=0/1 body/push+冷重开/approximateSteps=0；旧 −0.374% 归因审计 20 边回退多选底面 loop，已退役；Bumper 私有索引为 replicable-now（第 18 例；`strictPath=rb3-oracle-16/16`、`requiresBackend=backend-20261110`、`genericResolver=12-edge blocked`）；A1/A2 已随 `backend-20261110` 发布、私有 evidence 已固化；generic resolver 仍 12 边 blocked-kernel（独立限制） |
| AIRR/ADR | 文档自检 | 无代码 | 无 |

## 停止条件

- 面积/bbox 仍多解 → `blocked-selector`，禁止任选同面积子集。
- 目标面面积无法从采集证据唯一反解 → `blocked-evidence`，不猜。
- PROJECTED/多体未批准 AIRR/ADR → 不写产品代码。
- 内核失败不能复现或修复 → `blocked-kernel` + native 台账，不用产品近似冒充。
- CAP_FACE 起始面/拔模（ADR-0016）A1/A2/A3/A4 已实现；A2 解析边 tool/最终 Unite
  **20/20 line** 已达成；Fillet 1 以 **16/16 实际选择**（底面 4 条 z=0 loop 尖边
  未选）为准，不得补成 20 条、不得用审计 20 边回退或 `curvePrimitive` 冒充。
- A1 只记录 prismoid 297,764.787 baseline（不宣称精确）；体积不是 A2 的差异化项；
  A2 已达成：解析边 20/20 line + pre-fillet **657,764.787185** + Fillet 1
  **16/16** + 最终 **+0.000024%**。
- Bumper pre-fillet 体积门（657,764.787185）与 **16/16 实际选择 + 底面 loop
  尖边**必须同时满足；不得用最终 ±0.5% 掩盖。旧 −0.374% 是审计 20 边回退
  多选底面 loop（≈2,384 mm³），不是下游 fillet 能力边界，也不是 Extrude 2 残差；
  16 边轨最终差 +0.151 mm³（+0.000024%）。
- S1/S5/S9/S10/S11 已解析（2026-11-10）；A 只覆盖 37 个 face-driven profile，
  29 个 start-reference 保持 blocked/approximate；A2 以解析边 20/20 +
  Fillet 1 16/16 实际选择为准。
- 任何真栈非 status=0 或体积超差 → 不放宽断言，不升严格绿。

## 阶段退出标准

1. 严格绿 ≥18（从 14 起）；所有新增绿都有真栈树/status/逐 body 体积/push+冷重开。
2. 新增 blocked 项都有可复现证据路径。
3. shared/web 全量、tsc、index verify 全绿。
4. 计划、ADR、审计台账、演示画廊同步更新。
