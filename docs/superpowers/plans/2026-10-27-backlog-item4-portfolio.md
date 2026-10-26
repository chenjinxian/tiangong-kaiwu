# 第四项（未纳入发布批）立项总控

> 2026-10-27 立项。范围 = 上一轮收口报告中「四、未纳入本批」的三项：
> ① Isomantle coincident-face Unite 内核深水；② mirror/pattern/boolean 等特征契约与语料；
> ③ imodelhub P2/P3 长尾。三项目独立可交付，可按人力并行；本文件只定优先级、依赖与验收节奏。

## 项目清单

| # | 项目 | 计划文档 | 规模 | 建议波次 |
|---|---|---|---|---|
| A | hub P2/P3 长尾清零（30 项） | `2026-10-27-hub-p2-p3-backlog.md` | 30 项，S/M/L 混合 | W1 安全快赢 → W2 契约/数据 → W3 并发/可观测 → W4 工程 |
| B | 特征契约补齐（boolean/loft/sweep/mirror/pattern/compositePart） | `2026-10-27-feature-contracts-mirror-pattern-boolean.md` | 6 特征，6 任务 | boolean → loft → sweep → mirror → pattern → 多体 |
| C | Isomantle coincident Unite R&D | `2026-10-27-isomantle-coincident-boolean-rnd.md` | 4 phase，spike 先行 | Phase 0 复现/对照 → Phase 1 二分 → Phase 2 夹具 → Phase 3 修复 → Phase 4 语料 |

## 优先级与并行建议

**立即启动（可并行）**
1. **A-W1（hub 安全快赢）**：6 项均 S 级、无跨仓依赖，最快产出可发布价值。
2. **C-Phase 0（Isomantle 复现与对照有效性）**：纯取证，不改产品代码；先推翻「ADD vs NEW」无效对照，避免后续方向性误判。

**紧随其后**
3. **B-Task 1（boolean 草图驱动）**：复用现有 Unite/Subtract 求值，最小闭环；是后续 body boolean 的基础。
4. **A-W2 首批契约/数据项**（P2-15 成员列表、P2-10 预签名、P2-08 FK）：独立于前端，可与 B 并行。

**依赖推进**
- B-Task 2（loft）→ B-Task 3（sweep）：共用多草图解析骨架。
- B-Task 4（mirror）→ B-Task 5（pattern）：共用 body 变换原语；mirror 的 BRep 反射通道先 spike。
- B-Task 6（多体/compositePart/body boolean）：依赖 4/5 稳定 + 架构评审。
- C-Phase 3 修法必须在 C-Phase 1/2 证据后单点实施，禁止多修并上。
- A-W2 的 P2-14（checkpoint SAS）/P2-09（存储清理）涉及 MS/WA 跨仓协调，先出接口契约。

## 统一完成定义（DoD）

- 每任务独立 commit；TDD：失败测试 → 实现 → 回归；相关单测 + lint + build 绿。
- native/私有仓改动：`vitest` + `tsc --noEmit`；native 另跑 gtest 双套件。
- 涉及发布面：私有仓 `build-images/publish` 重发；总仓 `verify-stack.ps1` **17/17**。
- 涉及用户可见行为：至少一条真栈用例；语料回放不可回放项必须登记原因。
- 文档：计划/进度/验收记录入 `.superpowers/sdd/` 或 `docs/superpowers/plans/`；能力矩阵同步（platform-docs STATUS 需去 9-22 陈旧口径）。

## 里程碑节奏（建议）

| 里程碑 | 内容 | 验收 |
|---|---|---|
| M7.0 | A-W1 六项 + C-Phase 0 结论 | hub 单测全绿 + 一次镜像重发；Isomantle 失败率/Unite 次数表 |
| M7.1 | B-Task 1 boolean + A-W2 首批三件 | boolean 真栈用例；成员列表/预签名/FK 验收 |
| M7.2 | B-Task 2/3 loft+sweep + C-Phase 1/2 | 前缀体积回放；native gtest 夹具 |
| M7.3 | B-Task 4/5 mirror+pattern + C-Phase 3/4 | 合成用例；全保真 opt-in 10/10 |
| M7.4 | A-W3/W4 + B-Task 6 架构 spike | 30 项清零；多体方案评审 |

## 风险与裁决点

1. **多体架构**是 B 项目最大不确定项：Task 6 先 spike 再承诺；若不可行，compositePart 仅做 no-op 元数据、body boolean 暂缓。
2. **mirror 反射通道**未验证：若 entryArray 不支持非刚体反射，参数化 mirror 降级为直改修复并如实标注。
3. **P2-06 OIDC** 需前端登录/回调设计，可能独立成子项目。
4. **L-02/P3-07** 大范围机械改动，必须分批合入，避免阻塞发布窗。
5. **P1#31 矛盾**：hub `webhook-seed.service.ts:28-35` 生产跳过 webhook 种子，与「P1 全闭」口径不符——A-W4 先复核定性，再决定修复或更新台账。

## 台账与追踪

- 任务注册：Task #15–18（hub 四波）；B/C 的里程碑任务随本文件同批注册。
- 进度：每个项目一个 `.superpowers/sdd/2026-10-27-<program>/progress.md`（执行时创建）。
- 发布关联：A 项目按波次重发 hub 镜像；B/C 涉及 MS/native 时按产物发布手册走 `release-backend-<date>`。
