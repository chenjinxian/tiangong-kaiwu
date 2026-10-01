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
  [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot),
  [string]$PublicRepo = 'chenjinxian/tiangong-kaiwu'
)
$ErrorActionPreference = 'Stop'
$dest = Join-Path $RepoRoot 'dist-backend'
New-Item -ItemType Directory -Force $dest | Out-Null

Write-Host "==> 下载最新 Release 的 MS 产物（repo=$PublicRepo）..." -ForegroundColor Cyan
gh release download --repo $PublicRepo --pattern 'modeling-server-win-x64-*.tgz' --dir $dest --clobber
if ($LASTEXITCODE -ne 0) { throw "gh release download 失败（exit $LASTEXITCODE）——检查 gh 登录态与 $PublicRepo 的 Releases" }
$tgz = Get-ChildItem -Path "$dest\modeling-server-win-x64-*.tgz" -ErrorAction SilentlyContinue |
  Sort-Object Name -Descending | Select-Object -First 1
if (-not $tgz) { throw "Release 中未找到 modeling-server-win-x64-*.tgz（repo=$PublicRepo）" }
Write-Host "==> 解压 $($tgz.Name) ..."
tar -xzf $tgz.FullName -C $dest
if ($LASTEXITCODE -ne 0) { throw "tar 解压失败（exit $LASTEXITCODE）" }
if (-not (Test-Path (Join-Path $dest 'modeling-server\dist\main.js'))) {
  throw "解压后未找到 dist-backend\modeling-server\dist\main.js —— 产物包结构异常"
}
Write-Host "==> 拉取 GHCR 镜像（compose pull）..."
Push-Location $RepoRoot
try {
  docker compose pull
  if ($LASTEXITCODE -ne 0) { throw "docker compose pull 失败（exit $LASTEXITCODE）——检查 docker 与 GHCR 访问权限" }
} finally { Pop-Location }
Write-Host "==> 完成: $dest\modeling-server\（start-ms-host.ps1 直接可跑）" -ForegroundColor Green
