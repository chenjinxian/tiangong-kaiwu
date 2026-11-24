# 规则例外与债务登记

> 规则依据：`docs/DEVELOPMENT-RULES.md` §5。  
> **P0 例外不是永久豁免**：必须有 owner、理由、失效日期、退出计划。到期未修复必须升级为正式架构决策或停止相关功能。
> 本表只列公开可说明的例外；后端/原生源码级证据在私有仓。
> **确认日期：2026-11-04（owner 确认）**；X-01/X-02/X-03 为第一轮清理项，目标 2026-12-31。

| ID | 规则 | 例外/债务 | 当前影响 | Owner | 失效日期 | 退出计划 |
|---|---|---|---|---|---|---|
| X-01 | P0-05 | 旧 `LubanRpcInterface.startEditCommand/callEditMethod/finishEditCommand` 与标准编辑管道并存 | 存在第二套建模 API；新工具可能误用 | 平台/编辑器 | 2026-12-31（已确认） | **已关闭（2026-11-04）**：MirrorElements 改 `EditTools`+`basicManipulationIpc`；删除死工具 CreateHole/DraftFaces；shared 1.1.0/后端删除三方法；`hole` 翻 gated；产品代码 0 调用。发布前置：MS 产物重建（非代码债） |
| X-02 | P0-05/P1-01 | 两套草图创建工具族（editor 工具 + app `SketchCreateTool`） | 同一能力双实现，行为/数据路径分叉 | 编辑器/草图 | 2026-12-31（已确认） | **已关闭（2026-11-04）**：`EditTools.initialize({registerSketchTools:false})` + viewer 注册表删除原生草图六件；产品唯一族=`Sketch.*`；真栈 Tutorial2 草图阶段 18 实体/48 约束/9 尺寸通过 |
| X-03 | P1-01 | `store.canvas.selection` 与 `connection.selectionSet` 双选择权威 | 手工同步、undo/redo 快照恢复复杂 | 编辑器/选择 | 2026-12-31（已确认） | **已关闭（2026-11-04）**：store 唯一权威；`internal/selection-authority.ts` 唯一投影写点；删除反向桥与分散直写；真栈 `newbody` 选择/删除/undo/redo 通过 |
| X-04 | P1-02 | 自建 `useFeatureDisplaySync` 失效克隆、自定义事件总线 | 依赖 core 内部实现，升级易碎 | 前端/平台 | 2027-03-31（已确认） | 接标准 `ModelChangeMonitor`/`BriefcaseTxns` 事件 |
| X-05 | P0-10 | 草图 `insertSketch`/`updateSketch` 等整体覆写 op 非 invertible | Undo 不完整；与“可撤销硬约束”冲突 | 后端/草图 | 2026-12-31（已确认） | 补可逆 op 或正式 HITL + 审计；更新能力声明 |
| X-06 | P0-05/P1-11 | `WriteLease` 为单进程 30s 内存租约 | 多 MS 实例/重启后不一致 | 后端/平台 | 多实例立项前 | 单实例假设写入 ADR；多实例前换持久租约 |
| X-07 | P0-08/P0-09 | 原生接口目前是静态 ABI；真形（TrueForm）几何内核第二后端未落地 | 真形（TrueForm）几何内核替换需链接期 ABI 或重构；无双后端一致性证据 | Native/架构 | 2027-03-31（季度复核） | 冻结 `SolidKernel.h`、加后端选择开关、建双后端一致性套件 |
| X-08 | P0-09 | libslvs 为 GPL-3.0-only，当前仅纯云 SaaS 姿态 | on-prem/客户端交付红线 | 后端/合规 | 绳墨平替或合规方案落地前 | 禁止打包进客户侧产物；SBOM/许可门；绳墨替换 |
| X-09 | P1-07 | backend feature/native/editor-backend 未进托管 CI | 发布门依赖本地人工；回归风险 | 平台/CI | 2026-12-31（已确认） | 建 Windows runner/native ctest/feature 测试 job；至少 nightly |
| X-10 | P1-05 | DanQing 独立渲染引擎未接入 LubanCAD | 存在“第二渲染平台”误解 | 架构/DanQing | 接入 ADR 前 | 保持独立；接入需 ADR + 接口/许可/性能评审 |
| X-11 | P0-07 | `shared` `strict:false`；`interfaceVersion` 无运行时协商 | 契约漂移无法在运行时发现 | 平台/后端 | 2026-12-31（已确认） | 开启 strict；加 runtime handshake；生成类型/白名单 |
| X-12 | P0-08 | 存在多份 `imodel-native` checkout/zip（2.2.1/2.2.5 等） | 版本/provenance 不确定 | Native/发布 | 2026-12-31（已确认） | 建 canonical manifest；归档/删除非 canonical 副本 |
| X-13 | P1-09 | 发布清单/测试基线/架构文档存在过期数字 | 误导评审与发布 | 文档/平台 | 2026-12-31（已确认） | 改为脚本生成基线；PR 同步文档索引/台账 |
| X-14 | P1-06/P1-09 | `tutorial2` 真栈 e2e 在拉伸 2 面域 4 失败：`data-region-points` 给出画布外坐标（页 y=-5），点击无命中 | 基线非全绿；可能被误判为产品回归或误当绿 | Web/编辑器 | **已关闭（2026-11-04）** | **已关闭（2026-11-04）**：根因=严格模式未做特征视口取景，拱肩翼面域投影到画布上方；`profilePickPoints` 又返回画布外兜底点（首个尝试“showcaseScene 全模式取景”反而把弧点推进 ViewCube 命中区，已回退）。修复=`frameScene(SCENES.partIso)` 仅在拉伸/旋转对话框取景；`profilePickPoints` 只返回安全点（17×17 采样、无兜底）；e2e 增加画布外坐标硬失败护栏。证据=`luban-cad/apps/web/test-results/t2-strict-after.log`：2 passed（setup+strict，3.8 min），六特征 status 0，无圆角 358.161 cm³、终 357.739 cm³、去材 0.422 cm³。禁止放宽断言 |
| X-15 | P0-10 | 自动保存（Onshape 式静默 `pushChanges`）会开启新 changeset 会话，已推送事务不再保证可 Undo | 自动保存后的 undo 深度小于 Onshape 宣称值 | 编辑器/平台 | 2027-03-31（ADR-0017 Stage F 登记） | 在 ADR-0017 §5/§7 声明真实 undo 边界；评估 undo 与 push 会话解耦；UI 不宣称与 Onshape 相同 undo 深度 |
| X-16 | P0-07（Hub REST 契约） | G1 期间 clone/fork 保持 fail-closed 切片：`fork preserveHistory=true` 返回 501 `ForkPreserveHistoryUnsupported`；非 head checkpoint 的 clone/fork 返回 409 `CheckpointAtHeadRequired`；`fork preserveHistory=false`（Duplicate/squash）不实现。官方“复制历史 / 内容副本”语义暂不满足 | 用户不能通过 clone/fork 复制当前内容或任意历史点；官方 SDK 调用会收到 501/409 | 平台/账本（Hub） | 2027-03-31（季度复核） | D3：完成 `(iModelId,id)` changeset 身份迁移 + history copy + 异步 Create operation；squash 在原生 transformer spike 通过后实现；验收=clone 当前内容/任意点/基线、fork history、跨 iTwin 422 真栈 e2e。ADR-G0-04（Proposed） |
| X-17 | P0-07（Hub REST 契约） | G1 D4 真实 checkpoint worker 仅有 D4b 骨架（native 生成/readback 未执行；storage-token/claim 字段缺口见 X-23/X-24），`CHECKPOINT_GENERATION_ENABLED` 默认 OFF：Named Version checkpoint `PUT` 返回 409 `CheckpointGenerationDisabled` 且不产生行；`GET` 返回 409 `CheckpointNotReady`；latest checkpoint 只返回真实 `successful` 行（当前仅 baseline） | Named Version 不能获得 mid-history checkpoint；版本打开/Clone 加速不可用；官方 SDK 的 updateNamedVersionCheckpoint 在 flag 关闭时收到 409 | 平台/账本（Hub） | 2027-03-31（季度复核） | 实现真实 checkpoint worker（生成/readback/manifest/GC）→ 打开 flag → D6/D5 联调；验收=NV 真实 checkpoint successful、200/1000 冷开基线、无幽灵 scheduled。ADR-G0-04（Proposed） |
| X-18 | G1 Gate（token 不进 URL）/ P0-07 | `SESSION_TOKEN_VIA_QUERY=allow` 兼容回滚开关：显式开启后 modeling-server 与 BFF 重新接受 `?token=`（默认 `deny`，不生效） | 开启期间 token 可进入浏览器历史、反向代理/访问日志；削弱 B5a 的 URL/token 结论 | 平台/安全 | 2026-12-31（owner 指令 2026-11-23；仅回滚窗口） | 默认 deny，发布配置与 `verify-stack` 不得设置 allow；任何开启须变更单+事件记录并限期恢复；到期前删除 allow 分支与开关。退出证据=代码扫描无查询串 token 读取路径 + 真栈 WS/HTTP 负例（401 且日志无 token） |
| X-19 | G1 Gate（有状态 RPC 只经 `/ipc`）/ P0-07 | `HTTP_STATEFUL_RPC_MODE=allow` 兼容回滚开关：显式开启后 modeling-server 重新允许 briefcase/Feature/undo 类有状态操作经 HTTP RPC 触达（默认 `deny`，不生效） | 开启期间 HTTP 无连接会话仍可触达文档/会话绑定操作，绕过 `/ipc` 所有权与写租约边界；削弱 C6 的 HTTP 收敛结论 | 平台/安全 | 2026-12-31（仅回滚窗口，随 C6 交付登记） | 默认 deny，发布配置与 `verify-stack` 不得设置 allow；任何开启须变更单+事件记录并限期恢复；到期前删除 allow 分支与开关。退出证据=代码扫描 HTTP 路由均挂 `httpStatefulRpcGuard` + 单测（deny 403 且不查 Hub）+ 真栈 HTTP 负例（403 且无 briefcase 操作） |
| X-20 | G1 Gate（撤销下一请求生效）/ P0-07 | 既有 `/ipc`/`/ws` WebSocket 连接未实现每条消息复验或 Hub 主动推送，只在 `WS_AUTH_REVALIDATE_INTERVAL_MS`（默认 30s）周期调用 Hub session-status 探针。新 WS 升级、HTTP RPC、BFF `/api` 在 `AUTH_TOKEN_CACHE_TTL_MS=0` 默认下均每次回源。 | **已建立的长连接**在 logout/撤权/停用后最多约 30s（+ 探针超时 ≤5s，Hub 可达时约 35s）仍可发送消息；Hub 不可达期间按 transient 保持连接，撤销延迟延长到恢复后下一次探针。**不是“下一请求 401”**；HTTP/BFF/新连接不受此窗口影响。 | 平台/会话（B1.2b） | 2027-03-31（季度复核） | 实现每消息/≤5s 会话复验或 Hub→MS 主动关闭推送；验收=真栈 logout 后 ≤5s 关闭对应 socket、其他会话不受影响、429/5xx 不误断；完成后删除本例外并删除/收紧周期探针。复验间隔与探针证据同 PR 更新 B1.2b AIRR。 |
| X-23 | P0-07 / 最小权限（checkpoint worker 凭据） | **状态 2026-11-23：Hub 契约已实现 + worker 已切换（code exit）**：worker 默认且仅支持 `hub` 模式，read `rl`/write `racwdl` 短 TTL SAS 均来自 `POST .../storage-token`；`local-account-key` bridge、账户 key signer 与 `CHECKPOINT_WORKER_STORAGE_ACCOUNT*`/`SAS_TTL`/`HUB_STORAGE_TOKEN_AVAILABLE` 配置已删除，旧模式启动即拒绝；写 SAS 剩余 TTL ≤60s 显式续签，SAS 仅内存。**例外仍 open 至 native canary/部署实机验证**。 | 代码面凭据面已收敛为容器级短 TTL SAS；真实 native 上传/回读与部署形态未验证，不得宣称租户化就绪或真实 checkpoint 成功。 | 平台/账本（作业面） | 2027-03-31（季度复核） | Hub 侧已完成（D4 AIRR §7.5）+ worker code exit（D4B AIRR §7.4）→ **剩余**：native canary 证明写/回读 SAS 均来自 Hub、长上传续签、日志无 SAS、worker env 无存储 key；真实成功前不得关闭 |
| X-24 | P0-07（内部 agent 契约） | **状态 2026-11-23：Hub 契约已实现 + worker 已切换（code exit）**：claim `iTwinId`/无凭据 container 强制校验并用于下载/回读（`ITWIN_MISMATCH`）；worker 拉取只读链证据 `GET /internal/imodels/:id/changesets/:changesetIdOrIndex/chain`（public changeset DTO 不变），以 canonical 公式独立重算 chainRoot 并与 claim `expectedChainRoot` 逐字比对；legacy/baseline 显式处理。**例外仍 open 至 native canary/部署实机验证**。 | 代码面 iTwin/链根双算已落地；真实账本与数据面组合未验证，不得宣称 G1 Gate 通过或真实 checkpoint 成功。 | 平台/账本（Hub+作业面） | 2027-03-31（季度复核） | Hub 侧已完成（D4 AIRR §7.5）+ worker code exit（D4B AIRR §7.4）→ **剩余**：native canary 下篡改 iTwin/chainRoot 两处负例均终态拒绝；真实成功前不得关闭 |
| X-21 | G1 Gate（身份/权限分离）/ P0-07 | G1 B2/B3 P0 shadow 期间，Hub 内部 delegation/OBO/decision 端点仍以共享 `AGENT_API_KEY` + 固定 `X-Service-Name` allowlist 作为服务传输因子；人类 admin 服务账号与 API key 仍可访问 Hub 用户数据面（legacy）。OBO shadow 只证明“真实用户 + 代行为者”可签发/决策，**不等于** B6 服务身份分离完成。 | 共享 key 泄露仍可触达用户数据面（但单独不能换取 OBO：exchange 仍需有效用户 token/handle）；OBO 的 `act` 由固定头部+配置映射，不是已注册服务主体；不得宣称共享 key 不再是旁路或“服务身份即用户身份”已修复。 | 平台/安全 | 2027-03-31（季度复核；P2/P3 强制前必须关闭） | B6 引入 service client/client credentials（或 mTLS）替换共享 key；用户数据面拒绝 service/API-key 主体；exchange/decision 只接受已注册服务主体；轮换共享 key。验收=仅 API-key 用户数据面 401/403、共享 key 不能单独换 OBO、exchange/decision 负例 401 且日志无 token。 |
| X-22 | G1 Gate（多租户）/ P0-07 | `tenantId` 缺失：B2/B3 P0 的 handle/OBO/audit schema 只有 nullable `tenantId` 占位且恒为 `NULL`，决策只做 iTwin 边界。 | 无法做或宣称跨租户强制；跨租户负例按 B10 **blocked**，不得写成 passed；不得把 `iTwinId` 冒充 `tenantId` 或用于授权。 | 安全/数据 | 多租户立项或 2027-03-31（先到者） | B10 建立 tenant 映射/RLS/每个入口的 PEP；补跨租户负例与审计；完成前不得宣称多租户，也不得用 `tenantId` 做授权判断。 |
| X-25 | P1-06 / P0-04（真栈证据） | **状态 2026-11-23**：隔离 D5 canary 已通过 NamedVersion/index/id 只读打开、几何/树、head 不变、写拒绝；发现两个真实缺陷并已修复+单测：baseline checkpoint `changesetId=""` 解析失败（现 index 0 归一化 null，非 baseline 仍 40-hex）、IPC open/close key 日志泄漏绝对缓存路径（新增 `safeKeyForLog`，key/fileName 日志只输出 `path:<basename>`）。**2026-11-24 隔离 canary 重跑通过**：baseline index 0、NV/index/id、几何/树、head 不变、写/保存/push/pull/abandon/可写重开 403、key 日志仅 `path:<basename>`；残余为 native loader dev-build 绝对路径与 `err.stack` 路径输出，以及 B3 per-doc ACL/200–1000 性能；例外保持 open，不宣称 D5 完成。 | 不得宣称 D5 完成或 G1 Gate 通过；不得宣称版本打开已按用户 ACL 授权（B3 未完成）；key 日志已脱敏不等于所有 native/三方路径日志已清除。 | 平台/账本（MS+shared） | 2027-03-31（季度复核） | 重跑 `AIRR-2026-11-23-D5-VERSION-OPEN.md` §7.3 步骤 0–5（baseline index 0 成功且 checkpoint.changesetId=null、NV/index/id 几何/树、head 前后一致、save/push/pull/abandon 与可写重开 403、key 日志仅 `path:<basename>`）→ 证据回填 AIRR 后由 owner 关闭。 |
| X-26 | G1 Gate（B7 审计）/ P0-07 / P1-11 | G1 B7 v1 只覆盖 authz shadow decision 的 `audit_events`（DB 触发器 append-only + v1 哈希链 + service-only 查询/校验，见 `AIRR-2026-11-23-B7-AUDIT-V1.md`）。**未覆盖**登录/登出/撤权、权限/成员/角色变更、iModel/changeset/briefcase 写、FeatureOp/直改、导出、checkpoint 调度/claim、storage SAS、webhook 管理等高风险操作；**未实现**“审计失败即阻断”。WORM 仅本地 PostgreSQL 触发器：表 owner/超级用户可显式禁用/删除，无异地不可变副本/对象锁/保留期/legal hold；链无法检测删除最新行；有权限者禁用触发器后可重算整链，本地表无法自证被重写；`createdAt` 哈希为毫秒精度；查询/校验仍用共享 `AGENT_API_KEY`（B6），`tenantId=NULL`（B10）。 | 不得宣称 B7/WORM/合规审计完成或高风险操作已被审计/阻断；尾删、整链重写与亚毫秒时间篡改在无外部锚定时不可检测；有 DB owner 权限者可禁用触发器。B7 v1 证据仅限单元 + 隔离 relational e2e。 | 平台/安全 | 2027-03-31（季度复核；B7 enforcement/G1 Gate 前必须收敛） | 建立高风险操作清单并接同一 append，定义 HITL/阻断与覆盖断言；异地不可变保留 + 周期链头锚定（`lastSeq+entryHash`）使尾删/整链重写可检测；补保留期/DSR；B6 服务身份、B10 租户后关闭；验收=篡改/尾删/整链重写/跨租户负例与高风险操作 fail-closed 真栈证据。 |

---

## 例外申请格式

```
ID:
规则:
例外内容:
理由（为什么现在不能遵守）:
影响面（安全/数据/发布/许可）:
Owner:
失效日期:
退出计划（可验证）:
审批（P0 需架构 owner 签字）:
```

## 审计

- 每季度复核全部例外；到期项必须关闭或升级为 ADR。
- 新增 P0 例外必须在本表登记，否则视为违规。
- 例外不得用于绕过安全/许可/数据迁移红线。

*最后更新：2026-11-23（G1 账本硬化：新增 X-16 D3 clone/fork fail-closed、X-17 D4 checkpoint 生成默认关闭；G1 B5a：新增 X-18 query-token 兼容回滚开关，默认 deny；G1 C6：新增 X-19 有状态 HTTP RPC 回滚开关，默认 deny；G1 B1.2c：新增 X-20 既有 WS 撤销延迟例外，默认复验 30s；G1 B2/B3 P0 shadow：新增 X-21 共享 API key/人类 admin 用户面旁路（B6）、X-22 `tenantId` 占位（B10）；G1 D4b：新增 X-23 worker storage-token bridge、X-24 claim iTwinId/chainHash 接口缺口；D4 X-23/X-24 退出切片：Hub 侧 storage-token/claim 元数据/链证据已实现并留测；D4b worker 已切换到 Hub SAS（删除账户 key bridge）并使用 claim iTwinId + 独立 chainRoot 双算，X-23/X-24 记为 code exit，仍 open 至 native canary/部署验证；G1 D5：新增 X-25 只读版本打开；隔离 canary 通过 NV/index/id/几何/head/写拒绝，发现 baseline 空 changesetId 与 key 日志绝对路径两缺陷，已修复+单测，待重跑，不勾 Gate；G1 B7 v1：新增 X-26 高风险操作未审计/未阻断与本地 WORM/无异地保留/尾删限制；v1 触发器 + 哈希链 + service-only 查询/校验已实现，隔离 relational e2e 绿，不勾 Gate）*

