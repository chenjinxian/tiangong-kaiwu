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
#   powershell -File scripts/rebuild-web.ps1               # 带缓存增量重建（常态）
#   powershell -File scripts/rebuild-web.ps1 -NoCache      # 全量无缓存重建
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
    [switch]$NoCache
)
$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot

# --- 前置检查（防呆优先于半路炸）---
$env:PATH = "C:\Program Files\Docker\Docker\resources\bin;$env:PATH"  # Docker Desktop 装后需重启终端才入 PATH；同 fetch-backend.ps1 防呆
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

Write-Host "==> docker compose build web（GIT_COMMIT=$shaShort$(if (-not $canBuildArg) { '，compose 过旧不注入标签' })）..." -ForegroundColor Cyan
$composeArgs = @('compose', 'build')
if ($NoCache) { $composeArgs += '--no-cache' }
if ($canBuildArg -and $gitSha -ne 'unknown') { $composeArgs += @('--build-arg', "GIT_COMMIT=$gitSha") }
$composeArgs += 'web'

Push-Location $RepoRoot
try {
    & docker @composeArgs
    if ($LASTEXITCODE -ne 0) { throw "docker compose build web 失败（exit $LASTEXITCODE）—— 上方为构建日志（worker 字节断言失败时按其提示重拷 public/scripts/ 快照）" }
} finally { Pop-Location }

Write-Host "==> 完成: web 镜像已重建（GIT_COMMIT=$shaShort$(if ($canBuildArg) { '' } else { '；compose 过旧未注入标签' })）。" -ForegroundColor Green
Write-Host '    在跑的 web 容器未动——新镜像生效: docker compose up -d web'
Write-Host '    验收: powershell -File scripts/verify-stack.ps1（Step E 报告镜像陈旧态）'
