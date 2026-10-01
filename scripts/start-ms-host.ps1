# ============================================================
# start-ms-host.ps1 — 宿主形态启动 modeling-server（预裁决回退形态）
#
# 形态裁决：MS 以宿主进程运行 :4001（容器化不可行：link: 依赖 +
# 本地编译 imodeljs 原生库不可入 Linux 容器）。根 compose 的 nginx/WA
# 经 host.docker.internal:4001 访问本进程。
#
# 双模式（后端私有化 2026-10-01：MS 源码在私有仓 luban-backend）：
#   产物模式（默认）：跑 dist-backend\modeling-server 预构建产物
#     （scripts/fetch-backend.ps1 从 Releases 拉取），零 install/build，
#     node 直启 dist\main.js。
#   源码模式（-Source <私有仓>\modeling-server）：私有仓检出者专用，
#     保留 install/build/start 全流程（corepack pnpm@10）。
#
# 用法:
#   powershell -File scripts/start-ms-host.ps1              # 产物模式，前台 node dist
#   powershell -File scripts/start-ms-host.ps1 -Detach      # 产物模式，后台 + 日志文件
#   powershell -File scripts/start-ms-host.ps1 -Mode prod -Source D:\Github\luban-backend\modeling-server
# 配置: 仓库根 .env（缺失时 scripts/generate-env.ps1 生成；MS 对缺失
#       密钥自身 fail-fast，本脚本只做前置检查与提示）。
# ============================================================
[CmdletBinding()]
param(
    [ValidateSet('dev', 'prod')]
    [string]$Mode = 'dev',
    [switch]$Detach,
    [string]$Source = ''
)
$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$EnvFile  = Join-Path $RepoRoot '.env'
$LogFile  = Join-Path $env:TEMP 'luban-cad-modeling-server.log'

# --- 0. 形态分流（产物模式 = 默认；源码模式 = -Source 指私有仓检出）---
if ($Source) {
    # 源码模式：$MsDir 即私有仓 modeling-server 检出根
    $MsDir = $Source
    if (-not (Test-Path (Join-Path $MsDir 'package.json'))) {
        throw "源码模式目录无效: $MsDir（缺 package.json）——应指向 luban-backend 的 modeling-server 检出根"
    }
} else {
    # 产物模式（默认）：dist-backend\modeling-server，零 install/build
    $MsDir = Join-Path $RepoRoot 'dist-backend\modeling-server'
    if (-not (Test-Path (Join-Path $MsDir 'dist\main.js'))) {
        throw "产物未就绪: $MsDir — 先跑 powershell -File scripts\fetch-backend.ps1（或 -Source 指私有仓 modeling-server 走源码模式）"
    }
}

# --- 1. 根 .env 前置检查（密钥完整性由 MS config.ts 自身 fail-fast）---
if (-not (Test-Path $EnvFile)) {
    Write-Host "缺仓库根 .env：先运行 powershell -File scripts/generate-env.ps1" -ForegroundColor Red
    exit 1
}

# --- 2. 启动 ---
if (-not $Source) {
    # 产物模式：跳过 install/build，node 直启预构建 dist（不依赖 corepack/pnpm）
    if ($Mode -eq 'dev') {
        Write-Host "（产物模式忽略 -Mode dev：产物即构建结果，node 直启 dist）" -ForegroundColor DarkGray
    }
    Write-Host "modeling-server（产物，宿主形态）启动中 ... 端口 4001" -ForegroundColor Cyan
    if ($Detach) {
        Start-Process -FilePath 'node' -ArgumentList 'dist\main.js' `
            -WorkingDirectory $MsDir -WindowStyle Hidden `
            -RedirectStandardOutput $LogFile -RedirectStandardError "$LogFile.err"
        Write-Host "已后台启动，日志: $LogFile"
    } else {
        Push-Location $MsDir
        try { node '.\dist\main.js' } finally { Pop-Location }
    }
} else {
    # 源码模式：install/build/start 全流程（私有仓检出）
    if (-not (Test-Path (Join-Path $MsDir 'node_modules'))) {
        Write-Host "modeling-server 依赖未安装，执行 corepack pnpm@10 install ..." -ForegroundColor Yellow
        Push-Location $MsDir
        $env:CI = 'true'
        corepack pnpm@10 install
        Pop-Location
    }

    $argList = if ($Mode -eq 'prod') {
        if (-not (Test-Path (Join-Path $MsDir 'dist/main.js'))) {
            Push-Location $MsDir
            try {
                corepack pnpm@10 run build
                # PS5.1 不会因原生命令非零退出码自动中止：构建失败必须显式停（勿带坏产物启动）
                if ($LASTEXITCODE -ne 0) { Write-Error 'modeling-server build failed'; exit 1 }
            } finally { Pop-Location }
        }
        @('run', 'start')
    } else {
        @('run', 'dev')
    }

    Write-Host "modeling-server（$Mode，源码模式）启动中 ... 端口 4001" -ForegroundColor Cyan
    if ($Detach) {
        Start-Process -FilePath 'corepack' -ArgumentList (@('pnpm@10') + $argList) `
            -WorkingDirectory $MsDir -WindowStyle Hidden `
            -RedirectStandardOutput $LogFile -RedirectStandardError "$LogFile.err"
        Write-Host "已后台启动，日志: $LogFile"
    } else {
        Push-Location $MsDir
        try { corepack pnpm@10 @argList } finally { Pop-Location }
    }
}

# --- 3. 健康等待（Detach 模式；前台模式由用户自行观察输出）---
if ($Detach) {
    $ok = $false
    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Seconds 2
        try {
            $r = Invoke-WebRequest -Uri 'http://127.0.0.1:4001/health' -UseBasicParsing -TimeoutSec 2
            if ($r.StatusCode -eq 200) { $ok = $true; break }
        } catch { }
    }
    if ($ok) {
        Write-Host "modeling-server 健康: http://127.0.0.1:4001/health (200)" -ForegroundColor Green
    } else {
        Write-Host "60 秒内 /health 未就绪，查看日志: $LogFile" -ForegroundColor Red
        exit 1
    }
}
