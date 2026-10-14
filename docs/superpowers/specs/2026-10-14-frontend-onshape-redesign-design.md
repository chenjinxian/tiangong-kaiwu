# 鲁班CAD 前端全面对标 Onshape 重构设计

- **日期**：2026-10-14
- **状态**：已确认动工（§1 范围契约经用户逐条确认）
- **范围**：`luban-cad/apps/web` 前端全部页面（认证三页 / Documents / DocumentDetail / Editor / Settings / 404）
- **基准**：Onshape 全部页面与功能使用需求
- **执行方案**：方案 A —— 设计系统先行 + 逐页原地迁移（六波），e2e 绿基线全程保持

## 0. 已确认决策（用户逐项裁定）

| # | 决策点 | 裁决 |
|---|---|---|
| D1 | 对标粒度 | **IA+交互全对标**：信息架构、布局、交互流按 Onshape 重写；视觉经 itwin-ui 落地；功能边界 = 后端真实支持 |
| D2 | 视觉品牌 | **iTwinUI v3 基座 + 品牌主色**：teal（`#00b894` 系）映射到 accent token；消灭大部分自定义 CSS |
| D3 | 国际化 | **中英双语一步到位**：`@itwin/core-i18n` 骨架，中文默认，英文同步维护，零硬编码文案 |
| D4 | 路由语义 | **全面改文档语义**：`/documents`、`/documents/:iTwinId`、`/documents/:iTwinId/:iModelId`；UI 文案「项目→文档」；旧 `/itwins` 系路由重定向兼容 |
| D5 | 执行策略 | **方案 A**：六波原地迁移，每波独立可交付，e2e 跟随更新保持绿 |

## 1. 现状基线（勘察结论摘要）

真实布局：`apps/web/{app, features×12, shared, src/pages×7, src/core, styles}`（`src/features`、`src/shared` 为空壳）。

- 页面规模：Login 270 / Register 510 / ForgotPassword 210 / Documents 512 / ITwinDetail 518 / Editor **900（God Component）** / Settings 388 行；CSS 35 文件共 **6,824 行**。
- itwin-ui 实际安装 **v3.22.0**，但只用基础件（Button/Input/Dialog…）；**高级件零使用**：`Header`、`Table`、`Tabs`、`Tree`、`SearchBox`、`DropdownMenu`、`InformationPanel`、`Stepper`、`Tag`、`Surface`、`Breadcrumbs`、`useToaster`——最大增量空间。
- 数据层无统一封装：错误包络两段读取 + 403 统一文案**只存在于** `shared/services/itwins/client.ts`；Settings 页裸 fetch 绕过 react-query。
- 存量债：ErrorBoundary 双份（`app/components` 无引用冗余）；PrivateRoute 误置 `features/editor/components/` 且 loading 用自绘 spinner；自研 Toast 三件套替代了 `useToaster`；`src/shared/components/ui/Tooltip.tsx` 死代码；`modules/{core,ui}` 无源码空壳目录；Editor statusbar/PrivateRoute 等处硬编码色值不走 token。
- 资产：e2e 14 spec ~1,713 行覆盖全部页面流；单测 49 个文件 ~11,789 行；`viewer-core` 有现成未接入组件（ViewCube 560 行、ViewSettingsPanel、SavedViewsPanel、SectionToolsPanel、ViewerToolbar 等）。

## 2. 后端能力事实（勘察确认，裁决依据）

imodelhub-services（NestJS，`D:\Github\imodelhub-services` 已全量修复）：

- **认证**：local + **Google OAuth**（`GOOGLE_CLIENT_ID/SECRET` 已配置于 .env）+ refresh + 密码重置（mailer）。
- **iTwins**：CRUD + favorites + recents + **GET `/itwins/:id/image`（文档图）**；列表项带 `role: owner/editor/viewer/none` →「与我共享」= role≠owner 可前端过滤。
- **access-control**：角色 CRUD / 用户成员 CRUD / 所有者 / 组 / 权限——**全量实现**，Share 对话框的最大能力洼地。
- **iModels**：CRUD + briefcases + changesets + named versions + locks + checkpoints + **GET `/imodels/:id/thumbnail`（缩略图）**。
- **无 API**：labels、public scope、presence、评论、邮箱验证端点；trash 仅实体有 `deletedAt` 列、无端点。

## 3. Onshape 全量基准矩阵（范围契约）

### 3.1 页面级

| Onshape 页面 | 裁决 |
|---|---|
| Sign in / Create account / Reset password | ✅ P1 重做：itwin-ui 分屏布局 + 字段校验 + Google SSO（环境探测式显示） |
| 邮箱验证流 | ⚪ 缺口登记（后端 mailer 存在但无验证端点） |
| Documents 主页 | ✅ P2 重做（见 3.2） |
| Import 文件导入 | ❌ 不做：真形 InterOp 未授权（ACIS 许可仅 Modeler+Polyhedra） |
| Document workspace | ✅ P4 重做（见 3.4） |
| Versions and history 面板 | ✅ P4：升级现有 VersionTimeline 为 Onshape 式面板（named versions + changesets） |
| Share 对话框 | ✅ P3 新建（access-control 全量实现） |
| Comments / 协作 presence | ❌ 缺口登记（无后端） |
| My account | 🟠 P5 子集：Profile ✅ / 改密 ✅ / 偏好（主题、单位、语言，前端持久化）✅；2FA、API keys、订阅 ❌ 缺口登记 |
| Public 文档广场 | ⚪ 缺口登记（list API 无 public scope） |
| Help 中心 | 🟠 快捷键速查表面板（Shift+?，前端自绘）；外链文档登记 |

### 3.2 Documents 页功能级

| Onshape 能力 | 裁决 |
|---|---|
| 侧栏筛选（我的/与我共享/最近/收藏） | ✅ 全做，「与我共享」以 role≠owner 过滤，替换现有假 shared |
| Create 新建文档 | ✅ CreateITwinDialog 重构为 itwin-ui 标准 Dialog |
| 搜索 | ✅ 前端 filter（官方 spec 亦无搜索 API） |
| 排序（名称/修改时间/创建时间/最近打开） | ✅ 前端排序 |
| 列表/网格视图切换 | ✅ itwin-ui `Table` + `Tile` 双视图 |
| 文档缩略图 | ✅ GET `/itwins/:id/image`，无图回退插画 |
| 行级右键菜单（打开/重命名/收藏/分享/删除） | ✅ DropdownMenu + 右键触发 |
| 右侧详情面板 | ✅ `InformationPanel` 式侧栏（缩略图/所有者/时间/描述） |
| Labels 标签 | ⚪ 缺口登记 |
| Trash 回收站 | ⚪ 缺口登记（v1 删除 = 危险确认对话框） |
| Teams/Companies 侧栏项 | ⚪ v2 候选，本期不做 |

### 3.3 DocumentDetail 页功能级

| 能力 | 裁决 |
|---|---|
| iModel 卡片 + 真实缩略图 | ✅ GET `/imodels/:id/thumbnail` |
| 新建模型工作流 | ✅ CreateIModelWorkflow（645 行 CSS 重型组件）itwin-ui 化，`Stepper` 编排 |
| 成员/权限管理 | ✅ Share 对话框：成员列表 / 邀请 / 角色下拉 / 移除 |
| 版本历史入口 | ✅ 入口按钮 → 版本面板 |

### 3.4 Editor 页功能级

| Onshape 能力 | 裁决 |
|---|---|
| 顶栏：文档名点击重命名 | ✅ PATCH `/itwins/:id` |
| 顶栏：版本药丸 + 下拉 | ✅ named versions；分支/合并 ❌ 缺口登记 |
| 顶栏：undo/redo | ✅ UndoRedoToolbar 移至顶栏（BriefcaseTxns 管道不动） |
| 顶栏：Share 按钮 | ✅ 复用 P3 Share 对话框 |
| 顶栏：协作头像 | ❌ 不做（无 presence） |
| 左栏：特征树（抑制/隐藏/右键菜单） | ✅ 重构（itwin-ui `Tabs`+`Tree`）；**rollback 条 ⚪ 不做**——与已裁决的线性链重排守卫语义冲突，登记 |
| 左栏：Parts 面板 | 🟠 Parts 列表接真实数据源（特征产出实体）；Assembly 维持占位 |
| 工具栏：上下文工具组 | ✅ CadToolbar（556 行+~20 手写 SVG）重构为 itwin-ui ButtonGroup + 官方 icons；草图模式上下文切换保留 |
| 右侧停靠工具对话框 | ✅ 替换绝对定位浮动 overlay 栈（Onshape 标志性交互） |
| ViewCube（视口右上） | ✅ 接入 viewer-core 现成 ViewCube（复用优先铁律） |
| 底部元素 tabs | 🟠 tab 条结构（当前模型为唯一 tab；多 tab=多 iModel 并行，架构不支持，状态诚实不多造） |
| 底部状态条 | ✅ token 化重构；单位跟随 Settings 偏好 |
| 视口右键菜单 | ✅ 视图操作菜单（缩放/视角/显示模式） |
| 键盘快捷键 + 速查表 | ✅ KeyboardManager 扩展注册表 + Shift+? 面板 |

## 4. 架构裁决（贯穿所有波次）

### 4.1 路由

```
/login  /register  /forgot-password          公开
/documents                                       文档中心（Onshape IA）
/documents/:iTwinId                              文档详情（iModel 列表 + Share 入口）
/documents/:iTwinId/:iModelId                    编辑器工作区
/settings                                        账户设置
旧路由 /itwins、/itwins/:id、/workspace/:iTwinId/:iModelId → 301 重定向兼容
```

### 4.2 设计 token

- iTwinUI v3 token 为唯一基座；品牌 teal 仅映射 accent（`--iui-color-accent-*` 层），不再维护自研 `--color-*` 平行体系。
- `styles/variables.css` 收敛为「品牌映射 + 少量语义扩展」；组件硬编码色值清零（Editor statusbar `#f90/#c00/#0c0`、PrivateRoute `#f5f5f5/#2196f3` 等）。
- 暗/亮双主题沿用现有 ThemeContext（双写 `data-theme`/`data-iui-theme`），全部经 token 呈现。

### 4.3 数据层

- 单一 `httpClient`（`shared/api/`）：错误包络两段读取（`{error:{code,message}}` 回落顶层 `message`）、401 自动刷新并重试一次（并发去重沿用现有实现）、403 统一文案；全部 services 与 Settings 裸 fetch 收编。
- react-query 沿用现有范式（`useITwinsQuery`/`useIModelsQuery` 为模板）；新能力（members/roles/versions）按同范式新增 hooks。
- WS 进度流（`useImodelProgressStream`）不动。

### 4.4 i18n

- `@itwin/core-i18n`（已是 link: 依赖）建骨架；namespace 按页面/域划分（`auth`/`documents`/`editor`/`settings`/`common`）。
- 中文 = 默认语言，英文同步维护；所有用户可见文案走 key；语言切换入口在 Settings 偏好（localStorage 持久化 + 探测 `navigator.language` 首启默认）。
- 错误文案映射（UserContext 现有 HTTP status→中文）迁入 i18n 并补英文。

### 4.5 组件策略

- itwin-ui 高级件全量上岗（Header/HeaderBreadcrumbs、Table、Tabs、Tree、SearchBox、DropdownMenu、InformationPanel、Stepper、Tag、Surface、useToaster）。
- 自研 Toast 三件套（`shared/components/ui/Toast*`）退役迁 `useToaster`；死代码 `src/shared/components/ui/Tooltip.tsx` 删除。
- CadToolbar ~20 个手写 SVG 图标替换为 `@itwin/itwinui-icons-react` 官方图标（无对应者保留自制但登记）。

### 4.6 编辑器外壳分解（Editor.tsx 900 行 → EditorShell）

```
EditorPage
├── EditorTopBar        logo / 文档名(点击重命名) / 版本药丸+下拉 / undo-redo / Share / ThemeToggle / Avatar
├── EditorToolBar       上下文工具组（itwin-ui ButtonGroup + 官方 icons；草图模式切换）
├── EditorSidePanel     左栏 Tabs：特征树(Tree) / Parts / 装配占位
├── EditorDockPanel     右侧停靠：工具对话框 / 版本历史 / 工具设置（替换 overlay 栈）
├── EditorViewport      裸 viewport + ViewCube + 视口右键菜单
├── EditorElementTabs   底部元素 tab 条（单模型=单 tab）
└── EditorStatusBar     token 化状态条（briefcase 同步/单位/坐标）
```

state 与副作用下沉到 `features/editor/hooks/` 现有 hooks（useEditTools/useFeatureSystem/useSelection 等保持契约不变）；iTwin 工具链、RPC、事务管道**零触碰**。

## 5. 波次计划

| 波次 | 范围 | 验收门 |
|---|---|---|
| **P0 基座** | httpClient 统一 + i18n 骨架（zh/en）+ token 映射 + useToaster 迁移 + `/documents` 路由骨架与旧路由重定向 + 债务清偿（ErrorBoundary 单例化、PrivateRoute 归位 app 层、死文件与 `modules/{core,ui}` 空壳删除、硬编码色值清零） | `pnpm lint/test` 绿；现有 e2e 全绿（含重定向兼容） |
| **P1 认证** | Login/Register/ForgotPassword 三页 itwin-ui 分屏重做 + Google SSO（env 探测）+ 404 页 + 认证页 i18n 全量 | login.spec.ts 更新绿；中英切换走查 |
| **P2 Documents** | 侧栏筛选（含真「与我共享」）+ SearchBox + 排序 + Table/Tile 双视图 + 真实缩略图 + 行级右键菜单 + 详情面板 + 创建对话框重构 | documents.spec.ts 更新绿；空态/加载/错误三态走查 |
| **P3 Detail+Share** | DocumentDetail 重构 + iModel 缩略图 + CreateIModelWorkflow 的 Stepper 化 + Share 对话框（members/roles hooks + 邀请/角色/移除） | e2e 新增 share 流；权限错误路径覆盖 |
| **P4 Editor** | EditorShell 分解（900 行 God Component 拆解）+ 顶栏（重命名/版本药丸/undo-redo/Share）+ 左栏 Tabs+Tree + 右侧停靠面板退役 overlay 栈 + ViewCube 接入 + 状态条 token 化 + 快捷键速查表 + 版本面板升级 | editor/features/sketch/modeling e2e 全绿；demo-flow 24 幕选择器同步更新 |
| **P5 Settings+收尾** | Settings 收编 httpClient+react-query + 偏好（主题/单位/语言）+ e2e/demo 全量更新 + 全站中英走查 + 视觉走查 | 14 spec 全绿 + demo-flow 全幕通过 |

**每波纪律**：单波单 PR；e2e 跟随本波更新并保持绿；demo-flow.mjs 选择器在 P4 同步更新；每波末清本波产生的临时兼容层。

## 6. 缺口登记（状态诚实，全部不做 mock）

| 缺口 | 原因 | 去向 |
|---|---|---|
| Import 文件导入 | ACIS InterOp 未授权（许可约束） | 真形自研 InterOp 立项后重启 |
| Trash 回收站 | 实体有 `deletedAt` 列，无端点 | imodelhub 后端立项 |
| Labels 标签 | 无 API | imodelhub 后端立项 |
| Public 文档广场 | list 无 public scope | imodelhub 后端立项 |
| Comments / presence / 协作光标 | 无后端 | 平台路线图 |
| 版本分支图 / merge | 无后端（named versions 线性） | 平台路线图 |
| rollback 条 | 与线性链重排守卫语义冲突 | 特征系统 v2 裁决 |
| 邮箱验证流 | 无验证端点 | imodelhub 后端立项 |
| 2FA / API keys / 订阅 | 无后端 | 商业化路线图 |
| Teams/Companies 侧栏 | access-control groups 存在但未接 | v2 候选 |

## 7. 测试与验收策略

- **e2e**：14 spec 逐波更新选择器与路由（`/itwins`→`/documents`）；P3 新增 share 流 spec；最终全绿为总验收门。
- **单测**：沿用 vitest 就近组织；新 hooks/组件补测；现有 49 文件保持绿。
- **demo-flow.mjs**：P4 同步更新 24 幕选择器；全幕通过为 Editor 验收组成。
- **视觉走查**：每波末截图对比（亮/暗 × zh/en 四象限）。
- **性能**：懒加载沿用；Documents 列表虚拟化阈值 100+ 项。

## 8. 风险与缓解

| 风险 | 缓解 |
|---|---|
| e2e 选择器大面积失效 | 路由重定向兼容 + 逐波更新 + 稳定 `data-testid` 约定（本设计新增） |
| i18n 全量抽取工作量大 | P0 建骨架后按波次页面内抽取，不一次全站扫 |
| 右侧停靠面板改造波及工具设置流 | ToolSettingsPanel 契约不变，仅承载容器变化；FeaturePanel 对话框迁移随 P4 单测护航 |
| Google SSO 本地环境缺 secret | 环境探测式渲染：未配置不显示按钮，零侵入 |
| 缩略图多数文档无图 | 统一回退插画（itwin-ui NonIdealState 风格），不留破图 |
