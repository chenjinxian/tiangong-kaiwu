# ============================================================
# stop-ms-host.ps1 — 停止宿主形态 modeling-server
#
# 优先级：
#   1) start-ms-host.ps1 -Detach 写入的 PID 文件（%TEMP%\luban-cad-modeling-server.pid）
#   2) 端口反查：根 .env 的 PORT（默认 5401）监听进程
# 安全：只停止 node.exe，且（未加 -Force 时）命令行必须像本仓的 modeling-server
#      （含 dist-backend\modeling-server 或 luban-backend\modeling-server），
#      避免误杀其他 node 进程（编辑器、dev server 等）。
#
# 用法: powershell -File scripts/stop-ms-host.ps1 [-Force]
# ============================================================
[CmdletBinding()]
param([switch]$Force)
$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$MsPort = 5401
$envFile = Join-Path $RepoRoot '.env'
if (Test-Path $envFile) {
  foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*PORT\s*=\s*(\d+)\s*$') { $MsPort = [int]$Matches[1]; break }
  }
}

function Test-IsModelingServer {
  param([int]$ProcessId)
  $p = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction SilentlyContinue
  if (-not $p -or $p.Name -ne 'node.exe') { return $false }
  if ($Force) { return $true }
  $cmd = [string]$p.CommandLine
  # 产物模式：Start-Process 以 WorkingDirectory=dist-backend\modeling-server 启动
  # `node dist\main.js`，命令行本身不含 modeling-server 路径；源码模式 tsx
  # 命令行含私有仓 modeling-server 绝对路径。
  return ($cmd -match 'dist-backend\\modeling-server' -or
          $cmd -match 'luban-backend\\modeling-server' -or
          $cmd -match 'modeling-server\\dist\\main\.js' -or
          $cmd -match '(^|\s|")dist\\main\.js(\s|"|$)')
}

function Stop-ModelingServer {
  param([int]$ProcessId, [string]$Source)
  if (-not (Test-IsModelingServer -ProcessId $ProcessId)) {
    Write-Host "PID $ProcessId 不是 modeling-server node 进程（来源: $Source）；未停止。确需强制请加 -Force" -ForegroundColor Yellow
    return $false
  }
  Stop-Process -Id $ProcessId -Force
  Write-Host "已停止 modeling-server（PID $ProcessId，来源: $Source）" -ForegroundColor Green
  return $true
}

$stopped = $false
$pidFile = Join-Path $env:TEMP 'luban-cad-modeling-server.pid'
if (Test-Path $pidFile) {
  $procId = 0
  if ([int]::TryParse((Get-Content -Raw $pidFile).Trim(), [ref]$procId) -and $procId -gt 0) {
    if (Get-Process -Id $procId -ErrorAction SilentlyContinue) {
      $stopped = Stop-ModelingServer -ProcessId $procId -Source 'PID 文件'
    }
  }
  Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}

if (-not $stopped) {
  $listener = Get-NetTCPConnection -State Listen -LocalPort $MsPort -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($listener) {
    $stopped = Stop-ModelingServer -ProcessId ([int]$listener.OwningProcess) -Source "端口 $MsPort"
  }
}

if (-not $stopped) {
  Write-Host "端口 $MsPort 上没有运行中的 modeling-server" -ForegroundColor DarkGray
}
