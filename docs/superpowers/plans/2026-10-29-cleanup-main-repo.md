# 主仓全面整理与去 next Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 清空主仓旧应用残留与死代码，把 `web-next`/`viewer-next` 统一为 `web`/`viewer`，删除 fork 内旧应用拷贝，并保留当前有效文档。

**Architecture:** 先清理不可回退的本地残留和已合并 worktree，再删死包、改名、修 lock/Docker/脚本，最后做文档归档与全套门禁。所有 tracked 操作走独立 commit，每阶段可 revert。

**Tech Stack:** pnpm workspace、Vite、Vitest、Playwright、Docker、Rush（itwinjs-core）、PowerShell。

**Spec:** `docs/superpowers/specs/2026-10-29-project-cleanup-design.md`

## Global Constraints

- 只处理 `D:\Github\tiangong-kaiwu`；不改 acis-solid-kernel。
- 不 push、不建 Release；每任务本地 commit。
- 删除以 Git 历史为准；不保留旧计划/旧审计正文。
- 保留 `node_modules`、`dist-backend`、`.superpowers`、Rush `common/temp`、`itwinjs-core/core/*/lib`。
- 最终目标名称：`apps/web`、`@luban-cad/web`、`packages/viewer`、`@luban-cad/viewer`。
- 分支名 `web-next-m0` 不改；浏览器存储键 `luban-next-*` 不改。
- e2e 需要干净的 MS 100 req/15min 窗口；全量前重启 MS。
- main 仓当前基线：`142cda8`（cleanup plans）；工作区 clean 后开始。

---

### Task 1: 基线、worktree 与主仓垃圾清理

**Files:**
- Create: `docs/MIGRATION-2026-10-29.md`
- Delete (untracked/ignored): `luban-cad/apps/web/`, root `test-results/`,
  `luban-cad/apps/web-next/dist`, `luban-cad/apps/web-next/playwright-report`,
  `luban-cad/apps/web-next/test-results`, `luban-cad/packages/*/dist`,
  `luban-cad/services/bff/dist`
- Remove worktrees: `.claude/worktrees/agent-a4d69538fccbc350b`,
  `.claude/worktrees/agent-a6a1087f56b08e6db`

**Interfaces:** none.

- [ ] **Step 1: Record baseline and tags**

Run from `D:\Github\tiangong-kaiwu`:

```powershell
$repos = @(
  'D:\Github\tiangong-kaiwu',
  'D:\Github\luban-backend',
  'D:\Github\imodelhub-services',
  'D:\Github\platform-docs',
  'D:\Github\imodel-native',
  'D:\Github\DanQing'
)
foreach ($repo in $repos) {
  "=== $repo ==="
  git -C $repo rev-parse --abbrev-ref HEAD
  git -C $repo rev-parse HEAD
  git -C $repo status --porcelain
}
```

Expected: main clean at `142cda8`; backend/hub/platform-docs/imodel-native/DanQing clean;
acis not included. Create local tags only:

```powershell
foreach ($repo in $repos) {
  git -C $repo tag -f pre-cleanup-2026-10-29
}
```

- [ ] **Step 2: Verify and remove merged worktrees**

```powershell
git merge-base --is-ancestor worktree-agent-a4d69538fccbc350b HEAD
git merge-base --is-ancestor worktree-agent-a6a1087f56b08e6db HEAD
git worktree remove .claude/worktrees/agent-a4d69538fccbc350b
git worktree remove .claude/worktrees/agent-a6a1087f56b08e6db
git branch -D worktree-agent-a4d69538fccbc350b
git branch -D worktree-agent-a6a1087f56b08e6db
git worktree list
```

Expected: only main worktree remains; both branch-delete commands succeed.

- [ ] **Step 3: Delete old app residual and generated output**

```powershell
$L = 'D:\Github\tiangong-kaiwu\luban-cad'
if (Test-Path "$L\apps\web") { Remove-Item -LiteralPath "$L\apps\web" -Recurse -Force }
Remove-Item -LiteralPath 'D:\Github\tiangong-kaiwu\test-results' -Recurse -Force -ErrorAction SilentlyContinue
foreach ($p in @(
  "$L\apps\web-next\dist",
  "$L\apps\web-next\playwright-report",
  "$L\apps\web-next\test-results",
  "$L\packages\shared\dist",
  "$L\packages\viewer-core\dist",
  "$L\packages\viewer-next\dist",
  "$L\packages\web-viewer\dist",
  "$L\packages\config\dist",
  "$L\services\bff\dist"
)) {
  if (Test-Path $p) { Remove-Item -LiteralPath $p -Recurse -Force }
}
```

Expected: `apps/web` gone; `git status --porcelain` empty (all deleted paths are
untracked/ignored); `apps/web-next/node_modules` and `dist-backend` still exist.

- [ ] **Step 4: Create migration record**

Create `docs/MIGRATION-2026-10-29.md`:

```markdown
# 2026-10-29 七仓整理迁移记录

- 范围：tiangong-kaiwu、luban-backend、imodelhub-services、platform-docs、imodel-native、DanQing。
- 结构：apps/web-next → apps/web；packages/viewer-next → packages/viewer。
- 包名：@luban-cad/web-next → @luban-cad/web；@luban-cad/viewer-next → @luban-cad/viewer。
- 删除：viewer-core、web-viewer、config、旧脚本、itwinjs-core/open-cloud-cad。
- 例外：分支 web-next-m0 与浏览器存储键 luban-next-* 暂不改名。
- 恢复：所有删除内容从 Git 历史恢复，索引见 docs/HISTORY.md。
```

- [ ] **Step 5: Commit**

```powershell
git add docs/MIGRATION-2026-10-29.md
git commit -m "chore(repo): 2026-10-29 清理基线与迁移记录"
```

---

### Task 2: 删除死包与失效脚本

**Files:**
- Delete: `luban-cad/packages/viewer-core/`
- Delete: `luban-cad/packages/web-viewer/`
- Delete: `luban-cad/packages/config/`
- Delete: `luban-cad/scripts/check-config.sh`
- Delete: `luban-cad/scripts/setup-ci.sh`
- Delete: `luban-cad/scripts/setup-env.sh`
- Delete: `luban-cad/scripts/start-all.sh`
- Delete: `luban-cad/scripts/start-dev-services.sh`
- Delete: `luban-cad/scripts/start-services.sh`
- Delete: `luban-cad/scripts/verify-config.js`
- Delete: `luban-cad/scripts/verify-setup.sh`
- Delete: `luban-cad/test-imodel-workflow.js`
- Modify: `luban-cad/pnpm-lock.yaml`（只通过 install 重生成）
- Test: `luban-cad/packages/shared`, `luban-cad/packages/editor`, `luban-cad/apps/web-next`

**Interfaces:**
- Produces: workspace no longer contains `@luban-cad/viewer-core`,
  `@luban-cad/web-viewer`, or `@luban-cad/config`; setup scripts no longer reference them.

- [ ] **Step 1: Confirm no non-self consumers**

```powershell
Set-Location 'D:\Github\tiangong-kaiwu'
git grep -n "@luban-cad/viewer-core\|@luban-cad/web-viewer\|@luban-cad/config" -- ':!luban-cad/packages/viewer-core' ':!luban-cad/packages/web-viewer' ':!luban-cad/packages/config'
```

Expected: no application/package import; only comments/lockfile/setup script hits.
If a real import appears, stop and report BLOCKED.

- [ ] **Step 2: Delete tracked files**

```powershell
git rm -r luban-cad/packages/viewer-core luban-cad/packages/web-viewer luban-cad/packages/config
git rm luban-cad/scripts/check-config.sh luban-cad/scripts/setup-ci.sh luban-cad/scripts/setup-env.sh luban-cad/scripts/start-all.sh luban-cad/scripts/start-dev-services.sh luban-cad/scripts/start-services.sh luban-cad/scripts/verify-config.js luban-cad/scripts/verify-setup.sh luban-cad/test-imodel-workflow.js
```

Expected: all paths removed; no `apps/web` deletion in this step.

- [ ] **Step 3: Regenerate lockfile and install**

```powershell
Set-Location 'D:\Github\tiangong-kaiwu\luban-cad'
$env:CI = 'true'
corepack pnpm@10 install --no-frozen-lockfile
```

Expected: lockfile no longer has importers for the three packages; install exit 0.

- [ ] **Step 4: Run build/tests**

```powershell
$env:CI = 'true'
corepack pnpm@10 -r build
corepack pnpm@10 -r test
corepack pnpm@10 -r lint
```

Expected: all workspace packages green; total test count drops by the 13 tests
from the deleted packages (app's 957 unchanged).

- [ ] **Step 5: Commit**

```powershell
git add -A
git commit -m "chore(luban-cad): 删除无消费者 viewer/config 包与失效脚本"
```

---

### Task 3: `packages/viewer-next` → `packages/viewer`

**Files:**
- Rename: `luban-cad/packages/viewer-next/` → `luban-cad/packages/viewer/`
- Modify: `luban-cad/packages/viewer/package.json`
- Modify: 6 app files importing/mocking `@luban-cad/viewer-next`
- Modify: `luban-cad/apps/web-next/vite.config.ts`
- Modify: `luban-cad/apps/web-next/Dockerfile`
- Modify: `luban-cad/pnpm-lock.yaml`（install）
- Fix (pre-existing viewer debt carried from Task 2):
  - `luban-cad/packages/viewer-next/src/host/test/web-initializer.test.ts`
  - `luban-cad/packages/viewer-next/src/host/web-initializer.ts`
  - `luban-cad/packages/viewer-next/src/viewport/test/render-profile.test.ts`
- Test: viewer package + app unit/build

**Interfaces:**
- Produces: package name `@luban-cad/viewer`; all imports point to it.

- [ ] **Step 1: Rename directory and package name**

```powershell
Set-Location 'D:\Github\tiangong-kaiwu'
git mv luban-cad/packages/viewer-next luban-cad/packages/viewer
```

Change `luban-cad/packages/viewer/package.json`:
```json
"name": "@luban-cad/viewer",
"description": "Viewer host for LubanCAD: iTwin.js startup sequence, RPC wiring, AccuSnap lifecycle"
```

- [ ] **Step 2: Replace import/mock/config references**

```powershell
$files = git grep -l "@luban-cad/viewer-next" -- luban-cad
foreach ($f in $files) {
  (Get-Content $f -Raw).Replace('@luban-cad/viewer-next','@luban-cad/viewer') |
    Set-Content -NoNewline $f
}
```

Expected: only the lockfile may retain old text until Step 3; all source/test/vite/Docker
references use `@luban-cad/viewer`.

- [ ] **Step 3: Fix carried viewer test/lint debt**

In `packages/viewer/src/host/web-initializer.ts`:
- At the lazy import, alias the class to a camelCase local:
  `const { SketchAccuSnap: sketchAccuSnapClass } = await import('../tools/sketch-accu-snap.js');`
  and use `accuSnap: new sketchAccuSnapClass()`.
- Remove the unnecessary `as never` on `new FrontendIModelsAccess(iModelClient)`.
- In `packages/viewer/src/viewport/test/render-profile.test.ts`, remove the unused
  `ColorDef` import.
- In `packages/viewer/src/host/test/web-initializer.test.ts`, replace the single-tick
  `await Promise.resolve(); expect(startupMock)...` at the concurrency test with:
  ```ts
  await vi.waitFor(() => expect(startupMock).toHaveBeenCalledTimes(1), { timeout: 3000 });
  ```
  Keep the second assertion after both acquires.

Run:
```powershell
corepack pnpm@10 --filter @luban-cad/viewer test
corepack pnpm@10 --filter @luban-cad/viewer lint
```
Expected: 11/11 (or all current viewer tests) pass; viewer lint 0 errors.

- [ ] **Step 4: Regenerate lock and test**

```powershell
Set-Location 'D:\Github\tiangong-kaiwu\luban-cad'
$env:CI = 'true'
corepack pnpm@10 install --no-frozen-lockfile
corepack pnpm@10 --filter @luban-cad/viewer build
corepack pnpm@10 --filter @luban-cad/viewer test
corepack pnpm@10 --filter @luban-cad/web-next exec tsc --noEmit
corepack pnpm@10 --filter @luban-cad/web-next test
```

Expected: viewer build/tests green; app typecheck + 957 tests green.

- [ ] **Step 5: Commit**

```powershell
git add -A
git commit -m "refactor(viewer): viewer-next 统一为 viewer"
```

---

### Task 4: `apps/web-next` → `apps/web`

**Files:**
- Rename: `luban-cad/apps/web-next/` → `luban-cad/apps/web/`
- Modify: `luban-cad/apps/web/package.json`
- Modify: `docker-compose.yml`, `luban-cad/docker-compose.dev.yml`
- Modify: `scripts/rebuild-web.ps1`, `scripts/verify-stack.ps1`, `scripts/generate-env.ps1`, `scripts/fetch-backend.ps1`
- Modify: root `.gitignore`, `luban-cad/.gitignore`, `luban-cad/apps/web/.gitignore`
- Modify: `deploy/default.conf.template`, `luban-cad/apps/web/Dockerfile`, `README` comments in app
- Modify: `luban-cad/pnpm-lock.yaml`（install）
- Test: app full unit/build/e2e list, Docker build

**Interfaces:**
- Produces: app directory `luban-cad/apps/web`, package `@luban-cad/web`;
  compose web build points to `luban-cad/apps/web/Dockerfile`.

- [ ] **Step 1: Rename and set package identity**

```powershell
Set-Location 'D:\Github\tiangong-kaiwu'
if (Test-Path luban-cad/apps/web) { throw 'apps/web must be removed in Task 1' }
git mv luban-cad/apps/web-next luban-cad/apps/web
```

Change `luban-cad/apps/web/package.json`:
```json
"name": "@luban-cad/web",
```

- [ ] **Step 2: Replace active path/package references**

Use exact replacements only in active configs/scripts/docs listed below:

```powershell
$replace = @(
  'luban-cad/apps/web-next','luban-cad/apps/web',
  'apps/web-next','apps/web',
  '@luban-cad/web-next','@luban-cad/web'
)
$targets = @(
  'docker-compose.yml','luban-cad/docker-compose.dev.yml',
  'scripts/rebuild-web.ps1','scripts/verify-stack.ps1',
  'scripts/generate-env.ps1','scripts/fetch-backend.ps1',
  'deploy/default.conf.template','.gitignore','luban-cad/.gitignore',
  'luban-cad/apps/web/Dockerfile','luban-cad/apps/web/.gitignore',
  'luban-cad/apps/web/README.md'
)
foreach ($f in $targets) {
  if (-not (Test-Path $f)) { continue }
  $text = Get-Content $f -Raw
  for ($i=0; $i -lt $replace.Count; $i+=2) { $text = $text.Replace($replace[$i],$replace[$i+1]) }
  Set-Content -NoNewline $f $text
}
```

Expected:
- compose `dockerfile: luban-cad/apps/web/Dockerfile`
- rebuild script builds `apps/web`
- lockfile still old until Step 3
- no change to historical docs yet

- [ ] **Step 3: Fix `.gitignore` exceptions and Docker filters**

- Remove obsolete root exceptions that referred to the retired app:
  `!luban-cad/apps/web/shared/lib/`, `!luban-cad/apps/web/.env.development`.
  Keep only rules valid for the new app (e.g. `!luban-cad/apps/web/.env.development`
  only if that file exists in the new app).
- Update `luban-cad/.gitignore` screenshot exception to
  `!apps/web/e2e/__screenshots__/*.png`.
- In `luban-cad/apps/web/Dockerfile`, replace all app paths/filters:
  `apps/web-next` → `apps/web`; `@luban-cad/web-next` → `@luban-cad/web`;
  keep the worker snapshot and symlink assertions but point to `apps/web`.
- In `luban-cad/apps/web/vite.config.ts`, replace
  `@luban-cad/viewer-next` with `@luban-cad/viewer`.

- [ ] **Step 4: Regenerate lock, build, test**

```powershell
Set-Location 'D:\Github\tiangong-kaiwu\luban-cad'
$env:CI = 'true'
corepack pnpm@10 install --no-frozen-lockfile
corepack pnpm@10 --filter @luban-cad/web build
corepack pnpm@10 --filter @luban-cad/web test
corepack pnpm@10 --filter @luban-cad/web exec playwright test --list
```

Expected: build (tsc + vite) green; 957 tests green; Playwright lists 34 tests.

- [ ] **Step 5: Docker build smoke**

```powershell
Set-Location 'D:\Github\tiangong-kaiwu'
docker build -f luban-cad/apps/web/Dockerfile -t luban-web:cleanup-local .
```

Expected: image builds; worker snapshot cmp and symlink assertions pass.

- [ ] **Step 6: Commit**

```powershell
git add -A
git commit -m "refactor(web): web-next 统一为 web"
```

---

### Task 5: 删除 fork 内旧应用拷贝

**Files:**
- Delete: `itwinjs-core/open-cloud-cad/`
- Modify: `docs/UPSTREAM_SYNC.md`
- Modify: `docs/ITWINJS_CORE_MODIFICATIONS.md`
- Modify: `CLAUDE.md`（删除旧拷贝说明或改为历史注记）

**Interfaces:** none.

- [ ] **Step 1: Confirm no external references/build consumers**

```powershell
Set-Location 'D:\Github\tiangong-kaiwu'
git grep -n "open-cloud-cad" -- ':!itwinjs-core/open-cloud-cad'
```

Expected: only `docs/UPSTREAM_SYNC.md` and root `CLAUDE.md`; no rush/pnpm/compose/script.

- [ ] **Step 2: Delete and document**

```powershell
git rm -r itwinjs-core/open-cloud-cad
```

Add to `docs/UPSTREAM_SYNC.md` under the subtree-pull checklist:

```markdown
- 同步后检查 `itwinjs-core/open-cloud-cad/`：该目录是本 fork 已删除的旧品牌应用历史拷贝，
  不属于上游 rush/workspace；若上游同步带回，直接再次删除并记录。
```

Add to `docs/ITWINJS_CORE_MODIFICATIONS.md`:

```markdown
- 2026-10-29：删除 `open-cloud-cad/`（旧品牌应用历史拷贝，438 files）。
  该目录非 rush 项目、无构建消费者；删除属于 fork 本地整理，不是上游修改。
```

Update root `CLAUDE.md` line describing the frozen copy to state it has been deleted
and is recoverable from Git history.

- [ ] **Step 3: Verify**

```powershell
if (Test-Path itwinjs-core/open-cloud-cad) { throw 'open-cloud-cad still exists' }
git status --short
```

- [ ] **Step 4: Commit**

```powershell
git add -A
git commit -m "chore(itwinjs): 删除 fork 内旧应用拷贝并登记同步检查"
```

---

### Task 6: 主仓文档收敛

**Files:**
- Delete: all `docs/superpowers/plans/*` except
  `2026-10-27-backlog-item4-portfolio.md`,
  `2026-10-27-hub-p2-p3-backlog.md`,
  `2026-10-29-subentity-selection.md`,
  `2026-10-29-multibody-perf-guard.md`,
  `2026-10-29-cleanup-main-repo.md`,
  `2026-10-29-cleanup-backends.md`,
  `2026-10-29-cleanup-docs-kernel-engine.md`
- Delete: all `docs/superpowers/specs/*` except
  `2026-09-27-cad-feature-system-decision-record.md`,
  `2026-09-27-cad-feature-system-evidence-base.md`,
  `2026-09-28-cad-full-program-roadmap.md`,
  `2026-10-21-web-onshape-parity-design.md`,
  `2026-10-29-m-a5.2-subentity-selection-perf-design.md`,
  `2026-10-29-project-cleanup-design.md`
- Delete: `docs/DEEP_ANALYSIS.md`, `docs/E2E_TEST_REPORT.md`,
  `docs/RELEASE-backend-20261027b.md`
- Rename: `docs/web-next-realstack-probes.md` → `docs/web-realstack-probes.md`
- Rename: `docs/superpowers/specs/2026-10-21-web-next-onshape-parity-design.md`
  → `2026-10-21-web-onshape-parity-design.md`
- Create: `docs/HISTORY.md`
- Modify: root `README.md`, `CLAUDE.md`, `docs/README.md`, `docs/ROADMAP.md`,
  `docs/Architecture.md`, `docs/Deployment-Guide.md`, `docs/PORTS.md`,
  `docs/UPSTREAM_SYNC.md`, `docs/ITWINJS_CORE_MODIFICATIONS.md`,
  `luban-cad/README.md`, `luban-cad/CLAUDE.md`, `docs/tool-integrations/*`

**Interfaces:** none.

- [ ] **Step 1: Rename the active parity spec first**

```powershell
Set-Location 'D:\Github\tiangong-kaiwu'
if (Test-Path docs/superpowers/specs/2026-10-21-web-next-onshape-parity-design.md) {
  git mv docs/superpowers/specs/2026-10-21-web-next-onshape-parity-design.md docs/superpowers/specs/2026-10-21-web-onshape-parity-design.md
}
```

- [ ] **Step 2: Delete historical plans/specs with an explicit keep-list**

```powershell
Set-Location 'D:\Github\tiangong-kaiwu'
$keepPlans = @(
  '2026-10-27-backlog-item4-portfolio.md',
  '2026-10-27-hub-p2-p3-backlog.md',
  '2026-10-29-subentity-selection.md',
  '2026-10-29-multibody-perf-guard.md',
  '2026-10-29-cleanup-main-repo.md',
  '2026-10-29-cleanup-backends.md',
  '2026-10-29-cleanup-docs-kernel-engine.md'
)
Get-ChildItem docs/superpowers/plans -File |
  Where-Object { $_.Name -notin $keepPlans } | Remove-Item -Force
$keepSpecs = @(
  '2026-09-27-cad-feature-system-decision-record.md',
  '2026-09-27-cad-feature-system-evidence-base.md',
  '2026-09-28-cad-full-program-roadmap.md',
  '2026-10-21-web-onshape-parity-design.md',
  '2026-10-29-m-a5.2-subentity-selection-perf-design.md',
  '2026-10-29-project-cleanup-design.md'
)
Get-ChildItem docs/superpowers/specs -File |
  Where-Object { $_.Name -notin $keepSpecs } | Remove-Item -Force
```

- [ ] **Step 3: Delete stale root docs and rename probes doc**

```powershell
git rm docs/DEEP_ANALYSIS.md docs/E2E_TEST_REPORT.md docs/RELEASE-backend-20261027b.md
git mv docs/web-next-realstack-probes.md docs/web-realstack-probes.md
```

- [ ] **Step 4: Create HISTORY index**

Create `docs/HISTORY.md`:

```markdown
# 文档历史索引（2026-10-29 整理）

本文件只保留已删除内容的索引。旧正文从 Git 历史恢复：

```bash
git log --all -- <path>
git show <commit>:<path>
```

| 主题 | 旧路径 | 说明 |
|---|---|---|
| M0–M5 web 重写 | docs/superpowers/plans/2026-10-21-web-next-*、2026-10-22-* | 已完成，当前前端见 apps/web |
| M6 草图/教程 | docs/superpowers/plans/2026-10-23-*、2026-10-24-* | 已完成 |
| B1–B5 特征契约 | docs/superpowers/plans/2026-10-27-feature-contracts-* | 已完成，契约以 shared 源码为准 |
| M-A3/M-A4/M-A5.1 | docs/superpowers/plans/2026-10-28-* | 已完成 |
| Isomantle | docs/superpowers/plans/2026-10-27-isomantle-* | C0/C4 已记录，C1–C3 暂停 |
| 旧架构/审计 | docs/DEEP_ANALYSIS.md、docs/E2E_TEST_REPORT.md | 已删除 |
```

- [ ] **Step 5: Rewrite current docs to final names/facts**

Apply these exact facts:

- frontend: `luban-cad/apps/web`; package `@luban-cad/web`
- viewer: `luban-cad/packages/viewer`; package `@luban-cad/viewer`
- remove `viewer-core`, `web-viewer`, `config` from package tables
- dev port `:5300`, nginx `:5301`, hub `:5400`/container `:4000`,
  MS `:5401`, webhook-agent `:5402`
- no current doc may say `apps/web-next`, `web-next`, `viewer-next`,
  `viewer-core`, `web-viewer`, `open-cloud-cad` as active paths
- `ROADMAP.md` becomes a short index pointing to
  `docs/superpowers/specs/2026-09-28-cad-full-program-roadmap.md` and
  `platform-docs/ROADMAP.md`
- `README.md`/`luban-cad/README.md` use the new package tree and commands
- `docs/web-realstack-probes.md` uses current paths/ports

Use `rg` to find active docs with old names:

```powershell
rg -n "apps/web-next|web-next|viewer-next|viewer-core|web-viewer|open-cloud-cad" README.md CLAUDE.md docs luban-cad/README.md luban-cad/CLAUDE.md
```

For each hit in a kept current doc, replace with the new name or delete the stale
sentence. Do not touch `docs/HISTORY.md` or `MIGRATION-2026-10-29.md` history lines.

- [ ] **Step 6: Commit**

```powershell
git add -A
git commit -m "docs: 收敛当前文档并删除已完成历史计划"
```

---

### Task 7: 全套门禁与收口

**Files:**
- Modify: `docs/MIGRATION-2026-10-29.md`（记录结果）
- Possibly fix paths discovered by tests only.

**Interfaces:** none.

- [ ] **Step 1: Full unit/build/lint**

```powershell
Set-Location 'D:\Github\tiangong-kaiwu\luban-cad'
$env:CI = 'true'
corepack pnpm@10 install --frozen-lockfile
corepack pnpm@10 -r build
corepack pnpm@10 -r test
corepack pnpm@10 --filter @luban-cad/web --filter @luban-cad/viewer lint
```

Expected: build/workspace tests green; app 957 tests; viewer test fixed by Task 3.
The pre-existing `@luban-cad/shared` lint debt (38 errors) is explicitly recorded
as a baseline exception in `MIGRATION-2026-10-29.md`; do not claim `pnpm -r lint`
green and do not drive-by rewrites in shared here. No old package importers in lockfile.

- [ ] **Step 2: Stale scan**

```powershell
Set-Location 'D:\Github\tiangong-kaiwu'
rg -n "apps/web-next|web-next|viewer-next|viewer-core|web-viewer|open-cloud-cad" \
  README.md CLAUDE.md docs luban-cad --glob '!docs/HISTORY.md' \
  --glob '!docs/MIGRATION-2026-10-29.md' --glob '!**/node_modules/**'
```

Expected: zero hits except explicitly documented exceptions. Allow:
- branch name `web-next-m0` in historical/release text
- `luban-next-*` browser storage keys
- `:5310` in CORS negative tests
- historical content in `docs/HISTORY.md` / migration record

- [ ] **Step 3: Rebuild web image and verify stack**

Restart MS for a clean rate window, then:

```powershell
Set-Location 'D:\Github\tiangong-kaiwu'
powershell -NoProfile -File scripts/rebuild-web.ps1
docker compose up -d web
powershell -NoProfile -File scripts/verify-stack.ps1
```

Expected: image build from `luban-cad/apps/web/Dockerfile`, verify 17/17.

- [ ] **Step 4: Full e2e**

```powershell
Set-Location 'D:\Github\tiangong-kaiwu\luban-cad\apps\web'
$env:CI = 'true'
corepack pnpm@10 exec playwright test
```

Expected: 34/34 in a clean rate window. If transient briefcase stall, rerun the
failed spec once; record result.

- [ ] **Step 5: Final record and commit**

Append to `docs/MIGRATION-2026-10-29.md`:

```markdown
## 执行结果

- 删除：apps/web 残留、worktree、死包、旧脚本、fork 旧应用、历史文档。
- 改名：apps/web-next → apps/web；viewer-next → viewer。
- 门禁：web unit 957/957；build/lint；e2e 34/34；verify 17/17。
- 例外：acis-solid-kernel 保持原样；分支名与存储键未改名。
```

```powershell
git add docs/MIGRATION-2026-10-29.md
git commit -m "docs: 主仓清理执行结果"
```

---

## Self-Review

- Spec coverage: worktrees/junk (T1), dead packages (T2), viewer rename (T3),
  web rename (T4), fork deletion (T5), docs policy (T6), gates (T7).
- No placeholder paths: all rename targets, keep-lists, and deletion commands are explicit.
- Type/interface consistency: app `@luban-cad/web`, viewer `@luban-cad/viewer`,
  Docker/compose/scripts all target the same paths.
- Main repo gate preserved: 957 unit tests, 34 e2e, 17/17 verify.
