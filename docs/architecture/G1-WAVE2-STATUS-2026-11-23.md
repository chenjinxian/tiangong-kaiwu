# G1 架构硬化第二波状态（2026-11-23）

> **这不是 G1 Gate 通过记录。** G0 决策册仍未 ARB 签字，G1 计划仍为
> Proposed/待 GO；G1 Gate 15 项均未勾选。本文只登记本轮实际实现、证据与
> 未完成项，所有不能由真栈/实际产物证明的内容保持 blocked。

## 1. 工作流快照

| 工作流 | 本轮落地 | 证据 | 未完成/边界 |
|---|---|---|---|
| WS-C 会话 | C6：`getConfiguration` 移除宿主 `cacheDir`；HTTP 有状态 RPC 默认 403（`HTTP_STATEFUL_RPC_MODE=deny`，X-19）；`saveChanges/pushChanges` 增加写租约校验 | MS 受影响 suite 24 files/234 tests；src tsc、eslint（新文件）通过；C6 AIRR | 双会话真栈 e2e 未跑；`pullChanges/abandonChanges/toggleGraphicalEditingScope` 租约检查顺延 |
| WS-B 身份/ACL | B5a：MS/BFF 默认拒绝 `?token=`，401/429/安全日志脱敏（X-18）。B1.2a：access token 绑定 `sessionId+sessionHash`，logout/改密/重置/轮换/停用后下一请求 401。B1.2b：MS WS 周期 session-status 复验，撤销关闭 4401。B1.2c：BFF/MS 正 token 缓存默认 0，负结果不缓存；WS 既有连接延迟登记 X-20。B2 P0 Hub shadow：opaque delegation handle/OBO、shadow decision、additive token/audit 表，默认 off（X-21/X-22）。B2 P0 MS shadow：WS 升级换 handle（不存用户 token）、download/open shadow decision（仅记录不拒绝）、覆盖清单默认 off | Hub 全量 unit 147 suites/1339 tests；隔离 relational Hub e2e：B1.2 18+7、B2 16；MS 全量 **149 files/1459 passed、1 expected fail、8 skipped**；BFF 28/28；各处 tsc/eslint 通过。MS P0 shadow：新增 4 files/29 tests，affected 28 files/268 tests，tsc 通过；新代码 eslint 通过（触及文件仅余既有弃用基线） | **B2/B3.1 MS 未部署/真栈未跑**；B3.1c 读/B3.1d 写强制已实现但默认 off（写仅 fake-Hub/单测，未跑隔离 canary/native；详见 §12/§13），仍 `p0-not-covered`：export/tile/progress/retry/undo-redo/saved views/assembly 等；handle 15m 后无续期（P2 WS ticket 前置）；真实 changeset/briefcase 归因未切换；B6 服务身份、B7 WORM、B10 租户未做；新 Hub/MS 镜像未部署，WS 4401 真栈待验 |
| WS-D 账本/版本 | D1.4/D1.7：complete 大小/SHA-256 与下载链校验；D2：悬挂 changeset 超时/回收；D6a：Named Version 封账、PATCH 白名单、删除保护、409 NotReady、index 回退；D4 Hub 控制面：`checkpoint_jobs` outbox/lease/claim/heartbeat/complete/fail，flag 默认 OFF；Hub 内部契约：storage-token、claim `iTwinId`/container、chain evidence；D4b worker 切换消费这些契约（109/109 tests，typecheck/lint/build；X-23/X-24 code exit） | Hub 全量 unit 绿；迁移在隔离 Postgres 事务内 up/down 验证，live DB 未应用（`checkpoint_jobs` 等表不存在）；worker fake-hub 编排绿（含 `/chain`、storage-token/续签/拒绝路径） | **真实 checkpoint native 生成/readback 未执行**；真实 Hub/DB/Azurite + native canary、长上传续签实机、日志无 SAS 实机证据未跑（X-23/X-24 仍 open）；D3 历史复制/async Create、D5 版本打开、D7 restore/compare、D8 refs 未做；200/1000 冷开基线未测 |
| WS-J 发布/CI | J1.2 shared 契约冻结门；J1.3a web 生产 build + BFF typecheck/tests 进 public CI；J1.5 Playwright JSON→基线脚本；J3.1g manifest 实际字节 digest 校验与 release-gate 可选接线 | 契约门 8/8、release-manifest 24/24、e2e baseline 5/5；BFF 28/28；release-gate.ps1 语法检查通过 | **public CI 从未实际运行**（分支未 push）；backend 全量/native ctest 仍需 self-hosted；真实镜像 digest/OCI label/SBOM/attestation 未生成；无实际 release manifest |
| WS-E 数据/DR | 无新增 DR 实现 | 仅有备份脚本基线；审计确认 `pg_dump` 不是 PITR、Azurite 无版本化 | E1/E2/E8 全部未完成；无 RPO≤5m/RTO≤1h 证据；不得宣称灾备达标 |
| 其它 | MS 全量测试 5s 默认在并行 145 文件下出现 StandaloneDb 超时；将 `testTimeout` 调到 15s（仅时间预算，不放宽断言），随后全量绿 | `vitest.config.mts`；全量 1459/1 expected/8 skipped | 这是测试基础设施调整，不改变产品行为；不掩盖性能回归需后续基线 |

## 2. 明确未完成/不得宣称

1. **G1 Gate 未通过**：G0 ARB 未签字，15 项 Gate 全未勾选；B2 shadow、B3.1c/d 强制均默认 off 且未部署/未跑真栈，B1.2 的 WS 真栈关闭未验。
2. **D4 不是“真实 checkpoint 已生成”**：Hub 控制面、内部 storage-token/claim/chain-evidence 契约与 worker 消费代码已落地（X-23/X-24 code exit），但 native canary、真实 readback、200/1000 冷开基线均未执行；`CHECKPOINT_GENERATION_ENABLED` 未打开。
3. **安全边界未闭环**：B2 MS 侧已接 shadow、B3.1c 读/B3.1d 写强制已实现但默认 off（均未部署/真栈未跑；B4 Manage-only、export/tile/storage/WA 等仍未强制）、B6 共享 API key/人类 admin 服务登录仍在、B7 审计 WORM 未做、B10 无 tenantId；B8 TLS/Azurite/tile 暴露未处理。
4. **DR 未闭环**：无 PITR、无对象版本化/跨区、无恢复演练记录；RPO/RTO 不能宣称。
5. **发布未闭环**：CI 未运行、镜像非可复现、真实 digest/manifest/SBOM 未产出；`verify-stack` 仍是审计基线 15/17。
6. **会话/租约**：C5 外部 lease/fencing、C7 checkpoint 恢复未实现；既有 WS 撤销仍受 X-20 窗口限制。

## 3. 下一步优先级

1. 部署新 Hub/MS（隔离或 canary），真栈验证 B1.2 4401、B5a 401、B2 shadow 端点；恢复/保持 live DB 迁移窗口控制。
2. B2 P0 MS 侧 shadow 已接（默认 off、未部署）；下一步部署 Hub/MS 做 staging 两用户 canary（下载/打开无行为变化、日志无 token、Hub audit 可查），再按覆盖清单把 B3 入口分类为 `covered-enforce`/`fail-closed`；在此之前不进入 enforce。
3. 为 D4 跑 native canary/readback（Hub storage-token/claim iTwinId/chain evidence 与 worker 切换已完成）；之后才打开生成 flag。
4. 关闭 C5/C7 与 E1/E2；B6/B7/B10 与 J2/J4 仍属后续 Gate 前置。
5. 所有“通过”必须附真栈/CI/产物证据；本文不替代 Gate 评审。

## 4. 变更状态

- 本轮改动分布在 public / `luban-backend` / `imodelhub-services` 三仓，**均未 commit、未 push**。
- 新增例外 X-16..X-24 均带 owner/失效日期/退出计划；未关闭项不得从 Gate 记录中删除。
- 相关 AIRR/ADR 索引见 `docs/README.md`；私有证据仅在本机私有仓，未写入公开仓。

## 5. 隔离 canary 真栈证据（2026-11-23）

隔离环境：Hub 当前源码 + 未提交 B2/D4 改动，独立 compose 项目 `g1-canary`、
独立 Postgres/Azurite/端口；MS 为宿主源码。live 栈/DB 未触碰，canary
容器/卷/端口已清理。

| 验证项 | 结果 | 证据 |
|---|---|---|
| B5a query token | **PASS** | `/ipc?token=`、`/ws?token=` 与 HTTP RPC `?token=` 均 401；`Authorization` 控制连接可用；21/21 断言 |
| C6 有状态 HTTP RPC | **PASS** | 有效 CSRF 下 `pushChanges` → 403 `HttpStatefulRpcDenied`（含 bogus Bearer，证明在 Hub 前拦截）；`getConfiguration` → 200。CSRF 在 C6 之前，缺 CSRF 会先返回 `CSRF_INVALID` |
| B1.2a logout/disable/refresh | **PASS** | `/auth/me` 200 → logout 204 → 旧 token 401；session-status `active:false`；refresh 后旧 access 401/新 access 200/reuse 401；disable 后 401 |
| B1.2b 双 WS 撤销 | **PASS** | A/B 两会话；logout A 仅 A 在 **29,985 ms** 以 `4401 Session revoked` 关闭，B 全程 OPEN |
| B1.2b Hub 瞬断 | **PASS** | 暂停 Hub 40s，socket B 保持；恢复后仍 OPEN；单测覆盖 401/403/404/429/5xx/网络超时保持 |
| B2 P0 shadow | **PARTIAL（shadow 证据 PASS）** | MS `downloadBriefcase` 产生真实 Hub `audit_events`：`doc.read:allow:allowed:shadow`、`briefcase.write:allow:allowed:shadow`；MS 记录 `shadow_decision`/`legacy:"continue"`；日志无 JWT/handle/SAS，token 表仅 64 位 hash。**legacy 下载本身因 canary 的 4-byte 占位 baseline 404 失败**；`AUTH_OBO_MODE=off` 控制组同样 404 且无 audit/handle，说明不是 shadow 拒绝。成功下载需有效 baseline/checkpoint，留给 D4 native canary |

结论：B5a/C6/B1.2a/B1.2b 获得隔离真栈证据；B2 shadow 的决策/审计/无泄漏证据成立，
但“合法 legacy download 成功且无行为变化”尚未证明；D4 native checkpoint
生成/readback 与 200/1000 冷开基线仍未执行。G1 Gate 依旧未通过。

## 6. D4 shim-free native canary（2026-11-23，第二轮）

在修复 Hub checkpoint 投影（非 successful 目标回退到 preceding successful）
和 worker 探针/队列依赖后，原 canary 在**无网关 shim、无探针 preload shim**下
重跑通过：

- 真实 webhook-agent 生成 baseline；真实 native changeset index 1
  （212 B，chainHash `8653d1c5…`）。
- scheduled 目标下，Hub `GET /changesets/{id}/checkpoint` 与 index 路由均直接
  返回 baseline；官方 `BriefcaseManager.downloadBriefcase({asOf})` 直接成功，
  apply 后五项检查通过，无网关。
- worker 以 **BullMQ queue 模式**运行（真实 probe + ioredis），claim 一次，
  native 生成/上传/fresh-cache readback/complete 成功；Hub checkpoint
  `successful`、4,194,304 B、chainRoot 三处一致、无幽灵行、无 SAS/JWT 日志。
- 独立 readback 10/10：manifest、块数、size/SHA-256/queryDatabaseHash、
  iModelId/iTwinId/index、briefcaseId=0、无 pending txns。
- 失败关闭：错误 service/API key 401、未知 changeset 404、terminal job
  storage-token 409、worker chainRoot/iTwin 篡改测试通过。
- 可选 B2 shadow：真实 MS shadow 服务类产生一条 `doc.read:allow:allowed:shadow`
  audit；legacy download 在 shadow off/on 两种配置下同样成功（off 不写 audit）。

**仍 open（不能因本次 canary 关闭 X-23/X-24）**：
- BullMQ 在 ~161s native 工作期间锁续期失败，完成后重试并被
  `CheckpointJobBusy` 吸收；无重复行。已加有界缓解：Worker lockDuration
  默认 30 分钟（15–60 分钟校验）、lockRenewTime=lockDuration/6，避免当前
  单作业预算内丢锁；**但 native 工作仍阻塞事件循环**，超过锁预算仍可失锁，
  后续需把 native 生成移到 worker thread/child process（未实现）。
- 真实 Azure 未验（仅 Azurite；需 `--skipApiVersionCheck`）；
  长上传 SAS 续签、Linux worker 镜像/生产部署未验。
- checkpoint REST DTO 仍省略 `fileSize`，`manifestPath` 仍为 null（本切片未写
  Hub sidecar）。

## 7. 后续切片（2026-11-23，不改变本文 Gate 结论）

- **D5 只读版本打开**：`LubanIpcInterface` 1.1.0 additive `downloadVersionBriefcase` +
  MS Hub 目标解析/`briefcaseId:0` 下载/版本键缓存/写拒绝已实现，shared 与 MS 单测、
  tsc 通过。隔离 D5 canary 已通过 NamedVersion/index/id 只读打开、几何/树、head
  不变、写拒绝；发现 baseline `changesetId=""` 解析失败与 key 日志绝对路径泄漏，
  已修复+单测；**2026-11-24 canary 重跑通过** baseline index 0、NV/index/id、几何/树、
  head 字节不变、写/保存/push/pull/abandon/可写重开 403、key 日志仅 `path:<basename>`。
  X-25 保持 open：native loader dev-build 绝对路径/`err.stack`、B3 per-doc ACL、
  200/1000 性能仍未闭环；G1 Gate 仍未勾选。证据与重跑命令见
  `AIRR-2026-11-23-D5-VERSION-OPEN.md` §5.8/§7.3。

## 8. B6 服务身份后续切片（2026-11-24，不改变本文开头 Gate 结论）

本文 §1 的 2026-11-23 快照中“B6 服务身份未做”已被后续切片取代；完整设计与证据见
`AIRR-2026-11-23-B6-SERVICE-IDENTITY-P0.md`、
`AIRR-2026-11-23-B6-DATA-PLANE-P3.md` 与
`AIRR-2026-11-24-B6-P4-DATA-PLANE-CLIENTS.md`。

- **P0/P1/P2（已本地提交）**：Hub `service_clients`（scrypt 哈希/JSON scope/enabled/secretVersion）、
  `POST /auth/token/service`、双模 `ServiceAuthGuard`；session-status/OBO shadow/worker
  内部控制面 code-only 改用 `X-Service-Token`。默认 `off` 保持 legacy；未跑部署形态 canary。
- **P3（已本地提交：public `4a35e6c403`、hub `e1869a4` + `3f2dc5a`）**：Hub 官方 changesets/briefcases/checkpoints/locks/namedversions/baseline
  选定路由接入 `DataPlaneAuthGuard` 与 closed `data.*` scope 矩阵（additive 迁移
  `20261124000004`），逐端点服务 pin，服务主体永不写入 `request.user`；owner 依赖写与
  baseline failed/requeue/admin/iModel list/detail 明确 legacy-only。服务 push 的 changeset 记
  `creatorName=service:<name>`、`creatorId=NULL`。
- 证据：Hub tsc/eslint、全量 unit 167 suites/1504 tests；**隔离 relational e2e 6/6**（fresh
  Postgres 真实执行全部迁移；`CHK_service_clients_scopes` 接受 data scope、拒绝 `data.*`；
  allow/deny、错误服务/audience/expired/disabled/rotated、用户 JWT 与 legacy allow 路径均验证）。
  用后 compose `tests-p3` 已 `down -v` 并删除项目镜像，live DB/stack 未触碰。
- **评审修复**：P2/P3 迁移的 CHECK JSON 字面量原先把 scope 列表重复包进 `["..."]`，会生成非法
  JSON 并在真实迁移时失败；已修复并让迁移单测对 SQL 字面量做 `JSON.parse` + 精确 allowlist 断言。
  P2 迁移未部署到任何环境，故直接更正。
- **P4a（工作树，未提交；B6 P4a）**：MS/worker/WA 各增独立数据面模式（默认 `legacy`；WA 使用 `WEBHOOK_AGENT_*` 变量，避免与 MS 身份冲突），
  service-token 为显式 opt-in；MS/worker 官方 IModelsClient 经公开 `restClient` 接缝装饰官方
  `AxiosRestClient`，按 Hub P3 `(method,URL)` 矩阵只对 P3 且本服务 pinned 的路由注入
  `X-Service-Token`（MS 8 个注入 scope、worker 3 个只读、WA baseline read/write；MS 不向
  baseline 出示 token）；MS version resolver 的 P3 read 同步迁移。provider 复用 P1/P2 实现，
  WA 新增同协议最小实现（缓存/刷新/并发/401 清除/无 legacy 回落/日志脱敏）。owner 依赖写
  （briefcase create/acquire/release、锁写、extended-data/groups、named-version 写）与
  baseline failed/requeue/admin 仍 legacy，留 P4b。证据：MS 158 files/1622 passed（+1 expected
  fail/8 skipped）、worker 17/240、WA 15/98，三进程 typecheck/build 绿；另有隔离 Hub + MS provider
  跨仓 canary 通过（真实 token 签发、P3 read 404、baseline wrong-service 401、invalid legacy 401、
  Hub 日志 secret/token hits=0）；未跑部署形态三进程 canary/native 下载。
- **P4a 评审加固**：MS 只要求 8 个非 baseline scope（不申请 baseline）；MS/worker 注入前校验
  Hub origin（跨 origin 的 P3 形状 URL 不注入）；WA/worker token URL 启动日志脱敏为 origin+path。
- 仍未完成（X-21 open）：P4b briefcase/lock owner 与服务 actor 语义、baseline
  failed/requeue/admin、extended-data/named-version 写、TLS/KMS/撤销列表、共享 key/admin 退役、
  B10 租户、三进程部署形态 canary。**不得宣称 B6 完成或 G1 Gate 通过。**

## 9. B3.1 入口/PEP 只读审计（2026-11-24）

`B3-ENTRY-PEP-AUDIT-2026-11-24.md` 已登记 Hub/MS/BFF/WA/storage 入口矩阵：MS download/open/
FeatureOp/直改/export 无 per-doc ACL，Hub `X-API-Key` 旁路仍在，groups/shares 未进入授权解析，
nginx `/azurite/` 与 tile 可匿名读取；给出 B3.1a–g 依赖顺序。该审计未改代码、未强制，B3 仍
未完成，G1 Gate 不勾选。

## 10. B3.1a PEP 覆盖分类（2026-11-24，仅分类）

`AIRR-2026-11-24-B3-PEP-COVERAGE.md` 落地覆盖/分类切片，**不新增拒绝路径、不改 Hub
guard/controller、不跑真栈**：

- **MS**：`pepCoverage` v2 枚举 30 个真实入口（download/version open/open/save/abandon/close/
  pull/push/FeatureOp 读/写/PartStudio/写租约/直改/export/saved views/progress/retry/tile/
  storage/NV-checkpoint/Hub 数据面/BFF/WA），状态集闭合为
  `covered-shadow|covered-enforce|fail-closed|registered-exception|p0-not-covered`；
  仅 download/open 为 `covered-shadow`，`covered-enforce`/`fail-closed` 均为 0，其余
  `p0-not-covered` + BFF `registered-exception`（X-27）。启动断言 manifest 内部有效并保留
  原 shadow 告警语义（点名未覆盖项），无请求行为变化。
- **Hub**：新增 unit 反射门禁，覆盖 27 个内容 controller（>100 路由）；每个 handler 必须有
  `@RequirePermission`/`@RequireServiceAuth` 或命中 46 条 `PEP_ROUTE_EXCEPTIONS`
  （route/method/reason/owner/X-27/2027-03-31）。新增内容路由未登记即失败；已有元数据的路由
  不允许被例外遮蔽。未改任何 guard/controller。
- **BFF**：`/api` 仅 JWT 终止后透传；progress/retry 以 `registered-exception`（X-27）记录，
  HUB 九前缀为 `p0-not-covered`；storage/tile/WA baseline 在 AIRR 矩阵保持未覆盖。
- **证据**：MS 全量 158 files / 1629 passed + 1 expected fail + 8 skipped，tsc 通过；Hub 全量 unit
  168 suites / 1510 tests（含 coverage）通过，新增 spec 6/6、tsc 通过；BFF 2 files/33 passed、
  tsc 通过。`EXCEPTIONS.md` 新增 X-27（owner 平台/安全，2027-03-31）。
- **边界**：不是 ACL 强制，不声称任何入口已受 per-doc ACL 保护；B3.1b–g、B6/X-21、B10、
  storage/tile 例外仍 open；G1 Gate 不勾选。

## 11. B3.1b Hub resolver 对等（2026-11-24，已本地提交）

`AIRR-2026-11-24-B3-HUB-RESOLVER-ALIGN.md` 把 Hub 的 effective-permission 解析收口到单一
`AuthorizationService`，**不改路由守卫/控制器行为，不新增拒绝路径，不跑 live DB**：

- **Groups**：additive `access_control_groups.roleIds text[] NOT NULL DEFAULT '{}'`（迁移
  `20261124000005`）；组成员继承组角色，与直接成员 roleIds 并集，起点
  `DEFAULT_MEMBER_PERMISSIONS`；仅展平一层本地组；`imsGroups` 非空组整体不授予并记录
  `unsupported_group_source`；group/member 变更清 `authz:iTwin:<id>`（成员变更另清 user tag）。
- **iTwin shares**：活跃=同 iTwin/未软删/未过期；邮箱仅来自真实 `users.email`（数字 id 安全
  解析，不臆造）；email/domain/allowList 允许，domain 按 dot 边界后缀、大小写与空白归一；`denyList`
  先于 owner/creator/iTwin manage/显式 iModel Read（secured/unsecured 都生效）；View/Edit/
  Manage→Read/Write/Manage，写=Manage 兼容期 Edit 不满足 Manage；**secured iModel 上 share
  不授予**；share grant 不进入 `getPermissions`/iTwin 级路由。无 share 缓存；每次解析 1 次
  iTwin share 查询，过期即时生效；share create/delete 仍清 iTwin tag。
- **文档动作**：闭集扩为 `doc.read/doc.write/briefcase.write/changeset.push`；`doc.write` =
  briefcases AND changesets AND locks Manage，`changeset.push` = changesets AND briefcases，
  `briefcase.write` = briefcases；多资源 AND 通过同一 resolver。additive 迁移
  `20261124000006` 放宽 OBO scope CHECK，down 在仍有新动作行时 fail-closed。
- **对等**：`PermissionsService.getUserPermissions` 改为 resolver projection；read/write/manage
  与决策端点同源。**行为变化**：未 secured Viewer 现在得到 `Read`（旧为 WebView-only）；
  Delete 与 DELETE 路由一致（iTwin manage，share deny 抑制；组/share/显式 Owner 不新增）。
- **证据**：Hub 全量 unit **172 suites / 1560 tests**、tsc、改动文件 eslint 绿；隔离 relational
  e2e **6/6**（fresh Postgres 真实迁移；组继承+删除失效、imsGroups fail-closed、share
  View/Edit/deny/expiry/secured；用后 `docker compose -p tests down -v`，未触碰 live DB）。
- **边界**：路由级强制仍 B3.1c–g；storage/tile、WA baseline、MS 本地 FeatureOp/直改/export/
  progress/retry 未覆盖；share deny 未作用于 iTwin 级管理路由；显式 deny 表/link share/
  IMS/嵌套组/tenant 未做。B3/X-21 仍 open，G1 Gate 不勾选。

## 12. B3.1c MS 读强制（2026-11-24，已本地提交，默认 off）

`AIRR-2026-11-24-B3.1c-MS-READ-ENFORCE.md` 落地**首个行为变化的强制切片**，复用既有
OBO shadow 传输与 Hub `POST /internal/v1/authz/decisions`，**不改 Hub/shared/web/WA/BFF**：

- **开关**：`AUTH_B3_READ_MODE=off|enforce`，默认 `off`；`enforce` 要求
  `AUTH_OBO_MODE=shadow` + `AUTH_OBO_SERVICE_NAME`，非法组合启动失败。回滚=改回 `off`，
  无数据/schema 迁移。`off` 下 legacy/shadow 读行为不变。
- **入口**：`downloadBriefcase`（readonly=`doc.read`；rw=`doc.read`+`briefcase.write`）、
  `openBriefcase`（同左，gate 在任何 db close/open 前）、`openCheckpoint`/
  `downloadVersionBriefcase`（`doc.read`，在 Hub resolver/下载前）、FeatureOp 九个读方法
  （`doc.read`，在 `getFeatureService`/`ensureInitialized` 前）。`getFeatureFormModel`
  无文档键不强制；写/直改/save/push/pull/export 未强制（B3.1d+）。
- **失败语义**：无 session/无文档上下文/deny → `AuthorizationDenied` 403；无 handle/
  provisioning/超时/Hub 不可用 → `AuthorizationUnavailable` 503；绝不回退共享 key/JWT
  或继续 legacy。deny 不写 legacy-continuation 记录。
- **OBO 正确性**：OBO 缓存 key 改为 iModel+scope 集合，`grantedScopes` 不覆盖请求动作即
  重新 exchange（read→rw 不再复用只读 token）；决策按 iModel+动作集合缓存（Hub TTL 上限
  30s）；首个读等待 WS 升级在途 provisioning（有界），超时记录 `provisioning_timeout`。
- **覆盖清单**：`pepCoverage` v3；读入口 5 项 `covered-enforce`；`getFeatureFormModel`
  与 `openStandalone`/`openSnapshot` 单独 `p0-not-covered`；其余写/直改/export/tile/
  storage/WA 状态不变。
- **证据**：MS 全量 **163 files / 1671 passed + 1 expected fail + 8 skipped**；tsc/build 绿；
  新文件 eslint 0 error（触及文件仅剩既有弃用基线）。**隔离 Hub+MS gate/OBO canary 通过**：
  真实 admin/View-share/outsider、unsecured/secured、rw/read-only、version/feature、真实
  delegation/OBO/decision、真实 `LubanIpcHandler.downloadBriefcase` 拒绝路径；Hub 日志
  agent key/admin password/x-service-token 命中 0。**读强制+native 组合未验证**；B3.1d native
  canary 在 read off 下已证明 native 下载/打开与 FeatureOp 读回，但不得宣称完整读链路真栈通过；
  同 session 在 isSecured 后受 30s 读决策缓存影响（fresh session
  立即 deny）；handle 15m 到期后 enforce 读为 503，WS ticket/续期属 P2 前置；
  B6/X-21/B4/B10/B7 未关闭；B3.1d 写强制已在本轮后续切片实现（默认 off，见 §13），Hub 路由级
  强制仍 future。G1 Gate 不勾选。

## 13. B3.1d MS 写强制（2026-11-24，d1–d5 实现，默认 off，已本地提交）

`AIRR-2026-11-24-B3.1d-MS-WRITE-ENFORCE.md` 落地写强制实现，复用既有 OBO shadow 传输与
Hub `POST /internal/v1/authz/decisions`，**不改 Hub/shared/web/Viewer/editor/BFF/WA/worker**：

- **开关**：`AUTH_B3_WRITE_MODE=off|enforce`（默认 `off`）；`enforce` 硬性要求
  `AUTH_OBO_MODE=shadow` + `AUTH_OBO_SERVICE_NAME` + `DIRECT_EDIT_GUARD_MODE=enforce`，
  非法组合启动失败；`AUTH_B3_READ_MODE!=enforce`、`HTTP_STATEFUL_RPC_MODE=allow`、
  `SESSION_ISOLATION_MODE!=enforce` 启动告警。回滚=`off`，无迁移。off 路径不新增 await
  （旧 pull/cancel 顺序测试保持通过）。
- **入口/动作**：FeatureOp 写/预览/PartStudio create-rename-delete/renameFeature/renameBody/
  `acquireWriteLease`/直改=`doc.write`；`saveChanges`/`pullChanges`=`doc.write`；
  `pushChanges`=`doc.write`+`changeset.push`（单次 AND 决策）；`abandonChanges`=`briefcase.write`；
  `releaseWriteLease` 不强制。决策先于 `getFeatureService`/`ensureInitialized`/legacy scope
  查询/EditTxn/db save-push-pull-abandon/进度状态/lease 获取；deny/unavailable→403/503，
  无 legacy 回退。
- **直改**：`enforce` 启动时先 `setDirectEditAclHook` 再装 gate；hook 只信 `SessionContext`/
  registry 验证身份，缺失/不匹配/iTwinId 缺失 fail closed；抛出稳定 403/503（不返回 false），
  逐写方法在方法体前拒绝；`DirectEditWriteGate` 从已打开 db 回填 iTwinId。命令 start/
  `endEdits` 保存点仍是登记残余。
- **缓存/租约**：写决策 TTL 在 MS 侧强制 ≤5s（即使 Hub 返回 30s；读仍 ≤30s）；OBO/decision
  按 iModel+精确动作集缓存，read/write 不共享；deny 不释放已持有 lease（30s TTL + session
  close 兜底）。
- **覆盖清单**：`pepCoverage` v4；8 个写入口 `covered-enforce`（`AUTH_B3_WRITE_MODE=off` 时
  inert）；export/tile/storage/WA/progress/retry 等状态不变。
- **证据**：MS 全量 **168 files / 1724 passed + 1 expected fail + 8 skipped（1733）**；
  tsc/build 绿；新增/改动文件 eslint 0 error（`config.ts` zod 弃用/console 与
  `AppFunctionIpcHandler.ts` 上游 save/abandon 弃用为既有基线）。**隔离 Hub+MS 写 gate/OBO
  canary 通过**：真实 admin/View-share/outsider、secured fresh session、push 双动作、真实
  `saveChanges` 拒绝、真实直改 hook 拒绝；Hub 日志 key/admin password/x-service-token 命中 0。
  **隔离 Hub+MS native 写 canary 通过**（`AUTH_B3_READ_MODE=off`）：真实 CloudSqlite
  baseline 经 Hub 注册 → native briefcase 下载/打开；FeatureOp 10×10×5 产生体积 **500**
  的 ACIS 实体；save/push 生成 Hub changeset **2**（1=partstudio init）；native 直改 mirror
  体积 **1000** 并 push changeset **3**；第二次 briefcase 下载在 changeset 3 成功打开；
  outsider 的 FeatureOp/save/直改均在 native 变更前 `AuthorizationDenied`；Hub changesets
  1/2/3 均 `fileUploaded`（8256/2734/3267B），日志 key/admin password/service-token 命中 0。
  **未证明**：读强制+native 写组合、exchange/decision 计数、p95、撤销窗口、直改 `endEdits`
  保存点二次授权、push 用户归因。B4 Write（Manage-only）、handle 15m/16 uses、push 服务
  账号（B6/X-21）、直改保存边界、读路径 init 写均未关闭；B3/X-21 open，G1 Gate 不勾选。

## 14. B3.1e Hub 内容路由强制（2026-11-24，默认 off，已本地提交）

`AIRR-2026-11-24-B3.1e-HUB-ROUTE-ENFORCE.md` 启用既有 `AUTHZ_ENFORCE` 的
`read|write`，在 Hub 内容路由上把共享 key 从授权旁路降为传输因子：

- **模式**：`off`（默认）保持 legacy；`read` 对带 `@RequirePermission` 的 GET/HEAD
  内容路由执行用户 RBAC；`write` 覆盖全部方法；`full` 仍启动失败。
- **行为**：有效 `X-API-Key` + 用户 JWT 在 enforce 下继续走既有 RBAC；仅 key 无用户
  401 `Legacy service key is not an authorization channel`；签名 service principal 仍只按
  data-plane scope 判定；无 `@RequirePermission` 的 46 条 B3.1a 例外保持 legacy（X-27）。
- **门禁**：B3.1a 的路由元数据测试升级为“有元数据且挂载 ACL guard”，并保留
  “新路由未分类即失败”的门禁；不新增 controller，不改路由。
- **证据**：全量 **172 suites / 1570 tests passed**（新增 10 个 guard/门禁用例）；tsc/eslint
  绿。**隔离 Hub canary**：`off` 下 outsider + key 的 GET 为 200（旁路存在）；
  `read` 下同一请求 403、admin 200、POST 仍 legacy（422 校验）；`write` 下 POST 也 403、
  admin 422；Hub 日志 key/admin password/service-token 命中 0，`content_route_enforced=4`。
- **边界**：B3.1f 后仍余 43 条例外；access-control 子资源 IDOR、iTwin image delete、
  favorites/recents 写 ACL 已由 B3.1f 收口；files、baseline failed/requeue、
  `/imodels/admin/*`、storage/tile、BFF/MS/WA 仍未改；服务
  scope 仍是服务级、不绑定单 iModel；不得宣称 Hub 数据面 PEP 完整。B3/X-21/X-27 open，
  G1 Gate 不勾选。

## 15. 2026-11-24 第二波：生产架构切片（工作树未提交）

- **B3.1f Hub 收口（已单独提交 `ddbf009`）**：access-control 子资源绑定路径 iTwin、
  iTwin image delete 归属、favorites/recents 写 ACL + resolver 过滤；Hub 175/1589。
- **B3.1f-a MS/BFF 危险面**：`AUTH_B3_SURFACES_MODE=off|enforce`（默认 off）；enforce 下
  export 走 `doc.read`+B3.1c OBO，progress/retry 在 Hub/DB/progress map/requeue 前
  403 fail-closed；BFF 保留 401/403 且不重试/不替换成功。MS 全量 **173 files / 1756 pass
  +1 expected fail +8 skipped**；BFF 37；未跑真栈，B3/X-21/X-27 open。
- **W3 读纯化 + undo 隔离**：新增 `ensureInitializedForRead`，读 RPC 不 import/建 EditTxn/
  rebuild/push/迁移；OpLog undo 按 verified principal+briefcase 过滤；开关
  `FEATURE_READ_INIT_MODE=read-only|legacy-write`、`OPLOG_AUTHOR_FILTER=off|shadow|enforce`。
  已过全量 MS + tsc；无真实 Hub/Azurite/Postgres 或真实 push 证据；X-05/X-15 仍 open。
- **D6 Named Version↔Checkpoint**：additive `checkpoint_named_versions` 多对多、成功即绑定、
  NV/checkpoint 删除护栏、legacy 单值回退；Hub 全量 **178 suites / 1606 tests**；迁移仅
  SQL-shape 单测，未跑 fresh Postgres/live 栈；D3/D7/D8 仍缺。
- **DR Phase A harness**：新增隔离 drill compose/runner/wrappers；做过一次非破坏性
  backup→empty-target restore→verify；报告记录 RPO 字段 193.82s、RTO 字段 38.782s，但
  `rpoTargetAchieved=false`/`rtoTargetAchieved=false`，integrity 为 partial（minimal seed
  无 MS baseline），**不得**当作 RPO/RTO 达标或 clean DR 证据。隔离容器/卷/工作区已清理。
- **Release profile**：新增 `docker-compose.release.yml`、image digest renderer、required
  secrets；release 模式忽略 dev waiver。当前实际 repo 仍因 contract 1.85 vs 1.64、
  `latest`、宿主路径、默认密钥和缺 manifest 失败（预期），发布未执行。
- **G2 预冻结**：新增 G2 计划 + 6 个 Not run Spike + 4 份 ADR（Manifest、输出/拓扑/选择、
  typed tab、session/command/undo）；G1 未通过前不冻结、不铺特征。
- **B2.2/B6 P4b/B4**：截至该波仅完成 AIRR/ADR 设计包；后续第四波已落地 B2.2
  两半默认 off 切片（MS 仅 changeset OBO；Hub actor/审计/守卫；无真栈 canary，
  Hub enforce 仍阻塞 B6 P4b），见 `INDUSTRIAL-READINESS-PROGRAM-2026-11-24.md`
  §6.4。共享 key 退役、真实归因、Write/Share/Link 仍需 owner 决策与实现。
- **Gate**：上述均为工作树或隔离证据，G0 仍 NO-GO，G1 Gate 仍 0/15；不勾选任何项。

## 16. 2026-11-24 第三波：Gate 证据与写语义（工作树未提交）

- **G0 隔离真栈复测**：S0-3 仍 PARTIAL（API fail-closed；DB 直插第二根/状态回退删除/协调改 checksum+chainHash 未检测）；S0-5 仍 FAIL→fail-closed（mid-history 409/501）；S0-13 PARTIAL→fail-closed（head clone/fork 201 但目标 changesets=0，checkpoint 仍引用源 changeset）。G0 仍 NO-GO。
- **B3.1g 负例矩阵**：69 cells = 61 pass/0 fail/8 unproven；24 test files/292 tests；无 live stack/browser，service-scope/WA/storage/tile 仍 unproven。
- **B4 Write 语义**：`AUTHZ_WRITE_SEMANTICS=manage_compat|write`（默认 manage_compat）；write 模式下 `doc.write/briefcase.write/changeset.push` 走 Write，share Edit 映射 `imodels_write`；**仅 action resolver/OBO/decision/projection，公共 REST 路由仍 `@RequirePermission(IMODELS_MANAGE)`**，不可生产开启。Hub 全量 179/1626。
- **200 cold-open**：200-case baseline 3 冷样本完成（Hub resolve p95 4,640.8ms；native download p95 63,594.4ms；pull/apply p95 9,011.4ms；open p95 41ms）；checkpoint arm 因 flag OFF blocked；1000 未跑。数字只证明 harness/样本，不证明 SLO。
- **MS 构建可复现**：release lock + `npm ci` + 真 tsc + required native delivery + public/private provenance 分离 + contract fail gate；`-Check`/full temp build 通过，未发布；public `dist-backend` 仍是旧 1.64，release gate 仍失败。
- **G0/G1**：仍 NO-GO/0/15；以上均为工作树或隔离证据。
