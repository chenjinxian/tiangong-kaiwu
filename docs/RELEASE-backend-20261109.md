# Release backend-20261109 — 草图/特征能力完整检查点

日期：2026-11-09。目标：把 2026-11-06 以来积累的草图/特征能力（shared 契约
**1.63.0**）作为一套可匿名获取的公开产物发布，供外部体验者与后续示例复刻使用。

## 公开产物

| 产物 | 引用 | Digest / SHA256 |
|---|---|---|
| web | `ghcr.io/chenjinxian/luban-web-public:backend-20261109` / `:latest` | `sha256:1d7555d22d33d29b887672237f78b5281b3bc353804b7723ff9a8e60249dc9a9` |
| bff | `ghcr.io/chenjinxian/luban-bff-public:backend-20261109` / `:latest` | `sha256:ddf1d5bed23690d34d410ad43ad24a488397db1af852e7eebe390966fd376086` |
| imodelhub | `ghcr.io/chenjinxian/imodelhub-public:backend-20261109` / `:latest` | `sha256:f6f0755915d169b2b625fd888492e94172244b3ee00d88fa39f6045f99ad6e6d` |
| webhook-agent | `ghcr.io/chenjinxian/luban-webhook-agent-public:backend-20261109` / `:latest` | `sha256:e66de9ba148c58dcee534586695c8a476cbcbeb383efc9c2ea77a2cbb05e3ee8` |
| modeling-server | Release `backend-20261109` / `modeling-server-win-x64-backend-20261109.tgz` | `sha256:1f4c16474a5709b3c979c45a4c076992133fbf56d695fe05dfa07e3bf17af94e`（179,035,866 B） |
| 部署包 | Release `backend-20261109` / `luban-cad-deploy.zip`（稳定名） | `sha256:a877234d83ecdac01d6d3f4da2f9ca984546a799581b55f13b3d1ecd972a3dc6`（56,862 B，无需 clone 源码仓） |

- modeling-server 契约 `LubanFeatureRpcInterface.interfaceVersion = 1.63.0`
  （产物内 `@luban-cad/shared` 与公开仓源码一致）。
- 源码基线：public `fd5291682d`（`feat(parity): checkpoint full sketch/feature
  capability work`）、backend `c52861c`（`feat(feature): checkpoint full
  sketch/feature capability work (shared 1.63)`）、hub `61e78c5`。
- 原生库 provenance（产物内 `native-provenance.json`）：`@bentley/imodeljs-native`
  5.15.5，imodel-native HEAD `d34a8a38d0e2`，required tag `v5.15.5`；store dev
  build 时间 2026-11-02，早于 native HEAD（2026-11-04），本次为**显式 store
  native fallback**（发布门 WARN，已披露），Windows x64。
- 官方基础设施镜像：postgres:17-alpine / redis:7-alpine / maildev/maildev /
  azurite / nginx:alpine（公开 registry）。

## 本批能力范围（相对 backend-20261106 的 1.32.0）

- 草图：草图→草图投影（ADR-0009 切片 1a）、MIRROR 约束与草图镜像工具
  （line/point/circle/arc/spline）、Point/CenterRectangle/AlignedRectangle/
  CenterArc/Bezier/TangentArc/PerimeterCircle/正多边形工具、equal arc/arc、
  point-on-line/point-on-circle 自动共点推断、外部引用缺口仍在。
- 特征：extrude 第二方向/拔模/THIN 薄壁/upToSurface/upToNext/upToVertex、
  revolve 多面域、hole 沉头孔/倒角孔/钻尖角/upToNext、shell、chamfer 三模式、
  mirror 任意世界平面/面引用/operation、featureMirror 多源、featurePattern/
  body pattern 多源·居中·第二方向·反向、transform、splitPart、moveFace、
  booleanBodies intersect、cPlane LINE_ANGLE/LINE_POINT/THREE_POINT。
- UI：TransformDialog、SplitPartDialog、FeaturePatternDialog 第二方向/多源
  回显、MoveFaceDialog、ShellDialog、HoleDialog、Capsule/多边形/镜像等草图
  工具入口；未实现能力保持 gated 或 blocked，不以假控件冒充。
- 真实 PS 示例仍有 blocker（imprint 精确区域、PROJECTED/PIERCE 外部引用、
  统一 selector、多体作用域、数据缺口），不计入本批完成门；详见
  `docs/superpowers/plans/2026-11-06-example-coverage-continuous.md`。

## 验收

- `scripts/verify-public-deps.ps1` **11/11**：4 个 GHCR 包匿名 manifest 200 +
  Release MS 资产 digest 一致 + 稳定名部署包 + 5 个官方基础设施引用。
- `scripts/release-gate.ps1 -ExpectedSha256 1f4c…af94e -AllowStoreFallback`
  **FAIL=0 WARN=1**（WARN = 已披露的 native store fallback）；内联
  `verify-stack.ps1` **17/17**：
  - health×5、登录→iTwin→iModel→baseline 数据链、WS cookie 握手与无凭证拒绝；
  - MS dev-build 横幅命中产物 provenance；web 镜像 revision `fd5291682d` 与源一致；
  - hub revision `61e78c5` 与 hub HEAD 一致，无宿主 dist 覆盖挂载。
- 单元/集成门（源码基线）：backend **883 passed / 1 expected fail / 8 skipped**
  （101 files）；shared **171/171**；web **1527/1527**；tsc/lint/e2e tsc 绿；
  真栈 capability specs（transform/splitPart/pattern/featurePattern/mirror/
  extrude/hole/sketch 等）均已按切片记录通过。
- 镜像内容审计：hub/WA push 前硬门通过（无 `src/`、`*.map`、`*.d.ts`、
  `*.test.js`）；web 为静态产物；bff 为 dist + 生产依赖。
- 本地栈：`docker compose pull` + `up -d --force-recreate web bff imodelhub
  webhook-agent nginx` 从 GHCR 实际拉取；4 镜像匿名可拉取；宿主 MS 以
  `dist-backend` 产物启动 `:5401`；浏览器加载 `http://localhost:5301/`
  标题 LubanCAD，console **0 error**。

## 已知限制 / 回滚

- 仅 Windows 10/11 x64；modeling-server 为 Windows 原生宿主进程，Linux/macOS
  不支持。
- 本次发布窗口未重跑全量 Playwright 套件；真栈验收以各能力切片 spec、
  `release-gate` 与 `verify-stack` **17/17** 为准（不宣称全量 e2e 通过）。
- native store dev build 早于 imodel-native HEAD：HEAD 之后的原生修复不保证；
  升级 native 后需重跑 `replace-imodeljs-native.ps1` 并重新打包。
- 真实 PS 示例覆盖仍受 imprint/外部引用/selector/多体/数据缺口阻塞；本发布
  不宣称示例完成率变化。
- 回滚：上一公开 Release 为 `backend-20261106`（契约 **1.32.0**；hub 另有
  `backend-20261106b` 冷开修复）。本次 `latest` 镜像已被覆盖，回滚需按旧 tag
  重新拉取/推送并重装旧 MS 产物；web 可用
  `rebuild-web.ps1 -BModelEnabled false` 回 A UI（B 数据保留）。
