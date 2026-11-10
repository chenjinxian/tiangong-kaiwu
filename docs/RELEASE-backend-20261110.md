# Release backend-20261110（shared 1.64.0）

2026-11-10 后端发布：精确 faceExtrude（ADR-0016 A1/A2/A3/A4）与 S3
CAP_FACE 方向语义进入公开产物；Bumper Block 严格轨随之可复现。

## 公开产物

| 产物 | 引用 | Digest / SHA256 |
|---|---|---|
| web | `ghcr.io/chenjinxian/luban-web-public:backend-20261110` / `:latest` | `sha256:3bf45cb54c63b418988ed8d02721fb50b27f4ea2ddc20929d96fe670b222ad4a` |
| bff | `ghcr.io/chenjinxian/luban-bff-public:backend-20261110` / `:latest` | `sha256:ddf1d5bed23690d34d410ad43ad24a488397db1af852e7eebe390966fd376086` |
| imodelhub | `ghcr.io/chenjinxian/imodelhub-public:backend-20261110` / `:latest` | `sha256:f6f0755915d169b2b625fd888492e94172244b3ee00d88fa39f6045f99ad6e6d` |
| webhook-agent | `ghcr.io/chenjinxian/luban-webhook-agent-public:backend-20261110` / `:latest` | `sha256:e66de9ba148c58dcee534586695c8a476cbcbeb383efc9c2ea77a2cbb05e3ee8` |
| modeling-server | Release `backend-20261110` / `modeling-server-win-x64-backend-20261110.tgz` | `sha256:44d064d624a92f351fd76dff26688957eadd0d939d57e5269067e0a911dab080`（179,521,717 B） |
| 部署包 | Release `backend-20261110` / `luban-cad-deploy.zip`（稳定名） | `sha256:9e16c3281832b59c4cd07ba87033356abd34d1417a0138b51a580d1665a780da`（56,861 B） |

- 源码基线：public `1e18d07ddd04`（`feat: backend-20261110 exact faceExtrude
  and Onshape example closure`）、backend `5e7c03a`、hub `61e78c5`。
- web 镜像是本批新构建（revision `1e18d07ddd04`）；bff/hub/WA 内容与
  `backend-20261109` 相同，只做同 digest 的 `backend-20261110`/`latest` 重标。
- modeling-server 契约 `LubanFeatureRpcInterface.interfaceVersion = 1.64.0`
  （产物内 `@luban-cad/shared` 与公开仓源码一致）。
- 原生库 provenance（产物内 `native-provenance.json`）：`@bentley/imodeljs-native`
  5.15.5，imodel-native HEAD `fdef7d0fc6eb`，显式 store native fallback
  （`fallback=true`，发布门 WARN 已披露），Windows x64。

## 本批能力范围（相对 backend-20261109 的 1.63.0）

- **shared 1.64.0**：`FaceExtrudeParams` 新增 `startOffsetMm`、
  `draftAngleDeg`、`draftPullDirection`；`LubanFeatureRpcInterface` 1.64.0。
- **modeling-server A1/A2**：
  - A1：faceExtrude 以选中面边界为 profile，沿面法向 startOffset，draft 复用
    faceExtrude 通道；失败封闭（含 remove/intersect 零相交、面/环/body 守卫）。
  - A2：faceExtrude draft 使用逐边平面/锥面 shell + Sew，tool/最终 Unite 全部
    line/arc 解析边；无 native/P0-08 变更。
- **A3/A4（test-only replay）**：S10 CAP_FACE profile → faceExtrude；Bumper
  Fillet 1 rb=3 oracle 16/16（Onshape 实际选择；底面 4 条 z=0 尖边未选），
  最终 636,731.650 vs 636,731.499 mm³（+0.000024%），全 status=0、1 body、
  push+冷重开、approximateSteps=0。
- **S3（test-only replay）**：REMOVE/INTERSECT/THROUGH_ALL 方向语义与
  `depthMm` 忽略；合成真栈 15,000 / 4,000 / 18,500 mm³ 及产品朝内法向
  15,000 mm³。
- 无产品 UI 变更；旧 backend 缺新字段时会静默 strip（X-11），必须使用本批
  backend 才具备精确 faceExtrude。

## 示例索引与复现

- 公开 strict 示例：**19**；私有 `manifest/example-index.json`
  `replicable-now`：**18**。
- Bumper 为第 18 例，条目携带 `strictPath=rb3-oracle-16/16`、
  `requiresBackend=backend-20261110`、`genericResolver=12-edge blocked`。
  私有 converter/oracle/scenario 证据已固化；A1/A2 backend 已随本发布提供。
- generic resolver 仍为 12 边 blocked-kernel，是独立限制；不得把 strict
  oracle 轨说成通用 resolver 已修复。
- iOS First Part 真栈 `EXAMPLE_RESET=1`：157,478.736 vs 157,478.9 mm³，
  tree/status/1 body/push+冷重开。

## 验收

- 发布产物 Bumper strict **2 passed**（636,731.650025 vs 636,731.499，
  pre-fillet 657,764.787185、20/20 line、16/16 oracle、push+冷重开）。
- `verify-stack.ps1` **17/17**：health×5、登录→iTwin→iModel→baseline 数据链、
  WS cookie 握手与无凭证拒绝、MS dev-build 横幅、web 镜像 revision
  `1e18d07ddd04`、hub 无宿主 dist 覆盖挂载且 revision `61e78c5`。
- `verify-public-deps.ps1` **11/11**：4 个 GHCR 包匿名 manifest 200 +
  Release MS 产物 digest 一致 + 稳定名部署包 + 5 个官方基础设施引用。
- 单元/集成门（源码基线）：shared **196/196**；backend **910 passed /
  1 expected fail / 8 skipped**；web tsc/lint/e2e tsc 绿（本发布窗口未重跑
  全量 Playwright，真栈以 Bumper strict、`verify-stack` 和
  `verify-public-deps` 为准）。
- 镜像内容审计：hub/WA push 前硬门通过（无 `src/`、`*.map`、`*.d.ts`、
  `*.test.js`）；web 为静态产物；bff 为 dist + 生产依赖。

## 已知限制 / 回滚

- 仅 Windows 10/11 x64；modeling-server 为 Windows 原生宿主进程。
- native 使用 store fallback（5.15.5，早于 imodel-native HEAD）：
  HEAD 之后的原生修复不保证；升级后需重跑 `replace-imodeljs-native.ps1`
  并重新打包。
- 真实 PS 示例覆盖仍受 imprint/外部引用/selector/多体/数据缺口阻塞；
  Bumper 的 generic resolver 仍 12 边 blocked-kernel。
- 回滚：上一公开 Release 为 `backend-20261109`（契约 **1.63.0**）。本次
  `latest` 四个镜像已覆盖；回滚需按旧 tag 重新拉取/推送并重装旧 MS 产物。
  X-11：旧 backend 不兼容 1.64.0 新字段，禁止新旧混用。
