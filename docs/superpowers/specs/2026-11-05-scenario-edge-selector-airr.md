# AIRR：场景语义边选择器与 fillet/chamfer 回放解析（优先级 1）

- 日期：2026-11-05
- Owner：用户（2026-11-05「按照建议优先级继续」）
- 关联需求：`2026-11-05-sketch-feature-capability-backlog.md` Slice 2/4；
  `2026-11-04-onshape-example-replication-airr.md` 的 fillet/chamfer 阻塞
- 影响仓：`onshape-parity-data`（converter v2 + scenario）；私有后端
  `luban-backend/modeling-server`（test-only ScenarioReplay）；shared/web 无契约变更
- 是否需要 ADR：**否**（test-only scenario 扩展；ADR-0003 场景契约的
  `features[].type` 已含 `fillet`，不新增产品 RPC/schema）

---

## 1. 目标与验收

- 用户问题：converter 把 fillet 一律标为“未支持特征”，chamfer 标为“边引用为生成拓扑”；
  这些边在 Onshape 查询里是 CAP_EDGE/SWEPT_EDGE 语义（草图实体 + 端盖），
  不是伪造的持久 id。产品 FeatureOp 已支持 fillet/chamfer，缺的是**语义解析到持久边 id**。
- 验收（首片）：
  1. converter 把 fillet（EDGE 类型）的每条查询解析为
     `{kind:'capEdge', sketchFeatureId, sketchEntityId, isStart, operationSourceIds}`
     的语义选择器，同时保留 raw query/deterministicIds；
  2. 无法解析为 CAP_EDGE 的查询诚实记录 missing，不伪造；
  3. 私有后端 ScenarioReplay 能把 `capEdge` 解析为当前 body 的持久边 id
     （`SolidModelingCommand.getBodySubEntities/getSubEntityGeometry` +
     `topologyIdFromSubEntity`），并提交 `insertFeature fillet`；
  4. 在 StandaloneDb 合成场景（圆柱端盖圆边 fillet）上 status=0、体积小于未倒圆体积；
  5. 至少尝试一个真实 scenario；若其仍含 full-round/无查询边，保持 blocked 并登记。
- 非目标：SWEPT_EDGE、face fillet、full-round、变量半径、partial fillet、
  多 body 跨布尔复杂选择；这些继续记录为 missing。

## 2. 关联项目能力清单

| 项目/仓 | 相关能力 | 现有 API/工具/实现 | 结论 |
|---|---|---|---|
| itwinjs-core/editor-backend | 拓扑枚举/几何/持久 id | `SolidModelingCommand.getBodySubEntities/getSubEntityGeometry/topologyIdFromSubEntity` | 复用 |
| luban-backend/modeling-server | 中间求值载体 | `carrierFor/writeCarrierGeometry` | 复用 |
| luban-backend/modeling-server | fillet 求值 | `FeatureService.applyOp insertFeature fillet` | 复用 |
| luban-cad/packages/shared | FilletParams | radius/propagateSmooth/edges | 复用，不改 |
| onshape-parity-data | converter v2 | `decodeCompressedQuery`/`sketchMaps` | 扩展 |
| 私有后端测试 | ScenarioReplay | sketch/extrude/revolve/hole | 扩展 |

**规则**：不新增产品 RPC、不改 shared、不修改生产求值路径；解析器只在测试回放器内。

## 3. 复用决策矩阵

| 需求能力 | 候选复用 | 覆盖度 | 决策 | 理由 |
|---|---|---|---|---|
| 边枚举/几何 | SolidModelingCommand | 完整 | 复用 | 与生产 resolveEdgeRef 同通道 |
| 持久边 id | topologyIdFromSubEntity | 完整 | 复用 | M6-d v1.9 边自身 id |
| 中间载体 | EvalCarrier | 完整 | 复用 | 已验证的 scratch 通道 |
| 草图/平面数据 | scenario sketch params | 完整 | 复用 | 世界曲线可由 local+plane 计算 |
| fillet 提交 | FeatureService.applyOp | 完整 | 复用 | 标准管道 |
| 查询解析 | decodeCompressedQuery + sourceId 匹配 | 部分 | 扩展 | 编码层不新增 parser 依赖 |

## 4. 跨仓影响

| 仓/层 | 契约 | schema/迁移 | native/接口 | 测试 | 发布 |
|---|---|---|---|---|---|
| parity-data | scenario fillet params 扩展 | 否 | 否 | converter 输出/重转 | 数据仓 |
| private backend | test-only ScenarioReplay | 否 | 否 | StandaloneDb fillet 回放 | 不发布产品 |
| shared/web | 无 | 无 | 无 | 回归 | 不需要 |

## 5. 数据/事务/安全

- 仍用 FeatureService 事务/租约；回放器不写生产库。
- 解析失败必须抛错/登记，不静默跳过几何变化。
- 语义选择器只作测试证据，不进入生产 API。

## 6. 测试证据

- converter：受影响 fillet 查询的 selector 解析计数；无法解析的保持 missing。
- backend：StandaloneDb 合成场景（圆草图 + extrude + capEdge fillet）status=0，
  体积小于圆柱体积；无匹配/多匹配时报错。
- 真实 scenario：至少一次 converter 重转 + 回放尝试，成功或明确登记剩余缺口。
- 回归：现有 ScenarioReplayCorpus 不回归；公开仓 web 单测不受影响。

## 7. 回滚

- 回滚：删除 converter fillet 转换与 ScenarioReplay fillet 分支；已生成的 scenario
  可重新由旧 converter 生成。产品代码零改动。

## 8. 评审结论

- 复用矩阵完成：是
- 跨仓影响明确：是
- P0 例外已登记：否
- ADR：不需要（test-only，契约类型已存在）
- Owner 签字：用户 2026-11-05「按照建议优先级继续」
- 结论：**批准执行**

## 9. 实施与验证记录（2026-11-05）

- Converter v2：
  - fillet（EDGE 类型）已进入 scenario `features[]`，输出
    `radiusMm/propagateSmooth/edges[{deterministicIds,queryString,selector}]`；
  - CAP_EDGE selector 通过“查询文本中匹配草图实体 sourceId（去点归一化）+ isStart +
    上游 op id”解析；无法解析/非 CAP_EDGE/无查询边时写 `provenance.missing`，不伪造；
  - chamfer 同样逐查询解析 selector，未解析才登记 missing。
- 私有后端 `ScenarioReplay`：
  - 新增 `enumerateScenarioEdges`（carrier → `SolidModelingCommand` →
    `getBodySubEntities/getSubEntityGeometry/topologyIdFromSubEntity`，与生产
    fillet/chamfer 求值同通道）；
  - `resolveCapEdgeSelector`：草图圆/直线 + 拉伸端盖帧（对称/反向/自定义平面）
    → 唯一持久边 id；零/多匹配即抛错；
  - fillet/chamfer 分支提交既有 FeatureOp（chamfer 支持 mode=2 等距/双距离、
    mode=3 距离-角度）。
- 合成 StandaloneDb 场景（r=5 圆 → 10 mm 拉伸 → 顶盖圆边）：
  - fillet 1 mm：`status=0`，体积 **778.956 mm³**（Pappus 近似 778.656，Δ0.04%）；
  - chamfer 1 mm：`status=0`，体积 **770.735 mm³**（近似 769.690，Δ0.14%）；
  - 测试 `src/feature/ScenarioFilletReplay.test.ts` 2/2 passed；既有
    `ScenarioReplayCorpus` 3/3 不回归；backend `tsc --noEmit`/eslint 绿。
- 真实语料限制：当前 140 个 scenario 中，含 CAP_EDGE fillet 的已转换 Part Studio
  均还有其它未支持特征（draft/rib/mirror/sheet metal/…），尚不能整链回放；
  本片先交付语义解析 + 回放机制，真实场景待其它能力补齐后直接受益。
