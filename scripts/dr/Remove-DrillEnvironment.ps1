# ============================================================
# Remove-DrillEnvironment.ps1 — 停止/销毁演练环境（HITL，破坏性）
#
# 安全规则：
#   - 只接受 <repo>/.drill 下的演练工作区；主项目 tiangong-kaiwu 一律拒绝。
#   - 默认只 stop（docker compose down，保留卷），不删除数据。
#   - -DeleteVolumes 才会执行 down -v；必须显式 -ConfirmProject <演练项目名>。
#   - -WhatIf 只打印计划，不执行任何 Docker 命令。
#
# 用法：
#   powershell -File scripts/dr/Remove-DrillEnvironment.ps1 `
#     -Workspace .drill/drill-20261124-01 -WhatIf
#   powershell -File scripts/dr/Remove-DrillEnvironment.ps1 `
#     -Workspace .drill/drill-20261124-01
#   powershell -File scripts/dr/Remove-DrillEnvironment.ps1 `
#     -Workspace .drill/drill-20261124-01 -DeleteVolumes `
#     -ConfirmProject tiangong-kaiwu-drill
# ============================================================
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Workspace,

    [switch]$DeleteVolumes,

    [switch]$DeleteWorkspace,

    # HITL 闸门：必须逐字等于演练项目名（不是主项目名）。
    [string]$ConfirmProject,

    [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

if ($ConfirmProject -eq 'tiangong-kaiwu') {
    Write-Host '拒绝：绝不能对主项目 tiangong-kaiwu 执行清理。' -ForegroundColor Red
    exit 3
}
if ($ConfirmProject -and $ConfirmProject -notmatch '^tiangong-kaiwu-drill(-[a-z0-9][a-z0-9-]{0,30})?$') {
    Write-Host "拒绝：确认的项目名不是演练项目：$ConfirmProject" -ForegroundColor Red
    exit 3
}

if ($DeleteVolumes -and -not $ConfirmProject) {
    Write-Host '拒绝：-DeleteVolumes 必须同时提供 -ConfirmProject <演练项目名>（HITL）。' -ForegroundColor Red
    exit 3
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host '找不到 node；演练运行器需要 Node.js >= 20。' -ForegroundColor Red
    exit 1
}

$runner = Join-Path $PSScriptRoot 'drill-runner.mjs'

if ($WhatIf) {
    Write-Host 'WhatIf 计划（不执行 Docker）：' -ForegroundColor Cyan
    Write-Host "  工作区：$Workspace"
    if ($DeleteVolumes) {
        Write-Host "  docker compose -p <演练项目> down -v  （需要 -ConfirmProject）"
        Write-Host "  删除卷：只限该演练项目的 pgdata/redis-data/azurite-data"
    } else {
        Write-Host '  docker compose -p <演练项目> down      （保留卷）'
    }
    if ($DeleteWorkspace) { Write-Host '  删除演练工作区目录（证据需先复制到私有证据库）' }
    exit 0
}

if ($DeleteVolumes) {
    $teardownArgs = @($runner, 'teardown', '--workspace', $Workspace, '--confirm-project', $ConfirmProject)
    if ($DeleteWorkspace) { $teardownArgs += '--delete-workspace' }
    & node @teardownArgs
    exit $LASTEXITCODE
}

Write-Host '停止演练栈（保留卷；不删除任何数据）...' -ForegroundColor Cyan
& node $runner 'down' '--workspace' $Workspace
exit $LASTEXITCODE
