# 后端私有化五层验证记录（2026-10-01 计划 → 2026-10-02/03 收口）

**Plan**: docs/superpowers/plans/2026-10-01-backend-privatization.md
**Spec**: docs/superpowers/specs/2026-10-01-backend-privatization-design.md
**Ledger**: .superpowers/sdd/2026-10-01-backend-privatization/progress.md

## 终态总览

| 交付物 | 状态 | 位置 |
|---|---|---|
| 公开仓 tiangong-kaiwu | ✅ 推送（3aaeac9ca3） | github.com/chenjinxian/tiangong-kaiwu |
| 私有仓 luban-backend | ✅ 推送（c053bbf） | github.com/chenjinxian/luban-backend（private） |
| imodelhub-services Dockerfile | ✅ 推送（5312229 + b82d88d） | github.com/chenjinxian/imodelhub-services |
| MS 产物 | ✅ 已发布 | Release backend-20261002（modeling-server-win-x64-backend-20261002b.tgz） |
| WA 镜像 | ✅ 已发布 | ghcr.io/chenjinxian/luban-webhook-agent:{backend-20261002,latest} |
| imodelhub 镜像 | ✅ 已发布 | ghcr.io/chenjinxian/imodelhub:{backend-20261002,latest} |

## 五层验证

### 层1 私有仓回归 ✅

- modeling-server：vitest 29 文件 262 pass / 8 skip（2026-10-01 T2x 后全绿，3 例既有失败经 imodel-native 重编译治愈）
- webhook-agent：vitest 10 文件 42/42 pass（2026-10-02 复核 163/163 + 42/42 口径一致）

### 层2 产物冒烟 ✅

- MS 产物（dist-backend 解压树）独立起：health 200 + `using dev build from ...\dist-backend\modeling-server\node_modules\@bentley\imodeljs-native` 横幅
- fetch-backend.ps1 本地模式（-LocalArtifact）与 Release 模式（gh release download）均验证
- 关键修复（过程记录）：产物依赖闭包 = npm install + resolve-deps.js 递归拷贝 + editor-backend 嵌套 core-backend 去重；unicode-trie/tiny-inflate/pako/flatbuffers/body-parser 等 link: 传递依赖逐个实证后收敛为闭包算法

### 层3 全栈验收 ✅ 14/14（verify-stack.ps1，2026-10-02 终态）

- A 区 health×5 全绿（HUB/MS/web/WA/azurite）
- B 区数据链全绿（服务账号登录 → 建 iTwin 201 → 建 iModel 201 → **baseline 初始化 initialized** → 清理 204×2）
- C 区 WS 全绿（cookie 握手 101 + 无凭据 401 拒绝）
- D 区 dev-build 横幅命中

### 层4 前端 🟠 部分（既有测试债）

- 单测：shared 27/27 ✅；web-viewer 26/30（4 败：WebInitializer 既有）；viewer-core 106/114（8 败：Iso/Isometric 不匹配等既有）
- e2e（45 测试/13 文件）：**16 通过**。修复历程：Playwright 浏览器未装（环境问题，装）→ hub CORS 空数组全拒致浏览器 fetch 500（compose 补 ALLOWED_ORIGINS）→ 测试用户/前置数据缺失（注册 test@example.com + 建「测试项目」种子，注意中文 payload 须 UTF-8 文件传参防 Git Bash GBK 污染）→ 16 通过。剩余 29 败均为**既有测试债**：e2e 选择器与 UI 结构失配（div[cursor=pointer] vs a[href]/.section-card）、auth.setup.ts 未注册进 testMatch（storage state 不生成）、logout 元素缺失、v2-checkpoint/editor 深链路。归 M3 测试体系任务。
- ~~e2e 测试债~~ **✅ 已清偿（2026-10-03，M3 测试体系）**：45/45 全绿 ×2 连续（6.2m/7.2m，serial workers=1）。要点：① auth.setup 接入 config（setup project + 双写 storageState/session.json——本应用 auth 在 sessionStorage，storageState 带不了）；② 选择器全面适配现 UI（Tile 内嵌按钮/getByRole，对话框标题只存在 aria-label）；③ 工具激活断言改 window.IModelApp.toolAdmin.activeTool.toolId（提示语不落 DOM）；④ **发现并修复产品缺陷**：Login 错误横幅因 effect 依赖含 error 自清除而闪现不可见（src/pages/Login/Login.tsx）；⑤ 韧性三件套：会话注入登录（MS 全局限流 100 req/15min/IP）、auth.setup 自愈清场（hub 分页 $top=10 会把 seed 挤出首页）、编辑器 IPC WS 握手偶发挂起以 reload 重试兜底（根因在私有仓 MS，待跟进）。删除重复 spec complete-workflow-improved。

### 层5 谱系演练 ✅

- filter-repo 重写后 `git subtree split --prefix=itwinjs-core HEAD` 完整走通（103 提交 → effcd6753dc）；
- 谱系锚点 `Squashed 'itwinjs-core/'`（4d76cf463e）在重写后历史中完好；
- 真实上游同步（upstream 已移动 6407fdd4c5..d093f15dd3）另行立项，不在本验证范围。

## 关键故障与根因（审计锚点）

| 故障 | 根因 | 修复 |
|---|---|---|
| WA 容器 MODULE_NOT_FOUND（flatbuffers 等） | pnpm install 不解析 link: 目标依赖闭包（lockfile 无记录） | docker-closure.cjs 自动发现 link: 依赖递归走查：registry 依赖 pnpm add + @itwin/* 传递 workspace 依赖补 symlink |
| WA 容器 imodeljs-linux-x64 缺失 | pnpm 默认拦截 postinstall | Dockerfile 手动 `node installNativePlatform.js` |
| imodelhub 容器 TS2564/TS1240 满屏 | 运行层缺 tsconfig.json，ts-node migration/seed 退化默认 strict | Dockerfile 运行层补 COPY tsconfig.json/tsconfig.build.json |
| baseline 初始化 401 | hub /imodels/admin/* 用 ApiKeyGuard=INTERNAL_API_KEY，compose 只映射了 AGENT_API_KEY | compose 补 INTERNAL_API_KEY 同源映射 |
| hub healthcheck 429 卡死 WA/nginx depends_on | 限流器把 30s 健康检查也计数 | compose 设 TEST_MODE=true（hub 自带 e2e 开关，关限流） |
| baseline 轮询偶发超时 | recovery checker 5 分钟一轮 ≈ verify 轮询窗口 300s 竞态 | compose 设 RECOVERY_CHECK_INTERVAL_MINUTES=1 |
| e2e 浏览器 fetch 全 500 | hub ALLOWED_ORIGINS 空数组全拒（env-example 注释态） | compose 补 ALLOWED_ORIGINS |
| C 盘爆满（1.7GB 剩余） | Docker build cache 71.57GB + 数据目录 75GB | builder prune（释放 70GB）+ Docker 数据目录迁移 D 盘（释放 80GB，C 盘 221GB 剩余） |

## 遗留事项（移交后续）

1. ~~**e2e 测试债**（29/45 败，全部既有的测试与 UI/代码失配）——归 M3 测试体系任务~~ **✅ 2026-10-03 完成，见层4 补记**。另移交私有仓两跟进：MS IPC WS 握手偶发挂起（前端「初始化编辑器...」停滞，重连即恢复）；MS 全局 rateLimiter 100 req/15min/IP 对 e2e 套件偏紧（前端测试已改会话注入规避，可考虑 localhost/TEST_MODE 豁免）。
2. ~~**web 容器镜像**：luban-cad/Dockerfile 构建在 pnpm build 阶段失败（exit 2，疑同系 link: 闭包问题），当前 compose 注释 web 服务、前端走宿主 dev server；修复后可恢复 web 容器形态 + nginx 指回 web:3000~~ **✅ 已修复（2026-10-03，见下节）**
3. **真实上游同步**：upstream/master 已移动（6407fdd4c5..d093f15dd3），sync-from-upstream.sh 按既有流程立项执行
4. **WA 镜像 MS 连接**：容器内 WA 访问宿主 MS 走 host.docker.internal:4001（compose WA_MODELING_SERVER_URL 可覆盖）
5. **publish.ps1**：镜像已手动 push（digest 与 build 一致），后续版本直接 `powershell -File scripts/publish.ps1 -Tag backend-YYYYMMDD` 一条流水线

## 补记：web 容器镜像修复（2026-10-03）

web 镜像（ghcr.io/chenjinxian/luban-web:{backend-20261003,latest}）构建成功并推送，compose 恢复 web 容器服务、nginx 指回 web:3000，verify-stack 14/14 全绿（web 为容器形态）。

失败链与根因（比预期深，非单纯闭包问题）：

| 故障 | 根因 | 修复 |
|---|---|---|
| viewer-core TS2339（IModelConnection.key/projectExtents 不存在） | .dockerignore 排除 itwinjs-core 各包 node_modules（rush 现场），d.ts 链内 @itwin/* 导入 walk-up 落空，skipLibCheck 下静默丢基类成员 | luban-cad/Dockerfile 在 itwinjs-core 树根按各包 package.json name 动态建 symlink farm（两层遍历覆盖 ecschema-rpc/common 等嵌套包） |
| Tooltip.tsx/Documents.tsx TS2322（Timeout vs number） | 容器含 @types/node，裸 setTimeout 解析为 NodeJS.Timeout | ref 改 number + 调用统一走 window.setTimeout |
| vite "Rollup failed to resolve import fuse.js" | link: 目标的 registry 依赖（fuse.js 等）不在 web workspace | docker-closure.cjs 移植进 luban-cad，workspace 4 包分别 --emit 去重后 `pnpm add -w`（-w 防 ERR_PNPM_ADDING_TO_ROOT） |
| vite 仍缺 ecschema-rpcinterface-common/webgl-compatibility | 前者是嵌套包（farm 一层遍历漏掉）；后者根本不在 .dockerignore 白名单 | farm 改两层遍历；.dockerignore 白名单补 core/webgl-compatibility、core/orbitgt、core/ecschema-rpcinterface |

相关提交：公开仓 9caa334230；私有仓 be4c450（docker-closure 警告改 stderr + 双布局候选根 + 嵌套包映射）。

## 环境基座（本机）

- Docker Desktop 29.8.1（数据目录已迁 D:\Docker，符号链接回 C 原位；代理 http.docker.internal:3128 → Clash 127.0.0.1:7897）
- ghcr.io 发布用 classic PAT（scope: repo + write:packages）；gh auth login --web 的 OAuth token 不含 packages scope，不可用于 docker login
- Playwright 浏览器需 `npx playwright install chromium`（走代理 HTTPS_PROXY=127.0.0.1:7897）
