# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# 天工开物（TiangongKaiwu）平台总仓

基于云服务的 AI+CAD 应用平台。**本仓是公开总仓**（后端服务源码在私有仓 `luban-backend`，本仓只消费其产物）；命名家族（2026-09-23 定版）：平台 **天工开物** / 产品 **鲁班CAD（LubanCAD）** / **真形（TrueForm）几何内核**（私有仓 `D:\Github\trueform`，自主研发） / 约束求解器 **绳墨（ShengMo，私有仓，自主研发）**。代码内包名为 `@luban-cad/*`，功能状态标记用 ✅/🟠/⚪/❌。

> **开发规则总册：`docs/DEVELOPMENT-RULES.md`（唯一权威，P0/P1/P2）。**
> 任何功能开工前必须完成 AIRR（`docs/architecture/AIRR-TEMPLATE.md`）；接口冻结见
> `docs/architecture/INTERFACE-FREEZE-MATRIX.md`，规范来源见
> `docs/architecture/CANONICAL-SOURCES.md`，例外必须登记到
> `docs/architecture/EXCEPTIONS.md`。本文件与各仓 `CLAUDE.md` 只做领域补充，冲突以总册为准。

## 必须遵守的 P0 红线（本仓执行口径）

> 下表是每个 PR/每次 Agent 操作的硬门禁；完整定义与例外见总册和 `docs/architecture/EXCEPTIONS.md`。

| 规则 | 本仓含义（必须做到） | 禁止（发现即打回） |
|---|---|---|
| **P0-01 iTwin 唯一底座** | 模型数据、事务、工具生命周期、视图、选择、撤销全部基于 iTwin.js/iModel/BIS | 第二套模型库、渲染平台、建模 API、选择/撤销状态机 |
| **P0-02 源码唯一事实源** | itwinjs-core/imodel-native/官方 clients 以源码/官方包为准；`link:` 消费；改源码后重建对应 `lib/`/`dist/` | npm registry 替换 `link:`、手改 `lib`/`dist`、未登记 fork、未记录版本二进制 |
| **P0-03 参考优先** | 先查 iTwin/editor/imodel-native/官方 clients/BisSchemas/DanQing/参考项目，写复用矩阵 | 已有标准 API 时自造同类实现；参考实现当“素材”而非规格 |
| **P0-04 先论证后编码** | AIRR 批准后才写代码；新包/新 RPC/schema/native/渲染管线/求解器接口/数据迁移/AI 工具必须 ADR | 未 AIRR/ADR 直接开工；“先做出来再说” |
| **P0-05 单一建模/编辑管道** | 参数化走 `LubanFeatureRpcInterface` FeatureOp；直接编辑走 `EditTools.startCommand` + `basicManipulationIpc`/`solidModelingIpc`；标准基类与标准事件 | 旧 `LubanRpcInterface.startEditCommand/callEditMethod/finishEditCommand`（已删除）；自定义事件替代 `onCommitted`/`onModelGeometryChanged` |
| **P0-06 单一数据源/BIS** | iModel/BIS + `params` 是模型事实源；派生显示数据只做投影；schema/params 变更=版本化+迁移+旧库 fixture+回滚 | 同一草图既存 params 又存 native geometry stream；无迁移的 schema 变更 |
| **P0-07 契约唯一/公私边界** | `@luban-cad/shared` 唯一跨仓契约（`LubanFeatureRpcInterface` 1.29.0、`LubanRpcInterface` 1.1.0）；变更 bump 版本 + 双端同发布 | 并行 REST DTO；公共仓出现私有源码/密钥/native 细节/内部证据 |
| **P0-08 Fork/native 最小可追溯** | fork 改动登记 `docs/ITWINJS_CORE_MODIFICATIONS.md`；native 改动源码+`NativeLibrary.ts`+ctest+下游回归+provenance；只保留一个 canonical native | 手改生成产物；多份 native checkout 并行；改 editor 导出后不重建 viewer `dist` |
| **P0-09 内核/求解器冻结与许可** | 真形（TrueForm）几何内核只经 `SolidKernel.h`；绳墨只经 solver-neutral；ACIS 只用 Modeler+Polyhedra；libslvs 仅纯云 SaaS 姿态 | STEP/healing 等未授权 ACIS 能力接线；on-prem 打包 libslvs；引入未经合法授权的代码或资料 |
| **P0-10 可撤销或 HITL** | 每个用户/Agent 操作走标准事务；不可逆操作登记例外并强制预览→确认→提交+审计 | 静默不可逆、假成功 no-op、跳过 HITL |

**开工/完工门禁**

1. 开工：AIRR + 复用矩阵 + 跨仓影响 + 回滚计划；新契约/schema/native/渲染/求解器/迁移必须 ADR。
2. 编码：标准工具基类、标准 IPC、标准事务/事件；不得绕过工具生命周期自管状态。
3. 测试：单元 + StandaloneDb/契约 + **真栈 e2e**；触碰 iModel/RPC/native/schema/工具事务的改动不得用 jsdom-only 宣称完成。
4. 文档：接口冻结矩阵、例外登记、能力状态、文档索引、修改台账同 PR 更新；禁止硬编码过期测试基线。
5. 发布：shared → backend → web 同批次；镜像/产物 commit、digest、provenance 可查；`verify-stack` 全绿；发布由 release owner 执行。
6. Agent/自动化：未经明确要求不 commit/push/publish；不伪造证据/状态；破坏性操作必须 HITL。

当前未关闭的 P0/P1 例外：`docs/architecture/EXCEPTIONS.md`（X-04 起；X-01/X-02/X-03 已于 2026-11-04 关闭）。

## 仓库布局

| 目录 | 角色 | 工具链 |
|---|---|---|
| `itwinjs-core/` | vendored iTwin.js fork（git-subtree squash 谱系，上游 `iTwin/itwinjs-core`）；正式产品只在 `luban-cad/apps/web` | **Rush** + pnpm |
| `luban-cad/` | 鲁班CAD 应用（pnpm workspace：`apps/web`（前端宿主，包名 `@luban-cad/web`）+ `packages/{shared,viewer,editor}`） | **pnpm** + Vite + Vitest + Playwright |
| `luban-backend/`（**私有仓，仓外**） | 后端服务：私有仓 luban-backend（modeling-server :5401 + webhook-agent :5402 源码与镜像/产物发布脚本）；产物经 **GHCR 镜像 + GitHub Releases** 分发，`scripts/fetch-backend.ps1` 拉取到本仓 `dist-backend/` | pnpm + tsx |
| `docs/` | 平台文档（UPSTREAM_SYNC.md / ITWINJS_CORE_MODIFICATIONS.md 等） | — |
| `scripts/sync-from-upstream.sh` | 上游一键同步脚本 | bash |

**仓外项目**（用途说明，需自行检出）：luban-backend（后端私有仓，见上表；本仓不检出也能跑——`fetch-backend.ps1` 拉产物即可）、imodelhub-services（本地 iModel 管理平台：iModel 管理 API :5400 + Azurite :10500 + Postgres，替代 Bentley 云；栈内以 GHCR 镜像 `ghcr.io/chenjinxian/imodelhub` 消费）、丹青 DanQing（纯客户端图形引擎，itwinjs-core 大体量渲染 × Filament 高质量实时渲染/全平台）、**真形（TrueForm）几何内核**（私有仓 `D:\Github\trueform`，自主研发 BRep 内核，只经 `SolidKernel.h` 接入）。

## 核心架构模型：link: 源码消费

应用**不经 npm registry**，直接以 pnpm `link:` 引用 itwinjs-core 源码目录（如 `"@itwin/core-backend": "link:../itwinjs-core/core/backend"`）。后果：

- 改了 `itwinjs-core/` 的源码，必须先 `rush build --to <包>` 重建该包的 `lib/` 产物，应用端才能看到效果。
- **workspace 包同样是“源码 + 构建产物”双层**：`packages/shared` 有 `dist/`、`packages/editor/*` 有 `lib/`、`packages/viewer` 有 `dist/`。改了上游包（尤其是 editor 的导出面/API）后，必须按依赖顺序重建下游包；**删除/改名 editor 导出后不重建 viewer `dist` 会导致 Vite 加载旧 viewer 代码报 `does not provide an export named ...`，进而整表工具注册失败**（2026-11-04 实测）。
- `modeling-server`、`webhook-agent` 是**独立 pnpm 项目**（各自 pnpm-lock.yaml，不属于 luban-cad workspace）；`modeling-server` 还跨项目 link 了 `../luban-cad/packages/shared`（`@luban-cad/shared`，RPC 接口定义所在）。（此条对私有仓 luban-backend 适用，见其 README）

## 运行流水线

- **前端**（React 18 + Vite）：`luban-cad/apps/web/`（包名 `@luban-cad/web`，dev :5300），按模块分目录（`src/modules/{authentication,documents,document-details,part-studio,settings}` + `clients/`（官方 iTwin REST 客户端封装））；查看器/建模基座包为 `packages/viewer`（`@luban-cad/viewer`）与 `packages/editor`（`@itwin/editor-*` 第一方）。dev server :5300；vite 代理把 `/auth`、`/itwins`、`/imodels` 等九前缀代理到 imodelhub-services(:5400)、`/ipc`、`/ws`、`/rpc`、`/api` 代理到 modeling-server(:5401)（MS CORS 钉死 :5300，同源代理姿态，见 `apps/web/vite.config.ts` 注记）。栈内部署形态 = compose `web` 服务本仓 build（`apps/web/Dockerfile`）经 nginx :5301 单入口。
- **建模后台**（:5401，宿主进程）：源码在私有仓 `luban-backend` 的 modeling-server；本仓以**产物**运行（`dist-backend\` + `scripts/start-ms-host.ps1` 产物模式）：`LocalhostIpcHost`（取代 IModelHost，WebSocket IPC 支撑 BriefcaseConnection）+ `LubanRpcImpl` + 自定义 IPC handler（`LubanIpcHandler`、`AppFunctionIpcHandler`）+ `EditCommandAdmin` 注册内置编辑命令。
- **编辑管道（硬约束）**：工具继承 iTwin.js 标准基类（`ElementSetTool`/`PrimitiveTool`/`CopyElementsTool`）→ 编辑走 `basicManipulationIpc` → 事务走 `BriefcaseTxns`/`saveChanges`（**可撤销是硬约束**）。AI Agent 工具必须复用现有 `toolId`，禁止第二套建模 API；破坏性操作走 HITL（预览→确认→提交）。
- **Webhook 管道**：iTwin 平台 → webhook-agent(:5402，验签，GHCR 镜像) → modeling-server(:5401，宿主产物) → 前端轮询；webhook-agent 另负责生成 baseline（CloudSqlite）上传 Azurite。

## 常用命令

### itwinjs-core（Rush，勿用 npm/pnpm 直接装）

```bash
cd itwinjs-core
node common/scripts/install-run-rush.js update          # 安装依赖
node common/scripts/install-run-rush.js build --to @itwin/core-backend --to @itwin/core-frontend   # 构建应用所需依赖包（同 luban-cad/apps/web 的 build:deps；editor 包已收编 luban-cad/packages/editor，由 pnpm workspace 构建）
```

### luban-cad（pnpm workspace）

```bash
# 本机未全局安装 pnpm；统一用 corepack pnpm@10（lockfile 9.0）
cd luban-cad && corepack pnpm@10 install
# 首次或改 shared/editor 后，按依赖顺序构建 workspace 产物：
corepack pnpm@10 --filter @luban-cad/shared run build
corepack pnpm@10 --filter @itwin/editor-common --filter @itwin/editor-backend --filter @itwin/editor-frontend run build
corepack pnpm@10 --filter @luban-cad/viewer run build
cd apps/web && corepack pnpm@10 dev          # 前端 dev :5300（栈内部署经 nginx :5301）
corepack pnpm@10 build / lint / test         # 各包目录内均可用
corepack pnpm@10 test:e2e                    # Playwright（apps/web 内；七页+键盘流+视觉钉版+性能探针，需真实栈）
```

### 后端（私有仓 luban-backend；本仓走产物分发）

```bash
# 外部验证者快速起栈（4+2 命令流；顺序执行）
powershell -File scripts/generate-env.ps1            # 0) 仓库根 .env（幂等）
powershell -File scripts/fetch-backend.ps1           # 1) Releases 拉 MS 产物 tgz→dist-backend\ + docker compose pull（GHCR）
docker compose up -d                                 # 2) 栈：imodelhub/WA/web/nginx + 基础设施
powershell -File scripts/start-ms-host.ps1 -Detach   # 3) 宿主 MS :5401（产物模式）
powershell -File scripts/verify-stack.ps1            # 4) 全栈验收（health→数据链→WS→横幅）

# 后端源码开发（私有仓检出者）：cd <luban-backend>\modeling-server && pnpm dev / test / lint（见该仓 README）
powershell -File scripts/start-ms-host.ps1 -Source D:\Github\luban-backend\modeling-server   # 源码模式（install/build 全流程）
```

### 单测试 / 单 e2e

```bash
npx vitest run src/rpc/LubanRpcImpl.test.ts          # 单测（在该包目录内）
npx playwright test e2e/documents.spec.ts                # 单 e2e（在 luban-cad/apps/web 内）
```

### 完整本地栈启动顺序（部署权威：根 compose）

0. 首次运行先生成密钥配置：`powershell -File scripts/generate-env.ps1`（幂等；后端服务的 `.env` 均读仓库根这一份，密钥缺失会拒启）
1. `powershell -File scripts/fetch-backend.ps1`（拉 GHCR 镜像 + MS 产物到 `dist-backend\`；已就位可跳过）
2. `docker compose up -d`（根 docker-compose.yml：Postgres/Azurite/Redis/Maildev + imodelhub:5400 + webhook-agent:5402（均 GHCR 镜像）+ web（**本仓 build = `luban-cad/apps/web`**；构建上下文=仓库根，见 `.dockerignore`；**不随 fetch-backend/compose pull 更新——apps/web 或 itwinjs-core 源有更新须 `powershell -File scripts/rebuild-web.ps1` 重建镜像（B2，verify-stack Step E 会报告陈旧）**）+ nginx:5301 单域名入口；宿主端口登记见 `docs/PORTS.md`）
3. modeling-server 为宿主进程（link: 依赖+本地编译原生库不可入 Linux 容器——`scripts/start-ms-host.ps1 -Detach`，默认产物模式跑 `dist-backend\`）
4. `powershell -File scripts/verify-stack.ps1` 全栈验收（health×5 → iTwin/iModel/baseline 数据链 → WS cookie 握手 → dev-build 横幅）

**开发态**（分进程调试）：itwinjs-core `rush build --to ...`（首次或改了依赖库后）→ 私有仓 `luban-backend` 内 modeling-server `pnpm dev` (:5401)，或本仓 `start-ms-host.ps1 -Source <私有仓>\modeling-server` 源码模式 → `luban-cad/apps/web` `pnpm dev` (:5300；vite 同源代理连 :5400/:5401，MS CORS 钉死 :5300 故不走直连)。webhook-agent 随 compose 容器跑（:5402，GHCR 镜像；源码调试在私有仓）。

## itwinjs-core 修改与上游同步（强制）

- **复用优先**：开发前先在 itwinjs-core 找现成实现；禁止绕过 iTwin.js 工具生命周期自管状态、禁止自定义事件替代 `onCommitted` 等标准事件。工具开发检查清单见 `luban-cad/CLAUDE.md`。
- **最小修改**：对 `itwinjs-core/` 的自定义改动集中在 `core/backend/CheckpointManager.ts` 等少数文件，每处必须记录在 `docs/ITWINJS_CORE_MODIFICATIONS.md`。（editor 模块 2026-10-22 起收编 `luban-cad/packages/editor/` 为 luban-cad 第一方建模基座——建模功能的修改/新增都在该包做，fork 内不再维护 editor/；后续 subtree pull 带回上游 editor/ 时须删除，见 `docs/UPSTREAM_SYNC.md`「editor/ 收编检查单」。）
- **同步**：`bash scripts/sync-from-upstream.sh`（= `git subtree pull --prefix=itwinjs-core --squash upstream master`）。冲突时 `common/config/rush/pnpm-lock.yaml`、`rush.json`、`common/config/rush/*` 一律取上游版本，**绝不手工合并 lockfile**；完成后在 `docs/UPSTREAM_SYNC.md` 追加同步记录。
- 保持 `common/config/rush/pnpm-lock.yaml` 与上游逐字节一致，是「随时可同步」的关键。

## 常见坑（实测）

- **`rush update` 清 node_modules 报 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`**：非交互环境需 `CI=true`（独立 pnpm 项目同理）。
- **移动仓库后 rush 报 store path 不匹配**：`itwinjs-core/common/temp/last-install.flag` 钉着旧绝对路径，改写为当前路径或 `rush update --purge`。
- **rush 的 git 邮箱策略检查**：本地 rush 操作可加 `--bypass-policy`（仅 install/update 类命令，**不是** build 的 flag）。
- **上游接口新增方法**：如 `IpcAppFunctions` 加方法，`modeling-server/src/ipc/AppFunctionIpcHandler.ts` 需补实现（照搬 `core/backend/src/IpcHost.ts` 官方实现）。（私有仓 luban-backend 适用，见其 README）
- **markup 功能 ❌ 降级占位**：`@itwin/core-markup` 不在 luban-cad workspace 依赖中，12 个工具禁用；启用前需先补依赖解析。
- **peer 版本解析报 `No matching version found for @itwin/xxx@dev.N`**：在消费方 package.json 显式声明 `"@itwin/xxx": "workspace:*"` 或 link: 让 peer 由本地满足。
- **本机 pnpm 版本**：lockfile 是 lockfileVersion 9.0（pnpm 9/10 时代）；pnpm 12 的默认供应链策略（minimumReleaseAge）会拒绝安装。本机 pnpm 未全局安装，用 `corepack pnpm@10 install`。
- **modeling-server 首启报 `@luban-cad/shared` 无 dist/**：link: 包需先构建一次 `cd luban-cad/packages/shared && corepack pnpm@10 build`（tsc），再启动 modeling-server（2026-09-26 实测）。（私有仓 luban-backend 适用，见其 README）
- **删除/改名 editor 导出后未重建 viewer `dist`**：Vite 仍加载旧 viewer 产物，报 `does not provide an export named ...`，`ensureEditTools` 整表失败（Undo/Chamfer 等“未启动”）。按 shared → editor → viewer 顺序重建后再 reload（2026-11-04 实测）。
- **link: 项目禁用 `pnpm add`**：modeling-server/webhook-agent 的 `link:../itwinjs-core/*` 会被静默重解析为 registry 包（2026-09-26 实测）。加依赖须手改 package.json + `corepack pnpm@10 install --no-frozen-lockfile`，并核对 lockfile 的 `link:` 计数不变。（私有仓 luban-backend 适用，见其 README）
- **hub 镜像内容被宿主 dist 挂载遮蔽**（2026-10-27 实证）：compose 的 imodelhub 曾挂 `D:\Github\imodelhub-services\dist:/usr/src/app/dist:ro`（10-23 临时补丁）——镜像 ID 是新的、容器实跑宿主旧产物，发布内容静默失效。**hub 内容一律以 GHCR 镜像为准，禁止挂宿主 dist**；`verify-stack.ps1` Step F 对该挂载做硬检查（FAIL），并核对镜像 OCI revision 与 hub HEAD。
- **按 URL 推送后跟踪引用不更新**：`git push git@github.com:...`（HTTPS 被重置时的一次性 SSH URL）成功但 `origin/*` 不前进，`git status` 会误报 ahead——补 `git fetch <url> <branch>:refs/remotes/origin/<branch>` 同步。

## 文档锚点

- 能力矩阵/状态：本仓 `docs/README.md` 索引 + 代码/测试实测
- 官方 iTwin Platform REST 规格（契约对照基准）：`docs/api-specs/*.json`（itwins / imodels-v2 / access-control-v2 / webhooks-v2 / storage / users）
- 详细开发准则（工具生命周期/检查清单/AI 注册规约）：`luban-cad/CLAUDE.md`
- 项目级规则入口（均 subordinate 于本总册）：`D:\Github\luban-backend\CLAUDE.md`、`D:\Github\imodel-native\CLAUDE.md`、`D:\Github\imodelhub-services\CLAUDE.md`、`D:\Github\DanQing\CLAUDE.md`、`D:\Github\trueform\CLAUDE.md`
- 真形（TrueForm）几何内核文档：`D:\Github\trueform\docs\README.md`（架构 / `SolidKernel.h` 集成合同 / 路线图）
- 宿主端口登记（53xx/54xx 专用段，避开 itwinjs-core）：`docs/PORTS.md`
- 上游同步史与冲突处理经验：`docs/UPSTREAM_SYNC.md`
- 已删除文档历史索引：`docs/HISTORY.md`；当前文档总索引：`docs/README.md`
