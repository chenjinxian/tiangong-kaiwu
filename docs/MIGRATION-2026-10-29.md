# 2026-10-29 项目总目录整理迁移记录

- 范围：tiangong-kaiwu（项目总目录）、luban-backend、imodelhub-services、imodel-native、DanQing；acis-solid-kernel 仅审计不修改。
- platform-docs：已按用户裁决整仓删除（不迁移内容）；主仓 `docs/` 为唯一文档根。
- 结构：apps/web-next → apps/web；packages/viewer-next → packages/viewer。
- 包名：@luban-cad/web-next → @luban-cad/web；@luban-cad/viewer-next → @luban-cad/viewer。
- 删除：viewer-core、web-viewer、config、旧脚本、itwinjs-core/open-cloud-cad。
- 例外：分支 web-next-m0 与浏览器存储键 luban-next-* 暂不改名。
- 恢复：仓内删除内容从 Git 历史恢复，索引见 docs/HISTORY.md；platform-docs 为仓外独立目录，不保留恢复索引。

## 执行结果

- 删除：apps/web 残留、worktree、死包、旧脚本、fork 旧应用、历史文档。
- platform-docs：本地仓整仓删除（HEAD `830f2ad`，无远端配置）；被中止的 2026-10-29 文档改写未提交，已一并丢弃；主仓当前文档不再引用该目录（历史记录除外）。
- 改名：apps/web-next → apps/web；viewer-next → viewer。
- 门禁：web unit 957/957；workspace build 绿；e2e 34/34；verify 17/17；viewer/app lint 绿。
- e2e 稳定化：文档详情视觉钉版仅 mask iModel 卡片「创建于」日期文本（不遮整卡），仅重钉 `document-details-light.png`；种子重建/跨日日期漂移不再影响视觉门禁（修复前 33/34，日期字形差 13 px）。
- 既存例外：`@luban-cad/shared` 38 个 lint 错误为清理前基线，未在本轮扩大修复。
- 例外：acis-solid-kernel 保持原样；分支名与存储键未改名。
- 旧命名残留：历史/证据文档与 `.superpowers` 物理目录路径（docs/HISTORY、ITWINJS_CORE_MODIFICATIONS、UPSTREAM_SYNC、web-realstack-probes 及 `e2e/perf.spec.ts` 证据根）保留旧名；另有两份保留为 active 的设计文档（`docs/superpowers/specs/2026-10-21-web-onshape-parity-design.md`、`docs/superpowers/specs/2026-09-28-cad-full-program-roadmap.md`）正文含旧名，已各加顶注说明历史口径。active 代码注释已清零。

## 终审清扫修复（2026-10-29）

- 保留的 active 设计文档加顶注：`2026-10-21-web-onshape-parity-design.md`（执行状态）、`2026-09-28-cad-full-program-roadmap.md`（历史口径）；本文件旧命名残留说明同步修正。
- 删除失效 `luban-cad/docker-compose.dev.yml`（构建上下文 `../modeling-server` 等已随后端源码迁私有仓 `luban-backend` 消失；根 `docker-compose.yml` 为唯一部署权威）；`docs/PORTS.md`/`docs/HISTORY.md` 登记退役。
- 健康检查收敛到根 `scripts/verify-stack.ps1`：更新 `docs/Deployment-Guide.md`、`docs/baseline-reliability-design.md`；删除 `luban-cad/scripts/health-check.sh` 等 11 个硬编码退役端口且无引用的旧脚本。
- `docker-compose.yml` 的 `HUB_ALLOWED_ORIGINS` 缺省移除 `:5310`（保留 5300/5301）。
- 删除 ignored 陈旧目录 `services/bff/dist`。
- 旧应用路径（`features/imodel`、`features/sketch`）标注历史/已退役，不复活旧目录。
- `docs/ITWINJS_CORE_MODIFICATIONS.md` 基准更新为 upstream master `8bdef3e3cd`（5.15.0-dev.2；`@bentley/imodeljs-native` 5.15.5）。
- e2e 注释自引用修正（`fixtures.ts`、`helpers.ts`、`playwright.config.ts` 改指旧应用（已删除））。
- 验证：`docker compose config` 通过；`scripts/verify-stack.ps1` **17/17**；web unit **957/957**；web 镜像 revision 停在 `8e201b203d48`（此后仅文档提交，未重建）。e2e 沿用上一门禁 **34/34**（本轮仅改 e2e 注释，未重跑）。

## 最终整理结果（2026-10-29）

| 仓库 | 结果 | 验证 |
|---|---|---|
| tiangong-kaiwu | `apps/web`/`packages/viewer` 统一命名；死包、旧应用、fork 旧拷贝、历史文档清理；platform-docs 引用收敛 | web unit 957/957、workspace build 绿、e2e 34/34、verify 17/17；viewer/app lint 绿 |
| luban-backend | `FRONTEND_URL` 5300、editor 构建改 luban-cad pnpm、release/历史文档与 `dist-out`/`staging` 清理（~11.45 GiB） | MS 604+8、WA 46、build 绿；lint 246/22、83/3 为既存基线；终审 2 Important 已修并复审 Approved |
| imodelhub-services | `APP_PORT=4000`/前端 5300、k6 根路径、坏脚本/文档/coverage 清理 | unit 794/794、lint/build 绿；终审 2 Important 已修并复审 Approved |
| imodel-native | `out/cmake` 15.5 GiB、缓存、20 份历史计划/spec 删除；`docs/HISTORY.md`；悬空引用改 Git 索引 | git clean；任务复审 Approved |
| DanQing | `build` 37.08 GB、测试输出/macro、4 份旧 DTA 文档删除；`docs/HISTORY.md`；README/CLAUDE 悬空引用改 Git 索引 | git clean；任务复审 Approved |
| platform-docs | 整仓删除，不迁移内容 | 本地目录不存在；无远端配置 |
| acis-solid-kernel | **未修改**（研究脏区保留） | 原状 |

- 跨仓 stale 扫描：backend/hub/native/DanQing 当前代码/配置零命中；主仓仅保留已删除说明、历史台账/同步检查单、`.superpowers` 证据物理路径与上游外部 `web-viewer` 教程/包名等 documented exceptions。证据：`.superpowers/sdd/2026-10-29-cleanup-docs-kernel-engine/final-stale-scan.txt`。
- 未 push、未建 Release；所有提交均为本地提交。
- 回收量级：backend ~11.45 GiB + native ~15.5 GiB + DanQing ~37.09 GB + 主仓 worktree/旧应用等 ~0.8 GiB。
- 残余：`@luban-cad/shared` 38 个 lint 错误为既存基线；DanQing 阶段计划保留为取证台账；imodel-native 源码注释仍引用已删文档（不改源码约束）；web 镜像 revision 停在 `8e201b2`（此后仅文档提交，未重建）。
