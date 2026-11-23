# Release manifest（G1 J3.1/J3.2）

`scripts/release-manifest.mjs` 是**发布清单的构建器/校验器**，不是发布门：
它不调用 docker/gh；除显式 `verify-runtime` 对调用方指定的运行时 URL 发一次
GET 外不访问网络，也不替代 `scripts/release-gate.ps1` 或
`scripts/verify-stack.ps1`。真实发布仍以发布门 + 全栈验收为准。

J3.1g 起支持**实际文件字节校验**（`verify-files`）：清单声明的
`nativeProvenance` 与 `artifacts[]` 会用本地文件重新计算 SHA-256 并与声明值
比较，不再只校验“digest 字符串格式”。镜像 registry digest、OCI label、SBOM
生成/签名仍属外部发布环境职责（见文末「CI/发布门集成现状」）。

- 工具：`scripts/release-manifest.mjs`（Node ESM，无第三方依赖）
- Schema：`docs/architecture/release-manifest.schema.json`（JSON Schema draft 2020-12）
- 示例：`scripts/fixtures/release-manifest.example.json`（**仅结构 fixture**；digest 为占位值，
  `verify-files` 对它会失败——真实发布必须用 registry/构建输出替换所有 digest）
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
| `sbomDigest` | 否 | `sha256:<64 hex>` 或裸 64-hex（只校验格式；SBOM 文件生成/签名在外部） |
| `nativeProvenance` | 否（schema）；发布策略必填 | `{path, sha256}`，指向 native provenance 文件并记录其哈希；含 backend/native 产物的发布必须用 `--require-native-provenance` 强制要求 |
| `artifacts` | 否 | `[{path, sha256}]`，发布产物实际文件及其 SHA-256；`verify-files` 会重算字节 |

构建输出会规范化：digest 统一为 `sha256:<小写 hex>`，`sourceCommit` 转小写，
`images` 按 `name` 排序、`artifacts` 按 `path` 排序；相同输入输出逐字节一致
（仅未提供 `builtAt` 时使用当前时间）。`artifacts` 为空数组会被拒绝；省略该键
等价于“未声明文件产物”。

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
  --sbom-digest <64 hex> \
  --native-provenance dist-backend/modeling-server/node_modules/@bentley/imodeljs-native/native-provenance.json \
  --native-provenance-sha256 <64 hex> \
  --out release-manifest.json
```

`--artifact <path>` 可重复，**读取实际文件字节**计算 SHA-256 后写入
`artifacts[]`；不接受调用方声明的 digest。文件不可读为用法错误（exit `2`）。
`--native-provenance` 仍要求与 `--native-provenance-sha256` 成对提供（声明值由
发布方从 provenance 生成记录取得；`verify-files` 稍后核对实际字节）。

不传 `--out` 时清单写到 stdout。`--input` 不能与其他字段参数混用。

## 校验

```bash
node scripts/release-manifest.mjs verify --file scripts/fixtures/release-manifest.example.json
# release manifest OK: backend-20261122 (4 image(s), source b92a2d8fa4cf, contract 1.85.0)

node scripts/release-manifest.mjs verify \
  --file release-manifest.json \
  --expected-source-commit <40/64-hex> \
  --expected-contract-version 1.85.0 \
  --require-native-provenance
```

校验内容：必填字段与类型、digest 格式、`latest` 拒绝、镜像名唯一、
`artifacts` 路径/重复/未知字段拒绝、未知字段拒绝，以及可选的源 commit /
契约版本一致性。`--require-native-provenance` 按发布策略要求
`nativeProvenance` 必须存在（当前所有含 modeling-server/native 产物的发布都应
带此参数）；缺省保持 schema 级可选，避免破坏仅做结构校验的旧调用。
退出码：`0` 通过，`1` 清单字段/结构无效或策略要求缺失，`2` 用法错误（含清单
文件不可读/非法 JSON）。

## 文件字节校验（G1 J3.1g）

```bash
node scripts/release-manifest.mjs verify-files \
  --file release-manifest.json \
  --root . \
  --require-native-provenance
# file OK: nativeProvenance dist-backend/.../native-provenance.json (sha256:...)
# file OK: artifacts[0] dist-out/luban-cad-deploy-backend-20261122.zip (sha256:...)
# release manifest files OK: 2 file(s) match declared SHA-256
```

行为：

- 先按 `verify` 规则校验清单结构与 native 策略，再对
  `nativeProvenance.path` 与每个 `artifacts[].path` 读取本地文件、重新计算
  SHA-256，与声明值逐字节比较。
- 相对路径按 `--root` 解析（缺省当前工作目录）；绝对路径原样使用。发布记录
  建议从仓根执行并显式 `--root .`。
- **没有任何文件条目**（无 `nativeProvenance` 且无 `artifacts[]`）时退出 `1`，
  拒绝“空校验假绿”。
- 文件缺失/不可读/字节不符 → `1`，逐条打印标签、路径、声明值与实际值；
  用法错误 → `2`。
- 本命令**不**校验 `images[].digest`（registry 侧 digest）、镜像 OCI label、
  `sbomDigest` 对应的实际 SBOM 文件，也不访问网络/docker。这些必须在发布环境
  另行核对并写入发布记录。
- `scripts/release-gate.ps1 -ManifestPath <file> -VerifyManifestFiles` 已接入本
  命令；未提供 `-ManifestPath` 时为 WARN，不伪造清单。

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
版本不匹配；`--artifact` 实际字节哈希、`verify-files` 的字节一致/篡改/缺文件/
声明不符/空文件集、`--require-native-provenance` 策略、`artifacts` 结构拒绝与
用法错误；`verify-runtime` 的一致性/不匹配/接口选择/版本冲突/非法 JSON/
HTTP 失败/连接失败/超时/用法错误，全部使用 `127.0.0.1` 回环 HTTP 服务，无外部
网络。用例数随代码变化，以 `node --test` 实际运行为准，禁止沿用历史计数。

## CI/发布门集成现状

已接入：

1. `scripts/release-gate.ps1` 支持可选 `-ManifestPath <file>` 与
   `-VerifyManifestFiles`：前者强制执行 `verify --require-native-provenance`，
   后者追加 `verify-files --root <repo> --require-native-provenance`。未提供
   `-ManifestPath` 时为 WARN（不生成假清单）。
2. public CI（`.github/workflows/ci.yml`）运行本工具全部 `node:test` 用例与
   J1.2 契约门；CI 不生成真实 release manifest（无真实镜像/registry 环境）。
3. 发布前用 `verify --expected-source-commit <pipeline commit>` 和
   `--expected-contract-version <pinned>` 阻断错版/漂移；J3.2 的
   `verify-runtime` 可与 `/rpc/metadata` 对账。

仍需外部发布环境补齐（**不得伪造**）：

1. 镜像推送后从发布输出收集真实 `name`/`digest`（registry 侧 digest，不是本地
   `docker inspect` 声明），生成清单并作为 Release 资产归档。
2. 镜像 OCI label（`org.opencontainers.image.revision` 等）与清单
   `sourceCommit`/digest 的三方对账；本工具不调用 docker/gh。
3. SBOM 生成、签名与 `sbomDigest` 实际文件核对；provenance/attestation 签名。
4. 清单自身签名、Release 上传自动化、发布记录归档。
5. 真实发布清单未创建、真实 digest 未填写前，本工具只证明“清单结构与本地文件
   字节一致”，不证明发布就绪。
