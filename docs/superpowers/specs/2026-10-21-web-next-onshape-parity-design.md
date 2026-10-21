# web-next：luban-cad 前端全面重写设计（Onshape 1:1 对标）

- 日期：2026-10-21
- 状态：已评审（六节设计 + 四条修正，用户逐节确认）
- 证据基线：`.superpowers/sdd/2026-10-15-rw4-frontend-ia/onshape-audit/`（38 截图 + 15 aria 快照 + 4 DOM + 工具条 title 清单），总清单 `UI-INVENTORY.md`
- 本设计取代：RW4 波次式渐进对齐路线（该路线终止；其未提交改动在实施前回退/收编）

## 0. 目标与铁律

把鲁班 CAD 前端从零重建为 `apps/web-next`，界面质感、人机交互、信息架构对齐 Onshape 实测采集，逐页可对照验收。

**铁律（用户拍板，不妥协项）：**
1. **完整 UI 面**：UI 表面 = Onshape 100%。所有菜单/菜单项/对话框形态照常渲染，不灰化、不删减、不占位丑化。后端暂无能力的项（能力门 `gated`）照常可点，打开与整体质感一致的能力引导对话框（对齐 Onshape 免费版升级提示模式）。能力门是运行时数据，不是视觉残缺。
2. **品味不妥协**：§4 交互与动效规范、六态完备、零布局跳动为硬门禁；六态缺一即验收不通过。
3. **命名规范遵循 itwinjs-core**（文件名=主导出物等，见 §1），不得自创。
4. **itwinjs-core 一律 link: 源码消费**（vendored fork），不用其 npm 官方运行时包；其余官方数据客户端按 npm 依赖集成，不重复造轮子。
5. 复用优先纪律延续：建模工具继承 iTwin.js 标准基类、编辑走 basicManipulationIpc、事务走 BriefcaseTxns（web-next 不引入第二套建模 API）。

**已定决策记录：**

| 决策点 | 结论 |
|---|---|
| 重写边界 | 真·从零起新应用；官方数据客户端整包集成；itwinjs-core link: 源码 |
| 落点 | 新建并行包 `apps/web-next`，建成后整体切换，验收后删除 `apps/web` |
| 查看器 | `@itwin/core-frontend` 源码直挂（LocalhostIpcHost），不用 `@itwin/viewer-react` |
| v1 范围 | 七页全建：登录/注册/找回 + Documents + 文档详情 + Part Studio 编辑器 + 设置 |
| 验收 | 每页截图对照采集证据 + 新 e2e 全绿；全过才删旧 |

## 1. 目录结构与命名规范（遵循 itwinjs-core 实测规范）

core 规范实测：文件名=主导出物（名义类型 PascalCase 同名如 `BriefcaseConnection.ts`；纯函数模块 camelCase 如 `common.ts`）；类型文件带 `Types` 后缀（`BriefcaseTypes.ts`）；数据访问叫 `*Client`；目录小写 kebab、角色词（`internal/`、`test/`、`tools/`）；测试进 `test/` 子目录、文件名=被测物`.test.ts`；包入口=再导出文件（`core-frontend.ts`）。

```
apps/web-next/
├── vite.config.ts / tsconfig.json / playwright.config.ts / .env.development
└── src/
    ├── app/                # 组合根：App.tsx、providers/、error-boundaries/
    ├── config/             # env.ts、routes.ts、themes.ts
    ├── clients/            # 数据访问层（core 惯例 *Client）
    │   ├── itwins/         #   ItwinsClient.ts（封装 @itwin/itwins-client）
    │   ├── imodels/        #   ImodelsClient.ts（封装 @itwin/imodels-client-authoring）
    │   ├── access-control/ #   AccessControlClient.ts
    │   ├── storage/        #   StorageClient.ts（封装 @itwin/object-storage）
    │   └── auth/           #   AuthSession.ts、LubanAuthorizationClient.ts（自有 JWT）
    ├── common/             # 共享内核（core/common 同义）：i18n/、utils/、跨模块类型
    ├── components/         # 通用 UI 件：AppHeader.tsx、PageEmptyState.tsx…
    ├── modules/            # 产品领域模块（自治；跨模块只准走 index.ts）
    │   ├── authentication/ #   登录/注册/找回
    │   ├── documents/      #   文档中心
    │   ├── document-details/
    │   ├── part-studio/    #   内分 canvas/ ribbon/ tree/ tabs/ dock/ dialogs/
    │   ├── viewer/         #   视口生命周期编排（消费 packages/viewer-next）
    │   └── settings/
    │   └──（模块内 = components/ dialogs/ hooks/ internal/ test/ + XxxTypes.ts + index.ts）
    ├── routes/             # 路由入口薄组件（SignInRoute.tsx…）+ routes.ts
    └── styles/tokens/      # onshape-skin 令牌 → 覆写 iTwinUI CSS 变量

packages/viewer-next/       # 视口包：link: 消费 vendored itwinjs-core
└── src/{host, connection, viewport, tools, test}/
```

**四条规则（全部源自 core，无自创）：**
1. 文件名=主导出物：组件/类/类型 PascalCase 同名（`DocumentTable.tsx`）；纯函数（hooks/utils）camelCase（`useDocumentFilters.ts`）
2. 类型文件 `XxxTypes.ts`；数据封装 `XxxClient.ts`；目录小写 kebab、角色词
3. 测试进模块 `test/` 子目录，`被测物.test.tsx`
4. `internal/` 放非公开实现；跨模块引用只准 `modules/x/index.ts`（ESLint no-restricted-imports 强制）

**领域名词映射**：API 层跟随官方客户端用 `ITwin/iModel`；UI 层统一映射为 `Document`（类型 `DocumentSummary`，映射只发生在 `*.mapper.ts`；变量避用裸 `document` 防 DOM 全局冲突）。

**导入别名**：`@app/@config/@clients/@common/@components/@modules/@routes/@styles`（tsconfig paths + vite alias 同步），根除深相对路径。

## 2. 数据层与官方客户端集成

**npm 依赖（不重复造轮子）：**

| 官方仓 | npm 包 | 承担 |
|---|---|---|
| itwins-client | `@itwin/itwins-client` | 文档 CRUD/收藏/缩略图 |
| imodels-clients | `@itwin/imodels-client-authoring` | iModel CRUD + baseline 上传 |
| access-control-client | `@itwin/access-control-client` | 成员/角色/权限 |
| object-storage | `@itwin/object-storage` | Azure blob 直传/直下 |
| webhooks-api-samples | （无包） | webhook 契约参考（验证签在后端 webhook-agent） |
| viewer | ❌ | 为 Bentley 云设计；按铁律 4 用 link: 源码 |

官方 client `baseUrl` 指向本地 hub :5400（SDK 原生支持 apiUrl 覆盖）。

**认证**：后端为自有 JWT（非 Bentley IMS OIDC），auth-clients 的 OAuth 流不适用、不硬套。自建 `LubanAuthorizationClient`（实现 core-common `AuthorizationClient` 接口）向官方 client 请求管道注入 Bearer。401 → 单飞刷新 → 原请求重放（逻辑自旧应用移植）。

裁决（2026-10-21，终审 I7）：会话保持**单键持久化 sessionStorage**（access+refresh 同键 `luban-next-auth`，TTL 15min + refresh 续期），与旧应用姿态持平；不采用「access token 仅内存、refresh 持久化」。理由：同域存储 threat model 下，access token 单独内存化并不缩小 XSS 攻击面（脚本仍可经内存化模块/请求管道取到 token），却牺牲页面刷新后的会话延续体验——收益为零、体验有损，故维持单键持久化。

**数据流（单向）**：`组件 → hooks(react-query) → clients/* → 官方 SDK → hub`。
- queryKeys 工厂按域分层（`documentsKeys.itwin(id).image`）
- 封装函数纯化（注入 client 实例）可单测
- 统一 `ApiClientError`（状态码/业务码/i18n key）；QueryCache 全局 401 走刷新、5xx toast、业务错误就地呈现
- 乐观更新仅限收藏 toggle（拒收即回滚）
- 跟手感保障：hover 预取文档详情；staleTime 列表 5min / 图片 30min

## 3. 状态管理与数据流

状态五分法（每类状态唯一归属地）：

| 类别 | 归属 | 例 |
|---|---|---|
| 服务端态 | react-query（唯一真相，禁拷贝进 store） | 列表/网格/成员/changesets |
| URL 态 | search params | 筛选 `?filter=owned`、视图模式（可分享可回退，对齐 Onshape） |
| 持久偏好 | localStorage（类型化 `lib/storage.ts`） | 主题/语言/视图/停靠布局 |
| 编辑器会话态 | zustand 小 store | 树选中/展开、停靠页签、当前工具、草图模式 |
| 运行时态 | viewer-next 内部 hooks（不进全局） | 连接/编辑作用域/租约 |

store 铁律：一 store 一职责；selector 订阅；服务端数据副本=设计错误；store 文件=主导出 hook；跨模块通信走 query 失效 + store action，不建事件总线。重渲染纪律：selector 粒度优先，memo 只加实测热点。

## 4. 皮肤令牌、交互与动效规范

**令牌层 `styles/tokens/onshape-skin.css`**：仅覆写 iTwinUI CSS 变量为 Onshape 实测值——页面底 `#f5f6f7` 级中性灰；面板纯白+1px 浅边框、无重阴影；accent = Onshape 蓝（os-01 取色；品牌识别留给 logo/产品名）；32px 控件带、13px 字阶、紧凑密度；2px 微圆角；暗色主题双套（对齐 Onshape 深色 beta）。组件禁裸色值/魔法间距（stylelint + token guard 测试强制）。

**交互与动效规范（硬门禁）：**

| 维度 | 规范 |
|---|---|
| 动效 | 120–200ms ease-out；仅 transform/opacity；菜单 100ms；克制无花哨 |
| 微交互 | hover=底色轻染；激活=2px accent 下划线；按下无 scale |
| 键盘优先 | 每工具快捷键（tooltip 随显）；`alt+/` 命令搜索；Esc 分层（取消工具>关菜单>关对话框）；Shift+? 快捷键表 |
| Tooltip | 300ms 延迟、快捷键随显 |
| 加载 | 骨架屏按终局布局占位，零布局跳动，永不白屏 |
| 空态 | 插画+主行动按钮（对齐「开始使用 Onshape」质感） |
| 表格 | sticky 表头、行 hover 显操作、方向键行导航、等宽数字 |
| 滚动条 | 定制细滚动条全局统一 |
| 响应式 | 1280–2560 无破版；停靠收合+溢出菜单兜底 |
| 六态完备 | hover/focus-visible/active/disabled/empty/loading/error 缺一即验收不通过 |

## 5. 编辑器壳与查看器

**packages/viewer-next**（link: vendored itwinjs-core）：`host/`（LocalhostIpcHost 移植 + RPC 注册）、`connection/`（BriefcaseConnection/Txns/写租约）、`viewport/`（useViewport/ViewCube/标准视图/显示样式）、`tools/`（工具注册修复版 + KeyboardManager 移植）、`test/`（mock IPC 初始化单测）。初始化序列自旧 viewer-core 移植（已验证链路），接口按新架构重写。

**part-studio 模块**：

```
components/  PartStudioLayout.tsx、DocumentMenuBar.tsx
ribbon/      Ribbon.tsx + ribbon-registry.ts（27 工具+8 飞菜单，全量在册）+ RibbonDropdown.tsx
tree/        FeatureTree.tsx（双段）、TreeRow.tsx（错误红显/抑制斜体）、TreeFilter.tsx（语法筛选）
canvas/      CanvasContextMenu.tsx（选中态/空白态）、ViewCubeWrapper.tsx
tabs/        TabBar.tsx、TabManagerDialog.tsx
dock/        EditorDock.tsx
dialogs/     FeatureDialog.tsx（✓/✗ 顶置+布尔作用域+折叠段+芯片选择+fast-pick）、SketchDialog.tsx
hooks/       usePartStudio.ts、useFeatureTree.ts、useCanvasSelection.ts
internal/    菜单构建纯函数、能力映射
test/        注册表完整性、菜单枚举、reducer
```

**上下文敏感交互模型（Onshape 人机体验核心）：**
1. 选择驱动 UI：画布选择集变化 → ribbon 组重排/高亮、右键菜单按拾取类型（part/face/edge/feature）重构
2. 非模态特征对话框：打开期间画布可持续拾取、视图可旋转缩放
3. 草图模式全 UI 变身：ribbon 切换、栅格/约束覆盖层、树红显活动草图（对齐 os-30）
4. 性能纪律：canvas 拾取走命令式 viewport 操作 + 批量 store 更新，禁止每 pick 全树 re-render

**能力注册表（完整 UI 面的落地机制）**：`capabilities.ts` 统一登记每工具/菜单项 `full | gated` + 引导文案 i18n key。gated 项照常可点 → 能力引导对话框（质感与全局一致）。初始 gated 集合：拔模、抽壳、外部螺纹、钣金系、框架系、曲面/曲线系、渲染、工程图、材料/外观、通知、打印、装配体编辑。翻转 gated→full = 数据变更 + 后端工作，UI 零改动。

**HITL**：删除特征/零件 = 预览高亮 + 确认框。

## 6. 测试与迁移门禁

| 层 | 工具 | 范围 |
|---|---|---|
| 纯函数 | Vitest | 注册表/菜单构建/mapper/reducer/令牌守卫——逻辑全必修 |
| 组件 | Vitest + jsdom | 六态完备、i18n key、a11y role |
| e2e | Playwright（独立 config，:5310） | 复用 session 注入登录、E2E Seed 每轮重置、workers=1；按页 spec + 四象限走查（zh/en×亮/暗） |
| 视觉回归 | Playwright `toHaveScreenshot` | 关键状态钉版 @1440×900 |
| 键盘流 e2e | Playwright | 纯键盘：建文档→开编辑器 |

**切换门禁（全过才删旧）**：七页 e2e 全绿；四象限走查过；截图对照零未登记差异；真实后端全链路冒烟（登录→建文档→建 iModel→开编辑器→草图→拉伸→撤销→保存→版本历史）；Documents 百行滚动 60fps、编辑器首帧 <5s；切换后删 `apps/web`，web-next 接管 :5300/:5301，PORTS.md 与两级 CLAUDE.md 同步。

## 7. 里程碑（实施计划由 writing-plans 展开）

1. **M0 地基**：workspace 增包、别名/ESLint boundaries、令牌层（全部实测值从采集截图钉版，含 accent 蓝）、app/providers/routes 骨架、viewer-next 初始化移植 + 冒烟
2. **M1 authentication**：登录/注册/找回 + 会话层（截图对照 pub-01/02）
3. **M2 documents + document-details**：中心页全元素 + 详情页（对照 os-01~08/40/44/48）
4. **M3 part-studio 壳**：布局/顶栏/ribbon/双段树/页签（对照 os-11/15/17/20×8/23/24/26/33）
5. **M4 part-studio 交互**：上下文菜单/非模态对话框/草图模式/选择驱动 UI（对照 os-12/26/30/31）
6. **M5 settings + 能力引导 + 切换门禁冲刺**

## 8. 风险与开放问题

- 官方 client 与 hub 的 API 方言差异（分页/字段命名）需在 M2 首个集成点实测校准；差异处封在 clients/* 单文件内，不外溢
- `@itwin/object-storage` 与 hub 预签名 URL 的兼容性需 M0 spike 验证；不可行则该 client 退化为薄封装
- 旧应用未提交改动（RW4 UI 走查波次 + 中断的 P2-A 半截编辑）在 M0 前统一回退/收编，保持基线干净
- 装配/工程图页不做（后端无能力），但相关菜单项按完整 UI 面原则在册（gated）
