# 完整 BRep 元素渲染与拾取（2026-11-03）

本文记录鲁班CAD 在**不修改 iTwin.js 渲染器 / shader** 的前提下，组合现有显示能力实现
「iTwin 默认材质/灯光 + 纯白底 + 全部拓扑边线 + 无模式点/边/面拾取」的方案。

> **2026-11-03 换代说明**：本文早期版本（同日）采用 Onshape 式顶光、灰面
> SubCategoryOverride、AO 默认 20%（2026-11-06 校正；20% ↔ iTwin 1.0）与面/边/点三种显式选择模式。该套渲染
> 已整体回退为 iTwin core 默认值，三模式已删除、统一为一个 Onshape 选择工具。
> 文中凡与本次换代冲突的旧数值均以下文为准；历史实现留在 Git 历史。

## 1. 问题与结论

| 现象 | 根因 | 处理 |
|---|---|---|
| 默认模型偏离 iTwin 观感（顶光/灰面/OA 压暗） | `render-profile` 自定义 solar/ambient/方向光 + 子类别灰面覆盖 + AO 默认开 | **回退 iTwin core 默认**：`LightSettings.fromJSON(undefined)`（solar 1.0 / ambient 0.2 / portrait 0.3）、`Environment` 默认、删除 SubCategoryOverride、AO 默认关、MSAA 4；白底与 BRep 边线保留 |
| 边线不全、三角网格线 | native tile `generateAllPolyfaceEdges` 只能二选一：true=全部三角网格边，false=只生成折角/轮廓特征边；光滑/切线拓扑边缺失 | 保留 `false`，用**后端拓扑读面 → iTwin GraphicBuilder 叠加层**，按拓扑边逐条画精确曲线 |
| 原生面定位在 Tutorial 2 体上卡死 MS | `locateSubEntities` 的 Face 路径在旋转+圆角体上无返回（stock `OffsetFacesTool` 同样复现；边/点路径正常） | 选择工具的 `maxFace=0`；面命中改客户端兜底：`getBodySubEntities(Face)` + 逐面 `getClosestPoint(AccuSnap 命中点)`，取屏幕距离最近（同距取三维最近） |
| 等轴测下背棱/背点抢占 hover | 原生 locate 沿视线返回后方子实体，且其屏幕距离为 0（盒体对角线与视线平行）；纯 2D 阈值无法区分 | `resolveNativeHitPoints` 按视图深度剔除 AccuSnap 前表面之后的命中；`hiddenEdgesVisible` 模式保留穿面拾取 |
| 点/边/面无模式统一拾取 | 旧实现只有三种显式子实体模式，顶点无屏幕标记 | 统一 `OnshapeSelectTool`：悬停 顶点(≤10px) > 边(≤6px) > 面；单击替换、Ctrl 切换、空白清除；整零件走零件列表/右键「选中所属实体」 |

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
  ├─ Canvas 图元：可选的 BRep 顶点小点（显示设置开关）
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

拓扑叠加可在显示设置中单独关闭（「显示全部 BRep 边线」）；顶点叠加默认关闭，
在显示设置「显示 BRep 顶点」常开。顶点标记只影响可见性，拾取不再依赖显式模式。

## 3. 拾取与高亮（统一 Onshape 选择，2026-11-03）

工具：`apps/web/src/modules/part-studio/tools/modeling/OnshapeSelectTool.ts`
继承 `LocateSubEntityTool`，注册为 ToolAdmin 默认工具（空闲态常驻），无选择模式。

- **悬停**：原生边/点 locate + 面客户端兜底；屏幕阈值顶点 10px、边 6px、面 12px；
  优先级 顶点 > 边 > 面。边/点先按视图深度剔除被前表面遮住的命中。
- **单击**：普通单击替换为当前命中；Ctrl 单击切换该子实体；空白单击清空。
- **整零件**：零件列表行或画布右键「选中所属实体」；零件选择与子实体选择互斥
  （子实体选择会清空树选中和元素级 SelectionSet）。
- **持久寻址**：面 `resolveFaceRef` → 持久拓扑 id；边 `resolveEdgeRef` → 边自身
  持久 id（流形门禁）；点无持久 id 契约，会话级（诚实边界）。选择 id 含 owner，
  两个 body 的同号 cache id 不会碰撞。
- **生命周期**：仅空闲态保留；打开特征/草图对话框或启动其它工具清空。undo/redo
  触发 `BriefcaseConnection.restartPrimitiveTool` 时按 store 快照恢复面/边/点高亮。
- **命令协调**：BRep 拓扑读面与子实体删除经 `withExclusiveBrepCommand` 串行取得
  SolidModeling 命令槽；hover 在命令执行前暂停、结束后恢复。
- 拓扑叠加边与拾取高亮是两层：叠加边是静态显示，高亮由工具会话绘制，退出即清除。

## 4. 刷新与失败语义

- 触发：`getBodies` 读面或特征树刷新（提交/undo/redo/手动 refresh）、手动隐藏 body 集变化。
- 去抖 120ms；单次读面 8s 超时。
- `startCommand` 被其他编辑命令占用/超时 → 返回 `undefined`，保留上一份拓扑，不闪空、不弹错。
- 单 body/单边失败 → 跳过该条，其余照常绘制。
- 读面会**清空几何缓存**再重建（保证新提交几何可见）；调用方只在无草图/对话框时刷新，
  并通过命令协调器暂停/恢复默认选择工具的 hover，避免拆毁拾取会话。
- 只对 active authored body 绘制；`hiddenIds` 中的 body 不绘制。

## 5. 验证基线

- 真栈：Tutorial 2 成品 1 body / 67 条拓扑边 / 44 个顶点；边几何并行读取约 74ms。
- 渲染：iTwin 默认灯光 `LightSettings.toJSON() === undefined`、无子类别覆盖、
  AO 关、白底、MSAA 4；`b-viewport` 启动即断言。
- 面兜底实测量级：27 面 × `getClosestPoint` 约 50ms/次 hover（本地 WS）。
- 单元：web 1320/1320、viewer 127/127、editor frontend 46/46；
  `OnshapeSelectTool` 33/33（面兜底排序/阈值、遮挡、owner-aware 选择、空集清空）。
- e2e 全量（2026-11-03 真栈）：52 passed / 4 failed / 2 skipped。其中
  newbody 2/2（面/边/点直拾、跨 body 替换、Ctrl 多选、fillet、删除失败保留选择）、
  render-showcase 2/2、ui-parity 2/2、visual 7/7、tutorial2 2/2、documents B 入口 2/2
  均绿；剩余已知红：b-viewport 3-scope 相机 exact-fit（§6）、sketch-extrude 历史红
  （Task 9 brief 登记，与本功能无关）。
- 视觉基线只覆盖 UI 铬（空体 B 种子），不覆盖 BRep 叠加像素。

## 6. 已知边界（诚实登记）

- **原生面定位不可用**：Tutorial 2 类体上 `locateSubEntities` Face 路径卡死 MS
  （stock `OffsetFacesTool` 复现），当前用 `getClosestPoint` 客户端兜底；大模型
  （数百面）需后端批量面定位或原生内核修复，否则 hover 成本线性增长。
- **隐藏边拾取**：正常着色模式按视图深度剔除背面边/点；隐藏边可见模式保留穿面拾取。
- **3-scope 相机恢复**：b-viewport 的三 scope 测试中，K3→K1 切换偶尔无内容感知
  fit（相机保留 K3 取景）或 fit 联合范围含 K3 体；属 P2.5 scope 过滤/取景竞态，
  未随本功能修复，测试登记为已知失败（其余 b-viewport 3/4 通过）。
- 拓扑叠加是可见边层：隐藏的光滑/切线边仍由 native 的折角边补充，不保证「隐藏边可见」
  模式下所有隐藏拓扑边都出现；要做全隐藏拓扑边需后端的深度/可见性判定或第二套虚线层。
- 装饰件不参与 view clip / 剖切；后续如有剖切需求需把边几何纳入 GraphicBranch 的裁剪。
- 大模型 N 条边会带来 N 次 `getSubEntityGeometry` IPC；当前有界并发 16，后续可加后端
  批量 DTO 或按 body 缓存，并以后端只读 RPC 替代前端的临时 SolidModeling 命令（避免
  命令槽争用；当前仅在无草图/对话框时读，并经命令协调器暂停 hover）。
- 顶点无持久拓扑 id 契约（与现有 ResolveVertexRef 缺失一致）；点选仅会话级高亮。
