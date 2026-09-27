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
  'WEBHOOK_SECRET'           = New-Hex 32
  'AUTH_JWT_SECRET'          = New-Hex 32
  'IMODELHUB_API_KEY'        = New-Hex 32
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
