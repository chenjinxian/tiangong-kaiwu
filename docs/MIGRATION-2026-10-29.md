# 2026-10-29 七仓整理迁移记录

- 范围：tiangong-kaiwu、luban-backend、imodelhub-services、platform-docs、imodel-native、DanQing。
- 结构：apps/web-next → apps/web；packages/viewer-next → packages/viewer。
- 包名：@luban-cad/web-next → @luban-cad/web；@luban-cad/viewer-next → @luban-cad/viewer。
- 删除：viewer-core、web-viewer、config、旧脚本、itwinjs-core/open-cloud-cad。
- 例外：分支 web-next-m0 与浏览器存储键 luban-next-* 暂不改名。
- 恢复：所有删除内容从 Git 历史恢复，索引见 docs/HISTORY.md。
