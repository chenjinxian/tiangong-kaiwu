# 发布门自动化（2026-11-01，任务 5；G1 J3.1g / J3.3 扩展）
#
# 校验：release hygiene（镜像 pin/构建脚本/契约/manifest/默认密钥）→ 产物
# SHA256 → 产物 provenance → MS 限流姿态 → web·hub 镜像标签 → release
# manifest（结构 + 策略 + 文件字节）→ verify-stack.ps1。
#
# 用法：
#   powershell -File scripts/release-gate.ps1 -ExpectedSha256 <sha256>
#   powershell -File scripts/release-gate.ps1 -ExpectedSha256 <sha256> `
#     -ManifestPath release-manifest.json -VerifyManifestFiles `
#     -ExpectedSourceCommit <sha> -ExpectedTag backend-YYYYMMDD
#   powershell -File scripts/release-gate.ps1 -AllowStoreFallback -SkipVerifyStack
#
# release hygiene 以 --mode release 运行：本地 waiver 全部忽略；缺
# release-manifest.json / nativeProvenance / dist-backend 均判 FAIL。
# -ManifestPath 省略时默认 <repo>/release-manifest.json（不再 WARN 放行）。
# -VerifyManifestFiles 额外核对清单声明的 nativeProvenance/artifacts[] 实际
# 文件字节；hygiene 在 release 模式也会重算 artifact digest。镜像 registry
# digest / OCI label 仍需发布方在 registry 侧核对（本脚本不联网）。
#
# 退出码：0=通过；1=存在 FAIL。WARN 不阻断，但必须写入发布记录。

[CmdletBinding()]
param(
    [string]$ExpectedSha256,
    [switch]$AllowStoreFallback,
    [switch]$AllowRateLimitOverride,
    [switch]$SkipVerifyStack,
    [string]$ManifestPath,
    [switch]$VerifyManifestFiles,
    [string]$ExpectedSourceCommit,
    [string]$ExpectedTag
)

$ErrorActionPreference = 'Continue'
$Root = Split-Path -Parent $PSScriptRoot
$script:FailCount = 0
$script:WarnCount = 0

# Manifest 单源：显式 -ManifestPath（相对仓根）或默认 release-manifest.json。
$manifestFile = if ([string]::IsNullOrWhiteSpace($ManifestPath)) {
    Join-Path $Root 'release-manifest.json'
} elseif ([System.IO.Path]::IsPathRooted($ManifestPath)) {
    $ManifestPath
} else {
    Join-Path $Root $ManifestPath
}

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

# --- 0. release hygiene（G1 J3.3） ---------------------------------------
# release 模式忽略本地 waiver；缺 manifest/provenance/dist-backend、镜像
# :latest、构建脚本主机绝对路径/store fallback/tsc --noCheck/无锁安装、
# 源码与产物契约 skew、默认/well-known 密钥均判 FAIL。
$hygieneScript = Join-Path $PSScriptRoot 'check-release-hygiene.mjs'
if (-not (Test-Path $hygieneScript)) {
    Fail "check-release-hygiene.mjs 缺失: $hygieneScript"
} elseif (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Fail '未找到 node（release hygiene 需要 Node）'
} else {
    $hygieneArgs = @(
        $hygieneScript, '--mode', 'release', '--format', 'text',
        '--manifest', $manifestFile
    )
    if (-not [string]::IsNullOrWhiteSpace($ExpectedSourceCommit)) {
        $hygieneArgs += @('--expected-source-commit', $ExpectedSourceCommit)
    }
    if (-not [string]::IsNullOrWhiteSpace($ExpectedTag)) {
        $hygieneArgs += @('--expected-tag', $ExpectedTag)
    }
    & node @hygieneArgs
    if ($LASTEXITCODE -eq 0) {
        Pass 'release hygiene 通过'
    } else {
        Fail "release hygiene 失败（exit $LASTEXITCODE）"
    }
}

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

# --- 5. release manifest（G1 J3.1g / J3.3，必填） -------------------------
$manifestScript = Join-Path $PSScriptRoot 'release-manifest.mjs'
if (-not (Test-Path $manifestScript)) {
    Fail "release-manifest.mjs 缺失: $manifestScript"
} elseif (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Fail '未找到 node（release manifest 校验需要 Node）'
} elseif (-not (Test-Path $manifestFile)) {
    Fail "release manifest 缺失: $manifestFile（发布门要求 release-manifest.json）"
} else {
    $verifyArgs = @(
        $manifestScript, 'verify', '--file', $manifestFile,
        '--require-native-provenance'
    )
    if (-not [string]::IsNullOrWhiteSpace($ExpectedSourceCommit)) {
        $verifyArgs += @('--expected-source-commit', $ExpectedSourceCommit)
    }
    & node @verifyArgs
    if ($LASTEXITCODE -eq 0) {
        Pass 'release manifest 结构/策略校验通过'
    } else {
        Fail "release manifest 校验失败（exit $LASTEXITCODE）"
    }

    if ($VerifyManifestFiles) {
        & node $manifestScript verify-files --file $manifestFile --root $Root --require-native-provenance
        if ($LASTEXITCODE -eq 0) {
            Pass 'release manifest 文件字节校验通过'
        } else {
            Fail "release manifest 文件字节校验失败（exit $LASTEXITCODE）"
        }
    } else {
        Warn '未提供 -VerifyManifestFiles；release hygiene 已重算 artifact digest，但未运行 verify-files 的逐文件报告'
    }
}

# --- 6. verify-stack ------------------------------------------------------
$verifyStack = Join-Path $PSScriptRoot 'verify-stack.ps1'
if ($SkipVerifyStack) {
    Warn '已跳过 verify-stack（发布门不应默认跳过）'
} elseif (-not (Test-Path $verifyStack)) {
    Fail "verify-stack.ps1 缺失: $verifyStack"
} else {
    & powershell -NoProfile -ExecutionPolicy Bypass -File $verifyStack
    if ($LASTEXITCODE -eq 0) {
        Pass 'verify-stack 通过'
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
