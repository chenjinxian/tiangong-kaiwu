# ADR-0026 — Read-only version open: additive `LubanIpcInterface` contract

- 状态：Proposed（Owner 待签字；未 ARB 签字）
- 日期：2026-11-23
- 关联：AIRR `docs/architecture/AIRR-2026-11-23-D5-VERSION-OPEN.md`；G1 D5；`ADR-G0-04`（Proposed）；`CHECKPOINT-GENERATOR-DESIGN.md` §4/§7
- 影响仓：`tiangong-kaiwu`（`@luban-cad/shared` 契约、文档）；私有 `luban-backend/modeling-server`；`imodelhub-services` 只读消费既有端点，无改动

## 1. 背景

G1 D5 要求“按 changesetId/versionId 只读打开版本，head 不变”。当前事实：

- `LubanIpcInterface.downloadBriefcase(iTwinId, iModelId, readonly?)` 只表达 latest-head；其返回值/缓存键（`<session>/<iModelId>/0.bim` 或 `<briefcaseId>.bim`）没有版本身份。
- `IpcAppFunctions.openCheckpoint(args)` 是标准 AppFunction，但 MS 侧是抛错桩；官方类型 `OpenCheckpointArgs` 只支持 `{changeset:{id|index}}`，不能表达 Named Version id。
- Hub 已有读取端点：changeset by id/index、current-or-preceding checkpoint、Named Version、Named Version checkpoint（未 ready 409）。
- D4 worker/canary 已验证 `BriefcaseManager.downloadBriefcase({ briefcaseId:0, asOf })` 能从 Hub 解析 nearest checkpoint、apply 到目标并只读打开。

因此需要一个**跨仓契约**把“不可变版本目标”传给 MS，同时保持 latest-head 方法不变。

## 2. 决策

### D1. 新增 additive IPC 方法，不修改 `downloadBriefcase`

在 `LubanIpcInterface` 新增：

```ts
downloadVersionBriefcase(request: VersionOpenRequest): Promise<VersionOpenResult>;
```

`VersionOpenRequest` 包含 `iTwinId`、`iModelId` 和恰一 selector（`changesetId` / `changesetIndex` / `namedVersionId`）；`VersionOpenResult` 返回服务端文件键、`briefcaseId: 0`、精确 changeset、`requested`/`target`/`checkpoint` 身份和 `readonly: true`。

`downloadBriefcase` 的签名、latest-head 语义、返回 DTO 和缓存键**逐字不变**。

### D2. 显式 IPC 契约版本

新增 `LUBAN_IPC_INTERFACE_VERSION = "1.1.0"`：

- 1.0.0 = latest-head `downloadBriefcase` + assembly helpers；
- 1.1.0 = additive `downloadVersionBriefcase`。

`@luban-cad/shared` 发布时按 P0-07 bump 版本并双端同批；旧客户端不调用新方法即完全兼容。

### D3. 只读、无写租约、无 head 变更

- 服务端用 `BriefcaseManager.downloadBriefcase({ briefcaseId: 0, asOf: resolvedChangeset })` 下载。`briefcaseId: 0` 表示 unassigned/pull-only；不调用 `acquireNewBriefcaseId`、不 `reserveDocument`、不 save/push。
- 版本记录 `mode=readonly`；`saveChanges`/`pushChanges`/`pullChanges`/`abandonChanges` 等写标记入口对该记录在所有隔离模式下返回 403 `SessionOwnership`；可写 `openBriefcase` 同样拒绝。
- 下载后校验 `props.changeset.id/index === resolved target`，不符删除文件并失败关闭。

### D4. 目标解析走既有 Hub 读取端点

- changesetId/index：`GET /imodels/:id/changesets/:idOrIndex` 校验存在且 `state=fileUploaded`；再 `GET .../changesets/:id/checkpoint` 取 current-or-preceding successful。Hub baseline（index 0）的 `changesetId` 可能为 `""`/null，统一归一化为 null；非 baseline 必须 40-hex，空/null 即 `VersionOpenMismatch`（fail-closed）。
- Named Version：`GET /imodels/:id/namedversions/:versionId` + `GET .../namedversions/:versionId/checkpoint`；409 `CheckpointNotReady` **原码上抛**（含 state/Retry-After），不伪造 checkpoint、不回退 head。
- Hub 无改动；不新增公共 DTO；不读 DB。
- Hub 调用使用与 `BackendIModelsAccess` 相同的服务账号 JWT + `X-API-Key`；不接受客户端容器/URL/SAS。

### D5. 缓存键与会话

- 仅支持 per-session 布局（默认）；shared 回滚布局显式 409 `VersionOpenUnsupported`。
- 路径由服务端派生：`<cache>/sessions/<sessionId>/<iModelId>/versions/v<index>-<changesetId|baseline>.bim`；与 latest-head 的 `0.bim`/`<briefcaseId>.bim` 不共享。
- 版本记录带 `version` 绑定；latest-head 的 `findOwnByDoc` 跳过版本记录；`findOwnVersion` 只按目标键命中。
- 无连接会话 → 401 `SessionRequired`。

### D6. 标准 AppFunction `openCheckpoint`

实现 `AppFunctionIpcHandler.openCheckpoint(OpenCheckpointArgs)`：changeset id/index（缺省=最新封账 changeset/baseline）走同一 D5 服务，下载后以 `readonly: true` 复用现有 `openBriefcase` 打开。Named Version 不在标准参数内，客户端使用 `downloadVersionBriefcase` 后自行 `BriefcaseConnection.openFile({ readonly: true })`。

## 3. 备选方案

1. **给 `downloadBriefcase` 增加可选 target 参数**：否决。会改变 latest-head 方法的语义/缓存键，旧客户端兼容面不可控；违反“additive、可回滚”目标。
2. **新增 `LubanVersionRpcInterface`（RPC）**：否决。版本打开最终返回本地文件和只读连接，属 `/ipc` 本地能力；新增 RPC 只会扩大协议面，并需要额外版本握手，收益不足。
3. **官方 `SnapshotDb.openCheckpoint` 直接 attach checkpoint**：不作为 D5 主路径。它 attach current-or-preceding checkpoint，但不保证把 intervening changesets apply 到任意请求 index；对“按 changesetId 打开精确版本”不成立。保留为后续“目标恰有 checkpoint”时的性能优化候选。
4. **在 Hub 新增“version open”端点**：否决。Hub 的 changeset/NV/checkpoint 读取已足够；新增端点会把文件/本地连接语义带进控制面。
5. **可写版本 checkout / 多版本并行编辑**：主动排除（非目标），避免第二套写租约/undo 状态机。

## 4. 后果

### 正面

- latest-head 客户端零改动；shared 1.0.0 行为保持。
- 版本打开可组合既有 Hub 语义，Hub 零改动。
- 只读边界在服务端强制（记录 + 写操作拒绝），不依赖前端自律。
- 缓存键按不可变目标隔离，避免“打开版本却拿到 head 文件”。

### 负面/边界

- 每次新版本首次打开需下载 nearest checkpoint + 余下 changesets；200/1000 changeset 性能基线未测。
- 仅 per-session 布局；shared 回滚布局不可用。
- Named Version 必须 checkpoint ready（409）；在 `CHECKPOINT_GENERATION_ENABLED` 关闭期间，多数 NV 打开会 fail closed（X-17 既有边界）。
- 未接入 per-doc ACL/真实用户归因（B2/B3 未完成）；版本打开目前是“有会话 + 服务身份”的读，不是“按用户 ACL 的读”。
- 真实栈证据未执行（X-25），不得宣称 D5 完成。

### 契约冻结

`docs/architecture/contract-freeze.json` 当前只冻结带 `static interfaceVersion` 的 RPC 类，不覆盖 `LubanIpcInterface`。本 ADR 不修改该 manifest；版本以 `LUBAN_IPC_INTERFACE_VERSION` 和 `INTERFACE-FREEZE-MATRIX.md` 登记。若冻结工具扩展到 IPC 接口，需在同一 PR 冻结 1.1.0 表面。

## 5. 兼容与发布

- 发布顺序：shared（1.1.0）→ backend（MS）→ web（本轮无 consumer）。
- 旧 shared 客户端 + 新 MS：不受影响。
- 新 shared 客户端 + 旧 MS：只有调用新方法时失败（not implemented）；不得在 MS 之前发布依赖新方法的 web 功能。
- 回滚：停止调用新方法/回退 MS 产物；shared 新方法保留也无害。无 schema/数据迁移。

## 6. 安全

- 无客户端路径 authority；路径由服务端在会话目录内派生并二次校验；key/fileName 日志只输出 `path:<basename>`（无驱动器/目录/分隔符），native loader/error stack 路径为残余。
- Hub 凭据仅服务端持有（服务 JWT + `X-API-Key`）；不记录 token/SAS/签名 URL。
- 只读记录在 off/shadow/enforce 全部模式拒绝写操作（版本文件没有 shadow/off 兼容窗口）。
- 未新增 Hub 公共面；未扩大 API key 权限。

## 7. 参考

- `docs/architecture/AIRR-2026-11-23-D5-VERSION-OPEN.md`
- `docs/architecture/CHECKPOINT-GENERATOR-DESIGN.md` §4.1/§4.4/§6.4/§7.3
- `docs/architecture/INTERFACE-FREEZE-MATRIX.md`（`LubanIpcInterface` 1.1.0）
- `docs/architecture/G1-EXECUTION-PLAN.md` D5
- itwinjs-core `core/backend/src/BriefcaseManager.ts`、`core/common/src/BriefcaseTypes.ts`（`OpenCheckpointArgs`）
- Hub `src/imodels/checkpoints.controller.ts`、`named-versions.controller.ts`、`checkpoint-control-plane.service.ts`（当前源码）

## 8. 评审结论

- 状态：Proposed
- Owner 签字：待
- 未签字前不得作为已冻结契约对外发布；实现与单测可先行，真栈证据按 AIRR §7.3 补。
