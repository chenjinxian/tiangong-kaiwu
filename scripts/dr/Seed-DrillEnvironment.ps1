# ============================================================
# Seed-DrillEnvironment.ps1 — 启动并最小化播种演练环境（Phase A）
#
# 播种只使用现有 API：
#   - HUB REST：管理员登录 → 创建 1 个 iTwin + 1 个 iModel
#   - Azurite REST：创建容器（幂等）+ PUT 一个 sentinel blob 并回读校验
# 不使用生产数据；不调用主栈服务；所有写操作只落在演练项目。
#
# 默认会先启动最小演练栈（postgres/redis/maildev/azurite/hub/WA）。
# 加 -NoStart 时只对已启动的演练栈执行 seed。
#
# 用法：
#   powershell -File scripts/dr/Seed-DrillEnvironment.ps1 -Workspace .drill/drill-20261124-01
#   powershell -File scripts/dr/Seed-DrillEnvironment.ps1 -Workspace .drill/drill-20261124-01 -NoStart
# ============================================================
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Workspace,

    [switch]$NoStart,

    [ValidateRange(10, 3600)]
    [int]$TimeoutSec = 180
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host '找不到 node；演练运行器需要 Node.js >= 20。' -ForegroundColor Red
    exit 1
}

$runner = Join-Path $PSScriptRoot 'drill-runner.mjs'
$common = @($runner)

if (-not $NoStart) {
    Write-Host '启动最小演练栈（隔离项目/端口/卷）...' -ForegroundColor Cyan
    & node @common 'up' '--workspace' $Workspace '--timeout-sec' "$TimeoutSec"
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host '通过现有 HUB/Azurite REST API 播种最小演练数据...' -ForegroundColor Cyan
& node @common 'seed' '--workspace' $Workspace '--timeout-sec' "$TimeoutSec"
exit $LASTEXITCODE
