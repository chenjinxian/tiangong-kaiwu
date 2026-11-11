# 鲁班CAD（LubanCAD）开发准则

**天工开物平台 AI 生成式 CAD 产品。** 平台文档与当前结构以主仓 `docs/` 为准。
**开发规则以主仓 `docs/DEVELOPMENT-RULES.md` 为唯一权威**；本文件只做鲁班CAD领域补充，
冲突以总册为准。功能开工前必须完成 AIRR 并遵守接口冻结矩阵。

## 本仓必须严格遵守的规则（按违反频率排序）

> 平台总册 + `docs/architecture/{AIRR-TEMPLATE,INTERFACE-FREEZE-MATRIX,CANONICAL-SOURCES,EXCEPTIONS}.md`。
> 本节是鲁班CAD每个 PR/Agent 操作的硬门禁。

1. **先论证后编码（P0-04）**：新工具/新对话框/FeatureOp 参数/RPC/schema/渲染/选择改动，先写 AIRR（复用矩阵 + 跨仓影响 + 测试/回滚）；新包/新 RPC/schema 迁移/渲染管线必须 ADR。禁止“先写代码再补文档”。
2. **单一编辑管道（P0-05）**：参数化建模只走 `LubanFeatureRpcInterface` FeatureOp；直接编辑只走 `EditTools.startCommand` + `basicManipulationIpc`/`solidModelingIpc`；工具必须继承 iTwin 标准基类并遵循生命周期。**旧 `LubanRpcInterface.startEditCommand/callEditMethod/finishEditCommand` 已删除，禁止以任何形式复活**；禁止自定义事件替代 `onCommitted`/`onModelGeometryChanged`。
3. **草图单一数据源（P0-06）**：草图事实源=`params`（entities+constraints+plane）；禁止再写 native geometry stream；前端 `SketchCurvesDecoration` 只是显示投影；旧库必须走迁移 + 旧数据 fixture。
4. **能力唯一（P1-01）**：一个能力只能有一个工具族/选择权威/预览管道。草图创建唯一族=`Sketch.*`（editor vendored `SketchTools` 不再注册）；选择唯一权威=`store.canvas.selection`，`connection.selectionSet` 仅经 `internal/selection-authority.ts` 单向投影。
5. **可撤销或 HITL（P0-10）**：一切用户/Agent 写操作走 `BriefcaseTxns`/`saveChanges`；不可逆操作必须登记例外并做预览→确认→提交+审计；禁止假成功/静默 no-op。
6. **参考优先（P0-03）**：先查 itwinjs-core/editor/imodel-native 官方实现；Onshape 交互以 live 证据/DOM/截图为准；禁止凭空设计或复制第二套实现。
7. **渲染/UX 纪律（P1-05）**：默认使用 iTwin 渲染器/灯光/材质/视图标志；自定义装饰件只做显示增强，不参与拾取/数据事实；DanQing 是独立渲染项目，未接入 LubanCAD，接入必须 ADR。
8. **测试证据（P1-06）**：触碰 iModel/RPC/schema/工具事务的改动必须有真栈 e2e；jsdom-only 不得宣称完成；bug 修复先写失败测试；性能/视觉改动必须有基线。
9. **构建与契约（P0-02/P0-07/P0-08）**：`link:` 源码消费，按 shared → editor → viewer → web 顺序重建；删除/改名 editor 导出后必须重建 viewer `dist`。shared 契约变更 bump `interfaceVersion` 并双端同发布；公共仓不得出现私有源码/密钥/native 证据。
10. **文档真实（P1-09）**：能力状态、测试基线、UI 对齐记录、`docs/README.md` 索引同 PR 更新；已知红必须登记，不得隐藏或改断言放水。

### 开工/完工门禁

- **开工**：AIRR 批准；复用矩阵覆盖 itwinjs-core/editor/viewer/shared/backend；明确 `toolId`/RPC/数据形态；破坏性操作先 HITL 方案。
- **编码**：标准工具基类 + 标准 IPC + 标准事务；禁止绕过 ToolAdmin/工具生命周期；新增能力前先删除/冻结旧路径。
- **测试**：受影响包单测 + `apps/web` 真栈 e2e；涉及共享契约/后端行为必须真栈；视觉改动跑视觉钉版。
- **完工**：接口冻结矩阵/例外/能力状态/文档索引同 PR；记录 known-red；发布按 `scripts/rebuild-web.ps1` + `verify-stack.ps1`。

## 铁律

1. **复用优先**：工具类功能继承 iTwin.js 标准基类（`ElementSetTool`/`PrimitiveTool`/`CopyElementsTool`…）；编辑走 `EditTools.startCommand` + `basicManipulationIpc`；事务走 `BriefcaseTxns`/`saveChanges`（可撤销硬约束）。**禁止**旧 `LubanRpcInterface.startEditCommand/callEditMethod/finishEditCommand` 通道（2026-11-04 已删除，shared 1.1.0）
2. **状态诚实**：能力声明带标记 ✅/🟠/⚪/❌，以主仓 `docs/` 与代码/测试实测为锚
3. **AI 工具注册规约**：Agent 复用现有 `toolId`，禁止第二套建模 API；破坏性操作走 HITL（预览→确认→提交）
4. **品牌**：产品名 鲁班CAD（LubanCAD）；生成物由 **真形（TrueForm）几何内核** 产出（BRep）；约束求解归绳墨

## 功能状态

> **路径口径（2026-10-29 收敛）**：正选前端 = `apps/web/`（包名 `@luban-cad/web`，模块在 `src/modules/*`）；基座包 `packages/viewer`（`@luban-cad/viewer`）+ `packages/editor`（第一方建模基座）。历史结构变更见 `../docs/MIGRATION-2026-10-29.md`（根 docs）。

| 模块 | 路径 | 状态 |
|------|------|------|
| Auth | `apps/web/src/modules/authentication/` | ✅ JWT 认证 |
| iTwin | `apps/web/src/modules/documents/`（项目管理与文档中心同页） | ✅ 项目管理 |
| iModel | `apps/web/src/modules/documents/` + `document-details/` | ✅ 模型管理 |
| Editor | `apps/web/src/modules/part-studio/`（编辑器页：ribbon/特征树/参数面板/状态栏五区）+ 基座包 `packages/viewer`（iTwin 启动序列/RPC）+ `packages/editor/frontend`（第一方建模基座，2026-10-22 收编） | ✅ 3D 编辑器；参数化特征 UX ✅（M3-a：特征树/参数面板/圆角/抑制/排序 op（v1 线性链无非恒等合法重排，守卫拒收口径）/预览反馈徽标）；✅ 特征实时预览（2026-11-02：extrude/revolve 参数 → 画布半透明 ghost，随相机重绘，透明度滑杆驱动；fillet 结果走 TileRpc 动态 iMdl 实心结果 + 源体透明 + 橙色 x-ray 选边；提交仍走真实内核）；草图模式 UX ✅（M3-b：俯视/栅格/提示+特征树联动入口）；✅ **Onshape 统一选择**（2026-11-03：默认工具常驻，无模式；悬停 顶点>边>面、单击替换/Ctrl 切换/空白清除、整零件走零件列表/右键；跨 body owner 持久 ref；undo/redo 后按 store 快照恢复高亮；面命中因原生 Face locate 卡死 MS 改用 `getClosestPoint` 兜底）；✅ **iTwin 默认渲染基线**（2026-11-03：core 默认灯光/材质 + 白底 + BRep 全拓扑边 + AO 关 + MSAA 4）；✅ Onshape UI 对齐（2026-11-02：ViewCube/显示设置下拉/默认几何图元树+视口批注；2026-11-05 追加：工具栏下拉 180px/父行+快捷键、ViewCube 逐像素复核 + 交互对齐（面边 58px/屏幕直立标签/三色轴/trigger 44.25×28/Home 仅自由视角/隐藏面轮廓带/角点蓝点/罗盘弧 hover/180ms 相机动画/无拖拽）+完整菜单、左侧「图形首选项」对话框、右侧「外观」面板 + 逐 body 颜色覆盖；详见 `../docs/UI-ONSHAPE-PARITY-2026-11-02.md`）；✅ **官方 iTwin ViewCube 默认**（2026-11-05 用户裁决手感更好：默认官方 `CubeNavigationAid`，`?viewcube=onshape` 回退自研；相机/渲染菜单抽成唯一 `ViewCubeCameraMenu` 挂官方 cube 下方；菜单相机改 `setRotationAboutPoint` 修正交 target 甩飞；宿主修背面命中/箭头可见性/1.5×；事件桥+400ms 跟踪；真栈 itwin 2 passed/ui-parity 2/tutorial2 2）；✅ 完整 BRep 拓扑边/顶点叠加（不修改 iTwin 渲染器/shader；详见 `../docs/BREP-RENDERING-2026-11-03.md`）；editor 基座两处修复：cleanup 幂等 `finishCommand`、`wantGeometry` 按需读取；✅ **X-01/X-02/X-03 第一轮债务清理（2026-11-04）**：旧编辑 RPC 删除、草图工具唯一族 `Sketch.*`、`store.canvas.selection` 单一权威 + `internal/selection-authority.ts` 唯一 SelectionSet 投影 |
| Sketch | `apps/web/src/modules/part-studio/tools/sketch/` | ✅ 草图编辑（M3-b：线/矩形/圆绘制+约束/尺寸工具链+DOF/矛盾面板+先试算后提交）；✅ 2026-11-02 进入草图按 SketchPlane frame 相机定向/实体范围取景，退出恢复；✅ 画布常驻长度/距离/半径尺寸标注 + 绘制中光标旁实时读数/阶段提示；✅ 2026-11-04 草图唯一数据源=params（entities+plane；后端不再写 native geometry stream，求值直接读 params；旧库首开迁移清空几何流，前端 SketchCurvesDecoration 是唯一显示源）；✅ 2026-11-04 草图工具唯一族=`Sketch.*`（editor vendored SketchTools 六件不再注册）；✅ 草图→草图投影（ADR-0009 切片 1a，shared 1.35.0，2026-11-07：`insertSketch.projections` 把同 PS 另一张草图的 line/circle/arc/point 投影到目标平面；投影实体不占 DOF、约束暂不可引用、读取按源当前解实时重投影；源草图→投影草图/消费特征驱动边保证改尺寸联动；真栈投影矩形拉伸 2000→源宽 30→3000 mm³ push+重开；实体边投影/PIERCE/UI 待后续切片；shared 1.57.0 起 MIRROR 约束契约/求解/回放支持；草图镜像 UI（`Sketch.Mirror`）已落 line/point/circle/arc/spline（三次样条）+ 真栈 reload 重开；草图点工具 `Sketch.Point` 已落（连续放点/finish+reload，真栈 2 passed）；中心矩形 `Sketch.CenterRectangle`、对齐矩形 `Sketch.AlignedRectangle`、中心点圆弧 `Sketch.CenterArc`、贝塞尔曲线 `Sketch.Bezier`、相切圆弧 `Sketch.TangentArc` 已落（飞菜单占位退役，真栈各 2 passed）；周边圆 `Sketch.PerimeterCircle` 三点定圆已落（真栈 2 passed，不生成圆心点）；正多边形 `sketchInscribedPolygon`/`sketchCircumscribedPolygon` 已落（默认 6 边、键盘 3–50、构造圆+equal/angle，真栈各 2 passed）） |
| Modeling | `apps/web/src/modules/part-studio/tools/modeling/` + `packages/viewer/src/tools/register-edit-tools.ts` | 🟠 实体建模（阵列/MirrorElements 走标准 `basicManipulationIpc` 直改通道；DraftFaces 死工具已删、能力 gated）；参数化特征系统 ✅（M3-a：圆角/抑制/排序 op（v1 线性链无非恒等合法重排，守卫拒收口径）/预览 op——后端在私有仓 luban-backend FeatureService）；✅ 孔（ADR-0006 切片 A/A2/A3，2026-11-05：`HoleDialog` 草图点 + 曲线顶点（线/弧端点、圆心）/孔径/blind/throughAll/沉头孔；shared 1.28.0；真栈简单孔去材 196.349 vs 196.350 mm³、沉头孔 373.064 mm³ 精确；shared 1.32.0 起倒角孔/countersink 启用——锥台 Loft 切除 + HoleDialog 直径/角度，真栈去材 261.794 vs 261.799 mm³；2026-11-08 钻尖角 118°/180°（shared 1.50.0，ADR-0006 切片 A5，真栈盲孔去材 88.371 vs 88.371 mm³）；shared 1.56.0 起终止条件 upToNext（ADR-0006 切片 A6：孔轴最近平行面，多孔位逐孔目标面；真栈 φ5/板厚10 去材 196.349 vs 196.350 mm³；HoleFlow 10/10）；螺纹页签仍禁用）；✅ 倒角 UI（2026-11-05，能力补齐 Slice 1/1b：ribbon「倒角」→ 复用 fillet 视口拾边/owner；类型与字段按 Onshape live 副本对齐「等距离/两个距离/距离和角度」「距离/角度」，等距离/两个距离 `mode=2`、距离和角度 `mode=3`；编辑回显 values1/values2；iOS 3 条 CAP_EDGE 达 Onshape 目标体积、Hand Brake 边 1 mm 精确、Sample Assignment 4 竖边 1.524 mm@45° 精确）；✅ 抽壳 UI（T3，2026-11-06：`ShellDialog` 移除面 + 壁厚 + 内/外方向 + 后端影子预览；面快照在 ribbon 路由时捕获，`ShellParams` 零变更；真栈盒体 1084.000 mm³、undo/redo、双击编辑 1952 mm³、push+重开；Hollow/逐面差异壁厚未支持）；✅ 拉伸第二方向（T4 切片，2026-11-06：`ExtrudeParams.secondDirection` 契约已有，FeatureDialog「第二个方向」复选 + 深度/终止条件 + 编辑回显 + 预览包络；converter 映射 BLIND/THROUGH_ALL；真栈 20×20 拉伸 10+5=6000.000 mm³、push+重开）；✅ 旋转多面域（T4，2026-11-06，shared 1.30.0：`RevolveParams.regions` + 后端逐域 spin/Unite；FeatureDialog revolve 复用 extrude 的视口多选 chips；真栈两互斥环柱 2500π=7853.981 mm³、真实 Hand Brake 7125.270 vs 7125.274）；🟠 基准面 cPlane（ADR-0006 切片 B1，shared 1.29.0，2026-11-05：`CPlaneDialog` 图元/偏移/偏移距离/反转法线；SketchDialog 可选 cPlane 并落平面快照 + `sourceFeatureId`；被草图引用时改参/删除诚实拒收；shared 1.31.0 B2a 增「平面点」世界原点（与 offsetMm 互斥），Handle 真实示例真栈；shared 1.40.0 LINE_ANGLE 切片增 `line`/`angleDeg`（参考法线投影后绕线 Rodrigues，前端派生快照；真栈 45° 平面拉伸 **4000.000 mm³** 质心 (10,3.536,10.607) push+重开）；shared 1.43.0 LINE_POINT 切片增 `point`（线与过线点定义平面，真栈同平面 **4000.000 mm³** push+重开）；shared 1.44.0 THREE_POINT 切片增 `threePoints`（三点平面，真栈同平面 **4000.000 mm³** push+重开）；UI/converter 未接；任意面/边参考、视口平面渲染与改参传播归 B2b）；🟠 faceExtrude 首切片（ADR-0006 切片 D，shared 1.33.0，2026-11-06：持久 `faceRef` → 平面面轮廓沿法向扫掠 + 布尔/孔洞；真栈合成盒体 add 1 mm = **48.000 mm³**、push+重开；**同日纠正：Onshape imprintFace 是草图面/材料面域（根 `<sketchId>.imprint`），不走 faceExtrude——回放改为侧向草图面域（−1 环外/+1 环内），iOS 真栈 157478.901 mm³；faceExtrude 仅保留显式实体面能力，无 converter 映射/UI；已随 backend-20261109（shared 1.63.0）发布**）；✅ booleanBodies 三操作（T12/T12b，2026-11-07：`BooleanBodiesParams.operation` 增 `intersect`→内核 `BRepGeometryOperation.Intersect`；RPC 真栈两重叠盒交集 **1.000 mm³**、工具体消费、push+重开；**UI 相交页签已启用**，RPC 建链 + ribbon 布尔运算 → 目标/工具 → 相交，真栈 `boolean-intersect-ui.spec.ts` **2 passed** **1.000 mm³** push+重开；backend 773 passed；splitPart/rib/face ops 仍 gated）；🟠 featurePattern 首切片（ADR-0007，shared 1.34.0/1.59.0，2026-11-07：FEATURE pattern 以源特征前/后缓存差集为 delta，任意轴线段 linear/circular 变换后按源操作 Unite/Subtract；源限 extrude/revolve/hole add/remove；真栈凸台 3 实例 **16240.000 mm³** push+重开；**FACE/FEATURE circular pattern→featurePattern converter/translator 切片已落（test-only：schema/validator+translator 24/24、FACE 合成真栈 6 孔阵列 14303.541 mm³ push+重开；FEATURE 真实 PS 2 body 数正确但体积 +1.39%/+4.50%——FEATURE mirror 的整 body 镜像近似对切除特征不成立、pattern 实例多数未与当前体相交；多体 featurePattern/mirror 已加显式 targetBodyId 锚定）**；**v1.49 centered 切片
  （ADR-0007 切片 6，2026-11-08）**：`FeaturePatternParams.centered`（count 总实例数、
  须奇数，偏移 (k−(count−1)/2)·spacing；官方帮助页证据），后端 FeaturePatternFlow 7/7、
  真栈 centered count 5×6 **16400.000 mm³** 质心 x=0 push+重开；converter 按 2N−1
  映射（语料 centered 源均被其它缺口阻塞，无新绿）；**切片 7（2026-11-08）已接
  body `PatternParams.centered` + FeatureDialog「居中」UI**：UI 输入 N=每侧实例数
  （含原件）、载荷 count=2N−1+centered、圆周禁用复位、编辑回显 N=(count+1)/2；
  单测 148/148、真栈 `e2e/pattern-centered-ui.spec.ts` **2 passed**（4×4×5 盒
  N=3/spacing=6 → count=5 **400.000 mm³** 质心 (2,2,2.5) push+重开）；
  已随 backend-20261109（shared 1.63.0）发布；**切片 8（2026-11-08）树行编辑 UI 已接：
`FeaturePatternDialog` 源/轴只读、count 3→4 真栈 16320.000 mm³ push+重开，
单测 6/6**）；**切片 9 多源（shared 1.59.0，2026-11-09）**：
`FeaturePatternParams.sourceFeatureIds` 与单源恰一，后端逐源差集变换；converter
不再丢多源 FEATURE pattern、translator 46/46、backend `FeaturePatternFlow` 9/9、
真栈两凸台一次线性阵列 **16480.000 mm³** push+冷重开；**切片 12 多源编辑 UI（2026-11-09）**：`FeaturePatternDialog` 只读回显全部 `sourceFeatureIds` chips、多源不再误判源缺失、updateParams 按落库形状保形，可改 count/spacing/centered；真栈两凸台多源 3→2 **16320.000 mm³** push+冷重开，多源增删未做；**切片 10 第二方向（shared 1.61.0，2026-11-09）**：`FeaturePatternParams.secondDirection` linear 网格（count/spacing/centered/axis，两方向总实例 ≤1000）；后端 FeaturePatternFlow 10/10、translator 48/48、真栈 3×2 网格 **16480.000 mm³** push+冷重开；**切片 11 第二方向编辑 UI（2026-11-09）**：已有 `secondDirection` 的阵列树行双击可编辑第二方向 count/spacing/centered（居中输入每侧 N→2N−1），轴只读保留；取消勾选提交移除该键（可撤销），切圆周自动取消，两方向总实例 >1000 禁提交；真栈 3×2→3×3 **16720.000 mm³** push+冷重开；**切片 12 多源编辑 UI**：源 chips 只读回显/载荷保形，真栈两凸台多源 3→2 **16320.000 mm³** push+冷重开（`feature-pattern-edit-ui` **4 passed（1.9 min）**）；多源增删/无落库轴新增第二方向未做；**切片 13 body pattern 第二方向（shared 1.62.0，2026-11-09）**：`PatternParams.secondDirection` linear 网格（世界轴枚举；总实例 ≤1000）；后端 PatternFlow 22/22、FeatureDialog 179/179、真栈 4×4×5 盒 3×2 **480.000 mm³** 质心 (14,8,2.5) → 编辑 3×3 **720.000 mm³** 质心 (14,9,2.5) push+冷重开；UI 圆周自动取消、居中每侧 N；converter/skip 未接；**切片 14 第一方向反向（shared 1.63.0，2026-11-09）**：`PatternParams.oppositeDirection`（linear；圆周拒收）；FeatureDialog「反向」复选框、载荷/预览/编辑回显；后端 PatternFlow 23/23、真栈同 spec 勾选反向 → 720 mm³ 质心 x=-6 push+冷重开；🟠 featureMirror 特征级镜像首切片（ADR-0011 切片 3，shared 1.47.0，2026-11-07：源特征差集反射后按源操作 Unite/Subtract，源限 extrude/revolve/hole，真栈孔镜像 **15434.514 mm³** push+重开；**切片 5 UI 已接（2026-11-08：范围 零件/特征 + 源特征下拉 + 世界平面，真栈板+凸台特征镜像 16565.486 mm³ push+重开）**；**切片 4 多源（shared 1.58.0，2026-11-09：`sourceFeatureIds` 与单源恰一，后端逐源差集反射；converter 不再丢多源 FEATURE mirror、translator 44/44、backend `FeatureMirrorFlow` 5/5、真栈两孔一次镜像 **14869.064 vs 14869.027 mm³** push+冷重开；UI 多源选择/编辑未做）**；面镜像/featurePattern 源未接，真实 PS 仍 blocked）；🟠 transform 首切片（ADR-0010，shared 1.36/1.38/1.45，2026-11-07：目标 body 平移/绕任意世界轴旋转/均匀缩放/非均匀 scaleAxes（先缩放→旋转→平移），`copy=true` 原件+副本 Unite；真栈旋转质心 (-5,15)、副本 **2000.000 mm³**、scale 2 **8000.000 mm³**/scale 0.5@(5,5,5) **125.000**、axes (2,1,0.5) **4000.000** 质心 (20,10,2.5)→@(5,5,5) 质心 (15,10,5)→axes 2+平移 **32000.000** 质心 (120,20,10)，均 push+重开；剪切/converter 未接，published artifact 仍 1.32；**UI 切片（2026-11-09）**：`TransformDialog` 按 XYZ 平动/世界 X-Y-Z 轴旋转/均匀缩放 + 复制；目标实体插入单选、编辑只读；自定义轴/旋转中心/缩放固定点只读保留；多分量禁改参、非均匀缩放禁编辑、零操作禁提交；复制明示 Unite 合并语义；后端 `previewOp` update/insert 白名单加 transform；单测 **6/6**、真栈 `e2e/transform-ui.spec.ts` **2 passed**——1000 → 平动+复制 **2000.000 mm³** 质心 (30,5,5) → 编辑旋转 **1000.000 mm³** 质心 (-5,15,5)，预览 data-dynamic=1，push+冷重开；能力翻 full）；🟠 splitPart 单侧世界平面首切片（ADR-0012，shared 1.39.0，2026-11-07：XY/YZ/XZ + offsetMm + keepSide；固定半空间大盒 Sweep + Intersect，不依赖 body bbox；真栈盒体 YZ x=10 正侧 **2000.000 mm³** 质心 (15,10,5) → 负侧 (5,10,5) push+重开；**UI 切片（2026-11-09）**：`SplitPartDialog` 目标实体 + XY/YZ/XZ 平面 + 偏移 + 保留正/负侧；面分割/保留工具/修剪面边界/双侧静态诚实提示；后端 `previewOp` 白名单加 splitPart；单测 **4/4**、真栈 `e2e/split-part-ui.spec.ts` **2 passed（45.8 s）**——YZ x=20 正侧 **2000.000 mm³** → 编辑 x=25 **1000.000 mm³**，插入/编辑预览 data-dynamic=1，push+冷重开；能力翻 full；双侧/面驱动/converter 未接）；🟠 moveFace 面偏移首切片（ADR-0014，shared 1.42/1.46，2026-11-07：持久面引用 `faces` + 单一 `distanceMm` 或逐面 `distancesMm`（正外扩/负内缩），内核 OffsetFaces；真栈盒体顶面 +5 **6000.000 mm³** 质心 z=7.5 → update −2 **3200.000** 质心 z=4；逐面顶 +5/右 +2 **6600.000** 质心 (11,10,7.5) → update [−2,−1] **3040.000**，均 push+重开；deleteFace 内核 0 回包、replaceFace IPC 未暴露——均 blocked-kernel；**UI 已接（2026-11-08 live 证据 + `MoveFaceDialog`：面+偏移/给定深度+距离，向内/向外，重新应用圆角禁用提示，逐面 distancesMm edit 只读；`moveFace` 能力 full；单测 7/7、真栈 `e2e/move-face-ui.spec.ts` 2 passed 盒体顶面 +5 **6000.000 mm³** 质心 (10,10,7.5) push+重开；web 1443/1443）**；converter 未接） |
| Markup | —（无模块；工具未注册） | ❌ 降级占位（`@itwin/core-markup` 依赖未配置——启用前需先补 workspace 依赖解析，T2.3 裁决：不预引依赖，等真实需求） |
| Measurement | `packages/viewer/src/tools/register-edit-tools.ts`（注册 core-frontend 测量工具） | ✅ 测量工具 |
| View Clip | `packages/viewer/src/tools/register-edit-tools.ts`（注册 core-frontend 裁剪工具） | ✅ 视图裁剪 |
| AccuDraw | `packages/viewer/src/tools/sketch-accu-snap.ts` + core-frontend AccuDraw | ✅ 精确绘图 |
| Version Control | `apps/web/src/modules/part-studio/hooks/useChangesets.ts` + `dialogs/PushChangesetDialog.tsx` | 🟠 Changeset/Named Version 可用；冲突检测 🟠（mock 数据）、冲突解决 ⚪（no-op 标记） |
| **Pattern (阵列)** | `packages/viewer/src/tools/register-edit-tools.ts`（LinearPattern/CircularPattern 注册；`basicManipulationIpc.insertGeometricElement` 直改通道） | ✅ 线性/圆形阵列（ID 收集 bug 已修+回归测试，RW2-T3） |

完整能力矩阵以上表与代码/测试实测为准（状态标记：✅/🟠/⚪/❌）

## 阵列工具 (Pattern Tools)

基于 `CopyElementsTool` 扩展实现，支持参数化输入和即时执行。

### 实现要点
- 继承 `CopyElementsTool` 复用元素复制和事务管理
- 覆盖 `requireAcceptForSelectionSetOperation = false` 实现选择后立即执行
- 覆盖 `wantDynamics = false` 禁用跟随光标的动态效果
- 使用 `BriefcaseTxns.onCommitted` 事件通知推送按钮状态更新
- 工具执行完成后自动退出 (`exitTool()`)

## 快速开始

```bash
# 1. 启动基础设施（本地 iModel 管理平台及其 Postgres/Azurite/Redis，仓外项目，见其自带编排）
# 2. 安装依赖并构建（首次或改动 itwinjs-core 后先跑 rush build --to …，见根 CLAUDE.md；
#    全新检出还需先构建 workspace 基座包——见 apps/web/README.md「先 build 后 dev」）
cd luban-cad && corepack pnpm@10 install
corepack pnpm@10 --filter @luban-cad/shared run build
corepack pnpm@10 --filter @itwin/editor-common --filter @itwin/editor-backend --filter @itwin/editor-frontend run build
corepack pnpm@10 --filter @luban-cad/viewer run build
cd apps/web && corepack pnpm@10 dev          # 前端 dev :5300（栈内部署经 nginx :5301）

# 3. 后台服务（源码在**仓外私有仓 luban-backend**，公开仓不检出也能跑：
#    公开仓走产物分发——scripts/fetch-backend.ps1 拉 Releases 产物后
#    scripts/start-ms-host.ps1 -Detach 起 MS :5401；webhook-agent 随
#    docker compose 容器跑 :5402。源码 dev 见该私有仓 README）
```

访问 http://localhost:5300

## 核心服务

- **modeling-server (5401)**：图形建模后台——打开模型文件、执行编辑建模命令、供渲染数据（Express + WebSocket RPC/IPC + Briefcase 管理）
- **webhook-agent (5402)**：Webhook 验签接收与转发、baseline 生成、CloudSqlite 上传

> 两服务源码均在**仓外私有仓 luban-backend**（产物经公开仓 GHCR 镜像 + GitHub Releases 分发，`scripts/fetch-backend.ps1` 拉取）；本仓只消费产物。

## 开发准则（强制）

### 1. 复用优先原则（最高优先级）

**所有功能开发必须先在 itwinjs-core 中查找是否已有实现或相关接口。**

- **工具类功能**：优先继承 `ElementSetTool`、`PrimitiveTool`、`CopyElementsTool` 等基类，而非从头实现
- **编辑操作**：使用 `basicManipulationIpc` 提供的标准 IPC 接口
- **几何计算**：使用 `@itwin/core-geometry` 提供的 `Transform`, `Matrix3d`, `Placement` 等类
- **事务管理**：使用 `BriefcaseConnection.saveChanges()` 和 `onCommitted` 事件
- **工具设置**：使用 `@itwin/appui-abstract` 的 `DialogProperty` 和 `supplyToolSettingsProperties()`
- **Undo/Redo**：使用 iTwin.js 内置的 `UndoTool`/`RedoTool`，监听 `BriefcaseTxns` 事件

**禁止事项**：
- 禁止在已有标准 API 的情况下自定义实现类似功能
- 禁止绕过 iTwin.js 工具生命周期自行管理工具状态
- 禁止使用自定义事件替代 iTwin.js 标准事件（如 `onCommitted`）

### 2. 修改 itwinjs-core
- 必须审查、最小修改、完整记录在 `docs/ITWINJS_CORE_MODIFICATIONS.md`（仓库根 docs/）
- 修改前必须确认无法通过扩展或配置实现目标

### 3. 功能不足时的流程
- 在 itwinjs-core 中搜索相关 API 和实现
- 查阅 `docs/iTwin.js-Tools-Complete-Reference.md`（仓库根 docs/）
- 分析现有功能是否可通过参数或继承满足需求
- 确认无法复用后，提出分析 → 讨论方案 → 评估影响 → 文档化 → 实施验证

### 4. 代码规范
- 组件: PascalCase, Hooks: camelCase, 类型: PascalCase
- 工具类必须继承标准基类，遵循其生命周期
- 工具 ID 必须唯一，使用 `public static override toolId = 'ToolName'`
- 必须实现 `requireWriteableTarget()` 当工具需要写入权限

### 5. 工具开发检查清单
- [ ] 是否搜索了 itwinjs-core 中的类似工具？
- [ ] 是否继承了合适的工具基类？
- [ ] 是否使用了标准 IPC 接口？
- [ ] 是否正确处理了事务保存？
- [ ] 是否遵循了工具生命周期（onInstall/onPostInstall/onCleanup）？
- [ ] 是否正确设置了工具属性（requireAcceptForSelectionSetOperation, wantDynamics 等）？

### 6. AI 工具注册规约（AI+CAD 平台）
- Agent 工具必须复用现有 `toolId`（`packages/viewer/src/tools/register-edit-tools.ts` 注册表 + app `Sketch.*`），禁止新建第二套建模 API
- Agent 操作与人工操作同权，必须走 BriefcaseTxns/saveChanges 事务管道（可撤销）
- 破坏性操作必须提供 HITL 确认流（预览→确认→提交）
- 架构规约见本节与 `../docs/Architecture.md`

## 文档

| 文档 | 说明 |
|------|------|
| [README.md](./README.md) | 项目介绍 |
| [docs/DEVELOPMENT-RULES.md](../docs/DEVELOPMENT-RULES.md) | 平台开发规则唯一权威（P0/P1） |
| [docs/architecture/AIRR-TEMPLATE.md](../docs/architecture/AIRR-TEMPLATE.md) | 功能开工 AIRR 模板 |
| [docs/architecture/INTERFACE-FREEZE-MATRIX.md](../docs/architecture/INTERFACE-FREEZE-MATRIX.md) | 接口冻结矩阵 |
| [docs/architecture/EXCEPTIONS.md](../docs/architecture/EXCEPTIONS.md) | 例外与债务 |
| [docs/Architecture.md](../docs/Architecture.md) | 系统架构 |
| [docs/ROADMAP.md](../docs/ROADMAP.md) | 演进路线 |
| [docs/ITWINJS_CORE_MODIFICATIONS.md](../docs/ITWINJS_CORE_MODIFICATIONS.md) | 上游修改记录 |
| [docs/README.md](../docs/README.md) | 文档总索引 |

## 调试

```powershell
# MS 宿主日志（start-ms-host.ps1 启动时写入）
Get-Content "$env:TEMP\luban-cad-modeling-server.log" -Tail 100 -Wait
```

## 验证基线（2026-11-09）

- **Intro Part 5/6 严格绿 / 单线面切分 + 源证据 no-op（2026-11-11，ADR-0006 D2，
  shared 1.66/1.67）**：`FaceExtrudeParams.splitByLine`（`region=material|void`、
  `keepPoint` 世界侧向消歧）+ 回放单线切分 resolver + 后端 `RegionOps` 面环/
  凸包空腔裁切；v1.67 `noOpEvidence` 仅允许 remove + 非空源证据，求值器校验
  body 作用域后原样透传上游（不进入工具/内核，非失败回退）。converter 用采集
  `sketches.json` 修正 SWEPT_FACE 派生草图平面；E1/E2/E4 用 bodydetails 面积+
  bbox+质心选多格面（标 approximate，体积精确）。Part 5 真栈逐步体积
  **98,322.384 / 245,805.960 / 262,193.024 / 229,418.896 / 204,838.300**，
  9 步树全 status=0，push+冷重开 **204,838.300 vs 204,838.300（0.000%）**。
  Part 6：E5 在 Onshape 前后 bodydetails 完全一致（16 面，面积/box/ID 全同），
  以显式 no-op remove 回放；最终 **188,451.236 vs 188,451.236（0.000%）**，
  8 步树全 status=0（2 个 faceExtrude：E3 void split、E5 no-op），push+冷重开
  一致；spec 升 strict。`/examples` 20→21，真实封面 `example-intro-part6.webp`
  （1600×900）。私有 index `replicable-now` **21**、`blocked-selector` **0**、
  `blocked-capability` **15**；Part 5/6 均标注 working-tree promotion（依赖
  未发布 shared 1.66/1.67/backend 与私有 converter/scenario）。后端
  `FaceExtrudeFlow` **26/26**（material/void/keepPoint/no-op/负路径）、
  `FeatureTypeRegistry` **30/30**、`FeatureRpcImpl` **20/20**；shared
  **203/203**、scenario-to-op **58/58**、split resolver 纯测 **6/6**、web 单测
  **1537/1537**、catalog 真栈 **5/5**；web/e2e tsc/lint 绿。公开 commit
  `04a9cde`（D2 能力）+ `75775ca`（Part 5 catalog），私有 commit `5d71633`；
  noOpEvidence/Part 6 切片未发布，发布前须重建 web 镜像。
- **Handle Parts 严格绿 / 多目标 fillet 真实验收（2026-11-11，ADR-0015 B6.3）**：
  Handle Parts 三体 **11,878.438 / 30,944.712 / 105,771.136 mm³** vs 采集
  11,878.505 / 30,931.280 / 105,770.915（+0.0006% / +0.043% / +0.0002%），
  整链 **148,594.286 vs 148,580.700（+0.009%）**，11 步树全 status=0，
  push+冷重开一致；spec 移除 `test.fail`。旧 Threaded Shaft +4.2% 的根因是
  converter 把 Linear pattern 1 的 `directionOne`（上游 revolve SWEPT_FACE）
  映射为草图线世界 +Z，15 个 remove 实例落在轴外（仅去材 27.993 mm³）；
  改为上游旋转轴 -X 后闭合。方向仍静态推导（`directionRisk`），不宣称通用
  面方向解析。`/examples` 21→22，新增真实封面 `example-handle-parts.webp`；
  私有 index `replicable-now` **22**、`blocked-kernel` **2**。
- **多目标 REMOVE extrude/hole（2026-11-11，ADR-0015 B6.2，shared 1.68）**：
  `targetBodyIds` 扩展到 throughAll REMOVE extrude/hole；后端
  `evaluateHoleInto`/`evaluateSweepFeatureInto` 返回值内核 + 逐 target 求值
  （任一失败整特征失败），`preEvaluateDirty`/`rebuildAll` 多目标分支与同步
  EDE fail-closed 已接；applyInsertMulti 补 sketch 解算/面域/sketch→feature 边。
  replay 由 booleanScope 造体源解析 targetBodyIds（跳过 sketch 源），并剔除
  regionRisk 多选区中的“孔内孤岛”。合成 T9g 两体 2.4/4.8 mm³、冷重建一致；
  Links 真栈几何 **10,039.240 / 11,704.087 vs 10,039.241 / 11,704.085**，
  6 步 status=0、push+冷重开一致；约束仍 dropped（slot FIX/OFFSET +
  external EQUAL），Links 保持 `blocked-converter`，不计 complete。后端全量
  **924 passed + 1 expected fail + 8 skipped**、shared **203/203**、
  scenario-to-op **59/59**；公开 spec `links-multi-remove.spec.ts`。
- **Onshape API 配额（2026-11-11 实测）**：features 采集 supervisor 在
  2026-11-10T15:48Z 收到 429 `retry-after=75616s`（约 21 小时），已按
  retry-after 休眠；A1/A2/A4 采集在该窗口前暂停，不绕限流、不伪造数据。
- **imprint 有向边左/右侧（2026-11-09，ADR-0006 切片 E）**：Onshape
  `topologyDisambiguation([[edge,±1]])` 的 +1/−1 = 有向草图边左/右侧，不是旧的
  “−1 环外/+1 环内”。shared `sketch/imprint-region.ts` 单一实现（line/arc/circle、
  孔边界、同侧歧义回退）；公共 `run.ts` 与后端 `test/ScenarioReplay.ts` 接入；
  converter 解码 qCompressed 后取符号。shared **180/180**、backend
  `ScenarioReplayParity` **7/7**；真栈 Tutorial 2 First Part **357566.084 vs
  357568.177（0.0006%）2 passed**（原 known-red 关闭）、Alignment 8915.890 vs
  8915.860、WARNING LABEL 0.8193532、iOS 离线 157478.895。索引 strict
  `replicable-now` **2 → 7**（First Part + WARNING LABEL ×4 + Wheel +
  Master Cylinder Piston），imprint 近似 blocker **47 → 14**（剩余为 regionRisk，
  不是边侧语义）。无 RPC 载荷/`interfaceVersion` 变更。
- **CAP_FACE 起始面（P2.1，2026-11-09）**：converter 对上游 NEW/blind 拉伸帽面
  导出 `capFaceExtrude`（上游草图/面域 + startOffset=上游 depth），translator
  映射既有 `extrude` 的 startOffset+draft；不再误标 imprintFace/region 0。
  Bumper Block：Extrude 1 360,000 → Extrude 2 **657,764.787** mm³（+297,764.787）。
  **2026-11-10 回滚快照 oracle 切片**：新增 test-only
  `manifest/face-oracle-edges.json`（私有、运行时加载；公共源码不含私有
  id/绝对路径）+ `rollback-edge-oracle.ts` 几何唯一匹配 + 可选 runner
  `edgeOracle`（缺省不启用，默认路径不变；18 条纯匹配单测）。
  oracle 本身仍是**部分能力**：86/122 候选特征 ready、36 blocked
  （不支持曲线类型）、0/86 ready 覆盖全部 body 边；不能当作通用选择器替代。
  `run-file` 新增 `statusPolicy:'record'`（严格轨缺省仍 fail closed）与 push
  后冷重开 status=0 严格断言。无 RPC/产物变更。
  **2026-11-10 A3/A4（ADR-0016 S10 精确轨，未推送）**：converter 对
  `entities` profile 槽、`startOffset=false`/`startOffsetEntity` 空的 CAP_FACE
  特征输出 `capFaceProfile`（起始面平面 + Onshape 面积/AABB 证据）；公共 runner
  在步骤时点用 `readFaceHandles` 唯一匹配（平面/法向/面积/AABB）→
  `resolveFaceRef` → 产品 `faceExtrude`（startOffset=0、10° 收窄、
  `draftPullDirection=true`、depth 40）。Bumper 真栈：pre-fillet
  **657,764.787185 mm³**、body 20/20 边全为 line（无 curvePrimitive）、
  rb=3 oracle **16/16**、最终 **636,731.650 vs 636,731.499 mm³（+0.000024%）**、
  6 特征全 status=0（push 前/冷重开）、1 body、push+冷重开一致、
  approximateSteps=0。
  **证据更正（ADR-0016 / AIRR 已修订）**：Onshape `Fillet 1` 实际只选
  **16 条边**；底面 4 条 z=0 loop 边是**尖边**（最终 body 为 16 个 R5 圆角柱面，
  仅 4 条竖边的 R5 柱面延伸到 z=0，**无底环 R5 面**；live 截图底边为直尖边），
  oracle 的 16/20 是**完整选择**而非缺口。旧审计 20 边回退（634,347.216，
  −0.374%）多选了底面环，已从 strict spec 移除；ADR-0016/AIRR 的“oracle 20/20
  （含底面 loop）”门已修订为 **16/16（覆盖全部实际选择边）+ 底面 loop 尖边**。
  证据：私有 final bodydetails 快照 + live 截图
  crop `ui-evidence/bumper-block-live-20261106/crop-bottom.png`。
  **索引口径（2026-11-10 发布闭口）**：私有 `manifest/example-index.json`
  `replicable-now` **18**——Bumper 为第 18 例，条目携带
  `strictPath=rb3-oracle-16/16`、`requiresBackend=backend-20261110`、
  `genericResolver=12-edge blocked`；私有 converter/oracle/scenario 已提交，
  A1/A2 backend 随 `backend-20261110` 发布。公开 strict spec **19**（含 A2
  face-extrude、Bumper S10 严格轨与 iOS First Part）。iOS 用
  `EXAMPLE_RESET=1` 真栈 **2 passed（1.9m）**：157,478.736 vs 157,478.9
  （0.0001%）、树全 status=0、1 body、push+冷重开。generic resolver 仍为
  12 边 blocked-kernel，是独立限制，不得把 strict oracle 轨说成通用能力。
- `apps/web` 全量 vitest：**1527/1527**（2026-11-09 body pattern 反向 UI +1
  （FeatureDialog 179/179；真栈 3×3 720.000 反向质心 x=-6 push+冷重开）；
  body pattern 第二方向 UI +3
  （FeatureDialog 179/179；真栈 3×2 480.000→编辑 3×3 720.000 push+冷重开）；
  SplitPart UI +4（SplitPartDialog 4/4；真栈 YZ x=20 正侧 2000.000→
  编辑 x=25 1000.000 push+冷重开）；Transform UI +6
  （TransformDialog 6/6；真栈 1000→平动+复制 2000.000→编辑旋转 1000.000
  push+冷重开）；featurePattern 多源编辑 UI +1
  （FeaturePatternDialog 12/12；真栈两凸台多源 3→2 16320.000 mm³ push+冷重开、
  同 spec 4 passed）；第二方向编辑 UI +3（真栈 3×2→3×3 16720.000 mm³）；
  2026-11-08 WARNING LABEL 真栈专项
  `warning-label-scenario` 2 passed（0.8193532 mm³，equal arc/arc；SolverTypes 45/45）、
  hole upToNext +1
  （HoleDialog 11；shared 1.56.0；后端 HoleFlow 10/10、SteppedFlow 1/1
  （逐孔目标面/点-面精确包含）、ScenarioReplayParity 6/6；translator 40/40；
  converter 映射；真栈去材 196.349 vs 196.350 mm³）、
  extrude THIN 中间平面 +2
  （shared 1.55.0；FeatureDialog 176；后端 ExtrudeThinWallFlow 7/7；真栈
  `extrude-thin-wall-ui` 4 passed 含 midplane **400 mm³** push+重开）、
  extrude upToSurface 偏移距离 +3
  （shared 1.54.0；FeatureDialog 174；后端 UpToSurfaceFlow 12/12；真栈
  `extrude-up-to-surface-offset-ui` 2 passed **1700 mm³** push+重开）、
  extrude upToNext UI +1
  （FeatureDialog 171；真栈 1500 mm³）、extrude THIN 薄壁 UI +3
  （FeatureDialog 170；真栈 360 mm³）、extrude upToSurface UI +3
  （FeatureDialog 167；真栈 1500 mm³）、featureMirror 选择 UI +4
  （FeatureDialog 164；真栈板+凸台 YZ 特征镜像 16565.486 mm³ push+重开）、
  extrude 拔模 +6（shared 1.51.0：draftAngleDeg/draftPullDirection；FeatureDialog 160；拔模锥台预览 feature-preview 10/10（含孔环收缩）+ 真栈预览叠层可见；真栈 10°→1394.109、编辑 5°→1185.18 mm³ push+重开；后端 ExtrudeDraftFlow 4/4、ScenarioReplayParity 4/4；converter 解除阻塞但方向符号标 approximate）、
  **extrude upToSurface 首切片（ADR-0005 Phase 5，shared 1.52.0）**：`endFaceRef` 持久面引用
  → 后端每求值周期动态解析平行平面目标面（不落库），同步求值缺失即 status=1；后端
  `UpToSurfaceFlow` **5/5**（板 2000 → upToSurface remove **1500.000 mm³**、冷重建 1500、
  失效/非平行拒收、schema 8 组）；真栈 `e2e/extrude-up-to-surface.spec.ts` **2 passed**
  （faceRef=(1,6)、push+冷重开）；**UI 已接**（终止条件「成形到面」+ 唯一选中面快照 +
  无面/多选禁用 + edit 回显；真栈 `e2e/extrude-up-to-surface-ui.spec.ts` **2 passed**，
  web **1487/1487**、FeatureDialog **167/167**）；薄壁/upToNext 已接（见下条）；upToVertex 契约+后端+真栈已接（Phase 7，UI/converter 未做）；
  **extrude THIN 薄壁（ADR-0005 Phase 6，shared 1.53.0；2026-11-08 含孔+中间平面增补）**：
  `bodyType=THIN` + `thinThicknessMm` 单侧向内厚度（CurveOps 内偏置环 Sweep，外环−内环；
  含孔面域=外环带减孔实体 + 孔壁带外扩并与外形求交）；v1.55 `thinMidPlane` 厚度以边界
  为中心向两侧各半；UI 实体/薄壁页签 + 中间平面复选 + 壁厚输入（曲面禁用，冲突控件复位）；
  后端 `ExtrudeThinWallFlow` **7/7**（4×4+r0.5 孔 t0.5/depth2 **18.712 mm³**；10×10
  t1 midplane **400 mm³**）、真栈 `e2e/extrude-thin-wall-ui.spec.ts` **4 passed（1.1 min）**
  （360/400/18.712 push+重开）、web **1497/1497**、FeatureDialog **176/176**；
  **upToNext 已接**（同日：枚举上游 BRep 面取最近平行面；终止条件「成形到下一个面」
  无需选面；`UpToSurfaceFlow` 组合 **8/8**、真栈 `extrude-up-to-next-ui` **2 passed**
  1500 mm³ push+重开；web **1491/1491**、FeatureDialog **171/171**；
  **回放链路**：translator `up_to_next` 直通（不再 blind 近似）**38/38**、后端
  `ScenarioReplayParity` **5/5**、真栈 `extrude-up-to-next-scenario` **2 passed**
  1500 mm³ push+重开）；含孔/中间平面已接（见上条）；双厚度 `thickness2` 语料非零 0 例（暂缓），SURFACE bodyType 59 特征/13 PS 为 blocked-kernel（实体单链不支持开放曲面体）；mirror/pattern 改参预览 +2（FeatureDialog 156；真栈双击树行编辑 data-dynamic=1、取消化零写）、booleanBodies 插入预览 +1（FeatureDialog 154；真栈相交 1.000 mm³ data-dynamic=1）、mirror/pattern 插入预览 +2（真栈镜像相交 2000 mm³、居中阵列 400 mm³ 均 data-dynamic=1）、loft/sweep 插入预览 +2（真栈 2427.581 mm³ push+重开）、hole 钻尖角 118°/反向下拉 +2（HoleDialog 10；真栈盲孔去材 88.371 mm³、反向零去材）、hole 改参预览 +1（真栈孔去材 196.349 mm³、data-dynamic=1）；chamfer 改参预览 +1（FeatureDialog 149；真栈 iOS 倒角 157478.9 mm³、data-dynamic=1）；featurePattern 改参预览 +1（后端影子求值→TileRpc，真栈 data-dynamic=1；FeaturePatternFlow 8/8）与居中开关（真栈 16320→16400 mm³）；BODY_PRODUCING_FEATURE_TYPES 守卫 +3（featurePattern 树行抑制/删除真栈 3 passed，删除再生 known-red）；零件段逐 body 体积 +5；featurePattern 编辑对话框 +6；body pattern 居中 UI +4；2026-11-07 moveFace UI、mirror operation 真栈；Transform scaleAxes 真栈；cPlane THREE_POINT +2、LINE_POINT +3；W1.2b 能力 gated 审计 11 项（原 7 项 + wrap/decal/modifyFillet/userFeatures 续审计）；cPlane LINE_ANGLE +4；2026-11-06 图形首选项默认值校正：AO 20%、
  线宽 2px、v2→v3 迁移 +2；2026-11-05 UI polish：GraphicsPreferencesDialog 5、
  AppearancesPanel 3、useBodyAppearanceOverrides 2、Ribbon 父行/快捷键 1、ViewCube
  标准视图/自由视角 1、Front 面轴原点 1、动画相机 1、viewcube-mode 5；ViewCube/Dock/display-actions
  断言同步更新；此前 cPlane +17、SketchDialog 偏移平面编辑、FeatureDialog endBound、
  chamfer 三种模式/编辑回显；FeatureDialog 单文件 144，含 v1.48 镜像操作/编辑回显）；
  shared **170**、editor 29、viewer 127；`tsc`（含 e2e）/lint 绿。
- **extrude upToSurface 偏移距离（ADR-0005 Phase 5 增补，2026-11-08，shared 1.54.0）**：
  `ExtrudeParams.endOffsetMm (>0) + endOffsetOppositeDirection`，仅 `endBound=upToSurface`
  合法；目标面平面沿拉伸方向平移 ±offset 后再扣 `startOffsetMm`，非正距离 status=1。
  UI 成形到面下「偏移距离」复选 + 距离 + 反向（edit 回显/关闭删旧键）。后端
  `UpToSurfaceFlow` **12/12**（加材 2500、反向去材 1700、updateParams 往返、schema 5 组）；
  shared **170/170**、web **1494/1494**（FeatureDialog **174/174**）；真栈
  `e2e/extrude-up-to-surface-offset-ui.spec.ts` **2 passed（1.1 min）**——板 20×20×5
  顶面偏移反向 2 → **1700.000 mm³**，push+冷重开一致。converter 仍不映射 upToSurface
  （目标面查询未采集）；偏移与 upToNext 组合未做。
- **extrude upToVertex（ADR-0005 Phase 7，2026-11-09，shared 1.60.0）**：
  `ExtrudeParams.endVertexRef`（`{sketchId, entityId, part}`，目标顶点可属另一张草图）；
  后端按顶点世界坐标在拉伸方向上的投影减 `startOffsetMm` 求动态深度；仅
  `endBound=upToVertex` 合法且须带 `sketchId`，与 symmetric/draft/THIN/
  secondDirection/endFaceRef/endOffsetMm 互斥；失效引用/非正深度 status=1。
  后端 `UpToVertexFlow` **6/6**（板 2000 → 深度 3 remove **1700 mm³**、冷重建、
  坏引用/零深度拒收、schema 9 组）；真栈 `e2e/extrude-up-to-vertex.spec.ts`
  **2 passed（39.1 s）**——5 行树全 status=0、**1700.000 mm³** push+冷重开；
  shared **170/170**。converter/translator（test-only）已接：单条 SKETCH_ENTITY 顶点
  查询→`endVertexRef`（CAP_VERTEX/派生/多查询如实 dropped），translator **47/47**；
  batch 重转 164 场景计数不变（7/12/7/75/50/48），13 个含 UP_TO_VERTEX 的 PS 仍被
  草图平面/imprint/laserJoint 等阻塞，无新增绿例。UI「成形到顶点」未做（不渲染假控件）。
- **featurePattern 第二方向（ADR-0007 切片 10，2026-11-09，shared 1.61.0）**：
  `FeaturePatternParams.secondDirection`（linear；count/spacing/centered/axis；总实例
  ≤1000）；后端网格变换/校验、translator 透传、converter raw SecondDir 映射
  （directionTwo 不可解析时仍 blocked）。后端 `FeaturePatternFlow` **10/10**、
  translator **48/48**、真栈 `feature-pattern.spec.ts --grep 第二方向` **2 passed
  （38.6 s）**——凸台 3×2 网格 **16480.000 mm³** push+冷重开。**切片 11 UI（2026-11-09）**：
  `FeaturePatternDialog` 编辑已落库的 secondDirection（count/spacing/centered，
  轴只读；取消勾选移除键；切圆周取消；总实例/域校验）；单测 **11/11**、真栈
  `feature-pattern-edit-ui.spec.ts` **3 passed（1.4 min）**——3×2→3×3
  **16720.000 mm³** push+冷重开；web **1518/1518**。无落库轴时新增第二方向未做。
  **切片 12 多源编辑（2026-11-09）**：`sourceFeatureIds` 只读 chips 全量回显，
  多源不再误判源缺失；updateParams 按落库形状保形（多源不发 sourceFeatureId）；
  单测 **12/12**、真栈同 spec **4 passed（1.9 min）**——两凸台多源 3→2
  **16320.000 mm³** push+冷重开；web **1519/1519**。多源增删/重排未做
  （需特征选择器与 live 证据）。
- **body pattern 第二方向/反向（ADR-0007 切片 13/14，2026-11-09，shared
  1.62/1.63）**：`PatternParams.secondDirection`（linear 网格，总实例 ≤1000）与
  `oppositeDirection`（linear 第一方向反向，圆周拒收）。后端 `PatternFlow`
  **23/23**（3×2 网格 48 mm³、反向 bbox x∈[-20,2]、拒收矩阵）、formFields/
  一致性测试；FeatureDialog pattern 通道「第二个方向」「反向」控件转正
  （居中每侧 N；圆周自动取消；编辑回显）；FeatureDialog **179/179**、
  shared **171/171**、web **1527/1527**、tsc/e2e tsc/lint 绿；真栈
  `e2e/pattern-second-direction-ui.spec.ts` **2 passed（46.5 s）**——4×4×5 盒
  3×2 **480.000 mm³** 质心 (14,8,2.5) → 编辑 3×3 **720.000 mm³** 质心
  (14,9,2.5) → 勾选反向质心 x=-6，插入/编辑预览 data-dynamic=1，push+冷重开。
  per-instance skip、圆周第二方向/反向、converter 未做。
- **featureMirror 特征级镜像（ADR-0011 切片 3，2026-11-07，shared 1.47.0）**：
  `FeatureMirrorParams {sourceFeatureId, planeLine}`；后端读取源特征前/后缓存差集 →
  反射 → 按源操作 Unite/Subtract（源限 extrude/revolve/hole add/remove，NEW/草图/
  失效源拒收）。`FeatureMirrorFlow` **4/4**（含插入预览）；scenario schema/validator + translator
  **26/26**；真栈 `e2e/feature-mirror.spec.ts` **2 passed**（板+孔切除镜像
  **15434.514** vs 15434.513 mm³，push+重开）。converter 仅映射单源 FEATURE mirror；
  多源/跨 body 源如实 dropped，FEATURE_ALL 整 body 镜像标
  `featureAllApproximation`。真实 PS dfc6e33c/006ab003 blocked-capability：
  Mirror 1 三源跨两 body（含 featurePattern），丢后 65,675.220/14,544.246 vs 采集
  64,831.091/13,917.196。**UI 已接（ADR-0011 切片 5，2026-11-08 live 证据）**：
  镜像范围 零件/特征、源特征下拉（树内未抑制 extrude/revolve/hole）、世界平面
  XY/YZ/XZ → planeLine；特征作用域隐藏镜像操作页签/FACE 选项，无源禁用；侧栏编辑
  诚实 Info toast（无 updateParams）。真栈 `e2e/feature-mirror-ui.spec.ts`
  **2 passed（56.2 s）**：板+顶面凸台（add，NEW 体不可作源）YZ x=20 →
  **16565.486** vs 16000+2×90π mm³ push+重开；插入预览 `data-dynamic=1`
  （后端 previewOp 白名单扩 featureMirror）；`FeatureMirrorFlow` **4/4**、
  FeatureDialog **164/164**、web **1484/1484**。面镜像/多源/featurePattern 源未做。
  后端全量 **883 passed / 1 expected fail / 8 skipped**（101 files，2026-11-09
  body pattern 反向/第二方向后；ExtrudeDraftFlow (d) 并行偶发 5s 超时、单跑 4/4，已知 flake；
  featurePattern 多源后；
  upToNext 回放链路后；`SketchProjectionFlow` 并行下偶发默认 5s 超时（单跑 **4/4**），
  非几何失败，已知 flake；
  mirror operation formFields + 圆 SWEPT_EDGE 消歧 + featurePattern centered 后；
  expected fail = Drive Sleeve 离线回放 known-red；自述 TEMP 的 Bumper 探针已移出
  vitest glob）。
- **示例 iModel 回归（2026-11-09）**：shared 1.58 / backend 866 / MS 重启后，
  `e2e/examples/verify-imodels.spec.ts`（state 驱动）**14/14 passed（2.5 min）**，
  13 个示例 iModel 的树/body/体积读回不变。
- **示例 iModel 回归（2026-11-09 第二方向后）**：shared 1.61 / backend 876 / MS 重启后，
  `e2e/examples/verify-imodels.spec.ts`（state 驱动）**14/14 passed（2.5 min）**，
  13 个示例 iModel 的树/body/体积读回不变（pattern 变换扩展无回归）。
- **示例 iModel 回归（2026-11-09 body pattern 第二方向后）**：shared 1.62 /
  backend 882 / MS 重启后，`verify-imodels` **14/14 passed（2.5 min）**——13 个
  示例 iModel 树/body/体积读回不变（additive PatternParams 字段无回归）。
- **featureMirror 多源（2026-11-09，shared 1.58.0）**：`FeatureMirrorParams.sourceFeatureIds`
  与单源恰一；后端逐源差集反射并按源操作应用；converter FEATURE 多源不再 dropped、
  translator 44/44；backend `FeatureMirrorFlow` 5/5、真栈
  `e2e/feature-mirror.spec.ts` **3 passed（1.4 min）**——两孔一次镜像
  **14869.064 vs 14869.027 mm³**，树/status/push+冷重开一致；web **1503/1503**。
  UI 多源选择/编辑未做（侧栏 featureMirror 编辑诚实拒收）。
- **Sketch.TangentArc 相切圆弧（2026-11-09）**：线端点+终点反解切圆，arc +
  coincident + tangent；真栈 `e2e/sketch-tangent-arc.spec.ts` **2 passed（52.8 s）**，
  web **1509/1509**；链式弧/弧源/面边源未做。
- **Sketch.PerimeterCircle 周边圆（2026-11-09）**：三点定圆（`Arc3d.createCircularStartMiddleEnd`
  求 center/radius），提交 1 整圆、不生成圆心点；共线/重合判退；实时读数弦长→半径；
  flyout 占位退役；真栈 `e2e/sketch-perimeter-circle.spec.ts` **2 passed（48.8 s）**
  （三点 → 1 circle r≈10/center≈(0,0)、finish+reload 重开仍在），
  `SketchCreateTool` **14/14**、web **1511/1511**；三点持久拖动引用/尺寸即时输入未做。
- **正多边形工具（2026-11-09）**：`sketchInscribedPolygon`（内切，主钮）/
  `sketchCircumscribedPolygon`（外切，飞菜单），Onshape Help 证据；圆心+构造圆半径点后
  键盘输入 3–50 边（默认 6）、Enter/第三次点击提交；1 construction 圆 + N 线 +
  N coincident/N−1 equal/N angle(2π/N)；两占位退役。真栈
  `e2e/sketch-polygon.spec.ts` **3 passed（1.5 min）**（内切/外切各 5 边、finish+reload），
  `SketchCreateTool` **16/16**、`Ribbon` **16/16**、web **1513/1513**。
  **同批修复**：`RibbonDropdown` 激活菜单行后不再把焦点还给箭头，否则工具内 Enter
  会触发箭头默认 click 重开飞菜单挡住完成按钮；`Ribbon.test` 已加焦点断言。
  未做：构造圆与多边形求解联动、光标连续调边数、多边形整体选择/拖动。
- **Sketch.Bezier 贝塞尔曲线（2026-11-09）**：4 控制点 → spline DTO；
  真栈 `e2e/sketch-bezier.spec.ts` **2 passed（49.1 s）**（4 controlPoints/2 fitPoints/
  2 coincident、finish+reload），web **1509/1509**。
- **Sketch.CenterArc 中心点圆弧（2026-11-09）**：圆心→起点→终点；真栈
  `e2e/sketch-center-arc.spec.ts` **2 passed（47.9 s）**（r≈10、sweep≈π/2、
  finish+reload），web **1509/1509**；超半圆方向消歧未做。
- **Sketch.AlignedRectangle 对齐矩形（2026-11-09）**：三点（边角度/长度 + 垂直
  高度），flyout 占位退役；真栈 `e2e/sketch-aligned-rectangle.spec.ts`
  **2 passed（47.6 s）**（4 线、10×5、无 point、finish+reload），web **1503/1503**。
- **Sketch.CenterRectangle 中心矩形（2026-11-09）**：复用拐角矩形轴对齐草稿，
  中心反射对角点；真栈 `e2e/sketch-center-rectangle.spec.ts` **2 passed（46.1 s）**
  （4 线+中心点、包围盒 20×10、finish+reload），web **1503/1503**。
- **Sketch.Point 草图点工具（2026-11-09）**：ribbon 占位 `sketchPoint` 退役，
  AccuSnap→草图平面局部坐标→`applyUpdate` 连续放点；自动推断点端点 coincident /
  点在线/点在整圆 coincident（point-on-line/point-on-circle 求解通道）；真栈
  `e2e/sketch-point-tool.spec.ts` **2 passed（52.9 s）**（先画线→点在线内/端点→
  2 point+2 coincident+finish+reload），web **1509/1509**、lint/tsc/e2e tsc 绿；
  孔位集成 `e2e/sketch-point-hole.spec.ts` **2 passed（47.6 s）**（点→throughAll
  去材 196.339 vs 196.350 mm³）。
- **Sketch Mirror 弧支持（2026-11-09）**：mirror 约束 refs 扩展 `arc+arc+line`
  （SolverTypes/Normalizer/SlvsSolver 圆心+起/终点三对点；spline 仍拒收）；
  前端反射弧圆心/起/终点、扫角取反 + 预览；后端 solver/normalizer **97/97**
  （含 arc mirror 收敛用例）、前端镜像逻辑 **6/6**、真栈
  `e2e/sketch-mirror-tool.spec.ts` **2 passed（1.4 min）**（线/圆/弧 + reload）。
- **Sketch Mirror 样条支持（2026-11-09）**：mirror refs 扩展 `spline+spline+line`
  （四个控制点 SYMMETRIC_LINE；periodic/非三次拒收）；镜像专用拾取
  `resolveNearestMirrorSeedId`（三次 Bezier 采样）+ 预览；后端 solver/normalizer
  **98/98**（含 spline mirror 收敛用例）、前端镜像逻辑 **8/8**、真栈
  `e2e/sketch-mirror-tool.spec.ts` **2 passed（1.7 min）**（线/圆/弧/样条 + reload）；
  backend 全量 **876 passed / 1 expected fail / 8 skipped**、web **1515/1515**。
- **Sketch Mirror UI（2026-11-09）**：`Sketch.Mirror`（ribbon 占位退役）两相
  轴线/实体；line/point/circle 即时镜像走 `applyUpdate`（circle=圆心对称 +
  equal 等半径），拒收 arc/spline；真栈 `e2e/sketch-mirror-tool.spec.ts`
  **2 passed（1.1 min）**：3 线 + mirror refs[2,3,1]，整圆镜像 2 圆/2 mirror +
  1 equal，finish + reload 重开仍在；单测 **6/6**；web **1503/1503**。
- **MIRROR 约束 + Wheel 真栈（2026-11-09，shared 1.57.0）**：`SketchConstraintDto.kind
  + "mirror"`（端点对/整线关于轴线镜像，refs=[源,镜像副本,轴线]）；后端
  SolverTypes/Normalizer/SlvsSolver 全链，`SLVS_C_SYMMETRIC_LINE` + 初值反射检查；
  converter MIRROR 端点对映射、CENTERLINE_DIMENSION 直径语义（值/2）。真栈
  `e2e/examples/replay/wheel-scenario.spec.ts` **2 passed（58.7 s）**：
  Exercise: Basic Drawing / Wheel 1 body **2442291.05 vs 2442293.76 mm³**
  （1.1e-6 相对）push+冷重开；converter 状态 complete、dropped=[]。
  **性能修复**：`getMassProperties` 细分 1e-6/0.002 → **1e-4/0.02**，Wheel
  冷算 156 s→2 s（体积误差 1.1e-6，WARNING LABEL 0.8193532 不变）；batch 重转
  164 场景 → complete 7 / geometry 12 / smoke 7 / blocked 75 / failed 50 /
  skipped 48（Drive Sleeve×2 仅 converter complete；几何仍 imprintFace known-red）。
  UP_TO_ENTITY 孔按 holeDepthComputed 静态深度映射 blind + endApprox（近似，
  translator 42/42），真实 PS 仍被其它缺口阻塞。标准 4-ref OFFSET 约束按几何
  反推偏移距映射；2 点样条 `.0/.1.internal` 端点已映射，First Part 48 约束全入树、
  converter complete，但真栈 **352290.918 vs 357568.177 mm³（−1.476%）known-red**
  （skipSketchConstraints 同体积，imprintFace 根因，非约束）。
  Bumper Block 已由严格轨（rb=3 oracle）转绿（2026-11-10）；Handle Parts 于
  2026-11-11 strict 绿（根因是 linearPattern SWEPT_FACE 方向，不是 fillet）；
  空 external query 的 MIDPOINT/DISTANCE 已按 origin 映射。WARNING LABEL 文档族
  四份同名 PS 均真栈 0.8193532 mm³（变体 spec 3 passed，
  首轮两条为 MS 限流/冷开失败，干净窗口全绿）。MIRROR 的 UI 槽位/草图镜像工具
  仍无 live 证据（未做）。
- **示例回放基础设施（test-only，2026-11-07）**：imprintFace 改为“已解析面域照用、
  未解析查询标 partial”（取消整步回退 region 0）；fillet/chamfer 多体由选中边所属
  body 显式 `targetBodyId`（跨 body/失效体阻塞）；converter 新增 linear FACE/FEATURE
  pattern（directionRisk 标近似）与 CAP_FACE 镜像面 planeLine 推导；
  `scenario-to-op` **28/28**、纯回放辅助 **12/12**。Drive Sleeve 场景 spec 以
  `test.fail` 登记 known-red：backend 离线回放 Extrude 1/2/3
  264448.7→688721.7→790461.9 mm³，最终 **774611.7 vs 1175024.3（−34.08%）**；
  web 真栈失败在 featurePattern 求值（MS `内核 op 失败: op=1 status=0`，树
  status≠0）——imprintFace 基础轮廓近似。**hub 恢复后复跑**：handle/
  sample-assignment/hand-brake **4 passed**、feature-mirror **2 passed**
  （15434.514 mm³）；Universal Joint Assembly 在 Chamfer 10 的 boolean 面交线
  sweptFace 阻塞（上游 1,690,675 vs 期望 602,047 mm³）；Universal Joint Drawing
  在 Extrude 11 草图 0 面域拒收。MS 需源码模式启动（`start-ms-host.ps1 -Source ...`）；
  hub 限流 100/15min，scenario 批跑需留窗口（实测 retryAfter 119s）。
- **featurePattern 树行编辑 UI（ADR-0007 切片 8，2026-11-08）**：新增
  `FeaturePatternDialog`——树行双击打开，`sourceFeatureId`/`axis` 作为
  updateParams 结构引用只读，可改 kind/count/spacing?/angle?，centered 保持
  落库值并强制总数奇数；不渲染无产品通道的方向/面拾取假控件。树类型词条补
  featurePattern/featureMirror/moveFace/faceExtrude/transform/splitPart。
  单测 **6/6**；真栈 `e2e/feature-pattern-edit-ui.spec.ts` **2 passed**——
  16240 mm³ → 实例数 3→4 → **16320.000 mm³**，树/status/push+重开一致。
  preview 未接：后端 `PreviewResult.preview` 仅 insertFeature fillet 生成几何，
  featurePattern updateParams 只回 affected——不渲染假 overlay。
- **第二方向 UP_TO_SURFACE 静态近似（test-only，2026-11-08，ADR-0003）**：
  converter 把 `secondDirectionBound=UP_TO_SURFACE` 按已解算
  `secondDirectionDepth` 转 `blind + approximate + sourceBound`；translator
  标 approximate 并记 note（产品 up-to 仍未实现）。translator **35/35**；
  合成真栈 `e2e/examples/replay/extrude-second-direction-approximate.spec.ts`
  **2 passed**（20×20 拉伸 10 + 第二方向 5 = **6000 mm³**，push+重开）。
  Stirrup 真实 PS 仍 known-red，根因已定位为 **imprint −1 补集面未实现**：
  Sketch 2 为 3 个不相交 9×20 矩形，Extrude 2 的 e7/e12 sign=−1 被回放选成
  相邻矩形区域（只去材 **500.171 mm³**；Onshape 切实体端面上的圆面减三矩形
  孔的补集面），导致 Fillet 2 CAP_EDGE matches=0；前缀体积 15707.942→
  14660.744→14160.573→…→12495.533（−17.3%）。证据：私有仓
  `ui-evidence/stirrup-20261108/`；ADR-0006「Stirrup imprint 补集面」。
- **零件段逐 body 体积（W1.5b，2026-11-08）**：`useBodyMassProperties`
  （只读 `getMassProperties`，scope=`activeModelId`，随 entries 刷新；失败/
  无连接不阻塞树）；`activeBodyParts` 映射 `volumeMm3`；TreeRow 零件行显示
  千分位体积文案（title 可访问名），N>1 多体逐行可见。单测 activeBodyParts/
  TreeRow 2 + hook 3；真栈 `e2e/per-body-volume-ui.spec.ts` **2 passed**——
  两体 **500.000 / 4000.000 mm³**，push+重开仍在。
- **revolve 轮廓实体→真实面域（test-only，2026-11-08，ADR-0003）**：converter 对
  单 query revolve 旧口径盲取 `regionIndex:0`，同草图多 NEW revolve 全落同一面域
  （Handle Parts 三轮廓 2/8/5）。converter 增 `revolve.profileEntityIds`
  （`findSketchEntityForQuery` 全解析才携带）；`region-entity-resolver.ts` 按
  `SketchRegionDto.outerEntityIds/holeEntityIds` 映射面域（显式 regions 优先，
  未命中/共享边界歧义不猜、退回旧口径标近似），Playwright 单测 **6/6**；
  `resolveScenarioEdges` 增 bodyScope（selector.operationSourceIds → 当前 body
  谱系收窄候选体），多体共享顶点/圆边不再跨 body 误配。真栈 Handle Parts
  前置 10 特征跑通；Fillet 1 的 6 条 SWEPT_EDGE 分属 3 body，后由 ADR-0015
  `targetBodyIds` + 逐 body BlendEdges 支持，2026-11-11 strict 绿（详见下方
  多目标段；旧 +4.2% 实为 pattern 方向映射）。回归：
  Handle/Hand Brake 真栈绿、纯回放 **73/73**。**Universal Joint Drawing 面边界
  验收**：Chamfer 10 的 sweptFace 在未裁剪面展开 4 条边通过；entity 10
  匹配 0 条，调试证据为最终体全部边 x ≤ 0（存在镜像侧对应边）、正侧几何
  整体缺失——上游 Extrude 10/11/12 region/imprint 体分叉（Mirror 1 在
  Chamfer 之后），非单纯面裁剪；`test.fail` known-red。缺口收窄为
  「上游体分叉 + 缺失面解析」。
- **imprintFace A1（test-only，2026-11-07）**：`imprint-face-resolver.ts` 用
  dev-only 面枚举 + 区域环面积/质心匹配 + `resolveFaceRef`；非 NEW 单区域
  imprintFace 命中整面时改走产品 `faceExtrude`。合成真栈
  `e2e/examples/imprint-face.spec.ts` **2 passed**（盒顶面同边界 ADD 2 mm =
  **4800.000 mm³**，树 `sketch/extrude/sketch/faceExtrude`，push+重开）；
  iOS scenario 回归 **2 passed**（157478.901 mm³，未替换、无退化）。**A2 首步
  NEW 主导面域**：`dominantImprintRegion` 仅 operation=new 收敛（4 单测，8/8）；
  Drive Sleeve Extrude 1 264448.7→**1190513.2 mm³**，backend 离线整链
  **1357113.4 vs 1175024.3（+15.50%）**（此前 −34.08%），web 约 +20.1%；
  仍 known-red（add/remove 子面/起始面与 face split 未做），不改产品契约。
- **草图→草图投影（ADR-0009 切片 1a，2026-11-07，shared 1.35.0）**：`insertSketch.projections`
  + 实体 `projected` 标记；投影不占 DOF、约束引用拒收、平行平面圆/弧保真（非平行拒收）。
  后端 `SketchProjectionFlow` **4/4**（投影拉伸 2000→改源宽 30→3000 mm³；圆投影圆柱；
  校验矩阵；删除语义），后端全量 **786 passed / 8 skipped**（93 files）；真栈
  `e2e/sketch-projection.spec.ts` **2 passed**（2000→3000→push+重开 3000，DOF=0、
  区域 400→600）；web 1390/1390。1.35–1.46 已随 backend-20261109（shared 1.63.0）发布。
- **cPlane LINE_ANGLE（ADR-0013 切片 1，2026-11-07，shared 1.40.0）**：`CPlaneParams.line`
  + `angleDeg`（成对、与 offsetMm/origin 互斥、方向非零）；前端参考法线投影到线垂面后
  绕线 Rodrigues 旋转，线 ∥ 参考法线等退化返回 undefined。后端 schema/求值器兜底，
  `FeatureTypeRegistry` LINE_ANGLE 校验用例；web `cplane.test.ts` **12/12**；真栈
  `e2e/cplane-line-angle.spec.ts` **2 passed**（Top 绕 X 轴 45° → 草图 20×20 + 拉伸 10
  = **4000.000 mm³** 质心 (10,3.536,10.607)，树/平面快照 push+重开一致）；后端全量
  **806 passed / 8 skipped**（94 files）。UI/converter 未接。
- **moveFace 面偏移（ADR-0014 切片 1，2026-11-07，shared 1.42.0）**：`MoveFaceParams.faces`
  （持久面引用）+ `distanceMm`（非零；正外扩/负内缩）；后端 scratch 载体面寻址 +
  内核 OffsetFaces（显式 `offsetAll:false`），失败诚实 status=1。后端 `MoveFaceFlow`
  **6/6**（顶面 +5 6000、−2 3200、右面 +5 5000、update 重求值、失效引用、校验）；
  真栈 `e2e/move-face.spec.ts` **2 passed**（+5 6000.000 质心 z=7.5 → −2 3200.000
  质心 z=4，树/体积 push+重开）。`DeleteSubEntity` 探针 0 回包 → deleteFace 仍
  blocked-kernel；replaceFace IPC 未暴露。UI/converter 未接。
- **booleanBodies intersect（T12，2026-11-07）**：后端 `BooleanBodiesFlow` 含交集用例；
  真栈 `e2e/boolean-intersect.spec.ts` **2 passed**（1 mm³、工具体消费、push+重开）。
- **SplitPart 单侧世界平面（ADR-0012，2026-11-07，shared 1.39.0）**：后端
  `SplitPartFlow` **6/6**（YZ 正/负侧 4000、XY、偏置 6000、体外 status≠0、校验）；
  真栈 `e2e/split-part.spec.ts` **2 passed**（盒体 20×20×10 → YZ x=10 正侧
  2000.000 质心 (15,10,5) → 负侧 (5,10,5)，push+重开）；固定 100 m 半空间，
  不依赖 body bbox（update 后 bbox 是上次切割结果）。双侧/面驱动/converter 未接。
- **SplitPart UI（ADR-0012 UI 切片，2026-11-09）**：`SplitPartDialog` 目标实体 +
  XY/YZ/XZ 平面 + 偏移 + 保留正/负侧；面分割/保留工具/修剪面边界/双侧以静态
  文本诚实标注未支持；目标实体插入单选（N≤1 自动）、编辑只读。后端
  `previewOp` update/insert 白名单加 splitPart；`SplitPartFlow` **8/8**（+2 预览
  零写）；单测 **4/4**、web **1523/1523**、tsc/e2e tsc/lint 绿；真栈
  `e2e/split-part-ui.spec.ts` **2 passed（45.8 s）**——20×20×10 盒 YZ x=20
  正侧 **2000.000 mm³** 质心 x=25 → 编辑 x=25 **1000.000 mm³** 质心 x=27.5，
  插入/编辑预览 data-dynamic=1，push+冷重开；能力翻 full。双侧/面驱动/
  converter 未做。
- **Transform 切片 1/2（ADR-0010，2026-11-07，shared 1.36/1.38）**：后端 `TransformFlow`
  **8/8**（平移/旋转/先转后移/副本/scale 2/0.5@固定点/scale+平移/校验）；真栈
  `e2e/transform.spec.ts` **2 passed**（旋转质心 (-5,15)、副本 2000.000 mm³）、
  `e2e/transform-scale.spec.ts` **2 passed**（scale 2 **8000.000** 质心 (30,10,10)、
  scale 0.5@(5,5,5) **125.000** 质心 (10,5,5)、scale+平移质心 (130,10,10)，push+重开）；
  converter 未接。
- **Transform UI（ADR-0010 UI 切片，2026-11-09）**：`TransformDialog` 按 XYZ
  平动 / 世界 X-Y-Z 轴旋转 / 均匀缩放 + 复制；目标实体插入单选（N≤1 自动）、
  编辑只读；自定义轴/旋转中心/缩放固定点只读保留；多分量禁改参、非均匀缩放禁
  编辑、零操作禁提交；复制明示 Unite 合并语义（独立 Part 副本 blocked）。
  后端 `previewOp` update/insert 白名单加 transform；`TransformFlow` **15/15**
  （+2 预览零写）、后端全量 **878 passed / 1 expected fail / 8 skipped**；
  `TransformDialog` **6/6**、web **1522/1522**、tsc/e2e tsc/lint 绿；真栈
  `e2e/transform-ui.spec.ts` **2 passed（44.3 s）**——1000 → 平动+复制
  **2000.000 mm³** 质心 (30,5,5) → 编辑旋转 **1000.000 mm³** 质心 (-5,15,5)，
  插入/编辑预览 data-dynamic=1，push+冷重开；能力翻 full。线/点/配合连接器
  拾取、独立零件副本、多分量组合编辑未做。
- T11 shell 转换/面选择器（2026-11-07，test-only）：converter 输出 shell；replay
  解析 revolve SWEPT_FACE 端面（线⟂轴、前序圆角容差）→ resolveFaceRef → ShellParams。
  合成真栈 `e2e/examples/shell-face.spec.ts` **2 passed**——实心圆柱移顶面 + 内缩
  2 mm = 开口杯 **1533.097 mm³**，push/重开。Gaiter 真实例 blocked-kernel：
  Fillet 1（8 条整圆边）后 body 零体积（status=0 / mass=0），spec fixme 待内核修复。
- shared 1.34.0：featurePattern FEATURE 阵列（ADR-0007 首切片；sourceFeatureId +
  count/spacing?/angle? + 任意轴线段；源限 extrude/revolve/hole add/remove，差集 delta）。
  后端 `FeaturePatternFlow` **4/4**（线性 8.75 mm³、偏轴圆周 12 mm³、校验矩阵）、
  registry/RPC **46/46**；真栈 `e2e/examples/feature-pattern.spec.ts` **2 passed**
  （40×40×10 盒 + 凸台 3 实例 = **16240.000 mm³**，push+重开）；converter 映射/UI
  未接；已随 backend-20261109（shared 1.63.0）发布。
- shared 1.33.0：faceExtrude/imprint 纠正（ADR-0006 切片 D；iOS 侧向面域真栈
  157478.901 mm³；合成面拉伸 48.000 mm³）。1.33 切片已包含在 backend-20261109。
- shared 1.32.0：hole 倒角孔/countersink（ADR-0006 切片 A4；`countersinkDiameterMm`
  + `countersinkAngleDeg` 包含角，与 counterbore 参数互斥）；后端锥台 Loft 切除，
  HoleDialog 启用「倒角孔」页签；后端 `HoleFlow` **6/6**、web HoleDialog **7/7**、
  真栈 `e2e/hole.spec.ts --grep 倒角孔` **2 passed**（去材 261.794 vs 261.799 mm³）。
- shared 1.31.0：`CPlaneParams.origin` 平面点（ADR-0006 B2a；世界参考法线 + 自定义
  世界原点，与 offsetMm 互斥）；真栈 `e2e/cplane-point.spec.ts` **2 passed**
  （平面点 (1,2,3) → 草图 → 拉伸 4000 mm³，push+重开）。
- shared 1.30.0：`RevolveParams.regions` 多面域旋转（ADR-0005 Phase 3；旧
  `regionIndex` 简写 deprecated 兼容）；shared 159/159。
- shared 1.29.0：ADR-0004（construction/diameter/concentric/driven/整圆相切/angle）
  + ADR-0005 Phase 2（revolve new、extrude secondDirection）
  + ADR-0006 切片 A/A2/A3（hole：backend/contract/UI + 顶点孔位 + 沉头孔 + `e2e/hole.spec.ts` 3 passed）
  + 切片 B1（cPlane：三基准面/偏移/反转法线 + SketchPlaneDto.sourceFeatureId）。
- 后端 sketch：`src/sketch` **92/92**（含 point-on-line coincident v1.31、点+原点 H/V、CENTERLINE_DIMENSION→distance、
  angle 60° 收敛、line+circle tangent、diameter/concentric）；回放
  Tutorial2/iOS/Basic/Postman/Corpus/Fillet/SketchFlow/SketchOps **31/31**；
  hole 流程 6/6（throughAll 4000−40π、blind 多孔、pointIds 精确选位、v1.27 顶点孔位、v1.28 沉头孔 4000−76π、v1.32 倒角孔 4000−152π/3）；
  cPlane 流程 **3/3**（体后插入不改体积；被引用改参/删除拒收、解除后可改删；首特征 +
  草图 + 拉伸 4000 mm³；v1.31 平面点 origin 落库/草图快照 + origin/offset 互斥拒收）；
  `ScenarioReplayCorpus` 3/3（Basic/Warning Label/MateConnectors 建链 + synthetic vertexRefs 体积对拍）；
  **后端全量 88 files / 754 passed / 8 skipped**（2026-11-06，shared 1.32 实测；
  含 point-on-line 与多面域 revolve）。
- 真栈回归（shared 1.28.0 实测）：`tutorial2.spec.ts` **2 passed（4.1 min）**，
  体积与 1.22.0 基线完全一致（无圆角 358.161、终体积 357.739、去材 0.422 cm³）；
  shared 1.24 合并 strict+tools **8 passed（8.2 min）**，tools 含圆直径+共圆相切 UI 链。
- 示例复刻：Tutorial 2、iOS（157.4789 vs 157.4789 cm³，**0.00%**）、
  Exercise: Basic Drawing（2442.2935 vs 2442.2938，-0.00%）、Postman（2.6705 vs 2.6866 cm³，-0.60%）。
- 示例 iModel 分步演示（hub 持久化 + 重开验证）：Tutorial 2、Tutorial 2 - Build Your First
  Part - iOS、Exercise: Basic Drawing、Postman、WARNING LABEL - Bench Vise、
  Exercise - Creating Mate Connectors、Intro to CAD 1.2-1.4、Exercise - Hand Brake Update、
  Sample Assignment（Alignment Plate），
  外加 WARNING LABEL 同几何文档族 3 个 Quickstart 文档与 Top, Ring, Key（各自独立
  iModel，共 13 个 iModel）；演示页 `apps/web/demo-artifacts/examples/`，runner
  `apps/web/e2e/examples/`。
  Postman/警告标签/Mate Connectors/Intro 的草图步骤为采集数据经 RPC 精确复原（页面明确标注），
  特征步骤走真实 UI；Mate Connectors 圆头槽按精确切点弧+切线重建（面域引擎尚不合并重叠闭环）。
  Intro to CAD（cPlane 版，当前 iModel `bb8efb7b-5a07-4eb9-b36a-e0f8a7dfcaaf`，与
  `demo-artifacts/examples/state.json` 同源）：
  UI 建 Plane 1（Front 偏移 −20、反转法线）+ SketchDialog 选 Plane 1 建壳，
  树 `sketch → extrude → cPlane → sketch`，体积 85157.341 mm³；演示截图 001–010。
  重开回归（2026-11-08 更新）：`e2e/examples/verify-registry.spec.ts` 按静态 registry
  逐文档验证 **13 文档 / 14 tests passed（14.6 min，含 Element Organization 两 scope；
  legacy-only 子集 12/12 / 4.7 min）**；`e2e/examples/verify-imodels.spec.ts` 只读
  `state.json` 运行态、逐文档隔离验证 **13 文档 / 14 tests passed（14.8 min）**。
  旧 2026-11-06 的硬编码 UUID 13/13 基线（含 Sample `f52752cb`、Top Ring Key
  `09ea16a9`）已随 iModel 重建失效，不得再引用；canonical Sample 现由审计 RPC 场景
  构建为 `4745195f`（9 特征/8915.860 mm³）。冷开依赖 hub 的
  `currentOrPrecedingCheckpoint` 回退与 changesets `$orderBy` 支持（2026-11-06 修复；
  公开 GHCR hub 镜像尚未更新时外部冷开会失败）。
  Tutorial 2 iOS 的倒角按 Onshape CAP_EDGE 语义拾取 3 条边（+y/−y 端盖分别取景），
  终体积 157478.900 mm³ 与目标一致；Hand Brake 左端圆边 1 mm 精确；
  Sample Assignment 4 草图 RPC + 4 次 UI 拉伸 + 4 竖边距离-角度倒角，体积 8915.860 mm³（0.00%）。
- 真栈：`newbody`（选择/删除/undo/redo）、`part-studio`（五区/ribbon 激活）、`hole`
  （简单孔 + 沉头孔，树 `sketch/extrude/hole` 全 status=0，去材误差 <0.001%）通过。
- T3 Shell UI（2026-11-06）：`e2e/shell.spec.ts` setup+test **2 passed**——盒体
  20×20×10 顶面移除 1 mm 内缩 **1084.000 mm³**（解析期望同值），undo/redo、
  双击编辑 2 mm（1952 mm³）、push + 重开一致；`ShellDialog.test.tsx` 5/5。
- T4 拉伸第二方向（2026-11-06）：`e2e/extrude-second-direction.spec.ts`
  setup+test **2 passed**——20×20 矩形拉伸 10 + 第二方向 5 = **6000.000 mm³**；
  FeatureDialog/feature-preview/翻译器单测同批。
- T4 旋转多面域（2026-11-06，shared 1.30.0）：`e2e/revolve-multi-region.spec.ts`
  setup+test **2 passed**——视口点选 2 个互斥环柱面域 + 轴，体积 **7853.981 mm³**
  （2500π），push+重开；FeatureDialog 137/137（含多面域编辑回显）。
  真实 Hand Brake：`e2e/examples/hand-brake-scenario.spec.ts` setup+test **2 passed**——
  sketch + revolve regions [0,1] + SWEPT_EDGE 1 mm 倒角，**7125.270 mm³** vs 采集
  7125.274；首版单 region 0 为 5358.127（−24.8%，根因即单面域契约）。
  converter 多 query 仅给面积降序前缀（regionRisk），真实面域选择在 spec 中审计。
- T4b Handle 真实示例（2026-11-06，Exercise: Hand Brake Update / Handle）：
  `e2e/examples/handle-scenario.spec.ts` setup+test **2 passed**——12 特征
  （PLANE_POINT、secondDirection 10+120、2 个多体 remove、3 点沉头孔、fillet 30）
  全 status=0；逐体 **38314.220 / 68563.590** vs 采集 **38314.765 / 68563.589**
  （总 106877.810 vs 106878.354，**0.0005%**），push+重开一致。converter 新增
  PLANE_POINT/草图 `planeSourceFeatureId`/booleanScope featureId 提取；修正
  `secondDirectionOppositeDirection=true → 反侧`（旧映射把 130 压成 120）；runner
  增加 body 谱系回溯、regionRisk 越界面域收敛 note、按目标质心侧定孔方向；
  后端 `CPlaneScenarioReplay` 1/1；translator 17/17。约束 refs 仍
  `constraints=dropped`，不宣称约束树完整。
- T5 mirror 首切片（2026-11-06）：`e2e/examples/mirror.spec.ts` setup+test
  **2 passed**——偏置盒体 YZ 世界平面整件镜像 **8000.000 mm³**（2×4000），
  push+重开一致；converter 仅映射 PART / fullFeaturePattern=true，局部镜像如实
  dropped。**v1.37 任意世界平面（ADR-0011，2026-11-07）**：`MirrorParams.planeLine`
  （plane/planeLine 恰一）；后端 `MirrorFlow` **10/10**（对角 x=y/偏置 x=2/法向归一化/
  形态矩阵）；真栈 `e2e/mirror-plane-line.spec.ts` **2 passed**（对角 16.000 mm³ 质心
  (2.5,2.5)→偏置 16.000 质心 (2,1)，push+重开）。**v1.41 faceRef 面镜像（ADR-0011
  切片 2，2026-11-07）**：`MirrorParams.faceRef`（plane/planeLine/faceRef 恰一）；
  后端 scratch 载体面寻址 + `CurveOps.isPlanar` 取面平面；`MirrorFlow` **14/14**
  （顶面/右面各 16 mm³、失效引用 status≠0、三模式校验）；真栈
  `e2e/mirror-face.spec.ts` **2 passed**（盒 20×20×10 顶面镜像 **8000.000 mm³**
  质心 (10,10,10)，push+重开）；**切片 2b 面选择 UI（2026-11-07）**：ribbon 镜像
  路由快照选中面 → FeatureDialog「镜像平面 = 选中的面」，多选面/跨体 owner 诚实
  拒绝，edit faceRef 只读；真栈 `e2e/mirror-face-ui.spec.ts` **2 passed**（FACE
  载荷 8000.000 mm³ 质心 (10,10,10) push+重开），web 1437/1437。**v1.48 mirror
  operation（ADR-0011 切片 2c，2026-11-07）**：`MirrorParams.operation?`
  unite/subtract/intersect（缺省 unite 旧载荷兼容），后端
  `[上游,镜像]`→BRep Unite/Subtract/Intersect，`MirrorFlow` **16/16**（偏置面
  x=4.2 交集 6.4/差集 1.6 mm³）；FeatureDialog「镜像操作」页签（加入/移除/相交），
  「新建」需多体（ADR-0015）禁用+提示，operation 非 unite 才写载荷、edit 回显；
  真栈 `e2e/mirror-operation-ui.spec.ts` **2 passed（47.5 s）**——盒 3000 mm³ →
  YZ+相交 **2000.000 mm³** push+重开，web **1443/1443**、shared 170/170。
  converter（test-only）已映射 operationType（ADD→unite/REMOVE→subtract/
  INTERSECT→intersect；NEW 标 `newBodyApproximation`，全库 NEW 53/ADD 21/
  REMOVE·INTERSECT 0，不新增绿例），translator **33/33**。「新建」独立镜像体、
  多选面批量镜像未做。converter mirror FACE 仍 blocked（回放期面解析未做）。
- **live UI 采集 + moveFace UI（2026-11-08）**：CDP Chrome 登录后经 Playwright
  `connectOverCDP` 在 `LubanCAD 覆盖 - Bumper Block` 副本采集并取消（未写文档）：
  `ui-evidence/feature-dialogs-20261108/onshape/{move-face,split,transform,
  linear-pattern}.{json,png}`（私有仓）。moveFace 字段：要移动的面/偏移/终止类型
  （给定深度）/距离/重新应用圆角。已实现 `MoveFaceDialog`（面来自
  `store.canvas.selection` + 路由快照；偏移+距离+向内/向外；重新应用圆角禁用提示；
  逐面 distancesMm edit 只读），ribbon `moveFace` 改道，能力翻 full；单测 **7/7**、
  真栈 `e2e/move-face-ui.spec.ts` **2 passed**（面 faceRef (1,6)，盒 4000 → 顶面 +5
  **6000.000 mm³** 质心 (10,10,7.5)，push+重开）；web 全量 **1443/1443**。
  split 仍 gated；linear-pattern 证据已用于 FeaturePatternDialog；transform 证据
  已用于 `TransformDialog`（2026-11-09，XYZ/世界轴/均匀缩放子集）。
- **featurePattern centered（ADR-0007 切片 6，2026-11-08，shared 1.49.0）**：
  `FeaturePatternParams.centered?`——Onshape 帮助页证据：输入 N 为每侧含 seed，
  总数 2N−1、seed 居中；后端偏移 `(k−(count−1)/2)·spacing`，centered 须奇数
  （偶数/圆周 centered 拒收）；formFields 补 centered；translator 34/34；converter
  按 `count=2N−1` 映射（5 个语料 centered 源均被其它缺口阻塞，无新绿）。后端
  `FeaturePatternFlow` **7/7**（centered count 3 spacing 0.6 → 变换 ±0.6、体 8.75）；
  真栈 `e2e/examples/feature-pattern-centered.spec.ts` **2 passed**——40×40×10 盒 +
  4×4×5 凸台，centered count 5 spacing 6 → **16400.000 mm³** 质心 x=0.0000，
  树/params `{centered:true,count:5,spacing:6}` push+重开一致。
  **body PatternParams + FeatureDialog 居中（ADR-0007 切片 7，2026-11-08）**：
  `PatternParams.centered?`（count 为总实例数须奇数，circular 拒收）；后端
  `patternSchema`/`patternInstanceTransforms` 居中偏移（`PatternFlow` b2 count 3
  spacing 10 → 体 24、bbox x [−10,12]；b3 拒收）；UI 勾选后输入 N=每侧实例数
  （含原件），载荷 `count=2N−1`+`centered:true`，圆周禁用复位，编辑回显
  `N=(count+1)/2`；单测 FeatureDialog **148/148**（+4）、真栈
  `e2e/pattern-centered-ui.spec.ts` **2 passed**——4×4×5 盒 N=3/spacing=6 →
  count=5 **400.000 mm³** 质心 (2,2,2.5) push+重开。后端全量
  **820 passed / 1 expected fail / 8 skipped**、web **1447/1447**、shared 170/170、
  converter 14/14。第二方向/跳过实例仍为禁用占位；converter 仍只转 FACE/FEATURE。
- T2 边选择器（2026-11-06）：`e2e/examples/edge-selector.spec.ts` setup+test **2 passed**
  （合成圆盘 CAP_EDGE 倒角 770.737 mm³ = 解析期望；iOS First Part 3 条 CAP_EDGE
  终体积 **157478.901 mm³** vs 157478.902）；私有 converter 解析 9/9、
  backend matcher 7/7、ScenarioReplay 11/11。**同日 imprint 侧向**：converter
  保留全部 imprint queries + `imprintSign`（−1 环外/+1 环内），iOS 走 side=outside
  → region 1（真栈 2 passed）；`pickImprintRegion`/sign 解析单测 5/5、
  translator 21/21、scenario schema 11/11。同日修 converter 明文 CAP_EDGE
  `"isStart":true` 解析（edge-selectors 13/13）与 runner 多体无 scope 显式
  谱系锚定；Rear Shock 探针仍 blocked（Extrude 1 为 5 条混合侧向 imprint，
  线侧是实体子面，需真 imprint/face split），回归 Handle/Hand Brake/Sample
  Assignment/Element Organization **5 passed**。Hand Brake 仍受 revolve 单 region
  契约阻塞（region 0 ≈5372.779、[0,1] 并集 ≈7139.92 vs 7125.274），不以错值转绿。
  **2026-11-07 圆 SWEPT_EDGE 消歧**：Hydraulic Fillet 1 六条「外圆 + 两条相邻
  直线」查询旧实现对 circle 无端点 → matches=0；converter 识别明文 UUID context，
  前端/后端 resolver 取相邻实体唯一共享且落圆的端点（共享点不在圆/不足 2/两个
  → 空集不猜）。单测：`edge-resolver-circle-swept` **6/6**、backend matcher
  **9/9**、converter **14/14**。真栈 Hydraulic 通过 Fillet 1（体 51527.568 mm³），
  但该 PS 的 Revolve 2–5 均 regionRisk、Revolve 2 后体读数归零并出现 RPC 超时——
  smoke 候选，保持 known-red。
- T1/T4 imprintFace 面域解析（2026-11-06，test-only 近似）：
  `e2e/examples/sample-assignment-scenario.spec.ts` setup+test **2 passed**——
  9 特征、体积 **8915.860 mm³** vs 8915.859905，push+重开一致；两条切除孔用
  显式可审计 region 映射，4 条 SWEPT_EDGE 并集端点消歧，约束登记
  `constraints=dropped`。`pickImprintRegion` 单测 3/3（孔优先/最大/外环回退/不猜）。
  产品 face split 仍未实现，步骤保持 `approximate=true`；旧 UI 版
  `sample-assignment.spec.ts` 降为 legacy（`EXAMPLE_UI_LEGACY=1` 才跑）。
- **known-red**：`sketch-extrude` 仍红（草图无拉链面域）。`tutorial2` X-14 已于 2026-11-04 关闭：`tutorial2.spec.ts` 2 passed（setup+strict，3.8 min；六特征 status 0，无圆角 358.161 cm³、终 357.739 cm³、去材 0.422 cm³），证据 `apps/web/test-results/t2-strict-after.log`。不得把 known-red 当绿，也不得通过放宽断言“修复”。
- **SPA 返回项目页再开模型恒卡“正在解析 Part Studio…”**（2026-11-10 实测）：根因是 luban 把 IPC host 绑定到 React 路由——`useViewport` 卸载 → `releaseViewer` 计数归零 → `IpcApp/IModelApp.shutdown`，下一次启动复用死 WebSocket/漏 startup（`IModelApp.initialized=false`、`WebSocket is already in CLOSING or CLOSED state`）。已对齐 iTwin.js display-test-app：**LocalhostIpcApp/IpcApp/IModelApp 页面级持有，首次进入编辑器 startup 一次，路由/Viewport 卸载只关闭 BriefcaseConnection，releaseViewer 只减引用、不 shutdown**。页面刷新/关闭由浏览器断 WS，后端 connection close 清理；显式停止需整页刷新。**后端 MS 重启后** `IpcApp.isValid`/`IpcSession.active` 仍为真，`downloadBriefcase` 会向死 socket 永久悬挂——`useBriefcaseConnection` 打开前用官方 `appFunctionIpc.queryConcurrency('io')` 做 8s 存活探针，超时即出错误面（“建模服务连接已断开…请刷新页面”），刷新后新页面重建 host 恢复。**登出/切换账号**必须 `AuthSession.logout()` 后 `window.location.href='/login'` 整页导航，禁止 SPA 路由切登录页复用旧 WS 身份。viewer `web-initializer.test.ts` 14/14 + `use-briefcase-connection.test.ts` 14/14（含探针超时）、真栈 `catalog.spec.ts` 重入 5/5、`ipc-logout.spec.ts` 1/1、`ms-restart-recovery.spec.ts`（`IPC_RESTART_E2E=1`）1/1。不要再引入按路由 shutdown 或重置 `LocalhostIpcApp` 私有字段的补丁。

*最后更新: 2026-11-11（D2 单线面切分 / Intro Part 5+6 严格绿；shared 1.67 `noOpEvidence`；Part 6 188,451.236 vs 188,451.236、8 步 status=0、冷重开一致；Handle Parts strict 绿、`/examples` 22 卡；此前 2026-11-10（发布闭口：`backend-20261110` / shared 1.64.0 已发布——精确 faceExtrude A1/A2/A3/A4 + S3；Bumper strict 16/16、636,731.650 vs 636,731.499（+0.000024%）；私有 `replicable-now` 18 / 公开 strict 19，私有 evidence 已固化；A1/A2 backend 随发布可复现；generic resolver 12 边仍为独立 blocked-kernel；新增公开 `/examples` 全部示例目录（2026-11-10 19 卡，追加 Intro Part 4；owner 过滤/搜索、按项目名+iModel 名解析打开；真栈 19 卡 + Bumper 直达 Part Studio canvas；web **1537/1537**）；iOS `EXAMPLE_RESET=1` 真栈 2 passed；此前 `backend-20261109` / shared 1.63.0：4 个公开镜像 + MS 产物、verify-stack 17/17；此前全 UI live 复核：文档中心/新建/登录/文档详情 + 220px 特征对话框统一皮肤；公开产品介绍页 `/showcase` + 4K WebP/1080p WebM；示例 iModel 12 个 + 分步演示；cPlane 基准面/平面点 + 草图落在自定义平面（shared 1.31.0，Intro to CAD + Handle 真栈）；chamfer UI 等距/双距离/距离-角度及编辑回显；Sample Assignment 真实 UI 链；SketchDialog 偏移平面编辑；FeatureDialog endBound 完全贯穿；官方 iTwin ViewCube 默认 + 相机/渲染菜单（`?viewcube=onshape` 回退；真栈 itwin/ui-parity/tutorial2 均绿）；图形首选项默认 AO 20%/线宽 2px；T3 抽壳 UI 真栈 1084.000 mm³ + 编辑/重开；T4 拉伸第二方向真栈 6000.000 mm³ + 旋转多面域 7853.981 mm³/Hand Brake 7125.270 mm³；T4b Handle 真栈逐体 38314.220/68563.590 vs 38314.765/68563.589；T5 mirror 真栈 8000.000 mm³；T6 point-on-line + 单点 H/V + CENTERLINE_DIMENSION 约束映射（缺口 143→6、47→0）；shared 1.32 倒角孔真栈 261.794 vs 261.799 mm³；验证基线 1389）*
