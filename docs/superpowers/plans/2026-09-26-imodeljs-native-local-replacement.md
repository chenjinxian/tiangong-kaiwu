# 本地 imodeljs.node 替换 + 上游同步联动 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 imodel-native（`dev/source-build`）本地编译的 `imodeljs.node` + 伴生 DLL + Assets 覆盖 node_modules 中 `@bentley/imodeljs-native` 的官方二进制，并建立「itwinjs-core 上游同步 → imodel-native 跟进 → 重编译 → 替换」的联动流程。

**Architecture:** copy-in overlay——npm 包保留 TS wrapper/typings/package.json（lockfile 与上游逐字节一致不动），只覆盖包内 `imodeljs-win32-x64/` 平台目录内容并写 `devbuild.json`（官方 `NativeLibrary.isDevBuild` 通道，启动打印 "using dev build from …" 作为生效信号）。唯一新代码是一个 PowerShell 脚本，内含版本硬门槛（`git merge-base --is-ancestor v<版本> HEAD`）、现场扫描、覆盖、子进程验证。

**Tech Stack:** PowerShell 5.1 兼容语法、git、CMake presets（`win-x64-release`/`win-x64-debug`，Ninja）、Rush + pnpm、Node（N-API，无 ABI 矩阵）。

**Spec:** `docs/superpowers/specs/2026-09-26-imodeljs-native-local-replacement-design.md`

## Global Constraints

- **禁止改动 `itwinjs-core/` 树内任何文件**（含 `core/backend/package.json` 继续钉 `@bentley/imodeljs-native@5.14.35`）——保持 `common/config/rush/pnpm-lock.yaml` 与上游逐字节一致。
- imodel-native 仓路径默认 `D:\Github\imodel-native`，分支 `dev/source-build`；该仓内只跑用户已有的 `sync-from-upstream.ps1` 与 CMake，不新增脚本。
- 替换默认 `release` 配置；产物目录 `out/cmake/win-x64-release/Delivery/`。
- 硬门槛不可绕过（`-SkipGate` 仅供 fixture 测试）。
- pnpm 用 `corepack pnpm@10`；非交互安装加 `CI=true`；rush install/update 类命令可加 `--bypass-policy`（build 不能加）。
- 包布局事实（已探明）：npm 主包 `"main": "imodeljs-native.js"` 在包根扁平；平台目录 `imodeljs-win32-x64/` 由 postinstall 拷到包根；`devbuild.json` 放包根（`require.resolve("./devbuild.json")` 相对包根 JS）。
- 平台子包布局参照样本：`D:\Github\imodel-native\out\npm-pkg\package\`（imodeljs.node + Assets/ + iTwin*.dll + CrashpadHandler 等，均在平台包根）。

---

### Task 1: 替换脚本 `scripts/replace-imodeljs-native.ps1`（含 fixture 测试 + CLAUDE.md 命令）

**Files:**
- Create: `scripts/replace-imodeljs-native.ps1`
- Modify: `CLAUDE.md`（「常用命令」节末尾追加原生库替换块）

**Interfaces:**
- Consumes: `itwinjs-core/core/backend/package.json` 的 `dependencies['@bentley/imodeljs-native']`（所需版本）；imodel-native 仓 git 历史与 `out/cmake/win-x64-<config>/Delivery/` 产物。
- Produces: 脚本 `replace-imodeljs-native.ps1`，参数：`-NativeRepo <path>`（默认 `D:\Github\imodel-native`）、`-Config release|debug`（默认 `release`）、`-ScanRoots <string[]>`（追加扫描根）、`-SkipGate`（仅测试用）。成功退出码 0 并输出「现场 → 已替换/已验证」汇总；任何检查不过即 `throw`（非零退出）。后续 Task 5/6 依赖此脚本名与参数不变。

- [ ] **Step 1: 写脚本全文**

创建 `scripts/replace-imodeljs-native.ps1`，内容如下（PowerShell 5.1 兼容，无三元/空合并运算符）：

```powershell
#!/usr/bin/env powershell
# replace-imodeljs-native.ps1
# 用本地编译的 imodeljs.node(+伴生 DLL+Assets) 覆盖 node_modules 中
# @bentley/imodeljs-native 包的官方平台二进制，并写 devbuild.json 标记。
# 设计: docs/superpowers/specs/2026-09-26-imodeljs-native-local-replacement-design.md
#
# 用法: powershell -File scripts\replace-imodeljs-native.ps1 [-Config debug] [-NativeRepo D:\Github\imodel-native]
# 注意: 任何 rush update / pnpm install 重装 node_modules 后需重跑本脚本。
[CmdletBinding()]
param(
  [string]$NativeRepo = 'D:\Github\imodel-native',
  [ValidateSet('release', 'debug')]
  [string]$Config = 'release',
  [string[]]$ScanRoots = @(),
  [string]$PlatformDir = 'imodeljs-win32-x64',
  [switch]$SkipGate
)
$ErrorActionPreference = 'Stop'

$RepoRoot  = Split-Path -Parent $PSScriptRoot
$PkgJson   = Join-Path $RepoRoot 'itwinjs-core\core\backend\package.json'
$PkgName   = '@bentley/imodeljs-native'

# --- 1. 读版本（唯一事实源） ---
$Required = (Get-Content $PkgJson -Raw | ConvertFrom-Json).dependencies.$PkgName
if (-not $Required) { throw "无法从 $PkgJson 解析 $PkgName 版本" }
Write-Host "==> itwinjs-core 需要 ${PkgName}@$Required"

# --- 2. 硬门槛：imodel-native HEAD 必须包含 v<所需版本> ---
if (-not (Test-Path (Join-Path $NativeRepo '.git'))) {
  throw "imodel-native 仓不存在: $NativeRepo（用 -NativeRepo 指定）"
}
if (-not $SkipGate) {
  $tag = "v$Required"
  $hasUpstream = (git -C $NativeRepo remote) -match '^upstream$'
  if ($hasUpstream) {
    git -C $NativeRepo fetch upstream tag $tag --no-tags | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Warning "fetch $tag 失败（离线?），改用本地已有 tag 判断" }
  }
  git -C $NativeRepo rev-parse -q --verify "refs/tags/$tag" | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "imodel-native 缺少 tag $tag。先在其仓内跑 .\sync-from-upstream.ps1（fetch upstream main 会带上 tag），解决冲突后重跑本脚本。"
  }
  git -C $NativeRepo merge-base --is-ancestor $tag HEAD
  if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "!!! 硬门槛不通过: 当前 HEAD 未包含 $tag（基线落后于 itwinjs-core 所需版本）。" -ForegroundColor Red
    Write-Host "    1) cd $NativeRepo ; .\sync-from-upstream.ps1   # 合并 upstream/main 进 dev/source-build，冲突手工解"
    Write-Host "    2) cmake --preset win-x64-$Config ; cmake --build --preset win-x64-$Config"
    Write-Host "    3) 重跑本脚本"
    throw "版本基线落后，中止替换"
  }
  Write-Host "==> 硬门槛通过: HEAD 已包含 $tag"
}

# --- 3. 产物校验 ---
$Delivery = Join-Path $NativeRepo "out\cmake\win-x64-$Config\Delivery"
if (-not (Test-Path $Delivery)) { throw "产物目录不存在: $Delivery — 先 cmake --preset win-x64-$Config ; cmake --build --preset win-x64-$Config" }
foreach ($f in @('imodeljs.node', 'SPAAcisDs.dll')) {
  if (-not (Test-Path (Join-Path $Delivery $f))) { throw "产物缺失: $Delivery\$f — 重新构建 win-x64-$Config" }
}
Write-Host "==> 产物就绪: $Delivery"

# --- 4. 定位安装现场（不假设只有一处；幂等） ---
$patterns = @(
  "$RepoRoot\itwinjs-core\common\temp\node_modules\.pnpm\@bentley+imodeljs-native@*\node_modules\@bentley\imodeljs-native",
  "$RepoRoot\modeling-server\node_modules\.pnpm\@bentley+imodeljs-native@*\node_modules\@bentley\imodeljs-native",
  "$RepoRoot\modeling-server\node_modules\@bentley\imodeljs-native",
  "$RepoRoot\webhook-agent\node_modules\.pnpm\@bentley+imodeljs-native@*\node_modules\@bentley\imodeljs-native",
  "$RepoRoot\webhook-agent\node_modules\@bentley\imodeljs-native",
  "$RepoRoot\luban-cad\node_modules\.pnpm\@bentley+imodeljs-native@*\node_modules\@bentley\imodeljs-native",
  "$RepoRoot\luban-cad\node_modules\@bentley\imodeljs-native",
  "$RepoRoot\luban-cad\apps\web\node_modules\.pnpm\@bentley+imodeljs-native@*\node_modules\@bentley\imodeljs-native",
  "$RepoRoot\luban-cad\apps\web\node_modules\@bentley\imodeljs-native"
)
foreach ($r in $ScanRoots) {
  $patterns += "$r\node_modules\.pnpm\@bentley+imodeljs-native@*\node_modules\@bentley\imodeljs-native"
  $patterns += "$r\node_modules\@bentley\imodeljs-native"
}
$sites = @()
foreach ($p in $patterns) {
  $found = Get-Item -Path $p -ErrorAction SilentlyContinue
  foreach ($f in $found) { $sites += (Resolve-Path -LiteralPath $f.FullName).Path }
}
$sites = $sites | Select-Object -Unique
if ($sites.Count -eq 0) {
  throw "未找到任何已安装的 $PkgName。先跑 itwinjs-core 的 rush update（node common/scripts/install-run-rush.js update）与应用侧 pnpm install。"
}
Write-Host "==> 发现 $($sites.Count) 个安装现场"

# --- 5+6. 逐现场：版本匹配 + 覆盖 ---
$okSites = @()
foreach ($site in $sites) {
  $siteVer = (Get-Content (Join-Path $site 'package.json') -Raw | ConvertFrom-Json).version
  if ($siteVer -ne $Required) {
    throw "现场 $site 版本 $siteVer != 所需 $Required — 先 rush update / pnpm install 让 node_modules 与 itwinjs-core 对齐"
  }
  $plat = Join-Path $site $PlatformDir
  if (-not (Test-Path $plat)) { New-Item -ItemType Directory -Path $plat | Out-Null }

  # 覆盖 Delivery 全部内容（排除测试目录 Gtest/UnitTests）；不删除平台目录中官方多余文件（Notices 等，无害）
  $excludes = @('Gtest', 'UnitTests')
  Get-ChildItem -LiteralPath $Delivery | Where-Object { $excludes -notcontains $_.Name } | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $plat -Recurse -Force
  }
  # devbuild.json 在包根（require.resolve('./devbuild.json') 相对包根入口 imodeljs-native.js）
  Set-Content -Path (Join-Path $site 'devbuild.json') -Value '{"dev-build": true}' -Encoding ascii -NoNewline
  Write-Host "    已覆盖: $site"
  $okSites += $site
}

# --- 7. 验证：每现场起 node 子进程加载 NativeLibrary ---
$probe = 'const p=process.argv[1];' +
         'const e=require(p);' +
         'if(!e.NativeLibrary) { console.error("FAIL: 入口未导出 NativeLibrary"); process.exit(1); }' +
         'if(!e.NativeLibrary.isDevBuild) { console.error("FAIL: isDevBuild=false（devbuild.json 未生效）"); process.exit(1); }' +
         'const lib=e.NativeLibrary.load();' +
         'if(!lib) { console.error("FAIL: load() 未返回"); process.exit(1); }' +
         'console.log("OK: dev build loaded");'
$failed = @()
foreach ($site in $okSites) {
  Write-Host "==> 验证: $site"
  node -e $probe $site
  if ($LASTEXITCODE -ne 0) { $failed += $site }
}
if ($failed.Count -gt 0) { throw "验证失败的现场: $($failed -join '; ')" }

Write-Host ""
Write-Host "==> 汇总（$($okSites.Count) 现场）:" -ForegroundColor Green
foreach ($s in $okSites) { Write-Host "    [已替换/已验证] $s" }
Write-Host "==> 完成。后端进程启动出现 'using dev build from ...' 即生效；重装 node_modules 后重跑本脚本。"
```

- [ ] **Step 2: 用真实状态测硬门槛（当前基线 v5.14.32 < 5.14.35，必须拦截）**

```powershell
cd D:\Github\tiangong-kaiwu
powershell -File scripts\replace-imodeljs-native.ps1
```

预期：**失败退出**，红字「硬门槛不通过: 当前 HEAD 未包含 v5.14.35」+ 三步指令。这验证了读版本与门槛逻辑（此刻不需要 node_modules 存在——门槛在扫描之前）。

- [ ] **Step 3: 建 fixture 现场并端到端测试（-SkipGate）**

fixture 模拟 pnpm store 里的包布局，`imodeljs-native.js` 复刻官方加载语义（平台目录 + devbuild.json 均相对包根），验证扫描/版本匹配/覆盖/验证全链路，且 `load()` 用的是**真实 Delivery 二进制**（同时证明了你们产物可独立加载）：

```powershell
$fx = "$env:TEMP\replace-native-fx\node_modules\.pnpm\@bentley+imodeljs-native@5.14.35\node_modules\@bentley\imodeljs-native"
New-Item -ItemType Directory -Force -Path $fx | Out-Null
Set-Content "$fx\package.json" -Value '{"name":"@bentley/imodeljs-native","version":"5.14.35","main":"imodeljs-native.js"}'
Set-Content "$fx\imodeljs-native.js" -Value @'
const path = require("path");
module.exports = {
  NativeLibrary: class {
    static get isDevBuild() { try { require(path.join(__dirname, "devbuild.json")); return true; } catch { return false; } }
    static load() { return require(path.join(__dirname, "imodeljs-win32-x64", "imodeljs.node")); }
  }
};
'@
powershell -File scripts\replace-imodeljs-native.ps1 -SkipGate -ScanRoots "$env:TEMP\replace-native-fx"
```

预期：发现 1 现场 → 已覆盖 → 「OK: dev build loaded」→ 汇总表列出 fixture 路径。若 `load()` 失败，多半是伴生 DLL 缺失——检查 Delivery 覆盖集是否完整，修正后重跑。

- [ ] **Step 4: 负路径测试——现场版本不匹配被拦截**

```powershell
Set-Content "$fx\package.json" -Value '{"name":"@bentley/imodeljs-native","version":"5.14.33","main":"imodeljs-native.js"}'
powershell -File scripts\replace-imodeljs-native.ps1 -SkipGate -ScanRoots "$env:TEMP\replace-native-fx"
```

预期：**失败退出**，「版本 5.14.33 != 所需 5.14.35」。测完把 fixture 版本改回 5.14.35 并清理：`Remove-Item -Recurse -Force "$env:TEMP\replace-native-fx"`。

- [ ] **Step 5: CLAUDE.md 补命令块**

在 `CLAUDE.md` 的「### modeling-server / webhook-agent（独立 pnpm 包）」块之后、「### 单测试 / 单 e2e」之前插入：

```markdown
### 原生库替换（本地 imodeljs.node）

```bash
powershell -File scripts/replace-imodeljs-native.ps1            # release 为默认；-Config debug 切换
```

- 用 imodel-native（`D:\Github\imodel-native`，分支 `dev/source-build`）的 `out/cmake/win-x64-<config>/Delivery/` 覆盖 node_modules 中 `@bentley/imodeljs-native` 的平台二进制 + 写 `devbuild.json`；TS wrapper/typings 仍来自 npm（`api_package/ts` 零改动）。
- **硬门槛**：imodel-native HEAD 必须包含 itwinjs-core 所需版本 tag（`git merge-base --is-ancestor v<版本> HEAD`）；不满足先跑该仓 `sync-from-upstream.ps1` + CMake 重编译。
- **任何 `rush update` / `pnpm install` 重装后必须重跑**；后端启动无 "using dev build from …" banner 即已回退官方二进制。
- itwinjs-core 上游同步若提升了原生库版本：imodel-native 跟进同步 → 重编译 → 重跑本脚本（`scripts/sync-from-upstream.sh` 尾部会自动检测并提示）。
```

- [ ] **Step 6: 提交**

```bash
git add scripts/replace-imodeljs-native.ps1 CLAUDE.md
git commit -m "feat: add replace-imodeljs-native.ps1 — overlay local imodeljs.node onto npm package sites"
```

---

### Task 2: `scripts/sync-from-upstream.sh` 尾步检测 + UPSTREAM_SYNC.md 联动文档

**Files:**
- Modify: `scripts/sync-from-upstream.sh`
- Modify: `docs/UPSTREAM_SYNC.md`（「一键同步」节后插入联动小节）

**Interfaces:**
- Consumes: Task 1 的脚本名 `scripts/replace-imodeljs-native.ps1`（仅作为提示文本引用）。
- Produces: sync 脚本尾部在 subtree pull 成功后自动比对原生库版本并打印联动指令；`docs/UPSTREAM_SYNC.md` 新增「imodel-native 联动」小节（Task 3–6 依赖其流程描述）。

- [ ] **Step 1: 改 `scripts/sync-from-upstream.sh`**

在 `PREFIX=itwinjs-core` 行后加一行捕获同步前版本：

```bash
NATIVE_PKG='@bentley/imodeljs-native'
native_ver() { node -p "require('./itwinjs-core/core/backend/package.json').dependencies['@bentley/imodeljs-native']"; }
NATIVE_BEFORE=$(native_ver)
```

把 `if GIT_MERGE_AUTOEDIT=no git subtree pull ...; then` 成功分支（`echo "==> Sync clean..."` 两行之后）替换为：

```bash
  echo "==> Sync clean. Review with: git log --oneline -- $PREFIX | tail -5"
  echo "    Record the upstream sha in docs/UPSTREAM_SYNC.md"
  NATIVE_AFTER=$(native_ver)
  if [ "$NATIVE_BEFORE" != "$NATIVE_AFTER" ]; then
    echo ""
    echo "!!! $NATIVE_PKG version changed: $NATIVE_BEFORE -> $NATIVE_AFTER"
    echo "    imodel-native must catch up before the local binary can replace npm's:"
    echo "      1) cd D:/Github/imodel-native && ./sync-from-upstream.ps1   # merge upstream/main into dev/source-build"
    echo "      2) cmake --preset win-x64-release && cmake --build --preset win-x64-release"
    echo "      3) rush update + rush build, then: powershell -File scripts/replace-imodeljs-native.ps1"
    echo "    (scripts/replace-imodeljs-native.ps1 enforces the version gate)"
  else
    echo "==> $NATIVE_PKG stays at $NATIVE_AFTER — no imodel-native follow-up needed."
  fi
```

- [ ] **Step 2: 语法与实跑验证**

```bash
cd /d/Github/tiangong-kaiwu && bash -n scripts/sync-from-upstream.sh && bash scripts/sync-from-upstream.sh
```

预期：语法通过；脚本 fetch upstream 后 subtree pull「Already up to date / Sync clean」，尾部打印 `@bentley/imodeljs-native stays at 5.14.35 — no imodel-native follow-up needed.`（若上游恰好有新提交，则正常走完 subtree 合并提交并按版本是否变化打印对应提示——同样是正确行为）。

- [ ] **Step 3: UPSTREAM_SYNC.md 补联动小节**

在「## 一键同步」代码块之后、「## 手动流程」之前插入：

```markdown
## imodel-native 联动（本地 imodeljs.node 替换）

`scripts/sync-from-upstream.sh` 尾部会自动比对 `core/backend/package.json` 中
`@bentley/imodeljs-native` 版本；变化时须按序完成（`scripts/replace-imodeljs-native.ps1`
的硬门槛会强制校验第 1 步）：

1. imodel-native 仓（`D:\Github\imodel-native`，分支 `dev/source-build`）跑 `.\sync-from-upstream.ps1`（冲突手工解）
2. `cmake --preset win-x64-release && cmake --build --preset win-x64-release`（按需加 debug）
3. 本仓 `rush update` → 按需 `rush build` → `powershell -File scripts/replace-imodeljs-native.ps1`

任何 `rush update` / `pnpm install` 重装 node_modules 后，替换会被还原，需重跑替换脚本；
后端启动无 "using dev build from …" banner 即已回退官方二进制。详见
`docs/superpowers/specs/2026-09-26-imodeljs-native-local-replacement-design.md`。
```

- [ ] **Step 4: 提交**

```bash
git add scripts/sync-from-upstream.sh docs/UPSTREAM_SYNC.md
git commit -m "feat: detect imodeljs-native version drift in upstream sync + document linkage workflow"
```

---

### Task 3: imodel-native 合并至 ≥ v5.14.35 并重编译（imodel-native 仓内操作）

**Files:**
- Modify（imodel-native 仓，非本仓）: 分支 `dev/source-build` 历史（merge commit）、`out/cmake/win-x64-release/**` 与 `out/cmake/win-x64-debug/**` 产物

**Interfaces:**
- Consumes: 用户现有 `sync-from-upstream.ps1`（upstream/main → main → dev/source-build）；CMake presets `win-x64-release` / `win-x64-debug`。
- Produces: `dev/source-build` HEAD 包含 `v5.14.35`（Task 5 硬门槛的前提）；`out/cmake/win-x64-release/Delivery/imodeljs.node` 等产物（Task 1 Step 3 已部分消费其旧版本，Task 5 消费新版本）。

- [ ] **Step 1: 同步上游（用户参与解冲突）**

```powershell
cd D:\Github\imodel-native
.\sync-from-upstream.ps1
```

预期：merge upstream/main 进 `dev/source-build`。若冲突（大概率在 BRepCore/你们改动密集区）：手工解决 → `git add -A; git commit` → 重跑该脚本完成推送。冲突解决属人工裁决，脚本边界外。

- [ ] **Step 2: 硬门槛复核**

```powershell
git merge-base --is-ancestor v5.14.35 HEAD; if ($?) { "gate OK" } else { "gate FAIL — 上游尚未发 v5.14.35 tag 或合并未完成" }
```

预期：`gate OK`。若上游 master 还没打 v5.14.35 tag（npm 包先于 tag 发布的情况），改用 `git log upstream/main -1 --format=%h` 确认本地已含 npm 5.14.35 对应提交，并向用户确认对应关系后再继续（此情况需人工判断，勿自行放行）。

- [ ] **Step 3: 重编译 release（默认集成配置）**

```powershell
cmake --preset win-x64-release
cmake --build --preset win-x64-release
```

预期：`out/cmake/win-x64-release/Delivery/imodeljs.node` 与 `SPAAcisDs.dll`、`iTwin*.dll`、`Assets/` 更新到新时间戳。原生全量编译耗时长属正常。

- [ ] **Step 4: （可选，按需）重编译 debug**

```powershell
cmake --preset win-x64-debug
cmake --build --preset win-x64-debug
```

- [ ] **Step 5: 冒烟自检（复用仓内已有手段，不新造）**

最低要求：用 Task 1 Step 3 的 fixture 现场指向新 Delivery 重跑一次 `-SkipGate` 替换，确认 `OK: dev build loaded`（真实 N-API 加载新二进制）。在此之上，用户可再加跑其惯常的 viz/BRep 冒烟（如 `out/cmake/run-t11-tests.bat` 一类既有脚本）。通过后告知用户 Task 3 完成。本仓无提交。

---

### Task 4: itwinjs-core 安装依赖并构建（真实现场出现）

**Files:**
- Modify: `itwinjs-core/common/temp/**`、各包 `lib/`（均非 git 跟踪内容；**不改任何 git 跟踪文件**）

**Interfaces:**
- Consumes: Rush 工具链（`node common/scripts/install-run-rush.js`）。
- Produces: `@bentley/imodeljs-native@5.14.35` 实体安装于 Rush pnpm store（Task 5 的扫描目标）；`core/*`、`editor/*` 的 `lib/` 产物（modeling-server 运行前提）。

- [ ] **Step 1: rush update（装依赖，postinstall 会落地官方平台二进制）**

```bash
cd /d/Github/tiangong-kaiwu/itwinjs-core
CI=true node common/scripts/install-run-rush.js update --bypass-policy
```

预期：安装完成无错。已知坑（CLAUDE.md）：`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` 需 `CI=true`（已带）；仓址搬迁过则先修 `common/temp/last-install.flag` 或 `--purge`。

- [ ] **Step 2: 验证 store 里出现了包与平台目录**

```powershell
Get-ChildItem "D:\Github\tiangong-kaiwu\itwinjs-core\common\temp\node_modules\.pnpm\@bentley+imodeljs-native@*" | Select-Object -First 3
```

预期：存在 `@bentley+imodeljs-native@5.14.35` 目录。**记录实际路径布局**（平台目录 `imodeljs-win32-x64` 与入口 `imodeljs-native.js` 的确切位置）——若与 Task 1 假设（均在包根）不符，回头修 `replace-imodeljs-native.ps1` 的 devbuild.json/平台目录定位逻辑后重跑其 fixture 测试。

- [ ] **Step 3: rush build（应用所需依赖包）**

```bash
CI=true node common/scripts/install-run-rush.js build --to @itwin/core-backend --to @itwin/core-frontend --to @itwin/editor-backend --to @itwin/editor-frontend
```

预期：四个目标包构建成功。本任务无 git 提交（产物不跟踪）。

---

### Task 5: 真实替换 + 验证（首次正式启用）

**Files:**
- Modify: node_modules 内 `@bentley/imodeljs-native` 现场（非 git 跟踪）

**Interfaces:**
- Consumes: Task 1 脚本（参数不变）、Task 3 产物（≥ v5.14.35 基线的新 Delivery）、Task 4 现场。
- Produces: 全部现场处于「本地二进制 + devbuild.json + 验证通过」状态；Task 6 的运行前提。

- [ ] **Step 1: 跑真实替换（无 -SkipGate，硬门槛走真）**

```powershell
cd D:\Github\tiangong-kaiwu
powershell -File scripts\replace-imodeljs-native.ps1
```

预期：`硬门槛通过: HEAD 已包含 v5.14.35` → 产物就绪 → 发现 ≥1 现场（至少 Rush store 一处）→ 全部「已覆盖」→ 每现场 `OK: dev build loaded` → 汇总表。

- [ ] **Step 2: 若 modeling-server/webhook-agent 已 pnpm install 且解析出各自现场，一并被覆盖（脚本自动）；若未安装，此处先装再重跑**

```bash
cd /d/Github/tiangong-kaiwu/modeling-server && corepack pnpm@10 install
cd ../webhook-agent && corepack pnpm@10 install
cd .. && powershell -File scripts/replace-imodeljs-native.ps1
```

预期：汇总表覆盖所有实际现场。本任务无 git 提交。

---

### Task 6: modeling-server 冒烟（端到端生效确认）

**Files:**
- 无文件改动（纯运行验证）

**Interfaces:**
- Consumes: Task 4 的 `lib/`、Task 5 的替换现场、modeling-server 的 dev 脚本。
- Produces: 「替换机制端到端生效」的确认证据（banner + 冒烟通过），即 spec 验收标准。

- [ ] **Step 1: 启动 modeling-server 并确认 banner**

```bash
cd /d/Github/tiangong-kaiwu/modeling-server && corepack pnpm@10 dev
```

预期：启动日志出现 `using dev build from …`（青色，官方 isDevBuild 通道）。无 banner = 替换未生效，回到 Task 5 排查现场定位。

- [ ] **Step 2: 功能冒烟**

前置：imodelhub-services 栈先行（见 CLAUDE.md 启动顺序）。验证：经前端或 RPC 打开一个已有 Briefcase 模型成功；再执行一次涉及 BRep 的操作（如体素/布尔类编辑命令），行为与 Task 3 Step 5 仓内自检一致、无原生层报错。

- [ ] **Step 3: 在 `docs/UPSTREAM_SYNC.md` 同步记录节追加一行（首次启用记录）**

```markdown
- **2026-09-26 原生库替换机制启用**：`replace-imodeljs-native.ps1` 首次落地（imodel-native ≥ v5.14.35，release 配置），modeling-server 冒烟通过
```

- [ ] **Step 4: 提交**

```bash
git add docs/UPSTREAM_SYNC.md
git commit -m "docs: record first activation of local imodeljs.native replacement"
```
