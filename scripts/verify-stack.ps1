# ============================================================
# verify-stack.ps1 — 天工开物统一栈（根 docker-compose.yml）验收脚本
#
# 全栈一键验收：health 探针 → 服务账号登录 → iTwin/iModel/baseline 数据链
# → WS cookie 握手 → 原生库 dev-build 横幅 → 汇总表 + 退出码。
#
# 用法:
#   powershell -File scripts/verify-stack.ps1                    # 全量（含 baseline 数据链，最慢 ~5min）
#   powershell -File scripts/verify-stack.ps1 -SkipBaseline      # 跳过数据链（health + WS + 横幅）
#   powershell -File scripts/verify-stack.ps1 -BaseUrl http://localhost
#
# 前置:
#   1) 仓库根 .env（scripts/generate-env.ps1；登录用 IMODELHUB_ADMIN_EMAIL/PASSWORD）
#   2) 栈已起：docker compose up -d + powershell -File scripts/start-ms-host.ps1 -Detach
#
# 探针表（实配依据，改路由时同步此表）:
#   HUB      GET http://<host>:4000/health        直探 —— deploy/default.conf.template 无 /health 路由，
#                                                 经 BaseUrl 探 /health 只会落进 web SPA 兜底
#   MS       GET http://<host>:4001/health        宿主进程（或 --profile container 映射口），main.ts:243
#   web      GET <BaseUrl>/                       经 nginx → web:3000 静态
#   WA       GET http://<host>:4002/health        webhook-server.ts /health（WA 无 /health/live；
#                                                 根 compose healthcheck 同款端点），不经 nginx
#   azurite  GET http://<host>:10000/             任意 HTTP 应答即视为 up（含 400/403）
#
# 数据链（-SkipBaseline 跳过；请求形状对照 imodelhub-services DTO）:
#   POST /auth/email/login {email,password}          → {token, refreshToken, tokenExpires, user}
#   POST /itwins            {displayName,class}      → {iTwin:{id}}        （CreateiTwinDto 必填仅 displayName）
#   POST /imodels           {iTwinId,name}           → {iModel:{id,state}} （creationMode 缺省 empty → HUB 发
#                                                       IMODEL_CREATED(needBaseline)；漏收则 WA recovery checker
#                                                       每 RECOVERY_CHECK_INTERVAL_MINUTES(默认5) 分钟兜底 requeue）
#   GET  /imodels/{id}       轮询 10s × 5min          → iModel.state == 'initialized'（终态 failed/missingFiles 提前失败）
#   DELETE /imodels/{id} + DELETE /itwins/{id}        → 204（best-effort，失败仅告警不扣退出码）
#
# WS 探针（Step C）: 纯 node 核心模块手工 Upgrade 握手 —— Node 全局 WebSocket(undici)
#   是 WHATWG API，无法携带自定义 Cookie 头；这里以 http.request + 'upgrade' 事件发送
#   luban_cad_auth cookie（FE features/auth/services/auth/client.ts storeAuth 同形状），
#   断言 101 + Sec-WebSocket-Accept 正确；负向探针（无 cookie 无 query token）断言被 401 拒。
#
# 横幅核验（Step D）: "using dev build from ..." 由 imodel-native
#   iModelJsNodeAddon/api_package/ts/src/NativeLibrary.ts 在加载本地编译二进制时打印；
#   宿主 MS 先查 %TEMP%\luban-cad-modeling-server.log(.err)（start-ms-host.ps1 -Detach 重定向），
#   找不到再回退 `docker compose logs modeling-server`（--profile container 形态），报告命中来源。
# ============================================================
[CmdletBinding()]
param(
    [string]$BaseUrl = 'http://localhost',
    [switch]$SkipBaseline
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$EnvFile  = Join-Path $RepoRoot '.env'

# --- 规范化 BaseUrl / 探针主机 ---
if ($BaseUrl -notmatch '^https?://') { $BaseUrl = "http://$BaseUrl" }
$Base = $BaseUrl.TrimEnd('/')
$ProbeHost = ([uri]$Base).Host
if (-not $ProbeHost) { $ProbeHost = 'localhost' }
if ($Base -like 'https:*') {
    # PS5.1 默认协议集可能不含 TLS1.2
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
}

# ============================================================
# 输出与结果登记
# ============================================================
$Script:Rows = New-Object System.Collections.Generic.List[object]
$Script:FatalFails = 0

function Add-Check {
    param([string]$Step, [string]$Name, [bool]$Ok, [string]$Detail, [switch]$NonFatal)
    $label = if ($Ok) { 'OK  ' } else { 'FAIL' }
    $Script:Rows.Add([pscustomobject]@{ Step = $Step; Result = $label.Trim(); Check = $Name; Detail = $Detail })
    $color = if ($Ok) { 'Green' } else { 'Red' }
    Write-Host ("  [{0}] {1}  {2}" -f $label, $Name, $Detail) -ForegroundColor $color
    if (-not $Ok -and -not $NonFatal) { $Script:FatalFails++ }
}

# ============================================================
# HTTP 探针（PS5.1 兼容：HttpWebRequest 直用，4xx/5xx 不抛进调用方；
#   禁用系统代理与 Expect:100-continue，避免本机代理劫持 localhost 探针）
# ============================================================
function Invoke-StackHttp {
    param(
        [Parameter(Mandatory=$true)][string]$Method,
        [Parameter(Mandatory=$true)][string]$Uri,
        [int]$TimeoutSec = 10,
        [string]$Body,
        [string]$ContentType = 'application/json',
        [hashtable]$Headers = @{}
    )
    $out  = @{ StatusCode = -1; Body = ''; Error = $null }
    $resp = $null
    try {
        $req = [System.Net.HttpWebRequest]::Create($Uri)
        # HTTP 方法大小写敏感（RFC 7231 token）——.NET 不做归一化，'Delete' 原样上线
        # 会被 node 端 llhttp 以 HPE_INVALID_METHOD 拒成 400，这里强制大写
        $req.Method = $Method.ToUpperInvariant()
        $req.Timeout = $TimeoutSec * 1000
        $req.ReadWriteTimeout = $TimeoutSec * 1000
        $req.Proxy = $null
        $req.AllowAutoRedirect = $false
        $req.ServicePoint.Expect100Continue = $false
        foreach ($k in $Headers.Keys) { $req.Headers.Add([string]$k, [string]$Headers[$k]) }
        if ($Body) {
            $req.ContentType = $ContentType
            $buf = [System.Text.Encoding]::UTF8.GetBytes($Body)
            $req.ContentLength = $buf.Length
            $rs = $req.GetRequestStream()
            $rs.Write($buf, 0, $buf.Length)
            $rs.Close()
        }
        try { $resp = $req.GetResponse() }
        catch [System.Net.WebException] {
            if ($_.Exception.Response) { $resp = $_.Exception.Response } else { throw }
        }
        $out.StatusCode = [int]$resp.StatusCode
        try {
            $sr = New-Object System.IO.StreamReader($resp.GetResponseStream(), [System.Text.Encoding]::UTF8)
            $out.Body = $sr.ReadToEnd()
        } catch { }
    } catch {
        # 解开 MethodInvocationException 包装，直接给底层传输错误
        $out.Error = $_.Exception.GetBaseException().Message
    } finally {
        if ($resp) { try { $resp.Close() } catch { } }
    }
    return $out
}

function Convert-JsonSafe([string]$Text) {
    if (-not $Text) { return $null }
    try { return $Text | ConvertFrom-Json } catch { return $null }
}

function Import-DotEnv([string]$Path) {
    $map = @{}
    if (-not (Test-Path $Path)) { return $map }
    foreach ($line in (Get-Content -Path $Path)) {
        $t = $line.Trim()
        if ($t -eq '' -or $t.StartsWith('#')) { continue }
        $i = $t.IndexOf('=')
        if ($i -lt 1) { continue }
        $map[$t.Substring(0, $i).Trim()] = $t.Substring($i + 1).Trim().Trim('"').Trim("'")
    }
    return $map
}

# ============================================================
# 服务账号登录（B/C 共用，至多执行一次；结果含失败也缓存以免重复触发
#   HUB 登录节流 5 次/15 分钟）
# ============================================================
$Script:AuthTried = $false
$Script:Auth = $null    # @{ Token; Refresh; ExpiresAt(ms) }

function Get-ServiceAccountAuth {
    if ($Script:AuthTried) { return $Script:Auth }
    $Script:AuthTried = $true

    $envMap = Import-DotEnv -Path $EnvFile
    $email = $envMap['IMODELHUB_ADMIN_EMAIL']
    $password = $envMap['IMODELHUB_ADMIN_PASSWORD']
    if (-not $email -or -not $password) {
        Add-Check 'B' '服务账号登录' $false "缺 IMODELHUB_ADMIN_EMAIL/PASSWORD（$EnvFile；先跑 scripts/generate-env.ps1）"
        return $null
    }

    $r = Invoke-StackHttp -Method Post -Uri "$Base/auth/email/login" -TimeoutSec 30 `
        -Body ((@{ email = $email; password = $password } | ConvertTo-Json -Compress))
    $json = Convert-JsonSafe $r.Body
    if ($r.StatusCode -eq 200 -and $json -and $json.token) {
        $expiresAt = $json.tokenExpires
        if (-not $expiresAt) { $expiresAt = ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() + 900 * 1000) }
        $Script:Auth = @{ Token = [string]$json.token; Refresh = [string]$json.refreshToken; ExpiresAt = [long]$expiresAt }
        Add-Check 'B' '服务账号登录' $true "HTTP 200，user=$($json.user.email)（经 $Base/auth → nginx → HUB）"
    } elseif ($r.StatusCode -eq 401) {
        Add-Check 'B' '服务账号登录' $false 'HTTP 401：.env 凭据与 HUB seed 不一致（改 HUB 侧账号或根 .env）'
    } elseif ($r.StatusCode -eq 429) {
        Add-Check 'B' '服务账号登录' $false 'HTTP 429：登录节流（5 次/15 分钟），稍后重试'
    } elseif ($r.Error) {
        Add-Check 'B' '服务账号登录' $false "传输失败：$($r.Error)（HUB health 已 OK 时优先怀疑 nginx /auth 路由）"
    } else {
        Add-Check 'B' '服务账号登录' $false "HTTP $($r.StatusCode)：$($r.Body.Substring(0, [Math]::Min(160, $r.Body.Length)))"
    }
    return $Script:Auth
}

# ============================================================
# Step A —— health 探针
# ============================================================
Write-Host ''
Write-Host "== Step A: health 探针（BaseUrl=$Base，直探主机=$ProbeHost）==" -ForegroundColor Cyan
$msHealthy = $false

$r = Invoke-StackHttp -Method Get -Uri "http://${ProbeHost}:4000/health" -TimeoutSec 5
if ($r.StatusCode -eq 200) {
    Add-Check 'A' 'HUB :4000/health' $true 'HTTP 200（直探：nginx 无 /health 路由）'
} elseif ($r.Error) {
    Add-Check 'A' 'HUB :4000/health' $false "$($r.Error)（docker compose up -d imodelhub）"
} else {
    Add-Check 'A' 'HUB :4000/health' $false "HTTP $($r.StatusCode)（503 = 其依赖 postgres/redis 未就绪）"
}

$r = Invoke-StackHttp -Method Get -Uri "http://${ProbeHost}:4001/health" -TimeoutSec 5
if ($r.StatusCode -eq 200) {
    $msHealthy = $true
    Add-Check 'A' 'MS :4001/health' $true 'HTTP 200（宿主进程或 --profile container 映射口）'
} elseif ($r.Error) {
    Add-Check 'A' 'MS :4001/health' $false "$($r.Error)（宿主形态：scripts/start-ms-host.ps1 -Detach）"
} else {
    Add-Check 'A' 'MS :4001/health' $false "HTTP $($r.StatusCode)"
}

$r = Invoke-StackHttp -Method Get -Uri "$Base/" -TimeoutSec 10
if ($r.StatusCode -eq 200) {
    Add-Check 'A' "web $Base/" $true 'HTTP 200（nginx → web:3000 静态）'
} elseif ($r.Error) {
    Add-Check 'A' "web $Base/" $false "$($r.Error)（nginx 未起或端口不通：docker compose up -d nginx）"
} else {
    Add-Check 'A' "web $Base/" $false "HTTP $($r.StatusCode)（502/504 = nginx 通但 web 容器异常）"
}

$r = Invoke-StackHttp -Method Get -Uri "http://${ProbeHost}:4002/health" -TimeoutSec 5
if ($r.StatusCode -eq 200) {
    $waJson = Convert-JsonSafe $r.Body
    $pending = if ($waJson -and $waJson.stats) { $waJson.stats.pendingForwards } else { '?' }
    Add-Check 'A' 'WA :4002/health' $true "HTTP 200，pendingForwards=$pending（WA 无 /health/live，/health 即活探针）"
} elseif ($r.Error) {
    Add-Check 'A' 'WA :4002/health' $false "$($r.Error)（docker compose up -d webhook-agent）"
} else {
    Add-Check 'A' 'WA :4002/health' $false "HTTP $($r.StatusCode)"
}

$r = Invoke-StackHttp -Method Get -Uri "http://${ProbeHost}:10000/" -TimeoutSec 5
if ($r.StatusCode -ge 100) {
    # Azurite 对未认证根路径应答 400/403 均正常 —— 任意 HTTP 应答即 up
    Add-Check 'A' 'azurite :10000' $true "HTTP $($r.StatusCode)（任意应答即 up）"
} else {
    Add-Check 'A' 'azurite :10000' $false "$($r.Error)（docker compose up -d azurite；HUB/MS 的 briefcase/baseline 都依赖它）"
}

# ============================================================
# Step B —— 数据链：登录 → iTwin → iModel → 轮询 initialized → 清理
# ============================================================
if ($SkipBaseline) {
    Write-Host ''
    Write-Host '== Step B: 数据链（-SkipBaseline 跳过）==' -ForegroundColor Cyan
} else {
    Write-Host ''
    Write-Host '== Step B: 数据链（登录 → iTwin → iModel → baseline 轮询）==' -ForegroundColor Cyan
    $auth = Get-ServiceAccountAuth
    if ($auth) {
        $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
        $authHeaders = @{ Authorization = "Bearer $($auth.Token)" }

        # --- create iTwin（CreateiTwinDto 必填仅 displayName） ---
        $r = Invoke-StackHttp -Method Post -Uri "$Base/itwins" -TimeoutSec 30 -Headers $authHeaders `
            -Body ((@{ displayName = "verify-stack-$stamp"; class = 'Project' } | ConvertTo-Json -Compress))
        $json = Convert-JsonSafe $r.Body
        $itwinId = $null
        if ($r.StatusCode -eq 201 -and $json -and $json.iTwin -and $json.iTwin.id) {
            $itwinId = [string]$json.iTwin.id
            Add-Check 'B' '创建 iTwin' $true "HTTP 201，id=$itwinId"
        } elseif ($r.Error) {
            Add-Check 'B' '创建 iTwin' $false "传输失败：$($r.Error)"
        } else {
            Add-Check 'B' '创建 iTwin' $false "HTTP $($r.StatusCode)：$($r.Body.Substring(0, [Math]::Min(160, $r.Body.Length)))"
        }

        if ($itwinId) {
            # --- create iModel（CreateiModelDto 必填 iTwinId+name；creationMode 缺省 empty） ---
            $r = Invoke-StackHttp -Method Post -Uri "$Base/imodels" -TimeoutSec 30 -Headers $authHeaders `
                -Body ((@{ iTwinId = $itwinId; name = "verify-stack-baseline-$stamp" } | ConvertTo-Json -Compress))
            $json = Convert-JsonSafe $r.Body
            $imodelId = $null
            if ($r.StatusCode -eq 201 -and $json -and $json.iModel -and $json.iModel.id) {
                $imodelId = [string]$json.iModel.id
                $state0 = $json.iModel.state
                Add-Check 'B' '创建 iModel' $true "HTTP 201，id=$imodelId，state=$state0"
            } elseif ($r.Error) {
                Add-Check 'B' '创建 iModel' $false "传输失败：$($r.Error)"
            } else {
                Add-Check 'B' '创建 iModel' $false "HTTP $($r.StatusCode)：$($r.Body.Substring(0, [Math]::Min(160, $r.Body.Length)))"
            }

            if ($imodelId) {
                # --- 轮询 state → initialized（10s × 5min；WA webhook 或 recovery checker 兜底） ---
                $deadlineSec = 300
                $intervalSec = 10
                $attempts = [Math]::Ceiling($deadlineSec / $intervalSec)
                $finalState = $null
                $transportError = $null
                for ($i = 1; $i -le $attempts; $i++) {
                    $r = Invoke-StackHttp -Method Get -Uri "$Base/imodels/$imodelId" -TimeoutSec 15 -Headers $authHeaders
                    $json = Convert-JsonSafe $r.Body
                    $state = $null
                    if ($r.StatusCode -eq 200 -and $json -and $json.iModel) { $state = [string]$json.iModel.state }
                    if (-not $state -and $r.Error) { $transportError = $r.Error }
                    Write-Host ("    poll {0}/{1}: state={2}" -f $i, $attempts, $(if ($state) { $state } else { 'unavailable' })) -ForegroundColor DarkGray
                    if ($state -eq 'initialized' -or $state -eq 'failed' -or $state -eq 'missingFiles') { $finalState = $state; break }
                    if ($i -lt $attempts) { Start-Sleep -Seconds $intervalSec }
                }

                if ($finalState -eq 'initialized') {
                    Add-Check 'B' 'baseline 初始化（state=initialized）' $true "iModel $imodelId 已初始化"
                } elseif ($finalState) {
                    Add-Check 'B' 'baseline 初始化（state=initialized）' $false "终态 $finalState —— docker compose logs webhook-agent；宿主 MS 日志 %TEMP%\luban-cad-modeling-server.log"
                } elseif ($transportError) {
                    Add-Check 'B' 'baseline 初始化（state=initialized）' $false "轮询传输失败：$transportError"
                } else {
                    $detail = "{0} 次轮询（约 {1} 分钟）仍未见 initialized —— docker compose logs webhook-agent；recovery checker 默认 5 分钟一轮（RECOVERY_CHECK_INTERVAL_MINUTES），可稍后重跑本脚本" -f $attempts, $deadlineSec
                    Add-Check 'B' 'baseline 初始化（state=initialized）' $false -Detail $detail
                }

                # --- 清理（best-effort，不扣退出码） ---
                $r = Invoke-StackHttp -Method Delete -Uri "$Base/imodels/$imodelId" -TimeoutSec 30 -Headers $authHeaders
                Add-Check 'B' "清理 iModel $imodelId" ($r.StatusCode -eq 204) "HTTP $($r.StatusCode)（期望 204）" -NonFatal
            }
        }

        if ($itwinId) {
            $r = Invoke-StackHttp -Method Delete -Uri "$Base/itwins/$itwinId" -TimeoutSec 30 -Headers $authHeaders
            Add-Check 'B' "清理 iTwin $itwinId" ($r.StatusCode -eq 204) "HTTP $($r.StatusCode)（期望 204）" -NonFatal
        }
    }
}

# ============================================================
# Step C —— WS cookie 握手（纯 node 核心手工 Upgrade；cookie 形状与
#   FE features/auth/services/auth/client.ts storeAuth 一致）
# ============================================================
Write-Host ''
Write-Host '== Step C: WebSocket cookie 握手 == ' -ForegroundColor Cyan
$wsUrl = ($Base -replace '^http', 'ws') + '/ws'
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Add-Check 'C' "WS 握手 $wsUrl" $false 'node 不在 PATH —— WS 探针需要 node（本仓工具链依赖）'
} else {
    # 取登录态（-SkipBaseline 时这里才首次登录；已失败则命中缓存，不重复触发 HUB 节流）
    $null = Get-ServiceAccountAuth
    $probeJs = Join-Path $env:TEMP 'verify-stack-ws-probe.js'
    @'
// verify-stack WS 探针：手工 WebSocket Upgrade 握手（无第三方依赖）。
// 用法: node verify-stack-ws-probe.js <wsUrl> <cookieBase64|-> <upgrade|reject>
// 全局 WebSocket(undici) 是 WHATWG API，无法带自定义 Cookie 头 → 用 http 请求的
// 'upgrade' 事件完成握手，并校验 Sec-WebSocket-Accept = base64(sha1(key + GUID))。
const http = require('http');
const https = require('https');
const crypto = require('crypto');
// 所有失败都走 stdout（WS_* 标记 + 受控退出码），保证父脚本只捕 stdout 就够
process.on('uncaughtException', (e) => { console.log('WS_ERROR ' + (e && e.message ? e.message : e)); process.exit(2); });
// argv: [0]=node [1]=本脚本 [2]=wsUrl [3]=cookieBase64|'-' [4]=upgrade|reject
const wsUrl = process.argv[2];
const cookieB64 = process.argv[3] || '-';
const mode = process.argv[4] || 'upgrade';
try {
  const url = new URL(wsUrl);
  const mod = (url.protocol === 'https:' || url.protocol === 'wss:') ? https : http;
  const key = crypto.randomBytes(16).toString('base64');
  const expectedAccept = crypto.createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  const headers = {
    Host: url.host,
    Connection: 'Upgrade',
    Upgrade: 'websocket',
    'Sec-WebSocket-Key': key,
    'Sec-WebSocket-Version': '13',
  };
  if (cookieB64 !== '-') {
    headers.Cookie = Buffer.from(cookieB64, 'base64').toString('utf8');
  }
  const req = mod.request({
    hostname: url.hostname,
    port: url.port || (mod === https ? 443 : 80),
    path: url.pathname + url.search,
    headers,
    timeout: 15000,
  });
  req.on('upgrade', (res, socket) => {
    const acceptOk = res.headers['sec-websocket-accept'] === expectedAccept;
    console.log('WS_UPGRADE status=' + res.statusCode + ' acceptMatch=' + acceptOk);
    socket.destroy();
    process.exit(mode === 'upgrade' ? (res.statusCode === 101 && acceptOk ? 0 : 1) : 1);
  });
  req.on('response', (res) => {
    console.log('WS_REJECTED status=' + res.statusCode);
    const expectedReject = mode === 'reject' && res.statusCode === 401;
    res.resume();
    process.exit(expectedReject ? 0 : 1);
  });
  req.on('timeout', () => { console.log('WS_TIMEOUT'); req.destroy(); process.exit(2); });
  req.on('error', (e) => { console.log('WS_ERROR ' + e.message); process.exit(2); });
  req.end();
} catch (e) {
  console.log('WS_ERROR ' + (e && e.message ? e.message : e));
  process.exit(2);
}
'@ | Set-Content -Path $probeJs -Encoding ASCII

    function Invoke-WsProbe {
        param([string]$CookieBase64, [string]$Mode)
        $out = & node $probeJs $wsUrl $CookieBase64 $Mode
        $code = $LASTEXITCODE
        @{ Code = $code; Text = (($out | ForEach-Object { "$_" }) -join ' ').Trim() }
    }

    if ($Script:Auth) {
        # cookie 载荷与 FE writeAuthCookie 同形状：URI 编码的 JSON tokens
        $nowMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        $expiresIn = [int][Math]::Max(0, [Math]::Floor(($Script:Auth.ExpiresAt - $nowMs) / 1000))
        $payload = @{
            accessToken  = $Script:Auth.Token
            refreshToken = $Script:Auth.Refresh
            expiresIn    = $expiresIn
            expiresAt    = $Script:Auth.ExpiresAt
        } | ConvertTo-Json -Compress
        $cookieB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes(
            'luban_cad_auth=' + [uri]::EscapeDataString($payload)))

        $p = Invoke-WsProbe -CookieBase64 $cookieB64 -Mode 'upgrade'
        if ($p.Code -eq 0) {
            Add-Check 'C' "WS 握手 $wsUrl" $true "$($p.Text)（cookie luban_cad_auth，无 query token）"
        } elseif ($p.Code -eq 2) {
            Add-Check 'C' "WS 握手 $wsUrl" $false "$($p.Text)（MS 未起或 nginx /ws Upgrade 透传失效）"
        } else {
            Add-Check 'C' "WS 握手 $wsUrl" $false "$($p.Text)（cookie 握手未通过——看 MS 日志 WebSocket auth 行）"
        }

        # 负向探针：无 cookie 无 query token 必须被 401 拒（验 cookie 认证确实在拦）
        $n = Invoke-WsProbe -CookieBase64 '-' -Mode 'reject'
        if ($n.Code -eq 0) {
            Add-Check 'C' 'WS 无凭证拒绝' $true "$($n.Text)"
        } elseif ($n.Code -eq 2) {
            Add-Check 'C' 'WS 无凭证拒绝' $false "$($n.Text)" -NonFatal
        } else {
            Add-Check 'C' 'WS 无凭证拒绝' $false "$($n.Text) —— 无凭证连接未被拦，cookie/query 认证可能失效"
        }
    } else {
        Add-Check 'C' "WS 握手 $wsUrl" $false '无登录态（见上方登录失败行）——先解决登录再验 WS'
    }
}

# ============================================================
# Step D —— 原生库 dev-build 横幅（宿主日志优先，容器日志回退）
# ============================================================
Write-Host ''
Write-Host '== Step D: 原生库 dev-build 横幅 ==' -ForegroundColor Cyan
$banner = 'using dev build'
$foundIn = $null
$foundLine = $null

if (-not $msHealthy) {
    Add-Check 'D' 'MS dev-build 横幅' $false 'MS 未运行（Step A :4001/health 未通过），无从核验横幅'
} else {
    $hostLog = Join-Path $env:TEMP 'luban-cad-modeling-server.log'
    foreach ($f in @($hostLog, "$hostLog.err")) {
        if (-not $foundIn -and (Test-Path $f)) {
            $m = Select-String -LiteralPath $f -SimpleMatch -Pattern $banner
            if ($m) { $foundIn = "宿主日志 $f"; $foundLine = @($m)[0].Line }
        }
    }
    if (-not $foundIn) {
        $dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
        if ($dockerCmd) {
            Push-Location $RepoRoot
            try { $logs = & docker compose logs --tail 3000 modeling-server } finally { Pop-Location }
            $hits = @($logs) -match [regex]::Escape($banner)
            if ($hits.Count -gt 0) {
                $foundIn = 'docker compose logs modeling-server'
                $foundLine = [string]$hits[0]
            }
        }
    }
    if ($foundIn) {
        $line = "$foundLine".Trim()
        if ($line.Length -gt 120) { $line = $line.Substring(0, 120) + '...' }
        Add-Check 'D' 'MS dev-build 横幅' $true "命中于 $foundIn ：$line"
    } else {
        $dockerNote = if (Get-Command docker -ErrorAction SilentlyContinue) { '' } else { '（docker 不在 PATH，容器形态日志未查）' }
        $detail = "宿主日志 %TEMP%\luban-cad-modeling-server.log 与容器日志均无 '$banner' $dockerNote —— 重装 node_modules 后需重跑 scripts/replace-imodeljs-native.ps1 并重启 MS"
        Add-Check 'D' 'MS dev-build 横幅' $false -Detail $detail
    }
}

# ============================================================
# 汇总 + 退出码
# ============================================================
Write-Host ''
Write-Host '=== verify-stack 汇总 ===' -ForegroundColor Cyan
$display = $Script:Rows | ForEach-Object {
    $d = $_.Detail
    if ($d.Length -gt 88) { $d = $d.Substring(0, 88) + '...' }
    [pscustomobject]@{ Step = $_.Step; Result = $_.Result; Check = $_.Check; Detail = $d }
}
$display | Format-Table -AutoSize | Out-String -Width 200 | ForEach-Object { Write-Host $_ }

$okCount = @($Script:Rows | Where-Object { $_.Result -eq 'OK' }).Count
$total = $Script:Rows.Count
if ($Script:FatalFails -gt 0) {
    Write-Host ("结果: {0}/{1} 项通过，{2} 项致命失败 → 退出码 1" -f $okCount, $total, $Script:FatalFails) -ForegroundColor Red
    exit 1
}
Write-Host ("结果: {0}/{1} 项全部通过 → 退出码 0" -f $okCount, $total) -ForegroundColor Green
exit 0
