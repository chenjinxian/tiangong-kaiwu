# ============================================================
# New-DrillEnvironment.ps1 — 创建一次性隔离 DR 演练工作区（Phase A）
#
# 作用：在 <repo>/.drill/<drillId>/ 生成：
#   - 独立 .env（演练专用随机密钥，绝不与主栈共享）
#   - docker-compose.yml（scripts/dr/docker-compose.drill.yml 的副本）
#   - scripts/backup-stack.ps1、restore-stack.ps1（原样副本，行为未改）
#   - backups/ 与 evidence/
#
# 不会启动容器、不会读写主栈、不会备份或恢复数据。
# 项目名必须是 tiangong-kaiwu-drill 或 tiangong-kaiwu-drill-*；
# 主项目 tiangong-kaiwu 会被运行器拒绝。
#
# 用法：
#   powershell -File scripts/dr/New-DrillEnvironment.ps1 -DrillId drill-20261124-01
#   powershell -File scripts/dr/New-DrillEnvironment.ps1 -DrillId drill-20261124-restore `
#     -Project tiangong-kaiwu-drill-restore -PortOffset 1 -EnvTemplate .drill/drill-20261124-01
# ============================================================
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$DrillId,

    [string]$Project = 'tiangong-kaiwu-drill',

    [ValidateRange(0, 9)]
    [int]$PortOffset = 0,

    # 从已有演练工作区复制演练密钥（用于“空目标恢复”工作区）。
    # 只接受 <repo>/.drill 下的演练工作区；主 .env 永远不是合法模板。
    [string]$EnvTemplate
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

if ($Project -eq 'tiangong-kaiwu') {
    Write-Host '拒绝：主项目 tiangong-kaiwu 不是演练目标。' -ForegroundColor Red
    exit 3
}
if ($Project -notmatch '^tiangong-kaiwu-drill(-[a-z0-9][a-z0-9-]{0,30})?$') {
    Write-Host "拒绝：演练项目名必须是 tiangong-kaiwu-drill 或 tiangong-kaiwu-drill-*：$Project" -ForegroundColor Red
    exit 3
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host '找不到 node；演练运行器需要 Node.js >= 20。' -ForegroundColor Red
    exit 1
}

$runner = Join-Path $PSScriptRoot 'drill-runner.mjs'
$arguments = @(
    $runner, 'create',
    '--drill-id', $DrillId,
    '--project', $Project,
    '--port-offset', "$PortOffset"
)
if ($EnvTemplate) {
    $arguments += @('--env-template', $EnvTemplate)
}

Write-Host "创建演练工作区：$DrillId（项目 $Project，端口偏移 $PortOffset）" -ForegroundColor Cyan
& node @arguments
exit $LASTEXITCODE
