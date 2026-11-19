# Feature depth matrix（20 个既有 FeatureType，2026-11-19 v0）

> 状态口径：[`STATUS-DEFINITIONS.md`](./STATUS-DEFINITIONS.md)。
> `full` 需要七维全绿；本表 v0 是**逐分支盘点**，不是完成声明。没有后端/内核证据
> 的分支一律 `partial` 或 `blocked-*`，不得因 UI 入口存在而标 full。
>
> 内核边界见 [`KERNEL-BOUNDARIES.md`](./KERNEL-BOUNDARIES.md)；原始证据在私有仓。

| FeatureType | UI 入口 | 后端/内核（现有） | 已证据分支 | 主要缺口 → 状态 | wave |
|---|---|---|---|---|---|
| `extrude` | 拉伸主钮 | 后端 ExtrudeParams + Sweep/Boolean；ACIS Modeler | blind/throughAll/remove/intersect、symmetric、第二方向、薄壁、起始面 faceExtrude、upToVertex/upToSurface 部分 | 终止条件全形态、upToPart、第二方向拔模/偏移、薄壁对称/双厚度、多区域 NEW 全组合 → `partial` | W3 |
| `revolve` | 旋转 | RevolveParams + SpinBody | 任意轴/边轴部分、remove | thin/surface、intersect 全形态、非世界轴 UI、区域完整 → `partial` | W3 |
| `sweep` | 扫掠 | SweepParams + SweepPath/Loft | 基本路径、部分多 profile | 曲线路径/guides/twist/scale/lock、曲面结果、多 profile 全组合 → `partial` | W3 |
| `loft` | 放样 | LoftParams + 多截面（shared 1.69） | 2/3 截面、部分非平行 | guides、端条件、thin/surface、编辑/重算、全区域 → `partial` | W3 |
| `fillet` | 圆角 | BlendEdges | 单边/多边、部分 12 边边界、半径表达式 | full-round、变半径、不对称、face blend、modifyFillet、溢流；Bumper 12 边 `blocked-kernel` → `partial` | W3/W4 |
| `chamfer` | 倒角 | ChamferEdges | mode 1/2/3、逐边值、表达式 | mode 0/4、面/边混合、逐边数组全 UI、partner coedge 边界 → `partial` | W3 |
| `hole` | 孔 | HoleParams + Boolean | blind/throughAll、沉头/锥口、顶点/面引用部分 | thread/钻表、upToSurface/upToVertex 全形态、start plane、mateConnector 轴、标准孔径 → `partial` | W3 |
| `shell` | 抽壳 | HollowFaces | 单面/多面开口、默认/逐面厚度 | 闭合 hollow、逐面厚度 UI 全量、0 穿孔边界 → `partial` | W3 |
| `mirror` | 镜像 | 反射 + Boolean | 世界平面、faceRef、featureMirror 部分 | 非世界面/轴、多源编辑、源链 status → `partial` | W3 |
| `pattern` | 线性/环形阵列 | PatternParams + 差集/Boolean | linear/circular、第二方向、间距/角度表达式 | skip、curvePattern（gated）、任意轴、count 表达式（不支持需登记）、UI 全形态 → `partial` | W3/W4 |
| `featurePattern` | 特征阵列（树行） | 源特征差集 + 轴阵列 | 多源、第二方向、circular/linear、表达式 | 从特征树插入的 UI、源增删编辑、skip、count 表达式 → `partial` | W3 |
| `featureMirror` | 特征镜像 | 源差集反射 | 多源、基本平面 | 编辑对话框、face/datum 轴、源链 status、pattern 源 → `partial` | W3 |
| `booleanBodies` | 布尔（体） | BooleanOperation | Unite/Subtract/Intersect、多 target 部分 | 多 target 全过程、结构可编辑、offset/reFillet、预览/失败回滚 → `partial` | W3 |
| `booleanAdd` | 布尔（草图） | BooleanParams + Extrude | 基本 add | 多区域/作用域/intersect/薄壁组合 → `partial` | W3 |
| `booleanSubtract` | 布尔（草图） | BooleanParams + Extrude | 基本 subtract | 多区域/作用域/intersect/薄壁组合 → `partial` | W3 |
| `cPlane` | 基准面 | CPlaneParams | Top/Front/Right/偏移/反转、LINE_ANGLE/LINE_POINT/THREE_POINT 部分 | 任意面/边参考、非世界帧 UI 编辑、表达式、方向约束 → `partial` | W3 |
| `faceExtrude` | 面拉伸（变体） | FaceExtrudeParams + ACIS | CAP_FACE/startOffset/draft、Bumper 精确 | UI 入口/面集/offset/draft 全形态、多面域 → `partial` | W3 |
| `transform` | 变换 | TransformParams + Boolean | 平移/任意轴旋转/均匀/非均匀缩放/副本 | 7 模式全量、数值输入/基点、组件编辑、剪切 → `partial` | W3 |
| `splitPart` | 分割 | SplitPartParams + Boolean | 单侧世界平面、部分面/草图 | 双侧、面驱动、keep tools、trim boundary、任意平面 → `partial` | W3 |
| `moveFace` | 移动面 | OffsetFaces | 单面/逐面距离、表达式 | 旋转/替换面、reapply fillet、逐面 UI 全量、deleteFace 边界 → `partial` | W3/W4 |

## 缺失特征族（不在 20 个 FeatureType 内）

| 族 | 当前 | 结论 |
|---|---|---|
| draft | UI gated；TaperFaces 原生已实现未接线 | ADR-0021 批准后 `expose`；之前 `gated`/`blocked-design` |
| deleteFace/deleteEdges | UI gated；DeleteFaces 普通面内核失败 | deleteFace `blocked-kernel`；deleteEdges 先补 ctest |
| deleteBodies | UI gated；无 FeatureOp | 纯 backend 生命周期，W4 |
| replaceFace | UI gated；editor IPC 未暴露 | 评估 API/许可；否则 `blocked-license`/`blocked-kernel` |
| thicken | UI gated；ThickenSheet InterOp 未授权 | `blocked-license`，不接线 |
| rib | UI gated | 可用 SweepFaces/布尔组合；先 ctest/ADR |
| surface 族（offset/fill/enclose/boundary/ruled/extend/faceBlend/modifyFillet） | UI gated | 按 ACIS 探针逐项；无证据不产品化 |
| wrap/emboss | UI gated；Emboss 原生已实现 | 先 ctest，再 `expose` |
| externalThread/helix | UI gated | 独立 ADR/几何算法；不得近似 |
| frame/sheet metal/userFeatures | UI gated | 独立子系统/排除轨道；不“顺手”实现 |

## 推进顺序（W3–W4）

1. 先补逐分支 UI/契约/后端缺口，使 20 个 FeatureType 的**每个参数分支**都有
   full/blocked 结论（本表 v0 → v1）。
2. 再做 ACIS 暴露族（TaperFaces → SweepFaces → OffsetEdges → Emboss →
   IntersectSheetFaces → DeleteEdges），每项 ctest 后接线。
3. 每个切片同时更新 `docs/parity/capability-ledger.json` 与受影响示例批次。

*最后更新：2026-11-19（v0，逐分支盘点；不代表任何行已 full）*
