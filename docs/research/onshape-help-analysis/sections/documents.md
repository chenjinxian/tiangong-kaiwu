# Onshape Help 分析报告 — 文档 / 导入导出 / 共享协作 / 发布物

> 分析范围：`groups/documents.txt`（43 主题，60,179 词，9,539 行）。仅基于本组离线语料，未联网、未修改输入与仓库。
> 说明：所有英文 UI 标签、字段名、格式名保持原文；引号内为文档原词。抽取噪音与文档内部矛盾集中在第 1、5 节标注。

---

## 1. 本章概览

- **主题数**：43；**总词数**：60,179。
- **子域**：
  1. Onshape 文档模型（Document / Workspace / Version / Branch / Tab）与文档内 UI（Document panel / toolbar / menu）；
  2. Documents 页面（Document / List / Structure 三种视图、Create 菜单、文件夹、标签、过滤器、集成、高级搜索、侧栏面板、Trash）；
  3. 文档管理（版本/分支/历史、Compare、Repair、Merge、Restore、Workspace Protections、Document Notes、Where Used、Properties、Publications）；
  4. 导入/导出（格式矩阵、导入处理选项、导出选项、下载、Lidar 扫描）；
  5. 共享与协作（Share 权限、实时协作与社会线索、评论/标记/任务、Follow Mode、View Only 与只读工具栏、所有权转移）。
- **文档更新日期**：语料正文没有给出各页面的“Last updated”字段，无法提取版本日期；只能看到功能行为对应的是含 Publications、AI Advisor、Apple Vision Pro、Simulation、MBD 等较新功能的 Onshape 版本。
- **整体质量/抽取限制**：
  - 图片全部退化为 `[image]` 或 `[image: alt]`；工具栏、图标、对话框布局无法从语料还原，只能依据 alt 文本和正文。
  - 表格被压平为 `|` 分隔行（List/Structure 图标表、版本图例表、Comments 按钮表），部分行只剩 `[image]`，无法逐项对应。
  - 多处只有视频转录（Filters、Merging、Restoring、Repairing、Comments、Publications 等），转录文本已足够描述流程，但缺少画面细节。
  - **订阅徽章丢失**：List View、Structure View、Publications 页首的 “Only available for” 后面只有图片，未抽出订阅名称；List/Structure 正文明确“Enterprise and Professional plan subscribers”，Publications 只明确“can be shared with users in all plans”。
  - **文档内部矛盾**（按原文记录，不做调和）：
    1. List View 桌面版 Notes 说离开 Documents 页再回来“List view is retained”，同页 iOS 小节的 tips 却说“not retain… returned to the Document view”。
    2. Comments 页开头说可在 workspaces **和 versions** 评论，且 Can view 也允许评论；同页 Notes 又说“If a user doesn't have edit rights to the workspace (which is inherently true for versions), then there is no access to the Comments panel”。
    3. Transfer Ownership 先说接收者“must accept the transfer”，Steps 结尾又说“At this point, the transfer of ownership is completed immediately”。
    4. View Only 页称文档“automatically open into a View only mode”，但同时描述 Edit 按钮切换；应理解为“按账户/公司设置默认只读”的呈现，而非所有用户永远只读。
    5. View Only 工具栏称“up to 18 tools”，正文实际列举了 20 余个候选工具（按 tab 类型和权限裁剪）。
- **本组页面大量采用“桌面 + iOS/Android”双份叙述**；移动端多数能力与浏览器一致，但导入仅支持云源、Workspace protections 只能桌面开关、Labels 只能查看等差异已记录。

---

## 2. 主题清单与逐篇摘要（43/43）

### A. 文档模型与文档内 UI（7）

| 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|
| Documents | Documents | /Content/Document/documents.htm | 定义 Onshape“文档”取代文件：一个文档可含多个 Part Studio/Assembly/图纸/导入文件等 tab；文档可共享、可版本化、有所有者；新文档默认含 Part Studio 与 Assembly，接近 100 tabs 时建议拆分并 Linking Documents。 |
| Document Tabs | Documents > Document Tabs | /Content/Document/document_tabs.htm | 描述 tab 的创建（Insert new tab：Application/Material library/Feature Studio/Render Studio/PCB Studio/CAM Studio/Part Studio/Assembly/Variable Studio/Drawing/folder/Import）、Tab manager、排序/过滤/搜索、文件夹嵌套、Move to document、版本 vs 工作区右键菜单、删除冲突提示。 |
| Document Panel | Documents > Document Panel | /Content/Document/document_panel.htm | 左侧 Document panel 的入口清单：Versions and history、Create version、Release drafts、Comments、Document notes、Where used、Performance、AI Advisor、Explore Onshape、Action items、Tab manager。 |
| Document Toolbar | Documents > Document Toolbar | /Content/Document/document_toolbar.htm | 顶部工具栏：logo/返回、Document menu、文档名与工作区名、Copy link（含配置/渲染/爆炸/面板/视角）、文件夹链接、FeatureScript notices、Notifications、App Store、Learning Center、Share、Help、账户菜单；公开文档额外显示 Public/Copies/Links/Likes；含 iOS/Android 版说明。 |
| Document Menu | Documents > Document Menu | /Content/Document/document_menu.htm | Document menu 命令：Rename、Move to（跨根文件夹会转移所有权并重继承共享）、Document details（描述/Not revision managed/Category）、Restore deleted workspaces、Copy workspace/version、Update workspace、Workspace units、Workspace/Version properties、Switch to view only mode、Print、Close document。 |
| Setting Default Units | Documents > Setting Default Units | /Content/Document/setting_default_units_per_workspace.htm | 默认单位为 inch/degree；可在 Document menu > Workspace units 按工作区设置，数值字段可用 “10mm” 之类显式单位自动换算；图纸单位独立管理，Feet and inches 仅图纸可用；小数位仅浏览器、仅显示、影响特征/草图/操纵器对话框及 Measure/Mass properties。 |
| In-app Notifications | Documents > In-app Notifications | /Content/Document/in_app_notifications.htm | 铃铛中的站内通知覆盖上传/导入/翻译/导出/文档升级/发布流程/任务/PLM/仿真/个人副本；未读计数、可标记已读/删除、14 天后自动删除；不受邮件/移动通知偏好影响；评论/@提及/任务分配/共享不产生站内通知。 |

### B. Documents 页面与其视图（11）

| 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|
| Documents Page | Documents > Documents Page | /Content/Document/documents_page.htm | Documents 页总体解剖：搜索框、Create 按钮、过滤器/Integrations/Trash、最近打开、Projects & Folders、三种视图（Document/List/Structure）、Add 列、右侧 Details/Analytics/Share details/Properties/Versions and history/Document notes 面板、选择/打开、内联命令、右键菜单、缩略图、高级搜索入口；含 iOS/Android。 |
| List View | Documents > Documents Page > List View | /Content/Document/list_view.htm | Enterprise/Professional 专有的 List view：按文件夹列出最新已发布/已修订的 part、Assembly/subassembly、Drawing；可加 Types/Name/Description/Part number/Revision 及 Vendor/Project/Product line/Title 1-3/Material 过滤，URL 可分享过滤条件；支持导出、列固定/自动宽度、组件详情/属性/Where used/修订历史。 |
| Structure View | Documents > Documents Page > Structure View | /Content/Document/structure_view.htm | Enterprise/Professional 专有的 Structure view（As built）：从顶层装配向下展开最新已发布/已修订的 part/assembly/drawing 树；旧版本不显示；未装配的已发布组件置顶；新修订蓝色图标、obsolete 图标；可选显示图纸；支持列操作、键盘导航和组件右键。 |
| Create Menu | Documents > Documents Page > Create Menu | /Content/Document/create_menu.htm | Create 下拉：Document、Folder、Publication、Import files、Import from（Google Drive/Dropbox/OneDrive）、Project（Enterprise，需 Global permission）、Label；创建时可指定 Document location；只读文件夹中 Create 不可用。 |
| Folders | Documents > Documents Page > Folders | /Content/Document/folders.htm | 文件夹用于组织文档/出版物并批量施加共享权限：子文件夹与内容继承根文件夹权限；可嵌套、移动、重命名、删除到 Trash、Transfer ownership、Set library；移动文档要求文件夹 Edit + 文档全部权限；跨根文件夹移动会转移所有权并重继承共享。 |
| Labels | Documents > Documents Page > Labels | /Content/Document/labels.htm | 标签用于个人组织文档/出版物：可多标签、批量施加、拖放施加、按标签过滤、删除标签不影响文档；所有标签仅对创建者可见（user-specific），不能施加到文件夹；移动端仅能查看/访问浏览器创建的标签。 |
| Filters | Documents > Documents Page > Filters | /Content/Document/filters.htm | 左侧预置过滤器：公司/企业（首项随许可证变化）、Recently opened、Created by me、Shared with me、Teams、Labels、Public；Public 列表显示 Name/Modified/Owned by/Copies/Links/Likes；公开文档只读但任何人可复制，Free 账户文档默认公开。 |
| Integrations | Documents > Documents Page > Integrations | /Content/Document/doc_integrations.htm | 已集成的 Google Drive/Dropbox/Microsoft OneDrive 账户显示在 Trash 上方；可按账户图标搜索云盘；图标后显示集成邮箱；可集成多个账户；在 Account settings 或 Enterprise settings 的 Integrations 中配置。 |
| Advanced Search | Documents > Documents Page > Advanced Search | /Content/Document/advanced_search.htm | 在“当前过滤器”范围内做高级搜索：Type（含 Document/Part/Part Studio/Assembly/Drawing/Feature Studio/Variable Studio/Project/Folder/Publication/All）、Category、Name、Description、Part number、State、Revision、Add criteria、Results from（Workspace/两者/Version；latest/all；含/不含子文件夹）；支持 `*` 通配；结果显示 workspace/version/revision 图标、状态与右键菜单。 |
| Documents Page Panels | Documents > Documents Page > Panels | /Content/Document/panels.htm | 右侧面板：Details、Analytics（Document Dashboard，View 权限即可看）、Share details（含 Connection 徽章）、Properties（灰置=公司管理员设置）、Versions and history（悬停看版本描述）、Document notes；点击名称新标签打开，悬停可复制链接。 |
| Trash | Documents > Documents Page > Trash | /Content/Document/trash.htm | Trash 只显示“你”送入的项；非 Enterprise 30 天后自动删除，Enterprise 90 天；可单项 Restore，或 Empty trash 永久删除。 |

### C. 文档管理、发布物与元数据（11）

| 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|
| Document Management | Documents > Document Management | /Content/Document/document_management.htm | 文档管理总述：每次编辑自动捕获所有 tab 状态，形成无限历史；定义 Version/Workspace/Branch/History entry/发布状态（In progress/Pending/Rejected/Released）/Observer/Approver/Revisionable object/Release candidate/Not revision-managed；新文档自动有 Start version 与 Main workspace；历史描述格式 `Tab-name::Action:Feature-name`。 |
| Versioning and Branching | Documents > Document Management > Versions, Branches, and History | /Content/Document/versions_and_history.htm | Versions and history 面板：创建版本（可先更新待更新图纸）、从版本 Branch 出工作区、版本/工作区/分支右键命令、版本图图例、合并线显示、删除/恢复工作区、Update workspace、Search history、Filter branches、合并示例与移动端。 |
| Comparing | Documents > Document Management > Versions, Branches, and History > Comparing | /Content/Document/compare.htm | 在 Part Studio、Feature Studio 中比较任意两个工作区/版本/历史点：Base（蓝）与 Target（红）、滑块、Reverse compare、显示全部特征、Part Studio 列表、Show/Hide Part、差异图标（相同/不等/缺失/多出/上下移动）、公差差异黄色高亮；Feature Studio 为绿/红行级 diff。 |
| Repairing | Documents > Document Management > Versions, Branches, and History > Repairing | /Content/Document/repairing.htm | View in repair / Edit healthy moment 提供右侧 Repair 面板，对照“最后一个健康历史点”修复断裂引用；Replace reference 可 1:1 替换并 Propagate changes 到下游；明确不支持隐式/显式 mate connector、in-context 引用、外部草图引用及一对多引用传播。 |
| Merging | Documents > Document Management > Versions, Branches, and History > Merging | /Content/Document/merging.htm | 把 Source（工作区/版本）合并到当前 Target 工作区：整体策略 Keep [Target]/Merge changes（默认）/Replace with [Source]，可按 tab 覆盖；Merge changes 仅限 Part Studio 与 Assembly；图、图纸、PCB Studio 不能合并；受保护分支、FeatureScript 版本不一致、文档被占用、更新进行中会阻止合并；合并后可用消息链接 revert。 |
| Restoring | Documents > Document Management > Versions, Branches, and History > Restoring | /Content/Document/restoring.htm | 在同一分支内把历史点（Source）恢复到当前工作区（Target）：整体 Keep [Target]/Replace with [Source] + 每 tab 策略；绿勾/红叉/感叹号指示结果；可通过 “n changes” 打开 Compare；恢复动作本身成为分支最新历史。 |
| Workspace Protections | Documents > Document Management > Versions, Branches, and History > Workspace Protections | /Content/Document/workspace_protections.htm | 保护工作区免受直接修改：几何、图纸、部分元数据、创建/删除 tab 必须到分支改后再 merge；发布管理及其必需元数据、刷新图纸、创建版本/分支/合并可直接做；锁定图标与横幅；仅桌面可开关；合并前工作分支必须先吸收受保护分支。 |
| Document Notes | Documents > Document Management > Document Notes | /Content/Document/document_notes.htm | Document notes 面板支持纯文本、Markdown（标题/粗斜体/列表/引用/代码）与超链接；Edit notes、Preview、Apply、Cancel、Refresh notes；面板显示/刷新/关闭三按钮。 |
| Where Used | Documents > Document Management > Where Used | /Content/Document/where_used.htm | Enterprise/Professional 的 Where used：从 Documents 页搜索结果或文档内 Parts/Instances 列表/图形区右键，查 part/assembly 被哪些已版本化 Assembly/Drawing 使用，也支持 Feature Studio 被哪些版本/Feature Studio 使用；只查版本/修订、**不返回工作区结果**；支持 Latest revision/All revisions/Latest versions/All versions、多零件 Show more、配置零件下拉、权限拒绝与 Failed captures 提示。 |
| Properties (Metadata) | Documents > Document Management > Properties (Metadata) | /Content/Home/properties_metadata.htm | Properties 对话框/面板设置文档、零件、tab 等的 metadata：name、description、part number、revision、state、公司自定义属性；可 Create release、Generate next part number；Grayed-out 属性由公司管理员控制；Apply 后全公司生效，Save 只保存待应用，Reset all 恢复默认；BOM 自动更新，公开零件可在保留原作者元数据的前提下覆盖。 |
| Publications | Publications | /Content/Document/publications.htm | Publication 是把任意文档中已 release 的 part/Part Studio/Assembly/Drawing/文件集合起来的只读发布包；创建后 Insert document tabs（必须已版本化/已修订；单个 part 必须已 release）、可 View as viewer、复制/打印/移动/共享（共享恒为 view-only）、Markdown 说明、强制发布导出规则；支持缩略图与搜索。 |

### D. 导入 / 导出 / 下载（6）

| 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|
| Importing & Exporting Files | Importing & Exporting Files | /Content/File/importing_and_exporting_files.htm | 总览：可导入/导出 CAD 与非 CAD；导入 CAD 自动转 Onshape 内部格式；Import 生成新文档或现有文档新 tab；Download 原样取回；Export 把 Part Studio/零件转 CAD 格式，草图/平面转 DWG/DXF；移动端仅支持云源导入。 |
| Supported File Formats | Importing & Exporting Files > Supported File Formats | /Content/File/supported_file_formats.htm | 完整格式矩阵：导入 Part/Assembly/Drawing/非 CAD 格式与版本范围；导出 Parts/Part Studios/Assemblies/Drawings 的格式与版本；注明 Parasolid 为首选、mesh 只可查看/参考不可编辑、Solid Edge .psm 不生成钣金模型等边界。 |
| Importing Files | Importing & Exporting Files > Importing Files | /Content/Document/importing_files.htm | 导入流程：上传上限 4GB；从 Documents 页导入生成新文档（自动建版本）或从文档内导入生成新 tab；处理 CAD 时选 Import to a single document / Split into multiple documents / Combine to a single Part Studio；含 appearances、material density、Y Axis Up、composite part、Join adjacent surfaces、IGES postprocessing；含 SOLIDWORKS Pack and Go 与 zip 命名规则、故障零件导入、通知队列重试与移动端。 |
| Exporting Files | Importing & Exporting Files > Exporting Files | /Content/File/exporting_files.htm | 导出零件/曲面/Part Studio/实例/子装配/装配/图纸/草图/平面：文件名字符替换、格式与版本、Y-up、STEP 预处理和单位/MBD、IGES 兼容模式、网格分辨率、压缩、STL 文本/二进制与单位、下载/存新 tab/邮件链接、批量导出规则、URDF 选项；含图纸导出字段及移动端。 |
| Downloading Files | Importing & Exporting Files > Downloading Files | /Content/File/downloading_files.htm | 无法“导出”的文件（主要 non-CAD）通过 tab 右键 Download 原格式取回；同文件名/类型；下载位置由浏览器决定。 |
| Importing a Lidar Scan | Importing & Exporting Files > Importing a Lidar Scan | /Content/File/importing_a_lidar_scan.htm | 仅在带 Lidar 的 iPhone/iPad（2020 年后指定机型）文档内用 Plus > Import from Scan；Environment Scan 或 Object Scan；生成 GLB/OBJ 到 CAD Imports 文件夹并建 Scan/Capture Part Studio，含 Import 特征与 mesh Composite part，可继续混合建模。 |

### E. 共享与协作（8）

| 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|
| Sharing and Collaboration | Sharing and Collaboration | /Content/Collaboration/sharing_and_collaboration.htm | 协作总览：Share 文档给个人/列表/Team/Company/公开/Onshape 支持；实时 Simultaneous editing；Comments；Follow Mode（浏览器与移动互跟）；Transfer Ownership（个人或公司所有；所有者权限含 Delete/共享/公开/私有/转移）。 |
| Share Documents | Sharing and Collaboration > Share Documents | /Content/Collaboration/share_documents.htm | Share 对话框：Individuals/Teams/Companies/Public/Link sharing/Connections（Enterprise 仅 Individuals/Teams/Invite guests/Links）；Can edit/Can view 及 Copy、Link document、Export、Share、Comment、Delete 细粒度权限；公开可复制、链接分享免登录只读且定位到复制时状态；Free 用户限制、支持的共享、移除自己。 |
| Collaboration | Sharing and Collaboration > Collaboration | /Content/Collaboration/collaboration.htm | 多人同时编辑实时同步；tab 与 Feature list 中的 social cues（颜色+首字母，多人合并为多色块）；非协作 tab（如图纸/第三方应用）一次一人持焦，可提示谁在编辑并接管；view-only 用户拖动 rollback bar 后不再实时更新的已知问题。 |
| Commenting in Workspaces and Versions | Sharing and Collaboration > Comments in Workspaces and Versions | /Content/Collaboration/comments_on_workspaces.htm | 评论与 @提及：可挂在特征、草图/尺寸、公差尺寸/孔标注、MBD Inspection 标注、mate connector（含隐式）、mate、子装配实体、图纸视图/尺寸/标注；支持图片附件、Markdown 式标记、任务分配（仅新评论、单人）、过滤器、Markup 注释（箭头/线/自由画/圆/方/文字及修饰键）、URL 自动成链、评论不进入历史。 |
| Follow Mode | Sharing and Collaboration > Follow Mode | /Content/Collaboration/follow_mode.htm | 双击协作者 social cue 跟随其视角/操作；可跨浏览器/移动端；被跟随者看到跟随者 cue 外框；点击窗口任意处停止；列出跟随者可见（tab、光标手形、视图/渲染模式、选择、爆炸、特征列表选择、编辑既有特征的对话框工作）与不可见（Reference manager、Sketch Text 子对话框、Derived、Mass properties/Measure、右侧面板与表格）。 |
| View Only Mode | Sharing and Collaboration > View Only Mode | /Content/Collaboration/view_only_mode.htm | 文档默认以 View only 呈现（按权限/公司设置）；点击横幅 Edit 进入编辑；Document menu > Switch to view only mode 返回只读；编辑范围受管理员 Global settings 限制；文档创建者在开启 “Always open documents in View only mode” 时仍需手动切换。 |
| Using the View Only Toolbar | Sharing and Collaboration > Using the View Only Toolbar | /Content/Collaboration/using_the_view_only_toolbar.htm | 无写权限/Light/访客的底部只读工具栏：Home/Rotate/Pan/Zoom to fit/Zoom to window/Zoom、Section view、Inspection table、Properties、Appearance、Display states、Cut list、Configuration、Custom tables、Sheet metal、Routing、Comments、BOM、Exploded views、Named positions、Simulation、Follow a user、Export tab/selected/Select and export、Print、Measure、Analysis、Mass properties；含鼠标操作方案与发布审批入口说明。 |
| Transfer Ownership | Sharing and Collaboration > Transfer Ownership | /Content/Collaboration/transfer_ownership.htm | 文档/文件夹所有权可在个人/公司/企业间转移；公司/企业所有项仅管理员可转移；个人→个人、个人→公司（须为成员）、公司→个人、公司→公司（须同时属于两公司）；接收者需有活跃账户；转移不改变既有共享/链接，原所有者保留 Edit/Share；跨公司转移不携带元数据与发布/修订历史。 |

---

## 3. 核心概念与术语

### 3.1 文档对象模型

| 英文原名 | 定义/关系（据语料） |
|---|---|
| **Document** | 取代“文件”的容器；可含多个 Part Studio、Assembly、Drawing、Feature Studio、Variable Studio、Render Studio、PCB Studio、CAM Studio、Material library、导入文件 tab；可被共享、版本化、发布（Publication 只是引用已发布对象）。 |
| **Tab** | 文档内每类数据的载体；一个浏览器窗口同一时间只有一个 active tab（可开多个窗口/浏览器标签）；tab 可放文件夹（嵌套上限 10 层）。 |
| **Workspace** | 活动建模/设计空间；新文档自动创建 **Main** workspace；每个 branch 末端最多一个 workspace（open dot）。 |
| **Version** | 不可变（immutable）的文档时间点快照；几何不可改，但属性可改；新文档自动有 **Start** version；命名默认 `V1, V2, …`，可重命名。 |
| **Branch** | 版本图中的命名分叉；在某个 version 处分叉，以 workspace 结束，可含 0..N 个顺序版本；分支可打开/删除。 |
| **History entry** | 文档 workspace 在某个时间点的变更记录；可比较、可 Restore；描述格式 `Tab-name::Action:Feature-name`。 |
| **Version graph** | Versions and history 面板的树状图：按 branch 着色；version=实心点+普通字；workspace=空心点；branch=粗斜体；release=三角形（实心=released，空心=pending，实心带点=obsoleted）；active branch 蓝色高亮；merge lines 与 automatic versions 可显隐。 |
| **Start version / Main workspace** | 创建文档时自动生成；空文档的 Start version 包含空 Part Studio 与空 Assembly；Main workspace 建模前为空。 |
| **Document panel** | 左侧竖排面板入口（版本、评论、笔记、Where used、性能、AI、Tab manager 等）。 |
| **Tab manager** | 左侧 tab 管理面板：按 tab 顺序/名称/类型排序、按 tab 类型过滤、列表/详情视图、缩略图、文件夹、Ctrl+Space 循环历史缩略图、Ctrl+click 多选。 |
| **Document thumbnail** | 默认取最后打开的 Part Studio；可在 tab 右键 “Select as document thumbnail”（需 Edit 权限）；该 tab 删除/移走后回退到最近编辑 tab。 |

### 3.2 发布与权限角色

| 术语 | 含义 |
|---|---|
| **In progress** | 未发布 workspace/version 的默认状态；workspace 可编辑，version 可编辑 metadata。 |
| **Pending** | Release candidate 等待审批；版本图中用特定图标。 |
| **Rejected** | 审批人拒绝的 Release candidate 状态。 |
| **Released** | 审批通过或创建者直接发布；版本图中三角形实心；已发布版本的 Parts 列表显示 release 图标。 |
| **Obsolete** | 被淘汰的已发布对象；Structure/List view 用 obsolete 图标，版本图中为带点的实心三角形。 |
| **Observe r / Observer** | 需知悉发布状态但无需审批的公司成员；可 0..N 个；必须有文档 View 权限。 |
| **Approver** | 发布流程中必须审批的公司成员；可 Approve/Reject；必须有文档 Edit 权限。 |
| **Revisionable object** | 可修订/发布的 part、Assembly、Drawing、Variable Studio 或其他文件类型。 |
| **Release candidate** | 一组被选中一起走发布流程的 revisionable objects。 |
| **Not revision-managed** | 为引用目的可进入 Release、但不跟踪修订的对象；Document details 有 `Not revision managed` 复选框。 |
| **Owner** | 文档/文件夹的所有者（个人、公司或 Enterprise）；拥有全部权限并可 Transfer ownership；Professional/Enterprise 中创建者除转移所有权外拥有全部权限。 |
| **Can edit / Can view** | Share 的两档基础权限；二者都含 Comment；详见 §4.13 权限矩阵。 |
| **Light user / View-only user / Guest** | 只读呈现的账户类型；View Only toolbar 的默认对象；Where used 明确支持 view-only、light、guest。 |
| **Connection** | 与外部 Enterprise 的受管共享关系；文档/文件夹/出版物会显示 Connection 徽章或横幅。 |

### 3.3 导入、引用与修复

| 术语 | 含义 |
|---|---|
| **Derived / Import feature** | 引用其他 Part Studio/文件的特征；其基础对象改变时可能产生断裂引用，需 Repair。 |
| **View in repair** | 右侧 Repair 面板，显示选定的健康历史点，与当前 Part Studio 并排修复。 |
| **Edit healthy moment** | 从失败特征右键直接打开其最后一次成功重算时的 Repair 面板。 |
| **Replace reference** | 1:1 替换断裂引用，可 Propagate changes 到下游特征。 |
| **Y Axis Up** | Onshape 自身为 Z-up；从 Y-up 系统导入时可勾选重新定向（.ipt/.catpart 除外）。 |
| **Composite part** | 把多个非实体/多体导入合成单一闭合 composite part；Lidar 网格也以 mesh Composite part 呈现。 |
| **Pack and Go** | SOLIDWORKS 装配打包 zip；zip 名必须与顶层装配同名、扁平、无特殊字符。 |

---

## 4. 功能与 UI 明细

### 4.1 文档创建与 Tab 模型

**创建文档**
- 入口：Documents 页 `Create > Document`；或 `cad.onshape.com/new`。
- 新文档默认含一个 Part Studio 和一个 Assembly tab；可创建任意多个。
- 所有者：Enterprise→企业；Professional 公司→公司；其他→个人；属于多个付费账户时创建对话框可选 owner。
- 打开文档时默认激活“上次关闭前的 active tab”；首次打开激活第一个 tab。

**Tab 基础规则（[文档明确]）**
- 一个浏览器窗口同一时间只有一个 active tab；任意 tab 可在新窗口/新浏览器标签打开。
- tab 顺序在 workspace 内**所有用户共享且持久**；active tab 与滚动状态**不共享、不持久**，每个用户独立。
- 新 tab 插在当前 active tab 右侧并立即激活；滚动时 active tab 始终可见。
- Ctrl+Space：按住 Ctrl 连按 Space 循环“之前打开过”的 tab 缩略图，松开设为当前。
- Ctrl+click 在 Tab manager 多选；可批量移动、加文件夹、删除。

**Insert new tab（+）菜单**：Applications、Create Material library、Create Feature Studio、Create Render Studio、Create PCB Studio、Create CAM Studio、Create Part Studio、Create Assembly、Create Variable Studio、Create Drawing、Create folder、Import。

**Tab manager**
- 搜索框（type-ahead）、Tab order（A-Z/Z-A/按类型）、类型显示过滤（仅显示文档中存在的 Part Studio/Assembly/Drawing/File）、List/Detail 视图。
- 版本中若含 released 对象，出现 **Released** 过滤器。
- 文件夹右键：Rename、Add selected to a folder（立即新建并加入）、New folder、Unpack folder；列表项右键可 Add selection to folder；多选可 Move to another document / Add selected tabs to a folder / 批量删除。
- 文件夹可拖放相互嵌套，最大 10 层；超过 1 层显示 overflow tab 以回到父文件夹。

**Tab 右键菜单按状态分叉**
- **Version**：Open in new tab、Properties（含 Description）、Display FeatureScript code（仅 Part Studio，只读）、Export、Create task（可指派他人/自己、引用该 tab、设 due date，所有被指派者收通知）。
- **Workspace**：Open in new tab、Rename、Properties、FeatureScript code、Duplicate（副本彼此不关联）、Copy to clipboard（iOS 从 tab 菜单 Copy to clipboard）、Select as document thumbnail、Move to document、Export、Delete（即使为 active tab）、Create task。

**Move to document**
- 目标可为新文档（操作中创建）或既有文档；被移动对象与原文档之间建立 link，且**原文档中完全移除**。
- 移动 Assembly tab 时，默认连同被引用 Part Studio 一起移动；可在对话框取消 `Move all referenced tabs` 只移动 Assembly。
- 若移动会导致文档无 tab，则红色提示并阻止；取消勾选可保留 Part Studio 后移动 Assembly。
- 移到共享文档要求 Edit + Link 权限；从共享文件夹移出要求 Edit + Copy 权限（共享文件夹指由非成员公司拥有、共享给你的文件夹）。

**带图纸拆分第三方共享的文档（[文档明确]）**
1. 建图纸 → 2. 对模型 Create version → 3. 图纸 tab 右键 `Change to version` 让图纸引用该 version → 4. 可把模型移走或把图纸移到新文档，图纸不会带走被引用 tabs。
- 图纸此后为 versioned，不会提示模型变化；可在新文档右键 `Update linked document` 选更新版本。
- 若要保留主文件里的链接副本：对 Drawing tab Duplicate，再移走其中一个；副本与原文档链接但不会自动随原图纸更新。

**删除 tab**：右键 Delete；若可能造成冲突，弹 Delete tabs 警告，确认后删除；无冲突则直接删。

### 4.2 Document Panel / Toolbar / Menu

**Document panel（左侧）入口**：Versions and history（打开 Version Manager）、Create version（直接开 Create new version 对话框）、Release drafts（草稿发布候选）、Comments、Document notes、Where used、Performance（Tab performance/Tab graphics/Document performance/System details）、AI Advisor、Explore Onshape、Action items、Tab manager。

**Document toolbar（顶部）**
- Onshape/公司 logo → Documents 页；Document menu 图标；文档名（粗体，可点击改名）；workspace 名（浅灰）；**Copy link** 复制含 active configuration、render mode、exploded view、panel states、view orientation 的链接；所在文件夹名（可点，新标签打开文件夹）。
- FeatureScript notices；Notifications 铃铛；App Store；Learning Center；Share；Help（在线帮助、Learning Center、FeatureScript 文档、快捷键列表、What's New、Forums、Contact Support、Refer a friend、系统兼容性检查、版本信息）；账户菜单。
- 公开文档额外：Public 标识、Copies 总数、Links 总数（当前文档被插入其他文档的次数）、Likes 数（可点击 Like）。

**Document menu**
| 命令 | 关键行为 |
|---|---|
| Rename a document | 改文档名 |
| Move to | 选择文件夹；**从一个根文件夹移到另一个根文件夹时，所有权转移给目标文件夹所有者，Share 权限改为从新根文件夹继承** |
| Document details | 描述显示在 Documents 页 Details 面板；可勾 `Not revision managed`（Release management 且启用 workflow 时）；可设 Category |
| Restore deleted workspaces | 恢复被删 workspace |
| Copy workspace | 另建文档复制当前 workspace，两者无链接；可选择目标文件夹；自动打开到原文档相同 tab |
| Copy version | 查看 version 时出现；复制为另一文档，无链接；除源 version 中已有的 Part number 外不带 release metadata |
| Update workspace | 升级到最新 feature library（见 §4.7） |
| Workspace units | 默认单位与精度（见 §4.3） |
| Workspace / Version properties | 查看/编辑 tabs、parts、描述、part number、revision、state 等；Release management + 自动 part number 时有逐零件生成图标 |
| Switch to view only mode | 进入只读 |
| Print | 打印 active tab 图形区 |
| Close document | 关闭文档 |

### 4.3 默认单位与通知规则

**默认单位（[文档明确]）**
- 全局默认 **inch/degree**；覆盖 Part Studio/Assembly 所有测量、草图尺寸显示值和所有特征默认输入单位。
- 可在任意数值字段输入显式单位（如 `10mm`），自动换算到默认单位。
- Workspace units 默认继承 **Accounts > Preferences**（可覆盖）；**新 workspace 从 version 创建时继承该 version 的设置**。
- Drawings 单位在图纸 tab 内独立管理；`Feet and inches` 只用于 Drawings units，不用于 workspace units。
- Decimal places：
  - 仅浏览器可用；应用于 feature dialogs、sketch dimensions、manipulator dialogs；
  - 作用于 Measure 与 Mass properties；显示精度不足时 Measure 用科学计数法；Mass properties 会显示测量误差；
  - 只影响显示，内部值会舍入、不参与计算；字段编辑时若输入位数更多仍可见；
  - 不影响导入的外部文件。

**In-app notifications（[文档明确]）**
- 位置：Document toolbar 铃铛 + Documents 页标题栏；未读数显示在铃铛旁；可打开、标记已读、删除。
- 14 天自动删除（无论是否读过）；不受 notification preferences 影响（后者只管 email/mobile）。
- 同一活动（upload、translation、document upgrade、workflow、simulation）会更新同一条通知而非新增；更新后重新标记未读；有的通知定时延后出现。
- 覆盖：文件上传开始/取消/完成、上传/导入失败（权限、过大、格式损坏、不支持版本、文件名违反公司策略、库无法升级）；翻译/导入完成或失败（success/success with errors/unsupported/timeout）、单位切换进度；导出运行/成功/失败/参数非法（glTF、3MF、图片分辨率）；邮件导出链接；云存储导出；连接云账户；头像/公司 logo 上传或裁剪失败；Enterprise 管理员上传 SSO metadata；翻译器崩溃（询问是否允许用该文件诊断）。
- 文档升级提示触发：有写权限、旧版本、最后修改超过 90 天、未安排升级（最多每 20 天提示一次）；恢复旧版 workspace；从旧 version 建分支且有 edit（标准内容文档除外）；从 Trash 恢复旧版文档。选择升级后通知“已安排”，并在重试（文档打开）、重试后取消、成功/失败、文档/工作区被删或不可访问时通知。
- 发布/流程/任务：workflow 状态迁移、评论、discard、reassign、transition 开始/失败通知创建者/审批者/观察者；目标状态审批者及代理收到 “needs your approval”；Onshape task 的 assign/complete/discard/comment/reassign；release 完成但部分 workspace 无法应用 part number/revision description 时通知发布者；被设为代理审批人时通知。
- 邀请：被邀请人注册且邀请被批准时，邀请者收到含其 email 的通知；适用文档/出版物/文件夹共享与好友邀请；被邀请人没有站内通知。
- 其他：PLM job 开始/完成/失败；Simulation 排队/进行/成功/失败/取消/结果删除（仅警告算成功）；Make personal copies（每个文档一条 + 总结；批量如 “8 of 10 … 2 failed”；每人最多 10 文档/请求、100 请求/天）。
- **不产生站内通知**：Comments、@mentions、task assignments、documents shared with the user（走 email/mobile 偏好）。

### 4.4 Documents 页面总体结构

- 登录后首页；Enterprise 订阅用户默认落到 Activity 页；企业管理员可设启动页。
- 列表包含所有有权限的项目、文件夹、出版物、文档（含仅 View）。
- 布局与记忆：选择过滤器+布局后，下次访问保持；Projects/Folders 与 Documents/Publications 分隔条可拖动，位置在离开/返回后保留；拖到顶部可折叠 Folders 区。
- 区域：
  1. **Search**：在当前过滤器内搜索；搜索结果显示 Name、Modified（时间/日期）、Modified by、Part number、Revision、State（后三列仅在结果中存在时显示）；Name/Modified 可排序。
  2. **Create 按钮**（见 §4.5）。
  3. **左侧**：Filters、Integrations、Trash；企业/公司过滤器选中时显示 “Last opened by me” 可折叠区；Projects and Folders（可折叠；Enterprise 才有 Projects；grid/list 两种；Enterprise 可 Type 过滤 folders/projects/both；Sort）。
  4. **Documents and Publications**：三种视图（Document/List/Structure）、Type（Documents/Publications/两者）、Expand/Collapse、Add 列（勾选增删，Sort 调整顺序，Search 找列）。
  5. **右侧面板**（见 §2 / §4.6）。
- **选择 vs 打开**：点 tile/行任意处=选中（名称背景变蓝）；点名称（出现下划线）=打开；方向键上下导航；Ctrl+click 多选、Shift+click/Shift+arrow 范围选；Details 面板有 Deselect all。**Document view 下**可拖放文档进文件夹；List/Structure view 不可。
- **内联命令**：Share、Delete/Trash、Labels（标签不能用于文件夹）。Delete 键或 Send to trash 图标；多选可在 Details 面板批量 Trash。
- **右键命令**：Open、Open in new browser tab、Rename、Copy workspace（仅文档；可改名/选文件夹/新建文件夹/排序；成功提示含链接）、Details、Versions and history（仅文档）、Labels、Share、Move to、Go to location（仅 released，按当前 Document/List/Structure 视图定位）、Transfer ownership、Unshare with me、Make public（仅私有文档，Enterprise 不可用）、Make personal copy（需 Global permission + copy access；不能同时选出版物与文档；10 文档/请求、100 请求/天）、Send to trash、Remove from recently opened。
- **缩略图**：默认最后打开的 Part Studio；tab 右键 `Select as document thumbnail`；选 tab 被删/移走后回退；需 Edit 权限。
- **Details 面板**最小宽度 340px；调整后跨打开/重新登录保持。
- **搜索**：搜索框仅在当前过滤器内；下拉箭头开 Advanced search（Type 可选 Document/Part/Part Studio/Assembly/Drawing/All 等）。
- **移动端**：Documents 页功能与 web 相同；侧栏菜单选过滤器；Details/Share details/Versions and history/History/Copy/Move/Trash/Edit name；iPhone 用 X 关闭 Details，iPad 再点 Details 关闭；移动端可选 Document grid/list 并记忆。

### 4.5 Create 菜单与文件夹/标签/过滤器

**Create 菜单**
- Document：命名 + 可选已有 Label；也可 `cad.onshape.com/new`。
- Folder：命名，可选父文件夹。
- Publication：命名（见 §4.9）。
- Import files：本地上传；Import from：Google Drive/Dropbox/OneDrive。
- Project（Enterprise）：指定 name、description、permission scheme、访问者；需相应 Global permission。
- Label：创建并命名。
- 创建文档/文件夹可在 `Document location` 指定已有文件夹，或先进入文件夹再创建；只读文件夹中 Create 按钮不可用。

**Folders（[文档明确]）**
- 权限继承：根文件夹 Share 权限被所有子文件夹、文档、出版物继承；子文件夹全部继承父级。
- 可对单个文档/出版物额外加权限，但**权限是叠加的**（additive），最终权限=文件夹权限+额外权限；官方最佳实践：根文件夹保持最小权限，在单个文档上加权限。
- Share 对话框 `Direct` 标签列出当前文件夹及所有父级条目；`Effective` 每个用户/公司/Team 仅一条，汇总当前及父级全部权限。
- 新建文件夹时只有创建者有权限；Professional/Enterprise 中管理员也有。共享文件夹时其权限成为共享用户对其中全部内容的权限。
- 移动：右键 `Move to`；对话框可 New folder、Sort、Show details、双击/Open 进入、`Move here`；**要求文件夹 Edit + 文档全部权限（Edit、Copy、Link document、Export、Share、Comment、Delete）**。
- 跨根文件夹移动：所有权转移给目标文件夹所有者，Share 权限改为继承新根。
- 删除：选中 Delete 图标 / 右键 Send to trash / 拖到 Trash；Send to trash 对话框确认；文件夹内容一并进 Trash。
- Set library：把文件夹设为 Company-wide 或 individual 的 frame、sheet metal forms、images、standard content library。
- 复制 workspace 到文件夹：需要文件夹 Edit；否则副本落到账户根级，并提示已创建在公司过滤器。
- 重命名：点面包屑文件名/右键 Rename folder/右键 Folders 区 Rename；改后 Enter 或点外部。

**Labels**
- 入口：Create > Label；过滤器列表 Labels 旁的 Create new label；文档/出版物选中后 Labels 图标（Details 面板）创建/添加/编辑。
- 应用：多选文档/出版物 → 右键 Labels 勾选；对话框有 Search；可把选中项拖到已有标签；新建文档/出版物时也可勾选已有标签。
- 过滤：点左侧标签；面包屑显示当前过滤器；列表刷新为该标签的所有实体。
- 删除：选中标签右键 Delete label，确认；仅移除标签，不影响文档；也可在实体 Label 对话框取消勾选以移除。
- 标签不能用于文件夹；仅创建者可见；高级搜索结果中标签只在 Details 面板显示。

**Filters**
- 数据组织方式：Onshape 过滤器、Labels、Folders、Projects（Enterprise）、Teams（任何人可在 Account settings 创建）。
- 首项随许可证：Free/Standard `Owned by me`；Professional 公司；Enterprise/EDU Enterprise 企业；首项激活时显示全部可访问内容。
- 过滤项：Company name、Recently opened（可 Remove from recently opened）、Created by me、Shared with me、Teams（仅显示你所属的，折叠在 Teams 下）、Labels（折叠）、Public。
- Public：Name（文档+workspace）、Modified、Owned by、Copies、Links、Likes（tile 或 Details 面板点赞）；水平滚动看隐藏列；Add 增加列；公开文档所有 Onshape 用户只读可见，但**任何用户可复制后使用其数据，公开不等于授予版权**；Free 账户创建的文档默认公开。
- Enterprise 管理员可对用户隐藏 Public 文档。

**Integrations**
- 已集成的 Google Drive/Dropbox/OneDrive 显示在 Trash 上方；点图标搜索云盘；图标后显示具体集成邮箱；可集成多个账户；在 Account settings > Integrations 或 Enterprise settings > Integrations 配置。

**Trash**
- 只显示你送入 Trash 的项；非 Enterprise 30 天自动删除（顶部横幅+Empty trash）；Enterprise 90 天，管理员可 Empty trash；右键 Restore；Empty trash/单项 Delete 永久删除。

### 4.6 List View / Structure View / 高级搜索 / 右侧面板

**List View（Enterprise + Professional）**
- 访问：Documents 页 Documents and Publications 区点击 List view 图标；从顶层 Enterprise/Company 过滤器跳走再回来会回到 Document view（桌面）。
- 过滤器：Types（part/Assembly/subassembly/Drawing，默认全开）、Name、Description、Part number、Revision；`Add filter` 可加 Vendor、Project、Product line、Title 1、Title 2、Title 3、Material；默认四项不可移除；`Clear all filters` 重置。
- URL 分享：配置好的过滤条件写入地址栏，同公司/企业用户打开即带同样过滤。
- 内容：选中 project/folder 下最新 released/revisioned 组件表；行含缩略图、类型图标、名称超链接（当前 tab 打开；右键可新 tab）、最新 revision 图标+括号名称、高亮 part number、Description/Revision 等列；Drawings 显示在其被引用对象下方；Standard Content 与 non-geometric Items 不纳入。
- 导出：悬停行右侧 Export 图标 → Export 对话框。
- 列头右键：Sort ascending/descending（非所有列）、Pin column（除 Name；默认 No pin）、Autosize this/all columns、Remove column、Choose columns、Reset columns；Add 按钮也可加列；拖列边改宽（右侧列不变），可拖列头重排。
- 组件右键：Open in new browser tab、Add to publication、Create task、Export、Details；可 `Collapse all row groups`（Structure）。
- 右侧面板：Details（Document name、Owner、Location 链接、Created by、Last modified by）、Properties、Where used（不含 Drawings）、Revision history（按时间倒序：revision name 链接、Release name + View release、Submitted by + 时间）。
- 移动端：All filters 对话框可增删编辑（默认四项不可取消），Reset all、Cancel；Folders/Projects 横向 grid、面包屑、折叠；点击行打开组件；Details/Share details/Where used 三个面板；**离开返回不保留 List view**（与桌面说明冲突，见 §1）。

**Structure View（Enterprise + Professional）**
- 访问：Documents 页 Structure view 图标；从顶层过滤器跳走再回来回到 Document view。
- 上方 Folders/Projects（可折叠、面包屑）；下方 **As built structure view**：最新 released/revisioned part/assembly/drawing 树，从顶层装配向下；**不显示 previous releases**；只在当前 folder 的组件可见（上下级文件夹组件不显示）；未被任何装配使用的已发布组件置顶。
- 状态：有更新 revision 时 revision 图标蓝色；obsolete 组件在名称旁和 Revision 列显示 obsolete 图标；子装配非 revision managed 时 Revision 列标注 “not revision managed”；默认不显示 drawings，`Show drawings` 开关控制；滚动时顶层行固定到下一个 heading 行。
- 列：Name（类型图标、名称超链接、新标签打开、revision 图标、高亮 part number；Name 不可隐藏）、Description、Part number、Revision；Add columns 可加 Vendor/Project/Product line/Title 1-3。
- 图纸：被 drawing 引用的 part/assembly 行有 drawings 下拉按钮，展开显示关联 drawing，堆叠在下方。
- 键盘：选中后进入键盘导航；点击已选中项不清除选择（便于操作外部后回来）；再点选中项恢复键盘焦点；Esc 清空；点展开/图纸图标也把焦点带到该行。
- 列头右键与 List 相同；拖列头重排、拖边改宽。
- 组件右键：Open in new browser tab、Add to publication（仅尚未在出版物中的组件）、Create task、Export、Details、Collapse all row groups。
- 面板：Details、Properties、Where used（不含 Drawings）、Revision history；移动端为 Details、Share details、Where used 三个。
- 移动端：顶部 Structure；长按行出右键菜单；Add columns；点行新标签打开组件；Details 面板含 Open、Type、Document name、Owner、Document description（可编辑）、Created/Last modified。

**Advanced Search**
- 搜索范围：当前激活过滤器（如 Recently opened 只在其中找）；点面包屑公司名再点搜索框可搜全公司。
- 字段：
  - Type：Document、Part、Part Studio、Assembly、Drawing、Feature Studio、Variable Studio、Project、Folder、Publication、All。
  - Category：Assembly、Document、Drawing、Feature Studio、Part、Part Studio、Publication、Variable Studio（可多选）。
  - Name、Description、Part number、State（如 In progress/Pending/Released/Obsolete）、Revision。
  - Add criteria：Free/Standard/Education 可搜索 Owner、Creator、Vendor 等默认字段；Company/Enterprise 可搜索自定义属性（需属性启用）；可逐行追加多个 criteria；日期类弹出日历；`Not revision managed` 为 True/False。
  - Results from：Workspaces / Workspaces and Versions / Versions；latest only / all；当前文件夹含子文件夹 or 不含。
- 支持多词与标点（`universal handle`、`universal-handle`）；`*` 通配（如 Part number `*600*`）；输入时搜索栏自动生成完整 query；Reset 清空。
- 结果：按 Name 或 Modified 列排序（点列头出现箭头）；每条显示实体类型图标、workspace/version/revision/latest revision 图标、括号内名称、part number（仅 Release management 中）、状态（Released/Pending/In progress/Rejected/Obsolete/Discarded）；hover 非文档项时 tooltip 显示 tab 名；选中后 Details 面板可看详情；含 revision 信息时显示 Revision history 图标；有自定义属性时显示 Properties 图标。
- 右键：Open、Open in new browser tab、Export、Details、Share、Go to location（Document/List/Structure）、Transfer ownership。

**Documents 页右侧面板**
- Details：更多文档信息，可开关。
- Analytics：Document Dashboard（建模时间、动作数、tab 类型、建模活动、访问地点）；任何有 View 权限者可看。
- Share details：文档及所在 folder/project 权限；Connection 徽章=与外部 Enterprise 共享。
- Properties：文档/元素/folder/project 的 metadata；灰色=公司管理员设置；你编辑的属性在全公司生效。
- Versions and history：可在 Documents 页执行与文档内相同的版本图操作；hover 条目显示该 Version 属性中填写的 description。
- Document notes：全部文档笔记。
- 面板中点击文档名→新标签打开；悬停→Copy link 图标。
- 搜索条件/结果含 State 等 revision 信息时，Details 面板出现 Revision history 图标；点击打开修订历史，结果中选中零件的 revision 以蓝色高亮。

### 4.7 版本、分支、历史（Version Manager）

**核心行为**
- 每次编辑完成，Onshape 捕获 workspace 中**每个 tab** 的状态（所有用户、所有 tab），并保留 version；文档有“无限记录”。
- 新文档自动创建 Start version + Main workspace；空文档 Start version 含空 Part Studio + 空 Assembly；Main 建模前为空。Main/Start 可重命名。
- Version：整个文档在某一时刻的状态；几何与相关属性（Part name 等）不可变，但 **version 的 properties 可改**；可创建多个 version；可从 version `Branch` 出新 workspace。
- Version graph 颜色按 branch；active branch 可一键只显示当前分支；所有 merge 显式画出；可 `Show/Hide merges`、`Show/Hide automatic versions`。
- 发布候选也会作为 version 出现在 Version Manager。

**创建版本**
- 方式 1：Document panel 的 Create version 图标——后台建 version，不离开当前 workspace。
- 方式 2：Versions and history 面板 → 选 workspace（激活）→ Create version 图标 → 输入 name/description。
- 默认命名 `V1, V2, ...`（V=version，x 从 1 递增），可重命名。
- 若有图纸待更新（亮黄色 Update 图标），对话框提示 “These drawings should be updated before creating a new version”；点提示中的 Update 图标会更新全部列出图纸——**即使随后取消对话框，图纸也已更新**。
- 按钮：
  - `Create`：建版本并留在当前 workspace；
  - `Create version and edit properties`：建版本并打开新版本 Properties 对话框（含每个 tab/part 的 name/description）。
- 自动版本：更新文档引用（Update all/references manager）时可能自动创建，图上显示 automatic version 图标；Onshape 员工在 Modified 列用户名左侧有 Onshape logo。

**从版本创建分支/工作区**
- Versions and history → 右键 version → `Branch to create workspace` → Properties 对话框输入 name/description → `Create`（建 workspace，可选打开）或 `Create version and edit properties`（按原文；建 workspace，可选打开，并打开其 Properties 对话框）。
- Branch 可含 0..N 个版本，末端最多 1 个 workspace；branch 文字粗斜体；点开/闭表示是否有 workspace。
- 分支示例：Base Frame version → Seat/Brakes/Shocks 各自 branch → 各自设计/版本 → merge 回 Main。

**版本/分支右键命令（随右击对象变化）**
- Open / Open in new browser tab / Copy link（指向具体历史点/分支/版本）。
- Compare（任一 version 与 workspace 的历史点）。
- Merge into current workspace（Source→当前 Target）。
- View in repair（在任意历史点打开 Repair 面板）。
- Restore to main（同一分支 Source→Target）。
- Create version here。
- Workspace protections。
- Properties（当前 branch 的 Name/Description、Category、tab 树，可逐 tab 编辑）。
- Publish FeatureScript（文档含自定义特征时公开）。
- Delete（删当前 branch；**Main workspace 与 versions 不能删**）。

**删除 workspace**
- 权限：文档所有者；或共享用户且其 Share 权限勾选 `Delete`。
- 语义：删除 branch 末端的 workspace；若分支无任何 version → workspace+branch 都删除；若分支有一个及以上 version → 只删 workspace，分支回退到最新 version。
- 操作：Versions and history → 右键 branch → Delete → 确认 Delete。
- **恢复删除的 workspace**：Document menu → Restore deleted workspaces → 勾选 branch(es) → Restore selected。

**Update workspace（升级功能库）**
- Document menu → Update workspace → 对话框 → `Update now`。
- 更新过程中文档不可访问；回 Documents 页该文档名右侧有 update 图标，hover 提示更新完成后可用；多 workspace 时需逐个更新。

**Search history**
- 在 Versions and history 的 Search history 输入词，过滤所有 branch 的历史条目（不受 Active branch 限制）；**不搜索 version 名称/描述**。
- 下拉可再筛：Tab（默认 Any tab）、Tab types（Part Studio/Assembly/Drawing，Clear 重置）、Modified by（Only me/Not me/Any）、Date modified（Start/End；默认全部）。
- Search / Reset。

**Filter branches**：Show all branches（默认）、Show all branches with workspaces（隐藏已删 workspace 的分支）、Show current branch、Show current branch with parent branches。

**历史列表**
- `Show changes` 展开；超过 25 条先显示 25 条，`Show more` 继续。
- 条目描述 `Tab-name::Action:Feature-name`；hover 显示谁/何时；点击可视化该历史点（含列出的特征）；可 Compare 两个历史条目。
- Restore 在右键；`Return to <branch-name>` 回到当前分支当前点。

**Properties for workspace/version/release**：可在 part（Part Studio 的 Parts 列表右键；Version/history 中 version/workspace 菜单）、Part Studio/Assembly（tab 右键；version/workspace 菜单）、foreign data（tab 右键；同上）、Release（版本图中 release 右键）编辑。

### 4.8 Compare / Repair / Merge / Restore / Workspace Protections

**Compare（Available in Part Studio, Feature Studio）**
- 入口：Versions and history 面板顶部 Compare 图标，或 Target 右键 Compare。
- 可选任意两个历史条目（workspace/version/其中的具体 change；要选具体 change 先展开 Changes）。
- 视图：左侧第一选择（Base，蓝），右侧第二选择（Target，红）；默认显示各自特征列表 + 差异可视化；滑块控制显示 Base/Target 的比例；`Reverse compare` 交换左右；可 `List all features of both`。
- 有 Configuration 时对话框包含配置选择；`Compare` tab 列出文档所有 Part Studio 供选择；右键 `Show/Hide Part` 便于比较多零件变化。
- 差异图标：无图标=相同；Not equal；Less than=Base 缺少、Target 有；Greater than=Base 有、Target 无；Moved up/down=特征存在但 Features 列表位置不同。
- 公差：比较两个历史条目时，选中要比较的 Feature，不同 Tolerance options 用黄色标出。
- Feature Studio：逐行比较代码，新增绿色、删除红色，可 Reverse compare。

**Repairing**
- 入口 1：Part Studio → Versions and history → 右键某个 change → `View in Repair`，或点面板工具栏 Repair 图标后选 change（必须是未断引用的最后健康状态，通常是断引用前一条）。
- 入口 2：右键失败特征 → `Edit healthy moment of [Feature]`；或双击特征 → 右键断引用 → `Edit healthy moment`。
- 布局：左=当前 Part Studio，右=Repair 面板（选定历史点/最后健康时刻的只读对照）。
- 修复：默认 Synchronize view（视角/缩放/平移同步）；可关闭；rollback bar 无论是否同步都联动；在左侧改引用后两边同步更新；hover 断引用会在 Repair 面板高亮其原先指向。
- Replace reference：Repair 面板打开时，在特征字段 hover 断引用 → Replace reference 图标 → 选择新引用（Features 列表或图形区）→ `Propagate changes`（默认勾选）→ 确认 → 再确认特征；若 Propagate，下游所有使用该引用的失败特征一起更新；一次操作仅替换 1 个引用（1-to-1），不支持 1-to-many、many-to-1、many-to-many。
- 明确不支持：替换隐式/显式 mate connector、in-context 引用、外部草图引用；若一个特征由单一选择生成多个引用（如一个 Fillet 后因 rollback 变成两条倒角边），无法传播，提示无法确定匹配引用。
- Notes：可选任意历史点；选中 change 不健康时蓝色提示建议换健康点；rollback 联动；支持切换 Configuration；删除当前 branch 时 Repair 面板自动关闭；section view 中排除的零件在 Repair 面板仍被剖切；Measurements/Analysis/Mass properties/tagged comments 不显示在 Repair 面板；版本图选择色不同以标识 repair；重开 Repair 面板恢复上次状态（除非从新历史点进入）；cross-highlight 对 mate connector 与几何（线/面）有效。
- Repair 面板右键：Zoom to fit（`f`、双击滚轮）、Isometric（`shift+7`）。

**Merging**
- 语义：Source（version/workspace）→ 当前 active Target workspace；合并会把 Source 的 delta（相对 base）应用到 Target，包括新增特征、tabs 等。
- Base = Source/Target 分叉的公共祖先；若同一 Source 分支此前合并到该 Target 且未回退，则 base 为最后一次合并点。
- 步骤：Versions and history → 选中 Target（高亮）→ 右键 Source → `Merge into current workspace` → Merge 对话框。
- 整体策略：`Keep [Target]`、`Merge changes`（默认）、`Replace with [Source]`；可逐 tab 覆盖（覆盖处黄色标记）。
  - Merge changes 仅 Part Studio 与 Assembly，且两个分支对该 tab 都有改动；Part Studio 改动包括创建/修改/删除 feature、configuration inputs、materials、appearances；Assembly 改动包括增删/修改 component、mate connector、configurations。
  - Drawings、PCB Studios 不支持 Merge changes，只能 Keep 或 Replace；官方建议图纸只在一个 workspace 编辑，合并时 Keep 该 workspace。
  - tab 被创建/删除时只能 Keep/Replace。
- 图标：绿勾=该 tab 编辑在 Target 保留；红叉=该 tab 的丢弃编辑（如删除 feature）在 Target 保留；感叹号=合并后 Target 中没有该 tab；信息图标=该 tab 类型不能合并两分支改动，只能 Keep/Replace。
- 无改动：若 Target/Source 相同且所有 tab Keep，Merge 按钮不可用；“No changes” 指 base→source 的 delta 为空。此时唯一选项 Keep/Replace，默认 Replace。
- 合并线：显式画在版本图，可 Show/Hide merges。
- 阻止/错误：
  - 受保护分支：工作分支必须先吸收受保护分支（先 merge protected→working），否则 Merge 按钮禁用并提示 “Workspace protections are enabled”；先关对话框，选 working branch，右键 protected → Merge into current workspace，确认 Merge；再选 protected，右键 working → Merge into current workspace；然后才能合回。
  - FeatureScript 版本不一致：提示；点 Update FeatureScript 图标 → Update now → 再 Merge。
  - 文档被使用：他人打开或你在多窗口/多标签打开时列出用户与实例数；需都关闭；对话框自动刷新后可 Update now；若无法验证（网络问题）显示超时+Retry。
  - 更新进行中：不能合并，稍后再试。
- 合并后：不能通过 Undo 撤销；弹出消息带“revert the merge”链接，且切换 tab/workspace/compare 时仍保留，便于检查结果；点关闭图标接受合并。**若合并后你或他人又改了文档，再 revert 会丢失这些改动**。
- `Compare with base` 链接在新标签打开 Source/Target 对比。
- 只想合并某些 tab 的其他改动：整体 Keep [Target]，逐 tab 选 Replace/Merge。
- 对话框 tab 排序：有改动在上、无改动在下；组内按 tab bar 从左到右，Target 分支在前、Source 分支在后；文件夹不显示。

**Restoring**
- 语义：同一 branch 内 Source 历史点 → 当前 Target workspace。
- 步骤：Versions and history → 右键历史点 → `Restore to B1`（Target 为当前高亮 workspace）→ Restore 对话框。
- 整体策略：`Keep [Target]`（保持 Target 不变，什么都不改）、`Replace with [Source]`；可逐 tab 覆盖。切整体策略时，所有有改动的 tab 切到该策略。
- 图标：绿勾=该 tab 编辑在恢复后保留；红叉=该 tab 被旧版本替换；感叹号=恢复后 Target 中没有该 tab。
- 点 `n changes` 链接可在新标签打开 Compare；恢复动作显示为该 branch 的最新 change。
- 只想恢复某些 tab：整体 Keep [Target]，逐 tab Replace with [Source]。
- tab 排序规则同 Merge；文件夹不显示。

**Workspace Protections**
- 受保护 workspace 在 iOS/Android 也受保护，但**不能在移动端启用/禁用**，只能桌面浏览器。
- 必须“分支改 + merge 回”的改动：几何、图纸、某些 metadata、创建/删除 tabs。
- 允许直接在保护分支做：Release management 及其必需 metadata、Refresh drawings、版本创建、分支、合并。
- 保护≠只读：有 Edit 权限者总能 branch 出去改再 merge 回来。
- 启用：Versions and history → 右键 workspace（如 Main）→ Workspace protections → 勾 `Enable workspace protection` → Apply；横幅提示当前分支受保护，版本图显示锁图标；此时不能加 tab、画草图、改几何等。
- 合并前：working branch 必须与 protected 同步；若 Merge 禁用且提示 “Workspace protections are enabled”，按 §Merging 的“先保护→工作，再工作→保护”两步。
- 权限：非 Enterprise 任何有 Edit 权限者可开关；Enterprise 由企业设置 Global permissions 的 `Workspace protection permissions` 指定 Individuals/Teams 名单（搜索姓名/邮箱 → Add → Close）。

### 4.9 Document Notes / Properties / Where Used / Publications

**Document Notes**
- 面板右上：Refresh notes、Edit notes、Close (X)。
- 编辑态：Apply、Cancel、Preview、Close (X)；预览显示在面板下半部。
- 支持标准 Markdown：`#`/`##`/`###` 标题，Setext 下划线标题，`*`/`**`/`***` 斜体/粗体/粗斜体，`-`/`*`/`+` 无序列表，数字+`.` 有序列表，`>` 引用（可含标题/列表/代码），`[text](url)` 链接。

**Properties (Metadata)**
- 打开：part/tab/document 右键 Properties；或 Documents 页 Properties 面板。
- 字段：Name、Description、Part number、Revision、State 等默认属性 + 公司自定义属性；灰色不可编辑。
- 按钮/动作：`Create release`（可选，启动发布）、`Generate next part number` 图标、`Apply`（公司/课堂/企业内全公司生效）、`Save`（只保存不应用，之后打开再 Apply）、`Reset all`。
- BOM：装配属性设置后，BOM 中含的属性自动更新。
- 公开零件（如 Standard Content）：可覆盖部分属性且保留作者原始元数据；覆盖仅对当前用户生效（公司/课堂/企业内对整个公司生效），自动带入新版本并流入 BOM；管理员可在设置中授予覆盖标准内容/公开零件 metadata 的权限。
- 图纸 Revision Table 的 Description 列文字会自动更新图纸的 Revision description 属性；部分属性可 Configured（Configured Properties）。
- 与 Drawing properties 区别：metadata 属于图纸本身；Drawing properties 管单位、精度、视图默认、构造几何、格式等。

**Where Used**
- 可用性：Enterprise 与 Professional；Professional 跨公司/所有者时只可访问共享给其的数据；**不适用于匿名链接查看者**；支持 view-only、light、guest。
- 结果只覆盖 **版本/修订**：Onshape 不在结果中包含 workspaces；从 workspace 发起会提示无结果，需在过滤器中选 version/revision。
- 入口：
  - Documents 页搜索结果选中 part/assembly → 右侧 Where used 图标（移动端 Android 在 Detail 面板点 Where used；iOS 两指点击图形区选 Where used）。
  - 文档内 Part Studio 的 Parts 列表 / Assembly 的 Instances 列表 / 图形区右键 → Where used；结果显示在 Document panel（桌面在 Instances/Feature 列表左侧或右侧；Documents 页在右侧）。
- 过滤：Version selector 选 part/assembly 的 version 或 revision；结果只显示使用该 version/revision 的 Assembly 与 Drawing。
- 结果解读：缩略图 + 每层被使用记录（如 “Bearing Shield V2 用于 Ball Bearing Assembly V2（In progress）→ 后者用于 Wheel Assembly V9 … → Truck Assembly V8 → Main Assembly V7，ASN-349”）；结果列表按最新→最旧。
- 下拉过滤：Latest revision（仅最近发布的装配/图纸）、All revisions（所有已发布使用）、All versions（含未发布版本的使用）。
- 多零件 Part Studio：Part version selector 底部 `Show more` 展开每个 part 在每个 version/revision 的选项，选择具体 part。
- 配置零件：点配置零件名旁下拉，列出生效的 configurations；V1 未配置时名 WASHER，V2 配置后名 M10 Washer。
- Feature Studio：tab 右键 Where used；列出使用它的文档版本，以及它被导入到哪些其他 Feature Studio（面板底部）；过滤 Latest revision/All revisions/Latest versions/All versions。
- 其他：结果右键可对该结果继续 Where used，或 `View in Isolate mode` 新标签隔离（configured part 不会以 Isolate 打开）；无权限项显示 “Not permitted.”；文档未捕获/未入结果时显示 “Failed captures.”，展开可看未捕获文档列表。

**Publications**
- 可用范围：语料首行徽章缺失（见 §1）；正文明确可被所有计划用户共享，且始终 view-only。
- 创建：Documents 页 Create > Publication → name/description/labels → Create → 打开空 publication。
- 插入 tabs：`Insert document tabs` 打开 Publication manager（类似 Tab manager）：可按文档 URL/Recently opened/Created by me/Team/Project/Folder 搜索；只能插入有权限文档；顶部可按 Part Studio/Assembly/Drawing/files 过滤；**tab 必须已 versioned 或 revisioned** 才能插入；默认最新 version，点 Version graph 图标选旧 version；点 Revision 图标选具体 revision（对话框显示当前最新 revision）；Part Studio 的单个 part 只有被 release 后才能单独插入（Released item 图标查看）；可用蓝色 `Create a version` 链接先创建版本。
- 插入后：Publication manager 列出 tab + 底部缩略图；禁止重复插入；数据只读（Feature list/Parts list 可看）；publication 的 name/description 等 metadata 可由有权限者编辑；可拖放排序、文件夹组织（右键 Add selection to folder、Unpack）；`List view`/`Detail view`；过滤/搜索。
- 多零件 Part Studio 插入某 revision 的零件时，图形区高亮该 part，Feature list 高亮相关特征。
- 引用对象有更新 version/revision 时，点蓝色通知更新。
- Document menu（发布物内）：`View as viewer`（显示只读用户所见，右上 Done 退出）；hamburger：Rename publication、Move to、Publication details（Description、`Force publication Export rules`——勾选后向未注册用户共享/链接时强制执行导出规则；用户所有出版物用 My account > Preferences > User export rules，公司/企业所有用 Company/Enterprise settings > Preferences > Company/Enterprise-wide export rules）、Insert document tabs、View as viewer、Copy publication、Print、Close publication。
- 备注：Publication notes 在窗口下半部，铅笔图标进入编辑，Markdown，Preview、Apply/Cancel、Refresh notes；支持与 Document notes 相同的 Markdown 示例。
- 共享：view-only；可共享给个人、Teams、用 email 邀请 guest、创建链接；guest 只看到明确共享给其的信息；任何有链接者可打开；`View as viewer` 预览；共享进来者始终显示 view-only toolbar，任何 tab 数据不可改（无论权限）。
- 缩略图：Publication 左侧 tab 列表右键 `Select as publication thumbnail`。
- Documents 页：Type=Publications；搜索；Publication 右键：Open、Open in new browser tab、Rename publication、Copy publication、Details、Labels、Share、Unshare with me、Move to、Transfer ownership、Send to trash。

### 4.10 导入（格式、选项、流程）

**总则**
- 支持 CAD 与非 CAD 导入；CAD 自动转 Onshape 内部格式；导入的 CAD 无特征树，Onshape 提供在简单实体上做参数化特征的工具。
- 数据来源与落点：
  - Documents 页导入 → 一个或多个新文档，文件名=文档名；**自动创建一个 version**；
  - 文档内导入 → 新 tab，文件名=tab 名，tab 图标显示文件类型。
- 通用交换格式：ACIS、JT、STEP、IGES、Parasolid、OBJ、STL；AutoCAD solids 最佳为 ACIS，2D 数据导入 DWG/DXF。
- 上传上限 **4GB/文件**。
- 可 zip 导入的 CAD：SOLIDWORKS、Inventor、Pro/Engineer、Creo/PVZ、NX、CATIA、Parasolid。
- zip 规则（[文档明确]）：zip 名必须与顶层装配同名（去掉扩展名后同名）、不得重命名；扩展名只能是 `.zip`，不要 `.sldasm.zip`/`.asm.zip`；包含全部 parts/subassemblies；**扁平化，zip 内不得有文件夹**；导入整个 zip。SOLIDWORKS 用 Pack and Go：`Flatten to single folder`，zip 同名；若有 configuration/lightweight：Assembly tab → 右键根文件 `Set Lightweight to Resolved` → `Rebuild on Save Mark > Add Mark for All Configurations` → 保存根文件。
- 也可靠 Parasolid `.x_t` 导入 SOLIDWORKS 装配（两者同为 Parasolid 内核）。

**导入格式矩阵（Part files）**
| 格式 | 版本/说明 |
|---|---|
| Parasolid B-rep `.x_t`/`.x_b` | v10.0–v38.1；**Onshape 首选导入格式** |
| Parasolid mesh | v28.0–v37.0；zip（x_t+xmm_txt / x_b+xmm_bin）或单 x_b；仅查看/参考，不可编辑 mesh |
| Parasolid mixed model | 自 v32.0；zip（x_t+xmm_txt / x_b+xmm_bin）或 x_b；mesh+B-rep |
| ACIS `.sat` | 至 2023 1.0 |
| STEP `.stp`/`.step` | AP203、AP214、AP242（仅几何与面颜色） |
| IGES `.igs`/`.iges` | 至 5.3 |
| CATIA v5 | R7–R33（v5-6R2024, R33）、v5-6R2026 |
| SOLIDWORKS `.sldprt` | 1999–2026 |
| Inventor | 9–2026 |
| Pro/ENGINEER、Creo | Pro/E 2000i–Creo Parametric 12.0 |
| JT `.jt` | 至 11.0 |
| Rhino `.3dm` | 2–8 |
| STL `.stl` | 仅查看/参考 mesh，不可编辑 |
| OBJ `.obj` | 仅查看/参考 mesh，不可编辑 |
| NX | NX UG15.0–NX12.0.2.9、NX 1911/1915/1919/1926–1946/1965/1969/1973/1847（latest 1847.2400）/1851/1980…2512 各系列（至 2512.4000）；语料列出大量点版本 |
| Solid Edge `.par`/`.psm` | 10–2026；**`.psm` 不会生成 Onshape 钣金模型**，只能引用导入面并用 Thicken 建钣金 |
| glTF `.gltf` | 2.0 |
| 3MF | 支持 |
| PVZ `.pvz` | 支持 |

**Assembly files**：Parasolid B-rep v10–v38.1；ACIS 至 2023 1.0；STEP AP203/AP214/AP242（几何+面颜色）；CATIA v5 R7–R33/v5-6R2026*；SOLIDWORKS Pack and Go zip 1999–2026*；Inventor `.iam` 9–2026*；Pro/E–Creo 12.0*；JT 至 11.0；Rhino 2–8；NX*（同 Part 版本区间）；Solid Edge 10–2026*；glTF 2.0；3MF。`*` = 必须把全部零件与装配放进同名 zip。

**Drawing files**：AutoCAD `.dwg` 至 2018；DXF `.dxf` 至 2013、2018；DWT `.dwt` 2013、2018。

**非 CAD 文件**：可导入并可查看 `.pdf`、`.mp4`、`.png`、`.jpg/jpeg`、`.svg`、`.gif`、`.txt`、`.md`、`.csv`、`.json`；可上传但不可查看：`.py/.java/.js` 等代码、`.mov`（取决于浏览器/插件）、`.doc/.docx`。

**导入处理选项**
- `Import to a single document`：按文件内容创建 Part Studio/Assembly，命名取自文件；适合小型—中型装配（几百件）。
- `Split into multiple documents`：创建主文档+子文档；若 Assembly 层级内超过 **100 个唯一零件**，为这些零件额外建 Part Studio 文档；可选 “one document per part or Assembly”，这些文档放在以导出文件名命名的文件夹，保留数据结构与链接；适合大型多级装配（数千件）。结果：顶层 Assembly 文档只有 Download 选项，链接的零件文档有 Update + Download。
  - 纯多零件无装配：每个零件独立文档 + 顶层链接 Assembly；
  - Assembly 无子装配：单文档导入；
  - Assembly 有子装配：顶层与每个子装配各一个文档。
- `Combine to a single Part Studio`：把装配打平成单个 Part Studio；重复实例会产生重复零件；仅建议小装配（否则影响性能）。与 “Create a composite part…” 互斥（后者不可在 Combine 时使用）。
- `Import appearances`：默认导入面外观；取消则移除；导入后可在 Part Studio 的 Import 特征里再勾选。
- `Import material density`：可从 SolidWorks、Solid Edge、CATIA V5、Pro/E、Creo、NX 导入材料密度，作为 custom material，使 Mass 等属性可算。
- `Orient imported models with Y Axis Up`：Onshape 为 Z-up；Y-up 系统勾选后导入为 Y-up；对 `.ipt`（Autodesk）和 `.catpart`（CATIA）不支持；导入后可在 Import 特征勾 `Source is 'Y Axis Up'`。
- `Create a composite part when importing multiple or non-solid bodies`：把导入 Part Studio 中所有零件合成一个闭合 composite part（不论是否同一 body）；Combine to single Part Studio 时不可用；导入后可在 Import 特征勾 `Create composite`。
- `Join adjacent surfaces`：尝试把相邻面合并为 Part(s)；移动端注明只适用于 BREP，不适用于 mesh。
- `IGES postprocessing`（仅 IGES）：修复线性边翻译问题；**处理时间可能增加 50%**。
- 故障导入：Onshape 允许导入未通过验证的零件；Feature list/Parts list 红名、通知消息提示；坏几何可能导致下游操作失败；若检测到可能碎裂，会把同一（碎裂）body 的全部曲面/曲线自动转为单个闭合 composite part。

**流程**
- Documents 页：Create → Import files（本地）或 Import from（云）；未集成时 `Connect service...` 向导；选择文件（可多选）；若属公司计划，选 owner（自己/公司）；可拖放到 Documents 列表至蓝色 import 轮廓；选 processing options → Import；导入对话框可点文件名立即查看，hover 右侧 X 关闭。
- 文档内：+ → Import → 选文件 → 选项 → Import；新 tab 出现在底部。
- 通知：铃铛查看导入队列/进度/错误/警告；失败可点 retry。
- 移动端：**仅云源导入**；Documents 页右下 import 按钮；来源含 iCloud/Dropbox、相机、相册；文档内 Create Tab → Import，可选 Scan/Photo Library/Camera/Files；CAD 翻译成功会再建一个 tab；导入对话框不刷新文件列表，需去云盘应用更新。
- 移动端选项：`Import with Y Axis Up`、`Import file to Part Studios only (flatten)`、`Allow import of parts with faults`、`Create a composite part…`、`Units`（仅 .stl/.obj：centimeter、foot、inch、meter、millimeter、yard）、`Join adjacent surfaces`（仅 BREP）。

### 4.11 导出与下载（选项、格式、限制）

**可导出对象与入口**
- 零件和曲面（Part Studio）、整个 Part Studio、整个 Assembly、linked documents（浏览器和 Android）、草图与平面、钣金展开视图。
- 入口：Parts/Instances 列表或图形区选择后右键 Export；tab 右键 Export；Tab manager 中 Ctrl+click 多选多个 Part Studio/Drawing/Assembly 后右键 Export（**不能混合 Part Studio 与 Assembly**）；图形区平面右键 `Export as DXF/DWG`；图纸 tab 右键 Export / 多图纸 Export drawings。
- 多零件：可一次选多个；STL/Parasolid 可选一个文件或单独文件（单独文件打 zip）。
- 复合零件：导出会拆成多个独立零件，而非一个复合件。
- 下载数据**不含特征/参数化历史**。
- 文件名：默认 tab 名（+ 零件名，若导出单个零件）；`\ / * : | > < ? "` 自动替换为 `-`（含 Date 类型属性等引用字符）；Date 默认格式导出为 `YYYY-MM-DD`；可用 metadata 命名（Export rules）。

**导出格式矩阵**
| 对象 | 支持格式 |
|---|---|
| Parts / Part Studios | PARASOLID B-rep v25.0–v37.0；Parasolid mesh（zip x_t+xmm_txt 或单 x_b）v28–v37；Parasolid mixed（zip 或单 x_b）；ACIS `.sat` v5；STEP AP203/AP214/AP242（几何、MBD 数据、面颜色）；IGES 5.3；STL；JT 至 11.0；GLTF；Rhino 2–8；PVZ 8.0；3MF；OBJ |
| Assemblies | PARASOLID v25–v37；Parasolid mixed；ACIS v5；STEP AP203/AP214/AP242（几何+面颜色）；IGES 5.3；PVZ 8.0；JT 至 11；GLTF；OBJ；3MF；URDF；STL |
| Drawings | PDF；DWG（Release 11-14、2000、2004、2007、2010、2013、2018）；DXF（同版本）；DWT（2013、2018）；SVG；PNG；JPEG |
| 草图 / 平面 / 钣金展开 | DWG、DXF |

**导出对话框字段/默认值**
- File name；Format（PARASOLID、ACIS、STEP、IGES、PVZ、JT、RHINO、GLTF、GLB、OBJ、3MF、URDF、STL；URDF 仅 Assembly）。
- `Export models oriented Y axis up`。
- **Preprocessing（仅 STEP）**：None（默认）、Automatic（含 centering + HealAndSew）、Remove small entities only (advanced)（Bodyshop 去小边/小面/薄面/尖刺 + 周期实体拆分 + 高级 split ring/重参数化/强制 trimming loop/SP-curves）、Remove small entities only (basic)、Remove small entities only (advanced) and convert all surfaces to b-surfaces。
- **Geometry format（仅 URDF）**：STL、GLTF、GLB、OBJ。
- Version（仅 PARASOLID、RHINO、STEP）+ `Use latest version`（默认勾选，勾选时 Version 不可编辑；取消后可手选）。
- **Use custom units for export（仅 STEP）**：Centimeter、Foot、Inch、Meter、Millimeter；不勾时 STEP 默认 **Meters**。
- `Include derived tolerances in export`（仅 STEP，含派生 MBD 数据）。
- `Use custom annotation text height for MBD export`（仅 STEP；小模型时设 Annotations text height）。
- `Use compatibility mode for surfaces and curves`（仅 IGES，导出旧版 IGES 兼容老 CAD/CAM）。
- **Resolution（GLTF、GLB、OBJ、3MF、STL、URDF）**：Coarse、Medium、Fine、Custom；Custom 时 GLTF/GLB/OBJ/3MF 指定 Distance tolerance、Angular tolerance、Maximum chord length；STL 指定 Chordal tolerance、Angular deviation、Minimum facet width。
- `Compress`（仅 GLTF/GLB，压 mesh，不压非 mesh 几何）。
- `STL Format`：Text 或 Binary；`Units`：Centimeter、Foot、Inch、Meter、Millimeter、Yard。
- **Options**：Download；Download and store file in a new tab；Email with file download link；Store file in a new tab。
- `Export unique parts as individual files`（默认不勾；勾后多零件各自成文件并 zip）；`Apply export rules to contents`（多 Part Studio/Assembly 时，默认勾选；取消则只对 zip 文件夹应用规则，不对内部文件；旁有 View export rules 链接）。
- `Export rigid subassemblies as a single link`（仅 URDF；把 fastened mate 连接件合成单个 link，子件几何/质量并入父 link，删除 fixed joint）。
- `Include hidden instances in export`。
- 注意：**suppressed parts/instances 不进 Assembly 导出**；OBJ 导出为 zip（.obj+.mtl），.obj 单位为米；重新导入 OBJ 必须先解压且只导入 .obj，不支持带 .mtl 的文件。

**邮件链接导出**
- 除 Free/Education 外皆可用；填收件人、subject、可选 message；链接有效期默认 **3 天**；可勾 `Require password for download` 设密码（文档建议不要在同一邮件里发密码）。

**草图/平面**
- 草图按文档默认单位导出；平面仅导出外轮廓实体几何，**无尺寸、无内部几何**。
- 可选 `Set z-height to zero and normals to positive`（z=0 平面上所有法向正 z）；`Export splines as polylines`（否则样条仍为样条）。
- 平面图形区右键 `Export as DXF/DWG`：文件名、DXF/DWG、版本、单位或 `Use workspace units`、下载方式、可选 splines as polylines、z-height/normals。

**图纸导出**
- 字段：File name、Format、Version、Sheets（可 Custom sheets 输入范围/编号）、Overridden dimensions（show/hide underlines）、Text（PDF：Normal/Selectable；DWG/DXF/DWT：Export as text / Explode into polylines (notes) / Explode all into polylines——含注释、表格单元格文字、尺寸）、Color（PDF：color/B&W/grayscale）、Units（DWG/DXF 用图纸单位或指定单位）、Options（Apply export rules to contents；Export splines as polylines 除 PDF；Set z-height… 仅 DWG/DWT/DXF；Hide inspection items；Exclude off-sheet content 仅 DWG/DWT/DXF）。
- 从 Release 导出：右键已发布对象 → Revision history → 在该 release 上点 Export → 选导出选项。

**下载**
- 不能导出处理的文件（主要 non-CAD）通过 tab 右键 Download 原格式取回；同文件名/类型；任意非原生文件可导入/下载；位置由浏览器决定。

### 4.12 Lidar 导入

- 设备：仅在带物理 Lidar 的 iPhone/iPad（2020 年后机型）文档内可用：iPhone 12 Pro/12 Pro Max、iPhone 13 Pro/13 Pro Max、iPad Pro 11”/12.9”。
- 入口：文档内 + → `Import from Scan`。
- 模式：
  - `Environment Scan`：慢速环视采集；数据足够时提示可生成 GLB；Stop → Generate → 导入完成；生成文档内 GLB tab（在 CAD Imports 文件夹）+ 名为 `Scan` 的 Part Studio；Part Studio 含 Import 特征与 mesh Composite part；可继续混合建模。
  - `Object Scan`：把点放物体中心，按反馈靠近/远离 → Continue → 包围盒 → Start Capture；绕物体慢扫，圆环 spokes 逐段填充；每段完成 Continue；提示把物体侧放/翻面，共三次 pass；全部完成 Finish → 进度条；生成 Part Studio `Capture` + CAD Imports 文件夹中的 OBJ；含 Import 特征与 mesh Composite part；可继续混合建模。
- 数据不足会提示；扫描过程中提示继续移动/增加角度。

### 4.13 共享、权限与所有权

**Share 对话框**
- 入口：Documents 页文档右侧 Share 图标；文档内 Document toolbar `Share`。
- 标签页（随订阅）：
  - Individuals：输入一个或多个 email，可粘贴逗号分隔列表；type-ahead；记录新邮箱；已记录邮箱显示头像+邮箱。
  - Teams：仅列出你所属的 Team；选 Team 给全部成员发共享消息。
  - Companies：仅列出你所属公司；给全公司成员发共享消息。
  - Public（非 Enterprise）：`Make public` 让所有 Onshape 用户可查看和复制（不可编辑原文档）；公开后文档左上出现 `Make a copy to edit`；撤销点 `All Onshape users` 右侧 X；**Enterprise 无 Public 标签，企业文档不能公开**。
  - Link sharing：复制文档专属 URL；**只读、仅该文档**、**无需登录**；Part Studio/Assembly/Drawing tab 及 PDF/图片等支持数据可用；Onshape 用户可用现有账户打开，非用户也可查看；`Turn on link sharing` → `Copy to clipboard`；`Allow exporting from the link` 允许导出；从 active tab 创建的链接**指向创建时状态**（workspace/version、tab、properties/configurations/sheet metal 面板状态）；任何人持链接即可访问；点 `Anyone with link` 旁 X 立即撤销全部链接访问。
  - Connections：与受批准的外部 Enterprise 用户共享；只有企业管理员把用户加入 connection 后才可见该标签；徽章：外部企业用户、外部企业连接、内容共享给外部企业；文档/文件夹/出版物在工具栏、Share 对话框、Documents 页 Share details、Comments 面板显示徽章或横幅。
  - Enterprise 用户只看到 Individuals、Teams、Invite guests、Links 标签。
- 发送：填 email/Team/Company 后设权限；可加个人消息；收件人收到带消息和文档链接的邮件；非 Onshape 用户邮件含注册链接；`Share` → `Close`。
- Link document 权限：允许他人在其文档中链接你的 part/assembly/FeatureScript/自定义特征；**必须同时勾选 Export**；Release 1.54 前授予 Edit（至少 Copy/Export）会自动带 Link document，1.54 后必须手动勾选。

**权限矩阵（[文档明确]）**

| 权限档 | 包含能力 |
|---|---|
| **Can edit** | edit、copy、link、export、share、comment |
| **Can view** | view、copy、link、export、comment（以 Light user 方式共享进来） |
| 细项 `Copy` | 复制文档 |
| 细项 `Link document` | 从其他文档链接此文档（插入 assembly/part/image/drawing 等）；需同时有 Export |
| 细项 `Export` | 导出文档 |
| 细项 `Share` | 再共享给他人 |
| 细项 `Comment` | 在文档内评论 |
| 细项 `Delete` | 删除文档或分支上的 workspace；删除 workspace 警告且不可撤销；分支仍有 version 时分支保留，可再从 version 建 workspace |
| **Owner** | 默认拥有全部权限；可 Transfer ownership；Professional/Enterprise 创建者除转移所有权外拥有全部权限 |

- Edit 与 View 都含 Comment；View 用户与 Edit 用户可同处一个 workspace，View 用户不能编辑但实时看到变更。
- 只有 Owner 和 `Can edit & share` 者可共享；文档只有一个 owner（公司所有时 owner 权限归公司 owner）。
- 公司管理员可移除文档创建者 owner 身份，并改为指定权限协作者；默认创建者有全部权限（含 Delete）。
- 公司所有的文档只有创建者或公司 owner 可删除。
- 权限移除：Share 对话框条目右侧铅笔编辑，X 移除；用户也可在 Documents 页 Shared with me 过滤器多选 → 右键 `Unshare selected (x) with me` 移除自己。

**Free 账户共享限制（[文档明确]）**
- Professional 可分享给 Free 用户；Free 用户**只能查看私有文档，即使被授予 Edit 也不能编辑**。
- 分享给 Free 用户不会使文档变 Public。
- Free 用户可被授予并执行 Comment、Export、Copy、Link；不能 Share 或 Edit。
- Free 账户文档默认且只能 Public（见 Documents 页）。

**Onshape 支持**
- Share 对话框左下 `Share with Onshape support` 开关；共享后变蓝；再次点击取消。

**所有权与转移**
- 每个文档/文件夹有唯一 owner：个人、公司或 Enterprise；Professional/Enterprise 成员默认创建公司所有文档/文件夹；Free/Education/Standard 自动个人所有；属于多个付费订阅时创建对话框可选 owner。
- 所有者权限：Delete、改变共享、Make Public（Enterprise 不可）、Make Private、Transfer ownership。
- 入口：Documents 页右键文档/文件夹 → Transfer ownership。
- 对话框：顶部选 Individual / Company / Enterprise → 搜索用户 email（或公司/企业名）→ `Transfer ownership`。
- 可转移路径：个人→个人；个人→公司（用户必须是该公司成员）；公司→个人；公司→公司（仅当公司 owner/admin 同时属于两公司）。
- 不能转给没有活跃 Onshape 账户的用户；所有权隐含 Edit+Share 权限；**不改变既有 Shares/links**；转出者保留 Edit/Share，除非新 owner 改；任何被共享者可自行退出或被新 owner 移除。
- 公司/企业所有文档/文件夹只有公司/企业管理员能转移；跨公司转移后 metadata 由新公司属性控制；**零件属性与 Release management（含 revision history）不随文档转移携带**；先前已发布零件可在新公司重新发布。
- 建议：顾问场景优先共享 Edit，而非转移所有权；需要发布时加入公司订阅或给 Enterprise “Create Releases” Global permission。

### 4.14 协作、评论、Follow、View Only

**Collaboration**
- 实时同编：所有新增/修改实时显示给全部协作者。
- Social cues：tab 与 Feature list 中显示颜色+首字母小方块；同一 tab 多人时底部变为多色块；颜色对应协作者，移动端点 Collaborator 图标（右上，显示人数）查看列表。
- 非协作 tab（图纸、第三方应用等）：有 Edit 权限者可“抢焦点”：在 tab 上右键 `Open tab, close it for other user` 让对方关闭以取得锁；尝试进入他人正持有的非协作 tab 时显示谁在编辑（蓝色按钮或右键同命令可接管）；你离开 tab 后释放。
- view-only 协作者拖动 rollback bar 后，不再实时看到他人对 rollback bar 的改动；刷新浏览器恢复。

**Comments**
- 权限：Owner 自动可评论；直接共享时可授予 Comment；所有允许编辑的权限都含评论；Can view 也允许评论。用户有 Comment 权限后默认订阅邮件通知：新评论；其参与线程的回复。Team 共享进来者**不自动订阅**，需在 Comments 面板勾选。
- 面板入口：Document panel 的 Comments 图标；有新评论时图标蓝点；有新分配任务时图标显示数字（等于分配数）。
- 可标记实体：Feature list 中的 Features、Sketches 与 sketch dimensions、tolerant sketch dimensions、tolerant feature dimensions 与 hole callouts、MBD Inspection table 标注（尺寸/基准/形位公差）、mate connectors（含隐式）、mates、子装配中的实体、Drawing views/dimensions/annotations。
- 面板按钮（表被压平，按 alt 还原）：
  - 工作区过滤：Entire document / This workspace only。
  - 评论过滤：All comments / All open tasks / Open tasks assigned to the current user / Completed tasks。
  - Tag entity：先点图标，再点图形区/Feature list/Parts list/Instances list 中实体。
  - 插入图片附件。
  - 评论通知开关（开启后收到被 @ 的邮件通知）。
  - Markup 工具。
- 添加：
  - 在具体 tab 打开 Comments → `Add comment` → 输入；`@` 提及；点 `Add` 发邮件（含评论+文档链接，链接到文档第一个 tab）；被提及者无权限时提示并引导共享；若其正打开该文档，评论自动弹出；共享后再发邮件并另发一封“已共享”通知。
  - 右键实体 → `Add comment`（Part Studio/Assembly/Drawing）；或点 Tag 图标再选实体；回复中也可 tag。
  - 实体旁出现 comment 图标（仅在 Comments 面板打开时可见；Feature 的图标只在 Feature list 显示）。
  - 隐式 mate connector：hover 激活 → 右键 → Add comment。
  - MBD 标注：tolerant sketch dimension 必须已关联下游 part，且 Inspection table 打开/选中该 part；其他 tolerant 特征/孔标注/基准/形位公差通过特征对话框或 Inspection table 添加，右键 Add comment；也可先 Add 评论再用 Tag 工具点标注。
- URL：保存后自动转 HTML 链接；Onshape 内部链接新标签打开，前置 Onshape logo，显示为可读的 document/version/workspace/tab；外部链接新标签打开并带外链图标与“离开 Onshape”警告。
- 任务：
  - 评论中提及用户后，输入框下方出现 `Assign to` + 复选框（第一个提及者；多提及有下拉换人）；**一次只能分配一人**；勾选后按钮由 `Add` 变 `Assign`。
  - 被分配者收到邮件 + 桌面通知；完成后在评论右上勾选框 resolve。
  - **只有新评论可分配任务**；被分配任务在 Action Items 页可见（含分配者、创建评论的文档 version、日期）。
  - 过滤：All comments/All open tasks/Open tasks assigned to current user/Completed tasks。
- Markup：打开 Comments → Markup；若从 PDF tab 发起，浏览器先询问共享哪部分屏幕（选 PDF tab）；蓝色虚线框内用箭头/线/自由画/圆/方/文字，选颜色/大小；工具选中后光标十字，拖拽绘制或拉文本框；Ctrl+z 撤销；点选后 Delete 或删除按钮；Shift+drag=45°；Ctrl+drag=以起点为中心画椭圆/矩形；Shift+drag=画正圆/正方；Ctrl+Shift+drag=以起点为中心的正圆/方；Text 先画框再点入输入；X 取消，勾保存；保存后作为附件上传到当前评论，Add 后显示缩略图；回复也可 Markup。
- 其他规则：点评论中的链接跳到对应 tab；进入后链接文字改为该实体，再点高亮该 part；评论绑定“文档 + 某个 workspace”，切换 workspace 评论集不同；再次点 Comments 图标或 X 关闭；`x replies` 建回复，`Reply` 保存；hover 评论框显示编辑/删除；评论不记录进 workspace history；装配移到子装配后评论跟随；关闭文档后协作者图标消失但评论保留；与外部企业连接的文档 Comments 面板显示横幅。

**Follow Mode**
- 双击工具栏中的 social cue 图标跟随；workspace 出现外框提示；被跟随者看到跟随者的 cue 外框；浏览器窗口任意处点击停止；可跨浏览器/移动端。
- 可见：被跟随者 active tab 与其操作；光标移动（手形，cue 颜色）；部件视图与 Render modes（含 Section view）；图形区选择；爆炸视图移动/激活；Feature list 选择；Part Studio 对话框及编辑既有特征时的对话框内操作（**不含创建新特征**）；零件/装配移动后的新位置；Sketch 对话框打开时的草图。
- 不可见：Reference manager 对话框、Sketch Text 子对话框、Derived 对话框、Mass properties 与 Measure 对话框、右侧面板与表格（Explode views、BOM、Configuration table、Custom table、Appearance、Hole table）。
- 一个协作者可被多人跟随；一个跟随者同一时间只能跟随一人。

**View Only Mode**
- 文档默认进入 View only（按权限/公司设置）；图形区顶部横幅 `You are in View only mode`，点 `Edit` 取得正常编辑权限，工具栏出现；Document menu → `Switch to view only mode` 返回只读，工具栏消失。
- 编辑权限范围由公司管理员 Global settings 决定。
- 若开启公司设置 “Always open documents in View only mode”，文档创建者对自己文档仍需手动切换到 View only（否则创建者默认不进入只读）。

**View Only toolbar**
- 默认呈现给无写权限/无完全访问者（Light user、View Only 权限、Enterprise 等被只读共享者）；文档有编辑权限者看不到。
- 公司 owner 可在公司设置中隐藏所有文档的 View Only toolbar。
- 位于 Part Studio/Assembly 底部，文档称最多 18 个工具，按 tab 类型/内容/权限启用。正文列出的工具（可能超过 18 个）：
  - 视图：Home、Rotate、Pan、Zoom to fit（下拉含 Zoom to window、Zoom）；鼠标：滚轮缩放；Windows 三键鼠标右键拖=3D Rotate，Ctrl+右键拖/中键拖=2D pan。
  - Section view：选平面/面（平面、圆柱、圆锥）或 mate connector → 勾确认。
  - Inspection table（仅 Part Studio）：MBD 标注（基准、尺寸、形位公差、焊接符号）。
  - Properties（Part Studio 可编辑 name/description/part number/state 等；Assembly 亦然）；**Light/无写权限用户不能改属性**。
  - Appearance（仅 Part Studio）、Display states（仅 Assembly）、Cut list（仅 Part Studio 且使用 Frames）、Configuration（含配置属性时）、Custom tables（仅 Part Studio）、Sheet metal table and flat view、Routing curve table、Comments（仅有评论权限时）、Bill of Materials（Assembly）、Exploded views（仅 Assembly）、Named positions、Simulation（可运行装配仿真）、Follow a user（文档中多用户时出现；再点停止）、Export tab、Export selected（已有可导出几何选择时）、Select and export（无可导出几何选择时，点选后确认）、Print（Print setup → 勾确认 → 打印预览）、Measure（悬停说明；选择实体/零件时自动显示在右下）、Show analysis tools（草图边/面、零件边/面/体、装配干涉）、Mass properties（无选择显示 Part Studio 属性，有选择只显示所选零件）。
- 右键草图/零件可出现 Show Dimensions 等命令；双击 Feature list 特征可看其创建设置。
- 发布管理审批人：Light 工具栏没有审批工具；通过邮件/文档内/移动通知中的 `View release` 链接直接打开 release candidate 对话框。

---

## 5. 工作流、规则与错误状态

### 5.1 端到端主流程（文档 → 设计 → 版本 → 发布 → 共享/导出）

1. **创建文档**：Documents 页 Create > Document（可指定文件夹/标签；公司账户选 owner）→ 自动 Start version + Main workspace + 默认 Part Studio/Assembly。
2. **组织**：用 tab/文件夹（≤10 层）组织；Tab manager 搜索/排序；可把 tab Move to document（建立 link、原文档移除；装配默认带 Part Studio）。tab 顺序对 workspace 全体共享。
3. **设计**：在各 tab 建模；单位默认 inch/degree，可在任意数值字段输入显式单位；自动保存，每次编辑进入历史。
4. **版本**：Document panel Create version（命名/描述；待更新图纸先 Update）→ 可选 `Create version and edit properties`；版本不可变、只读，属性可改。
5. **分支**：Versions and history 右键 version → Branch to create workspace；在分支改；可再建版本。
6. **比较/修复**：Compare 任意历史点（蓝 Base/红 Target、滑块、Reverse、Show/Hide Part、公差黄色）；Repair 在断裂引用时对照健康点，Replace reference 1:1 + propagate。
7. **合并/恢复**：Merge Source→当前 Target（Keep/Merge/Replace，逐 tab 覆盖；Drawings/PCB 不能 Merge）；Restore 同分支历史点（Keep/Replace，逐 tab）；受保护 workspace 只能分支改后合入。
8. **发布**：Properties/Release candidate → 审批（Approver/Observer）→ Released；可 Obsolete；版本图三角形。
9. **出版物**：Create Publication → Insert 已 versioned/revisioned tabs（单个 part 需已 release）→ View as viewer → 共享（恒只读）。
10. **共享/评论/协作**：Share（Individuals/Teams/Companies/Public/Link/Connections）；评论/@/任务/Markup；Follow；View Only。
11. **导入/导出**：导入可落新文档（自动 version）或现有文档新 tab；导出按对象选格式与选项；通知跟踪进度。

### 5.2 关键规则清单

- **版本/历史**：版本不可变；版本图 Main/Start 不可删；version 不可删；删除 workspace 时若无 version 则分支一并删除，否则分支回退到最新 version；Restore/Merge 的结果成为分支新历史。
- **Tab**：tab 顺序 workspace 共享且持久；active tab/滚动不共享；新 tab 在 active 右侧并激活；删除可能冲突时警告；移动到共享文档需 Edit+Link，移出共享文件夹需 Edit+Copy；移动导致文档空 tab 被阻止。
- **文件夹**：权限继承、额外权限叠加；移动需文件夹 Edit + 文档全部 7 项权限；跨根移动转移所有权并重继承；新建文件夹仅创建者（及公司管理员）有权限。
- **共享**：View 也含 Comment；View 用户实时看变更但不能改；Link document 必须同时有 Export；链接分享免登录只读且快照创建时状态；公开可复制不可编辑原文档；Enterprise 不能 Public；Free 用户即使被授予 Edit 也只能查看。
- **所有权**：唯一 owner；公司/企业所有项仅管理员可转移；转移不改变既有共享/链接，原 owner 保留 Edit/Share；跨公司转移不携带 metadata 与 release/revision history。
- **发布**：Approver 需 Edit 权限，Observer 需 View 权限；`Not revision managed` 对象可进 Release 但不跟踪修订；Release 完成但无法应用 part number/revision description 时通知发布者。
- **Where Used**：只返回 version/revision 结果，workspace 无结果；匿名链接用户不可用；支持 view-only/light/guest；无权限项 “Not permitted.”；未捕获文档 “Failed captures.”。
- **评论**：评论绑定 workspace；不进入 history；只有新评论能分配任务且一次一人；Team 共享用户不自动订阅邮件；被 @ 者无权限时提示先共享。
- **Follow**：一人只能跟随一个对象，但可被多人跟随；点击窗口停止。
- **通知**：站内 14 天；升级提示 90 天/20 天节奏；评论/提及/任务/共享不产生站内通知。

### 5.3 常见错误/阻止状态与处理

| 场景 | 文档表现/阻止条件 | 处理 |
|---|---|---|
| Move to document 导致空文档 | 红色消息，操作被阻止 | 取消勾 `Move all referenced tabs` 只移 Assembly，或保留至少一个 tab |
| 删除 tab 可能冲突 | Delete tabs 警告对话框 | 确认 Delete 或 Cancel |
| 创建按钮在只读企业文件夹 | Create 按钮不可用（inactive） | 到有写权限的文件夹创建 |
| List/Structure view 离开顶层过滤器 | 回来回到 Document view（桌面） | 重新选择 List/Structure；移动端离开返回也不保留 List |
| Merge：分支无 delta 且全 Keep | Merge 按钮不可用 | 改某 tab 为 Replace，或无需合并 |
| Merge：受保护分支落后 | Merge 禁用 + “Workspace protections are enabled” | 先把 protected merge 进 working，再把 working merge 回 protected |
| Merge：FeatureScript 版本不一致 | 警告，不能合并 | 点 Update FeatureScript → Update now → Merge |
| Merge：文档被占用 | 列出用户与打开实例数/超时+Retry | 关闭所有文档实例；网络失败点 Retry |
| Merge：更新进行中 | 提示稍后再试 | 等更新完成 |
| Merge 后想撤销 | Undo 不可用；消息提供 revert 链接 | 用 revert 链接；若之后有人改了文档，revert 会丢失那些改动 |
| Restore/Repair/Compare 选到不健康历史点 | Repair 蓝色提示建议换健康点 | 选断引用前最后健康状态 |
| Repair：1 个选择产生多个引用 | 无传播目标，提示无法确定匹配引用 | 无法传播；手工逐处修复 |
| Where Used 从 workspace 发起 | 无结果，提示 workspaces 不支持 | 在 Version selector 选 version/revision |
| Where Used 无权限/未捕获 | “Not permitted.” / “Failed captures.” | 申请权限；展开查看未捕获文档 |
| 导入 zip 命名不合法 | 要求 zip 与顶层装配同名且扁平无特殊字符 | 按 Pack and Go 规则重新打包 |
| 导入零件校验失败 | 仍导入但红名，Feature/Parts list 与通知提示 | 可继续但下游操作可能失败；修几何或替换 |
| 导入 IGES 边翻译问题 | 可勾 IGES postprocessing | 处理时间可能 +50% |
| 导出文件名含非法字符 | 自动换成 `-` | 无需处理，注意导出规则/Date 属性 |
| 导出 OBJ 后重新导入 | 导出为 .obj+.mtl zip，不支持带 .mtl 导入 | 解压后只导入 .obj |
| 分享链接从 tab 创建 | 指向创建时快照状态 | 需要最新状态时重新复制链接 |
| 非协作 tab 被他人占用 | 提示当前编辑者；无法取得焦点 | 右键 `Open tab, close it for other user` 或点蓝色按钮接管；对方离开后恢复 |
| view-only 用户拖 rollback bar 后不同步 | 不再实时看到他人 rollback 改动 | 刷新浏览器 |
| 评论被 @ 者无权限 | 提示并引导共享 | 先共享，再发评论/任务 |
| 转移所有权给无账号用户 | 不允许 | 先让对方注册 Onshape |
| 跨公司转移文档 | 成功但 metadata/release/revision history 不携带 | 需在新公司重新建立属性与发布记录 |

---

## 6. 与其他章节的关系

本组大量引用以下章节（按语料中的链接文字）：

- **文档/数据管理上游**：Linking Documents（跨文档引用）、Product Structure Organization Tips、Performance、Linking Documents、Standard Content、Teams、Managing Onshape Accounts、Startup page preferences、Enterprise Settings / Global permissions / Connections、Company/Classroom/Enterprise Settings（用户、Guest、导出规则）。
- **发布/流程**：Release management、Release candidate、Workflow、Updating References、Publish a custom feature、Configured Properties、Bill of Materials、Revision Table。
- **建模/编辑**：Part Studio、Assembly、Drawing、Feature Studio、Variable Studio、Render Studio、PCB Studio、CAM Studio、Sheet metal table and flat view、Frames/Cut list、Routing curve、Simulation、Analysis tools、Measure、Mass properties、Section view、Display states、Configurations、Custom tables、Named positions、Exploded views、Appearance、Hole table、MBD / Inspection table / Tolerance options、Derived/Import feature、Mixed modeling、View Navigation and Viewing Parts。
- **协作/共享**：Comments、Markup、Follow Mode、Share Documents、View Only Mode、View Only toolbar、Action Items、Notifications、Connections、Guest users、Onshape Support。
- **导入导出**：Processing CAD files、Working with Imported CAD、Exporting a Drawing、Exporting a drawing to a template、Export rules、Property settings、Model Based Definition、Tolerance options。
- **外部课程/技术简报**（仅引用，不在本组）：Document Management、Document History and Versions、Branching and Merging、Gitflow Version Management、Understanding and Working with a Document's Historical Data、Sharing and Collaboration、Sharing with New Onshape Users、Collaboration in Onshape、Importing and Exporting Data、Importing Data、Bulk Import Process、Where Are My Parts?、How to Use Where Used、Creating Folders、Folders FAQ、Optimizing Property Editing and Release Workflow。

**上下游关系概括**：
- 上游：账户/订阅/企业设置决定单位默认、公开文档可用性、View Only 默认、Global permissions（Project、Workspace protections、Create Releases、Make personal copies）；
- 下游：文档管理为 Release management、Publications、Where Used、BOM/Properties 提供版本/修订基础；导入导出为外部 CAD/CAM/PLM 与供应商协作提供边界；共享/评论/Follow 是多人实时协作层。

---

## 7. 对 LubanCAD 的可执行启示

> 标注：`[文档明确]` = Onshape 文档直接写出；`[推断]` = 由文档行为推导到 LubanCAD 的实现建议，需 AIRR/ADR 复核。注意 P0-01/P0-05/P0-06/P0-10：不得引入第二套模型/版本/权限/协作状态机；版本、分支、合并等应投影到 iModel/BIS 与标准事务。

### 7.1 需要补齐的 UI 表面（按优先级）

1. **Document 级三件套** `[文档明确]`：Document panel（Versions and history / Create version / Release drafts / Comments / Document notes / Where used / Performance / AI Advisor / Explore Onshape / Action items / Tab manager）、Document toolbar（文档名+workspace 名、Copy link、Share、Notifications、Help/账户）、Document menu（Rename/Move to/details/Copy workspace/Copy version/Update workspace/Workspace units/Workspace|Version properties/Switch to view only/Print/Close）。`[推断]` LubanCAD 现以 Part Studio 为中心，需把“文档外壳”提升为一级宿主，避免把文档操作塞进 Part Studio 菜单。
2. **Tab 模型与 Tab manager** `[文档明确]`：多 tab、tab 文件夹（≤10 层）、tab 顺序共享持久、active tab 不共享、缩略图、类型过滤、Released 过滤、Move to document、Select as document thumbnail、版本 vs 工作区右键菜单分叉。`[推断]` 与 iModel 的 changeset/元素容器映射需 ADR：tab 是 BIS 元素的投影还是独立容器，须先定契约。
3. **Documents 页三视图** `[文档明确]`：Document（默认）、List（Enterprise/Professional：最新 released/revisioned、过滤器+Vendor/Project/Product line/Title1-3/Material、URL 可分享）、Structure（As built 树、obsolete/新修订图标、Show drawings、Name 不可隐藏、键盘导航）。`[推断]` 先做 Document 视图+过滤器+Details；List/Structure 依赖 release/revision 语义，应与发布能力同批。
4. **右侧面板** `[文档明确]`：Details、Analytics（Document Dashboard）、Share details（Connection 徽章）、Properties（灰置公司属性）、Versions and history（悬停版本描述）、Document notes；`[推断]` Analytics 可后置，但 Details/Share/Properties/Version 面板是共享与版本体验的必需件。
5. **共享/协作 UI** `[文档明确]`：Share 对话框（Individuals/Teams/Companies/Public/Link/Connections；Can edit/Can view + Copy/Link/Export/Share/Comment/Delete）、Comments 面板（tag 实体、@、任务、过滤器、Markup、图片）、Follow（双击 cue）、View Only 工具栏（≤18 工具、按 tab/权限裁剪）、social cues、Transfer ownership 对话框。`[推断]` 权限位必须落在后端单点鉴权，前端只做呈现；Link document 与 Export 的联动要有服务端校验。
6. **版本管理 UI** `[文档明确]`：Version graph（branch 颜色、version 实点、workspace 空点、release 三角形、active branch 蓝框、merge lines/automatic versions 显隐、Active branch/Filter branches/Search history）、Create version 对话框（含待更新图纸提示）、Branch 对话框、Merge/Restore 对话框（Keep/Merge/Replace、逐 tab 覆盖、图标语义）、Repair 面板（Synchronize view、Replace reference、Propagate changes）、Workspace protections 对话框/锁图标/横幅。
7. **导入/导出对话框** `[文档明确]`：导入三策略 + 7 个处理选项；导出格式/版本/Y-up/STEP 预处理/STEP 单位（默认 Meters）/IGES 兼容/分辨率/压缩/STL 文本二进制+单位/下载或存 tab/邮件链接（默认 3 天+密码）/URDF 选项；图纸导出的 sheets/text/color/units/z-height/inspection/off-sheet 字段。`[推断]` 这些字段是大量可测试的 UI 表面，可先做“格式矩阵+选项结构”，逐格式接后端。
8. **通知中心** `[文档明确]`：铃铛未读数、进度型通知更新并重新未读、14 天过期、升级提示（90 天/20 天）、评论/共享不进入站内。`[推断]` 与现有 toast 分离：toast 是一次性反馈，通知中心是可查询、可标记的持久队列。
9. **Publications 管理器** `[文档明确]`：只读发布包、Insert document tabs（仅 version/revision；单件需 release）、View as viewer、Markdown notes、Force publication Export rules、缩略图、共享恒只读。`[推断]` 可视为“发布物 BOM/集合”而非新模型容器；Publication 中的 tab 引用应是不可变版本指针。

### 7.2 参数与默认值清单（可直接写成配置/测试基线）

`[文档明确]`
- 默认单位：inch/degree；workspace 可覆盖；新 workspace 从 version 继承；Drawings 单位独立；Feet and inches 仅 Drawings。
- 小数位：仅浏览器；仅显示；作用于 feature dialogs/sketch dimensions/manipulator dialogs/Measure/Mass properties；Measure 精度不足用科学计数法；不参与计算；不影响导入文件。
- 通知：站内 14 天；升级提示 90 天/最多 20 天一次；Personal copies 10 文档/请求、100 请求/天。
- Trash：非 Enterprise 30 天；Enterprise 90 天。
- Tab 文件夹最大嵌套 10 层。
- Details 面板最小宽度 340px。
- 上传上限 4GB/文件。
- 导入 split：Assembly 层级 >100 唯一零件时额外建文档。
- 导出邮件链接默认 3 天；IGES postprocessing 可能 +50% 时间。
- STEP 导出未勾自定义单位时默认 Meters；STL 单位：Centimeter/Foot/Inch/Meter/Millimeter/Yard；STL Text/Binary。
- 视图：Z-up；Y-up 导入对 .ipt/.catpart 不支持；OBJ 导出单位固定米且为 .obj+.mtl zip。
- 版本命名 V1/V2…；Release 状态 In progress/Pending/Rejected/Released/Obsolete/Discarded；版本图符号（实点 version、空点 workspace、三角 release、锁保护）。
- 权限：Can edit/Can view 均含 Comment；Link document 需 Export；Delete 可删 workspace 且不可撤销。
- Free 用户：私有文档只读，可 Comment/Export/Copy/Link，不可 Share/Edit。
- 历史列表每次先显示 25 条；Compare 蓝=Base、红=Target；公差差异黄色。
- View Only toolbar：文档称最多 18 个工具（按上下文裁剪）。
- 草图/平面导出：仅外轮廓，无尺寸/内部几何；Splines 可转 polyline；z-height/normals 可选。
- 图纸导出格式版本：DWG/DXF Release 11-14/2000/2004/2007/2010/2013/2018；DWT 2013/2018；PDF 文本 Normal/Selectable。

### 7.3 交互与选择规则

`[文档明确]`
- 选择 vs 打开：点行/tile=选中；点名称=打开；Ctrl+click 多选、Shift+click 范围；方向键导航；Esc 清空 Structure 表选择。
- tab：新 tab 在 active 右侧并激活；Ctrl+Space 循环最近 tab 缩略图；Ctrl+click Tab manager 多选；拖放 tab/文件夹排序/嵌套。
- 移动：Move to 对话框 New folder/Sort/Show details/双击进入/Move here；目标文件夹必须 Edit；文档必须具备全部权限。
- 共享：Link document 必须同时 Export；Share 后可发消息；链接分享可 `Allow exporting from the link`；复制链接自 active tab 时固化当前 workspace/version/tab/配置/钣金面板。
- 评论：tag 先点图标再选实体；@ 提及后勾 Assign to；一个任务只能一人；只有新评论可分配；Markup 修饰键（Shift 45°、Ctrl 居中、Shift 正方/圆、Ctrl+Shift 居中正方/圆、Ctrl+z 撤销）。
- Follow：双击 social cue 开始，点窗口任意处停止；一人只跟随一人，可多人跟同一人。
- 版本图：右键对象决定菜单（change/version/branch）；Merge 先选 Target 再右键 Source；Restore 只能同分支；Compare 可选择具体 change（先展开 Changes）；Filter branches 四种。
- Repair：只 1:1 替换；传播默认勾选；Repair 面板必须打开且 active；修复顺序建议从上到下。

### 7.4 事务、撤销、版本、权限、协作约束

`[文档明确]`
- 版本不可变；创建版本不离开 workspace；版本可改 properties；Version 与 Workspace 不可互相替代。
- Merge 不能通过 Undo 撤销，只能 revert 链接；revert 会丢合并后新改动——必须给用户明确确认/预览（符合 P0-10 HITL）。
- Restore/Merge 的结果作为新历史记录，不破坏历史。
- 删除 workspace 不可撤销；有 version 的分支回退到最新 version，无 version 的分支整体消失。
- 评论不进入历史；评论绑定 workspace；版本无编辑权时 Comments 面板不可用（原文如此，与开头矛盾）。
- 受保护 workspace 的直接修改限制清单固定；开启/关闭需权限，Enterprise 由 Global permission 控制；受保护状态跨移动端。
- 转移所有权：接收者需接受（原文另有“立即完成”，需产品口径统一）；跨公司不携带 metadata/release/revision history；既有 share/link 不变；原 owner 保留 Edit/Share。
- 共享权限：View 可实时看变更但不可编辑；View 含 Comment；Delete 权限才可删 workspace；Link document 依赖 Export。

`[推断]`
- 上述“版本/分支/合并/恢复/保护”如果直接建在 iModel changeset 之上，应以 **changeset + 命名标签 + 分支指针** 投影，禁止另存几何副本（P0-06）。合并的 tab 级策略需要能映射到 BIS 元素/关系级冲突检测，否则会出现“UI 展示 Merge changes 但后端整表覆盖”的假成功。
- 评论/任务/Follow/通知是协作状态，不应写入模型 changeset；评论已明确“not recorded in workspace history”，与 P0-06 的“模型事实源”边界一致。
- 导出规则（Export rules）与权限应在服务端执行，前端仅呈现；Link sharing 的“快照链接”需要后端固化 workspace/version/tab/配置上下文。

### 7.5 可写成测试断言的验收点

`[文档明确]`
1. 新建文档自动产生 Start version 与 Main workspace；空文档 Start version 含空 Part Studio 与空 Assembly。
2. 新 tab 出现在当前 active tab 右侧并立即激活；tab 顺序对第二用户可见且持久；active tab 与滚动状态对第二用户不可见。
3. 把最后一个 tab Move to document 会阻止并显示红色消息；取消 `Move all referenced tabs` 后只移 Assembly。
4. 关闭版本时版本为只读；对 version 的几何编辑入口不可用，但 Properties 可编辑。
5. 从 version 创建 branch/workspace 后，版本图 branch 为粗斜体、末端空心点；删除 workspace 后该点为实心（分支无 workspace）。
6. 分支无 version 时删除 workspace 会连分支删除；有 version 时分支回退到最新 version。
7. Merge 对话框默认 `Merge changes`；Drawings/PCB Studios 没有 Merge changes 选项；无 delta 且全 Keep 时 Merge 按钮禁用。
8. Merge 后 Undo 不生效，出现 revert 链接；revert 后再改文档的改动丢失有明确提示。
9. Restore 对话框只提供 Keep/Replace + 逐 tab；恢复后版本图新增一条 change 记录。
10. 受保护 workspace 中：加 tab/画草图/改几何被阻止；创建 version/branch/merge/release metadata 允许；Merge 前必须先吸收 protected 分支。
11. Compare：Base 蓝、Target 红；Reverse compare 交换；公差差异黄色；Feature Studio 新增绿/删除红。
12. Repair：Replace reference 只能 1:1；勾 Propagate changes 后下游失败特征修复；隐式 mate connector/in-context/外部草图引用不可替换。
13. Where Used 从 workspace 发起无结果并提示；选 version/revision 后有结果；匿名链接查看者不可用。
14. 默认单位 inch/degree；在数值字段输入 `10mm` 自动换算；新 workspace 从 version 继承单位；Drawings 的 Feet and inches 不出现在 workspace units。
15. 站内通知 14 天后删除；评论/@/任务分配/共享不产生站内通知；同一上传/翻译更新同一条通知并重新未读。
16. Trash 非 Enterprise 30 天、Enterprise 90 天；Restore 可恢复；Empty trash 永久删除。
17. Share：Can view 用户不能编辑但能评论；Link document 未勾 Export 时不可用；链接分享无需登录且只读；`Allow exporting from the link` 控制导出。
18. Free 用户被授予 Edit 仍不能编辑私有文档；可 Comment/Export/Copy/Link；不能 Share/Edit。
19. 公开文档任何 Onshape 用户可查看+复制，不能编辑原文档；Enterprise 无 Public 标签。
20. Transfer ownership 后既有 Share/Link 不变；原 owner 保留 Edit/Share；跨公司转移后 release/revision history 不携带。
21. 从 active tab 创建链接分享，接收者看到的是创建时的 workspace/version、tab、配置与钣金面板状态。
22. 导入 zip 名与顶层装配不一致时失败；扁平无文件夹；SOLIDWORKS Pack and Go 的三步预处理可复现。
23. 导入 4GB 上限；Assembly 层级 >100 唯一零件时 Split 生成额外文档；Combine 时重复实例产生重复零件且 composite 选项不可用。
24. 导出：`\ / * : | > < ? "` 自动变 `-`；STEP 不勾自定义单位时默认 Meters；STL Text/Binary 与六种单位；URDF 仅 Assembly；suppressed 不进 Assembly 导出；OBJ 导出为 .obj+.mtl zip 且不能直接回导。
25. 草图/平面导出仅外轮廓，无尺寸/内部几何；Splines as polylines 生效；z-height/normals 选项生效。
26. 图纸导出字段：Sheets/Custom sheets、Overridden dimensions、PDF Normal/Selectable、DWG/DXF/DWT 三种文字处理、PDF 颜色、DWG/DXF 单位、hide inspection items、exclude off-sheet content。
27. Follow：双击 cue 开始、点窗口停止；跟随者看不到 Reference manager/Sketch Text/Derived/Mass properties/Measure/右侧表格；一人只能跟随一人。
28. View Only toolbar 只对无写权限者显示；Edit 按钮切换后工具栏消失；公司设置可隐藏工具栏。
29. Comments：只有新评论可分配任务、一次只能一人；被分配者收到邮件+桌面通知；评论不进入历史；装配移动后评论跟随。
30. 通知：评论/@/任务/共享只走邮件/移动偏好；上传/翻译/导出/升级/发布/仿真走站内。

`[推断]`（映射到 LubanCAD 的附加断言）
31. 所有“版本/分支/合并/恢复/发布”操作均产生可撤销或 HITL 的标准事务记录；不可逆操作（删除 workspace、跨公司转移、清空 Trash、合并 revert 后覆盖）必须先预览/确认并审计（P0-10）。
32. 权限判定只有一个服务端入口；Documents 页、文档内 Share、导出、评论、Where Used 均复用同一权限裁决，禁止前端隐藏代替鉴权（P0-07）。
33. 导出格式矩阵与版本范围以能力表驱动 UI（不可用的格式/版本不显示），避免“选项存在但后端不支持”的假成功。
34. 导入失败/部分成功必须产生可重试的通知项，且不生成半成品文档（或明确标记 failed capture），与 Where Used 的 Failed captures 语义一致。
35. 链接分享/公开文档的只读性由服务端强制，不能仅靠 View Only 工具栏隐藏编辑入口。

---

### 附：覆盖自查

- 主题表行数：7 + 11 + 11 + 6 + 8 = **43**，与组文件 `Topics: 43` 一致。
- 43 个 URL 均在 §2 表格出现；正文 §4 对每个主题的能力/选项作了展开。
- 语料限制：图片/图标/表格压平、订阅徽章缺失、视频转录替代画面、5 处文档内部矛盾已在 §1 与相关条目标注；未用外部知识补全。
