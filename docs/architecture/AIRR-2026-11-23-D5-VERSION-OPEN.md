# AIRR — G1 D5 只读版本打开（version open）

- 标题：G1 D5 `downloadVersionBriefcase` / `openCheckpoint`：按 changesetId/index 或 Named Version 只读打开
- 日期：2026-11-23
- Owner：平台/账本（modeling-server / shared 契约）
- 关联需求：`G1-EXECUTION-PLAN.md` D5（`openCheckpoint/version 参数；按 changesetId/versionId 只读打开`）；`CHECKPOINT-GENERATOR-DESIGN.md` §1.2/§4.1/§4.4/§6.4/§7.3-8；`ADR-G0-04`（Proposed）
- 影响仓：公共仓 `tiangong-kaiwu`（`@luban-cad/shared` additive IPC 契约 + 文档）；私有仓 `luban-backend/modeling-server`（IPC handler + Hub 版本解析）；`imodelhub-services` **只读消费既有 checkpoint/Named Version 读取端点，不修改**
- 是否需要 ADR：**需要**。新增跨仓 IPC 方法属 P0-07 契约变更；见 `docs/adr/0026-version-open-readonly-contract.md`（Proposed）。本 AIRR 不替代 ADR 签字。
- 状态：**Proposed under owner directive（2026-11-23）**。未获 ARB 签字；不勾选任何 G1 Gate。隔离 D5 canary 已完成 NV/index/id 只读打开、几何/树、head 不变、写拒绝（PASS）；canary 发现 baseline `changesetId=""` 解析失败与绝对路径日志泄漏两个缺陷，已修复+单测，**待 canary 重跑**（X-25 仍 open）。

---

## 1. 目标与验收

### 目标

1. **按不可变目标只读打开**：调用方可以指定 `changesetId`、`changesetIndex`（含 0=baseline）或 `namedVersionId`，后端解析到精确的 changeset id/index 后，下载并打开该版本的只读 briefcase。
2. **不动 head**：不获取 briefcase id、不拿写租约、不 save/push、不创建 changeset；目标下载使用 `BriefcaseManager.downloadBriefcase({ briefcaseId: 0, asOf })`（D4 canary 已验证的只读路径）。
3. **缓存隔离**：版本文件使用目标派生的缓存键（`<session>/<iModelId>/versions/v<index>-<changesetId|baseline>.bim`），永不复用 latest-head 的 `<briefcaseId>.bim`（只读 head 为 `0.bim`）；版本记录不参与 latest-head 的幂等查找。
4. **只读契约**：打开的记录 `mode=readonly`；之后 `saveChanges`/`pushChanges`/`pullChanges`/`abandonChanges` 等写标记入口一律 403 `SessionOwnership`；对版本文件的可写 `openBriefcase` 也 403（不依赖 shadow 窗口）。
5. **失败关闭**：缺失/未封账/未 ready/不支持的 target、Hub 5xx/超时、下载身份不符均返回稳定错误码，绝不回退到 head。
6. **会话边界**：无已验证 `/ipc` 连接会话时拒绝；缓存路径只能由服务端生成并落在该会话目录内。

### 可观察验收

- shared 契约单测：`LUBAN_IPC_INTERFACE_VERSION=1.1.0`；`downloadBriefcase` 签名逐字不变；新方法为 additive。
- MS 单测：changeset id/index/baseline/Named Version 解析；409/404/422/5xx 分类；缓存键隔离；无写租约/无 briefcase id；下载身份不符拒绝；只读后 save/push/pull/abandon 拒绝；无会话拒绝。
- **真栈（blocked until canary）**：见 §7.3 的命令；打开后几何/树、目标 changeset、Hub head 不变、日志无 token/SAS。
- 不勾选 G1 Gate。

### 非目标（明确不做）

- **不做 restore/compare**（D7）、不做差异/元素级 diff。
- **不做可写版本 checkout**、不做 version branch/merge、不做多版本并行编辑。
- **不做 UI 波次**（无版本面板/按钮/e2e UI）；不改 Part Studio 特征/草图/求值。
- **不做 D3 clone/fork**、D6 Named Version UI/事件/计数、GC/scrubber。
- **不修改 Hub**：不新增/修改公共 DTO、不迁移数据库、不改 checkpoint-worker。
- **不启用任何 flag、不部署、不 commit/push**。
- 不支持 shared briefcase 布局下的版本打开（显式 `VersionOpenUnsupported`；见 §5.4）。

---

## 2. 关联项目能力清单

| 项目/仓 | 相关能力 | 现有 API/工具/实现 | 版本/路径 | 结论 |
|---|---|---|---|---|
| itwinjs-core | 只读 briefcase 下载 + changeset apply；`openCheckpoint` AppFunction | `BriefcaseManager.downloadBriefcase({ asOf, briefcaseId:0 })`（D4 worker/canary 已用）；`IpcAppFunctions.openCheckpoint(OpenCheckpointArgs)`；`SnapshotDb.openCheckpoint` | `link:../../tiangong-kaiwu/itwinjs-core`；`core/backend/src/BriefcaseManager.ts`、`IpcHost.ts`、`IModelDb.ts` | **复用**；不改 itwinjs-core |
| itwinjs-core | `OpenCheckpointArgs` 目标表达 | `{ iTwinId, iModelId, changeset?: ChangesetIndexOrId }`（无 namedVersionId） | `core/common/src/BriefcaseTypes.ts` | 复用标准 AppFunction 的 id/index；Named Version 走 additive IPC |
| imodelhub-services | 目标 changeset / checkpoint / Named Version 读取 | `GET /imodels/:id/changesets/:idOrIndex`；`GET /imodels/:id/changesets/:idOrIndex/checkpoint`（current-or-preceding successful）；`GET /imodels/:id/namedversions/:versionId`；`GET /imodels/:id/namedversions/:versionId/checkpoint`（409 `CheckpointNotReady`） | 当前源码（D4/D6a 已落地） | **只读复用**；零 Hub 改动 |
| imodelhub-services | 服务调用鉴权 | class-level JWT + `SystemAgentOrResourceGuard` `X-API-Key` | 同上；D4 worker 同模式 | 复用 |
| luban-backend/modeling-server | 会话/路径/所有权 | `SessionContext.require`、`sessionBriefcasePath`/`sessionDbPath`、`assertInsideSessionRoot`、`SessionRegistry` | `src/session/*` | **扩展**：新增 `sessionVersionDbPath`、`findOwnVersion`；latest-head 查找跳过版本记录 |
| luban-backend/modeling-server | IPC 下载/打开 | `LubanIpcHandler.downloadBriefcase`、`AppFunctionIpcHandler.openBriefcase`/`openCheckpoint` 桩 | `src/ipc/*` | **扩展**：additive 方法；实现 `openCheckpoint` 桩；只读守卫 |
| luban-backend/modeling-server | Hub REST 客户端 | `ServiceAccountAuthClient` + `IModelHost.getAccessToken()` + `IModelHost`/`BackendIModelsAccess`；`createIModelsClient` X-API-Key 模式 | `src/auth/*`、`src/hub/createIModelsClient.ts`、`src/main.ts` | **复用**：新 resolver 用同一服务 JWT + `X-API-Key`，不引入第二套认证 |
| luban-backend/checkpoint-worker | 只读版本下载路径先例 | `NativeCheckpointGenerator` 的 `downloadBriefcase({briefcaseId:0,asOf})` + D4 shim-free native canary | `checkpoint-worker/src/native/nativeCheckpointGenerator.ts`；`G1-WAVE2-STATUS` §6 | **复用模式**；不修改 worker |
| @luban-cad/shared | 跨仓 IPC 契约 | `LubanIpcInterface`（1.0.0 行为：downloadBriefcase/assembly） | `packages/shared/src/LubanIpcInterface.ts` | **扩展**：additive 方法 + 显式 `LUBAN_IPC_INTERFACE_VERSION=1.1.0` |

---

## 3. 复用决策矩阵

| 需求能力 | 候选复用 | 覆盖度 | 决策 | 不新建的理由/新建的理由 | 许可证 |
|---|---|---|---|---|---|
| 版本内容获取 | `BriefcaseManager.downloadBriefcase({asOf,briefcaseId:0})` | 高：D4 native canary 已证明从 Hub 解析 nearest checkpoint 并 apply 到目标 | **复用** | 官方路径、Hub 现签短 TTL 读 SAS、无 briefcase id/写路径 | iTwin 许可 |
| 目标 changeset 校验 | Hub `GET changesets/:idOrIndex` + `state=fileUploaded` | 高 | **复用** | 与 D4 worker 同源；不读 DB | 项目内 |
| checkpoint 解析 | Hub `GET changesets/:idOrIndex/checkpoint`（current-or-preceding） | 高 | **复用** | D4 已修复投影：只返回 `successful`，否则 preceding successful；无则 404 | 项目内 |
| Named Version 解析 | Hub `GET namedversions/:id` + `GET namedversions/:id/checkpoint` | 高：D6a 已实现 exact index + 409 | **复用** | 不复制 NV→checkpoint 状态机；409 原码上抛 | 项目内 |
| 标准 AppFunction | `IpcAppFunctions.openCheckpoint(args)` | 中：仅 changeset id/index，无 NV | **实现桩**，复用同一服务 | 保持官方签名；NV 走 additive IPC | iTwin 许可 |
| 直接 cloud checkpoint 打开 | `SnapshotDb.openCheckpoint` / `V2CheckpointManager.attach` | 中：打开的是 checkpoint 自身 changeset（current-or-preceding），**不保证 apply 到任意目标 index** | **不选为 D5 主路径** | D5 要求精确 target；下载+apply 路径已由 D4 证明。可作为后续性能优化（目标恰有 checkpoint 时） | iTwin 许可 |
| 缓存/所有权 | C2b per-session 布局 + `SessionRegistry` | 高 | **扩展** | 新增 version 绑定/查找；不建第二套会话表 | 项目内 |
| 客户端路径 | 无（服务端派生） | — | **不新增** | 禁止客户端路径；与 C6 路径白名单一致 | — |

---

## 4. 跨仓影响

| 仓/层 | 契约 | schema/迁移 | native/接口 | 测试 | 发布 |
|---|---|---|---|---|---|
| shared | `LubanIpcInterface` **1.1.0**：`downloadVersionBriefcase` + `VersionOpenTarget/Request/ResolvedTarget/Result`；`downloadBriefcase` 不变 | 无 | 无 | `LubanIpcInterface.test.ts`；shared build/`test:types` | shared → backend → web 同批；web 无调用方 |
| modeling-server | 新 `src/version/*`；IPC handler 新方法/实现 openCheckpoint；只读守卫 | 无 | 只消费 itwinjs-core 公开 API | 新增 4 个 suite（resolver/service/logSafeKey/openCheckpoint）；现有 IPC/session suite 回归 | 新 MS 产物；canary 部署后才可真栈证明 |
| web/viewer | 无改动（无 UI 波次） | 无 | 无 | 不新增 | 不阻塞；保持旧客户端可用 |
| imodelhub-services | **无改动**；只读消费既有路由 | 无 | 无 | 不新增（用 D4/D6a 既有证据） | 无 |
| checkpoint-worker | 无改动 | 无 | 无 | 无 | 无 |
| itwinjs-core/imodel-native | 无改动；只消费 `BriefcaseManager`/`IModelVersion` | 无 | 无 | 无 | 无 |

- 版本兼容：shared 1.0.0 客户端不调用新方法即可继续使用 `downloadBriefcase`；新方法为纯增量。旧 MS 不实现新方法时，新客户端会在 IPC 调用期得到 not-implemented（发布顺序必须 shared → backend）。
- **contract-freeze 清单**：`docs/architecture/contract-freeze.json` 只冻结带 `static interfaceVersion` 的 RPC 类（`LubanFeatureRpcInterface`/`LubanRpcInterface`）；`LubanIpcInterface` 是 IPC 接口（无类静态版本），当前工具不覆盖。故本切片不更新该清单，改由 `LUBAN_IPC_INTERFACE_VERSION` + 接口冻结矩阵登记。若后续扩展冻结工具支持 IPC 接口，应把该文件纳入并冻结 1.1.0。
- 配对发布：shared → backend → web；本轮 web 不消费，仍按同批列车发布 shared/MS，避免版本漂移。

---

## 5. 设计

### 5.1 目标身份

共享请求只有三个可选 selector，**恰一**：

| selector | 解析 | 目标身份 |
|---|---|---|
| `changesetId` | Hub `GET changesets/:id`（40-hex、`state=fileUploaded`） | 该 id + index |
| `changesetIndex` | Hub `GET changesets/:index`；`0` = baseline | 该 index 对应 id（0 时 id=`""`） |
| `namedVersionId` | Hub `GET namedversions/:id` + `GET namedversions/:id/checkpoint` | NV 绑定的 changeset id/index；checkpoint 必须 `successful` 且同 index |

返回 `requested`（原 selector）与 `target`（解析后的不可变 changeset id/index，NV 时含 `namedVersionId`）以及 `checkpoint`（本次解析到的 successful checkpoint 基点）。客户端不需要也不允许传文件路径/URL/SAS。

### 5.2 Additive IPC 契约

```ts
export const LUBAN_IPC_INTERFACE_VERSION = "1.1.0";

export interface VersionOpenTarget {
  changesetId?: string;
  changesetIndex?: number;
  namedVersionId?: string;
}

export interface VersionOpenRequest {
  iTwinId: string;
  iModelId: string;
  target: VersionOpenTarget;
}

export interface VersionOpenResult {
  fileName: string;          // 服务端会话目录内的键
  briefcaseId: number;       // 恒 0
  changeset: { id: string; index: number };
  requested: VersionOpenTarget;
  target: { changesetId: string; changesetIndex: number; namedVersionId?: string };
  checkpoint: { changesetId: string | null; changesetIndex: number };
  readonly: true;
}

interface LubanIpcInterface {
  downloadBriefcase(iTwinId: string, iModelId: string, readonly?: boolean): Promise<BriefcaseDownloadResult>; // unchanged
  downloadVersionBriefcase(request: VersionOpenRequest): Promise<VersionOpenResult>; // additive
  // createAssembly/listAssemblies unchanged
}
```

不使用 `openVersion` 命名以避免与“已经打开 db”混淆：本方法与 `downloadBriefcase` 一样只负责下载；打开仍走标准 `BriefcaseConnection.openFile({ fileName, readonly: true })`。标准 AppFunction `openCheckpoint(args)` 则由 MS 内部复用同一服务并打开只读 db。

### 5.3 标准 AppFunction `openCheckpoint`

`IpcAppFunctions.openCheckpoint({ iTwinId, iModelId, changeset? })` 的官方类型只表达 changeset id/index：

- `changeset` 存在：优先 id，否则 index；按 §5.1 解析并下载。
- `changeset` 缺省：经 Hub `GET changesets?$top=1&$orderBy=index desc` 解析最新封账 changeset；空文档回退 baseline index 0。
- 下载后调用现有 `openBriefcase({ fileName, readonly: true, key })`，复用 C2/C6 的路径/会话/所有权守卫。
- **Named Version 不在标准参数内**；客户端用 `downloadVersionBriefcase({target:{namedVersionId}})` 获取只读文件后再 `openFile`。

官方 `SnapshotDb.openCheckpoint` 只 attach current-or-preceding checkpoint（不 apply 到任意 changeset），因此不作为 D5 主路径；本切片不修改 itwinjs-core。

### 5.4 缓存键与会话边界

- 仅支持 `SESSION_BRIEFCASE_LAYOUT=per-session`（默认）；shared 回滚布局显式 `VersionOpenUnsupported`（409），不伪造共享路径。
- 路径：`<BRIEFCASE_CACHE_LOCATION>/sessions/<sessionId>/<iModelId>/versions/v<index>-<changesetId|baseline>.bim`。
  - `<index>` 是解析后的 changeset index；`<changesetId>` 小写 40-hex；baseline 用 `baseline`。
  - 与 latest-head 的 `<iModelId>/0.bim`（只读）或 `<briefcaseId>.bim`（可写）**不在同一目录**。
- 会话注册：`BriefcaseRecord.mode='readonly'`，`briefcaseId=0`，`version` 绑定（changeset/index/NV/checkpoint）。
- `SessionRegistry.findOwnByDoc`（latest-head 幂等查找）跳过带 `version` 的记录；`findOwnVersion` 仅按目标键匹配。打开后 `_registerOpenedBriefcase` 保留 `version` 绑定。
- 同一 `(session, iModelId, versionKey)` 的并发请求进程内 single-flight；不同目标/不同会话永不共享文件。
- 下载完成后用 `resolveCacheDbFile` + `assertInsideSessionRoot` 复核路径在该会话目录内；不符即删文件并 `VersionOpenMismatch`。

### 5.5 只读与 head 不变

- `downloadBriefcase({briefcaseId:0, asOf})`：不获取 briefcase id，不拿写租约，不 push。
- 版本记录 `mode=readonly`；`saveChanges`/`pushChanges` 对 `version` 记录在 **off/shadow/enforce 全部模式**拒绝（403 `SessionOwnership`）；对版本文件的可写 `openBriefcase` 同样拒绝，不依赖 shadow 窗口。
- 服务不调用 `BriefcaseManager.releaseBriefcase`（未获取 id）、不调用任何 save/push、不写 Hub。
- 打开的只读 db 仍可正常 `closeIModel`；会话关闭时按 C2b 清理规则删除（只读文件无未推送工作）。

### 5.6 失败语义

| 场景 | 错误码 | HTTP 语义（IPC `statusCode`） | 行为 |
|---|---|---|---|
| selector 缺失/多个/格式错 | `VersionTargetInvalid` | 400 | 不发 Hub |
| shared 布局 | `VersionOpenUnsupported` | 409 | 不下载 |
| changeset 不存在 | `ChangesetNotFound` | 404（上游） | 不下载 |
| changeset 未封账 | `CheckpointTargetNotUploaded` | 409（含 state） | 不下载 |
| 目标前无 successful checkpoint | `CheckpointNotFound` | 404（上游）/409（下载期） | 不下载/不回退 head |
| Named Version 不存在 | `NamedVersionNotFound` | 404（上游） | 不下载 |
| Named Version checkpoint 未 ready | `CheckpointNotReady` | 409（`upstreamCode`/`state`/`Retry-After`） | 不下载 |
| Hub 401/403 | `VersionOpenHubAuthFailed` | 502 | 不下载（服务身份配置问题） |
| Hub 5xx/超时/网络 | `VersionOpenHubUnavailable` | 503 + retryAfter 30 | 不下载 |
| Hub 响应畸形/身份不符 | `VersionOpenMismatch` | 502 | 删文件、不注册 |
| 下载后 changeset 不符 | `VersionOpenMismatch` | 502 | 删文件、不注册 |
| 无连接会话 | `SessionRequired` | 401 | 不解析/不下载 |
| 其它下载失败 | `VersionOpenHubUnavailable`（503） | 503 | 删 partial；日志只记错误名，不回显 URL/SAS |

所有错误消息不含服务端路径、Hub URL、token、SAS。`serializeIpcError` 会带 `code/statusCode/upstreamCode/state/retryAfterSeconds`。

### 5.7 性能与规模

- 单次解析最多 2 个 Hub GET（changeset + checkpoint；NV 2 个）+ 一次 native 下载（nearest checkpoint + 余下 changesets）。
- 同版本重复打开在会话内命中缓存（不重复下载）；不同版本各自缓存。
- 未做 200/1000 changeset 的版本打开 p50/p95 基线（blocked，见 §7.3）；不能宣称达标。

### 5.8 Canary follow-up fixes（2026-11-23）

隔离 D5 canary 已执行 NV/index/id 只读打开、几何/树可见、head 不变、写拒绝，均通过；同时发现两个真实缺陷，已在本切片修复并用单测钉住：

1. **Baseline index 0 解析失败**：Hub baseline checkpoint 的 `changesetId` 实际为 `""`，原 `parseCheckpoint` 只接受 null/undefined，导致 `VersionOpenMismatch 502`。
   - 修复：`changesetIndex === 0` 时接受 `""`/null/undefined 并统一归一化为 `changesetId: null`；`changesetIndex > 0` 仍强制 40-hex，空/null 一律 `VersionOpenMismatch`（fail-closed，不伪造 checkpoint）。
   - 测试：baseline `""` 解析、preceding baseline（目标 index>0 但 checkpoint 为 baseline）、非 baseline 空/null/非法 id 负例、NV checkpoint 空 id 负例。
2. **服务端路径日志泄漏**：`AppFunctionIpcHandler` 的 `Opening briefcase with key: <abs path>` 与 closing 日志回显绝对缓存路径（含驱动器/会话目录）。
   - 修复：新增 `utils/logSafeKey.ts`，path-like key 只输出 `path:<basename>`（去驱动器/目录/分隔符；控制字符清理；逻辑 key 原样）；`AppFunctionIpcHandler` 与 `LubanIpcHandler` 的 key/fileName 日志全部改用该 helper；抛给客户端的 undo/reinstate 错误消息也不再带绝对路径。
   - 测试：`logSafeKey.test.ts`（Windows/POSIX/UNC/drive-relative/逻辑 key/空值/控制字符），以及 handler 级 spy 断言 open 日志含 `path:` 且不含 cache root/`sessions`/分隔符。
   - **残余**：native loader / 既有 `logger.error(err.message)` / `err.stack` 仍可能自行打印宿主路径或堆栈；本次不声称“所有三方路径日志已清除”，canary 日志检查需区分本切片 key 日志与 native 自身输出。
3. **分类改进（不改变 fail-closed）**：畸形 `iTwinId/iModelId` → `VersionTargetInvalid 400`（仍是服务端白名单校验）；下载期 iTwin/changeset 身份不符 → `VersionOpenMismatch 502`，不再落入通用 503；未知错误仍 503。

X-25 保持 open：上述修复必须经 canary 重跑 baseline 与日志检查后才能关闭。

---

## 6. 数据/事务/安全

- 数据事实源：iModel/BIS + changeset 账本；版本文件只是只读派生缓存，可丢弃。
- schema/迁移：无。
- 事务：无 BriefcaseTxns 写事务；下载 uses unassigned briefcase；`saveChanges/pushChanges` 被拒。
- 写租约/权限：不获取写租约；不 reserve document；Hub 调用使用服务 JWT + `X-API-Key`（与 D4/现有数据面一致），**未新增 per-doc ACL 强制**（B3 未完成，沿用 G1 现状；部署说明不得宣称 ACL 已闭环）。
- 密钥/日志：不记录 Authorization、X-API-Key、SAS、完整 URL；错误消息不回显 native/Hub 响应体。
- 审计：MS 记录 `iModelId/changesetIndex/selector`；Hub 侧数据面读取走现有访问日志（B7 append-only 审计未完成）。

---

## 7. 测试证据

### 7.1 已执行（代码/单元）

| 命令 | 结果 |
|---|---|
| `luban-cad/packages/shared`: `corepack pnpm@10 run build` | tsc 成功 |
| `luban-cad/packages/shared`: `corepack pnpm@10 test` | **12 files / 343 tests passed**（含 `LubanIpcInterface.test.ts`；`tsconfig.test.json` 类型检查） |
| MS: `npx tsc --noEmit` | **0 errors** |
| MS: `npx vitest run src/version src/utils/logSafeKey.test.ts src/ipc/AppFunctionIpcHandler.versionOpen.test.ts` | **4 files / 42 tests passed**（全部为 D5 新增；含 resolver/service、日志脱敏、openCheckpoint/只读守卫） |
| MS: 现有 IPC/session 回归（`LubanIpcHandler.*`、`AppFunctionIpcHandler.*`、`PathGuard`、`BriefcaseFiles`、`sessionCleanup`） | **10 files / 58 tests passed** |
| MS: 全量 `npx vitest run` | 修复后干净复跑 **153 files / 1501 passed + 1 expected fail + 8 skipped**。首次修复后复跑出现 1 次 transient unhandled error（152/153 files，1499 passed），立即干净复跑通过；此前一次 `PartStudioMigration.test.ts` `beforeAll` 负载超时隔离重跑 13/13。均为既有测试 flake，如实记录。 |
| public: `node scripts/check-contract-freeze.mjs` + `node --test scripts/check-contract-freeze.test.mjs` | 契约门 **OK**（`LubanFeatureRpcInterface` 1.85.0、`LubanRpcInterface` 1.1.0 未漂移）；工具测试 **8/8 passed**。`LubanIpcInterface` 不在该 manifest 覆盖范围（见 §4）。 |

新增覆盖：changeset id/index/baseline/NV 解析；**baseline `changesetId:""` 归一化为 null、非 baseline 空/null/非法 id 拒绝**；NV 409 `CheckpointNotReady`（upstream code/state/Retry-After）；404/422/5xx/网络；selector 歧义；Hub 响应畸形；latest；缓存键 `versions/v<index>-<id>.bim` ≠ `0.bim`；无 briefcase id/写租约；下载身份不符（iTwin/changeset 分类）；partial 清理；会话中途关闭；打开后 save/push/pull/abandon 403；可写重开 403；无会话拒绝；**key 日志只输出 `path:<basename>`（helper + handler spy）**。

### 7.2 未执行/blocked

- **隔离 D5 canary（2026-11-23）已执行且通过**：Named Version/index/id 只读打开、几何/树可见、Hub head 不变、写操作 fail-closed。证据由 canary agent 持有；本仓只记录结论，不粘贴私有环境证据。
- **canary 发现并已修复、等待重跑**：
  1. baseline index 0 的 Hub checkpoint `changesetId=""` 被旧解析拒绝 → 已改为 index 0 接受并归一化 null，非 baseline 仍 40-hex；
  2. `AppFunctionIpcHandler` 的 open/close key 日志回显绝对缓存路径 → 已改用 `safeKeyForLog`（`path:<basename>`），并覆盖 LubanIpcHandler 的 fileName 日志。
- **重跑前仍 blocked**：baseline index 0 的真实栈打开、日志绝对路径 grep、非 NV `changesetIndex` 重跑、200/1000 性能基线。
- **残余**：native loader / 既有 `logger.error(err.message)` / `err.stack` 仍可能自行输出宿主路径；不由本切片 key 日志 helper 覆盖，canary 日志检查需区分。
- per-doc ACL/真实用户归因未接入（B3/B2），不得宣称版本打开已按用户 ACL 授权。

登记例外 **X-25**（`EXCEPTIONS.md`）：D5 功能 canary 部分通过但存在上述修复待重跑；未关闭前不得宣称 D5 完成或勾选 G1 Gate。

### 7.3 真栈 canary 步骤（部署后执行）

前置：新 Hub（含 D4/D6a 当前源码）与新 MS 产物已部署到隔离 canary；`SESSION_ISOLATION_MODE=enforce`、`SESSION_BRIEFCASE_LAYOUT=per-session`；存在一个至少 3 个 changeset 的种子 iModel，且有一个真实 Named Version（其 checkpoint `successful`）。

当前 viewer 只在 hook 内部创建 `IpcApp.makeIpcProxy('luban-ipc')`，没有全局句柄。为 canary 采集证据，使用**临时、不提交**的本地探针（本轮不新增 UI）：

```ts
// canary-only patch（本地运行后还原；不得提交）：
// 在已建立 /ipc 连接的页面 effect 中：
const ipc = IpcApp.makeIpcProxy<LubanIpcInterface>('luban-ipc');
(window as any).__lubanIpc = ipc;
(window as any).__ipcApp = IpcApp;
```

```bash
# 0) 记录 canary head（只读）
curl -s -H "Authorization: Bearer $USER_TOKEN" \
  "$HUB/imodels/$IMODEL/changesets?%24top=1&%24orderBy=index%20desc"

# 1) Playwright page.evaluate：先验证 baseline index 0（canary 缺陷回归）
#    const b = await window.__lubanIpc.downloadVersionBriefcase({
#      iTwinId: ITWIN, iModelId: IMODEL, target: { changesetIndex: 0 } });
#    期望：b.briefcaseId === 0；b.readonly === true；
#          b.target.changesetId === ''；b.checkpoint.changesetId === null；
#          下载成功（不得再报 VersionOpenMismatch）。
#    再按 Named Version 只读下载：
#    const r = await window.__lubanIpc.downloadVersionBriefcase({
#      iTwinId: ITWIN, iModelId: IMODEL,
#      target: { namedVersionId: NV_ID } });
#    期望：r.briefcaseId === 0；r.readonly === true；
#          r.target.changesetId/index === NV 绑定点；
#          r.fileName 含 /sessions/<sid>/<iModelId>/versions/。
#    再以 target: { changesetIndex: 1 } 重复一次，验证非 NV selector 解析。

# 2) 打开并断言几何/树
#    const p = await window.__ipcApp.appFunctionIpc.openCheckpoint({
#      iTwinId: ITWIN, iModelId: IMODEL,
#      changeset: { id: r.target.changesetId, index: r.target.changesetIndex } });
#    断言 p.key / changeset 为目标；视口几何/特征树与 NV 版本一致。
#    也可对步骤 1 的 fileName 调
#      window.__ipcApp.appFunctionIpc.openBriefcase(
#        { fileName: r.fileName, readonly: true, key: r.fileName })
#    二者必须走同一只读路径。

# 3) head 不变
curl -s -H "Authorization: Bearer $USER_TOKEN" \
  "$HUB/imodels/$IMODEL/changesets?%24top=1&%24orderBy=index%20desc"
#    期望：与步骤 0 逐字一致（无新 changeset）。

# 4) 写操作拒绝
#    await window.__ipcApp.appFunctionIpc.saveChanges(p.key)   → 403 SessionOwnership
#    await window.__ipcApp.appFunctionIpc.pushChanges(p.key, "x") → 403 SessionOwnership
#    await window.__ipcApp.appFunctionIpc.openBriefcase(
#      { fileName: r.fileName, key: r.fileName, readonly: false }) → 403

# 5) 日志纪律
#    grep MS/nginx 日志：无 Bearer/JWT、X-API-Key、SAS、完整签名 URL；
#    仅 method+pathname 与 iModelId/index/selector。
#    grep -E 'Opening briefcase with key|Closing existing db.*key' 日志：
#      必须形如 path:<basename>，不得含 cache root、sessions/、驱动器或分隔符。
#    native loader / err.stack 可能仍打印宿主路径；单独记录为残余，不与本切片 key 日志混淆。
```

证据必须包含：步骤 0/3 head 对比、步骤 1 的 baseline 归一化、步骤 2 的 changeset id/index 与几何/树截图或断言、步骤 4 的 403 code、步骤 5 的 key 日志 grep（区分 native 自身路径残余）、步骤 1/2 的耗时。未附重跑证据不得宣称 D5 通过。

---

## 8. 回滚与发布

- 回滚：移除/停止调用 `downloadVersionBriefcase`/`openCheckpoint` 即可；已有版本文件可按会话清理规则删除，不影响 head/账本。
- shared 回滚：新方法为 additive；旧 MS 不认识时只有新客户端调用失败，old latest-head 不受影响。发布顺序必须 shared → backend；不要先发布只消费新方法的 web（本切片 web 无改动）。
- Hub：无变更，无需回滚。
- 数据迁移：无。
- 发布门：shared build/单测 + MS tsc/单测；真栈 canary（§7.3）后才可把 D5 状态从 blocked 改为 verified；G1 Gate 仍由评审统一签字。

---

## 9. P0 例外登记

| ID | 规则 | 例外/债务 | 影响 | Owner | 失效日期 | 退出计划 |
|---|---|---|---|---|---|---|
| X-25 | P1-06 / P0-04（真栈证据） | **状态 2026-11-23**：隔离 D5 canary 已通过 NV/index/id 只读打开、几何/树、head 不变、写拒绝；发现 baseline `changesetId=""` 解析失败与 key 日志绝对路径泄漏，代码+单测已修复（baseline 归一化、`safeKeyForLog`、身份错误分类），**待 canary 重跑**。 | 不得宣称 D5 完成或 G1 Gate 通过；不得宣称版本打开已具备 per-doc ACL；native loader/err.stack 路径残余未覆盖。 | 平台/账本（MS+shared） | 2027-03-31（季度复核） | 重跑 AIRR §7.3 步骤 0–5：baseline index 0 成功且 checkpoint.changesetId=null、NV/index/id 几何/树、head 一致、写 403、key 日志仅 `path:<basename>`；附证据回填后由 owner 关闭。 |

> 不登记新的 Hub 例外：Hub 无变更；Named Version 未 ready 的 409 属 D6a 既有语义（X-17 仍约束 checkpoint 生成默认关闭）。

---

## 10. 评审结论

- 复用矩阵完成：是
- 跨仓影响明确：是（shared additive + MS；Hub/web/worker 无改动）
- P0 例外已登记：是（X-25；不新增 Hub 例外）
- ADR：需要（`docs/adr/0026-version-open-readonly-contract.md`，Proposed）
- Owner 签字：待（本 AIRR 依 owner 指令先行实现，未获 ARB 签字）
- 结论：**Proposed under owner directive；canary 部分通过，两个缺陷已修复待重跑；不构成 D5 完成或 G1 Gate 通过。**
