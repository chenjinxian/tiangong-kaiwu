# Release manifest（G1 J3.1/J3.2）

`scripts/release-manifest.mjs` 是**发布清单的构建器/校验器**，不是发布门：
它不调用 docker/gh；除显式 `verify-runtime` 对调用方指定的运行时 URL 发一次
GET 外不访问网络，也不替代 `scripts/release-gate.ps1` 或
`scripts/verify-stack.ps1`。真实发布仍以发布门 + 全栈验收为准。

## Release hygiene（G1 J3.3）

`scripts/check-release-hygiene.mjs` 是发布前的静态卫生门（Node ESM，无第三方
依赖；不联网、不调用 docker/gh）。它把易在本地全绿、但会阻断工业发布的风险
变成明确的 FAIL：

| 检查 | 失败条件 |
|---|---|
| `images.pinned` | compose/Dockerfile/发布脚本出现 `:latest`、无 tag（隐式 latest）、或 tag 变量无 pinned 默认值 |
| `release.profile` | release 模式缺 `docker-compose.release.yml` 或 `deploy/release/release-profile.json`；release compose 使用字面 image/默认值/未在 profile 声明的 `RELEASE_*_IMAGE`；非 edge 服务发布宿主端口；edge 端口无显式 host bind；使用 `build:`；敏感环境变量不是无默认值的 `RELEASE_*` 必填变量；必填输入未在 profile 登记；release profile 引用的镜像在 manifest 中无 digest |
| `build.scripts` | 发布/构建脚本硬编码宿主绝对路径、依赖 native pnpm store 回退、`tsc --noCheck`、或 `npm install` / 无 `--frozen-lockfile` 的 pnpm 安装 |
| `contract.shipped` | `dist-backend` 产物内 `LubanFeatureRpcInterface.interfaceVersion` 与公开源不一致（例如 1.64.0 vs 1.85.0） |
| `provenance.public` | 公开产物 `native-provenance.json` 泄漏宿主绝对路径/私有 native commit 等内部证据 |
| `manifest.release` | release 模式缺 `release-manifest.json`/`nativeProvenance`/`dist-backend`；缺文件型 release evidence（至少一个 `sbom`、一个 `signature` 或 `attestation`、一个 `provenance`）；tag、sourceCommit、native/artifact/evidence digest 不一致；release profile 引用的镜像没有清单 digest |
| `secrets.defaults` | release 配置出现弱默认密码/JWT、Azurite well-known key、或 provider token |

模式：

- `local` / `ci`：应用 `scripts/release-hygiene-waivers.json` 中 `scope=local`
  的已登记开发债；缺 `dist-backend`/manifest 记为 skipped。开发 compose
  （`docker-compose.yml`）、`.env.example`、`quickstart.ps1`/`generate-env.ps1`
  仍属本地开发面，在本模式审计。
- `release`：**忽略全部 waiver**；要求 `dist-backend`、`release-manifest.json`/
  native provenance、文件型 SBOM/签名或 attestation/provenance evidence、
  release compose/profile 在场，并默认重算 artifact/evidence digest。
  `scripts/release-gate.ps1` 以该模式调用；缺 manifest 不再 WARN 放行。
  开发 compose、`.env.example` 与 `quickstart.ps1`/`generate-env.ps1` 不是
  release 配置：release 模式把它们报告为 skipped，避免开发默认值（例如
  `HUB_DATABASE_PASSWORD:-secret`、`maildev:latest`）被误当成发布输入，
  也避免发布门被开发脚本永久卡红。发布打包脚本（`fetch-backend.ps1`、
  `rebuild-web.ps1`、`make-deploy-bundle.ps1`）、workflow、Dockerfile、release
  compose/profile 与 manifest 仍在 release 审计范围内。

发布打包脚本的镜像 tag 口径：`rebuild-web.ps1` 的本地兼容别名由 `-LocalTag`
控制（缺省 latest，仅本地 verify-stack/回滚使用）；发布推送必须显式
`-ReleaseTag <不可变 tag|sha256:digest>`，latest 被拒绝，脚本只准备本地 tag
并打印 push 命令。`make-deploy-bundle.ps1` 要求显式 `-ImageTag`（无缺省），
缺省即发布口径（要求显式 `-Tag` 且拒绝 latest），只有 `-LocalDev` 才允许
latest 与日期缺省 Tag。两者仍会引用公开 GHCR 仓库名，
release manifest 必须为 `luban-web-public`/`luban-bff-public`/
`imodelhub-public`/`luban-webhook-agent-public` 提供 digest，否则
`manifest.release` fail closed。

## Release profile（docker-compose.release.yml）

工业发布不使用开发 compose。`docker-compose.release.yml` 是独立 profile
（不会被 `docker compose` 自动加载），与开发栈的差异是硬约束：

- 每个 `image:` 必须是 `${RELEASE_*_IMAGE:?message}`，由
  `scripts/render-release-images.mjs` 从 `release-manifest.json` 解析为
  `<name>@sha256:<digest>`；compose 中没有可静默回落到 `:latest` 的默认值。
- 每个密钥必须是无默认值的 `${RELEASE_*:?message}`；开发 `.env` 的
  `HUB_DATABASE_PASSWORD` 等名字无法满足 release profile（变量名刻意隔离）。
- 只有 `nginx`（edge）发布宿主端口：HTTP `:80` 只做 308 跳转、HTTPS `:443`
  承载业务（默认仅绑 `127.0.0.1`，可用 `RELEASE_EDGE_BIND`/
  `RELEASE_EDGE_HTTP_PORT`/`RELEASE_EDGE_HTTPS_PORT` 显式覆盖）；
  postgres/redis/azurite/imodelhub/webhook-agent/bff/web 只在内部网络可达。
- edge 使用 release 专用 `deploy/release/nginx.conf` +
  `deploy/release/nginx-tls.conf.template`，不使用开发的 HTTP
  `deploy/default.conf.template`。`RELEASE_DOMAIN`、
  `RELEASE_TLS_CERT_FILE`、`RELEASE_TLS_KEY_FILE`、
  `RELEASE_TILE_SIGNING_SECRET` 是必填输入；证书/私钥只读挂载，仓库不得含
  PEM。安全头、request-id、signed tile 与 WA 残余暴露见
  `docs/operations/RELEASE-EDGE.md`。
- `/azurite` 在 release 永不匿名：非 tile 存储路径 404，tile blob 必须携带
  `edge_exp`/`edge_sig`（nginx `secure_link`），否则 403/410。签名方接入前
  release tile 读取 fail-closed，不得恢复匿名直通。
- 禁止 `build:`；发布只消费已发布镜像与 release manifest 中的 digest。
- `RELEASE_MS_UPSTREAM` 必须显式提供；不再默认 `host.docker.internal:5401`。
  modeling-server 仍是宿主进程（native/link: 依赖不能入 Linux 容器），将其
  变为可 pin 的发布产物是私有仓待办。

必填输入清单在 `deploy/release/release-profile.json`（只有变量名，不含密钥
值），其中 edge 相关输入为 `RELEASE_DOMAIN`、`RELEASE_TLS_CERT_FILE`、
`RELEASE_TLS_KEY_FILE`、`RELEASE_TILE_SIGNING_SECRET`。镜像变量与必填输入的
对应关系是：

```bash
# 1) 从真实 manifest 生成镜像 env（digest 只能来自 registry 侧/构建输出）
node scripts/render-release-images.mjs \
  --manifest release-manifest.json \
  --out deploy/release/release-images.env

# 2) 提供运维 env（密钥、SMTP、MS endpoint、origin、edge bind；不得复用开发 .env）
#    例：deploy/release/release.env（gitignored，由 secret store/KMS 注入）

# 3) 渲染必须成功（缺失/弱默认/未声明输入会失败），再启动
docker compose -f docker-compose.release.yml \
  --env-file deploy/release/release.env \
  --env-file deploy/release/release-images.env config --quiet
docker compose -f docker-compose.release.yml \
  --env-file deploy/release/release.env \
  --env-file deploy/release/release-images.env up -d
```

`render-release-images.mjs` 同时校验 profile/compose 策略（unmapped image、
literal image、非 edge 端口、默认密钥、未声明必填输入），并拒绝没有 manifest
digest 的镜像；`--check` 不写文件。生成的 `release-images.env` 只含镜像引用，
不含任何密钥；`.gitignore` 已忽略 `deploy/release/*.env`。

```bash
# 本地/CI（waiver 生效）
node scripts/check-release-hygiene.mjs --mode ci --format markdown

# 发布门（waiver 全部忽略；需真实产物与清单）
node scripts/check-release-hygiene.mjs --mode release \
  --manifest release-manifest.json \
  --expected-source-commit <40/64-hex> --expected-tag backend-YYYYMMDD

# 发布 owner 本地只读审计私有后端（产物不在公开 CI；不修改私有仓）
node scripts/check-release-hygiene.mjs --mode local \
  --backend-root ../luban-backend --format text
```

`--backend-root` 只读扫描 `scripts/{build-ms-dist,build-images,publish}.ps1`
与私有 `.github/workflows/ci.yml`，输出文件前缀为 `backend/`；公开 CI 永不使用
该参数，因此私有路径/证据不会进入公开流水线。

退出码：`0` 通过；`1` 存在未豁免 error；`2` 用法/配置错误（含非法 waiver
文件）。waiver 只用于本地/CI 开发债，必须有 `file`、`reason` 与 `expires`；
过期 waiver 不再覆盖违规并产生 `waivers.expired` 警告。release 模式永不读取
waiver，因此任何 release 违规都必须真正修复，不能以 waiver 放行。

`release-gate.ps1` 已把 hygiene 作为第 0 步接入，并在第 5b 步执行
`render-release-images.mjs --check`（manifest digest -> release compose 镜像
解析）；public CI 以 `--mode ci` 运行 checker 并执行
`node --test scripts/test/check-release-hygiene.test.mjs`、
`node --test scripts/test/release-script-tags.test.mjs`、
`node --test scripts/test/release-evidence.test.mjs`、
`node --test scripts/test/release-images.test.mjs` 与
`node --test scripts/test/release-edge.test.mjs`（TLS 证书/私钥/域名/tile
密钥必填、仅 edge 端口、`/azurite` 非匿名、dev compose 无证书回归）。
`release-script-tags.test.mjs` 静态校验真实脚本无字面浮动 tag，并在有
PowerShell 时用 `-PlanOnly` 执行参数校验（latest 拒绝、不可变 tag/digest
接受），不调用 Docker/网络。


J3.1g 起支持**实际文件字节校验**（`verify-files`）：清单声明的
`nativeProvenance`、`artifacts[]` 与 `evidence[]` 会用本地文件重新计算 SHA-256
并与声明值比较，不再只校验“digest 字符串格式”。`evidence[]` 覆盖 SBOM、
签名、attestation 与 provenance 文件；本工具只证明“声明的本地文件存在且字节
哈希一致”，**不**解析 SBOM、不验签、不校验证书身份或镜像绑定。镜像 registry
digest、OCI label、SBOM 生成/签名与签名身份仍属外部发布环境职责（见文末
「CI/发布门集成现状」）。

- 工具：`scripts/release-manifest.mjs`（Node ESM，无第三方依赖）
- Schema：`docs/architecture/release-manifest.schema.json`（JSON Schema draft 2020-12）
- 示例：`scripts/fixtures/release-manifest.example.json`（**仅结构 fixture**；digest 为占位值，
  `verify-files` 对它会失败；它也**刻意不含 `evidence[]`**，因此
  `--require-release-evidence` 会失败——真实发布必须用 registry/构建输出与真实
  evidence 文件替换/补齐，不得手写占位 digest 或伪造 SBOM/签名）
- 测试：`scripts/release-manifest.test.mjs` 与
  `scripts/test/release-evidence.test.mjs`（`node:test`）

## 清单字段

| 字段 | 必填 | 说明 |
|---|---|---|
| `schemaVersion` | 是（构建时缺省为 1） | 固定 `1` |
| `tag` | 是 | 发布 tag，如 `backend-20261122`；拒绝 `latest`（大小写不敏感） |
| `sourceCommit` | 是 | 40-hex（SHA-1）或 64-hex（SHA-256）git commit |
| `builtAt` | 构建时缺省为当前时间 | 带时区的 ISO-8601 时间 |
| `contractVersion` | 是 | `LubanFeatureRpcInterface.interfaceVersion`（`MAJOR.MINOR.PATCH`，当前 1.85.0） |
| `images` | 是（至少 1 项） | `{name, digest}`；`name` 不得含 `:latest`，名称唯一 |
| `sbomDigest` | 否 | 旧版单值字段：`sha256:<64 hex>` 或裸 64-hex（只校验格式）。**不足以满足 release evidence 策略**；发布必须用文件型 `evidence[]`（`kind: "sbom"`），否则无法重算字节 |
| `nativeProvenance` | 否（schema）；发布策略必填 | `{path, sha256}`，指向 native provenance 文件并记录其哈希；含 backend/native 产物的发布必须用 `--require-native-provenance` 强制要求 |
| `artifacts` | 否 | `[{path, sha256}]`，发布产物实际文件及其 SHA-256；`verify-files` 会重算字节 |
| `evidence` | 否（schema）；发布策略必填 | `[{kind, path, sha256}]`，本地 release evidence 文件；`kind` 只能是 `sbom`、`signature`、`attestation`、`provenance`。`--require-release-evidence` 要求至少一个 `sbom`、一个 `signature` 或 `attestation`、一个 `provenance`；`verify-files` 重算每个文件字节。工具不解析内容、不验签、不校验证书身份 |

构建输出会规范化：digest 统一为 `sha256:<小写 hex>`，`sourceCommit` 转小写，
`images` 按 `name` 排序、`artifacts` 按 `path` 排序、`evidence` 先按 `kind` 再按
`path` 排序；相同输入输出逐字节一致（仅未提供 `builtAt` 时使用当前时间）。
`artifacts`/`evidence` 为空数组会被拒绝；省略该键等价于“未声明文件产物/
evidence”。

## 构建

从 JSON 输入文件（字段同上，`schemaVersion`/`builtAt` 可省略）：

```bash
node scripts/release-manifest.mjs build \
  --input scripts/fixtures/release-manifest.example.json \
  --out release-manifest.json
```

或全部用 CLI 参数（`--image` 可重复）：

```bash
node scripts/release-manifest.mjs build \
  --tag backend-20261122 \
  --source-commit b92a2d8fa4cf4ba5e3a01415edd956ff3622adb8 \
  --built-at 2026-11-22T00:00:00.000Z \
  --contract-version 1.85.0 \
  --image ghcr.io/chenjinxian/luban-web-public=sha256:<64 hex> \
  --image ghcr.io/chenjinxian/luban-bff-public=<64 hex> \
  --artifact dist-out/luban-cad-deploy-backend-20261122.zip \
  --evidence sbom=release/sbom/luban-web-public.spdx.json \
  --evidence signature=release/sig/luban-web-public.sig \
  --evidence attestation=release/att/luban-web-public.intoto.jsonl \
  --evidence provenance=release/prov/backend.provenance.json \
  --sbom-digest <64 hex> \
  --native-provenance dist-backend/modeling-server/node_modules/@bentley/imodeljs-native/native-provenance.json \
  --native-provenance-sha256 <64 hex> \
  --out release-manifest.json
```

`--artifact <path>` 与 `--evidence <kind>=<path>` 均可重复，**读取实际文件字节**
计算 SHA-256 后写入 `artifacts[]`/`evidence[]`；不接受调用方声明的 digest。
`kind` 只能是 `sbom`、`signature`、`attestation`、`provenance`。文件不可读或
`kind` 非法为用法错误（exit `2`）。`--native-provenance` 仍要求与
`--native-provenance-sha256` 成对提供（声明值由发布方从 provenance 生成记录
取得；`verify-files` 稍后核对实际字节）。

不传 `--out` 时清单写到 stdout。`--input` 不能与其他字段参数混用。

## 校验

```bash
node scripts/release-manifest.mjs verify --file scripts/fixtures/release-manifest.example.json
# release manifest OK: backend-20261122 (4 image(s), source b92a2d8fa4cf, contract 1.85.0)

node scripts/release-manifest.mjs verify \
  --file release-manifest.json \
  --expected-source-commit <40/64-hex> \
  --expected-contract-version 1.85.0 \
  --require-native-provenance \
  --require-release-evidence
```

校验内容：必填字段与类型、digest 格式、`latest` 拒绝、镜像名唯一、
`artifacts`/`evidence` 路径/重复/未知字段拒绝、未知字段拒绝，以及可选的源
commit / 契约版本一致性。`--require-native-provenance` 按发布策略要求
`nativeProvenance` 必须存在（当前所有含 modeling-server/native 产物的发布都应
带此参数）。`--require-release-evidence` 要求 `evidence[]` 至少包含一个
`sbom`、一个 `signature` 或 `attestation`、一个 `provenance`；两个策略参数
缺省时保持 schema 级可选，避免破坏本地/CI 仅做结构校验的旧调用。发布门与
release hygiene 的 release 模式自动带上这些策略。
退出码：`0` 通过，`1` 清单字段/结构无效或策略要求缺失，`2` 用法错误（含清单
文件不可读/非法 JSON）。

## 文件字节校验（G1 J3.1g）

```bash
node scripts/release-manifest.mjs verify-files \
  --file release-manifest.json \
  --root . \
  --require-native-provenance \
  --require-release-evidence
# file OK: nativeProvenance dist-backend/.../native-provenance.json (sha256:...)
# file OK: artifacts[0] dist-out/luban-cad-deploy-backend-20261122.zip (sha256:...)
# file OK: evidence[0] (sbom) release/sbom/luban-web-public.spdx.json (sha256:...)
# release manifest files OK: 3 file(s) match declared SHA-256
```

行为：

- 先按 `verify` 规则校验清单结构、native 策略与 release evidence 策略，再对
  `nativeProvenance.path`、每个 `artifacts[].path` 与每个 `evidence[].path`
  读取本地文件、重新计算 SHA-256，与声明值逐字节比较。
- 相对路径按 `--root` 解析（缺省当前工作目录）；绝对路径原样使用。发布记录
  建议从仓根执行并显式 `--root .`。
- **没有任何文件条目**（无 `nativeProvenance`、无 `artifacts[]` 且无
  `evidence[]`）时退出 `1`，拒绝“空校验假绿”。
- 文件缺失/不可读/字节不符 → `1`，逐条打印标签、路径、声明值与实际值；
  用法错误 → `2`。
- 本命令**不**校验 `images[].digest`（registry 侧 digest）、镜像 OCI label，
  不解析 SBOM/attestation 内容、不验签、不校验证书身份或镜像绑定，也不访问
  网络/docker。这些必须在发布环境另行核对并写入发布记录。`sbomDigest` 是
  旧版单值字段，不参与文件字节校验；release evidence 必须使用 `evidence[]`。
- `scripts/release-gate.ps1 -ManifestPath <file> -VerifyManifestFiles` 已接入本
  命令（并附带 `--require-native-provenance --require-release-evidence`）；
  未提供 `-ManifestPath` 时默认仓根 `release-manifest.json`，缺失即 FAIL，
  不伪造清单。

## 运行时契约对账（G1 J3.2）

```bash
node scripts/release-manifest.mjs verify-runtime \
  --file release-manifest.json \
  --base-url http://localhost:5401
# release manifest runtime OK: LubanFeatureRpcInterface 1.85.0 matches manifest backend-20261122 at http://localhost:5401/rpc/metadata
```

行为：

- 只发一次无鉴权的 `GET <base-url>/rpc/metadata`；`--base-url` 已以
  `/rpc/metadata` 结尾时原样使用。默认超时 5 s，可用
  `--timeout-ms <1..60000>` 调整。
- modeling-server 的 `/rpc/metadata` 返回 OpenAPI 3.0 描述；每个操作路径的
  最后一段是 `LubanFeatureRpcInterface-<x.y.z>-<operation>`（由
  `RpcInterface.interfaceVersion` 生成）。工具从 `paths` 末段提取运行时
  `interfaceVersion`，与清单 `contractVersion` 比较。
- `--interface <name>` 指定对账接口，缺省 `LubanFeatureRpcInterface`（即
  `contractVersion` 的定义来源）。接口名大小写敏感。
- 同一接口在元数据中出现多个版本、`paths` 缺失/为空、没有可解析的 RPC 操作、
  响应不是合法 JSON，都按无效元数据退出 `1`。
- 当前 `/rpc/metadata` **不暴露源 commit**，因此本模式不做源 commit 对账
  （不臆造字段）。源 commit 仍用 `verify --expected-source-commit` 对清单自身
  校验；镜像 OCI label 的 commit/digest 对账需 CI 侧另行接线（本工具不调用
  docker/gh）。
- 输出只含接口名、版本和去掉 query/hash 的 endpoint；不打印响应正文、
  Authorization/cookie 或 URL 查询串。`--base-url` 含账号密码会被拒绝。

退出码区分：

| 码 | 含义 |
|---|---|
| `0` | 运行时接口版本与清单 `contractVersion` 一致 |
| `1` | 清单字段/结构无效；或运行时元数据无效/不一致（非法 JSON、缺 `paths`、无 RPC 操作、接口缺失、版本冲突、版本不匹配） |
| `2` | 用法错误（缺参数、坏 URL/超时值、含凭据的 URL、清单文件不可读/非法 JSON）；或网络/HTTP 失败（连接失败、超时、非 2xx、响应读取失败） |

CI 集成建议：

1. 启动候选栈（或至少 modeling-server）后，先跑 `verify --file <manifest>`
   校验清单结构，再跑 `verify-runtime --file <manifest> --base-url <runtime>`。
2. 两者都以非零退出码阻断发布；脚本/流水线应把 `1`（清单或契约漂移）和
   `2`（用法或运行时不可达）分开告警，便于定位。
3. 对网络抖动可用 `--timeout-ms` 和有限次重试包裹；重试仍失败按 `2` 处理。
4. 同一份 `release-manifest.json` 作为 Release 资产归档。镜像 OCI label 与
   源 commit 的三方对账仍需 CI 侧补齐（依赖 docker/registry 访问，不在本工具
   范围内）。

## 测试

```bash
node --test scripts/release-manifest.test.mjs
node --test scripts/test/release-evidence.test.mjs
```

覆盖：合法构建/校验、缺必填字段、坏 digest、`latest` 拒绝、源 commit 与契约
版本不匹配；`--artifact` 实际字节哈希、`verify-files` 的字节一致/篡改/缺文件/
声明不符/空文件集、`--require-native-provenance` 策略、`artifacts` 结构拒绝与
用法错误；`verify-runtime` 的一致性/不匹配/接口选择/版本冲突/非法 JSON/
HTTP 失败/连接失败/超时/用法错误（全部使用 `127.0.0.1` 回环 HTTP 服务，无外部
网络）；`evidence[]` 的构建字节哈希/确定性排序、kind/未知字段/重复路径/空数组/
坏 digest 拒绝、`--evidence` 用法错误、`--require-release-evidence` 的三类
策略缺失/attestation 替代 signature、`verify-files` 对 evidence 的字节一致/
篡改/缺文件/与 native/artifacts 合并计数。用例数随代码变化，以 `node --test`
实际运行为准，禁止沿用历史计数。

## CI/发布门集成现状

已接入：

1. `scripts/release-gate.ps1` 支持可选 `-ManifestPath <file>` 与
   `-VerifyManifestFiles`：前者强制执行
   `verify --require-native-provenance --require-release-evidence`，后者追加
   `verify-files --root <repo> --require-native-provenance
   --require-release-evidence`。未提供 `-ManifestPath` 时默认仓根
   `release-manifest.json`（缺失即 FAIL，不生成假清单）。可选 `-BackendRoot`
   以 release 模式只读审计私有仓 `build-ms-dist/build-images/publish` 脚本。
2. public CI（`.github/workflows/ci.yml`）运行本工具全部 `node:test` 用例、
   release hygiene/profile/evidence 测试与 J1.2 契约门；CI 不生成真实 release
   manifest（无真实镜像/registry/evidence 环境）。
3. 发布前用 `verify --expected-source-commit <pipeline commit>` 和
   `--expected-contract-version <pinned>` 阻断错版/漂移；J3.2 的
   `verify-runtime` 可与 `/rpc/metadata` 对账。
4. `scripts/check-release-hygiene.mjs --mode release` 要求 release compose/
   profile 存在，把每个 profile 镜像与 manifest digest 对齐，并要求
   `release-manifest.json`、native provenance 与文件型 release evidence
   （sbom + signature/attestation + provenance）；`--mode ci` 只审计开发面并
   应用本地 waiver。`scripts/test/check-release-hygiene.test.mjs`、
   `scripts/test/release-images.test.mjs` 与
   `scripts/test/release-evidence.test.mjs` 覆盖 unpinned image、默认密钥、
   非 edge 端口、缺失 manifest/native provenance/evidence、evidence 字节
   篡改/缺文件、契约 skew、dev/release 配置隔离与 renderer 的 fail-closed 行为。

仍需外部发布环境补齐（**不得伪造**）：

1. 镜像推送后从发布输出收集真实 `name`/`digest`（registry 侧 digest，不是本地
   `docker inspect` 声明），生成清单并作为 Release 资产归档。
2. 镜像 OCI label（`org.opencontainers.image.revision` 等）与清单
   `sourceCommit`/digest 的三方对账；本工具不调用 docker/gh。
3. SBOM 生成与签名、签名/attestation 的 cryptographically verify、证书身份与
   镜像 digest 绑定；本工具只核对声明的本地 evidence 文件字节，不解析格式、
   不验签、不证明 evidence 与镜像/commit 的语义绑定。
4. provenance attestation 的生成与签名身份（builder identity、subject digest）
   核对；`evidence[] kind=provenance` 只证明文件存在与哈希一致。
5. 清单自身签名、Release 上传自动化、发布记录归档。
6. 真实发布清单未创建、真实 digest/evidence 未填写前，本工具只证明“清单结构
   与本地文件字节一致”，不证明发布就绪。
