# ADR-0003：Onshape parity 场景与证据契约

- 状态：已接受（2026-11-04；owner 指示继续实现）
- 关联：`docs/superpowers/specs/2026-11-04-onshape-example-replication-airr.md`
- 决策者：LubanCAD 平台团队

## 背景

Onshape 示例复刻需要同时保存原始采集证据、可回放的建模场景、几何对拍基准和
UI 证据。直接把 Onshape 原始响应塞进 e2e 会导致：场景不可读、无法按能力分级、
无法区分“证据缺失”和“实现失败”。

同时，P0-04 要求新契约先 ADR；P0-05/P0-07 要求不得新建第二套建模 API 或平行契约。

## 决策

1. **场景契约是测试/证据契约，不是产品 RPC**。定义版本化的
   `parity-scenario.schema.json`，不进入 `@luban-cad/shared` 运行时接口。
2. 场景 v1 字段：
   - `schemaVersion`, `id`, `docId`, `elementId`, `owner`, `name`
   - `units`（默认 Onshape 米）
   - `features[]`：`type`, `params`, `sourceFeatureId`, `rollback`
   - `expected`：`volumeM3`, `bodyCount`, `massProperties`, `bodies[]`
     （`partId`, `name`, `volumeM3`, `massKg`, `centroid`，来自逐 body
     `massproperties.per-part.json`）, `featureTree`, `tolerance`
     （默认体积 ±1%，Tutorial 2 使用 ±0.5%）
   - `ui`：`evidence`（截图/DOM/ARIA 的相对路径）、`selectors`、`actions`
   - `provenance`：采集时间、源 microversion、缺失项、状态
     （`complete` / `blocked-evidence` / `blocked-capability`）
3. **回放路径**：
   - 几何：现有 `FeatureService` / `FeatureOp`（或 StandaloneDb CorpusReplay）；
   - UI：现有 Playwright 真栈 e2e，通过真实 ribbon/canvas/dialog 驱动；
   - 不新增建模 RPC；直接编辑继续走 `EditTools` + 标准 IPC。
4. **证据分层**：
   - `ui` 证据按代表 Part Studio 采集截图、压缩 DOM 轮廓、ARIA；
   - 不宣称无证据的像素级 parity；
   - 缺 massproperties/parts/features 时场景不得标记为 green，只能标记 `blocked-evidence`。
5. **私有/公开边界**：原始语料与截图留在私有 parity 数据仓；公开仓只放 schema、
   runner、脱敏文档和聚合覆盖结果。逐 body 质量属性来自
   `massproperties.per-part.json`；聚合 `-all-` 值不能冒充单 body 期望。
6. **版本化**：schema 破坏性变更必须 bump `schemaVersion`，旧场景由转换器迁移；
   不允许静默改字段语义。

## 备选方案

- **截图-only 验收**：无法验证几何/特征参数，拒绝。
- **新增 parity RPC/第二套建模 API**：违反 P0-05/P0-07，拒绝。
- **解码 Onshape 内部二进制 WebSocket**：没有公开/合法协议依据，拒绝。

## 后果

- 每个示例需要一份场景描述和证据清单；初期工作量增加，但可审计、可分批。
- 首批六份文档先建立 schema 实例；后续 526 文档按同一 schema 扩展。
- 场景/证据不改变产品运行时契约，发布顺序不受影响；若发现缺失 FeatureOp，
  另立 ADR 并 bump shared 版本。

## 实现记录（2026-11-04）

- 公共仓：`luban-cad/scripts/onshape-parity/parity-scenario.schema.json`、
  `scenario.mjs`（validator/loader）、`from-gold.mjs`、`scenario.test.mjs`；
  Tutorial 2 场景 fixture：`luban-cad/apps/web/e2e/fixtures/parity/tutorial2.scenario.json`。
- 私有数据仓：`tools/scenario/from-onshape.mjs` 从原始 features 导出场景；
  Tutorial 2 iOS 场景已生成，`provenance.status=blocked-capability`，缺失项为
  DIAMETER、point-circle coincident、imprint-face extrude、chamfer cap-edge 映射。
- 验证：`node --test scripts/onshape-parity/scenario.test.mjs` **8/8 passed**；
  iOS 场景经同一 validator 校验通过（4 features，157.479 cm³）。
