# Release web-20261110b（web-only）

2026-11-10 web 追加发布：公开 `/examples` 全部示例目录 + 查看器 IPC
生命周期/后端重启/登出边界。**仅 web 镜像变更**；modeling-server、hub、
webhook-agent、bff 与 `backend-20261110` 完全一致，未重建、未重发。

## 公开产物

| 产物 | 引用 | Digest / SHA256 |
|---|---|---|
| web | `ghcr.io/chenjinxian/luban-web-public:backend-20261110b` / `:latest` | `sha256:6ac74b99fe14f610b1a7c8c39736af6c9be78246d4a1c627b256a53e4cdc8ff5` |
| bff | `ghcr.io/chenjinxian/luban-bff-public:backend-20261110` / `:latest` | `sha256:ddf1d5bed23690d34d410ad43ad24a488397db1af852e7eebe390966fd376086`（未变） |
| imodelhub | `ghcr.io/chenjinxian/imodelhub-public:backend-20261110` / `:latest` | `sha256:f6f0755915d169b2b625fd888492e94172244b3ee00d88fa39f6045f99ad6e6d`（未变） |
| webhook-agent | `ghcr.io/chenjinxian/luban-webhook-agent-public:backend-20261110` / `:latest` | `sha256:e66de9ba148c58dcee534586695c8a476cbcbeb383efc9c2ea77a2cbb05e3ee8`（未变） |
| modeling-server | GitHub Release `backend-20261110` / `modeling-server-win-x64-backend-20261110.tgz` | `sha256:44d064d624a92f351fd76dff26688957eadd0d939d57e5269067e0a911dab080`（未变） |

- 源码基线：public `9fe2cd8a33`（`feat(examples): public catalog and
  page-lifetime IPC boundaries`）。镜像 OCI revision `9fe2cd8a3338`，
  `VITE_B_MODEL_ENABLED=true`、`VITE_E2E_HOOKS` 关闭。
- **未创建新的 GitHub Release**：外部体验者仍用 Release `backend-20261110`
  的 MS 产物/部署包；web 走 GHCR `latest` 自动更新。`verify-public-deps`
  的 Release asset 与部署包检查保持 11/11。

## 本批变更

- **`/examples` 全部示例目录**：18 个 `replicable-now` 脱敏条目、真实封面、
  owner 过滤/搜索、目标体积与 strict 状态；登录后按项目名+iModel 名运行时
  解析，直达 Part Studio（不把 hub UUID 写进源码）；未定位/未登录回退。
- **nginx Host 端口保留**：`/itwins`、`/imodels` 改用 `$http_host`。hub
  分页 `_links.next` 是绝对 URL，旧 `$host` 丢掉 `:5301` 会让下一页请求
  落到 80 端口；示例项目 iModel 超过一页时暴露。
- **页面级 IPC host**（对齐 display-test-app）：`LocalhostIpcApp`/`IpcApp`/
  `IModelApp` 首次进入编辑器 startup 一次，React 路由/Viewport 卸载只关闭
  `BriefcaseConnection`，`releaseViewer` 只减引用不 shutdown；彻底移除 SPA
  重入死 WebSocket 的根因。
- **后端重启有界失败**：打开文档前用官方
  `IpcApp.appFunctionIpc.queryConcurrency('io')` 做 8s 存活探针；MS 重启后
  旧 socket 已死但 `IpcApp.isValid` 仍为真时，错误面可见“刷新页面”，不再
  永久停在“正在打开文档…”；刷新后新 host 恢复。
- **登出整页导航**：文档中心/文档详情/编辑器顶栏/设置四处登出统一
  `AuthSession.logout()` → `window.location.href='/login'`，销毁旧 WS 身份，
  避免切换账号复用页面级 host。

## 验收

- 单测：viewer **130/130**；web **1537/1537**；web tsc、e2e tsc、lint 全绿。
- 真栈开发态：`catalog.spec.ts` **5/5**（18 卡、文档中心 B 项目、SPA 重入
  两轮、刷新、Bumper 直达）；`ipc-logout.spec.ts` **1/1**；
  `ms-restart-recovery.spec.ts`（`IPC_RESTART_E2E=1`）**1/1**。
- 部署镜像 `:5301`：catalog **5/5** + logout **1/1** + MS 重启恢复 **1/1**。
- `verify-stack.ps1` **17/17**（Step E web revision `9fe2cd8a3338`）。
- `verify-public-deps.ps1` **11/11**（web 匿名 manifest 200，digest
  `6ac74b99…`；其余公开发布物不变）。

## 已知限制 / 回滚

- 打开文档**期间**后端重启仍可能让单次 `downloadBriefcase` 悬挂；用户可
  刷新页面恢复，与 display-test-app 口径一致。自动重连需新协议 + ADR，
  不允许在组件层重建 host。
- 页面级 host 会占用一个 WebGL/IPC 会话直到刷新（DTA 同款取舍）。
- 回滚 web：重新打/拉 `ghcr.io/chenjinxian/luban-web-public:backend-20261110`
  （digest `sha256:3bf45cb54c63b418988ed8d02721fb50b27f4ea2ddc20929d96fe670b222ad4a`）
  并 `docker compose up -d web`；此回滚会移除 `/examples` 与新 IPC 边界修复。
  后端、hub、WA、bff 不受影响（无契约/schema 变更）。
