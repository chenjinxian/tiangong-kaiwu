# 天工开物(TiangongKaiwu)

**基于云服务的 AI+CAD 应用平台总目录** —— *天工开物,鲁班造物——真形为体,绳墨为度。*

> **Visibility: PUBLIC(开源)**
> 命名家族(2026-09-23 终版):平台 **天工开物** / 产品 **鲁班CAD(LubanCAD)** / 几何内核 **真形(TrueForm)** / 约束求解器 **绳墨(ShengMo)**。
> 产品口吻:*说出要什么,鲁班给你真形。*
>
> **公开边界**：本仓、`luban-cad` 与 [DanQing](https://github.com/chenjinxian/DanQing) 公开；`luban-backend`、`imodelhub-services`、`imodel-native`、真形/绳墨为私有仓。公开仓可直接体验、提 Issue 和参与前端/渲染层开发。

---

## 项目亮点

- **真 BRep，而非 Mesh**：生成物是可用于制造的实体模型；特征树、草图、参数与变更历史统一承载在 iModel 中。
- **参数化特征闭环**：拉伸、圆角、抑制、排序、试算预览；草图线/矩形/圆 + 约束/尺寸 + DOF/矛盾面板。
- **多体与体布尔（推进中）**：NEW-body、body boolean、逐 body 可见性与选择链已落地，面/边选择与性能护栏在推进。
- **云端协同数据链**：Changeset 推送/历史、写租约、语义 undo/redo、checkpoint/baseline 云化。
- **大规模数字孪生渲染**：公开的 [DanQing](https://github.com/chenjinxian/DanQing) 纯客户端图形引擎，10km / 169,920 瓦片桥梁模型打开至首帧 2.25s，LOD 流式细化。
- **可参与的开源面**：前端 `luban-cad/apps/web`、基座包 `packages/{viewer,editor,shared}` 与 iTwin.js fork 可独立构建；`shared`/`viewer`/`editor-frontend` 有单元测试；DanQing 是独立公开仓。

## 这是什么

鲁班CAD 是**生成式 CAD**:面向工业制造的 AI 生成式设计——生成物是可用于制造的**真实 BRep 实体**(真形),不是通用文生 3D 的 Mesh。底座是 iTwin.js(vendored fork,`itwinjs-core/`),iModel 作为数据主权载体(模型、特征树、草图、变更历史一体)。

**当前能力**(✅ 可用 / 🟠 部分):

| 域 | 能力 |
|---|---|
| 账户/项目 | ✅ 注册/登录(JWT)、项目(iTwin)与模型(iModel)管理、缩略图、文档 |
| 编辑器 | ✅ 3D 编辑器(视口/相机/选择/AccuDraw 精确绘图)、测量、视图裁剪 |
| 参数化特征 | ✅ 特征树 + 参数面板:拉伸/圆角(fillet)/抑制/排序/试算预览(影子求值) |
| 草图 | ✅ 草图模式:线/矩形/圆绘制 + 约束/尺寸 + DOF/矛盾面板 + 先试算后提交 |
| 实体建模 | 🟠 布尔(并/交/差)/圆角/倒角/抽壳等工具链;阵列工具在修 |
| 版本协同 | ✅ Changeset 提交/推送/历史时间线、命名版本;冲突解决 ⚪ 规划中 |
| 数据通道 | ✅ Tile 云缓存(生成即上传对象存储,浏览器同源直取)、checkpoint/baseline 云化 |
| AI 工具 | 🟠 Agent 复用现有 toolId 注册面,破坏性操作走 HITL(预览→确认→提交) |

## 适用场景

| 场景 | 能做什么 |
|---|---|
| 工业零件/装配设计 | 参数化特征建模、草图约束、圆角/抑制/排序、多体与体布尔（推进中） |
| 云端协同设计 | 项目/模型管理、Changeset 版本、写租约、撤销/重做、推送与历史 |
| AI+CAD 研究 | Agent 复用现有建模 toolId，破坏性操作走 HITL；生成式流程逐步开放 |
| 数字孪生/大模型浏览 | 通过 DanQing 的 tile 流式与渲染能力浏览桥梁、工厂、建筑等大体量模型 |
| 学习/二次开发 | 前端、viewer/editor 基座、iTwin.js fork 可独立构建（shared/viewer/editor-frontend 有单测）；DanQing 是独立公开引擎 |

## 架构速览

```
浏览器(React 18 + Vite)
   │ 同源入口 :5301(容器内 nginx :80;开发态直连 :5300)
   ▼
nginx(单入口)─┬─ /api /ws /ipc ─→ modeling-server :5401(建模宿主:Briefcase/编辑管道/RPC/原生几何内核)
              ├─ /auth /itwins /imodels… ─→ iModelHub :5400(元数据中枢:用户/项目/模型/changeset/锁/权限)
              ├─ /azurite ─→ Azurite :10500(对象存储:baseline/changeset/tile/缩略图)
              └─ / → web(静态)
附属:webhook-agent :5402(验签+baseline 生成)、PostgreSQL(元数据)、Redis(缓存/OIDC)、Maildev(开发邮箱)
宿主端口专用段:前端 :5300 / 单入口 :5301 / HUB :5400 / MS :5401 / WA :5402 / Azurite 10500-10502（见 docs/PORTS.md）
```

后端服务源码在私有仓,本仓**消费其发布产物**(GHCR 镜像 + GitHub Releases tgz)——本地起栈无需后端源码。

## 仓库布局

| 目录 | 内容 |
|---|---|
| `itwinjs-core/` | vendored iTwin.js fork(git-subtree 谱系,上游可同步) |
| `luban-cad/` | 鲁班CAD 应用(pnpm workspace:`apps/web`(前端宿主,包名 `@luban-cad/web`) + `packages/{shared,viewer,editor}`) |
| `scripts/` | 起栈/验收/产物获取脚本 |
| `docs/` | 架构、上游修改台账、同步史、API 契约对照 |

---

## 本地启动(Windows)

### 0. 环境准备

| 依赖 | 版本 | 说明 |
|---|---|---|
| Node.js | ≥ 20(实测 v24) | 自带 corepack |
| pnpm | `corepack pnpm@10`(勿全局装 pnpm 12) | 锁文件格式要求 |
| Docker Desktop | 任意近期版 | 起栈用容器 |
| PowerShell | 5.1+ 均可 | 脚本入口 |

### 1. 四条命令起栈

```powershell
# 仓库根目录
powershell -File scripts/generate-env.ps1     # ① 生成根 .env(幂等;密钥缺失拒启)
powershell -File scripts/fetch-backend.ps1    # ② 拉 MS 产物(Releases)+ GHCR 镜像
docker compose up -d                          # ③ 起栈:Postgres/Azurite/Redis/Maildev + HUB/WA/web/nginx
powershell -File scripts/start-ms-host.ps1 -Detach   # ④ 建模宿主 MS :5401
powershell -File scripts/verify-stack.ps1     # ⑤ 全栈验收(输出全绿即通过)
```

> 起栈要点:① 只需跑一次;② 网络拉镜像慢属正常;④ MS 是**宿主进程**(原生库不可入 Linux 容器),不是 docker 服务;⑤ 是权威验收——绿则栈可用。

**访问入口**:http://localhost:5301(nginx 单域名入口)。

### 2. 首次注册与建库

1. 打开 http://localhost:5301/ → 注册(任意邮箱;注册成功即登录,确认邮件进栈内 Maildev 无需理会)。
2. 「新建项目」→ 进入项目 →「新建 iModel」→ 等卡片变为「已初始化」(baseline 由后台自动生成,通常 <1 分钟;卡住可用卡片上的「重试」)。
3. 点「打开工作空间」进编辑器。

## 功能试用指南(编辑器内)

| 想试什么 | 操作路径 |
|---|---|
| 参数化拉伸 | 左栏「特征历史」→ 新建特征 → 拉伸(extrude) → 填轮廓 JSON + 距离 → 创建 |
| 改参与试算 | 特征行悬停 → 编辑 → 改距离 → 试算徽标即时反馈 → 应用 |
| 圆角 | 新建特征 → 圆角(fillet) → 「从视图选边」→ 点击体上棱线(可多条,再点按钮继续) → 创建 |
| 草图 | 工具条「编辑草图」→ 新建草图 → 直线/矩形/圆 + 约束/尺寸 → 退出自动入树 |
| 抑制/排序/删除 | 特征行内按钮;删除为链尾删除 |
| 测量/裁剪 | 顶部视图工具条 |
| 撤销/重做 | 顶栏按钮(每次编辑即时 saveChanges,可逐步回退) |
| 保存与版本 | 底部状态栏「推送」把本地变更集推上云端;「历史」看变更集时间线;命名版本在项目侧 |
| 多开协同 | 两个浏览器开同一模型:写租约单持有者(另一窗只读提示),推送后重开可见 |

### 一键演示(自动走全流程)

```powershell
cd luban-cad/apps/web
node demo-full-flow.cjs    # 可见浏览器全流程:登录→建项目/模型→拉伸→改参→草图→圆角选边→重开→健康审计
```

## 测试

```powershell
# 单元/集成(前端包)
cd luban-cad/apps/web && corepack pnpm@10 test          # vitest 全量

# e2e(需栈在跑 + 前端 dev server)
cd luban-cad/apps/web && corepack pnpm@10 dev           # 终端 A:起 vite :5300
corepack pnpm@10 test:e2e                               # 终端 B:Playwright 全量 e2e(需真实栈,约 10 分钟)
```

e2e 基建说明:种子模型由测试自管(每轮自动重置);登录走会话注入避开限流;worker=1 串行(编辑器并发开库有已知抖动)。

## 开发模式

| 改动面 | 需要做什么 |
|---|---|
| 仅 `luban-cad/apps/web` 前端 | `corepack pnpm@10 install` 一次,此后 `dev` 热更即生效(:5300 直连后端) |
| `luban-cad/packages/*` 共享包 | 对应包 `pnpm build`(watch 可用) |
| `itwinjs-core/*` fork 源码 | Rush 重建:`node common/scripts/install-run-rush.js build --to <包>`;改动必须登记 `docs/ITWINJS_CORE_MODIFICATIONS.md` |
| 后端行为 | 后端源码在私有仓;本仓只能消费产物。本地栈换产物:`fetch-backend.ps1` 重拉 + 重启 MS |

## 故障排查速查

| 症状 | 处置 |
|---|---|
| 起栈脚本报密钥缺失 | 重跑 `scripts/generate-env.ps1` |
| fetch-backend 下载超时/EOF | 需代理:`$env:HTTPS_PROXY='http://127.0.0.1:7897'`(或你的代理)后重跑 |
| 登录/注册 429 | MS 登录限流 100 次/15 分钟——重启 MS 即清 |
| 编辑器卡「初始化编辑器...」 | 已知 WS 握手抖动,刷新页面即恢复 |
| MS 日志无 "using dev build" 横幅 | 原生库回退官方包,重跑 `scripts/replace-imodeljs-native.ps1`(rush 重装后 hook 自动跑) |
| verify-stack 有红 | 按步骤行内的提示(A 健康/B 数据链/C WS/D 横幅)逐项排 |

## 文档索引

- 架构设计:`docs/Architecture.md`(服务/通信/数据流/安全)
- fork 改动台账:`docs/ITWINJS_CORE_MODIFICATIONS.md`
- 上游同步史:`docs/UPSTREAM_SYNC.md`
- 官方 API 契约对照:`docs/api-specs/*.json`
- 已删除文档历史索引:`docs/HISTORY.md`
- 文档总索引:`docs/README.md`
- 愿景/路线图/能力矩阵:本仓 `docs/ROADMAP.md` 与代码/测试实测

## 相关公开项目

| 项目 | 内容 |
|---|---|
| [DanQing](https://github.com/chenjinxian/DanQing) | 纯客户端图形引擎：itwinjs 级 tile 流式 + Filament 级渲染，支持大体量 BIM/数字孪生模型 |
| [DanQing-Data](https://github.com/chenjinxian/DanQing-Data) | 公开演示模型数据包（桥梁、厂房、住宅等） |
| [Releases](https://github.com/chenjinxian/tiangong-kaiwu/releases) | 清理里程碑、后端产物说明与前端镜像信息 |

## 参与公开项目

- 前端与基座包：从 `luban-cad/apps/web` 或 `packages/{viewer,editor,shared}` 开始，按 [luban-cad/CLAUDE.md](luban-cad/CLAUDE.md) 的工具生命周期与测试要求提交。
- 渲染引擎：从 [DanQing](https://github.com/chenjinxian/DanQing) 的 README/Quick start 开始，按该仓 README/CLAUDE.md 的参考保真规则提交。
- Issue/PR 优先描述“可复现步骤 + 期望行为 + 环境”；涉及界面变化请附截图或录屏。
- 私有后端/内核不在本仓开放；公开仓通过 Releases/GHCR 消费其产物。

## 许可与边界

- 本仓公开部分含 itwinjs-core fork(其原始许可见 `itwinjs-core/LICENSE.md`)。
- 后端服务、真形内核、绳墨求解器为私有仓自研组件,经 GHCR/Releases 产物分发;本仓不含其源码。
