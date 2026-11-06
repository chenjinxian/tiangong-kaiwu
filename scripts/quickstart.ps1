# ============================================================
# quickstart.ps1 — 外部体验者一键起栈（Windows 10/11）
#
# 目标：没有任何后端源码、没有 GitHub 账号、没有 docker login 的人，
# 在克隆本仓后一条命令跑通完整 LubanCAD 栈并打开浏览器。
#
# 步骤（幂等；已就绪的步骤自动跳过）：
#   1) 环境检查：Windows / Docker Desktop / Docker Compose v2 / Node.js
#   2) 首次运行生成仓库根 .env（随机密钥）
#   3) 首次运行拉取 modeling-server 产物（公开 Release，匿名下载）
#      与公开 GHCR 镜像（imodelhub-public / luban-webhook-agent-public）
#   4) docker compose up -d（首次会本地构建 web / bff 镜像）
#   5) 宿主 modeling-server :5401（已健康则跳过）
#   6) verify-stack 全栈验收（-SkipVerify 可跳过）
#   7) 打开 http://localhost:5301
#
# 用法:
#   powershell -NoProfile -File scripts/quickstart.ps1
#   powershell -NoProfile -File scripts/quickstart.ps1 -SkipVerify
#   powershell -NoProfile -File scripts/quickstart.ps1 -NoOpen
#
# 说明：modeling-server 是 Windows 原生宿主进程（本地编译原生几何库），
# 本栈当前只支持 Windows 10/11 x64；Linux/macOS 不能运行该产物。
# ============================================================
[CmdletBinding()]
param(
  [switch]$SkipVerify,
  [switch]$NoOpen
)
$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

function Write-Step([string]$Text) {
  Write-Host ''
  Write-Host "==> $Text" -ForegroundColor Cyan
}
function Assert-Step([bool]$Ok, [string]$Message) {
  if (-not $Ok) { throw $Message }
}

# ---------------- 1. 环境检查 ----------------
Write-Step '1/7 环境检查'
Assert-Step ([Environment]::OSVersion.Platform -eq 'Win32NT') '本栈需要 Windows 10/11（modeling-server 为 Windows 原生宿主进程）'

$docker = Get-Command docker -ErrorAction SilentlyContinue
Assert-Step ($null -ne $docker) '未找到 docker：请安装并启动 Docker Desktop（https://www.docker.com/products/docker-desktop/）'
$env:PATH = "C:\Program Files\Docker\Docker\resources\bin;$env:PATH"
$ErrorActionPreference = 'Continue'
$dockerInfo = docker info --format '{{.ServerVersion}}' 2>$null
$dockerExit = $LASTEXITCODE
$composeVer = docker compose version --short 2>$null
$composeExit = $LASTEXITCODE
$nodeVer = node -v 2>$null
$nodeExit = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
Assert-Step ($dockerExit -eq 0) 'Docker 引擎未运行：请启动 Docker Desktop 并等待其就绪'
Assert-Step ($composeExit -eq 0) 'Docker Compose v2 不可用：请升级 Docker Desktop'
Assert-Step ($nodeExit -eq 0) '未找到 Node.js：请安装 Node.js 22 LTS（https://nodejs.org/）并重开终端'
$nodeMajor = 0
$nodeMinor = 0
if ($nodeVer -match '^v(\d+)\.(\d+)') { $nodeMajor = [int]$Matches[1]; $nodeMinor = [int]$Matches[2] }
Assert-Step (($nodeMajor -gt 20) -or ($nodeMajor -eq 20 -and $nodeMinor -ge 12)) "Node.js 版本过低（$nodeVer）：需要 Node.js 20.12+（推荐 22 LTS）"
Write-Host "    Docker $dockerInfo / Compose $composeVer / Node $nodeVer" -ForegroundColor Green

# ---------------- 2. .env ----------------
Write-Step '2/7 生成仓库根 .env（幂等）'
& (Join-Path $PSScriptRoot 'generate-env.ps1')

# ---------------- 3. 产物 + 公开镜像 ----------------
Write-Step '3/7 检查后端产物与公开镜像'
$msReady = Test-Path (Join-Path $RepoRoot 'dist-backend\modeling-server\dist\main.js')
if ($msReady) {
  Write-Host '    后端产物已就位，跳过下载' -ForegroundColor Green
  Write-Host '    刷新公开镜像（匿名，无需登录）...'
  docker compose pull web imodelhub webhook-agent bff
  if ($LASTEXITCODE -ne 0) { throw 'docker compose pull 失败：检查网络/代理能否访问 ghcr.io（镜像为公开，不需要 docker login）' }
} else {
  Write-Host '    首次运行：匿名下载 modeling-server 产物 + 公开镜像 ...'
  & (Join-Path $PSScriptRoot 'fetch-backend.ps1')
}

# ---------------- 4. 容器栈 ----------------
Write-Step '4/7 启动容器栈（全部用公开镜像，无本地构建）'
docker compose up -d
if ($LASTEXITCODE -ne 0) { throw 'docker compose up -d 失败：查看上方输出（端口冲突/镜像拉取/构建错误）' }
# hub/WA 重建后容器 IP 会变，nginx 启动时缓存了旧上游地址 → 5301 会 502。
# 无条件重启 nginx（秒级），确保 /auth、/ws、HUB 九前缀指向最新容器。
docker compose restart nginx | Out-Null

# ---------------- 5. 宿主 modeling-server ----------------
Write-Step '5/7 启动宿主 modeling-server :5401'
$msHealthy = $false
try {
  $r = Invoke-WebRequest -Uri 'http://127.0.0.1:5401/health' -UseBasicParsing -TimeoutSec 3
  $msHealthy = ($r.StatusCode -eq 200)
} catch { }
if ($msHealthy) {
  Write-Host '    modeling-server 已健康，跳过' -ForegroundColor Green
} else {
  & (Join-Path $PSScriptRoot 'start-ms-host.ps1') -Detach
}

# ---------------- 6. 验收 ----------------
if ($SkipVerify) {
  Write-Step '6/7 全栈验收（-SkipVerify 跳过）'
} else {
  Write-Step '6/7 全栈验收（约 1–5 分钟）'
  & (Join-Path $PSScriptRoot 'verify-stack.ps1')
  if ($LASTEXITCODE -ne 0) { throw 'verify-stack 未通过：查看上方 FAIL 行与 docs/Deployment-Guide.md「故障排除」' }
}

# ---------------- 7. 打开入口 ----------------
Write-Step '7/7 打开产品入口'
Write-Host '    地址: http://localhost:5301  （注册任意邮箱即可开始）' -ForegroundColor Green
if (-not $NoOpen) { Start-Process 'http://localhost:5301' }
Write-Host ''
Write-Host '完成。停止栈: docker compose down；停止宿主 MS: powershell -File scripts/stop-ms-host.ps1' -ForegroundColor DarkGray
