# Onshape Help 章节分析：账户菜单与企业/课堂设置

> 分析代理 #9/14。输入：`groups/account-menu.txt`（43 主题，39,110 词，6,959 行）。仅基于本地语料，未联网。

## 1. 本章概览

- **主题数**：43（个人账户 18 篇 + Company/Classroom/Enterprise 设置 24 篇 + 非活跃账户政策 1 篇）。
- **总词数**：39,110（语料头声明）。
- **覆盖子域**：
  1. 顶栏账户菜单（Account Menu）与个人资料、邮箱、偏好、通知、安全、设备、应用、集成、开发者、Early Visibility、订阅/付款、个人 Teams；
  2. Action Items（任务）；
  3. 组织级设置：成员与席位、团队、别名、全局权限、跨企业连接、认证（2FA/SSO/域名验证）、项目角色与权限方案、自定义属性、类别、非几何 Items、应用席位、编号方案、发布管理、任务工作流、组织偏好（含 BOM/导出规则/企业自定义特征）、修订工具、云存储与 Slack 集成、Webhooks、组织级 Developer、Arena PLM 连接、Job Queue、组织详情；
  4. Inactive Onshape Account Policy。
- **文档更新日期**：语料未提供任何 `last updated` 字段，无法判定。
- **整体质量/抽取限制**：
  - 所有截图只剩 `[image]`/`[image: alt]`，大量“Only available for”后面本应是**套餐徽标图片**，现为空；因此多数标签页的“仅某套餐可用”边界无法逐页精确判定，只能依据正文措辞（如“Enterprise admins only”）判断。
  - 表格被压平为 `|` 分隔行（日期格式表、单位表等仍可读）；个别清单（Global permissions、导出约定属性）排版破碎但内容完整。
  - 目录提取异常：第 43 个主题分隔符仍写 `TOPIC: Account Menu`，实际 URL/标题是 `inactive_onshape_account_policy.htm` / “Inactive Onshape Account Policy”；报告按实际标题处理。
  - 文本重复：`Enterprise Settings - Authentication` 大段照搬个人 Security 的 2FA 内容；`Enterprise Settings - Developer` 与个人 Developer 大段重复。
  - 描述元数据有误：Arena 页的 DESC 写成“grant/remove access to OneDrive/Dropbox/Google Drive”（复制自 Integrations），正文才是 Arena 配置。
  - 文档内部存在矛盾：Enterprise Teams 的 DESC 称“所有团队成员必须是公司/课堂/企业用户”，正文却写“Team members do not need to be users…”。本报告两者都记录并标注。
  - 部分套餐例外名丢失：如“Payment history (all plans except )”“Teams (all plans except )”“Available for all plans except .”，缺徽标，无法确定被排除的套餐。
  - 多页“Only available for”悬空；可确认的是 Enterprise 专属/管理员专属语义，但 Professional/Educator/Classroom 的具体勾选矩阵不完整。

## 2. 主题清单与逐篇摘要

### A. 账户菜单与个人账户（18 篇）

| # | 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|---|
| 1 | Account Menu | Account Menu | `/Content/Plans/account_menu.htm` | 右上角姓名菜单的八项入口：My account、Action items、View support tickets、App Store dev portal、Switch to…、Company/Classroom/Enterprise settings、View in dark mode、Sign out；暗色模式为会话级，仅覆盖 Part Studio/Render Studio/Assembly/App Store。 |
| 2 | My Account Settings | Account Menu > My Account Settings | `/Content/Plans/my_account_settings.htm` | 个人设置总目录：Profile、Emails、Preferences、Notifications、Security、Devices、Applications、Integrations、Developer、Early visibility、Subscription、Payment options、Payment history、Teams；页面随套餐变化，并提供 Return to document 链接。 |
| 3 | My Account - Profile | Account Menu > My Account Settings > Profile | `/Content/Plans/my_account_profile.htm` | 维护姓名、用户名（论坛名）、昵称（协作与右上角显示）、Bio（可选）、Documentation Name（图纸首字母与发布候选）；可上传头像；管理员可覆盖 Documentation Name。 |
| 4 | My Account - Emails | Account Menu > My Account Settings > Emails | `/Content/Plans/my_account_emails.htm` | 最多 3 个已验证邮箱，其中一个为主邮箱；可随时改主邮箱（需至少两个）；任一邮箱可用于找回密码；任何已绑定邮箱不能再注册新账户；点小 x 删除。 |
| 5 | My Account - Preferences | Account Menu > My Account Settings > Preferences | `/Content/Plans/my_account_preferences.htm` | 个人偏好大集合：语言、主题、数字小数分隔符、启动页、单位与精度、鼠标映射、设备像素密度配置、Parts/Instances 列表属性、快捷键、快捷工具栏、工具栏重置、图纸背景、材料库、导出规则、发布审批委托、Onshape Labs 及 iOS/Android 入口。 |
| 6 | Export Rule Conventions | Account Menu > My Account Settings > Preferences > Export Rule Conventions | `/Content/Plans/export_rule_conventions.htm` | 导出规则使用 `${<property>}` 表达式与 camelCase 命名；按 Part/Assembly/Drawing/Part Studio/File 五种 Scope 分别列出可用属性（含 `${reference.<property>}` 图纸引用属性）。 |
| 7 | My Account - Notifications | Account Menu > My Account Settings > Notifications | `/Content/Plans/my_account_notifications.htm` | 邮件与移动通知各三档：All new shares and comments / Direct shares, mentions, and marked documents / Nothing；两段分别用独立保存按钮；与 In-app notifications 分离。 |
| 8 | My Account - Security | Account Menu > My Account Settings > Security | `/Content/Plans/my_account_security.htm` | 改密码（旧密码+新密码+确认、实时规则勾选）；启用/停用 2FA（二维码或文本码、6 位码、5 个恢复码、记住设备 30 天）；Government (US) 使用 HMAC-SHA256/FIPS 140-3。 |
| 9 | My Account - Devices | Account Menu > My Account Settings > Devices | `/Content/Plans/my_account_devices.htm` | 列出所有已授权使用该账户的移动设备，可用 Forget 移除。 |
| 10 | My Account - Applications | Account Menu > My Account Settings > Applications | `/Content/Plans/my_account_applications.htm` | App Store 第三方应用管理：Integrated/Connected Cloud/Connected Desktop 三类；授权、撤销、按文档控制访问；应用出现在 My account、Subscriptions 与文档 Plus > Add application 三处。 |
| 11 | My Account - Integrations | Account Menu > My Account Settings > Integrations | `/Content/Plans/my_account_integrations.htm` | 分别授权/移除 Dropbox、Google Drive、Microsoft OneDrive、Altium 365，用于导入导出文档；需第三方凭据走向导。 |
| 12 | My Account - Developer | Account Menu > My Account Settings > Developer | `/Content/Plans/my_account_developer.htm` | 个人开发者门户：注册 OAuth 应用、扩展、商店条目；创建/查看/删除 API key（个人上限 2 个，带 TTL）；6 个 OAuth 权限 scope；查看年度 API 用量。 |
| 13 | My Account - Early Visibility | Account Menu > My Account Settings > Early Visibility | `/Content/Plans/my_account_early_visibility.htm` | 早期可见性计划：按功能点 Add/Request access，阅读并接受 EULA，审批通过后邮件确认；建议使用专用测试文档、勿用于生产。 |
| 14 | My Account - Subscription | Account Menu > My Account Settings > Subscriptions | `/Content/Plans/my_account_subscription.htm` | 按套餐/角色显示订阅表、用户席位、付款详情、已订阅应用与客服链接；Professional 可按每邮箱多订阅；Owner 与 Admin 区别在于账单可见性。 |
| 15 | My Account - Payment Options | Account Menu > My Account Settings > Payment Option | `/Content/Plans/my_account_payment_options.htm` | 仅账户 Owner 可更改信用卡/账单信息或删除卡；卡只有在未关联订阅时才能删除。 |
| 16 | My Account - Payment History | Account Menu > My Account Settings > Payment History | `/Content/Plans/my_account_payment_history.htm` | 按时间列出付款记录并可 View 打印式发票；Professional 仅 Company Owner/Admin 可见，Standard/Free 用户可见（含降级用户）。 |
| 17 | My Account - Teams | Account Menu > My Account Settings > Teams | `/Content/Plans/my_account_teams.htm` | 个人可建团队（创建者为初始 admin），成员可为 Member/Admin，不必有共同点甚至不必有订阅；分享给团队的权限不超过分享时授予；成员离开/被移除/团队删除会撤销经团队的分享；团队至少保留 1 名 admin。 |
| 18 | Action Items | Account Menu > Action Items | `/Content/Plans/action_items.htm` | 任务/发布待办：文档内 Action items 面板默认仅当前文档、仅浏览器；Action items 页支持 Type/Status/Role 过滤、搜索、排序（默认最旧优先）；创建任务仅 Professional/Enterprise，Standard/Free 只能查看与勾选完成；iOS 有独立过滤对话框。 |

### B. Company/Classroom/Enterprise Settings（24 篇）

| # | 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|---|
| 19 | Company/Classroom/Enterprise Settings | Account Menu > Company/Classroom/Enterprise Settings | `/Content/Plans/enterprise_settings.htm` | 组织设置总览：Users、Teams、Aliases、Global permissions、Connections、Authentication、Project roles、Permission schemes、Properties/Custom properties、Categories、Items、Applications、Numbering schemes、Release management、Task management、Preferences、Revision tools、Integrations、Webhooks、Developer、Arena、Job queue、Details（共 23 个页签）。 |
| 20 | …Settings - Users | … > Users | `/Content/Plans/enterprise_settings_users.htm` | 席位增减、邀请/添加/移除成员、Admin/Member 角色、Full/Light 用户类型、Member/Guest 状态、CSV 批量增删、列排序/过滤、Edit user（Documentation name 覆盖、类型、Guest）、计划移除、48 小时邀请与重发、域名验证自动 Active、课堂退出。 |
| 21 | …Settings - Teams | … > Teams | `/Content/Plans/enterprise_settings_teams.htm` | 组织级团队用于批量分享；创建者/团队 Admin 可增删成员，至少 1 名 Admin；删除团队撤销其全部分享；Enterprise 建团队需 Manage users and teams 全局权限，Professional/Standard 任何人可建。 |
| 22 | Enterprise Settings - Aliases | … > Aliases | `/Content/Plans/enterprise_settings_aliases.htm` | 别名是发布管理工作流的通讯组；仅管理员且需 Manage users and teams 全局权限才能创建别名、把用户/团队加入别名。 |
| 23 | Enterprise Settings - Global Permissions | … > Global Permissions | `/Content/Plans/enterprise_settings_global_permissions.htm` | 定义约 24 项企业级全局权限（管理员、成员/团队/别名管理、邀请访客、RBAC、永久删除、分析、建项目/根文档、发布候选、任务、审批、App Store、公共文档、非几何 Items、自定义工作流、匿名链接、转出文档、PLM 同步、标准件元数据、工作区保护、导入/导出、修订工具、Onshape Labs、个人副本）及 Light 用户可用子集。 |
| 24 | Enterprise settings - Connections | … > Connections | `/Content/Plans/enterprise_settings_connections.htm` | 跨企业连接：用对方 Enterprise ID 创建→对方 Approve→双方各自加用户；仅创建管理员可编辑/删除；数据只对连接内用户可见，对方分析/Where Used/发布信息不展示；政府企业只能连政府企业，EDU 不支持。 |
| 25 | Enterprise Settings - Authentication | … > Authentication | `/Content/Plans/enterprise_settings_authentication.htm` | 管理 2FA、SSO（外链身份提供方配置）与 Domain verification：HTTP 文本文件或 DNS TXT 验证，多域名可启用/停用/删除；验证后成员自动 Active。 |
| 26 | Enterprise Settings - Project Roles | … > Project Roles | `/Content/Plans/enterprise_settings_project_roles.htm` | 项目角色是把用户分到职能桶（Designer/Engineer/Reviewer/Vendor），在创建 Project 时再绑定具体用户。 |
| 27 | Enterprise Settings - Permission Schemes | … > Permission Schemes | `/Content/Plans/enterprise_settings_permission_schemes.htm` | Permission scheme 是命名的“角色—权限集”表；一个 Project 只引用一个方案，与 Project roles 配合决定项目内文档访问。 |
| 28 | …Settings - Properties/Custom Properties | … > Properties/Custom Properties | `/Content/Plans/enterprise_settings_custom_properties.htm` | 元数据定义中心：9 类对象、8 种属性类型、Pending/Active/Inactive 发布态、默认值/必填/版本/工作区可编辑/校验/类别；支持 FeatureScript 计算属性与装配聚合属性。 |
| 29 | …Settings - Categories | … > Categories | `/Content/Plans/enterprise_settings_categories.htm` | 类别把自定义属性分组到对象属性对话框：标准类别（Global/Part/Assembly/Drawing/Part Studio/File/Application/Version/Workspace/Item）+ 自定义类别，支持 Scope、Parent categories 继承与隐藏子类别。 |
| 30 | …Settings - Items | … > Items | `/Content/Plans/enterprise_settings_items.htm` | 创建非几何 BOM Items（胶水/油脂/油漆等）：名称、描述、类别、零件号、修订、状态、供应商、项目、产品线、计量单位、发布态；支持 CSV 导入（红/绿校验）与 CSV 导出。 |
| 31 | …Settings - Applications | … > Applications | `/Content/Plans/enterprise_settings_applications.htm` | 组织级第三方应用与席位管理：购买时加席位、购买后改席位数、给用户/团队授权（必须是成员）、Light 用户不占席位、免费应用超限自动加席位。 |
| 32 | …Settings - Numbering Schemes | … > Numbering Schemes | `/Content/Plans/enterprise_settings_numbering_schemes.htm` | 为发布对象/标准件/Items/发布名称配置手动、顺序（前缀/最小长度/Next）或 Arena 编号；配置图纸复用件号、件号传播（Never/One workspace/All workspaces）。 |
| 33 | …Settings - Release Management | … > Release Management | `/Content/Plans/enterprise_settings_release_management.htm` | 发布管理工作流总控：启用托管流程、默认/自定义工作流、修订方案（字母跳过 I,O,Q,S,X,Z / 数字 / 自定义≥50 行）、图纸水印、访问限制、发布条件、Release candidate 对话框必填项、自动作废旧版。 |
| 34 | Enterprise Settings - Task Management | … > Task Management | `/Content/Plans/enterprise_settings_task_management.htm` | 管理任务工作流：Onshape 默认流程只读；自定义流程可 Active/Inactive、设 Enterprise 默认、查看发布信息、打开定义文档、Unpublish、展开预览；Save task settings 保存。 |
| 35 | …Settings - Preferences | … > Preferences | `/Content/Plans/enterprise_settings_preferences.htm` | 组织级偏好：企业启动页（优先于个人）、AI Advisor、Onshape Labs、图纸/材料库、View only 工具条与强制只读、文档名 Java 正则、SSO 自动预置为 Light、企业自定义特征、BOM/检验表模板、导出规则、创作权限、Date type 格式。 |
| 36 | …Settings - Revision Tools | … > Revision Tools | `/Content/Plans/enterprise_settings_revision_tools.htm` | 重置已发布对象的件号类型（part/assembly/blob/drawing），使件号可在另一类型复用：旧类型全部修订置 Obsolete，再发布时 Release candidate 给出警告；仅管理员或被授予 Use revision tools 全局权限者可访问。 |
| 37 | Enterprise Settings - Integrations | … > Integrations | `/Content/Plans/enterprise_settings_integrations.htm` | 仅企业管理员：云存储（Altium 365/Dropbox/Google Drive/OneDrive）Allow all/selected/none + 全部/选定用户；Slack 协作集成（API key 连接、工作区安装、`/onshape connect/list/tasks/help/disconnect`、评论/发布通知）。 |
| 38 | …Settings - Webhooks | … > Webhooks | `/Content/Plans/enterprise_settings_webhooks.htm` | 管理员可开启 Webhook basic auth（Authorization 头）与签名校验：生成 primary/secondary 密钥轮换、Reset；签名 `Base64(HMAC256(timestamp.payload))`；附 `X-onshape-webhook-timestamp`、`-signature-primary`、`-signature-secondary` 头；必须 HTTPS。 |
| 39 | …Settings - Developer | … > Developer | `/Content/Plans/enterprise_settings_developer.htm` | 组织管理员开发者门户：注册 OAuth 应用、向用户/别名/团队分发、为任意成员创建 API key（组织不限额）、查看组织 API 用量（25/50/75/100% 邮件告警）、扩展与商店条目、权限 scope。 |
| 40 | Enterprise Settings - Arena | … > Arena | `/Content/Plans/enterprise_settings_arena.htm` | Onshape–Arena PLM 连接配置：Workspace ID/Name、API Web Token、API URL；同步开关（类别映射、3D 缩略图、Items/标准件仅数量或全量、Arena Change 驱动审批、修订/备注同步、临时 Disable sync）；类别映射表与删除条件。 |
| 41 | Enterprise Settings - Job Queue | … > Job Queue | `/Content/Plans/enterprise_settings_job_queue.htm` | 列出 Arena BOM/Release candidate 同步作业：Job ID、Type、Creator、Date submitted、State（Completed/Failed/Pending/Started，Completed 默认隐藏）；详情含 Reference/Status/Message/Errors；管理员可 Remove。 |
| 42 | …Settings - Details | … > Details | `/Content/Plans/enterprise_settings_details.htm` | 组织详情：Logo（Change/Remove）、公司/企业名称与唯一 ID、描述、街道/城市/州/邮编/国家。 |

### C. 政策（1 篇）

| # | 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|---|
| 43 | Inactive Onshape Account Policy（语料分隔符误标为 Account Menu） | Account Menu > Inactive Onshape Account Policy | `/Content/Plans/inactive_onshape_account_policy.htm` | 4 年未登录即非活跃，4.5 年后删除；有效付费计划账户不删；删除不可恢复，用户名下（及公司名下）文档删除，但被他人文档引用的除外；删除前 6 个月、1 个月、1 周、1 天发 4 封预警邮件。 |

## 3. 核心概念与术语

**套餐与角色**

- 套餐：Free、Standard、Professional、Educator、Enterprise、Enterprise EDU、Onshape Government (US)。Professional 是“公司订阅但适合个人”，按用户计费。
- 组织角色：**Owner**（创建者；拥有 Admin 全部权限 + 付款管理/账单可见；Professional/Educator/Enterprise/Enterprise EDU 才有区分）、**Admin**（管理用户/详情/属性/偏好/发布流程，可访问公司全部文档）、**Member**（文档归组织所有）、Classroom 的 **Educator**（可增删成员）。
- Enterprise 额外维度：**User type = Full / Light**（Light 只能查看、评论、导出；EDU 恒为 Full）；**Status = Member / Guest**（Guest 仅在显式分享范围内，计费但不在 All enterprise users 团队）。
- 团队角色：Member / Admin，团队至少 1 名 Admin。

**协作对象**

- **Team**（个人团队 vs 组织团队；组织团队分享可被任意组织成员发起，外部团队必须先是成员）。
- **Project / Project role / Permission scheme**：项目引用一个“角色—权限集”表；访客也可进项目角色。
- **Alias**：发布管理用通讯组（审批人等）。
- **Connection**：跨企业受控共享，双方管理员建立、各自加用户。
- **Global permission**：不绑定资源、作用于组织级操作的权限集合。

**数据治理对象**

- **Property（Onshape metadata / custom property）**：9 类对象、8 种类型；发布状态 Pending/Active/Inactive。
- **Category**：属性分组与继承；有 Scope 与父子层级。
- **Item**：非几何 BOM 条目。
- **Numbering scheme**：Manual / Sequential / Arena；件号唯一性与传播策略。
- **Revision scheme**：Alphabetical（跳过 I,O,Q,S,X,Z）/ Numerical / Custom（文本文件≥50 行）。
- **Release candidate / Release / Obsoletion / Watermark / Revision table**。
- **Action item**：comment / general / release 三类任务，open/closed（iOS 为 open/drafted/completed）。
- **API key 与 OAuth application**：应用级 vs 用户级鉴权；scope 六项。
- **Webhook signature**：HMAC-SHA256 + Base64，主/备密钥。
- **Arena**：PLM 连接与 BOM/Release 同步作业。

## 4. 功能与 UI 明细

### 4.1 Account Menu（个人顶栏）

可用位置：浏览器右上角姓名/头像；iOS/Android 通过汉堡菜单进入 My account。

菜单项与行为：

| 菜单项 | 行为/边界 |
|---|---|
| My account | 进入个人设置总目录；若从文档进入，页面右上角有 **Return to document**。 |
| Action items | 进入任务页；任务来源 Comments 对话框（文档也提到 release 任务）。 |
| View support tickets | 只读查看已提交工单；提交工单须到 Help 菜单（姓名左侧图标）。 |
| App Store dev portal | 面向开发者/合作伙伴发布 App Store 应用。 |
| Switch to… | 在套餐/组织之间切换（如 Free/Standard ↔ Professional/Enterprise）。 |
| Company/Classroom/Enterprise settings | 进入组织设置。 |
| View in dark mode | 会话级暗色切换；支持 Part Studios、Render Studios、Assemblies、App Store；Drawings、PCB Studio、Enterprise analytics 主视区不支持（外围工具条/菜单仍暗色）。退出登录后复位为亮色；要持久须在 Preferences > Theming 设 Dark mode。 |
| Sign out | 退出并关闭会话。 |

### 4.2 My Account Settings 明细

#### Profile

字段：Name（注册时自动记录）、Username（论坛名）、Nickname（协作显示与右上角）、Bio（可选）、Documentation Name（图纸首字母；Enterprise 发布候选也使用）、头像（显示于用户名旁、评论、Share 对话框及一切用户列表）、公司/企业名（展示）。保存按钮 **Update profile**。管理员可在 Users > Edit user 覆盖 Documentation Name；用户侧显示为覆盖值且不可编辑；管理员移除覆盖后恢复用户原值。

#### Emails

- 最多 **3** 个邮箱；一个为 primary，接收全部通知与通信。
- 增加至少一个邮箱后才可更改 primary。
- 所有邮箱必须验证（收 Onshape 验证邮件）。
- 任一已绑定邮箱（无论是否 primary）**不得**再创建另一个 Onshape 账户。
- 任一已验证邮箱均可用于忘记密码重置。
- 删除：邮箱行末小 **x**。

#### Preferences（个人）

| 区块 | 字段/选项 | 默认/规则 |
|---|---|---|
| Language | 语言下拉 + Save language | 保存后自动登出，重登生效；翻译未全量。Date type 默认格式随语言：English `MM/DD/YYYY`；French/German/Italian/Spanish `DD/MM/YYYY`；Chinese (Simplified/Traditional)/Japanese/Korean `YYYY/MM/DD`。公司/教育/企业管理员可另行改 Date type。 |
| Theming | Light mode / Dark mode | Light 默认；Dark 限制同 4.1。 |
| Decimal format | Use comma as decimal separator + Save decimal format | 默认用句点；启用逗号后，表达式中数组值之间必须加空格（`[1, 4, 9, 16][#i]`）。 |
| Startup Page | 下拉 + Save startup page | 公司/企业管理员设置的 Startup page 优先于个人。 |
| Units | 单位与精度、12/24 小时制 | 默认 **inch、degree、pound、3 位小数**；作用于 Part Studio/Assembly/Drawing 的草图尺寸与特征默认输入。仅对**新文档**生效；单字段可输入其他单位（如 `10mm`）自动换算；工作区可在 Document menu > Workspace units 覆盖。小数位：仅浏览器；作用于特征对话框/草图尺寸/操纵器对话框；Measure 与 Mass properties 生效；精度不足时 Measure 用科学计数法、Mass properties 显示测量误差；只影响显示（内部舍入），不参与计算；输入位数多于设定时编辑态可见；不影响导入文件。 |
| Mouse controls | CAD 预设、Reverse scroll wheel zoom direction、Set default rotation behavior to constrained rotate、Use pen input as mouse | 同时控制 Drawings 鼠标映射；支持 3Dconnexion/SpaceMouse。 |
| Environment profile settings | 配置名；Match pixel density：Automatic（默认）/On/Off | 按机器与浏览器分别绑定配置；删除配置不可撤销（确认 OK/Cancel）。 |
| Part Studio settings | Display parts list properties | 勾选后 Parts 列表右侧显示 part number、revision、state；也可在文档内右键 Parts 表头 > Show parts list properties 仅当前文档生效。 |
| Assembly settings | Display instance list properties | 勾选后 Instances 列表显示 part number/revision/state；文档内可右键实例 > Hide/Show instance list properties。 |
| Keyboard shortcuts | General/Sketch/Drawing/3D View/Part Studio/Assembly 快捷键 | 详见 Keyboard shortcuts 主题。 |
| Shortcut toolbars | Sketch/Feature/Assembly/Drawing 快捷工具栏 | 勾选纳入工具；无数量上限；顺序=列表顺序；`S` 调出、`Esc` 关闭，出现在鼠标附近；一旦自定义，优先于 Onshape 更新默认。 |
| Toolbars | Reset to defaults | 只重置 Sketch/Part Studio Feature/Assembly 工具栏；不重置快捷工具栏。 |
| Drawings | 模型空间背景色 | 针对导入 DWG/DXF。 |
| Material libraries | 新建/删除自定义材料库；可对全公司开放 | 详见 Customizing Parts: Materials。 |
| Export rules | 见下 | 管理员可另设组织级规则。 |
| Release management | Delegate approval to another user or team（团队名或用户邮箱/列表） | 委托后本人与受托方均收到待审批通知；委托不可再转委托（A→B、B→C 时 C 只收到指定 B 的请求，不含 A 的）。 |
| Onshape Labs | Enable access to experimental features；FeatureScript co-complete（新 Feature Studio 会话）；Descriptive image search（公共文档缩略图 AI 描述用于搜索） | 总开关关闭时所有 Labs 功能不可用。 |
| iOS/Android | Preferences 入口 | iOS/Android 工作流相同；企业侧可要求批准图纸模板、启用企业共享材料库（这些属于组织 Preferences）。 |

**Export rules（个人）**：Add export rule → Scope（Part/Assembly/Drawing/Part Studio/File）→ 可选 Category（对应 Scope；**每个 Category 只能有一条规则**）→ 文件格式（或全部）→ Convention。规则可作用于 DXF/DWG 的零件面、钣金展开图；图纸可用 `${reference.<property>}` 取主图纸所引用零件属性。Standard 年度用户不能创建自定义属性，故不能用自定义属性做规则。自定义属性须 Active 才能在导出规则中使用。

**Export Rule Conventions**：`${<property-name>}`，camelCase（如 `Not revision managed` → `${notRevisionManaged}`）；有效属性蓝色，无效/未激活红色；可加入冒号/连字符等（`${document.name}: ${partNumber} -${revision}`）。语料列出：
- Part：appearance、category、description、document.name、excludeFromBom、export.format、export.resolution、export.stlFormat、export.timestamp、export.units、material、name、notRevisionManaged、partNumber、productLine、project、partStudio.{category,description,name,notRevisionManaged,title1,title2,title3}、revision、state、tessellationQuality、title1/2/3、unitOfMeasure、vendor、workspaceOrVersion.{name,description,category}。
- Assembly：category、description、document.name、excludeFromBom、export.format、export.resolution、export.stlFormat、export.timestamp、export.units、name、notRevisionManaged、partNumber、productLine、project、revision、state、subassemblyBomBehavior、title1/2/3、unitOfMeasure、vendor、workspaceOrVersion.{category,description,name}。
- Drawing：approver、category、dateApproved、dateDrawn、description、document.name、drawnBy、export.format、export.timestamp、inspectionCount、lastChangedBy、lastChangedDate、name、notRevisionManaged、partNumber、reference.{appearance,category,description,excludeFromBom,material,name,notRevisionManaged,partNumber,productLine,project,revision,state,subassemblyBomBehavior,tesselationQuality,title1,title2,title3,unitOfMeasure,vendor}、revision、revisionDescription、state、title1/2/3、workspaceOrVersion.{category,description,name}。
- Part Studio：category、description、document.name、export.format、export.resolution、export.stlFormat、export.timestamp、export.units、name、notRevisionManaged、title1/2/3、workspaceOrVersion.{category,description,name}。
- File：category、description、document.name、export.format、export.timestamp、name、notRevisionManaged、partNumber、productLine、project、revision、state、title1/2/3、vendor、workspaceOrVersion.{category,description,name}。

#### Notifications

两个独立区块（Email / Mobile），各三选一单选钮，各自 Save：
1. **All new shares and comments**：所有新分享（含分享给团队/公司）与可访问文档的评论；
2. **Direct shares, mentions, and marked documents**：直接分享、提及、以及明确标记接收评论邮件的文档；
3. **Nothing**。
与 In-app notifications 相互独立。

#### Security

- 改密码：Security → Change password → 旧密码、新密码、再次输入；规则清单逐项打勾；Update password。
- 2FA：Enable → Set up two-factor authentication → 确认密码 → OK → 扫描二维码（或 enter this text code）→ 输入 6 位码或 Onshape 文本码 → Enable → 记录恢复码 → OK。
  - 同时 **5 个有效恢复码**；用过的码失效；重新生成则旧码（含未用）全部失效；恢复码可随时生成，只有最新一批有效。
  - 可记住设备 **30 天**。
  - 停用：Security → Manage → Disable → 确认密码 → OK。
  - 不支持 **Replace 2FA**；换设备须先停用再在新设备启用。
  - Government (US)：HMAC-SHA256/FIPS 140-3，需支持 SHA-256 TOTP；经测试应用：Proton Authenticator、Bitwarden Authenticator、Okta Verify、2FAS、UniFi Verify、Aegis Authenticator（仅 Android）；不支持 SHA-256 的应用会提示码无效。
- 忘记密码：登录页 “Forgot your password?” → 邮件重置链接。

#### Devices

列出所有与该账户关联并授权的移动设备；右侧 **Forget** 移除。

#### Applications

- App Store（http://appstore.onshape.com，文档他处写作 `https://cad.onshape.com/appstore`）以 Onshape 凭据登录；可浏览、购买；公司/企业 Owner 可购买多席位并分配。
- 三类：Integrated Cloud Application（文档内）、Connected Desktop Application（本地安装）、Connected Cloud Application（云服务）。
- 授权：文档 Plus > Add application → 查看权限 → Authorize application / Deny；Share 对话框 Application 页签可查看/允许某应用访问该文档，点应用名旁的 x 撤销。
- 动作：**Revoke**（撤销数据访问但不移除应用，再次使用会重新询问）、**Authorize Application**（Plus > Add Application 或 My account Applications 页 Grant）、**Control application access to my documents individually through the Share dialog?** 开关（开启后须逐文档在 Share 对话框允许；此前已授予的访问不受开关影响）。
- 列表出现于：My account > Applications（已授权）、Subscriptions（已订阅）、文档 Plus > Add application。

#### Integrations（个人）

分别 Add/Remove：Dropbox、Google Drive、Microsoft OneDrive、Altium 365；Add 后走第三方登录向导；Remove 为右侧红色按钮。

#### Developer（个人）

- 个人应用计入个人 API Limits；组织设置中创建的应用计入组织 Limits。
- App Store 应用必须 OAuth2；自动化脚本可用 OAuth2 或 API key。API key 只代表生成它的用户。
- **API key**：Viewing（API keys 页）、Creating（Name、Permissions、可选 Enable TTL + 日期，到期前邮件）、密钥/secret 只显示一次、Deleting（X → 确认删除不可撤销）、Moving（不能跨账户或用户级↔组织级移动；须新建并替换代码引用后删旧）。
- 个人账户 **最多 2 个 API key**；组织账户不限。
- API key 仅在创建它的 stack 有效（`companyName.onshape.com` 与 `cad.onshape.com` 不互通）。
- OAuth application 注册字段：Name、Primary format（唯一标识、注册后不可改、不展示）、Summary、Redirect URLs（至少一个；必须 HTTPS，例外 `http://localhost:<port>` 与 `urn:ietf:wg:oauth:2.0:oob`）、Type（Integrated Cloud App / Connected Cloud App / Connected Desktop App）、OAuth URL（可先留空）、Supports collaboration、Permissions。创建后 secret 只显示一次。
- 应用页签：Details（创建商店条目、转移所有权、删除应用）、Settings、Keys and secret（复制 client id、重生成 secret）、Permissions、Extensions、Onshape OAuth、External OAuth。
- Extension 字段：Name（可截断）、Description（可选；不在 UI 显示但可能在授权流程显示）、Location（每个应用只能一个 element tab extension）、Context（如 Part Studio 中的选择上下文）、Action URL、Action type（GET / POST / Open in new window）、Action body（仅 POST，合法 JSON）、Show response（GET/POST，等待并以对话框显示合法 JSON 响应）、Icon（Info 面板、右键菜单、工具栏、对话框按钮等）。
- Store entry：Name/Summary（自动取注册值）、Type（须与注册一致）、Category、Team Visibility（默认不对内部用户可见 / all internal users / specific teams）、Description、Support URL、Support Email、Vendor、Version、Images；创建后为私有，只有本人与指定内部团队可见。
- 状态：Active（App Store 可用）→ Deprecated（不再展示，现有用户保留访问）→ Trashed（移入 Trash；仅当所有付费订阅到期后；清理所有购买与授权）→ Deleted（永久，不可撤销）。变更须输入应用名确认。
- OAuth permission scopes：`OAuth2ReadPII`（读资料）、`OAuth2Read`（读文档）、`OAuth2Write`（写文档）、`OAuth2Delete`（删文档/工作区）、`OAuth2Purchase`（代购）、`OAuth2Share`（分享/取消分享）。
- API usage：Annual API limits for 下拉可切换账户；使用量 25%/50%/75%/100% 给全部管理员发邮件。

#### Early Visibility

My account → Early visibility 页签 → 对目标功能点 Add（可多选）→ 阅读 EULA → Accept（或 Cancel）→ 请求发送给 Onshape → 审批通过后邮件确认。官方建议用专用文档、勿用于业务关键/生产。

#### Subscription / Payment

- Subscription 页内容：公司/课堂/企业列表（套餐、名称、用户角色三列）、Users 席位数、Plan/Payment details（订阅类型、信用卡、订阅状态）、Applications 表（套餐、应用名、角色）、客服邮件链接。
- 规则：一个邮箱一套 Onshape 凭据，可属于多个 Professional 订阅；Professional 按用户计费，含私有文档、Release Management、Custom properties、公司材料库、统一账单、公司分享。仅 Professional/Educator/Enterprise/Enterprise EDU 有用户角色；Free/Standard Owner 即管理员。Admin 与 Owner 相同，差别是 Owner 可看账单。Free/Standard 在 My account-Applications 管理应用；付费组织 Owner 在组织 Applications 管席位、在 Users 分配席位。
- Payment options：Owner 才能改卡；卡只有在不关联任何订阅时才能移除；Change 输入新卡。
- Payment history：时间序，View 打开打印式发票；Professional 仅 Company Owner/Admin；Standard/Free 可见；语料中“除某套餐外”的徽标缺失。

#### My Account - Teams（个人）

Create → 名称+描述 → Create team → 批量输入邮箱（逗号分隔）→ 选 Member/Admin → Add。团队会为该团队在每个成员的 Documents 页增加过滤项。移除：成员可 Leave team；Admin 点自己名字左侧 X（须仍有另一 Admin）；移除他人须 Admin 点其 X。被移除者收邮件，经团队获得的分享被移除，相关文档从其 Documents 消失；个人直接分享保留。删除团队：任一 Admin 随时可删，立即撤销该团队全部分享并移出成员列表。分享权限只有 **View/Edit** 两档（后文组织 Teams 用 Can view/Can edit）。

#### Action Items

- 入口：顶栏 View all Action items 图标；文档内左侧面板图标；Documents 页工具栏 Action items（组织版）；iOS 汉堡菜单 → Action items。
- 文档内面板（仅浏览器）：默认仅当前文档（含在 Action items 页创建并引用该文档的任务）；Create task 图标、Sort tasks（最旧/最新）、Current document 图标取消默认显示全部分配给自己的任务；Search + Type/Status/Assignee 过滤；Add filter 更多过滤、Clear all filters。
- 页面过滤：Type（comment/general/release 任意组合）、Status（open/closed）、Role（assigned to you / created by you）；Add filter；Clear all filters；Search；Sort 默认 **Oldest first**。
- iOS：点顶部过滤类型打开 All filters；Type（comment/general/release 开关）、Status（open/drafted/completed 开关）、Assignee（用户开关）、Add filter、Sort by（Oldest/Newest）。
- 创建任务：Create task 对话框（字段语料未列）→ Save → Assign 关闭并分配；Cancel 放弃。**Standard/Free 可访问 Action items 页并勾选完成，但不能创建任务；创建仅 Professional/Enterprise**。
- 完成：勾选条目左侧复选框。

### 4.3 Company/Classroom/Enterprise Settings

#### 4.3.1 总览与入口

账户菜单 → Company/Classroom/Enterprise settings。可见页签随套餐与权限变化；总览列出 23 个页签（见主题清单 #19）。核心边界：只有 Owner/Admin（课堂为 Educator）可增删订阅用户；Guest 永远看不到 Enterprise settings（菜单项不出现）。

#### 4.3.2 Users（Company / Enterprise / Classroom / EDU）

**席位**：Company Owner 调 “number of users you are paying for” → Update → 确认。信用卡购买可自助加席位；采购订单（PO）需联系 Customer Success/Support。

**Company 角色**：Owner（初始账户；Admin 全部权限 + 付款）、Admin（管理用户/组织详情/属性/组织偏好/发布流程，可访问组织全部文档）、Member（文档归组织）。**不能把新用户直接加为 Admin**：先以 Member 邀请，接受后再改角色。

**Enterprise 用户模型**：
- User type：**Full**（有权限时可编辑、分享、发布）vs **Light**（有权限时仅打开/查看、评论、导出）；EDU Enterprise 恒 Full，无 Light。
- Status：**Member**（计入账单，通常为组织成员，自动在 All enterprise users 团队）vs **Guest**（外部用户，只能访问明确分享的数据，计入账单；**不在也不能被加入 All enterprise users 团队**）。
- 组织信息若要直接共享（非匿名链接），对方必须被加为 Member 或 Guest。

**邀请（Invite users）**：邮箱可用分号 `;` 分隔多个；选择 User type 与 Status；Send invitation。EDU 对话框只允许邀请 Full。
**CSV 添加**：Manage via CSV → Add users with a CSV file → Next → 上传或 Download template → Process → 查看结果 OK。列：`Email`、`Role`（Admin/Member）、`Team`、`Class`、`Class User Type`（educator/student）、`Scheduled Removal Date`、`Make Personal Copies`（yes/no）。Team/Class 可空（只进 Enterprise）；同一用户可多行加入多个 Team/Class；可加入已发布与未发布课堂。结果对话框逐行给成功/失败与原因。
**右键批量**：Users 中选用户 → 右键 → Add to team / Create team → 填参数 → Add/Create。
**Guest 添加路径**：
1. Enterprise settings > Users > Invite Users → 勾选 “This user is a guest and has access only to data that is shared with them.” → Add；
2. 文档 Share → Invite guests 页签 → 邮箱（逗号分隔）→ 选文档权限 → Share → Close；
3. Project 右键 Edit project → 底部 Share 页签 → Invite guests → 同上。
   成为 Guest 后，可直接在 Share 的 Individuals 页签输入其邮箱。

**排序/过滤**：
- 列右键：Sort ascending/descending（First name、Last name、Email、User type、User role、Date added、Last signed in、State；Role 升序 Owner 在上、Member 在下；日期按时间；State 升序 Active 在上、Requested 在下）、Pin column（默认 No pin）、Autosize this/all columns、Choose columns、Reset columns。
- 顶部过滤器：User role（多选）、Date added（Before/After/Between/Equals）、Clear all filters。
- 搜索支持用户名/邮箱的部分匹配（如按 `@ptc.com` 找某域全部用户）。
- 列：Name、User type、User role、Date added、Last signed in 等可排序。

**Edit user**（右键用户名）：
- Documentation name：管理员输入并勾选 override；覆盖值显示在 Release candidate 对话框与 Drawings；用户资料显示覆盖值且不可编辑，并被通知；若用户先前已有 Documentation name，覆盖移除后原值恢复。
- User type：Full ↔ Light。
- Status：Member ↔ Guest。切换为 Guest 时**不发送通知**；移除未显式分享给该用户的文档权限；若该用户被分配到 Permission scheme，则移除其分配与相关权限。Guest 在 Analytics console 中名字旁有 Guest 标签。
- Update 保存。

**Guest 权限边界**：仅显式分享文档；可通过 Project roles 管理其项目权限；可加入团队，但团队若被加入任何 Global permission，Guest 会被过滤掉、权限不生效；不能访问 Enterprise settings；所有用户/访客操作记录在 Activity。Guest 可以进 Approve Releases 全局权限（常见），即使加入 Import files 也无法真正导入。

**移除用户**：右键 Remove user → 阅读“不能再登录该 Enterprise 域”说明 → Remove。EDU 可选 Schedule remove user + 日期；可选 Can make personal copy（在移除前自动获得 Make personal copies 全局权限）。移除后不能登录域、失去全部企业数据访问；活动与分析数据保留，名字旁显示 “(inactive)”。
**CSV 移除**：Manage via CSV → Remove users with a CSV file → Next → Select file / Download template / Download users list；EDU 模板列 `Email`、`Scheduled Removal Date`、`Make Personal Copies`；用户列表列 Email、Name、Role、Type、Guest (y/n)、Date Added；Process → 结果 OK。

**邀请与状态机**：出于安全，Onshape **不允许把既有 Onshape 账户直接加入新 Enterprise**；从未用过 Onshape 的新用户立即加入。由管理员手动添加或使用 SSO 的“Onshape 已知用户”，首次登录不会立即入组，而会收到含 **Join Enterprise** 链接的邮件，点击确认后才能登录；Users 中 State = **Requested**；邀请仅 **48 小时**有效，过期由管理员点 **Re-invite**。配置 Domain verification 后用户自动加入并置 **Active**；Google SSO + 域白名单无需 Domain verification，用户也立即 Active。
**升级**：从 Professional 升级 Enterprise，原 Professional 用户全部迁入 Enterprise。
**Leave classroom**：Educators 与学生均可 Leave classroom；离开后失去直接分享的课堂文档、发布物、文件夹、团队访问权，必须重新登录；重新加入须课堂管理员再次添加。

#### 4.3.3 Teams（组织）与 Aliases

- 组织 Teams 页：Create → 名称+描述 → Create team → 邮箱（逗号分隔）批量加成员 → Member/Admin → Add。成员收加入/移除邮件；可属多个团队。
- 分享语义：**任何用户都可把文档分享给公司自有团队，即使不是团队成员；分享给外部团队则必须是该团队成员**。分享给团队不会让成员获得超出 Share 时授予的权限。团队 Admin 可移除成员（撤销经团队获得的分享，个人分享保留）；成员可自离，但最后一名 Admin 不能自离；团队删除即撤销该团队全部分享。
- 组织差异：Enterprise 中团队只在企业级管理，创建/加人需 **Manage users, teams, and aliases** 全局权限；Professional/Standard 中任何人可建团队。
- 语料矛盾：DESC 说“All team members must be users in the company/classroom/enterprise”，正文说“Team members do not need to be users…”。按正文执行需产品团队裁决。
- Aliases：发布管理的分发表；仅管理员且具 Manage users and teams 全局权限可创建别名、把用户/团队加入别名。详见 Understanding Aliases（本章未展开）。

#### 4.3.4 Global Permissions（企业级权限矩阵）

设置路径：Enterprise settings > Global permissions → 右键某权限 → Manage users → 选用户邮箱/团队 → Add。

| Global permission | 授予能力 | 可见 Enterprise 设置页签 |
|---|---|---|
| Enterprise administrator | 对企业全部资源全权控制 | Users、Teams、Global permissions、Authentication、Project roles、Permission schemes、Custom properties、Preferences、Details |
| Manage users, teams, and aliases | 增删企业用户、查看/修改团队；可在 Member↔Guest 间转换 | Users、Details、Teams |
| Invite guest users | 增删 Guest；不能做 Member↔Guest 转换 | — |
| Manage role based access control | 查看/修改 Project roles 与 Permission schemes | Users、Details |
| Permanently delete | 永久删除 Trash 中资源；删除工作区有警告且不可撤销；分支上有版本则分支保留、可从版本新建工作区 | Users、Details |
| Analytics administrator | 完全控制报表与分析，创建并分享报表 | — |
| Create projects | 创建项目；默认自动包含 All enterprise users 团队，可增删用户/团队（含 Guest） | — |
| Create documents and folders in the Enterprise root | 在企业账户的 Documents 页 company account 过滤器内创建文档/文件夹 | — |
| Create Releases | 创建 Release candidate；默认 All enterprise users，管理员可改 | — |
| Create tasks | 创建任务 | — |
| Approve Releases | 批准/拒绝 Release candidate，可出现在 Approver 字段；可加 Guest | — |
| Allow access to the App Store | 登录 App Store 并订阅应用 | — |
| Allow access to public documents | 在企业账户内查看/打开/复制公共文档 | — |
| Manage non-geometric items | 创建/编辑/删除非几何 Items；Individuals/Teams 两页签添加，x 移除 | — |
| Manage workflows | 发布与调试自定义工作流 | — |
| Enable link sharing | 用匿名只读链接分享给企业外/Onshape 外；Share 对话框多出该选项 | — |
| Transfer documents out of Enterprise | 将文档所有权转出企业（给个人/公司/企业） | — |
| Sync to PLM | 仅 Arena 连接启用时出现；允许同步到 Arena | — |
| Manage standard content and public part metadata | 让非管理员也能编辑标准件与公共零件元数据（管理员本就有） | — |
| Workspace protection permissions | 设置工作区保护控制 | — |
| Import files | 默认 All enterprise users 可导入；管理员可移除并改为个人/团队；覆盖落地页与文档内全部导入入口 | — |
| Use revision tools | 在 Revision tools 页重置已发布对象件号类型 | — |
| Export files | 默认 All enterprise users 可导出；管理员可收窄。Share 对话框中导出权限是 Export/Link 文档权限与 Link sharing “Allow exporting from the link” 的前提 | — |
| Allow access to Onshape Labs | 使用 Labs 实验功能 | — |
| Make personal copies | 把企业文档复制到个人 Onshape 账户 | — |

**Light 用户**可获授：Manage users, teams, and aliases、Invite guest users、Manage role based access control、Analytics administrator、Create tasks、Allow access to public documents、Use revision tools。
**Light 不可获授**：Enterprise administrator、Manage non-geometric items、Transfer documents out of Enterprise；其余权限对 Light 无意义（不能创建/编辑/删除数据）。
**无任何全局权限**的用户只能看到 Users 与 Details 两个页签。

#### 4.3.5 Connections

- 可用性：Enterprise；Government Enterprise 只能连 Government Enterprise；**EDU Enterprise 不可用**；iOS 仅对已加入连接的用户提供 Share 对话框 Connections 页签。
- 创建：Connections → Create connection → 输入对方 **Enterprise ID**（对方 Details 页可见）→ 自动生成名称，可改 → Save；状态 Pending，待对方管理员批准。
- 接受：对方 Connections 页底部邀请 → Approve / Reject → 对话框 Accept/Reject；状态 Pending→Approved。
- 加用户：双方管理员各自打开连接 → Add users → 输入姓名/邮箱 → Add；只有双方各至少 1 人后，这些用户的 Share 对话框出现 Connections 页签。移除：点用户 → Remove → 确认。
- 编辑/删除：仅**创建方管理员**可 Edit connection（名称/描述/复制 Enterprise ID）或 Delete。
- 数据边界：对方企业的 analytics、Where Used、release management 信息不向连接用户显示。文档/文件夹/发布物在工具栏、Share 对话框、Documents 列表 Share details、Comments 面板显示外部连接徽标/横幅：外部用户、外部企业、内容已分享给外部企业三类。
- Share 对话框若含外部连接显示 Connections 横幅。

#### 4.3.6 Authentication

- 2FA：内容与个人 Security 基本逐字重复（启用/二维码/6 位码/5 恢复码/30 天/停用/不支持 Replace）；Government 提醒管理员先确认成员用 SHA-256 应用。
- SSO：仅给出外链 “Configuring integration with identity providers”，本章无字段细节。
- Domain verification：
  - Configure new domain → 输入域名 → Verification type：**HTTP**（文本文件+Web 服务器）或 **DNS**（DNS 提供商 TXT 记录）→ Create → Download file → Close。
  - HTTP：把 .txt 放到域的 `.known-hosts`、`.well-known` 或根目录；DNS：在 DNS 设置创建 TXT 记录。
  - 点溢出菜单 → Validate 验证；左侧开关 Enable/Disable；溢出菜单 Delete 删除；支持多域名并行启用。
  - 效果：域名验证在位时，用户自动加入 Enterprise 并 Active，无需 Join Enterprise；Google SSO + 域白名单免域名验证。

#### 4.3.7 Project roles / Permission schemes

- Project roles：功能角色桶（Designer、Engineer、Reviewer、Vendor 等），创建 Project 时把具体用户放入角色。
- Permission schemes：命名的 Role-Permission set 表；**一个 Project 只引用一个 scheme**；与 Project roles 共同把项目内文档的访问权落实。两页均把详细操作外链到 “Understanding and Administering Project Roles and Permission Schemes”。

#### 4.3.8 Properties / Custom properties

- 可关联对象（9）：Onshape Part、Assembly、Drawing、Part Studio、Document、File、Application、Item、Folder、Project（语料列为 10 项，含 Folder/Project；正文称 “these Onshape objects”）。默认属性有 Onshape 图标，自定义属性有 custom 图标。
- 创建：Create custom property → Name（在组织范围内与现有属性名唯一；唯一性以组织名+属性名判断）→ 可选 Display name（显示名可改，内部 Name 不可改）→ 属性类型 → 发布态 → 属性细节 → 类别 → Create → 确认发布。
- 类型（8）：Text、Boolean、Integer、Double、Date、List、User、Value with units。List 可粘贴/逐项输入值、设显示名（不得与 Value 重复）、拖拽排序、逐项 active/inactive；User 默认值必须是已在该公司的有效 Onshape 用户邮箱。
- 发布态：**Pending**（初始，不可用）→ **Active**（用户可见，输入入数据库）→ **Inactive**（停用；仅 API 可访问）；Active 可再回 Inactive，也可再激活。Active 后不能删除，只能停用。Inactive 属性不出现在任何 Properties 对话框，但仍与对象关联、数据保留。
- 通用属性：Default value（所有类型）、Description（所有类型）、Required、Edit value in version（可选“仅 API 编辑”）、Edit value in workspace（可选“仅 API 编辑”）。默认 Onshape 属性的 Edit value in version/workspace 与部分 Required 不可编辑。
- Value with units 的单位类型：Any、Acceleration、Angle、Angular velocity、Area、Energy、Force、Length、Mass、Moment、Pressure、Time、Volume。
- 校验：Multiline、min/max length、Pattern（Java 正则；示例 `[A-Z]+`、`[0-9]+`、`[a-z]+`、`ONS-[0-9]+`）；非法值给用户报错并说明所需模式。可把前缀放进 Default value。
- Categories 关联：类别须先在 Categories 页由管理员创建；可多选，x 移除。
- 计算属性：Part/Assembly 类别的自定义属性可勾选 **Compute part property** → Select computed part property function → 选文档内 FeatureScript 函数 → Create。计算属性可用于 Part 类别；再建一个属性聚合到 Assembly，用于装配/图纸 BOM。可聚合类型：Boolean、Integer、Double、List、Value with units（单位不能是 Any）。
- 聚合装配属性：给计算属性加 Assembly 类别后出现 **Aggregated assembly properties**；勾选后：
  - 聚合方法：Value with units/Integer/Double → Sum/Minimum/Maximum/Average/Weighted Sum/Weighted Average；Boolean → Any（至少一真）/All（全真）/Not any（至少一真则假）/Not all（全真则假）；List → First/Last（顺序由 List 值拖拽决定）。
  - 聚合属性：同属性；Boolean 还可选 Not revision managed、Exclude from all BOMs。
  - Missing value handling（List 不适用）：Skip aggregation / Treat as zero。
  - Error handling：Skip aggregation / Treat error as zero（List 不可）/ Treat as true/false（Boolean）/ Propagate error。
  - Filter aggregation：选择 boolean 过滤属性（Not revision managed、Exclude from all BOMs 或自定义 boolean）+ Include when true / Exclude when true。
  - 示例：FeatureScript `defineComputedPartProperty` 用密度×体积算 Custom mass，再加 Assembly 类别聚合，BOM Add column 选它。
- 修改：管理员可搜索（id/名称/部分名称，可含 inactive）；列表先 Onshape 元数据再自定义（自定义可 Reorder 拖拽）。Pending 可任意改/删；Active 只能改 Display name、设 Inactive、List 可加值/改显示名/停用旧值；Active 不能删除。Properties 对话框会提示更新错误。Onshape 元数据可停用不可编辑。
- 退休：Publish state → Inactive → Save changes；数据保留、对话框隐藏；可再 Active。

#### 4.3.9 Categories

- 标准类别：Global、Part、Assembly、Drawing、Part Studio、File、Application、Version、Workspace、Item（Scope 列显示适用对象）。
- 创建：Create category → Scope（可空）→ Name → Publish state（Active 可见可用 / Pending 保存不可用 / Inactive 停用）→ Description（可选）→ Parent categories（继承父属性）→ Properties（自定义属性清单）→ Create。新类别会出现在 Advanced search 的 Add criteria 下拉。
- 子类别继承：子类别继承父属性并可加专属属性；示例 “In-house manufacturing” 下建 sheet metal/injection molded/machined/welded。创建时选 Parent category；列表可展开父类别查看，点父子任一行两者高亮；勾 **Hide sub categories in list** 可隐藏子类别展开项。
- 类别与属性联动：Categories 决定属性对话框先展示哪些属性；Properties 页可选类别；导出规则用 Active 类别。

#### 4.3.10 Items

- 先准备 Classification 属性：Properties → 找 Classification → Edit list values → “Add new list values” 每行一个值（值内可含逗号）→ Save changes。
- Create → Item → 元数据：Name、Description（可选）、Category（可替换默认/多选；须先在 Custom properties 中建立类别）、Part number、Revision、State（**In progress、Pending、Released、Obsolete、Rejected、Discarded**）、Vendor、Project、Product line、Unit of measure（**Centimeter、Foot、Inch、Meter、Millimeter、Yard、Gram、Kilogram、Ounce、Pound、Liter、Gallon、Each、Fluid Ounce、Milliliter、Centiliter、Package**）、Publish state（Pending 无人可见 / Active 立即可用 / Inactive 停用）→ Create。
- CSV 导入：表头匹配字段（注意大小写：Name、Description、Part number、Unit of measure 等）；可省略 Status，默认 active；先 Pending 校验再改 Active 覆盖导入。Create > Import CSV → 选文件 → 表格按行红/绿校验，悬停看原因 → Import 生效。
- 导出：Items 列表右上 Export → `.csv`，列 Name、Description、Part number、Unit of measure、Status。

#### 4.3.11 Applications（组织）

- 购买：App Store 内购买/订阅 → 确认页输入 “number of users you are paying for”（含自己）→ 购买 → 输入 Onshape 密码 → 确认对话框 → Close。
- 购后管理：Enterprise settings > Applications 选应用 → 输入席位数 Update（立即生效）→ Add users or teams 输入邮箱/团队名 → Add（必须是组织成员）。给团队授权时若席位不足会阻止加入团队成员；免费应用订阅超席位数会自动加席位；**Light 用户不占应用席位**。点名字旁 X 移除用户/团队权限。
- 其余授权/撤销/逐文档控制同个人 Applications。

#### 4.3.12 Numbering Schemes

- 对象组：**Release objects**（Parts、Assemblies、Drawings、Variable Studios、导入 Files（无论是否翻译））、**Standard content**（ANSI/DIN/ISO/PEM 螺栓/螺钉/螺母/垫圈等；也适用于自定义标准件库，含公司库与个人库）、**Items**（非几何 BOM 项）、**Release names**（新建发布时顺序生成）。
- 方法：
  - **Manual entry**：自填件号；系统阻止重复修订标签/件号（同一件号同修订只能发一次）；不跟踪序列、可跳号。
  - **Sequential part number generation**：按对象类型设 Prefix（可选）、最小长度、Next 起始号；Next 只增不减（跳号/丢弃/拒绝发布也不回退）；不影响既有手填件号；启用后不禁止手填；所有可带件号的属性对话框都有自动生成。
  - **Arena part number generation**：仅 Arena 连接启用时；Arena 生成并回传，用于 Onshape 元数据。
  - **Part number uniqueness（仅 Release objects）**：All part numbers in a release must be unique（不允许零件/装配件号被其图纸复用）/ Drawing can reuse part number from an assembly or part in the release。
  - **Part number propagation（仅 Release objects）**：Never / One workspace（版本只对应一个工作区才传播）/ All workspaces。
- 保存：**Save changes** 只保存当前页签（Release objects / Standard content / Items 各自独立）。
- 传播细节：非配置装配按同内部 id 应用；零件仅当工作区恰有一个该零件时应用；配置 Part Studio/Assembly 仅当版本与工作区配置参数完全一致；Part number 属性仅在**未启用 Release management** 的版本中可编辑；传播发生在发布包第一次状态转换（**Submit**）。

#### 4.3.13 Release Management

- Workflows：Enable managed workflows；Release workflow（Active/Inactive）、Obsoletion workflow；View in document 外链；工作流插图与说明。Enterprise 还区分 Onshape default workflows 与 Custom workflows（企业管理员创建）：列 Active、Workflow、Published date、Published by、Actions（View in document、Unpublish workflow（确认）、Expand 预览）。
- Revision Parts and numbers：
  - Revision scheme：Alphabetical（从 A 起，**跳过 I、O、Q、S、X、Z**）/ Numerical（从 1 起）/ New custom revision scheme（文本文件，每行一个修订，**至少 50 行**；上传后保留在列表，删除前可选；选定不替换既有修订，历史修订不改）。
  - Revision scheme id（自定义工作流需要）。
  - Unreleased revision suffix：默认 `*`，可改为任意字符/串（图纸修订表用）。
  - Revision table template：企业默认模板，可重命名、加/删列、调整列序、要求 Drawings 全大写；Onshape 提供默认表可 Edit → Create。
  - 链接到编号方案设置。
- Access（可多选）：Only administrators can edit properties of released objects / mark objects as not revision-managed / delete documents containing released objects。
- Actions：Require a new revision when an item's properties changed（属性变更后强制新修订；Create Release 对话框蓝字提示；未勾选也提示但措辞不同）。
- Watermarks：Show watermark for unreleased drawings（“In Progress”；发布后移除；作废后 “Obsolete”）；Hide watermark for drawings that are not revision managed；Edit watermarks 可改各阶段文本；**限 64 字符、不支持 Unicode**；Save changes。
- Release conditions（可多选）：Part Studio 特征列表有错误 / 特征列表未滚到末尾 / Assembly 实例列表有错误 / Assembly 有待更新引用 / Drawing 有待更新 / 件号已在另一待处理 Release candidate / 条目有 pending task（可创建候选但 Release 不可用，直到任务处理；未勾选也提示但可发布）/ 条目引用已作废修订。
- Create Release candidate dialog 约束（可多选）：Require an approver（不勾则创建者可跳过候选/审批直接发布）；Do not allow creator as approver；Require approval from all approvers（一人拒绝即整体拒绝；不强制审批人数；不勾则任一审批人可批）；Require a note in the Release dialog（创建者与审批/拒绝者都须写备注）；Restrict approvers to specific users or teams（Professional 在此配置；Enterprise 通过 Approve releases 全局权限）；Allow adding items from other documents；为 Release name/Release notes/Obsoletion names/Obsoletion notes 设显示名。
- Obsoletion：Automatically obsolete previous released revisions（重新发布并获批后旧版自动作废；右键对象页签 > Revision history 查看）。

#### 4.3.14 Task Management

- 入口：Enterprise settings > Task management。Onshape default workflows 选项默认选中，只能 View in document，**不可修改**。
- Custom workflows：Active 勾选/取消；Default 列设企业默认；显示发布信息；外链打开定义文档；Unpublish（确认）；展开预览。完成后 **Save task settings**。

#### 4.3.15 Preferences（组织）

| 区块 | 内容/默认/边界 |
|---|---|
| Enterprise startup page | 企业统一启动页，优先于个人 Preferences。 |
| AI Advisor | 允许用户在 Documents 使用 AI Advisor 面板；该面板**不使用文档数据**，只用 Help/Learning Center/博客等 Onshape 资源回答。 |
| Onshape Labs | 允许实验/POC 功能。 |
| Drawings | 图纸模板（外链 Custom Drawing Templates）、水印（见 Release Management）。 |
| Material libraries | 向用户个人账户提供企业自有材料库。 |
| View only users | 向所有仅有 view 权限的文档用户显示 view-only 工具条；可选 **Always open documents in view-only mode for all Editors, except document creators**。 |
| Documents | 文档名强制 Java 正则：`^.*$` 防重名；`^(?!test).*$` 允许 test 开头重名；`^[0-9]+` 仅数字。启用时已有重名文档会在打开时提示，Onshape 不自动改名。 |
| SSO user auto-provisioning | “Assign auto-provisioned users as Light users”：仅企业管理员可开关；开→SSO 首登用户为 Light，关→Full；管理员可随时改用户类型。 |
| Enterprise custom features and tables | 勾选后 Part Studio 工具栏对所有企业管理员出现 **Add enterprise custom features**；选择文档（Current document/Other documents、FeatureScript samples 过滤、搜索框/URL）→ 选版本（默认最新，可版本图切换）→ 选顶层图标插入全部或单个特征。自定义特征链接到特定版本；用户工具栏按 Link 权限在登录时同步；管理员看到 out-of-date，普通用户不显示；不同版本的特征显示 out-of-sync，Reference manager **Update all** 可把特征更新到工具栏版本（即使该版本更低）；用户可像标准工具一样移动自定义特征，但标准工具不能加入自定义特征所在工具集，反之亦然。Android：Part Studio 特征工具栏 → Add enterprise custom features → 选特征。 |
| Bill of materials | 默认 BOM 模板下拉；Create BOM template（按 BOM Table Templates 步骤 2–6）；Edit（名称、BOM 类型、Property columns、All uppercase in Drawings；已用模板的装配需在 BOM 表重新应用才见改动）；Remove（全组织生效）；Onshape Default 模板不可 Edit/Remove。 |
| Inspection table | 定制所有检验表模板（详见 Inspection Item）。 |
| 组织级 Export rules | 管理员 Add export rule（Scope/Category/Format/Convention）；与个人规则并存：**更具体者优先**；同等具体度时**组织规则优先于用户规则**；文件名中 `\ / * : | > < ? "` 自动替换为 `-`。 |
| Authoring permissions | 管理员授予用户/团队创建、编辑、删除非几何 Items、标准件与公共零件（可进 BOM）；Search users or teams 添加，x 移除，保存。 |
| Property settings | Date type format 下拉 + Save property settings；影响 Export rules、Drawing Notes/Callouts/表格单元文本、Search filters、Part/Assembly/Property 对话框、属性创建页。默认格式随个人 Language。 |

**Date type 与 Drawings**：默认/非组织用户时，图纸标注/注释/表格日期格式取决于图纸模板标准——ANSI 模板 `MM/DD/YYYY`，ISO 模板 `YYYY-MM-DD`；管理员改为非 Default 后，新插入与既有标注（含已发布图纸）都用新设置；标注内不能单独改日期格式。
**Date type 与 Export rules**：组织用户用管理员设置；非组织用户恒 `YYYY-MM-DD`；格式中的 `/`、`,`、`.` 在文件名中替换为 `-`。

#### 4.3.16 Revision Tools

- 访问：管理员或被授 **Use revision tools** 全局权限者。
- 流程：Reset part number type 区输入 Part number → 选 Object type（parts、assemblies、blob elements、drawings）→ Find revisions → 列出匹配修订 → Reset part number type → 对话框再次确认。
- 结果：该件号旧类型的所有修订置为 Obsolete，件号可在新类型下重新发布；重用时 Create Release candidate 对话框给警告（示例 PRT-001 由零件改为装配）。

#### 4.3.17 Integrations / Webhooks

**Integrations（Enterprise 管理员）**
- Cloud storage：Allow all integrations（Altium 365、Dropbox、Google Drive、Microsoft OneDrive）/ Allow selected integrations / Do not allow integrations；用户范围：All users / Selected users and teams。
- Slack：Add to Slack → 输入 Onshape API access key 与 secret → Connect → 安装 Onshape app → 选 Workspace → 审阅权限 → Install Onshape → 成功后 Finish；页面显示连接创建日期与 Remove。
- 用户侧：`/onshape connect` → User OAuth Connection → Connect → Authorize application → Finish；`/onshape disconnect` 断开。命令：`/onshape list`（最近 20 文档）、`/onshape tasks`（最近 10 任务）、`/onshape help`、`/onshape connect`、`/onshape disconnect`。
- 通知：被提及/指派评论、评论被回复；Release 中被加为 Observer/Approver 或状态更新。即使未完成 OAuth 连接/已断开也会收到通知；要在 Slack 内直接回复评论须先 `/onshape connect`。

**Webhooks**
- 作用：校验数据访问完整性，确认通知来自 Onshape 且未被篡改。
- 设置：启用 webhook basic authentication → 所有请求带 Authorization 头；Webhook signatures → Generate primary/secondary keys（可轮换，任一匹配即接受）、Copy to clipboard、Reset、Save changes。
- 必须使用 **HTTPS** 目标（数据本身不加密）。
- 公式：`Signature = Base64<HMAC256-digest<<timestamp header value>.<webhook payload>>>`。
- 头：`X-onshape-webhook-timestamp`、`X-onshape-webhook-signature-primary`（配置了主密钥时）、`X-onshape-webhook-signature-secondary`（配置了备密钥时）。
- 附 Java/Node.js 校验样例（`timestamp + "." + messageBody`，HmacSHA256，Base64 比较）。

#### 4.3.18 Developer（组织）

- 适用：Enterprise/Professional 管理员；应用计入组织 API Limits；个人 Developer Portal 应用计入个人 Limits。
- 与个人相同：API key 形态、TTL、secret 只显示一次、组织账户 API key 不限量、org stack 绑定、OAuth 应用/扩展/商店条目/scope、状态流转与转移所有权。
- 组织差异：
  - 创建 API key 时必须 **Assign the API key to someone in the company**（User 字段按姓名/邮箱搜索）；创建成功与将到期均邮件通知该用户。
  - 删除 key 对所有用户生效，不可撤销。
  - 可把应用分享给用户、别名、团队；在 **Applications** 页选应用 → Add users or teams（创建者自动在 Users 列表）→ Add；**Light 用户不能加入应用**；Remove 列 x 移除。
  - API 用量按组织看，25/50/75/100% 邮件告警；Annual API limits for 下拉可切换组织。
  - 内部测试用户被加入后自动在 UI 看到扩展，无需 App Store 订阅。

#### 4.3.19 Arena / Job Queue / Details

**Arena**
- 连接配置：Save Arena settings；Enable Onshape Arena connection；Arena Workspace ID（Arena 内部 ID，非显示名）；Arena Workspace Name（连接成功后回填）；API Web Token（Arena 支持提供，绑定一个不用于 Arena UI 登录的 Arena 用户 ID）；Arena API URL（Arena 支持提供）。
- General Sync：
  - Require category mapping for sync（勾选→未映射类别不同步；不勾→进 Arena “uncategorized”）。
  - Upload 3d thumbnails（GLTF/PVZ 缩略图）。
  - Sync items：不勾不同步；勾选后 Sync only quantities（首次 BOM 同步发全部属性，之后只更新数量）/ Sync all（全元数据更新）。
  - Sync standard content：同一逻辑；自定义标准件仅当库文档归公司/企业所有时同步；Enterprise 中个人与公司标准件库文档均属企业所有。
  - Sync Onshape release management with Arena changes（Release candidate/零件/装配/图纸与打开的 Arena Change 同步；Arena 驱动审批，批准后回传 Onshape 批准候选）。
  - Arena approver documentation name（Arena 同步发布候选与 Approver 字段显示名）。
  - Match release candidate name with Arena change（勾选→选 Arena Change 后自动填 Release name 且只读；不勾→手填）。
  - Sync release notes with Arena properties（勾选→Arena Change Title 自动进 Release notes，可编辑；不勾→手填）。
  - Sync Onshape revision to Arena。
  - Sync is enabled / disabled；Disable sync 开关可临时关闭（验证配置而不实际同步）。
- Mappings：Refresh mappings、Search table、Show unmapped categories、Only show mappings with errors；Delete 在未选类别/子类别已映射/未映射/类别 inactive 时禁用；Arena category（Sync enabled 时从 Arena 读取）、Onshape category（未映射显示 Not Mapped）、Mapping（消息或铅笔图标编辑）。

**Job Queue**
- 表列：Job ID、Type（BOM sync / Release candidate sync，可按类型显示/隐藏）、Creator、Date submitted、State（Completed/Failed/Pending/Started；Completed 默认不显示，可按状态筛选）。
- 详情：Reference（零件/装配件号）、Status、Message（如 Item sync failed）、Errors（仅失败，逐条解释）；管理员 Remove 从队列移除。

**Details**
- Logo Change/Remove；Company/Enterprise name；Company/Enterprise id（唯一，Connections 需要）；Description；Street address、City、State、Zip code、Country。

## 5. 工作流、规则与错误状态

### 5.1 个人账户生命周期

1. 注册 → Profile 自动记录姓/名；上传头像、设昵称/Bio/Documentation Name → Update profile。
2. 邮箱：最多 3 个；新增须验证；主邮箱可切换；邮箱不可跨账户复用。
3. 安全：改密码（旧+新+确认，规则逐项满足）；建议 2FA；保存 5 个恢复码；换设备需先 Disable 再 Enable。
4. 通知与偏好：语言保存即登出；主题/单位/鼠标/像素密度/快捷键/快捷工具栏均可保存；暗色会话级 vs 持久暗色。
5. 应用与集成：App Store 购买 → 文档 Plus > Add application → 授权；个人 Integrations 绑云盘；个人 Developer 建 OAuth/API key。
6. 订阅/付款：Owner 改卡；有订阅关联的卡不能删；付款历史可开发票。

**错误/边界**：个人 API key 超过 2 个需先删；API key 只在同一 stack 有效；TTL 到期邮件提醒；应用 secret 只显示一次，丢失只能重生成；2FA 恢复码丢失且手机丢失时 Onshape 无法恢复；不支持 Replace 2FA；暗色不支持 Drawings/PCB Studio/Enterprise analytics 主视区。

### 5.2 组织成员生命周期

1. Owner/Admin 购买/加席位 → 邀请成员（邮箱/CSV/右键加团队）或 Guest（三入口）。
2. 新 Onshape 用户立即加入；已知用户须点 Join Enterprise 邮件链接（State=Requested），邀请 48h 有效，可 Re-invite；域名验证/Google SSO 白名单 → 自动 Active。
3. 设 User type（Full/Light）、Status（Member/Guest）、角色（Member→Admin 可后改；不能新增即 Admin）。
4. 日常：团队/项目角色/权限方案/全局权限；Guest 仅显式分享，不能进 Enterprise settings，不能被加入 All enterprise users。
5. 移除：立即不能登录并失去企业数据访问，但活动/分析数据保留、显示 (inactive)；EDU 可计划移除并允许个人副本。

**错误/边界**：
- 不能把既有 Onshape 账户直接加入新 Enterprise（须 Join 流程）。
- 邀请 48h 过期需 Re-invite。
- Guest 切换无通知、撤销未显式分享权限、移除 Permission scheme 分配。
- 无全局权限用户只有 Users/Details 页签。
- Light 用户不能加入应用；Light 不计应用席位。
- 应用用户/团队必须是组织成员；席位不足阻止加团队成员；免费应用超限自动加席位。
- 团队至少 1 Admin；删除团队/移除成员会撤销经团队分享；个人直享保留。
- 团队加人时若成员不足，先加席位。
- 文档重名正则只提示不改名。

### 5.3 发布/编号流程

1. 管理员在 Numbering schemes 选 Manual/Sequential/Arena，设唯一性与传播。
2. Release Management 启用 managed workflows，选修订方案（字母/数字/自定义≥50 行）、未发布后缀、修订表模板、水印、访问限制、Actions、发布条件与候选对话框必填项。
3. 用户创建 Release candidate → 满足条件（无特征错误、滚到末尾、无待更新、件号不冲突、无 pending task、无 obsolete 引用）→ 填 Approver/备注（按管理员配置）→ Submit；件号传播发生在 **Submit**。
4. 审批（全部/任一、创建者是否可批、审批人白名单）→ 发布；重复发布可自动作废旧修订；水印从 “In Progress” 移除、作废时 “Obsolete”。
5. Revision tools 可把件号旧类型全部置 Obsolete，允许跨类型复用；重用时给警告。
6. 发布/任务/Action items 联动：发布任务、审批委托（不可再委托）、Job queue 记录 Arena 同步。

**错误/边界**：自定义修订方案文件 <50 行不可用；水印 >64 字符/含 Unicode 不支持；字母方案禁用 I,O,Q,S,X,Z；顺序件号不回退；手填不许重复修订标签/件号；Part number 在启用 Release management 的版本中不可编辑；配置参数变化导致件号不传播；Arena 类别未映射且要求映射时不同步。

### 5.4 属性/类别/Items 数据治理流程

- 定义属性（Name 唯一、Display name、类型、默认值、必填、版本/工作区可编辑、校验、类别）→ Pending 审核 → Active 发布（全组织可见）→ 可 Inactive 退休（数据保留）；
- 定义类别（Scope、Parent、Properties）→ Active 后出现在属性对话框与高级搜索；
- 定义 Items（含类别、状态、单位）→ CSV 导入先 Pending 校验后 Active 覆盖；
- 在 BOM/Drawings 中通过聚合属性与 Add column 展示；导出规则引用 Active 属性/类别。

**错误/边界**：Active 属性不能删除，只能停用；Onshape 元数据不可编辑只能停用；List 显示名不能与 Value 重复；User 默认值必须为公司内有效用户；Pattern 不匹配报错；类别 Pending/Inactive 不能用于导出规则；只允许每类别一条导出规则。

### 5.5 集成/开发者/安全配置流程

- OAuth 应用：注册（redirect 必须 HTTPS，桌面例外）→ 生成 client id/secret（只显示一次）→ 建扩展（每应用一个 element tab）→ 建商店条目（默认私有、Team Visibility）→ 内部用户测试（Light 不可）→ 提交 App Store（OAuth2 + Launch Checklist）→ Active → Deprecated → Trashed（所有付费订阅到期）→ Deleted（不可撤销）。
- API key：创建（name/权限/TTL/接收人）→ 复制密钥（只显示一次）→ 使用（仅限同一 stack，仅代表用户）→ 删除（不可撤销）；不能跨账户/层级迁移。
- Webhook：HTTPS 端点 → 生成 primary/secondary → 保存 → 校验 `timestamp.payload` HMAC-SHA256 Base64；主/备任一匹配；轮换不中断。
- 连接：A Enterprise ID 创建 → B Approve → 双方 Add users → Share Connections 页签出现 → 任一方 Remove 用户/创建者 Delete。
- 域名验证：HTTP/DNS → Validate → Enable；多域名；验证后自动 Active。

## 6. 与其他章节的关系

本章是“账户/组织治理”章节，向以下 Help 主题外链或依赖，构成上游约束与下游消费：

- **协作与文档**：Share Documents（分享、Share 对话框 Individuals/Application/Invite guests/Connections 页签、Export/Link 权限、匿名链接）、Projects（项目创建/编辑、Invite guests）、Comments（Action items 来源）、In-app notifications（与 Email/Mobile 分离）、View Only Mode / Using the View Only Toolbar、Making personal copies of documents。
- **数据与元数据**：Properties (Metadata)、Bill of Materials（BOM 表模板/Add column）、Customizing Parts: Materials、Categories（Advanced search）、Items/Inspection Item、Revision Table、Custom Drawing Templates、Creating computed properties。
- **发布管理**：Setting up Release management、Creating a Customized Release Workflow、Understanding Release Management、Release Management FAQ、Release Management for Administrators、Unpublishing a workflow、Editing properties of released objects、Marking objects as not revision-managed、Reverting items to their last revision、Sync Onshape revision to Arena、Syncing a BOM、The Onshape Arena Connection、Configuring Arena and Onshape。
- **开发者/API**：Developer Docs（OAuth2、Supported Locations and Contexts、Action URL parameters）、API Guide: Authentication、API Limits、Glassworks API Explorer、Sample Code、Hello World、App Store / App Store FAQs、Launch Checklist。
- **身份与安全**：Configuring Integration with Identity Providers（SSO）、2FA with Government (US) Subscriptions、Creating a domain verification（本章内）。
- **企业入门**：Getting Started as an Enterprise Administrator、Getting Started as a Light User、Sharing outside an Enterprise、Understanding Teams、Understanding Aliases、Understanding and Administering Project Roles and Permission Schemes。
- **平台 UI 基础**：Keyboard shortcuts、View Navigation（触控笔）、Documents page 过滤/高级搜索、Analytics console（Guest 标签、（inactive））、Activity 区。
- **上游/下游关系**：个人账户 → 组织成员与角色 → 项目/权限方案 → 文档分享与发布；组织偏好/属性/类别/编号/发布设置 → 文档属性对话框、BOM、图纸、导出文件名；组织集成/Webhooks/Developer → 外部系统与自动化；Action items ← Comments/Release 审批；Inactive policy 是账户生命周期的最终治理规则。

## 7. 对 LubanCAD 的可执行启示

> 仅写文档可支撑的结论；`[文档明确]` 指语料直接写明；`[推断]` 指为 LubanCAD 落地做的合理映射。

### 7.1 需要补齐的 UI 表面（按优先级）

| 表面 | 最小内容 | 依据 |
|---|---|---|
| 顶栏账户菜单 | My account / Action items / View support tickets / App Store dev portal / Switch to… / 组织设置 / Dark mode 切换 / Sign out；Dark mode 需有“会话级 vs 持久”区别并在 Preferences 持久化 | [文档明确] |
| My account 左侧导航 | Profile、Emails、Preferences、Notifications、Security、Devices、Applications、Integrations、Developer、Early visibility、Subscription、Payment options、Payment history、Teams；带 Return to document | [文档明确] |
| Profile 表单 | Name、Username、Nickname、Bio、Documentation Name、头像上传、Update profile；管理员覆盖入口 | [文档明确] |
| Emails | 3 个邮箱槽、primary 单选、验证状态、x 删除、未验证提示 | [文档明确] |
| Preferences 全部分区 | 语言/主题/小数分隔符/启动页/单位与精度/鼠标/设备像素密度/Part 与 Assembly 列表属性/快捷键/快捷工具栏/工具栏重置/Drawings 背景/材料库/导出规则/发布审批委托/Onshape Labs | [文档明确] |
| Notifications | Email/Mobile 两段各三档单选 + 独立保存 | [文档明确] |
| Security | 改密码实时规则清单；2FA 启用/停用/恢复码管理；设备记忆 30 天 | [文档明确] |
| Devices / Applications / Integrations | 设备 Forget；应用授权/撤销/逐文档开关；Dropbox/Drive/OneDrive/Altium 连接 | [文档明确] |
| Developer（个人/组织） | OAuth 应用列表与详情页签、API keys 列表/创建（TTL）/删除、用量告警、扩展表单、商店条目表单、权限 scope 勾选 | [文档明确] |
| Action Items | 文档内面板（当前文档/排序/过滤）+ 全量页（Type/Status/Role 过滤、搜索、排序）；iOS 过滤对话框；Create task 权限门 | [文档明确] |
| 组织设置 23 页签 | 见 4.3 各节；左侧导航必须按角色/全局权限动态裁剪 | [文档明确] |
| Users 列表 | 列排序/固定/自适应/选择列/重置、角色与日期过滤、搜索、右键 Add to team/Create team/Edit user/Remove user、Invite users、Manage via CSV | [文档明确] |
| Global permissions 页 | 24 项权限列表、右键 Manage users、Individuals/Teams 页签、x 移除 | [文档明确] |
| 组织 Properties/Categories/Items | 属性编辑器（8 类型/发布态/校验/计算/聚合）、类别树与继承、Items 表单与 CSV 红绿校验 | [文档明确] |
| Numbering / Release / Task / Revision Tools | 编号方案页、发布工作流页（修订方案/水印/条件/候选对话框）、任务工作流页、件号类型重置页 | [文档明确] |
| Integrations/Webhooks | 云存储三档 + 用户范围；Slack 连接；Webhook 主备密钥/签名说明 | [文档明确] |
| Connections | 创建（Enterprise ID）/批准/加用户/编辑/删除/外部徽标与横幅 | [文档明确] |
| Organization Details | Logo/名称/ID/描述/地址 | [文档明确] |

### 7.2 参数与默认值清单（可直接做实现/测试基线）

- Emails：最多 **3**；2FA 恢复码 **5** 个；记住设备 **30 天**；邀请有效期 **48 小时**。
- 单位默认：**inch、degree、pound、3 位小数**；仅新文档生效；小数位仅浏览器、仅显示不计算。
- 像素密度：**Automatic（默认）** / On / Off。
- 通知：两段各 3 档，默认选项语料未写明（文档未说明）。
- API key：个人上限 **2**；TTL 可选；用量告警 **25/50/75/100%**。
- 编号：字母修订从 A 起跳过 **I,O,Q,S,X,Z**；数字从 **1** 起；自定义修订文件 **≥50 行**；未发布后缀默认 **`*`**；水印上限 **64 字符**、不支持 Unicode；默认水印 “In Progress”、作废 “Obsolete”。
- 件号传播：**Never / One workspace / All workspaces**；唯一性两选项；传播时机 **Submit**。
- 团队：至少 **1 名 Admin**；分享权限 View/Edit（组织文案为 Can view/Can edit）。
- 属性：8 类型；发布态 **Pending/Active/Inactive**；Active 不可删；List 显示名不得等于 Value；单位类型 13 项（Any…Volume）。
- 类别标准集：**Global, Part, Assembly, Drawing, Part Studio, File, Application, Version, Workspace, Item**。
- Items：6 个状态（In progress/Pending/Released/Obsolete/Rejected/Discarded）；17 个计量单位。
- 连接：Government 只能连 Government；EDU 不可用；双方各至少 1 用户才出现 Share 页签。
- 非活跃账户：**4 年**判定、**4.5 年**删除、**4 封**预警（6 个月/1 个月/1 周/1 天）；付费活跃计划豁免。
- 导出文件名非法字符：`\ / * : | > < ? "` → `-`；组织规则同具体度优先于用户规则。
- 日期格式：English `MM/DD/YYYY`；法/德/意/西 `DD/MM/YYYY`；中日韩 `YYYY/MM/DD`；图纸默认 ANSI `MM/DD/YYYY`、ISO `YYYY-MM-DD`；非组织导出恒 `YYYY-MM-DD`。

### 7.3 交互与选择规则

- 新增成员不能直接设 Admin，须先 Member 后改；Guest 三入口（Users / Share / Project）。
- Guest 切换为 Member 或反向：仅具备 Manage users, teams, and aliases 全局权限者可做；切换为 Guest 时静默撤销未显式分享与权限方案分配。
- 团队：任何组织成员可分享给公司团队；外部团队须为成员；最后一名团队 Admin 不能自离；删除团队即撤销全部分享。
- 连接：创建管理员专属编辑/删除权；双方管理员各自管自己一侧用户。
- 应用：组织用户/团队必须是成员；Light 用户不可被加入应用且不占席位；免费应用超席自动加席位。
- 权限页签裁剪：无全局权限 → 仅 Users/Details；不同全局权限 → 特定页签集合（见 4.3.4 表）。
- 文档名正则：只提示、不自动改名。

### 7.4 事务/撤销/版本/权限/协作约束

- [文档明确] 组织级配置（属性、类别、编号、发布、偏好、权限）均由管理员集中修改，变更作用于全组织；属性 Active 后不可删除，只能 Inactive，数据保留并可再激活。
- [文档明确] Release candidate 的 Submit/Approve 是权限与条件门控的多步流程；自动作废旧修订、修订历史可追溯；水印随状态变化。
- [文档明确] Connections 是跨企业受控数据边界：仅连接用户可见，对方 analytics/Where Used/release 信息不可见；跨企业分享有显著徽标。
- [文档明确] Guest 永远不能进入组织设置；All enterprise users 不含 Guest；Global permission 对 Guest 可授但团队途径会被过滤。
- [文档明确] 删除用户后活动/分析数据保留并标 (inactive)；文档与数据访问立即撤销。
- [文档明确] 非活跃账户删除不可恢复，公司文档仅在被他人文档引用时保留。
- [推断] LubanCAD 若以 iModel/BIS 为底座，账户/组织/角色/权限属于平台层，不应写入模型 schema；应以服务端权威数据 + 前端动态裁剪实现，避免把“页签可见性”仅做前端隐藏（文档中的权限语义要求服务端强制）。
- [推断] 发布管理/编号/属性属于“组织级策略”，可映射为工作区/文档元数据策略服务；所有变更应走审计（Activity）以满足文档中的可追溯叙事。

### 7.5 可写成测试断言的验收点

1. 个人邮箱上限 3；新增邮箱未验证不可作 primary；已绑定邮箱再注册被拒。
2. 改语言保存后自动登出；重登后界面语言变化。
3. 小数逗号模式下表达式数组必须带空格（`[1, 4, 9, 16][#i]` 通过、`[1,4,9,16][#i]` 失败或告警）。
4. 单位偏好只影响新文档，旧文档不变；字段输入 `10mm` 自动换算；小数位设置不改变计算值。
5. 2FA 恢复码 5 个、一次性；重新生成使旧码全失效；不支持 Replace 2FA；Gov 下 SHA-1 应用被拒并提示 SHA-256。
6. API key 个人第 3 个被拒；secret 只显示一次；跨 stack 使用失败；删除需确认且不可撤销。
7. Action Items：Standard/Free 可勾选完成但不能创建任务；文档内面板默认仅当前文档；默认排序 Oldest first。
8. 新用户不能直接加为 Admin；Member 接受邀请后可改 Admin。
9. 邀请 48h 过期显示 Requested 且 Re-invite 后恢复；域名验证后新用户自动 Active。
10. Guest 不出现在 All enterprise users；Guest 无法打开 Enterprise settings；Guest 被加入含 Global permission 的团队后权限不生效。
11. 团队至少 1 Admin：最后一名 Admin 自离被拒；删除团队后成员 Documents 中该团队分享文档消失、个人直享仍在。
12. 无全局权限用户仅见 Users/Details；Enterprise administrator 见 9 个页签；Manage users, teams, and aliases 见 Users/Details/Teams。
13. Light 用户可获授 7 项白名单权限；Enterprise administrator / Manage non-geometric items / Transfer documents out 对其不可授。
14. Connections：Gov 连非 Gov 被拒；EDU 无入口；双方各 0 用户时 Share 无 Connections 页签；非创建管理员无 Edit/Delete。
15. 属性：Pending 不可用于导出规则；Active 不可删除；Inactive 不在 Properties 对话框但 API 可读；Pattern 不匹配报错；User 默认值非公司用户被拒。
16. 类别：子类别继承父属性；父类别新增属性后子类别可见；Hide sub categories 生效。
17. Items：CSV 单位必须匹配 17 项之一；status 省略默认 active；红/绿校验与 Import 按钮门控。
18. Numbering：手填重复件号+修订被拒；顺序 Next 跳号后不回退；配置参数变化导致件号不传播；传播发生在 Submit。
19. Release：字母方案跳过 I,O,Q,S,X,Z；自定义方案 <50 行不可保存/选用；水印 65 字符被拒、Unicode 不支持；8 项 Release conditions 任一命中时按配置阻止或仅提示；Require approval from all approvers 时一人拒绝即整体拒绝。
20. 组织导出规则与个人规则冲突：更具体者胜；同等具体度组织胜；非法字符替换 `-`。
21. Webhook：主或备任一签名匹配即通过；缺 timestamp/签名头失败；HTTP 端点应被拒绝（文档要求 HTTPS）。
22. Inactive policy：4 年未登录进入非活跃；4.5 年删除；删除前第 6/1 月、1 周、1 天共 4 封邮件。

### 7.6 文档未说明/需产品裁决的点

- 各页面的套餐徽标被抽取丢失，Professional vs Educator vs Classroom 的精确页签矩阵不完整。
- Payment history / My Account Teams 被排除的具体套餐（徽标缺失）。
- 团队成员是否必须是组织用户（DESC 与正文矛盾）。
- Action Items 的 Create task 对话框具体字段。
- SSO 配置细节（仅外链，无字段）。
- 组织级“AI Advisor 不使用文档数据”的实现边界（仅一句声明）。
- 默认通知档位、默认 BOM 模板字段、Inspection table 字段（外链未含）。
- Arena 的 Arena 侧配置步骤（外链）。
