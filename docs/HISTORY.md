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
| 旧 dev 编排 | luban-cad/docker-compose.yml | 已删除；根 `docker-compose.yml` 为部署权威 |

> 历史文档中的旧目录名（`apps/web-next`、`viewer-next`、`viewer-core`、`web-viewer` 等）
> 只描述当时状态，不代表当前结构。当前结构见根 `README.md` 与 `luban-cad/README.md`。
