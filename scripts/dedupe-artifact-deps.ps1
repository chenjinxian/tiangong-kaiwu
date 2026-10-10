# ============================================================
# dedupe-artifact-deps.ps1 — 产物依赖实例去重（junction 化）
#
# 根因（2026-10-10 写循环风暴定案，产物代码复现归零）：
#   后端产物 tgz 分装时把 link:/rush 的符号链接 dereference 成了实体
#   拷贝，@itwin/core-geometry 等包在产物内出现多份独立实例
#   （node_modules\@itwin\core-common\node_modules\@itwin\core-geometry …）。
#   Node 按真实路径缓存模块 → 跨拷贝 instanceof 恒 false →
#   BGFBWriter 序列化外来 Loop/LineString3d 返回 undefined →
#   appendGeometryQuery 静默 false → runKernel 送 [undefined,…] 给
#   native 抛 "Expected geometry opcode: " → 每个 extrude 求值恒败 →
#   ensureWarm 每次 RPC 冷重建 + commit → notifyCommit 风暴（96/s）。
#
# 修复：嵌套包与顶层同名同版本 → 删嵌套实体，junction 指回顶层。
#   junction 后两条解析路径 realpath 合一 → 单实例（rush 单仓语义还原）。
#   @bentley\imodeljs-native 一并去重：双份 .node 会产生两个原生运行时
#   （各自 SQLite 池/内核状态），同样必须合一。
#
# 幂等：已是正确 junction 则跳过；版本不一致则保留并警告（真实版本
#   分叉，不能强行合并）。仅在 Windows 产物树上运行（MS 宿主仅 Windows）。
#
# 用法: powershell -File scripts\dedupe-artifact-deps.ps1 [-MsDir <产物目录>]
# 接线: fetch-backend.ps1 解压后调用；start-ms-host.ps1 产物模式启动前
#       幂等补调（覆盖已拉取未愈合的旧产物树）。
# ============================================================
[CmdletBinding()]
param(
  [string]$MsDir = 'D:\Github\tiangong-kaiwu\dist-backend\modeling-server'
)
$ErrorActionPreference = 'Stop'

if (-not (Test-Path (Join-Path $MsDir 'node_modules'))) {
  Write-Host "dedupe-artifact-deps: $MsDir 无 node_modules，跳过（非产物树？）" -ForegroundColor Yellow
  return
}

$scopeDirs = Join-Path $MsDir 'node_modules\@itwin'
$topLevel  = Join-Path $MsDir 'node_modules'
$replaced = 0; $skipped = 0; $warned = 0

# 扫描所有 node_modules\@itwin\<P>\node_modules\@{itwin,bentley}\<Q> 嵌套实体
Get-ChildItem -Path $scopeDirs -Directory | ForEach-Object {
  $nestedRoot = Join-Path $_.FullName 'node_modules'
  if (-not (Test-Path $nestedRoot)) { return }
  foreach ($scope in @('@itwin', '@bentley')) {
    $nestedScope = Join-Path $nestedRoot $scope
    if (-not (Test-Path $nestedScope)) { continue }
    Get-ChildItem -Path $nestedScope -Directory | ForEach-Object {
      $nested = $_.FullName
      $top = Join-Path $topLevel "$scope\$($_.Name)"
      if (-not (Test-Path $top)) { return }  # 无顶层同名包：唯一实例，不动

      # 版本一致性（package.json version）——分叉则警告保留
      $nv = (Get-Content (Join-Path $nested 'package.json') | ConvertFrom-Json).version
      $tv = (Get-Content (Join-Path $top 'package.json') | ConvertFrom-Json).version
      if ($nv -ne $tv) {
        Write-Host "  ! 版本分叉保留: $nested (v$nv) ≠ 顶层 (v$tv)" -ForegroundColor Yellow
        $script:warned++
        return
      }
      # 幂等：已是正确 junction 则跳过
      $item = Get-Item $nested -Force
      if ($item.LinkType -eq 'Junction' -and $item.Target -eq $top) { $script:skipped++; return }

      Remove-Item -Recurse -Force $nested
      New-Item -ItemType Junction -Path $nested -Target $top | Out-Null
      $script:replaced++
      Write-Host "  ⊕ junction: $($_.Name) ← $nested" -ForegroundColor DarkGray
    }
  }
}

Write-Host "dedupe-artifact-deps: 合并 $replaced / 已是 $skipped / 分叉保留 $warned" -ForegroundColor $(if ($warned -gt 0) { 'Yellow' } else { 'Green' })
