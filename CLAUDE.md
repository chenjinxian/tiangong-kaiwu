# CLAUDE.md

本文件是本仓的**整体架构、开发规范与参考标准入口**，不记录工作进度、发布日志、测试基线或功能状态流水账。进度与证据应写入 `docs/README.md` 索引下的专题文档、ADR、AIRR 与能力账本。

# 天工开物（TiangongKaiwu）平台总仓

基于云服务的 AI+CAD 应用平台。**本仓是公开总仓**；后端服务源码在私有仓 `luban-backend`，本仓只消费其发布产物。

命名家族：平台 **天工开物** / 产品 **鲁班CAD（LubanCAD）** / **真形（TrueForm）几何内核**（私有仓，自主研发） / 约束求解器 **绳墨（ShengMo，私有仓，自主研发）**。代码包名为 `@luban-cad/*`。

> **开发规则总册：`docs/DEVELOPMENT-RULES.md`（唯一权威，P0/P1/P2）。**
> 任何功能开工前必须完成 AIRR（`docs/architecture/AIRR-TEMPLATE.md`）；接口冻结见
> `docs/architecture/INTERFACE-FREEZE-MATRIX.md`，规范来源见
> `docs/architecture/CANONICAL-SOURCES.md`，例外必须登记到
> `docs/architecture/EXCEPTIONS.md`。本文件与各仓 `CLAUDE.md` 只做领域补充，冲突以总册为准。
>
> **团队执行方案：`docs/architecture/TEAM-EXECUTION-PLAN-2026-11-25.md`（2026-11-25 owner directive）。**
> P1 架构/平台全速；P2 AI 建模（MCP + 内嵌 agent harness）预研先行；P3 Onshape 建模能力/示例；
> P2/P3 先研究后开工。该方案不改变 Gate 结论，也不替代 AIRR/ADR 与外部评审。

## 架构基线（先读）

| 文档 | 作用 |
|---|---|
| `docs/architecture/PRODUCT-GOALS-AND-ENGINEERING-PRINCIPLES.md` | 产品目标与工程原则：Onshape 全量能力→AI+CAD、示例验证真形/绳墨、功能级架构闭环、BRepCore 持续审计 |
| `docs/research/lubancad-architecture-assessment/08-ARCHITECTURE-EXTENSIBILITY.md` | 承重假设、扩展压力测试、单行道、可演进接缝与迁移跑道 |
| `docs/research/lubancad-architecture-assessment/09-INDUSTRIAL-TARGET-ARCHITECTURE.md` | 工业级目标架构：I0–I9 门槛、控制面/会话面/作业面/数据面/PDM 面、身份/ACL/账本/灾备/发布/合规 |
| `docs/research/lubancad-architecture-assessment/10-ARCHITECTURE-HARDENING-PLAN.md` | 架构冻结与开发计划：G0–G5 Gate、决策/Spike、WBS、验收标准、返工登记 |
| `docs/architecture/INTERFACE-FREEZE-MATRIX.md` | 跨仓接口冻结与变更规则；版本以 shared 源码与本矩阵为准 |
| `docs/architecture/CANONICAL-SOURCES.md` | 规范来源与参考实现优先级 |
| `docs/architecture/EXCEPTIONS.md` | P0/P1 例外与债务登记；例外不得只存在于 CLAUDE.md 摘要中 |

**核心判断**：iTwin.js/iModel/BIS 是可工业化的底座；当前产品面仍以 Part Studio 为主，工业化差距主要在平台工程（会话隔离、身份/ACL、不可变账本、真实 checkpoint/版本、灾备、发布可复现、规模与许可），不在几何内核。功能扩展必须服从 `10` 中的 Gate 顺序，不能以局部功能绕过架构门禁。

## 必须遵守的 P0 红线（本仓执行口径）

> 下表是每个 PR/每次 Agent 操作的硬门禁；完整定义与例外见总册和 `docs/architecture/EXCEPTIONS.md`。

| 规则 | 本仓含义（必须做到） | 禁止（发现即打回） |
|---|---|---|
| **P0-01 iTwin 唯一底座** | 模型数据、事务、工具生命周期、视图、选择、撤销全部基于 iTwin.js/iModel/BIS | 第二套模型库、渲染平台、建模 API、选择/撤销状态机 |
| **P0-02 源码唯一事实源** | itwinjs-core/imodel-native/官方 clients 以源码/官方包为准；`link:` 消费；改源码后重建对应 `lib/`/`dist/` | npm registry 替换 `link:`、手改 `lib`/`dist`、未登记 fork、未记录版本二进制 |
| **P0-03 参考优先** | 先查 iTwin/editor/imodel-native/官方 clients/BisSchemas/DanQing/参考项目，写复用矩阵 | 已有标准 API 时自造同类实现；参考实现当“素材”而非规格 |
| **P0-04 先论证后编码** | AIRR 批准后才写代码；新包/新 RPC/schema/native/渲染管线/求解器接口/数据迁移/AI 工具必须 ADR | 未 AIRR/ADR 直接开工；“先做出来再说” |
| **P0-05 单一建模/编辑管道** | 参数化走 `LubanFeatureRpcInterface` FeatureOp；直接编辑走 `EditTools.startCommand` + `basicManipulationIpc`/`solidModelingIpc`；标准基类与标准事件 | 旧 `LubanRpcInterface.startEditCommand/callEditMethod/finishEditCommand`；自定义事件替代 `onCommitted`/`onModelGeometryChanged` |
| **P0-06 单一数据源/BIS** | iModel/BIS + `params` 是模型事实源；派生显示数据只做投影；schema/params 变更=版本化+迁移+旧库 fixture+回滚 | 同一草图既存 params 又存 native geometry stream；无迁移的 schema 变更 |
| **P0-07 契约唯一/公私边界** | `@luban-cad/shared` 唯一跨仓契约；变更 bump 版本 + 双端同发布；公共仓不出现私有源码/密钥/native 细节/内部证据 | 并行 REST DTO；把私有仓路径、密钥、native 构建证据写入公开仓 |
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

## 核心架构模型

### 文档与工作区

- **iTwin = 项目；iModel = 文档；Model/scope = Part Studio/装配/图纸等工作区**。Part Studio 使用 `DefinitionModel` + `PhysicalModel` scope，不把每个 Part Studio 拆成独立 iModel。
- 文档内的 Tab/工作区必须可类型化（Part Studio/Assembly/Drawing/Variable Studio/Imported/Derived），不得继续用 `UserLabel` 前缀作为唯一发现机制。
- 目标模型：`Tenant → Project(iTwin) → Document(iModel) → typed Tab + Version/NamedVersion/Reference`。目标与迁移见 `09`、`10`。

### 特征与编辑管道

- 参数化建模的唯一写管道是 `LubanFeatureRpcInterface` FeatureOp；特征参数 `params` 是事实源，几何是求值产物。
- 直接编辑走 `EditTools.startCommand` + `basicManipulationIpc`/`solidModelingIpc`，必须经过写租约、ACL、事务与审计边界。
- 特征求值走 iTwin EDE；标准事件 `onCommitted`/`onModelGeometryChanged` 是唯一提交/几何变更信号。
- 目标特征平台要求 Feature Manifest（单一清单生成类型/校验/表单/DSL/AI spec）、显式输出端口、DAG 执行器、持久拓扑引用、统一 undo/预览；当前单输出/线性链限制属于应用层实现约束，不是 iTwin 存储约束。

### 契约与源码消费

- 应用**不经 npm registry**，直接以 pnpm `link:` 引用 itwinjs-core 源码目录。改了源码必须先 `rush build --to <包>` 重建该包 `lib/`。
- workspace 包同样是“源码 + 构建产物”双层：`packages/shared` 有 `dist/`、`packages/editor/*` 有 `lib/`、`packages/viewer` 有 `dist/`。上游包改动后必须按 **shared → editor → viewer → web** 顺序重建；删除/改名 editor 导出后不重建 viewer `dist` 会让 Vite 加载旧代码并导致整表工具注册失败。
- `modeling-server`、`webhook-agent` 是独立 pnpm 项目（各自 lockfile，不属于 luban-cad workspace）；`modeling-server` 跨项目 link `../luban-cad/packages/shared`。
- `@luban-cad/shared` 是唯一跨仓契约；版本变更必须双端同发布，接口冻结以 `INTERFACE-FREEZE-MATRIX.md` 为准。

### 内核、求解器与渲染边界

- 真形（TrueForm）是平台长期自研几何内核，只经 `SolidKernel.h` 接入；M1 前必须完成 SAB 兼容/双后端一致性/迁移/回滚决策。
- 绳墨是自研约束求解器；上层只依赖 solver-neutral 契约，过渡后端不得泄漏到业务层。
- ACIS 只允许 Modeler + Polyhedra；3D InterOp/STEP/IGES/healing 未授权，不得接线；`blocked-license` 能力必须在 native/服务入口 fail-closed。
- iTwin WebGL 是唯一交互渲染底座；PBR/DanQing/离线渲染必须独立 ADR，不得先做材质 UI 再定管线。
- 装配实例、Mate、BOM、工程图投影、文件转换是服务层/独立产品域职责，不塞进几何内核或 Part Studio 特征链。

### 协作、版本与数据

- 当前单写租约 + 单 briefcase 只能支撑单写者；任何“多只读/多用户”承诺前必须先完成会话隔离（per-session IPC/briefcase/Editor/undo）。
- 账本目标：changeset/version 不可变、append-only、有父链与校验和；checkpoint 必须真实生成并可回读验证；Named Version 绑定真实 checkpoint；fork 明确 Duplicate 与 Fork with history。
- 数据目标：生产对象存储 + Postgres HA/PITR + 备份/恢复演练；Azurite 仅开发；RPO/RTO 与恢复演练见 `09/10`。
- 权限目标：Hub 是 PDP，MS/worker/storage 每个入口是 PEP；禁止服务账号直通用户路径；真实用户归因进入 changeset/briefcase/OpLog/audit。
- 直改与 FeatureOp 共享同一租约/权限/审计边界；读 API 不得隐式触发 rebuild/写事务。

## 仓库布局

| 目录 | 角色 | 工具链 |
|---|---|---|
| `itwinjs-core/` | vendored iTwin.js fork（git-subtree squash 谱系，上游 `iTwin/itwinjs-core`）；正式产品只在 `luban-cad/apps/web` | **Rush** + pnpm |
| `luban-cad/` | 鲁班CAD 应用（pnpm workspace：`apps/web`（前端宿主，`@luban-cad/web`）+ `packages/{shared,viewer,editor}`） | **pnpm** + Vite + Vitest + Playwright |
| `luban-backend`（**私有仓，仓外**） | modeling-server（:5401）与 webhook-agent（:5402）源码、镜像与产物发布脚本；产物经 GHCR + GitHub Releases 分发，`scripts/fetch-backend.ps1` 拉取到 `dist-backend/` | pnpm + tsx |
| `docs/` | 平台文档、ADR、AIRR、架构评估、能力账本与索引 | — |
| `scripts/` | 同步、构建、起栈、验收、发布辅助脚本 | PowerShell + bash |

**仓外项目**（需自行检出，公开仓只按接口/产物消费）：`luban-backend`（后端私有仓）、`imodelhub-services`（本地 iModel 管理平台，栈内以 GHCR 镜像消费）、DanQing（独立客户端图形引擎，未接入）、真形（TrueForm，私有几何内核）。具体本地路径由各仓 README/开发者环境决定，不写入公开架构文档。

## 运行流水线

- **前端**（React 18 + Vite）：`luban-cad/apps/web/`，dev :5300；模块位于 `src/modules/{authentication,documents,document-details,part-studio,settings}`，官方 iTwin REST 客户端封装在 `clients/`。查看器/建模基座为 `packages/viewer` 与 `packages/editor`。
- **同源代理**：vite 代理把 `/auth`、`/itwins`、`/imodels` 等前缀转 imodelhub-services（:5400），把 `/ipc`、`/ws`、`/rpc`、`/api` 转 modeling-server（:5401）；MS CORS 钉死 :5300，故开发态走同源代理。栈内部署形态 = compose `web`（本仓 build）经 nginx :5301 单入口。
- **建模后台**（:5401，宿主进程）：源码在私有仓；本仓以产物运行（`dist-backend/` + `scripts/start-ms-host.ps1`）。运行时为 `LocalhostIpcHost`（WebSocket IPC 支撑 BriefcaseConnection）+ `LubanRpcImpl` + IPC handlers + `EditCommandAdmin`。
- **编辑管道（硬约束）**：标准工具基类 → `basicManipulationIpc` → `BriefcaseTxns`/`saveChanges`（可撤销）。AI Agent 必须复用现有 `toolId`，禁止第二套建模 API；破坏性操作走 HITL。
- **Webhook 管道**：iTwin 平台 → webhook-agent（:5402，验签）→ modeling-server（:5401）→ 前端轮询；webhook-agent 负责生成 baseline（CloudSqlite）并上传对象存储。

## 常用命令

### itwinjs-core（Rush，勿用 npm/pnpm 直接装）

```bash
cd itwinjs-core
node common/scripts/install-run-rush.js update
node common/scripts/install-run-rush.js build --to @itwin/core-backend --to @itwin/core-frontend
```

### luban-cad（pnpm workspace）

```bash
# 本机未全局安装 pnpm；统一用 corepack pnpm@10（lockfile 9.0）
cd luban-cad && corepack pnpm@10 install
# 首次或改 shared/editor 后，按依赖顺序构建 workspace 产物：
corepack pnpm@10 --filter @luban-cad/shared run build
corepack pnpm@10 --filter @itwin/editor-common --filter @itwin/editor-backend --filter @itwin/editor-frontend run build
corepack pnpm@10 --filter @luban-cad/viewer run build
cd apps/web && corepack pnpm@10 dev
corepack pnpm@10 build / lint / test
corepack pnpm@10 test:e2e    # 需真实栈
```

### 起栈与验收（公开资产 + 宿主 MS）

```bash
# 一键起栈
powershell -NoProfile -File scripts/quickstart.ps1

# 等价手动流程
powershell -File scripts/generate-env.ps1
powershell -File scripts/fetch-backend.ps1
docker compose up -d
powershell -File scripts/start-ms-host.ps1 -Detach
powershell -File scripts/verify-stack.ps1
powershell -File scripts/stop-ms-host.ps1

# 后端源码开发（私有仓检出者）
powershell -File scripts/start-ms-host.ps1 -Source <luban-backend>/modeling-server
```

部署权威是根 `docker-compose.yml`：Postgres/Azurite/Redis/Maildev + imodelhub（:5400）+ webhook-agent（:5402）+ web（本仓 build）+ nginx（:5301）。web 镜像不随 `fetch-backend`/compose pull 更新；`apps/web` 或 `itwinjs-core` 有更新须 `scripts/rebuild-web.ps1` 重建。modeling-server 因 link: 依赖与本地 native 不能入 Linux 容器，以宿主进程运行。

### 单测试 / 单 e2e

```bash
npx vitest run src/rpc/LubanRpcImpl.test.ts
npx playwright test e2e/documents.spec.ts
```

## itwinjs-core 修改与上游同步（强制）

- **复用优先**：先在 itwinjs-core 找现成实现；禁止绕过工具生命周期自管状态、禁止自定义事件替代标准事件。工具开发检查清单见 `luban-cad/CLAUDE.md`。
- **最小修改**：对 `itwinjs-core/` 的自定义改动登记在 `docs/ITWINJS_CORE_MODIFICATIONS.md`。editor 模块已收编 `luban-cad/packages/editor/` 为第一方建模基座——建模修改/新增在该包做，fork 内不再维护 editor/；subtree pull 带回上游 editor/ 时须删除，见 `docs/UPSTREAM_SYNC.md`。
- **同步**：`bash scripts/sync-from-upstream.sh`（= `git subtree pull --prefix=itwinjs-core --squash upstream master`）。冲突时 `common/config/rush/pnpm-lock.yaml`、`rush.json`、`common/config/rush/*` 一律取上游版本，**绝不手工合并 lockfile**；完成后在 `docs/UPSTREAM_SYNC.md` 追加同步记录。保持 rush lockfile 与上游逐字节一致是“随时可同步”的关键。

## 工程环境约束（稳定事实）

- **本机 pnpm**：lockfile 为 9.0；不要用 pnpm 12 默认供应链策略；统一 `corepack pnpm@10`。
- **Rush 非交互**：`rush update` 清 node_modules 需 `CI=true`，否则 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`。
- **仓库迁移**：`itwinjs-core/common/temp/last-install.flag` 记录旧绝对路径；移动仓库后改写或 `rush update --purge`。
- **Rush 策略**：本地 install/update 可加 `--bypass-policy`；它不是 build 的 flag。
- **link: 项目禁用 `pnpm add`**：会把 `link:` 静默重解析为 registry 包。加依赖须手改 package.json + `corepack pnpm@10 install --no-frozen-lockfile`，并核对 lockfile 的 `link:` 计数不变。
- **workspace 产物顺序**：shared → editor → viewer；删除/改名 editor 导出后必须重建 viewer `dist`。
- **modeling-server 首启**：link: 的 `@luban-cad/shared` 需先构建 `dist/`。
- **上游 IPC**：`IpcAppFunctions` 新增方法时，私有仓 `AppFunctionIpcHandler` 需照官方 `core/backend/src/IpcHost.ts` 补实现。
- **peer 版本**：`No matching version found for @itwin/xxx@dev.N` 时，在消费方显式声明 `workspace:*` 或 `link:` 让本地满足。
- **markup 占位**：`@itwin/core-markup` 不在 workspace 依赖中，相关工具禁用；启用前先补依赖解析。
- **hub 镜像**：hub 内容一律以 GHCR 镜像为准，禁止挂宿主 `dist`；`verify-stack` 对该挂载做硬检查。
- **briefcase**：不得放网络驱动器；本地 briefcase 是可丢弃缓存，不是事实源。
- **Git 推送**：HTTPS 被重置时可用一次性 SSH URL；按 URL 推送后补 `git fetch <url> <branch>:refs/remotes/origin/<branch>` 更新跟踪引用。

## 文档锚点

- 文档总索引：`docs/README.md`；历史删除索引：`docs/HISTORY.md`
- **团队执行方案：`docs/architecture/TEAM-EXECUTION-PLAN-2026-11-25.md`（P1/P2/P3 分工与节奏；不改变 Gate）**
- 开发规则：`docs/DEVELOPMENT-RULES.md`；AIRR/冻结/规范/例外：`docs/architecture/{AIRR-TEMPLATE,INTERFACE-FREEZE-MATRIX,CANONICAL-SOURCES,EXCEPTIONS}.md`
- 产品目标：`docs/architecture/PRODUCT-GOALS-AND-ENGINEERING-PRINCIPLES.md`
- 架构评估与工业级计划：`docs/research/lubancad-architecture-assessment/{README,08-ARCHITECTURE-EXTENSIBILITY,09-INDUSTRIAL-TARGET-ARCHITECTURE,10-ARCHITECTURE-HARDENING-PLAN}.md`
- Onshape Help 全量分析：`docs/research/onshape-help-analysis/`
- 官方 iTwin Platform REST 规格：`docs/api-specs/*.json`（itwins / imodels-v2 / access-control-v2 / webhooks-v2 / storage / users）
- 详细开发准则（工具生命周期/检查清单/AI 注册规约）：`luban-cad/CLAUDE.md`
- 内核/原生修改台账：`docs/ITWINJS_CORE_MODIFICATIONS.md`；上游同步史：`docs/UPSTREAM_SYNC.md`
- 宿主端口登记：`docs/PORTS.md`
- 私有仓规则入口（subordinate 于本总册）：各仓 `CLAUDE.md`；真形文档见私有仓 `trueform/docs/README.md`
