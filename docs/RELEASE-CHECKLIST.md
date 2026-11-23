# 发布检查清单（后端产物 + 前后端镜像）

本清单是发布门的**操作真源**。自动化前置：`scripts/release-gate.ps1` 校验产物
hash / 限流姿态 / web·hub 镜像标签，可选校验 release manifest（结构/策略/文件
字节），并可串联 `verify-stack.ps1`。发布记录仍写入 ADR 与
`docs/RELEASE-backend-*.md`。

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
