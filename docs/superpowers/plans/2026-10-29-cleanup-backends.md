# 后端两仓整理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 清理 luban-backend 与 imodelhub-services 的旧端口、旧状态文档、损坏脚本和过期发布记录，并统一到当前 5300/4000 体系。

**Architecture:** 先修可执行配置（FRONTEND_URL、APP_PORT、CI/load、OIDC 回调），再删损坏入口和过期文档，最后跑各仓单测/lint/build。两仓分别独立提交。

**Tech Stack:** TypeScript、Vitest、NestJS、pnpm、PowerShell。

**Spec:** `docs/superpowers/specs/2026-10-29-project-cleanup-design.md`

## Global Constraints

- 不改业务功能，只修端口/路径/命名与过期内容。
- 不恢复 TEST_MODE；不动迁移历史。
- `:5310` 只保留在 CORS 负例测试。
- 不改 `.env` 私密值；只改 example/default。
- 执行期不 push、不建 Release；每任务本地 commit；完成后按用户指示推送/发布（见 MIGRATION）。
- 删除前确认路径存在；不删除数据库迁移。

---

### Task 1: luban-backend 配置与脚本纠偏

**Files:**
- Modify: `D:\Github\luban-backend\modeling-server\src\config.ts:47`
- Modify: `D:\Github\luban-backend\modeling-server\src\main.test.ts:20`
- Modify: `D:\Github\luban-backend\modeling-server\package.json:13`
- Modify: `D:\Github\luban-backend\scripts\resolve-deps.js:20-39`
- Modify comments in:
  `modeling-server/src/feature/FeatureService.ts`,
  `FeatureTypeRegistry.ts`,
  `FeatureTypeRegistry.test.ts`,
  `NewBodyLifecycle.test.ts`,
  `SketchPlaneFlow.test.ts`
- Test: modeling-server config/main tests + full feature suite

**Interfaces:**
- Produces: default frontend origin `http://localhost:5300`; editor package
  resolution uses `luban-cad/packages/editor/*`.

- [ ] **Step 1: Update FRONTEND_URL defaults**

`modeling-server/src/config.ts`:
```ts
FRONTEND_URL: url('http://localhost:5300'),
```
`modeling-server/src/main.test.ts`:
```ts
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5300';
```

- [ ] **Step 2: Remove dead script**

Delete from `modeling-server/package.json`:
```json
"start:web": "cross-env NODE_ENV=development tsx watch src/main.ts",
```

- [ ] **Step 3: Fix editor package resolution**

In `scripts/resolve-deps.js`, replace the `dirMap`/`srcDir` block with:

```js
const editorSub = subDir.startsWith('editor-') ? subDir.slice('editor-'.length) : undefined;
if (editorSub) {
  const lubanEditorDir = path.join(
    itwinjsCoreDir, '..', 'luban-cad', 'packages', 'editor', editorSub,
  );
  if (fs.existsSync(lubanEditorDir)) return lubanEditorDir;
}
const dirMap = {
  'core-backend': 'core/backend',
  'core-bentley': 'core/bentley',
  'core-common': 'core/common',
  'core-geometry': 'core/geometry',
  'core-quantity': 'core/quantity',
  'ecschema-metadata': 'core/ecschema-metadata',
};
const mapped = dirMap[subDir] || `core/${subDir}`;
const srcDir = path.join(itwinjsCoreDir, mapped);
if (fs.existsSync(srcDir)) return srcDir;
```

- [ ] **Step 4: Replace `web-next` comments**

In the five feature files, replace `web-next` with `web` when referring to the
current frontend. Do not change test logic or IDs.

- [ ] **Step 5: Test**

```powershell
Set-Location 'D:\Github\luban-backend\modeling-server'
$env:CI = 'true'
corepack pnpm@10 exec vitest run src/config.test.ts src/main.test.ts
corepack pnpm@10 exec vitest run src/feature
corepack pnpm@10 lint
corepack pnpm@10 build
```

`src/config.test.ts` and `src/main.test.ts` both exist; run both.  
Expected: all green; no `3000` default in config.

- [ ] **Step 6: Commit**

```powershell
cd D:\Github\luban-backend
git add modeling-server scripts
git commit -m "chore(ms): 前端默认端口与 editor 路径纠偏"
```

---

### Task 2: luban-backend 文档与构建产物

**Files:**
- Delete: `docs/release-backend-20261026.md`,
  `docs/release-backend-20261027.md`,
  `docs/release-hub-20261027.md`,
  `docs/release-hub-20261028.md`
- Create: `HISTORY.md`
- Modify: `README.md`, `CLAUDE.md`
- Delete (ignored): `dist-out/`, `staging/`

**Interfaces:** none.

- [ ] **Step 1: Delete old release docs and add HISTORY**

```powershell
Set-Location 'D:\Github\luban-backend'
git rm docs/release-backend-20261026.md docs/release-backend-20261027.md docs/release-hub-20261027.md docs/release-hub-20261028.md
```

Create `HISTORY.md`:
```markdown
# 历史索引（2026-10-29 整理）

- 2026-10-26/27/28 发布记录已删除；从 Git 历史恢复：
  `git log --all -- docs/release-*.md`。
- 最新 MS 产物与公开 Release 说明以
  `tiangong-kaiwu/docs/RELEASE-backend-20261028c.md` 为准。
- 历史发布产物目录 `dist-out/`、`staging/` 已于 2026-10-29 清理；
  需要发布时重新运行构建脚本。
```

- [ ] **Step 2: Reconcile current docs**

- `CLAUDE.md`：删除“MS 303 passed/8 skipped”硬编码；改为
  “测试数以当前 `corepack pnpm@10 exec vitest run` 输出为准”。
- `README.md`：只保留当前双服务结构、当前端口 5401/5402、当前构建命令；
  删除 `web-next` 前端归属描述。
- `rg -n "web-next|apps/web|3000" README.md CLAUDE.md` 后逐条修正；
  `:3000` 只允许出现在“旧端口已废弃”的说明中。

- [ ] **Step 3: Reclaim build/release artifacts**

```powershell
$root = 'D:\Github\luban-backend'
foreach ($p in @("$root\dist-out", "$root\staging")) {
  if (Test-Path $p) {
    $size = (Get-ChildItem $p -Recurse -File | Measure-Object Length -Sum).Sum
    "DELETING $p ($([math]::Round($size/1GB,2)) GB)"
    Remove-Item -LiteralPath $p -Recurse -Force
  }
}
```

Expected: reclaimed ~11.2 GB; `dist-out`/`staging` gone; `node_modules` and
service `dist` remain.

- [ ] **Step 4: Commit**

```powershell
git add README.md CLAUDE.md HISTORY.md docs
git commit -m "docs(backend): 清理历史发布记录并同步当前结构"
```

---

### Task 3: imodelhub-services 端口、脚本与品牌纠偏

**Files:**
- Modify: `package.json:37`, `startup.relational.ci.sh:9`,
  `test/load/k6.config.ts:14`, `test/load/scripts/*`
- Modify: `env-example-relational:7,143,149,167`, `.env.example:9,125`
- Modify: `src/oidc/config/oidc.config.ts:45,71,92`,
  `src/oidc/oidc.service.ts:154,180,203`
- Modify: `src/common/guards/api-key.guard.ts:2`,
  `src/imodels/imodels-admin.controller.ts:2`
- Modify: `scripts/setup-webhook-for-testing.sql`
- Delete: `test/load/scripts/run-load-tests.sh`,
  `test/load/scripts/run-smoke-test.sh`, `Procfile`
- Test: unit/lint/build + port grep

**Interfaces:**
- Produces: app listen/CI/load target `:4000`; frontend defaults `:5300`;
  OIDC redirect URIs `http://localhost:5300/...`; no executable malformed scripts.

- [ ] **Step 1: Fix port defaults**

Apply these exact replacements:

- `package.json` `test:e2e:relational:docker`: `localhost:3000` → `localhost:4000`.
- `startup.relational.ci.sh`: `localhost:3000` → `localhost:4000`.
- `test/load/k6.config.ts`: `'http://localhost:3000'` → `'http://localhost:4000'`.
- `env-example-relational`:
  - `FRONTEND_DOMAIN=http://localhost:5173` → `http://localhost:5300`
  - `ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000`
    → `http://localhost:5300`
  - OIDC example redirect `http://localhost:3000/callback`
    → `http://localhost:5300/callback`
  - `web-next` in OIDC note → `web`
- `.env.example`:
  - `FRONTEND_DOMAIN` → `http://localhost:5300`
  - `ALLOWED_ORIGINS` → `http://localhost:5300`
- `src/oidc/config/oidc.config.ts` and `src/oidc/oidc.service.ts`:
  replace `http://localhost:3000` with `http://localhost:5300`; keep
  `http://localhost:8080` as a second dev callback.

- [ ] **Step 2: Delete malformed load entrypoints and Procfile**

```powershell
Set-Location 'D:\Github\imodelhub-services'
git rm test/load/scripts/run-load-tests.sh test/load/scripts/run-smoke-test.sh Procfile
```

- [ ] **Step 3: Fix brand and test-helper names**

- `src/common/guards/api-key.guard.ts` and
  `src/imodels/imodels-admin.controller.ts`: replace old copyright header
  “Open Cloud CAD” with `LubanCAD / 天工开物`.
- `scripts/setup-webhook-for-testing.sql`: replace `web-agent` with
  `webhook-agent`; keep SQL semantics.

- [ ] **Step 4: Update README references**

- Remove `run-load-tests.sh` / `run-smoke-test.sh` instructions.
- State that load tests use `test/load/k6.config.ts` and require a running API at
  `http://localhost:4000`.
- Replace `web-next` with `web`, and old `:3000` examples with `:4000`/`:5300`.

- [ ] **Step 5: Test**

```powershell
Set-Location 'D:\Github\imodelhub-services'
npm run test:unit
npm run lint
npm run build
```

Expected: all green. If Docker e2e is unavailable, record it as not run; do not
claim it passed.

- [ ] **Step 6: Commit**

```powershell
git add -A
git commit -m "chore(hub): 统一 APP_PORT/前端回调并删除损坏 load 入口"
```

---

### Task 4: imodelhub-services 文档收敛与生成物

**Files:**
- Delete: `docs/AUDIT-2026-10-12.md`
- Delete: `docs/superpowers/plans/*`, `docs/superpowers/specs/*`
- Create: `HISTORY.md`
- Modify: `README.md`, `CLAUDE.md`, `CHANGELOG.md`,
  `docs/auth.md`, `docs/database.md`, `docs/installing-and-running.md`
- Delete (ignored): `coverage/`, `logs/`, `server.log`

**Interfaces:** none.

- [ ] **Step 1: Delete historical docs**

```powershell
Set-Location 'D:\Github\imodelhub-services'
git rm docs/AUDIT-2026-10-12.md
Get-ChildItem docs/superpowers/plans -File | Remove-Item -Force
Get-ChildItem docs/superpowers/specs -File | Remove-Item -Force
```

Create `HISTORY.md`:
```markdown
# 历史索引（2026-10-29 整理）

- 2026-10-12 安全审计与 RBAC/并发/性能/工程计划已删除；
  从 Git 历史恢复：`git log --all -- docs/AUDIT-2026-10-12.md docs/superpowers/`。
- 当前开放缺陷以 `docs/BACKLOG.md` 为准。
- 最新测试数与端点状态以当前 `npm run test:unit` 和 README 为准。
```

- [ ] **Step 2: Reconcile status claims**

- `README.md`：删除 W1–W10 “Complete” 表和固定 265 endpoints/685 tests；
  改成“状态以 CHANGELOG/BACKLOG/当前测试输出为准”，并保留快速启动。
- `CLAUDE.md`：删除 257 endpoints 和 P0–P4 完成断言；修复指向缺失
  `docs/iModelHub-Implementation-Plan.md`、`MEMORY.md` 的链接。
- `CHANGELOG.md`：P4 不再写“进行中”；改为指向 HISTORY 的日期化记录。
- 用当前命令输出更新 README 的测试基线；不要硬编码未复跑的旧数字。

- [ ] **Step 3: Prune boilerplate docs**

- `docs/auth.md`、`docs/database.md`、`docs/installing-and-running.md`：
  删除 MongoDB/Mongoose 脚手架段落和旧 `:3000` URL；保留与当前
  Postgres/TypeORM/NestJS 端点相关的段落。
- 删除 `docs/superpowers` 空目录。

- [ ] **Step 4: Clean ignored generated files**

```powershell
$root = 'D:\Github\imodelhub-services'
foreach ($p in @("$root\coverage", "$root\logs", "$root\server.log")) {
  if (Test-Path $p) { Remove-Item -LiteralPath $p -Recurse -Force }
}
```

Expected: `node_modules`, `dist`, `.env`, `files` remain.

- [ ] **Step 5: Commit**

```powershell
git add -A
git commit -m "docs(hub): 收敛状态文档并删除历史审计"
```

---

### Task 5: 后端两仓最终门禁

**Files:**
- Modify: `D:\Github\luban-backend\HISTORY.md`,
  `D:\Github\imodelhub-services\HISTORY.md`（执行结果）

**Interfaces:** none.

- [ ] **Step 1: luban-backend gates**

```powershell
Set-Location 'D:\Github\luban-backend\modeling-server'
$env:CI = 'true'
corepack pnpm@10 exec vitest run
corepack pnpm@10 lint
corepack pnpm@10 build
Set-Location 'D:\Github\luban-backend\webhook-agent'
corepack pnpm@10 exec vitest run
corepack pnpm@10 lint
corepack pnpm@10 build
```

- [ ] **Step 2: imodelhub gates**

```powershell
Set-Location 'D:\Github\imodelhub-services'
npm run test:unit
npm run lint
npm run build
```

- [ ] **Step 3: Stale reference scan**

```powershell
Set-Location 'D:\Github\luban-backend'
rg -n "web-next|apps/web|Open Cloud CAD|Zokei|localhost:3000|localhost:5310" `
  README.md CLAUDE.md docs HISTORY.md modeling-server scripts
Set-Location 'D:\Github\imodelhub-services'
rg -n "web-next|apps/web|Open Cloud CAD|Zokei|localhost:3000|localhost:5310" `
  README.md CLAUDE.md docs HISTORY.md src test scripts env-example-relational .env.example
```

Expected: zero active hits except explicitly documented historical lines
(`HISTORY.md`) and CORS negative test `:5310`.

- [ ] **Step 4: Record and commit**

Append actual gate output/counts to each `HISTORY.md`, then:

```powershell
cd D:\Github\luban-backend
git add HISTORY.md
git commit -m "docs(backend): 记录 2026-10-29 清理门禁"
cd D:\Github\imodelhub-services
git add HISTORY.md
git commit -m "docs(hub): 记录 2026-10-29 清理门禁"
```

---

## Self-Review

- Spec coverage: backend config/port (T1), backend docs/build (T2), hub ports/scripts
  (T3), hub docs/build (T4), gates (T5).
- No placeholder: exact port values and replacement paths specified.
- No migration history deletion; no `.env` secret edits.
- Tests/gates named per repo; unavailable Docker e2e must be recorded, not claimed.
