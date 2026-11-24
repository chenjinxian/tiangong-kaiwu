# AIRR — G1 D6：Named Version 与真实 Checkpoint 绑定

- 标题：G1 D6 Named Version ↔ Checkpoint 多对多绑定、删除护栏与只读解析
- 日期：2026-11-24
- Owner：平台/账本（Hub）
- 关联需求：`G1-EXECUTION-PLAN.md` D6；`CHECKPOINT-GENERATOR-DESIGN.md`；ADR `ADR-G0-04-ledger-version-checkpoint.md`（D-B / INV-6）
- 预计影响仓：`imodelhub-services`（代码/迁移/测试）；公共仓仅本文档
- 是否需要 ADR：**否**（不新增跨仓契约；在既有 ADR-G0-04 D-B 与 INV-6 内落实现有语义。若后续需要改变“一个 index 一个物理 checkpoint / NV 可共享”的裁定，必须另立 ADR）

---

## 1. 目标与验收

### 现状事实（2026-11-24 代码复核）

1. `checkpoints.namedVersionId` 为单值 nullable 列；控制面调度与完成路径从不写入，生产行为等价于恒 NULL。
2. `NamedVersionsService.remove` 的 `findByNamedVersionId` 护栏因此永不命中；被 checkpoint 覆盖的 NV 仍可软删。
3. `PUT /namedversions/:id/checkpoint` 只做事务性调度（checkpoint + outbox job），不建立“这个 NV 已由该 checkpoint 表示”的关系。
4. 一个 changeset index 只有一个物理 checkpoint；多个 NV 可共享同一 checkpoint（ADR D-B）。
5. 没有“checkpoint ready”事件、计数器或通知；GET 只能读状态。

### 目标（本切片）

1. 新增 additive 多对多连接表 `checkpoint_named_versions(checkpointId, namedVersionId, iModelId)`，**不重写 `checkpoints` 行**；迁移按 `(iModelId, changesetIndex)` 回填既有的 successful checkpoint 与未软删 NV。
2. checkpoint 变为 successful（含幂等 complete 重试、复用已有 successful 行）时，把该 iModel + changesetIndex 上所有未软删 NV 绑定到**精确的 checkpoint 行**；同一 checkpoint 可绑定多个 NV。
3. NV checkpoint GET 仍只在 checkpoint `successful` 时返回 200；scheduled/failed 保持 409 `CheckpointNotReady`。绑定存在不等于 ready。
4. 存在绑定的 NV 删除返回 409 `NamedVersionHasCheckpoint`；存在绑定的 checkpoint 硬删除返回 409 `CheckpointHasNamedVersionBindings`。重排 failed checkpoint 复用同一行 id，绑定保持。
5. 公开 REST DTO/包络不变（本切片不新增公开字段）；内部数据关系不外泄。

### 可观察验收

- 新迁移 up/down SQL 形态测试通过；up 只 `CREATE TABLE` / `CREATE INDEX` / `INSERT ... SELECT`，不对 `checkpoints` 做 UPDATE/ALTER。
- 回填仅覆盖 `checkpoints.state='successful'` 且 `named_versions.deletedAt IS NULL` 的组合；`ON CONFLICT DO NOTHING` 可重放。
- complete 成功后绑定存在；幂等 complete 会补绑定（可修复“成功已提交但绑定写入失败”）。
- 同一 changeset index 的两个 NV 都解析到同一 checkpoint；删除任一 NV 均 409。
- scheduled checkpoint 的 NV GET 仍 409，且不返回访问信息/下载链接。
- 有绑定的 checkpoint `remove()` 409，不触发裸数据库外键错误。
- 全量 Hub 单测、`tsc --noEmit`、eslint 全绿；不启 live DB/栈，不伪造迁移在真实库执行的证据。

### 非目标（明确不做）

- **D3**：不做 changeset 身份迁移、clone/fork 历史复制、squash/Duplicate；保持现有 fail-closed。
- **D7/D8**：不做 restore/compare、Version/Tab/Refs。
- 不新增 checkpoint ready 事件/计数器/通知；GET 继续以 checkpoint 状态为准。
- 不打开 `CHECKPOINT_GENERATION_ENABLED`，不生成真实 checkpoint 字节，不改 worker。
- 不改公开 API 响应形状；不改名字段、不新增公开 DTO 字段。
- 不在本切片引入“NV 创建即自动绑定”的旁路（见 §8 残余）。

---

## 2. 关联项目能力清单

| 项目/仓 | 相关能力 | 现有实现 | 结论 |
|---|---|---|---|
| imodelhub-services | `CheckpointControlPlaneService` schedule/complete/claim | G1 D4 已落地 | **扩展**：成功后绑定 |
| imodelhub-services | `CheckpointRepository` 查询与状态投影 | 已有 | **扩展**：join 解析 + 绑定/引用查询 |
| imodelhub-services | `NamedVersionsService.remove` 删除护栏 | 已有（依赖恒 NULL 列，实际失效） | **修复**：改为 join 命中 |
| imodelhub-services | TypeORM + PostgreSQL 迁移 | 已有 | **新增 additive 迁移** |
| 官方 iModels v2 API/clients | Named Version checkpoint、409 语义 | 参考规格 | **遵循**，DTO 不变 |
| itwinjs-core / imodel-native / luban-backend | checkpoint 字节生成/打开 | 后续 worker/D5 | 不在本切片 |
| @luban-cad/shared | 跨仓契约 | 无关 | **不触碰** |

---

## 3. 复用决策矩阵

| 需求能力 | 候选复用 | 覆盖度 | 决策 | 理由 |
|---|---|---|---|---|
| checkpoint ↔ NV 关系 | 现有 `checkpoints.namedVersionId` 单列 | 低（一 checkpoint 多 NV 不成立） | **新建 join** | 单列无法表达多对多；且回填不得改写 checkpoint |
| NV GET 解析 | 现有 `findByNamedVersionId` + index fallback | 中 | **扩展** | 保留 legacy fallback，新增 join 命中；读路径不写 |
| 删除护栏 | 现有 `NamedVersionsService.remove` 检查 | 高 | **复用** | 只替换底层查询来源 |
| checkpoint 删除护栏 | 现有 `CheckpointsService.remove` | — | **扩展** | fail-closed 为 409，避免裸 FK 错误 |
| 事务/幂等 | 现有 complete 事务 + 幂等返回 | 高 | **复用** | 绑定使用 `ON CONFLICT DO NOTHING`，可重试 |
| 数据库约束 | PostgreSQL FK / PK | 高 | **新建约束** | 需要“引用存在时不可删”的数据库兜底 |

---

## 4. 数据/Schema 变化

### 4.1 新表 `checkpoint_named_versions`（additive）

| 列 | 类型 | 约束 |
|---|---|---|
| `checkpointId` | uuid | NOT NULL，PK 组成 |
| `namedVersionId` | uuid | NOT NULL，PK 组成 |
| `iModelId` | uuid | NOT NULL |
| `boundAt` | timestamptz | NOT NULL DEFAULT now() |

约束与索引：

- `PRIMARY KEY (checkpointId, namedVersionId)`：同一对关系只出现一次。
- `FK_checkpoint_named_versions_checkpoint` → `checkpoints(id)` **ON DELETE NO ACTION**。
- `FK_checkpoint_named_versions_named_version` → `named_versions(id)` **ON DELETE NO ACTION**。
- `FK_checkpoint_named_versions_imodel` → `imodels(id)` ON DELETE CASCADE。
- `IDX_checkpoint_named_versions_iModel_namedVersion (iModelId, namedVersionId)`。
- `IDX_checkpoint_named_versions_namedVersion (namedVersionId)`。

语义说明：

- 使用 **NO ACTION** 而非 RESTRICT：直接删父行会在语句结束时失败；iModel 级联同时删除 checkpoint / NV / 绑定行时不会被中间顺序误伤。
- `named_versions` 目前是软删（`deletedAt`）；服务层 409 拦截 API 删除，NO ACTION 只兜底硬删/维护脚本。
- 不修改、不删除 `checkpoints.namedVersionId` 列；本切片不再依赖它写入，但保留读取兼容。

### 4.2 回填（forward-only，可重放）

```sql
INSERT INTO "checkpoint_named_versions" ("checkpointId","namedVersionId","iModelId")
SELECT cp."id", nv."id", cp."iModelId"
  FROM "checkpoints" cp
  JOIN "named_versions" nv
    ON nv."iModelId" = cp."iModelId"
   AND nv."changesetIndex" = cp."changesetIndex"
 WHERE cp."state" = 'successful'
   AND cp."retiredAt" IS NULL
   AND cp."changesetIndex" IS NOT NULL
   AND nv."deletedAt" IS NULL
ON CONFLICT ("checkpointId","namedVersionId") DO NOTHING;
```

- 唯一匹配键是 `(iModelId, changesetIndex)`；不按 NV 名称、不按 checkpoint db 名称。
- 不 UPDATE `checkpoints`；不写 `namedVersionId` 单值列。
- down 仅 `DROP TABLE`；绑定是派生的完整性问题，删除后回退为“无绑定”行为。

---

## 5. 流程与不变量

```text
NV PUT → scheduleForNamedVersion
  ├─ 新调度：scheduled + outbox job；暂不绑定（尚未 ready）
  └─ 复用 successful：立即绑定该 index 下所有未软删 NV

worker complete → checkpoint successful（事务）
  └─ bindSuccessfulCheckpoint：INSERT .. SELECT .. ON CONFLICT DO NOTHING
     - 只绑定 cp.state='successful' 且 nv.deletedAt IS NULL
     - 只绑定同 iModel、同 changesetIndex
     - 同一 checkpoint 可绑定 N 个 NV

GET NV checkpoint
  ├─ join 命中 + cp.state='successful' + index/changeset 精确匹配 → 200
  ├─ 否则 index fallback 到精确 index 的 successful checkpoint → 200
  └─ scheduled/failed/不存在 → 409 CheckpointNotReady（读路径不写）

DELETE NV
  ├─ join（或 legacy 单列）命中 → 409 NamedVersionHasCheckpoint
  └─ 未命中 → 软删

DELETE checkpoint
  ├─ join 命中 → 409 CheckpointHasNamedVersionBindings
  └─ 未命中 → 删除
```

不变量：

- **I1** 绑定行只出现在 `successful`（且未 retired）的 checkpoint 上。
- **I2** 绑定行的 `iModelId` 与 checkpoint、NV 一致；运行时 INSERT 以三者同源列选取。
- **I3** 一个 `(checkpointId, namedVersionId)` 只绑定一次；绑定写入幂等。
- **I4** 一个 checkpoint 可绑定多个 NV；一个 NV 在正常数据下只解析到一个精确 index 的 checkpoint。
- **I5** 读路径绝不写绑定；绑定由 ready（complete / 复用成功）或迁移回填产生。
- **I6** 未 ready 的 checkpoint 即使存在历史/脏绑定也返回 409，不返回访问信息。
- **I7** 重排 failed checkpoint 复用同一行 id，不删除既有绑定；删除父行受 FK + 服务 409 双重保护。
- **I8** 公开 REST 响应形状不变；本表仅内部关系。

---

## 6. 失败/回滚

| 场景 | 行为 |
|---|---|
| 绑定写入失败（complete 后） | complete 抛错；worker 重试命中幂等分支并重新绑定 |
| 幂等 complete | 不重复写 checkpoint；补写缺失绑定 |
| scheduled/failed | 不绑定；GET 409；删除 NV 可执行（无成功 checkpoint 证据） |
| NV 在 ready 前被软删 | 绑定 SELECT 排除 `deletedAt IS NOT NULL`，不建立死关系 |
| 直接硬删 NV/checkpoint | FK NO ACTION 拒绝；API 先返回显式 409 |
| 删除 iModel | checkpoint / NV / 绑定按各自 CASCADE 清理 |
| 迁移 down | 仅删 join 表；不回滚任何 checkpoint 状态；旧版本代码恢复为无绑定行为 |

---

## 7. 测试证据

### 7.1 新增/修改单测（无 live DB）

| 用例 | 断言 |
|---|---|
| 迁移 up | 建表、PK、两条 NO ACTION FK、iModel CASCADE、索引顺序 |
| 迁移回填 | `INSERT ... SELECT` 使用 `(iModelId, changesetIndex)`、只取 successful/未软删、`ON CONFLICT DO NOTHING`；无 UPDATE checkpoints |
| 迁移 down | `DROP TABLE` |
| 仓储 join 查询 | `findByNamedVersionId` 优先 join，保留 legacy 单列 OR |
| 仓储绑定 SQL | 只绑定 successful、同 iModel/index、未软删；幂等 |
| 控制面 | schedule 不绑定；complete 成功绑定；复用 successful 立即绑定；幂等 complete 补绑定 |
| 控制面（多 NV） | 同 index 两个 NV 都解析成功；跨 index NV 不被绑定 |
| 409 语义 | scheduled/failed 解析仍为 not_ready |
| 删除护栏 | NV 有绑定 → 409；checkpoint 有绑定 → 409 且不调用 remove |

### 7.2 运行命令（预期）

```bash
cd imodelhub-services
npx tsc --noEmit
npx eslint <changed src/test files>
npx jest --config ./test/jest-unit.json --runInBand --coverage=false \
  test/unit/imodels/checkpoint-control-plane.spec.ts \
  test/unit/imodels/checkpoint-named-version-binding.repository.spec.ts \
  test/unit/imodels/named-version-guardrails.spec.ts \
  test/unit/database/checkpoint-named-version-bindings-migration.spec.ts
npx jest --config ./test/jest-unit.json --runInBand --coverage=false
```

若本地无 Postgres，不运行 integration/e2e；不得把 SQL 形态单测冒充为真实迁移执行证据。

### 7.3 未执行证据

- 真实 Postgres 上 fresh migration up/down（本机/任务限制无 live DB）。
- 真栈 worker complete → 绑定 → NV GET 的端到端（需真实 worker + flag ON）。
- ready 事件/计数器/通知（非目标）。

---

## 8. 回滚与发布

- 发布顺序：hub 迁移 → hub 代码（flag 仍 OFF）。迁移 additive，可先于代码执行。
- 回滚：应用回滚到读取 legacy 单列逻辑；join 表可保留（惰性）或执行 down 删除。
- 数据回滚：无需恢复 checkpoint 行（本切片未改写）；down 后丢失的是绑定关系。
- 兼容窗口：旧代码不读 join，仍按 legacy `namedVersionId`/index 解析；新代码保留 legacy fallback。
- 发布门：本切片不 commit/push、不部署；由 owner 决定。

### 残余（本切片不关闭）

1. 无 checkpoint ready 事件/计数器；调用方只能轮询 GET。
2. NV 在已有 successful checkpoint 之后创建、且从未 PUT 时，不会自动产生绑定；GET 仍可按 index 解析，但删除护栏依赖后续 PUT 或迁移回填。若要求“所有可解析 NV 必须绑定”，需另立切片（在创建路径写入或读路径外异步修复）。
3. 绑定写入在 complete 成功事务提交之后；若进程在两步之间永久中断且 worker 不再重试，successful checkpoint 可能暂时无绑定。GET 仍按 index 解析；幂等 complete 重试会修复。真正的原子“成功即绑定”需要把绑定 SQL 并入 complete 事务，属后续加固。
4. D3 clone/fork 历史复制、D7 restore/compare、D8 引用仍未实现。
5. 真实 worker、flag 开启、真实 Postgres 迁移演练（含 iModel 级联多路径）未执行。

---

## 9. 评审结论

- 复用矩阵完成：是
- 跨仓影响明确：是（仅 hub；公开 REST 不变）
- P0 例外已登记：否（本切片未新增例外；不改既有 X-16/X-17 状态）
- ADR：不需要（在 ADR-G0-04 D-B/INV-6 内实现）
- Owner 签字：待
- 结论：**实现约束；不得据此宣称 G1 Gate/D6 全量关闭**
