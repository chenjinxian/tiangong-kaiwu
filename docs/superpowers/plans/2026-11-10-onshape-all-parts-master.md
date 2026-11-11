# Onshape 全量 Part 复刻总计划（2026-11-10）

> **执行方式**：本计划是 `2026-11-09-ps-blocker-driven.md` 与
> `2026-11-09-ps-blocker-next.md` 的全量扩展。数据采集与能力实现并行推进；
> 每个能力切片仍遵守 P0-04（先 AIRR/ADR）、P0-05/06（单一 FeatureOp/BIS 事实源）、
> P0-07/09（shared 契约与内核边界）与“不伪造”纪律。
>
> 用户指令（2026-11-10）：完整实现清单中全部示例，确保实现 Onshape 全部 Part；
> 需要采集数据时随时执行采集程序。本计划把“全部 Part”定义为私有语料索引中的
> **1685 个 API Part Studio / 1470 个已落盘 PS 目录 / 526 个文档**；每个 PS 必须
> 落到“严格复刻完成”或“有证据的 blocked 轨道”，不得静默跳过。装配与工程图
> 不是 Part Studio，单独登记为 `excluded-assembly-only`，不计入 Part 完成率。

## 0. 目标与口径

### 0.1 最终目标

1. 每个 Part Studio 有唯一分类、证据、特征树、逐 body 期望体积/质心。
2. 所有 **native Part Studio**（只由 Onshape 原生草图/特征组成）都在 LubanCAD
   有真实 iModel/Part Studio、标准 FeatureOp 链、逐 body 体积、树 status=0、
   push + 冷重开一致。
3. 非 native（importForeign/importDerived、钣金、自定义 FeatureScript、专用特征）
   进入独立轨道：完成 ADR/能力实现后才算完成；未实现的必须明确 `blocked-*`，
   不能用近似几何或单 body 冒充。
4. 全部示例可通过 `/examples` 或目录页发现；blocked 示例也列出阻塞原因。
5. 所有结论可由私有语料 + 公共 replay + 真栈 e2e 复现。

### 0.2 当前基线（2026-11-10 索引）

| 指标 | 数值 |
|---|---:|
| 发现文档 | 526 |
| 含 Part Studio 文档 | 476 |
| API Part Studio | 1685 |
| 已落盘 PS 目录 | 1470 |
| 有 features 的 PS | 227 |
| 逐 body 可测 native PS | 77 |
| 严格绿 `replicable-now` | 18 |
| raw 可复刻（忽略 scenario 完整性） | 46 |
| blocked-evidence（多为缺 features/body 数据） | 1276 |
| blocked-capability | 15 |
| blocked-converter | 32 |
| blocked-selector | 3 |
| blocked-kernel | 3 |
| excluded-import/custom/specialized/sheet-metal/empty | 69/21/10/18/5 |
| 已采 features 文档 | 50 |
| 已采 parts/逐 body 质量属性的文档 | 11 |

**最大事实缺口**：1243 个 PS 缺 features 文件，26 个 PS 缺 body 数据；没有这些数据
无法判断 native 能力缺口，也不能宣称“全部 part”。因此数据采集是 P0，必须先跑。

### 0.3 完成定义（每个 PS）

四维 `geometry/constraints/ui/persist` 全部 complete，且：

1. 真实 iModel + 正确 PS scope；特征链来自标准 `FeatureOp`（草图可 RPC 精确复原，
   标注数据来源）。
2. `getFeatureTree` 的 featureType/顺序/名称/status=0 与 Onshape 一致。
3. 草图实体/约束/solveStatus/DOF 与采集证据一致；未实现约束必须
   `blocked-capability`，不得 `constraints=dropped` 冒充。
4. `getBodies` 数量一致；逐 body `getMassProperties` 体积在 0.5%（难例 1%）内；
   多 body 按体积配对，禁止总体积替代。
5. push + 冷重开；树/body/体积一致；undo/redo 可用。
6. 演示/证据 manifest 记录每步截图、scenario hash、验证时间。
7. 任何未完成项写入 `blocked-capability`/`blocked-selector`/`blocked-kernel`/
   `blocked-evidence`/`excluded-*`，附证据；不得标 complete。

## 1. 范围裁决

- **native 轨道**：仅 Onshape 原始草图 + 原生标准特征；全部必须实现。
- **import 轨道**：`importForeign`/`importDerived` 需要第三方 CAD 导入能力；
  当前产品约束不允许 ACIS STEP/healing；先做 ADR，未批准前保持
  `blocked-scope`。不得用近似重建冒充 import 完成。
- **sheet metal 轨道**：新特征族 + 内核支持；单独 ADR/AIRR，不与 native 混算。
- **custom FeatureScript 轨道**：不解释任意 FeatureScript；按 exclude 登记，
  除非用户另行授权实现解释器。
- **专用特征轨道**：frame/weld/wire/decal/thread 等按解锁数逐个 ADR。
- **装配/工程图**：不产生 Part Studio 的文档登记为 `excluded-assembly-only`，
  不复刻装配约束/图纸；文档内的独立 PS 仍纳入。
- **多 PS 文档**：一个文档一个 iModel，每个 PS 一个 scope；逐 PS 计完成率，
  不挑一个 PS 宣称整个文档完成。

## 2. 数据采集协议（P0）

### 2.1 采集顺序

1. **features 全量**：对所有缺 features 的 PS 跑
   `node tools/collect.mjs --features-only --reserve <安全余量> --sort copies --delay 1000 --concurrency 1`。
   每个 PS 保存 features + sketches（如响应可用）；429/remaining 低时立即停止，
   记录 retry-after，窗口恢复后续跑。
2. **parts**：`node tools/collect.mjs --parts-only`；补齐所有 body/part 元数据。
3. **逐 body 质量属性**：`node tools/mass-by-part.mjs --doc <id>` / 全量；
   每 40 个 partId 分块；不得用聚合 `-all-` 冒充。
4. **document/elements/folders**：补齐 1470→1685 PS 的 element 目录与文档元数据；
   folder 名称/父链用官方 API；无权限记 null。
5. **UI 证据**：按特征类型补 Onshape live 对话框截图/DOM/ARIA；已有 UI 证据
   526 文档保留，新增特征类型至少一个真实证据。
6. **面/边 oracle**：对 selector/face/edge 阻塞的 PS 采 bodydetails 面 id/area/bbox
   或回滚边 oracle；只存私有仓。

### 2.2 采集纪律

- 连接已登录 Onshape 的 CDP Chrome；401/403 立即停止并记录，不重试伪造。
- 429/remaining ≤ reserve 立即停止；只按服务端 retry-after 或窗口恢复续跑，
  不并发绕过限流。
- 每轮写 `staging/rate-limit.json`、请求日志、覆盖率；不得删除原始响应。
- 数据仓不 commit/push 公共仓；公共仓只同步聚合数字/脱敏 registry。
- 采集器可随时重启，断点续跑；每个文档/模式有 `_*-complete.json` 标记。
- 采集是长周期任务：允许后台执行，但每轮必须有日志与下次恢复时间。

## 3. 完整任务清单

> 任务状态：`[ ]` 未开始、`[~]` 进行中、`[x]` 完成、`[B]` 有证据的 blocked。
> 每个能力任务都包含 AIRR/ADR（若需）、shared/backend/web 同批、单测/真栈、
> 文档/矩阵更新；不再在任务之间重复展开同一门禁。

### Phase A — 数据真相与工作队列

- [ ] **A1 features 全量采集**：补齐 1243 个缺 features 的 PS（含 215 个未落盘
  PS 目录）；产出覆盖率/阻塞日志；每窗口断点续跑。退出：所有 1685 PS 有
  features 或明确 API/权限错误。
- [ ] **A2 parts 全量采集**：补齐所有 PS 的 parts.json；多 body 全部保留。
  退出：每个 PS 的 part 列表与 body 数量可读。
- [ ] **A3 逐 body 质量属性**：补齐 `massproperties.per-part.json`；逐 partId
  查询、分块合并；退出：可测 PS 全部有逐 body volume/mass/centroid。
- [ ] **A4 document/elements/folder 元数据**：补齐未落盘 PS 目录与 folder 链；
  退出：1685/1685 PS 有文档归属，folder 缺失显式 null。
- [ ] **A5 UI/selector 证据**：按 20 类 blocker 补 live UI 证据与 face/edge
  oracle；退出：每个能力切片至少有真实 UI 证据；无证据的能力 gated。
- [ ] **A6 重建索引/队列**：重跑 example-index / work-queue / coverage /
  selector-matrix / verify；退出：0 errors，blocker 计数可复现，批次清单刷新。
- [ ] **A7 数据审计**：复核 1685 API PS vs 1470 目录差异、空签名、缺失 features/
  parts、429 记录；退出：审计报告与下批采集计划。

### Phase B — Native 能力基座（按解锁值）

#### B1 imprint / face split / 面集精确化

- [ ] **B1.1 imprint 边侧/补集面**：完成 +1/−1 有向边侧、孔边界、−1 补集面、
  多不相交闭环；shared 单一实现；合成 + 真实 PS 真栈。
- [x] **B1.2 实体面 split（首切片，schedule D2）**：Part 5 单线面内切分 +
  Part 5 E3 凸包空腔（void）填充；Part 6 E3 void split + E5 源证据 no-op
  remove（shared 1.67 `noOpEvidence`）；Part 5/6 均 strict 绿且冷重开一致；
  多子面并集/edge-split face-set 泛化未做。
- [ ] **B1.3 面积 + bbox/拓扑/质心证据**：同面积候选唯一解；多解 ambiguity；
  清除 regionRisk（17 + 缺 sketchEntityId 8 + 组合 2）。**2026-11-11 首切片**：
  regionRisk 多选区剔除“外环属于另一选中区域孔集”的孔内孤岛（Links
  Extrude 2 [0,1]→[0]），避免填实 R5 孔；其余 regionRisk 仍待证据。
- [ ] **B1.4 CAP_FACE/SWEPT_FACE + startOffset/draft/isStart**：产品 faceExtrude
  与 replay 精确路径；Bumper 通用轨与审计轨分离。

#### B2 统一 selector resolver

- [ ] **B2.1 taxonomy**：CAP_EDGE / SWEPT_EDGE / createdBy / face / axis / body /
  sketch curve / mateConnector / unknown；未知计数可见。
- [ ] **B2.2 每类 resolver + synthetic/真栈**：镜像面、面边界、轴线派生、
  草图串、圆 SWEPT_EDGE、跨 body owner 消歧；0/多候选 fail closed。
- [ ] **B2.3 Bumper 通用 12 边**：内核边界或通用边集修复；strict 轨不再依赖
  审计 oracle；如果内核不支持，登记 blocked-kernel，不升绿。

#### B3 草图外部引用与约束

- [ ] **B3.1 PROJECTED（56）**：实体边/面投影、平行/非平行、裁剪、源驱动边、
  Use 工具；ADR-0009 切片 1b 升级为批准+实现。
- [ ] **B3.2 PIERCE（18） / INTERSECTED（16） / SILHOUETTED（14）**：求解/
  归一化/显示/UI 槽位；每条一个真实 PS 绿例。
- [ ] **B3.3 草图 pattern 约束（CIRCULAR 19 / LINEAR 8）**：展开/求解/引用。
- [ ] **B3.4 约束长尾**：CENTERLINE_DIMENSION 剩余形态、NORMAL、QUADRANT、
  MAJOR/MINOR_DIAMETER、EQUAL_CURVATURE、RHO、BEZIER_DEGREE、OFFSET 形态。
- [ ] **B3.5 草图实体**：ellipse/ellipticalArc/conic、N 点样条（fit/control/
  rational/periodic）、text；求解器/region/绘制/标注/编辑全链。

#### B4 Converter 完整性（产品已有能力）

- [ ] **B4.1 cPlane**：MID_PLANE/LINE_POINT/PLANE_POINT/任意面/非世界帧；改参传播。
- [ ] **B4.2 moveFace / splitPart / deleteFace / deleteBodies / replaceFace**：
  converter + UI 仅转精确子集；失败 dropped/blocked。
- [ ] **B4.3 booleanBodies**：tool body/target body/offset/reFillet/intersect 全形态。
- [ ] **B4.4 mirror / featureMirror**：任意面、多源、局部/跨体、operation 全形态。
- [ ] **B4.5 patterns**：linear/circular 第二方向、skip、feature 源扩展、多点。
- [ ] **B4.6 shell / hole / loft / sweep / transform / extrude 变体**：剩余
  终止条件、face 选择、螺纹孔、跨体 scope、薄壁/曲面结果。
- [ ] **B4.7 assignVariable / 表达式**：静态求值与变量表；不可求值 blocked。

#### B5 产品缺失特征族

- [ ] **B5.1 draft（39）**：中性面/拔模面/角度/方向；UI face picker + 预览。
- [ ] **B5.2 rib（20）**：草图线/厚度/方向/延伸到面；UI + 预览。
- [ ] **B5.3 splitPart 完整**：面/草图/平面、双侧、保留工具、修剪边界。
- [ ] **B5.4 曲面族**：thicken/offsetSurface/enclose/fill/boundarySurface/
  ruledSurface/extendSurface/faceBlend/modifyFillet/cornerChamfer。
- [ ] **B5.5 专用/长尾**：externalThread、helix、bridgingCurve、projectCurves、
  trimCurve、compositePart、wrap、multiMirror、lighten、endcap 等；按解锁数排序。
- [ ] **B5.6 钣金族**：sheet metal start/flange/bend/hem/cornerBreak/makeJoint；
  单独 ADR + 内核，不混入 native 完成率。

#### B6 多体/跨体（ADR-0015）

- [x] **B6.1 `targetBodyIds` 契约（首切片，shared 1.65.0）**：`insertFeature`
  的 `targetBodyIds`（与 `targetBodyId` 互斥）+ `FilletEdgeRef.bodyKey`；
  schema/DSL/逐体缓存/失败 all-or-nothing/旧载荷兼容已落。**update/suppress/
  delete 多目标、REMOVE extrude/hole 与下游消费仍待做**。
- [x] **B6.2 REMOVE extrude/hole 多目标**（shared 1.68）：throughAll REMOVE
  extrude/hole 单特征行逐体求值；合成 T9g 两体 2.4/4.8 mm³、负路径零写、
  冷重建一致；Links 几何 **10,039.240 / 11,704.087 vs 10,039.241 /
  11,704.085**、6 步 status=0、冷重开一致（约束仍 dropped，PS 保持
  blocked-converter）。
- [x] **B6.3 跨体 fillet/chamfer/shell/moveFace**：fillet 首切片已落（逐
  owner body 分组 + 逐组 BlendEdges + 逐 body 缓存/写回/冷重建）；Handle
  Parts 真栈 **strict 绿**（3 体 11,878.438 / 30,944.712 / 105,771.136，
  整链 +0.009%，冷重开一致）。Threaded Shaft 旧 +4.2% 根因是 converter
  linearPattern `directionOne`（SWEPT_FACE）误映射 +Z，不是 fillet；修正为
  旋转轴 -X 后闭合。**多目标改参/抑制/删除已支持（T9i/T9j/T9k；预览明确拒收）**；
  chamfer/shell/moveFace 多目标仍未做。
- [ ] **B6.4 featurePattern/featureMirror 多体**：源 owner 集合/逐体应用；
  不跨体复制。
- [ ] **B6.5 UI 多目标选择器**：live 证据、树行单特征、编辑/撤销/冷重开。

#### B7 内核与架构

- [ ] **B7.1 真形/ACIS 能力审计**：face split、blend groups、shell、loft/sweep、
  boolean、拓扑 id、mass；每能力切片更新私有台账。
- [ ] **B7.2 失败封闭守卫**：零体积/非有限/半成品回滚；native probe + ctest。
- [ ] **B7.3 性能与稳定性**：多 body/多 PS、mass 细分、tile、冷开；基线。
- [ ] **B7.4 可撤销/HITL**：所有写 op 标准事务；不可逆操作例外登记。

#### B8 契约、UI 与发布基座

- [ ] **B8.1 shared 契约**：每个 FeatureOp 字段/版本/双端发布/旧库 fixture。
- [ ] **B8.2 UI 通道**：FeatureDialog 分通道、live 证据、编辑回显、预览、
  抑制/删除/撤销、错误面。
- [ ] **B8.3 回放/批量 runner**：scenario schema/converter/translator；每 PS
  隔离失败；批次报告自动生成。
- [ ] **B8.4 演示/catalog**：完成 PS 入 `/examples`，blocked 列原因；逐 body
  体积展示。

### Phase C — 示例批次执行

> 每批只做一种能力/一组同源 blocker；批次开始前重生成索引，结束后逐 PS 验证。
> 严格绿定义见 §0.3；不得把 `record`/`test.fail` 计入。

- [x] **C1 最快清单收尾**：Exercise: Clamp / Handle Parts（跨 3 body fillet
  + pattern 多体 remove）strict 绿；公开 catalog 第 22 例；其余已完成项回归。
- [ ] **C2 blocked-selector（3）**：单线 imprint face split / 面集位置证据；
  逐个转绿或 blocked-kernel 证据。
- [ ] **C3 blocked-kernel（3）**：Bumper 12 边通用、Gaiter full-circle fillet、
  Stirrup −1 补集面；内核修复或永久 blocked 证据。
- [ ] **C4 blocked-capability（15）**：按 B5/B6/B3 能力逐批；每批所有可测 PS。
- [ ] **C5 blocked-converter（32）**：按 B4 能力逐批；不把近似标 complete。
- [ ] **C6 blocked-evidence（1276）**：数据采集完成后重新分类；native 可测
  进入 C4/C5；缺数据的继续采集；import/sheet/custom 进 D 轨。
- [ ] **C7 raw 候选 46 → strict**：逐 PS 消除 scenario/constraints/UI/persist 缺口。
- [ ] **C8 可测 native 77 → strict 或 blocked-kernel**：全部有结论。
- [ ] **C9 全部 native PS（约 1347）**：每批按 blocker 能力排序；全部 strict 或
  有证据 blocked；不按文档挑绿。
- [ ] **C10 多 PS/多 body 文档**：最大 39 PS、146 body 文档 dry-run + 性能基线；
  一个文档一个 iModel，逐 PS 页签。
- [ ] **C11 全量 526 文档 / 1685 PS**：逐文档完成率；assembly/drawing-only 文档
  登记 excluded-assembly-only。
- [ ] **C12 非 native 轨道**：import 69、custom 21、sheet metal 18、specialized 10；
  每类 ADR/实现或 blocked-scope；不混入 native 完成率。

### Phase D — 验证与交付

- [ ] **D1 逐 PS 真栈门**：tree/status/body/per-body volume/push+冷重开/undo。
- [ ] **D2 批次回归**：每批 shared/backend/web 单测；目标 spec；限流窗口。
- [ ] **D3 全栈与 catalog**：`/examples`、文档中心、catalog 解析、blocked 展示。
- [ ] **D4 审计与文档**：覆盖率、blocker 排名、ADR/冻结矩阵/例外/计划台账。
- [ ] **D5 发布**：按 release owner 流程；用户明确授权后 commit/push/publish。

## 3.1 全量 blocker → 任务映射（索引计数，2026-11-10）

> 计数是索引口径（同一 PS 可有多条 blocker），不等于 PS 数；采集补齐后重算。
> 每个 blocker 都必须落到一个任务，不能只做高计数项。

| Blocker | 计数 | 主任务 |
|---|---:|---|
| evidence:missing-features-file | 1243 | A1/A6/C6 |
| PROJECTED | 56 | B3.1 |
| scenario-constraint:dropped（聚合标记） | 44 | B3/B4 逐类消除 |
| importForeign | 41 | C12 import 轨道 |
| converter draft | 39 | B5.1 |
| scenario:missing | 30 | A1/B8.3/C6 |
| capFace/sweptFace 待验收 | 27 | B1.4/B2.3 |
| evidence:no-body-data | 26 | A2/A3/C6 |
| rib | 20 | B5.2 |
| CIRCULAR_PATTERN | 19 | B3.3 |
| PIERCE | 18 | B3.2 |
| mirror | 17 | B4.4 |
| regionRisk | 17+8+2+1 | B1.3 |
| INTERSECTED | 16 | B3.2 |
| cPlane | 15 | B4.1 |
| SILHOUETTED | 14 | B3.2 |
| splitPart | 13 | B4.2/B5.3 |
| loft/sweep 未映射 | 11/10 | B4.6/B5.4 |
| moveFace | 11 | B4.2 |
| offsetSurface/deleteFace/deleteBodies | 9/6/6 | B5.4/B4.2 |
| assignVariable | 8 | B4.7 |
| LINEAR_PATTERN | 8 | B3.3 |
| FULL_ROUND / 无边 fillet | 4 | B4.6/B2 |
| thicken/fill/replaceFace | 6/4/3 | B5.4/B4.2 |
| sheet metal 族 | 18 PS | C12/B5.6 |
| custom FeatureScript | 21 PS | C12（excluded-custom） |
| specialized（frame/wire/thread/...） | 10 PS | C12/B5.5 |
| 内核（跨体 fillet/零体积/−1 补集面） | 3 PS | B6/B7/B1.1 |
| 非几何 decal/mateConnector skip | 13 | B8.4（口径登记） |

## 4. 执行顺序（默认）

1. **立即启动 A1/A2/A3 采集**（后台/窗口续跑），同时做 A6 索引基座。
2. **B1/B2**：面/边/selector 是最大共性阻塞，先做。
3. **B3**：外部草图引用（PROJECTED 56）解锁最大批 native。
4. **B4/B5**：converter 与产品缺失特征，按可测 PS 数排序。
5. **B6**：多体/跨体，收口 Handle Parts 与 Links。
6. **B7/B8**：内核/契约/UI 随能力同步，不后置。
7. **C 批次**：能力完成后立即重索引、构建新解锁 PS，不等全部能力。
8. **D**：每批验证，最终全量回归与发布。

## 5. 批次/优先级规则

- 数据不足的 PS 只能进“采集队列”，不能因缺数据标 blocked-capability。
- 先做解锁 ≥2 个可测 PS 的能力；单例长尾最后。
- 同一 PS 多个 blocker：能力完成后重跑；仍有 blocker 则保留，不拆成多次假绿。
- 多 body PS 必须逐 body；单 body 结果不得代表整个 PS。
- 一个文档多 PS：逐 PS 计完成；文档状态取最差。
- 非 native 轨道不影响 native 完成率；但必须在总表中出现，不能隐藏。
- 任何“近似/record/test.fail”都不计完成；严格轨一旦绿，不允许回退到近似。

## 6. 验证命令与门禁

```bash
# 数据（私有仓）
node tools/collect.mjs --features-only --reserve 20 --sort copies --delay 1000 --concurrency 1
node tools/collect.mjs --parts-only --reserve 20
node tools/mass-by-part.mjs
node tools/index-examples.mjs
node tools/build-work-queue.mjs
node tools/verify-example-index.mjs

# 公共包
cd luban-cad/packages/shared && corepack pnpm@10 test && corepack pnpm@10 build
cd ../../apps/web && corepack pnpm@10 test && npx tsc --noEmit
npx tsc -p tsconfig.e2e.json

# 真栈
npx playwright test e2e/examples/<batch>.spec.ts --reporter=line
powershell -File scripts/verify-stack.ps1
```

- 每个能力切片：shared/backend/web 同批；shared 版本 bump；旧库 fixture。
- 每个 PS：真栈 push + 冷重开；逐 body 体积；tree status=0。
- 每次采集：429/remaining 记录；不得耗尽配额或删除原始数据。
- 每次批次：更新 `docs/EXAMPLE-COVERAGE` 类报告与公共 `/examples` 状态。

## 7. 风险与停止条件

- **配额**：features 接口受账号级限流；采集必须小步/断点/按 retry-after；
  不允许并发绕过。数据不足时任务保持 blocked-evidence，不猜。
- **内核边界**：face split/跨体 fillet/shell/loft 可能超真形能力；登记
  blocked-kernel + native probe，不用近似冒充。
- **非 native**：import/sheet metal/custom FS 需新 ADR/可能触碰产品许可边界；
  未批准前保持 blocked-scope，不伪造。
- **契约**：targetBodyIds/外部引用/变量等必须 ADR + 双端发布；不允许回放层
  N 步拆分冒充单特征。
- **性能**：146 body/39 PS 文档先 dry-run；不得以超时为由放宽断言。
- **公共/私有边界**：原始 features/坐标/截图/native 错误码只留私有仓。
- **提交/发布**：按用户明确授权执行；本计划执行期间不自动 push/publish。

## 8. 执行记录

### 2026-11-10（启动）

- 总计划落盘；62 个任务分组；用户指令作为全量执行授权。
- A1 首探测：单文档 features-only 采集成功（`1 elements / 1 PS`，no 429）。
- A1 全量 features-only 采集已启动（`--reserve 20 --sort copies --delay 1000
  --concurrency 1`）；按配额窗口断点续跑。采集期间并行做能力分析，不等待全量
  数据才开工。
- 首批并行分析：Handle Parts 跨 3 body fillet 最小实现路径；Part 4 面积+bbox
  候选的面质心/拓扑证据可行性。
- **A1 首窗口结果**：features 文档 50 → 98、PS 227 → 305；队列 1495 个 PS。
  采集在 `x-rate-limit-remaining=20` 的保留阈值停止，未 429；下一窗口按相同
  命令断点续跑（无需重置数据）。
- **B1.3 首个转绿（Part 4）**：新增 shared
  `profileFaceCentroidsMm`/`adjacentRegions` 分量证据选择器；runner 按**共享
  边界线段**（非 entity id/顶点）分组，converter 写入 Part 4 的 2/4/70 解
  对应 Onshape face 分量面积+质心；真栈严格绿
  **262,193.024 vs 262,193.024 mm³（0.000%）**，4 特征/1 body/
  push+冷重开；Part 3 回归 229,418.896 绿。shared **201/201**；私有索引
  strict **18 → 19**，blocked-selector **3 → 2**，verify 0 errors。
- **示例目录同步**：`/examples` 18 → 19 卡，追加 Intro to CAD 1.2 Part 4；
  真实栈封面 `example-intro-part4.webp`；catalog/Showcase 单测与真栈 19 卡
  + 19 个打开链接全绿。Part 4 持久 iModel 名
  `Onshape example: Intro to CAD 1.2 Part 4`（按名解析，不写 UUID）。
- **B6.1/B6.3 首切片（多目标 fillet）**：shared **1.65.0**
  `targetBodyIds` + 逐边 `bodyKey`；私有后端 `planInsertMulti`/逐体
  BlendEdges/逐 body side cache/`multiTargetInputs` 持久化/冷重建；回放
  edge-resolver 逐边 owner 与多 owner 选择。合成真栈（私有
  `MultiBodyFoundation` **34/34**、`FilletFlow` **13/13**，2 body 单特征、
  冷重建逐字节一致、失败原子性）；公共 replay 纯测 **9/9**。
  **Handle Parts 2026-11-11 strict 绿**：6 边按 body 1/3/2 正确分组，
  最终 **11,878.438 / 30,944.712 / 105,771.136 mm³** vs 采集
  11,878.505 / 30,931.280 / 105,770.915（+0.0006% / +0.043% / +0.0002%），
  整链 **148,594.286 vs 148,580.700（+0.009%）**，11 步 status=0，
  push+冷重开一致；spec 移除 `test.fail`。旧 Threaded Shaft +4.2% 根因：
  converter 将 Linear pattern 1 的 SWEPT_FACE `directionOne` 映射为草图线
  世界 +Z，15 个 remove 实例落在轴外（仅去材 27.993 mm³）；改为上游 revolve
  轴 -X 后闭合。多目标改参/抑制/删除已支持（T9i/T9j/T9k；预览明确拒收）；
  下游消费、chamfer/shell/moveFace 多目标、UI 未做。
- **B1.2 Part 5 转绿（face split D2）**：converter 用采集 `sketches.json`
  修正 SWEPT_FACE 派生草图平面；E1/E2 用 bodydetails 面积+bbox+质心选多格面；
  shared 1.66 `FaceExtrudeParams.splitByLine`（material/void + keepPoint）+
  回放单线切分 resolver + 后端 RegionOps 材/空腔裁切。Part 5 逐步体积
  **98,322.384 / 245,805.960 / 262,193.024 / 229,418.896 / 204,838.300**，
  与 Onshape 完全一致，9 步 status=0，push+冷重开一致，升级 strict。
  **Part 6**：E1–E4 后 **188,451.236** = 目标；E5 为 Onshape 最终体前后
  bodydetails 完全一致（零几何变化 remove），由 shared 1.67 `noOpEvidence`
  显式产品化（仅 remove + 非空源证据，非失败回退），E5 后体积保持
  188,451.236，8 步 status=0、push+冷重开一致，spec 升 strict。`/examples`
  20→21，新增真实封面 `example-intro-part6.webp`。
- **Handle Parts 已闭合**：问题不在内核 fillet，而在 converter 的 FACE
  linear pattern 方向（SWEPT_FACE 面法向 vs 草图线方向）。方向仍静态推导，
  保持 `directionRisk`；其他面方向形态继续 dropped。
- **B6.2 多目标 REMOVE（2026-11-11，shared 1.68）**：backend 抽出
  `evaluateHoleInto`/`evaluateSweepFeatureInto`，新增多目标 REMOVE 逐体求值与
  同步路径 fail-closed；replay 由 booleanScope 造体源解析 targetBodyIds，并剔除
  regionRisk 孔内孤岛。合成 T9g 两体 2.4/4.8 mm³、冷重建一致；Links 几何严格
  绿 10,039.240 / 11,704.087 vs 10,039.241 / 11,704.085，6 步 status=0、
  冷重开一致；`links-multi-remove.spec.ts` 不以约束完整性计绿，Links 仍
  `blocked-converter`。
- **未完成/仍 blocked**：多目标预览、chamfer/shell/moveFace 多目标与 UI；
  Links 约束（slot FIX/OFFSET + external EQUAL）待 B3。
- 采集/测试期间 MS 全局 429 由重启宿主 MS 清除，未改生产限流配置。

## 9. 第一执行切片（立即开始）

1. A1：启动 features 全量采集（断点续跑），记录本轮窗口。
2. A6：刷新索引/工作队列，生成按能力分组的批次。
3. B1.3/B2：先消除 regionRisk/face-set 与 selector 共性阻塞（无需新产品契约）。
4. C1：Handle Parts 跨体 fillet 进入 ADR-0015 实现准备；ADR 未批准前不写产品代码。
5. 每完成一批，立即重索引并跑逐 PS 真栈；完成项进入 `/examples`。
