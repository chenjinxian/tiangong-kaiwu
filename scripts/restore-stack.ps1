# ============================================================
# restore-stack.ps1 — G1 E1/E2 基线恢复（HITL，破坏性）
#
# 做什么：
#   1) 先校验备份目录 manifest.json 的 manifest.sha256（若存在）与每个产物的
#      大小/SHA-256；任何不一致都在写入前失败。
#   2) 检查目标栈：postgres 必须运行；azurite 必须已停止（对象卷不可在线覆盖）；
#      已有数据/仍在运行的写者需要显式 -Force。
#   3) 按 runbook 顺序恢复：先 PostgreSQL（pg_restore），再 Azurite 卷（tar 解包）。
#   4) 只打印恢复后检查项；不自动启动/重启任何容器，不自动跑 verify-stack。
#
# 用法（-Confirm 是 HITL 闸门，不是交互式提示）：
#   powershell -File scripts/restore-stack.ps1 -BackupDir <backup-dir> -Confirm
#   powershell -File scripts/restore-stack.ps1 -BackupDir <backup-dir> -Confirm -Force
#
# 硬限制：
#   - 本工具不提供 HA/PITR；只做一次时点恢复。
#   - 不恢复 Redis、briefcase 本地缓存、宿主文件或镜像。
#   - 目标 azurite 容器运行中时拒绝恢复（-Force 也不覆盖此硬阻断）。
#   - 恢复会覆盖目标 DB 对象与 Azurite 卷；先做一份新的备份，再执行。
# ============================================================
[CmdletBinding()]
param(
    [string]$BackupDir,
    [switch]$Confirm,
    [switch]$Force,
    [string]$TarImage = 'alpine:3.20'
)

$ErrorActionPreference = 'Stop'

$RepoRoot       = Split-Path -Parent $PSScriptRoot
$ComposeFile    = Join-Path $RepoRoot 'docker-compose.yml'
$EnvFile        = Join-Path $RepoRoot '.env'
$DefaultProject = 'tiangong-kaiwu'

# ------------------------------------------------------------
# 输出
# ------------------------------------------------------------
function Write-Step {
    param([string]$Message)
    Write-Host ''
    Write-Host "== $Message ==" -ForegroundColor Cyan
}
function Write-Info {
    param([string]$Message)
    Write-Host "  $Message"
}
function Write-Warn {
    param([string]$Message)
    Write-Host "  WARN: $Message" -ForegroundColor Yellow
}
function Write-Err {
    param([string]$Message)
    Write-Host "  ERROR: $Message" -ForegroundColor Red
}

function Invoke-NativeCapture {
    param([string]$FilePath, [string[]]$Arguments)
    $eap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $lines = @(& $FilePath @Arguments 2>&1 | ForEach-Object { [string]$_ })
        return [pscustomobject]@{
            ExitCode = $LASTEXITCODE
            Output   = $lines
        }
    } finally {
        $ErrorActionPreference = $eap
    }
}

function Invoke-DockerCapture {
    param([string[]]$Arguments)
    return Invoke-NativeCapture -FilePath 'docker' -Arguments $Arguments
}

function Invoke-DockerChecked {
    param([string[]]$Arguments, [string]$What)
    $r = Invoke-DockerCapture -Arguments $Arguments
    if ($r.ExitCode -ne 0) {
        $tail = @($r.Output | Select-Object -Last 12) -join ' | '
        throw "$What failed (docker exit $($r.ExitCode)): $tail"
    }
    return $r.Output
}

# ------------------------------------------------------------
# .env / compose 发现
# ------------------------------------------------------------
function Get-DotEnv {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "找不到仓库根 .env：$Path（先运行 powershell -File scripts/generate-env.ps1）"
    }
    $map = @{}
    foreach ($line in Get-Content -LiteralPath $Path) {
        if ($line -match '^\s*$' -or $line -match '^\s*#') { continue }
        if ($line -match '^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
            $key = $Matches[1]
            $raw = $Matches[2]
            if ($raw -match '^"(.*)"\s*$') {
                $val = $Matches[1]
            } elseif ($raw -match "^'(.*)'\s*$") {
                $val = $Matches[1]
            } else {
                $val = $raw
                if ($val -match '^(.*?)\s+#.*$') { $val = $Matches[1] }
                $val = $val.Trim()
            }
            $map[$key] = $val
        }
    }
    return $map
}

function Get-ComposeProjectName {
    param([hashtable]$EnvMap)
    if ($EnvMap.ContainsKey('COMPOSE_PROJECT_NAME') -and $EnvMap['COMPOSE_PROJECT_NAME']) {
        return [string]$EnvMap['COMPOSE_PROJECT_NAME']
    }
    return $DefaultProject
}

function Get-ComposeServiceContainer {
    param([string]$Service, [switch]$IncludeStopped)

    $composeArgs = @(
        'compose', '--project-name', $projectName,
        '-f', $ComposeFile, '--project-directory', $RepoRoot,
        'ps', '-q'
    )
    if ($IncludeStopped) { $composeArgs += '-a' }
    $composeArgs += $Service

    $r = Invoke-DockerCapture -Arguments $composeArgs
    if ($r.ExitCode -eq 0) {
        $id = @($r.Output | Where-Object { $_ -match '^[0-9a-f]{12,64}$' } | Select-Object -First 1)
        if ($id.Count -gt 0) { return [string]$id[0] }
    }

    $fallbackArgs = @(
        'ps', '-aq',
        '--filter', "label=com.docker.compose.project=$projectName",
        '--filter', "label=com.docker.compose.service=$Service",
        '--format', '{{.ID}}'
    )
    $r2 = Invoke-DockerCapture -Arguments $fallbackArgs
    $ids = @($r2.Output | Where-Object { $_ -match '^[0-9a-f]{12,64}$' } | Select-Object -Unique)
    if ($ids.Count -eq 1) { return [string]$ids[0] }
    if ($ids.Count -gt 1) {
        throw "compose 服务 $Service 找到多个容器，拒绝猜测目标。"
    }
    return $null
}

function Get-ContainerInfo {
    param([string]$ContainerId)
    $lines = Invoke-DockerChecked -Arguments @('inspect', $ContainerId) -What "docker inspect $ContainerId"
    $json = $lines -join "`n"
    try {
        $obj = @(ConvertFrom-Json -InputObject $json)[0]
    } catch {
        throw "解析 docker inspect JSON 失败：$ContainerId"
    }
    if (-not $obj) { throw "docker inspect 未返回对象：$ContainerId" }
    return $obj
}

function Get-AzuriteVolume {
    param($ContainerInfo)
    $mounts = @($ContainerInfo.Mounts | Where-Object { $_.Destination -eq '/data' })
    if ($mounts.Count -ne 1) {
        throw "Azurite 容器的 /data 挂载数为 $($mounts.Count)，期望恰好一个命名卷。"
    }
    $m = $mounts[0]
    if ([string]$m.Type -ne 'volume') {
        throw "Azurite /data 是 $($m.Type) 挂载，不是 Docker 命名卷；本脚本只支持命名卷。"
    }
    $name = [string]$m.Name
    if (-not $name -or $name -notmatch '^[A-Za-z0-9][A-Za-z0-9_.-]*$') {
        throw "Azurite 卷名无效或缺失：'$name'"
    }
    return $name
}

function Get-RunningServices {
    $composeArgs = @(
        'compose', '--project-name', $projectName,
        '-f', $ComposeFile, '--project-directory', $RepoRoot,
        'ps', '--services'
    )
    $r = Invoke-DockerCapture -Arguments $composeArgs
    if ($r.ExitCode -ne 0) {
        return [pscustomobject]@{ Ok = $false; Services = @() }
    }
    $svc = @($r.Output | ForEach-Object { $_.Trim() } | Where-Object { $_ } | Select-Object -Unique)
    return [pscustomobject]@{ Ok = $true; Services = $svc }
}

function Get-GitText {
    param([string[]]$GitArgs)
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) { return $null }
    $r = Invoke-NativeCapture -FilePath 'git' -Arguments (@('-C', $RepoRoot) + $GitArgs)
    if ($r.ExitCode -ne 0) { return $null }
    $text = (@($r.Output | Where-Object { $_ -ne $null }) -join "`n").Trim()
    if (-not $text) { return $null }
    return $text
}

function Show-Usage {
    Write-Host ''
    Write-Host 'restore-stack.ps1 — HITL 基线恢复（PostgreSQL + Azurite）' -ForegroundColor Cyan
    Write-Host '用法：'
    Write-Host '  powershell -File scripts/restore-stack.ps1 -BackupDir <backup-dir> -Confirm'
    Write-Host '  powershell -File scripts/restore-stack.ps1 -BackupDir <backup-dir> -Confirm -Force'
    Write-Host ''
    Write-Host '前置：'
    Write-Host '  - 先运行 scripts/verify-stack.ps1 确认当前栈可用，并对当前状态做一份新备份。'
    Write-Host '  - 停止 Azurite（硬要求）：docker compose stop azurite webhook-agent imodelhub'
    Write-Host '  - 停止宿主 modeling-server：powershell -File scripts/stop-ms-host.ps1'
    Write-Host '  - 目标已有数据、仍有写者、或宿主 MS 在跑时，必须显式加 -Force。'
    Write-Host ''
}

# ============================================================
# HITL 闸门：没有 BackupDir/Confirm 就什么都不做
# ============================================================
if (-not $BackupDir) {
    Show-Usage
    Write-Err '缺少 -BackupDir。'
    exit 2
}
if (-not $Confirm) {
    Show-Usage
    Write-Host 'HITL 闸门：恢复是破坏性操作，必须显式传 -Confirm 才会执行。' -ForegroundColor Yellow
    Write-Host "  powershell -File scripts/restore-stack.ps1 -BackupDir `"$BackupDir`" -Confirm"
    exit 2
}

# ============================================================
# 预检：先验证备份，再检查目标；任何失败都在写入前中止
# ============================================================
$preflightError = $null
try {
    Write-Step '1. 校验备份（写入前）'

    if ($TarImage -notmatch '^[A-Za-z0-9][A-Za-z0-9._/:@-]*$') {
        throw "-TarImage 不是合法的镜像引用：$TarImage"
    }

    $backupFull = [System.IO.Path]::GetFullPath($BackupDir)
    if ($backupFull.Length -gt 3 -and ($backupFull.EndsWith('\') -or $backupFull.EndsWith('/'))) {
        $backupFull = $backupFull.TrimEnd('\', '/')
    }
    if ($backupFull -match '^[A-Za-z]:[\\/]?$') {
        throw "-BackupDir 不能是盘符根目录：$backupFull"
    }
    if (-not (Test-Path -LiteralPath $backupFull -PathType Container)) {
        throw "备份目录不存在：$backupFull"
    }
    $manifestPath = Join-Path $backupFull 'manifest.json'
    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
        throw "备份目录缺少 manifest.json：$backupFull"
    }

    # 先校验 manifest 自身（若备份脚本写了 sidecar）。
    $sidecarPath = Join-Path $backupFull 'manifest.sha256'
    $manifestHash = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if (Test-Path -LiteralPath $sidecarPath -PathType Leaf) {
        $sidecarText = (Get-Content -LiteralPath $sidecarPath -Raw).Trim()
        $expectedManifestHash = @($sidecarText -split '\s+')[0].ToLowerInvariant()
        if (-not $expectedManifestHash) {
            throw 'manifest.sha256 为空。'
        }
        if ($expectedManifestHash -ne $manifestHash) {
            throw "manifest.json SHA-256 不匹配：期望 $expectedManifestHash，实际 $manifestHash"
        }
        Write-Info "manifest.json SHA-256 校验通过：$manifestHash"
    } else {
        throw "备份目录缺少 manifest.sha256（必须由 backup-stack.ps1 生成）：$backupFull"
    }

    $manifestRaw = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8
    try {
        $manifest = ConvertFrom-Json -InputObject $manifestRaw
    } catch {
        throw "manifest.json 解析失败：$($_.Exception.Message)"
    }
    if ([string]$manifest.kind -ne 'tiangong-kaiwu-baseline-backup') {
        throw "manifest.kind 不是 tiangong-kaiwu-baseline-backup：$($manifest.kind)"
    }
    if ([int]$manifest.schemaVersion -ne 1) {
        throw "不支持的 manifest.schemaVersion：$($manifest.schemaVersion)"
    }

    $artifacts = @($manifest.artifacts | Where-Object { $_ })
    if ($artifacts.Count -eq 0) {
        throw 'manifest.artifacts 为空。'
    }

    $verifiedArtifacts = @{}
    foreach ($a in $artifacts) {
        $rel = ([string]$a.path) -replace '\\', '/'
        if (-not $rel) { throw 'manifest.artifacts 中存在空 path。' }
        if ($rel -match ':') { throw "manifest 产物路径包含非法字符 ':'：$rel" }
        if ([System.IO.Path]::IsPathRooted($rel) -or $rel -match '(^|/)\.\.(/|$)') {
            throw "manifest 产物路径越界：$rel"
        }
        $full = [System.IO.Path]::GetFullPath((Join-Path $backupFull ($rel -replace '/', '\')))
        $prefix = $backupFull.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
        if (-not $full.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "manifest 产物路径越界：$rel"
        }
        if (-not (Test-Path -LiteralPath $full -PathType Leaf)) {
            throw "备份产物缺失：$rel"
        }
        $item = Get-Item -LiteralPath $full
        if ($item.Length -le 0) {
            throw "备份产物为空：$rel"
        }
        if ($null -ne $a.bytes -and [long]$a.bytes -ne $item.Length) {
            throw "产物大小不匹配：$rel（manifest=$($a.bytes)，实际=$($item.Length)）"
        }
        $expectedHash = [string]$a.sha256
        if (-not $expectedHash) {
            throw "产物缺少 SHA-256：$rel"
        }
        Write-Info "计算 SHA-256：$rel（$($item.Length) 字节）..."
        $actualHash = (Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($expectedHash.ToLowerInvariant() -ne $actualHash) {
            throw "产物 SHA-256 不匹配：$rel（manifest=$expectedHash，实际=$actualHash）"
        }
        Write-Info "OK: $rel"
        $verifiedArtifacts[$rel] = $true
    }

    foreach ($required in @('postgres.dump', 'azurite-data.tar.gz')) {
        if (-not $verifiedArtifacts.ContainsKey($required)) {
            throw "manifest 缺少必需产物：$required"
        }
    }

    $recordedOrder = @($manifest.restoreOrder | Where-Object { $_ } | ForEach-Object { [string]$_ })
    if ($recordedOrder.Count -gt 0 -and (($recordedOrder -join '|') -ne 'postgres.dump|azurite-data.tar.gz')) {
        throw "manifest.restoreOrder 不受支持：$($recordedOrder -join ', ')"
    }

    $currentCommit = Get-GitText -GitArgs @('rev-parse', 'HEAD')
    $backupCommit = if ($manifest.source) { [string]$manifest.source.commit } else { '' }
    if ($backupCommit -and $currentCommit -and $backupCommit -ne 'unknown' -and $backupCommit -ne $currentCommit) {
        Write-Warn "备份源提交 $backupCommit 与当前 HEAD $currentCommit 不同；恢复后请按发布/迁移说明核对。"
    }

    $createdText = if ($manifest.createdAtLocal) { [string]$manifest.createdAtLocal } else { [string]$manifest.createdAtUtc }
    Write-Info "备份 ID：$($manifest.backupId)"
    Write-Info "备份时间：$createdText"
    Write-Info "源提交：$backupCommit"
    if ($manifest.consistency) {
        Write-Info "备份一致性模式：$($manifest.consistency.mode)"
        if ($manifest.consistency.note) { Write-Info "一致性说明：$($manifest.consistency.note)" }
        if ($manifest.consistency.mode -eq 'online-best-effort') {
            Write-Warn '该备份为 online-best-effort：跨存储可能不一致；恢复后必须做 blob/历史链完整性检查。'
        } elseif ($manifest.consistency.mode -eq 'unknown') {
            Write-Warn '该备份的一致性模式未知；按 best-effort 对待，恢复后重点检查悬挂引用。'
        }
    }

    Write-Step '2. 检查目标栈（尚未写入）'

    $envMap = Get-DotEnv -Path $EnvFile
    $projectName = Get-ComposeProjectName -EnvMap $envMap
    if ($projectName -notmatch '^[A-Za-z0-9][A-Za-z0-9_.-]*$') {
        throw "compose 项目名无效：$projectName"
    }

    $pgUser = if ($envMap.ContainsKey('HUB_DATABASE_USERNAME') -and $envMap['HUB_DATABASE_USERNAME']) {
        [string]$envMap['HUB_DATABASE_USERNAME']
    } else { 'root' }
    $pgPassword = if ($envMap.ContainsKey('HUB_DATABASE_PASSWORD') -and $envMap['HUB_DATABASE_PASSWORD']) {
        [string]$envMap['HUB_DATABASE_PASSWORD']
    } else { 'secret' }
    $pgDb = if ($envMap.ContainsKey('HUB_DATABASE_NAME') -and $envMap['HUB_DATABASE_NAME']) {
        [string]$envMap['HUB_DATABASE_NAME']
    } else { 'api' }
    $msPort = if ($envMap.ContainsKey('PORT') -and $envMap['PORT'] -match '^\d+$') {
        [int]$envMap['PORT']
    } else { 5401 }

    if (-not ($envMap.ContainsKey('HUB_DATABASE_PASSWORD') -and $envMap['HUB_DATABASE_PASSWORD'])) {
        Write-Warn '根 .env 未设置 HUB_DATABASE_PASSWORD，使用 compose 缺省值（须知：需与运行中的容器一致）。'
    }

    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw '找不到 docker CLI；请安装/启动 Docker Desktop。'
    }
    $dockerVer = Invoke-DockerCapture -Arguments @('version', '--format', '{{.Server.Version}}')
    if ($dockerVer.ExitCode -ne 0) {
        $tail = @($dockerVer.Output | Select-Object -Last 5) -join ' | '
        throw "Docker 守护进程不可达：$tail"
    }

    $pgContainer = Get-ComposeServiceContainer -Service 'postgres'
    if (-not $pgContainer) {
        throw '找不到 compose 服务 postgres 的容器；先运行 docker compose up -d postgres。'
    }
    $pgInfo = Get-ContainerInfo -ContainerId $pgContainer
    if (-not $pgInfo.State.Running) {
        throw 'postgres 容器未运行；先运行 docker compose up -d postgres。'
    }

    $azContainer = Get-ComposeServiceContainer -Service 'azurite' -IncludeStopped
    if (-not $azContainer) {
        throw '找不到 compose 服务 azurite 的容器；先运行 docker compose up -d azurite。'
    }
    $azInfo = Get-ContainerInfo -ContainerId $azContainer
    $azVolume = Get-AzuriteVolume -ContainerInfo $azInfo

    # 硬阻断：对象卷不能在 Azurite 运行中覆盖（-Force 也不覆盖）。
    if ([bool]$azInfo.State.Running) {
        throw "Azurite 容器仍在运行（$azContainer）。恢复 /data 卷前必须停止它：docker compose stop azurite webhook-agent imodelhub；如宿主 MS 在跑：powershell -File scripts/stop-ms-host.ps1。然后重新运行。"
    }

    if ($manifest.stack -and $manifest.stack.azuriteVolume -and ([string]$manifest.stack.azuriteVolume -ne $azVolume)) {
        Write-Warn "备份卷名 '$($manifest.stack.azuriteVolume)' 与目标卷 '$azVolume' 不同；确认这是有意跨环境恢复。"
    }
    if ($manifest.stack -and $manifest.stack.database -and ([string]$manifest.stack.database -ne $pgDb)) {
        Write-Warn "备份库名 '$($manifest.stack.database)' 与目标库 '$pgDb' 不同；pg_restore 将写入目标库 '$pgDb'。"
    }

    $runningResult = Get-RunningServices
    $runningServices = @()
    $runningKnown = $false
    if ($runningResult.Ok) {
        $runningServices = @($runningResult.Services)
        $runningKnown = $true
    } else {
        Write-Warn '无法枚举运行中的 compose 服务；写者检查不完整。'
    }

    $hostMsRunning = $false
    $hostMsCheckOk = $true
    try {
        $listener = @(Get-NetTCPConnection -State Listen -LocalPort $msPort -ErrorAction SilentlyContinue | Select-Object -First 1)
        if ($listener.Count -gt 0) { $hostMsRunning = $true }
    } catch {
        $hostMsCheckOk = $false
    }

    # 目标 DB 是否已有用户表。
    $oldPgPass = $env:PGPASSWORD
    try {
        $env:PGPASSWORD = $pgPassword
        $tableResult = Invoke-DockerCapture -Arguments @(
            'exec', '-e', 'PGPASSWORD', $pgContainer,
            'psql', '--username', $pgUser, '--dbname', $pgDb, '--no-password',
            '--tuples-only', '--no-align',
            '--command', "SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema');"
        )
    } finally {
        if ($null -eq $oldPgPass) {
            Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
        } else {
            $env:PGPASSWORD = $oldPgPass
        }
    }
    if (-not $tableResult -or $tableResult.ExitCode -ne 0) {
        $tail = if ($tableResult) { @($tableResult.Output | Select-Object -Last 12) -join ' | ' } else { 'no output' }
        throw "无法检查目标数据库（psql 失败）：$tail"
    }
    $tableCountText = ((@($tableResult.Output | Where-Object { $_ -and $_.Trim() }) -join '')).Trim()
    $dbTableCount = 0
    if (-not [int]::TryParse($tableCountText, [ref]$dbTableCount)) {
        throw "无法解析目标数据库表数量：'$tableCountText'"
    }

    # 目标 Azurite 卷是否非空（只读检查）。
    $volumeCheck = Invoke-DockerCapture -Arguments @(
        'run', '--rm',
        '-v', "${azVolume}:/data:ro",
        $TarImage,
        'sh', '-c', 'ls -A /data'
    )
    if ($volumeCheck.ExitCode -ne 0) {
        $tail = @($volumeCheck.Output | Select-Object -Last 12) -join ' | '
        throw "无法检查目标 Azurite 卷（$azVolume）：$tail"
    }
    $volumeEntries = @($volumeCheck.Output | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    $volumeNonEmpty = $volumeEntries.Count -gt 0

    $forceReasons = New-Object System.Collections.Generic.List[string]
    if ($dbTableCount -gt 0) {
        $forceReasons.Add("目标数据库 '$pgDb' 已有 $dbTableCount 个用户表")
    }
    if ($volumeNonEmpty) {
        $forceReasons.Add("目标 Azurite 卷 '$azVolume' 非空")
    }
    $writerRunning = @($runningServices | Where-Object { @('imodelhub', 'webhook-agent') -contains $_ })
    if ($writerRunning.Count -gt 0) {
        $forceReasons.Add("写者服务仍在运行：$($writerRunning -join ', ')")
    }
    if ($hostMsRunning) {
        $forceReasons.Add("宿主 modeling-server 仍在监听 :$msPort")
    }
    if (-not $hostMsCheckOk) {
        $forceReasons.Add("无法检查宿主 modeling-server 端口 :$msPort")
    }
    if (-not $runningKnown) {
        $forceReasons.Add('无法确认写者是否已停止')
    }

    Write-Info "目标 PostgreSQL：容器 $pgContainer，库 '$pgDb'，用户表 $dbTableCount"
    Write-Info "目标 Azurite：卷 '$azVolume'，非空=$volumeNonEmpty，容器已停止"
    if ($runningServices.Count -gt 0) {
        Write-Info "运行中的 compose 服务：$($runningServices -join ', ')"
    }
    Write-Warn 'Redis/队列、briefcase 本地缓存、宿主文件与镜像不在本基线内；恢复后需重启栈并做完整性验证。'

    if ($forceReasons.Count -gt 0) {
        if (-not $Force) {
            Write-Host ''
            Write-Host 'RESTORE REFUSED：目标不是空/安全状态，未修改任何数据。' -ForegroundColor Red
            foreach ($reason in $forceReasons) { Write-Host "  - $reason" -ForegroundColor Red }
            Write-Host '先做一份当前状态的新备份并停止写者；确认后显式加 -Force 再重跑。' -ForegroundColor Yellow
            exit 3
        }
        Write-Host ''
        Write-Warn '已显式提供 -Force；以下不安全项将被覆盖：'
        foreach ($reason in $forceReasons) { Write-Host "  - $reason" -ForegroundColor Yellow }
    }

    # 在动任何目标数据前，确认两个归档都能被对应工具读取（-Force 判定之后、执行之前）。
    Write-Info '校验 postgres.dump 的 pg_restore 归档格式（容器内临时文件）...'
    $validationTmp = '/tmp/tiangong-kaiwu-validate-' + [guid]::NewGuid().ToString('N') + '.dump'
    try {
        Invoke-DockerChecked -Arguments @(
            'cp', (Join-Path $backupFull 'postgres.dump'), "${pgContainer}:${validationTmp}"
        ) -What 'docker cp（校验 postgres.dump）' | Out-Null
        Invoke-DockerChecked -Arguments @(
            'exec', $pgContainer, 'sh', '-c', "pg_restore --list $validationTmp > /dev/null"
        ) -What 'pg_restore --list（校验 postgres.dump）' | Out-Null
        Write-Info 'postgres.dump 归档格式校验通过。'
    } finally {
        Invoke-DockerCapture -Arguments @('exec', $pgContainer, 'rm', '-f', $validationTmp) | Out-Null
    }

    Write-Info '校验 azurite-data.tar.gz 归档可读性...'
    Invoke-DockerChecked -Arguments @(
        'run', '--rm',
        '-v', "${backupFull}:/backup:ro",
        $TarImage,
        'sh', '-c', 'tar -tzf /backup/azurite-data.tar.gz > /dev/null'
    ) -What 'Azurite 归档可读性校验' | Out-Null
    Write-Info 'azurite-data.tar.gz 归档校验通过。'

    Write-Step '3. 恢复执行计划（破坏性）'
    Write-Info "备份目录：$backupFull"
    Write-Info "步骤 1/2：pg_restore --clean --if-exists --no-owner --single-transaction 到 '$pgDb'（容器 $pgContainer）。"
    Write-Info "步骤 2/2：清空卷 '$azVolume' 并从 azurite-data.tar.gz 解包（Azurite 已停止）。"
    Write-Info '顺序固定为：先 DB，后对象存储；两侧必须来自同一个 manifest。'
} catch {
    $preflightError = $_
}

if ($preflightError) {
    Write-Step '恢复已中止'
    Write-Err "预检失败，未修改任何数据：$($preflightError.Exception.Message)"
    exit 1
}

# ============================================================
# 执行恢复
# ============================================================
$dbRestored = $false
$azWriteStarted = $false
$azRestored = $false
$restoreError = $null
$containerTmp = $null

try {
    Write-Step '4. 恢复 PostgreSQL'
    $containerTmp = '/tmp/tiangong-kaiwu-restore-' + [guid]::NewGuid().ToString('N') + '.dump'
    Invoke-DockerChecked -Arguments @(
        'cp', (Join-Path $backupFull 'postgres.dump'), "${pgContainer}:${containerTmp}"
    ) -What 'docker cp（postgres.dump → postgres 容器）' | Out-Null

    $oldPgPass = $env:PGPASSWORD
    try {
        $env:PGPASSWORD = $pgPassword
        $pgRestoreResult = Invoke-DockerCapture -Arguments @(
            'exec', '-e', 'PGPASSWORD', $pgContainer,
            'pg_restore', '--username', $pgUser, '--dbname', $pgDb,
            '--clean', '--if-exists', '--no-owner', '--single-transaction', '--exit-on-error', '--no-password',
            $containerTmp
        )
    } finally {
        if ($null -eq $oldPgPass) {
            Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
        } else {
            $env:PGPASSWORD = $oldPgPass
        }
    }
    if (-not $pgRestoreResult -or $pgRestoreResult.ExitCode -ne 0) {
        $tail = if ($pgRestoreResult) { @($pgRestoreResult.Output | Select-Object -Last 20) -join ' | ' } else { 'no output' }
        throw "pg_restore 失败（--single-transaction 预期已回滚）：$tail"
    }
    $dbRestored = $true
    Write-Info 'PostgreSQL 恢复成功。'

    Write-Step '5. 恢复 Azurite 卷'
    # 防竞态：预检后若 Azurite 被重新启动，绝不覆盖运行中的卷。
    $stateText = ((Invoke-DockerChecked -Arguments @('inspect', '-f', '{{.State.Running}}', $azContainer) -What 'docker inspect azurite.State.Running') -join '').Trim()
    if ($stateText -eq 'true') {
        throw "Azurite 在恢复过程中被启动（$azContainer）；对象卷未写入。请停止后从同一备份重跑。"
    }

    # 归档可读性已在预检（写入前）验证；此处只确认容器仍停止，随后清空并解包。
    Write-Info '归档已在预检阶段校验；开始清空并解包目标卷。'

    $azWriteStarted = $true
    $restoreSh = 'find /data -mindepth 1 -maxdepth 1 -exec rm -rf {} \; && tar -xzf /backup/azurite-data.tar.gz -C /data'
    $azResult = Invoke-DockerCapture -Arguments @(
        'run', '--rm',
        '-v', "${azVolume}:/data",
        '-v', "${backupFull}:/backup:ro",
        $TarImage,
        'sh', '-c', $restoreSh
    )
    if ($azResult.ExitCode -ne 0) {
        $tail = @($azResult.Output | Select-Object -Last 20) -join ' | '
        throw "Azurite 卷解包失败：$tail"
    }

    $postCheck = Invoke-DockerCapture -Arguments @(
        'run', '--rm',
        '-v', "${azVolume}:/data:ro",
        $TarImage,
        'sh', '-c', 'ls -A /data'
    )
    if ($postCheck.ExitCode -ne 0) {
        $tail = @($postCheck.Output | Select-Object -Last 12) -join ' | '
        throw "解包命令返回成功，但无法读取目标 Azurite 卷：$tail"
    }
    if (-not (@($postCheck.Output | Where-Object { $_ -and $_.Trim() }).Count -gt 0)) {
        Write-Warn '解包成功但目标 Azurite 卷为空；若源卷本为空这是正常现象，请结合 manifest 与业务数据确认。'
    }
    $azRestored = $true
    Write-Info 'Azurite 卷恢复成功。'
} catch {
    $restoreError = $_
} finally {
    if ($containerTmp -and $pgContainer) {
        Invoke-DockerCapture -Arguments @('exec', $pgContainer, 'rm', '-f', $containerTmp) | Out-Null
    }
}

if ($restoreError) {
    Write-Step '恢复失败'
    Write-Err $restoreError.Exception.Message
    Write-Info "数据库已恢复：$dbRestored"
    Write-Info "Azurite 已恢复：$azRestored（是否已开始写卷：$azWriteStarted）"
    if ($azWriteStarted -and -not $azRestored) {
        Write-Host '  CRITICAL：Azurite 卷已被清空/部分写入但恢复未完成。不要启动服务；排查磁盘/归档后从同一 backupId 重新恢复到该卷。' -ForegroundColor Red
    } elseif ($dbRestored -and -not $azRestored) {
        Write-Host '  WARNING：DB 已恢复但对象存储未恢复，两侧暂时不一致。启动服务前必须完成对象恢复。' -ForegroundColor Red
    } elseif (-not $dbRestored) {
        Write-Host '  注意：pg_restore 使用 --single-transaction；失败时预期已回滚，但请人工确认目标 DB 状态。' -ForegroundColor Yellow
    }
    Write-Info '本脚本未启动/重启任何容器。'
    exit 1
}

# ============================================================
# 完成：只打印检查项，不自动启动/重启
# ============================================================
Write-Step '6. 恢复完成（需要人工验收）'
Write-Host 'RESTORE OK：先 PostgreSQL，后 Azurite；两侧来自同一个 manifest。' -ForegroundColor Green
Write-Info '请按顺序执行（脚本不会自动做）：'
Write-Info '  1) 启动 Azurite 并等待 healthy：docker compose up -d azurite'
Write-Info '  2) 启动其余栈：docker compose up -d'
Write-Info '  3) 如宿主 MS 已停止：powershell -File scripts/start-ms-host.ps1 -Detach'
Write-Info '  4) 全栈验收：powershell -File scripts/verify-stack.ps1'
Write-Info '  5) 打开 3 个样例文档（至少 1 个含 >=100 changeset），核对几何/特征树/历史；再做一次编辑→push→重开冒烟。'
Write-Info '  6) 若恢复前有打开的 briefcase/编辑器，先重启宿主 MS 并清理陈旧本地 briefcase 缓存，再打开文档。'
Write-Info '  7) 记录本次 RPO（备份时间到最后一次已推送编辑的时间差）与 RTO（恢复到验收通过用时）。'
exit 0
