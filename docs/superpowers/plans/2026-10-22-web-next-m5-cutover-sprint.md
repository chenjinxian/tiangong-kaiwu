# web-next M5（P0 修复批 + 切换门禁冲刺）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 清偿 M4 终审 P0/P1 条件（undo/redo 与 op 呈现链修复、连接失败 UX、access-control 权限判定），跑通 spec §6 全部切换门禁（七页 e2e/四象限走查/视觉对照/全链路冒烟/性能门禁/探针制度化），最后执行切换：web-next 接管 :5300/:5301 并删除 `apps/web`。

**Architecture:** 前端修复全部落在 M4 已建模块内（useFeatureSystem/useFeatureDisplaySync/FeatureDialog/Session 组合层），不动 viewer-next 契约；权限判定走官方 `@itwin/access-control-client`（npm 集成铁律，M4 拍板登记的 M5 主题）；切换冲刺是运维动作序列（构建/容器/文档/删除），每步有核对单。

**Tech Stack:** 既有栈不变（React 18 + iTwinUI + react-query + zustand + Vitest + Playwright）；新增 npm 依赖仅 `@itwin/access-control-client`。

**Spec:** `docs/superpowers/specs/2026-10-21-web-next-onshape-parity-design.md`（§0 铁律/§6 测试与迁移门禁/§7 里程碑）。M4 终审输入 = `.superpowers/sdd/2026-10-22-web-next-m4-part-studio-connection/final-review.md` §五（P0 七项=收口条件 C1，编入本计划 T1/T2/T4 首位，不可延后）。

**范围沿革（如实注记）：** spec §7 的 M5 原定义「settings + 能力引导 + 切换门禁冲刺」——settings 页与能力引导对话框已由 M2/M3 提前交付；本计划 M5 = M4 终审 P0/P1 清偿 + 切换门禁冲刺（终审裁定口径）。

**移植源（只读参考，勿改）：** `luban-cad/apps/web/features/imodel/hooks/useIModelPermission.ts`（权限判定）；`.superpowers/sdd/2026-10-22-web-next-m4-part-studio-connection/shots/`（12 步冒烟脚本+三类探针 .mjs 资产，M4 交付）；`.superpowers/sdd/2026-10-22-web-next-m4-part-studio-connection/task-9-report.md`（冒烟基线 6/12 与 D-T9 六缺陷）。

## Global Constraints

- 全部沿用 M0-M4 地基：别名、ESLint 分层、barrel 纪律、令牌纪律、`<type>(web-next): <中文摘要>` + Co-Authored-By 提交纪律
- **P0 首位铁律（M4 收口条件 C1）**：T1/T2 是 M4 final-review.md §五 P0 清单的 web-next 侧全量落地；D-T9-1/D-T9-2 的私有仓动作不在本仓（T4 只做复测门）
- **建模管道硬约束**：undo/redo 订阅面必须显式含 `txns.onAfterUndoRedo`（反转事务不发 onCommitted——M4 终审实证）；**勿走 scope 退出路线**（官方 maybeProcess 在常驻 editingScope 下结构性 early-return）
- 外部依赖门（T4）：私有仓 pushChanges/applyFeatureOp 修复 + 产物重发 + C3 link 路径更新，全部用户侧动作；未就绪时 T4 如实登记 BLOCKED（不阻塞 T5-T8 并行推进的 JSdom/视觉/性能门禁）
- **草图诚实边界**：spec §6 全链路冒烟含「草图」步——M4 裁定真实草图绘制链延后，T4 复测的草图步以「UI 变身 PASS + 真实绘制未接线」如实标注（不弱化不假装）
- 删除 `apps/web` 是**不可逆动作**：T9 内该步执行前必须获用户现场确认（SDD 控制器职责），门禁核对单全绿才允许走到那一步
- TDD：先写失败测试再实现；每步跑目标测试+全量+lint+tsc

---

### Task 1: P0 呈现链修复批（undo/redo 订阅 + Escape + 纪元守卫 + 超时兜底）

**Files:**
- Modify: `luban-cad/apps/web-next/src/modules/part-studio/hooks/useFeatureSystem.ts`（D-T9-6：增订 `txns.onAfterUndoRedo`→refresh；T5-①：refresh 纪元守卫；超时兜底：applyOp/getFeatureTree 特征级超时）
- Modify: `luban-cad/apps/web-next/src/modules/part-studio/hooks/useFeatureDisplaySync.ts`（D-T9-4 层2：增订 undo/redo 触发同款三步失效）
- Modify: `luban-cad/apps/web-next/src/modules/part-studio/dialogs/FeatureDialog.tsx`（D-T9-5：document keydown Escape→onCancel）
- Modify: `luban-cad/apps/web-next/src/modules/part-studio/PartStudioPage.tsx`（applyOp 超时错误呈现接线，若错误面经宿主）
- Test: 更新 `test/useFeatureSystem.test.ts`、`test/useFeatureDisplaySync.test.ts`、`test/FeatureDialog.test.tsx`

**Interfaces:**
- Consumes: M4 既有——`useFeatureSystem`（refresh/applyOp/租约）、`useFeatureDisplaySync` 三步失效体、`useUndoRedo.ts:69,76` 的 `querySeqRef` 纪元模式（照抄）
- Produces: undo/redo 后树与画布同步刷新（S6/S6b 呈现链解封的前端半）；FeatureDialog Escape 可关（P2 探针 6/6 前提）；RPC 悬挂不再永久 busy（超时→可见错误行）

- [ ] **Step 1: 失败测试**（用例清单，全部钉行为）：

```ts
// useFeatureSystem.test.ts 追加：
// 1) D-T9-6：onAfterUndoRedo.raise() → getFeatureTree 重查（对照 onCommitted 同款断言）
// 2) T5-①：慢响应纪元守卫——首个 getFeatureTree 悬挂，refresh 触发第二次先返回「新树」，
//    放行首响应 → setTree 仍为新树（旧响应被纪元丢弃），loading 终态 false
// 3) 超时兜底：applyFeatureOp 永悬挂 + fake timers 过 FEATURE_OP_TIMEOUT_MS(15_000) →
//    applyOp reject（错误消息含「超时」i18n 键或 message 约定串）、UI 错误面可达
// useFeatureDisplaySync.test.ts 追加：
// 4) D-T9-4层2：onAfterUndoRedo.raise() → 三步失效同款调用（guid 写回/dispose/refreshForModifiedModels）
// FeatureDialog.test.tsx 追加：
// 5) D-T9-5：对话框开着派发 document keydown Escape → onCancel 被调（对齐 CanvasContextMenu 挂载期一次注册）
```

- [ ] **Step 2: 实现**

```ts
// useFeatureSystem.ts 纪元守卫（照抄 useUndoRedo.ts:69,76 模式）：
//   const refreshSeqRef = useRef(0);
//   const refresh = useCallback(async () => {
//     const seq = ++refreshSeqRef.current;
//     ... const entries = await getFeatureTree(connectionKey);
//     if (seq !== refreshSeqRef.current) return;   // 晚到响应丢弃
//     setTree(entries); ...
//   }, [connectionKey]);
// onAfterUndoRedo 订阅（对齐官方 BriefcaseConnection.ts:124-128 双订口径）：
//   connection.txns.onAfterUndoRedo.addListener(() => { void refresh(); })
// 超时兜底（新常量 FEATURE_OP_TIMEOUT_MS = 15_000，参照旧 RESOLVE_*_TIMEOUT_MS 口径）：
//   Promise.race([invoke, timeoutReject]) —— getFeatureTree 与 applyFeatureOp 均套；
//   超时 reject 的错误经 i18n 错误面呈现（复用既有 error 通道）
// useFeatureDisplaySync.ts：onAfterUndoRedo.addListener 触发与 onModelGeometryChanged 相同的
//   三步失效体（抽公共函数或并列注册，实现者按代码形态裁量并报告）
// FeatureDialog.tsx：useEffect 挂载期 document keydown 一次注册（Escape→onCancel），
//   对齐 CanvasContextMenu.tsx:226-234 模式；IModelApp Escape 工具语义共存已由 P1 波次放行传播
```

- [ ] **Step 3: 全绿 + Commit**

```bash
git commit -m "fix(web-next): P0 呈现链修复——undo/redo 订阅补齐+Escape+纪元守卫+超时兜底"
```

---

### Task 2: 连接失败 UX 批（isLoading/error 消费 + 对话框直卸载兜底）

**Files:**
- Modify: `luban-cad/apps/web-next/src/modules/part-studio/PartStudioPage.tsx`（T2-②：briefcase.isLoading/error 消费——状态栏/画布占位呈现连接相位，连接失败不再是「已连接+黑屏」）
- Modify: `luban-cad/apps/web-next/src/modules/part-studio/components/PartStudioCanvas.tsx` 或状态栏组件（连接相位呈现位，按现有结构裁量）
- Modify: `luban-cad/apps/web-next/src/modules/part-studio/PartStudioPage.tsx`（T7-②：PushChangesetDialog 独立于 connection 条件渲染或卸载兜底 toast）
- Modify: `luban-cad/apps/web-next/src/common/i18n/locales/{zh-CN,en}/part-studio.json` + `test/i18n.test.ts` 对账
- Test: 更新 `test/PartStudioPage.test.tsx`

**Interfaces:**
- Consumes: M4-T2 落的 `useBriefcaseConnection` result `{ connection, isLoading, error }`（此前未消费）
- Produces: 连接三态（下载中/失败/就绪）在编辑器页可见；断连时推送对话框不再无声消失

- [ ] **Step 1: 失败测试**（①connection=error 态→页面呈现错误面+重试路径（重开=切页签/重进，诚实呈现无假重试钮）②isLoading→状态栏「正在打开文档…」③断连+推送对话框开→对话框收合且 toast 说明（notifications 通道））
- [ ] **Step 2: 实现**（六态完备；错误面含 error.message 透传；i18n 双语）
- [ ] **Step 3: 全绿 + Commit**

```bash
git commit -m "fix(web-next): 连接失败 UX——briefcase 相位消费+推送对话框断连兜底"
```

---

### Task 3: access-control 权限判定

**Files:**
- Create: `luban-cad/apps/web-next/src/clients/access-control/AccessControlClient.ts`（封装官方 `@itwin/access-control-client`；baseUrl hub :5400 同源代理姿态同 ItwinsClient）
- Create: `luban-cad/apps/web-next/src/clients/access-control/index.ts`
- Create: `luban-cad/apps/web-next/src/modules/part-studio/hooks/usePermissions.ts`（移植旧 `apps/web/features/imodel/hooks/useIModelPermission.ts` 语义：→`{ mode: 'editable' | 'readonly', isLoading }`）
- Modify: `luban-cad/apps/web-next/src/modules/part-studio/PartStudioPage.tsx`（`readonly = viewOnly || permissions.mode === 'readonly'` 单点合流；权限加载中不早开 briefcase——旧应用竞态教训照搬：等权限再开连接）
- Modify: `luban-cad/apps/web-next/vite.config.ts`（若 hub 代理前缀缺 `/access-control` 则补——对照 nginx default.conf.template 的九前缀清单）
- Modify: `luban-cad/apps/web-next/package.json` + lockfile（`@itwin/access-control-client` npm 依赖，corepack pnpm@10 install）
- Test: `test/AccessControlClient.test.ts`（SDK mock：调用形状/authorization 懒回调/错误映射 ApiClientError）、`test/usePermissions.test.ts`（role→mode 映射/加载门）

**Interfaces:**
- Consumes: `AuthSession.getValidAccessToken()`（M1 既有，Bearer 前缀已修）；hub access-control API（官方 SDK）
- Produces: `usePermissions({ iTwinId, iModelId }): { mode, isLoading }`；briefcase readonly 三源合流（viewOnly ∨ 权限只读）

- [ ] **Step 1: 失败测试**（Client：方法面按官方 SDK 所需最小集——iModel 级我的权限查询（照旧 hook 的调用面移植）；usePermissions：editable/readonly/加载中三态；PartStudioPage：权限未载不开连接（防旧竞态）+readonly 合流）
- [ ] **Step 2: 实现**（旧 useIModelPermission 语义忠实移植；SDK 官方客户端整包消费，勿手写 fetch）
- [ ] **Step 3: 全绿 + Commit**

```bash
git commit -m "feat(web-next): access-control 权限判定——官方客户端+briefcase readonly 合流"
```

---

### Task 4: 私有仓复测门（12 步冒烟复跑目标 12/12 + D-T9-3 闭环）

> **外部依赖门**：前置=用户侧完成 ①C3 link 路径更新（modeling-server 源码+dist-out）②D-T9-1 pushChanges/pullChanges 照搬官方 IpcHost 实现 ③D-T9-2 插桩定位修复 ④新产物 Release + `scripts/fetch-backend.ps1` 拉取。前置未就绪→本任务如实 BLOCKED 登记（不假跑）。

**Files:**
- 证据产物（git-ignored）：`.superpowers/sdd/2026-10-22-web-next-m5-cutover-sprint/shots/`（复用 M4 shots/ 探针脚本拷贝改造）
- Modify: `luban-cad/apps/web-next/src/modules/part-studio/test/part-studio-structure.test.tsx`（若 T1/T2/T3 改动锚点面则演进）

**Interfaces:**
- Consumes: M4-T9 冒烟脚本与三类探针（shots/ 资产）；T1 修复后的前端链
- Produces: 12 步冒烟 12/12 PASS 机读证据 + D-T9-3 闭环判定（特征段出现「拉伸 1」；不成立则按 M4 终审口径立「载荷差异对照」案）+ 草图步诚实标注（UI 变身 PASS，真实绘制未接线）

- [ ] **Step 1: 前置核对**（verify-stack 14/14；MS :5401 health；`dist-backend/ipc/AppFunctionIpcHandler.js` grep pushChanges 不再 throw——仍在 throw 即 BLOCKED 报告）
- [ ] **Step 2: 复跑全链**（M4-T9 同法：会话注入/按名引用/逐步截图+机读 JSON；**按 spec §6 链扩展为 14 步**——M4 12 步 + 「API 建新文档→建新 iModel→进编辑器」前置两步（走 ImodelsClient/ItwinsClient 真实创建，验证 M2 写通道在门禁态可用）；S5 拉伸→S6 撤销→S7 推送→S8 版本历史期望全通；草图步如实标注）
- [ ] **Step 3: 三类探针复测**（下拉 8/8、Escape 6 目标、toast 可见性）
- [ ] **Step 4: Commit**（仅测试文件若有演进）

```bash
git commit -m "test(web-next): M4 P0 修复复测——12 步冒烟与探针证据"
```

---

### Task 5: e2e 套件（七页 + 键盘流）

**Files:**
- Create: `luban-cad/apps/web-next/playwright.config.ts`（独立 config：baseURL :5310、workers=1、retries 0、projects chromium）
- Create: `luban-cad/apps/web-next/e2e/auth.setup.ts`（API 取 token + addInitScript 注入 sessionStorage——M3-T8 手法，MS 限流 100/15min）
- Create: `luban-cad/apps/web-next/e2e/{login,register,documents,document-details,part-studio,settings}.spec.ts`（七页覆盖：登录/注册/找回合并 auth spec；按页核心路径断言——筛选/创建/打开/编辑器五区/设置开关）
- Create: `luban-cad/apps/web-next/e2e/keyboard.spec.ts`（纯键盘：登录→建文档→开 iModel→进编辑器，全程无 mouse）
- Modify: `luban-cad/apps/web-next/package.json`（`test:e2e` script + @playwright/test devDep 借 apps/web 版本）
- Test: 即本任务产物（e2e spec）

**Interfaces:**
- Consumes: M3-T8/M4-T9 的会话注入与选择器经验（数据 testid 优先，M4 结构断言的锚点命名）
- Produces: `pnpm test:e2e` 一键全绿（切换门禁第 1 条）

- [ ] **Step 1: config+setup 先行**（跑通一条冒烟 spec：登录→documents 可见列表）
- [ ] **Step 2: 七页 spec 逐页落**（每页：核心交互 3-6 断言； honest 边界——装配/工程图 gated 项点开引导对话框即 PASS）
- [ ] **Step 3: 键盘流 spec**（tab/enter 全程；编辑器内 ribbon 工具激活+Escape 分层）
- [ ] **Step 4: 全绿 + Commit**

```bash
git commit -m "test(web-next): 七页 e2e+键盘流套件（独立 config :5310）"
```

---

### Task 6: 四象限走查 + 视觉对照钉版

**Files:**
- Create: `luban-cad/apps/web-next/e2e/visual.spec.ts`（关键状态 `toHaveScreenshot` 钉版 @1440×900：登录/documents/详情/编辑器五区/设置）
- 证据产物（git-ignored）：`.superpowers/sdd/2026-10-22-web-next-m5-cutover-sprint/quadrant/`（zh/en × 亮/暗 走查截图+walkthrough.md 差异登记）

**Interfaces:**
- Consumes: onshape-audit 38 图（对照基准）；M3 visual-diff.md 的差异判定口径（对齐/偏差-可接受/偏差-待修）
- Produces: 切换门禁第 2/3 条证据——四象限零破版 + 截图对照零未登记差异

- [ ] **Step 1: 钉版截图基线**（首跑 `--update-snapshots` 建基线，逐张与 os-* 并排人工比对，差异登记 walkthrough.md）
- [ ] **Step 2: 四象限走查**（语言×主题四组合跑关键页，布局/文案/令牌三面核对）
- [ ] **Step 3: Commit**

```bash
git commit -m "test(web-next): 四象限走查+视觉钉版基线"
```

---

### Task 7: 性能门禁

**Files:**
- Create: `luban-cad/apps/web-next/e2e/perf.spec.ts`（①Documents 百行滚动：注入 100 行种子数据→CDP `Tracing`/rAF 帧间隔采样→滚动帧率 ≥55fps 判 PASS（60 目标 55 底线）②编辑器首帧：`page.goto`→视口 canvas 在场计时 <5s）
- 证据产物（git-ignored）：`.superpowers/sdd/2026-10-22-web-next-m5-cutover-sprint/perf.md`（两门禁实测数字）

**Interfaces:**
- Produces: 切换门禁第 5 条证据（Documents 百行滚动 60fps、编辑器首帧 <5s）

- [ ] **Step 1: 实现两探针**（帧率采样用 rAF 时间戳序列的 p95 帧间隔换算；首帧计时用 performance.now 锚点）
- [ ] **Step 2: 实测+登记**（数字如实；不达标则优化或如实登记 BLOCKED 与瓶颈分析——不调阈值凑绿）
- [ ] **Step 3: Commit**

```bash
git commit -m "test(web-next): 性能门禁探针——滚动帧率+编辑器首帧"
```

---

### Task 8: 探针清单制度化 + 仓务小件

**Files:**
- Create: `docs/web-next-realstack-probes.md`（「发布前真实栈探针标准动作」：下拉 8/Escape 6 目标/toast/树刷新/undo 呈现/像素 diff 六组，每组脚本路径+复现命令+PASS 判据——收编 M3/M4 shots/ 散落 .mjs 为清单化资产）
- Modify: `.gitignore`（根 `shots/` 目录忽略——M4 终审 P2 指出的未覆盖缺口）
- 处置：`docs/native-typings-drift-2026-10-22.md`（确认为 rush hook 自检副产物后删除或移档，报告里给判定依据）；`docker-compose.override.yml.disabled`（问询用户后处置——若用户记得其用途则保留，控制器代拟问句）

**Interfaces:**
- Produces: 切换门禁的探针制度面 + 仓务干净

- [ ] **Step 1: 清单文档落**（六组探针逐组：来源 .mjs 路径/复现命令/PASS 判据/上次结果）
- [ ] **Step 2: 仓务三件**（.gitignore/typing-drift 判定/override 问询）
- [ ] **Step 3: Commit**

```bash
git commit -m "docs(web-next): 真实栈探针标准动作清单+仓务清理"
```

---

### Task 9: 切换冲刺（web-next 接管 :5300/:5301 + 删 apps/web）

> **不可逆步骤警告**：本任务 Step 5（删除 apps/web）执行前控制器必须获用户现场确认；门禁核对单（Step 4）任一红即停。

**Files:**
- Create: `luban-cad/apps/web-next/Dockerfile`（生产构建：node 构建段→nginx/静态服务段；**publicPath 铁律：vite `base:'/'` 与静态根一致**——publicpath-worker-404 教训：`Unexpected token '<'`=HTML 当 JS，容器形态必须与 publicPath 匹配）
- Modify: `docker-compose.yml`（web 服务镜像/构建切换到 web-next；nginx :5301 上游不变——单域名入口 / 下九前缀代理不变）
- Modify: `docs/PORTS.md`（:5300 归属 web-next 登记）
- Modify: 根 `CLAUDE.md` + `luban-cad/CLAUDE.md`（运行章节 apps/web→apps/web-next；:5300 dev 端口 5310→web-next；功能状态表 Editor 行指向 web-next 模块）
- Delete: `luban-cad/apps/web/`（**整目录**——含旧 e2e/demo-flow；删除后 luban-cad workspace pnpm install 校验）
- Modify: `luban-cad/pnpm-workspace.yaml`（apps/* glob 自动覆盖，确认无显式 web 条目）

**Interfaces:**
- Consumes: T4-T8 全部门禁证据
- Produces: 切换门禁第 6 条——web-next 接管 :5300/:5301，apps/web 删除，文档同步

- [ ] **Step 1: 生产构建链**（web-next Dockerfile + 本地构建跑通；容器内冒烟：登录→documents→编辑器 canvas 在场——production 形态首验，重点盯 worker/静态资源 404）
- [ ] **Step 2: compose 切换+verify-stack**（栈内 :5300 服务改为 web-next 产物；verify-stack 14/14 须含 dev-build 横幅等既有断言全部通过）
- [ ] **Step 3: 文档三处同步**（PORTS.md/根 CLAUDE.md/luban-cad CLAUDE.md）
- [ ] **Step 4: 门禁核对单**（逐条打勾：七页 e2e ✅/四象限 ✅/视觉对照零未登记差异 ✅/全链路冒烟 ✅/性能 ✅/探针清单 ✅——任一缺失即停，报告差异）
- [ ] **Step 5: 删除 apps/web**（**用户现场确认后**：git rm -r luban-cad/apps/web → pnpm install → 全 workspace build/test 绿）
- [ ] **Step 6: Commit**

```bash
git commit -m "feat(web-next): 切换冲刺——web-next 接管 :5300/:5301，apps/web 退役"
```

---

## M5 完成定义（DoD）

1. P0 七项全清：T1 前端呈现链四件+超时兜底、T4 私有仓复测门 12/12（D-T9-3 闭环或立载荷对照案）
2. 连接失败 UX 三态可见（T2）
3. access-control 权限判定接线（briefcase readonly 三源合流）
4. spec §6 切换门禁逐条过：七页 e2e 全绿 / 四象限走查过 / 截图对照零未登记差异 / 真实后端全链路冒烟 / Documents 百行 60fps + 首帧 <5s / 探针清单制度化
5. 切换完成：web-next 接管 :5300/:5301（栈内 verify-stack 全过）、PORTS.md 与两级 CLAUDE.md 同步、apps/web 删除（用户确认后）
6. 全量 vitest + lint + tsc 绿（web-next/viewer-next/editor 三包）

**外部依赖（非本仓任务）**：私有仓 pushChanges/applyFeatureOp 修复+产物重发+C3 link 路径（T4 前置，用户侧）；草图真实绘制链仍为 backlog（全链路冒烟如实标注）。
