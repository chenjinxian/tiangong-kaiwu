# Onshape 示例覆盖连续工作计划（执行台账）

> 这是执行台账，不是新的架构裁决；架构/范围以 `2026-11-06-example-coverage-master-airr.md` 为准。
> 状态：`[ ]` pending / `[~]` in progress / `[x]` done / `[!]` blocked/known-red。
> 每项完成必须附真栈或脚本证据；不得用 jsdom/截图替代几何验收。

## 当前基线

- 数据面：526 docs / 1685 API PS / 224 feature PS；严格 pipeline replicable-now **0**，raw capability **8**；详见私有仓 `docs/EXAMPLE-COVERAGE.md`。
- 基础设施：registry/state/translator/runner/gallery/verify-registry 已落地。
- 已复刻：12 legacy iModel **12/12 已重开验证**；Sample Assignment 新增可审计 RPC
  场景全链（8915.860 mm³，9 特征）作为验收门，旧 UI 版 spec 降为 legacy 演示。
- 多 PS：`Exercise: Element Organization` 2 PS/2 bodies，重开 2/2。
- **geometry-ready 批量回放（2026-11-07 18:25 启动）**：私有仓
  `tools/batch-geo-ready-20261107.sh` 顺序跑 13 个 geometry-ready/dropped-constraints
  场景，每例间隔 8 分钟避开 hub 限流；结果写
  `onshape-parity-data/reports/geo-ready-20261107/summary.tsv`（公开仓只记录聚合，
  不提交原始数据）。**批次原始（20:24）11 pass / 2 fail；收口后 #11 修复转绿，
  有效 12/13，#6 Links 仍 known-red**（多 body scope），报告
  `reports/geo-ready-20261107/report.md`：
  pass = Wheel（2,442,293.737 vs 2,442,293.764 mm³）、Master Cylinder Piston、
  Extrude Remove（85,157.341 vs 85,157.342 mm³）、Brain Screen（2,686.604 vs
  2,686.592 mm³）、Tutorial 2 iOS First Part（157,478.901 vs 157,478.902 mm³）、
  四个 WARNING LABEL（Bench Vise / EDU / Professional Discovery / Onshape
  Quickstart，均 0.8193532 mm³）、Handle（38,314.220 / 68,563.590 vs
  38,314.765 / 68,563.589 mm³；旧场景的镜像槽端盖落在材料外，切量相同）、
  Top, Ring, Key（2,998.1418 vs 2,998.1430 mm³）。
  **#11 Sample Assignment / Alignment Plate（Explore-Onshape-Models）→ 已修复转绿**：
  首次回放 9,116.960 vs 8,915.860 mm³（+2.26%），`Cut 2 more holes` 去材 0。
  根因（解码 query 复核）：converter 把 4 条 imprintFace query 全解析到
  `FyXDqTD…`（Sketch 1 的 disambiguation line），真正根是
  `FtB4EYw28Ij2hDn_1.imprint`（Sketch 3）。修复：`imprintRootSketchId`
  （明文 `.imprint` 根优先；compact 取正文最早出现的已知草图 id）并只在根草图
  内匹配实体；同步给 backend `ScenarioReplay` 补 regionRisk 求交审计（与公共
  runner 同口径，[0,1,2,3]→[0,1]）。**离线回放 8,915.8629 vs 8,915.8599
  （+0.00003%）**；**真栈复跑 2 passed：8,915.860 vs 8,915.860 mm³，push+
  重开**。该场景自批次失败转为独立绿例；通用 replay 不再需要 T1 的显式映射。
  **fail #6 Links（Exercise: Creating Mate Connectors）→ 根因已定位并修复（converter）**：
  6 特征建链返回 ok，但 reopen 后 `tree.every(status===0)` 失败；体积日志
  `after Extrude 1: 157.080`，Extrude 2/3 追加 `0.000` body（期望 2 body /
  21,743.326 mm³）。**根因=converter 忽略 Onshape 圆弧 `geometry.clockwise`**：
  Links Sketch 1 的槽端盖圆弧 clockwise=true，旧转换把参数角当 CCW → 圆弧被镜像
  到另一侧半圆，端点与切线错位 180°，面域引擎只得到两个孔圆（各 78.54 mm²，
  拉伸 157.08 mm³）；修复后同草图面域 = 槽形 5,930.582 mm²（外环 [4,5,6,7]、
  孔 [1,2]），预期 Extrude 1 ≈ 11,861 mm³。语料 131 PS 中 **54 PS / 367 条
  clockwise 圆弧**受影响；本批 #6/#12（Handle）受影响。**#12 Handle 在旧场景
  下已通过**（槽端盖落在材料外，镜像/修正切量相同）。
  **修复后离线回放（backend StandaloneDb，临时探针已删）**：Links 2 body/3 特征
  status 全绿，body 11,861.2 / 10,196.3 mm³ vs 期望 11,704.09 / 10,039.24，
  总 22,057.5 vs 21,743.3（+1.44%，仍超 1% 容差）。差值可精确分解为
  **每个 body 少一个 R5 通孔 × 2 mm ≈ 157.06 mm³**：Onshape 的 Extrude 3
  （throughAll REMOVE，booleanScope 含两个 body 的源）**同时切两个 body**，而产品
  `insertFeature` 只接受单个 targetBodyId——回放只切了 0x1c。登记
  **blocked-capability: 多 body scope 单特征**，不改容差、不宣称绿。
  **真栈复跑（2026-11-07 20:41，新场景）**：树/status 断言通过（旧失败的
  `tree.every(status===0)` 已消失），体积断言 body[0] **+1.565%** 失败
  （web 与离线 backend +1.44% 口径一致：每 body 少一个 R5 通孔）；即剩余阻塞
  完全是多 body scope，圆弧修复已被真栈证实。首次复跑撞 MS 429
  (retryAfter=204)，等待后重跑成功，失败原因不是限流。
  **批次收口后已执行**：`batch-convert --force` 全量重转 →
  complete 1 / geometryComplete **15** / smoke 6 / blocked **76** / failed 53 /
  skipped 48（Hydraulic Components 转 geometryComplete；Links/Handle/
  Alignment Plate 转 smoke=regionRisk）；`index-examples.mjs` 刷新 →
  replicable-now 仍 2（Wheel / Master Cylinder Piston；其余被未映射
  constraints 维度挡住）。**真栈复跑**：Hydraulic 在 Fillet 1
  sweptEdge matches=0 阻塞（imprintFace 复合轮廓上游能力）；transform/shell
  已用合成真栈验证绿；Links（新场景）与 Handle（新场景）的真栈复跑见下条。
- **Rear Shock 覆盖尝试（2026-11-07，blocked-selector）**：`Intro to CAD
  1.2-1.4 / Rear Shock`（26 特征/5 body，geometryComplete）真栈回放到
  fillet/chamfer 的 sweptEdge 解析失败：
  `sweptEdge 匹配不唯一: sketch=FjPLHhWdEenLnZ7#17 source=FtbZVuj7KYsV7aB
  matches=0`（source=Extrude 1；该拉伸是 imprintFace ADD，5 条 query / 35 实体
  复合草图）。根因与 Hydraulic Components 同：**imprint 子面/复合轮廓未复刻**
  → 回放体缺少被选边，不是边解析器独立缺陷。**AIRR A2 内核查证修正**：
  `SolidModelingCommand.imprintBody` 绑定其实存在；开放线段 imprint 可用，但
  **闭合 Loop（圆/矩形）imprint 使 native worker 崩溃**（两次复现），故 face
  split 仍登记 blocked-kernel（闭合 wire 崩溃），不计入绿例。
- **批次收口后的复跑清单（2026-11-07）**：1) `batch-convert --force` 重转全部
  场景（含 clockwise 圆弧修正；54 PS/367 弧受影响）；2) 复跑 #6 Links
  （离线 +1.44%，预期 known-red：多 body scope）、#12 Handle（clockwise 弧修正后
  的真实体积）；3) 4 个 Universal Joint 变体场景（`649953bc/8d892a`、
  `90a3408e/accb08`、`a4c27182/419abe`、`e9d0c09c/246cb5`，各 3 条 CW 弧）
  重转后确认仍为 blocked-capability（imprint/face split），不因弧修复误标绿；
  4) 跑 Hydraulic Components（transform+shell capFace）与 Gaiter shell 回归；
  5) 刷新 `scenario-conversion.json`/`example-index.json` 并更新 B1 统计。
  未通过项一律按 blocker 登记，不调容差。
- **transform converter 切片（2026-11-07）**：离线证据 validator 14/14、
  translator 30/30、后端 TransformFlow 13/13；**真栈合成 2 passed**
  （`transform-target-scenario.spec.ts`：两圆柱体 targetSourceFeatureIds →
  targetBodyId，质心 0/70、体积各 1206.371，push+重开）。Hydraulic Components
  真实例回放阻塞在 **Fillet 1 sweptEdge matches=0**（Extrude 1 的 imprintFace
  复合轮廓未回放为外圆体），属上游 imprintFace/face split 能力，**不归因
  transform/shell**；该示例仍登记 blocked-capability，不宣称绿。
- **真栈环境（2026-11-07）**：上午 hub :5400 挂起 + docker daemon 无响应
  （Modern Standby WSL wedge；重启 Windows 后恢复）。**恢复后 MS 需以源码模式启动**
  （`start-ms-host.ps1 -Source D:/Github/luban-backend/modeling-server -Detach`，
  产物 1.32 不支持 1.35+ 契约）。hub 限流 100 req/15min；scenario-file 大批量
  回放会触发 429（实测 retryAfter=119s），批次之间需留窗口、按 PS 串行跑。
- **当前前沿（2026-11-07 21:20）**：批次 12/13 有效绿（Links 多 body scope
  known-red）；transform/shell 合成真栈绿；converter clockwise 圆弧、imprint 根、
  FACE pattern 源后缀三个根因已修；face split 内核查证=闭合 wire imprint 原生崩溃
  （blocked-kernel），editor Cut/Emboss 以 carrier Loop 作 profile 也 no-op。
  下一批仅剩阻塞项：多 body scope（架构）、face split（native 崩溃）、rib/draft
  （无通道）、ADR-0009 1b / splitPart 双侧（设计）、loft N/变量（大件产品能力）。
  FACE Linear Pattern PS（77b496/d405047）转换单 blocker 已解除，真栈到 Fillet 1
  sweptEdge matches=0（post-pattern 多体边解析）仍 blocked-selector。
  `Exercise: Inserting a BOM / Hydraulic Components`（664c42/a3c462，25 特征/
  4 body）重转后真栈同样在 Fillet 1 因 imprint 复合轮廓 matches=0 阻塞；
  Fillet 4 的 shell OFFSET_EDGE 缺口在其上游，暂不单独立项。
  **多 body scope 设计已落 ADR-0015（提议/blocked-design）**：首版拟只扩
  `insertFeature.targetBodyIds` + REMOVE extrude/hole 多目标，缓存改
  `(featureId,bodyId)` 键控；实现前后 Links 保持 known-red。
  **2026-11-08 环境证据**：`verify-imodels.spec.ts` 13 库重开在 Top, Ring, Key
  （iModel `09ea16a9-46dd-48aa-a866-04a0ee39db7a`）因 hub 返回 404
  `iModel not found` 中止；非代码回退，属 hub 数据被重置/未重建（该库需重建）。
  同轮 Hand Brake（7125.270）与 edge-selector（3 passed，iOS 157478.901）绿。
- 未提交/未推送（用户指令）。

## 连续任务顺序

### P0 — 清 known-red（先做，避免脏基线）

- [x] **T1 Sample Assignment 修复**
  - 已确认：scenario 前 8 个 sketch/extrude 可由 runner 建出；UI 倒角阶段曾卡住。
  - 修复：`runScenario` 结束释放自己取得的写租约（不释放页面租约）；两条“切除孔”
    的 Onshape 短码无法静态映射到本地 region 下标，spec 采用**显式可审计**映射
    （Sketch 2 / 源 `FarP0dnYC7HcDfB_1` → [0,1]；Sketch 3 / 源 `FtB4EYw28Ij2hDn_1`
    → [0,1]）；4 条 SWEPT_EDGE 由共享端点消歧的 edgeResolver 解析；约束以
    `skipSketchConstraints` 保留 Onshape 解算坐标，notes 登记 `constraints=dropped`。
  - 证据：`e2e/examples/sample-assignment-scenario.spec.ts` setup+test **2 passed**——
    9 特征树、单 body、体积 **8915.860 mm³**（目标 8915.859905）、push + 重开一致。
- [x] **T1b 旧 spec 清理**（2026-11-06）：旧 `sample-assignment.spec.ts` 降为
  legacy 真实 UI 演示（默认 skip，`EXAMPLE_UI_LEGACY=1` 运行）；验收门改为上述
  RPC 场景 spec，不再以不稳定的 UI 倒角作为 known-red。

### P0.5 — 数据真相与连续队列（2026-11-06）

- [x] **work queue**：新增私有 `tools/build-work-queue.mjs` → `manifest/work-queue.json`；
      以 `example-index` 的 blockers 分类并去重同名 PS。当前唯一 PS **1470**：
      geometry-ready **13**、blocked-feature **39**、geometry-with-dropped-constraints **1**、
      blocked-evidence **1294**、excluded **105**、excluded-sheet-metal **18**。
      13 个 geometry-ready 中 12 个已有示例，唯一未建的是 `Top, Ring, Key`。
- [x] **sheet-metal 真相修正**：旧 rawClassification 把含 active `sheetMetalStart/Flange`
      的 PS 误判为 replicable；队列现按 active feature blocker 归入 excluded-sheet-metal，
      不再把它们算入 native 完成率。
- [x] **edge selector UUID.suffix**：`edge-selectors.mjs` 的全文回退只比较去点 normalized，
      导致 `UUID.right/.top/.bottom/.left` 复合边永远匹配不到；改为 raw+normalized 双匹配，
      新增 plain `sketchEntityQuery` 回归用例（10/10）。全量重转后多批 fillet/chamfer
      不再因 suffix 失败（其余 face-derived 查询仍如实 blocked）。
- [x] **body 谱系 ADD/merge 修正**：`Revolve 1 (ADD)` 会覆盖 body.sourceFeatureId，
      旧回溯把它当造体终点；现仅 `extrude/revolve operation=new` 或显式 newBody 为终点，
      修饰型 creator 继续回溯，hole 对原始 extrude 的 booleanScope 可解析。
- [x] **通用 scenario 回放器**：`e2e/examples/replay/run-file.ts` +
      `scenario-file.spec.ts`（env 驱动，缺省 skip，不污染全量套件）+
      `top-ring-key-scenario.spec.ts`（单示例回归）。
- [x] **Top, Ring, Key 真栈**：12 特征（5 sketch/3 extrude/fillet/revolve/hole/chamfer），
      3 条边选择器，逐 body **2998.1418 vs 2998.1430 mm³（0.00004%）**，push+重开；
      在公开 Release `backend-20261106` 产物 MS 上复跑通过。约束以 skip 保留解算坐标，
      如实登记 constraints=dropped。**persist 已验证（2026-11-06，P0.6 修复后）**：
      全新 briefcase cache 冷开 `09ea16a9`，树 12 特征全 status=0，
      **2998.1418 vs 2998.1430 mm³（0.00004%）**（`verify-imodels` 第 13 条）。
- [!] **已知风险（2026-11-06）**：一次 MS 在 chamfer 后以 MSVCP140.dll
      c0000005 崩溃（同一场景随后在公开产物 MS 上连续通过，暂不可复现）；
      若再复发按系统性调试立案，不作为“绿”。
- **下一步队列（按解锁值）**：
  1. FEATURE pattern（circular 22 / linear 7）——契约/后端首切片已落（T10）；
     **FACE circular pattern→featurePattern converter/translator 已落（T10b，test-only，
     合成 14303.541 mm³ 真栈绿）**；真实 Universal Joint PS 被 imprintFace 上游偏差阻塞；
     FEATURE 作用域/线性 FACE/UI 仍待；
  2. shell 转换/面选择器首切片已落（T11，合成绿；真实例被 fillet 内核阻塞）；
  3. sketch 外部引用：**切片 1a 草图→草图投影已落（T6a，2026-11-07）**；实体边投影
     （PROJECTED/PIERCE/INTERSECTED/SILHOUETTED）与 UI 待后续切片；
  4. upToSurface（24 个特征；**回放近似已落**，产品能力仍 blocked——目标查询未采集）；
     5. splitPart 单侧切片已落（2026-11-07，双侧/面驱动待做）；moveFace 面偏移已落
        （shared 1.42，deleteFace/replaceFace 已登记 blocked-kernel）；rib 待做；
     6. draft（native taper 未暴露，独立 spike）。
- **离线回放探针（2026-11-07，backend StandaloneDb；hub 恢复前的替代证据）**：
  扩展 `test/ScenarioReplay.ts` 支持 featurePattern/featureMirror + imprintFace 多查询
  面域解析后，对 geometryComplete 场景逐个探测（临时 probe，结果已登记后删除）：
  - Drive Sleeve（8509862e）与 Update Drawing（b8905f4f）：树/单 body 正确，但
    Extrude 1/2/3 264448.7→688721.7→790461.9 mm³、Extrude 4 remove 零去材；
    孔方向按质心推断后最终 **774611.7 vs 1175024.3 mm³（−34.08%）**
    → known-red（imprintFace 把基础轮廓近似成小面域拼集）。
    `DriveSleeveScenarioReplay.test.ts` 以 `it.fails` 固化。backend replay 同步补
    **孔方向质心推断**（与公共 translator 同口径）并由 `ScenarioReplayParity`
    “孔草图法线朝外仍钻入材料”用例锁定（3/3）。
  - Universal Joint Drawing（246cb5ff）：Extrude 11 草图 0 面域（投影/构造线，
    imprintFace 无材料面域）→ blocked-capability。**hub 恢复后 web 真栈复核
    （2026-11-07）**：Main Body + Extrude 10 后 1,742,326.296 mm³，Extrude 11
    以 `面域下标越界: regionIndex=0（草图共 0 个面域）` 拒收；确认不是选择器
    问题，而是草图无材料面域，需要实体 imprint/face split。
  - Universal Joint Assembly 族（8d892a47/accb08ca/419abe27）：backend replay 尚不支持
    `sweptFace` 面边界选择器（公共 web runner 支持）→ 离线探针阻塞。
    **hub 恢复后 web 真栈（2026-11-07）**：8d892a47 跑到 Main Body/Extrude 10/11/12
    （体积 1,696,459.995 → 1,690,674.783 → 42,077.114 mm³），在 **Chamfer 10** 的首条
    `sweptFace` 选择器 matches=0 阻塞。该 query 实际是
    `FLTTm7...opExtrude SWEPT_FACE COPY` 与另一个 boolean 面的 **INTERSECT 边**，
    converter 只按首个 derivedFrom 面近似成 sweptFace，丢了 boolean 交线语义；
    且 Extrude 11 后 1,690,675 mm³ 已远离最终期望 602,047 mm³——**imprintFace 基础
    轮廓偏差仍在**。队列“单 gap=面边界选择器”不准确：真阻塞是 imprint 基础几何 +
    boolean 面交线选择器，登记 blocked-capability，不转绿。
  - Rear Shock（08e8de59）：backend 边枚举报“单 active body”限制（实际 2 body）；
    公共 runner 已支持按 bodyKey 解析，离线探针不构成几何结论。**A1/A2 真栈复核
    （2026-11-07）**：Extrude 2 的 face 匹配因 active authored body=2 跳过（A1 单
    body 限制），仍停在 Fillet 3 的 `sweptEdge` matches=0（前序 fillet 分割边），
    与 A1/A2 无关。
  - **imprintAirr 更新（2026-11-07）**：`docs/superpowers/specs/2026-11-05-imprint-face-extrude-airr.md`
    追加真栈/离线证据，收敛为 A1（实体面匹配 + faceExtrude）→ A2（起始面/方向/
    多面）→ B（face split 内核查证）→ C（无法匹配显式阻塞）四步；A1/A2 是
    Drive Sleeve/Universal Joint 族转绿的前置，不在当前近似上调 tolerance。
  - [x] **A1 实体面匹配 → faceExtrude（2026-11-07，test-only）**：新增
    `imprint-face-resolver.ts`（平面面枚举、区域/面环面积+质心匹配、单区域/单
    body/唯一候选、resolveFaceRef）；`run.ts` 非 NEW 单区域 imprintFace 命中时
    改走 faceExtrude，失败回退并写 note；`run-file` 接线 + `opFeatureType`
    树对拍。合成真栈 `e2e/examples/imprint-face.spec.ts` **2 passed**
    （20×20×10 盒顶面同边界 ADD 2 mm = **4800.000 mm³**，树
    `sketch/extrude/sketch/faceExtrude`，push+重开）。真实 Drive Sleeve 仅
    Extrude 4 单区域触发，fallback=“无共面且边界一致的面”（基础体已被前序近似），
    仍 known-red；iOS scenario A1 回归 **2 passed**（157478.901 mm³，未替换、
    树仍 extrude）。
  - [x] **A2 首步：NEW 主导面域收敛（2026-11-07，test-only）**：`dominantImprintRegion`
    （仅 operation=new；全部查询实体同属一个大材料面边界且面积 ≥ 已选最大面 4×；
    add/remove 不收敛）。公共实现 + 4 单测（8/8），backend ScenarioReplay 同口径复刻。
    Drive Sleeve Extrude 1 由 264448.7 → **1190513.2 mm³**；backend 离线整链
    **1357113.4 vs 1175024.3（+15.50%）**（此前 −34.08%），web 真栈约 +20.1%。
    iOS scenario 回归 **2 passed**（157478.901，规则未触发）。剩余：add/remove
    imprint 的子面/起始面语义（Extrude 2 +424k、Extrude 4 −305k）与 face split。
  - [!] **A2 face split blocked-kernel（2026-11-07）**：`SolidKernel.h` 有
    `ImprintCurveVectorOnFace/OnBody`（BRepCore `api_imprint`），但
    `iModelJsNodeAddon`/editor TS 均无 imprint 绑定（grep 0 命中，与 TaperFaces
    同类）。不新增 native binding（P0-08 需 ADR+provenance+ctest+下游回归）；
    add/remove 子面语义登记 blocked-kernel，A1+NEW 主导面域为当前安全子集。
    Drive Sleeve 停在 +15.50% known-red，不用近似几何宣称绿。
  - Gaiter（c405997f）：backend replay 不支持 shell（公共 runner 支持），且
    Fillet 1 内核零体积已登记 blocked-kernel。
- **数据边界**：1294 PS 缺 features/massproperties，UI 证据 526/526 已有；采集接口仍受
  账号配额限制（reserve 保护），不得用 UI 截图伪造结构化特征。每轮先补可采集数据，
  其余维持 blocked-evidence。
- [x] **UI-only 文档补采（2026-11-08，用户裁决消耗剩余配额）**：collector 新增
  `--ui-only`（只取 `document.json` + `elements.json`，跳过 Part Studio 端点，
  写 `_ui-only.json`/`elements-index.json`）。本轮 18 次调用补采 9 文档：
  CAD Drawings Unit 7（21 元素）/Unit 8 GD&T（11）、CAD for Robotics Drivetrain
  FRC/VEX（7/6）、Collaboration Spin（20）、Communicating（25）、Custom
  Components（4）、Intro FRC（17）、Intro VEX（16）；`--reserve 2` 未触发。
  重建 coverage / example-index / work-queue：`verify-example-index`
  **ok（0 errors/5 warnings）**，分类计数不变（这些文档仍缺 features/mass，
  维持 blocked-evidence）；`docs/EXAMPLE-COVERAGE.md` 已重生成（2 candidates）。
  采集数据只在私有仓，未推送。
- **配额剩余（2026-11-08）**：本轮后至少保留 2 次（collector reserve）；继续采集
  需用户再次裁决。

### P0.6 — 持久化真相：cold-open 契约（2026-11-06 发现，已关闭）

- **实证**：用外部 Release 产物 MS（空 briefcase cache）重开 Tutorial 2 iModel
  `f2278180-...` 失败：`CheckpointNotFound: Checkpoint not found for changeset
  2e0a37a4...`。旧 `verify-imodels` 12/12 只是在**同一台机器同一 cache** 上通过，
  没有验证“新机器重开”。
- **真实根因（两处 hub 契约缺口，均实证）**：
  1. `changesets/:id/checkpoint` 只做精确匹配；官方链接名是
     `currentOrPrecedingCheckpoint`，缺“回退到 changesetIndex ≤ 请求值的最新
     successful checkpoint（baseline 0）”语义 → 空 cache 直接 404。
  2. changesets 列表**忽略官方 `$orderBy=index desc`**。官方 SDK 解析“最新
     changeset”=`$top=1&$orderBy=index desc`；hub 按升序返回最旧一条（index 1），
     即便 checkpoint 回退可用也会下载到早期空 changeset（实测树为空）。
- **修复（hub 源码，未发布镜像）**：
  - repository/service/controller 新增 `findLatestSuccessfulAtOrBefore`，按
    `changesetIndex DESC, createdAt DESC` 取 ≤ 请求 index 的最新 successful；
  - changesets 列表实现 `$orderBy`（仅 `index [asc|desc]`，非法值 400），
    ORDER BY 贯通 repository，`_links.self/next` 原样回填排序；
  - 单测：`checkpoint-current-or-preceding.spec.ts` 2/2、
    `changesets-findall-range-parentid.spec.ts` 27/27；hub 全量
    **129 suites / 1179 tests passed**；本地镜像 `checkpoint-fix2` 实跑
    `desc → index 2, asc → index 1, 非法 → 400`。
- **e2e 基建**：`auth.setup` 改为“有 refreshToken 先 refresh 换新成对 token”——
  旧逻辑复用仍有效的 accessToken，但 refreshToken 可能已被其他进程/手工登录
  轮换，套件跑到中途才 401（实测 setup 时 token 仅剩 0.4 min）。
- **验收（硬门，2026-11-06）**：单个**全新** `BRIEFCASE_CACHE_LOCATION`、外部
  Release 产物 MS 冷开 **13/13** 示例 iModel——本轮 MS 日志实测下载 **13 个
  briefcase**，特征树/体积全部读回一致，`verify-imodels` **2 passed（7.0 min）**。
  含 Top, Ring, Key（2998.1418 vs 2998.1430 mm³）与 Intro to CAD cPlane 版。
- **顺带校正 legacy 验证列表**：sample-assignment → `f52752cb`（canonical 场景库，
  9 特征/8915.8602 mm³；旧 a9eacfe5 已不存在）；intro-to-cad → `bb8efb7b`
  （cPlane 树/85157.3407 mm³；旧 de911416 已不存在）。
- **已发布（2026-11-06b，hub-only hotfix）**：`imodelhub-public:backend-20261106b`
  与 `:latest` 同 digest `sha256:17098624…`，OCI revision `61e78c5`（hub HEAD），
  匿名 manifest 200；**发布镜像 + 全新 briefcase cache 冷开 13/13 通过**
  （MS 日志 13 次下载，`verify-imodels` 2 passed）。MS Release / 其它镜像不变。
  hub 源码 commit `61e78c5`、公开仓 commit `4d295bbf`/`907a66ed` 已推送。
- **延后（非正确性缺口）**：changeset checkpoint 生成/注册任务
  （`SnapshotDb.createFrom` + 上传 + `createOrUpdateForChangeset`）未实现；当前
  冷开依赖 baseline + 回放全部 changesets，示例量级可接受。待大规模 iModel 性能
  需要时再立项（P0.6b）。

### P1 — 能力解锁（按解锁数排序）

- [x] **T2 Edge selector resolver (CAP_EDGE/SWEPT_EDGE)**
  - 私有 converter：`tools/scenario/edge-selectors.mjs` 统一解析 CAP_EDGE/SWEPT_EDGE；
    `contextSketchEntityIds` 从 `$` 边界相邻实体提取（端点消歧）；9/9 单测。
  - 私有 backend：ScenarioReplay 支持 CAP_EDGE 圆弧 + SWEPT_EDGE 拉伸/旋转；
    `sweptCandidatePoints` 共享端点消歧；matcher 7/7、ScenarioReplay 11/11。
  - 公共 e2e：dev-only 只读边枚举（与显示拓扑同命令槽）+ 几何唯一匹配 +
    `resolveEdgeRef`；translator 仅在 runner 提供持久边引用时映射 fillet/chamfer。
  - 证据：`e2e/examples/edge-selector.spec.ts` 合成圆盘 CAP_EDGE 倒角
    770.737 mm³（解析期望同值），setup+test **2 passed**。
  - **真实 PS 验收（2026-11-06 转绿）**：
    - iOS First Part：3 条 CAP_EDGE（+y/−y 端盖分别取景），终体积
      **157478.901 mm³** vs 目标 157478.902（0.00%）；
    - Sample Assignment：4 条 SWEPT_EDGE 距离-角度倒角，终体积
      **8915.860 mm³** vs 8915.859905。
    - 两者均 setup+test **2 passed**；三探针文件已删除，验收断言保留。
  - **Ruling（Hand Brake 仍阻塞）**：SWEPT_EDGE 已唯一解析且 chamfer status=0，
    但 revolve 单面域产物体积不足（region 0 ≈5373，region [0,1] 并集 ≈7140 vs
    目标 7125——多面域 revolve 才可能对上），阻塞在**revolve 多 region 契约**，
    不是边选择器；不把体积期望改成错误值来“转绿”，转 T4/T7 处理。
- [x] **T9 faceExtrude 首切片（2026-11-06，shared 1.33.0）**
  - 契约：`faceExtrude` + `FaceExtrudeParams`（bodyId/faceRef/operation/endBound/
    direction/secondDirection/mergeScope）；shared 1.33.0；opDsl 白名单同步。
  - 后端：scratch 载体 → `facesFromId` → 面边界 `getSubEntityGeometry`（Loop/
    ParityRegion）→ `CurveOps.isPlanar` → 面法向 Sweep → 特征内布尔；throughAll；
    非平面/多面片/失效引用/NEW 诚实拒收。
  - 验证：`FaceExtrudeFlow.test.ts` 5/5（add 48 / remove 16 / 失效 status≠0 /
    schema 拒收）；registry/RPC 51/51；真栈 `e2e/examples/face-extrude.spec.ts`
    **2 passed**——合成盒体顶面 `resolveFaceRef` + faceExtrude add 1mm =
    **48.000 mm³**，push/重开后树含 faceExtrude 且体积一致。
  - **T9b 真栈纠正（2026-11-06，同日）**：Onshape `imprintFace` 查询根为
    `<sketchId>.imprint`，指向**草图面/材料面域**，不是实体 BRep 面；iOS Extrude 1
    顶盖是单一面（3 loops = 外环+两 R10 孔），无左环面片，solid-face 匹配零候选。
    因此 imprintFace **不走 faceExtrude**；改为草图面域 + imprint 侧向回放：
    converter 保留全部 queries + `imprintSign`（−1 环外/+1 环内），runner 逐查询
    选面域并合并 regions。真栈 `edge-selector.spec.ts` iOS **2 passed**——侧向
    outside、region 1、体积 157478.901 vs 157478.902 mm³。单测 5+21+schema 11。
    Hand Brake Update 数据就绪（Extrude 2 双查询、5/6 为 +1 圆），但仍被草图约束
    与 Extrude 8 UP_TO_SURFACE 阻塞，保持 blocked。faceExtrude 保留为显式实体面
    能力（无 converter 映射、无 UI，仅合成真栈 48.000 mm³）。
  - 下一步：产品级草图面的 region 语义继续对齐（+1 环内待更多真栈例证）；
    faceExtrude 等真正“实体面选择”语料；发布前必须重建 web/MS 双端（当前
    published artifact 仍 1.32）。
- [x] **T10 FEATURE pattern 首切片（2026-11-07，shared 1.34.0；ADR-0007）**
  - 契约：`FeaturePatternParams`（sourceFeatureId/kind/count/spacing?/angle?/
    axis 线段）；`LubanFeatureType + "featurePattern"`；shared 1.34.0；opDsl 同步。
  - 后端：源特征前后**缓存差集**为 delta（add: after−before；remove: before−after），
    逐实例变换后按源操作 Unite/Subtract；源仅 extend/revolve/hole 的 add/remove；
    NEW/fillet/chamfer/shell/mirror/缺源/冷缓存诚实拒收；任意轴线段（linear 平移、
    circular 绕轴旋转，count 含原件）。
  - 验证：`FeaturePatternFlow.test.ts` **4/4**（8.75 mm³ 线性、12 mm³ 偏轴圆周、
    校验矩阵）；registry/RPC **46/46**；真栈 `e2e/examples/feature-pattern.spec.ts`
    **2 passed**——40×40×10 盒 + 4×4×5 凸台线性 3 实例 = **16240.000 mm³**，
    push/重开树含 featurePattern 且 status=0。
  - 未做/语料缺口：46 个 FEATURE pattern raw 均 `operationType=NEW` + `entities=[]`，
    源特征集合与 NEW 语义未解——**converter 不映射、不猜**；需 live 取证后另立
    切片。FACE/曲线 pattern、per-instance skip/第二方向、UI 入口/编辑/预览同缺；
    published web/MS 仍为 1.32，发布需 shared→backend→web 同批重建。
- [x] **T10b FACE pattern → featurePattern 转换切片（2026-11-07，test-only）**
  - converter：`convertFeaturePattern()` 只映射 circularPattern + FACE + equalSpace +
    无 skip；`faces` 查询的 `derivedFrom` 取源特征（须已转换 hole/extrude/revolve）；
    `axis` 查询的草图圆/弧 → 圆心 + 草图法线世界线段。同步修单位表达式：
    `2.5*inch` / `.76*inch` 去单位时连乘号去掉（Extrude 2/4 深度此前缺失）。
  - scenario 契约：schema/validator 增 `featurePattern`；translator `featurePatternOp`
    经 `featureIdBySource` 换源特征本地 id。translator **24/24**、validator **12/12**。
  - **合成真栈绿**：`e2e/feature-pattern-face.spec.ts` **2 passed**——40×40×10 板 +
    圆孔切除 + circular count 6/360°/(20,20)+Z → **14303.541 mm³**（解析 14303.540），
    push+重开树 5 特征全 status=0。
  - **真实 PS blocked-evidence**：Universal Joint 族 2 例转换成功（8 特征含
    featurePattern），但回放 Extrude 1–3 体积 264448.769/688721.726/790461.999 mm³，
    Extrude 4（REMOVE）与 Hole 1 零变化、源增量空（status=1）；根因是上游
    imprintFace 面域回放偏差，非 FACE pattern 映射。待 imprint 切片后重试，不宣称绿。
  - [x] **FEATURE circular pattern + 多体锚定（2026-11-07，test-only）**：converter
    支持 `instanceFunction.featureIds` 单源（hole/extrude/revolve ADD/REMOVE）与
    线/圆双轴形态；runner 对多 body 无 scope 的 featurePattern/mirror 显式
    targetBodyId 锚定。真实 PS dfc6e33c/006ab003（10 特征/2 body）建链成功、body 数
    正确，实际 65,731.774/14,544.246 vs 期望 64,831.091/13,917.196 mm³
    （+1.39%/+4.50%）。复核：Sketch 4 回放只有 1 个面域、种子切 28 mm³ 正确；
    pattern 16 实例仅再切 ~28 mm³（多数实例未与当前体相交），且 FEATURE mirror
    被 converter 近似为整 body 镜像 Union，对切除特征会加回材料——**FEATURE mirror
    的 body 级近似不成立**。不调松、不宣称绿；translator 24/24、FACE 合成真栈
    2 passed 回归。
  - [x] **hole 源绕圆柱轴语料验证（2026-11-07）**：
    `Exercise: Intermediate Drawing / Drive Sleeve`（8 特征，FACE circular 6 实例/
    360°，faces→Hole 1，axis=Extrude 2 圆柱面草图圆）用当前 converter 重转后
    **circularPattern 已映射、8 特征齐全**（旧 work-queue 的单 blocker 是陈旧产物）。
    后端新增 hole 源 pattern 用例：30×30×2 板 + (10,0) φ4 throughAll 孔 + circular
    count 6/360°/(0,0)+Z → **1800−48π ≈ 1649.204 mm³**，`FeaturePatternFlow`
    **5/5**。真栈回放待 hub 恢复（本轮 :5400 无响应、docker daemon 挂起）。
    **离线真实链回放已做（backend StandaloneDb，2026-11-07）**：扩展
    `test/ScenarioReplay.ts` 支持 featurePattern/featureMirror + imprintFace 多查询
    面域解析；`DriveSleeveScenarioReplay.test.ts` **known-red**——Extrude 1/2/3
    264448.7→688721.7→790461.9 mm³，Extrude 4(remove) 零去材；孔方向按质心推断
    （负侧→backward）后 Hole 1 正常去材，最终 **774611.7 vs 1175024.3（−34.08%）**。
    根因是 imprintFace 多查询面域近似把基础轮廓选成小面域拼集（Onshape 实体
    imprint/face split 无法由草图面域等价表达）。`it.fails` 登记，不调松断言；
    不宣称示例绿。**hub 恢复后公共 web 真栈首跑（2026-11-07）**：同一场景
    `test.fail`，失败在 featurePattern 求值（MS 日志 `内核 op 失败: op=1 status=0`，
    树 status≠0），未到体积断言；与 backend 离线 status=0/零去材形态不同，
    根因同为 imprint 基础轮廓近似。
  - [x] **linear FACE/FEATURE pattern 转换（2026-11-07，test-only）**：
    converter 扩 `linearPattern`（FACE/FEATURE、isCentered=false、无第二方向、
    distance→mm 间距、方向 query 统一解析草图直线、oppositeDirection 取反）；
    无法证明 Onshape 边真实朝向 → `directionRisk`，translator 标 approximate+note。
    translator **26/26**（新增 linear 用例）。真实语料 Wheel Chock Linear pattern 1
    映射为 count 19/spacing 25/dir(0,-1,0)（该 PS 属 sheet metal excluded，不转绿）；
    Pallet（第二方向）/Base Frame Bar（方向为圆）/GANTRY（草图转换失败）如实 dropped。
    **当前无新增绿例**；isCentered/第二方向/PART linear 未做。
- [x] **T11 shell 转换 + 面选择器首切片（2026-11-07，test-only）**
  - converter：`convertShell` 输出 shell 特征（isHollow/Hollow dropped、thickness、
    oppositeDirection、面 query 语义描述 sweptFace/capFace + 草图实体 + 上游 op）。
  - 回放：`shellFaceResolver` 解析 **revolve SWEPT_FACE 端面**（草图直线 ⟂ 回转轴
    → 平面圆/环；按轴线段/平面/外半径唯一匹配，允许前序 fillet/chamfer 圆角缩小外缘）
    → resolveFaceRef；translator `shellOp`（oppositeDirection=false → 负距离内缩，
    distances=0 穿孔移除）。
  - 证据：合成 `e2e/examples/shell-face.spec.ts` **2 passed**——实心圆柱 R10×10
    移除顶面 + 内缩 2 mm = 开口杯 **1533.097 mm³**（π(1000−512)），push/重开。
  - 真实例 **Gaiter 仍 blocked-kernel**：两端面解析成功，但前序 Fillet 1（8 条整圆边
    1 mm）后 body 体积归零/原生 bad allocation。取证：半径 1/0.5/0.2 均失败（非半径
    可行性）；边子集 1 条=45766.698、4 条=45567.736 有效，2 条/8 条失败——**特定边
    组合/传播的内核 blend 问题**。`gaiter-scenario.spec.ts` 以 fixme 保留，不伪造绿；
    记任务 #103。
  - **2026-11-08 kernel 追加取证（临时 probe，已删除）**：只回放 sketch→revolve→
    fillet 前 3 特征，`propagateSmooth=true` 与 `false` 两种都得到 Fillet 后
    total=**0.000**（revolve 阶段 46039.775）；edgeResolver 解析出**恰好 8 条
    唯一整圆边**（2:17/2:13/2:25/2:21/2:11/2:1/2:15/2:19），无重复/无误选。
    结论：不是 propagateSmooth 叠加，也不是选择器重复边；仍是原生 blend 对
    该 8 圆边组合的限制。Gaiter 维持 blocked-kernel。
  - 未覆盖：CAP_FACE/曲面侧面等其它 shell 面形态、Hollow、逐面差异壁厚。
- [x] **T11b shell capFace 圆端盖 + 多体目标（2026-11-07，test-only）**
  - converter shell query 增 `isStart`（CAP_FACE 端盖侧）。
  - `expectedShellFace`：sweptFace 沿用 T11；**capFace=blind/symmetric 拉伸圆端盖**
    （圆心/法向/半径 + 端盖偏移 start/end/opposite/symmetric；through-all/非圆拒收）。
  - 多体：`resolveShellTargetBodyKey` 从 query 的 operationSourceIds 经
    bodyKeyBySource 唯一解析目标 body（0/多候选阻塞）；translator `shellOp` 增
    targetBodyId；`run-file.ts` 补接 shellFaceResolver（此前通用回放遇 shell 必阻塞）。
  - 证据：`shell-face-expected.spec.ts` **8/8**（5 端面推导 + 3 多体目标）、
    e2e typecheck 干净、translator 30/30。**真栈 `shell-face.spec.ts` 3 passed**：
    原 sweptFace 回归 1533.097 mm³ 不变；新增多体 capFace（两圆柱 R8×10）→
    1105.840 / 2010.619 mm³（期望 1105.841 / 2010.619），push+重开一致。
    Hydraulic Components 真实例仍在 Fillet 1 上游阻塞（imprintFace 复合轮廓），
    不是 capFace 选择器问题；不宣称该真实例绿。
- [x] **T11c converter clockwise 圆弧修正（2026-11-07，根因修复）**
  - 现象：批量 #6 Links 建链 ok 但 reopen 后 status≠0；Extrude 1 = 157.080 mm³
    （期望约 11,861），Extrude 2/3 产生 0 体积 body。
  - 根因（backend StandaloneDb 面域探针，跑完即删）：Links Sketch 1 的槽端盖
    圆弧 `geometry.clockwise=true`；converter 只用 `startParam/endParam`，
    把参数角当 CCW → 圆弧镜像到另一侧半圆，端点与切线错 180°，面域引擎只识别
    两个孔圆（各 78.54 mm²）。修正：`startAngle = frameAngle − startParam`
    （clockwise 时）、`sweepAngle = −(endParam−startParam)`；修复后同草图面域
    = 槽形 **5,930.582 mm²**（外环 [4,5,6,7] + 孔 [1,2]）。
  - 影响面：语料 131 PS 中 **54 PS / 367 条 clockwise 圆弧**；本批
    #6 Links（已重转 canonical scenario）与 #12 Handle（仍以旧场景跑批，
    批次结束后重转+复跑）。Wheel 等无 clockwise 弧的场景转换逐字不变（diff=0）。
  - 真栈 Links 复跑待批次窗口；此前 #6 记为批次失败，不宣称绿。
- [x] **T11e FACE pattern 源解析修复（2026-11-07，converter）**
  - 现象：`Onshape-Training-Repo/77b496…/d405047…`（11 特征/3 body）单 blocker
    `pattern Linear pattern 1: 源特征 ?`；FACE 查询是 compact 编码，id 紧跟
    `opRevolve/wireOp` 后缀，旧 token 扫描把后缀吞进 id → 命中 sketch/undefined。
  - 修复：剥操作后缀并只在 hole/extrude/revolve 创建源中选（`converter`
    `featureTypeById` + creator 过滤）；重转后 pattern 步源=Revolve 4、
    count=15/spacing=6.35/axis=Z，converter 输出 11 特征/3 body。
  - 回归：Drive Sleeve 重转 **diff=0**。
  - 真栈尝试：pattern/cPlane/hole 均建链，最后 Fillet 1
    `sweptEdge sketch=FQGpGQd3krQSAkH_0#5 source=FgZF2GuHzc22qc2_2 matches=0`
    （15 实例 pattern 后的 body 组合 / 多体边解析）——登记 blocked-selector，
    不计入绿例。转换器修复保留（解除单 blocker，后续只差选择器）。
- [x] **T11f cPlane frame → THREE_POINT 回放（2026-11-07，test-only）**
  - 现象：converter 只映射世界基准面 OFFSET/PLANE_POINT；面/边参考或
    LINE_ANGLE/LINE_POINT/MID_PLANE/TANGENT_PLANE 的 cPlane 被 dropped，即使消费
    草图的 matrix 已给出精确 frame（Spindle Location Plane 等）。
  - 修复：`convertCPlane(feature, frame)` 在无世界参考时用 frame 合成
    `threePoints`（origin, origin+xDir, origin+(normal×xDir)），`reference` 占位、
    `constructionApprox=true`；translator `cPlaneOp` 透传三点、校验非有限/共线/
    与 offset/origin 互斥，并标 approximate+note。
  - 证据：translator **31/31**；e2e typecheck 绿；合成真栈
    `e2e/examples/cplane-three-points-scenario.spec.ts` **2 passed**
    （z=20 三点平面 → 10×10 草图 → 拉伸 **1000.000 mm³**，push+重开，树
    cPlane/sketch/extrude status=0）。
  - 真实例：Spindle 系列仍被 `myFeature(#threadCount)`（自定义 FS）阻塞；
    bd50766e 仍被 importDerived 阻塞——本轮无新增真实绿例，转换 blocker 减少，
    不冒充覆盖。
- [x] **T11d converter imprint 根修复（2026-11-07，根因修复）**
  - Alignment Plate `Cut 2 more holes` 的 4 条 imprintFace query 被旧 converter
    解析到 disambiguation 里的 Sketch 1 line；新增 `imprintRootSketchId`：
    明文 `makeQuery(id+"<id>.imprint"` 优先，compact 取正文最早出现的已知草图
    id，只在根草图内匹配实体。
  - backend `ScenarioReplay` 补 `regionRisk` 选集与实际面域数求交审计
    （[0,1,2,3]→[0,1]，与公共 runner 同口径），避免离线回放因越界整链拒收。
  - 证据：离线回放 **8,915.8629 vs 8,915.8599（+0.00003%）**；真栈
    `scenario-file` **2 passed 8,915.860 vs 8,915.860**，push+重开。
  - 影响面：Drive Sleeve 与 iOS First Part 重转后 **逐特征 diff=0**（根解析
    不变）；全量 `batch-convert --force` 待下一轮统一刷新（本修复后仅
    Alignment Plate 与 Links 的解析路径发生变化）。
- [x] **T12 booleanBodies intersect 解锁（2026-11-07）**
  - backend：registry 放行 intersect；evaluator 映射内核 `BRepGeometryOperation.Intersect`；
    registry 测试 62/62（含 T2c 交集体积 2 mm³）。
  - converter/translator：UNION/SUBTRACTION/INTERSECTION → unite/subtract/intersect。
  - 真栈 `e2e/boolean-intersect.spec.ts` **2 passed**：2×2×1 与 1×1×2 重叠盒
    交集 **1 mm³**、tool 消费、push/重开；后端全量 **764 passed / 8 skipped**。
  - 契约形态未变（BooleanBodiesParams 早已含 intersect），无常量版本 bump；
    发布随 shared 1.34 双端。**UI 相交页签已启用（T12b，2026-11-07 同日）**：
    FeatureDialog booleanBodies 的页签/下拉移除 intersect 禁用与「暂不支持」提示，
    同步删 `booleanBodiesIntersectHint` i18n 键；单测 FeatureDialog+i18n **152/152**；
    真栈 `e2e/boolean-intersect-ui.spec.ts` **2 passed（40.3 s）**：RPC 建两重叠盒 →
    ribbon 布尔运算 → 选目标/工具 → 相交页签 → **1.000 mm³**、工具体消费、
    树/status/push+重开一致。证据：`ui-evidence/.../boolean.json` 的
    并集/差集/相交页签 + 工具 + 保留工具。
- [ ] **T8 Face-boundary edge selectors（2026-11-06，下一步；test-only）**
  - Ruling：P0.5 计划把 FEATURE/FACE pattern 列第一，但原始 features 取证显示
    `patternType=FACE/FEATURE`（Drive Sleeve=FACE、Bottom Bracket=FEATURE
    fullFeaturePattern=false），产品当前只有 body pattern，实现代价远高于预估；
    改为先做 **面边界边选择器**——它才是 4 个 blocked-feature PS 的“最后一公里”：
    Bumper Block（仅 1 条 fillet 查询未映射）、Exercise: Universal Joint Drawing、
    Intro 1.2-1.4 Rear Shock、Pedal。
  - 证据：Bumper Block 原始 fillet 有 9 条查询——4 条 SWEPT_EDGE（已支持）+
    1 条 CAP_FACE + 4 条 SWEPT_FACE；live Onshape 只读页（
    `ui-evidence/bumper-block-live-20261106/04-fillet-selected.png`）显示选中
    为围绕顶板/立面的连续边链。目标体积 636.7314988 mm³（scenario expected）。
  - 语义：SWEPT_FACE→该草图实体沿上游 extrude 扫出的侧面的全部边界边；
    CAP_FACE→extrude 端盖面的边界边（按 isStart 选起点/终点；首版取包含该实体的
    闭合轮廓环）。生成期望边几何（线端点/弧圆心半径/圆）并与 dev-only 边句柄
    几何匹配；一套查询可命中多条边，去重后交 `resolveEdgeRef`。through-all 无固定
    深度：侧边按“沿草图法向 + 端点 (u,v)”匹配、端盖边投影回草图坐标系，不拿
    记录 depthMm 当扫掠范围。
  - 已落地（2026-11-06，test-only）：converter 解析 CAP_FACE/SWEPT_FACE
    （`edge-selectors.test.mjs` 12/12）；resolver 支持面边界边集 + through-all
    投影匹配；`tsc` 绿。转换器同步修正：`hasDraft=true` 必须登记 blocking
    （Bumper Block 旧产物漏标拔模的真相缺口）。
  - **2026-11-08 UJ 探针**：Universal Joint Assembly Drawing（a4c271/419abe，单
    blocker=面边界选择器）真栈建链至 419576.578 mm³ 后，Chamfer 10 的 sweptFace
    实体 #10（+x 侧）零匹配（#18/#22 MirrorCS 侧可匹配）。面拓扑回退读 15 面
    候选 0；backend StandaloneDb 复核同链 body bbox **x=[−60,0]**——Extrude 12
    intersect（imprintSign −1）后 +x 材料已不存在，根因是上游 imprintFace 面域/
    符号选错或需真正 face split，不是选择器。回退已撤销；3 个 UJ PS 保持
    blocked-capability，不靠翻符号猜绿。
  - **2026-11-08 复核（draft 落地后）**：Bumper Block 的 Extrude 2 拔模已真映射，
    但该步 selection 是 **imprintFace**（Onshape 从 Extrude 1 顶面 z=40 再拉 40），
    回放近似为原草图 region 0（z=0 起）→ add 0；逐 step 360000→360000→Fillet
    354373.149→Hole 346770.496 vs 目标 636731.499（−45.5%）。剩余阻塞是
    imprintFace 的面平面起点/子面语义（ADR-0006 切片 D）。
    **端盖映射试验（未保留）**：把紧邻 CAP_FACE 端盖映射成 `startOffsetMm=40`
    后 Extrude 2 增加 297764.787（总 657764.787），但 Fillet 1 的面边界选择器
    展开 12 条边（顶部 4+侧边 4+底部 4），内核 `blendEdges 无几何回包`，
    Fillet/Hole status=1；实验代码已回退。下一步需真实的 Fillet 边集语义 +
    内核 blend 能力；Bumper Block 保持 record 轨，不转绿。
  - **真实 PS 验收尚未达成（诚实记录）**：四个候选各有其它前置缺口——
    Bumper Block：Extrude 2 拔模 10°（产品无内核通道，translator 正确阻塞）；
    Exercise: Universal Joint Drawing：Extrude 11 是 **imprintFace** 选择，Sketch 8
    是开放投影轮廓（21 段中仅 2 条重复顶边成退化闭环，16 个开放端点），test-only
    的“草图面域近似”无法成立——真阻塞是 **face-extrude/imprint-face（ADR-0006
    切片 D）**，不是普通草图外部引用；
    Pedal：Fillet 2 的 SWEPT_EDGE 引用被前序 Fillet 1 消费/改写的边（现体上
    端点无对应竖直边），属“前序 blend 边别名”问题；Rear Shock 同类。
  - 顺带修正 arc 转换真相（2026-11-06）：Onshape 圆弧参数以圆的
    `xDir/yDir` 为角度原点，旧 converter 直接用 `startParam`，圆弧整体偏转圆帧角
    （UJ Sketch 8 实测 2.5°，端点差 0.4 mm）。现 `startAngle =
    atan2(yDir,xDir) + startParam`，sweep 保留 endParam−startParam 的方向（可负）；
    现有绿例（iOS/Hand Brake/Top Ring Key 等 scenario）无草图 arc，无回归面。
  - 下一步：前序 blend 边别名（不要用体后几何硬匹配）、extrude draft 通道、
    sketch 外部引用三者至少再落一个，面边界选择器才有端到端绿例；当前不把
    解析器单测绿冒充示例完成。
  - **2026-11-06 追加（Rear Shock 探针）**：修 converter 明文 CAP_EDGE 的
    `"isStart":true` 解析（旧实现只认 compact `isStartT`，端盖侧恒 false；
    `edge-selectors.test.mjs` **13/13**）；runner 增加多体无 booleanScope 的显式
    锚定（按最近造体谱系，notes 记录，不用隐式链尾）。探针越过 Extrude 1/2，
    但 Fillet 1 仍 matches=0：Extrude 1 是 **5 条混合侧向 imprint 查询**
    （线/圆，−1/+1 混合），线侧 FACE 是 extrude 后的**实体子面**而非草图材料
    面域；草图面域映射无法表达。该 PS 保持 blocked（需要真正的 imprint。
    face split），不以错误 region 0 强跑；不新增 spec。回归 Handle/Hand Brake/
    Sample Assignment/Element Organization **5 passed**。
  - **2026-11-07 追加（imprint 部分解析 + 圆角多体锚定，test-only）**：
    旧实现只要 5 条 imprint 查询中任意一条无候选，就整步回退 translator 的
    region 0——对 Rear Shock Extrude 1 是整圈最大面域（area 924.5），完全不是
    查询指向的材料面域，导致 CAP_EDGE 实体 18 的端盖边根本不存在（matches=0）。
    现改为：**已解析查询的面域仍然使用**（本例 entity 18 −1→region 9、
    entity 25 +1→region 10），未解析查询写入 note（entity 27 −1 无 outside
    候选）并保持 `approximate=true`；不再用 region 0 冒充。runner 同时给
    fillet/chamfer 增加**由选中边所属 body 显式锚定 targetBodyId**
    （`selectEdgeTargetBody`：单 body 锚定、跨 body/空集/失效体诚实阻塞，
    `multi-body-anchor.spec.ts` **5 passed**）。Rear Shock 探针因此越过
    Fillet 1 并真实修改体积（122330.066→122288.945），随后停在 **Fillet 3
    的 SWEPT_EDGE entity 17 matches=0**：Fillet 1 已把该侧边在 z≈9 处切断，
    当前选择器只匹配整条竖直边，属“前序 blend 改变边拓扑”的已知类别
    （与 Pedal 同类）。**Rear Shock 仍 known-red**，未调松断言、未宣称绿。
    回归：Handle 2 passed；Sample Assignment + Hand Brake 运行中。
    追加：`pickImprintRegion` 增加“指定侧无候选时唯一相邻材料面域回退”
    （多相邻仍不换侧）+ `EXAMPLE_DEBUG_IMPRINT` 面域转储；Pedal 探针因此把
    Extrude 4 正确落到 region 0，但仍停在 Fillet 2：其 SWEPT_EDGE 是
    through-all **切除面与回转体的交线边**，不是草图竖直扫掠边，需要切除结果的
    拓扑求交，不是边别名/端点容差能修。Pedal/Rear Shock 均维持 blocked。
  - 回归（2026-11-06）：既有边选择器通道 `edge-selector.spec.ts` **3 passed**
    （合成圆盘 770.737 mm³ = 解析期望；iOS First Part 157478.901 vs 157478.902）。
    期间发现并修正 iOS scenario 的陈旧产物：`booleanScopeFeatureIds` 仍是
    `..._0.opExtrude`/`.wireOp` 带后缀串，回放器按裸 featureId 查 body 恒失败；
    converter 现统一剥 `.op<Kind>`/`.wireOp` 后缀后再过滤，iOS scenario 已重转，
    `scope ids=["FBLN..._0","F1Wm..._0"]` 且显式 target 通过。
  - 索引守卫：`index-examples.mjs` 对任何 capFace/sweptFace 场景加
    `converter-scenario: 面边界选择器待真栈验收`，防止解析器单测绿把 PS 误升级为
    geometry-ready；首个真栈绿例后再删守卫。
- [x] **T3 Shell UI**
  - 证据：Onshape 官方帮助页（`ui-evidence/shell-help-20261106`，Faces to shell →
    Hollow → thickness → direction → confirm）；Hollow 无契约，本切片不渲染假控件。
  - 产品：`ShellDialog`（移除面 + 壁厚 + 内/外方向，`ShellParams` 零变更）；
    ribbon `HollowFaces` 改道参数化对话框；面快照在路由时捕获（对话框打开会
    pause 选择工具并清空选择）；后端影子预览接入；能力位 `shell: full`。
  - 证据：`ShellDialog.test.tsx` 5/5；web 全量 vitest **1384/1384**；
    `e2e/shell.spec.ts` setup+test **2 passed**——盒体 20×20×10 顶面移除 1 mm
    内缩体积 **1084.000 mm³**（解析期望同值），undo/redo、双击编辑 2 mm
    （1952 mm³）、push + 重开一致。
  - 限制：Hollow/逐面差异壁厚/对话框内继续拾面未实现；真实 PS 的 scenario
    shell 面选择仍需语义面选择器（转 T4）。
- [~] **T4 Extrude/hole/cPlane variant completion**
  - [x] **extrude secondDirection**（2026-11-06）：converter 映射 BLIND/THROUGH_ALL
    + `secondDirectionOppositeDirection` 语义；translator 透传/symmetric 互斥；
    FeatureDialog「第二个方向」平铺复选 + 深度/终止条件 + 编辑回显 + 预览包络；
    UI 证据 `ui-full-audit-20261106/extrude-dialog-side-by-side.jpg`。
    真栈 `e2e/extrude-second-direction.spec.ts` setup+test **2 passed**——
    20×20 矩形拉伸 10 + 第二方向 5 = **6000.000 mm³**，push+重开一致；
    单测 FeatureDialog/feature-preview + 翻译器。
  - [x] **imprintFace → 草图面域解析（test-only 近似，2026-11-06）**：
    converter 在 imprintFace 选择上记录所引用的草图实体（`sketchFeatureId/
    sketchEntityId/sketchEntityKind`）；runner 用 `getSketch` 面域选择“该实体为
    孔洞边界”的最大面域，其次外环；纯函数 `pickImprintRegion` 单测 3/3
    （孔优先、多个取最大、外环回退、找不到不猜）。步骤保持 `approximate=true`
    并写 note（face split 未实现）。iOS 由此从 region 0（176206 mm³ 错误映射）
    修正为 region 1 + forward + depth 50，配合 3 条 CAP_EDGE 倒角达
    157478.901 mm³。
    - **2026-11-06 语义纠正**：imprint FACE 查询根是 `<sketchId>.imprint`，
      即**草图面/材料面域**；converter 已保留全部 queries 与 `imprintSign`
      （−1 环外/+1 环内），runner 逐查询选面域并合并 regions。iOS 用
      side=outside/region 1 真栈绿（157478.901 vs 157478.902）。产品级
      “实体面选择”的 faceExtrude 是另一能力（无当前语料映射）；**不得**把
      草图面域回放宣称为 Onshape imprint 拓扑（face split）已实现。
  - [x] **revolve 多面域（shared 1.30.0，2026-11-06）**：
    - 契约 `RevolveParams.regions`（与 extrude 同锚；`regionIndex` deprecated 简写，
      同给拒收）；后端 `resolveRevolveInputs` 选集归一 + 逐域 spin/CSG + Unite；
      FeatureDialog revolve 复用 extrude 的视口多选 chips（载荷不再发 regionIndex）。
    - 验证：backend `RevolveFlow` 两互斥环柱 2500π；registry 接受/互斥/负数拒收；
      真栈 UI `e2e/revolve-multi-region.spec.ts` setup+test **2 passed**
      （7853.981 mm³、push+重开）；真实 Hand Brake 3 特征
      `e2e/examples/hand-brake-scenario.spec.ts` setup+test **2 passed**
      （7125.270 vs 7125.274；此前 region 0 为 5358.127）。
    - 诚实边界：converter 对多 query 只给面积降序前缀 + `regionRisk`；
      Hand Brake 的 [0,1] 选择写在 spec 审计函数中，不冒充自动映射。
  - [x] **extrude draft（shared 1.51.0，2026-11-08，ADR-0005 Phase 4）**：
    `ExtrudeParams.draftAngleDeg/draftPullDirection`（中性面=草图平面；有效角正=材料
    外扩）。后端不依赖未暴露的 native taper：基环经 `CurveOps.constructCurveXYOffset`
    偏置 δ=distance·tan(θ) 后 Loft（含孔面域外环/孔环反向偏置）。仅 sketchId+blind，
    与 symmetric/secondDirection/throughAll 互斥。FeatureDialog 平铺「拔模」+角度+
    反向（live 证据 `ui-evidence/draft-dialog-20261108`）；edit 回显/updateParams。
    拔模锥台预览：`buildExtrudePreview` 按 δ=|d|·tan(θ) 偏置远端环（外环扩/孔环缩，
    反向翻转），FeatureDialog 打开预览叠层。converter/ScenarioReplay 解除阻塞并
    映射（弧度→度），因 Onshape 方向符号未独立校准，回放标 approximate。验证：
    后端 `ExtrudeDraftFlow` **4/4**（矩形棱台公式、反向收窄、含孔、7 组拒收）、
    `ScenarioReplayParity` **4/4**；web FeatureDialog **160/160**、feature-preview
    **10/10**（含孔环收缩）；真栈 `e2e/extrude-draft-ui.spec.ts` **2 passed**（预览叠层可见；
    10°→1394.109，编辑 5°→1185.18，push+重开）。
  - [x] **converter bodyType 守卫（2026-11-08）**：raw extrude 的 `bodyType=THIN`
    （薄壁 40 个特征）/`SURFACE`（曲面 4 个）此前被静默按 SOLID 扫掠，几何会
    失真。converter 现显式登记 blocking（Axle Parts 复核：Extrude 3/22 均出现在
    dropped 列表）；产品薄壁/曲面通道仍属未实现，不近似。
  - [ ] thin-wall/upToNext/Surface/Vertex（内核能力/契约，独立 ADR）。
  - [x] **hole 孔位 query 形态补全（converter，2026-11-06）**：
    UUID `sketchEntityQuery(...,"uuid")` 与 `qCreatedBy(<sketch>, VERTEX)` 全点形态；
    `孔位 query 未解析` 17→8，smoke +1/blocked −1。mate connector 孔位（10）
    仍属参考几何缺口，不近似。
  - [x] **hole 倒角孔/countersink（shared 1.32.0，2026-11-06）**：
    `HoleParams.countersinkDiameterMm/countersinkAngleDeg`（包含角 deg，与 counterbore
    参数互斥）；后端 `evaluateHole` 用两环 Loft 生成锥台 + 主孔 Subtract；converter
    映射 Onshape `C_SINK`；HoleDialog 启用「倒角孔」页签 + 直径/角度/回显/校验。
    后端 HoleFlow 6/6、web HoleDialog 7/7、真栈 `hole.spec.ts --grep 倒角孔`
    **2 passed**（去材 261.794 vs 261.799 mm³，0.002%）。真实 11 个 C_SINK 特征
    所在 PS 仍被 sheet metal/import/custom 等阻塞，暂无完整真实示例。
  - [x] **hole 钻尖角（shared 1.50.0，2026-11-08，ADR-0006 切片 A5）**：
    `HoleParams.tipAngleDeg` 放宽到 (0,180]；后端盲孔圆柱段后追加
    `h=r/tan(angle/2)` 钻尖锥（两圆环 Loft，随 backward 取反；缺省/180=平底、
    throughAll 忽略）。HoleDialog 钻尖角下拉（新建默认 118°、编辑旧库回显 180，
    live 证据 118°）+ 方向下拉（正向/反向，live dialog.html「反向」控件）；
    converter 解析 Onshape `tipAngle`（LEGACY 无字段保持 180）；translator 透传。
    后端 HoleFlow **8/8**（φ4 深5 → 去材 67.860 vs 67.866 mm³）、Registry schema
    118/180 收/0/181 拒；web HoleDialog **10/10**、translator **36/36**；真栈
    `hole.spec.ts --grep 盲孔` **2 passed**（φ5 深4 去材 **88.371 vs 88.371 mm³**；
    反向孔体积零变、params.direction=backward）。含盲孔的已转换场景均被其它特征
    阻塞，未宣称示例完成。
  - [x] **后端 ScenarioReplay 与公共 runner 对齐（2026-11-06）**：补
    `secondDirection`（此前被静默忽略——Handle grip 会少 10mm）；补 body 谱系
    （hole/fillet/remove 改写 sourceFeatureId 后，仍能按 Onshape 原始造体特征解析
    booleanScope 目标体）。新增 `ScenarioReplayParity.test.ts` **2/2**：
    10+反侧5=6000 mm³；两体模型 hole 改写谱系后 remove 命中 A 体
    （1000 + 2968.584 mm³）。这是 B1 批量后端回放的前置。
  - [ ] hole tapped/thread/face placement + 间隙/多深度表 + mate-connector 孔位；
  - [x] **cPlane B2a 平面点（shared 1.31.0，2026-11-06）**：`CPlaneParams.origin`
    世界原点 + 参考法线（与 offsetMm 互斥）；CPlaneDialog 类型/原点输入；后端 schema/
    求值校验；shared 159/159、CPlaneFlow 3/3、web 17/17、真栈
    `e2e/cplane-point.spec.ts` 2 passed（4000 mm³，push+重开）。
  - [x] **cPlane LINE_ANGLE（shared 1.40.0，2026-11-07，ADR-0013 切片 1）**：
    `CPlaneParams.line{origin,direction}` + `angleDeg`（成对、与 offsetMm/origin
    互斥、方向非零）。前端把参考法线投影到线垂面后绕线 Rodrigues 旋转（origin=线原点，
    xDir=线方向，flipNormal 反转）；线 ∥ 参考法线等退化 → undefined 不猜。后端 schema/
    求值器兜底；`FeatureTypeRegistry` 校验用例 + `cplane.test.ts` **12/12**；真栈
    `e2e/cplane-line-angle.spec.ts` **2 passed**（Top 绕 X 轴 45° → 草图 20×20 + 拉伸 10
    = **4000.000 mm³** 质心 (10,3.536,10.607)，树/平面快照 push+重开）；web 1394、
    backend 787/8。**未做**：CPlaneDialog LINE_ANGLE 页签、converter
    entities/oppositeDirection 映射。
  - [x] **cPlane LINE_POINT（shared 1.43.0，2026-11-07，ADR-0013 切片 2）**：
    `CPlaneParams.point` 与 line 成对、与 LINE_ANGLE/offset/origin 互斥；前端
    normal=normalize(d×(point−line.origin))，点在线退化 → undefined。web
    `cplane.test.ts` **15/15**、后端 registry/RPC **51/51**；真栈
    `e2e/cplane-line-point.spec.ts` **2 passed**（轴线 X + 点 (0,1,1) → 草图拉伸
    **4000.000 mm³** 质心 (10,3.536,10.607)，push+重开）；backend 798/8、web 1418。
    **未做**：LINE_POINT UI、converter、MID_PLANE/THREE_POINT。
  - [x] **cPlane THREE_POINT（shared 1.44.0，2026-11-07，ADR-0013 切片 3）**：
    `threePoints` 三点唯一平面（origin=p1、normal=(p2−p1)×(p3−p1)），与其余模式
    全部互斥，共线退化 → undefined。web `cplane.test.ts` **17/17**、后端
    registry/RPC **52/52**；真栈 `e2e/cplane-three-point.spec.ts` **2 passed**
    （三点与 LINE_ANGLE 45° 同平面 → **4000.000 mm³** 质心 (10,3.536,10.607)，
    push+重开）；backend 799/8、web 1420。**未做**：THREE_POINT UI/converter、
    MID_PLANE（需双面/双平面语义）。
  - [ ] cPlane B2b（任意面/边参考、草图顶点引用、改参传播）。
  - [x] **Handle 真实示例全链（2026-11-06）**：converter 映射 PLANE_POINT
    （世界轴对齐子集）与草图 `planeSourceFeatureId`；extrude/hole `booleanScope`
    压缩查询提取真实 featureId；translator 接线 cPlane origin、草图平面来源映射、
    `booleanScopeFeatureIds → targetBodyId`（多体必需）；runner 增加 body 谱系回溯
    （sourceFeatureId 被 fillet/hole 改写后仍解析到同一 body）、regionRisk 越界面域
    收敛 note、孔方向按目标质心侧判定 backward；converter 修正
    `secondDirectionOppositeDirection=true → 反侧`（旧映射把 130 mm 压成 120）。
    后端 ScenarioReplay 消费 cPlane/planeSource 并新增 `CPlaneScenarioReplay` 1/1。
    真栈 `e2e/examples/handle-scenario.spec.ts` **2 passed**：12 特征全 status=0，
    逐体 38314.220/68563.590 vs 采集 38314.765/68563.589，总误差 0.0005%，
    push+重开一致；约束 refs 仍 `constraints=dropped`。
  - 每项独立 ADR/contract bump + 旧库 fixture。
- [~] **T5 Mirror/pattern 通用化**
  - [x] **mirror 世界基准面整件镜像**（2026-11-06）：converter 识别
    Top→XY / Front→XZ / Right→YZ；仅 `PART` 或 `FEATURE+fullFeaturePattern=true`
    （等价整件镜像），局部特征/任意面镜像如实 dropped。translator 映射
    `MirrorParams{plane,keepOriginal:true}`。真栈 `e2e/examples/mirror.spec.ts`
    setup+test **2 passed**——偏置盒体 YZ 镜像体积 **8000.000 mm³**，
    push+重开一致；翻译器单测同批。
  - [!] **孔位 `.center` 解锁后暴露 sweptFace 选择器（2026-11-07）**：converter 的
    sketch VERTEX 解析原先要求 UUID 后立即引号，`"<uuid>.0.center"` 形态匹配失败 →
    Hole 2 被 dropped。放宽为允许子实体路径后，3 个 hole-only PS（Universal Joint
    Assembly 族）均转换出 Hole 2（4 个圆心孔位），但真栈回放三例全部停在 Fillet 1 的
    `sweptFace`（`sketch=FznNv2IxDsOTqBs_4#…, source=Extrude 11`）**matches=0**——
    不是孔位缺口，需后续 sweptFace 边链/拓扑变化解析；未转绿、不调松断言。
    该 converter 修正仍是一般性改进（18 个含孔位 PS 的转换质量），待选择器跟进后才能出绿例。
  - [!] **work queue 单-gap 分类陈旧（2026-11-07 实证）**：queue 报 capFace/sweptFace
    单 blocker 的三个 PS 实际先卡在别处——Bumper Block→`extrude-draft 10°`（translator
    明确拒收）、Universal Joint→Extrude 11 草图 0 面域（草图/面域转换，非选择器）、
    Stirrup→更早 imprint/through-all 体积累积偏差。**完整 `batch-convert --force` +
    `build-work-queue` 已启动**；刷新前不得把单-gap 当作可达性结论。
  - [~] **CAP_EDGE through-all 端盖匹配（2026-11-07，test-only）**：Stirrup 单 blocker
    探针暴露 Fillet 2 的两条 CAP_EDGE 引用 through-all remove 源的线端盖；旧实现用
    记录 `depthMm` 当端盖位置（through-all 实际由 body 决定）→ matches=0。已改与
    CAP_FACE 同口径：投影回草图系，按 `isStart` 取最小/最大 w；线端盖被布尔裁剪时
    按“同一支撑线 + 投影重叠”匹配（`projectedCapEdgeOnLine`）。**Stirrup 仍 blocked**：
    matches 仍 0，且更早的 body 体积已偏离（Extrude 6 后 12495.5 vs 预期首体 13599.2+
    逆向余量），说明 imprint/through-all 区域回放存在更深偏差，不能归因选择器；
    不调松断言、不宣称绿。CAP_EDGE 修复保留为一般性修正，待其他合成/真实例验证。
    **2026-11-07 单测补证**：抽出并导出 `projectedCapEdgeOnLine`（edge-resolver.ts），
    新增 `e2e/examples/replay/edge-resolver-through-all.spec.ts` **8 passed**
    （同一支撑线裁剪重叠/端点反转/整段覆盖为 true；垂直偏移/投影不相交/跨端盖
    平面/非 line 一律 false）。Stirrup 仍 blocked（更早 imprint/through-all 体积
    偏差），单测只钉死解析器语义。
  - [x] **mirror 任意世界平面（planeLine）**（2026-11-07，shared 1.37.0，ADR-0011）：
    `MirrorParams.planeLine{origin,normal}`，plane/planeLine 恰一、法向归一化；
    后端 `MirrorFlow` **10/10**；真栈 `e2e/mirror-plane-line.spec.ts` **2 passed**
    （对角 x=y 16.000 mm³ 质心 (2.5,2.5) → 偏置 x=2 16.000 质心 (2,1)，push+重开）。
    **未做**：面/基准面引用（planeRef）、局部 FEATURE 作用域、UI/converter 映射。
  - [x] **mirror faceRef 面镜像（2026-11-07，shared 1.41.0，ADR-0011 切片 2）**：
    `MirrorParams.faceRef`（plane/planeLine/faceRef 恰一）；后端 scratch 载体
    `facesFromId` → `getSubEntityGeometry` → `CurveOps.isPlanar` 取面平面，非平面/
    多面片/失效引用诚实拒收。`MirrorFlow` **14/14**（顶面/右面各 16 mm³、失效
    引用 status≠0、三模式校验）；真栈 `e2e/mirror-face.spec.ts` **2 passed**
    （盒 20×20×10 顶面镜像 **8000.000 mm³** 质心 (10,10,10)，push+重开）；
    shared 167、backend 791/8。**未做**：镜像面选择 UI、FEATURE 作用域、
    converter/回放期面引用解析。
  - [x] **linear pattern 居中（2026-11-08，shared 1.49.0，ADR-0007 切片 6）**：
    官方帮助页 + 论坛证据：Onshape 输入实例数 N 为**每侧含 seed**，总数 **2N−1**，
    seed 居中不移动。契约 `FeaturePatternParams.centered?: boolean`（count 仍为总实例数，
    centered 须奇数）；后端 `featurePatternTransforms` 偏移
    `(k−(count−1)/2)·spacing`，schema 拒偶数/圆周 centered；translator 34/34；
    converter 按 `count=2N−1` 映射。后端 `FeaturePatternFlow` **7/7**（centered
    count 3 spacing 0.6 → 变换 ±0.6、体 8.75；偶数/圆周拒收）；真栈
    `e2e/examples/feature-pattern-centered.spec.ts` **2 passed**（40×40 盒 + 凸台，
    centered count 5 spacing 6 → **16400.000 mm³** 质心 x=0.0000，push+重开）。
    语料 5 个 centered linear 表达式可求值，但分别被非 hole/extrude/revolve 源、
    多源、sheet metal 阻塞——**无新绿例**。
    **body PatternParams + UI（ADR-0007 切片 7，2026-11-08）已补**：shared
    `PatternParams.centered?`；后端 `patternSchema`/`patternInstanceTransforms`
    居中（`PatternFlow` b2/b3；4 文件 74/74）；FeatureDialog pattern 通道「居中」
    复选框启用——UI 输入 N=每侧实例数（含原件），载荷 `count=2N−1`+`centered:true`，
    圆周禁用复位，编辑回显 `N=(count+1)/2`（单测 148/148，+4）；真栈
    `e2e/pattern-centered-ui.spec.ts` **2 passed**——4×4×5 盒 N=3/spacing=6 →
    count=5 **400.000 mm³** 质心 (2,2,2.5)，push+重开。第二方向/跳过实例仍为
    禁用占位；converter 仍只转 FACE/FEATURE（PART body pattern 未映射）。回归：
    后端全量 **820 passed / 1 expected fail / 8 skipped**（96 files）、
    web **1447/1447**、shared 170/170、translator 34/34、converter 14/14。
  - [x] **revolve 轮廓实体 → 真实面域 + 多体边源限定（2026-11-08，test-only，ADR-0003）**：
    根因：converter 对单 query revolve 盲取 region 0，同一草图多个 NEW revolve
    （Handle Parts 三轮廓实体 2/8/5）全部落进同一面域。converter 增
    `revolve.profileEntityIds`（`findSketchEntityForQuery` 全解析才携带）；回放器
    `region-entity-resolver.ts` 按 `SketchRegionDto.outerEntityIds/holeEntityIds`
    映射面域（显式 regions 优先；未命中/共享边界歧义不猜，退回旧口径并标近似），
    单测 **6/6**；`resolveScenarioEdges` 增 bodyScope，按 selector
    `operationSourceIds` 收窄候选 body（共享顶点圆边不再跨 body 误配）。
    **真栈 Handle Parts 前置 10 特征跑通**：3 体未圆角 12326.161 / 32140.878 /
    106103.005 mm³（与终态期望同序，差值即圆角去材）；
    **blocked**：Fillet 1 的 6 条 SWEPT_EDGE 分属 3 body，产品单 `targetBodyId`
    契约跨体圆角无合法载荷 → ADR-0015 任务 #124，spec 以 `test.fail` 登记
    known-red。回归 Handle/Hand Brake 真栈绿；Sample Assignment（连接失败）与
    iOS edge-selector（MS 429）首跑为环境红，窗口恢复后复跑 **2 passed /
    3 passed**。
    **Universal Joint Drawing 面边界验收**：Chamfer 10 的 6 条 SWEPT_FACE 中
    未裁剪面 entity 18 已展开 4 条边；entity 10 匹配 0 条。调试证据为最终体
    全部边 x ≤ 0（存在镜像侧对应边），正侧几何整体缺失——上游 Extrude
    10/11/12 region/imprint 回放体分叉（Mirror 1 在 Chamfer 之后），不是单纯
    面裁剪；spec `test.fail` known-red。队列缺口由「capFace/sweptFace 待验收」
    收窄为**「上游体分叉 + 缺失面解析」**。
  - [x] **featurePattern 树行编辑 UI（2026-11-08，ADR-0007 切片 8）**：新增
    `FeaturePatternDialog`；树行双击 → 源特征/轴只读展示（updateParams 结构引用），
    可编辑 kind/count/spacing?/angle?，linear 可切换「居中」（每侧 N 语义，
    载荷 count=2N−1+centered；圆周禁用复位）；不渲染
    无产品通道的方向/面拾取假控件。单测 **8/8**；真栈
    `e2e/feature-pattern-edit-ui.spec.ts` **2 passed**——16240 mm³ → 树行双击 →
    实例数 3→4 → **16320.000 mm³** → 再勾选居中、每侧 3 → **16400.000 mm³**，
    树/status/push+重开一致；同时补
    featurePattern/featureMirror/moveFace/faceExtrude/transform/splitPart 的树类型
    词条（不再回退原始英文串）。**改参预览已补（同日）**：后端 `previewOp`
    updateParams 对 featurePattern 影子求值回传 `PreviewResult.preview`
    （`FeaturePatternFlow.test.ts` **8/8**：非空几何/elementId=目标体/树与体零写），
    UI 250ms 防抖经 `FeaturePreviewOverlay` 渲染，真栈断言 `data-dynamic=1`。
    多源 featurePattern 未做。
  - [x] **featurePattern 树行抑制/删除通道验收（W2.10 部分，2026-11-08，ADR-0007 切片 9）**：
    复用通用树 op 通道（`setFeatureSuppressed`/`deleteFeature`），真栈
    `e2e/feature-pattern-tree-ops.spec.ts` **3 passed**（setup + 主例 + known-red）：
    16240 mm³ →「抑制」**16080.000**（源凸台仍在）→「取消抑制」**16240.000**
    →「删除」HITL 确认 → 树剩 `sketch/extrude/sketch/extrude`、push+重开一致。
    **已知缺口**：`deleteFeature` 不触发 body 再生（后端 M1 语义，私有
    `ChamferFlow.test.ts` 同口径），删除后 live/冷重开体积仍为 16240；第二用例
    `test.fail` 钉正确期望 16080（RW2-T9 backlog）。`BODY_PRODUCING_FEATURE_TYPES`
    补 featurePattern/featureMirror/moveFace/faceExtrude/transform/splitPart，
    单测 `body-producing.test.ts` **3/3**。**仍缺**：多源 featurePattern、
    删除后实时再生（preview 已在切片 8 补齐）。
  - [x] **改参预览扩展 shell/moveFace/chamfer/hole（2026-11-08）**：后端 `previewOp`
    `updateParams` 对 shell/moveFace/chamfer/hole 影子求值新参数（直接取
    `evaluateChainForPreview` 写入 shadow Map 的结果，不重复内核求值）、
    `insertFeature` fillet/chamfer/shell/moveFace 同通道（目标链尾缓存 + 目标体）、
    hole 用 `evaluateHole` 在 scratch Map 求值，回传既有 `PreviewResult.preview`
    （不写库/缓存、无 txn；对话框此前只拿到 affected）。后端 `ShellFlow`
    **10/10**、`MoveFaceFlow` **10/10**、`ChamferFlow` **10/10**、`HoleFlow`
    **7/7**（预览非空/elementId=目标体/体与树零写）；真栈 `e2e/shell.spec.ts`
    **2 passed**（新建/编辑对话框 `data-dynamic=1`，1084 mm³）、
    `e2e/move-face-ui.spec.ts` **2 passed**（距离 5 预览，6000 mm³ 不变）、
    `e2e/examples/ios-first-part.spec.ts` **2 passed**（倒角 3 边 + 2 mm 预览，
    EXAMPLE_RESET=1 冷库；final 157478.900 mm³）、`e2e/hole.spec.ts --grep 草图点`
    **2 passed**（throughAll 预览，去材 196.349 mm³）。UI FeatureDialog 倒角通道
    三种模式（equal/twoDistances/distanceAngle）与提交同构造触发预览，单测
    FeatureDialog **149/149**；HoleDialog 预览 + 透明度滑杆启用，单测
    HoleDialog **8/8**。
  - [x] **loft/sweep 插入预览（2026-11-08）**：后端 `previewOp insertFeature`
    对 loft/sweep 用链尾缓存（纯草图链可空）+ 目标体影子求值，回传
    `PreviewResult.preview`（不写库/缓存、无 txn）。FeatureDialog 预览 effect
    扩展：loft 两截面齐备、sweep 轮廓+路径齐备（互异）即 150ms 防抖预览。
    后端 `LoftFlow` **10/10**（含已有上游体并入结果零写）、`SweepFlow`
    **10/10**（含纯草图链无上游预览）；单测 FeatureDialog **151/151**；真栈
    `e2e/loft-sweep-preview.spec.ts` **2 passed**——4 草图 RPC 建链 → 放样
    预览/提交 → 扫掠预览/提交，树 `sketch×4/loft/sweep` 全 status=0、
    **2427.581 mm³**、push+重开一致。
  - [x] **mirror/pattern 插入预览（2026-11-08）**：后端 insertFeature 预览集
    扩到 mirror/pattern（上游缓存必须存在）；FeatureDialog 预览 effect 整体
    迁到派生就绪量之后，复用提交门口径（mirror 平面/面引用/操作、
    pattern kind/count/spacing/angle/axis/centered），插入载荷带
    `targetBodyId`（非边拾取通道）。后端 `MirrorFlow`/`PatternFlow` 各增
    预览用例（预览非空、elementId=目标体、体与树零写；两文件共 36 passed）；
    单测 FeatureDialog **153/153**（打开即预览、切圆周再预览）；真栈
    `e2e/mirror-operation-ui.spec.ts`（相交 **2000 mm³**）与
    `e2e/pattern-centered-ui.spec.ts`（**400.000 mm³** 质心 x=2）均
    `data-dynamic=1`、push+重开一致（合计 3 passed）。
  - [x] **booleanBodies 插入预览（2026-11-08）**：插入尚无 FeatureDrives，
    `evaluateBooleanBodiesPreview` 用 `planBooleanInsert` 的目标链前驱 + 工具源
    直读缓存，按 unite/subtract/intersect 同一内核操作影子求值（零写）；目标体
    elementId 供 TileRpc 预览并隐藏源 target。FeatureDialog 体布尔通道复用提交
    载荷（targets/tools/operation/keepTools）。后端 `BooleanBodiesFlow` **37/37**
    （intersect 预览非空、目标/工具几何与 active 态零变）；单测 FeatureDialog
    **154/154**（选工具 + 相交页签即预览）；真栈
    `e2e/boolean-intersect-ui.spec.ts` **2 passed**——`data-dynamic=1`，
    **1.000 mm³**、工具消费、push+重开一致。
  - [x] **mirror/pattern 改参预览（2026-11-08）**：`previewOp updateParams` 白名单
    扩到 mirror/pattern，复用 `previewGeometryFromShadow` 回传
    `PreviewResult.preview`（影子求值零写）。后端 `MirrorFlow`/`PatternFlow` 各增
    updateParams 预览用例（平面 XZ→YZ、count 3→4；预览非空、elementId=目标体、
    体与树参数零变；两文件共 38 passed）。单测 FeatureDialog **156/156**
    （edit 模式打开即 `previewOp` updateParams mirror/pattern）；真栈
    `e2e/pattern-centered-ui.spec.ts`、`e2e/mirror-operation-ui.spec.ts`
    在 push+重开后双击树行 → 编辑对话框 `data-dynamic=1`，取消后
    **400/2000 mm³** 不变（合计 3 passed）。
  - [x] **第二方向 UP_TO_SURFACE 静态近似（2026-11-08，test-only，ADR-0003）**：
    converter 把 `secondDirectionBound=UP_TO_SURFACE` 按已解算
    `secondDirectionDepth` 转 `blind + approximate + sourceBound`（与主方向
    up-to 静态近似同口径）；translator 显式标 approximate 并记 note。translator
    **35/35**；合成真栈
    `e2e/examples/replay/extrude-second-direction-approximate.spec.ts` **2 passed**
    （20×20 拉伸 10 + 第二方向 5 = **6000 mm³**，push+重开）。Stirrup 真实 PS
    仍 known-red：整链在 Fillet 2 的 CAP_EDGE through-all 选择器阻塞
    （sketch FZoXezUu…#4，source=Extrude 4 remove through_all，matches=0；
    当时点体边与草图槽位不符 → 属 #106 上游分叉），spec `test.fail` 登记。
  - [x] **零件段逐 body 体积（W1.5b，2026-11-08）**：新增
    `useBodyMassProperties`（只读 `getMassProperties`，scope=`activeModelId`，
    随 entries 刷新；失败/无连接不阻塞树）；`activeBodyParts` 映射
    `volumeMm3`；TreeRow 零件行显示千分位体积文案（title 可访问名）。
    单测 activeBodyParts/TreeRow **2** + hook **3**；真栈
    `e2e/per-body-volume-ui.spec.ts` **2 passed**——两体 **500.000 / 4000.000
    mm³**（20×20×10 + 10×10×5 NEW），零件段 2 行各自体积，push+重开仍在。
  - [x] **mirror faceRef 选择 UI（2026-11-07，ADR-0011 切片 2b）**：ribbon
    `MirrorElements` 路由快照选中面 → `dialog.inputFaces` → FeatureDialog
    「镜像平面」下拉增 `选中的面`；恰一面缺省 FACE，多选面明确拒绝（FACE 选项禁用），
    N>1 目标实体缺省取面所属 body，改到别的 body 触发 owner mismatch 禁提交；
    edit 落库 faceRef 只读回显。单测 FeatureDialog +5 / Ribbon +1（定向 **177/177**，
    web 全量 **1437/1437**）；真栈 `e2e/mirror-face-ui.spec.ts` **2 passed（39.5 s）**：
    顶面 faceRef=(1,6) → 对话框 FACE → **8000.000 mm³** 质心 (10,10,10)，
    树/status/push+重开一致。converter mirror FACE 仍 blocked（回放期面解析未做）。
  - [x] **featureMirror 特征级镜像首切片（2026-11-07，shared 1.47.0，ADR-0011 切片 3）**：
    新 FeatureType `featureMirror {sourceFeatureId, planeLine}`；后端读取源特征前/后
    缓存差集 → 反射 → 按源操作 Unite/Subtract。源限 extrude/revolve/hole add/remove，
    NEW/草图/失效源拒收。`FeatureMirrorFlow` **3/3**（孔镜像 16000−180π、凸台
    16000+90π、守卫）；scenario schema/validator + translator **26/26**；真栈
    `e2e/feature-mirror.spec.ts` **2 passed**（板+孔切除镜像 **15434.514** vs
    15434.513 mm³，push+重开）。converter：单源 FEATURE mirror → featureMirror；
    多源/跨 body 源如实 dropped；FEATURE_ALL 整 body 镜像标
    `featureAllApproximation`。**真实 PS dfc6e33c/006ab003 blocked-capability**：
    Mirror 1 三源（Extrude 2 REMOVE、Extrude 3 REMOVE、Circular pattern 1 FEATURE）
    跨两个 body 谱系，丢后回放 65,675.220/14,544.246 vs 采集
    64,831.091/13,917.196。**未做**：多源逐源 body 归属、featurePattern 源、
    UI、真实 PS 转绿（还受上游 imprintFace/pattern 语义阻塞）。
  - [x] **featureMirror 选择 UI（2026-11-08，ADR-0011 切片 5）**：按 live 证据
    `ui-evidence/mirror-feature-scope-20261108/mirror-scope.json`（范围 零件镜像/
    特征镜像；特征行 要镜像的特征/镜像平面）实现——FeatureDialog「镜像范围」下拉、
    「要镜像的特征」下拉（宿主自特征树过滤未抑制 extrude/revolve/hole）、特征作用域
    隐藏镜像操作页签与 FACE 选项、世界平面 XY/YZ/XZ → `planeLine` 过原点；
    无源/无上游禁用提交并提示。**后端守卫经真栈实证**：NEW 体不可作为镜像源
    （MS 日志「源特征无上游（NEW 体不可镜像）」）——验收几何改为板 + 顶面凸台
    （第二次拉伸 operation=add）作源。真栈 `e2e/feature-mirror-ui.spec.ts`
    **2 passed（56.2 s）**：40×40×10 板 + Φ6×10 凸台 → YZ x=20 特征镜像
    **16565.486** vs 解析 16000+2×90π=16565.487 mm³（单 body），树
    `sketch/extrude/sketch/extrude/featureMirror` 全 status=0、payload
    `{sourceFeatureId, planeLine origin(0,0,0) normal(1,0,0)}`，push+重开一致；
    FeatureDialog 单测 **164/164**（+4：作用域切换/载荷/空源/预览调用）、
    web 全量 **1484/1484**。**插入预览已补**：后端 `previewOp` 影子求值白名单扩
    featureMirror（源差分缓存直读、当前链尾 Unite/Subtract，零写回不落库）；
    `FeatureMirrorFlow` **4/4**（新增预览 entries 非空/体积/树零变更）、后端全量
    **837 passed / 1 expected fail / 8 skipped**（97 files）；真栈切到特征作用域后
    预览先清空、选源+YZ 后 `data-dynamic=1`（MS `preview-featureMirror` 求值日志）。
    侧栏双击 featureMirror 行改为 Info toast（首版无 updateParams 通道，不打开通用
    参数对话框）。**未做**：面镜像作用域（需 face→planeLine 解析）、多源、真实
    PS 转绿。
  - [x] **transform/splitPart UI 取证复核（2026-11-08，blocked-capability 定级）**：
    CDP 连入已登录 Onshape 副本采集（未写文档，采后取消），证据
    `ui-evidence/feature-dialogs-20261108/onshape/transform-picker.json` + 8 张截图。
    transform 精确行序：按直线平动=要变换或复制的图元/按直线平动/**线或点**/复制零件；
    旋转=…/旋转/**轴**/角度/复制零件；缩放=…/缩放/均匀缩放/缩放/**点或配合连接器**/
    复制零件。splitPart 行序：零件/要分割的零件、曲面或曲线/用于分割的图元/保留工具/
    修剪到面边界/保留两侧。**定级**：产品 `CanvasSelection` 仅持持久拓扑 id/owner，
    `resolveEdgeRef` 不返回坐标/方向，缺“线/点→3D 几何”解析通道与拾取工具；
    split 缺工具图元语义 + 双侧多体输出（ADR-0015）。二者从 blocked-evidence 改判
    blocked-capability，UI 继续 gated，不以 X/Y/Z 输入或世界平面下拉替代。
  - [x] **extrude upToSurface 首切片（2026-11-08，shared 1.52.0，ADR-0005 Phase 5）**：
    `ExtrudeParams.endFaceRef + endBound=upToSurface`（平行平面目标面）；后端每次求值
    周期经 scratch carrier 动态解析持久面引用（不落库），preEvaluateDirty/rebuildAll/
    evaluateChainForPreview 预解析、同步 EDE 只消费映射（缺失 status=1，不回退占位
    距离）。schema 拒收 upToNext/upToVertex、缺面、symmetric/draft/secondDirection/new。
    后端 `UpToSurfaceFlow` **5/5**（顶面 1500 mm³、冷重建 1500、失效/非平行 status=1、
    8 组 schema 拒收）；shared **170/170**；web **1484/1484**；真栈
    `e2e/extrude-up-to-surface.spec.ts` **2 passed（53.7 s）**——板 2000 → upToSurface
    顶面 remove **1500.000 mm³**（distance=1 占位未使用），faceRef=(1,6)、树全 status=0、
    push+冷重开一致。**UI 已接（同日 live 证据 `extrude-endbound-menu.json`/
    `extrude-endbound-surface.json`）**：终止条件「成形到面」+ 唯一选中面快照 +
    面提示/无面多选禁用 + edit 回显；真栈 `e2e/extrude-up-to-surface-ui.spec.ts`
    **2 passed（1.1 min）** 同体积 1500、push+重开，web **1487/1487**（FeatureDialog
    **167/167**）。Onshape `hasOffset`（偏移距离）未做；**upToNext 已接**（同日：
    枚举上游面取沿方向最近平行面；终止条件「成形到下一个面」无需选面，无候选
    status=1；`UpToSurfaceFlow` 组合 **8/8**、真栈 `extrude-up-to-next-ui` **2 passed**
    1500 mm³ push+重开）；**回放链路同批接通**：translator `up_to_next` 不再静态近似
    为 blind，直接透传 `endBound=upToNext`（new/symmetric/draft/secondDirection 阻塞；
    upToSurface 仍缺目标 faceRef 查询，保持 blind+solvedDepth approximate）；translator
    **38/38**、后端 `ScenarioReplayParity` **5/5**（upToNext 板 2000→1500）、真栈
    `e2e/examples/replay/extrude-up-to-next-scenario.spec.ts` **2 passed（56.3 s）**
    1500 mm³ push+重开；**upToVertex/SURFACE/双厚度仍待办**。
  - [x] **extrude THIN 薄壁首切片（2026-11-08，shared 1.53.0，ADR-0005 Phase 6）**：
    `ExtrudeParams.bodyType="THIN" + thinThicknessMm`（单侧向内壁厚）；后端外环 Sweep −
    内偏置环 Sweep（CurveOps 与 draft 同通道），仅无孔面域，退化/含孔诚实 status=1；
    与 symmetric/draft/第二方向/upTo* 互斥。live 证据 `extrude-upto2-thin.png`（实体/
    曲面/薄壁页签；厚度 1/2、中间平面）。UI 结果类型实体/薄壁启用、曲面禁用，壁厚输入
    + 冲突控件复位；载荷 bodyType/thickness。后端 `ExtrudeThinWallFlow` **4/4**
    （10×10×10：壁厚1 **360**、壁厚2 **640**、超厚 status1、schema 7 组拒收）；
    shared **170/170**、web **1490/1490**（FeatureDialog **170/170**）；真栈
    `e2e/extrude-thin-wall-ui.spec.ts` **2 passed（51.8 s）** 薄壁 1 mm **360.000 mm³**
    push+重开一致。**未做**：含孔薄壁、双厚度/中间平面、SURFACE、薄壁拔模/第二方向、
    converter 映射。
  - [x] **THIN 中间平面（2026-11-08，shared 1.55.0，ADR-0005 Phase 6 增补）**：
    `ExtrudeParams.thinMidPlane`——厚度以草图边界为中心向两侧各半；后端外环带=
    外扩半厚−内收半厚，孔壁带同构并裁剪到外扩外形；仅 bodyType=THIN 合法。UI
    薄壁页签按 live 行序先「中间平面」后「壁厚」，edit 回显/合并。后端
    `ExtrudeThinWallFlow` **7/7**（10×10 t1 midplane **400**、含孔 midplane
    **19.142**、schema 拒收）；shared **170/170**、web **1496/1496**
    （FeatureDialog **176/176**）；真栈 `e2e/extrude-thin-wall-ui.spec.ts`
    **4 passed（1.1 min）**：360/400/18.712 均 push+重开一致。第二厚度/非对称
    双侧、薄壁拔模/第二方向仍未做。
  - [x] **THIN 含孔薄壁（2026-11-08，ADR-0005 Phase 6 增补）**：含孔面域薄壁 =
    外环带（外环 − 内偏置环）先减去孔实体，再与孔壁带（孔边界负偏移向外扩 − 孔边界，
    并与外形体求交）Unite；偏置退化/孔环非闭合诚实 status=1。后端
    `ExtrudeThinWallFlow` **5/5**（4×4 外矩形 + r=0.5 圆孔、t=0.5、depth=2 →
    **18.712 mm³** = (7+0.75π)×2）；真栈 `e2e/extrude-thin-wall-ui.spec.ts` **3 passed
    （46.8 s）** 同体积 18.712 push+重开；既有无孔 360 mm³ 回归不变。无新契约字段；
    多孔循环已支持但无独立验收，双厚度/中间平面仍未做。
  - [x] **extrude upToSurface 偏移距离（2026-11-08，shared 1.54.0，ADR-0005 Phase 5 增补）**：
    语料 148 个 upToSurface 中 14 个启用 `hasOffset`（4 个反向）；live UI 证据
    `extrude-endbound-surface.json` 的 `hasOffset`（偏移距离）行。契约
    `ExtrudeParams.endOffsetMm (>0) + endOffsetOppositeDirection`（仅 upToSurface；
    upToNext/盲拉/完全贯穿携带即 zod 拒收）。后端目标面平面沿拉伸方向平移 ±offset
    后再扣起始偏移，非正距离 status=1；动态面解析语义不变。UI 成形到面下增
    「偏移距离」复选 + 距离 + 反向，编辑回显/关闭删旧键。后端 `UpToSurfaceFlow`
    **12/12**（+5 加材 **2500**、反向 2 去材 **1700**、updateParams 1500→1700→1500、
    5 组 schema 拒收）；shared **170/170**；FeatureDialog **174/174**；真栈
    `e2e/extrude-up-to-surface-offset-ui.spec.ts` **2 passed（1.1 min）**——
    板 20×20×5 顶面偏移反向 2 → **1700.000 mm³**，params 保留偏移键、push+冷重开一致。
    **未做**：偏移与 upToNext/面选择器组合、converter 映射（目标面查询仍缺），
    不把 14 个语料特征标绿。
  - [x] **hole upToNext 终止条件（2026-11-08，shared 1.56.0，ADR-0006 切片 A6）**：
    `HoleParams.endBound="upToNext"`；复用 UpToPlane 最近平行面，以孔位为探针过滤
    同体其它孔底/内侧平行面；候选面用 Loop 描边 + 射线奇偶做**点-面精确包含**
    （ParityRegion 外层减孔），复合非凸面不再靠 bbox 误选。多孔位逐孔解析目标平面
    （任一孔位失败整特征 status=1）。HoleDialog 终止条件「成形到下一个面」+ 隐藏
    深度；插入/改参预览同样预解析。后端 `HoleFlow` **10/10**（φ3、板厚 10 →
    **70.686 mm³**；多孔位同目标面 → **62.832 mm³**）、新增
    `HoleUpToNextSteppedFlow` **1/1**（基板+凸台逐孔 10/5 → **15π**）、
    `HoleDialog.test.tsx` **11/11**；真栈 `e2e/hole.spec.ts --grep upToNext`
    **2 passed（46.2 s）**——板厚 10、φ5 去材 **196.349 vs 196.350 mm³**。
    回放链路：translator 单/多孔位直通 **40/40**、后端 `ScenarioReplayParity`
    **6/6**；converter 映射 UP_TO_NEXT（多孔位不 drop；Postman 该孔转由沉头孔
    尺寸表达式阻塞，示例仍 blocked）。**未做**：upToVertex/upToSurface 孔、
    螺纹/间隙表、边界点描边容差独立验收。shared **170/170**、web **1497/1497**、
    后端全量 **861 passed / 1 expected fail / 8 skipped（100 files）**。
  - [!] **upToSurface 对话框内面拾取（2026-11-08，blocked-capability）**：临时复用
    `store.canvas.selection` 在打开拉伸后点选顶面，真栈用例失败——store selection
    仍空、`成形到面` 仍禁用；根因为 `useOnshapeSelection` 的 paused effect 在任何
    dialog/草图打开期间清选择并挂起 OnshapeSelectTool。现有姿态保持“打开前选面”
    （路由快照），面拾取器需 dialog-scoped pick mode/选择权威设计；不渲染假按钮。
  - [ ] **Gaiter fillet 内核复核（2026-11-08，blocked-kernel 待全链重跑）**：私有后端
    临时探针（constraints 置空对齐 runner skip；scratch StandaloneDb + ScenarioReplay，
    sketch→revolve→fillet 前缀）：revolve 基准 **46039.749**；8 边一次 fillet
    **45837.190**（−202.559），并非此前记录的零体积；4+4、8×1 与一次 8 边逐位相同
    （45837.190），分组不是 workaround；单边 e0 45766.673 / e1 45877.882 /
    e2 46014.431 / e3 46027.975 / e4 46044.297 / e5 46030.611 / e6 46171.032 /
    e7 46182.531，e4/e6/e7 增材（凹边可能合法，未做凸凹分类，不能断言正确）。
    单边净和 −202.560 与 8 边一次一致。**全链 web 重跑**（scenario-file runner，
    Gaiter 原 scenario + skip constraints）：6 特征 apply 全 ok，落库树 10 行
    `sketch/revolve/fillet/shell/sketch/extrude` **全 status=0**，shell faces
    (2:1,2:15) 解析成功、Body 1 存在（构建与 push 已过）；但后续
    `getMassProperties` RPC **>7 min 不返回（HeadersTimeout）**，画布黑屏。
    阻塞点改判为 **shell/fillet 后 BRep 质量属性不可计算（内核病态）**；
    Gaiter 仍 blocked-kernel/fixme，不以树 status=0 或分组近似冒充绿。
    探针/检查文件已删除，结论入 ADR-0008。

  - [x] **CAP_FACE 镜像面静态推导（2026-11-07，test-only）**：converter 对
    mirrorPlane 的 CAP_FACE query 取源 extrude + isStart，用已解算深度/对称/方向
    + 草图平面推出端盖世界平面；through-all/缺深度如实 dropped。translator
    `mirrorOp` 支持 planeLine 与 `planeApprox` 近似标记；`featureMirrorOp` 同步。
    translator **28/28**。真实语料 Multi Part Build（5e615183）Mirror 1 由 dropped
    变为 `origin(0,25,0) normal(0,1,0)`、特征数 12→13；该 PS 仍被 Midplane cPlane/
    第二方向/booleanBodies 阻塞，不宣称绿。SWEPT_FACE/plane 特征/实体面复核未做。
  - [x] **mirror operation 加入/移除/相交（2026-11-07，shared 1.48.0，ADR-0011 切片 2c）**：
    `MirrorParams.operation?: unite|subtract|intersect`（缺省 unite 旧载荷兼容）；
    后端映射 `[上游, 镜像]` 到 BRep Unite/Subtract/Intersect，`MirrorFlow` **16/16**
    （偏置面 x=4.2：交集 6.4 / 差集 1.6 mm³；zod 拒 `union`）。FeatureDialog
    「镜像操作」页签（加入/移除/相交），「新建」需多体输出（ADR-0015）禁用+提示；
    operation 非 unite 才写载荷、edit 回显。真栈 `e2e/mirror-operation-ui.spec.ts`
    **2 passed（47.5 s）**：盒 3000 mm³ → YZ + 相交 = **2000.000 mm³**，
    树 status=0 / params / push+重开一致；web **1439/1439**、shared **170/170**。
    **converter operation 映射已接（test-only）**：ADD→缺省 unite、REMOVE→subtract、
    INTERSECT→intersect；NEW（独立镜像体）保留旧 unite 几何但标
    `newBodyApproximation`，translator 记 approximate + ADR-0015 提示。全库 79
    mirror：NEW 53/ADD 21/缺 operationType 5，REMOVE/INTERSECT **0**（不新增绿例）。
    translator **33/33**、converter selector **14/14**。后端 `mirrorFormFields` 补
    `operation`（FeatureTypeRegistry/FeatureRpcImpl 投影门禁）；自述 TEMP 的
    `BumperApproxReplay.tmp.test.ts` 已移出 vitest glob 保留为 `.tmp.probe.mjs`。
    **未做**：新建独立镜像体（多体）、多选面批量镜像。
  - [x] **SWEPT_EDGE 圆实体 + 相邻实体消歧（2026-11-07，test-only，selector）**：
    Hydraulic Fillet 1 六条查询均为「外圆 + 两条相邻直线」，旧 `sketchEntityEndpoints`
    对 circle 返回空 → 候选点恒空、matches=0；converter 的 `findContextSketchEntityIds`
    又只认 `$后缀`，明文完整 UUID 的相邻实体未进 selector.context。修复：converter
    用 `sourceMatches` 识别明文 UUID；前端/后端 resolver 在圆主实体时取相邻实体
    唯一共享且落在圆上的端点（新纯函数，双端同口径；共享点不在圆/不足 2/两个
    → 空集不猜）。单测：前端 **6/6**、后端 `ScenarioEdgeMatcher` **9/9**、converter
    **14/14**。真栈 Hydraulic 已过 Fillet 1（体 **51527.568 mm³**，六条边全解析），
    但该 PS 的 Revolve 2/3/4/5 均 `regionRisk`（面域短码无静态映射）、Revolve 2 后
    体读数归零且后续 RPC 出现 HeadersTimeout——**属 smoke 候选，不是可宣称绿项**，
    known-red 保留。回归：Hand Brake scenario **2 passed**（7125.270 vs 7125.274）、
    `edge-selector.spec.ts` **3 passed**（iOS 157478.901），全量重转后绿例未回退。
    **OFFSET_EDGE 仍 blocked-selector**：664c42/a3c462（Hydraulic BOM，25 特征/
    4 body，无 regionRisk）仅剩 Fillet 4 的 2 条 `OFFSET_EDGE`（shell 内偏移边，
    引用草图顶点 + shell 3.175）；无几何唯一匹配证据，不猜。
  - [ ] mirror 局部 FEATURE 作用域剩余（多源/featurePattern 源）；
  - [ ] pattern FEATURE 模式/任意轴/方向/skip/第二方向；
  - [ ] 解锁 mirror 剩余、circularPattern 26、linearPattern 7。
- [~] **T6 Sketch external refs + missing relations**
  - [x] **point-on-line coincident（v1.31，2026-11-06）**：`SLVS_C_PT_LINE_DISTANCE=0`
    等价形态；SolverTypes/Normalizer/SlvsSolver/converter 全链；`src/sketch` 46/46；
    后端回放 31/31；全量重转后该缺口 247→3 条。
  - [x] **单点 H/V（点+原点）映射（2026-11-06）**：converter 旧实现无差别剥离
    HORIZONTAL/VERTICAL 的 origin 引用，导致 143 条“单点形态”被误判未映射；现仅
    line+origin 剥离 origin，point+origin 保留为合法两点式（normalizer 把 origin
    解析为隐藏固定点）。后端 `SketchWireNormalizer` **7/7**（新增点+原点水平轴用例）；
    真实场景回放 `ScenarioReplayCorpus`+`BasicDrawingReplay` **4/4**；全量重转后
    单点形态缺口 **143→6**。剩余 6 条为无 origin/非 point 引用，继续按证据处理。
  - [x] **CENTERLINE_DIMENSION 映射（2026-11-06）**：原始约束 localFirst/localSecond
    + length 与 distance 同构，中心线（construction line）→ distance line+point /
    line+line；全量重转后该缺口 **47→0**（Basic Drawing 场景重转仍回放 4/4）。
  - [x] **CONCENTRIC 映射（2026-11-06）**：converter kindMap + solver 既有
    concentric 通道；能解析两侧 refs 的约束已转出（如 Dumper Sketch 23 refs [15,17]）。
    大量 PS 仍因复合/外部 refs 报 `refs 不足 2`，未冒充完整。
  - [x] **assignVariable 静态求值（converter-only，2026-11-06）**：ASSIGNED 的
    LENGTH(mm)/ANGLE(rad) 变量经小型算术/单位求值器烘焙，表达式支持括号、四则、
    `#var`、in/mm/deg；provenance 记 `variables=static:N`。MEASURED（依赖几何测量）
    与无法确定单位/值的表达式如实 dropped。**不是产品变量表/UI**——W2.8 仍未完成。
  - [x] **切片 1a：草图→草图投影（2026-11-07，shared 1.35.0，ADR-0009）**：
    `insertSketch.projections` 合成 line/circle/arc/point 投影实体（`projected` 标记，
    不占 DOF、约束引用暂拒收）；平行平面圆/弧保真，非平行诚实拒收；读取按源当前解
    实时重投影（面域/显示/孔位/扫掠/旋转轴统一入口）；源草图→投影草图 + 源→消费特征
    驱动边保证改尺寸联动；删除守卫/incoming 边清理。后端 `SketchProjectionFlow` **4/4**、
    后端全量 **773 passed / 8 skipped**（transform 后 92 files）；真栈 `e2e/sketch-projection.spec.ts` **2 passed**
    （投影拉伸 2000→源宽 30→3000 mm³，push+重开；DOF=0、区域 400→600）；shared 162/162、
    web 1390/1390。**未做**：实体边/面源、PIERCE/INTERSECTED/SILHOUETTED 约束关系、
    Use/Project UI、converter 映射（PROJECTED 约束仍如实 dropped）。
  - [ ] `SketchRef` external face/edge/vertex；PROJECTED/INTERSECTED/SILHOUETTED/PIERCE/Use 实体边源；
  - [ ] MIRROR/LINEAR/CIRCULAR_PATTERN、circle start/end；
  - [ ] solver/region/decorations/UI 同步；约束树完整性单独验收。
- [~] **T7 Wave 2 features**
  - [x] **transform 切片 1（2026-11-07，shared 1.36.0，ADR-0010）**：目标 body 平移/
    绕任意世界轴旋转（先旋转后平移）；`copy=true` 原件+副本 Unite；零平移/零轴/零角/
    无参数拒收。后端 `TransformFlow` **5/5**（平移 bbox、副本 2000、旋转 bbox、
    先转后移组合、校验矩阵）；真栈 `e2e/transform.spec.ts` **2 passed**（旋转质心
    (-5,15)、副本 **2000.000 mm³** 质心 (55,10)，push+重开）。
  - [x] **transform 切片 2：均匀缩放（2026-11-07，shared 1.38.0）**：`scale`（>0）+
    `scaleOrigin`（固定点，缺省原点）；顺序 scale→rotation→translation；零/负缩放、
    仅 scale=1、scaleOrigin 无 scale 拒收。后端 `TransformFlow` **8/8**（scale 2 →
    8000 mm³、0.5@(5,5,5) → 125、scale+平移 bbox x [120,140]）；真栈
    `e2e/transform-scale.spec.ts` **2 passed**（8000/125/8000，质心 (30,10,10)/
    (10,5,5)/(130,10,10)，push+重开）。**未做**：非均匀缩放/剪切、UI/converter 映射。
  - [x] **splitPart 单侧世界平面首切片（2026-11-07，shared 1.39.0，ADR-0012）**：
    `SplitPartParams{plane,offsetMm?,keepSide}`；固定 100 m 半空间大盒 Sweep + Intersect，
    不依赖 body bbox（update 后 bbox 是上次切割结果）。后端 `SplitPartFlow` **6/6**
    （YZ 正/负侧 4000、XY、偏置 6000、体外 status≠0、校验）；真栈
    `e2e/split-part.spec.ts` **2 passed**（2000.000 正侧质心 (15,10,5) → 负侧
    (5,10,5)，push+重开）。**未做**：keepBothSides（双 body 输出）、面驱动、UI/converter。
  - [x] **moveFace 面偏移首切片（2026-11-07，shared 1.42.0，ADR-0014）**：
    `MoveFaceParams{faces:LubanTopologyId[], distanceMm}`（单距离广播；正外扩/负内缩）。
    内核通道探针：OffsetFaces 回包单 BRep Solid（需显式 `offsetAll:false`）；
    DeleteSubEntity 0 回包 → deleteFace blocked-kernel；replaceFace IPC 未暴露。
    后端 `MoveFaceFlow` **6/6**（顶面 +5 6000/−2 3200、右面 +5 5000、update 重求值、
    失效引用、校验）；真栈 `e2e/move-face.spec.ts` **2 passed**（6000.000 质心 z=7.5 →
    3200.000 质心 z=4，push+重开）；shared 168、backend 797/8、web 1394。
  - [x] **moveFace 切片 2：逐面距离（2026-11-07，shared 1.46.0，ADR-0014）**：
    `distancesMm` 与 `distanceMm` 恰一、长度须等于 faces；后端按引用展开距离。
    后端 `MoveFaceFlow` **9/9**（顶 +5/右 +2 → 6600、update → 3040、形态矩阵）；
    真栈 `e2e/move-face-per-face.spec.ts` **2 passed**（6600.000 质心 (11,10,7.5)
    → 3040.000），push+重开；shared 169、backend 806/8、web 1420。
    **未做**：平移模式、UI/converter。
  - [x] **moveFace UI（2026-11-08，ADR-0014 UI 面）**：live 采集
    `ui-evidence/feature-dialogs-20261108/onshape/move-face.{json,png}` 确认字段
    要移动的面/偏移/终止类型（给定深度）/距离/重新应用圆角。新增
    `MoveFaceDialog`（面来自 store.canvas.selection + 路由快照；偏移 + 距离 + 向内/
    向外；「重新应用圆角」禁用+提示；逐面 distancesMm edit 只读）；ribbon `moveFace`
    改道路由（快照面），capabilities `moveFace: full`。单测
    `MoveFaceDialog.test.tsx` **7/7**；真栈 `e2e/move-face-ui.spec.ts` **2 passed**
    （faceRef (1,6)，盒 4000 → 顶面 +5 **6000.000 mm³** 质心 (10,10,7.5)，
    push+重开）；web 全量 **1443/1443**。**未做**：平移/旋转模式、逐面距离编辑、
    converter 映射。
  - [!] **live UI 采集 2026-11-08（私有仓）**：CDP Chrome 登录后经 Playwright
    `connectOverCDP` 驱动 `LubanCAD 覆盖 - Bumper Block` 副本的搜索工具，采集并
    取消（未写文档，特征数回到 10）：
    `ui-evidence/feature-dialogs-20261108/onshape/`
    `move-face/split/transform/linear-pattern.{json,png}`。
    - split：零件/面 + 要分割的零件、曲面或曲线 + 用于分割的图元 + 保留工具 +
      修剪到面边界 + 保留两侧；产品仅单侧世界平面 → 保留两侧/保留工具/面驱动
      仍 blocked（ADR-0012）。
    - transform：要变换或复制的图元 + 按直线平动 + 线或点 + 复制零件；产品仍缺
      线/点拾取 UI（ADR-0010）。
    - linearPattern：零件阵列 + 新建/加入/移除/相交 + 要阵列化的图元 + 方向 +
      距离 + 实例数 + 居中 + 第二方向 + 跳过实例；居中语义仍需 count/distance
      表达式（Small Step 语料为 0/0）。
    采集脚本 `tools/capture-feature-dialogs-20261108.mjs`（私有仓；不提交）。
  - [x] **transform 切片 3：非均匀缩放（2026-11-07，shared 1.45.0，ADR-0010）**：
    `scaleAxes{x,y,z}`（>0，与 scale 互斥；固定组合顺序不变）。后端 `TransformFlow`
    **12/12**（axes 原点/固定点/平移、校验矩阵）；真栈
    `e2e/transform-nonuniform.spec.ts` **2 passed**（4000@(20,10,2.5) →
    @(5,5,5) 质心 (15,10,5) → axes 2+平移 **32000.000** 质心 (120,20,10)，
    push+重开）；shared 169、backend 803/8、web 1420。**未做**：剪切、UI/converter。
  - [x] **up-to 终止条件静态回放近似（2026-11-07，test-only）**：私有 scenario 的
    `up_to_surface/up_to_next/up_to_vertex/up_to_body` 共 **114 特征 / 161 场景**，
    全部携带已解算 `depthMm`（无缺失）；translator 改为 `blind + solvedDepth`，
    显式 `approximate=true` + note「目标查询未采集，产品 up-to 未实现」；缺深度仍
    blocked。translator 单测新增 3 断言（surface/body 近似 + vertex 缺深度拒收），
    `scenario-to-op.spec.ts` **22/22**。**真实探针 blocked**：
    `Explore-…41d5ff…`（5 特征/2 body）建链完成但 body 体积超差——用更新后的
    converter 重转该 PS，dropped 行显示其含 **sheetMetalStart ×2 + mate-connector 孔**
    等未映射特征，scenario 本身不是 geometry-complete；23.6% 超差不能归因 up-to
    （诊断 `EXAMPLE_DEBUG_VOLUMES=1`：Extrude 1 imprint 区域 57020.9 mm³ vs 期望
    20819.5，scenario 缺特征导致）。**全库 geometry-complete 场景中含 main up-to 的
    数量 = 0**（`scenario-conversion.json` 交叉扫描），因此 up-to 真实验收被
    sheet-metal/hole 数据缺口阻塞，不是实现缺口。**产品 up-to 面/顶点/相邻体仍
    blocked**（目标查询未采集）。
  - **secondDirection up-to 数据缺口（2026-11-07 复核，blocked-evidence）**：主方向
    up-to 的已解算深度在 `depth` 参数（如 `25 mm`），但第二方向
    `secondDirectionDepth` 在语料中只有 `value=0`、**无 expression**（实测
    `91f152e…/08f0…` Extrude 8：`endBound=UP_TO_SURFACE`、
    `secondDirectionBound=UP_TO_SURFACE`、`secondDirectionDepth=0` 且无表达式）。
    没有解算深度就不能像主方向一样 blind 近似，也不能猜；该单 blocker 场景登记
    blocked-evidence，待重新采集 solved depth 或产品实现 secondDirection up-to
    目标面。
  - **transform converter 首切片（2026-11-07）**：converter 现映射
    `TRANSLATION_DISTANCE + CAP_FACE` 单体平移（方向=端盖外法向静态推导，
    `directionApprox=true`；makeCopy/旋转/实体方向/对称拉伸一律 dropped）。语料
    43 个 transform 中仅 2 个满足该形态（`58d046…/60f21…`、`664c42…/a3c462…`）。
    `58d046…/60f21…`（Hydraulic Components，24 特征/4 body）原单 blocker 即
    transform，重转后 scenario 24 特征、`geometry-complete` 候选；真栈验收待批次
    结束后跑（canonical scenario 已更新，conversion manifest/example-index 待
    `batch-convert --force` 刷新）。`664c42…` 仍被 Fillet 4 选择器阻塞。
  - **draft native spike 结论（2026-11-07，blocked-capability）**：原生
    `BRepUtil::Modify::TaperFaces`/`AcisModify::TaperFaces` 已存在
    （`imodel-native/iModelCore/BRepCore/AcisModify.h:225-231`，`api_taper_faces`/
    `api_edge_taper_faces`），但第一方 editor backend `EditBuiltInCommand` 只暴露
    `offsetFaces`/`sweepFaces`/`spinFaces`/`deleteSubEntity`，**没有 taperFaces
    的 TS/napi/IPC 绑定**；`BRepGeometryOperation` 枚举也无 Draft。做 draft 需要
    native 绑定 + editor IPC + shared 契约 + 后端求值器 + UI 一整套（P0-08 native
    改动含 ctest/provenance），不是当前切片能安全完成；登记 blocked-capability，
    待独立 ADR。rib 同样无内核通道（需新增特征族），排在同一条目后。
  - splitPart → draft → rib → moveFace/deleteFace/replaceFace → thicken/deleteBodies → loft/sweep N 截面 → variables。
  - 每完成一项构建所有新解锁 PS。

- [x] **W1.2b 能力真相审计（2026-11-07）**：`capabilities.ts` 将无真实 UI 面的七项
  翻 `gated`——thicken/splitPart/transform/deleteBodies/deleteFace/moveFace/replaceFace
  （splitPart/transform/moveFace 后端已落但 UI/converter 未接；deleteFace 内核 0 回包；
  replaceFace IPC 未暴露；thicken 无曲面体管道；deleteBodies 无 FeatureOp）。**2026-11-08
  更正：moveFace 已接 MoveFaceDialog 并翻 full（真栈 6000.000 mm³），gated 集合 34 项**。同步
  `CAPABILITY_GUIDANCE` + en/zh 引导文案；ribbon 测试期望 13 个 gated 工具、
  CommandPalette 加厚子项改断言引导对话框。web 全量 **1415/1415**。
  **续审计（2026-11-07）**：其余四项 `wrap`/`decal`/`modifyFillet`/`userFeatures`
  在产品代码中**无任何 handler/对话框/工具注册**（grep 仅命中注册表与 i18n 标签；
  `USER_FEATURES` 飞菜单为空），原 `full` 属假声明 → 全部翻 `gated` 并补引导文案。
  ribbon gated 顶层工具 13→15（新增 `modifyFillet`、`USER_FEATURES`；wrap/decal 为
  变换子项）；`part-studio-structure` 的「包覆」点击从断言 `tools.run('wrap')` 改为
  断言引导对话框、且不得假启动。web 全量 **1432/1432**（109 files），
  capabilities/ribbon/structure/Ribbon/CommandPalette/DocumentMenuBar/CanvasContextMenu
  定向 **307/307**。**未做**：其余 `full` 项（sweep/loft/boolean/pattern/mirror 等）
  均有真实对话框/工具面，不改；后续新增 UI 仍按 live 证据逐条审计。

- [x] **converter 失败/单 blocker 复查（2026-11-07，closed as blocked-evidence）**：
  对 `scenario-conversion.json` 53 个 failed 与 19 个单 blocker 逐项归因：
  - 53 failed = 24「转换器暂不支持实体」（spline/conic/text 等草图实体族）+
    29「不支持的草图平面」。后者 28 个 PS **完全没有 `sketches.json`**
    （`sketchMatrix` 不可得）；其中有 94 个 `newSketch` 的 `sketchPlane` 引用
    cPlane 特征，而这些 cPlane 的 `PLANE_POINT` 参数是 FACES/VERTEX 查询，
    无法离线静态求 frame。→ 属**数据缺口/草图外参能力**，不是 converter 逻辑
    可修；改抛错为 blocked 也不会解锁几何。
  - 19 个单 blocker 分解：8 import/derived（excluded-import）、4 myFeature 螺纹
    （excluded-custom-feature）、1 deleteFace（blocked-kernel）、1 draft（内核无
    TS 绑定）、1 rib（无内核通道）、1 offsetSurface（无产品契约）、1 fillet
    OFFSET_EDGE/TWEAK_EDGE（shell 派生边选择器，产品无此类）、1 secondDirection
    UP_TO_SURFACE（采集 `secondDirectionDepth=0` 无表达式，blocked-evidence）、
    2 多源 FEATURE mirror（产品 FeatureMirror 单源；多源需契约扩展）。**无任何一个
    可在当前产品契约内直接转绿**。
  - 结论：converter 覆盖队列到此关闭；后续解锁必须依赖草图外参（ADR-0009 1b）、
    draft/rib 内核通道、多源 mirror/多体 scope 等产品能力，不得用近似冒充。
  - **草图数据缺口（2026-11-07，blocked-evidence）**：28 个 failed PS 完全没有
    `sketches.json`（94 个 newSketch 引用 cPlane，但 cPlane 仅存 FACES/VERTEX
    query，无 matrix 可静态求 frame）。补采需 CDP Chrome :9222 + Onshape 登录态
    跑 `node tools/collect-geometry-meta.mjs --kind sketches --limit N --delay ...`；
    本次会话无 CDP 浏览器（9222 不可达），不伪造 frame，登记待重采。
  - **精确贝塞尔样条转换（2026-11-07，converter 覆盖）**：
    - `BTCurveGeometryInterpolatedSpline` 的 2 插值点 + 两端手柄形态可**数值恒等**
      转为单段三次贝塞尔（startDerivative = 3·(startHandle−P0)，endDerivative =
      3·(P3−endHandle)，语料逐位吻合）；
    - `BTCurveGeometrySpline-118` / `ControlPointSpline-2197` 的单段形态
      （degree3/4 控制点；degree2/3 控制点精确升阶）同样精确转换。
    - 新增 `sketch-geometry.mjs#{onshapeInterpolatedSplineControlPoints,
      onshapeBezierControlPoints}` + 单测 **9/9**（T2 实测值、二次升阶、3+点/
      周期/有理/多段/节点不符 → undefined）。
    - 全量 `batch-convert --force`：failed **53→50**、geometryComplete **16→17**
      （新增 T2 Build a Part）、blocked 75→77。**T2 离线回放 2,444,863.6 vs
      357,568.2 mm³（+584%）**：根因不是样条，而是 3 个 `imprintFace` extrude
      按草图面域近似（queries=1/2/1，实际选中体面），与 Drive Sleeve 同属 task
      #99 face split 缺口；T2 保持 blocked-converter，索引/工作队列未假绿。
      3+ 点/周期/多段/有理样条仍诚实失败（产品 DTO 只承载单段三次）。
    - 回归：批量重生 canonical scenario 后，backend `DriveSleeve/ScenarioReplayParity/
      ScenarioReplayCorpus/CPlane/BooleanBodies/BasicDrawing/Postman` **7 files，
      11 passed + 1 expected fail**（Drive Sleeve known-red 不变）。
  - **孔位 createdBy 草图顶点补全（2026-11-07，converter）**：`qUniqueVertices(
    qCreatedBy(<sketch>, VERTEX))` 旧实现只收显式 point 实体；现按 Onshape 语义
    收**全部隐含顶点**（线/弧端点、弧/圆心、样条端点），按坐标去重、显式 point
    优先、跳过 construction；空集诚实 dropped。Bumper Block 的沉头孔因此从
    “无孔位 status=1”变为 `vertexRefs` 两个线端点。顶点选择逻辑抽为纯函数
    `sketch-vertices.mjs#sketchVertexCandidates` + 单测 **4/4**（显式 point 优先/
    线圆弧样条/construction 跳过/坐标去重/空集），converter 全量 **26/26**；
    Bumper 场景 features 重构前后逐字等价。
  - **能力覆盖轨 Bumper Block（2026-11-07，approximate）**：新增
    `e2e/examples/bumper-block-approx.spec.ts` + runner `volumePolicy:'record'` /
    `allowApproximateDraft`（仅此轨；严格轨 translator 仍拔模阻塞）。真栈整链
    **2 passed**：树 6 特征/status 全 0/单 body/push+重开；实际
    **346,770.496 vs 采集 636,731.499 mm³（−45.54%）**。偏差来自 10° 拔模直壁
    近似 + A1 整面 faceExtrude 的选面/方向近似，**不冒充严格复刻**，不计入
    `replicable-now`；仅作能力链覆盖证据（孔位/面拉伸/圆角/重开）。
    - 回归：批量重生后 backend 7 套场景回放仍 **11 passed + 1 expected fail**
      （Drive Sleeve known-red 不变）；13 个真栈绿例中仅 Handle / Top-Ring-Key
      含 hole，均为 `pointIds`（不受 createdBy 顶点补全影响），无回归。
  - **索引能力表刷新 + 内核阻塞登记（2026-11-07）**：`index-examples.mjs`
    的 `converterFeatureTypes` 补 `shell/transform/circularPattern/linearPattern`
    （与 converter 现状一致），新增 `KNOWN_KERNEL_BLOCKERS`（doc/PS → 证据）与
    `blocked-kernel` 分类；`verify-example-index.mjs` 白名单同步。
    `build-work-queue.mjs` 同步识别 `kernel` blocker（否则 Gaiter 会被排进
    `geometry-ready`/dropped-constraints 候选）并在 work-queue 计数中单列。
    **2026-11-07 追加**：`productFeatureTypes` 补已实现的后端 FeatureType
    `transform/splitPart/moveFace`（产品真相；UI/converter 缺口仍由各自 blocker 表达）。
    刷新后 227 个有 features 的 PS：`replicable-now` 仍 **2**、`blocked-kernel`
    **1**（Gaiter Fillet 1 八整圆边零体积，证据 shell-face.spec.ts fixme +
    ADR-0008 T11b）、blocked-converter **29**、blocked-capability **21**、
    blocked-evidence 1294、excluded 105；`verify-example-index`
    **ok（0 errors / 5 warnings）**；work-queue `geometry-ready` 13 不含 Gaiter。
    **2026-11-07 追加**：`uiFeatureTypes` 补 `shell`（T3 ShellDialog 已落但索引
    仍报 `ui-feature:shell` 的 22 个假 blocker）；重建后该 blocker 消失，分类计数
    不变（这些 PS 仍有其它真实 blocker），coverge 报告无假绿。
    4 个 PS（Cylinder parts ×2、Hydraulic Components ×2）由 blocked-capability
    精确降为 blocked-converter（splitPart/transform converter 未映射），无假绿。

### P2 — 示例批次

- [x] **全栈验收（2026-11-08，预览扩展后）**：`scripts/verify-stack.ps1`
  **16/17**（health×5、iTwin/iModel/baseline 数据链、WS cookie 握手、MS dev-build
  横幅、hub 镜像/挂载全 OK；唯一 WARN = web 镜像 revision 与源提交不一致——
  源已变更且按规则未发布/未重建镜像，非代码失败）。后端受影响套件
  FeatureService/Fillet/Chamfer/Shell/MoveFace/FeaturePattern/Hole 全绿；web
  vitest **1465/1465**；e2e 预览验收 shell/moveFace/chamfer/hole/featurePattern
  共 11 passed。**无未阻塞的剩余计划项**：后续候选均登记为 blocked-design
  （实体边投影/splitPart 双侧/多 body scope/镜像特征选择 UI）、blocked-kernel
  （Gaiter fillet 零体积）、blocked-evidence（up-to 目标查询/转换器缺口）或需
  release owner 发布；新采集 tranche 需用户裁决配额（剩余≈19 vs `--reserve 20`）。
  **2026-11-08 追加**：extrude draft 已从 blocked 转已实现（shared 1.51.0，真栈
  1394.109/1185.18 mm³；方向符号待 live 校准，回放标 approximate）；converter
  补 THIN/SURFACE bodyType 守卫（40+4 特征不再静默按实体近似）；Bumper Block
  端盖映射试验因 Fillet 12 边内核 blend 失败已回退，仍 record；thin-wall/upTo*
  与上述其余候选仍阻塞。后端全量复跑 **836 passed / 1 expected fail / 8 skipped**
  （97 files；首跑一次 worker 意外退出，同命令复跑全绿，属原生瞬时抖动已记录）。
  **2026-11-08 终验快照**：web 全量 **1480/1480**、lint/tsc 绿；
  `verify-stack` 再次 **16/17**（唯一 WARN 仍为 web 镜像未重建）；UI-only
  补采 9 文档后 `verify-example-index` 0 errors/5 warnings；draft 真栈
  预览叠层 2 passed。剩余配额 reserve 2，未再消耗。
  **2026-11-08 registry 重开收口**：`verify-registry.spec.ts` 已改为**每文档一条
  test（失败隔离）**，默认集合扩到全部 registry 文档——**13 文档 / 14 tests 全绿
  （14.6 min）**，含 document 级 Element Organization 两个 scope（O-Ring
  454.926、Bushing 3259.684 mm³）；legacy-only 子集 12/12（4.7 min），早期串行
  run（11.4 min）同样 12/12。读回值：Tutorial 2
  357,715.800、Basic Drawing 2,446,312.457、iOS 157,478.900、Hand Brake
  7,125.270、Sample Assignment 8,915.860（9 特征含 chamfer）、Postman
  2,670.484、四个 WARNING LABEL 0.8193532×4、Mate Connectors
  21,900.405（2 body）、Intro to CAD 85,157.341 mm³；树/status/body 数/
  体积/push 重开全通过。过程中的两项真实修正：
  - **90s canvas gate 不够（性能证据）**：临时 trace 计时显示阻塞点是
    `iModel.views.load(savedView)`——Tutorial 2 3.4s，Basic Drawing 在 MS
    繁忙时 **53–160s**；category/model ECSQL 与 models.load 均 <100ms。
    `helpers.EditorReadyOptions.canvasTimeoutMs` 允许套件显式放大到 **240s**
    （缺省仍 90s，其它 spec 不受影响），verifier 总预算扩到 65min；断言不变。
    慢链仍会如实超时，不是放宽数据容差。
  - **Sample Assignment legacy 库漂移已修复**：registry 的原库是缺 chamfer 的
    8 特征旧 UI 构建；legacy UI builder（自 2026-11-06 起非绿门）reset 重建在
    第二刀卡死。改用已审计 RPC scenario builder 定向重建同名库
    （`SAMPLE_ASSIGNMENT_IMODEL_NAME=Sample Assignment` env 覆盖，不新增第二套
    builder），得到 9 特征/8915.860 mm³，随后 registry 重开绿。代价/残留：
    manifest 已由 scenario builder 同名重建时自动重写（新 imodelId/changesets/
    9 特征/实际体积；14 张旧 UI 截图保留并标 `screenshotsProvenance`）；gallery
    已重生成（10 manifests / 13 state docs，sample 卡片指向新 id）。库本身由
    RPC 场景构建，截图仍是旧 UI 构建过程。
  - **demo manifest 一致性审计（2026-11-08）**：10 个 manifest 的 `imodelId` 与
    state **0 mismatches**；`intro-to-cad`（de911416→bb8efb7b）与
    `tutorial-2-ios`（f49b33ab→699b9604）已按 state 重映射并更新
    openPath/changesets，保留 `previousImodelId` 追溯；gallery 再生成。
    `gallery.mjs` 已加 manifest/state iModelId 一致性门：不一致打印明细并
    以 exit 1 结束（当前 0 mismatches），防止画廊链接再次静默指向已删除库。
  - **旧门禁已重写（2026-11-08）**：`verify-imodels.spec.ts` 原硬编码 canonical
    id（Sample f52752cb、iOS f49b33ab）在当前 hub 已不存在。已改为**只读
    `demo-artifacts/examples/state.json`** 的运行态验证：每个 document 一条
    test（失败按文档隔离）、逐 scope 对拍树/status/active body 数/体积（默认
    0.5% 容差）；state 缺失/为空 fail closed；支持 `EXAMPLE_DOCS` 子集。
    真栈 **14/14 passed（14.8 min）**，不再硬编码 UUID，旧 id 失效问题关闭。
    与 verify-registry 分工：registry 验静态“要建什么”，本 spec 验运行态
    “实际建成什么”。
  - **2026-11-08 复验快照**：web **1480/1480**、shared **170/170**、verify-stack
    **16/17**（同 web 镜像 WARN）；state 驱动 verify-imodels **14/14（14.8 min）**；
    Sample demo manifest 由 scenario builder 同名重建时自动重写、gallery 重生成
    （10 manifests / 13 state docs，卡片指向新 id 4745195f）。
- [ ] **B1**：47 个特征层 clean PS；优先 16 个 sketch-clean + per-part 可测；每个 complete 或 blocked。
  - **首批 13 场景真栈结果（2026-11-07）**：批次原始 **11 pass / 2 fail**，
    收口后 **#11 Alignment Plate 修复转绿（有效 12/13）**；报告见私有仓
    `reports/geo-ready-20261107/report.md`。pass 覆盖轮/主缸/切除/iOS/Handle/
    Top-Ring-Key/四个 WARNING LABEL/Alignment Plate（逐 body 体积
    ≤0.001%–0.05% + push 重开）。唯一剩余 fail = Links（多 body scope，
    +1.56% known-red）。**clockwise 圆弧修复**使 Links 树/status 转绿、
    **converter imprint 根修复**使 Alignment Plate 体积转绿（8,915.860 vs
    8,915.860）。失败均有独立 blocker，不是容差问题。
  - [x] **WARNING LABEL 专用回归 + equal arc/arc（2026-11-08）**：B1 批次中的
    WARNING LABEL（4 个同名 PS）原先只在批次报告里出现；单独真栈重跑首跑被
    `SketchWireNormalizer: equal 不支持 arc+arc` 拒收。放开 equal 为
    line+line（等长）或 circle/arc 任意两半径实体（SolverTypes/Normalizer；
    SlvsSolver 已有 EQUAL_RADIUS 分支），`SolverTypes.test` **45/45**；新增
    `e2e/examples/replay/warning-label-scenario.spec.ts` **2 passed（50.5 s）**
    ——5 特征/1 body **0.8193532 mm³**、逐 body 对拍、push+冷重开一致。
    decal/mateConnector 仍为非几何 dropped，不冒充。其它 PROJECTED/MIRROR/
    SILHOUETTED/PIERCE 等约束仍 blocked。
- [ ] **B2**：21 个单 blocker；按 T2–T7 解锁分组。
- [ ] **B3**：10 个双 blocker。
- [ ] **B4**：其余 113 native eligible。
- [ ] **B5**：多 PS 大文档（最大 39 PS）与多 body 极端（146 body）。
- [ ] **B6**：新采集 tranche 追平；最终 coverage 报告。

### P3 — 几何族与长尾

- [ ] **G1** ellipse/elliptical arc/conic/N-span spline/text/image + 草图编辑工具族。
  - **面域并集（task #37）blocked-design（2026-11-05 已有原型结论，2026-11-07 登记）**：
    Mate Connectors 排列面并集 + 去完整圆 strict-inside 孔可精确得 5930.58 mm²，但
    Quickstart Spindle（27816 vs 22162）/ Handle（4673 vs 8215）证明 Onshape region 0
    不是“全部闭环并集”；通用 union 不足，需更完整面域引擎或逐例 profile 映射，
    不启动后端改动。
- [ ] **G2** 约束补全（CENTERLINE_DIMENSION/NORMAL/QUADRANT/MAJOR/MINOR/RHO/EQUAL_CURVATURE）。
- [ ] **G3** 长尾特征（externalThread/helix/bridgingCurve/projectCurves/trimCurve/compositePart/wrap/multiMirror）。
- [ ] **G4** sheet metal/custom/import triage；只登记/独立立项，不混入 native 绿门。

## 每任务 Definition of Done

1. 代码 + shared/backend 契约（如适用）同批；旧库 fixture/回滚说明。
2. 单测 + 真栈 e2e；多 body 逐 body 对拍；重开验证。
3. registry/state/docs/覆盖率同步；blocked/known-red 如实登记。
4. 不 commit/push，除非用户明确要求。

## 当前执行指针

- 已完成：**T1 Sample Assignment**、**T2 Edge selector resolver（含 iOS/Sample
  真实验收）**、**T3 Shell UI**、**T4 secondDirection + imprintFace 面域解析切片
  + revolve 多面域（Hand Brake 真绿）**、**T4b Handle 真实示例全链
  （PLANE_POINT + 多体 mergeScope + 孔方向 + secondDirection 反侧修正）**、
  **T4c hole countersink（shared 1.32，真栈 261.794 vs 261.799 mm³）**、
  **T6 单点 H/V + CENTERLINE_DIMENSION + CONCENTRIC 映射、assignVariable 静态求值**
  （后两者为 converter-only，产品变量表/UI 未完成）、**T5 mirror 世界平面切片**
  （均真栈或解析级绿；T3 用官方帮助页证据）。
- 正在执行（2026-11-07 增量）：**booleanBodies intersect 真栈绿**（T12，1.000 mm³，
  push+重开）；**草图→草图投影切片 1a 已落**（T6a，shared 1.35.0：后端 4/4、真栈
  2 passed 2000→3000 mm³、shared 162、web 1390）；**transform 切片 1 已落**
  （shared 1.36/1.38：后端 `TransformFlow` 8/8、真栈旋转/副本 2000 mm³ +
  均匀缩放 8000/125 mm³ push+重开）；**splitPart 单侧世界平面已落**（shared 1.39.0：后端
  SplitPartFlow 6/6、真栈 2000 mm³ 正/负侧 push+重开）；**mirror 任意世界平面切片已落**（shared 1.37.0：后端 MirrorFlow
  10/10、真栈 2 passed 16 mm³ 对角/偏置 push+重开）；**cPlane LINE_ANGLE 切片已落**
  （shared 1.40.0/ADR-0013：后端 schema 校验、前端 Rodrigues 派生、真栈 45° 平面拉伸
  4000 mm³ push+重开）；**mirror faceRef 面镜像已落**（shared 1.41.0/ADR-0011 切片 2：
  面平面解析、真栈顶面镜像 8000 mm³ 质心 (10,10,10) push+重开）；**moveFace 面偏移
  已落**（shared 1.42.0/ADR-0014：内核 OffsetFaces，真栈顶面 +5 6000 → −2 3200 mm³
  push+重开；deleteFace/replaceFace 登记 blocked-kernel；后端全量 797 passed/8 skipped、
  shared 168、web 1420（W1.2b 审计 + LINE_POINT/THREE_POINT；backend 799/8））；
  **cPlane LINE_POINT 已落**（shared 1.43：过线点平面，真栈 4000 mm³ push+重开）；
  **cPlane THREE_POINT 已落**（shared 1.44：三点平面，真栈 4000 mm³ push+重开）；
  **transform 非均匀缩放已落**（shared 1.45：scaleAxes，真栈 4000/32000 mm³ push+重开）；
  **moveFace 逐面距离已落**（shared 1.46：distancesMm，真栈 6600/3040 mm³ push+重开）；
  **mirror operation 已落**（shared 1.48：unite/subtract/intersect，真栈镜像相交
  2000.000 mm³ + UI 页签；converter operation 映射/`newBodyApproximation` 同批，
  translator 33/33）；**SWEPT_EDGE 圆+相邻实体消歧已落**（converter 明文 UUID
  context + 双端圆候选点；单测 6/6、9/9、14/14；Hydraulic Fillet 1 真栈通过，
  该 PS 仍因 revolve regionRisk/超时 known-red）；**live UI 采集 + moveFace UI 已落**
  （Playwright connectOverCDP 采集四对话框；MoveFaceDialog 真栈 6000.000 mm³
  push+重开、单测 7/7、web 1443/1443，能力翻 full）；**featurePattern centered 已落**
  （shared 1.49 / ADR-0007 切片 6：官方帮助页 2N−1 语义，后端 7/7、真栈 16400.000 mm³
  质心 x=0 push+重开；converter 映射 2N−1，语料 centered 源均被其它缺口阻塞）；
  **body pattern 居中 UI 已落**（ADR-0007 切片 7：FeatureDialog「居中」启用，
  `count=2N−1` 换算/圆周复位/编辑回显，单测 148/148、真栈 400.000 mm³ 质心
  (2,2,2.5) push+重开）；**featurePattern 编辑 UI 已落**（ADR-0007 切片 8：
  树行双击、源/轴只读、count 3→4 **16320.000 mm³**，居中开关每侧 3→
  **16400.000 mm³** push+重开，单测 8/8；**改参预览已补**——后端影子求值
  回传 PreviewResult.preview、UI TileRpc 动态图形，真栈 `data-dynamic=1`，
  后端 FeaturePatternFlow 8/8）；**shell/moveFace/chamfer/hole 改参预览已补**
  （后端 ShellFlow/MoveFaceFlow/ChamferFlow 各 10/10、HoleFlow 7/7；真栈四对话框
  `data-dynamic=1`，1084/6000/157478.9/196.349 mm³ 语义不变；FeatureDialog 149/149、
  HoleDialog 8/8）；**hole 钻尖角 + 方向已落**（shared 1.50.0 / ADR-0006 切片 A5：
  盲孔 118° 锥高 h=r/tan(angle/2)，缺省 118、编辑旧库 180；反向下拉
  `direction=backward`；后端 HoleFlow 8/8、HoleDialog 10/10、translator 36/36、
  真栈去材 **88.371 vs 88.371 mm³** + 反向零去材）；**loft/sweep 插入预览已补**
  （后端 LoftFlow/SweepFlow 各 10/10；真栈 4 草图 → 放样/扫掠预览+提交
  **2427.581 mm³** push+重开；FeatureDialog 151/151）；**mirror/pattern 插入预览
  已补**（后端两文件共 36 passed；真栈镜像相交 2000 mm³、居中阵列 400 mm³ 均
  `data-dynamic=1`；FeatureDialog 153/153）；**booleanBodies 插入预览已补**
  （`evaluateBooleanBodiesPreview` 计划源直读；后端 BooleanBodiesFlow 37/37；
  真栈相交 **1.000 mm³** `data-dynamic=1`；FeatureDialog 154/154）；
  **mirror/pattern 改参预览已补**（updateParams 白名单扩两类；后端两文件
  38 passed；单测 FeatureDialog 156/156；真栈双击树行编辑 `data-dynamic=1`、
  取消后 400/2000 mm³ 不变）；**extrude 拔模已落**（shared 1.51.0 / ADR-0005
  Phase 4：draftAngleDeg+draftPullDirection，偏置环 Loft；后端 ExtrudeDraftFlow
  4/4、ScenarioReplayParity 4/4；FeatureDialog 拔模复选/角度/反向，160/160；
  真栈 10°→**1394.109**、编辑 5°→**1185.18** mm³ push+重开；converter 解除阻塞，
  方向符号未校准故回放标 approximate）；
  **featurePattern 树行抑制/删除通道已验收**（ADR-0007 切片 9：真栈 3 passed，
  抑制 16240→**16080**→取消抑制→16240，删除树行 + push/重开树形一致；
  `deleteFeature` 不触发 body 再生 = M1 已登记缺口，known-red 钉 16080；
  `BODY_PRODUCING_FEATURE_TYPES` 补 6 类体修改特征，单测 3/3）；
  **零件段逐 body 体积已落**（W1.5b：`useBodyMassProperties` + TreeRow 体积文案，
  真栈两体 **500.000/4000.000 mm³** push+重开，单测 5）；
  **第二方向 UP_TO_SURFACE 静态近似已落**（ADR-0003：converter solvedDepth→blind
  +approximate，translator 35/35、合成真栈 6000 mm³；Stirrup 仍 known-red——
  根因已定位为 **imprint −1 补集面未实现**（多不相交闭环选相邻矩形区域，
  Extrude 2 仅去材 500.171 mm³，见 ADR-0006「Stirrup imprint 补集面」）；**revolve 轮廓实体→真实面域（test-only）已落**
  （ADR-0003：`profileEntityIds` + SketchRegion 边界映射 + 多体边源限定，
  单测 6/6；Handle Parts 前置 10 特征真栈 3 体 12326.161/32140.878/106103.005
  mm³，Fillet 1 跨 3 body → ADR-0015 blocked，`test.fail` known-red）；
  **converter 全量重跑（2026-11-08）**：`batch-convert --force` 164 场景
  （complete 1 / geometry 17 / smoke 6 / blocked 77 / failed 50 / skipped 48），
  example-index/work-queue 重建；绿门场景 diff 仅 capturedAt（行为不变）。
  **同日再跑（draft 映射 + THIN/SURFACE 守卫后）**：complete 1 / geometry **18** /
  smoke **7** / blocked **75** / failed 50 / skipped 48（draft 件从 blocked 移出；
  薄壁/曲面件按预期进入 blocked）；`verify-example-index` 0 errors/5 warnings，
  work-queue 分类计数不变（geometry-ready 15、blocked-feature 35、kernel 3）。
  **调度表修正**：pattern 族（linearPattern/circularPattern）加入产品/UI 能力表
  （产品已由 featurePattern/body pattern 承载，旧表重复记假缺口）；
  Handle Parts 跨 3 body Fillet 1、Stirrup 上游体分叉加入 known blocker（真栈证据），
  `replicable-now` **2**、`blocked-kernel` **3**（Gaiter/Handle Parts/Stirrup）；
  单缺口头收敛为 Universal Joint×4、Hydraulic Components、Rear Shock、
  Front Fork（loft）；
  **FACE pattern→featurePattern 映射已落**
  （test-only：validator 12/12、translator 24/24、合成真栈 14303.541 mm³ push+重开；
  真实 PS 被 imprintFace 上游偏差阻塞并登记）。
  **up-to 终止条件静态回放近似已落**（test-only，114 特征全有 solvedDepth；
  translator 22/22；全库无 geometry-complete 场景含 main up-to——真实验收被
  sheet-metal/hole 数据缺口阻塞，已登记）。
  **MIRROR 约束 + Wheel 真栈已落（2026-11-09）**：shared **1.57.0**
  `SketchConstraintDto.kind + "mirror"`（端点对/整线关于轴线镜像）；后端
  `SolverTypes`/`SketchWireNormalizer`/`SlvsSolver`（SLVS_C_SYMMETRIC_LINE +
  初值镜像检查 + 整线端点对展开）、converter 端点对 + 整线映射；Exercise: Basic Drawing /
  Wheel 真栈 **2 passed（58.7 s）**，1 body **2442291.05 vs 2442293.76 mm³**
  （1.1e-6 相对）push+冷重开。同批修复 converter **CENTERLINE_DIMENSION 直径语义**
  （值/2）与 `getMassProperties` 细分容差（1e-6/0.002 → **1e-4/0.02**；Wheel
  156 s→**2 s**，体积误差 1.1e-6）；batch 重转 164 场景 → complete **4** /
  geometry **15** / smoke 7 / blocked 75 / failed 50 / skipped 48。
  新增 complete 的 **Drive Sleeve×2** 来自 converter MIRROR 端点源配对修复
  （参数 id 是 local0/1/2，旧逻辑找 localFirst/localSecond 导致误报整实体无端点对）
  与 CONCENTRIC(center, origin) → coincident(center, origin)；其几何仍是
  imprintFace 超差 known-red，不冒充示例绿。**UP_TO_ENTITY 孔静态深度映射**
  （holeDepthComputed → blind + endApprox，translator 42/42）为近似回放，
  真实 PS 均被其它缺口阻塞，计数不变。
  **标准 OFFSET 约束映射（2026-11-09）**：4-ref 标准偏移工具按几何反推偏移距
  （line-line 垂距 / arc-arc 半径差均值）；SLOT 2-ref 不冒充。First Part 重转后
  OFFSET 已入树，剩余唯一 drop 为样条 `.internal` 内部拟合点（blocked-capability）。
  **样条 `.internal` 端点映射 + First Part 转绿门（2026-11-09）**：converter 识别
  2 点样条 `.0.internal`/`.1.internal` = start/end；First Part 48 约束全入树、
  status=complete。真栈 `first-part-scenario.spec.ts` 登记 **known-red**：
  352290.918 vs 357568.177 mm³（−1.476%），`skipSketchConstraints` 同体积。
  **根因复核（2026-11-09）**：Revolve 前缀=expected−4,855.216；Fillet 1 本仓只去材
  422.043，Onshape `tangentPropagation=true`；终态表面面积 50,146.44 vs 采集
  49,180.44 mm²（+1.96%）——优先归 fillet 边集/相切传播，E2 vertex 消歧为次因候选；
  需 Onshape 前缀体积证据，不得调容差转绿。batch → complete **7** / geometry **12**。
  **WARNING LABEL 文档族真栈（2026-11-09，B1）**：Bench Vise + Onshape EDU/
  Professional/Quickstart 四个文档同名 PS 均走 scenario-file 全链，逐 body
  **0.8193532 mm³**、push+冷重开；`warning-label-variants.spec.ts` 三变体
  **3 passed（1.4 min）**（首轮两条因 MS 100/15min 限流/编辑器冷开失败，
  干净窗口重跑全绿；非产品回归）。
  **MIDPOINT/DISTANCE 外部原点映射（2026-11-09）**：空 external query 按 origin
  映射；Rear Shock Sketch 3/8/10 减少、Sketch 9 线端点语义不成立继续 blocked；
  Bumper Block / Handle Parts 转 converter complete（几何仍分别 blocked-kernel：
  fillet 12-edge / 跨 body fillet）。batch → complete **7** / geometry **12**。
  **Sketch Mirror UI 已落（2026-11-09）**：官方帮助证据两相流程；`Sketch.Mirror`
  真 toolId 接线（ribbon 占位退役），线/点/整圆即时镜像 + mirror 约束
  （circle=圆心对称 + equal 等半径）；真栈 `sketch-mirror-tool.spec.ts`
  **2 passed（1.1 min）** 含线+圆 reload 重开，web **1503/1503**。
  arc/spline、预选流程、面/边镜像线仍待后续。
  **featureMirror 多源（2026-11-09，shared 1.58.0）**：`FeatureMirrorParams.sourceFeatureIds`
  与单源恰一；后端逐源差集反射应用源操作，converter 不再丢多源 FEATURE mirror
  （164 场景计数不变；1 个 Jackhammer 场景携带多源但仍被上游缺口阻塞），translator
  44/44；backend `FeatureMirrorFlow` 5/5、真栈 `feature-mirror.spec.ts` **3 passed**
  （两孔一次镜像 14869.064 vs 14869.027 mm³，push+冷重开）；UI 多源选择未做。
  **Sketch.Point 草图点工具（2026-11-09）**：ribbon 占位 `sketchPoint` 退役，
  AccuSnap→平面局部坐标→`applyUpdate` 连续放点；自动推断点端点 coincident /
  点在线 / 点在整圆 coincident；真栈 `sketch-point-tool.spec.ts` **2 passed（52.9 s）**
  （先画线→点在线内/端点→2 point+2 coincident+finish+reload），
  `sketch-point-hole.spec.ts` **2 passed（47.6 s）**（点→孔位 throughAll 去材
  196.339 vs 196.350 mm³），web **1509/1509**。
  **Sketch.CenterRectangle 中心矩形（2026-11-09）**：复用拐角矩形轴对齐草稿
  （中心反射对角点），飞菜单占位退役；真栈 `sketch-center-rectangle.spec.ts`
  **2 passed（46.1 s）**（4 线+中心点、20×10、finish+reload），web **1503/1503**。
  **Sketch.AlignedRectangle 对齐矩形（2026-11-09）**：三点（边角度/长度 + 垂直高度），
  flyout 占位退役；真栈 `sketch-aligned-rectangle.spec.ts` **2 passed（47.6 s）**
  （4 线、10×5、无 point、finish+reload），web **1503/1503**。
  **Sketch.CenterArc 中心点圆弧（2026-11-09）**：圆心→起点→终点，flyout 占位退役；
  真栈 `sketch-center-arc.spec.ts` **2 passed（47.9 s）**（r≈10、sweep≈π/2、
  finish+reload），web **1509/1509**。
  **Sketch.Bezier 贝塞尔曲线（2026-11-09）**：4 控制点 → 既有 spline DTO，
  flyout 占位退役；真栈 `sketch-bezier.spec.ts` **2 passed（49.1 s）**
  （4 controlPoints/2 fitPoints/2 coincident、finish+reload），web **1509/1509**。
  **Sketch.TangentArc 相切圆弧（2026-11-09）**：线端点+终点反解切圆，arc +
  coincident + tangent；真栈 `sketch-tangent-arc.spec.ts` **2 passed（52.8 s）**，
  web **1509/1509**。
  **featurePattern 多源（2026-11-09，shared 1.59.0）**：`sourceFeatureIds` 与单源
  恰一；后端逐源差集变换、converter 不再丢多源 FEATURE pattern（语料无同时满足
  全部源校验的场景），translator 46/46；backend `FeaturePatternFlow` 9/9、真栈
  `feature-pattern.spec.ts` **3 passed**（两凸台一次线性阵列 16480.000 mm³，
  push+冷重开）；UI 多源选择未做。**回归（2026-11-09）**：shared 1.58 / backend 866 passed / MS 重启后，
  `e2e/examples/verify-imodels.spec.ts`（state 驱动）**14/14 passed（2.5 min）**，
  13 个示例 iModel 的树/body/体积读回不变。
  **converter 覆盖队列已复查关闭**
  （53 failed / 19 单 blocker 全量归因，见 P2 B1 下「converter 失败/单 blocker
  复查」：无可直接转绿项）。**transform/splitPart UI 证据已复核为 blocked-evidence**
  （ADR-0010/0012：Onshape `线或点` 拾取器与工具图元/双侧多体输出缺失；不以
  X/Y/Z 轴输入或世界平面下拉“差不多”替代）。剩余队列 **实体边/面投影
  （ADR-0009 切片 1b，blocked-design）→ splitPart 双侧/rib（blocked-design/
  blocked-capability）→ draft native spike（已结论：无 TS/napi 绑定）**；
  face ops：moveFace 已落，deleteFace/replaceFace blocked-kernel。
  T6 只做有 solver/契约支撑的约束/PIERCE 等需先扩 ADR；不得用 skip constraints
  宣称约束树完整。published artifact 仍 1.34/1.32（未发布 1.35–1.57）。
- **并行轨道（2026-11-06）**：`2026-11-06-capability-coverage-examples.md`。
  公开示例副本→UI 取证→近似重建；Handle 已用采集源数据完成真栈精确重建
  （见 T4b）。Bumper Block 的 `extrude draft 10°` 是下一首个缺口。
- **Ruling（revolve 多面域映射）**：converter 是边查询无法静态反推面域，只给前缀 +
  regionRisk；真实示例用 spec 审计选择。代价：其它多 query revolve PS 仍需逐个审计，
  不会自动全绿。
- **Ruling（T3 证据口径）**：live Onshape 登录态不可得，但官方帮助页（公开可访问）
  给出了 Shell 字段顺序/语义；按“有证据才做控件”，用该证据实现并截图存档，
  Hollow（产品契约未支持）不渲染假控件。代价：像素级 live 对照仍缺，后续有
  登录态时补。
- **Ruling（imprintFace 口径）**：converter 实体标注 + runner 面域近似只进
  test-only 回放，不冒充产品 face split；iOS 体积因此可绿，但 iOS 的
  `geometry=approximate` 仍如实登记，`overall` 不因体积对上而升 complete。
- **Ruling（secondDirection 反侧）**：Onshape `secondDirectionOppositeDirection=true`
  按**反侧**消费（产品契约缺省）；Handle 130 mm grip 与采集体积证明旧“同侧”映射
  错误。代价：19 个含 secondDirection 的场景需在各自验收时重跑，不能沿用旧体积。
- **Ruling（孔/切除方向）**：孔方向用**目标 body 质心相对草图法线**判定
  （质心在负侧 → backward）；remove extrude 仍按 converter/Onshape 方向参数，
  解析不到 body 即阻塞。代价：质心在法线方向的投影极小时（薄板/对称面）可能
  不唯一，需示例级审计。
- **Ruling（body 谱系）**：产品 getBodies 只暴露最近 sourceFeatureId，后续
  fillet/hole 会覆盖造体特征；runner 沿场景特征顺序回溯到最近造体特征并跨步
  保留 bodyKey 别名。代价：同一 body 被多次 boolean 重组时需继续验证谱系，
  alias 只对 active body 生效。
- **Ruling（up-to 回放口径）**：产品 up-to 未实现，但 scenario 已保存 Onshape 解算
  深度；静态回放用 blind+solvedDepth 复现**该采集状态**，必须 `approximate=true` 并在
  note 明示“目标查询未采集/产品未实现”。这不是产品 up-to 能力；参数改动后的联动语义
  不成立；不得把 approximate 步记入 `geometry=complete`。真实探针若因其他 blocker
  超差，记录根因而非调松容差。
- **Ruling（草图外部引用切片顺序）**：ADR-0009 原首切片是“实体边投影”，但它需要
  异步 BRep 拓扑读取 + 重投影写库/脏传播的完整设计；先落**草图→草图投影**（切片 1a）：
  同源 params、全同步、读时派生、可立即验证参数联动，覆盖 Onshape Use/Project 的草图源
  子集。实体边投影（1b）与 PIERCE 等留待下一片。代价：PROJECTED 约束若源为实体边仍
  不可回放，converter 继续如实 dropped，不冒充覆盖。

## 执行记录（2026-11-09 收口快照）

- **契约/后端**：shared **1.58.0** `FeatureMirrorParams.sourceFeatureIds` 多源特征镜像、
  **1.59.0** `FeaturePatternParams.sourceFeatureIds` 多源特征阵列；后端逐源差集
  反射/阵列；共享 170、后端全量 **874 passed / 1 expected fail / 8 skipped**（101 files，弧镜像后复跑全绿；ExtrudeDraftFlow (d) 并行偶发超时、单跑 4/4）。
- **回放**：converter 多源 FEATURE mirror/pattern 不再 dropped（语料无可直接转绿项）；
  translator **46/46**；真栈 `feature-mirror` **3 passed**（14869.064 mm³）与
  `feature-pattern` **3 passed**（16480.000 mm³），均 push+冷重开。
- **草图 UI**：`Sketch.Point`（端点/点在线/整圆自动 coincident + 孔位集成）、
  `Sketch.CenterRectangle`、`Sketch.AlignedRectangle`、`Sketch.CenterArc`、
  `Sketch.Bezier`、`Sketch.TangentArc`；各自真栈 2 passed（47–53 s），web **1509/1509**。
- **回归**：`verify-imodels`（state 驱动）**14/14 passed（2.5 min）**，13 个示例 iModel
  树/body/体积读回不变；lint/tsc/e2e tsc 绿。
- **仍阻塞（不调容差/不伪造）**：First Part fillet 相切传播/面选择差
  （−4855.216 mm³ 缺口，需 Onshape 前缀体积证据）；Stirrup imprint 补集面、
  Drive Sleeve imprint 子面、UJ 上游体分叉、Handle Parts 跨体圆角；
  splitPart 双侧/多输出（ADR-0015 blocked-design）；草图实体边/面投影
  （ADR-0009 切片 1b blocked-design）；rib/draft/deleteFace/replaceFace 内核缺口；
  moveFace/loft/sweep 的 converter 映射与真实 PS 仍待。
- 未 commit/push/publish；`dist-backend` published artifact 仍 1.34/1.32。

## 裁决（2026-11-09，extrude SURFACE / 双厚度薄壁）

- **SURFACE bodyType**：全语料 109 个 features.json 中 **59 个特征 / 13 个 PS** 使用；
  产品为实体 BRep 单链（无开放曲面体表示/显示/选择/质量语义）→ **blocked-kernel**，
  converter 继续显式 dropped，不按 SOLID 近似。
- **双厚度薄壁**：`thickness2` 非零特征 **0**（33 文件出现该参数但均为 0）→ 零语料
  收益，暂缓；不以无证据的 live 对话框猜实现。

## 执行记录（2026-11-09，extrude upToVertex 切片）

- **契约**：shared **1.60.0** `ExtrudeParams.endVertexRef`（`ExtrudeVertexRef`
  `{sketchId, entityId, part}`）；仅 `endBound="upToVertex"` 合法，须带拉伸
  `sketchId`，与 symmetric/draft/THIN/secondDirection/endFaceRef/endOffsetMm
  互斥；`endBound` 文档同步声明 upToNext/upToVertex 已支持。
- **后端**：`FeatureEngine.upToVertexDistance` 读目标草图顶点（复用
  `sketchVertexPositionsFrom` 语义），经草图平面架变换到世界后沿拉伸方向投影，
  减 `startOffsetMm` 得深度；失效草图/实体/非正深度诚实 status=1。
  `FeatureTypeRegistry` schema/refine/formFields 已接。
- **验证**：后端 `UpToVertexFlow` **6/6**（板 2000 → 深度 3 remove
  **1700 mm³**；冷重建 1700；坏引用/零深度 status=1；schema 9 组拒收）；
  真栈 `e2e/extrude-up-to-vertex.spec.ts` **2 passed（39.1 s）**——5 行树全
  status=0、**1700.000 mm³**、push+冷重开一致；shared **170/170**。
  （2026-11-09 04:16 首次后端跑测暴露 `Point3d.minus` 返回 Point3d 无
  `dotProduct`，改为显式 `Vector3d.create` 后转绿。）
- **converter/translator（test-only）**：converter 把 `endBoundEntityVertex` 的单条
  SKETCH_ENTITY 顶点查询解析为 `endVertexRef`（CAP_VERTEX/派生/多查询如实 dropped）；
  translator 经 `sketchIdBySource` 直通产品 `endVertexRef`（new/add 均合法，symmetric/
  draft/secondDirection 阻塞），缺引用保留静态深度近似。translator **47/47**；
  batch 重转 164 场景计数不变（7/12/7/75/50/48）；13 个含 UP_TO_VERTEX 的 PS 仍被
  草图平面/imprint/laserJoint 等阻塞，无新增绿例（cf562… 场景 3 个 endVertexRef 为证）。
- **未做**：FeatureDialog「成形到顶点」UI（未采集 live 对话框，不渲染假控件）；
  published artifact 仍 1.34/1.32。

## 执行记录（2026-11-09，Sketch.PerimeterCircle 周边圆）

- **实现**：`SketchPerimeterCircleTool`（三点定圆，复用
  `Arc3d.createCircularStartMiddleEnd`）；提交 1 整圆、不生成圆心点；共线/重合
  判退；实时读数（弦长→半径）；`SKETCH_PLACEHOLDER_IDS` 移除
  `Sketch.PerimeterCircle`。
- **验证**：真栈 `e2e/sketch-perimeter-circle.spec.ts` **2 passed（48.8 s）**——
  三点 (10,0)/(0,10)/(−10,0) → 1 circle（r≈10、center≈(0,0)、无 point），
  finish+reload 重开仍在；`SketchCreateTool` 单测 **14/14**；web **1511/1511**；
  lint/tsc/e2e tsc 绿。
- **未做**：三点定义点的持久拖动引用、尺寸即时输入、自动相切推断。

## 执行记录（2026-11-09，正多边形两变体 + 飞菜单焦点修复）

- **实现**：`sketchInscribedPolygon`（内切多边形，主钮）/`sketchCircumscribedPolygon`
  （外切多边形，飞菜单）；圆心+半径点后键盘输入 3–50 边（默认 6）、Enter/第三次
  点击提交；1 construction 构造圆 + N 线 + coincident/equal/angle(2π/N)；
  `SKETCH_PLACEHOLDER_IDS` 两占位退役；Onshape Help 公开页为证据。
- **回归修复**：`RibbonDropdown` 激活菜单行后不归还箭头焦点；否则工具内 Enter
  触发箭头 click 重开菜单、挡住完成按钮（真栈实测）。
- **验证**：真栈 `e2e/sketch-polygon.spec.ts` **3 passed（1.5 min）**（内切/外切
  各 5 边、finish+reload）；`SketchCreateTool` 16/16、`Ribbon` 16/16；
  web **1513/1513**；lint/tsc/e2e tsc 绿。
- **未做**：构造圆与多边形求解联动、拖拽连续调边数、多边形整体选择/拖动。

## 裁决（2026-11-09，pattern 长尾）

- **curvePattern**：全语料仅 **1 例**（`Curve pattern 3（curvePattern）`），产品
  featurePattern 只有 linear/circular 轴线段语义，无沿曲线阵列契约/内核；不值得
  单开切片，登记为长尾 deferred（converter 继续显式 dropped）。
- **Circular/Linear FEATURE pattern 轴**：剩余阻塞集中在 `SWEPT_FACE`/`HOLE_FACE`
  轴（需从圆柱面/孔面派生世界轴线）与 PART 作用域；转换器未猜轴，保持 blocked。
  这是后续独立 converter 切片（轴派生 + 真实 PS 审计），不在本轮伪造。

## 执行记录（2026-11-09，草图镜像弧支持）

- **回归**：`verify-imodels` **14/14 passed（3.0 min）**（弧镜像后、MS 重启），
  13 个示例 iModel 树/body/体积读回不变。

- **后端**：mirror 约束 refs 扩展 `arc+arc+line`（SolverTypes/Normalizer/SlvsSolver
  三对点 SYMMETRIC_LINE；初值 feasibility 同步）；spline 仍拒收。
- **前端**：`buildMirrorDraft` 反射弧圆心/起/终点，扫角取反；预览绘制镜像弧。
- **验证**：后端 solver/normalizer **97/97**（新 arc mirror 用例）；前端镜像逻辑
  **6/6**；真栈 `sketch-mirror-tool` **2 passed（1.4 min）** 线/圆/弧三类 + reload。
- **未做**：spline 控制点镜像、弧定义点拖动、跨草图镜像。

## 本轮收官快照（2026-11-09）

- **已完成切片**：extrude upToVertex（shared 1.60/后端/真栈/回放映射）、
  Sketch.PerimeterCircle 三点定圆、正多边形两变体（+ RibbonDropdown 焦点修复）、
  Sketch.Mirror 弧镜像（arc+arc+line 求解+工具+真栈）、SURFACE/双厚度/curvePattern
  语料裁决。
- **基线**：shared **170/170**（1.61.0）；backend **876 passed / 1 expected fail /
  8 skipped**（101 files；ExtrudeDraftFlow (d) 并行偶发 5s 超时，单跑 4/4）；
  web **1515/1515**（114 files）；真栈 upToVertex 2、perimeter 2、polygon 3、
  mirror 2、飞菜单回归 4、pattern 第二方向 2、verify-imodels **14/14（5.0 min）**、translator **48/48**。
- **剩余阻塞（不调容差/不伪造）**：First Part fillet 相切传播/面选择；Stirrup
  imprint 补集面、Drive Sleeve imprint 子面；UJ 上游体分叉；Handle Parts 跨体
  圆角；splitPart 双侧/多输出（ADR-0015 blocked-design）；草图实体边/面投影
  （ADR-0009 1b blocked-design）；rib/draft/deleteFace/replaceFace 内核缺口；
  pattern 轴 SWEPT_FACE/HOLE_FACE 与 PART 作用域；spline 镜像；构造圆求解联动；
  upToVertex UI（缺 live 证据）；region union 长尾。
- 未 commit/push/publish；published artifact 仍 1.34/1.32。

## 执行记录（2026-11-09，草图镜像样条支持）

- **后端**：mirror refs 扩展 `spline+spline+line`（四控制点 SYMMETRIC_LINE，
  direct/reversed 初值配对；periodic/非 4 控制点拒收）。
- **前端**：镜像草稿反射 controlPoints/fitPoints；新增镜像专用拾取
  `resolveNearestMirrorSeedId`（三次 Bezier 48 段采样）；预览绘制镜像样条。
- **验证**：后端 solver/normalizer **98/98**、backend 全量 **875 passed / 1 expected
  fail / 8 skipped**；前端镜像逻辑 **8/8**、web **1515/1515**；真栈
  `sketch-mirror-tool` **2 passed（1.7 min）**（线/圆/弧/样条 + reload）；
  `verify-imodels` **14/14 passed（5.0 min，含 429 重试）**。
- **未做**：周期/非三次样条镜像、控制点拖动、跨草图镜像。

## 执行记录（2026-11-09，featurePattern 第二方向网格）

- **契约**：shared **1.61.0** `FeaturePatternParams.secondDirection`
  （count/spacing/centered/axis；仅 linear；总实例 ≤1000）。
- **后端**：schema/refine + `featurePatternTransforms` 二维网格；`FeaturePatternFlow`
  **10/10**（3×2 → 5 变换、体积 9.5）；圆周/超限/零轴/缺 spacing 拒收。
- **回放**：translator 透传（**48/48**）；converter 映射 raw SecondDir 字段
  （directionTwo 不可解析时仍 blocked）；batch 重转计数不变。
- **真栈**：`feature-pattern.spec.ts --grep 第二方向` **2 passed（38.6 s）**——
  凸台 3×2 网格 **16480.000 mm³** push+冷重开；`verify-imodels` **14/14（2.5 min）**。
- **未做**：FeaturePatternDialog 第二方向 UI、skip、圆周第二方向。

## 执行记录（2026-11-09，FeaturePatternDialog 第二方向编辑）

- **证据**：Onshape linear-pattern 采集行 `hasSecondDir`/`isCentered`；仅对已带
  `secondDirection` 的阵列开放编辑（不伪造无轴的新增入口）。
- **UI**：第二方向复选框 + count/spacing/centered（居中输入每侧 N，载荷 2N−1）；
  第二方向轴结构引用只读；取消勾选 = 提交时移除 `secondDirection`（可撤销）；
  切圆周自动取消；两方向总实例 >1000 / 域非法 / 轴退化禁提交。
- **验证**：`FeaturePatternDialog` **11/11**；真栈
  `e2e/feature-pattern-edit-ui.spec.ts` **3 passed（1.4 min）**——3×2 网格
  16480 → 第二方向 2→3 / 间距 8→5 → 3×3 **16720.000 mm³** push+冷重开；
  web **1518/1518**、tsc/e2e tsc/lint 绿。无 shared/backend 变更。
- **未做**：无落库轴时新增第二方向（需方向/轴选择器 live 证据）；skip；
  圆周第二方向。

## 执行记录（2026-11-09，FeaturePatternDialog 多源编辑）

- **证据**：Onshape linear-pattern 采集 `entities`（复数）字段。
- **UI**：多源 `sourceFeatureIds` 只读 chips 回显；源缺失判定兼容单/多源；
  updateParams 按落库形状保形（多源不误发 sourceFeatureId）；count/spacing/
  centered（含第二方向）可编辑；源集合增删不提供（无特征选择器/live 证据）。
- **验证**：`FeaturePatternDialog` **12/12**；真栈
  `e2e/feature-pattern-edit-ui.spec.ts` **4 passed（1.9 min）**——两凸台多源
  3→2 **16320.000 mm³**（3 时 16480）push+冷重开；web **1519/1519**、
  tsc/e2e tsc/lint 绿。首轮全量曾遇 MS 429（getMassProperties，retryAfter 101s），
  干净窗口复跑 4/4；非代码失败。
- **未做**：多源增删/重排；FACE pattern 多源。

## 执行记录（2026-11-09，Transform UI 切片）

- **证据**：`ui-evidence/feature-dialogs-20261108/onshape/transform*.{json,png}`
  （XYZ 平动 dx/dy/dz、旋转轴+角度、均匀缩放+固定点、复制零件）。
- **UI**：新增 `TransformDialog`——按 XYZ 平动 / 世界 X/Y/Z 轴旋转 / 均匀缩放 +
  复制；目标实体插入单选（N≤1 自动），编辑只读；自定义轴/旋转中心/缩放固定点
  只读保留；多分量禁改参、非均匀缩放禁编辑、零/无操作禁提交；复制明示
  Unite 合并语义。线/点/配合连接器拾取与独立 Part 副本仍 blocked，不伪造。
- **后端**：`previewOp` update/insert 白名单加 transform；`TransformFlow` 15/15
  （新增两条预览零写用例）；后端全量 878 passed / 1 expected fail / 8 skipped。
- **验证**：web **1522/1522**、TransformDialog **6/6**、tsc/e2e tsc/lint 绿；
  真栈 `e2e/transform-ui.spec.ts` **2 passed（44.3 s）**——1000 → 平动+复制
  **2000.000 mm³** 质心 (30,5,5) → 编辑旋转 **1000.000 mm³** 质心 (-5,15,5)，
  插入/编辑预览 data-dynamic=1，push+冷重开一致。能力翻 full。
- **未做**：按直线/距离平动（线/点拾取）、旋转任意边轴、缩放固定点拾取、
  独立零件副本、多分量组合编辑、converter UI 复核。

## 执行记录（2026-11-09，SplitPart UI 切片）

- **证据**：`ui-evidence/feature-dialogs-20261108/onshape/split.{json,png}`
  （零件/面、目标、工具、保留工具、修剪、保留两侧）。
- **UI**：新增 `SplitPartDialog`——目标实体 + XY/YZ/XZ 平面 + 偏移 + 保留正/负
  侧；面分割/保留工具/修剪面边界/双侧仅静态诚实提示（不渲染假控件）；目标实体
  插入单选，编辑只读。
- **后端**：`previewOp` update/insert 白名单加 splitPart；`SplitPartFlow` 8/8
  （+2 预览零写）；后端全量 880 passed / 1 expected fail / 8 skipped。
- **验证**：web **1523/1523**、SplitPartDialog **4/4**、tsc/e2e tsc/lint 绿；
  真栈 `e2e/split-part-ui.spec.ts` **2 passed（45.8 s）**——盒 4000 →
  YZ x=20 正侧 **2000.000 mm³** 质心 x=25 → 编辑 x=25 **1000.000 mm³**
  质心 x=27.5，插入/编辑预览 data-dynamic=1，push+冷重开。能力翻 full。
- **未做**：面分割、保留工具、修剪到面边界、保留两侧（多体）、converter。

## 执行记录（2026-11-09，body pattern 第二方向）

- **契约**：shared **1.62.0** `PatternParams.secondDirection`（linear；count/spacing/
  axis/centered；总实例 ≤1000）。
- **后端**：schema/refine + 网格 transforms（identity 由 transform 列表承载）+
  formFields；`PatternFlow` 22/22、registry 表单一致性；后端全量 882 passed /
  1 expected fail / 8 skipped。
- **UI**：FeatureDialog 线性阵列「第二个方向」占位转正——count/spacing/axis/
  centered 编辑、居中每侧 N 语义、圆周自动取消、编辑回显；FeatureDialog
  179/179、web 1526/1526、tsc/e2e tsc/lint 绿。
- **真栈**：`e2e/pattern-second-direction-ui.spec.ts` **2 passed（53.5 s）**——
  4×4×5 盒 3×2 **480.000 mm³** 质心 (14,8,2.5) → 编辑 3×3 **720.000 mm³**
  质心 (14,9,2.5)，预览 data-dynamic=1，push+冷重开。
- **未做**：skip、圆周第二方向、converter/translator。
- **回归**：shared 1.62 / backend 882 / MS 重启后，`verify-imodels` **14/14
  passed（2.5 min）**；13 个示例 iModel 树/body/体积读回不变。

## 执行记录（2026-11-09，body pattern 第一方向反向）

- **契约**：shared **1.63.0** `PatternParams.oppositeDirection`（linear；圆周拒收）。
- **后端**：schema/transforms/formFields；`PatternFlow` 23/23、全量 883 passed /
  1 expected fail / 8 skipped。
- **UI**：FeatureDialog「反向」复选框 + 载荷/预览/编辑回显；圆周复位；
  FeatureDialog 179/179、web **1527/1527**、lint/tsc 绿。
- **真栈**：3×3 网格 720 mm³ → 反向 → 质心 x=-6（体积不变），push+冷重开；
  `pattern-second-direction-ui` **2 passed（46.5 s）**。

## 目标重新锚定（2026-11-09 用户裁决）

四条总目标已登记到 `docs/architecture/PRODUCT-GOALS-AND-ENGINEERING-PRINCIPLES.md`：

1. 实现 Onshape 全部草图/约束/特征，服务于 AI+CAD；
2. Onshape 全量示例 + AI 扩展到数十万示例，用于验证真形内核与绳墨求解器（独立 oracle，禁止自证）；
3. 每个功能点检查整体架构合理性与逻辑闭环，不以局部补丁过关；
4. 持续审计 imodel-native 中 BRepCore 相关全部实现是否合理/最优，形成台账。

后续计划按真实 PS blocker 排名重制；优先 imprint 精确化、selector、外部草图引用、多体作用域、
数据采集；能力与 BRepCore 审计作为并行常规项。

**优先级移交（2026-11-09）**：新计划已写入
`docs/superpowers/plans/2026-11-09-ps-blocker-driven.md`（基于重新生成的
`manifest/example-index.json`：104 native / 59 可测 native / 47 imprint /
25 selector / 27 CONCENTRIC 等）。本台账保留为历史执行记录与切片证据索引；
后续调度以新计划 §0.3 的 ≤2 blocker 清单为准。

## 执行记录（2026-11-09，imprint 有向边侧语义）

- **根因**：Onshape `topologyDisambiguation([[edge, ±1]])` 是**有向草图边左/右侧**；
  旧实现按“−1 环外/+1 环内 + 最大面积”选面。First Part Extrude 2 的两条查询应选
  region 2 ∪ region 4，旧实现只选 region 2，少 5,277 mm³。
- **实现**：shared `sketch/imprint-region.ts`（line/arc/circle、孔边界、同侧歧义
  回退）+ 公共 `run.ts` + 后端 `test/ScenarioReplay.ts`；converter 解码 qCompressed
  后取符号。无 RPC/`interfaceVersion` 变更（shared 180/180）。
- **证据**：First Part 真栈 **357566.084 vs 357568.177（0.0006%）2 passed**，
  原 `test.fail` 移除；Alignment **8915.890 vs 8915.860**；WARNING LABEL
  **0.8193532**；iOS 离线 **157478.895**；backend `ScenarioReplayParity` 7/7。
- **索引**：strict `replicable-now` 2 → **7**；imprint blocker 47 → **14**
  （全部 regionRisk）。后续按新计划 P1.2 处理 regionRisk，再进入 P2 selector。
