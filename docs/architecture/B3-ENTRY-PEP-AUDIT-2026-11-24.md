# G1 B3.1 入口/PEP 只读审计（2026-11-24）

> **状态：只读审计输入，不是 AIRR/ADR，不代表 B3 已设计或强制。**
> 审计范围：公共仓、`luban-backend`（modeling-server / webhook-agent /
> checkpoint-worker）、`imodelhub-services`。未改代码、未写库、未跑 live 栈。
> 目标：为 per-document ACL 强制确定真实入口、当前实际执行的检查、缺口与
> 依赖顺序。所有“未证明”项必须在真栈负例后才可以写成通过。

## 1. 当前权限模型（代码核对）

- 权限枚举是 **iTwin 级**：`itwins_modify`、`itwins_webview`、`imodels_manage`、
  `imodels_webview`、`owner`（`imodelhub-services/src/common/authorization/permissions.enum.ts`）。
- 解析链：owner 表 → `itwins.createdBy` 隐式 owner → 成员 `roleIds` → 角色权限并集；
  否则空集（`authorization.service.ts`）。成员表为
  `access_control_owner_members` / `access_control_user_members` /
  `access_control_roles`。
- **groups/shares 有 CRUD 路由但未进入授权解析**：`access_control_groups`、
  `access_control_shares` 不被 resolver 引用；tokenized link share 未发现。
- per-document 粒度实际是 **iModel**：`imodel_user_permissions` 按
  `(iModelId,userId)` 唯一，维度 `briefcases/changesets/versions/locks`，级别
  `None/Read/Write/Manage/Owner`。`isSecured=false` 时只看 iTwin RBAC；
  `isSecured=true` 时 iTwin `imodels_manage` 可绕过，否则要求显式维度级别。
- **写路由普遍声明 `imodels_manage`**，因此显式 `Write` 级别当前基本不可达；
  Extension 写实际要求 Manage。删除/安全开关/授权撤销还要求 iTwin manage。
- Hub 大部分内容路由用元数据驱动 `ResourceAccessGuard` /
  `SystemAgentOrResourceGuard`；列表可见性、briefcase owner、
  权限控制器、exports、repositories 是 handler 内 ad hoc 检查。
- **MS 没有 iModel ACL**：只有 session、path、owner、write lease 检查；
  `scope/DirectEdit` 是进程内屏障，不是 per-user/per-document 授权。

## 2. 高风险入口矩阵（节选）

传输：`U` 用户 JWT；`S` Hub 签名 service token（B6 P3）；`K` 服务账号 JWT +
共享 `X-API-Key`；`A` 仅共享 key；`N` 匿名。

| 入口 | 传输 | 当前检查 | 缺口/旁路 |
|---|---|---|---|
| Hub changesets/briefcases/checkpoints/locks/namedversions 读与下载 | U/S/K | `ResourceAccessGuard`（维度）+ P3 `data.*` scope | `K` 可绕过 RBAC/iACL；S 设计上 scope-only |
| Hub changeset/baseline/checkpoint 写 | U/S/K | RA(manage) + P3 scope | `K` 旁路；S 可写任意 iModel（服务主体设计） |
| Hub `POST /imodels/:id/baselinefile/failed|requeue`、`/imodels/admin/*` | A | 仅共享 key | 不绑定 iModel/作业，key 持有者可操作任意文档 |
| Hub 列表可见性 / favorites / recents | U | AUTH + handler 过滤 | 无统一路由 PEP；可见性逻辑重复 |
| Hub `GET /imodels/:id/userpermissions` | U | RA + handler | 任意 reader 可枚举 ACL 行 |
| Hub access-control groups/shares | U | RA（iTwin webview/modify） | 权限模型未消费 groups/shares（假分享/假组） |
| MS `downloadBriefcase` / version open | U（session） | session、path、owner；OBO **shadow 只记录** | 以服务账号 + `K` 调 Hub，任意有效用户可下载任意 iModel；只读用户也可请求 rw |
| MS `openBriefcase` / FeatureOp 读（tree/sketch/bodies 等） | U（session） | session owner；无 doc ACL | 下载成功后即可读 |
| MS `applyFeatureOp` / PartStudio / save/push/pull/abandon | U（session） | session owner + write lease（push 用服务账号） | 无 doc.write/owner ACL；read-only 可通过 rw 下载绕过 |
| MS 直改 `basicManipulationIpc`/`solidModelingIpc` | U（session） | owner + lease；`setDirectEditAclHook` **存在但未安装** | 无 ACL；hook 是预留接缝 |
| MS `exportIModel` | U（session） | **无 session/owner/lease/ACL 检查** | 最高价值数据外泄缺口，且无测试 |
| MS `GET /api/imodels/:id/progress`、`POST /api/imodels/:id/retry` | U | 仅 Hub `/auth/me` | 任意登录用户可查/重试任意 iModel；retry 以 `K` 转发 |
| MS tile / storage | U 后转 N | 无 ACL；tile URL 可匿名 | nginx `/azurite/` 直通；SAS 是 bearer，可重放 |
| BFF `/api/*` | U | 仅 AUTH | 透传 MS 的 progress/retry 等缺口 |
| WA `/baseline/process` | A | 仅共享 key；body 指定 iModel/iTwin | 可对任意 iModel 触发生成；容器 SAS 30 天 |
| WA `/webhook/events` | N + HMAC | 验签 | 事件驱动无文档 ACL |
| nginx `/azurite/`、tile 前缀 | **N** | 无 | 路径/容器名可知即可直读 changeset/checkpoint/baseline/tile |

## 3. 最高风险（按影响排序）

1. **MS 以服务账号 + 共享 key 代理下载/打开/版本打开**：任何有效 Hub 用户可
   触达任意 iModel；只读用户可取得可写 briefcase（confused deputy）。
2. **MS 本地缺 per-document PEP**：read tree、FeatureOp、save/push/pull、直改、
   export 均无 doc ACL；`exportIModel` 甚至无 session/owner 检查。
3. **Hub `K` 旁路**：默认 `AUTH_SERVICE_CLIENTS_ENABLED=off` 时任意有效 JWT +
   共享 key 可绕过 RBAC/iACL；P3 `shadow+deny` 已能显式关闭，但客户端未迁移。
4. **匿名存储/tile**：nginx `/azurite/` 直通与公开 tile URL；SAS 泄露可重放。
5. **baseline/admin key-only** 与 WA `/baseline/process`：不绑定 iModel/作业。
6. **服务 scope 路由按设计不查 iModel ACL**：B3 必须显式接受或加资源绑定。
7. **progress/retry/BFF**：只认证不授权。
8. **groups/shares 未参与授权**：当前 UI/API 的分享能力与真实权限不一致。

## 4. 依赖顺序建议（B3 切片）

1. **B3.1a 覆盖清单 + 单一 resolver（先不拒绝）**：MS `pepCoverage` 从静态表
   扩展到真实 IPC/RPC/HTTP 入口分类（`covered-shadow|covered-enforce|fail-closed|
   registered-exception`）；Hub 路由元数据测试要求每个内容路由有
   `@RequirePermission` 或登记例外；启动断言 enforce 模式。
2. **B3.1b Hub resolver 对等/PDP**：处理 groups/shares/deny（实现或删除/拒绝）；
   把 `doc.read/write`、`briefcase.write`、`changeset.push` 映射到四维度；
   `/permissions` 与决策端点共用一个 resolver。
3. **B3.1c MS 读强制**：`downloadBriefcase`（`doc.read`/`briefcase.write`）、
   `openBriefcase`、version open、FeatureOp 读；非成员 403，只读用户不能取得 rw。
   依赖 B2 OBO/handle（P0 shadow 已有）与 B3.1b。
4. **B3.1d MS 写强制**：FeatureOp 写、save/push/pull/abandon + 安装现有
   `setDirectEditAclHook`；要求 `doc.write` + owner session + lease。依赖 B3.1c
   与 B4 Write 级别激活。
5. **B3.1e Hub 数据面强制 + 归因**：内容路由要求用户/OBO 身份；`K` 降为
   shadow/deny；service scope 路由保持 scope-only 并有明确文档/资源绑定策略。
   依赖 B2 OBO P1 与 B6 P4；本切片不做客户端迁移。
6. **B3.1f 未用/危险表面 fail-closed**：export、progress、retry 默认 403
   `pep_not_implemented`；WA baseline 需作业绑定 service token；tile/storage
   走 gateway `auth_request`/签名 URL 或登记例外。
7. **B3.1g 负例矩阵与 G1 证据**：两用户、非成员、只读用户，覆盖 Hub/MS/BFF/WA/
   storage，包含 `K`、service scope、匿名 tile/SAS；未跑真栈的项保持 unproven。

## 5. 证据边界

- 本审计来自代码阅读与既有测试检索；标为“未证明”的入口没有执行真栈负例。
- 未验证在线部署形态、真实 ACL 表数据、SAS 泄露范围与 tile 容器命名是否可猜。
- 本审计不改变 G1 Gate 状态；B3 未强制，B6/X-21、B10、storage/tile 例外仍 open。
