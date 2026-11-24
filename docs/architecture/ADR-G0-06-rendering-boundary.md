# ADR-G0-06：渲染边界（iTwin / PBR / DanQing / 离线）

> 状态：**Proposed under owner directive 2026-11-24; not ARB-signed**
> 日期：2026-11-24
> 关联：`G0-DECISION-REGISTER.md` D0-6、`G0-SPIKE-REGISTER.md` S0-9、`10-ARCHITECTURE-HARDENING-PLAN.md` WS-K（K8）、`09-INDUSTRIAL-TARGET-ARCHITECTURE.md` §2/§14、`../research/lubancad-architecture-assessment/05-RENDERING-AND-ADJACENT-DOMAINS.md`、`EXCEPTIONS.md` X-10
> 影响面：viewer/前端渲染路径、材质/光照数据、Render Studio 产品面、离线渲染服务、性能预算、core fork 修改台账
> 本 ADR 只使用公开、脱敏事实；不含私有源码、密钥或 native 构建证据。

---

## 1. 背景与当前事实

1. **D0-6 的方向**：iTwin WebGL 是唯一交互渲染底座；PBR/离线渲染作为独立 ADR 的可选路径；DanQing 未接入前不得作为产品渲染路径。
2. **当前交互渲染栈是 iTwin WebGL + 服务端 tile + BRep 拓扑叠加**：`ScreenViewport`、TileAdmin、CloudStorageCacheChannel、WorldDecoration 等构成 Part Studio 交互视图。该栈是当前最成熟的渲染面，但“能显示”不等于大模型/大装配可编辑。
3. **当前材质/光照能力有限**：iTwin 默认材质属于 Blinn-Phong 族；公开审计记录没有 metallic/roughness、IBL、区域光、bloom/ACES/tonemap/SSR 等 PBR 管线。`ScreenSpaceEffectBuilder` 可挂后处理，但材质/光照 shader 不能从公开 API 替换；真做 PBR 需要 fork core shader（登记修改）或走独立离线服务。
4. **DanQing 是独立客户端渲染引擎，未接入 LubanCAD**：
   - 公开审计记录其当前仍为 Blinn-Phong，PBR/IBL 未实现（截至 2026-11-04 基线），glTF metallic/roughness 只读不消费；后处理链不做 bloom/ACES/SSAO/TAA。
   - Web/WASM 产物未实现，不能直接替换 iTwin 交互视口；README 中的性能/规模数字未在本轮复测，不能当作产品证据。
   - `EXCEPTIONS.md` X-10 明确“未接入；接入需 ADR + 接口/许可/性能评审”。替换交互视口违反 P0-01（iTwin 唯一底座），属于 D 级方向性风险；作为独立离线服务才是 C 级候选。
5. **当前没有 Render Studio 产品面**：没有 PBR/IBL/AxF/OpenVDB、没有服务端渐进渲染/去噪/多视图输出，也没有材质/环境资产库。视口截图不是 Render Studio。
6. **性能约束不只来自渲染器**：公开审计记录 tile facet 实际串行、无 BRep 实例化、全 model 失效、无产品级 tessellation 档位；这些问题不能靠“换一个渲染平台”解决，换平台反而会放大与 iTwin 装饰/选择/命令槽的耦合成本。

---

## 2. 决策

### 2.1 iTwin WebGL 是唯一交互渲染平台

1. 交互式视口、选择、装饰、相机、ViewCube、剖切、BRep 叠加等全部继续基于 iTwin WebGL / `ScreenViewport` / TileAdmin。
2. **禁止**引入第二套交互渲染平台、第二套视口状态机、第二套选择/撤销体系；DanQing 或其他引擎不得替换交互视口。
3. 渲染派生数据（tile、facet、材质外观）不是模型事实源；模型/几何事实源仍是 iModel/BIS + `params`。

### 2.2 PBR 是独立 ADR，不是本 ADR 的实现承诺

在单独 ADR 裁决前，不实现产品级 PBR 管线。未来只允许两条互斥路径，且必须先裁决再编码：

- **路径 A：core-frontend shader fork**。保留 MRT pick、WBOIT、边线/拓扑叠加、合成顺序与选择语义；按 P0-02/P0-08 登记 `docs/ITWINJS_CORE_MODIFICATIONS.md`，重建 viewer `dist`，并给出升级/合并/回退方案。
- **路径 B：独立离线 PBR 服务**（DanQing 可作为候选）。以 tile/场景快照为输入，输出静帧/图片/EXR；不参与交互视口，不改模型，不成为第二套几何事实源。

两条路径的取舍至少覆盖：选择/MRT/WBOIT/边线保真、性能与显存、core 升级成本、许可、资产库、作业队列与回滚。不得同时并行两套 PBR 实现来“先做出来再说”。

### 2.3 DanQing 保持独立，仅作离线候选

1. DanQing 在接入 ADR 通过前保持独立仓库/独立引擎，不作为 LubanCAD 产品渲染路径。
2. 其接入评审必须覆盖：接口（tile/场景/材质交换）、许可、性能、PBR 缺口、Web/WASM 形态、与 iTwin 选择/装饰/命令的边界。
3. 不得引用 DanQing README 中未复测的规模/性能数字作为产品证据；不得宣称“DanQing 已接入”或“可替换 iTwin 视口”。

### 2.4 不在管线裁决前做材质/Render Studio UI

1. **禁止**先做 Render Studio 材质库、环境库、外观编辑 UI、渲染队列 UI，再倒推管线。
2. 交互式显示增强（如剖切/裁剪完整化、命名视图、显示状态）可以在 iTwin 现有能力内单独立项；但不得包装成 Render Studio，也不得依赖未裁决的 shader fork。
3. 任何材质/场景数据模型必须引用模型实体（element/geometry/occurrence），不得复制一份几何作为渲染事实源；渲染输出是派生资产。

### 2.5 诚实能力与性能边界

1. 当前不具备 PBR/离线渲染/服务端渐进渲染能力；UI 与能力账本必须明确“不可用/未实现”，不得用近似截图或后处理冒充。
2. 大模型/大装配的渲染性能未证明；任何渲染路径都要有可复现的 p50/p95、模型规模、冷/热条件与失败回退，不得用新渲染器掩盖 tile/pick/求值瓶颈。
3. 视口截图、浏览器截图、单帧演示不能作为 Render Studio 或工程图输出证据。

---

## 3. 备选方案与拒绝理由

| 方案 | 内容 | 结论 |
|---|---|---|
| A | iTwin WebGL 唯一交互底座（当前） | **接受**：符合 P0-01，复用选择/装饰/事务/命令，避免第二套状态机 |
| B | 立即 fork core shader 做 PBR | **暂不选**：需要独立 ADR、fork 登记、MRT/WBOIT/pick 保真与升级成本评估；不能先做材质 UI |
| C | DanQing 替换交互视口 | **拒绝**：违反 P0-01；DanQing 无 Web/WASM、无 PBR，且与 iTwin 装饰/选择深度耦合 |
| D | 先做材质/Render Studio UI，再决定管线 | **拒绝**：会把 UI/数据模型绑到未裁决管线，返工面大；D0-6 失败判据明确禁止 |
| E | 直接上独立离线渲染服务 | **暂不选**：可作为后续独立 ADR；当前缺 PBR、作业队列、资产库与许可裁决 |
| F | 引入第二套 WebGL 渲染器 | **拒绝**：第二交互平台，重复模型/选择/撤销状态，违反平台不变量 |

---

## 4. 后果与风险

**正向**

- 交互渲染保持单一底座，选择/装饰/事务/命令不分裂。
- 把 PBR/离线/DanQing 变成有 ADR、有失败判据的独立决策，而不是先堆 UI。
- 避免把“渲染平台替换”误当成大模型性能问题的解药。

**代价/风险**

- 产品在 Render Studio/高级渲染上存在明显能力缺口；必须诚实对外，短期不能用“PBR 已支持”做卖点。
- iTwin Blinn-Phong 的视觉上限仍在；若未来选择 core fork，升级/合并成本与 fork 维护成本会持续存在。
- 若未来选择离线服务，会引入第二套资产/场景数据与作业队列；必须绑定“引用模型、不复制几何”的约束，否则有第二事实源风险。
- 当前 tile 串行、无 BRep 实例化、全 model 失效等性能问题仍在；本 ADR 不解决它们，只是禁止用换渲染器掩盖。

---

## 5. 迁移、回滚与失败判据

### 5.1 迁移

- **当前无渲染迁移**：本 ADR 不改变现有 iTwin 管线，不迁移材质/场景数据。
- **未来 core fork 路径**：登记 `docs/ITWINJS_CORE_MODIFICATIONS.md`；按 shared → editor → viewer → web 顺序重建；旧 web/viewer 不得加载新 shader 产物；提供回退到上游渲染的构建。
- **未来离线服务路径**：场景/材质作为派生资产，带模型引用；作业可取消/重试/幂等；不写模型 changeset；结果对象存储可清理。旧文档无需迁移，因为不改变模型事实。

### 5.2 回滚

- Core fork：关闭/移除 fork 渲染路径，回退到上游 `core-frontend`/viewer `dist`；不得要求用户数据迁移。
- 离线服务：功能开关关闭，停止作业队列；已有输出保留为普通资产，可删除/过期；交互视口仍由 iTwin 提供。
- DanQing：保持独立，不进入产品依赖；回滚即不接线。

### 5.3 失败判据

出现以下任一情况，本决策失败：

- 引入第二套交互渲染平台或替换 iTwin 视口；
- 在 PBR/离线管线 ADR 前做材质库、环境库或 Render Studio UI；
- 把 Blinn-Phong/后处理/截图宣传为 PBR、Render Studio 或离线渲染；
- DanQing 未接入却被描述为产品渲染路径，或用未复测数字做产品证据；
- core shader fork 未登记修改台账、未重建 viewer `dist`、无升级/回退方案；
- 渲染场景/材质成为第二套几何事实源，或渲染输出被当作模型数据；
- 无性能预算/环境说明就宣称大模型/大装配渲染达标。

---

## 6. 证据状态

| 项目 | 状态 | 说明 |
|---|---|---|
| 当前 iTwin 交互渲染栈 | **有公开审计记录** | `05-RENDERING-AND-ADJACENT-DOMAINS.md` 记录栈与限制；不是 PBR 证据 |
| PBR ADR | **未创建** | 本 ADR 只冻结边界，不裁决 core fork vs 离线服务 |
| 离线渲染 ADR/服务 | **未创建** | 无队列、无资产库、无许可裁决 |
| DanQing 接入 | **未接入** | X-10 open；无接口/许可/性能评审 |
| Render Studio 产品面 | **未实现** | 无材质/环境/输出能力；不得宣称 |
| 渲染性能基线 | **不完整** | 公开审计有大模型/装配缺口；无 Render Studio 基线 |
| ARB 签字 | **无** | 本 ADR 仍为 Proposed |

本 ADR 不把公开审计中的“能力判定”当作实现证据，也不把 DanQing README 的宣称当作复测结果。

---

## 7. 签字与状态

- 拟制依据：业主 2026-11-24 指令（G0 ADR 草案，先文档后代码）。
- 当前状态：**Proposed under owner directive 2026-11-24; not ARB-signed**。在 ARB 签字前，本 ADR 只能作为实现约束与评审材料。
- 签字栏（待）：

| 角色 | 姓名 | 日期 | 结论 |
|---|---|---|---|
| 架构 owner | | | |
| 前端/Viewer owner | | | |
| Kernel/渲染 owner | | | |
| 产品 owner | | | |

---

## 8. 关联

- 决策：D0-6（渲染边界）。
- Spike：S0-9（BRep→tile 内容正确）与本 ADR 的交互渲染证据相关；DanQing/PBR 没有对应 G0 Spike，需后续独立 ADR/Spike。
- 工作包：K8（Render/PBR）、H3/H5（facet/tile，间接）。
- 例外：X-10（DanQing 未接入）。
- 文档：`09` §2 原则 10、§14 不变量 4；`10` §3 WS-K（K8）；`05-RENDERING-AND-ADJACENT-DOMAINS.md`；`ADR-G0-05`（tile/内核持久化）；`docs/ITWINJS_CORE_MODIFICATIONS.md`（未来 fork 台账）。
