# ============================================================
# verify-public-deps.ps1 — 验证外部体验者所需的全部公开依赖可匿名获取
#
# 检查项（与 docs/Deployment-Guide.md「需要获取的完整服务清单」一致）：
#   1) 4 个公开 GHCR 镜像 latest 的匿名 manifest（不依赖本机 docker login）
#   2) GitHub Releases 最新 Release 的 modeling-server tgz 资产（匿名 API）
#   3) 官方基础设施镜像在 compose 中的引用（postgres/redis/maildev/azurite/nginx）
#
# 用法: powershell -File scripts/verify-public-deps.ps1
# 退出码 0 = 全部公开可获取；非 0 = 有失败项（发布前硬门）。
# ============================================================
[CmdletBinding()]
param(
  [string]$PublicRepo = 'chenjinxian/tiangong-kaiwu',
  [string]$Owner = 'chenjinxian'
)
$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch { }

$results = New-Object System.Collections.Generic.List[object]
function Add-Result([string]$Name, [bool]$Ok, [string]$Detail) {
  $label = if ($Ok) { 'OK' } else { 'FAIL' }
  $color = if ($Ok) { 'Green' } else { 'Red' }
  Write-Host ("  [{0}] {1}  {2}" -f $label, $Name, $Detail) -ForegroundColor $color
  $results.Add([pscustomobject]@{ Result = $label; Name = $Name; Detail = $Detail })
}

# ---------------- GHCR 匿名 manifest ----------------
function Test-AnonGhcrManifest([string]$Pkg, [string]$Ref = 'latest') {
  $tokenUrl = "https://ghcr.io/token?scope=repository:${Owner}/${Pkg}:pull&service=ghcr.io"
  $tok = ''
  try { $tok = [string](Invoke-RestMethod -Uri $tokenUrl -TimeoutSec 30).token } catch { }
  if (-not $tok) { return @{ Ok = $false; Detail = '无法获取匿名 token' } }
  $url = "https://ghcr.io/v2/${Owner}/${Pkg}/manifests/${Ref}"
  try {
    $r = Invoke-WebRequest -Uri $url -Method Head -UseBasicParsing -TimeoutSec 30 -Headers @{
      Authorization = "Bearer $tok"
      Accept = 'application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json'
    }
    $digest = [string]$r.Headers['Docker-Content-Digest']
    return @{ Ok = ($r.StatusCode -eq 200); Detail = "HTTP $($r.StatusCode) digest=$digest" }
  } catch {
    $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
    return @{ Ok = $false; Detail = "HTTP $code（包可能仍为 private）" }
  }
}

Write-Host ''
Write-Host '== 公开 GHCR 镜像（匿名） ==' -ForegroundColor Cyan
foreach ($pkg in @('luban-web-public', 'luban-bff-public', 'imodelhub-public', 'luban-webhook-agent-public')) {
  $r = Test-AnonGhcrManifest -Pkg $pkg
  Add-Result "ghcr.io/$Owner/${pkg}:latest" $r.Ok $r.Detail
}

# ---------------- 公开 Release 资产 ----------------
Write-Host ''
Write-Host '== GitHub Release 产物（匿名） ==' -ForegroundColor Cyan
try {
  $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$PublicRepo/releases/latest" -TimeoutSec 60 -Headers @{
    'User-Agent' = 'luban-cad-verify-public-deps'
    'Accept'     = 'application/vnd.github+json'
  }
  $asset = @($release.assets | Where-Object { $_.name -like 'modeling-server-win-x64-*.tgz' }) | Select-Object -First 1
  if ($asset) {
    $digest = if ($asset.digest) { [string]$asset.digest } else { '(无 digest，老资产)' }
    Add-Result "Release $($release.tag_name) / $($asset.name)" $true "$([math]::Round([long]$asset.size / 1MB)) MB $digest"
  } else {
    Add-Result 'Release modeling-server 资产' $false '最新 Release 中没有 modeling-server-win-x64-*.tgz'
  }
  $bundle = @($release.assets | Where-Object { $_.name -eq 'luban-cad-deploy.zip' }) | Select-Object -First 1
  if ($bundle) {
    Add-Result 'Release 部署包 luban-cad-deploy.zip' $true "$([math]::Round([long]$bundle.size / 1KB)) KB（无需 clone 源码）"
  } else {
    Add-Result 'Release 部署包 luban-cad-deploy.zip' $false '缺少稳定名部署包（make-deploy-bundle.ps1 后上传）'
  }
} catch {
  Add-Result 'Release 元数据' $false "$($_.Exception.Message)（GitHub API 限流或网络失败）"
}

# ---------------- 官方基础设施镜像引用 ----------------
Write-Host ''
Write-Host '== compose 官方基础设施镜像 ==' -ForegroundColor Cyan
$compose = Join-Path $RepoRoot 'docker-compose.yml'
$expected = @('postgres:17-alpine', 'redis:7-alpine', 'maildev/maildev', 'mcr.microsoft.com/azure-storage/azurite', 'nginx:alpine')
$text = if (Test-Path $compose) { Get-Content -Raw $compose } else { '' }
foreach ($img in $expected) {
  Add-Result $img ($text -match [regex]::Escape($img)) 'compose 引用存在'
}

# ---------------- 汇总 ----------------
Write-Host ''
$fail = @($results | Where-Object { $_.Result -ne 'OK' }).Count
$ok = @($results | Where-Object { $_.Result -eq 'OK' }).Count
if ($fail -gt 0) {
  Write-Host ("结果: {0}/{1} 通过，{2} 项失败 → 退出码 1" -f $ok, $results.Count, $fail) -ForegroundColor Red
  Write-Host '私有包设为 Public: GitHub → 你的 Packages → 包 → Package settings → Danger Zone → Change visibility' -ForegroundColor Yellow
  exit 1
}
Write-Host ("结果: {0}/{1} 项全部通过（公开依赖完整可匿名获取）" -f $ok, $results.Count) -ForegroundColor Green
exit 0
