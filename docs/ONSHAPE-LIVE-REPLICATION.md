# Onshape 示例实时复刻通道（规则与经验）

本文是公共仓的**操作规则/参考经验**，不记录逐例进度或私有证据。当前示例
清单、体积与跳过项以私有 `onshape-parity-data/docs/LIVE-UI-SPECS.md` 和
`docs/superpowers/plans/2026-11-11-live-onshape-ui-replication.md` 为准。

## 1. 数据来源与边界

- 优先使用私有 corpus：`features.json` + `sketches.json` +
  `massproperties.per-part.json`；没有完整数据时再走公开文档的可编辑副本和 UI。
- 原始 features/草图坐标/DXF/截图只留在私有仓；公共仓只放 runner、测试和脱敏规则。
- approx 结果**不进** strict `/examples` 目录；只有树/体/体积/约束等全部验证后才升级。

## 2. 可编辑副本

1. 公开只读文档点“创建副本以编辑”。
2. 填写副本名。
3. 在“复制文档到”区域**双击“由我所有”行**（单点会让 OK 显示“待定”且不创建）。
4. 等创建完成再关页；副本 id/workspace/element 写入私有 `manifest/live-copies.json`。
5. 精确草图：右键草图 → “导出为 DXF/DWG…” → DXF；单位按文档（英寸/毫米）。
   点草图不导出实体，孔位等需另行读取。

## 3. corpus 草图还原

- `sketchMatrix` 是**世界基的跨列**排列：
  `xDir=(m0,m4,m8)`、`yDir=(m1,m5,m9)`、`normal=(m2,m6,m10)`，
  平移 `(m12,m13,m14)`；corpus 单位 m→mm。
- 外环必须用**精确端点**并保持 **CCW**；3 位小数或顺时针会让 region 只识别出
  部分圆区域（Links 实测）。
- 先 `LIVE_DEBUG=1` 读产品 `sketch.regions`（area/outer/hole ids），再按面积和
  实体 id 选择 `regions`；多面域 `NEW` 可能合并为多 lump 单体，必要时应按 part
  拆成独立草图/拉伸，不要伪造成多 body。
- 多体/跨体：
  - shared v1.68 的 `targetBodyIds` 用于 through-all REMOVE / 多目标边；
  - live spec 用 `targetBodyFeatureNames` / `targetBodyFeatureName`，单目标自动
    退化为 `targetBodyId`；
  - revolve 后也要跟踪其创建 body；
  - `featurePattern`/`featureMirror` 在多体时需显式目标 body；`featureMirror`
    以 `featurePattern` 为源、或 pattern 以 `featureMirror` 为源当前 status=1，
    不伪造（可改用显式镜像草图+拉伸+pattern 近似）。

## 4. 边/面/孔/壳

- 边：`e2e/examples/live/edge-select.ts`，支持 line/arc、方向、中点、长度，
  以及整圆弧 `center/radiusMm`；唯一匹配后 `resolveEdgeRef`。
- 面：`e2e/examples/live/face-select.ts`，支持面 AABB `center`、`normal`、
  `loopCount`；唯一匹配后 `resolveFaceRef`。`LIVE_FACE_DEBUG=1` 输出所有面，
  定位零/多匹配。
- shell：`defaultDistance=-thickness` 表示内缩，`distances=0`；正值为外扩。
  公共回归 `e2e/examples/live-shell.spec.ts`（合成 20×20×10 盒去顶面内缩 2 mm，
  1952 mm³）验证了面选择→resolveFaceRef→shell 全链。
- 孔：草图 point/顶点，通孔/盲孔/沉头/埋头字段已透传；mateConnector 型孔位
  需要显式重建并在 spec/notes 标 approx。

## 5. 运行与限流

- 单例：`LIVE_DEBUG=1 npx playwright test e2e/examples/live-registry.spec.ts
  --grep "<title>"`（在 `luban-cad/apps/web` 内）。
- 每个 spec 独立 iModel；测试会 push 并冷重开比对树/体/质量。
- MS RPC 限流 100 req/15 min；429 按 `retry-after` 等待。限流导致的失败不是
  代码回归；不得绕限流或并发堆请求。
- Onshape features API 采样由私有 supervisor 按 quota 窗口运行；鉴权失效即停，
  不保存凭据。

## 6. 已知边界

- 产品 region builder 对混合整圆+连线、顺时针/低精度端点、部分 imprint 语义
  仍有限制；不得用任意 region 或改深度“凑体积”。
- `featureMirror` 的 source=featurePattern、pattern 的 source=featureMirror
  仍为 status=1；需要时用显式等效几何，并登记差异。
- Gaiter（Fillet1）、Dog Bone Link（shell 对 deformed body）等内核/几何阻塞
  留在私有 `live-probes/`，不计入完成数。
