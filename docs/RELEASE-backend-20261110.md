# Release backend-20261110（shared 1.64.0）

2026-11-10 后端发布：精确 faceExtrude（ADR-0016 A1/A2/A3/A4）进入公开产物。

## 内容

- **shared 1.64.0**：`FaceExtrudeParams` 新增 `startOffsetMm`、`draftAngleDeg`、
  `draftPullDirection`；`LubanFeatureRpcInterface` 1.64.0。
- **modeling-server A1/A2**：
  - A1：faceExtrude 以选中面边界为 profile，沿面法向 startOffset，draft 复用
    faceExtrude 通道；失败封闭（含 remove/intersect 零相交、面/环/body 守卫）。
  - A2：faceExtrude draft 使用逐边平面/锥面 shell + Sew，tool/最终 Unite 全部
    line/arc 解析边；无 native/P0-08 变更。
- **A3/A4（test-only replay）**：S10 CAP_FACE profile → faceExtrude；Bumper
  Fillet 1 rb=3 oracle 16/16（Onshape 实际选择；底面 4 条尖边未选），
  最终 636,731.650 vs 636,731.499 mm³（+0.000024%），全 status=0、1 body、
  push+冷重开、approximateSteps=0。
- **S3（test-only replay）**：REMOVE/INTERSECT/THROUGH_ALL 方向语义与
  `depthMm` 忽略；合成真栈 15,000 / 4,000 / 18,500 mm³ 及产品朝内法向 15,000 mm³。
- 无 UI 变更；旧 backend 缺新字段时会静默 strip（X-11），必须使用本批 backend。

## 产物

- MS：`modeling-server-win-x64-backend-20261110.tgz`（GitHub Release，
  含自包含依赖 + imodeljs-native dev build；store fallback provenance 已披露）。
- GHCR：`ghcr.io/chenjinxian/imodelhub-public:backend-20261110`、
  `ghcr.io/chenjinxian/luban-webhook-agent-public:backend-20261110`
  （hub/WA 镜像内容与 backend-20261109 相同；A1/A2 只在 MS 产物）。
- 公开 strict 示例：**19**（工作树）；私有索引 `replicable-now` **18**
  （Bumper 为第 18 例，带 `strictPath=rb3-oracle-16/16` caveat；generic resolver
  仍 12 边 blocked-kernel）。私有 evidence（scenarios/oracle/index/converter）
  已固化；A1/A2 backend 随本发布可复现。
- iOS First Part 真栈 `EXAMPLE_RESET=1`：157,478.736 vs 157,478.9 mm³，
  tree/status/1 body/push+冷重开。

## 验证

- 发布产物 Bumper strict **2 passed**（636,731.650 vs 636,731.499，
  pre-fillet 657,764.787185、20/20 line、16/16 oracle、push+冷重开）。
- `verify-stack.ps1` 全栈验收结果见发布日志；shared 196/196、backend 910
  passed / 1 expected fail / 8 skipped（发布前）；web e2e tsc/lint 绿。
- 回滚：回到 `backend-20261109` 产物与镜像；A1/A2 仅新增可选字段，
  旧载荷兼容；X-11 旧 backend 不兼容新字段，禁止混用。
