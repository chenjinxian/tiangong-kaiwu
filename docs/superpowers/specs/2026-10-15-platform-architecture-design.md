# 天工开物平台总架构蓝图——对标 Onshape（CAD 核心）+ KittyCAD（AI 核心）

- **日期**：2026-10-15
- **状态**：§1-§4 经用户逐节确认（2026-10-15）
- **范围**：全平台三仓（tiangong-kaiwu / luban-backend 私有 / imodelhub-services）+ 仓外内核（真形/绳墨/imodel-native 联动）
- **勘察依据**：四报告存档于 `.superpowers/sdd/2026-10-15-architecture-program/report-*.md`（平台快照/CAD 差距/KittyCAD 对标/iTwin 依赖全景）

## 0. 用户四项边界裁定

| # | 边界 | 裁决 |
|---|---|---|
| A1 | AI 核心形态 | **总线先行**：AI 服务总线把编辑器 op 管道翻成 Agent 可调用面；生成式后续迭代 |
| A2 | iTwin 基座 | **iTwin 全家桶基座 + 内核渐进**（真形/绳墨在特征求值层渐进替换，R1→R3 战略沿用） |
| A3 | P1-P5 前端波次 | **并入总计划**（RW4 重排） |
| A4 | 蓝图范围 | **全含仓外仓** |

## 1. 现状综合判断

### 1.1 已有资产（对标底座）
- **确定性建模底座**：75 注册工具 + zod 校验 FeatureOp 面 + 可撤销事务管道 + HITL 预览（previewFeatureOp）——与 Zoo「确定性引擎+工具箱」同构
- **HUB 工业骨架**：六边形 252 路由/41 表 + BullMQ 双队列 + 预签名链路 + 官方 SDK 兼容 7 场景绿 + 权限中心（2026-10-12 审计 17 P0 全关）
- **内核双轨在轨**：imodel-native 210 自有提交（ACIS 双车道引擎池）+ KERNEL-STRATEGY R1→R3 定案 + SolidKernel.h 106 方法契约（真形规格书）
- **前端地基**：P0 六件套落地（httpClient/i18n/token/toaster//documents 路由/toast）+ itwin-ui v3.22 高级件增量空间
- **契约同步在途**：auth/itwins/webhooks/accessControl 已对齐新 hub（Sync S1-S3），S4-S6 收口中

### 1.2 结构性缺口（重构着力面，按影响排序）
1. **两套建模心智并存**：参数化特征面（4 类型）vs 直改内核面（64 工具），无隔离带（D7 打标未实现）
2. **无几何的文本真相源**：Zoo=KCL；我们=op JSON 链——AI 生成目标表示缺位（最大结构性差距）
3. **平台五层缺失**：网关/BFF（D2 前端直连双后端）、事件总线（D5 四跳三协议）、统一权限面（D6 三套模型并存+MS 不感知租户）、可观测聚合（D8）、契约中心（无机器可消费 spec）
4. **安全必修债**（D3：RPC 无鉴权+任意文件 IO+getAccessToken 回传）
5. **MS 单点**（D1：内存态+原生库不可入 Linux 容器——部分可解）
6. **AI 运行时为零**（AI-ARCHITECTURE.md 三层设计完成、实现空白）

## 2. 目标架构（分层）

```
L5 前端（apps/web）Onshape IA —— EditorShell + viewer-core 收编 + AI 对话工作台面
L4 API 网关/BFF（新）—— 统一同源面·认证终结·限流·CORS 单点·契约中心(OpenAPI)
L3 AI 服务总线（新）         | L3' 业务服务
   agent harness            |   imodelhub(HUB) 身份/文档/权限/版本
   工具注册 zod→Schema      |   modeling-server CAD 核心
   会话三元组·上下文供给     |   webhook-agent baseline 管道
   流式·模型路由·HITL        |
L2 服务治理（渐进）—— 事件总线·统一权限面·可观测聚合
L1 内核层 —— R1 ACIS（现状）→ R3 真形（渐进）；绳墨求解；imodel-native 引擎池·solver-neutral 冻结契约
```

### 三条架构主线
1. **CAD 核心线**：两套建模心智收敛为「特征 op 面」单一心智——直改工具收编为特征执行通道（D7）；特征类型 4→8→数十种渐进；**op 链可序列化为可读 DSL**（人审 diff 载体 + AI 生成目标表示——「KCL 等价物」）
2. **AI 核心线**：ai-service 总线先行——FeatureOp zod→JSON Schema 工具化、previewFeatureOp 即 HITL、会话三元组落库（接受/撤销=真值标注）、上下文供给（特征树+草图+视口快照）
3. **平台线**：网关/BFF 收 D2/D4/D12，D3 安全必修，契约中心起步；事件总线/可观测/权限收敛按规模渐进（RW6）

## 3. 重构战役（RW0-RW6）

### RW0 地基收口（在途）
Sync S4-S6：私有仓适配（预签名主机改写层+SDK 收紧+cosmetic）→ 新栈验收（收口 P0-T10）→ 配对发布。
**门**：全量 e2e 绿 + verify-stack 14/14。附：收口后立即跑一次 itwinjs-core 上游同步+全量回归（基线刷新，R2 缓解）。

### RW1 安全与网关（平台线，最高优先）
- D3 安全必修：RPC 面 guard；裁剪 readExternalFile/writeExternalFile/getAccessToken
- 网关/BFF：Node 薄层（统一同源面/认证终结/限流/CORS 单点）；nginx HUB 上游参数化（D12）
- 契约中心：OpenAPI spec 从 TS interface 生成（LubanFeatureRpcInterface+services 面先行）
**门**：安全三项清零（渗透自测）+ 前端同源单面化 + spec 生成管线落地。

### RW2 CAD 核心收敛（CAD 线）
- D7 破坏式编辑打标（overridden 标记+暂停再生——两套心智隔离带）
- **op DSL v1**：FeatureOp 链↔可读 DSL/JSON 脚本双向序列化（命名参数+注释位）——序列化格式而非语言（裁决#1）
- 特征类型扩展第一批：revolve/chamfer/shell/pattern 特征化（直改工具收编）：4→8 类型
- 顺手清债：UndoManager 假成功 no-op、PatternTools ID bug、PatternCommand 死码注册、deleteSketch op
**门**：demo-flow 扩幕（新类型）+ op DSL 往返恒等测试。

### RW3 AI 总线（AI 线一期，与 RW2 部分并行）
- ai-service 新服务：agent harness（Plan→Act→Observe→Update；失败自动修≤5 次后停——Zookeeper 范式）
- 工具注册：FeatureOp zod→JSON Schema 自动生成（10 op 第一版工具集）+ 75 toolId 暴露；MCP 接入面
- 会话三元组：对话历史+工具轨迹+事务点落 HUB（裁决#5）
- 上下文供给：getFeatureTree+getSketch+视口快照
- 流式通道：复用 /ws WS 面或 SSE
- 前端 AI 侧栏：EditorShell 预留位（裁决#4），Zookeeper 式对话工作台 v1
**门**：e2e「prompt→op→预览→确认→提交」全链 + HITL 零新建（复用 previewFeatureOp）。

### RW4 前端 Onshape IA（原 P1-P5 并入重排）
P1 认证三页+404 → P2 Documents → P3 Detail+Share（消费 S3 重写 clients）→ P4 EditorShell（预留 AI 侧栏位）→ P5 Settings+收尾。基准沿用 2026-10-14 前端 spec 的 §3 矩阵；执行细节按 RW1 BFF 面校准。

### RW5 数据飞轮+生成式起步（AI 线二期）
反馈采集（接受/撤销回流）→ eval 基准（demo-flow 24 幕→prompt→期望特征树）→ 生成回路（text→op DSL→执行→读错→修≤5→快照审阅）→ 模型路由产品化（Auto/Standard/Thoughtful 用户开关）。

### RW6 平台深水区（按需启动）
MS 会话态外置（writeLeases/wsClients/progressMap→Redis）渐进无状态化；事件总线评估；可观测聚合（collector+dashboard+trace 传播）；权限面收敛 D6；多实体 Part Studio/装配 instancing（L1 依赖，与真形 R2/R3 联动）。

### 依赖图
```
RW0 ──→ RW1 ──→ RW3 ──→ RW5
 │        │  ↘ RW2 ──↗（op DSL 是 RW5 生成目标前置）
 │        └──→ RW4（与 RW2/RW3 并行；仅 EditorShell AI 位需设计协同）
 └──（RW6 独立按需）
```

## 4. 风险登记与裁决清单

### 风险 Top 8
| # | 风险 | 缓解 |
|---|---|---|
| R1 | fork editor 同步风险变现（EditorBuiltInIpc 672 行扩展） | RW1 契约中心先行（接口变更可检测）；「复活工具迁出收编独立包」排 RW2 尾部评估 |
| R2 | 上游 12 天漂移 | RW0 收口后立即 sync+全量回归刷新基线 |
| R3 | op DSL 过早冻结束缚特征 v2 | v1=序列化格式非语言，与 FeatureOp 判别联合同构互转；语言化推迟特征 v2 后 |
| R4 | MS 单点在 AI 场景放大（长任务×单写者串行） | RW3 按任务队列+乐观并发设计预留；RW6 外置根治；D8 单写者定案不推翻 |
| R5 | AI 生成质量无基线 | RW5 eval 先于生成能力（demo-flow 改造）；上线即积累真值 |
| R6 | BFF 增加一跳延迟与运维面 | 薄层无业务逻辑；nginx 保留 L7 静态面 |
| R7 | 三仓 link: 耦合×重构并发 | 既有纪律沿用（rush build 先行/link: 计数核对/copy-native）；每波验收含三仓联动冒烟 |
| R8 | 范围失控 | 波次门禁制（每波独立 spec+plan+e2e）；缺口登记制；RW6 显式按需 |

### 裁决清单（可推翻）
| # | 裁决 | 代价若错 |
|---|---|---|
| 1 | op DSL v1=序列化格式非语言 | 特征 v2 后一次 DSL 升版（互转层保证迁移可控） |
| 2 | AI 总线复用 previewFeatureOp 不新建 HITL | 若不敷 agent 用（批量 op 预览），RW3 内扩一次 |
| 3 | RW1 前置 RW3（安全先于 AI） | BFF 工期长则 AI 先内部鉴权起步，网关后补 |
| 4 | P4 EditorShell 只预留 AI 位不实现 | 两波间一次接口对齐成本 |
| 5 | 会话三元组落 HUB 不建独立库 | 读写压力失衡则 RW5 迁移 |
| 6 | 事件总线/可观测归 RW6 按需 | 规模先到则提前插队 |

## 5. 强制约束（全波次继承）
- 官方客户端源码强制参考（D:\Github 七检出；memory: official-client-sources）
- 状态诚实（✅🟠⚪❌）/ 复用优先（iTwin 工具生命周期/事务可撤销硬约束）/ AI 复用 toolId 禁二套 API / HITL 破坏性操作
- 命名家族：天工开物/鲁班CAD/真形/绳墨
- 三仓纪律：改 fork 须 rush build；link: 禁 pnpm add；私有仓装后 copy-native；每波 e2e 绿门禁
