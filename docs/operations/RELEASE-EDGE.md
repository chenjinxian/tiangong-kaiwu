# Release edge：TLS、安全头与存储门禁

本文件是 **release 边界**的操作说明，不是发布就绪声明。它覆盖
`docker-compose.release.yml` 的 nginx edge、`deploy/release/nginx.conf`、
`deploy/release/nginx-tls.conf.template` 以及 webhook-agent（WA）
baseline/debug 面的残余暴露。开发栈（`docker-compose.yml` +
`deploy/default.conf.template`）保持 HTTP、无证书、匿名回环 tile 代理，
不因本文件变化。

当前状态：配置与静态测试已落地；**未执行真实发布**，仓库内没有真实证书、
私钥、域名或 release manifest。真实证书/域名/secret store 输入由发布 owner
提供，按 `docs/RELEASE-CHECKLIST.md` 执行。

## 1. 拓扑与边界

| 项目 | 开发栈 | release 栈 |
|---|---|---|
| edge 入口 | nginx HTTP `:5301` | nginx HTTP `:80` + HTTPS `:443` |
| HTTP 行为 | 直接提供业务 | 仅 `308` 跳转到 `https://<RELEASE_DOMAIN>` |
| 证书 | 不要求 | **必须**提供证书链与私钥 |
| 发布宿主端口 | nginx + 基础设施回环 | **只有 nginx**（postgres/redis/azurite/hub/WA/bff/web 全部内部网络） |
| `/azurite` | 匿名同源代理（仅宿主回环） | 非 tile 路径 `404`；tile blob 必须带过期签名，否则 `403`/`410` |
| nginx 配置 | `deploy/nginx.conf` + `deploy/default.conf.template` | `deploy/release/nginx.conf` + `deploy/release/nginx-tls.conf.template` |

release 的 `nginx` 服务是唯一有 `ports:` 的服务。HTTP 监听固定跳转到
`RELEASE_DOMAIN`（不反射客户端 `Host`，避免开放重定向）；HTTPS 监听承载
`/api`、`/ws`、`/ipc`、HUB 九前缀、静态前端和 signed tile。`/healthz` 在
TLS 面供外部 LB/探针使用；容器 healthcheck 另走容器内 loopback
`127.0.0.1:8081` 明文端点（不发布、不依赖证书 SAN，因为 nginx:alpine 的
BusyBox wget 不支持跳过证书校验）。

注意：`deploy/release/nginx.conf` 只 include
`/etc/nginx/conf.d/nginx-tls.conf`，**不** include `conf.d/*.conf`，因此
nginx 镜像自带的 `/etc/nginx/conf.d/default.conf` 不会额外开放一个明文
`:80` 站点。

## 2. 必须由人类提供的输入

这些变量在 `deploy/release/release-profile.json` 的 `requiredInputs` 中
登记；compose 使用 `${VAR:?message}`，缺失时在启动前失败。开发 `.env` 的
变量名刻意无法满足（必须 `RELEASE_*`）。

| 输入 | 要求 | 说明 |
|---|---|---|
| `RELEASE_DOMAIN` | 规范 DNS 主机名，小写，不含 scheme/port/path | 必须与证书 SAN 匹配；HTTP 跳转和 `server_name` 都用它 |
| `RELEASE_TLS_CERT_FILE` | 宿主上的 PEM **完整证书链**路径 | 叶子证书 + 中间证书；容器内只读挂载为 `/etc/nginx/tls/tls.crt` |
| `RELEASE_TLS_KEY_FILE` | 宿主上的 **无口令** PEM 私钥路径 | 容器内只读挂载为 `/etc/nginx/tls/tls.key`；权限建议 `0400`/`0440`、root 所有 |
| `RELEASE_TILE_SIGNING_SECRET` | 32–128 位 `[A-Za-z0-9_-]` 随机值 | 用于 nginx `secure_link`；由 secret store 注入；不得写入仓库或日志 |
| `RELEASE_EDGE_BIND` | 显式宿主地址；默认 `127.0.0.1` | 对外发布必须显式改为目标地址（例如 `0.0.0.0`），并先完成防火墙/暴露面评审 |
| `RELEASE_EDGE_HTTP_PORT` / `RELEASE_EDGE_HTTPS_PORT` | 宿主端口映射；默认 `80`/`443` | 非标准映射时需同步调整 DNS/证书/运维说明 |
| `RELEASE_ALLOWED_ORIGINS` | 至少 `https://<RELEASE_DOMAIN>` | HUB/BFF/Azurite CORS 白名单；release 不得保留开发 `http://localhost:*` |

镜像要求：`RELEASE_NGINX_IMAGE` 必须是官方 nginx 构建或包含
`ngx_http_secure_link_module` 的等价镜像，且版本 ≥ 1.25.1（模板使用
`http2 on;`）。manifest 钉住 nginx digest 后，发布前必须用真实证书执行
`nginx -t` 验证；不要假设 `:latest` 或开发机镜像就是发布镜像。

证书与域名获取：

- 使用 CA 签发的证书；release 不得使用自签名证书。证书链必须包含中间
  证书，否则部分客户端会校验失败。
- 私钥只能通过 secret store/证书管理系统落到宿主受限路径；不得提交到
  仓库，也不得打进镜像。仓库中的测试只扫描文本，不读取真实证书。
- 续期：替换宿主证书/私钥文件后 reload nginx（例如
  `docker compose -f docker-compose.release.yml exec nginx nginx -s reload`，
  bind mount 会看到新文件）。先验证新证书再切换。
- HSTS 默认一年并 `includeSubDomains`；**不默认加 `preload`**。是否加入
  preload 列表是发布 owner 的人类决策，必须确认所有子域都支持 HTTPS。
- 本配置不提供 ACME HTTP-01 例外（`:80` 只有 308）。如果需要在 edge 上
  做 ACME，必须由外部负载均衡/独立 ACME 方案处理，或经评审增加专用
  `/.well-known/acme-challenge/` 例外；不得恢复明文业务面。

## 3. TLS 与安全响应头

TLS 基线：`TLSv1.2` + `TLSv1.3`，关闭 session tickets，`server_tokens off`。

| 响应头 | 值/策略 |
|---|---|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `Content-Security-Policy` | `default-src 'self'`；允许同源 WASM/worker、`blob:` worker、`data:`/`blob:` 图片；`object-src 'none'`；`frame-ancestors 'none'`；`base-uri 'self'`；`form-action 'self'` |
| `X-Frame-Options` | `DENY`（旧客户端兜底） |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `X-Content-Type-Options` | `nosniff` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `X-Request-ID` | 客户端值必须匹配 `^[A-Za-z0-9._-]{8,128}$`，否则由 nginx `$request_id` 生成；透传所有上游并回显 |
| `Cache-Control` | `/api`、`/auth`、`/accesscontrol`、`/users`、`/files`、`/oauth`、`/webhooks`、`/imodels`、`/itwins`、`/ws`、`/ipc`、`/azurite` 与 `.html`/`.json` 路径一律 `no-store`；SPA 路由 HTML 与带哈希静态资源沿用上游静态层缓存头（发布候选需实测不缓存认证/API 响应） |

CSP 当前保留 `script-src 'unsafe-eval'` 以兼容 iTwin viewer 运行时；发布
候选必须在真栈回归后再评估收紧（去掉 `unsafe-eval`、收窄 `connect-src`）。
这不是“已完成安全加固”的声明，而是可验证的基线。

访问日志只记录 method/URI 和 request-id，**不记录查询串**，避免 signed tile
链接和 Azurite SAS 进入日志。

安全头写在 server 级。nginx 的 `add_header` 在 location 一旦出现就不再继承
server 级配置，因此 release 模板的 location 刻意不再写 `add_header`；缓存
策略通过 `map $uri $luban_cache_control` 在 server 级统一添加。

## 4. 对象存储与 signed tile 路径

release 中 `/azurite` **永不匿名**，这是与开发栈的关键差异：

| 路径 | 行为 |
|---|---|
| `= /azurite`、`= /azurite/` | `404` |
| `^/azurite/<account>/<imodel>/tiles/...` | 必须通过 `secure_link` 校验；缺失/伪造 `403`，过期 `410`，有效才代理到内部 Azurite |
| 其它 `^/azurite/...`（baseline blob、容器/虚拟目录列举、SAS 探测） | `404` |
| `^/tiles/`、`^/storage/`、`^/blob/` | `404`，禁止未来引入绕过签名面的别名 |

开发栈仍保留 `location /azurite/ { proxy_pass http://azurite:10000/; }`
（仅回环开发用）；release 模板没有任何裸 `proxy_pass` 到 Azurite，也没有
`rewrite ^/azurite/(.*)$ /$1 break;` 式的前缀剥除直通。

### 4.1 签名契约

tile URL 除了 Azurite SAS（`?sv=...&sig=...`）外，必须附带两个 edge 参数：

```text
edge_exp = Unix 秒（整数，过期时间）
canonical_uri = 不含查询串的规范化路径，例如
                /azurite/<account>/<imodel>/tiles/<tree>/<guid>/<content>
edge_sig = base64url(md5(edge_exp + canonical_uri + ":" + RELEASE_TILE_SIGNING_SECRET))
```

最终 URL 形如：

```text
https://<RELEASE_DOMAIN>/azurite/<account>/<imodel>/tiles/<tree>/<guid>/<content>
  ?sv=...&sig=...&edge_exp=<edge_exp>&edge_sig=<edge_sig>
```

签名方（Node）示例：

```js
import { createHash } from 'node:crypto';

const edgeExp = Math.floor(Date.now() / 1000) + 300; // 短 TTL
const canonicalUri = '/azurite/acct/imodel/tiles/tree/guid/content';
const edgeSig = createHash('md5')
  .update(`${edgeExp}${canonicalUri}:${process.env.RELEASE_TILE_SIGNING_SECRET}`)
  .digest('base64url');
```

要点：

- 冒号分隔符是**必需**的；没有它 nginx 会把 secret 首字符并入 `$uri` 变量名。
- `canonical_uri` 必须与 nginx 规范化后的 `$uri` 完全一致（无查询串、无
  百分号编码差异）。签名方必须先规范化再签。
- `secure_link` 不提供单次使用语义；用短 TTL（建议 60–300 秒）并把
  `edge_sig`/`edge_exp` 视为可重放的短期凭证。高安全场景应改用带
  单次 nonce 的认证网关。
- `RELEASE_TILE_SIGNING_SECRET` 会被 envsubst 注入 nginx 配置文本；只允许
  `[A-Za-z0-9_-]`。轮换必须同时更新 nginx 与签名方，先双写/灰度再吊销旧值。
- nginx `secure_link` 使用 MD5（模块限制）。它是过期链接门禁，不是抗碰撞
  签名方案；后续应评估 HMAC 认证网关或 mTLS/JWT `auth_request` 方案。

### 4.2 当前应用的 fail-closed 状态

前端 `MissAwareFetchCloudStorage` 仍按 iTwin 官方 `FetchCloudStorage` 语义
构造 URL：`baseUrl` + object key + Azurite SAS，**不会**自动追加
`edge_exp`/`edge_sig`。因此：

- 在私有 modeling-server/BFF 接入 tile URL 签名之前，release 的 tile
  读取会被 edge 以 `403` 拒绝（fail-closed），不会回退到匿名存储直取。
- 这是已知残余，不是静默降级。签名方属于私有仓工作：在 tile storage
  `getDownloadConfig`/URL 生成处对规范化路径签名，返回带 edge 参数的 URL；
  同时保证签名密钥与 nginx 输入同源、可轮换。
- 可接受的替代：在 edge 前放置认证网关（mTLS/JWT `auth_request`），由网关
  完成存储鉴权；此时仍必须保留“非 tile 存储路径 404”和默认拒绝，不得恢复
  匿名 `/azurite` 直通。

### 4.3 存储后端

release compose 的 Azurite 只在内部网络，不发布宿主端口。Azurite 是开发
模拟器，不是生产对象存储；工业发布应使用托管对象存储 + 私有端点/托管身份，
并让 edge 的 signed tile 面指向该存储或签名网关。对象存储不得直接暴露到
公网，也不得通过 nginx 提供匿名 SAS 代理。

## 5. Webhook-agent（WA）baseline/debug 残余暴露

本切片**不修改私有仓 WA 代码**，只固定 release 的暴露面并在本文件登记
残余。release compose 中 WA 不发布宿主端口，仅在 `stack` 网络内可达；edge
不路由到 WA。

| WA 路由 | 当前保护 | release 现状 | 残余 |
|---|---|---|---|
| `GET /health` | 无 | 内部网络 | 暴露 `pendingForwards` 计数；仅内部可达，但仍是无认证面 |
| `POST /webhook/events` | HMAC `WEBHOOK_SECRET` | 内部网络 | 正常平台回调面；需持续轮换密钥与验签监控 |
| `GET /webhook/events/recent`、`GET /webhook/events/:type`、`GET /forwarder/stats` | 共享 `X-API-Key`（`IMODELHUB_API_KEY`） | 内部网络 | 长寿命共享 bearer；任何持有该 key 的栈内组件可读取近期事件元数据和后端 URL |
| `POST /baseline/process` | `X-API-Key`（`BASELINE_TRIGGER_AUTH=service`） | release compose 固定 `service` | `off` 是迁移逃生口，release 不得使用；路由信任调用方传入的 `iModelId`/`iTwinId`/`sourceBlobPath`，**没有 job binding** |
| Hub baseline data-plane（baselinefile GET/POST/upload） | 默认 legacy：service-account JWT + 共享 `X-API-Key` | 未启用 service-token | 需要 Hub 注册的 signed service identity；token 失败不得回退共享 key |

必须由私有 WA/Hub 完成的残余（按优先级）：

1. **Signed service identity**：用短期 service token 或 mTLS 替代长寿命共享
   `X-API-Key`；固定 service name/audience/scope；密钥轮换与吊销；失败
   fail-closed，不静态回退。
2. **Job binding**：baseline 触发必须绑定签名 job 描述符（至少
   `jobId`、`iModelId`、`iTwinId`、tenant、`sourceBlobPath`、`expiresAt`、
   单次使用/幂等键），在 WA/Hub 校验签名、租户/ACL 和对象所有权；禁止仅凭
   调用方提交的路径/iModel 触发处理（confused deputy）。
3. **Enabling the service-token data plane**：Hub 侧注册 `webhook-agent`
   service client，WA 设置 `WEBHOOK_AGENT_DATA_PLANE_AUTH_MODE=service-token`
   与 `WEBHOOK_AGENT_SERVICE_CLIENT_SECRET`；release profile 再把对应 secret
   纳入 `requiredInputs`，当前未启用，故 legacy 模式仍是残余。
4. **Debug 面收敛**：release 移除或管理员鉴权化 `/webhook/events/recent`、
   `/webhook/events/:type`、`/forwarder/stats`；`/health` 只保留最小存活信息。
5. **CORS**：WA 代码中 `allowedOrigins: ['*']` 是硬编码遗留；release 应改为
   显式 `https://<domain>`（或仅服务端调用，不启用浏览器跨域）。
6. **审计/告警**：对 baseline 触发、401/403、token 获取失败和异常
   `sourceBlobPath` 建立审计与告警。

在上述工作完成前，release 的 WA 暴露面只能依赖“无宿主端口 + 内部网络 +
共享 key + HMAC”这一层，**不得**把 baseline/debug 面经 nginx 暴露到公网。
任何 release override 也不得把 `BASELINE_TRIGGER_AUTH` 重设为 `off`；该值在
`docker-compose.release.yml` 中固定为 `service`，这是 release 的硬约束。

## 6. 开发兼容性

- `docker-compose.yml` 与 `deploy/default.conf.template` **未改**：开发仍是
  nginx `0.0.0.0:5301:80`、无证书、`/azurite` 匿名回环代理。
- `quickstart.ps1`/`generate-env.ps1` 不需要证书；本地开发者不需要 TLS。
- release 的证书/域名/tile secret 只出现在 `docker-compose.release.yml` 和
  `deploy/release/*`；dev compose 不引用它们。
- 如果本地需要 TLS，请使用不被提交的 `docker-compose.override.yml` 或独立
  profile，不要把证书要求加进开发 compose。
- 静态测试 `scripts/test/release-edge.test.mjs` 会断言上述 dev 不变量，防止
  后续改动把 release 的 TLS/存储门禁误带进开发路径。

## 7. 校验

静态与策略：

```bash
node --test scripts/test/release-edge.test.mjs
node --test scripts/test/release-images.test.mjs
node --test scripts/test/check-release-hygiene.test.mjs
node scripts/render-release-images.mjs --manifest release-manifest.json --check
node scripts/check-release-hygiene.mjs --mode release \
  --manifest release-manifest.json --expected-source-commit <sha> --expected-tag <tag>
```

compose 渲染（需要真实 secret store/env 与镜像 digest）：

```bash
docker compose -f docker-compose.release.yml \
  --env-file deploy/release/release.env \
  --env-file deploy/release/release-images.env config --quiet
```

nginx 语法（在真实证书就位后、启动前）：

```bash
docker compose -f docker-compose.release.yml \
  --env-file deploy/release/release.env \
  --env-file deploy/release/release-images.env run --rm --no-deps nginx nginx -t
```

运行时探针（发布候选）：

```bash
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' http://<edge>/
# 期望 308 https://<RELEASE_DOMAIN>/...
curl -ksS -D - -o /dev/null https://<edge>/healthz
# 期望 204 + HSTS/CSP/XFO/Referrer-Policy/X-Request-ID
curl -ksS -o /dev/null -w '%{http_code}\n' https://<edge>/azurite/a/i/tiles/t/c
# 期望 403（未签名）
curl -ksS -o /dev/null -w '%{http_code}\n' https://<edge>/azurite/a/i/baseline/f
# 期望 404（非 tile 存储路径）
```

本仓测试不生成真实证书、不访问网络、不启动 Docker；上述容器/运行时检查
由发布环境执行并写入发布记录。

## 8. 残余与人类决策

- **真实证书/域名/CA**：必须由发布 owner 提供；仓库内不得出现 PEM。证书
  续期、OCSP/CRL、密钥托管与轮换流程需在 secret store/证书管理系统中固化。
- **HSTS preload**：默认不提交 preload；是否加入、域名/子域清单、回滚窗口
  是发布 owner 决策。
- **对外绑定与传输层防护**：`RELEASE_EDGE_BIND` 默认仅回环；公网暴露前需
  决定外部 LB/WAF/DDoS/限流（当前 edge 未内置 `limit_req`），并确认 TLS
  终止位置（edge 还是外部 LB）。
- **tile 签名方**：如上，私有 modeling-server/BFF 尚未生成 `edge_exp`/
  `edge_sig`；在此之前 release tile 读取 fail-closed。签名密钥轮换、TTL
  策略、403/410 监控需与 edge 同步。
- **MD5 `secure_link`**：仅作过期门禁；后续评估 HMAC 签名网关、单次 nonce、
  mTLS/JWT `auth_request`。
- **CSP 收紧**：当前保留 `unsafe-eval` 以兼容 viewer；需在真栈 e2e 后评估
  去掉并收窄 `connect-src`/`worker-src`。
- **WA signed service identity / job binding**：见第 5 节；在私有仓完成前，
  WA baseline/debug 面仍是共享 key + 调用方自报 ID 的残余，release 只保证
  不经 edge 暴露、不发布宿主端口、`BASELINE_TRIGGER_AUTH=service`。
- **Secret 注入可见性**：`RELEASE_TILE_SIGNING_SECRET` 需要作为 nginx 容器
  环境变量供 envsubst 使用，因此对能读取容器配置的主体可见；生产应限制
  Docker API/宿主访问并纳入轮换。证书/私钥本身只读挂载，不进入镜像。
- **对象存储后端**：Azurite 仅开发模拟器；生产托管存储/私有端点/托管身份
  替换仍是发布决策。

本文件与 `scripts/test/release-edge.test.mjs` 只证明配置契约与静态不变量，
不证明真实证书、真实栈或真实发布已通过。
