# 工业级架构冻结与开发计划

> 状态：**Proposed（2026-11-22）**，待 ARB/产品批准；G0 决策通过前不按本计划全量投入。
>
> 可执行落地：G0 的两周日历、决策/Spike 模板、16 项决策与 16 个 Spike 的详细执行方法、20 个 ADR 与 G1 初始 backlog 见 [`../../architecture/G0-EXECUTION-PLAN.md`](../../architecture/G0-EXECUTION-PLAN.md)；逐项签字/证据登记见 `G0-DECISION-REGISTER.md`、`G0-SPIKE-REGISTER.md`；G1 Sprint 任务与 Gate 见 [`../../architecture/G1-EXECUTION-PLAN.md`](../../architecture/G1-EXECUTION-PLAN.md)。
>
> 目标：在开始“全部功能”之前，先把架构做到**已知范围内正确、可验证、可恢复、可扩展**，避免后期结构性返工。
>
> 需要诚实说明：软件工程不存在“绝对正确”的证明。这里把“绝对正确”操作化为：
> - 所有已识别的**单行道**都有 ADR、备选、原型、失败判据、回滚；
> - 所有**P0 门禁**有可重复的自动化测试/演练；
> - 所有**架构不变量**由 CI/评审强制；
> - 没有未决的承重假设被偷偷带进功能开发。
>
> 计划遵循一条硬规则：**未通过对应 Gate 的工作流，不进入全功能铺开；只允许维护性修复和明确受限的试点。**

---

## 0. 目标、范围与节奏

### 0.1 目标

建设一个能支撑专业级云 CAD 的架构底座：

- Part Studio 作为第一产品面先做深；
- 但文档/工作区、特征图、协同、版本、装配/工程图、导入导出、运维/安全都按工业级目标预留；
- 不以“先做出来再说”推进任何单行道。

### 0.2 范围

**本计划覆盖**：身份/安全/租户、会话、版本账本、灾备、特征平台、工作区/UI/选择、几何/性能、协同、发布/运维、合规、产品域前置。

**本计划不覆盖**：具体 UI 像素、单个特征的业务细节、市场/销售策略。

### 0.3 节奏原则

- Gate 0–3 是“架构冻结”阶段；Gate 4 之后才进入全功能开发。
- 每个 Gate 都有**进入条件、工作包、验收证据、退出判据**。
- 任何 Gate 失败：停止新增依赖，先修复；不允许用“后面再补”绕过。
- 时间仅为指示性（按 6–8 人工程团队 + 1 SRE/安全 + QA 估算），不是交付承诺。

### 0.4 一页结论

- **先决策**：16 个单行道决策 + 16 个 1–2 周 spike，不写依赖未决决策的功能。
- **先正确**：会话隔离、per-doc ACL、不可变账本、checkpoint/版本打开、灾备、用户归因；这些不过，不对外分享/发布。
- **再冻结**：Feature Manifest、输出端口、拓扑身份、typed Tab、SelectionRef、批量拾取、format tag；这些不过，不铺大量特征。
- **再生产**：HA/队列/可观测/SLO/DR/CI/ctest/SBOM/渗透/负载；这些不过，不宣称生产级。
- **先合法**：ACIS 分发、libslvs GPL（公开 MS 产物）、STEP 许可、Thicken fail-closed；未决不得对外分发。
- **最后铺功能**：Part Studio 深度 → 装配/工程图/PDM/导入导出；每个域独立 Gate，不混波次。
- **不追求口号式“绝对正确”**：追求“已知单行道全部裁决、所有承重假设有证据、所有失败可恢复、所有能力诚实登记”。

### 0.5 立即 stop-ship（任何外部分发/对外 SaaS 前）

以下任一项未关闭，不得对外发布或宣称生产可用：

- ACIS 分发/第三方通知/出口分类未获法务书面结论。
- 公开 MS 产物包含 `slvs.node`（GPL）且无合规方案。
- ThickenSheet 等 blocked-license 工具仍可经 IPC/编辑器调用。
- WS token 出现在 URL/console/nginx 日志，连接建立后不撤权。
- WA 管理/调试端点无认证且对外；`/baseline/process` 可被匿名触发/替换基线；Azurite 使用公开默认密钥且端口暴露。
- 服务账号 + 共享 API key 仍可代表任意用户访问 Hub。
- 公开自助注册/分享 UI 在身份/租户/ACL 完成前开放。
- 双用户打开同一文档会互踢/串响应。
- changeset 仍可改写或悬挂会永久阻塞链头。
- 对外宣称“复制/分支”但 clone/fork 对已编辑文档复制出空 baseline，或 mid-history checkpoint 会让 fork FK 失败。
- 生产数据只有单卷/单副本，无备份/PITR/恢复演练，或使用 Azurite 承载唯一历史。
- 发布产物与源码契约版本不一致（当前 MS 1.64 vs 源码 1.85），且发布门不检查 Feature RPC 版本。
- 发布门/接口冻结为红仍继续发布；产物 `latest` 可变且无 release manifest。
- 代理后所有用户共享一个限流桶（MS 未设 `trust proxy`），或 `/ipc` 可无限发请求。
- 无 TLS 的对外入口。


---

## 1. Gate 模型

| Gate | 名称 | 目标 | 允许做什么 | 不允许做什么 |
|---|---|---|---|---|
| **G0** | 决策基线 | 所有单行道有裁决/原型计划 | 架构文档、ADR、spike、威胁模型 | 任何依赖未决决策的功能代码 |
| **G1** | 平台正确性 | 会话/身份/账本/灾备正确 | 修复 P0；受限内部试点 | 对外分享、多用户、版本发布 |
| **G2** | 契约/工作区冻结 | 特征/工作区/选择/契约可扩展 | 按 manifest/端口/模块铺功能 | 继续手写单输出/单文档/单 store |
| **G3** | 生产就绪 | HA/规模/发布/安全/DR 达标 | 单租户生产、受控客户 | 宣称多租户/专业云 CAD |
| **G4** | Part Studio 功能扩展 | Part Studio 主要功能完整 | 全面铺特征/草图/表达式 | 越过 G2 的契约边界 |
| **G5** | 专业产品面扩展 | 装配/工程图/PDM/导入导出 | 独立产品域立项 | 把产品子系统塞进 Part Studio/内核 |

**关键顺序**：
```
G0 决策
  → G1 会话/身份/账本/灾备
    → G2 契约/工作区/特征图/选择
      → G3 生产化
        → G4 Part Studio 深度
          → G5 装配/工程图/PDM/导入导出
```

G1 与 G2 的部分工作可并行，但 **G2 的任何契约冻结不得绕过 G1 的会话/身份/账本门禁**。

---

## 2. Gate 0：决策基线（1–2 周）

### 2.1 必须产出的决策

| # | 决策 | 选项 | 建议 | 失败判据 |
|---|---|---|---|---|
| D0-1 | 产品范围 | Part Studio / 主要功能 / 全量 | 近期 Part Studio+基础 PDM；架构按全量预留 | 继续用“全量 Onshape”对外承诺 |
| D0-2 | 部署/租户 | 单租户/多租户 | 单租户先上线，多租户架构预留 | 单租户假设写死进代码 |
| D0-3 | 协同模型 | 单写者/异步多 briefcase/实时 | 异步多 briefcase 先；实时独立 ADR | 未定就做 presence/实时 UI |
| D0-4 | 版本/分支 | 线性/版本图 | 先冻结账本+checkpoint；分支后置 | 用 fork 冒充 branch |
| D0-5 | 几何持久化 | ACIS SAB/TrueForm | 加 format tag；TrueForm 长期 | 未决就启动 TrueForm M1 |
| D0-6 | 渲染 | iTwin/PBR/DanQing | iTwin 唯一交互；PBR/离线 ADR | 先做材质 UI 再定管线 |
| D0-7 | 导入导出 | mesh/DXF/STEP | mesh/DXF 先；STEP 许可裁决 | 承诺 STEP 不支持的能力 |
| D0-8 | 装配/工程图 | 实例/求解器/HLR | 实例/只读显示先；Mate/HLR 后 | 把装配/图纸塞进 Part Studio |
| D0-9 | 进程模型 | 单进程多会话/process-per-session | 倾向 process-per-session/per-doc actor | 复用全局 Editor/IPC 单例 |
| D0-10 | Undo 粒度 | 文档/页签/操作组 | 操作组；与协作模型一起定 | 保留两套不互通 undo |
| D0-11 | 变量/配置作用域 | per-PS/文档/配置 | 文档级变量 + config 层预留 | 继续加深单表假设 |
| D0-12 | 目标市场/合规 | 中国/全球/私有化 | 先明确数据驻留/许可/出口 | 未定就收集客户数据 |
| D0-13 | 持久化 ack 语义 | 本地 commit/hub push/checkpoint | RPC ok=本地已保存；push ack=云端已持久化；UI 明示未推送窗口 | 把本地成功当云端保存 |
| D0-14 | 灾备等级 | 单卷/HA+PITR/跨区 | 生产最低 HA+PITR+对象版本化；RPO≤5m、RTO≤1h | 用 Azurite/单卷承载生产 |
| D0-15 | 迁移契约 | 只 additive/版本化+fixture+回滚 | schema/params/native 全部版本化，旧 `.bim` fixture，dry-run/rollback | params 无版本、迁移不可回滚 |
| D0-16 | 身份归因 | 服务账号/on-behalf-of | 用户路径 on-behalf-of；changeset/briefcase/OpLog/audit 记录真实 user | 共享 API key + sessionId 冒充用户 |

> 20 个 ADR = 上表 16 个决策 + 4 个支撑决策：数据平台/灾备、可观测/发布、供应链/许可、租户/合规。每个 ADR 必须含备选方案、失败判据、回滚方式、验证实验。

### 2.2 必须完成的 spike（失败即停止/改方案）

| Spike | 问题 | 通过判据 | 失败动作 |
|---|---|---|---|
| S0-1 | 双用户双连接 | 两个浏览器打开同一文档不互踢/不串响应；只读独立 | 改会话/IPC/进程模型 |
| S0-2 | 直接编辑门禁 | 直改受租约/ACL/审计约束 | 封直改入口或改 Editor |
| S0-3 | 账本/悬挂/fork | changeset 不可变；崩溃后 push 可恢复；fork 不 FK 失败 | 先冻结账本再 checkpoint |
| S0-4 | 版本打开 | 可按 version/changeset read-only 打开 | 补 openCheckpoint/version 参数 |
| S0-5 | checkpoint×fork | mid-history checkpoint 后 fork 可用 | 重设计 fork/checkpoint 外键 |
| S0-6 | 多输出/拓扑 | split 双侧/多目标输出可被下游消费；拓扑引用带 body/scope | 冻结输出/拓扑契约后再铺特征 |
| S0-7 | occurrence transform | GeometryPart + placement 的拾取坐标正确 | 修 native/DTO transform |
| S0-8 | 批量 pick/topology | 500 面 hover/选择在预算内 | 接受元素级选择边界或先做批量服务 |
| S0-9 | BRep→tile | 真 BRep 几何流 tile 内容正确 | 补测试/修 facet 路由 |
| S0-10 | HLR | 单 body 正交视图可见/隐藏线可生成 | 工程图后置或引入 HLR 引擎 |
| S0-11 | SAB/format tag | 旧 iModel 加标签后仍可读 | 暂不启动 TrueForm |
| S0-12 | 多租户隔离 | 租户 A 不能访问租户 B 的任何资源 | 先做租户边界/RLS |
| S0-13 | clone/fork 内容 | 建文档+加特征+push 后 clone，几何/特征数与源一致 | 立即停止“复制/分支”对外承诺，修 fork 语义 |
| S0-14 | 冷开基线 | 200/1000 changeset 的下载/apply/打开 p50/p95 有报告 | checkpoint worker 提前为 P0 |
| S0-15 | DR 演练 | 从备份恢复 Postgres+对象存储，打开 3 个文档；RPO/RTO 有实测 | 停止任何“数据可靠/可恢复”承诺 |
| S0-16 | 持久化边界 | 编辑后不 push，杀 MS/删 briefcase，确认丢失范围与 UI 提示 | 先定 D0-13，改 outbox/ack |

**G0 退出**：16 个决策有 ADR/记录；16 个 spike 有结果（通过/失败/停止）；目标架构（09）和本计划被批准；未决单行道为零或明确登记。

---

## 3. 工作包（WBS）

> 规模标记：S=1–2 人周，M=3–5，L=6–10，XL=>10。仅为相对规模，不是承诺。
>
> ID 约定：`A1`/`B1`/… 是工作包编号；阶段门简写 **G0–G5**；`WS-G` 下的 `G1–G10` 是该工作流的任务号，靠上下文区分，不是阶段门。

### WS-A 架构治理

| ID | 工作包 | 交付 | 验收 | 依赖 | 规模 |
|---|---|---|---|---|---|
| A1 | 目标架构基线 | 09/10 文档批准 | 架构评审通过 | G0 | S |
| A2 | ADR 补齐 | 20 个 ADR | 备选/回滚/失败判据齐全 | A1 | M |
| A3 | 契约/接口目录 | FeatureOp/域 RPC/schema/native 清单 | owner/version/freeze 状态 | A1 | M |
| A4 | 架构适应度函数 | CI/评审门禁清单 | 至少 12 个可执行门 | A1 | M |
| A5 | 威胁模型/数据分类 | 安全基线 | P0 威胁有控制 | G1 | M |
| A6 | 单行道/返工登记 | 决策台账 | 每个单行道有 Gate/负责人 | A1 | S |
| A7 | 变更管理/职责分离 | 分支保护/CODEOWNERS/签名提交/发布审批；安全/许可独立签字；访问评审 | 未评审不可合并/发布；发布证据可追溯 | A1 | M |

### WS-B 身份/安全/租户

| ID | 工作包 | 交付 | 验收 | 依赖 | 规模 |
|---|---|---|---|---|---|
| B1 | IdP/OIDC/SSO/MFA | 企业登录；账号状态/密码策略/SCIM 生命周期 | 登录/登出/刷新/撤销；inactive/locked/deleted 全入口拒绝；MFA 可强制 | G0 | L |
| B2 | on-behalf-of/delegation | 用户触发路径真实身份；后台 service identity 拆权 | 无服务账号直通用户路径；changeset/OpLog/audit 记录真实 user | B1 | L |
| B3 | per-doc ACL/PDP-PEP | 所有入口鉴权：Hub/MS/WA/storage/tile/progress/retry/openBriefcase | 用户 B 对 A 的每个入口 403；只读不可写；路径/key/iModelId 负例 | B1 | L |
| B4 | groups/shares/link share | 权限执行或从 UI/API 删除 | 组/链接/撤销/deny 负例；缓存即时失效 | B3 | M |
| B5 | WS/token 生命周期 | 连接绑定/jti/过期/撤权；登出失效 access+关闭 WS；token 不进 URL/console/log | 登出后下一次 IPC/RPC 403；日志/控制台零 token | B1 | L |
| B6 | secrets/KMS/加密 | KMS/信封加密；TLS DB/Redis/对象存储；移除 well-known Azurite 密钥；轮换；按服务拆分最小权限密钥 | 无明文密钥；轮换演练；扫描无泄露；WA/MS 不持有全局密钥 | B1 | L |
| B7 | 审计日志 | append-only/WORM/hash chain；高风险操作审计失败即阻断 | 可按 user/doc/time 查询；篡改可检测；覆盖登录/权限/导出/直改 | B2/B3 | M |
| B8 | 网络/限流/WAF | TLS/HSTS/CSP；WA 端点认证/仅内网；DB/Redis/Azurite 不公网；网络分段；可信代理；CORS/CSRF/Origin/SSRF 校验 | 外部端口最小化；per-user/tenant 限流；`/ipc` 限流；MS `trust proxy` 正确；对象存储 CORS 非 `*`；WS 校验 Origin | B3 | L |
| B9 | 漏洞/SBOM/渗透 | 供应链/安全证据 | 0 critical；SBOM 可查；镜像签名 | B6 | M |
| B10 | 租户隔离/RLS/配额 | tenantId/RLS/对象前缀/KMS/配额；关闭公开自助注册 | 跨租户负例；配额生效；租户删除无残留 | B3 | L |

### WS-C 会话/IPC/Editor

| ID | 工作包 | 交付 | 验收 | 依赖 | 规模 |
|---|---|---|---|---|---|
| C1 | per-session IPC 路由 | 连接隔离 | 双连接无串响应 | G0 | L |
| C2 | per-session briefcase 文件/key | 不共享/不互踢 | 双用户同文档互不关闭 | C1 | L |
| C3 | Editor 命令/undo 所有权 | 会话级命令/undo | 直改/undo 不串用户 | C2 | L |
| C4 | 进程模型 | process-per-session/per-doc | 两 session 隔离；故障不互相影响 | C1 | L |
| C5 | 外部 lease/fencing/session router | 多实例租约；按 document/session 粘性路由 | 双实例不双写；过期回收；路由不串会话 | C2 | L |
| C6 | openBriefcase 白名单/直改门禁 | 路径规范化/归属校验/直改门禁；close/save/pull/push/undo owner 校验 | 越权路径/任意 key/直改 403 | B3/C3 | M |
| C7 | 会话恢复/重连 | 从 checkpoint 水化；WS 复验/撤权；故障接管 | 崩溃/重启可恢复；撤权连接关闭 | D4/C5 | L |

### WS-D 版本账本/Checkpoint/引用

| ID | 工作包 | 交付 | 验收 | 依赖 | 规模 |
|---|---|---|---|---|---|
| D1 | changeset 不可变/完整性 | PATCH 白名单/DELETE 守卫/必须有 parent/append-only DB 权限/complete 校验 blob+size+SHA-256/列表过滤未完成行/hash chain+Merkle | 改 parent/index 400；无父根拒绝；幽灵行不可见；哈希/链校验 | G0 | L |
| D2 | abandoned 恢复 | waitingForFile 清理/重用/超时；崩溃后链头可用 | 故障注入后 push 成功 | D1 | M |
| D3 | fork 语义 | Duplicate vs History；clone 空文档；mid-history checkpoint FK；跨 iTwin 显式 | 两种语义内容/历史正确；不 FK 失败 | D1 | L |
| D4 | checkpoint worker | 每 N（100–500）/Version 生成；manifest/readback/verify/per-iModel 串行；失败告警不产 phantom | 200/1000 changeset 冷开基线；checkpoint 可打开 | D1/D3 | L |
| D5 | version read-only 打开 | openCheckpoint/version 参数；引用键统一 changesetId/versionId | 打开 V1 几何正确 | D4 | L |
| D6 | Named Version 快照 | 绑真实 checkpoint（非 Scheduled 幽灵行）/事件/计数；未 ready 返回 409 | 打开/不可变/删除保护 | D4 | M |
| D7 | restore/compare | 服务+API | 从版本恢复为新 changeset；diff 正确 | D5/D6 | L |
| D8 | Version/Tab/Refs | 版本引用/refs | Assembly/Derived 可钉版本 | D5 | L |
| D9 | reference index/Where Used | 跨文档索引 | O(k) 反查；权限过滤 | D8 | L |
| D10 | 用户归因/事件 | 真实 userId/事件 | 审计可追到人；事件驱动 | B2 | M |

### WS-E 数据/灾备/迁移

| ID | 工作包 | 交付 | 验收 | 依赖 | 规模 |
|---|---|---|---|---|---|
| E1 | Postgres HA/PITR | WAL 归档/备份/恢复；HA | 季度演练 RPO≤5m/RTO≤1h（D0-14 批准） | G1 | L |
| E2 | 对象存储版本/跨区 | 生产 S3/Azure（Azurite 仅开发）；版本化/对象锁/跨区复制/生命周期 | 校验和/恢复/跨区/WORM | G1 | L |
| E3 | backup/DR runbook | 演练手册；DB 快照+对象 manifest 成套恢复 | 季度全量 DR 演练；跨存储一致 | E1/E2 | M |
| E4 | schema/params 迁移 | schemaVersion/paramsVersion；旧 `.bim`/params fixture；CLI dry-run/verify/rollback | 旧库可读/可重建/可回滚 | D1 | L |
| E5 | 旧 iModel 兼容/迁移 | fixture 矩阵；PartStudioMigration 生产化（源快照/租约、事务外读取修正、幂等、回滚） | 旧库打开/重建；迁移可重试/可回滚 | E4 | L |
| E6 | 保留/删除/租户删除 | changeset/checkpoint/tile/软删 iModel 生命周期；legal hold | 删除可审计/可验证；无悬挂/孤儿 | E1/E2 | M |
| E7 | 容量/配额/缓存 | 冷开 200/1000 基线；配额；briefcase/FeatureOutputCache/services 上限/淘汰/关闭清理；active lock/briefcase TTL；id 池耗尽保护；OpLog 索引/分页；Redis/WA 队列容量 | 目标负载/soak 不超限；缓存不无界增长；锁/会话可回收；Redis 满不丢事件 | G3 | L |
| E8 | 数据完整性/修复 | append-only/hash chain/Merkle；scrubber；DB↔storage reconciler；链修复/悬挂回收 job；读路径不隐式写；RPC/推送持久性边界 | 损坏检测/隔离/修复演练；读无写事务；无父根/挖洞拒绝 | E1/E2/D1 | L |

### WS-F 特征平台

| ID | 工作包 | 交付 | 验收 | 依赖 | 规模 |
|---|---|---|---|---|---|
| F1 | Feature Manifest v0 | 单一清单/生成器 | 21 类型覆盖；生成类型/zod/form/DSL | A3 | L |
| F2 | opDsl/类型检查修复 | draft 补全/strict/test:types | DSL 全类型；CI 红则阻断 | F1 | S |
| F3 | FormRuntime pilot | 一个特征表单对拍 | 字段/单位/表达式/默认值一致 | F1 | M |
| F4 | 输出端口/多输出 | 输出契约/spike | split/mirror 多输出可下游消费 | F1 | L |
| F5 | 拓扑身份 | body/scope/vertex 引用 | 交叉 body/插入后不静默错命中 | F4 | L |
| F6 | 图执行器 | DAG/插入/删除/回滚 | 中间删除/插入/重排/undo | F4/F5 | XL |
| F7 | 统一 undo/preview | 单一 plan/事务组 | UI/API/AI 撤销一致；preview=apply | F5/F6 | L |
| F8 | 特征引用/角色输入 | 正式输入边 | featurePattern/Mirror 不走隐藏缓存 | F4 | M |
| F9 | 配置边界 | configId/覆盖层预留 | 不复制特征即可表达配置 | F1 | M |
| F10 | AI envelope/HITL | opId/userId/baseChangeset/确认 | 幂等/审计/批量/HITL | F1/B2 | M |

### WS-G 工作区/UI/选择

| ID | 工作包 | 交付 | 验收 | 依赖 | 规模 |
|---|---|---|---|---|---|
| G1 | typed Tab/WorkspaceRef | LubanTab/TabDirectory/kind | legacy 合成；旧 URL 兼容 | D8 | L |
| G2 | WorkspaceModule/Host | 工作区注册/适配 | stub tab 不改 Part Studio | G1 | L |
| G3 | per-session store | store 工厂/Session | 双会话状态隔离 | C1 | L |
| G4 | DocumentSessionHost | 连接池/生命周期 | 多文档/同文档多视口 spike | C1/C4 | L |
| G5 | SelectionRef/SelectionDomain | document/occurrence/vertex | 装配实例/跨文档可区分 | G1 | L |
| G6 | ViewportHost 3D/2D | 3D spatial/2D drawing | Drawing 只读显示不挤 3D | G2 | L |
| G7 | CommandRegistry/keymap/ToolSettings | 命令单一来源 | 注册一处五处出现 | G2 | M |
| G8 | FormRuntime 迁移 | 逐特征迁移 | 旧 UI 对拍；无回归 | F3 | L |
| G9 | 多 tab 状态 | 相机/脏/undo/布局 | 切 tab 不串 scope | G3/G4 | M |
| G10 | 批量 pick/BVH | 500 面预算 | hover/选择预算内 | H4 | L |

### WS-H 几何/拓扑/性能

| ID | 工作包 | 交付 | 验收 | 依赖 | 规模 |
|---|---|---|---|---|---|
| H1 | format/kernel 标签 | BRepData 标签 | 旧 fixture 兼容 | G0 | M |
| H2 | 精确质量属性 | 单一体积口径 | 与精确通道一致/标 approx | G0 | M |
| H3 | facet face/edge ID | FacetEntity 预留 | 不重 facet 即可 BVH | G0 | M |
| H4 | TopologySnapshot/PickBatch | 批量只读服务 | 500 面 p95/1 次 IPC | H3 | L |
| H5 | tile facet 批量化 | 请求合并/BRep→tile 测试 | 100 body 墙钟/像素 | H4 | L |
| H6 | BRep 实例/occurrence | GeometryPart/transform | 拾取/质量/干涉正确 | G5 | L |
| H7 | vertex 持久 id | own id/诚实限制 | 面分裂/引用测试 | F5 | M |
| H8 | 鲁棒性/语料/fuzz | 回归语料 | 退化/病态/大模型通过 | G2 | L |
| H9 | 接口冻结/ctest CI/许可门 | 枚举生成/CI；blocked op fail-closed | interface-freeze 绿；ctest 进 CI；Thicken 不可达 | A3/L1 | L |
| H10 | TrueForm/SAB 决策 | 兼容/迁移方案 | 双后端 fixture/回滚 | H1 | XL |

### WS-I 协同

| ID | 工作包 | 交付 | 验收 | 依赖 | 规模 |
|---|---|---|---|---|---|
| I1 | 异步多 briefcase | per-user briefcase | 双用户不同特征 push/pull 一致 | C2/C5 | L |
| I2 | undo 所有权 | OpLog user/briefcase 过滤 | B undo 不影响 A | I1 | L |
| I3 | pull 缓存失效 | 失效钩子/重建 | 远端改参后读面更新 | I1 | M |
| I4 | 锁冲突/过期 | 冲突 UI/TTL | 同元素冲突可读可恢复 | I1 | M |
| I5 | 评论/presence/Follow | 协作服务（可选） | 不进入模型 changeset | G2 | L |
| I6 | 实时 op 流 | 服务端权威（可选） | 双人同时编辑/逐用户 undo | D2/I5 | XL |

### WS-J 发布/运维/可观测

| ID | 工作包 | 交付 | 验收 | 依赖 | 规模 |
|---|---|---|---|---|---|
| J1 | CI 全矩阵 | self-hosted Windows runner；backend 全量测试/native ctest/契约/真栈/web 生产 build/BFF/镜像/接口冻结/安全扫描；发布清单基线由 CI 生成 | PR 门禁全绿；发布候选跑全量 e2e；interface-freeze 不为红；无过期测试基线 | A3 | L |
| J2 | CD/可复现构建 | lockfile 冻结、无宿主路径、类型检查、Node/基础镜像钉版、一次构建 promote | 同源码可重建同一 digest；无 `--noCheck`；无宿主绝对路径 | J1 | L |
| J3 | provenance/SBOM/签名 | release manifest（tag+digest+源 commit+契约版本+SBOM digest+native provenance）；签名/attestation | 源码/产物/镜像/digest 可对账；无 `latest`；`/rpc/metadata` 与 manifest 一致；provenance 无本地路径 | J1 | L |
| J4 | staging/prod 同形态 | 独立 staging、IaC/配置 schema/secrets 校验、MS 服务化、生产 SMTP | staging 与 prod 仅差配置；无宿主 dist 遮蔽；无 maildev/默认密钥/HTTP；MS 开机自启/崩溃重启/优雅停机 | G3 | L |
| J5 | 日志/metrics/traces | requestId/session/user/tenant 全链；JSON 日志；metrics/trace；liveness/readiness | 一个请求可串 nginx→BFF→MS→hub；依赖故障 readiness 失败；告警 | G1 | L |
| J6 | SLO/告警/on-call | SLO 文档/runbook/值班 | 演练；告警可达；Sev 分级 | J5 | M |
| J7 | 负载/soak/chaos | 容量模型/目标负载/24h soak/故障注入 | 目标 p95；无 OOM/泄漏；故障自动恢复 | G3/J5 | L |
| J8 | HA/多实例/队列 | 外部 lease+fencing；session router/sticky；Redis HA；持久队列；WA 队列落卷；分布式 cron | 双实例不双写；WA 重启不丢作业；单节点故障可恢复 | C5/E1 | XL |
| J9 | DR 演练 | RPO/RTO 证据；跨存储恢复 | 季度演练通过 | E3/J8 | M |
| J10 | 发布/回滚/事故 | runbook/演练；保留 N-2；版本化 MS 目录/原子切换；迁移前备份/审批 | 回滚 ≤ 目标时间；数据零丢失；升级失败自动回退 | J2/J6 | M |
| J11 | 支持/状态页/SLA | 工单/升级/状态页 | 客户可报告/可追踪；事故沟通 | J6/J10 | M |
| J12 | 边缘/代理一致性 | nginx/BFF/vite 前缀契约；CORS/URL 校验；MS `trust proxy`；per-user/tenant 限流 | 三套前缀契约测试；代理后不共享单桶；直连不可绕过 | B8/J4 | M |

### WS-K 产品域

| ID | 工作包 | 交付 | 验收 | 依赖 | 规模 |
|---|---|---|---|---|---|
| K1 | Assembly 实例 | occurrence/GeometryPart/sourceRef | 100 实例/质量/冷重开 | G1/G5/H6 | L |
| K2 | Mate/3D solver | 求解器 ADR/spike | Fastened/Revolute/DOF | K1 | XL |
| K3 | BOM/part properties/Where Used | BOM 聚合/索引 | 数量/合并/权限 | K1/D9 | L |
| K4 | Drawing 只读/2D | Sheet/ViewCreator2d | 与 3D 共存 | G6 | L |
| K5 | HLR/尺寸/表格 | DrawingService | 投影/尺寸/表格 MVP | K4 | XL |
| K6 | 导入导出 job | mesh/DXF/STEP 许可 | STL 往返/作业队列 | J8/L3 | L |
| K7 | PDM/release | 状态机/审批/版本绑定 | 发布记录绑定 checkpoint | D6/D8 | XL |
| K8 | Render/PBR | 渲染 ADR/最小 PBR | 材质/输出/性能 | G0/J8 | XL |

### WS-L 合规/许可

| ID | 工作包 | 交付 | 验收 | 依赖 | 规模 |
|---|---|---|---|---|---|
| L1 | ACIS 分发/InterOp | 许可矩阵/法务确认/第三方通知/出口分类 | 外部用户合法；blocked op fail-closed | G0 | L |
| L2 | libslvs/on-prem | 许可姿态/公开产物审计 | 公开 MS 产物不含 GPL 二进制，或有合规方案 | G0 | M |
| L3 | STEP/IGES/Parasolid | 许可/第三方/自研裁决 | 不越权；能力账本诚实 | G0 | M |
| L4 | TrueForm 许可/迁移 | M1 门禁 | SAB/双后端/回滚 | H10 | M |
| L5 | 数据驻留/隐私/出口 | 合规基线 | 目标市场可审计 | G3 | M |
| L6 | 合规证据/事件响应 | SOC 2/ISO 27001 控制矩阵/证据自动化；访问评审/供应商管理/事件响应/DSR | 控制抽样通过；事故/DSR 演练 | L5/B7 | L |

---

## 4. 阶段计划（指示性）

### Phase 0：决策与证据（1–2 周）

- 完成 G0 决策 + spike。
- 不做功能；只做架构/ADR/spike。
- 产出：09/10、20 个 ADR、16 个 spike 结果、返工登记。

### Phase 1：平台正确性（6–10 周，指示性）

- WS-B、WS-C、WS-D、WS-E 的 P0 部分。
- 目标：G1 全绿；双用户/权限负例/账本/版本/DR 基线通过。
- 此阶段结束前，不做对外分享/多用户；内部单团队可用。

### Phase 2：契约与工作区冻结（6–8 周，指示性）

- WS-F、WS-G、WS-H 的契约/接缝部分；WS-J 的 CI/发布基线。
- 目标：G2 全绿；新特征 ≤3 处、typed tab stub、selection ref、batch pick、format tag、form pilot。
- 此阶段结束前，不铺大量新特征；只允许按冻结契约做试点。

### Phase 3：生产就绪（6–10 周，指示性）

- WS-J 全量、WS-E 灾备、WS-B 租户/审计强化、WS-H 性能/鲁棒性。
- 目标：G3 全绿；单租户生产、受控客户；SLO/DR/渗透/负载通过。

### Phase 4：Part Studio 功能扩展（持续）

- 21 个 FeatureType 逐分支、草图实体/约束、表达式覆盖、UI 对拍、strict 示例。
- 每个特征按 manifest/输出/拓扑契约做；不再新增手写注册点。
- 目标：G4 达标；Part Studio 主要功能有真栈/体积证据。

### Phase 5：专业产品面（独立轨道）

- K1/K4/K6 先行（实例、只读图纸、mesh 导出）；K2/K3/K5/K7/K8 按 ADR/许可/产品目标推进。
- 目标：G5；装配/工程图/PDM/导入导出各自独立账本与证据。

### 4.1 里程碑窗口（相对 Gate 0，不是承诺）

| 里程碑 | 相对窗口 | Gate | 关键结果 |
|---|---|---|---|
| M0 | T0 | G0 | 决策/Spike/目标架构批准 |
| M1 | T0 + 6–10 周 | G1 | 会话/身份/ACL/账本/版本/DR 基线 |
| M2 | T0 + 12–18 周 | G2 | Manifest/输出/拓扑/Workspace/Selection 冻结 |
| M3 | T0 + 18–28 周 | G3 | HA/CI/可观测/SLO/DR/渗透/负载 |
| M4 | G3 后持续 | G4 | Part Studio 功能矩阵/证据 |
| M5 | 独立轨道 | G5 | 装配/工程图/PDM/导入导出 |

### 4.2 前 30 天执行清单（建议）

**第 1 周：冻结与基线**
- 宣布“架构冻结期”：只做维护/spike/平台修复，不开新功能波次。
- 成立 ARB；指定 B/C/D/F/G/H/J 工作流 owner。
- 完成 09/10 评审；建立 ADR 模板、单行道登记、Gate 仪表。
- 建立当前基线：双用户串线、账本故障注入、checkpoint/fork、输出/拓扑、pick/tile 的失败复现。

**第 2 周：Spike 与决策**
- 跑 S0-1～S0-16；每个 spike 有通过/失败/停止结论。
- 确定会话/进程模型、账本/fork 顺序、输出/拓扑契约、SAB 标签、渲染/导入边界。
- 安全威胁模型/数据分类/租户边界评审。

**第 3 周：P0 实现启动**
- C1/C2/C3 会话隔离；B1/B2/B3 身份/ACL 骨架；D1/D2 账本不可变/恢复。
- F1/F2 manifest 与 opDsl 修复；H1 format tag；J1 CI 矩阵补 native ctest/接口冻结。
- E 单机备份/恢复临时基线（pg_dump/卷快照/校验和/异机；RPO≤24h 临时）；J3 release manifest 草案。
- 每个 PR 按 10.1 检查单。

**第 4 周：联调与 Gate 预检**
- 双用户/权限负例/账本故障/版本打开联调。
- 输出/拓扑、typed tab、selection ref、batch pick spike 集成。
- Gate G1 预检：红项列表、阻塞项、下一轮计划；未过不进入功能开发。
- 预检必须包含：clone 内容、mid-history checkpoint fork、冷开 200/1000、DB+对象存储恢复、读路径写事务、缓存泄漏。

---

## 5. Gate 验收标准

### G0

- [ ] 09 目标架构、10 计划、ADR 索引批准。
- [ ] 16 个决策有记录、备选、失败判据。
- [ ] 16 个 spike 有结论；失败项有停止/改方案。
- [ ] 单行道登记零未决（或明确 Gate 负责人）。
- [ ] ACIS 分发/libslvs GPL/STEP 许可有法务书面结论；未决则停止对外分发。

### G1

- [ ] 双用户（含只读）打开同文档：不互踢、不串 IPC、不串命令。
- [ ] 非成员经所有入口（下载/打开/FeatureOp/直改/push/导出/openBriefcase/progress/retry/对象存储/WA）403。
- [ ] inactive/locked/soft-deleted 账号在登录/RPC/WS 全入口拒绝；公开自助注册关闭或受控。
- [ ] token 不出现在 URL/console/nginx 日志；登出同时失效 access 并关闭 WS；撤权后下一次 IPC/RPC/WS 请求 403。
- [ ] groups/shares/link share 要么真正执行，要么从 UI/API 删除；不得保留“假分享”。
- [ ] WA 管理/调试端点已认证且不对外；Azurite/DB/Redis 不使用公开默认密钥、不暴露公网；入口 TLS。
- [ ] changeset 不可变：无父根/改 parent/挖洞删除拒绝；DB 层 append-only；complete 校验 blob+size+SHA-256；未完成行不暴露；hash chain 可验证。
- [ ] 悬挂 changeset 故障注入后 push 可恢复；Named Version 不是 Scheduled 幽灵行；未 ready 返回 409。
- [ ] Named Version 有真实 checkpoint（manifest/readback）；可按 version read-only 打开；restore 生成新 head 不改历史。
- [ ] checkpoint 后 fork 不 FK 失败；fork Duplicate 复制当前内容（不是空 baseline）；History 语义可验证；跨 iTwin 明确。
- [ ] 200/1000 changeset 冷开基线有 p50/p95；checkpoint 后打开时间在目标内。
- [ ] 读路径不隐式 rebuild/写库；交互写成功与 hub 持久化的窗口有明确恢复语义；pull 后缓存失效；undo 按 user/briefcase 隔离。
- [ ] 备份/PITR + 对象存储版本化/跨区；DB 快照与对象 manifest 成套恢复演练通过；RPO≤5m/RTO≤1h 有记录。
- [ ] 真实 userId 进入 changeset/briefcase/OpLog/audit。
- [ ] G1 期间没有新增依赖未决架构的功能。

### G2

- [ ] Feature Manifest 覆盖 21 类型；opDsl/typecheck 全绿（draft 不丢）。
- [ ] 新特征试点：≤3 个注册点（manifest/evaluator/可选 UI）。
- [ ] FormRuntime 试点对拍；不替换旧 UI 也无回归。
- [ ] 输出端口/多输出 spike 通过；拓扑引用带 body/scope；插入/删除不静默错命中。
- [ ] typed Tab/TabDirectory/listTabs 兼容旧文档；stub tab 不改 Part Studio。
- [ ] SelectionRef document/occurrence/vertex 字段冻结；双会话状态隔离。
- [ ] CommandRegistry 一处注册、五处出现；Form pilot 可生成字段。
- [ ] 批量 TopologySnapshot/PickBatch 500 面预算；BRep→tile 测试绿。
- [ ] format/kernel 标签、facet face/edge ID 预留、精确质量属性口径。
- [ ] interface-freeze/op 枚举/ctest CI 全绿。

### G3

- [ ] CI/CD 全矩阵（含 backend 全量 feature 测试、native ctest、真栈、web 生产 build、BFF、契约、接口冻结、SBOM、安全扫描）；发布候选不得跳过全量 e2e；interface-freeze 不为红。
- [ ] MS 构建可复现：无宿主绝对路径依赖、lockfile 冻结、类型检查（不允许 `--noCheck`）、native provenance 与 HEAD 一致且无本地路径。
- [ ] release manifest（tag+digest+源 commit+契约版本+SBOM digest+native provenance）唯一部署源；`/rpc/metadata`/镜像 label/manifest 三方一致；源码/发布会话契约版本不得漂移。
- [ ] 产物 provenance/SBOM/镜像签名可对账；镜像/基础设施 digest 钉版，生产不使用 `latest`；Node 版本/基础镜像钉版。
- [ ] MS 以 Windows 服务/守护方式运行，支持优雅停机/重启/故障恢复；版本化目录 + 原子升级 + N-2 保留；不是手工用户进程 + `Stop-Process -Force`。
- [ ] staging/prod 同形态；secrets/配置 schema 校验；无宿主 dist 遮蔽；生产无 maildev/公开默认密钥/HTTP/0.0.0.0 暴露。
- [ ] 日志/指标/追踪/审计/SLO/告警/on-call 就绪；requestId 贯穿 nginx→BFF→MS→hub；readiness 检查依赖；日志轮转。
- [ ] 代理后 per-user/tenant 限流正确（MS `trust proxy`），`/ipc` 有背压/限流；直连不可绕过。
- [ ] 负载/soak/chaos：目标并发/文档/模型规模达标；200/1000 changeset 冷开 p95；24h soak 无泄漏；故障切换通过。
- [ ] 容量/配额/生命周期：租户/用户/文档/存储/日 changeset/会话配额；checkpoint/GC/oplog 分页；tile 孤儿清理；缓存上限/关闭清理。
- [ ] Redis/队列 HA；WA 队列落持久卷；Hub cron 分布式幂等；Redis 满不静默丢事件。
- [ ] HA/多实例：双实例不双写；外部 lease/fencing；session router/sticky；故障恢复；零停机升级无数据丢失。
- [ ] 迁移：schema/params 版本化；旧 fixture；dry-run/verify/rollback；迁移前备份/审批。
- [ ] 渗透测试 0 critical；权限/租户负例全绿；`openBriefcase`/任意 key/任意 iModelId 负例全拒。
- [ ] IdP/SSO/MFA/SCIM、访问评审、审计导出 SIEM、数据保留/DSR 流程可用（企业客户前）。
- [ ] 分支保护/CODEOWNERS/签名提交/发布审批/安全与许可签字；SOC 2/ISO 控制矩阵与证据可重复生成。
- [ ] DR 演练：RPO≤5m/RTO≤1h；DB+对象存储成套恢复；checkpoint/账本恢复。
- [ ] 发布/回滚/事故 runbook 演练；升级失败自动回退；数据零丢失。

### G4

- [ ] 21 个 FeatureType 的目标分支有 full/blocked 结论；无假 full。
- [ ] 草图实体/约束/表达式覆盖目标；旧库 fixture 全绿。
- [ ] 特征图插入/删除/重排/回滚/多输出按目标工作。
- [ ] preview/apply 单一 plan；UI/API/AI undo 一致。
- [ ] 真栈示例/体积金标/冷重开/失败语义全绿。
- [ ] 性能预算：大草图/多 body/大模型在目标范围。

### G5

- [ ] 装配实例/BOM/Where Used/权限/版本引用通过。
- [ ] Drawing 只读→HLR→尺寸/表格按阶段通过。
- [ ] 导入导出 mesh/DXF/许可内格式；STEP 许可裁决。
- [ ] PDM release 绑定 checkpoint/审批/审计。
- [ ] 各域独立能力账本/证据，不混入 Part Studio。

---

## 6. 依赖与关键路径

```
G0 决策
 ├─ 会话隔离(C) ── 身份/ACL(B) ── 账本(D1/D2) ── checkpoint(D4) ── version open(D5) ── refs(D8)
 ├─ manifest(F1) ── output/topology(F4/F5) ── graph(F6) ── feature breadth(G4)
 ├─ typed tab(G1) ── workspace(G2) ── selection(G5) ── assembly/drawing(K)
 ├─ data/DR(E1/E2) ── HA/queue(J8) ── production(G3)
 ├─ format tag(H1) ── facet ID(H3) ── batch pick(H4) ── assembly perf
 └─ CI(J1) ── provenance(J3) ── production release
```

**不可并行/不可跳过**：
- 会话隔离 × 任何分享/多用户。
- 账本冻结 × checkpoint/fork/版本。
- manifest/output/topology × 大量特征分支。
- typed tab/selection × 装配/工程图。
- SAB 决策 × TrueForm。
- 许可裁决 × STEP/DWG。
- HA/DR × 对外生产承诺。

---

## 7. 返工风险登记（必须在 G0/G1/G2 关闭）

| 单行道 | 现在不定会怎样 | 决策 Gate | 需要的证据 |
|---|---|---|---|
| 文档/工作区模型 | 每加 tab 类型改全链 | G2 | typed Tab stub + 旧库兼容 |
| 输出端口/多输出 | 每个特征写回要重做 | G2 | split/mirror 多输出 spike |
| 拓扑引用身份 | 插入/删除后静默错命中 | G2 | 交叉 body/插入/分裂测试 |
| 会话隔离 | 多用户互踢/串库 | G1 | 双用户 e2e |
| 账本不可变/恢复 | 版本/发布/审计不可信 | G1 | 故障注入/恢复 |
| checkpoint/版本打开 | 版本引用不可解析 | G1 | 200 changeset 冷开 |
| undo 所有权 | B 撤销 A | G1/G3 | 双编辑者 undo |
| SAB/格式标签 | TrueForm 切换不可行 | G0/G2 | 旧 fixture + 标签 |
| 渲染/PBR 路线 | 材质 UI 返工 | G0/G3 | PBR/离线 ADR |
| 导入许可 | STEP 承诺不可实现 | G0 | 许可/第三方裁决 |
| 进程/HA 模型 | 多实例双写 | G1/G3 | 双实例/故障切换 |
| 灾备/存储等级 | 单卷丢失即永久丢历史 | G1 | DR 演练/RPO/RTO |
| 发布单元/版本 | web/MS/hub 漂移导致全 Feature 面失败 | G3 | manifest/契约门 |
| params/native 迁移 | 旧文档冷开坏、无法回滚 | G1/G3 | 旧 fixture/dry-run |
| 用户归因 | 审计/撤销/计费全部失真 | G1 | on-behalf-of + 负例 |
| 变更管理/职责分离 | 发布证据不可审计、门禁可被绕过 | G3 | 分支保护/签名/审批演练 |

---

## 8. 团队与并行

**最小工业级团队角色**：
- 架构 owner（跨仓契约/ADR/Gate）
- 平台/安全工程师（身份/ACL/会话/审计）
- 后端/数据工程师（账本/checkpoint/DR/作业）
- Native/几何工程师（拓扑/facet/tile/实例/TrueForm）
- 前端/编辑器工程师（Workspace/Selection/Form/Command）
- QA/自动化（真栈/负载/安全/故障注入）
- SRE/运维（CI/CD/观测/HA/DR/发布）
- 产品/法务（范围/许可/合规）

**Architecture Review Board（ARB）**：架构 owner + 安全 + SRE + QA + 产品；负责批准 ADR、Gate、单行道变更。ARB 未批准，不允许进入依赖该决策的功能开发。

> 若没有独立安全/SRE/QA：必须缩减范围或引入外部评审/服务；不能由开发兼任后“自己签字”，否则 G1/G3 的门禁不成立。

**并行建议**：
- G1：B（身份/ACL）与 C（会话）、D（账本）可并行，但 D 依赖 B 的用户身份。
- G2：F（manifest/output）与 G（workspace/selection）、H（batch/format）可并行；F6 图执行器可与 G4 功能并行。
- G3：J（CI/HA/可观测）与 E（DR）必须并行；安全/渗透独立。
- G5：装配/工程图/导入/PDM 各自独立 owner，不共享同一波次。

---

## 9. 架构适应度函数（Gate 仪表）

| # | 指标 | 目标 | 失败动作 |
|---|---|---|---|
| AF1 | 新 FeatureType 注册点 | ≤3（manifest + evaluator + 可选 UI） | 停止新增特征，先做 F1 |
| AF2 | opDsl/类型检查覆盖 | 100% FeatureType；CI 红阻断 | 修 F2 |
| AF3 | 前端消费 FormModel | 新特征 100% | 修 F3 |
| AF4 | 新 WorkspaceKind 改 Part Studio | 0 处 | 修 G1/G2 |
| AF5 | 双用户同文档 | 0 互踢/0 串响应 | 修 C1/C2 |
| AF6 | 权限负例 | 0 绕过 | 修 B3 |
| AF7 | 账本不可变/恢复 | 0 未恢复 | 修 D1/D2 |
| AF8 | 版本打开 | 100% 可打开 | 修 D4/D5 |
| AF9 | 冷开 200 changeset | 预算内 | 修 D4 |
| AF10 | 输出/拓扑 spike | 通过 | 修 F4/F5 |
| AF11 | 500 面 pick p95 | 预算内 | 修 H4 |
| AF12 | 100 body tile | 预算内 | 修 H5 |
| AF13 | 发布 provenance/SBOM | 100% 可对账 | 修 J3 |
| AF14 | native ctest/接口冻结 | 全绿 | 修 J1/H9 |
| AF15 | 渗透/租户负例 | 0 critical/0 跨租户 | 修 B9/B10 |
| AF16 | DR 演练 | RPO/RTO 达标 | 修 E3/J9 |
| AF17 | 新特征回归面 | 单测/真栈全绿 | 停止发布 |

---

## 10. 执行规则（防止“计划变口号”）

1. **功能冻结**：G0/G1 未过，不进入全功能开发；只允许维护、spike、平台修复。
2. **单行道 ADR**：没有 ADR/原型/回滚，不得写依赖该决策的功能。
3. **每包三件套**：代码/配置、测试/证据、回滚/迁移；缺一不合并。
4. **Gate 评审**：每个 Gate 由架构/安全/SRE/QA/产品共同签字；红项不得用“后续补”。
5. **诚实能力账本**：不支持/未实现/近似/blocked 必须登记；禁止假 full。
6. **发布门**：provenance/SBOM/interface-freeze/权限负例/DR 演练未绿不发布。
7. **变更控制**：Gate 后修改单行道需重新评审，不允许“顺手改”。
8. **度量返工**：统计每功能触及文件数、迁移数、事故数；趋势不降则停止扩张。

---

## 10.1 每个功能/PR 的架构检查单

任何进入实现的功能必须逐项回答；回答不了就不合并：

1. **数据/契约**：是否改变 FeatureOp/schema/params？是否有 `paramVersion/schemaVersion`、迁移、旧 fixture、回滚？
2. **单行道**：是否触碰文档模型、输出契约、拓扑身份、账本、会话、SAB、渲染、许可？是否已有 ADR/批准？
3. **特征**：是否新增 FeatureType？是否只加 manifest/evaluator？是否声明 inputs/outputs/structuralKeys？是否覆盖多输出/拓扑引用？
4. **工作区**：是否新增 Tab/WorkspaceKind？是否通过 WorkspaceModule 注册？是否改 Part Studio 内部？
5. **选择/UI**：是否新增选择类型/字段？是否用 SelectionRef/SelectionDomain？是否用 FormRuntime/CommandRegistry？
6. **权限/会话**：是否新增入口？是否做 per-doc ACL、token、审计、限流、会话隔离？
7. **作业/规模**：是否新增长任务？是否走队列、幂等、可取消、超时、重试？
8. **几何/native**：是否新增 op？是否 ctest/接口冻结/provenance/下游回归？
9. **数据/灾备**：是否新增持久状态/索引/对象？是否备份、恢复、删除、迁移、配额？
10. **发布/安全**：是否影响产物/SBOM/依赖/许可/攻击面？是否有回滚/灰度和负例测试？
11. **证据**：是否有单测/StandaloneDb/真栈/失败/恢复/性能证据？是否登记能力状态？
12. **返工**：这个改动是否会让未来多输出/多文档/多用户/大模型更难以实现？如果会，先改架构。

---

## 11. 什么算“架构已经够正确，可以开始全功能”

必须同时满足：

- G0/G1/G2/G3 全绿；
- 12 条架构不变量有 CI/评审强制；
- 16 个单行道全部关闭或有明确 Gate/负责人；
- 新特征 ≤3 注册点、typed tab、selection ref、输出/拓扑合同通过；
- 双用户/权限/账本/版本/DR/发布/负载/安全测试通过；
- 没有已知 P0 返工风险；
- 团队可以在不改 Part Studio 内部的情况下加一个 WorkspaceModule；
- 可以在不改执行器的情况下加一个多输出特征；
- 可以打开/恢复/审计一个历史版本。

**达不到这些，不开全功能。**

---

## 12. 架构冻结交付物清单

在 G2 结束前，必须存在并可评审：

| # | 交付物 | 负责 | 验收 |
|---|---|---|---|
| 1 | 目标架构（09） | 架构 | 评审通过 |
| 2 | 本计划（10） | 架构/PM | 评审通过 |
| 3 | 20 个 ADR（含备选/回滚/失败判据） | 各 owner | 无未决单行道 |
| 4 | 数据模型/EC schema/迁移矩阵 | 后端/平台 | 旧 fixture 通过 |
| 5 | 接口/契约目录与冻结清单 | 平台 | shared/native/hub 全量 |
| 6 | 威胁模型/数据分类/权限矩阵 | 安全 | P0 威胁有控制 |
| 7 | SLO/容量模型/RPO/RTO | SRE/产品 | 目标可验收 |
| 8 | CI/CD/发布/回滚/DR runbook | SRE | 演练通过 |
| 9 | 观测/审计/告警/on-call 方案 | SRE/安全 | 可观测性演练 |
| 10 | 架构适应度函数/Gate 仪表 | 架构/QA | 可自动化 |
| 11 | Feature Manifest/输出/拓扑契约 | 特征平台 | spike 通过 |
| 12 | Workspace/Tab/Selection/Command 契约 | 前端/平台 | stub/兼容测试 |
| 13 | 安全/许可/SBOM/合规证据 | 安全/法务 | 许可矩阵签字 |
| 14 | 返工风险登记/关闭证据 | 架构 | 每项有 Gate/负责人 |

---

## 13. 最终判断

- 当前架构是**可工业化的底座**，但不是工业级产品；差距是平台工程，不是几何内核。
- 正确的开发顺序不是“先做全功能再补架构”，而是：
  **决策 → 会话/身份/账本/灾备 → 契约/工作区/特征图/选择 → 生产化 → Part Studio 深度 → 装配/工程图/PDM/导入导出。**
- 只要 Gate 0–3 严格执行，后期就不会在单输出、单文档、单 briefcase、手写契约、无灾备这些点上返工。
- “绝对正确”不能证明，但可以做到：**所有已知单行道已裁决、所有承重假设已验证、所有失败可恢复、所有能力诚实登记。**
