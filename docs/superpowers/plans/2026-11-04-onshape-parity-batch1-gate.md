# Onshape Parity Batch 1 Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close Tutorial 2 X-14 (Extrude 2 region 4) with a deterministic, true-stack UI path and register the remaining Batch 1 capability gaps without weakening any assertion.

**Architecture:** The failure is a test/viewport framing defect, not a modeling defect: the strict e2e never framed the camera because `showcaseScene` returned early outside showcase mode, so the third profile region projected above the canvas while `profilePickPoints` still emitted an off-canvas fallback. The fix adds a feature-only `frameScene(SCENES.partIso)` call in the extrude/revolve dialog helpers, hardens the picker so it never advertises an unsafe point, and records the evidence. No FeatureOp, RPC, BIS schema, or product modeling path changes in this plan.

**Tech Stack:** Playwright (true stack :5300 + modeling-server :5401), Vitest, iTwin.js 5.15 viewport APIs, `@luban-cad/shared` 1.22.0 (ADR-0005 Phase 1).

**Spec:** `docs/superpowers/specs/2026-11-04-onshape-example-replication-airr.md` (approved 2026-11-04); scenario contract design in `docs/adr/0003-onshape-parity-scenario-contract.md`.

## Global Constraints

- **P0-04:** no new FeatureOp, feature type, sketch constraint kind, BIS schema, or runtime RPC in this plan. The iOS example's `DIAMETER`/chamfer gaps are registered, not implemented here; they need ADR-0004 plus a shared version bump.
- **P0-05/P0-07:** all model writes continue through `LubanFeatureRpcInterface`/`FeatureOp`; no test-only modeling path may bypass it.
- **Known-red honesty:** X-14 may only be closed by a true-stack `tutorial2.spec.ts` 1/1 run. Do not relax, delete, or skip any assertion; do not replace volume/body-count checks with screenshots.
- **Camera setup is test scaffolding:** `setStandardView` is already used by the fillet stage; using it before profile picking does not change product behavior or the modeling result.
- **Public/private boundary:** raw Onshape responses, screenshots, and UI evidence stay in the private `onshape-parity-data` repo. Public changes are limited to schema/runner/test harness and aggregate expectations.
- **Commands:** run e2e from `luban-cad/apps/web`; run unit tests from the package that owns the file; use `corepack pnpm@10`, not registry pnpm.
- **Commits:** commit only when the user explicitly asks; this plan records verification output first.

---

### Task 1: Make the strict e2e camera deterministic before profile picking

**Files:**
- Modify: `luban-cad/apps/web/e2e/tutorial2-showcase.ts:147-160`
- Modify: `luban-cad/apps/web/e2e/tutorial2.spec.ts:52-61,79-95,119-135`
- Test: `luban-cad/apps/web/e2e/tutorial2.spec.ts` (existing strict test)

**Interfaces:**
- Consumes: `setStandardView(page, viewId, {low, high})` from `tutorial2-helpers.ts:175`.
- Produces: new `frameScene(page, scene)` that always applies the camera; `showcaseScene` keeps its showcase-only hold/screenshot behavior and calls `frameScene` internally.

**Failed experiment (2026-11-04, do not repeat):** making `showcaseScene` unconditional
framed the camera during sketch drawing too. That moved the 3-point-arc final click to
screen `(1090,262)`, inside the ViewCube hit area; the third click was swallowed and the
sketch stayed at 6 entities. The fix must frame only at feature-profile selection.

- [x] **Step 1: Confirm the current failure mode**

Run the strict test once before the fix (already reproduced on 2026-11-04):

```powershell
cd D:\Github\tiangong-kaiwu\luban-cad\apps\web
npx playwright test e2e/tutorial2.spec.ts --project=chromium
```

Expected before fix: sketch stage passes 18 entities / 48 constraints / 9 dimensions; failure at Extrude 2 region 4 with `data-region-points` y outside the canvas. Save the log to `test-results/t2-strict-before.log`.

- [x] **Step 2: Add a feature-only framing helper**

In `tutorial2-showcase.ts`, add:

```ts
/**
 * 无条件按场景范围取景（严格/展示模式共用的测试前置）。
 * 只用于特征面域拾取等需要确定性视口的步骤；草图绘制阶段仍保留原有相机，
 * 否则会把弧点推到 ViewCube 命中区（2026-11-04 X-14 复测实测）。
 */
export async function frameScene(page: Page, scene: ShowcaseScene): Promise<void> {
  await setStandardView(page, scene.viewId, { low: scene.low, high: scene.high });
}

/** 相机到场景 + 驻留 + 截图（仅展示模式）。 */
export async function showcaseScene(page: Page, scene: ShowcaseScene): Promise<void> {
  if (!showcaseEnabled()) return;
  await frameScene(page, scene);
  await page.waitForTimeout(scene.holdMs ?? 850);
  const index = String(++shotCounter).padStart(2, '0');
  await page.screenshot({ path: `test-results/t2-showcase-${index}-${scene.label}.png` });
}
```

- [x] **Step 3: Frame only in the feature dialog helpers**

Import `frameScene` from `./tutorial2-showcase` in `tutorial2.spec.ts`. In
`extrudeViaDialog`, after `await expect(marker).toBeAttached(...)` and before the
`expect.poll` on `data-region-points`, insert:

```ts
  // X-14：按整张草图+模型范围取景后再读面域点，保证拱肩翼面域在画布内。
  await frameScene(page, SCENES.partIso);
```

Do the same in `revolveViaDialog` before its `expect.poll`:

```ts
  // X-14：旋转面域同样先按整张草图+模型范围取景。
  await frameScene(page, SCENES.partIso);
```

Why this is sufficient for X-14: the profile picker opens after the sketch is finished, so
framing at this point cannot disturb sketch drawing. `SCENES.partIso` covers the full model
and the arch lobe used by E2/E3/R1. If the lobe is still clipped, add a dedicated
`featureProfiles` scene with larger `z` high (for example `high.z = 140`) and use it in both
helpers; do not re-enable unconditional framing during sketch drawing.

- [x] **Step 4: Run the strict test and inspect the profile-pick logs**

```powershell
cd D:\Github\tiangong-kaiwu\luban-cad\apps\web
npx playwright test e2e/tutorial2.spec.ts --project=chromium 2>&1 | Tee-Object test-results/t2-strict-after.log
```

Expected: `1 passed` (plus setup), final feature tree `sketch, extrude, extrude, extrude, revolve, fillet`, one active body, no-fillet volume within 357.988 ±0.5%, final volume within 357.568 ±0.5%, fillet removal 0.35–0.50 cm³.

If it still fails on a region point, do **not** change assertions. Capture the failing region's `data-region-points` entry and the current `SCENES.partIso` range, then enlarge only the `partIso` low/high symmetric around the model center until every requested region is inside the canvas. Record the new range in the test log.

- [x] **Step 5: Record verification output**

Append the exact command, pass count, volume values, and date to `test-results/t2-strict-after.log`. Do not commit yet.

---

### Task 2: Never advertise an off-canvas profile pick point

**Files:**
- Modify: `luban-cad/apps/web/src/modules/part-studio/internal/profile-picker.ts:71-111`
- Modify: `luban-cad/apps/web/src/modules/part-studio/test/profile-picker.test.ts`
- Test: `luban-cad/apps/web/src/modules/part-studio/test/profile-picker.test.ts`

**Interfaces:**
- Consumes: `projectRegion`, `pointInRegion`, `ScreenPoint` (unchanged).
- Produces: `profilePickPoints(viewport, sketches): Array<ProfilePick & ScreenPoint>` — only safe points are returned; when a region has no safe interior sample it contributes no entry. `FeatureProfilePicker` continues to render `data-region-points` from this array.

- [x] **Step 1: Write the failing test**

Add this test after the existing `profilePickPoints：每面域一个安全屏幕点` case:

```ts
it('面域完全在安全区外 → 不返回兜底点（X-14）', () => {
  const offscreen: ProfileSketch = {
    ...sketch,
    regions: [{
      area: 100,
      outerEntityIds: [1],
      // 世界 x=1000 → 屏幕 x=20300，远在 900px 视口之外。
      outerBoundary: square(10, 1000),
    }],
  };
  expect(profilePickPoints(viewport, [offscreen])).toEqual([]);
});
```

Also add a case proving the x-axis safety rule independently:

```ts
it('面域在左侧对话框下方（x 不安全）→ 不产点', () => {
  const underDialog: ProfileSketch = {
    ...sketch,
    regions: [{
      area: 100,
      outerEntityIds: [1],
      // 世界 x=-16..-6 → 屏幕 -20..180，整块在左侧对话框下方；
      // 世界 y=-16..-6 → 屏幕 620..420，纵向可点，但 x 不安全 → 无点。
      outerBoundary: square(10, -16),
    }],
  };
  expect(profilePickPoints(viewport, [underDialog])).toEqual([]);
});
```

The second case documents the semantics: safety requires both axes; there is no "partly safe" fallback.

- [x] **Step 2: Run the tests to verify they fail**

```powershell
cd D:\Github\tiangong-kaiwu\luban-cad\apps\web
npx vitest run src/modules/part-studio/test/profile-picker.test.ts
```

Expected: the first new test fails because the current code returns a fallback array with one entry at `x≈20300`; the second fails because the current fallback is emitted at an unsafe x.

- [x] **Step 3: Remove the unsafe fallback and use a denser safe search**

Change the sampling block in `profile-picker.ts` from:

```ts
      let fallback: ScreenPoint | undefined;
      let found: ScreenPoint | undefined;
      const steps = 9;
      outer: for (let i = 1; i < steps; i++) {
        for (let j = 1; j < steps; j++) {
          const p = {
            x: left + ((right - left) * i) / steps,
            y: top + ((bottom - top) * j) / steps,
          };
          if (!pointInRegion(p, loops)) continue;
          fallback ??= p;
          if (safe(p)) {
            found = p;
            break outer;
          }
        }
      }
      const point = found ?? fallback;
      if (point) result.push({ sketchId: sketch.id, regionIndex, ...point });
```

to:

```ts
      let found: ScreenPoint | undefined;
      // 17×17 采样：细窄环带也能找到安全内部点；找不到就明确不产点，
      // 绝不把画布外兜底点交给演示/e2e 去点击（X-14）。
      const steps = 17;
      outer: for (let i = 1; i < steps; i++) {
        for (let j = 1; j < steps; j++) {
          const p = {
            x: left + ((right - left) * i) / steps,
            y: top + ((bottom - top) * j) / steps,
          };
          if (pointInRegion(p, loops) && safe(p)) {
            found = p;
            break outer;
          }
        }
      }
      if (found) result.push({ sketchId: sketch.id, regionIndex, ...found });
```

- [x] **Step 4: Run the tests to verify they pass**

```powershell
cd D:\Github\tiangong-kaiwu\luban-cad\apps\web
npx vitest run src/modules/part-studio/test/profile-picker.test.ts
```

Expected: all profile-picker tests pass, including the existing safe-point and legacy-region cases.

- [x] **Step 5: Run the true-stack strict test again**

```powershell
npx playwright test e2e/tutorial2.spec.ts --project=chromium
```

Expected: `1 passed`. If it fails at a region with no point, that means the camera still clips the profile; return to Task 1 Step 3 and enlarge the scene range. Do not restore the fallback.

---

### Task 3: Close X-14 with evidence and update the baseline docs

**Files:**
- Modify: `docs/architecture/EXCEPTIONS.md:23`
- Modify: `luban-cad/CLAUDE.md:169`
- Modify: `docs/UI-ONSHAPE-PARITY-2026-11-02.md` (verification baseline section)
- Test: `luban-cad/apps/web/test-results/t2-strict-after.log` (evidence)

**Interfaces:**
- Consumes: the 1/1 strict run and volume/body-count output from Task 2.
- Produces: X-14 row marked closed with date, command, result, and evidence path; CLAUDE.md no longer lists X-14 as known-red.

- [x] **Step 1: Extract exact evidence**

From `test-results/t2-strict-after.log`, record:

```text
[ ] strict test command
[ ] pass count (setup + chromium)
[ ] feature tree types/status
[ ] active body count
[ ] no-fillet volume cm³
[ ] final volume cm³ and fillet removal cm³
[ ] date/time
```

- [x] **Step 2: Update EXCEPTIONS.md**

Change the X-14 row status from open to closed. Keep the historical failure text and append:

```text
已关闭（2026-11-04）：根因=严格模式 showcaseScene 早退导致相机未取景，拱肩翼面域投影到画布上方；profilePickPoints 又给出画布外兜底点。修复=showcaseScene 两种模式统一 setStandardView(partIso)，profilePickPoints 只返回安全点（17×17 采样，无兜底）。证据=`luban-cad/apps/web/test-results/t2-strict-after.log`，`tutorial2.spec.ts` 1/1，特征树/体积/单 body 断言全绿。
```

- [x] **Step 3: Update luban-cad/CLAUDE.md**

Replace the known-red sentence listing X-14 with:

```markdown
- **known-red**：`sketch-extrude` 仍红（无 closed region）；`tutorial2` X-14 已于 2026-11-04 关闭（真栈 1/1，证据 `apps/web/test-results/t2-strict-after.log`）。不得通过放宽断言“修复”任何红项。
```

- [x] **Step 4: Update the UI parity verification baseline**

In `docs/UI-ONSHAPE-PARITY-2026-11-02.md`, update the tutorial2 verification line to cite the 2026-11-04 re-run, 1/1 result, and the volume values. Mark older "1/1" claims as historical if they predate X-14.

- [x] **Step 5: Verify no stale X-14 claim remains**

```powershell
cd D:\Github\tiangong-kaiwu
rg -n "X-14|拉伸 2 面域 4|tutorial2.*known-red" docs luban-cad/CLAUDE.md
```

Expected: only the closed X-14 row and the closure note; no bullet still calls it open.

---

### Task 4: Register the remaining Batch 1 capability gaps (no coding)

**Files:**
- Create: `docs/superpowers/specs/2026-11-04-onshape-batch1-gap-matrix.md`
- Modify: `docs/superpowers/specs/2026-11-04-onshape-example-replication-airr.md` (link the gap matrix)

**Interfaces:**
- Consumes: the 2026-11-04 gap analysis and private corpus facts:
  - Bench Vise SPINDLE: 2 parts, 7 features; gaps = construction flag, additional constraints, revolve NEW/REMOVE, cPlane/assignVariable, custom thread, per-body massproperties.
  - Quickstart SPINDLE: same shape; only BASE UI captured.
  - Part Feeding Machine Pallet: 1 part, 8 features; gaps = extrude REMOVE/end bounds/draft, FEATURE pattern/mirror, chamfer/shell UI, extra constraints/construction.
  - Exercise: Clamp: 2 Part Studios, 11 features each; gaps = rib/draft/intersect/end bounds/FACE mirror, extra constraints; no massproperties/parts.
  - Tutorial 2 iOS: 4 features; gap = DIAMETER sketch dimension; massproperties/parts pending.
- Produces: a table that maps each Batch 1 example to: (a) supported today, (b) blocked by shared contract, (c) blocked by data, and the exact ADR/next plan needed.

- [x] **Step 1: Write the gap matrix**

Use this structure:

```markdown
# Onshape Batch 1 能力/数据缺口矩阵（2026-11-04）

| 示例 | Part Studio / 特征 | 今天可回放 | 共享契约缺口 | 数据缺口 | 下一步 |
|---|---|---|---|---|---|
| Tutorial 2 - Build a Part | 1 PS / 6 特征 | sketch/extrude NEW/ADD/revolve/fillet | 无 | 无（gold） | 本计划关闭 X-14 |
| Tutorial 2 iOS | 1 PS / 4 特征 | sketch/extrude NEW/ADD/chamfer | DIAMETER 草图尺寸（shared 1.21.0 无） | parts/massproperties 待补 | ADR-0004 sketch contract |
| Bench Vise SPINDLE | 1 PS / 7 特征 | extrude/fillet 部分 | construction、revolve NEW/REMOVE、cPlane/assignVariable、custom FeatureScript | 逐 body massproperties | ADR-0004/0005 |
| Quickstart SPINDLE | 1 PS / 7 特征 | 同上 | 同上 | 目标 PS 的 UI/parts 待补 | ADR-0004/0005 |
| Part Feeding Machine Pallet | 1 PS / 8 特征 | extrude NEW 部分 | REMOVE/end bounds/draft、FEATURE pattern/mirror、chamfer/shell 参数面 | 逐 body massproperties | ADR-0005 |
| Exercise: Clamp | 2 PS / 11 特征 | sketch 部分 | rib/draft/intersect/end bounds/FACE mirror、额外约束 | parts/massproperties 全缺 | ADR-0004/0005 |
```

Under the table, add three paragraphs:

```markdown
## 契约批次

- **ADR-0004（sketch contract）**：construction 标志、DIAMETER/ANGLE/CONCENTRIC/PROJECTED/MIRROR/PIERCE 约束、centerline、driven/reference 尺寸。变更 `SketchEntityDto`/`SketchConstraintDto`，必须 bump shared minor 并双端同发布；需要 SolverTypes 冻结清单 + 双跑语料。
- **ADR-0005（feature contract）**：extrude endBound（THROUGH_ALL/UP_TO_NEXT/UP_TO_SURFACE/UP_TO_VERTEX）、REMOVE/INTERSECT、方向/起始偏移/draft、hole、feature/face pattern、mirror plane、rib/draft。新增 FeatureOp 字段或类型必须版本化 + 旧库 fixture + 回滚。
- **不在本批次**：sheet metal、assembly mate、custom FeatureScript（logoMaker/thread）、drawing。

## 数据优先级

配额恢复后先跑 `tools/mass-by-part.mjs`（Bench/Quickstart/Part Feeding），再补 Clamp/iOS 的 parts + UI；没有逐 body 数据的示例只能标记 `blocked-evidence`，不得用聚合体积冒充单 body。
```

- [x] **Step 2: Link the matrix from the AIRR**

Append to the AIRR §1 after the Batch 1 data status:

```markdown
- 能力/数据缺口与契约批次：见 `docs/superpowers/specs/2026-11-04-onshape-batch1-gap-matrix.md`。
```

- [x] **Step 3: Verify the plan/gap files are internally consistent**

```powershell
cd D:\Github\tiangong-kaiwu
rg -n "DIAMETER|construction|endBound|blocked-evidence" docs/superpowers/specs/2026-11-04-onshape-batch1-gap-matrix.md
```

Expected: every blocked example names a concrete shared contract gap and the ADR that must precede implementation.

---

## Execution record（2026-11-04）

- `tutorial2.spec.ts`：**2 passed**（setup + strict，3.8 min），`PLAYWRIGHT_EXIT=0`。
  六特征 status 全 0；无圆角体积 358.161 cm³（fixture 357.988，+0.048%）；
  终体积 357.739 cm³（fixture 357.566，+0.048%）；四短棱去材 0.422 cm³。
  证据日志：`luban-cad/apps/web/test-results/t2-strict-after.log`。
- 回归：`tutorial2-tools.spec.ts` **6 passed**（setup + 绘制/约束/标注/双击树/偏移，
  3.8 min），日志 `luban-cad/apps/web/test-results/t2-tools-after.log`。
- 单元：`profile-picker.test.ts` 7/7；`tsc --noEmit`（web）与
  `tsc -p tsconfig.e2e.json --noEmit` 均通过；修改文件 eslint 0。
- 失败实验记录：把 `showcaseScene` 改为全模式取景后，草图 3 点圆弧第三点落到
  `(1090,262)` 的 ViewCube 命中区，实体数停在 6；已回退，改为特征对话框专用的
  `frameScene(SCENES.partIso)`。
- 数据仓：逐 body 质量属性已覆盖 9 文档 / 87 Part Studio（Bench、Quickstart、
  Feeding、Dumper Trailer、Sample Assignment、Jackhammer、3D Hose、laser cutter、
  POW），提交 `4b2de9d` 已推送。
- 公开仓改动尚未提交（按 P0 纪律，等用户明确要求再 commit/push）。

## 续作记录（2026-11-04，owner 指示继续）

- **ADR-0003 已接受并落地**：`parity-scenario.schema.json` + `scenario.mjs`
  validator/loader + `from-gold.mjs` + Tutorial 2 scenario fixture；`node --test`
  **8/8 passed**。私有数据仓 `tools/scenario/from-onshape.mjs` 生成 iOS 场景
  （4 特征，blocked-capability 缺项显式登记）。
- **ADR-0004 第一切片**：point+circle coincident 在 SolverTypes/Normalizer/SlvsSolver
  实现，`SolverTypes.ts` 冻结 hash 更新为 `bc9143…`；`SlvsSolver+SolverTypes` **78/78**、
  `SketchWireNormalizer` **5/5**、`tsc --noEmit` 通过。
- **Tutorial 2 iOS 几何回放通过**（私有后端 `Tutorial2IosReplay.test.ts`）：
  5 面域（3 材料 + 2 孔）→ E1 三材料 25mm NEW → E2 左环 symmetric 50mm ADD →
  Chamfer 2mm 三 cap 边；单 body、四特征 status 0、终体积 **157.165 cm³**
  （目标 157.479，**-0.20%**，<0.5%）。
  当时已知约束缺口：4 条 line+整圆 tangent 省略（草图 dof=4）、DIAMETER 映射为
  radius；两项均已在下方「ADR-0004 第一切片完成」补齐（iOS 回放现为 dof=0）。
- **ADR-0004 第一切片完成（shared 1.23.0）**：construction、diameter、concentric、
  driven、line+整圆 tangent（端点共圆语义；内部 1 条半径线⟂line，DOF 净 −1）。
  后端 sketch **87/87**、web 目标测试绿；iOS 回放改为**全量约束**：
  `status=ok dof=0`（4 tangent + 2 DIAMETER 全参与），终体积 157.165 cm³ 不变。
  前端约束槽位接受 circle+line 与 point+circle coincident；圆尺寸默认 DIAMETER/⌀
  标注、construction 切换与虚线。真栈 `tutorial2-tools` 新增圆直径+共圆相切 UI 用例。
- **ADR-0005 Phase 2 第一项（v1.23）**：revolve `operation="new"` 已落地——NEW-body 行
  不消费上游，独立新体；schema 拒绝 new+mergeScope；FeatureService 目标规划与
  FeatureDialog 新建页签同步。验证：后端 feature 子集 **79/79**（含 revolve NEW
  第二个 body、4000π 圆柱体积）、FeatureDialog **130/130**。
- **ADR-0005 Phase 2第二项（shared 1.24.0）**：extrude `secondDirection` 落地
  （blind/throughAll、缺省反向、symmetric 互斥；与主方向先 Unite 再参与布尔）。
  验证：正向 5 + 反向 3 体积 1600/质心 z=1；shared 152/152。UI 仍无 live 证据，
  不新增控件。
- ADR-0004/0005 已接受；0005 聚焦 extrude/revolve，其余特征转 ADR-0006。
- **ADR-0005 Phase 1 已落地（shared 1.22.0）**：extrude `remove`/`intersect`、
  `endBound=blind|throughAll`、`direction`、`startOffsetMm`；revolve `remove`。
  UI 移除/相交页签启用（extrude）、revolve 移除启用、方向/起始偏移进入真实 params
  与预览。验证：`FeatureOperationSemantics`（remove/throughAll/direction/offset/
  intersect 体积+质心）、`RevolveFlow` 9/9（方柱−半圆柱=64−π）、
  `FeatureTypeRegistry` 21/21、FeatureDialog 130/130、shared 151/151、tsc 绿。
  注意：shared 1.22.0 与本地 MS 产物 1.21.0 有版本门禁，开发栈已切到 MS 源码模式；
  发布产物必须按 shared→backend→web 重建后才能回到产物模式；源码 MS 1.22.0 下
tutorial2 strict 已复跑 2 passed（4.0 min，体积不变）。

## Self-Review

**Spec coverage:**
- X-14 known-red closure → Task 1/2/3, with true-stack evidence and no assertion changes.
- AIRR Batch 1 table → revised to replace empty Skateboard with Tutorial 2 iOS; gap matrix Task 4 records what remains.
- P0-04 → no FeatureOp/schema changes; capability gaps explicitly deferred to ADR-0004/0005.
- Data completeness → per-part massproperties tool and priority recorded in the private data repo; public gap matrix references it without raw data.

**Placeholder scan:** no TBD/TODO; every task has exact files, commands, expected results, and code snippets.

**Type consistency:** `showcaseScene(page, scene)` signature unchanged; `profilePickPoints(viewport, sketches)` signature unchanged; scenario-capability names match the gap matrix and AIRR.

**Out of scope (next plans after ADR approval):**
1. ADR-0003 acceptance + `parity-scenario.schema.json` + T2/iOS scenario exporter/replay.
2. ADR-0004 + sketch contract implementation (construction/DIAMETER/ANGLE/etc.) and UI.
3. ADR-0005 + extrude/feature capability implementation.
4. Batch 1 example e2e for Bench/Quickstart/Pallet/Clamp once capabilities and per-body data land.
