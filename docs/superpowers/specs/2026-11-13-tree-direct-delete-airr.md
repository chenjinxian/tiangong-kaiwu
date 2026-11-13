# AIRR — 特征树删除草图/特征改为直接删除（无确认框，对齐 Onshape）

- 状态：Implemented（2026-11-13 工作树；纯前端；无契约/后端变更）
- 关联：Onshape live（用户 2026-11-13 复核：从特征树删除某个草图/特征**不弹
  提示框**，直接删除）；树菜单项证据
  `ui-evidence/tree-interactions-20261112/menu-*.json`（删除项本就不带确认
  子流程）；P0-10（标准事务、可撤销）。
- 变更：`FeatureTree` 特征/草图行右键「删除」= 直接调用 `onDelete`（Sidebar
  按节点类型路由 `deleteSketch` / `deleteFeature`），不再打开 HITL 确认对话框。
  删除仍走 `LubanFeatureRpcInterface` FeatureOp + `saveChanges` 标准事务，
  Ctrl+Z 可撤销；后端拒收（如草图被特征引用）原样透出 Error toast、树行保留。

## 范围

- 删除 `pendingDelete` 状态与确认对话框（`删除 <name> / 本次删除不可撤销…`）。
- 删除项保留左侧图标、只读禁用（`canEdit=false` → disabled + title 提示）。
- 零件行「删除…」（删除 NEW-body 驱动特征，`pendingDeletePart`）**保持 HITL**
  ——用户本次仅要求草图/特征行；零件删除涉及 body 软消费，维持既有 AIRR
  `2026-11-13-part-delete-airr.md` 的预览→确认→提交。
- 画布右键 body/sub-entity 删除仍保留 HITL（`CanvasContextMenu` 不变）。

## 测试

- 单测：`FeatureTree.test.tsx` 删除三测改为直接回调（并断言无 dialog）；
  `PartStudioSidebar.test.tsx` 删除链辅助改为「右键→删除」直达（无 dialog），
  载荷/toast/拒收断言不变；web 全量 **138 files / 1834 passed**。
- 真栈：`sketch-delete.spec.ts` **2 passed**（未引用草图直接删除 + 行消失 +
  冷开仍无；被拉伸引用草图诚实拒收 + 行保留）；`editor-state-refresh.spec.ts`
  **4 passed**（删除拉伸/草图后渲染同步，不再走确认框）；
  `feature-pattern-tree-ops.spec.ts` **3 passed**（删除树行 + known-red 重算
  语义不变）；`newbody.spec.ts` **passed**（两体/选择桥/树删除→undo/redo→
  fillet 抑制整链）。
- 附带修复：`newbody`/`multibody-perf`/`sketch-extrude` 三份 e2e 仍在按旧
  空白菜单文案点「适应视图」——2026-11-13 右键菜单对齐已把该项改名为
  `缩放到合适大小`（同 fit 动作）；三处选择器同步更新。
- `tsc`（src/e2e）/eslint 绿。

## 风险 / 回滚

- 纯前端交互变化：回滚恢复 `pendingDelete` 状态 + 确认对话框 + onDelete 调用
  点即可；无数据迁移。
- 直接删除依赖标准事务的可撤销性：`deleteFeature`/`deleteSketch` 均经
  EditTxn + `saveChanges`；后端拒收路径不乐观改树（不伪造成功）。
