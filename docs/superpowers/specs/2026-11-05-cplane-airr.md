# AIRR：基准面（cPlane）+ 草图落在自定义平面（Slice B1）

- 日期：2026-11-05
- Owner：用户（2026-11-05「按照建议优先级继续」：fillet/chamfer 边语义 → **cPlane/基准面 + 草图落在自定义平面** → shell owner 通道）
- 关联需求：`2026-11-05-sketch-feature-capability-backlog.md`（cPlane 缺口）；
  `docs/adr/0006-onshape-new-feature-types.md` 切片 B；Intro to CAD 的 Plane 1 / Sketch 2
- 预计影响仓：shared（契约 minor）、luban-backend（注册表/求值/守卫）、apps/web（对话框/树/草图平面）
- 是否需要 ADR：**是**（新增 `LubanFeatureType` + 契约字段）。ADR-0006 切片 B 已给出方向
  （引用几何而非复制坐标）；本 AIRR 是其可执行的第一切片，数据形态与后续引用模型兼容。

---

## 1. 目标与验收

- 用户问题：目前只能把草图放到 Top/Front/Right 三个世界基准面；不能创建 Onshape 的
  偏移/反转基准面，也不能让下游草图引用它。Intro to CAD 等示例的 `Plane 1` 只能靠 RPC
  预置 plane 三向量，UI 无法建出。
- 验收：
  1. Ribbon「平面」(cPlane) 打开专用对话框，字段按 live 证据：图元（参考基准面芯片）、
     偏移、偏移距离、反转法线；
  2. 提交 `insertFeature featureType:"cPlane"`，后端落 Feature 行、树内显示「平面 N」，
     status=0，不改动已有 body 体积；
  3. 新建草图对话框的平面列表同时列出三基准面与已建 cPlane；选中 cPlane 后
     `insertSketch.plane` 携带解析后的世界平面（origin/normal/xDir）以及
     `sourceFeatureId`，草图编辑态显示「自定义平面」并可完成；
  4. 真实示例（Intro to CAD）用 UI 建 Plane 1 + Sketch 2 落在 Plane 1；体积保持
     0.02% 内、树序正确、推送后重开仍在；
  5. cPlane 被草图引用时，改参与删除诚实拒收（不静默漂移）；未被引用时可正常改参/删除。
- 非目标（本切片明确不做，登记为后续切片）：
  - 非世界基准面作为参考（面/边/另一些 cPlane）；
  - cPlane 改参后驱动已引用草图/特征重定位（需要引用边 + 重解算传播，归 B2）；
  - 视口半透明平面渲染与拾取（live 证据已有，归 B1b）；
  - Onshape 的「成品」按钮、表达式输入、偏移下拉的多模式；
  - `cPoint` / 变量（ADR-0006 切片 B 的其余部分）。

## 2. Live UI 证据

- 来源：可编辑公开副本 `Intro to CAD cPlane UI Evidence`
  （`https://cad.onshape.com/documents/a1ebd69d80715dc1d9a9042a/w/858361a9c7234a7c4e1d1d56/e/af1a3a69705de3b33a3e7236`）。
- 证据目录：`D:\Github\onshape-parity-data\ui-evidence\cplane-dialog-20261105\`
  （`02-cplane-dialog.png` / `.txt` / `-controls.json`、`03-sketch2-dialog.png` / `.txt`）。
- 实测结构（原文）：
  - 标题 `Plane 1`，绿色 ✓ / 红色 ✗；
  - `图元`：芯片 `Right 平面 ×`；
  - `偏移` 下拉（当前值 `偏移`）；
  - `偏移距离`：数值输入，示例 `1.969 in`，带表达式入口；
  - `反转法线`：复选框；
  - `成品`：按钮（本切片不做）；
  - Sketch 2 对话框：`草图平面` 芯片 `Plane 1 ×`，四开关
    `禁用压印/显示约束/显示表达式/显示错误`。
- 本切片对齐范围：字段名/字段顺序/参考芯片语义/树行命名；偏移值用 mm（平台统一单位），
  下拉的多种偏移模式未采集到，先用「偏移」复选 + 距离。

## 3. 关联项目能力清单 / 复用矩阵

| 需求能力 | 现有实现 | 复用决策 | 理由 |
|---|---|---|---|
| 特征行/树/撤销 | `FeatureOp.insertFeature` + FeatureService/OpLog | 复用 | 不新增 RPC |
| 树命名/图标 | `useFeatureTree` + `FeatureTypeIcon` | 扩展 | 新增 `cPlane` 类型标签/图标 |
| 非几何特征求值 | 注册表 `evaluateAsync` | 复用 | cPlane 求值=上游条目直通（zero geometry） |
| 草图平面 | `SketchPlaneDto` + `insertSketch.plane` | 扩展 | 增 `sourceFeatureId`（派生快照来源） |
| 草图平面选择 UI | SketchDialog 平面下拉/`sketchPlaneFromOption` | 扩展 | 选项携带可选的 plane DTO |
| 对话框范式 | HoleDialog（专用对话框 + FeatureOp 提交） | 复用 | 不走通用 FeatureDialog 的草图/body 语义 |
| 偏移/翻转计算 | 无 | 新增纯函数 | 前端唯一实现，后端不复制 |

**规则**：不新增 RPC 方法；不新增 BIS 类/schema 迁移（特征参数继续走
`LubanFeature.params` JSON）；不引入第二套平面/基准面数据源。

## 4. 契约设计（shared 1.29.0）

```ts
export type CPlaneReference = "top" | "front" | "right";

/** 参考基准面 + 沿法向偏移 + 反转法线。 */
export interface CPlaneParams {
  reference: CPlaneReference;
  /** 沿参考面法向的距离（mm，可负）；缺省 0。 */
  offsetMm?: number;
  /** true=法线与 xDir 方向取反（草图正面朝另一侧）。 */
  flipNormal?: boolean;
}

export type LubanFeatureType = ... | "cPlane";

/** v1.29：草图平面来源（cPlane 特征 id）。世界三向量是派生快照；
 *  本切片只用于来源展示/引用守卫，不驱动改参传播。 */
export interface SketchPlaneDto {
  origin: ...; normal: ...; xDir: ...;
  sourceFeatureId?: string;
}
```

- 版本：`LubanFeatureRpcInterface.interfaceVersion = "1.29.0"`；shared 包 minor。
- 迁移：无。旧库无 cPlane 行；旧 SketchPlaneDto 无 sourceFeatureId 照常解析。
- 服务端 zod：`reference` 枚举、`offsetMm` 有限数、`flipNormal` 布尔；未知键拒收。
- 引用守卫（诚实拒收，不做静默漂移）：
  - `updateParams` cPlane：若任一草图 `plane.sourceFeatureId === featureId` → 拒绝，
    文案指引先删除引用草图；
  - `deleteFeature` cPlane：同上；
  - Sketch 的 plane 快照在 `insertSketch` 时一次性写入；cPlane 不是 sketch→feature 的
    依赖边（本切片），因此守卫用扫描而非边。

## 5. 跨仓影响

| 仓/层 | 契约 | schema/迁移 | native/接口 | 测试 | 发布 |
|---|---|---|---|---|---|
| shared | +cPlane 类型/参数、SketchPlaneDto.sourceFeatureId、1.29.0 | 无 | 无 | contract 回归 | 与 MS/web 同批 |
| luban-backend | 注册 cPlane（schema/直通求值/表单模型）；引用守卫 | 无 | 无 | HoleFlow 同款 StandaloneDb + 真栈 | 重建 MS 产物后同批 |
| apps/web | CPlaneDialog、ribbon 路由、树标签/编辑、SketchDialog 平面选项 | 无 | 无 | 单测 + Intro to CAD e2e | 同批 |

## 6. 数据/事务/安全

- 事实源：`LubanFeature.params`（cPlane 定义）+ 草图 `params.plane`（派生快照）。
  `sourceFeatureId` 是来源指针，不是第二事实源。
- 事务：cPlane 插入/改参/删除全部走 `FeatureOp` → `EditTxn`/OpLog/撤销；写租约不变。
- 失败：非法参考/非有限偏移在 zod 拒收；被引用改参/删除在 txn 前拒收；不做 no-op 假成功。
- 兼容：旧客户端不认 cPlane 类型时会在树中显示原始类型名；不会误编辑（FeatureDialog
  编辑入口只认已知类型）。cPlane 不能被旧客户端提交。

## 7. 测试证据

- 单元/契约：shared 编译与既有 contract 测试；CPlaneParams 增删键校验。
- 后端 StandaloneDb：cPlane 首特征 + 其上草图 + 拉伸体积等于对照；cPlane 插在体后体积
  不变；被引用改参/删除拒收；未引用删除成功；树行 status=0。
- 前端：CPlaneDialog 提交/回显/非法输入；cPlane 平面纯函数；SketchDialog 自定义平面
  载荷（含 sourceFeatureId）；树标签。
- 真栈 e2e：Intro to CAD 用 UI 建 Plane 1（Front 偏移 −20 mm），新建 Sketch 2 选择
  Plane 1（空草图先建壳），RPC 注入精确实体后完成；树 `sketch, extrude, cPlane, sketch`；
  体积 85157.342 mm³；推送后重开一致。证据截图更新到 demo-artifacts。
- 回归：web 全量 vitest、12 个示例 iModel 重开 12/12、e2e tsc/lint、后端既有
  ScenarioReplay 5/5。

## 8. 回滚

- 回滚 shared 类型/版本与后端注册（删除 cPlane 行）；前端隐藏 ribbon 路由/对话框，
  SketchDialog 自定义平面选项回退为三基准面。
- 已落库 cPlane 行在旧客户端会作为未知类型显示（不误编辑）；回滚前应导出/删除示例中的
  cPlane 行，避免树噪声。草图 `sourceFeatureId` 是可选键，旧客户端忽略后仍可编辑。

## 9. 评审结论

- 复用矩阵完成：是
- 跨仓影响明确：是
- P0 例外已登记：否（无新 P0 例外；本切片遵守单一管道/单一契约）
- ADR：需要（ADR-0006 切片 B 方向 + 本 AIRR 契约细节）
- Owner 签字：用户 2026-11-05「按照建议优先级继续」+「网页都可以正常打开，能创建副本并编辑」
- 结论：**批准执行**（Slice B1；B1b/B2 另立 AIRR）

## 10. 实施与验证记录（2026-11-05）

- 契约：shared **1.29.0** — `LubanFeatureType + "cPlane"`、`CPlaneParams`
  （reference/offsetMm/flipNormal）、`SketchPlaneDto.sourceFeatureId?`；shared 全量
  155/155（RPC 契约文件 63/63；新增 v1.29 形状/往返/旧三向量兼容断言）。
- 后端：`FeatureTypeRegistry` 注册 cPlane（异步直通求值）；`evaluateCPlaneAsync`
  原样返回上游条目；`planInsert` 默认 prev 改为**目标 body 真实驱动源**（引用几何可挂链尾
  而不驱体；纯几何链等价）；`applyInsert` 对 cPlane 跳过 body rewire/驱动边；
  被草图 `sourceFeatureId` 引用时改参/删除在 txn 前拒收（apply/preview 同文案）。
  `CPlaneFlow` 2/2、`FeatureTypeRegistry` 27/27（新增 cPlane 正负路径）；后端全量
  **84 files / 734 passed / 8 skipped** 绿。全量首跑发现的 3 项：`FeatureRpcImpl`
  表单模型期望补 cPlane/hole（本次契约扩展）；`Tutorial2Fixture` 的 SHA 钉在
  Windows `core.autocrlf=true` 检出下因 CRLF 误报（改为 LF 归一后哈希，仍钉 canonical
  内容；非内容变更）；`MirrorElementDirectEdit` 10s hook 超时为并发负载抖动，
  单跑/全量复跑均绿；`HoleFlow` 的 30s 写租约在慢负载下于第 5 条用例前过期，
  已改为 `beforeEach` 逐用例重取（测试隔离修复，不改产品租约策略）。
- 前端：`CPlaneDialog`（图元芯片/偏移/偏移距离/反转法线）；`internal/cplane.ts`
  唯一平面派生（含 -0 归一）；`SketchDialog` 选项携带 plane 快照、编辑态按
  `sourceFeatureId` 显示「平面 N」；ribbon cPlane 路由；树标签「平面」。web 全量
  **1361/1361**；e2e tsc/lint 绿。
- 真栈：`e2e/examples/intro-to-cad.spec.ts` 2 passed（1.3 min）——UI 建 Plane 1
  （Front 偏移 −20、反转法线），SketchDialog 选 Plane 1 建壳（plane 快照 +
  sourceFeatureId 断言命中），RPC 注入 6 个草图实体；树
  `sketch → extrude → cPlane → sketch` 全 status=0；体积 **85157.341 mm³**
  （目标 85157.342，−0.000001%）；推送后重开一致。新示例 iModel
  `de911416-9dca-4be9-86c3-813458bc18f6`，changeset
  `414c7b615b04ef0ca9e14156018d54d69617ba03`；演示截图 001–010 与
  manifest/gallery 已更新。12 个示例 iModel 重开回归通过。
- 复审裁决（实施中发现的链语义缺陷）：cPlane 最初按普通特征附着 body 时，
  后续 `operation=new` 会因默认体被 cPlane 驱动而另建第二个体（测试实测体积读回 0）。
  已按「引用几何不驱体 + prev 取 body 源」根治，并保留纯几何链行为；由
  `CPlaneFlow` 首特征用例与既有 136 项回归锁定。
- 已知边界：B1b 视口平面渲染/拾取；B2 改参传播与任意参考几何；Onshape「偏移」多模式
  下拉、表达式入口与「成品」按钮未实现（不伪造）。
