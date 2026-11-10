# 阻塞示例能力切片计划（2026-11-10）

**状态**：切片 A/C 已完成（2026-11-11，Part 5/6 strict 真栈绿，ADR-0006 D2 +
shared 1.66/1.67）；切片 B（FULL_ROUND fillet / CONNECTING_ROD）仍未实现。
三个 0 mm³ 空占位已从 `Onshape 示例复刻` 项目删除；不伪造 iModel。

## 事实

| 示例 | 索引分类 | Onshape 目标 | 现有 blocker |
|---|---|---:|---|
| `Onshape example: DRILL HOTD / CONNECTING_ROD` | `blocked-converter` | 3,290.286675 mm³ | `Fillet 1/2` = `FULL_ROUND` 且无边查询；imprintFace regionRisk；capFace/sweptFace 待验收 |
| `Onshape example: Intro to CAD 1.2 Part 5` | `replicable-now`（working-tree） | 204,838.3 mm³ | 已解锁：D2 单线面 split + bodydetails 面积/bbox/质心证据 |
| `Onshape example: Intro to CAD 1.2 Part 6` | `replicable-now`（working-tree） | 188,451.236 mm³ | 已解锁：E3 void split + E5 源证据 no-op（shared 1.67 `noOpEvidence`） |

私有 scenario：Part 5 `Onshape-Training-Repo-c6a3cd9aa3daa7819cae0c44-ce879b3b849ab72af885bb9f.scenario.json`；
Part 6 `Intro-to-CAD---1.2---Viewing-Objects-in-Onshape-118732d8402228166915c5e0.scenario.json`；
CONNECTING_ROD `Onshape-Training-Repo-2778b69a09d8fcb9a54e08dc-6b82d01d81b1c9cf1073f6dc.scenario.json`。
Part 6 scenario 已转换并做 raw-vs-scenario 完整性校验；E5 no-op 有私有 bodydetails 证据。

## 切片

### A. 单线 imprintFace 的实体面 split（解锁 Part 5/6）— 已完成 2026-11-11
- 实现：`FaceExtrudeParams.splitByLine`（material/void + keepPoint）+ 后端
  RegionOps 裁切 + 回放 resolver；Part 5/6 strict 真栈绿、冷重开一致。
- 原计划：先做 AIRR：复用 `SolidModelingCommand`/现有 BRep 操作，确认是否有可用的 face split/imprint 内核能力；
  如果没有，登记 `blocked-kernel`，不把“整面近似”冒充 Part 5/6。
- 契约：不新增 RPC，优先在现有 extrude/imprintFace 选择通路内表达；如需 `faceSplit` FeatureOp，另立 ADR + shared bump。
- 证据：Part 5 真栈逐 body 体积 204,838.3 mm³；Part 6 需先由 features 生成转换 scenario 并做 raw-vs-scenario 完整性校验。
- 测试：合成单线 split、Part 5 scenario、删除/重开/undo；失败封闭，不回落 region 0。

### B. FULL_ROUND fillet（解锁 CONNECTING_ROD）
- 先做 AIRR/内核 spike：ACIS Modeler 是否有 full-round blend；当前产品 fillet 只支持 EDGE。
- 若内核不支持，登记 `blocked-kernel`；不得省略 fillet 后以体积近似冒充。
- 需要同时解决 `Fillet 1/2` 的边查询（当前无边选择）和 imprint region-risk。
- 测试：合成 full-round 三面/凸边 + CONNECTING_ROD 真栈 3,290.286675 mm³（容差按 strict 口径）。

### C. Part 6 scenario 转换 — 已完成 2026-11-11
- 已从 features 重新转换 element `118732d8402228166915c5e0`，记录 raw/scenario
  差异；E5 零几何变化 remove 经 bodydetails rb8/final 全同验证，由 shared 1.67
  `noOpEvidence` 显式承载。
- Part 6 iModel 已建（真实示例），strict 真栈绿，公共 `/examples` 第 21 卡。

## 当前处理

- 三个空 iModel 已于 2026-11-10 删除；审计：
  `.superpowers/sdd/2026-11-09-ps-blocker-next/onshape-blocked-placeholder-delete-audit.json`。
- `Onshape 示例复刻` 项目当前为 **22 个**可用/legacy 真实示例；公共 `/examples`
  当前 **21 卡**（2026-11-11，Part 5/6 已入目录；Tutorial 2 在独立项目）。
- 不创建近似 iModel、不把 0 mm³ 占位重新加回；能力切片完成前，索引继续如实标 blocked。
