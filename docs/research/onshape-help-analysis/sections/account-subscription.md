# Onshape Help 章节分析报告：订阅与账户管理

## 1. 本章概览

- **主题数**：50（组文件 `account-subscription.txt`，全部逐篇读取）。
- **总词数**：60,952 英文词。
- **覆盖子域**：
  1. 账户与订阅总览、登录/注册、密码与账户删除；
  2. 订阅与支付 FAQ；
  3. 个人订阅层级：Free、Standard、Professional、Professional Trial、Student；
  4. 教育版：Educator、EDU Enterprise、Classes/Assignments、EDU 仪表板；
  5. 企业版：Enterprise、Light user、企业管理员、项目/角色/权限方案、Teams/Aliases；
  6. 企业身份：2FA、SAML/OIDC 式 SSO（Okta、OneLogin、Google、Microsoft Entra ID、ADFS、PingOne、ClassLink、自定义 SAML 2.0）；
  7. 企业发布管理：自定义 Release/Obsoletion Workflow 的 JSON、发布/调试/审计；
  8. 企业监控与分析：Activity、Action items、Analytics 仪表板与定时报表；
  9. 政府版：Onshape Government (US)。
- **文档更新日期**：语料未提供任何主题的更新时间戳或版本号，无法给出日期。
- **整体质量/抽取限制**：
  - 语料由 HTML 抽取，图片仅剩 `[image: alt]`，本组大量步骤依赖截图；纯截图步骤的精确按钮位置、图标样式无法还原。
  - 多个订阅页重复同一段 “Accessing the Account menu” 样板文字，已去重归纳，不逐页复述。
  - 表格被压平成 `|` 分隔文本（如用户/权限矩阵、默认权限方案），本报告按单元格语义重建，但不保证原始列宽/合并。
  - 少数页面存在抽取/编辑噪音：如 Free 页 “his topic”、若干空标题、`Available for` 后为空（对应图片丢失）、若干 `|` 断行。报告中不据此臆造。
  - 价格大多只给外链 `https://www.onshape.com/en/pricing`，语料不含价目表；唯一具体价格出现在 Standard 主题的 DESC 元数据：“billed per user (at an annual rate of $1,500)”，正文仍指向 pricing 页。
  - 部分主题是仪表板字段清单，业务规则少；本报告保留字段级信息，但不把字段当交互流程。

## 2. 主题清单与逐篇摘要

> URL 均为语料中的站内相对路径。摘要以文档明确写出的能力/对象/操作为准。

### 2.1 账户、支付与个人订阅

| 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|
| Managing Your Onshape Account And Subscription | Managing Your Onshape Account and Subscription | /Content/Plans/managing_your_onshape_account_and_subscription.htm | 总览 Enterprise/Professional/Standard/Educator/Student/Free 六类订阅；说明 Account 菜单、注册/登录、多账户切换、密码策略（含 HaveIBeenPwned 校验），以及 Company/Classroom/Enterprise 是独立受管环境。 |
| Subscriptions and Payment FAQs | Managing Your Onshape Account and Subscription > Subscriptions and Payment FAQs | /Content/Plans/subscriptions_and_payment_faqs.htm | 回答价格、Professional 试用、Pro/Free/Standard 差异、信用卡是否存储、扣款时点、拒付处理、取消与退款、文档归属，以及多用户集中付费。 |
| Free Account | Managing Your Onshape Account and Subscription > Free Subscription | /Content/Plans/managing_your_onshape_free_account.htm | Free 无时限、无需信用卡、只能创建公开文档；可从 Free 升级 Standard/Professional/EDU，申请 Professional Trial；说明账户删除及四年不活跃自动删除。 |
| Student Subscription | Managing Your Onshape Account and Subscription > Student Subscription | /Content/Plans/managing_your_onshape_student_subscription.htm | Student 面向 13 岁以上、 accredited 院校的学位/证书学生，工作环境等同 Standard，按年续期；说明续期表单、降级 Free 后私有文档只读、EDU badge 永久跟随文档、账户删除。 |
| Standard Subscription | Managing Your Onshape Account and Subscription > Standard Subscription | /Content/Plans/managing_your_onshape_standard_subscription.htm | Standard 面向单专业用户，缺少发布管理、公司级自定义属性/材料库/共享与合并计费；可升级 Professional/Enterprise，取消需联系 Onshape；DESC 写明按用户年费 $1,500。 |
| Managing Your Onshape Professional Trial | Managing Your Onshape Account and Subscription > Professional Trial | /Content/Plans/managing_your_onshape_professional_trial.htm | 从 Free/Standard 申请 14 天 Professional Trial，创建公司并显示剩余天数横幅；试用结束可升级 Professional，或降级 Standard/Free；降 Free 会永久删除公司，公司文档转给 owner。 |
| Professional Subscription | Managing Your Onshape Account and Subscription > Professional Subscription | /Content/Plans/managing_your_onshape_professional_subscription.htm | Professional 是公司订阅：合并计费、公司拥有文档、Owner/Admin/Member 角色、公司级共享；含 release management 与自定义元数据；说明升级 Enterprise 的数据迁移、取消/降级规则。 |

### 2.2 教育版（Educator / EDU Enterprise）

| 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|
| Managing Your Onshape Educator Subscription | Managing Your Onshape Account and Subscription > Educator/EDU Enterprise Subscription | /Content/Plans/managing_your_onshape_educator_subscription.htm | Educator 面向教育机构在职教育者/导师/志愿者，含 Classes & Assignments、Simulation 等；EDU Enterprise 为机构级独立域名、管理员与分析能力；含升级迁移、全局权限、Teams、CSV 批量加人、转出文档。 |
| Educator Concepts and Terminology | … > Educator/EDU Enterprise Subscription > Educator/EDU Enterprise Concepts and Terminology | /Content/Plans/educator_concepts_and_terminology.htm | 定义 Assignment、Class、Classroom、Educator、Enterprise、Permissions、Publish and close、Scheduled remove user、Student、Submissions，是教育版对象模型的基础。 |
| Educator Interface | … > Educator/EDU Enterprise Subscription > Educator/EDU Enterprise Interface | /Content/Plans/educator_interface.htm | 说明 Educators 与 Students 的 Documents/Classes/Assignments 界面差异、Preview as student、Start/Submit assignment，以及个人副本（含 iOS/Android）与数量限制。 |
| Educator Classes | … > Educator/EDU Enterprise Subscription > Educator/EDU Enterprise Classes | /Content/Plans/educator_classes.htm | 创建班级、邀请/CSV 导入学生与教育者、发布/取消发布/归档/克隆/删除班级、查看班级仪表板、移除成员；给出班级右键菜单全项。 |
| Educator Assignments | … > Educator/EDU Enterprise Subscription > Educator/EDU Enterprise Assignments | /Content/Plans/educator_assignments.htm | 创建/排期/克隆作业，三种开始方式（新文档、复制指定文档、学生自选提交），文档共享限制，Publish/Close，审阅提交并用 Graded/Needs revision 流转，CSV 导出 Activity。 |
| EDU Enterprise Dashboards | … > Educator/EDU Enterprise Subscription > EDU Enterprise Dashboards | /Content/Plans/edu_enterprise_dashboards.htm | EDU Enterprise 的 Document/Class/Student 三类仪表板：建模时长、文档动作、Tab 类型、访问地图、班级成员/作业/提交/活跃学生、学生功能使用等。 |

### 2.3 企业版基础、管理员与权限

| 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|
| Enterprise Subscription | Managing Your Onshape Account and Subscription > Enterprise Subscription | /Content/Plans/managing_your_onshape_enterprise_subscription.htm | Enterprise 是带独立域名、合并计费、多用户的企业订阅；成员同时拥有个人账户；主区域为 Activity/Documents/Analytics；取消后全员降 Free，公司文档仅原管理员可访问。 |
| Getting Started as an Enterprise User | … > Enterprise Subscription > Getting Started as an Enterprise User | /Content/Plans/getting_started_as_an_enterprise_user.htm | 企业普通用户指南：登录、将私有文档转给企业、企业域内文档归企业所有、使用 Activity/Documents/Action items/Analytics，以及个人设置入口。 |
| Getting Started as a Light User | … > Enterprise Subscription > Getting Started as a Light User | /Content/Plans/getting_started_as_a_light_user.htm | Light user 使用裁剪版 View only toolbar（最多 18 个工具）查看/评论/导出/测量/任务/关注他人；不可分享；说明文档 Tab 九类、搜索、右键菜单与发布审批通知入口。 |
| Getting Started as an Enterprise Administrator | … > Enterprise Subscription > Getting Started as an Enterprise Admin | /Content/Plans/getting_started_as_an_enterprise_administrator.htm | 企业管理员两步上手：添加用户、创建 Project；给出 Full/Light × Member/Guest 四象限能力矩阵；移动端不能添加用户。 |
| Two-factor Authentication for Enterprise | … > Getting Started as an Enterprise Admin > Two-factor Authentication for Enterprise | /Content/Plans/two_factor_authentication_for_enterprise.htm | 管理员可在 Company/Enterprise settings > Authentication 强制成员启用 2FA，并可与 SSO 配合；文档建议全站启用 2FA。 |
| Project Roles and Permission Schemes | … > Getting Started as an Enterprise Admin > Project Roles and Permission Schemes | /Content/Plans/project_roles_and_permission_schemes.htm | 解释 Project role 与 Permission scheme 的组合关系；列出 Onshape Default 五角色的默认权限；说明创建/编辑角色与方案、权限依赖及不可删除被引用方案。 |
| Managing Projects | … > Getting Started as an Enterprise Admin > Managing Projects | /Content/Plans/managing_projects.htm | Project 用 Permission scheme + role map 控制文档权限；一个文档只能属于一个 Project；说明创建、克隆、编辑、移入/移出、文件夹继承与复制工作区落点。 |

### 2.4 企业身份提供方（SSO / 2FA）

| 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|
| Integrating with Identity Providers | … > Getting Started as an Enterprise Admin > Integrating with Identity Providers | /Content/Plans/configuring_integration_with_identity_providers.htm | SSO 总览：支持 Okta、Entra ID、ADFS、Google、PingOne、OneLogin、ClassLink、自定义 SAML 2.0；通用步骤为 IdP 建应用→下载 metadata→Onshape 上传→启用；同一时间仅一个活动 SSO。 |
| Integrating with Okta | … > Integrating with Identity Providers > Integrating with Okta | /Content/Plans/integrating_with_okta.htm | Okta 目录添加 “Onshape SAML”、填域名前缀、下载 IdP metadata、在 Onshape Authentication 创建 SSO provider；Government 版另填 Test 与 `<prefix>.usgov`。 |
| Integrating with OneLogin | … > Integrating with Identity Providers > Integrating with OneLogin | /Content/Plans/integrating_with_onelogin.htm | OneLogin 建 SAML Test Connector (Advanced)，配置 ACS/Entity ID/属性映射（companyName 等），下载 metadata 后在 Onshape 配置 SSO provider。 |
| Setting Up Single Sign On with Google | … > Integrating with Identity Providers > Setting Up Single Sign On with Google | /Content/Plans/setting_up_single_sign_on_with_google.htm | Onshape 内直接创建 Google SSO provider，可设 Domain whitelist 自动provision（自动 Full/Light）；可禁用 Onshape 密码登录；Google SSO 不可用于 Government 版。 |
| Integrating with Microsoft Entra ID (formerly Azure AD) | … > Integrating with Identity Providers > Integrating with Microsoft Entra ID (formerly Azure AD) | /Content/Plans/integrating_with_microsoft_entra_id.htm | Entra 企业应用添加 Onshape、选 SAML、改 companyName claim、下载 Federation Metadata XML、分配用户/组，再在 Onshape 配置 SSO；给测试连接按钮无效的排障说明。 |
| Microsoft ADFS | … > Integrating with Identity Providers > Microsoft ADFS | /Content/Plans/integrating_with_microsoft_adfs.htm | ADFS 建 Relying Party Trust（SAML 2.0 WebSSO）、设置 SP 证书与 SHA-1、三条 claim 规则、上传 federationmetadata.xml 到 Onshape，再配置 SSO provider。 |
| Integrating with PingOne | … > Integrating with Identity Providers > Integrating with PingOne | /Content/Plans/integrating_with_pingone.htm | PingOne 建 Web App SAML，ACS 固定 cad.onshape.com、Entity ID `com.onshape.saml2.sp`、有效期 300 秒，映射 email/firstName/lastName/companyName，下载 metadata 后在 Onshape 启用。 |
| Integrating with ClassLink | … > Integrating with Identity Providers > Integrating with ClassLink | /Content/Plans/integrating_with_classlink.htm | ClassLink SAML 控制台填 CompanyName、IdP metadata URL、属性映射与 Metadata Overrides（NameId、RSA_SHA256 等），取得 metadata 后在 Onshape 配置。 |
| Integrating with a Custom Identity Provider via SAML 2.0 | … > Integrating with Identity Providers > Integrating with a Custom Identity Provider via SAML 2.0 | /Content/Plans/integrating_with_a_custom_idp_via_saml.htm | 自定义 IdP 仅支持 SAML HTTP-POST；ACS 为 `https://cad.onshape.com/identity/saml2/sso`（Gov 为 cad.usgov），Entity ID `com.onshape.saml2.sp`，NameID=邮箱，必需 firstName/lastName/companyName 三属性。 |

### 2.5 发布管理与监控

| 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|
| Creating a Customized Release Workflow | … > Getting Started as an Enterprise Admin > Creating a Customized Release Workflow | /Content/Release/creating_a_customized_release_workflow.htm | 企业管理员以 JSON 定义 Release/Obsoletion 工作流：自动两级审批、FeatureScript 属性更新、Manage workflows 全局权限、发布/替换/取消发布/调试/多活动流、语法与动作限制、Audit log。 |
| Designing Release Management Processes | … > Getting Started as an Enterprise Admin > Designing Release Management Processes | /Content/Release/designing_release_management_processes.htm | 系统讲解工作流 JSON 四对象（options/properties/states/transitions）及字段、动作、约束；工作流设计器实时图、大小写/命名/测试要点、Obsoletion 工作流与删除/替换策略。 |
| Monitoring User Activity | … > Enterprise Subscription > Monitoring User Activity | /Content/Plans/monitoring_user_activity.htm | 企业 Activity 流可按项目过滤，查看用户/文档详情、评论回复、Show changes、版本 diff、3D/2D Compare；非管理员仅见有权文档的活动。 |
| Monitoring Releases and Tasks | … > Enterprise Subscription > Monitoring Releases and Tasks | /Content/Release/monitoring_releases_and_tasks.htm | Action items 页可按类型/状态/指派人过滤 release、comment、task，创建/编辑任务、URL 自动转链接、查看发布审批状态与 View release。 |

### 2.6 企业分析（Analytics / Dashboards / Reports）

| 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|
| Analytics | … > Enterprise Subscription > Analytics | /Content/Plans/analytics.htm | 企业分析入口；需 Access analytics 全局权限；后端为 Amazon QuickSight；左栏过滤器含 My analytics、Recently opened、Created by me、Shared with me、Scheduled reports，以及 8 类仪表板目录。 |
| Working with Analytics Dashboards | … > Analytics > Working with Dashboards | /Content/Plans/working_with_analytics_dashboards.htm | 仪表板级操作：过滤、Save dashboard as、编辑、分享、删除、打印/生成 PDF、查看导出、点击单元格 Open in Onshape/Show 相关仪表板。 |
| Working with Analytics Dashboard Visuals | … > Analytics > Working with Dashboard Visuals | /Content/Plans/working_with_analytics_dashboard_visuals.htm | 可视化级操作：Customize、Maximize、Sort、导出 CSV/Excel、查看 summary data、分页 100/500/1,000/10,000（默认 500）、Count/Table/Pie/Bar/Donut/Map；Gov 无 Map。 |
| My Analytics Dashboards | … > Analytics > My Analytics Dashboards | /Content/Plans/my_analytics_reports.htm | My analytics 默认四板：My Action Items、My Activity、My Projects and Documents、My Releases；给出列与可视字段。 |
| Action Items Dashboards | … > Analytics > Action Items Dashboards | /Content/Plans/action_items_reports.htm | Action items 与 Action items summary 两块；前者按创建/指派人/状态/类型/到期/项目/团队过滤，后者统计 365 天任务工作量与逾期。 |
| Audit Dashboards | … > Analytics > Audit Dashboards | /Content/Plans/audit_reports.htm | 五块审计板：Activity overview、Audit trail、Enterprise health、IP tracking、User activity audit trail；覆盖导出/复制/转移/失败登录/位置等。 |
| Documents Dashboards | … > Analytics > Documents Dashboards | /Content/Plans/document_reports.htm | Document access（项目/用户/文档权限与建模时长）与 Document list（企业文档/出版物清单）；支持按项目、文件夹、状态、link shared 等过滤。 |
| Permission Dashboards | … > Analytics > Permissions Dashboards | /Content/Plans/permissions_reports.htm | Direct permissions、Document permissions、Permissions overview；可追溯权限来源（Document/Folder/Project/Team/User）、匿名访问与 share with support。 |
| Projects Dashboard | … > Analytics > Projects Dashboard | /Content/Plans/projects_reports.htm | 单一 Project list 表：项目状态、权限方案、创建者/时间、文档数、用户数、建模时长。 |
| Release Dashboards | … > Analytics > Release Dashboards | /Content/Plans/release_reports.htm | 四块：重复零件号、Obsoletion、Release activity（含 PLM change 字段/待批准）、Release audit（按零件号/状态/工作流检索）。 |
| Resource Dashboards | … > Analytics > Resource Dashboards | /Content/Plans/resource_reports.htm | Document activity（用户在某文档的建模时长，可按起止版本）与 Modeling activity（项目/文档/用户活跃度、趋势图）。 |
| Users Dashboards | … > Analytics > Users Dashboards | /Content/Plans/user_reports.htm | Team list 与 User list：用户状态 Admin/Member/Guest、类型 Full/Light、是否活跃、文档/项目/发布数量、建模时长。 |
| Scheduled Reports | … > Analytics > Scheduled Reports | /Content/Plans/scheduled_reports.htm | Enterprise/Analytics 管理员可把已保存仪表板按频率以 PDF 邮件发给收件人；收件人无仪表板权限时警告；可见范围按管理员类型分层。 |

### 2.7 企业治理与政府版

| 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|
| Public Documents | … > Enterprise Subscription > Public Documents | /Content/Plans/public_documents.htm | 企业域默认阻止访问公开文档与把企业数据公开；需 Allow access to public documents 全局权限；无权限者可在 cad.onshape.com 复制公开文档再用于企业。 |
| Understanding Teams | … > Enterprise Subscription > Understanding Teams | /Content/Plans/understanding_teams.htm | Teams 用于批量共享/赋全局权限；需 Manage users and teams 权限；企业创建时自动有 All enterprise users；说明创建、加人、移除与删除对共享的影响，移动端仅查看。 |
| Understanding Aliases | … > Enterprise Subscription > Understanding Aliases | /Content/Plans/understanding_aliases.htm | Alias 是发布审批/观察者的分发列表，仅管理员且需 Manage users and teams；可由用户和 Team 组成；加入 Approvers 受 Approve Releases 权限过滤，Observers 无权限要求。 |
| Onshape Government (US) | Managing Your Onshape Account and Subscription > Government (US) Subscription | /Content/Plans/managing_your_onshape_government_enterprise_subscription.htm | 政府版基于 AWS GovCloud，满足 ITAR/EAR；列出与 Enterprise 的差异（无移动端、无第三方 App、无公开文档/链接共享、无支付页、无 Google SSO/AI Advisor 等）；2FA 用 HMAC-SHA256；不可降级到其他计划。 |

## 3. 核心概念与术语

### 3.1 订阅与计划

| 英文原名 | 含义（文档口径） |
|---|---|
| Free subscription | 免费、无时限、无需信用卡；只能建公开文档；每邮箱同时只能属于一个 Onshape 订阅。 |
| Standard subscription | 面向单个专业用户；具备除公司级功能外的全部 CAD/数据管理；按用户计费。 |
| Professional subscription | 公司订阅；合并计费；公司拥有文档；含 release management、custom properties、公司材料库、company-based sharing、Simulation。 |
| Professional Trial | 14 天 Professional 功能试用，从 Free 或 Standard 发起，创建 Pro Trial 公司。 |
| Student subscription | 13 岁以上、 accredited 院校学位/证书学生；环境等同 Standard；按年，符合资格可续。 |
| Educator subscription | 教育机构在职教育者/导师/志愿者；含 Classes/Assignments、Simulation 等；按年，符合资格自动续。 |
| EDU Enterprise / Education Enterprise | 机构级教育企业版：独立域名、管理员/组织/分析能力。 |
| Enterprise subscription | 企业高级版：独立域名、合并计费、多用户、企业级权限/分析/Light user。 |
| Government (US) subscription | 基于 AWS GovCloud 的政府合规版 Enterprise，满足 ITAR/EAR。 |

### 3.2 组织容器与身份

- **Company**：Professional/Pro Trial 创建的公司实体；有 Owner、Admin、Member；文档可由公司所有。
- **Classroom**：Educator 计划的 Onshape 实例；创建者为 Owner/Administrator，可加 Educator 与 Student。
- **Enterprise / EDU Enterprise / Government instance**：带唯一 URL 的受管实例；Enterprise Administrator 拥有全部权限；所有成员另有个人账户（`cad.onshape.com`）。
- **Owner / Administrator / Member / Guest**：Owner 为付费签约者并兼任 Admin；只有 Owner/Admin 可增删用户与改角色；Guest 为外部受控访问者。
- **Full user / Light user**：企业席位类型。Full 可创建/编辑/共享并可能具管理权；Light 只能查看、评论、导出被共享的数据，最大权限为 View/Export/Comment，无管理权。
- **Project role**：命名的工作职能桶（Project Administrators、Managers、Engineers、Reviewers、Suppliers 等），本身无权限，需与 Permission scheme 绑定。
- **Permission scheme**：Role→Permission 集合的命名表；一个 Project 只引用一个 scheme；改 scheme 立即影响所有引用它的 Project。
- **Role map**：Project 内 User/Team→Role 的映射表，与 Permission scheme 共同决定访问级别。
- **Global permissions**：企业级权限（如 Company Administrator、Manage users and teams、Manage role-based access control、Permanently delete、Analytics administrator、Create Projects、Create Releases、Approve Releases、Allow access to the App Store、Allow access to Public documents、Share for anonymous access、Manage workflows、Access analytics 等）。
- **Team**：企业内用户列表，用于批量共享或赋全局权限；企业创建时自动生成 “All enterprise users”，EDU 还自动生成 “Educators”。
- **Alias**：发布工作流专用分发列表，可包含用户与 Team；成员变动不发通知。

### 3.3 权限词汇

- **View**：只读；可附加/移除 Copy、Link document、Export、Comment。
- **Edit**：可修改；可附加/移除 Copy、Link document、Export、Share、Comment。
- **Copy / Link document / Export / Share / Comment / Delete**：文档级附加权限；Delete 表示移入 Trash。
- **All permissions**：Project Administrator 默认全权；移动文档进出 Project 需源与目标均具“full permission”。
- **匿名访问 / Link sharing**：企业可由全局权限控制；Government 版无 link sharing 与 public documents。

### 3.4 计费与生命周期术语

- **Consolidated billing**：多用户合并计费；Professional/Enterprise 提供。
- **Payment cycle / renewal date**：扣款周期与合同续期日；取消 Professional 须在 renewal date 前 30 天邮件申请。
- **Downgrade / Cancel**：降级到 Free 与取消付费订阅不同；降级后私有文档保留但只读。
- **Auto-renew**：Student/Educator 按年自动续期（Student 主题另处写“expire after one year…may be renewed”，存在措辞不一致）。
- **Scheduled remove user**：EDU 管理员/教育者设定移除日期；到期前保留访问并提示，到期移除并释放席位。
- **Personal copy**：把企业/教育企业文档复制到个人账户；不含 Versions/history、Comments、Share 设置。

### 3.5 SSO 与安全术语

- **IdP / SSO**：身份提供方与单点登录；支持 Okta、Microsoft Entra ID、Microsoft ADFS、Google、PingOne、OneLogin、ClassLink、Custom SAML 2.0。
- **ACS URL**：`https://cad.onshape.com/identity/saml2/sso`；Government 为 `https://cad.usgov.onshape.com/identity/saml2/sso`。
- **Entity ID**：`com.onshape.saml2.sp`；多租户时用 `com.onshape.saml2.sp.<domain prefix>` 并勾选 “Use entityid with company domain prefix”。
- **SAML 必需属性**：`firstName`、`lastName`、`companyName`；NameID 为邮箱。
- **Metadata / configuration file**：IdP 导出的 XML，上传到 Onshape 的 Create SSO provider。
- **Disable Onshape password sign in**：强制仅 SSO 登录；同时禁止用户直连非企业域（如 cad.onshape.com）。
- **Auto-provisioning**：可关闭；Google 可用 Domain whitelist 自动provision 为 Full/Light。
- **2FA**：双因素认证；企业可强制；Government 版使用 HMAC-SHA256 以满足 FIPS 140-3。

### 3.6 发布管理术语

- **Release candidate / Release package**：待审批的发布对象；含 items、属性、Approvers、Observers、workflow state。
- **Release workflow / Obsoletion workflow**：发布/作废流程；由 JSON 定义，当前活动流程治理新建 release candidate。
- **State / Transition / Action**：状态节点/迁移/动作；迁移类型 `SUBMIT`、`APPROVE`、`REJECT`。
- **Debug mode**：以发布版本所对应 workspace 中的工作流定义试跑，要求恰有一个 workspace 位于发布版本之上。
- **Managed workflows**：企业启用并管理的自定义工作流；可多个 active。
- **Revision scheme**：Alphabetical / Numeric / Custom；以 `revisionSchemeId` 覆盖公司设置。
- **Audit log**：`GET /api/workflow/obj/<object id>/auditlog`；记录创建、迁移、动作、FeatureScript 执行等。

### 3.7 分析术语

- **Dashboard**：一个或多个 **visual** 的集合，带过滤、保存、分享、删除、导出、排期。
- **Visual**：count、table、pie、bar、donut、map 等 tile。
- **Scheduled report**：把已保存 dashboard 按频率邮件发送，当前格式仅 PDF。
- **Amazon QuickSight**：Analytics 后端（文档明确）。
- **Access analytics**：查看分析所需的全局权限。

## 4. 功能与 UI 明细

### 4.0 计划功能差异矩阵与关键配额（先览）

> 本表把散落在各主题中的计划边界集中对照。空白/“未说明”均表示语料没有写，不是推测为“无”。

#### 4.0.1 计划功能差异矩阵

| 计划 | 资格/适用对象 | 私有文档 | Release management | 公司级属性/材料库/共享 | 合并计费 | 独立域名/企业管理/分析 | 续期/试用/取消要点 |
|---|---|---|---|---|---|---|---|
| Free | 任何人可注册；无时限、无需信用卡 | 不能创建；被共享的私有文档仅 View only | 无 | 无 | 无 | 无 | 可申请 Professional Trial 或升级；账户可自行删除 |
| Standard | 单个专业用户，不需要公司级设置 | 可创建（FAQ：与 Professional 一样可无限私有） | 无 | 无 | 无 | 无 | 可申请 Pro Trial；升级 Professional/Enterprise；取消需联系 Onshape（细节未说明） |
| Professional | 公司/团队；可为任意用户付费，甚至多个 Professional 订阅 | 可创建无限私有 | 有 | 有（custom properties、company-wide material libraries、company-based sharing） | 有 | 无独立域名；有公司实体，无企业分析仪表板 | 合同续期前 30 天 owner 邮件取消；周期末转 Free；无退款 |
| Professional Trial | 从 Free 或 Standard 发起 | 等同 Professional | 有 | 有 | 有（试用公司） | 无独立域名 | 14 天；到期未购买回 Free/Standard；降 Free 删除公司且不可撤销 |
| Student | ≥13 岁、 accredited 院校的学位/证书学生；仅课堂/学习项目/学校社团/学术研究，不得政府/商业用途 | 与 Standard 同等工作环境 | 无（同 Standard） | 无（同 Standard） | 无（同 Standard） | 无 | 按年；符合资格可续（另处称自动续期，语料不一致）；不再符合则降 Free；EDU badge 永久 |
| Educator | 教育机构在职教育者/导师/志愿者；课堂、教育团队/组织、学术研究；不得政府/商业/非学术用途 | 文档未单列；称提供 Classes/Assignments 与 Simulation 等高级功能 | 有 | 有（EDU-wide material libraries、EDU-based sharing、custom properties） | 未说明 | 无独立域名（个人 Educator）；有班级仪表板，非企业分析 | 符合资格每年自动续；不符合则降 Free |
| EDU Enterprise | 机构级推广，需联系销售；仅机构指定用户可访问 | 文档未单列（Enterprise 型环境） | 有 | 有（企业级） | 未说明 | 有独立域名；有管理员、组织与分析能力（EDU dashboards） | 由机构合同管理；未给取消/续期细则 |
| Enterprise | 需要速度与数据控制的产品团队；公司多用户购买；仅指定/付费用户可访问 | 有（取消后私有文档仍私有） | 有 | 有 | 有 | 有独立域名；有 Activity/Documents/Analytics、Light user、全局权限 | 取消后全员 Free；公司文档仅原管理员可访问；提前期未说明 |
| Government (US) | 需政府法规/合规（ITAR/EAR）的团队；AWS GovCloud | 有（按 Enterprise） | 有（按 Enterprise） | 有（按 Enterprise） | 文档未单列 | 有独立 Gov 实例/分析；功能有删减 | 不能降级到其他计划；取消账户即移出 Gov；2FA HMAC-SHA256 |

**横向要点**：
- `[文档明确]` Free 与付费计划的核心分水岭是“能否创建私有文档”；Standard 与 Professional 的核心分水岭是公司级功能（release、属性、材料库、共享、合并计费），而不是 CAD 功能。
- `[文档明确]` Trial 是 Professional 全功能试用，不是独立长期计划；Student 环境“same working environment as the Standard subscription”。
- `[文档明确]` Enterprise 与 Government 都带独立实例/域名；Professional 无独立域名；EDU Enterprise 是教育领域的独立域名实例。
- `[文档未说明]` Educator 是否含无限私有文档、EDU Enterprise 的合并计费/席位规则、各计划的存储/项目/文档配额。

#### 4.0.2 席位、角色与数量限制

| 项目 | 文档规则 |
|---|---|
| 企业席位类型 | Full user、Light user；另有 Member/Guest 状态。Full×Member 可至完整编辑且有 Company admin access；Full×Guest 可至完整编辑但无 admin；Light 最高 View/Export/Comment，无 admin。 |
| 席位数量/最低购买量 | **文档未说明**（无每计划席位上限、最低席位数、席位数计价档）。 |
| 用户多订阅 | 一个用户可用同一凭证属于多个 Company/Classroom/Enterprise；可被多个 Professional 订阅付费；Free 每邮箱同时只能属于一个订阅；不能同一账户同时 Free+Professional。 |
| 团队/别名 | 用户可属多个 Team、多个 Alias；Team 成员变动发邮件，Alias 成员变动不发。 |
| 项目 | 一个文档只能属于一个 Project；Project 只能在根层；Project 必须始终有 Project Administrator。 |
| 个人副本 | 每次最多 10 个文档；每天最多 100 次请求；不限总次数；不含 Versions/history、Comments、Share 设置。 |
| 多选 | 文档列表可用 Ctrl/Shift-click 选最多 10 个（个人副本场景）。 |
| 试用 | Professional Trial 14 天。 |
| 取消提前期 | Professional 必须在 renewal date 前 30 天邮件申请；其他计划未说明。 |
| 账户删除 | 请求后 30 天内删除，期间不可访问；4 年不活跃自动删除。 |
| 教育年龄 | 邀请用户须 13+；COPPA 下取得可验证家长同意可例外。 |
| 分析分页 | 表格默认前 500 条；每页 100/500/1,000/10,000；summary 弹窗每页 25/50/100。 |
| SSO | 可创建多个连接，但同时只能一个 active。 |
| 密码 | 遵循 NIST Password Guidelines/SSO 策略；命中 HaveIBeenPwned 泄露库则拒绝。 |
| 存储/文档配额 | **文档未说明**。 |

#### 4.0.3 计费周期、试用与数据保留/导出

| 主题 | 文档口径 |
|---|---|
| 扣款时点 | 注册订阅时、增加用户时、每个 payment cycle 开始时。 |
| 周期长度 | 未给统一周期；Standard 的 DESC 写“按用户年费 $1,500”；Student/Educator 按年；Professional 提到 renewal date/payment period；Enterprise/Government 未说明。 |
| 卡信息 | Onshape 不存储信用卡；Payment options 可改。 |
| 退款 | Professional 取消不退款，周期末转 Free；其他计划未说明。 |
| 试用 | 14 天 Professional Trial；降 Free 删除公司不可撤销；公司文档/受邀文档归 owner；私有文档只读、可导出、可转 public。 |
| 降级后的数据 | Onshape 从不删除/更改文档；私有文档仍私有但只读；可查看/导出/下载；新 Free 文档自动公开；可升级恢复编辑；可 `Make public` 重新获得编辑。 |
| 取消后的数据 | Professional：周期末转 Free；Enterprise：全员 Free、公司文档仅原管理员可访问、项目转文件夹；Government：不能降级，取消即移出计划。 |
| 账户删除 | 30 天内删除；完成后不可恢复；你/公司拥有的文档不再可用；文档内部链接与已有副本仍有效。 |
| 不活跃 | 4 年自动删除账户（详情问 Support）。 |
| 学生文档标记 | Student 创建的文档永久带 EDU badge，含副本/转移/公开/再私有。 |
| 导出 | 降级后私有文档可导出；Light user 可导出；Analytics CSV/Excel/PDF；Scheduled report 仅 PDF；个人副本不含版本/评论/共享。 |

### 4.1 全局账户菜单（几乎所有订阅页重复）

**位置**：界面右上角，用户图标 + 用户名。菜单项：

- `My account`：偏好、通知、安全等。
- `Company/Classroom/Enterprise settings`：查看公司/教室/企业设置。
- `View support tickets`：查看已提交工单；提交工单在 `Help` 菜单的 `Contact Support`。
- `App Store dev portal`：面向开发者/合作伙伴发布应用到 Onshape App Store。
- `View in dark mode`：开关暗色主题。
- `Sign out`。

**Dark mode 边界（文档明确）**：仅 Part Studios、Render Studios、Assemblies、App Store 完整支持；Drawings、PCB Studio、Enterprise analytics 不适用，但这些区域周边的工具栏/菜单仍可显示暗色。开关仅对当前会话生效，登出后恢复浅色；要持久化需 `My account > Preferences > Theming`。

**平台边界**：账户维护以浏览器/桌面为主；移动端只能查看部分账户信息，且仅能编辑默认尺寸设置、开关 Touch/Face ID（支持的设备）。iOS 上不能创建或删除账户，必须在 Desktop 或 Android 完成。

### 4.2 注册、激活与登录

**注册入口**（Free/Educator/Student）：
1. 打开 `cad.onshape.com` → `Sign up`，填必填信息 → `Get Started`；教育者/学生会被引导创建 Free 账户，并收到设置链接邮件。
2. 或在 `onshape.com/en/pricing` 的 Free 计划点 `Sign up free`。

**其他计划入口**：pricing 页选择 Standard（`Learn more about the Standard plan`）、Professional（`Try the Professional plan for free`）、Enterprise（`Contact sales about an Enterprise plan`）、`Compare plans`。

**激活向导**（首次登录）：
1. 设置并确认密码，勾选服务条款，点 `Get started`；某些订阅要求填手机号。
2. `Language` 选择语言。
3. `Set your default units`：Length、Angle、Mechanical 及对应小数显示。
4. `Set your mouse controls`：Onshape（默认）、SOLIDWORKS、NX 10、Creo、AutoCAD。
5. `Set your profile`：上传头像、Nickname。
6. `Browser check`：通过后 `Done`。

**登录**：桌面 `https://cad.onshape.com/signin` → Email → `Continue` → 若属于多个账户则选择 → Password → `Sign in`。Enterprise 用户也可用企业专属 URL 直接进入；从 `cad.onshape.com/signin` 登录会先进入个人账户。

**多账户与切换**：一个登录凭证可属于多个账户；原 Company/Classroom/Enterprise 列在 Documents 页左侧 Filter。个人账户用 `User menu > Switch to <company/classroom/enterprise name>` 切换，无需重新登录（但 Enterprise 切换在部分流程中要求重新输入凭证）。移动端首次登录企业账户会落在个人账户，需 hamburger 菜单 `Switch to ...`，确认登出并切换后输入企业凭证；应用会记住该状态。

**密码策略**：遵循 SSO 提供方要求或 NIST Password Guidelines；Onshape 使用 HaveIBeenPwned 的哈希比对（密码不上网）。触发场景：忘记密码重置、新建密码、注册设密、在 Onshape 内改密；命中泄露库则拒绝并要求新密码。

### 4.3 订阅层级、升级/降级/取消路径

| 场景 | UI/入口与字段 | 结果/规则（文档明确） |
|---|---|---|
| Free → Standard | Documents 或 My account 页 `Upgrade` → 新标签 Plans → `Select Standard` → 填表 → `Confirm payment information` → 复核购买 | 转为 Standard；文档可私有化（具体私有化操作见 Professional 页的 Share 设置）。 |
| Free → Professional | Documents/My account 页 `Learn more` → `Explore Onshape's premium features` → `Plans and pricing` → Professional 列 `REQUEST TRIAL`，或 `Chat now to learn more`；填 `Request a Professional Trial` → `SUBMIT` | 先走 Professional Trial；试用后升级。升级后原先 View only 的文档变为可编辑，Onshape 自动开放全部文档。 |
| Free → EDU | 先登出 Free；Sign in 页 `Sign up` → 用同一联系信息 → `What best describes you` 选 `Student` → 选 school level → 勾协议 → `Get Started` → 完成 step 2 → `Create Account` → 登录 | 进入 EDU 订阅。 |
| Free/Standard → Pro Trial | Documents 页左下 `Try Professional` → `Start Professional Trial` → 输入 Company name → `Start Onshape Professional Trial` → 重新登录 | 创建 Pro Trial 公司；顶部横幅显示剩余天数。 |
| Pro Trial → Professional | Documents 页 `Plans and pricing` → 选计划 | 公司所有用户及其文档一起升级；公司设置与权限不变。 |
| Pro Trial → Standard（试用期未结束） | `Plans and pricing` → Standard 下 `Select Standard` → `Continue to payment` → 填 Credit card/Billing address → `Review purchase` → 接受 | 降为 Standard；文档未说明此路径下 Pro Trial 公司是否删除（仅 Free 路径明确“公司被删除”）。 |
| Pro Trial → Free | `My account > Subscription` → `Downgrade to the Free plan` → 阅读确认 → `Downgrade to Free` | 公司永久删除；公司文档转给公司 owner；受邀创建的文档所有权也回到 owner；私有文档仍私有但只读，可导出、可设为 public。 |
| Student 续期 | 到期前一周收邮件；`My account > Subscription` → `Renew Student plan` → `Yes, I'm a student` → 选 School level、Graduation year、勾条款 → `Confirm` | 续为 Student。 |
| Student → Free | `My account > Subscription` → `Downgrade to Free plan` → 确认 `Downgrade to Free plan` | 私有文档仍私有但只读；可查看/导出/下载；新文档自动公开；Student badge 永久保留。 |
| Educator → Free | `My account > Subscription` → 选订阅 → `Downgrade to the Free plan` → `Downgrade to Free` | 返回登录页，登录后为 Free。 |
| Standard 取消 | `contact Onshape`；用户可尝试删除账户，但须管理员先降 Free；iOS 走 `Settings > My account > Delete my account` 并被提示先降级 | 文档未给标准取消的退款政策细节。 |
| Professional 取消 | 仅 Company Owner 发邮件到 `onshape-customers@ptc.com`，注明要取消的订阅，须在合同 renewal date 前 30 天 | 付款期内仍有效，周期结束转 Free；无退款；若仍属于其他 Professional 订阅则不降级；被 owner 移出公司则立即降 Free（除非另有 Professional）。 |
| Enterprise 取消 | 文档未给具体取消入口；仅说明取消后全员降 Free | 用户私有文档仍私有但不可编辑；公司文档仅原管理员可访问；项目转文件夹；文档/文件夹层级原样转移给 owner。 |
| Professional → Enterprise | `contact us`；升级后有 Customer Success 联系人 | 所有订阅用户收到 Enterprise URL 邮件；成员/管理员身份保留；只有公司拥有的文档迁入 Enterprise，个人拥有的文档需先转公司，或升级后 `Transfer to <enterprise name>`；文件夹结构与共享保留；用户账户设置/凭证不变。 |
| Educator → EDU Enterprise | `contact us` | 与 Professional→Enterprise 类似；课堂拥有的文档迁移；个人拥有的需先转课堂或升级后 `Transfer to <EDU Enterprise name>`。 |
| Enterprise → Free | 取消后 | 全员 Free；私有文档只读；公司文档归原管理员；项目转文件夹。 |
| Government → 其他计划 | 文档明确 **不能降级**；取消账户则被移出 Government 计划 | 需联系 Onshape 代表。 |

**Pro Trial 关键规则**：
- 试用期 **14 天**；不升级则自动回 Free 或 Standard。
- 试用结束、公司 owner 仍可登录只读查看全部公司数据，顶部显示 inactive company 横幅；可通过 Plans & Pricing 购买。
- 升级到 Professional 时“公司所有用户及其文档一起升级”。
- 降 Free 后公司删除不可撤销；Onshape 从不更改/删除文档，公司拥有的文档转给 owner；被邀请创建文档的用户，其文档所有权回到 Pro Trial 公司 owner。

### 4.4 支付 FAQ 明细

| 问题 | 文档答案 |
|---|---|
| 价格 | 见 `https://www.onshape.com/en/pricing`；Standard 的 DESC 另写按用户年费 $1,500。 |
| 免费试用 Professional | 可申请 Professional Trial，见 pricing 页。 |
| Professional vs Free | Professional 可建私有文档并使用 release management；否则 Free 拥有与 Professional 相同的 CAD 与数据管理功能。 |
| Professional vs Standard | Professional 增加 release management、公司级元数据、公司材料库、company-based sharing；两者均可无限私有文档、CAD 功能相同。 |
| 是否存信用卡 | 不存储。 |
| 改卡 | `My account` → `Payment options`。 |
| 何时扣款 | 注册订阅时、增加用户时、每个 payment cycle 开始时。 |
| 交易失败 | 银行自动风控/余额/有效期/CVC 等；联系发卡行；持续失败联系 Onshape。 |
| 取消 Professional | 仅 company owner 邮件 `onshape-customers@ptc.com`，须在续期前 30 天。 |
| 退款 | 不退款；当前付款周期结束后转 Free。例外：被移出唯一的 Professional 订阅时立即降 Free。 |
| 取消后文档 | 私有文档及被共享的私有文档仍可用，但 View-only。 |
| 多用户集中付费 | 注册 Professional，指定 company owner，再由 owner 在 Account 页添加成员。 |
| 多用户计费 | 加入已是 Professional 的用户即同意为其付费；用户可属于多个订阅，但同一账户不能同时是 Free 与 Professional；若既要 Free 又要付费订阅，需两个不同邮箱账户。 |
| owner 把我移出公司 | 文档不受影响；若不再属于其他 Professional 订阅则降 Free；Onshape 从不删除文档，也从不把私有文档变公开。 |

### 4.5 教育版对象与 UI

#### 4.5.1 概念与角色

- **Classroom**：Educator 计划的实例；创建者即 Owner + Administrator；只有 classroom Administrators 能加 Educators/Students；Educators/Students 可自行退出。
- **Class**：班级对象，包含学生与作业；只有 Educators team 成员可创建 class；企业可有多个 class。
- **Assignment**：班级特定作业；含说明、可链接起始文档；可先建未发布；学生按人提交 **Submission**，看不到其他学生作业；按时间窗 publish/close。
- **Educator**：可创建班级、增删学生、发布/关闭作业；EDU Enterprise 中由管理员或其他 Educator 创建，默认具备创建学生、班级、作业的权限。
- **Student**：至少属于一个 class；可创建/删除自己的文档、访问班级与作业、提交；只能看自己的作品。
- **Scheduled remove user**：设置移除日期；到期前保留访问并提示；到期移除并释放席位；允许者可在移除前做个人副本。
- **Permissions**：默认权限通常足够；特殊情况用 Global permissions，且“永不给学生”；细粒度用 Permission schemes + Project roles。

#### 4.5.2 Educator 界面

- 登录后默认落 Documents 页；EDU Enterprise 可在 Account preferences 改 `Enterprise startup page`。
- 左侧 `Classes` filter 查看可访问班级；Educator 看到自己创建的全部班级，Student 看到被加入的班级。
- 班级支持 Grid/List 视图；Grid 下可按 `Created on`、`Name: A -> Z`、`Name: Z -> A`、`Last modified` 排序。
- 选中班级可打开 Details 面板；点击班级进入 Assignments 列表。
- `Members` tab：显示 Educators 与 students 的姓名、邮箱、user type、加入日期、最后登录；可移除。
- `Archive class`、`Unpublish class`、`Preview as student` 在班级/作业页可用；Preview 时草稿与已关闭作业不可见，并显示提示；`Exit preview mode` 退出。
- **移动端边界**：iOS/Android 上 classes 仅对 educators 提供 **View only**；学生可访问 Classes 列表并 start/submit assignments。

#### 4.5.3 班级操作

**创建**：Documents 页 `Create` → `Class` → `New class` 对话框（name、description）→ `Create` → 进入 Create assignment 页面。

**添加成员**：
- `Members` → Invite users 图标 → `Add users`：输入邮箱，选择 `Students` 或 `Educators` → `Invite`；同时邀请两类时先加完 Students 再加 Educators。
- `Manage via CSV` → `Select file` 或 `Download template`；模板保持第 1 行，A 列邮箱、B 列角色（必须是 `Student` 或 `Educator`）→ `Process upload`；完成后通知并填充成员列表。
- 所有被邀请者须 13+；若更小，教育者可在取得 COPPA 要求的可验证家长同意后邀请。

**发布**：Class 列表右键 `Publish class`，或在 Assignments 页右上 `Publish class`。未发布班级出现在 Educators 的 `Unpublished` 分类，学生完全不可见。

**取消发布**：Assignments 页右上 `Unpublish class` 或右键 `Unpublish class`；重新回到 `Unpublished`，学生不可见，可再次发布。

**归档**：`Archive class` 图标或右键 `Archive class` → 确认对话框 `Archive class`。归档把班级及全部作业从 classroom 移出但不删除；学生自动移出班级，但保留对已提交文档的现有访问及对 starter documents 的 copy/view 访问；班级变只读、不可编辑，仍可克隆；出现在 `Archived classes`。

**克隆**：选择班级（可多选）→ 右键 `Clone class` → 填 Class name、可选 description → `Clone`。成员不复制。非 owner 教育者需是：拥有该 class 的 classroom 的 Administrator，或该计划 Educator team 的 member/Administrator 且被加入该 class 为 Educator。

**删除**：选择班级（可多选）→ 右键 `Delete selected class` → 对话框 `Delete`/`Cancel`，可 `Show details`；多选时若权限不一，对话框说明哪些可删。删除会删除班级及全部作业；Class Documents 及其权限保留在师生账户中，不删除。

**班级右键菜单**：Open、Open in new browser tab、Details、Edit class properties、Clone class、Unpublish class、Archive class、Delete selected class。

**班级仪表板**：选班级 → `Dashboard`；数据类别包括 Number of members、Assignments、Submissions、Active students、Total students、Total hours spent in the assigned workspace across all students、学生建模小时列表；可点学生/教育者进入个人 dashboard 下钻。

**移除学生**：Members 行末 `X`；只移出该 class，不移出 Classroom；若要移出 classroom，去 `Classroom settings > Users` 点 `X`。

**指派 Student Educator 状态**：Admin(Educator) 登录 → Classroom settings > Users 确认学生是成员 → Classes 页 `Member` tab → `Invite users` → 输入学生邮箱，下拉选 `Educator` → `Invite`；学生登录后班级旁出现 Educator 指示。

#### 4.5.4 作业操作

**创建**：班级 Assignments 页 `Create assignment` → `New assignment`（name、instructions）→ `Create`，生成 draft。

**开始方式（三选一）**：
- `Students begin with a new Document`：给学生空白新文档。
- `Students begin with a copy of the selected Document`：`Select document` 选现有文档（可搜索）→ `Select`。
- `Students can choose what to submit`：学生从自己的 assignments 页选文档。

**文档共享权限**：
- `Allow students to share their assignment document`：学生可分享给其他学生/团队。
- `Restrict students to only editing their assignment document`：不可分享。

**排期**：
- 勾 `Schedule assignment`；填 `Publish date`、`Close date`（均可选，可手输或日历图标选日期时间，`Clear` 清除）；`Set scheduling` → `Schedule assignment`。
- 到 Publish date 变 `In progress`；到 Close date 变 `Closed`，学生不能再提交或从列表查看。
- 未排期则 `Publish assignment` 立即对学生可见。
- 只有班级已发布才能发布作业；否则 `Publish assignment` 置灰，作业保存为 Draft。
- 学生开始时，系统在其 root folder 下创建文档（除非选“学生自选提交”）；这些文档共享给教育者。

**学生开始/提交**：starter 文档中底部 `Start assignment`；按三种模式分别显示 “Start assignment to create a new document”“...create a copy of the starter document”“...and select an existing document”。进入副本后完成工作，点标题栏 `Submit`。`Start assignment` 即把文档共享给布置作业的教育者，但只有 `Submit` 才算完成。

**克隆到其他班级**：
- Assignment details 页菜单 → `Clone assignment to other classes`，或 Assignments 列表右键同名项。
- 对话框：可选 Schedule（Publish/Close date，同上）；`All classes`、`All published classes`、`All draft classes`；也可逐班勾选；对已发布班级可选 `Publish automatically` 或 `Create draft`；草稿作业只能克隆为草稿。
- `Clone assignment` 执行，`Cancel` 退出。

**审阅**：班级 → Assignments 列表（可按多数列排序）→ 右端 Details 图标；EDU Enterprise 有 Analytics 图标；点作业标题打开 Assignment Activity 页。上区 Assignment details、下区学生 Activity list，可拖分隔条、折叠；点 Document 链接以只读查看学生文档，`Return to Main` 打开工作区。Activity 可按列排序；作业状态左近的评论图标可 `View comment(s)`。

**状态流转**：
- `In progress` 悬停出下拉 → `Closed`。
- 学生状态 `Submitted` → `Graded`（学生收到通知，不能再提交）或 `Needs revision`（学生收到需修改通知）。
- `In progress`/`Submitted` 可点 Document 链接只读查看。

**导出与删除**：Activity 列表左上 `Export list as CSV` 自动下载；已发布作业右键 `Delete assignment`。

#### 4.5.5 个人副本（Personal copy）

- 触发：用户被安排从 Education Enterprise 移除，或被管理员授予 `Make personal copies` 全局权限。
- 选择最多 10 个文档（Ctrl/Shift-click），右键 `Make personal copy`。
- `Select copy destination`：当前 Onshape 账户邮箱，或 `Other Onshape account email` → 发验证码 → 填 `Verification code` → `Make personal copy`。
- 后台创建并邮件通知；副本内容同标准复制，但 **不保留 Versions and history、Comments、Share settings**。
- 限额：每次最多 10 个文档，每天最多 100 次请求；不限总次数，Onshape 不跟踪已复制文档。
- 移动端（iOS/Android）：若管理员允许，首次显示一次性说明；Documents 页 Details → Personal copy 图标 → 当前账户确认或选择其他邮箱并验证。

#### 4.5.6 EDU Enterprise 管理

- **上传 logo**：仅 enterprise admins；Enterprise settings → `Details` → 建筑图标下 `Change`。
- **添加用户**：见 `/Content/Plans/adding_users` 类主题（本组未包含）；可用 CSV 同时导入 Enterprise 与 Teams/Classes。
- **身份**：2FA 与 SSO 见企业主题。
- **全局权限（教育场景推荐）**：
  - `Company Administrator`：所有 tab、可看企业全部文档；仅建议校长/IT。
  - `Manage users and teams`：Users、Teams tab；建议教师/助教，不建议学生。
  - `Manage role-based access control`：Project roles、Permission schemes；仅 enterprise admins 可改；普通教学不建议授予。
  - `Permanently delete`：可永久删除 Trash 资源及自己创建的 workspace；由 Educators team 持有，管理员可改。
  - `Analytics administrator`：Analytics tab；默认 Educators team。
  - `Create Projects`：默认 All enterprise users；普通教学不建议。
  - `Create documents and folders in the Enterprise`：默认 All enterprise users。
  - `Create Releases` / `Approve Releases`：默认 All enterprise users；普通教学不建议。
  - `Allow access to the App Store`：默认 All enterprise users；机构可禁止学生以防付费应用。
  - `Allow access to Public documents`：默认 All enterprise users。
  - `Share for anonymous access`：默认 All enterprise users；涉及隐私法规时慎用。
- **Teams**：企业创建时自动 `All enterprise users`；另有 `Educators`；Educator 账户必须加入 Educators team 才能创建 Classes/Assignments；可用 CSV 批量加入 team。
- **转出文档**：`Transfer documents out of Enterprise` 权限仅管理员可授，默认给所有 educators；用户右键文档 `Transfer ownership`，选择 Individual/Company/Enterprise，需对方接受才生效；转出后企业域失去访问。

#### 4.5.7 EDU 仪表板字段

- **Document dashboard**：Modeling time in last 7 days（count）、Document actions performed（Publications/Releases/Document copies/Exports）、Tab types（Part Studio/Assembly/Drawing）、Modeling activity（按日期建模时长）、Access locations（地图）。
- **Class dashboard**：Created on、Members（可下钻到姓名/角色/提交/建模时长）、Assignments、Submissions（班级/作业/用户/文档/创建/提交时间）、Active Students、Class Modeling Time（可下钻学生/文档/打开事件/建模时长）、Student Assignments（按学生/作业建模小时）、Assignment Activity（按作业的柱状图）。
- **Student dashboard**：学生头像、Classes 数、Submissions 数、Assignments 表、Time spent on assignments、Total modeling time、Feature usage（功能使用次数）、Activity（按作业/日期柱状图）。

### 4.6 企业管理员：用户、项目、角色、权限

#### 4.6.1 用户类型矩阵

| | Member status | Guest status |
|---|---|---|
| Full user | 对项目/文档/文件夹最高可至完整编辑；有 Company admin access；典型：工程师、设计师、CAD 管理员 | 受控访问公司数据，最高可至完整编辑；无 admin access；典型：承包商 |
| Light user | 对项目/文档/文件夹最高 View/Export/Comment；无 admin access；典型：销售市场、供应链、高管 | 受控访问，最高 View/Export/Comment；无 admin access；典型：外部供应商、厂商、客户 |

**添加用户**：浏览器 `Company/Classroom/Enterprise settings > Users`；移动端不可。升级自 Professional 时用户自动带入，无需手工添加。

#### 4.6.2 项目（Project）

- 作用：把文档分组并应用权限；权限由 **Permission scheme + role map** 决定。
- 基本约束：
  - 一个文档只能属于一个 Project。
  - 有 Project 编辑权限者可创建文档/文件夹、移入/移出文档。
  - 创建者自动成为 Project Administrator，且不可撤销；项目必须始终有管理员。
  - Project 只能建在根层；可含文件夹/子文件夹；文件夹继承 Project 权限。
  - 要编辑 scheme、role map、名称、描述，需 **Share** 权限。
  - 移入/移出 Project 需源与目标均具 full permission（Delete/Share/Edit/View/Link/Copy/Export/Comment）。
  - 移入目标 Project 后，目标 scheme 成为文档/文件夹权限。
  - 在 Project 内复制 workspace 需 Project 编辑权限；否则副本落在账户根层（Company 名），顶部蓝条提示。
- **创建**：Documents → `Create > Project` → 名称/描述 → 选 Permission scheme → 选 User/Team 和 Role → `Add` → `OK`。用户须先存在于 Enterprise settings > Users；Team 须先建。
- **克隆**：Projects 下右键项目 → `Clone project...` → 预填属性 → `OK`。
- **编辑/移除**：右键 `Edit project`；Role map 行末 `X` 删除条目；可继续添加。
- **换 scheme**：`Edit project` 下拉选择新 scheme；换后除原 Project Administrator 外，全部用户/Team 从 role map 移除，需要重建。
- **移动**：选文档 → 右键 `Move to...` → 选项目/文件夹 → `Show details`/`New folder`/`Sort` → `Move here`；用 breadcrumbs 导航；可拖拽。
- **限制**：管理员无法强制用户把文档创建到指定 Project（文档明确 “There is no way currently ...”）。

#### 4.6.3 Project roles 与 Permission schemes

- 默认 Permission scheme `Onshape Default`：
  - Project Administrators：All permissions
  - Managers：All permissions
  - Engineers：Edit, View
  - Reviewers：View, Comment
  - Suppliers：View only
- 高级权限：Export、Link document、Share、Delete（可自定义角色/方案）。
- 默认 Project roles：Project administrators、Managers、Engineers、Reviewers、Suppliers；可改名/改描述/自建。
- 角色本身只是命名容器；只有与 Permission scheme、Project 结合才有意义。
- 创建角色：Enterprise settings → `Project roles` → `Create project role` → name/description → `Save`。编辑时 `Role id` 可用于自定义 release/obsoletion workflow。
- 创建方案：`Permission schemes` → `Create scheme` → name/description → `Create`；Project Administrators 自动加入且不可删除/编辑；`Add project role` → 选 Role 和权限组（或 `Advanced` 自定义）→ `Add`。
- 编辑：右键 `Edit details` 或 `Manage project roles and permissions`；右键 Role `Edit role permissions` 或双击；用下拉或 `Advanced...` 调整，系统自动勾选依赖权限（例如 Share 依赖 Edit、Delete 依赖 Edit）；`Save`。
- 删除：被任何 Project 引用的 scheme 不能删除；修改 scheme 影响所有引用它的 Project。

#### 4.6.4 企业 SSO

**前置条件**：已获批 Enterprise 或 Trial，且拥有 Enterprise 域名（如 `MyCompanyName.onshape.com`）。

**通用步骤**：
1. 在 IdP 添加 Onshape 应用。
2. 从 IdP 下载 metadata/configuration XML。
3. Onshape Enterprise settings → `Authentication` → `Single sign-on (SSO)` → `Configure SSO provider`：
   - `Name`；
   - `Provider type`（Okta、Microsoft Entra ID、Microsoft ADFS、Google、PingOne、OneLogin、ClassLink、Custom SAML 2.0 等）；
   - `Enable SSO provider`（默认勾选）；
   - 可选 `Disable auto provisioning of users`；
   - `Disable Onshape password sign in`（建议先验证 SSO 可用再勾）；
   - 多租户时勾 `Use entityId with company domain prefix`；
   - `Upload configuration file` → `Open` → `OK`。
4. 登出 Onshape 与 IdP，硬刷新；登录页底部出现 IdP 的 `Sign in` 链接。
5. 可在 `Enterprise settings > Preferences` 的 `Single sign on (SSO) user auto-provisioning` 决定新用户默认 Full 或 Light（仅 Enterprise Administrator 可改）。

**共同约束**：
- 同一时间只能 **一个** 活动 SSO 连接；可创建多个连接，但只能启用一个；更换时上传新配置并启用即可，不必先删旧连接。
- Onshape 签署所有出站 SAML 请求；通常无需上传证书，**ADFS 例外**（ADFS 校验入站请求）。
- 启用 `Disable Onshape password sign in` 后，用户不能直连非企业域（如 cad.onshape.com）。

**各 IdP 差异**：
- **Okta**：Admin Console → Applications → Browse App Catalog → 搜 Onshape → `Onshape SAML` → `Add Integration` → 填域名前缀 → `Done`。Government：Sign On 标签 → Edit → `Onshape account type` 选 `Test`，`Onshape target server prefix` 填 `<prefix>.usgov`。下载 Sign On → SAML Signing Certificates → `Actions` → `View IdP metadata`，保存为 `.xml`。
- **OneLogin**：Applications → Add App → 搜 SAML → `SAML Test Connector (Advanced)`；Display Name `Onshape`；配置 RelayState 空白、Audience/EntityID `com.onshape.saml2.sp`、Recipient/ACS `https://cad.onshape.com/identity/saml2/sso`、ACS validator 带 `$`、Single Logout/Login URL 为企业域；NameID=Email；属性 companyName（域名前缀）、firstName、lastName；`More Actions > SAML Metadata` 下载 XML。
- **Google**：Onshape 内直接建 provider，`Provider type = Google`；可填 `Domain whitelist`（不带 `@`），该域任何有效邮箱都会自动进入企业并默认 **Full user**（除非 auto-provisioning 设为 Light），因此勿滥用 `gmail.com`；也可留空，仅由管理员邮件邀请，邀请邮箱需与 Google SSO 邮箱一致；勾 `Disable Onshape password sign in` 后管理员本人也强制 Google 登录，文档建议保存 Password sign in URL 作应急。Government 不支持 Google SSO。
- **Microsoft Entra ID**：Entra 门户 → Enterprise applications → New application → 搜 Onshape → Create → `2. Set up single sign on` → `SAML` → 编辑 `User Attributes & Claims` → `companyName` claim 的 Source attribute 填域名前缀 → Save；下载 `Federation Metadata XML`；`Users and groups` → Add user/group → 选择用户 → Assign。若登录报错：关闭所有标签、完全登出 Microsoft 再登入；AD 管理面板的 “test connection” 按钮不可用。
- **ADFS**：Relying Party Trusts → Add Relying Party Trust → Claims aware → 手动输入 → 启用 SAML 2.0 WebSSO；SSO URL `https://cad.onshape.com/identity/saml2/sso`；Relying party trust identifier `com.onshape.saml2.sp`；Signature 标签加证书；Advanced 标签 hash 算法 `SHA-1`；三条 claim rule（LDAP attributes、Pass Through/Filter incoming claim、Custom rule，第三条用企业 DNS 前缀）；下载 `https://<server>/federationmetadata/2007-06/federationmetadata.xml` 上传 Onshape。
- **PingOne**：Connections → Add Application → Web App → SAML 连接 `Configure` → Application Name/Description → ACS `https://cad.onshape.com/identity/saml2/sso`（必须是 cad.onshape.com，不能是自定义企业域）→ Entity ID `com.onshape.saml2.sp`，Assertion Validity `300` 秒 → Map Attributes：PingOne User Attribute 选 Email Address；加三个 Static Attribute：`firstName`=First Name、`lastName`=Last Name、`companyName`=域名前缀 → Save and Close → 打开应用 sign-on 开关 → Configuration → Download metadata。
- **ClassLink**：ClassLink SAML 控制台 CompanyName；填 ClassLink IDP metadata URL；Login URL 可含 district code 或留空；ICON URL；Attribute Mapping：Given Name→`firstName`、Family Name→`lastName`、Email→`email`、Custom Attribute→`companyName`；Metadata Overrides：NameId Format=`emailAddress`、Signature Algorithm=`RSA_SHA256`、NameId Value=`Email`、Saml NotBefore=`3`；保存并复制 IDP initiate Login URL；向 ClassLink 获取 metadata 文件。
- **Custom SAML 2.0**：仅支持 SAML HTTP-POST binding；Onshape 不提供自身 metadata XML；建信任关系：ACS `https://cad.onshape.com/identity/saml2/sso`（Gov：`https://cad.usgov.onshape.com/identity/saml2/sso`）、Entity ID `com.onshape.saml2.sp`、NameID=用户邮箱、属性 firstName/lastName/companyName；复制 IdP metadata XML；把信任关系开放给目标用户。

#### 4.6.5 2FA

- 路径：`Company/Enterprise settings` → `Authentication` → `Two-factor authentication (2FA)` → `Enable two-factor authentication enforcement`。
- 管理员可要求所有企业成员使用 2FA；建议全站（Onshape 及所有支持 2FA 的网站）启用。
- Government 版 2FA 使用 HMAC-SHA256 以满足 FIPS 140-3；管理员须确认成员使用支持 SHA-256 的 authenticator app。

#### 4.6.6 Teams 与 Aliases

**Teams**：
- 创建/编辑需 `Manage users and teams` 全局权限；Professional/Standard 中任何人可建 team（文档明确对比）。
- 企业创建时所有成员自动进 `All enterprise users`；可创建任意 team，成员无需有共同点。
- 成员被加入/移除 team 会收到邮件；一个用户可属多个 team。
- 共享文档给企业内 team：任何用户可做（无需是成员）；共享给企业外 team：必须是该 team 成员。
- 通过 team 获得的文档权限不会超过共享时授予的权限；移除成员后，通过 team 获得的共享被撤销，文档从该用户 Documents 列表移除（个人单独共享不受影响）；删除 team 同理。
- 共享权限：Owner（Edit/Share/Comment/Transfer ownership）、Can edit、Can view；附加 Copy、Link document、Export、Share、Comment。有 View 权限者可与 Edit 权限者同处一个 workspace，只读用户实时看到变更但不能编辑。
- 创建：Enterprise settings → `Teams` → `Create team` → name/description → `Save`；创建者自动为首个成员；`Add users` 可逗号分隔批量；team 会出现在成员 Documents 页的 Filter；Team ID 可用于自定义工作流。
- 移除：有权限者可移除自己或他人，但不能移除 team 上最后一个具该权限的人；被移除者收邮件，文档从列表消失。
- 删除：团队名右键 `Delete` 或左上 Delete 按钮；立即撤销通过 team 的共享。
- 移动端：Teams 仅查看，不能创建/编辑。

**Aliases**：
- 用途：Release management 的 Approvers/Observers 分发列表；需 `Manage users and teams` 权限，仅管理员可建。
- 企业创建时所有成员进 `All enterprise users`，该 team 及成员可加入 alias。
- Alias 成员不需要有共同点；可属多个 alias；加入/移除 **不发通知**。
- 创建：Enterprise settings → `Aliases` → `Create alias` → name（必填）/description（可选）→ `Save` → `Add members` → 输入邮箱或 team（可逗号分隔）→ `Add`；双击 alias 看成员；Alias ID 可用于自定义工作流。
- 移除/删除：右键成员 `Remove member` → `Remove`；右键 alias `Delete` → `Delete`。
- 发布中使用：Create Release candidate 时把 alias 加到 Approvers/Observers。Approvers 只纳入有 `Approve Releases` 全局权限（或 Enterprise administrator）的用户/team；若 alias 内无人有权限，alias 不出现在 Approvers 选项；Observers 无权限要求。

#### 4.6.7 自定义发布工作流（JSON）

**入口与权限**：
- 仅企业管理员可设计；发布/取消发布/调试需 `Manage workflows` 全局权限。
- `Enterprise settings > Release management`，确认 `Enable managed workflows`，`View in document` 查看默认 JSON；下载后在 Onshape 文档中 `Import` 打开编辑。

**工作流生效规则**：
- 当前选中的 release/obsoletion workflow 治理 **新建** release candidates；流程中改变活动工作流，不影响已在进行中的 release。
- **不允许循环流程**。
- 可发布多个工作流并勾选多个 `Active`；用户创建 release candidate 时可从下拉选择。只有一个 release workflow 时，选择页仅对 admins/Manage workflows 用户显示。
- 取消发布：工作流不再可用于新建 release package；相关设置重置为 Onshape 默认工作流；已在流程中的候选继续正常，现有/已提交 release package 不受影响，仍可打开、查看、作废和迁移 pending releases；仅 Manage workflows 权限者可取消发布。
- 删除包含 JSON 的 Onshape 文档不会从 Release settings 列表移除工作流；可取消勾选 Active 使其不可选。文档行为同普通 Onshape 文档：只能在 Workspace 编辑，发布工作流文档会创建版本，可在发布时覆盖现有工作流。

**自动两级迁移**：若工作流有两级，第二级 optional，且 Release candidate 的 Approver 字段为空，Onshape 自动从 Pending 迁到 Released，无需配置。

**JSON 顶层四对象**：
1. `options`：发布设置（可覆盖公司 Release settings，缺省用公司设置）。
2. `properties`：Release candidate 对话框中的属性定义。
3. `states`：状态节点。
4. `transitions`：状态间迁移与动作。

**options 字段**（两份主题的列举略有差异，第一份另含 `errorOnPartNumberPending`、`errorOnPendingTask`）：
- `revisionSchemeId`：Alphabetical / Numeric / Custom 修订方案 ID。
- `requireApprover`：Approver 字段必填。
- `requireAllApprovers`：所有 approver 都批准才前进；任一拒绝则立即 Rejected。
- `disallowCreatorAsApprover`：禁止 release creator 批准。
- `requireNote`：每个阶段必填 Note（提交者 release note，审批/拒绝者 comment）。
- `autoObsolete`：新版本发布时立即作废旧版本。
- `errorOnFeatureListErrors`：Feature list 有错误则阻止提交。
- `errorOnRolledBack`：Part Studio rollback bar 不在末尾则阻止。
- `errorOnAssemblyErrors`：Assembly 有错误则阻止。
- `errorOnDrawingOutOfDate`：Drawing 过期则阻止。
- `errorOnAssemblyRefsOutOfDate`：Assembly 引用过期则阻止（见于第一份列表）。
- `errorOnPartNumberPending`、`errorOnPendingTask`（仅第一份列表）。
- `nameOverride` / `descriptionOverride`：覆盖 Release/Obsoletion 对话框的 Name/Notes 标签。
- 以上均可选；缺省取 Enterprise settings；错误类选项为 true 时阻止 submit，为 false 时仅警告仍可提交。

**properties 字段**：
- `name`：显示在 Release candidate 字段上方。
- `propertyId`：唯一；不得与 Onshape 硬编码 Name/Description/Comment 属性 ID 冲突。
- `valueType`：`STRING`、`BOOL`、`INT`、`DOUBLE`、`USER`、`DATE`、`ENUM`；BLOB/OBJECT 不支持。
- `defaultValue?`：须匹配类型；USER 为 user/team/role ID 数组。
- `usersOnly?` / `teamsOnly?`：仅 USER 类型，互斥。
- `enumValues?`：ENUM 必填且至少一个；每项必须有 `value`，`label` 可选；defaultValue 须匹配某个 value。
- 备注：状态里的 `requiredItemProperties` 使用公司 Custom properties 的元数据属性 ID（非工作流属性 ID，排除 computed properties）。

**states 字段**：
- `name`：工作流内唯一 ID。
- `displayName`：图中显示名，可重复。
- `approverSourceProperty?`：指向 USER 类型 propertyId；该状态审批人。
- `notifierSourceProperty?`：指向 USER 类型 propertyId；通知对象（可多个状态共用）。
- `entryActions?` / `exitActions?`：动作数组。
- `editableProperties?`：本状态可编辑的 propertyId 列表。
- `requiredProperties?`：离开本状态前必填的 propertyId 列表；设为 required 会自动 editable。
- `requiredItemProperties?`：Release 中每个 item 必须填的公司元数据属性 ID。
- 约束：状态名唯一；每个 property 最多作为一个状态的 approvers；可作为任意多状态的 notifiers；editable/required 必须是本工作流属性；requiredItemProperties 必须是公司有效元数据属性。

**transitions 字段**：
- `name`（唯一）、`displayName`。
- `type`：`SUBMIT`、`APPROVE`、`REJECT`；第一个迁移通常是 SUBMIT，之后为 APPROVE/REJECT。
- `sourceState` / `targetState`：同一工作流内两个不同状态。
- `uiHint?`：`primary`（蓝，默认）、`success`（绿）、`danger`（红）。
- `actions?`、`requiredProperties?`。
- 约束：每个 source state 至多一个 APPROVE 迁移；APPROVE 的 source state 必须有 approverSourceProperty；只有 release creator 可执行 SUBMIT；只有当前状态 approver（或 admin）可 approve/reject；APPROVE 会生成 assembly/drawing content references；若公司策略 Require all approvers，则等待全部批准。

**actions**：
- `sendEmailNotifications`：仅 transition；发邮件/移动推送。
- `sendUserNotifications`：仅 transition；应用内通知。
- `markItemsPending`：release 全部 item 元数据状态置 Pending；不可用于 obsoletion；release 中不能在 markItemsReleased 之后使用。
- `markItemsRejected`：置 Rejected；不可用于 obsoletion；release 中不能在 markItemsReleased 之后或 markItemsPending 之前使用（第一份文档在此处措辞自相矛盾，第二份更明确）。
- `releaseItems`：置 Released 并创建 revision（按公司策略自动作废旧版本）；不可用于 obsoletion。
- `obsoleteItems`：置 Obsolete 并作废对应 revisions；不可用于 release。
- `updateItemPropertiesFromFeatureScript`：可在 state entry/exit 或 transition 执行 FeatureScript；参数为单个 map。
- 执行顺序：transition 的 actions 先于 source state 的 exitActions，再执行 target state 的 entryActions。
- 通知动作发给 release creator、源/目标状态的 approvers 与 notifiers；对 approvers 的通知含 approve 行动呼吁。
- 设计器中的图可动态拖拽调整布局；该布局调整不改变 JSON 语义。

**FeatureScript 动作**：
- `FeatureStudio ID` 与函数名；Feature Studio 必须与工作流定义同 workspace。
- 入参 map 键：`releasePackage`（BTReleasePackageInfo）、`currentUser`、`releaseCreator`、`transition`、`currentDate`（UTC ISO 字符串）。
- 返回 `{[itemId: string]: {[propertyId: string]: any}}`；仅返回值生效，FeatureScript 内修改输入无效。
- 值类型必须匹配元数据属性；USER 类型接受 `[{"id": userId}]`；工作流 USER 属性条目用户 ID 在 `entryId`，且仅 `entryType == 0` 的用户可映射；不接受 team/role ID。
- 任一属性更新失败/返回结构错误/FeatureScript 异常 → 动作失败并记录日志；系统错误消息会提示联系工作流管理员；可用 audit log 或支持工单排查。

**调试与审计**：
- 已发布工作流在 `Select release workflow` 中可用；debug mode 使用发布版本对应 workspace 的工作流定义，要求恰有一个 workspace 位于发布版本之上。
- debug release 锁定创建时 workspace 的 microversion；改动工作流后需新建 release 才能看到效果。
- Create Release candidate 对话框右上 overflow → `View audit log`；`View workflow` 显示图，最后状态高亮。
- 审计接口：`GET /api/workflow/obj/<object id>/auditlog`；响应含对象基本信息（发布工作流版本、是否 debug）及事件。事件类型：Object created/discarded/deleted、Properties updated（含旧/新值）、Comment added、User approved/rejected（含代表审批的 user/team/role ID）、Transition started/completed/failed、Action started/completed/failed、FeatureScript executed（含 console/notice/返回值）、Item metadata updates failed（含失败属性 ID、item href、错误）。

**设计器与质量规则**：
- JSON 编辑时右侧实时图；高亮 JSON 格式错误与某些构造错误（如无效 ID），但不会指出“迁移类型用错”等语义错误。
- 大小写敏感：`sourceState` ≠ `sourcestate`；对象/属性/部分值是硬编码。
- 建议描述性且唯一的 name/ID；上线前在测试零件上跑通，并让各阶段组实际审批。
- Obsoletion 工作流：无 `releaseItems`，改在状态上放 `obsoleteItems`；发布时选 `Obsoletion Workflow`；可用 `BOOL` 属性 `os-mark-rereleasable` 标记可重新发布。

#### 4.6.8 Activity、Action items、Public documents

**Activity**：
- 企业登录默认打开 Activity；管理员看全部企业活动，非管理员只看有权文档的活动。
- 左栏过滤器主要是 Project；可展开/折叠、拖宽。`All activity` 与按 project。
- 每条 tile：用户名（点开右栏用户详情：邮箱、状态、最后登录、近期活动）、文档名（点开文档详情：缩略图、描述、labels、共享规格、文件夹位置、创建者/最后修改、默认 workspace、近期活动）、overflow 菜单可新标签打开。
- 文档被编辑时显示 `Show changes`，展开变更列表；发布活动显示状态、note、workflow 名和 `View release`。
- 评论可在 tile 或右栏直接回复；@ 提及无权限用户会触发通知；长评论截断，`Show more`/`Show less`。
- 版本变化显示 `View diff`：在弹出框切换 tab 看版本缩略图差异；`Open 3D compare` 打开 Compare；2D compare 黑白模型 + 红（旧）/蓝（新）标示变化。

**Action items**：
- 顶部导航 `Action items`；过滤器：Type（comment/general/release 复选）、Status（any/open/draft/complete 单选）、Assignee（assigned to you/created by you/any role）、`Add filter`、`Clear all filters`、Search、Sort（Oldest/Newest，默认 Oldest）。
- `Create task` → Name/Description → 指派给 company 用户、Guest、曾共享文档的用户、Teams、Aliases → 默认类别 `Task`（可删/改）→ References（part/Assembly/Drawing/file/Feature Studio/application，可 Add reference、搜索、粘 URL、选版/看版本图）→ Priority & Dates（due date）→ `Save`/`Assign`/`Cancel`。
- 任务描述中的 URL 自动转 HTML 链接；Onshape 内部链接新标签打开并以 logo/可读文本显示文档、版本/工作区、tab；外部链接带外链图标和安全警告。
- 列表中圆点白心=未展开、蓝=曾展开；展开显示文档缩略图/名称、release notes、最后评论、工作流动作、当前状态、approver 名单及颜色（红=拒绝/丢弃，白=pending，绿=approved），`View release` 打开 Review release 对话框。

**Public Documents**：
- 企业域默认阻止访问公开文档，也阻止把企业数据设为 public；需 `Allow access to public documents` 全局权限。
- 无权限者的替代路径：登录 `https://cad.onshape.com`（个人账户）→ Public 过滤器 → 复制文档 → 按 Enterprise URL 或 cad.onshape.com 的说明在 Enterprise 中使用。

#### 4.6.9 Light user 明细

- **定位**：Full user 可创建/编辑/共享；Light user 只能查看、评论、导出企业共享给他们的数据。典型：内部供应链、经理/高管、外部供应商/客户。
- **界面**：登录后是精简版，默认显示 `View only toolbar`；文档无编辑权限的任何用户（含 Enterprise 与其他订阅）也会看到该工具栏。工具栏最多 **18** 个工具/功能，具体取决于 tab 类型及该 tab 是否具备相应内容。只有 company owner 能把公司设置为在所有文档中隐藏 View only toolbar。
- **工具清单（文档列出）**：
  - `Home`、`Rotate`、`Pan`、`Zoom to fit`（下拉含 `Zoom to window`、`Zoom`）；鼠标滚轮缩放。
  - `Section view`：选择平面、平面/圆柱/圆锥面或 mate connector，勾选确认。
  - `Inspection table`（仅 Part Studio）：查看 datums、dimensions、geometric tolerances、weld symbols。
  - `Properties`：Part Studio 可看名称、描述、part number、state 等；Assembly 亦可打开；Light 无写权限，**不能编辑**。
  - `Appearance panel`（Part Studio）、`Display states`（Assembly）、`Cut list`（Part Studio 且使用 Frames）、`Configuration panel`（有配置属性时）、`Custom tables`（Part Studio）、`Sheet metal table and flat view`、`Routing curve table`。
  - `Comments`（需 Comment 权限）、`Bill of Materials`、`Exploded views`（Assembly）、`Named positions`（Assembly）、`Simulation`（可查看并运行 Assembly 的 simulation）。
  - `Follow a user`（文档中有多个用户时出现；实时跟随，重新点击停止）。
  - `Export tab` / `Export selected` / `Select and export...`、`Print`、`Measure`、`Show analysis tools`、`Mass Properties`。
- **测量/质量属性**：Part Studio/Assembly 中选中实体后，右下角自动出现测量信息；选中零件/装配后出现 Mass properties 图标，可打开面板。无选中时 Mass properties 显示 Part Studio 属性；有选中时只显示选中零件。
- **选择**：选择是累加的；再次点击另一实体是追加而非替换；空格键或点空白清除选择。
- **导航**：Windows 标准三键鼠标：右键拖动=3D 旋转；滚轮=缩放；Ctrl+右键拖动或中键拖动=2D 平移。
- **文档结构**：文档 tab 在窗口底部；hover 显示缩略图；点击打开；左下 `Tab manager` 可竖排列表、按类型过滤、搜索。文档称 tab 分 **9 类**，但随后列出 Part Studio、Drawing、Feature Studio、Application、Image、Zip、Material library、PDF、Assembly（含 BOM）、X_T 共 **10 项**，语料自身数字与列表不一致。
- **搜索**：Documents 页高级搜索可按 part number、release status、version、revision 找零件/装配/图纸；示例用 `00203 rev B` 找到图纸与 3D 模型。
- **任务/评论/导出**：
  - 文档内右键 tab → `Create task`：task name、description、默认类别 `Task`（可改/删）、References（part/Assembly/Drawing/file/Feature Studio/application，可搜索/粘 URL/选版）、Priority & Dates、`Save`/`Assign`/`Cancel`。
  - `Comment` 按钮仅在有 Comment 权限时出现；右键几何/特征 `Add comment`；评论中 `@` 提及用户。
  - 右键零件/装配/图纸 `Export` 打开 Export 对话框；支持格式见 Exporting Files（本组未列）。
- **发布职责**：有 release management 职责的 Light/Full 用户（Enterprise 或 Professional）**不能发起 release**，但可观察、评论、审批。Light 工具栏无专用按钮；需从邮件/应用内/移动通知的 `View release` 进入审批对话框。
- **不可用**：`Share` 对 Light user 不可用（不允许共享文档）；`Properties` 不可编辑；无管理权限；全局权限可授予 Light user 的清单见 “Global permissions for Light users”。

#### 4.6.10 Analytics 与报表

**访问**：Documents 页左栏 Analytics 图标；需 `Access analytics` 全局权限；后端 Amazon QuickSight（浏览器）。

**左栏过滤器**：My analytics、Recently opened、Created by me、Shared with me、Scheduled reports、All（按 Action items、Audit、Documents、Permissions、Projects、Release、Resource、Users 文件夹分组，表格列 Name/Description/Access/Created by）。

**仪表板级操作**：
- 过滤：Controls 行 → 过滤器按钮 → 条件 → `Apply`；过滤器 label 的 overflow 可 `Reset` 或 `Refresh`。
- 保存：右上 `Save dashboard as` → Name（必填）、Description（必填）→ `Save`；出现在 My analytics 及原分类。
- 编辑：已保存 dashboard 右上 Edit 图标 → 改 Name/Description → `Save`/`Cancel`。
- 分享：已保存 dashboard 右上 Share → 选人/team/权限 → `Share`；默认 dashboard 不可分享。
- 删除：Trash 图标 → 确认 `Delete`；从所有过滤器移除。
- 导出：右上 Export → `Print`（Paper size/Orientation → `Go to preview` → Configure/Print/X）或 `Generate PDF file`（Working on your PDF → Your PDF is ready → `Download`）；`View exports` 右栏列出 PDF，可下载、Pin、关闭。
- 下钻：点数据单元格 → `Open in Onshape` 或 `Show [dashboard]`；例如 Release activity 的 Pending Releases 行可打开 Release candidate dashboard。

**Visual 级操作**：
- Customize：右上 Customize 图标 → 右侧面板（Group by/Rows/Columns 蓝、Values 橙）；字段 overflow：Sort by、Sort order、Aggregate（Second…Year）、Show as（Number/Currency/Percent）、Format、Hide、Show all hidden fields、Replace（可搜索）、Remove；`Reset visual` 或右上 Reset 图标恢复；`Add field` 加字段。
- 最大化/最小化：右上图标全宽切换。
- 排序：Sort visual 图标 → Sort by 列、Ascending/Descending、`Add sort` 次级排序、`Apply`。
- 导出：Table 可 CSV/Excel；Count/Graph/Map 仅 CSV；发送完整数据集，不受分页影响；文件生成/下载有提示。
- Summary：Overflow → `View summary data` 弹窗；可滚动、点列头排序、Rows per page 25/50/100、Previous/Next。
- 分页：默认显示前 500 条；Page size 100/500/1,000/10,000。
- 图表：Pie 悬停详情、点击 segment `Show all` 转表、点图例只亮该段、拖 divider；Bar 悬停/点击上下文，`Drill down to Hour`、`Show all`、`Analyze contributions`，拖 X 轴调范围；Donut 中心总数、悬停环段计数；Map 拖拽/±缩放；Map 在 Government 不可用。

**默认仪表板目录**（按过滤器）：
- My analytics：My Action Items、My Activity（近 30 天）、My Projects and Documents、My Releases（近 30 天）。
- Action items：Action items（个人未过滤）、Action items summary（企业近 365 天）。
- Audit：Activity overview、Audit trail、Enterprise health、IP tracking、User activity audit trail。
- Documents：Document Access、Document List。
- Permissions：Direct Permissions、Document Permissions、Permissions overview。
- Projects：Project list。
- Release：Duplicate part numbers in multiple documents、Obsoletion dashboard、Release activity、Release audit。
- Resource：Document activity、Modeling activity。
- Users：Team list、User list。

**Scheduled reports**：
- 仅 Enterprise administrators 与具 Analytics administrator 全局权限者；先保存 dashboard。
- 打开已保存 dashboard → Schedule report 图标 → Schedule name、Frequency、Format（仅 PDF）、收件人邮箱（无 dashboard 权限会警告，需先 Share）、Custom message → `Create`。
- 可见性：Enterprise admin 看全部；Analytics admin 只看自己创建的；其他企业用户既不能建也不能看。

### 4.7 Onshape Government (US)

- 基础设施：AWS GovCloud，遵循 ITAR、EAR。
- 与 Enterprise 相同但以下不可用：
  - Onshape Mobile apps；
  - 主工具栏 App Store 的第三方应用（仅允许 Government 专用私有应用）；
  - 用户 My account 菜单的 App Store dev portal；
  - Help 菜单的 Refer a friend；
  - Documents 页的 Public documents 与 Public 过滤器；
  - Share 对话框的 Link sharing 与 Public documents；
  - Transfer ownership 只能转到其他 Government 实例；
  - My account > Profile 的 Subscription、Payment options、Payment history；
  - Enterprise settings > Integrations 的 Dropbox、Google Drive；
  - Google SSO（改用自定义 SAML 2.0）；
  - AI Advisor；
  - Learning Center（需另建 Free Onshape 账户在 cad.onshape.com 登录访问）。
- 登录：首次/每个新标签或 URL 显示美国政府警示；页脚左侧显示 `Onshape Government (US)`；主区域 Activity/Documents/Analytics；Account 菜单的 dark mode 在 Government analytics 也不可用。
- 2FA：HMAC-SHA256，FIPS 140-3；管理员先确认成员 authenticator 支持 SHA-256。
- 计划：不能降级到其他计划；取消账户即移出 Government 计划；支持人员均为 US persons。
- 定价：指向 `https://www.onshape.com/en/pricing`。

## 5. 工作流、规则与错误状态

### 5.1 账户生命周期

1. **注册**：仅 Desktop/Android 可创建；选择 Free/Educator/Student 自助注册，其他计划经 pricing 页销售流程。
2. **激活**：邮件链接 → 密码 + 条款 → 语言 → 默认单位 → 鼠标方案 → 头像/昵称 → 浏览器检查。
3. **登录**：邮箱 → 选账户（若多个）→ 密码；企业可用专属 URL；否则 cad.onshape.com 先进个人账户。
4. **多账户**：一个凭证可属多个 Company/Classroom/Enterprise；用 `Switch to` 切换；一人可被多个 Professional 订阅付费，但同一邮箱不能同时 Free + Professional。
5. **删除**：先降 Free（若为其他类型）；`My account > Profile` 底部 `Delete my Onshape account` → 阅读警告 → 输入 `delete my account` + 密码 → `Delete my account`；显示操作摘要，建议截图。
   - 账户 30 天内删除，期间账户及文档不可访问；
   - 处理完成后不可恢复；你/公司拥有的文档不再对你或任何被共享者可用；
   - 文档内部链接（如 linked part）与已有副本仍有效；
   - 4 年不活跃自动删除（具体细节问 Support）。

### 5.2 计费/续费/取消生命周期

- 扣款点：订阅时、加用户时、每个 payment cycle 开始。
- Professional 取消：仅 owner 邮件，续期前 30 天；当前周期内继续有效，周期末转 Free；不退款；被移出唯一 Pro 订阅立即降 Free。
- Enterprise 取消：文档未给邮件/提前期；取消后全员 Free，公司文档仅原管理员可访问，项目转文件夹。
- Pro Trial：14 天；结束自动回 Free/Standard；降 Free 公司永久删除，公司文档转 owner；owner 仍可只读登录并购买。
- Student：到期前一周邮件；可续；不续或不再符合资格则降 Free；所有 Student 文档带 EDU badge 永久跟随（含副本、转移、后续公开/私有）。
- Educator：符合资格自动按年续；不符合则降 Free。
- 降级后的数据规则（跨计划一致）：
  - Onshape 不删除/不更改文档；
  - 私有文档仍私有但只读；
  - 可查看、导出、下载；
  - 新 Free 文档自动公开；
  - 可随时升级 Professional 恢复编辑；
  - 可右键 `Make public` 重新获得编辑（代价是公开）。
- 退款：Professional 取消不退；其他计划未说明退款细则。

### 5.3 数据保留/导出/所有权规则

- **所有权**：
  - Professional/Enterprise 中公司成员创建的文档归公司所有；个人账户文档归个人；
  - 公司 Owner/Admin/创建者可查看并删除公司文档；有 full permission 者可在 Trash 恢复或清空；
  - 公司文档分享给所有公司成员（Professional 文本明确 “automatically shared with all company members”）。
  - 升级 Enterprise：仅公司拥有文档迁移；个人文档需先 `Transfer ownership` 给公司，或升级后 `Transfer to <enterprise name>`；文件夹结构与共享保留。
  - 升级 EDU Enterprise 同理，课堂拥有文档迁移。
- **降级/取消**：
  - 文档/文件夹层级原样转给 owner；项目转文件夹；
  - Enterprise 公司文档仅原管理员访问；
  - Pro Trial 受邀用户创建的文档所有权回 owner；
  - Student/Educator 降 Free 后私有文档只读、可导出/下载。
- **删除**：
  - 账户删除 30 天内不可访问，完成后不可恢复；内部链接与副本仍活；
  - 班级删除不删除 Class Documents；归档保留学生提交访问；
  - 文档删除进入 Trash；`Permanently delete` 全局权限者可永久删除 Trash 与自己创建的 workspace。
- **导出**：降级后的私有文档可导出（见 Exporting files）；Light user 可导出；Analytics 报表可 CSV/Excel/PDF；Scheduled report 仅 PDF；个人副本不含版本历史/评论/共享。
- **公开/私有**：
  - Free 只能公开文档；被共享的私有文档只读；
  - 付费可建无限私有文档；
  - 企业域默认阻止公开文档与发布企业数据为 public；需全局权限；
  - Government 完全没有公开文档/link sharing。

### 5.4 权限/项目工作流规则与错误

- Project 创建者自动 Project Administrator 且不可撤销；必须始终有 Project admin。
- 修改 Project 的 scheme/role map/名称/描述需 Share 权限。
- 一个文档仅属一个 Project；移动文档进出需源/目标 full permission；移动后权限取目标 Project scheme。
- 文件夹继承 Project 权限；Project 不能在文件夹下创建，只能根层。
- 换 Permission scheme 会清空除 Project Administrator 外的 role map。
- Scheme 被引用时不可删除；改 scheme 影响所有引用项目。
- 依赖权限自动勾选：Share 需 Edit，Delete 需 Edit；不能构造缺依赖的组合。
- 无 Project 编辑权限复制 workspace，副本落根层并显示蓝条通知。
- Team 移除/删除会撤销团队共享但保留个人共享；最后一个有管理权限的成员不能被移除。
- Alias 加入 Approvers 时按 `Approve Releases` 权限过滤；无人有权限则 alias 不出现在选项；Observers 无权限要求。
- 企业管理员可看全部企业文档；普通成员只看被共享的文档。

### 5.5 发布工作流错误/状态

- 语法/格式错误：Publish 对话框顶部提示，需修复后重新 Publish；设计器可捕获 JSON 格式与无效 ID，但不捕获错误迁移类型等语义错误。
- 工作流不允许循环；状态名/迁移名/属性 ID 必须唯一；大小写敏感，拼错即失败。
- APPROVE 每个 source state 至多一条；APPROVE 的 source 必须有 approverSourceProperty；SUBMIT 只能由 creator 执行；APPROVE/REJECT 只能由当前 approver 或 admin 执行。
- `requireAllApprovers=true`：全部批准才迁移；任一拒绝立即 Rejected。
- `requireNote=true`：提交者与每个审批/拒绝者都必须填 note/comment。
- 错误项（Feature list error、rollback bar 未到底、Assembly error、Drawing 过期、引用过期、part number pending、pending task）在 option=true 时阻止 submit，false 时仅警告。
- FeatureScript 动作失败：错误值类型/属性 ID/返回结构/执行异常均导致动作失败，工作流迁移可能失败；audit log 记录 `Action failed`、`FeatureScript executed`、`Item metadata updates failed`。
- 取消发布重置相关设置为默认工作流，但不影响进行中的 release candidates。
- Debug mode 只有恰有一个 workspace 在发布版本之上时才启动；debug release 锁定 microversion，改工作流不影响已开始的 release。
- 自动两级迁移：第二级 optional 且无 approver 时 Pending→Released 自动完成。

### 5.6 SSO/2FA 错误状态

- SSO 配置失败常见原因：参数未按组织定制；需从 IdP 仪表板取正确值。
- 同一时间只能一个活动 SSO；切换时上传新配置并启用，不必删除旧连接。
- `Disable Onshape password sign in` 一旦启用，管理员也被强制 SSO，且用户不能登录 cad.onshape.com；文档建议先确认 SSO 可用，并保存 Password sign in URL 备用。
- Google：Domain whitelist 会放行该域所有邮箱为 Full user，误用通用域风险高。
- Entra ID：登录错误时关闭所有标签、完全登出 Microsoft 再登录；AD 的 “test connection” 按钮不可用。
- ADFS：必须上传 SP 证书并设 SHA-1（与一般 IdP 不同）；Microsoft 建议迁移到 Entra ID。
- Custom SAML：仅 HTTP-POST；Onshape 无 metadata XML；必须提供三项属性。
- 2FA：Government 需支持 SHA-256 的 authenticator。

### 5.7 支付错误

- 拒付原因可能为输入信息错误、余额、有效期/CVC、银行反欺诈；Onshape 无法给出确切原因，需联系发卡行；持续失败联系 Onshape。
- 无存储卡信息；改卡在 Payment options。
- 退款规则：Professional 无退款；取消后当前周期末降 Free。

## 6. 与其他章节的关系

本章是企业/账户/计费/治理层，向以下章节提供前置条件或消费其对象：

- **Documents Page / Document Tabs / Sharing / Transfer Ownership**：账户删除、降级、Company/Enterprise 文档迁移、Share 权限、Public Documents、Teams/Aliases 均引用 Documents 页与 Share 对话框；本组多次链接 `Transfer Ownership`、`Share Documents`、`Making a document public`、`Exporting files`。
- **Company/Classroom/Enterprise settings**：用户、Teams、Aliases、Project roles、Permission schemes、Custom properties、Categories、Items、Applications、Release management、Details、Authentication、Integrations 等 tab 是本组大量操作的落点。
- **Global permissions**：EDU 管理员、Light user、Analytics、Teams、Aliases、Release workflows 均以其为门禁；本组引用 “Understanding Global Permissions”“Global permissions for Light users”。
- **Release Management / Release workflow / Obsoletion**：自定义工作流、Action items、Release dashboards、Aliases 都与发布对象模型相连；上游是 Part Studio/Assembly/Drawing 的 release candidate，下游是 Analytics 的 Release activity/audit。
- **Analytics**：本章引用 QuickSight 后端、Access analytics 权限、Dashboard/Visual/Scheduled report；下游包括 Documents/Permissions/Projects/Release/Resource/Users/Audit/Action Items 各板。
- **Monitoring User Activity / Comparing**：Activity 的 diff、3D/2D Compare 依赖 Comparing 章节。
- **Comments / In-app notifications / Action items**：评论回复、通知、任务引用。
- **View only toolbar / Measure / Mass Properties / Analysis tools / Configurations / Display States / BOM / Exploded views / Named positions / Simulations / Follow Mode**：Light user 章节逐项引用这些查看能力。
- **Advanced Search / Documents Page**：Light user 的零件号/版本/修订搜索。
- **Importing Files / Customizing Materials**：Light user 的 Tabs/材料库说明。
- **Feature Studios / FeatureScript**：自定义发布工作流的 `updateItemPropertiesFromFeatureScript` 依赖 Feature Studio。
- **Security / 2FA / Identity Providers**：企业认证章节。
- **Pricing 页（外部）**：各计划价格与购买入口；本组只给外链。
- **Learning Center / Self-paced Courses / 技术简报**：各订阅页末尾的外部培训资源（需 Onshape 账户）。

上下游关系可概括为：计划/席位/域名 → 用户与角色 → 项目/权限方案 → 文档/发布/分析。账户降级、取消、移除用户是上游事件，会改变下游文档可编辑性、共享与席位；发布工作流是文档生命周期的下游，Analytics 再对发布/权限/活动做只读投影。

## 7. 对 LubanCAD 的可执行启示

> 只写文档能支撑的结论。`[文档明确]` 表示 Onshape 文档直接写出；`[推断]` 表示面向 LubanCAD 的工程化推导，不代表 Onshape 已实现细节。

### 7.1 计划/订阅与权限门禁（UI 表面）

- `[文档明确]` 需要一套 **计划模型**：Free、Standard、Professional、Professional Trial、Student、Educator、EDU Enterprise、Enterprise、Government (US)。每个计划决定：能否创建私有文档、是否有发布管理、是否有公司级自定义属性/材料库/共享/合并计费、是否有独立域名/管理/分析、席位类型。
- `[文档明确]` Free 的硬门禁：`Create private document` 不可用；若尝试，提示申请 Professional Trial；被共享的私有文档只能 View only。可写成验收断言：Free 用户创建私有文档必须被拒绝并显示升级入口。
- `[文档明确]` 降级后私有文档保留、只读、可导出/下载；新建文档自动 public；升级 Professional 后原 View only 文档自动变可编辑。应实现“计划变更 → 文档能力重算”的单一权限投影，而不是复制文档。
- `[推断]` 若 LubanCAD 不做订阅收费，也应保留 **Entitlement（能力开关）** 抽象，以便未来接入商业计划；UI 上至少要能显示当前计划、到期/续期日、升级/降级入口。

### 7.2 组织/租户与域名

- `[文档明确]` Enterprise/EDU Enterprise 有唯一域名 URL；成员同时拥有个人账户；从 `cad.onshape.com` 登录进个人账户，用 `Switch to <org>` 切换；企业文档归企业所有。
- `[文档明确]` Professional 是“公司”实体：合并计费、公司拥有文档、公司内自动共享；无独立域名、无企业分析仪表板。
- `[推断]` LubanCAD 应建模 `Tenant/Organization` 与 `User` 多对多；文档所有权需区分 `User-owned` 与 `Org-owned`；切换组织应改变当前租户上下文与文档仓库根，而不是切换登录会话（文档说无需重新登录；Enterprise 切换在部分流程需重输凭证，可作差异）。
- `[推断]` 若实现域名，需支持租户 URL 解析、个人入口与组织入口、邀请邮件中的组织 URL；URL 中的域名前缀也用于 SSO Entity ID 与 `companyName`。

### 7.3 席位、角色与权限

- `[文档明确]` 企业席位分 **Full / Light**；Light 最大 View/Export/Comment，无管理权；Full 可编辑，可为 Admin；Guest 是外部受控成员。管理员需能添加用户、分配 Full/Light、设 Admin/Member/Guest。
- `[文档明确]` 默认 Project 角色五类及权限：Project Administrators/Managers=All；Engineers=Edit+View；Reviewers=View+Comment；Suppliers=View only；高级权限含 Export/Link document/Share/Delete。
- `[文档明确]` 权限依赖：Share 需 Edit，Delete 需 Edit；Project Administrator 自动加入且不可删；被引用的 Permission scheme 不可删除；换 scheme 清空 role map。
- `[推断]` 可在 LubanCAD 先实现一个 **Role→Permission 矩阵 + Project 容器** 的最小闭环，UI 至少包含 Project roles tab、Permission schemes tab、Project 创建/编辑/克隆/移动；权限计算需支持从 Project→文件夹→文档继承。
- `[推断]` 需要 **Light user 专用 UI**（View only toolbar 最多 18 个工具）；若无此角色，外部供应商/高管场景无法安全只读访问。应把“能否分享/编辑属性/创建任务”等逐一映射到权限位。

### 7.4 账户生命周期与数据保留

- `[文档明确]` 账户删除需先降 Free；删除后 30 天内不可访问，完成后不可恢复；内部链接与副本仍有效；4 年不活跃自动删除。
- `[文档明确]` Pro Trial 14 天；降 Free 删除公司不可撤销；公司文档转 owner；受邀用户文档所有权回 owner；私有文档只读、可导出、可转 public；owner 可只读登录。
- `[文档明确]` Student 文档的 EDU badge 永久跟随，包括副本、所有权转移、公开/私有切换；Student 续期需 School level、Graduation year。
- `[推断]` 若实现试用/降级，需把 **“公司删除”与“文档保留”分开**：删除租户元数据但保留文档并转所有权；不能级联删文档。应写测试：Trial→Free 后 owner 可只读登录，文档仍可导出，非 owner 不可访问公司文档。
- `[推断]` 账户删除应实现软删除窗口（30 天），期间禁止登录/访问；到期硬删；删除完成后保留外部链接/副本的语义需明确（文档说仍有效）。

### 7.5 计费/续费/取消（如实现）

- `[文档明确]` 扣款时点：订阅时、加用户时、每个 payment cycle 开始；不存信用卡；改卡在 Payment options；Professional 取消仅 owner 邮件，续期前 30 天；不退款；周期末转 Free；被移出唯一 Pro 立即降 Free。
- `[文档明确]` Standard 按用户年费 $1,500（DESC）；其他价格未给。
- `[推断]` 计费 UI 至少需要：当前计划/席位/数量、下一扣款日、Payment options、Payment history、取消入口（owner 限定）、加席位预览；后端需要幂等的“加用户即按比例计费/下一周期生效”策略（文档只写“加用户时扣款”，未给按比例细节）。
- `[推断]` 测试断言：非 owner 取消 Professional 必须被拒；取消后当前周期仍有效；下一个周期变 Free；文档进入只读；无退款。

### 7.6 教育版（若做 EDU）

- `[文档明确]` 对象：Classroom、Class、Assignment、Submission；Educator 创建班级/作业；Student 只能看自己的作品；Publish/Close、Graded/Needs revision；Archive 保留提交访问；Clone 不复制成员；CSV 导入列 A 邮箱、列 B Student/Educator。
- `[文档明确]` 个人副本每次最多 10 个、每天最多 100 次；不含版本历史/评论/共享；需邮箱验证码。
- `[推断]` 最小 EDU UI：Documents 左侧 Classes filter、班级列表 Grid/List、Members tab、Assignments 列表、作业创建对话框（三种开始方式 + 共享限制 + 排期）、Preview as student、Activity CSV 导出、Dashboard。
- `[推断]` 测试断言：未发布班级对学生不可见；未发布班级不能发布作业；Close 后学生不能提交；Graded 后学生不能再次提交；班级删除不删文档；归档后学生仍可访问自己的提交。

### 7.7 企业 SSO / 2FA

- `[文档明确]` SSO provider 类型 8 种；同一时间仅一个 active；通用五步；`Disable Onshape password sign in` 会禁止企业用户登录个人域；多租户 Entity ID 加域名前缀；Google 支持 Domain whitelist 自动 Full/Light；Government 不支持 Google SSO；2FA 可由管理员强制；Government 2FA HMAC-SHA256。
- `[推断]` LubanCAD 若要做企业，应先做 **SAML 2.0 SP**：ACS `…/identity/saml2/sso`、Entity ID `com.onshape.saml2.sp`、NameID=email、三属性 firstName/lastName/companyName；Provider 配置 UI 字段按此对齐；还需 `Disable auto provisioning`、`Disable password sign in`、`Use entityId with company domain prefix` 三个开关。
- `[推断]` 测试断言：仅一个 active SSO；启用密码禁用后密码登录失败、SSO 登录成功；多租户 Entity ID 带前缀；Google 域白名单自动建 Full 用户；无 `Approve Releases` 的用户不能成为 approver（与 Alias 规则一致）。
- `[推断]` 2FA 强制应是租户策略，而非仅用户偏好；管理员可在 Authentication 页开启并观察成员是否已注册。

### 7.8 发布工作流引擎（高价值可复用规格）

- `[文档明确]` 工作流是 JSON，四对象 options/properties/states/transitions；支持 SUBMIT/APPROVE/REJECT；支持 entry/exit/transition actions；支持 FeatureScript 属性更新；不支持循环；可多 active；可 debug（workspace microversion 锁定）；可 unpublish；有 audit log。
- `[文档明确]` 迁移约束：每源状态最多一条 APPROVE；APPROVE 源状态必须有 approverSourceProperty；SUBMIT 仅 creator；APPROVE/REJECT 仅 approver/admin；requireAllApprovers 任一拒绝即 Rejected；自动两级无 approver 时 Pending→Released。
- `[推断]` 这是 LubanCAD 可以“按文档对标”的功能：先实现 JSON 解析 + 校验（唯一性、类型、依赖、无环、每状态 APPROVE 上限）+ 图预览 + publish/unpublish + debug；再实现 action（markItemsPending/Rejected/Released/Obsolete、通知）与 audit log。
- `[推断]` 建议把 options 的 11–13 个布尔项做成 **租户默认 + 工作流覆盖**；UI 上必须能显示“哪些来自公司设置、哪些被工作流覆盖”。
- `[推断]` 验收断言：循环 JSON 拒绝发布；重复状态名/属性 ID 拒绝；每源状态两条 APPROVE 拒绝；无 approver 的两级 optional 自动 Released；cancel/unpublish 后新建 release 不可选该工作流，进行中 release 仍可完成。

### 7.9 分析/审计/报表

- `[文档明确]` 仪表板需 `Access analytics`；可保存/分享/删除/导出 PDF/CSV/Excel；Scheduled report 仅 PDF；企业管理员看全部报表，Analytics admin 只看自己的；Visual 分页默认 500、可选 100/500/1,000/10,000；Map 在 Government 不可用。
- `[文档明确]` 审计事件覆盖文档打开/编辑、导入/导出/复制/转移/链接共享、失败登录、访问位置、发布提交/批准/拒绝/作废、用户/team 事件；IP tracking 专看导出/复制/转移/访问位置。
- `[推断]` LubanCAD 应先建 **事件表**（actor、document、tab、event type、timestamp、location、IP、metadata），再在其上做只读报表；不要为每个仪表板单独建一套状态。
- `[推断]` 最小可用报表：Document access、Document list、Permission overview、Audit trail、Release activity、User list；配合 CSV 导出即可覆盖管理员最常用场景；PDF 排期可后置。
- `[推断]` 测试断言：无 `Access analytics` 的用户看不到 Analytics 入口；Scheduled report 非 PDF 格式不可选；删除 dashboard 后从所有 filter 消失；导出 CSV 不因分页只导当前页。

### 7.10 政府/合规分支

- `[文档明确]` Government 与 Enterprise 的差异清单（无移动端、无第三方 App、无公开文档/link sharing、无支付页、无 Google SSO/AI Advisor、Transfer 仅限 Gov 实例、2FA HMAC-SHA256、不可降级、US persons 支持）。
- `[推断]` 若 LubanCAD 有政企部署，应把这些差异做成 **部署级 feature flags / 合规划分配置**，而不是散落条件判断；尤其“公开文档/链接分享/第三方应用/支付/外部云盘/Google SSO”应有统一开关。
- `[推断]` 验收断言：Gov 配置下 Public 过滤器不存在；Share 对话框无 link sharing；Transfer ownership 目标仅 Gov 实例；2FA 使用 SHA-256。

### 7.11 需要补齐的 UI 表面与参数清单（汇总）

**账户/计划**
- 右上 Account 菜单：My account、Company/Classroom/Enterprise settings、View support tickets、App Store dev portal、View in dark mode、Sign out。
- My account：Profile（Nickname/avatar）、Emails、Preferences（Language/units/view manipulation/Theming/Enterprise startup page/SSO auto-provisioning）、Security（2FA/password）、Devices、Applications、Early visibility、Subscription、Payment options、Payment history（Gov 无后三项）。
- Subscription 页：计划名、`Valid until`、Renew/Downgrade/Upgrade 按钮；取消确认对话框。
- 注册向导：Language、Length/Angle/Mechanical 默认单位、Mouse controls（Onshape/SOLIDWORKS/NX 10/Creo/AutoCAD）、Profile、Browser check。

**组织/权限**
- Enterprise settings tabs：Users、Teams、Aliases、Project roles、Permission schemes、Custom properties、Categories、Items、Applications、Release management、Details、Authentication、Preferences、Integrations。
- Project 对话框：name、description、Permission scheme、role map（user/team + role）、Add、OK。
- Team/Alias 对话框：name、description、Add users/members；Alias Approvers/Observers 过滤规则。
- 用户/权限矩阵四象限（Full/Light × Member/Guest）。

**SSO/2FA**
- Authentication 页：2FA enforcement、Single sign-on (SSO)、Configure SSO provider、Create SSO provider 对话框（Name、Provider type、Enable、Disable auto provisioning、Disable Onshape password sign in、Use entityId with company domain prefix、Upload configuration file）。
- IdP 侧参数：ACS、Entity ID、NameID、firstName/lastName/companyName；OneLogin/PingOne/ClassLink 的具体默认值与可选覆盖。

**发布**
- Enterprise settings > Release management：Enable managed workflows、Release workflow/Obsoletion workflow 下拉、View in document、Active 复选、Workflow preview、Save release settings；Revision scheme ID 复制。
- 工作流 JSON 编辑器：实时图、错误高亮、Publish/Replace/Unpublish、Debug mode、View workflow、View audit log。
- Release candidate 对话框：Release name、Release notes、Approvers、Observers、properties（USER/STRING/INT/DOUBLE/DATE/ENUM）、Submit/Approve/Reject 按钮颜色（primary/success/danger）。

**分析**
- Analytics 左栏 6 个过滤器 + 8 个分类；Dashboard 的 Save as/Edit/Share/Delete/Export/Schedule report；Visual 的 Customize/Sort/Export/Summary/分页；报表收件人警告。

**教育**
- Classes filter、班级成员/作业、创建作业三种模式、排期、Publish/Unpublish/Archive/Clone/Delete、Preview as student、Activity CSV、Personal copy 对话框。

### 7.12 可写成测试断言的验收点（精选）

1. `[文档明确]` Free 用户无法创建私有文档，尝试时出现升级/试用提示。
2. `[文档明确]` 降级 Free 后，原私有文档只读且可导出/下载；升级 Professional 后恢复可编辑。
3. `[文档明确]` Professional Trial 14 天；到期未购买自动回 Free/Standard；降 Free 删除公司且不可撤销，公司文档转 owner。
4. `[文档明确]` Professional 取消仅 owner 可发起，需续期前 30 天，周期末降 Free，不退费。
5. `[文档明确]` 企业取消后全员 Free；企业文档仅原管理员可访问；项目转文件夹。
6. `[文档明确]` 账户删除 30 天内不可访问，完成后不可恢复；内部链接与副本仍有效。
7. `[文档明确]` 同一邮箱不能同时 Free+Professional；一个用户可属于多个 Professional 订阅。
8. `[文档明确]` Project 创建者自动 Project Administrator 且不可撤销；一个文档只能属于一个 Project；换 scheme 清空 role map（除 Project Admin）。
9. `[文档明确]` Permission scheme 被引用时不能删除；Share 需 Edit、Delete 需 Edit 的依赖自动成立。
10. `[文档明确]` 同一时刻仅一个活跃 SSO；`Disable Onshape password sign in` 后密码登录被拒；多租户 Entity ID 必须带域名前缀。
11. `[文档明确]` Google Domain whitelist 自动provision；Government 禁用 Google SSO。
12. `[文档明确]` Release workflow 禁止循环；每个源状态至多一条 APPROVE；SUBMIT 仅 creator；APPROVE/REJECT 仅 approver/admin。
13. `[文档明确]` 两级 optional 工作流在无 approver 时自动 Pending→Released。
14. `[文档明确]` Unpublish 后新建 release 不可选该工作流，进行中 release 不受影响；设置重置为默认工作流。
15. `[文档明确]` Scheduled report 仅 PDF；收件人无 dashboard 权限时出现警告。
16. `[文档明确]` 个人副本每次 10 个、每天 100 次；不含版本历史、评论、共享设置。
17. `[文档明确]` 未发布班级对学生不可见；未发布班级不能发布作业；Close 后学生不能提交；Graded 后不能再次提交。
18. `[文档明确]` Government 无公开文档/link sharing/移动端/第三方 App/Google SSO；Transfer 仅限 Gov 实例；2FA HMAC-SHA256。

### 7.13 文档未说明 / 不应臆造

- 各计划（Free/Professional/Enterprise/Educator/EDU Enterprise/Government）的完整价目、折扣、税费、按比例计费规则、席位最低数量、存储/项目/文档配额：**文档未说明**（Standard 仅 DESC 给 $1,500/用户/年）。
- Professional/Enterprise 的合同周期长度（除“renewal date”“payment cycle”外）与提前取消的精确计费规则：**文档未说明**。
- 企业取消的具体申请入口/提前期：**文档未说明**。
- Light user 的席位是否单独计价：**文档未说明**。
- 项目/文件夹/文档的容量上限、版本保留期限：**文档未说明**。
- SAML 断言加密、SCIM 自动provision、OIDC：**文档未说明**（仅见 SAML 2.0/HTTP-POST 与 Google 的特殊方式）。
- 删除账户后“内部链接与副本仍有效”的具体技术实现：**文档未说明**。
- 各计划价格页内容、退款特例、教育版认证审核周期：**文档未说明**。

以上未说明项不应在 LubanCAD 的需求/测试中写成确定行为。
