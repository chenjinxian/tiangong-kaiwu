# BRepCore 能力审计 — 缺失特征的内核就绪度（2026-11-12）

范围：把 Onshape Part Studio 缺失/禁用特征逐项映射到 imodel-native BRepCore /
PSBRepGeometry / TS `BRepGeometryOperation`，给出“可做/需 native 改动/内核阻塞/
架构阻塞”结论。**未验证的能力不得进入 UI 或能力矩阵的 full 状态。**

## 通道分层

1. `iModelCore/PSBRepGeometry/PSBRepOperation.h` `OperationType` 0–36（native 内部 op）。
2. `iModelCore/BRepCore/PublicAPI/BRepCore/SolidKernel.h`（ACIS 兼容层，111 static 导出；
   `TaperFaces` 等直接可用但需 native 调用方）。
3. `core/common/lib/cjs/geometry/ElementGeometry.d.ts` `BRepGeometryOperation` 0–11
   （TS 层：Unite/Subtract/Intersect/Sew/Cut/Emboss/Thicken/Hollow/Sweep/Loft/Round/Offset）。
4. 产品走 `LubanFeatureRpcInterface` FeatureOp → 私有 backend → `kernelOp(db, TS op, entries)`。

## 逐项结论

| Onshape 能力 | 内核就绪度 | 证据/路径 | 结论 |
|---|---|---|---|
| 多截面 loft | ✅ 就绪 | native `LoftOperation(profiles, guides, ...)` 接收 N profile；backend 逐 sketch 追加外环 | **已实现**（ADR-0019，shared 1.69，真栈 3 截面 4000 mm³） |
| 直径尺寸改值 | ✅ 就绪 | SolveSpace diameter 已支持；backend 仅白名单缺省 | **已实现**（2026-11-12，S1e 扩展） |
| Draft（拔模） | 🟠 内核 API 存在、native op 未暴露 | `SolidKernel.h:666 TaperFaces` / `AcisModify::TaperFaces`；`PSBRepOperation.h` 无 TaperFaces，TS enum 也无映射 | blocked-native-exposure：需新 native op（37）+ addon 映射 + NativeLibrary.ts + interface-freeze + backend FeatureOp + UI |
| Delete Face（删除面） | 🟠 已暴露、产品探针失败 | native `DeleteSubEntitiesOperation → BRepUtil::Modify::DeleteFaces`；产品 `SolidKernel` 探针 0 回包（ADR-0014 记录） | blocked-kernel 待重验（face props 格式/ACIS 回包）；未重验前不做 UI |
| Replace Face（替换面） | ❌ 无 API | 无对应 `SolidKernel`/PSBRep op | blocked-kernel |
| Thicken（加厚曲面） | 🟠 内核有、架构无曲面体 | PSBRep `ThickenSheets=16`；产品单链仅实体（SURFACE bodyType 59 特征 blocked） | blocked-architecture（需曲面体模型，ADR 级别） |
| Fill / Offset Surface | ❌ 无 API | PSBRep 无 fill/offset surface op | blocked-kernel |
| Loft guides（引导线） | 🟠 native 可、TS 通道不带 | `loftProfiles` 读取 params.guides 元素 id；TS `createBRepGeometry` 只传 entryArray | blocked-native-channel（需 addon/TS 参数通道 + 回放证据） |
| Emboss | ✅ 内核有，Onshape 无对应工具 | PSBRep `Emboss=27`（pad/pocket）；CDP 搜索 “Emboss/浮雕/凸起” 无结果 | 不做（无 Onshape 对齐目标，避免自造功能） |
| Sweep 引导/扭转 | ❌ 契约无 | 产品 sweep 仅单直线路径；PSBRep SweepPath 固定 entry 语义 | 后续切片（需证据 + 契约定版） |
| Rib / Thread / SheetMetal / Frame | ❌ 子系统缺失 | 无对应内核/子系统面 | 独立项目（G3） |

## Draft 若批准的实施门（估计）

- native：`PSBRepOperation.h` +`TaperFaces=37`，`PSBRepEdit.cpp` 解析 target/faces/refs/
  direction/angles/addStep → `BRepUtil::Modify::TaperFaces`；ctest 用例（顶面 ±angle 体积/bbox）。
- addon/TS：`NativeLibrary.ts`、`ElementGeometry.ts` enum 映射、interface-freeze.json、
  `docs/ITWINJS_CORE_MODIFICATIONS.md`（fork 内 core 改动）。
- backend：`DraftParams`（faces 持久引用 + 中性面/方向 + 角度）+ 求值器 + 负向用例。
- shared：bump 1.70，ADR；UI `DraftDialog`（面拾取 + 角度 + 预览可选）。
- 风险：ACIS Taper 在 BRepCore 许可范围（Modeler+Polyhedra）内，但需 Bumper/真实例回归。

## 方法备注

- “Onshape 有”以 live 证据为准：本轮用 CDP 搜索确认 Emboss 不存在于该 Onshape 版本
  工具搜索；Draft/DeleteFace/ReplaceFace 的存在性沿用 2026-11-08 对话框证据与帮助页。
- 所有 blocked 结论都不改变产品 gated 状态；能力矩阵仍以实际真栈为准。
