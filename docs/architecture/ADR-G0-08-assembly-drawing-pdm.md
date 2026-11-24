# ADR-G0-08：装配 / 工程图 / PDM 边界

> 状态：**Proposed under owner directive 2026-11-24; not ARB-signed**
> 日期：2026-11-24
> 关联：`G0-DECISION-REGISTER.md` D0-8、`G0-SPIKE-REGISTER.md` S0-7/S0-10、`10-ARCHITECTURE-HARDENING-PLAN.md` WS-K（K1–K7）与 WS-D（D5/D8/D9）、`09-INDUSTRIAL-TARGET-ARCHITECTURE.md` §10、`../research/lubancad-architecture-assessment/05-RENDERING-AND-ADJACENT-DOMAINS.md` §3/§4、`07-KERNEL-AND-NATIVE.md` §2/§8
> 影响面：装配 occurrence/GeometryPart、Drawing/HLR、BOM/Where Used、PDM/release、typed Tab/WorkspaceModule、版本引用、内核边界
> 本 ADR 只使用公开、脱敏事实；不含私有源码、密钥或 native 构建证据。

---

## 1. 背景与当前事实

1. **D0-8 的方向**：装配实例/只读显示先行；Mate/3D 求解器、HLR、尺寸/表格/BOM/PDM 后置到独立产品域，独立 ADR。
2. **装配当前状态**：
   - 应用无 Assembly 模块/路由；`PartStudioTabs` 把 Assembly 视为 unsupported；`ui.assemblyEdit` 仅为 gated。
   - 后端只有极小 IPC `createAssembly/listAssemblies`（创建/列举 `PhysicalModel`，无调用者），没有 occurrence、Mate、BOM 语义。
   - BIS 有 `PhysicalModel/PhysicalElement/PhysicalType/GeometryPart`、`appendGeometryPart3d`、`ElementRefersToElements`，标准 `TransformElementsTool`/`basicManipulationIpc` 可表达“刚性实例 + 变换”；缺的是 occurrence 数据模型、typed tab、装配 RPC/树/undo，不是方向性冲突。
   - 内核**没有 BRep 实例化**（重复零件深拷贝），大装配内存/性能未证明；干涉检测无空间索引/批量通道。
   - 无 Mate/MateConnector 数据模型，无 3D DOF 求解器；2D 草图求解器（libslvs/绳墨）不能直接求解 3D 刚体 Mate。
   - 公开语料审计：mates=0，BOM 元素无载荷，Drawing APPLICATION 元素 0 载荷——装配/工程图目前**没有可对拍的语义 oracle**。
3. **工程图当前状态**：
   - 应用无 Drawing 模块/路由；只有 gated 占位。
   - iTwin 有 `DrawingViewState/SheetViewState/ViewCreator2d/SectionAttachment` 等 2D 显示原语，但没有“从 3D 自动生成工程图”的视图生成/标注语义；`SectionAttachment` 源码标注仅测试用途。
   - 内核只有单面平面片→曲线提取，**没有一般 BRep 的矢量 HLR/可见隐藏轮廓**；不能用 facet 轮廓冒充精确工程图。
   - BIS 有 `DimensionAnnotation2d` EC 类但 TS 未暴露、DgnPlatform 尺寸 handler 未绑定；无 GD&T/Datum/PMI；`TableAnnotation2d` 无渲染 handler；无 DWT/DWG/DXF/PDF 图纸导出。
   - 公开语料中 29 个 Drawing APPLICATION 元素 0 载荷，不能作为生成器 oracle。
4. **PDM 当前状态**：无 ReleaseCandidate/Release/ReleaseItem/Approval/Revision/PartNumber/BOM/WhereUsed 服务；没有独立发布事务模型。把发布状态写入 changeset ExtendedData 会污染不可变账本，禁止。
5. **内核边界**：装配实例、Mate、BOM、图纸投影、文件转换属于产品/服务层；`SolidKernel.h` 只提供几何，不含产品子系统。装配/工程图不得塞进 Part Studio 特征链。

---

## 2. 决策

### 2.1 装配第一阶段：只做实例结构与只读装配树

1. 使用 BIS `occurrence`/`GeometryPart`/placement/`sourceRef` 表达刚性实例；共享原型 + occurrence transform，不复制几何、不在内核里建装配树。
2. 新增 typed Assembly tab（`WorkspaceModule` 注册），提供只读装配树；实例变换编辑只走标准工具/事务（`TransformElementsTool`/`basicManipulationIpc` 或后续标准装配 RPC），不得自建第二套 undo/选择。
3. **不做** Mate/Relations、BOM/爆炸/显示状态/仿真、干涉/大装配优化；这些是后续独立轨道。
4. 跨工作区/版本引用在 D5 版本只读打开与 D8 refs 可用前不承诺“版本钉住”；引用不可解析时 fail-closed，不展示假引用。
5. 实例性能与冷重开必须按 S0-7/K1 验收；BRep 无实例化的事实必须写入能力边界，不得宣称大装配性能已达标。

### 2.2 工程图第一阶段：只读显示既有 DrawingModel

1. 使用 iTwin 2D `SheetViewState`/`DrawingViewState`/`ViewCreator2d` 只读显示既有 DrawingModel/Sheet；产品可以新增 Drawing tab/路由，但只做显示与保存/冷重开，不做自动生成。
2. 静态文本/引线可以存在，但必须明确“非关联”；不得假装尺寸/标注随模型更新。
3. **不做**自动视图生成、HLR、剖视填充、详图/断裂、尺寸/GD&T、表格/BOM、PMI/MBD、DWT/DWG/DXF/PDF 导出；这些都需要独立引擎/数据模型/许可。
4. `SectionAttachment` 仅测试用途，不得作为产品工程图生成器。

### 2.3 Mate/3D 求解器是独立产品域

1. Mate/Relations 必须有独立 3D 求解器、DOF/失败语义、MateConnector 数据模型与独立 ADR；不得复用 2D 草图求解器，不得把 Mate 塞进 Part Studio 特征链。
2. 求解器后端（自研/第三方）需单独许可、性能与数值稳定性评审；不得让求解器细节泄漏到业务层。
3. 在求解器 ADR 与真栈证据前，不做 Mate UI、不做“假装配约束”。

### 2.4 HLR/工程图生成是独立 DrawingService

1. 自动视图/HLR/投影/剖视/尺寸/表格由独立 `DrawingService`/HLR 引擎负责；必须先有 HLR Spike（S0-10）与独立 ADR。
2. 禁止用 facet 轮廓、视口截图或近似投影冒充精确工程图；工程图输出必须可诊断、可复现。
3. 在 HLR 可用前，不做“自动生成视图”的 UI，也不承诺尺寸关联。
4. DWG/DWT/DXF/PDF 导出属于工程图域，需独立格式/许可裁决（与 `ADR-G0-07` 的导入导出边界区分）。

### 2.5 BOM/Where Used/PDM 是独立产品域

1. BOM 聚合、part properties、Where Used、发布状态机必须是独立服务/数据模型；PDM 至少包含 ReleaseCandidate/Release/ReleaseItem/Approval/Revision/PartNumber/BOM/WhereUsed。
2. PDM 记录绑定 Version/真实 checkpoint，不写 changeset ExtendedData 自由 JSON；发布/审批/审计用独立事务与 outbox，具备幂等 PLM 连接器。
3. BOM 依赖 part properties、引用索引（D9）与 Version/checkpoint；在装配实例与引用模型稳定前不启动 BOM 产品面。
4. PDM 的权限/审计/保留策略独立于模型编辑权限；不得把发布状态当作 changeset 元数据或 Part Studio 字段。

### 2.6 域边界不变量

1. 装配/工程图/PDM 的元数据不得塞进 Part Studio 的 `JsonProperties`；使用独立 typed tab/EC schema（如 `LubanAssembly`/`LubanDrawing`）与独立服务。
2. 不得在 `SolidKernel`/native 中实现装配树、Mate、BOM、图纸投影或 PDM。
3. 不得把装配/工程图作为 Part Studio 特征类型或特征链分支；每个域有自己的事务、undo、权限、证据与能力账本。
4. 新工作区必须通过 `WorkspaceModule`/typed Tab 注册，不得修改 Part Studio 内部来“兼容” Assembly/Drawing。
5. 版本引用统一用 `{documentId, changesetId/versionId}`；名称只作展示；无只读版本打开路径时不得宣称引用可用。

---

## 3. 备选方案与拒绝理由

| 方案 | 内容 | 结论 |
|---|---|---|
| A | 实例/只读显示先行，Mate/HLR/BOM/PDM 后置 | **接受**：符合 BIS 底座能力，避免在无 solver/HLR/oracle 时铺产品面 |
| B | 同时做 Mate + HLR + BOM + PDM | **拒绝**：三个 XL 子系统，无求解器/HLR/语义 oracle，必然返工 |
| C | 把装配当 Part Studio 多 body | **拒绝**：破坏单特征图/事务边界，无 occurrence 身份，后续 Mate/BOM 无法演进 |
| D | 复用 2D 草图求解器做 Mate | **拒绝**：DOF/几何语义不同，会产生错误约束与不可解释失败 |
| E | 用 facet 轮廓/截图做 HLR | **拒绝**：不是精确工程图，无法满足尺寸/关联/导出 |
| F | 先做假装配/假图纸 UI | **拒绝**：违反“禁止假 full/假成功”，制造不可用引用与错误承诺 |
| G | PDM 状态写入 changeset ExtendedData | **拒绝**：污染不可变账本，破坏审计/版本/回滚 |
| H | 在 native 内核实现装配/工程图 | **拒绝**：违反内核只提供几何的边界，产品子系统不可维护 |

---

## 4. 后果与风险

**正向**

- 用 BIS 已有 occurrence/GeometryPart 底座先交付“结构 + 只读”，不等待 Mate/HLR。
- 明确把 Mate/HLR/BOM/PDM 放到独立域，避免它们污染 Part Studio 特征链/内核。
- 版本引用、BOM/Where Used、PDM 的依赖关系被提前写出，减少后期返工。

**代价/风险**

- 产品在装配配合、工程图自动生成、BOM/PDM 上长期缺能力；必须诚实对外。
- 实例结构仍需 typed tab、装配树、版本引用、权限与性能工作；BRep 无实例化会限制大装配。
- 只读工程图依赖既有 DrawingModel；没有生成器，用户不能从 3D 自动出图。
- BOM/PDM 依赖 part properties/引用索引/Version/checkpoint；这些前置未完成前不能承诺发布日期。
- 如果先做 ad-hoc 装配数据模型，未来 Mate/BOM 会重写；本 ADR 的边界必须由评审/CI 守住。

---

## 5. 迁移、回滚与失败判据

### 5.1 迁移

1. 所有装配/工程图 schema 采用 additive/版本化；旧文档不含新 tab 时行为不变。
2. 装配 occurrence/GeometryPart 模型变更须有 `schemaVersion`、旧 fixture、迁移 dry-run/verify/rollback；不得静默重写旧文档。
3. 工程图只读显示不写模型；未来生成器/标注数据必须独立 schema 与迁移，不得塞进 Part Studio params。
4. PDM 使用独立数据库/服务；旧文档无 PDM 记录时视为未发布；迁移/回滚不得改写 changeset 历史。
5. 版本引用迁移以 `{documentId, changesetId/versionId}` 为键；旧名称引用只作展示，不伪造解析。

### 5.2 回滚

1. 装配/工程图模块通过功能开关/路由关闭；已写入的 tab/数据保留但只读/隐藏，不删除历史。
2. schema 回滚采用 additive 兼容或迁移 CLI 的 down；若 down 不可逆，必须 fail-closed 并提示导出/降级，不假装可逆。
3. PDM 回滚停止写/审批，保留历史记录只读；不得把发布状态回写成 changeset 元数据。
4. 版本引用回滚禁用解析/打开入口；不得回退成“用名称猜版本”。

### 5.3 失败判据

出现以下任一情况，本决策失败：

- 把装配/工程图塞进 Part Studio 特征链或 `JsonProperties`；
- 复用 2D 草图求解器实现 Mate，或没有 3D 求解器 ADR 就做 Mate UI；
- 用 facet 轮廓/视口截图冒充 HLR/精确工程图；
- 在 HLR/尺寸引擎可用前做“自动生成视图”或假关联尺寸；
- PDM/release 状态写入 changeset ExtendedData 或复用模型编辑事务；
- 无只读版本打开/引用解析却宣称“版本钉住”；
- 装配/工程图 schema 无版本、无 fixture、无回滚；
- 在 native/`SolidKernel` 中实现装配树、Mate、BOM、图纸投影或 PDM；
- 用假 UI/空结果宣称能力已交付。

---

## 6. 证据状态

| 项目 | 状态 | 说明 |
|---|---|---|
| Assembly 模块/路由 | **未实现** | 仅 gated 占位；无产品路由 |
| occurrence/GeometryPart 实例 | **未接线** | BIS 底座存在；无 occurrence 数据模型/树/undo |
| Mate/3D 求解器 | **未实现** | 无数据模型、无求解器、无语义 oracle（mates=0） |
| Drawing 只读显示 | **未实现** | iTwin 2D 原语存在；产品无 Drawing 路由 |
| HLR/视图生成 | **未实现** | 无矢量 HLR；S0-10 Not started |
| 尺寸/GD&T/表格 | **未实现** | BIS 类未暴露/无 handler；无 PMI |
| BOM/Where Used | **未实现** | 无 part properties/聚合/索引；BOM 载荷为空 |
| PDM/release | **未实现** | 无独立服务/状态机/审批 |
| 版本引用（D5/D8） | **未完成** | G1 状态记录 D5 仍有 X-25 残余、Gate 未签字；不得宣称引用可用 |
| ARB 签字 | **无** | 本 ADR 仍为 Proposed |

本 ADR 不把公开语料中的空载荷、规划中的 BIS 能力或 gated 占位当作已实现证据。

---

## 7. 签字与状态

- 拟制依据：业主 2026-11-24 指令（G0 ADR 草案，先文档后代码）。
- 当前状态：**Proposed under owner directive 2026-11-24; not ARB-signed**。在 ARB 签字前，本 ADR 只能作为实现约束与评审材料。
- 签字栏（待）：

| 角色 | 姓名 | 日期 | 结论 |
|---|---|---|---|
| 架构 owner | | | |
| 产品 owner | | | |
| 前端/Workspace owner | | | |
| Kernel/几何 owner | | | |
| PDM/平台 owner | | | |

---

## 8. 关联

- 决策：D0-8（装配/工程图）、D0-5/D0-15（几何持久化/迁移，间接）。
- Spike：S0-7（occurrence transform）、S0-10（HLR）。
- 工作包：K1（Assembly 实例）、K2（Mate/3D solver）、K3（BOM/Where Used）、K4（Drawing 只读）、K5（HLR/尺寸/表格）、K7（PDM/release）；前置 D5（版本只读打开）、D8（Version/Tab/Refs）、D9（reference index）、D4/D6（checkpoint/Version）。
- 例外：无直接例外条目；新增装配/工程图 schema 若未版本化，必须登记例外并给退出计划。
- 文档：`09` §10、`10` §3 WS-K/§5 G5、`05-RENDERING-AND-ADJACENT-DOMAINS.md` §3/§4、`07-KERNEL-AND-NATIVE.md` §2/§8、`G1-WAVE2-STATUS-2026-11-23.md`（D5/X-25 现状）、`ADR-G0-04`（版本/checkpoint）、`ADR-G0-05`（几何持久化）、`ADR-G0-07`（导入导出/格式许可）、`ADR-G0-11`（变量/配置边界，间接）。
