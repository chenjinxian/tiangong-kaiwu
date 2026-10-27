# Isomantle C0 复现与对照有效性 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用全保真 IR 证明 Isomantle `ops[6]` 的 `bad allocation` 是否可重复，并验证回放执行器是否消费 `operation`（ADD/NEW）字段——为后续二分定位提供有效基线。

**Architecture:** 纯取证 spike：临时把全保真 IR 放入私有仓 corpus，跑 `CorpusReplay.test.ts -t Cable` 多次并记录失败率/内存/耗时；再检查/插桩 `operation` 消费情况，跑 ADD/NEW 对照。除必要的最小可留档测试/字段清理外，不修改产品代码；临时文件与插桩必须还原。

**Tech Stack:** TypeScript / Vitest / imodel-native 现有 DLL / PowerShell.

**Spec:** `docs/superpowers/plans/2026-10-27-isomantle-coincident-boolean-rnd.md`（Phase 0）；全保真 IR：`D:\Github\tiangong-kaiwu\.superpowers\sdd\onshape-tutorial2-analysis\replay-cases\Cable-Wire-Routing---DO-NOT-COPY-use-Cus-a0620b.json`。

## Global Constraints

- 默认 CorpusReplay **6/6 必须保持绿**；临时全保真文件跑完必须删除/还原，不得留在私有仓 corpus。
- 不改产品代码，除非 Task 2 发现 `operation` 是死字段且决定做最小清理；任何代码改动需单测 + tsc + 全量 vitest 绿。
- 记录失败率、峰值内存、耗时；单次失败不足以定性。
- 不 push、不发布；只本地 commit（若确有必要）。
- 私有仓 `corpus` 目录可能被 gitignore：临时文件用后清理，`git status` 必须干净（除有意 commit）。

### Task 1: 全保真 IR 复现与可重复性

**Files:**
- Read: 全保真 IR（根仓 `.superpowers/sdd/...`）
- Temporarily add/remove: `D:\Github\luban-backend\modeling-server\src\feature\corpus\Cable-Wire-Routing---DO-NOT-COPY-use-Cus-a0620b.json`
- Test: `modeling-server/src/feature/CorpusReplay.test.ts`

- [ ] **Step 1: 备份状态**：`git -C D:\Github\luban-backend status --short --branch` 必须干净；记录 HEAD。
- [ ] **Step 2: 复制全保真 IR 到 corpus**（同名文件）。
- [ ] **Step 3: 跑 10 次**：`cd modeling-server && npx vitest run src/feature/CorpusReplay.test.ts -t "Cable" --no-coverage --reporter=verbose`，每次记录 pass/fail、错误类型（94220/bad allocation/其他）、耗时、峰值内存（任务管理器或 `Get-Process` 采样）。
- [ ] **Step 4: 还原**：删除临时 corpus 文件；复跑默认 `npx vitest run src/feature/CorpusReplay.test.ts --no-coverage` 确认 6/6 绿；`git status` 干净。
- [ ] **Step 5: 报告**：失败次数/10、错误签名、耗时/内存表；结论=确定性/非确定性/未复现。

### Task 2: ADD/NEW 对照有效性

**Files:**
- Read/可能临时插桩: `modeling-server/src/feature/CorpusReplay.test.ts`（`operation` 是否被消费）、`FeatureEngine.ts`（`upstreamEntries`/Unite 次数）
- Test: 同一全保真 IR，`operation` 改 ADD / NEW 各 10 次

- [ ] **Step 1: 静态确认**：grep `operation` 在回放执行器/FeatureService/FeatureEngine 的消费点；记录文件:行。
- [ ] **Step 2: 插桩（临时）**：在 `FeatureEngine` Unite 分支前打印 `upstreamEntries.length`、`willUnite`、IR operation（若可达）；仅本地，跑完还原。
- [ ] **Step 3: 对照实验**：同一 IR 改 ADD/NEW 各 10 次（每次临时改同一文件），记录 pass/fail + Unite 次数 + `upstreamEntries` 条数。
- [ ] **Step 4: 结论**：若 ADD/NEW 行为相同 → 原对照无效；若不同 → 记录真正的独立体条件。还原插桩与临时文件，复跑默认 6/6。
- [ ] **Step 5: 报告**：静态消费点、对照表、结论与后续建议（是否清理死字段/实现真正 NEW 链）。

## 验收

- C0 报告落 SDD 台账（不是产品文档）；默认 CorpusReplay 6/6 不回归；私有仓 `git status` 干净（或仅有意的最小 commit）。
- 输出明确回答：`ops[6]` 是否可重复失败？ADD/NEW 对照是否有效？下一步应进 Phase 1 的哪一层？
