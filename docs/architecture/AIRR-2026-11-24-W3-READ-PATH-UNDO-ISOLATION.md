# AIRR：G1 W3 读路径纯化与 undo principal+briefcase 隔离

- 标题：G1 W3 — 读 RPC 零写初始化；OpLog undo/redo/discard 按 verified principal + briefcase 隔离
- 日期：2026-11-24
- Owner：平台/后端架构
- 关联需求：`INDUSTRIAL-READINESS-PROGRAM-2026-11-24.md` W3「读路径零 save/push/head 变化」「undo 隔离负例」；`G1-EXECUTION-PLAN.md` C3.2 / 出口「读路径不隐式 rebuild/写库；undo 按 user/briefcase 隔离」；`ADR-G0-10-undo-granularity.md` D-C/INV-3；`SESSION-ISOLATION-DESIGN.md` §5.3
- 预计影响仓：私有 `luban-backend/modeling-server` 与公共文档。**不改** Hub、shared、web/viewer/editor、webhook-agent、BFF、`main.ts`、retry/export/assembly 面。
- 是否需要 ADR：**是（文字修订级）**。本切片实现 W3 与 ADR-G0-10 D-C 的目标，但把 undo 归属从「仅 sessionId」收紧为「verified principal + briefcase」；与 `SESSION-ISOLATION-DESIGN.md` §5.3 现有 per-session 文字存在差异，需 ARB 在 ADR-G0-10 D-C 中确认。本切片不新增 ADR 文件、不修改既有 ADR/索引。
- 状态：**实现完成（私有仓工作树，未提交、未部署）**。证据为类型检查、定向/全量单元与 StandaloneDb 集成、进程内 HubMock BriefcaseDb 只读用例；**未运行真实 Hub/Azurite/Postgres 真栈**，不勾任何 G1 Gate 项，不改能力账本/索引。

---

## 1. 目标、验收与非目标

### 1.1 目标

1. **读路径不得写**：FeatureOp 读 RPC 的初始化不得 import/升级 schema、启动 init/repair `EditTxn`、冷重建（`rebuildAll`）、auto-push 或执行草图显示迁移；不得改变本地 briefcase、native 事务状态或 head。
2. **已有图优先读取**：已初始化文档的读面继续返回库存特征/草图/变量/body/质量属性行；未初始化文档返回诚实空，初始化**延迟**到显式写路径。
3. **undo 归属**：OpLog 的 undo/redo/discard 只消费由同一**已验证主体 + briefcase**写入的行，而不是只看 sessionId；旧无 author 行按 legacy 规则排除，不回填。
4. **可回滚**：读路径与 undo 过滤均有显式开关；无 schema 迁移、无数据改写。

### 1.2 可观察验收

- 对 fresh（无 schema）、legacy（已初始化）、migration-needed（草图 placement 与 `params.plane` 不一致）文档执行全部 FeatureOp 读 RPC 后：
  - native `getCurrentTxnId` / `isUndoPossible` / `isRedoPossible` 不变；
  - `db.changeset.id/index`（head）不变；只读 BriefcaseDb 亦然；
  - 注入的 push 回调、`EditTxn.start/end`、`saveChanges` 均零调用；
  - 读面结果与库存行一致（fresh 为空，legacy/migration 为真实行）。
- migration-needed 文档的读路径**不**修正 placement；随后显式 `ensureInitialized`（写路径）才迁移并 push。
- 只读打开的 BriefcaseDb：`ensureInitializedForRead` 成功，读回真实 body/schema 行，head/事务状态不变。
- OpLog enforce：A 的行（userId/ briefcaseId）不会被 B 的 undo/redo/discard 消费；同 sessionId 不同 principal、同 principal 不同 briefcase 均不匹配；authorless 旧行在 enforce 下不可撤销。
- 无 session 的单测/CLI 旧行为保持（不过滤、不伪造 author）。

### 1.3 非目标

- 不解决统一 undo 栈/操作组（ADR-G0-10 D-A/D-B）、草图整体覆写 op 可逆性（X-05）、跨 push undo 深度（X-15）。
- 不新增/修改 shared RPC 契约、EC schema、native、渲染或迁移脚本。
- 不做多进程/多实例 lease fencing、checkpoint/version、B3.1f ACL、Hub 归因；这些由其他切片持有。
- 不修改 `main.ts`、`routes/retry.ts`、BFF、`pepCoverage.ts` 或 export/retry/assembly 面。

---

## 2. 复用矩阵

| 能力 | 现有实现 | 本切片决策 | 理由 |
|---|---|---|---|
| 读面数据/作用域 | `FeatureService.readFeatureRows/readSketchRows/readScopeModels` + `queryModuleIdByUserLabel` | 复用，读路径不建图 | 读面本就不依赖 `_ctx`；scoped 缺 ctx 时按分区标签只读反查 |
| 只读 briefcase | `IModelDb.isReadonly` 降级分支（B5） | 提取为 `initializeReadState()` 与读初始化共用 | 两条无写通道同一探测/阻断语义 |
| 初始化/建图 | `FeatureService.ensureInitialized`（`LubanCadSchema.importTo`、`createFeatureModels`、repair、`ensureWarm`、`migrateSketchDisplayState`、`maybePush`） | **写路径保持原样**，读路径不再调用 | 单一写初始化管道，不新增第二套建图 |
| 事务 | iTwin `EditTxn` / `BriefcaseTxns` / `saveChanges` / `pushChanges` | 读路径零使用 | P0-01/P0-05；无第二套事务状态机 |
| 会话身份 | `SessionContext` + `SessionRegistry`（verified principal/briefcase） | 复用；作者与过滤同源解析 | 客户端 `sessionId/user` 从不授权 |
| OpLog 作者 | `OpPayload.author { userId, sessionId, briefcaseId }`（G1 C3，JSON 追加） | 复用字段，改变匹配谓词；无 schema 迁移 | 已有字段足以表达 principal+briefcase |
| undo 栈算法 | `findUndoTarget/findRedoTarget/findToDiscard` + `queryOpLog` | 复用算法，仅替换 `isAuthoredBy` 谓词 | 顺序/不可逆/丢弃语义不变 |
| 原生 undo | `BriefcaseTxns` + `AppFunctionIpcHandler` key owner 校验 | 不改；补 A/B 负例测试 | 一 session 一 briefcase 文件天然隔离 |
| 测试 | StandaloneDb + `test/TestHost` + 进程内 `HubMock` | 复用 | 不依赖 live stack |

---

## 3. 跨仓影响

| 仓/层 | 契约 | schema/迁移 | native/接口 | 测试 | 发布 |
|---|---|---|---|---|---|
| modeling-server | 无公共 RPC 变更；新增内部方法 `ensureInitializedForRead` | 无 | 无 | 新增读路径/undo 用例 + 回归 | 随 MS 常规构建 |
| shared | 无 | 无 | 无 | — | 无 |
| web/viewer/editor | 无 | 无 | 无 | 既有读 RPC 行为兼容 | 无 |
| Hub/BFF/WA | 无 | 无 | 无 | — | 无 |
| 公共文档 | 本 AIRR | 无 | 无 | — | 无 |

- **兼容矩阵**：读 RPC 签名/返回不变；fresh 文档在首次写之前读面为空（此前读会隐式建图），这是有意的行为纠正。旧客户端/工具若依赖「读一次即建图」，需改为显式写路径（`FEATURE_READ_INIT_MODE=legacy-write` 可回滚）。
- **OpLog 数据**：`author` 已由 C3 写入；本切片只改变消费谓词。旧行保持字节不变，不回填、不改写。
- **发布顺序**：仅 MS 单仓；不涉及 shared 双端发布。

---

## 4. 读路径设计（R 不变量）

### 4.1 入口

`LubanFeatureRpcImpl` 的所有文档读方法改为 `await svc.ensureInitializedForRead()`：

`getFeatureTree`、`getSketch`、`listSketches`、`getVariables`、`getMassProperties`、`getBodies`。

`listPartStudios`（注册表纯读）与 `getFeatureFormModel`（无文档）保持原样；`resolveEdgeRef/resolveFaceRef` 不触发 service 初始化。写类入口（`applyFeatureOp`、`previewFeatureOp`、`renameFeature/renameBody`、Part Studio create/rename/delete）仍走显式写初始化。

### 4.2 读初始化行为

```text
ensureInitializedForRead
  ├─ FEATURE_READ_INIT_MODE=legacy-write → ensureInitialized（回滚通道；可写）
  └─ read-only（默认）
       withDocumentInitLock(db.key)
         ├─ scoped tombstone → 稳定删除错误（零变更）
         ├─ LubanCadSchema.register()（仅进程内类注册）
         └─ initializeReadState()
              ├─ detectFeatureDocumentMode（纯读）
              ├─ 跨模式冲突 → _readBlocked + 稳定错误文案；不建图
              ├─ hasLubanSchema? 无 → 读面空
              ├─ 按分区标签反查 def/phys/body/category（纯读）
              └─ scoped 图完整且未阻断 → 只读 `_ctx`（不写库）
```

**不变量**

| ID | 不变量 |
|---|---|
| R-1 | 读初始化不调用 `LubanCadSchema.importTo`、不启动任何 `EditTxn`、不调用 `rebuildAll/ensureWarm`、不调用 `maybePush/pushChanges`、不调用 `migrateSketchDisplayState`。 |
| R-2 | 读面只返回库存事实：有 schema/行则返回真实行；未初始化/缺类/缺分区则诚实空；不补建、不伪造。 |
| R-3 | 读调用不改变 native 事务游标/undo/redo、不改变 `db.changeset`（head）、不产生本地 save；只读 briefcase 可读。 |
| R-4 | 跨模式读写冲突与 scoped 墓碑仍在任何写/读前以稳定错误拒收；错误路径零变更。 |
| R-5 | 初始化需求（fresh/repair/旧 schema 升级/草图显示迁移）一律延迟到显式写路径；读路径不提供隐式修复。 |
| R-6 | 读初始化与写初始化按 `db.key` 串行（`withDocumentInitLock`），不观察到半建图状态。 |

### 4.3 跨模式读面

- legacy 服务在 scoped/mixed 文档上：阻断全局读（诚实空），绝不把别家 studio 行当 legacy 数据。
- scoped 服务在 legacy/unknown 文档上：阻断读；在 mixed 文档中若本 scope 的 def/phys/body/category 完整，则**只读本 studio**（与写初始化的 mixed 分支同语义），写仍由 `_modeBlockReason` 拒收。
- scoped 墓碑：读写初始化均在入口返回稳定删除错误，不复活图。

### 4.4 延迟的显式修复

- **fresh**：读面空；首次 `applyFeatureOp`/`createPartStudio`/rename 等写入口调用 `ensureInitialized`，建 schema + def/phys + init body 并按既有规则 push。
- **repair（缺 body/category）**：读面按现存分区返回；写路径 `ensureInitialized` 原位补建。
- **旧 schema（缺变量类）**：读面 `getVariables()` 返回空（`containsClass` 守卫）；写路径 `importTo` 升级。
- **草图显示迁移**：读面不迁移；写路径 `ensureInitialized` 执行一次并 push（已推事务不可撤销，符合既有语义）。

---

## 5. Undo 隔离设计（U 不变量）

### 5.1 作者与过滤

- 写入：`oplogMeta()` 仍从 `SessionContext` 派生 `{ userId, sessionId, briefcaseId }`；`currentBriefcaseRecord()` 在同一 docId 的多条记录中优先 `rw`，写作者与读过滤共用该解析。
- 过滤：`OpLogAuthorFilter` 新增 `userId`（必填）与 `briefcaseId`（可选）；`isAuthoredBy` 规则：

| 行的 author | filter 有 briefcaseId | filter 无 briefcaseId |
|---|---|---|
| 无 author（legacy） | 不匹配 | 不匹配 |
| `userId` 不同 | 不匹配 | 不匹配 |
| 同 user、`briefcaseId` 相同 | 匹配 | 不匹配（行有绑定，读端无） |
| 同 user、行缺 `briefcaseId` | 不匹配（归属不明） | `sessionId` 相同才匹配 |

- `findUndoTarget/findRedoTarget/findToDiscard/queryOpLog(enforce)` 全部使用该谓词；`discardUndoneOpLogEntries` 只丢弃本 principal+briefcase 的撤销段。
- `shadow` 不过滤，只用 `isAuthoredBy` 统计「本应排除」行数；`off` 返回 `undefined`（旧行为）。
- 同 user + 同 briefcase 的重连（新 sessionId）可继续操作该 briefcase 的未撤销行；不同 briefcase（含同 user 的另一 briefcase）互不可见。这是「principal+briefcase」相较仅 sessionId 的语义收紧/收敛，需 ADR 文字确认。
- 原生 undo/redo（`reverseTxns/reinstateTxn/...`）仍按 session 拥有的 briefcase 文件隔离；A/B 负例证明跨 session 在触达 db 前即以 `DocumentLocked` 拒收。

**不变量**

| ID | 不变量 |
|---|---|
| U-1 | undo/redo/discard 的目标集只含当前 verified principal + briefcase 写入的行。 |
| U-2 | 行 author 缺 briefcaseId 且当前有 briefcase 绑定时排除（fail closed），不猜测归属。 |
| U-3 | 旧无 author 行在 enforce 下不可撤销/重做/丢弃；不伪造 author、不回填、不改写旧行。 |
| U-4 | sessionId 只在双方都无 briefcase 绑定时作为兼容回退；不再是唯一授权维度。 |
| U-5 | `OPLOG_AUTHOR_FILTER=off` 是唯一恢复旧全局行为的开关；`shadow` 只观察。 |
| U-6 | 原生 undo 不得跨 session 拥有的 briefcase；OpLog 与原生 undo 均保持写租约/ACL 入口。 |

---

## 6. 开关与回滚

| 变量 | 默认 | 允许值 | 作用 |
|---|---|---|---|
| `FEATURE_READ_INIT_MODE` | `read-only` | `read-only` / `legacy-write` | 读 RPC 初始化；`legacy-write` 恢复 W3 前「读可写库」行为 |
| `OPLOG_AUTHOR_FILTER` | `enforce` | `off` / `shadow` / `enforce` | undo/redo/discard 作者过滤；`off` 恢复旧行为 |

**回滚步骤**：

1. 读路径异常：设 `FEATURE_READ_INIT_MODE=legacy-write` 并重启 MS。无数据/schema 迁移；已延迟的 init/repair/migration 会在下一次读或写初始化按旧路径执行。
2. undo 过滤异常：设 `OPLOG_AUTHOR_FILTER=off`（或 `shadow` 观察）并重启。OpLog 行保留不动；不回写、不删除。
3. 代码回滚：两开关均为 additive；旧代码忽略 `author`/新字段。**不得**为回滚删除已提交历史或把已推事务重新变成可撤销。

---

## 7. 测试证据

### 7.1 实现文件（私有仓相对路径）

| 文件 | 变更 |
|---|---|
| `modeling-server/src/feature/FeatureService.ts` | 新增 `ensureInitializedForRead` + 共用 `initializeReadState`（无写探测）；作者/过滤共用 `currentBriefcaseRecord`；注释明确读/写初始化分离 |
| `modeling-server/src/feature/FeatureRpcImpl.ts` | 六个文档读 RPC 改走 `ensureInitializedForRead`；写入口保持 `ensureInitialized` |
| `modeling-server/src/feature/OpLog.ts` | `OpLogAuthorFilter` 增 `userId/briefcaseId`；`isAuthoredBy` 改为 principal+briefcase 谓词；legacy 排除语义落注释 |
| `modeling-server/src/config.ts` | 新增 `FEATURE_READ_INIT_MODE=read-only|legacy-write`；更新 `OPLOG_AUTHOR_FILTER` 说明（默认 `enforce`） |

### 7.2 新增/更新用例

| 文件 | 覆盖 |
|---|---|
| `feature/FeatureReadInit.test.ts` | fresh（无 schema）读初始化零 save/push/head/txn 且读面空、显式写初始化仍建图；legacy 读回真实树/草图/body/质量属性且零写；migration-needed 读不迁移、写初始化才迁移并 push；StandaloneDb 只读打开零写 |
| `feature/FeatureReadInitBriefcase.test.ts` | 进程内 HubMock：写端初始化并 push，只读 `BriefcaseDb` 读回真实 body 行；head/native txn/push 全部不变 |
| `feature/OpLogAuthor.test.ts` | principal+briefcase 谓词：同 sessionId 异 principal、同 principal 异 briefcase、同 user+briefcase 重连、缺 briefcase、sessionId 回退、legacy 无 author 排除 |
| `feature/FeatureService.undoOwnership.test.ts` | 真实 StandaloneDb + 双 session/双 briefcase handoff：A/B 各自 undo 不越界；author 携带 `briefcaseId` |
| `feature/FeatureRpcImpl.test.ts` / `readEnforce.test.ts` | 读 RPC 只调用 `ensureInitializedForRead`，不再调用 `ensureInitialized`；读授权 deny 早于两者 |
| `ipc/AppFunctionIpcHandler.session.test.ts` | 原生 undo/redo 全入口跨 session 在触达 db 前拒收 |

### 7.3 执行结果（工作树，2026-11-24）

- `npx tsc --noEmit`：通过。
- 定向 vitest（`--no-file-parallelism`）：读初始化/只读/MultiPartStudio 66/66；undo/OpLog/IPC/FeatureRpc 70/70。
- 全量 MS vitest：**173 files passed；1756 passed | 1 expected fail | 8 skipped（1765）**，耗时 163.35s。未跑真实栈（无 live Hub/Postgres/Azurite 断言）。
- eslint（本次触碰文件）：无新增错误；`config.ts` 仍报告与本次无关的既有 `no-deprecated`/`no-console` 基线错误（行号在本次改动之外）。
- 证据边界：StandaloneDb + 进程内 HubMock 只证明本地 briefcase/head/txn 零变化与真实 BriefcaseDb 只读读取；不证明真实 Hub push/多实例 lease 行为。

### 7.4 失败注入/负路径

- 读初始化在无 schema、只读、migration-needed、scoped 冲突、墓碑路径均为零变更；跨模式冲突/墓碑返回稳定错误。
- undo 负路径：异 principal/异 briefcase/缺 briefcase/authorless 均不产生目标；`off` 回滚路径保持旧行为。

---

## 8. 残留、风险与未决

1. **未跑真实栈**：本切片仅用 StandaloneDb 与进程内 HubMock；真实 Hub changeset/push、Postgres/Azurite、双用户部署 canary 未验证。不得据此宣称生产就绪。
2. **读不再隐式初始化**：依赖「打开文档后读一次即建 schema/body」的旧客户端会看到空树，直到首次显式写。已提供 `FEATURE_READ_INIT_MODE=legacy-write` 回滚，但该模式重新引入读写库风险（仅回滚窗口使用）。
3. **旧数据显示迁移延迟**：有旧草图 geometry stream/placement 不一致的文档，在读路径不会自动修复；在下次显式写初始化前可能继续显示重复/错误位置。属有意延迟，不是读路径失败。
4. **旧 schema 升级延迟**：缺 `PartStudioVariables` 类的旧库读变量返回空；写初始化才升级。
5. **半图/损坏图**：读面按现存分区诚实返回，写路径以稳定错误拒绝；没有自动 repair 的读通道。
6. **undo 语义 delta**：本切片按 W3 要求以 principal+briefcase 取代「仅 sessionId」；与 `SESSION-ISOLATION-DESIGN.md` §5.3 的 per-session 文字不同，需 ADR-G0-10 D-C 修订确认。旧行无 author/缺 briefcase 在 enforce 下不可撤销，可能出现一次性 UX 影响。
7. **未解决的两层 undo/操作组**：原生 undo 与 OpLog 顺序、X-05 草图可逆性、X-15 跨 push undo 深度仍按 ADR-G0-10 保持 open。
8. **单进程/单写槽**：`SessionRegistry` 的 writable slot 是进程内；多实例 lease/fencing（C5）未做。测试中的双 briefcase handoff 通过 detach/attach 模拟，不等于并发双写。
9. **只读读面的派生数据**：`getMassProperties` 读取持久 body 几何（测试证明零事务），但其结果精度仍受既有 1e-4/0.02 容差约束；不属本切片。
10. **拾取解析的 native 几何缓存**：`resolveEdgeRef/resolveFaceRef` 经 `SolidModelingCommand.createElementGeometryCache` 建 native 几何缓存。工作树探针（StandaloneDb，真 DgnBox）显示该操作不改变 `getCurrentTxnId`/`db.changeset`，但它不是图写路径，未被本切片的 briefcase 零写矩阵覆盖；若未来 native 把缓存纳入 changeset，需单独收紧。
11. **未改文件面**：`pepCoverage.ts`、BFF、retry/export/assembly、Hub 路由与 ACL 由 B3.1f-a 所有；本切片未触碰。

---

## 9. 评审结论

- 复用矩阵完成：是（iTwin 事务/会话/OpLog 全部复用，无第二套模型/状态机）。
- 跨仓影响明确：是（MS + 公共文档；无 shared/schema/native 契约变更）。
- P0 例外：无新增；X-05/X-15 仍 open，未借本切片关闭。
- ADR：需要 ADR-G0-10 D-C 文字修订确认（principal+briefcase），本次未新增 ADR。
- 结论：**修改后批准（条件：真实栈双用户/只读 canary 与 ADR 文字确认未完成前，不得宣称 W3/G1 完成）**。
