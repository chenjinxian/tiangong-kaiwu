# AIRR：工具栏下拉 / ViewCube / 图形首选项 / 外观面板 Onshape 对齐

- 日期：2026-11-05
- Owner：用户（2026-11-05「工具栏全部下拉菜单…View Cube…图形首选项与外观面板…必须要做到和 onshape 一模一样」）
- 影响仓：apps/web（RibbonDropdown、ViewCube、PartStudioDock、i18n、测试）；不新增 RPC/schema/native
- 关联：`docs/UI-ONSHAPE-PARITY-2026-11-02.md`
- 是否需要 ADR：**否**（纯 UI/交互修正，复用现有 ViewCube/显示设置状态；无契约变更）

## 1. 问题（用户实测）

1. 工具栏下拉菜单：菜单按钮/弹层过大、与触发按钮不配套；弹出位置与图标不对。
2. ViewCube：与 Onshape 差距大（不专业）。
3. ViewCube 的「图形首选项…」与右侧「外观」按钮打开的页面都不是 Onshape 对应页面，且两者被错误合并/错位；需要分别重做。

## 2. Live 证据（2026-11-05，可编辑公开副本）

目录：`D:\Github\onshape-parity-data\ui-evidence\ui-polish-20261105\`

- 工具栏下拉（圆角）：`07-ribbon-dropdown.png` / `.json`；DOM/computed style：
  - 弹层 180px 宽、1px `#ccc`、radius 3、shadow `0 5px 10px rgba(0,0,0,.2)`；
  - 首行=父工具（圆角 shift f），次行=变体（面混合）；行高 34/32，padding 6px；
  - 20px 图标（左起约 7px），label 14px；快捷键 keycap 11px / padding 0 2 / radius 2；
  - 弹层左对齐整个下拉触发器（不是箭头钮），顶边与 toolbar 底边重叠约 1px；
  - 箭头钮 18×32、padding 0 4、chevron 10×10。
- ViewCube：`04-viewcube-crop.png`：
  - 150×150 区域；白/浅灰圆角立方体（初测约 74px；二轮 DPR4 实测面边 58px，
    见 §8）；本地化面标签（上/前/右，屏幕直立）；
  - 无可见角点圆点；三色轴画在立方体**前面**（复核 `04-viewcube-crop.png`：Y/X 轴
    穿过面可见、标签在轴端），原点对齐 cube 左下角；罗盘浅灰；
  - 右下 mini-cube 18-20px + 黑色下三角。
- ViewCube 菜单：`05-viewcube-menu.png` / `.txt`；容器 224px、行 22px、12px 字、1px #d7d7d7、shadow 0 5px 10px .2；
  - 完整项：等轴测 / 正二等轴测 / 正三轴测 / 图形首选项…(gear) / 命名视图… / 上一个视图(禁用) / 缩放到合适大小 / 放大所选窗口 / 透视视图 / 编辑时使法向方向垂直于草图 / 带边着色▸(勾) / 消除隐藏边▸(勾) / 相切边可见▸ / 启用高质量视图 / 亮显边界边 / 剖视图…(scissors)；
  - 勾选在左、圆形信息图标在右、子菜单三角在右。
- 图形首选项：`09-graphics-preferences.png`（常规 tab）、`12-graphics-sketch-tab.png`（草图 tab）：
  - **左侧非模态面板**（约 300×590），标题 + 绿✓/红✗；tab 常规/草图；
  - 常规：视口（环境光遮蔽 20%、视野 45 deg）、阴影部分（线宽 2px、光泽度 3%、镜面反射颜色、剖面干涉颜色）、影线边（影线相切边宽度/颜色）、网格主体（网格线宽）；每行右侧 info；底部重置为默认值 + ?。
  - 草图：活跃草图（线宽 2px、约束颜色、欠约束颜色、欠约束被遮挡颜色）、非活跃草图（线宽 1px、颜色）、构造线（第一个划线/间隙、第二个划线/间隙）。
- 外观面板：`11-appearances-panel.png`（空）、`13-appearances-with-part.png`（有零件）：
  - **右侧面板**（约 575px 宽）标题「外观」+ 右上角小图标；tab 零件和曲面/草图和曲线；
  - 行：零件名 + 全宽颜色字段；空态显示线稿插画 + 文案。

## 3. 复用矩阵 / 决策

| 需求 | 现有实现 | 决策 |
|---|---|---|
| 下拉菜单 | iTwinUI DropdownMenu | **替换**为自定义 Onshape flyout（尺寸/位置/行内容可控） |
| ViewCube DOM/CSS | 现有 150×150 3D cube | **重写视觉层**，保留旋转/命中/菜单状态逻辑 |
| ViewCube 菜单 | 自绘 224px 菜单 | 补齐条目/图标/勾选/禁用/分隔线，样式沿用 |
| 图形首选项 | 右 dock DisplaySettingsPanel | **新建左侧对话框**；映射 AO/FOV/线宽等已有设置 |
| 外观面板 | appearances 钮错接 display dock | **新建右侧 AppearancesPanel**；display dock 不再由该钮打开 |
| 设置真源 | `useDisplaySettings` | 复用同一实例；新增字段仅本地 UI 状态 |

不新增第二套显示设置状态；不引入 AppUI；不新增 RPC。

## 4. 诚实边界

- 图形首选项中渲染器未暴露的项（镜面反射颜色/剖面干涉颜色/影线边/网格线宽；草图约束颜色等）
  先呈现与 Onshape 相同的控件与分组，但禁用并给出「当前渲染器暂不支持」提示，不静默假生效。
- 已支持项（环境光遮蔽、视野、线宽、显示模式、边线颜色/宽度、BRep 边/点、阴影、AA、背景）
  正常生效；外观面板的零件颜色用 iTwin per-element color override 实现，多体逐体生效。
  **颜色是当前会话的显示投影，不写入 iModel/BIS**；持久化外观需要 BIS 外观属性 +
  schema 版本化迁移，不在本切片（live 对比截图见 `47/48-our-appearance-*.png`）。
- 外观面板「草图和曲线」tab 首版列出草图/曲线条目与颜色字段；曲线着色若当前渲染器不可用，
  同样禁用并提示。

## 5. 测试/验收

- 单测：RibbonDropdown 菜单内容/尺寸/键盘/父项+变体；ViewCube 面标签本地化/菜单项齐全；
  GraphicsPreferences 字段/tab/取消回滚；AppearancesPanel 行/空态/颜色回调。
- tsc/lint + 全量 web vitest；真栈打开示例 iModel 截图对比（本切片以 UI DOM/截图验收，
  无契约/事务变更）。
- 回滚：恢复 iTwinUI DropdownMenu 与旧 ViewCube/DisplaySettingsPanel 路由即可；无库数据影响。

## 6. 评审结论

- Owner 指示明确；live 证据已采集；无 P0 例外；结论：**批准执行**。

## 7. 实施记录（2026-11-05）

- 代码：`RibbonDropdown.tsx`（portal 自定义菜单）、`ViewCube.tsx|css`（重写视觉 + 菜单、
  三色轴前置、面标签本地化）、`GraphicsPreferencesDialog.tsx|css`、
  `AppearancesPanel.tsx|css`、`useBodyAppearanceOverrides.ts`、`PartStudioDock/Page` 接线、
  `display-actions.ts` 默认值（AO 20 / FOV 45 / 线宽 2 / 光泽度 3；2026-11-06
  用户校正，v2→v3 localStorage 迁移仅替换旧默认项）。
- 测试：web **1374/1374**（106 files）；tsc（含 e2e）与 lint 绿；新增测试
  GraphicsPreferences 5、Appearances 3、useBodyAppearanceOverrides 2、
  Ribbon 父行/快捷键 1、ViewCube 标准视图/自由视角 1、Front 面轴原点 1；
  其余为既有断言更新。
- 真栈证据（`ui-evidence/ui-polish-20261105/47–54`）：下拉实测 180×68、rows 34/32、
  弹层左缘/顶边与触发组对齐；ViewCube 等轴测三色轴在面上、面标签在正视图中正立；
  图形首选项 reset 后与 live 默认一致；Body 1 改红色视口即时生效。
- 未持久化：外观颜色不跨刷新/不写 BIS（见 §4）；图形首选项未支持项保持禁用。
- 未提交/未推送（按仓规约等待明确指令）。

## 8. ViewCube 二轮精确复核（2026-11-05，用户二次反馈“很丑/大小不对”）

- **Live 分析**：Onshape ViewCube 由主 WebGL canvas 绘制，DOM 仅
  `.os-view-cube-bounds` 150×150（right 0/bottom 5）、`.os-graphics-dropdown`
  trigger 44.226×28、CSS 变量 `--os-axis-*-color = #cd0000/#009400/#0000d0`。
  DPR4 截图 + 像素分析（`ui-evidence/viewcube-exact-20261105/`）给出：
  cube 面边 ~58px（ISO 轮廓 81×85.5 CSS）、面标签屏幕直立（上/前/右）、hover
  `#c4e1f5`、斜切边 `#e3e9ee`、Home 仅自由视角显示、三色轴锚 Front 面左下角。
- **修正**：此前 cube 面 74px + translateZ 42px（面浮空/偏大约 35%）→ 58/29；
  面标签从面内旋转文字改为屏幕对齐直立 overlay；三色轴改锚 Front 面投影
  bottom-left、每轴固定屏幕长度 X60/Y46/Z56、颜色逐字节对齐；Home 在标准视图隐藏；
  trigger 对齐 live 44.25×28、8×4 三角；罗盘弧/三角逐像素重排。
- **边界（诚实）**：live cube 的 WebGL 圆角斜切/光照仍是 shader 产物，CSS+SVG
  重建到相同几何尺寸、颜色、标签/轴/触发器/罗盘布局与观感，但不可能 shader
  逐像素一致；没有伪造“动态网格/sticker”去冒充。
- 证据：`onshape-viewcube-dpr4.png`（live DPR4）、`lubancad-viewcube-final-iso.png`、
  `lubancad-viewcube-front.png`、`lubancad-viewcube-free-home.png`、
  `side-by-side-final.png`。

## 9. ViewCube 三轮交互对齐（2026-11-05，用户反馈“功能很难用/手感差距大”）

- **live 实测**（`ui-evidence/viewcube-interactions-20261105/`）：
  - 面 hover 整面蓝；隐藏面通过轮廓边蓝带选中（六面可达）；角点蓝圆点 → trimetric；
    罗盘弧线 hover 蓝、单步 15°、按住不连发；
  - **无拖拽轨道旋转**（面/空白拖动均不变）；
  - 点击后相机 ~180ms 平滑过渡（t80 中间态、t200 完成），保持目标/缩放；
  - trigger hover tooltip「相机和渲染选项」。
- **实现**：
  - 屏幕空间命中（角点 r10 > 隐藏面边带 6px > 可见面多边形）；隐藏面边带由
    12 条棱中「一可见+一隐藏邻面」自动派生；
  - `animateFrustumChange({animationTime:180})` + 400ms rAF 回读，ViewCube/相机
    逐帧同步；移除 `.cube` CSS transition 和全部拖拽代码；
  - 罗盘弧本体 hover 高亮；左右弧 yaw 15°、上下三角 pitch 15°，不连发；
  - trigger tooltip；视觉面不透明度 0.92、单线边 + 7px 白斜面、9px 标签、1px 轴色。
- 测试：web **1375/1375**、tsc/lint 绿；`tutorial2.spec.ts` 罗盘步进等待改 400ms
  覆盖 180ms 动画；真栈 `ui-parity.spec.ts` 2 passed、`tutorial2.spec.ts` 2 passed
  （3.4min，体积 357.739 cm³）。
- 边界：live cube 为 WebGL shader 玻璃/圆角；CSS+SVG 对齐可测几何与全部交互行为，
  仍非 shader 亚像素一致（未伪造）。

## 10. 官方 iTwin Viewer ViewCube 评估接入（2026-11-05，用户裁决“先接进来看效果”）

- **裁决**：用户不再要求 ViewCube 必须与 Onshape 逐像素一致；若官方 iTwin Viewer
  的 ViewCube 视觉效果/手感更好，可以接受与 Onshape 不同。自研 Onshape 模式保留，
  官方模式为**显式 opt-in**（`?viewcube=itwin`），默认仍是自研模式以保持现有
  e2e/视觉基线；评估后再决定是否切换默认或回退。（历史阶段；最终用户裁决见 §11：
  官方已改为默认并挂上相机/渲染菜单。）
- **复用矩阵**：直接复用官方 `@itwin/imodel-components-react` 的
  `CubeNavigationAid`（AppUI 的 `CubeNavigationAidControl` 同源），不复制其源码；
  官方组件负责 CSS3D 渲染、3×3 命中、拖拽、±90° 箭头、吸附与 0.4s 动画。
  luban-cad 侧只补两处官方 `ViewportComponent` 才有的胶水：
  1. `onCubeRotationChangeEvent` → 固定旋转中心 + world frustum 旋转 + `synchWithView`；
  2. `viewport.onViewChanged` → `ViewportComponentEvents.setViewMatrix` 反向同步。
- **依赖**：`@itwin/imodel-components-react@5.33.0`、`@itwin/components-react@5.33.0`、
  `@itwin/core-react@5.33.0`、`@itwin/appui-abstract`/`@itwin/core-quantity`
  （均 `link:` 本仓 itwinjs-core 5.15-dev）、`sass`；所有 `@itwin/core-*` 仍解析到
  本仓 `link:` 的 5.15 单实例。locale 采用绝对 URL（`/locales/{{lng}}/{{ns}}.json`），避免
  BrowserRouter 嵌套路径把相对 locale URL 解析到页面子路径。
- **风险/回滚**：唯一改动共享启动面的点是 localization URL；回滚只需移除
  `?viewcube=itwin` 渲染分支/依赖，不影响 BIS、RPC、事务、渲染管线与既有 ViewCube。
  官方 React 包 5.33 对 appui-abstract/core-quantity 的 peer 范围是 ^5.0.0，
  两者已改为 `link:` 本仓 5.15-dev（消除 peer 警告与重复实例风险）；若出现
  类型/运行时异常则整体回退，不逐点打补丁。
- **验收**：web vitest/tsc/lint；真实栈打开 `?viewcube=itwin`，验证面板可见、
  面/角点击、拖拽、箭头、外部相机变化反向同步、无控制台异常；证据截图归档
  `onshape-parity-data/ui-evidence/`。未验证前不宣称“已对齐/已替换”。
- **实施记录（2026-11-05 当晚，真实栈已验）**：
  - 新增 `components/ItwinViewCube.tsx|css`、`hooks/useItwinViewCubeBridge.ts`、
    `internal/viewcube-mode.ts`、`e2e/itwin-viewcube.spec.ts`；`PartStudioCanvas`
    用 `React.lazy` 按 `?viewcube=itwin` 加载官方组件，默认路径零官方依赖导入。
  - 事件桥原样移植官方 `ViewportComponent` 的 `getRotatePoint` /
    `handleCubeRotationChangeEvent` / `handleViewChanged`；cube 旋转真实
    viewport，外部视图变化反向 `setViewMatrix`。
  - 环境修复三处：Vite Sass 自定义 importer 解 webpack 风格 `~@itwin/...`；
    `@itwin/core-i18n` 在 viewer startup 注入绝对 locale URL
    `/locales/{{lng}}/{{ns}}.json`（BrowserRouter 嵌套路径不会 404）；官方
    AppUI 包交给 Vite 预打包（CJS 依赖 classnames 等是 pnpm 传递依赖），但
    `core-*` 保持 `optimizeDeps.exclude` 保证单实例。
  - 宿主 CSS 修两处官方组件在纯白画布的适配：`.face { backface-visibility:
    hidden }`（Chromium 命中被背面拦截，Front 中心格点不中）与箭头深灰前景
    （官方白色 SVG 在纯白底不可见）；官方原生 64px cube 按 AppUI 96px 宿主
    放大 1.5×。
  - 测试：web **1380/1380**（+5 viewcube-mode），viewer 127/127，tsc（src+e2e）
    与 lint 绿；真栈 `e2e/itwin-viewcube.spec.ts` 2 passed（setup+用例），既有
    `ui-parity.spec.ts` 2 passed（默认 Onshape 模式不回归）。
  - 构建：官方 cube 为独立 lazy chunk（JS 492 kB / gzip 144 kB；CSS 114 kB /
    gzip 15 kB）；默认模式不加载。
  - 证据：`D:\Github\onshape-parity-data\ui-evidence\itwin-viewcube-20261105\`
    （并排对比、ISO、Top+箭头、原生 64px、自研模式）。实测官方可用但视觉/
    交互面比自研少（无罗盘 15°、三色轴、隐藏面边带、Home、相机菜单）；是否
    改默认/保留 1.5× 等用户看过效果后裁决（后续裁决见 §11）。

## 11. 用户裁决：官方设为默认 + 复用相机/渲染菜单（2026-11-05 晚）

- **裁决**：用户实看后明确「官方默认的交互操作手感非常好，比自研的强多了。就
  使用官方的吧，但是要把 相机/渲染菜单 加上」。
- **默认切换**：`resolveViewCubeMode` 缺省/未知值 → `itwin`；`?viewcube=onshape`
  回退自研。sessionStorage key 升为 `luban.viewcubeMode.v2`（避免继承评估阶段
  旧 opt-in），显式选择跨 `?model=` 重写保持。
- **菜单复用（唯一实现）**：把原自研 ViewCube 的 trigger/菜单整块抽到
  `components/ViewCubeCameraMenu.tsx`（`ViewCubeMenuItem`、全部菜单项/子菜单/
  testid 不变；`useViewCubeHistory` 统一「上一个视图」历史）。自研与官方两种
  宿主共用同一组件；官方模式放在 150×150 stage 内（cube 96px 居中、左右各 27px
  留白、stage 右缩进 24px），菜单 224px Onshape 样式/键盘/外点关闭行为不变。
  **trigger 固定定位（用户最终钉死，不随 cube 朝向/面视图变化）**：
  - 右缘与最右边箭头右缘对齐（`right:-2`）；
  - 上缘与最下面箭头下缘对齐（`bottom:-30`），按钮整体在箭头下方，不再压在
    cube/箭头上；
  - 菜单固定 `right:-2/top:188`，跟随 trigger。
  官方 cube 3D 面投影在 ISO 可达 stage 底部（实测 y≈99..241），固定 trigger
  位置仍保留 2px 安全隙。真栈 e2e 断言右缘/上缘 ≤1px、切 ISO 后按钮坐标不变且
  不与 cube 重合。此前「贴太紧/按钮位置不对/与 ViewCube 重合/偏上/右对齐」
  反馈一并关闭。
- **相机修复**：菜单 ISO/上一视图改 `view.setRotationAboutPoint(r)`（裸
  `setRotation` 在正交视图绕 eye 转，target 被甩到模型外；实测 ISO 后模型消失）。
  官方菜单相机动作走 180ms + 400ms rAF `ViewportComponentEvents.setViewMatrix`
  跟踪，官方 cube 与相机逐帧同步。
- **测试**：web **1380/1380**、tsc/lint 绿；真栈 `e2e/itwin-viewcube.spec.ts`
  **2 passed**（默认官方 + 面点击/箭头 + 菜单项/子菜单/图形首选项）、
  `e2e/ui-parity.spec.ts` **2 passed**（显式 `?viewcube=onshape` 回退自研）、
  `e2e/tutorial2.spec.ts` **2 passed（4.2 min，体积 357.739 cm³/去材 0.422）**
  （演示的罗盘 15° 步进显式回退自研）。Vitest 对官方 AppUI 包 `server.deps.inline`
  以处理其 `.scss` 导入。
- **回滚**：`?viewcube=onshape` 立即回退；删除官方依赖/组件即回到纯自研。
  官方 lazy chunk 仍仅默认路径加载（JS 492 kB/CSS 114 kB，gzip 144/15）。
