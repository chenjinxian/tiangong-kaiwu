# ADR-0005：拉伸/旋转特征契约扩展（终止条件、布尔、方向与 draft）

- 状态：已接受（2026-11-04；Phase 1：extrude endBound blind/throughAll、direction、
  startOffsetMm、operation remove/intersect；Phase 2 已落地 revolve new 与 extrude
  secondDirection（shared 1.24.0）；upTo*/draft 仍待后续）
- 关联：`docs/adr/0004-sketch-contract-onshape-parity.md`、
  `docs/superpowers/specs/2026-11-04-onshape-batch1-gap-matrix.md`
- 决策者：LubanCAD 平台团队

## 背景

Onshape 示例的 extrude/revolve 远超当前 `ExtrudeParams`/`RevolveParams`：

- `ExtrudeParams` 只有 `operation: new|add|remove`（后端明确拒收 remove）、
  `distance`、`symmetric`、`regions`；没有 `endBound`、方向、起始偏移、draft、
  第二方向、面选择。`RevolveParams` 保留 new/remove 枚举但 schema 拒收。
- Part Feeding Machine Pallet 使用 extrude REMOVE、THROUGH_ALL/UP_TO_NEXT/
  UP_TO_SURFACE、draft、第二方向；Exercise: Clamp 使用 REMOVE/INTERSECT 与多种
  终止条件；Bench SPINDLE 使用 revolve NEW/REMOVE。
- Tutorial 2 iOS 的 Extrude 2 是 imprint-face extrude（从草图内圆在实体上的
  imprint 面拉伸 50mm），当前只能用草图面域近似，属于需要明确的能力边界。

按 P0-04/P0-07，任何 FeatureOp 形状变更必须先 ADR + shared 版本 bump。

## 决策

### 1. ExtrudeParams（shared，additive）

新增可选字段：

```ts
endBound?: "blind" | "throughAll" | "upToNext" | "upToSurface" | "upToVertex";
endBoundRef?: { faceKey?: string; bodyKey?: string; vertexKey?: string };
operation: "new" | "add" | "remove" | "intersect"; // 若内核不支持 intersect，schema 明确拒收
direction?: "forward" | "backward";
startOffsetMm?: number;
draftAngleDeg?: number;
draftPullDirection?: boolean;
secondDirection?: {
  endBound: "blind" | "throughAll";
  distanceMm: number;
  direction?: "forward" | "backward";
  draftAngleDeg?: number;
};
```

语义：

- 缺省 `endBound="blind"`、`direction="forward"`、`startOffsetMm=0`，
  旧 params 行为逐字不变。
- `throughAll`/`upToNext`/`upToSurface`/`upToVertex` 必须由内核/几何求值实现，
  不允许前端把终止条件“换算”为固定 distance 伪装支持。
- `upToSurface`/`upToVertex` 需要 `endBoundRef`；缺 ref 在 op 边界拒收。
- `remove` 走 Subtract；`intersect` 只有在后端内核求值路径存在时才接受，否则
  schema 拒收并登记 `blocked-capability`。
- `symmetric` 与 `direction`/第二方向互斥规则需在 schema 明确，禁止静默优先级。
- 起始偏移是沿拉伸方向的 profile 平移；draft 是侧壁角度；两者都需要预览与提交
  共用同一参数。

### 2. RevolveParams

- 启用 `operation: "new" | "add" | "remove"`；当前 schema 对 new/remove 的显式
  拒收删除。
- `mergeScope` 与 extrude 同口径：remove 必须有目标 body；new 不得带 mergeScope。
- FULL 360° 与非全周 angle 语义不变。

### 3. 面选择 / imprint-face extrude

本 ADR **不**新增 `ExtrudeParams.faceRefs`。Tutorial 2 iOS 的 Extrude 2 先在场景
adapter 中映射为对应草图面域（左环面域）；如果映射后的体积/特征树不能对拍，
再开 ADR-0006 增加 face-extrude，而不是在 1.22/1.23 里半实现。

### 4. 版本与发布

- 实际发布序列：ADR-0005 Phase 1 = 1.22.0；ADR-0004 第一切片 = 1.23.0；
  ADR-0005 Phase 2（revolve new 无形状变更、secondDirection 增字段）= **1.24.0**。
- backend/web 同批；`FeatureTypeRegistry` schema、shared DTO、FeatureDialog、
  preview 共用新字段；DSL 白名单同步。
- 旧库 fixture：Tutorial 2 gold + 旧 extrude 参数（无新字段）必须逐字可读；
  新增字段全部可选，无 BIS schema 迁移。
- 回滚：回退 shared/backend/web 到上一版本；旧数据不含新字段，不需要 down 迁移。

### 5. 测试证据

- schema 单测：每个 endBound/operation/direction 组合的接受/拒收；互斥规则。
- StandaloneDb/FeatureService：BLIND vs THROUGH_ALL vs UP_TO_NEXT 的体积差；
  REMOVE/INTERSECT 的 body 数/体积；draft/startOffset/secondDirection 的几何差。
- 真栈 e2e：Pallet/Clamp 的代表特征链；至少一个 REMOVE + 一个 UP_TO_SURFACE。
- 旧 fixture 回归：Tutorial 2 六特征链体积不变（357.568 ±0.5%）。
- 负路径：缺 endBoundRef、remove 无目标 body、intersect 未实现、draft 越界。

## 实现记录（2026-11-04，Phase 1）

- shared 1.22.0：`ExtrudeParams` 增 `endBound`（blind/throughAll 已实现，upTo* 服务端拒收）、
  `direction`、`startOffsetMm`；`FeatureBooleanOperation` 增 `intersect`。
- backend：extrude `remove`→Subtract、`intersect`→内核 Intersect；`throughAll` 用项目范围
  + 上游可转换范围计算距离（BRep flatbuffer 无 GeometryQuery range，不伪装读取）；
  `direction=backward` 反向扫掠；`startOffsetMm` 沿法向平移剖面。
- UI：extrude 的移除/相交页签启用；方向/起始偏移从本地状态进入真实 params。
- 验证：`FeatureOperationSemantics.test.ts`（remove/throughAll/direction/offset 体积与质心）、
  `FeatureTypeRegistry.test.ts` 21/21、`FeatureEngine.test.ts`+语义 14/14、FeatureDialog 130/130、
  shared 151/151、`tsc` 通过。真栈：MS 源码模式 1.22.0 + web 1.22.0 下 `tutorial2.spec.ts`
  **2 passed（4.0 min）**，体积/特征树与 1.21.0 基线一致；产物模式 `dist-backend` 仍是
  1.21.0，发布前必须按 shared→backend→web 重建，否则 RPC 版本门禁会拒绝。
- revolve remove 已落地：`RevolveParams.operation="remove"` → Subtract；UI revolve 移除页签启用。
  验证：`RevolveFlow.test.ts` 9/9（方柱 − 半圆柱 = 64−π）。
- **Phase 2 第一项（v1.23，2026-11-04）：revolve operation="new" 已落地**——NEW-body 行
  不消费上游平铺条目，`AsyncFeatureEval` 直接返回旋转工具体；schema 拒绝 new+mergeScope；
  FeatureService 的 NEW-body 目标规划与 UI 替换/回显同步支持 revolve。验证：
  `FeatureOperationSemantics` 新增「上游已存在时 revolve NEW 产出第二个独立 body」
  （10×20 矩形绕底边 4000π 圆柱，总体积 500+4000π）；`FeatureTypeRegistry` new 接受、
  mergeScope 拒收；FeatureDialog 130/130（revolve 新建页签启用，相交仍禁用）。
- **Phase 2 第二项（shared 1.24.0，2026-11-04）：extrude `secondDirection` 已落地**
  （backend/contract only）。`ExtrudeSecondDirection { endBound: blind|throughAll;
  distanceMm?; direction? }`；缺省方向=主方向相反侧；symmetric 互斥；blind 必填
  distanceMm；throughAll 不得用于 operation=new。求值：两段扫掠体先 Unite 再参与
  add/remove/intersect/new 规划。验证：`FeatureOperationSemantics` 正向 5 + 反向 3
  体积 1600、质心 z=1；`FeatureTypeRegistry` 接受/拒收矩阵；shared 152/152。
  真栈 shared 1.24 复核：`tutorial2` + `tutorial2-tools` 合并 8 passed（8.2 min），
  strict 体积/去材与 1.22 基线一致。
  **UI 仍无 live 证据，不新增第二方向对话框控件**；表单模型以 JSON 只读面暴露。
- 未实现（仍诚实拒收/待办）：upToNext/upToSurface/upToVertex、draft、face-extrude。
  拔模输入框已禁用并给出“尚未实现”提示，禁止接受输入后静默丢弃（FeatureDialog
  测试钉住 disabled）。
- **upTo* 的 UI 证据缺口**：已采集 features JSON 有 `UP_TO_*` 终止条件，但现有 UI
  截图/DOM 未覆盖对应对话框；在补采 live UI 证据前只做后端能力，不凭空发明控件。

## 实现记录（2026-11-06，Phase 3：revolve 多面域）

- **shared 1.30.0**：`RevolveParams` 增 `regions?: number[]`，与 `ExtrudeParams.regions`
  同锚（SketchDto.regions 面积降序下标）；`regionIndex` 降级为 deprecated 单面域简写，
  服务端 zod 与 `regions` 同给即拒收（无静默优先级）。旧单面域载荷逐字兼容（缺省 [0]）。
- **backend**：`FeatureTypeRegistry` revolve schema 增 regions + 互斥 superRefine；
  `resolveRevolveInputs` 归一选集（去重、逐域退化守卫）；`evaluateRevolveAsync` 逐域
  旋转（含孔域沿用域内 CSG）后一次 `Unite` 为单一工具实体，再参与特征内 new/add/remove。
  单面域零新增内核调用。
- **UI**：FeatureDialog 的 revolve 通道改用与 extrude 相同的 `selectedRegions` 多选集
  （视口点选增删 chips；编辑回显 `regions`/旧 `regionIndex`）；载荷发 `regions` 不再发
  `regionIndex`；提交门=选集非空且下标未越界 + 轴已选；预览按选集并集边界生成。
- **验证**：
  - backend `RevolveFlow` 新增两互斥矩形环柱：regions [0,1] 全周体积 2500π；
    `FeatureTypeRegistry` regions 接受/互斥/负数拒收；backend 相关 37/37。
  - 真栈 UI `e2e/revolve-multi-region.spec.ts` setup+test **2 passed**：
    视口点选 2 面域 + 轴 → 体积 **7853.981 mm³**（2500π=7853.982，0.00001%），push+重开。
  - 真实示例 `e2e/examples/hand-brake-scenario.spec.ts` setup+test **2 passed**：
    3 特征全链，revolve regions [0,1]（审计选择：上半轮廓两域；下半镜像域排除）
    + SWEPT_EDGE 1 mm 倒角，体积 **7125.270 mm³** vs 采集 7125.274。
    此前单 region 0 为 5358.127（−24.8%），多面域契约即根因修复。
- **诚实边界**：converter 对多 query 的 Onshape revolve 只能给面积降序前缀
  `[0..n-1]` 的 best-effort（`regionRisk`），示例/replay 必须审计具体面域；
  Hand Brake 的审计选择写在该 spec 的 `withAuditedRevolveRegions`，不冒充通用自动映射。

## 备选方案

- **前端换算终止条件**：会伪造几何，拒绝。
- **新增第二套 extrude RPC**：违反 P0-05/P0-07，拒绝。
- **只做 Blind**：无法覆盖 Pallet/Clamp，Batch 1 无法完成，拒绝。

## 后果

- 内核/后端需要真正实现终止条件与 draft，不只是 DTO 透传；工作量主要在几何求值。
- FeatureDialog 的“终止条件/方向/起始偏移/拔模”从本地 UI 状态变为真实参数；
  现有仅 UI 状态必须删除或接线，禁止双事实源。
- iOS 的 imprint-face 仍是已知边界；adapter 失败时登记 `blocked-capability`，
  不宣称完整复刻。

## 后续（ADR-0006）

以下能力不在本 ADR：hole、draft 特征、rib、feature/face pattern、非世界平面
mirror、cPlane、assignVariable、sheet metal、custom FeatureScript。它们需要各自的
几何/变量系统设计，按 Batch 1 缺口矩阵另行立项。
