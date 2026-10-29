# 文档/内核/引擎仓整理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把平台文档、imodel-native、DanQing 的旧路径/旧端口/旧状态文档收敛到当前口径，并回收可重建构建产物。

**Architecture:** platform-docs 先重写当前事实，再删除 2026-09-22 快照；imodel-native/DanQing 只删生成物和过期文档，不改源码；acis-solid-kernel 完全排除。最后做跨仓 stale 扫描和状态记录。

**Tech Stack:** Markdown、PowerShell、CMake 构建树（仅删除，不重编译）、Git。

**Spec:** `docs/superpowers/specs/2026-10-29-project-cleanup-design.md`

## Global Constraints

- 不改 acis-solid-kernel，包括 `.diag` 和 773 项工作区改动。
- 不改 imodel-native/DanQing 源码；只删生成物、过期文档、合并当前文档。
- 不重编译 native/DanQing；删除构建树后记录“下次构建前需重新配置”。
- 不 push、不建 Release；每仓独立本地 commit。
- 当前端口：web 5300/5301、hub 5400（容器 4000）、MS 5401、WA 5402。
- 当前前端路径：`luban-cad/apps/web`；旧名只允许出现在 HISTORY/迁移记录。

---

### Task 1: platform-docs 当前化

**Files:**
- Rewrite: `D:\Github\platform-docs\STATUS.md`
- Modify: `README.md`, `ROADMAP.md`, `VISION.md`, `AI-ARCHITECTURE.md`,
  `KERNEL-STRATEGY.md`, `CONSTRAINT-STRATEGY.md`, `ECOSYSTEM.md`, `AGENTS.md`
- Delete: `analysis/2026-09-22-*.md`（11 份）
- Create: `analysis/HISTORY.md`

**Interfaces:** none.

- [ ] **Step 1: Rewrite STATUS.md**

Replace the file with:

```markdown
# 能力现状矩阵（2026-10-29）

> 本文是平台当前能力口径；历史快照见 `analysis/HISTORY.md`。
> 状态：✅ 真实可用 / 🟠 部分实现 / ⚪ stub/mock / ❌ 禁用或未实现。

| 能力 | 状态 | 当前事实 |
|---|---|---|
| 平台基座 | ✅ | iTwin.js fork、Rush、imodel-native 替换链、modeling-server、webhook-agent、imodelhub |
| 新版前端 | ✅ | `luban-cad/apps/web`（原 web-next）；旧 `apps/web` 已退役 |
| 参数化特征 | ✅ | M1–M3 feature engine、草图求解、特征树/参数面板/圆角/抑制 |
| 协同数据链 | ✅ | 写租约、op 日志、语义 undo/redo、push 管线 |
| 多体 B6 | 🟠 | NEW-body/body boolean/选择/树删除/可见性已落地；M-A5.2 面/边选择与性能护栏待做 |
| imodelhub P2/P3 | 🟠 | W1 6/6；W2–W4 24 项待做 |
| Isomantle | 🟠 | C0 未复现（0/10），C4 opt-in 7/7；C1–C3 暂停 |
| AI L1/L2/L3 | ⚪ | 设计完成，ai-service 未实现 |
| 真形/绳墨 | ❌/⚪ | 长期路线；当前 ACIS + libslvs 支撑 |

## 端口

web dev 5300；web nginx 5301；imodelhub 宿主 5400（容器 4000）；
modeling-server 5401；webhook-agent 5402。

## 代码归属

- 前端：`luban-cad/apps/web`
- viewer：`luban-cad/packages/viewer`
- 共享契约：`luban-cad/packages/shared`
- 建模基座：`luban-cad/packages/editor`
- 后端源码：私有仓 `luban-backend`
- iModel 管理：`imodelhub-services`
- 内核：`itwinjs-core` + `imodel-native`
```

- [ ] **Step 2: Update root docs to current names/facts**

Apply these replacements in active docs only:

- `open-cloud-cad/apps/web` → `luban-cad/apps/web`
- `open-cloud-cad/apps/backend` / `apps/web-agent` → “已退役历史应用；当前后端见 luban-backend”
- `open-cloud-cad` as current project name → `天工开物` or remove
- `Zokei`/`zo*` as live engine → remove; retain only historical naming note if present
- `web-next` → `web`
- `:4001` → `:5401`; `:4002` → `:5402`; hub host `:4000` → `:5400`
  (container-internal `:4000` remains allowed)
- `64 active tools` / `27 tools` claims → “以当前代码注册表为准，不在文档硬编码”

Files: `README.md`, `ROADMAP.md`, `VISION.md`, `AI-ARCHITECTURE.md`,
`KERNEL-STRATEGY.md`, `CONSTRAINT-STRATEGY.md`, `ECOSYSTEM.md`, `AGENTS.md`.
`README.md` already states old names are historical; keep that sentence.

- [ ] **Step 3: Delete dated analysis snapshots**

Before deletion, ensure the current facts above are in STATUS. Then:

```powershell
Set-Location 'D:\Github\platform-docs'
Get-ChildItem analysis -Filter '2026-09-22-*.md' -File | Remove-Item -Force
```

Create `analysis/HISTORY.md`:

```markdown
# 分析快照历史（2026-10-29 整理）

2026-09-22 的 11 份分析快照已删除，正文从 Git 历史恢复：

```bash
git log --all -- analysis/2026-09-22-*.md
```

主题：acis-solid-kernel、clients-access-control、clients-auth、clients-imodels、
clients-itwins、freecad-gcs、imodel-native、imodelhub-services、
itwinjs-core-open-cloud-cad、object-storage、platform-backend。
当前能力以 `STATUS.md` 为准；内核/求解器边界以 `KERNEL-STRATEGY.md` 为准。
```

- [ ] **Step 4: Stale scan**

```powershell
rg -n "open-cloud-cad|apps/web-next|web-next|viewer-next|Zokei|localhost:4001|localhost:4002|localhost:3000" \
  README.md STATUS.md ROADMAP.md VISION.md AI-ARCHITECTURE.md KERNEL-STRATEGY.md \
  CONSTRAINT-STRATEGY.md ECOSYSTEM.md AGENTS.md analysis
```

Expected: zero active hits; history notes and `analysis/HISTORY.md` allowed.

- [ ] **Step 5: Commit**

```powershell
git add -A
git commit -m "docs(platform): 收敛 2026-10-29 当前能力口径"
```

---

### Task 2: imodel-native 生成物与历史文档

**Files:**
- Delete (ignored): `out/cmake/`, `build/__pycache__/`, pytest caches
- Delete: `docs/superpowers/plans/*`, `docs/superpowers/specs/*`（20 份历史）
- Create: `docs/HISTORY.md`

**Interfaces:** none.

- [ ] **Step 1: Reclaim CMake build tree**

```powershell
Set-Location 'D:\Github\imodel-native'
foreach ($p in @('out\cmake','build\__pycache__','.pytest_cache')) {
  if (Test-Path $p) {
    $size = (Get-ChildItem $p -Recurse -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
    "DELETING $p ($([math]::Round($size/1GB,2)) GB)"
    Remove-Item -LiteralPath $p -Recurse -Force
  }
}
```

Keep `out/npm-pkg`, `out/npm-pkg-4.11.35`, `out/ida`, `out/ts-api-staging`,
`docs/reference/ida`, `docs/reference/compare`.

- [ ] **Step 2: Delete historical plans/specs**

```powershell
Get-ChildItem docs/superpowers/plans -File | Remove-Item -Force
Get-ChildItem docs/superpowers/specs -File | Remove-Item -Force
```

Create `docs/HISTORY.md`:

```markdown
# 历史索引（2026-10-29 整理）

- 2026-09/10 的 native 缺陷、模块治理、npm 发布计划已删除；
  从 Git 历史恢复：`git log --all -- docs/superpowers/`。
- 当前原生构建与测试路径见 `README.md` 和 `docs/reference/`。
- 2026-10-29 已清理 `out/cmake`；下次构建前需重新 CMake 配置。
```

- [ ] **Step 3: Verify no source changes**

```powershell
git status --short
```

Expected: only `docs/HISTORY.md` and deleted docs tracked changes; no `src/`,
`include/`, `out/npm-pkg`, or `third_party` changes.

- [ ] **Step 4: Commit**

```powershell
git add -A
git commit -m "docs(native): 清理历史计划并记录构建树回收"
```

---

### Task 3: DanQing 构建树与 DTA 文档收敛

**Files:**
- Delete (ignored): `build/`, `output-shaders-test/`, `saved-views-test/`,
  `macro-*.macro`
- Delete old DTA docs:
  `docs/DisplayTestApp-view页面差距矩阵.md`,
  `docs/DTA功能对照与专业化分析-2026-09-30.md`,
  `docs/DTA一致性审计台账-2026-10-07.md`,
  `docs/DTA功能对照统计-2026-10-07.md`
- Keep: `docs/DTA与DanQing-DebugInfo逐视图对比-2026-10-24.md`
- Create: `docs/HISTORY.md`

**Interfaces:** none.

- [ ] **Step 1: Reclaim build/test outputs**

```powershell
Set-Location 'D:\Github\DanQing'
foreach ($p in @('build','output-shaders-test','saved-views-test')) {
  if (Test-Path $p) {
    $size = (Get-ChildItem $p -Recurse -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
    "DELETING $p ($([math]::Round($size/1GB,2)) GB)"
    Remove-Item -LiteralPath $p -Recurse -Force
  }
}
Get-ChildItem -File -Filter 'macro-*.macro' | Remove-Item -Force
```

Do not delete `third_party/`, `.claude/`, `src/`, `include/`, or source assets.

- [ ] **Step 2: Consolidate DTA docs**

Delete the four older DTA matrix/status docs listed in Files. Keep the
2026-10-24 audit as the single current DTA comparison.

Create `docs/HISTORY.md`:

```markdown
# 历史索引（2026-10-29 整理）

- DTA 旧矩阵/统计（2026-09-10、2026-09-30、2026-10-07）已删除；
  从 Git 历史恢复：`git log --all -- docs/*DTA* docs/DisplayTestApp-*`。
- 当前 DTA 对照以 `DTA与DanQing-DebugInfo逐视图对比-2026-10-24.md` 为准。
- 2026-10-29 已清理 `build/`、测试输出和临时 macro；
  下次构建前按 README 重新配置。
```

- [ ] **Step 3: Verify**

```powershell
git status --short
```

Expected: only deleted docs + `docs/HISTORY.md`; ignored build outputs absent.

- [ ] **Step 4: Commit**

```powershell
git add -A
git commit -m "docs(danqing): 收敛 DTA 文档并记录构建树回收"
```

---

### Task 4: 跨仓最终扫描与记录

**Files:**
- Create: `D:\Github\platform-docs\CLEANUP-2026-10-29.md`
- Possibly fix stale references found in Task 1-3.

**Interfaces:** none.

- [ ] **Step 1: Scan six repos**

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
  rg -n "apps/web-next|web-next|viewer-next|viewer-core|web-viewer|open-cloud-cad|Zokei" `
    $repo --glob '!**/node_modules/**' --glob '!**/.git/**' --glob '!**/third_party/**' `
    --glob '!**/HISTORY.md' --glob '!**/MIGRATION-2026-10-29.md' 2>$null |
    Select-Object -First 20
}
```

Expected: zero active hits. Allowed exceptions:
- `luban-next-*` browser storage keys
- branch `web-next-m0`
- CORS negative test `:5310`
- HISTORY/migration history lines

- [ ] **Step 2: Record final status**

Create `platform-docs/CLEANUP-2026-10-29.md`:

```markdown
# 七仓整理结果（2026-10-29）

| 仓库 | 结果 | 验证 |
|---|---|---|
| tiangong-kaiwu | 去 next + 死包/旧应用/历史文档清理 | 见主仓 MIGRATION 记录 |
| luban-backend | 端口/editor 路径/文档/构建产物 | 两服务 vitest/lint/build |
| imodelhub-services | APP_PORT/前端回调/损坏脚本/文档 | unit/lint/build |
| platform-docs | STATUS 当前化 + 旧分析删除 | stale 扫描 |
| imodel-native | out/cmake + 历史计划 | git status clean |
| DanQing | build + DTA 文档收敛 | git status clean |
| acis-solid-kernel | **未修改**（研究脏区保留） | 原状 |

- 未 push、未建 Release。
- 例外：分支 `web-next-m0`、存储键 `luban-next-*`、acis 工作区。
```

- [ ] **Step 3: Commit**

```powershell
Set-Location 'D:\Github\platform-docs'
git add CLEANUP-2026-10-29.md
git commit -m "docs(platform): 记录 2026-10-29 七仓整理结果"
```

---

## Self-Review

- Spec coverage: platform docs (T1), imodel-native (T2), DanQing (T3), cross-repo
  scan/result (T4).
- acis is explicitly untouched; build outputs limited to listed trees.
- No source edits in native/DanQing; no rebuild claimed.
- Ports and names match the spec; history indexes preserve recovery paths.
