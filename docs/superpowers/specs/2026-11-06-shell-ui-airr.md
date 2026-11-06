# AIRR：参数化抽壳（Shell）UI 切片

> 关联：`2026-11-06-example-coverage-master-airr.md`、ADR-0003（test-only 场景）、
> `docs/adr/0006-*`（特征 UI 切片先例）。本切片不改 shared 契约。

## 1. 目标与范围

- 把已存在的后端参数化 shell（`ShellParams` + `HollowFaces` 内核通道 + 异步求值）接到产品 UI：
  ribbon「抽壳」→ 参数化 FeatureDialog 同款面板 → `insertFeature shell`/`updateParams`。
- 首切片范围：**移除面选择 + 壁厚 + 方向（内/外）**；不实现 Hollow（零移除面，契约当前禁止）。
- 不在本切片：scenario converter 的 shell 映射、任意面/逐面差异壁厚编辑、shell 预览的像素级对齐。

## 2. 复用矩阵

| 需求 | 复用 | 不新建 |
|---|---|---|
| 参数契约 | `@luban-cad/shared` `ShellParams`（v1.4 起） | 新参数/新 RPC |
| 几何求值 | 私有后端 `evaluateShellAsync`（HollowFaces=19） | 第二套抽壳 API |
| 面拾取 | `store.canvas.selection`（唯一选择权威）+ `OnshapeSelectTool` 的 `resolveFaceRef` | 新选择状态机 |
| 预览 | `previewFeatureOp` + `FeaturePreviewOverlay` | 第二套预览通道 |
| 面板皮肤 | FeatureDialog 220px 样式类 / FeatureDialog 通道门禁 | 新视觉体系 |
| 证据 | 官方 Onshape 帮助页（私有仓 `ui-evidence/shell-help-20261106`） | 凭记忆设计控件 |

## 3. 交互与载荷

- 打开方式：先选面（可多选，同一 body），再点 ribbon「抽壳」；对话框打开后实时读取当前面选择。
- 字段（按官方帮助页顺序）：`Faces to shell`（chips）→ `Thickness`（数值）→ `Direction`（向内/向外）。
- 提交（new）：`insertFeature { featureType:'shell', targetBodyId: ownerBodyKey,
  params: { defaultDistance: signedThickness, faces: topoIds, distances: 0 } }`。
  - `signedThickness`：向内 = 负值（内核内缩），向外 = 正值。
  - `distances:0`：选中面按内核语义穿孔移除；未选中面用 defaultDistance。
- 编辑（edit）：`updateParams` 合并 `defaultDistance`/`distances`，保留落库 `faces`（结构引用不换面）；
  首切片只改壁厚/方向。
- 门禁：无面 / 跨 body / 厚度非法 / 无 `applyOp` / 只读 → ✓ 禁用 + 就地提示；服务端 zod 兜底。

## 4. 跨仓影响

- shared：**无变更**（`ShellParams` 已冻结；接口版本不 bump）。
- 私有后端：无变更（已有 `evaluateShellAsync`/`previewOp`）。
- web：新增 `ShellDialog` + 路由/能力位/文案；Feature 树/undo/push 走既有链路。

## 5. 测试

- 单测：`ShellDialog.test.tsx`——面选择校验、跨 body 拒收、厚度/方向载荷、编辑回显、错误 Alert。
- 能力位：`capabilities.test.ts`/`ribbon-registry.test.ts` 从 gated 集合移除 shell，并断言路由到参数化对话框。
- 真栈 e2e：`e2e/shell.spec.ts`——盒体顶面移除 + 1 mm 内缩，树 `sketch/extrude/shell` status=0，
  体积≈1084 mm³（20×20×10 外盒减 18×18×9 内腔，±2%），undo 可用，push + 重开一致。
- jsdom 不得单独宣称完成（P1-06）。

## 6. 回滚与限制

- 回滚：shell 能力位翻回 `gated`，隐藏 `ShellDialog` 路由；后端契约与数据不受影响（已有壳特征可读）。
- 已知限制：Hollow 未实现；编辑不改面集；预览首版只显示后端影子求值结果（不保证与提交像素一致）；
  scenario converter 的 shell 面选择仍待语义面选择器（后续 W1.2b/T4）。

## 7. 实施记录（2026-11-06）

- 证据：`ui-evidence/shell-help-20261106/{01-shell-help.png,notes.md}`（私有仓）。
- 落地：`ShellDialog.tsx`（面快照来自 `store.canvas.selection`；thickness/direction；
  后端 `previewOp` 影子预览）、`PartStudioCanvas` shell 分支、ribbon `HollowFaces`
  改道、capability `shell: full`、zh/en 文案、`ShellDialog.test.tsx` 5/5。
- 真栈：`e2e/shell.spec.ts` setup+test **2 passed**；盒体 20×20×10 顶面移除 1 mm
  内缩 = 1084.000 mm³；undo/redo、双击编辑 2 mm（1952 mm³）、push + 重开一致。
- web 全量 vitest 1384/1384；tsc 绿。
