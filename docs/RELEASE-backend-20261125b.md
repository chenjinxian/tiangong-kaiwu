# Release backend-20261125b（本地体验预览）

> **非工业发布**。本 release 用于让新用户 `clone` 后可用 quickstart 完成
> 注册/登录 → 建文档 → 建模型 → 编辑模型；未提供 SBOM、镜像签名/attestation、
> release-manifest，未通过 G0/G1 Gate，不得用于生产、合规或对外 SLA 承诺。

- 日期：2026-11-25
- 公开源提交：`911bf0349bfefe22d7a9287f3b1195a24aa4e1ee`（branch `g1-hardening-20261122`）
- Feature RPC 契约：`1.85.0`
- GitHub Release：<https://github.com/chenjinxian/tiangong-kaiwu/releases/tag/backend-20261125b>
- Release 资产：`modeling-server-win-x64-backend-20261125b.tgz`
  - size：147,597,294 B
  - sha256：`42f2eaac10b9a21f9051473b43f6bfaf38a23931fe2ffffca8b5ace03e1b21ad`

## 镜像（GHCR，tag `backend-20261125b`）

| 镜像 | digest | 说明 |
|---|---|---|
| `ghcr.io/chenjinxian/luban-web-public` | `sha256:d2e4f4628913b38bb3b01fe22e6c3bf9072c17db0b2af839543d8dd93efc3431` | 本仓当前源码构建；`VITE_B_MODEL_ENABLED=true`；含 `/confirm-email` 路由 |
| `ghcr.io/chenjinxian/imodelhub-public` | `sha256:f6f0755915d169b2b625fd888492e94172244b3ee00d88fa39f6045f99ad6e6d` | 与 `backend-20261110` 同一镜像，仅新 tag |
| `ghcr.io/chenjinxian/luban-webhook-agent-public` | `sha256:e66de9ba148c58dcee534586695c8a476cbcbeb383efc9c2ea77a2cbb05e3ee8` | 与 `backend-20261110` 同一镜像，仅新 tag |
| `ghcr.io/chenjinxian/luban-bff-public` | `sha256:ddf1d5bed23690d34d410ad43ad24a488397db1af852e7eebe390966fd376086` | 与 `backend-20261110` 同一镜像，仅新 tag |

`scripts/fetch-backend.ps1` 会把 release tag 写入 `.env` 的
`LUBAN_RELEASE_TAG`；compose 的四个公开镜像与 MS 产物使用同一 tag。

## modeling-server 产物

- 契约：`LubanFeatureRpcInterface.interfaceVersion=1.85.0`
  （source sha256 `eae4bc5a…`，与公开源一致）。
- native：`@bentley/imodeljs-native` `5.15.5`，dev build；从 pinned tag
  `v5.15.5` 的显式 Delivery 打包；公开 provenance 内记录
  `imodeljs.node` `4017e5d1…`、`SPAAcisDs.dll` `41be0fd7…`、
  `iTwinNapi.dll` `a75629f2…`。
- 打包前通过 release lock 冻结安装、真实 `tsc`（无 `--noCheck`）、
  依赖唯一性/tgz 断言；产物内只含脱敏 `provenance.public.json`。

## 验收（隔离干净栈）

使用独立 compose project（独立 volume），生产 web 镜像 + 本 MS 产物 +
同 tag 的 Hub/WA/BFF：

1. 注册 → 登录（预览 Hub 注册后可直接登录；若提示确认则走 Maildev `:1080`）；
2. 新建 B 项目；
3. 新建 iModel，轮询到 `已初始化`；
4. 自动打开 Part Studio（`已连接`）；
5. 草图：拐角矩形闭环；
6. 拉伸：选中 1 个面域 → 特征树出现「拉伸 1」；
7. 撤销回草图、重做回拉伸；
8. 页面零致命错误。

Playwright 生产线用例：`release image: register -> document -> iModel ->
Part Studio -> sketch/extrude -> undo/redo`，**1 passed（31.1s）**。

`fetch-backend.ps1` 不带参数实测：解析 `latest` → `backend-20261125b`，
资产 SHA256 校验通过，四个镜像按同 tag 拉取/复用，解压后契约 1.85.0。

`verify-stack.ps1 -SkipBaseline`（隔离 project）**12/13 通过、退出码 0**；
唯一 WARN 是干净 clone 未检出私有 hub 仓（无法比较 hub 镜像 revision）。
Step G：`web=1.85.0 MS=1.85.0（同代）`。iModel 创建/baseline/编辑链由上述
Playwright 用例覆盖，不把本次 -SkipBaseline 结果写成全栈验收通过。

## 已知限制与后续

- Hub/WA/BFF 仍是 `backend-20261110` 的行为；注册可能无需邮件确认。
- 本 release 未生成 SBOM/签名/attestation/release-manifest；不是 G1/G0 工业
  Gate 的产物，也不证明生产可用。
- 同代工业发布必须：重发全部镜像、补齐发布证据与 manifest、通过 release gate +
  `verify-stack` + 产物模式编辑器冒烟，并在发布记录中登记 digest 与审批。
- `backend-20261125`（无 `b`）产物的 native Delivery 组合在打开 briefcase 时
  挂起，已废弃，不得使用或发布。
