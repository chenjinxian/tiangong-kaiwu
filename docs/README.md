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
| [superpowers/specs/2026-11-04-onshape-example-replication-airr.md](./superpowers/specs/2026-11-04-onshape-example-replication-airr.md) | AIRR（已批准）：Onshape 示例复刻与 Part Studio 交互/UI 对齐；Batch 1 六示例、复用矩阵、跨仓/回滚；2026-11-05 补 12 个 iModel/重开回归/union 研究结论 |
| [superpowers/specs/2026-11-06-example-coverage-master-airr.md](./superpowers/specs/2026-11-06-example-coverage-master-airr.md) | AIRR（已批准，2026-11-06）：Onshape 示例全量覆盖总纲；一文档一 iModel/多 PS scope、静态 registry/运行态 state、selector/translator、四维状态、私有 corpus 索引与回滚门禁 |
| [superpowers/specs/2026-11-06-shell-ui-airr.md](./superpowers/specs/2026-11-06-shell-ui-airr.md) | AIRR（已实施，2026-11-06）：参数化抽壳 UI；复用 ShellParams/既有求值/选择权威，移除面+壁厚+方向+影子预览；官方帮助页证据；真栈 1084.000 mm³、编辑/undo/重开 |
| [superpowers/plans/2026-11-06-example-coverage-continuous.md](./superpowers/plans/2026-11-06-example-coverage-continuous.md) | 连续执行台账（活文档）：T2 边选择器 / T3 抽壳 / T4 第二方向 / T5 mirror 世界平面已完成；T4 其余能力与 B1+ 批次进行中 |
| [superpowers/plans/2026-11-06-capability-coverage-examples.md](./superpowers/plans/2026-11-06-capability-coverage-examples.md) | 公开示例能力覆盖轨道（2026-11-06）：创建副本→UI 取证→近似重建；与严格数据保真口径分离 |
| [superpowers/specs/2026-11-05-imprint-face-extrude-airr.md](./superpowers/specs/2026-11-05-imprint-face-extrude-airr.md) | AIRR（草稿，未批准）：imprint-face / 面轮廓拉伸；切片 0 spike 证明整平面 faceRef 可行（Loop/ParityRegion），但 iOS imprint 子面需 face split；批准前不写实现代码 |
| [superpowers/specs/2026-11-05-sketch-feature-capability-backlog.md](./superpowers/specs/2026-11-05-sketch-feature-capability-backlog.md) | 草图/特征能力补齐 backlog：按 140 个 scenario 的缺失频次排序的切片计划（chamfer UI、约束 ref 形态、cPlane、pattern/mirror/hole、face split、imports/sheet metal、草图实体）；每片 AIRR/ADR + 真栈验收 |
| [superpowers/specs/2026-11-05-chamfer-ui-airr.md](./superpowers/specs/2026-11-05-chamfer-ui-airr.md) | AIRR（批准，2026-11-05 已实施）：chamfer UI 创建链 Slice 1；复用 fillet 边拾取/owner/target 与现有 ChamferParams，不改 shared/后端；Hand Brake/iOS 真栈验收、undo/redo、回滚 |
| [superpowers/specs/2026-11-05-chamfer-modes-airr.md](./superpowers/specs/2026-11-05-chamfer-modes-airr.md) | AIRR（批准，2026-11-05 已实施）：倒角 Slice 1b 双距离/距离-角度模式（mode=2/3）+编辑回显；Sample Assignment 以 1.524 mm/45° 精确建出，体积 0.00% |
| [superpowers/specs/2026-11-05-scenario-edge-selector-airr.md](./superpowers/specs/2026-11-05-scenario-edge-selector-airr.md) | AIRR（批准，2026-11-05 已实施）：converter CAP_EDGE 语义选择器 + 私有后端 ScenarioReplay 持久边解析；合成 fillet/chamfer StandaloneDb 场景 2/2，SWEPT_EDGE/full-round 仍待补 |
| [superpowers/specs/2026-11-05-cplane-airr.md](./superpowers/specs/2026-11-05-cplane-airr.md) | AIRR（批准，2026-11-05 已实施，shared 1.29.0）：cPlane 基准面（Top/Front/Right + 偏移 + 反转法线）+ 草图落在自定义平面；CPlaneDialog（按 live 可编辑副本证据）、SketchDialog 平面列表、树标签与编辑回显；被引用时改参/删除诚实拒收；Intro to CAD 真栈 2 passed、体积 85157.341 mm³；B1b 视口渲染 / B2 改参传播待后续 |
| [superpowers/specs/2026-11-05-ui-polish-airr.md](./superpowers/specs/2026-11-05-ui-polish-airr.md) | AIRR（批准，2026-11-05 已实施）：工具栏下拉 180px/父行+快捷键、ViewCube 二轮逐像素复核 + 三轮交互对齐（面边 58px/屏幕直立标签/三色轴/隐藏面轮廓带/角点蓝点/罗盘弧 hover/180ms 相机动画/无拖拽/trigger tooltip）、左侧「图形首选项」对话框、右侧「外观」面板（零件/草图 tab + 逐 body 颜色覆盖）；live 证据 `ui-polish-20261105` + `viewcube-exact-20261105` + `viewcube-interactions-20261105`；官方 iTwin ViewCube **默认**（`?viewcube=onshape` 回退自研；相机/渲染菜单抽成唯一 `ViewCubeCameraMenu` 挂官方 cube；lazy、事件桥、宿主命中/箭头/1.5×/target 修复）；图形首选项默认 AO 20%/线宽 2px；web 1382/1382 |
| [superpowers/specs/2026-11-04-onshape-batch1-gap-matrix.md](./superpowers/specs/2026-11-04-onshape-batch1-gap-matrix.md) | Batch 1 能力/数据缺口矩阵（construction/DIAMETER/endBound 等契约缺口；ADR-0004/0005 批次） |
| [superpowers/plans/2026-11-04-onshape-parity-batch1-gate.md](./superpowers/plans/2026-11-04-onshape-parity-batch1-gate.md) | 执行计划：Tutorial 2 X-14 关闭 + 面域拾取安全化 + Batch 1 缺口登记（已完成并留证） |
| [ROADMAP.md](./ROADMAP.md) | 路线图索引（指向全程序路线图） |
| [SKETCH-CONSTRAINT-WORKFLOW.md](./SKETCH-CONSTRAINT-WORKFLOW.md) | 草图约束工作流程（设计稿） |
| [CONSTRAINT-SOLVER-COMPARISON.md](./CONSTRAINT-SOLVER-COMPARISON.md) | 约束求解器对比分析（历史选型输入） |
| [baseline-reliability-design.md](./baseline-reliability-design.md) | Baseline 可靠性设计 |
| [IMODEL_AUTO_RECOVERY_DESIGN.md](./IMODEL_AUTO_RECOVERY_DESIGN.md) | iModel 初始化失败自动修复设计 |
| [UI-ONSHAPE-PARITY-2026-11-02.md](./UI-ONSHAPE-PARITY-2026-11-02.md) | Onshape UI 全量对齐（40px 顶栏/36px 工具栏/40px 面板轨/200px 树/30px 页签、Onshape SVG 图标、ViewCube/显示设置、无可见状态栏；草图**单对话框**（创建+编辑，无实体/约束清单面板）+ 视口平面拾取 + 单尺寸钮与标注位置弹框 + 拉伸/旋转视口面域 chip + 特征树双击二次编辑（updateParams）；2026-11-05：编辑偏移/自定义平面草图显示「自定义平面」且 ✓ 可完成；extrude 终止条件 给定深度/完全贯穿；含 Tutorial2 四短竖棱圆角、特征实时预览与「Tutorial 2 - Build a Part」新建项目展示；2026-11-03 渲染回退 iTwin 默认材质/灯光、无模式统一选择；2026-11-05 官方 iTwin ViewCube 设为默认 + 相机/渲染菜单复用，`?viewcube=onshape` 回退自研；2026-11-06 全 UI live 复核：文档中心/新建/登录/文档详情、220px 扁平皮肤特征对话框、Hole/Plane/Sketch/Pattern/Mirror/Boolean 字段顺序，新增公开产品介绍页 `/showcase` 与 4K/1080p 素材） |
| [BREP-RENDERING-2026-11-03.md](./BREP-RENDERING-2026-11-03.md) | 完整 BRep 元素渲染与拾取（不修改 iTwin 渲染器/shader）：iTwin 默认灯光/材质 + 白底 + 全部拓扑边叠加层（WorldDecoration + 深度偏移）、BRep 顶点显示、统一 Onshape 无模式点/边/面拾取（面 `getClosestPoint` 兜底、背棱深度剔除、undo/redo 恢复选择）；含原生面定位卡死与 3-scope 相机竞态已知边界 |

### 技术参考
| 文档 | 说明 |
|------|------|
| [示例 iModel 复刻画廊](../luban-cad/apps/web/demo-artifacts/examples/index.html) | 已完成 Onshape 示例的真实 iModel 分步演示（2026-11-05：Tutorial 2、Tutorial 2 iOS、Basic Drawing、Postman、WARNING LABEL + 3 个同几何文档、Mate Connectors、Intro to CAD（cPlane UI）、Hand Brake、Sample Assignment；2026-11-06 新增 `Exercise: Element Organization` 文档级 iModel，O-Ring + Bushing 两个 Part Studio 页签；共 12 个 legacy iModel + 1 个多 PS iModel，含 runner/manifest；Sample Assignment 当前 known-red） |
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

*最后更新: 2026-11-05（UI polish 完成真栈复核，并二次逐像素重做 ViewCube：DPR4 live 分析确认 cube 面边 58px、标签屏幕直立、三色轴 #cd0000/#009400/#0000d0 锚 Front 面左下、trigger 44.226×28、Home 仅自由视角；工具栏下拉 180px/父行+快捷键、ViewCube 交互对齐（可见面/隐藏面轮廓带/角点/罗盘弧 hover、180ms 相机动画、无拖拽、trigger tooltip）、左侧「图形首选项」对话框（默认 AO 20%/FOV 45°/线宽 2px/光泽度 3%）、右侧「外观」面板 + 逐 body 颜色覆盖（会话内显示，未持久化）；web **1382/1382**、tsc/lint 绿；live 证据 `ui-evidence/ui-polish-20261105` 47–54、`ui-evidence/viewcube-exact-20261105`、`ui-evidence/viewcube-interactions-20261105`；官方 iTwin ViewCube **默认** + 相机/渲染菜单（`?viewcube=onshape` 回退自研；真栈 `itwin-viewcube.spec.ts`、ui-parity、tutorial2 均绿；证据 `ui-evidence/itwin-viewcube-20261105`）。此前：cPlane Slice B1（shared 1.29.0，Intro to CAD 真栈 85157.341 mm³）；chamfer UI Slice 1/1b；converter CAP_EDGE + ScenarioReplay 2/2；12 个示例 iModel 重开通过；X-01/X-02/X-03/X-14 已关闭；ADR-0004/0005 Phase 1、ADR-0006 切片 A/A2/A3/B1 已落地）*
