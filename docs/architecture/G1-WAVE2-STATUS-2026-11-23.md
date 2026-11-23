# G1 架构硬化第二波状态（2026-11-23）

> **这不是 G1 Gate 通过记录。** G0 决策册仍未 ARB 签字，G1 计划仍为
> Proposed/待 GO；G1 Gate 15 项均未勾选。本文只登记本轮实际实现、证据与
> 未完成项，所有不能由真栈/实际产物证明的内容保持 blocked。

## 1. 工作流快照

| 工作流 | 本轮落地 | 证据 | 未完成/边界 |
|---|---|---|---|
| WS-C 会话 | C6：`getConfiguration` 移除宿主 `cacheDir`；HTTP 有状态 RPC 默认 403（`HTTP_STATEFUL_RPC_MODE=deny`，X-19）；`saveChanges/pushChanges` 增加写租约校验 | MS 受影响 suite 24 files/234 tests；src tsc、eslint（新文件）通过；C6 AIRR | 双会话真栈 e2e 未跑；`pullChanges/abandonChanges/toggleGraphicalEditingScope` 租约检查顺延 |
| WS-B 身份/ACL | B5a：MS/BFF 默认拒绝 `?token=`，401/429/安全日志脱敏（X-18）。B1.2a：access token 绑定 `sessionId+sessionHash`，logout/改密/重置/轮换/停用后下一请求 401。B1.2b：MS WS 周期 session-status 复验，撤销关闭 4401。B1.2c：BFF/MS 正 token 缓存默认 0，负结果不缓存；WS 既有连接延迟登记 X-20。B2 P0 Hub shadow：opaque delegation handle/OBO、shadow decision、additive token/audit 表，默认 off（X-21/X-22）。B2 P0 MS shadow：WS 升级换 handle（不存用户 token）、download/open shadow decision（仅记录不拒绝）、覆盖清单默认 off | Hub 全量 unit 147 suites/1339 tests；隔离 relational Hub e2e：B1.2 18+7、B2 16；MS 全量 **149 files/1459 passed、1 expected fail、8 skipped**；BFF 28/28；各处 tsc/eslint 通过。MS P0 shadow：新增 4 files/29 tests，affected 28 files/268 tests，tsc 通过；新代码 eslint 通过（触及文件仅余既有弃用基线） | **B2 MS shadow 未部署/真栈未跑**；B3 未强制（`p0-not-covered`：FeatureOp/直改/push/export/tile/progress/retry 等；`DirectEditWriteGate` ACL 未接）；handle 15m 后无续期（P2 WS ticket 前置）；真实 changeset/briefcase 归因未切换；B6 服务身份、B7 WORM、B10 租户未做；新 Hub/MS 镜像未部署，WS 4401 真栈待验 |
| WS-D 账本/版本 | D1.4/D1.7：complete 大小/SHA-256 与下载链校验；D2：悬挂 changeset 超时/回收；D6a：Named Version 封账、PATCH 白名单、删除保护、409 NotReady、index 回退；D4 Hub 控制面：`checkpoint_jobs` outbox/lease/claim/heartbeat/complete/fail，flag 默认 OFF；D4b：独立 `checkpoint-worker` 包（82/82 tests，typecheck/lint/build） | Hub 全量 unit 绿；迁移在隔离 Postgres 事务内 up/down 验证，live DB 未应用（`checkpoint_jobs` 等表不存在）；worker fake-hub 编排绿 | **真实 checkpoint native 生成/readback 未执行**；Hub 缺 storage-token（X-23）；claim 缺 iTwinId/chainHash（X-24）；D3 历史复制/async Create、D5 版本打开、D7 restore/compare、D8 refs 未做；200/1000 冷开基线未测 |
| WS-J 发布/CI | J1.2 shared 契约冻结门；J1.3a web 生产 build + BFF typecheck/tests 进 public CI；J1.5 Playwright JSON→基线脚本；J3.1g manifest 实际字节 digest 校验与 release-gate 可选接线 | 契约门 8/8、release-manifest 24/24、e2e baseline 5/5；BFF 28/28；release-gate.ps1 语法检查通过 | **public CI 从未实际运行**（分支未 push）；backend 全量/native ctest 仍需 self-hosted；真实镜像 digest/OCI label/SBOM/attestation 未生成；无实际 release manifest |
| WS-E 数据/DR | 无新增 DR 实现 | 仅有备份脚本基线；审计确认 `pg_dump` 不是 PITR、Azurite 无版本化 | E1/E2/E8 全部未完成；无 RPO≤5m/RTO≤1h 证据；不得宣称灾备达标 |
| 其它 | MS 全量测试 5s 默认在并行 145 文件下出现 StandaloneDb 超时；将 `testTimeout` 调到 15s（仅时间预算，不放宽断言），随后全量绿 | `vitest.config.mts`；全量 1459/1 expected/8 skipped | 这是测试基础设施调整，不改变产品行为；不掩盖性能回归需后续基线 |

## 2. 明确未完成/不得宣称

1. **G1 Gate 未通过**：G0 ARB 未签字，15 项 Gate 全未勾选；B2/B3 只是 shadow，B1.2 的 WS 真栈关闭未验。
2. **D4 不是“真实 checkpoint 已生成”**：Hub 控制面与 worker 骨架已落地，但 native canary、storage-token、真实 readback、200/1000 冷开基线均未执行；`CHECKPOINT_GENERATION_ENABLED` 未打开。
3. **安全边界未闭环**：B2 MS 侧已接 shadow（默认 off、未部署/真栈未跑）、B3 未强制、B6 共享 API key/人类 admin 服务登录仍在、B7 审计 WORM 未做、B10 无 tenantId；B8 TLS/Azurite/tile 暴露未处理。
4. **DR 未闭环**：无 PITR、无对象版本化/跨区、无恢复演练记录；RPO/RTO 不能宣称。
5. **发布未闭环**：CI 未运行、镜像非可复现、真实 digest/manifest/SBOM 未产出；`verify-stack` 仍是审计基线 15/17。
6. **会话/租约**：C5 外部 lease/fencing、C7 checkpoint 恢复未实现；既有 WS 撤销仍受 X-20 窗口限制。

## 3. 下一步优先级

1. 部署新 Hub/MS（隔离或 canary），真栈验证 B1.2 4401、B5a 401、B2 shadow 端点；恢复/保持 live DB 迁移窗口控制。
2. B2 P0 MS 侧 shadow 已接（默认 off、未部署）；下一步部署 Hub/MS 做 staging 两用户 canary（下载/打开无行为变化、日志无 token、Hub audit 可查），再按覆盖清单把 B3 入口分类为 `covered-enforce`/`fail-closed`；在此之前不进入 enforce。
3. 为 D4 补 Hub storage-token 与 claim 的 iTwinId/container/chainHash，跑 native canary/readback；之后才打开生成 flag。
4. 关闭 C5/C7 与 E1/E2；B6/B7/B10 与 J2/J4 仍属后续 Gate 前置。
5. 所有“通过”必须附真栈/CI/产物证据；本文不替代 Gate 评审。

## 4. 变更状态

- 本轮改动分布在 public / `luban-backend` / `imodelhub-services` 三仓，**均未 commit、未 push**。
- 新增例外 X-16..X-24 均带 owner/失效日期/退出计划；未关闭项不得从 Gate 记录中删除。
- 相关 AIRR/ADR 索引见 `docs/README.md`；私有证据仅在本机私有仓，未写入公开仓。
