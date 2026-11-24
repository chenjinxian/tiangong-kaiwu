# AIRR：G1 B4 — Write 等级激活、动作路由元数据、share/link 决策与 denyList

- 标题：B4 — Write vs Manage 激活、action-based 路由元数据、iTwin share/link 取舍、denyList 边界与 UI
- 日期：2026-11-24
- Owner：平台/安全（产品/UI 共同评审）
- 关联：`G1-EXECUTION-PLAN.md` B4；`10-ARCHITECTURE-HARDENING-PLAN.md` B4；`IDENTITY-ACL-DESIGN.md` §4.2–§4.4/§6；`ADR-G0-16-identity-attribution.md`；`AIRR-2026-11-24-B3.1d-MS-WRITE-ENFORCE.md`；`AIRR-2026-11-24-B3-HUB-RESOLVER-ALIGN.md`；`AIRR-2026-11-24-B3.1e-HUB-ROUTE-ENFORCE.md`；`EXCEPTIONS.md` X-21/X-27
- 预计影响仓：私有 `imodelhub-services`（authorization/action/route metadata/access-control/permissions/migrations/tests）；公共仓 `luban-cad/apps/web`（ShareDocumentDialog/usePermissions/i18n/tests）与本文档。**不改** MS/BFF/WA/native/共享 IPC；**不新增**公共 REST DTO，除非另立 ADR。
- 是否需要 ADR：**是（Proposed）**。Write 等级激活会改变公开路由的授权语义（显式 Write/Edit 从“不可写”变为“可写”），并决定 iTwin share/link 的取舍；这属于跨仓授权契约变更。建议在 `ADR-G0-16` 下新增附录（编号由 ARB 分配，Proposed）并 ARB 签字。若只做“Manage-only 保持 + 删除假 link”，可不改授权契约，但仍需 owner 确认。

> **状态：Partially implemented（B4 第一切片，2026-11-24）；全量 B4 未完成。**
> 已实现（私有 `imodelhub-services`）：`AUTHZ_WRITE_SEMANTICS=manage_compat|write` 启动校验与默认 `manage_compat`；action resolver 在 `write` 下将 `doc.write`/`briefcase.write`/`changeset.push` 映射为 Write；route-level `version.write` 映射；unsecured share `Edit` → Write 分支修复（含 denyList/secured 规则保持）；permissions projection 随 flag 输出 `imodels_write`；OBO exchange/decision 使用同一语义并在响应报告实际值。**未实现**：公开 mutation 路由的 `@RequireAction` 元数据迁移、UI Write 档、link 删除、shares UI、MS B3.1d 对齐、真栈 canary。实现证据与残余见 §10。
> 当前 B3.1b 已把 groups/local roleIds、iTwin shares、share denyList、secured 显式 grant 接入单一 resolver；B3.1d/MS 与 Hub 公开路由仍是 **Manage-only**（`@RequirePermission(IMODELS_MANAGE)`）。本切片的 `write` 模式只作用于 action resolver/OBO/decision/projection，不等于公开路由端到端 Write 强制。
> 本文中的“当前”只表示 2026-11-24 对公开/私有仓源码的只读走查；“Proposed”表示尚未落地的设计。
> 不勾选任何 G1 Gate 项；不宣称 B4、B3 或“无假分享”已完成。

---

## 0. 结论摘要

1. **当前写语义是 Manage-only，不是 Write**：`doc.write`、`briefcase.write`、`changeset.push` 全部映射到 `IMODELS_MANAGE`；所有 mutation 路由也以 `@RequirePermission(IMODELS_MANAGE)` 声明。显式 iModel `Write`、iTwin share `Edit` 在数据模型里存在，但路由层不满足 Manage，因此编辑/推送被拒绝。
2. **推荐动作目录扩展**：保留 `doc.read/doc.write/briefcase.write/changeset.push`，新增路由级 `version.write` 与 `doc.manage`；把 mutation 路由从 `IMODELS_MANAGE` 元数据迁移到 action 元数据（保留旧元数据作为过渡）。`doc.write` 在 Write 模式下要求 briefcases+changesets+locks 的 Write；`version.write` 要求 versions Write；`doc.manage` 要求 Manage 或 iTwin manage。**第一切片已实现 `version.write` 的 resolver 映射（未进入 OBO closed scope、未迁移路由）；`doc.manage` 未实现。**
3. **Write 激活是显式开关**：`AUTHZ_WRITE_SEMANTICS=manage_compat|write`，默认 `manage_compat`；打开后 iTwin share `Edit`、显式 iModel `Write` 满足 action resolver 的 `imodels_write`，`imodels_write` 会出现在 permissions projection，UI 的既有 `usePermissions` 会把文档显示为可编辑。**第一切片已实现 flag、resolver、OBO/decision 与 projection；公开 mutation 路由仍 Manage-only。**
4. **share/link/groups 决策**：iTwin shares 已被 resolver 真正执行（email/domain/allow/deny/expiry），建议 **保留执行**；但当前 UI 的“Share link”只是指向 `/documents/:iTwinId` 的普通导航 URL，不是 capability，也不是 token，**建议从 UI 删除**，并在文案/能力账本中明确“无 link share”。若产品要求真正的 link，另立 AIRR/ADR 实现 `share_links`/redeem，不能保留假链接。本地组 `roleIds` 保留一层继承；IMS 组/嵌套组保持 fail closed。
5. **denyList**：当前只有 iTwin `access_control_shares.denyList`，优先于 owner/manage/显式 grant/share grant；没有独立 `access_control_denies` 表。B4 第一切片建议保留 share denyList、补输入规范化/审计/UI（若暴露 shares），不新增显式 iModel deny；把“独立 deny 表”留给合规需求。
6. **UI**：B 文档分享对话框增加 `Write`（Edit）等级；`usePermissions` 已把 `imodels_write` 视为可编辑，无需改语义；A/项目容器对话框删除 fake link 页签；任何“复制链接即可访问”的文案必须删除。
7. **无 schema 迁移即可激活 Write**：`iModelPermissionLevel.Write`、显式权限四维、share `Edit` 已存在；只需 action/metadata/flag 与测试。若删除 link 无 schema；若新增 shares UI 也无 schema。
8. **主要阻塞**：B3.1d/MS 仍按 Manage-only 设计；B6 共享 key/服务身份未收口；官方权限语义与本地 action 目录需要对齐；`doc.manage`/`version.write` 是否进入 OBO closed scope 未决；share deny 对 iTwin 管理路由的边界未决；真栈双用户 canary 未跑。

---

## 1. 目标、验收与非目标

### 1.1 目标

1. 让显式 iModel `Write` 与 iTwin share `Edit` 在写路由上真正生效，而不是继续被 Manage 兼容层吞掉。
2. 把 mutation 路由的授权声明从“单一 `imodels_manage`”迁移为“动作 + 资源维度”的显式元数据，减少“写=Manage”的隐式规则。
3. 明确哪些动作必须保持 Manage/iTwin manage（删除、secured 开关、授权/分享管理）。
4. 对 iTwin shares 做“执行或删除”的产品决策；删除假 link；不保留任何“复制链接即可访问”的假能力。
5. 明确 denyList 的优先级、输入边界、审计与 UI；不把未实现的显式 deny 宣称为已支持。
6. 给出 UI 影响、迁移/回滚与真栈测试计划。

### 1.2 可观察验收（Proposed，未执行）

| # | 验收 |
|---|---|
| A1 | `AUTHZ_WRITE_SEMANTICS=write` 后，显式 iModel Write（四维）用户可以创建 changeset、acquire/release briefcase、写锁、创建/修改 Named Version；Read/View 用户仍 403 |
| A2 | iTwin share `Edit` 在未 secured 文档上可写；`View` 只读；`Manage` 可管理；secured 文档 share 仍不授予，必须显式 grant 或 iTwin manage |
| A3 | `GET /imodels/:id/permissions` 对显式 Write 用户返回 `imodels_write`；UI 显示可编辑；对 Read 用户不返回 |
| A4 | Manage-only 操作（删除 iModel、secured 开关、grant/revoke、角色模板、share 管理）仍要求 iTwin manage，显式 iModel Write/Manage 不能提升为 iTwin 管理 |
| A5 | 路由元数据测试覆盖每个 mutation：action、scope、legacy 过渡元数据；未分类路由测试失败 |
| A6 | 分享对话框 B 分支提供 Read/Write/Manage 三档；授权后权限投影与 resolver 一致；A 分支不再显示 fake link |
| A7 | share denyList 命中时，owner/manage/显式 grant/share grant 均被拒；过期后立即恢复评估；域匹配按 dot 边界 |
| A8 | `AUTHZ_WRITE_SEMANTICS=manage_compat` 回退后行为恢复；无数据迁移；显式 Write 行保留但不生效 |
| A9 | 真栈双用户 canary：Editor/Write 用户可写、Viewer/outsider/deny 用户 403；MS B3.1d gate 与 Hub 路由一致 |
| A10 | 日志/错误不含 token/secret；拒绝原因稳定（`insufficient_permission`/`explicit_deny`/`share_denied` 等） |

### 1.3 非目标

- 不做 B2.2 的真实归因；本切片只改授权语义，creator/owner 归因另文。
- 不做 B6 共享 key/服务身份退役；service token 仍按 P3/P4 现状。
- 不做 B10 tenantId/RLS。
- 不做 link share 的完整实现（除非另立 AIRR/ADR）；本切片只决定删除或保留。
- 不做独立 `access_control_denies` 表（除非 owner 明确要求；见 §6 决策）。
- 不做 storage/tile/WA/BFF 的 PEP。
- 不改官方 changeset/briefcase/NV DTO；不改 shared IPC。
- 不勾选 G1 Gate。

---

## 2. 当前状态（只读代码走查，2026-11-24）

### 2.1 等级与动作

| 项 | 当前 | 代码位置 |
|---|---|---|
| iModel 等级 | `None < Read < Write < Manage < Owner` | `imodels/domain/permission.ts` |
| 官方语义 | Read=只读打开；Write=可修改、可创建/修改 Named Version；Manage=可创建 iModel/配置访问/管理锁与本地副本；Delete=iTwin 级 | `imodels/domain/imodel-permission.enum.ts` |
| Action 目录 | `doc.read`、`doc.write`、`briefcase.write`、`changeset.push` | `authz/domain/authz-action.ts` |
| `doc.write` | Manage on briefcases AND changesets AND locks | 同上 |
| `briefcase.write` | Manage on briefcases | 同上 |
| `changeset.push` | Manage on changesets AND briefcases | 同上 |
| 响应标记 | 预切片：固定 `P0_WRITE_SEMANTICS='manage_compat'`；第一切片后：OBO response `writeSemantics` 反映 `AUTHZ_WRITE_SEMANTICS` | `authz-action.ts`、`obo-tokens.service.ts` |
| 路由等级 | `IMODELS_WEBVIEW` → Read；`IMODELS_MANAGE` → Manage；其它按 Manage fail closed | `common/authorization/authorization.service.ts` |

**结论**：预切片所有 mutation 路由都要求 Manage；`Write` 等级在路由层是惰性的。第一切片后 action resolver/OBO/decision/projection 可按 `AUTHZ_WRITE_SEMANTICS=write` 激活 Write，但公开 mutation 路由仍是 Manage-only，仍不得宣传为端到端显式 Write 强制。

### 2.2 显式权限与 share

| 项 | 当前 | 代码位置 |
|---|---|---|
| 显式 iModel 权限 | 四维 `briefcasesLevel/changesetsLevel/versionsLevel/locksLevel`；可取值含 Write | `imodel-user-permission.entity.ts`、`permission.ts` |
| `isSecured=false` | iTwin RBAC/owner/creator/成员/组角色；无 RBAC 时 iTwin share View/Edit/Manage → Read/Write/Manage | `authorization.service.ts` |
| `isSecured=true` | iTwin owner/creator 或 `imodels_manage` 绕过；否则必须显式权限行对应维度；share 不授予 | 同上 |
| share denyList | 活跃未过期 share 的 denyList 命中 → 拒绝，先于 owner/manage/显式 grant/share grant；domain 按 dot 边界 | 同上 |
| iTwin shares API | `POST/GET/DELETE /accesscontrol/itwins/:id/shares`；`ITWINS_MODIFY` | `access-control.controller.ts` |
| shares UI | **未发现**创建/列出 shares 的前端调用；A 对话框只管理成员/角色和 fake link | `luban-cad/apps/web/src/modules/documents/components/ShareDocumentDialog.tsx` |
| groups | 本地 group `roleIds` 一层展平；`imsGroups` 非空的组 fail closed（`unsupported_group_source`） | `authorization.service.ts`、`access-control.service.ts` |
| 权限投影 | `write` = Manage on briefcases+changesets+locks；`imodels_write` 只在 Manage 时返回 | `permissions.service.ts`、`authorization.service.ts` |
| UI `usePermissions` | 权限含 `imodels_write` 或 `imodels_manage` → editable | `modules/part-studio/hooks/usePermissions.ts` |

**结论**：数据模型和 resolver 已支持 Write/Edit，但路由/投影/UI 没有真正暴露；UI 的 editable 判断已经为 Write 预留。

### 2.3 分享 UI

- B 文档（有 `imodelId`）走 `BShareDialog`：读取 `isSecured` + `GET /imodels/:id/permissions/users`，授权 Read/Manage（`levelPayload` 只映射 read/manage），撤销，切换 secured；不渲染 link 页签。
- A 旧文档/项目容器走 `ITwinShareDialog`：成员/邀请/链接三页签；链接是 `${window.location.origin}/documents/${iTwinId}`，文案“Only users with document access can open this link”。它不是 token、不是 capability、不创建 share 记录。
- B 分支的 `canManageAccess = canManageShare && securedKnown && isSecured`；分享/权限控件仍受 `canManageShare`（iTwin manage）门禁。

**结论**：当前“link share”是导航链接，不是能力；保留会误导。iTwin shares 后端已执行，但 UI 没有管理入口，属于“执行但未暴露”，不是假执行。

---

## 3. Write vs Manage 激活（Proposed）

### 3.1 目标动作目录

| Action | 要求（write 模式） | 用途 | 是否进入 OBO exchange |
|---|---|---|---|
| `doc.read` | 任一维度 Read（或 iTwin webview/share View） | 读树/下载/打开 | 是（现状） |
| `doc.write` | briefcases **AND** changesets **AND** locks 均 Write | 编辑文档、锁写、extended data/groups | 是（现状） |
| `briefcase.write` | briefcases Write | acquire/release/abandon/本地副本 | 是（现状） |
| `changeset.push` | changesets **AND** briefcases Write | 创建/上传 changeset | 是（现状） |
| `version.write`（新） | versions Write | Named Version 创建/修改/删除/checkpoint PUT | **决策点**：是否加入 closed scope；本切片可先用于 Hub 路由元数据 |
| `doc.manage`（新，路由级） | Manage on 任一维度或 iTwin manage | 删除、secured 开关、授权/角色模板、share 管理 | **不建议**进入 OBO exchange；仅用户 JWT 路由 |

说明：

- `doc.write` 不含 `versions`，避免把“能编辑 Part Studio”误当成“能改 Named Version”；Named Version 用 `version.write`。如果 owner 选择单一 `doc.write` 覆盖四维，必须同时修改 closed OBO scope 并明确行为变化（见 §9 D-1）。
- `doc.manage` 是“管理动作”，不是更高级的编辑；它仍不能把显式 iModel Manage 提升为 iTwin 管理。删除 iModel、secured 开关、grant/revoke、角色模板、share 管理继续要求 `checkITwinManageForIModel`（iTwin manage/owner），不因 `doc.manage` 放宽。
- `changeset.push` 与 B3.1d 的 `doc.write`+`changeset.push` 组合保持一致：路由 `POST /changesets` 可用 `changeset.push`（其要求已含 briefcases Write）；上传/complete 同样。

### 3.2 动作 → resolver 映射

```text
doc.read        -> [ { permission: IMODELS_WEBVIEW } ]
doc.write       -> [ { permission: IMODELS_WRITE, resource: briefcases },
                     { permission: IMODELS_WRITE, resource: changesets },
                     { permission: IMODELS_WRITE, resource: locks } ]
briefcase.write -> [ { permission: IMODELS_WRITE, resource: briefcases } ]
changeset.push  -> [ { permission: IMODELS_WRITE, resource: changesets },
                     { permission: IMODELS_WRITE, resource: briefcases } ]
version.write   -> [ { permission: IMODELS_WRITE, resource: versions } ]
doc.manage      -> [ { permission: IMODELS_MANAGE } ]  // 任一维度；iTwin manage 可绕过
```

- 需要新增 `Permission.IMODELS_WRITE`（或让 `IModelAccessRequirement` 直接携带 level），`requiredIModelLevel` 从枚举映射到 `iModelPermissionLevel.Write`。
- **关键实现点**：`evaluateIModelContext` 的 unsecured 分支当前只对 `IMODELS_WEBVIEW`/`IMODELS_MANAGE` 展开 iTwin share grant；加入 `IMODELS_WRITE` 时必须同步把该 permission 纳入 share 分支，否则 `share Edit` 会被静默忽略（测试必须覆盖）。secured 分支的显式行等级比较可直接复用 `levelRank`。
- `manage_compat` 模式下，`doc.write`/`briefcase.write`/`changeset.push` 临时仍映射到 Manage；`write` 模式切换为上表。`version.write`/`doc.manage` 在两种模式下都按其定义（`version.write` 可先不启用）。
- `getIModelPermissionProjection.write` 改为上表的 Write 检查；`imodels_write` 在投影中返回。
- OBO scope 仍只允许四动作；`version.write`/`doc.manage` 是否可换发由 D-1/D-2 决定。

### 3.3 Action-based 路由元数据

现状是 `@RequirePermission(Permission.IMODELS_MANAGE, { iModelParam, imodelResource })`。Proposed：

1. 新增 `@RequireAction(action, { iModelParam, resource? })`，由 `ActionAccessGuard` 或扩展后的 `ResourceAccessGuard`/`SystemAgentOrResourceGuard` 读取。
2. 迁移期双写：`@RequireAction(...)` + 旧 `@RequirePermission(IMODELS_MANAGE, ...)`；`AUTHZ_WRITE_SEMANTICS=write` 时 action 生效，`manage_compat` 时旧权限生效。迁移完成后删除旧元数据。
3. `@RequireServiceAuth` 继续保留；service token 走 scope/pin，不走 action。
4. `@RequireAction` 与 `SystemAgentOrResourceGuard` 的 service 分支互斥：service-only 路由不会触发 action resolver；OBO user 必须由**独立** ActionAccessGuard 判定，不能因 service 分支提前返回而跳过 action 检查。OBO + service token 同时存在时，先完成 service scope/pin，再执行 action 检查，二者都 allow 才放行。
5. 路由 metadata 测试必须覆盖：每个 mutation 有 action；每个 action 有 resource；未分类路由失败；`doc.manage` 路由不允许 OBO exchange。

#### 路由矩阵（Proposed）

> 下表省略公共前缀 `/imodels/:iModelId`；`/changesets/...`、`/briefcases/...` 等均相对于该前缀。

| 路由 | Action | 资源 | 备注 |
|---|---|---|---|
| `POST /changesets`、`POST/PATCH /changesets/:id/file|complete` | `changeset.push` | changesets+briefcases | 与 B3.1d push 双动作一致 |
| `PATCH/DELETE /changesets/:id` | `doc.manage` | changeset | 账本不可变；保持管理语义 |
| `POST/PATCH/DELETE /changesets/:id/extendeddata|extended-data` | `doc.write` | changesets | 写入 changeset 元数据 |
| `POST/PATCH/DELETE /changesets/:id/groups` | `doc.write` | changesets | group 元数据 |
| `POST /changesets/:id/locks/release` | `doc.write` | locks+briefcases | 锁释放 |
| `POST /changesets/download/batch` | `doc.read`（或保持 Manage） | changesets | **决策点**：当前 Manage；读语义可降为 Read，但会扩大下载面 |
| `POST /briefcases`、`POST /acquire`、`POST /:id/release`、`PATCH /:id`、`POST /:id/keep-alive`、`DELETE /:id` | `briefcase.write` | briefcases | owner 语义仍由 handler 校验 |
| `POST/PATCH /locks`、`POST /locks/release-chunk|batch`、`POST /:lockId/release`、`POST /briefcase/:id/release-all`、`DELETE /:lockId` | `doc.write` | locks+briefcases | owner 校验仍用 briefcase userId |
| `POST/PATCH/DELETE /namedversions`、`PUT /:id/checkpoint` | `version.write` | versions | 官方 Write 允许 NV 创建/修改 |
| `PATCH /imodels/:id`（name/description） | `doc.write` | 任一 | `isSecured` 单独要求 iTwin manage；同一路由多字段，handler 内必须按字段分流，不能用一个 action 覆盖整个请求体 |
| `PATCH /imodels/:id`（`isSecured`）、`DELETE /imodels/:id`、`POST /clone`、`POST /fork` | `doc.manage` + `checkITwinManageForIModel` | iTwin | 不能由显式 Write/Manage 提升 |
| `permissions/grant|users/:id|templates*`、`rolepermissions` | `doc.manage` + `checkITwinManageForIModel` | iTwin | 授权面仅 iTwin manage |
| `POST/GET/DELETE /accesscontrol/itwins/:id/shares` | `doc.manage`/`ITWINS_MODIFY` | iTwin | share 管理仍 iTwin manage |
| baseline/admin | 不适用 | — | service token/OBO 另文 |

### 3.4 开关

| 开关 | 默认 | 语义 |
|---|---|---|
| `AUTHZ_WRITE_SEMANTICS` | `manage_compat` | `write` 激活 action resolver/OBO/decision/projection 的 Write；`manage_compat` 保持现状。**已实现并启动校验（2026-11-24 切片）**；公开路由元数据未迁移 |
| `AUTHZ_ENFORCE` | `off` | Hub 路由强制总开关；`read`/`write`/`full` 与 B3.1e 一致；B4 可先只切语义，不强制路由 |
| `AUTHZ_ACTION_METADATA` | `legacy` | `legacy` 用旧 permission；`dual` 双写；`action` 用新元数据（迁移期） |
| `AUTH_B3_WRITE_MODE` | `off` | MS 本地写门禁；B4 激活后可先保持 off，再打开 |
| `AUTH_B3_READ_MODE` | `off` | 建议 B4 canary 先开读强制，避免只读用户拿到 rw briefcase |

**激活顺序建议**：B4 单测/隔离 e2e → `AUTHZ_ACTION_METADATA=dual` + `AUTHZ_WRITE_SEMANTICS=write`（只改语义，不强制路由）→ 内部 iTwin canary → 打开 `AUTHZ_ENFORCE=read/write` → MS `AUTH_B3_*` 对齐 → 生产。不要同时打开所有开关。

### 3.5 行为变化矩阵

| 主体 | 当前 | Write 激活后 | 风险/说明 |
|---|---|---|---|
| iTwin owner/creator | 允许 | 允许 | 无变化 |
| iTwin Admin/Editor（持 `imodels_manage`） | 允许 | 允许 | 无变化 |
| iTwin Viewer | 拒绝 | 拒绝 | 无变化 |
| iTwin share Manage（未 secured） | 允许 | 允许 | 无变化 |
| iTwin share Edit（未 secured） | **拒绝** | **允许** | 预期激活；需 UI/测试 |
| iTwin share View | 拒绝 | 拒绝 | 无变化 |
| 显式 iModel Write（四维） | **拒绝** | **允许** | 预期激活；`imodels_write` 返回 |
| 显式 iModel Read | 拒绝 | 拒绝 | 无变化 |
| 显式 iModel Manage | 允许 | 允许 | 无变化 |
| 组角色继承 Editor | 允许 | 允许 | 无变化 |
| share denyList 命中 | 拒绝 | 拒绝 | 仍优先 |
| secured 文档 share Edit | 拒绝 | 拒绝 | share 不授予 secured；需显式 grant |
| 匿名/非成员 | 拒绝 | 拒绝 | 无变化 |

### 3.6 Manage-only 边界

以下操作**不得**因 Write 激活而放宽：

- iModel 删除、`isSecured` 切换、iModel 元数据中的安全字段；
- 显式权限 grant/update/revoke、permission templates；
- iTwin 角色/成员/邀请/组管理；
- iTwin share 创建/删除/更新；
- clone/fork（当前 Manage；若产品要求 Read+target create，另立决策）；
- admin/baseline 系统路由（service token，不是 action）。

显式 iModel `Manage` 行仍然只管理该 iModel 的文档内容，不能 grant/revoke、不能删 iTwin、不能关闭 secured（现有 F4 口径保持）。

### 3.7 缓存与失效

- `AuthorizationService.getPermissions` 有 60s 缓存；shares/deny/显式权限直查（不经缓存）；角色/组成员变更通过 tag 失效。
- Write 激活后，`doc.write` 决策在 MS 侧仍 ≤5s（B3.1d）；Hub 路由应使用同一 resolver，不引入第二缓存。
- share 创建/删除/过期立即生效；组成员/角色变更的 60s 窗口需在 canary 中标注；若 owner 要求“下一请求”则缩短/失效该缓存。
- denyList 变更必须立即生效；当前 share 直查已满足。

---

## 4. Share/Link 决策（Proposed）

### 4.1 现状分类

| 能力 | 后端 | resolver | UI | 结论 |
|---|---|---|---|---|
| iTwin 成员/角色 | access-control API | iTwin RBAC + 本地 group roleIds | A 对话框成员/邀请 | 真能力，保留 |
| iTwin shares（email/domain/allow/deny/expiry） | `access_control_shares` API | 未 secured 文档上生效；secured 不授予 | **无 UI** | 真执行但未暴露；建议保留 API-only 或补 UI |
| iModel 显式权限 | `permissions` API | 四维 level；secured/unsecured 都生效 | B 对话框 Read/Manage | 真能力，B4 扩 Write |
| Link share | **无表/无兑换/无 token** | 无 | A 对话框“Share link”只是导航 URL | **假能力，删除** |

### 4.2 决策

**推荐（Proposed）**：

1. **保留 iTwin shares 的执行**，因为 B3.1b 已实现 email/domain/allow/deny/expiry 解析（历史证据见该 AIRR；本 AIRR 未重跑）；删除会丢失 denyList 与项目级分享语义。
2. **本切片不新增 shares UI**，但必须在文档/能力账本中标注“API-only/项目管理员可用”；或者在同一 PR 增加最小 shares 管理页（create/list/delete + allow/deny/expiry），二选一由产品决定。
3. **删除 link 页签与文案**：`ShareDocumentDialog` 的 A 分支移除 `link` tab、`shareLink`、`handleCopyLink`、相关 i18n；文档明确“当前不支持 link share”。
4. **不保留“链接只是导航”的伪能力**：如果产品坚持链接，必须另立 AIRR/ADR 实现 `share_links`（tokenHash、permission、expiry、revocation、maxUses、redeem、guest OBO），并满足 secured 默认不签发、最小权限、撤销、审计。
5. **B 文档分享**：保留 explicit iModel permission 通道；增加 Write 档；不增加 link。

### 4.3 如果保留 iTwin shares（推荐）的语义

- 仅 `isSecured=false` 的 iModel 展开为 Read/Write/Manage；secured 文档必须显式 iModel grant 或 iTwin manage。
- `sharedWithEmails` 精确匹配；`sharedWithDomains`/`allowList` 按域后缀 dot 边界；`denyList` 优先；`expirationDate` 过期立即停止 grant/deny。
- 邮箱只从真实 `user` 行读取；无邮箱的 principal 不获得 share grant/deny（fail closed）。
- share 管理仍需 `ITWINS_MODIFY`（iTwin manage）；不能把文档 Manage 行当项目管理。
- 域分享无法枚举用户，缓存失效按 iTwin 全清；当前直查，无需 tag。

### 4.4 如果产品选择“删除 shares”

- 必须先导出/备份 `access_control_shares`，移除 API/路由/UI/resolver 分支，更新测试与能力账本；不得只隐藏 UI 保留假能力。
- 删除后 denyList 也随之消失；如果仍需要 deny，必须另建显式 deny 表或保留 shares。
- 本 AIRR 不推荐该路径，因为 B3.1b 已投入并用于 deny；除非产品明确不需要 email/domain share。

### 4.5 如果产品选择“实现 link”（非本切片）

最小设计（仅记录，不批准）：

- `share_links`：`id/iTwinId/iModelId/tokenHash/permission(Read|Write)/expiresAt/revokedAt/maxUses/useCount/createdBy/allowedDomains?`。
- 兑换：`POST /shares/links/:token/redeem`（公开但限流）→ 校验哈希/过期/撤销/次数/域 → 签发 link guest OBO（15m–2h，单 iModel，read 或 write，`tenantId=null`）。
- 有效权限：`min(link.permission, 目标 ACL 对 guest 的授予)`；denyList/deny 优先；secured 默认不允许 link。
- 撤销：删除/revoked + 每次兑换查 link 状态；已签发 guest token 在 TTL 内仍有效，除非每次请求查。
- 这需要 ADR（新公开兑换入口、guest 身份、限流、滥用）与 B10 租户决策；不得在 B4 顺手实现。

### 4.6 Groups（本地组 / IMS 组）

| 项 | 当前 | B4 决策 |
|---|---|---|
| 本地组 `roleIds` | 一层展平；组成员继承组角色；组 id/角色 id 必须属于同一 iTwin | **保留执行**；Write 激活后组 Editor 角色按 Write/Manage 矩阵生效 |
| 嵌套组 | 未实现 | 不宣称；需要另立 ADR |
| IMS 组（`imsGroups` 非空） | fail closed：不应用 roleIds，也不触发默认成员 grant；记录 `unsupported_group_source` | **保持 fail closed**；不得为了“组能用”而静默授予 |
| 组管理 | `ITWINS_MODIFY`；组/成员路由已绑定路径 iTwin | 保留；share/group 管理仍 iTwin manage |
| UI | 无组管理前端（本次未发现） | 不新增假组 UI；若需要，另立 UX |

**结论**：B4 的 groups 不是“新实现”，而是确认本地组 roleIds 真执行、IMS/嵌套组 fail closed；任何“组已完全支持”的文案必须限定为本地一层组。

---

## 5. denyList（Proposed）

### 5.1 当前语义

- 只有 iTwin `access_control_shares.denyList`；没有独立 `access_control_denies` 表。
- `evaluateIModelContext` 首先检查 `shareDenied`，命中即拒绝，先于 owner/creator、iTwin manage、显式 iModel grant、share grant；secured 同样适用。
- 活跃 share：同 iTwin、未软删、`expirationDate` null 或 > now；过期即不参与 deny/grant。
- 条目：含 `@` 为精确邮箱，否则为域；域按 dot 边界后缀匹配；大小写归一。
- 无 UI 管理；API create share 支持 `denyList`，但前端未调用。
- `checkITwinManageForIModel`（secured 开关、grant/revoke、角色模板）不走 share deny；`getIModelPermissionProjection.delete` 会用 shareDenied 抑制 UI。

### 5.2 建议（B4 第一切片）

1. **保留 share denyList 为唯一 deny 来源**；不新增 `access_control_denies`（避免双 deny 事实源）。
2. **输入规范化**：trim/lowercase；拒绝空串、`*` 通配、包含空白的条目；邮箱必须含 `@` 且单 `@`；域必须有至少一个 dot；限制条目数（例如 200）与长度（例如 320）；重复去重。
3. **优先级**：share deny > owner/creator/iTwin manage/显式 grant/share grant（文档内容动作）；secured 同样。
4. **iTwin 管理边界**：`checkITwinManageForIModel` 仍允许 iTwin 管理员管理 secured/grant/revoke；share deny 不应把唯一管理员锁死。若合规要求 deny 也约束管理员，必须另立决策并设计 break-glass；本切片不改变。
5. **审计**：share create/update/delete 与 denyList 变更应记录 actor/iTwin/share 摘要；当前 B7 高风险审计未做，列为依赖/后续，不宣称已审计。
6. **UI**：若暴露 shares 管理，denyList 必须可见、可编辑、二次确认；不得静默添加；展示“deny 优先于所有 grant”。
7. **测试**：deny 优先于 iTwin Editor/owner/显式 Manage/share Manage；secured；过期；domain 边界（`example.com` 不匹配 `notexample.com`）；空/非法条目；大小写；share 删除后恢复。
8. **显式 iModel deny**：不在 B4 实现；如果合规要求“文档级 deny 独立于 share”，另立 AIRR + additive 表 + 优先级 + UI + 审计。

### 5.3 已知边界

- share deny 只对 iModel 文档动作生效；iTwin 级管理（secured/grant/角色）仍由 iTwin 管理员执行。
- share deny 依赖用户真实 email；无 email 的 principal 无法被 deny（也无法被 email/domain grant）；这是现有 resolver 的 fail-closed 边界。
- 域分享无法枚举用户；若未来加缓存，必须按 iTwin 全清。
- deny 记录不进入 `audit_events`；B7 高风险审计未完成。
- 若删除 shares，则 deny 一并消失；不能保留假 deny。

---

## 6. UI 影响（Proposed）

### 6.1 B 文档分享（explicit iModel permissions）

| 文件/行为 | 当前 | Proposed |
|---|---|---|
| `ShareDocumentDialog.tsx` `AccessLevel` | `'read' | 'manage'` | 增加 `'write'` |
| `levelPayload` | read→read；manage→manage（四维） | write→write（四维）；manage→manage；read→read |
| `displayedLevel` | 任一 manage+ → manage，否则 read | 识别 write：任一 manage+ → manage；否则任一 write → write；否则 read |
| i18n | Read/Manage 文案 | 增加 Write/Edit 文案（中英） |
| 权限列表 | 展示读/管理 | 展示读/编辑/管理；说明 Manage 含分享/安全 |
| `canManageAccess` | `canManageShare && isSecured` | 保持；Write 不授予分享管理 |
| 测试 | Read/Manage | Write 授权请求体、显示、回退；resolver 一致 |

`usePermissions.ts` 已把 `imodels_write` 视为 editable，无需改判断；但需要新增测试确保 Write 投影返回后 UI 可编辑、Read 仍只读。

### 6.2 A 旧文档/项目容器（iTwin membership）

| 行为 | 当前 | Proposed |
|---|---|---|
| Tabs | members / invite / link | members / invite（删除 link tab） |
| `shareLink`/`handleCopyLink` | 生成 `/documents/:iTwinId` 导航 URL | 删除 |
| i18n `shareDialog.link.*` | “Share link / Only users with document access...” | 删除或改为“当前不支持链接分享” |
| 成员/邀请 | 真实 access-control API | 保留 |
| iTwin shares | 无 UI | 决策：API-only 标注，或新增 shares 管理 tab（allow/deny/expiry） |

**硬规则**：不得显示“复制链接即可访问/任何人可打开”的文案；当前链接只对已有访问权用户有效，属于普通导航，不是分享能力。删除是诚实的最小修复。

### 6.3 分享按钮/权限门

- `canManageShare` 仍由 iTwin `imodels_manage` 派生（fail-closed）；B4 Write 激活不把分享管理下放给 Edit/Write 用户。
- B 文档 grant/revoke 仍要求 `canManageShare && isSecured`（当前语义：secured 文档才显示显式权限通道；unsecured 可能由项目角色/分享覆盖）。如果产品要在 unsecured 文档也显示显式权限，需另立 UX 决策，不在 B4 改。
- 错误展示：403 `insufficient_permission`/`explicit_deny`/`share_denied` 不得泄露内部 deny 条目；UI 只显示“无权限/被拒绝”。

---

## 7. 迁移、测试与回滚（Proposed）

### 7.1 迁移

| 项 | 是否需要 schema | 说明 |
|---|---|---|
| Write 激活 | **否** | `iModelPermissionLevel.Write`、四维列、share Edit 已存在；只改 action/metadata/flag |
| `imodels_write` 投影 | 否 | resolver 投影逻辑 |
| share UI Write | 否 | 前端/契约 |
| 删除 link UI | 否 | 前端/i18n |
| share 输入规范化 | 否（Dto 校验） | API 行为变化：非法条目 400；需兼容窗口/公告 |
| shares UI（若做） | 否 | 现有 API |
| 显式 deny 表（若做） | 是 | 不在本切片 |
| link 实现（若做） | 是 | 另立 AIRR/ADR |

- 不改历史显式权限行；Write 激活后这些行开始生效。必须在发布说明列出“此前被 Manage 兼容吞掉的 Write/Edit 用户将获得写权限”。
- 不改 share 行；deny/grant 语义不变。
- 删除 link 不涉及数据迁移（无表）。

### 7.2 测试计划（第一切片部分执行；其余未执行）

> **执行说明（2026-11-24）**：第一切片只执行了 Hub 单元/集成（jest-unit）与 tsc/eslint；隔离 relational e2e、MS 真栈 canary、UI 测试均未执行（无 live DB/stack）。执行结果与覆盖范围见 §10。

**Hub 单元**

1. `actionResolverTarget`：write 模式下 doc.write/briefcase.write/changeset.push/version.write 的精确 requirement；manage_compat 仍 Manage；doc.manage 不过度授权。
2. `requiredIModelLevel`/`evaluateIModelContext`：Read/Write/Manage/Owner、四维、secured/unsecured、share View/Edit/Manage、deny、expiry、group roleIds、imsGroups fail closed。
3. 权限投影：显式 Write → `imodels_write`；Read → 无 write；Manage → write+manage；delete 仅 iTwin manage 且 deny 抑制。
4. 路由 metadata：每个 mutation 有 action；`doc.manage` 路由不接 OBO；未分类测试失败。
5. `SystemAgentOrResourceGuard`：service/OBO/JWT/legacy key 优先级；content enforce 下 key 不授权。

**Hub 隔离 relational e2e**

1. owner/Editor/Viewer/Editor-share/Edit-share/View-share/explicit Write/Read/Manage/outsider/deny/expired 矩阵；写 200/403。
2. secured：share Edit 不授予；显式 Write 授予；iTwin manage 绕过；deny 抑制。
3. changeset create/push、briefcase acquire/release、lock write、NV create：Write 用户允许；Read/View 拒绝；owner 校验仍正确。
4. Manage-only：删除、secured、grant/revoke、share 管理仍拒绝显式 Write/Manage（非 iTwin manage）。
5. 权限投影与 resolver 同源；UI 契约测试。
6. 旧 fixture：已有 Read/Manage/Write 行迁移后行为矩阵。

**MS 真栈 canary**

- 同一 iTwin：admin/Manage、Editor 角色、显式 Write、Edit share、View share、outsider、deny。
- `AUTH_B3_READ_MODE=enforce` + `AUTH_B3_WRITE_MODE=enforce` + Hub `AUTHZ_WRITE_SEMANTICS=write`；FeatureOp、save、push、直改、acquire、锁、NV。
- 断言：Write/Edit 用户真实可写；View/outsider 403；deny 403；Hub/MS 决策一致；日志无 token。
- 注意：push 归因仍是服务账号（B2.2/X-21），不得写成“真实用户 push 已完成”。

**UI**

- `ShareDocumentDialog` B：Read/Write/Manage 授权体、显示、撤销；secured 门禁；`canManageShare=false` 不显示可写控件。
- A：无 link tab；成员/邀请保持；若 shares UI，deny/allow/expiry 表单与错误。
- `usePermissions`：imodels_write → editable；imodels_read → readonly；非 403 错误回退 editable 的既有问题不属本切片，但服务端仍拒绝。

**证据诚实**

- 本 AIRR 无测试结果；实现后记录命令/环境/通过/失败。
- 未跑真栈时写“未执行”；不得把单测/jsdom 写成真栈。
- B4 完成不等于 G1 Gate 通过；B6/B10 仍未完成。

### 7.3 回滚

- 首选：`AUTHZ_WRITE_SEMANTICS=manage_compat`（无需数据迁移）；`AUTHZ_ACTION_METADATA=legacy`；MS `AUTH_B3_WRITE_MODE=off`。
- 若已切路由元数据：保留双写，回退 flag 即可；不要同时回退代码与数据。
- share/deny 数据不改；link 删除是前端变更，回退需恢复 UI 但不应恢复“假能力”文案。
- 若 shares 输入规范化导致 400：回退 DTO 校验或提供迁移提示；不得静默接受非法条目。
- 回滚后显式 Write/Edit 用户恢复被拒；需在发布说明中记录。

---

## 8. 依赖、阻塞与决策点

### 8.1 阻塞

| # | 阻塞 | 影响 |
|---|---|---|
| B-1 | B3.1d/MS 仍按 Manage-only 设计 | Write 激活后 MS gate 需同步改 action/TTL；否则 MS 仍拒绝 Edit 用户 |
| B-2 | B6 共享 key/服务身份未收口 | 生产 Hub 路由仍可能被共享 key 旁路；不能宣称 B4 强制完整 |
| B-3 | 官方权限语义对齐 | `doc.write` 是否含 versions、`doc.manage` 是否可 OBO 需 owner/ARB 决定 |
| B-4 | iTwin shares UI 缺失 | “执行但未暴露”；G1 “无假分享”可通过删除 link 满足，但 shares 能力是否算产品能力需决策 |
| B-5 | denyList 无审计/无显式 deny 表 | 合规可能要求；B7 高风险审计未完成 |
| B-6 | 真栈双用户 canary 未跑 | 不能宣称 Write 激活已验证 |
| B-7 | 缓存 60s | 角色/组撤销窗口；B4 需评估是否收紧 |
| B-8 | B10 tenantId | 跨租户 share/deny 边界未定义 |
| B-9 | B2.2 归因 | Write 用户 push 仍可能记服务账号；B4 不解决 |

### 8.2 决策点

| # | 决策 | 建议 |
|---|---|---|
| D-1 | `doc.write` 是否覆盖 versions | 不覆盖；新增 `version.write`，避免编辑权=版本管理权 |
| D-2 | `version.write`/`doc.manage` 是否进入 OBO closed scope | 第一切片只做 Hub 路由元数据；OBO 仍四动作；若 MS 要 NV 写，另立迁移 |
| D-3 | iTwin shares 保留/删除 | 保留执行；API-only 或补最小 UI；删除 link |
| D-4 | link share | 删除；若产品要求，另立 AIRR/ADR 完整实现 |
| D-5 | 独立 iModel deny | 本切片不做；share denyList 唯一 |
| D-6 | share deny 是否约束 iTwin 管理员 | 不约束文档内容以外的 iTwin 管理；保留管理员移除 deny 的能力（审计） |
| D-7 | `changesets/download/batch` 读语义 | 保持 Manage 以缩小行为变化；另立评估是否降 Read |
| D-8 | unsecured 文档是否显示显式权限 UI | 保持现状（secured 才显示）；另立 UX |
| D-9 | 缓存窗口 | 先保持 60s，canary 记录；若要求下一请求则收紧 |
| D-10 | 发布顺序 | 先 dual metadata + 语义，再路由强制，再 MS gate；不一次性全开 |

### 8.3 明确不宣称

- 不宣称 B4 完成、B3 完成、无假分享完成、G1 Gate 通过。
- 不宣称 link share 已实现；不宣称 iTwin shares 已有 UI。
- 不宣称显式 iModel Manage 可管理 iTwin/授权。
- 不宣称 denyList 已审计或已有独立 deny 表。
- 不宣称 Write 激活等于真实用户 push 归因（B2.2 另文）。

---

## 9. 评审结论

- 复用矩阵：完成（复用单一 `AuthorizationService` resolver、现有四维权限/share/group/deny、action 目录、permissions projection、ShareDocumentDialog；无第二策略引擎）。
- 跨仓影响：Hub（authorization/action/route metadata/access-control/permissions/tests）+ web（ShareDocumentDialog/usePermissions/i18n/tests）+ 公共文档；MS/BFF/WA/native/shared 未改。
- P0 例外：实现 PR 需更新 X-27（写强制/Manage-only）与 X-21（共享 key）；本 docs-only 变更不修改例外表。
- ADR：需要，Proposed（ADR-G0-16 新附录：Write 激活与 share/link 取舍，编号由 ARB 分配）。
- Owner 签字：无。
- 结论：**Partially implemented（第一切片）；全量 B4/生产激活未批准；不勾选 G1 Gate。**

---

## 10. 实现记录：B4 第一切片（2026-11-24）

### 10.1 已实现范围（默认兼容）

| # | 变更 | 位置（私有 `imodelhub-services`） | 行为 |
|---|---|---|---|
| I-1 | `AUTHZ_WRITE_SEMANTICS=manage_compat\|write`，默认 `manage_compat`，非法值启动失败 | `src/auth/config/auth.config.ts`、`auth-config.type.ts`、`env-example-relational` | 未设置→默认 `manage_compat`；非法值启动失败；`write` 仅显式开启 |
| I-2 | action 目录新增 route-level `version.write`；`doc.write`/`briefcase.write`/`changeset.push`/`version.write` 在 `write` 模式映射为 `IMODELS_WRITE`（资源维度不变） | `src/authz/domain/authz-action.ts` | `manage_compat` 映射与旧版逐项一致（Manage） |
| I-3 | OBO exchange、decision endpoint 使用同一语义，并在 OBO 响应报告实际 `writeSemantics` | `src/authz/services/{action-resolver,obo-tokens.service,authz-decisions.service}.ts`、`delegation.controller.ts` | 默认响应仍为 `manage_compat` |
| I-4 | 新增 `Permission.IMODELS_WRITE='imodels_write'`，resolver 映射到 `iModelPermissionLevel.Write`；iTwin `imodels_manage` 隐含 Write；不加入 `ALL_PERMISSIONS`/默认角色 | `src/common/authorization/{permissions.enum,authorization.service}.ts` | iTwin RBAC 输出/角色模板不变 |
| I-5 | **share 分支修复**：unsecured iModel 上 `IMODELS_WRITE` 纳入 iTwin share 展开；`Edit` → Write，`View` 仍不足以 Write，`Manage` 保留；denyList 仍先于所有 grant；secured 仍需显式 grant 或 iTwin manage | `src/common/authorization/authorization.service.ts` | 默认 `manage_compat` 下公开路由不请求 `IMODELS_WRITE`，行为不变 |
| I-6 | `GET /imodels/:id/permissions` 投影随 flag：`write` 模式按 briefcases+changesets+locks 的 Write 返回 `imodels_write`；`manage_compat` 保持 Manage 口径 | `src/common/authorization/authorization.service.ts`、`src/imodels/permissions.service.ts` | UI 无需改判断（`usePermissions` 已识别 `imodels_write`） |

**未改**：MS/BFF/WA/native/shared IPC；公开 REST DTO；数据库 schema（无迁移）；公开路由的 `@RequirePermission(IMODELS_MANAGE)` 元数据；UI/分享对话框/link 页签。

### 10.2 行为矩阵（实现后）

| 主体/配置 | `manage_compat`（默认） | `write` |
|---|---|---|
| iTwin owner/creator/Admin/Editor（`imodels_manage`） | allow | allow（Manage 隐含 Write） |
| iTwin Viewer | deny | deny |
| unsecured share View | doc.read allow；write deny | doc.read allow；write deny |
| unsecured share Edit | write deny（需 Manage） | **write allow**；manage deny；delete deny |
| unsecured share Manage | allow | allow |
| secured + share Edit，无显式行 | deny | deny |
| secured + 显式四维 Write（对应维度） | write deny（需 Manage） | **write allow** |
| secured + 显式 Write/Manage 行 + 非 iTwin manage | `checkITwinManageForIModel` deny | 同左（不得提升为 iTwin manage） |
| share denyList 命中 | 全 deny | 全 deny（优先于 Edit/Manage/owner） |
| OBO 响应 `writeSemantics` | `manage_compat` | `write` |

### 10.3 测试与静态检查（已执行）

环境：Windows 11，本地 `imodelhub-services` 工作树，2026-11-24；无 live DB/stack。

| 命令 | 结果 |
|---|---|
| `./node_modules/.bin/jest --config ./test/jest-unit.json --runInBand` | **179 suites / 1626 tests 全通过**；覆盖 authz 与 authorization 全量单测 |
| `./node_modules/.bin/tsc --noEmit -p tsconfig.json` | 通过（src + test） |
| `eslint`（本次变更的 16 个 src/test 文件） | 通过 |
| `eslint "{src,apps,libs,test}/**/*.ts"` | **0 errors / 88 warnings**；warnings 为既有 `no-explicit-any`（未新增） |

新增/更新的测试覆盖：

- 默认 `manage_compat`：action 映射逐项仍为 Manage；share Edit 仍不能写/管理；projection 仍为 write=false。
- `write`：share View 不能写；share Edit 可写（doc.write/briefcase.write/changeset.push）；share Manage 保留；iTwin Editor 隐含 Write；iTwin Viewer 拒绝。
- denyList 在 `write` 下仍先于 Edit grant（读/写/管理/删除投影全 deny）；过期 share 逻辑未改。
- secured：share Edit 不授予；显式四维 Write 授予；单维度 Read 使 doc.write deny；`version.write` 使用独立 versions 维度；显式 Write/Manage 行不能通过 `checkITwinManageForIModel`。
- 配置：默认 `manage_compat`；接受 `write`；`true`/`manage` 等非法值启动抛错。
- OBO/decision：`write` 模式向 resolver 传 `IMODELS_WRITE` 并要求 AND 三维；响应报告 `writeSemantics=write`。

### 10.4 残余与决策（不得宣称完成）

1. **公开 mutation 路由仍未迁移**：所有写路由仍是 `@RequirePermission(IMODELS_MANAGE)`；`@RequireAction`/双写元数据（§3.3）未实现。因此 `AUTHZ_WRITE_SEMANTICS=write` 目前只影响 action resolver/OBO/decision/projection，**不保证公开 REST 写路由接受 Edit/Write 用户**。在路由迁移完成前不得在生产开启 `write`（projection 可能显示可编辑而路由仍 403）。
2. **OBO closed scope 仍为四动作**：`version.write` 已加入 resolver 翻译表但不在 `P0_AUTHZ_ACTIONS`；Named Version 路由仍 Manage，OBO 仍不能换发 `version.write`。D-2 未决。
3. **`doc.manage` 未新增**：删除 iModel、secured 开关、grant/revoke、角色模板、share 管理继续 `checkITwinManageForIModel` + `@RequirePermission(IMODELS_MANAGE)`，未被 Write 激活放宽（符合 D-4/§3.6）。
4. **UI 未改**：B 文档分享对话框仍 Read/Manage（无 Write 档）；A 文档/项目容器仍显示 link 页签；二者是产品决策，按本切片要求保持不动。link 不是 capability，能力账本不得宣传。
5. **iTwin shares 仍 API-only**：resolver 执行 email/domain/allow/deny/expiry，但无前端创建/列出入口；未新增 shares UI。
6. **deny 审计/独立 deny 表未做**：仍只有 `access_control_shares.denyList`；无 `audit_events` 变更审计（B7）。
7. **MS/B3.1d 未对齐**：MS 本地写门禁仍 Manage-only；`AUTH_B3_WRITE_MODE` 未接本 flag。
8. **真栈双用户 canary 未跑**：无 live DB/stack；隔离 relational e2e、MS canary、UI e2e 均未执行（§7.2）。
9. **无 schema 迁移**：历史显式 Write 行与 share Edit 行保留；开启 `write` 后开始生效，回滚只需 `AUTHZ_WRITE_SEMANTICS=manage_compat`。发布说明必须列出“此前被 Manage 兼容吞掉的 Write/Edit 用户将获得 action-level 写判定”。
10. **缓存窗口仍 60s**：iTwin RBAC/组角色缓存未改；shares/deny/explicit 仍直查立即生效。真栈验证未做。
11. **明确不发布/不提交**：本切片未 commit/push；未更新 README/索引/例外表；ADR 仍为 Proposed，生产激活需 ARB/owner 签字。
