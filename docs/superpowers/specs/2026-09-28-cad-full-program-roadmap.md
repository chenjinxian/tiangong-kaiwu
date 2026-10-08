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

## WS1 内核暴露（imodel-native，C++）✅ **2026-09-30 达成（T1.1-T1.4 全达）** —— 主线的供应线

> **2026-09-30 达成注记**：TopologyID 查询族=op31-34（`PSBRepOperation.h`：31=TopologyIdFromSubEntity/32=FacesFromId/33=EdgesFromId/34=AllTopologyIds）、validity check=op35（ValidateBody），已全部入 `PSBRepEdit.cpp` 的 op switch 读通道；rollback mark 取快照载体（`_Save`/`_RestoreEntityFromMemory`，markId 保号+按元素隔离，作废口径与生命周期语义见出口标准与 imodel-native 结论文档）；JS 侧 `TopologyId.test.ts` 确定性/往返断言绿。回归基线：modeling-server vitest 26 文件 197 过/10 skip（当时含中毒态留档 skip——native-assault 幻影定案后已翻转启用，见风险 #10）/tsc 0 错/eslint 0 错；imodel-native ctest 13 套中 9 绿——**WS1 直接相关的 BRepCoreTest 与 PSBRepGeometryTest 全绿**；4 套失败（BentleyTest 1 例符号链接权限、UnitsTest 1 例方位角格式化、GeoCoordTests 1306 例 GCS 数据目录缺失、iModelPlatformTest 17 例 GCS/字体族）与 WS1 改动面（PSBRepGeometry + PlatformLib.h 增量虚方法 + addon wire）零重叠，判为环境与数据性既有失败。T1.5-T1.7 后置项与 T1.8 桥接验证（留 M3 T3.4）不动。

> **2026-09-28 审查修订**：JS 侧实为**双 op 面**——`createBRepGeometry`/`BRepGeometryOperation`（core-common，12 个粗粒度 op：Unite/Subtract/Intersect/Sew/Cut/Emboss/Thicken/Hollow/Sweep/Loft/Round/Offset）与 ElementGeometryCache/`OperationType`（editor-backend `EditBuiltInCommand.ts:418-450`，**31 个 op**，即盘点所称「31-op 协议」的 JS 真身，含选择性 op Blend=24/Chamfer=25/SweepFaces=20 等）。特征引擎将同时消费两个面。另：**协议层 C++ 已自动打标**（PSBRepEdit.cpp 的 FindNodeIdRange→ChangeNodeIdAttributes→op→AddNodeIdAttributes 模式，nodeId=highest+1 由体上 id 范围派生）——D4 的确定性由「op 执行顺序确定 + rollback mark 恢复体上 id 状态」保证，**无需给 JS 协议加 nodeId 参数**；T1.1 出口标准因此改为含「全量重建后 nodeId 序列确定性」断言。

| ID | 任务 | 出口标准 | 依赖 | 规模 |
|---|---|---|---|---|
| T1.1 ✅（2026-09-30，op31-34+确定性断言） | TopologyID 查询 op 暴露到 JS：`FacesFromId` + **`EdgesFromId`**（圆角引用的是边）+ `IdFromFace/IdFromEdge`（拾取反查用）（C++ 实现已在 `AcisTopologyId.h:78-138`，纯接线）+ TS 声明 + **nodeId 确定性断言测试**（同链重建两遍，id 序列一致） | MS 层 TS 可调；返回集合语义正确 | — | M |
| T1.2 ✅（2026-09-30，rollback mark 快照载体+语义文档） | 内核 rollback mark 暴露（`CreateRollbackMark`/`RollbackTo`，对应 HISTORY_STREAM bulletin） | JS 可打标/回滚；**mark 生命周期语义明确：mark 是内核会话态，模型重开=从 SAB 恢复 body+按序重跑建 mark 表**（策略写入出口文档） | — | M |
| T1.3 ✅（2026-09-30，op35） | validity check 暴露（`HasConsistentTopologyAndGeometry`=api_check_entity 现为内部守门） | 求值后可主动校验，结果入特征 status | — | S |
| T1.4 ✅（2026-09-30，C++ 测试+JS 确定性） | TopologyID 存活性测试扩充：跨布尔/分裂/合并/序列化 roundtrip 的 id 断言 | 测试绿（Emboss 模式推广到 fillet/shell） | T1.1 | M |
| T1.5 | （后置）BodyFromFace 圆柱 seam-strip 面支持（§10.1 backlog） | 面提取/柱面草图解锁 | 🔬 | L ⚠️ |
| T1.6 | （后置）IsSameStructureAndGeometry 自建（采样+点面距，ACIS 无 PK_FACE_is_coincident 对应） | L3 缓存几何级失效判断可用 | 🔬 | M ⚠️ |
| T1.7 | （后置）装配实例化方案（ACIS 无内核 instancing，应用层元素引用+变换） | 装配阶段前置 | 🔬 | L ⚠️ |
| T1.8 | **TopologyID ↔ ElementGeometryCache 子实体桥接**：`EdgesFromId` 返回的内核边 → 几何缓存的瞬态 SubEntity id 映射（blendEdges 等选择性 op 只吃缓存 id）。**2026-09-30 标注：op32/33 返回缓存子实体 id 已天然桥接——留 M3 T3.4 验证** | 圆角可按持久引用选边 | T1.1 | M |

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
| T3.4 ✅（2026-10-04 M3-a） | fillet：**走 ElementGeometryCache 面**（`OperationType.Blend=24`，`EditBuiltInCommand.ts:443`）——注意 `createBRepGeometry` 的 `Round=10` 是「所有非光滑边」全倒角，**不能做选择性圆角**；params 存邻面对引用（**裁决 D-1**：op33 契约倒逼，改两邻面 TopologyID 对非单边 id，面对=集语义全边 blend）；evaluate 经预求值通道+scratch 载体（**裁决 D-2/D-3**）+原生修改 op 静默 no-op 修复（imodel-native aacbcf2d0，Blend/Chamfer/Offset/Hollow/Delete/Transform 全族受益）解引用 | 上游改形后引用自愈、可选边 | T1.1+T1.8 | M |
| T3.5 ✅（2026-10-04 M3-a） | nodeId=orderKey 确定性打标约定落地（重跑同特征打同标——协议层自动打标已顺序确定，见 WS1 修订注记；本任务=把约定固化为引擎不变式+测试）——确定性两遍重跑+引用自愈臂已落（FilletFlow 9/9） | 任意中间特征改参后全链引用不断 | T1.1 | S |
| T3.6 ✅（抑制=直通语义，0x80 冻结留 M2） | 失败级联（出边 status=1+下游跳过+旧几何保留+保持脏）+ 抑制（0x80+SuppressedShape 语义） | FreeCAD 语义等价复现 | T2 | M |
| T3.7 ✅ | 编辑管道接入：op=txn 边界，复用 basicManipulationIpc→BriefcaseTxns→saveChanges | CLAUDE.md 硬约束合规 | T2 | M |
| T3.8 ✅（2026-10-04 M3-a，口径改道裁决 D-4） | HITL 预览：~~rollback mark 试算→回滚~~→**影子求值**（复制特征缓存为 shadow Map 试算脏子链，零写库；mark 的 TS 调用面在 itwinjs-core 零存在，提升成本高于收益，mark 保留给 T3.10 届时再补）；v1 预览反馈=「成功/失败/受影响清单」级（previewOp RPC），视口几何级实时预览列后续增强 | 拖拽实时预览 | T1.2 | M |
| T3.9 | L3 输出缓存（MS 内存/SAB；参数哈希判失效——内核无几何重合判定，见 T1.6） | 命中缓存跳过内核调用 | T3.2 | M |
| T3.10 | L2 内核级重跑：回滚到特征 k 前 mark，只重跑 k..n | 长链改首特征不重算全链 | T1.2 | M ⚠️ |
| T3.11 | **D7 破坏式编辑打标**：绕开特征系统直改 BodySolid（既有 64 工具中的几何工具）→ 检测+打标 overridden+暂停自动再生；「重新参数化」入口=丢弃手工修改+全量重建（spec §3.3b） | 破坏后可标记、可恢复 | T3.7 | M |
| T3.12 | **MS 崩溃/重启恢复**：重开 briefcase + op 日志在库内（随 changeset）+ 内存缓存冷启动全量重建（第一律）+ 写租约回收 | 崩溃后重进不丢定义、不丢一致性 | T5.2 | M |

## WS4 草图与约束求解 🔨 **M2 后端闭环 2026-09-30 达成（T4.0/4.1/4.2/4.4/4.5/T4.8）；T4.3/T4.6/T4.7 归 M2-UX**

> **2026-09-30 M2 达成注记**：solver-neutral 契约冻结（T4.1，绳墨平替入口）→ libslvs 源引入 + DOF C API 验证（T4.0）→ node-gyp 原生插件进程内直链（T4.2：三态契约实装 + 锚定 dof 语义 + 实体引用两趟合成/句柄重映射，权威解落库）→ Sketch 元素 schema（T4.4，solver-neutral 数据基座）→ 草图入 EDE 图源节点（T4.5：sketchProfileFrom 读侧 + 闭合链边构建 + extrude 消费 sketchId）。**M2 出口实证 = 改草图尺寸（updateSketchConstraint）→ 求解 → 全零件联动**。回归基线：modeling-server vitest 29 文件 255 过/9 skip（中毒态留档——native-assault 幻影定案后翻转启用，见风险 #10）/tsc 0 错/eslint 仓级既有基线不变。UX 交互面（T4.3/T4.6/T4.7 + 后端闭环期遗留债）归 **M2-UX 后续计划**（见泳道尾部清单）。

| ID | 任务 | 出口标准 | 依赖 | 规模 |
|---|---|---|---|---|
| T4.0 ✅（2026-09-30） | spike #3：libslvs DOF 计数 C API 暴露验证 | 欠/过约束状态可读 | — | S |
| T4.1 ✅（2026-09-30） | solver-neutral 接口定版：`solve(entities,params,constraints,group)→{status,solvedParams,failedConstraints[]}`（绳墨平替的契约） | 接口冻结文档 | — | M |
| T4.2 ✅（2026-09-30） | MS 进程内 libslvs 直链（权威解；纯云 SaaS，GPLv3 不触发——红线：on-prem 即污染） | 提交时权威解落库 | T4.1 | M |
| T4.3 ✅**已裁决 2026-09-30：MS 往返** | 交互求解=FE 经 WebSocket 节流发 solve 到 MS（SlvsSolver 已在）——Onshape 先例（全服务端求解+协议优化）+零 GPL conveying 义务；绳墨 WASM 为将来免费升级 | 拖拽预览（本地栈 ~5-20ms） | T4.2 | M |
| T4.4 ✅（2026-09-30） | 草图元素（GeometricElement3d 平面曲线）+ 草图平面定义 | 视口可见可编辑 | T2 | M |
| T4.5 ✅（2026-09-30，出口实证） | 草图入 EDE 图源节点：解算完成→草图行更新→saveChanges→下游重建 | **改草图尺寸→全零件联动**（M2 标志） | T3.2 | M |
| T4.6 🔨 **归 M3-b**（原 M2-UX 后续计划） | 草图编辑交互（FE 工具：绘制+约束创建+尺寸标注） | 可用 | T4.3/T4.4 | L |
| T4.7 🔨 **归 M3-b**（原 M2-UX 后续计划） | 约束状态显示（DOF/矛盾清单；矛盾清单 libslvs 原生支持） | UI 可见 | T4.0 | S |
| T4.8 ✅（2026-09-30） | **建链轨迹规范化**（原定位「风险 #10 唯一防御」——native-assault 幻影定案后**降格为纵深冗余**：中毒态系 sweep 双因子缺陷的 no-op 观测，写路径无缺陷可防；两步制机制保留——布尔插入先插角点工具、立即 updateParams 到目标参数，杜绝「内嵌孔洞起步」退化轨迹入链。**M2 终审 I2 补钉**：布尔拒收 sketchId（Registry booleanSchema）——否则两步制引导参数 `{...params, profile:normalize([])}` ≡ 目标参数，被草图驱动布尔绕过） | applyInsert 建链不再以内嵌退化拓扑起步 | T3.3 | S |

### M2-UX 待办清单（2026-09-30 M2 收口移交；UX/交互面债务，不阻塞 M3 主线）

1. **草图 op 不可撤销**（UX 债）：updateSketchConstraint 入 oplog 但 opType 不可逆，undo 语义未覆盖草图——需定「仅参数修改」之外的草图逆 op。
2. **布尔特征的草图驱动显式支持**（M2 终审 I2 后状态）：Registry booleanSchema 已按类型**拒收**布尔+sketchId（曾以「zod 剥离未知键」防御，实测 no-op——引擎类型无关消费 sketchId、两步制建链被绕过）；若未来要支持，须先解决 T4.8 两步制与草图驱动布尔的交互。
3. **chainClosedLoop 端点容差吸附**：现 1e-6 硬容差 + 断链守卫（点数守卫报错），交互面需要可见的端点吸附/断链诊断。
4. **updateParams 守卫错误信息的 UI 呈现**：草图驱动特征被内联 params 覆写时拒收（sketchId 不匹配），错误文案需到前端可见。
5. ~~FE WASM libslvs（=T4.3）~~ **已裁决 2026-09-30：MS 往返**——浏览器侧分发 GPL 派生二进制=conveying 触发源码邀约义务，裁定不背；Onshape 全服务端求解先例支撑天花板。
6. **草图编辑交互（=T4.6）**：绘制+约束创建+尺寸标注的 FE 工具面。
7. **约束状态显示（=T4.7）**：DOF/矛盾清单 UI。

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
| T6.1 ✅（2026-10-04 M3-a） | FeatureTreePanel 重做（读特征元素按 orderKey、失败红标/抑制灰标、排序=orderKey op；v1 以上下移按钮实现排序 op 化——拖拽 UI 为增强不阻塞出口；旧骨架废弃） | 对标 Onshape 特征树最小体验 | T3 | M |
| T6.2 ✅（2026-10-04 M3-a） | 参数面板（JSON Schema 驱动表单——五 kind 字段表单模型经 RPC 下发渲染，编辑即 op，守卫错误呈现） | 全特征类型可用 | T3.1 | M |
| T6.3 ✅（2026-10-04 M3-a） | 视口拾取 → 反查 `(nodeId,entityId)` → 写入特征 params（拓扑引用建立入口；拾取反查经 op31+op7 组合解邻面对，出口「点选面/边建引用」以边实现——fillet 消费面；纯面引用消费方不存在于 M3 范围） | 点选面/边建引用 | T1.1 | M |
| T6.4 ✅（2026-10-04 M3-a，反馈级口径） | 拖拽预览管道（预览 op=previewOp 影子求值→确认成真 op；v1 交付=debounce 试算+成功/失败反馈徽标，非视口几何级——D-4 已知边界） | 流畅 | T3.8 | M |
| T6.5 🔨 **M3-b** | 草图模式 UI（平面进入/退出、栅格、捕捉） | 可用 | T4.4 | L |
| T6.6 ✅（2026-10-04 M3-a） | **M3 接线补遗**（M1 Task 9 审查实证）：`LubanFeatureRpcInterface` 须双端各补一处——后端 `main.ts` 的 `BentleyCloudRpcManager.initializeImpl` 数组 + 前端 `web-viewer/src/WebInitializer.ts` 的 `rpcInterfaces` 数组（OpenCloudRpcInterface 同款先例）。**改名裁决**：interfaceName `"luban-cad/features-v1"` → `"LubanFeatureRpcInterface"`（BentleyCloudRpcProtocol 按 `-` 切 operationId/按 `/` 截 path，旧名永远寻址不到——潜伏缺陷，因从未被传输消费而未爆） | 前端可调通特征 RPC | T5.8 | S |

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
| **M2 草图驱动** | 约束求解入环，改草图尺寸全零件联动 | T4 全部 —— **✅ 2026-09-30 达成（后端闭环——改草图尺寸→求解→全零件联动实证；UX 交互归 M2-UX）**（分支 m2-sketch-solver，7 任务 SDD，测试 29 文件/255 过/9 skip） |
| **M3 v1 特征完整** | 草图+拉伸+布尔+圆角+前端 UX 可用 | T3.4-3.6、WS6 —— **M3-a ✅ 2026-10-04 达成**（fillet+特征树/参数面板/拾取引用/预览管道半壁 = T3.4/T3.5/T3.8/T6.1-T6.4/T6.6；草图 UX 半壁 = T6.5/T4.6/T4.7 归 **M3-b**） |
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
6. **双 op 面接缝（2026-09-28 审查新增）**：特征引擎跨 `createBRepGeometry`（12 粗粒度 op）与 ElementGeometryCache（31-op）两面；两面的事务/锁/缓存交互未经验证——T3.4 是最先暴露点，视情况在 WS3 前加一个 op 面选型 spike。**2026-09-30 补注：31-op 通道确认已实现（PSBRepEdit.cpp op switch，op31-35 已入该通道）**。**2026-10-04 结案注：T3.4 已验证——fillet 求值跨两面混合调用序（scratch 载体缓存通道 op32/33/34/Blend + 真实库 createBRepGeometry 粗粒度 op）稳定无崩溃无串扰（FilletFlow 9/9 + 探针臂全过），接缝风险实证消除**。
7. **op=push 交互延迟**：本地 hub 往返可接受（M1 演示级）；AI 批量 op 场景的合批策略（composite op=单 changeset）留为设计注记，不进 v1。
8. **内核会话态管理**：rollback mark、ElementGeometryCache 均为会话态；模型重开=重建（T1.2 出口已含 mark 表重建策略；缓存重建随 T3.12）。
9. **ACIS BRep blob 非确定性**（M1 Task 10 实证）：blob 头含时间戳+随机 ID，同参数两次求值字节不同（~75 字节）。纪律：跨求值比较一律用 `TestHost.normalizeBrepGeomJson` 归一化；同持久化 blob 可字节比。影响面：T7.4 结构断言回归、T7.5 性能基准、未来任何字节级几何断言。观察记录（2026-09-29 M1 合并树）：全量套件出现一次未复现的失败（1/5 跑，用例名未捕获）——疑属归一化秒边界或 WriteLease 1ms TTL 边界家族，再现时按此排查。
10. **【幻影定案 2026-09-30·已治愈】body「中毒态」= sweep 双因子缺陷的 Subtract no-op 观测（EDE 写路径无辜）**。终局（native-assault 泳道，2026-09-30）：**内嵌工具从未真正切削**——**C++ 因子**：imodel-native `PSBRepCreate.cpp` Sweep case `createSheet` 旗标漏取反（官方 `IsAnyRegionType ^ 1`，ida :1254-1258 直证），region 剖面恒出零厚 sheet（已修 4a98c0820）；**JS 因子**：`FeatureEngine.ts` sweepProfile 闭合点去重→Loop 内几何开线→ACIS ewire 缺口→`api_skin_wires` 端盖失败退化 sheet（已修 a9eb19c：显式补 pts[0] 闭合收尾）。双因子任一在即 sweep 产物=壳；内嵌工具的壳面与 base 壳面几何不相交（体足迹重叠）→ Subtract 恒 no-op——历史上「内嵌孔洞起步→后续 indirect 写永久失效」的全部观测（陈旧体落库/列哈希不变/跨进程持久/rebuildAll 不可恢复/子进程复现/直写免疫）均为 **no-op 重序列化的正确行为**：EDE indirect 写通道自始健康、直写/间接写无分野，「静默不落库」与「落库陈旧内核体」两代改判一并被 no-op 解释取代。实证链：坐标 L1-L5 全层保真、唯一丢失层=体语义（见 `.superpowers/sdd/native-assault/task-2-report.md`）；翻转钉零残留（suppress 三臂=会话内/同进程重开/子进程全部「移除真孔」，260 过三轮满套件，见 task-2b-report）。**表述勘定**：「应用层缓解不可能」「建链轨迹规范化=唯一防御」「阻塞 M2」随幻影定案废止——两步制保留为纵深冗余（生产码注释已改，T4.8）；debug-tail-root 调查矩阵=方法论资产留档（探针臂 skip 保留、翻转钉转正）。**附带新契约**：4 点 Loop（隐式闭合）剖面 sweep 仍出 sheet=内核契约（开线端盖失败退化，非缺陷）——特征引擎剖面构造须守「显式闭合链」约定（JS 侧已落 pts[0] 收尾）。历史调查留档：imodel-native `docs/superpowers/specs/2026-09-29-poisoned-state-findings.md`（其 FNV 指纹法/证伪清单仍是有效方法论资产，结论段已加定案框）。
11. **【已治愈 2026-09-30·native-assault】fork 逆向重建的 PSBRepGeometry 三项原生缺陷——全部闭环**：**③ 中毒态落库陈旧体 = 幻影定案**（非独立缺陷，实为风险 #10 的 sweep 双因子 no-op 观测；C++ 因子已修 4a98c0820，见第 10 条）。**① GeometryCache 异步 populate 摄取持久化 BRep entry 硬崩 + ② 内核状态物化 op（op 读通道/createRollbackMark）后同会话异步缓存调用硬崩 0xC0000005 = 同根一修**——ACIS 内核上下文（bulletin board/history stream/error state）每线程一份，worker 线程未 `api_start_modeller` 即触任何 `api_*` 必崩（①崩于 `api_restore_entity_list_file`、②崩于 `~AcisKernelEntity`→`api_del_entity`，原「疑线程亲和」坐实为缺每线程内核注册；printf 二分一轮定界）；修复 = `AcisKernelManager::EnsureSessionStarted` thread_local 懒注册（135 内核入口零改动全覆盖，含析构路径）+ 注册分支纳入 KernelLock（73faeb924+bb3c4e19e），回归钉 `WorkerThreadKernelAccess_SaveRestoreDelete`。**M3 前置全解除**：T3.4 解锁（附带修复 Sweep 产物 nodeId=1 不打标——op31-34 在 Sweep 产物修前恒死火）；T3.8「异步缓存调用收敛在首个内核态物化 op 之前」操作律**解除**（probe-t6 八臂全过，消费面可按普通调用序写）。登记 = imodel-native `docs/superpowers/specs/2026-09-30-native-defects-backlog.md`（三项均已标已修）；复现物 `segfault-repro/`/`probe-t6/` 按修复判据复验后归档。
12. **【2026-09-30 M2 终审 I3 登记】CI 缺位+原生构建依赖（M2 首次）**：modeling-server 门禁（vitest/tsc/eslint）仅本机跑；libslvs 原生构建依赖仓外 SolveSpace 克隆 + submodule 钉子（Eigen `3147391d`/mimalloc `f81bf1b3`）+ `EIGEN_DIR`/`MIMALLOC_DIR` 环境变量（bootstrap 步骤见 `modeling-server/native/slvs/VENDOR.md`「新机器 bootstrap」节）——换机/协作者/回归均无守门。中期补 CI workflow（缓存 `slvs.node` 产物或容器化工具链）。

## 审查记录

- **2026-09-28 全面审查**（X1 通过后、实现启动前）：修订 T3.4（fillet 改走 ElementGeometryCache/Blend=24，纠正误用 Round=10）；WS1 加注「双 op 面」与「协议层自动打标、D4 无需协议加参」（证据：`itwinjs-core/editor/backend/src/EditBuiltInCommand.ts:418-450`、`imodel-native PSBRepEdit.cpp:1684-1693`）；新增 T1.8（TopologyID↔缓存子实体桥接）、T3.11（D7 打标）、T3.12（崩溃恢复）、T5.8（op RPC 接口入 shared）、T7.6（schema 演进门禁）；T1.1/T1.2 出口标准补强；风险登记补 6-8。spec ↔ roadmap 映射逐条核对：修订后全覆盖。
- **2026-09-30 M2 终审修复波**（whole-branch review @ m2-sketch-solver b3cab67f81，裁决 With fixes）：**I1** updateParams 闸门对称化——存储无 sketchId 的内联特征被带 sketchId 的 op 覆写原会「挂上」草图却不建 sketch→feature 边、不 ensureSketchSolved，现拒收（`内联特征不支持挂接草图`）；**I2** 布尔+sketchId 由「zod 剥离」改为 Registry booleanSchema 按类型拒收（剥离防御实测 no-op：引擎类型无关消费 sketchId、两步制建链被绕过——T4.8 行已补注，M2-UX 清单第 2 条改写为显式支持单裁）；**I3** 原生构建绑定登记风险 #12 + VENDOR.md「新机器 bootstrap」。文档对齐：`@luban-cad/shared` ExtrudeParams 注释、FeatureTypeRegistry/FeatureService/FeatureEngine 注释同步改述「布尔拒收 sketchId」。回归：modeling-server vitest 29 文件 258 过/9 skip、tsc 0 错、eslint 仓级既有基线不变。
- **2026-09-30 native-assault 泳道（风险 #11 backlog 三项攻坚，四任务 SDD + 各任务审查循环）**：native-① 内核 sweep 位置复现钉（96d422f，「位置完美保持」实证——「sweep 变换未应用」假设在 C++ 内核层证伪，嫌疑收窄 entry 生产/解码侧）→ native-② 全链坐标定界——坐标 L1-L5 全层无损、唯一丢失层=体语义（sheet vs solid），双因子=C++ Sweep `createSheet` 旗标漏取反（ida 直证，4a98c08 已修）+ JS sweepProfile 闭合点去重→开线退化（tiangong 侧 a9eb19c 一行修）；native-②b 中毒态钉翻转 + region-solid 接线回归钉（75dd05d..33ff9f0，审查 round1：探针臂 300s 超时+stderr 入错信、四处过时 prose 改幻影定案口径含生产码 FeatureService「历史防御/纵深冗余」）→ native-③ ①②硬崩同根定界（ACIS 内核上下文每线程一份）+ thread_local 懒注册修复（73faeb9..bb3c4e1，审查 round1：注册分支纳入 KernelLock）。**定案三连：风险 #10 中毒态=幻影（EDE 写路径无辜，本登记第 10 条整段改写）；风险 #11 ①②③全治愈（第 11 条整段改写）；T3.8 异步收敛操作律解除**。附带定案：Sweep 产物 nodeId=1（op31-34 在 Sweep 产物解死火，T3.4 前置清空）；4 点 Loop（隐式闭合）出 sheet=内核契约（特征引擎剖面构造须显式闭合链）。回归：modeling-server vitest 29 文件 260 过/8 skip（原 9 skip 中毒态留档用例翻转启用后零残留）+tsc 0 错+eslint 仓级既有基线不变；imodel-native BRepCoreTest 31/31+PSBRepGeometryTest 10/10。
- **2026-10-04 M3-a 收口注记**（plan `2026-10-04-m3a-v1-feature-complete`，两仓 `feature/m3a-v1-features`，12 任务 SDD）：
  - **裁决落点（D-1~D-5 全部显式登记）**：D-1 边引用编码改邻面对（op33 契约倒逼，`FilletEdgeRef{faceA,faceB}`，面对=集语义全边 blend）；D-2 fillet 求值=异步预求值前相+EDE 标记短路（async/同步接缝）；D-3 求值载体=会话级 scratch StandaloneDb（changeset 零污染）；D-4 T3.8 预览弃 rollback mark 改影子求值（mark 的 TS 面零存在+成本，反馈级口径）；D-5 undo 覆盖面维持 M1 口径（updateParams 可逆，suppress/reorder/insert 记 oplog 不可逆，UI toast 提示）。
  - **原生修复**：imodel-native aacbcf2d0——子实体修改 op 对改造目标重解析子实体 id，根治「SUCCESS 但几何原状」静默空操作（Blend/Chamfer/Offset/Hollow/Delete/Transform 全族受益）；未归因现象「连续第二次 blend 不重灌失稳」与 op7 getConnectedSubEntities 死桩登记 imodel-native defects backlog。
  - **Task 8x 插队修复**（T3.12 领域真生产洞）：FeatureService 单例缓存随 db 关开清退——原第二编辑器会话起全部特征 RPC 抛 `db not open`；连带实证 e2e 45/45 有盲点（空态/表单模型在 RPC 死时也成立），已补「面板无 db-not-open」断言。
  - **既有 bug 登记（非本计划产物）**：① op7 getConnectedSubEntities 死桩（PSBRepEdit.cpp:974-1033 收集后从不序列化回包，smoke-brep-protocol.js:177-180 已钉）② registerAllTools 静默死于 SelectAllTool（裸 Tool 无 namespace）→全局快捷键含 Escape 全死——M3-b 立项候选。
  - **回归**：modeling-server vitest 31 文件 295 过/8 skip + tsc 0 错 + eslint 增量零新增；公开仓 shared 33/viewer-core 57/web-viewer 15/apps/web 454 过/11 skip；e2e Playwright 全量（含新增 features.spec 6 例）。详情见 plan 目录 task-11-report。
