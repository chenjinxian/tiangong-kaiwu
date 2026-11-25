# 发布检查清单（后端产物 + 前后端镜像）

本清单是发布门的**操作真源**。自动化前置：`scripts/release-gate.ps1` 校验产物
hash / 限流姿态 / web·hub 镜像标签，可选校验 release manifest（结构/策略/文件
字节），并可串联 `verify-stack.ps1`。发布记录仍写入 ADR 与
`docs/RELEASE-backend-*.md`。

## 0. Release profile 与必须输入（工业发布）

开发栈 `docker-compose.yml` 仍是 quickstart/本地体验的权威，**不得作为工业
发布配置**。发布使用独立的 `docker-compose.release.yml` + `deploy/release/
release-profile.json`：镜像全部是必填 `RELEASE_*_IMAGE`，由 manifest digest
解析；密钥全部是无默认值的 `RELEASE_*`；只有 nginx 发布宿主端口。release
hygiene 的 `release` 模式要求该 profile 存在并把每个镜像对齐到 manifest。
开发 compose 与 `quickstart.ps1`/`generate-env.ps1` 在 release 模式被明确
排除（local/ci 仍以 waiver 审计），因此开发默认值既不会被误当发布输入，也
不会让发布门被开发脚本永久卡红。

### 0.1 必须输入（缺一即不得发布）

| 输入 | 要求 | 记录/校验 |
|---|---|---|
| 发布 tag | 不可变、非 `latest`；与源 commit/产物 tag 一致 | manifest `tag` + `--expected-tag` |
| 源码 commit | public/backend/hub 的可发布提交；三仓对齐 | manifest `sourceCommit` + `--expected-source-commit` |
| 契约版本 | `LubanFeatureRpcInterface.interfaceVersion`，与 shared 源码、MS 产物、运行时 `/rpc/metadata` 一致 | manifest `contractVersion`；hygiene `contract.shipped`；`verify-runtime` |
| 镜像 digest | 每个 release profile 镜像的 **registry 侧** `sha256`（不是本地 `docker inspect` 声明） | manifest `images[]`；`render-release-images.mjs` |
| native provenance | 产物内 `provenance.public.json`（旧产物回退 `native-provenance.json`）的实际文件 SHA-256；必须来自 pin 的 native 构建，公开记录不得含宿主路径/私有仓 commit | manifest `nativeProvenance`；`verify --require-native-provenance` / `verify-files`；hygiene `provenance.public` |
| 产物 | MS tgz/deploy bundle 的实际文件 SHA-256 | manifest `artifacts[]`；`verify-files` |
| SBOM | 每个发布镜像的 SBOM；记录 digest 并归档 | manifest `evidence[]`（`kind: "sbom"`，本地文件 SHA-256，`verify-files` 重算）；`sbomDigest` 仅为旧版单值字段，不满足 release evidence 策略 |
| 签名/attestation | 镜像签名与 provenance attestation；密钥由 KMS/签名服务托管 | manifest `evidence[]`（`kind: "signature"` 或 `"attestation"`，本地文件 SHA-256）；验签/证书身份/镜像绑定仍在发布环境核对；不得把私钥写入仓库 |
| provenance 文件 | 构建 provenance / SLSA 声明归档 | manifest `evidence[]`（`kind: "provenance"`，本地文件 SHA-256）；语义与签名身份由发布环境核对 |
| secrets | postgres/JWT/refresh/forgot/confirm/webhook/admin/hub API/storage key、signed tile 密钥等全部来自 secret store；不得复用开发 `.env` | release profile `requiredInputs`；compose `${RELEASE_*:?}` 启动前失败 |
| SMTP / MS endpoint / origin / edge bind / 对象存储 endpoint+account | 显式输入；无 host.docker.internal/内部 Azurite 静默默认 | release profile `requiredInputs` |
| TLS 证书/私钥/规范域名 | `RELEASE_DOMAIN`、`RELEASE_TLS_CERT_FILE`（完整链 PEM）、`RELEASE_TLS_KEY_FILE`（无口令 PEM）显式提供；仓库内不得出现任何 PEM | release profile `requiredInputs`；compose 只读挂载；`docs/operations/RELEASE-EDGE.md` |
| signed tile 密钥 | `RELEASE_TILE_SIGNING_SECRET`（32–128 位 `[A-Za-z0-9_-]`）来自 secret store；与 tile URL 签名方同源轮换 | release profile `requiredInputs`；`docs/operations/RELEASE-EDGE.md` §4 |
| edge 暴露面 | `RELEASE_EDGE_BIND` 默认仅回环；对外发布必须显式设置并完成防火墙/WAF/限流评审 | compose 端口默认值；发布记录 |

生成与校验顺序：

```bash
# 1) 用真实 registry digest/产物字节/evidence 文件生成 manifest（禁止手写占位 digest）
node scripts/release-manifest.mjs build --tag <tag> --source-commit <sha> \
  --contract-version <x.y.z> --image <name>=sha256:<digest> ... \
  --artifact <release asset> --native-provenance <path> \
  --native-provenance-sha256 <digest> \
  --evidence sbom=<sbom file> --evidence signature=<signature bundle> \
  --evidence provenance=<provenance file> ... \
  --out release-manifest.json

node scripts/release-manifest.mjs verify --file release-manifest.json \
  --expected-source-commit <sha> --require-native-provenance \
  --require-release-evidence
# tag 对齐由 release-gate/hygiene 的 --expected-tag 负责（manifest verify 不接收该参数）
node scripts/release-manifest.mjs verify-files --file release-manifest.json \
  --root . --require-native-provenance --require-release-evidence

# 2) 从 manifest 生成镜像 env（写入前会先做 profile/compose 预检；
#    只想预检不写文件时用 --check）
node scripts/render-release-images.mjs --manifest release-manifest.json \
  --out deploy/release/release-images.env

# 3) 提供运维 env（密钥等），渲染 compose（必须成功）
docker compose -f docker-compose.release.yml \
  --env-file deploy/release/release.env \
  --env-file deploy/release/release-images.env config --quiet
```

- [ ] `release-manifest.json` 为真实输入生成，`verify`/`verify-files` 通过
      （含 `--require-native-provenance --require-release-evidence`）；未创建
      真实清单前不得把“结构校验通过”写成发布就绪。
- [ ] `evidence[]` 至少包含一个 `sbom`、一个 `signature` 或 `attestation`、
      一个 `provenance`，且 `verify-files` 对其逐文件重算 SHA-256 通过；工具
      只证明本地文件存在/字节一致，不证明 SBOM 合法或签名有效。
- [ ] `render-release-images.mjs --check` 通过；每个镜像引用均为
      `<name>@sha256:<64 hex>`，无 `latest`。
- [ ] `docker compose ... config --quiet` 通过；`docker compose ... config`
      中只有 nginx 有 published port。
- [ ] `deploy/release/release.env` 由 secret store 注入；`RELEASE_ENV_FILE`
      指向受控的运行时 env 文件，不是开发 `.env`。
- [ ] SBOM/签名/attestation/provenance 文件已归档，`evidence[]` 的本地 SHA-256
      与 `verify-files` 结果已写入发布记录；签名验证、签名身份与镜像 OCI
      revision label/`sourceCommit` 对账在发布环境完成。
- [ ] `powershell -File scripts/release-gate.ps1 -ManifestPath release-manifest.json
      -VerifyManifestFiles -ExpectedSourceCommit <sha> -ExpectedTag <tag>`
      通过（release gate 内含 release profile 镜像解析预检）；如需审计私有
      构建脚本，另加 `-BackendRoot <luban-backend>`。
- [ ] **产物模式编辑器冒烟**（不是 `-Source`）：用 `dist-backend` 内的 tgz
      解包树按默认产物模式启 MS，跑 login → 建文档 → 建 Part Studio →
      草图+拉伸 → undo/redo（至少 `login.spec`、`keyboard.spec`、
      `new-part-studio.spec`、`sketch-extrude.spec`）。2026-11-25 实测
      `backend-20261125` 产物 native Delivery 在 briefcase 打开后挂起，而
      同提交源码模式 3 秒通过——源码 e2e 不能证明 tgz 内 native 成套可运行。
      冒烟通过前不得生成 manifest 或发布；记录 native Delivery 整包
      （不只 `imodeljs.node`）的哈希与构建来源。

### 0.2 人类决策（本仓不自动决定）

- **registry 政策**：GHCR/Docker Hub/MCR 的可见性与保留策略、immutable tag
  策略、匿名拉取、组织级权限与审计；`latest` 是否保留为移动别名（发布清单
  仍必须使用 digest）。
- **签名/KMS**：cosign keyless 还是 KMS/HSM 托管密钥；签名身份与审批人；
  SBOM 生成器与签名格式；密钥轮换与吊销流程。
- **secret store**：生产密钥托管、注入方式、轮换周期；Postgres/Redis/对象
  存储/SMTP 使用托管服务还是随栈容器；TLS/证书与 edge 暴露面。
- **TLS/域名/证书**：CA 选择、证书链与私钥托管、续期/轮换、OCSP/CRL；
  `RELEASE_DOMAIN` 与证书 SAN 对齐；`RELEASE_ALLOWED_ORIGINS` 使用
  `https://<domain>`。不得用自签名证书发布。
- **HSTS/preload 与公开绑定**：是否加入 HSTS preload（默认不加）、哪些
  子域支持 HTTPS、`RELEASE_EDGE_BIND` 是否对外（默认仅回环）、外部 LB/WAF/
  DDoS/限流是否前置（edge 本身未内置 `limit_req`）。
- **tile 签名方**：由私有 modeling-server/BFF 生成 `edge_exp`/`edge_sig`
  并轮换 `RELEASE_TILE_SIGNING_SECRET`；在签名方接入前 release tile 读取
  fail-closed。替代方案（mTLS/JWT 认证网关）由发布 owner 决策。
- **modeling-server 形态**：当前仍是宿主进程（native/link: 依赖不能入
  Linux 容器）。工业发布前需决定并实现可 pin 的 MS 发布产物（镜像或受控
  宿主包），否则 `RELEASE_MS_UPSTREAM` 仍依赖宿主运维。
- **回滚与灾备**：manifest/tag 保留窗口、数据库 PITR、对象存储恢复演练。

### 0.3 私有仓构建状态（公开仓不修改私有构建脚本）

- `luban-backend/scripts/build-ms-dist.ps1`（2026-11-25 已收口）：release
  lock `npm ci --omit=dev` + pnpm frozen 锁检查；真实 `tsc` 类型检查
  （`--noCheck` 已移除）；`-NativeDelivery` 必填、无宿主路径默认值、无
  store 兜底；产物只带脱敏 `provenance.public.json`，完整私有证据写到
  `dist-out/private/` 且不入 tgz。对应产物 `backend-20261125`（契约
  1.85.0）通过了 release hygiene 的 public provenance/契约/build-script
  静态检查，但 **2026-11-25 真栈实测其 native Delivery 组合在打开
  briefcase 时挂起**（源码模式与 workspace 固定 native 均正常）；该 tgz
  不可发布，必须用冻结成套的 native Delivery 重建并过 §0.1 产物模式
  编辑器冒烟。
- `luban-backend/scripts/build-images.ps1` / `publish.ps1`：发布构建仍不得以
  `latest` 作为唯一可追溯引用；推送不可变 tag 并输出 registry digest；
  SBOM、镜像签名与 attestation 仍待发布 owner 用签名身份生成（本仓不得
  伪造或自签）。
- `luban-backend/.github/workflows/ci.yml`：发布相关安装使用
  `--frozen-lockfile`，并让 public release hygiene 以 `-BackendRoot` 可审计。
- 在私有仓完成前，public `check-release-hygiene.mjs --mode release
  --backend-root <luban-backend>` 会把上述问题列为 FAIL；发布 owner 必须
  修复或登记带 owner/expiry 的例外，不得静默放行。

### 0.4 当前已知 release 债务（发布门仍会 FAIL）

以下为当前 `--mode release` 的未修复阻断项；公开打包脚本的浮动 tag 债已
修复（保留记录以说明发布口径），其余必须在真实发布前消除或登记带 owner/
expiry 的例外：

- **契约 skew**：本机 `dist-backend` 的 `LubanFeatureRpcInterface` 为
  `1.64.0`，公开源为 `1.85.0` → `contract.shipped` FAIL。必须用当前 shared
  重建/重发 MS 产物，不得改清单掩盖。
- **公开打包脚本（已修复，保留记录）**：`scripts/rebuild-web.ps1` 的本地兼容
  别名改为 `-LocalTag`（缺省 latest，仅本地 verify-stack/回滚使用）；发布推送
  必须显式 `-ReleaseTag <不可变 tag|sha256:digest>`，latest 直接拒绝，脚本只
  准备本地 tag 并打印 push 命令，不自动推送。`scripts/make-deploy-bundle.ps1`
  要求显式 `-ImageTag`（无缺省，避免静默浮动标签）；缺省即发布口径，必须显式
  `-Tag` 且拒绝 latest；只有显式 `-LocalDev` 才允许 latest 与日期缺省 Tag。
  release hygiene 的 `images.pinned` 不再因这两个脚本失败；本地体验需显式传
  `-ImageTag latest -LocalDev`，该路径已在脚本文档注明。
  注意：这两个脚本仍会引用 GHCR 仓库名，release manifest 必须为
  `luban-web-public`/`luban-bff-public`/`imodelhub-public`/
  `luban-webhook-agent-public` 提供 digest，否则 `manifest.release` 仍会
  fail closed。
- **构建脚本宿主路径**：release 打包脚本已移除宿主盘符
  （`fetch-backend.ps1`/`rebuild-web.ps1` 从 `ProgramFiles` 派生 Docker
  PATH；`dedupe-artifact-deps.ps1` 默认值从脚本根派生）。`quickstart.ps1`
  仍有 Docker Desktop 路径，但它是 dev-only，release 模式不审计。私有
  `build-ms-dist.ps1` 仍硬编码 `D:\...`（见 0.3）。
- **公开产物 provenance**：本机 `dist-backend` 的 native provenance 含
  宿主路径与私有 native 证据；release 模式 FAIL。公开 Release 只能发布
  脱敏 provenance，私有证据留在私有仓发布记录。
- **无真实 release manifest**：必须由真实 registry digest 与产物字节生成，
  不得手写占位 digest。
- **CI 未推送/未跑绿**：本分支的 public CI 结果不能在本机冒充；推送后以
  Actions 实际结果为准。

### 0.5 Release edge（TLS/安全头/存储门禁）

操作真源：`docs/operations/RELEASE-EDGE.md`。配置：
`deploy/release/nginx.conf` + `deploy/release/nginx-tls.conf.template`；
静态门禁：`node --test scripts/test/release-edge.test.mjs`。

- [ ] `RELEASE_DOMAIN`、`RELEASE_TLS_CERT_FILE`、`RELEASE_TLS_KEY_FILE`、
      `RELEASE_TILE_SIGNING_SECRET` 由 secret store/证书管理系统提供；仓库与
      镜像内无任何 PEM/私钥；证书链完整（含中间证书），私钥无口令且权限受限。
- [ ] `docker compose ... config --quiet` 渲染成功；`config` 中 **只有
      nginx** 有 published port；HTTP `:80` 仅 308 跳到
      `https://<RELEASE_DOMAIN>`，业务只在 `:443`。
- [ ] 用真实证书执行 `nginx -t` 通过；镜像内置
      `/etc/nginx/conf.d/default.conf` 未被 include（无额外明文站点）。
- [ ] 实测响应头：HSTS、CSP、X-Frame-Options `DENY`、Referrer-Policy、
      `X-Content-Type-Options: nosniff`、`Permissions-Policy`；认证/API/存储面
      与 `.html`/`.json` 为 `Cache-Control: no-store`；SPA/静态缓存头已实测；
      `X-Request-ID` 透传上游并在响应回显。
- [ ] `/azurite` 非匿名：未签名 tile `403`、过期 `410`、非 tile 存储路径
      `404`、`/tiles|/storage|/blob` `404`；有效 `edge_exp`/`edge_sig` 才可
      代理到内部存储。
- [ ] tile 签名方已接入：私有 modeling-server/BFF 对规范化路径生成
      `edge_sig`，TTL 短且密钥可轮换；若尚未接入，发布记录必须明确写
      “release tile 读取 fail-closed”，不得恢复匿名 `/azurite` 直通。
- [ ] WA baseline/debug 残余已复核并写入发布记录：release compose 固定
      `BASELINE_TRIGGER_AUTH=service`、WA 无宿主端口；signed service
      identity 与 job binding 仍在私有仓 backlog（见 RELEASE-EDGE.md §5）。
- [ ] 开发栈回归：`docker-compose.yml` 未引入证书/TLS 输入，`quickstart`
      仍走 HTTP `:5301`；dev 的匿名 `/azurite` 回环代理保持不变。
- [ ] edge 暴露面决策已记录：`RELEASE_EDGE_BIND`（默认 `127.0.0.1`）、
      外部 LB/WAF/限流、HSTS preload（默认不加）。

## 1. 源码与版本对齐

- [ ] public / backend / hub 三仓工作区干净，main 已推送；发布用的 public 提交
      固定记录在 ADR（不钉文档提交 HEAD）。
- [ ] `@luban-cad/shared` 契约版本与 MS 产物/前端运行时一致；不得硬编码历史版本，
      以 shared 源码、MS `/rpc/metadata` 与镜像 label 三方对账为准。RPC
      interfaceName 只有 `LubanRpcInterface` / `LubanFeatureRpcInterface`。
- [ ] public CI 的契约冻结门通过（`scripts/check-contract-freeze.mjs`）；若本轮
      bump 了 `interfaceVersion`/FeatureOp/DTO，`docs/architecture/contract-freeze.json`
      已同步更新并与 backend/web 配对发布；不得只改清单掩盖未配对变更。
- [ ] legacy schema 退役状态已同步（旧数据审计零命中；现行代码不再读写）。

## 2. 构建

- [ ] shared build：`cd luban-cad/packages/shared && corepack pnpm@10 build`。
- [ ] MS 产物：backend 私有仓 `scripts/build-ms-dist.ps1` 重建；禁止手工修补
      产物或复用旧 tag。
- [ ] web 生产镜像：`powershell -File scripts/rebuild-web.ps1 -BModelEnabled true`
      （**不带** `-E2EHooks`）；镜像 LABEL `b-model-enabled=true`。
- [ ] web 公开镜像：`scripts/rebuild-web.ps1 -BModelEnabled true
      -ReleaseTag <不可变 tag|sha256:digest>` 构建并打
      `ghcr.io/chenjinxian/luban-web-public` 发布引用；只 push 该不可变
      引用并记录 registry digest（`latest` 是否保留为移动别名按 §0.2 的
      registry 政策决定，release manifest 必须用 digest）。
- [ ] bff 公开镜像：`docker compose build bff` 后推
      `ghcr.io/chenjinxian/luban-bff-public` 的同一不可变 tag，并记录
      registry digest。
- [ ] hub / webhook-agent 镜像来自 GHCR 同 tag；hub 不得挂宿主 `dist`（verify-stack
      Step F 硬检查）。

## 3. 单元 / 集成门

- [ ] backend 全量 `pnpm test`（本机完整构建）：以本次实际结果记录，必须 0 失败
      （已登记 expected fail 除外）；注意全量 feature 测试不进入托管 CI，属发布前本地门。
- [ ] public：shared / viewer / editor / web 的测试以本次实际结果记录并全绿；
      禁止沿用历史计数，新增测试后以实际为准。
- [ ] public CI 实跑并记录（不得用本地运行冒充）：契约冻结门、`@luban-cad/web`
      生产 build（`corepack pnpm@10 --filter @luban-cad/web build`）、
      `services/bff` typecheck + 单测、`scripts/*.test.mjs` 运维脚本测试。
- [ ] 各包 `tsc` / `lint` 0 错；e2e `typecheck:e2e` 0 错。

## 4. 真栈 e2e（需干净限流窗口）

- [ ] `scripts/start-ms-host.ps1 -Detach` 重启 MS（清空内存限流计数）。
- [ ] 全量 Playwright 使用**测试专用限流覆盖**并在发布记录中披露：
      `$env:LUBAN_RPC_RATE_LIMIT_MAX='2000'; $env:LUBAN_RPC_RATE_LIMIT_WINDOW_MS='900000'`
      （默认 100 req/15min 不适合长套件）。
- [ ] 源码 dev server 全量（`VITE_E2E_HOOKS=true`）以 `npx playwright test --list`
      当前 spec 列表为准，全绿并记录实际 passed/skipped；禁止沿用历史计数。发布镜像
      test-observation 镜像同口径全量（生产 hook-off 镜像不承载 editor-spec 观测面）。
- [ ] 全量 e2e 后生成确定性基线（J1.5）。在 `luban-cad/apps/web` 执行：
      `$env:PLAYWRIGHT_JSON_OUTPUT_NAME='test-results/playwright-report.json'; npx playwright test --reporter=json`；
      回到仓根（先建 `release/` 目录）执行：
      `node scripts/e2e-baseline.mjs --input luban-cad/apps/web/test-results/playwright-report.json
      --out release/e2e-baseline-<tag>.json --label <tag> --fail-on-unexpected`。
      基线只含 file/title/project/status/retries 与计数，不含时间/错误正文/附件；
      failed/flaky/report errors 必须为 0，或按 waiver 写入发布记录。
      `totals.expectedFailures`（已满足的 `test.fail()` 登记 known-red）单独计数，
      必须逐项复核并确认仍在 waiver/backlog 内；不得把其当作普通通过。基线作为
      发布资产归档，禁止手工改数字。
- [ ] Tutorial 2 严格鼠标级复刻门：`npx playwright test e2e/tutorial2.spec.ts`
      通过——草图字面 18/48/9（直方图对齐 gold）+ 六特征 UI 对话框 +
      四短竖棱 fillet 4 chips/status 0；体积与去材见
      `e2e/fixtures/onshape-tutorial2/README.md`（终体积 ≤0.5% vs API
      357.568 cm³，短棱去材 0.422 cm³）。**该 e2e 是开发验收；干净发布仍需
      第 2 节产物完整性硬检查通过。**
- [ ] Onshape UI 对齐门：`npx playwright test e2e/ui-parity.spec.ts`——ViewCube
      在场/朝向同步/面点击、默认几何图元与眼睛开关、ViewCube 下拉显示设置
      持久化、草图相机零副作用（进入/退出不改相机）与可见内容取景（模型∪活动草图，空场景基准面，永不 projectExtents）。
- [ ] Tutorial 2 逐工具回归：`npx playwright test e2e/tutorial2-tools.spec.ts`
      （绘制/约束/标注/偏移 4 用例，实跑约 2.3 min；与严格复刻门同一真实
      ribbon + canvas 管道，每用例独立重置 B 种子）。
- [ ] 跑后**必须恢复生产默认**：重启 MS，启动日志应为
      `RPC rate limit: 100 req / 900000 ms per IP (production default)`。
- [ ] A 几何夹具 / damaged 半图 HITL / A6 两用户分享链在发布镜像上复跑。

## 5. 发布镜像验收

- [ ] `scripts/verify-stack.ps1` 全绿（不得跳过）：
      Step D 产物 provenance 可见；Step E web revision 与 web 源一致；Step F hub
      revision 与 hub HEAD 一致且无宿主 dist 挂载。
- [ ] web revision 落后源码时先 `rebuild-web.ps1` 再 `docker compose up -d web`；
      **不要用重启容器代替重建**（静态镜像无运行期 env）。
- [ ] `docker compose pull` + `--force-recreate` 实际拉取 GHCR 镜像；核对 OCI
      revision 标签。
- [ ] 公开镜像门：`imodelhub-public` / `luban-webhook-agent-public` /
      `luban-web-public` / `luban-bff-public` 均为 `visibility=public`，且
      **匿名 registry token + manifest HEAD 200**（无需 `docker login`）；
      `scripts/verify-public-deps.ps1` 全绿。首次设为 Public 若 API 404，
      按包设置页手动操作（一次即可，后续 push 继承）。
- [ ] 镜像内容审计：hub/WA 无 `src/`、`*.map`、`*.d.ts`、`*.test.js`
      （`publish.ps1` push 前硬门）；web 仅为静态产物；bff 仅 dist+生产依赖。

## 6. 产物与发布

- [ ] 第 0 节的 release profile 输入全部就位（manifest digest、source commit、
      契约版本、native provenance、SBOM、签名、secret store env）；否则不得
      进入本节。
- [ ] 生成 release manifest 并做**实际文件字节**校验（J3.1g）：
      `node scripts/release-manifest.mjs build --tag <tag> --source-commit <sha>
      --contract-version <shared interfaceVersion> --image <name>=<registry digest> ...
      --artifact <release asset> ... --native-provenance <path>
      --native-provenance-sha256 <digest> --evidence sbom=<file>
      --evidence signature=<file> --evidence provenance=<file> ...
      --out release-manifest.json`；再执行
      `verify --require-native-provenance --require-release-evidence` 与
      `verify-files --root . --require-native-provenance
      --require-release-evidence`。清单作为 Release 资产归档。
      工具不生成假 digest/假清单/假 evidence；缺文件必须失败。
- [ ] 真实镜像 digest（registry 侧）/ OCI label / SBOM 生成与签名 /
      provenance attestation 的验签与身份绑定已在发布环境核对并写入发布记录；
      `evidence[]` 只覆盖本地文件存在与 SHA-256，不在本仓
      `release-manifest.mjs` 的离线能力内。
- [ ] Release asset 大小/SHA256 与本地 tgz 相同；GitHub asset digest 核对。
- [ ] `scripts/make-deploy-bundle.ps1 -Tag <tag> -ImageTag <不可变 tag>`
      生成部署包并上传 `luban-cad-deploy-<tag>.zip` + 稳定名
      `luban-cad-deploy.zip`（外部免 clone）；发布口径拒绝 latest 且要求
      显式 `-Tag`，四个镜像变量必须有 manifest digest。
      `verify-public-deps.ps1` 含该资产检查。
- [ ] GHCR tag/latest digest 记录（WA / hub）；`latest` 指向同 digest。
- [ ] 发布记录：`docs/RELEASE-backend-<date>.md` + ADR §15 追加；docs/README
      索引更新。
- [ ] 回滚边界写明：B flag off 重建 web（数据保留；MS/hub 不回滚；RPC 向后兼容）。

## 7. 发布后

- [ ] 生产 web 镜像 hooks off、B on；验证 `verify-stack` 全绿。
- [ ] 限流恢复生产默认（见 §4）。
- [ ] 把本轮新发现的 waiver/backlog 写入 ADR 残项表，标明 owner 与下一步。

---

## 自动化

- **public CI**（`.github/workflows/ci.yml`）：Rush 构建 `@itwin/core-frontend` 闭包 →
  契约冻结门（J1.2）→ 运维脚本 `node:test` → shared/editor/viewer 构建 +
  `@luban-cad/web` 生产 build → shared/editor/viewer/web 单测 + tsc/lint；
  独立 `bff` job 跑 `services/bff` typecheck + 单测。不跑真栈 e2e、backend 全量或
  native ctest（后两者需私有工具链/self-hosted，X-09）。
- **backend CI**（`.github/workflows/ci.yml`）：克隆 public 到 `D:\a\tiangong-kaiwu` →
  Rush 构建 `@itwin/core-backend` 闭包 → modeling-server tsc/lint + middleware 单测。
  **涉及私有依赖的测试仍走本清单第 3 节本地门**（托管 runner 未预置该工具链）。
- **契约冻结**（J1.2）：`scripts/check-contract-freeze.mjs` + committed
  `docs/architecture/contract-freeze.json`；冻结 Feature RPC/`LubanRpcInterface` 的
  `interfaceVersion` 与导出表面 token 流哈希。只改注释/格式不误报；改版本/类型
  必须同 PR 更新清单。
- **e2e 基线**（J1.5）：`scripts/e2e-baseline.mjs` 把 Playwright JSON report 转为
  确定性摘要；全量 e2e 仍需发布候选在真栈执行（本清单第 4 节）。
- **release manifest**（J3.1g）：`scripts/release-manifest.mjs` 的
  `verify-files` 核对 `nativeProvenance`/`artifacts[]`/`evidence[]` 实际文件
  字节；`release-gate.ps1` 以 `-ManifestPath`/`-VerifyManifestFiles` 可选接入，
  并强制 `--require-native-provenance --require-release-evidence`。镜像
  registry/label、SBOM 语义、签名验签与身份绑定仍为外部发布职责；测试见
  `scripts/test/release-evidence.test.mjs`。
- **release profile**（J3.3 扩展）：`docker-compose.release.yml` +
  `deploy/release/release-profile.json`；`scripts/render-release-images.mjs`
  从 manifest 解析 `<name>@sha256`，并在 `--check` 时校验 profile/compose
  策略（必填镜像变量、无默认密钥、仅 edge 端口、禁止本地 build、必填输入
  登记）。`check-release-hygiene.mjs --mode release` 要求 profile 存在并
  对齐 manifest；本地/CI 模式仍用 waiver 审计开发 compose。测试：
  `scripts/test/check-release-hygiene.test.mjs`、
  `scripts/test/release-script-tags.test.mjs`、
  `scripts/test/release-images.test.mjs`。
- **release edge**（TLS/存储门禁）：`deploy/release/nginx.conf` +
  `deploy/release/nginx-tls.conf.template`，由
  `scripts/test/release-edge.test.mjs` 静态验证必填证书/私钥/域名/tile 密钥、
  仅 edge 端口、HSTS/CSP/XFO/Referrer-Policy/no-store、request-id 透传、
  `/azurite` 非匿名及 dev compose 无证书回归。说明见
  `docs/operations/RELEASE-EDGE.md`。真实证书、`nginx -t` 与运行时
  308/403/410/404 探针仍由发布环境执行。

```powershell
# 快速检查（不跑 verify-stack；当前产物使用后备来源时显式放行）
powershell -File scripts/release-gate.ps1 -AllowStoreFallback -SkipVerifyStack

# 带 release manifest 的完整发布门（生产限流已恢复）
powershell -File scripts/release-gate.ps1 -ExpectedSha256 <release-asset-sha256> `
  -ManifestPath release-manifest.json -VerifyManifestFiles
```

退出码 0 = 通过；非 0 = 有 FAIL 项（WARN 不阻断，但必须写进发布记录）。

> 诚实状态：本清单是操作真源，不代表当前分支已满足。G1 分支的 public CI 尚未
> 运行、真栈 `verify-stack` 未复跑（审计基线 15/17，且存在陈旧 hub/web 镜像与
> 宿主 MS 来源），不得把本地脚本结果或历史数字写成发布绿。release edge 的
> 配置与静态测试（RELEASE-EDGE.md）不证明真实证书、真实 `nginx -t`、真实栈
> 或 signed tile 签名方已就绪；这些必须在发布环境复核并记录。
