# G1 执行计划：平台正确性

> 状态：**Proposed / 待 G0 GO**（2026-11-22）
> 入口：`G0-EXECUTION-PLAN.md` 通过 G0 Gate（GO 或 CONDITIONAL GO 且无 blocking 单行道）
> 目标：把会话、身份/ACL、账本/版本、灾备、CI/契约基线做到可验证，再进入 G2 契约冻结。
> 原则：**G1 期间不铺 Part Studio 新功能、不对外分享、不做多用户生产承诺。**
>
> 实施级设计：会话隔离见 `SESSION-ISOLATION-DESIGN.md`；身份/ACL 见 `IDENTITY-ACL-DESIGN.md`；checkpoint/clone-fork 见 `CHECKPOINT-GENERATOR-DESIGN.md`。设计不等于 AIRR/ADR，开工切片仍按 P0-04 走审批。

## 1. 范围与不在范围

### 在范围

- 会话隔离：IPC、briefcase、Editor、undo、写租约。
- 身份/授权：账号生命周期、on-behalf-of、per-doc ACL、token/WS 生命周期、审计。
- 账本/版本：不可变 changeset、悬挂恢复、clone/fork、checkpoint、版本只读打开。
- 数据/灾备：备份/PITR、对象存储版本化、恢复演练、迁移基线。
- 发布/CI：interface-freeze、全量测试/ctest、可复现构建、release manifest、契约对账。

### 不在范围

- 新 FeatureType/草图工具/UI 功能波次。
- 装配/工程图/PDM/导入导出实现。
- 实时协同/presence/评论。
- 多租户公网 SaaS 的生产承诺；G1 只做租户边界与负例。

## 2. 时间与节奏（指示性）

```text
Sprint 1（第 1–3 周）：会话隔离 + 身份骨架 + 账本不可变 + CI/契约门
Sprint 2（第 4–6 周）：checkpoint/clone/版本打开 + token/审计 + DR 基线
Sprint 3（第 7–9 周）：Named Version/restore + 租户/网络 + 迁移/恢复演练
Hardening（第 10 周）：G1 全量回归、故障注入、Gate 评审
```

- 每个 Sprint 结束有一次可演示增量；未通过的项不得滚入下一 Sprint 当作“已完成”。
- 关键路径：**C1→C2→C3/D1→D2→D4→D5**；B3/B2 是 C/D 的前置；E1/E2 可与 D 并行。
- 所有工作包必须有测试与证据；平台修复也必须真栈验证。

## 3. 工作流与关键路径

| 工作流 | 工作包 | 目标 |
|---|---|---|
| WS-C 会话 | C1–C7 | 每 session 独立 IPC/briefcase/Editor/undo；外部 lease/fencing |
| WS-B 身份/安全 | B1–B10 | 真实身份、per-doc ACL、token 生命周期、审计、网络收敛 |
| WS-D 账本/版本 | D1–D10 | 不可变账本、恢复、clone/fork、checkpoint、版本打开、引用 |
| WS-E 数据/灾备 | E1–E8 | 备份/PITR、对象版本化、恢复演练、迁移 |
| WS-J 发布/CI | J1–J7 | 全量 CI、可复现构建、release manifest、契约门 |

**依赖**：

```text
B1/B2 ── B3 ── C1/C2/C3 ── C5/C6/C7
             └─ D1/D2 ── D3/D4/D5 ── D6/D7/D8
E1/E2 ── E3/E5
J1 ── J2/J3 ── J4
```

## 4. Sprint 1 任务单（第 1–3 周）

> Sprint 1 目标：**第二用户不会串线；账本不能改写；CI 冻结门能阻断错误发布。**
> 任务完成定义：代码 + 单测/契约 + 真栈或故障注入证据 + 文档/例外更新。

### 4.1 WS-C 会话隔离

| ID | 任务 | 交付/验收 | 依赖 | 规模 |
|---|---|---|---|---|
| C1.1 | 连接上下文 | 每 WS/IPC 连接绑定 user/session/tenant；日志可关联 | B1 | M |
| C1.2 | per-connection 路由 | 响应只回请求连接；requestId 按连接域隔离 | C1.1 | L |
| C1.3 | 移除全局广播 | `/ipc`/`/ws` 不再向所有连接广播；进度按订阅路由 | C1.1 | M |
| C1.4 | 双连接负例 | 两客户端同时请求，抓包证明响应归属；无串线 | C1.2/C1.3 | S |
| C2.1 | per-session briefcase key/file | briefcase 文件名/key 含 session/user；不共享缓存槽 | C1.1 | L |
| C2.2 | owner 校验 | close/save/pull/push/undo 校验 session/user 所有权 | C2.1 | M |
| C2.3 | 双用户同文档 | 两个用户打开同一文档互不关闭；只读独立 | C2.1/C2.2 | M |
| C3.1 | Editor 命令绑定 | 命令按 session 绑定；禁止全局单槽接管 | C2.1 | L |
| C3.2 | undo 所有权 | undo 按 user/briefcase 过滤；B 不能回退 A | C3.1 | M |
| C3.3 | 直改门禁 | 直改走同一租约/ACL/审计；越权 403 | B3/C3.1 | M |

### 4.2 WS-B 身份/安全骨架

| ID | 任务 | 交付/验收 | 依赖 | 规模 |
|---|---|---|---|---|
| B1.1 | 账号生命周期 | inactive/locked/deleted 在登录/RPC/WS 全入口拒绝 | — | M |
| B1.2 | token/WS 基线 | 登出失效 access + 关闭 WS；连接后复验；jti/denylist 设计 | B1.1 | L |
| B2.1 | on-behalf-of 设计 | 用户路径 token exchange/短时委托；后台 service identity 拆权 | B1.2 | M |
| B2.2 | 真实归因 | changeset/briefcase/OpLog/audit 写入真实 user/session | B2.1 | L |
| B3.1 | 入口清单/PEP | 下载/打开/读树/FeatureOp/直改/push/export/checkpoint/tile 全入口 | B2.1 | M |
| B3.2 | per-doc ACL 骨架 | 非成员/只读写/跨项目负例全 403 | B3.1 | L |

### 4.3 WS-D 账本不可变

| ID | 任务 | 交付/验收 | 依赖 | 规模 |
|---|---|---|---|---|
| D1.1 | PATCH 白名单 | 仅允许受控字段；改 parentId/index/id 400 | — | M |
| D1.2 | 父链约束 | 除 genesis 外必须有同 iModel parent；无父第二根拒绝 | D1.1 | M |
| D1.3 | DELETE 守卫 | 有子节点/NV/checkpoint 引用拒绝；不软删挖洞 | D1.2 | M |
| D1.4 | complete 校验 | blob 存在/大小/SHA-256；失败不置 fileUploaded | D1.1 | L |
| D1.5 | 列表过滤 | 未完成/悬挂行不暴露为可下载 changeset | D1.4 | S |
| D1.6 | append-only 兜底 | DB 只读角色/触发器/权限禁止 UPDATE parentId/blob | D1.1 | M |
| D1.7 | hash chain | `prevHash/SHA-256/size` 链校验；下载/恢复可验证 | D1.4 | L |
| D2.1 | 悬挂恢复 | waitingForFile 超时/重用/回收；不阻塞链头 | D1.1 | M |
| D2.2 | 崩溃注入 | create→complete 失败后重试 push 成功 | D2.1 | M |

### 4.4 WS-J CI/契约基线

| ID | 任务 | 交付/验收 | 依赖 | 规模 |
|---|---|---|---|---|
| J1.1 | interface-freeze 修复 | `SolverTypes.ts`/`LubanCadSchema.ts` 红项清零或登记例外 | — | S |
| J1.2 | CI 契约门 | shared/Feature RPC 版本/hash 变化阻断合并 | J1.1 | M |
| J1.3 | CI 全量基线 | backend 全量测试、web 生产 build、BFF、editor-backend | — | L |
| J1.4 | native ctest | self-hosted Windows runner 跑 ctest | — | L |
| J1.5 | e2e 策略 | 发布候选跑全量 e2e；清单基线由 CI 生成 | J1.3 | M |
| J3.1 | release manifest 草案 | tag+digest+源 commit+契约版本+native provenance | J1.2 | M |
| J3.2 | 契约对账 | `/rpc/metadata`/镜像 label/manifest 三方一致 | J3.1 | M |

### 4.5 Sprint 1 退出标准

- [ ] 双用户打开同一文档不互踢、不串 IPC/命令/undo。
- [ ] 非成员经所有入口 403；直改受 ACL/租约/审计。
- [ ] changeset 改 parent/无父根/挖洞/无 blob complete 全部拒绝；崩溃后 push 可恢复。
- [ ] interface-freeze 不再红；CI 至少覆盖 backend 全量 + web 生产 build + native ctest。
- [ ] 所有新增行为有单测/契约/真栈或故障注入证据。
- [ ] 没有新增 Part Studio 功能代码。

## 5. Sprint 2 任务摘要（第 4–6 周）

| 工作包 | 任务 | 验收 |
|---|---|---|
| D3 clone/fork | Duplicate/Fork with history 双语义；mid-history checkpoint 不 FK 失败 | clone 内容正确；History 语义可验证 |
| D4 checkpoint worker | 每 N（100–500）/Version 异步生成；manifest/readback/per-iModel 串行 | 200/1000 changeset 冷开基线 |
| D5 version open | openCheckpoint/version 参数；按 changesetId/versionId 只读打开 | 版本几何/树正确，head 不变 |
| B5 token 全生命周期 | URL/console/log 零 token；登出/撤权/改密即时生效 | 旧 token/旧 WS 下一次请求 403 |
| B6 secrets/KMS | 移除 well-known 密钥；DB/对象存储 TLS；按服务拆权 | 扫描无泄露；轮换演练 |
| B7 审计 v1 | append-only/WORM/hash chain；高风险操作阻断 | 按 user/doc/time 可查；篡改可检测 |
| C5 外部 lease/fencing | 写租约外置；session router/tie-break | 双实例不双写 |
| C6 路径/所有权 | openBriefcase 白名单/规范化；close/save/undo owner | 越权路径/key 403 |
| E1/E2 DR 基线 | Postgres PITR + 对象存储版本化/跨区 | 恢复演练通过；RPO/RTO 记录 |
| E8 完整性 | scrubber/DB↔storage reconciler/链修复 job | 损坏检测/隔离/修复演练 |

## 6. Sprint 3 任务摘要（第 7–9 周）

| 工作包 | 任务 | 验收 |
|---|---|---|
| D6 Named Version | 绑定真实 checkpoint；未 ready 409；事件/计数 | 打开/不可变/删除保护 |
| D7 restore/compare | restore 为新 head；compare 元素/特征级 diff | 恢复不改历史；diff 正确 |
| D8 Version/Tab/Refs | 引用键统一 changesetId/versionId | Assembly/Derived 可钉版本 |
| B4 groups/shares/link | 真正执行或从 UI/API 删除；缓存失效 | 组/链接/撤销/deny 负例 |
| B8 网络/限流/WAF | TLS/HSTS/CSP；WA 认证；DB/Redis/Azurite 不公网；trust proxy | 外部端口最小化；per-user 限流 |
| B10 租户隔离 | tenantId/RLS/前缀/KMS/配额 | 跨租户负例全拒 |
| C7 会话恢复 | 从 checkpoint 水化；故障接管 | 崩溃/重启可恢复 |
| E3/E4/E5 迁移/演练 | 恢复 runbook；schema/params 版本化；旧 fixture；迁移 CLI | 旧库可读；dry-run/rollback |
| J2/J4 发布/staging | 可复现构建、digest 钉版、staging 同形态 | 同源重建同 digest；无 latest |

## 7. G1 Gate 验收

- [ ] 双用户（含只读）同文档：不互踢、不串 IPC/命令/undo。
- [ ] 非成员经所有入口（下载/打开/FeatureOp/直改/push/导出/openBriefcase/progress/retry/对象存储/WA）403。
- [ ] inactive/locked/soft-deleted 账号全入口拒绝；公开自助注册关闭或受控。
- [ ] token 不进 URL/console/nginx 日志；登出失效 access 并关闭 WS；撤权后下一次请求 403。
- [ ] groups/shares/link 真正执行或删除；无假分享。
- [ ] changeset 不可变：无父根/改 parent/挖洞拒绝；DB append-only；complete 校验 blob+size+hash；未完成行不可见。
- [ ] 悬挂 changeset 故障注入后 push 可恢复；Named Version 不是 Scheduled 幽灵行。
- [ ] Named Version 有真实 checkpoint；可按 version/changeset 只读打开；restore 生成新 head。
- [ ] checkpoint 后 fork 不 FK 失败；Duplicate 复制当前内容；History 语义可验证。
- [ ] 200/1000 changeset 冷开 p50/p95 有基线；checkpoint 后打开在目标内。
- [ ] 读路径不隐式 rebuild/写库；pull 后缓存失效；undo 按 user/briefcase 隔离。
- [ ] 备份/PITR + 对象存储版本化；DB+对象存储成套恢复演练通过；RPO≤5m/RTO≤1h 有记录。
- [ ] 真实 userId 进入 changeset/briefcase/OpLog/audit。
- [ ] interface-freeze/CI/契约门全绿；发布候选不跳全量 e2e。
- [ ] 没有新增依赖未决架构的功能。

## 8. 完成定义（DoD）

每个工作包必须同时满足：

- 设计：引用 ADR/决策；失败判据/回滚方式明确。
- 实现：标准基类/IPC/事务/事件；无第二套状态机。
- 测试：单元/契约 + 真栈或故障注入；失败路径覆盖。
- 证据：可复现命令、日志/截图/计时；私有证据已脱敏。
- 文档：接口冻结/例外/能力账本/文档索引同 PR。
- 回滚：功能开关/数据迁移回滚/旧版本兼容说明。
- 安全：权限/租户/审计负例；无密钥/私有路径泄露。

## 9. 风险与升级

| 风险 | 触发 | 处理 |
|---|---|---|
| 会话隔离改动面过大 | C1/C2/C3 牵动全局单例 | 先 process-per-document actor，避免单进程多会话硬改 |
| 账本迁移破坏历史 | D1/D2 改约束 | 先在隔离库跑迁移+旧 fixture；备份/回滚 |
| checkpoint worker 性能 | 大历史/并发 | per-iModel 串行、队列、限流；先做基线 |
| DR 环境缺失 | 无备份/恢复环境 | 升级 SRE；不得用“未验证”通过 G1 |
| 身份改造阻塞功能 | B2/B3 未完成 | 功能冻结；先做单用户平台修复，不对外分享 |
| 许可未决 | ACIS/libslvs/STEP | 法务书面结论前不发布；blocked op fail-closed |

## 10. 明确不做

- 不在 G1 新增 Part Studio 特征/草图工具/UI 波次。
- 不在 G1 做实时协同、评论、presence、Follow。
- 不在 G1 做装配 Mate/工程图 HLR/PDM 发布。
- 不在 G1 宣称多租户 SaaS/生产 SLA。

---

**关联**：`G0-EXECUTION-PLAN.md`、`G0-DECISION-REGISTER.md`、`G0-SPIKE-REGISTER.md`、`../research/lubancad-architecture-assessment/09-INDUSTRIAL-TARGET-ARCHITECTURE.md`、`10-ARCHITECTURE-HARDENING-PLAN.md`。
