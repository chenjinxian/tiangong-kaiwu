# M2 前置：中毒态应用层缓解 + 判别实验 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用「传播后直写重写 body」缓解中毒态（roadmap 既有裁定），启用留档回归钉；跑两个判别实验回答 findings 文档的开放预言，夯实 M2 地基。

**Architecture:** FeatureService 每个 op 的传播（saveChanges 触发 EDE→writeBody 间接写，可能落陈旧体）之后、txn 结束之前，用**同一 txn 内直接 updateElement** 从缓存尾部重写 body——直写路径经元素级 restore→Writer::Append，不经会话缓存实体，对中毒态免疫（Task 7 IMMEDIATE-RESAVE 探针+J1 双证据）。单 txn 单 changeset 语义不变。判别实验以 debug-tail-root 式探针回答 findings §5.6（回调内直写通道可行性）与 §5.2（「落库恒=建链布尔」预言），结论回写 findings 文档。

**Tech Stack:** TypeScript（modeling-server，Vitest；ESM .js 后缀）。

**Spec:** `docs/superpowers/specs/2026-09-28-cad-full-program-roadmap.md` 风险 #10（缓解裁定句：应用层缓解=insert 后强制一次 retool/直写重写 body——本计划将其推广为每 op 传播后直写，理由见 Design Note 1）；`D:\Github\imodel-native\docs\superpowers\specs\2026-09-29-poisoned-state-findings.md`（§3.1 普遍推论/§5.2/§5.6 实验）。

## Global Constraints

- 仓：tiangong-kaiwu，分支 `m2-pre-poison`（自 main@当前 HEAD 拉）。
- 门禁：`cd modeling-server && npx vitest run && npx tsc --noEmit && npx eslint "src/feature/**/*.ts"` 全绿。
- commit `feat/fix/test(modeling-server): …` + `Co-Authored-By: Claude Code <noreply@anthropic.com>` 尾行。
- 禁碰：FeatureEngine 的 EDE 回调本体（writeBody 间接写保持——它是缓存更新侧；缓解在传播外补直写）；spike-x1；imodel-native 仓。
- 测试超时 180s 级。

## Design Notes

1. **为什么推广到每 op 而非仅 insert**：中毒不可从 JS 检测（无标志）；健康 body 的间接写与直写结果一致（直写重写仅多一次 ACIS 非确定性字节差异，M1 每个 op 本就改几何，changeset 体积无实质劣化）；换血/删除后的重建路径也走直写天然安全。
2. **留档测试启用即验收**：`FeatureEngine.test.ts` 尾部 it.skip（中毒态：内嵌工具直接建链→suppress 的 indirect 写静默失效）——缓解后必须转绿并保留为永久回归钉（不删）。
3. **E1 实验的预期**：回调内起新 EditTxn 大概率被「already-active」拒绝（传播发生在 op txn 的 saveChanges 内部）——若如此，该结果本身就是结论（「回调内换通道」通道不存在，缓解必须传播外，findings §5.6 的待验证假设就此关闭为「不可行·通道不存在」）。

---

### Task 1: 传播后直写重写 body（缓解本体）

**Files:**
- Modify: `modeling-server/src/feature/FeatureEngine.ts`（新增导出 `persistBodyDirect`）
- Modify: `modeling-server/src/feature/FeatureService.ts`（applyOp 三路径 + undo/redo 的 saveChanges 后接入）
- Test: `modeling-server/src/feature/FeatureEngine.test.ts`（启用中毒态留档用例）；`modeling-server/src/feature/FeatureService.test.ts`（追加中毒态服务级用例）

**Interfaces:**
- Produces: `FeatureEngine.persistBodyDirect(txn: EditTxn, db: IModelDb): boolean`——查询 body+尾特征缓存，直接 `txn.updateElement<GeometricElement3dProps>({ id: bodyId, elementGeometryBuilderParams })`（复用 rebuildAll 的直写段逻辑，抽出为函数供两处共用；无 body/无缓存/失败→false 不抛）。

- [ ] **Step 1: RED——启用中毒态留档用例**（`it.skip(` → `it(`，改名为「中毒态缓解回归：内嵌建链→suppress 传播外直写生效」）。跑 `npx vitest run src/feature/FeatureEngine.test.ts -t "中毒态"` 确认仍红（缓解未实现；注意该用例是引擎级直调 txn 形态——它没有 FeatureService 的传播后钩子！**引擎级用例的红绿取决于它自己调 persistBodyDirect**：在用例的 suppress saveChanges 后加一行 `persistBodyDirect(txn, db)` 再断言——这样用例钉的是「直写免疫」这一已知事实+新函数可用性；服务级中毒用例才钉缓解闭环）。
- [ ] **Step 2: 实现 `persistBodyDirect`**（从 rebuildAll 直写段抽出，rebuildAll 改调它）。
- [ ] **Step 3: FeatureService 接入**：applyOp 的 insert/update/delete 三路径与 undo/redo——每处 `txn.saveChanges(...)`（触发传播）之后、`txn.end("save")` 之前调 `FeatureEngine.persistBodyDirect(txn, db)`，再补一次 `txn.saveChanges("persist body")`（第二次 saveChanges 无参数变更传播负担——body 无出边）。**注意 end("save") 形态的路径**：现为 end("save", desc) 一步到位——改为 saveChanges(传播)→persistBodyDirect→end("save", desc)。
- [ ] **Step 4: 服务级中毒用例**（FeatureService.test.ts 追加）：insert extrude(base)→insert booleanSubtract(**内嵌工具**，直接触发中毒形态)→updateParams 改 base 尺寸→断言 body 几何真实变化（归一化比较）——缓解前此链必失败，缓解后必绿。
- [ ] **Step 5: GREEN + 全量门禁 + Commit**：`fix(modeling-server): 中毒态缓解——每 op 传播后直写重写 body（启用回归钉）…`

### Task 2: 判别实验 E1/E3（findings §5 开放预言）

**Files:**
- Test: `modeling-server/src/feature/debug-tail-root.test.ts`（追加第十四组）
- Modify: imodel-native findings 文档不可碰（本任务只写探针+把结论写进 tiangong 侧 roadmap 风险 #10 附注；findings 回写归 native 侧后续）

**Interfaces:**
- Consumes: Task 1 的 persistBodyDirect（E1 若通道存在则用它，否则记录拒绝形态）。

- [ ] **Step 1: E1 探针（回调内直写可行性）**：中毒图中，临时给 writeBody 的 hooks 加实验分支？**禁碰回调本体**（Global Constraints）——改为：在 EDE 传播期间（onBodyNode 触发时）尝试 `new EditTxn(db, ...)` + start，捕获异常/行为。用 bindFeatureEngine 的 hooks 只能绑一次（幂等 bound 标志）——**改用直接测**：在 debug 探针里手动模拟（saveChanges 前 start 一个长事务，另起 txn 必然 already-active——记录该事实即结论）。落探针用例+注释结论。
- [ ] **Step 2: E3 探针（第三种几何预言）**：中毒 body（内嵌建链）→ suppress（间接写 plain box，已知失效）→ unsuppress 后 updateParams 工具尺寸（间接写**第三种几何**=不同尺寸孔洞）→ ECSQL 原始列读回 → 断言「落库字节==初始建链时的列值」vs「==最后间接写内容」——钉 findings §3.1 普遍推论（预言：仍=初始 cavity）。探针断言按预言写；若证伪（落库=最新写入），findings §3.1 推论被推翻——如实记录并升级为重要发现（改写 roadmap #10 口径）。
- [ ] **Step 3: 结论回写**：roadmap 风险 #10 附注追加「E1 结论：回调内新 EditTxn 不可行（already-active），缓解必须传播外（已实施）；E3 结论：<按实测>」。
- [ ] **Step 4: 门禁 + Commit**：`test(modeling-server): 中毒态判别实验 E1/E3——回调内通道结论+第三种几何预言验证…`

### Task 3: 收口

- [ ] **Step 1: 全量回归+门禁**。
- [ ] **Step 2: roadmap 风险 #10 状态更新**（缓解已实施+实验结论；「阻塞 M2」标记解除——应用层已免疫，native 根治仍开放）。
- [ ] **Step 3: 记忆文件更新 + Commit**：`docs: M2 前置收口——中毒态缓解落地+判别实验结论…`

## Self-Review 结论

1. 覆盖：建议顺序 item1 两要素（缓解+实验）均落任务；缓解的推广理由（每 op）入 Design Note 1。
2. 占位符：无（E1 的「already-active 预期」是可证伪预言非 TBD；E3 断言含双向出口）。
3. 类型一致：persistBodyDirect 签名在 Task 1/2 一致。
