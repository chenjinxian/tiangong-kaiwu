# AIRR — 草图「中点线」接通（live 飞菜单变体转 full）

- 状态：Implemented（2026-11-13 工作树；前端工具/能力位；无契约/后端变更）
- 关联：`2026-11-13-toolbar-live-parity-airr.md`（线 ▾ flyout 第二行「中点线」原
  gated）；P0-05（updateSketch 唯一管道）、P0-10（标准可撤销）。
- 参考：Onshape Help「Midpoint Line」——**先点击放置中点，再点击放置端点**，
  线段两端关于中点对称（live 工具栏该行无快捷键）。
- 复用：`SketchCreateTool` 基类（锚点状态机/AccuSnap 取点/预览/auto-weld/
  applyUpdate 乐观提交）；shared `midpoint` 约束（point+line 形态，后端
  `SketchWireNormalizer`/`SlvsSolver` AT_MIDPOINT 已支持）。

## 实现

- `SketchMidlineTool`（toolId `Sketch.Midline`）：
  - 首击 M、次击 A → 实体 `line(B→A)`（B=2M−A）+ `point(M)`；
  - 约束 `{kind:'midpoint', refs:[pointId, lineId]}`（后端 point+line 形态）；
  - 零长拒收（M=A）；构造模式继承基类（线为 construction，点保持普通）；
  - 预览：对称线段随光标（M 不动、另一端镜像）。
- 注册：`registerSketchTools` 增加该工具（幂等）。
- 工具栏：线 ▾ 子项 id 由 `sketchMidline` 改为 `Sketch.Midline`（与工具 toolId
  一致）；能力 `sketchMidline` gated→full（guide 词条删除）；图标复用线图标。
- i18n：`sketch.create.midline.firstPrompt/nextPrompt`（zh/en）。
- 非目标：连续绘制模式（已于 `2026-11-13-sketch-continuous-drawing-airr.md`
  接通：中点线提交后保持激活、空锚点开始下一形状），端点 auto-weld 走基类
  （与直线工具同口径）。

## 测试

- 单测：`SketchCreateTool.test.ts` 新增中点线 buildShape——对称端点/中点
  point/midpoint refs；零长 undefined。
- web 全量：137 files / **1818 tests passed**（gated 集合 52→51）。
- 真栈：`e2e/sketch-midline.spec.ts` **2 passed**——RPC 建 Front 空草图 →
  双击树进编辑 → 线 ▾「中点线」→ 中点点 (0,0)、端点 (10,0) →
  `getSketch` 实体=2（line+point）、线段两端和≈0（对称）、中点约束落库；
  完成草图后约束仍在。
- `tsc`（src/e2e）/eslint 绿。

## 风险 / 回滚

- 纯前端工具注册与能力位；回滚删除工具类/注册/菜单项/能力位即可，无数据迁移
  （新约束形态现有求解器已支持，旧荷载不受影响）。
- 中点线提交后与其它绘制工具一致退出（Onshape 连续模式的差异登记在 toolbar
  AIRR 的交互长尾中）。
