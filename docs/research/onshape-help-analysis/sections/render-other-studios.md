# Onshape Help 全量分析报告 #13/14 — 渲染工作室核心 + 其他工作室

> 组文件：`groups/render-other-studios.txt`（29 主题，63,525 词）
> 范围：Render Studio 除 Libraries 目录页外的全部主题；Variable Studio；Feature Studio；PCB Studio（含 Altium 365、Rigid-Flex）；CAM Studio。
> 分析日期：2026-11-22。仅基于本地语料，未联网。

---

## 1. 本章概览

- **主题数**：29（与组文件声明一致）。
- **总词数**：63,525（逐主题词数求和与组头一致）。
- **覆盖子域**：
  1. **Render Studio**（22 个主题）：产品入口/标签生命周期、Basics、Interface 总览、Toolbar、Scene List、Graphics Area、Appearances Library、Appearance Functions、Appearance Modifiers、Textures and Bump Maps、Light Emission、Environments Library、Appearance/Environment/Camera/Scene 四个参数面板、Render Options、Advanced（升级面）、AxF Appearance、Appearance Set、Volume、Light、Examples and Resources。
  2. **Variable Studio**（1 个主题）。
  3. **Feature Studio**（1 个主题，FeatureScript 工作台）。
  4. **PCB Studio**（3 个主题：PCB Studio、Altium 365 Integration、Rigid-Flex PCB）。
  5. **CAM Studio**（1 个主题）。
- **文档更新日期**：语料未包含任何“最后更新”元数据，无法给出日期；仅出现产品版本引用（Render Studio 正式版 1.181；Onshape 1.158 之前的场景不做 Part Studio Material 回填）。
- **整体质量与抽取限制**：
  - 语料由 HTML 自动抽取。**大量表格被压平为 `|` 分隔行**（快捷键、图标、Appearance Functions/Modifiers、金属 RGB、PCB 命名、CAM 工具栏等），本报告已按行重组；个别表格的“图片列”完全丢失，只剩空单元格。
  - 图片仅保留 `[image: alt]`，因此**所有截图中的字段值、按钮位置、图标形状不可见**。多处正文写作 “Only available for .” / “Only available for ” 后接空句号，是计划徽章为图片导致；能从主题 description 补出的计划信息已在文中标注，不能补出的写“文档未说明”。
  - Render Studio 快捷键表存在源文重复：`shift+5 Top view` 出现两次，且 `shift+1 Front view` 与 `shift+7 Isometric` 并列；本报告照录并标注为源文重复。
  - Textures and Bump Maps 的“自定义 bump”步骤中有一处疑似源文复制残留：创建版本后写 “the .ies file is located in the Select light profile”，与 bump 上下文不符；本报告不据此推断行为。
  - 本组**不含** `Render Studio Libraries` 目录页（Appearances/Environments 的完整清单），但各界面主题已说明库的导航、搜索、分配与收藏机制；完整 catalog 需由另一个组补齐。
  - 无纯图片页；所有主题均有可读正文。视频仅有转录或无视频。

---

## 2. 主题清单与逐篇摘要

> URL 前缀均为 `https://cad.onshape.com/help`。表格中的“主题”与组文件 `===== TOPIC:` 标题一致。

### 2.1 变量与特征编程

| 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|
| Variable Studios | Variable Studios | `/Content/VariableStudio/variable_studio.htm` | 在文档内创建变量表（Name/Type/Value/Description），变量立即供工作区所有 Part Studio/Assembly 使用；支持 CSV `From import`、跨文档插入变量表（需版本）、折叠/排序、Release，Configured Variable Studio 不可发布。 |
| Feature Studios | Feature Studios | `/Content/FeatureStudio/feature_studios.htm` | FeatureScript 代码工作台：工具栏（撤销/重做、New feature、参数/查询/求值/数学/草图/操作函数列表、Import、Format、Commit、搜索、Co-complete、Monitor/Profile Part Studio、模块大纲、前进/后退引用），以及文本/符号/标准库导入三种搜索、Commit/Commit all、模块大纲导航。 |

### 2.2 Render Studio 入口、基础与界面

| 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|
| Render Studios | Render Studios | `/Content/RenderStudio/render_studios.htm` | Render Studio 产品页：从 Part Studio/Assembly 创建 Render Studio 标签，每个标签一个场景、可多开；列出完整快捷键、标签右键菜单（删除/新标签打开/重命名/属性/复制/复制到剪贴板/更新链接文档/移动到文档/创建任务）、降级后标签不可访问、Beta 标签已于 2025-02-28 删除。 |
| Render Studio Basics | Render Studios > Render Studio Basics | `/Content/RenderStudio/render_studio_basics.htm` | 基本导航与工作流：服务端渲染有延迟、多人有权限但不能同时编辑同一场景、导入前必须创建版本（场景是导入时快照）、从标签栏创建场景、Render scene→Render options→Render、重载浏览器后选择 Render scene 或 Edit Render Studio。 |
| Render Studio Interface | Render Studios > Render Studio Interface | `/Content/RenderStudio/render_studio_interface.htm` | 界面总览：顶部 Toolbar、左侧 Scene list（上下两段：几何与 Appearances）、中央 Graphics area、底部 Appearances/Environments library、右侧 Appearance/Environment/Camera/Scene 面板与 Render options；说明单选/多选、宽度拖拽、库横竖切换。 |
| Render Studio Interface - Toolbar | … > Toolbar | `/Content/RenderStudio/render_studio_interface_toolbar.htm` | Toolbar 命令：Undo、Redo、Insert、Render scene、Transform、Projector、Match scene properties（场景设置/环境/Named views 选择性匹配）、Volume（Advanced）、Light（Advanced）、Upgrade Render Studio；含 Match scene properties 的选项、灰色不可用资源与提示图标。 |
| Render Studio Interface - Scene List | … > Scene List | `/Content/RenderStudio/render_studio_interface_scene_list.htm` | 最详细的一篇：Scene list 层级与“上层优先/override”规则、选择高亮、过滤命令（`:part`/`:assembly`/`:errors`/`:hidden`/`:appearance`/`:light`/`:volume` 等）、图标表、右键菜单全量（编辑/显示隐藏/Isolate/Suppress/粘贴外观/Link to Part Studio appearance/Update linked document/Replace reference/Exploded view/Change configuration/Restore default appearance/Reset all tessellation/Tessellation/Use appearance from.../Convert to appearance set/Delete 等）、插入实体、Cosmetic threads、更新场景实体、爆炸视图、配置、Transform、Projector、跨 Render Studio 复用外观、Decals 限制。 |
| Render Studio Interface - Graphics Area | … > Graphics Area | `/Content/RenderStudio/render_studio_interface_graphics_area.htm` | 图形区：View cube/View tools（Isometric/Dimetric/Trimetric、Named views、Previous view、Zoom to fit/window、Perspective 默认开、Photoreal 默认、Stylized、Section view）、Named view 创建/访问/删除、Stylized 预设与 Custom（边色、边角 0–180°、平滑度 0–1、Shading、Levels、Replace appearances）、Section view（Caps 默认白色、Override cap color、Block light、多剖切面但一次只调一个）、右键菜单（隐藏/Isolate/Select other/复制粘贴外观/Link to Part Studio appearance 等）、最大化图形区。 |
| Render Studio Interface - Appearances Library | … > Appearances Library | `/Content/RenderStudio/render_studio_interface_appearances_library.htm` | 外观库：搜索（仅当前文件夹；支持 and/+/or）、右面板/底部切换、隐藏、名称 tooltip、翻转卡片看描述、右键 Assign/Add to favorites/Add to company favorites/Copy、6 种分配方法、移除、复制粘贴/拖放替换规则、收藏夹、Appearance Transform（x/y 平移 m、绕 z ±360°、x/y 缩放 0.001–1）、Scene list 中共享外观同步更新、Transparent 与贴纸（sticker）工作流及 OpenVDB 外观已知限制。 |
| Render Studio Interface - Environments Library | … > Environments Library | `/Content/RenderStudio/render_studio_interface_environments_library.htm` | 环境库：搜索/横竖布局/隐藏/名称提示；Apply lighting 与 Apply lighting and background 的区别、拖到空白处应用；恢复默认 Standard + 白背景；自定义 HDRI（.hdr/.exr，也可 jpg/png）、导入后需建版本；Lighting intensity 调亮建议（50,000–100,000；自定义 15,000–20,000）；Preetham 等环境可用 Daylight 位置/时间。 |
| Render Studio Interface - Appearance Panel | … > Appearance Panel | `/Content/RenderStudio/render_studio_interface_appearance_panel.htm` | 外观参数面板：Base（Base color、Diffuse roughness、Metallic、Reflection roughness/weight/anisotropy/rotation）、Transmission（Transmission color、Volume color、Volume reference distance、Transmission roughness/weight）、Global（Thin walled、IOR、Abbe number、Bumps）；多外观选择、Use bitmap file、Reset to default；Part Studio Material→Render Studio Appearance 映射规则与断链条件。 |
| Render Studio Interface - Environment Panel | … > Environment Panel | `/Content/RenderStudio/render_studio_interface_environment_panel.htm` | 环境参数：Dome（Infinite size、Horizon distance、Hemisphere、Tripod height、Lighting intensity、Rotation）、Image（Library environment/Custom image）、Advanced Lighting（在展开的 2D 环境图上放置 Disc/Rectangle/Ring 面光源，含 Direction/Radius/Width/Height/Thickness/Tint/Intensity/Softness、Base environment、Gradient 天空/地平线/地面参数、Solid color）、Ground（Automatic height、Reflective、Reflectivity、Roughness、Shadow intensity）、Daylight（Country/Province/City/Date/Time/Timezone/DST）。 |
| Render Studio Interface - Camera Panel | … > Camera Panel | `/Content/RenderStudio/render_studio_interface_camera_panel.htm` | 相机参数：Field of view 1–175°与 Focal length 1–2,063 mm 联动（仅透视可用）、近裁剪、Position/Rotation、Background（Solid color 或 Image；Reflect/Refract background；Scale Fill/Fit/Stretch；Repeat、Tone mapping、Depth of field）、Depth of field（F-number 0.063–64、Aperture blades、blade rotation、Radial bias、Focus distance+取点）、Exposure（Photographic：Film ISO/F-stop/Shutter/cd/m²；Simple）、Tone and contrast、Vignetting（Strength 建议 3）、Advanced（Compression variant、Gamma）、自定义背景导入。 |
| Render Studio Interface - Scene Panel | … > Scene Panel | `/Content/RenderStudio/render_studio_interface_scene_panel.htm` | 场景全局参数：Progressive rendering（Max samples、Adaptive resolution、Live navigation、Minimum samples per update、Maximum time per update、Denoise updates）、Matte fog（Visibility range/tint、Brightness、相对环境、Brightness tint）、Filtering（Pixel filter Box/Triangle/Gauss 与半径建议 0.5/1/1.5、Bloom、Denoiser）、Advanced（Smooth coarse shadows、Maximum path length、Instancing Auto/On/Off、White mode+Color、Spectral rendering、Conversion color space、Conversion intent、Observer、Caustic/Guided sampling）；含 Bloom 与 White mode 实操。 |
| Render Studio Interface - Render Options | … > Render Options | `/Content/RenderStudio/render_studio_interface_render_options.htm` | 输出参数：Still/Multiple/Name and location（Advanced）、Name/Folder/Views（Multiple，最多 60 视图）、Resolution（Custom、From view、4x3/16x9、Square、UHD 8k/2160、HD 1080/720、SD NTSC/PAL；非 Advanced 上限 2.1 MP=1920×1080，Advanced 上限 100 MP=10000×10000）、Format JPEG/PNG/HDR/EXR、Remove Background、Disable tone mapping（HDR/EXR）、Quality（Production/Medium/Preview/Custom：Max time、Max samples、Maximum quality、Quality 1.0、Converged pixel ratio）、Advanced（Panoramic、Stereo、Appearance masks）、Render/Download image、安全框、设置按标签记忆。 |

### 2.3 外观素材与灯光（普通版）

| 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|
| Appearance Functions | … > Appearances Library > Appearance Functions | `/Content/RenderStudio/appearance_functions.htm` | 函数型外观清单（约 60+ 条目）：光学/颜色（ior/Abbe、Sellmeier、black body、Kelvin to color、invert/scale/blend colors）、纹理/图案（bitmap/bump、checker、Perlin/flow/cellular/Worley/flake noise、tile、gradient、triplanar、FFF 3D print）、坐标/法线（coordinate source/projection/transform、blend normals、tangent space normal）、数据查找；说明函数需拖到 Appearance 参数上，蓝色高亮表示可接受参数；3 个示例（checker 透射/凹凸、Invert color、Surface blender+Gradient、Volume）。 |
| Appearance Modifiers | … > Appearance Modifiers | `/Content/RenderStudio/appearance_modifiers.htm` | 修改器型外观清单（18 项）：Add rounded corners、Add sheen、Add volume、Appearance set（Advanced）、Double sided、Add global bump map、Apply clear coat、Apply color fall off、Apply dust cover、Apply flake coating、Apply thin film、Surface blender、Surface falloff、Add sticker overlay、Add emission、Add thermal emission、Apply thin metal coat、Add cutout；说明拖拽=保留原外观挂到 Base material，右键 Assign=覆盖。 |
| Textures and Bump Maps | … > Textures and Bump Maps | `/Content/RenderStudio/textures_and_bump_maps.htm` | 纹理/凹凸：向 Diffuse roughness 拖 Checker pattern；自定义图片贴到 Base color（Import bitmap file 或右键 Use bitmap file），导入后需建版本才能选图；Tiling/Rotation/Offset 与 Projector；向 Bumps 拖 Checker texture bump map；自定义 bump 用 Import bump map file 或 Import bitmap file，参数 Tiling/Clip/Offset/Rotation/Bump mode/Bump strength。 |
| Light Emission | … > Light Emission | `/Content/RenderStudio/light_emission.htm` | 自发光外观：Add emission（默认 Base material diffuse、Intensity 1000、白色、Unit 默认 Lumen m2、Unit scale 100）、Add thermal emission（Temperature 6500 K 默认白；0–3500 红橙黄，10000+ 偏蓝）、IES 光度分布（Photometric light）、Display screen（Intensity 40、roughness 0.2、Repeat 默认开）、6 种色温 emitter（1900/2700/3000/4000/5000/7000 K，Lumens 默认 1000）、Diffuse area light（Flux 500）、Spot light（Flux 500、Scene unit size 1、Spot exponent 0、Spread angle 6.283 rad、Two sided 关）、Photometric light 全参数默认值。 |

### 2.4 Render Studio Advanced 与示例

| 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|
| Render Studio Advanced | Render Studios > Render Studio Advanced | `/Content/RenderStudio/render_studio_advanced.htm` | Advanced 升级面总览：通过右上角 Upgrade 按钮购买（按 Application 席位管理）；包含高级 Render options（Still/Multiple 60/Name and location/Panoramic/Stereo/Appearance masks/更高分辨率）、AxF、Appearance set、Volume、Light、Environment Lighting。 |
| AxF Appearance | … > AxF Appearance | `/Content/RenderStudio/axf_appearance.htm` | X-Rite AxF 自包含外观文件（TAC-7/MA-T12/MetaVue VS3200 扫描输出），支持 svbrdf/carpaint/volumetric 三类；参数含 Use sample size/Sample size U,V（m）、Scale U/V、Rotation、Texture wrapping（默认 Wrap repeat）、Normal texture strength（1.0=实测）、Geometry normal、Flakes；右键 Reset to default。 |
| Appearance Set | … > Appearance Set | `/Content/RenderStudio/appearance_set.htm` | 外观集修改器：拖到实体上后在 Appearance 面板顶部形成集合；可拖入多个外观；同一时刻仅一个 active（深蓝标签+蓝线），右键 Set as active；Remove from set 后若删除的是 active，则取下方（末尾则取上方）外观；Default 为最后一项时不可删。 |
| Volume | … > Volume | `/Content/RenderStudio/volume.htm` | 体积：工具栏 Volume→类型 Mie/Anisotropic/OpenVDB；Emissive、OpenVDB 数据、Density/Temperature channel、Density Multiplier/Offset/Relative to size、Scattering（Albedo/Density/Particle size/Anisotropy −1..1）、Temperature（Multiplier/Offset/Tint/Use density）、Bounding box（单位默认 Meter，含 cm/ft/in/mm/yd/Custom）；紫色包围盒；Scene list Volumes 组；双击编辑；可 Transform、Duplicate。 |
| Light | … > Light | `/Content/RenderStudio/light.htm` | Advanced 显式光源：Shape Point/Sphere/Disc/Rectangle/Cylinder/Infinite；Radius/Width/Height、Emit from both sides、Visible to camera；Distribution Diffuse/Spot（Cutoff angle、Falloff exponent、Uniform emission）/Profile（.ies、Rotation、Tilt、Uniform）；Emission（Flux lm、Color temperature K、Tint、Scale emission with size）；Aim（Aim point/Highlight location/Surface normal/Target point/Rotation）与 Position/Rotation；Scene list 的 Lights 组位于 Projectors 下、Transforms 上；相机可见形状、三轴操纵器、IES 分布网格；已知限制（非均匀缩放的灯光用 3 个缩放因子平均值；Infinite 位置无效；Point+Diffuse 旋转无效；启用 Aim 后不能用常规变换）。 |
| Render Studio Examples and Resources | Render Studios > Render Studio Examples and Resources | `/Content/RenderStudio/render_studio_examples_and_resources.htm` | 10 个完整案例：聚光灯+反光面、用颜色改金属材质（15 种金属 RGB 表）、金属闪片涂层、薄金属底+粉末涂层（Perlin）、玻璃中液体（水/牛奶）、自定义网格切口的金属格栅、自定义 mesh 围栏、热处理金属、FFF 3D 打印（外观+2 函数+Denoiser/Smooth coarse shadows 注意事项）、OpenVDB 体积烟雾、EXR/HDR 全景与背板合成（焦距匹配、裁切系数 1.5）；附 Iray/MDL/Poly Haven/IES/OpenVDB 资源链接。 |

### 2.5 PCB Studio

| 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|
| PCB Studio | PCB Studios | `/Content/PCBStudio/pcb_studios.htm` | ECAD↔MCAD 工作台：导入 IDF 2.0/3.0、IDX 3.0/3.5/4.0、Eagle v6+，建立 board/library/component 与 footprint 映射，Sync to Onshape 生成 Part Studio+Assembly（含孔数据、keep-in/out、配孔），Sync from Onshape 反向生成 board，Export IDF/IDX；含工具栏/图标定义、Boards/Libraries/Components 面板、board/component 右键菜单、首次设置与 Settings 对话框、hint.map 导入、组件映射规则、BOM 与 Ref. des. 编辑、降级边界。 |
| Altium 365 Integration | PCB Studios > Altium 365 Integration | `/Content/PCBStudio/altium_365_integration.htm` | Altium 账号与 Onshape 账号集成：Altium workspace 需管理员激活 Onshape PCB Studio Connector；Onshape My account > Integrations 添加 Altium 365；PCB Studio 内 Import from Altium 365 选择 workspace/project/variation；Push/Pull board 双向同步；导入自动生成 copper/solder mask/silkscreen decal 与 3D 组件映射；copper/silkscreen 仅单向；Rigid-flex 折弯区不显示 decal。 |
| Rigid-Flex PCB | PCB Studios > Rigid-Flex PCB | `/Content/PCBStudio/rigid_flex_pcb.htm` | 刚挠板：Part Studio 用 Extrude 建刚性区、Flex PCB model 建柔性区（Finish flex PCB，一特征一区）、Bend、孔 Tag、Mate connector 归属几何且 To selection、Flattened/Folded 配置、从 flat 配置装配并固定主刚性区、以 flat 同步 PCB Studio、导出 IDX 4.0；也支持从 IDX/Altium 导入并自动创建 Part Studio/Assembly/配置/mate connector，柔性区棕色、刚性区绿色。 |

### 2.6 CAM Studio

| 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|
| CAM Studios | CAM Studios | `/Content/CAMStudio/cam_studios.htm` | CAM 工作台：两个版本（CAM Studio 随 Professional 及以上，基础 2.5/3 轴；Advanced 增加 4/3+2/5 轴与高级策略）；从组件（part/workholding/stock）→job→machine/post→setup/WCS→tool→toolpath（Edges/Faces/Bodies/Holes × 9 种 pattern × Offset/Parallel/Adaptive 子模式 + 2.5 轴）→Preview（Back plot/Verify/Simulate）→Export（Post child/selected operations，输出 Gcode）；详列工具栏、视图、右键菜单、机器厂商列表、刀具/刀柄/Arbor、post 默认项与导出选项。 |

---

## 3. 核心概念与术语

### 3.1 通用“Studio/标签”模型

| 术语 | 英文原名 | 含义 |
|---|---|---|
| 工作室/标签 | Studio / tab | Onshape 文档内的一类工作标签（Part Studio、Assembly、Render Studio、Variable Studio、Feature Studio、PCB Studio、CAM Studio…），各有独立工具栏、面板、右键菜单，并遵循文档级版本/权限/复制/移动语义。 |
| 版本 | Version | 不可变快照。Render Studio 场景与 Variable Studio 跨文档引用都强制“先建版本”；PCB/CAM 的零件/装配插入也要求 version reference。 |
| 快照语义 | snapshot | Render Studio 场景是导入实体时的文档版本快照；之后文档内新增内容对场景不可见，除非再建版本并更新引用。 |
| 降级不可用 | downgrade inaccessible | Render Studio 与 PCB Studio 标签在 Pro/Enterprise → Free/Standard 后不删除但不可访问。 |

### 3.2 Render Studio 对象模型

| 术语 | 英文原名 | 含义 |
|---|---|---|
| 场景 | Scene | 一个 Render Studio 标签承载一个场景，根节点为 “Render Studio”。 |
| 场景列表 | Scene list | 左侧层级树；上半部几何（Part Studio/Assembly/Subassembly/Part/Surface/Face/Folder/Transforms/Projectors/Volumes/Lights），下半部 Appearances。 |
| 层级优先与覆盖 | precedence / override | 上层属性优先于下层；若上层设了 override，则覆盖所有下层设置；未设则用最近下层设置。实体不能跨层移动，变换矩阵随实体累积。 |
| 外观 | Appearance | 材质参数组合（Base/Transmission/Global），可分配给 Render Studio、Part Studio、Assembly、Part、Face；同名外观共享编辑。 |
| 外观函数 | Appearance function | 作用于“某个参数”的节点（纹理、颜色、法线、数据查找），必须拖到参数上；缩略图左上角有函数图标。 |
| 外观修改器 | Appearance modifier | 包裹并修改已有外观（保留 base），拖放=挂到 Base material；右键 Assign=覆盖原外观。 |
| 外观集 | Appearance set | Advanced 修改器；一个集合内多个外观，仅一个 active，用于快速比较方案。 |
| 链接外观 | linked appearance | 由 Part Studio 的 Material/Decal 映射而来，不可重命名；断开后可用 Link to Part Studio appearance 重链。 |
| 投影器 | Projector | 控制外观纹理在面/零件上的投影映射（Auto/Planar/Cubic/Cylindrical/Spherical/Surface），可带 Position/Rotation/Scale 与 Fit to entities。 |
| 变换 | Transform（Translate/Rotate/Scale） | 场景级非破坏变换；每次对话框只能一种操作，可多次叠加；Assembly 更新后 Render Studio 变换重新叠加。 |
| 体积 | Volume | Advanced 的立方体区域，承载外观的体积部分；可为 OpenVDB 3D 数据；非 Advanced 可打开含 Volume 的场景但不能编辑。 |
| 灯光 | Light | Advanced 显式光源实体（形状×分布×发光参数），场景内可变换；与“自发光外观”和“环境光照”是三套并行的照明来源。 |
| 环境 | Environment | 同时提供背景与场景照明（HDRI/程序化天空），可只应用 lighting 或 lighting+background。 |
| 背景 | Background | Camera 面板中可覆盖环境背景为纯色或图片；设置后覆盖 Dark mode。 |
| 显示器安全框 | safe frame | 打开 Render options 时图形区出现虚线框，表示输出取景范围。 |
| 渲染单元 | render / Render tab | 服务器渐进渲染；完成后输出到场景右侧的新标签（或按 Name/Folder 存文档，或 Download image 存本地）。 |
| 纹理集/参数 | Tessellation | 场景实体的细分控制：Auto/Coarse/Medium/Fine/Very fine/Custom（Angular deviation、Chordal tolerance）；可重置全部为 Auto。 |
| 命名视图 | Named view | 保存视角与 View tools 设置（除 Stylized）；可用于 Multiple 渲染（每视图一张，最多 60）。 |
| 去噪器 | Denoiser | Scene 面板 AI 去噪；可设 Start iteration、Denoise alpha。 |
| 白模模式 | White mode | 全场景统一漫反射外观，便于看形体；环境光照仍生效。 |
| AxF | X-Rite Appearance Exchange Format | 自包含外观文件（svbrdf/carpaint/volumetric），可含空间变化数据。 |
| IES | IESNA LM-63 photometric profile | 灯具配光文件，用于 Photometric light、Light 的 Profile 分布、面板 IES 外观。 |
| OpenVDB | OpenVDB | 体积数据格式；Volume 与 OpenVDB volume appearance 两条入口。 |
| MDL / Iray | Material Definition Language / NVIDIA Iray | 文档“Additional resources”指向的渲染/材质参考体系；本组不展开实现细节。 |

### 3.3 Variable / Feature Studio

| 术语 | 英文原名 | 含义 |
|---|---|---|
| 变量表 | Variable table | Name/Type/Value/Description 四列；默认类型 Length；可用前序变量定义后续变量。 |
| 导入变量 | From import | 从 CSV 取行列子集生成单一变量；Row 决定 Result type（Single value/Array/Map），Column 决定每项类型；可乘 Conversion factor。 |
| 工作区可用 | workspace availability checkbox | 勾选后变量才对本文档工作区所有 Part Studio/Assembly 可见。 |
| 配置化变量工作室 | Configured Variable Studio | 插入到其他文档时必须先设置配置；且不可 Release。 |
| FeatureScript | FeatureScript | Onshape 自研的建模 DSL，标准特征（Extrude/Fillet/Shell 等）也由其定义；Feature Studio 是其 IDE。 |
| 提交 | Commit | 自动保存代码；Commit 把代码应用到全文档；Commit all 提交所有 Feature Studio；未提交数量在菜单括号中显示。 |
| 协同补全 | Co-complete | Onshape Labs 的 AI 代码补全。 |

### 3.4 PCB / Altium

| 术语 | 英文原名 | 含义 |
|---|---|---|
| ECAD/MCAD | ECAD / MCAD | 电气 CAD 与机械 CAD；PCB Studio 是双向翻译器。 |
| 板 | Board | 导入的 ECAD 板或由 Onshape Part Studio/Assembly 同步出的板；Boards 列表按文档。 |
| 组件映射 | Component mapping | ECAD footprint（Part name/Part number）↔ Onshape 表示（无模型/ECAD 简单形状/自定义 Part）。 |
| 封装/无封装/链接 | Footprint / No footprint / Linked footprint / Linked component | 图标语义：无形状或用户排除；ECAD 简单形状未建模型；已建模型并链接；自定义 Part 文档不可用；自定义 Part 已链接。 |
| 刚/柔区 | Rigid / Flex zone | 刚性板区（Extrude）与柔性 PCB 区（Flex PCB model 特征），IDX 导入时用颜色区分（绿/棕）。 |
| keep-in/keep-out | Keep-in / Keep-out area | ECAD 允许/禁止放置元件的区域。 |
| PCB Outline | PCB Outline | 用户自定义轮廓（可标示标签位置），不是板外形 Board outline。 |
| 镀孔/非镀孔 | Plated / Non-plated hole | 电气孔/机械孔；同步后在 Part Studio 生成带 PCB Data 标签的特征。 |
| 参考位号 | Reference designator（Ref. des.） | BOM 中可编辑；文档警告可能重复或不合规。 |
| IDF / IDX | IDF / IDX | ECAD 交换格式；IDF 2.0/3.0、IDX 3.0/3.5/4.0。 |
| hint.map | PTC Creo hint.map | 仅含组件名/编号的文本映射表（ECAD_NAME→Part name，ECAD_ALT_NAME→Part number）。 |
| MCAD CoDesigner | Altium MCAD CoDesigner | Altium 侧协作扩展；PCB Studio 通过 Connector App 访问 workspace。 |

### 3.5 CAM

| 术语 | 英文原名 | 含义 |
|---|---|---|
| 作业 | Job | 一个加工任务，绑定 Bodies、Stock、Workholdings。 |
| 机床/后处理 | Machine / Post | 机床定义+post processor（把 CAM 数据翻译成特定控制器的 Gcode）。 |
| 设置/工件坐标系 | Setup / WCS | 定义机床坐标系下的原点与 X/Y/Z 方向；可有多个 setup。 |
| 工件/夹具/毛坯 | Part / Workholding / Stock | 被加工件、夹持件、去除材料的毛坯；三者插入均需 version reference。 |
| 刀具组件 | Tool / Arbor / Holder / Assembly | 刀具（cutter）、刀杆延长、刀柄、机床上的装配号。 |
| 刀路 | Toolpath | 由 Type（驱动几何类型）× Pattern（策略）× Sub-pattern（子策略）组成。 |
| 输出类型 | Output type | 2/3/4/5 轴；Tilting、Limits、Tool repositioning 与 Axis 设置。 |
| 回放/验证/仿真 | Back plot / Verify / Simulate | 三种预览：走刀动画、去材料检查过切/余量、完整机床仿真（含碰撞暂停）。 |
| 发布 | Post | 导出操作/程序为 Gcode 文件。 |

---

## 4. 功能与 UI 明细

### 4.1 Render Studio 入口、可用性与标签生命周期

- **可用位置/计划**：`Available in: Render Studio`。主题 description 明确：“This Onshape Render Studio application, **free for Enterprise and Professional plan subscribers**”。正文计划徽章为图片，抽取后成 “Only available for .”，不再有文字。
- **创建**：从 Part Studio/Assembly 的 Tab bar 点 `Insert new tab` → `Create Render Studio`，弹出 `Select part, part studio, or assembly` 对话框。选择部件/Part Studio/Assembly；**每次打开对话框只能插入一个实体**，但同一场景可插入多次。
- **版本强制**：场景是导入时的文档快照，**导入实体前必须存在版本**；对话框内提供 `Create a version in [Document]` 链接。也可随时通过 Document 面板的 Create version 按钮建版本。
- **场景数量**：每个 Render Studio 标签一个场景，可创建任意多个标签；标签可 Duplicate/Copy to clipboard/Move to document。
- **Beta 清理（历史边界）**：1.181 正式版之前的 Render Studio beta 标签于 **2025-02-28 删除且不可恢复**；其渲染输出保留在独立 Render tabs 中。
- **多用户**：同 Company/Enterprise 且有文档权限的多个用户可处理同一场景，但**不能同时**编辑；不支持实时协作。`Open in new browser tab` 会弹出“一次只能一个用户打开”的提示。
- **降级**：Pro/Enterprise→Free/Standard 时 Render Studio 标签不删除但不可访问。
- **重载浏览器后的二选一**：`Render scene`（直接打开场景+Render options）或 `Edit Render Studio`（进入编辑）。

### 4.2 Render Studio 快捷键（源文全表）

| 快捷键 | 动作 | 备注 |
|---|---|---|
| esc | Cancel | |
| space | Clear selection | |
| delete | Delete selection | |
| ctrl+c / cmd+c | Copy Appearance | |
| ctrl+u / cmd+u | Contact support | 文档如此；非通用撤销 |
| ctrl+v / cmd+v | Paste Appearance | |
| ctrl+z / cmd+z | Undo change | |
| ctrl+y / ctrl+cmd+z | Redo change | |
| alt+t | Open tab manager | |
| y | Hide selected parts | |
| shift+i | Isolate | |
| shift+y | Show selected parts | |
| shift+1 | Front view | |
| shift+5 | Top view | **源文重复出现两次** |
| shift+3 / shift+4 | Left / Right view | |
| shift+6 | Bottom view | |
| shift+7 | Isometric view | |
| shift+n | Rename selection | |
| shift+v | Named view | |
| shift+x | Section view | |
| shift+z | Zoom in | |
| z | Zoom out | |
| f | Zoom to fit | |
| w | Zoom to window | |
| ` | Select other | |

补充：View tools 中 `Isometric` 亦标 shift+7；`Zoom to fit` 标 f；`Zoom to window` 标 w。Feature Studio 的 alt/option+c 是搜索工具，属于另一工作室（见下）。

### 4.3 Toolbar 与 Match scene properties

Toolbar 条目（从左到右按正文顺序）：
1. `Undo` / `Redo` — 文档级撤销/重做。
2. `Insert` — 打开选择部件/Part Studio/Assembly。
3. `Render scene` — 打开 Render options；可渲染到文档标签或 Download image 到本地 Documents。
4. `Transform` — 打开 Transform 对话框+图形区操纵器。
5. `Projector` — 新建投影器。
6. `Match scene properties` — 与当前或其它文档的另一个 Render Studio 匹配：`Scene settings`（Scene 面板）、`Environment`（Environment 面板）、`Named views`；`Replace named views with the same name`；Named views 下拉可 All 或逐个；资源缺失/无权限时复选框灰色不可选；信息图标有提示。
7. `Volume`（Advanced）。
8. `Light`（Advanced）。
9. `Upgrade Render Studio` — 打开 Advanced 升级页。

### 4.4 Scene List（26 个图标/菜单语义的完整归纳）

**结构**：上半可滚动区=几何+Transforms+Projectors+Volumes（Advanced）+Lights（Advanced）；下半=Appearances。宽度可拖拽。单选时 Appearance 面板显示参数；多选时只列外观列表；Transforms/Projectors 只能单选，其余可多选。Appearance 面板只对单一选中项显示完整参数，按 space 清空后再单选。

**层级与优先级**：上层属性优先；上层 override 覆盖所有下层；上层未设则最近下层设置向更下层传播。实体不可跨层移动。变换矩阵随实体存储并累积；变换顶层（如整个 Render Studio）会带动全部子级。示例：把顶层 y 从 1 缩到 0.1，整场景一起缩小。

**选择反馈**：hover 场景列表行浅蓝、图形区黄色轮廓；点击行深蓝、图形区黄色填充；被遮挡也可见。点击切换选择；可加选/减选（等价 Ctrl+click）。

**过滤**：`Filter by name`；Filter 切换按钮支持冒号命令：`:part`、`:assembly`、`:folder`、`:errors`、`:suppressed`、`:hidden`、`:shown`、`:appearance`、`:decal`、`:transform`、`:projector`、`:light`、`:tessellation`、`:reference`、`:volume`。可组合（如 `:assembly :errors`、`:part :hidden`）；输入/选择后图标变蓝，Clear 清除；选择命令会替换现有过滤；**Faces 不能被过滤**。`Show search results as list` 可把层级结果展平。

**图标表（文本可辨识部分）**：
- 顶层 Render Studio、Part Studio、配置化 Part Studio、Assembly/子装配、配置化装配、Part、配置化 part、Surface/Face(mesh)、Assembly folder、Projector、非 Auto 的 tessellation、显示/隐藏、Translate/Rotate/Scale transform、Appearance、链接 Appearance、Decal、链接 Decal、Volume（Advanced）、Light（Advanced）。
- Linked references 图标表：更新可用、链接到分支最新版本、有更新版本、revisioned 最新、有新 revision、pinned 各种组合、子级更新/固定、自动创建的版本、Auto obsolete。位置与工具提示见原文；这些图标语义与 Assembly 引用管理一致。

**右键菜单（按对象类型可用性不同）**：
- `Edit`（Transform/Projector/Volume/Light 对话框）。
- `Rename`（Appearance/Projector/Volume/Light）。
- `Show all`；`Select all entities`（该操作的全体）。
- `Hide` / `Show`：适用于除 Transforms、Appearances、Projectors 外的项；眼睛图标；**隐藏不持久**，重载/重新登录后恢复可见。
- `Hide all`：隐藏当前选择及以下全部。
- `Isolate`：仅 Part/Part Studio/Assembly（不可用于 Render Studio 根或 Face）；Transforms/Projectors/Volumes/Lights 也可 Isolate；图形区顶部出现提示条，Done 退出。
- `Suppress`/`Unsuppress`：除 Face 外均可；抑制父级会抑制全部子级；抑制项在 Scene list 中斜体、变暗、删除线；关联的 Appearance/Transform/Projection 保留但不显示。
- `Paste appearance`、`Unassign appearance`、`Link to Part Studio appearance`（见 4.5）。
- `Update linked document`：Reference manager，可 Update to latest 或选择版本；当前工作区内的更新无需新版本/更新，工作区外的更新才需要。
- `Open linked document`（新浏览器标签）、`Pin`/`Unpin reference`、`Replace reference`（用另一个顶层 Part Studio/Assembly 替换）。
- `Exploded view`：若装配有爆炸视图，选择后图形区显示；可切回 `Default`。
- `Change configuration`：Select configuration 对话框；插入时也可选配置。
- `Restore default appearance`（仅顶层 Render Studio）：若 Default 被删/替换则恢复；若已被替换，恢复不会覆盖替换项。
- `Reset all tessellation`（仅顶层）：全部重置为 Auto（Reset/Cancel）。
- `Select matching instances`（装配下 Part/子装配）：选择所有匹配实例（如阵列实例）。
- `Expand/Collapse`（全部或选中）；顶层只有全部。
- `Tessellation`：选项 Auto/Coarse/Medium/Fine/Very fine/Custom；Custom 额外 `Angular deviation`（如 10°→圆柱 36 个平面）、`Chordal tolerance`；设置向所有未显式设置的下层传播；非 Auto 显示 tessellation 图标。
- `Use appearance from...`：从当前/其它文档的另一个 Render Studio 带入已应用外观。
- `Assign`、`Unlink appearance`（链接外观不可重命名）。
- `Duplicate appearance/volume/light`：复制参数，副本置于当前项正下方。
- `Copy from [Appearance]` / `Paste Appearance on [Appearance]`：源替换目标；目标未改名则用源名，已改名则保留目标名。
- `Remove unused Appearances`：一次清空未使用外观；没有可移除项时给出蓝色信息提示。
- `Convert to appearance set`：一次只能转换一个外观；多选时不可用；若外观用于多个实体，每个实体在 Appearance 面板顶部各有一个 set。
- `Delete`：删除一个或多个顶层实体；不能删除 Part Studio/Assembly 下的 face/part，不能删除正在使用的外观；可 Undo。

**插入**：`Insert`→对话框；每次一个实体；支持 Current/Other documents 的 part、composite part、surface、Part Studio、Assembly；Part Studio/Assembly 可带配置（Insert 时下拉选择，或插入后 Change configuration）。

**Cosmetic threads**：Part Studio 的外螺纹/攻丝孔装饰螺纹会原样带入场景并可渲染；**不能在 Render Studio 移除**，只能在 Part Studio 调整。

**更新实体**：外部更新后场景列表出现 “update linked” 图标；当前工作区内更新立即可用；工作区外需新版本→右键 `Update linked document`→Reference manager 勾选并 `Update selected`→标签重载→关闭对话框。

**爆炸视图**：右键 `Exploded view`→`Default` 下拉选择→绿色勾；可反复切换。

**Transform**：按钮→对话框；`Entities to transform` 可预选或对话框中选择（Render Studio/Part Studio/Assembly/Part/Volume/Light；**Face 不可变换**）；原点是所有实体中心（多个实体取组合中心）；选择时显示包围盒；`Transform` 下拉 Translate/Rotate/Scale，每次只能一种；Translate 单位 **米**、可正负；Rotate **−360°~+360°**；Scale 相对原尺寸，0.001–1 缩小，轴不能为 0，`Scale uniformly` 默认勾选，取消可 X/Y/Z 分别缩放；`Hide ground plane`；Translate/Rotate 有图形操纵器，Scale 无数值外操纵器；绿勾提交；多次变换按创建/列表顺序应用；装配更新后 Render Studio 变换重新叠加（非破坏）；Transform 项可 Edit/Select all entities/Isolate/Suppress/Delete。

**Projector**：按钮→对话框：`Name`；`Entities to add projector to`（整个 Render Studio/Part Studio/Assembly/Part/Face；可预选）；`Projection type` Auto/Planar/Cubic/Cylindrical/Spherical/Surface；`Normalized`（仅 Cylindrical/Spherical：一次水平旋转覆盖 2 次纹理重复）；`Capped`（仅 Cylindrical：顶底加平面投影）；`Apply per entity`（跟随实体变换）；`Position`（长度，X/Y/Z）；`Rotation`（度）；`Scaling`（比例，1=原始）；`Fit to entities`（只在：已选实体、Position 或 Scaling 至少一个会变化（Rotation 不变）、非 version 只读、类型非 Surface 时出现；用包围盒拟合，Planar 只缩两维，其它三维；拟合后仍可继续编辑；拟合基于包围盒而非真实几何）。对话框打开时选中实体只显示轮廓不显示实心填充；投影器各有类型对应的变换工具；位于 Scene list 底部 `Projectors` 下拉下。

**Use appearance from...**：右键 Appearances 列表或某外观→`Use appearance from...`→Select Render Studio（Current/Other documents）→对话框：`Replace duplicate appearances`（同名覆盖；不勾则带序号后缀）；`Appearances` 下拉 All/逐个；`Apply`/`Cancel`；带入后按字母序排列；自定义参数保留；无权限资源灰色不可选；可建空 Render Studio 作为常用外观容器；All 勾选再取消后仍全选（源文如此）。

**Decals**：Part Studio 的 Decal 在插入场景时转换为 Scene list Appearances 中的 Decal（链接图标）；Part Studio 修改后须建版本并更新引用才同步；在 Appearance 面板改 Decal 参数会显示未链接图标，但仍跟随源投影/UV。参数：`Decal image`（Image、Use alpha channel、Brightness 0–1、Contrast 0–1、Invert colors）、`Decal appearance`（Diffuse roughness、Metallic appearance、Reflection roughness、Reflection weight、Reflection anisotropy、Anisotropy rotation（1=360°）、IOR、Bumps）、`Decal transmission`（Transmission color、Transmission weight、Transmission roughness）。限制：**不能从库选择/分配**，只能由源 Part Studio 插入；不能复制或移除；不能隐藏（权宜：Transmission weight=1，需 Transmission color 白且哑光）；**平面面最多 3 个重叠 Decal，圆柱面最多 3 个**，多出的导入但不可见；应用顺序由源 Part Studio 创建顺序决定。

### 4.5 Appearances Library 与分配/复制/收藏

**导航**：`Search appearances` 只在当前选中 folder 内搜索；支持 `and`、`+`、`or`；结果显示在右侧缩略图列表；清除用退格+Enter 或清空图标。右上角 `Show library in the right panel` 切换竖版；竖版时可将函数拖到 Appearance 面板图标上悬停展开再放到参数；`Hide/Show` 折叠；名称 tooltip；卡片可翻面看描述（同一时刻只翻一张）。

**库右键菜单**：`Assign`、`Add to favorites`（任何用户）、`Add to company favorites`（Pro 公司/Enterprise 且有权限）、`Copy Appearance`。函数型外观无法直接分配给 part：右键菜单缺失/拖放不弹菜单，说明它是 function。

**分配外观的 6 种方法**（可多选实体后一次性分配）：
1. 从库拖到图形区已选 **part**（只能 part，不能 face）。
2. 从库拖到 Scene list 的 Render Studio/Part Studio/Assembly/Part/Face。
3. 在 Scene list/图形区选中实体，右键库外观→`Assign`。
4. 已存在于 Scene list Appearances 的外观，拖到图形区 **part**（只能 part）。
5. 已存在外观，选中实体后右键 Appearances 列表外观→`Assign`。
6. 已存在外观，选中实体后从 Appearances 列表拖到 Scene list 的一个已选实体（只能一个实体）。

**分配传播**：分配给某实体后，其下没有显式外观的子级都继承。给已有 face 外观的 part 分配新外观时弹出 `Clear face appearances` 提示：点链接→清除所有 face 外观并整体应用（**这是 2 个独立 undo 步骤**：清除、分配）；点 x→保留已有 face 外观，新外观只应用于无外观的 face/part。通过库分配时如已存在完全相同外观，会弹 “Use existing appearance” 提示；点链接复用，点 x/忽略则生成副本，且后续不再提示。**从库拖放总会新建外观**，推荐“第一次从库分配，之后从 Appearances 列表分配”。

**移除**：Scene list 多选 part/face→右键 `Unassign appearance`；图形区右键一次只能一个 part/face。

**复制/粘贴**：来源可以是库、Appearances 列表、图形区 part/face；目标可以是图形区一个或多个 part/face、Scene list 一个实体（不能多实体，但可粘贴到顶层 Render Studio 使全场景生效）、Appearances 列表中的一个外观。拖放也可完成上述替换；粘贴到链接外观会断链并替换。快捷键 ctrl/cmd+c、ctrl/cmd+v（光标位置需正确）。粘贴到未改名目标用源名；已改名目标保留目标名。Appearances 列表内源替换目标会移除目标，所有原目标使用者改用源外观。

**收藏**：任何用户可加 `My favorites`；Pro/Enterprise 有权限可加 `Company favorites`；空收藏夹不显示；外观可同时在两处；星标在缩略图右下；右键 `Remove from favorites` / `Remove from company favorites`。

**Appearance Transform**（面板中的子菜单）：`Translation` x/y（米，正负）、`Rotation` 绕 z ±360°、`Scale` x/y（0.001–1 缩小，1=原始）。只改外观不改零件；共享同一外观的多个零件一起变化；可展开到 face 级单独变换。

**Scene list Appearances 段**：应用后按使用情况共享；改名便于定位；改一个使用者参数，所有使用者同步。

**透明与贴纸**：透明→搜索 `Transparent` 并 Assign；贴纸（catalog 里的 sticker 方案）→`Add sticker overlay`、Sticker mask=1、将 `Import bitmap file — Bitmap texture` 拖到 Sticker color、选图、Placement（默认 Tiling 1×1，无 Offset/Rotation；示例改 6×6 并 Clip）、mask 用同一图与相同设置、Scalar mode 选 `Mono alpha`、可换 Base material、可把面变透明保留贴纸。文档明确：**现在推荐直接用 Part Studio 的 Decal**。

**库 Notes**：函数无法直接分配；Appearance 面板为空通常是多选；自发光外观要保证场景有墙/面可反射，若全黑提高 Intensity 和/或 Unit scale；图案/纹理太小太大改 Scale（和 Intensity）；OpenVDB volume appearance 若不可见，在 Part Studio/Assembly 中绕 2 轴轻微旋转并更新 Render Studio，或改用 Volume。

### 4.6 Appearance Functions（约 65 条，按类归并）

**通用规则**：全部位于顶层 `Appearance functions` 文件夹，缩略图左上角函数图标；只能拖到 Appearance 面板的“可接受参数”上——拖拽悬停时**可接受参数变蓝**，落到鼠标下参数；只有 `Bumps` 参数接受 bump 类函数。函数可叠函数（如 Surface blender 的 Blend weight 上再放 Gradient）。正常点击/拖放不能把函数当材质分配给零件。

**类 1：光学/颜色/数学**
- `Spectral index of refraction (ior)`（Abbe number ior）：给接受颜色的参数加色散；Abbe 0=关，25–85 为色散材料。
- `Spectral index refraction`：用 Sellmeier B/C 系数定义色散。
- `Black body emission` / `Black body volume emission`：黑体发光/加热粒子场，调 blend、色温 1/2。
- `Architectural gloss to rough`：gloss→roughness（Iray v2 Arch+Design 语义）。
- `Convert Kelvin to color`、`Invert color`、`Scale color`、`Blend colors`（2 层、28 种混合模式）、`Color intensity`、`Get red/green/blue color`、`Get color component`、`Convert color to vector`、`Convert vector to color`、`Convert vector to floats`、`Vector length`、`Cosine 1d`、`Sine 1d`。
- `Volume coefficient`：按距离和 tint 计算体积系数（可放 Absorption coefficient）。
- `Data is valid`、`Data lookup color/float/float2/float3/integer`、`Data lookup uniform color/float/float2/float3/integer`（表中无描述，属数据查找类）。

**类 2：纹理/图案（可放 base/global/transmission 颜色参数，除 bump/normal）**
- `Import bitmap file`（Bitmap texture；contrast/brightness/invert/scalar mode）、`Import bump map file`（Bitmap bump texture 与 heightfield 两种条目；wrap/bump source/animation/crop/normal/B-spline/factor/clip/UV）。
- `Checker pattern`（3d texture）、`Checker texture bump map`（placement UV/object space、tiling、offset、rotation、blur、bump strength）。
- `Gradient 3-color/position texture` / `... bump map`（linear/square/box/diagonal/90-360/radial）。
- `Tile pattern` / `Tile texture bump map`（grout、special column/row、odd row offset、number columns/rows、missing tile、seed、random row offset、brightness variation、UVW）。
- `Flow noise` pattern / `Flow noise texture` bump（progressive v offset/u scale、levels、level intensity gain、phase）。
- `Perlin noise` pattern / `Perlin noise texture` bump（billowing、levels、upper/lower threshold）。
- `Cellular noise` pattern / `Cellular noise texture` bump（cell type/shape、threshold）。
- `Worley noise` pattern / `Worley noise texture` bump（size、mode、marble、dent、noise distortion/bands/threshold、edge）。
- `Flake noise` pattern / `Flake noise texture` bump（density/intensity/max size/metric/noise type/scale/UVW）。
- `Triplanar` texture / `Triplanar normal map texture`（3 张 2D 文件，各自 tiling/offset/rotation，use object space、rotation of origin、blend range/mean color/strength）。
- `FFF 3D print` Texture / Bump map（层高、挤出宽度、填充；bump 会生成与几何差异大的法线，建议开 Smooth coarse shadows）。

**类 3：法线/坐标/混合**
- `Coordinate source`（UVW/world/object + texture space）、`Coordinate projection`（坐标系、投影变换 TRS/matrix、9 种投影类型、texture space）、`Coordinate transform`（position/tangent U/tangent V 矩阵）、`Rotation translation scale`（Euler→TRS 给 Coordinate projection 的 projection transform）。
- `Tangent space normal texture`（bitmap 颜色→切线空间法线；wrap U/V、animation、crop、flip tangent、scale/factor/clip/offset/UVW）。
- `Blend normals` 两条：混合两个法线/在基础法线上叠细节法线，调权重。
- `Surface blender`（在 Modifiers 中；Base material/Blend material/Blend weight，见类 4 示例）。
- `Normal map — Texture`（切线空间法线贴图；uv space index、tiling、flip v、clip、offset、rotation、strength、normalmap 文件；Normal map 纹理自动 Linear，颜色参数可右键选 Linear）。

**示例要点**：
- Checker pattern 放到 `Transmission weight`：白色透光、黑色显示本体色，即透射遮罩；Checker texture bump map 只能放 Bumps。
- Invert color 放 Base color，选红得青。
- Surface blender 的 Base/Blend 可拖入两个完整外观；Blend weight=1 混合；再往 Blend weight 拖 Gradient 3-color/position texture（黑露 Base、白露 Blend）；也可用 Import bitmap file 自定义遮罩。
- Add volume 示例：5 m³ 围盒、0.6×0.075×0.05 m 船、Ø0.025×0.03 m 孔、半径 0.004 m 光源球；Volume coefficient Tint RGB 139/179/198；Transmission color 189/208/231；Directional bias 0.7；Spot light Flux 20000、Scene unit size 0.8、Spot exponent 15、Spread angle 2.5；最终 Emission color 157/189/226。

### 4.7 Appearance Modifiers（18 项）

| 分组 | 名称 | 要点/参数 |
|---|---|---|
| Modifier | Add rounded corners | 保留 base；调 radius、roundedness；可跨外观加圆角。 |
| Modifier | Add sheen | 加光泽层；sheen normal、multiscalar tint、roughness、color、weight。 |
| Modifier | Add volume | 加体积属性；absorption coefficient、directional bias、scattering coefficient；默认 Base material 为 transparent。 |
| Modifier | Appearance set（Advanced） | 外观集合，见 4.12。 |
| Modifier | Double sided | 正反面两外观；强制薄壁；两面 transmission 必须一致；cutout 控制可见区域。 |
| Modifier | Add global bump map | 全局 bump，保留 base 的本地 bump。 |
| Modifier | Apply clear coat | coat filter color、ior、bumps、reflection roughness、coat visibility。 |
| Modifier | Apply color fall off | 视角相关 5 色渐变（color 1 朝向→color 5 边缘）。 |
| Modifier | Apply dust cover | dust color/amount、bumps、dust density。 |
| Modifier | Apply flake coating | flake amount、orientation randomness、color、opacity、roughness、size（mm）。 |
| Modifier | Apply thin film | ior、thickness。 |
| Modifier | Surface blender | base（当前外观）、blend material（新外观）、blend weight（遮罩）。 |
| Modifier | Surface falloff | base/blend material、blend bias、blend weight edge、blend weight facing。 |
| Modifier, General | Add sticker overlay | 介电贴纸覆盖层；需要 mask 图。 |
| Modifier, Lighting | Add emission | 保留 base；intensity、color、unit、unit scale。 |
| Modifier, Lighting | Add thermal emission | base material、intensity、temperature（改色）、unit for emission。 |
| Modifier, Metal | Apply thin metal coat | reflection color、bumps、reflection roughness、reflection weight。 |
| Modifier, Plastic>Mesh / Metal>Mesh | Add cutout | 强制薄壁；需 mask；用于树叶/草/栅栏。 |

应用规则：拖放修改器到 part/face 或参数上=**保留原外观**（挂到新修改器的 Base material）；右键 `Assign`=**覆盖**原外观。

### 4.8 Textures and Bump Maps

- **给参数加纹理**：选 part→展开 Base→在库 `Appearance functions` 中找 `Checker pattern`→拖到 `Diffuse roughness`；可接受参数蓝色高亮；应用后自动进入该函数参数，面包屑可返回父外观。
- **自定义图片贴图**：先 Insert→Import 图片（有导入通知）；选 face/part；分配 `PBR — Metallic roughness`；在 Appearance 面板设 Metallic/Brightness/Opacity；将 `Import bitmap file — Bitmap texture` 拖到 `Base color`（或右键参数→`Use bitmap file`）；点 `black.png` 打开 Select image（Current/Other documents 或 Import）；**若图片在创建 Render Studio 后才导入，必须建版本才能在 Select image 中看到**；然后调 `Rotation`/`Offset`/`Tiling`；需要投影时打开 Projector 并把该 face/part 加入。
- **Bump 纹理**：bump 不直接贴到零件，只贴到外观 `Bumps` 参数；拖 `Checker texture bump map`（只有 Bumps 变蓝）；可返回父外观后再点链接编辑。
- **自定义 bump**：拖 `Import bump map file` 到 Bumps；复杂编辑可用 `Import bitmap file`（可接复杂纹理放置函数图）；点 Bitmap file 打开 Select image；导入后建版本；参数：`Tiling`（数大→纹理小）、`Clip`（不重复，外部平坦）、`Offset`、`Rotation`（度）、`Bump mode`、`Bump strength`。源文此处含一处 `.ies`/Select light profile 残留，属抽取/原文瑕疵。

### 4.9 Light Emission（普通版自发光）

**灯光外观目录**：`Add emission`、`Add thermal emission`、`Light source emitter — 1900k candle`、`— 7000k cool white`、`— 5000k fluorescent`、`— 3000k halogen`、`— 4000k natural white`、`— 2700k warm white`、`Diffuse area light`、`Display screen`、`IES light`（2 个外观：IES 定义分布 / 按指定 flux 缩放原数据）、`Photometric light`、`Spot light`（3 个：形状发光材质、全局分布、glTF 2.0 spot）。另有 Scene 面板 Bloom。

**Add emission**：先建灯丝零件与墙/地面（墙加 `Apply clear coat` 以产生反射）；玻璃罩用 `Thin glass`；灯丝 Assign `Add emission`。参数：
- Base material（默认 diffuse）
- Intensity（默认 **1000**；示例房间 2.43×0.97×0.84 m 用 **10,000,000**）
- Color（默认白）
- Unit for emission（默认 **Lumen m2**；可选 Lumen/Candela/Nit）
- Unit scale（默认 **100**，建模单位→米；文档示例文字 “default value is 100”）。

**Add thermal emission**：与 Add emission 类似，Color 换 Temperature；示例 Intensity 10,000,000、Temperature 2000 呈橙色；65000 呈蓝色；指南：0–3500 红橙黄、10000+ 蓝；默认 **6500 K** 为白。

**自定义 IES**：Assign `Photometric light`→Appearance 面板 `Distribution` 子菜单点 IES 文件（示例 downlight.ies）→Select light profile（Current/Other documents/Import）→导入后建版本→选择文件→调 Tint、Lumens/multiplier 等；示例可形成不同扩散/光环；外部免费 IES 资源 ieslibrary.com。

**Display screen**：Image、Repeat image（默认 enabled）、Intensity（默认 **40**；示例 200000）、Screen roughness（默认 **0.2**）、Translate/Rotate/Scale。应用于屏幕面；不提高 intensity 通常呈黑。

**色温 emitter 公共参数**：Color temperature（K）、Lumens (flux)（默认 **1000**）、Two-sided emission（默认 disabled）。六个预设色温 1900/2700/3000/4000/5000/7000 K。

**Diffuse area light**：Flux（默认 **500**）、Scene unit size（1 场景单位=1 英尺→0.30481；1 cm→0.01）、Emission color（默认白，缩放不影响 flux）、Two-sided（默认关）。

**Spot light**：Emission color（默认白，重缩放不影响 flux）、Flux（默认 **500**）、Scene unit size（默认 **1**）、Spot exponent（默认 **0**；越大越聚焦）、Spread angle（rad，默认 **6.283**，硬限制）、Two-sided（默认关）。示例 Flux 6000/20000、Scene unit size 0.8、Spot exponent 15、Spread angle 2.5。

**Photometric light**：Tint（默认白）、Color temperature（默认 **6500 K**）、IES file、Flip orientation（默认 enabled：上向量从 y→z）、Rotation（默认 disabled）、Lumens or multiplier（默认 **2000**；Absolute profile 关时=lm，开时=倍率）、Absolute profile（默认 disabled）、Intensity is power（默认 enabled；开时按面积除得 radiance）、Front emission only（默认 disabled；圆柱灯必须开以防漏光）、Additional emission（默认 **0**，加 Lambertian 补光避免直视黑灯）。

### 4.10 Environments Library

- **库导航**：与 Appearances 库相同的搜索（当前 folder、and/+/or）、竖版/横版、隐藏、名称提示；完整环境清单见 `Render Studio Libraries`（不在本组）。
- **添加**：右键 `Apply lighting`（只加照明，保留背景）或 `Apply lighting and background`（同时替换背景）；也可拖到场景空白处。若已应用 lighting+background，下一次 `Apply lighting` 不可用，除非先用 Camera 面板设背景色。
- **默认**：新建场景默认环境 **Standard**，背景 **白色**。恢复：搜 Standard→Apply lighting and background（或拖到空白处）→背景用环境底色；想回纯白：Camera→Background 勾选→颜色 #FFFFFF。
- **自定义环境**：Appearance 面板？不——Environment 面板勾 `Custom image`→Select image（.hdr/.exr；也可 jpg/png）→导入后建版本→选择；若太黑把 Lighting intensity 提到 15,000–20,000 或更高。建议用 HDRI；免费资源 polyhaven.com/hdris。
- **位置/时间**：如 Preetham 环境，Environment 面板底部 `Daylight` 设 Country/Province/City/Date/Time/Timezone/DST；示例 New York、07/01/2021、9:00 AM、UTC−05:00；改 4:30 PM 得日落。
- **Notes**：环境不可见→Camera 取消 Background；隐藏环境→勾 Background 并选纯色/图片；无灯全黑→提高 Environment 面板 Lighting intensity（一般 50,000–100,000）；每个环境参数有 tooltip；环境背景覆盖 Dark mode；自定义环境优先 HDRI。

### 4.11 Appearance / Environment / Camera / Scene 面板参数总表

#### 4.11.1 Appearance 面板

| 分组 | 参数 | 语义/默认 |
|---|---|---|
| Base | Base color | 基色 |
| Base | Diffuse roughness | 越大越粉状 |
| Base | Metallic appearance | 1=有色反射、与视角无关；0=白反射、随视角（IOR/Fresnel） |
| Base | Reflection roughness | 越大反射越模糊 |
| Base | Reflection weight | 反射量 |
| Base | Reflection anisotropy | 越大高光拉伸 |
| Base | Anisotropy rotation | 1=旋转 360° |
| Transmission | Transmission color | 与厚度无关的透射色（染色玻璃） |
| Transmission | Volume color | 非 Thin walled 时在 Volume reference distance 达到的颜色 |
| Transmission | Volume reference distance | 达到 Volume color 的距离（m），填该材质典型厚度 |
| Transmission | Transmission roughness | 越大透过看到的物体越模糊 |
| Transmission | Transmission weight | 透射相对漫反射的权重 |
| Global | Thin walled | 薄壁：不折射、无体积效应（肥皂泡/窗玻璃） |
| Global | IOR | 体积折射率，也影响非金属反射率 |
| Global | Abbe number | 色散；0=关；25–85 有色散 |
| Global | Bumps | 通过 bump 函数挂 bump/normal map |

补充：面板顶部显示当前外观名（如 Appearance 1）；多外观时列表展示，点行进入编辑，Home 返回列表，X 从面板移除并取消选择。`Use bitmap file` 只对有纹理参数的参数可用；`Reset to default` 把 Bitmap file 重置为 `black.png`。选中实体在面板打开时只描边显示；关闭/切面板恢复实心高亮。Part Studio Material→Appearance 映射：标准 Material Library 名称映射；ABS 会按 Appearance color 染色，Gold 忽略颜色；Glass 额外导入透明；场景更新时 Part Studio 材质变更会带入，除非该 part 外观已在 Render Studio 编辑（编辑即断链）；Face 继承所属 part 的 Material；同外观不同材质会生成 2 个外观；自定义库同名材质也映射；1.158 之前的场景更新/重存不会回填 Material。

#### 4.11.2 Environment 面板

| 分组 | 参数 | 说明 |
|---|---|---|
| Dome | Infinite size | 无限穹顶，仅相机方向影响环境（室外）；关闭时需 Horizon distance |
| Dome | Horizon distance | 环境中心到地平线距离 |
| Dome | Hemisphere | 半球环境，地面从光照环境投影；配合 Tripod height |
| Dome | Tripod height | 采集时相机离地高度，用于把下半球投到地平面 |
| Dome | Lighting intensity | 环境图像照明倍率；<1 变暗，>1 变亮 |
| Dome | Rotation | 环境穹顶绕垂直轴旋转 |
| Image | Library environment | 库环境（Standard 默认） |
| Image | Custom image / Image | 用 HDRI（建议 .hdr/.exr，360/180 经纬）覆盖 |
| Lighting（Advanced） | 放置面光源 | 展开环境图为 2D，可放多个；选中中点可改形状、拖动位置；准星标出视口中心 |
| Lighting | Shape | Disc/Rectangle/Ring |
| Lighting | Direction | 环境位置，地平线和右侧为 0°，X/Y 度 |
| Lighting | Radius/Width/Height/Thickness | 形状尺寸 |
| Lighting | Tint/Intensity/Softness | 颜色/无单位强度/边缘软硬 |
| Lighting | Base environment | `Use scene environment`、`Gradient`（Sky/Horizon/Ground 的 tint/intensity、Horizon softness/height（0.5 居中）、Ground）、`Solid color and intensity`（Tint/Intensity） |
| Ground | Automatic height | 按最低物体自动定地面高度 |
| Ground | Reflective / Reflectivity / Roughness / Shadow intensity | 反射开关、反射量、粗糙度（低=镜面）、阴影强度（1=物理正确） |
| Daylight | Country/Province/City/Date/Time/Timezone/DST | 仅部分环境（Preetham、Perez） |

#### 4.11.3 Camera 面板

| 分组 | 参数 | 说明/默认 |
|---|---|---|
| General | Field of view | 1–175°；仅 Perspective 开时可用 |
| General | Focal length | 1–2,063 mm；始终 mm；两值联动；调整不改模型投影像素大小而改场景透视 |
| General | Enable near clipping plane / Distance | 近裁剪开关与距离 |
| General | Position/Rotation X,Y,Z | 数值精确匹配两场景相机 |
| Background | 开关 | 关闭时用 Environments 库环境（Standard 默认） |
| Background | Solid color | Color（hex/RGB/色板）；非默认时可右键 `Reset to default theme` |
| Background | Reflect background | 地面反射中显示背景而非环境 |
| Background | Refract background | 完美镜面非薄壁物体透出背景 |
| Background | Image | Select image；Scale=Fill/Fit/Stretch；Repeat（仅 Fit）；Tone mapping；Depth of field |
| Background | 覆盖 | 背景色/图覆盖 Dark mode |
| Depth of field | F-number | 0.063–64；小=浅景深（更多模糊） |
| Depth of field | Aperture blades | 0–2 圆形；2–20 指定叶片形状 |
| Depth of field | Aperture blade rotation | 仅在 blades>2 时可用 |
| Depth of field | Radial bias | 0.5 均匀；<0.5 边缘更重要、中心变暗；>0.5 中心变亮 |
| Depth of field | Focus distance | 对焦距离；十字按钮在场景点选取焦点 |
| DoF 注意 | 相机位置固定 | 启用 DoF 后改相机需重设焦点并重评 F-stop |
| Exposure | Photographic / Simple | 相机参数 vs 仅亮度 |
| Exposure | Film ISO | 越高越敏感但噪点越多；**0 时快门/光圈失效，全部亮度由 Candela factor 控制** |
| Exposure | F-stop | 仅用于 tone mapping，不影响 DoF；ISO=0 无效；越小越亮 |
| Exposure | Shutter speed | 分数秒；100=1/100；值越大进光越少越暗；0=全黑；ISO=0 无效 |
| Exposure | cd/m² factor | 像素值与坎德拉/m² 的换算；ISO=0 时是直接倍率 |
| Exposure | Exposure（Simple） | 整体曝光；负=暗（−6 无月夜），正=亮（15 晴天） |
| Tone and contrast | Shadows/Highlights/Saturation/Highlight saturation/Balance | 阴影、高光、饱和度（1.0 标准）、高光饱和度、白点平衡 |
| Vignetting | Strength | 0=无；越大边缘越暗；文档建议默认 3（类似卡片机） |
| Advanced | Compression variant | Reinhard / Uncharted 2 / ACES Unreal 4 / PBR neutral |
| Advanced | Gamma | 显示 Gamma；1=关闭 |

#### 4.11.4 Scene 面板

| 分组 | 参数 | 说明/默认 |
|---|---|---|
| Progressive rendering | Max samples | 停止渲染的样本上限 |
| Progressive rendering | Adaptive resolution | 导航时降分辨率保持交互，停止后恢复；关闭可避免像素化但可能卡顿 |
| Progressive rendering | Live navigation | 本地渲染降延迟 |
| Progressive rendering | Minimum samples per update | 导航中每次更新的最少样本（多=更新少但质量高） |
| Progressive rendering | Maximum time per update | 每次更新的最长等待秒数（多=更新少但质量高） |
| Progressive rendering | Denoise updates | 更新时去噪（更平滑但更新略少） |
| Matte fog | 开关、Visibility range、Visibility tint、Brightness、Brightness relative to environment、Brightness tint | 距离雾；范围按 Koschmieder；tint 按颜色通道；brightness 绝对或倍率；可相对环境照明自动 |
| Filtering | Pixel filter | Box/Triangle/Gauss；推荐半径 0.5/1/1.5 |
| Filtering | Bloom filtering | Radius（默认 **0.01**，亮区扩散最大为图像百分比）、Threshold（默认 **0.9**，但文档建议先从 **8000** 试）、Brightness scale（默认 **1.000**） |
| Filtering | Denoiser | AI 去噪；Start iteration 防早期迭代被去噪；Denoise alpha（约加倍去噪时间） |
| Advanced | Smooth coarse shadows | 修复细分不良的阴影终止线；不建议总开 |
| Advanced | Maximum path length | 限制光路顶点/反弹数；牺牲物理精度换速度 |
| Advanced | Instancing | Auto/On/Off |
| Advanced | White mode + Color | 全场景同一漫反射外貌（clay），可选颜色；环境光照仍生效 |
| Advanced | Spectral rendering | 光谱渲染开关 |
| Advanced | Conversion color space | Rec.709/linear sRGB、CIE XYZ、Rec.2020、ACES2065-1、ACEScg |
| Advanced | Conversion intent | Neutral（平滑优先）/ Faithful（色彩渲染兼容优先） |
| Advanced | Observer | CIE 1931 2°（默认）/ CIE 1964 10° |
| Special samplers | Caustic sampler | 焦散（玻璃在桌上的光斑） |
| Special samplers | Guided sampling | 引导采样；可提高质量/收敛，但可能降低整体吞吐（迭代吞吐通常降 <10%），建筑/复杂照明受益大，转台类受益小 |

### 4.12 Render Options（普通 vs Advanced）

| 字段 | 选项/默认 | 边界 |
|---|---|---|
| Still | 单图 | **Requires Render Studio Advanced** |
| Multiple | 连续渲染多个 Named views | **Advanced**；**最多 60 个视图** |
| Name and location | 名称+文档文件夹 | **Advanced**；使用后/在 Multiple 模式下，图片存文档，不显示 Download image；Stop 保留已完成图片 |
| Name | 输出标签名；Multiple 时是文件名前缀 | |
| Folder | 文档文件夹 | 可选对话框选择 |
| Views | All 或逐 Named view | Multiple only |
| Resolution | Custom、From view、4x3/16x9、Square、UHD (8k)、UHD (2160)、HD 1080（1920×1080）、HD 720（1280×720）、SD NTSC（640×480）、SD PAL（720×576） | From view 宽高不可编辑；HD/SD 不可编辑；UHD 仅 Advanced |
| Aspect Ratio 子项 | Custom、From view、4x3/16x9、Square、From view | 文字重复列出 From view；照录 |
| Width/Height | Custom 时可编辑像素 | |
| Size | 只读，显示 MP | |
| 输出上限 | 普通 **2.1 MP（1920×1080）**；Advanced **100 MP（10000×10000）** | 文档明确 |
| Format | JPEG、PNG、HDR、EXR | |
| Remove Background | 生成 alpha 通道便于合成 | |
| Disable tone mapping | 仅 HDR/EXR | 保留完整动态范围 |
| Quality | Production、Medium、Preview、Custom | Custom：Max time (s)、Max samples（**−1=无限制**）、Maximum quality（达到质量可提前结束）、Quality（默认 **1.0**；2.0 约两倍时间）、Converged pixel ratio（如 0.7=70% 像素达标） |
| Advanced | Panoramic、Stereo（Top-bottom/Side-by-side、Reverse eyes、**Interpupillary distance 63 mm 默认**）、Appearance masks | Advanced |
| Render / Download image | 渲染到新标签 / 下载到本地 Documents | |
| 安全框 | 打开对话框时虚线框表示输出范围；背景 Scale=Fit 时预览把图适配进框 | |
| 记忆 | 最近一次设置按标签记忆，刷新/登出后仍保留；不同 Render Studio 标签各自记忆 | |

### 4.13 Render Studio Advanced 细节

**升级方式**：右上角 `Upgrade to Render Studio`；Advanced 以 Application 席位管理（可在 Applications 中分配）。非 Advanced 可打开含 Volume 的场景但 Volume 属性不可编辑。

**AxF**：库 `General` 文件夹搜索 AxF；选中 part→右键 Assign→`Select AxF` 对话框→Import 本地 .axf→选择。
- 参数分组：`AxF appearance`（AxF file）、`Real world size`（Use sample size、Sample size U/V 米）、`Material placement`（Scale U/V、Rotation angle、Texture wrapping behavior：Wrap clamp/Wrap repeat（默认）/Wrap mirrored repeat/Wrap clip）、`Creative control`（Normal texture strength，1.0=实测 bumpiness；Geometry normal）、`Flakes`（Enable flakes、Flake size、Flake roughness、Flake brightness）。
- 支持 3 类：**svbrdf、carpaint、volumetric**；volumetric 无额外参数。参数右键 `Reset to default`。

**Appearance Set**：库中分配 `Appearance set` 到 Part Studio/Assembly/part/face；面板顶部出现集合，Default Appearance 在集合中；把外观拖到 Default 标签上加入；active 由深蓝标签+左侧蓝线表示；点击或右键 `Set as active`；右键 `Remove from set`；删除 active 时取下方，若为末尾取上方；只剩 Default 时 Default 不可删。

**Volume**：工具栏 Volume→对话框：
- `Volume type`：Mie、Anisotropic、OpenVDB。
- `Emissive`：按温度通道发光。
- Data（OpenVDB）：`Volume data`（Select Volume data；Current/Other documents/Import）、`Density channel`（不透明度）、`Temperature channel`（Emissive 时；K，配合 Multiplier/Offset）。
- Density：Multiplier、Offset、Relative to size。
- Scattering and absorption：Albedo、Density、Particle size、Anisotropy（−1 后向、0 各向、1 前向）。
- Temperature（Emissive）：Multiplier（如 kilokelvin→K 设 1000）、Offset（如 ℃→K 设 273.15）、Tint、Use density。
- Bounding box：Measurement（Centimeter/Foot/Inch/Meter（默认）/Millimeter/Yard/Custom）、Scale（仅 Custom，等比）、Length/Width/Height。
- 编辑中紫色包围盒；Scene list `Volumes` 下拉；绿勾应用；双击重开；可 Transform、右键 `Duplicate volume`（一次一个，副本在下方）。

**Light**：工具栏 Light→对话框：
- Shape：Point（无面积，硬阴影）、Sphere（球面，软阴影，全向）、Disc（无限薄圆盘，双面可选）、Rectangle（矩形面）、Cylinder（开口圆柱，径向发光不出两端）、Infinite（无面积，平行光，类似太阳；**Distribution 不可用**）。
- 形状参数：Radius（Sphere/Disc/Cylinder）、Width（Rectangle）、Height（Rectangle/Cylinder）、Emit from both sides（Sphere/Disc/Rectangle/Cylinder）、Visible to camera。
- Distribution：Diffuse（全向余弦）、Spot（Cutoff angle 锥外无光、Falloff exponent、Uniform emission）、Profile（.ies；Rotation、Tilt、Uniform emission）。
- Emission：Flux（lm；用 .ies 后改动 Flux 可用 Reset 还原原值）、Color temperature（K）、Tint、Scale emission with size（Sphere/Disc/Rectangle/Cylinder）。
- Aim（Spot/Profile）：Aim point、Highlight location、Surface normal、Target point XYZ、Rotation（绕 Z）；`Aim point` 时旋转由目标点控制、不可直接旋转；Highlight/Surface normal 的位置/旋转不存储、保持距离。
- Position/Rotation：XYZ 数值或三轴操纵器。
- 场景列表 `Lights` 位于 Projectors 下、Transforms 上；显示三轴、方向箭头、形状（默认对相机可见）；Profile/Spot 可显示光源分布网格。
- Notes：非均匀缩放取 3 个缩放因子平均值；Infinite 位置无效（但可移开以免遮挡）；Point+Diffuse 旋转无效；右键 `Duplicate light`；Aim 启用后常规变换不可用，只能绕 Z 用 Aim 的旋转。

### 4.14 Examples and Resources 的工艺参数

- **聚光灯+反光面**：磁盘作灯头内灯泡；spot light 可只对前表面用 “Assign to face”；Flux≈6000；桌面 Base color 黑 + `Apply clear coat` 产生反射；改灯泡 spot light 颜色或灯头外观颜色。
- **金属 RGB 指南**：Aluminum 230/230/230、Bismuth 208/203/182、Brass 237/216/134、Bronze 165/128/103、Carbon steel 73/73/71、Chrome 253/253/254、Copper 221/151/120、Gold 249/217/153、Cast Iron 195/192/192、Nickel 198/193/180、Pearl 249/248/246、Silver 244/243/240、Stainless steel 198/198/197、Steel 221/221/220、Titanium 191/188/182；Reflection roughness 默认 **0.1**；0→更清晰，0.25→更哑光；可加 Worley noise bump（示例尺寸/参数照录）。
- **金属闪片**：Unlink 外观→`Apply clear coat`→两件共享→把 `Apply flake coating` 拖到 `Base parameters > Base material`；参数：Base material、Color、Roughness、Flake size（mm）、Flake amount、Flake opacity、Flake orientation randomness；示例三组参数照录。
- **薄金属底粉末涂层**：`Add thin metal coat`→Base color 黑；Reflection roughness 0.3、Reflection weight 0.2；Bumps 上拖 `Perlin noise texture`；Noise > Bump strength 3；Placement > Tiling 500×500×500。
- **玻璃液体**：玻璃与液体需**重叠**以获得正确折射/透射（冰完全浸没水则齐平不重叠）；玻璃 `Glass — Clear`、液体 `Pool water — Clear Blue`；Water tint/absorption 0、Wave strength 0 得无色水；牛奶用 `Wax — Colored`，Color 白、Distance 0.001–0.01。
- **自定义金属格栅**：`Metal Grill — Circles`；自备黑白 Cutout texture 与 blur+高反差 Bump；Appearance 中 Cutout texture 选图（导入后建版本）；Reflection weight 0.7、Bump strength 0.2、Translate 0.5×0、Scale 0.1×0.1；可只对单面应用。
- **自定义网格围栏**：圆管栏杆+矩形箱体面；`Metal — Rusted oxidized steel`（Reflection roughness 0.5、Scuffing 0.5、Rust amount 0.2、Rust bump strength 0.3、Scale 10×10）；其他侧面 Transparent，正面 `Black base plastic`/Mesh cutout；自制黑白无缝图案；Mesh pattern 选图；Scale 7×7、Color 114/114/114；最后加环境（Autumn park）。
- **热处理金属**：`Pitted steel — Light`；Scale 0.05×0.05、Rotate 20 去坑；Heat treatment amount 2、Rust pits brightness 1、Steel bump strength 1；Steel roughness 调反射（示例 −0.5/0.75）。
- **FFF 3D 打印**：`FFF 3D print — Thermoplastic`；参数：Color、Crevace darkness、Layer height（mm）、Infill、Extrusion width（mm）、Infill angle（°）、Base normal、Reflectivity（Amount/Roughness/IOR）、Subsurface scattering（Amount/Distance/Brightness/Volume IOR）、Orientation（Flip orientation：Z→Y；Rotation XYZ）。两个函数：`FFF 3D print bump map`（任意 Normal 参数）、`FFF 3D print texture`（任意颜色参数）。Notes：Denoiser 会抹掉层线，建议关闭；几何法线差异大时开 `Smooth coarse shadows`。
- **OpenVDB 外观**：库 `OpenVDB volume`→面板：Density（OpenVDB data、Multiplier 默认 1、Relative to size、Channel、Bounds 只读）、Scattering and absorption（Albedo 0–1）、Placement（UVW transform：Rotation/Translation/Scaling）、Surface（IOR 默认 **1.2**，多数设 1）。示例 250³ in 立方体、smoke2.vdb、Multiplier 20、IOR 1、Rotation Y/Z 0.25、Translation 1.5/4/1.25、Scaling 1.25/0.6/0.5。
- **全景 EXR/HDR**：Advanced；Part Studio 按色温每类光做一个 composite part，围绕原点；建版本；分配光外观；适当调 Lumens/Color temp；Environment `Lighting intensity=0`；Camera Position Z=脚架高、Rotation X=90、其余 0；Background 黑；Render options：Resolution Custom、Aspect 2:1、Height 2000+、Format EXR/HDR、勾 Disable tone mapping、Advanced 勾 Panoramic。然后背板合成：模型底面中心在原点；导入 backplate；建版本；新场景；Environment 选 EXR/HDR（Infinite/Hemisphere 不需要）；调 Lighting intensity≈1 或 Tone mapping，Rotation 0–360（不接受负值）；勾 Ground；Camera 开 DoF、Rotation X/Y 0/90 或 0/−90、Position Z=脚架高；Background 选 Image、Reflect background、DoF；PNG/JPG 背板不要开 Tone mapping；**焦距必须匹配背板元数据**（Windows 属性/详情；macOS Get info；全画幅直接填，APS-C 查裁切系数通常 1.5 乘后填；无元数据需试）；最后渲染 PNG/JPG。Notes：若发光面朝向错，用双面灯或改用实体面；同色温分组 composite part；输出高度不建议 <2000 px；PNG/JPG 背板禁用 Tone mapping。

### 4.15 Variable Studio UI 明细

- **可用位置**：`Available in: Variable Studio`。**只能在浏览器平台创建**；所有移动平台可查看和使用变量。
- **创建**：文档底部左侧 `Insert new tab`→`Create Variable Studio`；打开变量表。
- **变量表**：Name（**仅字母数字**）→Tab 到下一行；Type 默认 **Length**，下拉可改；Value；Description（可选）。`From import` 类型见下。可用前序变量定义后续变量（示例 L1→W1）。行可右键 `Move up`/`Move down` 或拖拽排序。标题左侧 caret 折叠/展开；标题右侧三点 `Collapse all tables`/`Expand all tables`。
- **工作区可用**：标签底边复选框；勾选后所有 Part Studio/Assembly 可用；取消则不可用（草稿期建议不勾）。
- **CSV From import**：
  - 表中 Variable type 箭头→`From import`；Value 格点铅笔→Variable 对话框 `From import` 标签。
  - `CSV file`：`Select CSV file` 对话框；可选 Current document、Other documents 或 Import 本机 CSV。
  - Row 选项：`Access type`（By index、By index range、By label、All values）；`Index`（单值）；`Min/Max index`（范围）；`Value`（label 字符串）；`Regular expression`（模式匹配）；`Result type`（Single value、Array、Map）；`Label column/row index`（Map 时数值或变量）。
  - Column 选项：同套 Access type/Result type；`Conversion factor`（带测量单位换算，如英寸→厘米）。
  - Description；勾选（Accept）。
- **跨文档引用**：在新文档创建 Variable Studio→顶部 `Insert Variable Studio`→对话框 Current document/Other documents→可插入**整张表**或**一个/多个变量**；所选立即在当前文档可用；源文档必须有一个包含这些变量的版本，无版本则提示先建；成功后表顶显示来源名与版本（如 `Variable Studio 1 V1`）。**Configured Variable Studio 必须在插入时设置配置**（见 Referencing a configured Variable Studio）。
- **Release**：右键 Variable Studio 标签→`Release`（见 Release Management/Typical Release Workflow）。**Configured Variable Studio 不能发布**。
- 交叉引用：Variable Studio Configurations、Importing a variable from a CSV table、Variable: From Import Examples、Variables and Expressions 课程。

### 4.16 Feature Studio UI 明细

- **可用位置**：`Available in: Feature Studio`。FeatureScript 语言内建于 Onshape，标准特征（Extrude/Fillet/Shell）也由它定义；本页只讲 UI；写代码见 FeatureScript Docs，把自定义特征加入 Part Studio 见 Custom Features。
- **工具栏**：
  - Undo（ctrl/cmd+z）、Redo（ctrl+y / shift+cmd+z）。
  - `New feature`：插入函数声明+precondition+body 框架。
  - `Parameters and functions lists`：feature parameters、query functions、evaluation functions、math functions、sketch functions、operation functions（部分屏幕合并为一个列表）。
  - `Import`：文件、Part Studio、其他 Feature Studio、Variable Studio（Current/Other documents）；此对话框还可 Create version、Version graph。
  - `Format Studio`：自动格式化（若工具栏不可见，从 Import 下拉选）。
  - `Commit`。
  - Search tools（alt/option+c）：搜参数/函数及描述；Close search/esc/点外部关闭。
  - `Co-complete`（Onshape Labs）：AI 辅助写 FeatureScript。
  - `Monitor Part Studio`：监控执行；下拉 `Profile Part Studio`：性能分析。
  - `Module outline`：代码导航。
  - Back reference（ctrl/cmd+[）、Forward reference（ctrl/cmd+]）。
  - Line/Column：光标行列号。
- **Commit**：
  - 输入自动保存；Commit 应用到全文档。
  - 仅提交当前 Feature Studio：Commit 按钮；或下拉 `Commit`；或 cmd/ctrl+s。
  - 提交全文档所有 Feature Studio：Commit 下拉 `Commit all`（括号显示有未提交更改的 Feature Studio 数量）；或 cmd/ctrl+shift+s。
- **搜索/替换/重命名**：
  - 菜单栏 `Search Feature Studios` 或 ctrl/cmd+shift+f 打开 Text Search 面板。
  - 右键符号→`Find usages in workspace` / `Rename in workspace` 打开 Symbol Search 面板。
  - Search mode 下拉：text、symbol、standard library import。
  - Text：Find text；Match case；Regex；Feature Studio name filter；Find；结果高亮；按标签展开/折叠；跳转；Toggle Replace→`Replace with`→`Replace all`。
  - Symbol：Find usages/Rename；`Rename`；替换文本。
  - Standard library import：Include/Exclude 版本逗号分隔；含 minor 版本（3081.2）只匹配该版本；不含 minor（3081）匹配该 major 全部 minor；范围（3081.0-3081.2）含端点；`-3081.2` 表示到 3081.2（含）之前；`3081.2-` 表示从 3081.2（含）之后；逗号取并集；Include 空=全匹配，Exclude 空=不排除；`Set version to` 输入或下拉；`Replace all`（文本/标准库）或 `Rename`（符号）。
- **模块大纲**：Module outline 箭头展开；点结果跳转；`Search symbols` 过滤。
- 交叉引用：FeatureScript Docs、Custom Features、Imports、Versions and History、Debugging in Feature Studios、FeatureScript Co-Complete、FeatureScript Fundamentals 课程。

### 4.17 PCB Studio UI 明细

- **可用位置**：`Available in: PCB Studio`；产品 description 明确 **free for Enterprise and Professional plan subscribers**（正文徽章为图片）。
- **创建**：`Insert new tab`→`Create PCB Studio`。
- **视图**：View cube + Camera and render options；可在 Perspective/Orthographic 间切换。
- **工具栏**：Import ECAD files、Export to IDF、Import board（Altium 365）、Push board、Pull board、Sync from Onshape（Part Studio/Assembly→board，更新轮廓/组件位置/keep-in/out/zone 等）、Sync to Onshape（ECAD→Part Studio/Assembly）、Update library to latest version、Search（3D 预览搜组件/keep-in/out；mapping 视图搜映射）、Clear search、Settings（默认 Component mapping library 与 Components folder）、Help、Boards and Libraries、All component mappings。
- **图标**：Linked board、Mappings、No footprint、Footprint、Linked footprint、Component（文档不可用）、Linked component、Component error、Rigid board、Flexible board、Board outline、PCB Outline、Keep-in、Keep-out、Hole、Plated hole、Non-plated hole、Layers、Stackup、Dielectric、Copper、PCB Data（[Holes, Plated] [Tag] / [Holes, Non-Plated] [Tag]）。
- **面板**：`Boards`（本 PCB Studio 导入的板，或由含 board 的 Part Studio/Assembly 生成；从 Onshape 导入时模型须平行于三默认平面之一，零件名含 “Board” 或 “PCB”）；`Components`（所有 ECAD 组件、形状与关联 Onshape 模型；默认组件信息存于中央库文档，位置在 Settings 定义；显示当前板引用的组件）。
- **Board 右键**：Switch to assembly、Switch to part、Open Altium workspace、Open board in Altium（从 Altium 导入时）、Show mappings used by [board]、Resync from Onshape（同一 Part Studio/Assembly+配置重同步；**若板正在翻译会报错；可同时翻译多块板**）、Delete。
- **Component 右键**：Open detailed component（源文档中 Part Studio，新标签）、Edit mapping（右侧 Component mapping properties）、Properties、Suppress/Unsuppress（从 ECAD 数据移除但保留数据）、对顶层 Keep-in/out 与 Plated/Non-plated holes 的 `Suppress all`/`Unsuppress all`。
- **首次设置（管理员）**：1) 建 Components 文件夹（全体 PCB 用户可访问）；2) 建共享 PCB Studio Library 文档（放在 Components 文件夹内时注意勿删库；库只作映射数据库，不用于打开/构建 ECAD）；3) 在库文档加 PCB Studio 元素并建版本；4) 在另一 PCB 文档的 Settings 指向该库文档与文件夹。
- **Settings 对话框**：Component information（默认映射文档 URL，可用方框箭头开新标签）；新模型文档存放文件夹（须存在且有权限）。
- **导入 ECAD**：Import ECAD files；支持 **IDF 2.0/3.0（.emn/.emp、.bdf/.idf、.brd/.pro、.brd/.lib）、IDX 3.0/3.5/4.0（.idx）、Autodesk Eagle v6+（.brd）**；导入后每个组件的 footprint 可映射为 No model / 原 ECAD footprint / 自定义 Onshape Part。
- **hint.map**：Import ECAD files→Choose Files→Open→Import→通知显示新增/更新组件数；字段映射 `ECAD_NAME`→Part name、`ECAD_ALT_NAME`→Part number；无 3D 表示（Representation=None）；勾选组件行→Add component mapping→Representation=Custom part→Select part。
- **Translate ECAD→CAD**：`Sync to Onshape`；对话框：`Create a new assembly` / `Update existing assembly`；`Mate components to rigid zones (Additional sync time)`（勾选时所有 rigid zone 原点建显式 Mate；**无论勾否，flex zone 都建显式 Mate**）；Features to include：Board（首次自动勾选不可取消；后续可不含 board，以便在 Onshape 建板并保留特征树；不含 board 则不把板约束到 flex zone）、Components、Keep-In/Keep-Out areas；OK 后为每个 ECAD 组件在 Settings 文件夹中建新文档/Part；生成 Part Studio（板+keep-in/out）与 Assembly（板+全部组件），名称取 ECAD 的 Board/PCB 名；可从 Part Studio/Assembly 继续建模；孔在板基面（top plane）草图、Extrude、按 plated/non-plated 打标签（PCB Data tag 特征；可下拉编辑元数据）；未勾 mate 时 rigid zone 组件在 Mate 特征列表中分组，抑制组→编辑→取消抑制；勾 mate 时用 mate 调位置。
- **Notes（ECAD→CAD）**：每个组件单独 Part Studio；建模完更新 Assembly；孔数据导出/导入保持；Part Studio 建板时可手动 Tag；替换板用 Assembly 右键 `Replace instance`。
- **Translate CAD→ECAD**：`Sync from Onshape`（图标名为 Sync a Part Studio or Assembly with PCB Studio）；对话框选 Part Studios/Assemblies，可选配置；**装配应朝向 Top 方向**；resync 时自动定位原关联与配置；成功后 Boards 出现板，按部件名判断：有映射=既有 ECAD 只翻译位置；无映射=板/keep-in/out/无映射组件；导入时板名旁 spinner，红 X 取消。
- **命名规则（不区分大小写）**：Board/PCB→board outline；Zone/Rigid→rigid zone（**仅 IDX**）；Flex→flexible zone（**仅 IDX**）；Keep-in/Keepin→keep-in；Keep-out/Keepout→keep-out；Outline→`Outline [part name]`（IDF 3.0 .OTHER_OUTLINE，用于 soldermask/heat sink/board core；如 `Outline [Soldermask]` 在 Component Properties 显示 Soldermask）；前缀 `Components/Place`=组件 keep-in/out/outline；`Via`=过孔；`Route/Routing/Copper/Trace`=布线 keep-in/out/outline（**仅名称无 keep-in/out/outline 说明时解释为铜/布线区域；该类导出尚不支持，保留未来用**）；其他名字=组件（无映射时名称同时作 ECAD part name 和 part number；建议避免直接从 Assembly 新增 ECAD 组件）。
- **Export**：`Export to IDF` 图标→选择 IDF 或 IDX 版本→Export→本地下载；导出后 zip 内特殊字符转 `-`（例 `board 1.max [Configuration_ Default]`→`board 1-max -Configuration- Default-`）。
- **Component properties**：右侧面板；Representation 三选：None、From ECAD data、Custom part；Custom 可点缩略图换件或 `Select custom part`；替代图标可开 Part Studio 新标签。
- **Components view / All component mappings**：左右列显示 ECAD footprint 的 part name/number，右列 Onshape 表示；搜索栏找组件，Enter/Search 结果计数并高亮，上下箭头循环（列表不变）；点组件->Component mapping 面板编辑 Mapping rule（Exact match only / Match any part name / Match any part number）、Part name、Part number、Representation；**Configured parts 不能映射**。
- **BOM**：工具栏 BOM 表图标；自动生成；图形区/表行交叉高亮；双击 Ref. des. 单元格编辑；文档警告可能重复/不合规导致 ECAD 问题。
- **降级**：PCB Studio 标签不删除但不可访问；课程 PCB Studio Fundamentals。

### 4.18 Altium 365 Integration 明细

- **前置**：Altium 账号（登录）、可访问 Altium Workspaces、对 board Projects 有编辑权限；协作通过 Altium MCAD CoDesigner 扩展。
- **Altium workspace 启用**：需 workspace Administrator；Admin > Apps→`Onshape PCB Studio Connector`→Activate→确认 Activate；可 Deactivate 移除。
- **Onshape 集成**：Account user > My account > Integrations > `Add Altium 365 Account`→Altium 登录（**邮箱可不同**）→Access Request 点 `Allow`→回到 Integrations；可 Remove/Refresh。企业/公司管理员可在 Enterprise Settings - Integrations 管理。
- **导入**：PCB Studio 顶部三图标：Import ECAD Files（下拉 `Import from Altium 365`）、Push board to cloud service、Pull board from cloud service；选 workspace→选 project（hover 有缩略图；Next/First 翻页）→选 project variation→Import；详细 3D 组件在后台下载，完成后点 `Update library` 更新库文档到最新版本；导入后生成带 decal 的板（copper/solder mask/silkscreen）和组件映射（含 Altium 3D 模型）。
- **推送**：`Push board to cloud service`→Push Altium project 对话框→Comments（给 ECAD 的说明）→Send；Altium 用户看到消息与更改、决定是否应用、可继续修改、点 `Push to MCAD`（可加消息）→Send；Onshape 侧 `Pull board from cloud service` 拉回；可重复多轮。
- **Notes/Boundaries**：翻译到 ECAD 时额外 decal 在单独标签创建并映射到板表面；**Copper/silkscreen 单向**（Altium→Onshape，不回传）；支持 Altium Rigid-flex：Altium 中确保 bend line 与整个区域相交；**同步到 Onshape 后折弯区不显示 decal**（Assembly 的 Flattened/Folded 中橙色折弯区无 decal）。

### 4.19 Rigid-Flex PCB 明细

- **建模（自建→IDX）**：
  1) Part Studio 草图刚性/柔性区；用简单几何（平面/柱面、线、弧）；**避免 spline/bezier/复杂自由曲面**（导入可能近似、形状意外变化）。
  2) 刚性区用 `Extrude`；柔性区用 `Flex PCB model` 特征（尽量 1 区 1 特征）。
  3) 加 Mate connectors：必须由几何拥有（非草图）；Origin 选 face/zone，Attachment=`To selection`；避免在 Assembly 建 connector（柔性区长度/折弯变化时可能不更新）。
  4) 组件定位：中心连接用面质心；精确位置用辅助草图+参考线+中点；柔性区组件：在 flex zone 草图→标位置→建 mate connector→附到 flex 区。
  5) 孔：在移交 PCB Studio 前建好 plated/non-plated 孔（安装/工装/对位孔），完全约束到相应板区；用 Hole `Tag` 特征定义孔参数，导出前复核。
  6) 折弯：`Bend` 加到 flex zone；**所有 flex 区展开到同一参考平面**，不要相对不同平面展开；可选 Flange/Hem 等钣金特征；`Finish flex PCB model` 每个特征只完成 1 个 flex zone。
  7) 最小配置两个：`Flattened`、`Folded`；Configuration 面板→Configure part studio→Configure features→对每个 Flex PCB zone 的 Finished 特征点 `Unfold all`→Done→Default 改名 Flattened→新增 Folded 行→Folded 行中所有 Finished flex 特征选 `Unfold none`；可选部分展开配置（制造夹具/测试治具/检测）。
  8) 命名所有 zone（见 PCB 命名规则）。
  9) 从 flat 配置建 Assembly：插入 Part Studio（Flattened）；主刚性区右键 Fix；其余相对它 mate；PCB Studio 以 flat 同步（ECAD 期望展开板）；导出 **IDX 4.0**。
- **Notes**：刚性区/柔性区分别建模；刚性板厚用实际值（如 **1.6 mm**）且每区独立 part；柔性区独立 part 通过 mate connector 连刚性区；reference designators 导入/导出保持；避免在产品使用前不验证导出。
- **导入（IDX/Altium）**：Import ECAD files→Choose files→IDX→Import；或 Altium 365 导入；PCB Studio 中柔性区棕色、刚性区绿色；同步后自动创建 Part Studio/Assembly/mate connectors/2 配置（Flattened 默认、Folded）；板实例自动 Fix；Part Studio 中配置被排除在 configured properties 外；Folded 中 Mate/Mate connector 隐藏。Notes：Syncing to Onshape 时，附到 flex zone 的组件及 flex zone 之间总是创建显式 Mate connector（例外：后续同步未选 board 时，板刚性区不约束到 flex zone）；Keep-In/Out 不自动关联折弯区，可能需手动 mate，且可跨多个板区；**导出 IDX 时 flex zone 偶会被误判为 rigid，必须验证**；reference designators 保持；支持 Altium rigid-flex（bend line 须贯穿区域；折弯区无 decal）。

### 4.20 CAM Studio 明细

- **可用位置**：`Available in: CAM Studio`。两个版本：**CAM Studio**（含在 Onshape Professional 或以上；基础 2.5/3 轴策略与选项）；**CAM Studio Advanced**（2.5/3/4/3+2/5 轴与高级策略）。
- **创建**：`Insert new tab`→`Create CAM Studio`；界面有问号 tooltip。
- **布局**：左侧 Jobs/Components 面板与工具栏；右侧 View options；创建后先显示 components 页；插入组件后 Components 面板出现，`Create job` 激活。
- **工具栏（左侧，位于 Jobs/Components 上方）**：Insert（part/workholding/stock）、Create job、Create machine、Create setup、Create tool、Create toolpath、Create work plane。**按钮初始 inactive，随流程完成逐步激活**。
- **视图（右侧）**：Fit all、Isometric、Front、Back、Top、Bottom、Left、Right、Toggle transparency。
- **标签右键菜单**：Delete（活动标签也可删；最后一个不可删）、Open in new browser tab、Rename、Properties、Duplicate、Copy to clipboard、Update linked document、Move to document（可新文档）、Create task。
- **添加组件**：Components 区 Insert 下拉：`Insert part`（被加工件）、`Insert workholding`（台钳/软爪/压板等）、`Insert stock`（毛坯）；**三者均需 version reference**；选 part 后加入组件列表并自动关闭；组件右键 Edit/Suppress/Delete。
- **Create job**：Job name；Bodies（图形区选 part）；Stock type：Box（X/Y/Z 调整）、Cylinder、User defined（选 CAD 组件）；Stock direction：World（模型原点）、Z and X、Z and Y、X and Y（后三者再指定轴）；Dimensions 数值；Workholdings（图形区选 bodies）；绿勾。Job 右键 Edit/Suppress/Delete；选中后 Delete 键。
- **Create machine**：`Select by machine builder` 默认开；builder 下拉：**Generic、Bantam Tools、Brother、DATRON、Haas、Hurco、Inventables、Langmuir、Makera、ShopBot、STEPCRAFT、Thermwood、Tormach、TRAK**；选 builder 后字段自动更新，再选 machine。`Post settings`：Program（输出单位）；Datums（默认 Advanced work planes，可关）；NC general（Sequence numbering 默认开；Block number start/increment；可选 Block number at tools only、Block number as tool number）；Movement（Rapid positioning 默认开、可手填 Rapid rate；可开关 Output Arcs、Arcs in XY/XZ/YZ plane、Output helices；小数位数）；Retracts（Force on tool changes/plane changes/program end）；Fixed cycles（Drilling/Peck drilling/Thread tapping/Chip break canned cycles）。post=把 CAM 数据翻译成特定控制器 Gcode。机器右键 Edit/Suppress/Delete；Delete 键。
- **Create setup**：定义 WCS（原点与 XYZ 方向，可多个）；Setup name、Program number；Machine mating：Automatic（按组件底部与 machine connector 自动理想贴合）/Manual（Offset X/Y/Z）；Work plane：Name、Origin（World/Component box point/Stock box point/Manual）、Position（Component/Stock box point 时选组件）、Orientation、Override datum（覆盖自动绝对基准）；绿勾。setup 右键 Edit/Suppress/Delete。
- **Create tool**：Tool 面板：
  - Cutter：`Library` 可开关；开时可导入/导出刀具库；关时只能导入库，且须手填 Machining type、Cutter type、Unit、Tool hand、Diameter、Cutting length、Overall length、Center cutting（可选）。
  - Machining type：All；Milling（Ball mill、End mill、Bull mill、Dove mill、Lollipop mill、Slot mill、Taper mill、Chamfer mill）；Hole making（Drill、Thread tap tool、Thread mill tool、Thread mill multi-form tool）。
  - 其余：Cutter type、Unit、Tool hand、Diameter；Thread direction（仅 Thread tap，自动与 Tool hand 同步）、Thread type（仅 tap）、Threads per inch（仅 tap）、Cutting length、Overall length。
  - Arbor：Enable；name、Profile type、可选加点；Arbor 定义刀具延长类型（X/Z revolve）。
  - Holder：Enable；name、Profile type、加/删点；定义夹持（X/Z revolve）。
  - Assembly：唯一 Assembly number（机床内识别刀具）；**不链接刀具库，换 job 需重设**；可随时改而不复制刀具装配。
  - OK；tool 右键 Edit/Suppress/Delete。
  - Import tool library：Cutter 区 Import 图标→Select tool library（Current/Other documents）；可选 Create version、Version graph、View released items。
  - Export tool library：Cutter 区 Export 图标→在新标签生成刀具库，可更新/下载。
- **Create toolpath**：
  - `Toolpath Strategy`：Name；`Type`：Edges（线框驱动边，不需加工面）、Faces（驱动体）、Bodies（整体体）、Holes（孔；Holes 下拉可 `Select all blind holes`、`Filter same diameter`）；`Pattern`：2-Axis rough、2-Axis profile（驱动曲线展平）、2-Axis chamfer、3-Axis profile、5-Axis profile（刀具轴由沿驱动曲线的方向线控制）、Face（驱动曲线须平）、Trochoidal（摆线连续驱动曲线加工）、Engrave；`Sub-pattern`：Offset、Parallel、Adaptive（保持切削条件近似恒定，测engagement 体积避满刀）；可选 `2.5-Axis`（型腔/凸台）。
  - 其余 Toolpath Settings：Drive edges（选边/面；Loop/Contour 过滤；插入曲线时不能用 loop，只能逐段）、箭头换向、Orientation lines、Offset（留料）、Step down（深度步距）、Step over（水平啮合）、Sorting（Reverse、Cutting method/directions、Machine By）；2-axis profile 的 Spiral 方法有 Spiral advanced options；Heights（Start/End 类型与值）；Area（Draft angle、Close offsets）；Re-machining；Edge containment；Speeds（feed/plunge/retract、rapid approach/retract、adaptive feed）；Posting（spindle speed、coolant）。
  - `Link` 区：Clearance area type；First entry Use ramps；Ramps（依刀具/材料/机床刚性）。
  - `Axis` 区：Output type；Tilting（定义 tilt 轴）；Limits；Tool repositioning（**仅 4-Axis/5-Axis**，可 Retract and rewind）；Solution。
  - `Collision` 区：Collision groups（retract、trim/relink、沿轴停止）。
  - `Misc` 区：Profile pass；Smoothing（Smooth corners、Smooth final pass、Remove corner pegs）；Filtering（Regions/Contours、Filter type、threshold）；Quality（cut tolerance=弦高偏差）。
  - OK 后加入 Jobs 列表；toolpath 右键 Edit/Suppress/Delete。
- **Create work plane**：Name；Origin（World/Component box point/Stock box point/Manual）；Position；Type：Absolute（机床/控制器上预定义的固定基准）、Dynamic（临时坐标系，如 G68.2）、None（输出保持初始世界坐标，刀路仍贴合该 work plane）；Override datum；右键 Edit/Suppress/Delete。
- **Preview**：Jobs 中某 operation 右侧 Preview operation 图标→Back plot / Verify / Simulate；某 setup 右侧可一次预览全部。
  - Back plot：刀具沿刀路移动；速度滑条；Step back/Run/Step next/Cancel；底部进度条。
  - Verify：去材料；可查 gouges/excesses、改进在制品毛坯；Step back/Run/Step next/Go to end/Reset/Cancel；速度滑条。
  - Simulate：预览操作；速度滑条；Step back/Run/Step next/Go to end/Reset/Cancel；底排按钮选主轴方向、切换 tool/toolpath/workpiece/stock/machine housing 显示、可 `pause on collision`。
- **Export**：Jobs 中右键 setup→`Post child operations`；或 `Post selected operations`；Export 对话框：program number、file name、查看 machine model/post processor、输出单位；下载选项：Download、Download and store file in a new tab、Store file in a new tab；Export。课程 Introduction to CAM Studio。

---

## 5. 工作流、规则与错误状态

### 5.1 Render Studio 端到端流程与状态

1. **建模**（Part Studio/Assembly）→建版本（首次导入必需）。
2. **建场景**（Insert new tab→Create Render Studio→选一个实体；可重复插入）。
3. **编辑**：插入外观/环境、DoF/FOV、Named views、Section view、Transform、配置、Exploded view、Projector、Decals、Tessellation。
4. **渲染**：Toolbar `Render scene`→Render options→`Render`（新标签）或 `Download image`（本地）。服务端渲染有滞后，复杂度越高越明显；先粗后精。
5. **后处理**：可 Remove Background 得 alpha；Appearance masks 辅助合成。
6. **重载/重进**：选择 Render scene（场景+选项）或 Edit Render Studio（编辑）。
7. **模型更新**：当前工作区更新即时可用；工作区外须新版本→Update linked document→Reference manager→重载。
8. **输出设置记忆**：按标签记忆，刷新/登出仍保留。

**规则与陷阱**：
- 场景是快照：场景外新增内容不可见；“新建版本”是唯一刷新入口。
- 多人可访问但不能同时编辑；`Open in new browser tab` 有明确提示。
- 隐藏不持久；Suppress 持久（存场景）；抑制父级连坐；抑制不改动外观/变换/投影记录。
- 给 part 分配外观时若已有 face 外观：清除=2 个 undo；不清除=只补无外观面。链接外观不可改名；改外观参数会断 Material 映射。
- Decal 不可库选、不可复制/删除/隐藏；平面/柱面各最多 3 个；顺序按源创建顺序。
- 非 Advanced 只能查看 Volume；Volume 属性不可编辑。
- 渲染输出普通版上限 2.1 MP；Multiple/命名位置/全景/立体/掩码均为 Advanced；Multiple 最多 60 视图。
- 环境与应用：若已 lighting+background，再 `Apply lighting` 不可用，须先设背景色；全黑先升 Environment 面板 Lighting intensity。
- Bloom 默认阈值 0.9 往往过低，文档建议从 8000 试；Radius 默认 0.01；Brightness scale 默认 1.000。
- FFF 3D 打印建议关 Denoiser；几何法线异常时开 Smooth coarse shadows。
- OpenVDB volume appearance 初始不可见时旋转几何两轴并更新，或改用 Volume。
- 材质映射：1.158 前场景不回填；编辑场景外观即断链；同外观不同材质会分裂为两个外观。
- Camera：开 DoF 后相机位置应已定；改位置要重设焦点/F-stop；Film ISO=0 时快门/光圈无效；Vignetting 正交视图无效；Background 覆盖 Dark mode。
- 全景：Disable tone mapping 必须勾（HDR/EXR）；PNG/JPG 背板不要开 Tone mapping；焦距匹配（APS-C 裁切系数通常 1.5）；Environment Lighting 0 排除环境光；输出高度建议 ≥2000 px。
- Transform：Scale 轴不可为 0；旋转 ±360°；每次对话框仅一种变换，多次叠加且顺序按列表。
- Projector 的 Fit 基于包围盒，可能不贴合真实几何；只在允许条件下出现。

### 5.2 Variable Studio 工作流与规则

- 创建表→命名（字母数字）→选类型（默认 Length）→值/描述→（可选）勾工作区可用→（可选）Release。
- **前置变量引用**：后行可用前行变量；循环/前向引用文档未说明（按表格顺序推断不支持）。
- **CSV 导入**：Row Access type 决定行集与结果形状，Column 决定列集与单元类型；Map 需 Label column/row index；Conversion factor 做单位换算。
- **跨文档**：源文档必须有版本；可插入整表或单独变量；表头显示来源与版本；Configured 表必须在插入时选配置；Configured 不可 Release。
- **发布**：右键标签 Release；引用 Release Management/Typical Release Workflow。
- **平台**：仅浏览器可创建；移动端可查看/使用。

### 5.3 Feature Studio 工作流与规则

- 编辑即自动保存；**Commit 才把代码应用全文档**；可 Commit 当前或 Commit all；未提交数量在菜单显示。
- 代码变了但未 commit：Part Studio 仍用旧代码（推断，文档未直说执行语义，但 Commit 描述为 “apply the new FeatureScript code throughout the document”）。
- 搜索：文本/符号/标准库导入三种模式；标准库版本过滤支持 minor 语义、闭区间、前后开区间与并集；Replace all/Rename。
- Co-complete 属 Onshape Labs；Monitor/Profile 用于执行监控/性能。

### 5.4 PCB Studio 双向工作流与规则

**ECAD→Onshape**：建 PCB Studio→Import ECAD（IDF/IDX/Eagle/hint.map/Altium）→映射 footprint→`Sync to Onshape`（新建/更新 Assembly；可选 mate rigid zones、Board/Components/Keep-In/Out）→生成 Part Studio+Assembly；建模/改板；必要时 Replace instance。
**Onshape→ECAD**：命名板/区域/组件（Board/PCB、Zone/Rigid/Flex（IDX）、Keep-in/out、Outline [name]、Components/Place、Via、Route/Routing/Copper/Trace；其它名=组件）→`Sync from Onshape`→选 Part Studio/Assembly+配置（Assembly 朝 Top）→生成 board→Export IDF/IDX。
**Altium**：管理员激活 Connector→用户 Integrations 添加账号→Import from Altium 365（workspace/project/variation）→后台下载组件→Update library→建模→Sync→Push（Comments）→Altium 应用/修改→Push to MCAD→Pull。

**规则/错误**：
- `Resync from Onshape` 在翻译中会报错；可同时翻译多块板。
- 板未选中进行后续同步时，板 rigid zone 不与 flex zone 建 mate。
- Configured parts 不能映射；组件必须各自 Part Studio；组件文档不可用时显示 Component 图标（可能被移入回收站或权限变化）。
- Export 特殊字符转 `-`；IDX 4.0 用于 rigid-flex；flex zone 可能被误判为 rigid，必须人工验证。
- Keep-In/Out 不自动随折弯；可跨板区。
- Copper/silkscreen 单向；折弯区无 decal。
- BOM Ref. des. 可重复/不合规，风险自担。
- 降级后 PCB 标签不可访问。

### 5.5 CAM Studio 工作流与规则

**顺序**（按钮随流程激活）：插入 part/workholding/stock（需版本）→Create job（Bodies/Stock/Workholding）→Create machine（builder/machine/post）→Create setup（WCS/机床贴合/工作平面）→Create tool（cutter/arbor/holder/assembly）→Create toolpath（Type/Pattern/Sub-pattern/参数/Link/Axis/Collision/Misc）→Preview（Back plot/Verify/Simulate）→Export（Post child/selected operations）。
**规则/边界**：
- 工具栏按钮按流程激活；无组件不能建 job。
- 所有插入组件需 version reference。
- Toolpath Axis 的 `Tool repositioning` 仅 4/5 轴；Tilting 才定义 tilt 轴。
- Tool Assembly number 不随刀具库走，换 job 重设。
- 关闭 Library 时只能导入库并手填参数；开启时可导入/导出。
- Back plot/Verify/Simulate 功能不同：Back plot 只走刀；Verify 去材料查过切/余量；Simulate 含主轴方向、显示开关与碰撞暂停。
- Export 可按 setup 的 child operations 或仅选中 operations；下载三选一。
- CAM Studio 与 Advanced 的轴数/策略边界是产品门禁：Advanced 才有 4/3+2/5 轴（文档明确）。

---

## 6. 与其他章节的关系

- **Render Studio**：
  - `Render Studio Libraries`（不在本组）：本组多处引用，提供 Appearances/Environments 的完整目录清单；Appearance Functions/Modifiers 的“完整函数清单”亦有一部分在彼处。
  - Part Studio/Assembly：创建场景的来源；配置、Exploded view、Material、Decal、Cosmetic threads、Hole/External threads 均来自 Part Studio/Assembly；`Part Studio Material to Render Studio Appearance mapping table`（另页）是完整映射表。
  - `View navigation` / `View navigation (Touchscreen)` / `Mouse controls` / SpaceMouse：Render Studio 复用通用视图导航；Named views 另页 `Creating and using Named views`；Section view 另页 `Creating a Section view`；Stylized 另页 `Creating a Stylized render`。
  - `Selection`、`Select other`、`Importing files`、`Versions and history`、`Reference manager`、`Merging`、`Insert Parts and Assemblies`、`Moving tabs to other documents`、`Action items`：通用文档/选择/版本/引用/合并/标签移动机制。
  - `Applications`（Advanced 席位）、`Company/Enterprise settings > Properties`（标签 Properties 灰项）、`Upgrade to Render Studio Advanced`。
  - 外部：NVIDIA Iray Programmer's Manual、NVIDIA Ray Tracing Docs、MDL handbook、Poly Haven HDRI/textures、ieslibrary.com、openvdb.org。
- **Variable Studio**：`Variable Studio Configurations`、`Importing a variable from a CSV table`、`Variable: From Import Examples`、`Referencing a configured Variable Studio`、`Release Management`、`Typical Release Workflow`、`Variables and Expressions` 课程。
- **Feature Studio**：FeatureScript Docs（外部/帮助）、`Custom Features`、`Imports`、`Versions and History`、`Debugging in Feature Studios`、`FeatureScript Co-Complete`、`FeatureScript Fundamentals` 课程；Parameter/Query/Evaluation/Math/Sketch/Operation 函数列表（标准库）。
- **PCB Studio**：`Altium 365 Integration`、`Rigid-flex PCB`、`Translate the CAD data to ECAD`、`Naming parts`、`Component properties`、`Mapping ECAD footprints to components`、`PCB holes tag`、`Replace instance`、`Enterprise Settings - Integrations`、`PCB Studio Fundamentals` 课程；与 Part Studio/Assembly/Configuration/Version/Reference 管理强耦合。
- **CAM Studio**：`View navigation` 类通用视图；文档/版本/标签/任务（Create task）通用机制；Introduction to CAM Studio 课程；机床厂商与 post 处理器为外部知识域；Gcode/CNC 为下游。
- **跨工作室共性**：全部是“文档内的一种标签类型”，共享标签右键菜单（Delete/Open in new browser tab/Rename/Properties/Duplicate/Copy to clipboard/Update linked document/Move to document/Create task）、版本、权限、降级/席位门禁。这为 LubanCAD 的“Studio 应用框架”提供统一模式。

---

## 7. 对 LubanCAD 的可执行启示

> 标注：`[文档明确]` 表示 Onshape 帮助原文直接写明；`[推断]` 表示基于原文的工程推断，需 AIRR/ADR 再论证。LubanCAD 当前以 iTwin.js/iModel/BIS 为唯一底座，下列能力不能照搬 Onshape 内部实现，只能映射为产品表面/交互契约。

### 7.1 Render Studio 类能力的 UI 表面（需要补齐/新建）

1. `[文档明确]` **独立“渲染工作室”标签类型**：每个标签一个场景；从 Part Studio/Assembly 的“新建标签”入口创建；可多开；场景与源模型有版本化引用；支持重命名/复制/复制到剪贴板/移动到文档/属性/任务。
2. `[文档明确]` **场景列表**：几何（Part Studio/Assembly/Subassembly/Part/Surface/Face/Folder/Transforms/Projectors/Volumes/Lights）+ Appearances 两段；层级优先+override；单/多选规则；过滤命令全套（至少 `:part`/`:assembly`/`:errors`/`:hidden`/`:suppressed`/`:appearance`/`:light`/`:volume`）；右键菜单需覆盖 20+ 项。
3. `[文档明确]` **中央图形区**：View cube/View tools、Named views、Photoreal/Stylized、Section view（多剖切、Caps、Block light、一次调一个）、右键隐藏/Isolate/Select other/外观复制粘贴/Link to Part Studio appearance、最大化。
4. `[文档明确]` **底部双库**：Appearances library、Environments library；库搜索仅在当前文件夹内，支持 and/+/or；横/竖布局；卡片翻转描述；收藏（My/Company favorites）。
5. `[文档明确]` **右侧四面板**：Appearance、Environment、Camera、Scene，全部参数逐项列出（见 4.11）；宽度可拖拽；面板打开时选中对象只描边。
6. `[文档明确]` **Render options 对话框 + 安全框**；输出到文档标签或本地下载；按标签记忆设置。
7. `[文档明确]` **Toolbar** 至少：Undo/Redo/Insert/Render/Transform/Projector/Match scene properties；Advanced 再加 Volume/Light/Upgrade。
8. `[文档明确]` **Advanced 升级门禁**：Still/Multiple/Name and location、UHD 8k/2160、Panoramic/Stereo/Appearance masks、AxF、Appearance set、Volume、Light、Environment Lighting；非 Advanced 打开 Volume 场景只读。
9. `[推断]` LubanCAD 若要完整对标，需要“渲染任务服务器 + 渐进式客户端预览”的双层架构；文档明确服务端渲染有滞后、模型可能先粗糙后清晰——这对验收断言很重要（不能以“首帧不清晰”判失败）。

### 7.2 参数与默认值清单（可直接写成测试基线）

`[文档明确]`：
- **Camera**：FOV 1–175°；Focal length 1–2,063 mm；DoF F-number 0.063–64；Aperture blades 2–20 成形、0–2 圆形；Vignetting Strength 建议 3；DoF 默认需要手动启用；Background Scale=Fill/Fit/Stretch；Stereo IPD 63 mm。
- **Scene**：Bloom Radius 0.01、Threshold 0.9（建议先 8000）、Brightness scale 1.000；Pixel filter 半径建议 0.5/1/1.5；Quality 默认 1.0；Max samples −1 无限制；Multiple 最多 60 视图；普通输出 2.1 MP（1920×1080），Advanced 100 MP（10000×10000）。
- **Light emission**：Add emission Intensity 1000、Unit Lumen m2、Unit scale 100；thermal 默认 6500 K；Spot Flux 500、Scene unit size 1、Spot exponent 0、Spread angle 6.283 rad；Display screen Intensity 40、roughness 0.2、Repeat 开；emitter Lumens 1000；Diffuse area Flux 500；Photometric color temp 6500、Lumens/multiplier 2000、Absolute profile 关、Intensity is power 开、Additional emission 0、Flip orientation 开。
- **Volume**：Bounding box 默认 Meter；Surface IOR 默认 1.2（建议 1）；Anisotropy −1..1；density Multiplier 默认 1（OpenVDB 外观）。
- **Light**：Flux 单位 lm；Color temperature 单位 K；Aim 的 Rotation 绕 Z；非均匀缩放取 3 轴平均（已知限制）。
- **AxF**：Wrap repeat 默认；Normal texture strength 1.0=实测；支持 svbrdf/carpaint/volumetric。
- **Environments**：默认 Standard + 白背景；全黑时 Lighting intensity 50,000–100,000（自定义环境 15,000–20,000+）；Daylight 支持 Preetham/Perez；环境/背景覆盖 Dark mode。
- **Scene list**：Tessellation Auto/Coarse/Medium/Fine/Very fine/Custom；Angular deviation 示例 10°→36 面；Transform Translate 米、Rotate ±360°、Scale 轴≠0。
- **Vector/Feature/PCB/CAM**：Variable 默认类型 Length、Name 仅字母数字；PCB 命名大小写不敏感（Board/PCB/Zone/Rigid/Flex/Keep-in/Keep-out/Outline [name]/Components/Place/Via/Route/Routing/Copper/Trace）；CAM 机器 builder 列表与 post 默认项（Advanced work planes 开、Sequence numbering 开、Rapid positioning 开）。

### 7.3 交互与选择规则（用于 UI 验收）

`[文档明确]`：
- Render Studio `space` 清选；单选才显示完整 Appearance 参数；Transforms/Projectors 只可单选；Face 不可 Transform；Face 不可过滤。
- 外观分配 6 种路径；从库拖到图形区只能 part，不能 face；库拖放总新建外观；对已有 face 外观的 part 分配会弹 Clear 提示且算 **2 个 undo**。
- 复制/粘贴外观到 Scene list 只能一个实体；粘贴到 Render Studio 根可全场景。
- 删除不能删 Part Studio/Assembly 下的 part/face、不能删使用中外观；Transform 可 Undo。
- 隐藏不持久；Suppress 持久。
- Projector `Fit to entities` 只在非只读版本、非 Surface、Position/Scale 会变化时出现；拟合基于包围盒。
- Section view 全局剖切，不可单独剖 part；Caps 默认白色；可 Override cap color；Block light 可逐面开关；一次只调一个剖切面。
- Decal：平面/柱面最多 3 个重叠；不可库选/复制/删除/隐藏。

### 7.4 事务/撤销/版本/权限/协作约束

- `[文档明确]` Render Studio：Undo/Redo 标准；Clear face appearances=2 undo；删除可 Undo；场景依赖版本；工作区外更新需新版本；Reference manager 选择性更新；Pin/Unpin/Replace reference；多人可访问但不可同时编辑；降级后不可访问；Advanced 按 Application 席位。
- `[文档明确]` Variable Studio：跨文档引用必须版本；Configured 不可 Release；Release 走标准发布流程；移动端不可创建。
- `[文档明确]` Feature Studio：自动保存 + 显式 Commit 两阶段；Commit all；未提交计数；Commit 前不应用代码。
- `[文档明确]` PCB：导入/同步/导出均为显式动作；翻译中 Resync 报错；配置化 part 不能映射；库文档/文件夹由管理员预置；PCB 标签降级不可访问。
- `[文档明确]` CAM：所有插入组件需 version reference；operation 可 Suppress/Delete；导出前可 `Post child operations` 或 `Post selected operations`。
- `[推断]` LubanCAD 若实现 Studio 类标签，建议沿用现有 `LubanFeatureRpcInterface`/`EditTools` 事务与 iModel 版本能力：场景/参数作为 App 级数据，不写入 BIS 几何；场景源模型以 iModel 版本/变更集快照引用；避免第二套撤销状态机（P0-01/P0-05）。

### 7.5 可写测试断言的验收点

1. `[文档明确]` 普通版 Render options 选择 HD 1080 时宽高不可编辑；尝试 10000×10000 应被 2.1 MP 上限拦截（Advanced 才允许 100 MP）。
2. `[文档明确]` Multiple 选择 61 个 Named views 应被“最多 60”拒绝/截断（文档写 limit 60）。
3. `[文档明确]` 给已有 face 外观的 part 分配外观：点 `Clear face appearances` 后 Undo 一次只恢复一步（共 2 步）；点 x 则保留 face 外观。
4. `[文档明确]` 平面面第 4 个重叠 Decal 导入但不可见；圆柱面同理。
5. `[文档明确]` `space` 清空选择；多选时 Appearance 面板只显示外观列表；单选后显示参数。
6. `[文档明确]` 隐藏 part 后刷新页面，隐藏状态丢失；Suppress 后刷新仍抑制。
7. `[文档明确]` Projector 的 Fit 在只读版本、Surface 类型、或无 Position/Scale 变化时不出现。
8. `[文档明确]` Transform Scale 任一轴设为 0 应被拒绝；Rotate 输入 361 应被限制到 ±360。
9. `[文档明确]` Camera Film ISO=0 时 F-stop/Shutter 改动不影响亮度（全部由 cd/m² factor 控制）。
10. `[文档明确]` Variable Studio Name 输入非字母数字应被拒绝；跨文档插入无版本的 Variable Studio 应提示先建版本；Configured Variable Studio 的 Release 应不可用。
11. `[文档明确]` Feature Studio 修改代码但不 Commit，文档不应应用新代码；Commit all 的括号计数应等于未提交 Feature Studio 数。
12. `[文档明确]` PCB 导出 zip 内文件名特殊字符应转为 `-`；`Resync from Onshape` 在翻译中应报错。
13. `[文档明确]` PCB 从 Part Studio 同步：名字含 `Board`/`PCB` 的 part 识别为板；`Zone`/`Rigid`/`Flex` 仅 IDX；`Route` 类导出不支持（应明确提示）。
14. `[文档明确]` Rigid-Flex 同步后在 Part Studio/Assembly 应自动有 `Flattened`（默认）与 `Folded` 两个配置，板实例 Fixed，Folded 中 Mate/Mate connector 隐藏。
15. `[文档明确]` CAM 工具栏初始 inactive；插入组件后 `Create job` 激活；未选 4/5 轴时 `Tool repositioning` 不出现。
16. `[文档明确]` CAM Tool 的 `Assembly number` 换 job 后不保留（不链接刀具库）。
17. `[推断]` 渲染服务端延迟与渐进清晰应作为性能探针的“允许中间态”，不能用首帧像素判定最终质量（P0 测试口径需允许轮询重试）。

### 7.6 需要登记为“能力边界/缺口”的项

- Render Studio 完整外观/环境目录、AxF/OpenVDB/IES/HDRI、Advanced 席位、服务器渲染延迟、60 视图/2.1 MP 上限、Decal 3 层限制、部分 UI 仅 Pro/Enterprise。
- PCB Studio 依赖 Altium 账号/workspace/Connector App；ECAD 格式仅 IDF/IDX/Eagle；Copper/Silkscreen 单向；Rigid-Flex 折弯区无 decal；IDX 导出 flex 可能误判。
- CAM Studio 依赖机床/post 数据库与 Gcode 生态；CAM Studio/Advanced 的轴数与策略门禁；刀具库导入/导出为文档标签形式。
- Feature Studio 是 Onshape 私有 DSL 的 IDE；LubanCAD 是否提供同类脚本层需另行 ADR，不能直接当作通用需求。
- 计划/席位文字在语料中多处被图片吞掉：产品页仅 Render Studio/PCB Studio 的 description 明示 Pro/Enterprise；CAM Studio 明示 Professional 及以上；其它“Only available for .”不得臆造。

### 7.7 与 LubanCAD 现有对齐计划的关系（克制结论）

- `[文档明确]` Onshape 把 Render/Variable/Feature/PCB/CAM 都做成“文档内标签 + 独立应用”，共享标签生命周期、版本、权限与任务体系。`[推断]` 这对 LubanCAD 的“Studio 应用注册/标签宿主”设计有直接参考价值：统一标签右键菜单与版本门禁可在宿主层复用，而非每个 Studio 自造。
- `[文档明确]` Render Studio 的 Scene list 是“层级属性继承 + override”的通用场景图模式，Appearance 与 Transform 都遵循它；Projector/Volume/Light 是独立场景实体。`[推断]` 对应到 iTwin.js 可用显示规则/FeatureOverride 体系承载外观继承，但文档不能证明实现方式，需在 AIRR 中另行验证（避免第二套渲染/状态机，P0-01）。
- `[文档明确]` Variable Studio 支持 CSV 导入、跨文档引用、Release；`[推断]` 与现有 ADR-0020（变量/表达式）相比，**CSV From import、跨文档 Variable Studio 引用、Configured 不可发布**是可能缺口，应按产品优先级评估，不应直接照搬 Onshape 表结构。
- `[文档明确]` PCB/CAM 是独立应用族，依赖专业 ECAD/CNC 生态；`[推断]` 短期不宜纳入 LubanCAD 核心建模对齐批次，建议仅登记能力账本与接口边界（P0-04 先论证）。

---

## 质量自查

- 主题表格行数：**29 行**（2.1=2、2.2=15、2.3=5、2.4=5、2.5=3、2.6=1，合计 29），与组文件 29 个 `===== TOPIC:` 一致。
- 29 个 URL 均已出现（见第 2 节各表）。
- 词数：63,525，与组头一致。
- 抽取噪音已披露：计划徽章缺失、表格压平、图片信息缺失、快捷键重复、Textures and Bump Maps 的 `.ies` 残留。
