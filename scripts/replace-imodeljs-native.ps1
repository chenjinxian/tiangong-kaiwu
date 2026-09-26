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
  # PS5.1 向原生命令传参时不转义内嵌双引号，手动替换为 \" 以免 JS 被截断
  node -e ($probe -replace '"', '\"') $site
  if ($LASTEXITCODE -ne 0) { $failed += $site }
}
if ($failed.Count -gt 0) { throw "验证失败的现场: $($failed -join '; ')" }

Write-Host ""
Write-Host "==> 汇总（$($okSites.Count) 现场）:" -ForegroundColor Green
foreach ($s in $okSites) { Write-Host "    [已替换/已验证] $s" }
Write-Host "==> 完成。后端进程启动出现 'using dev build from ...' 即生效；重装 node_modules 后重跑本脚本。"
