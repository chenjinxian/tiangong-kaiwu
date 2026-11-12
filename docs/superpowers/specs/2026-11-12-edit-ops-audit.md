# 增/删/改操作审计 — 草图、特征、零件（2026-11-12）

口径：每个用户可编辑对象都必须有增、删、改路径；改=参数/几何可回写且可撤销。未实现
项如实登记，不提供假入口。撤销一律走 iTwin 原生事务（P0-10）；自动保存推送后原生
undo 窗口终止（默认防抖 20s，见 useAutoPush）。

## 草图

| 对象 | 增 | 删 | 改 | 备注 |
|---|---|---|---|---|
| 草图（特征） | ✅ 新建对话框（平面/基准面/模型面） | ✅ 删除（未引用；被特征/外部引用时后端拒收） | ✅ 重命名、平面只读编辑、双击进编辑 | 证据：sketch-delete.spec |
| 曲线实体 | ✅ 线/矩形/圆/弧/样条/多边形/镜像/偏移 | ✅ Delete 键 + 图元右键「删除草图图元」 | ✅ 拖拽（本体/端点/弧扫角）、构造线翻转 | ADR-0018 S1c/S1d + sketch-entity-menu |
| 控制点 | —（随曲线生成） | —（随实体删除） | ✅ 拖拽端点/圆心/样条控制点 | 中点/弧中点暂不支持 |
| 约束/尺寸 | ✅ 约束与尺寸工具 | ✅ 选中尺寸标签 Delete；✅ 非尺寸约束 glyph 单击选中 + Delete（S1g） | ✅ 尺寸双击改值（distance/radius/diameter/length/angle；角度 UI 度 ↔ 契约弧度） | 非尺寸约束 glyph：⊥/∥/=/—/|/中点/重合/镜像等 12 类；`显示约束` 关闭时 glyph 与尺寸标注同时隐藏（live 对拍），拾取一并停用 |
| 面域 | ✅ 闭合轮廓自动成域 | —（随曲线） | 显示填充；无独立面域编辑 | 面域为求解派生 |
| 使用/投影 | ✅ 编辑态 UI「使用」：点其它草图的线/点/圆/弧 → 一次 updateSketch 生成 projected 根实体（后端既有标记重投影通道） | ✅ 删除投影根实体级联清派生点（原生 undo） | ✅ 读时实时重投影（源改半径 → 本草图联动） | 🟠 仅同 PS 更早草图（最近 8 张）作源；实体边/面投影未接（后端切片 1b）；样条源/非平行圆、弧诚实拒收；真栈 `sketch-use.spec.ts` 2 passed |
| Trim | — | ✅ 点击段/无交点整删（线/圆/弧/**三次贝塞尔样条**） | ✅ 连续修剪；Esc 结束工具不退出草图 | `Sketch.Trim` 真栈 `sketch-trim.spec.ts` + 样条用例（de Casteljau 精确分裂，交点检测折线细分近似）；periodic/非四次控制点/投影样条诚实 unsupported |
| Fillet（草图） | ✅ 点击两条直线共享角点立即生成相切圆弧（默认 R5 mm + coincident×2/tangent×2/radius）；✅ 依次单击两条不相连直线在延长交点倒角（悬停预览）；✅ 显式 point 端点（分离为内联点 + 孤儿点清理）；✅ 直线-圆弧角点（源弧随 tangent 收窄） | —（随曲线/约束 Delete） | ✅ R 尺寸双击改值重解算；工具保持激活可连续倒角 | Live 2026-11-12 实测：无独立半径框，点角点即出 arc + R 尺寸（英寸文档 R0.25）；两曲线选择要求切点落在线段内，平行/十字交叉四解/间隙大于切距诚实拒收；三线以上共点/整圆/样条/投影未支持；`sketch-fillet.spec.ts` 真栈 5 例（角点 R5→R8、两曲线 L 形、显式点角点、线-弧 R5 弧-弧相切）+ 14 单测 |
| Extend（草图） | — | — | ✅ 两相延伸：先选线/弧，再点边界（线/圆/弧）或自由端点；线源移动端点、弧源增长扫角；圆/样条源未实现 | 修剪同一下拉（官方帮助，快捷键 X）；`Sketch.Extend` 真栈（线/弧）+ 17 单测；无边界/反方向保持原样；共用 view→NPC 反解已修为官方 viewToNpc |
| 插入 DXF（草图） | ✅ ASCII DXF 的 LINE/CIRCLE/ARC/POINT/LWPOLYLINE（直线段 + bulge 圆弧段，含闭合）/三次 4 控制点 SPLINE → 当前草图（$INSUNITS 换算 mm；一次 updateSketch 可撤销） | — | — | `dxf-import` 12 单测 + `sketch-dxf-import.spec.ts` 真栈；DWG/BLOCKS/INSERT/非三次·周期样条/放置对话框未做（诚实拒收/跳过计数） |
| Copy/Transform（草图图元） | ✅ 复制到会话剪贴板（选中曲线 + 直接引用的显式 point；只带内部约束）；菜单与 Ctrl/Cmd+C 同语义；🟠 线性/环形阵列 canvas gizmo（选中曲线 → 方向/间距/计数或中心/计数手柄 → 一次 updateSketch；实例为独立副本，无阵列关系联动）；🟠 变换 canvas gizmo（移动/旋转/均匀缩放手柄 → 一次 updateSketch；内部尺寸同步缩放；数值输入未实现） | — | ✅ 粘贴原位副本并选中（一次 updateSketch，可撤销；id/约束重映射）；菜单与 Ctrl/Cmd+V 同语义；❌ 变换数值输入/自定义基点/非均匀缩放 | Live 实测：复制后菜单出现粘贴；草图阵列/变换都是 canvas manipulator（无 DOM 对话框）。**线性/环形阵列与变换（平移+旋转+均匀缩放）已实现**：`internal/sketch-pattern.ts` + `SketchPatternGizmo` + store `sketch.pattern`；真栈 `sketch-pattern.spec.ts` 6 用例（线性 3 圆 x=0/0.02/0.04 m、成品先提交、undo；环形 count 4 绕原点 90° 均分；变换 +20 mm → x=0.02；缩放 2× → 半径 20 mm → undo；全文件最后一个用例偶发被 MS 429 限流，单跑通过）。数值输入/自定义基点/非均匀缩放待后续；拉伸…/旋转… 已接（退出草图→FeatureDialog）。`sketch-clipboard.test.ts` 3 条 + `sketch-entity-menu.spec.ts` 真栈（菜单 + 键盘） |

## 特征

| 对象 | 增 | 删 | 改 | 备注 |
|---|---|---|---|---|
| 挤压/旋转/放样/扫掠等 | ✅ 对话框 | ✅ 树右键删除（HITL） | ✅ 双击编辑（updateParams）；多截面 loft 已接 | 特征重排 blocked：`reorderFeature` 契约在，但线性 prev 边让真实特征重排全部被依赖序守卫拒收（2026-11-12 实测：两个 newBody 拉伸之间仍有 feature→feature 边；Onshape live 允许拖动并重算、把依赖破坏行标红）。需 ADR 重定义 reorder 的链重建/依赖校验，不能以拖动 UI 假装可用 |
| 圆角/倒角/抽壳/孔/移动面/变换/分割/布尔/阵列/镜像 | ✅ | ✅ | ✅（按能力，部分只读项例外） | 见 luban-cad 能力矩阵 |
| 抑制 | — | — | ✅ 右键抑制/取消 | — |
| 重命名 | — | — | ✅ 树内联，特征行与**草图行**同路径（v1.70：`renameFeature` RPC → `jsonProperties.luban.feature.name`，`getFeatureTree[].name` 读面；后端按 def/phys model 解析 scope；真栈 rename+push 冷重开） | 只改显示元数据，不建历史特征/不动 params；tree-interactions/part-rename 真栈 |
| 回滚（滚动到此处） | — | — | ❌ 菜单禁用 | 需后端 scope 级重建截止语义（ADR） |
| 文件夹/表达式/评论/依赖项/特征外观 | ❌ | ❌ | ❌ | 菜单禁用并注明未支持 |
| 多选特征 | ❌ | ❌ | ❌ | Onshape live 实测 Ctrl 点击树行仍单行 selected；一致 |
| 复制/变换特征 | ❌ | — | — | 无对应后端 op |

## 零件（body）

| 对象 | 增 | 删 | 改 | 备注 |
|---|---|---|---|---|
| 零件 | ✅ 产体特征 | 🟠 NEW-body 驱动特征可删（零件行「删除…」→ HITL → deleteFeature(源, targetBodyId)，undo 已验证）；任意 body 的 Delete Part 历史特征未做 | ✅ 重命名（v1.70 `renameBody` RPC → userLabel + marker.name，undo 已验证）；🟠 material 未支持；隐藏/显示、**隐藏其他零件、隐藏所有零件**（会话级）、**使之透明…**（单 body 会话滑块，简化）、**隔离…**（简化：立即隔离 + 横幅退出并恢复隐藏集）、外观、放大、属性可用 | 复制/工程图/导出/发布 菜单禁用；真栈 `part-rename.spec.ts` + `part-delete.spec.ts`；被 fillet/hole 改写的 body 删除诚实禁用；隐藏批量动作 store.hiddenIds 单一通道；透明度面板完整控件未做 |
| 体积读面 | — | — | ✅ 行内体积 + 属性对话框 | 只读 |

## 交叉删除语义

- 删除特征：HITL 确认，targetBodyId 由 sourceFeatureId 反查；无源不多猜。
- 删除草图：被特征引用拒收（后端文案）；引用解除后可删。
- 删除草图实体：引用它的约束级联移除；点实体仍被引用时整单拒收。
- 删除尺寸：只移除该约束，实体/其它约束不动（sketch-dimension-edit 真栈）。

## 已知缺口优先级（建议）

1. ✅ 非尺寸约束选中与删除 + `显示约束` 显隐（S1g，2026-11-12）。
2. ✅ 草图 Fillet（S1k，2026-11-12；live 实测点击角点立即生成圆弧 + 可编辑 R 尺寸，无半径框；两线角点首切片，线弧组合/两曲线选择/显式点端点待做）。
3. ✅ Extend 线端点切片（S1i，2026-11-12；弧/圆/样条源与边界点选第二相待做）。
4. 草图变换数值输入/自定义基点/非均匀缩放（阵列与变换的移动/旋转/均匀缩放手柄已实现；Onshape live 实证为 canvas gizmo，非对话框）。
5. 零件删除的完整 Delete Part 历史特征（多选任意零件/历史点删除；首切片已支持 NEW-body 驱动特征）。零件/特征重命名已完成（v1.70 元数据 RPC，真栈 undo + 冷重开）。
6. 特征回滚/重排（后端 scope 重建截止 + 顺序契约，需 ADR）。重排现状：Onshape live 拖动行即重排（蓝色行名 chip；依赖被破坏的下游行标红，2026-11-12 直接操作 `LubanCAD 覆盖 - Bumper Block` 副本实证）；本产品 `reorderFeature` 受线性 prev 边守卫，真实拖动会被服务端拒收（newBody 拉伸同样有边），因此**不提供拖拽 UI**，待后端 reorder 重建语义 ADR 后接线。
7. Use 实体边/面投影（草图→草图 UI 已于 2026-11-13 完成；实体边/面需后端几何投影通道切片 1b）。
