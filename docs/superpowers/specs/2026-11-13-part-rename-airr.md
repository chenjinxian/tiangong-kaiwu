# AIRR — 特征/零件树内联重命名（Onshape 行内改名，v1.70 后端元数据通道）

日期：2026-11-13
状态：**已实现（2026-11-13）**（用户指令：继续实现全部缺口）

## 1. 证据（live UI，自有副本 `LubanLivePostman` / Part Studio 2）

- 零件段右键菜单（`ui-evidence/tree-interactions-20261112/menu-sketch-part.json`）：
  `重命名 / 属性… / 指定材料… / 编辑外观… / 复制至此… / 创建…工程图… /
  导出… / 发布… / 隐藏 / 隔离… / 使之透明… / 添加评论 / 放大选定对象 / 删除…`。
- 点击「重命名」后**没有对话框**：零件行原地出现内联输入框
  `input.name-input`，值预填当前名 `Part 1`（2026-11-13 直接 UI 操作实测，
  私有截图 `ui-evidence/ui-direct-mouse-20261112/86-onshape-part-rename.png`）。
  交互与特征行内联改名同形：Enter/失焦提交、Esc 取消。
- 特征行重命名同菜单/同内联编辑形态（`ui-evidence/tree-interactions-20261112/09-slow-dblclick-rename.png`）。

## 2. 范围（本切片）

1. 零件行、特征行与**草图行**右键「重命名」启用（`canEdit` 门），内联编辑
   复用既有 `TreeRow`（Enter/失焦提交，Esc 取消；trim 后为空或未变化=取消）。
   草图行与特征行同走 `renameFeature`（后端按元素类分发 def/phys model scope）。
2. 写路径=**后端元数据写 RPC**（v1.70 契约新增；P0-05 单一写管道，不做
   前端直改元素）：
   - `renameFeature(iModelKey, featureId, name, sessionId, partStudioId?)`
     → 特征元素 `jsonProperties.luban.feature.name`；`getFeatureTree` 回传
     `FeatureTreeEntry.name`（缺省=前端按「类型 + 序号」派生）。
   - `renameBody(iModelKey, bodyId, name, sessionId, partStudioId?)`
     → body `userLabel` + `jsonProperties.luban.body.name`（即既有
     `getBodies[].name` 读面来源）。
   - 两者共用写租约/scope/只读/墓碑/文档模式门禁；`EditTxn` + saveChanges，
     可撤销、走既有 `txns.onCommitted` 刷新树与 body 读面；不写 OpLog、
     不建历史特征、不动 params/orderKey/依赖图/几何。
3. 名称校验：trim 后 1..120 字符（与 Part Studio 改名同口径）；非法/不存在/
   无租约/跨 studio 诚实拒收（错误串经 Error toast 呈现）。
4. UI：成功 Success toast（「已重命名为 …」）；失败 Error toast；只读时菜单
   禁用并给只读提示；未接线时 Error toast（不静默 console.warn）。

**非目标 / 诚实缺口**
- 零件「删除…/指定材料/隔离/透明/复制/工程图/导出/发布」仍禁用（见审计）。
- 重命名不创建历史特征（与 Onshape 一致：名字是元数据，不占特征序位）。
- 表达式/依赖项/文件夹/评论等菜单长尾仍禁用。
- 同名不唯一性校验未做（Onshape 允许重名；树以 id 为身份）。

## 3. 复用矩阵

| 依赖 | 复用 | 说明 |
|---|---|---|
| `TreeRow` 内联编辑 | 既有 `editing/onCommitRename/onCancelRename` | 特征/零件行同组件，无新编辑器 |
| `FeatureTree` 右键菜单 | 既有槽位 | 零件重命名从禁用改为启用；特征槽位原本已接线到 `onRename`（此前生产未接回调） |
| `PartStudioSidebar` | 既有 toast/`canEdit` 通道 | 新增 rename handlers，按节点类型路由两个 RPC |
| `useFeatureSystem` | 既有 session 租约 + `withOpTimeout` + refresh | 新增 `renameFeature/renameBody`，与 applyOp 同门禁 |
| 后端 `FeatureService` | 既有 `EditTxn`/writeLeases/scope 门禁/`maybePush` | 新增 `prepareRename` + 两写方法；body marker 合并复用 `mergeBodyMarker` |
| `getBodies` 读面 | 既有 `marker.name ?? userLabel` | 零件改名无需新增读 RPC |
| `getFeatureTree` | 新增 jsonProperties 读取（`LubanCAD.Feature` 的 `JsonProperties` 列） | 仅加可选 `name` 字段；无 schema 变更/迁移 |
| 撤销 | `EditTxn` saveChanges → BriefcaseTxns | 真栈 undo 已验证 |

## 4. 设计

- shared v1.70：`FeatureTreeEntry.name?`、`RenameResult`、两个 RPC 方法
  （`interfaceVersion` 1.69.0 → 1.70.0）。
- 后端：`LubanCadSchema.readFeatureName/mergeFeatureName`（jsonProperties
  `luban.feature.name`，兼容对象/字符串形态）；`queryAllFeatures` 增
  `JsonProperties` 列；`getTree` 带 `name`；`FeatureService.renameFeature/
  renameBody`（前置门禁 → `getFeaturePropsInScope`/`authoredBodies` 校验 →
  `EditTxn` 锁+updateElement+save → `maybePush`）。
- 前端：`useFeatureTree` 自定义名优先；`FeatureTree` 零件菜单启用 +
  `onRename` 接线；`PartStudioSidebar.handleRename` 按节点类型调 RPC 并
  toast；`useFeatureSystem.renameFeature/renameBody` 走同一租约/超时/刷新。

## 5. 跨仓影响

shared（v1.70 契约）→ 私有后端 modeling-server（RPC 实现 + 读面）→ web。
无 schema/native/渲染管线改动；无数据迁移（名字存既有 `jsonProperties`，
旧库无该键=未重命名，读面缺省派生名）。

## 6. 测试

- shared 契约 **206/206**（含 v1.70 方法签名/`RenameResult`/`FeatureTreeEntry.name`）。
- 后端：`RenameFlow.test.ts` **5/5**（特征/零件 trim 落库与读面、重复改名
  覆盖、非法名/不存在/无租约拒收、关库重开持久）；
  `FeatureRpcImpl.test.ts`（薄壳透传 sessionId/scope）、`FeatureService.test.ts`
  同批绿（`RenameFlow` 含草图行改名：def model Feature 与 phys model Sketch
  同一 RPC、`getTree.name` 读回）；改动文件 eslint 绿。
- web 单测 **1726/1726**（FeatureTree 零件重命名启用+内联提交、自定义名优先；
  Sidebar 特征/零件重命名成功/失败 toast、只读禁用；useFeatureSystem
  rename 成功 refresh/readonly 零派发）。
- 真栈 `e2e/part-rename.spec.ts` **3 passed（1.2 min）**：
  1. 零件行右键重命名 → `getBodies[].name = Housing A` → **undo 回 Body 1** →
     再改名 → push+重开仍为 Housing A；
  2. 特征行重命名 → 树行显示 `Housing Extrude`；草图行同一路径改为
     `Base Sketch` → push+重开两者均保留。
- 已知限制：真栈用例逐个 seed 重置；MS 限流窗口外单跑。

## 7. 风险与回滚

- 名字写入既有通用 `jsonProperties`（非 schema 属性）：重建/求值路径
  不清除该命名空间（`mergeBodyMarker`/`mergeFeatureName` 保留其它键）；
  关库重开用例已钉持久性。
- 重命名不触碰几何/参数，因此不会触发特征重算/级联失败；如读面异常，
  树回退派生名（诚实降级），不伪造旧名。
- 回滚：revert shared/backend/web 三仓改动；已改名数据是普通元素属性，
  无迁移/无需清理（旧客户端忽略 `name` 键，派生名照常显示）。

## 8. P0 对照

- P0-01/P0-05：单一建模/编辑管道——写操作经后端 Feature RPC（`EditTxn`），
  不引入前端直改元素或第二套模型 API。
- P0-06：只写元素元数据（jsonProperties/userLabel），事实源 params/几何不变。
- P0-07：shared 契约 additive 变更，版本 1.70.0，双端同批（未发布）。
- P0-10：`EditTxn` + saveChanges 可撤销（真栈 undo 验证）；失败诚实拒收/toast。
