# CAD 特征系统 · 证据库（可行性分析一手证据汇编）

- 日期：2026-09-27
- 用途：支撑「iModel 存储能否支撑 Onshape 式参数化特征建模」裁决的全部一手证据持久化。每条结论带 file:line 或一手来源；推断与「未找到」如实标注。
- 关联：裁决见 `2026-09-27-cad-feature-system-decision-record.md`；设计见 `2026-09-27-feature-system-imodel-architecture-design.md`。
- 本地检出锚点：`D:\Github\imodel-native`（dev/source-build，同步至 upstream 5.14.39）；`D:\Github\FreeCAD`（main@92e2891cb4，26.3.0-dev，含 1.0 element map）；`D:\Github\modeling-app`（kittyCAD 官方检出，含 rust/ KCL 核心）；本仓 `itwinjs-core/`。

---

## 1. imodel-native 能力盘点（2026-09-27 实查结论）

- **BRepCore = Parasolid 的 ACIS 替身门面**：`SolidKernel.h` 109 条声明。
- **PSBRepGeometry = 31-op 协议 1:1 忠实还原**：6 个官方即死路的 op（2/4/7/9/18/23）刻意保留；其中 18/23 内核层实现存在、可接线。
- **持久拓扑 ID 已存在未暴露**：`BRepUtil::TopologyID`——FaceId=(nodeId, entityId)，nodeId=产生该面的操作；以 ATTRIB 为载体，跨分裂/合并/拷贝存活且持久化。**这是特征引用的内核底座。**
- **Emboss 已示范修改类 op 的保标模式**：FindNodeIdRange → 修改 → AddNodeIdAttributes；可推广到倒角/抽壳等修改类特征。
- **创建类门面全线带 nodeId 参数**（打标通道现成）。
- **有效性检查** `HasConsistentTopologyAndGeometry`（=api_check_entity）存在，但仅作持久化前内部守门。
- **内核回滚 mark**（CreateRollbackMark）存在但未暴露到 JS 协议。
- ACIS 授权硬事实（`D:\Spatial\ACIS_2025.1.0.1`，spatial_license.h，Customer: Haihe Lab）：仅 **3D ACIS Modeler + Polyhedra**；STEP/tolerant stitch 属 **3D InterOp 未授权**（运行时 Not authorized，产品级门控，与构建配置无关）。→ STEP 读写与 healing 走真形自研（writer 先行；reader 必须配 healing）。建模公差恒 SPAresabs=1e-6 不可调。

## 2. itwinjs-core 机制证据（2026-09-27 取证，均为一手 file:line）

> 取证范围注记：取证代理曾误报「本 fork 无 editor/backend 包」——已核实 **editor/{common,backend,frontend} 均存在**（`itwinjs-core/editor/backend/package.json`），系其 glob 失误；下列 core/backend/core/common 证据不受影响。

### 2.1 ElementDrivesElement（EDE）：依赖图传播机制

- 类定义：`core/backend/src/Relationship.ts:466`。类头注释：回调由 **BriefcaseDb.saveChanges** 触发、按依赖拓扑序（`Relationship.ts:404-405`）；完整回调顺序示例 `:417-423`、`:444-451`。
- **调用链（native→JS）**：native 层在 saveChanges 提交时做依赖图传播；传播失败以 `DbResult.BE_SQLITE_ERROR_PropagateChangesFailed` 返回，在 `core/backend/src/EditTxn.ts:197` 转为 "Could not save changes due to propagation failure."。native 通过动态回调打进 `TxnManager` 四个 protected 入口（全部 @internal、全仓无 TS 调用点，证明调用方为 native 二进制）：
  - `_onBeforeOutputsHandled` — `core/backend/src/TxnManager.ts:991`
  - `_onAllInputsHandled` — `TxnManager.ts:999`
  - `_onRootChanged` — `TxnManager.ts:1007`
  - `_onDeletedDependency` — `TxnManager.ts:1014`
  - 分发到子类静态方法：`Element.ts:510`、`536`；`Relationship.ts:76`、`96`。
  - 每个回调拿 `indirectEditTxn`（间接事务）：`TxnManager.ts:994-1018` 中 `iModel.getIndirectTxn()`；间接更改期间锁检查挂起：`docs/learning/backend/ConcurrencyControl.md:193`。
- **触发时机**：saveChanges（含 EditTxn.saveChanges，`EditTxn.ts:185-202`）；apply changeset 时也走 validation 路径（`_onEndValidate` 注释，`TxnManager.ts:1023-1026`）。**pull 他人 changeset 时是否重跑 EDE 传播：未找到明确证据**（跨 briefcase 派生数据重算的官方机制是 `RebaseHandler.recompute`，`TxnManager.ts:1736-1750`；注册入口 `TxnManager.ts:820`）。
- **子图裁剪**：只处理受影响子图（`Relationship.ts:345-382`）。
- **status/priority**：0=成功；1=评估失败（回调自设或成环）；0x80=禁止经此关系传播（`Relationship.ts:468-475`）。环=fatal，涉环关系 status 置 1（`:455-457`）；回调可调 `txnManager.reportError`；saveChanges 后查 `db.txns.validationErrors`/`hasFatalError`（`:459-462`）。
- **回调契约**：「A ElementDrivesElement subclass callback is expected to make changes to the output element only!」（`Relationship.ts:396`）。
- **仓内实际使用者**：
  - 生产唯一子类 `ElementDrivesTextAnnotation`（`core/backend/src/annotations/ElementDrivesTextAnnotation.ts:75`）：文字标注字段缓存随源元素自动更新；onRootChangedArg → updateElementFields（`:150-152`）；关系由元素自身 onInserted/onUpdated 钩子维护（`TextAnnotationElement.ts:287`、`293`、`474`、`480` → `ElementDrivesTextAnnotation.updateFieldDependencies`，实现 `:135-146`）。
  - 测试子类：`core/backend/src/test/IModelTestUtils.ts:64`；`core/backend/src/test/element/ElementDrivesElement.test.ts:281`。
  - **未找到** drawing/sheet 动态视图、transformer、connector 对 EDE 的使用。
- **自动传播的直接测试证据**：`ElementDrivesElement.test.ts:406-462`（updateElement 后仅 saveChanges 即断言拓扑序回调）；规模测试单次 saveChanges 产生 **7380 次 onRootChanged**（`:931-945`）；构建系统依赖图示例 `:636-710`。
- pull-merge 后派生数据重算测试范例：`core/backend/src/test/hubaccess/Rebase.test.ts:409`、`955`、`1334`。

### 2.2 changeset 物理内容与变更摘要

- push 路径：`BriefcaseManager.pushChanges`（`core/backend/src/BriefcaseManager.ts:798-851`）：`startCreateChangeset()` 生成 ChangesetFileProps（`:806`）；`computeChangesetId` 校验（`:814-816`）；上传后 `completeCreateChangeset`（`:824`）。ChangesetId = 父 id + 内容哈希（`docs/learning/iModelHub/Briefcases.md:13`）。
- **内容格式**：SQLite 记录 INSERT/UPDATE/DELETE **带 old/new 值**的二进制 changeset（`docs/learning/backend/PullMerge.md:13`）；`ChangesetReader` 逐行读取（`core/backend/src/ChangesetReader.ts:33-34`）。Txn 与 changeset 均为**净变更**（`docs/learning/InteractiveEditing.md:11`、`:32-34`）。
- changeset 类型：Regular/Schema/SchemaSync（`core/common/src/ChangesetProps.ts:51-58`）。
- **ChangeSummary 粒度三层**：
  1. changeset 级：`ChangeSummary`（`core/backend/src/ChangeSummaryManager.ts:32-35`）——id/parent/描述/推送时间/用户；需 attach Change Cache（`:95-112`）；`createChangeSummary` 调 native extractChangeSummary（`:364`）。
  2. 实例级：`InstanceChange`（`:44-50`）——changedInstance{id,className}、opCode（Insert=1/Update=2/Delete=4，`core/common/src/ECSqlTypes.ts:75-79`）、isIndirect。
  3. **属性级**：`getChangedPropertyValueNames`（`:291-313`）+ `buildPropertyValueChangesECSql`（`:332-349`）构造 Changes(ChangeSummaryId, ChangedValueState) 查询取**旧/新值**；ChangedValueState：AfterInsert=1/BeforeUpdate=2/AfterUpdate=3/BeforeDelete=4（`ECSqlTypes.ts:90-95`）。官方警告：BeforeUpdate/AfterUpdate 查询中**未变化的属性返回当前文件值而非历史值**（`docs/learning/ChangeSummaries.md:72-78`）。
- `ChangedElementsDb`（`core/backend/src/ChangedElementsDb.ts:41`）：按 changeset 区间提取 changed elements（elementId/classId/opcodes/可选 properties，`core/common/src/ChangedElements.ts:42-60`）。
- 不经 hub 的路径：ChangesetReader + PartialChangeUnifier 直读本地 txn/changeset 文件，逐实例 `$meta.stage` Old/New 双份值（测试证据 `core/backend/src/test/standalone/ChangesetReader.test.ts:175-202`）。
- **推断（依据上述 API）**：「元素 depth 属性 10→20」saveChanges+push 后，ChangeSummary 下一条 InstanceChange（OpCode=Update），getChangedPropertyValueNames 含 depth，Changes(BeforeUpdate/AfterUpdate) 分别给出 10/20。同一 txn 内多次改只记净值。

### 2.3 并发与锁

- **push 必须基于 tip**："You can only push a changeset that is based on the current tip"（`docs/learning/backend/ConcurrencyControl.md:48`）。实现：pushChanges → pullMergePush（`BriefcaseManager.ts:856-880`），push 前总是先 pull-merge；hub 拒绝（PullIsRequired）按 mergeRetryCount（默认 5）+mergeRetryDelay（默认 3s）重试；本地无净变更则不 push 仅释放锁。
- **冲突解决 = pull 时 SQLite 行级 rebase**：回滚本地 txn → 应用传入 changeset → 重放本地 txn（`PullMerge.md:78-95`）。冲突粒度=SQLite 行（主键/UNIQUE/CHECK/FK），类型与默认处置表 `PullMerge.md:17-47`；默认处置 `TxnManager._onRebaseLocalTxnConflict`（`TxnManager.ts:1127-1221`）；可注册自定义冲突处理器（`addConflictHandler`，`TxnManager.ts:899`；`RebaseManager.onConflict`，`:874-888`），3-way 视图（`PullMerge.md:89`）。
- **锁**：策略在 iModel 创建时固定（`noLocks` 参数），不可更改；**noLocks 标注 experimental 不得用于生产**（`ConcurrencyControl.md:71-80`）。LockControl 接口 `core/backend/src/LockControl.ts:17`；实现选择 `IModelDb.ts:3893-3901`（可写+已分配 briefcaseId+无 NoLocking → ServerBasedLocks，`core/backend/src/internal/ServerBasedLocks.ts:36`；否则 NoLocks）。Exclusive/Shared 两级+所有权层级；全有或全无获取；生命周期 pull→lock→change→save→push→release（`ConcurrencyControl.md:101-128`）。
- **Channel**：写权限按 channel 隔离（channel-root Subject 子树），会话须 addAllowedChannel（`docs/learning/backend/Channel.md:3-4`、`:49-67`；`core/backend/src/ChannelControl.ts:54-81`）；与锁正交（`ConcurrencyControl.md:409`）。
- **单写者架构官方背书：未找到**。最接近的机制级证据：Schema Lock=根元素独占锁≈全局写锁（`ConcurrencyControl.md:316-323`）；锁 per-briefcase 而非 per-user（`:49`）；BriefcaseId 资源受限、官方建议复用（`Briefcases.md:27`）——「单 briefcase 单写者」与锁模型天然兼容（推断，非文档背书）。

### 2.4 几何存储与派生数据模式

- **GeometryStream = JSON 数组**：`GeometryStreamProps = GeometryStreamEntryProps[]`（`core/common/src/geometry/GeometryStream.ts:187`）；BRep entry `brep?: BRepEntity.DataProps`（`:178`），data=Base64，须 `ElementLoadProps.wantBRepData` 才返回（`:112-114`）；`BRepEntity.Type` Solid/Sheet/Wire（`:90-97`）；`GeometryStreamBuilder.appendBRepData`（`:395-409`）。
- **写入路径**：`GeometricElement3d.serialize/deserialize` 调 native `convertOrUpdateGeometrySource`（`core/backend/src/Element.ts:896-907`、`:955-980`），GeometryStreamProps/ElementGeometryBuilderParams → 二进制 blob 存 geometryStream 列；GeometryPart 同理（`Element.ts:2287-2312`）。另有 editor/backend 的 CreateElement 路径（包存在，本次未逐行取证）。
- **大小限制**：未找到几何流专属上限明文。间接证据：geometryStream 为 SQLite blob 列；file-based txns "avoids SQLite blob size limits"（`IModelDb.ts:4339-4341`）；ChangesetReader 大 blob 50 MiB 溢出阈值与 abbreviateBlobs 选项（`ChangesetReader.ts:38`、`:74-76`）。**无分块机制迹象。**
- **派生几何先例**：`DrawingGraphic`（`Element.ts:1193-1194`）+ `DrawingGraphicRepresentsElement`（`Relationship.ts:193-197`）；**失效与重建逻辑在 native 层，TS 侧未找到显式失效代码**（`deleteDrawingGraphics|drawing graphics.*invalid` 零命中）。应用层可复制的范式 = EDE+文字字段的「原地重算缓存」（测试：`core/backend/src/test/annotations/Fields.test.ts:486`、`:503`）；delete+重建模式在 TS 层无官方先例。EDE 与 drawing graphics **无耦合**（后者走 native 内部依赖）。

### 2.5 自定义 schema 与 undo

- **schema 导入**：`IModelDb.importSchemas`（`IModelDb.ts:1668-1677`）/importSchemaStrings（`:1690-1699`），核心 `importSchemasInternal`（`:1540-1651`）。默认路径取 schema lock（`:1624`）；SchemaSync 启用时仅共享锁（`:1565-1611`、`:4525-4529`）。schema 变更以 changeset 传播；briefcase pull 到 schema changeset 时先清语句缓存再应用（`BriefcaseManager.ts:492-498`），pull 后 `SchemaSync.updateDbSchema`（`IModelDb.ts:4313`）。失败回滚 abandonSchemaChanges / cancelTo。
- **BriefcaseTxns undo/redo**：txn 同时存改前/改后值，reverse 精确回改前、reinstate 回改后（`InteractiveEditing.md:15`）。API：reverseTxns/reverseSingleTxn/reverseAll/reverseTo/cancelTo（`TxnManager.ts:1400-1437`）；锁感知异步版 `:1456-1533`；reinstateTxn（`:1555-1568`）/reinstateTxnAsync（`:1581-1605`）。
- **会话边界**："Txns persist across sessions even if the program crashes"（`InteractiveEditing.md:19`）；**但 push 后全部 txn 删除、timeline 清空**（`:36`）→ 已 push 的 changeset 不能用 reverse/reinstate 撤销。
- **跨历史撤销的官方形态 = revert 产生新 changeset**：`BriefcaseDb.revertAndPushChanges`（`IModelDb.ts:4400-4483`）→ `BriefcaseManager.revertTimelineChanges`（`BriefcaseManager.ts:507-554`；注释 "All changes during revert operation are stored in a new changeset" `:543-544`）。时间线只增不改，与 Onshape 不可变历史同构——但粒度是整段 timeline 区间，非 per-op。

## 3. FreeCAD 对照证据（main@92e2891cb4，含 1.0 element map）

### 3.1 依赖图与重算

- 依赖声明=属性链接+表达式：`DocumentObject::getOutListProp` 遍历 PropertyLinkBase 派生属性提取依赖边（`src/App/DocumentObject.cpp:432-453`）；ExpressionEngine 单独处理（`:455-461`；`PropertyLinks.cpp:6127`；`PropertyExpressionEngine.cpp:210-228`、`:276-292`）。图结构 `boost::adjacency_list`（`src/App/private/DocumentP.h:51`）；`buildDependencyList`（`src/App/Document.cpp:2577-2668`）。
- touch→mustExecute→recompute：`DocumentObject::touch`（`DocumentObject.cpp:216-225`）；onChanged 粗/细粒度置位（`:1147-1228`）；mustExecute（`:295-310`）；拓扑排序 `Document::recompute`（`Document.cpp:2855`）经 getDependencyList（`:2928-2929`），boost::topological_sort 在 `:2691`，环 fallback partialTopologicalSort（`:2746`）/DepNoCycle 报环抛 BadGraphError（`:2694-2743`）。
- **源码自述缺陷**：Realthunder FIXME——自制 topologicalSort 不能处理部分重算，实际走全量建图，未利用 InList 也不报环（`Document.cpp:2908-2915`）。
- **部分重算 = 全量拓扑序+逐点询问+传播式脏标记**：`if (obj->mustRecompute())`（`:2959`）；执行后对 InList 下游 enforceRecompute（`:2978-2996`）；fine-grained 开关默认 true（`Application.cpp:818-824`）；最多两轮 still-touched 补算（`:2945-2951`、`:3003-3018`）。
- **execute() 抛错**：异常捕获 → addRecomputeLog → 对象置 `ObjectStatus::Error`（`Document.cpp:3264-3319`；`DocumentP.h:122-131`）。**下游=跳过+保留旧几何+保持 touched**：失败对象的全部递归下游加入 filter 跳过（`Document.cpp:2971-2975`），purgeTouched 不发生。冒泡 UI：signalRecomputedObject → 红色错误图标（`Gui/Tree.cpp:5450-5463`）。undo/redo 期间抑制重算（`Document.cpp:2870-2875`）。

### 3.2 定义/结果分离与 undo

- **FCStd = zip**：Document.xml（定义/属性，`Document.cpp:2042`、`2053`）+ 各属性二进制附件统一落盘（`:2059`）。BRep：`PropertyPartShape::Save`（`src/Mod/Part/App/PropertyTopoShape.cpp:365-425`）写 `ShapeN.brp` + **element map(.Map) 与 StringHasher(.Table)**（`:407-424`）。
- **打开免重算**：restore（`Document.cpp:2143`/`2204`/`2219`）→ `PropertyPartShape::RestoreDocFile`（`:740-781`）直接读回 BRep+element map；afterRestore 只对被 touch 的对象重算，其余 purgeTouched（`Document.cpp:2357-2358`）。**「只存定义」文档级开关：未找到**（只有属性级 Prop_NoPersist/Prop_Transient，`PropertyContainer.cpp:240-246`）。
- **undo/redo = 属性级前值快照**：修改前 `Document::onBeforeChangeProperty` → `TransactionObject::setProperty` 整值 Copy（`src/App/Transactions.cpp:421-432`）；应用=逐属性 Paste（`:313-419`）；事务边界=用户语义操作（openTransaction `Document.cpp:361-386`/commitTransaction `:573-593`）；**Shape 属性也整值快照（旧 BRep 在快照里）——内存重**。

### 3.3 PartDesign 特征模型

- 特征链：`PartDesign::Feature` 持 `PropertyLink BaseFeature` 指向前一实体特征（`src/Mod/PartDesign/App/Feature.h:67`；`Feature.cpp:117`）；**SuppressedShape 保存被抑制特征的生成面供下游引用不中断**（`Feature.h:71`；`Feature.cpp:126`、`134-146`、`167-187`）。
- Body/Tip：`Body::addObject` 追加并推进 Tip（`Body.cpp:232-250`）；插入特征重接 BaseFeature 链（`:331-369`）。
- 执行结构（Pad 为例，`FeatureExtrude.cpp`）：草图剖面 → makeElementPrism（`:996`）→ AddSubShape.setValue（`:785`）→ **`prism.Tag = -this->getID()`（特征 ID 打进 Tag 供拓扑命名溯源，`:788`）** → makeElementBoolean（`:793-798`）→ getSolid 单实体校验（`:818-823`）→ Shape.setValue（`:824`）。
- DressUp：`PropertyLinkSub Base`（`FeatureDressUp.cpp:55`）；Fillet::execute（`FeatureFillet.cpp:77-160`）经 getContinuousEdges 按 shadow sub 解析边。
- **solid 传递 = TopoShape 值拷贝**（共享底层 TShape+element map 指针，`Feature.cpp:459-491` 的 `:478`）。

### 3.4 TNP 现状（element map 已并入，仍是补丁）

- 核心文件：`src/App/ElementMap.h/.cpp`、`MappedElement.cpp`、`StringHasher.cpp`、`ElementNamingUtils.cpp`；官方自述 `src/App/core-app.dox:838-875`。
- **命名 = 操作历史后缀+哈希压缩**：mapped name = 不可变 base data + 逐操作 postfix（操作码、Tag），示例 `Pocket.;g2;SKT;:H7cf,E;...Face8`（`core-app.dox:865-874`）；长名 StringHasher 压成 `#20:2`；编码 `ElementMap::encodeElementName`（`ElementMap.cpp:620`）；名称由 OCCT 历史（modified/generated）传播生成（`TopoShapeExpansion.cpp:1419` 起，`:1508-1627`）。
- **引用回退（shadow sub）**：`PropertyLinkSub::getShadowSubs`（`PropertyLinks.h:912/949`）存 (oldName,newName)；updateSubReference（`PropertyLinks.cpp:440-547`）失败时几何搜索重定位（`:478-504`），仍失败保留 oldName 并告警（`:518-521`）；缺失标 `?FaceN`（`GeoFeature.cpp:123-131`；`ElementNamingUtils.h:57`）。
- **源码自述局限**：`TopoShapeExpansion.cpp:1419` TODO 重构降复杂度；`:1452` "Not all input shapes are mappable"；`:1768` "element is both generated and modified" 二义；`:3165-3168` requireSharedVertex "not obvious how to map"；`ElementMap.cpp:1423-1431` 无对象追踪 "inherently unsafe" + 深度上限 50；**导出不携带新命名**（`SketchObject.cpp:928-939`）。
- **失效路径实证**：DressUp::getContinuousEdges（`FeatureDressUp.cpp:215-237`）找不到边即 throw "Invalid edge link"（`:218-221`）→ Fillet "Fillet not possible" → Error+下游 filter 跳过；经典 TNP 场景测试 `src/Mod/PartDesign/PartDesignTests/TestTopologicalNamingProblem.py:54-59`。

## 4. kittyCAD / Onshape 深挖结论（2026-09-27，一手）

**kittyCAD**（D:\Github\modeling-app）：
- 状态模型：KCL 文本=唯一状态（KclManager extends File），几何=派生缓存。
- artifactGraph：引用=语义构件（plane/path/segment/wall/cap/sweep/edgeCut）锚定源码位置 codeRef={range,pathToNode}；引擎 id↔代码双向映射；CI 用生成图做回归。
- 增量执行三层：TS 层全量重执行（废弃在途）；Rust 层 AST/模块缓存+变更部分检测（execution/cache.rs）；草图模式专用增量（PREV_MEMORY）；引擎协议本身增量。
- 约束双层：构造函数即约束（line→xLine）+ 真约束对象（rust frontend add_constraint/edit_constraint/SketchConstraintReport）。

**Onshape**（Ilya Baran, "Under the Hood: How Collaboration Works", 2015，一手全文）：
- 数据三分法：UI 状态（不存）/ Part Studio definition（唯一存储与协同对象）/ regen 结果（缓存，永远可重建）。
- microversion：不可变、存 parent 引用+变更本身（**语义操作级 delta**，非状态快照）；变更设计为可跨 parent 应用（特征内部 id 标识）→ 多人变更直接 apply 到最新，无锁无冲突；per-user undo=我的变更之逆 apply 到最新；合并=重放 from 分支未合并变更，冲突「from wins 永不阻塞」。
- 持久 ID：变长字符串，模型变化后可能变，提供 microversion→microversion 映射 API。
- 执行：每文档专属 model server（Parasolid）服务端增量再生（rollback 语义）。

## 5. SolveSpace/libslvs 事实（一手验证）

- COPYING.txt = 纯 GPLv3 无例外；**纯云 SaaS 定案 → 网络使用不构成分发 → 可进程内直链**；红线：任何 on-prem 二进制交付即 GPL 污染。
- 技术（exposed/DOC.txt）：C ABI 句柄制自包含；group 语义原生支持跨草图引用；一致性三态（OK/矛盾清单/不收敛清单）；约束 ~40 种；实体无椭圆（过渡期天花板）；**DOF 计数是否在 C API 暴露待验证**；官方 WASM 构建目标（build-wasmlib.sh）。

## 6. 证据强度分级说明

- **一手代码/文档验证**：§1-§3、§5 全部（file:line 可复核）。
- **一手博客全文**：§4 Onshape 部分。
- **推断（已标注推断依据）**：§2.2 末段（depth 10→20 在 ChangeSummary 的呈现形态）；§2.3 末段（单写者与锁模型兼容性）。
- **明确未找到（如实记录）**：pull 时是否重跑 EDE 传播；drawing graphics 的 TS 侧失效代码；几何流分块机制；单写者架构官方背书文档。
