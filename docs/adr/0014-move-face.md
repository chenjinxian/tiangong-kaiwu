# ADR-0014：moveFace 面偏移（首切片）

- 状态：已接受（2026-11-07；计划 W2.5 / T7）。
- 关联：`docs/adr/0006-onshape-new-feature-types.md`、
  `docs/superpowers/plans/2026-11-06-example-coverage-continuous.md`。

## 背景与证据

- 语料 moveFace **160 个特征**，5 个 PS 含 moveFace blocker（0 个单 blocker，需与其它
  能力组合才解锁）；deleteFace 6 个 PS（1 个单 blocker）、replaceFace 2 个 PS。
- 内核通道探针（2026-11-07，临时 StandaloneDb 探针，结论后删除探针文件）：
  - `OffsetFaces`（editor op17）对盒顶面 +5/−5 均返回单 BRep Solid（type=0，data 11.5 KB），
    通道可用；
  - op17 绑定要求参数里**显式** `offsetAll` 布尔——缺省时原生参数解析抛
    `A boolean was expected`。首版恒传 `false`（逐面距离语义）；
  - `DeleteSubEntity` 对顶面返回 **0 条目** → deleteFace 仍 **blocked-kernel**，不近似；
    **2026-11-07 复核（fillet 面）**：盒体一条 20 mm 边 `blendEdges` R2 成功
    （体积 4000→3982.831，重建缓存后 7 面、新 fillet face id=7），对 face 7 调
    `deleteSubEntities` 仍返回 **undefined**（体积不变）——不是「盒面不可 heal」
    的个例，deleteFace 通道整体 blocked-kernel；
  - `ReplaceFace` 在 editor IPC 面未暴露 → replaceFace 仍 blocked。
- iTwin 面持久引用（`resolveFaceRef` → `facesFromId`）与面寻址通道已在 shell/faceExtrude
  验证；本切片复用同一通道。

## 决策（切片 1）

1. **契约（shared 1.42.0）**：`LubanFeatureType + "moveFace"`，`MoveFaceParams`：
   - `faces: LubanTopologyId[]`（≥1；持久面引用，面分裂碎片全部入集）；
   - `distanceMm: number`（非零有限数；正=沿面外法向、负=内缩）。
   - 首版**单一距离广播**到全部选中面；逐面不同距离留切片 2。
2. **求值**：scratch 载体缓存上游 → `facesFromId` 逐引用解析 → 内核
   `offsetFaces(faces, distances=等长广播, offsetAll:false)` → 回包 entryArray。
   引用失效/零距离/无回包 → 抛错 status=1，不假成功。
3. **不做**：删除面/替换面（内核回包/接口缺失，保持 blocked-kernel）、逐面距离、
   对面类型/方向的额外预判（交由内核裁决）、UI/converter（无 live 控件证据）。
4. **撤销/事务**：标准 FeatureOp；无不可逆操作。

## 验证与回滚

- 单测：盒 20×20×10 顶面 +5 → **6000 mm³** bbox z [0,15]、单 BRep；−2 → **3200**
  bbox z [0,8]；右面 +5 → **5000** bbox x [0,25]；update +5→−2 重求值 **3200**；
  失效引用 status≠0；schema 空面集/零距离/缺键/未知键/非整数 id 拒收。
- 真栈：`e2e/move-face.spec.ts`——视口点选顶面（产品 `resolveFaceRef` 通道）→ +5
  **6000.000 mm³** 质心 z=7.5 → update −2 **3200.000** 质心 z=4，push+重开一致。
- 回滚：新 FeatureType/参数 additive；移除注册即回到 1.41 行为，旧库无迁移。

## 实现记录（切片 1，2026-11-07）

- 契约 shared **1.42.0**；shared **168/168**。
- 后端 `MoveFaceFlow` **6/6**；后端全量 **797 passed / 8 skipped**（94 files）。
- Web 无 UI 入口（能力 gated）；web 全量 **1394/1394**。
- 真栈 `e2e/move-face.spec.ts` **2 passed**（setup+test，43 s）。
- `DeleteSubEntity` 探针 0 条目已登记：deleteFace 仍 blocked-kernel；replaceFace
  editor IPC 面未暴露。published artifact 仍 1.32（1.35–1.42 未发布）。

## 原切片 2 计划（逐面距离已在下方落地；平移/UI/converter 仍待）

- 逐面不同距离、MoveFace 平移模式（Vector 位移）、面选择 UI（复用 shell 面拾取 +
  Onshape live 证据）、converter 映射、deleteFace/replaceFace 的内核能力立项。

## 实现记录（切片 2：逐面距离 distancesMm，2026-11-07）

- 契约 shared **1.46.0**：`MoveFaceParams.distanceMm` 改为可选，新增
  `distancesMm?: number[]`（长度必须等于 faces；与 distanceMm **恰一**；各值非零有限）。
- 后端 `moveFaceSchema`/`evaluateMoveFaceAsync`：按 faces 下标取逐面距离，面分裂碎片
  继承所属引用的距离（等长数组广播；`offsetAll:false` 纪律不变）。
- 后端 `MoveFaceFlow` **9/9**：新增顶面 +5/右面 +2 → **6600 mm³** bbox x [0,22]/
  z [0,15]；update [−2,−1] → **3040 mm³**；形态矩阵（同给/长度不符/零值/都不给拒收）。
- 真栈 `e2e/move-face-per-face.spec.ts` **2 passed**：视口分别点选顶面 (1,6)/右面
  (1,3) → **6600.000 mm³** 质心 (11,10,7.5) → update [−2,−1] **3040.000**，
  push+重开一致。
- 后端全量 **806 passed / 8 skipped**（94 files），shared 169/169，web 1420/1420。
- 能力仍 gated（无 UI 面选择入口）；平移模式/UI/converter 未接。

## 实现记录（UI 面：MoveFaceDialog，2026-11-08）

- 证据：`ui-evidence/feature-dialogs-20261108/onshape/move-face.{json,png}`
  （CDP Chrome 登录后经 Playwright `connectOverCDP` 采集，采完 Escape 取消，
  特征数回到 10）。字段：要移动的面 / 偏移 / 终止类型（给定深度）/ 距离 /
  重新应用圆角。
- `MoveFaceDialog`：面来自唯一选择权威 `store.canvas.selection`（ribbon 路由快照 +
  对话框存活选择合并）；偏移/给定深度只读展示；距离 + 向内/向外（符号进
  `distanceMm`）；`重新应用圆角` 禁用 + 明确提示；逐面 `distancesMm` edit 只读且
  禁提交；跨 body/无 owner 诚实拒收；提交走标准 `insertFeature/updateParams`
  FeatureOp，带 owner `targetBodyId`。
- 接线：ribbon `moveFace` 特例改道对话框；PartStudioCanvas 渲染专用对话框；
  `capabilities.moveFace` gated→full（引导文案移除）。
- 单测 `MoveFaceDialog.test.tsx` **7/7**（载荷/方向/校验/跨 body/edit/逐面只读）；
  真栈 `e2e/move-face-ui.spec.ts` **2 passed**：盒 20×20×10 → 视口点选顶面
  faceRef=(1,6) → 对话框距离 5 → **6000.000 mm³** 质心 (10,10,7.5)，树
  `sketch/extrude/moveFace` 全 status=0，params `{faces:[(1,6)], distanceMm:5}`，
  push+重开一致；web 全量 **1443/1443**。
- 未做：平移/旋转模式（产品契约只有 offset）、逐面距离对话框编辑、converter 映射、
  deleteFace/replaceFace（blocked-kernel）。

## 实现记录（moveFace 改参/插入预览，2026-11-08）

- 后端 `previewOp`：`updateParams` moveFace 影子求值新距离/面集；`insertFeature`
  moveFace 与 fillet 同通道（目标链尾缓存 + 目标体），回传
  `PreviewResult.preview`（不写库/不写缓存/无 txn）。`MoveFaceDialog` 既有预览
  管线此前只拿到 affected，无几何可显示。
- 后端 `MoveFaceFlow` **10/10**：新增预览用例（preview 非空、elementId=目标体、
  预览后体仍 6000 mm³、树 params 仍 `distanceMm=5`）。
- 真栈 `e2e/move-face-ui.spec.ts` **2 passed**：距离 5 对话框内出现
  `data-dynamic=1` 动态预览；提交后 **6000.000 mm³** 质心 (10,10,7.5) 不变。
