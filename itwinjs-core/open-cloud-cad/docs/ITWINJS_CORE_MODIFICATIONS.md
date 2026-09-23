# iTwin.js Core 修改记录（真实台账）

**最后更新**: 2026-09-22
**基准**: upstream master 41fc5f3a81（5.14.0-dev.15）
**汇总**: 20 个文件，+10,963 行 / -58 行（不含 `open-cloud-cad/` 与 lockfile）

**统计口径**: `git diff master...dev/open-cloud-cad --stat -- ':!open-cloud-cad' ':!common/config/rush/pnpm-lock.yaml'`（2026-09-22 实测）。汇总的 +10,963/-58 为插入/删除行；逐文件括号数字为 `--stat` 变更行数（增+删），两者关系：各文件变更行合计 11,021 = 10,963 + 58。

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
| `editor/backend/src/EditBuiltInCommand.ts` | +736 | 与 1.1 同 commit（`c76e2ab36d`）的后端配套 |
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
| `rush.json` | +51 | open-cloud-cad 项目注册 + reviewCategory（`224b47a213`） |
| `common/config/rush/common-versions.json` | +2 | `@types/react` 17→18 preferred version |
| `common/config/rush/repo-state.json` | +2 | rush update 产物 |
| **小计** | **247** | |

**d) core/backend 小修（1 文件，4 行）**

| 文件 | 变更行 | 说明 |
|------|--------|------|
| `core/backend/src/CheckpointManager.ts` | +4 | V2 Checkpoint 认证/自愈修复（`91b94097e1`） |
| **小计** | **4** | |

1.3 合计：6 + 3 + 4 + 1 = **14 文件**；1,317 + 1,239 + 247 + 4 = **2,807 行**。

---

## 2. 同步维护成本

每次 upstream 同步的已知坑清单见 `open-cloud-cad/docs/UPSTREAM_SYNC.md` §「冲突处理经验（2026-09 同步 5.9→5.14 时踩过的坑）」，共 6 条：

1. **lockfile 冲突**：`pnpm-lock.yaml` 不手工合并，取 master 版后 `rush update` 重新生成；
2. **`ensureConsistentVersions` 版本不一致**：occ 各包依赖版本对齐上游；
3. **dev 版包 peerDep 找不到**：workspace 内显式声明 `workspace:*`；
4. **接口新增方法**：上游给 `IpcAppFunctions` 等接口加方法时，本仓实现类须补实现——**这正是 §1.2 接口扩展的风险变现路径**；
5. **依赖小版本升级的类型收紧**：vitest/react-query/@types/react/iTwinUI 局部小修；
6. **git 邮箱策略**：本地操作 `--bypass-policy` 跳过。

**本周实例（坑 #4 的实况预演）**：上游合并后 `IpcAppFunctions` 新增 `cancelPushChangesRequest`（`core/common/src/IpcAppProps.ts:219`），导致本仓 `AppFunctionIpcHandler`（实现该接口）编译失败，由 `8feafd5efc` "Fix open-cloud-cad compile errors and update lockfile after master merge" 补 no-op 实现（`open-cloud-cad/apps/backend/src/ipc/AppFunctionIpcHandler.ts:300`）。此类破损与 §1.2 的共享接口扩展同属一个风险类：**只要 fork 持有上游共享接口的扩展或实现，上游每次接口演进都是一次强制跟进**。

---

## 3. 战略建议

将 §1.1 类（复活的 editor 工具，7,631 行）连同 §1.2 的接口扩展逐步**迁出上游 `editor/` 目录，收编至 open-cloud-cad 独立包**，使上游 editor 包回归零修改面，把同步税从"每轮合并持续冲突"降为"独立包自行演进"。

战略论证、量化指标（T7 同步税触发条件、Phase 0 结构债对冲）与路线对比**详见 platform-docs（`~/Documents/GitHub/platform-docs`）`KERNEL-STRATEGY.md` §4 成本行与 §6 触发条件**——本文件只记事实台账，一事一源，不重复战略推理。

---

## 4. 自动生成文件

以下文件由 rush/pnpm 自动生成，不属于手写代码修改：

| 文件 | 说明 |
|------|------|
| `common/config/rush/pnpm-lock.yaml` | rush update 自动生成（**已从本台账 20 文件统计中排除**） |
| `common/config/rush/repo-state.json` | rush update 自动生成（其变更计入上表 1.3c，非手写） |
| `common/config/rush/browser-approved-packages.json` | rush 自动维护（其变更计入上表 1.3c，非手写） |
| `pnpm-lock.yaml`（根目录） | rush update 自动生成；上游已删根 lockfile，本 fork 跟随删除 |
