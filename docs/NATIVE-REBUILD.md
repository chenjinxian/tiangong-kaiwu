# Native Delivery 从 HEAD 重建 Runbook

本文是 `release-gate.ps1` 在 `fallbackRequired=true` 时要求的人工路径。**默认发布
门对 store fallback 直接 FAIL**；`-AllowNativeFallback` 只用于已明确授权的 qualified
发布，不是干净发布。

## 当前现场（2026-11-01）

- `imodel-native` 分支 `dev/source-build`，HEAD `d29cf7e49fc2`。
- `out/cmake` 构建树不存在；`Delivery` 缺失（`deliveryPresent=false`）。
- `VCPKG_ROOT` 未设置，`D:\Github\vcpkg\installed`/`downloads` 为空。
- 因此 MS 产物 `backend-20261101-p29b` 使用 pnpm store 的 dev build 5.15.5
  （store devbuild 2026-10-26 早于 HEAD 2026-10-29）；provenance 明确记录
  `fallbackRequired=true`、`freshness=store-predates-head`。

## 前置

- Windows x64，Visual Studio 2022 Community（MSVC x64 工具链）。
- CMake ≥ 3.24（本机 4.1.2）。
- Ninja（VS 自带：`Common7\IDE\CommonExtensions\Microsoft\CMake\Ninja\ninja.exe`）。
- vcpkg checkout（本机 `D:\Github\vcpkg`，需 `vcpkg.exe` 已 bootstrap）。
- 可访问 vcpkg 依赖下载源；磁盘余量 ≥ 20 GB（完整 C++ 构建 + 6 个 vcpkg 库）。
- 时间：首次完整构建通常以小时计；不要用 legacy BentleyBuild 路径。

## 构建

在 **x64 Native Tools Command Prompt for VS 2022** 中执行（确保 `cl.exe` 在
PATH；普通 PowerShell 先 `call vcvars64.bat`）：

```bat
cd /d D:\Github\imodel-native
git checkout dev/source-build
set VCPKG_ROOT=D:\Github\vcpkg
set VCPKG_DOWNLOADS=D:\Github\vcpkg\downloads
cmake --preset win-x64-release -DITWIN_VCPKG_ROOT=D:/Github/vcpkg
cmake --build --preset win-x64-release
```

若 CMake 找不到 Ninja，把 VS 的 Ninja 目录加入 PATH，或在 preset 中显式
`-DCMAKE_MAKE_PROGRAM=<...>\ninja.exe`。vcpkg 六个库
（compress/png/pugixml/openssl/curl/crashpad）由构建目标按序安装，首次会下载并
编译。

## 验收

1. `D:\Github\imodel-native\out\cmake\win-x64-release\Delivery` 存在，且包含
   `imodeljs-native.node`、`iTwinNapi.dll` 等必需文件。
2. 应用替换：
   ```powershell
   powershell -File D:\Github\tiangong-kaiwu\scripts\replace-imodeljs-native.ps1
   ```
   release 为默认配置；后端私有仓现场用
   `-ScanRoots D:\Github\luban-backend\modeling-server -ScanRoots D:\Github\luban-backend\webhook-agent`。
3. 重建 MS 产物（**不带** `-AllowStoreNativeFallback`）：
   ```powershell
   powershell -File D:\Github\luban-backend\scripts\build-ms-dist.ps1 -Tag backend-<date>-native
   ```
   检查 `native-provenance.json`：`deliveryPresent=true`、`fallbackRequired=false`、
   `freshness` 不再是 `store-predates-head`；产物 RPC 契约版本不变。
4. 安装并运行发布门：
   ```powershell
   powershell -File D:\Github\tiangong-kaiwu\scripts\fetch-backend.ps1 -LocalArtifact <tgz>
   powershell -File D:\Github\tiangong-kaiwu\scripts\start-ms-host.ps1 -Detach
   powershell -File D:\Github\tiangong-kaiwu\scripts\release-gate.ps1 -ExpectedSha256 <sha256>
   ```
   干净发布必须 **不带** `-AllowNativeFallback` 通过。
5. `verify-stack` 17/17；发布镜像 e2e 复跑；记录 provenance 到发布记录/ADR。

## 注意

- `using dev build from …` 横幅**不能**证明版本或新鲜度；以 provenance JSON 为准。
- store fallback 是显式授权的产物构建路径，不是“已从 HEAD 构建”。
- native Delivery 重建不改变 web 镜像；web 仍按 `rebuild-web.ps1` 从提交重建。
- 该构建与 `DeleteSubEntitiesOperation` 的 SUCCESS 共面分裂种子是两条独立的
  native 长线：前者是发布 provenance，后者是内核测试种子（见 M-A5.2 plan
  Result/Backlog）。
