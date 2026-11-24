# G1 架构硬化第二波状态（2026-11-23）

> **这不是 G1 Gate 通过记录。** G0 决策册仍未 ARB 签字，G1 计划仍为
> Proposed/待 GO；G1 Gate 15 项均未勾选。本文只登记本轮实际实现、证据与
> 未完成项，所有不能由真栈/实际产物证明的内容保持 blocked。

## 1. 工作流快照

| 工作流 | 本轮落地 | 证据 | 未完成/边界 |
|---|---|---|---|
| WS-C 会话 | C6：`getConfiguration` 移除宿主 `cacheDir`；HTTP 有状态 RPC 默认 403（`HTTP_STATEFUL_RPC_MODE=deny`，X-19）；`saveChanges/pushChanges` 增加写租约校验 | MS 受影响 suite 24 files/234 tests；src tsc、eslint（新文件）通过；C6 AIRR | 双会话真栈 e2e 未跑；`pullChanges/abandonChanges/toggleGraphicalEditingScope` 租约检查顺延 |
| WS-B 身份/ACL | B5a：MS/BFF 默认拒绝 `?token=`，401/429/安全日志脱敏（X-18）。B1.2a：access token 绑定 `sessionId+sessionHash`，logout/改密/重置/轮换/停用后下一请求 401。B1.2b：MS WS 周期 session-status 复验，撤销关闭 4401。B1.2c：BFF/MS 正 token 缓存默认 0，负结果不缓存；WS 既有连接延迟登记 X-20。B2 P0 Hub shadow：opaque delegation handle/OBO、shadow decision、additive token/audit 表，默认 off（X-21/X-22）。B2 P0 MS shadow：WS 升级换 handle（不存用户 token）、download/open shadow decision（仅记录不拒绝）、覆盖清单默认 off | Hub 全量 unit 147 suites/1339 tests；隔离 relational Hub e2e：B1.2 18+7、B2 16；MS 全量 **149 files/1459 passed、1 expected fail、8 skipped**；BFF 28/28；各处 tsc/eslint 通过。MS P0 shadow：新增 4 files/29 tests，affected 28 files/268 tests，tsc 通过；新代码 eslint 通过（触及文件仅余既有弃用基线） | **B2 MS shadow 未部署/真栈未跑**；B3 未强制（`p0-not-covered`：FeatureOp/直改/push/export/tile/progress/retry 等；`DirectEditWriteGate` ACL 未接）；handle 15m 后无续期（P2 WS ticket 前置）；真实 changeset/briefcase 归因未切换；B6 服务身份、B7 WORM、B10 租户未做；新 Hub/MS 镜像未部署，WS 4401 真栈待验 |
| WS-D 账本/版本 | D1.4/D1.7：complete 大小/SHA-256 与下载链校验；D2：悬挂 changeset 超时/回收；D6a：Named Version 封账、PATCH 白名单、删除保护、409 NotReady、index 回退；D4 Hub 控制面：`checkpoint_jobs` outbox/lease/claim/heartbeat/complete/fail，flag 默认 OFF；Hub 内部契约：storage-token、claim `iTwinId`/container、chain evidence；D4b worker 切换消费这些契约（109/109 tests，typecheck/lint/build；X-23/X-24 code exit） | Hub 全量 unit 绿；迁移在隔离 Postgres 事务内 up/down 验证，live DB 未应用（`checkpoint_jobs` 等表不存在）；worker fake-hub 编排绿（含 `/chain`、storage-token/续签/拒绝路径） | **真实 checkpoint native 生成/readback 未执行**；真实 Hub/DB/Azurite + native canary、长上传续签实机、日志无 SAS 实机证据未跑（X-23/X-24 仍 open）；D3 历史复制/async Create、D5 版本打开、D7 restore/compare、D8 refs 未做；200/1000 冷开基线未测 |
| WS-J 发布/CI | J1.2 shared 契约冻结门；J1.3a web 生产 build + BFF typecheck/tests 进 public CI；J1.5 Playwright JSON→基线脚本；J3.1g manifest 实际字节 digest 校验与 release-gate 可选接线 | 契约门 8/8、release-manifest 24/24、e2e baseline 5/5；BFF 28/28；release-gate.ps1 语法检查通过 | **public CI 从未实际运行**（分支未 push）；backend 全量/native ctest 仍需 self-hosted；真实镜像 digest/OCI label/SBOM/attestation 未生成；无实际 release manifest |
| WS-E 数据/DR | 无新增 DR 实现 | 仅有备份脚本基线；审计确认 `pg_dump` 不是 PITR、Azurite 无版本化 | E1/E2/E8 全部未完成；无 RPO≤5m/RTO≤1h 证据；不得宣称灾备达标 |
| 其它 | MS 全量测试 5s 默认在并行 145 文件下出现 StandaloneDb 超时；将 `testTimeout` 调到 15s（仅时间预算，不放宽断言），随后全量绿 | `vitest.config.mts`；全量 1459/1 expected/8 skipped | 这是测试基础设施调整，不改变产品行为；不掩盖性能回归需后续基线 |

## 2. 明确未完成/不得宣称

1. **G1 Gate 未通过**：G0 ARB 未签字，15 项 Gate 全未勾选；B2/B3 只是 shadow，B1.2 的 WS 真栈关闭未验。
2. **D4 不是“真实 checkpoint 已生成”**：Hub 控制面、内部 storage-token/claim/chain-evidence 契约与 worker 消费代码已落地（X-23/X-24 code exit），但 native canary、真实 readback、200/1000 冷开基线均未执行；`CHECKPOINT_GENERATION_ENABLED` 未打开。
3. **安全边界未闭环**：B2 MS 侧已接 shadow（默认 off、未部署/真栈未跑）、B3 未强制、B6 共享 API key/人类 admin 服务登录仍在、B7 审计 WORM 未做、B10 无 tenantId；B8 TLS/Azurite/tile 暴露未处理。
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
`AIRR-2026-11-23-B6-SERVICE-IDENTITY-P0.md` 与
`AIRR-2026-11-23-B6-DATA-PLANE-P3.md`。

- **P0/P1/P2（已本地提交）**：Hub `service_clients`（scrypt 哈希/JSON scope/enabled/secretVersion）、
  `POST /auth/token/service`、双模 `ServiceAuthGuard`；session-status/OBO shadow/worker
  内部控制面 code-only 改用 `X-Service-Token`。默认 `off` 保持 legacy；未跑部署形态 canary。
- **P3（工作树，未提交）**：Hub 官方 changesets/briefcases/checkpoints/locks/namedversions/baseline
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
- 仍未完成（X-21 open）：MS/WA/worker 客户端迁移、briefcase/lock owner 语义、baseline
  failed/requeue/admin、extended-data/named-version 写、TLS/KMS/撤销列表、共享 key/admin 退役、
  B10 租户、部署形态 canary。**不得宣称 B6 完成或 G1 Gate 通过。**
