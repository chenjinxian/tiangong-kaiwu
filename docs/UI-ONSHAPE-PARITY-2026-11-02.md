# Onshape UI 对齐（2026-11-02）

本轮按 Onshape live 采集（Chrome 手动登录会话）逐项对齐用户可见差距：
ViewCube 与相机/渲染菜单、默认几何图元实时可见性、视口渲染与 BRep 拾取高亮、
特征树密度与图标。公开仓只消费后端产物；后端内核面片/拾取修正的记录留在
私有仓，不在本仓展开。

## 1. ViewCube 与菜单

- 组件：`apps/web/src/modules/part-studio/components/ViewCube.tsx|css`
  - 150×150 stage；84px 白面圆角 cube；浅灰罗盘弧线 + 四向箭头；无旧版
    圆环/角点装饰；Home 回退箭头 + 右下无边框 mini-cube 触发器（Onshape
    `view-cube-button`）。
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
    `AmbientOcclusion.Settings.intensity`（37.5% ↔ 1.0，clamp [0.25,4]）；
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
  四短棱去材 0.422 cm³；T2_SHOWCASE 演示 5.1 min）、
  `tutorial2-tools.spec.ts` 5/5（绘制/约束/标注/偏移/双击树二次编辑，3.1 min；
  标注测试验证单尺寸按钮依次生成 length 45 / radius 12.5 / distance 25，
  值确认框在标注位置；二次编辑验证拉伸距离 10→20 的 updateParams 落库）、
  `b-model.spec.ts` B 全链 1/1、`ui-parity.spec.ts` 2/2。
  `sketch-extrude.spec.ts` 仍红（拉伸确认禁用：草图无拉链面域；
  独立于本轮壳层/预览改动，待后续草图工具链专项处理）。
- 真栈截图：`.superpowers/t2-demo-20261102/ui-evidence/`（渲染/ViewCube 菜单/
  面/边/点高亮/树样式）。
