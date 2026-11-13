# AIRR — 工具栏逐按钮 live 全量对拍（特征 + 草图）

- 状态：Implemented（2026-11-13 工作树；UI/交互层；无契约/后端/native 变更）
- 关联：用户 2026-11-13 要求「对照 Onshape 严格检查每一个工具栏菜单按钮，
  操作交互全面对齐，不能自创」；P0-03（live 证据优先）、P0-05（点击仍走既有
  FeatureOp/工具管道）、P1-05（渲染/交互纪律）；未修改 itwinjs-core。
- live 证据（私有 `onshape-parity-data/ui-evidence/toolbar-audit-20261113/`）：
  `02-toolbar-tools.json`（27 钮顺序/图标）、`12-tooltips.json`（主钮
  tooltip+快捷键）、`15-dropdowns.json`（9 个特征飞菜单逐项）、
  `20-23`（草图工具栏 20 钮 tooltip/快捷键 + 12 个飞菜单 + 只读进入后取消的
  清理证据）。会话曾超时，重连后采集；探针未改动文档（草图 3 已取消）。

## 主要差异与修复

### 特征工具栏
- **删除自创分组**：此前注册表带一个 Onshape 主工具栏没有的「曲面/曲线」独立组
  （`surfaceCurve`，工具栏隐藏但命令搜索可见）。live 中这些命令属于
  **参考 → 平面 ▾** 飞菜单；已移除该组/工具，功能不丢。
- **平面 ▾ 25 项逐字对齐**：平面/偏移曲面/边界曲面/填充/移动边界/直纹曲面/
  相互修剪/约束曲面/螺旋/3D 拟合样条/投影曲线/桥接曲线/复合曲线/交点曲线/
  修剪曲线/等斜线/偏移曲线/等参曲线/编辑曲线/路线曲线/**配合连接器
  (ctrl+m)**/派生/变量/查询变量/复合零件/标记。补齐此前缺失的 6 项；子项
  文案补全（投影曲线/桥接曲线/…）。
- **钣金模型 ▾ 修正**：父行+11 变体（法兰/卷边/薄片/折弯/成型/钣金放样/
  制作接头/**角点**/折弯止裂槽/尖角倒钝/结束钣金模型）；删除 live 不存在的
  SMJog/PCBFlexModel/PCBEndFlexModel。
- **自定义特征**：live 主钮是文档自定义 FeatureScript 名（本机证据
  「Calculate bounds」）+ 固定末项「添加自定义特征」。本仓无 FeatureScript
  运行时，保留父行「添加自定义特征」并 gated；不复刻文档特定项。
- 加厚/圆角/拔模/线性阵列/变换/框架飞菜单已与 live 逐字一致（父行由
  RibbonDropdown 自动前置）。
- 撤消/重做 tooltip 补快捷键（cmd+z/ctrl+z、ctrl+y/shift+cmd+z），并实现
  ctrl+z / ctrl+y / ctrl+shift+z 键位。

### 草图工具栏
- 主钮文案按 live 修正：**三点圆弧**（菜单父行=3 点圆弧）、**草图圆角**（父行=
  圆角）、**内接多边形**（父行=内切多边形）、**使用（投影/转换）**（父行=使用）；
  新增 `menuLabelKey` 区分工具栏 tooltip 与飞菜单父行。
- 飞菜单变体逐字/逐序对齐：矩形→中心点矩形(r)/对齐矩形；圆→3 点圆/椭圆；
  圆弧→相切圆弧/圆心圆弧/椭圆弧/圆锥；多边形→外接多边形；样条→Bezier/
  样条控制点；使用→交点；修剪→延伸(x)/分割；偏移→槽；线性阵列→环形阵列/
  变换；插入 DXF 或 DWG→插入图像。
- 约束飞菜单补齐 live 全 15 行：重合(i)/同心(shift+o)/平行(b)/相切(t)/
  水平(h)/竖直(v)/垂直(shift+l)/**等长(e)**（原名相等）/中点(shift+m)/
  法向(shift+k)/穿透(shift+g)/对称(shift+q)/固定(shift+j)/曲率(shift+u)/
  草图流。
- **快捷键**：主钮 l/g/c/a/shift+s/u/q/shift+f/m/o/d/i 与全部变体 keycap
  在 tooltip/飞菜单显示；草图态按模式表生效（shift+s=点，特征态=新建草图），
  捕获阶段监听（工具激活时仍可切换工具）。
- **Esc 交互修复**：飞菜单打开时按 Esc 只关闭菜单，不再连带退出草图
  （SketchDialog 对 `event.defaultPrevented` 让位）。

## 能力状态（诚实登记）

所有 live 项均已渲染并具备 live 文案/顺序/快捷键。**功能实现**状态：
- full：草图/特征既有工具（线、矩形、圆、圆弧、样条、点、偏移、镜像、线性/
  环形阵列、变换、圆角/倒角、修剪/延伸/分割、约束 8 项、尺寸、拉伸/旋转/
  扫掠/放样、圆角/倒角、孔/抽壳/分割/变换/布尔/删除零件等，见能力矩阵）。
- gated（点击打开能力引导，说明真实原因，不是静默 no-op）：加厚（含封闭）、
  面混合、拔模/主体拔模、曲线阵列、包覆、印花、筋、外部螺纹、修改圆角/
  删除面/替换面、框架▾、钣金▾、平面▾ 曲面/曲线/装配参考、添加自定义特征、
  草图文本/椭圆/椭圆弧/圆锥/3 点圆之外的样条控制点/中点线/交点/槽/插入图像、
  草图约束同心/法向/穿透/对称/曲率/草图流。
- 这些 gated 项的反转 = 后端/内核/求解器实现（Stage G 分波），不改变本切片
  UI 契约。
- 图标：飞菜单变体暂复用家族图标（live 每项有独立 glyph；本次只采集了
  文案/keycap，未采集图标资产）。

## 测试

- 新增 `src/modules/part-studio/test/toolbar-live-parity.test.ts`（5 例）：特征
  27 钮/4 快捷键/9 飞菜单逐字；草图 20 钮/快捷键/12 飞菜单逐字（含 15 约束行）。
- 更新 `ribbon-registry.test.ts`（27 工具、9 飞菜单、74 命令）、
  `capabilities.test.ts`（gated 53）、`SketchDialog.test.tsx`（live 文案/顺序 +
  Esc defaultPrevented 守卫）。
- web 全量：**137 files / 1821 tests passed**。
- 真栈新增 `e2e/toolbar-live-parity.spec.ts` **3 passed**：平面▾ 26 行
  （父行+25）逐字+ctrl+m keycap；特征 shift+s 开草图对话框；约束▾ 15 行
  文案/keycap 逐字；草图 l→线、shift+s→点、m→修剪；Esc 关菜单不退出草图。
- 真栈标签重命名回归：sketch-bezier / center-arc / center-rectangle /
  perimeter-circle / polygon（内切+外切）/ use / fillet（4 用例）共
  **12 passed（3.6 min）**。
- `tutorial2-tools`（9.3 min 长批）3 passed / 4 failed；其中「绘制」「圆」两项
  单独重跑各 **2 passed**（长批负载下的点击抖动），另两项「约束」「标注」计数
  差 1 为本机既有环境红（2026-11-13 editor-state AIRR 已用未修改代码复现同值）。
- `tsc`（src/e2e）/ eslint 绿。

## 风险 / 回滚

- 纯 UI 注册表/交互层；回滚还原 registry/sketch-tools/i18n/Ribbon 与测试即可，
  无数据结构/契约迁移。
- 宽度 <~1244px 时工具栏可横向滚动（Onshape 1560 视口不滚）；本切片未实现
  溢出 chevron 菜单，登记为后续 UI 切片。
- 快捷键新增可能导致与工具内部键位冲突：已用模式化映射 + 捕获阶段 +
  `defaultPrevented` 让位控制；如有冲突按 live keycap 调整。
