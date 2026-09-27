# AI 建模新会话启动提示词

> 用途：粘贴到新的 Claude Code 会话（工作目录 D:\Github\tiangong-kaiwu）作为第一条消息。
> 生成于 2026-09-27，背景是刚完成全平台架构治理（T1.1-T2.4 全部交付，测试全绿）。

---

## 提示词正文（复制以下全部）

我要在天工开物平台上启动 **AI 建模**能力的开发。参考 kittyCAD / CADquery 的路线：**AI 大模型生成建模脚本 → 平台层解析脚本 → 调用既有建模接口完成建模**。这是一个新特性的架构级 brainstorm，请先调用 brainstorming 技能再开始任何探索。

### 平台现状（你可能需要的硬事实，均已治理到可用状态）

**仓库布局**：本仓 `tiangong-kaiwu` 是唯一 git 仓。核心目录：
- `luban-cad/`（pnpm workspace）：`apps/web`（React 18 + Vite :3000，features/{auth,itwin,imodel,editor,modeling,version-control,...}）+ `packages/{shared,viewer-core,web-viewer,config}`
- `modeling-server/`（独立 pnpm 包 :4001）：Express + `LocalhostIpcHost`（WebSocket IPC）+ `OpenCloudRpcImpl`（BentleyCloudRpc over `/:title/:version/mode/*`）+ 自定义 IPC handler + `EditCommandAdmin`
- `webhook-agent/`（:4002）：webhook 验签、baseline 生成（CloudSqlite→Azurite）
- `itwinjs-core/`：vendored iTwin.js fork（Rush 管理，应用以 pnpm `link:` 消费源码；上游同步用 `bash scripts/sync-from-upstream.sh`，原生库替换用 `scripts/replace-imodeljs-native.ps1`）
- 仓外：imodelhub-services（本地 iModel 平台 :4000，NestJS）、imodel-native（几何内核仓，含我们的 BRepCore+ACIS 改造，分支 `dev/source-build`）

**命名家族**：平台 天工开物 / 产品 鲁班CAD（LubanCAD）/ 几何内核 真形 / 约束求解器 绳墨。生成物 = 真形（BRep）。

### 建模管道硬约束（铁律，不可协商）

1. **编辑管道**：工具继承 iTwin.js 标准基类（`ElementSetTool`/`PrimitiveTool`/`CopyElementsTool`）→ 编辑走 `basicManipulationIpc` → 事务走 `BriefcaseTxns`/`saveChanges`，**可撤销是硬约束**
2. **AI 工具注册规约**（见 `luban-cad/CLAUDE.md`）：Agent **必须复用现有 `toolId`**（`features/editor/registerTools.ts` 已注册项），**禁止第二套建模 API**；Agent 操作与人工操作同权，同走事务管道；破坏性操作走 **HITL（预览→确认→提交）**
3. 编辑命令 RPC 生命周期已存在：前端 `executeEditCommand.ts`（start/call/finish）→ MS `EditCommandAdmin`（已注册 `solidModeling` 等内置命令）；实体建模 hook `useSolidModeling`（blendEdges/chamferEdges/hollowFaces/offsetFaces/roundEdges/draftFaces + ElementGeometry API）
4. MS 的 `generateElementGraphics`（经 iModelJsNative）能产出几何预览——HITL 预览阶段可复用

### 本轮目标

架构级设计 + spec：
1. **脚本语言/DSL 选型**：参考 kittyCAD（TypeScript 风格 artifact/API）与 CADquery（Python 参数化）：选 JSON 命令流、TypeScript DSL、还是 Python 子集？考虑大模型生成准确率、平台解析复杂度、与现有 RPC 的映射
2. **平台层解析与执行架构**：脚本在 FE 解析还是 MS 解析？执行器如何映射到 `EditCommandAdmin`/`basicManipulationIpc`？沙箱/白名单约束（LLM 输出不可信）
3. **AI 交互循环**：大模型上下文（当前模型状态如何喂给 LLM）、流式输出、错误反馈重试环
4. **HITL 集成**：预览（`generateElementGraphics`）→ 确认 → 提交（事务）的 UI 流
5. **与既有 agent 规约的关系**：`platform-docs/AI-ARCHITECTURE.md`（仓外）是既有架构文档，设计需对齐「复用 toolId、单一建模 API」原则

### 过程要求

- 先调用 superpowers:brainstorming 技能；这是 architectural 级任务（新子系统、跨 FE/MS/可能新增服务）
- 设计前先盘点 `modeling-server/src/rpc/OpenCloudRpcImpl.ts`、`features/editor/registerTools.ts`、`features/modeling/`（executeEditCommand、useSolidModeling）、`docs/api-specs/`（官方 iTwin Platform 规格）
- LLM 接入层（哪个模型、API key 管理）需要时再问，不要提前设计
- 产出：分节设计获我认可 → spec 落 `docs/superpowers/specs/` → writing-plans → SDD 执行（前几轮全部如此，流程已验证）

### 提示词正文结束

---

## 附：新会话可能追问的背景速答

- **为什么禁止第二套建模 API**：编辑可撤销性依赖事务管道；旁路 API 会绕过 undo/redo 与 onCommitted 事件，破坏协作与 UI 状态同步
- **kittyCAD 路线是什么**：用户用自然语言/参数描述 → LLM 生成 TypeScript「建模程序」（artifact）→ 平台类型化解释执行 → 产出 BRep。特点是脚本可读可编辑可重放
- **CADquery 路线是什么**：Python 参数化脚本（脚本即图纸源），内核级执行。对我们更适合借鉴「脚本即源文件」理念而非直接抄 Python
- **模型几何状态怎么给 LLM**：ECSQL 查询元素摘要（class/id/参数）经 MS 已有 RPC；全量几何不可行也不必要
- **前几轮治理为什么重要**：全栈测试从破碎→全绿（WA 41/MS 133/HUB 164/FE 373），FE tsc 零错误——新特性在干净地基上开工，回归信号可信
