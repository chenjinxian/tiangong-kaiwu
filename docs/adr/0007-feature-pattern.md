# ADR-0007：FEATURE pattern（特征级阵列）第一切片

- 状态：已接受（计划 W1.4 第一切片，2026-11-07）。
- 关联：`docs/adr/0005-extrude-revolve-contract-onshape-parity.md`、
  `docs/adr/0006-onshape-new-feature-types.md`、
  `docs/superpowers/plans/2026-11-06-example-coverage-continuous.md`（W1.4/T10）。

## 背景与证据

Onshape 语料 36 个 Part Studio / 66 个 pattern 特征，其中 **FEATURE pattern 46 个
（circular 27 + linear 18 + curve 1）**，PART 9、FACE 9。产品原 `pattern` 契约
（v1.14 `PatternParams`）只支持 **PART/body 级**、世界 X/Y/Z 平移与世界 Z 过原点
旋转；FEATURE pattern、任意轴引用、曲线阵列明确不支持。真实示例（如 Exercise:
Clamp / Handle Parts）的 linear pattern 为 `patternType=FACE`，不属于本切片。

本切片解决“特征产生的几何增量”这一最小语义，使 replay 能把 Onshape FEATURE
pattern 的源特征 + 轴线段落到产品特征行，而不是伪造 PART pattern 或跳过。

## 决策

1. **新特征类型 `featurePattern`**（不扩展 `PatternParams`，避免污染既有 PART
   阵列的守卫/UI/测试）：
   ```ts
   interface FeaturePatternParams {
     sourceFeatureId: string;          // 同链上游特征（本地 featureId）
     kind: "linear" | "circular";
     count: number;                    // 含原件，2..1000
     spacing?: number;                 // linear >0
     angle?: number;                   // circular (0,360] 度
     axis: { origin: Vec3; direction: Vec3 }; // 任意世界轴线段
   }
   ```
   `count` 含原件；linear 实例 k 沿 `direction` 平移 `k*spacing`；circular 实例 k
   绕轴线段旋转 `k*step`（整周 angle=360 → step=angle/count；部分角 →
   angle/(count−1)，与 `PatternParams` 同口径；右手定则）。
2. **增量语义（缓存差集）**：求值时不重新求值源特征参数，而是读取
   `FeatureOutputCache`：
   - `add`：delta = 源后 − 源前（源新增材料）；
   - `remove`：delta = 源前 − 源后（源去除材料；hole 恒 remove）。
   再对 delta 逐实例变换，按源操作与当前体 Unite/Subtract。
   这样 blind/throughAll/symmetric/多面域源一视同仁，且不依赖内核的 taper/loft 等
   额外能力。
3. **源白名单**：仅 `extrude`/`revolve`/`hole` 且 operation 为 `add`/`remove`。
   NEW 源（无上游/独立造体）、fillet/chamfer/shell/mirror 源（增量语义不成立）、
   抑源、缺失源、缓存冷/失败一律**诚实拒收**（status=1 或 op 拒绝），不静默退化。
4. **无 UI 入口**（backend/contract 先行）：无 Onshape live 特征阵列对话框证据前
   不新增假控件；树行/图标走通用 fallback。UI 切片需采集 FEATURE pattern 对话框
   （源特征列表/方向/轴/实例数/skip）后另批。
5. **转换器后续（语料语义未解，暂不映射）**：2026-11-07 核查 66 个 pattern raw
   features——FEATURE pattern 46 个**全部 `operationType=NEW` 且 `entities=[]`**
   （源特征列表未在参数里返回，`fullFeaturePattern=true`；方向 query 常引用
   OFFSET_EDGE/派生边）。源特征集合与 NEW 语义（新体 vs 改体）不明，**不得**按
   “最后一个特征”猜测。需先在 Onshape 公共副本 live 检查 FEATURE pattern 对话框/
   API 载荷，确认源特征字段与 NEW 语义后，再实现 converter 映射；在此之前语料
   FEATURE pattern 维持 blocked，不默认世界轴、不伪造源特征。

## 实现（第一切片，shared 1.34.0）

- shared：`LubanFeatureType + "featurePattern"`、`FeaturePatternParams`、
  `PatternAxisLine`、`FeatureParams` 联合、opDsl 白名单、`interfaceVersion 1.34.0`；
  shared 单测 **160/160**（含 v1.34 契约块）。
- 后端（私有仓 `luban-backend`）：
  - registry `featurePatternSchema`（count/spacing/angle 互斥、轴方向非零）；
  - `evaluateFeaturePatternAsync`：源前后缓存差集 → 实例变换（线性/任意轴圆周）→
    源操作 Unite/Subtract；`transformBRepEntry` 与 PART pattern 共用；
  - `FeaturePatternFlow.test.ts` **4/4**：2×2×2 盒 + 0.5³ 凸台线性 3 实例
    **8.75 mm³**；盒 + 对角凸台绕 (1,1,0)+Z 圆周 4 实例 **12 mm³**；源 sketch/NEW/
    缺失、零轴/形态互斥拒收；registry/RPC **46/46**。
- 真栈：`e2e/examples/feature-pattern.spec.ts` **2 passed**——40×40×10 盒 +
  顶面 4×4×5 凸台 + linear 3 实例（spacing 6 沿 X），体积
  **16240.000 mm³**（16000 + 3×80），push 后重开树
  `sketch/extrude/sketch/extrude/featurePattern` 全 status=0、体积一致。
- 发布：**未发布**。shared 1.34 尚未重建/发布 web/MS 产物；发布必须 shared →
  backend → web 同批，且不能与 1.32/1.33 产物混用。

## 风险与后续

- **增量差集成本**：每次 pattern 求值多做两次布尔（源前/后差集）+ 实例并/减；
  大源/大实例数的性能需在真实示例上测量；失败时 status=1 级联，body 保留最后几何。
- **源特征被后续特征改写**：差集基于源特征时刻的前/后缓存，与当前体的后续修改
  无关；若 Onshape 语料的 pattern 引用源在链后仍被编辑，需在回放层登记语义差异。
- **语料映射缺口（未解）**：46 个 FEATURE pattern 均 `operationType=NEW` +
  `entities=[]`，本切片只支持 add/remove 源的改体阵列，**当前无法证明能映射任何
  真实语料 FEATURE pattern**；需 live 语义取证后另立切片，不能把后端合成绿当作
  示例覆盖。
- **FACE/PART 语义**：PART pattern 继续走既有 `pattern`；FACE pattern、曲线阵列、
  per-instance skip、第二方向不在本切片。
- **UI/编辑**：双击编辑、抑制、删除、预览、树图标/名称与表单通道未接；能力状态
  保持 🟠（backend/contract 首切片），不得宣称 UI complete。
