# Isomantle C4 全保真回归门 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 C0 证明可绿的全保真 Isomantle 用例固化为 **opt-in 回归门**（默认 6/6 不变），并显式钉住「NEW≡ADD、仅 REMOVE 路由」语义，防止后续再被误用为对照变量。

**Architecture:** 私有仓新增 `corpus/full/` 下的全保真 IR（改 id 避免与截断版冲突）；`CorpusReplay.test.ts` 的装载器仅在 `CORPUS_REPLAY_FULL_FIDELITY=1` 时纳入；默认套件保持 6/6。执行器增加显式注释/断言说明 NEW/ADD 同义；计划与记忆记录 C0 结论。

**Tech Stack:** Vitest / TypeScript / corpus IR JSON.

**Spec:** `docs/superpowers/plans/2026-10-27-isomantle-coincident-boolean-rnd.md`（C0/C4）；C0 证据：`.superpowers/sdd/2026-10-27-isomantle-c0-repro/task-{1,2}-report.md`。

## Global Constraints

- 默认 `npx vitest run src/feature/CorpusReplay.test.ts --no-coverage` 必须保持 **6/6**；全保真仅在 `CORPUS_REPLAY_FULL_FIDELITY=1` 时运行。
- 全保真用例验收：体积偏差 ≤1%（目标 0.0001%），7 个逐特征检查，stop `endBound-UP_TO_SURFACE`；单次预算 ~2min，不设 flake 重试。
- 不修改 MS 业务代码；只改测试/语料/注释。跨仓文档改动（计划/记忆）由控制方收口。
- 私有仓 pre-commit 钩子可 `--no-verify`；只本地 commit，不 push。

### Task 1: 全保真 opt-in 门 + NEW/ADD 语义钉

**Files:**
- Create: `D:\Github\luban-backend\modeling-server\src\feature\corpus\full\Cable-Wire-Routing---DO-NOT-COPY-use-Cus-a0620b-full.json`（从 C0 全保真 IR 复制，改 `id`）
- Modify: `D:\Github\luban-backend\modeling-server\src\feature\CorpusReplay.test.ts`（~95-100 装载器；~798 显式映射注释）
- Test: 同上

- [ ] **Step 1: 建 full 目录与 IR**：复制 `.superpowers/sdd/onshape-tutorial2-analysis/replay-cases/Cable-Wire-Routing---DO-NOT-COPY-use-Cus-a0620b.json` 到 `src/feature/corpus/full/...-full.json`；把 JSON 的 `id` 改为 `...-full`（其余逐字节保留），验证 `7` ops、stop `endBound-UP_TO_SURFACE`。
- [ ] **Step 2: 装载器**：默认只读 `corpus/*.json`；当 `process.env.CORPUS_REPLAY_FULL_FIDELITY === '1'` 时追加 `corpus/full/*.json`。避免 `sketch-planes` 子目录误读；保持默认 6 个 case。
- [ ] **Step 3: 语义钉**：在 `CorpusReplay.test.ts:798` 附近加显式注释（NEW/ADD 同义、仅 REMOVE 路由、Unite 由上游决定；C0 2026-10-27），不改变行为。
- [ ] **Step 4: 默认回归**：`npx vitest run src/feature/CorpusReplay.test.ts --no-coverage` → 6/6，exit 0。
- [ ] **Step 5: opt-in 验收**：`$env:CORPUS_REPLAY_FULL_FIDELITY='1'; npx vitest run src/feature/CorpusReplay.test.ts -t "full" --no-coverage --reporter=verbose` → 全保真 case 绿，偏差 0.0001%，7/7 检查；记录耗时。若 `-t "full"` 不匹配，按 case id 运行；必要时跑全套确认 7/7。
- [ ] **Step 6: 提交**：`test(corpus): Isomantle 全保真 opt-in 回归门 + NEW≡ADD 语义钉`；本地 commit，不 push。

## 验收

- 默认 6/6 不回归；opt-in 全保真绿（体积 0.0001%、7/7、stop UP_TO_SURFACE）。
- 计划/记忆记录：C0 0/10 + ADD/NEW 死区分；C1-C3 暂停；C4 门已就位。

## C4 实现结果（2026-10-27，私有仓本地 commit）

- `ba1b6a7`：`corpus/full/...-full.json`（11,873B，仅 id 变化）+ `CORPUS_REPLAY_FULL_FIDELITY=1`
  非递归装载 + NEW≡ADD 注释。
- `4f81c13`：门禁硬化——full 目录缺失/为空 fail-loud、跨目录重复 id 守卫、full case
  `timelineChecks===7` 与 stop `endBound-UP_TO_SURFACE` 硬断言、`-t` 说明修正。
- 验证：默认 **6/6**（40.47s，full 不装载）；`CORPUS_REPLAY_FULL_FIDELITY=1` 全套 **7/7**
  （84.73s，full case 45.66s，0.0001%，7/7，stop UP_TO_SURFACE）。
- **规范门命令**：`CORPUS_REPLAY_FULL_FIDELITY=1 npx vitest run src/feature/CorpusReplay.test.ts --no-coverage`
  （不要只靠 `-t` 选择器；env 未设时选择器可能 0 命中而绿色）。
- 剩余 minor：full case 仍为 `mode:"smoke"`（前缀体积路径，非 full expectedVolume）；
  invariants 以 `-full` id 后缀/硬编码 7 绑定，语料扩容时需泛化。
