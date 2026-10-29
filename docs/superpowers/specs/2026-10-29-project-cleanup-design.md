# 全面整理与清理设计（项目总目录 + 四个关联仓）

- 日期：2026-10-29
- 状态：spec 已确认；执行中（platform-docs 已按用户裁决删除）
- 性质：跨仓结构整理、命名统一、过时内容删除、生成物清理
- 范围：tiangong-kaiwu（项目总目录）+ luban-backend、imodelhub-services、imodel-native、DanQing（见 §2）；acis-solid-kernel 仅审计，不修改
- 原则：不 push、不建 Release；每阶段独立本地提交；仓内删除以 Git 历史为准

## 1. 目标与非目标

### 目标

1. 新版前端成为唯一前端后，彻底移除过渡命名：
   - `apps/web-next` → `apps/web`
   - `@luban-cad/web-next` → `@luban-cad/web`
   - `packages/viewer-next` → `packages/viewer`
   - `@luban-cad/viewer-next` → `@luban-cad/viewer`
2. 删除无消费者的旧 viewer/config 包、失效脚本和旧应用历史拷贝。
3. 清理生成残留、已合并 worktree、token 会话文件和可重建构建产物。
4. 统一项目总目录与关联自有仓的当前文档、端口、路径、品牌和状态口径。
5. 删除已完成/过时的计划、旧审计、旧分析；每个仓保留一个 `HISTORY.md` 索引，
   旧内容从 Git 历史恢复。
6. 清理后所有纳入仓库的 `git status` 为 clean；acis 例外保持原样。

### 非目标

- 不改 acis-solid-kernel 的研究源码、基线、探针或 `.diag`。
- 不改 itwinjs-core 上游同步策略以外的最小 fork 修改。
- 不改业务功能；除端口/配置纠偏和锁文件重生成外，不新增功能。
- 不删除 `node_modules`、`dist-backend`、`.superpowers`、Rush `common/temp`、
  `itwinjs-core/core/*/lib`。
- 不改 Git 分支名 `web-next-m0`（涉及远端/PR；另议）。
- 不改浏览器存储键 `luban-next-*`（涉及登录态迁移；另议）。
- 不恢复 TEST_MODE，不修改数据库迁移历史。

## 2. 仓库范围

纳入：

1. `D:\Github\tiangong-kaiwu`（项目总目录，含 `luban-cad`、`itwinjs-core`）
2. `D:\Github\luban-backend`
3. `D:\Github\imodelhub-services`
4. `D:\Github\imodel-native`
5. `D:\Github\DanQing`

`D:\Github\platform-docs`：按用户裁决于 2026-10-29 整仓删除，不迁移内容；
主仓 `docs/` 成为唯一文档根。

排除：

- `D:\Github\acis-solid-kernel`：研究仓，773 项工作区改动保持原样；`.diag` 4.2 GB
  也保留，不纳入自动清理。
- 官方 SDK、样本仓、第三方上游、`decompiled_*`、`forensics` 等辅助目录。

## 3. 已确认决策

| 决策 | 结论 |
|---|---|
| 命名 | 全量去 `next`：`apps/web`、`@luban-cad/web`、`packages/viewer`、`@luban-cad/viewer` |
| 过时内容 | 删除，以 Git 历史为准；当前有效文档 + `HISTORY.md` 索引 |
| 旧 viewer | `viewer-core`、`web-viewer`、`config` 删除；已确认无外部消费者 |
| fork 旧应用 | 删除 `itwinjs-core/open-cloud-cad` 并登记同步检查单 |
| worktree | 两个 `.claude/worktrees` 分支已包含在当前 HEAD，删除工作树与本地分支 |
| token 残留 | `luban-cad/apps/web/playwright/.auth` 随旧 app 残留一起删除 |
| 构建产物 | 回收 `imodel-native/out/cmake`、`DanQing/build`、`luban-backend/dist-out+staging` |
| platform-docs | 整仓删除，不迁移内容；主仓 `docs/` 为唯一文档根 |
| acis | 完全保留，包括 `.diag` |
| 保留资产 | `node_modules`、`dist-backend`、`.superpowers`、Rush `common/temp`、itwinjs `lib` |
| 推送 | 不 push、不建 Release |

## 4. 目标结构

```
luban-cad/
  apps/web/                 # 原 apps/web-next
  packages/viewer/          # 原 packages/viewer-next
  packages/editor/
  packages/shared/
  # viewer-core / web-viewer / config 删除
```

包名：

- `@luban-cad/web`
- `@luban-cad/viewer`
- 保留 `@luban-cad/editor-*`、`@luban-cad/shared`

命名例外：

- Git 分支 `web-next-m0` 本轮不改。
- 浏览器存储键 `luban-next-*` 本轮不改，文档标注为会话兼容例外。
- 历史文档删除后，旧名词只允许出现在 `HISTORY.md` 的索引行中。

## 5. 分阶段执行

### Phase 0：基线与安全

- 记录纳入仓 HEAD、分支、`git status`。
- 在纳入仓打本地标签 `pre-cleanup-2026-10-29`（仅本地，不 push）。
- 确认 `.claude/worktrees` 两个分支都已包含在当前 HEAD；移除工作树和本地分支。
- 删除前列出目标路径、大小、`git ls-files` 状态；禁止 `git clean -fdx` 全仓盲扫。

### Phase 1：主仓垃圾与生成物

删除：

- `luban-cad/apps/web/` 全部残留（49 MiB，0 tracked；含 `playwright/.auth` token 文件）
- `luban-cad/apps/web-next/dist`、`test-results`、`playwright-report`、coverage、
  临时 log（保留 `apps/web-next/node_modules`）
- 根 `test-results/`
- `luban-cad/packages/*/dist`、`services/bff/dist`（可重建；不删 `itwinjs-core/core/*/lib`）
- 两个 `.claude/worktrees` 工作树（约 706 MiB）

保留：

- `dist-backend/`、`node_modules/`、`.superpowers/`、`itwinjs-core/common/temp/`、
  `itwinjs-core/core/*/lib/`

### Phase 2：主仓死代码与去 next

删除：

- `luban-cad/packages/viewer-core`（35 files）
- `luban-cad/packages/web-viewer`（10 files）
- `luban-cad/packages/config`（6 files，无消费者）
- `luban-cad/scripts/check-config.sh`
- `luban-cad/scripts/setup-ci.sh`
- `luban-cad/scripts/setup-env.sh`
- `luban-cad/scripts/start-all.sh`
- `luban-cad/scripts/start-dev-services.sh`
- `luban-cad/scripts/start-services.sh`
- `luban-cad/scripts/verify-config.js`
- `luban-cad/scripts/verify-setup.sh`
- `luban-cad/test-imodel-workflow.js`

重命名：

1. `luban-cad/packages/viewer-next` → `luban-cad/packages/viewer`
   - package.json：`@luban-cad/viewer`
   - 更新 6 个 app import/mock、vite `optimizeDeps`、Docker、lockfile
   - 运行 viewer build/unit，再运行 app unit
2. `luban-cad/apps/web-next` → `luban-cad/apps/web`
   - package.json：`@luban-cad/web`
   - 更新根/子 compose、Dockerfile、`rebuild-web.ps1`、verify/generate-env/fetch-backend
     注释、`.gitignore` 的 `apps/web` 豁免、Playwright 基线路径、`pnpm-lock.yaml`
   - 重新 `pnpm install` 生成 lockfile；Docker 使用 frozen lockfile，必须同步
   - 更新 E2E 标题/注释/文档中的 `web-next`；测试路径随目录移动
3. 活跃文档文件名：
   - `docs/web-next-realstack-probes.md` → `docs/web-realstack-probes.md`
   - `docs/superpowers/specs/2026-10-21-web-next-onshape-parity-design.md`
     → `2026-10-21-web-onshape-parity-design.md`

代码注释：

- 指向旧 `apps/web` 的历史注释改为“旧应用（已退役）”，不保留失效路径。
- 保留必要的移植来源说明时，不写不存在的目录。

### Phase 3：主仓文档与 fork 清理

删除 `itwinjs-core/open-cloud-cad/`（438 tracked files，19.2 MiB）：

- 在 `docs/UPSTREAM_SYNC.md` 增加“同步后若带回 `open-cloud-cad/` 则删除”的检查单。
- 在 `docs/ITWINJS_CORE_MODIFICATIONS.md` 登记这是 fork 本地删除，不是上游改动。
- 同步脚本无需改代码；文档明确该目录非 rush/workspace 项目。

文档保留（当前有效）：

- 根：`README.md`、`CLAUDE.md`
- `docs/`：`README.md`、`Architecture.md`、`Deployment-Guide.md`、`PORTS.md`、
  `UPSTREAM_SYNC.md`、`ITWINJS_CORE_MODIFICATIONS.md`、`ROADMAP.md`（重写）、
  `SKETCH-CONSTRAINT-WORKFLOW.md`、`baseline-reliability-design.md`、
  `IMODEL_AUTO_RECOVERY_DESIGN.md`、`CONSTRAINT-SOLVER-COMPARISON.md`、
  `iTwin.js-Tools-Complete-Reference.md`、`WEBHOOK_CONFIG.md`、
  `native-typings-drift-*.md`、`api-specs/*`、`tool-integrations/*`、
  `RELEASE-backend-20261028c.md`、`HISTORY.md`（新增）
- `luban-cad/README.md`（重写）、`CLAUDE.md`（更新）
- 活跃 `docs/superpowers`：
  - specs：`2026-09-27-cad-feature-system-decision-record.md`、
    `2026-09-27-cad-feature-system-evidence-base.md`、
    `2026-09-28-cad-full-program-roadmap.md`、
    `2026-10-21-web-onshape-parity-design.md`、
    `2026-10-29-m-a5.2-subentity-selection-perf-design.md`、
    `2026-10-29-project-cleanup-design.md`
  - plans：`2026-10-27-backlog-item4-portfolio.md`、
    `2026-10-27-hub-p2-p3-backlog.md`、`2026-10-29-subentity-selection.md`、
    `2026-10-29-multibody-perf-guard.md`、
    `2026-10-29-cleanup-main-repo.md`、`2026-10-29-cleanup-backends.md`、
    `2026-10-29-cleanup-docs-kernel-engine.md`

删除（已完成的计划/旧文档）：

- `docs/superpowers` 中除上述活跃清单外的全部 plans/specs（M0–M5、M6a–d、
  B1–B5、M-A3/M-A4/M-A5.1、Isomantle、旧架构/事件链/后端私有化等）
- `docs/DEEP_ANALYSIS.md`
- `docs/E2E_TEST_REPORT.md`
- `docs/RELEASE-backend-20261027b.md`
- `docs/superpowers` 除活跃清单外的 34 份 plans 与 13 份 specs；逐项由执行计划列出

`docs/ROADMAP.md` 重写为当前路线索引，不再复制平台分期全文。新增
`docs/HISTORY.md`，只保留里程碑索引和 Git 恢复提示。

### Phase 4：luban-backend

代码/配置：

- `modeling-server/src/config.ts`：`FRONTEND_URL` 默认 `http://localhost:3000`
  → `http://localhost:5300`；同步 `main.test.ts`。
- 更新 5 个 feature 文件中的 `web-next` 注释为 `web`。
- 删除 `modeling-server/package.json` 的 `start:web`（与 `dev` 重复且无调用者）。
- `scripts/resolve-deps.js` 的 editor-frontend 映射改为
  `luban-cad/packages/editor/frontend`，与 2026-10-22 收编后的结构一致。

文档：

- 保留 `README.md`、`CLAUDE.md`；修正过时的 303/8 测试基线为当前口径。
- 删除 `docs/release-backend-20261026.md`、`release-backend-20261027.md`、
  `release-hub-20261027.md`、`release-hub-20261028.md`；发布记录归
  `HISTORY.md` 和 Git 历史。
- 新增 `HISTORY.md`。

生成物：

- 删除 `dist-out`（10.8 GB 历史 tgz）与 `staging`（约 392 MB）。
- 保留两个 `node_modules`、各 `dist`（服务运行/构建现场）。

验证：

- 两服务 `vitest run`、`lint`、`build`；重点跑 config/main/CORS 相关测试。

### Phase 5：imodelhub-services

端口/脚本：

- 应用端口统一为 `APP_PORT=4000`（宿主 compose 映射 5400）；前端默认
  `http://localhost:5300`。
- 修复 `package.json`、`startup.relational.ci.sh`、`test/load/k6.config.ts` 和
  load 脚本中的 `:3000`；OIDC 默认回调改前端 5300；更新 `env-example-relational`、
  `.env.example`。
- `:5310` 仅保留在 CORS 负例测试中；其他当前文档/配置删除。
- 删除损坏的 `test/load/scripts/run-load-tests.sh`、`run-smoke-test.sh`；
  保留并修正 k6 配置/脚本，不保留无法执行的伪入口。
- 删除 `Procfile`（Heroku 遗留）。
- 更新 3 处旧品牌版权头为天工开物/鲁班CAD。
- `scripts/setup-webhook-for-testing.sql` 的 `web-agent` 文案改为 `webhook-agent`。

文档：

- 保留 `README.md`、`CLAUDE.md`、`CHANGELOG.md`、`docs/BACKLOG.md`、
  `docs/architecture.md`；修正端点数、测试数、完成状态（以当前代码/测试为准）。
- 删除 `docs/AUDIT-2026-10-12.md` 和 `docs/superpowers/` 下已完成的
  10 个 plan/spec（约 2,622 行）；新增 `HISTORY.md`。
- 修剪 `docs/auth.md`、`docs/database.md`、`docs/installing-and-running.md`
  的 MongoDB/Mongoose 旧脚手架和失效 URL；保留 API 相关段落。
- 修复 `CLAUDE.md` 中指向不存在文件的链接。

生成物：

- 删除 `coverage/`、`logs/`、根 `server.log`；保留 `node_modules`、`dist`、`.env`。

验证：

- `npm run test:unit`、`npm run lint`、`npm run build`；端口相关单测。
- 若环境允许，跑 e2e/relational Docker；未跑需在 HISTORY/执行结果记录。

### Phase 6：imodel-native / DanQing

**platform-docs**

按用户裁决整仓删除，不迁移内容；主仓 `docs/` 成为唯一文档根。
原计划的 STATUS/历史快照改写取消，被中止的未提交改动一并丢弃。

**imodel-native**

- 删除 `out/cmake`、`build/__pycache__`、pytest 缓存；保留 `out/npm-pkg`、
  `out/ida`、`out/ts-api-staging`、`docs/reference/ida`、`docs/reference/compare`。
- 删除 `docs/superpowers` 中已完成历史计划；新增 `HISTORY.md`。
- 修正 2 处旧路径/旧端口引用；不改原生源码。

**DanQing**

- 删除 `build/`（约 37 GB）、`output-shaders-test`、`saved-views-test`、
  `macro-*.macro`；不碰 `third_party`、`.claude`、源码。
- DTA 旧矩阵/统计 4 份（`DisplayTestApp-view页面差距矩阵.md`、
  `DTA功能对照与专业化分析-2026-09-30.md`、
  `DTA一致性审计台账-2026-10-07.md`、`DTA功能对照统计-2026-10-07.md`）
  合并为最新 `DTA与DanQing-DebugInfo逐视图对比-2026-10-24.md` 一份；
  删除这 4 份；新增或更新 `docs/HISTORY.md`。
- 当前文档无旧 web 引用；只做过期文档合并。
- 构建删除后不立即重编译；下次构建前按 README 重新配置，执行结果记录该延后项。

## 6. 端口/URL 统一矩阵

| 用途 | 当前/目标 |
|---|---|
| web dev | `:5300` |
| web nginx 单入口 | `:5301` |
| imodelhub 宿主 | `:5400` |
| imodelhub 容器内 APP_PORT | `:4000` |
| modeling-server | `:5401` |
| webhook-agent | `:5402` |
| 旧 web dev | `:3000`/`:5310` 删除（仅测试负例/历史索引允许） |
| `FRONTEND_URL` 默认 | `http://localhost:5300` |

## 7. 验证矩阵

1. **主仓**
   - `cd luban-cad && corepack pnpm@10 install`
   - `pnpm -r build`、`pnpm -r test`、`pnpm lint`
   - app 全量单测（当前 957）与 `tsc --noEmit`
   - Playwright 全量 e2e 34（干净 MS 限流窗口）
   - `scripts/rebuild-web.ps1` + compose + `verify-stack.ps1` 17/17
2. **viewer**：build + unit；app import/mock 路径回归
3. **luban-backend**：两服务 vitest/lint/build；config/CORS 测试
4. **imodelhub-services**：unit/lint/build；端口/CI/load 配置检查
5. **文档**：markdown 链接检查；全仓 stale 扫描
   `web-next|viewer-next|apps/web-next|open-cloud-cad|Zokei`
   目标零命中；允许白名单：`HISTORY.md`、分支名、`luban-next-*` 存储键、
   测试负例 `:5310`、容器内部 `web:3000`
6. **imodel-native / DanQing**：仅文档/生成物变更；不重编译，记录延后；
   若后续构建，按各仓基线命令执行
7. **acis**：不运行、不修改；`git status` 保持原状并在最终报告登记

## 8. 安全、回滚与失败处理

- 删除前记录目标路径、大小、tracked 状态；每阶段独立 commit，可 `git revert`。
- 不使用 `git clean -fdx`；只删除清单内路径。
- 删除 `apps/web` 前确认 0 tracked；token 文件删除后如需要重新登录开发账号。
- 删除 worktree 前再次确认分支被 HEAD 包含且工作树 clean。
- `pnpm-lock.yaml` 只通过 `pnpm install` 重生成，不手改。
- Docker 使用 frozen lockfile；rename 后必须重建镜像并跑 verify。
- 若 e2e 因目录移动失败，只修路径/选择器，不降级测试。
- 若端口修复导致既有环境失败，保留旧值作为 env 可覆盖默认，并在文档说明。

## 9. 交付物

- 纳入仓清理后的代码/文档与本地提交；platform-docs 已删除；acis 不变。
- 主仓 `docs/HISTORY.md` 与各仓 `HISTORY.md`。
- 一份执行结果记录：删除清单、回收容量、改名映射、验证结果、残余项。
- 不 push、不建 Release；由用户逐次决定。

## 10. 验收定义

- `luban-cad/apps/web` 与 `packages/viewer` 为唯一命名，旧名在活跃代码/配置/文档零命中。
- 死包、失效脚本、旧应用拷贝、旧计划/审计、生成物按清单删除。
- 主仓全量单测/build/e2e/verify 全绿；backend/hub 各自门禁全绿。
- 纳入仓 `git status` clean；platform-docs 已删除；acis 明确例外。
- 仓内删除内容可从 Git 历史恢复；`HISTORY.md` 提供索引。
