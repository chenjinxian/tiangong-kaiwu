# native-② 报告：entry 全链坐标追踪定界（poisoned-state §5.1 跟进）

- 仓/分支：`D:\Github\imodel-native` @ `native-assault`；`D:\Github\tiangong-kaiwu` @ `native-assault`
- imodel-native commit：`4a98c0820` `fix(psbrep): Sweep case createSheet 语义对齐官方——region 剖面出 solid（native-assault ②）`
  （+`BRepCore_Tests.cpp` 回归 `SweepSheetFlag_SolidVsSheetContract`）
- 方法：临时 printf 插桩 PSBRepCreate.cpp 五个观测点（L1 解码/L2 进核前/L3 体产出/L4 序列化前/L5 brep entry 回读往返），全量构建 + replace-imodeljs-native.ps1 部署后由 modeling-server tsx 探针驱动真实 `db.createBRepGeometry` 链；插桩已全部清理，探针脚本已删。

## 结论（一句话）

**坐标从未丢失**——出链/回链每一层坐标都精确保持；「interior 工具不切削」的真身是**体语义缺陷**
（sheet vs solid），双因子：

| 因子 | 层 | 内容 | 状态 |
|---|---|---|---|
| 1 | imodel-native `PSBRepCreate.cpp` Sweep case | 官方 `createSheet = IsAnyRegionType ^ 1`（ida 直证 :1254-1258），原接线漏取反 → region 剖面恒出零厚 sheet | ✅ **本仓已修**（4a98c0820） |
| 2 | tiangong `modeling-server/src/feature/FeatureEngine.ts` `sweepProfile` | 闭合点去重（`pts.pop()`）→ Loop 内单条**几何开线**（4 点首尾不重合）→ ACIS ewire 有缺口 → `api_skin_wires` 端盖失败**退化回 sheet**（AcisCreate.cpp 注释实证的回退路径） | ❌ 待 tiangong 一行修（见下） |

两因子任一存在，sweep 产物都是 sheet；base 与工具**都是壳**时，内嵌工具的壳面与 base 壳面
**几何不相交**（虽体足迹重叠）→ Subtract 恒 no-op。角点/跨界工具的壳面与 base 壳面相交
（共面搭接或横穿）→ 仍可剪——这就是「corner 可切、interior 不可切」假坐标丢失表象的来源。

## 全链坐标表（探针实跑，interior 工具 [0.5,1.5]² 剖面 + z 路径 [0,3]）

| 层 | 观测点 | 实测 | 判定 |
|---|---|---|---|
| L1 | `Reader::Get(edOp, geometry, true)` 解码 profile entry | 逐点 (0.5,0.5,0)(1.5,0.5,0)(1.5,1.5,0)(0.5,1.5,0)，bt=2(Outer) | ✅ 无损 |
| L1 | 解码 path entry | (0,0,0)→(0,0,3) | ✅ 无损 |
| L2 | `curveFromGeometry` 进核前 profile/path | 同上 | ✅ 无损 |
| L3 | `BodyFromSweep` 产物体 | world=local x[0.5,1.5] y[0.5,1.5] z[0,3]（位置正确；type=1 sheet ←因子 1） | ✅ 位置 / ❌ 语义 |
| L4 | `appendBRep` 序列化前 | 同 L3 | ✅ 无损 |
| L5 | 写出的 ParasolidBRep entry 立即回读 | world=local 同 L3 | ✅ 无损（flatbuffer 回链往返零损失） |
| L1′ | 下一跳 Subtract 的两 entry 解码 | base [0,2]²×[0,1] / 工具 [0.5,1.5]²×[0,3] | ✅ 无损 |

E1a（JS 编码侧）：`BentleyGeometryFlatBuffer.bytesToGeometry` 对 JS 自产 entry 字节解码
（同 schema）与 C++ 解码一致——entry 字节本身含正确坐标，排除 core-common 编码层。

## 探针矩阵（修复 1 后实跑；`cut==disjoint` = no-op 未切削）

| 剖面形态（JS 侧构造） | sweep 产物 | Subtract interior | 判定 |
|---|---|---|---|
| A 现状：Loop+单 LineString 4 点（闭合点去重） | type=1 sheet | no-op（==disjoint 参照） | 复现缺陷（因子 2 在） |
| B 修复形态：同上但首点重复在尾（5 点闭合链） | **type=0 solid** | **切削**（cut≠disjoint 参照；cut≠base） | ✅ 双因子齐修即愈 |
| （对照）native-① CreateRectangle 四段链 + createSheet 直调 | solid/sheet 随旗标 | — | 与 B 臂同族互证 |

注：C 臂（4 条 LineSegment3d 分四 entry）为探针构造失误（只取 entries[0] 单段），数据无效弃用；
native-① 已用同构形态在内核面钉过。

## 回归（imodel-native @4a98c0820）

- `BRepUtilTests.SweepSheetFlag_SolidVsSheetContract` 四臂：
  ① region 闭合链+solid 请求→SOLID+体积 0.75；② 同剖面+sheet 请求→SHEET；
  ③ **开线**（JS 现状形态）+solid 请求→退化 SHEET（把因子 2 的内核面机制钉死）；
  ④ **闭链**（JS 修复形态）+solid 请求→SOLID+体积 0.75。
- `BRepCoreTest` 30/30 绿（native-① 29 + 新 1）；`PSBRepGeometryTest` 全绿。
- 附带实证：`CurveVector::IsClosedPath()` 按**边界类型**返回（开线 Outer 也 true），
  几何缺口只在 ACIS ewire 层暴露——JS 侧任何「以 IsClosedPath 为据」的守卫挡不住本缺陷。

## tiangong 侧待办（跨仓，未在本任务动）

1. **一行修**：`FeatureEngine.ts` `sweepProfile` 不再 pop 闭合点（或显式补 `pts[0]` 到尾），
   送几何闭合链；配合已部署的 native 修复即出 solid、Subtract 真切削（探针 B 臂已实证形态）。
2. **钉子翻转**（native 修复+上述一行修落地后按注翻）：`FeatureEngine.test.ts` 末尾
   「真 fully-interior 工具不切削」describe 的 `interior == disjoint` 断言、
   「中毒态铁证」内标注「修复后翻转」的行为钉、以及文件头风险 #10 前提复核注释。
3. **风险 #10 重新表述**：本任务解决的只是「interior 不切削」现象本体；
   EDE root=链尾特征不传播（params 臂陈旧体/suppress 臂静默丢写）是**另一独立 native 缺陷**，
   仍开放（imodel-native backlog ③），与本修复无关。

## 定界地图（本任务后）

| 层 | 状态 |
|---|---|
| JS `ElementGeometry.Builder.appendGeometryQuery` 编码 | ✅ 字节含正确坐标（E1a 双端解码互证） |
| entry → `Reader::Get(…, applyValidation)` 解码 | ✅ L1 无损 |
| `PSBRepCreate.cpp` Sweep case 接线 | ❌→✅ **因子 1 已修**（旗标反，非坐标层） |
| `BodyFromSweep`（站位剖分+api_skin_wires） | ✅ 位置无损；开线端盖失败退化 sheet=契约行为（③臂钉） |
| 回链 `appendBRep`/flatbuffer/再解码 | ✅ L4/L5/L1′ 无损 |
| 体语义（sheet vs solid） | **真丢失层**：因子 1（已修）+因子 2（tiangong 待一行修） |

## 产物存档

- 插桩运行原始日志（run1 全链五层打印 / run4 形态矩阵）：`imodel-native/out/cmake/na2-probe-run1.log`、`na2-probe-run4.log`、`na2-probe-final.log`（out/ 不入库，临时档）。
