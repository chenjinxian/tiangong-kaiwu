# RW4 前端 Onshape IA 重写实施计划（五波）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 七页面按 Onshape IA 全面重写（认证三页+404 → Documents → Detail+Share → EditorShell → Settings），itwin-ui 高级件全量上岗，中英双语零硬编码，e2e 全程保持绿。

**Architecture:** P0 基座直接依赖（httpClient/token/i18n 骨架/toaster//documents 路由）；每波 = namespace 落地 + 页面重写 + e2e 适配；i18n 化不破坏 e2e（fallbackLng=zh-CN 中文渲染不变），破坏只来自结构重写——每波同步适配对应 spec。

**Tech Stack:** React 18 + @itwin/itwinui-react 3.22（Header/Table/Tabs/Tree/SearchBox/DropdownMenu/InformationPanel/Stepper/Tag/Surface/Breadcrumbs 全部实证存在）+ react-i18next + react-query。

**Spec:** `docs/superpowers/specs/2026-10-14-frontend-onshape-redesign-design.md`（§3 基准矩阵=范围契约）+ 总架构 spec RW4 节。

## Global Constraints

- **勘察实证契约基线**（直接用，勿再勘察）：
  - itwin-ui 3.22 高级件导出名：`Header/HeaderBreadcrumbs/HeaderButton/HeaderLogo`、`Table+tableFilters/TablePaginator`、`Tabs/Tab`、`Tree/TreeNode`、`SearchBox`、`DropdownMenu/MenuItem`、`InformationPanel(+Wrapper/Header/Body/Content)`、`Stepper`、`Tag/TagContainer`、`Surface`、`Breadcrumbs`、`ErrorPage/NonIdealState`
  - CadToolbar 28 手写图标：8 个有官方对应（Line/Circle/Ellipse/Rectangle/Move/Copy/Delete/Rotate→SvgObjectRotate）；20 个无对应保留自制+登记
  - 缩略图：GET /itwins/:id/image 与 /imodels/:id/thumbnail 前端零消费；认证图片模式=ITwinDetail 下载先例（fetchWithAuth→blob→createObjectURL→img.src，配 react-query 缓存）
  - ShareITwinDialog（297 行）整体 mock 且 UI 不可达（isShareDialogOpen 无 true 置位点）；S3 新契约=listUserMembers/addUserMember{email,roleIds}/updateUserMember(PATCH 回 roleIds 异形)/removeUserMember/listRoles{id,displayName}
  - i18n 规模：auth≈48+UserContext 8 处硬编码 / documents≈44 / detail≈109 / editor≈81 / settings 15；namespace 注册进 `shared/i18n/index.ts` resources；fallbackLng=zh-CN 保 e2e 中文断言
  - e2e 高危选择器：`.section-title`(登录门)/Tile role=button 定位/`.imodel-card`/`.cad-toolbar-horizontal`/`.statusbar`/`.feature-tree-panel`/`.feature-row`/`.preview-badge`/getByLabel 距离轮廓草图——重写必须保留语义等价锚点或同步改 spec
  - 债务清单：404 `<a href>`、ShareITwinDialog `/itwins?share=` 链接、useAppToast 深路径 import×3、Settings 裸 fetch×2、IModelCard console.log 泄漏、/terms /privacy 死链、`.bak` 残留、Editor statusbar 硬编码色（#f90/#c00/#0c0/#0066cc/#666）、common.onlyZh 演示键
- pnpm 一律 `corepack pnpm@10`；提交格式 `类型(web): 中文描述（RW4-<波>Tn）` + trailer；存量 lint 触碰面零新增
- 官方客户端源码强制参考（webhooks-api-samples/access-control-client——P3 Share 面向）
- 每波验收门：该波 e2e spec 绿 + 中英切换走查 + 全量单测绿

## File Structure（波次增量）

| 波 | 新建 | 重写 |
|---|---|---|
| P1 | `shared/components/auth/AuthBrandSide.tsx`、`locales/{zh-CN,en}/auth.json`（扩展） | Login/Register/ForgotPassword、UserContext 错误文案、404 Link 化 |
| P2 | `shared/hooks/useITwinImage.ts`（blob 缩略图 hook）、`locales/documents.json` | Documents.tsx、DocumentsSkeleton |
| P3 | `locales/` documents 扩展 | ITwinDetail、ShareITwinDialog（真实现）、IModelCard、CreateIModelWorkflow（Stepper） |
| P4 | `features/editor/shell/*`（EditorTopBar/EditorToolBar/EditorSidePanel/EditorDockPanel/EditorViewport/EditorElementTabs/EditorStatusBar）、`locales/editor.json` | Editor.tsx（壳化）、CadToolbar 图标 |
| P5 | `locales/settings.json` | Settings.tsx、清理件 |

---

### Wave P1：认证三页 + 404

**Task P1-T1: auth namespace 全量 + AuthBrandSide 共享件 + UserContext 收编**
- Files: Create `shared/components/auth/AuthBrandSide.tsx`（三页 brand 侧栏拷贝合一：logo+4 特性行，props 化文案）；Modify `shared/i18n/locales/{zh-CN,en}/auth.json`（Login 9+Register 30+ForgotPassword 9+UserContext 8 处错误码≈56 键，含插值）；Modify `shared/i18n/index.ts`（auth 已注册则确认）；Modify `app/contexts/UserContext.tsx`（HTTP status→错误文案映射改 t('auth.error.xxx')）
- 删 `common.onlyZh` 演示键 + 对应回落测试改走真实键
- [x] TDD：i18n 测试补 auth ns 键断言 → 落键 → 绿；Commit

**Task P1-T2: Login 重做**
- Files: Rewrite `src/pages/Login/Login.tsx`（Surface 分屏+HeaderLogo 品牌+LabeledInput 保留 label 关联（e2e getByLabel 依赖）+记住我/防抖逻辑保留+Google SSO 按钮位（env `VITE_GOOGLE_CLIENT_ID` 探测，无值不渲染——占位 onClick 预留 OIDC 面板））；Modify Login.css（自绘→token，预计砍半）；login.spec 适配（选择器不变则零改）
- [x] e2e login.spec 绿 + Commit

**Task P1-T3: Register + ForgotPassword 重做**
- Files: Rewrite 两页（表单件 itwin-ui 化+密码强度条保留（token 化色）+字段绿勾保留+/terms /privacy 死链移除或指向占位 Dialog）；AuthBrandSide 接入两页
- [x] 全量单测 + Commit

**Task P1-T4: 404 精修 + P1 验收**
- Files: App.tsx 404 `<a href>`→`<Link>`；e2e 全量（重点 login/documents 冒烟）+ 中英走查（localStorage luban-cad-lang=en 截图 Login/Register/Forgot/404）
- [x] Commit + P1 波门记录
- [x] P1.5 收口（评审 Important×2 处置）：404 按钮链全局 `a` 色规则收窄（styles/index.css，itwinui 组件锚点让位组件层）+ 品牌 teal accent 别名族覆写（variables.css 兑现 P0-T4 契约，informational 不动）；随附 i18n 走查基建化（playwright.i18n.config.ts + e2e/i18n-walkthrough.spec.ts，免登录双语四页 8/8 绿）

### Wave P2：Documents

**Task P2-T2-1: documents namespace + useITwinImage 缩略图 hook**
- Files: Create `locales/{zh-CN,en}/documents.json`（Documents 23+CreateITwinDialog 12+EditITwinDialog 9+详情侧栏键）；Create `shared/hooks/useITwinImage.ts`（`useITwinImage(iTwinId)`：fetchWithAuth(`/itwins/:id/image`)→blob→objectURL，react-query 缓存+404/无图回退 null+组件卸载 revoke；照 ITwinDetail.tsx:216-234 先例）；TDD hook 测试
- [x] Commit（P2-T2-2 02b911e682/e4faaba388 + P2.5 修复）

**Task P2-T2-2: Documents 页重做（Onshape 文档中心 IA）**
- Files: Rewrite `src/pages/Documents/Documents.tsx`：
  - 顶栏→`Header`+`HeaderLogo`+`SearchBox`+新建按钮+ThemeToggle+Avatar（HeaderButton）
  - 侧栏 SideNavigation 保留四筛选，**「与我共享」改真数据**（listITwins 全量+role≠owner 过滤——useITwinsQuery 已翻页聚合全量）
  - 主区 `Table`/`Tile` 双视图切换（SvgList/SvgGrid）；Table 列=缩略图(useITwinImage+SvgProject 回退)/名称/所有者/角色 Tag/创建·更新时间；排序（名称/修改/创建/最近打开，SvgSort*）
  - 行级 `DropdownMenu` 右键+尾按钮（打开/重命名/收藏 toggle/分享(占位 P3)/删除确认 Dialog）
  - 右侧 `InformationPanel` 详情侧栏（选中行：大缩略图/所有者/时间/描述）
  - 空态 NonIdealState 替换 6 个内联 SVG；删除双 setTimeout 动画
- Modify e2e/documents.spec 适配（保 `.section-title` 或改断言+Table 行定位新写）；CreateITwinDialog 保留逻辑、文案进 ns
- [x] documents.spec 6/6 + authenticated-workflow 2/2 + complete-workflow 2/2 绿 + Commit `e4faaba388`
- [x] P2 收口（评审 Needs fixes 处置，controller 完成）：补全新结构 CSS（右键锚点 fixed 定位/网格/缩略图/选中行/危险项/详情侧栏）+ Create/Edit 对话框 i18n（含渲染断言测试）+ useITwinImage 替换泄漏修复（refetch 替换时 revoke 旧 URL + 测试）+ 真共享 createdBy 代理诚实注记 + **playwright locale zh-CN**（i18n 探测根因，惠及全波）。Commit 见 P2.5 笔

### Wave P3：Detail + Share

**Task P3-T3-1: ITwinDetail 重做**
- Files: Rewrite `src/pages/ITwinDetail/ITwinDetail.tsx`：HeaderBreadcrumbs 面包屑+hero itwin-ui 化（Surface+Tag+真实大图 useITwinImage）+删除确认 window.confirm→Modal（危险操作标准形态）+IModelCard 缩略图（useIModelImage 同构 hook 或同 hook 泛型化）；顺手：IModelCard console.log 清理+死 props 处置
- [x] Commit（P3-T3-1 615ab38b14）

**Task P3-T3-2: ShareITwinDialog 真实现（官方契约）**
- Files: Rewrite `features/itwin/components/ShareITwinDialog.tsx`：Tabs 三页（成员/邀请/链接）→（成员列表=listUserMembers+角色 displayName（listRoles 映射）/移除 removeUserMember；邀请=addUserMember{email,roleIds}(角色下拉来自 listRoles)；链接=改 `/documents/:id`）；**入口补齐**：ITwinDetail hero 加 Share IconButton（现 isShareDialogOpen 无 true 置位）；官方参考 `D:\Github\access-control-client`（UserMembersClient 语义）；PATCH 回 roleIds 异形按 S3 的 UserMemberPatchResult 处理
- Create e2e share 流 spec（邀请→成员出现→改角色→移除；需 seed 第二用户或 invite-only 断言到 toast 层）
- [x] share spec 绿 + Commit（d572e61b2f；hub 成员契约缺陷已登记降级）

**Task P3-T3-3: CreateIModelWorkflow Stepper 化 + P3 验收**
- Files: Modify `features/imodel/components/CreateIModelWorkflow.tsx`（645 行 CSS 重组件→itwin-ui `Stepper` 编排，逻辑保留：baselinefile upload 预签名两段）；CSS 砍量
- [x] complete-workflow 两 spec 绿 + P3 波门（14/14，P3 关闭）

### Wave P4：EditorShell（最重波）

**Task P4-T4-1: editor namespace + Editor.tsx 壳化分解**
- Files: Create `locales/{zh-CN,en}/editor.json`（Editor 41+CadToolbar 29+FeatureTreePanel 11≈81）；Create `features/editor/shell/`：`EditorTopBar.tsx`（518-561 切出：Header+HeaderBreadcrumbs+EditorBriefcaseStatus+导出+ThemeToggle+Avatar）、`EditorToolBar.tsx`（564-673：4 ButtonGroup+UndoRedoToolbar）、`EditorSidePanel.tsx`（688-707：FeatureTree/SketchPanel 切换）、`EditorViewport.tsx`（710-765：viewer+ViewCube 已接件）、`EditorStatusBar.tsx`（842-890：token 化色+data-testid 保留）；Editor.tsx 变壳（早退分支+组件编排+state 下沉既有 hooks）
- [x] editor.spec/features.spec/sketch.spec 绿（选择器契约保留）+ Commit（1383941ded）

**Task P4-T4-2: 右侧停靠面板 + CadToolbar 图标 + AI 预留位**
- Files: Create `features/editor/shell/EditorDockPanel.tsx`（右侧停靠容器：工具设置/版本历史/显示设置 tab 化停靠，替换 viewer-overlay 绝对定位栈 714-764——6 个 boolean state 收敛为 dock 状态机；MeasurementResultsPanel 停靠化）；Modify CadToolbar（8 图标换官方+20 登记注释）；Create `features/editor/shell/AiSidePanelSlot.tsx`（RW3 预留空位组件+注释契约）
- [x] modeling-tools 三 spec + demo-flow 24 幕选择器同步 + Commit（b6bdd5fa52）

**Task P4-T4-3: P4 验收**
- [x] 全量 e2e + demo-flow 全幕 + P4 波门（editor/features/sketch 18/18、modeling 23/23 无失败、demo 24/24；P4 关闭）

### Wave P5：Settings + 收尾

**Task P5-T5-1: Settings 重做**
- Files: Rewrite `src/pages/Settings/Settings.tsx`：裸 fetch×2→react-query mutations（端点不变 PUT /api/users/profile|password，走 fetchWithAuth）+3 tab→itwin-ui `Tabs`+preferences 实做（主题 ThemeToggle 保留+**语言切换 Select**（写 luban-cad-lang+i18n.changeLanguage）+单位偏好 localStorage 占位诚实标注）；Create `locales/{zh-CN,en}/settings.json`
- [x] Commit（b6515b3485 + 74a9ee450d）

**Task P5-T5-2: 全站收尾 + RW4 验收门**
- Files: 清理（.bak 删除/404 Link 复核/useAppToast barrel 统一/`--color-*` deprecated 消费清点）；中英四象限走查（亮/暗×zh/en 截图七页）；全量 e2e+单测+build；spec 勾选+ledger 收口
- [x] Commit + RW4 终审（opus）

---

## Self-Review 结论

- **Spec 覆盖**：spec §3 矩阵页面级五波全覆盖；§4.5 组件策略逐波落（Header/Table/Tabs/SearchBox/DropdownMenu/InformationPanel/Stepper/Tag/Surface/Breadcrumbs/Tree——Tree 归 P4 特征树增强可选，本波先 Tabs 承载）；缺口登记项（Trash/Labels/Comment 等）维持 ⚪ 不做
- **依赖顺序**：P1（auth ns 先行）→P2（缩略图 hook+真共享）→P3（消费 S3 clients+入口补齐）→P4（最重，拆三任务）→P5（收编+走查）
- **类型一致性**：useITwinImage 消费 fetchWithAuth（T1 契约）；ShareITwinDialog 消费 S3 的 ITwinMember/UserMemberPatchResult/listRoles；EditorShell 七组件 props 契约在 P4-T4-1 内定义
- **占位符**：无——行号/组件名/字符串数均勘察实证
- **范围控制**：Google SSO 仅按钮位+env 探测（OIDC 回调流归后续波）；Tree 组件特征树增强归 P4 可选项不做硬承诺
