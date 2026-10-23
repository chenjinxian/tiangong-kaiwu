# M6-b 实施计划：Tutorial 2 全链（revolve/对称/约束尺寸/圆角 + 六特征重建）

> 架构依据：`.superpowers/sdd/2026-10-23-tutorial2-sketch-chain/architecture.md`（§三 B4/B5/B6+F3/F4/F6/F8/F9）。
> 采集依据：`.superpowers/sdd/onshape-tutorial2-analysis/TUTORIAL2-MODELING-CHAIN.md`（六特征参数+体积金标准 21.85 in³）。
> 前置：M6-a 已收官（草图→面域→拉伸闭环真栈跑通；push 丢数据缺陷以 LUBAN_DISABLE_AUTO_PUSH 绕开，不在本里程碑修）。

## DoD（完成定义）

1. **平面真实化**：Front/Top/Right 平面草图落库+回显+求值消费——Front 平面草图拉伸方向为世界 +Y（竖直面可用）
2. **revolve 特征**：草图面域绕轴 360°/角度成体（Tutorial 2 的 R1×H1.125 圆柱通道）
3. **extrude symmetric**：对称拉伸语义进求值器（Tutorial 2 三个拉伸全是对称）
4. **约束/尺寸工具**：coincident/horizontal/vertical/parallel/perpendicular/equal×6+distance/radius×2 移植 web-next；SketchPanel（DOF 徽标/三清单/尺寸内联编辑/级联删除）
5. **Fillet 链**：边拾取（LocateSubEntityTool 子类）→resolveEdgeRef→fillet op→UI 对话框
6. **Tutorial 2 重建验收**：六特征顺序重建（Sketch 1/Extrude 1-3/Revolve 1/Fillet 1）→**体积 21.85 in³ ±1% 对拍**+截图视觉对比

## 范围裁决（防 scope 膨胀）

- **约束方案不复刻**：Tutorial 2 草图的 OFFSET 偏移约束（后端 8 种约束无此kind）不实现——重建按坐标绘制+既有约束类型标注，验收标准是**几何+体积**非约束方案等价（offset 约束归后续单裁）
- **面域拾取保持下拉**（M6-a 形态），视口点击拾取归 M6-c
- **UI 1:1 归 M6-c**：本里程碑对话框只求功能件齐备（对称复选/角度输入/轴拾取），像素级对齐后置
- push 管道三缺陷（丢数据/isUndoPossible/ChangesetProps）不修——发布窗归口

## 任务分解

### T1 私有仓+shared：plane 落库与全链消费（前置——Tutorial 2 的 Sketch 1 在 Front 竖直面）
- LubanSketch 落库 plane（origin/normal/xDir 三向量入 params 或独立属性——实施者按 schema 现状裁决）；getSketch/getTree 回传
- 求值消费：T3 已留 Transform 消费口——激活+单测（Front 面草图拉伸体 bbox 在世界系验证朝向）
- 前端回显：树「编辑草图」→setActiveSketchPlane（T7 挂账清偿）
- 门禁：私有仓 build/test/lint；web-next 全量

### T2 shared+私有仓：revolve 契约与求值器（B4）
- shared：`LubanFeatureType +revolve`；`RevolveParams {sketchId, regionIndex?, axis: {sketchEntityId}, fullRevolve: boolean, angle?: number}`（axis=草图内线实体 id；契约注释钉死 v1.7）
- 私有仓：zod schema+求值器——**Sweep 沿圆弧路径**（profile=面域 Loop 平移到轴平面；path=Arc3d 全圆，圆心在轴上、面垂直轴；T3 探针结论：全圆自动拆两半弧规避空转）；非全周=部分弧
- 轴验证：轴线必须与面域共面（Onshape 语义）；axis 实体须为 line
- 单测：矩形绕边线 360°→圆柱体积 πr²h 解析对拍；部分角度弧长体积比
- 门禁：私有仓三闸

### T3 私有仓：extrude symmetric（B5）
- zod +`symmetric?: boolean`；求值：profile 沿法向平移 −depth/2 后正向 Sweep depth（单次内核调用）
- shared 同步 ExtrudeParams（注释 v1.7 一并）
- 单测：对称体积=非对称同值、bbox 中面居中
- 门禁：私有仓三闸+shared 回归

### T4 web-next：Revolve 对话框+extrude 对称复选（F6+F5 半）
- RevolveDialog（FeatureDialog 扩展 featureType==='revolve' 通道）：草图/面域下拉（M6-a 同源）+**轴选择**（选中草图后 getSketch 的 line 实体列表下拉「线 N」）+全方位复选（勾选隐藏角度）/角度输入
- FeatureDialog 对称复选接载荷（symmetric→params）
- 单测：载荷形态/门禁路径
- 门禁：web-next 三闸

### T5 web-next：约束工具×6+尺寸工具×2+SketchPanel（F3+F4）
- M3-b `SketchAddConstraintTool`/`SketchAddDimensionTool` 移植（槽位拾取/事件桥移交面板收值——尺寸不直接提交的铁律保留）
- SketchPanel：DOF 徽标（solve.status 四态）/实体/约束/尺寸三清单/尺寸内联编辑（updateSketchConstraint op）/级联删除
- 草图模式 ribbon 挂真 toolId（约束 6+尺寸 2 替换占位）
- 门禁：web-next 三闸；buildShape/槽位逻辑单测

### T6 web-next+editor 包：Fillet 边拾取与对话框（F8）
- editor 基座 `LocateSubEntityTool` 子类（边拾取，laminar/smooth 过滤同 BlendEdgesTool）→`resolveEdgeRef` RPC→LubanTopologyId 对
- FilletDialog（featureType==='fillet' 通道）：边 chips 列表+半径输入+切向延伸复选→`{radius, propagateSmooth, edges:[{faceA,faceB}]}`
- 门禁：web-next 三闸；边拾取的自动化可测性如实评估（真栈验证归 T7）

### T7 集成验收：Tutorial 2 六特征重建（体积金标准对拍）
- 真栈冒烟脚本（常驻 e2e 或专用 spec）：Front 平面 Sketch 1（底座矩形+双弧拱+旋转矩形，按采集坐标 mm 换算绘制）→Extrude 1（对称 127mm=5in）→Extrude 2（对称 50.8mm）→Extrude 3（对称 15.875mm）→Revolve 1（全周）→Fillet 1（R5.08）
- **体积对拍**：RPC 或库侧读质量属性 vs 21.85 in³（358.2 cm³）±1%
- 截图对比 Onshape 采集图（等轴视角）
- 自动化绘制难度预判：双弧+多线闭环的点击序列长——容许 RPC 级建草图（insertSketch 直发完整 entities/constraints）作为降级路径，UI 绘制链已由 M6-a/T8 与 T5 单测覆盖；降级须如实登记
- 门禁：spec 绿+体积对拍报告

### T8 评审收口+台账+记忆更新

## 依赖与并行面

```
T1 ─→ T2 ─→ T4 ─┐
  │    T3 ──────┤
  └─→ T5 ───────┼─→ T7 ─→ T8
      T6 ───────┘
```
- T1 先行（plane 全链）；T2/T3 私有仓串行（同文件面）；T4 依赖 T2；T5/T6 独立并行
- T7 全收口（含降级路径裁决）

## 风险登记

| 风险 | 缓解 |
|---|---|
| revolve 的 Sweep 沿全圆路径内核收敛（T3 探针：自动拆半弧）已预研 | T2 单测先行（圆柱解析对拍） |
| Fillet 边拾取自动化点击难（真栈） | UI 链单测覆盖+T7 真栈容许 RPC 降级路径 |
| Tutorial 2 草图点击序列长（9 实体） | T7 容许 insertSketch RPC 直发（降级登记） |
| plane 落库迁移既有草图兼容 | 缺省恒等变换向后兼容（T3 消费口既有语义） |
| 单位：采集 in→米制换算噪声 | 换算常数单点定义（25.4mm/in）；对拍容差 ±1% 吸收 |
