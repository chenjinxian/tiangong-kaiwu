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
| [architecture/PRODUCT-GOALS-AND-ENGINEERING-PRINCIPLES.md](./architecture/PRODUCT-GOALS-AND-ENGINEERING-PRINCIPLES.md) | **产品目标与工程原则（2026-11-09 用户裁决）**：全量 Onshape 草图/约束/特征 → AI+CAD；大规模示例验证真形内核/绳墨；每个功能点检查架构合理性与闭环；持续审计 imodel-native BRepCore |
| [Architecture.md](./Architecture.md) | 系统架构详细设计 |
| [ONSHAPE-LIVE-REPLICATION.md](./ONSHAPE-LIVE-REPLICATION.md) | Onshape 示例实时复刻通道的**规则与经验**：corpus 数据边界、可编辑副本/DXF、sketchMatrix 跨列还原、精确端点+CCW、region 调试、多体 targetBodyIds、边/面选择器、shell 符号、限流和 approx 边界（逐例进度只在私有仓） |
| [architecture/INTERFACE-FREEZE-MATRIX.md](./architecture/INTERFACE-FREEZE-MATRIX.md) | 接口冻结矩阵（公开契约层）：P0/P1 接口、owner、版本、变更流程、验收证据；后端/原生逐文件证据在私有仓 |
| [architecture/AIRR-TEMPLATE.md](./architecture/AIRR-TEMPLATE.md) | Architecture Impact & Reuse Review 模板（功能开工门禁） |
| [architecture/CANONICAL-SOURCES.md](./architecture/CANONICAL-SOURCES.md) | 规范来源表：能力 → 官方/参考来源 → 禁止项 |
| [architecture/VIEWER-IPC-LIFECYCLE.md](./architecture/VIEWER-IPC-LIFECYCLE.md) | Web 查看器 IPC 生命周期（2026-11-10）：display-test-app 页面级 host 对照；路由不 shutdown IpcApp/IModelApp；后端 MS 重启用 `queryConcurrency` 8s 存活探针有界失败 + 刷新恢复；登出整页导航换 WS 身份；刷新/关闭/重入边界与回归（catalog 5/5、ipc-logout 1/1、ms-restart-recovery 1/1） |
| [architecture/EXCEPTIONS.md](./architecture/EXCEPTIONS.md) | 规则例外与债务登记（owner/失效日期/退出计划） |
| [adr/0001-itwin-imodel-data-model.md](./adr/0001-itwin-imodel-data-model.md) | ADR：iTwin/iModel 数据模型与“文档—页签”信息架构（**已接受**；P0 前置完成；P1 spike **Go（qualified）**；**P2 实现并发布（2026-11-01，Release `backend-20261101-p28c`）**：RPC 1.18、B flag rollout/rollback、证据与残项处置；P3 旧数据迁移退役、P4 暂缓） |
| [adr/0002-retire-legacy-edit-channel-and-unify-selection.md](./adr/0002-retire-legacy-edit-channel-and-unify-selection.md) | ADR：退役旧编辑 RPC 通道（shared 1.1.0）、草图工具族唯一、`store.canvas.selection` 单一选择权威（X-01/X-02/X-03，2026-11-04） |
| [adr/0003-onshape-parity-scenario-contract.md](./adr/0003-onshape-parity-scenario-contract.md) | ADR（已接受 2026-11-04）：Onshape parity 场景/证据契约 v1（测试专用 schema、逐 body 期望、blocked-evidence/capability；不新增运行时 RPC） |
| [adr/0004-sketch-contract-onshape-parity.md](./adr/0004-sketch-contract-onshape-parity.md) | ADR（已接受 2026-11-04，分切片）：草图契约扩展（construction、DIAMETER/ANGLE/CONCENTRIC/PROJECTED/MIRROR/PIERCE、driven 尺寸、point-circle coincident；shared bump + 双端）；第一切片 point+circle 已落地 |
| [adr/0005-extrude-revolve-contract-onshape-parity.md](./adr/0005-extrude-revolve-contract-onshape-parity.md) | ADR（已接受 2026-11-04，Phase 1 已落地）：extrude endBound blind/throughAll、REMOVE/INTERSECT、方向/起始偏移；revolve remove；upTo*/draft/secondDirection/revolve new 待后续；face-extrude 转 ADR-0006 |
| [adr/0006-onshape-new-feature-types.md](./adr/0006-onshape-new-feature-types.md) | ADR（已接受，分切片落地）：hole A/A2/A3/A4/A5/A6、cPlane B1/B2a、booleanBodies、faceExtrude、shell、chamfer；**切片 D2（2026-11-11，shared 1.66/1.67）**：单线 imprint 面切分（material/void + keepPoint）+ 源证据 no-op remove（`noOpEvidence`）+ 回放 resolver；Intro Part 5 strict 绿 **204,838.300 vs 204,838.300**，Part 6 strict 绿 **188,451.236 vs 188,451.236**（8 步 status=0、冷重开一致）；draft/rib/变量待后续 |
| [adr/0007-feature-pattern.md](./adr/0007-feature-pattern.md) | ADR（已接受 2026-11-07，切片 1/2/3）：FEATURE pattern——源特征前后缓存差集按任意轴线段 linear/circular 阵列；shared 1.34、后端+真栈已落地；切片 2/3（test-only）FACE/FEATURE circular→featurePattern converter/translator + 多体 targetBodyId 锚定；FACE 合成真栈 14303.541 mm³；真实 FEATURE PS 2 body 数正确、体积 +1.39%/+4.50%——FEATURE mirror 的 body 级近似不成立、pattern 实例相交不足；**2026-11-11 FACE linear `directionOne`=revolve SWEPT_FACE 修正**（面法向=旋转轴，符号按源 revolve 轮廓跨度），Handle Parts pattern 去材闭合；UI 待接 |
| [adr/0008-shell-conversion-face-selector.md](./adr/0008-shell-conversion-face-selector.md) | ADR（已接受 2026-11-07，切片 1）：shell 场景转换 + revolve 端面选择器（前序圆角容差）；合成真栈绿；Gaiter 被 Fillet 内核阻塞 |
| [adr/0009-sketch-external-references.md](./adr/0009-sketch-external-references.md) | ADR（已接受，切片 1a 已实现 2026-11-07）：草图外部引用——草图→草图投影（Use/Project，shared 1.35、读时重投影、DOF 排除、驱动边联动）；实体边投影/PIERCE/UI 待后续切片 |
| [adr/0010-transform.md](./adr/0010-transform.md) | ADR（已接受 2026-11-07，切片 1/2/3 已实现）：Transform——平移/任意世界轴旋转/副本（shared 1.36）+ 均匀缩放/固定点（shared 1.38）+ 非均匀 scaleAxes（shared 1.45）；真栈旋转 -5,15、副本 2000 mm³、scale 8000/125 mm³、axes 4000@(20,10,2.5)→@固定点→32000 mm³；剪切/UI/converter 待后续 |
| [adr/0011-mirror-arbitrary-plane.md](./adr/0011-mirror-arbitrary-plane.md) | ADR（已接受 2026-11-07，切片 1/2/3）：Mirror 任意世界平面——`planeLine`（shared 1.37、反射 I−2nnᵀ、真栈对角/偏置 16 mm³）；faceRef 面镜像（shared 1.41、面平面解析、真栈 8000 mm³ 质心 (10,10,10)）；`featureMirror` 特征级镜像（shared 1.47、源差集反射、真栈孔镜像 15434.514 mm³；多源/featurePattern 源与 UI 待后续） |
| [adr/0012-split-part-world-plane.md](./adr/0012-split-part-world-plane.md) | ADR（已接受 2026-11-07，切片 1）：SplitPart 单侧世界平面切割——XY/YZ/XZ + offsetMm + keepSide（shared 1.39、大盒半空间 Intersect、后端 6/6）；双侧/面驱动/UI 待切片 2 |
| [adr/0013-cplane-line-angle.md](./adr/0013-cplane-line-angle.md) | ADR（已接受 2026-11-07，切片 1/2/3）：cPlane LINE_ANGLE——`line`+`angleDeg`（shared 1.40、参考法线投影后绕线 Rodrigues）；LINE_POINT——`line`+`point`（shared 1.43）；THREE_POINT——`threePoints`（shared 1.44、三点平面、防退化）；真栈三种平面各 4000 mm³ push+重开；UI/converter 待后续 |
| [adr/0014-move-face.md](./adr/0014-move-face.md) | ADR（已接受 2026-11-07，切片 1/2）：moveFace 面偏移——持久面引用 + 单一距离（shared 1.42、后端 6/6、真栈 6000/3200 mm³）+ 逐面距离 `distancesMm`（shared 1.46、后端 9/9、真栈 6600/3040 mm³）；deleteFace（内核 0 回包）/replaceFace（IPC 未暴露）仍 blocked-kernel；UI/converter 待后续 |
| [adr/0015-multi-target-feature-scope.md](./adr/0015-multi-target-feature-scope.md) | ADR（2026-11-07 提议；2026-11-10 **B6.3 首切片实现**）：多 body 作用域——shared 1.65 `targetBodyIds` + 逐边 `bodyKey`、后端逐体 BlendEdges/缓存/写回/冷重建、单特征行 + all-or-nothing；跨体 chamfer/shell/moveFace、多目标 delete/update/suppress、pattern/mirror 与 UI 仍为后续切片；**Handle Parts 2026-11-11 strict 绿**（三体 ≤0.043%、整链 +0.009%、冷重开；旧 +4.2% 为 pattern 方向映射）；**B6.2 2026-11-11**：throughAll REMOVE extrude/hole 多目标（shared 1.68），Links 几何 10,039.240/11,704.087 vs 10,039.241/11,704.085（约束仍 dropped） |
| [adr/0016-extrude-start-face-draft.md](./adr/0016-extrude-start-face-draft.md) | ADR（已接受，2026-11-10 用户批准实现；同日 A2/A3/A4 实测后修订 A2 边门与最终差归因）：CAP_FACE 起始面 + startOffset + 拔模的精确 faceExtrude 路径——扩展 `FaceExtrudeParams.startOffsetMm/draftAngleDeg/draftPullDirection`、以起始面边界为轮廓；A1（面轮廓/参数接线）/A2（逐边解析壳体 tool 12/12 line、最终 Unite **20/20 line**、pre-fillet **657,764.787185**）/A3（`capFaceProfile` → faceExtrude + 起始面唯一匹配）/A4（Fillet 1 rb=3 oracle **16/16 = Onshape 实际选择**（5 faces + 4 edges；底面 4 条 z=0 loop 尖边未选）+ 最终 **636,731.650 vs 636,731.499（+0.000024%）**、全 status=0、1 body、push+冷重开、approximateSteps=0）分离；S10 37/29、S9 中性面 z=40/10°、S11 startOffset=0；旧 −0.374% 归因审计 20 边回退多选底面 loop，不归因 Extrude 2；S1/S5 已解析；**A1/A2/A3/A4 已随 `backend-20261110`（shared 1.64.0）发布；2026-11-10 发布闭口：私有 `replicable-now` 18（Bumper 为第 18 例，条目 `strictPath=rb3-oracle-16/16`、`requiresBackend=backend-20261110`、`genericResolver=12-edge blocked`）、公开 strict spec 19；私有 converter/oracle/scenario 已固化，发布产物 Bumper strict 2 passed；generic resolver 12 边仍为独立 blocked-kernel** |
| [adr/0017-editor-flow-parity-defaults.md](./adr/0017-editor-flow-parity-defaults.md) | ADR（Proposed，2026-11-12）：编辑器全流程对齐——shared 单一渲染默认值、创建时写入 DisplayStyle/视图/类别外观、首帧背景前置、插入新页签、模型面草图平面、静默 autosave + iModel 文档级版本；缺失特征族按 G1/G2/G3 分波次、内核依赖先审计 |
| [superpowers/specs/2026-11-04-debt-cleanup-x01-x03-airr.md](./superpowers/specs/2026-11-04-debt-cleanup-x01-x03-airr.md) | AIRR：X-01/X-02/X-03 第一轮债务清理（复用矩阵/跨仓影响/测试/回滚） |
| [superpowers/specs/2026-11-12-editor-flow-parity-airr.md](./superpowers/specs/2026-11-12-editor-flow-parity-airr.md) | AIRR（2026-11-12）：Onshape 编辑器 7 条流程对齐（默认视图/材质、首帧背景、Part Studio 页签、草图创建/编辑、特征对话框、autosave/版本）；私有 live 证据包 editor-flow-parity-20261112；缺失特征族分波次 |
| [superpowers/specs/2026-11-12-onshape-mouse-interaction-airr.md](./superpowers/specs/2026-11-12-onshape-mouse-interaction-airr.md) | AIRR（已批准并实现，2026-11-12）：鼠标交互对齐——右键拖拽旋转 / Ctrl+右键平移（`OnshapeIdleTool` 复用 ViewManip）、右键拖拽不弹菜单、草图空白框选（左→右窗口 / 右→左交叉、点实体、Ctrl 叠加）、草图空白右键菜单；真栈 `e2e/mouse-interaction.spec.ts` 6 passed 相关；无契约/后端改动 |
| [superpowers/specs/2026-11-12-sketch-linear-pattern-airr.md](./superpowers/specs/2026-11-12-sketch-linear-pattern-airr.md) | AIRR（已实现首切片，2026-11-12）：草图线性/环形阵列 + 变换 canvas gizmo——方向/间距/计数或中心/计数手柄、移动/旋转/均匀缩放、蓝色预览、一次 updateSketch（独立副本/原实体变换；内部尺寸同步缩放）、草图 ✓ 先提交；真栈 `e2e/sketch-pattern.spec.ts` 6 用例（线性 3 圆 0/0.02/0.04 m、undo、成品；环形 count 4 绕原点 90°；变换 +20 mm → x=0.02；缩放 2× → R20 mm）；数值输入/自定义基点待后续 |
| [superpowers/specs/2026-11-13-part-rename-airr.md](./superpowers/specs/2026-11-13-part-rename-airr.md) | AIRR（已实现，2026-11-13）：特征/零件树内联重命名——v1.70 `renameFeature`/`renameBody` RPC（jsonProperties 元数据；`getFeatureTree[].name`/`getBodies[].name` 读面），写租约+EditTxn+可撤销；真栈 `e2e/part-rename.spec.ts` 3 passed（零件改名→undo→push 冷重开；特征改名持久）；无 schema 变更 |
| [superpowers/specs/2026-11-12-edit-ops-audit.md](./superpowers/specs/2026-11-12-edit-ops-audit.md) | 审计（2026-11-12，随实现更新）：草图/特征/零件逐对象增删改路径与已知缺口；含约束/Fillet/Extend/DXF/阵列/变换、特征重排/回滚 blocked 口径、零件重命名 v1.70 落地 |
| [superpowers/specs/2026-11-13-sketch-trim-spline-airr.md](./superpowers/specs/2026-11-13-sketch-trim-spline-airr.md) | AIRR（已实现，2026-11-13）：草图 Trim 支持三次贝塞尔样条——128 段折线交点检测 + de Casteljau 精确分裂；真栈 `sketch-trim.spec.ts` 样条用例 2 passed；periodic/非四次/投影诚实拒收；无契约变更 |
| [superpowers/specs/2026-11-13-sketch-use-projection-airr.md](./superpowers/specs/2026-11-13-sketch-use-projection-airr.md) | AIRR（已实现，2026-11-13）：草图「使用」草图→草图投影 UI——灰色候选覆盖层、点击生成 projected 根实体、后端读时重投影联动、根删除级联派生点；真栈 `sketch-use.spec.ts` 2 passed（R10→R20 联动、undo、Esc）；仅同 PS 更早草图（≤8 张），实体边/面未接；无契约变更 |
| [superpowers/specs/2026-11-13-part-transparency-airr.md](./superpowers/specs/2026-11-13-part-transparency-airr.md) | AIRR（已实现简化切片，2026-11-13）：零件「使之透明…」——单 body 会话透明度滑块 0–100/恢复不透明，复用 FeatureOverrideProvider（颜色+透明度合并）；完整 Onshape 工具面板（目标选择/零部件控制/展开/隔离）未做；无契约变更 |
| [superpowers/specs/2026-11-13-part-delete-airr.md](./superpowers/specs/2026-11-13-part-delete-airr.md) | AIRR（已实现首切片，2026-11-13）：零件删除——NEW-body 驱动的零件行「删除…」→ HITL → deleteFeature(源, targetBodyId)（复用 body 软消费/undo）；真栈 `part-delete.spec.ts` 2 passed（删除→零件/特征移除→undo 恢复）；任意 body 的 Delete Part 历史特征未做 |
| [superpowers/specs/2026-11-13-part-isolate-airr.md](./superpowers/specs/2026-11-13-part-isolate-airr.md) | AIRR（简化切片，2026-11-13）：零件「隔离…」——立即隐藏其它零件（会话 hiddenIds）+ 顶部横幅退出并恢复隔离前隐藏集；真栈 `part-isolate.spec.ts` 2 passed；Onshape 工具面板的目标选择/零部件控制/展开未做 |
| [superpowers/specs/2026-11-13-editor-state-refresh-airr.md](./superpowers/specs/2026-11-13-editor-state-refresh-airr.md) | AIRR（已实现，2026-11-13）：编辑器状态/渲染刷新——选草图面即进入编辑（外部平面变化自动 insertSketch）、草图编辑隐藏下游体 + 清空 BRep 拓扑叠加、consumed body 隐藏源改用未过滤 getBodies（删除特征后视口同步）、B 模式 scope 过渡 fail-closed（第二 PS 不泄漏）；真栈 `editor-state-refresh.spec.ts` 4 passed、web 1784/1784；无契约变更 |
| [superpowers/specs/2026-11-13-sketch-camera-fit-airr.md](./superpowers/specs/2026-11-13-sketch-camera-fit-airr.md) | AIRR（已实现，2026-11-13）：草图相机零副作用 + 「缩放到合适大小」Onshape 对齐——进入/退出草图不转正/不自动取景/不回放（删除 useSketchCamera），显式「正视草图平面」保留；统一可见内容取景（模型 ∪ 活动草图；空场景基准面兜底；永不 projectExtents、不改旋转），ViewCube/页签条/右键/草图对话框共用；真栈 `sketch-camera-fit.spec.ts` 3 passed、viewer 154；私有 live 证据 sketch-camera-fit-20261113 |
| [superpowers/specs/2026-11-13-sketch-concentric-airr.md](./superpowers/specs/2026-11-13-sketch-concentric-airr.md) | AIRR（已实现，2026-11-13）：草图「同心」约束接通——`Sketch.Constraint.Concentric` 两圆拾取（槽位框架复用），shared/SlvsSolver 已支持；能力 gated→full；真栈 `sketch-concentric.spec.ts` 2 passed（圆心重合落库）；arc/混合待解析器 |
| [superpowers/specs/2026-11-13-toolbar-live-parity-airr.md](./superpowers/specs/2026-11-13-toolbar-live-parity-airr.md) | AIRR（已实现 UI/交互层，2026-11-13）：工具栏逐按钮 live 全量对拍——删除自创「曲面/曲线」组，平面▾ 25 项/钣金▾ 11 项逐字对齐；草图主钮/飞菜单文案（三点圆弧/草图圆角/内接多边形/使用）、15 行约束 flyout、全部快捷键（含捕获阶段与模式映射）、Esc 关菜单不再退出草图；真栈 `toolbar-live-parity.spec.ts` 3 passed、web 1816；gated 功能族仍按能力引导诚实登记 |
| [superpowers/specs/2026-11-04-onshape-example-replication-airr.md](./superpowers/specs/2026-11-04-onshape-example-replication-airr.md) | AIRR（已批准）：Onshape 示例复刻与 Part Studio 交互/UI 对齐；Batch 1 六示例、复用矩阵、跨仓/回滚；2026-11-06 补 13 个 iModel/冷 briefcase cache 重开回归（hub currentOrPrecedingCheckpoint + `$orderBy` 修复）/union 研究结论 |
| [superpowers/specs/2026-11-06-example-coverage-master-airr.md](./superpowers/specs/2026-11-06-example-coverage-master-airr.md) | AIRR（已批准，2026-11-06）：Onshape 示例全量覆盖总纲；一文档一 iModel/多 PS scope、静态 registry/运行态 state、selector/translator、四维状态、私有 corpus 索引与回滚门禁 |
| [superpowers/specs/2026-11-06-shell-ui-airr.md](./superpowers/specs/2026-11-06-shell-ui-airr.md) | AIRR（已实施，2026-11-06）：参数化抽壳 UI；复用 ShellParams/既有求值/选择权威，移除面+壁厚+方向+影子预览；官方帮助页证据；真栈 1084.000 mm³、编辑/undo/重开 |
| [superpowers/specs/2026-11-09-sketch-external-refs-async-airr.md](./superpowers/specs/2026-11-09-sketch-external-refs-async-airr.md) | AIRR（提议/未批准，2026-11-09）：草图外部实体引用切片 1b——同步草图读 vs 异步 `SolidModelingCommand`；选可失效同步快照缓存（sourceDigest/bodyRevision/changeEpoch、直接编辑失效、失败封闭、旧库回退、UI 证据缺口、闭合环测试矩阵）；未批准前不写产品代码 |
| [superpowers/specs/2026-11-10-extrude-startface-draft-airr.md](./superpowers/specs/2026-11-10-extrude-startface-draft-airr.md) | AIRR（已批准并实现，2026-11-10；同日 A2/A3/A4 实测后修订 A2 边门与最终差归因）：CAP_FACE 起始面 + startOffset + 拔模精确 faceExtrude——现状根因（草图轮廓/推断 40/整环偏置 Loft/curvePrimitive）、四选项与复用矩阵、`FaceExtrudeParams` 新字段/校验/失败封闭、**A1 baseline vs A2 精确门分离**（A2 = tool/final 20/20 line + pre-fillet 657,764.787185 + Fillet 1 16/16 实际选择；底面 4 条尖边未选）、S10 37/29、S9 中性面 z=40/10°、S11 startOffset=0、旧 −0.374% 归因审计 20 边回退多选底面 loop、body 归属/旧载荷、跨仓/回滚/测试矩阵；**A1/A2/A3/A4 已实现（shared 1.64.0；真栈 636,731.650 +0.000024%）** |
| [superpowers/specs/2026-11-10-examples-catalog-airr.md](./superpowers/specs/2026-11-10-examples-catalog-airr.md) | AIRR（已批准并实现，2026-11-10）：公开 `/examples` 全部示例目录——19 个 `replicable-now` 的脱敏 catalog、owner/搜索、按项目名+iModel 名解析打开入口（不写 UUID）、未定位/未登录回退；只读页面，无新 RPC/schema；真栈 19 卡 + Bumper 直达 canvas 绿（2026-11-10 追加 Part 4） |
| [superpowers/plans/2026-11-10-onshape-all-parts-master.md](./superpowers/plans/2026-11-10-onshape-all-parts-master.md) | **全量总计划（2026-11-10，执行中）**：526 文档 / 1685 API PS / 1470 已落盘 PS 全量分类与复刻；62 个任务分组（数据采集、imprint/selector、外部草图引用、converter、产品特征族、多体、内核、批次、非 native 轨道、验证发布）；每个 PS 必须 strict 或 blocked 证据，不伪造。**首批执行：features 227→305 PS、strict 18→19（Part 4 分量质心精确 262,193.024 mm³）** |
| [superpowers/plans/2026-11-09-ps-blocker-driven.md](./superpowers/plans/2026-11-09-ps-blocker-driven.md) | **历史优先级计划**（2026-11-09）：按真实 PS blocker 排名转绿——imprint 精确语义 → selector → CONCENTRIC/converter → 多体 → 外部草图引用 → 数据/长尾；并行 BRepCore 审计 |
| [superpowers/plans/2026-11-11-live-onshape-ui-replication.md](./superpowers/plans/2026-11-11-live-onshape-ui-replication.md) | **2026-11-11 策略切换**：停止以 API 全量采集为主线，改为公开文档创建副本 + UI 特征树/对话框/草图/体面属性采集，在 luban-cad 中广度优先建 Part；严格对拍降级为后续，approx/blocked 显式登记 |
| [superpowers/plans/2026-11-10-blocked-examples-capability.md](./superpowers/plans/2026-11-10-blocked-examples-capability.md) | 阻塞示例能力切片（2026-11-10）：切片 A/C 已完成（2026-11-11，Part 5/6 单线 imprintFace → face split + no-op，两例 strict 绿）；CONNECTING_ROD 仍需 FULL_ROUND fillet + 边/region 证据；三个 0 mm³ 空占位已删除，不伪造 iModel |
| [superpowers/plans/2026-11-09-ps-blocker-next.md](./superpowers/plans/2026-11-09-ps-blocker-next.md) | **下一阶段实施计划（2026-11-09，已执行）**：以 14 个严格绿为基线，bbox 位置证据 → regionRisk/同面积面集 → CENTERLINE/capFace 数据批次 → Bumper native probe → PROJECTED/多体 AIRR；阶段目标 ≥18。**2026-11-10 发布闭口口径**：目标 18 达成——私有 `replicable-now` **18**（Bumper 为第 18 例，带 `strictPath=rb3-oracle-16/16`、`requiresBackend=backend-20261110`、`genericResolver=12-edge blocked`；iOS First Part 已由 `EXAMPLE_RESET=1` 真栈 2 passed 验证 push+冷重开）；公开 strict spec **19**（含 A2 face-extrude、Bumper S10 严格轨与 iOS）。A1/A2 已随 `backend-20261110`（shared 1.64.0）发布，私有 converter/oracle/scenario 已固化；发布产物 Bumper strict 2 passed。Bumper 的 generic resolver 仍为 12 边 blocked-kernel，不得说成已修复。此前严格绿 16（Intro Part 3 + Alignment 精确化）；2026-11-09 审计的干净私有检出重索引为 **15**（当时私有索引生成器/converter/scenario 未提交，Part 3 strict 依赖私有 scenario）；Alignment 的 `Cut 2 more holes` 保留一条已审计人工面域覆盖，纯证据驱动计数 **15**（`Cut 2 holes` 面积证据精确） |
| [superpowers/plans/2026-11-06-example-coverage-continuous.md](./superpowers/plans/2026-11-06-example-coverage-continuous.md) | 历史连续执行台账（活文档）：P0.6 冷开持久化已关闭；T2 边选择器 / T3 抽壳 / T4 第二方向 / T5 mirror / cPlane / splitPart / transform / featurePattern 已完成；后续优先级以 2026-11-09 PS blocker 计划为准 |
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
| [示例目录 `/examples`](../luban-cad/apps/web/src/modules/examples/ExamplesPage.tsx) | **全部 19 个 `replicable-now` 示例的统一公开入口**（2026-11-10）：真实封面、owner/document/PS/目标体积、strict 状态、owner 过滤与搜索；登录且唯一解析到 iModel 时直达 Part Studio，未定位/无权限回退文档中心；真栈 19 卡 + Bumper 打开 canvas 绿（2026-11-10 追加 Intro Part 4） |
| [示例 iModel 复刻画廊](../luban-cad/apps/web/demo-artifacts/examples/index.html) | 历史本地画廊（未随 web 镜像部署）：已完成 Onshape 示例的真实 iModel 分步演示（2026-11-05：Tutorial 2、Tutorial 2 iOS、Basic Drawing、Postman、WARNING LABEL + 3 个同几何文档、Mate Connectors、Intro to CAD（cPlane UI）、Hand Brake、Sample Assignment；2026-11-06 新增 `Exercise: Element Organization` 文档级 iModel，O-Ring + Bushing 两个 Part Studio 页签；共 12 个 legacy iModel + 1 个多 PS iModel，含 runner/manifest；Sample Assignment 当前 known-red；2026-11-10 起统一入口以 `/examples` 为准） |
| [iTwin.js-Tools-Complete-Reference.md](./iTwin.js-Tools-Complete-Reference.md) | iTwin.js 工具完整参考 |
| [ITWINJS_CORE_MODIFICATIONS.md](./ITWINJS_CORE_MODIFICATIONS.md) | iTwin.js Core 修改记录 |
| [web-realstack-probes.md](./web-realstack-probes.md) | 前端真实栈探针标准动作（发布前必跑） |

### 部署与运维
| 文档 | 说明 |
|------|------|
| [Deployment-Guide.md](./Deployment-Guide.md) | 部署指南（外部体验者一键起栈：公开镜像 + 匿名产物下载，无需 GitHub 账号/docker login） |
| [PORTS.md](./PORTS.md) | 宿主端口登记（单一事实源） |
| [UPSTREAM_SYNC.md](./UPSTREAM_SYNC.md) | 上游同步指南 |
| [WEBHOOK_CONFIG.md](./WEBHOOK_CONFIG.md) | Webhook 密钥配置说明 |

### 发布与迁移
| 文档 | 说明 |
|------|------|
| [RELEASE-web-20261110b.md](./RELEASE-web-20261110b.md) | **最新 web-only 发布（2026-11-10b）**：公开 `/examples` 18 示例目录 + 页面级 IPC host + MS 重启 8s 存活探针 + 登出整页导航；web 镜像 digest `6ac74b99…`，后端/hub/WA/bff 与 `backend-20261110` 完全一致 |
| [RELEASE-backend-20261110.md](./RELEASE-backend-20261110.md) | 后端发布说明（**shared 1.64.0 / MS 精确 faceExtrude A1/A2/A3/A4 + S3**；Bumper strict 16/16、+0.000024%；公开 strict 19 / 私有索引 18；A1/A2 backend 随发布可复现） |
| [RELEASE-backend-20261109.md](./RELEASE-backend-20261109.md) | 历史发布说明（草图/特征能力检查点：4 个公开镜像 + MS **1.63.0** 产物；匿名冷拉/17 项全栈验收） |
| [RELEASE-backend-20261106.md](./RELEASE-backend-20261106.md) | 历史发布说明（外部本地部署：4 个公开镜像 + MS 1.32 产物；匿名冷拉/17 项全栈验收） |
| [RELEASE-backend-20261101-p28c.md](./RELEASE-backend-20261101-p28c.md) | 历史发布说明（B 数据模型 P2 / 命名迁移 / legacy schema 退役） |
| [RELEASE-CHECKLIST.md](./RELEASE-CHECKLIST.md) | 发布检查清单（产物 hash / native provenance / 限流姿态 / 镜像标签 / 公开可见性 / verify-stack） |
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
