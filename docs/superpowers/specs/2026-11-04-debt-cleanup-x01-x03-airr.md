# AIRR — X-01 / X-02 / X-03 第一轮架构债务清理

- 日期：2026-11-04
- Owner：平台 / 编辑器架构 owner
- 关联规则：`docs/DEVELOPMENT-RULES.md` P0-03、P0-05、P0-06、P0-07、P1-01、P1-02
- 关联例外：`docs/architecture/EXCEPTIONS.md` X-01、X-02、X-03（2026-11-04 已确认，目标 2026-12-31）
- 预计影响仓：`luban-cad/packages/{shared,editor,viewer}`、`luban-cad/apps/web`、`luban-backend/modeling-server`、`docs`
- 是否需要 ADR：**是**（删除 P0 RPC 方法 + 选择权威裁决）→ `docs/adr/0002-retire-legacy-edit-channel-and-unify-selection.md`

---

## 1. 目标与验收

### 1.1 目标

一次性关闭三项已登记的 P0/P1 架构债务：

1. **X-01 旧编辑通道退役**：删除 `LubanRpcInterface.startEditCommand/callEditMethod/finishEditCommand`；所有自定义直接编辑工具改走 `EditTools.startCommand` + 标准 `basicManipulationIpc`；删除后端无对应命令的空操作工具 `CreateHoleTool`/`DraftFacesTool`。
2. **X-02 草图工具族唯一**：产品只保留 app 的 `Sketch.*` 工具族；`EditTools.initialize` 增加显式退出项，不再注册 editor vendored `SketchTools` 六件；viewer 注册表删除这六个重复 toolId。
3. **X-03 选择权威唯一**：`store.canvas.selection` 是唯一选择事实源；`connection.selectionSet` 仅作为 part（body 元素）选择的单向投影，供标准元素集工具（Delete/Move/Rotate 等）消费；删除反向往返桥与多处直接写 `selectionSet`。

### 1.2 可观察验收

- `rg "startEditCommand|callEditMethod|finishEditCommand"` 在 `luban-cad`、`luban-backend/modeling-server` 的产品代码中为 0（测试/历史文档除外）。
- `LubanRpcInterface.interfaceVersion === '1.1.0'`；接口方法从 18 → 15；shared/backend 编译通过。
- 工具注册表不再出现 `CreateLineString/CreateArc/CreateCircle/CreateEllipse/CreateRectangle/CreateBCurve`；不出现 `CreateHole/DraftFaces`。
- 工具注册表仍保留 `MirrorElements`，其测试断言走 `EditTools.startCommand({commandId:'basicManipulation'})` + `basicManipulationIpc.mirrorElement` + `saveChanges` + `EditTools.finishCommand`。
- `store.canvas.selection` 变化后，`connection.selectionSet` 中恰好是 `kind==='part'` 的 id；子实体选择时为空。
- 真栈 e2e `tutorial2.spec.ts`、`part-studio.spec.ts` 选择/删除路径不回归（本地按可用栈执行）。

### 1.3 非目标

- 不新增孔/拔模特征实现；`hole` 从 `full` 翻 `gated`（后端无 op，诚实引导）。
- 不改 FeatureOp 形态、schema、native 接口、求解器接口。
- 不重构 `FeatureService` God service（另立 X-04/X-05 后续批次）。
- 不改 Onshape 选择工具的拾取优先级/外观（渲染与拾取已在 2026-11-03 收官）。

---

## 2. 关联项目能力清单

| 项目/仓 | 相关能力 | 现有 API/工具/实现 | 版本/路径 | 结论 |
|---|---|---|---|---|
| itwinjs-core（参照） | EditCommand 标准通道、SelectionSet | `EditTools.startCommand`、`basicManipulationIpc`、`BriefcaseConnection.selectionSet` | vendored 5.15 | 复用 |
| luban-cad/packages/editor | 第一方编辑基座 | `EditTool.ts`、`EditToolIpc.ts`、`DeleteElementsTool`、`SketchTools`、`luban/modeling/*` | 本地源码 | 扩展（initialize 选项）+ 删除死工具 |
| luban-cad/packages/viewer | 工具注册表 | `register-edit-tools.ts` | 本地源码 | 修改（去重复注册） |
| luban-cad/packages/shared | 跨仓契约 | `LubanRpcInterface` 1.0.0、`LubanFeatureRpcInterface` 1.21.0 | 本地源码 | 修改（删除 3 方法，bump 1.1.0） |
| luban-backend/modeling-server | RPC 实现 + FeatureService | `LubanRpcImpl` 旧编辑通道；`EditCommandAdmin` 注册标准命令 | 私有仓 | 删除旧实现/测试 |
| imodel-native | 内核 | 不涉及 | — | 不适用 |
| imodelhub-services | Hub | 不涉及 | — | 不适用 |
| 官方 clients/BisSchemas | 契约基准 | `docs/api-specs/*.json` | — | 不适用（非 REST） |
| DanQing/参考项目 | 独立渲染 | 不涉及 | — | 不适用 |

---

## 3. 复用决策矩阵

| 需求能力 | 候选复用 | 覆盖度 | 决策 | 理由 | 许可证 |
|---|---|---|---|---|---|
| 镜像直改 | `EditTools.startCommand` + `basicManipulationIpc.mirrorElement` | 完整 | **复用** | editor 内置 `BasicManipulationCommand` 已注册；`mirrorElement` 契约与后端实现已存在 | MIT/项目许可 |
| 事务/撤销 | `BriefcaseTxns` + `saveChanges` | 完整 | **复用** | 标准编辑管道保证 undo/redo | 同上 |
| 草图创建 | app `Sketch.*` 工具族（params 单一数据源） | 产品完整 | **复用** | 2026-11-03 已定为唯一显示/数据路径；editor SketchTools 写 native geometry stream，违反 P0-06 | 项目许可 |
| body 选择投影 | `BriefcaseConnection.selectionSet` | 完整 | **复用（单向投影）** | 标准元素集工具的唯一输入；不另建选择集 | iTwin 许可 |
| 子实体选择 | `OnshapeSelectTool` + store | 完整 | **复用** | 已实现 face/edge/vertex 优先级、Ctrl 切换、空白清除 | 项目许可 |
| 孔/拔模 | 后端无 createHole/draftFaces 命令 | 0 | **不实现，gate** | 禁止假成功；能力引导如实说明 | — |

---

## 4. 跨仓影响

| 仓/层 | 契约 | schema/迁移 | native/接口 | 测试 | 发布 |
|---|---|---|---|---|---|
| web | 选择读写改经 `selection-authority`；`hole` 能力翻 gated | 无 | 无 | capabilities/ribbon/selection/page 测试更新 | 随 web 镜像 |
| shared | `LubanRpcInterface` 1.0.0 → 1.1.0，删除 3 方法 | 无 | 无 | interface 测试更新 | shared 先行 |
| viewer | 注册表删除 6+2 工具 | 无 | 无 | register-edit-tools 测试更新 | 随 web |
| editor | `EditTools.initialize(options?)`；删除 CreateHole/DraftFaces；Mirror 改标准 IPC | 无 | 无 | editor 单测更新 | 随 web |
| itwinjs-core | 不改 | 无 | 无 | 回归现有 e2e | 无需重建 fork |
| modeling-server | 删除 3 个 override + 测试；`EditCommandAdmin` import 移除 | 无 | 无 | `LubanRpcImpl.test.ts` 更新；镜像测试回归 | 需重建 MS 产物 |
| hub/WA | 不改 | 无 | 无 | 不适用 | 不适用 |

- 版本兼容矩阵：shared 1.1.0 与 MS 同批次；旧 web（1.0.0 客户端）连接新 MS 时，RPC 版本不匹配会在启动期显式失败，不会静默走旧通道。
- 配对 PR：public（shared/editor/viewer/web/docs）+ private（luban-backend）。
- 发布顺序：shared → modeling-server 产物 → web 镜像；或同 release 列车一次发布。

---

## 5. 数据/事务/安全

- 数据事实源：iModel/BIS + `params`；草图已收敛到 params（2026-11-03）。本轮不新增持久数据。
- schema/params：无变化；无迁移。
- 事务边界：镜像走 `basicManipulation` EditCommand 的 BriefcaseTxn + `saveChanges('mirror elements')`；失败 `finishCommand` 收口。
- Undo/redo：标准编辑管道可撤销；删除死工具不改变 undo 面。
- 选择投影：`connection.selectionSet` 只是标准工具输入投影，不持久化、不作为事实源。
- 写租约/权限/限流：沿用既有 `rpcGuard`/WriteLease；无新增 RPC 方法。
- 密钥/日志/审计：无新增；删除旧 RPC 方法的日志噪音。

---

## 6. 性能与渲染

- 选择投影使用稳定 key（kind+id+label+owner+topology）避免重复 `replace`；只在 store 选择变化时写一次。
- 删除反向 `selectionSet.onChanged` 桥：减少一次每事件全量映射。
- 不涉及渲染管线/材质/灯光/装饰件。
- 无视觉基线变化（`hole` 仅能力引导，不渲染新内容）。

---

## 7. 测试证据

- 单元：
  - `packages/editor/frontend/src/luban/modeling/test/MirrorElementsTool.test.ts`（标准 IPC 序列）。
  - `packages/editor/frontend/src/luban/modeling/test/{CreateHoleTool,DraftFacesTool}.test.ts` 删除。
  - `packages/viewer/src/tools/test/register-edit-tools.test.ts`（新注册序 + initialize 选项）。
  - `packages/shared/src/rpc/LubanRpcInterface.test.ts`（1.1.0）。
  - `apps/web/src/modules/part-studio/test/{capabilities,ribbon-registry,useCanvasBodySelection→selection-authority,PartStudioPage,PartStudioCanvas}.test.*`。
  - backend `modeling-server/src/rpc/LubanRpcImpl.test.ts`（删除 3 个旧测试）。
- StandaloneDb 集成：`MirrorElementDirectEdit.test.ts` 保持（后端 `mirrorElement` 直接命令测试）。
- 真栈 e2e：`tutorial2.spec.ts`（草图不重复 + 镜像）、`part-studio.spec.ts`（树/画布选择）、`b-model.spec.ts`（删除/undo）。
- 视觉/性能：无新增；选择性能用既有 `m-a5.2` 预算口径。
- 失败注入：Mirror 的 backend 异常 → 可见 toast + `finishCommand` 收口（既有测试）。
- known-red：`sketch-extrude.spec.ts` 维持既有红（与本轮无关，登记在案）。

### 7.1 实测结果（2026-11-04）

| 证据 | 结果 |
|---|---|
| `shared` 全量 vitest | **151/151 通过** |
| `editor/frontend` 全量 vitest | **29/29 通过**（死工具测试删除后） |
| `viewer` 全量 vitest | **127/127 通过** |
| `apps/web` `src/modules/part-studio` | **1039/1039 通过**（`useFeatureSystem` 租约用例在并发全量下偶发超时，单文件/复跑通过，与本轮改动无关） |
| 类型检查 | shared/editor/viewer/web/backend `tsc` 全绿；e2e `tsc -p tsconfig.e2e.json` 绿 |
| lint | shared/editor/viewer/web 全绿 |
| backend `LubanRpcImpl.test` | **16/16 通过** |
| backend `MirrorElementDirectEdit.test` | **6/6 通过**（标准 `basicManipulation` mirrorElement） |
| 真栈 e2e `part-studio`（五区/ribbon 激活） | **通过** |
| 真栈 e2e `newbody`（选择/owner/树删除/undo/redo） | **通过**（选择改为 store 单一权威后） |
| 真栈 e2e `tutorial2` | 草图阶段 **18 实体/48 约束/9 尺寸通过**；在拉伸 2 点击面域 4 失败：`data-region-points` 给出画布外坐标（页面 y=-5），`elementFromPoint` 无元素。本轮未改相机/`FeatureProfilePicker`，属独立 known-red（需单独修取景/保证命中点） |

**实测坑**：删除 editor 导出后，必须 `npm run build` 重建 `packages/viewer` 的 `dist`；否则 Vite 仍加载旧 viewer dist，报
`does not provide an export named 'CreateHoleTool'`，进而 `ensureEditTools` 整表注册失败（表现为 Undo/Chamfer 等工具“未启动”）。这是 `link:` 源 + 包 dist 双层的既有构建纪律，不是运行时代码缺陷。

---

## 8. 回滚与发布

- 回滚方式：git revert 本批次 commit；shared 接口恢复 1.0.0 与三方法；MS 回退上一产物；web 回退镜像。
- 数据迁移回滚：无 schema/params 迁移。
- 产物/镜像 provenance：MS 产物需重建并记录 commit；web 镜像重建；shared 版本随 web。
- 兼容窗口：不做滚动兼容（旧方法无外部调用者；同仓同发布列车）。
- 发布门：`pnpm lint`、`pnpm test`（相关包）、`start-ms-host` + `verify-stack`、真栈 e2e 选择/镜像路径。

---

## 9. 评审结论

- 复用矩阵完成：是
- 跨仓影响明确：是
- P0 例外已登记：是（X-01/X-02/X-03，本次关闭）
- ADR：需要 → `docs/adr/0002-retire-legacy-edit-channel-and-unify-selection.md`
- Owner 签字：平台/编辑器架构 owner（2026-11-04 规则确认口径）
- 结论：**批准**（第一轮债务清理范围）
