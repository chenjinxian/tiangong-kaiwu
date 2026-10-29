# 原生内核/引擎仓整理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 清理 imodel-native 与 DanQing 的生成物和过期文档，完成跨仓最终扫描，并把结果记录到项目总目录。

**Architecture:** platform-docs 已按用户裁决整仓删除，主仓 `docs/` 成为唯一文档根；本计划只处理 imodel-native/DanQing 的生成物与过期文档，不改源码；acis-solid-kernel 完全排除。最后在主仓做跨仓 stale 扫描和状态记录。

**Tech Stack:** Markdown、PowerShell、CMake 构建树（仅删除，不重编译）、Git。

**Spec:** `docs/superpowers/specs/2026-10-29-project-cleanup-design.md`

## Global Constraints

- platform-docs 已整仓删除（不迁移内容）；不得再引用该目录，当前文档根为 `D:\Github\tiangong-kaiwu\docs`。
- 不改 acis-solid-kernel，包括 `.diag` 和 773 项工作区改动。
- 不改 imodel-native/DanQing 源码；只删生成物、过期文档、合并当前文档。
- 不重编译 native/DanQing；删除构建树后记录“下次构建前需重新配置”。
- 不 push、不建 Release；每仓独立本地 commit。
- 当前端口：web 5300/5301、hub 5400（容器 4000）、MS 5401、WA 5402。
- 当前前端路径：`luban-cad/apps/web`；旧名只允许出现在 HISTORY/迁移记录。

---

### Task 1: imodel-native 生成物与历史文档

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

### Task 2: DanQing 构建树与 DTA 文档收敛

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

### Task 3: 跨仓最终扫描与记录

**Files:**
- Modify: `D:\Github\tiangong-kaiwu\docs\MIGRATION-2026-10-29.md`
- Possibly fix stale references found in Tasks 1-2.

**Interfaces:** none.

- [ ] **Step 1: Scan included repos**

```powershell
$repos = @(
 'D:\Github\tiangong-kaiwu',
 'D:\Github\luban-backend',
 'D:\Github\imodelhub-services',
 'D:\Github\imodel-native',
 'D:\Github\DanQing'
)
foreach ($repo in $repos) {
  "=== $repo ==="
  rg -n "apps/web-next|web-next|viewer-next|viewer-core|web-viewer|open-cloud-cad|Zokei|platform-docs" `
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

Append to `D:\Github\tiangong-kaiwu\docs\MIGRATION-2026-10-29.md`:

```markdown
## 最终整理结果

| 仓库 | 结果 | 验证 |
|---|---|---|
| tiangong-kaiwu | 去 next + 死包/旧应用/历史文档清理 | 见本文件主仓记录 |
| luban-backend | 端口/editor 路径/文档/构建产物 | 两服务 vitest/lint/build |
| imodelhub-services | APP_PORT/前端回调/坏脚本/文档 | unit/lint/build |
| imodel-native | out/cmake + 历史计划 | git status clean |
| DanQing | build + DTA 文档收敛 | git status clean |
| platform-docs | 整仓删除，不迁移内容 | 本地目录不存在 |
| acis-solid-kernel | **未修改**（研究脏区保留） | 原状 |

- 未 push、未建 Release。
- 例外：分支 `web-next-m0`、存储键 `luban-next-*`、acis 工作区。
```

- [ ] **Step 3: Commit**

```powershell
Set-Location 'D:\Github\tiangong-kaiwu'
git add docs/MIGRATION-2026-10-29.md
git commit -m "docs: 记录 2026-10-29 项目总目录整理结果"
```

---

## Self-Review

- Spec coverage: platform-docs deletion already completed; imodel-native (T1),
  DanQing (T2), cross-repo scan/result (T3).
- acis is explicitly untouched; build outputs limited to listed trees.
- No source edits in native/DanQing; no rebuild claimed.
- Ports and names match the spec; history indexes preserve recovery paths.
