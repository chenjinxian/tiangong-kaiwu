# AIRR — 特征树交互对拍（Onshape live 2026-11-12）

- 状态：Implemented（S2 首切片，未发布）
- 关联：ADR-0018（草图直接操纵，S2 为其后续切片）；私有证据
  `D:/Github/onshape-parity-data/ui-evidence/tree-interactions-20261112/`
- 影响仓：luban-cad（web）；无 shared/backend 契约变更

## 1. 需求与 live 证据

用户要求“全面检查特征树的操作功能逻辑（点击/双击/右键/眼睛/重命名/抑制/删除/
回滚条/零件行），对应渲染逻辑对标 Onshape”。

本轮用 CDP Chrome 在自有两份文档上采集（不修改用户文档）：

- 载体 A：自有文档 `LubanUIProbe-20261112`（1 草图，5 行特征）；
- 载体 B：自有副本 `LubanCAD 覆盖 - Bumper Block`（10 特征 + 1 body；含错误行）。
- 证据文件：`tree-interactions.json`（行类名/计数/双击对话框/过滤）、
  `menu-feature.json`、`menu-sketch-part.json`、`menu-*.png`。

关键观察（DOM 实测）：

1. 行选中 = `.os-list-item.selected`；抑制/隐藏行 = `ns-list-item-hidden`；
   错误行 = `ns-list-item-error`；未计算行 = `not-computed`；回滚条 =
   `ns-rollbackbar-holder`；零件段头 = `os-parts-heading-item`。
2. 特征行**没有**眼睛按钮（图标列仅特征类型图标）；零件行右键菜单含
   隐藏/隔离/透明/放大等。
3. Ctrl+点击特征行不产生多选（仍单行 selected）。未实现多选，与现状一致。
4. 过滤态段头计数 = **匹配/总数**：输入 “Fillet” 时显示「特征 (1/12)」。
5. 特征行右键菜单顺序（实测）：重命名 / 编辑… / 将选定内容添加到文件夹… /
   剖视图… / 抑制 / 动态抑制▸ / 添加表达式… / 添加评论 / 放大选定对象 /
   清除选定内容 / 显示依赖项… / 滚动到此处 / 为 N 个选定对象添加外观… / 删除。
6. 零件行右键菜单顺序（实测，body 名 “Bumper Block”）：重命名 / 属性… /
   指定材料… / 编辑外观… / 复制至此… / 创建 … 的工程图… / 导出… / 发布…
   升级 / 隐藏 / 隔离… / 使之透明… / 添加评论 / 放大选定对象 / 删除…。
7. 双击特征行 = 打开特征编辑对话框（实测 Fillet 1 对话框）。
8. 慢双击名称**不**进入内联重命名（实测无 input 出现）——重命名走右键菜单。

## 2. 复用矩阵

| 能力 | 复用 |
|---|---|
| 行选中/错误/抑制/隐藏/活动草图态 | 既有 `TreeRow` + store 单一选择权威 |
| 右键菜单宿主 | 既有 `FeatureTree` 菜单（位置/收合/只读门禁） |
| 隐藏/显示 | 既有 `store.canvas.hiddenIds` 会话态 |
| 外观 | 既有 `AppearancesPanel` + dock store（display 页签） |
| 放大 | iTwin 标准 `Viewport.zoomToElements`（不新增相机状态） |
| 属性 | 既有 `useBodyMassProperties` 读面（体积）+ BodyInfo |
| 过滤计数 | 既有 `useFeatureTree`/`parseTreeFilter`，仅改显示 |

## 3. 本轮实现范围

- 过滤态计数显示 `(matched/total)`；过滤清空恢复 `(total)`。
- 特征行/零件行右键菜单按 live 分组与顺序重排；**支持项**：
  重命名、编辑…/编辑草图…、抑制/取消抑制、删除、清除选定内容、
  放大选定对象（part 行；feature 行仅当有直接 body 映射或单 active body）、
  隐藏/显示、属性…（只读：名称/体积/可见性）、编辑外观…（打开右侧外观面板）。
- 其余 Onshape 条目按要求**渲染但禁用**并带 `title`“该操作暂未支持”，
  不提供假动作、不静默 no-op。
- 零件属性只呈现已有读面，不伪造材料/质量/密度等未读字段。

## 4. 未实现与原因（不伪造）

| 条目 | 原因 |
|---|---|
| 文件夹（添加到文件夹） | 无树分组数据模型 |
| 剖视图… | 无 section-view 能力接入（标准 clip 工具存在，但“按特征剖切”语义未定义） |
| 动态抑制▸ | 后端无动态抑制语义 |
| 添加表达式… | 参数表达式未实现 |
| 添加评论 | 评论子系统未接入 Part Studio |
| 显示依赖项… | 无特征依赖图读面 |
| 滚动到此处 / 回滚条拖动 | 后端无回滚/重建截止语义（v1 线性链）；需先立 ADR |
| 为特征添加外观 | 无 per-feature→元素归属映射（同 2026-11-02 挂账） |
| 零件重命名/指定材料/复制至此/工程图/导出/发布 | 无对应后端/子系统 |
| 隔离/使之透明 | 无会话级隔离栈；透明需渲染覆盖语义评审 |
| 删除零件 | 后端 deleteBodies 未实现（能力矩阵已登记） |
| related-part 高亮 | 无完整特征→body 谱系映射（仅 sourceFeatureId 链尾） |
| 特征行放大（多体/非链尾） | 无 per-feature 几何归属；单 body/直接源可定位 |

## 5. 测试与回滚

- 单测：`FeatureTree.test.tsx`（过滤计数、菜单分组/禁用、属性对话框、
  零件/特征放大、清除选择）。
- 真栈：`e2e/tree-interactions.spec.ts`（种子体 4000 mm³；过滤计数、
  零件菜单、属性体积、zoom 相机位移、外观面板、清除选择）。
- 回滚：仅 UI 改动；删除新增菜单项/计数格式即可恢复旧行为；
  无数据变更。
