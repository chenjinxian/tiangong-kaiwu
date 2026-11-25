# 工业级生产架构总纲（2026-11-24）

> 状态：**Working program / 待 G0 ARB 签字**。本文是 G0–G3 的工业级生产架构收口总纲，
> 不是 Gate 通过记录。所有默认仍未部署、未对外承诺生产；任何 Gate 勾选以
> `G0-DECISION-REGISTER.md`、`G0-SPIKE-REGISTER.md` 和独立证据为准。
>
> 输入：`09-INDUSTRIAL-TARGET-ARCHITECTURE.md`、`10-ARCHITECTURE-HARDENING-PLAN.md`、
> `G0-EXECUTION-PLAN.md`、`G1-EXECUTION-PLAN.md`、`G1-WAVE2-STATUS-2026-11-23.md`、
> 近期 7 个领域审计（身份/ACL、账本/版本/规模、DR、发布/CI/安全、G2 契约、
> 内核/求解器/许可、G0 决策/Spike 映射）。原则：**先冻结架构和技术路线，再铺功能**。

---

## 0. 结论摘要

1. **方向正确，但工业级生产尚未开始**：iTwin/BIS、FeatureOp、账本和会话隔离的底座已具备；
   当前差距主要是平台工程和运营底座，不是几何能力。
2. **G0 未签字**：16 项决策全部 Proposed；审计前仅 2/20 ADR 存在；16 个 Spike 中
   只有 S0-4 有真栈 PASS 证据，S0-2 部分，S0-5/S0-13 fail-closed，S0-12 blocked，
   其余未跑或只有单元证据。G0 不能通过。
3. **G1 实施约一半、验收 0/15**：会话隔离、账本不可变、D5 版本打开、B3.1c/d/e/f/g、
   D6、read purity/undo 隔离、B2.2 默认 off 切片和 native 写 canary 有实质进展；
   但真实归因/真栈 ACL、B4、B6 P4b、B7 enforcement、B8/B10、D3/D7/D8、checkpoint
   生产化、200/1000 基线、E1/E2/E8、J2/J4 均未闭环。
4. **G2 目前不可冻结**：Feature Manifest、显式输出端口/DAG、持久拓扑引用、typed tab、
   selection/workspace/command 契约都还没有成为单一事实源。当前单输出/线性链是应用层
   实现限制，不是可冻结的平台 API。
5. **内核路线未定但方向明确**：生产仍是 ACIS SAB；TrueForm 只有文档/规划，未接线；
   SAB 兼容、双后端、迁移、回滚和许可裁决未完成。ACIS InterOp/STEP/healing 未授权；
   libslvs 仅纯云 SaaS。许可与分发是 stop-ship。
6. **当前不应继续铺 Part Studio 功能**：G1 收尾、G2 冻结、G3 生产化之前，新增特征只会
   加深后续返工。

按 G0–G3 平台架构工作量口径，当前约 **40%**（±10%）。到单租户受控生产还需
G1 收尾 + G2 冻结 + G3 生产化；多租户/专业 CAD 更远。

---

## 1. 工业级生产标准（DoD）

| 维度 | 工业级最低标准 | 当前判定 |
|---|---|---|
| 身份 | 真实用户 on-behalf-of；无共享 key/人类 admin 服务登录；服务身份最小权限、可轮换/撤销 | 未达标 |
| 授权 | 每个用户数据入口 PEP；per-document ACL 默认强制；非成员/只读/撤销负例全拒绝 | 未达标（默认 off/例外多） |
| 审计 | 高风险操作不可变审计；失败可阻断；异地 WORM/链头锚定/保留期 | 未达标（仅 authz decision + 本地触发器） |
| 租户 | tenantId/RLS/对象前缀/配额；跨租户负例全拒 | 未达标（NULL 占位） |
| 账本 | changeset 不可变、父链/hash、真实 checkpoint、Named Version 绑定、restore/fork 语义 | 部分（D1/D2/D5/D6a；D3/D6/D7/D8 缺） |
| 会话 | per-session IPC/briefcase/editor/undo；外部 lease/fencing；恢复 | 部分（单进程；C5/C7 缺） |
| 规模 | 200/1000 changeset 冷开 p50/p95；queue/worker/配额/缓存上限 | 未测 |
| 灾备 | Postgres HA+PITR、对象版本化/跨区、恢复演练、RPO≤5m/RTO≤1h | 未达标（手动 dump） |
| 发布 | 可复现构建、digest 钉版、manifest/SBOM/签名、staging 同形态、N-2 回滚 | 未达标（CI 红/未 push/latest/契约漂移） |
| 安全 | TLS/HSTS/CSP、无默认密钥、KMS、WA/DB/Redis/对象存储不公网、WAF/限流 | 未达标（release TLS/edge 配置已落地但未执行/无 tile 签名方；dev 仍匿名 /azurite） |
| 可观测 | requestId/session/user/tenant 全链、metrics/traces、readiness、SLO/告警/on-call | 部分/未达标 |
| 架构 | Feature Manifest、输出端口/DAG、拓扑引用、typed tab、selection/command 统一 | 未达标（G2 未开始） |
| 许可 | ACIS 仅 Modeler+Polyhedra；STEP/InterOp 未授权不接线；libslvs 仅纯 SaaS | 有边界，分发未裁决 |

---

## 2. Gate 快照

| Gate | 状态 | 证据/事实 | 结论 |
|---|---|---|---|
| **G0 决策基线** | **未通过** | 16/16 决策 Proposed、0 签字；20 ADR 中审计前仅 2 份；16 Spike 仅 S0-4 PASS，S0-2 PARTIAL，S0-5/13 fail-closed，S0-12 blocked，其余未跑/单元级 | 不能签 G0，G1 只能按 owner directive 条件推进 |
| **G1 平台正确性** | **进行中，0/15** | 会话/账本/身份有大量代码与 canary，但部署形态、归因、DR、规模、CI 未闭环 | 不勾 Gate |
| **G2 契约/工作区** | **未开始/不可冻结** | 无 Feature Manifest、输出端口、持久拓扑引用、typed tab、SelectionRef；当前单输出/线性链 | 不冻结、不铺特征 |
| **G3 生产化** | **未开始** | 无 HA/PITR/对象版本化/TLS/KMS/观测/SLO/压力 | 不宣称生产 |
| **G4/G5** | 研究/产品轨道 | Onshape parity 是测试轨道，不等于产品完成 | 后置 |

**为什么 G1 是 0/15**：Gate 是全有或全无。当前缺的不是“某条测试”，而是：
真实部署形态双用户/撤销证据、全入口 ACL（B3.1f/g、B4、B6 P4b、storage/tile/WA）、
真实用户归因、生产 checkpoint/200-1000、restore/compare/refs、DR 演练、CI/发布
可复现。任何一项都不能用单机/假 Hub/默认 off 替代。

---

## 3. 七个工作流

### W1 G0 决策与 ADR 冻结

- **现状**：决策默认值完整，但 0/16 签字；ADR 缺 18 份（本程序启动后补齐为 20 份
  Proposed）；Spike 登记册陈旧。
- **出口**：16 决策全部 Accept/Conditional/Defer（含 owner/日期/失败动作）；
  20 ADR 有 owner/备选/失败判据/回滚；16 Spike 有 PASS/FAIL/STOP/DEFERRED 结论；
  G0 Gate 报告 GO/CONDITIONAL GO/NO-GO。
- **停点**：D0-7/D0-12 需 Product/Legal 书面结论；D0-9/D0-16 需真实双用户/归因条件；
  D0-14 需 DR 演练或明确 conditional deadline。

### W2 身份、ACL、归因、审计、租户

- **已落地**：B1/B1.2、B2 OBO shadow、B3.1a–g、B5a、B6 P0–P4a、B7 v1；
  B3.1d native 写 canary；B3.1e Hub 路由强制（默认 off）；B2.2 两半默认 off
  （MS 仅 changeset OBO；Hub actor/审计/守卫）；B7 写审计 create/acquire 切片。
- **关键缺口**：
  1. B3.1f：MS export/progress/retry/undo/close/assembly/saved views 仍无完整 ACL；
     BFF `/api/*` 仅终止 JWT；WA baseline/debug 共享 key；`/azurite` 匿名；tile/SAS。
  2. B4：Write 仍 Manage-only；Share UI/API/link 是假分享/无 capability；IMS groups fail closed。
  3. B2.2：Hub/MS 两半已落地但默认全 off；MS 仅 changeset 写可带 OBO，briefcase/NV
     仍是 legacy 数据面；Hub enforce 不能与当前 MS 一起启用；写审计仅覆盖
     changeset/briefcase create/acquire；无真栈双用户 canary；OpLog 仅 IPC 路径正确。
  4. B6 P4b：owner 依赖路由、baseline/admin、共享 key、人类 admin 登录、KMS/撤销未收口。
  5. B7 enforcement：新增的 `write_audit_events` 是应用级哈希链，仅 create/acquire，
     非法定 WORM；高风险操作仍未阻断；无异地 WORM/保留/legal hold/链头锚定。
  6. B8/B10：TLS/HSTS/CSP、WA/DB/Redis/Azurite 暴露、tenantId/RLS/配额未做。
- **出口**：全入口 401/403 负例；真实用户 changeset/briefcase/OpLog/audit；共享 key
  和 admin 服务登录退役；高风险审计可阻断；跨租户全拒；TLS/网络最小暴露。

### W3 账本、版本、checkpoint、规模

- **已落地**：D1/D2 不可变/父链/SHA-256、D4 Hub 控制面 + 隔离 native canary、
  D5 只读版本打开、D6a Named Version 防护。
- **关键缺口**：
  1. D3 clone/fork 仍是 fail-closed 切片：非 head 409、history 501、无 Duplicate/squash、
     target checkpoint 复用源 changeset id。
  2. D4 生产化：worker 不在 compose、flag OFF、无 Azure/Linux、native 阻塞事件循环、
     manifestPath 未持久化、无 GC/scrubber/指标。
  3. D6：Named Version 未绑定真实 checkpoint 行；无 ready event/metric。
  4. D7 restore/compare、D8 version-pinned refs 完全缺。
  5. 读路径会 import schema/init/rebuild/auto-push；`doc.read` 可写库。
  6. undo 只有 sessionId 作用域，非 user/briefcase；legacy 行在 enforce 下不可见。
  7. 200/1000 冷开无 harness/无 p50/p95。
- **出口**：D3/D6/D7/D8 语义与迁移；读路径零 save/push/head 变化；checkpoint 生产
  readback/manifest/GC/HA；200/1000 报告；undo 隔离负例。

### W4 会话、租约、HA

- **已落地**：C1/C2/C2b/C3/C3.3/C6；per-session briefcase/editor/undo 基础。
- **关键缺口**：C5 外部 lease/fencing、C7 recover/reattach、单进程多会话/多实例、
  OBO handle 续期、WS 撤销真实部署证据。
- **出口**：双实例不能双写；stale writer 在 commit/push 被 fencing；崩溃/重启恢复；
  双用户部署 canary。

### W5 DR、数据平台、完整性

- **已落地**：手动 `pg_dump` + Azurite volume tar + SHA-256 manifest + HITL restore。
- **关键缺口**：无 Postgres HA/PITR/WAL 归档/副本；Azurite 仅开发且单卷；无对象版本化/
  object lock/CRR/SSE-KMS；Redis 单节点；WA data 无卷；MS 手工进程/硬杀；无 E8
  DB↔对象 reconciler/scrubber；无 RPO/RTO 演练。
- **出口**：HA+PITR（archive_timeout≤60s）、对象版本化/跨区、恢复演练、RPO≤5m/RTO≤1h、
  integrity scan + repair/quarantine、MS/WA/worker 受监督恢复。

### W6 发布、CI、安全、可观测

- **已落地**：contract/interface freeze 工具、release-manifest 雏形、e2e baseline；
  本地 freeze 检查可过。
- **关键缺口**：主 CI 红、G1 分支未 push、Hub CI 无运行；MS 构建 `npm install`/
  `tsc --noCheck`/宿主路径/fallback；`latest` 标签、Markdown digest、无 SBOM/签名；
  contract 1.85 vs 1.64；无 staging/IaC、无 TLS/KMS、无 trust proxy、无统一 requestId/
  traces/metrics/alerts/soak/chaos。
- **出口**：同源同 digest；manifest/SBOM/签名；CI 全绿且分支保护；staging 同形态；
  HTTPS/HSTS/CSP；全链 requestId；readiness/SLO/告警/on-call；容量/soak。

### W7 G2 契约与工作区

- **现状**：FeatureOp 单输出、线性 orderKey、无显式端口/DAG；FeatureTree 无 inputs/outputs；
  `LubanTopologyId` 只有 node/entity；tab 从 UserLabel 前缀发现；WorkspaceRef 无 kind/version；
  无 SelectionRef/Domain、DocumentSessionHost、统一 CommandRegistry；每个特征 9+ 处手写注册。
- **冻结顺序**（G1 之后）：
  1. Feature Manifest v0 + opDsl 单一来源 + `paramsVersion`；
  2. Document/Workspace/Tab 身份 + additive `listTabs`；
  3. Output/Topology/Selection 信封；
  4. Host/store/command/undo 所有权；
  5. batch pick + format/kernel tag。
- **不要提前冻结**：完整 DAG executor、FeatureRow 持久布局、拓扑 ID 生成算法、
  WorkspaceModule 生命周期、form widget API、batch-pick transport、最终内核枚举。
- **出口**：manifest 生成 dry-run 零漂移；split/mirror 双端口下游消费；插入/删除/
  重复 body 不静默错命中；旧 tab/URL 双读兼容。

### W8 内核、求解器、许可

- **现状**：生产 ACIS SAB；TrueForm M0/未接线；BRepData 无 format/kernel tag；
  ACIS InterOp/STEP/healing 未授权；ThickenSheet 仍可达，interface-freeze 红；
  libslvs 仅 Windows/GPL 且公开 MS 产物含 native 依赖；ShengMo 未验证。
- **决策**：保留 ACIS SAB + 加 format/kernel tag；TrueForm M1 必须等 SAB 策略、
  111-export manifest、双后端一致性、迁移/回滚；State no TrueForm-only/STEP claims。
- **出口**：tag 兼容旧库；blocked ops fail-closed + 负 ctest；合法分发书面结论；
  solver-neutral 双实现/一致性；canonical native + provenance。

---

## 4. 关键路径

```text
G0 签字/法律裁决
  → W2 身份归因 + B3.1f/g + B4 + B6 P4b + B7/B8/B10
  → W3 读纯化 + D3/D6/D7/D8 + checkpoint 生产 + 200/1000
  → W4 C5/C7 + W5 DR/PITR/对象版本化
  → W6 CI/发布/安全/观测
  → G1 Gate
  → W7 G2 契约冻结
  → G3 生产化
  → G4/G5
```

**不能并行绕过的顺序**：G2 契约冻结不能早于 G1 身份/账本；G3 生产不能早于
DR/RPO/RTO；G4/G5 功能不能早于 G2。

---

## 5. G0 决策/Spike 收口

### 5.1 决策

16 项决策均按 G0 推荐默认进入 **Proposed under owner directive**，由 owner 逐项
Accept/Conditional/Defer。必须显式处理：

- **D0-2**：单租户先，tenantId/RLS 预留；B10 前不得宣称多租户。
- **D0-4**：不可变账本 + 真实 checkpoint；D3/D6/D7/D8 为 Conditional，不能宣称完成。
- **D0-7/D0-12**：Product/Legal 书面结论前，STEP/IGES/Parasolid、数据驻留/出口、
  对外分发均为 stop-ship。
- **D0-9**：先 in-process owner-scoped，进程 actor 作为 HA 目标；S0-1 双用户证据前
  不宣称多用户。
- **D0-13**：本地 commit / push ack 分离；UI 必须明示未推送窗口（与 ADR-0017 冲突需裁决）。
- **D0-14**：HA+PITR+对象版本化；S0-15 演练前为 Conditional。
- **D0-16**：真实用户归因；push/changeset 当前仍是服务账号，B2.2 前为 Conditional。

### 5.2 Spike

| 状态 | 项 |
|---|---|
| PASS（真栈） | S0-4（D5 版本打开） |
| PARTIAL | S0-2（直改 deny 有真栈，audit/endEdits 未证）；S0-1/S0-3（单元/代码级） |
| FAIL→fail-closed 延后 | S0-5（mid-history fork）、S0-13（clone/fork 内容） |
| BLOCKED | S0-12（tenant） |
| NOT RUN / 延后 | S0-6/7/8/9/10/11（G2/G5）、S0-14（冷开）、S0-15（DR）、S0-16（未推送边界） |

必须补跑的最小真栈证据：S0-1、S0-3、S0-5/13 确认、S0-14、S0-15、S0-16；
S0-2 补 audit/lease/endEdits。S0-6/7/8/9/10/11 明确 DEFERRED 到 G2/G5，
不得以“未跑”混过 G0。

---

## 6. 分阶段执行（不铺功能）

### 阶段 A：决策冻结与安全收口（第 1–2 周）

1. G0 决策签字/条件化；补齐 18 份 ADR；更新 Spike 登记册为真实证据；G0 Gate
   Report（GO/CONDITIONAL GO/NO-GO）。
2. B3.1f-a：MS export/progress/retry/undo/close/assembly/saved views 的 PEP 状态机；
   BFF allowlist；deny 前不得有文件/DB/Hub 副作用。
3. Hub 跨 iTwin IDOR/父子绑定；iTwin favorites/recents 写 ACL（读过滤如风险可控）。
4. 发布卫生门：contract mismatch、latest、宿主路径、`--noCheck`、lockless install、
   manifest/SBOM 检查；CI 修复/推送由 owner 执行。
5. 只读完整性扫描 + DR drill runbook（不执行破坏性演练）。

### 阶段 B：身份/归因与账本正确性（第 3–5 周）

1. B2.2 真实用户归因：OBO actor + service actor 分离，push/changeset/briefcase/audit
   同事务；MS/WA 改造；真栈双用户 canary。
2. B6 P4b：owner 依赖路由、baseline/admin、共享 key/admin 退役方案；KMS/撤销设计。
3. B4：Write 语义/Share/Link 执行或删除；denyList 边界；UI 不再假分享。
4. B7：高风险事件清单 + 审计失败阻断 + offsite/链头锚定设计。
5. W3：读路径纯化（零 save/push/head 变化）；D3 identity/history；D6 NV 绑定；
   200/1000 harness；D7/D8 设计/首切片。
6. W4：C5 外部 lease/fencing 设计/首切片，C7 恢复。

### 阶段 C：生产底座（第 6–10 周）

1. D4 checkpoint 生产化：worker 部署、flag、manifest/readback、GC/scrubber、metrics、
   >30m 作业、Azure/Linux staging。
2. E1/E2/E8：PITR、对象版本化/跨区、恢复演练、integrity scan/repair；RPO/RTO 实测。
3. W6：staging/IaC、TLS/KMS、trust proxy、requestId/metrics/traces、SLO/告警、
   可复现构建、digest/manifest/SBOM/签名、CI 全绿。
4. MS/WA/worker 服务化：监督进程、卷、readiness、优雅停机、故障恢复。

### 阶段 D：G1 Gate 与 G2 预冻结（第 10–14 周）

1. G1 Gate 预检：15 项逐项证据；双用户/只读/撤销/全入口/DR/规模/发布负例。
2. G2 预冻结：Feature Manifest dry-run、typed tab dual-read、SelectionRef/TopologyRef
   envelope、Command/undo ownership；只冻结契约，不铺功能。
3. 未通过项登记 blocking，不进入 G3/G4。

---

## 6.1 2026-11-24 第一波（工作树，未提交）

| 切片 | 结果 | 证据/边界 |
|---|---|---|
| G0 ADR 全集 | 20 份 ADR 均存在（18 份新拟），全部 Proposed under owner directive | 未 ARB 签字；见 `G0-GATE-REPORT-2026-11-24.md` |
| Hub 跨 iTwin 授权收口（B3.1f） | access-control 子资源父绑定、iTwin image delete 归属、favorites/recents 写 ACL + 读 resolver 过滤 | Hub 全量 **175 suites/1589 tests**；跨 iTwin 404；删除不存在子行 404、favorites 写需 iTwin webview 为行为变化，待产品裁决；无真栈 e2e |
| E8 完整性扫描 | 只读 DB+对象存储扫描、JSON/Markdown 报告、exit 0/1/2/3 | 24 个 `node:test` 通过；未对 live Hub 验证，不修复，不证明 RPO/RTO |
| DR 演练规范 | 隔离 project/checkout、S0–S4 场景、HITL、RPO/RTO 记录、清理 | Skeleton v1，未执行破坏性演练 |
| 发布卫生门 | 镜像 pin、构建脚本、契约 skew、manifest/provenance、默认密钥检查；release 模式忽略 waiver | 21 个 `node:test` 通过；当前实际 repo 仍有 contract 1.85 vs 1.64、latest、宿主路径、默认密钥等失败项；CI 接线需 owner push 后验证 |
| 注意 | 以上均为工作树实现，未提交/未部署；不得写成 G0/G1 Gate 通过 | 提交/发布需 owner 明确授权 |

---

## 6.2 2026-11-24 第二波（工作树，未提交）

| 切片 | 结果 | 证据/边界 |
|---|---|---|
| B3.1f-a MS/BFF 危险面 | `AUTH_B3_SURFACES_MODE=off|enforce`；enforce 下 export `doc.read`、progress/retry 前置于任何副作用 403 | MS 1756 pass + tsc；BFF 37；默认 off；无真栈；progress/retry 尚无 session-bound OBO，绑定需产品/传输决策 |
| W3 读纯化 + undo 隔离 | 读 RPC 零 save/push/rebuild/迁移；undo 按 verified principal+briefcase 过滤 | MS 全量 1756 pass；`FEATURE_READ_INIT_MODE`/`OPLOG_AUTHOR_FILTER` 回滚；无真实栈/push；undo 语义需 ADR-G0-10 确认 |
| D6 NV↔checkpoint | 多对多绑定、删除护栏、legacy 回退 | Hub 178/1606；迁移仅 SQL-shape 单测，无 fresh Postgres/live；D3/D7/D8 仍缺 |
| DR Phase A | 隔离 drill harness + 一次非破坏性 backup→empty restore→verify | RPO/RTO 字段非达标；integrity partial；容器/卷/工作区已清理；不证明生产 HA/PITR |
| Release profile | pinned digest compose + required secrets + renderer/gate | release 模式仍因 contract skew/latest/宿主路径/默认密钥/缺 manifest 失败；未发布 |
| G2 预冻结 | 计划 + 6 个 Not run Spike + 4 ADR | G1 未过前不冻结；当前单输出/线性链/UserLabel tab 仍是现实 |
| B2.2/B6 P4b/B4 | 设计包（AIRR） | 当时未实现；第四波已落地 B2.2 默认 off 切片（见 6.4），B6 P4b/B4 仍未完成；跨仓 canary 缺失 |

**结论**：架构路线比第一波更明确，但 G1 验收未增加；仍不能宣称 G0/G1 通过、生产可用或
Hub 数据面 PEP 完整。


## 6.3 2026-11-24 第三波（工作树，未提交）

| 切片 | 结果 | 边界 |
|---|---|---|
| G0 隔离复测 | S0-3 PARTIAL、S0-5/13 fail-closed；DB 第二根/状态回退删除/协调哈希改写仍是缺口 | 不改变 G0 NO-GO |
| B3.1g 矩阵 | 69 cells，61 pass/0 fail/8 unproven | 24 files/292 tests；无 live browser/WA service identity |
| B4 Write | flag 默认 manage_compat；write 模式只影响 action resolver/OBO/projection | 公共 REST 路由未迁移，不可生产启用 |
| 200 cold-open | 200 baseline 3 冷样本完成；checkpoint arm blocked、1000 未跑 | native download p95 ~63.6s（本地 Docker Desktop）；非 SLO |
| MS build | release lock、`npm ci`、真 tsc、native delivery 必填、provenance 分离、contract fail | 未发布；旧 dist-backend 仍 1.64 |

---

## 6.4 2026-11-24 第四波（工作树，未提交）

| 切片 | 结果 | 边界 |
|---|---|---|
| B2.2 写归因（Hub） | `AUTH_WRITE_ATTRIBUTION_MODE=off|shadow|enforce` 默认 off；actor 列（changesets/briefcases/named_versions）+ `write_audit_events`（仅 changeset/briefcase create/acquire，同事务）；enforce 校验签名服务身份 + OBO iModel/scope，并派生官方 creator/owner/createdBy | 迁移仅 SQL-shape 单测；无真 Postgres/旧库 fixture；enforce 与当前 MS 不兼容（briefcase/NV 403），阻塞 B6 P4b；非 WORM |
| B2.2 客户端（MS） | `IMODELHUB_ATTRIBUTION_MODE=off|shadow|enforce` 默认 off；仅 changeset create/file/complete 且已附加签名 `X-Service-Token` 时附 OBO；启动强制 OBO transport + service-token；MS 全量 **175 files/1832 passed、1 expected fail、8 skipped** | 无真栈双用户 canary；briefcase/NV 不附 OBO；ALS/多请求 push 未实证；未 commit |
| B7 写审计切片 | 独立 `write-audit.v1` 应用级哈希链；shadow savepoint、enforce 回滚；迁移 down 非空 fail closed | 仅 create/acquire；无 DB trigger/WORM/离站/锚定/校验作业；不宣称 B7 完成 |
| Release edge | release-only nginx TLS/HSTS/CSP/request-id/安全头；仅 nginx 发布 80/443；signed tile `secure_link` + 非 tile `/azurite` 404；WA `BASELINE_TRIGGER_AUTH=service`；9 个 release-edge 静态测试（相关四文件合计 71 pass）与一次临时自签证书容器探针 | 无真实证书/域名/CA；tile 签名方未实现 → release tile fail-closed；无 WAF/限流；未发布、未执行真实 release |

**结论**：B2.2/B7 有默认 off 的实现与单测，但**不构成真实归因/B7 完成**；release edge
配置不等于 TLS/网络最小暴露达标。G1 Gate 仍 0/15。

---

## 6.5 2026-11-25 第五波（工作树，未提交）

| 切片 | 结果 | 边界 |
|---|---|---|
| D3 changeset identity + clone/fork | changeset 行身份改为 `(iModelId, id)`；子引用/触发器按 iModel 收口；clone/fork K=0 baseline-only；K>0 历史复制仅 `CLONE_HISTORY_COPY_ENABLED=true`，显式 `changeset_copy_mappings`、重算 target chain、仅复用已验证 checkpoint；跨 iTwin 422；squash/Duplicate 501 | 迁移仅 SQL-shape/实体 metadata 测试，未在真实 Postgres/旧库执行；无 native open/readback/GC lease；同步复制、整个 checkpoint 容器复制；D3 未完成 |
| D8 版本固定引用 | `imodel_version_refs` + `/imodels/:id/versionrefs`，默认 `VERSION_REFS_ENABLED=false`；创建时冻结 `(target iModel, changeset id/index, Named Version, exact-index checkpoint)`；读只重验冻结 tuple，不回退 head/邻近 checkpoint；删除护栏 409 | 内部扩展，非官方 iModels v2 合同；无 SDK/UI；同 iTwin 目标 ACL 仅 iTwin 级；D9 Where Used 仍缺 |
| D7 版本比较/恢复 | compare 为 ledger/chain 级并显式 `contentDiff.supported=false`；restore 只返回 dry-run plan，非 dry-run 恒 501；默认 `VERSION_HISTORY_TOOLS_ENABLED=false` | 无 native ChangesetReader/恢复 materializer；不宣称生产 restore |
| Release evidence | manifest `evidence[]`（sbom/signature/attestation/provenance）文件型 SHA-256；`--require-release-evidence` 与 release hygiene release 模式；94 个相关 node:test 通过 | 只证明本地文件存在/哈希一致，不验签/不解析 SBOM/不绑定镜像；真实 manifest/SBOM/签名仍缺；release 仍因 1.64 vs 1.85、`:latest`、宿主路径失败 |
| B6 P4b/B4 审计 | 文件级路线图与阻塞清单（共享 key 全局 deny、Bearer service JWT、owner-route OBO、`doc.manage`/`version.write`、Share/Link UI） | 只读审计，无代码；需 ARB/产品决策；不改变 Gate |

**结论**：D3/D7/D8 有了默认关闭的部分实现和单测，D3 身份迁移、D7 restore、D8 ACL/UI
仍未达生产；release evidence 只加固验证面。G1 仍 0/15，不得宣称 D3/D7/D8 或发布完成。

---

## 6.6 2026-11-25 第六波（工作树，未提交）

| 切片 | 结果 | 边界 |
|---|---|---|
| B4 路由动作元数据 | `AUTHZ_ACTION_METADATA=legacy|dual|action` 默认 legacy；`@RequireAction` + `ActionAccessGuard` 走同一 `AuthorizationService`；标注 changeset/briefcase/lock/named-version 共 26 条写路由；`doc.manage` 加入 resolver 目录但不进入 OBO 闭集 | action 模式仅在有显式 Write/Edit 且 `AUTHZ_WRITE_SEMANTICS=write` 时放行；service-only/无 OBO 写仍按既有 guard 失败；扩展数据/组/删除/管理路由未迁移；Hub 全量 193/1755 |
| B4 Share/Link UI | 删除分享对话框的假 link tab/copy-link/guest 语义；Read/Manage 授权行为不变；canManageShare=false 时不渲染邀请/撤销/secured 控件；未加 Write 选项（公共写路由仍 Manage-only，无 capability 佐证）；web 相关 9 文件/199 tests + tsc/eslint 通过 | A 文档/项目容器列表仍无 per-document Share gate；iTwin shares 仍 API-only；仅 jsdom，无真栈；不宣称 B4/无假分享完成 |
| 生产 DR/PITR 规范 | 新增 provider-neutral `production-drills.mjs`、PITR/对象版本化证据模板和 runbook；isolated `scenarios`/`plan` 只打印定义，不执行 Docker/云；84 个 node:test 通过 | 未选择生产 provider/区域/KMS/证据库；PITR、对象版本化、CRR/object lock、RPO≤5m/RTO≤1h 未执行、未达标；RPO=0 需同步复制决策 |
| B6 P4b 原语 | `AUTH_SERVICE_LEGACY_API_KEY` 显式 `deny` 对 AgentApiKey/ApiKey/ServiceAuth/SystemAgent 全部生效；deny + service-clients off 启动需 migration ack；`DataPlaneAuthGuard` 增加 route-opt-in Bearer service JWT（同一验证器/scope/pin，冲突拒绝，无路由启用）；Hub 全量 193/1777 | 无 route 启用 Bearer；baseline/admin 仍共享 key-only，deny 后会 401 直到迁移/退役；无 KMS/RS256/jti 撤销/三进程 canary；owner-route OBO 仍未实现 |

**结论**：B4 有了默认 legacy 的路由动作骨架、并删除了假 link UI，但不等于 Write/Share
能力上线；DR 只有规范/校验器，没有生产证据；B6 P4b 只有默认-safe 原语，不能启用
deny/enforce。G1 仍 0/15。

---

## 7. Stop-ship 与不得宣称

- 未获书面法律结论前：ACIS 外部分发、STEP/IGES/Parasolid、healing/InterOp；
  on-prem libslvs；数据驻留/出口。
- 未完成 G1 前：多用户生产、对外分享、专业云 CAD、SLA、生产数据托管。
- 未完成 DR 演练前：RPO/RTO、备份可恢复、数据可靠承诺。
- 未完成 G2 前：Feature Manifest/输出/拓扑/工作区“已冻结”、装配/工程图接入 Part Studio。
- 未完成 G3 前：单租户生产、多租户、HA、24h soak、可复现发布。
- 任何 Airr/例外默认 off 时，不得把隔离 canary 写成部署形态通过。

---

## 8. 证据与回滚规则

- 每个切片：AIRR/ADR → 单元/契约 → 真栈或故障注入 → 文档/例外/台账同 PR。
- 所有强制开关默认 off；rollback=关开关，不依赖凭据过期。
- 证据必须含环境、commit/tag、命令、输入、p50/p95、是否冷/热；失败也是证据。
- 公开仓只放契约/脱敏结论；私有源码、密钥、native 证据、客户数据不得入库。
- Gate 勾选只能由 ARB/owner 在证据齐备后执行；Agent/实现者不得自签。

---

## 9. 立即执行清单

1. 完成并评审 18 份 ADR；更新决策/ Spike 登记册；产出 G0 Gate Report。
2. 实现 B3.1f-a 与 Hub 跨 iTwin authz；跑隔离 canary。
3. 交付完整性扫描/DR runbook 与发布卫生门。
4. 启动 B2.2 归因 + B6 P4b + B4 写语义设计；G1 关键路径按依赖推进。
5. 在 G1 Gate 前不新增 Part Studio 功能；G2 冻结前不新增特征类型。
