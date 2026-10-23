# M6-a 实施计划：草图闭环（带弧草图→面域→拉伸）

> 架构依据：`.superpowers/sdd/2026-10-23-tutorial2-sketch-chain/architecture.md`（三层分工裁决+缺口清单）。
> 采集依据：`.superpowers/sdd/onshape-tutorial2-analysis/TUTORIAL2-MODELING-CHAIN.md`。
> 目标里程碑：M6-a（M6 三期之首——M6-b Tutorial 2 全链、M6-c UI 1:1 后续立项）。

## DoD（完成定义）

1. web-next 内点「草图」→ 选 Front/Top/Right 平面 → `insertSketch` RPC 建真草图（真 sketchId 入 store，特征树现草图节点）
2. 草图模式内用**线+3点圆弧**工具画一个闭环（含弧），乐观提交链工作（后端解算→几何流写回，**弧进几何流**）
3. 「拉伸」对话框拾取该草图面域 → 提交 `{sketchId, regionIndex, profile:[]}` → 后端 sketchRegionsFrom 产闭环 → 内核 Sweep 成体
4. 视口显示拉伸实体；特征树出现拉伸节点；撤销/重做正常
5. 单测全绿 + 真实栈冒烟脚本留证（截图+体积读数>0）

## 复用钉死（防重复造轮子）

- 取点捕捉：**AccuSnap 子类化**（`getActiveSnapModes` 返回九模式），禁手写命中测试
- 平面锁定：**AccuDraw 三件套**（`is3dCompass()=false`+`allow3dManipulations()=false`+`acsPlaneSnapLock=true`）+HintBuilder `setOrigin/setNormal/setLockZ`，禁手写 z=0 投影
- 预览：PrimitiveTool Dynamics 通道（`beginDynamics`/`onDynamicFrame`）
- 面域识别：**`RegionOps.constructAllXYRegionLoops`**（后端），禁自研环检测
- 提交语义骨架：M3-b SketchCreateTool（乐观整体覆写/拒收回滚/DOF 回显）——语义保留，取点/预览层换标准件
- 子实体拾取（后续圆角）：editor `LocateSubEntityTool` 子类化

## 任务分解

### T1 shared 契约扩展（先行，前后端共同依赖）
- `SketchEntityDto` +`{kind:"arc"; id:number; center:number; radius?:number; startAngle?:number; sweepAngle?:number}`（center 引用 point id；角度弧度制；缺省=待解算）
- `SketchDto` +`regions?: Array<{ loopCount: number; area: number; outerEntityIds: number[] }>`（解算后面域下发，供前端拾取高亮）
- `ExtrudeParams` +`regionIndex?: number`（sketchId 模式下选面域，缺省 0=最大面域）
- 断言单测：DTO 序列化往返、regionIndex 缺省语义
- 文件：`luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts` + 测试

### T2 私有仓：求解器 arc + 几何流写弧（B1+B2 同文件面合并）
- `SolverTypes.js`（TS 源 `src/sketch/SolverTypes.ts`）zod +arc schema；跨实体语义校验（center 必须引用 point）
- `SlvsSolver.ts` 实体合成：arc→SLVS_C_ARC_OF_CIRCLE（圆心 point+工作平面法向+radius distance 实体+起止 point）；约束映射扩（arc 参与 coincident/radius/tangent 槽位）
- `LubanCadSchema.ts` `writeSketchLineGeometry`→`writeSketchGeometry`：line→LineSegment3d；circle→Arc3d 全圆；arc→Arc3d 起止角；统一走 ElementGeometry.Builder
- 单测：含弧草图（线×2+弧×1 闭环）解算→几何流含 Arc3d 条目→读回
- 文件：`D:\Github\luban-backend\modeling-server\src\sketch\{SolverTypes.ts,SlvsSolver.ts}`、`src\feature\LubanCadSchema.ts` + 测试

### T3 私有仓：sketchRegionsFrom 多面域 + extrude regionIndex（B3+B6 后端半）
- `FeatureEngine.ts`：`sketchRegionsFrom(db, sketchId)`——读全部几何条目（lineString/lineSegment/arc）→ CurvePrimitive 数组 → `RegionOps.constructAllXYRegionLoops` → 面域数组（面积降序确定性排序）；`sketchProfileFrom` 保留兼容（=regions[0] 的轮廓点列）
- extrude 求值：`params.sketchId` 分支取 `regions[params.regionIndex ?? 0]`，轮廓=面域外环（含弧段的 Loop，直接喂 Sweep 的 profile 条目——**不再只传 {x,y} 点列**，弧保真进内核）
- zod：extrudeSchema +`regionIndex: z.number().int().nonnegative().optional()`
- 单测：双闭环草图（矩形+圆孔）→regions=2；含拱形环带（两同心半弧+两竖线）→环带面域识别正确；Sweep 成体体积>0
- 文件：`D:\Github\luban-backend\modeling-server\src\feature\{FeatureEngine.ts,FeatureTypeRegistry.ts,FeatureService.ts}` + 测试

### T4 web-next：SketchDialog 接线建真草图（F1）
- ✓ 确认 → `applyOp({kind:'insertSketch', entities:[], constraints:[]})`（空草图先建壳）→ 返回 featureId 作真 sketchId 入 store.activeSketchId（废 `'sketch-active'` 占位）
- 平面选择（Front/Top/Right/拾取面）→ 平面参数随 insertSketch 下发（契约：insertSketch op +`plane?: {origin, normal, xDir}`；缺省=XY@z=0 保持 M3-b 语义）
- 失败路径：RPC 拒收→toast+不进草图模式
- 单测：store 接线、失败路径；jsdom 组件测
- 文件：`apps/web-next/src/modules/part-studio/{dialogs/SketchDialog.tsx, components/PartStudioCanvas.tsx, stores/use-part-studio-store.ts}` + shared opDsl（plane 字段）

### T5 web-next：绘制工具×4 移植+标准件换芯（F2）
- 移植 M3-b `SketchCreateTool` 基类到 `apps/web-next/src/modules/part-studio/tools/`（`SketchLineTool`/`SketchRectangleTool`/`SketchCenterCircleTool`/`SketchArc3PointTool`）
- 换芯：取点走 AccuSnap 子类（九模式，草图实体装饰可捕捉）；平面锁定 AccuDraw 三件套（进入草图模式时 install，退出恢复）；橡皮筋走 Dynamics 通道
- arc 工具：3 点弧（起点→终点→弧上点）构造 arc DTO（圆心/半径/起止角由后端解算落库）
- 提交：满点→buildShape（entities+constraints DTO）→`updateSketch` 乐观整体覆写→拒收回滚 id+toast
- 注册：toolId 注册进 `sketch-tools.ts`（替换占位 id），Ribbon 激活路由 `IModelApp.tools.run` 直发
- 单测：buildShape 纯函数×4；拒收回滚；AccuDraw 锁定安装/恢复
- 文件：`apps/web-next/src/modules/part-studio/tools/sketch/*` + `ribbon/sketch-tools.ts` + 测试

### T6 web-next：FeatureDialog 接 sketchId+面域拾取（F5）
- 拉伸对话框增「面域」拾取 chips：点击视口草画面域（`testPointInOnOutRegionXY` 前端命中 getSketch 下发的 regions）→ 载荷 `{sketchId, regionIndex, profile: [], distance}`
- 无草图/无面域时禁提交并提示（对齐 zod 语义，不再发空 profile 裸奔）
- 校验提示文案对齐 Onshape（「要拉伸的面和草图面域」）
- 单测：载荷构造、拾取命中、禁提交门禁
- 文件：`apps/web-next/src/modules/part-studio/dialogs/FeatureDialog.tsx` + hooks

### T7 web-next：特征树草图节点+编辑入口（F7）
- i18n `featureTypes.sketch`（zh-CN/en）
- 树行右键+双击「编辑草图」→ 进草图模式（activeSketchId=该节点 id）
- 草图节点图标（采集 SVG 复用评估）
- 单测：树映射含 sketch 类型、双击路由
- 文件：`tree/*`、`common/i18n/locales/*/part-studio.json`

### T8 集成验收（真实栈冒烟）
- 起栈：compose + MS **源码模式**（私有仓改动未发产物）
- 冒烟脚本（Playwright）：建草图→线+弧画闭环→退出→拉伸（拾取面域+深度）→断言特征树 2 节点+视口非空+体积读数>0（RPC 或 UI 读数）→撤销/重做各一次
- 留证：截图×4（草图模式/画完闭环/拉伸对话框/成体）+ 控制台零错误导出
- 文件：`apps/web-next/e2e/sketch-extrude.spec.ts`（常驻回归）

## 依赖与并行面

```
T1 ─→ T2 ─→ T3 ─┐
  │             ├─→ T8（集成验收）
  └─→ T4 ─→ T5 ─┴─→ T6 ─→ T7 ─┘
```
- T1 先行（契约定稿）；T2→T3 串行（同私有仓 feature/ 文件面）
- T4/T5 可并行于 T2/T3（前端纯件）；T6 依赖 T3（regionIndex）+T5（草图存在）
- T8 全依赖收口

## 门禁与纪律

- 每任务：实施者 subagent → 评审 → 修复环 → 台账登记（commits 区间+minors+rulings）
- 私有仓改动：直接改 `D:\Github\luban-backend` 源码，开发态 `start-ms-host.ps1 -Source` 验证；**不触发发布**（发布窗悬置中）；提交私有仓单独 commit 并在台账登记
- 演示纪律：冒烟失败即关浏览器清现场（demo-failure-discipline 记忆）
- 演示/冒烟选择器复用 e2e helpers，禁凭记忆写
- 单位：内部米制；T8 冒烟用 mm 输入（如 50mm 深）避免英寸换算噪声

## 风险登记

| 风险 | 缓解 |
|---|---|
| RegionOps 在后端 Node 侧运行（core-geometry 在 modeling-server link 链上，已确认可用） | T3 先写最小探针验证 import 链 |
| arc 起止角解算语义（三点弧→圆心半径角度） | 前端只传三点/或传 center+radius+angle 由 T5 定稿 DTO 时钉死；后端以 DTO 为准 |
| 草图平面变换（Front=XZ 竖直面）与 planeZ=0 旧假设冲突 | T4 平面参数入 op；几何流/解算仍在局部 2D，Sweep 前经变换到世界系（T3 消费） |
| SlvsSolver native binding 源码构建 | dist 已有 slvs.node 产物，源码模式复用（native/ 目录随产物）；若缺失 T2 先行验证加载 |
