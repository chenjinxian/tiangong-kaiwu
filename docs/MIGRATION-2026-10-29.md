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
- 门禁：web unit 957/957；workspace build 绿；verify 17/17；viewer/app lint 绿。
- e2e：33/34。唯一红为 `visual.spec.ts`「视觉钉版：文档详情（亮色）」——种子 iModel 创建日期随当日重建漂移（基线 2026年10月28日 vs 实际 2026年10月29日，13 px / 0.01%，差异仅日期字形）；定向单测重试一次仍红（确定性数据漂移，非本轮代码回归，未重钉基线、不掩盖）。
- 既存例外：`@luban-cad/shared` 38 个 lint 错误为清理前基线，未在本轮扩大修复。
- 例外：acis-solid-kernel 保持原样；分支名与存储键未改名。
- 旧命名残留：仅历史/证据文档与 `.superpowers` 物理目录路径（docs/HISTORY、ITWINJS_CORE_MODIFICATIONS、UPSTREAM_SYNC、web-realstack-probes 及 `e2e/perf.spec.ts` 证据根）保留旧名；active 代码注释已清零。
