# 公开 Onshape 示例能力覆盖计划（2026-11-06）

> 这是与 `2026-11-06-example-coverage-master-airr.md` 并行的**能力覆盖轨道**，
> 不改变严格数据保真轨道的 `replicable-now` 口径，也不把两者混算。
> 证据/副本/截图只放 `D:\Github\onshape-parity-data`，公共仓只放脱敏计划。

## 目标

不追求与采集 API 数据逐值一致；通过一组真实公开示例，把 luban-cad 的
**草图实体、草图约束、特征类型、特征 UI** 全部实际跑通。一个能力至少有一个
真实示例验证；尺寸允许近似，但必须在 manifest/status 标 `approximate`。

## 两条轨道

1. **数据保真轨道**（现有）：`manifest/example-index.json` 的
   `replicable-now`，要求逐 body 体积/特征树/重开；当前 2 个。
2. **能力覆盖轨道**（本计划）：真实公开示例 → 创建 Onshape 副本 → 读 UI
   特征树/对话框/草图截图 → 在 luban-cad 近似重建 → 记录实际跑通的能力。
   不要求体积逐值一致；不以近似结果冒充严格 complete。

## 工作流

1. **选例**：用现有语料的能力直方图 + 缺口矩阵，优先选特征少、能单独暴露
   一个能力的示例；每个能力 1–2 个代表例。
2. **复制**：在已登录 CDP Chrome（9222）打开公共文档 →「创建副本以编辑」→
   创建公开副本；记录 docId/elementId/副本 URL。
3. **取证**：打开每个特征对话框，保存截图 + 可见输入值 + 选中页签；
   打开草图保存视图截图；证据写私有仓 `ui-evidence/copy-pilot-*`。
4. **重建**：优先真实 UI（对话框/视口拾取），草图可用标准 RPC 精确/近似复原并
   在步骤中标注；不新增第二套建模 API。
5. **验证**：特征树类型/顺序/status=0、body 数、重开；几何尺寸允许近似，
   但必须写明 `approximate` 与缺口能力。
6. **能力补齐**：每个发现的产品缺口走 AIRR/ADR + shared bump + backend/UI +
   真栈 e2e；不得用近似几何冒充能力已完成。

## 试点证据（2026-11-06）

### A. Exercise: Hand Brake Update / Handle

- 源：`91f152e2325e166b5ae98f4d` / `6b46e106bd5fea88962c08d0`
- 副本：`https://cad.onshape.com/documents/b2fb94fcba9937fbe036fb3c/w/8ff1a5002567f8b87ccc3401/e/778073a5e66608a51878efff`
- 16 特征 / 2 body；已提取 7 个特征对话框 + 4 张草图截图。
- 关键参数：Extrude 1 8 mm；Fillet 1 R30 mm；Extrude 2 10 + 第二方向 120 mm；
  Extrude 3/4 完全贯穿；Plane 1 = **平面点（PLANE_POINT）**（Sketch 2 顶点 +
  Extrude 1 面）；Hole 1 = 沉头孔 M5 间隙（主孔 5.5、沉头 9.75×5）。
- 产品缺口：`cPlane PLANE_POINT`（B2）；其余 extrude/fillet/hole 现有契约可表达。
- 证据：`ui-evidence/copy-pilot-20261106/`（features/sketches）。

### B. Dumper Trailer / Bumper Block

- 源：`7c199f0e3db618e8abeb0d95` / `f664ba9907810c60c6fba5e2`
- 副本：`https://cad.onshape.com/documents/b6cf5cc6fec352a7dbc16475/w/82936c07a96414013c9deec1/e/4fea9fa5c074255a63442b91`
- 10 特征 / 1 body；已提取 Extrude 1（40 mm）、Extrude 2（40 mm + 10° 拔模）、
  Fillet 1（5 mm）、Hole 1（沉头 M10：Ø11 贯穿 / Ø17.25×10）及草图截图。
- 产品缺口：extrude 的 **draft 10°**（契约有禁用输入，后端内核通道未实现）；
  fillet 选中混合面/边；hole 沉头孔现有契约可表达。
- 近似重建策略：保留 extrude/fillet/hole 链，draft 用直壁近似并登记。

## 第一批能力切片（按试点证据排序）

1. **cPlane B2 PLANE_POINT**：点 + 平面/面参考 → 平面；Handle 的 Plane 1。
2. **extrude draft**：角度参数 + 内核拔模；Bumper Block 的 Extrude 2。
3. **hole 沉头/间隙孔 UI 与回放**：现有 HoleParams 已覆盖，补真实示例 + 证据。
4. **fillet 混合面/边引用**：Bumper Block 的全圆角/面选边界语义。
5. 后续按能力直方图补：shell 真实示例、pattern FEATURE/FACE、rib/draft/splitPart。

## 状态口径

- 能力覆盖示例状态：`geometry: exact|approximate|blocked`、
  `constraints: complete|dropped|blocked`、`ui: complete|partial|blocked`、
  `persist: verified|pending`；只有四项全 complete 才 `overall=complete`。
- 不与严格 `replicable-now` 混算；周报分别列出。
