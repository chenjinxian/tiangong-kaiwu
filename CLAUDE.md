# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# 天工开物（TiangongKaiwu）平台总仓

基于云服务的 AI+CAD 应用平台。**本仓是唯一 git 仓库**；命名家族（2026-09-23 定版）：平台 **天工开物** / 产品 **鲁班CAD（LubanCAD）** / 几何内核 **真形（TrueForm，私有仓，自主研发）** / 约束求解器 **绳墨（ShengMo，私有仓，自主研发）**。代码内包名为 `@luban-cad/*`，功能状态标记用 ✅/🟠/⚪/❌。

## 仓库布局

| 目录 | 角色 | 工具链 |
|---|---|---|
| `itwinjs-core/` | vendored iTwin.js fork（git-subtree squash 谱系，上游 `iTwin/itwinjs-core`）；其内另有一个旧品牌名的**冻结历史应用拷贝，勿改勿引用** | **Rush** + pnpm |
| `luban-cad/` | 鲁班CAD 应用（pnpm workspace：`apps/web` + `packages/{shared,viewer-core,web-viewer,config}` + `modules/{core,ui}`） | **pnpm** + Vite + Vitest + Playwright |
| `modeling-server/` | 图形建模后台服务：打开模型/编辑建模/渲染数据，Express + RPC/WebSocket IPC + Briefcase 管理（:4001），独立 pnpm 包 | tsx + Vitest |
| `webhook-agent/` | Webhook 接收 + baseline 生成 + CloudSqlite 上传 Azurite（:4002），独立 pnpm 包 | tsx + Vitest |
| `docs/` | 平台文档（UPSTREAM_SYNC.md / ITWINJS_CORE_MODIFICATIONS.md 等） | — |
| `scripts/sync-from-upstream.sh` | 上游一键同步脚本 | bash |

**仓外项目**（用途说明，需自行检出）：imodelhub-services（本地 iModel 管理平台：iModel 管理 API :4000 + Azurite :10000 + Postgres，替代 Bentley 云，必须先行启动）、丹青 DanQing（纯客户端图形引擎，itwinjs-core 大体量渲染 × Filament 高质量实时渲染/全平台）、imodel-native（iModel 原生引擎）。

## 核心架构模型：link: 源码消费

应用**不经 npm registry**，直接以 pnpm `link:` 引用 itwinjs-core 源码目录（如 `"@itwin/core-backend": "link:../itwinjs-core/core/backend"`）。后果：

- 改了 `itwinjs-core/` 的源码，必须先 `rush build --to <包>` 重建该包的 `lib/` 产物，应用端才能看到效果。
- `modeling-server/`、`webhook-agent/` 是**独立 pnpm 项目**（各自 pnpm-lock.yaml，不属于 luban-cad workspace）；`modeling-server` 还跨项目 link 了 `../luban-cad/packages/shared`（`@luban-cad/shared`，RPC 接口定义所在）。

## 运行流水线

- **前端**（React 18 + Vite，:3000）：`luban-cad/apps/web/`，按 feature 分目录（`features/{auth,itwin,imodel,editor,modeling,measurement,view-clip,accudraw,version-control,...}`）。Vite dev server 把 `/auth` 代理到 modeling-server(:4001)，把 `/itwins`/`/imodels` 等代理到 imodelhub-services(:4000)。
- **建模后台**（:4001，`modeling-server/`）：`LocalhostIpcHost`（取代 IModelHost，WebSocket IPC 支撑 BriefcaseConnection）+ `OpenCloudRpcImpl` + 自定义 IPC handler（`OpenCloudIpcHandler`、`AppFunctionIpcHandler`）+ `EditCommandAdmin` 注册内置编辑命令。
- **编辑管道（硬约束）**：工具继承 iTwin.js 标准基类（`ElementSetTool`/`PrimitiveTool`/`CopyElementsTool`）→ 编辑走 `basicManipulationIpc` → 事务走 `BriefcaseTxns`/`saveChanges`（**可撤销是硬约束**）。AI Agent 工具必须复用现有 `toolId`，禁止第二套建模 API；破坏性操作走 HITL（预览→确认→提交）。
- **Webhook 管道**：iTwin 平台 → webhook-agent(:4002，验签) → modeling-server(:4001) → 前端轮询；webhook-agent 另负责生成 baseline（CloudSqlite）上传 Azurite。

## 常用命令

### itwinjs-core（Rush，勿用 npm/pnpm 直接装）

```bash
cd itwinjs-core
node common/scripts/install-run-rush.js update          # 安装依赖
node common/scripts/install-run-rush.js build --to @itwin/core-backend --to @itwin/core-frontend --to @itwin/editor-backend --to @itwin/editor-frontend   # 构建应用所需依赖包（同 luban-cad/apps/web 的 build:deps）
```

### luban-cad（pnpm workspace）

```bash
cd luban-cad && pnpm install
cd apps/web && pnpm dev                    # 前端 :3000
pnpm build / pnpm lint / pnpm test         # 各包目录内均可用
pnpm test:e2e                              # Playwright（apps/web 内）
```

### modeling-server / webhook-agent（独立 pnpm 包）

```bash
cd modeling-server && pnpm install && pnpm dev     # :4001，tsx watch
cd webhook-agent && pnpm install && pnpm dev       # :4002
pnpm build                                 # tsc
pnpm test                                  # vitest run
pnpm lint
```

### 原生库替换（本地 imodeljs.node）

```bash
powershell -File scripts/replace-imodeljs-native.ps1            # release 为默认；-Config debug 切换
```

- 用 imodel-native（`D:\Github\imodel-native`，分支 `dev/source-build`）的 `out/cmake/win-x64-<config>/Delivery/` 覆盖 node_modules 中 `@bentley/imodeljs-native` 的平台二进制 + 写 `devbuild.json`；TS wrapper/typings 仍来自 npm（`api_package/ts` 零改动）。
- **硬门槛**：imodel-native HEAD 必须包含 itwinjs-core 所需版本 tag（`git merge-base --is-ancestor v<版本> HEAD`）；不满足先跑该仓 `sync-from-upstream.ps1` + CMake 重编译。
- **任何 `rush update` / `pnpm install` 重装后必须重跑**；后端启动无 "using dev build from …" banner 即已回退官方二进制。
- itwinjs-core 上游同步若提升了原生库版本：imodel-native 跟进同步 → 重编译 → 重跑本脚本（`scripts/sync-from-upstream.sh` 尾部会自动检测并提示）。

### 单测试 / 单 e2e

```bash
npx vitest run src/rpc/OpenCloudRpcImpl.test.ts          # 单测（在该包目录内）
npx playwright test e2e/editor.spec.ts                   # 单 e2e（在 luban-cad/apps/web 内）
```

### 完整本地栈启动顺序

0. 首次运行先生成密钥配置：`powershell -File scripts/generate-env.ps1`（幂等；两后端服务的 `.env` 均读仓库根这一份，密钥缺失会拒启）
1. 启动 imodelhub-services（仓外项目）的 Docker 基础设施（Postgres/Azurite/Redis）及其 API（:4000）
2. itwinjs-core `rush build --to ...`（首次或改了依赖库后）
3. `modeling-server` (:4001) → `webhook-agent` (:4002，可选) → `luban-cad/apps/web` (:3000)

## itwinjs-core 修改与上游同步（强制）

- **复用优先**：开发前先在 itwinjs-core 找现成实现；禁止绕过 iTwin.js 工具生命周期自管状态、禁止自定义事件替代 `onCommitted` 等标准事件。工具开发检查清单见 `luban-cad/CLAUDE.md`。
- **最小修改**：对 `itwinjs-core/` 的自定义改动集中在 `editor/*` 与 `core/backend/CheckpointManager.ts` 等少数文件，每处必须记录在 `docs/ITWINJS_CORE_MODIFICATIONS.md`。
- **同步**：`bash scripts/sync-from-upstream.sh`（= `git subtree pull --prefix=itwinjs-core --squash upstream master`）。冲突时 `common/config/rush/pnpm-lock.yaml`、`rush.json`、`common/config/rush/*` 一律取上游版本，**绝不手工合并 lockfile**；完成后在 `docs/UPSTREAM_SYNC.md` 追加同步记录。
- 保持 `common/config/rush/pnpm-lock.yaml` 与上游逐字节一致，是「随时可同步」的关键。

## 常见坑（实测）

- **`rush update` 清 node_modules 报 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`**：非交互环境需 `CI=true`（独立 pnpm 项目同理）。
- **移动仓库后 rush 报 store path 不匹配**：`itwinjs-core/common/temp/last-install.flag` 钉着旧绝对路径，改写为当前路径或 `rush update --purge`。
- **rush 的 git 邮箱策略检查**：本地 rush 操作可加 `--bypass-policy`（仅 install/update 类命令，**不是** build 的 flag）。
- **上游接口新增方法**：如 `IpcAppFunctions` 加方法，`modeling-server/src/ipc/AppFunctionIpcHandler.ts` 需补实现（照搬 `core/backend/src/IpcHost.ts` 官方实现）。
- **markup 功能 ❌ 降级占位**：`@itwin/core-markup` 不在 luban-cad workspace 依赖中，12 个工具禁用；启用前需先补依赖解析。
- **peer 版本解析报 `No matching version found for @itwin/xxx@dev.N`**：在消费方 package.json 显式声明 `"@itwin/xxx": "workspace:*"` 或 link: 让 peer 由本地满足。
- **本机 pnpm 版本**：lockfile 是 lockfileVersion 9.0（pnpm 9/10 时代）；pnpm 12 的默认供应链策略（minimumReleaseAge）会拒绝安装。本机 pnpm 未全局安装，用 `corepack pnpm@10 install`。
- **modeling-server 首启报 `@luban-cad/shared` 无 dist/**：link: 包需先构建一次 `cd luban-cad/packages/shared && pnpm build`（tsc），再启动 modeling-server（2026-09-26 实测）。
- **link: 项目禁用 `pnpm add`**：modeling-server/webhook-agent 的 `link:../itwinjs-core/*` 会被静默重解析为 registry 包（2026-09-26 实测）。加依赖须手改 package.json + `corepack pnpm@10 install --no-frozen-lockfile`，并核对 lockfile 的 `link:` 计数不变。

## 文档锚点

- 能力矩阵/状态：platform-docs（天工开物文档总仓，仓外）的 STATUS.md
- 详细开发准则（工具生命周期/检查清单/AI 注册规约）：`luban-cad/CLAUDE.md`
- 上游同步史与冲突处理经验：`docs/UPSTREAM_SYNC.md`
