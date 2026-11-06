# ============================================================
# make-deploy-bundle.ps1 — 生成“部署包”（不包含 itwinjs-core / luban-cad 源码）
#
# 外部体验者不 clone 大仓，只下载本包（几十 KB）即可：
#   docker-compose.yml + scripts + deploy/nginx 配置 + 精简 README
# web/bff/imodelhub/webhook-agent 全部是公开镜像，modeling-server 走公开
# Release 产物；因此部署包不需要任何仓库源码或本地构建。
#
# 用法: powershell -File scripts/make-deploy-bundle.ps1 [-Tag backend-YYYYMMDD]
# 输出: dist-out/luban-cad-deploy-<Tag>.zip
# 发布: gh release upload <Tag> dist-out/luban-cad-deploy-<Tag>.zip --repo <owner/repo> --clobber
# ============================================================
[CmdletBinding()]
param(
  [string]$Tag = "backend-$(Get-Date -Format 'yyyyMMdd')"
)
$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$stage = Join-Path $env:TEMP ("luban-cad-deploy-" + [guid]::NewGuid().ToString('N'))
$bundle = Join-Path $stage 'luban-cad-deploy'
$outDir = Join-Path $RepoRoot 'dist-out'
New-Item -ItemType Directory -Force $bundle, $outDir | Out-Null

# 运行时必需文件（白名单；源码/构建输入一律不带）
$files = @(
  'docker-compose.yml',
  'deploy/nginx.conf',
  'deploy/default.conf.template',
  'scripts/generate-env.ps1',
  'scripts/fetch-backend.ps1',
  'scripts/dedupe-artifact-deps.ps1',
  'scripts/start-ms-host.ps1',
  'scripts/stop-ms-host.ps1',
  'scripts/verify-stack.ps1',
  'scripts/verify-public-deps.ps1',
  'scripts/quickstart.ps1',
  'docs/Deployment-Guide.md'
)
foreach ($rel in $files) {
  $src = Join-Path $RepoRoot $rel
  if (-not (Test-Path $src)) { throw "部署包缺文件: $rel" }
  $dst = Join-Path $bundle $rel
  New-Item -ItemType Directory -Force (Split-Path $dst -Parent) | Out-Null
  Copy-Item $src $dst -Force
}

$readme = @"
# 鲁班CAD 本地部署包（$Tag）

不需要克隆源码仓，不需要 GitHub 账号，不需要 docker login。

## 前置

- Windows 10/11 x64
- Docker Desktop（已启动，WSL2 后端）
- Node.js 20.12+（推荐 22 LTS）
- 内存 >= 8 GB，磁盘 >= 8 GB

## 一键启动

在解压后的本目录执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/quickstart.ps1
```

脚本会：生成随机密钥 `.env` -> 匿名下载 modeling-server 产物（支持断点续传）
-> 拉取 4 个公开镜像（web / bff / imodelhub / webhook-agent）
-> 启动容器栈与宿主 modeling-server -> 全栈验收 -> 打开 http://localhost:5301。

注册任意邮箱即可体验。HUB 管理员账号在 `.env` 的
IMODELHUB_ADMIN_EMAIL / IMODELHUB_ADMIN_PASSWORD。

## 需要获取的完整服务

| 服务 | 来源 | 认证 |
|---|---|---|
| web | GHCR ghcr.io/chenjinxian/luban-web-public:latest | 无 |
| bff | GHCR ghcr.io/chenjinxian/luban-bff-public:latest | 无 |
| imodelhub | GHCR ghcr.io/chenjinxian/imodelhub-public:latest | 无 |
| webhook-agent | GHCR ghcr.io/chenjinxian/luban-webhook-agent-public:latest | 无 |
| modeling-server | GitHub Releases modeling-server-win-x64-*.tgz | 无 |
| postgres / redis / maildev / azurite / nginx | Docker Hub / MCR 官方镜像 | 无 |

宿主只需 Node.js；native/slvs/ACIS 均随 modeling-server 产物分发。
当前仅支持 Windows（modeling-server 是 Windows 原生宿主进程）。

## 常用命令

```powershell
powershell -NoProfile -File scripts/verify-public-deps.ps1   # 公开依赖完整性
powershell -NoProfile -File scripts/verify-stack.ps1        # 全栈验收
docker compose down                                          # 停止容器栈
powershell -NoProfile -File scripts/stop-ms-host.ps1         # 停止宿主后端
```

完整说明与故障排除见 `docs/Deployment-Guide.md`，或
https://github.com/chenjinxian/tiangong-kaiwu
"@
Set-Content -Path (Join-Path $bundle 'README.md') -Value $readme -Encoding utf8
Set-Content -Path (Join-Path $bundle 'VERSION.txt') -Value $Tag -Encoding ascii

$zip = Join-Path $outDir "luban-cad-deploy-$Tag.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $bundle '*') -DestinationPath $zip -Force
Remove-Item -Recurse -Force $stage

# 稳定名（文档使用 releases/latest/download/luban-cad-deploy.zip，不依赖 tag）
Copy-Item $zip (Join-Path $outDir 'luban-cad-deploy.zip') -Force

$item = Get-Item $zip
Write-Host "==> 部署包: $($item.FullName)（$([math]::Round($item.Length / 1KB)) KB）" -ForegroundColor Green
Write-Host "    稳定名: $(Join-Path $outDir 'luban-cad-deploy.zip')" -ForegroundColor DarkGray
Get-FileHash $zip -Algorithm SHA256 | Format-List
