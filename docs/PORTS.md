# 服务端口登记（单一事实源）

> 2026-10-20 起，天工开物本地栈的**宿主发布端口**统一迁入专用段 **53xx/54xx**，
> 避开 vendored `itwinjs-core` 开发/测试工具的常用端口（3000/3001/5000/8080）。
>
> 原则：
> - **只有宿主发布端口需要避让**；容器内端口（服务间互通）保持不变，避免重建镜像。
> - 需要临时覆盖时，优先改根 `.env`（`generate-env.ps1` 已内置下列默认值）。
> - 新增服务必须在本表登记，并从 5300-5499 段分配，禁止回用 3000/4000 段。

## 宿主端口表

| 服务 | 宿主端口 | 容器/进程内端口 | 配置位置 |
|---|---|---|---|
| Web 前端（Vite dev） | **5300** | 5300（Vite） | `luban-cad/apps/web/vite.config.ts` `server.port`；HUB CORS 白名单见 `generate-env.ps1` |
| web 静态容器（nginx 后端） | 不发布 | 3000（容器内） | 构建面 = `luban-cad/apps/web`（`apps/web/web-nginx.conf` + `apps/web/Dockerfile`，compose `web` 服务本地 build）；经外层 nginx :5301 暴露。**镜像不随 fetch-backend 更新——源有更新跑 `scripts/rebuild-web.ps1`（B2，verify-stack Step E 报告陈旧）** |
| Nginx 单入口 | **5301** | 80 | 根 `docker-compose.yml` `nginx.ports` |
| imodelhub-services (HUB) | **5400**（仅 127.0.0.1 回环） | 4000 | compose `imodelhub.ports`（**2026-10-27 起只绑定回环**：宿主 MS/verify-stack 可直连，nginx 走容器网络 `imodelhub:4000`；禁止 0.0.0.0 发布——直连客户端可伪造 XFF 绕过限流）；`APP_PORT=4000` 不变 |
| modeling-server (MS，宿主进程) | **5401** | 5401 | 根 `.env` `PORT=5401`；`scripts/start-ms-host.ps1` 读取 |
| webhook-agent (WA) | **5402** | 4002 | compose `webhook-agent.ports`；`PORT=4002` 不变 |
| BFF（luban-bff） | 不发布 | **5403** | `services/bff/src/config.ts`、compose `PORT=5403`、Dockerfile `EXPOSE` |
| Azurite Blob | **10500** | 10000 | compose `ports: 10500:10000` |
| Azurite Queue | **10501** | 10001 | compose `ports: 10501:10001` |
| Azurite Table | **10502** | 10002 | compose `ports: 10502:10002` |
| PostgreSQL / Redis / Maildev（栈内互通） | 不发布 | 5432 / 6379 / 1025、1080 | 根 `docker-compose.yml`（部署权威）；旧 `luban-cad/docker-compose.dev.yml`（宿主 55432/56379/11025/11080）已于 2026-10-29 退役 |
| Vite preview | **4173** | 4173 | Vite 默认值；`luban-cad/apps/web/vite.config.ts` 未配置 `preview.port` |

> **旧源码模式编排退役（2026-10-29）**：`luban-cad/docker-compose.dev.yml` 已删除。
> 后端源码（modeling-server / webhook-agent）已迁至私有仓 `luban-backend`，该文件
> 引用的 `../modeling-server`、`../webhook-agent`、`../../imodelhub-services` 构建
> 上下文不复存在；根 `docker-compose.yml` 为唯一部署权威，后端源码调试见私有仓 README。

## 关键环境变量（根 `.env`）

```ini
PORT=5401
IMODELHUB_URL=http://localhost:5400
FRONTEND_URL=http://localhost:5300
MODELING_SERVER_URL=http://localhost:5401
AZURITE_HOST=127.0.0.1:10500
AZURE_BLOB_ENDPOINT=http://azurite:10000/devstoreaccount1   # 容器内不变
AZURE_BLOB_PUBLIC_HOST=127.0.0.1:10500                       # 宿主 MS 预签名 URL 改写目标
MS_UPSTREAM=host.docker.internal:5401
HUB_UPSTREAM=imodelhub:4000                                  # 容器网络直连 hub（W1-I6）
WA_MODELING_SERVER_URL=http://host.docker.internal:5401
BFF_UPSTREAM=host.docker.internal:5401                       # 启用 BFF 改 luban-bff:5403
HUB_ALLOWED_ORIGINS=http://localhost:5300,http://localhost:5301
BFF_ALLOWED_ORIGINS=http://localhost:5300,http://localhost:5301
```

> **HUB_UPSTREAM 口径（2026-10-27，W1-I6）**：hub 只发布在宿主 **127.0.0.1:5400**
> （仅回环），容器内一律经 compose 网络 `imodelhub:4000` 访问。走
> `host.docker.internal:5400` 的宿主机路径在 Docker Desktop 下会经过 NAT/SNAT：
> hub 看到的来源是网关地址而非真实客户端，客户端 IP / `TRUST_PROXY` 跳数
> 口径失真——仅宿主源码模式临时调试时才显式覆盖，不作为缺省。
>
> **CORS 条目口径**：`HUB_ALLOWED_ORIGINS` 条目只接受精确 origin（字符串全等）
> 或显式 `^...$` 锚定正则；未锚定的值按字面精确匹配（不会被当正则）。HUB 在
> `NODE_ENV=development` 下只额外放行 loopback（localhost / 127.0.0.1，任意
> 端口），不再无条件放开任意来源。

## 访问入口

- 开发态：<http://localhost:5300>
- 生产/单入口：<http://localhost:5301>
- HUB health：<http://localhost:5400/health>
- MS health：<http://localhost:5401/health>
- WA health：<http://localhost:5402/health>

## itwinjs-core 占用提示

`itwinjs-core/.vscode/launch.json` 与 `full-stack-tests` 使用 3000/3001/5000/8080。
本仓前端/入口/BFF 等已全部避开；若未来新增调试服务，请继续使用 53xx/54xx 段。
