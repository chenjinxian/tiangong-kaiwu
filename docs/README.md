# 天工开物平台文档目录（docs/）

本文档目录位于 tiangong-kaiwu 仓根部，是项目唯一文档根，包含鲁班CAD 应用与平台工程的技术文档和参考资料。

---

## 文档索引

### 核心文档
| 文档 | 说明 |
|------|------|
| [CLAUDE.md](../CLAUDE.md) | 平台总仓主文档：仓库布局、构建/测试命令、上游同步规约 |
| [README.md](../README.md) | 平台介绍与架构分工 |
| [luban-cad/CLAUDE.md](../luban-cad/CLAUDE.md) | 鲁班CAD 开发准则（复用优先/工具生命周期/AI 工具注册规约） |

### 架构与设计
| 文档 | 说明 |
|------|------|
| [DEVELOPMENT-RULES.md](./DEVELOPMENT-RULES.md) | **开发规则唯一权威（v1.0，2026-11-04 生效）**：P0 平台宪法 10 条 + P1 架构/工程规则 12 条 + AIRR/例外/执行机制 |
| [Architecture.md](./Architecture.md) | 系统架构详细设计 |
| [architecture/INTERFACE-FREEZE-MATRIX.md](./architecture/INTERFACE-FREEZE-MATRIX.md) | 接口冻结矩阵（公开契约层）：P0/P1 接口、owner、版本、变更流程、验收证据；后端/原生逐文件证据在私有仓 |
| [architecture/AIRR-TEMPLATE.md](./architecture/AIRR-TEMPLATE.md) | Architecture Impact & Reuse Review 模板（功能开工门禁） |
| [architecture/CANONICAL-SOURCES.md](./architecture/CANONICAL-SOURCES.md) | 规范来源表：能力 → 官方/参考来源 → 禁止项 |
| [architecture/EXCEPTIONS.md](./architecture/EXCEPTIONS.md) | 规则例外与债务登记（owner/失效日期/退出计划） |
| [adr/0001-itwin-imodel-data-model.md](./adr/0001-itwin-imodel-data-model.md) | ADR：iTwin/iModel 数据模型与“文档—页签”信息架构（**已接受**；P0 前置完成；P1 spike **Go（qualified）**；**P2 实现并发布（2026-11-01，Release `backend-20261101-p28c`）**：RPC 1.18、B flag rollout/rollback、证据与残项处置；P3 旧数据迁移退役、P4 暂缓） |
| [adr/0002-retire-legacy-edit-channel-and-unify-selection.md](./adr/0002-retire-legacy-edit-channel-and-unify-selection.md) | ADR：退役旧编辑 RPC 通道（shared 1.1.0）、草图工具族唯一、`store.canvas.selection` 单一选择权威（X-01/X-02/X-03，2026-11-04） |
| [adr/0003-onshape-parity-scenario-contract.md](./adr/0003-onshape-parity-scenario-contract.md) | ADR（已接受 2026-11-04）：Onshape parity 场景/证据契约 v1（测试专用 schema、逐 body 期望、blocked-evidence/capability；不新增运行时 RPC） |
| [adr/0004-sketch-contract-onshape-parity.md](./adr/0004-sketch-contract-onshape-parity.md) | ADR（已接受 2026-11-04，分切片）：草图契约扩展（construction、DIAMETER/ANGLE/CONCENTRIC/PROJECTED/MIRROR/PIERCE、driven 尺寸、point-circle coincident；shared bump + 双端）；第一切片 point+circle 已落地 |
| [adr/0005-extrude-revolve-contract-onshape-parity.md](./adr/0005-extrude-revolve-contract-onshape-parity.md) | ADR（已接受 2026-11-04，Phase 1 已落地）：extrude endBound blind/throughAll、REMOVE/INTERSECT、方向/起始偏移；revolve remove；upTo*/draft/secondDirection/revolve new 待后续；face-extrude 转 ADR-0006 |
| [adr/0006-onshape-new-feature-types.md](./adr/0006-onshape-new-feature-types.md) | ADR（提议/待立项）：hole/draft/rib/pattern/mirror 平面/cPlane/变量/face-extrude/chamfer 边语义；逐能力另立 AIRR/ADR |
| [superpowers/specs/2026-11-04-debt-cleanup-x01-x03-airr.md](./superpowers/specs/2026-11-04-debt-cleanup-x01-x03-airr.md) | AIRR：X-01/X-02/X-03 第一轮债务清理（复用矩阵/跨仓影响/测试/回滚） |
| [superpowers/specs/2026-11-04-onshape-example-replication-airr.md](./superpowers/specs/2026-11-04-onshape-example-replication-airr.md) | AIRR（已批准）：Onshape 示例复刻与 Part Studio 交互/UI 对齐；Batch 1 六示例、复用矩阵、跨仓/回滚 |
| [superpowers/specs/2026-11-04-onshape-batch1-gap-matrix.md](./superpowers/specs/2026-11-04-onshape-batch1-gap-matrix.md) | Batch 1 能力/数据缺口矩阵（construction/DIAMETER/endBound 等契约缺口；ADR-0004/0005 批次） |
| [superpowers/plans/2026-11-04-onshape-parity-batch1-gate.md](./superpowers/plans/2026-11-04-onshape-parity-batch1-gate.md) | 执行计划：Tutorial 2 X-14 关闭 + 面域拾取安全化 + Batch 1 缺口登记（已完成并留证） |
| [ROADMAP.md](./ROADMAP.md) | 路线图索引（指向全程序路线图） |
| [SKETCH-CONSTRAINT-WORKFLOW.md](./SKETCH-CONSTRAINT-WORKFLOW.md) | 草图约束工作流程（设计稿） |
| [CONSTRAINT-SOLVER-COMPARISON.md](./CONSTRAINT-SOLVER-COMPARISON.md) | 约束求解器对比分析（历史选型输入） |
| [baseline-reliability-design.md](./baseline-reliability-design.md) | Baseline 可靠性设计 |
| [IMODEL_AUTO_RECOVERY_DESIGN.md](./IMODEL_AUTO_RECOVERY_DESIGN.md) | iModel 初始化失败自动修复设计 |
| [UI-ONSHAPE-PARITY-2026-11-02.md](./UI-ONSHAPE-PARITY-2026-11-02.md) | Onshape UI 全量对齐（40px 顶栏/36px 工具栏/40px 面板轨/200px 树/30px 页签、Onshape SVG 图标、ViewCube/显示设置、无可见状态栏；草图**单对话框**（创建+编辑，无实体/约束清单面板）+ 视口平面拾取 + 单尺寸钮与标注位置弹框 + 拉伸/旋转视口面域 chip + 特征树双击二次编辑（updateParams）；含 Tutorial2 四短竖棱圆角、特征实时预览与「Tutorial 2 - Build a Part」新建项目展示；2026-11-03 渲染回退 iTwin 默认材质/灯光、无模式统一选择） |
| [BREP-RENDERING-2026-11-03.md](./BREP-RENDERING-2026-11-03.md) | 完整 BRep 元素渲染与拾取（不修改 iTwin 渲染器/shader）：iTwin 默认灯光/材质 + 白底 + 全部拓扑边叠加层（WorldDecoration + 深度偏移）、BRep 顶点显示、统一 Onshape 无模式点/边/面拾取（面 `getClosestPoint` 兜底、背棱深度剔除、undo/redo 恢复选择）；含原生面定位卡死与 3-scope 相机竞态已知边界 |

### 技术参考
| 文档 | 说明 |
|------|------|
| [iTwin.js-Tools-Complete-Reference.md](./iTwin.js-Tools-Complete-Reference.md) | iTwin.js 工具完整参考 |
| [ITWINJS_CORE_MODIFICATIONS.md](./ITWINJS_CORE_MODIFICATIONS.md) | iTwin.js Core 修改记录 |
| [web-realstack-probes.md](./web-realstack-probes.md) | 前端真实栈探针标准动作（发布前必跑） |

### 部署与运维
| 文档 | 说明 |
|------|------|
| [Deployment-Guide.md](./Deployment-Guide.md) | 部署指南 |
| [PORTS.md](./PORTS.md) | 宿主端口登记（单一事实源） |
| [UPSTREAM_SYNC.md](./UPSTREAM_SYNC.md) | 上游同步指南 |
| [WEBHOOK_CONFIG.md](./WEBHOOK_CONFIG.md) | Webhook 密钥配置说明 |

### 发布与迁移
| 文档 | 说明 |
|------|------|
| [RELEASE-backend-20261101-p28c.md](./RELEASE-backend-20261101-p28c.md) | 最新后端发布说明（B 数据模型 P2 / 命名迁移 / legacy schema 退役） |
| [RELEASE-CHECKLIST.md](./RELEASE-CHECKLIST.md) | 发布检查清单（产物 hash / native provenance / 限流姿态 / 镜像标签 / verify-stack） |
| [RELEASE-backend-20261028c.md](./RELEASE-backend-20261028c.md) | 历史发布说明（MS #45 redo 栈修复） |
| [MIGRATION-2026-10-29.md](./MIGRATION-2026-10-29.md) | 2026-10-29 项目总目录整理迁移记录 |
| [HISTORY.md](./HISTORY.md) | 已删除文档历史索引 |

### 子目录
| 目录 | 说明 |
|------|------|
| [adr/](./adr/) | 架构决策记录（ADR） |
| [superpowers/specs/](./superpowers/specs/) | 保留的设计记录（架构裁决/全程序路线图/parity 设计/清理设计） |
| [superpowers/plans/](./superpowers/plans/) | 保留的执行计划（item4 组合/hub backlog/M-A5.2 计划/本轮清理计划） |
| [tool-integrations/](./tool-integrations/) | 工具集成方案与状态 |
| [api-specs/](./api-specs/) | 官方 iTwin Platform REST 规格（契约对照基准） |

---

## 文档维护指南

- 所有新文档应添加到本文档目录
- 文档更新时请同步更新此索引
- 临时分析文档请在文件名中注明日期
- 已删除文档：见 [HISTORY.md](./HISTORY.md)

---

现行能力状态以本目录保留文档与代码/测试实测为准（状态标记：✅/🟠/⚪/❌）。

*最后更新: 2026-11-04（X-01/X-02/X-03/X-14 已关闭；Onshape parity AIRR 已批准、ADR-0003/0004 已接受、ADR-0005 Phase 1（shared 1.22.0：extrude remove/intersect/throughAll/direction/offset、revolve remove）已落地、ADR-0006 待立项；Batch 1 缺口矩阵/执行计划/scenario v1 落档；Tutorial 2 iOS 几何回放 157.165 cm³/-0.20%；tutorial2 setup+strict 2 passed、tutorial2-tools 6 passed；后端/原生逐文件证据在私有仓）*
