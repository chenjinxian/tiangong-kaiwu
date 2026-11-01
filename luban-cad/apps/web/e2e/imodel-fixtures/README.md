# e2e iModel 夹具

这两个 `.bim` 是 P2.8 残项的真栈夹具资产，**已提交、勿在测试中重新生成**。测试经
`seed.ts#resetFixtureImodel` 走 hub `fromBaseline` 上传 + webhook-agent 转 CloudSqlite，
再以真实编辑器打开。

| 文件 | 内容 | 使用用例 |
|---|---|---|
| `a-geometry.bim` | 无 B 标记的 BIS 文档：2 个 `PhysicalModel`，各含一个 `Generic:PhysicalObject` Box primitive，带默认 `SpatialViewDefinition` | `a-geometry.spec.ts`（A 只读编辑器加载全部模型/几何） |
| `b-half-graph.bim` | 导入 LubanCAD schema，仅含 `LubanFeaturePartition:half-graph-fixture` 的 DefinitionPartition + DefinitionModel（无 physical 分区），带默认物理视图 | `half-graph.spec.ts`（recovery → damaged → HITL 删除 → 默认 Part Studio） |

## 重新生成

生成器在私有仓 `luban-backend`：

```powershell
# modeling-server 目录；需本地原生库与已构建的 itwinjs-core 依赖
corepack pnpm@10 exec tsx scripts/generate-e2e-fixtures.ts
```

默认输出到本目录。生成器源码提交 `d1c5f7b`；基线的构造方式与 webhook-agent
空 baseline 一致（`SnapshotDb.createEmpty` → native 设 iTwinId/重置 briefcase id/NoLocking
→ `BriefcaseDb` 补默认视图），因此能通过 `POST /imodels {creationMode:'fromBaseline'}`。

## 约束

- 测试只读上传，不打开/修改工作树里的夹具文件。
- 夹具不参与生产构建（仅 `e2e/` 下由 Playwright 读取）。
- 修改夹具内容需要重新生成并跑 `a-geometry.spec.ts` / `half-graph.spec.ts` 全绿；
  不要手工编辑 `.bim`。
