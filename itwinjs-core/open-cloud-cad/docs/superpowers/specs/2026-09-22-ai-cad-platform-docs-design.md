# AI+CAD 平台重分析与文档修正 — 设计文档

**日期**: 2026-09-22
**状态**: 已与用户逐节确认（§1–§5 全部通过）
**范围**: 跨仓库生态重分析 + 新建 platform-docs 总仓 + open-cloud-cad 文档修正（纯文档交付，不含代码实施）

---

## 1. 背景与问题

项目长期未更新，文档与代码严重脱节（2026-09-22 实测偏差见附录 A）。同时核心目标发生战略转向：

> **旧定位**：基于云服务的 CAD 应用程序
> **新定位**：基于云服务的 **AI+CAD** 应用程序

需要①对整个仓库生态做一次重分析，②按新定位重修文档体系。

## 2. 需求确认（用户决策记录）

| # | 决策点 | 结论 |
|---|---|---|
| 1 | AI+CAD 的 AI 形态 | **全都要（平台化）**：Agent Copilot + 生成式几何 + 设计意图智能，分期实现 |
| 2 | 本轮交付物 | **两层都做**：新建跨仓库顶层文档 + 重写 open-cloud-cad 过时文档 |
| 3 | acis-solid-kernel / FreeCAD GCS 角色 | **待分析报告给建议**（三路线对比后决策） |
| 4 | 顶层文档落点 | **新建独立 docs 总仓**（`~/Documents/GitHub/platform-docs`） |
| 5 | AI 基础设施 | **模型无关抽象层**（可插拔 Provider；文档双轨评估自托管 vs 商业 API） |
| 6 | 文档受众 | **开发团队 + AI 助手**（工程视角、状态诚实化、维护 CLAUDE.md/AGENTS.md） |

## 3. 实施方案（选定方案 A：分析先行、两阶段交付）

- **Phase 1**：生态重分析 → platform-docs 顶层文档（含内核路线建议）
- **Phase 2**：open-cloud-cad 文档修正（对齐代码现实 + AI+CAD 新定位）
- 备选方案 B（平行推进，有叙事脱节风险）、C（最小修正，治标不治本）已否决。

---

## 4. 设计

### §1 Phase 1 分析方法 + docs 总仓结构

**生态勘察**（10 个参考仓库，3 批并行子任务）：

| 批次 | 仓库 | 勘察重点 |
|---|---|---|
| 平台服务层 | imodelhub-services、platform-backend、object-storage | REST/存储接口面、成熟度、部署形态 |
| 客户端库 + 引擎 | imodels-clients、itwins-client、auth-clients、access-control-client、imodel-native | API 覆盖面、与 imodelhub-services 协议兼容性、native 能力边界 |
| 几何/约束储备 | acis-solid-kernel、FreeCAD（含既有 GCS/Sketcher/架构三份分析） | 内核完成度、GCS 算法成果、可集成性 |

每仓固定模板 → `analysis/YYYY-MM-DD-<repo>.md`：**职责 / 技术栈与规模 / 成熟度 / 接口面 / 上下游依赖 / 与 AI+CAD 的关联点 / 风险与状态**。汇总层交叉验证：客户端库 ↔ imodelhub-services 协议对齐、open-cloud-cad ↔ 服务调用链闭合。

**platform-docs 仓结构**：

```
platform-docs/
├── README.md            # 索引 + 阅读路径（人与 AI 助手各一条）
├── AGENTS.md            # AI 助手跨仓工作规约
├── VISION.md            # AI+CAD 愿景：三层 AI 形态定义 + 产品定位
├── ECOSYSTEM.md         # 仓库全景：职责矩阵、依赖图、状态
├── AI-ARCHITECTURE.md   # 三层 AI 平台架构
├── KERNEL-STRATEGY.md   # 内核三路线对比与推荐
├── ROADMAP.md           # AI+CAD 分期 + 文档还债清单
├── STATUS.md            # 能力现状矩阵（诚实化锚点）
└── analysis/            # 各仓勘察原始笔记
```

`STATUS.md` 为防脱节机制性锚点：所有能力声明必须带状态标记（§4-§2 定义的体系），与 open-cloud-cad 文档双向引用。

产品名暂沿用 "Open Cloud CAD"；是否更名随 AI+CAD 定位在 VISION 审阅时决定。

### §2 AI-ARCHITECTURE.md 核心内容

**三层架构**（新服务 `ai-service` 单仓起步，避免过早微服务化）：

```
L1 Agent 编排层（建模 Copilot）
   对话 → 任务规划 → Tool Use 调用 CAD 工具链 → 事务提交
L2 模型无关 Provider 抽象层
   ModelProvider 接口（chat/tool-use/stream/embed/结构化输出）
   ├─ Claude Provider（Anthropic SDK，一等公民实现）
   ├─ OpenAI 兼容适配器（vLLM/Ollama/Qwen/DeepSeek 自托管）
   └─ GeometryModelProvider（文生3D/扩散/3DGS，独立接口）
L3 意图推理层（IntentService）
   约束推断 / 自动标注 / 特征识别 / 参数推荐 / 设计审查
```

**关键设计决策**：

1. **工具面复用现有资产**：`registerTools.ts` 的 50+ 工具、`basicManipulationIpc`、EditCommand 栈直接注册为 Agent Tools（每工具 = 现有 `toolId` + 参数 Schema），不做第二套建模 API。与 CLAUDE.md"复用优先"准则一致。
2. **Agent 运行时**：自托管 harness（Claude API + Tool Runner 模式起步）；所有 Agent 操作走 `BriefcaseTxns`/`saveChanges` 事务管道——**可撤销是硬约束**；破坏性操作需 HITL 确认（预览→确认→提交）。
3. **Provider 抽象**：路由按能力（tool-use 重→强模型，分类→小模型）+ 成本/延迟预算 + 回退链。Claude 参考实现使用 Anthropic SDK（Tool Use、大工具表 Prompt Caching、adaptive thinking）。
4. **意图层数据飞轮**：acis-solid-kernel + FreeCAD 分析资产用于合成约束/特征数据集，反哺意图模型。
5. **横切**：AI Gateway 统一鉴权/配额/审计（对齐 access-control-client 权限模型）。

### §3 KERNEL-STRATEGY.md 评估框架

**三路线**（双内核分工 / 长期替换 / 纯储备）× **5 维评分**：

| 维度 | 评估内容 |
|---|---|
| 战略契合 | 与 AI+CAD 三层的匹配度，尤其生成式几何对几何后端的要求（mesh→B-rep、可编辑性、并行批量） |
| 成本 | 人月、维护税（含 itwinjs-core 上游同步税，已实测 fork 面 ~1.1 万行）、基础设施 |
| 风险 | 由 G0/G1/G2 决策门输入 |
| 收益 | 差异化、摆脱商业内核依赖、性能/可控性 |
| 时间 | 各阶段见效时间点 |

**三个前置决策门**（可一票否决路线）：

1. **G0 法律/IP 门（最高优先）**：acis-solid-kernel 基于反编译参考代码实现，LICENSE 自限 "Research and learning only"。产品化前必须评估：clean-room 纪律（仅 public headers + 行为规格）/ 转向 OCCT（许可干净）/ 商业授权 ACIS。
2. **G1 能力缺口门**：以 acis-solid-kernel 的 TEST_RESULTS/DS golden 完成度为基准，对照 imodel-native 实际调用面（open-cloud-cad + itwinjs-core 所需几何能力清单），量化"重写完成度 vs 产品最小所需集"。
3. **G2 AI 需求门**：L3 生成式几何若要求可微几何/批量实例化/mesh-B-rep 混合管线，评估 imodel-native 是否本就无法满足——若是，自研/OCCT 成为必由之路。

**交付形态**：对比矩阵 + 各路线阶段图（并行期/切换点/回退条件）+ 明确推荐 + 换路线触发条件清单。证据源：acis-solid-kernel 测试报告、imodel-native 能力文档、FreeCAD GCS/Sketcher 分析、open-cloud-cad 几何调用面实测。

### §4 Phase 2：open-cloud-cad 文档修正

原则：**状态诚实化** + 一事一源（跨仓愿景只在 platform-docs，应用文档引用）+ 代码证据引用（file:line）。

| 文件 | 修正要点 |
|---|---|
| README.md | 功能表按状态标记重写（Markup→❌、冲突检测→🟠、GLTF→⚪）；定位改为"AI+CAD 平台的 CAD 宿主应用"；指向 platform-docs |
| CLAUDE.md | 功能状态表同步；保留"复用优先"准则；补 AI 工具注册规约；更新链接/日期 |
| docs/ITWINJS_CORE_MODIFICATIONS.md | **推翻重写**：如实记录 20 文件/+1.1 万行修改面、复活 editor 工具（上游 PR #6495 删除后本地保留）、EditorBuiltInIpc +583、同步税分析 |
| docs/ROADMAP.md | 目标改 AI+CAD 三层分期：Phase 0 还债 → Agent Copilot → 意图层 → 生成式几何；参数化/约束服务降为 L3 支撑 |
| docs/DEEP_ANALYSIS.md | 更新至 2026-09 实测；重大结论上收 platform-docs |
| docs/Architecture.md | 核对实测；补 ai-service 层位与数据流 |
| docs/ 其余 9 份（CONSTRAINT-SOLVER-COMPARISON、Deployment-Guide、E2E_TEST_REPORT、IMODEL_AUTO_RECOVERY_DESIGN、docs/README、SKETCH-CONSTRAINT-WORKFLOW、UPSTREAM_SYNC、WEBHOOK_CONFIG、baseline-reliability-design） | 现行有效者校对（UPSTREAM_SYNC 等）；过时者加 "⚠️ 历史文档（2026-04）" 横幅存档，不删除 |

**状态标记体系**（全项目统一）：✅ 真实可用 / 🟠 部分实现 / ⚪ stub 或 mock / ❌ 禁用或失效。任何能力声明必须带标记。

**验证方式**：附录 A 的偏差清单作为验收清单逐项消项；每个 ✅ 声明抽查代码证据并写入文档。

### §5 执行顺序与完成定义

**执行顺序**：Phase 1a 并行勘察 → Phase 1b 汇总写 platform-docs → Phase 2 修正 open-cloud-cad → 每阶段 git 提交。

**完成定义（DoD）**：

- [ ] platform-docs 8 文件 + analysis/ 笔记齐备并提交（新建 git 仓）
- [ ] 附录 A 的 10 项文档-现实偏差全部消项
- [ ] KERNEL-STRATEGY 含 G0/G1/G2 实际结论 + 路线推荐 + 换路线触发条件
- [ ] STATUS.md 覆盖两仓全部对外能力声明
- [ ] open-cloud-cad 文档修正全部提交，历史文档已加存档横幅

**后续流程**：本 spec 经用户审阅 → writing-plans 产出实施计划。

---

## 附录 A：文档-现实偏差清单（验收基准，2026-09-22 实测）

| # | 偏差 | 现状证据 | 消项动作 |
|---|---|---|---|
| 1 | README/CLAUDE 声称 Markup ✅ | `registerTools.ts:37-51` 12 工具全禁用；`useMarkupManager.ts:7,113` 无依赖占位 | 状态改 ❌/🟠 |
| 2 | 版本控制"冲突检测 ✅" | `OpenCloudRpcImpl.ts:119-128` mock 空数据；`:943-1034` 解决策略多为 no-op | 状态改 🟠/⚪ |
| 3 | GLTF 导出 | `OpenCloudRpcImpl.ts:166-230` 空 buffers 的 JSON 壳 | 状态改 ⚪ |
| 4 | ITWINJS_CORE_MODIFICATIONS 记 3 处修改 | 实测 `git diff master...dev` = 20 文件 +10,963 行 | 文档重写 |
| 5 | ROADMAP 称特征树"无，一次性操作" | CadFeature Schema + IPC CRUD + FeatureTreePanel/FeaturePanel 已存在 | 文档更新 |
| 6 | 硬编码绝对路径（4 月已记录未修） | `OpenCloudIpcHandler.ts:207`、`vite.config.ts:11,134` | 记入技术债 + STATUS |
| 7 | 功能表与工具注册表不符 | 实际注册清单以 `registerTools.ts` 为准 | 状态表重写 |
| 8 | PatternTools 缺陷与 PatternCommand 死代码 | `PatternTools.ts:131-134,331-334` ID 收集 bug；PatternCommand 未注册 | 记入技术债 + STATUS |
| 9 | RPC 无鉴权 + 任意文件 IO | `main.ts:214-231` 无 JWT；`OpenCloudRpcImpl.ts:275-287` 裸 fs | 记入安全债（部署阻断级） |
| 10 | 仓库卫生问题 | `open-cloud-cad/.github/workflows` 死配置；`__blobstorage__`/playwright-report/`web-agent.log` 入库 | 记入技术债 |

## 附录 B：开放问题

- 产品是否随 AI+CAD 定位更名（VISION 审阅时决定）。
- 内核三路线的最终选择（KERNEL-STRATEGY 完成后决策）。
