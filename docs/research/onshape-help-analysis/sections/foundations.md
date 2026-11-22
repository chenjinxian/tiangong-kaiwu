# Onshape Help 分析报告 — 入门 / 共享建模概念 / 欢迎与支持

> 组文件：`groups/foundations.txt`（40 主题，44,562 词）
> 分析代理：#11/14。仅基于本地语料，未联网、未修改输入与仓库。

## 1. 本章概览

本组共 **40 个主题、44,562 词**，覆盖四个子域：

- **入门与运行环境**（Welcome、Getting Started、Hardware、Graphics Area Display Data、Error Messages、Performance Considerations、Performance Panel、AI Advisor、Explore Onshape、PDM 概览）：讲清 Onshape 的云端架构、浏览器/移动端支持边界、WebGL/GPU 排障、显示数据细分（tessellation）与性能面板的量化阈值。
- **用户界面基础**（UI Basics、Keyboard Shortcuts、Search Tools、Selection、Create Selection、Select Other、Triad、Dialogs、Numeric Fields、Context Menus、Colors、Error Indicators、Printing）：本组最有复用价值的部分，给出了全局交互语法：选择即切换、框选方向语义、快捷菜单、数值字段解析、单位关键字、错误配色等。
- **App Store**（App Store、App Store FAQs）：第三方集成应用的类型、购买/席位/撤权与文档内以 tab 形式出现的行为。
- **共享建模概念**（Shared Modeling Concepts、Modeling In-Context、Configurations 7 篇、Imported CAD、Mixed Modeling、Onshape Labs 及 2 个 Lab 子页）：配置输入/选项/参数模型、可见性条件、输入传播、配置属性排除、In-Context 快照与手动更新规则、导入 CAD/网格的修复与更新语义。
- **支持**（Contact Support）：工单入口、附件限制、文档共享与工单查看。

**抽取限制**：语料由 HTML 自动抽取，所有图片仅剩 `[image: alt]`，视频只有文字转录；快捷键表中的图标单元格、颜色示例图、性能面板图标均无法还原。表格被压平成 `|` 分隔行（Colors、Numeric Fields、Performance Panel 信息表受影响最大，但文字与数值仍可读）。语料**没有**任何“最后更新日期”字段，故本报告不给出文档日期。若干页面（Error Messages、Printing、Input Propagation）极短或几乎纯图，信息以步骤文字为主。Keyboard Shortcuts 页中的 `*` 标记含义在抽取文本中未解释（可能表示“可在草图内直接激活”或平台差异），不臆测。

## 2. 主题清单与逐篇摘要

### 2.1 欢迎、入门与性能（10 主题）

| 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|
| Onshape Help | Welcome to Onshape Help | /Content/Home/home.htm | 帮助系统总入口：按平台组织内容，入口卡片指向 Getting Started、Performance、协作、文档、发布、版本分支；Help 菜单 (?) 内可提交对帮助系统的 Feedback 或 Contact Support。 |
| Getting Started with Onshape | Getting Started with Onshape | /Content/Home/getting_started_with_onshape.htm | 浏览器与 iOS/Android App 的入门：无安装、自动更新；文档由多个 tab 组成而非文件；全程自动保存、无限历史与恢复点；建模从 Part Studio 草图开始；内建 PDM、实时协作、FeatureScript。 |
| Hardware and Graphics Performance Recommendations | Getting Started with Onshape > Hardware and Graphics Recommendations | /Content/Home/hardware_and_graphics_performance_recommendations.htm | 支持浏览器（Chrome/Firefox/Safari/Opera/Edge，不含 IE）与 WebGL 启用方法；GPU 建议（独显、TPS、Optimus/NVIDIA 设置）；float framebuffer；显存不足导致上下文丢失；性能检查需 ≥60 Hz。 |
| Graphics Area Display Data | Getting Started with Onshape > Hardware and Graphics Recommendations | /Content/Home/graphics_area_display_data.htm | 解释图形区细分数据的动态细化：按尺寸/距离排序、选中件强制 Fine、5 级细分（Unloaded/Coarse/Medium/Fine/Extra Fine）、内存不足时降级与包围盒、左下角细化指示。 |
| Error Messages | Getting Started with Onshape > Hardware and Graphics Recommendations | /Content/Home/error_messages.htm | 浏览器 413/431 错误的处理：清理浏览器缓存；给出 Chrome/Edge/Firefox/Opera/Safari 桌面与 iOS 的具体清缓存步骤。 |
| Performance Considerations | Getting Started with Onshape > Performance Considerations | /Content/Home/performance_considerations.htm | 性能实践：用 Regeneration times 面板找慢特征、配置抑制重特征、从版本派生而非跨多个 Part Studio 派生、版本引用/刚性装配、tab 数 <100、少用 mate limits；弱连接指示基于 WebSocket ping 中位数。 |
| Performance Panel | Getting Started with Onshape > Performance Considerations > Performance Panel | /Content/Home/performance_panel.htm | 全 tab 可用的性能面板：Part Studio/Assembly/Feature Studio、图形原语、文档、系统、连接统计；给出信息/警告/错误图标与大量明确阈值（慢特征 >10 s、总重算 >30/60 s、特征 >500、模块 >600/1500、装配求解 >5 s、tab >250/500 等）。 |
| AI Advisor | Getting Started with Onshape > AI Advisor | /Content/Home/ai_advisor.htm | AI 问答面板（除 Government 外全计划）：从帮助、学习中心、博客等取源；答案带引用、References 列表与 1–5 星反馈；会话累积，刷新浏览器重置；企业默认关闭可管理员开启。 |
| Explore Onshape | Getting Started with Onshape > Explore Onshape | /Content/Home/explore_onshape.htm | 教程页（Free/EDU/Pro Trial/Pro Startup/Demo）：`documents/explore-onshape` 文档内教程 tab，含视频、交互练习 Check、Back/Next 与进度；可隐藏入口横幅。 |
| Product Data Management (PDM) in Onshape | Getting Started with Onshape > Product Data Management (PDM) in Onshape | /Content/Home/product_data_management.htm | Onshape 将 CAD 与 PDM 合一的定位：无独立 PDM 模块，功能包括文档管理、版本与历史、发布管理、工作流、Where used、Arena 连接。 |

### 2.2 用户界面基础（13 主题）

| 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|
| User Interface Basics | Getting Started with Onshape > User Interface Basics | /Content/Home/user_interface_basics.htm | 5 条主工具栏（Document/Feature/Sketch/Assembly/Drawing）+ Document panel；最近使用工具上移到组首、重开文档复位；蓝底字段=图形区选择、蓝框字段=键盘输入；Undo/Redo 按用户/按 tab/按会话。 |
| Keyboard Shortcuts and Hotkeys | Getting Started with Onshape > User Interface Basics > Keyboard Shortcuts and Hotkeys | /Content/Home/keyboard_shortcuts_and_hotkeys.htm | 快捷键总表（General/Part Studio/Assembly/3D View/Sketch/Feature Studio/Drawings）；Shift+/ 打开速查；可在 Preferences 自定义、禁用、重置，区分 Onshape 冲突/浏览器冲突/覆盖冲突。 |
| Search Tools | Getting Started with Onshape > User Interface Basics > Search Tools | /Content/Home/search_tools.htm | 工具/自定义特征搜索（Sketch/Part Studio/Assembly，Alt/Opt+C）：左侧结果、右侧描述、已从工具栏移除的项仍可搜到；可勾选 Highlight tool in toolbar，可隐藏按钮。移动端在工具菜单内搜索。 |
| Selection | Getting Started with Onshape > User Interface Basics > Selection >（H1） | /Content/Home/selection.htm | 选择即切换（再点取消），无需功能键；光标显示已选数量（最大 5+）；Space/空白/右键清空；Shift 点选范围；左→右框选“完全在内”，右→左框选“接触即选”，Ctrl+拖选取消；移动端双击清空、双指框选、精确选择器/触控笔压感缩放。 |
| Create Selection | Getting Started with Onshape > User Interface Basics > Selection > Create Selection | /Content/Home/create_selection.htm | 成组选择相关面/边：面准则 Protrusion/Pocket/Hole/Fillets/Tangent connected/Bounded faces + Select patterns；边准则 Tangent connected/Loop/chain connected/Equal length/radius/Parallel/Select pattern；Add selection 把结果送入后续特征对话框。 |
| Select Other | Getting Started with Onshape > User Interface Basics > Selection > Select Other | /Content/Home/select_other.htm | 被遮挡实体选择：反引号键（各国键盘位置不同）从已高亮项向零件内部填充列表，` 下移、Shift+` 上移、Enter 确认；选择结果自动填入随后打开的特征对话框。 |
| Triad Manipulator | Getting Started with Onshape > User Interface Basics > Triad Manipulator | /Content/Home/triad_manipulator.htm | 装配实例的三轴操纵器：自由拖拽 vs 激活 triad；固定实例不能拖动；triad 原点可单独移动并吸附到 Mate connector；拖动出现数值字段；右键可 Move to origin、Align/Anti-align with Z、Rotate 90/180°。 |
| Dialogs | Getting Started with Onshape > User Interface Basics > Dialogs | /Content/Home/dialogs.htm | 对话框输入语义：蓝底=图形区选择、蓝框=键盘输入；接受/拒绝后本次操作移出 Undo/Redo 列表；Enter 接受、Shift+Enter 接受并重开；Preview 滑块 0–100%、Final 按钮；移动端数字键盘与列表重排规则。 |
| Numeric Fields | Getting Started with Onshape > User Interface Basics > Numeric Fields | /Content/Home/numeric_fields.htm | 数值字段接受整数/小数（可用逗号小数点）、表达式、三角函数；滚轮 0.1、Ctrl+滚轮 0.01、Shift+滚轮 1.0；单位关键字、数学/三角/常量、量纲只能一次方；数组索引、三元运算、`&&`/`||`；非法输入清单。 |
| Context Menus | Getting Started with Onshape > User Interface Basics > Context Menus | /Content/Home/context_menus.htm | 右键（移动端双指点按、iOS Apple Pencil 双击）调用上下文菜单；图形区空处含 Show all/Show all parts/Create selection/Zoom to fit/Isometric；草图行菜单示例（Rename/Edit/Copy sketch/Show dimensions/Suppress/Export as DXF/DWG 等）。 |
| Colors | Getting Started with Onshape > User Interface Basics > Colors | /Content/Home/colors.htm | 颜色体系：色板/混色器/#hex/RGB/透明度/自定义色/细分质量；零件默认 8 色循环；逐 tab 列出状态色及 hex（草图蓝=未定义、黑=全定义、红=过定义、选中 #ffc107、错误 #bd3039、配合轴红绿蓝、信息/警告/错误/成功提示等）。 |
| Error Indicators | Getting Started with Onshape > User Interface Basics > Error Indicators | /Content/Home/error_indicators.htm | 错误指示：特征列表/对话框标题橙色文字（悬停摘要）、单字段红框、选择列表与几何同时变红、驱动尺寸黑/从动尺寸浅灰、约束正常灰方块黑图标/错误红方块白图标、顶部通知气泡、悬空实体深红；可忽略/恢复 faulty part warning。 |
| Printing | Getting Started with Onshape > User Interface Basics > Printing | /Content/Home/printing_part_studios_and_assemblies.htm | Document 菜单 > Print：页面虚线预览、可拖动模型定位、选纸张与横竖版，再进入系统打印；也可 Download image 下载图片。 |

### 2.3 App Store（2 主题）

| 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|
| App Store | Getting Started with Onshape > App Store | /Content/Home/app_store.htm | 第三方应用商店：Document toolbar 的 Go to App Store 或 `cad.onshape.com/appstore`；搜索/分类/排序（Featured、Date、App type：Integrated cloud app、Connected desktop app、Connected cloud application）；应用详情含截图、评分、价格、EULA；管理入口 My Account/Company Settings 的 Applications。 |
| App Store FAQs | Getting Started with Onshape > App Store > App Store FAQs | /Content/Home/app_store_faqs.htm | 购买/席位/撤权/重激活；企业可购多席位但 Light 用户不可用，一次性购买按用户；集成应用以 tab 出现并需授权；Free 计划可用；移动端不可见；取消在当前计费周期末生效；My account > Applications 可 Revoke。 |

### 2.4 共享建模概念（14 主题）

| 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|
| Shared Modeling Concepts | Shared Modeling Concepts | /Content/Home/shared_modeling_concepts.htm | 跨产品共享概念索引：Modeling in Context、Configurations、Working with imported CAD、Mixed Modeling、Onshape Labs。 |
| Modeling In-Context | Shared Modeling Concepts > Modeling in Context | /Content/Assembly/modeling_in_context.htm | 装配内右键 Edit in context 打开所属 Part Studio；以主实例为锚、其余件半透明；引用其他件即生成 Assembly context 快照；更新永不自动；Contexts 面板管理多个上下文/命名位置/主实例；版本/不可变引用不能编辑。 |
| Configurations | Shared Modeling Concepts > Configurations | /Content/PartStudio/configurations.htm | 配置总览：每个 Part Studio/Assembly/Variable Studio 一个 Configurations 面板，可含多个输入表；术语=Inputs/Options/Configured features/Parameters/Option values；可配置深度、抑制、FeatureScript、零件号、颜色、材料；协作时每人看到自己的配置，Follow Mode 跟随 leader。 |
| Part Studio and Assembly Configurations | Shared Modeling Concepts > Configurations > Part Studio and Assembly Configurations | /Content/PartStudio/part_studio_and_assembly_configurations.htm | 列表/复选框/配置变量三类输入；配置参数以虚线黄框标记；装配只能配置 mates（不含 mate connectors）、instances、patterns；插入时选配置、Set to last viewed/Reset to default；实例可 Change configuration；阵列/镜像共享种子配置。 |
| Variable Studio Configurations | Shared Modeling Concepts > Configurations > Variable Studio Configurations | /Content/VariableStudio/variable_studio_configurations.htm | 在 Variable Studio 内建列表/复选框/配置变量输入；须先取消 Insert into all Part Studios and Assemblies；右键值/描述 Configure；已配置 Variable Studio 不能发布；可被上层 Part Studio/Assembly 配置作为一列引用。 |
| Configured Properties | Shared Modeling Concepts > Configurations > Configured Properties | /Content/PartStudio/configured_properties.htm | 为每个配置选项配置属性（零件/外观/装配/自定义）；可 Generate next part number；Exclude from properties 让某输入不影响属性（用默认值、BOM 视为同一零件、发布覆盖所有值）。 |
| Managing Configurations | Shared Modeling Concepts > Configurations > Managing Configurations | /Content/PartStudio/managing_configurations.htm | 重命名、过滤（:name 默认、引号精确、可组合、可按输入类型过滤）、复制/粘贴输入与整表（与电子表格互转）；输入级菜单含 Copy table/Copy input/Move/Rename/Edit FeatureScript IDs/Exclude/Visibility/Input propagation/Delete；行菜单 Set as default/Duplicate；容差选项、动态抑制表达式、复选框转表达式。 |
| Visibility Conditions | Shared Modeling Concepts > Configurations > Visibility Conditions | /Content/PartStudio/visibility_conditions.htm | 用输入条件（is/is between）与 List 选项规则控制输入/选项可见性；条件为 AND；只能由上方输入控制下方输入；被隐藏输入取默认值；空可见选项的输入隐藏并取默认；删除来源后自动修复并提示；规则不能隐藏默认项。 |
| Input Propagation | Shared Modeling Concepts > Configurations > Input propagation | /Content/PartStudio/input_propagation.htm | Input propagation 对话框查看当前 tab 内哪些引用共享配置参数并批量配置；仅当存在足够输入/引用时可用；勾选后 Confirm，传播标记显示在 Configurations 面板引用旁。 |
| Working with Imported CAD | Shared Modeling Concepts > Working with Imported CAD | /Content/Document/working_with_imported_cad.htm | 导入后的工作流：网格（Parasolid Mesh/STL/OBJ/GLTF/3MF）只读但可用于点建面/测量/投影/连接器/Up to vertex；Highlight boundary edges 找破面；Enclose/Fill/Move boundary/Bridging curve/Composite curve 修复；Import 特征可改外观、Y-up、允许故障件、创建 composite；Update 只更新 Part Studio。 |
| Mixed Modeling | Shared Modeling Concepts > Mixed Modeling | /Content/PartStudio/mixed_modeling.htm | 网格 + B-rep 混合建模：导入 Parasolid mesh（v28–v34）或 mixed model（v32+）及 STL/OBJ/GLTF/3MF；部分特征/装配工具可用；装配插入按 Parts/Surfaces 过滤；仅 STL/Parasolid 可导出混合模型，其他格式按规则排除网格。 |
| Onshape Labs | Shared Modeling Concepts > Onshape Labs | /Content/Home/onshape_labs.htm | 实验特性计划（除 Government）：Company Admin 在 Company settings > Preferences 授权；Enterprise Admin 在 Global permissions 授权；用户再在 My account > Preferences 勾选启用；启用后列出的 Lab 能力可开关。 |
| FeatureScript Co-Complete | Shared Modeling Concepts > Onshape Labs > FeatureScript Co-Complete | /Content/Home/featurescript_co_complete.htm | Feature Studio AI 代码补全：需先启用 Labs；Co-complete 开关；Enter 接受建议、继续输入或 Esc 拒绝；账户偏好决定新会话默认开关。 |
| Descriptive Image Search | Shared Modeling Concepts > Onshape Labs > Descriptive Image Search | /Content/Home/descriptive_image_search.htm | Public 文档搜索可按 AI 生成缩略图描述检索；Search in Public 下拉勾选 Descriptive image search；默认值由账户偏好决定；移动端在高级搜索过滤器中开启。 |

### 2.5 支持（1 主题）

| 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|
| Contact Support / Contact Us | Contact Support / Contact Us | /Content/Home/contact_support.htm | Help 菜单 > Contact Support（Professional/Enterprise）或 Report a bug（其他）；填写标题/详述、可共享文档给支持、最多 5 个 20 MB 附件、屏幕捕获标注；可查看工单；给出 PTC 总部地址。 |

（自查：表格 10 + 13 + 2 + 14 + 1 = 40 行；40 个 URL 均出现。）

## 3. 核心概念与术语

**平台与数据模型**

- **Document / Tab**：Onshape 不使用文件；Document 是项目级容器，Tab 可为 Part Studio、Assembly、Drawing、Feature Studio、Variable Studio、Render Studio、PDF/图片/视频等 blob，也可承载第三方应用。
- **Automatic save / infinite history / restore points**：每一动作自动保存，可在历史中比较与恢复；无“保存”按钮。
- **Simultaneous Editing / collaborators**：多人可同时编辑同一文档甚至同一零件；他人特征实时显示；配合 Share/Follow/Comment。
- **PDM**：文档管理、版本与历史、发布管理、工作流、Where used、Arena 连接。
- **In-context / Assembly context (snapshot)**：在装配上下文中编辑零件时，引用其他实例会创建“装配快照”（几何+位置）；一个 Part Studio 可有多个 context（不同铰接位置）。
- **Primary instance（主实例）**：Edit in context 的锚定件；实心箭头标记，旧主实例改为虚线箭头；主实例不显示为 ghost。
- **Configured 相关术语**：Inputs（可折叠输入表）、Options（表的行）、Configured features（被配置的特征/变量，不可改名）、Parameters（列）、Option values（单元格值）；configuration = 各输入选项的一个排列。
- **Configuration inputs 三类**：List、Checkbox、Configuration variable（类型 Length / Angle / Integer / Real / Text）。
- **Configured properties / Excluded from properties**：可为每个选项配置零件号、外观、装配等元数据；“从属性排除”的输入不参与属性表，按默认值对待。
- **Visibility conditions / Option rules / Input propagation**：配置逻辑（AND 条件、is/is between）、仅 List 可设选项规则、跨引用共享参数的批量配置。
- **Mesh / Mixed model / Composite part**：网格只有面片不可编辑；mixed model 同时含 mesh 与 B-rep；composite part 把多个体合并为单一“零件”（closed 消耗实体，open 不消耗）。
- **Tessellation levels**：Unloaded (Bounding Box)、Coarse、Medium、Fine、Extra Fine；默认生成 Coarse/Medium/Fine，Extra Fine 仅高端视图模式。
- **TPS（triangles per second）**：兼容性检查中的渲染吞吐指标。
- **Poor connection indicator / RTT / Region / Expected region**：弱网指示、往返时延、实际连接区域与最近区域。
- **App 类型**：Integrated cloud app（文档内 tab）、Connected desktop app、Connected cloud application。
- **Labs**：实验功能；由 Company/Enterprise 管理员授权，再由用户启用。

**状态/角色与权限**

- 文档共享 View-only / Copy 权限或 Light 用户：对话框可打开查看但字段不可编辑 [Dialogs]。
- AI Advisor 默认：Company/Classroom 用户启用；Enterprise 默认禁用；仅对“你或你公司拥有”的文档可见。
- Onshape Labs：只有 Company Administrator / Enterprise Administrator 能授权用户或团队。
- App Store：企业可购多席位，Light 用户不能用应用订阅许可；一次性购买按用户。
- Contact Support：Professional/Enterprise 显示 Contact Support，其他计划显示 Report a bug。

**命名法/缩写**

- RMB = right mouse button；LMB = left mouse button；TPS；VAO（Vertex Array Objects）；RTT；PDM；EDU；EULA；BOM；DWG/DXF；GLTF/3MF/STL/OBJ；x_t/x_b（Parasolid）。

## 4. 功能与 UI 明细

### 4.1 全局界面与工具栏（UI Basics）

- **5 条主工具栏**：Document toolbar（顶部，含 Help 问号菜单：在线帮助、视频、教程、FeatureScript 文档、快捷键、论坛、What's New、反馈）、Feature toolbar、Sketch toolbar（Feature 上选 Sketch 后出现）、Assembly toolbar、Drawing toolbar；另有左侧纵向 **Document panel**。
- **工具组**：竖分隔线表示组；带下拉箭头的工具有更多同类工具。
- **最近使用上浮**：最后使用的特征/工具移到该组顶部（例：从 Thicken 下拉选 Enclose 后 Enclose 排到 Thicken 之上）；关闭再打开文档恢复默认顺序。
- **响应式折叠**：分辨率越低、浏览器缩放越大，工具越折叠进下拉组。
- **查找工具**：工具栏找不到时用 Search tools（Document/Drawings 工具栏不可用）。
- **默认几何**：Origin、Top/Front/Right 三个基准面；Feature list 悬停可切换显示；选中平面出现拖拽手柄可改尺寸。
- **Undo/Redo**：撤销最后一个成功动作/重做最后一个被撤销动作；**按用户、按 tab、按会话**。
- **输入语义（全局）**：字段**蓝底高亮**=需在图形区/特征树选择；字段**蓝框**=键盘输入（通常数值）。
- **主题**：Light/Dark（Theming）；App Store 内暗色开关是会话级，登出复位；持久暗色需 My account > Preferences > Theming。

### 4.2 键盘快捷键与自定义（Keyboard Shortcuts）

打开方式：Help 图标 > Keyboard shortcuts，或 **Shift+/**。可按 tab 类型过滤，或在 Search shortcuts 中搜索。

**General**

| 快捷键 | 动作 |
|---|---|
| Shift+Enter | 提交命令并再开一个同命令空对话框 |
| Enter | 提交当前命令 |
| Escape | 退出当前命令（Render Studio 也支持） |
| Space | 取消选择已选特征（Render Studio 也支持） |
| Ctrl/⌘+C / Ctrl/⌘+V | 复制所选特征 / 粘贴（可连续多次） |
| Delete/Backspace | 删除所选特征（Render Studio 也支持） |
| Ctrl/⌘+Z；Ctrl+Y 或 Shift+⌘+Z | 撤销；重做（会话内，可连续） |
| Shift+C / Shift+D | 曲线与曲面分析对话框 / 二面角分析 |
| Ctrl/⌘+Shift+F | FeatureScript 搜索（当前 Feature Studio 内找文本） |
| Ctrl+U | 反馈/报告 bug |
| A | 翻转主轴；编辑时翻转 z 轴 |
| K | 显示/隐藏 Mate connectors |
| Shift+/ | 开/关快捷键速查 |
| 按住 Shift | 锁定配合推断（mate inference） |
| Ctrl+M | Mate connector 对话框 |
| `[` | Measure 对话框 |
| Ctrl/⌘+click；Shift+click | 在新浏览器 tab / 新窗口打开所选文档 |
| Ctrl+Space | 在最近打开的 tab 间切换（会话内） |
| Shift+N | 为所选实例/特征重命名 |
| Q | 选择/退出 Construction 工具（需已选草图平面；可对预选实体或绘制中实体激活） |
| Alt/⌥+C | 打开右上 Search tools 并聚焦搜索框 |
| `` ` ``（反引号） | 打开光标处可选的实体列表（Select Other） |
| S | 在鼠标位置打开快捷工具栏 |
| Alt/⌥+T | Tab Manager（Render Studio 也支持） |

**Part Studio**：Shift+E Extrude（草图打开时；否则可选面/草图）、Shift+F Fillet 的 Edge 对话框、Shift+H 显示/隐藏草图、选中 rollback bar + ↑↓ 移动回滚条、Shift+W Revolve、Shift+S Sketch（提示选平面）。

**Assembly**：J 显示/隐藏配合；I Insert parts and assemblies；M Fasten mate；H 切换 Show mates 模式；Shift+S 切换 Snap 模式。

**3D View**：Shift+1/2/3/4/5/6/7 = 前/后/左/右/上/下/等轴测；P 显示/隐藏平面；Shift+P 隐藏所有构造几何；Y 隐藏所选/悬停实例；Shift+Y 显示隐藏实例；Shift+I 隔离（其余透明）；Shift+T 透明；Shift+V Named views；方向键粗转 15°、Ctrl+方向键转 5°、Shift+方向键转 90°、Ctrl+Shift+方向键平移；Shift+X Section view（可多平面）；Alt/⌥+click 穿透透明选择；Shift+R 高质量视图；N 垂直于所选/悬停平面或面（再按反向法向）；Shift+Z 放大当前视图中心；Z 缩小；F 缩放到完全可见；W 拖框缩放。

**Sketch 工具键**：a 三点圆弧；c 圆心圆；r 中心矩形；i 重合；Shift+O 同心；g 角点矩形；Shift+U 曲率；d 尺寸；e 相等；x 延伸；Shift+J 固定；h 水平；l 直线；Shift+A 在直线/相切弧工具间切换；Shift+M 中点；Shift+K 法向；o 偏移；b 平行；Shift+L 垂直；Shift+G 穿透（Pierce）；Shift+S 草图点；Shift+F 草图圆角；按住 Shift 抑制自动推断；Shift+Q 对称；t 相切；q 构造；m 修剪；u Use（投影/转换）；v 竖直。多数工具均要求先选草图平面。

**Feature Studio**：Ctrl/⌘+] 后退导航；Ctrl/⌘+[ 前进；Ctrl/⌘+S 提交当前 Feature Studio；Ctrl/⌘+Shift+S 提交所有未提交 Feature Studio；Esc 关闭自动补全；Ctrl/⌘+Shift+O 顶层符号（大纲）。

**Drawings**：Shift+D 直径尺寸；Shift+H Foreshorten 尺寸；Ctrl+S 显示/隐藏 Sheets；Home/End 首/末图纸；Page Up/Down 上/下图纸；Ctrl+M 最大/最小尺寸；N Note；P Projected view；Shift+Q 激活圆弧/圆的中点与象限点；Shift+R 半径尺寸；Ctrl+Q 更新所有图纸视图与属性；Alt/⌥+LMB 拖动复制标注。

**自定义规则**：My account > Preferences > Keyboard shortcuts；悬停后铅笔编辑；可单键或组合键；三类冲突提示——Onshape 控制冲突（报错）、浏览器/系统冲突（信息提示）、覆盖其他快捷键冲突（警告，可多个）；✓ 或 Enter 接受；可 Disable shortcut；可 Reset to default 或 Reset all；桌面自定义会同步到 iOS/Android；iOS 上若新系统快捷键与自定义冲突，使用时提示并需在浏览器里改/禁用。

### 4.3 搜索工具（Search Tools）

- 可用：Sketch、Part Studio、Assembly（不在 Document/Drawings 工具栏）。快捷键 **Alt/Opt+C**。
- 工具栏右侧 Search tools 按钮打开对话框；输入即出建议/结果（含 Onshape 审核的高质量自定义特征）；悬停右侧显示描述；点击即用。
- 已从工具栏移除的工具仍列在 **Removed from toolbar**，可点用。
- 右下 **Highlight tool in toolbar**：悬停项在工具栏高亮（帮助定位图标）。
- 清除搜索 x；关闭用按钮或 Esc；选择工具栏工具也会关闭。
- 工具栏右键可 Hide/Show “Search tools”。
- 移动端：工具菜单右上 Search，输入过滤，点图标选中，Cancel 关闭搜索条。

### 4.4 选择系统（Selection / Create Selection / Select Other）

**基础选择（桌面）**

- 点击选中，再点取消；点击新实体追加；效果等同 Ctrl+click。
- 光标显示已选数量，**最多显示 5，超过为 5+**。
- 清空：点空白、按 Space、右键 Clear selection；Ctrl+拖框经过实体可取消选择。
- Shift+click 选范围（如特征列表名称）。
- 工具选择同样“点击激活、再点或 Esc 或右键 Exit <tool> 取消”。
- 框选：**左→右**=完全在框内（实线蓝框、蓝填充）；**右→左**=接触即选（虚线黄框、黄填充）；Part Studio 与 Assembly 均可用。
- 中点在非编辑状态下可悬停显示：可用于测量（Measure 右下角）、三点建面、在草图中 Use 其他草图的中点；非活动草图的中点也可这样引用。
- 移动端：点选/再点取消/双击清空；双指长按调出框选，松手前捏合调框大小，松手后拖角/整体移动；底部四图标 Cancel / Inside box / Crossed by box / Confirm；精确选择器（长按拖动十字准星，对准高亮后松手）；触控笔重按临时放大。

**Create Selection**

- 入口：特征对话框的 Create selection 图标，或右键 Create selection；也有无需对话框的快捷组：右键 **Select > Parallel edges**、**Select > Loop/chain connected edges** 等；选择结果会预填下一个打开的工具栏对话框（如 Fillet）。
- 面准则（选择一或多个种子面后传播）：**Protrusion**（凸边相连的所有面）、**Pocket**（凹边相连）、**Hole**（同一圆孔的所有面）、**Fillets**（同一常半径圆角的所有面）、**Tangent connected**（相切边相连）、**Bounded faces**（种子面 + 边界边/面，形成闭合边界；无法闭合则选中所有相邻面/边）；**Select patterns** 选同准则的其余面。
- 边准则：**Tangent connected**、**Loop/chain connected**（选面→该面上成环的所有边；再选边→沿该面成环的边；可选多个环）、**Equal length/radius**、**Parallel**、**Select pattern**（选中一个图案化边后自动选其余）。
- 图形语义：橙色=手动选择，黄色=自动追加。
- **Add selection** 把当前集合送入特征对话框（如 Move face、Fillet、Delete face），对话框清空可继续建下一组；iOS 用左上角 chevron 返回原对话框。

**Select Other**

- 用途：选择被遮挡的草图曲线/面/边。
- 快捷键：反引号键；美式键盘 `` ` ``，英式键盘 `'`（@ 键），法语 `@`，德语 `^`，西班牙语 `º`，意大利语 Mac `Alt+\`、Windows `ò`。
- 选中或悬停后按 `（或右键 Select other）；列表从当前高亮项向零件内部由近到远排列；` 向下循环、Shift+` 向上、Enter 确认；选中后关闭，并自动填入随后打开的特征对话框；也可先开特征对话框再开 Select other。

### 4.5 三轴操纵器（Triad）

- 装配中定位实例两种方式：**自由拖拽**（直接拖零件）与**操纵器拖拽**（先点选零件激活 triad）。
- 固定（fixed）实例：不能拖动，不出现操纵器，拖动只出现不可移动视觉反馈。
- **triad 原点圆点**可单独移动操纵器而不动零件；可吸附到推断出的或已定义的 Mate connector，再相对该点拖动零件。
- 拖动（沿平面或角度）时出现数值字段，可输入精确值。
- 右键菜单（选中操纵器中心）：**Move to origin**（只移动零件使参考点至原点，不配合不固定）。
- 选中轴箭头右键：**Align with Z**、**Anti-align with Z**。
- 选中角度指示右键：**Rotate 90 degrees**、**Rotate 180 degrees**（绕所选轴）。
- 未配合且未固定实例完全按指定移动；已配合实例在自由度内运动；系统可能找不到本已存在的解，此时换操纵器部位/重定位可能更好。
- 移动端：触摸拖动 triad 底座圆移动操纵器；拖箭头沿轴、拖方块沿平面、拖圆弧图标绕轴旋转；操纵器与实例关联直至取消选择（再点实例或双击清空）。

### 4.6 对话框（Dialogs）

桌面：

- 两种输入：**蓝底**（图形区/特征树选择填充）、**蓝框**（键盘输入）。
- 选择状态可视化：健康输入；打开对话框前已被抑制；打开后被抑制（从对话框消失）。
- **接受或拒绝后，对话框打开期间的动作从 Undo/Redo 列表移除**（即整个特征为一次撤销单元）。
- 点击字段聚焦；悬停标题出现编辑图标可改特征名（也可特征树右键 Rename）。
- **Enter** 接受并关闭；**Shift+Enter** 接受、关闭并重开空对话框。
- 可拖动/缩放对话框；选择列表自动变长，手动缩短可关闭自动扩展（再拉长恢复）。
- **Preview 滑块**：0%（应用前）到 100%（应用后）的特征显示不透明度。
- **Final 按钮**：编辑特征时默认回滚到该特征创建时状态、隐藏后续特征；Final 显示叠加当前编辑的最终状态；若编辑的是最后一个特征则无 Final。
- 移动端：✓ 接受保存关闭、x 拒绝；点标题栏折叠/展开，拖顶部调高度；蓝底字段附灰字说明所需选择类型，选后显示数量与箭头，点箭头看列表，左滑删除，Edit 批量删；可将列表项重排（当前支持 Transform、3D Fit Spline、Boolean、Mates（不含 Tangent））；开关关灰开蓝；数字键盘可改单位、删除尺寸、绿色 ✓ 接受、红色 x 取消；键盘按钮可输入表达式，无法求解时红框且 ✓ 禁用。

### 4.7 数值字段（Numeric Fields）

**滚动步进**

| 操作 | 普通数值字段 | 限制在 0–1 的字段（如 isoparametric curves） |
|---|---|---|
| 滚轮 | 0.1 | 1.0 |
| Ctrl+滚轮 | 0.01 | 0.01 |
| Shift+滚轮 | 1.0 | 无效果 |

**接受内容**

- 整数、小数（**逗号可作小数点**）、参数表达式、三角函数。
- 默认单位决定未写单位时的解释；输入任意单位会被换算并以默认单位显示；再次点击字段时显示原始单位。
- 单位关键字：长度 `mm, millimeter, cm, centimeter, m, meter, in, inch, ft, foot, yd, yard`；角度 `deg, degree, rad, radian`；允许复数（feet、radians 等）。
- 数学：`+ - * / ^ ceil floor round exp sqrt abs max min log log10`；取模 `%`（`5%2` → 1）。
- 三角：`cos sin tan acos asin atan atan2 cosh sinh tanh asinh acosh atanh`；**以度为单位**（`sin(30)=0.5`）；反三角返回角度，若需无单位须除以 `deg`（`atan(1)/deg`）。
- 常量：`pi, PI, Pi`（如 `(3*pi) in`）。
- 表达式按 **FeatureScript** 求值，可用于 Part Studio 与 Assembly；结果须无单位或“单位的一次方”。
- 字段接受后显示求值结果；再次激活显示原表达式。
- 不可混类：`3mm+2.5in` 合法，`3mm+2deg` 非法；`3+2.5in` 非法；`3+2` 合法。
- `sqrt(16)m` 合法，`sqrt(16m)` 非法；括号必要：`(2*3)*(1/3)` 合法，`(2*3)(1/3)` 非法。
- 高级：数组 `[3,5,6,7][2]`=6（0 基）；逗号做小数点时数组元素间须空格；三元 `#width>5?7:4`；逻辑 `&&`、`||`，如 `(#width > 3in && #width < 5in) ? 3 : 2`；`#alwaysReinforce` 可为配置复选框。
- 非法：`3in*3in`、`3+3in`、`3[unit]*3[unit]`（得平方）、`sin(30)/deg`（得 1/deg）、任何 1/unit、带独立单位的 unit/unit 组合。
- 部分参数无单位（Rho、阵列实例数）；分数支持；Variable Studios 提供全局变量。

### 4.8 上下文菜单（Context Menus）

- 桌面右键；移动端双指点按；iOS 另可用 Apple Pencil 双击。
- 触发场景：特征/草图编辑中、图形区选中实体、特征树/零件表选中。
- 图形区空白：Show all、Show all parts、Create selection、Zoom to fit、Isometric。
- 草图选中示例：Rename、Edit、Copy sketch（跨 Part Studio 复制；目标 Part Studio 选平面后 Paste sketch；**跨不同版本复制可能报错**）、Show dimensions、Add selection to folder、Show/Hide、Create Drawing of Sketch、Export as DXF/DWG、Suppress、Add comment、Zoom to selection、View normal to、Clear selection、Roll to here、Delete。
- 菜单分垂直分区，按选择内容动态显示相关区段。

### 4.9 颜色与错误状态（Colors / Error Indicators）

**通用 UI 色**

| 颜色 (hex) | 用途 |
|---|---|
| #dbf1fa 浅灰蓝 | 可添加一项或多项的列表字段背景 |
| #f8eaeb 浅灰红 | 有错误的列表字段背景 |
| #789ad1 / #d0dcef | 框选左→右 边框/填充 |
| #ffdc74 / #fff3cf | 框选右→左 边框/填充 |
| #b2ddf6 / #def1fb / #094174 | 信息提示 边框/填充/文字 |
| #fcda7f / #fff8e6 / #333333 | 警告提示 |
| #dd979b / #f9ebec / #333333 | 错误提示 |
| #a2db7d / #ddf6cc / #333333 | 成功提示 |
| #ffc107 | 编辑配置/命名视图/爆炸视图通知 |

**草图**：纯蓝 **#0000ff**=活动草图未全定义（可拖动/改尺寸）；黑 **#000000**=全定义且为尺寸/箭头/线颜色；中红 **#bd3039**=过定义/草图错误/不可解；深灰蓝 **#949ba0**=非活动草图线；浅灰蓝 **#E3E6E9**=闭合草图填充；#f3bf8e=边悬停；#ffc107=边/实体选中；#d9bfa0=尺寸悬停；#d9a566=尺寸选中；#90cef1=草图平面线与文字。

**Part Studio**：**#ffc107**=选中零件/面/边/顶点；**#bd3039**=对话框或零件表错误文字、图形区错误几何、干涉检测；#d403f9=显示等参线/直纹线（Ruled surface、Boundary surface）；#ff005a / #0000ff=曲面分析 U / V 曲线梳与边界；#70a65c / #b275de=曲线分析梳/边界；连接分析 #932229=无连接、#fcda7f=G0、#028502=G1、#440154=G2；二面角分析低/中/高阈值 #440154/#21918c/#fde725；斑马纹黑白；曲率图 Viridis/Blue→Red/Plasma/Rainbow。

**Assembly**：#ffc107=选中；配合轴 X 强红 #cd0000、Y 深柠檬绿 #009500、Z 强蓝 #0000d0；黑色=偏移值/箭头/线；配合指示 #90cff1 良好 / #bd3039 问题 / #999999 抑制；仿真色阶同上。

**错误指示**：特征列表/对话框标题橙色文字（悬停摘要）；单字段红框、选择列表与几何变红；驱动尺寸黑、从动尺寸浅灰；约束灰方块黑图标→错误红方块白图标；系统错误顶部气泡通知；悬空实体深红；右键 **Ignore faulty part warning (for...)**（仅原 Part Studio 可用）/ **Show faulty part warning (for...)**。

### 4.10 性能与显示（Performance / Graphics）

**Performance panel**

- 位置：Document panel 左上（Onshape 标志下），所有文档与 tab 类型可用；表格默认按 Count 从高到低，点 Count 旁下箭头反转全表。
- Part Studio：Total regeneration time（点击 Show regeneration times 开每特征耗时面板）；Slowest features（>10 s）；Features 计数（不含 origin/默认平面）；FeatureScript modules imported（**>600 才显示；>1500 警告**）。
- Assembly：Mate solve time；Total instances（Top level instances、Total parts、Total subassemblies、Unique parts/subassemblies/sketches/surfaces、Tangent mates、Mate limits）；Multiple configurations inserted（工作区多配置 >15 s 时出现，建议改为插入同 Part Studio 的版本）。
- Feature Studio：Total modules imported（**>600 警告**）。
- Tab graphics：Very fine tessellation（点表格零件可选中）；Primitives（Faces/Edges/Vertices/Triangles/Lines）。
- High quality mode（Shift+R）：View cube 菜单开启，细分质量高、未可见件进入视野时再服务器取；顶部蓝色横幅 Disable 或 View cube > Disable high quality；开启状态在 tab 内持续，某些建模操作可能等细分完成才可用。
- Document：Tabs（Other tabs、Part Studios、Assemblies、Drawings）。
- System：Browser/Version/Platform/GL vendor/GL renderer/Local storage。
- WebGL 扩展：Float textures（剖面与透明混合）、Float buffer blending（剖面端盖）、Float framebuffer rendering（透明混合等）、Anisotropic texture filtering、32-bit indices、High precision fragment shaders（AO）。
- Connection：Latency、Region、Expected region。
- 消息阈值（节选，全部来自面板表）：
  - 单特征重算 >10 s：Warning；总重算 >30 s：Information；>60 s：Warning；特征总数 >500：Warning。
  - 导入模块 >1500（Part Studio）：Warning。
  - 装配求解 >5 s：Warning；多配置重算 >15 s：Information；>30 s：Warning。
  - 文档 tab 250–500：Information；>500：Warning；Part Studio/Assembly 数 150–200：Information；>200：Warning。
  - Latency >250 ms：Warning；Region≠Expected region：Warning。
  - 浏览器不支持 / WebGL 不支持：Error；Framebuffer rendering 缺失：Warning。
- 图标：信息/警告/错误 + 三个“顶层包含子消息”的叠加图标；出现时叠加在 Performance 图标上。

**显示数据细化（Graphics Area Display Data）**

- 细化从“可见件列表”开始，每件重置为 Unloaded（包围盒），再逐步升细分；按尺寸与相机距离排序；**选中件强制 Fine**（内存允许时）。
- 每轮增加细分直到达到目标或内存上限；内存不足时先保证尽量多的件至少 Coarse，再提升部分件到 Medium/Fine。
- 5 级：Unloaded、Coarse、Medium、Fine、Extra Fine；默认生成 Coarse/Medium/Fine，Extra Fine 仅 “View in high quality”；复杂 Part Studio 可能只生成 Coarse/Medium 或只 Coarse。
- 数据量：Coarse 1×、Medium 10×、Fine 100×（1 GB Coarse 最高可至 100 GB Fine）。
- 触发：历史变化、相机移动、用户选择；左下角显示“细化进行中”/“相机移动时细化暂停”，完成后消失。
- 嵌套/遮挡件可能引发加载-卸载循环与包围盒闪烁；内存约束下封闭组合件、全景视图会保留远处件为包围盒（并非错误）。
- 缓存：从本地缓存加载时按最高可用细分且先忽略相机，加载后应用相机并卸载/细化；切换 tab 时先算 Part Studio，可能挤占内存后触发降级循环。
- 建议：为装配建立 Display states / Named views，设更粗的细分，减少无谓细化。

**硬件要点**

- 支持浏览器：Chrome、Firefox、Safari（仅 macOS）、Opera、Edge；IE 不支持；建议 64 位；Vivaldi 可用但须关闭 Allow Gestures。
- 兼容性页只报告 Browser 与版本、WebGL 与扩展、Renderer、Performance check、WebSockets、Geographical Data、Onshape server region；**仅信息，不修问题**。
- WebGL 必须启用；显卡黑名单见 Khronos；给出 Chrome（chrome://settings/system、chrome://flags Override software rendering list）、Firefox（about:config webgl.disabled=false、webgl.force-enabled=true）、Safari（Security Allow JavaScript/WebGL）、Opera、Edge（edge://settings/system、edge://gpu）步骤；Mac 需 High Power mode。
- 性能以 TPS 衡量；大装配建议独显；Optimus 会干扰，需在 NVIDIA 控制面板把浏览器设为高性能 GPU；Windows 设置里可开 Hardware-accelerated GPU scheduling 并给浏览器设 High performance；最后手段是 BIOS 关 Optimus（有风险）。
- float framebuffer 缺失：升级驱动→升级显卡→换设备。
- 内存紧张/显存 <1 GB 可致 WebGL context loss；可降低零件细分质量；显示内存密集模型时延迟加载不重要件，卸载后以**半透明包围盒**表示，进入视野后自动加载。
- 性能检查在刷新率 <60 Hz 时不执行；默认阈值 20 FPS 会阻碍自动细分细化。
- 改善渲染：Shaded without edges（仍可选边）、关闭 Match pixel density、关闭细分覆盖或强制 coarse、更新浏览器；网络为短消息式，带宽需求低但需稳定连接；RAM 增加仅边际收益。
- 移动端：Android 最低 8（Oreo）；iOS/iPadOS 最低 18；设备 iPhone 8+、iPhone SE 2 代+、iPad Mini 5 代+、iPad Air 3 代+、iPad Pro 1 代+；Mali 400/450 等老 GPU 可能白屏/崩溃，建议 OpenGL ES 3。

### 4.11 配置系统（Configurations 7 篇）

**创建（Part Studio/Assembly）**

- 打开右侧 Configuration panel；未配置时无表且 Features 列表上方无 Configurations 选择器；点 **Configure Part Studio / Configure Assembly** 建 List 输入。
- 第一列命名选项行（Default 起）；Tab 到下移；蓝条=当前配置。
- **+ Configure features / + Configure assembly features** 进入黄色横幅配置模式；点特征/实例再点参数，参数虚线黄框且新增一列；列名=特征名 + 参数名；悬停对话框字段可见哪些可配置（黄色高亮）。
- 值编辑：双击单元格输入值；双击“选择型参数”打开特征对话框，蓝高亮参数改选后 ✓ 关闭。
- Done 结束；可继续加列；Add configuration input 加 List/Checkbox/Configuration variable。
- 左侧 Configurations 下拉切换预览，模型应更新；不更新则检查设计意图与配置定义。

**Checkbox 输入**：命名；一列空/勾两行；选参数（如 Unsuppressed，或右键特征 **Configure suppression**）；勾选与否分别代表抑制状态；可含多参数列。

**Configuration variable 输入**：命名后成为 `#variableName` 真变量；类型 Length/Angle/Integer/Real/Text；Text 可用于自定义 FeatureScript；除 Text 外定义 Default/Minimum/Maximum；在表达式中右键 **Set to #variableName** 或直接输入 `#var`；用量列在面板中。

**Assembly 特例**：只能配置 mates（非 mate connectors）、instances、patterns；与 Part Studio 配置无关；支持在 Change configuration 对话框、Instance 对话框、装配 Configuration panel 把配置转表达式；但抑制配置与 List 输入配置在装配中**不能**转表达式。

**插入与实例**：Insert 对话框展开已配置 Part Studio/Assembly 后出现 Configurations 选择器；图标可 **Set to last viewed** 或箭头里的 **Reset to default**；Generate 刷新预览；插入后实例带配置图标；右键 **Change configuration**；悬停实例 tooltip 显示当前配置。
- 阵列/复制/镜像配置实例会共享种子配置；改种子会更新所有图案实例；独立插入/粘贴或解散复制后的实例各自引用。
- 选择：**Select instances with same part and same configuration**、**Select instances with same configuration**（同一输入表且选项相同），随后批量 Change configuration。
- 默认值：行右键 **Set as default**。

**Variable Studio**：先取消 **Insert into all Part Studios and Assemblies** 才能配置；右键变量值/描述 **Configure**（加入表，橙色高亮）；可 **Unconfigure / Unconfigure from**；插入时选配置并 Generate，可插入整个 Variable Studio 或其中单变量；已配置 Variable Studio **不能发布**；在 Variable Studio 表中 **Edit reference** 可把其配置接入上层 Part Studio/Assembly 配置（右键 Configure / Configure with）。

**Configured properties**

- Configuration panel 顶部 **Configured properties / Configured assembly properties**；Properties for 下拉选零件/外观/装配；带配置属性的对象显示 ✓；Add property 选择属性（含自定义属性），所有输入成为列；双击 Property 列或值编辑；选择型属性打开对话框改选后 ✓。
- 自动零件号开启时可右键零件号列 **Generate next part number**。
- 只读属性存在时不能删表/加属性/删只读列，但仍可改其他可编辑单元格。
- **Exclude from properties**（Parts/Part Studios）：输入三点菜单选择；被排除输入按默认值参与发布包与修订引用；仅差被排除配置的零件在 BOM/发布管理视为同一零件；发布即覆盖该配置所有值；默认选项始终可见；仍参与几何计算、计算属性、Mass Properties（BOM 质量与 Mass Properties 不一致通常由此产生）；使用时显示排除图标。可 **Include in properties** 恢复。

**Managing configurations**

- 重命名：悬停显示 I 光标→点击改→Enter；列名仅草图特征可改；也可菜单 Rename。
- 过滤：Filter 图标，默认 `:name`；引号精确（`:part "Part 1"`）；可组合（`:name Depth :part "Part 1"`）；图标可按 List/Checkbox/Configuration variable 输入类型过滤（可多选）。
- 复制/粘贴输入：输入三点 **Copy input** 或面板 **Copy all inputs**；目标面板 Configure 按钮箭头 **Paste inputs**；可跨 Part Studio/Assembly/Variable Studio、同文档、跨文档；复制名称/可见性条件/FeatureScript ID/变量定义；剪贴板保留到登出；**粘贴后与原输入无引用关系**；不可计算的可见性条件自动移除；同内部 FeatureScript ID 的输入不会粘贴（需先删旧再粘）。
- 表格与电子表格互转：面板右上 More > **Copy table**；粘到电子表格编辑；复制“仅数据行/列”（不含表头）回 Onshape，点表格左上单元格后 Ctrl+V；自动补齐默认单位；**多出的行会即时创建，多出的列不会创建**（需预先加列）。
- 面板菜单：Copy all inputs、Collapse/Expand all inputs。
- 输入菜单：Copy table、Copy input、Move up/down（也可拖动）、Rename、Edit FeatureScript IDs（Parts/Part Studios；Break references and change IDs）、Exclude from properties、Visibility conditions、Input propagation、Delete（无警告立即删除）。
- 行菜单：Switch to（非当前输入时前缀 “Switch to a different input”）、Set as default、Duplicate row、Move up/down（可拖）、Rename、Delete column/row；拖列边可调宽。
- **Tolerance options**：点容差图标使选项值可带容差，箭头设置 Precision/Type；每个选项值可独立设置。
- **动态抑制表达式**（Part Studio/Assembly）：Configure features 后在特征树右键特征/文件夹（装配中实例/子装配/文件夹/mate）**Configure suppression (with...)**；抑制文件夹会以一列抑制其全部内容。
- **复选框转表达式**：Part Studio 中右键复选框 **Convert to expression**，可改表达式；右键表达式 **Convert to checkbox**；装配中可在 Change configuration、Instance 对话框、配置面板转换，但抑制配置与 List 不能转；若动态抑制被移除，表达式自动转回复选框。

**Visibility Conditions**

- 输入级条件：输入菜单 **Visibility conditions**；Add condition；第一个下拉选控制输入；第二个选 **is**（具体选项）或 **is between**（范围）；保存后输入表显示条件图标。
- 选项规则（**仅 List**）：展开输入 **Add option rule**；Show 行选 Options 或 Range（含端点、可重叠）；When 行选 Always 或 When + 输入 + is/is between；多条条件为 **AND**；可继续 Add option rule。
- 多个输入条件也是叠加（同时满足才可见）；**只能由在 Configurations 面板中位于其上方**的输入控制。
- 自动修复：被引用输入/选项删除或移动后条件自动移除，工作区出现警告；折叠时显示条件摘要。
- 隐藏输入总取默认值；无可见选项的输入隐藏并取默认；可见性条件对所有 Insert 对话框生效且立即影响所有引用文档。
- 排除属性的输入只能控制同样被排除、且在其下方的输入；被排除输入的默认选项始终可见；会隐藏默认的选项规则无法保存，需 **Always show default**；若已存在的规则因后来排除属性而隐藏默认，面板显示警告直至修正。
- 对话框可切 Inputs=All inputs、三点多输入展开/折叠、Show hidden inputs 开关、右侧预览可当试验场。

**Input Propagation**：配置面板三点 > Input propagation；列出可传播输入；勾选后 Confirm；传播标记显示在引用旁；仅在当前 tab 有足够输入/引用时可用（可用 Copy input 制造引用）。

### 4.12 In-Context 建模

- 入口：装配 Instances 列表或图形区右键零件（primary instance）> **Edit in context**；已有 context 时先选现有 context 或 Create new context。
- 打开所属 Part Studio：该零件在 Parts list 高亮；其余装配件半透明（ghost）围绕主实例；保留装配当前视图方向、缩放、活动剖面视图。
- 首次在另一零件上选参考点即创建 **Assembly context（快照）**，捕获全部几何与位置；Part Studio 特征列表上方出现 Assembly contexts 列表；参考点紫色高亮；**引用永不丢失/断开，零件不会因此失败**。
- 可引用多个点；Contexts 面板管理所有 context。
- **更新永不自动**；在装配或 Part Studio 手动 Update context。装配侧：零件右键 Update context → 选 context；Part Studio 侧：Contexts 面板 Assembly 单元格右键 Update <context name>，或顶部下拉选 context 后点 Update context 按钮。
- **更新通知**：基于的特征变化时，Assembly contexts 列表与 Contexts 面板出现实心蓝点；装配 Instances 列表中 in-context 零件及其子文件夹旁也出现，tooltip 说明可用更新与相关 context（>3 个时显示前两个 + “and more”）。
- **Contexts 面板列**：Name（双击改名）、Assembly（链接，打开对应配置，可跨文档）、Named position（下拉选择跟随；默认当前装配位置）、Primary instance（实例或 origin/mate connector 的特征名）、Affected parts（由 context 产生及后续基于其几何的零件）。悬停 Affected parts/Primary instance 高亮图形区零件与特征；活动 context 蓝条；过期蓝点。
- Assembly 单元格右键：Switch to assembly、Change assembly configuration（仅配置装配；立即应用，Cancel 撤销）。
- 行右键：Activate（非活动）、Hide/show context instances（活动；可过滤/切换可见性、显示隐藏与选择 Mate connectors）、Restore context view state（活动）、Update、Duplicate（副本为非活动，原保持活动）、Delete。
- 底部 **Update all out of date contexts**。
- 只读场景：版本、只读文档、延迟重算模式、修复模式、Insert 对话框或其他操作打开时，表格只读、菜单与更新按钮不可用。
- 错误：装配被移动/删除→Assembly 单元格 **Missing reference**；命名位置不存在→**Named position not found. Select a valid position**。
- 其他：可在 Assembly contexts 列表选 **None** 临时关闭；未引用被编辑零件的零件不会自动插入装配；多 context 时选中 context 会用黄色高亮相关特征的 in-context 箭头图标；编辑时按 **Y** 隐藏当前选中件；剖面视图在 Part Studio→Assembly 与反向都保留；**必须有实体被引用，context 才会在关闭后保留于 Part Studio**。
- **主实例**：实心箭头；右键零件 > <context name> > **Set as primary instance** 可改（尤其主实例损坏/丢失时）；旧主实例虚线箭头；主实例不 ghost。
- 版本引用不可 in-context 编辑；版本/工作区引用可用；从版本插入的零件选 Edit in context 会弹 **Select a workspace to edit**（因版本不可变），选择 Main/B2 等工作区。
- 移动端：context 列表在 Feature list 上方；更新通知仅浏览器与 iOS；可重命名（垂直点菜单）、Exit edit in context（金色横幅 x）不创建 context；其余同桌面逻辑。

### 4.13 导入 CAD 与混合建模

**导入网格**

- 支持 Parasolid Mesh、STL、OBJ、GLTF、3MF；在 Parts list 的 **Meshes**（Surfaces 之下）显示；**可查看/引用但不可编辑**。
- 网格顶点选择记录位置而非参数关联，网格被变换后选择点不跟随。
- 可在导入过程中或 tab 菜单单位下拉中改网格单位。
- 可用：三点建面（用网格点）、测量表面积/距离/实体网格质量属性、Use 工具把网格点投影进草图、创建 Mate connector、Extrude 的 Up to vertex 引用网格点。
- 移动端为性能不显示网格折线。

**修复与后续**

- **Highlight boundary edges**（Camera and render options 下拉）：边界/层状边用实线红（可见）/虚线红（隐藏）。
- 修复工具：**Enclose**（曲面/面/零件围成新零件）、**Fill**（闭合曲线/边创建曲面，New/Add）、**Move boundary**（移动边界边延伸/修剪曲面）、**Bridging curve**（连接两点/顶点）、**Composite curve**（由边/草图实体/其他曲线创建曲线）。
- 破碎导入可建 **composite part**（closed 消耗实体 / open 不消耗）；Import 的 **Create composite** 可把中性 CAD 多非实体体合成一个 closed composite（无论是否同 body）。
- 无参数历史时用直接编辑（如 Delete face）；示例删除帽顶旋钮面再补新面。

**Import 特征与更新**

- 导入后 Feature list 出现 **Import 1**；双击或右键 Edit 打开对话框，选项可随时开关：
  - **Import appearances**：导入原外观；取消则移除全部外观。
  - **Source is 'Y Axis Up'**：Onshape 以 Z 向上；勾选按 Y 向上导入；除 Autodesk `.ipt`、CATIA `.catpart` 外均支持。
  - **Allow faulty parts**：拓扑有问题的故障件在 Parts list 显示红色；取消则不允许故障件。
  - **Create composite**：见上。
- 更新：源系统重新导出；Part Studio 中右键 Import 特征 **Update** 选文件；或 CAD imports 文件夹中打开该 tab 点 **Update**。1.93 之后升级的文档会更新 blob 并传播几何到 Import 特征；未升级文档点 Update 会新建一个 Part Studio 而非升级原特征。
- **只更新 Part Studio，不更新 Assembly**；目标 Part Studio 中后加特征会尽量重放，失败则特征进入错误状态。
- 去重：把通用件导出→Documents 页 Create > Import 新建文档→原文档删除该件（装配引用变红）→各装配中右键引用 **Replace instances** 指向新文档；实例带链接图标表示跨文档引用；源文档改动后可择时更新实例。
- 删除导入文件时出现影响哪些 Part Studio 的警告。

**Mixed Modeling**

- 导入：Parasolid mesh（zip 含 x_t+xmm_txt，或 x_b+xmm_bin，或单 x_b）v28.0–v34.0 只读；Parasolid mixed model（mesh+B-rep）v32.0 起；STL/OBJ/GLTF/3MF/Rhino。
- 可用工具示例：Delete Face、Rib、Shell、Enclose、Boolean、Split、Offset Surface、Move Face、Hole、Mate Connector、in-context 建模；在零件表有 mixed/mesh 专属图标。
- 装配插入无专属过滤器，网格/mixed 件出现在 Parts 与 Surfaces 过滤器下。
- 导出：混合模型仅 **STL 与 Parasolid**；Parasolid 导出为 zip（x_t+xmm_txt，装配也可能是 x_t+x_b）；装配导出 OBJ=zip(.mtl+.obj)、STL=.stl、GLTF=.gltf、JT=.jt、STEP=.step（AP242 及以后保留混合元素，旧版排除）、PVZ/IGES/ACIS **排除网格**。Parasolid 为最佳混合导出。

### 4.14 AI Advisor / Explore / Labs

**AI Advisor**

- 可用：除 Onshape Government 外所有计划。
- 入口：Document panel 的 AI Advisor 图标；或 Help > Help 搜索页直接在顶部显示答案。
- 使用：Prompt 输入问题，Enter 或提交箭头；答案在面板顶部；段落末尾引用链接可打开来源菜单/新 tab，多引用用 < > 切换；References 下拉列出全部；右下 1–5 星（1 完全不准确 … 5 完全准确）。
- 同一会话后续问题累积并基于前问；刷新浏览器重置。
- 权限：Company/Classroom 默认启用，Enterprise 默认禁用；My Account > Company/Classroom/Enterprise settings > Preferences > AI Advisor > “Enabled users to use AI Advisor in documents”；仅对本人或本公司拥有文档可见；多公司时按各公司开关决定可见性。

**Explore Onshape**

- 计划：Free、EDU、Pro Trial、Pro Startup、Demo；入口为落地页横幅或 `https://cad.onshape.com/documents/explore-onshape`（Enterprise 把 `cad` 换公司名，EDU 换学校名）。
- 教程打开后像普通 Document，多一个 tutorial tab；Start/Continue；面板含视频、说明、演示；交互练习有 Check；点步骤跳到视频对应点，Back/Skip 导航；Back/Next 推进，顶部显示进度；结束可回 dashboard 或复习上一步。
- 面板误关可从 Document panel/Document toolbar 的 Explore Onshape 按钮重开；Documents 页可 Hide Explore Onshape content 隐藏横幅；EDU 图可能不同。

**Onshape Labs / Co-Complete / Descriptive Image Search**

- Labs 除 Government 外全计划；管理员授权（Company settings > Preferences > 搜索用户/团队；Enterprise：Enterprise settings > Global permissions > Allow access to Onshape Labs > Enable > Configure permission 加 Individuals/Teams）；用户 My account > Preferences > 勾选 Enable access to experimental, proof of concept features；随后列出 Lab 能力。
- **Co-Complete**：Feature Studio 内 Co-complete 开关（不可用则先启用 Labs）；输入时上下文建议；Enter 接受，继续输入或 Esc 拒绝；账户偏好勾选则新 Feature Studio 默认开。
- **Descriptive Image Search**：Public 搜索中使用 AI 缩略图描述；Documents 页 Public > Search in Public > 下拉勾选 Descriptive image search；账户偏好决定默认勾选；移动端在 Advanced search 过滤器底部开关。

### 4.15 App Store / 打印 / 支持

**App Store**

- 入口：Document toolbar 右上 **Go to App Store**，或 `cad.onshape.com/appstore`；新窗口打开。
- Account 菜单：View in dark mode（会话级，登出复位；持久需 Preferences > Theming）、Sign out。
- 工具栏：Search、左侧分类、右上排序 **Featured / Date / App type**（Integrated cloud app、Connected desktop app、Connected cloud application）；排序只在 All apps 或子分类时可用；应用详情含截图、评分、评论、价格、EULA、Support 与访问入口。
- FAQ：搜索由 Elasticsearch 支持（“CAM”可匹配 MasterCAM）；应用帮助找 provider，账单找 Onshape Support；功能请求走 Forum Improvement request；开发需 developer portal 签开发者协议后访问 API explorer；上架联系 Partner Development；已购应用 My Apps / Add Application / My account > Applications；企业可购多席位并指派用户（Light 用户除外），一次性购买按用户；取消在计费周期末生效；可立即 Revoke 文档访问；可 Reactivate；仅 Integrated 应用在文档内可见（以 tab 出现，首次需授权），Connected Cloud/Desktop 需在外部应用登录；Free 计划可用；未授权用户打开含 app tab 的文档会看到解释并可购买；**移动端不可见**；隐私只在用户明确同意下共享。

**打印**：打开 tab > Document 菜单（汉堡图标）> Print > 虚线页面边界，可拖动模型定位、选纸张与 Portrait/Landscape > Print 进入浏览器打印预览（打印机、页数、份数、布局、彩色/黑白、纸张、边距、每张页数、比例、单双面）> Print；或 **Download image** 保存图片。

**Contact Support**：Help 图标 > Contact Support（Professional/Enterprise）或 Report a bug（其他）；Title + Detailed description；可选 **Share this document with Onshape support**（仅支持人员在有限时间访问，可随时撤销；文档内 Onshape 员工名字旁有 Onshape 图标）；附件最多 5 个、每个 ≤20 MB，失败可刷新重试；Capture & annotate screen 截图标注后以 .png 附上；Submit 发送；也可用官网 Contact Us 表单；Account 菜单 > View support tickets > 新窗口登录后查看；PTC 总部 121 Seaport Boulevard, Boston, MA 02210。

## 5. 工作流、规则与错误状态

### 5.1 典型特征工作流（由 Dialogs/Numeric/Error 归纳）

1. **选择输入或启动工具**：可在工具栏/搜索/快捷键启动；蓝底字段可在特征打开前预选（预选会填字段）。
2. **填写参数**：蓝框数值字段接受单位/表达式；非法表达式红框、✓ 禁用；悬停可看可配置参数。
3. **预览与 Final**：Preview 滑块在 0–100% 间调透明度；编辑非末尾特征时用 Final 看最终态。
4. **接受/拒绝**：Enter 或 ✓；Esc/x 拒绝。接受后**对话框打开期间的临时动作合并并从 Undo/Redo 列表移除**，该特征整体成为一次撤销单元。
5. **失败**：特征列表橙色文字、悬停摘要；字段/选择红框；几何红；约束变红；需要时右键 Ignore faulty part warning；系统级错误顶部气泡。

### 5.2 选择规则（可直接变成验收断言）

- 单击切换选中；追加点击无需 Ctrl；光标计数最多显示 5+。
- 左→右框选=完全包含；右→左=接触即选；Ctrl+拖选=取消选择；Space/空白/右键 Clear selection=清空。
- 选中件在显示细化中强制 Fine（内存允许）。
- 选择结果可作为下一个工具的预填（Create Selection / Select Other 都如此）。
- Create Selection 的面/边准则与 Select patterns 必须按上述闭集实现；Bounded faces 无法闭合时降级为“所有相邻面/边”。
- 选择 suppressed 状态：打开对话框前已抑制、打开后抑制（从列表消失）必须可视化。

### 5.3 配置工作流与不变量

- **建立输入** → **配置参数列** → **填写选项值** → **Done** → 左侧切换预览 → 插入装配/图纸/发布时选配置。
- 配置改变模型时点：抑制状态、尺寸、选择型参数、FeatureScript 自定义特征、零件号/颜色/材料。
- 装配配置仅 mates/instances/patterns；Part Studio 配置可独立存在。
- 图案/镜像/复制共享种子配置；改种子更新图案实例；独立插入/粘贴不共享。
- 可见性条件只能由上方输入控制；条件为 AND；隐藏输入取默认；无可见选项则整输入隐藏取默认；删除来源自动修复+警告；不能保存隐藏默认的选项规则。
- 输入复制是**快照**：名称、可见性、FeatureScript ID、变量定义随行；粘贴后不追踪原输入；同 ID 输入不粘贴；剪贴板到登出为止。
- 电子表格粘贴：行可即时增加、列不可；默认单位自动补齐。
- 配置属性排除：BOM/发布把仅差被排除配置的零件视为同一件；发布覆盖所有值；几何/计算属性/质量属性仍按实际值；默认选项始终可见。
- 已配置 Variable Studio **不可发布**；作为配置列接入上层后由上层决定。

### 5.4 In-Context 关系与更新规则

- 关系单位是 **context 快照**：首次引用其他实例即建快照，记录全部实例几何与位置；引用永不丢失，因此不会因装配变动而“断链”失败。
- **更新是显式动作**：Update context / Update all out of date contexts；蓝点=可用更新。
- 一个 Part Studio 可保存同一装配的多个铰接位置 context，也可以有多个不同装配的 context；主实例决定 ghost 装配的锚定。
- 上下文只在有关联实体被引用时保留；否则关闭后不持久。
- 版本引用不可编辑（需选工作区）；不可变版本不能作为编辑目标。
- 可读性限制：版本/只读/延迟重算/修复模式/Insert 打开时面板只读。
- 失败状态：Missing reference、Named position not found，必须提供修复入口（选有效位置）。

### 5.5 导入/更新工作流

- 导入 → （可选）改单位/外观/Y-up/允许故障件/建 composite → 在 Part Studio 中修复/直接编辑 → 源文件变更后 Update 导入特征 → 后加特征尽量重放，失败显示错误。
- **装配不会随导入更新**；这属于文档明确的限制。
- 去重引用：导出→新建文档→替换实例→链接图标表明跨文档；源改后择时更新。

### 5.6 常见错误与处理

| 现象 | 文档给出的处理 |
|---|---|
| 浏览器 413/431 | 清浏览器缓存（按浏览器步骤） |
| WebGL 未启用/“Rats! WebGL hit a snag” | 更新驱动、按浏览器开启 WebGL、覆盖黑名单、Mac 开 High Power |
| Reduced rendering performance detected（帧率低于阈值持续 >3 分钟） | 查系统兼容性；Shaded without edges；关闭 Match pixel density；取消细分覆盖；更新浏览器 |
| float framebuffer 警告 | 升级驱动→升级显卡→换设备 |
| WebGL context loss（显存不足） | 换更大显存设备或降低细分质量 |
| 性能面板消息 | 按对应阈值处理：慢特征、模块、装配求解、tab 数、延迟、区域 |
| 草图过定义/错误 | 红色实体/尺寸/约束提示；修约束 |
| 特征失败 | 橙色文字+悬停摘要；字段/选择红框；忽略/恢复 faulty part warning |
| 选择不到被遮挡面 | Select Other（`） |
| 配置预览不变 | 检查设计意图与配置定义（参数/选择是否真被配置） |
| 可见性条件失效 | 被引用输入/选项被删后自动修复并警告；编辑规则或恢复来源 |
| 命名位置丢失 | 选择有效 named position |
| 装配引用被删 | Missing reference；需恢复装配或改引用 |
| 导入件破损 | Highlight boundary edges + Enclose/Fill/Move boundary 等 |
| 更新后特征失败 | 源模型变化导致重放失败，特征进入错误状态 |

## 6. 与其他章节的关系

本章是其他所有章节的“底座”，大量交叉引用：

- **数据管理与协作**：Version Manager、Document Management、Sharing and Collaboration、Follow Mode、Release management、Versions、Tag/Branch（配置插入与 in-context 的版本引用规则都依赖这些章节）。
- **Part Studio / Assembly / Feature list**：Feature and Part Lists、Part Studio、Assembly、Materials/Appearance、Appearance panel、Customizing Parts: Appearance、Specifying tessellation quality、Graphics preferences、Camera and render options、Theming、Environment profile settings、Render Studio（颜色/暗色模式/分析）。
- **特征工具**：Extrude、Revolve、Fillet、Chamfer、Shell、Rib、Enclose、Fill、Move face、Delete face、Replace face、Split、Boolean、Hole、Mirror、Linear/Curve/Circular Pattern、Transform、3D Fit Spline、Derived、Use、Measure、Section view、Named views、Display states。
- **配置上游/下游**：Variable Studios、Property Configurations、Releasing Configurations、Tolerance options、Decimal format（My Account Settings）、Input Propagation、Visibility Conditions、Configured Properties。
- **导入/导出**：Supported File Formats、Importing Files、Import/Export、Replace instances、BOM、Mass Properties。
- **平台/帮助**：Learning Center 课程、Onshape Forums、FeatureScript Documentation、FeatureScript Library、Add Custom Features、What's New、Changelog、AI Advisor。
- **支持**：Share Documents、My Account - Applications、Company/Classroom/Enterprise Settings - Applications。
- **App Store 开发**：developer portal、API explorer、GitHub 示例仓、Partner Development。

上下游关系可概括为：本章定义全局 UI/选择/数值/配置/上下文语义 → Part Studio/Assembly 工具章节在此语义上定义具体特征参数 → 数据管理章节消费配置/版本/上下文 → 发布与 BOM 再消费配置属性与排除规则。

## 7. 对 LubanCAD 的可执行启示

> 标注：`[文档明确]` = 语料直接写明；`[推断]` = 由文档规则推导出的实现建议。

### 7.1 需要补齐的全局 UI 表面

1. **快捷键速查与自定义** `[文档明确]`：Shift+/ 打开可搜索、可按 tab 过滤的速查表；Preferences 内可编辑/禁用/重置；必须区分 Onshape 控制冲突（错误）、浏览器冲突（信息）、覆盖冲突（警告）；自定义跨平台同步。`[推断]` 这应作为独立设置页与冲突校验器，测试断言：冲突类型映射、Reset all、禁用后不再触发。
2. **选择语法** `[文档明确]`：切换式选择、光标 5+ 计数、Space/空白清空、Shift 范围、左右框选差异、Ctrl+拖选取消。`[推断]` 需要选择服务统一投影到高亮/光标计数/选择集，避免每个工具各自维护。测试断言：左→右不选穿过的圆柱、右→左选穿过件、Ctrl 拖选从选择集移除。
3. **Create Selection 对话框** `[文档明确]`：面六准则 + Select patterns；边五准则 + Select pattern；Add selection 进工具字段；预选可跳过对话框。`[推断]` 面/边传播算法应独立于 UI，可单测；Bounded faces 无法闭合时降级。
4. **Select Other** `[文档明确]`：反引号（含各国键位）、由近及远列表、循环+Enter、自动填字段。`[推断]` 需按命中深度排序候选，且在半透明/遮挡场景仍可用 Alt+click 穿透。
5. **Triad 操纵器** `[文档明确]`：自由拖拽 vs 操纵器、固定件禁止拖、独立原点、Mate connector 吸附、拖动数值框、Move to origin、对齐 Z、90/180° 旋转、配合自由度内求解。`[推断]` 数值框应复用 Numeric Fields 解析器；无解时给出“重定位再试”的提示而非假成功。
6. **对话框契约** `[文档明确]`：蓝底/蓝框、预览滑块 0–100%、Final、Enter/Shift+Enter、接受后撤销分组、只读用户可看不可改、移动端重排白名单（Transform/3D Fit Spline/Boolean/Mates 除 Tangent）。`[推断]` 将“一次对话框提交=一次事务”固化到工具基类，避免中间态进入撤销栈。
7. **上下文菜单** `[文档明确]`：图形区、特征树、零件表、tab、草图行；草图行含 Copy sketch（跨 Part Studio，跨版本可能报错）、Export DXF/DWG、Suppress、View normal to、Roll to here 等。`[推断]` 应实现按选择类型动态组装菜单，`Clear selection` 与 `Create selection` 为全局项。
8. **颜色与错误状态 token 化** `[文档明确]`：选中 #ffc107、错误 #bd3039、未定义草图 #0000ff、全定义 #000000、过定义 #bd3039、从动尺寸浅灰、驱动尺寸黑、约束红方块白图标、配合轴 X 红/Y 绿/Z 蓝、信息/警告/错误/成功提示各自边框/填充/文字 hex。`[推断]` 将这些作为主题变量与可测试的视觉基线；错误指示必须同时出现在列表文字、字段、几何、约束图标与顶部通知。
9. **性能面板与显示数据指示** `[文档明确]`：面板分区、阈值、图标叠加、左下角“细化中/暂停”、弱网指示、半透明包围盒、5 级细分与 1×/10×/100× 数据体积。`[推断]` 先实现诊断只读面板与阈值常量表，再做可视化；测试断言阈值边界（10 s/30 s/60 s/500/1500/5 s/250 ms）。
10. **App Store 外壳** `[文档明确]`：Integrated app 以 tab 出现且首次授权；Connected app 外部；应用类型排序；企业席位/Revoke；平台可见性（移动端不可见）。`[推断]` 若 LubanCAD 做插件市场，最小需要应用注册、授权、tab 挂载与撤权。

### 7.2 参数与默认值清单（可直接建表）

- 数值滚动：默认 **0.1**；Ctrl **0.01**；Shift **1.0**；0–1 字段：默认 **1.0**、Ctrl **0.01**、Shift **无效果** `[文档明确]`。
- 长度单位：mm/cm/m/in/ft/yd（含复数）；角度 deg/rad（含复数）；`pi/PI/Pi`；`%` 取模；三角以度为单位 `[文档明确]`。
- 数值约束：结果必须无单位或单位一次方；拒绝 `1/unit`、unit²、无单位+单位、deg 与 mm 混加 `[文档明确]`。
- 文件夹细分：Coarse/Medium/Fine 默认生成；Extra Fine 仅 high quality；默认选中件目标 Fine `[文档明确]`。
- 性能阈值：慢特征 10 s；总重算 30/60 s；特征 500；模块 600（显示）/1500（警告）；装配求解 5 s；多配置 15/30 s；tab 250/500；PS/ASM 150/200；延迟 250 ms；细分暂停阈值 20 FPS；性能测试最低 60 Hz；小件剔除 2 px（<5,000 bodies）/10 px（更大装配）；建议 tab <100；派生超过 3 个 Part Studio 改用版本 `[文档明确]`。
- In-Context：更新**手动**；蓝点=过期；主实例实心箭头/旧主实例虚线；引用紫色；context 列表无引用不持久 `[文档明确]`。
- 配置：三类输入；变量类型 5 种；条件 `is`/`is between`；选项规则仅 List；条件 AND；排除属性时默认值参与发布 [文档明确]。
- 导入：Y-up 除 `.ipt`/`.catpart`；附件 5×20 MB；mesh v28–v34；mixed v32+ `[文档明确]`。
- AI Advisor 评分 1–5 星；附件上限；Explore 计划集合；Labs 计划排除 Government `[文档明确]`。

### 7.3 交互与选择规则（测试可断言）

- 单击选中/再点取消；无需 Ctrl 追加；光标最多显示 5+；Space 清空；Shift 点选列表范围；双击（移动端）清空。
- 框选方向：左→右全包含（蓝），右→左接触即选（黄）；Ctrl+拖框取消。
- Create Selection：Protrusion=凸边、Pocket=凹边、Hole=同一圆孔、Fillets=常半径圆角、Tangent connected=相切边、Bounded faces=种子+边界；边：Loop/chain、Equal length/radius、Parallel、Select pattern。
- Select Other：` 下移、Shift+` 上移、Enter 确认、结果自动填特征字段。
- Triad：固定件不可拖；未配合件完全按输入移动；配合件受自由度约束；Move to origin 不建立配合/固定。
- 对话框：蓝底字段必须来自图形区选择；蓝框字段必须键盘输入；Enter/Shift+Enter 行为；接受后中间动作不留在 Undo/Redo。
- 配置：隐藏输入取默认；无可见选项输入隐藏；规则不能隐藏默认；输入只能被上方输入控制；复制输入不保持引用；跨表粘贴行增长、列不增长。
- In-Context：更新不自动；蓝点出现条件；只读场景面板不可操作；Missing reference / Named position not found 两种错误文案。
- 导入更新：只更新 Part Studio，不更新 Assembly；后加特征失败进入错误态。

### 7.4 事务/撤销/版本/权限/协作约束

- **撤销粒度** `[文档明确]`：对话框接受/拒绝后，期间的临时动作移出 Undo/Redo；Undo/Redo 按用户/按 tab/按会话。`[推断]` 这与现有“特征整体一次事务”一致，应在工具基类中强制。
- **只读/权限** `[文档明确]`：View-only/Copy、Light 用户可打开对话框但字段不可编辑；配置面板在版本/只读/延迟重算/修复/Insert 打开时只读；版本中不可编辑 in-context；AI Advisor 按拥有者公司开关可见。
- **协作** `[文档明确]`：配置按用户各自选择，Follow Mode 跟随 leader；协作者动作可让细分质量短暂下降再恢复；同时在线的编辑实时可见。
- **版本/发布** `[文档明确]`：从版本派生更轻（无重算、无更新）；版本引用加快装配加载；已配置 Variable Studio 不能发布；排除属性的配置发布覆盖所有值；发布包/修订引用用被排除配置的默认值。
- **App/第三方权限** `[文档明确]`：Integrated app 首次使用需授权文档数据；可 Revoke；不支持移动端；Light 用户不能使用应用订阅席位；未授权用户看到说明。
- **支持/隐私** `[文档明确]`：共享给支持仅限支持人员、有限时间、可撤销；AI Advisor 引用来源包括帮助/学习中心/博客。

### 7.5 验收点建议（来自文档的明确行为）

1. 快捷键面板：Shift+/ 打开；搜索过滤；冲突三分型提示；Disable/Reset；跨平台同步。
2. 选择：光标计数 5+；左→右/右→左框选语义；Ctrl+拖选取消；Space/右键清空；中点在非编辑态可用。
3. Create Selection：六种面准则、五种边准则、Select patterns、Add selection 入字段、预选直接填充。
4. Select Other：`/Shift+`/Enter 循环；国别键位；自动填字段。
5. Numeric：滚动步进三档；0–1 字段特例；单位与复数；三角按度；非法表达式红框/禁用 ✓；数组/三元/逻辑。
6. Dialog：预览 0–100%；Final 仅在非最后特征出现；Enter/Shift+Enter；接受后撤销分组；只读用户不可编辑。
7. Triad：固定件不可拖；Move to origin；Align/Anti-align Z；Rotate 90/180；自由 vs 配合件行为。
8. Colors/Errors：选中黄、错误红、草图三态、尺寸驱动/从动、约束正常/错误、顶部通知；忽略/恢复 faulty part warning。
9. Performance：阈值消息类型（Info/Warning/Error）；图标叠加；High quality 横幅与 Disable；细化指示出现/消失。
10. Configurations：三类输入；插入时 Set to last viewed/Reset to default；图案共享配置；Change configuration；Select instances with same (part and) configuration；可见性 AND/上方控制/默认兜底；复制输入快照；表格粘贴行列规则；Excluded from properties 对 BOM/发布/质量的影响。
11. In-Context：Edit in context 打开正确 Part Studio、ghost 关系保持、视图/剖面保持、引用紫色、蓝点过期、手动 Update、Contexts 面板五列与菜单、只读限制、两类错误文案、版本引用弹 Select a workspace to edit。
12. Import：Import 特征四选项；更新只影响 Part Studio；1.93 前后行为差异；网格点可用于建面/测量/Use/Mate connector/Up to vertex；混合模型导出格式矩阵。
13. AI/Labs/Explore：AI 会话累积与刷新重置；企业默认关闭；Labs 双级授权；Co-Complete Enter/Esc；Descriptive Image Search 默认偏好；Explore 教程 Check/进度。
14. App Store：Integrated app 授权后以 tab 打开；未授权用户提示；Revoke 生效；移动端不可见；企业席位与 Light 用户限制。

### 7.6 文档缺口与不要照搬的点

- 语料**未说明**快捷键 `*` 标记的确切含义、颜色表中若干图片示例内容、Performance 面板图标的形状、Error Messages 的 413/431 成因机制；不要臆造。
- 语料**未给出**配置表的最大行列数、输入数量上限；不要编造限制。
- 语料**未说明** iOS/Android 上配置创建的完整功能（明确写“只能在桌面浏览器创建/编辑配置与可见性条件”）。
- 语料**未说明** In-Context 的底层快照数据结构与重建算法，仅描述行为；[推断] 实现时需自定 snapshot 格式并保证“引用不失效”。
- 语料**未说明**混合模型移动端编辑能力（仅说明不显示折线），不要承诺。
- 语料**未说明** Contact Support 的响应 SLA、App Store 审核周期、Labs 能力清单全集（仅举例 Co-Complete 与 Descriptive Image Search）。
