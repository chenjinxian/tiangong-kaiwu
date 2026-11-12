# AIRR — Onshape 编辑器全流程对齐（创建 → Part Studio → 草图 → 特征 → 版本）

- 标题：Editor Flow Parity with Onshape（7 条核心流程）
- 日期：2026-11-12
- Owner：LubanCAD 平台（待签字）
- 关联需求：用户 2026-11-12 “最高优先级任务”，7 条流程 + 缺失特征族
- 预计影响仓：`luban-cad`（web/viewer/shared）、私有 `luban-backend`（modeling-server/webhook-agent）；不改 imodel-native/hub 契约
- 是否需要 ADR：是（`docs/adr/0017-editor-flow-parity-defaults.md`）

---

## 1. 目标与验收

### 1.1 用户问题
从“新建项目/文档 → 进入 Part Studio”开始，luban-cad 的默认渲染、页签创建、草图/特征交互、保存与版本语义与 Onshape 不一致：
- iModel 创建时没有写入 Onshape 式默认视图/材质/显示样式；
- 编辑器首帧先黑屏再切白；
- “+”直接创建固定名 Part Studio，无“插入新页签”菜单且重名；
- 草图平面不支持模型面，对话框生命周期与 Onshape 有差异；
- 特征对话框字段/预览/编辑回显未逐项对齐；
- 暴露“保存/推送/未推送”，而 Onshape 是自动保存工作区 + “创建版本…”。

### 1.2 可观察验收
1. 新建 iModel 的 `.bim` 内已写入规范默认 `DisplayStyle3d`、默认 `SpatialViewDefinition`、`LubanBodySolid` 类别外观；清空 localStorage 后首开与 Onshape 取证一致。
2. 从导航到编辑器 ready 期间，画布无全黑帧；首帧即是白底（亮主题）/#262626（暗主题）。
3. “+”打开“插入新页签”菜单（Onshape 顺序/分组），Part Studio 可用、未支持项禁用并标注“未支持”；新页签唯一命名并激活。
4. Sketch 工具 → 选择基准面/cPlane/**单个平面模型面** → 进入草图模式；树双击可编辑草图；平面快照持久化在 sketch params。
5. 现有特征的新增/编辑对话框在字段顺序、默认值、面域/边选择、预览、✓/✗、树命名上与 Onshape 证据一致。
6. 常规 UI 不再出现“保存/推送/未推送”；提交静默同步，冷重开无需手动操作；“创建版本…”对当前 iModel（含全部 Part Studio scope）创建文档级版本并出现在历史。
7. 缺失特征族按 G1/G2/G3 波次落地；未实现前保持 gated 并显示真实原因。

### 1.3 证据
私有证据包 `editor-flow-parity-20261112`（仓外；截图/DOM/ARIA/像素/计算样式 + `manifest.json`）：
- F1 新建文档对话框；F2 首帧 69 帧无黑帧（背景 #ffffff，零件渲染 #536674，高亮 #95b8d1）；F3 插入新页签菜单顺序；F4 Sketch 创建与选面；F5 树双击编辑；F6 拉伸对话框；F7 创建版本对话框（默认 V1/说明/创建版本并编辑属性）。
- 现有证据：`ui-evidence/ui-full-audit-20261106/onshape/dialogs/*`（各特征对话框）、`feature-dialogs-20261108`、`copy-pilot-20261106`（模型面草图平面）、`00-partstudio-shell.html`（工具栏标题/版本 rail）。
- 未取证项显式标记：F1 新文档创建结果（避免创建公开文档）、F3 新建 Part Studio 的实际命名（用 corpus Part Studio 1/2/3 证据）。

### 1.4 非目标
- 不引入第二套模型/渲染/选择/相机状态机；不改 iTwin 渲染器。
- 不伪造未实现的内核能力；G2/G3 中 blocked-kernel 必须登记。
- 不重构 hub 数据模型；命名版本继续复用现有 Named Version API（元数据语义）。
- 不在本 AIRR 内实现缺失特征族（各自 ADR/切片），仅定义程序与门禁。

---

## 2. 关联项目能力清单

| 项目/仓 | 相关能力 | 现有 API/工具/实现 | 版本/路径 | 结论 |
|---|---|---|---|---|
| itwinjs-core | DisplayStyle3d、SpatialViewDefinition、ScreenViewport、ViewManager、BriefcaseTxns | core-common/core-frontend/core-backend 原生 | vendored fork | 复用 |
| luban-cad/packages/viewer | 视口创建、render baseline、主题背景、Briefcase 连接 | `use-viewport.ts`、`render-profile.ts`、`theme-background.ts`、`use-briefcase-connection.ts` | 1.x workspace | 扩展 |
| luban-cad/packages/shared | 跨仓契约、FeatureOp、PartStudioInfo | `LubanFeatureRpcInterface` 1.68.0 | shared | 扩展（新增 render-defaults 仅 additive） |
| luban-cad/packages/editor | 标准编辑基座/草图工具 | editor-common/backend/frontend | 第一方 | 复用 |
| luban-cad/apps/web | 编辑器壳、页签、草图/特征对话框、保存/版本 UI | PartStudioPage/Tabs、SketchDialog、FeatureDialog、dock/rail | web | 扩展/改造 |
| luban-backend/modeling-server | FeatureOp、PartStudioRegistry、类别创建、Named Version 前端调用 | `FeatureService.ts`、`LubanCadSchema.ts` | 私有 | 扩展（类别外观/（可选）默认视图写入） |
| luban-backend/webhook-agent | baseline 生成 | `baseline-generator.ts` | 私有 | 扩展（规范显示样式/类别/视图） |
| imodelhub-services | iModel 创建/Named Version/changesets | 官方风格 REST | 仓外 | 复用（不改 DTO） |
| imodel-native | 无 | — | — | 不适用 |
| DanQing/参考 | 无 | — | — | 不适用 |

---

## 3. 复用决策矩阵

| 需求能力 | 候选复用 | 覆盖度 | 决策 | 理由 |
|---|---|---|---|---|
| 默认视图/背景/材质持久化 | DisplayStyle3d + SpatialViewDefinition + SubCategoryAppearance | 高 | 复用/扩展 | iTwin 原生事实源，避免第二设置通道 |
| 首帧背景 | `applyViewportBackground` + view displayStyle | 高 | 扩展 | 只需提前到 `addViewport` 前并补 CSS 底色 |
| 新页签菜单 | 现有 PartStudioTabs + RibbonDropdown/TabManager 模式 | 中 | 扩展 | 复用 tab 注册表与导航；新增菜单与命名 helper |
| 模型面草图平面 | `useBrepTopology` 面句柄 + `resolveFaceRef`/SketchPlaneDto | 高 | 复用/扩展 | 不新增平面存储，快照进现有 params |
| 特征对话框 | 现有 FeatureDialog/专用 Dialog/预览通道 | 高 | 扩展 | 逐项证据对齐，不重建通道 |
| 自动保存 | 现有每 op saveChanges + `connection.pushChanges` | 高 | 扩展 | 新增防抖单飞 hook，不改事务管道 |
| 文档级版本 | 现有 Named Version API + useChangesets | 高 | 复用 | iModel 含全部 Part Studio scope |
| 缺失特征族 | 现有 FeatureOp 扩展 + 内核 API | 低-中 | 新建切片 | 每族 ADR；内核能力先审计 |

---

## 4. 跨仓影响

| 仓/层 | 契约 | schema/迁移 | native/接口 | 测试 | 发布 |
|---|---|---|---|---|---|
| shared | 新增 `render-defaults` 常量（additive，无 RPC 方法） | 无 | 无 | 单测 | 随 batch |
| viewer | `useViewport` 选项/timing；纯 ViewState applier | 无 | 无 | 单测 | 重建 dist |
| web | 页签菜单/命名、Sketch 面平面、对话框、autosave/version UI | 无 | 无 | 单测+真栈 | web 构建 |
| modeling-server | `LubanBodySolid` 类别 appearance；可选默认视图写入 | 无新 schema | 无新 RPC | 后端测试 | 产物/MS |
| webhook-agent | baseline DisplayStyle/类别/视图默认值 | 无 | 无 | 生成器测试 | 镜像 |
| hub | 无 DTO/接口变更 | 无 | 无 | 复用 | — |

- 版本兼容：老 iModel 不做读时迁移；运行时 baseline 继续归一化。新 iModel 才带新默认值。
- 配对 PR/发布顺序：shared → webhook-agent/modeling-server → viewer → web；镜像/MS 产物重建后 `verify-stack`。
- 接口冻结：`LubanFeatureRpcInterface` 方法不变；Autosave 不新增 RPC；Named Version 复用现有 REST。

---

## 5. 数据/事务/安全

- 数据事实源：iModel/BIS（DisplayStyle3d、SpatialViewDefinition、SubCategoryAppearance、sketch params）。
- schema/params：草图平面快照复用 `SketchPlaneDto`；无 schema 迁移。
- 旧数据 fixture：现有 iModel 黑底/类别不改写，由 Stage B 的首帧路径 + 运行时 baseline 处理。
- 事务边界：所有特征仍走 FeatureOp → saveChanges；自动推送是 changeset 层，不绕过事务。
- Undo/redo：push 会开启新 changeset 会话，已推送事务的 undo 深度可能受限——在 ADR 与例外登记；不宣称与 Onshape 相同。
- 写租约/限流：沿用 usePartStudioSession 租约；autosave 单飞+防抖，失败可见并重试。
- 权限：只读/降级 scope 不自动推送；不新增密钥/日志泄露。

---

## 6. 性能与渲染

- 首帧预算：背景/显示样式在 `ScreenViewport.create` 前同步应用，不新增 IPC；首帧 screencast 无黑帧。
- 视口创建链不新增阻塞 await；模型/类别/取景仍在后台异步。
- 默认材质只设类别外观，不逐 body 写 FeatureAppearance；不改变渲染管线。
- 视觉基线：新增首帧像素测试；UI 视觉基线仅在逐像素审阅后更新。

---

## 7. 测试证据

- 单元：render-defaults 值、useViewport 调用顺序、theme background、tab 菜单/命名、face→plane、autosave debounce、version dialog。
- StandaloneDb：baseline 生成器读回 display style/category/view。
- 真栈 e2e：`editor-first-frame.spec.ts`、`new-part-studio.spec.ts`、`sketch-face-plane.spec.ts`、`sketch-edit.spec.ts`、`feature-flow-parity.spec.ts`、`autosave-version.spec.ts`。
- 回归：`b-model`、`part-studio`、`b-viewport`、`tutorial2-tools`、`verify-imodels`、代表性 examples 的 `pushExampleChanges`。
- 负路径：无面/多面/非平面草图平面诚实失败；autosave 失败可见不假成功；版本创建前 flush 失败保持对话框。
- known-red：G2/G3 内核依赖项单独登记，不在本 AIRR 宣称绿。

---

## 8. 回滚与发布

- Stage A/B：revert shared/viewer/baseline/CSS；旧 iModel 数据不受影响。
- Stage C/D/E：UI 层改动可独立 revert；契约不变。
- Stage F：env `VITE_EDITOR_AUTOSAVE` 关闭 + 恢复推送 UI；Named Version 数据只增。
- 发布门：shared 版本 bump、镜像/MS 产物、`verify-stack` 全绿、release owner 执行。

---

## 9. 评审结论

- 复用矩阵完成：是
- 跨仓影响明确：是
- P0 例外已登记：待 ADR 登记 autosave/undo 语义
- ADR：需要（0017）
- Owner 签字：待签
- 结论：修改后批准（以 ADR-0017 与 Stage 0 证据为准）

---

## 10. Stage A/B 实施结果（2026-11-12）

- Stage A：`RENDER_DEFAULTS`（`luban-cad/packages/shared/src/render/render-defaults.ts`）
  为唯一常量源；webhook-agent 新建 baseline 的 `DisplayStyle3d 'default'`
  （背景 `0xffffff`、AO 开、边色/线宽、光照）与 `SpatialCategory` 外观
  （零件灰 `rgbToTbgr({83,102,116}) = 7628371`）落库；`LubanBodySolid` 类别同色。
  验证工具 `webhook-agent/tools/verify-baseline-defaults.ts` 读回 .bim 断言 PASS，
  `SpatialViewDefinition` code=`default`。
- Stage B：`applyViewStateRenderBaseline`/`applyViewStateBackground` 在
  `ScreenViewport.create`/`addViewport` 之前应用；`.part-studio-viewport` 加
  CSS 底色兜底。真栈 `e2e/editor-first-frame.spec.ts` 连续 23 帧采样
  worstDark=0.000（阈值 <0.5）。
- 单测：shared 205/205、viewer 134/134、web 1537/1537、webhook-agent 50/50、
  modeling-server schema 5/5；web tsc/lint/e2e tsc 绿。
- 老 iModel 不改写；运行时 baseline 继续归一化。

## 11. Stage C 实施结果（2026-11-12）

- 「+」改为 Onshape「插入新页签」锚定菜单（`f3-insert-tab-menu` 证据）：
  顺序 应用程序 / 创建材料库 / Feature Studio / CAM / PCB / Render Studio /
  Part Studio / 装配体 / Variable Studio / 工程图… / 文件夹 / 导入…，
  3 条分隔线；仅「创建 Part Studio」可用，其余禁用并标「未支持」。
- `nextPartStudioName(studios)`：最小未占用的 `Part Studio N`；`+` 与空文档
  自动创建共用（修复重复默认名）。
- 验证：web **1543/1543**（PartStudioTabs 菜单结构/禁用、nextPartStudioName 5 例）；
  tsc/lint/e2e tsc 绿；真栈 `e2e/new-part-studio.spec.ts` **2 passed（34.6s）**
  （菜单结构、连续创建 Part Studio 2/3、URL 切换、Briefcase 连接键不变），
  `e2e/part-studio.spec.ts` **9/9 passed（1.9m）**。
- 未支持项不创建假页签、不弹假内容；切换页签相机记忆未实现（Onshape 行为
  未采集到证据，记为 parity gap）。

## 12. Stage D 实施结果（2026-11-12）

- 草图对话框期间选择工具**不再暂停/清空**（仅草图例外；其它对话框与草图
  编辑态仍暂停）：可在视口拾取单个平面模型面作为草图平面。
- 新增 `internal/sketch-plane-from-face.ts` 纯转换：面平面法向 + 首环点 +
  首环线投影 xDir；退化/非平面诚实失败（Error toast，不编造平面）。
  `readBrepFaceHandle` 走同一 SolidModeling 缓存通道读单面（不清缓存，
  经 BRep 命令协调器串行）。
- 草图对话框平面字段显示「模型面」chip（可 × 清除）；平面快照随
  `insertSketch.plane` 落 params，判据仍唯一为 params。
- Escape = 取消草图工具（红 X 同义）；树行双击编辑既有草图，平面字段只读
  （updateSketch 无 plane 键）。
- 验证：web **1554/1554**（face→plane 纯测 8、canvas 接线 2、Escape 1）；
  tsc/lint/e2e tsc 绿；真栈 `e2e/sketch-face-plane.spec.ts` **2 passed（1.3m）**
  ——板顶面 → 模型面草图（plane.origin.z=5/normal +Z 落 params）→ φ6 拉伸 2
  **2056.547 vs 2056.549 mm³** push+冷重开；`sketch-edit.spec.ts` **2 passed
  （40.3s）**；`sketch-aligned-rectangle.spec.ts` **2 passed（52.4s）** 回归。
- 未做：面平面改参联动（平面是创建快照，Onshape 允许改平面——需 updateSketch
  扩 plane，本切片按契约只读并诚实呈现）。

## 13. Stage E 实施结果（2026-11-12）

证据：`f6-extrude-dialog.png` + DOM（5 个 `type=checkbox`：方向/起始偏移/对称/
拔模/第二个终止位置；底栏仅滑杆 + ?）。
- 方向/起始偏移由伪折叠段改为**真复选框**：方向=反向（`direction:'backward'`）；
  起始偏移勾选才显示值行并随载荷下发 `startOffsetMm`；两者 edit 模式回显落库值
  （此前恒 forward/空）。
- 移除重复的「第二个终止位置」伪折叠段与底栏「成品」按钮（唯一确认=标题行 ✓）；
  终止条件组合框去掉多余的可见「终止条件」标签（当前值即标签）。
- 验证：web **1555/1555**（FeatureDialog 181、Canvas 22）；tsc/lint/e2e tsc 绿；
  真栈 `e2e/feature-flow-parity.spec.ts` **2 passed（1.0m）**——拉伸 5/反向/偏移 2
  得 z∈[-3,2]、质心 z=-0.5、2000 mm³，树行双击回显两勾选，push+冷重开一致；
  `e2e/extrude-draft-ui.spec.ts` **2 passed（55.3s）** 回归。
- 未做：方向作为独立「指定方向」参数（Onshape 可选轴）——本产品契约只有
  forward/backward；不渲染无通道控件。

## 14. Stage F 实施结果（2026-11-12）

- 自动保存：`useAutoPush`（防抖 2.5s 可调、single-flight、失败可见 + 15s 重试、
  `flush()` 供创建版本前落库）；默认开启，`VITE_EDITOR_AUTOSAVE=0|false` 回滚，
  `VITE_EDITOR_AUTOSAVE_DEBOUNCE_MS` 调窗口。仅可写 scope（canEdit ∧
  !readonlyBlocked）生效。
- 常规 UI 移除保存/推送入口与「未推送」徽标（dock 历史面板只剩
  changesets/命名版本/当前版本）；`pushExampleChanges` 签名不变，内部先经
  e2e 桥以自定义描述冲刷、再等待自动保存落定（老 spec 兼容）。
- 「创建版本…」按 f7 证据：标题「创建来自 Main 的版本」、名称缺省 V1、
  说明（≤10000 字符）+ 合并特征更改提示、「创建 / 创建版本并编辑属性（禁用以
  示未支持）/ 取消」；确认前 flush 自动保存。
- 例外：X-15 自动保存 push 会话与 undo 深度（ADR/EXCEPTIONS 登记，不宣称
  与 Onshape 相同 undo 深度）。
- 验证：web **1559/1559**、tsc/lint/e2e tsc 绿；真栈
  `e2e/autosave-version.spec.ts` **2 passed（49.3s）**——UI 提交后 hub
  changesets 增加且描述「自动保存」、版本对话框与命名版本、刷新冷重开仍在；
  `e2e/part-studio.spec.ts` 版本 + 五区用例回归、`e2e/examples/shell-face.spec.ts`
  （pushExampleChanges 迁移）**3 passed（1.2m）**。
- 未做：hub 冲突（他人推送）时的自动合并提示、版本元数据编辑通道（按钮诚实
  禁用）。

## 15. Stage G1 首切片：extrude「成形到顶点」UI（2026-11-12）

- 契约/后端 v1.60 已有（`ExtrudeParams.endBound='upToVertex'` + `endVertexRef`
  草图顶点引用）；本切片只补产品 UI：终止条件新增「成形到顶点」，目标顶点下拉
  候选=全部草图的点/线端点/弧端点/圆心（与后端 `sketchVertexPositionsFrom`
  支持面一致），未选顶点禁提交并给字段级文案。
- 与 symmetric/拔模/第二方向/薄壁互斥（选择 upToVertex 时主动复位，后端 zod
  同口径）；距离输入按非 blind 规则禁用（depth 由后端按顶点投影动态计算）。
- shared 仅新增类型再导出 `ExtrudeVertexRef`（无 `interfaceVersion`/载荷变化）。
- 验证：web **1561/1561**（候选生成/编码往返/载荷与禁提交用例）、shared
  205/205、tsc/lint/e2e tsc 绿；真栈 `e2e/extrude-up-to-vertex-ui.spec.ts`
  **2 passed（57.9s）**——移除 + 目标点 (5,5)@z=3 → **1700.000 vs 1700**，
  树 5 行全 status=0、params endVertexRef 落库，push+冷重开一致。
- 未做：视口直接拾取顶点（当前候选来自草图实体清单；Onshape 支持点模型顶点，
  需顶点→草图顶点映射证据）；「成形到零件」仍无产品通道（不渲染假选项）。

## 16. Stage G1 追加：终止条件菜单全序（2026-11-12）

- 终止条件下拉按 Onshape live 菜单排序：给定深度/成形到下一个面/成形到面/
  成形到零件（诚实禁用，产品与内核无 up-to-part 通道）/成形到顶点/完全贯穿。
- 单测钉死选项顺序与「成形到零件」禁用；未构造任何第二真源或假行为。
- 跳过实例：已采集私有 UI 证据（`skip-instances/manifest.json`：布尔「跳过实例」
  + 勾选后出现「要跳过的实例」数组/选择列表，`data-parameter-id=skippedInstances`）；
  视口实例点选交互未能复现（canvas 标记），故不按记忆实现，登记为待采集。
