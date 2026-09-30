# M2 草图与约束求解（后端闭环）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 约束求解入环——草图成为 EDE 图源节点，改草图尺寸→求解→全零件联动（M2 出口），并落地建链轨迹规范化（中毒态唯一应用层防御）。

**Architecture:** libslvs（SolveSpace 官方 C 库）编译为 Node 原生插件（node-gyp，VS 工具链已实证），以相对路径 require 进 modeling-server（绕开 link: 依赖坑）；其上立 solver-neutral 接口（绳墨平替契约，TS 类型+zod）；Sketch=新 ECSchema 元素（GeometricElement3d，params 存 solver-neutral 实体/约束表，解算几何进几何流供显示）；extrude 的 profile 来源从内联 JSON 改为引用草图元素（sketchId）；改尺寸 op = 求解→更新草图行→EDE 传播→下游重建。

**Tech Stack:** TypeScript/ESM、libslvs（C，SolveSpace 官方仓 exposed/）、node-gyp + N-API、zod、Vitest。

**Spec:** `docs/superpowers/specs/2026-09-27-feature-system-imodel-architecture-design.md` §3.1c/§3.2（草图入图源节点）；roadmap WS4（T4.0/T4.1/T4.2/T4.4/T4.5）+ 风险 #10 定论（轨迹规范化=防御）；D5 裁决（libslvs 过渡+接口中立；红线 on-prem 交付）。

## Global Constraints

- 仓：tiangong-kaiwu，分支 `m2-sketch-solver`（自 main 拉）。
- 门禁：`cd modeling-server && npx vitest run && npx tsc --noEmit && npx eslint "src/**/*.ts"` 全绿（新目录进 eslint 范围）。
- commit `feat/fix/test(modeling-server): …` + `Co-Authored-By: Claude Code <noreply@anthropic.com>` 尾行。
- **link: 依赖纪律**：原生插件不经 package.json——源码放 `modeling-server/native/slvs/`，构建产物 `.node` 以相对路径导入；加 npm devDep 须手改 package.json+`corepack pnpm@10 install --no-frozen-lockfile`。
- **solver-neutral 纪律**：FeatureService/引擎只消费接口类型，不得 import 任何 libslvs 符号（绳墨平替的构造保证）。
- **GPLv3 红线**（D5）：libslvs 仅纯云 SaaS 服务端进程内使用；**禁止**把任何 SolveSpace 派生二进制放入前端交付物（FE WASM 归 M2-UX 时另裁）。
- 草图几何原点锚定纪律（风险 #10）：草图元素平面取 XY 平面且 profile 解算结果经引擎时沿用现有 sweep 路径。
- 超时 180s 级；native 构建（node-gyp）用 VS 环境（vcvars64 已在 PATH 场景验证）。

## Design Notes

1. **MS 求解器形态裁决**：node-gyp 原生插件（非 WASM）——VS 工具链已实证、免装 Emscripten、与「进程内直链」字面一致；FE WASM（T4.3）归 M2-UX 后续计划（届时单裁 GPL 交付面）。接口中立保证平替成本≈0。
2. **DOF 暴露**（T4.0 待验证项）：libslvs 的 Slvs_Solve 不直接回 DOF；SolveSpace 的 DoF 计算在其 SK 层。若 C API 确无：接口层以「约束计数法」近似（实体自由度和−约束方程数），spike 定案并把公式写进接口文档注释。
3. **草图→特征的数据面**：extrude params 增可选 `sketchId`——有则 evaluateFeature 从草图元素的 solved 几何流反读 profile（平面多边形化），无则维持内联 profile（M1 兼容）。
4. **M2 出口测试形态**：服务级（无 UI）——insert sketch(矩形+宽度尺寸) → insert extrude(sketchId) → updateSketchDimension(10→20) → 断言 body 几何联动 + 过约束草图被拒。

---

### Task 1: T4.0 spike——libslvs 获取与 API 摸底

**Files:**
- Create: `D:\Github\SolveSpace`（git clone https://github.com/solvespace/solvespace —— 仓外检出，非本仓提交物）
- Create: `modeling-server/native/slvs/`（从 exposed/ 拷入 libslvs 三件：`slvs.h`/`libslvs.c`（若拆分则连同）——以实际文件为准）
- Create: `docs/superpowers/plans/2026-09-30-m2-slvs-facts.md`（spike 报告：API 事实清单）

**Interfaces:**
- Produces: `slvs.h` 全 API 事实（Slvs_System 字段/Slvs_Entity/Slvs_Constraint/Slvs_Solve 签名/错误码三态）；DOF 暴露定论（有→字段名；无→约束计数法公式确认）；C 源文件清单与自包含性（无外部依赖）确认。

- [ ] **Step 1**: `git clone --depth 1 https://github.com/solvespace/solvespace D:\Github\SolveSpace`（网络操作；失败则报 BLOCKED）。
- [ ] **Step 2**: 通读 `exposed/slvs.h` + `exposed/libslvs.c`（或 exposed/ 下 C 源实际布局），写事实清单（每个 API 签名+语义；重点：Slvs_Solve 返回值语义、sys.failed/faileds/ok 三态、DoF 是否出现于任何头字段）。
- [ ] **Step 3**: 拷贝 C 源进 `modeling-server/native/slvs/`（含 LICENSE 文件——GPL 合规留痕）。
- [ ] **Step 4**: 事实文档落盘+commit（仅 facts 文档与 native/slvs/ 源入本仓）。

### Task 2: T4.1——solver-neutral 接口定版

**Files:**
- Create: `modeling-server/src/sketch/SolverTypes.ts`
- Test: `modeling-server/src/sketch/SolverTypes.test.ts`（zod 校验单测）

**Interfaces:**
- Produces（后续全部任务消费，签名逐字）:
```ts
/** 点/线/圆三种实体（v1 子集；椭圆等留绳墨） */
type SketchEntity =
  | { kind: "point"; id: number; x?: number; y?: number }
  | { kind: "line"; id: number; p1: number; p2: number }
  | { kind: "circle"; id: number; center: number; radius?: number };
interface SketchConstraint { kind: "coincident"|"horizontal"|"vertical"|"parallel"|"perpendicular"|"equal"|"distance"|"radius"; id: number; refs: number[]; value?: number }
interface SketchSolveRequest { entities: SketchEntity[]; constraints: SketchConstraint[]; paramsHint?: Record<number, number>; group?: number }
type SketchSolveStatus = "ok" | "underconstrained" | "conflicting" | "failed";
interface SketchSolveResult { status: SketchSolveStatus; dof: number; solved: { points: Record<number, {x:number;y:number}>; radii: Record<number, number> }; failedConstraintIds: number[]; conflictingRank: number[] }
interface SketchSolver { solve(req: SketchSolveRequest): SketchSolveResult }
```
- zod schema 同形导出（`SketchSolveRequestSchema` 等）；每类型的 TS JSDoc 注明「绳墨平替契约：字段语义冻结」。

- [ ] TDD：先写 zod 单测（合法/非法请求各一）→ 红 → 实现 → 绿 → commit。

### Task 3: T4.2——slvs 原生插件 + SlvsSolver 适配层

**Files:**
- Create: `modeling-server/native/slvs/addon.cc`（N-API 包装：load→solve，输入输出 JSON 序列化桥）
- Create: `modeling-server/native/slvs/binding.gyp`
- Create: `modeling-server/src/sketch/SlvsSolver.ts`（实现 SketchSolver；require 相对路径 `../../native/slvs/build/Release/slvs.node`）
- Test: `modeling-server/src/sketch/SlvsSolver.test.ts`

**Interfaces:**
- Consumes: Task 1 事实清单（slvs.h API）+ Task 2 类型。
- Produces: `new SlvsSolver()` 实例（进程内单例即可）；三态行为契约：欠约束→underconstrained+dof>0+当前解；恰定→ok+dof=0；过约束→conflicting+failedConstraintIds；数值不收敛→failed。

- [ ] Step 1: binding.gyp（sources: libslvs C 源+addon.cc；msvs settings 沿 VS 默认）+ addon.cc（N-API：`solve(jsonReq: string): string`，内部构造 Slvs_System、实体/约束映射、Slvs_Solve、结果收集）。构建：`cd native/slvs && npx node-gyp rebuild`（首跑下载 node 头，网络）。
- [ ] Step 2: SlvsSolver.ts 适配（kind→Slvs_Entity type 映射、约束 kind→Slvs_C…_TYPE 映射按 Task1 事实清单；DOF=清单定论实现）。
- [ ] Step 3: TDD 三态用例（三角欠约束 dof>0；+两尺寸恰定 ok；矛盾尺寸 conflicting；半径不收敛 failed）→ 绿 → commit。
- [ ] Step 4: `.gitignore` 追加 `native/slvs/build/`；README 一行构建说明（README.md 或 facts 文档）。

### Task 4: T4.4——Sketch 元素 schema 与助手

**Files:**
- Modify: `modeling-server/src/feature/LubanCadSchema.ts`（schema XML 加 `Sketch extends GeometricElement3d`：`planeZ?: double`（v1 恒 0=XY 面）、`params: string`（solver-neutral JSON：{entities, constraints}）；JS 类 `LubanSketch`（无 EDE 回调——草图是源节点）；助手 `insertSketchElement`/`querySketch(db)`/`updateSketchParams`）
- Test: `modeling-server/src/feature/LubanCadSchema.test.ts`（追加）

**Interfaces:**
- Produces: `SketchProps extends GeometricElement3dProps { planeZ: number; params: string }`；`insertSketchElement(txn, ctx, {entities, constraints}): Promise<Id64String>`；`querySketch(db): {id, params} | undefined`。

- [ ] TDD：插入/查询/params roundtrip → 绿 → commit。

### Task 5: 建链轨迹规范化（中毒态防御，风险 #10 定论）

**Files:**
- Modify: `modeling-server/src/feature/FeatureService.ts`（applyInsert 的 booleanAdd/booleanSubtract：第一步 params 的 profile 一律替换为角点工具形态（min-corner 锚定原点的同尺寸矩形），saveChanges 传播落地；第二步立即 updateParams 到目标参数再传播——两步同 txn 两 saveChanges，单 changeset）
- Test: `modeling-server/src/feature/FeatureService.test.ts`（追加：内嵌工具 booleanSubtract 直接插入 → suppress 生效（健康轨迹验证））

**Interfaces:**
- Consumes: M1 既有 applyInsert/applyUpdate 内部路径。
- Produces: `normalizeToolProfile(profile): {x,y}[]`（平移至 min-corner=原点；实现于 FeatureService 或 registry util，导出供测试）。

- [ ] TDD：先写「内嵌工具直插→suppress→body 变化」用例（当前必红——M1 中毒）→ 实现两步插入 → 绿 → commit。

### Task 6: T4.5——草图入 EDE 与 M2 出口（核心）

**Files:**
- Modify: `modeling-server/src/feature/FeatureEngine.ts`（evaluateFeature：extrude 读取 params.sketchId → 从草图元素几何流取 solved 轮廓（平面多边形提取：读 geom 的 LineSegment/Arc 条目投影 XY；草图几何由求解结果生成，多边形化为 profile 点列））
- Modify: `modeling-server/src/feature/LubanCadSchema.ts`（extrude 的 EDE 建边：FeatureService.applyInsert 时若带 sketchId，建 `sketch→feature` 边）
- Modify: `modeling-server/src/feature/FeatureService.ts`（新 op `applySketchDimension`：{kind:"updateSketchConstraint", sketchId, constraintId, value} → SlvsSolver.solve → 状态非 ok 则拒（op result error 带 dof/冲突清单）→ 更新草图 params+几何流（solved 轮廓重建显示几何）→ saveChanges 传播）
- Modify: `luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts`（FeatureOp union 加 updateSketchConstraint；改后须 `pnpm build` shared）
- Test: `modeling-server/src/feature/SketchFlow.test.ts`（**M2 出口**）

**Interfaces:**
- Consumes: Task 2/3/4 全部 + M1 FeatureService。
- Produces: FeatureOp 新分支 `{ kind: "updateSketchConstraint"; sketchId: string; constraintId: number; value: number }`；extrude params 可选字段 `sketchId: string`。

- [ ] Step 1: **M2 出口测试（先红）**：insert sketch（矩形 4 点+4 线+水平/垂直/相等约束+宽度 distance=10）→ insert extrude({sketchId, distance:5}) → 断言 body 含 BRep → applySketchDimension(宽度 10→20) → 断言（a）草图几何流更新（b）**body 几何联动变化**（归一化不等）→ 过约束用例（加矛盾尺寸→ok:false 拒收，库无变更）。
- [ ] Step 2: 引擎消费 sketchId（轮廓多边形化 util `sketchProfileFrom(db, sketchId): {x,y}[]`）。
- [ ] Step 3: EDE 边（sketch→feature；FeatureService.applyInsert 带 sketchId 时）。
- [ ] Step 4: applySketchDimension op（求解→校验三态→更新草图 params+几何流→传播）。shared 接口扩展+构建。
- [ ] Step 5: 绿+全量门禁+commit。

### Task 7: 收口

- [ ] 全量回归+门禁；roadmap：T4.0✅T4.1✅T4.2✅T4.4✅T4.5✅+轨迹规范化✅、M2 标达成（附测试计数）、T4.3/T4.6/T4.7 标注「M2-UX 后续计划」；memory 更新；commit。

## Self-Review 结论

1. 覆盖：M2 出口（改尺寸联动）=Task 6；毒防御=Task 5；接口中立=Task 2+Global Constraint；DOF 待验证项=Task 1 定案点。T4.3/T4.6/T4.7 显式划出（FE 后续计划）。
2. 占位符：Task 1 的 API 事实「以实际文件为准」是显式探查指令（附命令）；Task 3 映射「按 Task1 事实清单」为受控消费（接口签名已冻结）。
3. 类型一致：SketchSolveRequest/Result 在 Task 2/3/6 逐字一致；FeatureOp 新分支在 Task 6 内定义+消费。
