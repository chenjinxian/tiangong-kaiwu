# ============================================================
# generate-env.ps1 — 幂等生成仓库根 .env（随机密钥版 .env.example）
# 用法: powershell -File scripts/generate-env.ps1 [-Force]
# 默认合并语义：.env 已存在时保留其中已有键的现值，仅追加模板新增键
# （存量部署升级用，绝不覆盖已配好的密钥）；-Force 重新生成全部键。
# ============================================================
param([switch]$Force)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

function New-Hex([int]$Bytes) {
  $b = [byte[]]::new($Bytes)
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($b) } finally { $rng.Dispose() }
  ($b | ForEach-Object { $_.ToString('x2') }) -join ''
}

# 模板（含全部键的生成值）；.env 已存在的键在下方合并阶段被现值覆盖
$envMap = [ordered]@{
  'IMODELHUB_ADMIN_EMAIL'    = 'admin@example.com'
  'IMODELHUB_ADMIN_PASSWORD' = New-Hex 16
  'BACKEND_API_KEY'          = New-Hex 32
  'CSRF_SECRET'              = New-Hex 32
  'AZURITE_ACCOUNT_KEY'      = 'Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw=='  # Azurite well-known（真实存储时换）
  # HUB 预签名 URL 主机改写双 env（Sync S4/S5）：HUB 用它自己的 AZURE_BLOB_ENDPOINT 给
  # changeset/baseline _links 签名（容器网内主机 azurite:10000，宿主 MS 进程不可解析）。
  # MS 侧两键同设 → 预签名 URL 的 host 匹配 endpoint 的 host 时改写为 PUBLIC_HOST
  # （SAS 只签路径+查询，换主机不失效；任一缺省恒不改写）。值须与根 docker-compose.yml
  # 里 imodelhub 服务的 AZURE_BLOB_ENDPOINT 一致；仅宿主 MS 进程消费（容器网内自可达）。
  # 宿主 Azurite 发布口为 10500（容器内仍 10000）——2026-10-20 端口重排。
  'AZURE_BLOB_ENDPOINT'      = 'http://azurite:10000/devstoreaccount1'
  'AZURE_BLOB_PUBLIC_HOST'   = '127.0.0.1:10500'
  # ---- 宿主服务端口（专用段 53xx/54xx，避开 itwinjs-core 的 3000/3001/5000/8080） ----
  'PORT'                     = '5401'                       # modeling-server 宿主进程
  'IMODELHUB_URL'            = 'http://localhost:5400'
  'FRONTEND_URL'             = 'http://localhost:5300'
  'MODELING_SERVER_URL'      = 'http://localhost:5401'      # WA 宿主直连调试用
  'AZURITE_HOST'             = '127.0.0.1:10500'            # 宿主 MS 访问 Azurite
  'MS_UPSTREAM'              = 'host.docker.internal:5401'
  'HUB_UPSTREAM'             = 'host.docker.internal:5400'
  'WA_MODELING_SERVER_URL'   = 'http://host.docker.internal:5401'
  'HUB_ALLOWED_ORIGINS'      = 'http://localhost:5300,http://localhost:5301'  # 5300=web-next dev（C2 退役迁入）；5301=nginx 单入口
  'BFF_ALLOWED_ORIGINS'      = 'http://localhost:5300,http://localhost:5301'
  'WEBHOOK_SECRET'           = New-Hex 32
  'AUTH_JWT_SECRET'          = New-Hex 32
  # HUB 辅助 JWT 密钥（refresh/forgot/confirm-email 令牌签名；2026-10-12 审计 P1#2：
  # 此前未单源化，容器沿用公开镜像烘焙的默认值——伪造 refresh/forgot 令牌风险）
  'AUTH_REFRESH_SECRET'      = New-Hex 32
  'AUTH_FORGOT_SECRET'       = New-Hex 32
  'AUTH_CONFIRM_EMAIL_SECRET'= New-Hex 32
  'IMODELHUB_API_KEY'        = New-Hex 32
  # nginx 的 /api 上游（RW1-T3 BFF v1，与根 docker-compose.yml 的 BFF_UPSTREAM 缺省同值）：
  # 缺省 host.docker.internal:5401 直达宿主 MS（BFF 未启用行为同 RW1 前）；启用 BFF 改 luban-bff:5403
  'BFF_UPSTREAM'             = 'host.docker.internal:5401'
}

$mode = '生成'
if (Test-Path .env) {
  if ($Force) {
    $mode = '重新生成'
  } else {
    $mode = '合并'
    # 把已有 KEY= 行解析进映射作为基线（保留现值；模板外键如历史 WEBAGENT_API_KEY 原样保留）
    foreach ($line in (Get-Content .env)) {
      if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
        $envMap[$Matches[1]] = $Matches[2]
      }
    }
  }
}

$lines = @(('# 由 scripts/generate-env.ps1 ' + $mode + ' 于 ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')), '# 完整变量说明见 .env.example', '')
foreach ($k in $envMap.Keys) { $lines += "$k=$($envMap[$k])" }

Set-Content -Path .env -Value ($lines -join "`r`n") -Encoding utf8
Write-Host ".env 已$mode（$($envMap.Count) 键）。注意：" -ForegroundColor Green
Write-Host "  1) WEBHOOK_SECRET 需与 imodelhub-services 的 webhook 订阅 secret 一致（见 docs/WEBHOOK_CONFIG.md）"
Write-Host "  2) IMODELHUB_ADMIN_EMAIL/PASSWORD 需与 HUB 侧账号对齐（HUB 自带 seed，不一致时改 HUB 侧或本文件）"
