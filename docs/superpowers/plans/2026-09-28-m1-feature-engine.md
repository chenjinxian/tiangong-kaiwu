# M1 特征引擎最小闭环 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 modeling-server 内建成正式特征引擎 v1 骨架——FeatureTypeRegistry + extrude/布尔特征 + EDE 求值 + op 日志 + 语义 undo/redo + 写租约 + op 即 push，达到「拉伸链+参数修改+undo+双端同步」可演示（roadmap M1）。

**Architecture:** 特征=LubanCAD ECSchema 元素（params JSON），EDE 图驱动再生（saveChanges 时 native 拓扑传播→回调求值→indirectEditTxn 写回 BodySolid 几何流），中间特征输出只存 MS 内存缓存（形态 Y），op 日志为 iModel 内 append-only 元素，undo=逆向 op 落新 changeset，写租约为 MS 内存单例。内核路径沿用 spike 实证：`ElementGeometry.Builder.appendGeometryQuery → IModelDb.createBRepGeometry → elementGeometryBuilderParams 写回`。

**Tech Stack:** TypeScript (ESM, `.js` 导入后缀)、@itwin/core-backend（link:）、zod v4（已在 modeling-server 依赖中）、Vitest、HubMock（深链导入）。

**Spec:** `docs/superpowers/specs/2026-09-27-feature-system-imodel-architecture-design.md`（§3.1 数据模型、§3.2 再生与事务、§3.3a-b 协作与接缝）；任务编号对齐 `docs/superpowers/specs/2026-09-28-cad-full-program-roadmap.md`（M1=T3.1-T3.3/T3.6-T3.7 + T5.1-T5.4/T5.8/T5.5 自动化部分）。

## Global Constraints

- **link: 项目禁用 `pnpm add`**：加依赖须手改 package.json + 在所属 workspace 根 `corepack pnpm@10 install --no-frozen-lockfile`，核对 lockfile 的 `link:` 计数不变。
- **shared 包改动后必须重建**：`cd luban-cad/packages/shared && pnpm build`（tsc），modeling-server 才能看到新导出（CLAUDE.md 实测坑）。
- **非交互 pnpm 加 `CI=true`**（避免 ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY）。
- **编辑硬约束**：一切写库经 `EditTxn` + `saveChanges`（可撤销是硬约束），禁止第二套建模 API。
- **每任务收尾门禁**：`cd modeling-server && npx tsc --noEmit` 零错误 + `npx eslint "src/feature/**/*.ts"` 零 error + 相关测试绿，然后才 commit。
- **schema 演进纪律**：LubanCAD schema 只加类/属性，不改不删（T7.6）。
- **M1 不含**：fillet（等 X3/T1.8）、nodeId 接线（T3.5）、草图（WS4）、预览（T3.8）、输出缓存优化（T3.9——M1 的缓存是正确性载体而非优化）、前端 UI（WS6）。
- **commit 信息**：跟随仓内风格（`feat(modeling-server): …`），结尾加 `Co-Authored-By: Claude Code <noreply@anthropic.com>`。

## Design Notes（执行前必读）

1. **内存缓存是正确性载体**：中间特征输出不入库（形态 Y），MS 重启/换进程后缓存必空 → 任何 op 前先 `ensureWarm`（冷启动全链重建，第一设计律）。
2. **抑制语义（M1 有意偏离 spec §3.1c）**：spec 写「出边 status=0x80 + SuppressedShape」；M1 实现为**直通语义**——被抑制特征求值=直接透传上游输出（等于跳过该特征的贡献，FreeCAD 用户可见语义）。0x80 保留为将来「冻结下游」机制。此偏离已知会用户，schema 不受影响。
3. **op 日志与 op 同一 txn**：参数行+oplog 行+（传播产生的）几何行全部落在同一个 changeset（op=push 的物理基础）。
4. **M1 的 undo 只支持 updateParams**：insert/deleteFeature 记录进日志但不可逆（undo 时报「M1 不支持」）；deleteFeature 仅允许删链尾。
5. **EDE 边维护是 op 层职责**：插/删特征时显式重接边；求值回调内不碰边。

## File Structure

```
luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts   [新] RPC 接口（T5.8）
modeling-server/src/feature/
  LubanCadSchema.ts        [新] 正式 schema XML + JS 类（Feature/BodySolid/OpLogEntry/FeatureDrives）+ 回调宿主 + 建图/查询助手
  FeatureTypeRegistry.ts   [新] featureType→{zod schema, booleanOp, requiresUpstream} + extrude/booleanAdd/booleanSubtract 注册
  FeatureEngine.ts         [新] 求值引擎（EDE 回调实现、内核调用、直通抑制、冷重建、warm 管理）
  OpLog.ts                 [新] op 日志元素读写 + 撤销栈语义
  WriteLease.ts            [新] 写租约单例
  FeatureService.ts        [新] op 入口（insert/update/delete/undo/redo/getTree）+ push 挂钩
  FeatureRpcImpl.ts        [新] RPC 实现（薄壳）
  test/TestHost.ts         [新] 测试公共（IModelHost 启动、临时目录）
  *.test.ts                [新] 各任务配套测试
modeling-server/src/main.ts                                [改] RPC 注册
```

---

### Task 1: shared 包 RPC 接口（T5.8）

**Files:**
- Create: `luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts`
- Modify: `luban-cad/packages/shared/src/index.ts`（在 `export { OpenCloudRpcInterface }` 行后加导出）
- Test: `luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.test.ts`（仅类型存在性——纯接口无逻辑，用编译期+一个冒烟断言）

**Interfaces:**
- Produces: `LubanFeatureRpcInterface`（类）、`FeatureOp`、`FeatureTreeEntry`、`FeatureOpResult`——后续所有任务的 wire 类型。

- [ ] **Step 1: 写接口文件**

```ts
/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 鲁班CAD 特征系统 M1 RPC 接口（roadmap T5.8）。
 * 消费方：modeling-server FeatureRpcImpl（服务端）、前端 feature 面板（M3）。
 */
import { RpcInterface } from "@itwin/core-common";

/** v1 特征类型（M1：拉伸 + 布尔；fillet 等 M3 再加） */
export type LubanFeatureType = "extrude" | "booleanAdd" | "booleanSubtract";

/** 拉伸/布尔共用参数：XY 平面闭合多边形轮廓 + Z 向距离 */
export interface ExtrudeParams {
  profile: Array<{ x: number; y: number }>;
  distance: number;
}

export type FeatureOp =
  | { kind: "insertFeature"; featureType: LubanFeatureType; params: ExtrudeParams }
  | { kind: "updateParams"; featureId: string; params: ExtrudeParams }
  | { kind: "deleteFeature"; featureId: string }
  | { kind: "undo" }
  | { kind: "redo" };

export interface FeatureTreeEntry {
  id: string;
  featureType: string;
  orderKey: number;
  suppressed: boolean;
  status: number;
  params: unknown;
}

export type FeatureOpResult =
  | { ok: true; featureId?: string }
  | { ok: false; error: string };

export abstract class LubanFeatureRpcInterface extends RpcInterface {
  public static override interfaceName = "luban-cad/features-v1";
  public static interfaceVersion = "1.0.0";

  public async getFeatureTree(_iModelKey: string): Promise<FeatureTreeEntry[]> { return this.forward(arguments); }
  public async applyFeatureOp(_iModelKey: string, _op: FeatureOp, _sessionId: string): Promise<FeatureOpResult> { return this.forward(arguments); }
  public async acquireWriteLease(_iModelKey: string, _sessionId: string, _user?: string): Promise<{ ok: boolean; holder?: string }> { return this.forward(arguments); }
  public async releaseWriteLease(_iModelKey: string, _sessionId: string): Promise<void> { return this.forward(arguments); }
}
```

- [ ] **Step 2: index.ts 加导出**（在 OpenCloudRpcInterface 导出行之后）

```ts
export { LubanFeatureRpcInterface } from './rpc/LubanFeatureRpcInterface.js';
export type { LubanFeatureType, ExtrudeParams, FeatureOp, FeatureTreeEntry, FeatureOpResult } from './rpc/LubanFeatureRpcInterface.js';
```

- [ ] **Step 3: 冒烟测试**

```ts
import { describe, expect, it } from "vitest";
import { LubanFeatureRpcInterface } from "./LubanFeatureRpcInterface.js";

describe("LubanFeatureRpcInterface", () => {
  it("接口名与版本固定", () => {
    expect(LubanFeatureRpcInterface.interfaceName).toBe("luban-cad/features-v1");
    expect(LubanFeatureRpcInterface.interfaceVersion).toBe("1.0.0");
  });
});
```

- [ ] **Step 4: 构建 + 测试**

```bash
cd luban-cad/packages/shared && pnpm build && npx vitest run src/rpc/LubanFeatureRpcInterface.test.ts
```
Expected: build 零错误，测试 PASS。

- [ ] **Step 5: Commit**

```bash
git add luban-cad/packages/shared
git commit -m "feat(shared): 特征系统 M1 RPC 接口定义（T5.8）

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 2: 写租约（T5.4）

**Files:**
- Create: `modeling-server/src/feature/WriteLease.ts`
- Test: `modeling-server/src/feature/WriteLease.test.ts`

**Interfaces:**
- Produces: `writeLeases: WriteLeaseRegistry`（单例）；方法 `acquire(key, sessionId, user?): {ok, holder?}` / `release(key, sessionId): void` / `assertHeld(key, sessionId): void`（未持有抛 `WriteLeaseError`）/ `renew(key, sessionId): void`；TTL 30s。

- [ ] **Step 1: 写失败测试**

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { writeLeases, WriteLeaseError } from "./WriteLease.js";

describe("WriteLease", () => {
  beforeEach(() => writeLeases.releaseAllForTest());

  it("先到先得，第二会话被拒并得知持有者", () => {
    expect(writeLeases.acquire("im:1", "s1", "alice").ok).toBe(true);
    const r = writeLeases.acquire("im:1", "s2", "bob");
    expect(r.ok).toBe(false);
    expect(r.holder).toBe("alice");
  });

  it("assertHeld：未持有/他人持有抛错，持有者通过", () => {
    writeLeases.acquire("im:1", "s1", "alice");
    expect(() => writeLeases.assertHeld("im:1", "s2")).toThrow(WriteLeaseError);
    expect(() => writeLeases.assertHeld("im:1", "s1")).not.toThrow();
  });

  it("TTL 过期后可被他人夺取", () => {
    writeLeases.acquire("im:1", "s1", "alice", 1 /* 1ms，测试用 TTL 覆盖 */);
    return new Promise((r) => setTimeout(r, 5)).then(() => {
      expect(writeLeases.acquire("im:1", "s2", "bob").ok).toBe(true);
    });
  });

  it("release 仅限持有者", () => {
    writeLeases.acquire("im:1", "s1", "alice");
    writeLeases.release("im:1", "s2");
    expect(() => writeLeases.assertHeld("im:1", "s1")).not.toThrow();
    writeLeases.release("im:1", "s1");
    expect(writeLeases.acquire("im:1", "s3", "carol").ok).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd modeling-server && npx vitest run src/feature/WriteLease.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

```ts
/** 写租约（roadmap T5.4）：一个 iModel 同一时刻一个活跃编辑会话；MS 内存态。 */
export class WriteLeaseError extends Error {
  public constructor(public readonly holder: string | undefined) {
    super(holder ? `写租约被 ${holder} 持有` : "写租约未被本会话持有");
  }
}

interface Lease { sessionId: string; user: string; expiresAt: number; }

export class WriteLeaseRegistry {
  private readonly leases = new Map<string, Lease>();
  private readonly defaultTtlMs = 30_000;

  public acquire(key: string, sessionId: string, user = sessionId, ttlMs = this.defaultTtlMs): { ok: boolean; holder?: string } {
    const cur = this.validLease(key);
    if (cur && cur.sessionId !== sessionId)
      return { ok: false, holder: cur.user };
    this.leases.set(key, { sessionId, user, expiresAt: Date.now() + ttlMs });
    return { ok: true };
  }

  public renew(key: string, sessionId: string): void {
    const cur = this.validLease(key);
    if (cur?.sessionId === sessionId)
      this.leases.set(key, { ...cur, expiresAt: Date.now() + this.defaultTtlMs });
  }

  public release(key: string, sessionId: string): void {
    const cur = this.validLease(key);
    if (cur?.sessionId === sessionId)
      this.leases.delete(key);
  }

  public assertHeld(key: string, sessionId: string): void {
    const cur = this.validLease(key);
    if (!cur || cur.sessionId !== sessionId)
      throw new WriteLeaseError(cur?.user);
  }

  /** @internal 测试专用 */
  public releaseAllForTest(): void { this.leases.clear(); }

  private validLease(key: string): Lease | undefined {
    const l = this.leases.get(key);
    return l && l.expiresAt > Date.now() ? l : undefined;
  }
}

export const writeLeases = new WriteLeaseRegistry();
```

- [ ] **Step 4: 跑测试通过**

Run: `cd modeling-server && npx vitest run src/feature/WriteLease.test.ts`
Expected: PASS 4/4。

- [ ] **Step 5: Commit**

```bash
git add modeling-server/src/feature/WriteLease.ts modeling-server/src/feature/WriteLease.test.ts
git commit -m "feat(modeling-server): 会话级写租约（T5.4）

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 3: LubanCAD 正式 schema + JS 类（T3.1 前置）

**Files:**
- Create: `modeling-server/src/feature/LubanCadSchema.ts`
- Create: `modeling-server/src/feature/test/TestHost.ts`
- Test: `modeling-server/src/feature/LubanCadSchema.test.ts`

**Interfaces:**
- Produces:
  - `LubanCadSchema.register(): void` / `LubanCadSchema.importTo(db): Promise<void>`
  - `FeatureProps`（`{ featureType, orderKey, suppressed, status, params }` + DefinitionElementProps）
  - `createFeatureModels(txn): Promise<{defModelId, physModelId, categoryId}>`
  - `insertFeatureElement(txn, ctx, {featureType, orderKey, params}): Promise<Id64String>`
  - `insertBodySolidElement(txn, ctx): Promise<Id64String>`
  - `insertFeatureDrive(txn, sourceId, targetId): Id64String`
  - `queryFeatureSources(db, targetId): Id64String[]`（入边中 class 为 Feature 的源）
  - `queryFeatureDriveEdge(db, sourceId, targetId): RelationshipProps | undefined`
  - `queryAllFeatures(db): Array<FeatureRow>`（orderKey 升序）；`queryBodySolid(db): Id64String | undefined`
  - `bindFeatureEngine(hooks): void`，`FeatureEngineHooks = { onFeatureNode(arg, phase): void; onBodyNode(arg): void }`

- [ ] **Step 1: 测试公共 TestHost**

```ts
// modeling-server/src/feature/test/TestHost.ts
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { IModelHost } from "@itwin/core-backend";

export async function ensureHostStarted(): Promise<void> {
  const h = IModelHost as unknown as { initialized?: boolean };
  if (!h.initialized)
    await IModelHost.startup();
}

export function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
```

- [ ] **Step 2: 写失败测试**

```ts
// modeling-server/src/feature/LubanCadSchema.test.ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { Id64 } from "@itwin/core-bentley";
import { EditTxn, StandaloneDb } from "@itwin/core-backend";
import { ensureHostStarted, makeTempDir } from "./test/TestHost.js";
import {
  createFeatureModels, insertBodySolidElement, insertFeatureDrive, insertFeatureElement,
  LubanCadSchema, queryBodySolid, queryFeatureDriveEdge, queryFeatureSources, queryAllFeatures,
} from "./LubanCadSchema.js";

describe("LubanCAD schema", () => {
  let dir: string;
  let db: StandaloneDb;
  let txn: EditTxn;
  let ctx: { defModelId: string; physModelId: string; categoryId: string };

  beforeAll(async () => {
    await ensureHostStarted();
    LubanCadSchema.register();
    dir = makeTempDir("lubancad-schema-");
    db = StandaloneDb.createEmpty(path.join(dir, "t.bim"), { rootSubject: { name: "T" }, enableTransactions: true });
    await LubanCadSchema.importTo(db);
    txn = new EditTxn(db, "setup");
    txn.start();
    ctx = await createFeatureModels(txn);
  }, 120_000);

  afterAll(() => {
    if (txn.isActive) txn.end("abandon");
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("Feature/BodySolid/FeatureDrives 可插入并可查询", async () => {
    const f1 = await insertFeatureElement(txn, ctx, { featureType: "extrude", orderKey: 1, params: "{\"profile\":[],\"distance\":1}" });
    const f2 = await insertFeatureElement(txn, ctx, { featureType: "booleanSubtract", orderKey: 2, params: "{}" });
    const body = await insertBodySolidElement(txn, ctx);
    insertFeatureDrive(txn, f1, f2);
    insertFeatureDrive(txn, f2, body);
    txn.saveChanges("build");

    expect(Id64.isValidId64(f1)).toBe(true);
    expect(queryFeatureSources(db, f2)).toEqual([f1]);
    expect(queryFeatureSources(db, body)).toEqual([f2]);
    expect(queryFeatureDriveEdge(db, f1, body)).toBeUndefined();
    expect(queryFeatureDriveEdge(db, f2, body)?.id).toBeDefined();
    expect(queryAllFeatures(db).map((r) => r.orderKey)).toEqual([1, 2]);
    expect(queryBodySolid(db)).toBe(body);
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `cd modeling-server && npx vitest run src/feature/LubanCadSchema.test.ts`
Expected: FAIL（LubanCadSchema.ts 不存在）。

- [ ] **Step 4: 实现 LubanCadSchema.ts**

```ts
/**
 * 鲁班CAD 特征系统正式 schema（spec §3.1b；spike-x1 的正式化替代）。
 * 类：Feature（参数载体）/ BodySolid（再生结果）/ OpLogEntry（op 日志）/ FeatureDrives（EDE 边）。
 * EDE 回调宿主：类静态回调 → bindFeatureEngine 注入的 hooks（依赖倒置避免环依赖）。
 */
import { DbResult, Id64String } from "@itwin/core-bentley";
import {
  Code, DefinitionElementProps, GeometricElement3dProps, IModel, Point3d, RelatedElement, YawPitchRollAngles,
} from "@itwin/core-common";
import {
  ClassRegistry, DefinitionElement, DefinitionModel, DefinitionPartition, EditTxn, ElementDrivesElement,
  ElementDrivesElementProps, IModelDb, OnDependencyArg, OnElementDependencyArg, PhysicalElement, PhysicalModel,
  PhysicalPartition, RelationshipProps, Schema, Schemas, SpatialCategory, SubjectOwnsPartitionElements,
} from "@itwin/core-backend";

export interface FeatureProps extends DefinitionElementProps {
  featureType: string;
  orderKey: number;
  suppressed: boolean;
  status: number;
  params: string; // JSON 文本
}

export interface FeatureRow { id: Id64String; featureType: string; orderKey: number; suppressed: boolean; status: number; params: string; }

const LUBANCAD_SCHEMA_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ECSchema schemaName="LubanCAD" alias="lcs" version="01.00.00" xmlns="http://www.bentley.com/schemas/Bentley.ECXML.3.2">
  <ECSchemaReference name="BisCore" version="01.00.00" alias="bis"/>
  <ECEntityClass typeName="Feature">
    <BaseClass>bis:DefinitionElement</BaseClass>
    <ECProperty propertyName="featureType" typeName="string"/>
    <ECProperty propertyName="orderKey" typeName="double"/>
    <ECProperty propertyName="suppressed" typeName="boolean"/>
    <ECProperty propertyName="status" typeName="int"/>
    <ECProperty propertyName="params" typeName="string"/>
  </ECEntityClass>
  <ECEntityClass typeName="BodySolid">
    <BaseClass>bis:PhysicalElement</BaseClass>
  </ECEntityClass>
  <ECEntityClass typeName="OpLogEntry">
    <BaseClass>bis:DefinitionElement</BaseClass>
    <ECProperty propertyName="opType" typeName="string"/>
    <ECProperty propertyName="payload" typeName="string"/>
    <ECProperty propertyName="undone" typeName="boolean"/>
    <ECProperty propertyName="discarded" typeName="boolean"/>
  </ECEntityClass>
  <ECRelationshipClass typeName="FeatureDrives" modifier="None" strength="referencing">
    <BaseClass>bis:ElementDrivesElement</BaseClass>
    <Source multiplicity="(0..*)" roleLabel="drives" polymorphic="true"><Class class="bis:Element"/></Source>
    <Target multiplicity="(0..*)" roleLabel="is driven by" polymorphic="true"><Class class="bis:Element"/></Target>
  </ECRelationshipClass>
</ECSchema>`;

// ---------------------------------------------------------------------------
// EDE 回调宿主（hooks 由 FeatureEngine 注入）
// ---------------------------------------------------------------------------

export interface FeatureEngineHooks {
  onFeatureNode(arg: OnElementDependencyArg, phase: "root" | "inputs"): void;
  onBodyNode(arg: OnElementDependencyArg): void;
}
let engineHooks: FeatureEngineHooks | undefined;
export function bindFeatureEngine(hooks: FeatureEngineHooks): void { engineHooks = hooks; }

export class LubanFeature extends DefinitionElement {
  public static override get className(): string { return "Feature"; }
  public declare featureType: string;
  public declare orderKey: number;
  public declare suppressed: boolean;
  public declare status: number;
  public declare params: string;

  protected static override onBeforeOutputsHandledArg(arg: OnElementDependencyArg): void {
    engineHooks?.onFeatureNode(arg, "root");
  }
  protected static override onAllInputsHandledArg(arg: OnElementDependencyArg): void {
    engineHooks?.onFeatureNode(arg, "inputs");
  }
}

export class LubanBodySolid extends PhysicalElement {
  public static override get className(): string { return "BodySolid"; }
  protected static override onAllInputsHandledArg(arg: OnElementDependencyArg): void {
    engineHooks?.onBodyNode(arg);
  }
}

export class LubanOpLogEntry extends DefinitionElement {
  public static override get className(): string { return "OpLogEntry"; }
  public declare opType: string;
  public declare payload: string;
  public declare undone: boolean;
  public declare discarded: boolean;
}

export class LubanFeatureDrives extends ElementDrivesElement {
  public static override get className(): string { return "FeatureDrives"; }
  public static override onRootChangedArg(_arg: OnDependencyArg): void { /* M1：无需边级动作 */ }
}

export class LubanCadSchema extends Schema {
  public static override get schemaName(): string { return "LubanCAD"; }

  public static register(): void {
    if (this === Schemas.getRegisteredSchema(this.schemaName))
      return;
    Schemas.registerSchema(this);
    ClassRegistry.register(LubanFeature, this);
    ClassRegistry.register(LubanBodySolid, this);
    ClassRegistry.register(LubanOpLogEntry, this);
    ClassRegistry.register(LubanFeatureDrives, this);
  }

  public static async importTo(db: IModelDb): Promise<void> {
    if (db.querySchemaVersion(this.schemaName))
      return;
    await db.importSchemaStrings([LUBANCAD_SCHEMA_XML]);
  }
}

// ---------------------------------------------------------------------------
// 建图与查询助手
// ---------------------------------------------------------------------------

export interface FeatureGraphContext { defModelId: Id64String; physModelId: Id64String; categoryId: Id64String; }

export async function createFeatureModels(txn: EditTxn): Promise<FeatureGraphContext> {
  const db = txn.iModel;
  const parent = new SubjectOwnsPartitionElements(IModel.rootSubjectId);

  const defPartition = db.elements.createElement({
    classFullName: DefinitionPartition.classFullName, model: IModel.repositoryModelId,
    parent, code: Code.createEmpty(), userLabel: "LubanFeaturePartition",
  });
  const defPartitionId = txn.insertElement(defPartition.toJSON());
  const defModelId = txn.insertModel(db.models.createModel({
    classFullName: DefinitionModel.classFullName, modeledElement: new RelatedElement({ id: defPartitionId }),
  }).toJSON());

  const physPartition = db.elements.createElement({
    classFullName: PhysicalPartition.classFullName, model: IModel.repositoryModelId,
    parent, code: Code.createEmpty(), userLabel: "LubanPhysicalPartition",
  });
  const physPartitionId = txn.insertElement(physPartition.toJSON());
  const physModelId = txn.insertModel(db.models.createModel({
    classFullName: PhysicalModel.classFullName, modeledElement: new RelatedElement({ id: physPartitionId }),
  }).toJSON());

  const category = SpatialCategory.create(db, IModel.dictionaryId, LubanBodySolid.classFullName);
  const categoryId = txn.insertElement(category.toJSON());
  return { defModelId, physModelId, categoryId };
}

export async function insertFeatureElement(txn: EditTxn, ctx: FeatureGraphContext, f: { featureType: string; orderKey: number; params: string; suppressed?: boolean }): Promise<Id64String> {
  await txn.iModel.locks.acquireLocks({ shared: ctx.defModelId });
  const props: FeatureProps = {
    classFullName: LubanFeature.classFullName, model: ctx.defModelId, code: Code.createEmpty(),
    userLabel: `feature-${f.orderKey}`, featureType: f.featureType, orderKey: f.orderKey,
    suppressed: f.suppressed ?? false, status: 0, params: f.params,
  };
  return txn.insertElement(props);
}

export async function insertBodySolidElement(txn: EditTxn, ctx: FeatureGraphContext): Promise<Id64String> {
  await txn.iModel.locks.acquireLocks({ shared: ctx.physModelId });
  const props: GeometricElement3dProps = {
    classFullName: LubanBodySolid.classFullName, model: ctx.physModelId, category: ctx.categoryId,
    code: Code.createEmpty(), userLabel: "bodySolid",
    placement: { origin: Point3d.createZero(), angles: YawPitchRollAngles.createDegrees(0, 0, 0) },
  };
  return txn.insertElement(props);
}

export function insertFeatureDrive(txn: EditTxn, sourceId: Id64String, targetId: Id64String): Id64String {
  const props: ElementDrivesElementProps = {
    classFullName: LubanFeatureDrives.classFullName, sourceId, targetId, status: 0, priority: 0,
  };
  return txn.insertRelationship(props);
}

function preparedRows(db: IModelDb, sql: string, bind: (stmt: { bindId(i: number, v: Id64String): void; bindString(i: number, v: string): void }) => void, map: (v: { getId(): Id64String; getDouble(): number; getInteger(): number; getString(): string }, row: unknown[]) => unknown): unknown[] {
  const out: unknown[] = [];
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- 同步回调内不可用 async createQueryReader
  db.withPreparedStatement(sql, (stmt) => {
    bind(stmt as never);
    while (stmt.step() === DbResult.BE_SQLITE_ROW) {
      const vals = Array.from({ length: stmt.getColumnCount() }, (_, i) => stmt.getValue(i));
      out.push(map(stmt.getValue(0), vals));
    }
  });
  return out;
}

/** 查询驱动 targetId 的 Feature 类源元素（按 ECInstanceId 排序保证确定性）。 */
export function queryFeatureSources(db: IModelDb, targetId: Id64String): Id64String[] {
  return preparedRows(db,
    `SELECT s.ECInstanceId FROM LubanCAD.FeatureDrives d JOIN LubanCAD.Feature s ON s.ECInstanceId = d.SourceECInstanceId
     WHERE d.TargetECInstanceId = ? ORDER BY s.ECInstanceId`,
    (s) => s.bindId(1, targetId),
    (v) => v.getId()) as Id64String[];
}

export function queryFeatureDriveEdge(db: IModelDb, sourceId: Id64String, targetId: Id64String): RelationshipProps | undefined {
  let out: RelationshipProps | undefined;
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  db.withPreparedStatement(
    `SELECT ECInstanceId FROM LubanCAD.FeatureDrives WHERE SourceECInstanceId = ? AND TargetECInstanceId = ?`,
    (stmt) => {
      stmt.bindId(1, sourceId);
      stmt.bindId(2, targetId);
      if (stmt.step() === DbResult.BE_SQLITE_ROW)
        out = { id: stmt.getValue(0).getId(), classFullName: LubanFeatureDrives.classFullName, sourceId, targetId };
    });
  return out;
}

export function queryAllFeatures(db: IModelDb): FeatureRow[] {
  const out: FeatureRow[] = [];
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  db.withPreparedStatement(
    `SELECT ECInstanceId, featureType, orderKey, suppressed, status, params FROM LubanCAD.Feature ORDER BY orderKey`,
    (stmt) => {
      while (stmt.step() === DbResult.BE_SQLITE_ROW) {
        out.push({
          id: stmt.getValue(0).getId(), featureType: stmt.getValue(1).getString(),
          orderKey: stmt.getValue(2).getDouble(), suppressed: stmt.getValue(3).getInteger() !== 0,
          status: stmt.getValue(4).getInteger(), params: stmt.getValue(5).getString(),
        });
      }
    });
  return out;
}

export function queryBodySolid(db: IModelDb): Id64String | undefined {
  let id: Id64String | undefined;
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  db.withPreparedStatement(`SELECT ECInstanceId FROM LubanCAD.BodySolid LIMIT 1`, (stmt) => {
    if (stmt.step() === DbResult.BE_SQLITE_ROW)
      id = stmt.getValue(0).getId();
  });
  return id;
}
```

注意 `preparedRows` 是内部通用小工具（上面 `queryFeatureSources` 用）；若 TS 类型别扭可直接内联展开为 `queryFeatureSources` 专用代码，不要留死代码。

- [ ] **Step 5: 跑测试通过 + 门禁 + Commit**

Run: `cd modeling-server && npx vitest run src/feature/LubanCadSchema.test.ts && npx tsc --noEmit && npx eslint "src/feature/**/*.ts"`
Expected: 测试 PASS；tsc/eslint 干净。

```bash
git add modeling-server/src/feature/LubanCadSchema.ts modeling-server/src/feature/LubanCadSchema.test.ts modeling-server/src/feature/test/TestHost.ts
git commit -m "feat(modeling-server): LubanCAD 正式 schema 与 EDE 回调宿主

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 4: FeatureTypeRegistry（T3.1）

**Files:**
- Create: `modeling-server/src/feature/FeatureTypeRegistry.ts`
- Test: `modeling-server/src/feature/FeatureTypeRegistry.test.ts`

**Interfaces:**
- Produces:
  - `interface FeatureTypeDefinition { schema: z.ZodType<ExtrudeParams>; booleanOp: "unite" | "subtract"; requiresUpstream: boolean; }`
  - `registerFeatureType(type: string, def: FeatureTypeDefinition): void`（重复注册抛错）
  - `getFeatureType(type: string): FeatureTypeDefinition`（未知类型抛 `UnknownFeatureTypeError`）
  - `parseFeatureParams(type: string, paramsJson: string): ExtrudeParams`（JSON.parse + zod parse，失败抛带原因 Error）
  - 启动时自动注册 `extrude`(unite/否)、`booleanAdd`(unite/是)、`booleanSubtract`(subtract/是)
- Consumes: `ExtrudeParams` 类型自 `@luban-cad/shared`（Task 1）。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from "vitest";
import { getFeatureType, parseFeatureParams } from "./FeatureTypeRegistry.js";

const good = JSON.stringify({ profile: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], distance: 2 });

describe("FeatureTypeRegistry", () => {
  it("三个内置类型已注册且语义正确", () => {
    expect(getFeatureType("extrude").booleanOp).toBe("unite");
    expect(getFeatureType("extrude").requiresUpstream).toBe(false);
    expect(getFeatureType("booleanAdd").requiresUpstream).toBe(true);
    expect(getFeatureType("booleanSubtract").booleanOp).toBe("subtract");
  });

  it("未知类型抛错", () => {
    expect(() => getFeatureType("nope")).toThrow(/未知特征类型/);
  });

  it("合法参数通过，非法参数被拒（distance<=0 / 轮廓点不足 / 坏 JSON）", () => {
    expect(parseFeatureParams("extrude", good).distance).toBe(2);
    expect(() => parseFeatureParams("extrude", JSON.stringify({ profile: [{ x: 0, y: 0 }], distance: 1 }))).toThrow();
    expect(() => parseFeatureParams("extrude", JSON.stringify({ profile: [], distance: -1 }))).toThrow();
    expect(() => parseFeatureParams("extrude", "not json")).toThrow();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd modeling-server && npx vitest run src/feature/FeatureTypeRegistry.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

```ts
/** 特征类型注册表（roadmap T3.1）：MS 层 zod 校验 + 求值语义元数据。 */
import { z } from "zod";
import type { ExtrudeParams } from "@luban-cad/shared";

export interface FeatureTypeDefinition {
  schema: z.ZodType<ExtrudeParams>;
  booleanOp: "unite" | "subtract";
  requiresUpstream: boolean;
}

export class UnknownFeatureTypeError extends Error {
  public constructor(public readonly featureType: string) {
    super(`未知特征类型: ${featureType}`);
  }
}

const point2d = z.object({ x: z.number(), y: z.number() });
const extrudeSchema = z.object({ profile: z.array(point2d).min(3), distance: z.number().positive() });

const registry = new Map<string, FeatureTypeDefinition>();

export function registerFeatureType(type: string, def: FeatureTypeDefinition): void {
  if (registry.has(type))
    throw new Error(`特征类型重复注册: ${type}`);
  registry.set(type, def);
}

export function getFeatureType(type: string): FeatureTypeDefinition {
  const def = registry.get(type);
  if (!def)
    throw new UnknownFeatureTypeError(type);
  return def;
}

export function parseFeatureParams(type: string, paramsJson: string): ExtrudeParams {
  const def = getFeatureType(type);
  let raw: unknown;
  try {
    raw = JSON.parse(paramsJson);
  } catch {
    throw new Error(`参数不是合法 JSON: ${paramsJson.slice(0, 100)}`);
  }
  return def.schema.parse(raw) as ExtrudeParams;
}

// 内置类型（模块导入即注册；测试/服务共用）
registerFeatureType("extrude", { schema: extrudeSchema, booleanOp: "unite", requiresUpstream: false });
registerFeatureType("booleanAdd", { schema: extrudeSchema, booleanOp: "unite", requiresUpstream: true });
registerFeatureType("booleanSubtract", { schema: extrudeSchema, booleanOp: "subtract", requiresUpstream: true });
```

- [ ] **Step 4: 跑测试通过 + 门禁 + Commit**

Run: `cd modeling-server && npx vitest run src/feature/FeatureTypeRegistry.test.ts && npx tsc --noEmit && npx eslint "src/feature/**/*.ts"`

```bash
git add modeling-server/src/feature/FeatureTypeRegistry.ts modeling-server/src/feature/FeatureTypeRegistry.test.ts
git commit -m "feat(modeling-server): FeatureTypeRegistry——zod 参数校验+求值语义元数据（T3.1）

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 5: FeatureEngine——求值/回调/冷重建（T3.2/T3.3/T3.6 核心）

**Files:**
- Create: `modeling-server/src/feature/FeatureEngine.ts`
- Test: `modeling-server/src/feature/FeatureEngine.test.ts`

**Interfaces:**
- Consumes: Task 3 全部助手；Task 4 registry。
- Produces:
  - `FeatureEngine.bind()`（调用 `bindFeatureEngine` 接管回调；幂等）
  - `FeatureEngine.cache: Map<Id64String, ElementGeometryDataEntry[]>`（模块级，M1 单库够用）
  - `FeatureEngine.evaluateFeature(db, featureId): void`（同步；含直通抑制；失败抛错——由调用方 catch 标记）
  - `FeatureEngine.markFailed(txn, featureId)` / `clearFailed(txn, featureId)`
  - `FeatureEngine.rebuildAll(db): void`（自建 EditTxn 全链重建并写 body）
  - `readBodyGeometry(db, bodyId): GeometryStreamProps`、`countBRepEntries(geom): number`

- [ ] **Step 1: 写失败测试（StandaloneDb 集成，形态对齐 spike）**

```ts
// modeling-server/src/feature/FeatureEngine.test.ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { Id64String } from "@itwin/core-bentley";
import { EditTxn, StandaloneDb } from "@itwin/core-backend";
import { ensureHostStarted, makeTempDir } from "./test/TestHost.js";
import {
  countBRepEntries, createFeatureModels, FeatureEngine, insertBodySolidElement, insertFeatureDrive,
  insertFeatureElement, LubanCadSchema, queryBodySolid, rebuildAll, readBodyGeometry,
} from "./FeatureEngine.js";

const square = (s: number, cx = 0, cy = 0) => [
  { x: cx - s / 2, y: cy - s / 2 }, { x: cx + s / 2, y: cy - s / 2 },
  { x: cx + s / 2, y: cy + s / 2 }, { x: cx - s / 2, y: cy + s / 2 },
];
const p = (profile: Array<{x:number,y:number}>, distance: number) => JSON.stringify({ profile, distance });

describe("FeatureEngine", () => {
  let dir: string; let db: StandaloneDb; let txn: EditTxn;
  let f1: Id64String; let f2: Id64String; let body: Id64String;

  beforeAll(async () => {
    await ensureHostStarted();
    LubanCadSchema.register();
    FeatureEngine.bind();
    dir = makeTempDir("engine-");
    db = StandaloneDb.createEmpty(path.join(dir, "t.bim"), { rootSubject: { name: "T" }, enableTransactions: true });
    await LubanCadSchema.importTo(db);
    txn = new EditTxn(db, "setup"); txn.start();
    const ctx = await createFeatureModels(txn);
    f1 = await insertFeatureElement(txn, ctx, { featureType: "extrude", orderKey: 1, params: p(square(2), 1) });
    f2 = await insertFeatureElement(txn, ctx, { featureType: "booleanSubtract", orderKey: 2, params: p(square(0.5), 3) });
    body = await insertBodySolidElement(txn, ctx);
    insertFeatureDrive(txn, f1, f2);
    insertFeatureDrive(txn, f2, body);
    txn.saveChanges("build graph"); // EDE 传播在此触发
  }, 180_000);

  afterAll(() => {
    if (txn.isActive) txn.end("abandon");
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("建链即求值：BodySolid 含内核 BRep", () => {
    expect(countBRepEntries(readBodyGeometry(db, body!))).toBeGreaterThan(0);
  });

  it("改 f1 距离 → 全链再生，body 几何变化", async () => {
    const before = JSON.stringify(readBodyGeometry(db, body!));
    await txn.iModel.locks.acquireLocks({ exclusive: f1 });
    txn.updateElement({ id: f1, params: p(square(4), 2) });
    txn.saveChanges("edit f1");
    expect(JSON.stringify(readBodyGeometry(db, body!))).not.toEqual(before);
  });

  it("失败级联+自愈：坏参数→status=1+旧几何保留；修复→恢复", async () => {
    const before = JSON.stringify(readBodyGeometry(db, body!));
    await txn.iModel.locks.acquireLocks({ exclusive: f2 });
    txn.updateElement({ id: f2, params: p(square(0.5), -3) }); // distance<=0 非法
    txn.saveChanges("bad f2");
    expect(db.elements.getElementProps<{ status: number }>({ id: f2 }).status).toBe(1);
    expect(JSON.stringify(readBodyGeometry(db, body!))).toEqual(before);
    await txn.iModel.locks.acquireLocks({ exclusive: f2 });
    txn.updateElement({ id: f2, params: p(square(0.5), 3) });
    txn.saveChanges("fix f2");
    expect(db.elements.getElementProps<{ status: number }>({ id: f2 }).status).toBe(0);
  });

  it("抑制=直通：f2 suppressed → body 等于仅 f1 的形状", async () => {
    await txn.iModel.locks.acquireLocks({ exclusive: f2 });
    txn.updateElement({ id: f2, suppressed: true });
    txn.saveChanges("suppress f2");
    const suppressedGeom = JSON.stringify(readBodyGeometry(db, body!));
    expect(suppressedGeom).not.toEqual("");
    // 冷重建同样直通（见下一用例的对照）
    await txn.iModel.locks.acquireLocks({ exclusive: f2 });
    txn.updateElement({ id: f2, suppressed: false });
    txn.saveChanges("unsuppress f2");
  });

  it("冷重建：清缓存后 rebuildAll 恢复到与热链一致的几何", () => {
    const warm = JSON.stringify(readBodyGeometry(db, body!));
    FeatureEngine.cache.clear();
    rebuildAll(db);
    expect(FeatureEngine.cache.has(f1!)).toBe(true);
    expect(JSON.stringify(readBodyGeometry(db, queryBodySolid(db)!))).toEqual(warm);
  });
});
```

注意：`txn.updateElement({ id: f1, params: ... })` 若 TS 类型不匹配（Partial 泛型推断），按 spike 的写法 `txn.updateElement<FeatureProps>({ ... })`，FeatureProps 从 LubanCadSchema.ts 导入。写测试时直接用泛型形式。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd modeling-server && npx vitest run src/feature/FeatureEngine.test.ts`
Expected: FAIL（FeatureEngine.ts 不存在）。

- [ ] **Step 3: 实现 FeatureEngine.ts**

```ts
/**
 * 特征求值引擎（roadmap T3.2/T3.3/T3.6）。
 * 内核路径（spike X1 实证）：appendGeometryQuery → IModelDb.createBRepGeometry → elementGeometryBuilderParams 写回。
 * 中间特征输出只进内存缓存（形态 Y）；冷启动靠 rebuildAll 全量重建（第一设计律）。
 */
import { Id64String, IModelStatus } from "@itwin/core-bentley";
import {
  BRepGeometryInfo, BRepGeometryOperation, ElementGeometry, ElementGeometryDataEntry, GeometricElement3dProps,
  GeometryStreamProps,
} from "@itwin/core-common";
import { LineSegment3d, LineString3d, Loop, Point3d } from "@itwin/core-geometry";
import { EditTxn, IModelDb, OnElementDependencyArg } from "@itwin/core-backend";
import type { ExtrudeParams } from "@luban-cad/shared";
import {
  bindFeatureEngine, FeatureProps, insertFeatureElement, LubanCadSchema, queryAllFeatures, queryBodySolid,
  queryFeatureSources,
} from "./LubanCadSchema.js";
import { parseFeatureParams } from "./FeatureTypeRegistry.js";

/** 特征输出缓存（M1：模块级单库；多库/会话隔离是 T3.9+ 的事） */
export const featureOutputCache = new Map<Id64String, ElementGeometryDataEntry[]>();

function runKernel(db: IModelDb, operation: BRepGeometryOperation, entryArray: ElementGeometryDataEntry[]): ElementGeometryDataEntry[] {
  let out: ElementGeometryDataEntry[] | undefined;
  const status = db.createBRepGeometry({
    operation, entryArray,
    onResult: (info: BRepGeometryInfo) => { out = info.entryArray; },
  });
  if (status !== IModelStatus.Success || undefined === out || 0 === out.length)
    throw new Error(`内核 op 失败: op=${operation} status=${status}`);
  return out;
}

/** 轮廓拉伸成体：Sweep(profile, line path along +Z)。 */
function sweepProfile(db: IModelDb, params: ExtrudeParams): ElementGeometryDataEntry[] {
  const b = new ElementGeometry.Builder();
  const pts = params.profile.map((pt) => Point3d.create(pt.x, pt.y, 0));
  if (pts.length > 1 && pts[0].isAlmostEqual(pts[pts.length - 1]))
    pts.pop(); // 闭合点去重
  b.appendGeometryQuery(Loop.create(LineString3d.create(pts)));
  const profileEntry = b.entries[0];
  b.entries.length = 0;
  b.appendGeometryQuery(LineSegment3d.create(Point3d.create(0, 0, 0), Point3d.create(0, 0, params.distance)));
  return runKernel(db, BRepGeometryOperation.Sweep, [profileEntry, b.entries[0]]);
}

/** 求值单个特征（同步，EDE 回调与 rebuildAll 共用）。失败抛异常，由调用方 catch。 */
export function evaluateFeature(db: IModelDb, featureId: Id64String): void {
  const props = db.elements.getElementProps<FeatureProps>({ id: featureId });
  const upstreamIds = queryFeatureSources(db, featureId);
  const upstreamEntries = upstreamIds.map((id) => {
    const e = featureOutputCache.get(id);
    if (undefined === e)
      throw new Error(`上游输出缺失（上游失败或缓存冷）: ${id}`);
    return e;
  }).flat();

  if (props.suppressed) {
    featureOutputCache.set(featureId, upstreamEntries); // 直通（Design Note #2）
    return;
  }

  const def = parseFeatureParams(props.featureType, props.params);
  if (0 === upstreamEntries.length && def.requiresUpstream)
    throw new Error(`${props.featureType} 需要上游特征`);

  const tool = sweepProfile(db, def);
  if (0 === upstreamEntries.length) {
    featureOutputCache.set(featureId, tool);
    return;
  }
  const op = def.booleanOp === "subtract" ? BRepGeometryOperation.Subtract : BRepGeometryOperation.Unite;
  featureOutputCache.set(featureId, runKernel(db, op, [...upstreamEntries, ...tool]));
}

export function markFailed(txn: EditTxn, featureId: Id64String): void {
  txn.updateElement<FeatureProps>({ id: featureId, status: 1 });
}
export function clearFailed(txn: EditTxn, featureId: Id64String): void {
  txn.updateElement<FeatureProps>({ id: featureId, status: 0 });
}

/** Body 写回：任一上游失败/缺失 → 不写（保留旧几何）。 */
function writeBody(arg: OnElementDependencyArg): void {
  const sources = queryFeatureSources(arg.iModel, arg.elId);
  const parts: ElementGeometryDataEntry[] = [];
  for (const srcId of sources) {
    const src = arg.iModel.elements.getElementProps<FeatureProps>({ id: srcId });
    const cached = featureOutputCache.get(srcId);
    if (src.status !== 0 || undefined === cached)
      return; // 失败级联
    parts.push(...cached);
  }
  if (0 === parts.length)
    return;
  arg.indirectEditTxn.updateElement<GeometricElement3dProps>({ id: arg.elId, elementGeometryBuilderParams: { entryArray: parts } });
}

/** 冷启动全链重建（不依赖 EDE——直接按 orderKey 顺序求值）。 */
export function rebuildAll(db: IModelDb): void {
  const txn = new EditTxn(db, "feature cold rebuild");
  txn.start();
  try {
    for (const row of queryAllFeatures(db)) {
      try {
        evaluateFeature(db, row.id);
        clearFailed(txn, row.id);
      } catch {
        markFailed(txn, row.id);
        featureOutputCache.delete(row.id);
      }
    }
    const bodyId = queryBodySolid(db);
    if (bodyId) {
      const last = queryAllFeatures(db).filter((r) => r.status === 0).at(-1);
      const entries = last ? featureOutputCache.get(last.id) : undefined;
      if (entries?.length)
        txn.updateElement<GeometricElement3dProps>({ id: bodyId, elementGeometryBuilderParams: { entryArray: entries } });
    }
    txn.saveChanges("cold rebuild");
  } catch (e) {
    txn.end("abandon");
    throw e;
  }
}

export function readBodyGeometry(db: IModelDb, bodyId: Id64String): GeometryStreamProps {
  const props = db.elements.getElementProps<GeometricElement3dProps>({ id: bodyId, wantGeometry: true, wantBRepData: true });
  return props.geom ?? [];
}
export function countBRepEntries(geom: GeometryStreamProps): number {
  return geom.filter((e) => undefined !== e.brep).length;
}

let bound = false;
/** 接管 EDE 回调（幂等）。必须在任何 saveChanges 前调用。 */
export function bindFeatureEngineCallbacks(): void {
  if (bound) return;
  bound = true;
  bindFeatureEngine({
    onFeatureNode(arg, phase) {
      void phase;
      try {
        evaluateFeature(arg.iModel, arg.elId);
        clearFailed(arg.indirectEditTxn, arg.elId);
      } catch {
        markFailed(arg.indirectEditTxn, arg.elId);
        featureOutputCache.delete(arg.elId);
      }
    },
    onBodyNode: writeBody,
  });
}

/** 便捷聚合导出（测试用）。 */
export const FeatureEngine = {
  bind: bindFeatureEngineCallbacks,
  cache: featureOutputCache,
  evaluateFeature, markFailed, clearFailed, rebuildAll, readBodyGeometry, countBRepEntries,
};
```

（若导入名与测试解构冲突——测试从 `./FeatureEngine.js` 导入 `FeatureEngine, rebuildAll, readBodyGeometry, countBRepEntries` 等——保持命名导出 + 聚合对象并存即可，测试文件按聚合对象取用也行，二选一后在两侧统一。）

- [ ] **Step 4: 跑测试通过 + 门禁 + Commit**

Run: `cd modeling-server && npx vitest run src/feature/FeatureEngine.test.ts && npx tsc --noEmit && npx eslint "src/feature/**/*.ts"`

```bash
git add modeling-server/src/feature/FeatureEngine.ts modeling-server/src/feature/FeatureEngine.test.ts
git commit -m "feat(modeling-server): 特征求值引擎——EDE 回调/内核调用/直通抑制/冷重建（T3.2/T3.3/T3.6）

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 6: OpLog（T5.2 + T5.3 数据层）

**Files:**
- Create: `modeling-server/src/feature/OpLog.ts`
- Test: `modeling-server/src/feature/OpLog.test.ts`

**Interfaces:**
- Consumes: Task 3 schema（OpLogEntry 类、defModel）。
- Produces:
  - `interface OpLogRow { id: Id64String; opType: string; payload: OpPayload; undone: boolean; discarded: boolean; }`
  - `interface OpPayload { featureId?: Id64String; featureType?: string; oldParams?: string; newParams?: string; user?: string; }`
  - `insertOpLogEntry(txn, db, entry: { opType: string; payload: OpPayload }): Id64String`
  - `queryOpLog(db): OpLogRow[]`（ECInstanceId 升序）
  - `markOpUndone(txn, id)` / `markOpDiscarded(txn, ids: Id64String[])`
  - 撤销栈算法（纯函数，可测）：`findUndoTarget(rows): OpLogRow | undefined`（最新一条 `!undone && !discarded && opType==="updateParams"`）；`findRedoTarget(rows): OpLogRow | undefined`（尾部连续 `undone && !discarded` 段的**最旧**一条，且为 updateParams）；`findToDiscard(rows): Id64String[]`（所有 `undone && !discarded`）。

- [ ] **Step 1: 写失败测试**

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { EditTxn, StandaloneDb } from "@itwin/core-backend";
import { ensureHostStarted, makeTempDir } from "./test/TestHost.js";
import { createFeatureModels, LubanCadSchema } from "./LubanCadSchema.js";
import { findRedoTarget, findToDiscard, findUndoTarget, insertOpLogEntry, markOpDiscarded, markOpUndone, queryOpLog } from "./OpLog.js";

describe("OpLog", () => {
  let dir: string; let db: StandaloneDb; let txn: EditTxn; let defModelId: string;

  beforeAll(async () => {
    await ensureHostStarted();
    LubanCadSchema.register();
    dir = makeTempDir("oplog-");
    db = StandaloneDb.createEmpty(path.join(dir, "t.bim"), { rootSubject: { name: "T" }, enableTransactions: true });
    await LubanCadSchema.importTo(db);
    txn = new EditTxn(db, "s"); txn.start();
    defModelId = (await createFeatureModels(txn)).defModelId;
  }, 120_000);
  afterAll(() => { if (txn.isActive) txn.end("abandon"); db.close(); fs.rmSync(dir, { recursive: true, force: true }); });

  it("插入与查询 roundtrip；顺序稳定", () => {
    insertOpLogEntry(txn, db, { opType: "updateParams", payload: { featureId: "0x1", oldParams: "{}", newParams: "{\"a\":1}", user: "u" } });
    insertOpLogEntry(txn, db, { opType: "insertFeature", payload: { featureId: "0x2", featureType: "extrude", newParams: "{}" } });
    txn.saveChanges("log");
    const rows = queryOpLog(db);
    expect(rows.map((r) => r.opType)).toEqual(["updateParams", "insertFeature"]);
    expect(rows[0].payload.newParams).toBe("{\"a\":1}");
    expect(rows[0].undone).toBe(false);
  });

  it("撤销栈算法：undo 取最新可逆；redo 取尾部撤销段最旧；discard 全部已撤销", () => {
    const mk = (id: string, undone = false, discarded = false): never => ({ id, opType: "updateParams", payload: {}, undone, discarded }) as never;
    const rows = [mk("a"), mk("b"), mk("c"), mk("d"), mk("e"), mk("f")];
    expect(findUndoTarget(rows as never)?.id ?? (findUndoTarget(rows as never) && String((findUndoTarget(rows as never) as { id: string }).id))).toBeTruthy();
    // 具体断言用 helper 比较直白：
    const idOf = (r: unknown) => String((r as { id: string }).id);
    expect(idOf(findUndoTarget(rows as never))).toBe("f");
    const undoneRows = [mk("a"), mk("b"), mk("c", true), mk("d", true)];
    expect(idOf(findUndoTarget(undoneRows as never))).toBe("b");
    expect(idOf(findRedoTarget(undoneRows as never))).toBe("c");
    expect(findToDiscard(undoneRows as never).map(idOf)).toEqual(["c", "d"]);
  });

  it("markOpUndone/markOpDiscarded 持久化", async () => {
    const rows = queryOpLog(db);
    await txn.iModel.locks.acquireLocks({ exclusive: rows[0].id });
    markOpUndone(txn, rows[0].id);
    txn.saveChanges("mark");
    expect(queryOpLog(db)[0].undone).toBe(true);
    markOpDiscarded(txn, [queryOpLog(db)[0].id]);
    txn.saveChanges("discard");
    expect(queryOpLog(db)[0].discarded).toBe(true);
  });
});
```

（第二个用例的 `mk` 类型转换繁琐处可简化：把 `OpLogRow` 的 id 类型在测试里直接用 `string` 字面量构造，必要时将算法函数签名写为接受 `{ id: Id64String | string }` 兼容形态——以实现侧签名为准，测试适配之。）

- [ ] **Step 2: 跑测试确认失败**

Run: `cd modeling-server && npx vitest run src/feature/OpLog.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现 OpLog.ts**

```ts
/** op 日志（roadmap T5.2/T5.3）：append-only 元素 + 线性撤销栈语义。与 op 同一 txn 写入。 */
import { DbResult, Id64String } from "@itwin/core-bentley";
import { Code } from "@itwin/core-common";
import { EditTxn, IModelDb } from "@itwin/core-backend";
import { LubanOpLogEntry } from "./LubanCadSchema.js";

export interface OpPayload {
  featureId?: Id64String;
  featureType?: string;
  oldParams?: string;
  newParams?: string;
  user?: string;
}
export interface OpLogRow { id: Id64String; opType: string; payload: OpPayload; undone: boolean; discarded: boolean; }

export function insertOpLogEntry(txn: EditTxn, db: IModelDb, entry: { opType: string; payload: OpPayload }): Id64String {
  // OpLogEntry 落在 repositoryModel（不建专用 model，避免多余脚手架）；code 为空。
  const id = txn.insertElement({
    classFullName: LubanOpLogEntry.classFullName,
    model: (db as unknown as { repositoryModelId: Id64String }).repositoryModelId,
    code: Code.createEmpty(),
    userLabel: new Date().toISOString(),
    opType: entry.opType,
    payload: JSON.stringify(entry.payload),
    undone: false,
    discarded: false,
  } as never);
  return id;
}

export function queryOpLog(db: IModelDb): OpLogRow[] {
  const out: OpLogRow[] = [];
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  db.withPreparedStatement(
    `SELECT ECInstanceId, opType, payload, undone, discarded FROM LubanCAD.OpLogEntry ORDER BY ECInstanceId`,
    (stmt) => {
      while (stmt.step() === DbResult.BE_SQLITE_ROW) {
        out.push({
          id: stmt.getValue(0).getId(), opType: stmt.getValue(1).getString(),
          payload: JSON.parse(stmt.getValue(2).getString()) as OpPayload,
          undone: stmt.getValue(3).getInteger() !== 0, discarded: stmt.getValue(4).getInteger() !== 0,
        });
      }
    });
  return out;
}

export function markOpUndone(txn: EditTxn, id: Id64String): void {
  txn.updateElement({ id, undone: true });
}
export function markOpDiscarded(txn: EditTxn, ids: Id64String[]): void {
  for (const id of ids)
    txn.updateElement({ id, discarded: true });
}

// ---- 撤销栈算法（纯函数） ----
const invertible = (r: OpLogRow) => r.opType === "updateParams";

export function findUndoTarget(rows: OpLogRow[]): OpLogRow | undefined {
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (r.discarded) continue;
    if (!r.undone)
      return invertible(r) ? r : undefined; // 最新活动 op 不可逆 → undo 失败
  }
  return undefined;
}

export function findRedoTarget(rows: OpLogRow[]): OpLogRow | undefined {
  let i = rows.length - 1;
  while (i >= 0 && rows[i].undone && !rows[i].discarded) i--;
  const suffix = rows.slice(i + 1).filter((r) => !r.discarded);
  const target = suffix[0]; // 撤销段最旧一条
  return target && invertible(target) ? target : undefined;
}

export function findToDiscard(rows: OpLogRow[]): Id64String[] {
  return rows.filter((r) => r.undone && !r.discarded).map((r) => r.id);
}
```

注意：`txn.updateElement({ id, undone: true })` 类型不通时用 `txn.updateElement<{ id: Id64String; undone: boolean } & DefinitionElementProps>` 之类按 EditTxn 泛型签名适配（参考 Task 5 markFailed 的写法，必要时给 OpLogRow 定义对应的 Props 接口 `OpLogEntryProps` 放在 LubanCadSchema.ts 并导出）。

- [ ] **Step 4: 跑测试通过 + 门禁 + Commit**

Run: `cd modeling-server && npx vitest run src/feature/OpLog.test.ts && npx tsc --noEmit && npx eslint "src/feature/**/*.ts"`

```bash
git add modeling-server/src/feature/OpLog.ts modeling-server/src/feature/OpLog.test.ts
git commit -m "feat(modeling-server): op 日志元素+线性撤销栈算法（T5.2/T5.3 数据层）

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 7: FeatureService——applyOp（T3.7 + T5.1）

**Files:**
- Create: `modeling-server/src/feature/FeatureService.ts`
- Test: `modeling-server/src/feature/FeatureService.test.ts`

**Interfaces:**
- Consumes: Task 3/4/5/6 全部；Task 2 `writeLeases`。
- Produces:
  - `class FeatureService`：`constructor(db: IModelDb, dbKey: string, opts?: { push?: (description: string) => Promise<void> } )`
  - `static for(dbKey, db, opts?): FeatureService`（模块级缓存单例）
  - `async ensureInitialized(): Promise<void>`（schema 导入+模型/BodySolid 就绪+绑回调+冷重建）
  - `async applyOp(sessionId, op: FeatureOp): Promise<FeatureOpResult>`
  - `getTree(): FeatureTreeEntry[]`
  - `async undo(sessionId) / redo(sessionId): Promise<FeatureOpResult>`
  - 内部：`ensureWarm()`（cache 空 && 有特征 → rebuildAll）

- [ ] **Step 1: 写失败测试（StandaloneDb、无 push）**

```ts
// modeling-server/src/feature/FeatureService.test.ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { StandaloneDb } from "@itwin/core-backend";
import { ensureHostStarted, makeTempDir } from "./test/TestHost.js";
import { FeatureService } from "./FeatureService.js";
import { writeLeases } from "./WriteLease.js";
import type { ExtrudeParams } from "@luban-cad/shared";

const square = (s: number) => [{ x: 0, y: 0 }, { x: s, y: 0 }, { x: s, y: s }, { x: 0, y: s }];
const params = (s: number, d: number): ExtrudeParams => ({ profile: square(s), distance: d });

describe("FeatureService.applyOp", () => {
  let dir: string; let db: StandaloneDb; let svc: FeatureService;

  beforeAll(async () => {
    await ensureHostStarted();
    dir = makeTempDir("svc-");
    db = StandaloneDb.createEmpty(path.join(dir, "t.bim"), { rootSubject: { name: "T" }, enableTransactions: true });
    svc = FeatureService.for("test:db", db);
    await svc.ensureInitialized();
    writeLeases.acquire("test:db", "sess1", "alice");
  }, 180_000);
  afterAll(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });

  it("无租约的会话被拒", async () => {
    const r = await svc.applyOp("sess2", { kind: "insertFeature", featureType: "extrude", params: params(2, 1) });
    expect(r).toEqual({ ok: false, error: expect.stringContaining("写租约") });
  });

  it("insertFeature → 树+几何就绪；非法参数被拒且不入树", async () => {
    const bad = await svc.applyOp("sess1", { kind: "insertFeature", featureType: "extrude", params: { profile: [{ x: 0, y: 0 }], distance: 1 } as never });
    expect(bad.ok).toBe(false);
    const r = await svc.applyOp("sess1", { kind: "insertFeature", featureType: "extrude", params: params(2, 1) });
    expect(r.ok).toBe(true);
    expect(svc.getTree().length).toBe(1);
    expect(svc.getTree()[0].featureType).toBe("extrude");
  });

  it("updateParams → 几何变化（EDE 传播）", async () => {
    const fid = svc.getTree()[0].id;
    const before = JSON.stringify(svc.readBodyGeomForTest());
    const r = await svc.applyOp("sess1", { kind: "updateParams", featureId: fid, params: params(4, 2) });
    expect(r.ok).toBe(true);
    expect(JSON.stringify(svc.readBodyGeomForTest())).not.toEqual(before);
  });

  it("deleteFeature 仅允许删链尾", async () => {
    await svc.applyOp("sess1", { kind: "insertFeature", featureType: "booleanSubtract", params: params(0.5, 3) });
    const tree = svc.getTree();
    const r1 = await svc.applyOp("sess1", { kind: "deleteFeature", featureId: tree[0].id }); // 非链尾
    expect(r1.ok).toBe(false);
    const r2 = await svc.applyOp("sess1", { kind: "deleteFeature", featureId: tree[1].id });
    expect(r2.ok).toBe(true);
    expect(svc.getTree().length).toBe(1);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd modeling-server && npx vitest run src/feature/FeatureService.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现 FeatureService.ts**

```ts
/**
 * 特征服务（roadmap T3.7/T5.1）：op 入口。一切写库经 EditTxn+saveChanges（硬约束）。
 * op 序列：校验 → ensureWarm → txn(变更+oplog) → saveChanges(EDE 传播) → push(可选)。
 */
import { Id64String } from "@itwin/core-bentley";
import { EditTxn, IModelDb } from "@itwin/core-backend";
import type { FeatureOp, FeatureOpResult, FeatureTreeEntry } from "@luban-cad/shared";
import {
  bindFeatureEngineCallbacks, featureOutputCache, rebuildAll,
} from "./FeatureEngine.js";
import {
  createFeatureModels, FeatureProps, insertBodySolidElement, insertFeatureDrive, insertFeatureElement,
  LubanCadSchema, queryAllFeatures, queryBodySolid, queryFeatureDriveEdge,
} from "./LubanCadSchema.js";
import { parseFeatureParams } from "./FeatureTypeRegistry.js";
import { insertOpLogEntry } from "./OpLog.js";
import { writeLeases } from "./WriteLease.js";

export interface FeatureServiceOpts { push?: (description: string) => Promise<void>; }

const services = new Map<string, FeatureService>();
export function getFeatureService(dbKey: string, db: IModelDb, opts?: FeatureServiceOpts): FeatureService {
  let s = services.get(dbKey);
  if (!s) {
    s = new FeatureService(db, dbKey, opts);
    services.set(dbKey, s);
  }
  return s;
}

export class FeatureService {
  private ctx?: { defModelId: Id64String; physModelId: Id64String; categoryId: Id64String };
  private bodyId?: Id64String;

  public constructor(private readonly db: IModelDb, public readonly dbKey: string, private readonly opts: FeatureServiceOpts = {}) {}

  public static for(dbKey: string, db: IModelDb, opts?: FeatureServiceOpts): FeatureService {
    return getFeatureService(dbKey, db, opts);
  }

  public async ensureInitialized(): Promise<void> {
    LubanCadSchema.register();
    bindFeatureEngineCallbacks();
    await LubanCadSchema.importTo(this.db);
    if (!queryBodySolid(this.db)) {
      const txn = new EditTxn(this.db, "partstudio init");
      txn.start();
      this.ctx = await createFeatureModels(txn);
      this.bodyId = await insertBodySolidElement(txn, this.ctx);
      txn.saveChanges("init PartStudio");
    }
    this.ensureWarm();
  }

  private ensureWarm(): void {
    if (0 === queryAllFeatures(this.db).length)
      return;
    // 有特征但缓存空（进程重启/首次）→ 全链冷重建
    const anyWarm = queryAllFeatures(this.db).some((r) => featureOutputCache.has(r.id));
    if (!anyWarm)
      rebuildAll(this.db);
  }

  public getTree(): FeatureTreeEntry[] {
    return queryAllFeatures(this.db).map((r) => ({
      id: r.id, featureType: r.featureType, orderKey: r.orderKey,
      suppressed: r.suppressed, status: r.status,
      params: JSON.parse(r.params),
    }));
  }

  public async applyOp(sessionId: string, op: FeatureOp): Promise<FeatureOpResult> {
    try {
      writeLeases.assertHeld(this.dbKey, sessionId);
      if (op.kind === "undo") return await this.undoInternal();
      if (op.kind === "redo") return await this.redoInternal();

      this.ensureWarm();
      const txn = new EditTxn(this.db, `feature op: ${op.kind}`);
      txn.start();
      try {
        if (op.kind === "insertFeature") {
          const def = parseFeatureParams(op.featureType, JSON.stringify(op.params)); // 校验（抛错=拒收）
          const nextOrder = (queryAllFeatures(this.db).at(-1)?.orderKey ?? 0) + 1;
          this.lazyCtx(txn);
          const featureId = await insertFeatureElement(txn, this.ctx!, {
            featureType: op.featureType, orderKey: nextOrder, params: JSON.stringify(op.params),
          });
          const prev = queryAllFeatures(this.db).filter((r) => r.id !== featureId).at(-1);
          if (prev) {
            const edgeToBody = queryFeatureDriveEdge(this.db, prev.id, this.bodyId!);
            if (edgeToBody) txn.deleteRelationship(edgeToBody);
            insertFeatureDrive(txn, prev.id, featureId);
          }
          insertFeatureDrive(txn, featureId, this.bodyId!);
          insertOpLogEntry(txn, this.db, { opType: "insertFeature", payload: { featureId, featureType: op.featureType, newParams: JSON.stringify(op.params) } });
          txn.saveChanges(`insert ${op.featureType}`);
          await this.maybePush(`luban:insertFeature:${op.featureType}`);
          return { ok: true, featureId };
        }

        if (op.kind === "updateParams") {
          const props = this.db.elements.getElementProps<FeatureProps>({ id: op.featureId });
          parseFeatureParams(props.featureType, JSON.stringify(op.params)); // 校验
          await this.db.locks.acquireLocks({ exclusive: op.featureId });
          txn.updateElement<FeatureProps>({ id: op.featureId, params: JSON.stringify(op.params) });
          insertOpLogEntry(txn, this.db, { opType: "updateParams", payload: { featureId: op.featureId, featureType: props.featureType, oldParams: props.params, newParams: JSON.stringify(op.params) } });
          txn.saveChanges(`update ${props.featureType}`);
          await this.maybePush("luban:updateParams");
          return { ok: true, featureId: op.featureId };
        }

        if (op.kind === "deleteFeature") {
          const rows = queryAllFeatures(this.db);
          const idx = rows.findIndex((r) => r.id === op.featureId);
          if (idx < 0) return { ok: false, error: "特征不存在" };
          if (idx !== rows.length - 1) return { ok: false, error: "M1 仅允许删除链尾特征" };
          await this.db.locks.acquireLocks({ exclusive: op.featureId });
          const prev = rows[idx - 1];
          const edgeToBody = queryFeatureDriveEdge(this.db, op.featureId, this.bodyId!);
          if (edgeToBody) txn.deleteRelationship(edgeToBody);
          if (prev) insertFeatureDrive(txn, prev.id, this.bodyId!);
          txn.deleteElement(op.featureId);
          featureOutputCache.delete(op.featureId);
          insertOpLogEntry(txn, this.db, { opType: "deleteFeature", payload: { featureId: op.featureId } });
          txn.saveChanges("deleteFeature");
          await this.maybePush("luban:deleteFeature");
          return { ok: true, featureId: op.featureId };
        }
        return { ok: false, error: `未知 op: ${(op as { kind: string }).kind}` };
      } catch (e) {
        if (txn.isActive) txn.end("abandon");
        throw e;
      }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  private async undoInternal(): Promise<FeatureOpResult> {
    const { findUndoTarget, findToDiscard, markOpUndone, markOpDiscarded, queryOpLog } = await import("./OpLog.js");
    const rows = queryOpLog(this.db);
    const target = findUndoTarget(rows);
    if (!target) return { ok: false, error: "无可撤销的操作（M1 仅支持参数修改的撤销）" };
    const txn = new EditTxn(this.db, "undo");
    txn.start();
    await this.db.locks.acquireLocks({ exclusive: target.payload.featureId! });
    txn.updateElement<FeatureProps>({ id: target.payload.featureId!, params: target.payload.oldParams! });
    markOpUndone(txn, target.id);
    txn.saveChanges("undo");
    await this.maybePush("luban:undo");
    return { ok: true };
  }

  private async redoInternal(): Promise<FeatureOpResult> {
    const { findRedoTarget, markOpUndone, queryOpLog } = await import("./OpLog.js");
    const rows = queryOpLog(this.db);
    const target = findRedoTarget(rows);
    if (!target) return { ok: false, error: "无可重做的操作" };
    const txn = new EditTxn(this.db, "redo");
    txn.start();
    await this.db.locks.acquireLocks({ exclusive: target.payload.featureId! });
    txn.updateElement<FeatureProps>({ id: target.payload.featureId!, params: target.payload.newParams! });
    markOpUndone(txn, target.id); // undone=false 即重做完成（复用同字段）
    txn.saveChanges("redo");
    await this.maybePush("luban:redo");
    return { ok: true };
  }

  private async maybePush(description: string): Promise<void> {
    if (this.opts.push)
      await this.opts.push(description);
  }

  private lazyCtx(txn: EditTxn): void {
    if (!this.ctx || !this.bodyId) {
      this.bodyId = queryBodySolid(this.db)!;
      // ctx 仅在建模型时需要；已初始化路径下用查询补
      this.ctx ??= { defModelId: queryDefModelId(this.db), physModelId: queryPhysModelId(this.db), categoryId: 0 as Id64String };
      void txn;
    }
  }

  /** @internal 测试辅助 */
  public readBodyGeomForTest(): unknown {
    const { readBodyGeometry } = require("./FeatureEngine.js") as typeof import("./FeatureEngine.js");
    return readBodyGeometry(this.db, queryBodySolid(this.db)!);
  }
}
```

实现注意（执行者必读）：
- `markOpUndone(txn, id)` 用于 redo 时语义是「置 undone=false」——把 OpLog.ts 的签名改为 `setOpUndone(txn, id, undone: boolean)`，undo 传 true、redo 传 false，测试同步改。**以 `setOpUndone` 为准**（Task 6 若已按 `markOpUndone` 实现并测试，本任务内一并重命名并更新 Task 6 测试，commit 信息注明）。
- `lazyCtx` 里 `categoryId: 0` 是坏味道——正确做法：`createFeatureModels` 后把 ctx 存到 `this.ctx`；`ensureInitialized` 的已存在分支用 ECSQL 查两个 partition 的 userLabel 反查 modelId（`queryModelIdByUserLabel(db, "LubanFeaturePartition")`，加到 LubanCadSchema.ts 并导出；categoryId 不再需要——insertFeatureElement 只在首次建模型后使用，故把 `insertFeatureElement` 的锁获取改为依赖传入 ctx，冷路径之外的调用不发生）。实现时按此收口，不留 `0 as Id64String`。
- ESM 环境没有 `require`——`readBodyGeomForTest` 直接 `import { readBodyGeometry } from "./FeatureEngine.js"` 顶层导入。
- `undoInternal/redoInternal` 里的动态 `import()` 是为了避免环依赖的保守写法；若无环（OpLog 不 import FeatureService，实际没有），改为顶层导入。
- `pushChanges` 后 op 日志/参数/几何同包（同一 saveChanges 提交）。

- [ ] **Step 4: 跑测试通过 + 全量回归 + 门禁 + Commit**

Run: `cd modeling-server && npx vitest run src/feature/ && npx vitest run && npx tsc --noEmit && npx eslint "src/feature/**/*.ts"`

```bash
git add modeling-server/src/feature
git commit -m "feat(modeling-server): FeatureService——applyOp/树查询/租约强制（T3.7/T5.1）

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 8: undo/redo 语义集成 + 跨会话（T5.3 完成面）

**Files:**
- Test: `modeling-server/src/feature/FeatureUndo.test.ts`（纯测试任务，若 Step 1 暴露 Task 6/7 缺陷就地修复实现文件）

**Interfaces:**
- Consumes: `FeatureService.applyOp({kind:"undo"|"redo"})`。

- [ ] **Step 1: 写测试**

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { StandaloneDb } from "@itwin/core-backend";
import { ensureHostStarted, makeTempDir } from "./test/TestHost.js";
import { FeatureService } from "./FeatureService.js";
import { writeLeases } from "./WriteLease.js";
import type { ExtrudeParams } from "@luban-cad/shared";

const params = (s: number, d: number): ExtrudeParams => ({ profile: [{ x: 0, y: 0 }, { x: s, y: 0 }, { x: s, y: s }, { x: 0, y: s }], distance: d });

describe("语义 undo/redo", () => {
  let dir: string; let file: string;
  let svc: FeatureService; let fid: string;

  beforeAll(async () => {
    await ensureHostStarted();
    dir = makeTempDir("undo-"); file = path.join(dir, "t.bim");
    const db = StandaloneDb.createEmpty(file, { rootSubject: { name: "T" }, enableTransactions: true });
    svc = FeatureService.for("undo:db", db);
    await svc.ensureInitialized();
    writeLeases.acquire("undo:db", "s1", "u");
    const r = await svc.applyOp("s1", { kind: "insertFeature", featureType: "extrude", params: params(2, 1) });
    fid = (r as { featureId: string }).featureId!;
    await svc.applyOp("s1", { kind: "updateParams", featureId: fid, params: params(3, 1) });
  }, 180_000);
  afterAll(() => { StandaloneDb.closeAllForTest?.(); fs.rmSync(dir, { recursive: true, force: true }); });

  it("undo 回到旧参数几何；redo 恢复", async () => {
    const g1 = JSON.stringify(svc.readBodyGeomForTest()); // s=3
    const u = await svc.applyOp("s1", { kind: "undo" });
    expect(u.ok).toBe(true);
    const g0 = JSON.stringify(svc.readBodyGeomForTest()); // s=2
    expect(g0).not.toEqual(g1);
    const r = await svc.applyOp("s1", { kind: "redo" });
    expect(r.ok).toBe(true);
    expect(JSON.stringify(svc.readBodyGeomForTest())).toEqual(g1);
  });

  it("跨会话：重开库后 undo 上一会话的操作（op 日志在库内）", async () => {
    await svc.applyOp("s1", { kind: "updateParams", featureId: fid, params: params(5, 1) });
    (svc as unknown as { db: StandaloneDb }).db.close();
    services_clearForTest("undo:db");
    const db2 = StandaloneDb.openEmptyFile?.(file) ?? reopen(file); // 见下注
    const svc2 = FeatureService.for("undo:db", db2);
    await svc2.ensureInitialized(); // 冷重建
    const before = JSON.stringify(svc2.readBodyGeomForTest());
    const u = await svc2.applyOp("s1", { kind: "undo" }); // s1 的租约随进程仍在
    expect(u.ok).toBe(true);
    expect(JSON.stringify(svc2.readBodyGeomForTest())).not.toEqual(before);
  });
});
```

执行注记：`StandaloneDb` 重开用 `StandaloneDb.openFile(file)`（核对 core-backend 的 StandaloneDb 静态方法名，spike 只用了 createEmpty；若叫 `StandaloneDb.openFile`/`open` 以实际为准）；`services_clearForTest` 即给 FeatureService.ts 加 `/** @internal */ export function clearServiceCacheForTest(): void { services.clear(); }` 并在测试内改名导入。写测试时按真实 API 修正这两处，不要留猜的调用。

- [ ] **Step 2: 跑测试，红→绿**

Run: `cd modeling-server && npx vitest run src/feature/FeatureUndo.test.ts`
先确认失败原因真实（如 undo 未实现/字段名不符），修实现至绿。

- [ ] **Step 3: 门禁 + Commit**

```bash
git add modeling-server/src/feature
git commit -m "feat(modeling-server): 语义 undo/redo 集成与跨会话验证（T5.3）

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 9: RPC 实现 + main.ts 接线

**Files:**
- Create: `modeling-server/src/feature/FeatureRpcImpl.ts`
- Modify: `modeling-server/src/main.ts`（RPC 注册；找到 `RpcManager.registerImpl(OpenCloudRpcInterface, OpenCloudRpcImpl)` 一行，在其后仿照添加）
- Test: `modeling-server/src/feature/FeatureRpcImpl.test.ts`

**Interfaces:**
- Consumes: Task 1 接口、Task 7 服务、Task 2 租约。
- Produces: `LubanFeatureRpcImpl`（RpcImpl）；`getFeatureServiceByKey(dbKey): FeatureService`（内部复用 IModelDb.findByKey + push 挂钩 `BriefcaseDb.pushChanges`，token 取 `IModelHost.getAccessToken()`）。

- [ ] **Step 1: 写失败测试（mock IModelDb.findByKey 与 FeatureService 模块）**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@itwin/core-backend", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@itwin/core-backend")>();
  return {
    ...actual,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    IModelDb: { findByKey: vi.fn() },
    // eslint-disable-next-line @typescript-eslint/naming-convention
    IModelHost: { ...(actual as object).IModelHost ? { IModelHost: (actual as { IModelHost: unknown }).IModelHost } : {}, getAccessToken: vi.fn(async () => "t") },
  };
});

vi.mock("./FeatureService.js", () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention
  FeatureService: class {
    public static for = vi.fn(() => ({
      ensureInitialized: vi.fn(async () => {}),
      getTree: vi.fn(() => [{ id: "0x1", featureType: "extrude", orderKey: 1, suppressed: false, status: 0, params: {} }]),
      applyOp: vi.fn(async (_s: string, op: { kind: string }) => ({ ok: op.kind === "insertFeature", featureId: "0x1" })),
      undo: undefined, redo: undefined,
    }));
  },
  getFeatureServiceByKey: vi.fn(() => ({})),
}));

import { LubanFeatureRpcImpl } from "./FeatureRpcImpl.js";
import { writeLeases } from "./WriteLease.js";

describe("LubanFeatureRpcImpl", () => {
  beforeEach(() => writeLeases.releaseAllForTest());

  it("applyFeatureOp 透传服务结果", async () => {
    const impl = new LubanFeatureRpcImpl();
    writeLeases.acquire("k", "sess");
    const r = await impl.applyFeatureOp("k", { kind: "insertFeature", featureType: "extrude", params: { profile: [], distance: 1 } }, "sess");
    expect(r.ok).toBe(true);
  });

  it("租约 API roundtrip", async () => {
    const impl = new LubanFeatureRpcImpl();
    expect((await impl.acquireWriteLease("k2", "s1", "alice")).ok).toBe(true);
    expect((await impl.acquireWriteLease("k2", "s2")).ok).toBe(false);
    await impl.releaseWriteLease("k2", "s1");
    expect((await impl.acquireWriteLease("k2", "s3")).ok).toBe(true);
  });
});
```

（mock 块里对 IModelHost 的展开写法如报类型错，简化为只 mock `IModelDb.findByKey` + `IModelHost.getAccessToken` 两个具名成员——以 vitest 通过为准，不要为凑类型加死代码。）

- [ ] **Step 2: 跑测试确认失败**

Run: `cd modeling-server && npx vitest run src/feature/FeatureRpcImpl.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现 FeatureRpcImpl.ts**

```ts
/** 特征 RPC 实现（薄壳）：租约直接走 writeLeases；op/树走 FeatureService。 */
import { BriefcaseDb, IModelDb, IModelHost } from "@itwin/core-backend";
import { RpcManager } from "@itwin/core-common";
import {
  FeatureOp, FeatureOpResult, FeatureTreeEntry, LubanFeatureRpcInterface,
} from "@luban-cad/shared";
import { FeatureService, getFeatureService } from "./FeatureService.js";
import { writeLeases } from "./WriteLease.js";

export function getFeatureServiceByKey(dbKey: string): FeatureService {
  const db = IModelDb.findByKey(dbKey);
  return getFeatureService(dbKey, db, {
    push: async (description: string) => {
      if (db instanceof BriefcaseDb)
        await db.pushChanges({ accessToken: await IModelHost.getAccessToken(), description });
    },
  });
}

export class LubanFeatureRpcImpl extends LubanFeatureRpcInterface {
  public override async getFeatureTree(iModelKey: string): Promise<FeatureTreeEntry[]> {
    const svc = getFeatureServiceByKey(iModelKey);
    await svc.ensureInitialized();
    return svc.getTree();
  }

  public override async applyFeatureOp(iModelKey: string, op: FeatureOp, sessionId: string): Promise<FeatureOpResult> {
    const svc = getFeatureServiceByKey(iModelKey);
    await svc.ensureInitialized();
    return svc.applyOp(sessionId, op);
  }

  public override async acquireWriteLease(iModelKey: string, sessionId: string, user?: string): Promise<{ ok: boolean; holder?: string }> {
    return writeLeases.acquire(iModelKey, sessionId, user);
  }

  public override async releaseWriteLease(iModelKey: string, sessionId: string): Promise<void> {
    writeLeases.release(iModelKey, sessionId);
  }
}

export function registerFeatureRpc(): void {
  RpcManager.initializeInterface(LubanFeatureRpcInterface);
  RpcManager.registerImpl(LubanFeatureRpcInterface, LubanFeatureRpcImpl);
}
```

- [ ] **Step 4: main.ts 接线**（在 `RpcManager.registerImpl(OpenCloudRpcInterface, OpenCloudRpcImpl);` 行后添加）

```ts
import { registerFeatureRpc } from "./feature/FeatureRpcImpl.js";
// ...
registerFeatureRpc();
logger.info("LubanFeatureRpcInterface registered");
```

（import 合并到文件顶部既有 import 区；`registerFeatureRpc()` 放在 OpenCloudRpcImpl 注册之后。）

- [ ] **Step 5: 测试 + 门禁 + Commit**

Run: `cd modeling-server && npx vitest run src/feature/FeatureRpcImpl.test.ts && npx tsc --noEmit && npx eslint "src/feature/**/*.ts" && npx vitest run src/main.test.ts`

```bash
git add modeling-server/src/feature/FeatureRpcImpl.ts modeling-server/src/feature/FeatureRpcImpl.test.ts modeling-server/src/main.ts
git commit -m "feat(modeling-server): 特征 RPC 实现与主进程接线

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 10: 双端同步集成测试（T5.1/T5.2/T5.5 自动化部分）

**Files:**
- Test: `modeling-server/src/feature/FeatureSync.test.ts`（HubMock + 双 BriefcaseDb；若暴露实现缺陷就地修复）

**Interfaces:**
- Consumes: FeatureService with push、HubMock（深链导入，spike 同款）。

- [ ] **Step 1: 写测试**

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { BriefcaseDb, BriefcaseManager, ChannelControl, IModelHost } from "@itwin/core-backend";
// HubMock 未从 core-backend 桶导出（包无 exports 字段，深链可达编译产物）
import { HubMock } from "@itwin/core-backend/lib/cjs/internal/HubMock.js";
import { ensureHostStarted, makeTempDir } from "./test/TestHost.js";
import { FeatureService } from "./FeatureService.js";
import { writeLeases } from "./WriteLease.js";
import { countBRepEntries, readBodyGeometry } from "./FeatureEngine.js";
import { queryBodySolid } from "./LubanCadSchema.js";
import type { ExtrudeParams } from "@luban-cad/shared";

const TOKEN = "m1 sync token";
const params = (s: number, d: number): ExtrudeParams => ({ profile: [{ x: 0, y: 0 }, { x: s, y: 0 }, { x: s, y: s }, { x: 0, y: s }], distance: d });

describe("双端同步（HubMock）", () => {
  let dir: string; let dbA: BriefcaseDb; let dbB: BriefcaseDb; let svc: FeatureService;
  let iTwinId: string; let iModelId: string; let bodyB: string;

  beforeAll(async () => {
    await ensureHostStarted();
    dir = makeTempDir("sync-");
    HubMock.startup("M1Sync", dir);
    iTwinId = HubMock.iTwinId;
    iModelId = await HubMock.createNewIModel({ accessToken: TOKEN, iTwinId, iModelName: "m1sync", description: "m1" });
    const bpA = await BriefcaseManager.downloadBriefcase({ accessToken: TOKEN, iTwinId, iModelId });
    dbA = await BriefcaseDb.open({ fileName: bpA.fileName });
    dbA.channels.addAllowedChannel(ChannelControl.sharedChannelName);
    svc = FeatureService.for("sync:A", dbA, {
      push: async (d) => { await dbA.pushChanges({ accessToken: TOKEN, description: d }); },
    });
    await svc.ensureInitialized();
    writeLeases.acquire("sync:A", "sess", "alice");
  }, 240_000);

  afterAll(async () => {
    dbA.close(); dbB?.close();
    HubMock.shutdown();
    fs.rmSync(dir, { recursive: true, force: true });
  }, 60_000);

  it("op=push：B 端 pull 后免重算见到新几何与 op 日志", async () => {
    const r = await svc.applyOp("sess", { kind: "insertFeature", featureType: "extrude", params: params(2, 1) });
    expect(r.ok).toBe(true);

    const bpB = await BriefcaseManager.downloadBriefcase({ accessToken: TOKEN, iTwinId, iModelId });
    dbB = await BriefcaseDb.open({ fileName: bpB.fileName });
    bodyB = queryBodySolid(dbB)!;
    expect(countBRepEntries(readBodyGeometry(dbB, bodyB))).toBeGreaterThan(0);

    // A 端再改参数 → push → B 端 pull → 几何一致
    await svc.applyOp("sess", { kind: "updateParams", featureId: (r as { featureId: string }).featureId!, params: params(4, 2) });
    await dbB.pullAndApplyChanges({ accessToken: TOKEN });
    expect(JSON.stringify(readBodyGeometry(dbB, bodyB))).toEqual(JSON.stringify(svc.readBodyGeomForTest()));
  });

  it("undo 也是 op：B 端 pull 后看到回退", async () => {
    const before = JSON.stringify(readBodyGeometry(dbB, bodyB));
    const u = await svc.applyOp("sess", { kind: "undo" });
    expect(u.ok).toBe(true);
    await dbB.pullAndApplyChanges({ accessToken: TOKEN });
    expect(JSON.stringify(readBodyGeometry(dbB, bodyB))).not.toEqual(before);
  });
});
```

注意：`dbA` 打开后若 `pullAndApplyChanges` 报锁/通道问题，参照 spike 的 HubMock 用例补 `addAllowedChannel`；A 端 push 前若 native 要求先 pull（本地是 tip，不会）。`readBodyGeomForTest` 在 FeatureService 上返回 JSON 序列化前的对象——两侧都 JSON.stringify 比较。

- [ ] **Step 2: 跑测试，红→绿**

Run: `cd modeling-server && npx vitest run src/feature/FeatureSync.test.ts`

- [ ] **Step 3: 全量回归 + 门禁 + Commit**

Run: `cd modeling-server && npx vitest run && npx tsc --noEmit && npx eslint "src/feature/**/*.ts"`

```bash
git add modeling-server/src/feature
git commit -m "test(modeling-server): 双端同步集成——op=push/pull 免重算/undo 传播（T5.1/T5.2/T5.5）

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 11: 收口——全量回归、文档、M1 标记

**Files:**
- Modify: `docs/superpowers/specs/2026-09-28-cad-full-program-roadmap.md`（M1 相关任务标 ✅）
- Modify: `C:\Users\24389\.claude\projects\D--Github-tiangong-kaiwu\memory\cad-foundation-direction.md`（M1 完成状态一行）

**Interfaces:** 无代码接口；文档收口。

- [ ] **Step 1: 全量验证**

Run: `cd modeling-server && npx vitest run && npx tsc --noEmit && npx eslint "src/**/*.ts"`
Expected: 全绿、零错误（含既有 138+ 用例无回归）。

- [ ] **Step 2: 手动演示路径（记录性，非阻塞）**

在本地栈（`powershell -File scripts/verify-stack.ps1` 通过后）起 modeling-server，用任意 SQL 工具或临时代码调 `LubanFeatureRpcInterface`（或直接 `FeatureService.for`）对测试 iModel 应用 2-3 个 op，前端 viewer 打开同 iModel 观察刷新。**已知边界**：前端对外部 changeset 的自动 pull/tile 刷新未接线（属 WS6/M3 范围）——把观察结果如实记入 roadmap 风险登记第 2 条的备注，不硬凑演示。

- [ ] **Step 3: 更新 roadmap 与记忆**

roadmap：T3.1✅ T3.2✅ T3.3✅ T3.6✅ T3.7✅ T5.1✅ T5.2✅ T5.3✅（updateParams 范围）T5.4✅ T5.8✅；M1 标达成（附日期与测试计数）；风险登记第 2 条补 T5.5 前端自动 pull 备注。记忆文件 cad-foundation-direction.md 加一行 M1 完成摘要。

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-09-28-cad-full-program-roadmap.md
git commit -m "docs: M1 特征引擎最小闭环达成标记

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Self-Review 结论（已核对）

1. **Spec 覆盖**：§3.1b schema（Task 3）、§3.2a op 生命周期（Task 7）、§3.2c 冷重建（Task 5）、§3.2d 失败级联（Task 5）、§3.2e op=push+语义 undo（Task 7/8/10）、§3.2f op 日志（Task 6）、§3.3a 租约（Task 2）、§3.3b RPC 接缝（Task 1/9）、§3.3d 测试（各任务+Task 10）——M1 范围内全覆盖。刻意排除项见 Global Constraints 末条。
2. **占位符**：无 TBD；两处「以实际 API 为准」的注记（StandaloneDb 重开方法名、shared 依赖已确认存在）均附了核对方法。
3. **类型一致性**：`setOpUndone(txn, id, undone)` 统一（Task 7 注记了从 Task 6 的 `markOpUndone` 重命名）；`readBodyGeomForTest`/`clearServiceCacheForTest` 在产生它们的任务内定义；`FeatureService.for` 与 `getFeatureService` 并存（for 委托 get）。
