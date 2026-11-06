# Release backend-20261106 — 外部本地部署公开产物

日期：2026-11-06。目标：让没有私有仓源码、没有 GitHub 账号、没有 `docker login` 的外部体验者，仅凭本公开仓 + Docker Desktop + Node.js 在 Windows 本地起完整 LubanCAD 栈。

## 公开产物

| 产物 | 引用 | Digest / SHA256 |
|---|---|---|
| web | `ghcr.io/chenjinxian/luban-web-public:backend-20261106` / `:latest` | `sha256:706a6dd5d0c6892be8a9f7165b151c81c95047ad3ea2c5bf07b6712a8634c5d3` |
| bff | `ghcr.io/chenjinxian/luban-bff-public:backend-20261106` / `:latest` | `sha256:f0f8f6b7eca9425c4d2f828a0763b62ffc5a5057047fc6e4ae56a8eab877fd19` |
| imodelhub | `ghcr.io/chenjinxian/imodelhub-public:backend-20261106` / `:latest` | `sha256:24eb26b352db3a0b0afa9b0726f987f9e6fd34afc93aba395be23b2d1d4c71cc` |
| webhook-agent | `ghcr.io/chenjinxian/luban-webhook-agent-public:backend-20261106` / `:latest` | `sha256:27eb8103705cd9b64ba56c402aa0e9c3e325d9c3a722893708844734625951b4` |
| modeling-server | Release `backend-20261106` / `modeling-server-win-x64-backend-20261106.tgz` | `sha256:fc35aa45c9f395168cb7ac47f8f4fbe27528a133221faecc231bc6960a60bbcf`（178,691,226 B） |
| 部署包 | Release `backend-20261106` / `luban-cad-deploy.zip`（稳定名） | `sha256:5967e5b577377e1420e52b0194602ce922847f98766331b211aee1b8cbf3a9e8`（约 55 KB，无需 clone 源码仓） |

- modeling-server 契约 `LubanFeatureRpcInterface.interfaceVersion = 1.32.0`，RPC metadata 实测暴露 `LubanFeatureRpcInterface-1.32.0-*`。
- 原生库 provenance 见产物内 `native-provenance.json`；本次为显式 store dev build（已在内部发布记录披露），Windows x64。
- 官方基础设施镜像：postgres:17-alpine / redis:7-alpine / maildev/maildev / azurite / nginx:alpine（公开 registry）。

## 验收

- `scripts/verify-public-deps.ps1` **11/11**：4 个 GHCR 包匿名 manifest 200 + 最新 Release 的 MS 资产与稳定名部署包 + 5 个官方基础设施引用。
- 匿名冷拉（空 `DOCKER_CONFIG`）实测通过：
  - `luban-web-public:latest`、`luban-bff-public:latest`（本次）；`imodelhub-public:latest`、`luban-webhook-agent-public:latest`（本次早前）。
- 产物模式建模后端（Release 同源构建）在宿主 :5401 启动，`scripts/verify-stack.ps1` **17/17**（health×5、登录、iTwin/iModel/baseline 数据链、WS cookie 握手与负向拒绝、dev-build 横幅、web/hub 镜像 revision）。
- 公开 web 镜像在浏览器实际加载：标题 LubanCAD，控制台 0 error。
- 冷拉后 `docker compose up -d` 使用公开镜像，无本地构建。

## 已知限制 / 回滚

- 仅 Windows 10/11 x64（modeling-server 为 Windows 原生宿主进程）；Linux/macOS 不支持。
- 首次下载约 5–30 分钟（视 GitHub 网络；支持断点续传）；GitHub Release 匿名 API 未登录限流 60 次/小时。
- 回滚：上一公开 Release 为 `backend-20261101-p28c`（契约 1.18.0，缺少孔/cPlane/抽壳/第二方向等新特征）；本次 `latest` 镜像被覆盖，回滚需重新推送旧 tag/镜像。
- web/bff/hub/WA 公开包首次设为 Public 通过 GitHub 网页操作（REST PATCH 在 gh OAuth token 下 404）；后续 push 继承可见性。
