# AIRR：G1 B3.1b Hub 授权 resolver 对等（groups / iTwin shares / 文档动作）

- 标题：Hub 单一授权 resolver 对齐（groups、iTwin shares、doc.* 动作、permissions/decision 对等）
- 日期：2026-11-24
- Owner：平台/安全
- 关联需求：`B3-ENTRY-PEP-AUDIT-2026-11-24.md` §4 B3.1b；`IDENTITY-ACL-DESIGN.md` §4.1–4.5
- 预计影响仓：Hub（`imodelhub-services`）与公共文档；**不改** shared/editor/viewer/web、modeling-server、webhook-agent、checkpoint-worker
- 是否需要 ADR：否（复用既有 `AuthorizationService`/`Permission`/`imodel_user_permissions`；新增字段与动作均为 additive，未引入新令牌/渲染/native 契约；ACL schema 增量已在 `IDENTITY-ACL-DESIGN.md` §6.4 登记）
- 状态：**实现完成，已本地提交（未 push）**；B3/X-21 仍 open，不勾任何 Gate

---

## 1. 目标与验收

### 1.1 目标

让 Hub 的**一个** `AuthorizationService` 成为以下三项的唯一权威：

1. iTwin 成员权限（owner/creator/成员角色）**并集本地组角色继承**；
2. iTwin shares（email/domain、allow/deny、过期）在**未 secured** iModel 上生效，
   deny 对 secured iModel 同样生效；
3. 文档级动作 `doc.read`、`doc.write`、`briefcase.write`、`changeset.push`
   映射到四个 iModel 维度（briefcases/changesets/versions/locks）。

`PermissionsService.getUserPermissions`（`GET /imodels/:id/permissions`）与内部
`POST /internal/v1/authz/decisions` 必须消费同一 resolver 结果，不再各自实现
creator/显式行判定。

### 1.2 可观察验收

- 直接成员或本地组成员（`access_control_groups.roleIds`）都获得
  `DEFAULT_MEMBER_PERMISSIONS` 起点；组角色与直接角色并集；owner/creator 仍
  `ALL_PERMISSIONS`。
- 非空 `imsGroups` 的组不授予任何权限（含默认成员权限），记录
  `unsupported_group_source` 警告；不静默成“有权限”或“无权限”。
- share `denyList` 命中（未过期）时，owner/creator/iTwin manage/显式 iModel
  Read 全部被拒绝；secured 与 unsecured 一致。
- 未过期 share：View→Read、Edit→Write、Manage→Manage；当前“写=Manage”
  兼容期，Edit 不满足 Manage；secured iModel 上 share 不授予访问。
- 决策端点只接受四个闭集动作；`doc.write`/`changeset.push` 为多资源 AND 语义；
  NotFound→deny(`imodel_mismatch`)，Forbidden→deny，未知动作 400。
- `/imodels/:id/permissions` 的 read/write/manage 与 resolver 同意；响应形状仍为
  `IModelPermission` 枚举数组。

### 1.3 非目标（明确不做）

- **不改路由强制等级**：不修改任何 `@RequirePermission`/guard/controller 行为；
  B3.1c–g 的 MS/Hub/BFF/WA/storage/tile 入口强制不在本切片。
- 不做 MS 本地 PEP、OBO 签发/交换扩展、服务身份变更、写路径 5s 缓存。
- 不做 link share、tokenized share、IMS 组/嵌套组解析、tenant/RLS。
- 不实现 share 更新路由（当前只有 create/delete；如未来新增 update，必须复用
  同一 `authz:iTwin:<id>` 失效路径）。
- 不宣布 B3/X-21 关闭；不碰 live DB/stack、不 commit/push。

---

## 2. 关联项目能力清单

| 项目/仓 | 相关能力 | 现有实现 | 结论 |
|---|---|---|---|
| imodelhub-services | `AuthorizationService`（iTwin RBAC + secured iModel 显式维度） | `src/common/authorization/authorization.service.ts` | 扩展（唯一 resolver） |
| imodelhub-services | `Permission` / `imodel_user_permissions` / `IModelPermission` | `permissions.enum.ts`、`imodels/domain/permission.ts`、`imodel-permission.enum.ts` | 复用 |
| imodelhub-services | groups/shares schema 与 CRUD | `src/access-control/**` | 扩展（additive `roleIds`；share 执行） |
| imodelhub-services | 决策端点/动作目录 | `src/authz/**` | 扩展（四动作 + 多资源） |
| imodelhub-services | 缓存失效 | `CacheService.invalidateTags` + `authz:iTwin/*`/`authz:user/*` | 复用 |
| imodelhub-services | OBO scope CHECK | 迁移 `20261123000002` | additive 放宽（新迁移） |
| iTwin/iModel | 模型事实源/事务 | iModel/BIS | 不适用（本切片不碰模型数据） |

---

## 3. 复用决策矩阵

| 需求能力 | 候选复用 | 覆盖度 | 决策 | 理由 |
|---|---|---|---|---|
| 有效权限解析 | `AuthorizationService` | 已有 iTwin RBAC + secured ACL | 扩展 | 保持单一 PDP，不新增策略引擎 |
| 组权限 | `access_control_groups` + `access_control_group_members` + `access_control_roles` | 有组成员但组无 roleIds | 扩展 | additive 列；只展平一层本地组 |
| iTwin shares | `access_control_shares`（permission/email/domain/allow/deny/expiry） | CRUD 存在但未解析 | 执行（本切片） | G1 Gate 允许“执行或删除”；本切片选择执行并显式限制范围 |
| 文档动作 | 既有 `Permission` + 四维度 | 单动作 `doc.read`/`briefcase.write` | 扩展 | 固定翻译表，AND 语义复用同一 resolver |
| 权限 UI 投影 | `PermissionsService.getUserPermissions` | 第二套 creator/显式行实现 | 替换 | 改为 resolver projection，杜绝 UI/服务端漂移 |
| 拒绝语义 | — | 无显式 deny 表 | 仅 share denyList | 显式用户/iModel deny 表不在本切片；share deny 已满足本期要求 |

---

## 4. 跨仓影响

| 仓/层 | 契约 | schema/迁移 | 测试 | 发布 |
|---|---|---|---|---|
| Hub | 无跨仓契约变更（内部 resolver/路由 DTO 注释） | `20261124000005`（group roleIds）、`20261124000006`（OBO scope） | 单测 + 隔离 relational e2e | 未发布 |
| shared/editor/viewer/web | 无 | 无 | 未触碰 | — |
| modeling-server/webhook-agent/worker | 无（本切片不改客户端） | 无 | 未触碰 | — |

- 版本兼容：OBO 旧 token（`doc.read`/`briefcase.write`）继续合法；新动作需新迁移。
- 发布顺序（未来）：Hub 迁移/代码 → 需要新动作的 MS 客户端；本切片不发布。

---

## 5. 语义、Deny 优先级与迁移

### 5.1 解析顺序（实现口径）

```text
1. iModel 存在性（不存在 → 404 / decision not_found）
2. 活跃 share denyList（未过期 + 邮箱/域命中）→ 拒绝（先于 owner/creator/manage/显式行）
3. isSecured=false：
   a. iTwin RBAC（owner → creator → 成员/组角色并集）
   b. 未过期 share grant（View/Edit/Manage → Read/Write/Manage）
4. isSecured=true：
   a. iTwin `imodels_manage`（owner/creator/Admin/Editor/组继承）→ 允许
   b. 显式 `imodel_user_permissions` 对应维度等级
   c. share 不授予（默认拒绝）
5. 无 grant → 拒绝
```

**Deny 优先级表**

| 优先级 | 来源 | 可被 owner/manage 覆盖 | 本切片状态 |
|---|---|---|---|
| 1 | 账号 inactive/locked/session 撤销 | 否 | 由 JWT/session 层前置，不重复实现 |
| 2 | share `denyList`（邮箱/域） | **否** | 已实现（secured/unsecured） |
| 3 | 过期 share | 记录不活跃：既不授予也不拒绝 | 已实现（每次解析按 now 判定） |
| 4 | 任何 grant（iTwin/group/share/explicit） | 否（只决定允许范围） | 已实现 |
| 5 | 默认拒绝 | — | 已实现 |

**边界说明（诚实登记）**：share deny 在本切片作用于 **iModel-scoped resolver**
（`checkIModelAccess`/permissions projection）。iTwin 级管理路由
（`checkAccess`/`checkITwinManageForIModel`，如删 iModel、授权面、`isSecured`
开关）**未**接入 share deny；本切片明确不改这些路由/守卫行为。该边界在
B3.1c–g 评估。

### 5.2 Groups

- schema：`access_control_groups.roleIds text[] NOT NULL DEFAULT '{}'`（additive）。
- 解析：用户 → 本 iTwin 活跃组 → 其本地组成员行 → 组 `roleIds` 与直接成员
  `roleIds` 并集 → 角色权限并集；起点为 `DEFAULT_MEMBER_PERMISSIONS`
  （直接成员**或**受支持的本地组成员）。
- 只展平一层；角色查询按 `(id IN roleIds, iTwinId)` 限定，非法/非 UUID
  roleId 在查询前过滤，避免 uuid 列比较 500。
- `imsGroups` 非空：该组**整体不授予**（含默认成员权限），记录
  `unsupported_group_source` 警告；不把外部组当授权来源。
- 失效：group create/update/delete、member add/remove（roleIds 通过 update）
  清除 `authz:iTwin:<id>`，成员变更同时清除 `authz:user:<userId>`。

### 5.3 iTwin shares

- 活跃 = 同 iTwin + 未软删 + `expirationDate == null || > now`。
- 邮箱来自真实 `user` 行：仅当 ACL `userId` 是安全数字串时查
  `users.id`（`Number.isSafeInteger`）；非数字/无邮箱时 share 不生效，
  不臆造邮箱。
- 条目：去空白/小写/去前导 `@` 后，含 `@` 为精确邮箱，否则为域；
  域匹配按 **dot 边界后缀**（`example.com` 匹配 `a@example.com` 与
  `a@sub.example.com`，不匹配 `a@notexample.com`）。
- allow 来源：`sharedWithEmails`、`sharedWithDomains`、`allowList`
  （三者同规则）；deny 来源：`denyList`，优先于一切 grant。
- 权限映射：View→Read、Edit→Write、Manage→Manage。当前写=Manage：
  Edit 不满足 Manage。
- **仅 `isSecured=false` 授予**；secured 仍需显式 iModel grant 或 iTwin manage。
- share 不进入 `getPermissions`，因此不会授予 iTwin 级路由或 secured 绕过。
- 缓存/性能：**不新增 share 缓存**；每次 `checkIModelAccess` 做一次
  iTwin 索引查询，仅当存在 email/domain 条目时再查一次 `user.id`。过期在
  每次解析即时生效；share create/delete 仍清 `authz:iTwin:<id>` 作为一致性
  保障。当前无 share update 路由，未来新增必须接同一失效。
- 残余：每个内容请求多一次 DB 查询；本期以“立即撤销/过期”为优先，
  PDP 回源预算见 §6。

### 5.4 文档动作目录

| Action | 资源维度要求 | 首期等级 |
|---|---|---|
| `doc.read` | 无单一维度；任何 Read 维度 / 未 secured iTwin `imodels_webview` / share View+ | Read |
| `doc.write` | briefcases **且** changesets **且** locks | Manage（写=Manage 兼容） |
| `briefcase.write` | briefcases | Manage |
| `changeset.push` | changesets **且** briefcases | Manage |

- 动作闭集；未知动作在 DTO/服务层拒绝（400 `unknown_action`）。
- 多资源动作全部通过才 allow；任一 Forbidden → deny；iModel 缺失 →
  not_found（decision 映射 `imodel_mismatch`）。
- OBO scope CHECK additive 放宽到四动作；down 在仍有 `doc.write`/
  `changeset.push` 行时 fail-closed。

### 5.5 Permissions 投影与 Delete

- `read` ← `doc.read` allow；`write` ← `doc.write` allow；
  `manage` ← `IMODELS_MANAGE`（任一维度/未 secured 的 iTwin manage 或
  share Manage）。
- `webView` = read || write || manage（不再为“零权限调用者”伪造公开 webview）。
- **行为变化（有意）**：未 secured iModel 的普通 Viewer 现在得到
  `Read`（`doc.read` 在动作目录中允许），不再是旧的 WebView-only。这与决策
  端点对 `doc.read` 的 allow 一致；路由守卫仍先行拦截陌生人。
- **Delete 口径**：`imodels-delete` 与 DELETE 路由一致，仅由 iTwin
  `imodels_manage` 产生，并受活跃 share deny 抑制；组/share/显式 iModel Owner
  都不新增 Delete；
  `DELETE /imodels/:id` 仍要求 iTwin manage（本切片不改）。

### 5.6 迁移

| 迁移 | 内容 | down |
|---|---|---|
| `20261124000005-AddAccessControlGroupRoleIds` | `ALTER TABLE ... ADD COLUMN IF NOT EXISTS "roleIds" text[] NOT NULL DEFAULT '{}'` | 任一组合 `roleIds` 非空则抛错；清空/导出后再回滚，之后 DROP COLUMN |
| `20261124000006-RelaxOboActionScope` | 替换 `CHK_auth_obo_tokens_scope` 为四动作闭集 | 仍有 `doc.write`/`changeset.push` token 行则抛错；撤销/排空后恢复两动作约束 |

均为 additive；旧代码可忽略新列/放宽后的约束。无 live DB 应用，无数据回填。

---

## 6. 性能

| 项 | 本切片行为 |
|---|---|
| iTwin 权限缓存 | 保持 60s，tag `authz:iTwin:<id>` / `authz:user:<id>`；组变更按 iTwin 全清 |
| share 查询 | 每次 iModel-scoped 解析 1 次 `access_control_shares`（按 iTwinId 索引）；无 share 缓存 |
| 用户邮箱 | 仅当活跃 share 含 email/domain 条目时 1 次 `user.id` 查询；失败不缓存 |
| 过期 | 每次解析按当前时间判定，无需失效即可生效 |
| 决策端点 | 多资源动作一次加载 iModel context（iModel 1 次 + shares 1 次 + 缓存权限） |

残余风险：share 行数很大的 iTwin 或高频内容路由会放大查询次数；若未来需要，
应在 B3.1c 前加 ≤5s 的 share 摘要缓存并保留 create/delete/update 失效。

---

## 7. 测试证据

- **Hub tsc**：`npx tsc --noEmit -p tsconfig.json` 通过。
- **Hub eslint**：全部改动文件 0 error（仅 Prettier 自动修复）。
- **Hub 全量 unit**：172 suites / 1560 tests 通过（本切片新增/修改：
  resolver groups/shares/projection、actions、migrations、access-control
  roleIds/失效）。
- **隔离 relational e2e**（独立 `tests` compose 项目、fresh Postgres、
  全部迁移真实执行、未触碰 live DB）：
  `test/integration/b3-resolver-align.e2e-spec.ts` **6/6 通过**：
  1. 组角色继承 + 删除组后缓存失效；
  2. 非空 `imsGroups` 组不授予 Editor roleIds；
  3. share View/Edit 只授予文档 Read，不授予 Manage/iTwin 路由；
  4. share denyList 压过 iTwin Editor（imodels_manage）；
  5. 过期 share 既不授予也不拒绝；
  6. secured iModel 上 share 不授予。
- **迁移实证**：fresh DB `migrations` 含 `20261124000005/00000006`；
  `CHK_auth_obo_tokens_scope` 为四动作数组；
  `access_control_groups."roleIds"` 为 `text[] NOT NULL DEFAULT '{}'`。
- **清理**：`docker compose -p tests down -v` 与 `rm -svf` 已执行，容器/卷/
  网络删除；未对 live 栈/DB 做任何操作。
- **未证明**：部署形态 canary、MS 真栈 ACL（B3.1c–g）、storage/tile/WA、
  share 行数规模性能、iTwin 级路由对 share deny 的行为（本切片明确不变）。

**评审修正（2026-11-24，e2e 后由单元测试覆盖）**：

1. **域匹配**：share 的 domain 条目按设计改为 **dot 边界后缀**
   （`example.com` 匹配 `a@example.com` 与 `a@sub.example.com`，不匹配
   `a@notexample.com`）；新增 subdomain 正例。
2. **Delete 投影**：`imodels-delete` 不再保留 creator-only 第二口径，改为与
   DELETE 路由一致的 iTwin `imodels_manage`，活跃 share deny 时抑制；新增
   “非成员 iModel creator 不再获得 Delete”负例。
3. 修正后 tsc/eslint 通过；定向 resolver + permissions 测试 65/65；最终 Hub
   全量 **172 suites / 1560 tests** 通过。隔离 e2e 的 group/share/deny/expiry
   核心断言不受这两处修正影响，未重跑 e2e（修正由单元测试覆盖）。

---

## 8. 回滚与发布

- 代码回滚：恢复旧 `AuthorizationService`/`PermissionsService` 即可；新列与
  放宽后的 scope 约束对旧代码无害。
- 数据回滚：两个 down 均 fail-closed（组 roleIds 非空 / 新动作 token 存在时
  拒绝）；按 §5.6 runbook 清理后再回滚。
- 兼容窗口：旧 OBO scope 继续合法；新动作只在迁移后签发。
- 发布门：本切片已本地提交、未发布/未 push；未来发布必须先跑完整 Hub unit +
  隔离 relational e2e，并由 release owner 执行。
- 产物/镜像 provenance：本切片未构建/发布镜像。

---

## 9. 评审结论

- 复用矩阵完成：是（单一 resolver 扩展，未新建策略引擎）。
- 跨仓影响明确：是（仅 Hub + 公共文档；shared/MS/WA/worker 未触碰）。
- P0 例外已登记：沿用 X-21/X-27；**B3/X-21 仍 open**。
- ADR：不需要（additive 字段/动作，无新令牌/渲染/native 契约）。
- 未闭合（必须保持诚实）：
  - 路由级强制仍属 **B3.1c–g**；本切片不改 `@RequirePermission`/guard。
  - storage/tile 匿名面、WA baseline/回执、MS 本地 FeatureOp/直改/export/
    progress/retry 仍未覆盖。
  - 显式用户/iModel deny 表、link share、tokenized share、IMS/嵌套组、
    tenant/RLS 未实现。
  - share deny 未作用于 iTwin 级管理路由（明确边界，见 §5.1）。
  - 历史 ACL 行若把 email 存进 `userId`（非数字），share 的邮箱/域判定不会
    命中；遵循“不臆造身份”，只能等该行改写为真实 `users.id`。
- 结论：**实现完成，待 owner 评审/合并**；不代替 Gate 评审，不勾 G1 Gate。
