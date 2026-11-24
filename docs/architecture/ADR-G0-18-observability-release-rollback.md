# ADR-G0-18：可观测性、可复现发布与 N-2 回滚

> 状态：**Proposed under owner directive 2026-11-24; not ARB-signed**
> 日期：2026-11-24
> 关联：`G1-EXECUTION-PLAN.md`（J1/J2/J3/J4/J5/J6/J10）、`../operations/RELEASE-MANIFEST.md`、`../operations/BACKUP-RESTORE.md`、`09-INDUSTRIAL-TARGET-ARCHITECTURE.md` §12、`10-ARCHITECTURE-HARDENING-PLAN.md` WS-J、`G1-WAVE2-STATUS-2026-11-23.md`
> 影响面：CI/CD、镜像/产物、release manifest、staging、部署/回滚、日志/metrics/trace、SLO/告警/on-call、契约冻结与运行时对账

> 本 ADR 冻结发布与可观测性的目标约束，**不表示 CI/CD 或发布门已通过**。当前无真实 release manifest、无真实镜像 digest/SBOM/attestation，public CI 从未实际运行；在证据齐备前不得宣称发布就绪或生产可观测。

---

## 1. 背景与约束

发布单元实际由多仓/多产物组成：web（本仓 `apps/web` 构建）、BFF、modeling-server（宿主产物 `dist-backend/`）、Hub/WA 镜像（私有仓 GHCR）、shared 契约与 schema。当前状态（截至 2026-11-24）：

1. **契约漂移已存在**：源码 `LubanFeatureRpcInterface` 为 1.85，最近发布 MS 产物为 1.64；RPC 版本握手会让整个 Feature 面失效，而发布门没有强制检查。`09` §12 与 `01-SYSTEM-MAP.md` 均记录该差距。
2. **public CI 从未实际运行**：分支未 push；backend 全量/native ctest 仍依赖 self-hosted，未形成托管绿门；接口冻结仍有红项记录（`09` §12；`G1-WAVE2` §1 WS-J）。
3. **没有真发布清单/签名**：`scripts/release-manifest.mjs` 已实现结构校验、文件字节校验与 `/rpc/metadata` 运行时对账，但真实镜像 registry digest、OCI label、SBOM 生成/签名、attestation、清单签名与 Release 归档均未产出（`../operations/RELEASE-MANIFEST.md` “仍需外部发布环境补齐”）。
4. **镜像/版本可变**：`docker-compose.yml` 仍使用 `latest`（Hub/WA/web/BFF），Hub/WA 镜像由 GHCR 拉取；MS 产物在宿主 `dist-backend/` 目录，升级先删旧树、无原子切换/N-2。
5. **构建不可复现**：MS 构建依赖宿主路径/本地 checkout，存在 `tsc --noCheck` 与 npm install 回退（私有后端构建事实；公开仓只记录约束），native provenance 可能含宿主绝对路径；Node/基础镜像版本未钉 digest（`09` §12）。
6. **无可观测基线**：MS/WA/BFF/Hub 没有统一 requestId/traceId；健康检查不查依赖；没有 metrics/traces、SLO、告警或 on-call；`verify-stack` 仍是审计基线 15/17（`G1-WAVE2` §2）。
7. **无 staging 同形态**：dev 是 vite，生产是镜像；主 e2e 默认不打部署产物；没有独立 staging 与 IaC/配置 schema。
8. **升级/回滚未演练**：hub 启动即迁移；发布先删旧树、无原子切换/N-2；回滚 runbook 与数据迁移回退未演练。

**约束**：

- 发布必须绑定“发布单元”：web/BFF/MS/Hub/WA/shared/schema 的版本与 digest 必须可对账；不能以多个独立版本号各自漂移。
- 生产禁止 `latest`；禁止宿主 dist 遮蔽镜像；禁止跳过全量 e2e 发布。
- 可观测性不得记录 token、SAS、邮箱、客户模型名等敏感数据；requestId 不得成为跨租户关联手段。
- 发布/回滚必须 HITL；破坏性数据迁移前必须备份，遵守 ADR-G0-15/17 的迁移门。
- 本 ADR 不改变工具生命周期/模型事实源；只约束发布、观测与运维证据。

---

## 2. 决策

### D-A 全链路 requestId 与就绪检查

1. **requestId 在入口生成**：nginx/BFF 对缺少 `X-Request-Id` 的请求生成不可预测 ID；客户端提供的值必须格式校验，非法则替换。ID 必须随请求头传播 nginx → BFF → MS → Hub，并写入响应头。
2. **贯穿日志/错误/追踪**：所有服务结构化日志必须带 requestId；错误响应可带 requestId 供支持定位，但不得回显内部堆栈/SQL/token。
3. **会话/用户关联**：日志可带 sessionId/userId 的不可逆/受控标识；禁止 token、SAS、密码、邮箱、完整对象 key；关联字段与审计（ADR-G0-20）分离，审计是事实源，日志不是。
4. **liveness/readiness 分离**：
   - liveness 只表示进程存活，避免依赖抖动导致重启风暴；
   - readiness 必须检查关键依赖（DB/Redis/对象存储/Hub/MS 上游）与启动配置校验；依赖不可用时 readiness 失败并从负载均衡摘除；
   - 启动必须 fail-fast（缺密钥/非法配置/契约版本不匹配），不得带病提供服务。
5. **健康检查不得只查进程**：WA/BFF/MS/Hub 的 readiness 要能在依赖故障时失败；`verify-stack` 的 health 检查需覆盖依赖链。

### D-B metrics、traces、日志与 SLO

1. **指标/追踪**：采用 OpenTelemetry（或等价、可导出到托管 APM 的开放标准）统一 metrics/traces；至少覆盖 RED（rate/errors/duration）与关键作业指标（checkpoint/baseline/import/export 队列深度、耗时、失败原因）。
2. **trace 传播**：W3C traceparent 与 requestId 并行；跨 nginx/BFF/MS/Hub/worker 的调用可串成一条 trace；采样率与敏感字段脱敏策略纳入配置。
3. **日志**：JSON 结构化、级别/字段规范、轮转与保留期；生产禁止 console 明文敏感信息；日志写入失败不得静默吞掉关键错误。
4. **SLO**：定义并文档化 API 可用性、编辑交互延迟、文档打开（冷/热）、保存/推送、长作业、5xx/业务失败、恢复 RPO/RTO；SLO 目标由 Product/SRE 在 G3 前批准，未批准前不得对外承诺。
5. **告警/on-call**：基于 SLO/错误预算与关键依赖设置告警；定义 Sev 分级、值班、升级路径、runbook 与事故复盘；告警必须可达并有演练记录。
6. **仪表盘**：至少提供发布/回滚视图、依赖健康、队列积压、checkpoint/baseline 失败、DR 演练状态；指标保留期满足事故复盘。

### D-C 可复现构建与发布单元

1. **构建可复现**：lockfile 冻结；禁止宿主绝对路径进入产物/provenance；类型检查必须真实执行（禁止 `--noCheck` 发布）；禁止 npm install 回退混入生产构建；Node/包管理器/基础镜像钉版本与 digest；构建环境容器化/固定。
2. **一次构建、多环境 promote**：同一源码提交构建一次，staging 与生产使用同一 digest/产物；禁止在目标环境重新构建或打补丁；配置与密钥通过部署注入，不进入镜像。
3. **发布单元**：`release-manifest.json` 绑定 tag、源 commit、镜像 digest、`contractVersion`、SBOM digest、native provenance 与 artifacts；web/BFF/MS/Hub/WA/shared/schema 的版本必须在同一清单中对账。禁止 `latest`。
4. **运行时对账**：部署后必须用 `verify-runtime` 对 `/rpc/metadata` 与清单 `contractVersion` 对账；镜像 OCI label（`org.opencontainers.image.revision` 等）与源 commit/digest 对账；源/产物契约版本不一致即阻断发布（当前 1.85 vs 1.64 属阻断项）。
5. **签名/attestation**：镜像与发布清单必须签名，生成 provenance/attestation；部署端验证签名与 digest；密钥在 KMS/HSM，轮换有记录。

### D-D CI 门与 staging 同形态

1. **CI 必须真实运行**：public CI 对 shared/viewer/editor/web/BFF 的单测/lint/tsc/build 必须实际执行；backend 全量与 native ctest 必须进入 self-hosted Windows runner；接口冻结/契约门/许可门/安全扫描不得长期红着发布。
2. **发布候选全量 e2e**：发布候选必须跑全量真栈 e2e（不是 jsdom/mock），并绑定部署产物；跳过 e2e 的候选不得发布。
3. **staging/prod 同形态**：独立 staging，使用与生产同形态的对象存储/HA Postgres/队列/入口（可缩小容量）；部署同 digest 的候选；staging 验收通过后才 promote 生产。
4. **迁移门**：发布包含 DB/schema/native 迁移时，必须遵循 ADR-G0-17 的 dry-run/备份/审批/回滚门；hub 不得在无门禁的情况下“启动即迁移”。
5. **禁止宿主 dist 遮蔽**：生产/staging 不得挂载宿主 `dist/` 覆盖镜像内容；`verify-stack` 保持硬检查。

### D-E N-2 回滚与发布/事故 runbook

1. **保留 N-2**：生产保留当前版本（N）与最近两个可回滚版本（N-1、N-2）的镜像/产物/配置；镜像 digest 不可变；保留期覆盖回滚演练窗口。
2. **原子切换**：升级使用版本化目录/不可变镜像 + 原子切换；不得先删旧树再启动新版本；切换失败自动/人工回退到 N-1。
3. **回滚时限**：回滚必须在发布 runbook 定义的目标内完成（目标由 SRE 在 G3 批准，不以本 ADR 虚构数值）；回滚后 `verify-stack` + smoke 必须通过。
4. **数据回滚**：应用回滚与数据迁移解耦；schema 迁移采用 expansion/contraction，回滚不得依赖已删除列；不可逆迁移必须 fail-closed 并以前向修复/备份恢复处理；回滚不得丢已确认写入。
5. **发布/事故 runbook**：发布前检查清单（清单/签名/digest/契约/e2e/staging/迁移备份）；发布后观察窗；事故分级、回滚决策人、客户沟通；每季度演练一次回滚与事故响应。

---

## 3. 备选方案

| 方案 | 内容 | 结论 |
|---|---|---|
| A. 维持手工发布/`latest`/先删旧树 | 当前形态；无 manifest/签名/staging/N-2 | **仅内网验证**；不满足生产发布/回滚 |
| B. 可复现构建 + manifest + staging + N-2 | 一次构建 promote、digest 钉版、签名、同形态 staging、原子回滚 | **采用**（生产基线） |
| C. 渐进式交付（canary/feature flag/自动回滚） | 在 B 之上增加按比例流量与自动分析 | **后续可选**；需 B 的指标/告警/回滚基础，另立 ADR |
| D. 仅依赖托管 APM/厂商专有 agent | 不做开放标准埋点 | **不采用为唯一方案**；可采用厂商，但必须保留 OpenTelemetry 兼容导出与自建指标 |

---

## 4. 后果

**正向**

- 一个请求可跨 nginx/BFF/MS/Hub 关联；故障定位与发布验证不再依赖猜测。
- 发布可复现、可对账、可签名；源/产物契约漂移会在发布前阻断。
- staging 同形态与 N-2 回滚降低升级风险；迁移门避免“启动即迁移”事故。
- SLO/告警/on-call 为生产承诺提供可测量基础，而不是口头 SLA。

**负向/成本**

- 需要 self-hosted CI、镜像签名/KMS、manifest/attestation、staging 环境与可观测性基础设施。
- 构建容器化/固定工具链与禁止 `--noCheck` 会增加构建时间与迁移成本。
- N-2 保留增加存储与运维成本；发布流程变慢。
- SLO/值班/事故演练需要组织投入。

**未决**

- SLO 具体数值与错误预算（Product/SRE 在 G3 前批准）。
- APM/日志/追踪后端选型与保留期。
- 签名体系（cosign/Sigstore vs 云厂商 KMS/HSM）与密钥轮换。
- staging 容量/数据脱敏与是否使用生产样例。
- 是否引入 canary/自动回滚；本 ADR 只要求 N-2 与人工回滚可演练。

---

## 5. 迁移、回滚与失败判据

### 5.1 迁移阶段

| 阶段 | 内容 | 门 |
|---|---|---|
| P1 | 入口 requestId + 结构化日志 + readiness | 三跳（nginx/BFF/MS/Hub）可关联；依赖故障 readiness 失败 |
| P2 | metrics/traces + 仪表盘 + 告警 | 关键 SLO 指标可见；告警可达 |
| P3 | CI 实际运行 + backend/native self-hosted + 全量 e2e | PR 门禁真实执行；红门禁阻断 |
| P4 | 可复现构建 + 镜像/依赖钉 digest + 禁止 `--noCheck`/npm 回退 | 同源码重建同 digest；产物无宿主路径 |
| P5 | release manifest/签名/attestation + 运行时对账 | 清单/OCI label/`/rpc/metadata` 三方一致 |
| P6 | staging 同形态 + 一次构建 promote | staging 与 prod 仅配置差异；同 digest |
| P7 | N-2 版本化目录 + 原子切换 + 回滚演练 | 回滚在目标内完成；数据无损 |

### 5.2 回滚

- **应用回滚**：切换到 N-1/N-2 的不可变 digest；保留当前版本用于取证；回滚后跑 `verify-stack` + 关键业务 smoke。
- **配置回滚**：配置 schema 校验；非法/不兼容配置 fail-fast；回滚配置不得绕过签名/清单校验。
- **数据/迁移回滚**：按 ADR-G0-17 的 expansion/contraction 与备份恢复；不可逆迁移 fail-closed；禁止“删库重建”冒充回滚。
- **可观测性回滚**：埋点/采集器故障不得阻断业务；本地缓冲/降级；不得因 tracing 丢请求或写敏感数据。
- **发布门回滚**：若清单/签名/对账失败，停止发布而不是临时绕过；恢复需修复清单/签名后重新走门。

### 5.3 失败判据（发现即不得发布/宣称生产）

1. 生产使用 `latest` 或可变 tag；镜像/产物 digest 未钉版或不可对账。
2. 无真实 release manifest，或清单缺源 commit/契约版本/SBOM digest/native provenance；清单未签名。
3. 源/产物契约版本不一致（当前 1.85 vs 1.64 未解决）；`/rpc/metadata` 与清单不一致仍发布。
4. 构建含宿主绝对路径、`tsc --noCheck` 或 npm install 回退进入生产产物。
5. public CI 未实际运行；接口冻结/契约门/安全扫描为红仍发布；发布候选跳过全量 e2e。
6. staging 与生产形态不一致，或未经 staging 直接生产；生产重新构建而非 promote 同一 digest。
7. 无统一 requestId 贯穿 nginx/BFF/MS/Hub；readiness 不检查依赖；无 metrics/traces/SLO/告警/on-call。
8. 升级先删旧树、无原子切换/N-2；回滚未演练或回滚后无法 `verify-stack`。
9. DB/schema 迁移未经备份/dry-run/审批/回滚门；hub 启动即迁移且无门禁。
10. 日志/追踪记录 token、SAS、密码、邮箱或客户模型敏感信息；观测链路成为数据泄露面。

---

## 6. 证据状态（截至 2026-11-24）

| 项 | 状态 | 证据/边界 |
|---|---|---|
| public CI 实际运行 | **未发生** | 分支未 push；`G1-WAVE2` §1：public CI 从未实际运行；backend 全量/native ctest 未进托管 CI |
| 接口冻结/契约门 | **未全绿** | `09` §12：interface-freeze 红；源码 1.85 vs 发布 1.64；J1.1 未完成 |
| 真实 release manifest | **未产出** | `../operations/RELEASE-MANIFEST.md`：工具/测试存在，但真实镜像 digest/OCI label/SBOM/attestation/签名未生成；无实际发布清单 |
| 镜像/产物 digest | **不可对账** | compose 使用 `latest`；GHCR 镜像与源 commit/契约版本无三方对账证据 |
| 可复现构建 | **未实现** | MS 宿主路径/本地 checkout；`--noCheck`/npm install 回退；Node/基础镜像未钉 digest |
| staging 同形态 | **未建立** | 无独立 staging/IaC；主 e2e 默认不打部署产物 |
| N-2/原子回滚 | **未实现/未演练** | 升级先删旧树；无版本化目录/N-2 证据；hub 启动即迁移 |
| requestId 全链 | **未实现** | MS/WA/BFF/Hub 无统一 requestId；日志无全链关联 |
| readiness | **不完整** | 健康检查不查依赖（`09` §12；`G1-WAVE2` §2） |
| metrics/traces/SLO/告警/on-call | **未建立** | 无统一指标/追踪/告警/值班证据 |
| `verify-stack` | **15/17 审计基线** | `G1-WAVE2` §2；不是发布门全绿证据 |
| 发布门工具切片 | **存在但未成门** | `release-manifest` 结构/文件/运行时对账、`release-gate.ps1 -ManifestPath` 可选接线；真实发布未走通 |
| G1 Gate | **未通过** | 相关 J 工作包未完成；不得把本 ADR 当 Gate 证据 |

**明确不宣称**：CI/CD 已就绪、发布清单/签名/SBOM 已生成、镜像 digest 可对账、staging/prod 同形态、N-2 回滚已演练、requestId/metrics/traces/SLO/告警/on-call 已上线。当前只具备部分工具与测试切片。

---

## 7. 未决与后续 ADR

1. SLO 目标、错误预算与对客 SLA（Product/SRE 批准）。
2. APM/日志/追踪后端与保留期；OpenTelemetry collector 拓扑。
3. 签名体系/密钥管理（cosign/Sigstore/KMS/HSM）与发布审批职责分离。
4. staging 数据来源、脱敏与容量；是否使用生产样例。
5. canary/渐进式交付与自动回滚（在 B 稳定后另立 ADR）。
6. MS 服务化/版本化目录/优雅停机的实现设计（与 ADR-G0-14/17 协同）。
7. 发布单元与多仓版本治理（shared/web/MS/Hub/WA/schema）的最终清单格式。

---

## 8. 签字与状态

- 拟制依据：业主 2026-11-24 指令（发布/可观测 ADR 先行）。
- 当前状态：**Proposed — not ARB-signed**。在 ARB、平台/SRE/Security owner 签字前，本 ADR 只作为实现约束，不能作为 G1/G3 Gate 的通过证据。

| 角色 | 姓名 | 日期 | 结论 |
|---|---|---|---|
| 架构 owner | | | |
| 平台/CI owner | | | |
| SRE owner | | | |
| 安全/发布 owner | | | |

---

## 9. 关联文档

- `G1-EXECUTION-PLAN.md`（J1–J7、J10）
- `../operations/RELEASE-MANIFEST.md`（manifest 构建/校验/文件字节/运行时对账与未完成项）
- `../operations/BACKUP-RESTORE.md`（恢复/回滚与数据门）
- `ADR-G0-14-dr-rpo-rto.md`（RPO/RTO 与恢复顺序）
- `ADR-G0-17-data-platform-object-storage-queue.md`（数据平台/迁移门）
- `ADR-G0-19-supply-chain-sbom-license.md`（SBOM/签名/许可门）
- `../research/lubancad-architecture-assessment/01-SYSTEM-MAP.md`（发布/契约差距）
- `../research/lubancad-architecture-assessment/09-INDUSTRIAL-TARGET-ARCHITECTURE.md` §12、§14
- `../research/lubancad-architecture-assessment/10-ARCHITECTURE-HARDENING-PLAN.md` WS-J、G3 验收
- `G1-WAVE2-STATUS-2026-11-23.md`（CI/发布实际证据与未完成项）
- `EXCEPTIONS.md`（X-18/X-19 兼容回滚开关；发布配置不得启用 `allow`；X-27 PEP 覆盖不是 ACL 结论）
- `../../docker-compose.yml`、`../../scripts/release-gate.ps1`、`../../scripts/release-manifest.mjs`、`../../.github/workflows/ci.yml`
