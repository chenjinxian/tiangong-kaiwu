# G0 Spike 登记册

> 状态：**Not started（历史表头已过期）**（2026-11-22；2026-11-24 证据映射见 G0 Gate Report）
> 输入：`G0-EXECUTION-PLAN.md` §5、`10-ARCHITECTURE-HARDENING-PLAN.md` §2.2
> 规则：没有证据不得标 PASS；失败必须写失败动作；破坏性实验必须使用隔离环境并走 HITL。
> **2026-11-24 收口**：下表“Not started”不能作为当前事实；实际结论为 S0-4 PASS（真栈）、
> S0-2 PARTIAL、S0-5 FAIL→fail-closed、S0-13 PARTIAL→fail-closed（§7.4）、
> S0-12 BLOCKED、其余 NOT RUN/DEFERRED。
> 详见 [`G0-GATE-REPORT-2026-11-24.md`](./G0-GATE-REPORT-2026-11-24.md)；本册不得据此宣称
> G0 或任何 Spike 通过。
> **2026-11-24 隔离真栈复测（§7）**：S0-3 仍 PARTIAL（HTTP fail-closed；DB 边界有
> 可绕过缺口）；S0-5 仍 FAIL→fail-closed；S0-13 为 PARTIAL→fail-closed；S0-16 未跑。
> 本轮不把任何 Spike 标为 PASS，G0 仍 NO-GO。
> 团队执行方案见 [`TEAM-EXECUTION-PLAN-2026-11-25.md`](./TEAM-EXECUTION-PLAN-2026-11-25.md)；
> 该方案不改变本册任何 Spike 结论。

## 1. 使用规则

1. 每个 Spike 在开始前填写：环境、输入数据、负责人、时间盒。
2. 执行中记录：命令、日志/截图、计时、错误码；证据必须可复现。
3. 结束后只能填：**PASS / FAIL / STOP / BLOCKED**；不得填“基本通过”。
4. FAIL/STOP 必须写：失败条件、影响决策、最小修复/替代方案、进入哪个 G1 工作包。
5. 私有证据只放私有仓/受控目录；本册只放脱敏结论与链接。

## 2. 环境登记

| 项 | 要求 | 实际值 |
|---|---|---|
| 公仓 commit/tag | 与发布/基线一致 | 待填 |
| 私有后端产物/源码 | 明确产物模式或源码模式 | 待填 |
| native 版本/provenance | 单一 canonical；无 fallback 时注明 | 待填 |
| 数据库 | **隔离副本**，不得用共享/生产库 | 待填 |
| 对象存储 | 隔离容器/桶；备份恢复用独立快照 | 待填 |
| 前端 | dev :5300 或部署镜像（注明） | 待填 |
| MS | 宿主实例；限流/日志可观测 | 待填 |
| 数据快照 | iModel/文档/账号前置 | 待填 |
| 证据目录 | 公开/私有，已脱敏 | 待填 |

### 2.1 环境基线记录（2026-11-22）

- 本地 compose 栈在线：hub/Postgres/Redis/Azurite/WA/web/nginx 均 healthy；MS :5401、WA :5402、hub :5400、nginx :5301 可连通。
- `scripts/verify-stack.ps1`：**16/17 通过，1 警告**；警告为 **web 镜像 revision 落后当前 web 源**（需 `scripts/rebuild-web.ps1`）。该结果只作为 G0 环境基线，不计为任何 Spike 的 PASS。
- 当前未执行账本负例、崩溃注入、DR 备份恢复等破坏性 Spike；这些仍需隔离环境与逐项 HITL。

## 3. Spike 总表

| ID | 假设/问题 | 主责 | 时间盒 | 依赖 | 状态 | 结论 | 失败动作 |
|---|---|---|---|---|---|---|---|
| S0-1 | 双用户双连接可隔离 | Session | 1d | 隔离栈、两个浏览器 | Not started | 待填 | 改 IPC/briefcase/进程模型 |
| S0-2 | 直改受同一门禁 | Security | 1d | 用户 B/ACL 测试账号 | Not started | 待填 | 封直改或改 Editor |
| S0-3 | 账本不可变/可恢复 | Data | 2d | 隔离 hub DB/API | Not started | 待填 | 先冻结账本 |
| S0-4 | 版本可只读打开 | Data | 1d | S0-3 数据/手工 checkpoint | Not started | 待填 | 补 openCheckpoint/version |
| S0-5 | mid-history checkpoint 后 fork 可用 | Data | 1d | S0-4 | Not started | 待填 | 重设计 FK/fork |
| S0-6 | 多输出/拓扑可被下游消费 | Feature | 2d | 合成 PS/StandaloneDb | Not started | 待填 | 冻结输出/拓扑契约 |
| S0-7 | occurrence transform 正确 | Kernel | 1d | GeometryPart+placement 数据 | Not started | 待填 | 修 native/DTO |
| S0-8 | 500 面批量 pick 预算 | Frontend/Kernel | 1d | 500 面模型 | Not started | 待填 | 接受边界或做批量服务 |
| S0-9 | BRep→tile 内容正确 | Kernel | 1d | 真 BRep 文档 | Not started | 待填 | 补测试/修 facet |
| S0-10 | HLR 可生成 | Kernel | 1d | 单 body 正交视图 | Not started | 待填 | 后置或引入 HLR |
| S0-11 | format/kernel 标签兼容 | Kernel | 1d | 旧 iModel fixture | Not started | 待填 | 暂不启动 TrueForm |
| S0-12 | 租户隔离成立 | Security | 1d | 双租户/双项目 | Not started | 待填 | 先做 tenantId/RLS |
| S0-13 | clone/fork 复制内容 | Data | 1d | 可编辑文档+push | Not started | 待填 | 停对外承诺，修 fork |
| S0-14 | 200/1000 changeset 冷开基线 | Data/SRE | 2d | 生成器/批量脚本 | Not started | 待填 | checkpoint 提前 P0 |
| S0-15 | DR 恢复 | SRE/Data | 2d | 备份/恢复隔离环境 | Not started | 待填 | 停止可靠性承诺 |
| S0-16 | 未推送编辑边界 | Data/Frontend | 1d | 可杀 MS/删缓存 | Not started | 待填 | 先定 D0-13，改 outbox/ack |

## 4. 逐项执行卡

### S0-1 双用户双连接

- **假设**：两个独立客户端打开同一文档，不互踢、不串 IPC/命令/选择。
- **准备**：隔离栈；两个浏览器上下文；同一 iModel；一个只读、一个编辑；记录 WS/IPC 日志。
- **步骤**：A/B 同时打开；各发一个请求；观察 requestId 归属；A 启动直改/undo；B 观察是否被关闭/接管；A 断开后 B 是否恢复。
- **证据**：连接日志、requestId、MS 日志、关闭/重连时间线、录屏。
- **通过**：无互踢、无串响应、无跨用户命令/undo；只读独立。
- **失败动作**：改 IPC 路由/briefcase key/进程模型；进入 C1/C2/C3。
- **结果**：待填（状态/证据/备注）。

### S0-2 直接编辑门禁

- **假设**：直改与 FeatureOp 共享租约、ACL、审计边界。
- **准备**：用户 B 对 A 的 iModel；直改工具；审计/OpLog 查询。
- **步骤**：B 直接调用/启动直改；检查服务端鉴权；检查租约；检查 OpLog/审计；重复通过 HTTP RPC 和 `/ipc`。
- **证据**：请求/响应、403/写入结果、审计记录、OpLog。
- **通过**：越权 403；合法直改有租约/审计；无静默写。
- **失败动作**：封直改入口或改 Editor；进入 B3/C6。
- **结果**：待填。

### S0-3 账本不可变/可恢复

- **假设**：changeset 不可改写、无父根/挖洞被拒；complete 校验 blob；崩溃后可恢复。
- **准备**：隔离 hub DB/API；可丢弃 iModel；注入工具。
- **步骤**：PATCH parentId；创建无父根；DELETE 中间 changeset；complete 不传 blob；checksum 不符；create→complete 前杀进程/断网后重试 push。
- **证据**：HTTP 状态/错误码、DB 行、下载/冷开结果、重试日志。
- **通过**：非法操作 400/409/422；崩溃后重试 push 成功；无幽灵/悬挂行。
- **失败动作**：先冻结账本，再 checkpoint；进入 D1/D2。
- **结果**：待填。

### S0-4 版本只读打开

- **假设**：可按 version/changeset 只读打开指定历史。
- **准备**：S0-3 数据；手工造 index>0 successful checkpoint（若生成器缺失）；目标版本几何/树快照。
- **步骤**：按 versionId/changesetId 打开；校验树/body/体积；确认不推进 head、不写事务。
- **证据**：打开日志、树/几何快照、head 前后对比。
- **通过**：打开成功且内容符合版本；head 不变。
- **失败动作**：补 `openCheckpoint`/version 参数；进入 D5。
- **结果**：待填。

### S0-5 checkpoint×fork

- **假设**：存在 mid-history checkpoint 时 clone/fork 仍可用。
- **准备**：S0-4 的 checkpoint；clone/fork API。
- **步骤**：clone/fork；观察 FK/事务；打开目标；核对内容/历史语义。
- **证据**：API 响应、DB 约束错误、目标文档树/体积。
- **通过**：不 FK 失败；目标内容符合 Duplicate/History 语义。
- **失败动作**：重设计 `checkpoints.changesetId` 外键/fork 复制逻辑；进入 D3。
- **结果**：待填。

### S0-6 多输出/拓扑

- **假设**：一个特征可多输出，下游可正确消费；拓扑引用带 body/scope。
- **准备**：合成 split/多目标特征；下游 fillet/pattern；StandaloneDb/真栈。
- **步骤**：执行多输出；下游引用输出；插入/删除/重排；检查命中与体积。
- **证据**：树、输出 key、下游结果、体积、失败日志。
- **通过**：下游正确消费；插入/删除不静默错命中。
- **失败动作**：冻结输出/拓扑契约后再铺特征；进入 F4/F5/F6。
- **结果**：待填。

### S0-7 occurrence transform

- **假设**：BIS occurrence/GeometryPart + transform 的拾取坐标正确。
- **准备**：一个原型 + 两个实例/placement；拾取工具。
- **步骤**：拾取面/边/顶点；比较世界坐标；质量属性/包围盒；冷重开。
- **证据**：坐标、命中 id、截图、质量属性。
- **通过**：实例坐标/拾取/质量属性正确。
- **失败动作**：修 native/DTO transform；进入 K1/H6。
- **结果**：待填。

### S0-8 批量 pick/topology

- **假设**：500 面模型 hover/选择/拓扑快照在预算内。
- **准备**：500 面模型；当前逐面 RPC；候选批量 API。
- **步骤**：hover/框选/拓扑快照；记录 IPC 次数、p50/p95、FPS。
- **证据**：性能日志、trace、截图。
- **通过**：预算内；无逐面 IPC 风暴。
- **失败动作**：接受元素级选择边界或先做批量服务；进入 G10/H4。
- **结果**：待填。

### S0-9 BRep→tile

- **假设**：真 BRep 几何流生成的 tile 内容正确。
- **准备**：真 BRep 文档；tile 缓存；像素/几何对照。
- **步骤**：生成 tile；检查 facet/边/面；与 BRep 体积/轮廓对照。
- **证据**：tile 请求、截图、facet 统计。
- **通过**：tile 与 BRep 一致；无桩替代。
- **失败动作**：补测试/修 facet 路由；进入 H3/H5。
- **结果**：待填。

### S0-10 HLR

- **假设**：单 body 正交视图可生成可见/隐藏线。
- **准备**：单 body；正交相机；HLR 候选实现。
- **步骤**：生成视图；检查可见/隐藏线；导出/对照。
- **证据**：图像、线段统计、失败日志。
- **通过**：可见/隐藏线可生成且可诊断。
- **失败动作**：工程图后置或引入 HLR 引擎；进入 K5。
- **结果**：待填。

### S0-11 format/kernel 标签

- **假设**：给旧 iModel 加 format/kernel 标签后仍可读、可重建。
- **准备**：旧 `.bim` fixture；标签补丁；冷开/重建脚本。
- **步骤**：加标签；冷开；重建；导出/质量属性；回滚标签。
- **证据**：打开/重建日志、体积、快照。
- **通过**：旧库仍可读；标签可诊断混合后端。
- **失败动作**：暂不启动 TrueForm M1；进入 H1/H10。
- **结果**：待填。

### S0-12 租户隔离

- **假设**：租户 A 不能访问租户 B 的任何资源。
- **准备**：双租户/双项目/双账号；对象前缀；API/RPC/WS/存储。
- **步骤**：A 访问 B 的 iModel/文件/对象/作业/审计；枚举 ID；检查 403/404。
- **证据**：负例矩阵、响应码、对象列表。
- **通过**：全入口拒绝；无跨租户枚举。
- **失败动作**：先做 tenantId/RLS/前缀；进入 B10。
- **结果**：待填。

### S0-13 clone/fork 内容

- **假设**：clone/fork 复制当前内容，不是空 baseline。
- **准备**：建文档→加特征→push；clone；源/目标截图/树/体积。
- **步骤**：clone；打开目标；比较特征数/几何/体积；检查 `preserveHistory` 语义。
- **证据**：API 响应、目标树、体积、截图。
- **通过**：内容与源一致；History 语义符合决策。
- **失败动作**：停止“复制/分支”对外承诺；进入 D3。
- **结果**：待填。

### S0-14 冷开基线

- **假设**：历史长度对冷开的影响可量化，checkpoint 可解决。
- **准备**：200/1000 changeset 文档；批量下载/apply；计时。
- **步骤**：冷开多次；记录下载/apply/打开 p50/p95；再在 checkpoint 后复测。
- **证据**：计时报告、批次/对象数、日志。
- **通过**：有可复现报告；瓶颈可归因。
- **失败动作**：checkpoint worker 提前为 P0；进入 D4。
- **结果**：待填。

### S0-15 DR 恢复

- **假设**：Postgres + 对象存储可从备份成套恢复并打开文档。
- **准备**：隔离环境；备份脚本/快照；3 个文档（含 100 changeset）；RPO/RTO 计时。
- **步骤**：备份；销毁/替换卷；按 runbook 恢复；打开文档；校验树/体积；记录缺口。
- **证据**：备份 manifest、恢复日志、RPO/RTO、文档校验。
- **通过**：恢复成功；RPO≤5m/RTO≤1h 有实测或明确差距。
- **失败动作**：停止“数据可靠/可恢复”承诺；进入 E1/E2/E3。
- **结果**：待填。

### S0-16 未推送编辑边界

- **假设**：未 push 的编辑丢失范围可量化，UI 可明示。
- **准备**：可杀 MS/删 briefcase 的隔离环境；编辑但不 push。
- **步骤**：编辑；等待/立即杀 MS；删缓存；重开；记录丢失；检查 UI 未保存提示。
- **证据**：编辑/推送时间线、丢失范围、UI 截图。
- **通过**：丢失范围可量化；UI 明示未保存/未推送。
- **失败动作**：先定 D0-13，改 outbox/ack；进入 E7/D13。
- **结果**：待填。

## 5. 结果汇总与 Gate

> 2026-11-24：本册不再维护“Not started 16”的过期计数；全量 16 项状态以
> [`G0-GATE-REPORT-2026-11-24.md`](./G0-GATE-REPORT-2026-11-24.md) §3 为准。
> 本轮隔离真栈只复测了以下四项：

| ID | 本轮状态 | 是否 PASS | 证据 |
|---|---|---|---|
| S0-3 账本不可变/恢复 | PARTIAL（HTTP fail-closed；DB 边界有缺口） | 否 | §7.2 |
| S0-5 checkpoint×fork | FAIL→fail-closed（mid/baseline 409；history 501） | 否 | §7.3 |
| S0-13 clone/fork 内容 | PARTIAL→fail-closed（head 容器复制；changesets=0） | 否 | §7.4 |
| S0-16 未推送边界 | NOT RUN（Hub-only 范围外） | 否 | §7.5 |

**G0 Gate 规则**：

- 16/16 有结论，才允许 G0 GO。
- 任一 STOP 且无替代方案，G0 只能 NO-GO。
- 关键 Spike（S0-1/2/3/13/15/16）FAIL 时，G1 对应工作包必须前置，且不得对外承诺多用户/版本/可靠性。

## 6. 证据索引模板

| Spike | 证据路径（私有/公开） | 复现命令 | 环境摘要 | 结论 |
|---|---|---|---|---|
| S0-1 | 待填 | 待填 | 待填 | 待填 |
| S0-2 | 待填 | 待填 | 待填 | 待填 |
| S0-3 | 待填 | 待填 | 待填 | 待填 |
| S0-4 | 待填 | 待填 | 待填 | 待填 |
| S0-5 | 待填 | 待填 | 待填 | 待填 |
| S0-6 | 待填 | 待填 | 待填 | 待填 |
| S0-7 | 待填 | 待填 | 待填 | 待填 |
| S0-8 | 待填 | 待填 | 待填 | 待填 |
| S0-9 | 待填 | 待填 | 待填 | 待填 |
| S0-10 | 待填 | 待填 | 待填 | 待填 |
| S0-11 | 待填 | 待填 | 待填 | 待填 |
| S0-12 | 待填 | 待填 | 待填 | 待填 |
| S0-13 | 待填 | 待填 | 待填 | 待填 |
| S0-14 | 待填 | 待填 | 待填 | 待填 |
| S0-15 | 待填 | 待填 | 待填 | 待填 |
| S0-16 | 待填 | 待填 | 待填 | 待填 |

---

## 7. 2026-11-24 隔离真栈复测证据（S0-3/S0-5/S0-13；S0-16 未跑）

> 性质：**证据补充，不是 Gate 签字**。本轮不把任何 Spike 标为 PASS；G0 仍 NO-GO。
> 证据级别：隔离 relational test compose + 真实 API 登录/iTwin/iModel/HTTP；
> checkpoint 行与 Azurite 容器内容为**手工构造**，不是 checkpoint worker 产物。

### 7.1 环境与命令

| 项 | 实际值 |
|---|---|
| Hub 源 | `imodelhub-services` HEAD `8cb85ba61e243a3c41902e333f85ea24cdaadb81`（只读 `git archive HEAD` 导出；工作树 WIP 不编译，未使用/未修改） |
| 隔离栈 | compose project `g0-spike`；fresh Postgres/Redis/Azurite；API `127.0.0.1:4440` |
| 覆盖 | `CHANGESET_WAITING_FOR_FILE_TTL_MINUTES=2`（仅隔离栈，用于 TTL 重试） |
| 认证/数据 | test compose 种子管理员登录；真实 `POST /itwins`、`POST /imodels`、changesets/clone/fork/checkpoint HTTP |
| 隔离性 | 独立 network/volumes/端口；未触碰 `tiangong-kaiwu-*` live stack、live DB/Azurite |
| 收口 | `docker compose -p g0-spike ... down -v --rmi local`；临时脚本/日志删除 |

```text
# 起隔离栈（<temp>/g0-spike.override.yaml 仅加 4440:4000 与 TTL=2）
docker compose -p g0-spike --env-file <head>/env-example-relational \
  -f <head>/docker-compose.relational.test.yaml -f <temp>/g0-spike.override.yaml up -d --build
# 在隔离网络内跑一次性 driver（临时脚本，已删除）
docker run --rm --network g0-spike_default -v <temp>:/work -w /work \
  g0-spike-api:latest node /work/spike.mjs <phase>
# crash：create→complete 之间 SIGKILL/restart（约 73s 恢复）
docker kill g0-spike-api-1 && docker start g0-spike-api-1
# DB 负例/手工 checkpoint
docker exec g0-spike-postgres-1 psql -U root -d api -c "<SQL>"
```

### 7.2 S0-3 账本不可变/可恢复（PARTIAL，不得 PASS）

| 用例 | 期望 | 实测 |
|---|---|---|
| genesis 创建 / blob 上传 / complete（省略 checksum） | 2xx | **201**（Nest POST 默认；文档注释写 200，需登记） |
| blob 未上传 complete | 422 | **422** `UnprocessableEntity`（has no uploaded file） |
| 错误 checksum complete | 422 | **422** `UnprocessableEntity`（checksum does not match） |
| 重复创建 sealed id | 409 | **409** `Conflict` |
| 第二 root（API） / 未知 parent | 422 | **422** `UnprocessableEntity` |
| PATCH `parentId`；PATCH `checksum`/`chainHash`/`prevHash` | 不改历史 | **200 no-op**，值不变（whitelist 静默丢弃） |
| PATCH `state`→`waitingForFile` | 422 | **422** |
| PATCH `briefcaseId` | 4xx | **500** `InternalServerError`（DB 触发器 `changeset history is append-only`，未映射；值未变） |
| API DELETE 中间 changeset | 409 | **409** `Conflict` |
| API DELETE 叶子 changeset | 允许 | **204**；后续 index=4（软删 index=3 留空洞） |
| create 后、complete 前 SIGKILL API | 可恢复 | 行存活；重启后 complete **201** |
| 超 TTL（133s > 120s）同 id 重试 | 替换 abandoned | create **201**（index 复用 2）、upload **201**、complete **201**；2 行无幽灵 |
| DB 改 `parentId`/`prevHash`；DB 删 sealed 中间/叶子 | 拒绝 | SQL `ERROR: changeset history is append-only` |
| DB 单独改 `checksum` 或 `chainHash` | 读面发现 | UPDATE 允许；GET/list **409**（chainHashMismatch） |
| DB 协同改 `checksum`+`chainHash`（重新计算） | 应发现 | **未发现**；GET/list **200** |
| DB INSERT 第二 root | 拒绝 | **允许**；`waitingForFile` 隐藏，`fileUploaded` 后列表 **200**（legacy 行，两个空 parentId） |
| DB 注入的 `fileUploaded` 行 state→`waitingForFile` 后 DELETE | 拒绝 | **UPDATE 1 + DELETE 1 成功**；触发器只检查 `OLD.state` 与子行，真实 sealed 叶子同险（未单独实测） |
| 手工恢复 checksum/chainHash 后读 | 200 | **200**（仅操作员手工修复，不是自动恢复） |

**结论**：HTTP 面 append-only/根/挖洞/blob/checksum/崩溃重试均 fail-closed；DB 边界
仍有 second-root INSERT、`fileUploaded` 行 state 翻转删除（真实 sealed 叶子同险）、
checksum+chainHash 协同重写、500 映射与泛化错误码缺口。进程 kill 可恢复；篡改后
只有检测 + 手工修复，无自动 clean recovery。

### 7.3 S0-5 mid-history checkpoint × fork（FAIL→fail-closed）

| 场景 | 实测 |
|---|---|
| 无 successful checkpoint | clone **422**；fork content-only **422**；`preserveHistory=true` **501** |
| baseline checkpoint index 0，head index 1 | clone **409**；fork **409**；显式 index 0/1 **409**；history **501** |
| mid checkpoint index 1，head index 3 | clone **409**；fork **409**；显式 mid index/id **409**；history **501** |
| checkpoint 在 head index 3 | clone **201**；fork content-only **201**；显式 stale index **422** |

mid-history fork 仍不可用；无 FK 崩溃，但“mid-history checkpoint 后 fork 可用”不成立。

### 7.4 S0-13 clone/fork 内容（PARTIAL→fail-closed）

- head clone/fork **201**；目标 `state=initialized`、`baselineChangesetIndex=3`、
  `fileSize=4242`（手工 checkpoint 元数据）。
- 目标 changesets **0 条**（history 不复制）；目标 checkpoint index 3 的
  `changesetId` 仍指向**源 iModel 的 D3**（跨 iModel 引用）。
- Azurite 容器复制真实发生：源/目标均含 `baseline.bim`（3B）与 `seed.bin`（26B），
  目标内容与源一致。
- `preserveHistory=true` 始终 **501**；显式 stale changeset **422**。

当前是“仅复制最新 checkpoint 容器”的 content-only duplicate，不是 history clone/fork；
且 checkpoint/容器为手工构造。真实部署只有 baseline checkpoint 时 head clone/fork
会被 409 拒绝，不可对外承诺“复制/分支”。

### 7.5 S0-16 未推送编辑边界（NOT RUN）

本轮为 Hub-only 隔离栈，没有启动隔离 modeling-server、没有 briefcase 编辑/未 push
路径；8.2 的 API 进程 kill 不能替代 S0-16，也不能量化未推送编辑丢失或 UI 提示。
仍需隔离 MS + briefcase 的 kill/删缓存实验。

### 7.6 剩余（进入 G1/D1-D3）

1. DB 边界：second-root 约束、sealed 状态转换钉死、checksum/chainHash 不可协同重写、
   触发器错误映射 409/422、保留 `ChangesetIntegrityViolation`/`CheckpointAtHeadRequired` 业务码。
2. D3：changeset/history 复制、`preserveHistory`、checkpoint 与源 changeset 的跨 iModel
   引用设计、mid-history clone/fork。
3. 恢复：tamper 后自动重建/隔离/审计，而非仅 409 + 手工 SQL。
4. 真实 checkpoint worker 生成后再复测 S0-5/S0-13；手工证据不得升级为 PASS。
5. S0-16：隔离 MS/briefcase kill 实验；D0-13 裁决前不承诺未推送边界。
6. G0 仍 NO-GO；16 决策未签字、20 份 ADR 仍 Proposed。

---

**关联**：`G0-EXECUTION-PLAN.md`、`G0-DECISION-REGISTER.md`、`../research/lubancad-architecture-assessment/10-ARCHITECTURE-HARDENING-PLAN.md`。
