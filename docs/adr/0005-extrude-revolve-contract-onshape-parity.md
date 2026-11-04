# ADR-0005：拉伸/旋转特征契约扩展（终止条件、布尔、方向与 draft）

- 状态：提议（2026-11-04）
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

- ADR-0004 与 ADR-0005 若同批发布：shared 一次性 bump 到 **1.22.0**；
  否则 ADR-0005 单独 bump 到 1.23.0。
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
