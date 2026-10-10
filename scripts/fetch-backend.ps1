# ============================================================
# fetch-backend.ps1 — 拉取后端产物（公开仓消费入口）
#
# 后端私有化（2026-10-01）：后端源码在私有仓 luban-backend，本仓不构建
# 后端。本脚本一次性拉齐两样产物，供外部验证者/新机快速起栈：
#   1. modeling-server 产物包：GitHub Releases 最新 release 的
#      modeling-server-win-x64-*.tgz → 解压到 dist-backend\modeling-server
#      （scripts/start-ms-host.ps1 产物模式直接可跑）
#   2. compose 镜像：ghcr.io/chenjinxian/imodelhub + luban-webhook-agent
#      （docker compose pull）
# 幂等：可重复执行（--clobber 覆盖旧 tgz，解压与拉取均覆盖旧产物）。
#
# 用法: powershell -File scripts/fetch-backend.ps1 [-RepoRoot <仓库根>] [-PublicRepo <owner/repo>]
# 依赖: gh CLI（登录且对 $PublicRepo 的 Releases 有读权限）、docker、
#       Windows 10+ 自带 tar。
# ============================================================
[CmdletBinding()]
param(
  [string]$RepoRoot = 'D:\Github\tiangong-kaiwu',
  [string]$PublicRepo = 'chenjinxian/tiangong-kaiwu',
  [string]$LocalArtifact = ''  # 本地模式：直接指向本地产物 tgz（跳过 gh release download）
)
$ErrorActionPreference = 'Stop'
$dest = Join-Path $RepoRoot 'dist-backend'
New-Item -ItemType Directory -Force $dest | Out-Null

# 幂等前清：旧 tgz 与旧解压树一并清掉（防版本混合/陈旧解压残留；
# MS 进程仍占用 dist-backend\modeling-server 时 Remove/解压会报错中止——先停宿主 MS 再跑）
Remove-Item -Path "$dest\modeling-server-win-x64-*.tgz" -Force -ErrorAction SilentlyContinue
Remove-Item -Path (Join-Path $dest 'modeling-server') -Recurse -Force -ErrorAction SilentlyContinue

if ($LocalArtifact) {
  # 本地模式：直接拷贝本地产物（开发/测试用，跳过 gh release download 与 compose pull）
  Write-Host "==> 本地模式：拷贝 $LocalArtifact ..." -ForegroundColor Cyan
  if (-not (Test-Path $LocalArtifact)) { throw "本地产物不存在: $LocalArtifact" }
  Copy-Item $LocalArtifact $dest -Force
  $tgz = Get-Item $LocalArtifact
  Write-Host "==> 本地模式跳过 compose pull（镜像未发布到 GHCR）" -ForegroundColor Yellow
} else {
  Write-Host "==> 下载最新 Release 的 MS 产物（repo=$PublicRepo）..." -ForegroundColor Cyan
  gh release download --repo $PublicRepo --pattern 'modeling-server-win-x64-*.tgz' --dir $dest --clobber
  if ($LASTEXITCODE -ne 0) { throw "gh release download 失败（exit $LASTEXITCODE）——检查 gh 登录态与 $PublicRepo 的 Releases" }
  # 排序键不用文件名字典序（v1.9 > v1.10 会选错）：取名中数字段逐段补零后拼接，
  # 使字典序 == 数值序（前清后目录内通常仅剩最新一个 tgz，此键只是兜底）
  $tgz = Get-ChildItem -Path "$dest\modeling-server-win-x64-*.tgz" -ErrorAction SilentlyContinue |
    Sort-Object { ([regex]::Matches($_.BaseName, '\d+') | ForEach-Object { $_.Value.PadLeft(10, '0') }) -join '' } -Descending |
    Select-Object -First 1
  if (-not $tgz) { throw "Release 中未找到 modeling-server-win-x64-*.tgz（repo=$PublicRepo）" }
  Write-Host "==> 拉取 GHCR 镜像（compose pull）..."
  # Docker Desktop 安装后需重启终端才入 PATH；脚本内显式补 PATH 防呆
  $env:PATH = "C:\Program Files\Docker\Docker\resources\bin;$env:PATH"
  Push-Location $RepoRoot
  try {
    docker compose pull
    if ($LASTEXITCODE -ne 0) { throw "docker compose pull 失败（exit $LASTEXITCODE）——检查 docker 与 GHCR 访问权限" }
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

Write-Host "==> 完成: $dest\modeling-server\（start-ms-host.ps1 直接可跑）" -ForegroundColor Green
