# 渲染、装配、工程图、导入导出：架构深挖

> 结论：
> - **交互式建模渲染**：**B**——iTwin WebGL + 原生 tile + BRep 叠加足够承载 Part Studio 视图。
> - **Render Studio / 高级渲染**：**C**——无 PBR/IBL/AxF/OpenVDB/服务端渐进渲染；DanQing 独立未接入，需 ADR。
> - **装配**：**实例/结构 B（BIS 底座未接线）/ 配合+BOM+爆炸+仿真 C**——无 3D Mate 求解器；不是 Part Studio 的扩展。
> - **工程图**：**C（显示既有图纸 A/B）**——无视图生成/Dimension/表格引擎；iTwin 只有显示原语与 BIS 视图基础。
> - **导入导出**：**DXF-B / mesh-B / STEP-D / DWG-C**——草图 DXF 已接线；mesh 可走 native 桥；精确交换受 ACIS InterOp 许可限制。

---

## 1. 当前渲染栈

### 1.1 交互式视图

```
native BRep → element geometry / tile 生成
  → Azurite tile 云缓存（或本地 .Tiles）
  → 前端 TileAdmin（CloudStorageCacheChannel）
  → iTwin `ScreenViewport` WebGL
  → BRep 拓扑叠加（WorldDecoration）
  → 选择/预览/尺寸/约束 glyph 装饰
```

- 渲染基线：iTwin 默认灯光/环境/材质 + 白色背景 + BRep 全拓扑边；AO/阴影关；MSAA 4。
- 视图：ViewCube、相机/渲染菜单、Named Views（部分）、Section View（部分）、Hide/Show/Isolate/Make Transparent（部分）、视图方向/缩放/投影。
- 预览：`FeaturePreviewOverlay` 用 WorldDecoration 灰体 + 屏幕空间橙色高亮；fillet 结果走 TileRpc 动态 iMdl。
- 拓扑叠加：边/顶点/面拾取，选择/透明/隐藏；BRep 不渲染问题已有内容感知取景修复。
- **细分就绪度**：
  - 视口/相机/六显示模式/内容感知取景：**B**；透明/隔离/隐藏/逐体外貌：**A**（OIT + neverDrawn + FeatureOverrideProvider）；ViewCube/标准视图：**A**。
  - 剖切：引擎 **B**（section cut tiles + ClipStyle 完整），产品 UI 全禁，且 BRep 叠加层是否被 clip 未真栈验证。
  - 拾取：**B**，但面拾取依赖原生 locate 的缺陷规避 + O(面数) IPC 兜底；大模型 **C**。
- **判定：B（交互式建模）**。这是当前最成熟的渲染面，但“能显示”≠“大模型可编辑”。

### 1.2 当前不足

- 大装配/大模型：tile/LOD/性能没有 Onshape 级验证；BRep 叠加在超大模型上可能成为开销。
- 材质/环境/阴影/后处理：iTwin 默认材质/灯光；没有 Render Studio 的 PBR 参数/IBL/IES/AxF/OpenVDB。
- 图面质量/视觉：可做建模视图，不是产品级渲染/工程图。
- 移动端/AR/AVP：未实现或仅部分。

### 1.2b 选择/拾取通道（比渲染器更硬的限制）

| 事实 | 影响 |
|---|---|
| 原生面 locate 在特定 BRep 体上卡死 MS，产品用 `getMaximumSubEntityHits(Face)=0` 规避 | 面拾取永远走客户端兜底；这是内核/命令缺陷，不是配置 |
| 兜底为“枚举全部面 + 逐面 `getClosestPoint`”IPC | 27 面约 50ms（本地 WS）；数百面无法维持 hover 帧率 |
| BRep 拓扑边逐边 IPC、提交/undo 后全量重读 | 大装配秒级到十秒级；命令槽与 hover 共用，拓扑刷新会暂停选择 |
| 顶点无持久拓扑 id | 只能会话选择，不能作为特征持久引用 |
| `SolidModeling` 全局单编辑命令槽 | 拓扑读面/子实体操作/选择排队；不能并行 |

**判定**：Part Studio 小模型 B；大模型/装配 C。最小切片是后端批量 face/topology DTO（带 geometryGuid 缓存）+ 客户端剔除 + GPU pick buffer 评估，而不是继续加前端 picker。

### 1.3 内核侧渲染事实（决定性能天花板）

- **tile facet 实际串行**：facet 线程最终走无键 `Invoke` 回落 ACIS owner 全局道；批量 facet 的 MT 形态存在，但生产 tile 路径没有键控流消费者。
- **无 BRep 实例化**：重复体在装配/阵列中回退深拷贝，内存/时间随实例线性放大。
- **BRep→tile 无原生测试**：可视化测试用桩几何，不经真 BRep facet；tile 质量/性能回归缺保护。
- **质量属性与 facet 耦合**：体积/质量读数由面片四面体求和，细公差可慢到分钟级；精度与性能是同一个旋钮。
- **无产品级 tessellation 档位**：只有整体 chord/angle 容差，没有 Onshape 五档/装配低质量策略。
- **tile 内容并发硬编码 4**：后端 `queryConcurrency('cpu')=4` 不是真实 worker 数；单 MS 宿主。
- **全 model 失效**：特征提交/undo 后 dispose 全部 tile tree，按 O(model) 而非 O(delta) 重建，没有 tile 级增量。
- **现有基线**：服务端 127 body 冷 `rebuildAll` 565ms；浏览器 N=20 树就绪 4,881ms、编辑刷新 467ms、FPS p95 16.7ms（接近 60fps 门）；N=50/90 未记录基线。
- **结论**：渲染底座 B；大模型/大装配 C。详见 `07-KERNEL-AND-NATIVE.md` §5–§6。

---

## 2. Render Studio / 高级渲染

### 2.1 Onshape 文档面

- Render Studio：Scene/Appearance/Environment/Camera/Render Options/Advanced（AxF/Appearance Set/Volume/Light/Environment Lighting）；普通 2.1MP、Advanced 100MP、Multiple 最多 60 视图；材质/环境库 3,881 外观/390 环境；PBR 扩展参数、28 blend mode、9 投影、IES/AxF/OpenVDB。
- 当前 iTwin WebGL 是 **Blinn-Phong 族**（两盏方向光 + ambient/hemisphere，太阳阴影），材质只有 diffuse/specular/finish/transmit/normal map；**没有 metallic/roughness、IBL、区域光、bloom/ACES/tonemap/SSR**。`ScreenSpaceEffectBuilder` 可挂自定义后处理，但材质/光照 shader 不能从公开 API 替换——真做 PBR 要 fork core shader（登记修改）或走独立离线服务。
- 没有服务端渐进渲染/去噪/多视图输出；视口截图不是 Render Studio。

### 2.2 DanQing

- 独立纯客户端 C++ 引擎（dqBase/dqGeom/dqCommon/dqRender/dqApp）；tile 流式/LOD、WBOIT、MRT 拾取、sectioning、HBAO、hidden line、thematic、saved views；README 声称 380k tile / 47.5GB 模型 2.25s 首帧、2,960 测试（**本轮未复测**）。
- **PBR 未实现（截至 2026-11-04 基线）**：当前仍 Blinn-Phong，IBL 为零，glTF 的 metallic/roughness 只读不消费；后处理链明确不做 bloom/ACES/SSAO/TAA；Filament/PBR 仍是接入分析目标。
- **Web 化未实现**：Emscripten/GLSL ES 300/Scene 编组仍是分析/规划；没有可直接替换 iTwin 交互视口的 WASM 产物。
- **未接入 LubanCAD**；`CANONICAL-SOURCES.md` 将其列为独立参考；`EXCEPTIONS.md X-10` 明确“未接入；接入需 ADR + 接口/许可/性能评审”。
- 两种路径判定不同：
  - **替换交互视口：D**——违反 P0-01/P1-05“唯一底座”，且与 iTwin 装饰/选择/命令槽深度耦合；需平台级重构。
  - **独立离线渲染服务：C**——可经 `ITileFetcher` 消费 tile dump；需先 ADR、补 PBR、材质/环境/灯光场景、去噪/EXR/任务队列。
- **判定：C（离线候选）/ D（交互替换）**。DanQing 不是现成 Render Studio。

### 2.3 建议

- 先做“交互式显示增强”（材质/环境/后处理/命名视图/剖切完整化），不做 Render Studio 产品面；剖切先接引擎已有 section cut + ClipStyle，并真栈验证 BRep 叠加层 clip 语义。
- PBR 是独立 ADR：A=core-frontend shader fork（保留 MRT pick/WBOIT/edge/合成，登记 fork 修改）；B=独立离线 PBR 预览服务（DanQing 候选）。两条路线互斥，先裁决再编码。
- Render Studio 单独立项：服务端任务/队列/场景快照/材质环境库/输出，先最小静帧 MVP，再 Advanced；与 iTwin/DanQing 的渲染架构 ADR 绑定。场景/材质不能成为第二套模型事实源（P0-06）。

---

## 3. 装配

### 3.1 当前

- 应用无 Assembly 模块/路由；`PartStudioTabs` 插入 Assembly 为 unsupported；`ui.assemblyEdit` 只是 gated。
- 后端仅有极小 IPC `createAssembly/listAssemblies`（创建/列举 `PhysicalModel`，无调用者；没有实例/配合/BOM 语义）。
- iTwin/BIS 有元素/层级/变换/关系，可承载“装配图元”；但**没有 Mate 约束求解器**、没有装配 BOM/爆炸/显示状态/仿真。
- 2D 草图求解器（libslvs/绳墨）不能直接求解 3D 刚体 Mate。
- 内核**没有 BRep 实例化**（重复零件深拷贝），大装配的轻量显示/内存模型不成立；干涉检测无空间索引/批量通道。
- **可复用底座的准确边界**：BIS `PhysicalModel/PhysicalElement/PhysicalType/GeometryPart` + `appendGeometryPart3d` + `ElementRefersToElements` + 标准 `TransformElementsTool`/`basicManipulationIpc` 足以表达“刚性实例 + 变换”；缺的是 occurrence 数据模型、文档页签契约、装配 RPC、装配树与 undo，不是方向性冲突。
- **证据现状**：语料有 500 个 ASSEMBLY 元素（155 文档）、462 份 assembly JSON、21,518 个 occurrence、最大 2,185 occurrence；但 **mates=0**、480 个 BOM 元素无载荷、29 个 Drawing APPLICATION 元素 0 载荷。装配/工程图目前没有可对拍的语义 oracle。

### 3.2 Onshape 文档面

- 10 种 Mate + 4 种 Relations + 实例列表 + 子装配 + Group/Snap/Replicate/Pattern/Mirror + BOM + 命名位置/显示状态/爆炸 + 仿真（静力/Modal/Async/Rigid Body）。
- 这些是完整子系统，不是 Part Studio 的一个工具。

### 3.3 架构判定

- **实例/结构：B**（底座已有但未接线）——BIS/iTwin 可做刚性实例+变换；缺 occurrence 模型、文档页签、装配 RPC/树/undo。
- **配合/Relations：C**——无 Mate/MateConnector 数据模型，无 3D DOF 求解器，无证据 oracle。
- **BOM：C（数据聚合可先 B）**——无 part number/description/revision、Structured/Flattened、子装配 rollup、表格引擎。
- **爆炸/命名位置/显示状态：C**——RenderSchedule 可做动画底座，但无持久状态模型。
- **仿真：C**——无材料/载荷/网格/结果/求解器；不应在装配数据平面之前启动。
- **方向性风险 D**：如果把 Mate 塞进草图求解器或把装配当 Part Studio 多 body，会破坏单一求解/事务/数据边界。
- **最小可行切片**：
  1. 两个 Part Studio 实例 + 独立 transform + 冷重开 + ECSQL 聚合质量属性（先不做配合/BOM 表/子装配）；
  2. 装配 tab + 实例列表 + 子装配引用；
  3. Mate Connector + 先做 Fastened/Revolute 两类 + DOF/失败语义；
  4. 再扩 10 Mate/Relations；
  5. BOM 数据聚合 → HTML/CSV → 图纸表格；
  6. 命名位置/显示状态/爆炸；仿真后置。
- **建议**：先做“实例结构 + 只读装配树”，再做 Mate、BOM；BOM 是工程图/发布的前置。不要先做仿真或十种 Mate。

---

## 4. 工程图

### 4.1 当前

- 应用无 Drawing 模块/路由；只有 gated `create-drawing` 菜单/占位。
- 内核只有单面平面片→曲线提取，**没有一般 BRep 的矢量 HLR/可见隐藏轮廓**；不能用 facet 轮廓冒充精确工程图。
- iTwin 有 `DrawingViewState/SheetViewState/SectionAttachment` 等 2D 渲染原语与 BIS 视图/剖切基础，但没有“从 3D 自动生成工程图”的视图生成/标注语义，也没有 Onshape 的工程图产品面：视图类型、尺寸、GD&T、表格、DWT/DWG/DXF、MBD Status、Revision/Inspection 联动。
- 当前 `@itwin/core-markup` 未配置，相关标记工具禁用；工程图 2D 排版/图层/表格没有实现。

### 4.2 Onshape 文档面

- 9 类派生视图、13 尺寸工具、14 GD&T 特征符号、Datum/Surface/Weld/Edge/Callout/Note、6 类表格、DWT 2013/DWG/DXF、MBD Status、Revision/Inspection、Release 联动。

### 4.3 架构判定

- **显示既有 Sheet/Drawing：A（引擎）/ B（产品接线）**——iTwin `SheetViewState/DrawingViewState/ViewCreator2d` 有集成测试，但产品无路由/页签，viewer 只加载 PhysicalModel。
- **视图生成：C**——无 3D→2D 投影/隐藏线/剖切填充/详图/断裂生成器；`SectionAttachment` 仅把空间视图挂到 2D，源码标注 “Strictly for testing”。
- **尺寸/注释：C**——BIS 有 `DimensionAnnotation2d` EC 类，但 TS 未暴露、DgnPlatform 尺寸 handler 未绑定 addon、无关联/样式/更新引擎。
- **GD&T/PMI/Inspection：C**——BIS 无 GeometricTolerance/Datum 类；语料中的 tolerance 是 FeatureStudio 自定义特征，不是 PMI。
- **表格/BOM/Cut List/Revision：C**——BIS 有 `TableAnnotation2d` JSON 类但无 TS/渲染 handler；无 BOM 数据源。
- **模板/导出：C**——BIS `SheetTemplate/SheetBorder` 可作模板数据起点；无 DWT/DWG/DXF 图纸/PDF/打印；DWG/DWT 另有格式/许可裁决。
- **依赖**：稳定的 3D 剖切/隐藏线、面/边持久 id、MBD 尺寸数据；装配 BOM 是工程图 BOM 的前置。
- **最小切片**：
  1. 只读显示已有 DrawingModel（`ViewCreator2d`），不做“生成”；
  2. 用低层 API 创建 Sheet + SheetViewDefinition + ViewAttachment，保存/冷重开；
  3. 静态文本注释 + 引线（明确非关联）；
  4. 真正的平面投影/隐藏线单独立项；不要先做“自动生成视图”或 GD&T/发布联动。

---

## 5. 导入导出

### 5.1 当前

| 格式 | 现状 | 判定 |
|---|---|---|
| DXF（草图） | 前端 ASCII 解析 LINE/CIRCLE/ARC/POINT/LWPOLYLINE/SPLINE + `$INSUNITS`；忽略 BLOCKS/INSERT，DWG 拒收；只入当前活动草图；真栈 e2e 覆盖导入+reload | **B** |
| DXF（图纸） | 无图纸引擎/层名/布局/导出；树菜单 DXF 导出 disabled | **C** |
| DWG/DWT | 无二进制解析/模板交换；需 ODA/RealDWG 或自研 + 许可裁决 | **C + 许可** |
| STEP/IGES/Parasolid | 无文件 I/O；ACIS InterOp 未授权；native 无翻译器 | **D（ACIS 路线）/ C（自研）** |
| STL/OBJ/3MF/GLTF（mesh） | 无产品读写器；但 `BodyFromPolyface`/`FacetEntity`/`exportGraphics` 可支撑 mesh 导入导出 | **B（mesh 语义）** |
| GLTF（精确模型） | 后端现为简化 JSON 占位；即使真实导出也只是显示网格，不是精确 BRep | **C** |
| PDF/打印 | 无 2D plot/矢量打印；浏览器截图不算工程图导出 | **C** |

### 5.2 架构阻塞

- **许可**：ACIS 授权仅 Modeler + Polyhedra；STEP/IGES/healing/InterOp 不得接线；ThickenSheet 也属未授权，但该 op 仍经 `createBRepGeometry` 暴露给 JS——许可边界目前只在文档层，native 入口 fail-open。
- **native**：`SolidKernel` 只有内存保存/恢复（ACIS SAB）、拓扑/几何/布尔/圆角/质量属性/tessellation；没有 STEP/DWG/STL 文件转换 API。网格导出可从 facet 派生，但未实现产品级 writer。
- **hub**：iModel + 文件上传（头像等）不等于 CAD 文件服务；没有格式转换服务。
- **TrueForm**：M0 仅脚手架；短期不能替代 ACIS/InterOp。

### 5.3 判定

- **DXF 草图导入**：**B**（已可用；仅 ASCII/line/circle/arc/polyline/spline，无 BLOCKS/INSERT/DWG/图纸）。
- **mesh 导入导出 STL/OBJ/3MF/GLTF**：**B（mesh 语义）**——底座已有 `BodyFromPolyface`/`FacetEntity`/`exportGraphics`，缺 writer/reader、单位/材质/失败回滚；不得宣称精确 BRep 或 STEP 等价。
- **模型导入 STEP/IGES/Parasolid**：**D（ACIS 许可）**——需许可/第三方翻译器/自研三选一；不能靠近似或自研 healing 短期解决。
- **工程图 DXF/DWG/DWT/PDF**：**C + 格式/许可**（需要 drawing engine + 导出；DWG/DWT 另有 SDK 裁决）。
- **缺失的服务化载体**：hub 只有 iModel/通用文件，没有格式转换/任务队列/结果产物；文档级导入导出若做，需要新作业模型（大文件 4GB 上限、超时/取消/配额/审计），否则会拖垮单 MS。
- **产品建议**：先做许可内格式（STL/OBJ/3MF/GLTF mesh、DXF 草图），并明确“mesh 不是精确交换”；STEP/IGES/Parasolid 先做许可/第三方裁决，不排代码。

---

## 6. MBD / PMI

- 当前没有 MBD/公差/Inspection 数据模型/UI。BIS 只有 `TextAnnotation3d` 与 2D `DimensionAnnotation2d`；没有 GeometricTolerance/DatumFeature/DatumTarget/SurfaceFinish/WeldSymbol 类。
- Onshape MBD 需要：驱动/从动尺寸、公差类型、Datum、Geometric Tolerance、Inspection table、默认公差库、面引用稳定 ID、尺寸-特征双向关联。
- 当前 Part Studio 有尺寸/表达式/面引用基础，但没有公差/PMI/Inspection；语料中的 `tolerance.fs` 是 FeatureStudio 自定义特征，不能作为 PMI 证据。
- **判定：C**；独立轨道，且是工程图/发布/检验的前置。先裁决“做 MBD 还是只做 Drawing GD&T”，不要两套并行。

---

## 7. PCB / CAM / FeatureScript（范围外候选）

- 当前无 PCB/CAM/Feature Studio 模块；FeatureScript 被计划显式排除，PCB/CAM 是独立专业应用生态（Altium/机床/post）。
- **判定：C/Excluded**；不应纳入 Part Studio 主波次。
- 若产品要做，需独立 ADR/许可/生态/团队；不要用“Onshape 有”作为直接排期理由。

---

## 8. 建议顺序

1. **渲染真实性与交互收口（先做）**：剖视/裁剪 UI + BRep 叠加 clip 语义真栈断言；批量 face/topology DTO 与 pick 缓存；provider 组合矩阵；N=50/90 基线。
2. **大模型/大装配性能**：tile 内容并发与真实 worker 对齐、增量 tile 失效、BRep 边批量化；若做装配，先立实例模型/求解器 ADR。
3. **许可内导出**：STL/3MF/OBJ/GLTF 真实导出；DXF 草图导入增强。
4. **装配基础**：实例/结构（BIS 底座）+ 装配树 → Fastened/Revolute Mate + 3D 求解器 → BOM → 10 Mate/Relations。
5. **工程图基础**：图纸/视图/尺寸/表格；依赖 MBD/装配 BOM 与稳定面/边引用。
6. **MBD/公差**：尺寸公差/GD&T/Inspection；与工程图/发布联动。
7. **Render Studio**：独立渲染 ADR（core shader fork 或 DanQing 离线服务）；不要先做全素材库。
8. **STEP/PLM**：许可/合作/外部服务裁决后再做。

---

## 9. 结论

- 渲染：**B 交互式 / C 大模型编辑 / C Render Studio**；视口/透明隔离/ViewCube 已 A/B，但拾取依赖原生 locate 规避 + O(面数) IPC、tile 并发 4、全 model 失效；DanQing PBR/WASM 未实现，只可作为离线候选（需 ADR）。
- 装配：**实例/结构 B（BIS 底座未接线）/ 配合+BOM+爆炸+仿真 C**；不是 Part Studio 扩展，但不必从零造层级。
- 工程图：**C**；独立引擎，依赖 MBD/装配/发布。
- 导入导出：**DXF-B / mesh-B / STEP-D / DWG-C**；mesh 不是精确交换，STEP 受许可，文档级导入还缺作业服务。
- 这些域都不能用“先做个入口”推进；必须按 AIRR/ADR 与能力账本分轨。
