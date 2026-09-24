# 鲁班CAD（LubanCAD）开发准则

**天工开物平台 AI 生成式 CAD 产品。** 跨仓战略见 platform-docs（天工开物文档总仓，仓外）。

## 铁律

1. **复用优先**：工具类功能继承 iTwin.js 标准基类（`ElementSetTool`/`PrimitiveTool`/`CopyElementsTool`…）；编辑走 `basicManipulationIpc`；事务走 `BriefcaseTxns`/`saveChanges`（可撤销硬约束）
2. **状态诚实**：能力声明带标记 ✅/🟠/⚪/❌，以 platform-docs/STATUS.md 为锚
3. **AI 工具注册规约**：Agent 复用现有 `toolId`，禁止第二套建模 API；破坏性操作走 HITL（预览→确认→提交）
4. **品牌**：产品名 鲁班CAD（LubanCAD）；生成物 = 真形（BRep）；约束 = 绳墨

## 功能状态

| 模块 | 路径 | 状态 |
|------|------|------|
| Auth | `features/auth/` | ✅ JWT 认证 |
| iTwin | `features/itwin/` | ✅ 项目管理 |
| iModel | `features/imodel/` | ✅ 模型管理 |
| Editor | `features/editor/` | ✅ 3D 编辑器 |
| Modeling | `features/modeling/` | 🟠 实体建模（PatternTools ID 收集 bug；PatternCommand 未注册） |
| Markup | `features/markup/` | ❌ 降级占位（@itwin/core-markup 模块解析问题，12 工具禁用） |
| Measurement | `features/measurement/` | ✅ 测量工具 |
| View Clip | `features/view-clip/` | ✅ 视图裁剪 |
| AccuDraw | `features/accudraw/` | ✅ 精确绘图 |
| Version Control | `features/version-control/` | 🟠 Changeset/Named Version 可用；冲突检测 🟠（mock 数据）、冲突解决 ⚪（no-op 标记） |
| **Pattern (阵列)** | `features/modeling/PatternTools.ts` | 🟠 线性/圆形阵列（ID 收集 bug） |

完整能力矩阵见 platform-docs/STATUS.md（状态标记：✅/🟠/⚪/❌）

## 阵列工具 (Pattern Tools)

基于 `CopyElementsTool` 扩展实现，支持参数化输入和即时执行。

### 实现要点
- 继承 `CopyElementsTool` 复用元素复制和事务管理
- 覆盖 `requireAcceptForSelectionSetOperation = false` 实现选择后立即执行
- 覆盖 `wantDynamics = false` 禁用跟随光标的动态效果
- 使用 `BriefcaseTxns.onCommitted` 事件通知推送按钮状态更新
- 工具执行完成后自动退出 (`exitTool()`)

## 快速开始

```bash
# 1. 启动基础设施（本地 iModel 管理平台及其 Postgres/Azurite/Redis，仓外项目，见其自带编排）
# 2. 安装依赖并构建（首次或改动 itwinjs-core 后先跑 rush build --to …，见根 CLAUDE.md）
cd luban-cad && pnpm install
cd apps/web && pnpm dev          # 前端 :3000

# 3. 后台服务（仓库根部的独立 pnpm 项目）
cd modeling-server && pnpm dev   # :4001
cd webhook-agent && pnpm dev     # :4002
```

访问 http://localhost:3000

## 核心服务

- **modeling-server (4001)**：图形建模后台——打开模型文件、执行编辑建模命令、供渲染数据（Express + WebSocket RPC/IPC + Briefcase 管理）
- **webhook-agent (4002)**：Webhook 验签接收与转发、baseline 生成、CloudSqlite 上传

## 开发准则（强制）

### 1. 复用优先原则（最高优先级）

**所有功能开发必须先在 itwinjs-core 中查找是否已有实现或相关接口。**

- **工具类功能**：优先继承 `ElementSetTool`、`PrimitiveTool`、`CopyElementsTool` 等基类，而非从头实现
- **编辑操作**：使用 `basicManipulationIpc` 提供的标准 IPC 接口
- **几何计算**：使用 `@itwin/core-geometry` 提供的 `Transform`, `Matrix3d`, `Placement` 等类
- **事务管理**：使用 `BriefcaseConnection.saveChanges()` 和 `onCommitted` 事件
- **工具设置**：使用 `@itwin/appui-abstract` 的 `DialogProperty` 和 `supplyToolSettingsProperties()`
- **Undo/Redo**：使用 iTwin.js 内置的 `UndoTool`/`RedoTool`，监听 `BriefcaseTxns` 事件

**禁止事项**：
- 禁止在已有标准 API 的情况下自定义实现类似功能
- 禁止绕过 iTwin.js 工具生命周期自行管理工具状态
- 禁止使用自定义事件替代 iTwin.js 标准事件（如 `onCommitted`）

### 2. 修改 itwinjs-core
- 必须审查、最小修改、完整记录在 `docs/ITWINJS_CORE_MODIFICATIONS.md`（仓库根 docs/）
- 修改前必须确认无法通过扩展或配置实现目标

### 3. 功能不足时的流程
- 在 itwinjs-core 中搜索相关 API 和实现
- 查阅 `docs/iTwin.js-Tools-Complete-Reference.md`（仓库根 docs/）
- 分析现有功能是否可通过参数或继承满足需求
- 确认无法复用后，提出分析 → 讨论方案 → 评估影响 → 文档化 → 实施验证

### 4. 代码规范
- 组件: PascalCase, Hooks: camelCase, 类型: PascalCase
- 工具类必须继承标准基类，遵循其生命周期
- 工具 ID 必须唯一，使用 `public static override toolId = 'ToolName'`
- 必须实现 `requireWriteableTarget()` 当工具需要写入权限

### 5. 工具开发检查清单
- [ ] 是否搜索了 itwinjs-core 中的类似工具？
- [ ] 是否继承了合适的工具基类？
- [ ] 是否使用了标准 IPC 接口？
- [ ] 是否正确处理了事务保存？
- [ ] 是否遵循了工具生命周期（onInstall/onPostInstall/onCleanup）？
- [ ] 是否正确设置了工具属性（requireAcceptForSelectionSetOperation, wantDynamics 等）？

### 6. AI 工具注册规约（AI+CAD 平台）
- Agent 工具必须复用现有 `toolId`（registerTools.ts 已注册项），禁止新建第二套建模 API
- Agent 操作与人工操作同权，必须走 BriefcaseTxns/saveChanges 事务管道（可撤销）
- 破坏性操作必须提供 HITL 确认流（预览→确认→提交）
- 架构详见 platform-docs/AI-ARCHITECTURE.md

## 文档

| 文档 | 说明 |
|------|------|
| [README.md](./README.md) | 项目介绍 |
| [docs/Architecture.md](../docs/Architecture.md) | 系统架构 |
| [docs/ROADMAP.md](../docs/ROADMAP.md) | 演进路线 |
| [docs/ITWINJS_CORE_MODIFICATIONS.md](../docs/ITWINJS_CORE_MODIFICATIONS.md) | 上游修改记录 |
| platform-docs/STATUS.md（仓外文档总仓） | 全平台能力矩阵 |

## 调试

```bash
# 查看日志（start-all.sh 启动时）
tail -f /tmp/luban-cad/*.log
```

*最后更新: 2026-09-24*
