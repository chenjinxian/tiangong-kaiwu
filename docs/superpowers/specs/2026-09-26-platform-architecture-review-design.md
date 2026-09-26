# 天工开物平台架构梳理与分步完善设计

日期：2026-09-26
状态：四节设计已逐节获用户确认
输入：三路现状盘点（luban-cad / modeling-server+webhook-agent / 仓外组件）、22 条调用边深析、6 份官方 OpenAPI 规格符合性判定、编辑 RPC 通路专项核实

## 0. 背景与约束

- **驱动力**：产品化/交付准备 + 架构债清理 + 全面体检定优先级（新能力铺路不是本轮驱动）
- **交付形态**：内网多用户部署（服务间认证、密钥管理、并发/数据安全动真格）
- **范围**：全家桶——本仓 4 项目（luban-cad / modeling-server / webhook-agent / itwinjs-core vendor）+ 仓外（imodelhub-services、DanQing、imodel-native）
- **节奏**：无硬时限，质量优先；每个子项目独立走 spec→plan→实施，做完验收再下一个
- **文档锚点**：架构梳理文档暂放本仓 docs/（platform-docs 文档总仓不在本机）；官方 API 规格建议入库 `docs/api-specs/`

## 1. 现状评估（体检报告）

### 1.1 组件判定

| 组件 | 判定 | 依据 |
|---|---|---|
| imodelhub-services（仓外） | 🟢 高 | 119 端点 / 158 测试 / Docker+Swagger+迁移+seeds |
| DanQing（仓外） | 🟢 独立成熟 | 353/353 测试；与平台零代码耦合——接入尚不存在，纯规划项 |
| luban-cad | 🟡 中 | 功能面完整（9 feature 多 ✅，markup ❌ 降级），50 单测/19 e2e；债在质量不在功能 |
| modeling-server | 🟠 中偏弱 | 能跑；藏 mock、热路径调试代码、660 行单体 main、8 测试文件 |
| webhook-agent | 🔴 弱 | 零测试、~90 console.log、空 catch、3×IModelHost.startup 无 shutdown、重启丢去重 |
| imodel-native 通道 | 🟢 已固化 | 2026-09-26 建立的替换机制（replace-imodeljs-native.ps1 硬门槛）+ 升级门预留 |

编辑管道硬约束成色 ✅：编辑命令 RPC 与 `/ipc` 事务 WS 双通道均活（初始化在 `packages/web-viewer/src/WebInitializer.ts:40,113-116`，直连 `http://localhost:4001/LubanCAD/v1.0/mode/*`，CORS 已配；`useEditTools`/`useSolidModeling`→`executeEditCommand` 有完整 UI 调用链）。`apps/web/shared/api/rpcClient.ts` 注释块是死代码干扰项；`/ws` 事件订阅服务端在、前端无调用方（仅 rpcClient.test.ts 引用）。

### 1.2 三服务调用图（22 边全量，关键结构）

```
FE(:3000) ──REST代理──▶ HUB(:4000)        数据 CRUD + SAS 直传 Azurite(:10000)
FE ──/auth代理──▶ MS(:4001) ──服务账号JWT──▶ HUB（SDK：briefcase/changeset/checkpoint/lock）
FE ──RPC编辑命令(HTTP)──▶ MS   FE ◀──/ipc WS──▶ MS（事务/saveChanges）
WA(:4002) ◀──HMAC webhook── HUB            HUB ──baseline/process(fire-forget)──▶ WA
WA ──baseline流程(upload-url/confirm/poll/failed)──▶ HUB
WA ──BCVV上传──▶ Azurite   WA ──转发事件/进度──▶ MS   MS ──/baseline/retry──▶ WA（环）
```

完整边表（方向/传输/发起 file:line/用途/认证/错误处理）在 T1.1/T1.2 实施时随契约整治重新钉入；此处留存关键 file:line：服务账号登录 `modeling-server/src/auth/ServiceAccountAuthClient.ts:34`；用户 JWT 校验 `main.ts:347,385,465`、`middleware/wsAuth.ts:53`；baseline 流 `webhook-agent/src/baseline-generator.ts:773-998`；恢复检查器 `webhook-agent/src/main.ts:119,285-287`；转发 `forwarder.ts:74-96`；反向外调 `modeling-server/src/main.ts:280-288`；webhook 发射 `imodelhub-services/src/webhooks/webhook-event.emitter.ts:268`。

### 1.3 官方 API 符合性判定（对照 itwins/imodels-v2/access-control-v2/webhooks-v2/storage/users 六份 OpenAPI 规格）

| 面 | 判定 |
|---|---|
| iModel/iTwins CRUD、changesets/named-versions/locks、webhook 信封/事件名、storage 上传模式 | ✅ 官方一致（storage 三步模式忠实本地化） |
| baseline 两段式 | 🟡 本地发明但与官方同构（官方为 POST 创建 `creationMode=fromBaseline` → `_links.upload` PUT → POST/GET `/imodels/{id}/baselinefile` 确认/轮询） |
| briefcase checkpoint 路径 | 🟡 HUB `briefcases/:briefcaseId/checkpoint` vs 官方 `briefcases/checkpoint`——SDK 面不可偏离，需实测核对 |
| auth 全家 | ✅ 合理本地 OIDC 替身（官方 users API 纯只读），设计保留 |
| webhook 签名 | 🟡 `sha256=` 前缀本地自加；重试策略本地；官方新建 webhook 默认 inactive 值得自查 |
| FE 的 download/copy/move | 🟠 官方无：download 是 GET 响应 `_links.download` 属性；copy≈clone；move 无对应 |

### 1.4 分级问题清单（路线图排序依据）

**P0 — 真实断裂/伪装（bug）**
1. 密码/资料管理 4 个死调用 + 失败模拟成功：MS 调 `PUT /auth/profile`、`PUT /auth/password`、`POST /auth/forgot-password`、`POST /auth/reset-password`（`main.ts:410-584`），HUB 实际为 `PATCH /auth/me`、`POST /auth/forgot/password`、`POST /auth/reset/password`（body `{hash,password}`）——用户被告知「密码已改」而实际未发生
2. 冲突检测发明 API 恒 404 → 静默空：`OpenCloudRpcImpl.ts:676,737,1055,1098` 调 `/api/imodels/.../comparison` 等，HUB 无对应 controller 且无 `/api` 前缀——version-control 🟠 的根源
3. MS catch-all `app.use('*')` 返回 200（`main.ts:592`）：错路由永不 404，系统性掩盖（含 FE 打错的 auth 边）
4. FE→HUB `download/copy/move` 断裂（`features/imodel/services/client.ts:44,127,156`）
5. 硬编码 Azurite well-known key（`webhook-agent/src/main.ts:79`）+ admin 默认口令（`modeling-server/src/main.ts:39-40`）+ 服务间 API key 全部「设了才验」= 默认裸奔

**P1 — 健壮性**
- 事件链死端：MS `/api/webhook/events`（`main.ts:260-265`）只 log 即 ack 无消费者；WA 转发器 3 次重试后丢弃、重启丢队列（内存态）
- `/ws` 推送通道前端侧死 → FE 5s 轮询进度（`useIModelsQuery.ts:86`、`EditorBriefcaseStatus.tsx:47`）
- webhook-agent：零测试、~90 console.log、空 catch（`main.ts:338` 等）、3×`IModelHost.startup()` 无配对 shutdown（`baseline-generator.ts:308,445,664`）、重启丢去重 Set（`main.ts:153`）
- `saveChanges` 热路径 ~150 行调试代码（`AppFunctionIpcHandler.ts:101-256`）
- e2e 数据依赖跳过假绿（~25 处 `test.skip`）、前端初始化吞错（`useEditorInitialization.ts:31-33,43`）、代理漂移（vite dev `/auth`→:4001 vs preview→:4000）
- 重复服务账号登录（`OpenCloudRpcImpl.ts:1124-1146` 每次裸登录 vs 缓存版 AuthClient）

**P2 — 可维护性**
- 死代码群：`modules/core+ui`（~1100 行零消费）、注释 rpcClient、viewer 占位、未注册 PatternCommand、调试 spec（test34567 等）、空 EOF 文件、服务端 `/ws` 无客户端
- `main.ts` 660 行单体、`OpenCloudRpcImpl` 1201 行、`itwinInternals` 私有 API 访问
- 契约分裂：webhook 事件类型在 WA `types.ts` 重复定义；Azurite/IMODELHUB 配置两处重复
- 文档漂移：platform-docs 不在本机但被两处引用；`modules/*`、`sketch`、`solid-primitives` 未入能力表；imodelhub CLAUDE.md 73 vs 119 端点

**P3 — 规划**
- DanQing 接入路线（现为零耦合）；imodel-native N-API 扩展升级路径（门已留）；部署拓扑（单机 compose → 内网）；markup ❌ 取舍

## 2. 目标架构（内网多用户）

### 2.1 组件职责边界

| 组件 | 职责 | 不做什么 |
|---|---|---|
| FE（luban-cad） | UI + 用户编排 | 不含业务规则 |
| MS（modeling-server） | 建模会话网关：编辑命令 RPC + `/ipc` 事务 + 认证代理 + 进度聚合 | 不持久化业务数据、不做后台作业 |
| WA（webhook-agent） | 后台作业器：baseline 生成/转换/恢复 | 不面向用户 |
| HUB（imodelhub-services） | 数据平面 SSOT：唯一持久化，官方形状 API | 不做长会话 |
| imodel-native / DanQing | MS 原生引擎（已固化）/ FE 渲染引擎（P3 接入） | — |

### 2.2 目标调用图（数据流单向化）

```
        控制面（同步）                      事件面（异步，单向）
FE ──REST(官方形状)──▶ HUB ◀──SDK(官方面)── MS          HUB ──HMAC webhook──▶ WA
FE ──RPC编辑命令──▶ MS                        WA ──作业进度──▶ MS ──/ws推送──▶ FE
FE ◀──/ipc WS(事务)──▶ MS                     WA ──baseline(官方形状)──▶ HUB
```

三个关键决策：
1. **拆环**：retry 改为 HUB 重新入队操作（HUB 已有 `admin/uninitialized` 列表，WA 5 分钟恢复轮询自然拾取）；MS 退出转发角色，环消失。代价：重试生效延迟 ≤5min（后台作业可接受）；WA 保留内部 trigger 端点供运维急用，不入服务间依赖。
2. **激活 `/ws` 推送**：WA→MS 进度经 `/ws` 推 FE，轮询降级为兜底。
3. **统一入口**：反代单域名分流（`/`→FE、`/api|/ws|/ipc`→MS、`/itwins|/imodels|/auth`→HUB）；消除 CORS 特例、端口收敛、WS token 改连接后首帧鉴权。

### 2.3 配置与密钥（目标态）

compose 级单一 `.env` 事实源；各服务 zod schema 校验、必填缺失拒启（fail-fast）；无默认密钥（首启脚本生成注入）；服务间 API key/HMAC 全强制；MS catch-all 移除。

### 2.4 契约管理

官方 6 份 OpenAPI 规格入库 `docs/api-specs/` 作对照基准；HUB SDK 面 100% 官方形状（checkpoint 路径修正）；自研边（baseline 流、WA→MS 进度）契约类型全部并入 `@luban-cad/shared`。

### 2.5 部署拓扑

一台内网服务器 docker compose（Postgres + Azurite + HUB + WA + MS + 反代 + FE 静态产物），数据卷持久化，健康检查；`start-all/verify-setup` 进化为部署验收命令。

## 3. 子项目分解（双轨制）

**Track 1 · 平台横切（先行）**

| # | 子项目 | 范围 | 验收标准 |
|---|---|---|---|
| T1.1 | API 断裂修复 | MS 4 个死 auth 调用对齐 HUB 实际路由+body；catch-all 移除 404 归位；FE download/copy/move 收敛 clone/`_links.download`；冲突检测决策落地（真实现 or 显式降级，产品决策）；checkpoint 路径实测核对+修正 | 密码修改端到端真实生效；错路径一律 404；version-control 无静默假数据 |
| T1.2 | 契约统一 | 6 份官方规格入库 `docs/api-specs/`；webhook/进度类型并入 `@luban-cad/shared`（WA 删本地副本）；baseline 命名对齐官方 `baselinefile` 形状（HUB+WA 同步，含决策确认） | 两服务零自有类型副本；SDK 面官方形状；规格入库并链接 CLAUDE.md |
| T1.3 | 配置与密钥整治 | compose `.env` 事实源；zod 校验+拒启；删全部默认密钥（首启生成注入）；API key/HMAC 强制；WS token 出 URL query | 无硬编码密钥；缺配置启动即失败并报缺项；服务间裸调 401 |
| T1.4 | 部署链统一 | 单 compose+反代；`start-all/verify-setup` 进化为部署验收；HUB 文档同步 | 内网单机一命令起全栈、一命令验收；无 CORS 特例 |
| T1.5 | 事件与进度链单向化 | 拆环（retry=HUB 重新入队）；WA 转发可靠性（持久化队列/至少一次）；`/ws` 激活、轮询降级兜底 | 调用图无环；断电重启不丢待处理事件；进度推送级到达 |

**Track 2 · 组件纵深（弱→强）**

| # | 子项目 | 范围 | 验收标准 |
|---|---|---|---|
| T2.1 | webhook-agent 整治 | Vitest 从 0（validator/forwarder/baseline 纯函数先行）；结构化日志；空 catch 治理；IModelHost 生命周期配对；去重状态持久化 | 核心路径测试覆盖；日志可检索；重启不重复触发 |
| T2.2 | modeling-server 整治 | main.ts 拆模块；OpenCloudRpcImpl 拆分+stub 清理；saveChanges 调试代码移除；登录去重；死 PatternCommand 处理 | 无超 400 行文件；热路径零调试代码；单一登录实现 |
| T2.3 | luban-cad 整治 | 死代码清除；e2e 数据依赖跳过治理（seed 或显式 fail）；初始化吞错/超时加固；代理漂移修正；markup 取舍落地 | 死代码零残留；空后端 e2e 显式失败 |
| T2.4 | HUB 部署验收链 | imodelhub-services 纳入 T1.4 compose 与验收（不改其代码） | 全栈验收含 HUB 健康面 |

**Track 3 · 集成规划（后置，spec 先行）**
- T3.1 DanQing 接入规划（渲染桥接点选型试点 spec）
- T3.2 imodel-native N-API 扩展路径（按需触发，升级门已预留）

**依赖**：T1.1 无依赖可立即开始；T1.3→T2.1；T1.2+T2.1→T1.5；T1.4→T2.4；T3 等 Track 1/2 地基稳定。

## 4. 路线图（排序 + 首发项）

排序原则：真 bug 先于债 · 安全先于便利 · 契约先于组件整治 · 弱组件先于强组件 · 集成规划垫底。

| 序 | 子项目 | 位置理由 |
|---|---|---|
| 1 | **T1.1 API 断裂修复** ⭐首发 | 无依赖纯 bug，每条都在骗用户 |
| 2 | T1.3 配置与密钥整治 | P0 安全；后续整治吃统一配置 |
| 3 | T1.2 契约统一 | 机械低险；为 4/5 铺路 |
| 4 | T2.1 webhook-agent 整治 | 最弱组件；需 T1.3 |
| 5 | T1.5 事件与进度链单向化 | 需 T1.2+T2.1 |
| 6 | T2.2 modeling-server 整治 | bug 已在 T1.1 修，本轮清内部质量 |
| 7 | T1.4 + T2.4 部署链统一 | 服务形状稳定后统一部署 |
| 8 | T2.3 luban-cad 整治 | 不影响服务端稳定性，放后 |
| 9 | T3.1 DanQing 接入规划 | 地基稳了再接渲染 |
| 10 | T3.2 imodel-native N-API 扩展 | 按需触发 |

首发项 T1.1 启动路径：本文档定稿 → T1.1 单独简短 brainstorm（内嵌产品决策：冲突检测真实现 vs 显式降级提示）→ writing-plans → SDD 执行。
