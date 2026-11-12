# AIRR — 零件删除首切片（删除 NEW-body 驱动特征）

日期：2026-11-13
状态：**已实现（首切片，2026-11-13）**（用户指令：继续实现全部缺口）

## 1. 证据

- 零件行右键菜单含「删除…」（`ui-evidence/tree-interactions-20261112/menu-sketch-part.json`）。
- Onshape 官方帮助 Delete Part（`https://cad.onshape.com/help/Content/PartStudio/delete_part.htm`，
  经搜索摘要读取；本机直连被策略拦截）：工具按钮删除一个或多个零件/曲面，是
  **参数化操作**——生成一个 Delete Part 特征行、可撤销；删除后零件从列表消失。
  帮助另述：选中实体面/边按 Delete 删除的是创建它的**特征**（同样参数化可撤销）。
- 本产品既有能力：`deleteFeature` op 对 NEW-body 插入特征具备 `consumeBody`
  资格（planDelete：newBody + 唯一源 → 软消费 body；undo/删除特征恢复）。

## 2. 范围（首切片）

1. 零件行「删除…」启用条件：body 的当前唯一驱动源（`getBodies.sourceFeatureId`）
   是 **NEW-body** 插入特征（extrude/revolve `operation='new'` 或 `newBody=true`），
   且该特征行未抑制。
2. 点击 → HITL 确认（标题/说明明确：删除驱动该零件的 NEW-body 特征，零件随之
   移除，可撤销）→ `applyOp({kind:'deleteFeature', featureId=<源>, targetBodyId=<bodyKey>})`。
3. 成功：Success toast；零件段/树随 `onCommitted` 刷新（body 软消费、特征行移除）。
   失败（后端 planDelete 链尾/目标校验拒收）：Error toast，不静默。
4. 撤销：原生 undo 恢复 body 与特征行（真栈验证）。

**非目标 / 诚实缺口**
- **不是** Onshape 的 Delete Part 历史特征（多选任意零件、在历史点删除、与
  后续特征并存）。任意 body 的删除需新增 FeatureOp/schema（body 生命周期 +
  下游依赖语义），另行 ADR。
- 被 fillet/hole/moveFace 等改写过的 body（sourceFeatureId 指向链尾改写特征）
  诚实禁用并说明原因——删除该特征只会回退几何，不会删除零件。
- 多选零件、按面/边删除创建特征（帮助所述另一路径）未做。

## 3. 复用矩阵

| 依赖 | 复用 | 说明 |
|---|---|---|
| `getBodies[].sourceFeatureId` | body→唯一驱动源反查 | 前端资格判定 |
| `FeatureTreeEntry.params` | `operation='new'` / `newBody` | NEW-body 判定（与后端 isNewBodyInsert 同口径） |
| `deleteFeature` op | 后端 planDelete/consumeBody/undo | 无新 op/契约 |
| 特征删除 HITL 对话框样式 | 同款危险确认 | 说明文案针对零件 |
| Sidebar applyOp/toast | 既有树变异通道 | 不乐观改树 |

## 4. 测试

- 纯函数 `deletePartFeatureId`：NEW-body 源可用；fillet 源/无源/无读面禁用。
- FeatureTree：删除项启用态/禁用 title；HITL 确认回调
  `onDeletePart(node, 'nb1', bodyKey)`。
- Sidebar：确认 → `applyOp {deleteFeature, featureId='ex1', targetBodyId='0x15'}` +
  Success toast。
- 真栈 `e2e/part-delete.spec.ts` **2 passed（31.2 s）**：NEW-body 拉伸 → 零件行
  删除 → HITL → 零件数 (0)/特征行移除 → undo 恢复 (1)。
- 回归：`tree-interactions` 2 passed（零件菜单删除项改为按源启用）。

## 5. 跨仓影响 / 回滚

无 shared/后端/RPC/schema 改动（复用 deleteFeature）。回滚：移除菜单启用/
HITL/回调与测试；已删除数据是普通 deleteFeature 事务，可撤销/无迁移。

## 6. P0 对照

- P0-05：走既有 FeatureOp 写管道，无第二套删除 API。
- P0-06：删除经 body 生命周期（consumed）与特征图，不改事实源形状。
- P0-10：HITL 预览→确认→提交；标准事务可撤销；失败诚实 toast。
