# ADR-0012：SplitPart 单侧世界平面切割（首切片）

- 状态：已接受（2026-11-07；计划 W2.2）。
- 关联：`docs/superpowers/plans/2026-11-06-example-coverage-continuous.md`。

## 背景与证据

- 语料 splitPart **100 个特征**（109 个 features.json）：`keepBothSides=true` 65、
  单侧 35；splitType PART 46 / FACE 54。当前无 splitPart 契约/后端/UI。
- 单侧切割（保留平面一侧）可用现有布尔能力实现：以覆盖 body 的“大盒”半空间与上游体
  做 Intersect；内核 Intersect 已于 2026-11-07 在 booleanBodies 真栈验证。
- 双侧切割会产生两个 body，超出当前单输出特征缓存语义；首切片明确不做（诚实拒收）。

## UI 证据与阻塞评估（2026-11-07，blocked-evidence）

- Onshape live 对话框证据：`ui-evidence/ui-full-audit-20261106/onshape/dialogs/split.{png,json}`
  ——字段：`零件/面` 页签、`要分割的零件、曲面或曲线`、`用于分割的图元`、
  `保留工具`、`修剪到面边界`、`保留两侧`。
- 产品当前只有世界平面单侧切割；UI 需要**目标 body 多选 + 工具图元（面/平面/
  草图）拾取 + 保留两侧**，其中工具图元拾取与面选择器、双侧多体输出均未就绪
  （双侧依赖 ADR-0015 多体输出）。故 splitPart 保持 `gated`，不以世界平面下拉
  “差不多”替代证据中的工具图元字段。

## 决策（切片 1）

1. **契约（shared 1.39.0）**：`LubanFeatureType + "splitPart"`，`SplitPartParams`：
   - `plane: "XY" | "YZ" | "XZ"`（世界法向：Z/Y/X）；
   - `offsetMm?: number`（平面沿法向偏移，缺省 0）；
   - `keepSide: "positive" | "negative"`（沿法向保留正/负侧）。
   - 首版**不支持** keepBothSides/面对切割/多 target；旧载荷无新类型。
2. **求值**：对目标 body 上游 BRep 条目：
   - 由上游几何范围求包围盒，按法向方向构造覆盖 body 的矩形，沿法向扫掠成大盒
     （BRepGeometryOperation.Sweep）；
   - `Intersect(body, slab)` 保留指定侧；passthrough 条目原样保留；
   - 结果为空（平面在 body 外/切不到）→ 抛错 status=1，不假成功。
   - 非 BRep/非 Solid 上游沿用既有诚实拒收。
3. **不做**：双侧/多 body 输出、面/草图驱动切割、UI、converter 映射（首版能力 gated）。
4. **撤销/事务**：标准 FeatureOp；无不可逆操作。

## 验证与回滚

- 单元：YZ/XY 平面正负侧体积与 bbox；偏置平面；平面在体外 status=1；校验矩阵。
- 真栈：20×20×10 盒体 YZ x=10 保留正侧 → 2000 mm³、push+重开。
- 回滚：新 FeatureType/参数 additive；移除注册即回到 1.38 行为，旧库无迁移。

## 实现记录（切片 1，2026-11-07）

- 契约 shared **1.39.0**：`splitPart` + `SplitPartParams{plane,offsetMm?,keepSide}`。
- 后端 `evaluateSplitPartAsync`：固定 100 m 半空间大盒（profile 矩形沿法向 Sweep）
  + Intersect；**不依赖 body bbox**——updateParams 时 body 已是上次切割结果，用 bbox
  会把上游范围读成半体（首版实测 Update 后停在正侧，centroid 15 而非 5）。首版单
  BRep 实体；多 lump/多体、双侧、面驱动诚实拒收。
- 后端 `SplitPartFlow` **6/6**（YZ 正/负侧 4000、XY 正侧、偏置 x=5 → 6000、
  平面体外 status≠0、校验矩阵）。
- 真栈 `e2e/split-part.spec.ts` **2 passed**：盒体 20×20×10 → YZ x=10 正侧
  **2000.000 mm³** 质心 (15,10,5) → 改负侧 **2000.000** 质心 (5,10,5)，
  push+重开一致。
- 能力仍 gated（无 UI/converter）；双侧 keepBothSides（双 body 输出）留切片 2。

## 切片 2（后续）

- keepBothSides（双 body 输出 / 多输出特征语义）、FACE/草图驱动工具、UI、converter。

**2026-11-07 双侧可行性结论（blocked-design，未开工）**：当前 body 写回契约是
**一个特征 → 至多一个 body**：`FeatureEngine.writeBodyFromCache` 只接受入缓存
**恰 1 条 BRep 条目**（`countCacheBRepEntries(entries) !== 1` → 不写；见
`FeatureEngine.ts:786-831`），body 还要求唯一源特征（多源不变量）。`splitPart`
双侧要在一个特征下产出两个 body，需要新的“多输出特征/多 body 写回”持久化语义
（body 行、源边、失败级联、冷重建、撤销全部受影响），属于架构切片，必须新 ADR +
旧库迁移 + 回滚方案；不得用“两个 splitPart 特征冒充一个 Onshape 特征”降级
（树/编辑语义会失真）。因此 keepBothSides 登记 blocked-design；单侧世界平面
切片 1 保持当前安全子集。

## UI 取证复核（2026-11-08，blocked-capability）

- 新增 live 证据（私有仓）：
  `ui-evidence/feature-dialogs-20261108/onshape/transform-picker.json` 的
  `split-initial`/`split-row*` 与对应截图（与 transform 同批 CDP 采集）。
- Onshape 分割对话框字段：`零件` / `要分割的零件、曲面或曲线` /
  `用于分割的图元` / `保留工具` / `修剪到面边界` / `保留两侧`。
- 当前产品 splitPart 仅“世界平面 + 单侧保留”，没有工具图元拾取（面/曲面/草图）、
  保留工具、修剪到面边界、保留两侧的目标 body 多体输出；这些是能力缺口而不是字段
  证据缺口。按 blocking 定级 **blocked-capability**，UI 保持 gated。
- 待“工具图元→分实体/分割语义 + 双侧多体输出”设计与 ADR-0015 落地后再实现。

## 实现记录（2026-11-09，UI 切片：单侧世界平面分割对话框 + 预览）

- **范围裁决**：UI 只暴露后端契约（shared 1.39）精确支持的单侧世界平面形态：
  - 分割类型固定「零件」，面分割静态注明未支持；
  - 目标实体插入单选（N≤1 自动）、编辑只读；
  - 分割工具固定「世界平面（XY/YZ/XZ）」+ 平面偏移 + 保留正/负侧；
  - 「保留工具」「修剪到面边界」「保留两侧」以静态文本如实标注未支持
    （双侧需多体输出 ADR-0015），不渲染可点击假控件。
- **后端**：`previewOp` update/insert 白名单加入 `splitPart`；无 schema/契约变更。
- **验证**：`SplitPartFlow` **8/8**（新增 p1 updateParams 预览、p2 insertFeature
  预览：entries>0、树/体零写）；后端全量 **880 passed / 1 expected fail /
  8 skipped**（101 files）；`SplitPartDialog` **4/4**、web **1523/1523**、
  tsc/e2e tsc/lint 绿；真栈 `e2e/split-part-ui.spec.ts` **2 passed（45.8 s）**——
  20×20×10 盒 YZ x=20 正侧 **2000.000 mm³** 质心 x=25 → 树行编辑 x=25
  **1000.000 mm³** 质心 x=27.5，插入/编辑预览 `data-dynamic=1`，push+冷重开。
- **能力状态**：`splitPart` 由 gated 翻 full；面驱动、保留工具、修剪到面边界、
  双侧多体、converter 仍 blocked/未接。
- 回滚：纯 UI + 预览白名单；无 shared/后端 schema 变更。
