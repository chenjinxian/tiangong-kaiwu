# B 数据模型 P1 Spike 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用可回滚的 spike 验证 ADR-0001 的四项 Go/No-Go：同一 iModel 内多个 Part Studio 的特征/撤销隔离、旧 Part Studio iModel 到目标 Model 的迁移、5–10 个 Part Studio 的性能、Named Version + 文档级共享。spike 产出结论，不直接做生产切换。

**Architecture:** 采用“Model 分区 + 可选 RPC scope 参数”：每个 Part Studio 一对 DefinitionModel/PhysicalModel，`FeatureService` 实例按 `dbKey + partStudioId` 分键；旧调用不传 scope 时保持 legacy 单工作室。迁移以**参数重放 + `FeatureEngine.rebuildAll`** 为主（direct-edit body 单独复制几何；transformer 只做时间盒探针）。撤销粒度是首要决策门槛：先实测原生 Undo 的跨工作室行为，再决定是否投入自定义历史。

**Tech Stack:** TypeScript、`@itwin/core-backend`（StandaloneDb/EditTxn/ECSQL）、Vitest、pnpm（modeling-server）、NestJS/TypeORM（hub，仅 Named Version/共享验证）、Playwright（公共仓真实栈）。

**Spec:** `docs/adr/0001-itwin-imodel-data-model.md`

## Global Constraints

- 私有仓 `D:/Github/luban-backend/modeling-server` 是独立 pnpm 项目；安装用 `CI=true corepack pnpm@10 install --no-frozen-lockfile`，禁止用 `pnpm add` 直接重解析 `link:` 依赖。
- 测试命令：`corepack pnpm@10 exec vitest run <file>`；全量 `corepack pnpm@10 exec vitest run`；构建 `corepack pnpm@10 build`。
- 已知 lint 基线有 246 errors/22 warnings（`HISTORY.md`），**P1 不以 lint 全绿为门禁**；新增文件必须无新增 lint error。
- 不修改 `itwinjs-core/`；不引入第二套建模 API；所有特征写仍走 `FeatureService.applyOp` → `EditTxn` → save。
- spike 代码必须可回滚：新 scope 参数缺省 = legacy 行为；不得改变现有单工作室测试的语义。
- 撤销是 go/no-go：不得用“看起来隔离”的假断言；必须实测原生 Undo/Redo 或明确记录不隔离。
- 迁移只允许在临时/测试 iModel 上执行；不得触碰现有演示/生产数据。
- 结论必须落文档（ADR 决策记录 + 私有仓 spike 记录），不得只留在代码/聊天里。

---

## 文件结构（spike 会创建/修改）

```
D:/Github/luban-backend/modeling-server/src/feature/
├── LubanCadSchema.ts                 # 参数化 per-Studio 模型 + 查询 model 过滤
├── FeatureService.ts                 # per-Studio service key / ctx / 读面 / 写面
├── FeatureEngine.ts                  # 按 Studio 过滤 warm/rebuild
├── OpLog.ts                          # payload 加 partStudioId；查询过滤
├── FeatureRpcImpl.ts                 # RPC 可选 partStudioId
├── PartStudioScope.ts                # 新增：scope 解析/模型标签/上下文 helper
├── MultiPartStudioScope.test.ts      # 新增：隔离测试
├── PartStudioUndo.test.ts            # 新增：撤销 go/no-go
├── PartStudioMigration.test.ts       # 新增：迁移探针
├── PartStudioPerf.test.ts            # 新增：性能
└── test/TestHost.ts                  # 复用

D:/Github/tiangong-kaiwu/luban-cad/packages/shared/src/rpc/
└── LubanFeatureRpcInterface.ts       # 可选 partStudioId + 接口版本

D:/Github/imodelhub-services/         # 仅 Named Version/共享验证（已有端点）
```

---

### Task 1: Part Studio 模型分区 + 服务分键

**Files:**
- Create: `D:/Github/luban-backend/modeling-server/src/feature/PartStudioScope.ts`
- Modify: `D:/Github/luban-backend/modeling-server/src/feature/LubanCadSchema.ts:172-197,587-598`
- Modify: `D:/Github/luban-backend/modeling-server/src/feature/FeatureService.ts:339-369,371-381,404-475`
- Create: `D:/Github/luban-backend/modeling-server/src/feature/MultiPartStudioScope.test.ts`

**Interfaces:**
- Produces: `interface PartStudioScope { id: string }`（`id` 为稳定 Part Studio 标识；spike 用 `ps-1`/`ps-2`）
- Produces: `createFeatureModels(txn: EditTxn, scope?: PartStudioScope): Promise<FeatureGraphContext>`
- Produces: `featureModelLabels(scope?: PartStudioScope): { def: string; phys: string }`
- Produces: `getFeatureService(dbKey: string, db: IModelDb, opts?: FeatureServiceOpts & { scope?: PartStudioScope }): FeatureService`

- [ ] **Step 1: 写失败测试**

`MultiPartStudioScope.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { StandaloneDb } from "@itwin/core-backend";
import { ensureHostStarted, makeTempDir } from "./test/TestHost.js";
import { clearServiceCacheForTest, FeatureService } from "./FeatureService.js";
import { queryModelIdByUserLabel } from "./LubanCadSchema.js";
import { featureModelLabels } from "./PartStudioScope.js";

describe("Part Studio 模型分区", () => {
  let dir: string; let db: StandaloneDb;
  beforeAll(async () => {
    await ensureHostStarted();
    dir = makeTempDir("ps-scope-");
    db = StandaloneDb.createEmpty(path.join(dir, "t.bim"), {
      rootSubject: { name: "T" }, enableTransactions: true,
    });
    clearServiceCacheForTest();
  }, 180_000);
  afterAll(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });

  it("两个 scope 生成两对 def/phys model，标签可区分", async () => {
    const a = FeatureService.for("scope-db", db, { scope: { id: "ps-1" } });
    const b = FeatureService.for("scope-db", db, { scope: { id: "ps-2" } });
    await a.ensureInitialized();
    await b.ensureInitialized();

    const labelsA = featureModelLabels({ id: "ps-1" });
    const labelsB = featureModelLabels({ id: "ps-2" });
    expect(queryModelIdByUserLabel(db, labelsA.def)).toBeDefined();
    expect(queryModelIdByUserLabel(db, labelsB.def)).toBeDefined();
    expect(labelsA.def).not.toBe(labelsB.def);
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd D:/Github/luban-backend/modeling-server
CI=true corepack pnpm@10 exec vitest run src/feature/MultiPartStudioScope.test.ts
```

Expected: FAIL，`featureModelLabels` 不存在 / `FeatureService.for` 不接受第三参。

- [ ] **Step 3: 实现 scope helper**

`PartStudioScope.ts`：

```ts
export interface PartStudioScope {
  /** 稳定的 Part Studio 标识（spike 用 ps-1/ps-2；生产用 PartStudio 元素 id）。 */
  id: string;
}

export function featureModelLabels(scope?: PartStudioScope): { def: string; phys: string } {
  return scope
    ? { def: `LubanFeaturePartition:${scope.id}`, phys: `LubanPhysicalPartition:${scope.id}` }
    : { def: "LubanFeaturePartition", phys: "LubanPhysicalPartition" };
}
```

- [ ] **Step 4: 参数化 schema 建模**

`LubanCadSchema.ts` 的 `createFeatureModels` 改为：

```ts
export async function createFeatureModels(
  txn: EditTxn,
  scope?: PartStudioScope,
): Promise<FeatureGraphContext> {
  const db = txn.iModel;
  const labels = featureModelLabels(scope);
  const parent = new SubjectOwnsPartitionElements(IModel.rootSubjectId);

  const defPartition = db.elements.createElement({
    classFullName: DefinitionPartition.classFullName,
    model: IModel.repositoryModelId,
    parent,
  });
  defPartition.userLabel = labels.def;
  const defPartitionId = txn.insertElement(defPartition.toJSON());
  const defModelId = txn.insertModel(db.models.createModel({
    classFullName: DefinitionModel.classFullName,
    modeledElement: new RelatedElement({ id: defPartitionId }),
  }));

  const physPartition = db.elements.createElement({
    classFullName: PhysicalPartition.classFullName,
    model: IModel.repositoryModelId,
    parent,
  });
  physPartition.userLabel = labels.phys;
  const physPartitionId = txn.insertElement(physPartition.toJSON());
  const physModelId = txn.insertModel(db.models.createModel({
    classFullName: PhysicalModel.classFullName,
    modeledElement: new RelatedElement({ id: physPartitionId }),
  }));

  const category = SpatialCategory.create(db, IModel.dictionaryId, LubanBodySolid.classFullName);
  const categoryId = txn.insertElement(category.toJSON());
  return { defModelId, physModelId, categoryId };
}
```

`queryModelIdByUserLabel` 保持 `WHERE UserLabel = ? LIMIT 1`（标签已唯一）。

- [ ] **Step 5: 服务分键**

`FeatureService.ts`：
- `FeatureService` 增加 `public readonly scope?: PartStudioScope;` 构造参数。
- 单例缓存 key 改为 `${dbKey}::${opts?.scope?.id ?? "legacy"}`；`getFeatureService(dbKey, db, opts?)` 透传。
- `ensureInitialized` / `doEnsureInitialized` 用 `this.scope` 调用 `createFeatureModels(txn, this.scope)`，`requireModelId` 用 `featureModelLabels(this.scope).def/phys`。
- `requireCtx` 不变（每个实例一个 ctx）；`warmAttemptedKeys` 用 scope key。
- `FeatureService.for(dbKey, db, opts?: FeatureServiceOpts & { scope?: PartStudioScope })`；保留旧调用兼容（现有测试大量 `FeatureService.for("x", db)`，缺省 legacy）。构造函数保存 `this.scope = opts?.scope`。

- [ ] **Step 6: 跑测试确认通过**

```bash
cd D:/Github/luban-backend/modeling-server
CI=true corepack pnpm@10 exec vitest run src/feature/MultiPartStudioScope.test.ts
CI=true corepack pnpm@10 exec vitest run src/feature/FeatureService.test.ts
```

Expected: 新测试 PASS；既有单工作室测试不回归。

- [ ] **Step 7: 提交**

```bash
cd D:/Github/luban-backend
git add modeling-server/src/feature/{PartStudioScope.ts,LubanCadSchema.ts,FeatureService.ts,MultiPartStudioScope.test.ts}
git commit -m "spike(feature): Part Studio 模型分区与服务分键"
```

---

### Task 2: 读面按 Part Studio 过滤

**Files:**
- Modify: `D:/Github/luban-backend/modeling-server/src/feature/LubanCadSchema.ts:279-294,296-304,455-510`
- Modify: `D:/Github/luban-backend/modeling-server/src/feature/FeatureService.ts:477-525,849-927`
- Modify: `D:/Github/luban-backend/modeling-server/src/feature/MultiPartStudioScope.test.ts`

**Interfaces:**
- Produces: `queryAllFeatures(db: IModelDb, defModelId?: Id64String): FeatureRow[]`
- Produces: `queryBodySolid(db: IModelDb, physModelId?: Id64String): Id64String | undefined`
- Produces: `querySketch(db: IModelDb, sketchId: Id64String, physModelId?: Id64String): SketchDto | undefined`
- Produces: `listSketchRows(db: IModelDb, physModelId?: Id64String): SketchRow[]`

- [ ] **Step 1: 写失败测试**

在 `MultiPartStudioScope.test.ts` 增加：

```ts
const square = (s: number) => [
  { x: 0, y: 0 }, { x: s, y: 0 }, { x: s, y: s }, { x: 0, y: s },
];
const params = (s: number, d: number): ExtrudeParams => ({ profile: square(s), distance: d });

it("A/B 各自的特征、草图、body 互不可见", async () => {
  const a = FeatureService.for("scope-db", db, { scope: { id: "ps-1" } });
  const b = FeatureService.for("scope-db", db, { scope: { id: "ps-2" } });
  await a.ensureInitialized();
  await b.ensureInitialized();
  writeLeases.acquire("scope-db", "sess-a", "alice");
  const put = await a.applyOp("sess-a", { kind: "insertFeature", featureType: "extrude", params: params(2, 1) });
  expect(put.ok).toBe(true);

  expect(a.getTree()).toHaveLength(1);
  expect(b.getTree()).toHaveLength(0);
  expect(a.getBodies().length).toBeGreaterThan(0);
  expect(b.getBodies().length).toBe(1); // 各自 init body，不是 A 的
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd D:/Github/luban-backend/modeling-server
CI=true corepack pnpm@10 exec vitest run src/feature/MultiPartStudioScope.test.ts
```

Expected: FAIL，B 看到 A 的特征（`getTree` 全库）。

- [ ] **Step 3: 查询加 model 过滤**

`LubanCadSchema.ts`：

```ts
export function queryAllFeatures(db: IModelDb, defModelId?: Id64String): FeatureRow[] {
  const out: FeatureRow[] = [];
  const sql = defModelId === undefined
    ? `SELECT ECInstanceId, featureType, orderKey, suppressed, status, params FROM LubanCAD.Feature ORDER BY orderKey`
    : `SELECT ECInstanceId, featureType, orderKey, suppressed, status, params FROM LubanCAD.Feature WHERE Model.Id = ? ORDER BY orderKey`;
  db.withPreparedStatement(sql, (stmt) => {
    if (defModelId !== undefined) stmt.bindId(1, defModelId);
    while (stmt.step() === DbResult.BE_SQLITE_ROW) out.push(readFeatureRow(stmt));
  });
  return out;
}

export function queryBodySolid(db: IModelDb, physModelId?: Id64String): Id64String | undefined {
  let id: Id64String | undefined;
  const sql = physModelId === undefined
    ? `SELECT ECInstanceId FROM LubanCAD.BodySolid LIMIT 1`
    : `SELECT ECInstanceId FROM LubanCAD.BodySolid WHERE Model.Id = ? LIMIT 1`;
  db.withPreparedStatement(sql, (stmt) => {
    if (physModelId !== undefined) stmt.bindId(1, physModelId);
    if (stmt.step() === DbResult.BE_SQLITE_ROW) id = stmt.getValue(0).getId();
  });
  return id;
}
```

`querySketch` / `listSketchRows` / `insertSketchElement` 同样加可选 `physModelId`；`insertSketchElement` 改为显式接收 `physModelId`（不再全局按 UserLabel 查）。

- [ ] **Step 4: 读面用 ctx**

`FeatureService.getTree/getBodies/getSketch/listSketches` 全部改用：
- `queryAllFeatures(this._db, this.requireCtx().defModelId)`
- `queryBodies(this._db, this.requireCtx().physModelId)`
- `querySketch(..., this.requireCtx().physModelId)` / `listSketchRows(this._db, this.requireCtx().physModelId)`

- [ ] **Step 5: 跑测试确认通过**

```bash
cd D:/Github/luban-backend/modeling-server
CI=true corepack pnpm@10 exec vitest run src/feature/MultiPartStudioScope.test.ts \
  src/feature/FeatureService.test.ts \
  src/feature/MultiBodyFoundation.test.ts
```

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
cd D:/Github/luban-backend
git add modeling-server/src/feature
git commit -m "spike(feature): 读面按 Part Studio 过滤"
```

---

### Task 3: 写面按 Part Studio 过滤

**Files:**
- Modify: `D:/Github/luban-backend/modeling-server/src/feature/FeatureService.ts:501-504,1364-1365,1419-1420,1875-1897,1952-1958`
- Modify: `D:/Github/luban-backend/modeling-server/src/feature/OpLog.ts:10-31,54-107`
- Modify: `D:/Github/luban-backend/modeling-server/src/feature/MultiPartStudioScope.test.ts`

**Interfaces:**
- Produces: `OpPayload.partStudioId?: string`
- Produces: `queryOpLog(db: IModelDb, partStudioId?: string): OpLogRow[]`

- [ ] **Step 1: 写失败测试**

```ts
it("A/B 的 orderKey 与 undo 栈互不串", async () => {
  const a = FeatureService.for("scope-db", db, { scope: { id: "ps-1" } });
  const b = FeatureService.for("scope-db", db, { scope: { id: "ps-2" } });
  await a.ensureInitialized();
  await b.ensureInitialized();
  await a.applyOp("sess-a", { kind: "insertFeature", featureType: "extrude", params: params(2, 1) });
  await b.applyOp("sess-a", { kind: "insertFeature", featureType: "extrude", params: params(3, 1) });

  expect(a.getTree()).toHaveLength(1);
  expect(b.getTree()).toHaveLength(1);
  // 两个 Studio 各自从 orderKey=1 开始
  expect(a.getTree()[0].orderKey).toBe(1);
  expect(b.getTree()[0].orderKey).toBe(1);
});
```

- [ ] **Step 2: 跑测试确认失败**

Expected: FAIL，B 的 orderKey 为 2（`queryAllFeatures` 全库取最大）。

- [ ] **Step 3: 写面收口**

- `nextOrder` 改为 `queryAllFeatures(this._db, ctx.defModelId).at(-1)?.orderKey + 1 ?? 1`。
- `activeAuthoredBodies` 改为 `queryBodies(this._db, ctx.physModelId)` 计数（per-studio）。
- `applyReorder` 只取 `queryAllFeatures(this._db, ctx.defModelId)`。
- 所有 `insertOpLogEntry` 调用在 payload 加 `partStudioId: this.scope?.id`（legacy 不传）。
- `queryOpLog(db, partStudioId?)`：先全量取，再按 `payload.partStudioId` 过滤；legacy 不传返回全量。
- `undoInternal/redoInternal` 用 `queryOpLog(this._db, this.scope?.id)`。

- [ ] **Step 4: 跑测试确认通过**

```bash
cd D:/Github/luban-backend/modeling-server
CI=true corepack pnpm@10 exec vitest run src/feature/MultiPartStudioScope.test.ts \
  src/feature/FeatureService.test.ts \
  src/feature/FeatureUndo.test.ts
```

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd D:/Github/luban-backend
git add modeling-server/src/feature
git commit -m "spike(feature): 写面/oplog 按 Part Studio 过滤"
```

---

### Task 4: RPC 可选 scope 参数

**Files:**
- Modify: `D:/Github/tiangong-kaiwu/luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts:320-439`
- Modify: `D:/Github/luban-backend/modeling-server/src/feature/FeatureRpcImpl.ts:20-100`
- Modify: `D:/Github/luban-backend/modeling-server/src/feature/MultiPartStudioScope.test.ts`
- Modify: `D:/Github/tiangong-kaiwu/luban-cad/apps/web/src/modules/part-studio/hooks/useFeatureSystem.ts:173,186,290`
- Modify: `D:/Github/tiangong-kaiwu/luban-cad/apps/web/src/modules/part-studio/hooks/useSketchSystem.ts:102`

**Interfaces:**
- Produces: `getFeatureTree(connectionKey: string, partStudioId?: string)`
- Produces: `applyFeatureOp(connectionKey: string, op: FeatureOp, sessionId: string, partStudioId?: string)`
- Produces: `previewFeatureOp(connectionKey: string, op: FeatureOp, sessionId: string, partStudioId?: string)`
- Produces: `getBodies(connectionKey: string, partStudioId?: string)` / `getSketch` / `listSketches` 同理
- Produces: `LubanFeatureRpcInterface.interfaceVersion = "1.17.0"`（可选参数，旧调用兼容）

- [ ] **Step 1: 写失败测试**

在 shared 的 RPC 测试中加：

```ts
import { expectTypeOf } from "vitest";
import type { LubanFeatureRpcInterface } from "./LubanFeatureRpcInterface.js";

it("scope 参数可选：旧调用与新调用签名都合法", () => {
  expectTypeOf<LubanFeatureRpcInterface["getFeatureTree"]>().toBeCallableWith("conn-1");
  expectTypeOf<LubanFeatureRpcInterface["getFeatureTree"]>().toBeCallableWith("conn-1", "ps-1");
  expectTypeOf<LubanFeatureRpcInterface["applyFeatureOp"]>().toBeCallableWith(
    "conn-1",
    { kind: "undo" },
    "sess-1",
  );
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd D:/Github/tiangong-kaiwu/luban-cad/packages/shared
npx vitest run src/rpc/LubanFeatureRpcInterface.test.ts
```

Expected: FAIL（参数不存在）。

- [ ] **Step 3: 加可选参数**

shared 接口每个读/写方法末尾加 `partStudioId?: string`；`interfaceVersion` 改为 `"1.17.0"`。
`FeatureRpcImpl` 透传给 `getFeatureService(key, db, { scope: partStudioId ? { id: partStudioId } : undefined })` / `applyOp(..., scope)`。

- [ ] **Step 4: 前端调用透传**

`useFeatureSystem` / `useSketchSystem` 从 `useWorkspaceRef().modelId` 取 scope（P0 已接线），传给 RPC；`modelId` 为空时省略参数（legacy）。

- [ ] **Step 5: 跑 shared 与 MS 测试**

```bash
cd D:/Github/tiangong-kaiwu/luban-cad/packages/shared
npx tsc
npx vitest run
cd D:/Github/luban-backend/modeling-server
CI=true corepack pnpm@10 build
CI=true corepack pnpm@10 exec vitest run src/feature/MultiPartStudioScope.test.ts
```

Expected: PASS；旧调用不回归。

- [ ] **Step 6: 提交（跨仓成组）**

```bash
cd D:/Github/tiangong-kaiwu
git add luban-cad/packages/shared luban-cad/apps/web/src/modules/part-studio/hooks
git commit -m "feat(shared): Feature RPC 可选 Part Studio scope"
cd D:/Github/luban-backend
git add modeling-server/src/feature/FeatureRpcImpl.ts
git commit -m "feat(feature): RPC 透传 Part Studio scope"
```

---

### Task 5: 撤销 go/no-go 实测

**Files:**
- Create: `D:/Github/luban-backend/modeling-server/src/feature/PartStudioUndo.test.ts`
- Create: `D:/Github/luban-backend/docs/feature-multi-partstudio-spike.md`（新建私有仓文档）

**Interfaces:**
- Produces: 实测结论：原生 Undo 跨 Part Studio 是全局还是按最近事务；后端 op-log undo 是否可扩展。
- 决策选项：A 保持原生全局 undo（P1 验收改为“无数据串扰”）；B 自建 per-Studio 历史（扩展 insert/delete/suppress/reorder 逆操作）；C 混合。

- [ ] **Step 1: 写原生 undo 探针测试**

```ts
it("原生 Undo 跨 Part Studio：记录实际行为", async () => {
  const a = FeatureService.for("undo-db", db, { scope: { id: "ps-1" } });
  const b = FeatureService.for("undo-db", db, { scope: { id: "ps-2" } });
  await a.ensureInitialized();
  await b.ensureInitialized();
  writeLeases.acquire("undo-db", "sess", "alice");
  await a.applyOp("sess", { kind: "insertFeature", featureType: "extrude", params: params(2, 1) });
  await b.applyOp("sess", { kind: "insertFeature", featureType: "extrude", params: params(3, 1) });

  // 原生 Undo 通过 IModelApp.tools.run 由前端驱动；在 MS 单测里用 IModelDb.txns.reverseSingleTxn()
  // 近似“撤销最近一次事务”。本测试记录实际行为：撤销的是 B（最后写入），A 不受影响。
  // 若实际不是该行为，把结果写入 spike 文档并据实更新断言——不得为了绿而改断言。
  const undone = db.txns.reverseSingleTxn();
  expect(undone).toBe(IModelStatus.Success);
  expect(a.getTree()).toHaveLength(1);
  expect(b.getTree()).toHaveLength(0);
});
```

> `reverseSingleTxn()` 同步返回 `IModelStatus`（`@itwin/core-bentley`），不是 Promise/boolean；测试文件顶部需 `import { IModelStatus } from "@itwin/core-bentley";`。

- [ ] **Step 2: 跑测试并记录实际结果**

```bash
cd D:/Github/luban-backend/modeling-server
CI=true corepack pnpm@10 exec vitest run src/feature/PartStudioUndo.test.ts
```

把实际行为（全局/最近事务/是否可重做）写入 `docs/feature-multi-partstudio-spike.md`。

- [ ] **Step 3: 决策**

在 spike 文档中三选一：
- **A（低成本）**：接受文档级 undo；P1 验收只要求“跨 Studio 无数据串扰/无坏链”，不承诺页签级 undo。
- **B（高成本）**：扩展 `OpPayload` 快照 + 逆操作（insert/delete/suppress/reorder），前端 `useUndoRedo` 改走自定义历史；需单独计划。
- **C（混合）**：普通编辑走原生，特征 op 走自定义；复杂度最高。

**默认建议 A**：先满足 B 的核心数据模型/多页签；页签级 undo 作为独立产品需求排期。

- [ ] **Step 4: 提交**

```bash
cd D:/Github/luban-backend
git add modeling-server/src/feature/PartStudioUndo.test.ts docs/feature-multi-partstudio-spike.md
git commit -m "spike(feature): 撤销跨 Part Studio 行为实测与决策"
```

---

### Task 6: 迁移探针（参数重放 + `rebuildAll` 为主）

**Files:**
- Create: `D:/Github/luban-backend/modeling-server/src/feature/PartStudioMigration.ts`
- Create: `D:/Github/luban-backend/modeling-server/src/feature/PartStudioMigration.test.ts`
- Modify: `D:/Github/luban-backend/docs/feature-multi-partstudio-spike.md`

**Interfaces:**
- Produces: `replayPartStudio(opts: ReplayPartStudioOptions): Promise<ReplayResult>`
- Produces: `interface ReplayResult { featureMap: Map<Id64String, Id64String>; sketchMap: Map<Id64String, Id64String>; bodyMap: Map<Id64String, Id64String> }`
- Produces: `validatePartStudioReplay(source: IModelDb, target: IModelDb, result: ReplayResult): ReplayValidation`

**背景（2026-10-30 取证）：**

- MS **没有** `IModelTransformer`/`IModelExporter`/`IModelImporter` 依赖；`@itwin/imodel-transformer@0.4.3` 的 peer 只到 core 4，本仓是 5.15.0-dev.2，且有运行时 semver 硬校验（除非 `TRANSFORMER_NO_STRICT_DEP_CHECK=1`）。transformer 只能做时间盒探针，不能作为生产迁移基础。
- 一个逻辑 Part Studio = **DefinitionModel（LubanFeature + OpLog）+ PhysicalModel（LubanBodySolid + LubanSketch）**，不是单个 BIS Model；OpLog 在 dictionary model。
- 冷启动全量重建本来就是生产路径（`FeatureService.ensureWarm → FeatureEngine.rebuildAll`），fillet/chamfer 的持久拓扑引用跨重建有确定性测试。因此 **参数重放 + `rebuildAll`** 是最可行、依赖最少的主路径。
- 必须重写的 ID 引用：`Feature.params` 的 `sketchId/sketchIds/bodyKey`；`jsonProperties` 的 `luban.body.consumedBy/authored/state/name`；`OpLog.payload` 的 `featureId/sketchId`；`FeatureDrives` 的两端。fillet/chamfer 的拓扑 `nodeId/entityId` **不是** element id，不要按 element id 重映射。
- 迁移必须在**未绑定 EDE 回调**的进程/上下文执行；否则 `saveChanges` 会提前求值并覆盖刚复制的几何。
- direct-edit body（`jsonProperties.luban.overridden`）会被 `bodyRegenPaused` 跳过重建，必须单独复制几何；失败特征（`status=1`）重新求值后状态可能变化，需抽样记录。

- [ ] **Step 1: 写失败测试（源 extrude + fillet 链）**

```ts
it("参数重放：源 extrude+fillet 链迁移到目标 Studio，重建后特征/体/边/体积可验证", async () => {
  // source: StandaloneDb + FeatureService.for("src", srcDb, { scope: { id: "ps-1" } })
  // 1) source 建 extrude(2,1) → fillet（复用 FilletFlow.test.ts 的建链 helper）
  // 2) 目标：import schema + 只建模型对（不建 init body）
  const replay = await replayPartStudio({
    source: srcDb, target: dstDb,
    sourceDefModelId: srcCtx.defModelId, sourcePhysModelId: srcCtx.physModelId,
    targetDefModelId: dstCtx.defModelId, targetPhysModelId: dstCtx.physModelId,
    targetCategoryId: dstCtx.categoryId,
  });
  // 3) 目标 ensureInitialized + getTree/getBodies
  const dstSvc = FeatureService.for("dst", dstDb, { scope: { id: "ps-1" } });
  await dstSvc.ensureInitialized();
  expect(dstSvc.getTree().length).toBe(srcSvc.getTree().length);
  expect(dstSvc.getBodies().length).toBe(srcSvc.getBodies().length);
  // 4) 体积/bbox 抽样
  validatePartStudioReplay(srcDb, dstDb, replay);
  // 5) 再次 replay 幂等（不重复特征/体）
  await replayPartStudio({ ...sameOptions });
  expect(dstSvc.getTree().length).toBe(srcSvc.getTree().length);
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd D:/Github/luban-backend/modeling-server
CI=true corepack pnpm@10 exec vitest run src/feature/PartStudioMigration.test.ts
```

Expected: FAIL，`replayPartStudio` 不存在。

- [ ] **Step 3: 实现参数重放**

`PartStudioMigration.ts` 核心（两遍：先插元素，再回写引用，最后重建）：

```ts
import { DbResult, type Id64String } from "@itwin/core-bentley";
import { EditTxn, type IModelDb } from "@itwin/core-backend";
import { Code } from "@itwin/core-common";
import {
  LubanFeature, LubanFeatureDrives,
  FeatureProps, insertFeatureDrive,
  listSketchRows, queryAllFeatureDrives, queryAllFeatures, queryBodies,
} from "./LubanCadSchema.js";
import { FeatureEngine } from "./FeatureEngine.js";

export interface ReplayPartStudioOptions {
  source: IModelDb;
  target: IModelDb;
  sourceDefModelId: Id64String;
  sourcePhysModelId: Id64String;
  targetDefModelId: Id64String;
  targetPhysModelId: Id64String;
  targetCategoryId: Id64String;
}

export interface ReplayResult {
  featureMap: Map<Id64String, Id64String>;
  sketchMap: Map<Id64String, Id64String>;
  bodyMap: Map<Id64String, Id64String>;
}

function runTxn<T>(db: IModelDb, description: string, fn: (txn: EditTxn) => T): T {
  const txn = new EditTxn(db, description);
  txn.start();
  try {
    const result = fn(txn);
    txn.end("save", description);
    return result;
  } catch (error) {
    txn.abandon();
    throw error;
  }
}

function deepRewrite(value: unknown, map: Map<Id64String, Id64String>): unknown {
  if (typeof value === "string") return map.get(value) ?? value;
  if (Array.isArray(value)) return value.map((v) => deepRewrite(v, map));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, deepRewrite(v, map)]),
    );
  }
  return value;
}

export async function replayPartStudio(opts: ReplayPartStudioOptions): Promise<ReplayResult> {
  const result: ReplayResult = { featureMap: new Map(), sketchMap: new Map(), bodyMap: new Map() };

  // ---- 第一遍：复制 Sketch / Feature / Body 元素（原 params，不复制 body 几何） ----
  runTxn(opts.target, "migrate part studio elements", (txn) => {
    for (const row of listSketchRows(opts.source, opts.sourcePhysModelId)) {
      const props = opts.source.elements.getElementProps(row.id);
      const { id: _id, ...rest } = props;
      const targetId = txn.insertElement({
        ...rest,
        model: opts.targetPhysModelId,
        category: opts.targetCategoryId,
        federationGuid: props.federationGuid ?? undefined,
        code: Code.createEmpty(),
      });
      result.sketchMap.set(row.id, targetId);
    }

    for (const row of queryAllFeatures(opts.source, opts.sourceDefModelId)) {
      const props = opts.source.elements.getElementProps(row.id) as FeatureProps;
      const { id: _id, ...rest } = props;
      const targetId = txn.insertElement({
        ...rest,
        model: opts.targetDefModelId,
        federationGuid: props.federationGuid ?? undefined,
        code: Code.createEmpty(),
        jsonProperties: { ...(props.jsonProperties ?? {}), migrationSource: opts.source.key },
      });
      result.featureMap.set(row.id, targetId);
    }

    for (const body of queryBodies(opts.source, opts.sourcePhysModelId)) {
      const props = opts.source.elements.getElementProps(body.id);
      const { id: _id, ...rest } = props;
      const overridden = Boolean(
        (body.jsonProperties as { luban?: { overridden?: boolean } } | undefined)?.luban?.overridden,
      );
      const targetId = txn.insertElement({
        ...rest,
        model: opts.targetPhysModelId,
        category: opts.targetCategoryId,
        federationGuid: props.federationGuid ?? undefined,
        code: Code.createEmpty(),
        // overridden body 必须复制几何；其余 body 留给 rebuildAll 重新生成
        ...(overridden
          ? { elementGeometryBuilderParams: (props as { elementGeometryBuilderParams?: unknown }).elementGeometryBuilderParams }
          : {}),
      });
      result.bodyMap.set(body.id, targetId);
    }
  });

  // ---- 第二遍：回写 params / jsonProperties 中的 ElementId ----
  const allIds = new Map<Id64String, Id64String>([
    ...result.featureMap,
    ...result.sketchMap,
    ...result.bodyMap,
  ]);
  runTxn(opts.target, "migrate part studio references", (txn) => {
    for (const [sourceId, targetId] of result.featureMap) {
      const props = opts.source.elements.getElementProps(sourceId) as FeatureProps;
      const params = deepRewrite(JSON.parse(props.params), allIds) as Record<string, unknown>;
      txn.updateElement<FeatureProps>({
        id: targetId,
        params: JSON.stringify(params),
        jsonProperties: deepRewrite(props.jsonProperties ?? {}, allIds) as Record<string, unknown>,
      });
    }
    for (const targetId of result.bodyMap.values()) {
      txn.updateElement({ id: targetId, elementGeometryBuilderParams: { entryArray: [] } });
    }
    for (const edge of queryAllFeatureDrives(opts.source)) {
      const sourceId = result.featureMap.get(edge.sourceId) ?? result.sketchMap.get(edge.sourceId);
      const targetId = result.featureMap.get(edge.targetId) ?? result.bodyMap.get(edge.targetId);
      if (sourceId && targetId) insertFeatureDrive(txn, sourceId, targetId);
    }
  });

  // ---- 重建目标 Studio（只重算目标模型内的特征） ----
  await FeatureEngine.rebuildAll(opts.target, {
    defModelId: opts.targetDefModelId,
    physModelId: opts.targetPhysModelId,
  });
  return result;
}
```

> `FeatureEngine.rebuildAll` 的 scope 参数需 Task 2/3 先落地；若当前签名只有 `db`，先加 `{ defModelId, physModelId }` 可选参数，缺省 legacy。

- [ ] **Step 4: 校验**

`validatePartStudioReplay`：
- `queryAllFeatures(source, sourceDefModelId).length === queryAllFeatures(target, targetDefModelId).length`
- `queryBodies(source, sourcePhysModelId).length === queryBodies(target, targetPhysModelId).length`
- `queryAllFeatureDrives(source).filter((edge) => both endpoints in maps).length === target drives count`
- body `countBRepEntries > 0`（复用 `MirrorElementDirectEdit.test.ts` 的 `elementGeometryRequest` / `PolyfaceQuery.sumTetrahedralVolumes`）
- 体积/bbox 抽样误差在既有归一化口径内。
- direct-edit body 与失败特征单独列报告；不得宣称“全部无损”。

- [ ] **Step 5: 幂等**

目标 Part Studio 的 `DefinitionPartition` 写 `jsonProperties.migrationSource = sourceTag`；`replayPartStudio` 开头查重，已迁移则返回已有 map（或空 map + `alreadyMigrated`）。重复执行不得新增 Feature/Body/边。

- [ ] **Step 6: transformer 时间盒探针（可选，不阻塞）**

```bash
cd D:/Github/luban-backend/modeling-server
# 手工改 package.json 加 @itwin/imodel-transformer@0.4.3，保留 link: 计数
CI=true corepack pnpm@10 install --no-frozen-lockfile
TRANSFORMER_NO_STRICT_DEP_CHECK=1 corepack pnpm@10 exec tsc --noEmit
```

探针只回答：`processModelContents` 是否复制元素、`processRelationships` 是否必须显式调用、`targetScopeElementId` 是否可用。结论写入 spike 文档；无论结果如何，**主路径仍是参数重放 + rebuildAll**。

- [ ] **Step 7: 跑测试确认通过**

```bash
cd D:/Github/luban-backend/modeling-server
CI=true corepack pnpm@10 exec vitest run src/feature/PartStudioMigration.test.ts
```

Expected: PASS；体积/bbox 抽样通过。

- [ ] **Step 8: 提交**

```bash
cd D:/Github/luban-backend
git add modeling-server/src/feature/PartStudioMigration.ts \
  modeling-server/src/feature/PartStudioMigration.test.ts \
  docs/feature-multi-partstudio-spike.md
git commit -m "spike(feature): Part Studio 迁移——参数重放 + rebuildAll"
```

---

### Task 7: 性能基准（5–10 个 Part Studio）

**Files:**
- Create: `D:/Github/luban-backend/modeling-server/src/feature/PartStudioPerf.test.ts`
- Modify: `D:/Github/luban-backend/docs/feature-multi-partstudio-spike.md`

**Interfaces:**
- Produces: 指标表：`ensureInitialized`/`getTree`/`insert`/`rebuildOne`/`switchStudio` 的 P50/P95；阈值见下。

- [ ] **Step 1: 写基准测试**

```ts
it("10 个 Part Studio：初始化/树/插入/单工作室重建/切换耗时", async () => {
  const studios = Array.from({ length: 10 }, (_, i) => `ps-${i + 1}`);
  const services = studios.map((id) => FeatureService.for(`perf-${id}`, db, { scope: { id } }));
  const tInit = performance.now();
  for (const svc of services) await svc.ensureInitialized();
  const initMs = performance.now() - tInit;

  const tTree = performance.now();
  for (const svc of services) svc.getTree();
  const treeMs = performance.now() - tTree;

  const tInsert = performance.now();
  await services[0].applyOp("sess", { kind: "insertFeature", featureType: "extrude", params: params(2, 1) });
  const insertMs = performance.now() - tInsert;

  // 单工作室重建：只重建 ps-1，不应重算其他 9 个
  const tRebuild = performance.now();
  await FeatureEngine.rebuildAll(db, { defModelId: services[0].ctx.defModelId });
  const rebuildMs = performance.now() - tRebuild;

  console.log({ initMs, treeMs, insertMs, rebuildMs });
});
```

（`FeatureEngine.rebuildAll` 需要 Task 3 的 scope 过滤；若签名不同，按实际 API 调整。）

- [ ] **Step 2: 阈值与判定**

写入 spike 文档：

| 指标 | Go 阈值 | No-Go |
|---|---|---|
| 10 工作室 `ensureInitialized` 总时长（首次） | < 30s | ≥ 30s |
| 10 工作室 `getTree` 总时长 | < 2s | ≥ 2s |
| 单次 insert（含求值） | < 5s | ≥ 5s |
| 单工作室 `rebuildAll`（10 个存在时） | < 10s | ≥ 10s |
| 切换工作室（`getTree`+首帧） | < 1s | ≥ 1s |

- [ ] **Step 3: 跑基准并记录**

```bash
cd D:/Github/luban-backend/modeling-server
CI=true corepack pnpm@10 exec vitest run src/feature/PartStudioPerf.test.ts
```

把实际值写入 `docs/feature-multi-partstudio-spike.md`。

- [ ] **Step 4: 提交**

```bash
cd D:/Github/luban-backend
git add modeling-server/src/feature/PartStudioPerf.test.ts docs/feature-multi-partstudio-spike.md
git commit -m "spike(feature): 多 Part Studio 性能基准"
```

---

### Task 8a: 最小 `isSecured` + iModel 级 ACL（文档级共享前置）

**Files:**
- Modify: `D:/Github/imodelhub-services/src/imodels/infrastructure/persistence/relational/entities/imodel.entity.ts`
- Modify: `D:/Github/imodelhub-services/src/imodels/dto/imodel-response.dto.ts`
- Create: `D:/Github/imodelhub-services/src/database/migrations/20261030000004-AddIModelIsSecured.ts`
- Modify: `D:/Github/imodelhub-services/src/common/authorization/resource-access.guard.ts`（或 `authorization.service.ts`）
- Create: `D:/Github/imodelhub-services/test/integration/imodel-secured.e2e-spec.ts`

**背景**：hub 当前只有 iTwin 级 RBAC 强制；`isSecured` 全仓 0 命中；`imodel_user_permissions` 表存在但数据面未强制。没有 `isSecured`，P1 的“文档级共享”无法成立——只能退回 iTwin 级共享（一个项目的全部 iModel）。

- [ ] **Step 1: 写失败测试**

```ts
it('isSecured=true：iTwin 成员但无 iModel 权限 → 403；有权限 → 200', async () => {
  // owner 创建 iTwin + iModel，PATCH/内部设置 isSecured=true
  // member 是 iTwin 成员但没有 iModel 权限
  await request(server)
    .get(`/imodels/${iModelId}`)
    .set('Authorization', `Bearer ${memberToken}`)
    .expect(403);

  // owner 给 member 授 imodels_webview
  await request(server)
    .post(`/imodels/${iModelId}/users`)
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ userId: memberUserId, permissions: ['imodels_webview'] })
    .expect(201);

  await request(server)
    .get(`/imodels/${iModelId}`)
    .set('Authorization', `Bearer ${memberToken}`)
    .expect(200);
});

it('isSecured=false：沿用 iTwin 权限，成员可读', async () => {
  // 同上但 isSecured=false，member 无 iModel 权限也应 200
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd D:/Github/imodelhub-services
npm run test:e2e -- --testPathPattern=imodel-secured
```

Expected: FAIL，`isSecured` 字段不存在 / member 仍可读。

- [ ] **Step 3: 加列与迁移**

`imodel.entity.ts`：

```ts
@Column({ type: 'boolean', default: false })
isSecured!: boolean;
```

`20261030000004-AddIModelIsSecured.ts`：

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIModelIsSecured20261030000004 implements MigrationInterface {
  name = 'AddIModelIsSecured20261030000004';
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "imodels" ADD "isSecured" boolean NOT NULL DEFAULT false`);
  }
  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "imodels" DROP COLUMN "isSecured"`);
  }
}
```

响应 DTO `@Expose() isSecured!: boolean;`。

`update-imodel.dto.ts` 增加可选字段（仅 `IMODELS_MANAGE` 可改）：

```ts
@ApiPropertyOptional()
@IsBoolean()
@IsOptional()
isSecured?: boolean;
```

- [ ] **Step 4: Guard 接入**

在 `ResourceAccessGuard`（或 `AuthorizationService.resolvePermissions`）中，当 iModel `isSecured=true` 时：

```ts
const imodel = await imodelRepository.findById(iModelId);
if (imodel?.isSecured) {
  const allowed = await permissionsService.checkUserPermission(userId, iModelId, requiredLevel);
  if (!allowed) throw new ForbiddenException({ code: 'imodelAccessDenied' });
  return true;
}
// 否则继续走现有 iTwin RBAC
```

`requiredLevel` 按动作映射：读 → `read`/`webview`；写 → `write`/`manage`。复用 `src/imodels/permissions.service.ts:192-224` 的 `checkUserPermission` 与 `imodel_user_permissions` 表。

- [ ] **Step 5: 跑测试确认通过**

```bash
cd D:/Github/imodelhub-services
npm run test:unit
npm run test:e2e -- --testPathPattern=imodel-secured
npm run build
```

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
cd D:/Github/imodelhub-services
git add src/imodels src/common/authorization src/database/migrations test/integration/imodel-secured.e2e-spec.ts
git commit -m "feat(imodels): 最小 isSecured + iModel 级 ACL"
```

> 若产品决定 P1 不做文档级共享：跳过本任务，在 P1 报告把“Named Version + 文档级共享”判为 **No-Go**，并明确退回 iTwin 级共享；不得把 iTwin 级共享写成“文档级共享”。

---

### Task 8: Named Version + 文档级共享验证

**Files:**
- Create: `D:/Github/luban-backend/modeling-server/src/feature/PartStudioRelease.test.ts`（或复用 hub e2e）
- Modify: `D:/Github/imodelhub-services/test/itwins.e2e-spec.ts`（如共享测试在此）
- Modify: `D:/Github/luban-backend/docs/feature-multi-partstudio-spike.md`

**Interfaces:**
- 验证：目标 iModel 上 `POST /imodels/{id}/namedversions` 成功；`GET` 列表可读；在 `isSecured=true` 下共享给第二用户后该用户可读。
- 说明：hub 的 Named Version **CRUD 已存在但只是元数据**（不自动生成 checkpoint/缩略图、`namedVersionCount` 不递增、`NamedVersionCreated` 事件未 emit）；本任务只验证“命名 + 列表 + 文档级共享”，不宣称 checkpoint 已生成。`isSecured` 由 Task 8a 提供；若 Task 8a 跳过，本任务判 No-Go（退回 iTwin 级共享）。

- [ ] **Step 1: API 测试**

在 hub e2e 中新增：

```ts
it("Named Version + iModel 共享：创建后可读、可被共享用户读取", async () => {
  // 复用现有 e2e helper：创建 iTwin/iModel、push changeset、取得 changesetId
  const nv = await request(server)
    .post(`/imodels/${iModelId}/namedversions`)
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ name: 'P1 Spike V1', changesetId })
    .expect(201);
  expect(nv.body.namedVersion.name).toBe('P1 Spike V1');

  // 开启 iModel 级隔离（Task 8a）
  await request(server)
    .patch(`/imodels/${iModelId}`)
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ isSecured: true })
    .expect(200);

  await request(server)
    .post(`/imodels/${iModelId}/users`)
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ userId: readerUserId, permissions: ['imodels_webview'] })
    .expect(201);

  const list = await request(server)
    .get(`/imodels/${iModelId}/namedversions`)
    .set('Authorization', `Bearer ${readerToken}`)
    .expect(200);
  expect(list.body.namedVersions[0].name).toBe('P1 Spike V1');
});
```

（以 hub 现有权限端点/枚举为准；若端点不同，按 `src/imodels/users.controller.ts` 调整。）

- [ ] **Step 2: 跑测试**

```bash
cd D:/Github/imodelhub-services
npm run test:e2e -- --testPathPattern=named
```

Expected: PASS。

- [ ] **Step 3: 记录结论**

在 spike 文档写：Named Version 在 B 模型（一个 iModel 多 Model）下可用；共享是 iModel（文档）级；CAM 可按设计 iModel 的 named version 钉版本。

- [ ] **Step 4: 提交**

```bash
cd D:/Github/imodelhub-services
git add test
git commit -m "test(itwins): Named Version + 文档级共享验证"
```

---

### Task 9: Go/No-Go 报告与 ADR 更新

**Files:**
- Modify: `D:/Github/luban-backend/docs/feature-multi-partstudio-spike.md`
- Modify: `D:/Github/tiangong-kaiwu/docs/adr/0001-itwin-imodel-data-model.md`

- [ ] **Step 1: 汇总四项结论**

在 `docs/feature-multi-partstudio-spike.md` 写：

```md
# 多 Part Studio spike 记录（2026-10-30）

## 结论
- 隔离：2 个 Part Studio 特征/树/体/orderKey 独立；撤销粒度 = <A/B/C 决策>。
- 迁移：参数重放 + rebuildAll 通过；direct-edit body 处理 = <结论>；transformer 兼容性 = <结论>；体积/包围盒误差 = <数值>。
- 性能：10 工作室 init=<x>s / tree=<y>ms / insert=<z>s / rebuild=<w>s / switch=<v>ms，<Go/No-Go>。
- 发布：Named Version + iModel 共享可用。

## 未解问题
- 页签级 undo（若选 A，则记录为独立需求）。
- 写租约仍为 iModel 级（P1 决策）。
- 大 iModel 的 tile/checkpoint 实测（后续）。
```

- [ ] **Step 2: 更新 ADR 决策记录**

在 `docs/adr/0001-itwin-imodel-data-model.md` 第 14 节追加：

```md
| 2026-10-30 | P1 spike 完成：隔离/迁移/性能/Named Version 结论见 luban-backend docs/feature-multi-partstudio-spike.md；<Go/No-Go> | <状态> |
```

- [ ] **Step 3: Git 提交**

```bash
cd D:/Github/tiangong-kaiwu
git add docs/adr/0001-itwin-imodel-data-model.md
git commit -m "docs(adr): P1 spike 结论入 ADR"
cd D:/Github/luban-backend
git add docs/feature-multi-partstudio-spike.md
git commit -m "docs: 多 Part Studio spike 记录"
```

---

## P1 Go/No-Go 验收清单

- [ ] 2–3 个 Part Studio 的特征/树/体/orderKey 隔离测试通过。
- [ ] 撤销行为有实测记录，且选定 A/B/C；不得含糊。
- [ ] 旧 Part Studio 迁移测试通过（特征数/体数/体积/包围盒/FeatureDrives 引用），重复执行幂等。
- [ ] 10 个 Part Studio 性能达到阈值，或明确 No-Go 原因。
- [ ] `isSecured` + iModel 级 ACL 可用（Task 8a）；否则文档级共享判 No-Go，退回 iTwin 级共享。
- [ ] Named Version（元数据）+ 文档级共享在目标模型上可用；不宣称 checkpoint 已生成。
- [ ] `docs/feature-multi-partstudio-spike.md` 与 ADR 决策记录已更新。
- [ ] 现有单工作室测试不回归（`FeatureService.test.ts` / `FeatureUndo.test.ts` / `MultiBodyFoundation.test.ts` / `FeatureSync.test.ts`）。

**Go 之后**才进入 P2：新文档按 B 创建、文档中心两层 IA、前端多页签 Model 切换、旧数据迁移工具化。**No-Go** 则维持 A，更新 ADR 并停止 B 迁移。
