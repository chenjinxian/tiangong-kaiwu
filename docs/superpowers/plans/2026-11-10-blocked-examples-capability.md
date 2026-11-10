# 阻塞示例能力切片计划（2026-11-10）

**状态**：已登记，未实现。三个 0 mm³ 空占位已从 `Onshape 示例复刻` 项目删除；
私有索引保留其 `blocked-*` 分类与目标体积，不伪造 iModel。

## 事实

| 示例 | 索引分类 | Onshape 目标 | 现有 blocker |
|---|---|---:|---|
| `Onshape example: DRILL HOTD / CONNECTING_ROD` | `blocked-converter` | 3,290.286675 mm³ | `Fillet 1/2` = `FULL_ROUND` 且无边查询；imprintFace regionRisk；capFace/sweptFace 待验收 |
| `Onshape example: Intro to CAD 1.2 Part 5` | `blocked-selector` | 204,838.3 mm³ | 单线 imprintFace 需要实体面 split；当前草图 0 面域 |
| `Onshape example: Intro to CAD 1.2 Part 6` | `blocked-selector` | 188,451.236 mm³ | 同 Part 5；且没有已转换 scenario（element `118732d8402228166915c5e0`） |

私有 scenario：Part 5 `Onshape-Training-Repo-c6a3cd9aa3daa7819cae0c44-ce879b3b849ab72af885bb9f.scenario.json`；
CONNECTING_ROD `Onshape-Training-Repo-2778b69a09d8fcb9a54e08dc-6b82d01d81b1c9cf1073f6dc.scenario.json`。
Part 6 需要先补 converter/scenario，不能先建 iModel 再猜。

## 切片

### A. 单线 imprintFace 的实体面 split（解锁 Part 5/6）
- 先做 AIRR：复用 `SolidModelingCommand`/现有 BRep 操作，确认是否有可用的 face split/imprint 内核能力；
  如果没有，登记 `blocked-kernel`，不把“整面近似”冒充 Part 5/6。
- 契约：不新增 RPC，优先在现有 extrude/imprintFace 选择通路内表达；如需 `faceSplit` FeatureOp，另立 ADR + shared bump。
- 证据：Part 5 真栈逐 body 体积 204,838.3 mm³；Part 6 需先由 features 生成转换 scenario 并做 raw-vs-scenario 完整性校验。
- 测试：合成单线 split、Part 5 scenario、删除/重开/undo；失败封闭，不回落 region 0。

### B. FULL_ROUND fillet（解锁 CONNECTING_ROD）
- 先做 AIRR/内核 spike：ACIS Modeler 是否有 full-round blend；当前产品 fillet 只支持 EDGE。
- 若内核不支持，登记 `blocked-kernel`；不得省略 fillet 后以体积近似冒充。
- 需要同时解决 `Fillet 1/2` 的边查询（当前无边选择）和 imprint region-risk。
- 测试：合成 full-round 三面/凸边 + CONNECTING_ROD 真栈 3,290.286675 mm³（容差按 strict 口径）。

### C. Part 6 scenario 转换
- 以 features 重新转换 element `118732d8402228166915c5e0`，记录 raw/scenario 差异；
- 只有 A 完成且场景完整后，才允许建 Part 6 iModel。

## 当前处理

- 三个空 iModel 已于 2026-11-10 删除；审计：
  `.superpowers/sdd/2026-11-09-ps-blocker-next/onshape-blocked-placeholder-delete-audit.json`。
- `Onshape 示例复刻` 项目当前为 **22 个**可用/legacy 真实示例；公共 `/examples` 仍为 18 个
  （Tutorial 2 在独立项目）。
- 不创建近似 iModel、不把 0 mm³ 占位重新加回；能力切片完成前，索引继续如实标 blocked。
