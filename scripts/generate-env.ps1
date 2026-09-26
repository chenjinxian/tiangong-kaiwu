# ============================================================
# generate-env.ps1 — 幂等生成仓库根 .env（随机密钥版 .env.example）
# 用法: powershell -File scripts/generate-env.ps1 [-Force]
# -Force: 覆盖已存在的 .env（默认跳过）
# ============================================================
param([switch]$Force)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

if ((Test-Path .env) -and -not $Force) {
  Write-Host ".env 已存在，跳过生成（覆盖请加 -Force）" -ForegroundColor Yellow
  exit 0
}

function New-Hex([int]$Bytes) {
  $b = [byte[]]::new($Bytes)
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($b) } finally { $rng.Dispose() }
  ($b | ForEach-Object { $_.ToString('x2') }) -join ''
}

$envMap = [ordered]@{
  'IMODELHUB_ADMIN_EMAIL'    = 'admin@example.com'
  'IMODELHUB_ADMIN_PASSWORD' = New-Hex 16
  'BACKEND_API_KEY'          = New-Hex 32
  'WEBAGENT_API_KEY'         = New-Hex 32
  'CSRF_SECRET'              = New-Hex 32
  'AZURITE_ACCOUNT_KEY'      = 'Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw=='  # Azurite well-known（真实存储时换）
  'WEBHOOK_SECRET'           = New-Hex 32
  'IMODELHUB_API_KEY'        = New-Hex 32
}

$lines = @(('# 由 scripts/generate-env.ps1 生成于 ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')), '# 完整变量说明见 .env.example', '')
foreach ($k in $envMap.Keys) { $lines += "$k=$($envMap[$k])" }

Set-Content -Path .env -Value ($lines -join "`r`n") -Encoding utf8
Write-Host ".env 已生成（10 项）。注意：" -ForegroundColor Green
Write-Host "  1) WEBHOOK_SECRET 需与 imodelhub-services 的 webhook 订阅 secret 一致（见 docs/WEBHOOK_CONFIG.md）"
Write-Host "  2) IMODELHUB_ADMIN_EMAIL/PASSWORD 需与 HUB 侧账号对齐（HUB 自带 seed，不一致时改 HUB 侧或本文件）"
