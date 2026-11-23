# ============================================================
# backup-stack.ps1 — G1 E1/E2 基线备份（PostgreSQL + Azurite）
#
# 做什么：
#   1) 从 compose 的 postgres 容器导出 pg_dump custom 格式（可用 pg_restore 恢复）。
#   2) 用一次性 alpine 容器把 Azurite 命名卷 /data 打成 tar.gz（不停止栈）。
#   3) 生成 backups/backup-<本地时间戳>/manifest.json + manifest.sha256，
#      记录源提交、容器/卷、文件大小与 SHA-256、跨存储一致性说明。
#
# 用法：
#   powershell -File scripts/backup-stack.ps1
#   powershell -File scripts/backup-stack.ps1 -BackupRoot D:\stack-backups -KeepDays 14
#   powershell -File scripts/backup-stack.ps1 -WhatIf        # 只打印计划，不写文件
#
# 重要限制（见 docs/operations/BACKUP-RESTORE.md）：
#   - 这是“时点基线”，不是 HA、不是 PITR；单靠本脚本不能满足 RPO≤5m。
#   - DB dump 与 Azurite 卷 tar 是顺序执行，不是跨存储原子快照。
#     需要一致性配对时，先停写者（azurite/imodelhub/webhook-agent/宿主 MS）再跑。
#   - Azurite 仅开发用；生产必须使用 S3/Azure Blob 等带版本化的持久服务。
#
# 安全：
#   - 只读仓库根 .env 取库名/角色/密码，绝不打印密码。
#   - 不停止、不重启、不重建任何容器。
#   - 失败时删除 .partial 暂存目录并以非零退出码失败，不留下“看起来成功”的半成品。
# ============================================================
[CmdletBinding()]
param(
    [string]$BackupRoot = 'backups',
    [switch]$WhatIf,
    [int]$KeepDays = 0,
    [string]$TarImage = 'alpine:3.20',
    # 全新栈（从未写入对象）允许空卷归档；已有数据的栈默认拒绝空卷，
    # 防止“备份成功但 Azurite 数据根本没落卷”的假绿。
    [switch]$AllowEmptyAzurite
)

$ErrorActionPreference = 'Stop'

$RepoRoot       = Split-Path -Parent $PSScriptRoot
$ComposeFile    = Join-Path $RepoRoot 'docker-compose.yml'
$EnvFile        = Join-Path $RepoRoot '.env'
$DefaultProject = 'tiangong-kaiwu'

$Script:StageMoved   = $false
$Script:ContainerTmp = $null
$Script:PgContainer  = $null
$Script:StageDir     = $null

# ------------------------------------------------------------
# 输出（一律不打印 .env 值；密码仅经进程环境传给 docker exec）
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

    # compose 不可用/未命中时按 compose 标签回退（包含已停止容器）。
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

function Write-Utf8NoBom {
    param([string]$Path, [string]$Text)
    $utf8 = New-Object -TypeName System.Text.UTF8Encoding -ArgumentList $false
    [System.IO.File]::WriteAllText($Path, $Text, $utf8)
}

function Get-ArtifactRecord {
    param(
        [string]$FullPath,
        [string]$RelativePath,
        [string]$StartedAtUtc,
        [string]$FinishedAtUtc,
        [string]$Description
    )
    if (-not (Test-Path -LiteralPath $FullPath -PathType Leaf)) {
        throw "备份产物缺失：$RelativePath"
    }
    $item = Get-Item -LiteralPath $FullPath
    if ($item.Length -le 0) {
        throw "备份产物为空：$RelativePath"
    }
    Write-Info "计算 SHA-256：$RelativePath（$($item.Length) 字节）..."
    $hash = (Get-FileHash -LiteralPath $FullPath -Algorithm SHA256).Hash.ToLowerInvariant()
    return [pscustomobject]([ordered]@{
        path          = $RelativePath
        bytes         = [long]$item.Length
        sha256        = $hash
        startedAtUtc  = $StartedAtUtc
        finishedAtUtc = $FinishedAtUtc
        description   = $Description
    })
}

function Invoke-Retention {
    param([string]$Root, [int]$Days, [switch]$PlanOnly)
    if ($Days -le 0) {
        Write-Info '保留策略：已禁用（-KeepDays 0）。'
        return
    }
    if (-not (Test-Path -LiteralPath $Root -PathType Container)) { return }

    $cutoff = (Get-Date).AddDays(-$Days)
    $removed = 0
    foreach ($dir in @(Get-ChildItem -LiteralPath $Root -Directory -ErrorAction Stop)) {
        if ($dir.Name -notmatch '^backup-\d{8}-\d{6}(-\d+)?$') { continue }
        if (($dir.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
            Write-Warn "保留策略跳过重解析点：$($dir.FullName)"
            continue
        }
        if (-not (Test-Path -LiteralPath (Join-Path $dir.FullName 'manifest.json') -PathType Leaf)) {
            continue
        }
        $m = [regex]::Match($dir.Name, '^backup-(\d{8})-(\d{6})')
        if (-not $m.Success) { continue }
        try {
            $ts = [datetime]::ParseExact(
                ($m.Groups[1].Value + $m.Groups[2].Value),
                'yyyyMMddHHmmss',
                [Globalization.CultureInfo]::InvariantCulture
            )
        } catch {
            Write-Warn "保留策略无法解析备份时间戳：$($dir.Name)"
            continue
        }
        if ($ts -ge $cutoff) { continue }

        if ($PlanOnly) {
            Write-Info "[WhatIf] 将删除过期备份：$($dir.FullName)"
            continue
        }
        try {
            Remove-Item -LiteralPath $dir.FullName -Recurse -Force
            $removed++
            Write-Info "已删除过期备份：$($dir.Name)"
        } catch {
            Write-Warn "删除过期备份失败（本备份仍有效）：$($dir.Name) — $($_.Exception.Message)"
        }
    }
    if (-not $PlanOnly) { Write-Info "保留策略完成：删除 $removed 个过期备份。" }
}

# ============================================================
# 预检
# ============================================================
try {
    Write-Step '预检'

    if ($KeepDays -lt 0) {
        throw '-KeepDays 必须 >= 0（0 表示不清理）。'
    }
    if ($TarImage -notmatch '^[A-Za-z0-9][A-Za-z0-9._/:@-]*$') {
        throw "-TarImage 不是合法的镜像引用：$TarImage"
    }

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
    Write-Info "Docker 守护进程可用（server $((@($dockerVer.Output) -join '').Trim())）。"

    $pgContainer = Get-ComposeServiceContainer -Service 'postgres'
    if (-not $pgContainer) {
        throw "找不到 compose 服务 postgres 的容器；先运行 docker compose up -d postgres。"
    }
    $pgInfo = Get-ContainerInfo -ContainerId $pgContainer
    if (-not $pgInfo.State.Running) {
        throw "postgres 容器未运行；先运行 docker compose up -d postgres。"
    }
    $Script:PgContainer = $pgContainer

    $azContainer = Get-ComposeServiceContainer -Service 'azurite' -IncludeStopped
    if (-not $azContainer) {
        throw "找不到 compose 服务 azurite 的容器；先运行 docker compose up -d azurite。"
    }
    $azInfo = Get-ContainerInfo -ContainerId $azContainer
    $azVolume = Get-AzuriteVolume -ContainerInfo $azInfo

    $runningResult = Get-RunningServices
    $runningServices = $null
    if ($runningResult.Ok) { $runningServices = @($runningResult.Services) }

    $hostMsRunning = $false
    $hostMsCheckOk = $true
    try {
        $listener = @(Get-NetTCPConnection -State Listen -LocalPort $msPort -ErrorAction SilentlyContinue | Select-Object -First 1)
        if ($listener.Count -gt 0) { $hostMsRunning = $true }
    } catch {
        $hostMsCheckOk = $false
    }

    $writerServices = @('azurite', 'imodelhub', 'webhook-agent')
    $activeWriters = @()
    if ($null -ne $runningServices) {
        $activeWriters = @($runningServices | Where-Object { $writerServices -contains $_ })
    }
    if ([bool]$azInfo.State.Running -and -not ($activeWriters -contains 'azurite')) {
        $activeWriters += 'azurite'
    }
    $writerLabels = @($activeWriters)
    if ($hostMsRunning) { $writerLabels += "host MS :$msPort" }
    $writerText = $writerLabels -join ', '

    $unknownReasons = @()
    if ($null -eq $runningServices) { $unknownReasons += '无法枚举 compose 服务' }
    if (-not $hostMsCheckOk) { $unknownReasons += "无法检查宿主 MS 端口 :$msPort" }

    if ($null -eq $runningServices) {
        $consistencyMode = 'unknown'
    } elseif ($hostMsRunning -or $activeWriters.Count -gt 0) {
        $consistencyMode = 'online-best-effort'
    } elseif ($unknownReasons.Count -gt 0) {
        $consistencyMode = 'unknown'
    } else {
        $consistencyMode = 'quiesced'
    }

    Write-Info "compose 项目：$projectName"
    Write-Info "PostgreSQL：容器 $pgContainer，库 '$pgDb'，角色 '$pgUser'"
    Write-Info "Azurite：容器 $azContainer，卷 '$azVolume'，运行中=$([bool]$azInfo.State.Running)"
    if ($consistencyMode -eq 'online-best-effort') {
        Write-Warn "检测到写者/宿主 MS 仍在运行（$writerText）。"
        Write-Warn 'DB dump 与 Azurite tar 将顺序执行，跨存储配对为 best-effort；需要一致性快照请先停写者再跑。'
    } elseif ($consistencyMode -eq 'unknown') {
        Write-Warn "一致性模式记为 unknown：$($unknownReasons -join '；')。"
    } else {
        Write-Info '写者似乎均已停止，本次配对接近 quiesced 快照。'
    }

    # 备份根目录
    if ([System.IO.Path]::IsPathRooted($BackupRoot)) {
        $backupRootFull = [System.IO.Path]::GetFullPath($BackupRoot)
    } else {
        $backupRootFull = [System.IO.Path]::GetFullPath((Join-Path $RepoRoot $BackupRoot))
    }
    if ($backupRootFull -match '^[A-Za-z]:[\\/]?$') {
        throw "-BackupRoot 不能是盘符根目录：$backupRootFull"
    }
    $repoRootNorm = $RepoRoot.TrimEnd('\', '/')
    $backupRootNorm = $backupRootFull.TrimEnd('\', '/')
    if ($backupRootNorm -eq $repoRootNorm) {
        throw 'BackupRoot 不能是仓库根目录；请使用专用子目录（默认 backups）。'
    }
    $gitDir = [System.IO.Path]::GetFullPath((Join-Path $RepoRoot '.git'))
    if ($backupRootFull.StartsWith($gitDir, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw 'BackupRoot 不能位于 .git 内。'
    }

    $baseId = 'backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
    $backupId = $baseId
    $suffix = 1
    while (Test-Path -LiteralPath (Join-Path $backupRootFull $backupId)) {
        $suffix++
        $backupId = "$baseId-$suffix"
    }
    $finalDir = Join-Path $backupRootFull $backupId
    $stageDir = Join-Path $backupRootFull ('.partial-' + [guid]::NewGuid().ToString('N'))
    $Script:StageDir = $stageDir

    if ($WhatIf) {
        Write-Step 'WhatIf 计划（不写文件、不停止容器）'
        Write-Info "备份目录：$finalDir"
        Write-Info 'PostgreSQL（密码经 docker exec 进程环境传递，不出现在命令行）：'
        Write-Info "  docker exec -e PGPASSWORD $pgContainer pg_dump --username <role> --dbname <db> --format=custom --no-password --file /tmp/tiangong-kaiwu-<guid>.dump"
        Write-Info "  docker cp ${pgContainer}:/tmp/tiangong-kaiwu-<guid>.dump $finalDir\postgres.dump"
        Write-Info 'Azurite（一次性 alpine 容器，/data 只读挂载）：'
        Write-Info "  docker run --rm -v ${azVolume}:/data:ro -v ${stageDir}:/backup $TarImage tar -czf /backup/azurite-data.tar.gz -C /data ."
        Write-Info '产物：'
        Write-Info '  postgres.dump、azurite-data.tar.gz、manifest.json、manifest.sha256'
        Write-Info "一致性记录：mode=$consistencyMode；顺序 = 先 DB 后对象存储。"
        Write-Info '保留策略：'
        Invoke-Retention -Root $backupRootFull -Days $KeepDays -PlanOnly
        Write-Info 'WhatIf 完成：没有创建目录，也没有执行 pg_dump/tar。'
        exit 0
    }

    # ============================================================
    # 正式备份
    # ============================================================
    $createdUtc = (Get-Date).ToUniversalTime()
    New-Item -ItemType Directory -Path $backupRootFull -Force | Out-Null

    # 防止备份被误提交（不修改仓库 .gitignore）
    $backupGitignore = Join-Path $backupRootFull '.gitignore'
    if (-not (Test-Path -LiteralPath $backupGitignore -PathType Leaf)) {
        Write-Utf8NoBom -Path $backupGitignore -Text "# Local stack backups (machine-local, may contain sensitive model data)`r`n*`r`n"
    }

    New-Item -ItemType Directory -Path $stageDir | Out-Null

    # ---- PostgreSQL ----
    Write-Step 'PostgreSQL dump'
    $containerTmp = '/tmp/tiangong-kaiwu-backup-' + [guid]::NewGuid().ToString('N') + '.dump'
    $Script:ContainerTmp = $containerTmp
    $pgStart = (Get-Date).ToUniversalTime()

    $oldPgPass = $env:PGPASSWORD
    try {
        $env:PGPASSWORD = $pgPassword
        $r = Invoke-DockerCapture -Arguments @(
            'exec', '-e', 'PGPASSWORD', $pgContainer,
            'pg_dump', '--username', $pgUser, '--dbname', $pgDb,
            '--format=custom', '--no-password', '--file', $containerTmp
        )
    } finally {
        if ($null -eq $oldPgPass) {
            Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
        } else {
            $env:PGPASSWORD = $oldPgPass
        }
    }
    if (-not $r -or $r.ExitCode -ne 0) {
        $tail = if ($r) { @($r.Output | Select-Object -Last 12) -join ' | ' } else { 'no output' }
        throw "pg_dump 失败：$tail"
    }
    $pgEnd = (Get-Date).ToUniversalTime()

    $hostDump = Join-Path $stageDir 'postgres.dump'
    $cpResult = Invoke-DockerCapture -Arguments @('cp', "${pgContainer}:${containerTmp}", $hostDump)
    if ($cpResult.ExitCode -ne 0) {
        $tail = @($cpResult.Output | Select-Object -Last 12) -join ' | '
        throw "docker cp（postgres.dump）失败：$tail"
    }
    Invoke-DockerCapture -Arguments @('exec', $pgContainer, 'rm', '-f', $containerTmp) | Out-Null
    $Script:ContainerTmp = $null

    $pgVersionResult = Invoke-DockerCapture -Arguments @('exec', $pgContainer, 'pg_dump', '--version')
    $pgDumpVersion = if ($pgVersionResult.ExitCode -eq 0) {
        (@($pgVersionResult.Output) -join ' ').Trim()
    } else { 'unknown' }

    Write-Info "完成：postgres.dump（$([math]::Round(($pgEnd - $pgStart).TotalSeconds, 1)) s）。"

    # ---- Azurite 卷 ----
    Write-Step 'Azurite 卷快照'
    $azStart = (Get-Date).ToUniversalTime()
    $tarResult = Invoke-DockerCapture -Arguments @(
        'run', '--rm',
        '-v', "${azVolume}:/data:ro",
        '-v', "${stageDir}:/backup",
        $TarImage,
        'tar', '-czf', '/backup/azurite-data.tar.gz', '-C', '/data', '.'
    )
    $azEnd = (Get-Date).ToUniversalTime()

    $tarWarning = $null
    $hostTar = Join-Path $stageDir 'azurite-data.tar.gz'
    if ($tarResult.ExitCode -ne 0) {
        $hasArchive = (Test-Path -LiteralPath $hostTar -PathType Leaf) -and ((Get-Item -LiteralPath $hostTar).Length -gt 0)
        if ($tarResult.ExitCode -eq 1 -and $hasArchive) {
            $tarWarning = 'tar 返回 1（通常表示文件在读取时发生变化）；归档保留，但活动卷快照可能不一致。'
            Write-Warn $tarWarning
        } else {
            $tail = @($tarResult.Output | Select-Object -Last 12) -join ' | '
            throw "Azurite 卷 tar 失败（exit $($tarResult.ExitCode)）：$tail"
        }
    }
    # 卷内容哨兵：compose 若未给 azurite 传 --location，数据写镜像 WORKDIR
    # （/opt/azurite）而非命名卷，tar 仅几十字节——备份“成功”但对象存储全丢
    #（2026-11-22 迁移演练实证）。默认拒绝空卷归档；全新栈用 -AllowEmptyAzurite 放行。
    $listing = Invoke-DockerCapture -Arguments @(
        'run', '--rm',
        '-v', "${stageDir}:/backup:ro",
        $TarImage,
        'tar', '-tzf', '/backup/azurite-data.tar.gz'
    )
    if ($listing.ExitCode -ne 0) {
        $tail = @($listing.Output | Select-Object -Last 12) -join ' | '
        throw "Azurite 归档校验失败（exit $($listing.ExitCode)）：$tail"
    }
    $hasAzuriteDb = @($listing.Output | Where-Object { $_ -match '(^|/)__azurite_db_blob__\.json$' }).Count -gt 0
    if (-not $hasAzuriteDb) {
        if ($AllowEmptyAzurite) {
            Write-Warn 'Azurite 卷为空；-AllowEmptyAzurite 已显式放行（仅适用于从未写入对象的新栈）。'
        } else {
            throw 'Azurite 卷归档不含 __azurite_db_blob__.json：对象存储数据未落在 /data 卷。检查 compose azurite 命令是否含 --location /data；全新栈确需空归档时显式加 -AllowEmptyAzurite。'
        }
    }
    Write-Info "完成：azurite-data.tar.gz（$([math]::Round(($azEnd - $azStart).TotalSeconds, 1)) s）。"

    # ---- manifest ----
    Write-Step '生成 manifest'
    $pgArtifact = Get-ArtifactRecord `
        -FullPath $hostDump `
        -RelativePath 'postgres.dump' `
        -StartedAtUtc $pgStart.ToString('o') `
        -FinishedAtUtc $pgEnd.ToString('o') `
        -Description "pg_dump custom format, database '$pgDb'"

    $azArtifact = Get-ArtifactRecord `
        -FullPath $hostTar `
        -RelativePath 'azurite-data.tar.gz' `
        -StartedAtUtc $azStart.ToString('o') `
        -FinishedAtUtc $azEnd.ToString('o') `
        -Description "tar.gz of named volume '$azVolume' mounted at /data"

    $commit = Get-GitText -GitArgs @('rev-parse', 'HEAD')
    $branch = Get-GitText -GitArgs @('rev-parse', '--abbrev-ref', 'HEAD')
    $describe = Get-GitText -GitArgs @('describe', '--always', '--dirty')
    $dirtyOut = Get-GitText -GitArgs @('status', '--porcelain', '--untracked-files=no')
    $dirtyTracked = [bool]($dirtyOut)

    $seqWindowSeconds = [math]::Round(($azEnd - $pgStart).TotalSeconds, 1)
    if ($consistencyMode -eq 'quiesced') {
        $consistencyNote = '写者似乎在快照时已停止。PostgreSQL 先 dump，随后 tar Azurite 卷；两者仍是顺序采集，不是原子事务。'
    } elseif ($consistencyMode -eq 'online-best-effort') {
        $consistencyNote = "采集时仍有写者/宿主 MS 运行（$writerText）。PostgreSQL dump 与 Azurite tar 顺序执行；两次快照之间提交的写入不会同时出现在两侧。需要一致性配对时，请停止 azurite/imodelhub/webhook-agent/宿主 MS 后重跑。"
    } else {
        $unknownDetail = if ($unknownReasons.Count -gt 0) { "：$($unknownReasons -join '；')" } else { '' }
        $consistencyNote = "无法确认写者状态（consistency mode=unknown$unknownDetail）。PostgreSQL dump 与 Azurite tar 顺序执行，跨存储配对按 best-effort 对待。"
    }

    $manifest = [ordered]@{
        schemaVersion = 1
        kind          = 'tiangong-kaiwu-baseline-backup'
        tool          = 'scripts/backup-stack.ps1'
        backupId      = $backupId
        createdAtUtc  = $createdUtc.ToString('o')
        createdAtLocal = $createdUtc.ToLocalTime().ToString('o')
        source        = [ordered]@{
            commit       = if ($commit) { $commit } else { 'unknown' }
            branch       = if ($branch) { $branch } else { 'unknown' }
            describe     = if ($describe) { $describe } else { 'unknown' }
            dirtyTracked = $dirtyTracked
        }
        stack         = [ordered]@{
            composeProject    = $projectName
            composeFile       = 'docker-compose.yml'
            postgresContainer = ([string]$pgInfo.Name).TrimStart('/')
            postgresImageRef  = [string]$pgInfo.Config.Image
            postgresImageId   = [string]$pgInfo.Image
            azuriteContainer  = ([string]$azInfo.Name).TrimStart('/')
            azuriteImageRef   = [string]$azInfo.Config.Image
            azuriteImageId    = [string]$azInfo.Image
            azuriteVolume     = $azVolume
            azuriteRunning    = [bool]$azInfo.State.Running
            database          = $pgDb
            databaseUser      = $pgUser
        }
        postgres      = [ordered]@{
            format        = 'pg_dump custom format (pg_restore compatible)'
            pgDumpVersion = $pgDumpVersion
            dumpFile      = 'postgres.dump'
            startedAtUtc  = $pgStart.ToString('o')
            finishedAtUtc = $pgEnd.ToString('o')
        }
        azurite       = [ordered]@{
            format        = 'tar.gz of named volume /data'
            tarImage      = $TarImage
            tarExitCode   = $tarResult.ExitCode
            tarWarning    = $tarWarning
            startedAtUtc  = $azStart.ToString('o')
            finishedAtUtc = $azEnd.ToString('o')
        }
        artifacts     = @($pgArtifact, $azArtifact)
        consistency   = [ordered]@{
            mode                    = $consistencyMode
            runningServices         = if ($null -eq $runningServices) { @() } else { @($runningServices) }
            activeWriters           = @($activeWriters)
            hostModelingServerPort  = if ($hostMsRunning) { $msPort } else { $null }
            sequentialWindowSeconds = $seqWindowSeconds
            note                    = $consistencyNote
            crossStoreNote          = '数据库与对象存储必须从同一个 backupId/manifest 成套恢复；只恢复一侧会留下悬挂的 changeset/blob 引用。恢复顺序：先 PostgreSQL，再 Azurite 卷。'
        }
        restoreOrder  = @('postgres.dump', 'azurite-data.tar.gz')
        retention     = [ordered]@{
            keepDays = $KeepDays
            policy   = '0 = 不清理；>0 = 删除 manifest 完整且目录名/时间戳超过保留期的 backup-* 目录'
        }
        rpo           = [ordered]@{
            target        = '<= 5 分钟（D0-14 生产目标）'
            thisBaseline  = '本基线是时点全量快照，不是 PITR；RPO 等于备份间隔。要满足 RPO<=5m，必须提高调度频率或引入 WAL 归档/PITR + 对象存储版本化。'
        }
        rto           = [ordered]@{
            target        = '<= 1 小时（D0-14 生产目标）'
            thisBaseline  = '在完成恢复演练并实测前不作保证；见 docs/operations/BACKUP-RESTORE.md 演练清单。'
        }
        limitations   = @(
            'Point-in-time baseline only; not HA and not PITR.',
            'Online DB dump + Azurite tar are sequential, not an atomic cross-store snapshot.',
            'Azurite is development-only; production requires S3/Azure Blob with versioning/replication.',
            'Redis, briefcase caches, host-local files, and deployment images are not included.',
            'Local backup files are unencrypted; protect access, encrypt at rest, and copy off-host.'
        )
    }

    $manifestJson = $manifest | ConvertTo-Json -Depth 10
    $manifestPath = Join-Path $stageDir 'manifest.json'
    Write-Utf8NoBom -Path $manifestPath -Text $manifestJson

    $manifestHash = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
    Write-Utf8NoBom -Path (Join-Path $stageDir 'manifest.sha256') -Text "$manifestHash  manifest.json`r`n"

    Move-Item -LiteralPath $stageDir -Destination $finalDir
    $Script:StageMoved = $true

    Write-Step '摘要'
    Write-Host "BACKUP OK: $finalDir" -ForegroundColor Green
    Write-Info "postgres.dump        $($pgArtifact.bytes) 字节  sha256=$($pgArtifact.sha256)"
    Write-Info "azurite-data.tar.gz  $($azArtifact.bytes) 字节  sha256=$($azArtifact.sha256)"
    Write-Info "manifest.json        sha256=$manifestHash"
    Write-Info "source commit        $($manifest.source.commit)（dirtyTracked=$dirtyTracked）"
    Write-Info "consistency          $consistencyMode（顺序窗口 $seqWindowSeconds s）"
    if ($tarWarning) { Write-Warn $tarWarning }
    Write-Info '下一步：把整个备份目录复制到异机/离线介质；恢复用：'
    Write-Info "  powershell -File scripts/restore-stack.ps1 -BackupDir `"$finalDir`" -Confirm"

    Write-Step '保留策略'
    try {
        Invoke-Retention -Root $backupRootFull -Days $KeepDays
    } catch {
        Write-Warn "保留策略失败（本次备份已成功落盘，仍有效）：$($_.Exception.Message)"
    }

    exit 0
} catch {
    Write-Step '备份失败'
    Write-Err $_.Exception.Message
    exit 1
} finally {
    if ($Script:ContainerTmp -and $Script:PgContainer) {
        Invoke-DockerCapture -Arguments @('exec', $Script:PgContainer, 'rm', '-f', $Script:ContainerTmp) | Out-Null
    }
    if (-not $Script:StageMoved -and $Script:StageDir -and (Test-Path -LiteralPath $Script:StageDir)) {
        try { Remove-Item -LiteralPath $Script:StageDir -Recurse -Force } catch { }
    }
}
