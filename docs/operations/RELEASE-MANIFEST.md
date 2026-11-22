# Release manifest（G1 J3.1/J3.2）

`scripts/release-manifest.mjs` 是**发布清单的构建器/校验器**，不是发布门：
它不调用 docker/gh；除显式 `verify-runtime` 对调用方指定的运行时 URL 发一次
GET 外不访问网络，也不替代 `scripts/release-gate.ps1` 或
`scripts/verify-stack.ps1`。真实发布仍以发布门 + 全栈验收为准。

- 工具：`scripts/release-manifest.mjs`（Node ESM，无第三方依赖）
- Schema：`docs/architecture/release-manifest.schema.json`（JSON Schema draft 2020-12）
- 示例：`scripts/fixtures/release-manifest.example.json`
- 测试：`scripts/release-manifest.test.mjs`（`node:test`）

## 清单字段

| 字段 | 必填 | 说明 |
|---|---|---|
| `schemaVersion` | 是（构建时缺省为 1） | 固定 `1` |
| `tag` | 是 | 发布 tag，如 `backend-20261122`；拒绝 `latest`（大小写不敏感） |
| `sourceCommit` | 是 | 40-hex（SHA-1）或 64-hex（SHA-256）git commit |
| `builtAt` | 构建时缺省为当前时间 | 带时区的 ISO-8601 时间 |
| `contractVersion` | 是 | `LubanFeatureRpcInterface.interfaceVersion`（`MAJOR.MINOR.PATCH`，当前 1.85.0） |
| `images` | 是（至少 1 项） | `{name, digest}`；`name` 不得含 `:latest`，名称唯一 |
| `sbomDigest` | 否 | `sha256:<64 hex>` 或裸 64-hex |
| `nativeProvenance` | 否 | `{path, sha256}`，指向 native provenance 文件并记录其哈希 |

构建输出会规范化：digest 统一为 `sha256:<小写 hex>`，`sourceCommit` 转小写，
`images` 按 `name` 排序；相同输入输出逐字节一致（仅未提供 `builtAt` 时使用当前时间）。

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
  --sbom-digest <64 hex> \
  --native-provenance dist-backend/modeling-server/node_modules/@bentley/imodeljs-native/native-provenance.json \
  --native-provenance-sha256 <64 hex> \
  --out release-manifest.json
```

不传 `--out` 时清单写到 stdout。`--input` 不能与其他字段参数混用。

## 校验

```bash
node scripts/release-manifest.mjs verify --file scripts/fixtures/release-manifest.example.json
# release manifest OK: backend-20261122 (4 image(s), source b92a2d8fa4cf, contract 1.85.0)

node scripts/release-manifest.mjs verify \
  --file release-manifest.json \
  --expected-source-commit <40/64-hex> \
  --expected-contract-version 1.85.0
```

校验内容：必填字段与类型、digest 格式、`latest` 拒绝、镜像名唯一、
未知字段拒绝，以及可选的源 commit / 契约版本一致性。
退出码：`0` 通过，`1` 清单字段/结构无效，`2` 用法错误（含清单文件不可读/
非法 JSON）。

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
```

覆盖：合法构建/校验、缺必填字段、坏 digest、`latest` 拒绝、源 commit 与契约
版本不匹配；`verify-runtime` 的一致性/不匹配/接口选择/版本冲突/非法 JSON/
HTTP 失败/连接失败/超时/用法错误，全部使用 `127.0.0.1` 回环 HTTP 服务，无外部
网络。

## CI 集成点（待接线）

1. 镜像推送完成后，从发布输出收集 `name`/`digest`，生成清单并作为 Release 资产归档。
2. 发布前用 `verify --expected-source-commit <pipeline commit>` 和
   `--expected-contract-version <pinned>` 阻断错版/漂移。
3. J3.2 运行时契约对账已实现（`verify-runtime`：manifest ↔ `/rpc/metadata`）；
   镜像 OCI label 的 commit/digest 对账仍需 CI 侧接线（本工具不调用 docker/gh）。
4. 仍需补齐：SBOM 生成与签名、provenance/attestation 签名、清单自身签名及
   Release 上传自动化；本工具只负责清单结构与一致性校验。
