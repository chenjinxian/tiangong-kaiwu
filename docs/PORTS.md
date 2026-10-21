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
| Web 前端（Vite dev） | **5300** | 5300（Vite） | `vite.config.ts` `server.port`；`.env.development` 的 `VITE_API_URL=http://localhost:5401` |
| web-next dev（并行重写壳） | **5310** | 5310（Vite） | `apps/web-next/vite.config.ts` `server.port`；HUB CORS 白名单含 `http://localhost:5310`（`generate-env.ps1`） |
| web 静态容器（nginx 后端） | 不发布 | 3000（容器内） | `luban-cad/apps/web/web-nginx.conf`；经外层 nginx :5301 暴露 |
| Nginx 单入口 | **5301** | 80 | 根 `docker-compose.yml` `nginx.ports` |
| imodelhub-services (HUB) | **5400** | 4000 | compose `imodelhub.ports`；`APP_PORT=4000` 不变 |
| modeling-server (MS，宿主进程) | **5401** | 5401 | 根 `.env` `PORT=5401`；`scripts/start-ms-host.ps1` 读取 |
| webhook-agent (WA) | **5402** | 4002 | compose `webhook-agent.ports`；`PORT=4002` 不变 |
| BFF（luban-bff） | 不发布 | **5403** | `services/bff/src/config.ts`、compose `PORT=5403`、Dockerfile `EXPOSE` |
| Azurite Blob | **10500** | 10000 | compose `ports: 10500:10000` |
| Azurite Queue | **10501** | 10001 | compose `ports: 10501:10001` |
| Azurite Table | **10502** | 10002 | compose `ports: 10502:10002` |
| PostgreSQL（仅源码模式 override） | **55432** | 5432 | `docker-compose.override.yml.disabled` |
| Redis（仅源码模式 override） | **56379** | 6379 | 同上 |
| Maildev SMTP（仅源码模式 override） | **11025** | 1025 | 同上 |
| Maildev UI（仅源码模式 override） | **11080** | 1080 | 同上 |
| Vite preview | **5302** | 5302 | `vite.config.ts` `preview.port` |

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
HUB_UPSTREAM=host.docker.internal:5400
WA_MODELING_SERVER_URL=http://host.docker.internal:5401
BFF_UPSTREAM=host.docker.internal:5401                       # 启用 BFF 改 luban-bff:5403
HUB_ALLOWED_ORIGINS=http://localhost:5300,http://localhost:5301
BFF_ALLOWED_ORIGINS=http://localhost:5300,http://localhost:5301
```

## 访问入口

- 开发态：<http://localhost:5300>
- 生产/单入口：<http://localhost:5301>
- HUB health：<http://localhost:5400/health>
- MS health：<http://localhost:5401/health>
- WA health：<http://localhost:5402/health>

## itwinjs-core 占用提示

`itwinjs-core/.vscode/launch.json` 与 `full-stack-tests` 使用 3000/3001/5000/8080。
本仓前端/入口/BFF 等已全部避开；若未来新增调试服务，请继续使用 53xx/54xx 段。
