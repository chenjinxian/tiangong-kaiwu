# iTwin.js Core 修改记录（真实台账）

> **命名口径（2026-10-29）**：本台账按时间追加，历史条目中的旧目录名（`web-next`、
> `viewer-next`、`viewer-core`、`web-viewer` 等）只描述当时状态；当前结构为
> `luban-cad/apps/web` + `luban-cad/packages/{shared,viewer,editor}`，见
> `docs/MIGRATION-2026-10-29.md`。

**最后更新**: 2026-10-29
**基准**: upstream master 8bdef3e3cd（5.15.0-dev.2；`@bentley/imodeljs-native` 5.15.5；2026-10-03 同步后基线）
**汇总**: 20 个文件，+10,963 行 / -58 行（2026-09-22 基线快照；5.15 同步后未重算，以逐文件明细为准；不含 `luban-cad/` 与 lockfile）

**统计口径**: `git diff master...dev/luban-cad --stat -- ':!luban-cad' ':!common/config/rush/pnpm-lock.yaml'`（2026-09-22 实测；旧分支名属历史口径）。汇总的 +10,963/-58 为插入/删除行；逐文件括号数字为 `--stat` 变更行数（增+删），两者关系：各文件变更行合计 11,021 = 10,963 + 58。

---

## 1. 修改性质分类

文件数 5 + 1 + 14 = 20；变更行 7,631 + 583 + 2,807 = 11,021（与汇总对账 ✓）。

### 1.1 复活上游已删除的工具（5 文件，7,631 行）

上游 PR #6495（`4aefc17641` "Remove internal test tools from editor package"）删除了内部测试工具；
本 fork 在 `c76e2ab36d` "Integrate old editor modeling tools into v5.9.0-dev.4" 将其复活并持续修补。

文件（`editor/frontend/src/`）：

| 文件 | 变更行 |
|------|--------|
| SketchTools.ts | +2,163 |
| SolidModelingTools.ts | +1,807 |
| SolidPrimitiveTools.ts | +1,784 |
| ModifyCurveTools.ts | +969 |
| ElementGeometryTool.ts | +908 |
| **小计** | **7,631** |

> 口径说明：已知事实库曾记本类 "~9,400 行"，系含同 commit 配套文件（TransformElementsTool、EditBuiltInCommand、Editor.json、verify-config.sh 等）的宽口径；上表 5 文件 `--stat` 实测合计为 7,631，本台账按逐文件实测计。

### 1.2 共享接口扩展（高风险，同步易碎）（1 文件，583 行）

- `editor/common/src/EditorBuiltInIpc.ts`（+583）—— 扩展编辑器前后端 IPC 接口。上游同文件改动即冲突；且任何上游对接口实现方（如 `IpcAppFunctions`）加方法都会波及本 fork 的实现类，见 §2。

### 1.3 上游文件修补（14 文件，2,807 行）

对上游存续文件的修补与 fork 新增配套（同一修改面内的其余 14 个文件）：

**a) editor 前端/后端源码修补（6 文件，1,317 行）**

| 文件 | 变更行 | 说明 |
|------|--------|------|
| `editor/frontend/src/TransformElementsTool.ts` | +511 | 含 import 修复（补齐 Id64Array/Code/ColorDef 等缺失导入） |
| `editor/modeling-server/src/EditBuiltInCommand.ts` | +736 | 与 1.1 同 commit（`c76e2ab36d`）的后端配套 |
| `editor/frontend/src/DeleteElementsTool.ts` | +42 | |
| `editor/frontend/src/EditTool.ts` | +16 | |
| `editor/frontend/src/EditToolIpc.ts` | +6 | |
| `editor/frontend/src/editor-frontend.ts` | +6 | 工具导出入口 |
| **小计** | **1,317** | |

**b) editor 配置 / 文档 / 脚本（3 文件，1,239 行）**

| 文件 | 变更行 | 说明 |
|------|--------|------|
| `editor/frontend/src/public/locales/en/Editor.json` | +411 | 复活工具的 locale 串 |
| `editor/EDITOR_MODULE_ANALYSIS.md` | +717 | fork 新增分析文档（`c76e2ab36d`） |
| `editor/verify-config.sh` | +111 | fork 新增校验脚本（`c76e2ab36d`） |
| **小计** | **1,239** | |

**c) rush / monorepo 配置（4 文件，247 行）**

| 文件 | 变更行 | 说明 |
|------|--------|------|
| `common/config/rush/browser-approved-packages.json` | +192 | rush 依赖准入清单（rush update 产物） |
| `rush.json` | +51 | luban-cad 项目注册 + reviewCategory（`224b47a213`） |
| `common/config/rush/common-versions.json` | +2 | `@types/react` 17→18 preferred version |
| `common/config/rush/repo-state.json` | +2 | rush update 产物 |
| **小计** | **247** | |

**d) core/modeling-server 小修（1 文件，4 行）**

| 文件 | 变更行 | 说明 |
|------|--------|------|
| `core/modeling-server/src/CheckpointManager.ts` | +4 | V2 Checkpoint 认证/自愈修复（`91b94097e1`） |
| **小计** | **4** | |

1.3 合计：6 + 3 + 4 + 1 = **14 文件**；1,317 + 1,239 + 247 + 4 = **2,807 行**。

---

## 2. 同步维护成本

每次 upstream 同步的已知坑清单见 `luban-cad/docs/UPSTREAM_SYNC.md` §「冲突处理经验（2026-09 同步 5.9→5.14 时踩过的坑）」，共 6 条：

1. **lockfile 冲突**：`pnpm-lock.yaml` 不手工合并，取 master 版后 `rush update` 重新生成；
2. **`ensureConsistentVersions` 版本不一致**：occ 各包依赖版本对齐上游；
3. **dev 版包 peerDep 找不到**：workspace 内显式声明 `workspace:*`；
4. **接口新增方法**：上游给 `IpcAppFunctions` 等接口加方法时，本仓实现类须补实现——**这正是 §1.2 接口扩展的风险变现路径**；
5. **依赖小版本升级的类型收紧**：vitest/react-query/@types/react/iTwinUI 局部小修；
6. **git 邮箱策略**：本地操作 `--bypass-policy` 跳过。

**本周实例（坑 #4 的实况预演）**：上游合并后 `IpcAppFunctions` 新增 `cancelPushChangesRequest`（`core/common/src/IpcAppProps.ts:219`），导致本仓 `AppFunctionIpcHandler`（实现该接口）编译失败，由 `8feafd5efc` "Fix luban-cad compile errors and update lockfile after master merge" 补 no-op 实现（`modeling-server/src/ipc/AppFunctionIpcHandler.ts:300`）。此类破损与 §1.2 的共享接口扩展同属一个风险类：**只要 fork 持有上游共享接口的扩展或实现，上游每次接口演进都是一次强制跟进**。

---

## 3. 战略建议

将 §1.1 类（复活的 editor 工具，7,631 行）连同 §1.2 的接口扩展逐步**迁出上游 `editor/` 目录，收编至 luban-cad 独立包**，使上游 editor 包回归零修改面，把同步税从"每轮合并持续冲突"降为"独立包自行演进"。

本文件只记事实台账，一事一源，不重复战略推理。

> **2026-10-22 落地**：editor 模块整体收编 luban-cad（用户裁决——上游不会再更新建模功能），
> §1.1/§1.2/§1.3a/b 全部 editor 面随 `itwinjs-core/editor/*` 迁入 `luban-cad/packages/editor/`
> 成为第一方包（包名暂保 `@itwin/editor-*`），**editor 模块自此不再是 fork 修改而是
> luban-cad 自有实现，fork 内不再维护**；后续 subtree pull 带回上游 editor/ 的删除流程
> 见 `docs/UPSTREAM_SYNC.md`「editor/ 收编检查单」。详见 §5 台账末行。

---

## 4. 自动生成文件

以下文件由 rush/pnpm 自动生成，不属于手写代码修改：

| 文件 | 说明 |
|------|------|
| `common/config/rush/pnpm-lock.yaml` | rush update 自动生成（**已从本台账 20 文件统计中排除**） |
| `common/config/rush/repo-state.json` | rush update 自动生成（其变更计入上表 1.3c，非手写） |
| `common/config/rush/browser-approved-packages.json` | rush 自动维护（其变更计入上表 1.3c，非手写） |
| `pnpm-lock.yaml`（根目录） | rush update 自动生成；上游已删根 lockfile，本 fork 跟随删除 |

---

## 5. 台账快照（2026-09-22）后追加修改（按时间序）

§1 的分类与统计为 2026-09-22 快照口径；此后新增的对上游存续文件的修改逐条记于此，不回填 §1 统计。

| 日期 | commit | 文件 | 性质 | 说明 |
|------|--------|------|------|------|
| 2026-09-30 | `22a38fd2d9` | `editor/backend/src/EditBuiltInCommand.ts`（+139/-1） | 上游文件修补·纯追加 | WS1 T1.1/T1.3：OperationType 枚举扩 31-35 + 请求/响应 props 接口 + SolidModelingCommand 五个查询方法（topologyIdFromSubEntity/facesFromId/edgesFromId/allTopologyIds/validateBody），仿查询族形态（params.onResult 回调出线），wire 逐字消费 imodel-native 8e5ab9c60。导出 `TopologyIdProps` 供 M3 消费。同步风险与 §1.3 同类：上游若重排 OperationType 枚举尾部/改 `elementGeometryCacheOperation` 签名即冲突，但枚举追加在尾部、方法追加在类尾，冲突面最小 |
| 2026-10-11 | 0219efe4d0 | `rush.json`（尾部追加 `eventHooks`，+10 行） | fork 本地接线·纯追加 | rush postInstall 自动接线：`eventHooks.postRushInstall` 挂 `node ../scripts/replace-imodeljs-native-postinstall.cjs`（守卫包装：非 Windows 跳过 / Windows 转交 replace-imodeljs-native.ps1），消灭 rush update 重装后回退官方原生包的手工纪律。同步风险：**rush.json 按仓规与上游逐字节一致，subtree 同步冲突时取上游版本后须重新追加本块**（块内注释已自标记）；守卫脚本在 subtree 之外（仓库根 scripts/），不受同步影响 |
| 2026-10-15 | `6a3ff3d3ef` | `editor/backend/src/EditBuiltInCommand.ts`（+45/-3 行） | 上游文件修补·侵入式小改 | RW2-T4 D7 直改守卫挂钩：模块级 `bindDirectEditGuard(hooks)` DI 出口（形态仿 LubanCadSchema.bindFeatureEngine，导出 `DirectEditOp`/`DirectEditGuardHooks`）+ `applyDirectEditGuard` 统一调用入口（无挂钩 no-op、挂钩异常吞掉——隔离带故障不得阻断直改工具可用性）；BasicManipulationCommand 四写点接入：deleteElements（循环首行，无 props 形态）/transformPlacement/rotatePlacement（`element.toJSON()` 就地取 props、守卫改写后 updateElement）/updateGeometricElement（收口全部几何改写，SolidModelingCommand writeChanges 分支经此自动覆盖）。侵入面：两个 placement 循环体各 +2 行、deleteElements 循环 +1 行、updateGeometricElement +1 行——同步冲突面与 §1.3 同类：上游若改这几个方法的循环体/写点上下文即需手工重放本块（块首注释已自标记，冲突时按 bindDirectEditGuard 符号检索即可定位） |
| 2026-10-22 | 本提交 | `editor/`（frontend/backend/common 全目录）+ `rush.json` 三条目 + `full-stack-tests/core`、`test-apps/display-test-app` 的 editor 依赖 | **归属变更·整体迁出** | editor 模块收编 luban-cad（用户裁决）：§1 全部 editor 面（复活工具 + 接口扩展 + 修补，约 1.3 万行——editor 三包 src 13,306 行 + luban 随迁工具/测试 2,141 行）随 `itwinjs-core/editor/*` 原样迁入 `luban-cad/packages/editor/{frontend,backend,common}`（包名暂保 `@itwin/editor-*`，最小化私有仓 modeling-server 的 link: 搅动），成为 **luban-cad 第一方建模基座**——fork 内不再维护；web-next M4-T3 移植的四建模工具连同测试自 viewer-next 迁入其 `src/luban/`。fork 侧同步删除：rush.json 三条 editor 项目、两个 rush 测试应用的 `@itwin/editor-*` workspace 依赖（其后 fork 内这两应用不再可编译，属上游本地测试壳，已知搁置）。后续 subtree pull 会带回上游 editor/——删除流程见 `docs/UPSTREAM_SYNC.md`「editor/ 收编检查单」。§3 战略建议自此落地 |

---

## 6. fork 本地删除记录（非上游修改）

此节记录不属于「对上游存续文件的修改」的 fork 本地整理，不计入 §1/§5 修改台账。

- 2026-10-29：删除 `open-cloud-cad/`（旧品牌应用历史拷贝，438 files）。
  该目录非 rush 项目、无构建消费者；删除属于 fork 本地整理，不是上游修改。
  同步检查见 `docs/UPSTREAM_SYNC.md`「旧应用拷贝检查单」。
