# Part Studio 深挖：草图 / 约束 / 特征 / UI / 撤销 / 性能

> 结论先行：**架构方向正确，是当前最成熟的一条链；但“能跑”与“Onshape 主要功能对齐”之间仍有大量分支/实体/约束/UI/undo/性能工作。**
> 判定：Part Studio 主链 **B（部分满足，可扩展）**；特征广度（钣金/曲面/MBD 等）**C（缺子系统）**。

---

## 1. 数据模型与单一写管道

### 1.1 对象模型

```
Part Studio scope
 ├─ Sketch（params.entities/constraints/plane/externalRefs）
 ├─ Feature（params + orderKey + suppressed + status）
 ├─ FeatureDrive（prev→next 依赖边）
 ├─ BodySolid（body 身份 + 几何流 + authored/active）
 ├─ VariableTable（变量/表达式）
 └─ OpLogEntry（op 审计 + 线性 undo 状态）
```

- `params` + BIS 是事实源；几何是求值结果。
- 多 Part Studio 通过 scope 分区（B-model）：def/phys model、特征/草图/body 按 scope 隔离。
- 特征链按 `orderKey` 线性推进；body 由 FeatureDrive 驱动；多 body 通过显式 `targetBodyId`/`targetBodyIds` 寻址。
- 当前没有 Assembly/Drawing 元素类型接入；文档容器只有 Part Studio 页签。

### 1.2 FeatureOp 写管道

```
UI → LubanFeatureRpcInterface.applyFeatureOp
   → preflight（租约、scope、参数、表达式、上游）
   → EditTxn
   → evaluator（ACIS via native）
   → OpLog（可撤销 op）
   → txn.end("save")（EDE 传播）
   → 可选 push changeset
```

- 契约版本 **1.85.0**（`LubanFeatureRpcInterface.ts`），新增字段均为 additive；21 个 FeatureType。
- 失败语义：校验/求值失败应在 txn 前或 txn 内零变更；已有 `status=1`、旧几何保留、错误结构化等机制。
- 读写面：`getFeatureTree/getBodies/getSketch/getVariables/getMassProperties/listPartStudios`；没有装配/工程图/导入导出 RPC。
- **单一写管道**是最大可复用资产：新特征/新 UI 不需要再造建模 API；但也意味着所有新域必须接入同一契约/事务，不能另起炉灶。

### 1.3 特征图/输出模型的硬限制

后端审计发现（脱敏）：

1. **每 body 单源线性链**：每个 body 恰有一个驱动源特征；常规插入取目标 body 当前唯一源作为上游；特征链按 `orderKey` 升序求值，不是任意 DAG 调度器。
2. **单特征单输出**：一个特征行只写一个 body（缓存必须恰 1 条 BRep）；splitPart 单侧、mirror 固定保留原件、booleanBodies targets 恰 1；多目标只覆盖 fillet/throughAll-REMOVE extrude/hole 的有限场景。
3. **tail-only 删除**：只允许删除该 body 链尾特征；中间删除、任意插入、rollback bar 没有执行器支持。
4. **结构键禁改**：`newBody`、Loft 截面列表、Sweep 草图引用、booleanBodies targets/tools/operation 等结构键禁止 `updateParams`，只能删除重建。
5. **重排受限**：重排必须满足依赖拓扑；纯线性链几乎只剩恒等排列。

**含义**：这不是“UI 还没做”，而是执行器假设与 Onshape 的任意特征图/可编辑历史/多输出不一致。要支持 Onshape 的主要特征树行为，需要一次特征图执行器（多输出、任意插入/删除/回滚、依赖图调度）的架构改造；否则大量特征分支会在错误的模型上返工。

---

## 2. 草图与约束

### 2.1 已落地

| 项 | 现状 |
|---|---|
| 求解实体 | point、line、circle、arc、cubic spline（Bezier） |
| 约束 | 19 类：coincident、horizontal、vertical、parallel、perpendicular、equal、distance、radius、diameter、concentric、angle、length、midpoint、tangent、offset、fixed、mirror、symmetric、slotWidth |
| 尺寸 | 长度/距离/半径/直径/角度；驱动/从动；负值限制；表达式 |
| 表达式/变量 | 变量表、`#var`、量纲类型门、特征字段表达式、updateVariables |
| 外部引用 | sketch→sketch、模型边、PIERCE、平面面外环；INTERSECTED blocked-kernel、SILHOUETTED blocked-design |
| 求解状态 | ok/underconstrained/conflicting/failed + failedConstraintIds/conflictingRank/dof/redundant |
| UI | 20+ 草图工具、约束飞菜单、尺寸标注/编辑、诊断（Constraint manager/Profile inspector 部分） |
| 测试 | 大量 solver/flow/e2e（草图链、slot、dimension、expression、external refs） |

### 2.2 与 Onshape 的主要差距

1. **实体类型**：无 ellipse/elliptic arc/conic/text/N 点样条/periodic spline；这些会阻塞大量 Onshape 草图和特征。
2. **约束种类/组合**：无 normal/intersection/curvature/flow/collinear/ratio 等；椭圆/圆锥/文本的约束槽位未定义；部分 arc/spline 组合仍需扩展。
3. **求解性能/稳定性**：libslvs 过渡；大草图/大量约束/多解分支的收敛与 DOF 归因需持续审计；solver-neutral 接口已为绳墨平替准备。
4. **UI 规则**：Constraint manager/Profile inspector、选择优先级、推断/Shift 抑制、尺寸放置弹框、文本编辑等仍有 live 差异。
5. **外部引用**：非平行圆/弧投影语义、样条/椭圆边、面/边选择器、原生 undo 边界仍有缺口。
6. **平台差异**：移动端只能查看/编辑部分桌面创建的实体。

### 2.3 架构判定

**B（可扩展）**：新增实体/约束 = DTO + solver 方程 + normalizer + 面域 + UI + 测试；没有方向性冲突。
**关键风险**：如果继续按“工具入口”补而不按“实体×约束×求解组合”补，会出现大量“能点但不可靠”的假进度。

---

## 3. 特征系统

### 3.1 已有 21 个 FeatureType

`extrude、booleanAdd、booleanSubtract、fillet、chamfer、shell、revolve、loft、sweep、mirror、pattern、featurePattern、featureMirror、booleanBodies、hole、cPlane、faceExtrude、transform、splitPart、moveFace、draft`

- 每个 FeatureType 有 registry schema/formFields/evaluator（部分同步、部分 async）。
- 核心内核：ACIS Boolean/Sweep/Loft/Blend/Chamfer/Hollow/OffsetFaces/SpinFaces/Imprint/TaperFaces 等。
- 多 body：NEW-body、targetBodyId(s)、逐 body 缓存/求值/写回；Handle Parts 等多体示例已有 strict 证据。
- 预览：fillet/hole/shell/pattern/moveFace/split/transform/draft 等有影子求值预览；extrude/revolve 等有 UI 预览。
- 测试：FeatureFlow/ScenarioReplay/CorpusReplay/真栈 e2e，覆盖体积/质心/冷重开。

### 3.2 全部 partial 的原因

`docs/parity/feature-depth-matrix.md` 已逐项列出主要缺口：

| FeatureType | 主要缺口（摘要） |
|---|---|
| extrude | 全部端条件组合、upToPart、第二方向拔模/偏移、薄壁双厚度、多区域 NEW 全组合 |
| revolve | thin/surface、intersect 全形态、非世界轴 UI、区域完整 |
| sweep | 曲线路径/guides/twist/scale/lock、多 profile、曲面结果 |
| loft | guides、端条件、thin/surface、编辑/重算、全区域 |
| fillet | full-round、变半径、不对称、face blend、modifyFillet、溢流、12 边内核边界 |
| chamfer | mode 0/4、面/边混合、逐边数组 UI、partner coedge 边界 |
| hole | thread/钻表、upToSurface/upToVertex 全形态、start plane、mateConnector 轴、标准孔径 |
| shell | closed hollow、逐面厚度 UI、0 穿孔边界 |
| mirror/pattern/featureMirror/featurePattern | skip、curvePattern、任意轴、count 表达式、源增删编辑、源链 status |
| booleanBodies | 多 target 全过程、结构可编辑、offset/reFillet、预览/失败回滚 |
| splitPart | 双侧、面驱动、keep tools、trim boundary、任意平面 |
| moveFace | 旋转/替换面、reapply fillet、逐面 UI 全量、deleteFace 边界 |
| draft | 多种拔模模式、跨 body、中性面策略 |
| cPlane | 任意面/边参考、非世界帧 UI 编辑、表达式、方向约束 |
| faceExtrude | UI 入口、面集/offset/draft 全形态 |
| transform | 7 模式、任意轴/基点、组件编辑、剪切 |

**结论**：21 个类型是“可扩展的骨架”，不是“已对齐的 21 个完整工具”。需要按分支而不是按类型验收。

### 3.3 缺失特征族

- 钣金/框架（Sheet Metal/Frame）、曲面族（Boundary/Fill/Ruled/Constrained/Mutual Trim/Offset Surface 等）、曲线族（Projected/3D Fit/Bridging/Composite/Trim/Isocurve/Offset/Isoparametric/Edit/Routing）、MBD/PMI、螺纹、Wrap/Emboss、Decal、Derived、Query Variable、Composite Part、Tag、Helix、Add Custom Features、Sheet Metal、Thicken/Enclose（gated/无 FeatureType）等。
- 其中一部分内核已存在但未接线/未产品化；一部分受许可/内核边界；一部分是独立子系统（钣金、框架、MBD）。
- **不能把“gated 入口”当成“已规划的能力”**：需要 ADR、内核探针、后端 evaluator、UI、七维证据。

### 3.4 撤销/重建/缓存

- 原生 `BriefcaseTxns` 提供事务级 undo/redo；OpLog 提供部分 op 的线性撤销（`updateParams`/`updateVariables`）。
- 插入/删除/重排/抑制依赖原生事务，但 20s autosave push 后原生 undo 栈清空。
- FeatureOutputCache 是进程内按 `dbKey` 的缓存；冷缺失走 `rebuildAll`；求值有 per-dbKey 队列。
- 删除仅链尾、重排受线性依赖限制；`Final`/rollback/pause rebuild/feature history 部分 gated。

**判定**：B。可扩展，但需要一次“撤销/重建/缓存/自动保存”专项设计，否则用户体验与 Onshape 差距会被误认为几何问题。

---

## 4. UI/交互

### 4.1 已有

- Onshape 式五区壳、ribbon/飞菜单、特征树/零件段/组、右键菜单、快捷键、命令面板。
- 对话框：统一外壳、字段顺序/默认值/禁用态/预览滑杆/确认取消/错误态（大量 live 审计波次）。
- 选择：`OnshapeSelectTool` 单一权威、点/边/面子实体、框选语义、透明/隐藏、视图立方体。
- 草图：工具连续绘制、约束 glyph、尺寸标注/编辑、拖动/删除、面域填充、相机行为。
- 列表：特征过滤 `:type/:errors/:warnings/...`、零件段逐 body 体积、变量表。

### 4.2 差距

- gated/占位项：Create Selection/Select Other/选择过滤、材料/外观、曲面/曲线、钣金/框架、Render/Drawing、部分工具栏变体。
- 没有 Assembly/Drawing/Render Studio 工作区；没有 PDM/发布/评论/任务。
- 部分对话框字段/默认值仍非 live；图标/像素级仍有差异。
- 移动端 UI 基本缺失。
- **特征 UI 扩展成本**：`FeatureDialog.tsx` 约 6,761 行；新增特征/字段需跨对话框、ribbon、树、canvas、能力表、i18n 等多处注册（约 9 个点）；后端 `getFeatureFormModel` 未被前端消费，存在 schema/表单漂移。建议下一波前做表单模型驱动。
- **选择身份/拾取**：`CanvasSelection` 只有 `ownerBodyKey + topologyId`，没有 occurrence path；面拾取 hover 逐面 RPC，草图用 DOM 命中。这会限制装配/多文档/分屏/工程图和大模型；需要在装配/多文档 ADR 前补身份模型。
- **文档/接线漂移**：`PushChangesetDialog` 未挂载（死组件）；`useEditorKeyboard` 只在测试引用，Ctrl+S 实际未绑定；ribbon 注释计数与实际不一致。这些不是架构阻塞，但会误导 UI 能力判断。

**判定**：Part Studio UI 为 **B**；跨工作区为 **C/D**。

---

## 5. 性能与并发

- 单 MS 进程；FeatureService 按 dbKey/scope 缓存；求值锁串行化同 dbKey 的 async 求值。
- **同步 native 内核在主线程**：fillet/chamfer/pattern 等同步 ACIS op 会阻塞事件循环；libslvs 同步且不可 worker。
- 写租约一个 iModel 一时刻一个活跃会话；多用户只能串行。MS 还只缓存一个共享 briefcase，第二个同角色打开者会 close 前一会话的 `BriefcaseDb`（断线），不是稳定只读。
- 读路径成本：`getSketch` 每次全量求解，`getMassProperties` 每次面片化，`getBodies` N+1，写后投影快照全失效；OpLog 全表扫描且不裁剪；缓存无淘汰。
- 冷重建/大特征链/大草图/多 body 有性能测试，但不是 Onshape 规模；冷开还会从 baseline 重放全部 changeset（无 checkpoint 生成器），20s autosave 会放大大历史。
- 预览 150ms 防抖 + 15s RPC 超时；失败可见；但大模型/复杂 fillet/loft 可能慢。
- Tile 云缓存降低重复 tile 生成；编辑后几何 guid 更新使缓存键切换。
- **安全/限流**：Web RPC 走 `/ipc` WS，只做 WS 升级 JWT 校验，不经过 HTTP 的 100/15min 限流/CSRF/rpcGuard；HTTP RPC 平行暴露面另有限流。审计还发现后端到 hub 服务账号 + X-API-Key 直通，RPC/IPC 缺逐 iModel ACL；WS token 缓存后不再校验；hub 的 groups/shares 只存不判，前端权限门不是边界。IPC 对所有连接广播、共享 briefcase/文件、直改绕过写租约/OpLog；第二用户（含只读）当前会互踢/串响应。
- **契约/发布**：源码 shared 1.85，最新发布产物 shared 1.64；interface-freeze 过期、opDsl 缺 draft、preview/apply 手工镜像。源码绿不代表产物绿。
- **含义**：Part Studio 中小模型可用；大模型/团队并发需要容量模型、worker/子进程、增量读面、限流与逐 iModel 鉴权。

---

## 6. 要达到“Onshape Part Studio 主要功能”，优先级建议

1. **P0：契约/求解/实体补全**
   - ellipse/elliptic arc/conic/text/N 点样条 + 对应约束槽位/面域/UI。
   - 21 个 FeatureType 的逐分支收口（先从 extrude/revolve/fillet/chamfer/hole/shell/loft/sweep 开始）。
   - 外部引用 S4 保持 blocked 证据，不近似。
2. **P1：UI/undo/预览**
   - 把 gated 项逐项转 full 或登记 blocked；清理假控件。
   - 修 autosave push 与 undo 生命周期；至少保证一个编辑窗口可撤销。
   - 统一 preview pipeline，覆盖所有可预览特征并纳入七维验收。
3. **P2：性能/大模型**
   - 真实大模型/多 body/大草图性能基线；冷重建/缓存/队列。
4. **P3：特征广度**
   - 钣金/框架/曲面/曲线/MBD 按 ADR 分轨；不要混入 Part Studio 主波次。
5. **P4：AI+CAD**
   - 用 tool spec 把字段/默认/流程/限定转成 Agent schema；复用现有 toolId/FeatureOp；破坏性操作 HITL。

---

## 7. 结论

- **架构可行**：Part Studio 的模型/契约/内核/UI/测试链路完整，是当前最有希望做到 Onshape 同级的产品面。
- **完成度不足**：21 个 FeatureType 全部 partial、草图实体/约束只有子集、undo/autosave 有体验缺口、特征广度缺子系统。
- **不要做的事**：不要用“文档有 81 个 Feature Tools”直接对外承诺；不要在没有内核/契约/测试证据时把 gated 项说成已实现；不要把装配/工程图塞入 Part Studio 数据模型。
