# ADR-G2-04：DocumentSessionHost、CommandRegistry 与 undo 所有权

> 状态：**Proposed under owner directive 2026-11-24; not ARB-signed**
> 日期：2026-11-24
> 关联：`G2-CONTRACT-FREEZE-PLAN-2026-11-24.md` C5/C6、
> `G2-SPIKES-2026-11-24.md` S-G2-05、
> `08-ARCHITECTURE-EXTENSIBILITY.md` §4.4/§4.5、
> `09-INDUSTRIAL-TARGET-ARCHITECTURE.md` §6/§8/§11、
> `10-ARCHITECTURE-HARDENING-PLAN.md` WS-C/WS-G/WS-I、
> `G1-EXECUTION-PLAN.md` C1/C2/C3、`G1-WAVE2-STATUS-2026-11-23.md`、
> `SESSION-ISOLATION-DESIGN.md`、`ADR-G0-09-session-process-model.md`、
> `ADR-G0-10-undo-granularity.md`、`EXCEPTIONS.md` X-05/X-15/X-20。
> 影响面：Web 页面宿主、编辑器连接/租约、zustand store、命令/ribbon/palette/keymap/
> capability/AI spec、undo/redo、OpLog、BriefcaseTxns、会话归属。
> 本 ADR 只使用公开、脱敏事实；不包含私有源码、密钥或 native 构建证据。

---

## 1. 背景与当前事实

1. **没有 `DocumentSessionHost`。** 当前是页面级一个 IModelApp、一条 `/ipc`、一个
   `BriefcaseConnection`、一个 `ScreenViewport`、一个 ToolAdmin；`RpcManager.setIModel`
   的 fallback token 是静态全局。多连接并存时字符串键 RPC 可能被“最后一个连接”串话
   （需 spike）。
2. **store 是模块单例。** `usePartStudioStore` 是 zustand 模块单例，不是按文档/视口
   分桶；工具层直接 `getState()`；store 同时是全局服务定位器。多文档/多视口会共享
   selection/sketch/dialog，靠 effect 重置；跨 scope 竞态已多次出现。
3. **命令注册面分散。** ribbon、palette、keymap、capabilities、AI tool spec、快捷键
   分散在多个文件/手工分支；`FeatureDialog` 是单体，`tools.run(toolId)` 产品侧没有参数
   注入通道；新增命令/工具要改多处。
4. **undo 有两层且无统一所有权。** 一层是 `BriefcaseTxns`（直改/UndoTool/
   reverseTxns/reinstateTxn），另一层是 FeatureService 的持久化 OpLog（参数化特征/变量）；
   两层没有统一用户可见顺序。OpLog 的 undo 目前不按作者过滤（`SESSION-ISOLATION-DESIGN`
   §1 F10）；C3 设计增加 `author { userId, sessionId, briefcaseId }` 并要求只处理本会话
   作者行。
5. **G1 会话隔离尚未通过。** G1 Gate 仍 0/15；C1/C2/C3 有代码/单测/部分 canary，但
   S0-1 双用户部署证据、真实归因、全入口 ACL、WS 撤销窗口仍未闭环。G2 不能把
   session/command/undo 契约写成“已隔离”或替代 G1。
6. **已登记的 undo 缺陷。** X-05：草图整体覆写 op 非 invertible，undo 不完整；
   X-15：自动保存/推送会开启新 changeset 会话，已推送事务不再保证可 Undo；X-20：既有
   WS 连接在撤权后最长约 30s（+探针）仍可发消息。这些是 G1/G2 的边界，不是本 ADR 能
   静默解决的。
7. **D0-10 已要求操作组。** `ADR-G0-10` 明确“操作组/事务是唯一用户可见撤销单位”，
   FeatureOp/直改/草图统一语义；本 ADR 只把它落到 session/command 宿主与所有权契约。

---

## 2. 决策

### 2.1 `DocumentSessionHost`：每文档会话宿主

1. **宿主职责**：管理一个文档会话的连接/生命周期，至少包括：
   - `DocumentRef` + `WorkspaceRef/tabId` 上下文；
   - BriefcaseConnection / IModelApp 视图句柄（按 iTwin 标准生命周期）；
   - 显式 RPC token（不得依赖 `RpcManager` 全局 fallback）；
   - 每 session 的 store 实例（工厂，不是模块单例）；
   - 命令分发器与 undo 协调器；
   - 写租约/会话归属/关闭/重连钩子。
2. **session key**：至少 `{ documentRef, sessionId }`；若同文档多视口/多 tab，再加
   `workspaceRef/tabId`。key 必须进入日志/审计/OpLog 归属/缓存键；不得只用
   connectionKey 或全局 iModelKey。
3. **生命周期**：宿主负责打开/关闭/取消/失败清理；关闭时释放连接、store、命令/undo
   上下文，不误伤其他 session；重连从 checkpoint/最新 briefcase 水化（G1 C7 目标）。
4. **单文档优先**：G2 只要求单文档 + 单视口的 host 契约与 shadow；多文档/分屏/多视口
   属于后续实现，不在本 ADR 内承诺。
5. **进程模型**：本 ADR 不裁决 process-per-doc；若 G1/G3 选择进程 actor，host 契约必须
   能在进程边界两侧成立；先 in-process owner-scoped，进程 actor 作为 HA 目标
   （与 ADR-G0-09 一致）。
6. **旧路径 adapter**：现有页面/模块单例保留为 `LegacySessionAdapter`，由 host 注入；
   adapter 不得成为第二事实源，只转发到 host 的 store/命令/undo。

### 2.2 `CommandRegistry`：命令单一来源

1. **命令条目**至少：
   ```text
   Command {
     id, i18nKey, icon, group,
     keymap?, capability,
     toolSpec?, aiSpec?,
     enabled(ctx), run(ctx, args?)
   }
   ```
2. **五处同源**：ribbon、palette、keymap、capabilities、AI tool spec 从同一注册表派生；
   注册一次五处出现，禁用/删除同时消失；不得在 `Ribbon.tsx`/`FeatureDialog.tsx` 等处
   再维护第二份 featureType/命令列表。
3. **参数入口**：`runCommand(id, args)`/`Tool.start(options)` 作为统一入口；AI/自动化
   复用同一命令与工具生命周期，不新建第二套建模 API（P0-05）。
4. **能力档位**：`full/gated` 仍由 capability 注册表提供；gated 点击走能力引导，不得
   静默 no-op；命令注册表是 capability 的输入，不替代能力账本。
5. **旧 if/else 兼容**：现有 `useToolActivation` 分支、featureType 专用对话框、快捷键
   分散逻辑先保留 adapter；shadow 阶段只读注册表，enforce 阶段才切换；不得一次性删除
   旧路径。
6. **命令/工具归属**：命令运行必须携带 session/document/workspace 上下文；禁止模块级
   单槽/全局 `tools.run` 串到其他 session。

### 2.3 Undo 所有权：操作组 + per-session 过滤

1. **操作组是唯一用户可见撤销单位**（沿用 ADR-G0-10）：一次已提交的用户命令产生一个
   `operationGroupId`；组内多个事务/OpLog 行原子撤销；不可逆组阻断 undo，不跳过。
2. **组元数据**：至少 `operationGroupId`、`author {userId,sessionId,briefcaseId}`、
   `invertible`、`createdAt`、`changesetId?`（push 后追加）、写入路径
   （feature/direct-edit/sketch）。元数据 additive；不新建第二套历史/状态机。
3. **per-session 过滤**：G2/G1 的 undo/redo/discard 只处理本 session 作者的行/事务；
   pull 后他人组进入本地库时必须跳过；无本会话组时返回“无可撤销操作”，不得借用他人组。
4. **物理分层、单一栈**：允许底层保留 `BriefcaseTxns`（直改）与 OpLog（特征/变量），
   但由 undo 协调器按组提交顺序统一解析；用户只看到一个 Undo/Redo 栈；不得同时提供
   “特征撤销/编辑撤销”两个入口。
5. **不可逆与 push 边界**：X-05 未关闭前，草图不可逆组必须显式拒绝/提示，不得计入
   “统一 undo 已覆盖草图”；X-15 未关闭前，push ack 后的 undo 不得假成功/不得把旧事务
   塞回已推送历史。
6. **失败语义**：只读会话、租约失效、fencing 失败、无权限时 undo/redo fail-closed，
   文档状态不变；禁止 no-op 假成功。
7. **G1 前置**：本契约只有在 G1 C1/C2/C3 会话隔离、B2.2 归因、S0-1 双用户证据成立后
   才可 enforce；之前只能 shadow，不得宣称 undo 隔离完成。

### 2.4 契约边界

1. **不实现多文档 UI/分屏/多视口**；只冻结 host/session/store/command/undo 契约。
2. **不实现 per-user 多会话共享 undo**；G2 按 per-session。
3. **不实现实时协同/presence/op 流**；实时需独立 ADR。
4. **不新建第二套选择/命令/undo 状态机**；host 只编排现有权威（store.canvas.selection、
   BriefcaseTxns、OpLog）。
5. **不替代 G1**：本 ADR 不修 ACL/归因/账本；这些是 G1 工作包。

---

## 3. 备选方案与拒绝理由

| 方案 | 内容 | 结论 |
|---|---|---|
| A | 保持模块单例 store/页面级连接 | **拒绝**：多文档/多会话状态互相污染；加 tab/装配要重写；已多次出现跨 scope 竞态。 |
| B | 每页一个 host，不做文档级 session | **拒绝**：同文档多视口/多 tab 仍共享状态；RPC token/undo 归属无稳定边界。 |
| C | 立即 process-per-document actor | **拒绝（G2）**：成本高且 G1 未通过；先把 host/所有权契约冻结，进程 actor 作为 HA 目标。 |
| D | 保留两套 undo，只按作者过滤 | **拒绝**：用户仍看到两套栈；跨路径顺序不可预测；违反 D0-10。 |
| E | 页签级 undo | **拒绝**：tab 共享文档，跨 tab 依赖/重建顺序无法用 tab 边界稳定表达；仍不解决直改/特征两层。 |
| F | CommandRegistry 只做 ribbon 菜单表 | **拒绝**：palette/keymap/capability/AI spec 仍分叉；命令参数/权限/审计无法统一。 |
| G | 本决策：DocumentSessionHost + store 工厂 + CommandRegistry + 操作组/会话所有权 | **采用**：与 G1 方向一致，可 shadow/回滚，不新建第二状态机。 |

---

## 4. 后果与风险

**正向**

- 每 session 有独立连接/RPC token/store/命令/undo，停止单例污染；为多文档/装配留宿主。
- 命令一处注册五处出现，AI/自动化复用同一命令与工具生命周期，减少“死命令/漂移”。
- 操作组 + per-session 过滤为用户可见 undo 提供统一语义；多会话下 B 不会撤销 A。
- 旧页面/旧命令/旧 undo 通过 adapter 兼容，支持 shadow/enforce 渐进。

**代价/风险**

- 改动面大：页面宿主、连接、store、ribbon/palette/keymap/capability/AI、undo 协调器；
  需要分阶段 shadow，不能一次性替换。
- 强依赖 G1 会话隔离/归因/双用户证据；G1 未过时只能做契约/shadow，容易被误读为
  “多用户已可用”。
- 两套物理 undo 的组映射复杂；任何组边界错误都会造成“撤销一半/顺序错乱”。
- 旧 OpLog 无 author 行在 enforce 下不可撤销，存在 UX 影响；不能伪造作者。
- 命令注册表可能变成新单体；必须保持 capability/工具注册/权限/审计的边界。
- 相机/undo 的最终粒度（文档/页签）仍未裁决；本 ADR 只要求显式策略、不串 scope。

---

## 5. 迁移、回滚与失败判据

### 5.1 迁移

1. **Adapter 先行**：保留模块单例/旧页面/旧 ribbon/旧 undo 为 `LegacySessionAdapter`；
   新 host/registry/coordinator 以 shadow 模式并行，不改变默认行为。
2. **session key**：先在日志/缓存/OpLog 归属中加 `documentRef/sessionId/workspaceRef`；
   旧 key 继续可用；shadow 记录串扰；enforce 才切换。
3. **store 工厂**：先把 `createPartStudioStore()` 从模块单例包装出来，由 host 注入；
   旧 `usePartStudioStore` 作为默认单例 adapter；逐步迁移消费方。
4. **CommandRegistry**：先注册一个 dummy 命令验证五处同源；再把 featureType 入口从
   `Ribbon.tsx`/`FeatureDialog.tsx` 的硬编码迁到注册表；旧 if/else 保留。
5. **Undo**：OpLog 增加可选 `operationGroupId/author/invertible`；原生事务用 label/
   appData 记录组边界；shadow 只记录映射/违规，enforce 才启用单一入口与作者过滤。
6. **发布顺序**：shared（可选字段/DTO）→ editor → viewer `dist` → web → backend；
   契约变更 bump 版本并双端同发布；不得用旧 `dist` 冒充新契约。
7. **旧数据**：无组/无 author 的旧 OpLog 按 legacy 行为；enforce 下不可撤销，UI 诚实
   提示；不回填伪造作者；不删除旧行。

### 5.2 回滚

1. `SESSION_HOST_MODE=off|shadow|enforce`：off 回到旧单例/页面连接；shadow 只记录；
   enforce 才启用 host。
2. `COMMAND_REGISTRY_MODE=off|shadow|enforce`：off 回到旧 ribbon/命令分支；shadow 只读
   注册表；enforce 才五处同源。
3. `UNIFIED_UNDO_MODE=off|shadow|enforce`（与 ADR-G0-10 建议名对齐）：off 回到按路径
   的旧撤销入口；组元数据保留但不消费；enforce 才启用单一栈/作者过滤。
4. `OPLOG_AUTHOR_FILTER=off|shadow|enforce`：off 恢复旧过滤；旧行/新行均可读，不回写。
5. 回滚不删除已写入的组元数据/会话记录；不把已推送事务重新变成可撤销；不删除历史。
6. 回滚必须保持旧页面/旧命令/旧 undo 可用；不得要求用户重开文档。

### 5.3 失败判据

- 仍有两个用户可见 undo 栈，或 UI 分别提供“特征撤销/编辑撤销”。
- A 的 undo 能回退 B 的组/事务；pull 后 undo 命中他人行；旧行被伪造作者。
- 组内部分成员被撤销、部分保留；组顺序与提交顺序不一致；最新不可逆组被跳过。
- 预览/取消/失败/no-op 产生可撤销组；push 后 undo 假成功或把旧事务塞回历史。
- 两个 session 共享 store/连接/RPC token/命令/选择；命令五处分叉；关会话误伤另一个。
- CommandRegistry 只是新壳，旧硬编码/分支仍是事实源；`runCommand` 无法带参数注入。
- G1 C1/C2/C3/S0-1 未通过就宣称 session/undo 隔离完成。
- S-G2-05 未通过就宣称 host/command/undo 冻结。

---

## 6. 证据状态

| 项目 | 状态 | 说明 |
|---|---|---|
| `DocumentSessionHost` | **未实现** | 公开树无类型；页面级单例 |
| per-session store | **未实现** | `usePartStudioStore` 模块单例 |
| 显式 RPC token | **部分/未完成** | 当前依赖全局 fallback；多连接串话需 spike |
| `CommandRegistry` | **未实现** | ribbon/palette/keymap/capability/AI 分散 |
| 操作组/undo 协调器 | **未实现** | 两层 undo；OpLog 作者过滤为设计 |
| 真栈双会话/undo | **Not run** | G1 S0-1 未完成；UD-01..UD-10 未执行 |
| X-05 草图 undo | **Open** | 整体覆写 op 非 invertible |
| X-15 push 后 undo | **Open** | autosave/push 边界 |
| X-20 WS 撤权窗口 | **Open** | 既有连接最长约 30s+探针 |
| ARB 签字 | **无** | 本 ADR 仍为 Proposed |

> 本 ADR 不把 C1/C2/C3 的代码/单测/隔离 canary 写成 G1 通过；不把 shadow 设计写成
> 统一 undo 完成。S-G2-05 与 G1 S0-1/UD-01..UD-10 未通过前，不得宣称 session host/
> command registry/undo ownership 已冻结。

---

## 7. 签字与状态

- 拟制依据：业主 2026-11-24 指令（G2 预冻结文档包，先契约后代码）。
- 当前状态：**Proposed under owner directive 2026-11-24; not ARB-signed**。
- 签字栏（待）：

| 角色 | 姓名 | 日期 | 结论 |
|---|---|---|---|
| Architecture owner | | | |
| Frontend/session owner | | | |
| Backend/ledger owner | | | |
| Security owner | | | |
| QA/e2e owner | | | |

## 8. 关联

- 计划：`G2-CONTRACT-FREEZE-PLAN-2026-11-24.md` C5/C6、阶段 4。
- Spike：`G2-SPIKES-2026-11-24.md` S-G2-05。
- ADR：`ADR-G0-09`（会话/进程模型）、`ADR-G0-10`（undo 粒度）、`ADR-G2-03`
  （typed tab/workspace 键）。
- 其他：`SESSION-ISOLATION-DESIGN.md`、`G1-EXECUTION-PLAN.md` C1/C2/C3、
  `EXCEPTIONS.md` X-05/X-15/X-20、`08` §4.4/§4.5、`09` §6/§8/§11。
- 未决：per-user 多会话 undo、跨 push undo 的逆操作、相机/undo 粒度、CommandRegistry
  与权限/审计的边界、process-per-doc 的最终形态。
