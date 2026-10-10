#!/usr/bin/env powershell
# replace-imodeljs-native.ps1
# 用本地编译的 imodeljs.node(+伴生 DLL+Assets) 覆盖 node_modules 中
# @bentley/imodeljs-native 包的官方平台二进制，并写 devbuild.json 标记。
# v2 增补: typings(.d.ts)+JS wrapper 全量自产覆盖——fork 的
# iModelJsNodeAddon/api_package/ts 与 npm 包 typings 同源（侦察证实逐行对应），
# 由本脚本在运行时以独立 tsc 编译产出（不动 fork 构建），逐现场比对后覆盖，
# 并输出与官方产物的 drift 报告到 docs/。
# 设计: docs/superpowers/specs/2026-09-26-imodeljs-native-local-replacement-design.md
#
# 用法: powershell -File scripts\replace-imodeljs-native.ps1 [-Config debug] [-NativeRepo D:\Github\imodel-native]
#       [-IncludeTypings:$false]  # 仅替换二进制，跳过 typings/JS wrapper 自产覆盖
# 注意: 任何 rush update / pnpm install 重装 node_modules 后需重跑本脚本。
[CmdletBinding()]
param(
  [string]$NativeRepo = 'D:\Github\imodel-native',
  [ValidateSet('release', 'debug')]
  [string]$Config = 'release',
  [string[]]$ScanRoots = @(),
  [string]$PlatformDir = 'imodeljs-win32-x64',
  [switch]$SkipGate,
  [bool]$IncludeTypings = $true
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

# --- 3.5 typings/JS wrapper 自产（fork api_package/ts 运行时编译；不动 fork 构建） ---
# npm 包 typings 层实测构成（5.15.5）:
#   imodeljs-native.{d.ts,js}(+map) / NativeLibrary.{d.ts,js}(+map) / NativeCloudSqlite.{d.ts,js}(+map)
#   installNativePlatform.js（api_package 根的原生 JS，逐字节同源）
# 编译器与类型依赖全部取自本仓 itwinjs-core rush 现场（typescript@5.6.x 对齐 fork devDep，
# @types/node + core-bentley/common/geometry 的 lib/cjs 打包 d.ts），无需任何网络安装。
$Staging      = $null   # typings 产出目录 (<Staging>\lib)
$OverlayFiles = @()     # 相对包根的覆盖文件清单（fork 自产侧路径）
$overlayMap   = @{}     # 相对包根路径 -> fork 自产侧绝对路径
if ($IncludeTypings) {
  $TsSrc    = Join-Path $NativeRepo 'iModelJsNodeAddon\api_package\ts'
  $ApiRoot  = Join-Path $NativeRepo 'iModelJsNodeAddon\api_package'
  foreach ($need in @((Join-Path $TsSrc 'src\NativeLibrary.ts'), (Join-Path $ApiRoot 'installNativePlatform.js'))) {
    if (-not (Test-Path $need)) { throw "fork typings 源缺失: $need" }
  }

  # tsc: 优先 5.6.x（fork devDep ~5.6.3），退而求其次任意已装版本
  $tscCandidates = Get-ChildItem -Path (Join-Path $RepoRoot 'itwinjs-core\common\temp\node_modules\.pnpm') `
    -Directory -Filter 'typescript@*' -ErrorAction SilentlyContinue |
    ForEach-Object { Join-Path $_.FullName 'node_modules\typescript\lib\tsc.js' } | Where-Object { Test-Path $_ }
  $tsc56 = @($tscCandidates | Where-Object { $_ -match 'typescript@5\.6\.' })
  $tsc   = if ($tsc56.Count -gt 0) { $tsc56[0] } elseif ($tscCandidates.Count -gt 0) { $tscCandidates[0] } else { $null }
  if (-not $tsc) { throw "rush 现场未找到 typescript（itwinjs-core\common\temp\node_modules\.pnpm\typescript@*）— 先跑 rush update" }
  Write-Host "==> typings 编译器: $tsc"

  # @types/node（取 20.x 优先，对齐 fork engines/devDep）
  $typesRoots = Get-ChildItem -Path (Join-Path $RepoRoot 'itwinjs-core\common\temp\node_modules\.pnpm') `
    -Directory -Filter '@types+node@*' -ErrorAction SilentlyContinue |
    ForEach-Object { Join-Path $_.FullName 'node_modules\@types' } | Where-Object { Test-Path $_ }
  $tr20 = @($typesRoots | Where-Object { $_ -match '@types\+node@20\.' })
  # 注意: 数组经 if 语句输出仍被枚举、赋值塌缩成标量——@() 包住整个 if 才能保住数组语义
  $typeRoots = @(if ($tr20.Count -gt 0) { $tr20[0] } elseif ($typesRoots.Count -gt 0) { $typesRoots[0] })
  if (-not $typeRoots) { Write-Warning "rush 现场未找到 @types/node——node 内建模块类型将不可解析，tsc 可能报错" }

  # 三个 core 包的打包 d.ts（core-backend 类型check的同一事实源）；键=npm 包名
  $coreMap = @{}
  foreach ($pair in @(@('core-bentley', 'bentley', 'core-bentley'), @('core-common', 'common', 'core-common'), @('core-geometry', 'geometry', 'core-geometry'))) {
    $d = Join-Path $RepoRoot "itwinjs-core\core\$($pair[1])\lib\cjs\$($pair[2]).d.ts"
    if (-not (Test-Path $d)) { throw "缺 $d — 先 rush build --to @itwin/core-backend 再跑本脚本" }
    $coreMap[$pair[0]] = ($d -replace '\\', '/')
  }

  # staging: 复制 src 进暂存区后原地编译，使 sourcemap 的 sources 相对路径
  # （../src/*.ts）与官方产物逐字节一致（2026-10-11 实测 12/12 文件全等）
  $Staging = Join-Path $NativeRepo 'out\ts-api-staging'
  if (Test-Path $Staging) { Remove-Item -LiteralPath $Staging -Recurse -Force }
  New-Item -ItemType Directory -Path (Join-Path $Staging 'src') | Out-Null
  Get-ChildItem -LiteralPath (Join-Path $TsSrc 'src') -Filter '*.ts' -File | Copy-Item -Destination (Join-Path $Staging 'src')
  # typeRoots 行（@types/node 存在才注入；键值均为本仓内部路径，无转义风险，直接拼 JSON，
  # 避免 PS5.1 单元素数组经语句输出被展开成标量——ConvertTo-Json 会把数组写成字符串）
  $typeRootsLine = if ($typeRoots) { "`n    `"typeRoots`": [`"$($typeRoots[0] -replace '\\','/')`"]," } else { '' }
  $tsconfigJson = @"
{
  "compilerOptions": {
    "alwaysStrict": true,
    "declaration": true,
    "declarationMap": true,
    "esModuleInterop": false,
    "experimentalDecorators": true,
    "forceConsistentCasingInFileNames": true,
    "inlineSources": true,
    "module": "commonjs",
    "moduleResolution": "node",
    "noImplicitAny": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noImplicitThis": true,
    "noUnusedParameters": true,
    "skipLibCheck": true,
    "sourceMap": true,
    "strict": true,
    "strictNullChecks": true,
    "stripInternal": false,
    "target": "ES2023",
    "lib": ["ES2023", "DOM", "DOM.Iterable", "ESNext.Disposable"],
    "outDir": "./lib",
    "rootDir": "./src",
    "baseUrl": ".",
    "incremental": false,$typeRootsLine
    "paths": {
      "@itwin/core-bentley": ["$($coreMap['core-bentley'])"],
      "@itwin/core-common": ["$($coreMap['core-common'])"],
      "@itwin/core-geometry": ["$($coreMap['core-geometry'])"]
    }
  },
  "include": ["./src/NativeLibrary.ts", "./src/NativeCloudSqlite.ts", "./src/imodeljs-native.ts"]
}
"@
  [System.IO.File]::WriteAllText((Join-Path $Staging 'tsconfig.json'), $tsconfigJson, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host "==> 编译 fork typings: $Staging"
  & node $tsc -p (Join-Path $Staging 'tsconfig.json')
  if ($LASTEXITCODE -ne 0) { throw "fork typings 编译失败（tsc exit $LASTEXITCODE）——不覆盖现场 typings" }
  foreach ($must in @('imodeljs-native.js', 'imodeljs-native.d.ts', 'NativeLibrary.js', 'NativeLibrary.d.ts', 'NativeCloudSqlite.js', 'NativeCloudSqlite.d.ts')) {
    if (-not (Test-Path (Join-Path $Staging "lib\$must"))) { throw "typings 产出缺失 lib\$must" }
  }

  # 覆盖清单：编译产物全部 + installNativePlatform.js（fork 原生 JS 原样）
  Get-ChildItem -LiteralPath (Join-Path $Staging 'lib') -File | ForEach-Object {
    $OverlayFiles += $_.Name; $overlayMap[$_.Name] = $_.FullName
  }
  $OverlayFiles += 'installNativePlatform.js'
  $overlayMap['installNativePlatform.js'] = Join-Path $ApiRoot 'installNativePlatform.js'
  Write-Host "==> typings 覆盖清单: $($OverlayFiles.Count) 个文件"
}

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
  "$RepoRoot\luban-cad\apps\web\node_modules\@bentley\imodeljs-native",
  # dist-backend 产物内嵌 modeling-server 现场（fetch-backend.ps1 解包；存在即覆盖，缺失自然跳过）
  "$RepoRoot\dist-backend\modeling-server\node_modules\.pnpm\@bentley+imodeljs-native@*\node_modules\@bentley\imodeljs-native",
  "$RepoRoot\dist-backend\modeling-server\node_modules\@bentley\imodeljs-native"
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
# typings 覆盖前先全现场比对（此时现场=官方原始态），汇总 drift 报告后再统一写：
# 保证 report 的“官方参照”取自覆盖前。
$siteVerCache = @{}
$okSites = @()
foreach ($site in $sites) {
  $siteVer = (Get-Content (Join-Path $site 'package.json') -Raw | ConvertFrom-Json).version
  if ($siteVer -ne $Required) {
    throw "现场 $site 版本 $siteVer != 所需 $Required — 先 rush update / pnpm install 让 node_modules 与 itwinjs-core 对齐"
  }
  $okSites += $site
}

# --- 5.5 typings/JS wrapper 覆盖 + drift 报告（先比对全现场，再统一落盘） ---
$contractSigs = @('createBRepGeometry', 'updateElementGeometryCache')
$driftFindings = @()   # 每现场每文件: [pscustomobject]@{Site; File; Status; Detail}
$contractHits  = @()
if ($IncludeTypings) {
  foreach ($site in $okSites) {
    foreach ($rel in $OverlayFiles) {
      $srcFile = $overlayMap[$rel]
      $dstFile = Join-Path $site $rel
      $dstExists = Test-Path -LiteralPath $dstFile
      $same = $false
      if ($dstExists) {
        $same = ((Get-FileHash -LiteralPath $srcFile -Algorithm SHA256).Hash -eq
                 (Get-FileHash -LiteralPath $dstFile -Algorithm SHA256).Hash)
      }
      if ($same) {
        $driftFindings += [pscustomobject]@{ Site = $site; File = $rel; Status = 'identical'; Detail = '' }
      } else {
        $detail = if ($dstExists) {
          $a = Get-Content -LiteralPath $srcFile
          $b = Get-Content -LiteralPath $dstFile
          "$([math]::Abs(($a.Count) - ($b.Count))) 行净差（左=自产 $($a.Count) 行 / 右=现场 $($b.Count) 行）"
        } else { '现场缺失该文件' }
        $driftFindings += [pscustomobject]@{ Site = $site; File = $rel; Status = 'drift'; Detail = $detail }
        # 契约函数签名核查：drift 命中 NativeLibrary.d.ts 时，比较双方含契约函数的行
        if ($rel -eq 'NativeLibrary.d.ts' -and $dstExists) {
          foreach ($fn in $contractSigs) {
            $sigA = @(Get-Content -LiteralPath $srcFile | Where-Object { $_ -match $fn })
            $sigB = @(Get-Content -LiteralPath $dstFile | Where-Object { $_ -match $fn })
            if (Compare-Object $sigA $sigB) {
              $contractHits += [pscustomobject]@{ Site = $site; File = $rel; Function = $fn }
            }
          }
        }
      }
    }
  }

  # drift 报告（docs/，按日覆盖同名文件）
  $reportDate = Get-Date -Format 'yyyy-MM-dd'
  $reportPath = Join-Path $RepoRoot "docs\native-typings-drift-$reportDate.md"
  $drifted  = @($driftFindings | Where-Object { $_.Status -eq 'drift' })
  $identCnt = @($driftFindings | Where-Object { $_.Status -eq 'identical' }).Count
  $lines = @()
  $lines += "# native typings drift 报告（$reportDate）"
  $lines += ""
  $lines += "- 自产源: $NativeRepo\iModelJsNodeAddon\api_package\ts（运行时 tsc 编译，staging: $Staging\lib）"
  $lines += "- 对照基线: 各现场包内覆盖前的既有文件（**首跑即官方 $Required 原始产物**；重跑时=上次自产结果）"
  $lines += "- 现场数: $($okSites.Count)；覆盖文件数/现场: $($OverlayFiles.Count)；逐字节相同跳过: $identCnt；drift: $($drifted.Count)"
  $lines += ""
  if ($drifted.Count -eq 0) {
    $lines += "## 结论: 全部逐字节一致，零 drift（自产产物与官方 $Required typings/JS wrapper 完全等价）"
  } else {
    $lines += "## drift 明细"
    $lines += ""
    foreach ($d in $drifted) {
      $siteShort = $d.Site.Replace($RepoRoot, '<repo>')
      $lines += "- **$($d.File)** @ ``$siteShort`` — $($d.Detail)"
    }
    if ($contractHits.Count -gt 0) {
      $lines += ""
      $lines += "## !!! 契约函数签名 drift（覆盖已中止，需人工裁决）"
      foreach ($c in $contractHits) { $lines += "- $($c.Function) @ $($c.File) ($($c.Site))" }
    }
  }
  $lines | Set-Content -Path $reportPath -Encoding utf8
  Write-Host "==> typings drift 报告: $reportPath（identical=$identCnt drift=$($drifted.Count)）"
  if ($contractHits.Count -gt 0) {
    throw "!!! 契约函数签名 drift: $($contractHits.Function -join ', ') — drift 报告已写入 $reportPath；与平台几何缓存契约相关，人工裁决前中止覆盖（二进制亦未替换）。"
  }

  # 统一落盘：drift/缺失 的覆盖，identical 跳过
  foreach ($site in $okSites) {
    foreach ($rel in $OverlayFiles) {
      $dstFile = Join-Path $site $rel
      $rec = @($driftFindings | Where-Object { $_.Site -eq $site -and $_.File -eq $rel })[0]
      if ($rec.Status -eq 'drift') {
        Copy-Item -LiteralPath $overlayMap[$rel] -Destination $dstFile -Force
      }
    }
  }
}

# --- 6. 逐现场：平台二进制覆盖 + devbuild.json ---
foreach ($site in $okSites) {
  $plat = Join-Path $site $PlatformDir
  if (-not (Test-Path $plat)) { New-Item -ItemType Directory -Path $plat | Out-Null }

  # 覆盖 Delivery 全部内容（排除测试目录 Gtest/UnitTests）；不删除平台目录中官方多余文件（Notices 等，无害）
  $excludes = @('Gtest', 'UnitTests')
  Get-ChildItem -LiteralPath $Delivery | Where-Object { $excludes -notcontains $_.Name } | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $plat -Recurse -Force
  }
  # iTwinNapi.dll 顶层桩修正：Delivery 组装可能把延迟加载桩（~13KB 无实现）
  # 放在顶层，真实现（~26KB+）在 Node\ 子目录——imodeljs.node 绑定顶层名，
  # 绑到桩则 "Module did not self-register"（2026-10-03 5.15.5 构建实证）
  $realNapi = Join-Path $Delivery 'Node\iTwinNapi.dll'
  if (Test-Path $realNapi) { Copy-Item $realNapi (Join-Path $plat 'iTwinNapi.dll') -Force }
  # devbuild.json 在包根（require.resolve('./devbuild.json') 相对包根入口 imodeljs-native.js）
  Set-Content -Path (Join-Path $site 'devbuild.json') -Value '{"dev-build": true}' -Encoding ascii -NoNewline
  Write-Host "    已覆盖: $site"
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
Write-Host "==> 汇总（$($okSites.Count) 现场$(if ($IncludeTypings) { '；typings/JS wrapper 已自产覆盖' } else { '；typings 未动（-IncludeTypings:$false）' })）:" -ForegroundColor Green
foreach ($s in $okSites) { Write-Host "    [已替换/已验证] $s" }
Write-Host "==> 完成。后端进程启动出现 'using dev build from ...' 即生效；重装 node_modules 后重跑本脚本。"
