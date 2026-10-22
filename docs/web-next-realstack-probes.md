# web-next 真实栈探针标准动作（发布前必跑）

- 建立日期：2026-10-23（M5-T8，承接 M4 终审 §五 P2「真实栈探针清单制度化」）
- 适用面：`luban-cad/apps/web-next`（web-next 重写线，:5310）；切换/发布门禁的标准动作清单
- 资产定位：探针脚本**原地保留**在 `.superpowers/sdd/<战役>/shots/`（git-ignored，跨 workspace 只读引用，不搬移）；本文是它们的清单化索引——散落 .mjs 从「一次性脚本」升格为「可复跑资产」。`.superpowers/` 属 git-ignored 证据区，**本文所引脚本不随仓分发**；复跑须在同机证据区在场的前提下进行，缺现场时按本文「脚本要点」重建。

## 头注：「jsdom 绿 ≠ 真实可用」

M4 实测学费：结构测试 19 绿 vs 真实栈冒烟 6 缺陷（Escape 全 app 死效、notifications 哑通道、undo/redo 呈现断链、pushChanges 未实现等全部在 jsdom 全绿下漏网——jsdom 无真实 keydown 传播链、无 core-frontend 真单例、无 MS briefcase/IPC）。**三层测试（jsdom 单测 / e2e 七页 / 真实栈探针）中只有本文六组探针直接消费真实栈（hub :5400 + MS :5401 + 真浏览器）**。

- **发布前必跑**：web-next 切换/发布门禁每轮必过本文六组；六组全 PASS（或失败项全部有在案缺陷登记且非本波次引入）方为绿。
- **诚实纪律**：探针断即登记断点与证据，不弱化断言凑绿（M4-T9 铁律）；性能门禁不达标如实红，不调阈值（perf.md 纪律）。

---

## §0 标准前置（每组探针共用的起栈四步）

```bash
# 1) 栈：9 容器（postgres/azurite/redis/maildev + imodelhub:5400 + webhook-agent:5402 + web + nginx + bff）
docker compose up -d
# 2) MS 宿主 :5401（产物模式）
powershell -File scripts/start-ms-host.ps1 -Detach
# 3) 全栈验收（health×5 → 数据链 → WS cookie 握手 → dev-build 横幅）——14/14 方可继续
powershell -File scripts/verify-stack.ps1
# 4) web-next dev :5310（探针全部打 :5310；建议新起——长会话 dev server 有整页空白前科，见 §7）
cd luban-cad/apps/web-next && corepack pnpm@10 dev
```

### 会话注入（两通道）

探针不经 UI 表单登录（省限流额度 + 稳定）：

| 通道 | 用法 | 会话缓存 |
|---|---|---|
| e2e 套件内 | `helpers.loginWithSession(page)`——消费 `auth.setup.ts` API 取 token 产物 | `apps/web-next/playwright/.auth/session.json` |
| 裸探针（.mjs） | `p1fix-session-helper.mjs` 的 `getSession()`——独立缓存，**不与套件共用**（防 refresh 旋转互毒，见 §7-③） | `.superpowers/sdd/2026-10-22-web-next-m4-part-studio-connection/shots/p1fix-session.json` |

裸探针驱动的公共形态（借 apps/web 的 @playwright/test 驱动）：

```js
const requireFromWeb = createRequire('D:/Github/tiangong-kaiwu/luban-cad/apps/web/package.json');
const { chromium } = requireFromWeb('@playwright/test');
// … getSession() → page.addInitScript 注入 sessionStorage 'luban-next-auth' → page.goto(:5310/documents/<itwinId>/<imodelId>)
```

### auth 限流预算（T5 评审 I-1 运营约束，切换期高频复跑必读）

hub 实测限流（IP+email 双桶）：**注册 3/h、登录 5/15min**（forgot 3/h；/auth/refresh 不限流）。

- e2e 全套件每轮消耗 = **1 注册**（auth.spec）+ **2 登录**（login.spec 表单一轮 + 注册后转登录）+ 视缓存状态 ≤1 次 setup API 登录（缓存 /auth/me 200 复用 → refresh 续命 → 真实登录仅末级）。
- **>2 轮/15min 须等窗**，否则注册/登录 429 → auth.spec/login.spec「非缺陷假红」，与真实缺陷红同场极易误读。裸探针走 `p1fix-session-helper` 缓存（过期才重登 1 次）。
- hub 全局限流桶另有 `THROTTLER_SHORT_LIMIT/LONG_LIMIT`（官方缺省 200/min、2000/h）：本地 e2e 建议 600/6000（根 .env + compose 透传；未调参时 MS wsAuth 每条 WS 连接打 /auth/me 会提前打满桶 → 编辑器 WS 拒绝，见 `.env.example` 注）。内网/生产**勿放大**。

---

## §1 下拉可点 8/8（ribbon 下拉 portal 逃逸回归守卫）

| 项 | 内容 |
|---|---|
| 脚本 | `​.superpowers/sdd/2026-10-21-web-next-m3-part-studio/shots/c2-dropdown-probe.mjs`（4 断言 P1-P4：展开不被 ribbon 裁剪/键盘导航/子项真激活/画布右键钳制）；8 下拉逐一全量版在 `.superpowers/sdd/2026-10-22-web-next-m4-part-studio-connection/shots/t9-smoke.mjs` P1 段 |
| 复现 | `node c2-dropdown-probe.mjs`（M3 版，产物 `c2-dropdown-probe.json` + `c2-*.png`）；全量版跑 `node t9-smoke.mjs`（见 §5，P1 段） |
| PASS 判据 | 8 个下拉（thicken/RoundEdges/DraftFaces/LinearPattern/transform/frame/sheetMetalStart/surfaceCurve）逐一：▾ 点击 → `[role="menu"]` 在场 → 首菜单项中心 `elementFromPoint` 命中菜单项自身（portal 后无 overflow 裁剪、无遮挡）→ Escape 收合计数归 0。M3 版加验：菜单 rect 完全在 ribbon 容器下方且视口内 / ArrowDown 逐项下移+Escape 还焦点 / gated 子项点击弹能力引导对话框 / 画布右键菜单右下角钳制在视口内 |
| 最近结果 | **2026-10-23 PASS**——M5-T8 验证轮实跑 c2 探针 P1-P4 全 PASS、console 零错误（id 回填 5045fe31… 后，复现命令真实可执行实证）；2026-10-22 M4-T9 冒烟 P1 段 8/8（`t9-smoke-log.json` steps[P1]）；M3 c2 探针 P1-P4 全 PASS（`c2-dropdown-probe.json`） |

## §2 Escape/键盘 dismissal（6 目标）

| 项 | 内容 |
|---|---|
| 目标清单 | ①特征树右键菜单 ②画布右键菜单 ③TabManagerDialog（页签管理器）④CapabilityDialog（gated 工具引导）⑤工作区单位对话框 ⑥FeatureDialog（非模态面板收合） |
| 脚本 | 快速复测版 `.superpowers/sdd/2026-10-22-web-next-m4-part-studio-connection/shots/p1fix-escape-probe.mjs`（①②③，树菜单两轮）；6 目标全量版 `t9-smoke.mjs` P2 段；缺陷发现史 `review8-escape-probe{,2,3}.mjs`（2026-10-22 review-8 的取证序列，留档不复跑） |
| 复现 | `node p1fix-escape-probe.mjs`（exit 0=全收合）；全量版跑 `node t9-smoke.mjs`（P2 段） |
| PASS 判据 | 每目标：开 → `Escape` ×1 → 对应 menu/dialog 计数 0（`waitForTimeout(400)` 落定后取数）；树菜单两轮连续通过（防首关后复开不关）；FeatureDialog 走 `aria-modal=false` 非模态面板同样 Escape 可收 |
| 缺陷背景 | review-8 I-1（P1）：`viewer-next/src/tools/keyboard-shortcuts.ts` window 捕获段 `preventDefault+stopPropagation` 把 Escape 在抵达一切冒泡段 dismissal 处理器前杀死（全 app 死效）+ iTwinUI Dialog 缺省不夺焦（TabManagerDialog 焦点不在对话框内则 onKeyDown 永不可达）。修复=p1-fix 波（去拦断 + `setFocus` 三对话框）；jsdom 对照用例 4 条先红后绿在库 |
| 最近结果 | **2026-10-22 PASS**——p1fix-escape-probe 修复复测 `{"treeMenuEscape":0,"treeMenuEscapeRound2":0,"canvasMenuEscape":0,"tabManagerDialogEscape":0}`；6 目标全量版（t9 P2 段）修复前最后一轮 FAIL=缺陷现场实证，修复后整段归入 §5 冒烟复跑 |

## §3 toast 可见性（notifications 呈现桥）

| 项 | 内容 |
|---|---|
| 脚本 | `.superpowers/sdd/2026-10-22-web-next-m4-part-studio-connection/shots/p1fix-notifications-probe.mjs`（I-2 修复复测）；真实调用点捕获版 `t9-smoke.mjs` P3 段（S5/S7 真实 outputMessage 优先，合成直发兜底且如实标注「合成源」） |
| 复现 | `node p1fix-notifications-probe.mjs`（产物 `p1fix-notifications-log.json` + `p1fix-notifications-toast.png`） |
| PASS 判据 | ①注入面：运行中 `IModelApp.notifications.constructor.name === 'ToasterNotificationManager'`（缺省是 core 哑通道 `NotificationManager`——outputMessage 空实现，一切消息不可见）；②呈现面：经 `IModelApp.notifications.outputMessage(new NotifyMessageDetails(Error/Warning, …))` 发消息 → `[class*="toast"]` 落 DOM（negative/warning 类别齐）→ 截图。业务链路（工具激活失败/推送结果）由 §5 冒烟 S5/S7 捕获真实 toast 兜证 |
| 缺陷背景 | review-8 I-2（P1）：core-frontend `NotificationManager.outputMessage` 空实现且无子类注册——registrationFailed、FeatureDialog/PushChangesetDialog 消息、工具错误面全部静默。修复=viewer-next `StartViewerOptions.notifications` 官方注入点透传 + app 层 `ViewerNotifications.tsx` 四件套（ToasterNotificationManager/单例/Bridge/priority→toast 类别映射） |
| 最近结果 | **2026-10-22 PASS**——managerName=ToasterNotificationManager；Error→negative + Warning→warning 双 toast 落 DOM（`p1fix-notifications-log.json`） |

## §4 树刷新 / undo 呈现（特征链可视化闭环）

| 项 | 内容 |
|---|---|
| 脚本 | `t9-smoke.mjs` S5/S6/S6b 段（拉伸提交→树新条目→toast→对话框收合→画布像素 diff；Ctrl+Z→树条目消失→画布还原；Ctrl+Y→几何复现） |
| 复现 | `node t9-smoke.mjs`（§5 全量跑，含本组） |
| PASS 判据 | S5：提交后 `[data-testid^="tree-row-"]` 新条目（120s 预算，op RPC→MS 求值→落库→onCommitted→refresh 全链）+ FeatureDialog 收合 + 画布像素 diff >0.005（原相机不可见则适应内容取景后复测）；S6：Ctrl+Z 后树条目清零 + 画布与拉伸后截图 diff 显著；S6b：Ctrl+Y 画布几何复现。像素取证用 pngjs 主色占比/异色比 + 双图 diff（`[data-testid="part-studio-viewport"]` 元素截图） |
| 缺陷背景 | M4-T9 登记：D-T9-2（op 在 MS 侧悬挂——私有仓主责）/D-T9-4 层2（undo 后画布不失效）/D-T9-6（undo 后树不刷新）。后两者已在 M5-T1 修复（commit c9da2b29e0：`onAfterUndoRedo` 双订 refresh + `useFeatureDisplaySync` dispose+refresh 全量失效 + 纪元守卫 + applyOp 超时兜底），jsdom 先红后绿实证；**真实栈复验归 T4 解锁后的冒烟复跑** |
| 最近结果 | **2026-10-22 FAIL（如实）**——M4-T9 冒烟 S5/S6/S6b 红，根因全部定案（D-T9-2 悬挂 + 两呈现缺口）；呈现缺口 M5-T1 已修但未真栈复验（T4 BLOCKED：外部门产物未就绪）。本组是当前**唯一带未闭合缺陷的探针组**，发布门前随 T4 复测收口 |

## §5 12 步冒烟（全链标准动作）

| 项 | 内容 |
|---|---|
| 脚本 | `.superpowers/sdd/2026-10-22-web-next-m4-part-studio-connection/shots/t9-smoke.mjs`——12 步：S1 登录注入→文档中心真实列表 / S2 开 E2E Seed→编辑器（UI 路径，断则直连 URL 并如实登记）/ S3 连接就绪+canvas 在场+像素基线 / S4 工具真激活（aria-pressed + console 零「未启动」双证）/ S5 拉伸闭环 / S6 撤销 / S6b 重做 / S7 保存推送 / S8 版本历史 / P1 下拉 8/8 / P2 Escape 6 目标 / P3 toast。机读产物 `t9-smoke-log.json`（steps+全量 console+网络 4xx/5xx）+ 逐步截图；前置种子重置 `t9-reset-seed.mjs`（E2E Seed 按名删旧建新 + baseline initialized 轮询）；M3 前身 `​.superpowers/sdd/2026-10-21-web-next-m3-part-studio/shots/smoke.mjs`（9 步壳期基线，历史留档） |
| 复现 | `node t9-reset-seed.mjs`（如需干净种子）→ 回填脚本头部 `IMODEL_ID` 为当前 id → `node t9-smoke.mjs` |
| PASS 判据 | **12/12**；失败步断即登记（`t9-smoke-log.json` summary.fail），不弱化断言、不跳过。S7/S8 依赖私有仓 pushChanges 产物（D-T9-1 未解封时按级联阻断如实登记） |
| **id 回填注意** | 脚本头部 `IMODEL_ID` 是冻结快照——**E2E Seed 每轮重建换 id**（测试项目 `c4013745-…` 按名稳定；iModel id 会变：2026-10-22 曾历经 `b3c62460…`→`dd6272d7…`→`5045fe31…`）。复跑前经 hub API 取当前 id：`GET /itwins?class=Project` 找「测试项目」→ `GET /imodels?iTwinId=<id>` 找「E2E Seed」 |
| 最近结果 | **2026-10-22 6/12**（红：S5/S6/S6b/S7/S8/P2）——根因全定案：D-T9-1（pushChanges 产物未实现）/D-T9-2（op 悬挂）/D-T9-4+6（呈现缺口，M5-T1 已修）/P2=当时在册 Escape 缺陷（p1-fix 已修）。M4 终审裁定：S1-S4 全通 + 浮层探针 8/8 + toast 通道 ✅，未竟项全在特征系统↔产物侧末公里；**复跑门=T4 解锁（hub 修复 + MS 新产物）后目标 12/12** |

## §6 性能门禁（切换门禁第 5 条）

| 项 | 内容 |
|---|---|
| 脚本 | `luban-cad/apps/web-next/e2e/perf.spec.ts`（**常驻 Playwright spec**，非 .mjs）——①编辑器首帧 <5s（goto→「已连接」+canvas 在场 ≡ waitEditorReady 双锚；rAF in-page 采样；锚点=canvas 挂载/建帧完成，**非 tile 几何首帧**；三跑取中位）②Documents 百行滚动帧率（API 自建 100 行 perf-seed-* → rAF 采样 → p95 帧间隔） |
| 复现 | `cd luban-cad/apps/web-next && corepack pnpm@10 exec playwright test e2e/perf.spec.ts`。**门禁轮纪律（T7）**：新起 dev server（吃真冷载+防长会话劣化）+ 整文件执行（编辑器用例在文件内先跑=冷值纪律进结构）+ fresh browser context 每跑 |
| PASS 判据 | ①首帧中位 <5000ms（硬门）；②滚动 p95 ≤18.2ms（≈55fps 底线；60fps 目标 p95≈16.7ms）。**零阈值调整**——不达标如实红，登记 perf.md 判定与瓶颈分析 |
| 证据链纪律（T7 评审 C-1/I-1） | 证据落 `<仓根>/.superpowers/sdd/2026-10-22-web-next-m5-cutover-sprint/perf-samples/run-<UTC 时间戳>/`——**每轮独立子目录永不覆盖**（固定文件名曾被全套件回归重跑静默覆盖门禁轮证据=v1 证据链断裂根因）；`PERF_EVIDENCE_DIR` 可整体改指向；路径锚 `import.meta.url` 非 cwd。**隔离复跑防自污染**：全套件回归会连带重跑本探针，门禁轮证据必须来自独立轮（新起 dev server + 单独跑本文件），不得引用回归轮数据充当门禁证据 |
| 最近结果 | **2026-10-22 双 PASS**（T7 v2 门禁轮，run-2026-10-22T19-41-54-981Z）：滚动 p95 **16.8ms**（366 样本，≥18.2ms ×0 零掉帧，锁死 60Hz vsync）；首帧中位 **3932ms**<5s（余量 21.4%；冷 2224/热 3932·4171——T8 评审 M-1 订正：三跑原值以门禁轮 `perf-samples/run-…/editor-first-frame.json` 为准）。已知风险在案：D-T7-3 后续访惩罚 ~1.7-2s 机制未钉死，热中位带 3.6-4.7s 摆幅 ±12%——慢 CI 余量收窄，钉死后收紧协议不动阈值。登记全文 `​.superpowers/sdd/2026-10-22-web-next-m5-cutover-sprint/perf.md`（v2；v1 数字作废） |

---

## §7 已知坑与纪律（复跑前必读）

1. **id 冻结**：所有 .mjs 探针头部的 `ITWIN_ID/IMODEL_ID` 是当时现场快照；E2E Seed 每轮重建换 id（§5「id 回填注意」），stale id 的症状=编辑器「连接失败」永挂——先查 id 再查缺陷。
2. **写工具只读态**：test 用户当前恒只读（D-T5-1 hub 权限类型失配未解封；D-T6-4 同族）——§4/§5 的建模闭环步（S5-S8）在解封前**预期不可用**，红灯先对照缺陷台账再定性；hub `String()` 归一解封后两 e2e 红自愈、冒烟 S5-S8 随 T4 复测收口。
3. **裸探针 refresh 旋转互毒**（T5 实测自首）：hub refreshToken 旋转制下，绕过 helper 手写登录/刷新会把共享缓存的 refreshToken 打失效 → 后续全 401。裸探针一律走 `p1fix-session-helper`（独立缓存文件）；诊断优先走套件内临时 spec（用毕删除）。恢复法：删对应缓存产物重跑 setup/首登。
4. **dev server 长会话劣化**：vite dev 2.5h+ 数十页面加载后偶发整页空白（waitEditorReady reload 路径可自愈；重则重启 dev server）——门禁轮建议新起 dev server（§6 同纪律）。
5. **限流预算**：见 §0——**>2 轮/15min 须等窗**；429 假红与 D-T5-1 红同场时先看 `t9-smoke-log.json`/Playwright 报告里的 HTTP 4xx 面。
6. **证据留档**：探针产物（JSON/PNG）全落 `.superpowers/`（git-ignored 证据区）；登记性文档（perf.md/walkthrough.md/本文）只引用结论与路径，不搬运大产物入库。
