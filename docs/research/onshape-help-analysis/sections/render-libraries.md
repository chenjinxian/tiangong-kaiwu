# Render Studio Libraries（渲染素材库目录）分析报告

> 分析对象：`groups/render-libraries.txt`（单主题组，1.4 MB，22,235 行，语料声明 190,369 词）
> 分析日期：2026-11-22；只读本地语料，未联网、未改动输入与仓库。

## 1. 本章概览

- **主题数**：1（`Render Studio Libraries`），TOC 路径 `Render Studios > Render Studio Libraries`，URL `/Content/RenderStudio/render_studio_libraries.htm`。
- **词数**：语料头部声明 190,369 词；按空白切分的实测约 189,911 词（差异来自连字符/表格符号的切分口径）。
- **子域**：Render Studio 的两套标准素材库（Appearances、Environments），外加三张配套表（functions、modifiers、Part Studio Material→Appearance 映射）。
- **文档形态**：本主题**没有操作步骤或教程正文**，几乎是五张超大型目录表加一句简介。所有内容均为“素材条目 + 参数清单式描述”，没有对话框字段、快捷键、撤销/版本等流程说明。
- **更新日期**：语料未提供任何更新日期或版本号。
- **可用性**：正文只写 `Available in: Render Studio`；上方 `Only available for` 一行后的徽标图片已被抽取为空白，无法还原具体平台/版本徽标。
- **抽取限制**：HTML 表格被压平成“每单元格一行、行间空行”的形式；图片只剩 `[image]`。Appearances 表每行固定 4 个 `|` 前缀单元；Environments 表的 Display 缩略图完全丢失，且部分标签单元格因原表换行被拆成两行（165 行为 3 行块）。因此 Environments 只能确认“名称 + 逗号分隔标签”，无法看到缩略图与真实描述排版。
- **可复核方法**：用 Node 按空行切“块”，每块即一行；Appearances 区域为第 24–19433 行（表头在第 24 行），Functions 为第 19438–19701 行，Modifiers 为第 19706–19800 行，Mapping 为第 19803–20894 行，Environments 为第 20897 行至文件末（22234 行）。关键总数已交叉校验：144 个文件夹计数之和 = 3,881；Environments 的 21 个标签计数之和 = 2,307，且各环境标签数分布之和 = 390；各子表 `|` 行数分别为 15,528 / 198 / 76 / 910，恰等于“表行（含表头）×列数”，与块解析结果一致。

**质量警告**：Appearances 表存在 24 行四字段完全相同的重复行（例如 `Clay>Ceramic / Glazed ceramic / Dark blue diamond tile`、`Fabric>Lace / Lace fabric / Sheer black floral`、`Gem stone / Gem stone / Amethyst`、`Glass / Glass / Clear`）、65 个重复的 `folder+name+subheading` 键；Environments 存在 `Lowcontrast` 拼写错误标签、同一环境同时标 `Indoor`/`Outdoor`（4 例）或 `Natural Light`/`Artificial Light`（22 例）等情况。另有 12 行描述为空（均为 Function/General 工具项）。描述文本还保留了 `Whte`、`reflecitity`、`Ajdust`、`photoemetric`、`Floorboads` 等原始拼写错误。这些是数据现状，不应在实现时当成有意设计。

## 2. 主题清单与逐篇摘要

| 主题 | TOC 路径 | URL | 一句话摘要 |
|---|---|---|---|
| Render Studio Libraries | Render Studios > Render Studio Libraries | /Content/RenderStudio/render_studio_libraries.htm | 以五张大表列出 Render Studio 的标准 Appearances 库（3,881 条外观）、其 functions/modifiers 子集、Part Studio 材质映射表，以及 Environments 库（390 个环境）及其分类标签。 |

### 目录总览（实测）

| 子表 | 列结构 | 数据行（不含表头） | 作用 |
|---|---|---:|---|
| Appearances library | Appearance folder / Appearance name / Appearance name subheading / Appearance description | 3,881 | 标准材质外观主目录 |
| Appearances library - functions | Function name / Function subheading / Description | 65 | 可在 Appearances Library 面板中使用的函数（含 1 条完全重复） |
| Appearances library - modifiers | Appearance folder / Appearance name / Appearance name subheading / Appearance description | 18 | 在基础外观上叠加的修改器 |
| Part Studio Material → Render Studio Appearance mapping | Part Studio Material Name / Render Studio Appearance name / subheading / Appearance color is mapped / Transparency is mapped | 181 | Part Studio 材质到渲染外观的映射 |
| Environments library | Display / Name / Description | 390 | 环境（光照/天空/室内外）目录及其标签 |

合计 4,535 条数据行。Appearances 的 3,881 条占绝对主体（约 85.6%），因此本主题本质上是**材质素材清单**，而非功能操作文档。

## 3. 核心概念与术语

- **Render Studio**：唯一明确声明的可用产品环境。
- **Appearance（外观）**：赋给 part/face 的材质描述；条目四元组为 `folder / name / subheading / description`。
- **Appearance folder**：两级层次路径，形如 `Clay>Ceramic`、`Metal>Brass`、`Wood>Walnut`；顶层 24 类，二级 120 类，合计 144 个文件夹。
- **Appearance name**：材质族名称（如 `Glazed ceramic`、`Ashlar masonry`、`Carbon fiber`）。
- **Appearance name subheading**：具体变体/饰面/颜色（如 `Coated`、`Semi glossy`、`Versailles`、`CFUD001`）；`[N/A]` 表示无子标题。
- **Functions / Modifiers**：文档明确说二者都是 Appearances 的子集，且都“从 Appearances Library 面板访问”。
- **Part Studio Material**：Part Studio 侧的材质名（181 个），映射到 Render Studio 的 appearance name + subheading。
- **Environments library**：环境库，条目由名称与 1–8 个逗号分隔标签组成；表头写 `Display / Name / Description`。
- **渲染参数术语**：PBR、ior（折射率）、Abbe number（色散）、anisotropy（各向异性）、top coat / clear coat、sheen、flake、thin film、transmission、opacity、volume、absorption/scattering、subsurface scattering、emission、bump/normal、UV / UVW、triplanar、ORM、SG（specular gloss）、IES、photometric、AxF、OpenVDB、`Render Studio Advanced`。
- **作用域用语**：`part/face`（可赋给零件或面）；functions 可作用于 `any base, global, or transmission appearance parameter (except bumps/normal)`；modifiers 多数要求 “preserving the base appearance / Apply a new base appearance”。

## 4. 功能与 UI 明细

### 4.1 Appearances library（3,881 条）

**表结构**：四列，表头原文为 `Appearance folder`、`Appearance name`、`Appearance name subheading`、`Appearance description`。Appearances 没有 Display/缩略图列；库面板中的卡片缩略图在本文档中不可见。

**层级与规模**：144 个文件夹，深度最多 2 级；顶层 599 条、二级 3,282 条。顶层 24 类的精确计数：

> Metal 766；Stone 524；Fabric 508；Wood 488；Clay 401；Paint 364；Plastic 262；Paper 150；Glass 85；Ground 76；Function 45；Tape 25；Gem stone 22；Liquid 22；Rubber 21；Concrete 18；Plaster 18；Construction 17；Lighting 17；General 15；Jelly 12；Carbon fiber 11；Retroreflective 8；Mirror 6。

最大二级目录：`Clay>Ceramic` 397、`Stone>Masonry` 251、`Fabric>Leather` 143、`Paper>Wallpaper` 123、`Metal>Brass` 101、`Paint>Car` 100、`Stone>Concrete` 92、`Wood>Maple` 86。

**命名模式**：
- 名称高度复用：421 个不同 name 覆盖 3,881 行。重复最多的 name 为 `Glazed ceramic` 272、`Ashlar masonry` 180、`Metal` 132、`Wallpaper` 123、`Ceramic porcelain` 120、`Paint` 115、`Maple wood` 86、`Teak wood` 52、`Glass` 47。
- subheading 是真正的变体键：2,388 个不同值；118 行为 `[N/A]`（Function 31、Lighting 11、General 9，其余分散在金属/石材等）；只有 5 个代码型 subheading（`CFUD001`、`CFUD002`、`CFUD004`、`CF3KC02`、`CF3KG02`）。
- 描述采用模板化句式：`<变体> appearance for part/face.` + 可选 `Replace ... via file selection.` + `Adjust ... parameters.`。3,837/3,881 行含 `Adjust`，129 行含 `Replace`，152 行提到 file selection；12 行描述为空（`Data is valid`、10 个 `Data lookup ...`、`Onshape appearance`）。
- 描述长度中位数 268 字符、p90 526 字符、最长 793 字符；中位数一行含 11 个逗号，最长条目 35 个逗号项。说明外观条目不是简单色卡，而是**几十个可调参数的材质预设**。
- 除材质族外，目录还覆盖大量垂直场景：`Paint>Car` 100 条（solid/metallic/chameleon/flipflop 车漆）、`Paper>Wallpaper` 123 条、`Fabric>Leather` 143 条、`Ground` 76 条（沥青/砾石/覆盖物/铺装/沙/岩石）、`Construction` 17 条（屋面/地板）、`Mirror` 6 条、`Retroreflective` 8 条、`Liquid` 22 条（21 水 + 1 油）、`Jelly` 12 条。测试与素材验收不能只抽样金属/塑料，否则会漏掉程序化图案、车漆薄片、地面无限平铺等参数分支。

**可调参数族（按 3,881 条描述中“命中行数”统计，非参数总数）**：

| 参数族 | 命中行 | 代表字段 |
|---|---:|---|
| UV / 变换 | 2,973 行含 `uv space index`；3,426 行含 `transform (...)`；665 行 `infinite tiling` | transform（scale/translate/rotate）、uv space index、texture space、tiling/offset/rotation |
| 粗糙度/反射 | 3,561 / 1,430 / 1,296 / 289 / 308 | roughness、reflection、reflection roughness、reflection weight、reflectivity |
| 凹凸/法线 | 2,904 行含 bump；2,510 行 `bump strength`；224 行 normal | bump scale/strength、normal map、micro roughness |
| 各向异性/朝向 | 404 / 351 / 366 | anisotropy、anisotropy rotation、orientation |
| 涂层 | 487 行含 coat/coating/coated；29 行 `coat amount`；5 行 `clear coat`；3 行 `top coat` | coat visibility/ior/roughness、orange peel size/strength |
| 颜色 | 3,001 / 379 | color、2 colors（部分条目最多 3 色 + 图案色） |
| ior/透射 | 727 / 66 / 38 | ior、transmission（color/roughness/weight）、opacity |
| 高级外观 | emission 15、sheen 18、flake 166、cutout 24、volume 34、absorption 167、scattering 61、dispersion 8、Abbe 92 | 自发光、薄片、薄壁镂空、体积吸收/散射、色散 |
| 表面瑕疵/程序化 | dirt 761、edgewear 77、random 386 | dirt/spots、scratches、smudges、imperfection、random seed/rotation |
| 圆角/跨材质 | radius 1,118、`across materials` 1,118 | round corners、radius mm、跨材质应用 |

**典型条目**：
- `Carbon fiber / Composite`：bump、orientation、reflectivity 三张纹理可替换；调 reflectivity、bump scale、anisotropy、micro roughness、Top coat（orange peel size/strength、ior、micro roughness）、texture repetition。
- `Clay>Ceramic / Glazed ceramic / Antique white dirty offset diamond tile`：本表最长描述（793 字符、35 个逗号分隔项），含 3 种砖色、菱纹色、随机种子、釉面 orange peel、craquelure、grout、dirt、AO、纹理空间等。
- `General` 的 15 条揭示了模型族：`AxF appearance [Measured]`、`PBR [Specular glossiness]`、`OpenVDB volume`、`Measured with clear coat`、`Flexible material model`、`Translucent [Thick/Thin]`、`Simple diffuse`、`FFF 3D print` 等。
- `Lighting` 17 条：Diffuse area light、2×IES light、3×Spot light、2×Diffuse light、Mia photometric light、Photometric light、6×Light source emitter（1900K/2700K/3000K/4000K/5000K/7000K）、Display screen。
- `Gem stone` 22 条（含重复的 Amethyst），默认值明确“based on 2 cm. stone size”；`Mirror` 6 条；`Retroreflective` 8 条；`Tape` 25 条。

### 4.2 Functions 表（65 行 / 56 个不同名称）

表头 3 列：`Function name / Function subheading / Description`。文档说明它们是 Appearances 的子集、从 Appearances Library 面板访问。65 行中 `Blend normals` 完全重复一次，去重后 64 个名称+子标题组合、56 个不同名称。主表 `Function` 文件夹另有 45 行（39 个不同名称）；两表并非简单包含：functions 表新增 19 个名称，主表另有 `ORM texture lookup`、`SG lookup` 两个名称不在 functions 表。

功能分组：
- **纹理/坐标**：Coordinate projection（UVW/world/object，TRS 或矩阵，**9 种投影类型**）、Coordinate source、Coordinate transform、Rotation translation scale、Triplanar（三张 2D 位图/法线，逐轴 tiling/offset/rotation）。
- **贴图导入与法线**：Import bitmap file、Import bump map file、Normal map、Tangent space normal texture、Blend normals、ORM texture lookup、SG lookup。
- **程序化图案**：Checker、Flow noise、Perlin noise、Cellular noise、Worley noise、Tile、Gradient（linear/square/box/diagonal/90°/360°/radial）、Flake noise、FFF 3D print（texture + bump 两版）。
- **颜色/数值**：Get RGB component、Color intensity、Convert color↔vector、Vector length、Invert color、Convert Kelvin to color、Scale color、Blend colors（**28 种 blend mode**）、Blend color layers（**28 种 blend mode**）、Sine/Cosine 1d、10 个 `Data lookup` + `Data is valid`。
- **物理/光谱**：Spectral ior（**Abbe 0 = off；25–85 = dispersive**）、Spectral index refraction（Sellmeier B/C）、Architectural gloss to rough（Iray v2 Arch+Design 语义）、Black body emission、Black body volume emission、Volume coefficient。

### 4.3 Modifiers 表（18 行）

文档说明 modifiers 也是 Appearances 子集、从 Appearances Library 面板访问；表结构与主表相同，subheading 均为 `[N/A]`。18 个名称全部为：

`Add rounded corners`、`Add sheen`、`Add volume`、`Appearance set (Render Studio Advanced)`、`Double sided`、`Add global bump map`、`Apply clear coat`、`Apply color fall off`、`Apply dust cover`、`Apply flake coating`、`Apply thin film`、`Surface blender`、`Surface falloff`、`Add sticker overlay`、`Add emission`、`Add thermal emission`、`Apply thin metal coat`、`Add cutout`。

语义要点：
- 多数 modifier “preserving the base appearance / Apply a new base appearance”，即**包装/叠加**而非替换。
- `Double sided`：前后两面外观；强制 **thin walled**；两面 transmission 必须一致；用共同 cutout 参数决定可见区域。
- `Add cutout`、`Add sticker overlay`：都**需要 mask image file**；cutout 强制薄壁（树叶、草、栅栏）。
- `Surface blender` / `Surface falloff`：在两张外观之间混合；后者调 blend bias、blend weight edge、blend weight facing。
- `Add rounded corners`：radius + roundedness；`Apply thin film`：ior + thickness；`Add thermal emission`：温度改变颜色。
- `Appearance set (Render Studio Advanced)` 是唯一带产品层级后缀的条目，可在同一组外观间切换做变体实验。

### 4.4 Part Studio Material 映射表（181 行）

5 列：Part Studio Material Name、Render Studio Appearance name、subheading、`Appearance color is mapped`、`Transparency is mapped`。

- 181 个 Part Studio 材质名，**全部唯一**；映射到 63 个不同的 `appearance name + subheading` 组合。
- **颜色映射显式 Yes：60 行**；其余 121 行为空（未标 Yes）。**透明映射 Yes：仅 1 行**：`Glass → Flexible material model`。
- 覆盖金属（铝/钢/不锈钢/铜/钛/镍等，含牌号如 6061、304、316、17-4）、塑料（ABS/PEEK/PC/PETG/PTFE 等）、木材（Ash/Beech/Cherry/Mahogany/Walnut 等）、复合材料、玻璃、橡胶、MDF/HDF 等。
- 映射常多对一：`Metal`（name 为空 subheading）承接 18 种材质，`Pitted steel` 16 种，`Plastic / White` 15 种。

### 4.5 Environments library（390 条）

**表结构与抽取**：表头 `Display / Name / Description`；Display 缩略图丢失。每条数据实际只剩两段：名称（390 个全部唯一）与逗号分隔标签串。未见独立散文描述，故本报告把该串视为分类标签（表头 Description 列）。165 条因标签换行被抽成 3 行块。

**标签与计数（21 个，总计 2,307 次）**：

| 分组 | 标签及精确计数 |
|---|---|
| 场景 | Outdoor 285、Urban 212、Nature 193、Indoor 106 |
| 光源 | Natural Light 324、Artificial Light 84 |
| 对比度 | High Contrast 141、Low Contrast 137、Medium Contrast 108 |
| 天空/天气 | Partly Cloudy 131、Skies 109、Clear 90、Overcast 56 |
| 时段 | Morning-afternoon 127、Sunrise-sunset 93、Midday 77、Night 22 |
| 特殊 | Studio 8、Daylight (Physically Correct) 2、Lowcontrast 1、Default 1 |

标签数分布：1 个标签 3 条；4 个 47 条；5 个 55 条；6 个 161 条；7 个 117 条；8 个 7 条。按 390 条计，最高覆盖为 Natural Light（83.1%）、Outdoor（73.1%）、Urban（54.4%）、Nature（49.5%）、Indoor（27.2%）。标签不是互斥维度：4 条同时 Indoor+Outdoor，22 条同时 Natural+Artificial Light；没有同一环境同时出现两个对比度或两个时段标签。可见它更像**多 facet 描述**而非单层分类树。

**命名模式**：以地点/场景命名（Abandoned Church、Adams Place Bridge、Zwinger Night、Zhengyang Gate、Xiequ Yuan 等），390 个名称无重复。88 个以 1–2 位数字后缀结尾；30 个系列有重复基名，例如 `Studio Small` 7 个、`Urban Street` 4 个、`Kloppenheim`/`Lenong`/`Machine Shop`/`Missile Launch Facility`/`Quarry` 各 3 个。特殊条目：`Perez` 与 `Preetham` 仅标 `Daylight (Physically Correct)`，`Standard` 仅标 `Default`——这 3 条明显是旧式/程序化天空模型，其余 387 条是场景型环境 `[推断]`。`Studio` 标签共 8 条（Photo Studio 01、Studio Small 01–07）。

**数据异常**：`Moulton Station Train Tunnel West` 同时标 `Clear` 与拼写错误的 `Lowcontrast`；该错误标签只出现 1 次，规范化时应并入 `Low Contrast`。

### 4.6 两库的组织方式与 UI 关系

- **Appearances** 是**层次树**：24 个顶层族 → 120 个二级文件夹 → 3,881 张卡片；卡片以 name + subheading 区分变体，描述是参数说明。Functions 与 Modifiers 不是独立库，而是“Appearances Library 面板”中的可检索子集；functions 用于参数级纹理/数值运算，modifiers 包装在基础外观外。
- **Environments** 是**扁平列表 + 标签分面**：390 个名称，按 21 个标签描述场景、光源、对比度、天气与时段。标签看起来就是面板筛选/facet 的数据基础 `[推断]`；文档未给出任何筛选交互、缩略图规格或拖放行为。
- **Part Studio 映射表**把 Part Studio 材质名接到 Render Studio 外观，并额外记录“颜色是否跟随”“透明是否跟随”，是两套 UI（Part Studio 材料与 Render Studio 外观）之间的桥。
- **产品边界**：`Available in: Render Studio`；`Appearance set` 标注 `Render Studio Advanced`。无 Windows/macOS/iOS/浏览器差异描述。文档未给出快捷键、选择预选、右键菜单、事务/撤销规则。

## 5. 工作流、规则与错误状态

本主题是**目录型参考页**，不是流程页：没有创建、编辑、确认、保存、撤销、版本、协作、权限的步骤或图示。可提取的规则仅为参数语义与少量硬约束：

1. 外观作用于 **part/face**；functions 可作用于任意 base/global/transmission 参数，但**明确排除 bumps/normal**（该限制在函数描述中重复出现）。
2. functions/modifiers 均从 **Appearances Library 面板**访问；modifiers 一般保留基础外观，需“apply a new base appearance”。
3. `Double sided` 强制薄壁且两面 transmission 必须匹配；`Add cutout`、`Add sticker overlay` 依赖 mask 图片；`Add cutout` 也强制薄壁。
4. 映射表以 Yes/空表示颜色、透明是否映射；只有 Glass 明确透明映射。
5. 文档没有默认值表。仅有的数值线索：圆角 `radius mm` 使用毫米；Abbe `0 = off, 25–85 = dispersive`；`Blend colors`/`Blend color layers` 各 28 种混合模式；Coordinate projection 9 种投影类型；`Apply color fall off` 5 档颜色衰减；宝石默认值按 2 cm 尺寸；6 个色温发射体 1900K–7000K；`Blend color layers` 可加多层颜色层。
6. **无错误/失败状态文本**。可观察到的数据问题（重复行、拼写错误、空描述、标签冲突）不是产品错误，不能据此编造错误处理逻辑。
7. **更新/重建行为**：未说明。外观参数变化是否触发重新烘焙、纹理缓存、GPU 重编译等，文档无内容。

## 6. 与其他章节的关系

- 本主题位于 `Render Studios > Render Studio Libraries`，是 Render Studio 文档族的**数据附录**；同组相邻主题（`render-other-studios.txt` 等）才可能包含操作流程。
- 文本内**没有可抽取的超链接或显式交叉引用**。可确认的关系来自表语义：
  - 上游：Part Studio 材质定义（映射表左列 181 个材质名）、外部素材（AxF 数据、OpenVDB、位图/法线/凹凸贴图、IES 光配置文件、mask 图片）。
  - 下游：Render Studio 的 Appearances Library 面板、Environments 库/环境光照、Part Studio 材质赋值的渲染外观选择、Render Studio Advanced 的外观集。
- `Only available for` 徽标图片缺失，无法判断是否有企业版/试用版限制；只能确认 `Render Studio` 可用。
- 与几何/草图/装配章节没有直接依赖；与“材料/外观”“渲染/可视化”章节属于同一能力域。

## 7. 对 LubanCAD 的可执行启示

**界面表面**
- `[文档明确]` 需要 Appearances Library 面板，支持两级文件夹树（24 顶层 + 120 二级）、卡片名 + subheading、分类检索；需要 Environments 库/面板，支持 390 条环境与 21 个标签分面。
- `[文档明确]` 需要在 Part Studio 侧提供材质→渲染外观映射，并显示“颜色映射/透明映射”两个布尔语义。
- `[推断]` 面板需要缩略图、搜索、facet 多选、文件夹折叠；文档只给数据，未给交互规格，不能据此冻结 UI 细节。

**参数与默认值清单**
- `[文档明确]` PBR 扩展材质参数族至少包括：base color、roughness、metallic、specular/gloss、ior、transmission（color/roughness/weight）、opacity、absorption、scattering、volume、emission、sheen、clear/top coat、anisotropy + rotation、flake、thin film、bump/normal、dirt/edgewear、round corners（radius mm）、UV transform（scale/translate/rotate + uv space index）、tiling/infinite tiling。
- `[文档明确]` 函数语义包括 28 种 blend mode、9 种投影、Abbe 0/25–85、Sellmeier B/C、10 个 data lookup、颜色分量提取/Kelvin 转色、ORM/SG 查表、triplanar、程序化噪声。
- `[文档明确]` 环境标签体系为 21 个（其中 `Lowcontrast` 应归一化为 `Low Contrast`），覆盖 Indoor/Outdoor、Natural/Artificial Light、High/Medium/Low Contrast、Morning-afternoon/Midday/Sunrise-sunset/Night、Clear/Partly Cloudy/Overcast/Skies、Urban/Nature/Studio。
- `[推断]` 文档没有给出任何参数默认值、单位换算（除 mm）、HDR 分辨率/投影、纹理格式、UV 通道数；这些必须由 AIRR/ADR 另行定义，不能从本文档推导。

**交互与选择规则**
- `[文档明确]` 外观可赋给 part/face；functions 排除 bumps/normal；modifiers 保留基础外观；double-sided 与 cutout 强制 thin-walled，double-sided 两面 transmission 需一致；cutout/sticker 需要 mask。
- `[推断]` 若复刻“外观集（Appearance set，Advanced）”，需要同一实体的多外观变体切换状态与预览，不仅是单值属性。

**事务/撤销/版本/权限/协作**
- `[文档明确]` 无。本文档不提供任何事务、撤销、版本、权限或协作约束。
- `[推断]` 外观赋值属于模型状态修改，若接入 LubanCAD，应按标准事务/撤销处理；但这是平台规则推断，不是本主题证据。

**可写成测试断言的验收点**
1. Appearances 表解析出 **3,881** 条、**144** 个文件夹、**24** 个顶层、**2,388** 个不同 subheading；各顶层计数与本文一致。
2. Functions 表 **65** 行（去重 **64** 个名称+子标题）、Modifiers **18** 行；`Blend normals` 重复行必须按数据现状处理或显式去重。
3. Mapping 表 **181** 个唯一 Part Studio 材质、**63** 个目标组合、**60** 个颜色 Yes、**1** 个透明 Yes（Glass）。
4. Environments **390** 个唯一名称、**21** 个标签、**2,307** 次标签赋值；标签数 1–8；`Studio` 8 条；`Perez`/`Preetham`/`Standard` 三条特殊环境存在。
5. 材质卡参数覆盖检查：`uv space index`、transform、bump、roughness、ior、coat、anisotropy、transmission、emission 等字段在编辑器模型中存在，且 functions 对 bumps/normal 的排除规则生效。
6. 数据治理：24 条完全重复行、65 个重复键、`Lowcontrast`、`Whte`、`reflecitity`、`Floorboads` 等拼写问题需要清洗或加例外登记；不能静默改变计数。

**对渲染器实现的硬需求（按证据强度排序）**
- `[文档明确]` **材质模型**：必须支持多层 PBR 扩展（coat/sheen/flake/thin film/transmission/volume/SSS/emission）、每个参数可被纹理或函数驱动。
- `[文档明确]` **UV/纹理管线**：UV space index、TRS、tiling/offset/rotation、位图/法线/凹凸/ORM/SG、triplanar、程序化噪声、mask 图片；缺一不可复现目录中的参数表面。
- `[文档明确]` **光源外观**：Diffuse area/spot/diffuse、IES 光度配置、Mia photometric、6 档色温发射体、Display screen。
- `[推断]` **HDR/IBL**：390 个环境显然替代“环境光照/背景”，但全文 **0 次 HDR、0 次 image-based lighting/IBL**（`ibl` 的 9 次命中全部是 `compatible`/`flexible`/`visible` 等单词内部子串）；HDR 格式、cubemap/equirect 投影、强度与旋转参数均未说明。应从渲染架构层面把它作为 IBL 需求立项，但不能声称文档已规定。
- `[推断]` **素材规模与打包**：3,881 外观 + 390 环境 + 数百张贴图/IES/AxF/OpenVDB 的资产管理、去重、缩略图、版本化与按需下载，是产品化的硬成本；文档只给清单，未给文件大小/性能预算。

**主要缺口**：本文档不足以单独支撑渲染器 AIRR——缺少 shader/BRDF 公式、参数默认值与范围、纹理格式/色彩空间、环境投影与 HDR 规格、LOD/烘焙策略、平台矩阵、错误与撤销规则。可作为“素材目录 schema + 参数覆盖面”的权威输入，其余需结合 Render Studio 操作文档与素材文件实测补证。
