# ADR-G2-03：Typed Workspace Tabs 与文档/工作区身份

> 状态：**Proposed under owner directive 2026-11-24; not ARB-signed**
> 日期：2026-11-24
> 关联：`G2-CONTRACT-FREEZE-PLAN-2026-11-24.md` C4、
> `G2-SPIKES-2026-11-24.md` S-G2-03、
> `08-ARCHITECTURE-EXTENSIBILITY.md` §4.1、
> `09-INDUSTRIAL-TARGET-ARCHITECTURE.md` §4.1/§8、
> `10-ARCHITECTURE-HARDENING-PLAN.md` WS-G（G1/G2）、
> `ADR-G0-01-product-scope-phasing.md`、`ADR-G0-04-ledger-version-checkpoint.md`、
> `ADR-G0-08-assembly-drawing-pdm.md`、`ADR-G2-04-session-command-undo-ownership.md`。
> 影响面：文档路由、`WorkspaceRef`、Part Studio 注册表/页签、`listPartStudios`、
> 旧 `UserLabel` 发现、版本引用、工作区模块注册、状态键。
> 本 ADR 只使用公开、脱敏事实；不包含私有源码、密钥或 native 构建证据。

---

## 1. 背景与当前事实

1. **文档模型方向已定，但页签身份未成型。** ADR-0001 / ADR-G0-01 的目标是
   `Tenant → Project(iTwin) → Document(iModel) → typed Tab + Version/Reference`；
   Part Studio 使用 `DefinitionModel + PhysicalModel` scope。但当前 `WorkspaceRef` 只有
   `{iTwinId,iModelId,modelId?}`，没有 `kind`/`tabId`/`versionRef`。
2. **页签仍是 Part Studio 专用。** `PartStudioInfo` 只有
   `{id,name,order,defModelId,physModelId}`，没有 `tabType`/modelSet/sourceRef；
   `listPartStudios` 是当前读面；`PartStudioTabs`/路由/树/底部 Dock 都围绕 Part Studio
   写死。
3. **tab 发现依赖 `UserLabel` 前缀。** 当前靠 `LubanFeaturePartition:<id>` 前缀推断
   Part Studio；如果 Assembly/Drawing 再发明新前缀，`listPartStudios`/文档模式探测都
   看不见它。这是隐式契约，不是 typed tab。
4. **A/B 两代 IA 并存。** A 旧文档 = iTwin 即文档、iModel 即 Part Studio；B 新文档 =
   iTwin 项目、iModel 文档、Part Studio 是 scope。文档中心列表仍以 iTwin 行对象为主；
   编辑器外没有“iModel 文档首页列出全部 tabs”。加 Assembly/Drawing 后没有统一入口。
5. **版本引用今天不可解析。** Named Version 只写元数据；MS `openCheckpoint` 未实现；
   `downloadBriefcase` 没有 changeset/version 参数。即使引用记录“Part Studio V1”，
   产品也打不开那个版本。G1 D5 已有部分只读打开证据，但 D3/D6/D7/D8 仍未闭环。
6. **多 Part Studio 切换仍有状态串扰风险。** feature 树/body 的已加载键只按
   connectionKey、不含 scope；正常切 scope 时旧树/旧 body 可能在新读失败时残留；
   对话框不随页签关闭，提交时才读 `useWorkspaceRef()`，可能写到新 scope；相机/undo 是
   文档级共享。
7. **没有 WorkspaceModule 抽象。** 公开树没有 `WorkspaceModule`/`WorkspaceKind`/
   `TabDirectory`/`listTabs`；加 Assembly/Drawing 会继续改 Part Studio 路由/store/页签/
   选择，而不是注册新模块。

---

## 2. 决策

### 2.1 文档/工作区身份

1. **`DocumentRef`**：至少 `{ iTwinId, iModelId }`；作为文档级身份，不把 Part Studio
   scope 当文档。
2. **`WorkspaceRef`**：在现有字段上 additive 增加：
   - `kind`：`partStudio | assembly | drawing | variableStudio | imported | derived`；
   - `tabId`：typed tab 的稳定 id（与 `modelId`/`modelSet` 的关系由 tab 记录给出）；
   - `versionRef?`：可选 `{ changesetId | versionId }`（NamedVersion 只做展示名）；
   - 旧字段 `modelId?` 保留为 Part Studio scope 的兼容快捷方式。
3. **旧 URL 兼容**：缺 `kind` 时默认 `partStudio`；缺 `tabId` 时用 `modelId` 或旧
   `LubanFeaturePartition` 合成；不得要求旧链接迁移。
4. **身份唯一性**：`(documentRef, tabId)` 是 tab 身份；`modelId` 不是全局 tab 身份；
   `UserLabel` 不是身份，只是 legacy 合成输入。
5. **版本引用**：引用键统一 `changesetId/versionId`；`NamedVersion` 只作展示/索引；
   `versionRef` 只有在 G1 D5/D6 的只读打开语义可用时才可写入；否则字段可为空，
   不得用“名字”冒充可解析版本。

### 2.2 Typed Tab 与 TabDirectory

1. **`LubanTab`** 至少：
   ```text
   LubanTab {
     tabId, tabType, name, order,
     modelSet { defModelId?, physModelId?, drawingModelId?, sheetModelId? },
     sourceRef? { documentRef, versionRef?, tabId? },
     capabilities?, metadata?
   }
   ```
2. **`TabDirectory`** 是文档级 tab 列表/索引；`listTabs(documentRef)` additive 返回
   `LubanTab[]`；`listPartStudios` 保留为 `tabType=partStudio` 的过滤视图。
3. **legacy 合成**：旧文档没有显式 tab 记录时，`listTabs` 从
   `LubanFeaturePartition:<id>` + def/phys model 合成 `partStudio` 条目；id/name/order/
   degraded 状态与 `listPartStudios` 一致。缺 phys model 的条目仍可见并标记 damaged，
   不得当可打开 scope。
4. **不再以 UserLabel 作为新 tab 的唯一发现机制**：新 tab 类型必须写入显式 tab 记录/
   BIS 元素或 aspect；旧前缀只读合成，不删除。
5. **不把新工作区元数据塞进 Part Studio `JsonProperties`**：按域使用 additive
   tab 记录/aspect/EC schema；Part Studio 元数据仍只描述 Part Studio。避免所有 tab 类型
   同步升级同一个 schema。
6. **`WorkspaceModule` 注册契约**（stub）：`mount/session/store/toolset/selectionSchema/
   undoPolicy` 等最小接口；Part Studio 是第一个实现；Assembly/Drawing 以后注册，
   **不实现功能**。G2 只要求“加一个 stub tab 不改 Part Studio 模块”的编译/测试。

### 2.3 路由与状态

1. **路由默认**：旧 `documents/:iTwinId/:iModelId?model=...` 继续可用；新路由可带
   `kind`/`tab`/`version`，但旧链接不重定向、不要求迁移。
2. **状态键**：feature 树/body/对话框/选择/相机/undo 的 key 必须含
   `documentRef + workspaceRef/tabId`（至少 scope id），不得只按 connectionKey；
   切换 tab/scope 时旧树/旧 body 必须清空或重挂，不得残留。
3. **对话框/工具绑定**：对话框在打开时捕获 workspace/tab 身份；提交时校验仍是同一
   workspace，不得提交到新 scope；切 tab 时关闭或重挂对话框。
4. **相机/undo 策略**：G2 不裁决最终是文档级还是页签级；但必须显式登记策略并避免
   “scope 切换后相机/undo 静默作用到错误 tab”。该裁决与 ADR-G2-04/ADR-G0-10 对齐。
5. **权限/版本**：ACL 至少到 document/tab；版本引用在打开前检查权限；不得因 tab 类型
   绕过 per-document ACL（G1 B3 前置）。

### 2.4 不实现的范围

- 不实现 Assembly/Drawing/Variable Studio 功能、页面、求解器、HLR、BOM。
- 不实现 WorkspaceModule 完整生命周期/插件加载。
- 不把 tab 元数据迁移到新 schema 后删除旧标签。
- 不实现版本 restore/compare/fork；只对接 G1 已验收的只读版本语义（当前 D5 仅部分证据，
  D3/D6/D7/D8 未闭环；不得把 G1 D5 canary 写成版本引用已可用）。
- 不实现多文档 UI/分屏；session host 见 ADR-G2-04。

---

## 3. 备选方案与拒绝理由

| 方案 | 内容 | 结论 |
|---|---|---|
| A | 继续用 `UserLabel` 前缀作为唯一发现机制 | **拒绝**：每个新 tab 类型发明前缀，`listPartStudios`/文档模式/首页看不见；隐式契约不可版本化。 |
| B | 一个 Part Studio 一个 iModel | **拒绝**：违反 ADR-0001 目标 B；文档级 changeset/权限/版本被拆碎；跨工作区引用不可表达。 |
| C | 只在路由加 `kind`，不改数据/tab 记录 | **拒绝**：刷新/冷开/列表无法发现；仍是 UI 壳，不是 typed tab。 |
| D | 立即实现 Assembly/Drawing + WorkspaceModule | **拒绝（G2）**：范围过大且 G1 未通过；先把 tab 身份/兼容冻结，功能后置。 |
| E | 把 tab 元数据塞进 Part Studio `JsonProperties` | **拒绝**：Part Studio 成为所有 tab 的元数据垃圾桶；schema 耦合；Assembly/Drawing 升级互相牵连。 |
| F | 要求旧文档全量迁移到显式 tab 记录 | **拒绝**：旧库风险/成本高；G2 用双读合成即可；迁移应在有证据后单独做。 |
| G | 本决策：typed tab + `listTabs` 双读 + legacy 合成 + 旧 URL 默认 + WorkspaceModule stub | **采用**：加工作区不改 Part Studio，旧文档零迁移，版本引用可渐进。 |

---

## 4. 后果与风险

**正向**

- Part Studio/Assembly/Drawing 有统一 tab 身份与发现机制；加工作区不再改 Part Studio
  路由/store/页签。
- 旧文档零迁移：`UserLabel` 合成 + `listPartStudios` 过滤视图保证兼容。
- `versionRef` 为跨工作区引用/版本钉住留接缝；NamedVersion 不冒充可解析版本。
- 状态键含 scope，修复当前多 Part Studio 切换的旧树/旧 body/对话框串扰风险。

**代价/风险**

- `LubanTab`/`TabDirectory`/`listTabs` 需要新读面与旧合成；`listPartStudios` 长期保留，
  存在双读窗口。
- 旧文档的 degraded/未知前缀只能保守处理；不能自动猜类型。
- 版本引用依赖 G1 D5/D6/D7/D8；在未闭环前只能为空/只读，不能承诺 Assembly/Derived
  版本钉住。
- 新增 tab 记录/aspect 需要 schema additive 与旧 fixture；不能“先写 UI 再补数据”。
- WorkspaceModule stub 可能被误读为“Assembly 可用”；必须诚实标注 gated/not implemented。
- 相机/undo 的最终粒度未在本 ADR 裁决，仍是风险；不能默认按 tab 隔离。

---

## 5. 迁移、回滚与失败判据

### 5.1 迁移

1. **旧文档不迁移**：`listTabs` 读取时合成 `partStudio`；不写回、不删除
   `LubanFeaturePartition` 标签；`listPartStudios` 保持原行为（过滤视图）。
2. **旧 URL 默认**：缺 `kind` → `partStudio`；缺 `tabId` → `modelId` 或首个完整 scope；
   缺失/损坏 scope 与旧行为一致；不 404/不强制重定向。
3. **新 tab 写入**：只有显式 tab 记录/aspect 可用且功能实现后才写；stub Assembly 只读/
   gated，不得创建可打开的空工作区冒充功能。
4. **版本引用**：G1 D5 只读打开通过后，才允许写入 `versionRef`；NamedVersion 只存
   `namedVersionId` 展示，不进入引用键；未 ready 返回 409/可诊断错误，不返回假快照。
5. **状态键**：先在 shadow 模式给树/body/对话框/相机/undo 加 scope 键；验证旧路径
   零回归后 enforce；切 scope 失败清空旧状态。
6. **Fixture**：F-LEGACY-PS、F-OLD-URL（计划 §6.3）必须通过；公开只放 manifest/hash
   与脱敏结论。

### 5.2 回滚

1. `TYPED_TABS_MODE=off|dual|enforce`：off 回到 `listPartStudios` + `UserLabel` 发现；
   dual 双读；enforce 使用 `listTabs`。
2. `WORKSPACE_KEY_MODE=off|shadow|enforce`：off 保留旧 connectionKey；shadow 记录串扰；
   enforce 才用 document+workspace 键。
3. `VERSION_REF_MODE=off|readonly|enforce`：off 不写/不读 versionRef；readonly 只读打开；
   enforce 才允许引用钉版本。
4. 回滚不删除显式 tab 记录/旧标签；不回写旧文档；不把已经只读打开的版本变成可写。
5. 回滚后旧 URL/旧列表/旧树/旧选择仍可用；不得要求数据迁移。

### 5.3 失败判据

- 旧文档漏列/顺序漂移/degraded 消失；`listTabs` 与 `listPartStudios` 不一致。
- 旧 URL 打开错误 scope 或要求迁移；缺 kind 被拒绝。
- 新 tab 类型需要改 Part Studio 内部/路由/选择/树；WorkspaceModule 只是名义。
- tab 元数据被塞进 Part Studio `JsonProperties` 或需要全量迁移。
- 切 scope 后旧树/旧 body/对话框/相机/undo 串到新 scope。
- `versionRef` 写入但无法只读打开；NamedVersion 被当版本键；未 ready 返回假快照。
- S-G2-03 未通过就宣称 typed tab 冻结。

---

## 6. 证据状态

| 项目 | 状态 | 说明 |
|---|---|---|
| `WorkspaceRef.kind/tabId/versionRef` | **未实现** | 当前只有 iTwinId/iModelId/modelId |
| `LubanTab`/`TabDirectory` | **未实现** | 公开树无类型 |
| `listTabs` | **未实现** | 当前 `listPartStudios` |
| legacy `UserLabel` 合成 | **未实现** | 依赖后端发现；公开侧无 `listTabs` |
| `WorkspaceModule` | **未实现** | 无抽象；加工作区需改 Part Studio |
| 旧 URL/旧文档双读 | **未执行** | S-G2-03 Not run |
| G1 D5 版本打开 | **部分** | D5 canary 有证据；D3/D6/D7/D8 未闭环 |
| 状态键含 scope | **部分/未执行** | 当前已知树/body 键缺 scope、对话框不随 tab 关闭 |
| ARB 签字 | **无** | 本 ADR 仍为 Proposed |

> 本 ADR 不把“目标架构/接口草案/旧 D5 canary”写成 typed tab 已实现或已冻结。S-G2-03
> 未通过前，不得宣称多工作区/版本引用可用。

---

## 7. 签字与状态

- 拟制依据：业主 2026-11-24 指令（G2 预冻结文档包，先契约后代码）。
- 当前状态：**Proposed under owner directive 2026-11-24; not ARB-signed**。
- 签字栏（待）：

| 角色 | 姓名 | 日期 | 结论 |
|---|---|---|---|
| Architecture owner | | | |
| Workspace/frontend owner | | | |
| Backend/data owner | | | |
| Product owner | | | |

## 8. 关联

- 计划：`G2-CONTRACT-FREEZE-PLAN-2026-11-24.md` C4、阶段 2。
- Spike：`G2-SPIKES-2026-11-24.md` S-G2-03。
- ADR：`ADR-G0-01`（产品范围/文档模型）、`ADR-G0-04`（版本/账本）、`ADR-G0-08`
  （装配/工程图后置）、`ADR-G2-04`（session/command/undo）。
- 其他：`08` §4.1、`09` §4.1/§8、`10` WS-G、`INDUSTRIAL-READINESS` W7。
- 未决：`LubanTab` 的 BIS 元素/aspect 形态、`modelSet` 字段、版本引用键的最终语义、
  相机/undo 的最终粒度、WorkspaceModule 生命周期、旧标签退出的时间窗口。
