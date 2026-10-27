# Isomantle coincident-face Unite R&D Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 查清并根治全保真回放中 `ops[6]`（sketch-on-face 矩形 ADD，base cap 与上游尾端共面）在 `elementGeometryRequest` 抛 `bad allocation`（94220）的根因；把 Isomantle 从默认截断 6/6 推进到**可选全保真回放绿**，默认基线不回归。

**Architecture:** 先证明失败可重复并推翻「ADD vs NEW」的无效对照（回放器当前不消费 `operation` 字段），再按「facet / BRep restore / tool 生命周期 / 布尔容差 / 上游复杂度」五层逐层二分定位；native 侧用最小合成 coincident-boss gtest + 真实形状近似双夹具；修复必须带体积/面数/内存门，语料全保真用例以 opt-in 方式保留。

**Tech Stack:** C++ / ACIS 2025.1 / imodel-native BRepCore / gtest / TypeScript CorpusReplay / Vitest.

**Spec:** `.superpowers/sdd/onshape-tutorial2-analysis/replay-cases/Cable-Wire-Routing---DO-NOT-COPY-use-Cus-a0620b.json`（全保真 IR）；`docs/superpowers/plans/2026-10-23-tutorial2-full-chain-m6b.md`、`onshape-corpus-143` 记忆。

## Global Constraints

- 默认 CorpusReplay **6/6 必须保持绿**；全保真用例独立文件或 `CORPUS_REPLAY_FULL_FIDELITY=1` opt-in，禁止把默认基线改成红。
- 任何对照实验必须先证明可重复（同一 DLL、同一机器、连跑 10 次），禁止把单次 `bad allocation` 当确定性因果。
- native 改动必须同时过 `BRepCoreTest`（当前 55/55）与 `PSBRepGeometryTest`（14/14）；新增测试后基线只增不减。
- 体积/面数/内存/耗时全部设门；`fuzzy/clean/imprint` 修法不得让体积漂移超过相对 1e-6。
- MS 宿主产物模式运行旧 DLL 的坑：验收前重启 MS 或重发产物（见 [[m6d-edge-semantics]]）。

## Phase 0 — 复现与对照有效性（P0）

### Task 0.1: 把全保真用例接入可重复复现

**Files:**
- Copy: `.superpowers/sdd/onshape-tutorial2-analysis/replay-cases/Cable-...json` → `modeling-server/src/feature/corpus/<同名>.json`（临时）
- Test: `modeling-server/src/feature/CorpusReplay.test.ts`

- [ ] **Step 1: 复现**
```powershell
$src = 'D:\Github\tiangong-kaiwu\.superpowers\sdd\onshape-tutorial2-analysis\replay-cases\Cable-Wire-Routing---DO-NOT-COPY-use-Cus-a0620b.json'
$dst = 'D:\Github\luban-backend\modeling-server\src\feature\corpus\Cable-Wire-Routing---DO-NOT-COPY-use-Cus-a0620b.json'
Copy-Item $src $dst -Force
cd D:\Github\luban-backend\modeling-server
npx vitest run src/feature/CorpusReplay.test.ts -t "Cable" --no-coverage --reporter=verbose
git -C D:\Github\luban-backend restore -- $dst
```
Expected: `ops[6]` 后 `elementGeometryRequest` 抛 `bad allocation` / 94220；`applyOp` 本身可能 `ok:true`（树内 status=1）。
- [ ] **Step 2: 连跑 10 次**记录失败率、峰值内存、耗时；若失败率非 0/10 先按非确定性处理（H1）。
- [ ] **Step 3: 记录证据到 SDD 台账**（stdout + 内存/耗时）。

### Task 0.2: 推翻/确认「ADD vs NEW」对照

**Files:**
- Temporarily instrument: `FeatureEngine.ts:236,267-272`（`upstreamEntries` 条数、实际 Unite 次数）
- 对照实验：同一 IR `operation` 字段改成 NEW/ADD 各 10 次（注意：当前执行器不消费该字段，结果应相同；若相同则对照无效）

- [ ] **Step 1: 插桩**（仅本地临时，提交前摘除）：打印 `upstreamEntries.length`、`willUnite`、`operation`。
- [ ] **Step 2: 跑 20 次**：ADD×10、NEW×10；记录失败率与 Unite 次数。
- [ ] **Step 3: 结论**：
  - 若两者行为相同 → 确认原 NEW 对照无效，删掉该因果说法；进入 Phase 1。
  - 若 ADD 稳定红、真正独立体（无 prev）稳定绿 → 锁定「有前驱 Unite」为触发条件。
- [ ] **Step 4: 提交**（若改为消费 operation）：`fix(ms): 回放执行器消费 operation 字段` 或明确删除死字段。

## Phase 1 — 分层二分（P0/P1）

> 每个实验独立跑 10 次；记录 pass/fail + 峰值内存 + 耗时；不通过即排除该层。

### Task 1.1: facet vs restore vs Unite 分层

- [ ] **1a**：同一 body 用 `replaceBReps:false` 请求 mesh；若绿 → 锁定 facet（`AcisFacet.cpp:80,102-105,194-199`）。
- [ ] **1b**：只做 BRep save/restore（不 facet）；若红 → 锁定 `Reader::Get`/`Writer::Append`（`ElementGeometry.cpp:1411-1436,2020-2037`）。
- [ ] **1c**：`api_check_entity` 保存门是否通过——加临时日志（不能只依赖默认 true 推断）。

### Task 1.2: 网格容差与最小特征尺寸

- [ ] 扫描 `angleTol ∈ {0.2,0.02,0.002}`、`chordTol ∈ {0,1e-5,1e-7}`；记录红/绿边界。
- [ ] 设 `minBRepFeatureSize ∈ {1e-5,1e-4}` 再跑；若绿，记录 sliver 触发证据。
- [ ] 在 `AcisFacet.cpp:80` 记录每 face `nnode`/polygon 数/累计点数；找异常面。

### Task 1.3: tool 生命周期与所有权

- [ ] 对照 `NDBOOL_KEEP_TOOL` vs `NDBOOL_KEEP_NEITHER`（参照 Intersect 分支 `AcisModify.cpp:362-368`）；后者需正确处理 tool 释放。
- [ ] 或保持 tool 存活到 facet 后再析构；跑 10 次。
- [ ] 若绿 → 查共享 surface/curve 的悬空引用，修复所有权（`AcisKernelEntity.cpp:30-54`）。

### Task 1.4: 上游复杂度与新 sweep 通道

- [ ] 用 `063ae72d6` 父提交 DLL 重跑同一 IR。
- [ ] 强制 `BodyFromSweep` 走 skin 回退重跑（`AcisCreate.cpp:2050-2110`）。
- [ ] 简化上游为仅 3 revolve（去 2 fillet + chamfer）后跑同一 ADD。
- [ ] 若任一绿 → 触发因素不是纯 coincident 布尔，记录具体差异。

## Phase 2 — native 双夹具（P1）

### Task 2.1: 合成 coincident boss gtest

**Files:**
- Test: `imodel-native/iModelCore/BRepCore/Tests/NonPublished/BRepCore_Tests.cpp`（`BRepUtilTests:33-36`）

- [ ] 写盒体 + base cap 共面且部分悬出的拉伸体 → `BRepUtil::Modify::BooleanOperation(..., Unite)`。
- [ ] 断言 SUCCESS、`HasConsistentTopologyAndGeometry`、save/restore 往返、`BRepUtil::FacetEntity`（chord 1e-7/angle 0.002）不抛 `std::bad_alloc`，polygon/point 数 < 硬上限。
- [ ] 加 exact coincident 与 1e-6 gap 两臂。

### Task 2.2: 真实形状近似 gtest

- [ ] 用 3 段 revolve 轮廓或近似 Isomantle 尾端（0.053 m 半径盘 + 0.03×0.00826×0.012 m boss + 2 mm chamfer）。
- [ ] 连跑 10 次；记录 pass/fail 与峰值内存。
- [ ] 若 box fixture 绿而真实形状红 → H2/H5 优先。

## Phase 3 — 修复（按 Phase 1/2 证据选一，禁止多修并上）

- [ ] **Fix A（facet 健壮性）**：对异常 `nnode`/sliver 面加硬上限与保守细分；`minBRepFeatureSize` 采用安全缺省；测试覆盖病态面不 OOM。
- [ ] **Fix B（布尔容差/清理）**：为 `BooleanOperation` 增加可选 `BoolOptions`（near-coincidence fuzz/merge），或 Unite 前 imprint / 后 `DeleteRedundantTopology`；体积漂移 ≤1e-6。
- [ ] **Fix C（所有权）**：修正 KEEP_TOOL 生命周期/共享几何引用。
- [ ] 每个 fix 单独 commit + 单独 10× 验证；失败即回退，不叠加。

## Phase 4 — 全保真语料验收（P1）

- [ ] 新增 `CORPUS_REPLAY_FULL_FIDELITY=1`（或独立 case 文件）使用 `replay-cases` 全量 IR。
- [ ] 断言：op6 后 `elementGeometryRequest` 不抛错；体积 `3.901497768455074e-4 m³` 偏差 ≤1%（目标 0.0001%）；7 逐特征检查通过；stop 仍为 `endBound-UP_TO_SURFACE`。
- [ ] 记录 `upstreamEntries`/Unite 次数/峰值内存/耗时；设上限与 30s 超时。
- [ ] 默认截断 6/6 不变；全保真 opt-in 连跑 10 次全绿。

## 验收标准

- native `BRepCoreTest` **56/56**、`PSBRepGeometryTest` **14/14**。
- 私有仓默认 CorpusReplay **6/6** 不回归；全保真 opt-in 绿且 10/10 无 flake。
- 体积偏差 ≤1%、无 94220/bad allocation、内存与耗时门通过。
- 若采用 fuzzy/clean/imprint：额外断言面/边数与下游 fillet/chamfer 边引用仍可解析。

## 风险与不确定项

1. `bad allocation` 精确抛出点未知（NAPI 只捕获 `std::exception`）；可能来自 ACIS faceter、`AcisFacet reserve/AddPolygon` 或 BRep restore。
2. 「保存时 `api_check_entity` 通过」是强推断，需临时日志坐实。
3. 「工具与尾端面近相切」由 IR 坐标推导，未用精确面距验证。
4. 原 ADD/NEW 对照无效：`operation` 字段当前是死字段，必须先做 Task 0.2。
5. 失败 op 是全保真前缀最后一条（`ops[6]`），不是文档最后特征；不要误把后续 `UP_TO_SURFACE` 当失败点。

## C0 结果（2026-10-27，已执行）

- **全保真 op[6] 10/10 绿**：`applyOp` 30–43 ms、`elementGeometryRequest` 成功、体积偏差
  0.0001%；`bad allocation`/94220/65542 一次未现；单次 86–130 s、峰值 RSS ~2.2 GB。
  默认 6/6 已还原，私仓工作区干净。
- **ADD/NEW 对照无效**：`CorpusReplay.test.ts:798` 仅对 `REMOVE` 路由；NEW 与 ADD 同落
  `extrude`，引擎按 `upstreamEntries.length` 决定 Unite（`FeatureEngine.ts:267-272`）；
  同一 IR 仅改 operation 的 ADD/NEW 插桩行逐字节相同。`operation` 在执行层只对 REMOVE 有意义。
- 当前环境 `iTwinBRepCore.dll`（2026-10-26 22:11，含 native `399a2ff26` B4 修复）下失败不可复现；
  无旧 DLL 可做 A/B，故「新 DLL 已修复」为推断而非因果证明。
- **Phase 1 修订**：C1–C3（facet/restore/所有权/布尔容差/上游复杂度二分）以「可重复失败」为前提，
  当前前提不成立，**暂停/关闭**；C4 改为「全保真回归门（opt-in 或默认）+ NEW/ADD 语义归一/
  文档化」；真正的后续是越过 `endBound-UP_TO_SURFACE` 或实现多体 NEW 语义（特征/体模型层）。
- 原始证据：`.superpowers/sdd/2026-10-27-isomantle-c0-repro/task-{1,2}-report.md`。
