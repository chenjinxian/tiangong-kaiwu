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
  以及整圆弧 `center/radiusMm`；唯一匹配后 `resolveEdgeRef`。同一整圆被
  拓扑拆成多段圆弧时，选择器可加 `all:true` 收集全部匹配（CONNECTING_ROD
  的孔缘 R2 圆角实测 3 段/圈），缺省仍要求唯一。
- 面：`e2e/examples/live/face-select.ts`，支持面 AABB `center`、`normal`、
  `loopCount`；唯一匹配后 `resolveFaceRef`。`LIVE_FACE_DEBUG=1` 输出所有面，
  定位零/多匹配。
- shell：`defaultDistance=-thickness` 表示内缩，`distances=0`；正值为外扩。
  公共回归 `e2e/examples/live-shell.spec.ts`（合成 20×20×10 盒去顶面内缩 2 mm，
  1952 mm³）验证了面选择→resolveFaceRef→shell 全链。
- 孔：草图 point（`pointEntityIds`）或曲线顶点/圆心（`vertexRefs`），
  通孔/盲孔/沉头/埋头字段已透传；`direction` 决定切向。公共回归
  `e2e/examples/live-hole-vertex-refs.spec.ts`（20×20×10 盒上两个圆心
  Ø4 through-all 反向，去材 251.327 mm³、结果 3748.689）验证全链与冷重开。
  mateConnector 型孔位需要显式重建并在 spec/notes 标 approx。
- booleanBodies：live step 用 `targetBodyFeatureNames` / `toolBodyFeatureNames`
  解析各特征创建的 bodyKey，构造 `BodyRef[]`，支持 unite/subtract/intersect
  与 keepTools。公共回归 `e2e/examples/live-boolean-bodies.spec.ts`（20×20×10
  盒与 10×10×10 盒 unite，4500 mm³）验证全链与冷重开。
- featureMirror：除单源 `sourceFeatureName` 外，支持
  `sourceFeatureNames`（多源，恰一）→ 产品 `sourceFeatureIds`。公共回归
  `e2e/examples/live-feature-mirror-multi.spec.ts`：40×20×10 板 + 两个
  4×4×5 凸台一次 YZ 镜像 → **8320.000 mm³**、1 body、status=0、push+冷重开。
- transform：live step 支持 translation/rotation/scale/scaleAxes/scaleOrigin/copy，
  可选 `targetBodyFeatureName` 锚定 body；参数原样透传标准 `transform` FeatureOp。
  公共回归 `e2e/examples/live-transform.spec.ts`（20×20×10 盒 +X 平移 30 mm，
  4000 mm³、质心 x=30）验证全链与冷重开。copy=true 是原件+副本 Unite（同一
  body 多 lump），不是独立零件副本。
- splitPart：live step 支持 XY/YZ/XZ + offsetMm + keepSide + 可选目标 body；
  公共回归 `e2e/examples/live-split-part.spec.ts`（20×20×10 盒 YZ x=0 保留
  正侧，2000 mm³、质心 x=5）验证全链与冷重开。双侧/面驱动仍是产品缺口。
- moveFace：live step 复用面选择器（center/normal/loopCount），透传
  `distanceMm` 或逐面 `distancesMm`，可选目标 body；公共回归
  `e2e/examples/live-move-face.spec.ts`（20×20×10 盒顶面 +5 mm，6000 mm³、
  质心 z=7.5）验证全链与冷重开。
- cPlane：live step 支持 world 基准面 + offset/origin/flipNormal/line+angle/
  line+point/threePoints；后续草图可用 `planeFeatureName` 引用该 step 的平面
  快照（runner 自动补 `sourceFeatureId`，保证被引用平面改参/删除受产品守卫）。
  公共回归 `e2e/examples/live-cplane.spec.ts`（Top 偏移 10 → 草图 20×20 →
  拉伸 10，4000 mm³、质心 z=15）验证全链与冷重开。
- 草图→草图投影：sketch step 的 `projections` 用 `sourceSketchName` 解析前序
  草图 id，透传 `insertSketch.projections`（平行平面 line/circle/arc/point）。
  **目标 entityId 必须间隔分配**（如 101/111/121/131）：每个投影线会合成
  2 个派生点，连续 id 会在第 3 个投影报 `投影实体 id 冲突`。公共回归
  `e2e/examples/live-sketch-projection.spec.ts`：4 条矩形边投影到 z=10 草图
  再拉伸 10 → **4000.000 vs 4000.000 mm³**、1 body、status=0、push+冷重开。
- loft/sweep：`loft` step 接受两张截面草图名（产品首版两截面、SOLID）；
  `sweep` step 接受轮廓/路径草图名（路径须单直线且与轮廓平面法向有非零投影）。
  公共回归 `e2e/examples/live-loft-sweep.spec.ts`：20×20→10×10 线性 loft
  **2333.333 mm³**（解析 ∫(20−z)²dz）、10×10 轮廓沿 +Z 20 mm 扫掠
  **2000.000 mm³**，均 push+冷重开。
- faceExtrude：`faceExtrude` step 用面选择器解析目标 body 上的持久面引用，
  透传 operation/endBound/depth/direction/startOffset/draft，目标 body 必填。
  公共回归 `e2e/examples/live-face-extrude.spec.ts`（20×20×10 盒顶面 add
  blind 5 mm，6000 mm³、质心 z=7.5）验证全链与冷重开。
- PART/body pattern：`pattern` step 支持 linear/circular、世界轴 X/Y/Z、
  centered/oppositeDirection/第二方向。**语义差异**：产品把阵列实例并入
  同一 body（多 lump），Onshape Part Studio 会生成多个 part 实例；逐例必须
  如实记录，不能把 body 数写成 Onshape 的 part 数。公共回归
  `e2e/examples/live-body-pattern.spec.ts`（10×10×10 盒 3 实例、间距 20 →
  3000 mm³、产品 1 body）验证全链与冷重开。
- PART/body mirror：`mirror` step 支持世界平面 XY/YZ/XZ、任意 `planeLine`
  或目标体 `face` 选择器（面引用须配 `targetBodyFeatureName`），可选
  operation，产品以 `keepOriginal:true` Unite 为单 body 多 lump。公共回归
  `e2e/examples/live-body-mirror.spec.ts`（x∈[10,20] 盒 YZ 镜像 → 2000 mm³、
  质心 x=0）与 `e2e/examples/live-mirror-face.spec.ts`（20×20×10 盒顶面
  镜像 → 8000 mm³、质心 z=10）验证全链与冷重开。

## 5. 运行与限流

- 单例：`LIVE_DEBUG=1 npx playwright test e2e/examples/live-registry.spec.ts
  --grep "<title>"`（在 `luban-cad/apps/web` 内）。
- 每个 spec 独立 iModel；测试会 push 并冷重开比对树/体/质量。
- MS RPC 限流 100 req/15 min；429 按 `retry-after` 等待。限流导致的失败不是
  代码回归；不得绕限流或并发堆请求。
- **Auth setup 也会限流**：每次 Playwright run 的 `auth.setup.ts` 走 hub
  `POST /auth/email/login`；连跑多批后 hub 返回 429（响应头
  `retry-after-auth`，实测 749 s）。看到 `API 登录失败：HTTP 429` 时等待该
  窗口再跑，不要反复重试撞窗口；把多个 spec 合并成一次 run 以节省登录次数。
- Onshape features API 采样由私有 supervisor 按 quota 窗口运行；鉴权失效即停，
  不保存凭据。

## 6. 已知边界

- 产品 region builder 对混合整圆+连线、顺时针/低精度端点、部分 imprint 语义
  仍有限制；不得用任意 region 或改深度“凑体积”。
- `featureMirror` 的 source=featurePattern、pattern 的 source=featureMirror
  仍为 status=1；需要时用显式等效几何，并登记差异。
- Gaiter（Fillet1）、Dog Bone Link（shell 对 deformed body）等内核/几何阻塞
  留在私有 `live-probes/`，不计入完成数。
