# 上游同步指南 (Upstream Sync)

如何把 [iTwin/itwinjs-core](https://github.com/iTwin/itwinjs-core) 官方 master 的更新同步到
**tiangong-kaiwu 单仓** 的 `itwinjs-core/` 目录（vendor 前缀，git-subtree squash 谱系）。

> 最近一次同步实例：2026-09-23 完成 5.14.0-dev.15→5.14.0-dev.17（8 个上游提交，基线 sha `0b08bc37cc`）。
> 同日完成仓库整合：tiangong-kaiwu 成为唯一 git 仓库，`itwinjs-core/`、`luban-cad/` 降级为
> 仓库内目录；itwinjs-core 基线以 subtree-squash 导入，自定义改动以普通提交叠在其上。
> 上一轮（嵌套 fork 仓时期）：2026-09-22 5.9→5.14 合并（merge `6f260204a6` + 修复 `8feafd5efc`）。

## 仓库模型（2026-09-23 起）

| 位置 | 角色 |
|------|------|
| `tiangong-kaiwu`（本仓） | **唯一 git 仓库**（origin: `chenjinxian/tiangong-kaiwu`） |
| `itwinjs-core/` | 依赖库源码 = iTwin 官方 + 自定义改动；以 subtree-squash 与上游同步 |
| `luban-cad/` | 鲁班CAD 应用目录（由冻结历史拷贝迁出，link: 消费 itwinjs-core 源码） |
| itwinjs-core 内的历史拷贝目录（旧品牌名） | 冻结存档，保持原样、勿改勿引用 |

上游远程：本仓 `upstream` = `https://github.com/iTwin/itwinjs-core.git`。

## 一键同步

```bash
bash scripts/sync-from-upstream.sh   # 于仓库根目录执行
```

## imodel-native 联动（本地 imodeljs.node 替换）

`scripts/sync-from-upstream.sh` 尾部会自动比对 `core/backend/package.json` 中
`@bentley/imodeljs-native` 版本；变化时须按序完成（`scripts/replace-imodeljs-native.ps1`
的硬门槛会强制校验第 1 步）：

1. imodel-native 仓（`D:\Github\imodel-native`，分支 `dev/source-build`）跑 `.\sync-from-upstream.ps1`（冲突手工解）
2. `cmake --preset win-x64-release && cmake --build --preset win-x64-release`（按需加 debug）
3. 本仓 `rush update` → 按需 `rush build` → `powershell -File scripts/replace-imodeljs-native.ps1`

任何 `rush update` / `pnpm install` 重装 node_modules 后，替换会被还原，需重跑替换脚本；
后端启动无 "using dev build from …" banner 即已回退官方二进制。详见
`docs/superpowers/specs/2026-09-26-imodeljs-native-local-replacement-design.md`。

## 手动流程

```bash
git fetch upstream master
git subtree pull --prefix=itwinjs-core --squash upstream master
# 有冲突时解决后: git add -A && git commit --no-edit
# 完成后在下方「同步记录」追加一行
```

> squash 谱系保证 git 每次都能做三方合并；自定义改动集中在 `editor/*` 与
> `core/backend/CheckpointManager.ts` 等少数文件，冲突面很小。
> **不要**手工改 `common/config/rush/pnpm-lock.yaml`——冲突时取上游版本。

## 冲突处理

（新模型）自定义改动集中在 `editor/*` 与少量 `core/*` 文件；lockfile / rush 配置与上游
逐字节一致（合体工作区已解耦），冲突一律取上游版本。

（历史经验——嵌套 fork 仓合体工作区时期，2026-09 同步 5.9→5.14 实测；保留备查）

1. **lockfile 冲突**：`common/config/rush/pnpm-lock.yaml` 不要手工合并——取 master 版本
   (`git checkout --theirs`)，然后跑 `rush update` 重新生成。上游删除了根目录
   `pnpm-lock.yaml`，跟随删除即可。

2. **`rush update` 报版本不一致** (`ensureConsistentVersions`)：把 occ 各 package.json
   的 vitest/vite/ws/tsx 等版本对齐到上游用的版本。

3. **pnpm 报 `No matching version found for @itwin/xxx@5.xx.0-dev.N`**：某个发布包
   （如 `@itwin/web-viewer-react`）的 peerDependencies 需要 itwin 包，pnpm 会拿
   workspace 当前版本号去 registry 找——但 dev 版本没发布。解法：在对应 occ 包里
   显式声明 `"@itwin/xxx": "workspace:*"`，让 peer 由本地链接满足。

4. **接口新增方法**：上游给 `IpcAppFunctions` 等接口加方法时，occ 的实现类
   （如 `AppFunctionIpcHandler`）要补实现。参照 `core/backend/src/IpcHost.ts` 里
   的官方实现照搬即可。

5. **依赖小版本升级的类型收紧**：vitest 4 的 `vi.fn()` 泛型、react-query 的
   `StaleTimeFunction`、@types/react 的 Profiler phase 新增 `'nested-update'`、
   iTwinUI 的 `menuItems` 回调要求返回 `Element[]`——都是局部小修。

6. **`git config` 注意**：Rush 有 git 邮箱策略检查（要求
   `xxx@users.noreply.github.com` 格式）。本地 rush 操作加 `--bypass-policy` 跳过即可，
   不影响提交本身。

## 路径搬迁注意事项（2026-09-23 实测，仍然适用）

仓库根曾整体搬迁（依赖库在其 `itwinjs-core/` 子目录），此后
`itwinjs-core/common/temp/last-install.flag` 会钉着旧
`rushJsonFolder`/`storePath`，rush 报 `Current PNPM store path does not match the last one used`
并拒绝安装。修复：把这两个字段改写为当前绝对路径，或 `rush update --purge` 全量重装。
另：工作区项目集变化后 pnpm 要清旧 `node_modules`，非交互环境报
`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`——加 `CI=true` 环境变量即可（2026-09-23 实测）。

## 同步记录

### 2026-09-26（5.14.0-dev.17 → 5.14.0-dev.19）

- **上游版本**：5.14.0-dev.17 → **5.14.0-dev.19**（基线 `0b08bc37cc` → `6407fdd4c5`）
- **冲突与处理**：仅 `core/frontend/src/internal/tile/OrbitGtTileTree.ts` 一处（上游重写），
  该文件不在自定义改动清单，取上游版本
- **原生库版本变化**：`@bentley/imodeljs-native` **5.14.35 → 5.14.38** —— 按「imodel-native 联动」
  小节跟进：imodel-native 合并 upstream/main 至 ≥ v5.14.38 → CMake 重编译 → rush update →
  `scripts/replace-imodeljs-native.ps1`（其硬门槛以 `core/backend/package.json` 动态读版本为准）
- 首次带尾步自动检测的真实同步；`stays at` 分支已在合并完成后的重跑中验证
- **2026-09-26 原生库替换机制启用**：`replace-imodeljs-native.ps1` 首次落地（imodel-native ≥ v5.14.38，release 配置），modeling-server 冒烟通过

### 2026-09-23（仓库整合 + 5.14.0-dev.17）

- **上游版本**：5.14.0-dev.15 → **5.14.0-dev.17**（`0b08bc37cc`），上游提交数 **8**
  （版本推进 dev.16/17、`@bentley/imodeljs-native` 5.14.33–35、Presentation
  `getElementProperties` 性能改进 #9743、5.13.5 changelogs）
- **冲突与处理**：仅 `common/config/rush/pnpm-lock.yaml` 一处，按清单取上游版本；
  上游无接口新增，无需补实现
- **工作区解耦**：`@luban-cad/*` 退出 rush 工作区，`rush.json`/`browser-approved-packages`/
  `common-versions`/`repo-state` 还原上游纯净版（此后 lockfile 与上游逐字节一致）
- **应用外迁**：冻结历史拷贝 → `luban-cad/`，以 pnpm `link:` 源码引用 itwinjs-core
- **仓库整合**：tiangong-kaiwu 成为唯一 git 仓库；itwinjs-core/ 以 subtree-squash 导入
  基线 `0b08bc37cc`，自定义改动（editor 工具集等）回灌为普通提交；luban-cad/ 并入本仓。
  旧嵌套仓历史已 bundle 备份仓外留存

### 2026-09-22（嵌套 fork 仓时期）

- 5.9→5.14 合并（merge `6f260204a6` + 编译/锁文件修复 `8feafd5efc`）

## 原则

- **本仓是唯一仓库**；对 `itwinjs-core/` 源码的修改要最小化，并记录在
  `docs/ITWINJS_CORE_MODIFICATIONS.md`（仓库根 docs/）
- 应用代码在 `luban-cad/`；itwinjs-core 内的历史拷贝目录仅作存档，保持原样
- 保持 `common/config/rush/pnpm-lock.yaml` 与上游逐字节一致是「随时同步」的关键
  ——不要为应用再生成锁文件
