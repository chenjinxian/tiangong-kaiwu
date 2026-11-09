# ADR-0015：多 body 特征作用域（多目标删除/阵列）

- 状态：**提议 / blocked-design（2026-11-07；未实现）**。当前 `insertFeature`
  模型是「一个特征 → 一个目标 body → 一个几何输出」，Links 与 FACE 阵列示例
  证明这不足以表达 Onshape 的单特征多 body 作用域。
- 关联：`docs/adr/0007-feature-pattern.md`、`docs/adr/0012-split-part-world-plane.md`、
  `docs/superpowers/plans/2026-11-06-example-coverage-continuous.md`。

## 背景与证据

1. **Links（Exercise: Creating Mate Connectors，8343b562/761c6b9a）**：
   `Extrude 3` 是 throughAll REMOVE，`booleanScope` 同时引用两个 body 的源；
   Onshape 一次切除在两个 body 上各开一个孔。产品 `insertFeature` 只接受
   单个 `targetBodyId`，通用回放只切了其中一个 body——每 body 少一个
   R5×2 mm 孔（157.06 mm³），总体积 +1.44%（backend）/ +1.56%（web）。
   真栈树/status 已绿，剩余差异精确归因于该语义缺口。
2. **FACE linear pattern / 跨体圆角（77b496 / d405047，Handle Parts）**：
   15 实例 FACE 阵列作用于多 body 模型。2026-11-08 回放复核：converter 新增
   `revolve.profileEntityIds` + 回放器按 `SketchRegionDto` 边界映射面域后，
   三个 NEW revolve 真正落在三个不同轮廓（此前盲取 region 0），前置 10 特征
   真栈跑通（3 体未圆角 12326.161 / 32140.878 / 106103.005 mm³）。剩余阻塞
   是 **Fillet 1 的 6 条 SWEPT_EDGE 分属 3 个 body**（selector operationSourceIds
   分别为 Revolve 1/2/3）：产品 FilletParams 单 `targetBodyId`，跨体圆角无合法
   载荷 → runner 按契约阻塞（`选中边跨 3 个 body`）。现有 featurePattern
   「源特征 delta → 单 target body」同理无法表达 FACE 全作用域。
3. 架构根因（既有裁决）：
   - `FeatureEngine.writeBodyFromCache` 要求「一个 body 恰一个源特征、入缓存
     恰 1 条 BRep 条目」（`FeatureEngine.ts:786-831`）；
   - 特征输出缓存按 featureId 键控（一个条目数组）；
   - `planInsert` 的 `targetBodyId` 是单值门禁，`deleteFeature` 同。
   多目标输出会同时触碰 body 写回、源边、失败级联、冷重建、撤销与
   featurePattern/delete 语义，不能靠补丁绕过。

## 决策（提议，待实现）

### 选项

1. **扩展 FeatureOp 为多目标**（推荐）：`insertFeature.targetBodyIds?: Id64String[]`
   （与单值 `targetBodyId` 互斥），首版只用于 **REMOVE 语义**的 extrude/hole
   （Links 场景）；后端对每个 target body 独立求值（各自链上游/缓存），
   特征行与多个 body 建立 FeatureDrives 边；feature 输出缓存改为
   `(featureId, bodyId) → entries`，写回逐 body 执行；失败按 body 隔离。
2. **拆成 N 个内部特征行**（拒绝）：树/编辑/删除/撤销语义与 Onshape 单特征
   不一致，且隐藏行需要 schema 迁移；不得作为「完整复刻」。
3. **回放层拆 N 步近似**（拒绝用于 complete）：树会多出步骤，只能登记
   approximate/known-red，不能算绿。

### 首版范围（若批准）

- 契约（shared 增量，需版本 bump）：`FeatureOp.insertFeature` 增
  `targetBodyIds?: Id64String[]`；`InsertTargetPlan` 增多目标计划。
- 后端：仅 `extrude/hole` 的 `operation=remove/throughAll` 支持多目标；
  其余特征/操作诚实拒收（不静默单目标）。
- featurePattern：先把「源特征 delta × 单 target」语义保持；多 body 输出
  另行切片（与选项 1 的缓存改造同源）。
- UI：多目标选择器需 live 证据；本 ADR 不包含 UI，能力保持 gated。
- 回滚：字段 additive；移除后回到单目标路径，旧库无迁移。

## 非目标

- 不做任意布尔多 target（booleanBodies 仍是 target+tools 语义）。
- 不做 splitPart keepBothSides 的双输出（另见 ADR-0012 blocked-design）。
- 不引入第二套 body/特征模型（P0-01/P0-06）。

## 验证（完成前）

- 后端 `MultiTargetRemoveFlow`：两 box body，一次 throughAll REMOVE 同时
  穿孔，逐 body 体积/谱系断言；失败隔离与冷重建。
- 真栈 Links：2 body、体积 21,743.326 mm³、push+重开；树 featureType 数
  与 Onshape 一致（单 Extrude 3）。
- 回归：现有单目标 extrude/hole/booleanBodies/featurePattern 全绿。
- 完成前 Links 保持 known-red，不调容差。
