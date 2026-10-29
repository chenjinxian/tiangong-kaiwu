# 2026-10-29 七仓整理迁移记录

- 范围：tiangong-kaiwu、luban-backend、imodelhub-services、platform-docs、imodel-native、DanQing。
- 结构：apps/web-next → apps/web；packages/viewer-next → packages/viewer。
- 包名：@luban-cad/web-next → @luban-cad/web；@luban-cad/viewer-next → @luban-cad/viewer。
- 删除：viewer-core、web-viewer、config、旧脚本、itwinjs-core/open-cloud-cad。
- 例外：分支 web-next-m0 与浏览器存储键 luban-next-* 暂不改名。
- 恢复：所有删除内容从 Git 历史恢复，索引见 docs/HISTORY.md。

## 执行结果

- 删除：apps/web 残留、worktree、死包、旧脚本、fork 旧应用、历史文档。
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
- 验证：`docker compose config` 通过；`scripts/verify-stack.ps1` **17/17**；web unit **957/957**；web 镜像 revision 与源提交 `8e201b203d48` 一致（未重建）。e2e 沿用上一门禁 **34/34**（本轮仅改 e2e 注释，未重跑）。
