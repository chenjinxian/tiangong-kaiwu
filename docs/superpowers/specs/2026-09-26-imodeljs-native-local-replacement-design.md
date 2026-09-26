# 设计：本地编译 imodeljs.node 替换 itwinjs-core 原生库 + 上游同步联动

日期：2026-09-26
状态：已与用户逐节确认

## 背景与目标

imodel-native（`D:\Github\imodel-native`，分支 `dev/source-build`，基线 v5.14.32 + 144 个自有提交）已完成 BRepCore+ACIS 改造，并补充 PSBRepGeometry、Visualization 两个模块。目标：

1. itwinjs-core 的 backend 消费**本地编译的 imodeljs.node**，不再使用 npm 平台子包里的官方二进制；
2. itwinjs-core 上游同步后，imodel-native 有确定流程跟进（同步 → 重编译 → 替换），不会静默失配。

## 关键事实（已探明）

- `itwinjs-core/core/backend/package.json` 固定依赖 `@bentley/imodeljs-native@5.14.35`（当前上游 master 所需版本）。
- 该 npm 包 = TS wrapper（`lib/`）+ `IModelJsNative` typings + postinstall（`installNativePlatform.js`：从平台子包 `@bentley/imodeljs-win32-x64@<version>` 把 `imodeljs.node` + 伴生 DLL + `Assets/` 拷入包目录的 `imodeljs-win32-x64/` 平台目录）。
- 运行期加载：`NativeLibrary.load()` → `require("./imodeljs-win32-x64/imodeljs.node")`，相对已安装包的 JS 入口解析；`devbuild.json` 存在时 `isDevBuild` 为真并打印 `using dev build from …`（官方 `linkNativePlatform.bat` 的开发通道，N-API ABI 稳定、无 Node 版本矩阵）。
- Rush 侧已在 `itwinjs-core/common/config/rush/pnpm-config.json` 的 `globalOnlyBuiltDependencies` 放行该包构建脚本。
- imodel-native 的 `api_package/ts`（TS wrapper）自 v5.14.32 起**零改动**——改动全在 N-API 之后的 C++ 层，TS 面继续用 npm 包的即可。
- 本地权威构建产物：`out/cmake/win-x64-{release,debug}/Delivery/`（含 `imodeljs.node`、`iTwin*.dll`、`SPAAcisDs.dll`、`Assets/`、`ECSchemas/` 等，与官方平台子包 tgz 同构；Assets 与官方 5.14.35 无差异，用户确认）。
- imodel-native 已有 `sync-from-upstream.ps1`（upstream/main → merge 进 `dev/source-build` → push fork）；tiangong-kaiwu 已有 `scripts/sync-from-upstream.sh`（subtree pull）。
- `modeling-server` / `webhook-agent` 经 pnpm `link:` 消费 core-backend，Node 按真实路径解析，原生包物理安装现场理论上只有 itwinjs-core 的 Rush store 一处；但脚本不做此假设（当前全仓 node_modules 未安装，首次激活时以实测为准）。
- **当前版本漂移**：dev/source-build 尚未包含上游 5.14.33–35 改动，首次替换会被硬门槛拦截（预期行为）。

## 方案选型

选定 **A. copy-in overlay + 显式脚本 + 硬门槛**（用户确认）。否决项：

- B. `IMODELJS_NATIVE_OVERRIDE` 安装期自动注入——漏设变量时静默回退官方二进制；
- C. 依赖改 link:/file:——违反「Rush lockfile 与上游逐字节一致」硬约束；
- D. junction 整目录替换（官方 bat 原样照搬）——pnpm store 下误伤面大、可能被 rush 修复逻辑覆盖（借鉴其 devbuild.json + banner 验证思路）。

用户决策：Release 为默认配置（`--config debug` 可切）；版本硬门槛替前必验；显式脚本 + 验证。

## 设计 1：替换脚本 `tiangong-kaiwu/scripts/replace-imodeljs-native.ps1`

输入：imodel-native 仓路径（默认 `D:\Github\imodel-native`，参数/环境变量可覆盖）、`-Config release|debug`（默认 release）。

步骤：

1. **读版本**：解析 `itwinjs-core/core/backend/package.json` 中 `@bentley/imodeljs-native` 版本 → 所需版本（当前 5.14.35）。
2. **硬门槛（合并基线校验）**：imodel-native 仓内 `git merge-base --is-ancestor v<所需版本> HEAD`；不满足 → 报错退出，提示三步：跑 imodel-native `sync-from-upstream.ps1`（解冲突）→ 重编译 → 重跑本脚本。
3. **产物校验**：`out/cmake/win-x64-<config>/Delivery/` 存在且含 `imodeljs.node` 与伴生 DLL（`SPAAcisDs.dll` 等）；缺失 → 提示先构建。
4. **定位安装现场**：扫描 itwinjs-core Rush store（`common/temp/node_modules/.pnpm/@bentley+imodeljs-native@*/…`）及 modeling-server / webhook-agent / luban-cad 各 node_modules（含 `.pnpm`）中所有 `@bentley/imodeljs-native` 实际目录；扫到几处覆盖几处，幂等；一处都没有 → 提示先 `rush update`。
5. **现场版本匹配**：现场包版本 ≠ 所需版本 → 报错提示先 `rush update`（避免旧版本 wrapper 配新基线二进制，或反之）。
6. **覆盖**：Delivery 中与官方平台子包同构的文件集（`imodeljs.node`、`iTwin*.dll`、`SPAAcisDs.dll`、`Assets/`、`ECSchemas/`、CrashpadHandler 等；布局参照已解包样本 `D:\Github\imodel-native\out\npm-pkg\package\`）拷入现场包的平台目录（按目录名 `imodeljs-win32-x64` 定位，不猜路径）；并在包 JS 入口同级写 `devbuild.json`。TS wrapper / typings / `package.json` 保持 npm 原样。
7. **验证**：每现场起 `node -e` 子进程加载该包 `NativeLibrary`，断言 `isDevBuild === true`、`load()` 成功（N-API 拉起 + 伴生 DLL 解析）；输出「现场 → 已替换/已验证」汇总表。

## 设计 2：版本联动与上游同步流程

耦合模型：以 `itwinjs-core/core/backend/package.json` 的原生库版本为唯一事实源——imodel-native 分支必须包含 `v<该版本>` tag（硬门槛保证），node_modules 现场必须是该版本（步骤 5 保证）。

上游同步流程：

1. `bash scripts/sync-from-upstream.sh`（subtree pull，核心逻辑不动）。
2. **新增尾步**：比对同步前后原生库版本；有变化打印联动指令（imodel-native 同步 → 重编译 → 回来替换），无变化提示「原生库无需跟进」。
3. imodel-native：跑现有 `sync-from-upstream.ps1`（冲突人工解，不另造脚本）。
4. 重编译 CMake（win-x64-release，按需 debug）刷新 Delivery。
5. tiangong-kaiwu：`rush update` → 按需 `rush build --to ...` → `replace-imodeljs-native.ps1`。
6. `docs/UPSTREAM_SYNC.md` 同步记录追加原生库版本变化行（沿用现有习惯）。

重装还原：任何 `rush update` / `pnpm install` 重装后重跑替换脚本；后端启动无 "using dev build" banner 即回退信号。

升级路径（现在不做，只留门）：将来若 N-API 面新增接口、`api_package/ts` 有改动，则 CMake 产物纳入完整包布局（编译后 lib/ + 平台目录），替换脚本升级为整包替换。

## 设计 3：验证与失败模式

验证三层：脚本内置（每现场 node 子进程加载断言）→ 启动可见性（banner）→ 集成冒烟（modeling-server 打开模型 + 现有 BRep/ACIS 冒烟，复用不新造）。

失败模式对策：

| 场景 | 对策 |
|---|---|
| 原生版本已变、imodel-native 未跟 | 硬门槛拦截，报错直给三步指令 |
| 重装后忘重跑替换 | banner 消失即信号；重跑即恢复；写入 UPSTREAM_SYNC.md 检查清单 |
| 现场包版本过期 | 步骤 5 拦截，提示 `rush update` |
| imodel-native 合并冲突 | 人工解决（脚本边界外，报错指路） |
| pnpm 硬链接 | 覆盖写只断开本地链接，store 不被污染 |
| Node 升级 | N-API ABI 稳定，无重编矩阵 |

## 设计 4：改动面汇总

新增：`tiangong-kaiwu/scripts/replace-imodeljs-native.ps1`（唯一新代码）。

修改（均不在 itwinjs-core 树内，lockfile 纯净性不受影响）：

- `scripts/sync-from-upstream.sh`：追加原生库版本变化检测尾步；
- `docs/UPSTREAM_SYNC.md`：联动流程一节 + 同步记录模板加原生库行；
- 根 `CLAUDE.md`：常用命令/流水线补一行（`rush update` 后须跑 replace 脚本；两仓同步联动关系）。

明确不改：`itwinjs-core/` 内任何文件（`core/backend/package.json` 继续钉 npm 5.14.35）、imodel-native 现有脚本、modeling-server / webhook-agent / luban-cad 的 package.json。

## 首次实施序

1. imodel-native 合并 upstream/main 至 ≥ v5.14.35（用户解冲突）；
2. CMake win-x64-release 重编译；
3. tiangong-kaiwu `rush update` + `rush build`；
4. 跑 `replace-imodeljs-native.ps1`（现场布局以此时实测为准，回填脚本）；
5. modeling-server 启动确认 banner + BRep/ACIS 冒烟。
