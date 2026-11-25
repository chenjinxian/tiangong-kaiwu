# ============================================================
# fetch-backend.ps1 — 拉取后端产物（公开仓消费入口）
#
# 后端私有化（2026-10-01）：后端源码在私有仓 luban-backend，本仓不构建
# 后端。本脚本一次性拉齐两样产物，供外部验证者/新机快速起栈：
#   1. modeling-server 产物包：GitHub Releases 最新 release（或 -Tag 指定）的
#      modeling-server-win-x64-*.tgz → 解压到 dist-backend\modeling-server
#      （scripts/start-ms-host.ps1 产物模式直接可跑）
#   2. compose 镜像：ghcr.io/chenjinxian/{imodelhub-public, luban-webhook-agent-public,
#      luban-web-public, luban-bff-public}（docker compose pull；全部公开，匿名可拉）
#
# 外部体验者零 GitHub 账号：Release 与 GHCR 镜像均为公开资源，默认走匿名
# GitHub API + 匿名 curl 下载；不要求 gh CLI、不要求 docker login。gh 仅在
# 匿名 API 被限流时作为可选回退（已登录的开发者机器）。
#
# 完整性：GitHub 资产带 sha256 digest 时自动校验（老资产无 digest 则只校验
# 字节数）；下载后可安全重跑（幂等，--clobber 覆盖旧 tgz）。
#
# 用法: powershell -File scripts/fetch-backend.ps1 [-RepoRoot <仓库根>] [-PublicRepo <owner/repo>]
#       [-Tag backend-YYYYMMDD] [-ImageTag <ghcr tag>] [-LocalArtifact <本地产物 tgz>]
#       [-RebuildWeb [-AllowContractSkew]]
#
# 公开镜像与产物同代：默认把 Release tag 写入根 .env 的 LUBAN_RELEASE_TAG，
# compose 的 web/imodelhub/webhook-agent/bff 全部使用同一 tag；不再各自浮动
# 到 latest。发布流程必须为同一个 tag 推送四个镜像。
# 依赖: docker（必需）、Windows 10+ 自带 curl/tar（必需）。
#
# 【web 镜像注记（2026-11-25 更新）】compose 的 web 默认消费公开镜像
# ghcr.io/chenjinxian/luban-web-public（外部体验者无需本机 Rush/pnpm 构建）。
# 外部 quickstart 的 web 与后端产物必须同代；源码 dev/RebuildWeb 会得到
# 更新契约，若产物未同步会在契约检查处失败（-AllowContractSkew 仅开发者覆盖）。
# 开发者改动 web/itwinjs-core 源后，本地镜像会旧于源码——用 -RebuildWeb
# 联动 scripts/rebuild-web.ps1 重建（本地覆盖同名 tag；发布需另行 push）。
# ============================================================
[CmdletBinding()]
param(
  [string]$RepoRoot = '',
  [string]$PublicRepo = 'chenjinxian/tiangong-kaiwu',
  [string]$Tag = '',
  [string]$ImageTag = '',       # 覆盖公开镜像 tag；缺省 = Release tag（保证产物与四镜像同代）
  [string]$LocalArtifact = '',  # 本地模式：直接指向本地产物 tgz（跳过 Release 下载与 compose pull）
  [switch]$RebuildWeb,          # 拉取成功后联动重建本仓 web 镜像（opt-in；默认只提示，外部验证者零新负担）
  [switch]$AllowContractSkew    # 允许源码 web 与公开产物契约不同还重建（仅开发者显式覆盖）
)
$ErrorActionPreference = 'Stop'

# 默认仓库根 = 本脚本上一级（外部用户克隆到任意路径都能直接跑）
if (-not $RepoRoot) { $RepoRoot = Split-Path -Parent $PSScriptRoot }
$RepoRoot = (Resolve-Path $RepoRoot).Path
$dest = Join-Path $RepoRoot 'dist-backend'
New-Item -ItemType Directory -Force $dest | Out-Null

# 把公开镜像 tag 写回根 .env（compose 的所有 GHCR 镜像共用它）。只改这一行，
# 保留其它键/注释与现有密钥；.env 不存在时跳过（compose 会使用 compose 默认值）。
function Set-EnvValue {
  param([string]$Path, [string]$Key, [string]$Value)
  if (-not (Test-Path $Path)) { return $false }
  $lines = @(Get-Content -LiteralPath $Path)
  $matched = $false
  $out = foreach ($line in $lines) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$' -and $Matches[1] -eq $Key) {
      $matched = $true
      "$Key=$Value"
    } else { $line }
  }
  if (-not $matched) { $out = @($out) + "$Key=$Value" }
  Set-Content -LiteralPath $Path -Value ($out -join "`r`n") -Encoding utf8
  return $true
}

# PS5.1 默认协议集可能不含 TLS1.2（GitHub API/Release 均要求）
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch { }

# ============================================================
# Release 资产解析（匿名优先；gh 仅作限流回退）
# ============================================================
function Get-ReleaseInfo {
  param([string]$Repo, [string]$ReleaseTag)
  $api = if ($ReleaseTag) {
    "https://api.github.com/repos/$Repo/releases/tags/$ReleaseTag"
  } else {
    "https://api.github.com/repos/$Repo/releases/latest"
  }
  $headers = @{
    'User-Agent' = 'luban-cad-fetch-backend'
    'Accept'     = 'application/vnd.github+json'
  }
  return Invoke-RestMethod -Uri $api -Headers $headers -TimeoutSec 60
}

function Get-ReleaseInfoViaGh {
  param([string]$Repo, [string]$ReleaseTag)
  $gh = Get-Command gh -ErrorAction SilentlyContinue
  if (-not $gh) { return $null }
  $ghArgs = @('release', 'view')
  if ($ReleaseTag) { $ghArgs += $ReleaseTag }
  $ghArgs += @('--repo', $Repo, '--json', 'tagName,assets')
  $json = & gh @ghArgs
  if ($LASTEXITCODE -ne 0 -or -not $json) { return $null }
  return ($json | ConvertFrom-Json)
}

function Select-MsAsset {
  param($Assets)
  $list = @($Assets | Where-Object { $_.name -like 'modeling-server-win-x64-*.tgz' })
  if ($list.Count -eq 0) { throw 'Release 中未找到 modeling-server-win-x64-*.tgz' }
  # 排序键不用文件名字典序（v1.9 > v1.10 会选错）：取名中数字段逐段补零后拼接，
  # 使字典序 == 数值序。
  return @($list | Sort-Object { ([regex]::Matches($_.name, '\d+') | ForEach-Object { $_.Value.PadLeft(10, '0') }) -join '' } -Descending)[0]
}

function Save-ReleaseAsset {
  param($Asset, [string]$Dest)
  $out = Join-Path $Dest $Asset.name
  $resume = $false
  $expected = if ($Asset.size) { [long]$Asset.size } else { 0 }
  if (Test-Path $out) {
    $have = (Get-Item $out).Length
    if ($expected -gt 0 -and $have -eq $expected) {
      Write-Host "==> 已存在完整资产（$have 字节），跳过下载并校验 ..." -ForegroundColor Green
      $downloaded = $true
    } elseif ($expected -gt 0 -and $have -lt $expected) {
      Write-Host "==> 断点续传：已有 $have / $expected 字节 ..." -ForegroundColor Yellow
      $resume = $true
      $downloaded = $false
    } else {
      Remove-Item $out -Force
      $downloaded = $false
    }
  } else {
    $downloaded = $false
  }

  $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
  if (-not $downloaded -and $curl) {
    Write-Host "==> 匿名下载 $($Asset.name)（$([math]::Round($expected / 1MB)) MB）..."
    # curl 进度/错误走 stderr：PS5.1 在 ErrorActionPreference=Stop 下会把 stderr
    # 包装成 NativeCommandError 直接中断——临时降级，失败判定仍以 LASTEXITCODE 为准。
    $eap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
      $curlArgs = @('--location', '--fail', '--retry', '3', '--retry-delay', '2',
        '--progress-bar', '--output', $out)
      if ($resume) { $curlArgs += @('--continue-at', '-') }
      & curl.exe @curlArgs $Asset.browser_download_url
      $downloaded = ($LASTEXITCODE -eq 0)
      if (-not $downloaded -and $resume) {
        # 服务端不支持 Range/续传失败：删半文件重下一次（慢网络下仍可完成）
        Write-Host "==> 续传失败，重新完整下载 ..." -ForegroundColor Yellow
        if (Test-Path $out) { Remove-Item $out -Force }
        & curl.exe --location --fail --retry 3 --retry-delay 2 --progress-bar `
          --output $out $Asset.browser_download_url
        $downloaded = ($LASTEXITCODE -eq 0)
      }
    } finally {
      $ErrorActionPreference = $eap
    }
  } elseif (-not $downloaded) {
    Write-Host "==> 下载 $($Asset.name)（curl 不可用，回退 Invoke-WebRequest）..."
    try {
      if ($resume) {
        # PS5.1 IWR 不支持断点续传：先删半文件，避免拼接损坏
        if (Test-Path $out) { Remove-Item $out -Force }
      }
      Invoke-WebRequest -Uri $Asset.browser_download_url -OutFile $out -UseBasicParsing -TimeoutSec 1800
      $downloaded = $true
    } catch {
      $downloaded = $false
    }
  }

  # 匿名下载失败且本机有已登录 gh → 回退 gh release download（仅开发者回退路径）
  if (-not $downloaded) {
    $gh = Get-Command gh -ErrorAction SilentlyContinue
    if (-not $gh) { throw "下载失败（匿名 curl）；该 Release 资产不可达或网络受限" }
    Write-Host "==> 匿名下载失败，回退 gh release download ..." -ForegroundColor Yellow
    & gh release download $Asset.releaseTag --repo $PublicRepo --pattern $Asset.name --dir $Dest --clobber
    if ($LASTEXITCODE -ne 0) { throw "gh release download 失败（exit $LASTEXITCODE）——检查 gh 登录态与 $PublicRepo 的 Releases" }
  }

  $file = Get-Item $out
  if ($Asset.size -and $file.Length -ne [long]$Asset.size) {
    throw "下载大小不符：期望 $($Asset.size) 字节，实际 $($file.Length) 字节（$($file.FullName)）"
  }
  if ($Asset.digest -match '^sha256:([0-9a-f]{64})$') {
    $expected = $Matches[1]
    $actual = (Get-FileHash -Path $out -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $expected) { throw "SHA256 校验失败：期望 $expected，实际 $actual" }
    Write-Host "==> SHA256 校验通过：$actual" -ForegroundColor Green
  } else {
    Write-Host "==> Release 资产无 sha256 digest（老资产），仅校验字节数" -ForegroundColor Yellow
  }
  return $file
}

# ============================================================
# 幂等前清：旧解压树清掉（防版本混合/陈旧解压残留；MS 进程仍占用
# dist-backend\modeling-server 时 Remove/解压会报错中止——先停宿主 MS 再跑）。
# tgz 不预先删除：同名完整资产直接跳过，半文件断点续传（慢网络友好）；
# 选定目标资产后再清理其它 tag 的旧 tgz。
# ============================================================
Remove-Item -Path (Join-Path $dest 'modeling-server') -Recurse -Force -ErrorAction SilentlyContinue
$resolvedImageTag = ''

if ($LocalArtifact) {
  # 本地模式：直接拷贝本地产物（开发/测试用，跳过 Release 下载与 compose pull）
  Write-Host "==> 本地模式：拷贝 $LocalArtifact ..." -ForegroundColor Cyan
  if (-not (Test-Path $LocalArtifact)) { throw "本地产物不存在: $LocalArtifact" }
  Copy-Item $LocalArtifact $dest -Force
  $tgz = Get-Item $LocalArtifact
  Write-Host "==> 本地模式跳过 compose pull（镜像未发布到 GHCR）" -ForegroundColor Yellow
} else {
  Write-Host "==> 解析 Release（repo=$PublicRepo，tag=$(if ($Tag) { $Tag } else { 'latest' })）..." -ForegroundColor Cyan
  $release = $null
  try {
    $release = Get-ReleaseInfo -Repo $PublicRepo -ReleaseTag $Tag
  } catch {
    Write-Host "==> 匿名 GitHub API 失败：$($_.Exception.Message)" -ForegroundColor Yellow
  }
  if (-not $release) {
    Write-Host "==> 尝试 gh CLI 回退（需已登录）..." -ForegroundColor Yellow
    $release = Get-ReleaseInfoViaGh -Repo $PublicRepo -ReleaseTag $Tag
  }
  if (-not $release) {
    throw "无法解析 Release（匿名 API 与 gh 均失败）——检查网络或 GitHub API 限流后重试"
  }
  # 匿名 GitHub API 的 JSON 键为 tag_name；gh --json 的键为 tagName
  $releaseTag = if ($release.tag_name) { [string]$release.tag_name } else { [string]$release.tagName }
  $asset = Select-MsAsset -Assets $release.assets
  $asset | Add-Member -NotePropertyName releaseTag -NotePropertyValue $releaseTag -Force
  Get-ChildItem -Path "$dest\modeling-server-win-x64-*.tgz" -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -ne $asset.name } | Remove-Item -Force -ErrorAction SilentlyContinue
  Write-Host "==> Release: $releaseTag，资产: $($asset.name)" -ForegroundColor Cyan
  $tgz = Save-ReleaseAsset -Asset $asset -Dest $dest

  # 产物与四个公开镜像必须同代：GHCR 的 <releaseTag> 由发布流程同步推送。
  # 写入根 .env 后，quickstart 后续的 compose pull/up 与手工重启都会继续使用
  # 这一 tag，而不是把 web/hub/WA/bff 各自浮动到 latest。
  $resolvedImageTag = if ($ImageTag) { $ImageTag } else { $releaseTag }
  $env:LUBAN_RELEASE_TAG = $resolvedImageTag
  $envFile = Join-Path $RepoRoot '.env'
  if (Set-EnvValue -Path $envFile -Key 'LUBAN_RELEASE_TAG' -Value $resolvedImageTag) {
    Write-Host "==> 公开镜像 tag: $resolvedImageTag（已写入 .env 的 LUBAN_RELEASE_TAG）" -ForegroundColor Cyan
  } else {
    Write-Host "==> 公开镜像 tag: $resolvedImageTag（.env 不存在；compose 使用 compose 默认 tag）" -ForegroundColor Yellow
  }

  Write-Host "==> 拉取 GHCR 镜像（compose pull；公开镜像，无需 docker login）..."
  # Docker Desktop 安装后需重启终端才入 PATH；脚本内显式补 PATH 防呆。
  # 从 ProgramFiles 派生，不硬编码宿主盘符；未安装时保持原 PATH。
  $dockerBin = if ($env:ProgramFiles) { Join-Path $env:ProgramFiles 'Docker\Docker\resources\bin' } else { $null }
  if ($dockerBin -and (Test-Path $dockerBin)) { $env:PATH = "$dockerBin;$env:PATH" }
  Push-Location $RepoRoot
  try {
    docker compose pull
    if ($LASTEXITCODE -ne 0) {
      throw "docker compose pull 失败（exit $LASTEXITCODE）——检查 Docker 是否运行、能否访问 ghcr.io；公开镜像无需登录"
    }
  } finally { Pop-Location }
}

# 解压产物（本地模式与 Release 模式共用）
Write-Host "==> 解压 $($tgz.Name) ..."
# bsdtar 对绝对路径的 gzip 流处理有 bug（"unexpected end of file"）——改用 Push-Location + 相对路径
Push-Location $dest
try {
  tar -xzf $tgz.Name
  if ($LASTEXITCODE -ne 0) { throw "tar 解压失败（exit $LASTEXITCODE）" }
} finally { Pop-Location }
if (-not (Test-Path (Join-Path $dest 'modeling-server\dist\main.js'))) {
  throw "解压后未找到 dist-backend\modeling-server\dist\main.js —— 产物包结构异常"
}

# 产物依赖实例去重（2026-10-10 风暴根因修复）：tgz 分装 dereference 符号链接产生
# 多份 @itwin 实例 → 跨拷贝 instanceof 失败 → 特征求值恒败 → notifyCommit 风暴。
& (Join-Path $PSScriptRoot 'dedupe-artifact-deps.ps1') -MsDir (Join-Path $dest 'modeling-server')

# 契约版本对照（诚实提示，不阻断）：公共 Release 产物可能落后于本仓源码。
# 版本不一致时新特征/RPC 可能不可用；修复方式是发布与源码匹配的新产物（release owner 流程）。
$srcContractFile = Join-Path $RepoRoot 'luban-cad\packages\shared\src\rpc\LubanFeatureRpcInterface.ts'
$artContractFile = Join-Path $dest 'modeling-server\node_modules\@luban-cad\shared\dist\rpc\LubanFeatureRpcInterface.js'
function Get-ContractVersion([string]$File) {
  if (-not (Test-Path $File)) { return '' }
  $m = Select-String -LiteralPath $File -Pattern 'interfaceVersion\s*=\s*"([^"]+)"' | Select-Object -First 1
  if ($m -and $m.Matches.Count -gt 0) { return [string]$m.Matches[0].Groups[1].Value }
  return ''
}
$srcContract = Get-ContractVersion $srcContractFile
$artContract = Get-ContractVersion $artContractFile
$contractMismatch = ($srcContract -and $artContract -and $srcContract -ne $artContract)
if ($srcContract -and $artContract) {
  if (-not $contractMismatch) {
    Write-Host "==> 契约版本一致：$artContract" -ForegroundColor Green
  } else {
    $tagNote = if ($resolvedImageTag) { "LUBAN_RELEASE_TAG=$resolvedImageTag" } else { 'compose 默认 tag' }
    Write-Host "==> 说明: 本仓源码契约 $srcContract；公开产物契约 $artContract。" -ForegroundColor Yellow
    Write-Host "    quickstart 使用与产物同代的公开 web 镜像（$tagNote），不受影响。" -ForegroundColor Yellow
    Write-Host "    若用源码 dev server 或 -RebuildWeb，web 与当前 MS 契约不兼容；需匹配产物或发布新 release：" -ForegroundColor Yellow
    Write-Host "    https://github.com/$PublicRepo/releases" -ForegroundColor Yellow
  }
}

Write-Host "==> 完成: $dest\modeling-server\（start-ms-host.ps1 直接可跑）" -ForegroundColor Green

# web 镜像收尾（B2）：web 是本仓 build，compose pull 不覆盖——后端发布 ≠ web 镜像更新
if ($RebuildWeb) {
  if ($contractMismatch -and -not $AllowContractSkew) {
    throw "源码 web 契约 $srcContract 与产物 $artContract 不兼容，拒绝 -RebuildWeb。`n" +
      "  quickstart 请使用同代公开 web 镜像；开发者需先提供匹配产物的 backend（-LocalArtifact <tgz>），`n" +
      "  或显式 -AllowContractSkew 接受前端请求不兼容的风险。"
  }
  if ($contractMismatch) {
    Write-Host "==> 警告: -AllowContractSkew 已放行契约不一致（源码 $srcContract / 产物 $artContract）" -ForegroundColor Yellow
  }
  Write-Host "==> 联动重建 web 镜像（-RebuildWeb）..." -ForegroundColor Cyan
  & (Join-Path $PSScriptRoot 'rebuild-web.ps1')
} else {
  Write-Host "==> 提示: web 默认用公开镜像；若你改动了 web/itwinjs-core 源码，跑 scripts/rebuild-web.ps1（或本脚本 -RebuildWeb 联动）重建本地镜像" -ForegroundColor Yellow
}
