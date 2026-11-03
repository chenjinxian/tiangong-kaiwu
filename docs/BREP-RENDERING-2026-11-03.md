# 完整 BRep 元素渲染与拾取（2026-11-03）

本文记录鲁班CAD 在**不修改 iTwin.js 渲染器 / shader** 的前提下，组合现有显示能力实现
「全部拓扑边线 + BRep 顶点 + 点/边/面拾取高亮」的方案，以及默认 AO/灯光压暗的根因与修正。

## 1. 问题与结论

| 现象 | 根因 | 处理 |
|---|---|---|
| 默认模型整体偏暗、顶面比竖直面暗 | `render-profile` 的世界方向光 `[+X,+Y,−Z]` 实际打亮竖直面；真栈直方图顶面 121、侧面 150–164，与 Onshape（顶 159 / 侧 88–95）相反 | 方向改为近竖直顶光 `[0.1,0.15,−0.98]`，solar 0.72 / ambient 0.5；顶面 ~164、侧面 ~100 |
| AO 默认压暗一档 | 37.5% 映射到 iTwin intensity 2.0（默认值 1.0 的两倍） | 锚点改为 37.5% ↔ 1.0，clamp [0.25, 4] |
| 边线不全、三角网格线 | native tile `generateAllPolyfaceEdges` 只能二选一：true=全部三角网格边，false=只生成折角/轮廓特征边；光滑/切线拓扑边缺失 | 保留 `false`，新增**后端拓扑读面 → iTwin GraphicBuilder 叠加层**，按拓扑边逐条画精确曲线 |
| 点/边/面无法统一拾取 | 三种子实体模式仅挂在画布右键菜单；顶点没有屏幕可见标记 | 沿用 `LocateSubEntityTool` 三种模式；点模式显示全部拓扑顶点小点，面/边/点均由基座提供 hover/选中高亮 |

## 2. 架构

```
modeling-server (editor SolidModeling command)
  getBodySubEntities(Edge|Vertex) ── 拓扑枚举
  getSubEntityGeometry(...)       ── 精确世界系曲线/顶点范围
        │
        ▼
apps/web/internal/brep-topology.ts  读面（active authored body / 失败隔离 / 有界并发）
        │
        ▼
apps/web/hooks/useBrepTopology.ts   生命周期（树刷新/undo/隐藏集变化 → 重读；样式变化不重读）
        │
        ▼
packages/viewer BrepTopologyDecoration
  ├─ WorldDecoration 图元：全部拓扑边，单图元、逐边 2px 朝相机偏移（深度测试 → 隐藏边不穿透；Scene 在真栈会遮住共面线，已弃用）
  ├─ Canvas 图元：可选的 BRep 顶点小点（点选择模式自动打开）
  └─ useCachedDecorations：拓扑/样式变化显式失效，相机/场景变化由 iTwin 缓存机制处理
```

### 2.1 为什么不用 `generateAllPolyfaceEdges=true`

该开关生成的是**每个 polyface 面片的边**（三角网格线），不是 BRep 拓扑边。打开后整模型
泛三角网格，与 Onshape 的「面 + 真实特征边」观感相反。关闭后 native 只推断折角/轮廓边，
不包含光滑切线边；因此需要在拓扑层补齐，而不是改 native 三角化或 shader。

### 2.2 为什么用装饰层而不是修改 shader

- 全部使用公开 API：`ElementGeometry.Iterator`、`GraphicBuilder`、`Decorator`、
  `GraphicType.Scene/WorldOverlay`；不触碰 `core-frontend` 渲染管线和 shader。
- 拓扑边来自 BRep 本身，和 native 三角化无关；曲线精度由后端几何缓存给出。
- 读面先 `clearElementGeometryCache()` 再建缓存：SolidModeling 的 FindOrAddElement 是粘性的，新提交 body 若在几何落定前被读过会留下空缓存，后续 create 不再重灌（e2e 实测：新拉伸永久 0 边）；清缓存后重试可恢复。读面结束 `finishCommand()`，避免只读命令常驻占槽。
- 逐边按范围中心像素尺度沿相机方向偏移 2px，规避与共面 B 面的 z-fighting；仍走深度
  测试，被实体挡住的边不显示（Shaded 与 Onshape 同姿态）。
- 整个模型合成一个图元（单 draw call），不做“每条边一个装饰”的放大。

### 2.3 显示模式映射

| 显示模式 | native 边 | 拓扑叠加边 |
|---|---|---|
| Shaded | 折角/轮廓边 | Scene 全部拓扑边 |
| Shaded without edges | 关 | 关 |
| Shaded with hidden edges | 可见 + 隐藏虚线 | Scene 可见拓扑边 |
| Hidden edges removed | HiddenLine | Scene 可见拓扑边 |
| Hidden edges visible | Wireframe | WorldOverlay 全部拓扑边 |
| Translucent | 可见边 | WorldOverlay（可穿透半透明体） |

拓扑叠加可在显示设置中单独关闭（「显示全部 BRep 边线」），顶点叠加默认关闭、点选择模式
自动临时打开（「显示 BRep 顶点」可常开）。

## 3. 拾取与高亮

- 面/边/点均继承 `LocateSubEntityTool`：
  - 面：`resolveFaceRef` → 持久拓扑 id；
  - 边：`resolveEdgeRef` → 边自身持久 id（流形门禁），高亮橙色用于圆角；
  - 点：无持久 id 契约，高亮为屏幕空间蓝点，会话内有效（诚实边界）。
- 入口：画布右键菜单「选择零件 / 选择面 / 选择边 / 选择点」；选中模式后左键 hover
  即有对应高亮（面蓝色半透明、边蓝色粗线/圆角橙色、点蓝点）。
- 顶点拾取容差 ×3（ACIS 顶点按射线距离判定，缺省孔径点不中）。
- 拓扑叠加边与拾取高亮是两层：叠加边是静态显示，高亮由工具会话绘制，退出即清除。

## 4. 刷新与失败语义

- 触发：`getBodies` 读面或特征树刷新（提交/undo/redo/手动 refresh）、手动隐藏 body 集变化。
- 去抖 120ms；单次读面 8s 超时。
- `startCommand` 被其他编辑命令占用/超时 → 返回 `undefined`，保留上一份拓扑，不闪空、不弹错。
- 单 body/单边失败 → 跳过该条，其余照常绘制。
- 读面会**清空几何缓存**再重建（保证新提交几何可见）；因此调用方只在 body 模式、无草图/对话框/拾取工具时刷新，避免拆毁工具拾取会话。
- 只对 active authored body 绘制；`hiddenIds` 中的 body 不绘制。

## 5. 验证基线

- 真栈：Tutorial 2 成品 1 body / 67 条拓扑边 / 44 个顶点；68 条边几何并行读取约 74ms。
- 对比截图：新灯光直方图主色 161/99/106，与 Onshape 159/88–95 对齐；旧值 121/150–164。
- 单元：viewer 127/127（含 decoration 5 项）、web 1280/1280（含拓扑读面/面板开关/选项映射）。
- e2e：tutorial2-tools 6/6（含新体 12 边/8 点断言）、tutorial2 严格 1/1、part-studio 8/8、ui-parity、visual 6/6、b-model/boolean/newbody/half-graph/feature-contracts 通过。visual 基线只覆盖 UI 铬（空体 B 种子），未受 BRep 叠加影响。

## 6. 已知边界（诚实登记）

- 拓扑叠加是可见边层：隐藏的光滑/切线边仍由 native 的折角边补充，不保证「隐藏边可见」
  模式下所有隐藏拓扑边都出现；要做全隐藏拓扑边需后端的深度/可见性判定或第二套虚线层。
- 装饰件不参与 view clip / 剖切；后续如有剖切需求需把边几何纳入 GraphicBranch 的裁剪。
- 大模型 N 条边会带来 N 次 `getSubEntityGeometry` IPC；当前有界并发 16，后续可加后端
  批量 DTO 或按 body 缓存，并以后端只读 RPC 替代前端的临时 SolidModeling 命令（避免
  命令槽争用；当前仅在 body 模式/无草图/无对话框时读）。
- 顶点无持久拓扑 id 契约（与现有 ResolveVertexRef 缺失一致）；点选仅会话级高亮。
