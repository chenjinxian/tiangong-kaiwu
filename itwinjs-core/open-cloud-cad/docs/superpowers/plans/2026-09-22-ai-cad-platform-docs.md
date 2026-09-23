# AI+CAD 平台重分析与文档修正 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 11 个仓库的生态重分析，产出 platform-docs 顶层文档体系（AI+CAD 愿景/架构/内核战略/路线图/能力矩阵），并把 open-cloud-cad 的 15 份文档修正到与代码一致 + 新定位。

**Architecture:** 两阶段纯文档交付：Phase 1（Task 1–11）新建独立 git 仓 `~/Documents/GitHub/platform-docs`，先并行勘察 3 批仓库再汇总成 8 份文档；Phase 2（Task 12–15）在 itwinjs-core 仓（`open-cloud-cad/` 下）按验收清单修正文档。所有能力声明必须带状态标记，每个事实声明需可溯源（file:line 或分析笔记）。

**Tech Stack:** Markdown 文档 + git；勘察使用 Bash（ls/find/wc/grep/git log）+ Read 工具。

**Spec:** `open-cloud-cad/docs/superpowers/specs/2026-09-22-ai-cad-platform-docs-design.md`（本计划的唯一需求来源）

## Global Constraints

- **状态标记体系**（每个能力声明必须带其一）：`✅ 真实可用` / `🟠 部分实现` / `⚪ stub 或 mock` / `❌ 禁用或失效`
- **受众**：开发团队 + AI 助手；工程视角、状态诚实化；platform-docs 维护 `AGENTS.md` 供 AI 助手消费
- **一事一源**：跨仓愿景/架构只写在 platform-docs；open-cloud-cad 文档引用不复制
- **产品名**暂沿用 `Open Cloud CAD`（更名留待 VISION 审阅决策，不在本计划内执行）
- **AI 架构硬约束**（写入 AI-ARCHITECTURE.md 时不得偏离）：Agent 操作必须走 `BriefcaseTxns`/`saveChanges` 事务管道（可撤销）；破坏性操作必须 HITL 确认（预览→确认→提交）；`ai-service` 单仓起步；工具面复用 `registerTools.ts` 的现有 `toolId`，不做第二套建模 API
- **内核评估硬约束**：G0 法律/IP 门为最高优先且可一票否决路线
- **提交规范**：每个 Task 结束提交一次；提交信息末尾必须带 `Co-Authored-By: Claude Code <noreply@anthropic.com>`
- **仓库边界**：Task 1–11 提交到新仓 `~/Documents/GitHub/platform-docs`；Task 12–15 提交到 `/Users/xunzhang/Documents/GitHub/itwinjs-core`（分支 `dev/open-cloud-cad`）
- **工作目录**：涉及 itwinjs-core 修改的任务在主工作区执行（纯文档变更，无需 worktree 隔离；如执行方选择 worktree 也无妨）
- **所有路径均为绝对路径**：itwinjs-core = `/Users/xunzhang/Documents/GitHub/itwinjs-core`，其余仓库 = `/Users/xunzhang/Documents/GitHub/<name>`

## 已知事实库（直接引用，无需重新推导）

以下数据来自 2026-09-22 实测，写文档时**必须原样使用**，除非对应验证步骤给出更新值：

| 事实 | 值 / 证据 |
|---|---|
| open-cloud-cad 源码规模 | ~37,584 行 TS/TSX（features 15,045 / packages 7,731 / web/src 6,883 / backend 4,061 / web-agent 2,743 / modules 1,121），58 个测试文件，13 个 feature 模块 |
| 服务拓扑 | web:3000 / imodelhub-services:4000 / backend:4001 / web-agent:4002 / PostgreSQL:5432 / Azurite:10000-10002 |
| fork 对上游的修改面 | 20 文件 +10,963 行（`git diff master...dev/open-cloud-cad -- ':!open-cloud-cad' ':!common/config/rush/pnpm-lock.yaml'`）；最大块：`editor/frontend/src/{SketchTools +2163, SolidModelingTools +1807, SolidPrimitiveTools +1784, ModifyCurveTools +969, ElementGeometryTool +908, TransformElementsTool +511}`、`editor/common/src/EditorBuiltInIpc.ts +583` |
| 修改面来源 | `c76e2ab36d "Integrate old editor modeling tools into v5.9.0-dev.4"`——复活了上游 PR #6495（`4aefc17641 "Remove internal test tools from editor package"`）删除的工具 |
| ITWINJS_CORE_MODIFICATIONS.md 现记载 | 仅 3 处修改（严重失实，须重写） |
| Markup 现状 | ❌ 12 个工具全部禁用（`registerTools.ts:37-51` 注释块 + TODO "Fix @itwin/core-markup module resolution"）；`useMarkupManager.ts:7` 自述 "Simplified version without @itwin/core-markup dependency" |
| 冲突检测现状 | 🟠 检测框架存在但 `compareChangesets` 返回 mock 空数据（`OpenCloudRpcImpl.ts:119-128`）；`getLocalChanges` 用 `LastMod > datetime('now','-1 day') LIMIT 100` 启发式（`:595-601`）；remote/merged/manual 解决策略多为仅 `saveChanges` 打标记（`:943-1034` 注释自认 "In a full implementation..."） |
| GLTF 导出现状 | ⚪ JSON 壳，buffers/accessors 为空（`OpenCloudRpcImpl.ts:166-230`） |
| 特征树现状 | 🟠 比文档记载超前：`OpenCloudCADSchema.ts`（CadFeature EC 类）+ `OpenCloudIpcInterface` 全套 CRUD + `FeatureTreePanel`/`FeaturePanel`/`AssemblyPanel` + `useFeatures` hook 已存在；缺重生成引擎 |
| RPC 安全面 | ❌ 部署阻断级：RPC 路由 `/:title/:version/mode/*` 无鉴权（`main.ts:214-231`）；`readExternalFile/writeExternalFile` 任意路径裸 fs 读写（`OpenCloudRpcImpl.ts:275-287`）；`getAccessToken` 把服务端 token 回传调用方（`:302`）；服务账号默认口令 `admin@example.com`/`secret` 且每次调用重新登录（`:1124-1127`） |
| 硬编码路径 | `OpenCloudIpcHandler.ts:207`、`vite.config.ts:11,134`（含本机用户名 `/Users/xunzhang/...`） |
| PatternTools 缺陷 | ID 收集 bug：内层循环创建的副本只有最后一个 ID 入选集（`PatternTools.ts:131-134` 与 `:331-334`）；错误吞咽（catch→console.error→return undefined）；Linear/Circular 约 120 行重复；`(newProps as any)` 两处 |
| PatternCommand | 死代码：`apps/backend/src/commands/PatternCommand.ts` 从未注册（`main.ts:99` 只注册 `editorBuiltInCommands`）；实际阵列路径走前端 `basicManipulationIpc.insertGeometricElement` |
| 仓库卫生 | `open-cloud-cad/.github/workflows/`（cd/ci/pr）是死配置（GitHub 只认仓库根 `.github/`）；`apps/web/{playwright-report,test-results,__blobstorage__}` 入库；itwinjs-core 根有游离 `web-agent.log` |
| 依赖不齐 | vitest 4.1.11 vs 4.1.10 / @vitest/browser-playwright 错位（`rush update` peer 警告） |
| V2 Checkpoint 亮点 | CloudSqlite BCVV 流式加载（`baseline-generator.ts:606-762`）；BaselineCompensationJob 每 2 分钟自愈；webhook HMAC-SHA256 + timingSafeEqual（`validator.ts`） |
| 工具注册规模 | `registerTools.ts` 注册约 50+ 工具（视图 7/基元 5/草图 6/变换 4/实体建模 11/布尔 3/测量 6/裁剪 5/选择 5/剖切装饰动效渲染 11）+ 快捷键 |
| acis-solid-kernel | C++20 从零重写 ACIS 内核（作者 chenjinxian，LICENSE 自限 "Research and learning only"）；含 `include/acis`（只读公开头）、`decompiled_full`（反编译参考）、NODS 分层（SPAbase/SPAkern/SPAntr…）、DS golden 测试 |
| FreeCAD 本地库 | 带 3 份自研分析：`FREECAD_ARCHITECTURE_ANALYSIS.md`、`FREECAD_GCS_SOLVER_ALGORITHMS.md`、`FREECAD_SKETCHER_COMPLETE_ANALYSIS.md` |
| imodelhub-services | iTwin Platform iModelHub REST 完整实现（宣称 119 端点），NestJS 风格控制器（`src/imodels/*.controller.ts` 等），PostgreSQL 15 |
| platform-backend | rush monorepo，`packages/{web-agent-backend,web-service-backend}` |
| 文档-现实偏差清单 | spec 附录 A 的 10 项 = 本计划 Task 15 的验收清单 |

---

### Task 1: 建 platform-docs 仓骨架（README / AGENTS / 提交规范）

**Files:**
- Create: `/Users/xunzhang/Documents/GitHub/platform-docs/`（git init）
- Create: `/Users/xunzhang/Documents/GitHub/platform-docs/README.md`
- Create: `/Users/xunzhang/Documents/GitHub/platform-docs/AGENTS.md`
- Create: `/Users/xunzhang/Documents/GitHub/platform-docs/.gitignore`

**Interfaces:**
- Consumes: Global Constraints 的状态标记体系、受众定义
- Produces: 仓库骨架；后续所有 Task 的文档都挂进 README 索引；AGENTS.md 的规约条目被 Task 12 的 CLAUDE.md 引用

- [ ] **Step 1: 创建仓库与 .gitignore**

```bash
mkdir -p /Users/xunzhang/Documents/GitHub/platform-docs/analysis
cd /Users/xunzhang/Documents/GitHub/platform-docs && git init
printf '.DS_Store\n' > .gitignore
```

Expected: `git status` 显示 `On branch master`（或 main）

- [ ] **Step 2: 写 README.md**

```markdown
# Platform Docs

Open Cloud CAD —— 基于云服务的 **AI+CAD** 平台 —— 的跨仓库架构与愿景文档。

## 阅读路径

**开发团队**：VISION → ECOSYSTEM → AI-ARCHITECTURE → KERNEL-STRATEGY → ROADMAP → STATUS
**AI 助手**：AGENTS.md → STATUS.md（能力现状）→ 相关专题文档

## 文档索引

| 文档 | 内容 |
|---|---|
| [VISION.md](./VISION.md) | AI+CAD 产品愿景与三层 AI 形态定义 |
| [ECOSYSTEM.md](./ECOSYSTEM.md) | 11 仓库职责矩阵、依赖图、状态 |
| [AI-ARCHITECTURE.md](./AI-ARCHITECTURE.md) | 三层 AI 平台架构（Agent/Provider/Intent） |
| [KERNEL-STRATEGY.md](./KERNEL-STRATEGY.md) | 几何内核三路线对比与推荐 |
| [ROADMAP.md](./ROADMAP.md) | AI+CAD 分期路线与还债清单 |
| [STATUS.md](./STATUS.md) | 能力现状矩阵（诚实化锚点） |
| [AGENTS.md](./AGENTS.md) | AI 助手跨仓工作规约 |
| [analysis/](./analysis/) | 各仓库勘察原始笔记 |

## 状态标记体系

所有能力声明必须带标记：`✅ 真实可用` / `🟠 部分实现` / `⚪ stub 或 mock` / `❌ 禁用或失效`

*最后更新: 2026-09-22*
```

- [ ] **Step 3: 写 AGENTS.md**

```markdown
# AI 助手跨仓工作规约

## 状态诚实原则（最高优先）

任何能力/功能声明必须先查 [STATUS.md](./STATUS.md) 并带状态标记（✅/🟠/⚪/❌）。
禁止在文档或代码注释中把 ⚪/❌ 的能力写成 ✅。发现文档与代码不符时，以代码为准并修正文档。

## 仓库职责边界

修改任何仓库前先读 [ECOSYSTEM.md](./ECOSYSTEM.md) 确认职责归属。跨仓架构决策只在本仓（platform-docs）记录。

## open-cloud-cad 开发准则（继承自其 CLAUDE.md）

- 复用优先：工具类功能必须继承 `ElementSetTool`/`PrimitiveTool`/`CopyElementsTool` 等基类
- itwinjs-core 源码修改必须最小化并完整记录于 `open-cloud-cad/docs/ITWINJS_CORE_MODIFICATIONS.md`
- Agent 工具注册复用现有 `toolId`，不新建第二套建模 API

## 提交规范

提交信息末尾带 `Co-Authored-By: Claude Code <noreply@anthropic.com>`
```

- [ ] **Step 4: 提交**

```bash
cd /Users/xunzhang/Documents/GitHub/platform-docs
git add -A && git commit -m "docs: bootstrap platform-docs with README and AGENTS conventions

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 2: 平台服务层勘察（imodelhub-services / platform-backend / object-storage）

**Files:**
- Create: `/Users/xunzhang/Documents/GitHub/platform-docs/analysis/2026-09-22-imodelhub-services.md`
- Create: `/Users/xunzhang/Documents/GitHub/platform-docs/analysis/2026-09-22-platform-backend.md`
- Create: `/Users/xunzhang/Documents/GitHub/platform-docs/analysis/2026-09-22-object-storage.md`

**Interfaces:**
- Consumes: 本 Task 的勘察模板（见 Step 1）
- Produces: 3 份笔记中的「接口面」「成熟度」「风险」字段，被 Task 6（ECOSYSTEM）与 Task 11（STATUS）逐字段引用

- [ ] **Step 1: 按模板勘察 imodelhub-services**

对 `/Users/xunzhang/Documents/GitHub/imodelhub-services` 执行：

```bash
ls /Users/xunzhang/Documents/GitHub/imodelhub-services
head -60 /Users/xunzhang/Documents/GitHub/imodelhub-services/README.md
find /Users/xunzhang/Documents/GitHub/imodelhub-services/src -name '*.controller.ts' | sort
grep -rh '@\(Get\|Post\|Put\|Patch\|Delete\)(' /Users/xunzhang/Documents/GitHub/imodelhub-services/src --include='*.controller.ts' | wc -l
head -30 /Users/xunzhang/Documents/GitHub/imodelhub-services/docker-compose.yaml
```

写入笔记，固定 7 节：**职责 / 技术栈与规模 / 成熟度 / 接口面 / 上下游依赖 / 与 AI+CAD 的关联点 / 风险与状态**。
必填要点：README 宣称 119 端点 vs 实测路由计数（如实记录两个数字）；模块清单（itwins/imodels/changesets/briefcases/auth/... 以 controller 文件名为准）；PostgreSQL 版本；webhook 发出方的事实（供 AI-ARCHITECTURE 引用）。

- [ ] **Step 2: 同模板勘察 platform-backend**

```bash
ls -R /Users/xunzhang/Documents/GitHub/platform-backend/packages | head -40
head -40 /Users/xunzhang/Documents/GitHub/platform-backend/README.md
grep -rh 'router\.\|app\.\|@Get\|@Post' /Users/xunzhang/Documents/GitHub/platform-backend/packages --include='*.ts' 2>/dev/null | wc -l
```

必填要点：`web-service-backend` 与 `web-agent-backend` 各自职责（与 open-cloud-cad 的 web-agent:4002 是否同源/重复——如实记录）；rush 包数量。

- [ ] **Step 3: 同模板勘察 object-storage**

```bash
ls /Users/xunzhang/Documents/GitHub/object-storage /Users/xunzhang/Documents/GitHub/object-storage/storage /Users/xunzhang/Documents/GitHub/object-storage/cloud-agnostic
head -30 /Users/xunzhang/Documents/GitHub/object-storage/README.md
```

必填要点：支持的后端（Azure/S3/MinIO/本地？）；open-cloud-cad 当前直连 Azurite 的事实与该抽象的关系（可替换点）。

- [ ] **Step 4: 提交**

```bash
cd /Users/xunzhang/Documents/GitHub/platform-docs
git add analysis/ && git commit -m "docs(analysis): survey platform services layer (hub/backend/storage)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 3: 客户端库 + 引擎勘察（4 个 client 库 + imodel-native）

**Files:**
- Create: `/Users/xunzhang/Documents/GitHub/platform-docs/analysis/2026-09-22-clients-{imodels,itwins,auth,access-control}.md`（4 份）
- Create: `/Users/xunzhang/Documents/GitHub/platform-docs/analysis/2026-09-22-imodel-native.md`

**Interfaces:**
- Consumes: Task 2 笔记（协议对齐比对用）
- Produces: 客户端↔服务端协议对齐结论（写进各自笔记的「上下游依赖」节），Task 6 直接引用；imodel-native 能力边界（G1 门输入，Task 9 引用）

- [ ] **Step 1: 勘察 4 个客户端库（每库一笔记）**

对每库执行（以 imodels-clients 为例，其余替换路径）：

```bash
ls /Users/xunzhang/Documents/GitHub/imodels-clients /Users/xunzhang/Documents/GitHub/imodels-clients/clients
head -40 /Users/xunzhang/Documents/GitHub/imodels-clients/README.md
grep -rh 'export class\|export interface' /Users/xunzhang/Documents/GitHub/imodels-clients/clients --include='*.ts' | head -30
```

四库：`imodels-clients`、`itwins-client`、`auth-clients`、`access-control-client`。
必填要点：对外 API 类清单；许可（注意均带 Bentley 版权头——与自建 imodelhub-services 的兼容/合规关系如实记录）；与 imodelhub-services 对应模块的协议对齐（URL 前缀、鉴权方式是否兼容，以 README/GETTINGSTARTED 的 baseURL 约定比对 Task 2 笔记）。

- [ ] **Step 2: 勘察 imodel-native**

```bash
head -50 /Users/xunzhang/Documents/GitHub/imodel-native/README.md
ls /Users/xunzhang/Documents/GitHub/imodel-native/docs /Users/xunzhang/Documents/GitHub/imodel-native/iModelCore /Users/xunzhang/Documents/GitHub/imodel-native/iModelJsNodeAddon
grep -ri 'geometry\|GeomLibs\|brep' /Users/xunzhang/Documents/GitHub/imodel-native/docs --include='*.md' -l | head
```

必填要点：iModel 文件 IO / ECSQL / 变更追踪 / 几何处理四大能力的模块归属；**几何能力清单**（圆角/倒角/抽壳/扫掠/布尔/放置变换——open-cloud-cad 实际用到的最小集，对照 `open-cloud-cad/apps/web/features/modeling/` 的工具列表）；许可与商业依赖性质（G1 门输入）。

- [ ] **Step 3: 提交**

```bash
cd /Users/xunzhang/Documents/GitHub/platform-docs
git add analysis/ && git commit -m "docs(analysis): survey client libraries and imodel-native engine

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 4: 几何/约束储备勘察（acis-solid-kernel / FreeCAD）— G0/G1 证据

**Files:**
- Create: `/Users/xunzhang/Documents/GitHub/platform-docs/analysis/2026-09-22-acis-solid-kernel.md`
- Create: `/Users/xunzhang/Documents/GitHub/platform-docs/analysis/2026-09-22-freecad-gcs.md`

**Interfaces:**
- Consumes: 无
- Produces: **G0 IP 评估材料**与 **G1 完成度数据**（写进笔记「风险与状态」「成熟度」节），Task 9（KERNEL-STRATEGY）的核心输入

- [ ] **Step 1: 勘察 acis-solid-kernel**

```bash
head -40 /Users/xunzhang/Documents/GitHub/acis-solid-kernel/README.md
head -40 /Users/xunzhang/Documents/GitHub/acis-solid-kernel/CLAUDE.md
head -30 /Users/xunzhang/Documents/GitHub/acis-solid-kernel/LICENSE
grep -E 'passed|failed|PASS|FAIL|Tests|覆盖率|coverage' /Users/xunzhang/Documents/GitHub/acis-solid-kernel/TEST_RESULTS.md | head -20
ls /Users/xunzhang/Documents/GitHub/acis-solid-kernel/src
```

必填要点（进「风险与状态」节，G0 直接引用）：
1. LICENSE 原文摘录（"Research and learning only" 一句必须逐字引用）
2. 实现输入的两种材料分界：`include/acis`（公开头文件）vs `decompiled_full`（反编译参考）——代码是否实际参考了后者（README 的自述引用之）
3. G1 数据：SPAbase/SPAkern/SPAntr 等各层完成度（以 TEST_RESULTS.md 数字为准，无数字则记"未报告"）
4. 产品化 IP 风险三选项（clean-room 纪律 / 转 OCCT / 商业授权 ACIS）的初步事实支撑

- [ ] **Step 2: 勘察 FreeCAD GCS 资产**

```bash
head -30 /Users/xunzhang/Documents/GitHub/FreeCAD/FREECAD_GCS_SOLVER_ALGORITHMS.md
head -30 /Users/xunzhang/Documents/GitHub/FreeCAD/FREECAD_SKETCHER_COMPLETE_ANALYSIS.md
head -20 /Users/xunzhang/Documents/GitHub/FreeCAD/FREECAD_ARCHITECTURE_ANALYSIS.md
ls /Users/xunzhang/Documents/GitHub/FreeCAD/src/Mod/Sketcher 2>/dev/null | head
```

必填要点：3 份分析各自覆盖的算法范围（Dogleg/LM、雅可比、诊断策略——按文档实际内容记录）；FreeCAD 求解器许可（LGPL）与集成方式约束；「可集成性」评估所需的移植工作量线索。

- [ ] **Step 3: 提交**

```bash
cd /Users/xunzhang/Documents/GitHub/platform-docs
git add analysis/ && git commit -m "docs(analysis): survey geometry kernel and constraint solver assets (G0/G1 evidence)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 5: itwinjs-core / open-cloud-cad 现状笔记（固化已知事实）

**Files:**
- Create: `/Users/xunzhang/Documents/GitHub/platform-docs/analysis/2026-09-22-itwinjs-core-open-cloud-cad.md`

**Interfaces:**
- Consumes: Global Constraints「已知事实库」全部条目；spec 附录 A
- Produces: 文档-现实偏差 10 项的集中记录（Task 12–15 消项时逐条打勾）；fork 修改面数据（Task 9 G1、Task 11 引用）

- [ ] **Step 1: 复核 4 个关键数字（防过期）**

```bash
cd /Users/xunzhang/Documents/GitHub/itwinjs-core
find open-cloud-cad -type f \( -name '*.ts' -o -name '*.tsx' \) -not -path '*/dist/*' -not -path '*/lib/*' -not -name '*.test.*' -not -name '*.bak' | xargs wc -l | tail -1
git diff master...dev/open-cloud-cad --stat -- ':!open-cloud-cad' ':!common/config/rush/pnpm-lock.yaml' | tail -1
find open-cloud-cad -type f \( -name '*.test.ts' -o -name '*.test.tsx' \) -not -path '*/dist/*' | wc -l
grep -c 'IModelApp.tools.register' open-cloud-cad/apps/web/features/editor/registerTools.ts
```

若数字与「已知事实库」不同，笔记中用实测值并注明差异。

- [ ] **Step 2: 写笔记（7 节模板 + 偏差清单节）**

按 Task 2 的 7 节模板写，另加第 8 节 **「文档-现实偏差清单」**——原样收录 spec 附录 A 的 10 项表格（含 file:line 证据列与消项动作列），标注状态 `待消项`。

必填要点：已知事实库全部条目进对应节；fork 修改面来源（c76e2ab36d / PR #6495 故事）进「风险与状态」；安全面 4 项（RPC 无鉴权/任意文件 IO/token 泄露/默认口令）单独成节内小节「安全债（部署阻断级）」。

- [ ] **Step 3: 提交**

```bash
cd /Users/xunzhang/Documents/GitHub/platform-docs
git add analysis/ && git commit -m "docs(analysis): freeze itwinjs-core/open-cloud-cad current-state findings and drift list

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 6: ECOSYSTEM.md 汇总（依赖矩阵 + 职责矩阵）

**Files:**
- Create: `/Users/xunzhang/Documents/GitHub/platform-docs/ECOSYSTEM.md`

**Interfaces:**
- Consumes: Task 2–5 全部笔记
- Produces: 「11 仓库职责矩阵」「依赖图」「协议对齐结论」——Task 7/8/9/12 引用

- [ ] **Step 1: 写 ECOSYSTEM.md**

固定章节与必含内容：

```markdown
# 生态全景（2026-09-22）

## 1. 仓库职责矩阵
（表：仓库 | 角色 | 技术栈 | 规模 | 自建/官方 | 状态标记）
11 行：itwinjs-core(含 open-cloud-cad)、imodel-native、imodelhub-services、platform-backend、
object-storage、imodels-clients、itwins-client、auth-clients、access-control-client、
acis-solid-kernel、FreeCAD(参考资产)

## 2. 依赖关系图
（mermaid graph TD：open-cloud-cad → backend/web-agent → imodelhub-services / Azurite / PostgreSQL；
itwinjs-core → imodel-native；客户端库 → imodelhub-services；ai-service(规划中) → 各服务）

## 3. 协议对齐结论
（客户端库 ↔ imodelhub-services 兼容性，逐库一行，数据来自 Task 3 笔记）

## 4. 调用链验证
（open-cloud-cad 的 REST/RPC/Webhook/IPC 四条链路与服务端点的闭合性，数据来自 Task 5 笔记）

## 5. 风险汇总
（跨仓风险 top 5：fork 同步税、IP 风险、安全债、协议漂移、单点维护人力）
```

- [ ] **Step 2: 核对引用**

逐节核对：每个矩阵行能在 `analysis/` 对应笔记找到出处；11 仓库一个不少。

- [ ] **Step 3: 提交**

```bash
cd /Users/xunzhang/Documents/GitHub/platform-docs
git add ECOSYSTEM.md && git commit -m "docs: add ecosystem map with repo matrix and dependency graph

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 7: VISION.md（AI+CAD 愿景）

**Files:**
- Create: `/Users/xunzhang/Documents/GitHub/platform-docs/VISION.md`

**Interfaces:**
- Consumes: spec §2（需求决策记录）、§4-§2（三层形态）
- Produces: 三层 AI 形态的权威定义——Task 8/10 与 open-cloud-cad README（Task 12）引用

- [ ] **Step 1: 写 VISION.md**

固定章节：

```markdown
# 愿景：基于云服务的 AI+CAD 平台

## 1. 定位转变
旧：基于云服务的 CAD 应用程序 → 新：基于云服务的 **AI+CAD** 应用程序
（一段话阐述：AI 不是功能点缀，而是与几何内核同级的平台层）

## 2. 三层 AI 形态（平台化，分期实现）
L1 Agent 建模 Copilot —— 自然语言驱动建模（AI 是操作员，几何仍由确定性内核生成）
L2 生成式几何 —— 文生3D/图生3D/拓扑优化（AI 是几何生产者）
L3 设计意图智能 —— 约束推断/自动标注/特征识别/参数推荐/设计审查（AI 是增强器）

## 3. 产品原则
- 可私有部署、不依赖单一云厂商（继承 Open Cloud CAD 基因）
- 模型无关（可插拔 Provider）
- 可撤销是硬约束（AI 操作与人操作同权走事务管道）
- 状态诚实（能力声明带标记）

## 4. 用户故事（L1/L2/L3 各 2 个，示例）
（如 L1："建一个 100×60×20 的法兰盘，四角 R5 圆角，挖 4 个 Ø8 螺栓孔"→ Agent 调用工具链完成）

## 5. 非目标（YAGNI）
- 不做通用 AGI 平台；AI 能力以 CAD 工作流为边界
- 短期不做实时多人协作（沿用 Briefcase 串行编辑）

## 6. 开放问题
- 产品是否更名（候选讨论留给审阅者，本文件不改名）
```

- [ ] **Step 2: 提交**

```bash
cd /Users/xunzhang/Documents/GitHub/platform-docs
git add VISION.md && git commit -m "docs: add AI+CAD platform vision with three-layer AI definition

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 8: AI-ARCHITECTURE.md（三层架构 + Provider 抽象）

**Files:**
- Create: `/Users/xunzhang/Documents/GitHub/platform-docs/AI-ARCHITECTURE.md`

**Interfaces:**
- Consumes: spec §4-§2 全部 5 条关键设计决策（逐字不得偏离）；Task 5 笔记的工具注册数据
- Produces: `ai-service` 的架构边界与 ModelProvider 接口定义——Task 10 路线图排期引用

- [ ] **Step 1: 写 AI-ARCHITECTURE.md**

固定章节（内容要点必须全含）：

```markdown
# AI 平台架构

## 1. 总览（三层图）
L1 Agent 编排层（建模 Copilot）/ L2 模型无关 Provider 抽象层 / L3 意图推理层（IntentService）
新服务 `ai-service` 单仓起步（避免过早微服务化）

## 2. L1 Agent 编排层
- 工具面复用现有资产：registerTools.ts 的 50+ 工具、basicManipulationIpc、EditCommand 栈
  直接注册为 Agent Tools（每工具 = 现有 toolId + 参数 Schema），不做第二套建模 API
- Agent 运行时：自托管 harness，起步用 Claude API Tool Runner 模式（Anthropic SDK）
- 硬约束：所有操作走 BriefcaseTxns/saveChanges 事务管道（可撤销）；
  破坏性操作 HITL 确认（预览→确认→提交）
- 会话模型：每设计会话 = 对话历史 + 工具轨迹 + 事务点

## 3. L2 模型无关 Provider 抽象层
interface ModelProvider { chat/tool-use/stream/embeddings/structured-output }
- Claude Provider：Anthropic SDK，一等公民实现（Tool Use、大工具表 Prompt Caching、adaptive thinking）
- OpenAI 兼容适配器：覆盖 vLLM/Ollama/Qwen/DeepSeek 自托管
- GeometryModelProvider：独立接口（文生3D/扩散/3DGS），与 LLM 接口分离
- 路由策略：能力路由（tool-use 重→强模型，分类→小模型）+ 成本/延迟预算 + 回退链
- 双轨评估：自托管（数据主权/成本）vs 商业 API（能力/迭代速度），部署时可换

## 4. L3 意图推理层（IntentService）
- 能力：约束推断 / 自动标注 / 特征识别 / 参数推荐 / 设计审查
- 形态：小模型/规则+ML 混合，服务化 API，供 UI 与 L1 共同消费
- 数据飞轮：acis-solid-kernel + FreeCAD 分析资产合成约束/特征数据集

## 5. 横切：AI Gateway
统一鉴权/配额/审计（对齐 access-control-client 权限模型）

## 6. 安全与合规边界
Agent 工具权限最小化；生成内容入库前过事务；模型调用审计留痕
```

- [ ] **Step 2: 提交**

```bash
cd /Users/xunzhang/Documents/GitHub/platform-docs
git add AI-ARCHITECTURE.md && git commit -m "docs: add three-layer AI architecture with model-agnostic provider abstraction

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 9: KERNEL-STRATEGY.md（G0/G1/G2 评估 + 路线推荐）

**Files:**
- Create: `/Users/xunzhang/Documents/GitHub/platform-docs/KERNEL-STRATEGY.md`

**Interfaces:**
- Consumes: Task 4 笔记（G0/G1 证据）、Task 3 imodel-native 能力清单、Task 5 fork 修改面数据、spec §4-§3 评估框架
- Produces: 内核路线推荐 + 换路线触发条件——Task 10 排期、附录 B 开放问题的决策输入

- [ ] **Step 1: 按三决策门顺序写评估**

固定章节：

```markdown
# 几何内核战略

## 0. 结论先行
（3–5 句给出推荐路线与前提条件）

## 1. G0 法律/IP 门（一票否决权）
- 事实：acis-solid-kernel LICENSE 逐字引用；实现参考了 decompiled_full 反编译代码（README 自述）
- 三选项评估：A. clean-room 纪律（仅公开头+行为规格，弃用反编译参考） B. 转 OCCT（LGPL 静态链接友好性需评估） C. 商业授权 ACIS/SDK
- 门结论：（按事实给结论；若 A 可行则标注所需纪律清单；任何含反编译衍生的产物不得进入产品）

## 2. G1 能力缺口门
- 完成度事实（Task 4 测试数据）vs 产品最小所需几何集（Task 3 imodel-native 调用面）
- 缺口表：能力 | acis-solid-kernel | imodel-native | open-cloud-cad 需求方

## 3. G2 AI 需求门
- L3 生成式几何对几何后端的要求：mesh↔B-rep、可编辑性、并行批量实例化
- imodel-native 是否本就无法满足？（按 Task 3 能力事实回答）

## 4. 三路线对比矩阵
路线 A 双内核分工 / B 长期替换 / C 纯技术储备
× 5 维（战略契合/成本/风险/收益/时间），每格 2–3 句，引用证据

## 5. 推荐路线 + 阶段图
（含并行期/切换点/回退条件）

## 6. 换路线触发条件（必须可判）
（如：G0 选 clean-room 后 6 个月内 DS golden 通过率 < 70% → 回退路线 C 并启动 OCCT 评估；
自研内核连续 2 个季度人力 > X → ...  用具体阈值）
```

**写作要求**：§1 的 IP 结论必须显式回答"产品代码能否包含/派生自反编译参考"——默认答案是**不能**，除非有书面法律意见。

- [ ] **Step 2: 提交**

```bash
cd /Users/xunzhang/Documents/GitHub/platform-docs
git add KERNEL-STRATEGY.md && git commit -m "docs: add kernel strategy with G0/G1/G2 gates and route recommendation

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 10: ROADMAP.md（AI+CAD 分期 + 还债清单）

**Files:**
- Create: `/Users/xunzhang/Documents/GitHub/platform-docs/ROADMAP.md`

**Interfaces:**
- Consumes: Task 8（AI 分层）、Task 9（内核推荐）、spec 附录 A + 已知事实库的安全债/技术债条目
- Produces: 分期计划与还债清单——open-cloud-cad ROADMAP（Task 14）向上对齐它

- [ ] **Step 1: 写 ROADMAP.md**

固定章节：

```markdown
# AI+CAD 路线图

## Phase 0 — 还债（前置，约 2–4 周）
### 安全债（部署阻断级）
- RPC 鉴权 + 文件 IO 沙箱（或删除 readExternalFile/writeExternalFile/getAccessToken 危险 RPC）【P0】
### 结构债
- fork 私有 editor 工具迁出 itwinjs-core 上游包目录（~1.1 万行 → 独立包）【P0】
- ITWINJS_CORE_MODIFICATIONS 重写至真实修改面【P0】
### 功能债（诚实化）
- mock API（冲突检测/GLTF 导出）实现或下线/标注 experimental【P1】
- PatternTools ID 收集 bug；删除 PatternCommand 死代码【P1】
- 硬编码路径清理【P1】；Markup 接回或从功能表降级【P2】
### 卫生债
- 构建产物出库（playwright-report/__blobstorage__/web-agent.log）；死 CI 配置处理【P2】

## Phase 1 — AI Agent Copilot（L1）
里程碑：对话建模打样（10 个高频工具接入）→ 工具全量注册 → HITL 流 → 会话持久化
依赖：ai-service 立项、ModelProvider 抽象落地（Claude + OpenAI 兼容双适配器）

## Phase 2 — 设计意图智能（L3）
里程碑：草图约束推断 MVP → 参数推荐 → 特征识别
依赖：约束服务（GCS 移植或商业 DCM，按 KERNEL-STRATEGY）、特征树重生成引擎（open-cloud-cad 既有 CadFeature 骨架）

## Phase 3 — 生成式几何（L2）
里程碑：文生3D 原型 → mesh→B-rep 管线 → 生成结果可编辑
依赖：G2 门结论、GeometryModelProvider、内核路线的几何服务

## 人力与阶段图
（每期：目标/交付物/依赖/风险，一张阶段图）

## 与旧版 ROADMAP 的关系
旧版（open-cloud-cad/docs/ROADMAP.md，2026-04）以"对标 Onshape"为目标；本版以 AI+CAD 三层为目标，
草图约束求解器与参数化特征树降级为 L3/L1 的支撑能力（Phase 2 内），不再是独立主线终点。
```

- [ ] **Step 2: 提交**

```bash
cd /Users/xunzhang/Documents/GitHub/platform-docs
git add ROADMAP.md && git commit -m "docs: add AI+CAD phased roadmap with Phase 0 debt paydown

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 11: STATUS.md 能力矩阵 + platform-docs 收口

**Files:**
- Create: `/Users/xunzhang/Documents/GitHub/platform-docs/STATUS.md`
- Modify: `/Users/xunzhang/Documents/GitHub/platform-docs/README.md`（如索引需补行则微调）

**Interfaces:**
- Consumes: 已知事实库 + Task 2–5 笔记的状态字段
- Produces: 全平台能力现状矩阵——Task 12 的 CLAUDE.md/README 状态表逐行对齐它；AGENTS.md 已声明"查 STATUS 再写声明"

- [ ] **Step 1: 写 STATUS.md**

固定格式（每行必须带状态标记与证据列）：

```markdown
# 能力现状矩阵（2026-09-22）

> 任何文档/代码的能力声明必须与本表一致。更新代码时同步更新本表。

## open-cloud-cad（CAD 宿主应用）
| 能力 | 状态 | 证据 |
|---|---|---|
| 视图操作（旋转/平移/缩放/适配/撤销） | ✅ | registerTools.ts:100-107 |
| 实体基元（球/柱/盒/锥/环） | ✅ | registerTools.ts:109-112,148-150 |
| 草图（线串/弧/圆/椭圆/矩形/B样条） | ✅ | registerTools.ts:114-120 |
| 实体建模（圆角/倒角/抽壳/偏移/扫掠/拔模/打孔/镜像/阵列） | 🟠 | 注册齐全但 PatternTools 有 ID 收集 bug（PatternTools.ts:131-134） |
| 布尔运算 | ✅ | registerTools.ts:143-146 |
| 测量（6 种） | ✅ | registerTools.ts:183-189 |
| 视图裁剪（5 种） | ✅ | registerTools.ts:166-171 |
| 标注 Markup（12 工具） | ❌ | registerTools.ts:37-51 全部禁用；useMarkupManager.ts:7 占位 |
| 版本控制/Changeset/Named Version | 🟠 | UI 齐全；冲突检测 compareChangesets 为 mock（OpenCloudRpcImpl.ts:119-128） |
| 冲突解决（local/remote/merged/manual） | ⚪ | 多为 saveChanges 空操作（OpenCloudRpcImpl.ts:943-1034） |
| GLTF 导出 | ⚪ | 空 buffers JSON 壳（OpenCloudRpcImpl.ts:166-230） |
| 特征树（CadFeature 记录） | 🟠 | Schema+IPC CRUD+UI 已有；无重生成引擎 |
| V2 Checkpoint / Baseline 自愈 | ✅ | baseline-generator.ts:606-762；补偿任务 2min |
| RPC 安全边界 | ❌ | 无鉴权+任意文件 IO（main.ts:214-231；OpenCloudRpcImpl.ts:275-287） |

## 平台服务层
| imodelhub-services REST（iTwins/iModels/Changesets/Briefcases/Auth） | 🟠 | 以 Task 2 实测端点数为准 |
| object-storage 多后端抽象 | 🟠 | 按 Task 2/3 对齐结论 |
| platform-backend（web-service/web-agent） | 🟠 | 按 Task 2 笔记 |

## 几何/约束
| imodel-native iModel IO/ECSQL/变更追踪/几何 | ✅/🟠 | 按 Task 3 能力清单逐项拆行 |
| acis-solid-kernel | 🟠 | 研究阶段（G0 约束未解除，见 KERNEL-STRATEGY） |
| FreeCAD GCS 资产 | 🟠 | 分析完成，未集成 |

## AI 能力
| L1/L2/L3 | ❌ | 设计完成未实现（见 AI-ARCHITECTURE.md） |
```

**注意**：`imodelhub-services` 端点数、imodel-native 逐项状态——Task 2/3/4 笔记里有实测值就填实测值，禁止照抄本计划的示例行。

- [ ] **Step 2: 收口核对**

```bash
ls /Users/xunzhang/Documents/GitHub/platform-docs
```

Expected 顶层 8 个 .md + analysis/ 齐全；README 索引 8 行齐全。

- [ ] **Step 3: 提交（Phase 1 完成点）**

```bash
cd /Users/xunzhang/Documents/GitHub/platform-docs
git add -A && git commit -m "docs: add capability status matrix; complete platform-docs phase 1

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 12: open-cloud-cad README + CLAUDE.md 诚实化 + 新定位

**Files:**
- Modify: `/Users/xunzhang/Documents/GitHub/itwinjs-core/open-cloud-cad/README.md`
- Modify: `/Users/xunzhang/Documents/GitHub/itwinjs-core/open-cloud-cad/CLAUDE.md`

**Interfaces:**
- Consumes: Task 11 STATUS.md（状态表逐行对齐）、Task 7 VISION（定位表述）、Task 1 AGENTS（规约条目）
- Produces: 修正后的两份文档；偏差清单 #1/#7 消项

- [ ] **Step 1: 重写 README.md 的 Features 与定位段**

改动点（其余章节保留）：
1. 首段定位句改为：`An open-source cloud-native **AI+CAD** platform based on iTwin.js —— AI+CAD 平台的 CAD 宿主应用。详见 platform-docs（~/Documents/GitHub/platform-docs）的 VISION.md。`
2. Features 表逐行加状态标记，与 STATUS.md 一致（Markup 行改为 `❌ 降级占位（@itwin/core-markup 模块解析问题，12 工具禁用）`；Version Control 行改为 `🟠 Changeset/Named Version 可用，冲突检测/解决为部分实现`）
3. 表格后加一行说明：`完整能力矩阵见 platform-docs/STATUS.md（状态标记：✅/🟠/⚪/❌）`

- [ ] **Step 2: 更新 CLAUDE.md**

改动点：
1. 功能状态表同步 README（同 STATUS.md）
2. 保留「开发准则」全文不动（复用优先原则有效）
3. 在「开发准则」第 4 节后新增一小节：

```markdown
### 6. AI 工具注册规约（AI+CAD 平台）
- Agent 工具必须复用现有 `toolId`（registerTools.ts 已注册项），禁止新建第二套建模 API
- Agent 操作与人工操作同权，必须走 BriefcaseTxns/saveChanges 事务管道（可撤销）
- 破坏性操作必须提供 HITL 确认流（预览→确认→提交）
- 架构详见 platform-docs/AI-ARCHITECTURE.md
```

4. 文档表补一行 `platform-docs/STATUS.md | 全平台能力矩阵`；更新「最后更新」为 2026-09-22

- [ ] **Step 3: 消项核对**

偏差清单 #1、#7 两项在 Task 5 笔记中标 `已消项`（在 platform-docs 仓改 `analysis/2026-09-22-itwinjs-core-open-cloud-cad.md` 的清单状态列，单独提交）。

- [ ] **Step 4: 提交（两仓各一次）**

```bash
cd /Users/xunzhang/Documents/GitHub/itwinjs-core
git add open-cloud-cad/README.md open-cloud-cad/CLAUDE.md
git commit -m "docs: align README/CLAUDE capability claims with code reality and AI+CAD positioning

Co-Authored-By: Claude Code <noreply@anthropic.com>"
cd /Users/xunzhang/Documents/GitHub/platform-docs
git add analysis/ && git commit -m "docs: mark drift items #1 #7 resolved

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 13: ITWINJS_CORE_MODIFICATIONS.md 推翻重写（偏差 #4 消项）

**Files:**
- Rewrite: `/Users/xunzhang/Documents/GitHub/itwinjs-core/open-cloud-cad/docs/ITWINJS_CORE_MODIFICATIONS.md`

**Interfaces:**
- Consumes: 已知事实库「fork 对上游的修改面」「修改面来源」两行；Task 9 G1 的同步税段落
- Produces: 真实修改面台账；偏差 #4 消项

- [ ] **Step 1: 重跑 diff 生成精确清单**

```bash
cd /Users/xunzhang/Documents/GitHub/itwinjs-core
git diff master...dev/open-cloud-cad --stat -- ':!open-cloud-cad' ':!common/config/rush/pnpm-lock.yaml'
```

- [ ] **Step 2: 重写文档（替换全部旧内容）**

固定章节：

```markdown
# iTwin.js Core 修改记录（真实台账）

**最后更新**: 2026-09-22
**基准**: upstream master 41fc5f3a81（5.14.0-dev.15）
**汇总**: 20 个文件，+10,963 行 / -58 行（不含 open-cloud-cad/ 与 lockfile）

## 1. 修改性质分类
### 1.1 复活上游已删除的工具（~9,400 行）
上游 PR #6495（4aefc17641 "Remove internal test tools from editor package"）删除了内部测试工具；
本 fork 在 c76e2ab36d "Integrate old editor modeling tools into v5.9.0-dev.4" 将其复活并持续修补。
文件：SketchTools.ts(+2163) SolidModelingTools.ts(+1807) SolidPrimitiveTools.ts(+1784)
      ModifyCurveTools.ts(+969) ElementGeometryTool.ts(+908)
### 1.2 共享接口扩展（高风险，同步易碎）
EditorBuiltInIpc.ts(+583) —— 扩展编辑器前后端 IPC 接口，上游同文件改动即冲突
### 1.3 上游文件修补
TransformElementsTool.ts(+511 含 import 修复) DeleteElementsTool.ts(+42) EditTool.ts(+16) EditToolIpc.ts(+6)
editor-frontend.ts(+6) Editor.json(+411) rush.json(+51) editor/verify-config.sh(+111)
## 2. 同步维护成本
（每次 upstream 同步的已知坑清单，引用 UPSTREAM_SYNC.md；本周实例：IpcAppFunctions 新增
cancelPushChangesRequest 导致 AppFunctionIpcHandler 编译失败——接口扩展类破损的预演）
## 3. 战略建议
将 1.1 类迁出 editor/ 至 open-cloud-cad 独立包（详见 platform-docs/KERNEL-STRATEGY.md 同步税段）
## 4. 自动生成文件
pnpm-lock.yaml 等（保留原文清单）
```

- [ ] **Step 3: 消项 #4 并双仓提交**

platform-docs 笔记标 #4 已消项，同 Task 12 Step 4 模式双仓提交（itwinjs-core 信息：`docs: rewrite ITWINJS_CORE_MODIFICATIONS as true fork-modification ledger`）。

---

### Task 14: open-cloud-cad ROADMAP + DEEP_ANALYSIS + Architecture 更新（偏差 #5 消项）

**Files:**
- Rewrite: `/Users/xunzhang/Documents/GitHub/itwinjs-core/open-cloud-cad/docs/ROADMAP.md`
- Modify: `/Users/xunzhang/Documents/GitHub/itwinjs-core/open-cloud-cad/docs/DEEP_ANALYSIS.md`
- Modify: `/Users/xunzhang/Documents/GitHub/itwinjs-core/open-cloud-cad/docs/Architecture.md`

**Interfaces:**
- Consumes: Task 7/8/10（VISION/AI-ARCHITECTURE/平台 ROADMAP）、已知事实库
- Produces: 应用层文档与平台叙事对齐；偏差 #5 消项

- [ ] **Step 1: 重写 ROADMAP.md**

结构：开头加一段 `本文档是平台 ROADMAP（platform-docs/ROADMAP.md）在 open-cloud-cad 应用侧的落点`；
Phase 划分对齐 Task 10（应用侧只保留 CAD 宿主相关项：特征树重生成引擎、约束服务对接、工具面 Agent 化）；
旧的 "对标 Onshape" 差距表移入「历史对照」节存档；特征树现状行改为 🟠（Schema/IPC/UI 已有、缺重生成引擎）——偏差 #5 消项。

- [ ] **Step 2: DEEP_ANALYSIS.md 更新**

1. 头部加 `**基准更新**: 2026-09-22（初版 2026-04-08）`
2. 「八、潜在问题」节替换为实测问题清单（安全债 4 项、PatternTools bug、mock API、死代码、卫生问题——数据取已知事实库）
3. 「代码规模」处更新为 37,584 行/58 测试文件
4. 全文的架构大结论旁加注 `（跨仓结论以上游 platform-docs 为准）`

- [ ] **Step 3: Architecture.md 核对与增补**

1. 对照 `apps/backend/src/main.ts:122-252` 核对端口/通道图（`/ws` `/ipc` `/rpc` RPC 路径），不符即改
2. 系统架构图加 `ai-service（规划中）` 节点与虚线（连接前端 AI 面板与工具注册表）
3. 「Web-Agent 必需性」段保留（与实现一致）

- [ ] **Step 4: 消项 #5，双仓提交**（信息：`docs: refresh app roadmap/analysis/architecture for AI+CAD era`）

---

### Task 15: docs/ 其余 9 份校对/存档横幅 + 10 项偏差终验收

**Files:**
- Modify（校对）: `open-cloud-cad/docs/{UPSTREAM_SYNC.md,CONSTRAINT-SOLVER-COMPARISON.md,SKETCH-CONSTRAINT-WORKFLOW.md,IMODEL_AUTO_RECOVERY_DESIGN.md,baseline-reliability-design.md,WEBHOOK_CONFIG.md,Deployment-Guide.md}`
- Modify（加存档横幅）: `open-cloud-cad/docs/{E2E_TEST_REPORT.md,docs/README.md 中过时段落}` —— 以逐文件核对结论为准：判定标准 = 文中数据/端口/功能状态与 2026-09 实测不符则加横幅
- Modify: `/Users/xunzhang/Documents/GitHub/platform-docs/analysis/2026-09-22-itwinjs-core-open-cloud-cad.md`（偏差清单终态）

**Interfaces:**
- Consumes: 全部前序 Task；spec 附录 A 的 10 项验收清单
- Produces: **验收完成态**：10 项全部 `已消项` 或 `已记入技术债（代码债，文档已诚实标注）`

- [ ] **Step 1: 逐份校对 7 份现行文档**

对每份执行 `Read` 并核对关键数字/端口/状态；与实测不符处就地更正或加横幅：

```markdown
> ⚠️ **历史文档（2026-04）**：本文数据反映 2026-04 状态，与当前实现存在偏差。
> 现行状态见 platform-docs/STATUS.md。保留存档供追溯。
```

判定已知点：E2E_TEST_REPORT.md 的测试日期/通过数 → 加横幅；UPSTREAM_SYNC.md 内容仍有效（本周验证过）→ 不加横幅仅补一行 2026-09-22 同步实例；CONSTRAINT-SOLVER-COMPARISON.md 加一行指向 KERNEL-STRATEGY.md。

- [ ] **Step 2: 偏差清单 10 项终审**

逐项过 spec 附录 A：#1–#5、#7 应为 `已消项`；#6/#8/#9/#10 为代码债，状态填 `已记入技术债（ROADMAP Phase 0，文档已诚实标注）`。10 项状态列全部非空且非 `待消项` 才算通过。

- [ ] **Step 3: 终验收命令**

```bash
cd /Users/xunzhang/Documents/GitHub/itwinjs-core/open-cloud-cad
grep -n '✅' README.md docs/*.md | grep -v 'STATUS' | head -30   # 逐条核对仍存在的 ✅ 声明均有证据
grep -rn 'Markup.*✅' README.md CLAUDE.md docs/ ; echo "exit(1)=OK"   # 预期无输出
ls /Users/xunzhang/Documents/GitHub/platform-docs/analysis | wc -l   # 预期 ≥ 11
```

Expected: 第二条 grep 无输出；第三条 ≥ 11。

- [ ] **Step 4: 双仓最终提交**

itwinjs-core（信息：`docs: archive stale reports and complete docs-reality reconciliation`）+
platform-docs（信息：`docs: close drift checklist — all 10 items resolved or tracked as tech debt`）。
提交后向用户报告 DoD 逐项勾选结果（spec §5 的 5 条 DoD）。

---

## Self-Review 记录（计划完成后自查）

1. **Spec 覆盖**：spec §1→Task 1–6；§2→Task 7–8；§3→Task 9；§4→Task 12–15；§5 执行顺序/DoD→Task 顺序与 Task 15 Step 4；附录 A 10 项→#1/#7(Task 12)、#4(Task 13)、#5(Task 14)、#2/#3 由 Task 11 STATUS 记录并在 Task 15 校对处消项、#6/#8/#9/#10 由 Task 10 还债清单承接并在 Task 15 终审标注。✅ 无缺口
2. **占位符扫描**：无 TBD/TODO；示例 markdown 模板中的括号说明为写作要点而非待填占位；Task 11 已注明"禁止照抄示例行，以笔记实测为准"。✅
3. **类型一致性**：文档间引用名统一（VISION.md / AI-ARCHITECTURE.md / KERNEL-STRATEGY.md / STATUS.md / ECOSYSTEM.md / ROADMAP.md 文件名一致；状态标记体系字符一致；`ai-service`、`ModelProvider`、`GeometryModelProvider`、`IntentService` 命名各处一致）。✅

---

## 执行后记（plan defects, 2026-09-22 终审记录）

1. Task 11 STATUS template omitted Auth/iTwin/iModel/AccuDraw rows → DoD 4 not literally met until this fix wave (plan defect, not executor drift).
2. Task 15 Step 2's terminal-state assignment (#1–#5、#7 已消项) conflicts with its own acceptance clause and with #2/#3's doc-only 消项动作.
3. Task 14 brief Step 2's "37,584" superseded by Task 5 re-measurement 44,122.
4. Task 15 lacked a "record verify-pass" step for no-edit files (M15-1 pattern).
