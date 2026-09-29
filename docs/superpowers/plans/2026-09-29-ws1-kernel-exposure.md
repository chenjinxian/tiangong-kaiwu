# WS1 内核暴露（X3）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 imodel-native 已存在的 TopologyID 查询/validity check/rollback mark 暴露到 JS 协议（T1.1/T1.3/T1.2），补齐存活性测试（T1.4），并顺路完成 #27 中毒态的 C++ 根因调查。

**Architecture:** TopologyID 查询走**既有 31-op 协议通道**（`elementGeometryCacheOperation` NAPI → DgnCore `ElementGeometryCache::Operation` → `PSolidKernelAdmin::_EditGeometryCacheOperation` → `PSBRepEdit.cpp:2687` 的 op switch）新增查询 op 码——与 fillet（M3 Blend=24）同通道，返回缓存子实体 id 使 T1.8 桥接天然解决。C++ 实现全部委托 `BRepUtil::TopologyID`/`AcisTopologyId`（已存在，`AcisTopologyId.h:78-138`）。validity check 同通道新增 op 码；rollback mark 为会话态原语，走 `BRepGeometryAdmin` 新虚函数 + 专用 NAPI 方法。#27 为时间盒调查（入口：`DgnElement::Update` 间接路径）。

**Tech Stack:** C++（ACIS 2025.1、N-API、CMake preset `win-x64-debug`、ctest/BRepCoreTest）、TypeScript（itwinjs-core fork editor/backend + modeling-server Vitest）。

**Spec:** `docs/superpowers/specs/2026-09-28-cad-full-program-roadmap.md` WS1（T1.1-T1.4 出口标准）+ §4 悬点 X3；机制证据 `docs/superpowers/specs/2026-09-27-cad-feature-system-evidence-base.md` §1。

## Global Constraints

- **两仓工作**：C++ 在 `D:\Github\imodel-native`（分支 `dev/source-build`，从 main 拉新分支 `ws1-kernel-exposure`）；TS 在 `D:\Github\tiangong-kaiwu`（分支 `ws1-kernel-exposure`）。commit 分别落在各自仓，消息风格：imodel-native `feat(brepcore): …`（沿用其迁移工程惯例，禁 `--no-verify`），tiangong-kaiwu `feat(modeling-server): …`/`feat(editor-backend): …`，均带 `Co-Authored-By: Claude Code <noreply@anthropic.com>` 尾行。
- **C++ 构建/测试命令**（imodel-native 仓，VS 环境必需）：
  - 配置：`cmd /c "\"C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat\" && cmake --preset win-x64-debug -DITWIN_ENABLE_ACIS=ON"`
  - 构建：`cmd /c "\"…vcvars64.bat\" && cmake --build out/cmake/win-x64-debug --target iTwinBRepCore"`（改了 iModelJsNodeAddon/iModelPlatform 时去掉 `--target` 全量构建）
  - 测试：`ctest --test-dir out/cmake/win-x64-debug -R BRepCoreTest --output-on-failure`
- **部署链**：C++ 改动生效须 `powershell -File D:\Github\tiangong-kaiwu\scripts\replace-imodeljs-native.ps1`（覆盖 node_modules 二进制+写 devbuild.json），验证=modeling-server 测试输出含 "using dev build from …" 横幅。
- **npm typings 冻结**：`api_package/ts` 零改动——TS 侧新调用面经 fork 内声明扩展（itwinjs-core editor/backend）或 modeling-server 本地 ambient 声明，**不改 npm 包**。
- **协议演进纪律**：新 op 码只追加（31 起），不动 0-30；`OperationType` 枚举两侧（native PSBRepEdit.cpp 局部 + fork EditBuiltInCommand.ts）同步加。
- **TDD**：先测试 RED（C++ 的 RED=构建失败或 ctest FAIL）再实现 GREEN。
- **imodel-native 有自己的 CLAUDE.md**（BentleyBuild 说明；本地实际用 CMake preset）——冲突时以本计划命令为准。

## File Structure

```
imodel-native（C++）：
  iModelCore/BRepCore/AcisTopologyId.h/.cpp        [改] 无需改（查询族已存在）——仅测试消费
  iModelCore/BRepCore/Tests/NonPublished/BRepCore_Tests.cpp  [改] TopologyID 查询语义+存活性测试（T1.4）
  iModelCore/PSBRepGeometry/PSBRepEdit.cpp          [改] op switch 新增 TopologyId 查询 op 码（31-34）+ validity op（35）
  iModelCore/PSBRepGeometry/PSBRepGeometry.h        [改] OperationType 枚举扩展（若枚举在此；以 grep 实际位置为准）
  iModelCore/iModelPlatform/PublicAPI/DgnPlatform/PlatformLib.h  [改] BRepGeometryAdmin 新虚函数（rollback mark）
  iModelCore/PSBRepGeometry/PSBRepEdit.cpp / 新文件 PSBRepRollback.cpp [改/新] rollback mark ACIS 实现
  iModelJsNodeAddon/IModelJsNative.cpp + .h         [改] NAPI 方法注册（rollback mark 三方法）
  docs/superpowers/specs/2026-09-29-rollback-mark-semantics.md [新] mark 生命周期语义（T1.2 出口）
  docs/superpowers/specs/2026-09-29-poisoned-state-findings.md [新] #27 调查结论

tiangong-kaiwu（TS）：
  itwinjs-core/editor/backend/src/EditBuiltInCommand.ts  [改] OperationType+params 类型扩展（需 rush build --to @itwin/editor-backend）
  modeling-server/src/feature/TopologyId.test.ts    [新] TS 集成测试（查询语义+nodeId 确定性）
  docs/superpowers/specs/2026-09-28-cad-full-program-roadmap.md [改] WS1 状态标记
```

---

### Task 1: C++ 层 TopologyID 查询与确定性测试（T1.4 核心 + T1.1 基座）

**Files:**
- Modify: `D:\Github\imodel-native\iModelCore\BRepCore\Tests\NonPublished\BRepCore_Tests.cpp`
- 参考（只读）: `iModelCore/BRepCore/AcisTopologyId.h`（查询族签名）、`iModelCore/BRepCore/AcisTopologyId.cpp`

**Interfaces:**
- Consumes: `AcisTopologyId::AssignIdsToNewFaces(body, nodeId)`、`FindNodeIdRange`、`ChangeNodeIdAttributes`、`AddNodeIdAttributes(body, nodeId, false)`、`FacesFromId(faces, FaceId, body)`、`IdFromFace(FaceId&, FACE*, useHighestId)`（均已在 AcisTopologyId.h:85-130）。
- Produces: 测试辅助 `makeBoxWithIds(uint32_t nodeId)`（复用于 Task 2/6）；断言基线「同序列两遍重建 nodeId 一致」。

- [ ] **Step 1: 写失败测试**（BRepCore_Tests.cpp 追加，仿既有 TEST 宏形态——先读文件头确认测试框架是 googletest 还是自研断言，用同款）

```cpp
// T1.4: TopologyID 查询族语义 + 跨布尔存活 + 序列化 roundtrip + 确定性
TEST(BRepCore_TopologyIdQuery, FacesFromIdSplitSemantics)
    {
    // 立方体打标 nodeId=1 → 切槽（分裂顶面）→ FacesFromId(1,1) 返回 2 面（分裂双持原 id）
    // 实现: 用 BRepUtil::Create 建盒 + BRepUtil::Modify::BooleanOperation(Subtract) 切小盒
    // 断言: FindNodeIdRange 高位=2（切槽 op 打标）；FacesFromId({1,1}) 得 2 个 FACE*
    }
TEST(BRepCore_TopologyIdQuery, DeterministicAcrossRebuild)
    {
    // 同参数链跑两遍（盒+切槽），收集每面 IdFromFace 集合——两遍集合完全一致（T1.1 出口标准）
    }
TEST(BRepCore_TopologyIdQuery, SurvivesSaveRestoreRoundtrip)
    {
    // _SaveEntityToMemory → _RestoreEntityFromMemory 后 FacesFromId 仍命中（ATTRIB 持久性）
    }
```

（骨架给出断言意图与构造序列；实现者按文件内既有 TEST 风格补全构造代码，布尔/打标调用照 `AcisTopologyId.cpp` 内部用法。）

- [ ] **Step 2: ctest 跑 RED**：`ctest --test-dir out/cmake/win-x64-debug -R BRepCoreTest --output-on-failure` → 新用例 FAIL（或编译错，均是有效 RED）。
- [ ] **Step 3: 若实现层有缺陷则修 AcisTopologyId.cpp；纯测试问题修测试至 GREEN**（查询族已在迁移工程验收过，预期测试直接可绿——RED 若不出现说明断言太弱，加强）。
- [ ] **Step 4: 全套 ctest 绿 + Commit**（imodel-native）：`git add -A && git commit -m "test(brepcore): TopologyID 查询语义/分裂存活/roundtrip/确定性测试（T1.4）…"`

---

### Task 2: 31-op 协议新增 TopologyID 查询 op 码（T1.1 核心，C++ 侧）

**Files:**
- Modify: `D:\Github\imodel-native\iModelCore\PSBRepGeometry\PSBRepEdit.cpp`（op switch :2687 起追加 case）
- Modify: OperationType 枚举定义处（先 `grep -rn "enum.*OperationType\|LocateFace =" iModelCore/PSBRepGeometry/` 定位实际文件，TS 侧镜像在 EditBuiltInCommand.ts:418）

**Interfaces:**
- Consumes: Task 1 的 AcisTopologyId 查询族；PSBRepEdit.cpp 既有 `doOperation(GeometryCache::IProcessor&, db, elementId)` 管线（:2638）与既有查询 op 的 processor 模式（`LocateFace`/`BodySubEntities` 的实现为模板）。
- Produces（op 码与 wire 形态，TS 侧 Task 4 消费，逐字一致）：
  - `op: 31` TopologyIdFromSubEntity——params `{ id: elementId, op:31, subEntityId: string }` → onGeometry 回调 entry 或返回 `{ nodeId, entityId }`
  - `op: 32` FacesFromId——params `{ id, op:32, nodeId:number, entityId:number }` → 命中面的 subEntityId 数组
  - `op: 33` EdgesFromId——params `{ id, op:33, faceId:[{nodeId,entityId},{nodeId,entityId}] }` → 边 subEntityId 数组
  - `op: 34` AllTopologyIds——params `{ id, op:34 }` → `[{nodeId,entityId},…]`（特征树/调试用）

- [ ] **Step 1: 读模板**：完整读 PSBRepEdit.cpp 中 `LocateFace`（:2717）与 `BodySubEntities` 两个 case 的实现（processor 结构、onGeometry 回调形态、返回值组装），新 op 逐字仿其形态。
- [ ] **Step 2: 枚举扩 31-34**（native 侧 OperationType 定义处）。
- [ ] **Step 3: 实现四个 case**（委托 AcisTopologyId 查询族；GeometryCache processor 内拿到 IBRepEntity → `entity->GetFACEPtr()` 系转换若需要，查 AcisKernelEntity 的既有转换助手）。核心形态：

```cpp
case OperationType::FacesFromId: {
    // 解析 params.nodeId/entityId → FaceId{id.nodeId, id.entityId}
    // AcisTopologyId::FacesFromId(faces, faceId, *body) → SUCCESS
    // 对命中 FACE* 反查缓存 sub-entity id（仿 BodySubEntities 的 id 生成路径）
    // 组装 Napi 返回数组
    break; }
```

- [ ] **Step 4: 构建 + C++ 侧无新测试可跑（协议层由 Task 4 的 TS 集成测试验证）+ Commit**：`feat(brepcore): 31-op 协议新增 TopologyID 查询 op 31-34（T1.1）…`
- [ ] **Step 5: 全量构建（无 --target，IModelJsNodeAddon/DgnCore 未动则可 --target iTwinBRepCore）+ 全套 ctest 无回归 + 部署**：`powershell -File D:\Github\tiangong-kaiwu\scripts\replace-imodeljs-native.ps1`（在 tiangong-kaiwu 仓跑）。

---

### Task 3: validity check 暴露（T1.3，C++ 侧）

**Files:**
- Modify: PSBRepEdit.cpp op switch（新增 `op: 35` ValidateBody）

**Interfaces:**
- Produces: `op: 35`——params `{ id, op:35 }` → `{ valid: boolean, firstIssue?: string }`。委托 `BRepUtil` 有效性门面（先 `grep -n "HasConsistentTopologyAndGeometry\|check_entity" iModelCore/BRepCore/SolidKernel.h iModelCore/BRepCore/*.cpp` 定位门面名与签名——盘点确认其为持久化前内部守门，找到调用点照抄调用形态）。

- [ ] **Step 1: 定位门面**（grep 如上）并读其在 _SaveEntityToMemory 路径的既有用法。
- [ ] **Step 2: 实现 case 35**（仿 Task 2 形态；无参数）。
- [ ] **Step 3: 构建 + ctest + 部署 + Commit**：`feat(brepcore): validity check 暴露为 op 35（T1.3）…`

---

### Task 4: TS 侧枚举扩展 + modeling-server 集成测试（T1.1/T1.3 出口验收）

**Files:**
- Modify: `D:\Github\tiangong-kaiwu\itwinjs-core\editor\backend\src\EditBuiltInCommand.ts:418`（OperationType 枚举 + 请求/响应 props 接口 + SolidModelingCommand 公开方法 `topologyIdFromSubEntity/facesFromId/edgesFromId/allTopologyIds/validateBody`，仿 `blendEdges`(:243 区域) 的方法形态）
- Create: `D:\Github\tiangong-kaiwu\modeling-server\src\feature\TopologyId.test.ts`

**Interfaces:**
- Consumes: Task 2/3 的 op 码 31-35 与 wire 形态（逐字）。
- Produces: TS 调用面（M3 的 T3.4/T6.3 消费）。

- [ ] **Step 1: rush 构建 editor-backend**：`cd itwinjs-core && node common/scripts/install-run-rush.js build --to @itwin/editor-backend`（改了 editor/backend 源码必须先重建 lib）。
- [ ] **Step 2: 写失败集成测试**（TopologyId.test.ts，StandaloneDb + 建 box 元素 → `updateElementGeometryCache` 建缓存 → `elementGeometryCacheOperation` 走 op 31-35——注意 editor-backend 的 SolidModelingCommand 经 IPC 不便在测试直取，直接 `db[_nativeDb].elementGeometryCacheOperation(...)` 或 `EditCommandAdmin` 取 SolidModelingCommand 实例，以 spike 的深链经验选可行路径并在测试注释记录）。断言：
  - op34 返回 6 面 id（盒，nodeId 一致）；
  - op32 用 (nodeId,1) 命中 1 面；
  - **确定性**：同参数建两个元素，id 集合逐项相等（T1.1 出口）；
  - op35 valid=true。
- [ ] **Step 3: RED→GREEN**（C++ 侧问题回 imodel-native 修；TS 声明问题本任务修）。
- [ ] **Step 4: 门禁 + Commit（tiangong-kaiwu）**：`feat(editor-backend)+test(modeling-server): TopologyID 查询/validity 的 TS 调用面与集成验收（T1.1/T1.3 出口）…`

---

### Task 5: rollback mark 暴露 + 生命周期语义（T1.2）

**Files:**
- Modify: `imodel-native/iModelCore/iModelPlatform/PublicAPI/DgnPlatform/PlatformLib.h`（BRepGeometryAdmin 虚函数）
- Create/Modify: `imodel-native/iModelCore/PSBRepGeometry/PSBRepRollback.cpp`（或并入 PSBRepEdit.cpp，实现小于 150 行就并入）
- Modify: `imodel-native/iModelJsNodeAddon/IModelJsNative.cpp/.h`（NAPI 三方法注册，仿 :3337 形态）
- Create: `imodel-native/docs/superpowers/specs/2026-09-29-rollback-mark-semantics.md`

**Interfaces:**
- Produces: `createRollbackMark(elementId) → { markId }`；`rollbackTo(elementId, markId) → { rolledBack: boolean }`；`releaseMark(elementId, markId)`。**mark 生命周期语义（写入 spec 文档，T1.2 出口）**：mark=ACIS 会话态（HISTORY_STREAM bulletin 级）；**不持久化**——模型重开=从 SAB 恢复 body + 按特征序重跑重建 mark 表（MS 层责任）；mark 表随元素失效（元素几何被直写更新后旧 mark 作废，rollbackTo 返回 rolledBack:false）。
- 实现锚点：先 `grep -rn "CreateRollbackMark\|RollbackMark\|HISTORY_STREAM" iModelCore/BRepCore/ D:/Spatial/ACIS_2025.1.0.1/include/ 2>/dev/null | head` 定位内核原语真实名（盘点名 CreateRollbackMark 未经验证——以 grep 结果为准，找不到则查 ACIS rollback bulletin API 文档名 api_rollbacks/restore_entity 等）。

- [ ] **Step 1: 探明内核原语**（grep 如上；ACIS 头在 D:\Spatial\ACIS_2025.1.0.1）。
- [ ] **Step 2: BRepGeometryAdmin 虚函数 + ACIS 实现**（mark 表=per-entity `bmap<uint32, 回滚快照句柄>` 存 admin 会话态）。
- [ ] **Step 3: NAPI 三方法 + 注册。**
- [ ] **Step 4: 语义文档**（出口标准要求的生命周期说明，含「模型重开=重建 mark 表」策略）。
- [ ] **Step 5: C++ 侧最小单测**（BRepCore_Tests.cpp：mark→改体→rollbackTo→体复原）+ 构建 + ctest + 部署 + Commit：`feat(brepcore): rollback mark 会话态暴露 + 生命周期语义（T1.2）…`

---

### Task 6: TS 集成——rollback mark 与预览链路验证

**Files:**
- Test: `modeling-server/src/feature/TopologyId.test.ts`（追加 describe）

**Interfaces:**
- Consumes: Task 5 的三方法（经 modeling-server 本地 ambient 声明：`declare module` 扩展或 `(nativeDb as any)` + 本地接口——typings 冻结约束）。
- Produces: T3.8（HITL 预览）的机制基座验证。

- [ ] **Step 1: 测试**：建 box → createRollbackMark → 直写改成另一 box → 断言几何已变 → rollbackTo → 断言几何复原（normalizeBrepGeomJson 比较）→ releaseMark。
- [ ] **Step 2: RED→GREEN + 门禁 + Commit（tiangong-kaiwu）**：`test(modeling-server): rollback mark 集成验证（T1.2 出口）…`

---

### Task 7: #27 中毒态 C++ 根因调查（时间盒 2 小时）

**Files:**
- Create: `imodel-native/docs/superpowers/specs/2026-09-29-poisoned-state-findings.md`

**Interfaces:**
- Consumes（入口证据，全部来自 tiangong-kaiwu 仓的调查）：`modeling-server/src/feature/debug-tail-root.test.ts` 探针矩阵（结论：body 首次几何=内嵌孔洞 → 后续 indirect `updateElement(elementGeometryBuilderParams)` 静默不落库，ECSQL 原始列哈希不变；直写免疫）；native 调用链 `JsInterop::UpdateElement`（JsInteropDgnDb.cpp:521）→ `CopyForEdit` → `FromJson` → `GeometricElement::_FromJson`（DgnElement.cpp:3737，builderParams 分支 `GeometryStreamIO::BuildGeometryStream`）→ `el->Update()`。

- [ ] **Step 1: 读通更新链**：JsInteropDgnDb.cpp:521-553 → DgnElement.cpp:3737-3780 → `GeometryStreamIO::BuildGeometryStream`（ElementGeometry.cpp）→ `DgnElement::Update/_OnUpdateElement/_BindWriteParams`（DgnElement.cpp:969 区域）→ `GeometryStream::BindGeometryStream`（DgnElement.cpp:3778 后）。
- [ ] **Step 2: 假设清单逐一核查**（黑盒已证伪的不再重试）：重点=间接 txn（EDE 传播内）的 Update 是否走不同代码路径（TxnManager 间接写标记 isIndirectChange 的 native 侧处理）；BuildGeometryStream 对「既有几何为内嵌拓扑」的元素是否有条件跳过（如 placement/bbox 重算失败静默吞）。
- [ ] **Step 3: 若根因找到且修复 <50 行**：修 + BRepCore/DgnCore 侧测试 + commit；否则结论文档写清「根因候选+下一步实验设计」。
- [ ] **Step 4: 结论文档落盘 + tiangong-kaiwu roadmap 风险 #10 更新引用 + Commit（两仓各自）**。

---

### Task 8: 收口——roadmap 标记 + 全量回归

- [ ] **Step 1**: tiangong-kaiwu `cd modeling-server && npx vitest run && npx tsc --noEmit && npx eslint "src/feature/**/*.ts"` 全绿；imodel-native 全套 ctest 绿。
- [ ] **Step 2**: roadmap WS1 标记（T1.1✅T1.2✅T1.3✅T1.4✅ + 风险 #10/#27 结论引用）；风险 #6 补注「31-op 通道确认已实现（PSBRepEdit.cpp:2687 switch），TopologyID 查询已入该通道」。
- [ ] **Step 3**: Commit（两仓）+ 汇报。

---

## Self-Review 结论（已核对）

1. **Spec 覆盖**：T1.1=Task 2+4（op 31-33+确定性断言）、T1.2=Task 5+6（含生命周期文档出口）、T1.3=Task 3+4、T1.4=Task 1（存活/roundtrip）+Task 4（JS 层确定性）。T1.8 不在本计划（桥接由 op 32/33 返回缓存子实体 id 天然消解，M3 T3.4 时验证）。#27=Task 7。
2. **占位符**：两处「先 grep 定位」为显式探查指令（枚举文件位置/内核原语名），附了 grep 命令与判据——非 TBD。
3. **类型一致性**：op 码 31-35 在 Task 2/3/4 三处逐字一致；mark 三方法名在 Task 5/6 一致；FaceId={nodeId,entityId} 贯穿。
