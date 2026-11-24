# ADR-G0-07：导入导出与许可边界

> 状态：**Proposed under owner directive 2026-11-24; not ARB-signed**
> 日期：2026-11-24
> 关联：`G0-DECISION-REGISTER.md` D0-7、`10-ARCHITECTURE-HARDENING-PLAN.md` WS-K（K6）与 WS-L（L1/L3）、`09-INDUSTRIAL-TARGET-ARCHITECTURE.md` §10.3/§13、`../research/lubancad-architecture-assessment/05-RENDERING-AND-ADJACENT-DOMAINS.md` §5、`07-KERNEL-AND-NATIVE.md` §7、`../parity/KERNEL-BOUNDARIES.md`、`EXCEPTIONS.md` X-08/X-09
> 影响面：导入导出作业、格式能力账本、ACIS 许可/分发、ThickenSheet 可达性、公开产物合规、作业面与配额
> 本 ADR 只使用公开、脱敏事实；不含私有源码、密钥或 native 构建证据。

---

## 1. 背景与当前事实

1. **D0-7 的方向**：mesh/DXF 先行；STEP/IGES/Parasolid 先做许可裁决；未获授权不接线、不承诺。
2. **当前格式状态（公开审计）**：
   - DXF 草图导入：可用（ASCII，LINE/CIRCLE/ARC/POINT/LWPOLYLINE/SPLINE；忽略 BLOCKS/INSERT；DWG 拒收），真栈 e2e 有导入+reload 证据。
   - mesh：底座有 `BodyFromPolyface`/`FacetEntity`/`exportGraphics`，语义上可支撑 STL/OBJ/3MF/GLTF，但**没有产品级 reader/writer**；缺单位、材质、失败回滚。
   - STEP/IGES/Parasolid：无文件 I/O；ACIS InterOp 未授权；native 无翻译器；判定为 D（ACIS 路线）或 C（自研）。
   - DWG/DWT：无二进制解析/模板交换；需 ODA/RealDWG 或自研 + 许可裁决；工程图 DXF/DWG 归 DrawingService（见 `ADR-G0-08`）。
   - 无格式转换服务/作业模型；hub 只有 iModel/通用文件，没有 CAD 文件转换；大文件需要超时/取消/配额/审计。
3. **许可边界**：
   - ACIS 授权仅 **Modeler + Polyhedra**；InterOp、healing、STEP/IGES 等未授权能力不得接线。
   - **ThickenSheet 是 blocked-license，但公开审计记录它仍是 PSBRep op16，并经 `createBRepGeometry` 的 Thicken 暴露给 JS**。这意味着许可边界目前只在文档/UI 层，native 入口 **fail-open**；外部消费者可越权调用。这是 P0-09 的 stop-ship 项。
   - **公开分发含 ACIS 的 MS 产物**（ACIS 运行库/依赖）需要法务书面结论，覆盖再分发权、第三方通知与出口分类。当前没有该书面结论，不能把“可运行”当作“可分发给外部用户”。
   - `libslvs` 为 GPL-3.0-only，当前仅纯云 SaaS 姿态（X-08），与 ACIS 分发是不同许可问题；本 ADR 不把两者混为一谈，但都属于发布前必须关闭的许可门。
4. **失败语义**：未授权能力不能只靠 UI 不显示；必须在 native/服务入口 fail-closed。近似 healing、facet 轮廓、mesh 几何不得冒充精确 BRep/STEP 结果。

---

## 2. 决策

### 2.1 近期格式范围：mesh + DXF 草图先行

1. **DXF 草图导入**继续作为已交付能力维护，明确限制（ASCII、实体白名单、无 BLOCKS/INSERT、DWG 拒收）；不得把它宣传为图纸/DWG 导入。
2. **mesh 导入导出**（STL/OBJ/3MF/GLTF）作为许可内最便宜的切片推进；mesh body 作为 **mesh 语义** 的模型内容，不强行 BRep 化，不宣称精确交换。
3. 工程图 DXF/DWG/DWT/PDF 不属于本 ADR 的近期范围；由 DrawingService/工程图域与独立许可裁决处理（见 `ADR-G0-08`）。

### 2.2 精确格式与 ACIS InterOp/healing：书面许可前一律 blocked

1. **STEP/IGES/Parasolid、ACIS InterOp/healing** 在法务书面结论前：
   - 不接线、不排产、不做“先隐藏入口”的假实现；
   - 能力账本保持 `blocked-license`/`excluded-import`，不得标 `full`；
   - 对外不承诺格式、不展示可点击的导入/导出入口来暗示可用。
2. 书面许可结论至少覆盖：许可范围、再分发权、第三方通知、出口分类、目标市场/部署形态。法务结论前，任何“第三方翻译器”或“TrueForm IO”路线也不得直接接线；它们各自需要 ADR、许可与迁移/回滚评估。
3. 禁止自研近似 healing 来“补齐” STEP/IGES；近似结果不得进入 `full` 能力或 strict 示例。

### 2.3 导入导出必须走作业面

1. 导入/导出实现为服务层 `ImportExportJob`（或等价作业），具备：格式探测、单位、装配层级、失败策略、配额、超时、取消、幂等键、审计、结果对象存储。
2. 长任务不得占用交互会话事件循环，不得在 Part Studio 编辑请求中同步转换大文件；会话面只提交作业/查询状态。
3. blocked-license 格式不得进入作业队列；作业入口在格式/许可解析阶段 fail-closed，不产生“排队后才失败”的假作业。
4. 导入结果必须带来源/格式/是否精确/provenance；若未来导入精确几何，必须与 `ADR-G0-05` 的 `format/kernel` 标签和迁移/回滚契约一致。

### 2.4 blocked-license 必须在 native/服务入口 fail-closed

1. **ThickenSheet**：在对外分发前必须二选一——从 native/IPC 暴露中移除，或在 native 与服务入口加许可门并返回稳定错误；仅隐藏 UI 不算关闭。
2. 必须补**负向 ctest**：未授权 op 在 native 入口被拒绝，且不能被 `createBRepGeometry` 等旁路调用；负向测试结果进入发布门。
3. 其他 `blocked-license`/`excluded-import` 能力同样必须在 native/API 入口 fail-closed；不得因“原生可运行”而产品化。
4. 失败必须保留旧几何、返回可诊断错误，不得假成功、静默 no-op 或用近似几何替代。

### 2.5 ACIS 依赖的公开分发

1. 对外分发含 ACIS 的 MS 产物前，必须有法务书面结论（再分发、第三方通知、出口分类）与 SBOM/许可门证据；未完成前仅限受控内部/评估使用，不做公开自助分发或生产承诺。
2. 发布清单必须能回答“产物包含哪些 ACIS 依赖、许可依据是什么、通知在哪”；不能只依赖 README 声明。
3. 若许可结论要求替换/移除某些依赖，必须给出构建/打包回滚方案；不得把未授权依赖“藏在”宿主环境或私有分发包中绕过检查。

### 2.6 诚实能力账本

1. 每个格式在能力账本中有明确状态：`full`/`approx`/`blocked-license`/`excluded-import`/`not-implemented`；证据不足不得标 `full`。
2. mesh 不是精确交换；DXF 草图不是图纸；视口/截图不是 STEP 等价物。任何“支持 STEP/IGES/Parasolid”的对外表述在许可与实现完成前都禁止。

---

## 3. 备选方案与拒绝理由

| 方案 | 内容 | 结论 |
|---|---|---|
| A | mesh/DXF 先行，精确格式许可后置 | **接受**：许可内可交付、可验证，不制造不可实现的承诺 |
| B | 立即承诺 STEP/IGES/Parasolid 全量精确交换 | **拒绝**：ACIS InterOp 未授权，且 native 无翻译器；属于 D0-7 失败判据 |
| C | 自研 STEP/healing/近似修复 | **拒绝**：近似 healing 不能作为精确交换；工作量和正确性风险不可接受，且可能引入未授权资料 |
| D | 用未授权第三方翻译器先上线 | **拒绝**：许可/分发/出口未裁决，属于合规红线 |
| E | 暂时保留 ThickenSheet 可达，等以后再关 | **拒绝**：当前就是 fail-open；外部分发前必须关闭或有许可，不能登记为“以后” |
| F | 在 MS 会话进程内同步做格式转换 | **拒绝**：大文件会阻塞交互，违反会话面/作业面分离 |
| G | 把工程图 DXF/DWG 一并纳入本 ADR 近期范围 | **拒绝**：依赖 DrawingService/HLR 与独立格式许可；应由 `ADR-G0-08` 与独立 ADR 处理 |

---

## 4. 后果与风险

**正向**

- 近期只做许可内、可验证的 mesh/DXF，避免 STEP 空承诺和未授权接线。
- 把 ThickenSheet 可达性从“文档债务”提升为发布阻断项，关闭 P0-09 fail-open。
- 导入导出走作业面，避免大文件拖垮交互会话。
- ACIS 分发许可被显式列为发布门，而不是隐含假设。

**代价/风险**

- 产品缺少 STEP/IGES/Parasolid 精确交换；销售/对标必须诚实，短期竞争力受限。
- mesh 导入导出在单位、材质、层级、精度上有损；不能替代精确 CAD 交换。
- ThickenSheet 移除/加门可能影响既有内部测试或能力账本，需要同步更新并补负向 ctest。
- 作业服务、配额、对象存储、审计带来额外平台成本。
- 法务结论周期不可控，可能长期阻塞精确导入路线。
- ACIS 依赖的分发合规可能要求打包/通知/构建变更，影响发布流水线。

---

## 5. 迁移、回滚与失败判据

### 5.1 迁移

1. **当前无精确导入数据**：不涉及 STEP/IGES/Parasolid 数据迁移。
2. **mesh/DXF**：导入的 mesh/草图作为显式模型内容（body/tab），带来源、格式、是否精确、provenance；不做隐式 BRep 化。
3. **未来精确导入**：必须先完成许可与 `ADR-G0-05` 的 `format/kernel` 标签、旧 fixture、迁移/回滚设计；不得先把未授权格式写入模型再补迁移。
4. **ThickenSheet**：移除 expose 或加 fail-closed 门；能力账本/注册表/测试同步更新；不删除历史数据（历史结果按既有几何保留，但不得再产生新调用）。

### 5.2 回滚

1. **格式功能**：通过功能开关/路由关闭导入导出作业；已导入内容作为普通模型内容保留，可删除/撤销，不重写历史 changeset。
2. **ThickenSheet**：若已移除暴露，回滚只能恢复为“仍 fail-closed”的状态；只有在书面许可覆盖后才允许重新开放，不能用一个默认开关绕回 fail-open。
3. **作业面**：停止队列/worker，取消未完成作业；已完成结果按对象存储生命周期清理；不得回滚成同步转换。
4. **ACIS 分发**：若许可结论不覆盖，回滚到不含该分发的内部构建；不得把同一产物换个渠道继续公开分发。

### 5.3 失败判据

出现以下任一情况，本决策失败：

- 对外承诺 STEP/IGES/Parasolid 或展示可用的假入口；
- 接线未授权的 ACIS InterOp/healing/STEP；
- ThickenSheet 仍可从 native/IPC/`createBRepGeometry` 旁路触达，或没有负向 ctest；
- 含 ACIS 的产物在无法务书面结论时对外分发；
- 用近似 healing/mesh/facet 轮廓冒充精确交换或 `full`；
- 只在 UI 隐藏 blocked 能力，服务/native 入口仍可达；
- 导入导出长任务在会话事件循环同步执行，或 blocked 格式进入作业队列；
- 能力账本把未实现/未授权格式标为 `full`。

---

## 6. 证据状态

| 项目 | 状态 | 说明 |
|---|---|---|
| DXF 草图导入 | **已交付（公开审计）** | ASCII/实体白名单；无 BLOCKS/INSERT/DWG；有真栈导入+reload 证据 |
| mesh 产品 reader/writer | **未实现** | 仅有 `BodyFromPolyface`/`FacetEntity`/`exportGraphics` 底座；无产品级读写器 |
| STEP/IGES/Parasolid | **blocked-license** | 无文件 I/O、无翻译器、无书面许可 |
| ACIS InterOp/healing | **未授权/不接线** | 公开边界文档明确 excluded |
| ThickenSheet fail-closed | **未实现；当前 fail-open** | 公开审计记录仍经 PSBRep op16/`createBRepGeometry` 可达；无负向 ctest 证据 |
| ACIS 公开发布许可 | **无法务书面结论** | 09/07 均记录需书面授权/通知/出口分类 |
| ImportExportJob 作业面 | **未实现** | 无格式转换服务/队列/配额/审计 |
| ARB 签字 | **无** | 本 ADR 仍为 Proposed |

本 ADR 不把“原生可运行”“公开文档判定”或“计划中的许可”当作已获授权或已实现。

---

## 7. 签字与状态

- 拟制依据：业主 2026-11-24 指令（G0 ADR 草案，先文档后代码）。
- 当前状态：**Proposed under owner directive 2026-11-24; not ARB-signed**。在 ARB 签字前，本 ADR 只能作为实现约束与评审材料。
- 签字栏（待）：

| 角色 | 姓名 | 日期 | 结论 |
|---|---|---|---|
| 架构 owner | | | |
| 产品 owner | | | |
| 许可/法务 | | | |
| Native/发布 owner | | | |

---

## 8. 关联

- 决策：D0-7（导入导出/许可）、D0-12（目标市场/合规，影响分发与出口）。
- Spike：无直接 G0 Spike；K6/L1/L3 是后续工作包。S0-10（HLR）属于工程图域，不在本 ADR 范围。
- 工作包：K6（导入导出 job）、L1（ACIS 分发/InterOp）、L3（STEP/IGES/Parasolid）。
- 例外：X-08（libslvs GPL 许可门，另行管理；不与 ACIS 混淆）、X-09（native/feature 未进托管 CI，影响负向 ctest 的持续执行）。
- 文档：`09` §10.3/§13、`10` §3 WS-K/WS-L、`05-RENDERING-AND-ADJACENT-DOMAINS.md` §5、`07-KERNEL-AND-NATIVE.md` §7、`../parity/KERNEL-BOUNDARIES.md`、`ADR-G0-05`（几何持久化/格式标签）、`ADR-G0-08`（工程图/DWG 导出边界）、`ADR-G0-12`（合规/出口）。
