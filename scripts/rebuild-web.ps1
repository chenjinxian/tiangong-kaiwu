# ============================================================
# rebuild-web.ps1 — 重建 compose web 镜像（本仓 build = luban-cad/apps/web）
#
# 背景（B2，2026-10-26 实证缺口）：根 docker-compose.yml 的 web 服务是
# **本仓 build**（构建上下文=仓库根），不是 GHCR 拉取——后端发布流水线
# （fetch-backend.ps1 的 Releases tgz + docker compose pull）不更新它。
# 没人重建时镜像停在旧源（当日实测：镜像停 10-23、源已到 10-26；e2e 全绿
# 是因为 e2e 跑 :5300 vite dev 源，永远看不到镜像陈旧）。C2 退役
# （旧 apps/web 删除、新 web 迁 :5300）后此缺口影响放大。本脚本一条命令补齐：
#
# 用法:
#   powershell -File scripts/rebuild-web.ps1                              # 带缓存增量重建（产品缺省 = B flag off）
#   powershell -File scripts/rebuild-web.ps1 -NoCache                     # 全量无缓存重建
#   powershell -File scripts/rebuild-web.ps1 -BModelEnabled true          # P2 rollout：B 双区 UI 开
#   powershell -File scripts/rebuild-web.ps1 -BModelEnabled false         # P2 rollback：回 A UI，B 数据保留
#   powershell -File scripts/rebuild-web.ps1 -BModelEnabled true -E2EHooks true  # E2E 测试镜像（挂 window.__lubanE2E；发布镜像勿用）
#   powershell -File scripts/rebuild-web.ps1 -ReleaseTag <不可变 tag|sha256:64hex>  # 本地构建 + 打发布 tag（不自动 push）
#   powershell -File scripts/rebuild-web.ps1 -PlanOnly -ReleaseTag <...>  # 只校验参数/打印计划，不调用 docker
#
# 镜像引用口径:
#   - `-LocalTag` 是**本地开发兼容别名**（tiangong-kaiwu-web:<LocalTag>），缺省
#     latest，仅供 verify-stack/本地回滚 inspect；它不是发布引用。
#   - 发布推送必须显式传 `-ReleaseTag`（不可变 tag 或 sha256:<64 hex> digest），
#     `latest` 会被拒绝；tag/digest 必须由 release owner 决定并写入
#     release-manifest.json。本脚本只准备本地 tag 并打印 push 命令，不自动 push。
#
# B-model 开关（P2 D9 / P2.7）：`VITE_B_MODEL_ENABLED` 是**构建期** Vite 变量，
# 静态 web 无运行期 env——切换必须重建镜像，不存在「只重启容器换 flag」的路径。
# 产品代码缺省关（`useBModelEnabled` 只认 'true'），本脚本缺省也不传 true：
# rollout/rollback 均须显式裁决，不允许把开关混入通用重建。
#
# 说明:
#   - 只 build 不 up：在跑的 web 容器不受影响；新镜像生效需随后
#     `docker compose up -d web`（nginx 依赖 web healthy，会自动跟上）。
#   - 构建上下文 = 本脚本所在仓库根（.dockerignore 白名单裁剪；web 经
#     pnpm link: 消费 itwinjs-core 源码 + 宿主 rush 产物 lib/——改了
#     itwinjs-core 后须先 rush build 再跑本脚本，lib/ 是构建输入）。
#   - 构建时注入 GIT_COMMIT 构建参数 → 镜像 OCI 标签
#     org.opencontainers.image.revision（verify-stack.ps1 Step E 陈旧检测
#     消费）。注入值 = **最新 web 源提交**（W1-I5：`luban-cad` + `itwinjs-core`
#     两个整目录——Dockerfile 复制整个 luban-cad/，并消费其 pnpm-lock.yaml /
#     package.json / pnpm-workspace.yaml / docker-closure.cjs，只盯
#     apps/web + packages 会漏构建输入），不是仓库 HEAD——docs/scripts 等
#     非 web 提交不会把镜像判旧（2026-10-27 口径修正）；手工
#     `docker compose build web` 未注入时标签为 unknown，此时检测退化为
#     「镜像 Created 时间 vs 最新 web 源提交时间」比较。
#   - fetch-backend.ps1 -RebuildWeb 可在拉取后端产物后联动执行本脚本。
# ============================================================
[CmdletBinding()]
param(
    [switch]$NoCache,
    # 构建期 B-model 开关：'' = 产品缺省（off）；'true' = B rollout；'false' = 显式回滚。
    [ValidateSet('', 'true', 'false')]
    [string]$BModelEnabled = '',
    # 构建期 E2E 观测面开关：'' = 产品缺省关；'true' = 挂 window.__lubanE2E 的测试镜像。
    [ValidateSet('', 'true', 'false')]
    [string]$E2EHooks = '',
    # 本地兼容 tag 组件（仅本地开发别名；不是发布引用）。缺省 latest 保持
    # verify-stack/旧回滚流程按旧名 inspect 的能力。
    [string]$LocalTag = 'latest',
    # 发布引用：不可变 tag 或 sha256:<64 hex> digest；禁止 latest。留空则只做
    # 本地构建，不生成发布推送命令。
    [string]$ReleaseTag = '',
    # 只校验参数并打印计划；不检查 docker/构建上下文，不做任何构建或打 tag。
    [switch]$PlanOnly
)
$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$ReleaseRepo = 'ghcr.io/chenjinxian/luban-web-public'

function Assert-TagComponent {
    param([string]$Value, [string]$Name)
    if ([string]::IsNullOrWhiteSpace($Value)) { throw "$Name 不能为空" }
    if ($Value.Length -gt 128 -or $Value -notmatch '^[A-Za-z0-9_][A-Za-z0-9._-]*$') {
        throw "$Name 只能是不含 ':'、'/'、'@' 的 tag 组件（1-128 位 [A-Za-z0-9._-]）: $Value"
    }
}

function Resolve-ReleaseRef {
    param([string]$Value, [string]$Repo)
    if ([string]::IsNullOrWhiteSpace($Value)) { return '' }
    if ($Value -match '^sha256:[0-9a-fA-F]{64}$') { return "$Repo@$Value" }
    if ($Value -ieq 'latest') {
        throw '-ReleaseTag 不允许 latest —— 发布必须使用不可变 tag 或 sha256:<64 hex> digest'
    }
    Assert-TagComponent -Value $Value -Name '-ReleaseTag'
    return "${Repo}:$Value"
}

Assert-TagComponent -Value $LocalTag -Name '-LocalTag'
$LocalImage = "tiangong-kaiwu-web:$LocalTag"
$ReleaseRef = Resolve-ReleaseRef -Value $ReleaseTag -Repo $ReleaseRepo
$ReleaseIsDigest = $ReleaseTag -match '^sha256:[0-9a-fA-F]{64}$'

if ($PlanOnly) {
    Write-Host "plan: local compat tag = $LocalImage"
    if ($ReleaseRef) {
        Write-Host "plan: release ref = $ReleaseRef（tag 形态会本地打 tag；digest 形态只打印引用）"
    } else {
        Write-Host 'plan: 未提供 -ReleaseTag；不会生成发布推送命令'
    }
    return
}

# --- 前置检查（防呆优先于半路炸）---
# Docker Desktop 装后需重启终端才入 PATH；从 ProgramFiles 派生，不硬编码宿主盘符
$dockerBin = if ($env:ProgramFiles) { Join-Path $env:ProgramFiles 'Docker\Docker\resources\bin' } else { $null }
if ($dockerBin -and (Test-Path $dockerBin)) { $env:PATH = "$dockerBin;$env:PATH" }
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'docker 不在 PATH —— 先启动 Docker Desktop（或重开终端让 PATH 生效）'
}
$dockerfile = Join-Path $RepoRoot 'luban-cad\apps\web\Dockerfile'
if (-not (Test-Path $dockerfile)) {
    throw "web Dockerfile 不存在: $dockerfile —— 本脚本只适用于含 apps/web 的检出"
}
# 构建上下文硬输入：itwinjs-core 宿主 rush 产物 lib/（worker 字节断言的比对源）。
# worktree/浅检出常无 lib/（git 不跟踪构建产物）——提前给出可操作报错，别等
# Dockerfile 里的 cmp 断言半路炸。
$workerSrc = Join-Path $RepoRoot 'itwinjs-core\core\frontend\lib\public\scripts\parse-imdl-worker.js'
if (-not (Test-Path $workerSrc)) {
    throw "构建上下文缺少 itwinjs-core 宿主 rush 产物 lib/（$workerSrc 不存在）——请在完整检出的仓库根执行；若刚改过 itwinjs-core，先 node common/scripts/install-run-rush.js build --to @itwin/core-frontend"
}
# 快照自愈（终审 N1）：既有 Windows 检出可能仍留着 CRLF 版快照（Git 不会因
# .gitattributes 自动重写未变更的文件），Dockerfile 的 cmp 字节断言会在构建
# 中途失败。构建前按 lib 源做一次哈希比对，不一致就重拷——构建输入恒与
# 宿主 rush 产物逐字节一致；重拷后如产生真实内容差异，git status 会显示，
# 由维护者决定是否提交。
$workerSnapshot = Join-Path $RepoRoot 'luban-cad\apps\web\public\scripts\parse-imdl-worker.js'
$snapshotHash = if (Test-Path $workerSnapshot) { (Get-FileHash -LiteralPath $workerSnapshot -Algorithm SHA256).Hash } else { '' }
if ($snapshotHash -ne (Get-FileHash -LiteralPath $workerSrc -Algorithm SHA256).Hash) {
    Copy-Item -LiteralPath $workerSrc -Destination $workerSnapshot -Force
    Write-Host '==> 已从 itwinjs-core lib 重拷 parse-imdl-worker.js 快照（字节对齐）' -ForegroundColor Yellow
}

# --- 注入源版本（OCI 标签 org.opencontainers.image.revision）---
$gitSha = 'unknown'
try {
    # 与 verify-stack Step E 同口径：最新 web 源提交（W1-I5：luban-cad +
    # itwinjs-core 两个整目录，均为镜像构建输入；非仓库 HEAD）
    $gitSha = [string](& git -C $RepoRoot log -1 --format='%H' -- luban-cad itwinjs-core 2>$null)
} catch { }
if (-not $gitSha -or $LASTEXITCODE -ne 0) { $gitSha = 'unknown' }
$shaShort = if ($gitSha.Length -ge 12) { $gitSha.Substring(0, 12) } else { $gitSha }

# --build-arg 需 compose v2.6+；旧版优雅降级（不注入，标签留 Dockerfile 缺省 unknown）
$canBuildArg = (& docker compose build --help | Out-String) -match '--build-arg'
if (-not $canBuildArg -and ($BModelEnabled -ne '' -or $E2EHooks -ne '')) {
    throw "compose 过旧（不支持 --build-arg）——无法注入 VITE_B_MODEL_ENABLED / VITE_E2E_HOOKS；拒绝静默退回"
}

$flagLabel = if ($BModelEnabled -eq '') { 'unset（产品缺省关）' } else { $BModelEnabled }
$e2eLabel = if ($E2EHooks -eq '') { 'unset（关闭）' } else { $E2EHooks }
Write-Host "==> docker compose build web（GIT_COMMIT=$shaShort；VITE_B_MODEL_ENABLED=$flagLabel；VITE_E2E_HOOKS=$e2eLabel$(if (-not $canBuildArg) { '；compose 过旧不注入标签/开关' })）..." -ForegroundColor Cyan
$composeArgs = @('compose', 'build')
if ($NoCache) { $composeArgs += '--no-cache' }
if ($canBuildArg) {
    if ($gitSha -ne 'unknown') { $composeArgs += @('--build-arg', "GIT_COMMIT=$gitSha") }
    $composeArgs += @('--build-arg', "VITE_B_MODEL_ENABLED=$BModelEnabled")
    $composeArgs += @('--build-arg', "VITE_E2E_HOOKS=$E2EHooks")
}
$composeArgs += 'web'

Push-Location $RepoRoot
try {
    & docker @composeArgs
    if ($LASTEXITCODE -ne 0) { throw "docker compose build web 失败（exit $LASTEXITCODE）—— 上方为构建日志（worker 字节断言失败时按其提示重拷 public/scripts/ 快照）" }
} finally { Pop-Location }

# 2026-11-06：compose 的 web 服务新增公开 image 名（ghcr.io/.../luban-web-public），
# 本脚本 build 后由 compose 以该名打 tag；同步补本地兼容别名
# tiangong-kaiwu-web:<LocalTag>（缺省 latest，仅本地开发/回滚 inspect 使用），
# 供 verify-stack Step E 与既有回滚流程继续按旧名 inspect。发布引用由
# -ReleaseTag 显式提供，见文件头。
$composeImage = [string](@(& docker compose config --images web 2>$null)[0]).Trim()
if ($composeImage -and $composeImage -ne $LocalImage) {
    docker tag $composeImage $LocalImage
    if ($LASTEXITCODE -ne 0) { throw "docker tag $composeImage → $LocalImage 失败" }
    Write-Host "==> 已补本地兼容 tag: $LocalImage → $composeImage" -ForegroundColor DarkGray
}

# 发布 tag 准备：只有显式 -ReleaseTag 才打发布引用；digest 形态不能由 docker tag
# 生成（digest 来自 registry push 结果），只打印待记录的引用。
if ($ReleaseRef -and -not $ReleaseIsDigest -and $composeImage -and $composeImage -ne $ReleaseRef) {
    docker tag $composeImage $ReleaseRef
    if ($LASTEXITCODE -ne 0) { throw "docker tag $composeImage → $ReleaseRef 失败" }
    Write-Host "==> 已打发布 tag: $ReleaseRef ← $composeImage" -ForegroundColor DarkGray
}

# 构建标签自证（P2.7）：镜像 LABEL 必须与请求的 flag 一致，否则发布记录/回滚会读错开关。
$imgJson = (& docker image inspect $LocalImage 2>$null) -join "`n"
$actualFlag = $null
$actualE2E = $null
if ($imgJson) {
    try { $actualFlag = [string](@(ConvertFrom-Json $imgJson)[0].Config.Labels.'org.opencontainers.image.b-model-enabled') } catch { }
    try { $actualE2E = [string](@(ConvertFrom-Json $imgJson)[0].Config.Labels.'org.opencontainers.image.e2e-hooks') } catch { }
}
if ($null -ne $actualFlag -and $actualFlag -ne $BModelEnabled) {
    Write-Warning "镜像 LABEL org.opencontainers.image.b-model-enabled='$actualFlag' ≠ 请求 '$BModelEnabled'（镜像可能被并发构建覆盖）"
} elseif ($null -ne $actualFlag) {
    Write-Host "==> 镜像 B-model 开关 LABEL 自证: '$actualFlag'" -ForegroundColor Green
}
if ($null -ne $actualE2E -and $actualE2E -ne $E2EHooks) {
    Write-Warning "镜像 LABEL org.opencontainers.image.e2e-hooks='$actualE2E' ≠ 请求 '$E2EHooks'（镜像可能被并发构建覆盖）"
} elseif ($null -ne $actualE2E) {
    Write-Host "==> 镜像 E2E hooks LABEL 自证: '$actualE2E'" -ForegroundColor Green
}

Write-Host "==> 完成: web 镜像已重建（GIT_COMMIT=$shaShort；VITE_B_MODEL_ENABLED=$flagLabel；VITE_E2E_HOOKS=$e2eLabel$(if ($canBuildArg) { '' } else { '；compose 过旧未注入标签/开关' })）。" -ForegroundColor Green
Write-Host '    在跑的 web 容器未动——新镜像生效: docker compose up -d web'
Write-Host '    回滚: 以 -BModelEnabled false 重建并 docker compose up -d web（B 数据保留，A UI 不变）'
if ($ReleaseRef) {
    Write-Host "    公开发布（release owner）: docker push $ReleaseRef（首次需把包设为 Public；registry digest 必须写入 release-manifest.json）"
    if ($ReleaseIsDigest) {
        Write-Host '    注: -ReleaseTag 为 digest 形态，未在本地打 tag；digest 应来自 registry push 输出。'
    }
} else {
    Write-Host '    公开发布（release owner）: 传 -ReleaseTag <不可变 tag 或 sha256:<64 hex>；本脚本不自动推送，也不生成浮动标签。'
}
Write-Host '    验收: powershell -File scripts/verify-stack.ps1（Step E 报告镜像陈旧态）'
