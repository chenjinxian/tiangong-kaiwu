# 发布检查清单（后端产物 + 前后端镜像）

本清单是发布门的**操作真源**。自动化前置：`scripts/release-gate.ps1` 校验产物
hash / native provenance / 限流姿态 / web·hub 镜像标签，并可串联
`verify-stack.ps1`。发布记录仍写入 ADR 与 `docs/RELEASE-backend-*.md`。

## 1. 源码与版本对齐

- [ ] public / backend / hub 三仓工作区干净，main 已推送；发布用的 public 提交
      固定记录在 ADR（不钉文档提交 HEAD）。
- [ ] `@luban-cad/shared` 契约版本与 MS 产物一致（当前 **1.18.0**）；RPC
      interfaceName 只有 `LubanRpcInterface` / `LubanFeatureRpcInterface`
      （`/rpc/metadata` 中 `OpenCloud` 计数为 0）。
- [ ] 命名迁移记录与 legacy schema 退役状态已同步（`docs/NAMING-2026-10-31.md`）。

## 2. 构建

- [ ] shared build：`cd luban-cad/packages/shared && corepack pnpm@10 build`。
- [ ] MS 产物：backend 私有仓 `scripts/build-ms-dist.ps1` 重建；禁止手工修补
      产物或复用旧 tag。
- [ ] **native provenance 硬检查**：产物
      `node_modules/@bentley/imodeljs-native/native-provenance.json` 必须存在。
      - `fallbackRequired=false` 为干净发布；
      - `fallbackRequired=true`（store devbuild 早于 imodel-native HEAD）时，构建
        必须显式 `-AllowStoreNativeFallback`，发布记录写明 version/head/fallback；
      - **`using dev build from …` 横幅不是版本/新鲜度证明**，不得作为通过依据。
- [ ] web 生产镜像：`powershell -File scripts/rebuild-web.ps1 -BModelEnabled true`
      （**不带** `-E2EHooks`）；镜像 LABEL `b-model-enabled=true`。
- [ ] hub / webhook-agent 镜像来自 GHCR 同 tag；hub 不得挂宿主 `dist`（verify-stack
      Step F 硬检查）。

## 3. 单元 / 集成门

- [ ] backend 全量 `pnpm test`（本机 native dev build；当前基线 **670 passed /
      8 skipped**）；注意全量 feature 测试不进入托管 CI，属发布前本地门。
- [ ] public：shared **144**、viewer **107**、editor frontend **43**、web
      **1172**（2026-11-01 post-p28c 基线；新增测试后以实际为准）。
- [ ] 各包 `tsc` / `lint` 0 错；e2e `typecheck:e2e` 0 错。

## 4. 真栈 e2e（需干净限流窗口）

- [ ] `scripts/start-ms-host.ps1 -Detach` 重启 MS（清空内存限流计数）。
- [ ] 全量 Playwright 使用**测试专用限流覆盖**并在发布记录中披露：
      `$env:LUBAN_RPC_RATE_LIMIT_MAX='2000'; $env:LUBAN_RPC_RATE_LIMIT_WINDOW_MS='900000'`
      （默认 100 req/15min 不适合长套件）。
- [ ] 源码 dev server 全量（`VITE_E2E_HOOKS=true`）**51/51**；或发布镜像
      test-observation 镜像全量 51/51（生产 hook-off 镜像不承载 editor-spec
      观测面）。
- [ ] 跑后**必须恢复生产默认**：重启 MS，启动日志应为
      `RPC rate limit: 100 req / 900000 ms per IP (production default)`。
- [ ] A 几何夹具 / damaged 半图 HITL / A6 两用户分享链在发布镜像上复跑。

## 5. 发布镜像验收

- [ ] `scripts/verify-stack.ps1` **17/17**：
      Step D native provenance 可见；Step E web revision 与 web 源一致；Step F hub
      revision 与 hub HEAD 一致且无宿主 dist 挂载。
- [ ] web revision 落后源码时先 `rebuild-web.ps1` 再 `docker compose up -d web`；
      **不要用重启容器代替重建**（静态镜像无运行期 env）。
- [ ] `docker compose pull` + `--force-recreate` 实际拉取 GHCR 镜像；核对 OCI
      revision 标签。

## 6. 产物与发布

- [ ] Release asset 大小/SHA256 与本地 tgz 相同；GitHub asset digest 核对。
- [ ] GHCR tag/latest digest 记录（WA / hub）；`latest` 指向同 digest。
- [ ] 发布记录：`docs/RELEASE-backend-<date>.md` + ADR §15 追加；docs/README
      索引更新。
- [ ] 回滚边界写明：B flag off 重建 web（数据保留；MS/hub 不回滚；RPC 向后兼容）。

## 7. 发布后

- [ ] 生产 web 镜像 hooks off、B on；验证 `verify-stack` 17/17。
- [ ] 限流恢复生产默认（见 §4）。
- [ ] 把本轮新发现的 waiver/backlog 写入 ADR 残项表，标明 owner 与下一步。

---

## 自动化

- **public CI**（`.github/workflows/ci.yml`）：Rush 构建 `@itwin/core-frontend` 闭包 →
  shared/editor/viewer/web 单测 + tsc/lint。不跑真栈 e2e。
- **backend CI**（`.github/workflows/ci.yml`）：克隆 public 到 `D:\a\tiangong-kaiwu` →
  Rush 构建 `@itwin/core-backend` 闭包 → modeling-server tsc/lint + middleware 单测。
  **native 全量仍走本清单第 3 节本地门**（托管 runner 未预置 dev build / slvs.node）。

```powershell
# 快速检查（不跑 verify-stack；当前产物为 native store fallback 时显式放行）
powershell -File scripts/release-gate.ps1 -AllowNativeFallback -SkipVerifyStack

# 完整发布门（生产限流已恢复）
powershell -File scripts/release-gate.ps1 -ExpectedSha256 <release-asset-sha256>
```

退出码 0 = 通过；非 0 = 有 FAIL 项（WARN 不阻断，但必须写进发布记录）。
