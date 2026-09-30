# M2 T4.0 spike：libslvs API 事实清单（供 T4.2 slvs 原生插件消费）

- 日期：2026-09-30
- 来源：solvespace/solvespace @ `2879a02d2866e103d7a4817721ead9ac43558aea`（master，2026-09-28；`include/slvs.h` 与 v3.2 tag 逐字节一致，API 面稳定）
- 源码落位：`modeling-server/native/slvs/`（出处/许可见该目录 `VENDOR.md`；上游文件零改动）
- 验证：`modeling-server/native/slvs/verify/build.cmd`（MSVC 14.44 /std:c++17）编译+链接+运行通过，见文末「验证记录」

## 0. 一句话定论（DOF）

**DOF 有暴露**：`Slvs_System.dof`（stateless 路径）与 `Slvs_SolveResult.dof`（stateful 路径），源码公式 `dof = 参数个数 − Jacobian 秩`（`src/system.cpp` `System::TestRank`：`*dof = mat.n - jacobianRank`），非「实体自由度和 − 约束方程数」的计数法；无需自建公式表。

## 1. 类型与句柄

```c
typedef uint32_t Slvs_hParam, Slvs_hEntity, Slvs_hConstraint, Slvs_hGroup;
```
- 句柄是 32 位整数，**从 1 起，0 保留**（`SLVS_FREE_IN_3D == 0` 即「不在工作平面内」哨兵）。四类句柄各自独立命名空间（约束句柄 7 与实体句柄 7 可并存）。
- **调用方句柄取值上限**（sketch.h 内部位域约定，T4.2 分配句柄时遵守）：求解器内部把约束句柄映射为方程句柄 `v<<16`、生成的参数句柄 `v | 0x40000000 | i`（PT_ON_LINE/SAME_ORIENTATION/3D PARALLEL/3D CUBIC_LINE_TANGENT 会自动生成 1 个参数）。故**约束句柄 < 2^14**（否则 `hEquation::isFromConstraint` 的高位判定失效，坏约束归因会漏报）；**参数句柄 < 0x40000000**（顺排 1..N 即安全）。
- `Slvs_Param { h, group, val(double) }`——val 既是初始猜测也是回写出口。

## 2. Slvs_Entity 全字段（include/slvs.h:69-81）

```c
typedef struct {
    Slvs_hEntity h, group;
    int type;                  // SLVS_E_* 常量
    Slvs_hEntity wrkpl;        // 所属工作平面；3D 实体填 SLVS_FREE_IN_3D(0)
    Slvs_hEntity point[4];     // 按实体类型使用 [0..3]
    Slvs_hEntity normal;       // 圆/弧/工作平面引用的法矢实体
    Slvs_hEntity distance;     // 圆的半径（一个 SLVS_E_DISTANCE 实体）
    Slvs_hParam param[4];      // 按实体类型使用 [0..3]
} Slvs_Entity;
```

实体类型 → 参数/引用布局（依据 DOC.txt + `slvs.h` 的 `Slvs_Make*` inline 帮助函数）：

| type 常量 | 值 | param[] 布局 | point/normal/distance | 隐式方程 |
|---|---|---|---|---|
| SLVS_E_POINT_IN_3D | 50000 | [0..2]=x,y,z | — | 无 |
| SLVS_E_POINT_IN_2D | 50001 | [0..1]=u,v（wrkpl 必填） | — | 无 |
| SLVS_E_NORMAL_IN_3D | 60000 | [0..3]=单位四元数 w,x,y,z | — | **恒有 1 条：\|q\|=1**（entity.cpp:942） |
| SLVS_E_NORMAL_IN_2D | 60001 | 无参数（拷贝 wrkpl 法矢） | — | 无 |
| SLVS_E_DISTANCE | 70000 | [0]=值（如圆半径） | — | 无 |
| SLVS_E_WORKPLANE | 80000 | 无自有参数 | point[0]=原点(3D点)，normal | 无（6 自由度=原点3+姿态3） |
| SLVS_E_LINE_SEGMENT | 80001 | 无 | point[0..1]=端点 | 无 |
| SLVS_E_CUBIC | 80002 | 无 | point[0..3]=P0..P3（三次 Bezier） | 无 |
| SLVS_E_CIRCLE | 80003 | 无 | point[0]=圆心，normal，distance=半径实体 | 无 |
| SLVS_E_ARC_OF_CIRCLE | 80004 | 无 | point[0]=圆心，point[1]=起点，point[2]=终点；normal=wrkpl 法矢 | **条件性 1 条：圆心距起点=圆心距终点**（entity.cpp ARC_OF_CIRCLE；端点被 POINTS_COINCIDENT 约束成整圆、或为拷贝实体时跳过） |

- 只暴露上表 10 种；STEP/装配用的特殊点/法矢/距离（Slvs 特有）**未暴露**。
- inline 帮助函数（头文件内联，零成本）：`Slvs_MakePoint2d/Point3d/Normal2d/Normal3d/Distance/LineSegment/Cubic/ArcOfCircle/Circle/Workplane/Param/Constraint`。
- `Slvs_Is*` 谓词 17 个（`Slvs_IsFreeIn3D/Is3D/IsNone/IsPoint2D/.../IsCircle`），binding 层校验用。

## 3. Slvs_Constraint 全字段（include/slvs.h:122-140）

```c
typedef struct {
    Slvs_hConstraint h, group;
    int type;                  // SLVS_C_* 常量
    Slvs_hEntity wrkpl;        // 0=3D；否则投影到该工作平面
    double valA;               // 尺寸值（距离/比值/角度°/直径…；无尺寸约束填 0）
    Slvs_hEntity ptA, ptB;     // 点对
    Slvs_hEntity entityA..D;   // 实体槽
    int other, other2;         // 歧义消解开关（见下）
} Slvs_Constraint;
```

约束类型常量共 38 个（100000..100037，全列于 slvs.h:83-120）。每 kind 的填充槽位以 `lib.cpp` 的 `Slvs_Add*` 便捷包装为准（即**官方认定填法**），例如：

- `SLVS_C_POINTS_COINCIDENT`：ptA, ptB（点对；便捷版按实参类型自动降级为 PT_IN_PLANE/PT_ON_LINE/PT_ON_CIRCLE）
- `SLVS_C_PT_PT_DISTANCE`：ptA, ptB + valA
- `SLVS_C_HORIZONTAL/VERTICAL`：**二选一**——entityA=线段，或 ptA+ptB=两点（点对式必须在 wrkpl 内）
- `SLVS_C_PARALLEL/PERPENDICULAR/ANGLE`：entityA, entityB（线段）；ANGLE 另带 valA（度）与 `other`（反向）
- `SLVS_C_EQUAL_LENGTH_LINES/EQUAL_RADIUS/EQUAL_LINE_ARC_LEN/LENGTH_RATIO/LENGTH_DIFFERENCE`：entityA, entityB（+valA）
- `SLVS_C_DIAMETER`：entityA=圆/弧 + valA（**忽略 wrkpl，恒 3D**）
- `SLVS_C_SAME_ORIENTATION`：entityA, entityB（两个 3D 法矢）
- `SLVS_C_SYMMETRIC`：ptA, ptB + entityA=对称面/工作平面；`SYMMETRIC_HORIZ/VERT`：ptA, ptB + wrkpl（**禁 3D**）
- `SLVS_C_WHERE_DRAGGED`：ptA（把该点钉在初值上）
- `other`：ANGLE/EQUAL_ANGLE/ARC_LINE_TANGENT/CUBIC_LINE_TANGENT 的端点/补角选择；`other2`：CURVE_CURVE_TANGENT 第二实体端点选择

### 3.1 每 kind 方程数表（源码实测：constrainteq.cpp `GenerateEquations`，供理解 DOF/冗余）

| kind | 方程数（工作平面内 / 3D） | 备注 |
|---|---|---|
| POINTS_COINCIDENT | 2 / 3 | |
| PT_PT_DISTANCE | 1 / 1 | valA 必须为正（无符号距离） |
| PT_LINE_DISTANCE | 1 / 1 | 投影时有符号 |
| PT_PLANE_DISTANCE | — / 1 | 有符号 |
| PT_FACE_DISTANCE | — / 1 | |
| PT_IN_PLANE | 1 | |
| PT_ON_LINE | 1 / 2 | **生成 1 个额外参数**（线上比例 valP） |
| EQUAL_LENGTH_LINES / LENGTH_RATIO / LENGTH_DIFFERENCE | 1 | |
| EQ_LEN_PT_LINE_D / EQ_PT_LN_DISTANCES | 1 | 平方差形式 |
| EQUAL_ANGLE / ANGLE / PERPENDICULAR | 1 | PERPENDICULAR=ANGLE 的 valA=90° 特例 |
| EQUAL_LINE_ARC_LEN / ARC_*_RATIO / ARC_*_DIFFERENCE | 1 | |
| SYMMETRIC | 2 / 3 | |
| SYMMETRIC_HORIZ / VERT | 2 | 禁 3D |
| SYMMETRIC_LINE | 2 | |
| AT_MIDPOINT | 2（ptA 版）/ 1（面版）；3D 同理为 3/1 | |
| HORIZONTAL / VERTICAL | 1 | 禁 3D（ssassert→abort） |
| DIAMETER | 1 | |
| PT_ON_CIRCLE | 1 | |
| SAME_ORIENTATION | **4** | 并生成 1 额外参数；DOC 称「限制 3 自由度」——4 条方程有冗余，按秩计 |
| PARALLEL | 1 / 3 | 3D 时**生成 1 额外参数** |
| ARC_LINE_TANGENT / CURVE_CURVE_TANGENT | 1 | |
| CUBIC_LINE_TANGENT | 1 / 3 | 3D 时生成 1 额外参数 |
| EQUAL_RADIUS | 1 | |
| PROJ_PT_DISTANCE | 1 | |
| WHERE_DRAGGED | 2 / 3 | |

注意：方程数 ≠ 消去的自由度（秩才作数，冗余方程不计）；上表用于估算与审查，权威值永远来自 `sys.dof`。

## 4. Slvs_System 全字段（include/slvs.h:143-205）

```c
typedef struct {
    /* 输入（in/out） */
    Slvs_Param       *param;      int params;
    Slvs_Entity      *entity;     int entities;
    Slvs_Constraint  *constraint; int constraints;
    Slvs_hParam      *dragged;    int ndragged;   // 被拖动参数列表（软偏好）
    int               calculateFaileds;           // 1=失败时找坏约束（慢 ~O(n) 次）
    /* 输出 */
    Slvs_hConstraint *failed;     int faileds;    // 见下
    int               dof;                        // 未约束自由度数
    int               result;                     // SLVS_RESULT_*
} Slvs_System;
```

- `param[]`：**全部**参数（所有 group 都要给，他组参数按常值参与）；求解成功后**原地回写**新值。初始猜测必须有（决定收敛与多解取向）。
- `entity[]`：草图引用到的**全部实体**（含工作平面及其原点/法矢、被引用的他组实体）。缺任何一个被引用实体 → `ssassert("Cannot find handle")` → **abort 进程**（见 §7）。
- `constraint[]`：全部约束。
- `dragged[]/ndragged`：软偏好（尽量少动）；要硬锁用 WHERE_DRAGGED 约束。
- `calculateFaileds`：非 0 才做坏约束归因（代价约 n 次求解）。`failed==NULL` 时即使置 1 也不拷出。
- `failed[]/faileds`：**入参是容量，出参是数量**——`faileds` 传入数组容量，返回时被写为坏约束总数 `bad.n`（注意：`bad.n` 可能大于容量，拷贝按容量截断但计数不截断；容量取 `constraints` 即保险，slvs.h 注释同此）。`failed==NULL` 则两成员均不动。
- `dof`：出参；`TOO_MANY_UNKNOWNS` 早退时**不被写入**（保持调用方旧值）；内部另有「未计算」哨兵 −1（`suppressDofCalculation` 时，lib.cpp 的调用路径不会出现）。
- `result`：出参，五值枚举：

| 值 | 常量 | 内部 SolveResult 映射 |
|---|---|---|
| 0 | SLVS_RESULT_OKAY | OKAY（收敛且秩满） |
| 1 | SLVS_RESULT_INCONSISTENT | REDUNDANT_DIDNT_CONVERGE（冗余且不收敛——lib.cpp 把它折叠为 INCONSISTENT） |
| 2 | SLVS_RESULT_DIDNT_CONVERGE | DIDNT_CONVERGE（牛顿不收敛，秩正常） |
| 3 | SLVS_RESULT_TOO_MANY_UNKNOWNS | TOO_MANY_UNKNOWNS（Jacobian 列满溢，参数过多） |
| 4 | SLVS_RESULT_REDUNDANT_OKAY | REDUNDANT_OKAY（冗余但收敛；**解可用**） |

### 4.1 Slvs_Solve 签名与行为序列

```c
DLL void Slvs_Solve(Slvs_System *sys, Slvs_hGroup hg);   // 无返回值，一切结果在 sys 内
```

执行序列（lib.cpp）：清空全局 SK/SYS → 导入 param/entity/constraint → 每约束 `Generate`（仅 PT_ON_LINE/SAME_ORIENTATION/3D PARALLEL/3D CUBIC_LINE_TANGENT 生成 1 个额外参数）→（该组合下 ModifyToSatisfy 实际不会触发，**valA 始终被尊重**）→ 导入 dragged → `SYS.Solve(&g, &dof, &bad, andFindBad)` → 回写 result/dof/param 值/failed → 清空全部全局状态并 `FreeAllTemporary`。
- **stateless 每次调用自清理**：同一 `Slvs_System` 可反复改值重解；不同草图串行解即可。
- group 语义：只修改 `group==hg` 的参数；他组参数是常量（多草图链式引用可行）。
- DOF 判定相关：`Group g={}` 零初始化 → `allowRedundant/suppressDofCalculation` 均 false → 秩测试总是执行（`forceDofCheck=false` 默认）。

### 4.2 stateful API（同头文件并存；本任务不采用，留档）

`Slvs_AddPoint2D/AddPoint3D/AddNormal2D/3D/AddDistance/AddLine2D/3D/AddCubic/AddArc/AddCircle/AddWorkplane/AddBase2D/AddConstraint/Coincident/Distance/Equal/.../Dragged` 在**进程级全局草图**上累积（自动分配句柄），`Slvs_SolveSketch(hg, &bad)` 解算并返回 `Slvs_SolveResult{result, dof, nbad}`，`Slvs_GetParamValue/SetParamValue(uint32_t)` 读写参数，`Slvs_ClearSketch()` 清空；`bad` 为 malloc 数组、调用方 `free()`。便捷包装对非法实参调 `Platform::FatalError`→abort。**选型：stateless `Slvs_System` 路径**（无跨调用全局状态、JSON 桥直映、与 SketchSolver 三态契约对应清晰）；stateful 仅在需要增量重解优化时再评估。

## 5. 自包含性结论（实测）

**非纯 C、非零依赖。** C API（`extern "C"`）实现为 C++11（CMake CXX_STANDARD 11；实测 /std:c++17 亦过）。编译闭包 = 7 TU + 16 传递头（已 vendored），外部依赖仅：

| 依赖 | 形态 | 用途 | 上游钉子 |
|---|---|---|---|
| Eigen 3.4.0 | header-only（Core/SparseCore/SparseQR） | system.cpp 稀疏 QR/LM 线性代数 | `extlib/eigen` @ `3147391d…` |
| mimalloc | 需编译（C 源，static.c 可按 C++ 编译） | 临时内存堆（**全部 Expr 分配走它**，不可简单剔除） | `extlib/mimalloc` @ `f81bf1b3…` |
| advapi32.lib | Windows 系统库 | mimalloc 大页特权 | — |

- 无 zlib/cairo/freetype/pixman/libpng（那些是上游 GUI 应用依赖，不在求解闭包内）；无生成头（config.h 仅 GUI TU 需要）。
- MSVC 需定义：`_USE_MATH_DEFINES`（M_PI）、`NOMINMAX`、`_CRT_SECURE_NO_WARNINGS`、`LIBRARY`；C4819 码页警告（936 中文 locale）无害。
- `Platform::FatalError` 由 **lib.cpp 自带定义**（fprintf+abort），无需消费方补符号。

## 6. node-gyp 源文件清单（T4.2 binding.gyp 直接可用）

sources（相对 `modeling-server/native/slvs/`）：

```
include/slvs.h                  （头，非编译单元）
src/slvs/lib.cpp
src/constrainteq.cpp
src/entity.cpp
src/expr.cpp
src/system.cpp
src/util.cpp
src/platform/platformbase.cpp
<addon.cc>                      （T4.2 新增）
extlib: mimalloc/src/static.c   （从 mimalloc 拷入或以 include/define 引入）
```

include_dirs：`include`、`src`、`<Eigen 目录>`、`<mimalloc>/include`；
defines：`LIBRARY`、`_USE_MATH_DEFINES`、`NOMINMAX`、`_CRT_SECURE_NO_WARNINGS`（MSVC）；
link_settings（MSVC）：`advapi32.lib`；cflags：C++11 及以上（C++17 实测过）。

## 7. 硬性风险（binding 层必须处理）

1. **非法输入 = 进程 abort，不是错误码**。未知 type、句柄悬空（引用了未入册实体/参数）、HORIZONTAL/VERTICAL 用于 3D、便捷包装实参错型 → `ssassert`/`Platform::FatalError` → fprintf+abort（第一次 spike 运行即复现）。→ T4.2 必须在 C++/TS 层**先全量校验**（句柄存在性、kind 槽位、2D 约束必带 wrkpl）再调 `Slvs_Solve`。
2. **非线程安全**：全局 `SK/SYS/dragged`。→ SlvsSolver 单例内必须串行化（互斥锁或单异步队列），禁止并发 solve。
3. `faileds` 出参可能大于容量（截断拷贝但计数不截断）——按容量取 `failed[]`，按返回 `faileds` 判坏约束总数。
4. TOO_MANY_UNKNOWNS 时 `dof` 是陈旧值——binding 输出 dof 前先判 result==3。
5. REDUNDANT_OKAY(4) 是**可用解**——三态契约里应映射为 ok（附冗余警告），勿当失败。

## 8. 验证记录（verify/ 目录，2026-09-30）

`verify/build.cmd`（MSVC 14.44，/std:c++17，Eigen 3.4.0 + mimalloc 上游钉子版）编译 7 TU + mimalloc + 测试程序，链接通过，运行：

```
clean     : result=0 dof=8 faileds=0  A=(-3.0000, 0.0000) B=(8.0000, 0.0000)
redundant : result=1 dof=8 faileds=1  A=(0.0000, 0.0000) B=(5.0000, 0.0000)
  failed[0]=h20
```

- clean：距离 11 + 水平 → OKAY；11 个参数（工作平面 7 + 两 2D 点各 2）− 秩 3（距离 1 + 水平 1 + 法矢 |q|=1 隐式方程）= dof 8 ✓（含初值 (0,0)/(5,0) 的对称收敛解，无 dragged 偏好）。
- redundant：同一对点再叠垂直 → result=1（INCONSISTENT），failed[0]=h20（PT_PT_DISTANCE 被归因），参数保持初值。
- 附：D:\Github\SolveSpace\spike-build\（clone 内的一次性构建产物，未入库）。
