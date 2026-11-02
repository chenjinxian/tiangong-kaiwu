# 发布门自动化（2026-11-01，任务 5）
#
# 校验：产物 SHA256 / 产物 provenance / MS 限流姿态 / web·hub 镜像标签，
# 并默认串联 verify-stack.ps1（17/17 权威验收）。
#
# 用法：
#   powershell -File scripts/release-gate.ps1 -ExpectedSha256 <sha256>
#   powershell -File scripts/release-gate.ps1 -AllowStoreFallback -SkipVerifyStack
#
# 退出码：0=通过；1=存在 FAIL。WARN 不阻断，但必须写入发布记录。

[CmdletBinding()]
param(
    [string]$ExpectedSha256,
    [switch]$AllowStoreFallback,
    [switch]$AllowRateLimitOverride,
    [switch]$SkipVerifyStack
)

$ErrorActionPreference = 'Continue'
$Root = Split-Path -Parent $PSScriptRoot
$script:FailCount = 0
$script:WarnCount = 0

function Pass([string]$Message) {
    Write-Host "[OK]   $Message" -ForegroundColor Green
}

function Warn([string]$Message) {
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
    $script:WarnCount++
}

function Fail([string]$Message) {
    Write-Host "[FAIL] $Message" -ForegroundColor Red
    $script:FailCount++
}

Write-Host '== Release gate ==' -ForegroundColor Cyan

# --- 1. 产物 SHA256 -------------------------------------------------------
$artifacts = @(
    Get-ChildItem -Path (Join-Path $Root 'dist-backend') -Filter 'modeling-server-win-x64-*.tgz' `
        -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending
)
if ($artifacts.Count -eq 0) {
    Warn '未找到 dist-backend\modeling-server-win-x64-*.tgz（跳过 hash 检查）'
} else {
    $artifact = $artifacts[0]
    $hash = (Get-FileHash -Algorithm SHA256 -Path $artifact.FullName).Hash.ToLowerInvariant()
    Write-Host "artifact: $($artifact.Name) ($($artifact.Length) B)"
    Write-Host "sha256:   $hash"
    if ([string]::IsNullOrWhiteSpace($ExpectedSha256)) {
        Warn '未提供 -ExpectedSha256；发布门应提供 Release asset digest'
    } else {
        $expected = ($ExpectedSha256.ToLowerInvariant() -replace '^sha256:', '')
        if ($hash -eq $expected) {
            Pass '产物 SHA256 与期望一致'
        } else {
            Fail "产物 SHA256 不匹配（期望 $expected）"
        }
    }
}

# --- 2. 产物 provenance ---------------------------------------------------
$provPath = Join-Path $Root 'dist-backend\modeling-server\node_modules\@bentley\imodeljs-native\native-provenance.json'
if (-not (Test-Path $provPath)) {
    Fail "产物 provenance 缺失: $provPath"
} else {
    $prov = Get-Content -Raw -Path $provPath | ConvertFrom-Json
    Write-Host "provenance: version=$($prov.nativeVersion) head=$($prov.imodelNativeHead) fallback=$($prov.fallbackRequired) freshness=$($prov.freshness)"
    if ($prov.fallbackRequired -eq $true) {
        if ($AllowStoreFallback) {
            Warn '产物使用后备来源（已显式放行；发布记录须写明 provenance）'
        } else {
            Fail '产物使用后备来源；干净发布应从私有依赖源重建（或显式 -AllowStoreFallback）'
        }
    } else {
        Pass '产物 provenance 非 fallback'
    }
}

# --- 3. 限流姿态 ----------------------------------------------------------
$msLog = Join-Path $env:TEMP 'luban-cad-modeling-server.log'
if (-not (Test-Path $msLog)) {
    Warn "MS 日志不存在: $msLog（跳过限流检查）"
} else {
    # 启动行会被大量 webhook/e2e 日志淹没——全文件流式扫描取最后一次出现。
    $line = Select-String -Path $msLog -Pattern 'RPC rate limit:' | Select-Object -Last 1
    if (-not $line) {
        Warn 'MS 日志未找到 RPC rate limit 行'
    } else {
        Write-Host "rate:    $($line.Line.Trim())"
        if ($line.Line -match 'env override') {
            if ($AllowRateLimitOverride) {
                Warn '限流为测试 env override（已显式放行；跑后须恢复生产默认）'
            } else {
                Fail '限流为测试 env override；发布前须恢复生产默认（或显式 -AllowRateLimitOverride）'
            }
        } elseif ($line.Line -match 'production default') {
            Pass '限流为生产默认'
        } else {
            Warn '限流模式未知（日志行无法识别）'
        }
    }
}

# --- 4. 镜像标签 ----------------------------------------------------------
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Fail '未找到 docker CLI'
} else {
    # 用 {{json .Config.Labels}} 而非 {{index ... "key.with.dots"}}：PowerShell
    # 向原生 exe 传参时会剥掉内层双引号，Go template 把 org 当函数名（exit 64）。
    $webJson = docker inspect tiangong-kaiwu-web-1 --format '{{json .Config.Labels}}' 2>$null
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($webJson)) {
        Fail 'web 容器不存在或 docker inspect 失败'
    } else {
        $webLabels = $webJson | ConvertFrom-Json
        $webRev = $webLabels.'org.opencontainers.image.revision'
        $webB = $webLabels.'org.opencontainers.image.b-model-enabled'
        Write-Host "web:     revision=$webRev b-model-enabled=$webB"
        if ($webB -eq 'true') {
            Pass 'web b-model-enabled=true'
        } else {
            Fail 'web b-model-enabled != true'
        }
        if (-not [string]::IsNullOrWhiteSpace($webRev)) {
            Pass 'web revision 可见（陈旧比对由 verify-stack Step E 负责）'
        } else {
            Fail 'web revision 缺失'
        }
    }

    $hubJson = docker inspect tiangong-kaiwu-imodelhub-1 --format '{{json .Config.Labels}}' 2>$null
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($hubJson)) {
        Fail 'hub 容器不存在或 docker inspect 失败'
    } else {
        $hubLabels = $hubJson | ConvertFrom-Json
        $hubRev = $hubLabels.'org.opencontainers.image.revision'
        Write-Host "hub:     revision=$hubRev"
        Pass 'hub revision 可见（陈旧比对/挂载检查由 verify-stack Step F 负责）'
    }
}

# --- 5. verify-stack ------------------------------------------------------
$verifyStack = Join-Path $PSScriptRoot 'verify-stack.ps1'
if ($SkipVerifyStack) {
    Warn '已跳过 verify-stack（发布门不应默认跳过）'
} elseif (-not (Test-Path $verifyStack)) {
    Fail "verify-stack.ps1 缺失: $verifyStack"
} else {
    & powershell -NoProfile -ExecutionPolicy Bypass -File $verifyStack
    if ($LASTEXITCODE -eq 0) {
        Pass 'verify-stack 17/17'
    } else {
        Fail "verify-stack 失败（exit $LASTEXITCODE）"
    }
}

Write-Host ''
Write-Host "结果: FAIL=$script:FailCount WARN=$script:WarnCount" -ForegroundColor Cyan
if ($script:FailCount -gt 0) {
    exit 1
}
exit 0
