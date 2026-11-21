# ADR-0025：solver-neutral 固定参考几何（fixed reference geometry）

- 状态：**已接受（2026-11-21，随用户 AIRR 批准）**；**条件性接受**：S0 固定曲线探针
  （libslvs lockedGroup 下的 DOF/约束行为）失败时，本 ADR 的实施形态降级为**受限固定点
  partial**——只允许 PIERCE 隐藏固定交点 + coincident，约束引用投影/交线/轮廓曲线一律
  拒收，能力账本登记 partial，不得用近似或第二求解通道冒充 full。
- 日期：2026-11-21
- 关联：ADR-0009（草图外部引用母 ADR）、ADR-0024（模型边/面外部引用增量）、已批准 AIRR
  `docs/superpowers/specs/2026-11-21-sketch-external-references-airr.md` §4.5/§7 S2/§9.4、
  计划 `docs/superpowers/plans/2026-11-19-onshape-full-parity.md` §5 B3。
- 影响面：私有 `modeling-server` 的 solver-neutral 接口（`SolverTypes` / 归一化层 /
  `SlvsSolver`）与固定参考展开；**本 ADR 不改变 shared DTO 形状**（shared 契约见 ADR-0024）。

## 1. 背景与约束

- 现有 solver-neutral `fixed` 约束只接受**单个 point**：其参数在实体合成阶段放入
  `lockedGroup`（与工作平面常量组同机制），不新增方程、不计 DOF。**没有曲线级固定语义**。
- ADR-0009 切片 1a 把投影实体在求解前 `split` 出去：投影不参与 DOF，且约束引用投影实体
  在 op 边界**一律拒收**。该口径无法表达 PIERCE（本地点/端点落到模型边）与「投影边作为
  固定参考被 coincident/distance/tangent 引用」。
- 约束求解是 P0-09 冻结接口：真形/绳墨替换必须只经 solver-neutral。任何接口变更必须先
  ADR、后补双跑一致性语料；libslvs 不得泄漏到业务层，且维持纯云 SaaS 姿态（X-08）。

## 2. 决策

### 2.1 接口形态：请求级 `fixedEntityIds`

```ts
export interface SketchSolveRequest {
  entities: SketchEntity[];
  constraints: SketchConstraint[];
  paramsHint?: Record<number, number>;
  group?: number;
  /** ADR-0025：固定参考实体 id 集——参数进锁定组，不参与 DOF，可被约束引用。 */
  fixedEntityIds?: number[];
}
```

- **实体形状不变**：不往 point/line/circle/arc/spline 各加 `fixed?: boolean`。理由：
  五个实体变体的 zod strict schema 与线上形状零 churn；避免与既有 `fixed` 用户约束同名混淆；
  请求级 id 集更易校验、序列化与归因。
- **校验前移**（调 native 前）：`fixedEntityIds` 必须是存在的实体 id、无重复；未知/重复/
  悬空 id → `validateSketchRequest` 拒收（零求解、零变更）。空数组等价于缺省。
- **旧请求逐字不变**：不带该字段的请求行为与当前完全一致。接口是 zod strict，旧实现遇到
  未知字段必须明确拒收（fail closed），不得静默忽略；冻结 hash 同 PR 更新。

### 2.2 求解语义：固定但不冻结整个草图

- **不参与 DOF**：`fixedEntityIds` 中实体的全部参数分配进 `lockedGroup`（与现有 fixed
  point/工作平面同一机制）。不新增方程，`dof` 由 libslvs 自然排除；`lockedGroup` 参数只
  作为对方程的常量输入。
- **可被约束引用**：移动侧实体的约束照常生成方程，固定参考一侧是常量。首版消费白名单：
  - `coincident`：本地点/线端点 ↔ 固定点/固定曲线（含 PIERCE 隐藏点）；
  - `distance`：本地点 ↔ 固定点/固定线，沿用既有 point/line 组合与有符号垂距语义；
  - `tangent`：本地 line/arc/circle ↔ 固定 line/arc/circle（仅限求解器已有原语形态）。
  其它 kind 引用固定参考一律先拒收，按 conformance 证据逐项放宽；不得为了“能选”而生成
  无几何意义的方程。
- **全固定约束 = 检查，不是方程**：refs 全在固定参考上的约束不产生移动自由度。满足则接受
  （不新增方程）；不满足则 `conflicting`。若 conformance 证明容差会造成假绿，首版可整体
  拒收全固定约束，能力登记 partial。
- **不得把固定参考当可移动实体**：禁止给固定侧补自由参数、禁止用“最近点/采样”让约束看似
  满足；无法满足即 `conflicting`，由读层按外部引用 id 归因。
- **归因不泄漏内部句柄**：`failedConstraintIds` / `conflictingRank` 只含用户约束 id；PIERCE
  隐藏点、锁定组、内部构造方程不得出现在用户可见约束树或失败归因中。

### 2.3 PIERCE 展开：隐藏固定交点 + coincident

- **精确求交**：模型边 × 草图平面；line/arc 用解析解，spline 用 core-geometry 平面交点
  （`CurvePrimitive.appendPlaneIntersectionPoints`）。只接受**唯一交点**。
- **唯一交点** → 合成隐藏固定点（进入 `fixedEntityIds`，坐标=交点）+ `coincident` 到本地点/
  端点（ADR-0024 `externalRefs[].localEntityId`）。隐藏点每次快照重新派生，**不写 params、
  不写 native stream、不是用户实体、不参与面域**。
- **失败封闭**：0 交点 → `projection-pierce-miss`；多交点 / 边在草图平面内 / 切点 →
  `projection-pierce-ambiguous`。切点语义未经 live 证明，首版不猜测、不取最近交点。
- **降级形态**：固定点语义可用而固定曲线不可用时，PIERCE 仍按隐藏固定点工作，但约束引用
  投影曲线拒收；两者都不可用 → PIERCE 登记 blocked，UI gated。

### 2.4 求解器边界与许可

- **单一求解通道**：只扩展 solver-neutral 接口；`SlvsSolver` 负责把 `fixedEntityIds` 映射到
  libslvs `lockedGroup`；业务层（FeatureService/SketchProjection/FeatureEngine）不 import
  libslvs 符号。**不新增第二套求解器/求解路径**。
- **绳墨平替**：绳墨实现同一接口并认领相同 `fixedEntityIds` 语义与 `dof` 规则；替换前需
  双跑一致性语料（固定点/固定曲线/全固定约束/PIERCE 展开）。
- **许可姿态不变**：libslvs 仅纯云 SaaS（X-08）；不得打包进 on-prem/客户端产物；本 ADR
  不引入任何新外部依赖。

### 2.5 失败与 DOF 语义

| 场景 | 语义 |
|---|---|
| 未知/重复/悬空 `fixedEntityIds` | `validateSketchRequest` 拒收（调 native 前，零变更） |
| 固定曲线/点 | 参数进 `lockedGroup`；不计 DOF；无新增方程 |
| 移动侧约束引用固定参考 | 正常方程；移动侧 DOF 按方程数减少 |
| 全固定约束满足 | 接受；不新增方程；不改变 DOF |
| 全固定约束不满足 | `conflicting`；归因到用户约束 id |
| 固定参考被要求“移动”才能满足 | `conflicting`；不补自由参数、不近似 |
| 快照缺失/过期 | 读路径失败（ADR-0024），不是求解器 `failed`；消费特征 `status=1` |
| `construction` 与固定性 | 正交：固定性只影响 DOF；是否进面域仍由 `construction` 决定 |

### 2.6 交付切片与 S2 门禁

- **S1**：`fixedEntityIds` + 模型边投影曲线固定；验证 `coincident/distance/tangent` 引用
  固定边；盒体顶面四边 → 投影环 → 拉伸 4000 mm³。
- **S2（PIERCE）**：边×平面精确交点 + 隐藏固定点 + coincident；改上游联动；0/多交点/
  切点/边在平面内 reject。
- **S3**：平面面环投影曲线固定；面域/下游联动。
- **S4**：INTERSECTED/SILHOUETTED 求解器侧只在 ADR-0024 条件性探针通过后接入；本 ADR 不
  单独授权轮廓/内部交线实现。
- **S0 探针（S2 门禁，先于产品代码）**：
  1. line/circle/arc/spline 全参数进 `lockedGroup` 后 `dof` 正确、无新增方程；
  2. coincident/distance/tangent 引用固定曲线可收敛，全固定约束检查语义稳定；
  3. 边×平面交点（line/arc/spline）与切点/多交点行为。
- **门禁结论**：探针 1 失败 → 受限固定点 partial；探针 2 失败 → 收窄白名单或拒收全固定；
  探针 3 失败 → PIERCE blocked。任何降级都必须在能力账本与 AIRR 退出记录中如实登记。

### 2.7 与 ADR-0009 切片 1a 的关系（收窄而非推翻）

- ADR-0009 切片 1a 的「约束引用投影实体一律拒收」**仅对显式持久化到 ADR-0024
  `externalRefs` 并标记为固定参考的实体收窄**：这些实体可被约束引用但不可移动。
- 旧 1a 草图→草图投影若未携带 `externalRefs` 固定标记，**继续按 1a 拒收**——避免无证据、
  无快照语义地扩大旧行为。
- ADR-0004 §1 的 `kind: "projected" | "pierce"` 约束提案不采用；外部引用仍是独立表，
  求解器不新增用户可见约束 kind。

## 3. 备选方案与拒绝理由

| 方案 | 拒绝理由 |
|---|---|
| 实体级 `fixed?: boolean` | 五个实体变体 + zod strict schema 全改，线上形状 churn；与既有 `fixed` 用户约束同名易误读；请求级 id 集已足够 |
| 用普通 distance/angle 约束“冻结”参数 | 仍占 DOF/方程，无法表达“整条曲线固定且不计 DOF”；会把固定参考当普通几何 |
| 新开一套固定参考求解通道 | 违反 P0-09 单一求解器冻结接口；绳墨替换将出现双语义 |
| 把投影/交点几何持久化进 params 或 native stream | 违反 P0-06；上游变化后成为陈旧第二事实源 |
| 用最近点/采样让 PIERCE/相切“成功” | 假几何；parity 状态定义与 P0-10 禁止；宁可失败封闭 |
| 维持 1a：投影不可被约束引用 | PIERCE 与「投影边作为参考」工作流无法实现，B3 只剩显示功能 |

## 4. 契约边界与跨仓影响

| 仓/层 | 变更 | 发布 |
|---|---|---|
| shared | **本 ADR 无 DTO 变更**；外部引用契约见 ADR-0024（1.85.0 提案） | 随 ADR-0024 同批 |
| modeling-server 求解器（私有） | `SolverTypes.fixedEntityIds` + zod/跨实体校验、归一化层、`SlvsSolver` lockedGroup 映射、全固定检查、PIERCE 隐藏点展开；冻结 hash 更新 + conformance 语料 | shared 后同批 |
| modeling-server 特征层（私有） | PIERCE 交点派生、外部引用 id 归因、快照接入；复用标准 FeatureOp/事务 | 同批 |
| web | 不直接接触求解器；只消费 ADR-0024 的 `externalRefs`/`projection` 状态 | 同批 |
| native / ACIS | 无变更；仅消费现有子实体几何/求交能力 | 不变 |
| 接口冻结矩阵 | 落地时更新 Solver-neutral 行证据与冻结 hash；版本 bump 归 ADR-0024 | 同 PR |

- 版本归属：`LubanFeatureRpcInterface.interfaceVersion` 的 1.85.0 bump 由 ADR-0024 承担；
  本 ADR 只 bump solver-neutral 冻结 hash（私有仓清单），不得重复/遗漏 bump。
- 旧实现兼容：不带 `fixedEntityIds` 的请求逐字不变；旧实现遇未知字段明确拒收。

## 5. 测试计划（计划；未运行前不得宣称完成）

- **求解器 conformance（solver-neutral）**：
  - 固定 line/circle/arc/spline：参数进锁定组，`dof` 与无固定参考的基线差值符合预期，
    方程数不增加；重复求解确定性一致。
  - coincident / distance / tangent 引用固定参考：移动侧收敛、DOF 正确；不支持的 kind
    引用固定参考 → 验证层拒收。
  - 全固定约束：满足 → 接受且不改变 DOF；不满足 → `conflicting`；`failedConstraintIds` /
    `conflictingRank` 只出现用户约束 id。
  - PIERCE：隐藏固定点坐标=精确交点；本地点收敛；隐藏点不出现在用户实体/面域；无额外 DOF。
  - 校验：未知/重复/空 `fixedEntityIds`；旧请求逐字通过；strict schema 拒绝未知字段。
- **StandaloneDb 集成**：盒体顶面四边 → 投影闭环 → 拉伸 10 = 4000 mm³；改上游尺寸 →
  投影/体积联动；PIERCE 坐标 + DOF + 改上游联动；0/多交点/切点/边在平面内拒收；源删除/
  抑制 → 消费特征 `status=1`；undo/redo；冷开重开；只读 briefcase 失败封闭。
- **真栈 e2e**：`sketch-projection-body.spec.ts`（成功 + 失败注入）、`sketch-pierce.spec.ts`
  （成功 + 失败）；ADR-0009 1a `sketch-projection.spec.ts` 与 `sketch-use.spec.ts` 回归。
- **负路径**：无旧坐标/最近点/采样回退；全固定矛盾不假绿；固定参考不可移动；快照缺失
  不落成求解器失败。
- **探针失败时**：只跑受限固定点用例；能力登记 partial，不建固定曲线假绿 spec。

## 6. 回滚

- **停止发射**：feature 层不再传 `fixedEntityIds`；求解器不传字段时行为与当前逐字一致。
- **已有引用文档**：文件保留 `externalRefs`（ADR-0024）；回滚到旧 solver/schema 时未知字段/
  未知 kind 明确失败封闭，不静默丢弃；只允许前滚修复或从启用前 checkpoint 恢复。
- **无迁移**：隐藏点/投影几何从不持久化，无需数据迁移或回滚脚本。
- **发布门**：conformance + StandaloneDb + 真栈回归 + `verify-stack` 全绿。

## 7. P0 对照

| 规则 | 本 ADR 口径 |
|---|---|
| P0-01 iTwin 唯一底座 | 求解仍由 FeatureService 标准事务驱动；不新建模型/撤销状态机 |
| P0-03 复用优先 | 复用既有 `lockedGroup`、fixed point、solver-neutral 三层与核心几何求交；不建第二求解器 |
| P0-04 先论证后编码 | 已批准 AIRR + ADR-0024 + 本 ADR；S0 探针前不写 S2 产品代码 |
| P0-06 单一数据源 | 固定参考/隐藏点是派生求解输入，不持久化；`params.externalRefs` 仍是唯一引用事实源 |
| P0-07 契约唯一 | shared DTO 只在 ADR-0024 变更；本 ADR 只改后端 solver-neutral 冻结接口 |
| P0-09 内核/求解器冻结与许可 | 只扩 solver-neutral；libslvs 类型不泄漏；GPL 纯云 SaaS 姿态不变 |
| P0-10 可撤销/HITL | PIERCE/外部引用写入走标准 FeatureOp 事务；X-05 仍按 ADR-0024 §8 复核 |

## 8. 开放条件与条件性接受

1. **固定曲线探针**（S2 门禁）：lockedGroup 下整条曲线的 DOF/约束行为未实测前，full 形态
   不成立；失败即降级受限固定点 partial（§2.6）。
   - **2026-11-21 S0 结果**：探针通过——line（两端点 fixed）、circle（圆心+半径）、arc
     （圆心+半径+两隐藏 fixed 端点+coincident）、spline（四控制点 fixed）均可表达固定曲线；
     隐藏 fixed 点 + coincident 可表达 PIERCE。**S2 仅 line/arc 放行**；point-on-spline
     被现有校验拒收，样条 PIERCE 保持 blocked（不得折线近似）。
2. **约束白名单**：coincident/distance/tangent 之外的 kind 是否有真实需求与正确方程，待
   conformance/语料证据逐项放宽；未证前拒收。
3. **全固定约束**：接受（满足）与 `conflicting`（不满足）的容差/假绿风险待探针；必要时
   首版整体拒收。
4. **PIERCE 歧义**：切点、多交点、边在平面内的 Onshape 行为未采集；首版一律失败封闭。
5. **与 ADR-0009 1a 的边界**：仅 `externalRefs` 标记的固定参考可被约束；旧 1a 投影继续
   拒收；若未来要把旧投影纳入，需要显式迁移/兼容证据，另 ADR 增量。
6. **X-05**：本 ADR 不改变草图整体覆写 undo 例外；发布仍受 ADR-0024 §8 条件约束。

## 9. 关联文档

- `docs/adr/0009-sketch-external-references.md`
- `docs/adr/0024-sketch-external-refs-model-topology.md`
- `docs/superpowers/specs/2026-11-21-sketch-external-references-airr.md`
- `docs/architecture/INTERFACE-FREEZE-MATRIX.md`（Solver-neutral 行）、
  `docs/architecture/EXCEPTIONS.md`（X-05/X-08）
- `docs/DEVELOPMENT-RULES.md`（P0-03/P0-04/P0-06/P0-07/P0-09/P0-10）

---

*本 ADR 为 solver-neutral 固定参考几何的冻结条文；未写产品代码、未改 shared/backend/web 契约、未 commit/push。*
