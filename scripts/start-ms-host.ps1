# ============================================================
# start-ms-host.ps1 — 宿主形态启动 modeling-server（预裁决回退形态）
#
# Task 3（T1.4+T2.4 部署链统一）的形态裁决：modeling-server 默认以
# 宿主进程运行（link: 依赖 itwinjs-core 本地 rush 产物 + 本地编译的
# imodeljs-win32-x64 dev build，容器化回退为 --profile container 实验
# 形态）。根 compose 的 nginx/WA 经 host.docker.internal:4001 访问本进程。
#
# 用法:
#   powershell -File scripts/start-ms-host.ps1              # 前台 dev（tsx watch）
#   powershell -File scripts/start-ms-host.ps1 -Mode prod   # 构建 + node dist
#   powershell -File scripts/start-ms-host.ps1 -Detach      # 后台 + 日志文件
# 配置: 仓库根 .env（缺失时 scripts/generate-env.ps1 生成；MS 对缺失
#       密钥自身 fail-fast，本脚本只做前置检查与提示）。
# ============================================================
[CmdletBinding()]
param(
    [ValidateSet('dev', 'prod')]
    [string]$Mode = 'dev',
    [switch]$Detach
)
$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$MsDir    = Join-Path $RepoRoot 'modeling-server'
$EnvFile  = Join-Path $RepoRoot '.env'
$LogFile  = Join-Path $env:TEMP 'luban-cad-modeling-server.log'

# --- 1. 根 .env 前置检查（密钥完整性由 MS config.ts 自身 fail-fast）---
if (-not (Test-Path $EnvFile)) {
    Write-Host "缺仓库根 .env：先运行 powershell -File scripts/generate-env.ps1" -ForegroundColor Red
    exit 1
}

# --- 2. 依赖就位检查 ---
if (-not (Test-Path (Join-Path $MsDir 'node_modules'))) {
    Write-Host "modeling-server 依赖未安装，执行 corepack pnpm@10 install ..." -ForegroundColor Yellow
    Push-Location $MsDir
    $env:CI = 'true'
    corepack pnpm@10 install
    Pop-Location
}

# --- 3. 启动 ---
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

Write-Host "modeling-server（$Mode，宿主形态）启动中 ... 端口 4001" -ForegroundColor Cyan
if ($Detach) {
    Start-Process -FilePath 'corepack' -ArgumentList (@('pnpm@10') + $argList) `
        -WorkingDirectory $MsDir -WindowStyle Hidden `
        -RedirectStandardOutput $LogFile -RedirectStandardError "$LogFile.err"
    Write-Host "已后台启动，日志: $LogFile"
} else {
    Push-Location $MsDir
    try { corepack pnpm@10 @argList } finally { Pop-Location }
}

# --- 4. 健康等待（Detach 模式；前台模式由用户自行观察输出）---
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
