# M6-c 实施计划：Tutorial 2 对齐收官（语义完备+UI 1:1）

> 前置：M6-a（草图闭环）/M6-b（六特征重建 −1.56%）已收官；取证定案（fillet-forensics）三层阻断与边引用缺口在案。
> 采集依据：`TUTORIAL2-FULL-STEPS.md`（完整步骤+48 约束+对话框全参数）。

## 范围裁决

**M6-c = 语义完备 + UI 1:1**，六个任务+验收。**单列 M6-d**：native 边语义深化（边级持久 id 直挂/邻接数通道 C++ 扩展+内核重编译）——工程最重、独立成里程碑；M6-c 内以「Fillet 建序直排」为圆角的过渡 UX（已在 T7-B 实证可用）。

## 任务分解

### T1 私有仓+shared：复合面域拉伸（体积缺口主因）
- shared v1.8：`ExtrudeParams.regionIndex?` → `regions?: number[]`（多面域；regionIndex 兼容保留一版，注释钉弃用指向）
- 私有仓求值器：多面域 → 剖面合成（RegionOps 并集外环，含孔 CSG 复用）→ 单 Sweep；zod 数组语义
- 预期：Tutorial 2 E3 双面域组合后体积进 ±1%
- 单测：双面域体积=两域并（独立库）；与单域回归并存

### T2 私有仓：revolve 真布尔（ADD 语义补全）
- revolve ADD 走布尔并（上游 Unite）——消灭 2 体元素形态（顺带解开 fillet 形态层阻断）
- v1 只 NEW 挂账清偿；Tutorial 2 的 Revolve 1 本就是 ADD
- 单测：revolve+上游=单体；体积=并集解析

### T3 web-next：复合面域选择 UI（依赖 T1）
- FeatureDialog 面域多选 chips（Onshape 语义=多选；现单选下拉升级）
- 载荷 `regions:[...]`；单面域自动简写兼容
- 单测：载荷/门禁/chips 流

### T4 web-next：偏移工具（§3.1 路径——求解器零改动）
- SketchOffsetTool：选链（实体多选）→法向方向裁决→距离输入→闭式造几何（线平行/弧同心半径±d）→展开约束组（parallel+distance / concentric+radius）→桥接焊接
- 乐观提交链复用 SketchCreateTool 基建；ribbon 注册（占位换真）
- 单测：闭式几何/约束展开/拒收回滚

### T5 UI 1:1 对齐批（web-next）
- 工具栏分组序对齐采集规格（Onshape 11 组序——`diag-tools.json`）
- 对话框形态细化：tabs 实体|曲面|薄壁 分组框/✓绿✗红顶置/成品钮/透明度滑块（Onshape 形态已采）
- 视口编辑态：当前特征橙色高亮+后续特征半透明（采集规格 §视口交互）
- revolve 轴命名（「线 3」→智能命名「竖直线/轴线」）
- 小项批：opDsl FEATURE_TYPES 补 revolve/零件段滤 sketch/undo schema-init 提交排查（T7-B 附带发现）

### T6 验收（Tutorial 2 终版对拍）
- 体积 ±1% 金标准（复合面域+真布尔后重测）
- UI 对齐走查：与采集截图逐区对比（工具栏/对话框/视口态）
- 全回归：三仓门禁+e2e 全家

## 依赖与并行
```
T1 ─→ T3 ─┐
T2 ───────┼─→ T6
T4 ───────┤
T5 ───────┘
```
- T1/T2 私有仓串行（同文件面）；T3 等 T1；T4/T5 独立并行
- 每任务独立门禁；T6 全收口

## 风险
| 风险 | 缓解 |
|---|---|
| 多面域剖面并集的内核行为（并集外环 vs 多 Loop 直送） | T1 探针先行（M6-a T3 探针结论：含孔走 CSG） |
| revolve 布尔后切线接触新压印边 | 取证已定位机理；圆角 UX 过渡=建序直排（登记） |
| 偏移方向裁决（法向两侧） | 光标侧/半空间参数化（Onshape halfSpace 语义） |
| UI 对齐的工作量边界 | 以采集规格为钉，不无限精修；视觉钉版复用 M5 基建 |
