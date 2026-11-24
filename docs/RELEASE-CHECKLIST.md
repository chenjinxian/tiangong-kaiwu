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
| native provenance | 产物内 `native-provenance.json` 的实际文件 SHA-256；必须来自 pin 的 native 构建 | manifest `nativeProvenance`；`verify --require-native-provenance` / `verify-files` |
| 产物 | MS tgz/deploy bundle 的实际文件 SHA-256 | manifest `artifacts[]`；`verify-files` |
| SBOM | 每个发布镜像的 SBOM；记录 digest 并归档 | manifest `sbomDigest`（外部生成/签名） |
| 签名/attestation | 镜像签名与 provenance attestation；密钥由 KMS/签名服务托管 | 外部发布记录；不得把私钥写入仓库 |
| secrets | postgres/JWT/refresh/forgot/confirm/webhook/admin/hub API/storage key 等全部来自 secret store；不得复用开发 `.env` | release profile `requiredInputs`；compose `${RELEASE_*:?}` 启动前失败 |
| SMTP / MS endpoint / origin / edge bind / 对象存储 endpoint+account | 显式输入；无 host.docker.internal/内部 Azurite 静默默认 | release profile `requiredInputs` |

生成与校验顺序：

```bash
# 1) 用真实 registry digest/产物字节生成 manifest（禁止手写占位 digest）
node scripts/release-manifest.mjs build --tag <tag> --source-commit <sha> \
  --contract-version <x.y.z> --image <name>=sha256:<digest> ... \
  --artifact <release asset> --native-provenance <path> \
  --native-provenance-sha256 <digest> --out release-manifest.json

node scripts/release-manifest.mjs verify --file release-manifest.json \
  --expected-source-commit <sha> --require-native-provenance
# tag 对齐由 release-gate/hygiene 的 --expected-tag 负责（manifest verify 不接收该参数）
node scripts/release-manifest.mjs verify-files --file release-manifest.json \
  --root . --require-native-provenance

# 2) 从 manifest 生成镜像 env（写入前会先做 profile/compose 预检；
#    只想预检不写文件时用 --check）
node scripts/render-release-images.mjs --manifest release-manifest.json \
  --out deploy/release/release-images.env

# 3) 提供运维 env（密钥等），渲染 compose（必须成功）
docker compose -f docker-compose.release.yml \
  --env-file deploy/release/release.env \
  --env-file deploy/release/release-images.env config --quiet
```

- [ ] `release-manifest.json` 为真实输入生成，`verify`/`verify-files` 通过；
      未创建真实清单前不得把“结构校验通过”写成发布就绪。
- [ ] `render-release-images.mjs --check` 通过；每个镜像引用均为
      `<name>@sha256:<64 hex>`，无 `latest`。
- [ ] `docker compose ... config --quiet` 通过；`docker compose ... config`
      中只有 nginx 有 published port。
- [ ] `deploy/release/release.env` 由 secret store 注入；`RELEASE_ENV_FILE`
      指向受控的运行时 env 文件，不是开发 `.env`。
- [ ] SBOM/签名/attestation 的 digest 与签名身份已写入发布记录；镜像 OCI
      revision label 与 `sourceCommit` 对账。
- [ ] `powershell -File scripts/release-gate.ps1 -ManifestPath release-manifest.json
      -VerifyManifestFiles -ExpectedSourceCommit <sha> -ExpectedTag <tag>`
      通过（release gate 内含 release profile 镜像解析预检）；如需审计私有
      构建脚本，另加 `-BackendRoot <luban-backend>`。

### 0.2 人类决策（本仓不自动决定）

- **registry 政策**：GHCR/Docker Hub/MCR 的可见性与保留策略、immutable tag
  策略、匿名拉取、组织级权限与审计；`latest` 是否保留为移动别名（发布清单
  仍必须使用 digest）。
- **签名/KMS**：cosign keyless 还是 KMS/HSM 托管密钥；签名身份与审批人；
  SBOM 生成器与签名格式；密钥轮换与吊销流程。
- **secret store**：生产密钥托管、注入方式、轮换周期；Postgres/Redis/对象
  存储/SMTP 使用托管服务还是随栈容器；TLS/证书与 edge 暴露面。
- **modeling-server 形态**：当前仍是宿主进程（native/link: 依赖不能入
  Linux 容器）。工业发布前需决定并实现可 pin 的 MS 发布产物（镜像或受控
  宿主包），否则 `RELEASE_MS_UPSTREAM` 仍依赖宿主运维。
- **回滚与灾备**：manifest/tag 保留窗口、数据库 PITR、对象存储恢复演练。

### 0.3 私有仓待改（公开仓不修改私有构建脚本）

- `luban-backend/scripts/build-ms-dist.ps1`：`npm install
  --legacy-peer-deps` 改为锁文件 frozen 安装；`tsc --noCheck` 改为真实类型
  门（或登记 release owner 例外）；移除默认 `D:\Github\...` 宿主路径与
  `D:\Github\imodel-native`，改为必填参数；产物 provenance 拆分公开/私有，
  公开产物不得含 `storePackagePath`/`imodelNativeHead` 等私有证据。
- `luban-backend/scripts/build-images.ps1` / `publish.ps1`：发布构建不得以
  `latest` 作为唯一可追溯引用；推送不可变 tag 并输出 registry digest；
  生成 SBOM、签名与 attestation。
- `luban-backend/.github/workflows/ci.yml`：发布相关安装使用
  `--frozen-lockfile`，并让 public release hygiene 以 `-BackendRoot` 可审计。
- 在私有仓完成前，public `check-release-hygiene.mjs --mode release
  --backend-root <luban-backend>` 会把上述问题列为 FAIL；发布 owner 必须
  修复或登记带 owner/expiry 的例外，不得静默放行。

### 0.4 当前已知 release 债务（发布门仍会 FAIL）

以下为本次接入后 `--mode release` 的诚实输出，未在本次 first slice 修复：

- **契约 skew**：本机 `dist-backend` 的 `LubanFeatureRpcInterface` 为
  `1.64.0`，公开源为 `1.85.0` → `contract.shipped` FAIL。必须用当前 shared
  重建/重发 MS 产物，不得改清单掩盖。
- **公开打包脚本**：`scripts/rebuild-web.ps1` 仍保留本地兼容
  `tiangong-kaiwu-web:latest` 与 `latest` 发布提示；
  `scripts/make-deploy-bundle.ps1` 生成的体验 README 仍写 4 个
  `:latest`。release 模式把二者判 FAIL。发布路径本身走 release profile +
  manifest digest，不依赖这些开发 bundle；后续要么改为不可变 tag/digest，
  要么把它们明确归入 dev-only（需要单独评审，不能静默加 release waiver）。
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
- [ ] web 公开镜像：`scripts/rebuild-web.ps1` 构建并打
      `ghcr.io/chenjinxian/luban-web-public` tag，push `latest` + 本次 tag。
- [ ] bff 公开镜像：`docker compose build bff` 后推
      `ghcr.io/chenjinxian/luban-bff-public`（`latest` + 本次 tag）。
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
      --native-provenance-sha256 <digest> --out release-manifest.json`；
      再执行 `verify --require-native-provenance` 与
      `verify-files --root . --require-native-provenance`。清单作为 Release 资产归档。
      工具不生成假 digest/假清单；缺文件必须失败。
- [ ] 真实镜像 digest（registry 侧）/ OCI label / SBOM 生成与签名 /
      provenance attestation 已在发布环境核对并写入发布记录；这些不在本仓
      `release-manifest.mjs` 的离线能力内。
- [ ] Release asset 大小/SHA256 与本地 tgz 相同；GitHub asset digest 核对。
- [ ] `scripts/make-deploy-bundle.ps1 -Tag <tag>` 生成部署包并上传
      `luban-cad-deploy-<tag>.zip` + 稳定名 `luban-cad-deploy.zip`（外部免 clone）；
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
  `verify-files` 核对实际文件字节；`release-gate.ps1` 以
  `-ManifestPath`/`-VerifyManifestFiles` 可选接入。镜像 registry/label/SBOM/
  attestation 仍为外部发布职责。
- **release profile**（J3.3 扩展）：`docker-compose.release.yml` +
  `deploy/release/release-profile.json`；`scripts/render-release-images.mjs`
  从 manifest 解析 `<name>@sha256`，并在 `--check` 时校验 profile/compose
  策略（必填镜像变量、无默认密钥、仅 edge 端口、禁止本地 build、必填输入
  登记）。`check-release-hygiene.mjs --mode release` 要求 profile 存在并
  对齐 manifest；本地/CI 模式仍用 waiver 审计开发 compose。测试：
  `scripts/test/check-release-hygiene.test.mjs`、
  `scripts/test/release-images.test.mjs`。

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
> 宿主 MS 来源），不得把本地脚本结果或历史数字写成发布绿。
