# 鲁班CAD 全程序开发任务地图（参数化特征建模 → AI 文生3D）

- 日期：2026-09-28
- 地位：本仓 CAD 程序线的**任务总清单**。架构裁决以 `2026-09-27-cad-feature-system-decision-record.md` 为准；机制证据以 `2026-09-27-cad-feature-system-evidence-base.md` 为准；v1 设计以 `2026-09-27-feature-system-imodel-architecture-design.md` 为准。
- 与 `docs/ROADMAP.md` 的关系：平台分期（Phase 0–3）一事一源仍归 platform-docs；本文是**技术任务分解**，其中 Phase 2 的技术路线（CadFeature 骨架复用、FreeCAD GCS 移植）已被 2026-09-27 裁决取代（骨架全部重做、SolveSpace 过渡+绳墨自研）。
- 排期约定：不给绝对日期；规模为相对 T-shirt（S=天级 / M=周级 / L=月级 / XL=季级以上），一切推断带 ⚠️。
- 状态标记：✅ 已存在 / 🔨 待开发（技术路线已通）/ 🔬 待自研（长线研究性）/ 📁 留档（论证可行、暂不实现）

---

## 0. 北极星与关键路径

**北极星**：对标 Onshape 的专业 CAD（约束草图 + 参数化特征 + 数据协同），在其上激活 AI Agent 文生 3D（超越 kittyCAD）。

**关键路径**：

```
T2（X1 spike，go/no-go）→ WS3 特征引擎 →┬→ WS4 草图求解 → M2 →┐
                 ↑                      ├→ WS5 协同数据链 ──────┼→ M3/M4 → WS10 AI
              WS1 内核暴露 ────────────┘→ WS6 前端 UX ─────────┘
WS8 真形 / WS9 绳墨：独立长线，经冻结接口（SolidKernel.h / solver-neutral 接口）与主线解耦
```

**一句话逻辑**：没有一步需要发明新机制——存储（元素）、依赖图（EDE）、同步（changeset）、内核（ACIS）、求解器（libslvs）都是现成件；主线写的全部代码 = 特征求值 + op 编排 + UI；长线自研（真形/绳墨）由接口契约保护，可随时平替。

---

## WS0 平台基座（✅ 已存在，维护项）

| ID | 任务 | 状态 |
|---|---|---|
| T0.1 | itwinjs-core fork + Rush 构建链 | ✅ |
| T0.2 | imodel-native 本地编译 + `replace-imodeljs-native.ps1` 替换链 | ✅ |
| T0.3 | modeling-server(:4001) / webhook-agent(:4002) / imodelhub-services(:4000) 全栈 | ✅ |
| T0.4 | 上游同步机制（sync-from-upstream.sh + UPSTREAM_SYNC.md） | ✅ 持续 |
| T0.5 | 既有草图绘制/布尔/变换工具（自由绘制，无约束无参数化） | ✅ 可作 UI 素材复用 |

## WS1 内核暴露（imodel-native，C++）🔨 —— 主线的供应线

> **2026-09-28 审查修订**：JS 侧实为**双 op 面**——`createBRepGeometry`/`BRepGeometryOperation`（core-common，12 个粗粒度 op：Unite/Subtract/Intersect/Sew/Cut/Emboss/Thicken/Hollow/Sweep/Loft/Round/Offset）与 ElementGeometryCache/`OperationType`（editor-backend `EditBuiltInCommand.ts:418-450`，**31 个 op**，即盘点所称「31-op 协议」的 JS 真身，含选择性 op Blend=24/Chamfer=25/SweepFaces=20 等）。特征引擎将同时消费两个面。另：**协议层 C++ 已自动打标**（PSBRepEdit.cpp 的 FindNodeIdRange→ChangeNodeIdAttributes→op→AddNodeIdAttributes 模式，nodeId=highest+1 由体上 id 范围派生）——D4 的确定性由「op 执行顺序确定 + rollback mark 恢复体上 id 状态」保证，**无需给 JS 协议加 nodeId 参数**；T1.1 出口标准因此改为含「全量重建后 nodeId 序列确定性」断言。

| ID | 任务 | 出口标准 | 依赖 | 规模 |
|---|---|---|---|---|
| T1.1 | TopologyID 查询 op 暴露到 JS：`FacesFromId` + **`EdgesFromId`**（圆角引用的是边）+ `IdFromFace/IdFromEdge`（拾取反查用）（C++ 实现已在 `AcisTopologyId.h:78-138`，纯接线）+ TS 声明 + **nodeId 确定性断言测试**（同链重建两遍，id 序列一致） | MS 层 TS 可调；返回集合语义正确 | — | M |
| T1.2 | 内核 rollback mark 暴露（`CreateRollbackMark`/`RollbackTo`，对应 HISTORY_STREAM bulletin） | JS 可打标/回滚；**mark 生命周期语义明确：mark 是内核会话态，模型重开=从 SAB 恢复 body+按序重跑建 mark 表**（策略写入出口文档） | — | M |
| T1.3 | validity check 暴露（`HasConsistentTopologyAndGeometry`=api_check_entity 现为内部守门） | 求值后可主动校验，结果入特征 status | — | S |
| T1.4 | TopologyID 存活性测试扩充：跨布尔/分裂/合并/序列化 roundtrip 的 id 断言 | 测试绿（Emboss 模式推广到 fillet/shell） | T1.1 | M |
| T1.5 | （后置）BodyFromFace 圆柱 seam-strip 面支持（§10.1 backlog） | 面提取/柱面草图解锁 | 🔬 | L ⚠️ |
| T1.6 | （后置）IsSameStructureAndGeometry 自建（采样+点面距，ACIS 无 PK_FACE_is_coincident 对应） | L3 缓存几何级失效判断可用 | 🔬 | M ⚠️ |
| T1.7 | （后置）装配实例化方案（ACIS 无内核 instancing，应用层元素引用+变换） | 装配阶段前置 | 🔬 | L ⚠️ |
| T1.8 | **TopologyID ↔ ElementGeometryCache 子实体桥接**：`EdgesFromId` 返回的内核边 → 几何缓存的瞬态 SubEntity id 映射（blendEdges 等选择性 op 只吃缓存 id） | 圆角可按持久引用选边 | T1.1 | M |

## WS2 EDE×BRep 闭环 spike（X1，最高风险最先杀）✅ **2026-09-28 通过（M0 达成）**

**验收结果**：`modeling-server/src/feature/spike-x1/X1EdeBrepSpike.test.ts` 5/5 绿（全量套件 15 文件 138 测试无回归；tsc/eslint 干净）。关键实证与发现：

- EDE 回调契约**完全承载 BRep 再生**：拓扑序、每节点恰一次、indirectEditTxn 写回、环/失败语义全部如文档所述工作（证据即测试断言）。
- **内核在环路径 = `IModelDb.createBRepGeometry`（BRepGeometryOperation 协议）**：`GeometryStreamBuilder.appendGeometry(实体)` 只存参数级条目、**不产生内核 BRep**（首轮失败实测）；正确路径 = `ElementGeometry.Builder.appendGeometryQuery` → `createBRepGeometry`（内核产出真 BRep entry）→ `elementGeometryBuilderParams` 写回元素。此路径即正式特征引擎的求值-写回骨架。
- **changeset 实证**：参数行 Update（isIndirect=false）与几何行 Update（isIndirect=true）同包；第二 briefcase pull 后免重算读到新几何、零回调。
- 失败级联如设计工作：非法参数 → status=1 持久化 + BodySolid 保留旧几何；修复后自愈。
- 工程细节记录：briefcase 模式锁强制（exclusive on 元素）；读几何处需 `wantGeometry:true`；HubMock 深链可导入（core-backend 无 exports 字段）。

| ID | 任务 | 状态 |
|---|---|---|
| T2.1 | LubanCAD schema v0 + JS 类注册 | ✅（SpikeFeature/SpikeBodySolid/SpikeFeatureDrives） |
| T2.2 | 最小图闭环（boxPrimitive 两特征链 + Unite 布尔，nodeId 打桩） | ✅ |
| T2.3 | 五项验收断言 | ✅ 全绿（EDE 传播/拓扑序/失败级联/跨 briefcase 免重算/changeset 行级内容） |

**结论：go。** 降级方案（MS 自驱动传播）不需要了。

## WS3 特征引擎（modeling-server FeatureService）🔨 —— 主线核心

| ID | 任务 | 出口标准 | 依赖 | 规模 |
|---|---|---|---|---|
| T3.1 ✅ | FeatureTypeRegistry：featureType → {paramSchema, evaluate(ctx,params,inputs)}；MS 层 JSON Schema 校验 | 注册表可扩展，非法参数拒收 | T2 | M |
| T3.2 ✅ | extrude（轮廓直拉，暂以显式轮廓绕过草图求解器） | 参数改→再生正确 | T2 | M |
| T3.3 ✅ | boolean add/sub | 同上 | T2 | M |
| T3.4 | fillet：**走 ElementGeometryCache 面**（`OperationType.Blend=24`，`EditBuiltInCommand.ts:443`）——注意 `createBRepGeometry` 的 `Round=10` 是「所有非光滑边」全倒角，**不能做选择性圆角**；params 存 `(nodeId,entityId)` 边引用，evaluate 经 `EdgesFromId`→缓存子实体桥接（T1.8）解引用 | 上游改形后引用自愈、可选边 | T1.1+T1.8 | M |
| T3.5 | nodeId=orderKey 确定性打标约定落地（重跑同特征打同标——协议层自动打标已顺序确定，见 WS1 修订注记；本任务=把约定固化为引擎不变式+测试） | 任意中间特征改参后全链引用不断 | T1.1 | S |
| T3.6 ✅（抑制=直通语义，0x80 冻结留 M2） | 失败级联（出边 status=1+下游跳过+旧几何保留+保持脏）+ 抑制（0x80+SuppressedShape 语义） | FreeCAD 语义等价复现 | T2 | M |
| T3.7 ✅ | 编辑管道接入：op=txn 边界，复用 basicManipulationIpc→BriefcaseTxns→saveChanges | CLAUDE.md 硬约束合规 | T2 | M |
| T3.8 | HITL 预览：rollback mark 试算→回滚，不写库 | 拖拽实时预览 | T1.2 | M |
| T3.9 | L3 输出缓存（MS 内存/SAB；参数哈希判失效——内核无几何重合判定，见 T1.6） | 命中缓存跳过内核调用 | T3.2 | M |
| T3.10 | L2 内核级重跑：回滚到特征 k 前 mark，只重跑 k..n | 长链改首特征不重算全链 | T1.2 | M ⚠️ |
| T3.11 | **D7 破坏式编辑打标**：绕开特征系统直改 BodySolid（既有 64 工具中的几何工具）→ 检测+打标 overridden+暂停自动再生；「重新参数化」入口=丢弃手工修改+全量重建（spec §3.3b） | 破坏后可标记、可恢复 | T3.7 | M |
| T3.12 | **MS 崩溃/重启恢复**：重开 briefcase + op 日志在库内（随 changeset）+ 内存缓存冷启动全量重建（第一律）+ 写租约回收 | 崩溃后重进不丢定义、不丢一致性 | T5.2 | M |

## WS4 草图与约束求解 🔨

| ID | 任务 | 出口标准 | 依赖 | 规模 |
|---|---|---|---|---|
| T4.0 | spike #3：libslvs DOF 计数 C API 暴露验证 | 欠/过约束状态可读 | — | S |
| T4.1 | solver-neutral 接口定版：`solve(entities,params,constraints,group)→{status,solvedParams,failedConstraints[]}`（绳墨平替的契约） | 接口冻结文档 | — | M |
| T4.2 | MS 进程内 libslvs 直链（权威解；纯云 SaaS，GPLv3 不触发——红线：on-prem 即污染） | 提交时权威解落库 | T4.1 | M |
| T4.3 | FE WASM libslvs（官方 build-wasmlib.sh 路径）交互拖拽解 | 拖拽免服务器往返 | T4.1 | M |
| T4.4 | 草图元素（GeometricElement3d 平面曲线）+ 草图平面定义 | 视口可见可编辑 | T2 | M |
| T4.5 | 草图入 EDE 图源节点：解算完成→草图行更新→saveChanges→下游重建 | **改草图尺寸→全零件联动**（M2 标志） | T3.2 | M |
| T4.6 | 草图编辑交互（FE 工具：绘制+约束创建+尺寸标注） | 可用 | T4.3/T4.4 | L |
| T4.7 | 约束状态显示（DOF/矛盾清单；矛盾清单 libslvs 原生支持） | UI 可见 | T4.0 | S |

## WS5 协同数据链 🔨

| ID | 任务 | 出口标准 | 依赖 | 规模 |
|---|---|---|---|---|
| T5.0 | spike #2：imodelhub-services 对 changeset description 的存取验证 | op 摘要可存取 | — | S |
| T5.1 ✅ | op 即 push 管线（FeatureService.applyOp→txn→saveChanges→push） | changeset 粒度=op 粒度 | T3.7 | M |
| T5.2 ✅ | op 日志元素（append-only：类型/特征 id/参数 old/new/用户/时间）+ description 摘要 | 审计链完整 | T5.0/T5.1 | M |
| T5.3 ✅（updateParams 范围） | 语义 undo/redo：op 日志逆向/正放成新 changeset（不依赖 txn 栈——push 后栈清空是硬事实） | 跨会话 undo/redo 一致 | T5.2 | M |
| T5.4 ✅ | 写租约：MS 按 iModel 会话级写锁（WS 会话持有+心跳+过期释放） | 同刻单编辑者；读者不限 | T5.1 | M |
| T5.5 | 同步链验证：MS push→WS 广播→前端 pull→**tile 失效刷新实测**（本地栈唯一未验证环节） | 双端秒级一致 | T5.1 | M |
| T5.6 | 📁 多人共编实现（op 队列串行+presence+per-user undo 校验失败即拒） | 留档，D8 论证已毕 | T5.4 | L ⚠️ |
| T5.7 | 📁 分支/合并原型（op 日志重放到 fork 定义；iModelHub 无此概念） | 留档 | T5.2 | L ⚠️ |
| T5.8 ✅ | **op RPC 接口定义入 `@luban-cad/shared`**（applyOp/undo/redo/租约获取释放/op 广播事件类型）——T6.x 全部前端任务的前置 | 接口包构建通过、两端引用 | — | S |

## WS6 前端 UX 🔨

| ID | 任务 | 出口标准 | 依赖 | 规模 |
|---|---|---|---|---|
| T6.1 | FeatureTreePanel 重做（读特征元素按 orderKey、失败红标/抑制灰标、拖拽排序=orderKey op；旧骨架废弃） | 对标 Onshape 特征树最小体验 | T3 | M |
| T6.2 | 参数面板（JSON Schema 驱动表单，编辑即 op） | 全特征类型可用 | T3.1 | M |
| T6.3 | 视口拾取 → 反查 `(nodeId,entityId)` → 写入特征 params（拓扑引用建立入口） | 点选面/边建引用 | T1.1 | M |
| T6.4 | 拖拽预览管道（预览 op→rollback mark→确认成真 op） | 流畅 | T3.8 | M |
| T6.5 | 草图模式 UI（平面进入/退出、栅格、捕捉） | 可用 | T4.4 | L |
| T6.6 | **M3 接线补遗**（M1 Task 9 审查实证）：`LubanFeatureRpcInterface` 须双端各补一处——后端 `main.ts` 的 `BentleyCloudRpcManager.initializeImpl` 数组 + 前端 `web-viewer/src/WebInitializer.ts` 的 `rpcInterfaces` 数组（OpenCloudRpcInterface 同款先例） | 前端可调通特征 RPC | T5.8 | S |

## WS7 测试与质量 🔨

| ID | 任务 | 出口标准 | 规模 |
|---|---|---|---|
| T7.1 | 单测体系（Vitest，mock native：注册表/校验/op 日志/EDE 边维护） | 覆盖核心逻辑 | M |
| T7.2 | 集成测试（真 briefcase+真 native：EDE 链路/失败级联/undo/抑制） | 全绿 | M |
| T7.3 | e2e（Playwright：建特征→改参→undo→双端协同） | 全绿 | M |
| T7.4 | 结构断言回归（借 kittyCAD artifactGraph 思路：EDE 图形态+TopologyID 映射作 CI 基准）——几何断言须用 `TestHost.normalizeBrepGeomJson` 归一化后比较（ACIS blob 非确定性，见风险登记第 9 条） | 进 CI | M |
| T7.5 | 性能基准（特征链长 vs 再生时间；KernelLock 全局串行下的吞吐实测；**大实体 changeset 体积实测**——证据库 §2.4：BRep blob 无分块、50MiB 阈值是 ChangesetReader 侧迹象） | 基线报告 | M |
| T7.6 | **LubanCAD schema 演进门禁**：v1 快速迭代期的 schema changeset 纪律（只加不删/只加属性不改类型）+ CI 检查 + op 日志元素 schema 归属（进同一 LubanCAD schema） | 演进规则成文+CI 拦截破坏性变更 | S |

## WS8 真形（TrueForm）自研几何内核 🔬 长线

**定位**：自主可控内核，与 ACIS 并行演进。**关键架构红利：`SolidKernel.h` 的 106 方法契约就是真形的规格书**——真形作为 BRepCore 的第二后端实现来研发，经同一契约插拔验证，永不绑架主线。

| ID | 任务 | 说明 | 规模 |
|---|---|---|---|
| T8.1 | STEP writer（从授权内核数据写 STEP） | 先行项；打通数据出口 | L ⚠️ |
| T8.2 | STEP reader + healing（reader 必须配 healing，同为自研） | ACIS InterOp 未授权的替代路径 | XL ⚠️ |
| T8.3 | 核心数据表示：拓扑（BODY/FACE/EDGE/…）+ 几何（解析+样条）+ 公差体系（对齐 SPAresabs=1e-6 惯例） | 内核地基 | XL ⚠️ |
| T8.4 | 核心算子：布尔/倒角/扫掠/偏移……逐项对标 §5 映射表 | 逐算子攻关 | XL ⚠️ |
| T8.5 | ATTRIB 等效机制（TopologyID 载体的自有版） | **没有它特征体系不可移植到真形** | L ⚠️ |
| T8.6 | 双内核对照测试（同一契约双实现，语义等价断言） | 质量基准 | L ⚠️ |

诚实估计：T8.1/T8.2 近中期可达；T8.3+ 是以年计的工程，需独立排期与团队。

## WS9 绳墨（ShengMo）自研约束求解器 🔬 长线

| ID | 任务 | 说明 | 规模 |
|---|---|---|---|
| T9.1 | 2D 草图求解核心（图分解+数值迭代 hybrid；语义对齐 libslvs：group/三态/约束 ~40 种） | solver-neutral 接口（T4.1）即规格 | XL ⚠️ |
| T9.2 | 椭圆等 libslvs 缺失实体 | 补齐过渡期天花板 | M ⚠️ |
| T9.3 | 诊断增强（矛盾定位、DOF 分析） | 超越 libslvs 的差异点 | L ⚠️ |
| T9.4 | 平替验收：与 libslvs 双跑对照集 | 接口中立保证可插拔 | M |
| T9.5 | （远期）3D 装配约束 | 装配阶段前置 | XL ⚠️ |

## WS10 AI Agent / 文生 3D（搁置项的未来激活）🔬

**前提**：特征系统 API 稳定（AI 是 op 的消费者；复用 toolId 与 HITL 管道——CLAUDE.md 硬约束原生满足）。

| ID | 任务 | 说明 | 规模 |
|---|---|---|---|
| T10.1 | 只读脚本投影（对象图→KCL 风文本，LLM 可读界面；永不作权威源，D2） | AI 消费入口 | M |
| T10.2 | op 工具面 → Agent Tools 映射（op=工具调用，预览→确认→提交管道复用） | 不建第二套建模 API | M |
| T10.3 | 验证 oracle：validity check（T1.3）+ 约束一致性三态（T4.1）= agent 环路自动验收器（参考 Claude Code 多轮工具调用+oracle 模式） | 文生 3D 质量命门 | L ⚠️ |
| T10.4 | 语义锚定（超 kittyCAD 点）：TopologyID（内核级）vs artifactGraph（源码位置锚定）——我们的锚定更深 | 差异化竞争力 | 随 T3.4 |
| T10.5 | 生成式来源标注（沿用旧 Phase 3 框架的合理部分） | 治理 | S |

## WS11 产品化与部署（长线）

| ID | 任务 | 规模 |
|---|---|---|
| T11.1 | 多人共编实现（T5.6 落地）+ 文档→MS 实例亲和部署 | L ⚠️ |
| T11.2 | 装配（多体+实例化，依赖 T1.7） | XL ⚠️ |
| T11.3 | 工程图（后置） | XL ⚠️ |
| T11.4 | on-prem 红线守护：GPL 门禁（任何客户侧二进制交付即触发 SolveSpace 污染——部署审查流程化） | S（流程） |
| T11.5 | 并行再生评估（解除 KernelLock 全局串行的代价/收益） | L ⚠️ |

---

## 里程碑

| 里程碑 | 内容 | 关键任务 |
|---|---|---|
| **M0 go/no-go** | X1 spike 通过 | T2 全部 —— **✅ 2026-09-28 达成** |
| **M1 最小参数化闭环** | 拉伸链+参数修改+undo+双端同步可演示 | T3.1-3.3、T5.1-5.5 骨架 —— **✅ 2026-09-29 达成**（分支 feature/m1-feature-engine，11 任务 SDD 执行，测试 24 文件/170 用例） |
| **M2 草图驱动** | 约束求解入环，改草图尺寸全零件联动 | T4 全部 |
| **M3 v1 特征完整** | 草图+拉伸+布尔+圆角+前端 UX 可用 | T3.4-3.6、WS6 |
| **M4 协同完整** | 租约/语义 undo/双端实时 | WS5 完整 |
| **M5 真形 STEP 通路** | writer+reader+healing | T8.1/T8.2 |
| **M6 绳墨平替** | 自研求解器替换 libslvs | T9.1-9.4 |
| **M7 文生 3D** | AI Agent 特征级生成+编辑回环 | WS10 |

## 风险登记（承接 spec §4 + 迁移 spec §10.1）

1. ~~X1（T2）是全案咽喉~~ **✅ 已消除（2026-09-28 M0）**。
2. **tile 刷新链路（T5.5）**：本地栈唯一未实测的同步环节。备注：M1 已验证 MS 侧 op=push/pull 数据链（FeatureSync.test.ts）；前端对外部 changeset 的自动 pull/tile 刷新未接线，归 WS6。
3. **KernelLock 全局串行**：v1 无感（单写者），T11.5 前是并行天花板。
4. **圆柱面操作（T1.5）**：柱面草图/面提取的前置，v1 不碰。
5. **真形/绳墨是研究性投入**：接口契约（SolidKernel.h / solver-neutral）保证主线不被自研进度绑架——这是双轨制的全部意义。
6. **双 op 面接缝（2026-09-28 审查新增）**：特征引擎跨 `createBRepGeometry`（12 粗粒度 op）与 ElementGeometryCache（31-op）两面；两面的事务/锁/缓存交互未经验证——T3.4 是最先暴露点，视情况在 WS3 前加一个 op 面选型 spike。
7. **op=push 交互延迟**：本地 hub 往返可接受（M1 演示级）；AI 批量 op 场景的合批策略（composite op=单 changeset）留为设计注记，不进 v1。
8. **内核会话态管理**：rollback mark、ElementGeometryCache 均为会话态；模型重开=重建（T1.2 出口已含 mark 表重建策略；缓存重建随 T3.12）。
9. **ACIS BRep blob 非确定性**（M1 Task 10 实证）：blob 头含时间戳+随机 ID，同参数两次求值字节不同（~75 字节）。纪律：跨求值比较一律用 `TestHost.normalizeBrepGeomJson` 归一化；同持久化 blob 可字节比。影响面：T7.4 结构断言回归、T7.5 性能基准、未来任何字节级几何断言。观察记录（2026-09-29 M1 合并树）：全量套件出现一次未复现的失败（1/5 跑，用例名未捕获）——疑属归一化秒边界或 WriteLease 1ms TTL 边界家族，再现时按此排查。
10. **【调查完成 2026-09-29·native 根因仍开放】body「中毒态」：EDE indirect 几何写静默失效**。最终画像（systematic-debugging 全程 + 探针矩阵 `debug-tail-root.test.ts`）：**分野=body 首次持久化几何的形态**——角点缺口起步（工具贴原点/贴边）→ 该 body 后续 indirect 写全部正常（X1/V3/matrix/K1/C1 全吻合）；**内嵌孔洞起步（工具内嵌于 base）→ 该 body 后续 indirect 几何写永久静默失效**（updateElement 无异常、ECSQL 原始列哈希不变=从未落库；clone/J2/suppress 留档全吻合）。已证伪：EDE/indirect 事务本身、entry 跨 op 复用、负坐标、placement/bbox 关系（J2/K1）、「链尾 root」（matrix-D 反例）。**直写路径完全免疫**（J1：中毒态 body 直写正常）。工作轨迹：角点建链→retool 内嵌（V3 实证，FeatureEngine.test 在用）。**生产影响与修复路径**：FeatureService.applyInsert 建链时若首特征即产出内嵌拓扑则触发（当前 M1 测试均健康轨迹）；应用层缓解=insert 后强制一次 retool/直写重写 body（待 M2 前实施）；根治=imodel-native C++ 排查 DgnElement::Update 间接路径对几何列的处理（跟进任务已建）。留档测试：FeatureEngine.test.ts 尾部 it.skip（中毒态）+ probe 文件克隆组。

## 审查记录

- **2026-09-28 全面审查**（X1 通过后、实现启动前）：修订 T3.4（fillet 改走 ElementGeometryCache/Blend=24，纠正误用 Round=10）；WS1 加注「双 op 面」与「协议层自动打标、D4 无需协议加参」（证据：`itwinjs-core/editor/backend/src/EditBuiltInCommand.ts:418-450`、`imodel-native PSBRepEdit.cpp:1684-1693`）；新增 T1.8（TopologyID↔缓存子实体桥接）、T3.11（D7 打标）、T3.12（崩溃恢复）、T5.8（op RPC 接口入 shared）、T7.6（schema 演进门禁）；T1.1/T1.2 出口标准补强；风险登记补 6-8。spec ↔ roadmap 映射逐条核对：修订后全覆盖。
