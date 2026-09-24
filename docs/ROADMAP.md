# LubanCAD - 演进路线图（应用侧落点）

**文档版本**: 3.0
**最后更新**: 2026-09-22

本文档是平台 ROADMAP（platform-docs/ROADMAP.md）在 luban-cad 应用侧的落点：分期编号、目标、还债清单与排期口径以平台 ROADMAP 为一事一源，本文**引用、不重定义**。应用侧只保留 CAD 宿主相关项——**特征树重生成引擎、约束服务对接、工具面 Agent 化**；其余跨仓分期内容（ai-service 立项、ModelProvider、几何计算服务等）归平台文档。

- 状态标记：`✅ 真实可用` / `🟠 部分实现` / `⚪ stub 或 mock` / `❌ 禁用或失效`。
- 数据基准：2026-09-22 勘察笔记（`platform-docs/analysis/2026-09-22-itwinjs-core-luban-cad.md`）。
- 排期约定沿用平台：**不给绝对日期**，推断周期一律带 ⚠️ 估算。

---

## 当前状态（2026-09-22 基准）

| 功能 | 状态 | 说明 |
|------|------|------|
| 草图 | ✅ 基础 | Line/Arc/Circle/Rectangle/Polygon（自由绘制，未接约束服务） |
| 实体建模 | 🟠 | 12 工具注册齐全，PatternTools ID 收集 bug（`luban-cad/apps/web/features/modeling/PatternTools.ts:131-134,331-334`）；PatternCommand 死代码未注册 |
| 布尔运算 | ✅ | Union/Subtract/Intersect |
| 变换 | ✅ | Move/Rotate/Scale/Mirror |
| 测量 | ✅ | Distance/Area/Volume/Length 等 6 种 |
| 标记 | ❌ | @itwin/core-markup 模块解析问题，12 工具全禁用 |
| 视图裁剪 | ✅ | Plane/Shape/Range 剖切 |
| 版本控制 | 🟠 | Changeset/Named Version 可用；冲突检测 `compareChangesets` 返回 mock 空数据 |
| 文档管理 | ✅ | Briefcase 串行编辑（短期不做实时协作，见平台 VISION §5 非目标） |
| **特征树** | **🟠** | **Schema/IPC/UI 已有、缺重生成引擎**——CadFeature EC 类（`modeling-server/src/schema/OpenCloudCADSchema.ts`）+ IPC CRUD（`luban-cad/packages/shared/src/OpenCloudIpcInterface.ts:41`）+ FeatureTreePanel/FeaturePanel 均已存在，无重生成引擎（`platform-docs/analysis/2026-09-22-itwinjs-core-luban-cad.md:42`） |
| V2 Checkpoint 流水线 | ✅ | CloudSqlite BCVV 流式加载 + BaselineCompensationJob 自愈 |
| 工具注册表 | ✅ | `registerTools.ts` 64 活跃工具 + 12 注释禁用 Markup——AI 工具面事实清单 |

---

## 应用侧分期（对齐平台 Phase 0–3）

> 分期定义与验收基准归 platform-docs/ROADMAP.md；下表每节只列**本仓承担的 CAD 宿主交付物**。

### Phase 0 — 还债（前置）

- **平台指针**：platform-docs/ROADMAP.md「Phase 0 — 还债」（目标、四类债务清单、验收基准）。
- **应用侧落点**：安全债 4 项全部在本仓后端（RPC 无鉴权 `modeling-server/src/main.ts:214-231`、任意文件 IO `modeling-server/src/rpc/OpenCloudRpcImpl.ts:275-287`、token 泄露 `:302`、默认口令 `:1124-1127`）；功能债（PatternTools ID bug、mock API、PatternCommand 死代码）与卫生债（构建产物入库、死 CI）同在本仓——逐项证据见平台 ROADMAP Phase 0 与勘察笔记 §7。
- **门禁**：本阶段 P0 未清前不做对外部署形态联调（平台 ROADMAP 门禁条，原文引用）。
- **对 AI 的意义**：安全债清偿是 RPC 鉴权成为 AI Gateway 对外暴露前置的同一债务。

### Phase 1 — 工具面 Agent 化（L1 Copilot 落点）

- **平台指针**：platform-docs/ROADMAP.md「Phase 1 — AI Agent Copilot（L1）」；架构归 AI-ARCHITECTURE.md。
- **目标**：前端工具面接入 Agent——既有 64 活跃工具全量注册为 Agent Tools，AI 每步与人同权走 `BriefcaseTxns`/`saveChanges` 事务管道、同权可撤销；不建第二套建模 API。
- **应用侧交付物**：
  - [ ] 工具注册表 → Agent Tools 胶水层（toolId + 参数 Schema + 事务装饰，`luban-cad/apps/web` `registerTools.ts` 64 项为准）
  - [ ] HITL 确认面板（前端，预览 → 确认 → 提交）
  - [ ] 破坏性操作与人工操作同权入事务/撤销链
- **依赖**：ai-service 立项、Phase 0 安全债【P0】清偿（平台 Phase 1 依赖，引用）。
- **风险**：工具面诚实边界限制 Agent 动作集（Markup ❌、PatternTools 🟠——Phase 0 功能债清偿直接扩大可动作集）。

### Phase 2 — 特征树重生成引擎 + 约束服务对接（L3 落点）

- **平台指针**：platform-docs/ROADMAP.md「Phase 2 — 设计意图智能（L3）」。
- **目标**：把 🟠 特征树骨架补齐为可重生成的参数化落点；草图接约束服务，承接 L3 `IntentService` 的逐条建议（确认后确定性求解/写入）。
- **应用侧交付物**：
  - [ ] **特征树重生成引擎**（基于既有 CadFeature 骨架 🟠——Schema/IPC CRUD/FeatureTreePanel 已在、缺重生成引擎）：拓扑排序、增量重生成、参数编辑回写
  - [ ] **约束服务对接**：约束创建工具栏、尺寸标注、求解失败提示；服务端求解归平台约束服务（FreeCAD GCS 移植路线，选型一事一源归 KERNEL-STRATEGY），本仓只做协议对接与 UI
  - [ ] `IntentService` 建议清单 UI（逐条状态标记 + 人确认）
- **依赖**：平台约束服务 MVP（~1 季 ⚠️ 估算，引自 KERNEL-STRATEGY §4）；`IntentService` 会话上下文（非阻断，UI 可先行直连，平台 Phase 2 依赖条）。
- **风险**：重生成引擎从 🟠 骨架到可用的工期不确定 ⚠️ 估算（平台 Phase 2 风险条）。

### Phase 3 — 生成结果可编辑回环（L2 落点，轻量）

- **平台指针**：platform-docs/ROADMAP.md「Phase 3 — 生成式几何（L2）」；几何计算服务、GeometryModelProvider 归平台。
- **应用侧落点**：无独立大项——生成几何经内核校验、显式标注来源后事务入库，升级为 B-rep 后接入既有 64 工具编辑链；特征树显式标注"生成式来源"（承接 Phase 2 重生成引擎）。
- **依赖**：G2 门结论、平台几何服务 MVP（平台 Phase 3 依赖条，引用）。

---

## 历史对照（2026-04 旧版存档）

> 以下为旧版 ROADMAP（2026-04-08，v2.0）的"对标 Onshape"差距表，**仅作历史存档，不再是排期依据**。处置说明见 platform-docs/ROADMAP.md「与旧版 ROADMAP 的关系」（一事一源）。

### 旧版核心差距表（已废止）

| 能力 | Onshape | LubanCAD（旧版口径） | 旧优先级 |
|------|---------|---------------------------|--------|
| **草图约束** | 完整2D约束求解 | 无约束，自由绘制 | 🔴 P0 |
| **参数化特征** | Feature Tree可编辑 | 一次性操作 | 🔴 P0 |
| **表达式驱动** | 参数关联计算 | 固定值 | 🟡 P1 |
| **实时协作** | 多用户同时编辑 | 单用户 | 🔴 P0 |
| **装配约束** | 配合、对齐、角度 | 无 | 🟡 P1 |
| **高级特征** | Draft/Rib/Slot/Multi-section | 基础特征 | 🟡 P1 |
| **工程图** | Drawing | 无 | 🟢 P2 |

### 旧版条目处置

| 旧版条目 | 处置 |
|----------|------|
| Phase 1「草图约束求解器」（SolveSpace GCS 选型） | 收进本版 Phase 2 **约束服务对接**；选型归 KERNEL-STRATEGY（FreeCAD GCS 移植 + LGPL §6 义务），"SolveSpace GCS" 引用过时 |
| Phase 2「参数化特征树」 | 收进本版 Phase 2 **特征树重生成引擎**（基于既有 CadFeature 骨架 🟠） |
| 「参数化特征 = 无，一次性操作」 | **失实**：特征树 Schema/IPC/UI 已在、缺重生成引擎（当前状态表 🟠 行；勘察笔记 §8 偏差 #5 已消项） |
| 「实时协作 🔴 P0」 | 按 VISION.md §5 非目标降级：短期不做实时多人协作，维持 Briefcase 串行编辑 |
| 装配约束 / 工程图 / 表达式 / 高级特征 | 不在平台三期目标内，按需另立分期 |
| 旧版 v1.0 → v3.0 版本叙事与时间表（24–31 个月） | 不再作为排期依据；排期归平台 ROADMAP（相对周期 + ⚠️ 估算） |

---

## 参考资源

- platform-docs/ROADMAP.md — 平台分期与还债清单（权威）
- platform-docs/VISION.md — 三层能力定义（L1/L2/L3）
- platform-docs/AI-ARCHITECTURE.md — 架构与 ai-service 边界
- platform-docs/KERNEL-STRATEGY.md — 内核路线与约束求解器选型
- platform-docs/analysis/2026-09-22-itwinjs-core-luban-cad.md — 能力现状与偏差清单
- [iTwin.js](https://www.itwinjs.org/) — 核心框架

---

*最后更新: 2026-09-22*
