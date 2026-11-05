# Onshape UI 对齐（2026-11-02）

本轮按 Onshape live 采集（Chrome 手动登录会话）逐项对齐用户可见差距：
ViewCube 与相机/渲染菜单、默认几何图元实时可见性、视口渲染与 BRep 拾取高亮、
特征树密度与图标。公开仓只消费后端产物；后端内核面片/拾取修正的记录留在
私有仓，不在本仓展开。

## 1. ViewCube 与菜单

- 组件：`apps/web/src/modules/part-studio/components/ViewCube.tsx|css`
  - 150×150 stage；84px 白面圆角 cube；浅灰罗盘弧线 + 四向箭头；无旧版
    圆环/角点装饰；Home 回退箭头 + 右下无边框 mini-cube 触发器（Onshape
    `view-cube-button`）。**（2026-11-05 二轮 DPR4 复核修正：cube 面边 58px、
    面标签屏幕直立、轴色/锚点/trigger 见下文「2026-11-05 UI polish」）**
  - 六面点击走 `StandardViewId`；四角为不可见 trimetric 热区（hover 才提示）；
    cube 拖动 = 真实轨道旋转（世界 Z yaw + 屏幕右轴 pitch，15° 步进）。
  - 朝向同步订阅 `viewport.onViewChanged`。**两个关键修正**：
    1. core 的 `setStandardRotation`/`synchWithView` 不保证 raise
       `onViewChanged`；程序化换视图后必须显式回读（ViewCube 动作内 +
       `sketch-camera`/`viewport-actions` 的 `raiseEvent`）。
    2. `view.getRotation()` 可能返回被原地改写的同一 `Matrix3d`；React state
       必须存 `clone()`，否则 `Object.is` 判等跳过渲染、cube 停在旧朝向。
  - 世界→CSS 旋转做 `F·R·F` 共轭（`F=diag(1,-1,1)`）。面标签按投影位置
    屏幕对齐；面标签固定英文大写（TOP/FRONT/RIGHT…，Onshape 中文界面同款）。
- 菜单（224px 宽 / 22px 行高 / 12px 字 / hover `#DEF1FB` / 子菜单向左展开）：
  - 等轴测、正二等轴测、正三轴测；
  - 图形首选项…（打开右停靠 display 页签）；
  - 缩放到合适大小（`fitViewToModelRanges`，按模型真实范围 + 留白）、
    放大所选窗口（`View.WindowArea`）；
  - 透视视图（checkable）；
  - 带边着色 ▸（带边/不带边/不着色/半透明）、消除隐藏边 ▸（隐藏边可见/
    消除隐藏边）、启用高质量视图（MSAA 4/1 checkable）。
  - **用户裁决：未实现项隐藏**——命名视图、上一个视图、法向垂直草图、
    相切边、亮显边界边、剖视图等不显示假按钮。

## 2. 默认几何图元实时可见性

- 树：`tree/DefaultGeometryGroup.tsx`（Origin/Top/Front/Right，组名本地化、
  行标签固定英文）；特征计数计入这 4 项。
- 状态：`use-part-studio-store` 的独立 `datum` 切片（`visibility` +
  `visibilityOverrides` + expanded/selectedId）；**绝不写入**
  `tree.selectedNodeIds` 或 `canvas.hiddenIds`。
- 纯规则 `internal/datum-visibility.ts`（`hooks/useDatumVisibility` 接线）：
  1. 无 authored body → Origin + 三平面全显；
  2. 有 authored body → 全部隐藏（含 Origin，与 Onshape live 一致）；
  3. 活动草图落在默认基准面 → 只显示该平面；
  4. 用户眼睛覆盖最后生效；scope 切换（connection/iModel/model）清空覆盖。
- 视口批注：`packages/viewer/src/viewport/decorations/datum-planes-decoration.ts`
  画 Top(XY)/Front(XZ)/Right(YZ) 半透明矩形 + 屏幕标签 + Origin 靶心，
  尺寸随取景范围自适应。

## 3. 渲染与 BRep 拾取高亮

- 视口基线（`packages/viewer/src/viewport/render-profile.ts`，
  2026-11-03 回退 iTwin 默认）：
  - 隐藏 Grid / ACS triad / Project Extents 包围盒 / 背景图；
  - **iTwin core 默认灯光/材质**：`LightSettings.fromJSON(undefined)`（solar
    1.0 / ambient 0.2 / portrait 0.3 / specular 1.0）与默认 `Environment`；
    删除全部子类别灰面覆盖（不再写 `#b4b4b6`）；
  - SmoothShade + 可见边（`#1f1f1f` 2px）、AO 默认关、MSAA 4、白底；
  - 保留 `generateAllPolyfaceEdges=false` 与 BRep 全拓扑叠加层。
- 草图曲线叠加（2026-11-02）：特征树 sketch 条目（params 自带
  entities+plane）采样成世界折线，屏幕空间绘制（无深度遮挡）。非编辑态全部
  草图灰色虚线（5/3 dash）；编辑态仅活动草图橙色实线（`#ff9f2f` 1.8px），
  退出后恢复全量。**2026-11-04 单一数据源收口**：`LubanCAD.Sketch` 不再写
  native geometry stream（params 的 entities+plane 是唯一数据源），
  `sketchRegionsFrom`/`sketchProfileFrom` 直接从 params 构建曲线；旧库启动时由
  后端迁移清空几何流。叠加层是草图唯一显示来源，不再存在 native 的
  XY（Bottom）重复副本。
- **草图标注（2026-11-02，Onshape live 对齐）**：
  - 常驻尺寸：活动草图的 length/distance/radius 约束 → 世界锚点 →
    `SketchDimensionsDecoration` 屏幕空间绘制（尺寸线/延长线/双箭头/数值；
    文字沿尺寸线旋转且永不倒置；半径 R 前缀 + 圆心引线）。实现侧向自动放在
    远离草图包围盒中心的一侧并做像素级堆叠避让；约束 DTO 暂无放置点字段，
    因此不做交互式拖放。
  - 绘图实时提示：`sketch-live-measures.ts` + `sketch-tool-feedback.ts` →
    `SketchToolFeedbackOverlay` 在光标旁显示阶段提示与实时数值（线长/角度、
    矩形宽高、圆/三点弧半径）；`editor` 的 ToolAssistance 通道同步发出。
    Onshape 草图没有 iTwin AccuDraw 罗盘，绘制工具不激活罗盘。
  - 构造辅助：Dynamics 通道绘制弧心连线 / 样条控制多边形（editor
    SketchTools 同款虚线语义）。
- 三角网格线：后端面片输出修正后，渲染端只保留真实 BRep 边；平面内三角
  对角线不再绘制（`generateAllPolyfaceEdges=false` + 内核共享点索引/平滑边
  标记）。native tile 仍缺光滑切线拓扑边，2026-11-03 增加**全部拓扑边叠加层**
  （`BrepTopologyDecoration`：后端拓扑读面 → 单 WorldDecoration 图元 + 逐边朝相机
  2px 深度偏移；点选择模式显示全部顶点小点）。详见
  `docs/BREP-RENDERING-2026-11-03.md`。
- **升级注意**：面片法线/边线产出变化会使旧 tile 缓存与当前内容不一致。
  部署新后端产物后，须按 iModelId 清理一次 tile 云缓存容器（或临时
  `TILE_CACHE_STORAGE=local` 重建本地 `.Tiles`），否则浏览器仍会取到旧
  tile（表现为平光/三角线）。
- BRep 拾取（2026-11-03 统一 Onshape 选择，
  `tools/modeling/OnshapeSelectTool.ts` + editor 基座）：
  - **无模式**：默认工具常驻，面/边/点同收；悬停 顶点(10px) > 边(6px) > 面(12px)，
    面 hover 蓝、边蓝/圆角橙；
  - 普通单击替换、Ctrl 切换、空白清除；整零件走零件列表或右键「选中所属实体」，
    树/零件选择与子实体选择互斥；
  - 原生面定位在旋转+圆角体上会卡死 MS（stock OffsetFacesTool 复现），面命中
    改 `getClosestPoint` 客户端兜底；原生边/点按视图深度剔除背面命中；
  - 选择 id 含 owner；面/边换持久拓扑 id，顶点无持久契约（会话级
    `vertex:<owner>:<cacheId>`，诚实边界）；
  - undo/redo 后工具自动重启时按 store 快照恢复高亮；对话框/草图/其它工具启动
    清空选择；
  - 圆角选边对话框打开期间圆角工具挂起而非退出，已选边保持高亮到对话框关闭。

## 4. 显示/渲染设置

- 共享状态：`hooks/useDisplaySettings.ts`，ViewCube 菜单与右停靠
  `DisplaySettingsPanel` 同源；localStorage
  `luban.partStudio.displaySettings.v2`（2026-11-03 v1→v2 换挡，不迁移旧
  AO/边色覆盖）；background=theme 跟主题 observer。
- 映射：`internal/display-actions.ts`
  - 模式 → `renderMode`/`visEdges`/`hidEdges`（SmoothShade、HiddenLine、
    Wireframe；translucent = SmoothShade + 模型 `FeatureAppearance` 0.5）；
  - 透视/FOV → `turnCameraOn(Angle)`/`turnCameraOff`；
  - 阴影 → `viewFlags.shadows`；AO → `viewFlags.ambientOcclusion` +
    `AmbientOcclusion.Settings.intensity`（20% ↔ 1.0，clamp [0.25,4]）；
  - 抗锯齿 → `viewport.antialiasSamples`；背景 → `applyViewportBackground`；
  - 边线 → `hiddenLineSettings.visible`（ovrColor/color/width）。
- 默认：Shaded、**iTwin 默认灯光/材质**、AO 关（强度锚点 1.0 保留供手动开启）、
  阴影关、正交、FOV 90、边 `#1f1f1f`/2px、全部 BRep 边线显示开/顶点关、AA 4、
  背景 theme（白底）。

## 5. 整体壳层（2026-11-02 最终波：Onshape live 逐像素）

全部尺寸取自 Chrome live Onshape 的 DOM 实测（同一会话采集 SVG symbol sprite，
符号表见 `apps/web/src/modules/part-studio/icons/onshape-icons.tsx`）：

- 顶栏 40px，背景 `#eaeaea` 无下边框：品牌 139px + 汉堡 32px + 文档名
  22px/600（max 308）+ 分支 16px `#999` + 链接/公开图标 32/22px；右侧
  探索 115×30、应用商店/学习/帮助 32×40、分享 51×34 `#1651b0`、用户名+24px
  头像；撤消/重做/保存不再在顶栏。
- 工具栏 36px 白底，起于 x=40，组间 2px `#d7d7d7` 分隔；按钮 32×32、
  图标 20px、无标签，仅草图主命令 68×32 带文字；顺序与 Onshape live 逐组
  一致：撤消/重做｜草图｜拉伸 旋转 扫掠 放样 加厚▾｜圆角▾ 倒角 拔模▾ 筋
  抽壳 孔 外部螺纹｜线性阵列▾ 镜像｜布尔 分割 变换▾ 删除零件｜修改圆角
  删除面 移动面 替换面｜平面▾｜框架▾｜钣金▾｜自定义特征▾。命令搜索
  139×32 `#eee`，右边距 145px。画布无选择模式组：面/边/点由默认选择工具
  直接拾取，画布右键菜单不再提供「选择面/边/点/零件」入口；曲面/曲线组仍在
  命令搜索中可寻址，但不在主工具栏显示。
- 左缘 40px 文档面板选择条：39×31 / 35px 步距，7 钮（版本和历史、创建版本、
  评论、文档注释、使用处、性能、AI 顾问）+ 底部页签管理器；历史接右停靠
  版本面板，创建版本接 Named Version 对话框，其余为 UI 占位（点击无行为）。
- 特征树 200px：顶部筛选按钮 30×30 + 输入框 158×30，起于 x=79；特征段头
  30px（标题 100px + 三个 30×30 钮），零件段头 26px；行高 26px / 字号
  13.333px / 图标 16px；默认几何缩进 19px；零件段固定 278px；特征链末端
  6px 渐变回滚条；树右缘 33×34 收起钮；眼睛仅在 hover/focus 出现。
- 底部页签条 30px `#d7d7d7`：左控件 34px，「+」；文档级页签（文档名 +
  document 图标）+ 200×27 活动 Part Studio 页签（白底 + 阴影，非活动
  `#eaeaea` `#666`）；文档页签 200×27 inactive。**可见状态栏彻底移除**，
  仅保留 `part-studio-status-connection` 视觉隐藏节点供 e2e 就绪判定。
- 右缘 5 钮 33×34 白底 1px 分隔：外观（接显示设置面板）/ 配置表 /
  FeatureScript 表 / 基于模型的定义 / 变量表；后四项为 UI 占位。
- ViewCube 150×150 stage（top/right 15px）：84px 白面 cube、10.5px 固定
  英文大写面标签（TOP/FRONT/RIGHT/…）、Home 回退箭头、mini-cube 触发器改
  用 Onshape `view-cube-button`；菜单文案/勾选沿用既有显示设置通道。
  **（2026-11-05 二轮复核后为 58px 面边、本地化屏幕直立标签、Home 仅自由视角，
  见下文 2026-11-05 节）**

## 6. 特征树与草图工具栏样式

- `styles/tokens/onshape-skin.css` + `PartStudioPage.css`：面板 200px、行高
  26px、正文 13.333px、图标槽 16px、默认几何缩进 19px、组头 30px/
  weight 500、hover `#e5f2fb`、选中 `#c9e4f9`。
- 眼睛只在行 hover/focus 时出现；隐藏项图标+名称 opacity 0.5。
- 每行按特征类型显示 Onshape 同款符号（`tree/FeatureTypeIcon.tsx` 经
  `onshapeIconFor`；sketch/extrude/revolve/…/part）。
- 草图模式：撤消/重做｜特征（拉伸/旋转）｜绘制 10 钮（线▾ 拐角矩形▾ 中心点圆▾
  3 点圆弧▾ 内切多边形▾ 样条▾ 点 文本 使用▾ 构造）｜编辑 6 钮（圆角▾ 修剪▾
  偏移▾ 镜像 线性阵列▾ 插入 DXF/DWG▾）｜尺寸 1 钮（无▾）｜约束（重合主钮 +
  水平/竖直/平行/垂直/相等/中点/相切/固定飞菜单）。▾ 与 2026-11-02 Onshape
  live 截图逐钮核对：线/使用也有飞菜单箭头，尺寸/点/文本/镜像/构造没有。
  图标全部为 Onshape live symbol；未实现工具/变体保留 UI 点击 no-op
  （`SKETCH_PLACEHOLDER_IDS`）。
- **单尺寸工具（2026-11-02 修正）**：Onshape 草图只有一个「尺寸」按钮，没有
  长度/半径飞菜单。`Sketch.Dimension` 按拾取动态推断——单线 + 放置点击 →
  length；单圆/弧 + 放置点击 → radius；两个 point/line → distance；单点/两弧
  → 明确提示不伪造。实体拾取半径 8px（`resolveNearestPick` maxDistance），
  空白放置点击不会被远处实体吸附（旧行为会把长度/半径误判成距离）。
- 草图编辑态：活动草图曲线在视口叠加橙色实线（1.8px `#ff9f2f`），非编辑态
  其余草图灰色虚线；进入草图仅显示活动草图，退出恢复全部。

### 6.1 草图创建对话框与特征面域选择（2026-11-02 Onshape live）

- **草图创建/编辑只有一个对话框**：无原生 `<select>`、无「快速拾取」按钮，
  也**没有**实体/约束/尺寸常驻清单面板（SketchPanel 已删除）。SketchDialog
  是 Onshape 同款非模态面板：平面字段显示「选择平面或面」，点击展开
  Top/Front/Right 菜单（可访问兜底）；主路径是**视口点击基准面**
  （`SketchPlanePicker` 蓝色悬停/选中高亮 + 顶部「选择草图平面」提示条）或
  特征树点击 Top/Front/Right。未选平面时 ✓ 禁用。创建成功后同一对话框保持
  打开并切到编辑态；再次 ✓ = 完成并退出草图。新建草图选平面期间三基准面
  强制可见（即使已有实体时平时自动隐藏）。视口拾取用视线-平面求交取最近的
  平面，避免 iso 视图 Front 被 Top/Right 永久遮挡。
- **草图值确认框**：尺寸/偏移工具完成拾取后，在**标注放置位置**弹出
  `SketchValuePopup`（数字输入 + 绿色 ✓ / 红色 ×，Enter 确认、Escape 取消），
  不再把输入框放在左侧常驻面板。尺寸值提交走 `applyUpdate` 追加约束，偏移
  值交回工具的 `commit`；拒收文本就地显示。
- **cPlane 基准面（2026-11-05，shared 1.29.0，Slice B1）**：ribbon「平面」→
  `CPlaneDialog`，字段按 Onshape live 可编辑副本证据：图元（参考基准面芯片 + ×，
  Top/Front/Right）、偏移复选、偏移距离（mm）、反转法线；提交
  `insertFeature cPlane`，特征树显示「平面 N」。新建草图对话框的「草图平面」
  下拉同时列出三基准面与成功 cPlane；选中后 `insertSketch.plane` 携带世界快照
  （origin/normal/xDir）与 `sourceFeatureId`。草图编辑态若来源平面存在，字段
  显示「平面 N」；来源已删除则显示「自定义平面」。平面被草图引用时，改参/删除
  由后端诚实拒收（切片 B1 不改参传播）；视口半透明平面渲染归 B1b。
  live 证据：`D:\Github\onshape-parity-data\ui-evidence\cplane-dialog-20261105\`。
- **偏移/自定义平面草图编辑（2026-11-05 修正）**：编辑既有草图时平面字段只读；
  平面若不在世界原点（如 Front 偏移 x=2/4）或非轴对齐且无 `sourceFeatureId`，
  字段显示「自定义平面」而不是空占位；✓ 不再因 plane 为空而禁用——`updateSketch`
  契约本身不携带 plane。新建草图仍未选平面时 ✓ 照旧禁用。
- **双击特征树二次编辑**：双击草图行 = 进草图模式并重开同一 SketchDialog；
  双击拉伸/旋转/圆角/镜像/阵列行 = 打开 FeatureDialog 编辑态，回显落库参数，
  ✓ 发 `updateParams`（保留 operation/mergeScope/newBody 等结构键）。loft/
  sweep 的草图结构引用与 booleanBodies 语义键由服务端守卫拒收，编辑态诚实
  只读并提示删除后重建。
- **拉伸/旋转「要拉伸的面和草图面域」**：无草图下拉、无面域按钮列表。对话框
  自动取最近一张草图；面域**在视口中点击**增删（`FeatureProfilePicker` 蓝色
  悬停填充 + 橙色选中轮廓），每个选中面域在字段里显示一个「草图 N 的面」chip，
  点 chip = 移除。多面域不静默预选（Onshape 同款：必须明确点选）；单面域自动
  选中。没有有序环的旧后端面域不伪造拾取点（诚实降级）。e2e 通过
  `feature-profile-picker[data-region-points]` 做真实鼠标点击。
- **终止条件（2026-11-05）**：extrude 对话框新增「终止条件」下拉（给定深度 /
  完全贯穿），接 ADR-0005 `endBound`（v1.22 后端已支持）。完全贯穿需要上游实体：
  `new`/`newBody` 时选项禁用并有提示；选中后距离输入只读，载荷仍携带正
  `distance` 以满足 `ExtrudeParams` 形态契约（服务端 throughAll 时忽略该值）。
  编辑既有 extrude 可来回切换；切换为给定深度时从落库 params 删除 `endBound` 键。

## 7. 相机

- 进入草图：`canvas/sketch-camera.ts` 用真实 `SketchPlaneDto` frame 定向
  （`Matrix3d.createRows(xDir,yDir,normal)`），关透视；**不得**直接映射
  `StandardViewId.Front`（Front 帧 normal=+Y、yDir=-Z，标准 Front 矩阵镜像）。
- 取景：读到既有草图实体后按实体 2D 包围盒 → 世界范围 `lookAtVolume`，
  左侧留 padding 避开草图面板；**新建空草图首次实体不得触发 fit**。
- 退出草图：恢复 rotation + origin + extents。
- 产体后自动适应：`applyOpAndFit` 在成功 `insertFeature` 后调用
  `fitViewToModelRanges`；首次布局稳定后按最终 `viewRect.aspect` 再 fit 一次。
- **取景 API 修正**：`computeFitRange()` / 模型范围是世界坐标，必须走
  `view.lookAtVolume(...)`；直接喂 `lookAtViewAlignedVolume` 会在非轴对齐
  视图错位/裁切。
- **圆角拾取相机纪律（2026-11-02 演示反馈修正）**：禁止用 500+ 单位的巨型
  取景体积把模型推到对话框右侧（会把模型缩到视口约 20% 且偏离中心）。统一用
  `lookAtVolume(modelRange, aspect, {paddingPercent:{left:0.55,right:0.05,...}})`
  非对称留白：模型按真实包围盒紧贴取景，同时避开左侧特性对话框。演示中每次
  标准视图切换前有字幕说明（相机变化是有意的拾取步骤，不是漂移）。
- **圆角演示保持 Iso（2026-11-03 用户反馈）**：不再切 Right/Left 正交视图。
  先在当前 Iso 视角拾取可见侧两条短竖棱，再用 ViewCube 罗盘箭头绕世界 Z
  旋转 180°（俯仰角不变，始终 3D Iso 观感），`frameCurrentView` 仅按模型范围
  重新紧取景（不改旋转），拾取背面两条。e2e 断言两段各 2 chips。
- 演示草图全貌取景重钉：`SCENES.sketchFull` 右移留出尺寸标注/ViewCube 间距，
  9 条尺寸标注完整可见（含 28.575）。

## 8. Tutorial 2 圆角与体积

- 圆角边：底座 **4 条短竖棱**（Z 向 19.05 mm，x=±41.275、y=±63.5，
  z=-9.525..+9.525；own ids `1:1/1:3/1:8/1:10`），不是 127 mm 长 Y 棱。
- 面域拆分：E2 = `band`(JGa 1153.56) + `bandWing`(JGe 483.87)；
  R1 = `revolveProfile`(JGW 725.775)。旧 fixture 把 JGe/JGW 合并导致
  +2.5 cm³ 无圆角体积差。
- 体积：后端 replay 无圆角 357.988 / 终 357.566 cm³（-0.001% vs API
  357.568）；UI 严格鼠标流终 357.712 cm³（+0.040%），去材 0.422 cm³。
  0.5% 门未放宽。

## 9. 特征实时预览与 Tutorial 2 展示（2026-11-02）

**Onshape live 规则（实拍证据，禁止自由发挥）**：
`.superpowers/sdd/onshape-tutorial2-analysis/recapture-2026-11-01/feature-extrude-1/2/3.png`、
`feature-revolve-1.png`、`feature-fillet-1.png`：
- Extrude/Revolve：新增体积 = **半透明灰色实体**（正常受光、3D 场景内深度测试、
  与既有实体互相遮挡）；选中草图面域 = **橙色半透明填充 + 橙色描边**；参数变化
  实时更新，取消即消失。
- Fillet：已选边 = **橙色加粗**；预览显示**真实圆角结果**。
- 未采集 live 证据的工具不做联想实现。

- 预览几何（纯函数，不写库/不调内核）：
  `apps/web/src/modules/part-studio/internal/feature-preview.ts`
  - extrude：选中面域边界沿草图平面法向双副本（对称 ±d/2，否则 0..d），
    侧面四边形 + 端盖 + 橙色选中面环；
  - revolve：面域边界绕草图内轴（line 实体）旋转；全周/部分角，稀疏环线
    （每 8 步一条）+ 四边形 + 部分角终止面端盖；
  - 轴实体自身从旋转轮廓中排除，避免退化面。
- 橙色选中面环：**后端 v1.20 下发有序环采样点**（`SketchRegionDto.outerBoundary` /
  `holeBoundaries`，`SketchRegions.ts` 从真实 `Loop`/`ParityRegion` 采样）——
  `outerEntityIds` 只是实体 id 集合，不能还原带 T 形交点/孔环的边界。
  - 前端 `feature-preview.ts` 直接把有序环映射到草图平面世界坐标；
  - 橙色面用屏幕空间 canvas **even-odd 填充**（天然消孔）+ 橙色描边；
  - 旧后端无有序环 → 不填充（只按真实实体边界画橙轮廓，不伪造）。
- 渲染：`canvas/FeaturePreviewOverlay.tsx`（名称保留）
  - 灰体 = **GraphicType.WorldDecoration**（wantNormals=true，深度测试开启）：
    填 `#E4E6E8` 半透明、棱线 `#6C7075`；透明度滑杆 0→alpha 0.42，100→0.06。
  - 橙色选中面/边 = **GraphicType.WorldOverlay**（x-ray，深度关闭）——预览
    灰体/实体不会遮住选择高亮（Onshape Extrude 2 的橙色面在半透明预览体内
    仍完整可见）。
  - 组件只返回 1×1 不可见观测标记（e2e 断言 `data-quads/profiles/edges`），
    不拦鼠标、无屏幕叠影。
- 圆角通道（v1.21，TileRpc 动态预览首切片）：
  - 选边高亮：`tools/modeling/FilletEdgePickTool.ts` 覆盖为橙色（Onshape 规则；
    基座 `SubEntityData.highlightRgb` 工具级覆盖，通用面/边仍品牌蓝）。
    **2026-11-02 演示反馈修正**：结果预览把源体做透明化后，基座高亮图形会随
    源元素一起消失；选边工具改为从缓存的子实体世界几何条目重建
    **WorldOverlay 橙色线**（x-ray、3 宽度），独立于源体显隐/深度，拾取中和
    结果预览中都保持 Onshape 已选边橙色。editor 基座为此请求
    `wantGeometry:true`（此前只取 graphic）。
  - 结果预览：后端 `previewOp` 对 fillet **影子求值**（`evaluateFilletAsync`：
    目标链尾缓存 → scratch carrier → `blendEdges`），返回 `PreviewResult.preview`
    （flatbuffer `ElementGeometryDataEntry[]` + categoryId/placement/modelId，
    不落库）；前端 `useFeatureSystem.previewOp`（短租约预算）→ FeatureDialog
    150ms debounce → `TileAdmin.requestElementGraphics`（**TileRpc 动态图形**，
    `DynamicGraphicsRequest3dProps`）→ 后端 Visualization `generateElementGraphics`
    → iMdl → `readElementGraphics` → `GraphicOwner` + `GraphicBranch`。
    **预览样式（演示反馈修正）**：fillet 结果用正常材质**实心**渲染（不是灰
    ghost），同时源体经 `FeatureOverrideProvider` 透明化，消除灰透明副本与源体
    共面的深度噪点；动态请求不挂源 elementId（挂上会被元素级 override 一并
    透明化）。extrude/revolve 客户端灰体预览保持不变。`requestElementGraphics`
    不读/不写 tile cache。
  - 验证：`FilletFlow.test` 臂 0 用返回 entries 调用 `generateElementGraphics`
    断言 iMdl 非空；e2e `T2_SHOWCASE=1` 断言 `data-dynamic=1` /
    `data-source-hidden=1`，并核对模型投影在对话框右侧、宽度≥可用区 50%、
    居中和垂直居中（相机取景回归）。
- 其他特征（loft/sweep/mirror/pattern/boolean）在 Onshape 有预览，但当前未接
  各自影子求值/预览几何（同一条 TileRpc 通道可复用）；`cancelElementGraphicsRequests`
  在 MS 宿主仍为 no-op（前端用序列号丢弃陈旧回包，取消待补）。不实现假预览。
- 新建项目与展示编排：`e2e/tutorial2-showcase.ts`
  - `resetTutorial2Project` 按名确保 B 标记项目
    「Tutorial 2 - Build a Part」在场（首次运行即新建），只删/重建同名
    iModel（幂等，项目本体持久化）；
  - `T2_SHOWCASE=1` 开启：文档中心展示新项目 → 进编辑器；草图阶段按
    Front 正对局部取景（中心矩形/右腿-小弧-喉线/第二矩形/偏移链/全貌），
    特征阶段 Iso，圆角拾取 Right/Left，收官 Iso/Front/Right 三视角；
  - 每个相机场景驻留 + 截图；三个拉伸与旋转对话框断言
    `part-studio-feature-preview` 在场并截图；圆角对话框断言后端动态预览
    `data-dynamic=1` / 源体透明、投影取景（对话框右侧/居中/≥50% 宽）并截图
    （`17-实时预览-圆角结果.png`）。
  - 草图实时标注断言：首次矩形拖动时 `sketch-tool-feedback` 显示宽度/高度；
    尺寸落库后 `sketch-annotations` 计数/文本逐步增长，终态 9 条全量。
  - 命令（系统 Chrome 录屏；demo config `slowMo: 180` + 页面底部步骤字幕）：
    `T2_SHOWCASE=1 npx playwright test e2e/tutorial2.spec.ts --config=playwright.demo.config.ts --project=chrome-demo --no-deps`
  - 真实用户操作手册：`.superpowers/t2-showcase-20261102/OPERATIONS.md`
    （工具/坐标/约束/尺寸/特征参数逐步列出）。
  - 产物（gitignored）：`apps/web/test-results/t2-showcase-*.png` +
    `test-results/t2-demo-chrome/.../video.webm`；稳定副本
    `.superpowers/t2-showcase-20261102/`（21 张带字幕截图 + 5.6 MB 慢速录屏
    + `t2-live-feedback.png` + `t2-fillet-solid-preview.png` +
    `t2-fillet-orange-edges.png` + `OPERATIONS.md` 操作手册）。
- 实跑结果（2026-11-02，产物模式 `dist-backend` + v1.21）：严格鼠标流
  1/1 通过（标准 2.9 min；慢速字幕演示 4.6 min）；18 实体/48 约束/9 尺寸、dof=0；E1/E2/E3/R1/Fillet
  状态全 0；无圆角 358.138 cm³、终 357.716 cm³、四短棱去材 0.422 cm³；
  圆角对话框显示后端影子求值的真实圆角结果预览（实心结果 + 源体透明 +
  橙色 x-ray 选边）。项目/iModel 持久化（`Tutorial 2 — Build a Part`，B 标记，
  initialized）。圆角拾取在视图切换后增加 chip 增量核对 + 最多 3 次重试；
  重试前把鼠标移到远处并等待 >900 ms，避免连续落空点击被宿主解释成双击视图
  操作（演示 2026-11-02 相机漂移根因）。

## 10. 倒角对话框（2026-11-05，能力补齐 Slice 1）

- ribbon「倒角」不再投旧 `ChamferEdges` 工具，改为打开 new/chamfer 的
  `FeatureDialog`——与拉伸/旋转/圆角/扫掠/放样同一入口姿态。
- 边拾取复用 fillet 通道：点「添加边」进入视口拾取（按钮 `aria-pressed`），
  再点同一按钮结束；已选边以「边 N」chip 呈现，可逐条移除；未选边或拾取
  会话未结束时 ✓ 诚实禁用。
- 参数区先选「倒角类型」：等距离（`mode=2`，`values1=values2=d`）、
  两个距离（`mode=2`，两个距离）或距离和角度（`mode=3`，距离 + 角度° → 载荷弧度）；
  编辑既有倒角回显模式与 values；无实时 ghost，提交走真实内核。
- **Onshape live 证据（2026-11-05，可编辑公开副本）**：
  `ui-evidence/chamfer-dialog-20261105/`。实测类型选项为
  **等距离 / 两个距离 / 距离和角度**；字段标签：等距离=「距离」，
  两个距离=「距离 1」/「距离 2」，距离和角度=「距离」/「角度」；
  所有模式有「切向延伸」，后两者有「方向覆盖」。LubanCAD 已按此对齐
  类型名与字段名；「方向覆盖」和 Onshape 的「测量」控件尚未实现。
- 多端盖拾取：Onshape 的 CAP_EDGE 可能分处零件两端；iOS 示例按 +y 端盖
  （Extrude 2 的 r25/r10）与 −y 端盖（Extrude 1 的 r10）分别取景拾取，
  共 3 条边后提交 2 mm，终体积 157478.900 mm³ 与 Onshape 目标一致。
- 证据：Hand Brake 1 条边/1 mm → 7125.270 mm³；iOS 3 条边/2 mm →
  157478.900 mm³（0.00%）；Sample Assignment 4 条竖边距离-角度
  1.524 mm/45° → 8915.860 mm³（0.00%）；in-session undo/redo 特征数往返；
  12/12 iModel 重开回归；web 1344/1344；`e2e` tsc/lint 绿。

## 验证

- 单测：web 1274/1274、viewer 122/122、editor 43/43 全绿
  （2026-11-03 单对话框/标注弹框/二次编辑波；删除 SketchPanel 及其单测，
  新增 `SketchValuePopup` 3 项、`sketch-dimension-tool` 8 项、
  `profile-picker` 5 项、FeatureDialog edit updateParams 用例；viewer
  `sketch-dimensions-decoration` 3 项）。web `eslint --max-warnings 0` 洁净。
- 后端（私有仓源码）：全量 705 passed / 8 skipped；v1.20 有序环采样点断言
  （矩形 4 点、孔圆 64 点、Tutorial 2 拱带 66 点）+ v1.21 FilletFlow 臂 0
  （previewOp 返回真实 entries，`generateElementGraphics` 产出非空 iMdl）。
  本仓 `dist-backend` 已本地同步 v1.21 构建用于真栈验证（未发布 Release）。
  `view-orientation`、`display-actions`、`useDisplaySettings`、
  `DisplaySettingsPanel`、`ViewCube`、`datum-visibility`、`sketch-camera`、
  `useSketchCamera`、`fit-view`、`datum-planes-decoration`、
  `sketch-curves`/`sketch-curves-decoration`、`feature-preview`、
  `render-profile`、`FeatureTree`/结构计数（含默认几何 +4）、
  `SubEntitySelectTool`。
- 后端（私有仓产物）回归：面片法线/参数落盘、顶点拾取位置回填；
  公开仓不展开实现细节。
- e2e（本轮实跑）：`visual.spec.ts` 7/7（编辑器铬基线已重钉）、
  `ui-parity.spec.ts` 2/2（ViewCube/默认几何/显示模式/草图相机）、
  `part-studio.spec.ts` 9/9（五区结构/保存版本/页签/菜单/对话框开合/只读）、
  `tutorial2.spec.ts` 1/1（严格鼠标流 3.3 min；18 实体/48 约束/9 尺寸、
  dof=0；草图对话框视口平面拾取 + 三次拉伸/一次旋转全部在视口点选面域；
  圆角拾取保持 Iso 斜视两段各 2 chips；无圆角 358.161 cm³、终 357.739 cm³、
  四短棱去材 0.422 cm³；T2_SHOWCASE 演示 5.1 min）。
  **2026-11-04 X-14 复跑**：`tutorial2.spec.ts` 2 passed（setup+strict，3.8 min），
  同体积/去材数字；修复=特征对话框前 `frameScene(SCENES.partIso)` +
  `profilePickPoints` 只返回安全点，详见 `architecture/EXCEPTIONS.md` X-14；
  `tutorial2-tools.spec.ts` 5/5（绘制/约束/标注/偏移/双击树二次编辑，3.1 min；
  标注测试验证单尺寸按钮依次生成 length 45 / radius 12.5 / distance 25，
  值确认框在标注位置；二次编辑验证拉伸距离 10→20 的 updateParams 落库）、
  `b-model.spec.ts` B 全链 1/1、`ui-parity.spec.ts` 2/2。
  `sketch-extrude.spec.ts` 仍红（拉伸确认禁用：草图无拉链面域；
  独立于本轮壳层/预览改动，待后续草图工具链专项处理）。
- 真栈截图：`.superpowers/t2-demo-20261102/ui-evidence/`（渲染/ViewCube 菜单/
  面/边/点高亮/树样式）。

## 2026-11-05 追加：工具栏下拉 / ViewCube / 图形首选项 / 外观面板

> 本节 **supersede** 上文旧 ViewCube 与右 dock DisplaySettingsPanel 的部分描述。live 证据目录：
> `D:\Github\onshape-parity-data\ui-evidence\ui-polish-20261105\`（工具栏下拉 07、ViewCube 04/05、
> 图形首选项 09/12、外观面板 11/13）。

### 工具栏下拉（`ribbon/RibbonDropdown.tsx` + `PartStudioPage.css`）

- 触发组 52×34：主钮 34×34 + 箭头 18×32（chevron 10×10，hover/展开 `#e5e5e5`）。
- 菜单 portal 到 body：**180px 宽**、1px `#ccc`、radius 3、shadow `0 5px 10px rgba(0,0,0,.2)`；
  左对齐整个触发组，顶边压 toolbar 底边 1px；窗口滚动/缩放/外点/Escape 收合。
- 首行=父工具（label + 快捷键 keycap，如「圆角 shift f」）；后续行=变体（20px 图标、
  14px 文本、行高 34/32、padding 6px、hover `#eaeaea`）。不再用 iTwinUI 默认大菜单。
- 键盘：打开聚焦首项，↑/↓ 移动，Enter/Space 激活；菜单 role=menu / menuitem，
  只读态逐子项 capability 裁决（gated 仍可开能力引导）。

### ViewCube（`components/ViewCube.tsx|css`）

> 2026-11-05 二轮逐像素复核。live 证据：`ui-evidence/viewcube-exact-20261105/`（含
> DPR4 600×600 原图、`probe-clean.json`、`side-by-side-final.png`）。**Onshape 的
> cube/罗盘/三色轴/标签全部由主 WebGL canvas 绘制，DOM 只有
> `.os-view-cube-bounds { width:150px;height:150px;right:0;bottom:5px }`**，因此
> 不可能复制它的 shader/亚像素；以下为可测的几何/颜色/尺寸指标，均已在 LubanCAD
> 按 CSS/SVG 重建。

- stage 150×150，位于画布右上内缩 15px（live：canvas top+15 / right 15）。
- cube **面边长 58px**（`left 46/top 46`，`translateZ(29px)`，perspective 700）；
  ISO 轮廓实测约 82×86 CSS（live 实测 81×85.5）——此前面 74px/translateZ 42 偏大约
  35%，是“大小不对”的主因。半透明近白玻璃面（0.78–0.84），1px `#cfd5da` 外线 +
  6px 白色斜面带 + 1px 低对比内线，radius 15；背面可见以形成玻璃叠加。
- 面标签为**屏幕对齐直立文字**（不随面倾斜），只渲染朝前三面；位置由
  `projectFaceLabels` 投影到面中心。live DPR4 实证：上/前/右在 ISO 下全部直立，
  此前“随面倾斜”理解错误。
- hover 面填充 **`#c4e1f5`**（live 像素精确值），斜切边保持白色/灰色。
- 三色轴：颜色取 live CSS 变量 **`#cd0000` / `#009400` / `#0000d0`**；锚点为当前
  Front 面投影左下角（`frontFaceBottomLeft`，ISO/Front 实拍吻合）；屏幕长度
  X 60 / Y 46 / Z 56；指向观察者的轴隐藏；画在 cube 前面（z-index 4）。
- Home 弯曲箭头**只在自由视角显示**；ISO/Top/Front 等标准视图隐藏（live 逐视图实拍）。
- 罗盘 `#e3e9ee`：顶部两弧 x=22.5..54 / 96..127.5、y=9..32.5，四向三角 11×7.5。
- 右下 trigger：live DOM **44.226×28**、right 0 / bottom −5、radius 3、
  `rgba(255,255,255,.35)`、20px mini-cube + 8×4 `#333` 实心下三角、间距 7px；
  hover 左侧显示 Onshape 同款浅灰 tooltip「相机和渲染选项」。
- **交互层（2026-11-05 三轮实拍对齐，证据 `ui-evidence/viewcube-interactions-20261105/`）**：
  - 可见面 hover 整面 `#c4e1f5`；**隐藏面**由轮廓边的 8px 蓝边带选中
    （ISO 右轮廓 → 后视图；底部 → 底视图；左轮廓 → 左视图），六面皆可达；
  - 角点 hover 显示 r≈9 蓝圆点，点击走该角 trimetric（方向 = 三邻面法向合成，
    local +Y=world −Y，故 `[sx,-sy,sz]`）；
  - 顶部左右弧 hover 高亮弧线本体；左右三角只可点击 yaw 15°，hover 不亮（live 实拍）；
    点击均为 **15° 单步、无按住连发**；
  - **无拖拽轨道旋转**：Onshape 从面/空白拖动均不改视图（实拍 40–42）；已移除旧拖拽；
  - 点击面/隐藏面/角/罗盘使用 iTwin `animateFrustumChange({animationTime:180})` +
    400ms rAF 回读，相机与 cube 同步平滑过渡（Onshape t80 中间态/t200 完成）；
  - 命中用屏幕空间几何（角点 > 隐藏面边带 > 可见面），面/角按钮 `pointer-events:none`
    仅留可访问性；不再依赖 CSS 3D 的命中/悬停。
  - 视觉再收敛：面不透明度 0.92、单线边 + 7px 白斜面、9px 屏幕直立标签、1px 轴色线。
- 菜单补齐 live 全部 16 项/4 分隔：命名视图、上一个视图（有历史才启用，单步回退）、
  编辑时法向垂直于草图、相切边可见、亮显边界边、剖视图…；未实现项保持外观但禁用 +
  `aria-disabled`，不静默假生效。图形首选项项改调用宿主回调（打开左侧对话框），
  不再打开右 dock。

### 图形首选项（`dialogs/GraphicsPreferencesDialog.tsx|css`）

- 左侧 300px 非模态面板（与右侧外观面板可同时打开）：标题 + 绿✓/红✗、常规/草图 tab、
  可折叠分组、info 圆点、重置为默认值、?。
- 常规：环境光遮蔽 / 视野 / 线宽 / 光泽度（前两项写 `DisplaySettings`；线宽写
  `edgeWidthPx`；光泽度映射 iTwin `LightSettings.specularIntensity`）；镜面反射颜色/
  剖面干涉颜色/影线边/网格主体按 live 分组呈现，但当前渲染器未暴露 → 禁用 + info 文案。
- 草图：活跃草图/非活跃草图/构造线分组按 live 呈现；当前渲染器暂未暴露逐草图颜色/
  线型 → 禁用并诚实标注。
- 默认值：AO 开 20%、视野 45 deg、线宽 2 px、光泽度 3%（2026-11-06 用户校正）。
- ✓ 保留实时预览并关闭；✗ 回滚打开时快照；reset 调共享 reset。

### 外观面板（`components/AppearancesPanel.tsx|css` + `PartStudioDock`）

- 右缘「外观」按钮不再打开显示设置：渲染独立 575px 右侧面板（标题「外观」+ tab
  零件和曲面 / 草图和曲线）。
- 零件行 = 名称 + 全宽颜色字段；颜色经独立 `FeatureOverrideProvider`
  （`hooks/useBodyAppearanceOverrides.ts`）逐 body 覆盖，与选择高亮并存。
- 空态 = 线稿插画 + live 文案（没有零件或曲面 / 没有草图和曲线）；草图行首版列出
  草图名与禁用的颜色字段（渲染器暂不支持逐草图着色，info 明示）。

**验证基线（2026-11-05）**：web **1375/1375**；新增 GraphicsPreferencesDialog 5、
AppearancesPanel 3、useBodyAppearanceOverrides 2、Ribbon 父行/快捷键 1、ViewCube
标准视图/自由视角 1、Front 面轴原点 1、动画相机 1；ViewCube/Dock/display-actions
断言同步更新；tsc/lint 绿。真栈截图 30–54 保留在证据目录；ViewCube 二轮精确复核证据在
`ui-evidence/viewcube-exact-20261105/`（DPR4 live、最终 ISO/Front/自由视角、
`side-by-side-final.png`）；交互层证据在 `ui-evidence/viewcube-interactions-20261105/`
（Onshape 面/隐藏面/角/罗盘/拖拽/动画帧 + LubanCAD 最终截图与 `side-by-side-final.png`）。
`e2e/tutorial2.spec.ts` 的罗盘 15° 步进等待从 140/150ms 调到 400ms 以覆盖 180ms
相机动画；真栈验证 `e2e/ui-parity.spec.ts` 2 passed、`e2e/tutorial2.spec.ts` 2 passed
（3.4min，四短棱圆角体积 357.739 cm³ / 去材 0.422）。

**真栈复核（2026-11-05，真实 iModel `de911416…`，登录 test@example.com）**：

- 工具栏：实测菜单 180×68、rows 34/32、`1px #ccc`、`0 5px 10px rgba(0,0,0,.2)`，
  左缘=触发组 x、顶边=组底边−1；圆角父行显示 `shift` `f` keycap（47–52）。
- ViewCube：等轴测下三色轴在立方体前面、标签在轴端；面标签在各自正视图中正立
  （`54-our-front-face-iso.png` 为面局部放大）；与 live `04-viewcube-crop.png` 同构（53）。
- 图形首选项：真实渲染滑杆可用；reset 后 AO 20%、FOV 45 deg、线宽 2 px、
  光泽度 3% 与 live 一致；不支持项禁用 + info（50–51）。
- 外观：选择 Body 1 颜色 `#ff0000`（React 原生 setter + input 事件）后视口实体即时变红，
  证明 `FeatureOverrideProvider` 链路真实生效（47 前 / 48 后）。
  **边界**：颜色是当前会话的显示投影，不写回 iModel/BIS；持久化外观需要 BIS 外观属性
  + schema 版本化，未包含在本切片。
- 关闭外观面板后 ViewCube 菜单、图形首选项、下拉菜单均无互相遮挡；面板打开时按
  Onshape 同姿态覆盖右缘（ViewCube 暂时被面板遮住）。

## 2026-11-05 追加：官方 iTwin Viewer ViewCube（默认）+ 相机/渲染菜单

用户实看后裁决「官方默认的交互操作手感非常好，比自研的强多了。就使用官方的
吧，但是要把 相机/渲染菜单 加上」。因此官方 `@itwin/imodel-components-react` 的
`CubeNavigationAid`（AppUI `CubeNavigationAidControl` 同源）**设为默认**；自研
Onshape 模式保留为 `?viewcube=onshape` 回退/Onshape 演示用。

- **默认与回退**：无参数/未知值 → 官方；`?viewcube=onshape` → 自研。显式选择写入
  `sessionStorage` v2 key（`luban.viewcubeMode.v2`），跨 `?model=…` 重写保持。
- **相机/渲染菜单**：原自研菜单整块抽到 `ViewCubeCameraMenu.tsx`（唯一实现，
  `ViewCubeMenuItem`/全部 testid/224px 样式/子菜单/键盘行为不变）。官方模式放
  150×150 stage：cube 96px 居中、左右各 27px 留白、stage 右缩进 24px。
  **trigger 固定定位（用户最终钉死，不随 ViewCube 变化）**：右缘与最右边箭头
  右缘对齐，上缘与最下面箭头下缘对齐（按钮位于箭头下方），菜单固定跟随按钮。
  e2e 断言边对齐 ≤1px、切 ISO 后按钮坐标不变且不与 cube 重合。此前「贴太紧/
  按钮位置不对/与 ViewCube 重合/偏上/右对齐」反馈由此关闭。菜单相机动作
  （ISO/正二等轴测/正三轴测/上一个视图）
  改用 `view.setRotationAboutPoint`，修复正交视图裸 `setRotation` 绕 eye 转导致
  target 甩出模型（实测 ISO 后模型消失）；官方模式 180ms + 400ms rAF
  `setViewMatrix` 跟踪，cube 与相机逐帧同步。
- **实现**：`ItwinViewCube.tsx|css` + `useItwinViewCubeBridge.ts` + `viewcube-mode.ts`
  + `ViewCubeCameraMenu.tsx`；`PartStudioCanvas` 以 `React.lazy` 加载官方 chunk。
  事件桥原样移植官方 `ViewportComponent`：cube → 固定旋转中心 + world frustum +
  `synchWithView({noSaveInUndo:!complete})`；viewport `onViewChanged` →
  `ViewportComponentEvents.setViewMatrix` 反向同步。
- **环境修复**：Vite Sass importer 解 iTwin 包的 webpack 风格 `~@itwin/…`；
  viewer startup 注入 `ITwinLocalization({urlTemplate:'/locales/{{lng}}/{{ns}}.json'})`；
  官方 UI 包交 Vite 预打包（classnames 等 pnpm 传递依赖），core-* 仍 `exclude`
  单实例；Vitest `server.deps.inline` 处理官方 AppUI 包 `.scss`。
- **宿主适配（保持官方行为不变）**：`.face { backface-visibility: hidden }`
  修复 Chromium 下背面拦截可见面中心格点击；箭头前景改深灰（官方为白，纯白底
  不可见）；官方原生 64px cube 按 AppUI 96px 宿主尺度放大 1.5×（origin center）。
- **实测**：面中心/四角点击、拖拽、四向 ±90° 箭头、相机/渲染菜单（含图形首选项/
  子菜单）工作；真栈 `e2e/itwin-viewcube.spec.ts` 2 passed（默认官方 + 菜单）、
  `e2e/ui-parity.spec.ts` 2 passed（显式回退自研）、`e2e/tutorial2.spec.ts`
  2 passed（4.2 min，体积 357.739 cm³/去材 0.422；罗盘 15° 演示显式回退自研）；
  web **1382/1382**、viewer 127/127、tsc/lint 绿。
- **代价/边界**：官方 cube 为独立 lazy chunk（JS 492 kB / gzip 144 kB；CSS 114 kB /
  gzip 15 kB），默认加载。官方模式下没有自研的罗盘 15°、三色轴、隐藏面边带、Home
  （菜单已补齐相机/渲染项）；Onshape UI 复刻演示用回退模式。
- 证据：`D:\Github\onshape-parity-data\ui-evidence\itwin-viewcube-20261105\`
  （`00-side-by-side.png`、ISO、Top+箭头、原生 64px、自研回退）。

## 2026-11-06 全 UI Onshape live 对齐（第一轮）

用户要求「全面检查所有 UI，与 Onshape 全面对齐，必须真实对比」。本轮回采了
Onshape live（Sample Assignment 副本、documents 首页、create 流程、sign-in）
与 luban-cad 同屏证据，逐区修正。渲染引擎差异（iTwin WebGL vs Onshape）保留，
UI 布局/密度/字段顺序/文案按 live 对齐。

**证据**：`D:\Github\onshape-parity-data\ui-evidence\ui-full-audit-20261106\`
（Onshape shell 2000×1160@2x、12 个特征对话框、documents/create/sign-in；
luban-cad 对照截图同目录）。sign-in live：`onshape/pages/signin-live.png`。

### 壳层（Part Studio）
- Onshape live 尺寸复核：顶栏 40px、ribbon 36px、左轨 36px、树 206px（合计
  242px）、树行 26px、底栏 30px；ribbon 首组撤消钮左缘 ≈39px。
- 顶栏操作簇顺序改为 Explore → 通知 → 应用 → 帮助 → 分享 → 用户（头像+名称+
  caret）；品牌/文档名/分支 pill 保持原布局；ribbon 起点与左轨对齐后首钮回到 38px。
- 版本/历史、评论、注释、使用处、性能、AI 顾问 7 个左轨钮与底部页签管理器保留。

### 特征对话框（220px 扁平皮肤，x=树右缘+6 / y=内容上缘+3）
- 统一：220px 宽、无边框/圆角、shadow `0 5px 10px rgba(0,0,0,.2)`、header 29px、
  页签 28px 且等分居中、参数行 27–28px、实体字段浅蓝底（`#eaf2fb`，边框
  `#a9c4dd`）、footer 透明度滑杆（中性灰）+ ?。隐藏「成品」文本钮，确认/取消
  28×28。
- Extrude：实体字段 → 终止条件 → 深度 → 方向 → 起始偏移 → 对称 → 拔模 →
  第二个终止位置；方向/起始偏移/第二位置为折叠行，对称/拔模为平铺复选；
  隐藏「新建实体」复选（由布尔作用域页签表达）。深度输入右对齐。
- Revolve：实体字段 + 全方位旋转 + 角度；结果类型/布尔作用域页签同 live。
- Fillet：边/全圆角页签；实体字段 → 切向延伸 → 测量（半径）→ 控制（距离）→
  半径 → 不对称 → 部分圆角/可变圆角/允许边溢出/平滑圆角；「添加边」在空态即
  字段占位。
- Chamfer：无页签；实体字段 → 测量（偏移）→ 倒角类型 → 距离/第二距离/角度 →
  切向延伸；补 `chamfer` 进可编辑特征集（此前真实栈编辑会被判只读）。
- Hole：单位页签（Inch/公制）→ 简单/沉头孔/倒角孔 → 图元字段（点选列表折叠，
  单草图时隐藏选择器并显示时钟图标）→ 合并范围 → 孔类型/钻孔尺寸 → 孔径 →
  起始平面/终止/深度/钻尖；footer 滑杆禁用并标注未接线。
- Plane：图元字段（浅蓝）→ 偏移模式整行下拉（无/偏移）→ 偏移距离 → 反转法线；
  原「偏移」复选框改为 Onshape 同构下拉（e2e 用 `selectOption`）。
- Pattern/Mirror：顶部模式行（零件阵列/零件镜像）+ 布尔作用域页签；实体字段
  显示 active body 芯片；Pattern 行序 方向 → 距离 → 实例数 → 居中/第二方向/
  跳过实例，技术范围提示视觉隐藏；Mirror 镜像平面独立行。
- BooleanBodies：Onshape 并集/差集/相交页签（相交禁用），不再显示遗留结果类型/
  布尔作用域页签与运算下拉（DOM 保留隐藏选择器供兼容）。
- Sketch：220px 扁平皮肤；平面字段浅蓝 + 时钟图标；四复选行 27px；历史/帮助
  移到底栏左右（Onshape live 无 header 时钟/help）。

### Documents 首页（live：2000×1160@2x）
- 新增 Free 订阅横幅 + Try Professional（gated 能力引导）。
- 左栏 224px：蓝色创建钮 194×34 + 探索/由我所有/最近/收藏/共享/公开/标签/垃圾桶
  + 底部订阅/试用/Plans and pricing。筛选标签 `由我所有`；banner/对话能力 gated。
- 主区：由我所有标题、欢迎面板（三栏）、我上次打开过的横卡（名称用 CSS content
  避免与表格重复文本）、文件夹行、项目行列表（替代第二张大表）、文档表格；
  默认视图改为表格（Onshape live）；列表/网格记忆保留。
- 表格在欢迎区下方保留 360px 固有高度，主区滚动；避免 flex 压缩成 0。
- 顶部右侧补通知/应用/帮助图标；标题/免费横幅/表头密度对齐 live。
- 新建文档对话框：约 590px、顶部对齐（translate 37px）、名称/编号/文档标签
  （禁用诚实标注）/文档位置树、创建公开文档/取消；`documents.create.imodelSubmit`
  单独保留 iModel 创建的「创建」文案。
- Sign-in：左表单列 50%、顶部 64px 起始、436px 表单、34px 输入；右 hero 仍为
  占位（宣传素材阶段替换为产品实景图）。Checkbox 高度修复（只对非 checkbox
  输入设 34px）。
- Document Details：白底、48px 顶栏、22px 标题、64px 缩略图、计数行 38px、
  卡片去阴影。

### 测试/证据
- web 单测 1382/1382；documents 96/96；document-details 64/64；
  FeatureDialog 135/135（含命中区/顺序/禁用门）。
- e2e 更新：documents 五筛 → 由我所有、默认表格/文本断言、B 项目双击进入；
  part-studio 深度标签、确认钮（成品已隐藏）、倒角入口改为对话框断言；
  CPlane e2e `selectOption('offset')`。
- 本轮 e2e 结果见下一节（真栈回归完成后补）。

### 诚实边界（未关闭）
- Split/Transform 工具栏入口无参数对话框（未实现能力，不伪造 UI）。
- Hole 预览透明度滑杆禁用（未接线）；图形首选项/外观面板的既有能力边界不变。
- Onshape 账号/学习中心/论坛为 gated 引导，不伪造外部页面。
- 渲染观感差异（引擎不同）保留，不在本表声称逐像素一致。

## 2026-11-06 宣传素材与产品介绍页

- 新增公开路由 `/showcase`（`ShowcaseRoute`，无需登录）：Hero、1080p 真实建模
  视频、核心能力卡片、示例复刻体积对拍、UI 对齐截图、技术底座与 CTA。
- 素材：`luban-cad/apps/web/public/showcase/`
  - 9 张 **3840×2160** WebP 实机截图（`hero-tutorial2`、`sketch`、`extrude`、
    `fillet`、`hole`、`chamfer`、`hero-sample-assignment`、`documents`、
    `create-document`），由 `scripts/capture-showcase.mjs` 以 1920×1080 CSS /
    DPR2 从真实栈采集；
  - `tutorial2-demo-1080p.webm`（**1920×1080**、81s、真实鼠标轨迹；由
    `scripts/record-showcase.mjs` 录制，含文档中心 → Tutorial 2 草图/拉伸/圆角
    → Sample Assignment 倒角/孔）。
- 入口：Part Studio 顶栏「探索 Onshape」与 Documents 欢迎卡「探索鲁班CAD」改为
  导航 `/showcase`；登录页右栏改为产品实景图并链接 `/showcase`。
- README 增加产品实景区（4 张能力图 + 视频直链 + 素材目录说明）。
- 单测：`src/routes/test/ShowcaseRoute.test.tsx` 1/1（4K 图/1080p 视频/能力文案）。
- 边界：视频无剪辑，包含真实 iModel 打开等待段；宣传页不发起后端请求。

### 全 UI 覆盖矩阵（2026-11-06 复核）

| 界面 | 参考证据 | 对齐内容 | 状态 |
|---|---|---|---|
| 登录 `/login` | live sign-in | 50% 左表单列、436px 表单、顶部 64px；右侧产品实景大图（4K） | ✅ |
| 文档中心 `/documents` | live documents | Free 横幅、224px 左栏、欢迎面板、最近卡、文件夹行、项目行、表格、页脚 | ✅ |
| 新建文档对话框 | live create | 590px、顶部对齐、名称/编号/标签/位置、创建公开文档 | ✅（标签/位置为诚实禁用/静态占位） |
| 分享/重命名/删除/能力引导 | iTwinUI 基线 | 统一 Onshape 模态皮肤（4px 圆角、20px 标题、右对齐 34px 按钮） | ✅ |
| 文档详情 `/documents/:id` | Onshape 视觉语言（无独立 live 页） | 白底 48px 顶栏、22px 标题、64px 缩略图、紧凑内容 | ✅（信息架构为 luban 项目/iModel 模型） |
| Part Studio 顶栏 | live shell | 40px、22px 标题、操作簇顺序（Explore/通知/应用/帮助/分享/用户+caret） | ✅ |
| Ribbon / 左轨 / 特征树 | live shell | 36px ribbon、36px 轨、206px 树（合计 242）、26px 行、30px 底栏 | ✅ |
| ViewCube + 相机/渲染菜单 | live + 用户裁决 | 默认官方 iTwin cube（用户认可手感）；自研 `?viewcube=onshape` 回退；菜单/图形首选项/外观已对齐 | ✅ |
| 特征树右键 / 画布右键 / 命令搜索 | live 交互 | 既有 2026-11-02~05 对齐；本轮未回归破坏 | ✅ |
| Extrude / Revolve | live dialogs | 220px、页签、实体字段、终止/深度、方向/偏移/对称/拔模/第二位置、页脚 | ✅ |
| Fillet / Chamfer | live dialogs | 边/全圆角页签、实体字段、切向延伸、测量/控制、半径、选项 | ✅ |
| Hole | live dialog | 单位/类型页签、折叠点选、合并范围、孔型/尺寸、起始/终止/深度/钻尖、页脚 | ✅（孔型尺寸下拉值只读） |
| Plane (cPlane) | live dialog | 图元浅蓝字段、偏移模式整行下拉、偏移距离、反转法线 | ✅ |
| Pattern / Mirror | live dialogs | 模式行、布尔页签、实体 body 芯片、方向/距离/实例数/居中/折叠项、镜像平面 | ✅ |
| Boolean bodies | live dialog | 并集/差集/相交页签（相交禁用）、工具选择、保留工具体 | ✅ |
| Sketch | live dialog | 220px、浅蓝平面字段+时钟、四复选、底栏历史/? | ✅ |
| Graphics Preferences / Appearances | live panels | 2026-11-05 已对齐；默认 AO 20%、线宽 2px | ✅ |
| Split / Transform | live dialogs | 无实现能力，工具栏入口不伪造对话框 | ⚪ 未实现 |
| Markup / 部分 ribbon 占位 | — | 依赖缺失/能力 gated，保持禁用 | ❌/⚪ 既有边界 |

### 真栈复核（2026-11-06 收口）

- 关键 UI e2e：documents 6/6、part-studio 8/8、itwin-viewcube 2/2、
  ui-parity 2/2（v3 显示设置存储键修正后）、visual 7/7（基线重钉：
  login/documents-grid/document-details/editor A/B、settings）。
- 功能回归：hole 3/3（简单孔/沉头孔体积精确）、tutorial2 2/2 + 示例重开
  verify-imodels（12 iModel）、feature-contracts 2/2、perf 文档百行滚动通过；
  perf 首帧在栈忙时曾瞬时连接失败，单独重跑 2/2 通过。
- 示例逐步 UI spec：`intro-to-cad`/`sample-assignment` 在 `EXAMPLE_RESET=1`
  下因旧示例库状态/baseline 重建长等待未完成（非 UI 断言失败）；示例 iModel
  重开与体积由 `verify-imodels` 12/12 覆盖。已知测试环境债务，后续单独清库重跑。
- `apps/web` 全量单测 **1383/1383**；tsc（含 e2e）/lint 绿；production build 9.77s 成功，
  `dist/showcase` 13 个资产（4K WebP + 1080p WebM）。
