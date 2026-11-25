# 文档历史索引（2026-10-29 整理）

本文件只保留已删除内容的索引。旧正文从 Git 历史恢复：

```bash
git log --all -- <path>
git show <commit>:<path>
```

| 主题 | 旧路径 | 说明 |
|---|---|---|
| M0–M5 web 重写 | docs/superpowers/plans/2026-10-21-web-next-*、2026-10-22-* | 已完成，当前前端见 `luban-cad/apps/web` |
| M6 草图/教程 | docs/superpowers/plans/2026-10-23-*、2026-10-24-* | 已完成 |
| B1–B5 特征契约 | docs/superpowers/plans/2026-10-27-feature-contracts-* | 已完成，契约以 `luban-cad/packages/shared` 源码为准 |
| M-A3/M-A4/M-A5.1 | docs/superpowers/plans/2026-10-28-* | 已完成 |
| Isomantle | docs/superpowers/plans/2026-10-27-isomantle-* | C0/C4 已记录，C1–C3 暂停 |
| 旧架构/审计 | docs/DEEP_ANALYSIS.md、docs/E2E_TEST_REPORT.md | 已删除 |
| 旧发布说明 | docs/RELEASE-backend-20261027b.md | 已删除；现行发布说明见 `docs/RELEASE-backend-20261028c.md` |
| 旧 dev 编排 | luban-cad/docker-compose.yml、luban-cad/docker-compose.dev.yml | 已删除；后端源码（modeling-server/webhook-agent）迁至私有仓 `luban-backend`，dev 编排的 `../modeling-server` 等构建上下文不复存在；根 `docker-compose.yml` 为唯一部署权威 |
| 平台文档总仓 | `D:\Github\platform-docs`（仓外目录） | 2026-10-29 整仓删除（HEAD `830f2ad`，无远端配置）；内容不迁移，主仓 `docs/` 为唯一文档根 |

> 历史文档中的旧目录名（`apps/web-next`、`viewer-next`、`viewer-core`、`web-viewer` 等）
> 只描述当时状态，不代表当前结构。当前结构见根 `README.md` 与 `luban-cad/README.md`。

其余已删除计划/设计可按 `git log --all -- docs/superpowers/` 枚举；本索引只列主题级条目，
恢复单篇时使用 `git show <删除前提交>:<path>`。

---

## 2026-11-25 文档清理（15 篇）

口径：删除**无现行入链、已被取代的纯执行计划/草稿**；被 ADR/AIRR/现行方案引用的历史证据保留。
现行执行方案见 [`architecture/TEAM-EXECUTION-PLAN-2026-11-25.md`](./architecture/TEAM-EXECUTION-PLAN-2026-11-25.md)；
索引口径见 [`README.md`](./README.md)。

| 旧路径 | 原因 |
|---|---|
| `docs/superpowers/plans/2026-10-27-backlog-item4-portfolio.md` | 2026-10-27 立项总控；任务已完成/被后续计划取代，无现行入链 |
| `docs/superpowers/plans/2026-10-27-hub-p2-p3-backlog.md` | imodelhub P2/P3 长尾 backlog；已完成/被后续 Gate 文档取代 |
| `docs/superpowers/plans/2026-10-29-cleanup-backends.md` | 历史后端整理执行计划；已完成 |
| `docs/superpowers/plans/2026-10-29-cleanup-docs-kernel-engine.md` | 历史内核/引擎仓整理执行计划；已完成 |
| `docs/superpowers/plans/2026-10-29-cleanup-main-repo.md` | 历史主仓整理执行计划；已完成 |
| `docs/superpowers/plans/2026-10-29-multibody-perf-baseline.md` | 历史性能基线与 subentity/multibody 计划配套；已被后续基线/证据取代 |
| `docs/superpowers/plans/2026-10-29-multibody-perf-guard.md` | 历史性能护栏执行计划；已完成 |
| `docs/superpowers/plans/2026-10-29-subentity-selection.md` | 历史子实体选择实施计划；已完成 |
| `docs/superpowers/plans/2026-11-03-render-default-onshape-select.md` | 渲染默认值执行计划；已完成，被 `BREP-RENDERING-2026-11-03.md`/ADR-G0-06 覆盖 |
| `docs/superpowers/plans/2026-11-04-onshape-parity-batch1-gate.md` | Batch 1 门禁执行计划；已完成，后续 parity 以 2026-11-19 全量计划为准 |
| `docs/superpowers/plans/2026-11-10-blocked-examples-capability.md` | 阻塞示例能力切片台账；切片已完成，能力状态以能力账本/registry 为准 |
| `docs/superpowers/plans/2026-11-21-sketch-external-refs-s1.md` | S1 实施计划；已被批准的 ADR-0024/AIRR 2026-11-21 取代 |
| `docs/superpowers/specs/2026-10-29-m-a5.2-subentity-selection-perf-design.md` | 旧子实体选择/性能设计；被后续实现与证据取代 |
| `docs/superpowers/specs/2026-10-29-project-cleanup-design.md` | 旧整理设计；其配套执行计划已全部删除 |
| `docs/superpowers/specs/2026-11-03-render-default-onshape-select-design.md` | 旧渲染默认值设计；被 `BREP-RENDERING-2026-11-03.md`/ADR-G0-06 覆盖 |

**保留说明**：`2026-11-10-onshape-all-parts-master.md`、`2026-11-11-live-onshape-ui-replication.md`、
`2026-11-09-ps-blocker-*.md`、`2026-11-06-example-coverage-continuous.md`、
`2026-11-05-sketch-feature-capability-backlog.md`、`2026-11-05-imprint-face-extrude-airr.md`、
`2026-11-09-sketch-external-refs-async-airr.md`、`2026-11-12-loft-multisection-airr.md`、
`2026-10-30-b-model-*.md`、`2026-10-21-web-onshape-parity-design.md`、
`2026-11-04-onshape-batch1-gap-matrix.md` 等仍被 ADR/AIRR/现行方案引用，作为历史证据保留。
