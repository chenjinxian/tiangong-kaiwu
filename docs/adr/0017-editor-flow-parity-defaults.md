# ADR-0017 — Editor Flow Parity: persisted render defaults, first-paint background, tab/sketch UX, autosave & document-level versions

- 状态：Proposed（Owner 待签字）
- 日期：2026-11-12
- 关联：AIRR `docs/superpowers/specs/2026-11-12-editor-flow-parity-airr.md`
- 影响仓：luban-cad（web/viewer/shared）、私有 luban-backend（modeling-server/webhook-agent）

## 1. 背景

用户要求从“新建项目/文档 → 进入 Part Studio”开始，把 7 条流程按 Onshape live UI 全面对齐（最高优先级）：

1. 创建 iModel 时写入默认视图、材质、渲染默认值；
2. 编辑器首帧直接显示默认背景，不出现全黑再切白；
3. 新建 Part Studio 的 Onshape 式“插入新页签”；
4. 创建草图（含模型面平面）；
5. 编辑草图；
6. 添加特征；
7. 提交修改与发布版本。

Live 取证（私有 `editor-flow-parity-20261112`）确认：
- Onshape Part Studio 背景为 **#ffffff**，零件默认渲染色约 **#536674**，高亮约 **#95b8d1**；导航到 ready 的 69 帧中无全黑帧；
- “插入新页签”菜单顺序：应用程序 / 创建材料库 / Feature Studio / CAM·PCB·Render Studio（升级）/ Part Studio / 装配体 / Variable Studio / 工程图… / 文件夹 / 导入…；
- Sketch 工具点击后立即在树中出现待定“草图 1”，选择平面后 ✓ 启用并进入草图模式；模型面可作为平面（`copy-pilot-20261106` 中 `Extrude 1 的面`）；
- 树双击草图进入编辑；拉伸对话框含实体/曲面/薄壁与新建/加入/移除/相交；
- 版本由左栏“创建版本…”生成（标题“创建来自 Main 的版本”，默认名称 V1，说明 + 创建/创建版本并编辑属性/取消），无保存/推送控件。

当前实现缺陷（证据见 AIRR）：baseline 写黑色背景/自定义灯光/iso 视图并立即被 web 覆盖；`ScreenViewport` 在白色背景写入前加入渲染循环；“+”直接创建固定名 `Part Studio 1`；草图画廊只支持三基准面/cPlane；保存暴露“推送/未推送”，版本为 Part Studio 级元数据。

## 2. 决策

### D1. 渲染默认值单一事实源
在 `@luban-cad/shared` 新增 `render-defaults`（additive，无 RPC 方法），由 web/viewer 与私有 baseline-generator 共同消费（或生成受测试约束的等价私有常量）。新建 iModel 的 baseline 写入：
- `DisplayStyle3d 'default'`：规范背景、view flags、光照、边样式；
- `SpatialCategory`（含 `LubanBodySolid` 创建路径）规范 `SubCategoryAppearance`；
- `SpatialViewDefinition` 默认 iso 视图，名称大小写稳定。
前端只读取/增量应用；不新建第二设置或相机权威。老 iModel 不读时迁移。

### D2. 首帧背景先于渲染循环
在 `getDefaultViewState` 之后、`ScreenViewport.create`/`addViewport` 之前，对 ViewState 应用 render baseline 与主题背景；`.part-studio-viewport` 增加主题 CSS 底色；`useDisplaySettings` 初始化同步应用。保留后台模型/类别/取景异步。

### D3. 页签创建与命名
“+”改为 Onshape 风格“插入新页签”菜单。Part Studio 可用；Assembly/Drawing/Variable Studio/工程图/文件夹/导入等未支持项按 Onshape 列出但禁用并标注“未支持”（不创建假页签）。新增 `nextPartStudioName` 保证 `Part Studio N` 唯一；空文档自动创建也用它。

### D4. 草图平面与生命周期
草图对话框期间保留单一选择权威（仅草图例外，不暂停/清空选择），允许单个平面模型面作为草图平面：经 `useBrepTopology` 面句柄生成 `SketchPlaneDto` 快照（normal/origin/xDir），非平面/多面/无拓扑失败。草图仍只存 params，不新增平面存储。对话框生命周期按 live 取证（待定草图、平面 chip、✓ 启用、草图工具栏、✓ 退出）；移除/接通无功能的历史时钟。

### D5. 自动保存与文档级版本（完全 Onshape 化）
- 每次成功提交仍本地 `saveChanges`；新增 `useAutoPush`：防抖 20–30s、single-flight、失败可见并重试、只读/降级 scope 不推送，对 hub 静默推送 changeset。
- 移除常规“保存/推送/未推送”UI 与 Ctrl+S 保存语义；保留 dev 开关一个周期用于回滚。
- “创建版本…”按 live 取证重做（默认 V1、名称/说明、创建/创建版本并编辑属性/取消）；创建前 flush 未推送变更；版本作用于当前 iModel（含全部 Part Studio scope），历史面板展示命名版本与 changeset。
- 已知限制：`pushChanges` 会开启新 changeset 会话，已推送事务可能不再可 undo；登记例外，不宣称与 Onshape 相同 undo 深度。

### D6. 特征对齐与缺失特征族
现有特征逐项按 live 证据对齐对话框/字段/预览/✓✗/编辑回显，不重建通道。缺失特征族（Thicken/Draft/Rib/External thread/Delete part/Modify fillet/Delete face/Replace face/Frame/Sheet metal/成形到零件等）按 G1/G2/G3 波次立项，每族独立 ADR + shared 版本 + 后端/内核 + 真栈；未绿前保持 gated 并显示真实原因。内核依赖项先做 SolidKernel.h/ACIS Modeler+Polyhedra 授权审计，blocked-kernel 如实登记。

## 3. 备选方案

1. **保留显式推送**：与 Onshape 不符，否决（用户裁决完全 Onshape 化）。
2. **只改前端 localStorage 默认值**：不满足“创建 iModel 时设置”，且旧 iModel 不可复现；否决。
3. **首帧用遮罩/骨架屏掩盖黑屏**：不满足“直接显示默认背景”，且掩盖问题；否决（仅保留连接骨架屏）。
4. **+菜单只列 Part Studio**：菜单内容与 Onshape 不符；用户选择完整菜单+禁用未支持项。
5. **每 Part Studio 独立版本**：当前一个 iModel 承载全部 scope，与 Onshape 文档级版本不符；否决。
6. **把缺失特征族塞进一个 PR**：违反 P0-04/07 与可回滚性；改为分波次。

## 4. 后果

正面：
- 默认视图/材质/背景由 iModel 单一事实源决定，打开即一致；
- 首帧不再黑屏；
- 页签/草图/特征/版本交互与 Onshape 取证一致；
- 自动保存符合 Onshape 心智模型，冷开无需手动推送。

负面/风险：
- Autosave 与 iTwin push 会话/undo 深度存在语义差异，需例外登记；
- 老 iModel 不迁移，首次视觉由运行时 baseline 归一化；
- 缺失特征族工程量大，G2/G3 可能受内核/授权阻塞；
- 104 个 e2e 依赖 `pushExampleChanges`，需保持签名内部迁移；
- shared/viewer/web/后端需同批发布，否则默认值不一致。

## 5. 接口与兼容

- `@luban-cad/shared`：新增 `render-defaults` 常量；`LubanFeatureRpcInterface` 方法/版本不变（除非后续特征族单独 bump）。
- `createPartStudio(name)` 签名不变；命名由前端 helper 产生，服务端仍以 name 落库。
- Sketch 面平面复用现有 `SketchPlaneDto`；`updateSketch` 不新增 plane 键。
- 版本复用现有 Named Version/changesets REST；不新增 hub DTO。
- Autosave 不新增 RPC；使用现有 `connection.pushChanges`。
- 旧 iModel fixture 继续有效；无 schema 迁移。

## 6. 回滚
- Stage A/B：revert shared/viewer/baseline/CSS；旧数据保留。
- Stage C/D/E：UI 层独立 revert；契约不变。
- Stage F：关闭 `VITE_EDITOR_AUTOSAVE`、恢复推送 UI；版本数据只增不改。
- 各 Stage 单独 PR + 真栈证据；不满足验收不得合并。

## 7. 验收
见 AIRR §1.2、§7 与计划 Stage A–G。任何 Stage 未过“单测 + 真栈 e2e + 视觉/首帧证据”不得宣称完成；G2/G3 未实现能力必须 gated/blocked 并有证据。
