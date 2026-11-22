# 发布管理与 PLM 连接分析报告

> 分析对象：Onshape Help 组 `release-plm`（15 个主题，28,401 词）。
> 方法：只依据本地语料，不联网、不改仓库、不改输入。标注：`[文档明确]`=原文直述，`[推断]`=结构性推论；不确定处写“文档未说明”。

## 1. 本章概览

- **主题数**：15；**总词数**：28,401。
- **子域一：发布管理（Release Management）** —— 9 个主题，合计 10,072 词。覆盖：发布管理总览与术语、管理员设置、审批人指定、典型发布流程、发布候选的对象选择、审阅/批准/拒绝/丢弃、克隆发布包、修订历史与作废、配置的发布。
- **子域二：PLM 连接（PLM Connections）** —— 6 个主题，合计 18,329 词；其中 `Onshape Arena Glossary` 一个词表页占 6,872 词。覆盖：PLM 连接入口（仅 32 词的占位页）、Onshape–Arena 连接概念与对象映射、管理员双向配置（连接参数、类别/属性映射、Material/Mass、零件编号、发布同步开关、权限）、零件/装配/BOM 同步、发布管理与 Arena Change 同步、术语表。
- **文档更新日期**：语料未提供任何 last-updated / 发布日期字段，无法判断版本时效。
- **可用版本边界**：发布管理页明确写 **Only available for the Onshape Professional and Enterprise subscriptions**；Enterprise 额外支持自定义发布/作废工作流。PLM/Arena 各页的 “Only available for” 徽标在抽取中只剩文字、具体套餐名丢失；正文所有配置入口都是 `Enterprise settings`，角色均为 `Enterprise Administrator`，故 `[推断]` Arena 连接为 Enterprise 专属，但**文档未在本组内明确写出套餐名**。
- **抽取限制**：
  - 图片只剩 `[image: alt]`，按钮/图标/版本图标像素与 tooltip 不可见，多处步骤依赖截图；表格被压平成 `|` 行；超链接还原为纯文本。
  - 跨页引用（`Customizing Release Workflow`、`Release management` 设置细节、`Watermarks`、`Obsoletion`、`Arena` 配置页）**不在本组语料内**，只能覆盖被引用处字段，不能补全整套设置页。
  - 术语表 “Default Keyboard Shortcut” 均为 `n/a`；本组不含发布设置页完整字段（修订方案、水印、作废开关、自定义多级工作流），这是**明确的内容缺口**，后文逐处标注。
- **整体质量**：发布流程的状态、审批、修订/零件号、版本快照语义写得相当具体，足以支撑状态机与验收断言；Arena 配置篇的操作细节也较完整。弱项：视觉布局靠 alt、权限描述有矛盾、PLM 套餐/错误码未系统化、无审计日志章节。

## 2. 主题清单与逐篇摘要

| 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|
| Release Management | Release Management | `/Content/Release/release_management.htm` | 发布管理总览：基于版本控制、非阻塞的自动化发布工作流，定义 Version/Workspace/Release candidate/Approver/Observer/Revisionable object 等术语，并给出 In progress→Pending→Released/Rejected、作废后版本图标变化的完整状态语义。 |
| Setting Up Release Management | Release Management > Setting Up Release Management | `/Content/Release/setting_up_release_management.htm` | 公司/企业管理员在 `Company/Enterprise settings > Release management` 勾选 `Enable managed workflows` 并保存，从而启用发布工具；同时说明用户可在 `My account > Preferences` 把审批职责委派给他人或团队，委派不可再委派。 |
| Specifying Approvers | Release Management > Specifying Approvers | `/Content/Release/specifying_approvers.htm` | 默认不要求审批人且创建者可自批；可通过 Professional 的 `Restrict approvers to these users or teams` 或 Enterprise 的 `Approve Releases` 全局权限限定审批人；并规定项目角色、团队、个人重复列名时的审批计数规则与 `Missing permissions` 处理。 |
| Typical Release Workflow | Release Management > Typical Release Workflow | `/Content/Release/typical_release_workflow.htm` | 以单件为例详述四种启动入口、`Create Release candidate` 对话框的全部字段与按钮、修订/状态/零件号自动规则、装配与工程图发布的特殊行为，以及搜索过滤、属性编辑、错误过滤、刷新、回退到上一修订、发布草稿、链接对象与非修订管理对象。 |
| Selecting Parts for a Release Candidate | Release Management > Selecting Parts for a Release Candidate | `/Content/Release/selecting_parts_for_a_release_candidate.htm` | 候选创建后可从当前工作区追加 Part Studio/Assembly/Drawing/Variable Studio/File，也可从其他文档添加；派生或链接对象自动纳入；文档跨企业转移后旧修订元数据不随迁；待审发布中的同件会提示。 |
| Reviewing, Approving, Rejecting Candidates | Release Management > Reviewing, Approving, Rejecting Candidates | `/Content/Release/reviewing_approving_rejecting_candidates.htm` | 审阅者从通知/邮件/草稿面板/版本历史进入 `Review Release` 对话框，按角色执行 `Release`、`Reject`、`Discard`；说明通知合并规则、审批人颜色状态、评论历史、复制发布链接、作废后仍标记 Released，以及从发布分支出工作区会丢失 Revision/Date approved/Date released。 |
| Cloning a Release Package | Release Management > Cloning a Release Package | `/Content/Release/cloning_a_release_package.htm` | 仅当处于上一发布包来源分支的工作区时，才能从已发布/已拒绝发布包 `Clone` 出新候选；新候选把旧对象替换为当前工作区版本，可改对象/修订/零件号/名称/备注/审批人，并继承整条克隆链的历史评论；工作区中不存在的顶层对象不会带入。 |
| Viewing History and Obsoleting Parts | Release Management > Viewing History and Obsoleting Parts | `/Content/Release/viewing_revision_history_and_obsoleting_parts.htm` | 通过对象右键菜单打开 `Revision history` 查看每次修订的发布者、发布名、日期、版本文档与对象类型；`Obsolete revision` 打开作废候选，可勾选 `Mark revision as re-releasable` 复用修订号，提交后禁止该修订再进入任何发布/装配/工程图，并提示引用已作废修订的装配/工程图。 |
| Releasing Configurations | Release Management > Releasing Configurations | `/Content/Release/releasing_a_configuration.htm` | 每个配置被当作独立的可修订对象；发布活动配置或通过 `Add Items to Release` 对话框配置输入后 `Generate` 多个配置一并发布；已发布版本锁定具体配置，插入时不允许改配置输入，未纳入属性的配置输入按默认值参与发布与修订引用。 |
| PLM Connections | PLM Connections | `/Content/Plans/plm_connections.htm` | 仅 32 词的入口页：PLM Connections 让 Onshape 把 MCAD 数据发送给受支持的 PLM 供应商，当前唯一受支持连接是 The Onshape Arena Connection。 |
| The Onshape Arena Connection | PLM Connections > The Onshape Arena Connection | `/Content/Plans/onshape_arena_connection.htm` | 建立 Onshape 与 Arena 的概念对照：Document/Workspace/Version/Branch、Part/Part Studio/Assembly/BOM、Category/Property/Attribute、Arena Item/Revision/Change；给出管理员配置→设计→Arena Change→Onshape Release candidate→单向同步→Arena 审批回传的总体工作流与文件类型。 |
| Configuring Arena and Onshape | PLM Connections > The Onshape Arena Connection > Configuring Arena and Onshape | `/Content/Plans/configuring_arena_and_onshape.htm` | 管理员配置手册：Arena Support 开通工作区并发放 workspace ID/token，Onshape 填 API URL 后建立 1:1 连接；详述类别/属性映射（含 List 的 value+label 规则、Structural 类别、Invalid/Incompatible mapping）、Material/Mass、零件编号、发布同步所需开关、`Sync to PLM` 权限。 |
| Syncing Parts, Assemblies, and BOMs | PLM Connections > The Onshape Arena Connection > Syncing Parts, Assemblies, and BOMs | `/Content/Plans/syncing_parts_assemblies_and_boms.htm` | 不启用发布同步时，仍可把带零件号的零件/装配单向同步到 Arena Working Revision，并建立可回溯链接；BOM 同步支持多层首次全量、后续一层，`Subassembly BOM behavior` 决定 Arena 中的 Item 形态，`OnshapeCreated` 标识 Onshape 自有行且这些行会被下次同步覆盖。 |
| Syncing Release Management | PLM Connections > The Onshape Arena Connection > Syncing Release Management | `/Content/Plans/syncing_release_management.htm` | 将 Onshape Release candidate 与 Arena Change 关联：Release 名/备注可由 Change 号/标题自动填充，提交后传对象与 PDF/STEP/DXF/PVZ/GLTF 文件，Arena 审批（Change Complete）回传使 Release 变 Approved；另述 Onshape 修订号同步、强制 Release/Reject/Discard 的前提与“拒绝不回传”的边界。 |
| Onshape Arena Glossary | PLM Connections > The Onshape Arena Connection > Onshape Arena Glossary | `/Content/Plans/onshape_arena_glossary.htm` | A–W 术语表，逐条标注 Context（Arena/Onshape/Both）、User level permissions 与 See Also；集中定义 Arena 访问策略/审批角色/Change/生命周期/修订类型/属性规则/结构类别，以及 Onshape 的 State/Part number/Revision/Not revision managed/Sync to Arena 等，是本章术语的归一化来源。 |

**覆盖自查：15/15 主题均已入表，15 个 URL 全部出现。**

## 3. 核心概念与术语

### 3.1 版本控制对象模型

- **Document**：顶层容器，含任意数量 Workspace；文档内以 Tab 承载 Part Studio、Assembly、Drawing、Variable Studio、导入文件等。`[文档明确]` Arena 没有 Document 等价物。
- **Workspace**：可编辑的文档迭代；等价于 Arena 的 **Working Revision**。文档可多工作区；分支以工作区收尾。
- **Version**：某一时刻的不可变快照；经 `Create version` 创建，出现在 `Version Manager` / `Versions and history`；可带属性（metadata），可从此建分支。所有文档以名为 `Start` 的版本和名为 `Main` 的工作区开始。`[文档明确]` 版本不可变。
- **Branch**：版本图中的命名分叉，从版本分出、以工作区结束、可含 0–N 个顺序版本；Arena 无等价物。
- **History entry**：工作区一次变更记录，可在 `Versions and history` 右键比较或恢复。
- **Revisionable object**：Part、Assembly、Drawing、Variable Studio、File（含翻译或未翻译导入文件）。`Revision history` 对话框把类型显示为 Part、Assembly、Drawing 或 **Blob**。
- **Release candidate**：用户选定、一起走发布流程的一组可修订对象；可小到单件，也可覆盖整套产品。
- **Release package / Release**：候选提交后在版本上形成的发布记录；发布名即版本名。
- **Release draft**：尚未提交的候选草稿，存于 `Release drafts` 面板。
- **Not revision-managed**：可纳入发布作参考、但不跟踪修订的对象；可设在 Part Studio（连同其全部零件）、Assembly、Drawing、Variable Studio、File、单件零件，甚至整个 Document 上。
- **State**：对象的发布状态；术语表定义为 `In progress`（默认）、`Pending`、`Rejected`、`Released` 四态，另在版本图标/修订历史中出现 `Obsolete`。`[文档明确]` State 字段仅在版本中、且 Release management 关闭时才可直接编辑。

### 3.2 发布状态机（综合多页）

```
工作区对象: In progress（默认，可编辑）
   │ 创建 Release candidate
   ├─ 无审批人 ──► Released（创建者立即发布）
   └─ 有审批人 ──► 提交 Submit
                     │ 生成版本；版本名=Release name；候选对象 State=Pending
                     ├─ 审批通过 Release ──► Released
                     ├─ 审批拒绝 Reject ──► Rejected
                     └─ 创建者/管理员 Discard ──► 发布被删除，仅保留普通版本
Released/Rejected ── Clone ──► 新候选（从当前工作区分支）
Released ── 手动或自动作废 ──► Obsolete
```

关键规则：

- `[文档明确]` **状态变更发生在同一个版本上**；该版本是发布修订的不可变事实源。
- `[文档明确]` 提交时自动创建版本，版本名自动取发布名；Pending 用空心三角图标，Released 用实心三角，Rejected 仍为空心三角，含作废对象的已发布版本用“实心三角+点”。
- `[文档明确]` 团队在审批期间不被锁死，可继续编辑工作区、建版本甚至发别的发布；流程非阻塞。
- `[文档明确]` 通知只在“新修订被批准”时发给用户；**创建新版本不会触发“已更新”通知**，以免误报。
- `[文档明确]` Rejected 候选可当普通版本使用；Discard 后发布被删除但保留历史，作为普通版本存在；已作废 Release 再 Discard 时在版本历史中仍标 Released。
- `[文档明确]` 同一零件若存在两个 Pending 候选且 pending revision 相同，**先批准者获得该修订号**；系统不会自动丢弃另一个候选，只能由人 Discard 或 Reject。
- `[文档明确]` 从 Release 可以正常 Branch；但由版本分支出工作区时，`Revision`、`Date approved`、`Date released` 等发布元数据**不会传播**，在新工作区为空。

### 3.3 版本图标语义

| 图标描述 | 含义 | State/结果 |
|---|---|---|
| 空心三角（open triangle） | Release candidate | Pending（评审中）；Rejected 也用同一空心图标的红色版本 |
| 实心三角（solid triangle） | Approved/Released | Released |
| 实心三角+点 | Approved but with obsoleted items | Released，且其中一项或多项已 Obsolete |
| 无发布标记 | Discarded release | 退化为普通 Onshape version |
| 作废图标 / 自动作废图标 | Obsoleted / auto-obsoleted | Revision history 中显示，且 `Obsolete revision` 按钮变 `View obsoletion` |

补充：Pending/Rejected/Released/Obsolete 发布在 `Review Release` 顶部都有复制链接图标，可复制发布 URL。

### 3.4 角色与权限（横向归纳）

| 角色 | 权限/能力 | 约束 |
|---|---|---|
| 企业管理员 | 启用受管工作流、定义审批要求、限制审批人（Professional 名单 / Enterprise `Approve Releases`）、全局权限、控制已发布属性编辑、覆盖作废 re-releasable、Reject/Discard 候选 | `Save release settings` 保存；配置能力与工具使用分离 |
| 文档编辑者 / Creator | 建候选、存草稿、提交、Refresh；默认可自批；可 Reject/Discard（Pending）；收全部通知 | 工具使用需 Edit 权限；Refresh/Discard 限创建者（Discard 还可管理员） |
| Approver（个人/团队/项目角色） | Approve/Reject 整个候选 | 需文档权限，**术语页 Edit vs 审阅页 View 冲突**；团队/角色一票；委派仅个人票 |
| Observer | 查看候选/发布并收通知 | 不能 Release/Reject/Approve/Discard；需 View |
| Delegate | 代处理待审请求 | 不可再委派；发布时委派人与被委派人都收通知 |
| Enterprise `Sync to PLM` 持有者 | 发起零件/装配/BOM/发布同步 | 需同邮箱 Arena 账号、Arena 建改 Item 权限 |
| Arena / Onshape 管理员 | 配置 Arena 工作区、类别/属性、编号、Change、Onshape 连接与映射 | 同邮箱、完整 Arena 许可、工作区读写、配置前至少登录一次 |
| Integration user / Arena Change admin | 集成账号；唯一可 Force Approval/Rejection、可改同步来的 Revision | 集成账号不可 UI 登录；非 Change admin 编辑时 Revision 字段禁用 |
| Arena 其他角色 | Full 读写、Light 只读、Collaborative Approver、Supplier 受限 | 与 Onshape 角色不同域 |

### 3.5 审批规则

- **默认无审批人**：创建者可自批；管理员可要求必须有审批人，并/或要求审批人不能是创建者。`[文档明确]`
- **团队**：Approvers 字段列团队时，只需一名成员批准，即使设置里勾了 `Require approval from all approvers`。`[文档明确]`
- **项目角色**（Enterprise；在 Approvers 字段填角色名）：
  1. 角色内第一个批准者代表整个角色，一个角色一次批准即足够；
  2. 若同一人又被单独列为个人审批人，其批准只算个人，角色仍需另一人批准；
  3. 若同时列团队与项目角色且此人身兼两者，先计团队批准，角色仍需另一人批准；
  4. 委派不影响角色：角色成员委派给他人，被委派者只代表个人批准。`[文档明确]`
- **拒绝权**：仅被指派的审批人、管理员、候选创建者可拒绝。`[文档明确]`（与“审批人可 Approve/Reject”一致，但管理员/创建者被额外赋权。）
- **必需备注**：若设置 `Require a note in the Release dialog`，审阅者必须在 `Release notes` 输入文字才能继续。`[文档明确]`
- **通知**：每个 Release 只发一条应用内通知，后续动作更新该通知状态；邮件则每个动作都发，包括新增评论。多级工作流的通知只在动作所在层级内发送，创建者例外地收到全部通知。`[文档明确]`
- **审批结果写回工程图**：批准后，Drawing 属性会写入审批人姓名与批准日期（参见 `Custom Drawing Templates`）。`[文档明确]`

### 3.6 修订命名与零件编号

**Revision（修订号）**

- 管理员设置方案：`alphabetic`、`numeric` 或 `custom`。`[文档明确]`
- 新发布自动递增；只能向前，不能回退（上一版 B 则建议 C；可输入 C 之后的任意字母，不可改 A）。`[文档明确]`
- 可手工改写修订号，但必须使用**尚未使用且未被跳过的**标签；审阅页强调不能使用已跳过标签。`[文档明确]`
- 首次在开启发布管理后发布时，Onshape 试图保留 Part/Assembly/Drawing 的既有修订值（如从 SOLIDWORKS 导入的 3）；若与方案不符则警告并调整到方案值（例：数字 6 在字母方案下变 A）。`[文档明确]`
- 修订号只存在于发布过程的对象/版本上；**工作区对象默认没有 Revision 标签**，除非在 Part properties 手工填写。`[文档明确]`
- 每次新发布时前一修订自动作废（Revision history 表述）；另有独立设置 `Automatically obsolete previous released revisions`，Arena 同步场景要求开启，以模拟 Arena 自动 supersede 行为。`[文档明确]` 两条机制的关系文档未说明。
- 作废时勾 `Mark revision as re-releasable` 可复用该修订号；若当时未勾，管理员事后可覆盖为可重发。`[文档明确]`
- Onshape 修订方案与 Arena Revision Sequences **相互独立**，可能失配；`Go to Arena` / `Open in Onshape` 可能跳到对方错误修订。`[文档明确]`

**Part number（零件号）**

- 每一可发布对象需唯一零件号；Onshape 跨发布跟踪，**禁止用已有零件号的更低修订重发**。`[文档明确]`
- 顺序编号：可在候选对话框逐项点图标生成，或点顶部图标为全部对象生成；`Numbering schemes > Release names` 另有发布名顺序生成。`[文档明确]`
- `Drawing can reuse part number from an assembly or part in the release`：批量生成时，只有“工程图与图中插入对象都无零件号且图中仅一个对象”才生成新号；若任一侧已有号，则把已有号赋给双方；多对象工程图生成新号；仍可逐项单独生成。`[文档明确]`
- 长度：Onshape Part Number 最多 **128 字符**；Arena Item Number 可达 **200 字符**；Arena 编号格式须生成 <128 字符且不得含自由文本字段（针对被 Onshape 映射的类别）。`[文档明确]`
- Arena 侧：Onshape 拉取零件号时在 Arena **预占（reserved）**，但直到零件同步才创建 Arena Item。`[文档明确]`

### 3.7 配置（Configuration）处理

- `[文档明确]` 每个配置被视为**独立的可修订对象**；不是“零件的一个属性”。
- 发布活动配置：先在 Part Studio/Assembly 设置配置输入，再右键已配置零件或实例 `Release`；对话框默认带当前活动配置。`[文档明确]`
- `Add Items to Release` 与 `Insert parts and assemblies` 对话框同构：改配置输入 → 可 `Set to last viewed configuration`（配置图标下拉）或 `Reset to default` → `Generate` → 点生成结果加入 → `Add`；一次发布可含同一零件的多个配置。`[文档明确]`
- 发布后只有**具体被发布的配置**可从 Released 版本复用；其他配置需另行发布。插入已发布的已配置零件时，是插入一个具体已发布对象，**不允许改配置输入**。`[文档明确]`
- `[文档明确]` 被排除出属性的配置输入按默认值处理，发布包与修订引用使用这些默认值。
- 发布包含已配置零件的 Assembly 时，只发布该 Assembly 引用到的具体配置；不会顺带发布其他配置。`[文档明确]`

### 3.8 PLM/Arena 对象映射

| Onshape | Arena | 说明 |
|---|---|---|
| Document | 无等价物 | Document 是顶层容器 |
| Workspace | Working Revision | 可编辑迭代 |
| Version | Revision Control（类比） | 不可变快照 |
| Branch | 无等价物 | 命名分叉 |
| Part / Assembly / Drawing / File | Item | Arena Item 是零件、流程或文档；BOM 使其成为装配 |
| Part Studio | 无等价物 | 设计容器，不是模型 |
| Onshape Item（BOM 中的非几何件） | Arena item（不同概念） | 文档反复警告勿混淆同名概念 |
| Category | Category | 先在 Arena 定义，再映射到 Onshape |
| Property | Attribute | 属性=属性值字段；Onshape 为映射属性的主系统 |
| BOM（Assembly 生成） | BOM（Items 列表） | Arena 有 Indented/Flat 等视图 |
| Release candidate + Release | Arena Change（审批驱动） | Release 名/备注可自动取 Change 号/标题 |
| Revision（发布修订） | Revision（working/effective/pending/superseded） | 方案独立，需人工/流程保持一致 |
| — | Change Administrator / routing / voting stage | Arena 侧审批机制，Onshape 无等价物 |

### 3.9 审计与通知载体

- `Versions and history` 发布图标 + 右键 `Releases`；`Revision history` 的作废图标、修订标签、发布者、发布名、发布日期、版本、文档名、类型、`View release`/`Export`。
- `Review Release` 评论 + `comment history`（批准/拒绝/作废后仍可追加）与复制发布链接；Approver 绿/红/灰；Drawing 写审批人+日期。
- Properties 的 `Last sync`/`Open in Arena`；Enterprise `Job queue` 的 BOM/发布同步作业；Arena Change 的 Implementation Status/Notes/Files 与 Dashboard Notifications。`[文档明确]`

## 4. 功能与 UI 明细

### 4.1 `Company/Enterprise settings > Release management`

- **入口**：User menu → `Company/Enterprise settings` → 左栏 `Release management`。`[文档明确]`
- **启用**：勾选 `Enable managed workflows`，逐段配置，最后点页顶或页底的 `Save release settings`。`[文档明确]`
- **关闭**：不勾选即关闭发布工具，改用企业自有的手工修订属性流程（引用 `Release Workflow & Data Management` 技术简报）。`[文档明确]`
- **页面元素**：发布工作流示意图；Enterprise 可在每个工作流行右侧用 Expand Action 展开/收起示意图下拉。`[文档明确]`
- **本组出现的设置项**：`Restrict approvers to these users or teams`、审批人必需/不得为创建者（描述性）、`Require approval from all approvers`、`Require a note in the Release dialog`、`Only administrators can edit the properties of released objects`、`Watermarks > Show watermark for unreleased drawings`、`Obsoletion > Automatically obsolete previous released revisions`、默认工作流 `Onshape Arena release workflow`。
- **未覆盖**：修订方案、零件号唯一性、发布名编号、水印具体样式、作废审批流、自定义多级工作流编辑器的完整字段，**本组语料没有**。

### 4.2 审批人管理 UI

- **Professional**：`Release management` 设置 → `Create Release candidate` 对话框标题下 → 勾 `Restrict approvers to these users or teams` → 文本框输入个人邮箱或选择团队；团队被允许时，团队或任一成员可出现在 Approvers 字段。`[文档明确]`
- **Enterprise**：`Global permissions` → `Approve Releases` → 右键 `Manage users` → 指定个人/团队可进入 Approvers 字段。`[文档明确]`
- **项目角色**：直接在 `Create Release candidate` 的 `Approvers` 字段输入项目角色名；角色名会以浅蓝底显示为 `Approve releases`（截图 alt）。`[文档明确]`
- **缺权限**：若审批人或团队无文档权限，弹 `Missing permissions` 对话框，点 `Share with mentioned approver` 共享文档。`[文档明确]`
- **委派**：`My account > Preferences > Release management` → 勾 `Delegate approval to another user or team` → 输入团队/邮箱或从已知列表选；委派者每次登录/刷新见提示，被委派者收分配通知，发布时双方均收通知。委派不可传递：A→B、B→C 时 C 只收 B 的请求，不收 A 的。`[文档明确]`

### 4.3 `Create Release candidate` 对话框

**四个启动入口**（`[文档明确]`，候选创建仅浏览器）：

1. Part Studio 的 Parts list 中右键零件 → `Release`；预填所选零件。
2. 任意 Tab（Part Studio、Assembly、Drawing、Variable Studio、导入文件）右键 → `Release`；预填该 Tab 内容；Drawing 还会带入其所属零件/装配。
3. 任意对象/Tab 的 `Properties` 对话框 → 左上角 Release 图标；预填所选零件或 Tab 内容。
4. 已打开的 `Versions and history` 面板 → Release 图标；预填当前活动 Tab 的对象。

**对话框行为与按钮**：

- 可拖边/角缩放；改动过的字段左上角黄三角；对话框内 Undo/Redo 可用按钮或 OS 快捷键。
- 已选对象列出（Assembly 展开全部零件）；`+` 加对象；点对象名在新 Tab 打开设计；红 X 移除；搜索 + Filter 类型多选 + `Clear`。
- `Include associated drawings` 加入关联工程图；过期图警告；引用不同工作区版本的图不自动加入，需同工作区建图或图内建版本。
- `Refresh` 仅创建者且对话框打开时可用；带入他处改动，并发时候选侧优先。回退按钮仅对上次发布过的 Assembly/Drawing，几何未变 metadata 变才出现；同工作区引用可回退，取消则撤销。
- `Save draft` 存草稿并关闭；`Submit` 仅在有审批人时出现，建版本置 Pending 并通知；无审批人时点击 Release 立即发布；`Close` 不保存。
- 错误计数按钮：缺号/同号时显示，切换只显示问题项/全部，修正后递减消失。

**字段表**：

| 字段/按钮 | 规则 | 默认/生成 |
|---|---|---|
| Revision | 自动按方案与历史；可改但不得回退/用跳过标签 | 自动 |
| State | In progress（首次）/ Pending / Released（已发布链接对象） | 自动 |
| Part number | 唯一；跨发布跟踪；禁止低修订重发；可用图标生成 | 空，需填或生成 |
| Release name | Onshape 必填；显示为版本名；可顺序生成 | 自动/手工 |
| Release notes | 管理员可要求；可配合 `Require a note` | 空 |
| Approvers | 邮箱/团队/项目角色；空=立即发布；有=Pending | 空 |
| Observers | 仅查看、收通知；可无 | 空 |
| Edit properties | 打开对象属性视图，可切换对象；Apply/Go back 保存 | — |
| Export | 导出该发布/其中实体，打开 Export 对话框 | — |

**已发布对象属性编辑**：默认勾 `Only administrators can edit the properties of released objects` 时，已发布对象的已配置属性不可编辑；取消勾选后，管理员可编辑，其他人也可按公司策略编辑，但**发布管理关键属性**除外。`[文档明确]`

### 4.4 `Add Items to Release`（选择对象）

- 入口：候选对话框 `+`。`[文档明确]`
- 可按 Part Studio、Assembly、Drawing、Variable Studio、Files 分类选择；搜索框支持名称/部分名称。`[文档明确]`
- Professional/Enterprise 可切 `Other documents` Tab 选其他文档对象（DESC 写 Enterprise only，正文写 Professional and Enterprise——**内部不一致**）。`[文档明确/冲突]`
- 从同一文档的其他版本或其他文档的版本添加顶层对象时，列表项旁显示“链接自其他版本”图标。`[文档明确]`
- 点左侧对象加入右侧清单，`Add` 完成；红 X 移除；若加入的零件已在另一 Pending 发布中，对话框提示。`[文档明确]`

### 4.5 `Review Release` 对话框（审阅/批准/拒绝/丢弃）

**进入方式**：通知链接、邮件链接、`Release drafts` 面板双击草稿、`Versions and history > Releases > 发布名`。`[文档明确]`

**审阅要素**：

- 核对信息与 `Revision label`（可覆盖为未用标签，不得用已跳过标签）；点对象名开 Tab；Properties 图标查看/编辑属性。
- `Release` 标记已发布；`Reject` 置 Rejected（仍空心三角）；`Discard` 删除发布、退化为普通版本，仅创建者/管理员，作废发布 Discard 后仍标 Released。
- 红 X 仅移除顶层项（Assembly 有 X，组件无 X）；`Part number` 列是对象号，“Part” 为泛称；Pending/Rejected/Released/Obsolete 有复制链接。
- 任何人可加评论，其他列名用户收邮件+Notifications，`comment history` 可查全部，批准/拒绝/作废后仍可加；Approver 绿/红/灰，Discard 无颜色变化；批准后通知并写 Drawing 审批人/日期。`[文档明确]`

### 4.6 版本历史、修订历史与作废

- **入口**：零件 Parts list、Assembly、Variable Studio、Drawing Tab 右键 → `Revision history`；iOS/Android 为 Assembly Tab 点按或已发布零件 overflow 菜单。
- **对话框字段**：作废图标、Revision label、发布创建者、Release name、发布日期、被发布文档版本、文档名、类型（Part/Assembly/Drawing/Blob）、`View release`、`Export`；点版本名开新 Tab。
- **作废**：`Obsolete revision` 打开 `Create Obsolete candidate`；`Mark revision as re-releasable` 允许复用标签（未勾时管理员可事后覆盖）；`Add to Obsolete candidate` 可加多对象。有审批人邮箱则 `Submit`，否则 `Obsolete` 直接生效；作废后从生产移除、禁止再纳入任何发布，通知审批人与发起人；回看时按钮变 `View obsoletion`，自动作废另有图标。
- **硬约束**：已作废修订永不进入 Assembly/Drawing 插入对话框；含其引用的装配/工程图新建候选时警告；评论在作废后仍可加（浏览器/iOS）。`[文档明确]`

### 4.7 克隆发布包

- **前提**：对文档有相应权限；处于上一发布包来源分支的工作区；否则看不到 `Clone`。`[文档明确]`
- **步骤**：打开该分支工作区 → `Versions and history` → 选中顶层分支 → 右键发布版本名 → 悬停 `Releases` → 选发布 → `Review Release` 对话框 → `Clone`（从当前工作区重建）→ `Create Release candidate` 用工作区零件替换旧发布零件 → 可增删、改 Revision/Part number/发布名/备注/审批人/观察者。`[文档明确]`
- **评论**：上一发布全部评论仍在；克隆链评论累积（C 克隆自 B，B 克隆自 A，则 C 显示 A+B 评论）；评论页有查看原始发布的链接。`[文档明确]`
- **缺失对象**：克隆工作区中找不到的顶层对象不带入克隆发布。`[文档明确]`
- 必填完整后可在评论对话框按角色 Apply/Release/Reject/Discard；不完整须回 `Review Release` 补齐。`[文档明确]`

### 4.8 配置发布 UI

- `Create Release candidate` 默认显示活动配置；`+` 打开 `Add Items to Release`（同 Insert parts and assemblies）：改输入、`Set to last viewed configuration` 下拉（Configurations 图标）、`Reset to default`、`Generate`、点生成对象加入、`Add` 返回。`[文档明确]`
- 一次发布可 Generate/加入同一零件的多个配置；红 X 移除。`[文档明确]`
- 已发布配置在插入时锁定，不能改输入。`[文档明确]`

### 4.9 `Properties` 对话框中的发布/同步入口

- Part/Part Studio/Assembly/Drawing/Variable Studio/File 的 Properties：左上角 Release 图标；底部 `Not revision-managed` 复选框。`[文档明确]`
- 对象级 `Not revision-managed` 可设在 Part Studio（含全部零件）、Assembly、Drawing、Variable Studio、File、单件；Part Studio Tab 不会把该属性值显示为 overridden。`[文档明确]`
- Arena 同步（同步篇）：`Part number` 必须有值 → 顶部 `Sync to Arena`；成功后悬停图标看 `Last sync` 日期时间，出现 `Open in Arena` 图标。`[文档明确]`
- `Require category mapping for sync` 默认勾选；未映射类别时类别及值不发送；取消勾选则未映射类别会以 `uncategorized` 进入 Arena。`[文档明确]`

### 4.10 `Enterprise settings > Arena`（连接与全局同步）

- **连接字段**：`Enable Onshape Arena connection` 复选框；`Arena Workspace ID`；`Arena Workspace name`（只读，成功后自动填）；`API web token`；`Arena API URL`。保存后 Onshape 联系 Arena 登录；成功后填工作区名。`[文档明确]`
- **不可改**：连接成功保存后，不经 Onshape Support 不能更改/编辑；切换目标工作区需先在 Onshape 重置连接，再由新 Arena 工作区重新提交申请；建议用企业沙箱连 Arena 沙箱测试。`[文档明确]`
- **General sync settings**：全量清单引用 `Arena` 页（本组未给），但明确三项：`Sync Onshape release management with Arena changes`（勾选后候选与 open/unlocked Arena Change 同步，Change 驱动审批，Arena 批准后回传 Approved，并在 Release management 设置中激活 `Onshape Arena release workflow`）、`Match release candidate name with Arena change`（推荐）、`Sync release notes with Arena properties`（推荐）。
- **Mapping 表**：Arena category 列（Sync 启用时从 Arena 读取）；Onshape category 列（未映射显示 `Not Mapped`）；Mapping 列显示提示或 Edit 图标；顶部有 `Search table`、`Show unmapped categories`、`Only show mappings with errors`；错误映射置底。`[文档明确]`
- **Part numbering**：`Enterprise settings > Numbering schemes`，按对象类型建方案；`Save changes` 只保存当前 Tab（Release objects / Standard content / Items / Release names），各 Tab 独立。`[文档明确]`
- **Material/Mass**：在 Onshape `Enterprise settings > Categories` 为 Mechanical Parts 等类别选 `Onshape Part` 为父类别以继承属性；在 Arena 建 `Materials`、`Mass` 两个单行文本属性并挂到 Part > Mechanical；回到 `Arena > Mappings` 确认 Mass/Materials 映射到 Onshape Mass/Material；`Update mapping`。`[文档明确]`
- **权限**：`Enterprise settings > Global permissions` → `Sync to PLM` → 双击 → 指定 Individuals/Teams → `Add` → `Close`。`[文档明确]`

### 4.11 Mapping 编辑器细节

- 类别映射：Onshape category 下拉；同名类别自动预填；可点 `+` 新建 Onshape 类别并自动映射，`Create` 确认。类别映射后才能映射属性；属性下拉也支持用 Arena attribute 作模板新建 Onshape property。`[文档明确]`
- **List 类型**：每个 Onshape 列表项是 `value` + `label` 对，必须：
  1. value 与 label 映射到**同一个** Arena option；
  2. 该 pair 唯一映射到恰好一个 Arena option；映射到 0 个或多个不同 option 都是错误；
  3. Arena options 彼此区分（`ONE` 与 `ONE_ALT` 不同；Onshape 不改写）；
  4. 允许 Onshape 的 pair（如 `one`/`One`）只匹配其中一个 Arena option；
  5. 不要求 Onshape 覆盖全部 Arena options；缺 option 不报错，只校验 Onshape pair。`[文档明确]`
- 例子：`value=one,label=One` 对 Arena `(ONE,TWO)` 合法；`value=a,label=B` 或 `value=one,label=one_alt` 均非法（不同/多个 option）。`[文档明确]`
- **同步取值**：尽量用最新缓存的 Arena 元数据；若 Onshape/Arena 不一致，**Arena options 优先**（例：Arena `Area,Length,Each` vs Onshape `area,length,each`，同步用 Arena 值）。`[文档明确]`
- **Structural 类别**：Arena 的父类别若为 Structural，必须先映射父类别再映射子类别；Onshape 无 Structural 概念，需把映射到 Structural 的 Onshape 类别 **remove scope** 使其不可被用户选择；连接器不会自动给在映射时新建的 Onshape 类别赋 scope。`[文档明确]`
- **任意 Onshape 属性 → Arena 单行文本**的序列化：Boolean `True`/`false`；Integer 字符串（`42`）；Double 全精度字符串（文本目标不舍入）；Date ISO 8601（`YYYY-MM-DD`）；User `First Last`；多用户逗号分隔；Value with Units `145 kg`；Enum 原样字符串。`[文档明确]`
- **Arena 类别改名**会产生新 category ID，Onshape 侧仍找旧 ID，映射变 `Invalid mapping`；应删除旧映射（释放 Onshape 类别）再重映射；所有 Invalid mapping 置底。`[文档明确]`
- **非文本 Onshape 属性 → Arena 文本字段**（如 Boolean→Text）显示 `Incompatible mapping` 警告，仅信息性、非校验错误。`[文档明确]`
- **不可删除映射**（垃圾桶灰化）：未选类别；所选中类别有已映射子类别；所选中类别未映射；所选中类别 inactive。`[文档明确]`

### 4.12 BOM 同步 UI

- 打开 Assembly → 右侧 BOM 表图标 → 表顶部 `Sync BOM to Arena`；异步，状态在 `Enterprise settings > Job queue`；完成后 `Open in Arena` 可用；未同步的新改动不会出现在打开页（只到上次同步）。`[文档明确]`
- **`Subassembly BOM behavior`**（Assembly Properties）：
  - `Show Assembly and components`：装配、子装配、零件分别同步为独立 Item；
  - `Show Assembly only`：只同步为一个 Item；若顶层选此项，`Sync BOM to Arena` 与 `Open in Arena` 均禁用，不能同步；
  - `Show components only`：零件分别同步（phantom assemblies）；
  - 顶层装配尊重所有子装配的该设置；候选对话框会提示因该设置 BOM 不会同步到 Arena。`[文档明确]`
- **前置**：BOM 中所有零件、Standard content、Items 都要有零件号；顶层 Assembly 也必须有零件号（可在 BOM 表顶层行或 Properties 设置）。`[文档明确]`
- **层级**：首次同步多级 Assembly 会走完整棵树、按需创建/链接 Item；后续同步只深一层（所选装配及其直接子项）。`[文档明确]`
- **归属**：同步插入的 BOM 行 `OnshapeCreated` 标为 YES（另一段写插入值 `Y`，**表述不一致**）；Arena 可安全新增行，但修改 Onshape 自有行的数量等会在下次同步被覆盖。`[文档明确]`
- 同步方向始终是 Onshape 工作区 → Arena Working Revision；Arena BOM Custom View 显示同步生成的缩略图。`[文档明确]`

### 4.13 Arena 侧与发布同步 UI（边界行为）

- **Arena Change**：`Changes > Changes > Create`，填 Category/Title/Description 等；Change 必须 **Open and unlocked** 才能被 Onshape 候选选择。`[文档明确]`
- **关联**：候选内 `Search for Arena change` → 输入定位 → 下拉选；关联后 Release name 自动取 Change Number 并只读，Release notes 自动取 Change Title（受两个推荐开关控制）；点 Change Number 在新 Tab 打开。`[文档明确]`
- **提交**：候选创建、对象发送至 Arena Change、异步 Job；两条通知：“Release transitioning”与“Release enters the workflow Pending state”。`[文档明确]`
- **Arena Items Tab**：Onshape 对象以 Arena Items 显示，行号右侧 Onshape 图标可跳回 Onshape 并打开 `Review Release` 模态；**不能从 Arena Change 移除 Onshape 添加的 Item**。`[文档明确]`
- **Files 列**：DXF（钣金展开）、PDF（工程图）、PVZ、STEP（按规范制造件）、GLTF 缩略图（零件/装配）；`GO TO FILES VIEW` 打开文件表。`[文档明确]`
- **审批回传与修订**：Arena Change 批准并 Complete → 通知 Onshape → Release Approved，同步 Drawing 更新 Change 信息并移除水印；Arena 侧显示“New Revision value is set by Onshape”，非 Change admin 的 Revision 字段禁用，手改会警告破坏同步。`[文档明确]`
- **强制动作**：见 5.8。

### 4.14 平台与快捷键

- `[文档明确]` 候选创建仅浏览器，审阅/批准/拒绝可在任意平台；评论/备注支持浏览器+iOS，修订历史/作废支持 iOS/Android（Assembly Tab 点按或已发布零件 overflow）；候选对话框 Undo/Redo 可用按钮或 OS 快捷键；本组未给专用快捷键，术语表均 `n/a`。

## 5. 工作流、规则与错误状态

### 5.1 典型发布流程（单件）

1. 设计完成，State=In progress；从 Parts list 右键、Tab 右键、Properties 图标或版本历史建候选并预填对象。
2. 按需加对象/关联工程图/搜索过滤/检查设计；核对 Revision（自动/可改）、State、Part number（填/生成）。
3. 填 Release name（必填）、Release notes、Approvers、Observers；无审批人→点 Release 立即发布；有审批人→Submit 建版本置 Pending 并发通知。
4. 审批人在 `Review Release` 中 Release/Reject，创建者/管理员可 Discard；批准后 Released/实心三角、Drawing 写审批人/日期；拒绝为 Rejected，可当普通版本；丢弃退化为普通版本。
5. 后续在工作区修改；再发布时 Revision 递增，前一修订按设置自动或手工作废。

### 5.2 装配、工程图、链接文档与配置

- **Assembly/Drawing**：Assembly 候选带 BOM 的零件/子装配/标准件，Drawing 候选带图中引用件；已发布链接件均显示 Released 且不新建修订；引用工作区零件时其 Revision 随装配实际发布上跳，已发布件不上跳，标准件不带修订；装配图+零件图同时发布时同一零件重复列出仅参考；`Drawing has a pending update.` 仅信息性；`Drawing can reuse...` 时缺失号复用。`[文档明确]`
- **链接对象**：当前工作区→In Progress；链接未发布版本→In Progress，发布时链接文档该版本也标 Released 并挂当前文档的 Release；链接 Pending→Pending，可改 metadata/Revision，发布后追加新 Release 覆盖原 Pending；链接 Released→Released，纳入新发布不改 State/Revision。`[文档明确]`
- **跨企业转移文档**：可重发，但 metadata 与发布管理（含修订历史）不随文档转移。配置见 3.7；装配只发布引用到的具体配置。`[文档明确]`

### 5.3 刷新、回退、草稿、作废、克隆的补充规则

- **Refresh/Revert**：Refresh 仅创建者、仅候选对话框打开时可用；提交时候选侧改动优先，其他并发改动进 Version and history。Revert 仅用于“几何未变、metadata 变”的 Assembly/Drawing，且仅同工作区引用可回退；重定位不算几何变化，rigid Part Studio 内实例回退不支持；取消/关闭则回退撤销。`[文档明确]`
- **草稿**：`Save draft` 保存并关闭；`Release drafts` 双击继续；任何有发布权限者可查看，Refresh 仅创建者；60 天无活动自动删除。`[文档明确]`
- **作废**：有审批人 `Submit`、无审批人 `Obsolete` 直接生效；作废后禁止纳入其他发布、禁止插入 Assembly/Drawing，引用它的装配/工程图新建候选时警告；`Mark revision as re-releasable` 或管理员覆盖才能复用修订；每次新发布默认自动作废前一修订，Arena 同步场景强制开启该设置。`[文档明确]`
- **克隆/分支**：Clone 仅 Released/Rejected 发布包、仅上一发布来源分支的工作区可见；用工作区对象替换旧对象，评论链继承，工作区不存在的顶层对象丢弃。从 Release 分支建工作区时 Revision/Date approved/Date released 为空。`[文档明确]`

### 5.6 错误/警告目录（发布侧）

| 触发条件 | 文档表现/处理 |
|---|---|
| 审批人/团队无文档权限 | `Missing permissions` 对话框 → `Share with mentioned approver` |
| 关联工程图过期 | 警告；可先更新或仍纳入 |
| 工程图引用其他工作区版本 | 不作为关联图加入；需同工作区建图或在图内建版本 |
| 工程图有待更新 | `Drawing has a pending update.`（信息性，非阻断） |
| 缺零件号、两个零件同号等 | 候选右上角错误计数 + 过滤按钮；逐项修正，计数递减，清零后按钮消失 |
| Part Studio 特征列表处于 rollback 状态 | 该零件无法完成候选创建；打开 Tab 修 rollback bar，回来 Refresh |
| 从导入对象继承的修订与方案不符 | 警告，修订被调整为方案值（如 6→A） |
| 修订输入回退/使用已跳过标签 | 不允许（文档明确禁止，未给具体报错文案） |
| 两个 Pending 候选争同一修订 | 先批准者胜；另一个只能 Discard/Reject；系统不自动清理 |
| 引用已作废修订的装配/工程图 | 新建候选时警告 |
| 已发布对象属性被非管理员编辑 | 默认受 `Only administrators can edit...` 限制；关闭后仍排除发布关键属性 |
| 在错误分支工作区找 Clone | 无 Clone 选项；需切到上一发布来源分支的工作区 |

### 5.7 Arena 同步总边界

**方向**：

- `[文档明确]` 零件、装配、BOM 的数据同步**从 Onshape 发起、Onshape → Arena 单向流动**；Arena 只读取/请求文件，不把 Item 编辑反向写回 Onshape。
- `[文档明确]` 发布同步开启时，Onshape Release candidate 与 Arena Change 关联；Arena Change 的审批结果通过“Change Complete”通知回传 Onshape，使 Release 变 Approved。
- `[文档明确]` Arena 还可向 Onshape 提供/预占零件号、提供类别/属性定义与选项；映射列表的 Arena options 优先。故“单向”指 **Item/BOM 数据内容**，不是所有交互都单向。
- 术语表的 `Connection` 条却写“bidirectional relationship”，并说更新可互相连接；这与正文“sync is one-way”**表述冲突**，应以正文同步篇为准：数据单向，跨系统链接与审批状态回传是双向的。`[推断/需实测]`

**同步前置**：

- Onshape 用户必须是有效 Arena 用户，且 Onshape 主邮箱 = Arena 邮箱；对目标 Arena 工作区有创建/更新 Item 权限。`[文档明确]`
- 必须有 `Sync to PLM` 全局权限；Arena 侧需 Integration user/web token/workspace ID 已配置；连接是 1 企业 ↔ 1 Arena 工作区。`[文档明确]`
- 零件必须有零件号；BOM 同步要求 BOM 内所有零件、Standard content、Items 及顶层装配都有零件号。`[文档明确]`

**同步行为**：

- 首次同步：若 Arena 已有同号 Item，则更新其 Working Revision；否则新建 Working Revision。后续同步持续更新 Working Revision。`[文档明确]`
- 成功同步：更新 Number/Name/Description、已映射属性；**未映射属性不覆盖**；建立回 Onshape 的链接（文档、零件、配置、Revision）；Working Revision 链接指向工作区，Effective Revision 链接指向同修订；若 Onshape 无该修订则链接失败。`[文档明确]`
- 映射属性：Onshape 为主系统；Arena 侧改动会在下次同步被覆盖；Onshape 值为空会删除 Arena 旧值；后来才建立映射也会覆盖既有 Arena 值。`[文档明确]`
- 未映射类别：默认因 `Require category mapping for sync` 不发送；关闭后进入 Arena `uncategorized`。`[文档明确]`
- 成功 Item 表现：同号、类别/属性同值（若映射）、缩略图、GLTF 附件、Onshape 徽标（可跳回）。`[文档明确]`
- BOM：同步插入 Onshape 自有行（`OnshapeCreated` = YES/Y），这些行被 Arena 修改后下次同步会覆盖；Arena 可额外加行；首次多层全量、后续一层；`Show Assembly only` 顶层禁用同步；`Show components only` 产生 phantom assemblies。`[文档明确]`
- 修订同步：非发布同步模式下，用户须自行保证 Onshape Revision 与 Arena revision 一致；Arena 先发布后 Onshape 发布期间，链接会短暂指向不存在的修订，导航失败，直到 Onshape 发布匹配修订。`[文档明确]`

### 5.8 发布管理与 Arena Change 的联动与强制动作

**正常联动**：

1. Arena 创建 Open + unlocked 的 Change。
2. Onshape 建候选；若存在多个发布工作流，弹 `Select release workflow`，选 `Onshape Arena release workflow`。
3. Arena Change/候选至少要有可发布的 Part/Assembly；否则红色提示。
4. `Search for Arena change` 选定 Change；Release name 取 Change Number 并只读、Release notes 取 Change Title（受开关控制）。
5. `Submit`：对象送至 Arena Change；Job queue 异步；Release Pending。
6. Arena 审核基于 Onshape 不可变发布版本；期间 Onshape 工作区仍可改，但修改后的零件在审核完成前不能同步到 Arena。
7. Arena Change 批准并 Complete → Onshape 收通知，Release Approved；Drawing PDF 自动更新、水印移除。
8. 若要同步新修订号到 Arena：需 Onshape 控制下一修订、Arena 有 Open+unlocked 且无 Onshape 添加件的 Change、Arena 仅允许 Change admin 覆盖 Onshape 设置的 Revision；非 Change admin 的 Revision 字段禁用；手工改 Revision 有破坏同步警告。

**强制动作（Override Arena approval）**：

- 条件：使用 `Onshape Arena release workflow`；候选处于 Pending Arena approval。
- 管理员（或拥有权限的非管理员，仅当 Arena Change 为 Open & Unlocked）可在 `Review Release` 中强制 `Release`、`Reject` 或 `Discard`。
- `Discard` 在 Arena Change 非 Open+unlocked（如 Effective/Locked）时也可做，但**不推荐**：Arena 存有候选 ID，Discard 后再加新候选会导致失步；应先从 Arena Change 手工删除 Onshape Items，再在 Onshape Discard。
- 若 Change 为 Open & Unlocked，二者相互独立；在 Onshape Discard **不会**删除 Arena Items。
- `Release`/`Reject` 不向 Arena 发送任何通知。
- 系统不反馈“从 Arena Change 移除 Items”的成败；`Reject` 也不移除 Arena Change 中的 Items。

**拒绝边界**：

- Arena Change 被拒绝**不会自动拒绝** Onshape Release，后者仍 Pending；若要改模型，需手工 Reject 候选 → 修改 → 新建候选 → 关联既有/新 Change；关联既有 Change 前须手工删除 Arena Change 中的旧 Items。`[文档明确]`

### 5.9 PLM 错误与限制目录

| 场景 | 文档规则/错误 |
|---|---|
| 连接/凭证/身份 | 1 企业 ↔ 1 Arena 工作区；换目标须 Onshape Support 重置，再从新工作区提交 Arena 申请；web token 等同密码，由 Arena Support 经 File Drop/加密邮件分发；两端邮箱必须一致，Arena 用户须完整许可并至少登录目标工作区一次，Integration user 不可 UI 登录；API URL 按 `app.bom.com` / `app.europe.arenaplm.com` 二选一 |
| 类别必需属性 | Arena 类别要求某属性（如 Light 的 Light Color）而 Onshape 未映射/未提供值 → **创建 Arena Item 失败** |
| 类别改名 | 产生新 category ID → `Invalid mapping`；删除旧映射再重映射 |
| 列表映射 | value/label 必须同指一个 Arena option；0 个或多个 option 均报错；Arena options 优先 |
| 非文本→文本 | `Incompatible mapping` 警告，非错误 |
| 不能删映射 | 未选类别、有已映射子类别、未映射、类别 inactive 时垃圾桶灰化 |
| Structural 类别 | 父类别须先映射；Onshape 侧须 remove scope，否则用户可选到结构类别 |
| 零件号 | Onshape ≤128 字符；Arena ≤200；Arena 编号格式不得含自由文本；低修订不得重发；无号不能同步 |
| 类别未映射 | 默认不发送；关闭 `Require category mapping for sync` 后进入 `uncategorized` |
| 同步覆盖 | 映射属性被 Onshape 覆盖；Onshape 空值删除 Arena 旧值；`OnshapeCreated` 行被 Arena 改动后下次覆盖 |
| BOM 同步 | 有件缺号则失败；`Show Assembly only` 顶层图标禁用；候选对话框提示该装配 BOM 不同步 |
| 链接 | Arena Item 链接 revision-aware；Onshape 无该修订则链接失败；修订方案独立可能跳错 |
| Change 关联 | Change 必须 Open + unlocked；Change 类别设 `Do not allow manual revision entry` 时显示 `Arena Change cannot be used`；候选无可发布 Part/Assembly 时红色提示 |
| Arena 侧移除 | Onshape 添加的 Item 不能从 Arena Change 移除；Reject/Discard 不自动移除 |
| Arena 拒绝 | 不自动拒绝 Onshape Release；需手工处理 |
| 强制动作反馈 | 不反馈 Arena Items 移除状态；强制 Release/Reject 不通知 Arena |
| Job 状态 | BOM/发布同步异步，查 `Enterprise settings > Job queue`；`Open in Arena` 只显示到上次同步的内容 |

## 6. 与其他章节的关系

本章是“设计数据生命周期”的下游章节，依赖：

- **版本/工作区模型**：`Versions and history`、`Create version`、`Version Manager`、分支/比较/恢复；发布状态寄存在不可变版本上，版本是审计载体。
- **对象与属性**：Document/Workspace/Tab、Part Studio/Assembly/Drawing/Variable Studio/File/Blob；`Properties`、Custom properties、Categories、Display names、Title 1/2/3、Unit of measure、Material/Mass。发布名、修订、零件号、State、审批人/日期都落在属性或版本元数据上。
- **装配/BOM/工程图/配置/导出**：BOM 表、`Subassembly BOM behavior`、Standard content、Items、`Custom Drawing Templates`（审批人/日期写入标题栏）、Drawing pending update、`Part Studio and Assembly Configurations`、`Exporting Files`（PDF/STEP/DXF/GLTF/PVZ）。
- **企业管理与个人设置**：`Categories`、`Numbering schemes`（Release objects/Standard content/Items/Release names）、`Global permissions`（`Approve Releases`、`Sync to PLM`）、`Custom properties`、`Items`、`Job queue`、`Arena`；`Preferences > Release management`（委派）、User preferences 的 mass 单位。
- **Arena 文档**：Categories/Attributes/Changes/Items/Revisions/Access Policies/Implementation/Routings/Voting 等；本组多处写“See the Arena help documentation”。
- **本组引用但未包含的 Onshape 页**：`Customizing Release Workflow`、`Release management` 详细设置、`Watermarks`、`Obsoletion`、`Release drafts`、`Filtering items requiring attention`、`Creating a category`、`Creating and activating a new property`、`Arena` 配置页、`Configure Onshape`、`Standard content`、`Items`、`Exporting Files`、`Part Studio and Assembly Configurations`；需后续批次补齐细节。

上下游关系可概括为：

```
设计（Part Studio/Assembly/Drawing/Variable Studio/File）
  → 版本/工作区/分支
  → Release Management（候选→审批→发布→作废/克隆）
  → PLM Connector（类别/属性映射、零件号、BOM、Arena Change）
  → Arena（Item/BOM/Change/审批/Implementation）
```

## 7. 对 LubanCAD 的可执行启示

> 以下只写文档能支撑的结论。`[文档明确]` 为原文规则；`[推断]` 为落地建议，需产品/架构确认。

### 7.1 需要补齐的 UI 表面

1. **企业设置**：`Release management` 页（启用开关、工作流示意图、保存）；`Arena` 页（连接开关、workspace ID/name、token、API URL、General sync settings、Mappings 表、搜索/仅未映射/仅错误）；`Global permissions`（`Approve Releases`、`Sync to PLM`）；`Numbering schemes` 四 Tab（Release objects/Standard content/Items/Release names）；`Job queue`。`[文档明确]`
2. **候选入口**：Parts list 右键、Tab 右键、Properties 左上角图标、Versions and history 图标及其预填规则。`[文档明确]`
3. **`Create Release candidate`**：对象列表、`+`、搜索、类型过滤、`Include associated drawings`、Revision/State/Part number、逐项属性/导出、错误计数+过滤、Refresh、Revert、Release name/notes、Approvers/Observers、`Save draft`/`Submit`/`Release`/`Close`、缩放、黄三角、对话框内 Undo/Redo。`[文档明确]`
4. **`Add Items to Release`**：对象类型列表、搜索、`Other documents`、链接图标、Add/红 X、Pending 提示；配置版另需配置输入、`Set to last viewed configuration`、`Reset to default`、`Generate`。`[文档明确]`
5. **`Review Release`**：发布名+复制链接、对象缩略图/名称、Revision/Part number、Properties、Release/Reject/Discard、Approver 颜色、评论+comment history、必需备注、泛化 `Part number` 列。`[文档明确]`
6. **草稿+修订历史**：`Release drafts` 列表/双击/保存删除提交/60 天清理；Revision history 字段、`View release`/`Export`、`Obsolete revision`/`View obsoletion`、`Create Obsolete candidate`/`Add Items to Obsolete candidate`/`Mark revision as re-releasable`。`[文档明确]`
7. **Properties/BOM/状态**：`Not revision-managed`（Document/Part Studio 级联）、Release 图标、`Sync to Arena`、`Last sync`、`Open in Arena`、PN/Category；BOM 的 `Sync BOM to Arena`/`Open in Arena`/`OnshapeCreated`/`Subassembly BOM behavior`；版本空心/实心三角、绿/蓝/红、作废图标、Approver 颜色、错误计数。`[文档明确]`

### 7.2 数据模型与状态机建议

- `[文档明确]` 发布不是工作区状态，而是**绑定到不可变版本**的独立记录。建议模型至少含 `ReleaseCandidate/Release`（id/name/notes/state/creator/各时间戳/versionId/branchId/documentId/sourceWorkspaceId/workflowId/arenaChangeId/copyUrl）、`ReleaseItem`（objectType/objectId/configurationId/partNumber/revision/state/previousRevision/isLinked/linkedDocument/changeKind）、`Approval`（subject kind user/team/projectRole、delegatedFrom、decision、decidedAt、comment）、`Observer/Comment/ObsoleteRecord`（reReleasable/autoObsoleted/approver）、`SyncRecord`（arenaChangeId/jobId/lastSyncAt/mappingVersion）。
- `[文档明确]` 状态转换：无审批 → Released；有审批 → Pending → Released/Rejected；Pending → Discarded（发布删除、保留普通版本）；Released → Obsolete（手动/自动）；Released/Rejected → Clone 新候选。
- `[推断]` 实现上应把“状态变更只落在版本快照”做成不可变事件/记录，工作区永不写 State/Revision；这样能同时满足“非阻塞设计”和“发布可审计”。
- `[文档明确]` 版本图标是状态的外部投影，应作为 UI 状态渲染单独处理，不能反推为工作区属性。

### 7.3 参数与默认值清单（可直接做验收）

| 项 | 文档值 | 备注 |
|---|---|---|
| 发布管理默认 | State `In progress` | 工作区对象默认 |
| 审批人默认 | 空，创建者可自批 | 管理员可强制要求审批人且不得为创建者 |
| `Require category mapping for sync` | 默认勾选 | 未映射类别默认不发送 |
| Arena sync 默认 | 启用（`Enable sync` 术语条目：默认 enabled） | 连接页可 Disable |
| 零件号长度 | Onshape ≤128 字符；Arena ≤200 字符 | Arena 格式不得含自由文本 |
| Mass 单位 | 取 Onshape 用户 `User preferences`（术语表另记 `Unit of measure` 默认 `Inch`） | 同步到 Arena 文本属性 |
| 草稿保留 | 60 天无活动自动删除 | 硬规则 |
| 团队批准 | 1 名成员即可，即使勾 `Require approval from all approvers` | 硬规则 |
| 项目角色 | 1 次批准代表整个角色；个人重复列名需另一次角色批准 | 硬规则 |
| 首次导入修订 | 尽量保留；不匹配方案则警告并调整 | 例 6→A |
| 修订回退 | 禁止；可跳到任意更晚字母，但不得用已跳过标签 | 硬规则 |
| 分支元数据 | Revision/Date approved/Date released 为空 | 硬规则 |
| `OnshapeCreated` | Arena 自定义属性 Yes/No；BOM 行 YES（另一处 Y） | 归属标识；不一致需实测 |
| 连接关系 | 1 企业 ↔ 1 Arena 工作区；API URL 按工作区选 bom.com/europe.arenaplm.com | 更换需 Support 重置 |
| Arena 文件类型 | PDF、STEP、DXF、GLTF、PVZ | 发布同步文件列 |
| 水印 | `Show watermark for unreleased drawings`（推荐） | 批准后移除 |
| 自动作废 | `Automatically obsolete previous released revisions`（Arena 同步必需） | 规则 |

### 7.4 审批引擎实现要点

- `[文档明确]` 解析顺序：个人 → 团队 → 项目角色 → 委派。去重时必须保留“个人/团队/角色”三种身份维度：同一人可同时代表个人和角色，二者分别计数。
- `[文档明确]` 团队只取一票；角色只取一票；`Require approval from all approvers` 对团队不生效（文档只明确团队例外，未说明角色；`[推断]` 角色同样按“一票代表角色”处理）。
- `[文档明确]` 委派只转移“个人”票，不转移“角色”票；委派不可传递；委派人与被委派人都收发布通知。
- `[文档明确]` 权限校验应在候选创建/提交时提前做，弹 `Missing permissions` 并一键共享；不要等到审批时才失败。
- `[文档明确]` 拒绝权包含管理员与创建者（不仅是审批人）；Discard 仅创建者/管理员且仅 Pending。
- `[推断]` 审批规则配置宜建模为 workflow definition：至少含“是否需审批人/禁止自批/限制名单/要求备注/全部批准/多级 tier”；本组只覆盖前五项与多级通知，编辑器完整语义不在语料内。

### 7.5 修订号/零件号算法

- **Revision allocator**：输入 scheme、上一修订、首次发布、手工覆盖、re-releasable；规则：单调递增、允许跳号、跳过标签永不可用、首次可沿用外部导入值（不兼容则按 scheme 调整并警告）、作废重发可复用标记标签。
- **Part number allocator**：唯一性+跨发布历史；禁止同一 PN 以更低修订重发；支持顺序/批量生成与 Drawing 复用；Onshape 上限 128 字符；Arena 侧预占/生成；无 PN 不得同步。
- `[推断]` 两套号解耦：Revision 属发布状态机，Part number 属对象身份；勿把“零件号+修订”拼成单一主键，否则难支持配置/克隆/跨文档链接。

### 7.6 配置与链接对象语义

- `[文档明确]` 配置是“可修订身份”的一部分：`(objectId, configurationId)` 才唯一标识发布项；已发布配置冻结输入；未入属性的输入按默认值参与发布/修订引用。
- `[文档明确]` 链接对象有四种状态（工作区/未发布版本/Pending/Released）；候选创建时记录 `linkedDocumentId + versionId + state`，发布时决定是否把链接文档版本也标 Released、是否覆盖 Pending 发布。
- `[文档明确]` 分支清空 Revision/Date approved/Date released；克隆继承评论链但用工作区对象替换身份；两条是测试重点。

### 7.7 PLM 连接器边界

- `[文档明确]` 连接器应是按对象的同步适配器，至少建模：`ConnectionConfig`（workspaceId/name、apiUrl、token 加密、integrationUserId、syncEnabled、requireCategoryMapping、syncReleaseManagement、matchReleaseName、syncReleaseNotes）；`CategoryPropertyMapping`（含 list value+label，状态 Mapped/NotMapped/Invalid/Incompatible，Arena options 优先）；`PartNumberPolicy`（预占/生成、128 字符、无自由文本）；`SyncJob`（part/assembly/BOM/release、方向、层级深度、Job queue、lastSyncAt）；`ArenaChangeLink`（changeId/candidateId、open+unlocked、revision control、completion event）；`FileExport`（PDF/STEP/DXF/GLTF/PVZ、`CAD Data`/`Drawing`、`step`/`pdf`）；`Ownership`（`OnshapeCreated`，Onshape 自有行被覆盖）。
- `[文档明确]` 单向上传 + 审批事件回传，不做双向字段合并；Arena 侧被映射字段的人工改动必被覆盖，未映射字段才保留。同步需幂等键：零件号 + BOM 行归属 + candidate/change 关联，避免重复 Item/行。
- `[文档明确]` 失败必须可诊断：类别/属性缺失、映射失效、零件号超限、BOM 缺号、Change 不可用、权限不足、链接修订不存在，均应有明确错误态。
- `[推断]` 建议加“预检（preflight）”：候选提交/同步前校验映射、必需属性、零件号长度、BOM 全件有号、Arena Change 状态，避免异步作业到 Arena 才失败。

### 7.8 可写成测试断言的验收点

**发布状态机**

1. 无审批→点 Release 立即 Released 且无 Pending 版本；有审批→Submit 生成版本、版本名=Release name、对象 Pending、空心三角。
2. 批准→Released/实心三角；拒绝→Rejected/空心三角；Discard（Pending，仅创建者/管理员）→发布删除、保留普通版本。
3. 两候选争同一 pending revision→先批准者获得，另一个仍 Pending 且只能 Discard/Reject。
4. 含作废对象的已发布版本→实心三角+点、对象 Obsolete；从 Release 分支→Revision/Date approved/Date released 为空。
5. 克隆链 C←B←A→C 评论含 A+B；克隆工作区缺失的顶层对象不出现。

**修订/零件号/配置/链接**

6. 上一版 B→建议 C；输入 A 拒绝；D 允许；跳过标签拒绝；导入修订 3 在字母方案下变 A 并警告。
7. re-releasable→复用标签；未勾且管理员覆盖→可复用；低修订重发同一 PN 被阻止；PN 129 字符被拒。
8. `Drawing can reuse...`→单对象图继承号、多对象图生成新号。
9. 发布配置 A→插入只能得 A 且输入锁定；B 需另发；排除出属性的输入用默认值。
10. 装配引用已发布零件→不 bump；引用工作区零件→发布时 bump；链接 Pending 对象可改 metadata/Revision 并在发布后覆盖 Pending；链接 Released 对象不改 State/Revision。

**审批**

11. 团队+`Require approval from all approvers`→1 名成员即完成；角色+同一人单列→个人票与角色票分离；团队+角色同一人→先团队、角色另需一人。
12. A→B→C 委派→C 不收 A 请求；角色成员委派只代表个人。
13. 无权限审批人→`Missing permissions`，共享后可审批；`Require a note`→不填备注不能通过。

**作废/审计/通知**

14. 作废修订不出现在插入对话框；含它的装配新建候选警告。
15. 批准后 Drawing 属性含审批人+日期；每 Release 仅 1 条应用内通知并更新，评论每次发邮件；Approver 绿/红/灰与状态一致，Discard 无颜色变化；草稿 60 天清理，他人可看但仅创建者 Refresh。

**PLM**

16. 邮箱不匹配/无 `Sync to PLM`→不能同步；零件无 PN/顶层装配无 PN→同步失败。
17. 同 PN 首次同步建 Working Revision，再次同步更新同一 Item 不重复建。
18. 已映射属性空值→清空 Arena 旧值；未映射→保留；类别改名→`Invalid mapping`；列表 value/label 不同 option→报错；非文本→文本→`Incompatible mapping` 警告。
19. `Show Assembly only`→BOM 同步/Open in Arena 禁用；`Show components only`→phantom assemblies；首次多层全量、后续一层。
20. Change 非 Open+unlocked→不可选；`Do not allow manual revision entry`→`Arena Change cannot be used`。
21. 提交→Release Pending、Arena Items 含对象与 PDF/STEP/DXF/PVZ/GLTF；Arena Complete→Approved、水印移除；Arena 拒绝→Onshape 仍 Pending，需手工 Reject/新候选/移除 Items。
22. 强制 Discard（Open+unlocked）→Arena Items 不删除；强制 Release/Reject 不通知 Arena；非 Change admin 编辑同步 Revision→字段禁用，手改→同步破坏警告。

### 7.9 文档缺口与需要产品实测确认的问题

- **完整设置页缺失**：修订方案、零件号唯一性、顺序编号、水印、作废工作流、自定义多级工作流（`Customizing Release Workflow`）的字段/默认值未覆盖。
- **内部冲突**：审批人 Edit vs View；其他文档对象 Professional+Enterprise vs Enterprise only；`OnshapeCreated` YES vs Y；State `Released` vs Arena 页 `Approved`；术语表“双向 Connection” vs 正文“单向同步”。建议以正文+实测为准。
- **多级工作流**：仅知层级内通知、创建者收全部、团队一票、`Require approval from all approvers`；层级定义/顺序/并行规则缺失。
- **审计/套餐/文案**：无独立审计日志章节，现有载体为版本/修订历史、评论、Drawing 属性、Arena Change Implementation；PLM 套餐徽标丢失，移动端审批/同步能力未系统说明；配置“排除出属性”需与配置章节联合验收；大量错误状态无精确文案，需实测。
