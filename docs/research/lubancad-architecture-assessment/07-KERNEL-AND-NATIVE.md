# 几何内核 / native 深挖：能力边界、失败模式与发布门禁

> 范围：ACIS Modeler/Polyhedra 经 `SolidKernel.h`（111 个 static API）与 PSBRep op 0–37 的通道、BRepCore/PSBRepGeometry/Visualization、拓扑 ID、tessellation、线程/性能、TrueForm M0、许可与产物 provenance。
> 只描述脱敏后的架构事实与公共仓已登记结论；不含私有源码、原始错误码堆栈或 live 证据。

---

## 0. 结论速览

| 能力面 | 判定 | 一句话结论 |
|---|---|---|
| 草图轮廓 → BRep（闭合/开环/带孔区域） | **A** | 轮廓供给完整；求解不在内核（归绳墨） |
| 基础特征（extrude/revolve/loft/fillet/chamfer/shell/hole/draft/pattern/mirror/boolean） | **B** | 通道完整、边界有测试；多数分支深度不足 |
| 扫掠沿光滑路径 / twist / scale / lock / selfRepair | **C** | 实为站位蒙皮/直纹面；选项被接受但忽略 |
| 曲面族（fill/boundary/ruled/trim/extend/offset surface/face blend/knit 公差） | **C** | 无曲面算子层；tolerant stitch 未授权 |
| 拔模、面扫掠、边偏移、浮雕、片体求交、边删除、TransformSubEntity | **B** | 内核已实现，多数缺 ctest/产品接线 |
| ThickenSheet、DeleteFaces/replaceFace（healing）、STEP/IGES/Parasolid | **D / blocked-license / excluded** | InterOp/healing 不在授权内；发布产物无 InterOp DLL |
| 装配（mates/求解/BOM/干涉/大装配） | **C** | 无装配模型/3D 求解；BRep 无实例化 |
| 工程图（关联视图/HLR/尺寸/GD&T） | **C** | 无矢量 HLR/制图引擎 |
| 拓扑持久 ID / 重放 | **B** | `(nodeId, entityId)` + 分裂继承可用；无几何回退匹配 |
| 多线程 / 性能 / 大模型 | **B–C** | 双车道引擎池有压测；tile facet 实际回落 owner 串行 |
| Tessellation / tile 支撑渲染 | **B** | facet 质量高并持久化；生产 BRep→tile 无原生测试 |
| TrueForm | **C（当前不可用）** | M0 仅 version/status；切换还缺 SAB 持久化裁决 |

**总判定**：对 Part Studio 基础特征 **B（可扩展）**；对高级曲面/钣金/工程图为 **C**；导入导出为 **D（许可）**；装配为 **C（实例结构 B）**。当前内核是“ACIS Modeler 包装 + 工程化 Part Studio 求值通道”，不是“Onshape 级 BRep 内核”。

---

## 1. 调用链与线程模型

```
Web Part Studio
  → LubanFeatureRpcInterface.applyFeatureOp
    → modeling-server FeatureService（withEvalLock，按 dbKey 串行）
      → FeatureEngine / AsyncFeatureEval（同步 API + scratch 载体）
        → N-API（imodeljs.node）
          → PSolidKernelAdmin / GeometryCache（per-DgnDb）
            → BRepUtil 门面（SolidKernel.h）
              → AcisKernelManager：owner 全局道（无键）+ per-key 引擎池（InvokeAffinity）
                → ACIS Modeler（SAB bytes）
                  → geometry stream → iModel
```

要点：

1. **同键串行、跨键并行**：引擎池默认 `min(4, hw)`；实体“家在哪个键流”必须在同一键上下文操作/销毁，跨流使用会毒化 history（`BULLETIN_NOT_ON_BOARD`）。
2. **每特征深拷贝**：缓存实体经 `CreateInstanceOrClone` 回退 `Clone()`；`_CreateInstance` 返回 `nullptr`，**没有 BRep 实例化**。大装配/重复零件内存与时间随实例线性放大。
3. **持久化是 ACIS SAB**：`SaveEntityToMemory`/`RestoreEntityFromMemory` 读写 ACIS 二进制；iModel geometry stream 中存 SAB 字节，`BRepData` 只有 `brepType`、没有内核/格式标签。这是 TrueForm 切换的隐藏门禁；建议现在加向后兼容的 `format/kernel` 枚举（默认 ACIS），即使不切换也能诊断混合文档。
4. **回滚是 per-element SAB 快照**：只覆盖单元素几何，不持久化；不能当跨特征/跨 body 的内核事务。
5. **tile facet 走无键路径**：`FacetEntity → InvokeR → Invoke` 回落 owner 全局道；专用 facetter thread 与批量 MT API 存在，但生产 tile 没有键控流，[推断] 实际串行。

---

## 2. 特征深度与内核硬限制

### 2.1 基础特征

| 特征 | 当前通道 | 已达到 | 硬限制 |
|---|---|---|---|
| Extrude | `BodyFromSweep`（直线精确/曲线蒙皮）+ boolean | blind/throughAll/upToPlane/upToVertex 部分；thin 部分 | thin 对称/双厚度、全形态终止面缺 |
| Revolve | `SpinBody`/`SpinFaces` | 任意轴/边轴部分 | thin/surface/intersect 不全 |
| Sweep | `BodyFromSweep`（站位蒙皮） | 2/3 截面、部分 guide | 光滑路径只首末站；twist/scale/lock/selfRepair 接受但忽略；**非严格沿路径** |
| Loft | `BodyFromLoft`（`api_loft_coedges` + guides） | 多截面/部分 guide | 端条件/periodic/order/orient 未产品化 |
| Fillet | `BlendEdges`（逐边恒定半径 + G1 传播） | 恒定半径、多边 | 变半径/full-round/face blend/setback/chordal 缺；12 边存在 `BL_MITRE_TOO_CMPLX` 内核边界（20 边同体可成） |
| Chamfer | `ChamferEdges`（5 mode） | mode 1/2/3 有证据 | mode 0/4/混合/逐边数组缺 |
| Shell | `HollowFaces` | 单/多面开口、逐面距离、0 距离穿孔 | closed hollow 缺；`addStep` 被忽略 |
| Hole | 后端布尔组合 | 沉头/锥口/顶点/面引用部分 | thread/标准孔径缺 |
| Draft | `TaperFaces`（op37） | 方向 + 边/面参照 + 常数角 | 中面/分型线/step/线性拔模缺 |
| Pattern/Mirror | 后端差集反射/阵列 + Boolean | linear/circular/第二方向；世界平面/faceRef 部分 | curve pattern、skip/count 表达式、任意轴 |
| Boolean | `BooleanOperation` | 三模、多工具、空交守卫 | keep tools 语义需应用层保存 |
| Split | `BooleanCut`（平面）+ `DisjoinBody` | 世界平面/部分面 | 一般 sheet/任意曲面分割缺 |
| Transform | `Transform*` + boolean | 刚体面变换 | 非均匀缩放/全 7 模式缺 |
| DeleteFace | `DeleteFaces` | 部分场景 | 普通盒面无法补洞（blocked-kernel） |
| ReplaceFace | 无 | — | 依赖 healing（blocked-license） |

### 2.2 已实现但未接线（B，先补 ctest 再 ADR-0021）

SweepFaces、OffsetEdges、Emboss（平面端盖）、IntersectSheetFaces、DeleteEdges、TransformSubEntity/OffsetBody、ConvertSolidToSheet/DisjoinBody。多数无 ctest/产品调用；OffsetBody 还缺 PSBRep op。

### 2.3 高级曲面/线程/ Wrap

- 无曲面 fill/boundary/ruled/trim/extend/offset surface/face blend 算子层；`SewBodies` 只有 pairwise 精确 stitch，`gapWidthBound/nIterations` 不生效（tolerant stitch 未授权）。
- 无 helix/thread 内核算法；螺纹只能用 B-spline + sweep 近似。
- `Emboss` 是平面端盖 pad/pocket，不是曲面 wrap。
- Sheet Metal / Frame 无内核通道。

**判定**：基础特征 B；高级曲面/螺纹/Wrap/钣金 C；Thicken/healing D。

---

## 3. 拓扑 ID 与参数化编辑

- 面/边在创建时打 `(nodeId, entityId)` 属性；布尔把 tool id 平移到 target 最高号之上；面分裂复制 id、合并移挂；查询有 `FacesFromId/EdgesFromId/EdgesFromOwnId` 等 op31–36。
- 测试覆盖：盒/切槽分裂语义、同进程重建一致、保存往返一致、边 own-id 继承；产品用 `edgesFromOwnId` 解 fillet 边、`facesFromId` 解 draft 面。
- **硬限制**：这是“创建时打标 + 分裂继承”，不是跨历史的持久命名；上游拓扑大改后没有几何回退匹配，引用丢失即 fail-closed throw。边 id 传统上由相邻面对派生（组合爆炸，已有 own-id 缓解）；vertex 仍是三元组派生；无跨 native/ACIS 版本的迁移策略。
- **含义**：简单特征链够用；变半径圆角、face blend、replace face 等高级参数化编辑需要更强的引用解析（最近边/面 + 方向 + 拓扑上下文），属 B 级内可扩展但需专项设计。

---

## 4. 失败模式（调用方必须逐点守卫）

| 模式 | 机制 | 产品后果 |
|---|---|---|
| 内核拒绝并干净回滚 | ACIS 上下文自动回滚，体积/面数不变 | fail-closed 正确；需可解释替代方案 |
| 成功但空结果 | boolean 不相交/已包含返回 SUCCESS + 空 delta | 漏守卫即“假成功” |
| 成功但结果病态 | 全圆边 fillet status=0、质量属性不可计算 | 需体积>0/可解析守卫（产品已加 fail-closed 防线） |
| 选项被静默忽略 | sweep 的 twist/scale/lock；Hollow/Offset/Transform 的 addStep；DeleteFaces 的 createCap；SewBodies 的 gap/nIterations | 契约过度承诺 |
| 引用丢失硬错误 | id 查询为空 → throw，不重建 | 参数化编辑体验差 |
| 跨键/跨流使用 | 实体 home stream 与操作流不一致 | history 污染，后续操作全失败 |
| 类型 fallthrough（潜伏） | 失败 case 继续落入错误类型分支 | 若导入/新调用触达可空指针崩溃；当前产品主路径未触达 |
| 质量属性超时 | facet 四面体求和；细公差可达分钟级 | UI 假挂起；已用 1e-4/0.02 rad 记账换性能 |

---

## 5. 性能与大模型

| 事实 | 影响 |
|---|---|
| 引擎池 owner + per-key 车道，跨键并行 | 并发底座可用；需要把 tile facet 纳入键控 |
| 每特征 `api_copy_entity` 深拷贝 | 每特征成本 O(body size)；无实例共享 |
| 质量属性走 facet 四面体求和 | 精度换性能；细公差慢到分钟级；F2 曾 >7 分钟 |
| 无 100+ body / 10k 面级基线 | 大模型/大装配性能未证明 |
| tile 无按特征/空间 LOD；只有整体 chord/angle | 质量与性能同一个全局旋钮 |

**判定：B–C**。并发底座可扩展；实例共享、tile 并行、增量求值、大模型基线是必须先行的性能改造。

---

## 6. Tessellation / tile

- ACIS faceter 输出 PolyfaceHeader（法线/UV 可选），按 FaceAttachment 分桶支持逐面材质；SQLite facet 缓存按 element/geometryIndex/tolerance/flags/geometryGuid 失效。
- BRepService 有专用 facetter thread 队列；批量 `api_facet_entities` 有 MT 形态。
- **硬限制**：生产 BRep→tile 路径没有原生测试（可视化测试用桩）；tile facet 实际串行；无产品级 tessellation 质量档位；facet 质量直接影响体积读数。
- **含义**：交互式渲染支撑 B；大模型/装配 LOD、质量档位、BRep→tile 真栈测试需补。

---

## 7. 许可、构建与 provenance

- 授权仅 Modeler + Polyhedra；InterOp/healing/STEP 不接线；Delivery 无 STEP/IGES DLL；tolerant stitch 明确 “Not authorized”。
- **治理漏洞**：ThickenSheet 仍是 PSBRep op16，并经 `createBRepGeometry` 的 Thicken 暴露给 JS。即“blocked-license”只停留在文档，原生 API 仍可达；外部消费者可越权调用。这是 P0-09 的 fail-open 点，需要在 native 入口 fail-closed 或编译期移除。
- **接口冻结门禁当前为红（2026-11-22 审计实跑）**：`check-interface-freeze.mjs` 返回非零——PSBRep 归一化哈希与冻结值不符、opCount 38≠37；op37 加入未同 PR 更新 manifest。CI 接口冻结 job 会失败，P0-08 证据链断裂。
- **发布 provenance**：对外 MS 产物仍是 store fallback，记录的原生 HEAD 早于当前 native HEAD；op37/TaperFaces 及之后的修复**不在发布物**。所有“已接线/真栈绿”必须绑定重建后的 MS 产物。
- **构建**：CMake+Ninja、离线依赖包、Release 811 / Debug 2,582 目标、ctest 16 套件；原生 ctest 未进托管 CI（X-09），存在多份 checkout（X-12）。

**判定**：许可边界 D（导入导出/曲面 healing）；构建/provenance 是**当前不满足发布门禁**的可修复工程风险。

---

## 8. TrueForm（M0）

- 仅 `version()/versionString()/statusName()` 三个 API；无拓扑/曲线/曲面/布尔/序列化/tessellation/适配层。
- 路线图 M0 脚手架 → M1 数据模型+序列化 → M2 基元/扫掠/tessellation → M3 布尔 → M4 圆角/倒角/抽壳/偏移 → M5 TopologyID/重放 → M6 适配+双后端一致性 → M7 生产切换。
- 现有切换门禁覆盖合同 111 导出、同 fixture 一致性、下游真栈、性能、回滚、provenance；**缺持久化格式门禁**：iModel 已存 SAB，TrueForm 不能读就必须全量迁移/重求值，能读则涉及格式许可与巨大工程量。`INTEGRATION.md` 未把这一条列为门禁。
- **判定：C（当前不可用）**。不给出日历承诺；不能作为 Onshape 对标的前置条件。

---

## 9. Top 风险（内核域）

1. 发布产物与源码脱节 + interface-freeze 红（P0-08）。
2. ACIS 分发授权（`SPAAcisDs.dll` 随产物分发）是否覆盖外部用户，需法务确认。
3. blocked-license API（Thicken）仍可从 JS 触达，治理 fail-open。
4. SAB 持久化锁死内核替换；TrueForm 切换缺格式裁决。
5. BRep 无实例化 + 深拷贝，大装配方向性不成立。
6. tile facet 实际串行，大模型首屏/重建撞单线程。
7. 扫掠几何不严格沿路径；twist/scale/lock 被忽略。
8. 拓扑 ID 无几何回退，高级参数化编辑引用脆弱。
9. 原生 ctest 未进 CI、多 checkout，内核回归靠人工。
10. 高级特征空洞（变半径/full-round/面圆角/曲面/wrap/thread/sheet metal/frame）。
11. 质量属性依赖 facet 公差，体积读数与性能耦合。
12. 装配/工程图/导入导出无子系统，不能由内核补丁延伸。

---

## 10. 可复用资产

1. `SolidKernel.h` 111 导出 + PSBRep 0–37 协议 + interface-freeze CI（需先修复）。
2. ACIS Modify 家族（布尔/Blend/Chamfer/Hollow/Offset/Taper/Imprint/Transform/Sew/Disjoin/Convert）。
3. `AcisFaceIdAttrib` 持久拓扑 ID（own-id、分裂继承、merge 迁移、反查）。
4. 双车道引擎池与并发压测。
5. ACIS faceter 封装 + facet 缓存 + 逐面材质分桶。
6. `AcisMemoryFile` SAB 往返 + geometry stream 集成 + per-element 回滚快照。
7. iTwin Visualization tile 管道（TileBuilder/BRepService/TileContext）。
8. 边界测试钉（Bumper 12 边、TaperFacesProbe、批量 facet 对拍、8 lane 对拍、分裂语义、保存往返）。
9. CMake+Ninja+离线 bundle+Delivery 构建；`check-interface-freeze`/`check-cmake-port`。
10. 公共边界/审计矩阵（KERNEL-BOUNDARIES、ACIS-EXPOSURE-MATRIX、BREPCORE-AUDIT-LEDGER、feature-depth-matrix）。

---

## 11. 最小验证切片

1. 扫掠精确性：圆柱剖面沿 1/4 圆弧路径，与解析环面最大偏差 < 容差（先失败后修）。
2. 盒体 12 边变半径 fillet 的 ctest + 体积断言。
3. DeleteFaces 共面分裂种子 ctest。
4. 100 个独立 body 的 tile 冷构建：串行 owner vs 键控/批量 MT 的墙钟/峰值内存。
5. “改上游 extrude 深度 10→12，下游 fillet 引用仍命中同一棱”的真栈 spec；失败则记 blocked-design。
6. blocked-license op 的 native fail-closed 负向测试。
7. 重建 MS 产物并更新 provenance + interface-freeze，跑全栈回归。

---

## 12. 与产品路线的关系

- **Part Studio 主链**：内核不是主要瓶颈；瓶颈是特征图执行器、特征分支深度、UI/撤销/预览/性能。内核侧先做扫掠精确性、fillet/delete-face 分支、tile 并行与大模型基线。
- **导入导出**：STL/OBJ/3MF/GLTF 可从 facet 导出，是许可内最便宜切片；STEP/IGES/Parasolid 必须先做许可/商务裁决（D3）。
- **装配/工程图**：内核只能提供单 body 几何与变换；装配需要实例共享 ADR，工程图需要 HLR/制图引擎，均不能靠“再包一层 ACIS API”解决。
- **TrueForm**：长期方向正确，但必须先把 SAB 持久化兼容与双后端一致性列为门禁；不作为近期交付承诺。
