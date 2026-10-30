# ADR-0001: iTwin / iModel 数据模型与“文档—页签”信息架构

- **状态**：已接受（Accepted，2026-10-30：认可 B 方向，采用 C 过渡，P1 spike 作为迁移门禁）
- **日期**：2026-10-30
- **决策范围**：鲁班CAD 的领域数据模型、文档中心 IA、Part Studio 页签模型，以及 CAM/BIM 扩展方向
- **关联文档**：
  - `docs/superpowers/specs/2026-10-21-web-onshape-parity-design.md`（Document = iTwin 的成文裁决）
  - `docs/superpowers/specs/2026-09-27-cad-feature-system-decision-record.md`（D1–D8 特征系统裁决）
  - `docs/superpowers/specs/2026-09-28-cad-full-program-roadmap.md`（装配/分支合并后置）
  - `docs/api-specs/itwins.json`、`docs/api-specs/imodels-v2.json`（官方契约基准）
  - `itwinjs-core/docs/learning/`、`itwinjs-core/docs/bis/`（vendored 官方概念文档）

**决策摘要（TL;DR）**

- **现状 A**：Document = iTwin，Part Studio = iModel。
- **目标 B**：iTwin = 项目/产品/资产，iModel = 文档，Model = Part Studio/Assembly/Process。
- **过渡 C**：旧数据保留 A 兼容，新文档走 B，前端先引入 `WorkspaceRef` 抽象。
- **前置三项**：Named Version、iModel 状态诚实化、iTwin 官方 taxonomy。
- **Go/No-Go**：P1 spike 四项全过才迁移；否则维持 A，不启动全量迁移。

---

## 1. 背景

### 1.1 平台概念（官方口径）

| 概念 | 官方定义 | 管理边界 |
|---|---|---|
| **iTwin** | 资产或项目的**基础设施数字孪生**；由 iModels、实景、IoT、外部系统等**联邦**而成；可嵌套（`parentId`）；拥有 `class/subClass` 语义 | 协作与访问边界 |
| **iModel** | 基于 **SQLite + BIS** 的分布式关系数据库，描述**单一基础设施资产**；含 Models → Elements → Aspects → Relationships；有单一空间坐标系 | 版本与发布边界 |
| **Model** | iModel 内部的逻辑分区（专业/楼层/Part Studio/工序） | 职责与组织边界 |
| **Element** | 最小可寻址、可锁定、可变更单元 | 并发与变更边界 |
| **iModelHub** | iModel 的 changeset 账本、锁、briefcase、named version 服务 | 版本控制服务 |

关键官方定义：

- iTwin：“An **infrastructure digital twin** of an asset or project… may hold Reality data and one or more iModels. It may reference IOT data, GIS data, maintenance, and other IT databases.” —— `itwinjs-core/docs/learning/Glossary.md:59`
- iModel：“A distributed relational database, based on SQLite, with a schema defined by BIS. **An iModel holds information about a single infrastructure asset.**” —— `itwinjs-core/docs/learning/iModels.md:3`
- iModelHub：“Its primary purpose is **not** to hold or process copies of iModels… its main role is to maintain the sequence of ChangeSets that forms an iModel's timeline.” —— `itwinjs-core/docs/learning/iModelHub/index.md:7`
- iTwin 是联邦，不是“所有数据都进 iModel”：“**not all information belongs in an iModel**.” —— `itwinjs-core/docs/bis/guide/intro/federated-digital-twins.md:26-30`

### 1.2 本仓现状（有代码/接口实证）

| 事实 | 证据 |
|---|---|
| UI 层的 `Document` 由官方 `ITwin` 映射而来 | `luban-cad/apps/web/src/modules/documents/internal/documents.mapper.ts:5-33`；`modules/documents/types.ts:9-30` |
| 这是**成文裁决**，不是巧合 | `docs/superpowers/specs/2026-10-21-web-onshape-parity-design.md:70` |
| Part Studio 编辑器以 `(iTwinId, iModelId)` 定位 | `luban-cad/apps/web/src/config/routes.tsx:29-40`；`routes/PartStudioRoute.tsx:3-4` |
| Part Studio = iModel 没有独立成文裁决 | 仅 D6 “v1 单零件（单 PartStudio/iModel）”并称（`.../2026-09-27-cad-feature-system-decision-record.md:16`）+ 路由 + “打开工作空间”文案 |
| 一个 iTwin 下可有多个 iModel，详情页以卡片网格展示 | `clients/imodels/ImodelsClient.ts:47-59`；`document-details/components/ImodelCardGrid.tsx:30-35` |
| iModel 创建需要 baseline 初始化，通常 <1 分钟；卡住可重试（文档口径） | `docs/Architecture.md:145-158,267-298`；`README.md:105` |
| 前端只认 `initialized`，其余状态一律“初始化中” | `document-details/internal/imodels.mapper.ts:29`；`ImodelCard.tsx:49-68` |
| “保存版本”实际是 push changeset，不是 Named Version | `part-studio/components/PartStudioTopBar.tsx:180-187`；`part-studio/PartStudioPage.tsx:339-349` |
| 本地 hub 是简化实现：实测 `class:"Project"`、无 `subClass/parentId` | 2026-10-30 对 `GET /itwins` 的实测；官方规格见 `docs/api-specs/itwins.json` |
| `packages/shared` 另有一套与官方不一致的 iTwin 枚举 | `luban-cad/packages/shared/src/projects/types.ts:47,53-86` |
| 装配、分支/合并均后置 | `docs/superpowers/specs/2026-09-28-cad-full-program-roadmap.md:54,129,177,196` |

### 1.3 触发因素

1. **Onshape UI 对齐**：Onshape 的 Document 是一个版本化容器，内含多个 Part Studio/Assembly 页签；当前映射把每个 Part Studio 做成完整 iModel，页签语义与版本语义都不等价。
2. **CAD/CAM 扩展**：CAM 需要独立的制造定义 iModel，并与设计版本钉合；当前“iTwin=文档”的模型没有产品/项目/制造计划层级。
3. **BIM 扩展**：BIM 的规范映射是 iTwin=资产/项目、iModel=资产/专业模型、Model=专业/楼层；当前映射无法承载 Asset/Portfolio/Program 层级。
4. **数据积累风险**：一旦按“每个 Part Studio 一个 iModel”积累大量数据，未来迁移成本会持续上升；需要在多页签/装配/CAM 动工前决策。

---

## 2. 问题陈述

**我们是否要把当前的“Document = iTwin、Part Studio = iModel”改为“iTwin = 项目/产品、iModel = 文档、Model = Part Studio/Assembly/Process”？**

如果不改，Onshape 式多页签、文档级版本/共享、跨页签引用和 CAM 都会长期受限于“每个页签是一个完整 iModel”的结构。
如果改，需要推翻一条已记录的裁决（`2026-10-21`），并承担数据迁移、特征服务多 Part Studio 化、文档中心 IA 重做的成本。

---

## 3. 决策驱动因素

| 驱动因素 | 权重 | 说明 |
|---|---|---|
| Onshape 页签/文档语义一致性 | 高 | 文档级版本、共享、多页签是 UI 对齐的核心 |
| 跨 Part Studio 引用与装配 | 高 | 装配已后置，但数据模型必须先留对 |
| CAM 制造定义与版本钉合 | 高 | 需要独立 Manufacturing iModel + 设计版本引用 |
| BIM 扩展能力 | 中 | iTwin 的 Asset/Project 层级是平台原生语义 |
| 迁移成本与风险 | 高 | 现有 iModel/特征数据不能丢 |
| 近期交付速度 | 中 | UI 波次 W2/W3 不能无限等待数据模型重构 |
| 实现复杂度 | 高 | 特征服务、undo、tile、权限都要改 |

---

## 4. 选项

### 选项 A：维持现状（Document = iTwin，Part Studio = iModel）

**做法**：不改数据模型；继续以 iTwin 作为文档容器，每个 Part Studio 一个 iModel；文档详情页列出 iModel 卡片。

**优点**
- 零迁移；现有路由、特征服务、文档中心、e2e 全部稳定。
- 每个 Part Studio 独立 changeset 时间线、独立 briefcase、独立权限；隔离性强。
- 与 v1 “单 Part Studio/单零件”产品范围一致（D6）。
- 实现简单，UI 波次 W2/W3 可按原计划推进。

**缺点**
- 页签不是轻量对象：每个新 Part Studio 都要 baseline 初始化（实测约 35s）并维护独立 changeset/tile。
- 文档级版本不原子：一个文档下多个 iModel 各有 changeset/named version；发布“文档版本”要额外维护清单。
- 多页签需要多个 Briefcase 连接；当前前端只有一个连接。
- 跨 Part Studio 引用/装配是跨 iModel，成本高。
- iTwin 被降格为文件夹，Asset/Project/Portfolio 语义未使用。
- 数据越多，未来迁移越难。

### 选项 B：目标模型（iTwin = 项目/产品，iModel = 文档，Model = Part Studio/Assembly/Process）

**做法**：
- iTwin：`Endeavor/Project`（项目）或 `Thing/Asset`（产品/资产），可嵌套 Portfolio/Program/WorkPackage。
- iModel：一个“文档”（设计基线），一条 changeset 时间线；CAM 用同 iTwin 下的独立 Manufacturing iModel。
- Model：Part Studio、Assembly、Process Plan、Setup/Operation。
- Element：特征、零件、实体、刀路。

**优点**
- 与 Onshape 的 Document/tab 语义几乎一一对应：iModel = 文档（版本化单位），Model = 页签。
- 一个文档内多 Part Studio 共享一条 changeset 时间线、一个 briefcase、一个写者租约（D8）；多页签成本低。
- 文档级 Named Version、共享、权限天然成立。
- 跨页签引用、装配在同一 iModel 内完成。
- 与 BIM 规范映射一致（iTwin=资产/项目、iModel=资产/专业模型、Model=专业/楼层）。
- CAM 可在同一 iTwin 下建 Manufacturing iModel，用设计 iModel 的 named version 钉版本。

**缺点**
- 推翻 `2026-10-21` “Document = iTwin”裁决，需要新 IA：文档中心列 iModel，iTwin 变成项目/文件夹。
- 特征系统当前以 v1 “单 Part Studio/iModel”为假设（D6），需要多 Part Studio 作用域（特征元素/EDE 图/查询/undo/op DSL）。
- 需要数据迁移：旧 Part Studio iModel → 新文档 iModel 内的 Model；ElementId 会变，引用需用 `FederationGuid`/`Code` 重建。
- iModel 内 Model 数量增多，tile/checkpoint/性能需要验证。
- 本地 hub 需要补官方 iTwin 层级与（可能缺失的）Named Version/状态/Permissions。
- 近期交付变慢，UI W2/W3 需要围绕新 IA 重做。

### 选项 C：渐进迁移（A → B，双模过渡）

**做法**：
- 长期目标采用 B；过渡期保留 A 的旧数据。
- 前端引入 `WorkspaceRef` 抽象：`{ iTwinId, iModelId, modelId? }`，路由/数据层同时支持“iModel 即文档”和“iTwin 即文档”两种模式。
- 新文档按 B 创建；旧文档按 A 读取，打开时惰性迁移或批量迁移。
- 用 feature flag 切换文档中心/页签语义。

**优点**
- 不阻塞 UI 波次：可以先按抽象层实现 W2/W3，再切换后端语义。
- 旧数据零丢失；迁移可分批次、可回滚。
- 可以在真实数据上验证 B 的性能与特征服务改造。

**缺点**
- 双模复杂度：路由、查询、权限、测试都要兼容两套。
- 过渡期可能长期存在，形成第二个“遗留口径”。
- 总成本 = B 的成本 + 双模开销。

---

## 5. 对比

| 维度 | A 维持 | B 目标 | C 渐进 |
|---|---|---|---|
| Onshape 页签语义 | 差（页签=完整 DB） | 好（页签=Model） | 过渡期混合 |
| 文档级版本/共享 | 需额外清单 | 原生 | 逐步具备 |
| 多页签成本 | 高（多 briefcase） | 低（一个 briefcase） | 取决于模式 |
| 跨页签引用/装配 | 跨 iModel，难 | 同 iModel，易 | 逐步具备 |
| CAM 扩展 | 可行但文档很重 | 原生（独立 Manufacturing iModel） | 逐步具备 |
| BIM 扩展 | 语义缺失 | 对齐官方 | 逐步具备 |
| 迁移成本 | 0 | L/XL | L/XL + 双模 |
| UI W2/W3 影响 | 小 | 大（IA/页签重做） | 中（抽象层先行） |
| 近期交付速度 | 最快 | 最慢 | 中 |
| 长期风险 | 数据越多越难迁 | 一次性阵痛 | 双模长期化 |

---

## 6. 决策（提议）

**建议：以 B 为目标模型；以 C 作为过渡路径；不在本 ADR 中直接执行迁移，先做一个 go/no-go spike。**

具体裁决：

1. **目标模型采用 B**：iTwin = 项目/产品/资产；iModel = 文档（版本化单位）；Model = Part Studio/Assembly/Process Plan；Element = 特征/零件/刀路。
2. **过渡采用 C**：旧数据保持 A 只读/兼容；新文档按 B 创建；前端引入 `WorkspaceRef` 抽象，不在 UI 中硬编码“页签 = iModel”。
3. **在 spike 通过前，不启动全量数据迁移**。spike 必须证明：
   - 特征服务能在同一个 iModel 内正确隔离/求值/撤销多个 Part Studio；
   - iModel Transformation 能把一个含特征/几何的旧 Part Studio 迁入目标 Model，并保持引用可解析；
   - 5–10 个 Part Studio 同一 iModel 的打开/切换/tile 性能可接受；
   - Named Version + 文档级共享可用。
4. **如果 spike 失败，或产品决定 6–12 个月内不做多页签/装配/CAM**：退回 A，保留 `WorkspaceRef` 抽象，记录后续 ADR；不要围绕 A 继续加深“页签 = iModel”的耦合。
5. **无论 A/B，先补齐三项前置能力**：
   - **Named Version**（前端客户端 + UI + 发布流程）；
   - **iModel 状态诚实化**（区分初始化中/失败/可重试，而不是一律“初始化中”）；
   - **iTwin 官方 taxonomy**（`class/subClass/parentId`；清理 `packages/shared` 的遗留枚举）。

### 6.1 目标映射示例（CAD/CAM/BIM）

**CAD/CAM**

```
iTwin: Thing/Asset "产品 A"（或 Endeavor/Program "A 系列产品"）
├─ Design iModel（文档/设计基线）
│  ├─ Model: Part Studio 1（特征/草图/实体）
│  ├─ Model: Part Studio 2
│  └─ Model: Assembly 1（零件实例 + 变换 + 约束）
├─ Manufacturing iModel（制造定义）
│  ├─ Model: Process Plan / Setup 1
│  ├─ Model: Operation / Toolpath
│  └─ Aspect: NC 程序引用 → iTwin Storage（URI + hash + 版本）
└─ Inspection iModel（可选；实测/序列号/偏差）
```

- Design/Manufacturing 的关系：Manufacturing iModel 记录 `Design iModelId + namedVersion/changesetId`；设计变更后用 Changed Elements 找受影响 Element，只重算相关刀路。
- 共享边界：iTwin 授权设计/制造/供应商；机密制造可用 iModel `isSecured` 再隔离。

**BIM**

```
iTwin: Thing/Portfolio "园区"
└─ Thing/Asset "1 号楼"
   ├─ Endeavor/Project "1 号楼新建工程"
   │  ├─ WorkPackage "建筑专业"
   │  └─ WorkPackage "MEP 专业"
   └─ Endeavor/Project "1 号楼改造 2030"
```

- iModel：一个资产模型（Models 按专业/楼层/系统分区），或每专业一个 iModel + 协调层/联邦视图。
- 里程碑：Named Version 标记 30/60/90%、施工节点、竣工、移交；多 iModel 时用“里程碑清单”钉住各 iModel 的 changeset/named version。
- 外部数据：文档/PDF → Storage；实景 → Reality Management；IoT/Issues/Schedules → 平台服务。

---

## 7. 后果

### 正向
- CAD、CAM、BIM 三条线共享同一套边界原则，减少未来分叉。
- 文档级版本/共享/多页签与 Onshape 对齐，而不是表面模拟。
- 跨页签引用、装配、CAM 版本钉合有正确的承载结构。

### 负向
- 需要推翻一条已记录的裁决，并更新 UI 设计文档与波次计划。
- 特征服务、hub、迁移工具、前端 IA 都有实际工作量。
- 过渡期双模增加测试与维护成本。

### 中性
- 现有 iModel/feature/changeset 数据不会消失；会以只读/归档或迁移后的 Model 形式保留。
- 本地 hub 仍是简化实现；完整 Asset/Project 层级需要私有仓工作。

---

## 8. 迁移方案

> 执行计划：P0 见 `docs/superpowers/plans/2026-10-30-b-model-p0-prerequisites.md`；P1 spike 见 `docs/superpowers/plans/2026-10-30-b-model-p1-spike.md`。

### 8.1 阶段

| 阶段 | 内容 | 出口标准 |
|---|---|---|
| **P0 前置** | Named Version 客户端/UI；iModel 状态诚实化；iTwin taxonomy 归一；`WorkspaceRef` 抽象 | 新能力有测试；旧 UI 不回归 |
| **P1 Spike** | 特征多 Part Studio 作用域；Transformation 迁移样例；性能测试；Named Version/共享 | 四项 spike 全过，形成报告 |
| **P2 新文档走 B** | 新文档 = iModel；Part Studio = Model；文档中心读取 B；A 旧文档只读兼容 | 新文档全链 e2e 绿；旧文档可打开 |
| **P3 旧数据迁移** | 惰性迁移或批量迁移；保留源 iModel 归档；校验几何/特征/引用 | 迁移工具可重跑；抽样校验通过 |
| **P4 收口** | 切换 IA；删除 A 兼容层（或长期保留只读）；更新文档与 ADR | 全量 e2e/视觉/verify-stack 绿 |

### 8.2.1 实施现实核对（2026-10-30 取证）

- **Part Studio 不是单个 BIS Model**：现有 LubanCAD 结构是 `DefinitionModel`（Feature/OpLog 定义）+ `PhysicalModel`（BodySolid/Sketch）+ dictionary 中的 OpLog 元素。ADR 的 “Model = Part Studio” 应理解为 **Part Studio scope（一对 def/phys Model）**，不是新增 `PartStudio` EC 类；若要严格单 Model，需要 schema 改造。
- **Named Version 后端是“元数据 CRUD”**：hub 端点已存在，但创建不自动生成 checkpoint/缩略图、`namedVersionCount` 不递增、`NamedVersionCreated` 事件未 emit。P0 只交付“命名 + 列表”；完整发布快照列入 P1/backlog。
- **iModel state 实际枚举**：`initialized / notInitialized / failed / missingFiles`（`imodel-state.enum.ts`），没有 `initializationFailed/retryScheduled`；前端需按实际枚举映射（`failed → 初始化失败`，`missingFiles → 文件缺失`），不得把 `failed` 显示成“初始化中”。
- **iModel 级权限 `isSecured` 未实现**：hub 只有 iTwin 级 RBAC 强制；legacy `imodel_permissions` 表存在但数据面未强制。P1 的“文档级共享”必须先补 `isSecured`/iModel ACL，或降级为 iTwin 级共享并在 P1 报告记 No-Go。
- **`POST /imodels` 缺 iTwin 权限守卫**：**已由 P0 修复**——`@RequirePermission(IMODELS_MANAGE, { bodyItwinParam: 'iTwinId' })` + `ResourceAccessGuard`，非成员/Viewer 建 iModel → 403；body 的 `iTwinId` 非 UUID → 400（先于授权查询，避免 Postgres uuid 列 22P02 变 500）。同一 P0 收口补了相邻面：`PATCH /imodels/:id` 拒绝 `iTwinId`（422，归属不可改）；`templateId`/`sourceiModelId` 创建要求源 iModel 所属 iTwin 的 `imodels_webview`；`clone`/`fork` 的 `targetITwinId` 与源不同时要求目标 iTwin 的 `imodels_manage`。
- **MS 无 iModel Transformation 依赖**：`@itwin/imodel-transformer@0.4.3` 的 peer 只到 core 4，本仓 core 5.15-dev；P1 迁移以 **参数重放 + `rebuildAll`** 为主，手工 Element 复制仅用于 direct-edit body 等无法重算的场景，transformer 只做时间盒探针。

### 8.2 技术步骤（B）

1. **iTwin 层级**：`class/subClass/parentId` 落库；文档中心增加项目/文件夹层；产品/资产/项目按 6.1 的层级建模。
2. **iModel = 文档**：每个文档一个 iModel；CAM 用同 iTwin 下的独立 Manufacturing iModel。
3. **Model = Part Studio**：每个 Part Studio 一个 BIS Model；用 `PartStudio` Element 作为 sub-modeled element；特征元素/EDE 图放在该 Model 内。
4. **特征服务**：查询、求值、undo、op DSL 增加 `partStudioId`/`modelId` 作用域；旧数据默认单 Part Studio 兼容。
5. **页签**：前端 TabBar 读取 iModel 内的 Model 列表；切换页签 = 切换活动 Model，不新建 BriefcaseConnection。
6. **版本/共享**：Named Version 建在 iModel（文档）上；共享/权限落在 iModel（`isSecured`）或 iTwin（项目）。
7. **CAM**：Manufacturing iModel 记录设计 `iModelId + namedVersion/changesetId`；刀路引用设计 Element 的 `FederationGuid`/稳定 ID；大文件走 Storage。
8. **BIM 预留**：iTwin 用 Asset/Project/Portfolio/Program/WorkPackage；iModel 用资产/专业模型；Model 用专业/楼层/系统。

### 8.3 数据迁移（旧 A → 新 B）

1. 对每个旧 iTwin（文档）建一个目标 iModel（文档）。
2. 对旧 iTwin 下的每个 iModel（Part Studio）：
   - 用 **iModel Transformation** 把源 iModel 的内容导入目标 iModel 的一个 Model；
   - 建 `PartStudio` Element，设置名称/顺序/来源 changeset；
   - 特征元素与 EDE 关系一并导入，补 `partStudioId`；
   - 用 `FederationGuid`/`Code` 保留外部引用；ElementId 重映射表落盘。
3. 源 iModel 保留为只读归档；在目标 iModel 建 Named Version `migrated/<源iModelId>@<changeset>`。
4. 校验：特征数、体数、体积/包围盒、关键引用、几何抽样；失败则回滚到源 iModel。
5. 迁移工具必须幂等、可重跑、可分批；先 dry-run，再灰度。

### 8.4 私有仓工作（luban-backend / imodelhub-services）

| 仓库/服务 | 工作 | 规模 |
|---|---|---|
| `modeling-server` FeatureService | 多 Part Studio 作用域（查询/求值/undo/op DSL）；迁移 CLI/Transformer 接线 | M–L |
| `modeling-server` Briefcase/Tile | 一个 iModel 多 Model 的打开/切换/tile 性能验证与缓存优化 | M |
| `imodelhub-services` | 官方 iTwin `class/subClass/parentId`；Named Version 端点/状态；iModel 状态粒度；iModel 级权限（`isSecured`） | M |
| `webhook-agent` | changeset 事件按文档 iModel 聚合；迁移后事件链路验证 | S |
| `bff`（`services/bff`） | 可选：项目/文档聚合、CAM 领域 API；目前只是网关（`app.ts:21-32,82-86`） | S–M |

> 注意：`modeling-server`/`imodelhub-services` 源码均在私有仓；本仓只有编译产物。上述工作需要在私有仓排期。

### 8.5 公共仓工作

| 区域 | 工作 | 规模 |
|---|---|---|
| `clients` | Named Versions 客户端；iModel 内 Model 列表；文档/项目聚合 | S–M |
| 路由/IA | `WorkspaceRef`；`/projects/:iTwinId/documents/:iModelId?tab=:modelId`；旧路由兼容 | M |
| 文档中心 | iTwin=项目、iModel=文档；筛选/列/详情页调整 | M |
| Part Studio | TabBar 读 Model 列表；切页签不新建连接；树/特征按 Model 作用域；文档级共享/版本 | M–L |
| 测试 | 多页签、迁移、双模、权限、性能 | M |

### 8.6 发布顺序 runbook（P0 终审）

**支持路径是先 hub 后 web**（滚动升级窗口内旧 web 对新 hub、新 web 对旧 hub
各自可运行，但这不是受支持的长期形态）：

1. **发布 hub 镜像**（含 taxonomy 迁移 `AddOfficialITwinClassEnum` →
   `NormalizeITwinTaxonomy` → `AddITwinGeography`），本地/远端构建后推送并
   更新部署。hub 的 Dockerfile 必须显式安装 **npm 11**（当前钉
   `npm@11.21.1`）再 `npm ci`：仓内 `package-lock.json` 由 npm 11 生成，
   `node:22.21.1-alpine` 自带的 npm 10.9.4 会报 lockfile out-of-sync
   （缺 `conventional-commits-parser@6.4.0` / `meow@13.2.0`）——builder 与
   runtime 两段都要装。
2. **verify-stack Step F**：核对 hub 容器实际镜像的 OCI revision 与 hub
   HEAD 一致（防「镜像 ID 新、容器跑旧产物/旧挂载」；Step F 对宿主 dist
   挂载做硬 FAIL）。此时迁移已执行，旧 `class:'Project'` 行已归一为
   `Endeavor/Project`。
3. **重建 web 镜像**（`scripts/rebuild-web.ps1`；仅 hub 发布不会更新 web
   镜像）。web 新建文档载荷只发 `subClass:'Project'`，class 由 hub 派生
   （Project → Endeavor）。
4. **全量 verify-stack**（health → 数据链 → WS → dev-build 横幅；Step E/F
   双镜像新鲜度）。

**禁止**把 web 分支合并/重建后对着 pre-P0 hub 作为受支持路径发布——尽管
subClass-only 载荷在旧 hub 上可工作（旧白名单剥掉未知 `subClass`、class
缺省 `Project`），taxonomy 归一/状态诚实化等 P0 面仍未生效。新 web 对旧
hub 的兼容只用于**发布窗口内的短暂交叉**。

**subClass → class 派生规则**（hub 单一实现，
`src/itwins/domain/itwin-taxonomy.ts`）：

| subClass | 派生 class |
|---|---|
| `Account` | `Account` |
| `Asset` / `Portfolio` | `Thing` |
| `Project` / `Program` / `WorkPackage` | `Endeavor` |

create/update 都按此派生：显式 `class` 与派生值不符 → 400（非法对不落库）；
legacy `subclass` 别名与 `subClass` 同口径按枚举校验，任意字符串 → 422。

---

## 9. 对 UI 波次 W2 / W3 的影响

### W2 文档中心

| 项 | A（现状） | B（目标） |
|---|---|---|
| 文档列表对象 | iTwin | iModel |
| 项目/文件夹层 | 无（iTwin 即文档） | iTwin（项目）→ iModel（文档） |
| 详情页 | iModel 卡片网格 | 项目下的文档列表（或直接进入文档） |
| 点文档打开 | 解析最近 iModel | 解析最近 Model（页签） |
| 侧栏筛选 | 对 iTwin | 对 iModel（项目另有层级/筛选） |
| 新建文档 | 建 iTwin | 建 iTwin（项目，可选）+ 建 iModel（文档）+ 默认 Part Studio Model |

**结论**：W2 的“文档中心”在 B 下是**两层 IA**；如果先按 A 实现，后续要重做列表对象、详情页、打开逻辑。建议 W2 先按 `WorkspaceRef` 抽象实现，列表对象用可切换的 adapter；不要在 UI 文案/路由中把 iTwin 写死为“文档”。

### W3 编辑器壳

| 项 | A（现状） | B（目标） |
|---|---|---|
| 底部页签 | iModel（每个页签一个完整 DB） | Model（同一 iModel 内的 Part Studio） |
| 多页签 | 需多个 BriefcaseConnection；当前不支持 | 原生支持；一个 briefcase |
| 页签管理器 | 列 iModel | 列 Model |
| 顶栏文档名 | iTwin 名 | iModel（文档）名；项目名在面包屑/项目层 |
| 共享/版本 | 共享 iTwin 或单个 iModel | 共享 iModel（文档）；Named Version 在文档级 |
| 特征树 | 当前 iModel 的特征 | 当前活动 Model 的特征 |
| Ribbon/ViewCube/视口 | 不受数据模型影响 | 不受数据模型影响 |

**结论**：W3 的 TabBar、TabManager、文档标题、共享/版本入口都依赖数据模型；如果 B 未定，W3 可以先做“单页签 + 管理器”，但不要把“页签=iModel”写死。

### W5 / W6 的连带影响

- **W5 特征/装配**：A 下跨页签装配需要跨 iModel 引用；B 下同 iModel 内完成。若近期要做装配，B 是前置。
- **W6 共享/版本**：A 下“文档级共享”只能共享 iTwin（所有页签）或单 iModel；B 下共享 iModel（文档）天然成立。Named Version 缺失是两条线共同的阻塞项。

---

## 10. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| 特征服务多 Part Studio 作用域改造失败 | B 不可行 | P1 spike 先验证；失败则退回 A |
| Transformation 迁移丢失特征/引用 | 数据损坏 | dry-run + 抽样校验 + 源 iModel 只读归档 + 可回滚 |
| 一个 iModel 多 Model 性能下降 | 打开/切换慢 | 限制单文档 Part Studio 数量；按需加载；checkpoint/tile 优化 |
| Named Version 缺失 | 文档级发布不可用 | P0 先补客户端/UI/后端 |
| 本地 hub 不支持官方层级/权限 | B 的 IA 无法落地 | 私有仓补 hub；或先用简化层级（Project/Folder） |
| 双模长期化 | 维护成本高 | 明确 P4 收口时间；feature flag 有删除计划 |
| 推翻既有裁决引发返工 | UI 波次重做 | 在 W2 前决策；W2 用抽象层；更新 parity 设计文档 |

---

## 11. 前置条件与 go/no-go

**P0 前置（必须先做，且与 A/B 无关）**
1. Named Version：前端客户端 + “保存版本”真实语义 + UI。
2. iModel 状态诚实化：初始化中/失败/可重试/已初始化。
3. iTwin taxonomy：官方 `class/subClass`；清理 `packages/shared/src/projects/types.ts` 的遗留枚举。
4. `WorkspaceRef` 抽象：路由/查询/组件不硬编码 `iTwinId/iModelId` 的文档语义。

**P1 Spike 验收（四项全过才迁移）**
1. 同一 iModel 内 2–3 个 Part Studio 的特征创建/编辑/撤销互不干扰。
2. 一个含特征/几何的旧 Part Studio 经 Transformation 迁入目标 Model，引用/几何/体积校验通过。
3. 5–10 个 Part Studio 同一 iModel 的打开、切换、tile 加载在可接受预算内。
4. Named Version + 文档级共享在目标模型上可用。

**Go**：四项全过 → 按 P2–P4 执行 B。
**No-go**：任一失败 → 维持 A，保留抽象层，记录后续 ADR；不启动全量迁移。

---

## 12. 开放问题

1. **撤销粒度**：文档级 undo 还是活动页签级 undo？Onshape 是活动页签语义；B 下需要 op 日志按 `partStudioId` 过滤。
2. **写者租约**：D8 是单写者会话租约；B 下一个 briefcase 覆盖多页签，租约仍按文档还是按页签？
3. **文档级共享**：共享 iModel（文档）还是 iTwin（项目）？机密制造页签是否用 `isSecured` 单独隔离？
4. **CAM 边界**：Manufacturing iModel 与 Design iModel 是否同一 iTwin？设计变更后刀路失效的判定用 Changed Elements 还是应用层 diff？
5. **BIM 层级**：本地 hub 是否要实现 Portfolio/Program/WorkPackage，还是先只做 Project/Asset 两层？
6. **旧数据保留策略**：迁移后源 iModel 保留多久？是否永久只读归档？
7. **分支/合并**：iModelHub 无原生 branch/merge（仅 fork + Transformation）；产品是否需要 Onshape 式分支？如果需要，版本策略需单独立项。

---

## 13. 证据附录

| 结论 | 证据 |
|---|---|
| iTwin 定义/联邦 | `itwinjs-core/docs/learning/Glossary.md:59`；`itwinjs-core/docs/bis/guide/intro/federated-digital-twins.md:6,26-30` |
| iModel 定义/单资产 | `itwinjs-core/docs/learning/iModels.md:3-33` |
| iModelHub 账本/Named Version/Lock | `itwinjs-core/docs/learning/iModelHub/index.md:3-56`；`.../Briefcases.md:3-27` |
| BIS 多视角/多粒度 | `itwinjs-core/docs/bis/guide/intro/modeling-with-bis.md:8-33` |
| CAD/BIM 数据、fork/clone、锁 | `itwinjs-core/docs/learning/iModelsForDevelopers.md:9-43` |
| 官方 iTwin class/subClass/parentId | `docs/api-specs/itwins.json` |
| 官方 iModel 字段/state/isSecured/changeset/named version/briefcase/checkpoint/lock/fork | `docs/api-specs/imodels-v2.json` |
| 本仓 Document = iTwin 裁决 | `docs/superpowers/specs/2026-10-21-web-onshape-parity-design.md:70` |
| 特征系统 D2/D3/D6/D8 | `docs/superpowers/specs/2026-09-27-cad-feature-system-decision-record.md:12-18` |
| 装配/分支后置 | `docs/superpowers/specs/2026-09-28-cad-full-program-roadmap.md:54,129,177,196` |
| 本地 hub 简化 iTwin 形状 | 2026-10-30 `GET /itwins` 实测（`class:"Project"`，无 `subClass/parentId`） |
| 前端 Named Version 缺失 | `part-studio/components/PartStudioTopBar.tsx:180-187`；`part-studio/PartStudioPage.tsx:339-349`；`CLAUDE.md:28` |
| iModel 状态展示 | `document-details/internal/imodels.mapper.ts:29`；`docs/IMODEL_AUTO_RECOVERY_DESIGN.md:42-74` |
| 遗留 iTwin 枚举 | `luban-cad/packages/shared/src/projects/types.ts:47,53-86` |
| BFF 仅网关 | `services/bff/src/app.ts:21-32,82-86`；`proxy.ts:15,43` |
| acquireBriefcase RPC 为桩 | `dist-backend/modeling-server/dist/rpc/OpenCloudRpcImpl.js:29-40` |
| iModel 创建/baseline 流 | `docs/Architecture.md:145-158,267-298` |
| 编辑/push 流 | `docs/Architecture.md:300-331` |
| Tile 缓存边界 | `docs/Architecture.md:333-352` |

---

## 14. 决策记录

| 日期 | 决策 | 状态 |
|---|---|---|
| 2026-10-30 | 本 ADR 提出：B 为目标、C 为过渡、P1 spike 后 go/no-go | 待决策 |
| 2026-10-30 | 用户认可 **B 方向**；按 C 过渡；P1 spike 作为迁移门禁 | **已接受** |
| 2026-10-30 | P0 四项前置完成（Named Version / 状态诚实化 / taxonomy / WorkspaceRef）；验证证据见下 | **完成**（进入 P1 spike） |

### P0 收口验证证据（2026-10-30）

| 项 | 结果 |
|---|---|
| 公共仓 shared | `npx tsc` 0；`npx vitest run` 7 files / 138 tests PASS |
| 公共仓 web | `npx tsc --noEmit` 0；`npx vitest run` 72 files / 995 tests PASS；`npx eslint "src/**/*.ts*"` 0 |
| modeling-server（私有仓源码） | `pnpm build` 0；`vitest run` 63 files / 604 passed, 8 skipped（lint 基线 246 errors，本任务不设门禁） |
| hub 源码 | `npm run test:unit` 123 suites / 1104 tests PASS；`npm run build` 0 |
| hub 实栈 e2e（聚焦） | `authorization` + `smoke-crud` 2 suites / 29 tests PASS（`E2E_BASE_URL=http://localhost:5400`） |
| hub 迁移 | 本地镜像重建后启动迁移：`AddOfficialITwinClassEnum` / `NormalizeITwinTaxonomy` / `AddITwinGeography` 均 executed successfully |
| taxonomy 实栈 | **历史载荷**（final fix wave 前）：UI 新建文档网络载荷 `{"displayName":"P0 UI 新建文档 …","class":"Endeavor","subClass":"Project"}` → 201；`GET /itwins` 返回 `class:"Endeavor"`, `subClass:"Project"`（含新建与既有 demo 行）；DB 分布 Endeavor/Project 4391、Account/Account 3。此后 web 载荷改为 subClass-only（§8.6） |
| 权限与状态诚实 | 陌生账号 `POST /imodels` → 403（requires imodels_manage）；`PATCH /imodels/:id {state}` → 422 `state is server-managed and cannot be set by clients`，state 保持 notInitialized |
| web 实栈 e2e（聚焦） | `documents` + `document-details` + `part-studio` + `tutorial2` 17/17 PASS（3.0m，setup 重置 E2E Seed） |
| Named Version 实栈 | 编辑器保存「P0 收口验证 V1」→ hub `GET /imodels/:id/namedversions` 200 返回该名（changesetIndex 2）；版本历史面板同步显示 |
| 截图 | `docs/superpowers/plans/assets/2026-10-30-p0/`：documents-list-endeavor-project.png、documents-list-ui-create.png（UI 新建后）、imodel-state-badge.png、save-version-dialog.png、named-version-history.png |
| 未跑 | 全量 web Playwright（只跑四个目标 spec，避免撞限流预算）；`verify-stack.ps1`（不在本任务范围） |

> 收口注记：hub 本地镜像构建当时用临时 `Dockerfile.local` 引导 npm 11 —— 仓内 `package-lock.json` 为 npm 11 生成，`Dockerfile` 的 node:22.21.1-alpine 自带 npm 10.9.4 报 lockfile out-of-sync（缺 conventional-commits-parser@6.4.0 / meow@13.2.0）。**final fix wave 已把 `npm@11.21.1` 显式安装写进 `Dockerfile` 的 builder 与 runtime 两段**（§8.6），临时文件方案不再需要。MS 宿主按计划以产物模式（dist-backend）重启；其中 `@luban-cad/shared` 为静态拷贝，但 MS 不导入 taxonomy，故不影响本项验证。

### 最终修复波验证证据（2026-10-30 final fix wave）

| 项 | 命令 | 结果 |
|---|---|---|
| 公共仓 web 类型 | `cd luban-cad/apps/web && npx tsc --noEmit` | 0 错误 |
| 公共仓 web 单测 | `npx vitest run`（全量） | 73 files / **1005 tests PASS**（基线 72/995） |
| 公共仓 web lint | `npx eslint`（全部触碰文件） | 0 错误 |
| 公共仓 web 聚焦 e2e | `npx playwright test e2e/documents.spec.ts e2e/document-details.spec.ts`（hub 新镜像 :5400 + vite dev :5300） | **8/8 PASS** |
| hub 类型 | `npx tsc --noEmit -p tsconfig.json` | 0 错误 |
| hub 构建 | `npm run build` | 0 错误 |
| hub 单测 | `npx jest --config ./test/jest-unit.json --runInBand`（全量） | 124 suites / **1122 tests PASS**（基线 123/1104） |
| hub 镜像 | `docker build -t imodelhub-services:p0-final .`；`docker run --rm --entrypoint npm … --version` | 构建成功；runtime `npm 11.21.1`（未推 registry） |
| hub 聚焦 e2e | `E2E_BASE_URL=http://localhost:5400 npx jest --config ./test/jest-e2e.json --runInBand test/itwins.e2e-spec.ts test/integration/authorization.e2e-spec.ts test/integration/smoke-crud.e2e-spec.ts` | **3 suites / 44 tests PASS** |
| 未跑 | 全量 web Playwright（限流预算）；`verify-stack.ps1`（控制器在终审后执行）；镜像 push/publish（本轮明确禁止） |

> 本地 hub 容器用新镜像重建以跑 e2e（`docker compose up -d --no-deps --force-recreate imodelhub`），Postgres 数据保留；本地 `ghcr.io/chenjinxian/imodelhub:latest` tag 被本地构建覆盖（未推送 registry）。web 容器未重建（聚焦 e2e 用 vite dev :5300 承载新代码）。

> 本文只做架构决策记录，不包含代码改动。P0 前置项可以在 UI 波次中先行落地；B 的全量迁移必须在 P1 spike 通过后另行排期。
